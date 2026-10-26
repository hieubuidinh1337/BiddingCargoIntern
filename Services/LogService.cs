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

    public async Task<ActivityLog> AddFromClientAsync(JsonObject body, string? remoteIp)
    {
        var now = DateTime.Now;
        var raw = Util.NowMs();
        var id = EntityJson.Lng(body, "id") ?? raw + Random.Shared.Next(0, 1000);
        var actor = Util.NullIfEmpty(EntityJson.Str(body, "actor")) ?? "Hệ thống";
        var username = Util.NullIfEmpty(EntityJson.Str(body, "username")) ?? "system";
        var role = Util.NullIfEmpty(EntityJson.Str(body, "role")) ?? "SYSTEM";
        var category = Util.NullIfEmpty(EntityJson.Str(body, "actionCategory")) ?? "Khác";
        var title = Util.NullIfEmpty(EntityJson.Str(body, "actionTitle")) ?? "Thao tác hệ thống";
        var target = Util.NullIfEmpty(EntityJson.Str(body, "target")) ?? "N/A";
        var details = EntityJson.Str(body, "details") ?? "";
        var ip = Util.NullIfEmpty(EntityJson.Str(body, "ip")) ?? remoteIp ?? "113.161.42.12";
        var device = Util.NullIfEmpty(EntityJson.Str(body, "device")) ?? "Web App";

        // Check if an existing log for the exact same event was already recorded in the last 15 seconds
        var minTime = raw - 15000;
        var targetClean = target.Trim().ToUpperInvariant();
        var titleClean = title.Trim().ToUpperInvariant();
        var userClean = username.Trim().ToUpperInvariant();

        var duplicate = await _db.ActivityLogs
            .Where(l => l.RawTime >= minTime)
            .FirstOrDefaultAsync(l =>
                l.ActionTitle != null && l.ActionTitle.ToUpper() == titleClean &&
                (targetClean == "N/A" || (l.Target != null && l.Target.ToUpper() == targetClean)) &&
                (userClean == "ADMIN" || (l.Username != null && (l.Username.ToUpper() == userClean || l.Username.ToUpper() == "ADMIN"))));

        if (duplicate != null)
        {
            if (device != "Web App") duplicate.Device = device;
            if (!string.IsNullOrEmpty(actor) && actor != "Admin" && actor != "Hệ thống") duplicate.Actor = actor;
            if (!string.IsNullOrEmpty(details)) duplicate.Details = details;
            duplicate.Ip = ip;
            await _db.SaveChangesAsync();
            return duplicate;
        }

        var existing = await _db.ActivityLogs.FindAsync(id);
        if (existing != null) _db.ActivityLogs.Remove(existing);
        var log = new ActivityLog
        {
            Id = id,
            Timestamp = Util.LogTimestamp(now),
            RawTime = raw,
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
        _db.ActivityLogs.Add(log);
        await _db.SaveChangesAsync();
        return log;
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
            var lTitle = (l.ActionTitle ?? "").Trim();
            var lTarget = (l.Target ?? "").Trim();
            var lUser = (string.IsNullOrEmpty(l.Username) ? l.Actor : l.Username)?.Trim().ToUpperInvariant() ?? "";

            var existingIndex = result.FindIndex(r =>
            {
                var rTime = SharedDataService.EffectiveLogTime(r.Timestamp, r.RawTime);
                if (Math.Abs(lTime - rTime) > 10000) return false;
                if (!string.Equals(r.ActionTitle?.Trim(), lTitle, StringComparison.OrdinalIgnoreCase)) return false;

                var rTarget = (r.Target ?? "").Trim();
                if (rTarget != "N/A" && lTarget != "N/A" && !string.Equals(rTarget, lTarget, StringComparison.OrdinalIgnoreCase)) return false;

                var rUser = (string.IsNullOrEmpty(r.Username) ? r.Actor : r.Username)?.Trim().ToUpperInvariant() ?? "";
                var isAdminUser = (rUser == "ADMIN" || rUser.Contains("ADMIN")) && (lUser == "ADMIN" || lUser.Contains("ADMIN"));
                if (!isAdminUser && !string.Equals(rUser, lUser, StringComparison.OrdinalIgnoreCase)) return false;

                return true;
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
                res = res.Where(l => l.Role != null && l.Role.ToUpper().Contains("ADMIN"));
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
