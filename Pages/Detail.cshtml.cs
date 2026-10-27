using BiddingCargo.Web.Data;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Pages;

public class DetailModel : PageModel
{
    private readonly AppDbContext _db;

    public DetailModel(AppDbContext db)
    {
        _db = db;
    }

    public Auction? AuctionItem { get; set; }
    public List<Bid> Bids { get; set; } = new();
    public Bid? MyHighestBid { get; set; }
    public string AgentCode { get; set; } = "";
    public bool IsAllowedAgent { get; set; } = true;
    public long MinNextPrice { get; set; }

    public async Task OnGetAsync(int id)
    {
        var code = Request.Cookies["cargo_agent_code"]?.Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(code))
        {
            code = Request.Query["agentCode"].ToString().Trim().ToUpperInvariant();
        }
        AgentCode = code ?? "";

        AuctionItem = await _db.Auctions.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id);
        if (AuctionItem == null && id == 0)
        {
            AuctionItem = await _db.Auctions.AsNoTracking().OrderByDescending(a => a.Id).FirstOrDefaultAsync();
        }

        if (AuctionItem != null)
        {
            Bids = await _db.Bids.AsNoTracking()
                .Where(b => b.AuctionId == AuctionItem.Id)
                .OrderByDescending(b => b.PriceKg)
                .ToListAsync();

            if (!string.IsNullOrEmpty(AgentCode))
            {
                MyHighestBid = Bids.FirstOrDefault(b => !string.IsNullOrEmpty(b.AgentCode) && b.AgentCode.ToUpper() == AgentCode);

                if (!string.IsNullOrEmpty(AuctionItem.AllowedAgentsJson))
                {
                    try
                    {
                        var allowed = System.Text.Json.JsonSerializer.Deserialize<List<string>>(AuctionItem.AllowedAgentsJson);
                        if (allowed != null && allowed.Count > 0)
                        {
                            IsAllowedAgent = allowed.Any(x => string.Equals(x.Trim(), AgentCode, StringComparison.OrdinalIgnoreCase));
                        }
                    }
                    catch { }
                }
            }

            var basePrice = AuctionItem.CurrentPriceKg > 0 ? AuctionItem.CurrentPriceKg : AuctionItem.StartingPriceKg;
            var step = AuctionItem.MinStep > 0 ? AuctionItem.MinStep : 500;
            MinNextPrice = basePrice + step;
        }
    }
}
