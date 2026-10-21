using System.Text.Json;
using System.Text.Json.Nodes;
using BiddingCargo.Web.Services;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Data;

public static class DbInitializer
{
    private static readonly string[] ExtraJsonTables =
        { "agents", "auctions", "bids", "won_auctions", "notifications", "registrations", "chats" };

    public static async Task InitializeAsync(AppDbContext db, ILogger logger)
    {
        await db.Database.EnsureCreatedAsync();

        // Cho phép dùng lại file database.sqlite do bản Node.js tạo: bổ sung cột extra_json nếu thiếu.
        if (db.Database.IsSqlite())
        {
            foreach (var t in ExtraJsonTables)
            {
                try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE " + t + " ADD COLUMN extra_json TEXT;"); }
                catch (Exception) { /* cột đã tồn tại */ }
            }
        }

        if (!await db.Agents.AnyAsync())
        {
            logger.LogInformation("Database trống - nạp dữ liệu mặc định.");
            await SeedAsync(db);
        }
    }

    public static JsonObject LoadSeedFile()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Data", "seed.json");
        return JsonNode.Parse(File.ReadAllText(path))!.AsObject();
    }

    private static Agent Ag(string code, string name, string company, string tax, string email, string phone, string pwd, string pin = "1234") =>
        new() { Code = code, Name = name, CompanyName = company, TaxCode = tax, Email = email, Phone = phone, Status = "Hoạt động", Password = pwd, Pin = pin };

    private static AppUser Us(string id, string user, string agent, string pwd, string role, string full, string email, string company) =>
        new() { Id = id, Username = user, AgentCode = agent, Password = pwd, Pin = "1234", Role = role, FullName = full, Email = email, CompanyName = company, Status = "ACTIVE" };

    public static async Task SeedAsync(AppDbContext db)
    {
        db.Agents.AddRange(
            Ag("VU-ADMIN-01", "Quản Trị Viên VU", "Vietravel Airlines HQ", "0109001122", "admin@vietravelairlines.vn", "1900 6686", "admin2026"),
            Ag("VU-OPS-88", "Nhân Viên Điều Hành Cargo", "Trung Tâm Kho Vận Vietravel Cargo", "0109001122", "staff@vietravelairlines.vn", "1900 6686", "staff2026"),
            Ag("AG-0892", "ABC Logistics", "Công ty TNHH Vận tải ABC Logistics", "0315889900", "an.nguyen@abccargo.vn", "0903 123 456", "abc123456"),
            Ag("AG-1024", "Vinatrans", "Công ty CP Giao nhận Kho vận Vinatrans", "0300445566", "khang.le@vinatrans.com.vn", "0918 456 789", "vina123456"),
            Ag("AG-0556", "Golden Star", "Công ty TNHH Tiếp vận Toàn Cầu Golden Star", "0312334455", "thao.pham@dhlvietnam.com", "0988 777 888", "star123456"),
            Ag("AG-0341", "SkyFreight", "Công ty TNHH SkyFreight Logistics Việt Nam", "0314556677", "dung.hoang@saigonair.vn", "0934 555 666", "sky123456"),
            Ag("AG-0789", "Viet Freight", "Công ty CP Vận chuyển Hàng không Việt Freight", "0316778899", "hoa.nt@vietfreight.vn", "0909 111 222", "viet123456"));

        db.Users.AddRange(
            Us("USR-001", "admin", "VU-ADMIN-01", "admin2026", "ADMIN", "Quản Trị Viên VU", "admin@vietravelairlines.vn", "Vietravel Airlines HQ"),
            Us("USR-002", "staff01", "VU-OPS-88", "staff2026", "STAFF", "Nhân Viên Điều Hành Cargo", "staff@vietravelairlines.vn", "Trung Tâm Kho Vận Vietravel Cargo"),
            Us("USR-008", "staff02", "VU-OPS-88", "staff2026", "STAFF", "Nhân Viên Thẩm Định Đại Lý", "staff02@vietravelairlines.vn", "Phòng Thẩm Định Đại Lý"),
            Us("USR-003", "AG-0892", "AG-0892", "abc123456", "AGENT", "Nguyễn Văn An", "an.nguyen@abccargo.vn", "Công ty TNHH Vận tải ABC Logistics"),
            Us("USR-004", "AG-1024", "AG-1024", "vina123456", "AGENT", "Lê Minh Khang", "khang.le@vinatrans.com.vn", "Công ty CP Giao nhận Kho vận Vinatrans"),
            Us("USR-005", "AG-0556", "AG-0556", "star123456", "AGENT", "Phạm Thu Thảo", "thao.pham@dhlvietnam.com", "Công ty TNHH Tiếp vận Toàn Cầu Golden Star"),
            Us("USR-006", "AG-0341", "AG-0341", "sky123456", "AGENT", "Hoàng Văn Dũng", "dung.hoang@saigonair.vn", "Công ty TNHH SkyFreight Logistics Việt Nam"),
            Us("USR-007", "AG-0789", "AG-0789", "viet123456", "AGENT", "Nguyễn Thị Hoa", "hoa.nt@vietfreight.vn", "Công ty CP Vận chuyển Hàng không Việt Freight"));
        await db.SaveChangesAsync();

        await ApplySeedDocumentAsync(db, includeBidsAndWon: true);
    }

    /// <summary>Nạp phiên đấu giá/thầu/đơn thắng/thông báo/hồ sơ/cấu hình mặc định, dịch mốc thời gian về "bây giờ".</summary>
    public static async Task ApplySeedDocumentAsync(AppDbContext db, bool includeBidsAndWon)
    {
        var seed = LoadSeedFile();
        var seedVersion = EntityJson.Lng(seed, "version") ?? Util.NowMs();
        var shift = Util.NowMs() - seedVersion;

        foreach (var n in seed["auctions"]?.AsArray() ?? new JsonArray())
        {
            if (n is not JsonObject o) continue;
            var et = Util.ParseIso(EntityJson.Str(o, "endTime"));
            if (et != null) o["endTime"] = Util.ToIso(et.Value.AddMilliseconds(shift));
            var id = (int)(EntityJson.Lng(o, "id") ?? 0);
            var a = await db.Auctions.FindAsync(id);
            if (a == null) { a = new Auction { Id = id }; db.Auctions.Add(a); }
            EntityJson.Apply(a, o);
        }

        if (includeBidsAndWon)
        {
            foreach (var n in seed["bids"]?.AsArray() ?? new JsonArray())
            {
                if (n is not JsonObject o) continue;
                var id = EntityJson.Str(o, "id") ?? "";
                if (id == "" || await db.Bids.FindAsync(id) != null) continue;
                var b = new Bid { Id = id };
                EntityJson.Apply(b, o);
                b.Timestamp += shift;
                db.Bids.Add(b);
            }
            foreach (var n in seed["wonAuctions"]?.AsArray() ?? new JsonArray())
            {
                if (n is not JsonObject o) continue;
                var id = EntityJson.Str(o, "wonId") ?? "";
                if (id == "" || await db.WonAuctions.FindAsync(id) != null) continue;
                var w = new WonAuction { WonId = id };
                EntityJson.Apply(w, o);
                db.WonAuctions.Add(w);
            }
        }

        foreach (var n in seed["notifications"]?.AsArray() ?? new JsonArray())
        {
            if (n is not JsonObject o) continue;
            var id = EntityJson.Lng(o, "id") ?? Util.NowMs();
            if (await db.Notifications.FindAsync(id) != null) continue;
            var nt = new Notification { Id = id };
            EntityJson.Apply(nt, o);
            db.Notifications.Add(nt);
        }

        foreach (var n in seed["registrations"]?.AsArray() ?? new JsonArray())
        {
            if (n is not JsonObject o) continue;
            var id = EntityJson.Str(o, "regId") ?? "";
            if (id == "" || await db.Registrations.FindAsync(id) != null) continue;
            var r = new Registration { RegId = id };
            EntityJson.Apply(r, o);
            db.Registrations.Add(r);
        }

        foreach (var key in new[] { "settings", "bankConfig", "routeSubscriptions" })
        {
            if (seed[key] == null) continue;
            var s = await db.Settings.FindAsync(key);
            if (s == null) { s = new Setting { Key = key }; db.Settings.Add(s); }
            s.Value = seed[key]!.ToJsonString();
        }

        await db.SaveChangesAsync();
    }
}
