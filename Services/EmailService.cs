using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using MimeKit;

namespace BiddingCargo.Web.Services;

public record SendEmailResult(bool Success, bool IsRealSmtp, string? MessageId, string? PreviewUrl, string Recipient, string Subject);

/// <summary>
/// Dựng nội dung email từ mẫu và gửi ra ngoài qua máy chủ SMTP (nếu đã cấu hình) hoặc ghi log nội bộ.
/// </summary>
public class EmailService
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _cfg;
    private readonly ILogger<EmailService> _logger;

    public EmailService(AppDbContext db, IConfiguration cfg, ILogger<EmailService> logger)
    {
        _db = db;
        _cfg = cfg;
        _logger = logger;
    }

    public async Task<SendEmailResult> SendAsync(JsonObject req, string baseUrl)
    {
        var type = EntityJson.Str(req, "type") ?? "";
        var recipient = Util.NullIfEmpty(EntityJson.Str(req, "to")) ?? EntityJson.Str(req["regData"], "email");
        if (string.IsNullOrWhiteSpace(recipient))
            throw new ArgumentException("Thiếu địa chỉ email người nhận (to / regData.email)");
        recipient = recipient.Trim();

        var (subject, html) = EmailTemplates.Build(type, req, recipient, baseUrl);
        var (isRealSmtp, messageId) = await DeliverAsync(req, recipient, subject, html);

        _db.EmailLogs.Add(new EmailLog
        {
            Id = Util.NowMs() + Random.Shared.Next(0, 999),
            ToAddress = recipient,
            Type = string.IsNullOrEmpty(type) ? "CUSTOM" : type,
            Subject = subject,
            MessageId = messageId,
            IsRealSmtp = isRealSmtp,
            PreviewUrl = null,
            SentAt = Util.ViNow()
        });
        _db.EmailLogs.RemoveRange(_db.EmailLogs.OrderByDescending(e => e.Id).Skip(50).ToList());
        await _db.SaveChangesAsync();
        return new SendEmailResult(true, isRealSmtp, messageId, null, recipient, subject);
    }

    protected virtual async Task<(bool IsRealSmtp, string MessageId)> DeliverAsync(JsonObject req, string to, string subject, string html)
    {
        // 1. Check req["smtp"] if explicitly passed
        var reqSmtp = req["smtp"] as JsonObject;
        var host = EntityJson.Str(reqSmtp, "host");
        var portStr = EntityJson.Str(reqSmtp, "port");
        var user = EntityJson.Str(reqSmtp, "user");
        var pass = EntityJson.Str(reqSmtp, "pass");
        var fromName = EntityJson.Str(reqSmtp, "fromName");

        // 2. Fallback to IConfiguration ("Smtp" section in appsettings.json)
        if (string.IsNullOrWhiteSpace(host)) host = _cfg["Smtp:Host"];
        if (string.IsNullOrWhiteSpace(portStr)) portStr = _cfg["Smtp:Port"];
        if (string.IsNullOrWhiteSpace(user)) user = _cfg["Smtp:User"];
        if (string.IsNullOrWhiteSpace(pass) || pass.Contains("•") || pass.Contains("*")) pass = _cfg["Smtp:Pass"];
        if (string.IsNullOrWhiteSpace(fromName)) fromName = _cfg["Smtp:FromName"] ?? "Vietravel Airlines Cargo";

        // Clean password (remove spaces from Google App Password)
        pass = (pass ?? "").Replace(" ", "").Trim();
        user = (user ?? "").Trim();
        host = (host ?? "").Trim();

        if (!string.IsNullOrEmpty(host) && !string.IsNullOrEmpty(user) && !string.IsNullOrEmpty(pass))
        {
            int port = int.TryParse(portStr, out var p) ? p : 465;
            try
            {
                var message = new MimeMessage();
                message.From.Add(new MailboxAddress(fromName, user));
                message.To.Add(MailboxAddress.Parse(to));
                message.Subject = subject;

                var bodyBuilder = new BodyBuilder { HtmlBody = html };
                message.Body = bodyBuilder.ToMessageBody();

                using var client = new SmtpClient();
                // 465: SSL, 587: StartTLS
                var secureOption = port == 465 ? SecureSocketOptions.SslOnConnect :
                                   port == 587 ? SecureSocketOptions.StartTls :
                                   SecureSocketOptions.Auto;

                await client.ConnectAsync(host, port, secureOption);
                await client.AuthenticateAsync(user, pass);
                await client.SendAsync(message);
                var mid = message.MessageId ?? $"<{Guid.NewGuid():N}@smtp>";
                await client.DisconnectAsync(true);

                _logger.LogInformation("Gửi email thành công qua SMTP ({Host}:{Port}) tới {Recipient}", host, port, to);
                return (true, mid);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi khi gửi email qua SMTP ({Host}:{Port}) tới {Recipient}: {Message}", host, port, to, ex.Message);
                var type = EntityJson.Str(req, "type");
                if (type == "TEST_EMAIL")
                {
                    throw new InvalidOperationException($"Lỗi kết nối máy chủ SMTP ({host}:{port}): {ex.Message}", ex);
                }
                return (false, $"<{Guid.NewGuid():N}@failed>");
            }
        }

        // Sandbox mode if no SMTP credentials provided
        return (false, $"<{Guid.NewGuid():N}@local>");
    }
}
