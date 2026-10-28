using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Services;

/// <summary>
/// Thay thế "serverData" trong server.js: dựng snapshot cho GET /api/data (kèm các lớp che thông tin
/// sealed-bid theo vai trò) và gộp dữ liệu client gửi lên qua POST /api/data.
/// </summary>
public class SharedDataService
{
    public const string MaskedSecret = "********";
    public static readonly SemaphoreSlim Gate = new(1, 1);

    private static readonly HashSet<string> PseudoAgentCodes =
        new(StringComparer.OrdinalIgnoreCase) { "ALL", "STAFF", "SYSTEM", "ADMIN", "VU-ADMIN-01", "VU-OPS-88" };

    private readonly AppDbContext _db;
    private readonly IConfiguration _cfg;
    private readonly ILogger<SharedDataService> _log;
    private Dictionary<string, Agent>? _agents;

    public SharedDataService(AppDbContext db, IConfiguration cfg, ILogger<SharedDataService> log)
    {
        _db = db; _cfg = cfg; _log = log;
    }

    // ---------------------------------------------------------------- settings / version

    public async Task<JsonNode?> GetSettingAsync(string key)
    {
        var s = await _db.Settings.FindAsync(key);
        if (s?.Value == null) return null;
        try { return JsonNode.Parse(s.Value); }
        catch (System.Text.Json.JsonException) { return JsonValue.Create(s.Value); }
    }

    public async Task SetSettingAsync(string key, JsonNode? value)
    {
        var s = await _db.Settings.FindAsync(key);
        if (s == null) { s = new Setting { Key = key }; _db.Settings.Add(s); }
        s.Value = value?.ToJsonString();
    }

    /// <summary>Định danh "thế hệ dữ liệu" của máy chủ. Trình duyệt mang dữ liệu thuộc thế hệ khác sẽ bị dọn sạch và không được ghi đè lên DB.</summary>
    public async Task<string> GetEpochAsync()
    {
        var s = await _db.Settings.FindAsync("dataEpoch");
        if (s != null && !string.IsNullOrEmpty(s.Value)) return s.Value;
        if (s == null) { s = new Setting { Key = "dataEpoch" }; _db.Settings.Add(s); }
        s.Value = Guid.NewGuid().ToString("N");
        await _db.SaveChangesAsync();
        return s.Value;
    }

    public async Task<long> GetVersionAsync()
    {
        var s = await _db.Settings.FindAsync("version");
        return long.TryParse(s?.Value, out var v) ? v : Util.NowMs();
    }

    public async Task<long> BumpVersionAsync()
    {
        var v = Util.NowMs();
        var s = await _db.Settings.FindAsync("version");
        if (s == null) { s = new Setting { Key = "version" }; _db.Settings.Add(s); }
        s.Value = v.ToString();
        InvalidateSnapshotCache();
        return v;
    }

    private async Task<List<string>> GetStringListAsync(string key)
    {
        var n = await GetSettingAsync(key);
        var list = new List<string>();
        if (n is JsonArray a) foreach (var x in a) list.Add(EntityJson.NodeStr(x) ?? "");
        return list.Where(x => x != "").ToList();
    }

    private async Task SetStringListAsync(string key, IEnumerable<string> values)
    {
        var arr = new JsonArray();
        foreach (var v in values.Distinct()) arr.Add(JsonValue.Create(v));
        await SetSettingAsync(key, arr);
    }

    // ---------------------------------------------------------------- agents helper

    private async Task<Dictionary<string, Agent>> AgentsAsync()
    {
        _agents ??= (await _db.Agents.ToListAsync())
            .GroupBy(a => a.Code.ToUpperInvariant()).ToDictionary(g => g.Key, g => g.First());
        return _agents;
    }

    public async Task<Agent?> EnsureAgentAsync(string? code, string? name, string? companyName,
        string? taxCode = null, string? email = null, string? phone = null)
    {
        if (string.IsNullOrWhiteSpace(code)) return null;
        var key = code.Trim().ToUpperInvariant();
        if (Util.IsAnonCode(key) || PseudoAgentCodes.Contains(key)) return null;
        var agents = await AgentsAsync();
        if (agents.TryGetValue(key, out var ex)) return ex;

        var resolved = Util.NullIfEmpty(companyName) ?? Util.NullIfEmpty(name) ?? $"Đại lý {key}";
        var ag = new Agent
        {
            Code = key, Name = resolved, CompanyName = resolved, TaxCode = Util.NullIfEmpty(taxCode),
            Email = Util.NullIfEmpty(email), Phone = Util.NullIfEmpty(phone),
            Status = "Hoạt động", IsLocked = false, Password = "12345678", Pin = "1234"
        };
        _db.Agents.Add(ag);
        agents[key] = ag;
        return ag;
    }

    private static long _lastMaintenanceMs = 0;

    // ---------------------------------------------------------------- maintenance (chạy trước mỗi GET /api/data)

    public async Task MaintenanceAsync()
    {
        var nowMs = Util.NowMs();
        if (nowMs - _lastMaintenanceMs < 30_000) return;
        _lastMaintenanceMs = nowMs;

        var auctions = await _db.Auctions.ToListAsync();
        var bids = await _db.Bids.ToListAsync();
        AuctionRules.ReconcileStatuses(auctions, bids);
        AuctionRules.ReconcileSummaries(auctions, bids);
        await SettleClosedAuctionsAsync();

        // Chính sách chi nhánh (giữ nguyên từ bản Node): tự động mở khóa mọi đại lý, xóa cảnh báo "TÀI KHOẢN ĐÃ BỊ KHÓA".
        if (_cfg.GetValue("App:AutoUnlockAgents", false))
        {
            foreach (var a in await _db.Agents.ToListAsync())
            {
                if (a.Status is "LOCKED" or "Đã khóa" || a.IsLocked || !string.IsNullOrEmpty(a.LockedReason))
                {
                    a.Status = "Đang hoạt động"; a.IsLocked = false; a.LockedReason = null; a.LockedAt = null;
                }
            }
            var alerts = await _db.Notifications
                .Where(n => n.Type == "ALERT" && n.Title != null && n.Title.Contains("TÀI KHOẢN ĐÃ BỊ KHÓA")).ToListAsync();
            if (alerts.Count > 0) _db.Notifications.RemoveRange(alerts);
        }

        await CleanupClosedChatsAsync();
        if (_db.ChangeTracker.HasChanges()) await _db.SaveChangesAsync();
    }

    /// <summary>Xóa phiên chat đã CLOSED quá 7 ngày.</summary>
    public async Task CleanupClosedChatsAsync()
    {
        var closed = await _db.Chats.Where(c => c.Status == "CLOSED" && c.ClosedAt != null).ToListAsync();
        var limit = Util.NowMs() - 7L * 24 * 3600 * 1000;
        foreach (var c in closed)
        {
            var t = Util.ParseIso(c.ClosedAt);
            if (t == null || t.Value.ToUnixTimeMilliseconds() >= limit) continue;
            _db.ChatMessages.RemoveRange(await _db.ChatMessages.Where(m => m.ChatId == c.Id).ToListAsync());
            _db.Chats.Remove(c);
        }
    }

    // ---------------------------------------------------------------- snapshot (GET /api/data)

    private static long _cachedSnapshotTime = 0;
    private static (List<Auction> auctions, List<Bid> bids, List<WonAuction> wons, List<Notification> notifs, List<Registration> regs, List<Agent> agents, List<AppUser> users, List<Chat> chats, List<ChatMessage> msgs, List<EmailLog> emails, List<ActivityLog> logs, Dictionary<string, string?> settings)? _cachedDbSnapshot = null;
    private static readonly SemaphoreSlim _cacheGate = new(1, 1);

    public static void InvalidateSnapshotCache()
    {
        _cachedSnapshotTime = 0;
        _cachedDbSnapshot = null;
    }

    public async Task<JsonObject> GetSnapshotAsync(string? rawAgentCode, string? rawRole)
    {
        string? agentCode = null;
        if (!string.IsNullOrWhiteSpace(rawAgentCode) && rawAgentCode != "null" && rawAgentCode != "undefined")
            agentCode = rawAgentCode.Trim().ToUpperInvariant();
        var role = (rawRole ?? "").ToLowerInvariant();
        var isAdmin = role == "admin" && agentCode == null;
        var isStaff = role == "staff" && agentCode == null;

        var nowMs = Util.NowMs();
        var snap = _cachedDbSnapshot;
        if (snap == null || nowMs - _cachedSnapshotTime > 1500)
        {
            await _cacheGate.WaitAsync();
            try
            {
                snap = _cachedDbSnapshot;
                if (snap == null || nowMs - _cachedSnapshotTime > 1500)
                {
                    var auctionEnt = await _db.Auctions.AsNoTracking().OrderByDescending(a => a.Id).ToListAsync();
                    var bidEnt = await _db.Bids.AsNoTracking().OrderByDescending(b => b.Timestamp).ToListAsync();
                    var wonEnt = await _db.WonAuctions.AsNoTracking().OrderByDescending(w => w.WonId).ToListAsync();
                    var notifEnt = await _db.Notifications.AsNoTracking().OrderByDescending(n => n.Id).ToListAsync();
                    var regEnt = await _db.Registrations.AsNoTracking().ToListAsync();
                    var agentEnt = await _db.Agents.AsNoTracking().ToListAsync();
                    var userEnt = await _db.Users.AsNoTracking().ToListAsync();
                    var chatEnt = await _db.Chats.AsNoTracking().OrderByDescending(c => c.CreatedAt).ToListAsync();
                    var msgEnt = await _db.ChatMessages.AsNoTracking().OrderBy(m => m.Timestamp).ToListAsync();
                    var emailEnt = await _db.EmailLogs.AsNoTracking().OrderByDescending(e => e.Id).Take(50).ToListAsync();
                    var logEnt = await _db.ActivityLogs.AsNoTracking().OrderByDescending(l => l.RawTime).Take(1000).ToListAsync();
                    var settingsList = await _db.Settings.AsNoTracking().ToListAsync();
                    var settingsDict = settingsList.ToDictionary(s => s.Key, s => s.Value);

                    snap = (auctionEnt, bidEnt, wonEnt, notifEnt, regEnt, agentEnt, userEnt, chatEnt, msgEnt, emailEnt, logEnt, settingsDict);
                    _cachedDbSnapshot = snap;
                    _cachedSnapshotTime = nowMs;
                }
            }
            finally
            {
                _cacheGate.Release();
            }
        }

        var (auctionList, bidList, wonList, notifList, regList, agentList, userList, chatList, msgList, emailList, logList, dbSettings) = snap.Value;

        JsonNode? ParseSetting(string key)
        {
            if (!dbSettings.TryGetValue(key, out var val) || val == null) return null;
            try { return JsonNode.Parse(val); }
            catch { return JsonValue.Create(val); }
        }

        var auctions = auctionList.Select(a => EntityJson.ToNode(a)).ToList();
        var bids = bidList.Select(b => EntityJson.ToNode(b)).ToList();
        var wons = wonList.Select(w => EntityJson.ToNode(w)).ToList();

        const string anonName = "Đại lý ẩn danh (AG-***)";

        if (isStaff)
        {
            foreach (var b in bids) { b["agentCode"] = "AG-***"; b["agentName"] = anonName; b["isAnonymous"] = true; }
            foreach (var a in auctions)
            {
                a["leadingAgentCode"] = "AG-***"; a["leadingAgentName"] = anonName;
                if (!string.IsNullOrEmpty(EntityJson.Str(a, "winnerAgentCode")))
                { a["winnerAgentCode"] = "AG-***"; a["winnerAgentName"] = anonName; }
            }
            foreach (var w in wons) { w["agentCode"] = "AG-***"; w["agentName"] = anonName; }
        }
        else if (isAdmin)
        {
            // Sealed-bid: trong phiên đang mở Admin không được xem giá/đại lý
            var open = auctionList.Where(a => a.Status == "OPEN").Select(a => (long)a.Id).ToHashSet();
            foreach (var b in bids)
            {
                if (!open.Contains(EntityJson.Lng(b, "auctionId") ?? -1)) continue;
                b["agentCode"] = "AG-***"; b["agentName"] = "Đại lý ẩn danh (Bảo mật)";
                b["priceKg"] = null; b["weightKg"] = null; b["isAnonymous"] = true;
            }
            foreach (var a in auctions)
            {
                if (EntityJson.Str(a, "status") != "OPEN") continue;
                a["leadingAgentCode"] = "AG-***"; a["leadingAgentName"] = "Bảo mật trong phiên";
                a["currentPriceKg"] = a["startingPriceKg"]?.DeepClone();
            }
        }
        else
        {
            // Đại lý/khách: chỉ thấy danh tính của chính mình
            foreach (var b in bids)
            {
                var code = (EntityJson.Str(b, "agentCode") ?? "").Trim().ToUpperInvariant();
                if (agentCode != null && code == agentCode) continue;
                b["agentCode"] = "AG-***"; b["agentName"] = anonName; b["isAnonymous"] = true;
            }
            foreach (var a in auctions)
            {
                if (EntityJson.Str(a, "status") != "OPEN" || EntityJson.Bool(a, "isAnonymous") == false) continue;
                var lead = (EntityJson.Str(a, "leadingAgentCode") ?? "").Trim().ToUpperInvariant();
                if (agentCode == null || lead != agentCode)
                { a["leadingAgentCode"] = "AG-***"; a["leadingAgentName"] = anonName; }
            }
        }

        // Cấu hình: không bao giờ trả mật khẩu SMTP về trình duyệt
        var settings = (ParseSetting("settings") as JsonObject) ?? new JsonObject();
        if (settings["smtp"] is JsonObject smtp && !string.IsNullOrEmpty(EntityJson.Str(smtp, "pass")))
            smtp["pass"] = MaskedSecret;

        var chats = new JsonArray();
        var msgByChat = msgList.GroupBy(m => m.ChatId ?? "").ToDictionary(g => g.Key, g => g.ToList());
        foreach (var c in chatList)
        {
            if (!isAdmin && (agentCode == null || !string.Equals(c.AgentCode?.Trim(), agentCode, StringComparison.OrdinalIgnoreCase)))
                continue;
            var cn = EntityJson.ToNode(c);
            var ma = new JsonArray();
            if (msgByChat.TryGetValue(c.Id, out var ml)) foreach (var m in ml) ma.Add(EntityJson.ToNode(m));
            cn["messages"] = ma;
            chats.Add(cn);
        }

        var agentsList = new JsonArray();
        foreach (var ag in agentList)
        {
            if (string.IsNullOrWhiteSpace(ag.Code)) continue;
            var key = ag.Code.Trim().ToUpperInvariant();
            if (PseudoAgentCodes.Contains(key)) continue;

            // BẢO MẬT: Khách hoặc Đại lý chỉ thấy duy nhất profile của chính mình, không thấy đại lý khác
            if (!isAdmin && (agentCode == null || key != agentCode)) continue;

            var n = EntityJson.ToNode(ag);
            if (string.IsNullOrEmpty(EntityJson.Str(n, "repName")) && string.IsNullOrEmpty(ag.Email)
                && string.IsNullOrEmpty(ag.TaxCode) && string.IsNullOrEmpty(ag.Phone) && string.IsNullOrEmpty(ag.CompanyName)) continue;

            // BẢO MẬT: Tuyệt đối không gửi mật khẩu, mã PIN hoặc token mở khóa về trình duyệt
            n.Remove("password");
            n.Remove("pin");
            n.Remove("unlockToken");
            n.Remove("unlockOtp");
            agentsList.Add(n);
        }

        // BẢO MẬT: Email logs chỉ dành riêng cho Admin
        var emailLogs = new JsonArray();
        if (isAdmin)
        {
            foreach (var e in emailList)
            {
                var n = EntityJson.ToNode(e);
                n["to"] = e.ToAddress;
                emailLogs.Add(n);
            }
        }

        long version = Util.NowMs();
        if (dbSettings.TryGetValue("version", out var vStr) && long.TryParse(vStr, out var v)) version = v;
        string dataEpoch = dbSettings.TryGetValue("dataEpoch", out var ep) && !string.IsNullOrEmpty(ep) ? ep : Guid.NewGuid().ToString("N");

        // BẢO MẬT: Danh sách tài khoản Admin CHỈ gửi cho Admin, và TUYỆT ĐỐI xóa trường password
        var adminsArr = new JsonArray();
        if (isAdmin)
        {
            var rawAdmins = ParseSetting("adminsList") as JsonArray;
            if (rawAdmins == null || rawAdmins.Count == 0)
            {
                rawAdmins = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = 99,
                        ["username"] = "admin",
                        ["role"] = "SUPER_ADMIN",
                        ["roles"] = new JsonArray { "SUPER_ADMIN" },
                        ["fullName"] = "Trần Quản Trị (Super Admin)",
                        ["email"] = "admin@vietravelairlines.vn",
                        ["department"] = ""
                    }
                };
            }
            foreach (var adm in rawAdmins)
            {
                if (adm is JsonObject admObj)
                {
                    var clone = (JsonObject)admObj.DeepClone();
                    clone.Remove("password");
                    adminsArr.Add(clone);
                }
            }
        }

        // BẢO MẬT: Lọc thông báo theo đúng đại lý hoặc broadcast
        var filteredNotifs = notifList.Where(n => {
            if (isAdmin) return true;
            if (agentCode == null) return false;
            if (n.TargetRole == "ADMIN" || n.TargetRole == "admin") return false;
            if (!string.IsNullOrEmpty(n.TargetAgentCode))
                return string.Equals(n.TargetAgentCode.Trim(), agentCode, StringComparison.OrdinalIgnoreCase);
            return n.TargetRole == "AGENT" || n.Type == "SYSTEM" || n.Type == "ANNOUNCEMENT";
        });

        // BẢO MẬT: Lọc nhật ký hoạt động (chỉ admin hoặc chính đại lý đó)
        var filteredLogs = logList.Where(l => {
            if (isAdmin) return true;
            if (agentCode == null) return false;
            return string.Equals(l.Actor?.Trim(), agentCode, StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(l.Username?.Trim(), agentCode, StringComparison.OrdinalIgnoreCase);
        });

        return new JsonObject
        {
            ["version"] = version,
            ["dataEpoch"] = dataEpoch,
            ["auctions"] = ToArray(auctions),
            ["bids"] = ToArray(bids),
            ["wonAuctions"] = ToArray(wons),
            ["notifications"] = ToArray(filteredNotifs.Select(n => EntityJson.ToNode(n))),
            ["registrations"] = isAdmin ? ToArray(regList.Select(r => EntityJson.ToNode(r))) : new JsonArray(),
            ["agentsList"] = agentsList,
            ["usersList"] = isAdmin ? ToArray(userList.Select(u => {
                var un = EntityJson.ToNode(u);
                un.Remove("password");
                return un;
            })) : new JsonArray(),
            ["chats"] = chats,
            ["settings"] = settings,
            ["bankConfig"] = ParseSetting("bankConfig") ?? new JsonObject(),
            ["routeSubscriptions"] = ParseSetting("routeSubscriptions") ?? new JsonObject(),
            ["emailLogs"] = emailLogs,
            ["activityLogs"] = ToArray(filteredLogs.Select(l => EntityJson.ToNode(l))),
            ["readNotificationIds"] = ParseSetting("readNotificationIds") ?? new JsonArray(),
            ["deletedNotificationIds"] = ParseSetting("deletedNotificationIds") ?? new JsonArray(),
            ["adminsList"] = adminsArr,
            ["rolesList"] = isAdmin ? (ParseSetting("rolesList") ?? new JsonArray()) : new JsonArray(),
        };
    }

    private static JsonArray ToArray(IEnumerable<JsonObject> items)
    {
        var a = new JsonArray();
        foreach (var i in items) a.Add(i);
        return a;
    }

    // ---------------------------------------------------------------- merge (POST /api/data)

    public async Task<long> MergeAsync(JsonObject incoming)
    {
        await Gate.WaitAsync();
        try
        {
            var agents = await AgentsAsync();
            var users = await _db.Users.ToListAsync();

            // 1) Danh sách đại lý (xử lý trước để có đầy đủ thông tin đại lý cho các bảng khác)
            foreach (var n in ArrayOf(incoming, "agentsList"))
            {
                var code = EntityJson.Str(n, "code")?.Trim();
                if (string.IsNullOrEmpty(code)) continue;
                var key = code.ToUpperInvariant();
                if (!agents.TryGetValue(key, out var ag))
                {
                    ag = new Agent { Code = code, Status = "Hoạt động", Password = "12345678", Pin = "1234" };
                    _db.Agents.Add(ag);
                    agents[key] = ag;
                }
                var prevPwd = ag.Password; var prevPin = ag.Pin;
                var prevStatus = ag.Status; var prevLocked = ag.IsLocked; var prevReason = ag.LockedReason;
                var prevLockedAt = ag.LockedAt; var prevUnlockedAt = ag.UnlockedAt;
                EntityJson.Apply(ag, n);
                // Trạng thái khóa/mở khóa do Admin đặt (qua /api/agents/lock) là nguồn sự thật: dữ liệu cũ từ trình duyệt không được ghi đè.
                // Chỉ cho phép client tự khóa do nhập sai mật khẩu và tự mở khóa khi khóa đó là do nhập sai mật khẩu.
                var wasFailedLoginLock = prevReason == "FAILED_LOGIN_ATTEMPTS";
                var nowFailedLoginLock = ag.LockedReason == "FAILED_LOGIN_ATTEMPTS";
                var prevIsLocked = prevLocked || prevStatus is "Đã khóa" or "LOCKED";
                var allowClientLockChange = (!prevIsLocked && nowFailedLoginLock) || (prevIsLocked && wasFailedLoginLock);
                if (!allowClientLockChange)
                {
                    ag.Status = prevStatus; ag.IsLocked = prevLocked; ag.LockedReason = prevReason;
                    ag.LockedAt = prevLockedAt; ag.UnlockedAt = prevUnlockedAt;
                }
                ag.Code = ag.Code.Trim();
                if (string.IsNullOrEmpty(ag.Password)) ag.Password = prevPwd ?? "12345678";
                if (ag.Password == "12345678" && !string.IsNullOrEmpty(prevPwd) && prevPwd != "12345678") ag.Password = prevPwd;
                if (string.IsNullOrEmpty(ag.Pin)) ag.Pin = prevPin ?? "1234";
                if (ag.Pin == "1234" && !string.IsNullOrEmpty(prevPin) && prevPin != "1234") ag.Pin = prevPin;
                if (string.IsNullOrEmpty(ag.Name)) ag.Name = ag.CompanyName;

                var newPin = Util.NullIfEmpty(EntityJson.Str(n, "pin"));
                var newPwd = Util.NullIfEmpty(EntityJson.Str(n, "password"));
                if (newPin != null || newPwd != null)
                {
                    foreach (var u in users.Where(u => string.Equals(u.AgentCode, key, StringComparison.OrdinalIgnoreCase)))
                    {
                        if (newPin != null) u.Pin = newPin;
                        if (newPwd != null) u.Password = newPwd;
                    }
                }
            }

            // 2) Hồ sơ đăng ký (trạng thái đã xử lý ở server không bị client ghi đè)
            foreach (var n in ArrayOf(incoming, "registrations"))
            {
                var regId = EntityJson.Str(n, "regId");
                if (string.IsNullOrEmpty(regId)) continue;
                var r = await _db.Registrations.FindAsync(regId);
                if (r == null)
                {
                    r = new Registration { RegId = regId };
                    _db.Registrations.Add(r);
                    EntityJson.Apply(r, n);
                }
                else
                {
                    var st1 = r.Status; var ac = r.AgentCode; var rr = r.RejectionReason;
                    EntityJson.Apply(r, n);
                    if (!string.IsNullOrEmpty(st1) && st1 != "PENDING")
                    {
                        r.Status = st1;
                        if (!string.IsNullOrEmpty(ac)) r.AgentCode = ac;
                        if (!string.IsNullOrEmpty(rr)) r.RejectionReason = rr;
                    }
                }
                var agCode = EntityJson.Str(n, "agentCode");
                if (!string.IsNullOrEmpty(agCode))
                {
                    var ag = await EnsureAgentAsync(agCode, EntityJson.Str(n, "repName"), EntityJson.Str(n, "companyName"),
                        EntityJson.Str(n, "taxCode"), EntityJson.Str(n, "email"), EntityJson.Str(n, "phone"));
                    var regPwd = EntityJson.Str(n, "password") ?? EntityJson.GetExtraString(r, "password");
                    var regPin = EntityJson.Str(n, "pin") ?? EntityJson.GetExtraString(r, "pin");
                    if (ag != null)
                    {
                        if (!string.IsNullOrEmpty(regPwd) && (string.IsNullOrEmpty(ag.Password) || ag.Password == "12345678"))
                        {
                            ag.Password = regPwd;
                        }
                        if (!string.IsNullOrEmpty(regPin) && (string.IsNullOrEmpty(ag.Pin) || ag.Pin == "1234"))
                        {
                            ag.Pin = regPin;
                        }
                    }
                }
            }

            // 3) Phiên đấu giá
            foreach (var n in ArrayOf(incoming, "auctions"))
            {
                var id = EntityJson.Lng(n, "id");
                if (id == null || id == 0) continue;
                var a = await _db.Auctions.FindAsync((int)id.Value);
                if (a == null) { a = new Auction { Id = (int)id.Value }; _db.Auctions.Add(a); }
                var prevWinner = a.WinnerAgentCode;
                var prevLeader = a.LeadingAgentCode;
                EntityJson.Apply(a, n);
                if (a.CurrentPriceKg == 0) a.CurrentPriceKg = a.StartingPriceKg;

                if (!string.IsNullOrWhiteSpace(a.WinnerAgentCode) && a.WinnerAgentCode != "AG-***" && a.WinnerAgentCode != "Chưa có")
                {
                    await EnsureAgentAsync(a.WinnerAgentCode, a.WinnerAgentName, a.WinnerAgentName);
                }
                if (!string.IsNullOrWhiteSpace(a.LeadingAgentCode) && a.LeadingAgentCode != "AG-***" && a.LeadingAgentCode != "Chưa có")
                {
                    await EnsureAgentAsync(a.LeadingAgentCode, a.LeadingAgentName, a.LeadingAgentName);
                }

                // Bảo vệ Foreign Key: winnerAgentCode và leadingAgentCode phải tồn tại trong bảng agents
                if (string.IsNullOrWhiteSpace(a.WinnerAgentCode) || a.WinnerAgentCode == "AG-***" || !agents.ContainsKey(a.WinnerAgentCode.Trim().ToUpperInvariant()))
                {
                    a.WinnerAgentCode = (!string.IsNullOrWhiteSpace(prevWinner) && agents.ContainsKey(prevWinner.Trim().ToUpperInvariant())) ? prevWinner : null;
                }
                if (string.IsNullOrWhiteSpace(a.LeadingAgentCode) || a.LeadingAgentCode == "AG-***" || a.LeadingAgentCode == "Chưa có" || !agents.ContainsKey(a.LeadingAgentCode.Trim().ToUpperInvariant()))
                {
                    a.LeadingAgentCode = (!string.IsNullOrWhiteSpace(prevLeader) && agents.ContainsKey(prevLeader.Trim().ToUpperInvariant())) ? prevLeader : null;
                }
            }

            // 4) Thầu (chỉ thêm thầu mới; bỏ bản sao phía client của thầu server đã có)
            var existingBids = await _db.Bids.AsNoTracking()
                .Select(b => new { b.AuctionId, b.AgentCode, b.PriceKg, b.Timestamp }).ToListAsync();
            foreach (var n in ArrayOf(incoming, "bids"))
            {
                var rawId = EntityJson.Str(n, "id") ?? "";
                var auctionId = EntityJson.Lng(n, "auctionId");
                var code = (EntityJson.Str(n, "agentCode") ?? "").Trim().ToUpperInvariant();
                var price = EntityJson.Lng(n, "priceKg");
                if (auctionId == null || auctionId == 0 || code == "" || price == null || price == 0 || Util.IsAnonCode(code)) continue;

                var ts = EntityJson.Lng(n, "timestamp") ?? (long.TryParse(rawId, out var idn) ? idn : (long?)null);
                if (!rawId.StartsWith("BID-"))
                {
                    var bTime = ts ?? 0;
                    if (existingBids.Any(s => s.AuctionId == auctionId && string.Equals(s.AgentCode, code, StringComparison.OrdinalIgnoreCase)
                                              && s.PriceKg == price && Math.Abs(s.Timestamp - bTime) < 60000)) continue;
                }

                var agentName = EntityJson.Str(n, "agentName");
                await EnsureAgentAsync(code, agentName, agentName);

                var nowMs = ts ?? Util.NowMs();
                var bidId = rawId != "" ? rawId : $"BID-{nowMs}-{Random.Shared.Next(0, 1000)}";
                if (await _db.Bids.FindAsync(bidId) != null) continue;

                var bid = new Bid { Id = bidId };
                EntityJson.Apply(bid, n);
                bid.Id = bidId;
                bid.Timestamp = nowMs;
                bid.AuctionId = (int)auctionId.Value;
                bid.AgentCode = code;
                bid.AgentName = agentName ?? code;
                bid.IsAnonymous = EntityJson.Bool(n, "isAnonymous") ?? false;
                bid.PriceKg = price.Value;
                var rawBidTime = EntityJson.Str(n, "time");
                if (string.IsNullOrEmpty(rawBidTime) || rawBidTime == "Vừa xong")
                {
                    bid.Time = DateTimeOffset.FromUnixTimeMilliseconds(nowMs).ToOffset(TimeSpan.FromHours(7)).ToString("yyyy-MM-dd HH:mm:ss");
                }
                else if (rawBidTime.Contains('/') && rawBidTime.Contains(':'))
                {
                    if (DateTime.TryParseExact(rawBidTime, "HH:mm:ss dd/MM/yyyy", null, System.Globalization.DateTimeStyles.None, out var parsed))
                        bid.Time = parsed.ToString("yyyy-MM-dd HH:mm:ss");
                    else
                        bid.Time = rawBidTime;
                }
                else
                {
                    bid.Time = rawBidTime;
                }
                bid.Status = EntityJson.Str(n, "status") ?? "RECEIVED";
                _db.Bids.Add(bid);
            }

            // 5) Đơn thắng thầu
            foreach (var n in ArrayOf(incoming, "wonAuctions"))
            {
                var wonId = EntityJson.Str(n, "wonId");
                if (string.IsNullOrEmpty(wonId)) continue;
                var w = await _db.WonAuctions.FindAsync(wonId);
                if (w == null) { w = new WonAuction { WonId = wonId }; _db.WonAuctions.Add(w); }
                var prevWonAgent = w.AgentCode;
                EntityJson.Apply(w, n);
                w.WonId = wonId;
                if (!string.IsNullOrWhiteSpace(w.AgentCode) && w.AgentCode != "AG-***")
                {
                    await EnsureAgentAsync(w.AgentCode, EntityJson.GetExtraString(w, "agentName"), EntityJson.GetExtraString(w, "agentName"));
                }
                if (string.IsNullOrWhiteSpace(w.AgentCode) || w.AgentCode == "AG-***" || !agents.ContainsKey(w.AgentCode.Trim().ToUpperInvariant()))
                {
                    w.AgentCode = (!string.IsNullOrWhiteSpace(prevWonAgent) && agents.ContainsKey(prevWonAgent.Trim().ToUpperInvariant())) ? prevWonAgent : null;
                }
            }

            // 6) Thông báo (đã xóa / đã đọc / mới)
            var deleted = await GetStringListAsync("deletedNotificationIds");
            if (incoming["deletedNotificationIds"] is JsonArray da)
            {
                var ids = da.Select(x => EntityJson.NodeStr(x) ?? "").Where(x => x != "").ToList();
                deleted.AddRange(ids);
                await SetStringListAsync("deletedNotificationIds", deleted);
                foreach (var id in ids)
                    if (long.TryParse(id, out var nid) && await _db.Notifications.FindAsync(nid) is Notification dn) _db.Notifications.Remove(dn);
            }
            if (incoming["readNotificationIds"] is JsonArray ra)
            {
                var read = await GetStringListAsync("readNotificationIds");
                read.AddRange(ra.Select(x => EntityJson.NodeStr(x) ?? "").Where(x => x != ""));
                await SetStringListAsync("readNotificationIds", read);
            }
            var delSet = deleted.ToHashSet();
            var recentNotifs = await _db.Notifications.OrderByDescending(x => x.Id).Take(300).ToListAsync();
            foreach (var n in ArrayOf(incoming, "notifications"))
            {
                var id = EntityJson.Lng(n, "id");
                if (id == null || delSet.Contains(id.Value.ToString())) continue;
                var nt = await _db.Notifications.FindAsync(id.Value);
                if (nt == null)
                {
                    var title = (EntityJson.Str(n, "title") ?? "").Trim();
                    var msg = (EntityJson.Str(n, "message") ?? "").Trim();
                    var role = (EntityJson.Str(n, "targetRole") ?? "").Trim();
                    var agentCode = (EntityJson.Str(n, "targetAgentCode") ?? "").Trim();

                    var isDup = recentNotifs.Any(x =>
                        string.Equals(x.Title?.Trim(), title, StringComparison.OrdinalIgnoreCase) &&
                        string.Equals(x.Message?.Trim(), msg, StringComparison.OrdinalIgnoreCase) &&
                        string.Equals(x.TargetRole?.Trim(), role, StringComparison.OrdinalIgnoreCase) &&
                        string.Equals((x.TargetAgentCode ?? "").Trim(), agentCode, StringComparison.OrdinalIgnoreCase));
                    if (isDup) continue;

                    nt = new Notification { Id = id.Value };
                    _db.Notifications.Add(nt);
                    recentNotifs.Add(nt);
                }
                EntityJson.Apply(nt, n);
                nt.Id = id.Value;
            }

            // 7) Nhật ký hoạt động phía client
            var recentLogs = await _db.ActivityLogs.OrderByDescending(l => l.RawTime).Take(2000).ToListAsync();
            foreach (var n in ArrayOf(incoming, "activityLogs"))
            {
                var title = EntityJson.Str(n, "actionTitle");
                if (string.IsNullOrEmpty(title)) continue;
                var eff = EffectiveLogTime(EntityJson.Str(n, "timestamp"), EntityJson.Lng(n, "rawTime") ?? 0);
                var target = EntityJson.Str(n, "target") ?? "N/A";
                var user = (EntityJson.Str(n, "username") ?? EntityJson.Str(n, "actor") ?? "").Trim().ToUpperInvariant();
                var id = EntityJson.Lng(n, "id") ?? eff;

                if (await _db.ActivityLogs.FindAsync(id) != null) continue;

                // Check for duplicate within 10 seconds
                var dup = recentLogs.FirstOrDefault(r =>
                {
                    if (Math.Abs(r.RawTime - eff) > 10000) return false;
                    if (!string.Equals(r.ActionTitle?.Trim(), title.Trim(), StringComparison.OrdinalIgnoreCase)) return false;
                    var rTarget = (r.Target ?? "N/A").Trim().ToUpperInvariant();
                    var nTarget = target.Trim().ToUpperInvariant();
                    if (rTarget != "N/A" && nTarget != "N/A" && rTarget != nTarget) return false;
                    var rUser = (string.IsNullOrEmpty(r.Username) ? r.Actor : r.Username)?.Trim().ToUpperInvariant() ?? "";
                    var isAdmin = (rUser == "ADMIN" || rUser.Contains("ADMIN")) && (user == "ADMIN" || user.Contains("ADMIN"));
                    if (!isAdmin && rUser != user && !string.IsNullOrEmpty(rUser) && !string.IsNullOrEmpty(user)) return false;
                    return true;
                });

                if (dup != null)
                {
                    var clientDev = EntityJson.Str(n, "device");
                    if (!string.IsNullOrEmpty(clientDev) && clientDev != "Web App" && dup.Device == "Web App")
                    {
                        dup.Device = clientDev;
                    }
                    var clientActor = EntityJson.Str(n, "actor");
                    if (!string.IsNullOrEmpty(clientActor) && clientActor != "Admin" && dup.Actor == "Admin")
                    {
                        dup.Actor = clientActor;
                    }
                    continue;
                }

                var newL = new ActivityLog
                {
                    Id = id, Timestamp = EntityJson.Str(n, "timestamp") ?? "", RawTime = eff,
                    Actor = EntityJson.Str(n, "actor") ?? "", Username = EntityJson.Str(n, "username") ?? "",
                    Role = EntityJson.Str(n, "role") ?? "AGENT", ActionCategory = EntityJson.Str(n, "actionCategory") ?? "Khác",
                    ActionTitle = title, Target = target, Details = EntityJson.Str(n, "details") ?? "",
                    Ip = EntityJson.Str(n, "ip") ?? "113.161.42.12", Device = EntityJson.Str(n, "device") ?? "Web Client"
                };
                _db.ActivityLogs.Add(newL);
                recentLogs.Add(newL);
            }

            // 8) Cấu hình & danh sách phụ
            if (incoming["adminsList"] is JsonArray incomingAdmins)
            {
                var hasAdmin = incomingAdmins.Any(n => string.Equals(EntityJson.Str(n, "username"), "admin", StringComparison.OrdinalIgnoreCase));
                if (!hasAdmin)
                {
                    incomingAdmins.Insert(0, new JsonObject
                    {
                        ["id"] = 99,
                        ["username"] = "admin",
                        ["password"] = "admin2026",
                        ["role"] = "SUPER_ADMIN",
                        ["roles"] = new JsonArray { "SUPER_ADMIN" },
                        ["fullName"] = "Trần Quản Trị (Super Admin)",
                        ["email"] = "admin@vietravelairlines.vn",
                        ["department"] = ""
                    });
                }
                await SetSettingAsync("adminsList", incomingAdmins.DeepClone());
            }
            else if (incoming["adminsList"] != null)
            {
                await SetSettingAsync("adminsList", incoming["adminsList"]!.DeepClone());
            }
            if (incoming["rolesList"] != null)
            {
                await SetSettingAsync("rolesList", incoming["rolesList"]!.DeepClone());
            }
            if (incoming["settings"] is JsonObject st)
            {
                var newSettings = (JsonObject)st.DeepClone();
                var oldSettings = await GetSettingAsync("settings") as JsonObject;
                if (newSettings["smtp"] is JsonObject smtp)
                {
                    var pass = EntityJson.Str(smtp, "pass");
                    if (string.IsNullOrEmpty(pass) || pass == MaskedSecret)
                        smtp["pass"] = EntityJson.Str(oldSettings?["smtp"], "pass") ?? "";
                }
                await SetSettingAsync("settings", newSettings);
            }
            if (incoming["bankConfig"] != null) await SetSettingAsync("bankConfig", incoming["bankConfig"]!.DeepClone());
            if (incoming["routeSubscriptions"] != null) await SetSettingAsync("routeSubscriptions", incoming["routeSubscriptions"]!.DeepClone());

            // 9) Chat (upsert, không xóa)
            foreach (var n in ArrayOf(incoming, "chats")) await UpsertChatAsync(n);

            await _db.SaveChangesAsync();
            InvalidateSnapshotCache();

            // 10) Đối soát sau khi gộp
            await ReconcileAfterMergeAsync();
            var version = await BumpVersionAsync();
            await _db.SaveChangesAsync();
            InvalidateSnapshotCache();
            return version;
        }
        finally { Gate.Release(); }
    }

    private static IEnumerable<JsonObject> ArrayOf(JsonObject src, string key)
    {
        if (src[key] is not JsonArray arr) yield break;
        foreach (var n in arr) if (n is JsonObject o) yield return o;
    }

    private async Task UpsertChatAsync(JsonObject n)
    {
        var id = EntityJson.Str(n, "id");
        if (string.IsNullOrEmpty(id)) return;
        var c = await _db.Chats.FindAsync(id);
        if (c == null) { c = new Chat { Id = id }; _db.Chats.Add(c); }
        var prevAgentCode = c.AgentCode;
        var copy = (JsonObject)n.DeepClone();
        copy.Remove("messages");
        EntityJson.Apply(c, copy);
        c.Id = id;
        if (!string.IsNullOrEmpty(c.AgentCode) && (c.AgentCode == "AG-***" || !await _db.Agents.AnyAsync(a => a.Code == c.AgentCode)))
        {
            c.AgentCode = (!string.IsNullOrEmpty(prevAgentCode) && await _db.Agents.AnyAsync(a => a.Code == prevAgentCode)) ? prevAgentCode : null;
        }
        if (n["messages"] is JsonArray ms)
        {
            foreach (var mn in ms)
            {
                if (mn is not JsonObject mo) continue;
                var mid = EntityJson.Str(mo, "id");
                if (string.IsNullOrEmpty(mid)) continue;
                var m = await _db.ChatMessages.FindAsync(mid);
                if (m == null) { m = new ChatMessage { Id = mid }; _db.ChatMessages.Add(m); }
                EntityJson.Apply(m, mo);
                m.Id = mid; m.ChatId = id;
            }
        }
    }

    // ---------------------------------------------------------------- reconcile helpers

    public static long EffectiveLogTime(string? timestamp, long raw)
    {
        var parsed = Util.ParseLogTimestamp(timestamp);
        if (parsed != 0 && (raw == 0 || Math.Abs(raw - parsed) > 86_400_000)) return parsed;
        return raw != 0 ? raw : parsed;
    }

    private async Task ReconcileAfterMergeAsync()
    {
        var auctions = await _db.Auctions.ToListAsync();
        var bids = await _db.Bids.ToListAsync();
        AuctionRules.ReconcileStatuses(auctions, bids);
        AuctionRules.ReconcileSummaries(auctions, bids);
        await SettleClosedAuctionsAsync();
        await ReconcileBidActivityLogsAsync(auctions, bids);
        if (_cfg.GetValue("App:AutoUnlockAgents", false))
        {
            foreach (var a in await _db.Agents.ToListAsync())
                if (a.Status is "LOCKED" or "Đã khóa" || a.IsLocked || !string.IsNullOrEmpty(a.LockedReason))
                { a.Status = "Đang hoạt động"; a.IsLocked = false; a.LockedReason = null; a.LockedAt = null; }
        }
    }

    /// <summary>
    /// Chốt các phiên đã đóng: đảm bảo có người trúng thầu, đơn hàng WonAuction và thông báo trúng thầu trong database.
    /// </summary>
    public async Task SettleClosedAuctionsAsync()
    {
        var auctions = await _db.Auctions.ToListAsync();
        var bids = await _db.Bids.ToListAsync();
        var agents = await AgentsAsync();
        var changed = false;

        foreach (var a in auctions.Where(a => a.Status == "CLOSED"))
        {
            var auctionBids = bids.Where(b => b.AuctionId == a.Id && b.PriceKg > 0)
                .OrderByDescending(b => b.PriceKg).ThenBy(b => b.Timestamp).ToList();
            if (auctionBids.Count == 0) continue;

            var top = auctionBids[0];
            top.Status = "WON";
            for (int i = 1; i < auctionBids.Count; i++) auctionBids[i].Status = "OUTBID";

            var code = (top.AgentCode ?? "").Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(code) || Util.IsAnonCode(code)) continue;

            await EnsureAgentAsync(code, top.AgentName ?? code, top.AgentName ?? code);

            if (string.IsNullOrEmpty(a.WinnerAgentCode) || a.WinnerAgentCode == "AG-***" || a.WinningPriceKg == 0)
            {
                a.WinnerAgentCode = code;
                a.WinnerAgentName = top.AgentName ?? code;
                a.WinningPriceKg = top.PriceKg;
                changed = true;
            }

            // Đảm bảo đơn thắng thầu tồn tại trong DB
            var existingWon = await _db.WonAuctions.FirstOrDefaultAsync(w => w.AuctionId == a.Id);
            if (existingWon == null)
            {
                var now = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7));
                var dateStr = now.ToString("yyyyMMdd");
                var wonId = $"WON-{dateStr}-{a.Id:D2}";
                existingWon = new WonAuction
                {
                    WonId = wonId,
                    AuctionId = a.Id,
                    AgentCode = code,
                    FlightNumber = a.FlightNumber ?? $"VU{a.Id}",
                    Route = a.Route ?? $"{a.Origin} - {a.Destination}",
                    CapacityKg = a.CapacityKg,
                    PriceKg = top.PriceKg,
                    TotalAmountVND = top.PriceKg * a.CapacityKg,
                    PaymentDeadline = Util.ToIso(now.AddHours(24)),
                    PaymentStatus = "UNPAID",
                    AwbNumber = $"998-{Random.Shared.Next(10000000, 99999999)}",
                    CutOffTime = a.CutOffTime ?? "Hôm nay 18:00",
                    Warehouse = "Kho hàng SCSC / TCS Tân Sơn Nhất (Cửa số 4)"
                };
                EntityJson.SetExtra(existingWon, "agentName", top.AgentName ?? code);
                EntityJson.SetExtra(existingWon, "etdIso", a.EtdIso ?? a.EndTime);
                _db.WonAuctions.Add(existingWon);
                changed = true;
            }

            // Đảm bảo có thông báo trúng thầu cho đại lý
            var notifFlight = a.FlightNumber ?? $"VU{a.Id}";
            var notifTitle = $"🏆 CHÚC MỪNG! Bạn đã thắng thầu chuyến bay {notifFlight}";
            var hasWonNotif = await _db.Notifications.AnyAsync(n =>
                n.TargetAgentCode == code && n.Type == "WON" && ((n.Title != null && n.Title.Contains(notifFlight)) || (n.Message != null && n.Message.Contains(notifFlight))));
            if (!hasWonNotif)
            {
                var nid = Util.NowMs() + Random.Shared.Next(1, 1000);
                var notif = new Notification
                {
                    Id = nid,
                    TargetAgentCode = code,
                    Title = notifTitle,
                    Message = $"Đại lý {top.AgentName ?? code} ({code}) đã trúng thầu chuyến bay {notifFlight} ({a.Route}) với giá {Util.FmtVi(top.PriceKg)}đ/Kg. Phiên đấu giá đã hoàn tất thành công và ghi nhận bạn là người trúng thầu.",
                    Time = "Vừa xong",
                    Type = "WON",
                    Read = false,
                    Unread = true,
                    Link = $"07-WonAuction.html?flight={Uri.EscapeDataString(notifFlight)}"
                };
                EntityJson.SetExtra(notif, "timestamp", JsonValue.Create(nid));
                _db.Notifications.Add(notif);
                changed = true;
            }
        }

        if (changed)
        {
            await _db.SaveChangesAsync();
        }
    }

    /// <summary>Mỗi thầu hợp lệ phải có một dòng nhật ký "Đặt giá thầu" (port reconcileBidActivityLogs).</summary>
    private async Task ReconcileBidActivityLogsAsync(List<Auction> auctions, List<Bid> bids)
    {
        var logs = await _db.ActivityLogs
            .Where(l => l.ActionTitle == "Đặt giá thầu" || l.ActionCategory == "Đấu giá").ToListAsync();
        var keys = logs.Select(l => $"{(string.IsNullOrEmpty(l.Username) ? l.Actor : l.Username)!.ToUpperInvariant()}_{l.Target}_{l.RawTime / 10000}").ToHashSet();
        var agents = await AgentsAsync();

        foreach (var b in bids)
        {
            var code = (b.AgentCode ?? "").Trim().ToUpperInvariant();
            if (code == "" || Util.IsAnonCode(code)) continue;
            var auc = auctions.FirstOrDefault(a => a.Id == b.AuctionId);
            var flight = auc != null ? (Util.NullIfEmpty(auc.FlightNumber) ?? auc.FlightCode) : $"AUC-{b.AuctionId}";
            var raw = b.Timestamp != 0 ? b.Timestamp : Util.NowMs();
            if (!keys.Add($"{code}_{flight}_{raw / 10000}")) continue;

            agents.TryGetValue(code, out var ag);
            var actor = ag != null ? (Util.NullIfEmpty(ag.CompanyName) ?? EntityJson.GetExtraString(ag, "repName")) : (b.AgentName ?? code);
            var d = DateTimeOffset.FromUnixTimeMilliseconds(raw).LocalDateTime;
            var route = auc != null && !string.IsNullOrEmpty(auc.Route) ? $" ({auc.Route})" : "";
            var id = raw + Random.Shared.Next(0, 1000);
            if (await _db.ActivityLogs.FindAsync(id) != null) continue;
            _db.ActivityLogs.Add(new ActivityLog
            {
                Id = id, Timestamp = Util.LogTimestamp(d), RawTime = raw, Actor = actor ?? code, Username = code,
                Role = "AGENT", ActionCategory = "Đấu giá", ActionTitle = "Đặt giá thầu", Target = flight,
                Details = $"Đại lý {actor} đặt thầu thành công mức giá {Util.FmtVi(b.PriceKg)}đ/Kg cho chuyến bay {flight}{route}.",
                Ip = "113.161.42.12", Device = "Web Client"
            });
        }
    }

    // ---------------------------------------------------------------- reset (POST /api/reset)

    /// <summary>Xóa dữ liệu giao dịch (thầu, đơn thắng, chat, thông báo) và đưa các phiên đang mở về trạng thái chưa có thầu.</summary>
    public async Task<long> ResetAsync()
    {
        await Gate.WaitAsync();
        try
        {
            _db.Bids.RemoveRange(await _db.Bids.ToListAsync());
            _db.WonAuctions.RemoveRange(await _db.WonAuctions.ToListAsync());
            _db.ChatMessages.RemoveRange(await _db.ChatMessages.ToListAsync());
            _db.Chats.RemoveRange(await _db.Chats.ToListAsync());
            _db.Notifications.RemoveRange(await _db.Notifications.ToListAsync());

            foreach (var a in await _db.Auctions.Where(a => a.Status == "OPEN").ToListAsync())
            {
                a.BidsCount = 0; a.CurrentPriceKg = a.StartingPriceKg;
                a.LeadingAgentCode = null; a.LeadingAgentName = null;
                a.WinnerAgentCode = null; a.WinnerAgentName = null; a.WinningPriceKg = 0;
            }
            var v = await BumpVersionAsync();
            await _db.SaveChangesAsync();
            return v;
        }
        finally { Gate.Release(); }
    }
}
