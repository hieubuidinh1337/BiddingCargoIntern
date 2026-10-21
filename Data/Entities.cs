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

// Bảng "users"
public class AppUser
{
    [Key] public string Id { get; set; } = "";
    public string? Username { get; set; }
    public string? AgentCode { get; set; }
    public string? Password { get; set; }
    public string? Pin { get; set; }
    public string? Role { get; set; }
    public string? FullName { get; set; }
    public string? Email { get; set; }
    public string? CompanyName { get; set; }
    public string? Status { get; set; } = "ACTIVE";
}

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
    public string? MomoOrderId { get; set; }
    public string? MomoRequestId { get; set; }
    public string? MomoOrderInfo { get; set; }
    public string? MomoPayUrl { get; set; }
    public string? MomoQrCodeUrl { get; set; }
    public string? MomoDeeplink { get; set; }
    public string? MomoTransId { get; set; }
    public string? MomoPaidAt { get; set; }
    public string? MomoCreatedAt { get; set; }
    public string? MomoExpiresAt { get; set; }
    public string? RefundStatus { get; set; } = "NONE";
    [Column("refundBankInfo_json")] public string? RefundBankInfoJson { get; set; }
    public string? RefundConfirmedAt { get; set; }
    public string? RefundConfirmedBy { get; set; }
    public string? RefundNote { get; set; }
    [Column("paymentProof_json")] public string? PaymentProofJson { get; set; }
    public string? RejectionReason { get; set; }
}

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

// Bảng "settings" (key/value, value là JSON)
public class Setting
{
    [Key] public string Key { get; set; } = "";
    public string? Value { get; set; }
}

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
