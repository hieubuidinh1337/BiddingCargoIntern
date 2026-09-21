require('dotenv').config();
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const db = require('./db.js');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

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
            id: Date.now() - 3 * 60 * 1000,
            timestamp: Date.now() - 3 * 60 * 1000,
            auctionId: 1,
            agentCode: 'AG-0892',
            agentName: 'ABC Logistics',
            isAnonymous: true,
            priceKg: 56500,
            time: '3 phút trước',
            status: 'HIGHEST',
            weightKg: 3500
        },
        {
            id: Date.now() - 6 * 60 * 1000,
            timestamp: Date.now() - 6 * 60 * 1000,
            auctionId: 1,
            agentCode: 'AG-0892',
            agentName: 'ABC Logistics',
            isAnonymous: true,
            priceKg: 56000,
            time: '6 phút trước',
            status: 'OUTBID',
            weightKg: 3500
        },
        {
            id: Date.now() - 15 * 60 * 1000,
            timestamp: Date.now() - 15 * 60 * 1000,
            auctionId: 1,
            agentCode: 'AG-0556',
            agentName: 'Golden Star Forwarding',
            isAnonymous: true,
            priceKg: 41500,
            time: '15 phút trước',
            status: 'OUTBID',
            weightKg: 3500
        },
        {
            id: Date.now() - 25 * 60 * 1000,
            timestamp: Date.now() - 25 * 60 * 1000,
            auctionId: 1,
            agentCode: 'AG-1024',
            agentName: 'Vinatrans Express',
            isAnonymous: true,
            priceKg: 39000,
            time: '25 phút trước',
            status: 'OUTBID',
            weightKg: 3500
        },
        {
            id: Date.now() - 35 * 60 * 1000,
            timestamp: Date.now() - 35 * 60 * 1000,
            auctionId: 1,
            agentCode: 'AG-0556',
            agentName: 'Golden Star Forwarding',
            isAnonymous: true,
            priceKg: 25000,
            time: '35 phút trước',
            status: 'OUTBID',
            weightKg: 3500
        },
        {
            id: Date.now() - 42 * 60 * 1000,
            timestamp: Date.now() - 42 * 60 * 1000,
            auctionId: 1,
            agentCode: 'AG-1024',
            agentName: 'Vinatrans Express',
            isAnonymous: true,
            priceKg: 24500,
            time: '42 phút trước',
            status: 'OUTBID',
            weightKg: 3500
        },
        {
            id: Date.now() - 48 * 60 * 1000,
            timestamp: Date.now() - 48 * 60 * 1000,
            auctionId: 1,
            agentCode: 'AG-0556',
            agentName: 'Golden Star Forwarding',
            isAnonymous: true,
            priceKg: 23000,
            time: '48 phút trước',
            status: 'OUTBID',
            weightKg: 3500
        },
        {
            id: Date.now() - 52 * 60 * 1000,
            timestamp: Date.now() - 52 * 60 * 1000,
            auctionId: 1,
            agentCode: 'AG-0892',
            agentName: 'ABC Logistics',
            isAnonymous: true,
            priceKg: 21500,
            time: '52 phút trước',
            status: 'OUTBID',
            weightKg: 3500
        },
        {
            id: Date.now() - 56 * 60 * 1000,
            timestamp: Date.now() - 56 * 60 * 1000,
            auctionId: 1,
            agentCode: 'AG-0556',
            agentName: 'Golden Star Forwarding',
            isAnonymous: true,
            priceKg: 20000,
            time: '56 phút trước',
            status: 'OUTBID',
            weightKg: 3500
        },
        {
            id: Date.now() - 60 * 60 * 1000,
            timestamp: Date.now() - 60 * 60 * 1000,
            auctionId: 1,
            agentCode: 'AG-1024',
            agentName: 'Vinatrans Express',
            isAnonymous: true,
            priceKg: 19000,
            time: '1 giờ trước',
            status: 'OUTBID',
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
            paymentStatus: 'UNPAID',
            paidAt: null,
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
    ],
    settings: {
        minIncrement: 500,
        cutoffHours: 3,
        paymentWindowHours: 24,
        platformFee: 50,
        hotline: '1900 6868',
        supportEmail: 'cargo-agent@airline.vn',
        hideAgentCredentials: true,
        smtp: {
            host: 'smtp.gmail.com',
            port: 465,
            user: 'jome7093@gmail.com',
            pass: 'fcjuktvwjqhgilzb',
            fromName: 'Vietravel Airlines Cargo'
        }
    },
    bankConfig: {
        bankName: 'Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank)',
        accountNumber: '1029384756',
        accountName: 'CONG TY CP HANG KHONG VIETRAVEL',
        branch: 'Chi nhánh Tân Bình - TP. Hồ Chí Minh',
        memoPrefix: 'CARGO',
        bankBin: '970436'
    },
    routeSubscriptions: {
        'AG-0892': {
            routes: ['HAN - SGN', 'SGN - HAN', 'SGN - DAD'],
            notifyOnNewAuction: true,
            notifyOnOutbid: true,
            notifyOnClosingSoon: true,
            emailAlerts: true,
            updatedAt: '2026-09-08 15:30'
        }
    },
    chats: []
};

let serverData = null;

function reconcileAuctionSummaries(data) {
    if (!data || !Array.isArray(data.auctions)) return false;

    let changed = false;
    const allBids = Array.isArray(data.bids) ? data.bids : [];

    data.auctions.forEach(a => {
        const auctionBids = allBids
            .filter(b => Number(b.auctionId) === Number(a.id))
            .sort((x, y) => Number(y.priceKg) - Number(x.priceKg));

        if (auctionBids.length > 0) {
            const highestBid = auctionBids[0];
            const highestPrice = Number(highestBid.priceKg);

            auctionBids.forEach((b, idx) => {
                b.status = (idx === 0) ? 'HIGHEST' : 'OUTBID';
            });

            if (Number.isFinite(highestPrice) && a.currentPriceKg !== highestPrice) {
                a.currentPriceKg = highestPrice;
                changed = true;
            }

            const normalizedLeaderCode = (highestBid.agentCode || '').trim();
            const normalizedLeaderName = (highestBid.agentName || '').trim();

            if ((a.leadingAgentCode || '').trim() !== normalizedLeaderCode ||
                (a.leadingAgentName || '').trim() !== normalizedLeaderName) {
                a.leadingAgentCode = normalizedLeaderCode;
                a.leadingAgentName = normalizedLeaderName;
                a.isAnonymous = highestBid.isAnonymous !== false;
                changed = true;
            }

            const bidCount = auctionBids.length;
            if ((a.bidsCount || 0) !== bidCount) {
                a.bidsCount = bidCount;
                changed = true;
            }
        } else {
            if (a.leadingAgentCode || a.leadingAgentName || (a.bidsCount || 0) !== 0 || (a.startingPriceKg && a.currentPriceKg !== a.startingPriceKg)) {
                a.leadingAgentCode = null;
                a.leadingAgentName = null;
                a.bidsCount = 0;
                if (a.startingPriceKg) {
                    a.currentPriceKg = a.startingPriceKg;
                }
                changed = true;
            }
        }
    });

    return changed;
}

async function loadServerDataAsync() {
    try {
        await db.initDatabase();
        const purgedCount = await db.purgeUnregisteredBids();
        serverData = await db.getFullServerData();
        if (purgedCount > 0) {
            console.log(`[Database] Reconciling ${purgedCount} purged bids across all auctions...`);
            reconcileAuctionSummaries(serverData);
            await db.seedFullData(serverData);
        }
        console.log('[Database] 100% data loaded successfully from SQLite RDBMS.');
    } catch (e) {
        console.error('[Database] Failed to load data from SQLite database:', e);
        serverData = JSON.parse(JSON.stringify(defaultSharedData));
    }

    let changed = false;

    if (!serverData.bankConfig) {
        serverData.bankConfig = defaultSharedData.bankConfig;
        changed = true;
    }
    if (!serverData.routeSubscriptions) {
        serverData.routeSubscriptions = defaultSharedData.routeSubscriptions;
        changed = true;
    }

    // Ensure SMTP & Privacy settings exist with default credentials if unconfigured
    if (!serverData.settings) {
        serverData.settings = defaultSharedData.settings;
        changed = true;
    } else {
        if (serverData.settings.hideAgentCredentials === undefined) {
            serverData.settings.hideAgentCredentials = true;
            changed = true;
        }
        if (!serverData.settings.smtp || !serverData.settings.smtp.user) {
            serverData.settings.smtp = defaultSharedData.settings.smtp;
            changed = true;
        }
    }

    // Auto renew open auctions if ETD is in future, or close them if ETD passed
    const now = Date.now();
    if (serverData.auctions) {
        serverData.auctions.forEach((a, idx) => {
            if (a.status === 'OPEN') {
                const endMs = Date.parse(a.endTime);
                if (isNaN(endMs) || endMs <= now) {
                    if (a.etdIso) {
                        const etdMs = Date.parse(a.etdIso);
                        if (!isNaN(etdMs) && etdMs > now) {
                            a.endTime = new Date(Math.max(now + 120 * 60 * 1000, etdMs - 3 * 3600 * 1000)).toISOString();
                            changed = true;
                            return;
                        }
                    }
                    const etdDate = a.etd ? parseFlightDate(a.etd) : null;
                    if (etdDate && !isNaN(etdDate.getTime()) && etdDate.getTime() > now) {
                        a.endTime = new Date(Math.max(now + 120 * 60 * 1000, etdDate.getTime() - 3 * 3600 * 1000)).toISOString();
                        changed = true;
                        return;
                    }
                    // Flight ETD has passed -> CLOSE auction
                    a.status = 'CLOSED';
                    a.specialNotes = (a.specialNotes ? a.specialNotes + ' ' : '') + '(Phiên đã tự động đóng do chuyến bay đã cất cánh).';
                    changed = true;
                }
            }
        });
    }

    if (reconcileAuctionSummaries(serverData)) {
        changed = true;
    }

    if (checkAndAutoLockExpiredWonAuctions(serverData)) {
        changed = true;
    }

    if (changed) saveServerData();
}

function parseFlightDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
    const cleanStr = String(dateStr).replace(/·|-/g, ' ').replace(/\s+/g, ' ').trim();

    const p1 = cleanStr.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const p2 = cleanStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
    const p3 = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);

    if (p1) {
        return new Date(parseInt(p1[5], 10), parseInt(p1[4], 10) - 1, parseInt(p1[3], 10), parseInt(p1[1], 10), parseInt(p1[2], 10));
    } else if (p2) {
        return new Date(parseInt(p2[3], 10), parseInt(p2[2], 10) - 1, parseInt(p2[1], 10), parseInt(p2[4], 10), parseInt(p2[5], 10));
    } else if (p3) {
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

function isWonAuctionExpired(item, passedData) {
    if (!item) return false;
    if (item.paymentStatus === 'PAID') return false;
    if (item.paymentStatus === 'PENDING_VERIFICATION') return false;
    if (item.paymentStatus === 'CANCELLED') return true;

    const now = Date.now();
    const allAuctions = (passedData && passedData.auctions) ? passedData.auctions : [];

    // Guard: if the linked auction is still OPEN, the won item cannot be expired.
    // This prevents historical wonAuctions (reusing an auctionId) from being
    // incorrectly flagged when a new auction with the same ID is running.
    const linkedAuction = allAuctions.find(a => a.id == item.auctionId);
    if (linkedAuction && linkedAuction.status === 'OPEN') return false;

    // 1. Check explicit paymentDeadline timestamp
    if (item.paymentDeadline) {
        const dlMs = new Date(item.paymentDeadline).getTime();
        if (!isNaN(dlMs) && now > dlMs) return true;
    }

    // 2. Check Cut-off time using only the won item's own ETD data (not auction ETD,
    //    which may have been auto-renewed for a new session with the same flight number).
    if (item.etdIso) {
        const etdDate = new Date(item.etdIso);
        if (!isNaN(etdDate.getTime())) {
            const cutoffDeadlineMs = etdDate.getTime() - 3 * 3600 * 1000;
            if (now >= cutoffDeadlineMs) return true;
        }
    }

    return false;
}

function checkAndAutoLockExpiredWonAuctions(data) {
    if (!data) return false;
    let modified = false;
    const wonAuctions = data.wonAuctions || [];
    const agentsList = data.agentsList || [];
    if (!data.notifications) data.notifications = [];

    wonAuctions.forEach(item => {
        if (item.paymentStatus === 'PAID' || item.paymentStatus === 'PENDING_VERIFICATION') {
            return;
        }

        const isExpired = isWonAuctionExpired(item, data);
        const targetCode = (item.agentCode || '').toUpperCase();
        const agent = agentsList.find(a => (a.code || '').toUpperCase() === targetCode);

        if (isExpired && item.paymentStatus !== 'PAID' && item.paymentStatus !== 'PENDING_VERIFICATION') {
            if (item.paymentStatus !== 'EXPIRED' && item.paymentStatus !== 'CANCELLED') {
                item.paymentStatus = 'EXPIRED';
                modified = true;
            }

            const isWaived = item.lockWaivedByAdmin === true;
            // Also skip if admin already unlocked the agent for this same item
            const agentUnlockedAfterThis = agent && agent.unlockedAt && item.lockPenaltyHandled;

            if (!isWaived && !agentUnlockedAfterThis && agent) {
                if (agent.status !== 'LOCKED') {
                    agent.status = 'LOCKED';
                    agent.isLocked = true;
                    agent.lockedReason = `Hệ thống tự động khóa do quá hạn thanh toán đơn ${item.wonId} (${item.flightNumber} - ${item.route})`;
                    agent.lockedAt = new Date().toLocaleString('vi-VN');
                    item.lockPenaltyHandled = true;
                    modified = true;

                    const hasNotif = (data.notifications || []).some(n => 
                        (n.targetAgentCode || '').toUpperCase() === targetCode &&
                        n.type === 'ALERT' &&
                        (n.title || '').includes('TÀI KHOẢN ĐÃ BỊ KHÓA')
                    );
                    if (!hasNotif) {
                        const notifId = Date.now() + Math.floor(Math.random() * 1000);
                        data.notifications.unshift({
                            id: notifId,
                            targetAgentCode: item.agentCode,
                            title: `⚠️ TÀI KHOẢN ĐÃ BỊ KHÓA DO QUÁ HẠN THANH TOÁN`,
                            message: `Tài khoản đại lý ${item.agentCode} đã bị hệ thống tự động KHÓA do không hoàn tất thanh toán đơn hàng thắng thầu ${item.wonId} (Chuyến bay ${item.flightNumber}) trước hạn chót. Quyền tham gia đấu giá trên sàn đã bị tạm ngưng. Vui lòng liên hệ Ban Điều hành Cargo để xử lý.`,
                            time: 'Vừa xong',
                            type: 'ALERT',
                            unread: true
                        });
                    }
                }
            }
        }
    });

    return modified;
}

function saveServerData() {
    if (db && db.getDb && db.getDb()) {
        db.seedFullData(serverData).catch(err => {
            if (err.message && err.message.includes('Database handle is closed')) return; // test teardown
            console.error('[Database] Sync to SQLite error:', err.message);
        });
    }
}

// Auto-delete chats that have been CLOSED for more than 7 days
function cleanupClosedChats(data) {
    if (!data || !Array.isArray(data.chats)) return false;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const before = data.chats.length;
    data.chats = data.chats.filter(chat => {
        if (chat.status !== 'CLOSED') return true;
        if (!chat.closedAt) return true;
        const closedMs = new Date(chat.closedAt).getTime();
        return (now - closedMs) < SEVEN_DAYS_MS;
    });
    return data.chats.length !== before;
}

// loadServerDataAsync is invoked at server startup below

// --- Nodemailer & Email Service Helper ---
let mailTransporter = null;
let lastSmtpFingerprint = ''; // Track SMTP config changes to invalidate cache

function getSmtpFingerprint() {
    const smtpSettings = (serverData.settings && serverData.settings.smtp) || {};
    const host = process.env.SMTP_HOST || smtpSettings.host || 'smtp.gmail.com';
    const port = process.env.SMTP_PORT || smtpSettings.port || 465;
    const user = process.env.SMTP_USER || smtpSettings.user || 'jome7093@gmail.com';
    const pass = process.env.SMTP_PASS || smtpSettings.pass || 'fcjuktvwjqhgilzb';
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
    const host = process.env.SMTP_HOST || smtpSettings.host || 'smtp.gmail.com';
    const port = process.env.SMTP_PORT || smtpSettings.port || 465;
    const user = process.env.SMTP_USER || smtpSettings.user || 'jome7093@gmail.com';
    let pass = process.env.SMTP_PASS || smtpSettings.pass || 'fcjuktvwjqhgilzb';

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

// --- Helper: read request body safely (handles unexpected EOF / client disconnect) ---
function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => resolve(body));
        req.on('error', err => reject(err));
    });
}

// --- Global safety net for unhandled promise rejections and uncaught exceptions ---
process.on('uncaughtException', (err) => {
    console.error('[Server] Uncaught Exception (stream/connection error, continuing):', err.message);
});
process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled Rejection (continuing):', reason);
});

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

    // Security Guard: Block sensitive system & hidden files (.env, database.sqlite, source code)
    const rawUrl = req.url || '';
    if (rawUrl.includes('..') || pathname.startsWith('/.') || pathname.includes('/.') || /^\/(database\.sqlite|server\.js|db\.js|package.*\.json)/i.test(pathname)) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=UTF-8' });
        res.end('<h1>403 Forbidden</h1><p>Access denied.</p>', 'utf-8');
        return;
    }

    // --- REST API: GET /api/data ---
    if (pathname === '/api/data' && req.method === 'GET') {
        if (reconcileAuctionSummaries(serverData)) {
            saveServerData();
        }
        if (checkAndAutoLockExpiredWonAuctions(serverData)) {
            saveServerData();
        }
        if (cleanupClosedChats(serverData)) {
            saveServerData();
        }
        if (!Array.isArray(serverData.chats)) serverData.chats = [];

        const agentCode = parsedUrl.searchParams.get('agentCode');
        const role = parsedUrl.searchParams.get('role');
        const isPrivileged = role === 'admin' || role === 'staff';

        // Deep copy data payload for security sanitization
        let clientPayload = JSON.parse(JSON.stringify(serverData));

        // Route Subscriptions are used for notifications (email/push alerts), not for hiding auctions on the main exchange catalog.
        // All agents can view all active auctions on the platform.

        // 🔒 SEC-01: SEALED-BID PRIVACY GUARD (Strict Sealed-Bid Rule)
        // If requester is Agent or Guest (not Admin/Staff), mask individual bids for OPEN auctions
        if (!isPrivileged) {
            const openAuctionIds = new Set(
                (clientPayload.auctions || [])
                    .filter(a => a.status === 'OPEN')
                    .map(a => Number(a.id))
            );

            // While OPEN, anonymize competitor identities (agentCode & agentName) for competitors
            // so all agents see the realtime bid log with price & time, but competitors are shown as "Đại lý ẩn danh (AG-***)"
            clientPayload.bids = (clientPayload.bids || []).map(b => {
                const isAuctionOpen = openAuctionIds.has(Number(b.auctionId));
                if (!isAuctionOpen) return b;
                const isMine = agentCode && String(b.agentCode || '').trim().toUpperCase() === String(agentCode).trim().toUpperCase();
                if (isMine) return b;
                return {
                    ...b,
                    agentCode: 'AG-***',
                    agentName: 'Đại lý ẩn danh (AG-***)',
                    isAnonymous: true
                };
            });

            // Mask leading agent name in OPEN auction summaries for competitors
            (clientPayload.auctions || []).forEach(a => {
                if (a.status === 'OPEN' && a.isAnonymous !== false) {
                    if (!agentCode || String(a.leadingAgentCode || '').toUpperCase() !== String(agentCode).toUpperCase()) {
                        a.leadingAgentCode = 'AG-***';
                        a.leadingAgentName = 'Đại lý ẩn danh (AG-***)';
                    }
                }
            });
        }

        res.writeHead(200, {
            'Content-Type': 'application/json; charset=UTF-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(JSON.stringify(clientPayload), 'utf-8');
        return;
    }

    // --- REST API: GET /api/logs ---
    if (pathname === '/api/logs' && req.method === 'GET') {
        const role = parsedUrl.searchParams.get('role');
        const category = parsedUrl.searchParams.get('category');
        const search = parsedUrl.searchParams.get('q');
        let logs = serverData.activityLogs || [];

        if (role && role !== 'ALL') {
            logs = logs.filter(l => (l.role || '').toUpperCase() === role.toUpperCase());
        }
        if (category && category !== 'ALL') {
            logs = logs.filter(l => (l.actionCategory || '') === category);
        }
        if (search) {
            const q = search.toLowerCase().trim();
            logs = logs.filter(l =>
                (l.actor || '').toLowerCase().includes(q) ||
                (l.username || '').toLowerCase().includes(q) ||
                (l.actionTitle || '').toLowerCase().includes(q) ||
                (l.target || '').toLowerCase().includes(q) ||
                (l.details || '').toLowerCase().includes(q) ||
                (l.ip || '').includes(q)
            );
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: true, logs: logs }), 'utf-8');
        return;
    }

    // --- REST API: POST /api/logs ---
    if (pathname === '/api/logs' && req.method === 'POST') {
        readBody(req).then(async (body) => {
            try {
                const logData = JSON.parse(body || '{}');
                if (!serverData.activityLogs) serverData.activityLogs = [];
                
                const now = new Date();
                const pad = n => String(n).padStart(2, '0');
                const timestampStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

                const newLog = {
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    timestamp: timestampStr,
                    rawTime: now.getTime(),
                    actor: logData.actor || 'Quản trị viên',
                    username: logData.username || 'admin',
                    role: logData.role || 'ADMIN',
                    actionCategory: logData.actionCategory || 'Khác',
                    actionTitle: logData.actionTitle || 'Thao tác hệ thống',
                    target: logData.target || 'N/A',
                    details: logData.details || '',
                    ip: logData.ip || req.socket.remoteAddress || '113.161.42.12',
                    device: logData.device || 'Web App'
                };

                serverData.activityLogs.unshift(newLog);
                if (serverData.activityLogs.length > 1000) {
                    serverData.activityLogs = serverData.activityLogs.slice(0, 1000);
                }
                saveServerData();

                res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({ success: true, log: newLog }), 'utf-8');
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({ success: false, error: err.message }), 'utf-8');
            }
        });
        return;
    }

    // --- REST API: DELETE /api/logs (Clear Audit Logs) ---
    if (pathname === '/api/logs' && req.method === 'DELETE') {
        serverData.activityLogs = [];
        saveServerData();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: true, message: 'Đã xóa toàn bộ nhật ký hoạt động hệ thống.' }), 'utf-8');
        return;
    }

    // --- REST API: POST /api/bids/place (Atomic Sealed-Bid Placement) ---
    if (pathname === '/api/bids/place' && req.method === 'POST') {
        readBody(req).then(async (body) => {
            try {
                const { auctionId, agentCode, agentName, priceKg, isAnonymous, weightKg } = JSON.parse(body || '{}');
                if (!auctionId || !agentCode || !priceKg) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
                    res.end(JSON.stringify({ success: false, error: 'Thiếu auctionId, agentCode hoặc priceKg' }));
                    return;
                }

                // Call SQLite atomic transaction
                const placedBid = await db.placeBidAtomic({
                    auctionId: Number(auctionId),
                    agentCode,
                    agentName: agentName || agentCode,
                    priceKg: Number(priceKg),
                    isAnonymous: isAnonymous !== false,
                    weightKg: Number(weightKg) || 0
                });

                // Refresh in-memory state from database
                serverData = await db.getFullServerData();

                // Log bidding activity into activity_logs DB & in-memory serverData
                try {
                    const pad = n => String(n).padStart(2, '0');
                    const now = new Date();
                    const timestampStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
                    const agentObj = (serverData.agentsList || []).find(a => (a.code || '').toUpperCase() === (agentCode || '').toUpperCase());
                    const aucObj = (serverData.auctions || []).find(a => a.id == auctionId);
                    const actorName = (agentObj ? (agentObj.repName || agentObj.companyName) : agentName || agentCode);
                    const flightStr = aucObj ? aucObj.flightNumber : `AUC-${auctionId}`;
                    const priceFormatted = new Intl.NumberFormat('vi-VN').format(priceKg);
                    const detailsStr = `Đại lý ${(agentObj ? agentObj.companyName : agentCode)} đặt thầu thành công mức giá ${priceFormatted}đ/Kg cho chuyến bay ${flightStr} (${aucObj ? aucObj.route : ''}).`;

                    await db.run(
                        `INSERT INTO activity_logs (timestamp, rawTime, actor, username, role, actionCategory, actionTitle, target, details, ip, device)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [timestampStr, now.getTime(), actorName, agentCode, 'AGENT', 'Đấu giá', 'Đặt giá thầu', flightStr, detailsStr, '113.161.42.12', 'Web Client']
                    ).catch(e => console.error('Failed to log bid activity to db:', e));

                    if (!serverData.activityLogs) serverData.activityLogs = [];
                    serverData.activityLogs.unshift({
                        id: Date.now() + Math.floor(Math.random() * 1000),
                        timestamp: timestampStr,
                        rawTime: now.getTime(),
                        actor: actorName,
                        username: agentCode,
                        role: 'AGENT',
                        actionCategory: 'Đấu giá',
                        actionTitle: 'Đặt giá thầu',
                        target: flightStr,
                        details: detailsStr,
                        ip: '113.161.42.12',
                        device: 'Web Client'
                    });
                } catch (logErr) {
                    console.error('[Server] Error logging bid activity:', logErr);
                }

                res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({
                    success: true,
                    bid: placedBid,
                    message: `Đặt thầu thành công mức giá ${new Intl.NumberFormat('vi-VN').format(priceKg)}đ / Kg!`
                }), 'utf-8');
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        }).catch(err => {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Stream error' }));
        });
        return;
    }

    // --- REST API: POST /api/registration/approve (Admin Agent Approval) ---
    if (pathname === '/api/registration/approve' && req.method === 'POST') {
        readBody(req).then(async (body) => {
            try {
                const { regId, approvedBy } = JSON.parse(body || '{}');
                if (!regId) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
                    res.end(JSON.stringify({ success: false, error: 'regId is required' }));
                    return;
                }

                const regList = serverData.registrations || [];
                const reg = regList.find(r => r.regId === regId);
                if (!reg) {
                    res.writeHead(404, { 'Content-Type': 'application/json; charset=UTF-8' });
                    res.end(JSON.stringify({ success: false, error: 'Hồ sơ đăng ký không tồn tại' }));
                    return;
                }

                const randomCode = 'AG-' + String(Math.floor(1000 + Math.random() * 9000));
                reg.status = 'APPROVED';
                reg.approvedAt = new Date().toLocaleString('vi-VN');
                reg.agentCode = randomCode;

                if (!serverData.agentsList) serverData.agentsList = [];
                let agent = serverData.agentsList.find(a => (a.taxCode && a.taxCode === reg.taxCode) || a.code === randomCode);
                if (!agent) {
                    agent = {
                        code: randomCode,
                        name: reg.companyName,
                        companyName: reg.companyName,
                        taxCode: reg.taxCode,
                        email: reg.email,
                        phone: reg.phone,
                        status: 'Hoạt động',
                        isLocked: false
                    };
                    serverData.agentsList.push(agent);
                } else {
                    agent.status = 'Hoạt động';
                    agent.isLocked = false;
                    agent.code = randomCode;
                }

                saveServerData();
                await db.createAuditLog('ADMIN', approvedBy || 'admin', 'APPROVE_REGISTRATION', regId, `Cấp mã đại lý ${randomCode} cho ${reg.companyName}`);

                res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({
                    success: true,
                    agentCode: randomCode,
                    message: `Hồ sơ ${regId} đã được duyệt thành công! Mã đại lý cấp: ${randomCode}`
                }), 'utf-8');
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // --- REST API: POST /api/data ---
    if (pathname === '/api/data' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('error', err => {
            console.error('[api/data] Stream error:', err.message);
            if (!res.headersSent) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, error: 'Stream error' })); }
        });
        req.on('end', () => {
            try {
                const incoming = JSON.parse(body);
                if (incoming.auctions && Array.isArray(incoming.auctions)) {
                    const map = new Map();
                    (serverData.auctions || []).forEach(a => {
                        if (a && a.origin && a.destination && a.flightNumber && a.flightNumber !== 'VU-HIST') {
                            map.set(a.id, a);
                        }
                    });
                    incoming.auctions.forEach(a => {
                        if (a && a.origin && a.destination && a.flightNumber && a.flightNumber !== 'VU-HIST') {
                            map.set(a.id, a);
                        }
                    });
                    serverData.auctions = Array.from(map.values()).sort((a, b) => (b.id || 0) - (a.id || 0));
                }
                if (incoming.bids && Array.isArray(incoming.bids)) {
                    const validAgentCodes = new Set([
                        ...(serverData.agentsList || []).map(a => String(a.code || '').trim().toUpperCase()),
                        ...(serverData.usersList || []).map(u => String(u.agentCode || '').trim().toUpperCase()),
                        'AG-0892', 'AG-1024', 'AG-0556', 'AG-0341', 'AG-0789'
                    ].filter(Boolean));

                    const allBidsList = [...(serverData.bids || []), ...incoming.bids].filter(b => {
                        if (!b) return false;
                        const code = String(b.agentCode || '').trim().toUpperCase();
                        return code && code !== 'AG-***' && code !== 'ANONYMOUS' && validAgentCodes.has(code);
                    });

                    // Sort descending by timestamp / ID so official BID- IDs take precedence
                    allBidsList.sort((a, b) => Number(b.timestamp || b.id || 0) - Number(a.timestamp || a.id || 0));

                    const bidMap = new Map();
                    allBidsList.forEach(b => {
                        const code = String(b.agentCode || '').trim().toUpperCase();
                        const key = `${Number(b.auctionId)}_${code}_${Number(b.priceKg)}`;
                        if (!bidMap.has(key)) {
                            bidMap.set(key, b);
                        } else {
                            const existing = bidMap.get(key);
                            if (String(b.id || '').startsWith('BID-') && !String(existing.id || '').startsWith('BID-')) {
                                bidMap.set(key, b);
                            }
                        }
                    });
                    serverData.bids = Array.from(bidMap.values()).sort((a, b) => Number(b.priceKg) - Number(a.priceKg));
                }
                if (incoming.wonAuctions && Array.isArray(incoming.wonAuctions)) {
                    const wonMap = new Map();
                    (serverData.wonAuctions || []).forEach(w => {
                        if (w && w.wonId) wonMap.set(String(w.wonId), w);
                    });
                    incoming.wonAuctions.forEach(w => {
                        if (w && w.wonId) wonMap.set(String(w.wonId), w);
                    });
                    serverData.wonAuctions = Array.from(wonMap.values());
                }
                if (incoming.notifications) serverData.notifications = incoming.notifications;
                if (incoming.activityLogs && Array.isArray(incoming.activityLogs)) {
                    // Merge by id - don't overwrite server-written logs (e.g. from agent bids)
                    const logMap = new Map();
                    (serverData.activityLogs || []).forEach(l => { if (l && l.id) logMap.set(String(l.id), l); });
                    incoming.activityLogs.forEach(l => { if (l && l.id) logMap.set(String(l.id), l); });
                    serverData.activityLogs = Array.from(logMap.values())
                        .sort((a, b) => (b.rawTime || b.id || 0) - (a.rawTime || a.id || 0))
                        .slice(0, 1000);
                }
                if (incoming.registrations) serverData.registrations = incoming.registrations;
                if (incoming.agentsList) serverData.agentsList = incoming.agentsList;
                if (incoming.adminsList) serverData.adminsList = incoming.adminsList;
                if (incoming.settings) {
                    serverData.settings = incoming.settings;
                    mailTransporter = null;
                }
                if (incoming.bankConfig) serverData.bankConfig = incoming.bankConfig;
                if (incoming.routeSubscriptions) serverData.routeSubscriptions = incoming.routeSubscriptions;
                if (incoming.chats) serverData.chats = incoming.chats;

                reconcileAuctionSummaries(serverData);
                checkAndAutoLockExpiredWonAuctions(serverData);
                serverData.version = Date.now();
                saveServerData();

                if (!res.headersSent) {
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                    res.end(JSON.stringify({ success: true, version: serverData.version }), 'utf-8');
                }
            } catch (err) {
                if (!res.headersSent) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
            }
        });
        return;
    }

    // ============================================================
    // --- CHAT SUPPORT API ---
    // ============================================================

    // GET /api/chat  — Lấy danh sách chat (agent xem của mình, admin/staff xem tất cả)
    if (pathname === '/api/chat' && req.method === 'GET') {
        if (!Array.isArray(serverData.chats)) serverData.chats = [];
        if (cleanupClosedChats(serverData)) saveServerData();
        const agentCode = parsedUrl.searchParams.get('agentCode');
        const chats = agentCode
            ? serverData.chats.filter(c => c.agentCode === agentCode)
            : serverData.chats;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify({ success: true, chats }), 'utf-8');
        return;
    }

    // POST /api/chat/create  — Đại lý tạo phiên chat mới
    if (pathname === '/api/chat/create' && req.method === 'POST') {
        readBody(req).then(body => {
            try {
                const { agentCode, agentName, text } = JSON.parse(body);
                if (!agentCode || !text) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Thiếu agentCode hoặc text' }));
                    return;
                }
                if (!Array.isArray(serverData.chats)) serverData.chats = [];
                // Kiểm tra đã có phiên OPEN/WAITING/ACTIVE chưa
                const existing = serverData.chats.find(c => c.agentCode === agentCode && c.status !== 'CLOSED');
                if (existing) {
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                    res.end(JSON.stringify({ success: true, chat: existing }), 'utf-8');
                    return;
                }
                const now = Date.now();
                const chatId = 'CHAT-' + now;
                const newChat = {
                    id: chatId,
                    agentCode,
                    agentName: agentName || agentCode,
                    status: 'WAITING',
                    createdAt: new Date(now).toISOString(),
                    closedAt: null,
                    assignedTo: null,
                    assignedName: null,
                    messages: [
                        {
                            id: 'MSG-' + now + '-0',
                            sender: 'agent',
                            senderName: agentName || agentCode,
                            text,
                            fileUrl: null,
                            fileName: null,
                            fileType: null,
                            timestamp: now,
                            read: false
                        },
                        {
                            id: 'MSG-' + now + '-sys',
                            sender: 'system',
                            senderName: 'Hệ thống',
                            text: 'Yêu cầu hỗ trợ đã được gửi. Nhân viên sẽ phản hồi sớm nhất có thể. Vui lòng chờ trong giây lát...',
                            fileUrl: null,
                            fileName: null,
                            fileType: null,
                            timestamp: now + 1,
                            read: false
                        }
                    ]
                };
                serverData.chats.push(newChat);
                serverData.version = Date.now();
                saveServerData();
                res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({ success: true, chat: newChat }), 'utf-8');
            } catch (err) {
                if (!res.headersSent) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, error: err.message })); }
            }
        }).catch(err => {
            console.error('[chat/create] Stream error:', err.message);
            if (!res.headersSent) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, error: 'Stream error' })); }
        });
        return;
    }

    // POST /api/chat/send  — Gửi tin nhắn (text hoặc file)
    if (pathname === '/api/chat/send' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('error', err => { console.error('[chat/send] Stream error:', err.message); if (!res.headersSent) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({success:false,error:'Stream error'})); } });
        req.on('end', () => {
            try {
                const { chatId, sender, senderName, text, fileUrl, fileName, fileType } = JSON.parse(body);
                if (!chatId || !sender || (!text && !fileUrl)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Thiếu chatId, sender hoặc nội dung tin nhắn' }));
                    return;
                }
                if (!Array.isArray(serverData.chats)) serverData.chats = [];
                const chat = serverData.chats.find(c => c.id === chatId);
                if (!chat) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Không tìm thấy phiên chat' }));
                    return;
                }
                if (chat.status === 'CLOSED') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Phiên chat đã đóng' }));
                    return;
                }
                const now = Date.now();
                const msg = {
                    id: 'MSG-' + now + '-' + Math.floor(Math.random() * 9999),
                    sender,
                    senderName: senderName || sender,
                    text: text || null,
                    fileUrl: fileUrl || null,
                    fileName: fileName || null,
                    fileType: fileType || null,
                    timestamp: now,
                    read: false
                };
                if (!Array.isArray(chat.messages)) chat.messages = [];
                chat.messages.push(msg);
                serverData.version = Date.now();
                saveServerData();
                res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({ success: true, message: msg }), 'utf-8');
            } catch (err) {
                if (!res.headersSent) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, error: err.message })); }
            }
        });
        return;
    }

    // POST /api/chat/assign  — Admin/Staff nhận phiên để hỗ trợ
    if (pathname === '/api/chat/assign' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('error', err => { console.error('[assign] Stream error:', err.message); if (!res.headersSent) { res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({success:false,error:'Stream error'})); } });
        req.on('error', err => { console.error('[chat/assign] Stream error:', err.message); if (!res.headersSent) { res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({success:false,error:'Stream error'})); } });
        req.on('end', () => {
            try {
                const { chatId, staffId, staffName } = JSON.parse(body);
                if (!chatId || !staffId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Thiếu chatId hoặc staffId' }));
                    return;
                }
                if (!Array.isArray(serverData.chats)) serverData.chats = [];
                const chat = serverData.chats.find(c => c.id === chatId);
                if (!chat) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Không tìm thấy phiên chat' }));
                    return;
                }
                chat.status = 'ACTIVE';
                chat.assignedTo = staffId;
                chat.assignedName = staffName || staffId;
                const now = Date.now();
                if (!Array.isArray(chat.messages)) chat.messages = [];
                chat.messages.push({
                    id: 'MSG-' + now + '-assign',
                    sender: 'system',
                    senderName: 'Hệ thống',
                    text: `${staffName || staffId} đã tham gia cuộc trò chuyện và sẵn sàng hỗ trợ bạn.`,
                    fileUrl: null, fileName: null, fileType: null,
                    timestamp: now, read: false
                });
                serverData.version = Date.now();
                saveServerData();
                res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({ success: true, chat }), 'utf-8');
            } catch (err) {
                if (!res.headersSent) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, error: err.message })); }
            }
        });
        return;
    }

    // POST /api/chat/request-close — Admin/Staff gửi yêu cầu đóng phiên chat đến Đại lý
    if (pathname === '/api/chat/request-close' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('error', err => { console.error('[request-close] Stream error:', err.message); if (!res.headersSent) { res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({success:false,error:'Stream error'})); } });
        req.on('end', () => {
            try {
                const { chatId, closedByName } = JSON.parse(body);
                if (!chatId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Thiếu chatId' }));
                    return;
                }
                if (!Array.isArray(serverData.chats)) serverData.chats = [];
                const chat = serverData.chats.find(c => c.id === chatId);
                if (!chat) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Không tìm thấy phiên chat' }));
                    return;
                }
                const now = Date.now();
                chat.status = 'CLOSING_REQUEST';
                if (!Array.isArray(chat.messages)) chat.messages = [];
                chat.messages.push({
                    id: 'MSG-' + now + '-reqclose',
                    sender: 'system',
                    senderName: 'Hệ thống',
                    text: `🔔 ${closedByName || 'Nhân viên hỗ trợ'} đã gửi yêu cầu kết thúc cuộc trò chuyện. Đang chờ đại lý phản hồi xác nhận...`,
                    fileUrl: null, fileName: null, fileType: null,
                    timestamp: now, read: false
                });
                serverData.version = Date.now();
                saveServerData();
                res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({ success: true, chat }), 'utf-8');
            } catch (err) {
                if (!res.headersSent) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, error: err.message })); }
            }
        });
        return;
    }

    // POST /api/chat/respond-close — Đại lý phản hồi tiếp tục hay kết thúc chat
    if (pathname === '/api/chat/respond-close' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('error', err => { console.error('[respond-close] Stream error:', err.message); if (!res.headersSent) { res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({success:false,error:'Stream error'})); } });
        req.on('end', () => {
            try {
                const { chatId, action, agentName } = JSON.parse(body);
                if (!chatId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Thiếu chatId' }));
                    return;
                }
                if (!Array.isArray(serverData.chats)) serverData.chats = [];
                const chat = serverData.chats.find(c => c.id === chatId);
                if (!chat) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Không tìm thấy phiên chat' }));
                    return;
                }
                const now = Date.now();
                if (!Array.isArray(chat.messages)) chat.messages = [];

                if (action === 'keep') {
                    chat.status = 'ACTIVE';
                    chat.messages.push({
                        id: 'MSG-' + now + '-keep',
                        sender: 'system',
                        senderName: 'Hệ thống',
                        text: `💬 Đại lý (${agentName || chat.agentName || 'Đại lý'}) muốn tiếp tục trao đổi thêm thông tin.`,
                        fileUrl: null, fileName: null, fileType: null,
                        timestamp: now, read: false
                    });
                } else {
                    chat.status = 'CLOSED';
                    chat.closedAt = new Date(now).toISOString();
                    chat.messages.push({
                        id: 'MSG-' + now + '-close',
                        sender: 'system',
                        senderName: 'Hệ thống',
                        text: `✅ Cuộc trò chuyện đã kết thúc theo xác nhận từ Đại lý (${agentName || chat.agentName || 'Đại lý'}). Cảm ơn bạn!`,
                        fileUrl: null, fileName: null, fileType: null,
                        timestamp: now, read: false
                    });
                }

                serverData.version = Date.now();
                saveServerData();
                res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({ success: true, chat }), 'utf-8');
            } catch (err) {
                if (!res.headersSent) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, error: err.message })); }
            }
        });
        return;
    }

    // POST /api/chat/close  — Admin/Staff đóng phiên chat
    if (pathname === '/api/chat/close' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('error', err => { console.error('[close] Stream error:', err.message); if (!res.headersSent) { res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({success:false,error:'Stream error'})); } });
        req.on('error', err => { console.error('[chat/close] Stream error:', err.message); if (!res.headersSent) { res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({success:false,error:'Stream error'})); } });
        req.on('end', () => {
            try {
                const { chatId, closedByName } = JSON.parse(body);
                if (!chatId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Thiếu chatId' }));
                    return;
                }
                if (!Array.isArray(serverData.chats)) serverData.chats = [];
                const chat = serverData.chats.find(c => c.id === chatId);
                if (!chat) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Không tìm thấy phiên chat' }));
                    return;
                }
                const now = Date.now();
                chat.status = 'CLOSED';
                chat.closedAt = new Date(now).toISOString();
                if (!Array.isArray(chat.messages)) chat.messages = [];
                chat.messages.push({
                    id: 'MSG-' + now + '-close',
                    sender: 'system',
                    senderName: 'Hệ thống',
                    text: `Cuộc trò chuyện đã được ${closedByName || 'nhân viên hỗ trợ'} kết thúc. Cảm ơn bạn đã liên hệ!`,
                    fileUrl: null, fileName: null, fileType: null,
                    timestamp: now, read: false
                });
                serverData.version = Date.now();
                saveServerData();
                res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({ success: true, chat }), 'utf-8');
            } catch (err) {
                if (!res.headersSent) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, error: err.message })); }
            }
        });
        return;
    }

    // POST /api/chat/read  — Đánh dấu tin nhắn đã đọc
    if (pathname === '/api/chat/read' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('error', err => { console.error('[read] Stream error:', err.message); if (!res.headersSent) { res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({success:false,error:'Stream error'})); } });
        req.on('error', err => { console.error('[chat/read] Stream error:', err.message); if (!res.headersSent) { res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({success:false,error:'Stream error'})); } });
        req.on('end', () => {
            try {
                const { chatId, readerRole } = JSON.parse(body); // readerRole: 'agent' | 'staff'
                if (!chatId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Thiếu chatId' }));
                    return;
                }
                if (!Array.isArray(serverData.chats)) serverData.chats = [];
                const chat = serverData.chats.find(c => c.id === chatId);
                if (chat && Array.isArray(chat.messages)) {
                    const otherRole = readerRole === 'agent' ? ['admin', 'staff'] : ['agent'];
                    chat.messages.forEach(m => {
                        if (otherRole.includes(m.sender)) m.read = true;
                    });
                    serverData.version = Date.now();
                    saveServerData();
                }
                res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({ success: true }), 'utf-8');
            } catch (err) {
                if (!res.headersSent) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, error: err.message })); }
            }
        });
        return;
    }

    // --- REST API: POST /api/upload (file/image/video for chat) ---
    if (pathname === '/api/upload' && req.method === 'POST') {
        let chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('error', err => {
            console.error('[api/upload] Stream error:', err.message);
            if (!res.headersSent) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, error: 'Stream error' })); }
        });
        req.on('end', () => {
            try {
                const buf = Buffer.concat(chunks);
                const boundary = (req.headers['content-type'] || '').split('boundary=')[1];
                if (!boundary) throw new Error('No boundary found');

                // Simple multipart parser
                const boundaryBuf = Buffer.from('--' + boundary);
                const parts = [];
                let start = 0;
                while (start < buf.length) {
                    const idx = buf.indexOf(boundaryBuf, start);
                    if (idx === -1) break;
                    const end = buf.indexOf(boundaryBuf, idx + boundaryBuf.length);
                    if (end === -1) break;
                    const part = buf.slice(idx + boundaryBuf.length + 2, end - 2);
                    parts.push(part);
                    start = end;
                }

                let savedFile = null;
                for (const part of parts) {
                    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
                    if (headerEnd === -1) continue;
                    const headerStr = part.slice(0, headerEnd).toString();
                    const fileData = part.slice(headerEnd + 4);
                    const nameMatch = headerStr.match(/name="([^"]+)"/);
                    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
                    if (nameMatch && nameMatch[1] === 'file' && filenameMatch) {
                        const origName = filenameMatch[1].replace(/[^a-zA-Z0-9._-]/g, '_');
                        const uniqueName = Date.now() + '_' + origName;
                        const filePath = path.join(UPLOADS_DIR, uniqueName);
                        fs.writeFileSync(filePath, fileData);
                        savedFile = { url: '/uploads/' + uniqueName, name: origName };
                    }
                }

                if (savedFile) {
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                    res.end(JSON.stringify({ success: true, url: savedFile.url, name: savedFile.name }));
                } else {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'No file found in request' }));
                }
            } catch (err) {
                console.error('[Upload] Error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // --- REST API: POST /api/reset ---
    if (pathname === '/api/reset' && req.method === 'POST') {
        try {
            serverData = JSON.parse(JSON.stringify(defaultSharedData));
            serverData.version = Date.now();

            // Refresh open auctions end times to future
            if (serverData.auctions && Array.isArray(serverData.auctions)) {
                const now = Date.now();
                serverData.auctions.forEach((a, idx) => {
                    if (a.status === 'OPEN') {
                        a.endTime = new Date(now + (idx === 0 ? 45 : (idx === 1 ? 90 : 120)) * 60 * 1000).toISOString();
                    }
                });
            }

            saveServerData();
            console.log('[Server] Successfully reset all server data to defaultSharedData!');

            res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({
                success: true,
                message: 'Đã khôi phục toàn bộ dữ liệu máy chủ về trạng thái mặc định ban đầu thành công!',
                version: serverData.version
            }), 'utf-8');
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
        }
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
                    const finalReason = reason || (regData && (regData.rejectionReason || regData.rejectReason)) || 'Hồ sơ chưa đạt tiêu chuẩn theo quy chế xét duyệt đại lý';
                    subject = `[Vietravel Airlines Cargo] Yêu cầu bổ sung / Kết quả xét duyệt hồ sơ đại lý - ${regId}`;
                    html = buildEmailHtml({
                        title: 'Thông báo Kết quả Xét duyệt Hồ sơ Đại lý',
                        subtitle: `Mã hồ sơ: ${regId}`,
                        contentHtml: `
                            <p>Kính gửi <strong>${repName}</strong> (Đại diện <strong>${companyName}</strong>),</p>
                            <p>Ban Điều hành Đấu giá Vietravel Airlines Cargo trân trọng cảm ơn Quý doanh nghiệp đã nộp hồ sơ đăng ký tham gia sàn đấu giá.</p>
                            
                            <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:6px;margin:16px 0;">
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;width:35%;">Mã hồ sơ:</td><td style="font-weight:bold;color:#e65100;">${regId}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Doanh nghiệp:</td><td>${companyName}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Kết quả xét duyệt:</td><td style="font-weight:bold;color:#d32f2f;">TỪ CHỐI / YÊU CẦU BỔ SUNG</td></tr>
                                <tr><td style="color:#555;vertical-align:top;">Lý do & Hướng dẫn:</td><td style="color:#d32f2f;font-weight:bold;line-height:1.5;">${finalReason}</td></tr>
                            </table>

                            <p style="margin-top:16px;">Để không làm gián đoạn kế hoạch tham gia đấu giá tải trọng, Quý công ty vui lòng bấm vào nút bên dưới để chỉnh sửa và bổ sung thông tin cần thiết:</p>

                            <p style="text-align:center;margin:24px 0;">
                                <a href="http://localhost:8085/Register.html?resubmit=${regId}" style="display:inline-block;background-color:#d32f2f;color:#ffffff;font-weight:bold;padding:12px 28px;border-radius:6px;text-decoration:none;box-shadow:0 2px 4px rgba(0,0,0,0.15);">CHỈNH SỬA & BỔ SUNG HỒ SƠ</a>
                            </p>

                            <p style="font-size:12px;color:#666;">Nếu cần hỗ trợ thêm, Quý doanh nghiệp vui lòng liên hệ Ban Quản trị qua Hotline <strong>1900 1337</strong> hoặc email <strong>cargo@vietravelairlines.vn</strong>.</p>
                        `
                    });
                } else if (type === 'AUCTION_WON') {
                    const wonData = reqData.wonData || {};
                    const wonId = wonData.wonId || 'WON-ORDER';
                    const flightNum = wonData.flightNumber || (reqData.auctionData && reqData.auctionData.flightNumber) || '';
                    const route = wonData.route || (reqData.auctionData && reqData.auctionData.route) || '';
                    const capacityKg = wonData.capacityKg || 0;
                    const priceKg = wonData.priceKg || 0;
                    const totalVnd = wonData.totalAmountVND || (priceKg * capacityKg);
                    const awb = wonData.awbNumber || '998-XXXXXXXX';
                    const fmtNum = (n) => new Intl.NumberFormat('vi-VN').format(n);

                    subject = `[Vietravel Airlines Cargo] CHÚC MỪNG TRÚNG THẦU! Đơn hàng ${wonId} - Chuyến ${flightNum} (${route})`;
                    html = buildEmailHtml({
                        title: 'Chúc mừng Quý đại lý đã TRÚNG THẦU!',
                        subtitle: `Mã đơn trúng thầu: ${wonId} &middot; Chuyến bay ${flightNum}`,
                        contentHtml: `
                            <p>Kính gửi Quý đại lý <strong>${reqData.agentName || 'Ủy quyền'}</strong> (${reqData.agentCode || 'AG'}),</p>
                            <p style="color:#2e7d32;font-weight:bold;">Vietravel Airlines Cargo trân trọng thông báo Quý công ty đã chính thức THẮNG THẦU lô hàng tải trọng đường hàng không.</p>

                            <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#f0f7f0;border:1px solid #c8e6c9;border-radius:6px;margin:16px 0;">
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Mã đơn thắng thầu:</td><td style="font-weight:bold;color:#1565c0;font-family:monospace;">${wonId}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Chuyến bay / Tuyến:</td><td style="font-weight:bold;color:#333;">${flightNum} (${route})</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Tải trọng chốt thắng:</td><td style="font-weight:bold;color:#1565c0;">${fmtNum(capacityKg)} Kg</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Mức giá chốt:</td><td style="font-weight:bold;color:#2e7d32;">${fmtNum(priceKg)} đ / Kg</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Tổng tiền thanh toán:</td><td style="font-weight:bold;color:#d32f2f;font-size:16px;">${fmtNum(totalVnd)} đ</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Mã vận đơn (AWB):</td><td style="font-family:monospace;font-weight:bold;color:#1565c0;">${awb}</td></tr>
                                <tr><td style="color:#555;">Hạn chót thanh toán:</td><td style="color:#d32f2f;font-weight:bold;">Trong vòng 24 giờ kể từ thời điểm chốt thầu</td></tr>
                            </table>

                            <p style="margin-top:16px;"><strong>Hướng dẫn tiếp theo:</strong></p>
                            <ol style="padding-left:20px;line-height:1.7;">
                                <li>Đăng nhập hệ thống Sàn Đấu giá Cargo và truy cập mục <strong>Thắng thầu (Won Auctions)</strong>.</li>
                                <li>Hoàn tất chuyển khoản thanh toán và bấm <em>Báo đã chuyển khoản</em> để Ban Điều hành xác nhận.</li>
                                <li>Tải Phiếu Xác Nhận Trúng Thầu (PDF) và bàn giao hàng hóa tại kho theo đúng giờ Cut-off.</li>
                            </ol>

                            <p style="text-align:center;margin:24px 0;">
                                <a href="http://localhost:8085/07-WonAuction.html" style="display:inline-block;background-color:#2e7d32;color:#ffffff;font-weight:bold;padding:12px 28px;border-radius:6px;text-decoration:none;">XEM ĐƠN TRÚNG THẦU & VẬN ĐƠN</a>
                            </p>
                        `
                    });
                } else if (type === 'PAYMENT_CONFIRMED') {
                    const wonData = reqData.wonData || {};
                    const wonId = wonData.wonId || 'WON-ORDER';
                    const flightNum = wonData.flightNumber || '';
                    const route = wonData.route || '';
                    const totalVnd = wonData.totalAmountVND || 0;
                    const awb = wonData.awbNumber || '998-XXXXXXXX';
                    const fmtNum = (n) => new Intl.NumberFormat('vi-VN').format(n);

                    subject = `[Vietravel Airlines Cargo] XÁC NHẬN ĐÃ NHẬN THANH TOÁN - Đơn hàng ${wonId}`;
                    html = buildEmailHtml({
                        title: 'Xác nhận Đã Nhận Thanh Toán Thành Công',
                        subtitle: `Mã đơn: ${wonId} &middot; Chuyến bay ${flightNum}`,
                        contentHtml: `
                            <p>Kính gửi Quý đại lý,</p>
                            <p style="color:#2e7d32;font-weight:bold;">Ban Tài chính & Điều hành Vietravel Airlines Cargo xác nhận đã nhận đủ số tiền thanh toán cho đơn hàng thắng thầu của Quý công ty.</p>

                            <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#f0f7f0;border:1px solid #c8e6c9;border-radius:6px;margin:16px 0;">
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Mã đơn thắng thầu:</td><td style="font-weight:bold;color:#1565c0;font-family:monospace;">${wonId}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Chuyến bay / Tuyến:</td><td>${flightNum} (${route})</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Số tiền đã nhận:</td><td style="font-weight:bold;color:#2e7d32;font-size:16px;">${fmtNum(totalVnd)} đ</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Mã AWB điện tử:</td><td style="font-family:monospace;font-weight:bold;color:#1565c0;">${awb}</td></tr>
                                <tr><td style="color:#555;">Trạng thái thanh toán:</td><td style="font-weight:bold;color:#2e7d32;">ĐÃ THANH TOÁN (PAID)</td></tr>
                            </table>

                            <p style="margin-top:16px;">Slot vận chuyển của Quý đại lý đã được giữ chính thức. Vui lòng in/xuất trình Phiếu xác nhận khi bàn giao hàng tại kho.</p>

                            <p style="text-align:center;margin:24px 0;">
                                <a href="http://localhost:8085/07-WonAuction.html" style="display:inline-block;background-color:#1565c0;color:#ffffff;font-weight:bold;padding:12px 28px;border-radius:6px;text-decoration:none;">XEM TẢI PHIẾU BÀN GIAO KHO</a>
                            </p>
                        `
                    });
                } else if (type === 'PAYMENT_REJECTED') {
                    const wonData = reqData.wonData || {};
                    const wonId = wonData.wonId || reqData.wonId || 'WON-ORDER';
                    const flightNum = wonData.flightNumber || reqData.flightNumber || '';
                    const route = wonData.route || reqData.route || '';
                    const rejReason = reqData.reason || wonData.rejectionReason || 'Biên lai hoặc mã giao dịch không hợp lệ';
                    const fmtNum = (n) => new Intl.NumberFormat('vi-VN').format(n);

                    subject = `[Vietravel Airlines Cargo] ❌ YÊU CẦU NỘP LẠI BIÊN LAI THANH TOÁN - Đơn hàng ${wonId}`;
                    html = buildEmailHtml({
                        title: 'Yêu Cầu Nộp Lại Biên Lai Thanh Toán',
                        subtitle: `Mã đơn: ${wonId} &middot; Chuyến bay ${flightNum}`,
                        contentHtml: `
                            <p>Kính gửi Quý đại lý,</p>
                            <p style="color:#d32f2f;font-weight:bold;">Ban Tài chính & Tra soát Vietravel Airlines Cargo đã kiểm tra thông tin chuyển khoản cho đơn hàng ${wonId} và yêu cầu Quý đại lý NỘP LẠI BIÊN LAI THANH TOÁN.</p>

                            <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#ffebee;border:1px solid #ffcdd2;border-radius:6px;margin:16px 0;">
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;width:35%;">Mã đơn thắng thầu:</td><td style="font-weight:bold;color:#1565c0;font-family:monospace;">${wonId}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Chuyến bay / Tuyến:</td><td>${flightNum} (${route})</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Lý do từ chối biên lai:</td><td style="font-weight:bold;color:#d32f2f;font-size:14px;">${rejReason}</td></tr>
                                <tr><td style="color:#555;">Thời gian tra soát:</td><td style="font-weight:bold;color:#333;">${new Date().toLocaleString('vi-VN')}</td></tr>
                            </table>

                            <p style="margin-top:16px;">Vui lòng kiểm tra lại sao kê chuyển khoản ngân hàng, chụp rõ ảnh biên lai/mã FT và truy cập sàn đấu giá để <strong>NỘP LẠI BIÊN LAI MỚI</strong> trước thời hạn Cut-off.</p>

                            <p style="text-align:center;margin:24px 0;">
                                <a href="http://localhost:8085/07-WonAuction.html" style="display:inline-block;background-color:#d32f2f;color:#ffffff;font-weight:bold;padding:12px 28px;border-radius:6px;text-decoration:none;">NỘP LẠI BIÊN LAI THANH TOÁN</a>
                            </p>
                        `
                    });
                } else if (type === 'ROUTE_AUCTION_OPEN' || type === 'NEW_AUCTION_ALERT') {
                    const auctionData = reqData.auctionData || {};
                    const flightNum = auctionData.flightNumber || reqData.flightNumber || '';
                    const route = auctionData.route || reqData.route || '';
                    const originName = auctionData.originName || reqData.originName || '';
                    const destName = auctionData.destName || reqData.destName || '';
                    const capacityKg = auctionData.capacityKg || reqData.capacityKg || 0;
                    const startingPriceKg = auctionData.startingPriceKg || reqData.startingPriceKg || 0;
                    const etd = auctionData.etd || reqData.etd || '';
                    const fmtNum = (n) => new Intl.NumberFormat('vi-VN').format(n);

                    subject = `[Vietravel Airlines Cargo] 🔔 MỞ ĐẤU GIÁ TUYẾN QUAN TÂM: Chuyến ${flightNum} (${route})`;
                    html = buildEmailHtml({
                        title: `Mở Đấu Giá Tuyến Bạn Quan Tâm: ${route}`,
                        subtitle: `Chuyến bay ${flightNum} &middot; ${originName} ➔ ${destName}`,
                        contentHtml: `
                            <p>Kính gửi Quý đại lý <strong>${reqData.agentName || 'Quý Đại lý'}</strong> (${reqData.agentCode || ''}),</p>
                            <p>Hệ thống Vietravel Airlines Cargo trân trọng thông báo: Tuyến bay <strong>${route} (${originName} ➔ ${destName})</strong> mà Quý đại lý đã đăng ký theo dõi vừa chính thức mở phiên đấu giá mới với thông tin chi tiết như sau:</p>

                            <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#f0f4ff;border:1px solid #c7d2fe;border-radius:6px;margin:16px 0;">
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;width:38%;">Số hiệu chuyến bay:</td><td style="font-weight:bold;color:#1e3a5f;font-family:monospace;font-size:15px;">${flightNum}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Hành trình / Tuyến bay:</td><td style="font-weight:bold;color:#333;">${route} (${originName} - ${destName})</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Giờ cất cánh dự kiến (ETD):</td><td style="color:#1e3a5f;font-weight:bold;">${etd}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Tải trọng mở thầu:</td><td style="font-weight:bold;color:#1e3a5f;">${fmtNum(capacityKg)} Kg</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Giá khởi điểm sàn:</td><td style="font-weight:bold;color:#2e7d32;font-size:15px;">${fmtNum(startingPriceKg)} đ / Kg</td></tr>
                                <tr><td style="color:#555;">Quy định đóng thầu:</td><td style="color:#d32f2f;font-weight:bold;">Đóng thầu trước ETD 3 giờ</td></tr>
                            </table>

                            <p style="margin-top:16px;">Quý đại lý vui lòng truy cập sàn đấu giá sớm để đặt mức giá chào tốt nhất và giữ slot vận chuyển:</p>

                            <p style="text-align:center;margin:24px 0;">
                                <a href="http://localhost:8085/04-Detail.html?id=${auctionData.id || 1}" style="display:inline-block;background-color:#1e3a5f;color:#ffffff;font-weight:bold;padding:12px 28px;border-radius:6px;text-decoration:none;">XEM CHI TIẾT & ĐẶT GIÁ NGAY</a>
                            </p>
                        `
                    });
                } else if (type === 'PAYMENT_SUBMITTED_ADMIN') {
                    const paymentData = reqData.paymentData || {};
                    const wonId = paymentData.wonId || reqData.wonId || 'WON-ORDER';
                    const agentCode = paymentData.agentCode || reqData.agentCode || 'AG-XXXX';
                    const agentName = paymentData.agentName || reqData.agentName || 'Đại lý';
                    const flightNum = paymentData.flightNumber || reqData.flightNumber || '';
                    const route = paymentData.route || reqData.route || '';
                    const totalVnd = paymentData.transferredAmount || paymentData.totalAmountVND || reqData.amount || 0;
                    const memo = paymentData.memo || reqData.memo || '';
                    const transactionRef = paymentData.transactionRef || reqData.transactionRef || '';
                    const proofImageUrl = paymentData.proofImageUrl || reqData.proofImageUrl || '';
                    const submittedAt = paymentData.submittedAt || new Date().toLocaleString('vi-VN');
                    const fmtNum = (n) => new Intl.NumberFormat('vi-VN').format(n);

                    subject = `[Vietravel Airlines Cargo] 💳 ĐẠI LÝ BÁO CHUYỂN KHOẢN - Đơn ${wonId} (${agentCode})`;
                    html = buildEmailHtml({
                        title: 'Thông Báo: Đại Lý Đã Báo Chuyển Khoản',
                        subtitle: `Mã đơn: ${wonId} &middot; Đại lý: ${agentCode} - ${agentName}`,
                        contentHtml: `
                            <p>Kính gửi <strong>Ban Quản trị & Bộ phận Kế toán / Tra soát</strong>,</p>
                            <p>Đại lý <strong>${agentName} (${agentCode})</strong> vừa gửi thông báo đã hoàn tất chuyển khoản thanh toán cho đơn hàng thắng thầu. Vui lòng đối soát sao kê tài khoản ngân hàng và xác nhận đơn hàng trên hệ thống Admin:</p>

                            <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#fff8e1;border:1px solid #ffe082;border-radius:6px;margin:16px 0;">
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;width:35%;">Mã đơn hàng:</td><td style="font-weight:bold;color:#1e3a5f;font-family:monospace;font-size:15px;">${wonId}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Đại lý thanh toán:</td><td style="font-weight:bold;color:#333;">${agentCode} - ${agentName}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Chuyến bay & Tuyến:</td><td style="color:#1e3a5f;font-weight:bold;">${flightNum} (${route})</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Số tiền báo chuyển:</td><td style="font-weight:bold;color:#d32f2f;font-size:16px;">${fmtNum(totalVnd)} đ</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Cú pháp chuyển khoản:</td><td style="font-family:monospace;font-weight:bold;color:#2e7d32;background:#e8f5e9;padding:4px 8px;border-radius:4px;">${memo}</td></tr>
                                ${transactionRef ? `<tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Mã GD ngân hàng:</td><td style="font-family:monospace;font-weight:bold;color:#1565c0;">${transactionRef}</td></tr>` : ''}
                                <tr><td style="color:#555;">Thời điểm nộp:</td><td style="color:#555;">${submittedAt}</td></tr>
                            </table>

                            ${proofImageUrl ? `
                                <div style="margin:16px 0;padding:12px;background:#f5f5f5;border-radius:6px;text-align:center;">
                                    <p style="font-size:12px;color:#666;margin-bottom:8px;font-weight:bold;">Ảnh biên lai đại lý đính kèm:</p>
                                    <img src="${proofImageUrl}" alt="Biên lai thanh toán" style="max-height:260px;max-width:100%;border-radius:6px;border:1px solid #ddd;" />
                                </div>
                            ` : ''}

                            <p style="margin-top:16px;">Bấm nút bên dưới để chuyển trực tiếp đến màn hình Đối soát & Xác nhận thanh toán:</p>

                            <p style="text-align:center;margin:24px 0;">
                                <a href="http://localhost:8085/Admin/03-AuctionList.html?tab=won&search=${wonId}&reconcile=${wonId}" style="display:inline-block;background-color:#0284c7;color:#ffffff;font-weight:bold;padding:12px 28px;border-radius:6px;text-decoration:none;">ĐỐI SOÁT & DUYỆT ĐƠN TRÊN ADMIN</a>
                            </p>
                        `
                    });
                }

                // Fallback HTML builder if html is still empty
                if (!html || html.trim() === '') {
                    const fallbackTitle = customSubject || reqData.title || '[Vietravel Airlines Cargo] Thông báo hệ thống';
                    const fallbackMsg = reqData.message || reqData.content || reqData.text || 'Vietravel Airlines Cargo trân trọng thông báo: Quý vị có một thông báo mới từ hệ thống Sàn Đấu giá Cargo.';
                    subject = customSubject || `[Vietravel Airlines Cargo] ${reqData.title || 'Thông báo mới'}`;
                    html = buildEmailHtml({
                        title: fallbackTitle,
                        subtitle: 'Thông báo từ Ban Điều hành Sàn Đấu giá Cargo',
                        contentHtml: `
                            <p>Kính gửi Quý đại lý / Khách hàng,</p>
                            <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0;">${fallbackMsg}</p>
                            <p style="text-align:center;margin:24px 0;">
                                <a href="http://localhost:8085/02-Dashboard.html" style="display:inline-block;background-color:#1565c0;color:#ffffff;font-weight:bold;padding:12px 28px;border-radius:6px;text-decoration:none;">VÀO HỆ THỐNG SÀN ĐẤU GIÁ</a>
                            </p>
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

    // ============================================================
    // === MOMO PAYMENT GATEWAY API ENDPOINTS =====================
    // ============================================================

    /**
     * Generate standardized MoMo orderInfo
     * Format: {AgentCode}-{AuctionId}-{DDMMYYYY}
     * All uppercase, no whitespace
     * Example: Agent "AG 0892", auction "VU134", date 17/9/2026 -> "AG0892-VU134-17092026"
     */
    function generateMoMoOrderInfo(agentCode, auctionId, date) {
        const cleanAgent = String(agentCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const cleanAuction = String(auctionId || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const d = date instanceof Date ? date : new Date();
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = String(d.getFullYear());
        return `${cleanAgent}-${cleanAuction}-${dd}${mm}${yyyy}`;
    }

    // MoMo config from env
    const momoConfig = {
        partnerCode: process.env.MOMO_PARTNER_CODE || 'MOMOBKUN20180529',
        accessKey: process.env.MOMO_ACCESS_KEY || 'klm05TvNBzhg7h7j',
        secretKey: process.env.MOMO_SECRET_KEY || 'at67qH6mk8w5Y1nAyMoYKMWACiEi2bsa',
        endpoint: process.env.MOMO_ENDPOINT || 'https://test-payment.momo.vn',
        ipnUrl: process.env.MOMO_IPN_URL || 'http://localhost:8085/api/momo/ipn',
        redirectUrl: process.env.MOMO_REDIRECT_URL || 'http://localhost:8085/07-WonAuction.html'
    };

    // --- POST /api/momo/create --- Create MoMo payment request
    if (pathname === '/api/momo/create' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { wonId } = JSON.parse(body);
                if (!wonId) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
                    res.end(JSON.stringify({ success: false, error: 'wonId is required' }));
                    return;
                }

                // Find the won auction
                const wonList = serverData.wonAuctions || [];
                const wonItem = wonList.find(w => w.wonId === wonId);
                if (!wonItem) {
                    res.writeHead(404, { 'Content-Type': 'application/json; charset=UTF-8' });
                    res.end(JSON.stringify({ success: false, error: 'Won auction not found: ' + wonId }));
                    return;
                }

                // Already paid check
                if (wonItem.paymentStatus === 'PAID' || wonItem.paymentStatus === 'PAID_LATE') {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
                    res.end(JSON.stringify({ success: false, error: 'Order already paid' }));
                    return;
                }

                let amount = Math.round(Number(wonItem.totalAmountVND) || 0);
                
                if (amount <= 0) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
                    res.end(JSON.stringify({ success: false, error: 'Invalid amount' }));
                    return;
                }

                // MoMo Sandbox limits amount to 50,000,000 VND max
                if (momoConfig.partnerCode === 'MOMOBKUN20180529' && amount > 50000000) {
                    console.warn(`[MoMo Sandbox] Total amount ${amount} VND exceeds 50M VND sandbox limit. Adjusting to 50,000,000 VND for test transaction.`);
                    amount = 50000000;
                }

                // Generate orderInfo in standardized format
                const flightOrAuctionId = wonItem.flightNumber || String(wonItem.auctionId || '');
                const orderInfo = generateMoMoOrderInfo(wonItem.agentCode, flightOrAuctionId, new Date());

                // Build MoMo request - clean wonId for orderId to avoid invalid chars
                const cleanWonId = String(wonId).replace(/[^A-Za-z0-9]/g, '');
                const orderId = cleanWonId + '_' + Date.now();
                const requestId = cleanWonId + '_REQ_' + Date.now();
                const extraData = '';
                const requestType = 'captureWallet';

                // Raw signature string (alphabetical order per MoMo docs)
                const rawSignature = [
                    'accessKey=' + momoConfig.accessKey,
                    'amount=' + amount,
                    'extraData=' + extraData,
                    'ipnUrl=' + momoConfig.ipnUrl,
                    'orderId=' + orderId,
                    'orderInfo=' + orderInfo,
                    'partnerCode=' + momoConfig.partnerCode,
                    'redirectUrl=' + momoConfig.redirectUrl,
                    'requestId=' + requestId,
                    'requestType=' + requestType
                ].join('&');

                const signature = crypto
                    .createHmac('sha256', momoConfig.secretKey)
                    .update(rawSignature)
                    .digest('hex');

                const momoRequestBody = JSON.stringify({
                    partnerCode: momoConfig.partnerCode,
                    requestType: requestType,
                    ipnUrl: momoConfig.ipnUrl,
                    redirectUrl: momoConfig.redirectUrl,
                    orderId: orderId,
                    amount: amount,
                    orderInfo: orderInfo,
                    requestId: requestId,
                    extraData: extraData,
                    signature: signature,
                    lang: 'vi'
                });

                console.log('[MoMo] Creating payment request:', { wonId, orderId, amount, orderInfo });

                // POST to MoMo API
                const momoUrl = new URL('/v2/gateway/api/create', momoConfig.endpoint);
                const momoReqOptions = {
                    hostname: momoUrl.hostname,
                    port: 443,
                    path: momoUrl.pathname,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(momoRequestBody)
                    }
                };

                const momoReq = https.request(momoReqOptions, (momoRes) => {
                    let momoData = '';
                    momoRes.on('data', chunk => { momoData += chunk; });
                    momoRes.on('end', () => {
                        try {
                            const momoResult = JSON.parse(momoData);
                            console.log('[MoMo] Response:', momoResult.resultCode, momoResult.message);

                            if (momoResult.resultCode === 0) {
                                // Save MoMo order data to won auction
                                wonItem.momoOrderId = orderId;
                                wonItem.momoRequestId = requestId;
                                wonItem.momoOrderInfo = orderInfo;
                                wonItem.momoPayUrl = momoResult.payUrl || null;
                                wonItem.momoQrCodeUrl = momoResult.qrCodeUrl || null;
                                wonItem.momoDeeplink = momoResult.deeplink || null;
                                wonItem.momoCreatedAt = new Date().toISOString();
                                wonItem.momoExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
                                saveServerData();

                                res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                                res.end(JSON.stringify({
                                    success: true,
                                    orderId: orderId,
                                    orderInfo: orderInfo,
                                    amount: amount,
                                    payUrl: momoResult.payUrl || null,
                                    qrCodeUrl: momoResult.qrCodeUrl || null,
                                    deeplink: momoResult.deeplink || null,
                                    expiresAt: wonItem.momoExpiresAt
                                }));
                            } else if (wonItem.momoQrCodeUrl && wonItem.momoExpiresAt && new Date(wonItem.momoExpiresAt).getTime() > Date.now()) {
                                console.log('[MoMo Fallback] Returning existing unexpired QR code for wonId:', wonId);
                                res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                                res.end(JSON.stringify({
                                    success: true,
                                    orderId: wonItem.momoOrderId,
                                    orderInfo: wonItem.momoOrderInfo || orderInfo,
                                    amount: amount,
                                    payUrl: wonItem.momoPayUrl,
                                    qrCodeUrl: wonItem.momoQrCodeUrl,
                                    deeplink: wonItem.momoDeeplink,
                                    expiresAt: wonItem.momoExpiresAt
                                }));
                            } else {
                                res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
                                res.end(JSON.stringify({
                                    success: false,
                                    error: momoResult.message || 'MoMo payment creation failed',
                                    resultCode: momoResult.resultCode
                                }));
                            }
                        } catch (parseErr) {
                            console.error('[MoMo] Parse error:', parseErr.message);
                            res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
                            res.end(JSON.stringify({ success: false, error: 'Failed to parse MoMo response' }));
                        }
                    });
                });

                momoReq.on('error', (err) => {
                    console.error('[MoMo] Request error:', err.message);
                    res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
                    res.end(JSON.stringify({ success: false, error: 'Failed to connect to MoMo: ' + err.message }));
                });

                momoReq.setTimeout(30000, () => {
                    momoReq.destroy();
                    res.writeHead(504, { 'Content-Type': 'application/json; charset=UTF-8' });
                    res.end(JSON.stringify({ success: false, error: 'MoMo request timeout (30s)' }));
                });

                momoReq.write(momoRequestBody);
                momoReq.end();
            } catch (err) {
                console.error('[MoMo] Create error:', err.message);
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
            }
        });
        return;
    }

    // --- POST /api/momo/ipn --- MoMo IPN Webhook (callback from MoMo)
    if (pathname === '/api/momo/ipn' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const ipnData = JSON.parse(body);
                console.log('[MoMo IPN] Received:', JSON.stringify(ipnData));

                // Verify IPN signature
                const ipnRawSignature = [
                    'accessKey=' + momoConfig.accessKey,
                    'amount=' + ipnData.amount,
                    'extraData=' + (ipnData.extraData || ''),
                    'message=' + (ipnData.message || ''),
                    'orderId=' + ipnData.orderId,
                    'orderInfo=' + (ipnData.orderInfo || ''),
                    'orderType=' + (ipnData.orderType || ''),
                    'partnerCode=' + ipnData.partnerCode,
                    'payType=' + (ipnData.payType || ''),
                    'requestId=' + ipnData.requestId,
                    'responseTime=' + ipnData.responseTime,
                    'resultCode=' + ipnData.resultCode,
                    'transId=' + ipnData.transId
                ].join('&');

                const expectedSignature = crypto
                    .createHmac('sha256', momoConfig.secretKey)
                    .update(ipnRawSignature)
                    .digest('hex');

                if (ipnData.signature !== expectedSignature) {
                    console.error('[MoMo IPN] Signature mismatch! Expected:', expectedSignature, 'Got:', ipnData.signature);
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Invalid signature' }));
                    return;
                }

                console.log('[MoMo IPN] Signature verified OK. resultCode:', ipnData.resultCode);

                // Find won auction by momoOrderId
                const wonList = serverData.wonAuctions || [];
                const wonItem = wonList.find(w => w.momoOrderId === ipnData.orderId);

                if (wonItem && ipnData.resultCode === 0) {
                    // Payment successful
                    const now = new Date();
                    const paidAtStr = now.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
                    wonItem.paymentStatus = 'PAID';
                    wonItem.paidAt = paidAtStr;
                    wonItem.momoTransId = ipnData.transId;
                    wonItem.momoPayType = ipnData.payType || 'qr';
                    wonItem.momoPaidAt = now.toISOString();

                    // If agent account was locked due to this order, unlock it
                    const agentCode = wonItem.agentCode;
                    if (agentCode && serverData.agentsList) {
                        const agent = serverData.agentsList.find(a => (a.code || '').toUpperCase() === agentCode.toUpperCase());
                        if (agent && agent.isLocked) {
                            agent.isLocked = false;
                            agent.lockedReason = null;
                            console.log('[MoMo IPN] Auto-unlocked agent:', agentCode);
                        }
                    }

                    saveServerData();
                    console.log('[MoMo IPN] Payment confirmed for:', wonItem.wonId, 'transId:', ipnData.transId);
                } else if (wonItem) {
                    console.log('[MoMo IPN] Payment failed/cancelled for:', wonItem.wonId, 'resultCode:', ipnData.resultCode);
                } else {
                    console.warn('[MoMo IPN] No matching won auction for orderId:', ipnData.orderId);
                }

                // MoMo expects 204 No Content
                res.writeHead(204);
                res.end();
            } catch (err) {
                console.error('[MoMo IPN] Error:', err.message);
                res.writeHead(500);
                res.end();
            }
        });
        return;
    }

    // --- GET /api/momo/status --- Polling endpoint for frontend
    if (pathname === '/api/momo/status' && req.method === 'GET') {
        const wonId = parsedUrl.searchParams.get('wonId');
        if (!wonId) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: false, error: 'wonId query param required' }));
            return;
        }

        const wonList = serverData.wonAuctions || [];
        const wonItem = wonList.find(w => w.wonId === wonId);
        if (!wonItem) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: false, error: 'Won auction not found' }));
            return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify({
            success: true,
            wonId: wonItem.wonId,
            paymentStatus: wonItem.paymentStatus,
            paidAt: wonItem.paidAt || null,
            momoTransId: wonItem.momoTransId || null,
            momoOrderId: wonItem.momoOrderId || null,
            momoOrderInfo: wonItem.momoOrderInfo || null
        }));
        return;
    }

    // --- Static File Serving: /uploads/ ---
    if (pathname.startsWith('/uploads/')) {
        const relativePath = pathname.replace('/uploads/', '');
        const uploadFile = path.normalize(path.join(UPLOADS_DIR, relativePath));
        if (!uploadFile.startsWith(UPLOADS_DIR)) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
            res.end('403 Forbidden: Invalid file path');
            return;
        }
        fs.readFile(uploadFile, (err, content) => {
            if (err) {
                res.writeHead(404); res.end('Not Found');
            } else {
                const ext2 = path.extname(uploadFile).toLowerCase();
                const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf' };
                res.writeHead(200, { 'Content-Type': mimeMap[ext2] || 'application/octet-stream' });
                res.end(content);
            }
        });
        return;
    }

    // --- Static File Serving ---
    if (pathname === '/') pathname = '/00-Home.html';

    let filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=UTF-8' });
        res.end('<h1>403 Forbidden</h1><p>Access denied.</p>', 'utf-8');
        return;
    }
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

// Export server + startup for programmatic use in tests
async function startServer(port) {
    await loadServerDataAsync();
    return new Promise((resolve, reject) => {
        const targetPort = port || PORT;
        server.listen(targetPort, () => {
            console.log(`Vietravel Airlines Bidding Cargo app running at http://localhost:${targetPort}/ (SQLite WAL DB Connected)`);
            resolve(server);
        });
        server.once('error', reject);
    });
}

module.exports = { server, startServer, PORT, loadServerDataAsync };

// Auto-start only when run directly (not when required by tests)
if (require.main === module) {
    (async () => {
        try {
            await startServer();
        } catch (err) {
            console.error('[Fatal] Database initialization error:', err);
        }
    })();
}


