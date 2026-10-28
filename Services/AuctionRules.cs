using BiddingCargo.Web.Data;

namespace BiddingCargo.Web.Services;

/// <summary>Các quy tắc nghiệp vụ thuần (port từ server.js): đóng phiên, đối soát giá/đại lý dẫn đầu, hạn thanh toán.</summary>
public static class AuctionRules
{
    /// <summary>Phiên hết giờ tự động ĐÓNG; phiên đóng mà không có thầu thì không có winner.</summary>
    public static bool ReconcileStatuses(IEnumerable<Auction> auctions, IReadOnlyCollection<Bid> bids)
    {
        var changed = false;
        var now = Util.NowMs();
        var bidCountByAuction = bids.GroupBy(b => b.AuctionId).ToDictionary(g => g.Key, g => g.Count());

        foreach (var a in auctions)
        {
            if (a.Status is "CANCELLED" or "DELETED") continue;

            // 1) Nếu phiên đang UPCOMING mà thời gian mở phiên đã tới hoặc trong quá khứ -> tự động mở OPEN
            if (a.Status == "UPCOMING")
            {
                long? openMs = Util.ParseIso(a.OpenDateIso)?.ToUnixTimeMilliseconds();
                if (openMs == null && !string.IsNullOrEmpty(a.OpenDate))
                {
                    var fd = Util.ParseFlightDate(a.OpenDate);
                    if (fd != null) openMs = new DateTimeOffset(fd.Value).ToUnixTimeMilliseconds();
                }
                if (!openMs.HasValue || openMs.Value <= now)
                {
                    a.Status = "OPEN";
                    changed = true;
                }
            }

            // 2) Nếu phiên đã hết hạn đóng thầu -> chuyển sang CLOSED
            var end = Util.ParseIso(a.EndTime);
            if (end == null && !string.IsNullOrEmpty(a.CloseDate))
            {
                var cfd = Util.ParseFlightDate(a.CloseDate);
                if (cfd != null) end = new DateTimeOffset(cfd.Value);
            }
            if ((a.Status == "OPEN" || a.Status == "UPCOMING") && end != null && end.Value.ToUnixTimeMilliseconds() <= now)
            {
                a.Status = "CLOSED";
                if (string.IsNullOrEmpty(a.ClosedAt)) a.ClosedAt = Util.ToIso(end.Value);
                changed = true;
            }

            if (a.Status == "CLOSED" && !bidCountByAuction.ContainsKey(a.Id))
            {
                if (!string.IsNullOrEmpty(a.WinnerAgentCode) || !string.IsNullOrEmpty(a.WinnerAgentName) || a.WinningPriceKg != 0)
                {
                    a.WinnerAgentCode = null;
                    a.WinnerAgentName = null;
                    a.WinningPriceKg = 0;
                    a.LeadingAgentCode = null;
                    a.LeadingAgentName = null;
                    a.BidsCount = 0;
                    changed = true;
                }
            }
        }
        return changed;
    }

    /// <summary>Đối soát currentPriceKg, đại lý dẫn đầu, bidsCount và trạng thái HIGHEST/OUTBID/WON của từng thầu.</summary>
    public static bool ReconcileSummaries(IEnumerable<Auction> auctions, IReadOnlyCollection<Bid> bids)
    {
        var changed = false;
        var byAuction = bids.GroupBy(b => b.AuctionId).ToDictionary(g => g.Key, g => g.OrderByDescending(b => b.PriceKg).ThenBy(b => b.Timestamp).ToList());

        foreach (var a in auctions)
        {
            if (byAuction.TryGetValue(a.Id, out var list) && list.Count > 0)
            {
                var top = list[0];
                var isClosed = a.Status == "CLOSED";
                for (var i = 0; i < list.Count; i++) list[i].Status = i == 0 ? (isClosed ? "WON" : "HIGHEST") : "OUTBID";

                if (a.CurrentPriceKg != top.PriceKg) { a.CurrentPriceKg = top.PriceKg; changed = true; }

                var leaderCode = (top.AgentCode ?? "").Trim();
                var leaderName = (top.AgentName ?? "").Trim();
                if ((a.LeadingAgentCode ?? "").Trim() != leaderCode || (a.LeadingAgentName ?? "").Trim() != leaderName)
                {
                    a.LeadingAgentCode = leaderCode;
                    a.LeadingAgentName = leaderName;
                    changed = true;
                }
                a.IsAnonymous = top.IsAnonymous;

                if (isClosed && (string.IsNullOrEmpty(a.WinnerAgentCode) || a.WinnerAgentCode == "AG-***" || a.WinningPriceKg == 0))
                {
                    a.WinnerAgentCode = leaderCode;
                    a.WinnerAgentName = leaderName;
                    a.WinningPriceKg = top.PriceKg;
                    changed = true;  
                }

                if (a.BidsCount != list.Count) { a.BidsCount = list.Count; changed = true; }
            }
            else
            {
                if (!string.IsNullOrEmpty(a.LeadingAgentCode) || !string.IsNullOrEmpty(a.LeadingAgentName) || a.BidsCount != 0
                    || (a.StartingPriceKg != 0 && a.CurrentPriceKg != a.StartingPriceKg))
                {
                    a.LeadingAgentCode = null;
                    a.LeadingAgentName = null;
                    a.BidsCount = 0;
                    if (a.StartingPriceKg != 0) a.CurrentPriceKg = a.StartingPriceKg;
                    changed = true;
                }
            }
        }
        return changed;
    }

    /// <summary>Đơn thắng thầu quá hạn thanh toán / quá giờ cut-off (ETD - 3h) mà chưa thanh toán.</summary>
    public static bool IsWonAuctionExpired(WonAuction item, IEnumerable<Auction> auctions)
    {
        if (item.PaymentStatus is "PAID" or "PENDING_VERIFICATION" or "CANCELLED" or "CANCELLED_AFTER_PAYMENT") return false;

        var now = Util.NowMs();
        var linked = auctions.FirstOrDefault(a => item.AuctionId != null && a.Id == item.AuctionId);
        if (linked is { Status: "OPEN" }) return false;

        var dl = Util.ParseIso(item.PaymentDeadline);
        if (dl != null && now > dl.Value.ToUnixTimeMilliseconds()) return true;

        var etd = Util.ParseIso(EntityJson.GetExtraString(item, "etdIso"));
        if (etd != null && now >= etd.Value.ToUnixTimeMilliseconds() - 3L * 3600 * 1000) return true;

        return false;
    }
}
