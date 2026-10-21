using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BiddingCargo.Web.Data;

// Bảng "activity_logs"
public class ActivityLog
{
    [Key, DatabaseGenerated(DatabaseGeneratedOption.None)] public long Id { get; set; }
    public string? Timestamp { get; set; }
    public long RawTime { get; set; }
    public string? Actor { get; set; }
    public string? Username { get; set; }
    public string? Role { get; set; }
    public string? ActionCategory { get; set; }
    public string? ActionTitle { get; set; }
    public string? Target { get; set; }
    public string? Details { get; set; }
    public string? Ip { get; set; }
    public string? Device { get; set; }
}
