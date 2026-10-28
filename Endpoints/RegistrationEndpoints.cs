using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;
using BiddingCargo.Web.Services;
using Microsoft.EntityFrameworkCore;
using static BiddingCargo.Web.Endpoints.ApiEndpoints;

namespace BiddingCargo.Web.Endpoints;

/// <summary>Các API đăng ký hồ sơ đại lý, phê duyệt/từ chối và khóa/mở khóa tài khoản đại lý.</summary>
public static class RegistrationEndpoints
{
    public static void MapRegistrationEndpoints(this RouteGroupBuilder api, ILogger log)
    {
        api.MapGet("/registration/doc", async (HttpContext ctx, AppDbContext db) =>
        {
            var adminCookie = ctx.Request.Cookies["cargo_admin_user"];
            var agentCookie = ctx.Request.Cookies["cargo_agent_code"];
            if (string.IsNullOrEmpty(adminCookie) && string.IsNullOrEmpty(agentCookie))
                return J(new JsonObject { ["success"] = false, ["message"] = "Không có quyền truy cập" }, 403);

            var regId = ctx.Request.Query["regId"].ToString();
            var agentCode = ctx.Request.Query["agentCode"].ToString();
            int.TryParse(ctx.Request.Query["idx"], out var idx);

            Registration? r = null;
            if (!string.IsNullOrEmpty(regId))
            {
                r = await db.Registrations.AsNoTracking().FirstOrDefaultAsync(x => x.RegId == regId);
            }
            if (r == null && !string.IsNullOrEmpty(agentCode))
            {
                r = await db.Registrations.AsNoTracking().FirstOrDefaultAsync(x => x.AgentCode != null && x.AgentCode.ToUpper() == agentCode.ToUpper());
            }
            if (r == null && !string.IsNullOrEmpty(agentCookie))
            {
                r = await db.Registrations.AsNoTracking().FirstOrDefaultAsync(x => x.AgentCode != null && x.AgentCode.ToUpper() == agentCookie.ToUpper());
            }

            if (r == null || string.IsNullOrEmpty(r.Documents))
                return J(new JsonObject { ["success"] = false, ["message"] = "Không tìm thấy hồ sơ" }, 404);
            try
            {
                if (JsonNode.Parse(r.Documents) is JsonArray arr && idx >= 0 && idx < arr.Count && arr[idx] != null)
                    return J(new JsonObject { ["success"] = true, ["doc"] = arr[idx]!.DeepClone() });
            }
            catch { }
            return J(new JsonObject { ["success"] = false, ["message"] = "Không tìm thấy tệp" }, 404);
        });

        api.MapPost("/registration/submit", (HttpContext ctx, SharedDataService shared, AppDbContext db) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            var regId = EntityJson.Str(b, "regId");
            if (string.IsNullOrWhiteSpace(regId))
            {
                var now = DateTime.Now;
                var count = await db.Registrations.CountAsync() + 1;
                regId = $"REG-{now:yyyyMMdd}-{count:D2}";
                b["regId"] = regId;
            }

            var r = await db.Registrations.FindAsync(regId);
            if (r == null)
            {
                r = new Registration { RegId = regId };
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

            var hasNotif = regId != null && await db.Notifications.AnyAsync(
                n => n.TargetRole == "ADMIN" && n.Message != null && n.Message.Contains(regId));
            if (!hasNotif)
            {
                var notif = new Notification
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

            db.ActivityLogs.Add(LogService.Make(rep != "" ? rep : comp, mst != "" ? mst : "guest", "AGENT", "Quản lý Đại lý", "Nộp hồ sơ đăng ký đại lý", $"Hồ sơ {regId}",
                $"Đại lý {comp} (MST: {mst}) nộp hồ sơ đăng ký đại lý mới. Người đại diện: {rep} ({mail}).", ctx.Connection.RemoteIpAddress?.ToString(), "Web Portal"));

            await shared.BumpVersionAsync();
            await db.SaveChangesAsync();
            SharedDataService.InvalidateSnapshotCache();

            return J(new JsonObject
            {
                ["success"] = true,
                ["regId"] = regId,
                ["message"] = "Hồ sơ đăng ký đã được gửi thành công đến Ban Điều Hành!",
                ["registration"] = EntityJson.ToNode(r)
            });
        }, log));

        api.MapPost("/registration/approve", (HttpContext ctx, WonAuctionService svc, AppDbContext db) => Guard(async () =>
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
                var ag = await db.Agents.FirstOrDefaultAsync(a => a.Code == code);
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

        api.MapPost("/registration/reject", (HttpContext ctx, SharedDataService shared, AppDbContext db) => Guard(async () =>
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
            var recentLog = await db.ActivityLogs.AnyAsync(
                l => l.ActionCategory == "Quản lý Đại lý" && (l.Target == regId || (l.Details != null && l.Details.Contains(regId))) && l.RawTime > nowMs - 60000);
            if (!recentLog)
            {
                db.ActivityLogs.Add(LogService.Make(rejectedBy, "admin", "SUPER_ADMIN", "Quản lý Đại lý", "Từ chối hồ sơ Đăng ký", reg.CompanyName ?? regId,
                    $"Từ chối hồ sơ đăng ký đại lý \"{reg.CompanyName}\" ({regId}). Lý do từ chối: \"{reason}\".", ctx.Connection.RemoteIpAddress?.ToString(), "Admin Portal"));
            }

            await shared.BumpVersionAsync();
            await db.SaveChangesAsync();
            SharedDataService.InvalidateSnapshotCache();

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

        api.MapPost("/security/request-otp", (HttpContext ctx, RegistrationSecurityService svc) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            return J(await svc.RequestPasswordResetOtpAsync(EntityJson.Str(b, "identifier") ?? EntityJson.Str(b, "email"), ctx.Connection.RemoteIpAddress?.ToString()));
        }, log));

        api.MapPost("/security/reset-password-otp", (HttpContext ctx, RegistrationSecurityService svc) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            return J(await svc.ResetPasswordWithOtpAsync(EntityJson.Str(b, "identifier"), EntityJson.Str(b, "otp"), EntityJson.Str(b, "newPassword"), ctx.Connection.RemoteIpAddress?.ToString()));
        }, log));

        api.MapPost("/security/unlock-account", (HttpContext ctx, RegistrationSecurityService svc) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            return J(await svc.UnlockAgentAccountAsync(EntityJson.Str(b, "agentCode") ?? EntityJson.Str(b, "identifier"), EntityJson.Str(b, "otp") ?? EntityJson.Str(b, "token"), ctx.Connection.RemoteIpAddress?.ToString()));
        }, log));
    }
}

