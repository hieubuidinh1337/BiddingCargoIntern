using System.Text.Json.Nodes;
using BiddingCargo.Web.Services;

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

        // ---- dữ liệu dùng chung
        api.MapGet("/data", async (HttpContext ctx, SharedDataService svc) =>
        {
            var snap = await svc.GetSnapshotAsync(ctx.Request.Query["agentCode"], ctx.Request.Query["role"]);
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
    }

    private static IEnumerable<string> Ids(JsonObject body) =>
        (body["ids"] as JsonArray)?.Select(EntityJson.NodeStr).Where(x => !string.IsNullOrEmpty(x)).Select(x => x!) ?? Enumerable.Empty<string>();
}
