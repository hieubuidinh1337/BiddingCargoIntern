# KẾ HOẠCH KIỂM THỬ (TEST PLAN) - HỆ THỐNG BID CARGO

*Tài liệu này được lập dựa trên TÀI LIỆU GIẢI PHÁP BID CARGO CHO AGENTS (v1.0).*

## 1. Tổng quan
- **Mục tiêu:** Kiểm thử các chức năng của hệ thống đấu giá tải trọng vận chuyển hàng hóa (Bid Cargo) nhằm đảm bảo hệ thống hoạt động đúng theo yêu cầu thiết kế, quy trình nghiệp vụ và các tiêu chuẩn bảo mật.
- **Phạm vi:** Kiểm thử chức năng, phi chức năng, phân quyền người dùng và luồng nghiệp vụ đấu giá kín.

## 2. Đối tượng kiểm thử (Actors)
- **Khách (Guest):** Chưa đăng nhập, chưa có quyền vào các chức năng nội bộ. Có thể xem thông tin chung và gửi yêu cầu đăng ký tài khoản đại lý.
- **Đại lý (Agent):** Tài khoản đã được phê duyệt và kích hoạt thành công. Có quyền xem danh sách chuyến bay, tham gia đấu giá, xem lịch sử đấu giá cá nhân.
- **Nhân viên (Staff):** Người dùng nội bộ có quyền tạo chuyến bay đấu giá, cấu hình các thông số đấu giá.
- **Quản trị viên (Admin):** Quản lý toàn bộ hoạt động hệ thống, phê duyệt hồ sơ người dùng (đại lý), quản lý các phiên đấu giá và xem tổng hợp kết quả.

## 3. Môi trường kiểm thử
- **Trình duyệt (Browser):** Google Chrome, Mozilla Firefox, Microsoft Edge (các phiên bản mới nhất, yêu cầu hỗ trợ JavaScript).
- **Thiết bị (Device):** Máy tính để bàn (PC), Laptop có kết nối mạng internet ổn định.

## 4. Các kịch bản kiểm thử (Test Cases / Scenarios)

### 4.1. Quản lý người dùng (User Management)
| ID | Chức năng | Hành động | Kết quả mong đợi |
|---|---|---|---|
| UM-01 | Đăng ký đại lý | Khách nhập thông tin và tải lên tài liệu định danh | Hệ thống ghi nhận hồ sơ ở trạng thái chờ duyệt |
| UM-02 | Duyệt hồ sơ | Admin xem và phê duyệt hồ sơ đại lý | Tài khoản được cấp quyền "Đại lý", hệ thống cấp tài khoản đăng nhập |
| UM-03 | Đăng nhập hệ thống | Đăng nhập với các vai trò khác nhau (Admin, Staff, Agent) | Trình duyệt chuyển hướng đến menu chức năng tương ứng với phạm vi quyền hạn của từng người dùng |

### 4.2. Quản lý phiên đấu giá (Auction Management)
| ID | Chức năng | Hành động | Kết quả mong đợi |
|---|---|---|---|
| AM-01 | Tạo chuyến bay đấu giá | Staff/Admin tạo chuyến bay mới với các thông số: thời gian, giá khởi điểm, bước giá | Chuyến bay được tạo và lưu trữ trên hệ thống thành công |
| AM-02 | Mở/Đóng phiên đấu giá | Bật/tắt phiên đấu giá theo thời gian thực hoặc thủ công | Các đại lý chỉ thấy và tham gia được khi phiên đang mở |
| AM-03 | Tổng hợp kết quả | Đóng phiên đấu giá | Hệ thống tự động tính toán, chốt danh sách và thông báo đại lý trúng thầu |

### 4.3. Nghiệp vụ đấu giá trực tuyến (Bidding Flow)
| ID | Chức năng | Hành động | Kết quả mong đợi |
|---|---|---|---|
| BF-01 | Xem danh sách đấu giá | Đại lý truy cập chức năng xem chuyến bay đấu giá | Chỉ hiển thị các chuyến bay được phép xem và đang mở thầu |
| BF-02 | Đặt giá thầu (Bidding) | Đại lý đặt mức giá thầu cho chuyến bay | Ghi nhận giá thầu, hệ thống phản hồi xác nhận |
| BF-03 | Bảo mật giá thầu (Ẩn danh) | Đại lý khác đang cùng tham gia phiên đấu giá xem danh sách thầu | Chỉ thấy giá của đối thủ, KHÔNG thấy thông tin người đặt thầu (VD hiển thị: Agent-***) |
| BF-04 | Xem lịch sử đấu giá | Đại lý truy cập lịch sử cá nhân | Chỉ xem được các phiên đã tham gia và trạng thái (Thắng/Thua) |

### 4.4. Yêu cầu phi chức năng (Non-Functional Requirements)
- **NF-01 (Giao diện):** Kiểm tra hiển thị tốt trên nhiều kích thước màn hình, mầu sắc hài hòa, hiện đại, bố cục chức năng rõ ràng, mạch lạc, tránh lặp bước.
- **NF-02 (Bảo mật thông tin):** Kiểm tra người dùng (Đại lý, Nhân viên) tuyệt đối không có quyền xem thông tin chi tiết và giá đấu của các đại lý khác trong thời gian diễn ra phiên đấu giá. Thông tin được mã hóa/bảo mật hoàn toàn.
- **NF-03 (Bảo mật quyền truy cập):** URL giả mạo (truy cập đường dẫn của Admin bằng tài khoản Agent) phải bị chặn (Lỗi 403 Forbidden).
