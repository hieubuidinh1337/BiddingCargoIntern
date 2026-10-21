using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace BiddingCargo.Web.Services;

public record SendEmailResult(bool Success, bool IsRealSmtp, string? MessageId, string? PreviewUrl, string Recipient, string Subject);

/// <summary>Gửi email qua MailKit. Cấu hình SMTP lấy từ appsettings/biến môi trường, nếu trống thì dùng cấu hình Admin lưu trong DB.</summary>
public class EmailService
{
    private static readonly string[] DummyDomains = { "tsn-logistics.vn", "example.com", "airline.vn", "test.com", "demo.com", "fake.com" };

    private readonly IConfiguration _cfg;
    private readonly SharedDataService _shared;
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<EmailService> _log;

    public EmailService(IConfiguration cfg, SharedDataService shared, AppDbContext db, IWebHostEnvironment env, ILogger<EmailService> log)
    { _cfg = cfg; _shared = shared; _db = db; _env = env; _log = log; }

    public async Task<SendEmailResult> SendAsync(JsonObject req, string baseUrl)
    {
        var type = EntityJson.Str(req, "type") ?? "";
        var reg = req["regData"] as JsonObject;
        var recipient = Util.NullIfEmpty(EntityJson.Str(req, "to")) ?? EntityJson.Str(reg, "email");
        if (string.IsNullOrWhiteSpace(recipient))
            throw new ArgumentException("Thiếu địa chỉ email người nhận (to / regData.email)");
        recipient = recipient.Trim();

        var (subject, html) = EmailTemplates.Build(type, req, recipient, baseUrl);

        var dbSmtp = (await _shared.GetSettingAsync("settings") as JsonObject)?["smtp"] as JsonObject;
        string Pick(string cfgKey, string dbKey, string def = "") =>
            Util.NullIfEmpty(_cfg[cfgKey]) ?? Util.NullIfEmpty(EntityJson.Str(dbSmtp, dbKey)) ?? def;
        var host = Pick("Smtp:Host", "host", "smtp.gmail.com");
        var port = int.TryParse(Pick("Smtp:Port", "port", "465"), out var p) ? p : 465;
        var user = Pick("Smtp:User", "user");
        var pass = Pick("Smtp:Pass", "pass").Replace(" ", "");
        if (pass == SharedDataService.MaskedSecret) pass = "";
        var fromName = Pick("Smtp:FromName", "fromName", "Vietravel Airlines Cargo");
        var fromAddress = user != "" ? user : "ops-cargo@vietravelairlines.vn";

        var msg = new MimeMessage();
        msg.From.Add(new MailboxAddress(fromName, fromAddress));
        msg.To.Add(MailboxAddress.Parse(recipient));
        var cc = EntityJson.Str(req, "notifEmail")?.Trim();
        if (!string.IsNullOrEmpty(cc) && !cc.Equals(recipient, StringComparison.OrdinalIgnoreCase)
            && cc.Contains('@') && cc.Contains('.') && !DummyDomains.Any(d => cc.EndsWith("@" + d, StringComparison.OrdinalIgnoreCase))
            && MailboxAddress.TryParse(cc, out var ccAddr))
            msg.Cc.Add(ccAddr);
        msg.Bcc.Add(new MailboxAddress(fromName, fromAddress));
        msg.Subject = subject;
        msg.Headers.Add("X-Mailer", "VU-Cargo-Bidding/1.0");
        msg.Headers.Add("Precedence", "bulk");
        msg.Headers.Add("List-Unsubscribe", $"<mailto:{fromAddress}?subject=unsubscribe>");
        msg.Headers.Add("X-Auto-Response-Suppress", "OOF, DR, RN, NRN, AutoReply");
        msg.Body = new BodyBuilder { HtmlBody = html, TextBody = EmailTemplates.HtmlToPlainText(html) }.ToMessageBody();

        bool real; string? previewUrl = null;
        if (user != "" && pass != "")
        {
            using var client = new SmtpClient { Timeout = 20000 };
            await client.ConnectAsync(host, port, port == 465 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTlsWhenAvailable);
            await client.AuthenticateAsync(user, pass);
            await client.SendAsync(msg);
            await client.DisconnectAsync(true);
            real = true;
        }
        else
        {
            // Chưa cấu hình SMTP: lưu thư ra thư mục App_Data/outbox để xem thử (thay cho tài khoản Ethereal của bản Node).
            var dir = Path.Combine(_env.ContentRootPath, "App_Data", "outbox");
            Directory.CreateDirectory(dir);
            var file = Path.Combine(dir, $"{DateTime.Now:yyyyMMdd-HHmmss}-{Guid.NewGuid():N}.eml");
            await using (var fs = File.Create(file)) await msg.WriteToAsync(fs);
            _log.LogWarning("SMTP chưa được cấu hình - đã lưu email vào {File}", file);
            real = false; previewUrl = file;
        }

        var messageId = string.IsNullOrEmpty(msg.MessageId) ? Guid.NewGuid().ToString("N") : msg.MessageId;
        _db.EmailLogs.Add(new EmailLog
        {
            Id = Util.NowMs() + Random.Shared.Next(0, 999), ToAddress = recipient, Type = string.IsNullOrEmpty(type) ? "CUSTOM" : type,
            Subject = subject, MessageId = messageId, IsRealSmtp = real, PreviewUrl = previewUrl, SentAt = Util.ViNow()
        });
        // Giữ tối đa 50 log gần nhất
        var old = _db.EmailLogs.OrderByDescending(e => e.Id).Skip(50).ToList();
        _db.EmailLogs.RemoveRange(old);
        await _db.SaveChangesAsync();

        return new SendEmailResult(true, real, messageId, previewUrl, recipient, subject);
    }
}
