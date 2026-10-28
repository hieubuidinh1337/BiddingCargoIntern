using System.Text.Json.Nodes;
using BiddingCargo.Web.Services;
using static BiddingCargo.Web.Endpoints.ApiEndpoints;

namespace BiddingCargo.Web.Endpoints;

/// <summary>Các API hỗ trợ trực tuyến (Live Chat) giữa Đại lý và Ban Điều hành.</summary>
public static class ChatEndpoints
{
    public static void MapChatEndpoints(this RouteGroupBuilder api, ILogger log)
    {
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
    }
}

