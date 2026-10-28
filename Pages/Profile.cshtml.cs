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

    public async Task<Microsoft.AspNetCore.Mvc.IActionResult> OnGetAsync()
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
        if (CurrentAgent != null && (CurrentAgent.IsLocked || CurrentAgent.Status == "Đã khóa" || CurrentAgent.Status == "LOCKED"))
        {
            Response.Cookies.Delete("cargo_agent_code");
            return Redirect($"/login?locked=1&code={Uri.EscapeDataString(CurrentAgent.Code)}&reason={Uri.EscapeDataString(CurrentAgent.LockedReason ?? "Tài khoản đại lý đã bị khóa")}");
        }

        CurrentRegistration = await _db.Registrations.AsNoTracking().FirstOrDefaultAsync(r => r.AgentCode != null && r.AgentCode.ToUpper() == AgentCode);
        if (CurrentRegistration == null && CurrentAgent != null && !string.IsNullOrEmpty(CurrentAgent.TaxCode))
        {
            CurrentRegistration = await _db.Registrations.AsNoTracking().FirstOrDefaultAsync(r => r.TaxCode != null && r.TaxCode.Trim() == CurrentAgent.TaxCode.Trim());
        }

        if (CurrentRegistration != null && !string.IsNullOrWhiteSpace(CurrentRegistration.Documents))
        {
            DocumentsJson = CurrentRegistration.Documents;
        }

        return Page();
    }
}
