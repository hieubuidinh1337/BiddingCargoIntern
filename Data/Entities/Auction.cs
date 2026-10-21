using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BiddingCargo.Web.Data;

// Bảng "auctions"
public class Auction
{
    [Column("extra_json")] public string? ExtraJson { get; set; }
    [Key, DatabaseGenerated(DatabaseGeneratedOption.None)] public int Id { get; set; }
    public string? FlightCode { get; set; }
    public string? FlightNumber { get; set; }
    public string? Route { get; set; }
    public string? Origin { get; set; }
    public string? Destination { get; set; }
    public string? OriginName { get; set; }
    public string? DestName { get; set; }
    public string? Etd { get; set; }
    public string? Eta { get; set; }
    public string? EtdIso { get; set; }
    public string? Aircraft { get; set; }
    public long CapacityKg { get; set; }
    public long StartingPriceKg { get; set; }
    public long CurrentPriceKg { get; set; }
    public long MinStep { get; set; }
    public string? EndTime { get; set; }
    public string? Status { get; set; } = "OPEN";
    public string? LeadingAgentCode { get; set; }
    public string? LeadingAgentName { get; set; }
    public int BidsCount { get; set; }
    public string? WinnerAgentCode { get; set; }
    public string? WinnerAgentName { get; set; }
    public long WinningPriceKg { get; set; }
    public string? SpecialNotes { get; set; }
    public string? CutOffTime { get; set; }
    public string? ClosedAt { get; set; }
    // Trường giao diện cần nhưng không có cột riêng trong schema gốc
    [NotMapped] public bool? IsAnonymous { get; set; }
}
