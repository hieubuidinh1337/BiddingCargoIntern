using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BiddingCargo.Web.Data;

// Bảng "notifications"
public class Notification
{
    [Column("extra_json")] public string? ExtraJson { get; set; }
    [Key, DatabaseGenerated(DatabaseGeneratedOption.None)] public long Id { get; set; }
    public string? TargetAgentCode { get; set; }
    public string? TargetRole { get; set; }
    public string? Title { get; set; }
    public string? Message { get; set; }
    public string? Time { get; set; }
    public string? Type { get; set; } = "INFO";
    public bool Read { get; set; }
    public bool Unread { get; set; } = true;
    public string? Link { get; set; }
}
