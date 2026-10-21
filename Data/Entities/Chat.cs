using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BiddingCargo.Web.Data;

// Bảng "chats"
public class Chat
{
    [Column("extra_json")] public string? ExtraJson { get; set; }
    [Key] public string Id { get; set; } = "";
    public string? AgentCode { get; set; }
    public string? AgentName { get; set; }
    public string? Status { get; set; } = "OPEN";
    public string? CreatedAt { get; set; }
    public string? ClosedAt { get; set; }
    public string? AssignedTo { get; set; }
    public string? AssignedName { get; set; }
}
