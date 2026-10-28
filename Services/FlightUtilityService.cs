using System.Globalization;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using BiddingCargo.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Services;

/// <summary>
/// Dịch vụ C# xử lý tính toán thời gian bay, giờ Cut-off kho, hạn thanh toán, sinh số hiệu chuyến bay (VU)
/// và quản lý danh mục Sân bay / Tàu bay mặc định (thay thế store-seeds-utils.js).
/// </summary>
public class FlightUtilityService
{
    private readonly AppDbContext _db;

    public FlightUtilityService(AppDbContext db)
    {
        _db = db;
    }

    public static readonly IReadOnlyDictionary<string, int> RouteDurationsMinutes = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
    {
        ["SGN-HAN"] = 135, ["HAN-SGN"] = 135,
        ["SGN-DAD"] = 80,  ["DAD-SGN"] = 80,
        ["HAN-DAD"] = 80,  ["DAD-HAN"] = 80,
        ["SGN-PQC"] = 60,  ["PQC-SGN"] = 60,
        ["HAN-PQC"] = 135, ["PQC-HAN"] = 135,
        ["DAD-PQC"] = 105, ["PQC-DAD"] = 105,
        ["SGN-CXR"] = 60,  ["CXR-SGN"] = 60,
        ["HAN-CXR"] = 115, ["CXR-HAN"] = 115,
        ["SGN-DLI"] = 50,  ["DLI-SGN"] = 50,
        ["HAN-DLI"] = 115, ["DLI-HAN"] = 115,
        ["SGN-HPH"] = 120, ["HPH-SGN"] = 120,
        ["SGN-HUI"] = 85,  ["HUI-SGN"] = 85,
        ["HAN-HUI"] = 70,  ["HUI-HAN"] = 70,
        ["SGN-UIH"] = 70,  ["UIH-SGN"] = 70,
        ["HAN-UIH"] = 95,  ["UIH-HAN"] = 95,
        ["SGN-VII"] = 105, ["VII-SGN"] = 105,
        ["HAN-VII"] = 60,  ["VII-HAN"] = 60,
        ["SGN-VCA"] = 45,  ["VCA-SGN"] = 45,
        ["HAN-VCA"] = 130, ["VCA-HAN"] = 130,
        ["SGN-VDO"] = 135, ["VDO-SGN"] = 135,
        ["DAD-CXR"] = 65,  ["CXR-DAD"] = 65
    };

    private static readonly IReadOnlyDictionary<string, int[]> RouteFlightPools = new Dictionary<string, int[]>(StringComparer.OrdinalIgnoreCase)
    {
        ["SGN-HAN"] = new[] { 130, 132, 134, 136, 138, 140, 142, 144, 146, 148 },
        ["HAN-SGN"] = new[] { 131, 133, 135, 137, 139, 141, 143, 145, 147, 149 },
        ["SGN-DAD"] = new[] { 220, 222, 224, 226, 228, 230, 232, 234 },
        ["DAD-SGN"] = new[] { 221, 223, 225, 227, 229, 231, 233, 235 },
        ["HAN-DAD"] = new[] { 260, 262, 264, 266, 268, 270 },
        ["DAD-HAN"] = new[] { 261, 263, 265, 267, 269, 271 },
        ["HAN-PQC"] = new[] { 340, 342, 344, 346, 348 },
        ["PQC-HAN"] = new[] { 341, 343, 345, 347, 349 },
        ["SGN-PQC"] = new[] { 450, 452, 454, 456, 458 },
        ["PQC-SGN"] = new[] { 451, 453, 455, 457, 459 },
        ["DAD-PQC"] = new[] { 510, 512, 514, 516 },
        ["PQC-DAD"] = new[] { 511, 513, 515, 517 },
        ["SGN-CXR"] = new[] { 620, 622, 624, 626 },
        ["CXR-SGN"] = new[] { 621, 623, 625, 627 },
        ["HAN-CXR"] = new[] { 640, 642, 644, 646 },
        ["CXR-HAN"] = new[] { 641, 643, 645, 647 },
        ["SGN-DLI"] = new[] { 710, 712, 714 },
        ["DLI-SGN"] = new[] { 711, 713, 715 },
        ["HAN-DLI"] = new[] { 730, 732, 734 },
        ["DLI-HAN"] = new[] { 731, 733, 735 },
        ["SGN-VII"] = new[] { 810, 812, 814 },
        ["VII-SGN"] = new[] { 811, 813, 815 },
        ["SGN-HPH"] = new[] { 830, 832, 834 },
        ["HPH-SGN"] = new[] { 831, 833, 835 },
        ["SGN-HUI"] = new[] { 850, 852, 854 },
        ["HUI-SGN"] = new[] { 851, 853, 855 },
        ["SGN-UIH"] = new[] { 870, 872, 874 },
        ["UIH-SGN"] = new[] { 871, 873, 875 },
        ["SGN-VCA"] = new[] { 890, 892, 894 },
        ["VCA-SGN"] = new[] { 891, 893, 895 },
        ["SGN-VDO"] = new[] { 910, 912, 914 },
        ["VDO-SGN"] = new[] { 911, 913, 915 }
    };

    public static int GetFlightDurationMinutes(string? origin, string? destination)
    {
        if (string.IsNullOrWhiteSpace(origin) || string.IsNullOrWhiteSpace(destination)) return 90;
        var key = $"{origin.Trim().ToUpperInvariant()}-{destination.Trim().ToUpperInvariant()}";
        return RouteDurationsMinutes.TryGetValue(key, out var mins) ? mins : 90;
    }

    public static DateTime? CalculateETA(string? etdStr, string? origin, string? destination)
    {
        var etd = Util.ParseFlightDate(etdStr);
        if (etd == null) return null;
        return etd.Value.AddMinutes(GetFlightDurationMinutes(origin, destination));
    }

    public static string CalculateCutOffTime(string? etdStr, int offsetHours = 3)
    {
        if (string.IsNullOrWhiteSpace(etdStr)) return $"Trước ETD {offsetHours} giờ";
        var dt = Util.ParseFlightDate(etdStr);
        if (dt == null) return $"Trước ETD {offsetHours} giờ";
        var cut = dt.Value.AddHours(-offsetHours);
        return $"{cut:HH:mm} · {cut:dd/MM/yyyy} (Trước ETD {offsetHours}h)";
    }

    public static string CalculatePaymentDeadline(Auction? auction, DateTimeOffset? baseTime = null)
    {
        var baseMs = (baseTime ?? Util.ParseIso(auction?.EndTime) ?? DateTimeOffset.UtcNow).ToUnixTimeMilliseconds();
        var default24hMs = baseMs + 24L * 3600 * 1000;
        if (auction == null) return DateTimeOffset.FromUnixTimeMilliseconds(default24hMs).ToString("o");

        DateTimeOffset? etd = Util.ParseIso(auction.EtdIso);
        if (etd == null && !string.IsNullOrEmpty(auction.Etd))
        {
            var parsed = Util.ParseFlightDate(auction.Etd);
            if (parsed != null) etd = new DateTimeOffset(parsed.Value);
        }

        if (etd != null)
        {
            var cutOffMs = etd.Value.ToUnixTimeMilliseconds() - 3L * 3600 * 1000;
            if (cutOffMs > baseMs + 2L * 3600 * 1000)
            {
                var effectiveMs = Math.Min(cutOffMs, default24hMs);
                return DateTimeOffset.FromUnixTimeMilliseconds(effectiveMs).ToString("o");
            }
        }

        return DateTimeOffset.FromUnixTimeMilliseconds(default24hMs).ToString("o");
    }

    public async Task<string> GenerateNextFlightNumberAsync(string origin = "SGN", string destination = "HAN")
    {
        var auctionFlights = await _db.Auctions.AsNoTracking()
            .Where(a => a.FlightNumber != null)
            .Select(a => a.FlightNumber!.Trim().ToUpper())
            .ToListAsync();
        var wonFlights = await _db.WonAuctions.AsNoTracking()
            .Where(w => w.FlightNumber != null)
            .Select(w => w.FlightNumber!.Trim().ToUpper())
            .ToListAsync();

        var existing = new HashSet<string>(auctionFlights.Concat(wonFlights), StringComparer.OrdinalIgnoreCase);
        var pair = $"{origin.Trim().ToUpperInvariant()}-{destination.Trim().ToUpperInvariant()}";
        var defaultCandidates = new[] { 610, 612, 614, 616, 618, 620, 622, 624, 626, 628, 630, 632, 634, 636, 638, 640 };
        var candidates = RouteFlightPools.TryGetValue(pair, out var pool) ? pool : defaultCandidates;
        var available = candidates.Where(num => !existing.Contains($"VU{num}")).ToList();

        if (available.Count > 0)
        {
            return $"VU{available[Random.Shared.Next(available.Count)]}";
        }

        bool isEven = candidates[0] % 2 == 0;
        int randomNum = Random.Shared.Next(0, 400) * 2 + (isEven ? 100 : 101);
        int attempts = 0;
        while (existing.Contains($"VU{randomNum}") && attempts < 500)
        {
            randomNum = Random.Shared.Next(0, 400) * 2 + (isEven ? 100 : 101);
            attempts++;
        }
        return $"VU{randomNum}";
    }

    public async Task<JsonObject> CheckDuplicateFlightNumberAsync(string? flightNumber, int? excludeAuctionId = null)
    {
        var fn = (flightNumber ?? "").Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(fn))
            return new JsonObject { ["isDuplicate"] = false };

        var active = await _db.Auctions.AsNoTracking().FirstOrDefaultAsync(a =>
            a.FlightNumber != null && a.FlightNumber.ToUpper() == fn &&
            (a.Status == "OPEN" || a.Status == "UPCOMING") &&
            (excludeAuctionId == null || a.Id != excludeAuctionId.Value));

        if (active != null)
        {
            return new JsonObject
            {
                ["isDuplicate"] = true,
                ["reason"] = "ACTIVE_OPEN",
                ["message"] = $"Chuyến bay {fn} hiện đang có một phiên đấu giá ĐANG MỞ ({active.FlightCode}, tuyến {active.Route})."
            };
        }

        return new JsonObject { ["isDuplicate"] = false };
    }
}

