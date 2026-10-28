using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;

namespace BiddingCargo.Web.Services;

/// <summary>
/// Dịch vụ C# quản lý Cấu hình Ngân hàng VietQR, tạo mã QR thanh toán và Đăng ký nhận thông báo tuyến bay
/// (thay thế store-routes-ui.js).
/// </summary>
public class BankRouteService
{
    private readonly AppDbContext _db;
    private readonly SharedDataService _shared;

    public BankRouteService(AppDbContext db, SharedDataService shared)
    {
        _db = db;
        _shared = shared;
    }

    public async Task<JsonObject> GetBankConfigAsync()
    {
        var cfg = await _shared.GetSettingAsync("bankConfig") as JsonObject;
        return cfg ?? new JsonObject
        {
            ["bankName"] = "",
            ["bankCode"] = "",
            ["bankBin"] = "970436",
            ["accountNumber"] = "",
            ["accountName"] = "CONG TY CP HANG KHONG VIETRAVEL",
            ["branch"] = "",
            ["memoPrefix"] = "CARGO"
        };
    }

    public async Task<JsonObject> UpdateBankConfigAsync(JsonObject cfg, string? ip)
    {
        await _shared.SetSettingAsync("bankConfig", cfg);
        _db.ActivityLogs.Add(LogService.Make(
            "Admin", "admin", "SUPER_ADMIN",
            "Cấu hình hệ thống", "Cập nhật ngân hàng VietQR", EntityJson.Str(cfg, "bankName") ?? "VietQR",
            $"Cập nhật tài khoản ngân hàng thụ hưởng VietQR: {EntityJson.Str(cfg, "bankName")} - STK: {EntityJson.Str(cfg, "accountNumber")}.",
            ip, "Admin Portal"));

        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();
        SharedDataService.InvalidateSnapshotCache();

        return new JsonObject
        {
            ["success"] = true,
            ["bankConfig"] = cfg,
            ["message"] = "Đã cập nhật thông tin tài khoản ngân hàng thụ hưởng thành công!"
        };
    }

    public async Task<string> GenerateVietQRUrlAsync(long amount, string? wonId, string? agentCode)
    {
        var cfg = await GetBankConfigAsync();
        var bin = Util.NullIfEmpty(EntityJson.Str(cfg, "bankBin")) ?? "970436";
        var acc = EntityJson.Str(cfg, "accountNumber") ?? "";
        var prefix = (Util.NullIfEmpty(EntityJson.Str(cfg, "memoPrefix")) ?? "CARGO").Trim().ToUpperInvariant();
        var memo = $"{prefix} {(wonId ?? "").Trim()} {(agentCode ?? "").Trim().ToUpperInvariant()}".Trim();
        var accName = Uri.EscapeDataString(Util.NullIfEmpty(EntityJson.Str(cfg, "accountName")) ?? "CONG TY CP HANG KHONG VIETRAVEL");
        var desc = Uri.EscapeDataString(memo);
        return $"https://img.vietqr.io/image/{bin}-{acc}-compact2.png?amount={Math.Max(0, amount)}&addInfo={desc}&accountName={accName}";
    }

    public async Task<JsonObject> SaveRouteSubscriptionsAsync(string? agentCode, JsonObject settings)
    {
        var code = (agentCode ?? "").Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(code))
            throw new ApiException("Thiếu mã đại lý.");

        var allSubs = (await _shared.GetSettingAsync("routeSubscriptions") as JsonObject) ?? new JsonObject();
        allSubs[code] = settings.DeepClone();
        await _shared.SetSettingAsync("routeSubscriptions", allSubs);
        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();
        SharedDataService.InvalidateSnapshotCache();

        return new JsonObject
        {
            ["success"] = true,
            ["settings"] = settings,
            ["message"] = "Đã lưu cài đặt thông báo tuyến bay thành công!"
        };
    }
}

