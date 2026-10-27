using BiddingCargo.Web.Data;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Pages;

public class WatchlistModel : PageModel
{
    private readonly AppDbContext _db;

    public WatchlistModel(AppDbContext db)
    {
        _db = db;
    }

    public string AgentCode { get; set; } = "";
    public List<Auction> ActiveAuctions { get; set; } = new();

    public async Task OnGetAsync()
    {
        var code = Request.Cookies["cargo_agent_code"]?.Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(code))
        {
            code = Request.Query["agentCode"].ToString().Trim().ToUpperInvariant();
        }
        AgentCode = code ?? "";

        ActiveAuctions = await _db.Auctions.AsNoTracking()
            .Where(a => a.Status == "OPEN")
            .OrderByDescending(a => a.Id)
            .ToListAsync();
    }
}
