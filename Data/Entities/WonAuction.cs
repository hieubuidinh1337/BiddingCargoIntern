using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BiddingCargo.Web.Data;

// Bảng "won_auctions"
public class WonAuction
{
    [Column("extra_json")] public string? ExtraJson { get; set; }
    [Key] public string WonId { get; set; } = "";
    public int? AuctionId { get; set; }
    public string? AgentCode { get; set; }
    public string? FlightNumber { get; set; }
    public string? Route { get; set; }
    public long CapacityKg { get; set; }
    public long PriceKg { get; set; }
    public long TotalAmountVND { get; set; }
    public string? PaymentDeadline { get; set; }
    public string? PaymentStatus { get; set; } = "UNPAID";
    public string? PaidAt { get; set; }
    public string? AwbNumber { get; set; }
    public string? CutOffTime { get; set; }
    public string? Warehouse { get; set; }
    [Column("cargo_declaration_json")] public string? CargoDeclarationJson { get; set; }
    public bool LockWaivedByAdmin { get; set; }
    public bool LockPenaltyHandled { get; set; }
    public string? RefundStatus { get; set; } = "NONE";
    [Column("refundBankInfo_json")] public string? RefundBankInfoJson { get; set; }
    public string? RefundConfirmedAt { get; set; }
    public string? RefundConfirmedBy { get; set; }
    public string? RefundNote { get; set; }
    [Column("paymentProof_json")] public string? PaymentProofJson { get; set; }
    public string? RejectionReason { get; set; }
}
