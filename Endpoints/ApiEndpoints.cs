using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;
using BiddingCargo.Web.Services;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Endpoints;

/// <summary>Toàn bộ REST API của server.js, giữ nguyên đường dẫn và định dạng JSON để client JS dùng lại không cần sửa.</summary>
public static class ApiEndpoints
{
    private static readonly HashSet<string> AllowedUploadExt = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".zip", ".txt", ".csv"
    };

    private static IResult J(JsonNode node, int status = 200) =>
        Results.Content(node.ToJsonString(), "application/json; charset=utf-8", System.Text.Encoding.UTF8, status);

    private static IResult Err(string message, int status = 400) =>
        J(new JsonObject { ["success"] = false, ["error"] = message }, status);

    private static async Task<JsonObject> BodyAsync(HttpRequest req)
    {
        try
        {
            var n = await JsonNode.ParseAsync(req.Body);
            return n as JsonObject ?? new JsonObject();
        }
        catch (System.Text.Json.JsonException) { return new JsonObject(); }
    }

    private static string BaseUrl(HttpContext ctx, IConfiguration cfg) =>
        (Util.NullIfEmpty(cfg["App:PublicBaseUrl"]) ?? $"{ctx.Request.Scheme}://{ctx.Request.Host}").TrimEnd('/');

    private static async Task<IResult> Guard(Func<Task<IResult>> action, ILogger log)
    {
        try { return await action(); }
        catch (ApiException e) { return Err(e.Message, e.Status); }
        catch (ChatException e) { return Err(e.Message, e.Status); }
        catch (BidException e) { return Err(e.Message, 400); }
        catch (ArgumentException e) { return Err(e.Message, 400); }
        catch (Exception e)
        {
            log.LogError(e, "API error");
            return Err(e.Message, 500);
        }
    }

    public static void MapApi(this WebApplication app)
    {
        var api = app.MapGroup("/api");
        var log = app.Logger;

        // ---- xác thực hệ thống (Authentication - Action -> Action Result)
        api.MapPost("/auth/agent-login", async (HttpContext ctx, AppDbContext db) =>
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

            agentNode["failedLoginAttempts"] = 0;
            EntityJson.Apply(agent, agentNode);
            await db.SaveChangesAsync();

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
                    ["email"] = agent.Email,
                    ["phone"] = agent.Phone,
                    ["taxCode"] = agent.TaxCode,
                    ["address"] = EntityJson.Str(agentNode, "address") ?? "",
                    ["status"] = agent.Status
                }
            });
        });

        api.MapPost("/auth/admin-login", async (HttpContext ctx, AppDbContext db) =>
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

        // ---- dữ liệu dùng chung (BẢO MẬT & PHÂN QUYỀN)
        api.MapGet("/data", async (HttpContext ctx, SharedDataService svc) =>
        {
            var cookieAdmin = ctx.Request.Cookies["cargo_admin_user"];
            var cookieAgent = ctx.Request.Cookies["cargo_agent_code"];
            var queryAgent = ctx.Request.Query["agentCode"].ToString();
            var queryRole = ctx.Request.Query["role"].ToString();

            // BẢO MẬT: Chỉ cấp role admin khi CÓ COOKIE cargo_admin_user đã xác thực
            var role = !string.IsNullOrEmpty(cookieAdmin) ? (string.IsNullOrEmpty(queryRole) ? "admin" : queryRole) : "";
            var agentCode = !string.IsNullOrEmpty(queryAgent) ? queryAgent : cookieAgent;

            var snap = await svc.GetSnapshotAsync(agentCode, role);
            ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return J(snap);
        });

        api.MapGet("/epoch", (HttpContext ctx, SharedDataService svc) => Guard(async () =>
        {
            ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return J(new JsonObject { ["dataEpoch"] = await svc.GetEpochAsync() });
        }, log));

        api.MapPost("/data", (HttpContext ctx, SharedDataService svc) => Guard(async () =>
        {
            var body = await BodyAsync(ctx.Request);
            var epoch = await svc.GetEpochAsync();
            if (EntityJson.Str(body, "dataEpoch") != epoch)
                return J(new JsonObject { ["success"] = false, ["stale"] = true, ["dataEpoch"] = epoch }, 409);
            var v = await svc.MergeAsync(body);
            return J(new JsonObject { ["success"] = true, ["version"] = v });
        }, log));

        api.MapPost("/reset", (SharedDataService svc) => Guard(async () =>
        {
            var v = await svc.ResetAsync();
            return J(new JsonObject
            {
                ["success"] = true, ["version"] = v,
                ["message"] = "Đã khôi phục toàn bộ dữ liệu máy chủ về trạng thái mặc định ban đầu thành công!"
            });
        }, log));

        // ---- nhật ký
        api.MapGet("/logs", (HttpContext ctx, LogService logs) => Guard(async () =>
        {
            var list = await logs.QueryAsync(ctx.Request.Query["role"], ctx.Request.Query["category"], ctx.Request.Query["q"]);
            var arr = new JsonArray(); foreach (var l in list) arr.Add(EntityJson.ToNode(l));
            return J(new JsonObject { ["success"] = true, ["logs"] = arr });
        }, log));

        api.MapPost("/logs", (HttpContext ctx, LogService logs) => Guard(async () =>
        {
            var l = await logs.AddFromClientAsync(await BodyAsync(ctx.Request), ctx.Connection.RemoteIpAddress?.ToString());
            return J(new JsonObject { ["success"] = true, ["log"] = EntityJson.ToNode(l) });
        }, log));

        api.MapDelete("/logs", (LogService logs) => Guard(async () =>
        {
            await logs.ClearAsync();
            return J(new JsonObject { ["success"] = true, ["message"] = "Đã xóa toàn bộ nhật ký hoạt động hệ thống." });
        }, log));

        // ---- thông báo
        api.MapPost("/notifications/read", (HttpContext ctx, WonAuctionService svc) => Guard(async () =>
        {
            await svc.MarkNotificationsReadAsync(Ids(await BodyAsync(ctx.Request)));
            return J(new JsonObject { ["success"] = true });
        }, log));

        api.MapPost("/notifications/delete", (HttpContext ctx, WonAuctionService svc) => Guard(async () =>
        {
            await svc.DeleteNotificationsAsync(Ids(await BodyAsync(ctx.Request)));
            return J(new JsonObject { ["success"] = true });
        }, log));

        // ---- đặt thầu / duyệt đại lý
        api.MapPost("/bids/place", (HttpContext ctx, BidService bids) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            var auctionId = EntityJson.Str(b, "auctionId");
            var agentCode = EntityJson.Str(b, "agentCode");
            var price = EntityJson.Lng(b, "priceKg") ?? 0;
            if (string.IsNullOrEmpty(auctionId) || string.IsNullOrEmpty(agentCode) || price == 0)
                return Err("Thiếu auctionId, agentCode hoặc priceKg");
            var bid = await bids.PlaceAsync(new PlaceBidRequest(auctionId, agentCode, EntityJson.Str(b, "agentName"), price,
                EntityJson.Bool(b, "isAnonymous") ?? true, EntityJson.Lng(b, "weightKg") ?? 0, EntityJson.Str(b, "bidId")));
            return J(new JsonObject
            {
                ["success"] = true, ["bid"] = EntityJson.ToNode(bid),
                ["message"] = $"Đặt thầu thành công mức giá {Util.FmtVi(price)}đ / Kg!"
            });
        }, log));

        api.MapPost("/registration/submit", (HttpContext ctx, SharedDataService shared, BiddingCargo.Web.Data.AppDbContext db) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            var regId = EntityJson.Str(b, "regId");
            if (string.IsNullOrWhiteSpace(regId))
            {
                var now = DateTime.Now;
                var count = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.CountAsync(db.Registrations) + 1;
                regId = $"REG-{now:yyyyMMdd}-{count:D2}";
                b["regId"] = regId;
            }

            var r = await db.Registrations.FindAsync(regId);
            if (r == null)
            {
                r = new BiddingCargo.Web.Data.Registration { RegId = regId };
                db.Registrations.Add(r);
            }

            EntityJson.Apply(r, b);
            r.RegId = regId;
            if (string.IsNullOrEmpty(r.Status)) r.Status = "PENDING";
            if (string.IsNullOrEmpty(r.SubmittedAt)) r.SubmittedAt = DateTime.Now.ToString("dd/MM/yyyy HH:mm");

            var comp = r.CompanyName ?? "Đại lý mới";
            var mst = r.TaxCode ?? "";
            var rep = r.RepName ?? "";
            var mail = r.Email ?? "";

            // Thông báo cho ban quản trị nếu chưa có
            var hasNotif = regId != null && await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.AnyAsync(
                db.Notifications, n => n.TargetRole == "ADMIN" && n.Message != null && n.Message.Contains(regId));
            if (!hasNotif)
            {
                var notif = new BiddingCargo.Web.Data.Notification
                {
                    Id = Util.NowMs() + Random.Shared.Next(0, 1000),
                    TargetRole = "ADMIN",
                    Title = $"📋 HỒ SƠ ĐĂNG KÝ MỚI: {comp}",
                    Message = $"Mã hồ sơ {regId} — {comp} (MST: {mst}) vừa nộp hồ sơ đăng ký trở thành đại lý. Người đại diện: {rep} — {mail}. Vui lòng xét duyệt trong vòng 24h làm việc.",
                    Time = "Vừa xong",
                    Type = "REGISTRATION",
                    Read = false,
                    Unread = true,
                    Link = "06-AgentList.html"
                };
                db.Notifications.Add(notif);
            }

            // Ghi nhật ký hệ thống
            db.ActivityLogs.Add(LogService.Make(rep != "" ? rep : comp, mst != "" ? mst : "guest", "AGENT", "Quản lý Đại lý", "Nộp hồ sơ đăng ký đại lý", $"Hồ sơ {regId}",
                $"Đại lý {comp} (MST: {mst}) nộp hồ sơ đăng ký đại lý mới. Người đại diện: {rep} ({mail}).", ctx.Connection.RemoteIpAddress?.ToString(), "Web Portal"));

            await db.SaveChangesAsync();
            SharedDataService.InvalidateSnapshotCache();
            await shared.BumpVersionAsync();

            return J(new JsonObject
            {
                ["success"] = true,
                ["regId"] = regId,
                ["message"] = "Hồ sơ đăng ký đã được gửi thành công đến Ban Điều Hành!",
                ["registration"] = EntityJson.ToNode(r)
            });
        }, log));

        api.MapPost("/registration/approve", (HttpContext ctx, WonAuctionService svc, BiddingCargo.Web.Data.AppDbContext db) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            var regId = EntityJson.Str(b, "regId");
            var desiredCode = EntityJson.Str(b, "agentCode");
            var passedPwd = EntityJson.Str(b, "password");
            var passedPin = EntityJson.Str(b, "pin");

            if (!string.IsNullOrEmpty(regId) && (!string.IsNullOrEmpty(passedPwd) || !string.IsNullOrEmpty(passedPin)))
            {
                var r = await db.Registrations.FindAsync(regId);
                if (r != null)
                {
                    if (!string.IsNullOrEmpty(passedPwd)) EntityJson.SetExtra(r, "password", passedPwd);
                    if (!string.IsNullOrEmpty(passedPin)) EntityJson.SetExtra(r, "pin", passedPin);
                    await db.SaveChangesAsync();
                }
            }

            var code = await svc.ApproveRegistrationAsync(regId, EntityJson.Str(b, "approvedBy"), ctx.Connection.RemoteIpAddress?.ToString(), desiredCode);

            if (!string.IsNullOrEmpty(passedPwd) && !string.IsNullOrEmpty(code))
            {
                var ag = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.FirstOrDefaultAsync(db.Agents, a => a.Code == code);
                if (ag != null && (string.IsNullOrEmpty(ag.Password) || ag.Password == "12345678"))
                {
                    ag.Password = passedPwd;
                    if (!string.IsNullOrEmpty(passedPin)) ag.Pin = passedPin;
                    await db.SaveChangesAsync();
                }
            }

            SharedDataService.InvalidateSnapshotCache();
            return J(new JsonObject
            {
                ["success"] = true, ["agentCode"] = code,
                ["message"] = $"Hồ sơ {regId} đã được duyệt thành công! Mã đại lý cấp: {code}"
            });
        }, log));

        api.MapPost("/registration/reject", (HttpContext ctx, SharedDataService shared, BiddingCargo.Web.Data.AppDbContext db) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            var regId = EntityJson.Str(b, "regId");
            var reason = EntityJson.Str(b, "reason") ?? "Hồ sơ chưa đạt tiêu chuẩn theo quy chế xét duyệt đại lý";
            var rejectedBy = EntityJson.Str(b, "rejectedBy") ?? "Admin";

            if (string.IsNullOrEmpty(regId)) return Err("Thiếu regId");
            var reg = await db.Registrations.FindAsync(regId) ?? throw new ApiException("Hồ sơ đăng ký không tồn tại", 404);

            reg.Status = "REJECTED";
            reg.RejectionReason = reason;

            var nowMs = Util.NowMs();
            var recentLog = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.AnyAsync(db.ActivityLogs,
                l => l.ActionCategory == "Quản lý Đại lý" && (l.Target == regId || (l.Details != null && l.Details.Contains(regId))) && l.RawTime > nowMs - 60000);
            if (!recentLog)
            {
                db.ActivityLogs.Add(LogService.Make(rejectedBy, "admin", "SUPER_ADMIN", "Quản lý Đại lý", "Từ chối hồ sơ Đăng ký", reg.CompanyName ?? regId,
                    $"Từ chối hồ sơ đăng ký đại lý \"{reg.CompanyName}\" ({regId}). Lý do từ chối: \"{reason}\".", ctx.Connection.RemoteIpAddress?.ToString(), "Admin Portal"));
            }

            await db.SaveChangesAsync();
            SharedDataService.InvalidateSnapshotCache();
            await shared.BumpVersionAsync();

            return J(new JsonObject
            {
                ["success"] = true,
                ["message"] = $"Đã từ chối hồ sơ {regId} thành công."
            });
        }, log));

        api.MapPost("/agents/lock", (HttpContext ctx, WonAuctionService svc) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            await svc.SetAgentLockAsync(EntityJson.Str(b, "code"), EntityJson.Bool(b, "locked") ?? false, EntityJson.Str(b, "reason"));
            return J(new JsonObject { ["success"] = true });
        }, log));

        // ---- chat
        var chat = api.MapGroup("/chat");
        chat.MapGet("", (HttpContext ctx, ChatService svc) => Guard(async () =>
            J(new JsonObject { ["success"] = true, ["chats"] = await svc.ListAsync(ctx.Request.Query["agentCode"]) }), log));
        chat.MapPost("/create", (HttpContext ctx, ChatService svc) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            return J(new JsonObject { ["success"] = true, ["chat"] = await svc.CreateAsync(EntityJson.Str(b, "agentCode"), EntityJson.Str(b, "agentName"), EntityJson.Str(b, "text")) });
        }, log));
        chat.MapPost("/send", (HttpContext ctx, ChatService svc) => Guard(async () =>
            J(new JsonObject { ["success"] = true, ["message"] = await svc.SendAsync(await BodyAsync(ctx.Request)) }), log));
        chat.MapPost("/assign", (HttpContext ctx, ChatService svc) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            return J(new JsonObject { ["success"] = true, ["chat"] = await svc.AssignAsync(EntityJson.Str(b, "chatId"), EntityJson.Str(b, "staffId"), EntityJson.Str(b, "staffName")) });
        }, log));
        chat.MapPost("/request-close", (HttpContext ctx, ChatService svc) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            return J(new JsonObject { ["success"] = true, ["chat"] = await svc.RequestCloseAsync(EntityJson.Str(b, "chatId"), EntityJson.Str(b, "closedByName")) });
        }, log));
        chat.MapPost("/respond-close", (HttpContext ctx, ChatService svc) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            return J(new JsonObject { ["success"] = true, ["chat"] = await svc.RespondCloseAsync(EntityJson.Str(b, "chatId"), EntityJson.Str(b, "action"), EntityJson.Str(b, "agentName")) });
        }, log));
        chat.MapPost("/close", (HttpContext ctx, ChatService svc) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            return J(new JsonObject { ["success"] = true, ["chat"] = await svc.CloseAsync(EntityJson.Str(b, "chatId"), EntityJson.Str(b, "closedByName")) });
        }, log));
        chat.MapPost("/read", (HttpContext ctx, ChatService svc) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            await svc.MarkReadAsync(EntityJson.Str(b, "chatId"), EntityJson.Str(b, "readerRole"));
            return J(new JsonObject { ["success"] = true });
        }, log));

        // ---- upload tệp đính kèm chat
        api.MapPost("/upload", (HttpContext ctx, IWebHostEnvironment env) => Guard(async () =>
        {
            if (!ctx.Request.HasFormContentType) return Err("No boundary found");
            var form = await ctx.Request.ReadFormAsync();
            var file = form.Files["file"];
            if (file == null || file.Length == 0) return Err("No file found in request");
            var orig = System.Text.RegularExpressions.Regex.Replace(Path.GetFileName(file.FileName), "[^a-zA-Z0-9._-]", "_");
            if (!AllowedUploadExt.Contains(Path.GetExtension(orig))) return Err("Định dạng tệp không được hỗ trợ", 415);
            var dir = Path.Combine(env.WebRootPath, "uploads");
            Directory.CreateDirectory(dir);
            var unique = $"{Util.NowMs()}_{orig}";
            await using (var fs = File.Create(Path.Combine(dir, unique))) await file.CopyToAsync(fs);
            return J(new JsonObject { ["success"] = true, ["url"] = "/uploads/" + unique, ["name"] = orig });
        }, log)).DisableAntiforgery();

        // ---- email
        api.MapPost("/send-email", (HttpContext ctx, EmailService mail, IConfiguration cfg) => Guard(async () =>
        {
            var r = await mail.SendAsync(await BodyAsync(ctx.Request), BaseUrl(ctx, cfg));
            return J(new JsonObject
            {
                ["success"] = true, ["isRealSmtp"] = r.IsRealSmtp, ["messageId"] = r.MessageId, ["previewUrl"] = r.PreviewUrl,
                ["recipient"] = r.Recipient, ["subject"] = r.Subject
            });
        }, log));

        // ---- hoàn tiền
        api.MapPost("/wonauction/refund-info", (HttpContext ctx, WonAuctionService svc) => Guard(async () =>
        {
            var w = await svc.SubmitRefundInfoAsync(await BodyAsync(ctx.Request), ctx.Connection.RemoteIpAddress?.ToString());
            return J(new JsonObject { ["success"] = true, ["message"] = "Đã ghi nhận thông tin tài khoản nhận tiền hoàn thành công.", ["wonItem"] = EntityJson.ToNode(w) });
        }, log));
        api.MapPost("/wonauction/confirm-refund", (HttpContext ctx, WonAuctionService svc) => Guard(async () =>
        {
            var w = await svc.ConfirmRefundAsync(await BodyAsync(ctx.Request), ctx.Connection.RemoteIpAddress?.ToString());
            return J(new JsonObject
            {
                ["success"] = true, ["wonItem"] = EntityJson.ToNode(w),
                ["message"] = $"Đã xác nhận hoàn tiền cho đơn hàng {w.WonId}. Hệ thống đã gửi thông báo đến đại lý {w.AgentCode}."
            });
        }, log));

        // ---- API chuyên biệt cho Agent Dashboard & Sàn Đấu Giá
        api.MapGet("/agent/dashboard", async (HttpContext ctx, AppDbContext db, SharedDataService shared) =>
        {
            var agentCode = (ctx.Request.Query["agentCode"].ToString() ?? ctx.Request.Cookies["cargo_agent_code"])?.Trim().ToUpperInvariant();
            var fromDate = ctx.Request.Query["fromDate"].ToString();
            var toDate = ctx.Request.Query["toDate"].ToString();

            try { await shared.MaintenanceAsync(); } catch { }

            Agent? agent = null;
            if (!string.IsNullOrEmpty(agentCode))
                agent = await db.Agents.FirstOrDefaultAsync(a => a.Code.ToUpper() == agentCode);
            if (agent == null)
            {
                agent = await db.Agents.OrderBy(a => a.Code).FirstOrDefaultAsync();
                if (agent != null) agentCode = agent.Code;
            }

            var unreadCount = 0;
            if (agent != null)
            {
                unreadCount = await db.Notifications.CountAsync(n => !n.Read &&
                    (n.TargetAgentCode == agent.Code || (n.TargetAgentCode == null && (n.TargetRole == null || n.TargetRole == "AGENT" || n.TargetRole == "agent"))));
            }

            var allAuctions = await db.Auctions.AsNoTracking().ToListAsync();
            var nowMs = Util.NowMs();

            var openList = allAuctions.Where(a =>
            {
                if (a.Status != "OPEN") return false;
                var endMs = Util.ParseIso(a.EndTime)?.ToUnixTimeMilliseconds();
                if (endMs.HasValue && endMs.Value <= nowMs) return false;
                if (!string.IsNullOrEmpty(a.AllowedAgentsJson) && !string.IsNullOrEmpty(agentCode))
                {
                    try
                    {
                        var allowed = System.Text.Json.JsonSerializer.Deserialize<List<string>>(a.AllowedAgentsJson);
                        if (allowed != null && allowed.Count > 0 && !allowed.Contains("ALL", StringComparer.OrdinalIgnoreCase) && !allowed.Contains(agentCode, StringComparer.OrdinalIgnoreCase))
                            return false;
                    } catch { }
                }
                return true;
            }).ToList();

            if (!string.IsNullOrEmpty(fromDate))
            {
                openList = openList.Where(a =>
                {
                    var fStart = a.FlightStartDate ?? (a.EtdIso != null && a.EtdIso.Length >= 10 ? a.EtdIso.Substring(0, 10) : "");
                    var fEnd = a.FlightEndDate ?? fStart;
                    return string.IsNullOrEmpty(fEnd) || string.Compare(fEnd, fromDate, StringComparison.Ordinal) >= 0;
                }).ToList();
            }
            if (!string.IsNullOrEmpty(toDate))
            {
                openList = openList.Where(a =>
                {
                    var fStart = a.FlightStartDate ?? (a.EtdIso != null && a.EtdIso.Length >= 10 ? a.EtdIso.Substring(0, 10) : "");
                    return string.IsNullOrEmpty(fStart) || string.Compare(fStart, toDate, StringComparison.Ordinal) <= 0;
                }).ToList();
            }

            var agentBids = new List<Bid>();
            if (!string.IsNullOrEmpty(agentCode))
            {
                agentBids = await db.Bids.AsNoTracking().Where(b => b.AgentCode != null && b.AgentCode.ToUpper() == agentCode).ToListAsync();
            }
            var bidsByAuction = agentBids.GroupBy(b => b.AuctionId).ToDictionary(g => g.Key, g => g.OrderByDescending(b => b.PriceKg).First());

            var auctionDtos = openList.Select(a =>
            {
                bidsByAuction.TryGetValue(a.Id, out var myBid);
                var isSubmitted = myBid != null;
                var capKg = a.CapacityKg > 0 ? a.CapacityKg : 3500;
                var startPrice = a.StartingPriceKg > 0 ? a.StartingPriceKg : 18000;
                var curPrice = isSubmitted ? myBid!.PriceKg : startPrice;
                return new JsonObject
                {
                    ["id"] = a.Id,
                    ["flightCode"] = a.FlightCode ?? $"VU-{a.Id}",
                    ["flightNumber"] = a.FlightNumber ?? "VU-000",
                    ["route"] = a.Route ?? $"{a.Origin}-{a.Destination}",
                    ["origin"] = a.Origin ?? "SGN",
                    ["destination"] = a.Destination ?? "HAN",
                    ["originName"] = a.OriginName ?? a.Origin ?? "TP. Hồ Chí Minh",
                    ["destName"] = a.DestName ?? a.Destination ?? "Hà Nội",
                    ["flightPeriod"] = a.FlightPeriod,
                    ["etd"] = a.Etd ?? "08:00",
                    ["eta"] = a.Eta ?? "10:15",
                    ["endTime"] = a.EndTime ?? a.CloseDateIso ?? DateTime.UtcNow.AddHours(2).ToString("o"),
                    ["capacityKg"] = capKg,
                    ["startingPriceKg"] = startPrice,
                    ["currentPriceKg"] = a.CurrentPriceKg,
                    ["minStep"] = a.MinStep > 0 ? a.MinStep : 500,
                    ["status"] = a.Status ?? "OPEN",
                    ["isSubmitted"] = isSubmitted,
                    ["myHighestBidPriceKg"] = myBid?.PriceKg,
                    ["totalAmountVnd"] = capKg * curPrice
                };
            }).OrderByDescending(x => EntityJson.Lng(x, "id")).ToList();

            var openIds = openList.Select(a => a.Id).ToHashSet();
            var participatingCount = bidsByAuction.Keys.Count(id => openIds.Contains(id));
            var wonCount = 0;
            if (!string.IsNullOrEmpty(agentCode))
            {
                wonCount = await db.WonAuctions.CountAsync(w => w.AgentCode != null && w.AgentCode.ToUpper() == agentCode);
            }

            var auctionsArr = new JsonArray();
            foreach (var a in auctionDtos) auctionsArr.Add(a);

            ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return J(new JsonObject
            {
                ["success"] = true,
                ["agent"] = new JsonObject
                {
                    ["code"] = agent?.Code ?? "AG-0001",
                    ["name"] = agent?.Name ?? agent?.CompanyName ?? "Đại lý",
                    ["companyName"] = agent?.CompanyName ?? agent?.Name ?? "Đại lý",
                    ["email"] = agent?.Email ?? "",
                    ["phone"] = agent?.Phone ?? "",
                    ["tier"] = "TIER1",
                    ["hasPin"] = !string.IsNullOrEmpty(agent?.Pin),
                    ["unreadNotifCount"] = unreadCount
                },
                ["kpis"] = new JsonObject
                {
                    ["openAuctionsCount"] = auctionDtos.Count,
                    ["participatingCount"] = participatingCount,
                    ["wonAuctionsCount"] = wonCount
                },
                ["auctions"] = auctionsArr
            });
        });

        api.MapGet("/agent/auctions", async (HttpContext ctx, AppDbContext db, SharedDataService shared) =>
        {
            var agentCode = (ctx.Request.Query["agentCode"].ToString() ?? ctx.Request.Cookies["cargo_agent_code"])?.Trim().ToUpperInvariant();
            var route = ctx.Request.Query["route"].ToString();
            var status = ctx.Request.Query["status"].ToString();
            var sort = ctx.Request.Query["sort"].ToString();
            var q = ctx.Request.Query["q"].ToString();
            int.TryParse(ctx.Request.Query["page"], out var page);
            if (page < 1) page = 1;
            int.TryParse(ctx.Request.Query["pageSize"], out var pageSize);
            if (pageSize < 1) pageSize = 12;

            try { await shared.MaintenanceAsync(); } catch { }

            var selectedRoute = string.IsNullOrWhiteSpace(route) ? "ALL" : route.Trim().ToUpperInvariant();
            var selectedStatus = string.IsNullOrWhiteSpace(status) ? "ALL" : status.Trim().ToUpperInvariant();
            var selectedSort = string.IsNullOrWhiteSpace(sort) ? "CLOSING_SOON" : sort.Trim();
            var searchQuery = q?.Trim() ?? "";

            var allAuctions = await db.Auctions.AsNoTracking().ToListAsync();

            var routesArr = new JsonArray();
            var distinctRoutes = allAuctions
                .Where(a => !string.IsNullOrEmpty(a.Origin) && !string.IsNullOrEmpty(a.Destination))
                .Select(a => new { Pair = $"{a.Origin!.Trim().ToUpper()}-{a.Destination!.Trim().ToUpper()}", Origin = a.OriginName ?? a.Origin ?? "", Dest = a.DestName ?? a.Destination ?? "" })
                .GroupBy(r => r.Pair)
                .Select(g => g.First())
                .OrderBy(r => r.Pair);
            foreach (var r in distinctRoutes)
            {
                routesArr.Add(new JsonObject { ["pair"] = r.Pair, ["origin"] = r.Origin, ["dest"] = r.Dest });
            }

            var filtered = allAuctions.Where(a =>
            {
                if (!string.IsNullOrEmpty(a.AllowedAgentsJson) && !string.IsNullOrEmpty(agentCode))
                {
                    try
                    {
                        var allowed = System.Text.Json.JsonSerializer.Deserialize<List<string>>(a.AllowedAgentsJson);
                        if (allowed != null && allowed.Count > 0 && !allowed.Contains("ALL", StringComparer.OrdinalIgnoreCase) && !allowed.Contains(agentCode, StringComparer.OrdinalIgnoreCase))
                            return false;
                    } catch { }
                }
                if (selectedRoute != "ALL")
                {
                    var cleanRoute = (a.Route ?? $"{a.Origin}-{a.Destination}").Replace(" ", "").ToUpperInvariant();
                    var cleanTarget = selectedRoute.Replace(" ", "").ToUpperInvariant();
                    if (cleanRoute != cleanTarget) return false;
                }
                if (selectedStatus != "ALL")
                {
                    if (string.Compare(a.Status, selectedStatus, StringComparison.OrdinalIgnoreCase) != 0) return false;
                }
                if (!string.IsNullOrEmpty(searchQuery))
                {
                    var qLower = searchQuery.ToLowerInvariant();
                    var match = (a.FlightNumber?.ToLowerInvariant().Contains(qLower) ?? false) ||
                                (a.FlightCode?.ToLowerInvariant().Contains(qLower) ?? false) ||
                                (a.Route?.ToLowerInvariant().Contains(qLower) ?? false) ||
                                (a.Origin?.ToLowerInvariant().Contains(qLower) ?? false) ||
                                (a.Destination?.ToLowerInvariant().Contains(qLower) ?? false);
                    if (!match) return false;
                }
                return true;
            }).ToList();

            var agentBids = new List<Bid>();
            if (!string.IsNullOrEmpty(agentCode))
            {
                agentBids = await db.Bids.AsNoTracking().Where(b => b.AgentCode != null && b.AgentCode.ToUpper() == agentCode).ToListAsync();
            }
            var bidsByAuction = agentBids.GroupBy(b => b.AuctionId).ToDictionary(g => g.Key, g => g.OrderByDescending(b => b.PriceKg).First());

            IEnumerable<Auction> sorted = filtered;
            if (selectedSort == "PRICE_HIGH")
                sorted = sorted.OrderByDescending(a => a.CurrentPriceKg > 0 ? a.CurrentPriceKg : a.StartingPriceKg);
            else if (selectedSort == "CAPACITY_HIGH")
                sorted = sorted.OrderByDescending(a => a.CapacityKg);
            else
                sorted = sorted.OrderBy(a => Util.ParseIso(a.EndTime)?.ToUnixTimeMilliseconds() ?? long.MaxValue);

            var sortedList = sorted.ToList();
            var total = sortedList.Count;
            var totalPages = (int)Math.Ceiling((double)total / pageSize);
            if (totalPages < 1) totalPages = 1;
            var paged = sortedList.Skip((page - 1) * pageSize).Take(pageSize).ToList();

            var auctionsArr = new JsonArray();
            foreach (var a in paged)
            {
                bidsByAuction.TryGetValue(a.Id, out var myBid);
                auctionsArr.Add(new JsonObject
                {
                    ["id"] = a.Id,
                    ["flightCode"] = a.FlightCode ?? $"#{a.Id}",
                    ["flightNumber"] = a.FlightNumber ?? "VU-000",
                    ["route"] = a.Route ?? $"{a.Origin}-{a.Destination}",
                    ["origin"] = a.Origin ?? "SGN",
                    ["destination"] = a.Destination ?? "HAN",
                    ["originName"] = a.OriginName ?? a.Origin ?? "",
                    ["destName"] = a.DestName ?? a.Destination ?? "",
                    ["aircraft"] = a.Aircraft ?? "A321F",
                    ["capacityKg"] = a.CapacityKg > 0 ? a.CapacityKg : 3500,
                    ["startingPriceKg"] = a.StartingPriceKg > 0 ? a.StartingPriceKg : 18000,
                    ["currentPriceKg"] = a.CurrentPriceKg > 0 ? a.CurrentPriceKg : a.StartingPriceKg,
                    ["minStep"] = a.MinStep > 0 ? a.MinStep : 500,
                    ["etd"] = a.Etd ?? "08:00",
                    ["eta"] = a.Eta ?? "10:15",
                    ["cutOffTime"] = a.CutOffTime ?? "18:00",
                    ["warehouse"] = EntityJson.GetExtraString(a, "warehouse") ?? "Kho TCS - Tân Sơn Nhất",
                    ["endTime"] = a.EndTime ?? a.CloseDateIso ?? DateTime.UtcNow.AddHours(2).ToString("o"),
                    ["status"] = a.Status ?? "OPEN",
                    ["bidsCount"] = a.BidsCount,
                    ["leadingAgentDisplay"] = "Đại lý ẩn danh (AG-***)",
                    ["flightPeriod"] = a.FlightPeriod,
                    ["myHighestBidPriceKg"] = myBid?.PriceKg,
                    ["isSubmitted"] = myBid != null
                });
            }

            ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return J(new JsonObject
            {
                ["success"] = true,
                ["total"] = total,
                ["page"] = page,
                ["pageSize"] = pageSize,
                ["totalPages"] = totalPages,
                ["routes"] = routesArr,
                ["auctions"] = auctionsArr
            });
        });

        // ---- Agent Notifications
        api.MapGet("/agent/notifications", async (HttpContext ctx, AppDbContext db) =>
        {
            var agentCode = ctx.Request.Query["agentCode"].ToString().Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(agentCode))
            {
                agentCode = ctx.Request.Cookies["cargo_agent_code"]?.Trim().ToUpperInvariant() ?? "";
            }
            var filter = ctx.Request.Query["filter"].ToString().Trim();

            var query = db.Notifications.AsNoTracking().AsQueryable();
            if (!string.IsNullOrEmpty(agentCode))
            {
                query = query.Where(n =>
                    n.TargetAgentCode == null ||
                    n.TargetAgentCode == "" ||
                    n.TargetAgentCode == "ALL" ||
                    n.TargetAgentCode.ToUpper() == agentCode ||
                    n.TargetRole == "AGENT");
            }
            else
            {
                query = query.Where(n => n.TargetAgentCode == null || n.TargetAgentCode == "" || n.TargetAgentCode == "ALL" || n.TargetRole == "AGENT");
            }

            var all = await query.OrderByDescending(n => n.Id).ToListAsync();
            var total = all.Count;
            var unread = all.Count(n => !n.Read);
            var won = all.Count(n => n.Type == "WON");

            var filtered = all;
            if (!string.IsNullOrEmpty(filter) && filter.ToLowerInvariant() == "unread")
            {
                filtered = all.Where(n => !n.Read).ToList();
            }
            else if (!string.IsNullOrEmpty(filter) && filter.ToLowerInvariant() != "all")
            {
                filtered = all.Where(n => string.Equals(n.Type, filter, StringComparison.OrdinalIgnoreCase)).ToList();
            }

            var arr = new JsonArray();
            foreach (var n in filtered)
            {
                arr.Add(new JsonObject
                {
                    ["id"] = n.Id,
                    ["title"] = n.Title ?? "",
                    ["message"] = n.Message ?? "",
                    ["type"] = n.Type ?? "INFO",
                    ["time"] = n.Time ?? "",
                    ["read"] = n.Read,
                    ["targetAgentCode"] = n.TargetAgentCode,
                    ["targetRole"] = n.TargetRole,
                    ["link"] = n.Link
                });
            }

            ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return J(new JsonObject
            {
                ["success"] = true,
                ["total"] = total,
                ["unread"] = unread,
                ["won"] = won,
                ["notifications"] = arr
            });
        });

        // ---- Agent Auction Detail
        api.MapGet("/agent/auction/{id:int}", async (int id, HttpContext ctx, AppDbContext db) =>
        {
            var agentCode = ctx.Request.Query["agentCode"].ToString().Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(agentCode))
            {
                agentCode = ctx.Request.Cookies["cargo_agent_code"]?.Trim().ToUpperInvariant() ?? "";
            }

            var auction = await db.Auctions.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id);
            if (auction == null) return Err("Không tìm thấy phiên đấu giá", 404);

            var bids = await db.Bids.AsNoTracking()
                .Where(b => b.AuctionId == id)
                .OrderByDescending(b => b.PriceKg)
                .ToListAsync();

            var bidsArr = new JsonArray();
            foreach (var b in bids)
            {
                var isMe = !string.IsNullOrEmpty(agentCode) && string.Equals(b.AgentCode, agentCode, StringComparison.OrdinalIgnoreCase);
                bidsArr.Add(new JsonObject
                {
                    ["id"] = b.Id,
                    ["priceKg"] = b.PriceKg,
                    ["weightKg"] = b.WeightKg,
                    ["time"] = b.Time ?? "",
                    ["timestamp"] = b.Timestamp,
                    ["status"] = b.Status ?? "RECEIVED",
                    ["isMe"] = isMe,
                    ["agentCode"] = isMe ? b.AgentCode : "AG-***",
                    ["agentName"] = isMe ? (b.AgentName ?? b.AgentCode) : "Đại lý ẩn danh (AG-***)"
                });
            }

            var myHighestBid = bids.FirstOrDefault(b => !string.IsNullOrEmpty(agentCode) && string.Equals(b.AgentCode, agentCode, StringComparison.OrdinalIgnoreCase));

            ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return J(new JsonObject
            {
                ["success"] = true,
                ["auction"] = new JsonObject
                {
                    ["id"] = auction.Id,
                    ["flightCode"] = auction.FlightCode ?? $"#{auction.Id}",
                    ["flightNumber"] = auction.FlightNumber ?? "VU-000",
                    ["route"] = auction.Route ?? $"{auction.Origin}-{auction.Destination}",
                    ["origin"] = auction.Origin ?? "SGN",
                    ["destination"] = auction.Destination ?? "HAN",
                    ["originName"] = auction.OriginName ?? "",
                    ["destName"] = auction.DestName ?? "",
                    ["aircraft"] = auction.Aircraft ?? "A321F",
                    ["capacityKg"] = auction.CapacityKg > 0 ? auction.CapacityKg : 3500,
                    ["startingPriceKg"] = auction.StartingPriceKg > 0 ? auction.StartingPriceKg : 18000,
                    ["currentPriceKg"] = auction.CurrentPriceKg > 0 ? auction.CurrentPriceKg : auction.StartingPriceKg,
                    ["minStep"] = auction.MinStep > 0 ? auction.MinStep : 500,
                    ["etd"] = auction.Etd ?? "08:00",
                    ["eta"] = auction.Eta ?? "10:15",
                    ["cutOffTime"] = auction.CutOffTime ?? "18:00",
                    ["warehouse"] = EntityJson.GetExtraString(auction, "warehouse") ?? "Kho TCS - Tân Sơn Nhất",
                    ["endTime"] = auction.EndTime ?? auction.CloseDateIso ?? DateTime.UtcNow.AddHours(2).ToString("o"),
                    ["status"] = auction.Status ?? "OPEN",
                    ["bidsCount"] = auction.BidsCount,
                    ["specialNotes"] = auction.SpecialNotes,
                    ["flightPeriod"] = auction.FlightPeriod,
                    ["allowedAgentsJson"] = auction.AllowedAgentsJson,
                    ["myHighestBidPriceKg"] = myHighestBid?.PriceKg,
                    ["isSubmitted"] = myHighestBid != null
                },
                ["bids"] = bidsArr
            });
        });

        // ---- Agent My Bids
        api.MapGet("/agent/my-bids", async (HttpContext ctx, AppDbContext db) =>
        {
            var agentCode = ctx.Request.Query["agentCode"].ToString().Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(agentCode))
            {
                agentCode = ctx.Request.Cookies["cargo_agent_code"]?.Trim().ToUpperInvariant() ?? "";
            }
            if (string.IsNullOrEmpty(agentCode))
            {
                return J(new JsonObject { ["success"] = true, ["bids"] = new JsonArray(), ["total"] = 0 });
            }

            var bids = await db.Bids.AsNoTracking()
                .Where(b => b.AgentCode != null && b.AgentCode.ToUpper() == agentCode)
                .OrderByDescending(b => b.Timestamp)
                .ToListAsync();

            var auctionIds = bids.Select(b => b.AuctionId).Distinct().ToList();
            var auctionList = await db.Auctions.AsNoTracking()
                .Where(a => auctionIds.Contains(a.Id))
                .ToListAsync();
            var auctions = auctionList.GroupBy(a => a.Id).ToDictionary(g => g.Key, g => g.First());

            var wonList = await db.WonAuctions.AsNoTracking()
                .Where(w => w.AgentCode != null && w.AgentCode.ToUpper() == agentCode && w.AuctionId.HasValue)
                .ToListAsync();
            var wons = wonList.GroupBy(w => w.AuctionId!.Value).ToDictionary(g => g.Key, g => g.First());

            var arr = new JsonArray();
            foreach (var b in bids)
            {
                auctions.TryGetValue(b.AuctionId, out var a);
                wons.TryGetValue(b.AuctionId, out var won);

                var status = b.Status ?? "RECEIVED";
                if (won != null) status = "WON";
                else if (a != null && a.Status == "CLOSED") status = "LOST";

                arr.Add(new JsonObject
                {
                    ["bidId"] = b.Id,
                    ["auctionId"] = b.AuctionId,
                    ["flightNumber"] = a?.FlightNumber ?? "VU-000",
                    ["route"] = a?.Route ?? $"{a?.Origin}-{a?.Destination}",
                    ["aircraft"] = a?.Aircraft ?? "A321F",
                    ["capacityKg"] = a?.CapacityKg ?? 3500,
                    ["priceKg"] = b.PriceKg,
                    ["totalAmountVND"] = b.PriceKg * (b.WeightKg > 0 ? b.WeightKg : (a?.CapacityKg ?? 3500)),
                    ["time"] = b.Time ?? "",
                    ["timestamp"] = b.Timestamp,
                    ["auctionStatus"] = a?.Status ?? "OPEN",
                    ["auctionEndTime"] = a?.EndTime ?? "",
                    ["bidStatus"] = status,
                    ["isWon"] = won != null,
                    ["wonId"] = won?.WonId
                });
            }

            ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return J(new JsonObject
            {
                ["success"] = true,
                ["total"] = arr.Count,
                ["bids"] = arr
            });
        });

        // ---- Agent Won Auctions
        api.MapGet("/agent/won-auctions", async (HttpContext ctx, AppDbContext db) =>
        {
            var agentCode = ctx.Request.Query["agentCode"].ToString().Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(agentCode))
            {
                agentCode = ctx.Request.Cookies["cargo_agent_code"]?.Trim().ToUpperInvariant() ?? "";
            }
            if (string.IsNullOrEmpty(agentCode))
            {
                return J(new JsonObject { ["success"] = true, ["wonAuctions"] = new JsonArray(), ["total"] = 0 });
            }

            var wons = await db.WonAuctions.AsNoTracking()
                .Where(w => w.AgentCode != null && w.AgentCode.ToUpper() == agentCode)
                .OrderByDescending(w => w.WonId)
                .ToListAsync();

            var arr = new JsonArray();
            foreach (var w in wons)
            {
                arr.Add(new JsonObject
                {
                    ["wonId"] = w.WonId,
                    ["auctionId"] = w.AuctionId,
                    ["flightNumber"] = w.FlightNumber ?? "VU-000",
                    ["route"] = w.Route ?? "",
                    ["capacityKg"] = w.CapacityKg,
                    ["priceKg"] = w.PriceKg,
                    ["totalAmountVND"] = w.TotalAmountVND,
                    ["paymentDeadline"] = w.PaymentDeadline,
                    ["paymentStatus"] = w.PaymentStatus ?? "UNPAID",
                    ["paidAt"] = w.PaidAt,
                    ["awbNumber"] = w.AwbNumber,
                    ["warehouse"] = w.Warehouse ?? "Kho TCS - Tân Sơn Nhất",
                    ["cutOffTime"] = w.CutOffTime ?? "18:00",
                    ["refundStatus"] = w.RefundStatus ?? "NONE",
                    ["rejectionReason"] = w.RejectionReason
                });
            }

            ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return J(new JsonObject
            {
                ["success"] = true,
                ["total"] = arr.Count,
                ["wonAuctions"] = arr
            });
        });

        // ---- Agent Profile Endpoints
        api.MapGet("/agent/profile", async (HttpContext ctx, AppDbContext db) =>
        {
            var agentCode = ctx.Request.Query["agentCode"].ToString().Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(agentCode))
            {
                agentCode = ctx.Request.Cookies["cargo_agent_code"]?.Trim().ToUpperInvariant() ?? "";
            }
            if (string.IsNullOrEmpty(agentCode)) return Err("Chưa đăng nhập đại lý", 401);

            var agent = await db.Agents.AsNoTracking().FirstOrDefaultAsync(a => a.Code.ToUpper() == agentCode);
            if (agent == null) return Err("Không tìm thấy thông tin đại lý", 404);

            return J(new JsonObject
            {
                ["success"] = true,
                ["agent"] = new JsonObject
                {
                    ["code"] = agent.Code,
                    ["name"] = agent.Name ?? "",
                    ["companyName"] = agent.CompanyName ?? agent.Name ?? "",
                    ["taxCode"] = agent.TaxCode ?? "",
                    ["email"] = agent.Email ?? "",
                    ["phone"] = agent.Phone ?? "",
                    ["status"] = agent.Status ?? "Hoạt động",
                    ["isLocked"] = agent.IsLocked,
                    ["hasPin"] = !string.IsNullOrEmpty(agent.Pin)
                }
            });
        });

        api.MapPost("/agent/profile/update", (HttpContext ctx, AppDbContext db) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            var code = (EntityJson.Str(b, "code") ?? ctx.Request.Cookies["cargo_agent_code"] ?? "").Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(code)) return Err("Thiếu mã đại lý");

            var agent = await db.Agents.FirstOrDefaultAsync(a => a.Code.ToUpper() == code);
            if (agent == null) return Err("Không tìm thấy đại lý", 404);

            var companyName = EntityJson.Str(b, "companyName");
            var taxCode = EntityJson.Str(b, "taxCode");
            var email = EntityJson.Str(b, "email");
            var phone = EntityJson.Str(b, "phone");

            if (!string.IsNullOrEmpty(companyName)) agent.CompanyName = companyName;
            if (!string.IsNullOrEmpty(taxCode)) agent.TaxCode = taxCode;
            if (!string.IsNullOrEmpty(email)) agent.Email = email;
            if (!string.IsNullOrEmpty(phone)) agent.Phone = phone;

            await db.SaveChangesAsync();
            SharedDataService.InvalidateSnapshotCache();

            return J(new JsonObject { ["success"] = true, ["message"] = "Cập nhật thông tin đại lý thành công!" });
        }, log));

        api.MapPost("/agent/profile/change-pin", (HttpContext ctx, AppDbContext db) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            var code = (EntityJson.Str(b, "code") ?? ctx.Request.Cookies["cargo_agent_code"] ?? "").Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(code)) return Err("Thiếu mã đại lý");

            var agent = await db.Agents.FirstOrDefaultAsync(a => a.Code.ToUpper() == code);
            if (agent == null) return Err("Không tìm thấy đại lý", 404);

            var oldPin = EntityJson.Str(b, "oldPin") ?? "";
            var newPin = EntityJson.Str(b, "newPin") ?? "";

            if (!string.IsNullOrEmpty(agent.Pin) && agent.Pin != oldPin)
            {
                return Err("Mã PIN hiện tại không chính xác!");
            }
            if (string.IsNullOrEmpty(newPin) || newPin.Length < 4)
            {
                return Err("Mã PIN mới phải có ít nhất 4 chữ số!");
            }

            agent.Pin = newPin;
            await db.SaveChangesAsync();
            SharedDataService.InvalidateSnapshotCache();

            return J(new JsonObject { ["success"] = true, ["message"] = "Đổi mã PIN bảo mật thành công!" });
        }, log));

        api.MapPost("/agent/profile/change-password", (HttpContext ctx, AppDbContext db) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            var code = (EntityJson.Str(b, "code") ?? ctx.Request.Cookies["cargo_agent_code"] ?? "").Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(code)) return Err("Thiếu mã đại lý");

            var agent = await db.Agents.FirstOrDefaultAsync(a => a.Code.ToUpper() == code);
            if (agent == null) return Err("Không tìm thấy đại lý", 404);

            var oldPass = EntityJson.Str(b, "oldPassword") ?? "";
            var newPass = EntityJson.Str(b, "newPassword") ?? "";

            if (!string.IsNullOrEmpty(agent.Password) && agent.Password != oldPass)
            {
                return Err("Mật khẩu hiện tại không chính xác!");
            }
            if (string.IsNullOrEmpty(newPass) || newPass.Length < 6)
            {
                return Err("Mật khẩu mới phải có ít nhất 6 ký tự!");
            }

            agent.Password = newPass;
            await db.SaveChangesAsync();
            SharedDataService.InvalidateSnapshotCache();

            return J(new JsonObject { ["success"] = true, ["message"] = "Đổi mật khẩu thành công!" });
        }, log));

        // ---- Admin Dashboard KPI Endpoint
        api.MapGet("/admin/dashboard", async (HttpContext ctx, AppDbContext db) =>
        {
            var totalAuctions = await db.Auctions.CountAsync();
            var activeAuctions = await db.Auctions.CountAsync(a => a.Status == "OPEN");
            var totalBids = await db.Bids.CountAsync();
            var totalAgents = await db.Agents.CountAsync(a => !a.IsLocked && a.Status != "Đã khóa");

            var paidWons = await db.WonAuctions.AsNoTracking().Where(w => w.PaymentStatus == "PAID").ToListAsync();
            var totalRevenue = paidWons.Sum(w => w.TotalAmountVND);

            var recentAuctions = await db.Auctions.AsNoTracking()
                .OrderByDescending(a => a.Id)
                .Take(5)
                .ToListAsync();

            var recentBids = await db.Bids.AsNoTracking()
                .OrderByDescending(b => b.Timestamp)
                .Take(6)
                .ToListAsync();

            var recentAuctionsArr = new JsonArray();
            foreach (var a in recentAuctions)
            {
                recentAuctionsArr.Add(new JsonObject
                {
                    ["id"] = a.Id,
                    ["flightNumber"] = a.FlightNumber ?? "VU-000",
                    ["route"] = a.Route ?? $"{a.Origin}-{a.Destination}",
                    ["status"] = a.Status ?? "OPEN",
                    ["currentPriceKg"] = a.CurrentPriceKg > 0 ? a.CurrentPriceKg : a.StartingPriceKg,
                    ["bidsCount"] = a.BidsCount,
                    ["endTime"] = a.EndTime ?? ""
                });
            }

            var recentBidsArr = new JsonArray();
            foreach (var b in recentBids)
            {
                recentBidsArr.Add(new JsonObject
                {
                    ["id"] = b.Id,
                    ["auctionId"] = b.AuctionId,
                    ["agentCode"] = b.AgentCode ?? "AG-***",
                    ["priceKg"] = b.PriceKg,
                    ["time"] = b.Time ?? "",
                    ["status"] = b.Status ?? "RECEIVED"
                });
            }

            ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return J(new JsonObject
            {
                ["success"] = true,
                ["stats"] = new JsonObject
                {
                    ["totalAuctions"] = totalAuctions,
                    ["activeAuctions"] = activeAuctions,
                    ["totalBids"] = totalBids,
                    ["totalAgents"] = totalAgents,
                    ["totalRevenue"] = totalRevenue
                },
                ["recentAuctions"] = recentAuctionsArr,
                ["recentBids"] = recentBidsArr
            });
        });
    }

    private static IEnumerable<string> Ids(JsonObject body) =>
        (body["ids"] as JsonArray)?.Select(EntityJson.NodeStr).Where(x => !string.IsNullOrEmpty(x)).Select(x => x!) ?? Enumerable.Empty<string>();
}
