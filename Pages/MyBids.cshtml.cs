using BiddingCargo.Web.Data;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Pages;

public class MyBidItemViewModel
{
    public string BidId { get; set; } = "";
    public int AuctionId { get; set; }
    public string FlightNumber { get; set; } = "";
    public string Route { get; set; } = "";
    public string Aircraft { get; set; } = "";
    public long CapacityKg { get; set; }
    public long PriceKg { get; set; }
    public long TotalAmountVND { get; set; }
    public string Time { get; set; } = "";
    public long Timestamp { get; set; }
    public string AuctionStatus { get; set; } = "OPEN";
    public string AuctionEndTime { get; set; } = "";
    public string Status { get; set; } = "RECEIVED";
    public bool IsWon { get; set; }
    public string? WonId { get; set; }
}

public class MyBidsModel : PageModel
{
    private readonly AppDbContext _db;

    public MyBidsModel(AppDbContext db)
    {
        _db = db;
    }

    public string AgentCode { get; set; } = "";
    public int TotalBids { get; set; }
    public int ActiveBids { get; set; }
    public int WonBids { get; set; }
    public int LostBids { get; set; }
    public List<MyBidItemViewModel> BidsList { get; set; } = new();

    public async Task OnGetAsync()
    {
        var code = Request.Cookies["cargo_agent_code"]?.Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(code))
        {
            code = Request.Query["agentCode"].ToString().Trim().ToUpperInvariant();
        }
        AgentCode = code ?? "";

        if (string.IsNullOrEmpty(AgentCode)) return;

        var bids = await _db.Bids.AsNoTracking()
            .Where(b => b.AgentCode != null && b.AgentCode.ToUpper() == AgentCode)
            .OrderByDescending(b => b.Timestamp)
            .ToListAsync();

        var auctionIds = bids.Select(b => b.AuctionId).Distinct().ToList();
        var auctionList = await _db.Auctions.AsNoTracking()
            .Where(a => auctionIds.Contains(a.Id))
            .ToListAsync();
        var auctions = auctionList.GroupBy(a => a.Id).ToDictionary(g => g.Key, g => g.First());

        var wonList = await _db.WonAuctions.AsNoTracking()
            .Where(w => w.AgentCode != null && w.AgentCode.ToUpper() == AgentCode && w.AuctionId.HasValue)
            .ToListAsync();
        var wons = wonList.GroupBy(w => w.AuctionId!.Value).ToDictionary(g => g.Key, g => g.First());

        foreach (var b in bids)
        {
            auctions.TryGetValue(b.AuctionId, out var a);
            wons.TryGetValue(b.AuctionId, out var won);

            var status = b.Status ?? "RECEIVED";
            if (won != null) status = "WON";
            else if (a != null && a.Status == "CLOSED") status = "LOST";

            var weight = b.WeightKg > 0 ? b.WeightKg : (a?.CapacityKg ?? 3500);

            BidsList.Add(new MyBidItemViewModel
            {
                BidId = b.Id,
                AuctionId = b.AuctionId,
                FlightNumber = a?.FlightNumber ?? "VU-000",
                Route = a?.Route ?? $"{a?.Origin}-{a?.Destination}",
                Aircraft = a?.Aircraft ?? "A321F",
                CapacityKg = a?.CapacityKg ?? 3500,
                PriceKg = b.PriceKg,
                TotalAmountVND = b.PriceKg * weight,
                Time = b.Time ?? "",
                Timestamp = b.Timestamp,
                AuctionStatus = a?.Status ?? "OPEN",
                AuctionEndTime = a?.EndTime ?? "",
                Status = status,
                IsWon = won != null,
                WonId = won?.WonId
            });
        }

        TotalBids = BidsList.Count;
        WonBids = BidsList.Count(b => b.IsWon || b.Status == "WON");
        ActiveBids = BidsList.Count(b => b.AuctionStatus == "OPEN");
        LostBids = BidsList.Count(b => b.Status == "LOST");
    }
}
