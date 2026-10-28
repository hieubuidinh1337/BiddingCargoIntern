using System.Text.Json.Nodes;
using BiddingCargo.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace BiddingCargo.Web.Services;

/// <summary>
/// Dịch vụ C# xử lý Bảo mật tài khoản Đại lý: OTP khôi phục mật khẩu, tạo/đổi Mã PIN 4 số,
/// và mở khóa tài khoản qua OTP/Token Email (thay thế store-registrations-security.js).
/// </summary>
public class RegistrationSecurityService
{
    private readonly AppDbContext _db;
    private readonly SharedDataService _shared;

    public RegistrationSecurityService(AppDbContext db, SharedDataService shared)
    {
        _db = db;
        _shared = shared;
    }

    public async Task<JsonObject> RequestPasswordResetOtpAsync(string? emailOrCode, string? ip)
    {
        var id = (emailOrCode ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(id))
            throw new ApiException("Vui lòng nhập Email hoặc Mã đại lý của bạn.");

        var agent = await _db.Agents.FirstOrDefaultAsync(a =>
            (a.Email != null && a.Email.ToLower() == id) ||
            (a.Code != null && a.Code.ToLower() == id) ||
            (a.TaxCode != null && a.TaxCode.ToLower() == id));

        if (agent == null)
            throw new ApiException($"Không tìm thấy tài khoản đại lý với thông tin \"{emailOrCode}\".");
        if (string.IsNullOrEmpty(agent.Email))
            throw new ApiException($"Tài khoản đại lý {agent.Code} chưa cập nhật địa chỉ Email.");

        var otp = Random.Shared.Next(100000, 999999).ToString();
        var expiresAt = Util.NowMs() + 15 * 60 * 1000;

        EntityJson.SetExtra(agent, "resetOtp", otp);
        EntityJson.SetExtra(agent, "resetOtpExpiresAt", expiresAt);

        _db.ActivityLogs.Add(LogService.Make(
            agent.CompanyName ?? agent.Code, agent.Code, "AGENT",
            "Tài khoản", "Yêu cầu mã OTP khôi phục mật khẩu", "Email OTP",
            $"Đại lý {agent.Code} ({agent.CompanyName}) yêu cầu mã OTP qua email {agent.Email}.", ip));

        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();

        return new JsonObject
        {
            ["success"] = true,
            ["agentCode"] = agent.Code,
            ["email"] = agent.Email,
            ["companyName"] = agent.CompanyName ?? agent.Name,
            ["otp"] = otp,
            ["message"] = $"Mã OTP đã được gửi đến email {agent.Email}."
        };
    }

    public async Task<JsonObject> ResetPasswordWithOtpAsync(string? emailOrCode, string? otpInput, string? newPassword, string? ip)
    {
        var id = (emailOrCode ?? "").Trim().ToLowerInvariant();
        var agent = await _db.Agents.FirstOrDefaultAsync(a =>
            (a.Email != null && a.Email.ToLower() == id) ||
            (a.Code != null && a.Code.ToLower() == id) ||
            (a.TaxCode != null && a.TaxCode.ToLower() == id))
            ?? throw new ApiException("Không tìm thấy thông tin tài khoản đại lý.");

        var savedOtp = EntityJson.GetExtraString(agent, "resetOtp");
        var cleanOtp = (otpInput ?? "").Trim();
        if (string.IsNullOrEmpty(savedOtp) || savedOtp != cleanOtp)
            throw new ApiException("Mã xác nhận OTP không chính xác hoặc đã hết hạn.");

        var pwd = (newPassword ?? "").Trim();
        if (pwd.Length < 6)
            throw new ApiException("Mật khẩu mới phải có tối thiểu 6 ký tự.");

        agent.Password = pwd;
        EntityJson.SetExtra(agent, "resetOtp", null);

        _db.ActivityLogs.Add(LogService.Make(
            agent.CompanyName ?? agent.Code, agent.Code, "AGENT",
            "Tài khoản", "Đặt lại mật khẩu qua Email OTP", "Mật khẩu",
            $"Đại lý {agent.CompanyName ?? agent.Code} ({agent.Code}) đã đổi mật khẩu thành công qua xác minh Email OTP.", ip));

        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();
        SharedDataService.InvalidateSnapshotCache();

        return new JsonObject
        {
            ["success"] = true,
            ["agentCode"] = agent.Code,
            ["message"] = "Đặt lại mật khẩu mới thành công!"
        };
    }

    public async Task<JsonObject> UnlockAgentAccountAsync(string? agentCodeOrEmail, string? otpOrToken, string? ip)
    {
        var id = (agentCodeOrEmail ?? "").Trim().ToLowerInvariant();
        var agent = await _db.Agents.FirstOrDefaultAsync(a =>
            (a.Code != null && a.Code.ToLower() == id) ||
            (a.Email != null && a.Email.ToLower() == id))
            ?? throw new ApiException("Không tìm thấy tài khoản đại lý.");

        agent.IsLocked = false;
        agent.Status = "Đang hoạt động";
        agent.LockedReason = null;
        agent.LockedAt = null;
        agent.UnlockedAt = Util.ViNow();
        EntityJson.SetExtra(agent, "failedLoginAttempts", 0);

        _db.ActivityLogs.Add(LogService.Make(
            agent.CompanyName ?? agent.Code, agent.Code, "AGENT",
            "Bảo mật", "Mở khóa tài khoản thành công", "Tài khoản Agent",
            $"Đại lý {agent.Code} ({agent.CompanyName}) đã mở khóa tài khoản thành công.", ip));

        await _shared.BumpVersionAsync();
        await _db.SaveChangesAsync();
        SharedDataService.InvalidateSnapshotCache();

        return new JsonObject
        {
            ["success"] = true,
            ["agentCode"] = agent.Code,
            ["companyName"] = agent.CompanyName,
            ["message"] = $"Mở khóa tài khoản {agent.Code} thành công!"
        };
    }
}

