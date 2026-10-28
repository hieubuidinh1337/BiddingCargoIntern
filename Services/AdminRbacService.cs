using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Services;

/// <summary>
/// Dịch vụ C# quản lý Phân quyền RBAC (Vai trò, Tài khoản Nhân sự nội bộ) và Cấu hình hệ thống
/// (thay thế store-admin-rbac.js).
/// </summary>
public class AdminRbacService
{
    private readonly AppDbContext _db;
    private readonly SharedDataService _shared;

    public AdminRbacService(AppDbContext db, SharedDataService shared)
    {
        _db = db;
        _shared = shared;
    }

    public async Task<JsonArray> GetRolesAsync()
    {
        var rolesNode = await _shared.GetSettingAsync("rolesList");
        return rolesNode as JsonArray ?? new JsonArray();
    }

    public async Task<JsonObject> CreateOrUpdateRoleAsync(JsonObject roleData, string? ip)
    {
        var id = EntityJson.Str(roleData, "id") ?? EntityJson.Str(roleData, "code") ?? $"role_{Util.NowMs()}";
        var name = (EntityJson.Str(roleData, "name") ?? "").Trim();
        if (string.IsNullOrEmpty(name))
            throw new ApiException("Tên vai trò không được để trống.");

        var rolesArr = await GetRolesAsync();
        bool isNew = true;
        JsonObject? targetRole = null;

        foreach (var item in rolesArr)
        {
            if (item is JsonObject obj &&
                (string.Equals(EntityJson.Str(obj, "id"), id, StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(EntityJson.Str(obj, "code"), id, StringComparison.OrdinalIgnoreCase)))
            {
                targetRole = obj;
                isNew = false;
                break;
            }
        }

        if (targetRole == null)
        {
            targetRole = (JsonObject)roleData.DeepClone();
            targetRole["id"] = id;
            targetRole["name"] = name;
            rolesArr.Add(targetRole);
        }
        else
        {
            foreach (var kv in roleData)
                targetRole[kv.Key] = kv.Value?.DeepClone();
            targetRole["id"] = id;
            targetRole["name"] = name;
        }

        await _shared.SetSettingAsync("rolesList", rolesArr);
        _db.ActivityLogs.Add(LogService.Make(
            "Admin", "admin", "SUPER_ADMIN",
            "Phân quyền", isNew ? "Tạo vai trò mới" : "Cập nhật vai trò", name,
            $"{(isNew ? "Tạo mới" : "Cập nhật")} vai trò [{name}] ({id}).", ip, "Admin Portal"));

        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();
        SharedDataService.InvalidateSnapshotCache();

        return new JsonObject
        {
            ["success"] = true,
            ["role"] = targetRole,
            ["message"] = $"Đã lưu vai trò \"{name}\" thành công!"
        };
    }

    public async Task<JsonObject> DeleteRoleAsync(string? id, string? ip)
    {
        if (string.IsNullOrEmpty(id)) throw new ApiException("Thiếu mã vai trò.");
        var rolesArr = await GetRolesAsync();
        JsonObject? found = null;
        int idx = -1;

        for (int i = 0; i < rolesArr.Count; i++)
        {
            if (rolesArr[i] is JsonObject obj &&
                (string.Equals(EntityJson.Str(obj, "id"), id, StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(EntityJson.Str(obj, "code"), id, StringComparison.OrdinalIgnoreCase)))
            {
                found = obj;
                idx = i;
                break;
            }
        }

        if (found == null || idx < 0)
            throw new ApiException("Không tìm thấy vai trò cần xóa.", 404);

        if (EntityJson.Bool(found, "isSystem") == true)
            throw new ApiException($"Vai trò \"{EntityJson.Str(found, "name")}\" là vai trò hệ thống, không thể xóa!");

        var roleName = EntityJson.Str(found, "name") ?? id;
        rolesArr.RemoveAt(idx);
        await _shared.SetSettingAsync("rolesList", rolesArr);

        _db.ActivityLogs.Add(LogService.Make(
            "Admin", "admin", "SUPER_ADMIN",
            "Phân quyền", "Xóa vai trò", roleName,
            $"Đã xóa vai trò [{roleName}] khỏi hệ thống.", ip, "Admin Portal"));

        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();
        SharedDataService.InvalidateSnapshotCache();

        return new JsonObject
        {
            ["success"] = true,
            ["message"] = $"Đã xóa vai trò \"{roleName}\" thành công!"
        };
    }

    public async Task<JsonObject> SaveStaffAccountAsync(JsonObject staffData, string? ip)
    {
        var username = (EntityJson.Str(staffData, "username") ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(username))
            throw new ApiException("Tên đăng nhập không được để trống.");

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username != null && u.Username.ToLower() == username);
        bool isNew = user == null;
        if (user == null)
        {
            user = new AppUser
            {
                Id = EntityJson.Str(staffData, "id") ?? $"USR-{Util.NowMs()}",
                Username = username,
                Password = EntityJson.Str(staffData, "password") ?? "123456"
            };
            _db.Users.Add(user);
        }

        EntityJson.Apply(user, staffData);
        user.Username = username;

        _db.ActivityLogs.Add(LogService.Make(
            "Admin", "admin", "SUPER_ADMIN",
            "Tài khoản", isNew ? "Tạo tài khoản Nhân viên" : "Cập nhật tài khoản Nhân viên", username,
            $"{(isNew ? "Tạo mới" : "Cập nhật")} tài khoản nhân sự @{username} ({user.FullName}).", ip, "Admin Portal"));

        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();
        SharedDataService.InvalidateSnapshotCache();

        return new JsonObject
        {
            ["success"] = true,
            ["staff"] = EntityJson.ToNode(user),
            ["message"] = $"Đã lưu tài khoản nhân sự \"{username}\" thành công!"
        };
    }

    public async Task<JsonObject> DeleteStaffAccountAsync(string? username, string? ip)
    {
        var u = (username ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(u)) throw new ApiException("Thiếu tên đăng nhập.");
        if (u == "admin") throw new ApiException("Không thể xóa tài khoản Super Admin mặc định!");

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Username != null && x.Username.ToLower() == u)
            ?? throw new ApiException("Không tìm thấy tài khoản nhân sự.", 404);

        _db.Users.Remove(user);
        _db.ActivityLogs.Add(LogService.Make(
            "Admin", "admin", "SUPER_ADMIN",
            "Tài khoản", "Xóa tài khoản Nhân viên", u,
            $"Đã xóa tài khoản nhân sự @{u} ({user.FullName}).", ip, "Admin Portal"));

        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();
        SharedDataService.InvalidateSnapshotCache();

        return new JsonObject
        {
            ["success"] = true,
            ["message"] = $"Đã xóa tài khoản nhân sự \"{u}\" thành công!"
        };
    }

    public async Task<JsonObject> UpdateSystemSettingsAsync(JsonObject settings, string? ip)
    {
        await _shared.SetSettingAsync("settings", settings);
        _db.ActivityLogs.Add(LogService.Make(
            "Admin", "admin", "SUPER_ADMIN",
            "Cấu hình hệ thống", "Cập nhật cấu hình hệ thống", "System Settings",
            "Đã cập nhật thông số kỹ thuật và quy chế đấu giá hệ thống.", ip, "Admin Portal"));

        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();
        SharedDataService.InvalidateSnapshotCache();

        return new JsonObject
        {
            ["success"] = true,
            ["settings"] = settings,
            ["message"] = "Đã cập nhật cấu hình hệ thống thành công!"
        };
    }
}
