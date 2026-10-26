using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using BiddingCargo.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Services;

public class ApiException : Exception
{
    public int Status { get; }
    public ApiException(string message, int status = 400) : base(message) { Status = status; }
}

/// <summary>Hoàn tiền đơn thắng thầu, duyệt hồ sơ đại lý, thông báo.</summary>
public class WonAuctionService
{
    private readonly AppDbContext _db;
    private readonly SharedDataService _shared;

    public WonAuctionService(AppDbContext db, SharedDataService shared)
    { _db = db; _shared = shared; }

    private async Task<WonAuction> FindWonAsync(string? wonId)
    {
        if (string.IsNullOrEmpty(wonId)) throw new ApiException("wonId là bắt buộc.");
        return await _db.WonAuctions.FindAsync(wonId) ?? throw new ApiException("Không tìm thấy đơn hàng: " + wonId, 404);
    }

    private async Task SaveAsync() { await _shared.BumpVersionAsync(); await _db.SaveChangesAsync(); }

    // ------------------------------------------------ hoàn tiền

    public async Task<WonAuction> SubmitRefundInfoAsync(JsonObject body, string? ip)
    {
        var wonId = EntityJson.Str(body, "wonId");
        var bank = (EntityJson.Str(body, "bankName") ?? "").Trim();
        var acc = (EntityJson.Str(body, "accountNumber") ?? "").Trim();
        var name = (EntityJson.Str(body, "accountName") ?? "").Trim();
        var note = (EntityJson.Str(body, "agentNote") ?? "").Trim();
        if (string.IsNullOrEmpty(wonId) || bank == "" || acc == "" || name == "") throw new ApiException("Thiếu thông tin tài khoản nhận hoàn tiền.");

        bank = Regex.Replace(bank, @"\s+", " ");
        name = Regex.Replace(name, @"\s+", " ");
        string? err = null;
        if (!Regex.IsMatch(bank, @"^[\p{L}0-9 .&()\-]{2,60}$") || !Regex.IsMatch(bank, @"\p{L}")) err = "Tên ngân hàng không hợp lệ.";
        else if (!Regex.IsMatch(acc, @"^\d{6,19}$")) err = "Số tài khoản phải gồm 6–19 chữ số.";
        else if (!Regex.IsMatch(name, @"^[A-Z ]{2,50}$") || name.Split(' ').Length < 2) err = "Chủ tài khoản phải là chữ in hoa không dấu, gồm ít nhất 2 từ.";
        else if (note.Length > 300) err = "Ghi chú không được vượt quá 300 ký tự.";
        if (err != null) throw new ApiException(err);

        var won = await FindWonAsync(wonId);
        var auctions = await _db.Auctions.ToListAsync();
        if (!AuctionRules.IsWonAuctionExpired(won, auctions) && won.PaymentStatus != "CANCELLED_AFTER_PAYMENT")
            throw new ApiException("Đơn hàng này chưa bị hủy.");
        if (won.RefundStatus == "REFUNDED") throw new ApiException("Đã hoàn tiền rồi.");

        won.RefundBankInfoJson = new JsonObject
        {
            ["bankName"] = bank, ["accountNumber"] = acc, ["accountName"] = name, ["agentNote"] = note, ["submittedAt"] = Util.ViNow()
        }.ToJsonString();
        won.RefundStatus = "PENDING";

        _db.Notifications.Add(new Notification
        {
            Id = Util.NowMs(), TargetRole = "admin", Title = "Yêu cầu hoàn tiền từ đại lý " + won.AgentCode,
            Message = $"Đơn hàng {wonId} cần xác nhận hoàn tiền.", Time = "Vừa xong", Type = "INFO", Read = false, Unread = true
        });

        var agent = await _db.Agents.FirstOrDefaultAsync(a => a.Code.ToUpper() == (won.AgentCode ?? "").ToUpper());
        var agentName = Util.NullIfEmpty(agent?.CompanyName) ?? EntityJson.GetExtraString(won, "agentName") ?? "Đại lý";
        var code = won.AgentCode ?? "AGENT";
        _db.ActivityLogs.Add(LogService.Make(agentName, code, "AGENT", "Thanh toán", "Điền thông tin hoàn tiền", won.WonId,
            $"Đại lý {agentName} ({code}) đã đăng ký tài khoản nhận tiền hoàn cho đơn {won.WonId}: {bank} - STK: {acc} (Chủ TK: {name}).", ip));
        await SaveAsync();
        return won;
    }

    public async Task<WonAuction> ConfirmRefundAsync(JsonObject body, string? ip)
    {
        var won = await FindWonAsync(EntityJson.Str(body, "wonId"));
        if (string.IsNullOrEmpty(won.RefundBankInfoJson)) throw new ApiException("Đại lý chưa cung cấp thông tin tài khoản.");
        if (won.RefundStatus == "REFUNDED") throw new ApiException("Đã xác nhận hoàn tiền rồi.");

        var by = Util.NullIfEmpty(EntityJson.Str(body, "confirmedBy")) ?? "Trần Quản Trị";
        won.RefundStatus = "REFUNDED";
        won.RefundConfirmedAt = Util.ViNow();
        won.RefundConfirmedBy = by;
        won.RefundNote = (EntityJson.Str(body, "refundNote") ?? "").Trim();

        var info = JsonNode.Parse(won.RefundBankInfoJson) as JsonObject;
        var bankText = $"{EntityJson.Str(info, "bankName")} - STK: {EntityJson.Str(info, "accountNumber")} (Chủ TK: {EntityJson.Str(info, "accountName")})";
        _db.Notifications.Add(new Notification
        {
            Id = Util.NowMs(), TargetAgentCode = won.AgentCode, Title = "TIỀN HOÀN ĐÃ ĐƯỢC CHUYỂN - Đơn " + won.WonId,
            Message = $"Ban Điều hành đã hoàn tất chuyển tiền hoàn vào {bankText}.", Time = "Vừa xong", Type = "SUCCESS", Read = false, Unread = true
        });
        _db.ActivityLogs.Add(LogService.Make(by, "admin", "ADMIN", "Thanh toán", "Xác nhận hoàn tiền đơn thầu", won.WonId,
            $"Xác nhận đã hoàn tiền cho đơn thắng thầu {won.WonId} của Đại lý {EntityJson.GetExtraString(won, "agentName") ?? won.AgentCode} vào tài khoản {bankText}.", ip));
        await SaveAsync();
        return won;
    }

    // ------------------------------------------------ duyệt hồ sơ đại lý

    public async Task<string> ApproveRegistrationAsync(string? regId, string? approvedBy, string? ip)
    {
        if (string.IsNullOrEmpty(regId)) throw new ApiException("regId is required");
        var reg = await _db.Registrations.FindAsync(regId) ?? throw new ApiException("Hồ sơ đăng ký không tồn tại", 404);

        var agents = await _db.Agents.ToListAsync();
        string code;
        do { code = "AG-" + Random.Shared.Next(1000, 10000); } while (agents.Any(a => a.Code == code));

        reg.Status = "APPROVED"; reg.ApprovedAt = Util.ViNow(); reg.AgentCode = code;

        var agent = agents.FirstOrDefault(a => !string.IsNullOrEmpty(a.TaxCode) && a.TaxCode == reg.TaxCode);
        if (agent == null)
        {
            _db.Agents.Add(new Agent
            {
                Code = code, Name = reg.CompanyName, CompanyName = reg.CompanyName, TaxCode = reg.TaxCode, Email = reg.Email,
                Phone = reg.Phone, Status = "Hoạt động", IsLocked = false, Password = "12345678", Pin = "1234"
            });
        }
        else
        {
            // Giữ hành vi gốc: đại lý trùng MST được cấp lại mã mới (đổi khóa chính).
            _db.Agents.Remove(agent);
            _db.Agents.Add(new Agent
            {
                Code = code, Name = agent.Name, CompanyName = agent.CompanyName, TaxCode = agent.TaxCode, Email = agent.Email, Phone = agent.Phone,
                Status = "Hoạt động", IsLocked = false, Password = agent.Password, Pin = agent.Pin, ExtraJson = agent.ExtraJson
            });
        }

        var actor = Util.NullIfEmpty(approvedBy) ?? "Quản trị viên";
        _db.ActivityLogs.Add(LogService.Make(actor, Util.NullIfEmpty(approvedBy) ?? "admin", "ADMIN", "Quản lý Đại lý", "Tạo tài khoản Đại lý mới", code,
            $"Duyệt hồ sơ đăng ký {regId} và cấp mã đại lý {code} cho công ty {reg.CompanyName} (MST: {Util.NullIfEmpty(reg.TaxCode) ?? "N/A"}).", ip ?? "127.0.0.1", "Admin Portal"));
        await SaveAsync();
        return code;
    }

    // ------------------------------------------------ thông báo

    public async Task MarkNotificationsReadAsync(IEnumerable<string> ids)
    {
        var list = ids.ToList();
        if (list.Count == 0) return;
        var read = (await _shared.GetSettingAsync("readNotificationIds") as JsonArray)?.Select(EntityJson.NodeStr).Where(x => x != null).Select(x => x!).ToList() ?? new();
        foreach (var i in list) if (!read.Contains(i)) read.Add(i);
        var arr = new JsonArray(); foreach (var r in read) arr.Add(JsonValue.Create(r));
        await _shared.SetSettingAsync("readNotificationIds", arr);
        foreach (var i in list)
            if (long.TryParse(i, out var id) && await _db.Notifications.FindAsync(id) is Notification n) { n.Read = true; n.Unread = false; }
        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();
    }

    public async Task DeleteNotificationsAsync(IEnumerable<string> ids)
    {
        var list = ids.ToList();
        if (list.Count == 0) return;
        var del = (await _shared.GetSettingAsync("deletedNotificationIds") as JsonArray)?.Select(EntityJson.NodeStr).Where(x => x != null).Select(x => x!).ToList() ?? new();
        foreach (var i in list) if (!del.Contains(i)) del.Add(i);
        var arr = new JsonArray(); foreach (var r in del) arr.Add(JsonValue.Create(r));
        await _shared.SetSettingAsync("deletedNotificationIds", arr);
        foreach (var i in list)
            if (long.TryParse(i, out var id) && await _db.Notifications.FindAsync(id) is Notification n) _db.Notifications.Remove(n);
        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();
    }
}
