using System.Text.Json;
using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;
using BiddingCargo.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Pages;

public class AuctionsModel : PageModel
{
    private readonly AppDbContext _db;
    private readonly SharedDataService _shared;
    private readonly ILogger<AuctionsModel> _log;

    public AuctionsModel(AppDbContext db, SharedDataService shared, ILogger<AuctionsModel> log)
    {
        _db = db;
        _shared = shared;
        _log = log;
    }

    public DashboardModel.AgentDto CurrentAgent { get; set; } = new();
    public List<AuctionCardDto> Auctions { get; set; } = new();
    public List<RouteOption> AvailableRoutes { get; set; } = new();
    public List<string> SubscribedRoutes { get; set; } = new();
    public int TotalCount { get; set; }
    public int CurrentPage { get; set; } = 1;
    public int PageSize { get; set; } = 12;
    public int TotalPages { get; set; } = 1;
    public string SelectedRoute { get; set; } = "ALL";
    public string SelectedStatus { get; set; } = "ALL";
    public string SelectedSort { get; set; } = "CLOSING_SOON";
    public string SearchQuery { get; set; } = "";

    public async Task<IActionResult> OnGetAsync(
        string? agentCode = null,
        string? route = null,
        string? status = null,
        string? sort = null,
        string? q = null,
        int page = 1,
        int pageSize = 12)
    {
        await LoadAuctionsDataAsync(agentCode, route, status, sort, q, page, pageSize);
        return Page();
    }

    public async Task<IActionResult> OnGetApiDataAsync(
        string? agentCode = null,
        string? route = null,
        string? status = null,
        string? sort = null,
        string? q = null,
        int page = 1,
        int pageSize = 12)
    {
        await LoadAuctionsDataAsync(agentCode, route, status, sort, q, page, pageSize);
        return new JsonResult(new
        {
            success = true,
            total = TotalCount,
            page = CurrentPage,
            pageSize = PageSize,
            totalPages = TotalPages,
            auctions = Auctions,
            routes = AvailableRoutes,
            subscribedRoutes = SubscribedRoutes,
            agent = CurrentAgent
        });
    }

    private async Task LoadAuctionsDataAsync(
        string? agentCode,
        string? route,
        string? status,
        string? sort,
        string? q,
        int page,
        int pageSize)
    {
        agentCode = (agentCode ?? Request.Cookies["cargo_agent_code"])?.Trim().ToUpperInvariant();
        Agent? agent = null;
        if (!string.IsNullOrEmpty(agentCode))
            agent = await _db.Agents.AsNoTracking().FirstOrDefaultAsync(a => a.Code.ToUpper() == agentCode);
        if (agent == null)
        {
            agent = await _db.Agents.AsNoTracking().OrderBy(a => a.Code).FirstOrDefaultAsync();
            if (agent != null) agentCode = agent.Code;
        }

        if (agent != null)
        {
            if (!Response.HasStarted && Request.Cookies["cargo_agent_code"] != agent.Code)
            {
                Response.Cookies.Append("cargo_agent_code", agent.Code, new CookieOptions
                {
                    Path = "/", MaxAge = TimeSpan.FromDays(30), SameSite = SameSiteMode.Lax
                });
            }
            var unreadNotifCount = await _db.Notifications.AsNoTracking()
                .Where(n => !n.Read && (n.TargetAgentCode == agent.Code || (n.TargetAgentCode == null && (n.TargetRole == null || n.TargetRole == "AGENT" || n.TargetRole == "agent"))))
                .CountAsync();
            CurrentAgent = new DashboardModel.AgentDto
            {
                Code = agent.Code,
                Name = agent.Name ?? agent.CompanyName ?? agent.Code,
                CompanyName = agent.CompanyName ?? agent.Name ?? "Đại lý",
                Email = agent.Email ?? "",
                Phone = agent.Phone ?? "",
                UnreadNotifCount = unreadNotifCount
            };
        }

        SelectedRoute = string.IsNullOrWhiteSpace(route) ? "ALL" : route.Trim().ToUpperInvariant();
        SelectedStatus = string.IsNullOrWhiteSpace(status) ? "ALL" : status.Trim().ToUpperInvariant();
        SelectedSort = string.IsNullOrWhiteSpace(sort) ? "CLOSING_SOON" : sort.Trim();
        SearchQuery = q?.Trim() ?? "";
        CurrentPage = Math.Max(1, page);
        PageSize = pageSize > 0 ? pageSize : 12;

        var allAuctions = await _db.Auctions.AsNoTracking().ToListAsync();

        // Extract available routes
        AvailableRoutes = allAuctions
            .Where(a => !string.IsNullOrEmpty(a.Origin) && !string.IsNullOrEmpty(a.Destination))
            .Select(a => new RouteOption
            {
                Pair = $"{a.Origin!.Trim().ToUpper()}-{a.Destination!.Trim().ToUpper()}",
                Origin = a.OriginName ?? a.Origin ?? "",
                Dest = a.DestName ?? a.Destination ?? ""
            })
            .GroupBy(r => r.Pair)
            .Select(g => g.First())
            .OrderBy(r => r.Pair)
            .ToList();

        // Subscribed routes from settings if available
        var subJson = await _shared.GetSettingAsync("routeSubscriptions");
        if (subJson != null)
        {
            try
            {
                var subsNode = subJson["routes"] as JsonArray;
                if (subsNode != null)
                {
                    SubscribedRoutes = subsNode.Select(x => x?.ToString() ?? "").Where(x => !string.IsNullOrEmpty(x)).ToList();
                }
            } catch { }
        }

        // Filter list
        var filtered = allAuctions.Where(a =>
        {
            if (!string.IsNullOrEmpty(a.AllowedAgentsJson) && !string.IsNullOrEmpty(agentCode))
            {
                try
                {
                    var allowed = JsonSerializer.Deserialize<List<string>>(a.AllowedAgentsJson);
                    if (allowed != null && allowed.Count > 0 && !allowed.Contains("ALL", StringComparer.OrdinalIgnoreCase) && !allowed.Contains(agentCode, StringComparer.OrdinalIgnoreCase))
                        return false;
                }
                catch { }
            }
            if (SelectedRoute != "ALL")
            {
                var cleanRoute = (a.Route ?? $"{a.Origin}-{a.Destination}").Replace(" ", "").ToUpperInvariant();
                var cleanTarget = SelectedRoute.Replace(" ", "").ToUpperInvariant();
                if (cleanRoute != cleanTarget) return false;
            }
            if (SelectedStatus != "ALL")
            {
                if (string.Compare(a.Status, SelectedStatus, StringComparison.OrdinalIgnoreCase) != 0) return false;
            }
            if (!string.IsNullOrEmpty(SearchQuery))
            {
                var queryLower = SearchQuery.ToLowerInvariant();
                var match = (a.FlightNumber?.ToLowerInvariant().Contains(queryLower) ?? false) ||
                            (a.FlightCode?.ToLowerInvariant().Contains(queryLower) ?? false) ||
                            (a.Route?.ToLowerInvariant().Contains(queryLower) ?? false) ||
                            (a.Origin?.ToLowerInvariant().Contains(queryLower) ?? false) ||
                            (a.Destination?.ToLowerInvariant().Contains(queryLower) ?? false) ||
                            (a.OriginName?.ToLowerInvariant().Contains(queryLower) ?? false) ||
                            (a.DestName?.ToLowerInvariant().Contains(queryLower) ?? false);
                if (!match) return false;
            }
            return true;
        }).ToList();

        // Agent bids for HighestBid
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

        // Sort
        IEnumerable<Auction> sorted = filtered;
        if (SelectedSort == "PRICE_HIGH")
        {
            sorted = sorted.OrderByDescending(a => a.CurrentPriceKg > 0 ? a.CurrentPriceKg : a.StartingPriceKg);
        }
        else if (SelectedSort == "CAPACITY_HIGH")
        {
            sorted = sorted.OrderByDescending(a => a.CapacityKg);
        }
        else // CLOSING_SOON
        {
            sorted = sorted.OrderBy(a => Util.ParseIso(a.EndTime)?.ToUnixTimeMilliseconds() ?? long.MaxValue);
        }

        var sortedList = sorted.ToList();
        TotalCount = sortedList.Count;
        TotalPages = (int)Math.Ceiling((double)TotalCount / PageSize);
        if (TotalPages < 1) TotalPages = 1;
        if (CurrentPage > TotalPages) CurrentPage = TotalPages;

        var paged = sortedList.Skip((CurrentPage - 1) * PageSize).Take(PageSize).ToList();

        Auctions = paged.Select(a =>
        {
            bidsByAuction.TryGetValue(a.Id, out var myBid);
            return new AuctionCardDto
            {
                Id = a.Id,
                FlightCode = a.FlightCode ?? $"#{a.Id}",
                FlightNumber = a.FlightNumber ?? "VU-000",
                Route = a.Route ?? $"{a.Origin}-{a.Destination}",
                Origin = a.Origin ?? "SGN",
                Destination = a.Destination ?? "HAN",
                OriginName = a.OriginName ?? a.Origin ?? "",
                DestName = a.DestName ?? a.Destination ?? "",
                Aircraft = a.Aircraft ?? "A321F",
                CapacityKg = a.CapacityKg > 0 ? a.CapacityKg : 3500,
                StartingPriceKg = a.StartingPriceKg > 0 ? a.StartingPriceKg : 18000,
                CurrentPriceKg = a.CurrentPriceKg > 0 ? a.CurrentPriceKg : a.StartingPriceKg,
                MinStep = a.MinStep > 0 ? a.MinStep : 500,
                Etd = a.Etd ?? "08:00",
                Eta = a.Eta ?? "10:15",
                CutOffTime = a.CutOffTime ?? "18:00",
                Warehouse = EntityJson.GetExtraString(a, "warehouse") ?? "Kho TCS - Tân Sơn Nhất",
                EndTime = a.EndTime ?? a.CloseDateIso ?? DateTime.UtcNow.AddHours(2).ToString("o"),
                CloseDate = a.CloseDate ?? "",
                OpenDate = a.OpenDate ?? "",
                Status = a.Status ?? "OPEN",
                BidsCount = a.BidsCount,
                LeadingAgentDisplay = "Đại lý ẩn danh (AG-***)",
                FlightPeriod = a.FlightPeriod,
                MyHighestBidPriceKg = myBid?.PriceKg,
                IsSubmitted = myBid != null
            };
        }).ToList();
    }

    public class RouteOption
    {
        public string Pair { get; set; } = "";
        public string Origin { get; set; } = "";
        public string Dest { get; set; } = "";
    }

    public class AuctionCardDto
    {
        public int Id { get; set; }
        public string FlightCode { get; set; } = "";
        public string FlightNumber { get; set; } = "";
        public string Route { get; set; } = "";
        public string Origin { get; set; } = "";
        public string Destination { get; set; } = "";
        public string OriginName { get; set; } = "";
        public string DestName { get; set; } = "";
        public string Aircraft { get; set; } = "";
        public long CapacityKg { get; set; }
        public long StartingPriceKg { get; set; }
        public long CurrentPriceKg { get; set; }
        public long MinStep { get; set; }
        public string Etd { get; set; } = "";
        public string Eta { get; set; } = "";
        public string CutOffTime { get; set; } = "";
        public string Warehouse { get; set; } = "";
        public string EndTime { get; set; } = "";
        public string CloseDate { get; set; } = "";
        public string OpenDate { get; set; } = "";
        public string Status { get; set; } = "OPEN";
        public int BidsCount { get; set; }
        public string LeadingAgentDisplay { get; set; } = "Đại lý ẩn danh (AG-***)";
        public string? FlightPeriod { get; set; }
        public long? MyHighestBidPriceKg { get; set; }
        public bool IsSubmitted { get; set; }
        public bool IsWatching { get; set; }
    }
}
