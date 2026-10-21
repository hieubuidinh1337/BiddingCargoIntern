# BiddingCargo.Web — ASP.NET Core 8 Razor Pages + SQL Server

## Chạy
1. Cài .NET 8 SDK và SQL Server (LocalDB / Express / Developer đều được).
2. Sửa chuỗi kết nối trong `appsettings.json` → `ConnectionStrings:DefaultConnection`.
3. `dotnet restore && dotnet run` → http://localhost:8085
   Lần đầu chạy, ứng dụng tự tạo database và các bảng (`EnsureCreated`). **Không có dữ liệu mẫu nào** trong database.

## Đăng nhập lần đầu
Trang quản trị `/admin` dùng tài khoản khởi tạo duy nhất `admin` / `admin2026` (khai báo trong `wwwroot/assets/js/cargo-store.js`, hằng `seedAdmins`).
Hãy đổi mật khẩu ngay, rồi tạo các tài khoản khác. Đại lý tự đăng ký tại `/register` và Admin duyệt.

## Không còn kết nối ra ngoài
- Không SQLite, không MoMo, không SMTP. `/api/send-email` chỉ dựng nội dung và ghi bảng `email_logs`
  (muốn gửi thật: override `EmailService.DeliverAsync`).
- Giao diện thanh toán chỉ còn chuyển khoản ngân hàng (VietQR). Cần nhập thông tin ngân hàng ở Admin → Cài đặt.

## Cấu trúc
- `Data/Entities/*.cs` — mỗi entity một file; `Data/AppDbContext.cs`, `Data/DbInitializer.cs`
- `Services/` — SharedDataService, BidService, ChatService, LogService, WonAuctionService, EmailService, AuctionRules
- `Endpoints/ApiEndpoints.cs` — REST `/api/*`
- `Pages/` — 23 trang Razor (URL sạch như `/login`, `/admin/dashboard`; `.html` cũ tự redirect)
