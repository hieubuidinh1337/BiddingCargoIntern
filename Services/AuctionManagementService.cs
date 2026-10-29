using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Services;

/// <summary>
/// Dịch vụ C# quản lý vòng đời phiên đấu giá: Tạo mới, Cập nhật, Xóa mềm, Hủy chuyến bay và lọc danh sách
/// (thay thế store-auctions-bidding.js).
/// </summary>
public class AuctionManagementService
{
    private readonly AppDbContext _db;
    private readonly SharedDataService _shared;
    private readonly LogService _logs;

    public AuctionManagementService(AppDbContext db, SharedDataService shared, LogService logs)
    {
        _db = db;
        _shared = shared;
        _logs = logs;
    }

    public async Task<Auction> CreateAuctionAsync(JsonObject body, string? ip)
    {
        var fn = (EntityJson.Str(body, "flightNumber") ?? "").Trim().ToUpperInvariant();
        var origin = (EntityJson.Str(body, "origin") ?? "SGN").Trim().ToUpperInvariant();
        var dest = (EntityJson.Str(body, "destination") ?? "HAN").Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(fn))
            throw new ApiException("Vui lòng nhập số hiệu chuyến bay.");

        await SharedDataService.Gate.WaitAsync();
        try
        {
            var clientId = (int?)EntityJson.Lng(body, "id");
            var flightCode = (EntityJson.Str(body, "flightCode") ?? "").Trim();

            Auction? existing = null;
            if (clientId.HasValue && clientId.Value > 0)
            {
                existing = await _db.Auctions.FindAsync(clientId.Value);
            }
            if (existing == null && !string.IsNullOrEmpty(flightCode))
            {
                existing = await _db.Auctions.FirstOrDefaultAsync(a => a.FlightCode == flightCode);
            }

            int targetId;
            Auction auction;
            if (existing != null)
            {
                auction = existing;
                targetId = existing.Id;
            }
            else
            {
                var maxId = await _db.Auctions.MaxAsync(a => (int?)a.Id) ?? 0;
                targetId = (clientId.HasValue && clientId.Value > maxId) ? clientId.Value : (maxId + 1);
                auction = new Auction
                {
                    Id = targetId,
                    FlightNumber = fn,
                    Origin = origin,
                    Destination = dest,
                    Route = EntityJson.Str(body, "route") ?? $"{origin} - {dest}",
                    Status = EntityJson.Str(body, "status") ?? "OPEN"
                };
                _db.Auctions.Add(auction);
            }

            EntityJson.Apply(auction, body);
            auction.Id = targetId;
            if (auction.CurrentPriceKg <= 0) auction.CurrentPriceKg = auction.StartingPriceKg;

            var validAgents = (await _db.Agents.AsNoTracking().Select(a => a.Code).ToListAsync())
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            if (string.IsNullOrWhiteSpace(auction.LeadingAgentCode) ||
                auction.LeadingAgentCode == "Chưa có" ||
                auction.LeadingAgentCode == "AG-***" ||
                !validAgents.Contains(auction.LeadingAgentCode.Trim()))
            {
                auction.LeadingAgentCode = null;
            }

            if (string.IsNullOrWhiteSpace(auction.WinnerAgentCode) ||
                auction.WinnerAgentCode == "Chưa có" ||
                auction.WinnerAgentCode == "AG-***" ||
                !validAgents.Contains(auction.WinnerAgentCode.Trim()))
            {
                auction.WinnerAgentCode = null;
            }

            if (existing == null)
            {
                await _logs.AddOrUpdateAsync(LogService.Make(
                    EntityJson.Str(body, "createdBy") ?? "Admin", "admin", "ADMIN",
                    "Phiên đấu giá", "Tạo mới phiên đấu giá", fn,
                    $"Tạo mới phiên đấu giá chuyến bay {fn} ({auction.Route}), tải trọng {auction.CapacityKg} kg, giá khởi điểm {Util.FmtVi(auction.StartingPriceKg)}đ/kg.",
                    ip, "Admin Portal"));
            }

            await _shared.BumpVersionAsync();
            await _db.SaveChangesAsync();
            SharedDataService.InvalidateSnapshotCache();
            return auction;
        }
        finally
        {
            SharedDataService.Gate.Release();
        }
    }

    public async Task<Auction> UpdateAuctionAsync(int id, JsonObject body, string? ip)
    {
        var auction = await _db.Auctions.FindAsync(id)
            ?? throw new ApiException("Phiên đấu giá không tồn tại.", 404);

        if (auction.Status == "CLOSED" && !(EntityJson.Bool(body, "reopen") ?? false))
            throw new ApiException($"Không thể chỉnh sửa chuyến bay {auction.FlightNumber} vì phiên đấu giá đã đóng thầu.");

        EntityJson.Apply(auction, body);
        auction.Id = id;

        await _logs.AddOrUpdateAsync(LogService.Make(
            EntityJson.Str(body, "updatedBy") ?? "Admin", "admin", "ADMIN",
            "Phiên đấu giá", "Cập nhật phiên đấu giá", auction.FlightNumber ?? $"#{id}",
            $"Cập nhật thông tin phiên đấu giá chuyến bay {auction.FlightNumber} ({auction.Route}).",
            ip, "Admin Portal"));

        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();
        SharedDataService.InvalidateSnapshotCache();
        return auction;
    }
}

