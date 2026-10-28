using BiddingCargo.Web.Data;
using BiddingCargo.Web.Endpoints;
using BiddingCargo.Web.Services;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// ---- Cơ sở dữ liệu: SQL Server
AppDbContext.BoolAsInt = DbInitializer.DetectBoolAsInt(builder.Configuration.GetConnectionString("DefaultConnection"));
builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection"), sql =>
    {
        sql.CommandTimeout(60);
        sql.EnableRetryOnFailure(maxRetryCount: 5, maxRetryDelay: TimeSpan.FromSeconds(5), errorNumbersToAdd: null);
    }));

builder.Services.AddScoped<SharedDataService>();
builder.Services.AddScoped<BidService>();
builder.Services.AddScoped<ChatService>();
builder.Services.AddScoped<LogService>();
builder.Services.AddScoped<EmailService>();
builder.Services.AddScoped<WonAuctionService>();
builder.Services.AddScoped<FlightUtilityService>();
builder.Services.AddScoped<AuthPermissionService>();
builder.Services.AddScoped<AuctionManagementService>();
builder.Services.AddScoped<RegistrationSecurityService>();
builder.Services.AddScoped<SettlementPaymentService>();
builder.Services.AddScoped<AdminRbacService>();
builder.Services.AddScoped<BankRouteService>();

builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = 50 * 1024 * 1024);
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 50 * 1024 * 1024);

// ---- Razor Pages với URL "sạch" cho toàn bộ các phân hệ Đại lý & Quản trị

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

// ---- Kiểm tra tài khoản đại lý bị khóa: tự động thu hồi phiên, xóa cookie và đá văng về trang đăng nhập
app.Use(async (ctx, next) =>
{
    var path = ctx.Request.Path.Value?.ToLowerInvariant() ?? "/";
    var isApi = path.StartsWith("/api/");

    // Bỏ qua trang login, register, home, admin, static files và endpoint kiểm tra trạng thái /api/agent/status
    var isAgentPage = path.StartsWith("/dashboard") ||
                      path.StartsWith("/auctions") || path.StartsWith("/auction") ||
                      path.StartsWith("/detail") ||
                      path.StartsWith("/watchlist") ||
                      path.StartsWith("/my-bids") || path.StartsWith("/bids") ||
                      path.StartsWith("/won") ||
                      path.StartsWith("/notifications") || path.StartsWith("/notification") ||
                      path.StartsWith("/profile");

    var isAgentApi = isApi && (path.StartsWith("/api/agent/") || path.StartsWith("/api/bids/")) && !path.StartsWith("/api/agent/status");

    if (isAgentPage || isAgentApi)
    {
        var agentCode = ctx.Request.Cookies["cargo_agent_code"]?.Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(agentCode) && isAgentApi)
        {
            agentCode = ctx.Request.Query["agentCode"].ToString()?.Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(agentCode))
                agentCode = ctx.Request.Query["code"].ToString()?.Trim().ToUpperInvariant();
        }

        if (!string.IsNullOrEmpty(agentCode))
        {
            var db = ctx.RequestServices.GetRequiredService<AppDbContext>();
            var agent = await db.Agents.AsNoTracking().FirstOrDefaultAsync(a => a.Code.ToUpper() == agentCode);
            if (agent != null)
            {
                ctx.Items["CurrentAgent"] = agent;
            }
            if (agent != null && (agent.IsLocked || agent.Status == "Đã khóa" || agent.Status == "LOCKED"))
            {
                ctx.Response.Cookies.Delete("cargo_agent_code");
                var reason = agent.LockedReason ?? "Tài khoản đại lý của bạn đã bị KHÓA bởi Quản trị viên hệ thống.";

                if (isApi)
                {
                    ctx.Response.StatusCode = 403;
                    ctx.Response.ContentType = "application/json; charset=utf-8";
                    await ctx.Response.WriteAsync(System.Text.Json.JsonSerializer.Serialize(new
                    {
                        success = false,
                        isLocked = true,
                        agentCode = agent.Code,
                        message = reason
                    }));
                    return;
                }
                else
                {
                    ctx.Response.Redirect($"/login?locked=1&code={Uri.EscapeDataString(agent.Code)}&reason={Uri.EscapeDataString(reason)}");
                    return;
                }
            }
        }
    }

    await next();
});

app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        // Cho phép trình duyệt cache tài nguyên tĩnh (JS/CSS/ảnh) kèm ETag/Last-Modified để chuyển trang mượt mà
        ctx.Context.Response.Headers.CacheControl = "public, max-age=3600";
    }
});

app.UseRouting();
app.MapRazorPages();
app.MapApi();

app.Run();

/// <summary>Bảng định tuyến trang (URL sạch và tương thích URL .html cũ).</summary>
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
