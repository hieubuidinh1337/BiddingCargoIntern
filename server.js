const http = require('http');
const fs = require('fs');
const path = require('path');
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

server.listen(PORT, () => {
    console.log(`Vietravel Airlines Bidding Cargo app running at http://localhost:${PORT}/`);
});
