using BiddingCargo.Web.Data;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Pages;

public class WonAuctionModel : PageModel
{
    private readonly AppDbContext _db;

    public WonAuctionModel(AppDbContext db)
    {
        _db = db;
    }

    public string AgentCode { get; set; } = "";
    public int TotalWon { get; set; }
    public int UnpaidCount { get; set; }
    public int PaidCount { get; set; }
    public long TotalAmountWon { get; set; }
    public List<WonAuction> WonList { get; set; } = new();

    public async Task OnGetAsync()
    {
        var code = Request.Cookies["cargo_agent_code"]?.Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(code))
        {
            code = Request.Query["agentCode"].ToString().Trim().ToUpperInvariant();
        }
        AgentCode = code ?? "";

        if (string.IsNullOrEmpty(AgentCode)) return;

        WonList = await _db.WonAuctions.AsNoTracking()
            .Where(w => w.AgentCode != null && w.AgentCode.ToUpper() == AgentCode)
            .OrderByDescending(w => w.WonId)
            .ToListAsync();

        TotalWon = WonList.Count;
        UnpaidCount = WonList.Count(w => w.PaymentStatus == "UNPAID");
        PaidCount = WonList.Count(w => w.PaymentStatus == "PAID");
        TotalAmountWon = WonList.Sum(w => w.TotalAmountVND);
    }
}
