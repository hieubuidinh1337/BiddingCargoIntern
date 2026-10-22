using BiddingCargo.Web.Data;
using BiddingCargo.Web.Endpoints;
using BiddingCargo.Web.Services;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// ---- Cơ sở dữ liệu: SQL Server
AppDbContext.BoolAsInt = DbInitializer.DetectBoolAsInt(builder.Configuration.GetConnectionString("DefaultConnection"));
builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddScoped<SharedDataService>();
builder.Services.AddScoped<BidService>();
builder.Services.AddScoped<ChatService>();
builder.Services.AddScoped<LogService>();
builder.Services.AddScoped<EmailService>();
builder.Services.AddScoped<WonAuctionService>();

builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = 50 * 1024 * 1024);
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 50 * 1024 * 1024);

// ---- Razor Pages với URL "sạch" giống CLEAN_ROUTES của server.js

builder.Services.AddRazorPages(options =>
{
    foreach (var (page, routes) in PageRoutes.Map)
    {
        foreach (var route in routes)
        {
            if (route.Equals(page, StringComparison.OrdinalIgnoreCase))
                continue;

            options.Conventions.AddPageRoute(page, route);
        }
    }
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await DbInitializer.InitializeAsync(db, app.Logger);
}

if (!app.Environment.IsDevelopment()) app.UseExceptionHandler("/Error");

// ---- Tương thích URL cũ: /xx-Name.html → URL sạch, /admin/assets/* → /assets/*, bỏ dấu "/" cuối
app.Use(async (ctx, next) =>
{
    var path = ctx.Request.Path.Value ?? "/";
    if (path.StartsWith("/admin/assets/", StringComparison.OrdinalIgnoreCase))
    {
        ctx.Request.Path = path.Substring("/admin".Length);
        await next();
        return;
    }
    if (path.Length > 1 && path.EndsWith('/'))
    {
        ctx.Response.Redirect(path.TrimEnd('/') + ctx.Request.QueryString, permanent: true);
        return;
    }
    if (HttpMethods.IsGet(ctx.Request.Method) || HttpMethods.IsHead(ctx.Request.Method))
    {
        if (PageRoutes.LegacyHtml.TryGetValue(path.ToLowerInvariant(), out var clean))
        {
            ctx.Response.Redirect(clean + ctx.Request.QueryString);
            return;
        }
    }
    await next();
});

app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        // Giống bản Node: không cache để luôn lấy JS/CSS mới nhất
        ctx.Context.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
    }
});

app.UseRouting();
app.MapRazorPages();
app.MapApi();

app.Run();

/// <summary>Bảng route trang → tương đương CLEAN_ROUTES / REVERSE_ROUTES trong server.js.</summary>
public static class PageRoutes
{
    public static readonly (string Page, string[] Routes)[] Map =
    {
        ("/Home", new[] { "/", "/home" }),
        ("/Login", new[] { "/login" }),
        ("/Dashboard", new[] { "/dashboard" }),
        ("/Auctions", new[] { "/auctions", "/auction" }),
        ("/Detail", new[] { "/detail", "/auction-detail" }),
        ("/Watchlist", new[] { "/watchlist" }),
        ("/MyBids", new[] { "/my-bids", "/bids" }),
        ("/WonAuction", new[] { "/won", "/won-auction" }),
        ("/Notifications", new[] { "/notifications", "/notification" }),
        ("/NotificationDetail", new[] { "/notification-detail" }),
        ("/Profile", new[] { "/profile" }),
        ("/Terms", new[] { "/terms" }),
        ("/Register", new[] { "/register" }),
        ("/Admin/Login", new[] { "/admin", "/admin/login" }),
        ("/Admin/Dashboard", new[] { "/admin/dashboard" }),
        ("/Admin/Auctions", new[] { "/admin/auctions", "/admin/auction-list" }),
        ("/Admin/CreateAuction", new[] { "/admin/create-auction" }),
        ("/Admin/AuctionDetail", new[] { "/admin/auction-detail" }),
        ("/Admin/Agents", new[] { "/admin/agents", "/admin/agent-list" }),
        ("/Admin/Reports", new[] { "/admin/reports", "/admin/report" }),
        ("/Admin/Settings", new[] { "/admin/settings", "/admin/setting" }),
        ("/Admin/AgentDetail", new[] { "/admin/agent-detail" }),
        ("/Admin/AuditLogs", new[] { "/admin/audit-logs", "/admin/logs" }),
    };

    public static readonly Dictionary<string, string> LegacyHtml = new()
    {
        ["/00-home.html"] = "/home", ["/01-login.html"] = "/login", ["/02-dashboard.html"] = "/dashboard",
        ["/03-index.html"] = "/auctions", ["/04-detail.html"] = "/detail", ["/05-watchlist.html"] = "/watchlist",
        ["/06-mybids.html"] = "/my-bids", ["/07-wonauction.html"] = "/won-auction", ["/08-notifications.html"] = "/notifications",
        ["/11-notificationdetail.html"] = "/notification-detail", ["/09-profile.html"] = "/profile", ["/10-terms.html"] = "/terms",
        ["/register.html"] = "/register", ["/index.html"] = "/home",
        ["/admin/01-adminlogin.html"] = "/admin/login", ["/admin/02-admindashboard.html"] = "/admin/dashboard",
        ["/admin/03-auctionlist.html"] = "/admin/auctions", ["/admin/04-createauction.html"] = "/admin/create-auction",
        ["/admin/05-auctiondetail.html"] = "/admin/auction-detail", ["/admin/06-agentlist.html"] = "/admin/agents",
        ["/admin/07-reports.html"] = "/admin/reports", ["/admin/08-settings.html"] = "/admin/settings",
        ["/admin/09-agentdetail.html"] = "/admin/agent-detail", ["/admin/10-auditlogs.html"] = "/admin/audit-logs",
    };
}
