using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Services;

public class ChatException : Exception
{
    public int Status { get; }
    public ChatException(string message, int status = 400) : base(message) { Status = status; }
}

/// <summary>Các thao tác chat hỗ trợ realtime (polling): tạo / gửi / nhận / yêu cầu đóng / đóng / đã đọc.</summary>
public class ChatService
{
    private readonly AppDbContext _db;
    private readonly SharedDataService _shared;
    public ChatService(AppDbContext db, SharedDataService shared) { _db = db; _shared = shared; }

    public async Task<JsonObject> ToNodeAsync(Chat c)
    {
        var node = EntityJson.ToNode(c);
        var arr = new JsonArray();
        foreach (var m in await _db.ChatMessages.Where(m => m.ChatId == c.Id).OrderBy(m => m.Timestamp).ToListAsync())
            arr.Add(EntityJson.ToNode(m));
        node["messages"] = arr;
        return node;
    }

    public async Task<JsonArray> ListAsync(string? agentCode)
    {
        await _shared.CleanupClosedChatsAsync();
        await _db.SaveChangesAsync();
        var q = _db.Chats.AsQueryable();
        if (!string.IsNullOrEmpty(agentCode)) q = q.Where(c => c.AgentCode == agentCode);
        var result = new JsonArray();
        foreach (var c in await q.OrderByDescending(c => c.CreatedAt).ToListAsync()) result.Add(await ToNodeAsync(c));
        return result;
    }

    private static ChatMessage Msg(string chatId, string idSuffix, string sender, string senderName, string? text, long ts,
        string? fileUrl = null, string? fileName = null, string? fileType = null) => new()
    {
        Id = $"MSG-{ts}-{idSuffix}", ChatId = chatId, Sender = sender, SenderName = senderName, Text = text,
        FileUrl = fileUrl, FileName = fileName, FileType = fileType, Timestamp = ts, Read = false
    };

    private async Task<Chat> FindAsync(string? chatId)
    {
        if (string.IsNullOrEmpty(chatId)) throw new ChatException("Thiếu chatId");
        return await _db.Chats.FindAsync(chatId) ?? throw new ChatException("Không tìm thấy phiên chat", 404);
    }

    private async Task SaveAsync()
    {
        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();
    }

    public async Task<JsonObject> CreateAsync(string? agentCode, string? agentName, string? text)
    {
        if (string.IsNullOrEmpty(agentCode) || string.IsNullOrEmpty(text)) throw new ChatException("Thiếu agentCode hoặc text");
        var existing = await _db.Chats.FirstOrDefaultAsync(c => c.AgentCode == agentCode && c.Status != "CLOSED");
        if (existing != null) return await ToNodeAsync(existing);

        var now = Util.NowMs();
        var chat = new Chat
        {
            Id = "CHAT-" + now, AgentCode = agentCode, AgentName = agentName ?? agentCode, Status = "WAITING",
            CreatedAt = Util.ToIso(DateTimeOffset.FromUnixTimeMilliseconds(now))
        };
        _db.Chats.Add(chat);
        _db.ChatMessages.Add(Msg(chat.Id, "0", "agent", agentName ?? agentCode, text, now));
        _db.ChatMessages.Add(Msg(chat.Id, "sys", "system", "Hệ thống",
            "Yêu cầu hỗ trợ đã được gửi. Nhân viên sẽ phản hồi sớm nhất có thể. Vui lòng chờ trong giây lát...", now + 1));
        await SaveAsync();
        return await ToNodeAsync(chat);
    }

    public async Task<JsonObject> SendAsync(JsonObject body)
    {
        var chatId = EntityJson.Str(body, "chatId");
        var sender = EntityJson.Str(body, "sender");
        var text = EntityJson.Str(body, "text");
        var fileUrl = EntityJson.Str(body, "fileUrl");
        if (string.IsNullOrEmpty(chatId) || string.IsNullOrEmpty(sender) || (string.IsNullOrEmpty(text) && string.IsNullOrEmpty(fileUrl)))
            throw new ChatException("Thiếu chatId, sender hoặc nội dung tin nhắn");
        var chat = await FindAsync(chatId);
        if (chat.Status == "CLOSED") throw new ChatException("Phiên chat đã đóng");

        var now = Util.NowMs();
        var m = Msg(chatId, Random.Shared.Next(0, 9999).ToString(), sender, Util.NullIfEmpty(EntityJson.Str(body, "senderName")) ?? sender,
            Util.NullIfEmpty(text), now, Util.NullIfEmpty(fileUrl), Util.NullIfEmpty(EntityJson.Str(body, "fileName")),
            Util.NullIfEmpty(EntityJson.Str(body, "fileType")));
        _db.ChatMessages.Add(m);
        await SaveAsync();
        return EntityJson.ToNode(m);
    }

    public async Task<JsonObject> AssignAsync(string? chatId, string? staffId, string? staffName)
    {
        if (string.IsNullOrEmpty(chatId) || string.IsNullOrEmpty(staffId)) throw new ChatException("Thiếu chatId hoặc staffId");
        var chat = await FindAsync(chatId);
        chat.Status = "ACTIVE"; chat.AssignedTo = staffId; chat.AssignedName = Util.NullIfEmpty(staffName) ?? staffId;
        _db.ChatMessages.Add(Msg(chat.Id, "assign", "system", "Hệ thống",
            $"{chat.AssignedName} đã tham gia cuộc trò chuyện và sẵn sàng hỗ trợ bạn.", Util.NowMs()));
        await SaveAsync();
        return await ToNodeAsync(chat);
    }

    public async Task<JsonObject> RequestCloseAsync(string? chatId, string? closedByName)
    {
        var chat = await FindAsync(chatId);
        chat.Status = "CLOSING_REQUEST";
        _db.ChatMessages.Add(Msg(chat.Id, "reqclose", "system", "Hệ thống",
            $"🔔 {Util.NullIfEmpty(closedByName) ?? "Nhân viên hỗ trợ"} đã gửi yêu cầu kết thúc cuộc trò chuyện. Đang chờ đại lý phản hồi xác nhận...", Util.NowMs()));
        await SaveAsync();
        return await ToNodeAsync(chat);
    }

    public async Task<JsonObject> RespondCloseAsync(string? chatId, string? action, string? agentName)
    {
        var chat = await FindAsync(chatId);
        var now = Util.NowMs();
        var who = Util.NullIfEmpty(agentName) ?? Util.NullIfEmpty(chat.AgentName) ?? "Đại lý";
        if (action == "keep")
        {
            chat.Status = "ACTIVE";
            _db.ChatMessages.Add(Msg(chat.Id, "keep", "system", "Hệ thống", $"💬 Đại lý ({who}) muốn tiếp tục trao đổi thêm thông tin.", now));
        }
        else
        {
            chat.Status = "CLOSED";
            chat.ClosedAt = Util.ToIso(DateTimeOffset.FromUnixTimeMilliseconds(now));
            _db.ChatMessages.Add(Msg(chat.Id, "close", "system", "Hệ thống", $"✅ Cuộc trò chuyện đã kết thúc theo xác nhận từ Đại lý ({who}). Cảm ơn bạn!", now));
        }
        await SaveAsync();
        return await ToNodeAsync(chat);
    }

    public async Task<JsonObject> CloseAsync(string? chatId, string? closedByName)
    {
        var chat = await FindAsync(chatId);
        var now = Util.NowMs();
        chat.Status = "CLOSED";
        chat.ClosedAt = Util.ToIso(DateTimeOffset.FromUnixTimeMilliseconds(now));
        _db.ChatMessages.Add(Msg(chat.Id, "close", "system", "Hệ thống",
            $"Cuộc trò chuyện đã được {Util.NullIfEmpty(closedByName) ?? "nhân viên hỗ trợ"} kết thúc. Cảm ơn bạn đã liên hệ!", now));
        await SaveAsync();
        return await ToNodeAsync(chat);
    }

    public async Task MarkReadAsync(string? chatId, string? readerRole)
    {
        if (string.IsNullOrEmpty(chatId)) throw new ChatException("Thiếu chatId");
        var other = readerRole == "agent" ? new[] { "admin", "staff" } : new[] { "agent" };
        var msgs = await _db.ChatMessages.Where(m => m.ChatId == chatId && !m.Read).ToListAsync();
        var any = false;
        foreach (var m in msgs.Where(m => m.Sender != null && other.Contains(m.Sender))) { m.Read = true; any = true; }
        if (any) await SaveAsync();
    }
}
