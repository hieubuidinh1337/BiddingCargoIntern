using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Services;

/// <summary>
/// Dịch vụ C# quản lý Ma trận phân quyền hạt nhân (RBAC Permission Matrix) và kiểm tra quyền hạn nhân sự
/// (thay thế store-auth-permissions.js).
/// </summary>
public class AuthPermissionService
{
    private readonly AppDbContext _db;
    private readonly SharedDataService _shared;

    public AuthPermissionService(AppDbContext db, SharedDataService shared)
    {
        _db = db;
        _shared = shared;
    }

    public static readonly string[] AllPermissionKeys =
    {
        "registrations.view",
        "registrations.approve_reject",
        "auctions.view",
        "auctions.create",
        "auctions.edit",
        "auctions.remove",
        "auctions.close",
        "auctions.settle_select_winner",
        "agents.view",
        "agents.lock",
        "staff.view",
        "staff.create",
        "staff.edit",
        "staff.remove"
    };

    public async Task<IReadOnlyList<string>> GetAdminPermissionsAsync(string? usernameOrRole)
    {
        var key = (usernameOrRole ?? "").Trim();
        if (string.IsNullOrEmpty(key)) return Array.Empty<string>();

        if (key.Equals("admin", StringComparison.OrdinalIgnoreCase) ||
            key.Equals("SUPER_ADMIN", StringComparison.OrdinalIgnoreCase) ||
            key.Equals("ITD_ADMIN", StringComparison.OrdinalIgnoreCase))
        {
            return AllPermissionKeys;
        }

        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u =>
            (u.Username != null && u.Username.ToLower() == key.ToLower()) ||
            (u.Role != null && u.Role.ToUpper() == key.ToUpper()));

        var roleCode = (user?.Role ?? key).Trim().ToUpperInvariant();
        if (roleCode is "SUPER_ADMIN" or "ITD_ADMIN" or "ADMIN")
            return AllPermissionKeys;

        var rolesNode = await _shared.GetSettingAsync("rolesList");
        if (rolesNode is JsonArray rolesArr)
        {
            foreach (var item in rolesArr)
            {
                if (item is not JsonObject rObj) continue;
                var rCode = (EntityJson.Str(rObj, "code") ?? EntityJson.Str(rObj, "id") ?? "").Trim().ToUpperInvariant();
                if (rCode == roleCode && rObj["permissions"] is JsonArray permsArr)
                {
                    return permsArr.Select(EntityJson.NodeStr).Where(s => !string.IsNullOrEmpty(s)).Select(s => s!).ToList();
                }
            }
        }

        return roleCode switch
        {
            "COD_MANAGER" or "COD_ADMIN" => new[]
            {
                "registrations.view", "registrations.approve_reject",
                "auctions.view", "auctions.create", "auctions.edit", "auctions.close", "auctions.settle_select_winner",
                "agents.view"
            },
            "SETTLEMENT_OFFICER" or "AUCTION_SETTLEMENT" => new[]
            {
                "auctions.view", "auctions.close", "auctions.settle_select_winner"
            },
            "AGENT_AUDITOR" => new[]
            {
                "registrations.view", "registrations.approve_reject", "agents.view", "agents.lock"
            },
            _ => new[] { "registrations.view", "auctions.view", "agents.view", "staff.view" }
        };
    }

    public async Task<bool> HasPermissionAsync(string? usernameOrRole, string permissionKey)
    {
        var perms = await GetAdminPermissionsAsync(usernameOrRole);
        return perms.Contains(permissionKey, StringComparer.OrdinalIgnoreCase);
    }
}
