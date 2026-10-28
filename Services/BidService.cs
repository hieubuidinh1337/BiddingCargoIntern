using System.Text.RegularExpressions;
using BiddingCargo.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Services;

public class BidException : Exception
{
    public BidException(string message) : base(message) { }
}

public record PlaceBidRequest(string? AuctionId, string? AgentCode, string? AgentName, long PriceKg, bool IsAnonymous,
                              long WeightKg, string? BidId);

/// <summary>Dịch vụ xử lý đặt thầu nguyên tử (Atomic Bid Placement) cho API POST /api/bids/place.</summary>
public class BidService
{
    private static readonly Regex BidIdPattern = new(@"^BID-\d+-\d+$", RegexOptions.Compiled);
    private readonly AppDbContext _db;
    private readonly SharedDataService _shared;

    public BidService(AppDbContext db, SharedDataService shared) { _db = db; _shared = shared; }

    public async Task<Bid> PlaceAsync(PlaceBidRequest req)
    {
        var agentCodeRaw = req.AgentCode?.Trim() ?? "";
        if (agentCodeRaw == "" || Util.IsAnonCode(agentCodeRaw))
            throw new BidException("Mã đại lý không hợp lệ hoặc là mã ẩn danh (AG-***)");
        var cleanCode = agentCodeRaw.ToUpperInvariant();

        var agent = await _db.Agents.FirstOrDefaultAsync(a => a.Code.ToUpper() == cleanCode);
        if (agent != null && (agent.IsLocked || agent.Status is "Đã khóa" or "LOCKED"))
            throw new BidException("Tài khoản đại lý đang bị khóa, không thể đặt thầu. Vui lòng liên hệ Ban Điều hành.");

        // Tên hiển thị: ưu tiên tên công ty nếu client chỉ gửi mã
        var agentName = req.AgentName;
        if (agent != null && (string.IsNullOrEmpty(agentName) || agentName == req.AgentCode))
            agentName = Util.NullIfEmpty(agent.CompanyName) ?? Util.NullIfEmpty(agent.Name) ?? EntityJson.GetExtraString(agent, "repName") ?? agentName;

        if (agent == null)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.AgentCode != null && u.AgentCode.ToUpper() == cleanCode);
            var resolved = !string.IsNullOrEmpty(agentName) && agentName != cleanCode
                ? agentName : (Util.NullIfEmpty(user?.CompanyName) ?? $"Đại lý {cleanCode}");
            agent = new Agent
            {
                Code = cleanCode, Name = resolved, CompanyName = resolved, Email = user?.Email, Status = "Hoạt động",
                Password = user?.Password ?? "12345678", Pin = user?.Pin ?? "1234"
            };
            _db.Agents.Add(agent);
            agentName = resolved;
        }

        var key = (req.AuctionId ?? "").Trim();
        var upperKey = key.ToUpperInvariant();
        int.TryParse(key, out var idNum);
        var auction = await _db.Auctions.FirstOrDefaultAsync(a =>
            a.Id == idNum || (a.FlightCode != null && a.FlightCode.ToUpper() == upperKey) ||
            (a.FlightNumber != null && a.FlightNumber.ToUpper() == upperKey));
        if (auction == null) throw new BidException("Chuyến bay đấu giá không tồn tại");

        if (auction.Status is "CANCELLED" or "DELETED") throw new BidException("Chuyến bay đấu giá đã bị hủy");
        if (!string.IsNullOrEmpty(auction.WinnerAgentCode))
            throw new BidException("Phiên đấu giá đã kết thúc và đã chốt đại lý trúng thầu");

        var now = Util.NowMs();
        long? etdMs = Util.ParseIso(auction.EtdIso)?.ToUnixTimeMilliseconds();
        if (etdMs == null)
        {
            var fd = Util.ParseFlightDate(auction.Etd);
            if (fd != null) etdMs = new DateTimeOffset(fd.Value).ToUnixTimeMilliseconds();
        }
        long? endMs = Util.ParseIso(auction.EndTime)?.ToUnixTimeMilliseconds();

        if (auction.Status == "CLOSED")
            throw new BidException("Phiên đấu giá đã kết thúc, không thể đặt thêm giá");

        if (auction.Status == "UPCOMING")
        {
            var openMs = Util.ParseIso(auction.OpenDateIso)?.ToUnixTimeMilliseconds();
            if (openMs == null && !string.IsNullOrEmpty(auction.OpenDate))
            {
                var fd = Util.ParseFlightDate(auction.OpenDate);
                if (fd != null) openMs = new DateTimeOffset(fd.Value).ToUnixTimeMilliseconds();
            }
            if (openMs == null || openMs.Value <= now)
            {
                auction.Status = "OPEN";
            }
            else
            {
                throw new BidException("Phiên đấu giá chưa đến giờ mở thầu");
            }
        }

        // Nếu hết thời gian nhưng Admin chưa chốt phiên (Status vẫn OPEN): tự động gia hạn 30 phút theo quy chế
        if (endMs != null && now > endMs)
        {
            if (auction.Status == "OPEN")
            {
                auction.EndTime = Util.ToIso(DateTimeOffset.UtcNow.AddMinutes(30));
            }
            else
            {
                throw new BidException("Phiên đấu giá đã kết thúc, không thể đặt thêm giá");
            }
        }

        // Chỉ gán EndTime mặc định nếu phiên hoàn toàn chưa có cấu hình thời gian đóng
        if (endMs == null)
        {
            auction.EndTime = Util.ToIso(DateTimeOffset.UtcNow.AddMinutes(60));
        }

        var minRequired = auction.StartingPriceKg;
        if (req.PriceKg < minRequired)
            throw new BidException($"Giá đặt ({Util.FmtVi(req.PriceKg)}đ) phải lớn hơn hoặc bằng giá tối thiểu ({Util.FmtVi(minRequired)}đ)");

        var bidId = req.BidId != null && BidIdPattern.IsMatch(req.BidId) ? req.BidId : $"BID-{now}-{Random.Shared.Next(0, 1000)}";
        var existing = await _db.Bids.FindAsync(bidId); // idempotent: gửi lại cùng bidId không tạo thầu mới
        if (existing != null) return existing;

        var priorAgentBid = await _db.Bids
            .Where(b => b.AuctionId == auction.Id && b.AgentCode == cleanCode)
            .OrderByDescending(b => b.PriceKg)
            .FirstOrDefaultAsync();
        if (priorAgentBid != null && req.PriceKg <= priorAgentBid.PriceKg)
        {
            throw new BidException($"Đại lý của bạn đã nộp mức giá {Util.FmtVi(priorAgentBid.PriceKg)}đ/Kg. Mức giá mới phải cao hơn mức giá đã đặt trước đó.");
        }

        var strategy = _db.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await _db.Database.BeginTransactionAsync();
            try
            {
                var weight = req.WeightKg != 0 ? req.WeightKg : auction.CapacityKg;
                var bid = new Bid
                {
                    Id = bidId, Timestamp = now, AuctionId = auction.Id, AgentCode = req.AgentCode!.Trim(), AgentName = agentName ?? cleanCode,
                    IsAnonymous = req.IsAnonymous, PriceKg = req.PriceKg,
                    Time = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"), Status = "HIGHEST", WeightKg = weight
                };

                var allAuctionBids = await _db.Bids.Where(b => b.AuctionId == auction.Id).ToListAsync();
                if (!allAuctionBids.Any(b => b.Id == bid.Id))
                {
                    allAuctionBids.Add(bid);
                }
                _db.Bids.Add(bid);

                var maxBid = allAuctionBids.OrderByDescending(b => b.PriceKg).ThenBy(b => b.Timestamp).FirstOrDefault();
                foreach (var b in allAuctionBids)
                {
                    b.Status = (b.Id == maxBid?.Id) ? "HIGHEST" : "OUTBID";
                }

                auction.BidsCount = allAuctionBids.Count;
                if (maxBid != null)
                {
                    auction.CurrentPriceKg = maxBid.PriceKg;
                    auction.LeadingAgentCode = maxBid.AgentCode;
                    auction.LeadingAgentName = maxBid.AgentName;
                }

                var flight = Util.NullIfEmpty(auction.FlightNumber) ?? $"FL-{auction.Id}";
                var route = auction.Route ?? "";
                var price = Util.FmtVi(req.PriceKg);
                var anon = req.IsAnonymous ? " (Tên công ty được che ẩn danh đối với các đối thủ)" : "";
                if (await _db.Notifications.FindAsync(now) == null)
                    _db.Notifications.Add(new Notification
                    {
                        Id = now, TargetAgentCode = bid.AgentCode, Title = $"Đặt giá thành công chuyến {flight}",
                        Message = $"Hệ thống đã ghi nhận mức giá {price}đ/Kg của bạn cho chặng {route}.{anon}",
                        Time = "Vừa xong", Type = "BID_RECEIVED", Read = false, Unread = true,
                        Link = $"04-Detail.html?id={auction.Id}"
                    });

                var actor = Util.NullIfEmpty(agent.CompanyName) ?? EntityJson.GetExtraString(agent, "repName") ?? agentName ?? cleanCode;
                var routeSuffix = route != "" ? $" ({route})" : "";
                if (await _db.ActivityLogs.FindAsync(now) == null)
                    _db.ActivityLogs.Add(new ActivityLog
                    {
                        Id = now, Timestamp = Util.LogTimestamp(DateTime.Now), RawTime = now, Actor = actor, Username = bid.AgentCode,
                        Role = "AGENT", ActionCategory = "Đấu giá", ActionTitle = "Đặt giá thầu", Target = flight,
                        Details = $"Đại lý {actor} đặt thầu thành công mức giá {price} đ/Kg cho chuyến bay {flight}{routeSuffix}.",
                        Ip = "113.161.42.12", Device = "Web Client"
                    });

                await _shared.BumpVersionAsync();   // để các tab Admin/Đại lý nhận biết có thầu mới
                await _db.SaveChangesAsync();
                await tx.CommitAsync();
                SharedDataService.InvalidateSnapshotCache();
                return bid;
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        });
    }
}
