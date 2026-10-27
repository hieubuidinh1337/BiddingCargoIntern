using BiddingCargo.Web.Data;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Pages;

public class NotificationsModel : PageModel
{
    private readonly AppDbContext _db;

    public NotificationsModel(AppDbContext db)
    {
        _db = db;
    }

    public string AgentCode { get; set; } = "";
    public int TotalCount { get; set; }
    public int UnreadCount { get; set; }
    public int WonCount { get; set; }
    public List<Notification> NotificationsList { get; set; } = new();

    public async Task OnGetAsync(string? filter)
    {
        var code = Request.Cookies["cargo_agent_code"]?.Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(code))
        {
            code = Request.Query["agentCode"].ToString().Trim().ToUpperInvariant();
        }
        AgentCode = code ?? "";

        var query = _db.Notifications.AsNoTracking().AsQueryable();

        if (!string.IsNullOrEmpty(AgentCode))
        {
            query = query.Where(n =>
                n.TargetAgentCode == null ||
                n.TargetAgentCode == "" ||
                n.TargetAgentCode == "ALL" ||
                n.TargetAgentCode.ToUpper() == AgentCode ||
                n.TargetRole == "AGENT");
        }
        else
        {
            query = query.Where(n => n.TargetAgentCode == null || n.TargetAgentCode == "" || n.TargetAgentCode == "ALL" || n.TargetRole == "AGENT");
        }

        var allForAgent = await query.OrderByDescending(n => n.Id).ToListAsync();

        TotalCount = allForAgent.Count;
        UnreadCount = allForAgent.Count(n => !n.Read);
        WonCount = allForAgent.Count(n => n.Type == "WON");

        var f = (filter ?? "all").ToLowerInvariant();
        if (f == "unread")
        {
            NotificationsList = allForAgent.Where(n => !n.Read).ToList();
        }
        else if (f != "all")
        {
            NotificationsList = allForAgent.Where(n => string.Equals(n.Type, filter, StringComparison.OrdinalIgnoreCase)).ToList();
        }
        else
        {
            NotificationsList = allForAgent;
        }
    }
}
