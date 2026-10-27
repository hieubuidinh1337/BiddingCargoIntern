using BiddingCargo.Web.Data;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Pages;

public class ProfileModel : PageModel
{
    private readonly AppDbContext _db;

    public ProfileModel(AppDbContext db)
    {
        _db = db;
    }

    public string AgentCode { get; set; } = "";
    public Agent? CurrentAgent { get; set; }

    public async Task OnGetAsync()
    {
        var code = Request.Cookies["cargo_agent_code"]?.Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(code))
        {
            code = Request.Query["agentCode"].ToString().Trim().ToUpperInvariant();
        }
        AgentCode = code ?? "";

        if (!string.IsNullOrEmpty(AgentCode))
        {
            CurrentAgent = await _db.Agents.AsNoTracking().FirstOrDefaultAsync(a => a.Code.ToUpper() == AgentCode);
        }
    }
}
