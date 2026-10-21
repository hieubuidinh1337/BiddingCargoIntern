using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace BiddingCargo.Web.Services;

/// <summary>Các mẫu email HTML của hệ thống (port từ server.js). Mọi giá trị chèn vào đều được HTML-encode.</summary>
public static class EmailTemplates
{
    public const string SubjectPrefix = "[Vietravel Airlines Cargo]";

    private static string E(string? s) => WebUtility.HtmlEncode(s ?? "");
    private static string Td(string? s) => E(s);

    private static string Row(string label, string valueHtml, string valueStyle = "", bool last = false, string labelExtra = "") =>
        $"<tr><td style=\"color:#555;{(last ? "" : "border-bottom:1px solid #e0e0e0;")}{labelExtra}\">{label}</td><td style=\"{valueStyle}\">{valueHtml}</td></tr>";

    private static string Table(string bg, string border, params string[] rows) =>
        $"<table role=\"presentation\" width=\"100%\" cellpadding=\"8\" cellspacing=\"0\" style=\"background:{bg};border:1px solid {border};border-radius:6px;margin:16px 0;\">{string.Concat(rows)}</table>";

    private static string Button(string url, string color, string text) =>
        $"<p style=\"text-align:center;margin:24px 0;\"><a href=\"{E(url)}\" style=\"display:inline-block;background-color:{color};color:#ffffff;font-weight:bold;padding:12px 28px;border-radius:6px;text-decoration:none;\">{text}</a></p>";

    public static string Layout(string title, string subtitleHtml, string contentHtml, string? footerNote = null) => $$"""
<!DOCTYPE html>
<html lang="vi" xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>{{E(title)}}</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,Helvetica,sans-serif;color:#333333;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="580" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #dddddd;border-radius:8px;overflow:hidden;">
  <tr><td style="background-color:#1e3a5f;padding:24px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="font-size:14px;font-weight:bold;color:#ffffff;padding-bottom:4px;">VU CARGO &mdash; Vietravel Airlines</td></tr>
      <tr><td style="font-size:11px;color:#b0c4de;letter-spacing:0.5px;">Air Cargo Bidding System</td></tr>
      <tr><td style="font-size:18px;font-weight:bold;color:#ffffff;padding-top:16px;">{{E(title)}}</td></tr>
      <tr><td style="font-size:13px;color:#d0d8e8;padding-top:4px;">{{subtitleHtml}}</td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:28px;font-size:14px;line-height:1.6;color:#333333;">{{contentHtml}}</td></tr>
  <tr><td style="background-color:#f9f9f9;padding:20px 28px;border-top:1px solid #eeeeee;text-align:center;font-size:12px;color:#888888;">
    <p style="margin:0 0 4px 0;font-weight:bold;color:#555555;">Ban Quản lý Hàng hóa Vietravel Airlines (VU Cargo)</p>
    <p style="margin:0 0 8px 0;">Hotline: <strong style="color:#1e3a5f;">1900 6699</strong> &middot; ops-cargo@vietravelairlines.vn</p>
    <p style="margin:0;font-size:11px;color:#aaaaaa;">{{E(footerNote ?? "Email thông báo từ Hệ thống VU Cargo.")}}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>
""";

    private static string S(JsonNode? o, string key) => EntityJson.Str(o, key) ?? "";
    private static string First(params string?[] values) => values.FirstOrDefault(v => !string.IsNullOrEmpty(v)) ?? "";
    private static string Num(long? n) => Util.FmtVi(n ?? 0);

    /// <summary>Trả về (subject, html). <paramref name="baseUrl"/> là địa chỉ gốc của website để dựng liên kết.</summary>
    public static (string Subject, string Html) Build(string type, JsonObject req, string recipient, string baseUrl)
    {
        var reg = req["regData"] as JsonObject;
        var company = First(S(reg, "companyName"), "Quý doanh nghiệp");
        var rep = First(S(reg, "repName"), "Quý đại lý");
        var regId = First(S(reg, "regId"), "REG-PENDING");
        var won = req["wonData"] as JsonObject ?? new JsonObject();
        var customSubject = S(req, "customSubject");
        var customHtml = S(req, "customHtml");
        var now = Util.ViNow();

        switch (type)
        {
            case "TEST_EMAIL":
                return ($"{SubjectPrefix} KIỂM TRA KẾT NỐI EMAIL THÀNH CÔNG ({DateTime.Now:HH:mm:ss})",
                    Layout("Kiểm tra Cấu hình Email Thành công", "Hệ thống Đấu giá Hàng hóa Vietravel Airlines Cargo",
                        $"<p>Xin chào <strong>{E(recipient)}</strong>,</p>" +
                        "<p style=\"color:#2e7d32;font-weight:bold;\">Cấu hình gửi thư SMTP của bạn đã hoạt động chính xác.</p>" +
                        Table("#f0f7f0", "#c8e6c9",
                            Row("Hộp thư nhận:", E(recipient), "font-weight:bold;color:#1565c0;"),
                            Row("Thời gian gửi:", E(now)),
                            Row("Trạng thái:", "HOẠT ĐỘNG (REAL SMTP)", "font-weight:bold;color:#2e7d32;", last: true)) +
                        "<p style=\"margin-top:16px;\">Từ bây giờ, các thông báo sẽ được gửi trực tiếp đến hòm thư này:</p>" +
                        "<ul style=\"padding-left:20px;line-height:1.7;\"><li>Xác nhận tiếp nhận hồ sơ đại lý.</li><li>Thông báo kết quả phê duyệt và cấp Mã Đại lý.</li><li>Phiếu xác nhận thắng thầu.</li></ul>"));

            case "REGISTRATION_SUBMITTED":
                return ($"{SubjectPrefix} Tiếp nhận hồ sơ đăng ký đại lý - {regId}",
                    Layout("Xác nhận Tiếp nhận Hồ sơ Đăng ký Đại lý", $"Mã hồ sơ: {E(regId)}",
                        $"<p>Kính gửi <strong>{E(rep)}</strong> (Đại diện <strong>{E(company)}</strong>),</p>" +
                        "<p>Hệ thống Vietravel Airlines trân trọng thông báo đã tiếp nhận thành công hồ sơ đăng ký đại lý của Quý công ty.</p>" +
                        Table("#f5f5f5", "#e0e0e0",
                            Row("Mã tiếp nhận:", E(regId), "font-weight:bold;color:#1565c0;font-family:monospace;"),
                            Row("Tên doanh nghiệp:", E(company)),
                            Row("Mã số thuế:", E(First(S(reg, "taxCode"), "-"))),
                            Row("Người đại diện:", $"{E(rep)} ({E(First(S(reg, "repPosition"), "Đại diện"))})"),
                            Row("Số điện thoại:", E(First(S(reg, "phone"), "-"))),
                            Row("Thời gian tiếp nhận:", E(First(S(reg, "submittedAt"), now))),
                            Row("Trạng thái:", "CHỜ XÉT DUYỆT", "font-weight:bold;color:#e65100;", last: true)) +
                        "<p style=\"margin-top:16px;\"><strong>Quy trình tiếp theo:</strong></p>" +
                        "<ol style=\"padding-left:20px;line-height:1.7;\"><li>Ban Điều hành sẽ thẩm định hồ sơ trong vòng <strong>24 giờ làm việc</strong>.</li>" +
                        "<li>Khi hồ sơ được duyệt, hệ thống sẽ gửi email kèm <strong>Mã Đại lý (AG-xxxx)</strong>.</li>" +
                        "<li>Quý công ty dùng Mã đại lý, Mật khẩu và Mã PIN để đăng nhập tham gia đấu giá.</li></ol>"));

            case "REGISTRATION_APPROVED":
            {
                var code = First(S(req, "agentCode"), S(reg, "code"), "AG-0001");
                return ($"{SubjectPrefix} CHÚC MỪNG! Hồ sơ Đại lý đã được PHÊ DUYỆT - Mã: {code}",
                    Layout("Chúc mừng! Hồ sơ Đại lý đã được PHÊ DUYỆT", $"Mã đại lý chính thức: {E(code)}",
                        $"<p>Kính gửi <strong>{E(rep)}</strong> (Đại diện <strong>{E(company)}</strong>),</p>" +
                        "<p style=\"color:#2e7d32;font-weight:bold;\">Hồ sơ đăng ký đại lý của Quý công ty đã được thẩm định và phê duyệt thành công.</p>" +
                        Table("#f0f7f0", "#c8e6c9",
                            Row("Mã Đại lý:", E(code), "font-weight:bold;color:#2e7d32;font-family:monospace;font-size:16px;"),
                            Row("Tên doanh nghiệp:", E(company)),
                            Row("Tên đăng nhập:", $"{E(code)} hoặc MST ({E(S(reg, "taxCode"))})", "font-family:monospace;font-weight:bold;"),
                            Row("Mật khẩu:", "Mật khẩu Quý vị đã đăng ký", "font-family:monospace;"),
                            Row("Mã PIN:", "Mã PIN Quý vị đã đăng ký", "font-family:monospace;"),
                            Row("Trạng thái:", "ĐÃ HOẠT ĐỘNG", "font-weight:bold;color:#2e7d32;", last: true)) +
                        Button(baseUrl + "/login", "#1565c0", "ĐĂNG NHẬP THAM GIA ĐẤU GIÁ") +
                        "<p><strong>Hướng dẫn tham gia đấu giá:</strong></p><ul style=\"padding-left:20px;line-height:1.7;\">" +
                        "<li>Đăng nhập bằng Mã đại lý, Mật khẩu và Mã PIN đã đăng ký.</li>" +
                        "<li>Theo dõi các phiên đấu giá đang mở và đặt giá thầu theo bước giá tối thiểu.</li>" +
                        "<li>Theo dõi kết quả trúng thầu và xác nhận hợp đồng vận chuyển điện tử ngay trên ứng dụng.</li></ul>"));
            }

            case "REGISTRATION_REJECTED":
            {
                var reason = First(S(req, "reason"), S(reg, "rejectionReason"), S(reg, "rejectReason"), "Hồ sơ chưa đạt tiêu chuẩn theo quy chế xét duyệt đại lý");
                return ($"{SubjectPrefix} Yêu cầu bổ sung / Kết quả xét duyệt hồ sơ đại lý - {regId}",
                    Layout("Thông báo Kết quả Xét duyệt Hồ sơ Đại lý", $"Mã hồ sơ: {E(regId)}",
                        $"<p>Kính gửi <strong>{E(rep)}</strong> (Đại diện <strong>{E(company)}</strong>),</p>" +
                        "<p>Ban Điều hành Đấu giá Vietravel Airlines Cargo trân trọng cảm ơn Quý doanh nghiệp đã nộp hồ sơ đăng ký tham gia sàn đấu giá.</p>" +
                        Table("#fff3e0", "#ffe0b2",
                            Row("Mã hồ sơ:", E(regId), "font-weight:bold;color:#e65100;", labelExtra: "width:35%;"),
                            Row("Doanh nghiệp:", E(company)),
                            Row("Kết quả xét duyệt:", "TỪ CHỐI / YÊU CẦU BỔ SUNG", "font-weight:bold;color:#d32f2f;"),
                            Row("Lý do &amp; Hướng dẫn:", E(reason), "color:#d32f2f;font-weight:bold;line-height:1.5;", last: true)) +
                        "<p style=\"margin-top:16px;\">Để không làm gián đoạn kế hoạch tham gia đấu giá tải trọng, Quý công ty vui lòng bấm vào nút bên dưới để chỉnh sửa và bổ sung thông tin cần thiết:</p>" +
                        Button($"{baseUrl}/register?resubmit={Uri.EscapeDataString(regId)}", "#d32f2f", "CHỈNH SỬA &amp; NỘP LẠI HỒ SƠ") +
                        "<p style=\"font-size:12px;color:#666;\">Nếu cần hỗ trợ thêm, Quý doanh nghiệp vui lòng liên hệ Ban Quản trị qua Hotline <strong>1900 1337</strong> hoặc email <strong>cargo@vietravelairlines.vn</strong>.</p>"));
            }

            case "AUCTION_WON":
            {
                var auc = req["auctionData"] as JsonObject;
                var wonId = First(S(won, "wonId"), "WON-ORDER");
                var flight = First(S(won, "flightNumber"), S(auc, "flightNumber"));
                var route = First(S(won, "route"), S(auc, "route"));
                var cap = EntityJson.Lng(won, "capacityKg") ?? 0;
                var price = EntityJson.Lng(won, "priceKg") ?? 0;
                var total = EntityJson.Lng(won, "totalAmountVND") ?? price * cap;
                var awb = First(S(won, "awbNumber"), "998-XXXXXXXX");
                return ($"{SubjectPrefix} CHÚC MỪNG TRÚNG THẦU! Đơn hàng {wonId} - Chuyến {flight} ({route})",
                    Layout("Chúc mừng Quý đại lý đã TRÚNG THẦU!", $"Mã đơn trúng thầu: {E(wonId)} &middot; Chuyến bay {E(flight)}",
                        $"<p>Kính gửi Quý đại lý <strong>{E(First(S(req, "agentName"), "Ủy quyền"))}</strong> ({E(First(S(req, "agentCode"), "AG"))}),</p>" +
                        "<p style=\"color:#2e7d32;font-weight:bold;\">Vietravel Airlines Cargo trân trọng thông báo Quý công ty đã chính thức THẮNG THẦU lô hàng tải trọng đường hàng không.</p>" +
                        Table("#f0f7f0", "#c8e6c9",
                            Row("Mã đơn thắng thầu:", E(wonId), "font-weight:bold;color:#1565c0;font-family:monospace;"),
                            Row("Chuyến bay / Tuyến:", $"{E(flight)} ({E(route)})", "font-weight:bold;color:#333;"),
                            Row("Tải trọng chốt thắng:", $"{Num(cap)} Kg", "font-weight:bold;color:#1565c0;"),
                            Row("Mức giá chốt:", $"{Num(price)} đ / Kg", "font-weight:bold;color:#2e7d32;"),
                            Row("Tổng tiền thanh toán:", $"{Num(total)} đ", "font-weight:bold;color:#d32f2f;font-size:16px;"),
                            Row("Mã vận đơn (AWB):", E(awb), "font-family:monospace;font-weight:bold;color:#1565c0;"),
                            Row("Hạn chót thanh toán:", "Trong vòng 24 giờ kể từ thời điểm chốt thầu", "color:#d32f2f;font-weight:bold;", last: true)) +
                        "<p style=\"margin-top:16px;\"><strong>Hướng dẫn tiếp theo:</strong></p>" +
                        "<ol style=\"padding-left:20px;line-height:1.7;\"><li>Đăng nhập hệ thống Sàn Đấu giá Cargo và truy cập mục <strong>Thắng thầu (Won Auctions)</strong>.</li>" +
                        "<li>Hoàn tất chuyển khoản thanh toán và bấm <em>Báo đã chuyển khoản</em> để Ban Điều hành xác nhận.</li>" +
                        "<li>Tải Phiếu Xác Nhận Trúng Thầu (PDF) và bàn giao hàng hóa tại kho theo đúng giờ Cut-off.</li></ol>" +
                        Button(baseUrl + "/won-auction", "#2e7d32", "XEM ĐƠN TRÚNG THẦU &amp; VẬN ĐƠN")));
            }

            case "PAYMENT_CONFIRMED":
            {
                var wonId = First(S(won, "wonId"), "WON-ORDER");
                var flight = S(won, "flightNumber"); var route = S(won, "route");
                var total = EntityJson.Lng(won, "totalAmountVND") ?? 0;
                var awb = First(S(won, "awbNumber"), "998-XXXXXXXX");
                return ($"{SubjectPrefix} XÁC NHẬN ĐÃ NHẬN THANH TOÁN - Đơn hàng {wonId}",
                    Layout("Xác nhận Đã Nhận Thanh Toán Thành Công", $"Mã đơn: {E(wonId)} &middot; Chuyến bay {E(flight)}",
                        "<p>Kính gửi Quý đại lý,</p>" +
                        "<p style=\"color:#2e7d32;font-weight:bold;\">Ban Tài chính &amp; Điều hành Vietravel Airlines Cargo xác nhận đã nhận đủ số tiền thanh toán cho đơn hàng thắng thầu của Quý công ty.</p>" +
                        Table("#f0f7f0", "#c8e6c9",
                            Row("Mã đơn thắng thầu:", E(wonId), "font-weight:bold;color:#1565c0;font-family:monospace;"),
                            Row("Chuyến bay / Tuyến:", $"{E(flight)} ({E(route)})"),
                            Row("Số tiền đã nhận:", $"{Num(total)} đ", "font-weight:bold;color:#2e7d32;font-size:16px;"),
                            Row("Mã AWB điện tử:", E(awb), "font-family:monospace;font-weight:bold;color:#1565c0;"),
                            Row("Trạng thái thanh toán:", "ĐÃ THANH TOÁN (PAID)", "font-weight:bold;color:#2e7d32;", last: true)) +
                        "<p style=\"margin-top:16px;\">Slot vận chuyển của Quý đại lý đã được giữ chính thức. Vui lòng in/xuất trình Phiếu xác nhận khi bàn giao hàng tại kho.</p>" +
                        Button(baseUrl + "/won-auction", "#1565c0", "XEM &amp; TẢI PHIẾU BÀN GIAO KHO")));
            }

            case "PAYMENT_REJECTED":
            {
                var wonId = First(S(won, "wonId"), S(req, "wonId"), "WON-ORDER");
                var flight = First(S(won, "flightNumber"), S(req, "flightNumber"));
                var route = First(S(won, "route"), S(req, "route"));
                var reason = First(S(req, "reason"), S(won, "rejectionReason"), "Biên lai hoặc mã giao dịch không hợp lệ");
                return ($"{SubjectPrefix} ❌ YÊU CẦU NỘP LẠI BIÊN LAI THANH TOÁN - Đơn hàng {wonId}",
                    Layout("Yêu Cầu Nộp Lại Biên Lai Thanh Toán", $"Mã đơn: {E(wonId)} &middot; Chuyến bay {E(flight)}",
                        "<p>Kính gửi Quý đại lý,</p>" +
                        $"<p style=\"color:#d32f2f;font-weight:bold;\">Ban Tài chính &amp; Tra soát Vietravel Airlines Cargo đã kiểm tra thông tin chuyển khoản cho đơn hàng {E(wonId)} và yêu cầu Quý đại lý NỘP LẠI BIÊN LAI THANH TOÁN.</p>" +
                        Table("#ffebee", "#ffcdd2",
                            Row("Mã đơn thắng thầu:", E(wonId), "font-weight:bold;color:#1565c0;font-family:monospace;", labelExtra: "width:35%;"),
                            Row("Chuyến bay / Tuyến:", $"{E(flight)} ({E(route)})"),
                            Row("Lý do từ chối biên lai:", E(reason), "font-weight:bold;color:#d32f2f;font-size:14px;"),
                            Row("Thời gian tra soát:", E(now), "font-weight:bold;color:#333;", last: true)) +
                        "<p style=\"margin-top:16px;\">Vui lòng kiểm tra lại sao kê chuyển khoản ngân hàng, chụp rõ ảnh biên lai/mã FT và truy cập sàn đấu giá để <strong>NỘP LẠI BIÊN LAI MỚI</strong> trước thời hạn thanh toán.</p>" +
                        Button(baseUrl + "/won-auction", "#d32f2f", "NỘP LẠI BIÊN LAI THANH TOÁN")));
            }

            case "ROUTE_AUCTION_OPEN" or "NEW_AUCTION_ALERT":
            {
                var auc = req["auctionData"] as JsonObject;
                var flight = First(S(auc, "flightNumber"), S(req, "flightNumber"));
                var route = First(S(auc, "route"), S(req, "route"));
                var fromName = First(S(auc, "originName"), S(req, "originName"));
                var toName = First(S(auc, "destName"), S(req, "destName"));
                var cap = EntityJson.Lng(auc, "capacityKg") ?? EntityJson.Lng(req, "capacityKg") ?? 0;
                var start = EntityJson.Lng(auc, "startingPriceKg") ?? EntityJson.Lng(req, "startingPriceKg") ?? 0;
                var etd = First(S(auc, "etd"), S(req, "etd"));
                var aid = First(S(auc, "id"), "1");
                return ($"{SubjectPrefix} 🔔 MỞ ĐẤU GIÁ TUYẾN QUAN TÂM: Chuyến {flight} ({route})",
                    Layout($"Mở Đấu Giá Tuyến Bạn Quan Tâm: {route}", $"Chuyến bay {E(flight)} &middot; {E(fromName)} ➔ {E(toName)}",
                        $"<p>Kính gửi Quý đại lý <strong>{E(First(S(req, "agentName"), "Quý Đại lý"))}</strong> ({E(S(req, "agentCode"))}),</p>" +
                        $"<p>Hệ thống Vietravel Airlines Cargo trân trọng thông báo: Tuyến bay <strong>{E(route)} ({E(fromName)} ➔ {E(toName)})</strong> mà Quý đại lý đã đăng ký theo dõi vừa chính thức mở phiên đấu giá mới với thông tin chi tiết như sau:</p>" +
                        Table("#f0f4ff", "#c7d2fe",
                            Row("Số hiệu chuyến bay:", E(flight), "font-weight:bold;color:#1e3a5f;font-family:monospace;font-size:15px;", labelExtra: "width:38%;"),
                            Row("Hành trình / Tuyến bay:", $"{E(route)} ({E(fromName)} - {E(toName)})", "font-weight:bold;color:#333;"),
                            Row("Giờ cất cánh dự kiến (ETD):", E(etd), "color:#1e3a5f;font-weight:bold;"),
                            Row("Tải trọng mở thầu:", $"{Num(cap)} Kg", "font-weight:bold;color:#1e3a5f;"),
                            Row("Giá khởi điểm sàn:", $"{Num(start)} đ / Kg", "font-weight:bold;color:#2e7d32;font-size:15px;"),
                            Row("Quy định đóng thầu:", "Đóng thầu trước ETD 3 giờ", "color:#d32f2f;font-weight:bold;", last: true)) +
                        "<p style=\"margin-top:16px;\">Quý đại lý vui lòng truy cập sàn đấu giá sớm để đặt mức giá chào tốt nhất và giữ slot vận chuyển:</p>" +
                        Button($"{baseUrl}/detail?id={Uri.EscapeDataString(aid)}", "#1e3a5f", "XEM CHI TIẾT &amp; ĐẶT GIÁ NGAY")));
            }

            case "PAYMENT_SUBMITTED_ADMIN":
            {
                var pd = req["paymentData"] as JsonObject ?? new JsonObject();
                var wonId = First(S(pd, "wonId"), S(req, "wonId"), "WON-ORDER");
                var agentCode = First(S(pd, "agentCode"), S(req, "agentCode"), "AG-XXXX");
                var agentName = First(S(pd, "agentName"), S(req, "agentName"), "Đại lý");
                var flight = First(S(pd, "flightNumber"), S(req, "flightNumber"));
                var route = First(S(pd, "route"), S(req, "route"));
                var total = EntityJson.Lng(pd, "transferredAmount") ?? EntityJson.Lng(pd, "totalAmountVND") ?? EntityJson.Lng(req, "amount") ?? 0;
                var memo = First(S(pd, "memo"), S(req, "memo"));
                var txRef = First(S(pd, "transactionRef"), S(req, "transactionRef"));
                var submitted = First(S(pd, "submittedAt"), now);
                var rows = new List<string>
                {
                    Row("Mã đơn hàng:", E(wonId), "font-weight:bold;color:#1e3a5f;font-family:monospace;font-size:15px;", labelExtra: "width:35%;"),
                    Row("Đại lý thanh toán:", $"{E(agentCode)} - {E(agentName)}", "font-weight:bold;color:#333;"),
                    Row("Chuyến bay &amp; Tuyến:", $"{E(flight)} ({E(route)})", "color:#1e3a5f;font-weight:bold;"),
                    Row("Số tiền báo chuyển:", $"{Num(total)} đ", "font-weight:bold;color:#d32f2f;font-size:16px;"),
                    Row("Cú pháp chuyển khoản:", E(memo), "font-family:monospace;font-weight:bold;color:#2e7d32;background:#e8f5e9;padding:4px 8px;border-radius:4px;")
                };
                if (txRef != "") rows.Add(Row("Mã GD ngân hàng:", E(txRef), "font-family:monospace;font-weight:bold;color:#1565c0;"));
                rows.Add(Row("Thời điểm nộp:", E(submitted), "color:#555;", last: true));
                return ($"{SubjectPrefix} 💳 ĐẠI LÝ BÁO CHUYỂN KHOẢN - Đơn {wonId} ({agentCode})",
                    Layout("Thông Báo: Đại Lý Đã Báo Chuyển Khoản", $"Mã đơn: {E(wonId)} &middot; Đại lý: {E(agentCode)} - {E(agentName)}",
                        "<p>Kính gửi <strong>Ban Quản trị &amp; Bộ phận Kế toán / Tra soát</strong>,</p>" +
                        $"<p>Đại lý <strong>{E(agentName)} ({E(agentCode)})</strong> vừa gửi thông báo đã hoàn tất chuyển khoản thanh toán cho đơn hàng thắng thầu. Vui lòng đối soát sao kê tài khoản ngân hàng và xác nhận đơn hàng trên hệ thống Admin:</p>" +
                        Table("#f5f9ff", "#cfe3f7", rows.ToArray()) +
                        "<p style=\"margin-top:16px;\">Bấm nút bên dưới để chuyển trực tiếp đến màn hình Đối soát &amp; Xác nhận thanh toán:</p>" +
                        Button($"{baseUrl}/admin/auctions?tab=won&search={Uri.EscapeDataString(wonId)}&reconcile={Uri.EscapeDataString(wonId)}", "#0284c7", "ĐỐI SOÁT &amp; DUYỆT ĐƠN TRÊN ADMIN")));
            }

            case "PASSWORD_RESET_OTP":
            {
                var otp = First(S(req, "otp"), "000000");
                var name = First(S(req, "agentName"), "Quý đại lý");
                var code = S(req, "agentCode");
                return ($"{SubjectPrefix} Mã xác thực OTP khôi phục mật khẩu: {otp}",
                    Layout("Yêu cầu Khôi phục Mật khẩu Tài khoản", $"Mã đại lý: {E(code)}",
                        $"<p>Kính gửi <strong>{E(name)}</strong> ({E(code)}),</p>" +
                        "<p>Hệ thống Vietravel Airlines Cargo nhận được yêu cầu đặt lại mật khẩu cho tài khoản đại lý của Quý vị.</p>" +
                        "<div style=\"background:#f0f4ff;border:1px dashed #1e3a5f;border-radius:8px;padding:16px;text-align:center;margin:16px 0;\">" +
                        "<p style=\"font-size:13px;color:#555;margin:0 0 8px 0;font-weight:600;\">MÃ XÁC THỰC (OTP) CỦA BẠN:</p>" +
                        $"<p style=\"font-size:32px;font-weight:bold;letter-spacing:8px;color:#1e3a5f;margin:0;font-family:monospace;\">{E(otp)}</p>" +
                        "<p style=\"font-size:12px;color:#888;margin:8px 0 0 0;\">(Mã này có hiệu lực trong vòng 15 phút. Tuyệt đối không chia sẻ mã này cho bất kỳ ai)</p></div>" +
                        "<p style=\"font-size:13px;color:#555;line-height:1.6;\">Nếu Quý đại lý không thực hiện yêu cầu này, vui lòng bỏ qua email hoặc liên hệ ngay với Hotline <strong>1900.6686</strong> để bảo vệ tài khoản.</p>"));
            }

            case "ACCOUNT_LOCKED_5_FAILS":
            {
                var name = First(S(req, "agentName"), "Quý đại lý");
                var code = S(req, "agentCode");
                var otp = First(S(req, "unlockOtp"), "000000");
                var token = S(req, "unlockToken");
                var lockedAt = First(S(req, "lockedAt"), now);
                var url = $"{baseUrl}/login?action=unlock&code={Uri.EscapeDataString(code)}&token={Uri.EscapeDataString(token)}";
                return ($"{SubjectPrefix} ⚠️ TÀI KHOẢN {code} BỊ TẠM KHÓA DO NHẬP SAI MẬT KHẨU 5 LẦN",
                    Layout("Cảnh Báo Bảo Mật: Tài Khoản Bị Tạm Khóa", $"Mã đại lý: {E(code)} &middot; Thời gian: {E(lockedAt)}",
                        $"<p>Kính gửi <strong>{E(name)}</strong> ({E(code)}),</p>" +
                        "<p style=\"color:#d32f2f;font-weight:bold;\">Hệ thống Vietravel Airlines Cargo phát hiện có 05 lần đăng nhập không thành công liên tiếp vào tài khoản của Quý vị.</p>" +
                        "<p>Để đảm bảo an toàn thông tin và bảo vệ các phiên đấu giá của Quý doanh nghiệp, hệ thống đã <strong>TẠM KHÓA</strong> tài khoản.</p>" +
                        Table("#fff5f5", "#ffcdd2",
                            Row("Tài khoản đại lý:", E(code), "font-weight:bold;color:#1e3a5f;font-family:monospace;", labelExtra: "width:35%;"),
                            Row("Thời điểm khóa:", E(lockedAt), "font-weight:bold;color:#333;"),
                            Row("Nguyên nhân:", "Nhập sai mật khẩu / mã PIN 5 lần liên tiếp", "color:#d32f2f;font-weight:bold;"),
                            Row("Tình trạng:", "ĐÃ TẠM KHÓA AN TOÀN", "font-weight:bold;color:#d32f2f;", last: true)) +
                        "<div style=\"background:#f0f4ff;border:1px dashed #1e3a5f;border-radius:8px;padding:16px;text-align:center;margin:16px 0;\">" +
                        "<p style=\"font-size:13px;color:#555;margin:0 0 8px 0;font-weight:600;\">MÃ XÁC NHẬN (OTP) MỞ KHÓA TÀI KHOẢN (6 SỐ):</p>" +
                        $"<p style=\"font-size:32px;font-weight:bold;letter-spacing:8px;color:#1e3a5f;margin:0;font-family:monospace;\">{E(otp)}</p>" +
                        "<p style=\"font-size:12px;color:#888;margin:8px 0 0 0;\">(Mã này có hiệu lực trong vòng 24 giờ. Tuyệt đối không chia sẻ mã này cho người lạ)</p></div>" +
                        Button(url, "#0284c7", "BẤM VÀO ĐÂY ĐỂ MỞ KHÓA TÀI KHOẢN NGAY") +
                        "<p style=\"font-size:12px;color:#666;line-height:1.6;\">Quý đại lý cũng có thể vào trang đăng nhập của Sàn Cargo và nhập trực tiếp mã OTP 6 số ở trên vào mục \"Mở khóa tài khoản qua Email\".</p>" +
                        "<p style=\"font-size:12px;color:#888;\">Nếu không phải Quý vị thực hiện các lần đăng nhập sai này, vui lòng liên hệ ngay với Hotline <strong>1900.6686</strong> hoặc Email <strong>cargo@vietravelairlines.vn</strong> để được hỗ trợ kiểm tra an toàn tài khoản.</p>"));
            }
        }

        // Email tùy chỉnh / dự phòng
        var subject = First(customSubject, $"{SubjectPrefix} Thông báo hệ thống");
        if (customHtml != "") return (subject, customHtml);

        var title = First(customSubject, S(req, "title"), $"{SubjectPrefix} Thông báo hệ thống");
        var msg = First(S(req, "message"), S(req, "content"), S(req, "text"),
            "Vietravel Airlines Cargo trân trọng thông báo: Quý vị có một thông báo mới từ hệ thống Sàn Đấu giá Cargo.");
        subject = First(customSubject, $"{SubjectPrefix} {First(S(req, "title"), "Thông báo mới")}");
        return (subject, Layout(title, "Thông báo từ Ban Điều hành Sàn Đấu giá Cargo",
            "<p>Kính gửi Quý đại lý / Khách hàng,</p>" +
            $"<p style=\"font-size:14px;color:#333;line-height:1.6;margin:16px 0;\">{E(msg)}</p>" +
            Button(baseUrl + "/dashboard", "#1565c0", "VÀO HỆ THỐNG SÀN ĐẤU GIÁ")));
    }

    public static string HtmlToPlainText(string html)
    {
        var s = Regex.Replace(html, @"<br\s*/?>", "\n", RegexOptions.IgnoreCase);
        s = Regex.Replace(s, @"</p>", "\n\n", RegexOptions.IgnoreCase);
        s = Regex.Replace(s, @"</li>", "\n", RegexOptions.IgnoreCase);
        s = Regex.Replace(s, @"</tr>", "\n", RegexOptions.IgnoreCase);
        s = Regex.Replace(s, @"</div>", "\n", RegexOptions.IgnoreCase);
        s = Regex.Replace(s, @"<[^>]+>", "");
        s = WebUtility.HtmlDecode(s);
        s = Regex.Replace(s, @"\n{3,}", "\n\n");
        return s.Trim();
    }
}
