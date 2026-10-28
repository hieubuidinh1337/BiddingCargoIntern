using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;
using BiddingCargo.Web.Services;
using Microsoft.EntityFrameworkCore;
using static BiddingCargo.Web.Endpoints.ApiEndpoints;

namespace BiddingCargo.Web.Endpoints;

/// <summary>Các API chuyên biệt cho Portal Quản trị viên (Admin Dashboard & điều hành).</summary>
public static class AdminPortalEndpoints
{
    public static void MapAdminPortalEndpoints(this RouteGroupBuilder api, ILogger log)
    {
        api.MapGet("/admin/dashboard", async (HttpContext ctx, AppDbContext db) =>
        {
            var totalAuctions = await db.Auctions.CountAsync();
            var activeAuctions = await db.Auctions.CountAsync(a => a.Status == "OPEN");
            var totalBids = await db.Bids.CountAsync();
            var totalAgents = await db.Agents.CountAsync(a => !a.IsLocked && a.Status != "Đã khóa");

            var totalRevenue = await db.WonAuctions.AsNoTracking()
                .Where(w => w.PaymentStatus == "PAID")
                .SumAsync(w => (long?)w.TotalAmountVND) ?? 0L;

            var recentAuctions = await db.Auctions.AsNoTracking()
                .OrderByDescending(a => a.Id)
                .Take(5)
                .ToListAsync();

            var recentBids = await db.Bids.AsNoTracking()
                .OrderByDescending(b => b.Timestamp)
                .Take(6)
                .ToListAsync();

            var recentAuctionsArr = new JsonArray();
            foreach (var a in recentAuctions)
            {
                recentAuctionsArr.Add(new JsonObject
                {
                    ["id"] = a.Id,
                    ["flightNumber"] = a.FlightNumber ?? "VU-000",
                    ["route"] = a.Route ?? $"{a.Origin}-{a.Destination}",
                    ["status"] = a.Status ?? "OPEN",
                    ["currentPriceKg"] = a.CurrentPriceKg > 0 ? a.CurrentPriceKg : a.StartingPriceKg,
                    ["bidsCount"] = a.BidsCount,
                    ["endTime"] = a.EndTime ?? ""
                });
            }

            var recentBidsArr = new JsonArray();
            foreach (var b in recentBids)
            {
                recentBidsArr.Add(new JsonObject
                {
                    ["id"] = b.Id,
                    ["auctionId"] = b.AuctionId,
                    ["agentCode"] = b.AgentCode ?? "AG-***",
                    ["priceKg"] = b.PriceKg,
                    ["time"] = b.Time ?? "",
                    ["status"] = b.Status ?? "RECEIVED"
                });
            }

            ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            return J(new JsonObject
            {
                ["success"] = true,
                ["stats"] = new JsonObject
                {
                    ["totalAuctions"] = totalAuctions,
                    ["activeAuctions"] = activeAuctions,
                    ["totalBids"] = totalBids,
                    ["totalAgents"] = totalAgents,
                    ["totalRevenue"] = totalRevenue
                },
                ["recentAuctions"] = recentAuctionsArr,
                ["recentBids"] = recentBidsArr
            });
        });

        // ---- Xóa mềm phiên đấu giá
        api.MapPost("/admin/auctions/delete", (HttpContext ctx, AppDbContext db, SharedDataService shared) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            var id = (int)(EntityJson.Lng(b, "id") ?? 0);
            if (id <= 0) return Err("Thiếu mã phiên đấu giá");

            var auction = await db.Auctions.FindAsync(id);
            if (auction == null) return Err("Phiên đấu giá không tồn tại.", 404);

            var bidsCount = await db.Bids.CountAsync(x => x.AuctionId == id);
            if (bidsCount > 0)
            {
                return J(new JsonObject
                {
                    ["success"] = false,
                    ["shouldCancel"] = true,
                    ["message"] = $"Phiên chuyến bay {auction.FlightNumber} đã có {bidsCount} lượt đặt giá. Không thể xóa – vui lòng sử dụng chức năng Hủy chuyến bay."
                });
            }

            auction.Status = "DELETED";
            EntityJson.SetExtra(auction, "deletedAt", DateTime.UtcNow.ToString("o"));
            await shared.BumpVersionAsync();
            await db.SaveChangesAsync();
            SharedDataService.InvalidateSnapshotCache();

            return J(new JsonObject
            {
                ["success"] = true,
                ["message"] = $"Đã xóa phiên đấu giá chuyến bay {auction.FlightNumber} thành công."
            });
        }, log));

        // ---- Hủy phiên đấu giá
        api.MapPost("/admin/auctions/cancel", (HttpContext ctx, AppDbContext db, SharedDataService shared) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            var id = (int)(EntityJson.Lng(b, "id") ?? 0);
            var reason = (EntityJson.Str(b, "reason") ?? "").Trim();
            var refundNote = (EntityJson.Str(b, "refundNote") ?? "").Trim();
            if (id <= 0 || string.IsNullOrEmpty(reason)) return Err("Thiếu mã phiên hoặc lý do hủy chuyến bay!");

            var auction = await db.Auctions.FindAsync(id);
            if (auction == null) return Err("Phiên đấu giá không tồn tại.", 404);

            var cancelledAt = DateTime.UtcNow.ToString("o");
            var finalRefundNote = string.IsNullOrEmpty(refundNote) ? "Hoàn tiền 100% trong vòng 3-5 ngày làm việc." : refundNote;
            var refundAmount = (auction.WinningPriceKg > 0 ? auction.WinningPriceKg : auction.CurrentPriceKg) * auction.CapacityKg;

            auction.Status = "CANCELLED";
            EntityJson.SetExtra(auction, "cancelledAt", cancelledAt);
            EntityJson.SetExtra(auction, "cancellationReason", reason);
            EntityJson.SetExtra(auction, "refundNote", finalRefundNote);
            EntityJson.SetExtra(auction, "refundAmount", refundAmount);

            var won = await db.WonAuctions.FirstOrDefaultAsync(w => w.AuctionId == id);
            if (won != null)
            {
                var wasPaid = won.PaymentStatus is "PAID" or "PAID_LATE";
                EntityJson.SetExtra(won, "cancelledAt", cancelledAt);
                EntityJson.SetExtra(won, "cancellationReason", reason);
                EntityJson.SetExtra(won, "adminCancelRefundNote", finalRefundNote);
                won.PaymentStatus = wasPaid ? "CANCELLED_AFTER_PAYMENT" : "CANCELLED";
            }

            await shared.BumpVersionAsync();
            await db.SaveChangesAsync();
            SharedDataService.InvalidateSnapshotCache();

            return J(new JsonObject
            {
                ["success"] = true,
                ["message"] = $"Đã hủy chuyến bay {auction.FlightNumber} thành công."
            });
        }, log));

        // ---- Tạo mới & Cập nhật phiên đấu giá (AuctionManagementService)
        api.MapPost("/admin/auctions/create", (HttpContext ctx, AuctionManagementService svc) => Guard(async () =>
        {
            var a = await svc.CreateAuctionAsync(await BodyAsync(ctx.Request), ctx.Connection.RemoteIpAddress?.ToString());
            return J(new JsonObject { ["success"] = true, ["auction"] = EntityJson.ToNode(a) });
        }, log));

        api.MapPost("/admin/auctions/update", (HttpContext ctx, AuctionManagementService svc) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            var id = (int)(EntityJson.Lng(b, "id") ?? 0);
            var a = await svc.UpdateAuctionAsync(id, b, ctx.Connection.RemoteIpAddress?.ToString());
            return J(new JsonObject { ["success"] = true, ["auction"] = EntityJson.ToNode(a) });
        }, log));

        // ---- Chốt phiên & Đối soát Thanh toán (SettlementPaymentService)
        api.MapPost("/admin/auctions/close", (HttpContext ctx, SettlementPaymentService svc) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            var id = (int)(EntityJson.Lng(b, "id") ?? EntityJson.Lng(b, "auctionId") ?? 0);
            return J(await svc.CloseAuctionAsync(id, EntityJson.Str(b, "closedBy"), ctx.Connection.RemoteIpAddress?.ToString()));
        }, log));

        api.MapPost("/admin/wonauction/confirm-payment", (HttpContext ctx, SettlementPaymentService svc) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            return J(await svc.ConfirmPaymentAsync(EntityJson.Str(b, "wonId"), EntityJson.Str(b, "confirmedBy"), ctx.Connection.RemoteIpAddress?.ToString()));
        }, log));

        api.MapPost("/admin/wonauction/reject-payment", (HttpContext ctx, SettlementPaymentService svc) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            return J(await svc.RejectPaymentAsync(EntityJson.Str(b, "wonId"), EntityJson.Str(b, "reason"), EntityJson.Str(b, "rejectedBy"), ctx.Connection.RemoteIpAddress?.ToString()));
        }, log));

        // ---- Phân quyền RBAC, Nhân sự & Cấu hình (AdminRbacService & BankRouteService)
        api.MapGet("/admin/roles", (AdminRbacService svc) => Guard(async () =>
            J(new JsonObject { ["success"] = true, ["roles"] = await svc.GetRolesAsync() }), log));

        api.MapPost("/admin/roles/save", (HttpContext ctx, AdminRbacService svc) => Guard(async () =>
            J(await svc.CreateOrUpdateRoleAsync(await BodyAsync(ctx.Request), ctx.Connection.RemoteIpAddress?.ToString())), log));

        api.MapPost("/admin/roles/delete", (HttpContext ctx, AdminRbacService svc) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            return J(await svc.DeleteRoleAsync(EntityJson.Str(b, "id"), ctx.Connection.RemoteIpAddress?.ToString()));
        }, log));

        api.MapPost("/admin/staff/save", (HttpContext ctx, AdminRbacService svc) => Guard(async () =>
            J(await svc.SaveStaffAccountAsync(await BodyAsync(ctx.Request), ctx.Connection.RemoteIpAddress?.ToString())), log));

        api.MapPost("/admin/staff/delete", (HttpContext ctx, AdminRbacService svc) => Guard(async () =>
        {
            var b = await BodyAsync(ctx.Request);
            return J(await svc.DeleteStaffAccountAsync(EntityJson.Str(b, "username"), ctx.Connection.RemoteIpAddress?.ToString()));
        }, log));

        api.MapPost("/admin/settings/save", (HttpContext ctx, AdminRbacService svc) => Guard(async () =>
            J(await svc.UpdateSystemSettingsAsync(await BodyAsync(ctx.Request), ctx.Connection.RemoteIpAddress?.ToString())), log));

        api.MapGet("/admin/bank-config", (BankRouteService svc) => Guard(async () =>
            J(new JsonObject { ["success"] = true, ["bankConfig"] = await svc.GetBankConfigAsync() }), log));

        api.MapPost("/admin/bank-config", (HttpContext ctx, BankRouteService svc) => Guard(async () =>
            J(await svc.UpdateBankConfigAsync(await BodyAsync(ctx.Request), ctx.Connection.RemoteIpAddress?.ToString())), log));

        api.MapGet("/admin/flights/next-number", (HttpContext ctx, FlightUtilityService svc) => Guard(async () =>
        {
            var orig = ctx.Request.Query["origin"].ToString();
            var dest = ctx.Request.Query["destination"].ToString();
            var fn = await svc.GenerateNextFlightNumberAsync(string.IsNullOrEmpty(orig) ? "SGN" : orig, string.IsNullOrEmpty(dest) ? "HAN" : dest);
            return J(new JsonObject { ["success"] = true, ["flightNumber"] = fn });
        }, log));
    }
}
