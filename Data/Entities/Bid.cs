using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BiddingCargo.Web.Data;

// Bảng "bids"
public class Bid
{
    [Column("extra_json")] public string? ExtraJson { get; set; }
    [Key] public string Id { get; set; } = "";
    public long Timestamp { get; set; }
    public int AuctionId { get; set; }
    public string? AgentCode { get; set; }
    public string? AgentName { get; set; }
    public bool IsAnonymous { get; set; } = true;
    public long PriceKg { get; set; }
    public string? Time { get; set; }
    public string? Status { get; set; } = "OUTBID";
    public long WeightKg { get; set; }
}
