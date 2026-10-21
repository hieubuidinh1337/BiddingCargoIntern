using System.Globalization;
using System.Text.RegularExpressions;

namespace BiddingCargo.Web.Services;

public static class Util
{
    public static long NowMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    public static string IsoNow() => DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture);

    public static string ToIso(DateTimeOffset d) => d.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture);

    /// <summary>dd/MM/yyyy HH:mm:ss (giờ địa phương) - dùng cho nhật ký hoạt động.</summary>
    public static string LogTimestamp(DateTime local) => local.ToString("dd/MM/yyyy HH:mm:ss", CultureInfo.InvariantCulture);

    /// <summary>Tương đương toLocaleString('vi-VN'): "14:30:05 15/8/2026".</summary>
    public static string ViNow() => DateTime.Now.ToString("HH:mm:ss d/M/yyyy", CultureInfo.InvariantCulture);

    /// <summary>Định dạng số kiểu vi-VN (18.500) - không phụ thuộc ICU của máy chủ.</summary>
    public static string FmtVi(long n) => n.ToString("#,0", CultureInfo.InvariantCulture).Replace(",", ".");

    public static DateTimeOffset? ParseIso(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        return DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var d) ? d : null;
    }

    private static readonly Regex P1 = new(@"^(\d{1,2}):(\d{2})\s+(\d{1,2})/(\d{1,2})/(\d{4})$", RegexOptions.Compiled);
    private static readonly Regex P2 = new(@"^(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2})$", RegexOptions.Compiled);

    /// <summary>Port của parseFlightDate: "14:30 · 15/08/2026", "15/08/2026 14:30" hoặc ISO.</summary>
    public static DateTime? ParseFlightDate(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var clean = Regex.Replace(Regex.Replace(s, "[·-]", " "), @"\s+", " ").Trim();
        try
        {
            var m = P1.Match(clean);
            if (m.Success)
                return new DateTime(int.Parse(m.Groups[5].Value), int.Parse(m.Groups[4].Value), int.Parse(m.Groups[3].Value),
                                    int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), 0, DateTimeKind.Local);
            m = P2.Match(clean);
            if (m.Success)
                return new DateTime(int.Parse(m.Groups[3].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[1].Value),
                                    int.Parse(m.Groups[4].Value), int.Parse(m.Groups[5].Value), 0, DateTimeKind.Local);
        }
        catch (ArgumentOutOfRangeException) { return null; }
        return DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var d) ? d.LocalDateTime : null;
    }

    /// <summary>Phân tích "dd/MM/yyyy HH:mm:ss" (định dạng timestamp của nhật ký) → epoch ms; 0 nếu không hợp lệ.</summary>
    public static long ParseLogTimestamp(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return 0;
        var m = Regex.Match(s.Trim(), @"^(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$");
        try
        {
            if (m.Success)
            {
                var d = new DateTime(int.Parse(m.Groups[3].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[1].Value),
                    m.Groups[4].Success ? int.Parse(m.Groups[4].Value) : 0,
                    m.Groups[5].Success ? int.Parse(m.Groups[5].Value) : 0,
                    m.Groups[6].Success ? int.Parse(m.Groups[6].Value) : 0, DateTimeKind.Local);
                return new DateTimeOffset(d).ToUnixTimeMilliseconds();
            }
        }
        catch (ArgumentOutOfRangeException) { return 0; }
        var p = ParseIso(s);
        return p?.ToUnixTimeMilliseconds() ?? 0;
    }

    public static string? NullIfEmpty(string? s) => string.IsNullOrEmpty(s) ? null : s;

    public static bool IsAnonCode(string? code)
    {
        var c = (code ?? "").Trim().ToUpperInvariant();
        return c == "AG-***" || c == "ANONYMOUS";
    }
}
