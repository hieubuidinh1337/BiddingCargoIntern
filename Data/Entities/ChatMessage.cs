using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BiddingCargo.Web.Data;

// Bảng "chat_messages"
public class ChatMessage
{
    [Key] public string Id { get; set; } = "";
    public string? ChatId { get; set; }
    public string? Sender { get; set; }
    public string? SenderName { get; set; }
    public string? Text { get; set; }
    public string? FileUrl { get; set; }
    public string? FileName { get; set; }
    public string? FileType { get; set; }
    public long Timestamp { get; set; }
    public bool Read { get; set; }
}
