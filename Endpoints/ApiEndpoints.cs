using System.Text.Json.Nodes;
using BiddingCargo.Web.Services;

namespace BiddingCargo.Web.Endpoints;

/// <summary>Điểm đăng ký tập trung và các hàm tiện ích dùng chung cho toàn bộ REST API trên nền tảng ASP.NET Core.</summary>
public static class ApiEndpoints
{
    internal static readonly HashSet<string> AllowedUploadExt = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".zip", ".txt", ".csv"
    };

    internal static IResult J(JsonNode node, int status = 200) =>
        Results.Content(node.ToJsonString(), "application/json; charset=utf-8", System.Text.Encoding.UTF8, status);

    internal static IResult Err(string message, int status = 400) =>
        J(new JsonObject { ["success"] = false, ["error"] = message }, status);

    internal static async Task<JsonObject> BodyAsync(HttpRequest req)
    {
        try
        {
            var n = await JsonNode.ParseAsync(req.Body);
            return n as JsonObject ?? new JsonObject();
        }
        catch (System.Text.Json.JsonException) { return new JsonObject(); }
    }

    internal static string BaseUrl(HttpContext ctx, IConfiguration cfg) =>
        (Util.NullIfEmpty(cfg["App:PublicBaseUrl"]) ?? $"{ctx.Request.Scheme}://{ctx.Request.Host}").TrimEnd('/');

    internal static async Task<IResult> Guard(Func<Task<IResult>> action, ILogger log)
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

    internal static IEnumerable<string> Ids(JsonObject body) =>
        (body["ids"] as JsonArray)?.Select(EntityJson.NodeStr).Where(x => !string.IsNullOrEmpty(x)).Select(x => x!) ?? Enumerable.Empty<string>();

    public static void MapApi(this WebApplication app)
    {
        var api = app.MapGroup("/api");
        var log = app.Logger;

        api.MapAuthEndpoints();
        api.MapDataSyncEndpoints(log);
        api.MapRegistrationEndpoints(log);
        api.MapChatEndpoints(log);
        api.MapAgentPortalEndpoints(log);
        api.MapAdminPortalEndpoints(log);
    }
}
