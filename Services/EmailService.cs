using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;

namespace BiddingCargo.Web.Services;

public record SendEmailResult(bool Success, bool IsRealSmtp, string? MessageId, string? PreviewUrl, string Recipient, string Subject);

/// <summary>
/// Dựng nội dung email từ mẫu và ghi vào bảng email_logs. KHÔNG gửi ra bên ngoài (không kết nối SMTP).
/// Muốn gửi thật, hiện thực hàm <see cref="DeliverAsync"/> bằng dịch vụ mail của đơn vị.
/// </summary>
public class EmailService
{
    private readonly AppDbContext _db;
    public EmailService(AppDbContext db) { _db = db; }

    public async Task<SendEmailResult> SendAsync(JsonObject req, string baseUrl)
    {
        var type = EntityJson.Str(req, "type") ?? "";
        var recipient = Util.NullIfEmpty(EntityJson.Str(req, "to")) ?? EntityJson.Str(req["regData"], "email");
        if (string.IsNullOrWhiteSpace(recipient))
            throw new ArgumentException("Thiếu địa chỉ email người nhận (to / regData.email)");
        recipient = recipient.Trim();

        var (subject, html) = EmailTemplates.Build(type, req, recipient, baseUrl);
        var messageId = $"<{Guid.NewGuid():N}@local>";
        await DeliverAsync(recipient, subject, html);

        _db.EmailLogs.Add(new EmailLog
        {
            Id = Util.NowMs() + Random.Shared.Next(0, 999), ToAddress = recipient, Type = string.IsNullOrEmpty(type) ? "CUSTOM" : type,
            Subject = subject, MessageId = messageId, IsRealSmtp = false, PreviewUrl = null, SentAt = Util.ViNow()
        });
        _db.EmailLogs.RemoveRange(_db.EmailLogs.OrderByDescending(e => e.Id).Skip(50).ToList());
        await _db.SaveChangesAsync();
        return new SendEmailResult(true, false, messageId, null, recipient, subject);
    }

    /// <summary>Điểm mở rộng: hiện không làm gì (không có kết nối ra ngoài).</summary>
    protected virtual Task DeliverAsync(string to, string subject, string html) => Task.CompletedTask;
}
