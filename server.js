const http = require('http');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
// url module no longer needed – using WHATWG URL API

const PORT = 8085;
const PUBLIC_DIR = __dirname;
const DB_FILE = path.join(__dirname, 'server_data.json');

const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Default seed data for centralized backend storage
const defaultSharedData = {
    version: Date.now(),
    auctions: [
        {
            id: 1,
            flightCode: 'FL-VU130-260815',
            flightNumber: 'VU130',
            route: 'SGN - HAN',
            origin: 'SGN',
            destination: 'HAN',
            originName: 'TP. Hồ Chí Minh',
            destName: 'Hà Nội',
            etd: '14:30 · 15/08/2026',
            eta: '16:45 · 15/08/2026',
            aircraft: 'Airbus A321neo Cargo',
            capacityKg: 3500,
            startingPriceKg: 18000,
            currentPriceKg: 21500,
            minStep: 500,
            endTime: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
            status: 'OPEN',
            leadingAgentCode: 'AG-0892',
            leadingAgentName: 'ABC Logistics',
            bidsCount: 7,
            specialNotes: 'Hàng tổng hợp, hỗ trợ kho lạnh bảo quản thực phẩm & dược phẩm.',
            cutOffTime: '11:30 · 15/08/2026'
        },
        {
            id: 2,
            flightCode: 'FL-VU224-260815',
            flightNumber: 'VU224',
            route: 'SGN - DAD',
            origin: 'SGN',
            destination: 'DAD',
            originName: 'TP. Hồ Chí Minh',
            destName: 'Đà Nẵng',
            etd: '16:00 · 15/08/2026',
            eta: '17:20 · 15/08/2026',
            aircraft: 'Airbus A320-200',
            capacityKg: 2000,
            startingPriceKg: 12000,
            currentPriceKg: 14500,
            minStep: 500,
            endTime: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
            status: 'OPEN',
            leadingAgentCode: 'AG-1024',
            leadingAgentName: 'Vinatrans',
            bidsCount: 4,
            specialNotes: 'Ưu tiên bưu kiện bưu phẩm thương mại điện tử chuyển phát nhanh.',
            cutOffTime: '13:00 · 15/08/2026'
        },
        {
            id: 3,
            flightCode: 'FL-VU340-260815',
            flightNumber: 'VU340',
            route: 'HAN - PQC',
            origin: 'HAN',
            destination: 'PQC',
            originName: 'Hà Nội',
            destName: 'Phú Quốc',
            etd: '19:15 · 15/08/2026',
            eta: '21:30 · 15/08/2026',
            aircraft: 'Airbus A321neo Cargo',
            capacityKg: 4000,
            startingPriceKg: 22000,
            currentPriceKg: 25000,
            minStep: 1000,
            endTime: new Date(Date.now() + 180 * 60 * 1000).toISOString(),
            status: 'OPEN',
            leadingAgentCode: 'AG-0556',
            leadingAgentName: 'Golden Star',
            bidsCount: 5,
            specialNotes: 'Hàng hải sản đông lạnh tươi sống đóng thùng xốp tiêu chuẩn IATA.',
            cutOffTime: '16:00 · 15/08/2026'
        },
        {
            id: 4,
            flightCode: 'FL-VU132-260814',
            flightNumber: 'VU132',
            route: 'SGN - HAN',
            origin: 'SGN',
            destination: 'HAN',
            originName: 'TP. Hồ Chí Minh',
            destName: 'Hà Nội',
            etd: '10:00 · 14/08/2026',
            eta: '12:15 · 14/08/2026',
            aircraft: 'Airbus A321-200',
            capacityKg: 3000,
            startingPriceKg: 18000,
            currentPriceKg: 22000,
            minStep: 500,
            endTime: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
            status: 'CLOSED',
            leadingAgentCode: 'AG-0892',
            leadingAgentName: 'ABC Logistics',
            bidsCount: 12,
            winnerAgentCode: 'AG-0892',
            winnerAgentName: 'ABC Logistics',
            winningPriceKg: 22000,
            specialNotes: 'Phiên đã đóng hôm qua, thắng thầu chính thức.',
            cutOffTime: '07:00 · 14/08/2026'
        }
    ],
    bids: [
        {
            id: 101,
            auctionId: 1,
            agentCode: 'AG-1024',
            agentName: 'Vinatrans Express',
            priceKg: 19000,
            time: '1 giờ trước',
            status: 'OUTBID',
            weightKg: 3500
        },
        {
            id: 102,
            auctionId: 1,
            agentCode: 'AG-0556',
            agentName: 'Golden Star Forwarding',
            priceKg: 20000,
            time: '35 phút trước',
            status: 'OUTBID',
            weightKg: 3500
        },
        {
            id: 103,
            auctionId: 1,
            agentCode: 'AG-0892',
            agentName: 'ABC Logistics',
            priceKg: 21500,
            time: '12 phút trước',
            status: 'HIGHEST',
            weightKg: 3500
        }
    ],
    wonAuctions: [
        {
            wonId: 'WON-2026-0814-01',
            auctionId: 4,
            agentCode: 'AG-0892',
            flightNumber: 'VU132',
            route: 'SGN - HAN',
            capacityKg: 3000,
            priceKg: 22000,
            totalAmountVND: 66000000,
            paymentDeadline: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(),
            paymentStatus: 'PAID',
            paidAt: '14/08/2026 14:20',
            awbNumber: '998-12345678',
            cutOffTime: '15/08/2026 06:00',
            warehouse: 'Kho hàng TCS Tân Sơn Nhất (Cửa số 4)'
        }
    ],
    notifications: [
        {
            id: 1,
            title: 'Bạn đang dẫn đầu thầu VU130',
            message: 'Mức giá 21,500 đ/Kg của bạn đang là cao nhất cho chuyến SGN-HAN.',
            time: '12 phút trước',
            type: 'HIGHEST',
            read: false,
            link: '04-Detail.html?id=1'
        }
    ],
    registrations: [
        {
            regId: 'REG-2026-0805-01',
            companyName: 'Công ty TNHH Giao nhận Sao Mai Express',
            taxCode: '0315998877',
            address: '77 Bạch Đằng, Phường 2, Quận Tân Bình, TP.HCM',
            field: 'Cargo Agent',
            repName: 'Hoàng Đức Trọng',
            repPosition: 'Giám đốc điều hành',
            email: 'trong.hoang@saomaiexpress.vn',
            phone: '0933 887 766',
            documents: ['GPKD_SaoMai_Scan.pdf', 'UyQuyen_Cargo_SaoMai.pdf', 'CCCD_HoangDucTrong.pdf'],
            status: 'PENDING',
            submittedAt: '05/08/2026 10:15'
        }
    ]
};

let serverData = null;

function loadServerData() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, 'utf8');
            serverData = JSON.parse(raw);
        } else {
            serverData = JSON.parse(JSON.stringify(defaultSharedData));
            saveServerData();
        }
    } catch (e) {
        console.error('Error loading server_data.json:', e);
        serverData = JSON.parse(JSON.stringify(defaultSharedData));
    }

    // Auto renew open auctions if expired
    const now = Date.now();
    let changed = false;
    if (serverData.auctions) {
        serverData.auctions.forEach((a, idx) => {
            if (a.status === 'OPEN') {
                const endMs = Date.parse(a.endTime);
                if (isNaN(endMs) || endMs <= now) {
                    a.endTime = new Date(now + (idx === 0 ? 45 : (idx === 1 ? 90 : 120)) * 60 * 1000).toISOString();
                    changed = true;
                }
            }
        });
    }
    if (changed) saveServerData();
}

function saveServerData() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(serverData, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving server_data.json:', e);
    }
}

loadServerData();

// --- Nodemailer & Email Service Helper ---
let mailTransporter = null;

async function getMailTransporter() {
    if (mailTransporter) return mailTransporter;

    const smtpSettings = (serverData.settings && serverData.settings.smtp) || {};
    const host = process.env.SMTP_HOST || smtpSettings.host;
    const port = process.env.SMTP_PORT || smtpSettings.port || 587;
    const user = process.env.SMTP_USER || smtpSettings.user;
    const pass = process.env.SMTP_PASS || smtpSettings.pass;

    if (host && user && pass) {
        mailTransporter = nodemailer.createTransport({
            host: host,
            port: Number(port),
            secure: Number(port) === 465,
            auth: { user, pass }
        });
        console.log(`[Nodemailer] Configured SMTP transporter: ${host}:${port} (${user})`);
        return mailTransporter;
    }

    try {
        const testAccount = await nodemailer.createTestAccount();
        mailTransporter = nodemailer.createTransport({
            host: testAccount.smtp.host,
            port: testAccount.smtp.port,
            secure: testAccount.smtp.secure,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass
            }
        });
        console.log(`[Nodemailer] Created Ethereal SMTP test account: ${testAccount.user}`);
    } catch (e) {
        console.warn(`[Nodemailer] Fallback to JSON transport: ${e.message}`);
        mailTransporter = nodemailer.createTransport({
            jsonTransport: true
        });
    }
    return mailTransporter;
}

function buildEmailHtml({ title, subtitle, contentHtml, footerNote }) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; color: #1e293b; }
  .wrapper { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
  .header { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); padding: 32px 28px; color: #ffffff; }
  .logo-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .logo-badge { background: #2563eb; color: #ffffff; font-weight: 800; font-size: 13px; padding: 5px 12px; border-radius: 8px; letter-spacing: 0.5px; display: inline-block; }
  .brand-title { font-size: 18px; font-weight: 700; color: #ffffff; margin-left: 8px; }
  .brand-sub { font-size: 11px; color: #93c5fd; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
  .header h1 { font-size: 20px; font-weight: 700; margin: 18px 0 6px 0; color: #ffffff; }
  .header p { font-size: 13px; color: #cbd5e1; margin: 0; }
  .body { padding: 32px 28px; line-height: 1.6; font-size: 14px; }
  .card-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin: 20px 0; }
  .card-success { background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #16a34a; }
  .card-danger { background: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; }
  .row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px dashed #e2e8f0; font-size: 13px; }
  .row:last-child { border-bottom: none; }
  .lbl { color: #64748b; font-weight: 500; }
  .val { color: #0f172a; font-weight: 600; text-align: right; }
  .btn-wrap { text-align: center; margin: 26px 0; }
  .btn { display: inline-block; background: #2563eb; color: #ffffff !important; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 10px; text-decoration: none; box-shadow: 0 4px 12px rgba(37,99,235,0.25); }
  .footer { background: #f8fafc; padding: 24px 28px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="logo-row">
      <span class="logo-badge">VU CARGO</span>
      <span class="brand-title">Vietravel Airlines</span>
    </div>
    <div class="brand-sub">Hệ thống Đấu giá Tải trọng Hàng không (Air Cargo Bidding)</div>
    <h1>${title}</h1>
    <p>${subtitle}</p>
  </div>
  <div class="body">
    ${contentHtml}
  </div>
  <div class="footer">
    <p style="margin:0 0 6px 0;font-weight:600;color:#334155;">Ban Quản lý & Khai thác Hàng hóa Vietravel Airlines (VU Cargo)</p>
    <p style="margin:0 0 8px 0;">Hotline Hỗ trợ Đại lý: <strong style="color:#2563eb;">1900 6699</strong> · Email: ops-cargo@vietravelairlines.vn</p>
    <p style="margin:0;font-size:11px;color:#94a3b8;">${footerNote || 'Thông báo tự động từ Hệ thống Đấu giá Hàng không Vietravel Airlines.'}</p>
  </div>
</div>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
    // Enable CORS for all API calls
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    let pathname = parsedUrl.pathname;

    // --- REST API: GET /api/data ---
    if (pathname === '/api/data' && req.method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=UTF-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(JSON.stringify(serverData), 'utf-8');
        return;
    }

    // --- REST API: POST /api/data ---
    if (pathname === '/api/data' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const incoming = JSON.parse(body);
                if (incoming.auctions) serverData.auctions = incoming.auctions;
                if (incoming.bids) serverData.bids = incoming.bids;
                if (incoming.wonAuctions) serverData.wonAuctions = incoming.wonAuctions;
                if (incoming.notifications) serverData.notifications = incoming.notifications;
                if (incoming.registrations) serverData.registrations = incoming.registrations;
                if (incoming.agentsList) serverData.agentsList = incoming.agentsList;
                if (incoming.adminsList) serverData.adminsList = incoming.adminsList;
                if (incoming.settings) serverData.settings = incoming.settings;

                serverData.version = Date.now();
                saveServerData();

                res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({ success: true, version: serverData.version }), 'utf-8');
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // --- REST API: POST /api/send-email ---
    if (pathname === '/api/send-email' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const reqData = JSON.parse(body || '{}');
                const { type, to, notifEmail, regData, agentCode, reason, customSubject, customHtml } = reqData;
                
                const recipient = to || (regData && regData.email);
                if (!recipient) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Thiếu địa chỉ email người nhận (to / regData.email)' }));
                    return;
                }

                let subject = customSubject || '[Vietravel Airlines Cargo] Thông báo hệ thống';
                let html = customHtml || '';
                const companyName = (regData && regData.companyName) || 'Quý doanh nghiệp';
                const repName = (regData && regData.repName) || 'Quý đại lý';
                const regId = (regData && regData.regId) || 'REG-PENDING';

                if (type === 'REGISTRATION_SUBMITTED') {
                    subject = `[Vietravel Airlines Cargo] Tiếp nhận hồ sơ đăng ký đại lý - ${regId}`;
                    html = buildEmailHtml({
                        title: 'Xác nhận Tiếp nhận Hồ sơ Đăng ký Đại lý',
                        subtitle: `Mã hồ sơ: ${regId}`,
                        contentHtml: `
                            <p>Kính gửi <strong>${repName}</strong> (Đại diện <strong>${companyName}</strong>),</p>
                            <p>Hệ thống Đấu giá Vận tải Hàng không Vietravel Airlines trân trọng thông báo đã tiếp nhận thành công hồ sơ đăng ký tham gia mạng lưới đại lý vận tải của Quý công ty.</p>
                            
                            <div class="card-box">
                                <div class="row"><span class="lbl">Mã tiếp nhận hồ sơ:</span><span class="val" style="color:#2563eb;font-family:monospace;font-size:14px;">${regId}</span></div>
                                <div class="row"><span class="lbl">Tên doanh nghiệp:</span><span class="val">${companyName}</span></div>
                                <div class="row"><span class="lbl">Mã số thuế / GPKD:</span><span class="val">${(regData && regData.taxCode) || '-'}</span></div>
                                <div class="row"><span class="lbl">Người đại diện:</span><span class="val">${repName} (${(regData && regData.repPosition) || 'Đại diện'})</span></div>
                                <div class="row"><span class="lbl">Số điện thoại liên hệ:</span><span class="val">${(regData && regData.phone) || '-'}</span></div>
                                <div class="row"><span class="lbl">Thời gian tiếp nhận:</span><span class="val">${(regData && regData.submittedAt) || new Date().toLocaleString('vi-VN')}</span></div>
                                <div class="row"><span class="lbl">Trạng thái hiện tại:</span><span class="val" style="color:#d97706;font-weight:700;">CHỜ THẨM ĐỊNH & XÉT DUYỆT</span></div>
                            </div>

                            <p style="margin-top:16px;"><strong>Quy trình xử lý tiếp theo:</strong></p>
                            <ol style="padding-left:20px;color:#334155;line-height:1.7;">
                                <li>Ban Điều hành Cargo sẽ thẩm định tính hợp lệ của hồ sơ pháp lý trong vòng <strong>24 giờ làm việc</strong>.</li>
                                <li>Ngay khi hồ sơ được phê duyệt, hệ thống sẽ tự động gửi email thông báo kèm <strong>Mã Đại lý (AG-xxxx)</strong> chính thức.</li>
                                <li>Quý công ty sử dụng Mã đại lý cùng Mật khẩu và Mã PIN đã đăng ký để đăng nhập và tham gia đấu giá tải trọng các chuyến bay nội địa & quốc tế.</li>
                            </ol>
                        `
                    });
                } else if (type === 'REGISTRATION_APPROVED') {
                    const finalCode = agentCode || (regData && regData.code) || 'AG-0001';
                    subject = `[Vietravel Airlines Cargo] CHÚC MỪNG! Hồ sơ Đại lý đã được PHÊ DUYỆT - Mã: ${finalCode}`;
                    html = buildEmailHtml({
                        title: 'Chúc mừng! Hồ sơ Đại lý đã được PHÊ DUYỆT',
                        subtitle: `Mã đại lý chính thức: ${finalCode}`,
                        contentHtml: `
                            <p>Kính gửi <strong>${repName}</strong> (Đại diện <strong>${companyName}</strong>),</p>
                            <p style="color:#16a34a;font-weight:700;">Ban Quản lý & Khai thác Hàng hóa Vietravel Airlines trân trọng thông báo hồ sơ đăng ký đại lý của Quý công ty đã được THẨM ĐỊNH VÀ PHÊ DUYỆT THÀNH CÔNG!</p>
                            
                            <div class="card-box card-success">
                                <div class="row"><span class="lbl">Mã Đại lý chính thức:</span><span class="val" style="color:#16a34a;font-family:monospace;font-size:16px;font-weight:700;">${finalCode}</span></div>
                                <div class="row"><span class="lbl">Tên doanh nghiệp:</span><span class="val">${companyName}</span></div>
                                <div class="row"><span class="lbl">Phân hạng đại lý:</span><span class="val" style="color:#2563eb;font-weight:700;">TIER 2 (Đại lý Tiêu chuẩn)</span></div>
                                <div class="row"><span class="lbl">Tên đăng nhập:</span><span class="val" style="font-family:monospace;font-weight:700;">${finalCode} hoặc MST (${(regData && regData.taxCode) || ''})</span></div>
                                <div class="row"><span class="lbl">Mật khẩu:</span><span class="val" style="font-family:monospace;">•••••••• (Mật khẩu Quý vị đã đăng ký)</span></div>
                                <div class="row"><span class="lbl">Mã PIN xác thực thầu:</span><span class="val" style="font-family:monospace;">•••• (Mã PIN Quý vị đã đăng ký)</span></div>
                                <div class="row"><span class="lbl">Trạng thái kích hoạt:</span><span class="val" style="color:#16a34a;font-weight:700;">ĐÃ HOẠT ĐỘNG CHÍNH THỨC</span></div>
                            </div>

                            <div class="btn-wrap">
                                <a href="http://localhost:8085/01-Login.html" class="btn">ĐĂNG NHẬP THAM GIA ĐẤU GIÁ NGAY →</a>
                            </div>

                            <p><strong>Hướng dẫn tham gia đấu giá:</strong></p>
                            <ul style="padding-left:20px;color:#334155;line-height:1.7;">
                                <li>Quý đại lý có thể xem toàn bộ các chuyến bay mở thầu trên các tuyến trục SGN-HAN, SGN-DAD, HAN-PQC...</li>
                                <li>Đặt giá thầu (bidding) trực tiếp theo bước giá quy định của từng chuyến bay.</li>
                                <li>Theo dõi kết quả trúng thầu và xác nhận hợp đồng vận chuyển điện tử ngay trên ứng dụng.</li>
                            </ul>
                        `
                    });
                } else if (type === 'REGISTRATION_REJECTED') {
                    subject = `[Vietravel Airlines Cargo] Thông báo kết quả xét duyệt hồ sơ đại lý - ${regId}`;
                    html = buildEmailHtml({
                        title: 'Thông báo Kết quả Xét duyệt Hồ sơ Đại lý',
                        subtitle: `Mã hồ sơ: ${regId}`,
                        contentHtml: `
                            <p>Kính gửi <strong>${repName}</strong> (Đại diện <strong>${companyName}</strong>),</p>
                            <p>Ban Điều hành Đấu giá Vietravel Airlines Cargo trân trọng cảm ơn Quý doanh nghiệp đã quan tâm và nộp hồ sơ đăng ký tham gia sàn đấu giá.</p>
                            
                            <div class="card-box card-danger">
                                <div class="row"><span class="lbl">Mã hồ sơ:</span><span class="val">${regId}</span></div>
                                <div class="row"><span class="lbl">Doanh nghiệp:</span><span class="val">${companyName}</span></div>
                                <div class="row"><span class="lbl">Kết quả thẩm định:</span><span class="val" style="color:#dc2626;font-weight:700;">TỪ CHỐI / CẦN BỔ SUNG</span></div>
                                ${reason ? `<div class="row"><span class="lbl">Lý do:</span><span class="val" style="color:#b91c1c;">${reason}</span></div>` : ''}
                            </div>

                            <p>Quý doanh nghiệp vui lòng kiểm tra lại tính chính xác của Giấy phép kinh doanh, Giấy ủy quyền đại lý, hoặc liên hệ trực tiếp với bộ phận chăm sóc đại lý của chúng tôi qua Hotline <strong>1900 6699</strong> để được hướng dẫn hoàn thiện hồ sơ.</p>
                        `
                    });
                }

                const transporter = await getMailTransporter();
                const mailOptions = {
                    from: '"Vietravel Airlines Cargo" <ops-cargo@vietravelairlines.vn>',
                    to: recipient,
                    cc: notifEmail && notifEmail !== recipient ? notifEmail : undefined,
                    subject: subject,
                    html: html
                };

                const info = await transporter.sendMail(mailOptions);
                const previewUrl = nodemailer.getTestMessageUrl ? nodemailer.getTestMessageUrl(info) : null;
                
                console.log(`[Nodemailer] Email sent successfully to ${recipient}! MessageId: ${info.messageId}`);
                if (previewUrl) {
                    console.log(`[Nodemailer] Preview URL (Ethereal): ${previewUrl}`);
                }

                // Log email into server data for tracking
                if (!serverData.emailLogs) serverData.emailLogs = [];
                serverData.emailLogs.unshift({
                    id: Date.now(),
                    to: recipient,
                    type: type || 'CUSTOM',
                    subject: subject,
                    messageId: info.messageId,
                    previewUrl: previewUrl || null,
                    sentAt: new Date().toLocaleString('vi-VN')
                });
                if (serverData.emailLogs.length > 50) serverData.emailLogs.length = 50;
                saveServerData();

                res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({
                    success: true,
                    messageId: info.messageId,
                    previewUrl: previewUrl || null,
                    recipient: recipient,
                    subject: subject
                }), 'utf-8');
            } catch (err) {
                console.error('[Nodemailer] Error sending email:', err);
                res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // --- Static File Serving ---
    if (pathname === '/') pathname = '/00-Home.html';

    let filePath = path.join(PUBLIC_DIR, pathname);
    const ext = path.extname(filePath);
    let contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
                res.end('<h1>404 Not Found</h1><p>Trang không tồn tại trên máy chủ.</p>', 'utf-8');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/html; charset=UTF-8' });
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n⚠️  [Port In Use] Cổng ${PORT} hiện đang được sử dụng bởi một tiến trình khác.`);
        console.error(`👉 Máy chủ có thể đã đang chạy sẵn tại: http://localhost:${PORT}/`);
        console.error(`👉 Để khởi động mới, bạn hãy tắt tiến trình đang chiếm cổng ${PORT}.\n`);
        process.exit(1);
    } else {
        console.error('Server error:', err);
    }
});

server.listen(PORT, () => {
    console.log(`Vietravel Airlines Bidding Cargo app running at http://localhost:${PORT}/`);
});
