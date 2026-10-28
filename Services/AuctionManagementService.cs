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

    public AuctionManagementService(AppDbContext db, SharedDataService shared)
    {
        _db = db;
        _shared = shared;
    }

    public async Task<Auction> CreateAuctionAsync(JsonObject body, string? ip)
    {
        var fn = (EntityJson.Str(body, "flightNumber") ?? "").Trim().ToUpperInvariant();
        var origin = (EntityJson.Str(body, "origin") ?? "SGN").Trim().ToUpperInvariant();
        var dest = (EntityJson.Str(body, "destination") ?? "HAN").Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(fn))
            throw new ApiException("Vui lòng nhập số hiệu chuyến bay.");

        var maxId = await _db.Auctions.MaxAsync(a => (int?)a.Id) ?? 0;
        var nextId = maxId + 1;

        var auction = new Auction
        {
            Id = nextId,
            FlightNumber = fn,
            Origin = origin,
            Destination = dest,
            Route = EntityJson.Str(body, "route") ?? $"{origin} - {dest}",
            Status = EntityJson.Str(body, "status") ?? "OPEN"
        };

        EntityJson.Apply(auction, body);
        auction.Id = nextId;
        if (auction.CurrentPriceKg <= 0) auction.CurrentPriceKg = auction.StartingPriceKg;

        _db.Auctions.Add(auction);
        _db.ActivityLogs.Add(LogService.Make(
            EntityJson.Str(body, "createdBy") ?? "Admin", "admin", "ADMIN",
            "Phiên đấu giá", "Tạo phiên đấu giá mới", fn,
            $"Tạo mới phiên đấu giá chuyến bay {fn} ({auction.Route}), tải trọng {auction.CapacityKg} kg, giá khởi điểm {Util.FmtVi(auction.StartingPriceKg)}đ/kg.",
            ip, "Admin Portal"));

        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();
        SharedDataService.InvalidateSnapshotCache();
        return auction;
    }

    public async Task<Auction> UpdateAuctionAsync(int id, JsonObject body, string? ip)
    {
        var auction = await _db.Auctions.FindAsync(id)
            ?? throw new ApiException("Phiên đấu giá không tồn tại.", 404);

        if (auction.Status == "CLOSED" && !(EntityJson.Bool(body, "reopen") ?? false))
            throw new ApiException($"Không thể chỉnh sửa chuyến bay {auction.FlightNumber} vì phiên đấu giá đã đóng thầu.");

        EntityJson.Apply(auction, body);
        auction.Id = id;

        _db.ActivityLogs.Add(LogService.Make(
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

