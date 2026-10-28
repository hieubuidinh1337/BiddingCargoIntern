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
    public Registration? CurrentRegistration { get; set; }
    public string DocumentsJson { get; set; } = "[]";

    public async Task OnGetAsync()
    {
        var code = Request.Cookies["cargo_agent_code"]?.Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(code))
        {
            code = Request.Query["agentCode"].ToString().Trim().ToUpperInvariant();
        }
        if (string.IsNullOrEmpty(code))
        {
            code = "AG-0001";
        }
        AgentCode = code;

        CurrentAgent = await _db.Agents.AsNoTracking().FirstOrDefaultAsync(a => a.Code.ToUpper() == AgentCode);
        CurrentRegistration = await _db.Registrations.AsNoTracking().FirstOrDefaultAsync(r => r.AgentCode != null && r.AgentCode.ToUpper() == AgentCode);
        if (CurrentRegistration == null && CurrentAgent != null && !string.IsNullOrEmpty(CurrentAgent.TaxCode))
        {
            CurrentRegistration = await _db.Registrations.AsNoTracking().FirstOrDefaultAsync(r => r.TaxCode != null && r.TaxCode.Trim() == CurrentAgent.TaxCode.Trim());
        }

        if (CurrentRegistration != null && !string.IsNullOrWhiteSpace(CurrentRegistration.Documents))
        {
            DocumentsJson = CurrentRegistration.Documents;
        }
    }
}
