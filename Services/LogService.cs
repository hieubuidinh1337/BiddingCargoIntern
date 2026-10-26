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
        var log = new ActivityLog
        {
            Id = EntityJson.Lng(body, "id") ?? raw + Random.Shared.Next(0, 1000),
            Timestamp = Util.LogTimestamp(now), RawTime = raw,
            Actor = Util.NullIfEmpty(EntityJson.Str(body, "actor")) ?? "Hệ thống",
            Username = Util.NullIfEmpty(EntityJson.Str(body, "username")) ?? "system",
            Role = Util.NullIfEmpty(EntityJson.Str(body, "role")) ?? "SYSTEM",
            ActionCategory = Util.NullIfEmpty(EntityJson.Str(body, "actionCategory")) ?? "Khác",
            ActionTitle = Util.NullIfEmpty(EntityJson.Str(body, "actionTitle")) ?? "Thao tác hệ thống",
            Target = Util.NullIfEmpty(EntityJson.Str(body, "target")) ?? "N/A",
            Details = EntityJson.Str(body, "details") ?? "",
            Ip = Util.NullIfEmpty(EntityJson.Str(body, "ip")) ?? remoteIp ?? "113.161.42.12",
            Device = Util.NullIfEmpty(EntityJson.Str(body, "device")) ?? "Web App"
        };
        var existing = await _db.ActivityLogs.FindAsync(log.Id);
        if (existing != null) _db.ActivityLogs.Remove(existing);   // INSERT OR REPLACE
        await _db.SaveChangesAsync();
        _db.ActivityLogs.Add(log);
        await _db.SaveChangesAsync();
        return log;
    }

    public async Task<List<ActivityLog>> QueryAsync(string? role, string? category, string? q)
    {
        var all = await _db.ActivityLogs.OrderByDescending(l => l.RawTime).Take(1000).ToListAsync();
        var seenIds = new HashSet<long>();
        var seenKeys = new HashSet<string>();
        var result = new List<ActivityLog>();
        foreach (var l in all)
        {
            if (!seenIds.Add(l.Id)) continue;
            var bucket = SharedDataService.EffectiveLogTime(l.Timestamp, l.RawTime) / 5000;
            var user = (string.IsNullOrEmpty(l.Username) ? l.Actor : l.Username)?.Trim().ToUpperInvariant();
            var fp = $"{user}|{l.ActionTitle?.Trim()}|{l.Target?.Trim()}|{l.Details?.Trim()}|{bucket}";
            if (!seenKeys.Add(fp)) continue;
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
