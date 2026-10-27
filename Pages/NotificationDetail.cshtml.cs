using System.Text.RegularExpressions;
using BiddingCargo.Web.Data;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Pages;

public class NotificationDetailModel : PageModel
{
    private readonly AppDbContext _db;

    public NotificationDetailModel(AppDbContext db)
    {
        _db = db;
    }

    public Notification? NotificationItem { get; set; }
    public Auction? RelatedAuction { get; set; }
    public string AgentCode { get; set; } = "";

    public async Task OnGetAsync(long id)
    {
        var code = Request.Cookies["cargo_agent_code"]?.Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(code))
        {
            code = Request.Query["agentCode"].ToString().Trim().ToUpperInvariant();
        }
        AgentCode = code ?? "";

        NotificationItem = await _db.Notifications.FirstOrDefaultAsync(n => n.Id == id);
        if (NotificationItem == null && id == 0)
        {
            NotificationItem = await _db.Notifications.OrderByDescending(n => n.Id).FirstOrDefaultAsync();
        }

        if (NotificationItem != null)
        {
            if (!NotificationItem.Read)
            {
                NotificationItem.Read = true;
                NotificationItem.Unread = false;
                await _db.SaveChangesAsync();
            }

            // Find related auction if any
            int auctionId = 0;
            if (!string.IsNullOrEmpty(NotificationItem.Link) && NotificationItem.Link.Contains("id="))
            {
                var match = Regex.Match(NotificationItem.Link, @"id=(\d+)");
                if (match.Success) int.TryParse(match.Groups[1].Value, out auctionId);
            }

            if (auctionId > 0)
            {
                RelatedAuction = await _db.Auctions.AsNoTracking().FirstOrDefaultAsync(a => a.Id == auctionId);
            }

            if (RelatedAuction == null && (!string.IsNullOrEmpty(NotificationItem.Title) || !string.IsNullOrEmpty(NotificationItem.Message)))
            {
                var text = $"{NotificationItem.Title} {NotificationItem.Message}";
                var match = Regex.Match(text, @"VU\d+", RegexOptions.IgnoreCase);
                if (match.Success)
                {
                    var fl = match.Value.ToUpperInvariant();
                    RelatedAuction = await _db.Auctions.AsNoTracking().FirstOrDefaultAsync(a =>
                        (a.FlightNumber != null && a.FlightNumber.ToUpper() == fl) ||
                        (a.FlightCode != null && a.FlightCode.ToUpper() == fl));
                }
            }
        }
    }
}
