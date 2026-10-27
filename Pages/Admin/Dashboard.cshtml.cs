using BiddingCargo.Web.Data;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Pages.Admin;

public class DashboardModel : PageModel
{
    private readonly AppDbContext _db;

    public DashboardModel(AppDbContext db)
    {
        _db = db;
    }

    public int TotalAuctions { get; set; }
    public int ActiveAuctions { get; set; }
    public int TotalBids { get; set; }
    public int TotalAgents { get; set; }
    public long TotalRevenue { get; set; }

    public List<Auction> RecentAuctions { get; set; } = new();
    public List<Bid> RecentBids { get; set; } = new();

    public async Task OnGetAsync()
    {
        TotalAuctions = await _db.Auctions.CountAsync();
        ActiveAuctions = await _db.Auctions.CountAsync(a => a.Status == "OPEN");
        TotalBids = await _db.Bids.CountAsync();
        TotalAgents = await _db.Agents.CountAsync(a => !a.IsLocked && a.Status != "Đã khóa");

        var paidWons = await _db.WonAuctions.AsNoTracking().Where(w => w.PaymentStatus == "PAID").ToListAsync();
        TotalRevenue = paidWons.Sum(w => w.TotalAmountVND);

        RecentAuctions = await _db.Auctions.AsNoTracking()
            .OrderByDescending(a => a.Id)
            .Take(5)
            .ToListAsync();

        RecentBids = await _db.Bids.AsNoTracking()
            .OrderByDescending(b => b.Timestamp)
            .Take(6)
            .ToListAsync();
    }
}
