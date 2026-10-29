using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;
using BiddingCargo.Web.Services;
using Microsoft.EntityFrameworkCore;
using static BiddingCargo.Web.Endpoints.ApiEndpoints;

namespace BiddingCargo.Web.Endpoints;

/// <summary>Các API xác thực tài khoản Đại lý và Quản trị viên.</summary>
public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this RouteGroupBuilder api)
    {
        api.MapPost("/auth/agent-login", async (HttpContext ctx, AppDbContext db, LogService logs) =>
        {
            var body = await BodyAsync(ctx.Request);
            var id = (EntityJson.Str(body, "identifier") ?? EntityJson.Str(body, "code") ?? "").Trim();
            var pwd = (EntityJson.Str(body, "password") ?? EntityJson.Str(body, "pin") ?? "").Trim();
            var mode = (EntityJson.Str(body, "loginMode") ?? "password").Trim().ToLowerInvariant();

            if (string.IsNullOrEmpty(id))
                return J(new JsonObject { ["success"] = false, ["message"] = "Vui lòng nhập Mã đại lý, Email hoặc Mã số thuế." }, 400);
            if (string.IsNullOrEmpty(pwd))
                return J(new JsonObject { ["success"] = false, ["message"] = "Vui lòng nhập Mật khẩu hoặc Mã PIN." }, 400);

            var idUpper = id.ToUpperInvariant();
            var idLower = id.ToLowerInvariant();

            var agent = await db.Agents.FirstOrDefaultAsync(a =>
                (a.Code != null && a.Code.ToUpper() == idUpper) ||
                (a.Email != null && a.Email.ToLower() == idLower) ||
                (a.TaxCode != null && a.TaxCode.Trim() == id));

            if (agent == null)
            {
                var reg = await db.Registrations.AsNoTracking().FirstOrDefaultAsync(r =>
                    (r.RegId != null && r.RegId.ToUpper() == idUpper) ||
                    (r.Email != null && r.Email.ToLower() == idLower) ||
                    (r.TaxCode != null && r.TaxCode.Trim() == id));

                if (reg != null)
                {
                    if (reg.Status == "REJECTED")
                    {
                        return J(new JsonObject
                        {
                            ["success"] = false,
                            ["isRejected"] = true,
                            ["regId"] = reg.RegId,
                            ["rejectionReason"] = reg.RejectionReason ?? "Hồ sơ chưa đạt tiêu chuẩn theo quy chế xét duyệt đại lý.",
                            ["message"] = $"Hồ sơ đăng ký ({reg.RegId}) của Quý công ty đã bị TỪ CHỐI / CẦN BỔ SUNG."
                        });
                    }
                    if (reg.Status == "PENDING")
                    {
                        return J(new JsonObject
                        {
                            ["success"] = false,
                            ["isPending"] = true,
                            ["regId"] = reg.RegId,
                            ["message"] = $"Hồ sơ đăng ký ({reg.RegId}) đang được Ban Điều hành xét duyệt (trong vòng 24h làm việc)."
                        });
                    }
                }

                return J(new JsonObject { ["success"] = false, ["message"] = $"Mã đại lý hoặc Email \"{id}\" không tồn tại trong hệ thống." });
            }

            if (agent.IsLocked || agent.Status == "Đã khóa" || agent.Status == "LOCKED")
            {
                var masked = agent.Email ?? "";
                if (!string.IsNullOrEmpty(masked) && masked.Contains('@'))
                {
                    var parts = masked.Split('@');
                    var u = parts[0];
                    masked = (u.Length > 2 ? u.Substring(0, 2) + new string('*', u.Length - 2) : u + "***") + "@" + parts[1];
                }

                return J(new JsonObject
                {
                    ["success"] = false,
                    ["isLocked"] = true,
                    ["lockReason"] = agent.LockedReason ?? "LOCKED",
                    ["agentCode"] = agent.Code,
                    ["email"] = agent.Email,
                    ["maskedEmail"] = masked,
                    ["message"] = agent.LockedReason == "FAILED_LOGIN_ATTEMPTS"
                        ? $"Tài khoản {agent.Code} đang bị TẠM KHÓA do nhập sai mật khẩu quá 5 lần liên tiếp. Vui lòng kiểm tra email ({masked}) để mở khóa."
                        : $"Tài khoản {agent.Code} đã bị KHÓA bởi Ban Điều hành."
                });
            }

            var expectedPwd = string.IsNullOrEmpty(agent.Password) ? "12345678" : agent.Password;
            var expectedPin = string.IsNullOrEmpty(agent.Pin) ? "1234" : agent.Pin;
            var agentNode = EntityJson.ToNode(agent);
            var failedAttempts = (int)(EntityJson.Lng(agentNode, "failedLoginAttempts") ?? 0);

            bool isMatch = mode == "pin" ? pwd == expectedPin : (pwd == expectedPwd || pwd == expectedPin);

            if (!isMatch)
            {
                failedAttempts++;
                agentNode["failedLoginAttempts"] = failedAttempts;
                if (failedAttempts >= 5)
                {
                    agent.IsLocked = true;
                    agent.Status = "Đã khóa";
                    agent.LockedReason = "FAILED_LOGIN_ATTEMPTS";
                    agent.LockedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
                    EntityJson.Apply(agent, agentNode);
                    await db.SaveChangesAsync();

                    return J(new JsonObject
                    {
                        ["success"] = false,
                        ["isLocked"] = true,
                        ["lockReason"] = "FAILED_LOGIN_ATTEMPTS",
                        ["agentCode"] = agent.Code,
                        ["message"] = $"Tài khoản {agent.Code} đã bị TẠM KHÓA do nhập sai mật khẩu 5 lần liên tiếp."
                    });
                }

                EntityJson.Apply(agent, agentNode);
                await db.SaveChangesAsync();
                var remaining = 5 - failedAttempts;
                return J(new JsonObject
                {
                    ["success"] = false,
                    ["message"] = $"Mật khẩu hoặc mã PIN không chính xác! Bạn còn {remaining} lần thử trước khi tài khoản bị tạm khóa."
                });
            }

            var needSave = failedAttempts > 0;
            agentNode["failedLoginAttempts"] = 0;

            var agentReg = await db.Registrations.AsNoTracking().FirstOrDefaultAsync(r =>
                (r.AgentCode != null && r.AgentCode.ToUpper() == agent.Code.ToUpper()) ||
                (r.TaxCode != null && agent.TaxCode != null && r.TaxCode.Trim() == agent.TaxCode.Trim()) ||
                (r.Email != null && agent.Email != null && r.Email.ToLower() == agent.Email.ToLower()));

            var repName = EntityJson.Str(agentNode, "repName")
                ?? EntityJson.Str(agentNode, "fullName")
                ?? agentReg?.RepName
                ?? agent.Name
                ?? "";

            var position = EntityJson.Str(agentNode, "position")
                ?? EntityJson.Str(agentNode, "repPosition")
                ?? agentReg?.RepPosition
                ?? "Đại diện ủy quyền";

            var address = EntityJson.Str(agentNode, "address")
                ?? agentReg?.Address
                ?? "";

            var province = EntityJson.Str(agentNode, "province")
                ?? "TP. Hồ Chí Minh";

            var joinedDate = EntityJson.Str(agentNode, "joinedDate")
                ?? agent.UnlockedAt
                ?? "15/03/2024";

            JsonNode? docsNode = null;
            if (agentNode.TryGetPropertyValue("documents", out var dn) && dn != null)
            {
                docsNode = dn.DeepClone();
            }
            else if (!string.IsNullOrEmpty(agentReg?.Documents))
            {
                try { docsNode = JsonNode.Parse(agentReg.Documents); } catch { }
            }
            if (docsNode is JsonArray rawDocsArr)
            {
                for (int i = 0; i < rawDocsArr.Count; i++)
                {
                    if (rawDocsArr[i] is JsonObject docObj &&
                        docObj["dataUrl"]?.GetValue<string>() is { Length: > 2000 })
                    {
                        docObj["dataUrl"] = null;
                        docObj["hasServerFile"] = true;
                        docObj["docIndex"] = i;
                        if (agentReg != null) docObj["regId"] = agentReg.RegId;
                    }
                }
            }
            docsNode ??= new JsonArray();

            if (string.IsNullOrEmpty(EntityJson.Str(agentNode, "repName")) && !string.IsNullOrEmpty(repName))
            {
                agentNode["repName"] = repName;
                needSave = true;
            }
            if (string.IsNullOrEmpty(EntityJson.Str(agentNode, "fullName")) && !string.IsNullOrEmpty(repName))
            {
                agentNode["fullName"] = repName;
                needSave = true;
            }
            if (string.IsNullOrEmpty(EntityJson.Str(agentNode, "position")) && !string.IsNullOrEmpty(position))
            {
                agentNode["position"] = position;
                needSave = true;
            }
            if (string.IsNullOrEmpty(EntityJson.Str(agentNode, "address")) && !string.IsNullOrEmpty(address))
            {
                agentNode["address"] = address;
                needSave = true;
            }
            if (string.IsNullOrEmpty(EntityJson.Str(agentNode, "province")))
            {
                agentNode["province"] = province;
                needSave = true;
            }
            if (!agentNode.ContainsKey("documents") && docsNode is JsonArray da && da.Count > 0)
            {
                agentNode["documents"] = docsNode.DeepClone();
                needSave = true;
            }

            if (needSave)
            {
                EntityJson.Apply(agent, agentNode);
                await db.SaveChangesAsync();
            }

            var agentDisplay = !string.IsNullOrEmpty(agent.CompanyName) ? agent.CompanyName : (agent.Name ?? agent.Code ?? "Đại lý");
            await logs.AddOrUpdateAsync(new ActivityLog
            {
                Id = Util.NowMs() + Random.Shared.Next(0, 1000),
                Timestamp = Util.LogTimestamp(DateTime.Now),
                RawTime = Util.NowMs(),
                Actor = agentDisplay,
                Username = agent.Code ?? "agent",
                Role = "AGENT",
                ActionCategory = "Đăng nhập",
                ActionTitle = "Đăng nhập Cổng Đại lý",
                Target = "Portal Đại lý",
                Details = $"Đại lý {agent.Code} ({agentDisplay}) đăng nhập thành công vào sàn đấu giá.",
                Ip = ctx.Connection.RemoteIpAddress?.ToString() ?? "113.161.42.12",
                Device = "Web App"
            });

            ctx.Response.Cookies.Append("cargo_agent_code", agent.Code ?? "", new CookieOptions
            {
                Path = "/",
                MaxAge = TimeSpan.FromDays(30),
                SameSite = SameSiteMode.Lax,
                HttpOnly = false
            });

            return J(new JsonObject
            {
                ["success"] = true,
                ["agent"] = new JsonObject
                {
                    ["code"] = agent.Code,
                    ["name"] = agent.Name,
                    ["companyName"] = agent.CompanyName ?? agent.Name,
                    ["repName"] = repName,
                    ["fullName"] = repName,
                    ["position"] = position,
                    ["email"] = agent.Email,
                    ["phone"] = agent.Phone,
                    ["taxCode"] = agent.TaxCode,
                    ["address"] = address,
                    ["province"] = province,
                    ["joinedDate"] = joinedDate,
                    ["documents"] = docsNode,
                    ["status"] = agent.Status
                }
            });
        });

        api.MapPost("/auth/admin-login", async (HttpContext ctx, AppDbContext db, LogService logs) =>
        {
            var body = await BodyAsync(ctx.Request);
            var user = (EntityJson.Str(body, "username") ?? "").Trim();
            var pass = (EntityJson.Str(body, "password") ?? "").Trim();

            if (string.IsNullOrEmpty(user) || string.IsNullOrEmpty(pass))
                return J(new JsonObject { ["success"] = false, ["message"] = "Vui lòng nhập Tên đăng nhập và Mật khẩu quản trị." }, 400);

            var dbUser = await db.Users.AsNoTracking().FirstOrDefaultAsync(u =>
                (u.Username != null && u.Username.ToLower() == user.ToLower()) ||
                (u.Email != null && u.Email.ToLower() == user.ToLower()));

            if (dbUser == null && string.Equals(user, "admin", StringComparison.OrdinalIgnoreCase))
            {
                if (pass == "admin2026")
                {
                    ctx.Response.Cookies.Append("cargo_admin_user", "admin", new CookieOptions
                    {
                        Path = "/",
                        MaxAge = TimeSpan.FromDays(7),
                        SameSite = SameSiteMode.Lax,
                        HttpOnly = false
                    });

                    await logs.AddOrUpdateAsync(LogService.Make(
                        "Trần Quản Trị (Super Admin)", "admin", "SUPER_ADMIN",
                        "Đăng nhập", "Đăng nhập hệ thống Quản trị", "Portal Quản trị",
                        "Quản trị viên Trần Quản Trị (Super Admin) (@admin) đăng nhập thành công vào hệ thống Quản trị nội bộ.",
                        ctx.Connection.RemoteIpAddress?.ToString(), "Web App"
                    ));

                    return J(new JsonObject
                    {
                        ["success"] = true,
                        ["admin"] = new JsonObject
                        {
                            ["id"] = 99,
                            ["username"] = "admin",
                            ["fullName"] = "Trần Quản Trị (Super Admin)",
                            ["role"] = "SUPER_ADMIN",
                            ["roles"] = new JsonArray { "SUPER_ADMIN" },
                            ["email"] = "admin@vietravelairlines.vn"
                        }
                    });
                }
            }

            if (dbUser == null)
                return J(new JsonObject { ["success"] = false, ["message"] = $"Tài khoản quản trị \"{user}\" không tồn tại." });

            var expectedPwd = string.IsNullOrEmpty(dbUser.Password) ? "admin2026" : dbUser.Password;
            if (pass != expectedPwd)
                return J(new JsonObject { ["success"] = false, ["message"] = "Mật khẩu quản trị không chính xác!" });

            ctx.Response.Cookies.Append("cargo_admin_user", dbUser.Username ?? "admin", new CookieOptions
            {
                Path = "/",
                MaxAge = TimeSpan.FromDays(7),
                SameSite = SameSiteMode.Lax,
                HttpOnly = false
            });

            var adminFullName = dbUser.FullName ?? dbUser.Username ?? "Quản trị viên";
            var adminUsername = dbUser.Username ?? "admin";
            var adminRole = dbUser.Role ?? "SUPER_ADMIN";
            await logs.AddOrUpdateAsync(LogService.Make(
                adminFullName, adminUsername, adminRole,
                "Đăng nhập", "Đăng nhập hệ thống Quản trị", "Portal Quản trị",
                $"Tài khoản {adminFullName} (@{adminUsername}) đăng nhập thành công vào hệ thống Quản trị nội bộ.",
                ctx.Connection.RemoteIpAddress?.ToString(), "Web App"
            ));

            return J(new JsonObject
            {
                ["success"] = true,
                ["admin"] = new JsonObject
                {
                    ["id"] = dbUser.Id,
                    ["username"] = dbUser.Username,
                    ["fullName"] = dbUser.FullName ?? dbUser.Username,
                    ["role"] = dbUser.Role ?? "SUPER_ADMIN",
                    ["roles"] = new JsonArray { dbUser.Role ?? "SUPER_ADMIN" },
                    ["email"] = dbUser.Email
                }
            });
        });

        api.MapPost("/auth/logout", (HttpContext ctx) =>
        {
            ctx.Response.Cookies.Delete("cargo_agent_code");
            ctx.Response.Cookies.Delete("cargo_admin_user");
            return J(new JsonObject { ["success"] = true });
        });
    }
}

