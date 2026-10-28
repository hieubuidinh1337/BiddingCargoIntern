using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Services;

/// <summary>
/// Dịch vụ C# xử lý Chốt phiên đấu giá, Thẩm định kết quả, Đôn đại lý kế tiếp, Đối soát thanh toán VietQR
/// và Khai báo vận đơn AWB (thay thế store-settlement-payments.js).
/// </summary>
public class SettlementPaymentService
{
    private readonly AppDbContext _db;
    private readonly SharedDataService _shared;

    public SettlementPaymentService(AppDbContext db, SharedDataService shared)
    {
        _db = db;
        _shared = shared;
    }

    public async Task<JsonObject> CloseAuctionAsync(int auctionId, string? closedBy, string? ip)
    {
        var auction = await _db.Auctions.FindAsync(auctionId)
            ?? throw new ApiException("Không tìm thấy phiên đấu giá.", 404);

        var bids = await _db.Bids.Where(b => b.AuctionId == auctionId)
            .OrderByDescending(b => b.PriceKg)
            .ThenBy(b => b.Timestamp)
            .ToListAsync();

        var nowIso = DateTime.UtcNow.ToString("o");
        auction.Status = "CLOSED";
        auction.ClosedAt = nowIso;

        if (bids.Count > 0)
        {
            var top = bids[0];
            top.Status = "WON";
            auction.WinnerAgentCode = top.AgentCode;
            auction.WinnerAgentName = top.AgentName;
            auction.WinningPriceKg = top.PriceKg;
            auction.CurrentPriceKg = top.PriceKg;
            auction.BidsCount = bids.Count;
        }
        else
        {
            auction.WinnerAgentCode = null;
            auction.WinnerAgentName = null;
            auction.WinningPriceKg = 0;
            auction.BidsCount = 0;
        }

        _db.ActivityLogs.Add(LogService.Make(
            closedBy ?? "Admin", "admin", "ADMIN",
            "Phiên đấu giá", "Chốt đóng phiên đấu giá", auction.FlightNumber ?? $"#{auctionId}",
            $"Chốt đóng phiên đấu giá chuyến bay {auction.FlightNumber} ({auction.Route}). Người dẫn đầu: {auction.WinnerAgentCode ?? "Không có"}.",
            ip, "Admin Portal"));

        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();
        SharedDataService.InvalidateSnapshotCache();

        return new JsonObject
        {
            ["success"] = true,
            ["auction"] = EntityJson.ToNode(auction),
            ["message"] = $"Đã chốt phiên đấu giá chuyến bay {auction.FlightNumber} thành công!"
        };
    }

    public async Task<JsonObject> ConfirmPaymentAsync(string? wonId, string? confirmedBy, string? ip)
    {
        if (string.IsNullOrEmpty(wonId)) throw new ApiException("Thiếu mã đơn thắng thầu (wonId).");
        var won = await _db.WonAuctions.FindAsync(wonId)
            ?? throw new ApiException($"Không tìm thấy đơn thắng thầu {wonId}.", 404);

        won.PaymentStatus = "PAID";
        won.PaidAt = Util.ViNow();
        if (string.IsNullOrEmpty(won.AwbNumber))
        {
            won.AwbNumber = $"998-{Random.Shared.Next(10000000, 99999999)}";
        }

        _db.Notifications.Add(new Notification
        {
            Id = Util.NowMs() + Random.Shared.Next(1, 500),
            TargetAgentCode = won.AgentCode,
            TargetRole = "AGENT",
            Title = $"✅ XÁC NHẬN THANH TOÁN THÀNH CÔNG: Đơn {won.WonId}",
            Message = $"Ban Điều hành đã xác nhận thanh toán cho đơn thắng thầu {won.WonId} (Chuyến {won.FlightNumber}). Số vận đơn AWB: {won.AwbNumber}.",
            Time = "Vừa xong",
            Type = "PAYMENT_CONFIRMED",
            Read = false,
            Unread = true,
            Link = "07-WonAuction.html"
        });

        _db.ActivityLogs.Add(LogService.Make(
            confirmedBy ?? "Admin", "admin", "ADMIN",
            "Thanh toán", "Xác nhận thanh toán đơn thầu", won.WonId,
            $"Xác nhận đã nhận đủ thanh toán cho đơn {won.WonId} (Đại lý {won.AgentCode}, chuyến {won.FlightNumber}). Cấp AWB: {won.AwbNumber}.",
            ip, "Admin Portal"));

        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();
        SharedDataService.InvalidateSnapshotCache();

        return new JsonObject
        {
            ["success"] = true,
            ["wonItem"] = EntityJson.ToNode(won),
            ["message"] = $"Đã xác nhận thanh toán thành công cho đơn {won.WonId}!"
        };
    }

    public async Task<JsonObject> RejectPaymentAsync(string? wonId, string? reason, string? rejectedBy, string? ip)
    {
        if (string.IsNullOrEmpty(wonId)) throw new ApiException("Thiếu mã đơn thắng thầu (wonId).");
        var won = await _db.WonAuctions.FindAsync(wonId)
            ?? throw new ApiException($"Không tìm thấy đơn thắng thầu {wonId}.", 404);

        var cleanReason = string.IsNullOrWhiteSpace(reason) ? "Chưa nhận được khoản chuyển khoản tương ứng trên sao kê ngân hàng." : reason.Trim();
        won.PaymentStatus = "UNPAID";
        won.RejectionReason = cleanReason;

        _db.Notifications.Add(new Notification
        {
            Id = Util.NowMs() + Random.Shared.Next(1, 500),
            TargetAgentCode = won.AgentCode,
            TargetRole = "AGENT",
            Title = $"⚠️ TỪ CHỐI XÁC NHẬN THANH TOÁN: Đơn {won.WonId}",
            Message = $"Yêu cầu xác nhận chuyển khoản cho đơn {won.WonId} bị từ chối. Lý do: \"{cleanReason}\". Vui lòng kiểm tra và thực hiện lại.",
            Time = "Vừa xong",
            Type = "WARNING",
            Read = false,
            Unread = true,
            Link = "07-WonAuction.html"
        });

        _db.ActivityLogs.Add(LogService.Make(
            rejectedBy ?? "Admin", "admin", "ADMIN",
            "Thanh toán", "Từ chối xác nhận thanh toán", won.WonId,
            $"Từ chối xác nhận thanh toán đơn {won.WonId} (Đại lý {won.AgentCode}). Lý do: \"{cleanReason}\".",
            ip, "Admin Portal"));

        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();
        SharedDataService.InvalidateSnapshotCache();

        return new JsonObject
        {
            ["success"] = true,
            ["wonItem"] = EntityJson.ToNode(won),
            ["message"] = $"Đã từ chối xác nhận thanh toán đơn {won.WonId}."
        };
    }

    public async Task<JsonObject> SubmitPaymentTransferAsync(string? wonId, JsonObject body, string? ip)
    {
        if (string.IsNullOrEmpty(wonId)) throw new ApiException("Thiếu mã đơn thắng thầu (wonId).");
        var won = await _db.WonAuctions.FindAsync(wonId)
            ?? throw new ApiException($"Không tìm thấy đơn thắng thầu {wonId}.", 404);

        won.PaymentStatus = "PENDING_VERIFICATION";
        EntityJson.SetExtra(won, "paymentProof", body["paymentProof"] ?? body);

        _db.Notifications.Add(new Notification
        {
            Id = Util.NowMs() + Random.Shared.Next(1, 500),
            TargetRole = "ADMIN",
            Title = $"💳 ĐẠI LÝ BÁO CHUYỂN KHOẢN: Đơn {won.WonId}",
            Message = $"Đại lý {won.AgentCode} vừa báo đã chuyển khoản thanh toán cho đơn {won.WonId} (Chuyến {won.FlightNumber}). Vui lòng đối soát sao kê ngân hàng.",
            Time = "Vừa xong",
            Type = "PAYMENT",
            Read = false,
            Unread = true,
            Link = $"03-AuctionList.html?tab=won&search={won.WonId}&reconcile={won.WonId}"
        });

        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();
        SharedDataService.InvalidateSnapshotCache();

        return new JsonObject
        {
            ["success"] = true,
            ["wonItem"] = EntityJson.ToNode(won),
            ["message"] = "Đã gửi thông báo xác nhận chuyển khoản đến Ban Điều hành!"
        };
    }

    public async Task<JsonObject> UpdateCargoDeclarationAsync(string? wonId, JsonObject cargoData, string? ip)
    {
        if (string.IsNullOrEmpty(wonId)) throw new ApiException("Thiếu mã đơn thắng thầu (wonId).");
        var won = await _db.WonAuctions.FindAsync(wonId)
            ?? throw new ApiException($"Không tìm thấy đơn thắng thầu {wonId}.", 404);

        cargoData["updatedAt"] = Util.ViNow();
        won.CargoDeclarationJson = cargoData.ToJsonString();

        _db.ActivityLogs.Add(LogService.Make(
            won.AgentCode ?? "Đại lý", won.AgentCode ?? "AGENT", "AGENT",
            "Khai báo hàng hóa", "Cập nhật Khai báo Vận đơn", won.WonId,
            $"Cập nhật thông tin vận đơn AWB / hàng hóa cho đơn thắng thầu {won.WonId}.",
            ip, "Web Portal"));

        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();
        SharedDataService.InvalidateSnapshotCache();

        return new JsonObject
        {
            ["success"] = true,
            ["cargoDeclaration"] = cargoData,
            ["message"] = $"Đã cập nhật thông tin hàng hóa vận chuyển cho đơn {won.WonId} thành công!"
        };
    }
}
