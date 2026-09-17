const fs = require('fs');
const path = require('path');
const docx = require('docx');

const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
    ImageRun, Header, Footer, PageNumber, NumberFormat
} = docx;

// Path to official logo image
const logoPath = path.join(__dirname, '..', 'assets', 'images', 'vietravel-logo-official.png');
let logoBuffer = null;
if (fs.existsSync(logoPath)) {
    logoBuffer = fs.readFileSync(logoPath);
}

// Helpers for styled text & tables
function createTitleHeader() {
    const tableCells = [];
    
    // Left Cell: Company Name & Logo
    const leftChildren = [
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({ text: "CÔNG TY CỔ PHẦN HÀNG KHÔNG LỮ HÀNH VIỆT NAM", bold: true, size: 18, font: "Times New Roman" }),
            ]
        })
    ];

    if (logoBuffer) {
        leftChildren.push(
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    new ImageRun({
                        data: logoBuffer,
                        transformation: { width: 140, height: 45 },
                    })
                ]
            })
        );
    }

    // Right Cell: National Motto
    const rightChildren = [
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({ text: "CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM", bold: true, size: 18, font: "Times New Roman" }),
            ]
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({ text: "Độc lập - Tự do - Hạnh phúc", bold: true, size: 18, font: "Times New Roman" }),
            ]
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({ text: "---------------", size: 16, font: "Times New Roman" }),
            ]
        })
    ];

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.NONE },
            insideVertical: { style: BorderStyle.NONE }
        },
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        children: leftChildren
                    }),
                    new TableCell({
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        children: rightChildren
                    })
                ]
            })
        ]
    });
}

function heading1(text) {
    return new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 280, after: 120 },
        children: [
            new TextRun({ text: text, bold: true, size: 28, color: "003366", font: "Times New Roman" })
        ]
    });
}

function heading2(text) {
    return new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 80 },
        children: [
            new TextRun({ text: text, bold: true, size: 24, color: "004080", font: "Times New Roman" })
        ]
    });
}

function heading3(text) {
    return new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 140, after: 60 },
        children: [
            new TextRun({ text: text, bold: true, size: 22, color: "2B547E", font: "Times New Roman" })
        ]
    });
}

function paragraph(text, options = {}) {
    return new Paragraph({
        spacing: { before: 60, after: 60, line: 276 }, // 1.15 line spacing
        alignment: options.alignment || AlignmentType.LEFT,
        children: [
            new TextRun({
                text: text,
                bold: options.bold || false,
                italic: options.italic || false,
                size: options.size || 24, // 12pt
                font: "Times New Roman",
                color: options.color || "000000"
            })
        ]
    });
}

function bullet(text, options = {}) {
    return new Paragraph({
        bullet: { level: options.level || 0 },
        spacing: { before: 40, after: 40, line: 250 },
        children: [
            new TextRun({
                text: text,
                bold: options.bold || false,
                italic: options.italic || false,
                size: 24,
                font: "Times New Roman"
            })
        ]
    });
}

function createStyledTable(headers, rowsData) {
    const headerRow = new TableRow({
        tableHeader: true,
        children: headers.map(h => new TableCell({
            shading: { fill: "003366", type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 150, right: 150 },
            children: [
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 22, font: "Times New Roman" })]
                })
            ]
        }))
    });

    const bodyRows = rowsData.map((row, idx) => {
        const bg = idx % 2 === 0 ? "F2F5F8" : "FFFFFF";
        return new TableRow({
            children: row.map(cellText => new TableCell({
                shading: { fill: bg, type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [
                    new Paragraph({
                        children: [new TextRun({ text: cellText, size: 22, font: "Times New Roman" })]
                    })
                ]
            }))
        });
    });

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: "003366" },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: "003366" },
            left: { style: BorderStyle.SINGLE, size: 2, color: "D3D3D3" },
            right: { style: BorderStyle.SINGLE, size: 2, color: "D3D3D3" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E0E0E0" },
            insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "E0E0E0" }
        },
        rows: [headerRow, ...bodyRows]
    });
}

async function buildDoc() {
    const doc = new Document({
        sections: [
            // BÌA TÀI LIỆU
            {
                properties: {
                    page: {
                        margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }
                    }
                },
                children: [
                    createTitleHeader(),
                    new Paragraph({ spacing: { before: 400, after: 100 } }),
                    new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [
                            new TextRun({ text: "TP. Hồ Chí Minh, ngày 17 tháng 09 năm 2026", italic: true, size: 22, font: "Times New Roman" })
                        ]
                    }),
                    new Paragraph({ spacing: { before: 800, after: 200 } }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({ text: "TÀI LIỆU GIẢI PHÁP BID CARGO CHO AGENTS", bold: true, size: 36, color: "003366", font: "Times New Roman" })
                        ]
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({ text: "Hệ Thống Sàn Đấu Giá Tải Trọng Hàng Không Trực Tuyến (VU Air Cargo Bidding)", italic: true, size: 24, color: "404040", font: "Times New Roman" })
                        ]
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 100, after: 600 },
                        children: [
                            new TextRun({ text: "Version v1.0", bold: true, size: 26, color: "D97706", font: "Times New Roman" })
                        ]
                    }),
                    new Paragraph({ spacing: { before: 1200, after: 200 } }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({ text: "ĐƠN VỊ CHỦ QUẢN & PHÁT TRIỂN", bold: true, size: 22, color: "003366", font: "Times New Roman" })
                        ]
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({ text: "Khối Vận tải Hàng hóa (Cargo Division) - Vietravel Airlines", bold: true, size: 24, font: "Times New Roman" })
                        ]
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({ text: "Ban Công nghệ Thông tin & Hệ thống Trung tâm Operations", italic: true, size: 22, font: "Times New Roman" })
                        ]
                    }),
                    new Paragraph({ pageBreakBefore: true })
                ]
            },
            // NỘI DUNG CHÍNH
            {
                properties: {
                    page: {
                        margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }
                    }
                },
                headers: {
                    default: new Header({
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.RIGHT,
                                children: [
                                    new TextRun({ text: "Vietravel Airlines | Tài liệu Giải pháp Bid Cargo cho Agents v1.0", italic: true, size: 18, color: "888888", font: "Times New Roman" })
                                ]
                            })
                        ]
                    })
                },
                footers: {
                    default: new Footer({
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [
                                    new TextRun({ text: "Trang ", size: 18, font: "Times New Roman" }),
                                    new TextRun({ children: [PageNumber.CURRENT], size: 18, font: "Times New Roman" }),
                                    new TextRun({ text: " / ", size: 18, font: "Times New Roman" }),
                                    new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: "Times New Roman" })
                                ]
                            })
                        ]
                    })
                },
                children: [
                    heading1("1. TỔNG QUAN HỆ THỐNG (EXECUTIVE SUMMARY)"),
                    paragraph("Hệ thống Đấu giá Tải trọng Hàng không Vietravel Airlines (VU Air Cargo Bidding Platform) là giải pháp công nghệ chuyên biệt được thiết kế dành riêng cho các Đại lý Giao nhận Vận tải (Freight Forwarders / Cargo Agents) được ủy quyền chính thức và Khối Khai thác Vận tải Hàng hóa của Hãng."),
                    paragraph("Hệ thống giải quyết triệt để bài toán tối ưu hóa tải trọng máy bay (Belly Cargo & Freighter Capacity) thông qua cơ chế đấu giá trực tuyến linh hoạt, bảo mật tuyệt đối và tự động hóa toàn trình từ khâu Đăng ký đại lý -> Đặt thầu kín (Sealed-Bid) -> Chốt trúng thầu -> Thanh toán QR MoMo -> Phát hành Lệnh giao tải (Slot Release Order)."),

                    heading2("1.1. Các mục tiêu cốt lõi của giải pháp"),
                    bullet("Công bằng & Minh bạch: Áp dụng cơ chế Đấu giá kín 100% (Sealed-Bid Privacy Guard), ẩn danh đối thủ trong suốt thời gian phiên đấu giá diễn ra, ngăn chặn tình trạng ép giá hoặc thông đồng giữa các đại lý."),
                    bullet("Tối ưu Doanh thu Tải trọng: Cho phép Hãng phát hành các lô Slot tải trọng linh hoạt với giá sàn khởi điểm và bước giá được kiểm soát chính xác."),
                    bullet("Tự động hóa Thanh toán & Phát hành vận đơn: Tích hợp trực tiếp cổng thanh toán MoMo QR Code với xác thực chữ ký số HMAC-SHA256 realtime, cập nhật trạng thái đơn hàng tức thì."),
                    bullet("Truy xuất Nguồn gốc & Nhật ký An ninh: Toàn bộ thao tác đặt giá, phê duyệt hồ sơ và giao dịch được ghi vết lưu trữ trên hệ thống SQLite / SQL Server 2022."),

                    heading1("2. TỔỔNG QUAN LUỒNG NGHIỆP VỤ & SƠ ĐỒ HOẠT ĐỘNG (SYSTEM FLOWS)"),
                    paragraph("Hệ thống bao gồm 5 Luồng Nghiệp vụ chính (End-to-End Business Workflows) vận hành giữa hai phân hệ chính: Phân hệ Đại lý (Agent Portal) và Phân hệ Quản trị (Admin Operations Portal)."),

                    heading2("2.1. Sơ đồ tổng thể các Luồng Nghiệp vụ"),
                    createStyledTable(
                        ["Mã Luồng", "Tên Luồng Nghiệp Vụ", "Bên Thực Hiện", "Mô Tả Tóm Tắt Output"],
                        [
                            ["FLOW-01", "Đăng ký & Thẩm định Tài khoản Đại lý", "Đại lý mới & Admin", "Tài khoản Đại lý được kích hoạt (APPROVED) trên DB"],
                            ["FLOW-02", "Quản lý & Mở Phiên Đấu Giá Cargo", "Admin (Cargo Ops)", "Phiên đấu giá OPEN xuất hiện trên Sàn Đấu Giá"],
                            ["FLOW-03", "Đấu Giá Kín Realtime (Sealed-Bid)", "Các Đại lý Ủy quyền", "Lượt bid được ghi nhận Atomic, bảo mật ẩn danh 100%"],
                            ["FLOW-04", "Chốt Phiên & Xác Nhận Trúng Thầu", "Hệ thống / Admin", "Xác định Winner, tạo bản ghi trúng thầu UNPAID"],
                            ["FLOW-05", "Thanh Toán MoMo IPN & Phát Hành Slot", "Đại lý & Cổng MoMo", "Nhận IPN HMAC-SHA256, chuyển PAID & phát hành AWB"]
                        ]
                    ),

                    heading1("3. CHI TIẾT CÁC LUỒNG NGHIỆP VỤ (DETAILED FLOW SPECIFICATIONS)"),

                    heading2("3.1. LUỒNG 1: ĐĂNG KÝ, THẨM ĐỊNH & PHÊ DUYỆT TÀI KHOẢN ĐẠI LÝ (FLOW-01)"),
                    paragraph("Luồng Đăng ký đảm bảo chỉ các đại lý vận tải hàng không có năng lực pháp lý và tài chính hợp lệ mới được truy cập hệ thống đấu giá:"),
                    bullet("Bước 1 (Đại lý gửi hồ sơ): Đại lý truy cập giao diện Đăng ký (Register.html), nhập Mã đại lý (Agent Code), Tên công ty, Mã số thuế, Giấy phép ĐKKD, Địa chỉ trụ sở, Người đại diện và đính kèm Hồ sơ năng lực (scan PDF/JPG)."),
                    bullet("Bước 2 (Lưu bản ghi chờ duyệt): Hệ thống ghi nhận thông tin vào bảng DB `agents` với trạng thái `PENDING`, đồng thời phát thông báo đẩy cho Admin."),
                    bullet("Bước 3 (Admin Thẩm định): Quản trị viên truy cập màn hình Quản lý Đại lý (Admin/06-AgentList.html), kiểm tra tính hợp lệ của mã số thuế và hồ sơ nộp."),
                    bullet("Bước 4 (Phê duyệt / Từ chối): Admin thao tác bấm 'Phê duyệt' hoặc 'Từ chối (kèm lý do)'. Hệ thống tự động cập nhật `status = 'APPROVED'` hoặc `'REJECTED'`."),
                    bullet("Bước 5 (Kích hoạt & Đăng nhập): Đại lý nhận notification, sử dụng tài khoản đã đăng ký để đăng nhập vào Cổng Đại lý (01-Login.html)."),

                    heading2("3.2. LUỒNG 2: TẠO MỚI & QUẢN LÝ PHIÊN ĐẤU GIÁ (FLOW-02)"),
                    paragraph("Khối Khai thác Vận tải Hàng hóa Vietravel Airlines chủ động khởi tạo các phiên đấu giá theo lịch bay thực tế:"),
                    bullet("Bước 1 (Khởi tạo phiên): Admin truy cập Admin/04-CreateAuction.html, nhập các tham số bắt buộc: Chặng bay (Origin - Destination e.g., SGN-HAN, HAN-DAD), Ngày giờ bay (Flight Date), Tải trọng đấu giá (Auction Capacity kg), Giá khởi điểm (Starting Price VNĐ/kg), Bước giá tối thiểu (Bid Increment), Thời gian mở & Cut-off đóng phiên."),
                    bullet("Bước 2 (Lưu DB & Niêm yết): Hệ thống lưu bản ghi vào bảng `auctions` với trạng thái `OPEN`. Thông tin tự động đồng bộ lên Sàn đấu giá (03-Index.html)."),
                    bullet("Bước 3 (Giám sát phiên): Admin theo dõi tiến độ đặt thầu realtime tại màn hình Giám sát chi tiết phiên (Admin/05-AuctionDetail.html)."),

                    heading2("3.3. LUỒNG 3: ĐẤU GIÁ KÍN REALTIME & NGUYÊN TẮC SEATED-BID PRIVACY GUARD (FLOW-03)"),
                    paragraph("Đây là luồng cốt lõi đảm bảo tính công bằng và bảo mật thông tin cạnh tranh giữa các đại lý:"),
                    bullet("Quy tắc Sealed-Bid Privacy Guard: Trong suốt thời gian phiên mở (status = 'OPEN'), API server (`GET /api/data`) tự động LỌC / CHE toàn bộ giá đặt thầu và tên của các đại lý đối thủ. Đại lý A chỉ nhìn thấy mức giá đặt cao nhất hiện tại của CHÍNH MÌNH và giá sàn khởi điểm."),
                    bullet("Thao tác đặt giá: Đại lý nhập mức giá đặt (VNĐ/kg) tại màn hình Chi tiết đấu giá (04-Detail.html) và bấm 'Gửi mức giá thầu'."),
                    bullet("Xử lý Atomic Transaction: Server nhận request `POST /api/bids/place`, mở giao dịch SQLite/SQL Server đảm bảo: Mức giá đặt > Giá khởi điểm và > Mức giá cao nhất hiện tại của chính đại lý đó; Thời gian hiện tại < Giờ Cut-off."),
                    bullet("Cập nhật Realtime: Khi lượt bid hợp lệ, hệ thống lưu bản ghi vào bảng `bids` và gửi tín hiệu đồng bộ realtime tới tất cả các màn hình đang mở."),

                    heading2("3.4. LUỒNG 4: CHỐT PHIÊN ĐẤU GIÁ & XÁC NHẬN TRÚNG THẦU (FLOW-04)"),
                    paragraph("Khi đến giờ Cut-off đóng phiên đấu giá:"),
                    bullet("Bước 1 (Đóng phiên): Hệ thống tự động chuyển trạng thái phiên đấu giá trong bảng `auctions` từ `OPEN` sang `CLOSED`."),
                    bullet("Bước 2 (Xác định Đại lý Thắng thầu): Hệ thống thực hiện truy vấn sắp xếp thứ tự ưu tiên: 1. Giá thầu/kg cao nhất -> 2. Thời gian gửi bid sớm hơn (First-come first-served nếu trùng giá)."),
                    bullet("Bước 3 (Khởi tạo Đơn hàng Trúng thầu): Tạo bản ghi mới trong bảng `won_auctions` ghi nhận: `wonId`, `auctionId`, `agentCode`, `winningPrice`, `totalAmount`, `paymentStatus = 'UNPAID'`."),
                    bullet("Bước 4 (Phát hành Thông báo Winner): Hệ thống phát Notification riêng đến tài khoản Đại lý trúng thầu. Đại lý nhận được liên kết truy cập màn hình Xác nhận trúng thầu (07-WonAuction.html)."),

                    heading2("3.5. LUỒNG 5: THANH TOÁN MOMO QR IPN & PHÁT HÀNH LỆNH GIAO TẢI (FLOW-05)"),
                    paragraph("Luồng thanh toán hoàn tất nghĩa vụ tài chính và giải phóng slot tải trọng hàng hóa:"),
                    bullet("Bước 1 (Khởi tạo thanh toán QR): Đại lý truy cập 07-WonAuction.html, bấm nút 'Thanh toán qua MoMo QR Code'. Frontend gửi request `POST /api/momo/create` kèm `wonId`."),
                    bullet("Bước 2 (Tạo chữ ký số HMAC-SHA256): Server kiểm tra đơn hàng, tạo chuỗi `rawSignature` từ secretKey và accessKey, sau đó tạo Chữ ký chữ số HMAC-SHA256 chuẩn MoMo API v2. Server trả về liên kết thanh toán và mã QR Code."),
                    bullet("Bước 3 (Đại lý Quét mã QR): Đại lý mở ứng dụng ngân hàng hoặc ví MoMo thực hiện chuyển khoản thanh toán."),
                    bullet("Bước 4 (Xử lý Webhook IPN Realtime): Máy chủ MoMo gửi request IPN Callback `POST /api/momo/ipn` về máy chủ Vietravel Airlines. Server xác minh chữ ký HMAC-SHA256 trả về từ MoMo. Nếu chữ ký hợp lệ: Cập nhật `won_auctions.paymentStatus = 'PAID'`, ghi nhận `transId` giao dịch."),
                    bullet("Bước 5 (Phát hành Lệnh Giao Tải Slot Release Order): Ngay sau khi đơn hàng chuyển sang `PAID`, hệ thống tự động phát hành Mã vận đơn AWB (Air Waybill) và hiển thị nút 'Tải Lệnh Giao Tải PDF' cho Đại lý."),

                    heading1("4. THIẾT KẾ CƠ SỞ DỮ LIỆU & SCHEMA DATABASE"),
                    paragraph("Hệ thống sử dụng cơ sở dữ liệu SQLite / SQL Server 2022 được chuẩn hóa (Normalized) gồm 6 bảng dữ liệu cốt lõi:"),

                    createStyledTable(
                        ["Tên Bảng (Table)", "Khóa Chính (Primary Key)", "Các Trường Dữ Liệu Quan Trọng (Columns)", "Nhiệm Vụ QL Nghiệp Vụ"],
                        [
                            ["agents", "agentCode", "agentCode, companyName, taxCode, status (PENDING/APPROVED/REJECTED), creditLimit, email", "Quản lý thông tin hồ sơ và trạng thái thẩm định đại lý"],
                            ["auctions", "id", "id, flightNo, route, capacityKg, startPrice, status (OPEN/CLOSED), cutOffTime", "Quản lý các phiên đấu giá slot hàng hóa"],
                            ["bids", "id", "id, auctionId, agentCode, amountPerKg, totalBidAmount, timestamp", "Lưu trữ lịch sử tất cả các lượt đặt giá thầu"],
                            ["won_auctions", "wonId", "wonId, auctionId, agentCode, winningPrice, totalAmount, paymentStatus (UNPAID/PAID), awbNo", "Lưu trữ kết quả trúng thầu và trạng thái đơn hàng thanh toán"],
                            ["notifications", "id", "id, recipientCode (agentCode/ADMIN), title, message, isRead, timestamp", "Hệ thống thông báo đẩy realtime cho đại lý & admin"],
                            ["chat_messages", "id", "id, senderCode, receiverCode, messageText, timestamp", "Trung tâm trao đổi & hỗ trợ kỹ thuật trực tuyến"]
                        ]
                    ),

                    heading1("5. TIÊU CHUẨN AN NINH & BẢO MẬT HỆ THỐNG"),
                    bullet("Xác thực Chữ ký số MoMo IPN: Đảm bảo 100% các giao dịch thanh toán được xác thực HMAC-SHA256, chống giả mạo request thanh toán giả (Anti-Replay & Anti-Tampering)."),
                    bullet("Bảo mật Chống Path Traversal: Đường dẫn truy cập tập tin `/uploads/` được mã hóa kiểm tra ngặt nghèo, ngăn chặn các cuộc tấn công đọc file hệ thống trái phép."),
                    bullet("Bảo mật Sealed-Bid Privacy: Dữ liệu giá thầu được mã hóa phân quyền trả về theo token/session của từng đại lý, đảm bảo không rò rỉ dữ liệu cạnh tranh."),
                    bullet("SQL Injection & Atomic Transaction: Mọi câu lệnh thao tác SQLite/SQL Server đều sử dụng Parameterized Query và Transaction cô lập (Isolation level)."),

                    heading1("6. KẾT LUẬN & HƯỚNG DẪN VẬN HÀNH"),
                    paragraph("Giải pháp Sàn Đấu Giá Tải Trọng Hàng Không Vietravel Airlines (VU Air Cargo Bidding) v1.0 đã đáp ứng hoàn hảo các yêu cầu về nghiệp vụ vận tải hàng không hiện đại, mang lại quy trình minh bạch, tốc độ và tối ưu doanh thu khai thác tối đa cho Hãng."),
                    paragraph("Mọi thắc mắc kỹ thuật hoặc hỗ trợ vận hành xin vui lòng liên hệ:"),
                    bullet("Khối Khai thác Vận tải Hàng hóa - Vietravel Airlines"),
                    bullet("Trụ sở chính: Số 172 Ngọc Khánh, Phường Giảng Võ, Thành phố Hà Nội, Việt Nam"),
                    bullet("Hotline hỗ trợ: 1900.6686 | +84 2873026686"),
                    bullet("Email Chăm sóc KH & Cargo: customercare@vietravelairlines.vn | cargo@vietravelairlines.vn")
                ]
            }
        ]
    });

    const buffer = await Packer.toBuffer(doc);
    const outputPath = path.join(__dirname, '..', 'TAI_LIEU_GIAI_PHAP_BID_CARGO_CHO_AGENTS.docx');
    fs.writeFileSync(outputPath, buffer);
    console.log(`✅ Word Document successfully generated: ${outputPath}`);
}

buildDoc().catch(err => console.error("Error generating doc:", err));
