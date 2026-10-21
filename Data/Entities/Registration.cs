using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BiddingCargo.Web.Data;

// Bảng "registrations"
public class Registration
{
    [Column("extra_json")] public string? ExtraJson { get; set; }
    [Key] public string RegId { get; set; } = "";
    public string? CompanyName { get; set; }
    public string? TaxCode { get; set; }
    public string? Address { get; set; }
    public string? Field { get; set; }
    public string? RepName { get; set; }
    public string? RepPosition { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Documents { get; set; }   // JSON array dạng chuỗi
    public string? Status { get; set; } = "PENDING";
    public string? SubmittedAt { get; set; }
    public string? RejectionReason { get; set; }
    public string? AgentCode { get; set; }
    public string? ApprovedAt { get; set; }
}
