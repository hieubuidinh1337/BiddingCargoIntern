using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Services;

public class LogService
{
    private readonly AppDbContext _db;
    public LogService(AppDbContext db) { _db = db; }

    public static ActivityLog Make(string actor, string username, string role, string category, string title,
        string target, string details, string? ip = null, string device = "Web App")
    {
        var now = DateTime.Now;
        var raw = Util.NowMs();
        return new ActivityLog
        {
            Id = raw + Random.Shared.Next(0, 1000), Timestamp = Util.LogTimestamp(now), RawTime = raw,
            Actor = actor, Username = username, Role = role, ActionCategory = category, ActionTitle = title,
            Target = target, Details = details, Ip = ip ?? "113.161.42.12", Device = device
        };
    }

    public static string NormalizeActionTitle(string? title)
    {
        if (string.IsNullOrWhiteSpace(title)) return "";
        var t = title.Trim().ToUpperInvariant();
        if (t.Contains("ĐĂNG NHẬP")) return "LOGIN";
        if (t.Contains("ĐĂNG XUẤT")) return "LOGOUT";
        if (t.Contains("TẠO MỚI PHIÊN") || t.Contains("TẠO PHIÊN")) return "CREATE_AUCTION";
        if (t.Contains("CẬP NHẬT PHIÊN")) return "UPDATE_AUCTION";
        if (t.Contains("ĐÓNG PHIÊN") || t.Contains("CHỐT THẦU") || t.Contains("CHỐT ĐÓNG PHIÊN")) return "CLOSE_AUCTION";
        if (t.Contains("ĐẶT GIÁ THẦU") || t.Contains("ĐẶT THẦU")) return "PLACE_BID";
        if (t.Contains("KHÓA KẾT QUẢ")) return "LOCK_RESULT";
        if (t.Contains("DUYỆT & CẤP MÃ") || t.Contains("DUYỆT HỒ SƠ")) return "APPROVE_AGENT";
        if (t.Contains("TỪ CHỐI HỒ SƠ")) return "REJECT_AGENT";
        if (t.Contains("KHÓA TÀI KHOẢN")) return "LOCK_ACCOUNT";
        if (t.Contains("MỞ KHÓA TÀI KHOẢN")) return "UNLOCK_ACCOUNT";
        if (t.Contains("XÁC NHẬN THANH TOÁN")) return "CONFIRM_PAYMENT";
        if (t.Contains("TỪ CHỐI XÁC NHẬN THANH TOÁN")) return "REJECT_PAYMENT";
        return t;
    }

    public static bool IsSameTarget(string? targetA, string? targetB)
    {
        var a = (targetA ?? "N/A").Trim().ToUpperInvariant();
        var b = (targetB ?? "N/A").Trim().ToUpperInvariant();
        if (a == "N/A" || b == "N/A" || a == b) return true;
        return a.Contains(b) || b.Contains(a);
    }

    public static bool IsSameUser(string? userA, string? actorA, string? roleA, string? userB, string? actorB, string? roleB)
    {
        var uA = (userA ?? "").Trim().ToUpperInvariant();
        var uB = (userB ?? "").Trim().ToUpperInvariant();
        var actA = (actorA ?? "").Trim().ToUpperInvariant();
        var actB = (actorB ?? "").Trim().ToUpperInvariant();
        var rA = (roleA ?? "").Trim().ToUpperInvariant();
        var rB = (roleB ?? "").Trim().ToUpperInvariant();

        bool isAdminA = uA == "ADMIN" || rA.Contains("ADMIN") || actA.Contains("ADMIN");
        bool isAdminB = uB == "ADMIN" || rB.Contains("ADMIN") || actB.Contains("ADMIN");
        if (isAdminA && isAdminB) return true;

        if (!string.IsNullOrEmpty(uA) && !string.IsNullOrEmpty(uB) && uA == uB) return true;
        if (!string.IsNullOrEmpty(actA) && !string.IsNullOrEmpty(actB) && (actA == actB || actA.Contains(actB) || actB.Contains(actA))) return true;

        return false;
    }

    public static bool IsSemanticDuplicate(ActivityLog a, ActivityLog b)
    {
        var normA = NormalizeActionTitle(a.ActionTitle);
        var normB = NormalizeActionTitle(b.ActionTitle);
        if (normA != normB) return false;

        if (!IsSameTarget(a.Target, b.Target)) return false;

        if (!IsSameUser(a.Username, a.Actor, a.Role, b.Username, b.Actor, b.Role)) return false;

        return true;
    }

    public async Task<ActivityLog> AddOrUpdateAsync(ActivityLog newLog)
    {
        var raw = newLog.RawTime != 0 ? newLog.RawTime : Util.NowMs();
        var minTime = raw - 30000;
        var maxTime = raw + 30000;

        var candidates = await _db.ActivityLogs
            .Where(l => l.RawTime >= minTime && l.RawTime <= maxTime)
            .ToListAsync();

        var duplicate = candidates.FirstOrDefault(l => IsSemanticDuplicate(l, newLog));

        if (duplicate != null)
        {
            if (newLog.Device != "Web App" && (duplicate.Device == "Web App" || string.IsNullOrEmpty(duplicate.Device)))
                duplicate.Device = newLog.Device;
            if (!string.IsNullOrEmpty(newLog.Actor) && newLog.Actor != "Admin" && newLog.Actor != "Hệ thống" && (duplicate.Actor == "Admin" || duplicate.Actor == "Hệ thống" || string.IsNullOrEmpty(duplicate.Actor)))
                duplicate.Actor = newLog.Actor;
            if (!string.IsNullOrEmpty(newLog.Details) && (string.IsNullOrEmpty(duplicate.Details) || duplicate.Details.Length < newLog.Details.Length))
                duplicate.Details = newLog.Details;
            if (!string.IsNullOrEmpty(newLog.Ip) && (string.IsNullOrEmpty(duplicate.Ip) || duplicate.Ip == "113.161.42.12"))
                duplicate.Ip = newLog.Ip;
            if (!string.IsNullOrEmpty(newLog.Role) && duplicate.Role == "SYSTEM")
                duplicate.Role = newLog.Role;

            await _db.SaveChangesAsync();
            return duplicate;
        }

        if (newLog.Id == 0)
        {
            newLog.Id = raw + Random.Shared.Next(0, 1000);
        }
        else
        {
            var existingWithSameId = await _db.ActivityLogs.FindAsync(newLog.Id);
            if (existingWithSameId != null)
            {
                newLog.Id = raw + Random.Shared.Next(0, 1000);
            }
        }

        if (string.IsNullOrEmpty(newLog.Timestamp))
        {
            newLog.Timestamp = Util.LogTimestamp(DateTime.Now);
        }
        newLog.RawTime = raw;

        _db.ActivityLogs.Add(newLog);
        await _db.SaveChangesAsync();
        return newLog;
    }

    public async Task<ActivityLog> AddFromClientAsync(JsonObject body, string? remoteIp)
    {
        var raw = Util.NowMs();
        var clientRaw = EntityJson.Lng(body, "rawTime");
        var effTime = SharedDataService.EffectiveLogTime(EntityJson.Str(body, "timestamp"), clientRaw ?? raw);
        var id = EntityJson.Lng(body, "id") ?? effTime + Random.Shared.Next(0, 1000);
        var actor = Util.NullIfEmpty(EntityJson.Str(body, "actor")) ?? "Hệ thống";
        var username = Util.NullIfEmpty(EntityJson.Str(body, "username")) ?? "system";
        var role = Util.NullIfEmpty(EntityJson.Str(body, "role")) ?? "SYSTEM";
        var category = Util.NullIfEmpty(EntityJson.Str(body, "actionCategory")) ?? "Khác";
        var title = Util.NullIfEmpty(EntityJson.Str(body, "actionTitle")) ?? "Thao tác hệ thống";
        var target = Util.NullIfEmpty(EntityJson.Str(body, "target")) ?? "N/A";
        var details = EntityJson.Str(body, "details") ?? "";
        var ip = Util.NullIfEmpty(EntityJson.Str(body, "ip")) ?? remoteIp ?? "113.161.42.12";
        var device = Util.NullIfEmpty(EntityJson.Str(body, "device")) ?? "Web App";

        var log = new ActivityLog
        {
            Id = id,
            Timestamp = EntityJson.Str(body, "timestamp") ?? Util.LogTimestamp(DateTime.Now),
            RawTime = effTime,
            Actor = actor,
            Username = username,
            Role = role,
            ActionCategory = category,
            ActionTitle = title,
            Target = target,
            Details = details,
            Ip = ip,
            Device = device
        };

        return await AddOrUpdateAsync(log);
    }

    public async Task<List<ActivityLog>> QueryAsync(string? role, string? category, string? q)
    {
        var all = await _db.ActivityLogs.OrderByDescending(l => l.RawTime).Take(1000).ToListAsync();
        var seenIds = new HashSet<long>();
        var result = new List<ActivityLog>();

        foreach (var l in all)
        {
            if (!seenIds.Add(l.Id)) continue;
            var lTime = SharedDataService.EffectiveLogTime(l.Timestamp, l.RawTime);

            var existingIndex = result.FindIndex(r =>
            {
                var rTime = SharedDataService.EffectiveLogTime(r.Timestamp, r.RawTime);
                if (Math.Abs(lTime - rTime) > 30000) return false;
                return IsSemanticDuplicate(r, l);
            });

            if (existingIndex >= 0)
            {
                var existing = result[existingIndex];
                if (l.Device != "Web App" && existing.Device == "Web App")
                {
                    result[existingIndex] = l;
                }
                else if ((l.Actor ?? "").Length > (existing.Actor ?? "").Length && existing.Device == "Web App")
                {
                    result[existingIndex] = l;
                }
                continue;
            }

            result.Add(l);
        }

        IEnumerable<ActivityLog> res = result.OrderByDescending(l => SharedDataService.EffectiveLogTime(l.Timestamp, l.RawTime));
        if (!string.IsNullOrEmpty(role) && role != "ALL")
        {
            var r = role.ToUpperInvariant();
            if (r == "ADMIN")
                res = res.Where(l => l.Role != null && (l.Role.ToUpper().Contains("ADMIN") || l.Role.ToUpper() == "SUPER_ADMIN" || l.Role.ToUpper() == "ITD_ADMIN"));
            else if (r == "STAFF")
                res = res.Where(l => l.Role != null && (l.Role.ToUpper() == "STAFF" || l.Role.ToUpper().Contains("STAFF") || l.Role.ToUpper().Contains("NHÂN VIÊN")));
            else
                res = res.Where(l => string.Equals(l.Role, role, StringComparison.OrdinalIgnoreCase));
        }
        if (!string.IsNullOrEmpty(category) && category != "ALL")
            res = res.Where(l => (l.ActionCategory ?? "") == category);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var s = q.ToLowerInvariant().Trim();
            res = res.Where(l =>
                (l.Actor ?? "").ToLowerInvariant().Contains(s) || (l.Username ?? "").ToLowerInvariant().Contains(s) ||
                (l.ActionTitle ?? "").ToLowerInvariant().Contains(s) || (l.Target ?? "").ToLowerInvariant().Contains(s) ||
                (l.Details ?? "").ToLowerInvariant().Contains(s) || (l.Ip ?? "").Contains(s));
        }
        return res.ToList();
    }

    public async Task ClearAsync()
    {
        _db.ActivityLogs.RemoveRange(await _db.ActivityLogs.ToListAsync());
        await _db.SaveChangesAsync();
    }
}
