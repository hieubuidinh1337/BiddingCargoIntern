const http = require('http');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
// Load local .env if present
if (fs.existsSync(path.join(__dirname, '.env'))) {
    try {
        const envLines = fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/);
        for (const line of envLines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                const idx = trimmed.indexOf('=');
                const key = trimmed.slice(0, idx).trim();
                const val = trimmed.slice(idx + 1).trim();
                if (!process.env[key]) process.env[key] = val;
            }
        }
    } catch (e) {}
}

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
let lastSmtpFingerprint = ''; // Track SMTP config changes to invalidate cache

function getSmtpFingerprint() {
    const smtpSettings = (serverData.settings && serverData.settings.smtp) || {};
    const host = process.env.SMTP_HOST || smtpSettings.host || '';
    const port = process.env.SMTP_PORT || smtpSettings.port || '';
    const user = process.env.SMTP_USER || smtpSettings.user || '';
    const pass = process.env.SMTP_PASS || smtpSettings.pass || '';
    return `${host}:${port}:${user}:${pass}`;
}

async function getMailTransporter() {
    // Invalidate cached transporter if SMTP settings have changed
    const currentFingerprint = getSmtpFingerprint();
    if (mailTransporter && currentFingerprint === lastSmtpFingerprint) {
        return mailTransporter;
    }
    // Settings changed or first call - recreate transporter
    if (mailTransporter && currentFingerprint !== lastSmtpFingerprint) {
        console.log('[Nodemailer] SMTP settings changed, recreating transporter...');
        mailTransporter = null;
    }

    const smtpSettings = (serverData.settings && serverData.settings.smtp) || {};
    const host = process.env.SMTP_HOST || smtpSettings.host;
    const port = process.env.SMTP_PORT || smtpSettings.port || 465;
    const user = process.env.SMTP_USER || smtpSettings.user;
    let pass = process.env.SMTP_PASS || smtpSettings.pass;

    if (pass) {
        pass = String(pass).replace(/\s+/g, '');
    }

    if (host && user && pass) {
        mailTransporter = nodemailer.createTransport({
            host: host,
            port: Number(port),
            secure: Number(port) === 465,
            auth: { user, pass },
            tls: {
                rejectUnauthorized: false
            },
            connectionTimeout: 15000, // 15 giây timeout kết nối
            greetingTimeout: 10000,   // 10 giây timeout greeting
            socketTimeout: 20000      // 20 giây timeout socket
        });
        lastSmtpFingerprint = currentFingerprint;
        console.log(`[Nodemailer] Configured REAL SMTP transporter: ${host}:${port} (${user})`);
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
        lastSmtpFingerprint = currentFingerprint;
        console.log(`[Nodemailer] Created Ethereal SMTP test account: ${testAccount.user}`);
    } catch (e) {
        console.warn(`[Nodemailer] Fallback to JSON transport: ${e.message}`);
        mailTransporter = nodemailer.createTransport({
            jsonTransport: true
        });
        lastSmtpFingerprint = currentFingerprint;
    }
    return mailTransporter;
}

function buildEmailHtml({ title, subtitle, contentHtml, footerNote }) {
    return `<!DOCTYPE html>
<html lang="vi" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,Helvetica,sans-serif;color:#333333;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="580" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #dddddd;border-radius:8px;overflow:hidden;">
  <!-- Header -->
  <tr>
    <td style="background-color:#1e3a5f;padding:24px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:14px;font-weight:bold;color:#ffffff;padding-bottom:4px;">VU CARGO &mdash; Vietravel Airlines</td>
        </tr>
        <tr>
          <td style="font-size:11px;color:#b0c4de;letter-spacing:0.5px;">Air Cargo Bidding System</td>
        </tr>
        <tr>
          <td style="font-size:18px;font-weight:bold;color:#ffffff;padding-top:16px;">${title}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#d0d8e8;padding-top:4px;">${subtitle}</td>
        </tr>
      </table>
    </td>
  </tr>
  <!-- Body -->
  <tr>
    <td style="padding:28px;font-size:14px;line-height:1.6;color:#333333;">
      ${contentHtml}
    </td>
  </tr>
  <!-- Footer -->
  <tr>
    <td style="background-color:#f9f9f9;padding:20px 28px;border-top:1px solid #eeeeee;text-align:center;font-size:12px;color:#888888;">
      <p style="margin:0 0 4px 0;font-weight:bold;color:#555555;">Ban Quản lý Hàng hóa Vietravel Airlines (VU Cargo)</p>
      <p style="margin:0 0 8px 0;">Hotline: <strong style="color:#1e3a5f;">1900 6699</strong> &middot; ops-cargo@vietravelairlines.vn</p>
      <p style="margin:0;font-size:11px;color:#aaaaaa;">${footerNote || 'Email thông báo từ Hệ thống VU Cargo.'}</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// Helper: Strip HTML tags for plain text alternative
function htmlToPlainText(html) {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&middot;/g, '·')
        .replace(/&mdash;/g, '—')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
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
                if (incoming.settings) {
                    serverData.settings = incoming.settings;
                    mailTransporter = null; // Clear cached transporter so new SMTP credentials take effect immediately
                }

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

                if (type === 'TEST_EMAIL') {
                    subject = `[Vietravel Airlines Cargo] KIỂM TRA KẾT NỐI EMAIL THÀNH CÔNG (${new Date().toLocaleTimeString('vi-VN')})`;
                    html = buildEmailHtml({
                        title: 'Kiểm tra Cấu hình Email Thành công',
                        subtitle: 'Hệ thống Đấu giá Hàng hóa Vietravel Airlines Cargo',
                        contentHtml: `
                            <p>Xin chào <strong>${recipient}</strong>,</p>
                            <p style="color:#2e7d32;font-weight:bold;">Cấu hình gửi thư SMTP của bạn đã hoạt động chính xác.</p>
                            
                            <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#f0f7f0;border:1px solid #c8e6c9;border-radius:6px;margin:16px 0;">
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Hộp thư nhận:</td><td style="font-weight:bold;color:#1565c0;">${recipient}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Thời gian gửi:</td><td>${new Date().toLocaleString('vi-VN')}</td></tr>
                                <tr><td style="color:#555;">Trạng thái:</td><td style="font-weight:bold;color:#2e7d32;">HOẠT ĐỘNG (REAL SMTP)</td></tr>
                            </table>

                            <p style="margin-top:16px;">Từ bây giờ, các thông báo sẽ được gửi trực tiếp đến hòm thư này:</p>
                            <ul style="padding-left:20px;line-height:1.7;">
                                <li>Xác nhận tiếp nhận hồ sơ đại lý.</li>
                                <li>Thông báo kết quả phê duyệt và cấp Mã Đại lý.</li>
                                <li>Phiếu xác nhận thắng thầu.</li>
                            </ul>
                        `
                    });
                } else if (type === 'REGISTRATION_SUBMITTED') {
                    subject = `[Vietravel Airlines Cargo] Tiếp nhận hồ sơ đăng ký đại lý - ${regId}`;
                    html = buildEmailHtml({
                        title: 'Xác nhận Tiếp nhận Hồ sơ Đăng ký Đại lý',
                        subtitle: `Mã hồ sơ: ${regId}`,
                        contentHtml: `
                            <p>Kính gửi <strong>${repName}</strong> (Đại diện <strong>${companyName}</strong>),</p>
                            <p>Hệ thống Vietravel Airlines trân trọng thông báo đã tiếp nhận thành công hồ sơ đăng ký đại lý của Quý công ty.</p>
                            
                            <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#f5f5f5;border:1px solid #e0e0e0;border-radius:6px;margin:16px 0;">
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Mã tiếp nhận:</td><td style="font-weight:bold;color:#1565c0;font-family:monospace;">${regId}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Tên doanh nghiệp:</td><td>${companyName}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Mã số thuế:</td><td>${(regData && regData.taxCode) || '-'}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Người đại diện:</td><td>${repName} (${(regData && regData.repPosition) || 'Đại diện'})</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Số điện thoại:</td><td>${(regData && regData.phone) || '-'}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Thời gian tiếp nhận:</td><td>${(regData && regData.submittedAt) || new Date().toLocaleString('vi-VN')}</td></tr>
                                <tr><td style="color:#555;">Trạng thái:</td><td style="font-weight:bold;color:#e65100;">CHỜ XÉT DUYỆT</td></tr>
                            </table>

                            <p style="margin-top:16px;"><strong>Quy trình tiếp theo:</strong></p>
                            <ol style="padding-left:20px;line-height:1.7;">
                                <li>Ban Điều hành sẽ thẩm định hồ sơ trong vòng <strong>24 giờ làm việc</strong>.</li>
                                <li>Khi hồ sơ được duyệt, hệ thống sẽ gửi email kèm <strong>Mã Đại lý (AG-xxxx)</strong>.</li>
                                <li>Quý công ty dùng Mã đại lý, Mật khẩu và Mã PIN để đăng nhập tham gia đấu giá.</li>
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
                            <p style="color:#2e7d32;font-weight:bold;">Hồ sơ đăng ký đại lý của Quý công ty đã được thẩm định và phê duyệt thành công.</p>
                            
                            <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#f0f7f0;border:1px solid #c8e6c9;border-radius:6px;margin:16px 0;">
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Mã Đại lý:</td><td style="font-weight:bold;color:#2e7d32;font-family:monospace;font-size:16px;">${finalCode}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Tên doanh nghiệp:</td><td>${companyName}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Phân hạng:</td><td style="font-weight:bold;color:#1565c0;">TIER 2 (Đại lý Tiêu chuẩn)</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Tên đăng nhập:</td><td style="font-family:monospace;font-weight:bold;">${finalCode} hoặc MST (${(regData && regData.taxCode) || ''})</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Mật khẩu:</td><td style="font-family:monospace;">Mật khẩu Quý vị đã đăng ký</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Mã PIN:</td><td style="font-family:monospace;">Mã PIN Quý vị đã đăng ký</td></tr>
                                <tr><td style="color:#555;">Trạng thái:</td><td style="font-weight:bold;color:#2e7d32;">ĐÃ HOẠT ĐỘNG</td></tr>
                            </table>

                            <p style="text-align:center;margin:24px 0;">
                                <a href="http://localhost:8085/01-Login.html" style="display:inline-block;background-color:#1565c0;color:#ffffff;font-weight:bold;padding:12px 28px;border-radius:6px;text-decoration:none;">ĐĂNG NHẬP THAM GIA ĐẤU GIÁ</a>
                            </p>

                            <p><strong>Hướng dẫn tham gia đấu giá:</strong></p>
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
                            <p>Ban Điều hành Đấu giá Vietravel Airlines Cargo trân trọng cảm ơn Quý doanh nghiệp đã quan tâm và nộp hồ sơ.</p>
                            
                            <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:6px;margin:16px 0;">
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;width:35%;">Mã hồ sơ:</td><td style="font-weight:bold;color:#e65100;">${regId}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Doanh nghiệp:</td><td>${companyName}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Kết quả:</td><td style="font-weight:bold;color:#d32f2f;">TỪ CHỐI / CẦN BỔ SUNG</td></tr>
                                ${reason ? `<tr><td style="color:#555;">Lý do:</td><td style="color:#d32f2f;font-weight:bold;">${reason}</td></tr>` : ''}
                            </table>

                            <p style="margin-top:16px;">Quý doanh nghiệp vui lòng kiểm tra lại hồ sơ và liên hệ bộ phận hỗ trợ đại lý qua Hotline <strong>1900 6699</strong> để được hướng dẫn bổ sung.</p>
                        `
                    });
                }

                const transporter = await getMailTransporter();
                const smtpSettings = (serverData.settings && serverData.settings.smtp) || {};
                const fromAddress = smtpSettings.user || process.env.SMTP_USER || 'ops-cargo@vietravelairlines.vn';
                const fromName = smtpSettings.fromName || 'Vietravel Airlines Cargo';
                let validCc = undefined;
                if (notifEmail && notifEmail !== recipient) {
                    const cleanCc = String(notifEmail).trim().toLowerCase();
                    const isDummy = ['tsn-logistics.vn', 'example.com', 'airline.vn', 'test.com', 'demo.com', 'fake.com'].some(d => cleanCc.endsWith('@' + d));
                    if (!isDummy && cleanCc.includes('@') && cleanCc.includes('.')) {
                        validCc = notifEmail.trim();
                    }
                }

                const mailOptions = {
                    from: `"${fromName}" <${fromAddress}>`,
                    to: recipient,
                    cc: validCc,
                    bcc: fromAddress,
                    subject: subject,
                    html: html,
                    text: htmlToPlainText(html), // Plain text alternative — giảm spam score
                    headers: {
                        'X-Mailer': 'VU-Cargo-Bidding/1.0',
                        'Precedence': 'bulk',
                        'List-Unsubscribe': `<mailto:${fromAddress}?subject=unsubscribe>`,
                        'X-Auto-Response-Suppress': 'OOF, DR, RN, NRN, AutoReply'
                    }
                };

                const info = await transporter.sendMail(mailOptions);
                const previewUrl = nodemailer.getTestMessageUrl ? nodemailer.getTestMessageUrl(info) : null;
                const isReal = !previewUrl;
                
                console.log(`[Nodemailer] Email sent successfully to ${recipient}! MessageId: ${info.messageId} (Real SMTP: ${isReal})`);
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
                    isRealSmtp: isReal,
                    previewUrl: previewUrl || null,
                    sentAt: new Date().toLocaleString('vi-VN')
                });
                if (serverData.emailLogs.length > 50) serverData.emailLogs.length = 50;
                saveServerData();

                res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({
                    success: true,
                    isRealSmtp: isReal,
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
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            });
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
