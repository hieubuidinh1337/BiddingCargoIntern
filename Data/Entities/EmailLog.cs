using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BiddingCargo.Web.Data;

// Bảng "email_logs"
public class EmailLog
{
    [Key, DatabaseGenerated(DatabaseGeneratedOption.None)] public long Id { get; set; }
    public string? ToAddress { get; set; }
    public string? Type { get; set; }
    public string? Subject { get; set; }
    public string? MessageId { get; set; }
    public bool IsRealSmtp { get; set; }
    public string? PreviewUrl { get; set; }
    public string? SentAt { get; set; }
}
