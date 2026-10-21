using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BiddingCargo.Web.Data;

// Bảng "agents"
public class Agent
{
    [Column("extra_json")] public string? ExtraJson { get; set; }
    [Key] public string Code { get; set; } = "";
    public string? Name { get; set; }
    public string? CompanyName { get; set; }
    public string? TaxCode { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Status { get; set; } = "Hoạt động";
    public bool IsLocked { get; set; }
    public string? LockedReason { get; set; }
    public string? LockedAt { get; set; }
    public string? UnlockedAt { get; set; }
    public string? Password { get; set; }
    public string? Pin { get; set; }
}
