using System.Text.Json.Nodes;
using BiddingCargo.Web.Services;
using static BiddingCargo.Web.Endpoints.ApiEndpoints;

namespace BiddingCargo.Web.Endpoints;

/// <summary>Các API đồng bộ dữ liệu, nhật ký hệ thống, thông báo, tải tệp và gửi email.</summary>
public static class DataSyncEndpoints
{
    public static void MapDataSyncEndpoints(this RouteGroupBuilder api, ILogger log)
    {
        // ---- dữ liệu dùng chung (BẢO MẬT & PHÂN QUYỀN)
        api.MapGet("/data", async (HttpContext ctx, SharedDataService svc) =>
        {
            var cookieAdmin = ctx.Request.Cookies["cargo_admin_user"];
            var cookieAgent = ctx.Request.Cookies["cargo_agent_code"];
            var queryAgent = ctx.Request.Query["agentCode"].ToString();
            var queryRole = ctx.Request.Query["role"].ToString();

            string role = "";
            string? agentCode = null;

            if (!string.IsNullOrEmpty(cookieAdmin) || queryRole.Equals("admin", StringComparison.OrdinalIgnoreCase) || queryRole.Equals("staff", StringComparison.OrdinalIgnoreCase))
            {
                role = !string.IsNullOrEmpty(queryRole) ? queryRole : "admin";
                agentCode = !string.IsNullOrEmpty(queryAgent) ? queryAgent : null;
            }
            else
            {
                role = "";
                agentCode = !string.IsNullOrEmpty(queryAgent) ? queryAgent : cookieAgent;
            }

            await svc.MaintenanceAsync();
            var snap = await svc.GetSnapshotAsync(agentCode, role);
            ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return J(snap);
        });

        // Endpoint rất nhẹ để client kiểm tra có dữ liệu mới hay không (phiên mới / tự đóng phiên...)
        api.MapGet("/version", (HttpContext ctx, SharedDataService svc) => Guard(async () =>
        {
            await svc.MaintenanceAsync();
            ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return J(new JsonObject { ["version"] = await svc.GetVersionAsync(), ["dataEpoch"] = await svc.GetEpochAsync() });
        }, log));

        api.MapGet("/epoch", (HttpContext ctx, SharedDataService svc) => Guard(async () =>
        {
            ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return J(new JsonObject { ["dataEpoch"] = await svc.GetEpochAsync() });
        }, log));

        api.MapPost("/data", (HttpContext ctx, SharedDataService svc) => Guard(async () =>
        {
            var body = await BodyAsync(ctx.Request);
            var epoch = await svc.GetEpochAsync();
            var clientEpoch = EntityJson.Str(body, "dataEpoch");
            if (!string.IsNullOrEmpty(clientEpoch) && clientEpoch != epoch)
                return J(new JsonObject { ["success"] = false, ["stale"] = true, ["dataEpoch"] = epoch }, 409);
            var v = await svc.MergeAsync(body);
            return J(new JsonObject { ["success"] = true, ["version"] = v, ["dataEpoch"] = epoch });
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
    }
}

