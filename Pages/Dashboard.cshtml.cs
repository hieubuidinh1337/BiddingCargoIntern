using System.Text.Json;
using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;
using BiddingCargo.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Pages;

public class DashboardModel : PageModel
{
    private readonly AppDbContext _db;
    private readonly SharedDataService _shared;
    private readonly BidService _bids;
    private readonly ILogger<DashboardModel> _log;

    public DashboardModel(AppDbContext db, SharedDataService shared, BidService bids, ILogger<DashboardModel> log)
    {
        _db = db;
        _shared = shared;
        _bids = bids;
        _log = log;
    }

    public AgentDto CurrentAgent { get; set; } = new();
    public DashboardKpis Kpis { get; set; } = new();
    public List<DashboardAuctionItem> OpenAuctions { get; set; } = new();
    public string? FromDate { get; set; }
    public string? ToDate { get; set; }

    public async Task<IActionResult> OnGetAsync(string? agentCode = null, string? fromDate = null, string? toDate = null)
    {
        await LoadDashboardDataAsync(agentCode, fromDate, toDate);
        return Page();
    }

    public async Task<IActionResult> OnGetDashboardDataAsync(string? agentCode = null, string? fromDate = null, string? toDate = null)
    {
        await LoadDashboardDataAsync(agentCode, fromDate, toDate);
        return new JsonResult(new
        {
            success = true,
            agent = CurrentAgent,
            kpis = Kpis,
            auctions = OpenAuctions
        });
    }

    public async Task<IActionResult> OnPostPlaceBidAsync([FromBody] PlaceBidRequest req)
    {
        try
        {
            if (req == null)
                return new JsonResult(new { success = false, message = "Dữ liệu đặt thầu không hợp lệ." });

            var b = await _bids.PlaceAsync(req);
            await _shared.BumpVersionAsync();
            return new JsonResult(new
            {
                success = true,
                message = "Nộp phiếu thầu thành công!",
                bid = EntityJson.ToNode(b)
            });
        }
        catch (Exception ex)
        {
            return new JsonResult(new { success = false, message = ex.Message });
        }
    }

    private async Task LoadDashboardDataAsync(string? agentCode, string? fromDate, string? toDate)
    {
        try
        {
            await _shared.MaintenanceAsync();
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "MaintenanceAsync in DashboardModel encountered an issue");
        }

        // 1. Resolve agent code (Query -> Cookie -> DB Default)
        agentCode = (agentCode ?? Request.Cookies["cargo_agent_code"])?.Trim().ToUpperInvariant();
        Agent? agent = null;
        if (!string.IsNullOrEmpty(agentCode))
        {
            agent = await _db.Agents.FirstOrDefaultAsync(a => a.Code.ToUpper() == agentCode);
        }
        if (agent == null)
        {
            agent = await _db.Agents.OrderBy(a => a.Code).FirstOrDefaultAsync();
            if (agent != null)
            {
                agentCode = agent.Code;
            }
        }

        if (agent != null)
        {
            if (!Response.HasStarted && Request.Cookies["cargo_agent_code"] != agent.Code)
            {
                Response.Cookies.Append("cargo_agent_code", agent.Code, new CookieOptions
                {
                    Path = "/",
                    MaxAge = TimeSpan.FromDays(30),
                    SameSite = SameSiteMode.Lax,
                    HttpOnly = false
                });
            }

            var unreadCount = await _db.Notifications
                .Where(n => !n.Read &&
                    (n.TargetAgentCode == agent.Code ||
                     (n.TargetAgentCode == null && (n.TargetRole == null || n.TargetRole == "AGENT" || n.TargetRole == "agent"))))
                .CountAsync();

            CurrentAgent = new AgentDto
            {
                Code = agent.Code,
                Name = agent.Name ?? agent.CompanyName ?? agent.Code,
                CompanyName = agent.CompanyName ?? agent.Name ?? "Đại lý",
                Email = agent.Email ?? "",
                Phone = agent.Phone ?? "",
                Tier = "TIER1",
                HasPin = !string.IsNullOrEmpty(agent.Pin),
                UnreadNotifCount = unreadCount
            };
        }

        FromDate = fromDate;
        ToDate = toDate;

        // 2. Query open auctions
        var allAuctions = await _db.Auctions.AsNoTracking().ToListAsync();
        var nowMs = Util.NowMs();

        var openList = allAuctions.Where(a =>
        {
            if (a.Status != "OPEN") return false;
            var endMs = Util.ParseIso(a.EndTime)?.ToUnixTimeMilliseconds();
            if (endMs.HasValue && endMs.Value <= nowMs) return false;

            if (!string.IsNullOrEmpty(a.AllowedAgentsJson) && !string.IsNullOrEmpty(agentCode))
            {
                try
                {
                    var allowed = JsonSerializer.Deserialize<List<string>>(a.AllowedAgentsJson);
                    if (allowed != null && allowed.Count > 0 && !allowed.Contains("ALL", StringComparer.OrdinalIgnoreCase) && !allowed.Contains(agentCode, StringComparer.OrdinalIgnoreCase))
                    {
                        return false;
                    }
                }
                catch { }
            }
            return true;
        }).ToList();

        // Date range filter
        if (!string.IsNullOrEmpty(fromDate))
        {
            openList = openList.Where(a =>
            {
                var fStart = a.FlightStartDate ?? (a.EtdIso != null && a.EtdIso.Length >= 10 ? a.EtdIso.Substring(0, 10) : "");
                var fEnd = a.FlightEndDate ?? fStart;
                return string.IsNullOrEmpty(fEnd) || string.Compare(fEnd, fromDate, StringComparison.Ordinal) >= 0;
            }).ToList();
        }
        if (!string.IsNullOrEmpty(toDate))
        {
            openList = openList.Where(a =>
            {
                var fStart = a.FlightStartDate ?? (a.EtdIso != null && a.EtdIso.Length >= 10 ? a.EtdIso.Substring(0, 10) : "");
                return string.IsNullOrEmpty(fStart) || string.Compare(fStart, toDate, StringComparison.Ordinal) <= 0;
            }).ToList();
        }

        // 3. Load agent bids
        var agentBids = new List<Bid>();
        if (!string.IsNullOrEmpty(agentCode))
        {
            agentBids = await _db.Bids.AsNoTracking()
                .Where(b => b.AgentCode != null && b.AgentCode.ToUpper() == agentCode)
                .ToListAsync();
        }

        var bidsByAuction = agentBids
            .GroupBy(b => b.AuctionId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(b => b.PriceKg).First());

        // 4. Map to DTOs
        OpenAuctions = openList.Select(a =>
        {
            bidsByAuction.TryGetValue(a.Id, out var myBid);
            var isSubmitted = myBid != null;
            var capKg = a.CapacityKg > 0 ? a.CapacityKg : 3500;
            var startPrice = a.StartingPriceKg > 0 ? a.StartingPriceKg : 18000;
            var currentPrice = isSubmitted ? myBid!.PriceKg : startPrice;
            var totalAmount = capKg * currentPrice;

            return new DashboardAuctionItem
            {
                Id = a.Id,
                FlightCode = a.FlightCode ?? $"VU-{a.Id}",
                FlightNumber = a.FlightNumber ?? "VU-000",
                Route = a.Route ?? $"{a.Origin}-{a.Destination}",
                Origin = a.Origin ?? "SGN",
                Destination = a.Destination ?? "HAN",
                OriginName = a.OriginName ?? a.Origin ?? "TP. Hồ Chí Minh",
                DestName = a.DestName ?? a.Destination ?? "Hà Nội",
                FlightPeriod = a.FlightPeriod,
                FlightStartDate = a.FlightStartDate,
                FlightEndDate = a.FlightEndDate,
                Etd = a.Etd ?? "08:00",
                Eta = a.Eta ?? "10:15",
                EndTime = a.EndTime ?? a.CloseDateIso ?? DateTime.UtcNow.AddHours(2).ToString("o"),
                CapacityKg = capKg,
                StartingPriceKg = startPrice,
                CurrentPriceKg = a.CurrentPriceKg,
                MinStep = a.MinStep > 0 ? a.MinStep : 500,
                Status = a.Status ?? "OPEN",
                IsSubmitted = isSubmitted,
                MyHighestBidPriceKg = myBid?.PriceKg,
                TotalAmountVnd = totalAmount
            };
        }).OrderByDescending(a => a.Id).ToList();

        // 5. Compute KPIs
        var openIds = openList.Select(a => a.Id).ToHashSet();
        var participatingCount = bidsByAuction.Keys.Count(id => openIds.Contains(id));
        var wonCount = 0;
        if (!string.IsNullOrEmpty(agentCode))
        {
            wonCount = await _db.WonAuctions
                .Where(w => w.AgentCode != null && w.AgentCode.ToUpper() == agentCode)
                .CountAsync();
        }

        Kpis = new DashboardKpis
        {
            OpenAuctionsCount = OpenAuctions.Count,
            ParticipatingCount = participatingCount,
            WonAuctionsCount = wonCount
        };
    }

    public class AgentDto
    {
        public string Code { get; set; } = "AG-0001";
        public string Name { get; set; } = "Đại lý";
        public string CompanyName { get; set; } = "Công ty Đại lý";
        public string Email { get; set; } = "";
        public string Phone { get; set; } = "";
        public string Tier { get; set; } = "TIER1";
        public bool HasPin { get; set; } = true;
        public int UnreadNotifCount { get; set; } = 0;
    }

    public class DashboardKpis
    {
        public int OpenAuctionsCount { get; set; }
        public int ParticipatingCount { get; set; }
        public int WonAuctionsCount { get; set; }
    }

    public class DashboardAuctionItem
    {
        public int Id { get; set; }
        public string FlightCode { get; set; } = "";
        public string FlightNumber { get; set; } = "";
        public string Route { get; set; } = "";
        public string Origin { get; set; } = "";
        public string Destination { get; set; } = "";
        public string OriginName { get; set; } = "";
        public string DestName { get; set; } = "";
        public string? FlightPeriod { get; set; }
        public string? FlightStartDate { get; set; }
        public string? FlightEndDate { get; set; }
        public string Etd { get; set; } = "";
        public string Eta { get; set; } = "";
        public string EndTime { get; set; } = "";
        public long CapacityKg { get; set; }
        public long StartingPriceKg { get; set; }
        public long CurrentPriceKg { get; set; }
        public long MinStep { get; set; }
        public string Status { get; set; } = "OPEN";
        public bool IsSubmitted { get; set; }
        public long? MyHighestBidPriceKg { get; set; }
        public long TotalAmountVnd { get; set; }
    }
}
