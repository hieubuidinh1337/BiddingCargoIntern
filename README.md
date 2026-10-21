# BiddingCargo.Web — ASP.NET Core 8 Razor Pages

Bản chuyển đổi của dự án Node.js (`server.js`, HTML tĩnh) sang **.NET 8 + Razor Pages + EF Core**.

## Chạy
```bash
dotnet restore
dotnet run            # http://localhost:8085
```
- Database mặc định: SQLite `database.sqlite` (tự tạo + nạp dữ liệu mẫu). Dùng lại được file `database.sqlite` của bản Node (tự thêm cột `extra_json`).
- Đổi sang SQL Server: `Database:Provider = SqlServer` và `Database:SqlServer` trong `appsettings.json`.
- Tài khoản mẫu như cũ: `admin/admin2026`, `staff01/staff2026`, `AG-0892/abc123456`...

## Cấu hình bí mật (KHÔNG ghi vào git)
```bash
dotnet user-secrets init
dotnet user-secrets set "Smtp:User" "you@gmail.com"
dotnet user-secrets set "Smtp:Pass" "<app password>"
dotnet user-secrets set "Momo:PartnerCode" "..."; dotnet user-secrets set "Momo:AccessKey" "..."; dotnet user-secrets set "Momo:SecretKey" "..."
```
Chưa cấu hình SMTP → email được lưu vào `App_Data/outbox/*.eml`.

## Cấu trúc
| Node.js | .NET |
|---|---|
| `server.js` routes `/api/*` | `Endpoints/ApiEndpoints.cs` (giữ nguyên URL + JSON) |
| `db.js`, `schema.sql` | `Data/*` (EF Core, cùng tên bảng/cột) |
| reconcile*/isWonAuctionExpired | `Services/AuctionRules.cs` |
| `/api/data` GET/POST | `Services/SharedDataService.cs` |
| `placeBidAtomic` | `Services/BidService.cs` |
| chat, nodemailer, MoMo, hoàn tiền | `ChatService`, `EmailService`+`EmailTemplates`, `WonAuctionService` |
| `*.html` (23 trang) | `Pages/*.cshtml`, `Pages/Admin/*.cshtml` (URL sạch: `/login`, `/admin/dashboard`…; `.html` cũ tự redirect) |
| `assets/`, `style.css`, `uploads/` | `wwwroot/` |

JavaScript phía client (`cargo-store.js`, `chat-bubble.js`, script trong trang) giữ nguyên, chỉ bỏ URL `localhost:8085`.
