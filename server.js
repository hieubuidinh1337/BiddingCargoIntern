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
            originName: 'TP. Há»“ ChÃ­ Minh',
            destName: 'HÃ  Ná»™i',
            etd: '14:30 Â· 15/08/2026',
            eta: '16:45 Â· 15/08/2026',
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
            specialNotes: 'HÃ ng tá»•ng há»£p, há»— trá»£ kho láº¡nh báº£o quáº£n thá»±c pháº©m & dÆ°á»£c pháº©m.',
            cutOffTime: '11:30 Â· 15/08/2026'
        },
        {
            id: 2,
            flightCode: 'FL-VU224-260815',
            flightNumber: 'VU224',
            route: 'SGN - DAD',
            origin: 'SGN',
            destination: 'DAD',
            originName: 'TP. Há»“ ChÃ­ Minh',
            destName: 'ÄÃ  Náºµng',
            etd: '16:00 Â· 15/08/2026',
            eta: '17:20 Â· 15/08/2026',
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
            specialNotes: 'Æ¯u tiÃªn bÆ°u kiá»‡n bÆ°u pháº©m thÆ°Æ¡ng máº¡i Ä‘iá»‡n tá»­ chuyá»ƒn phÃ¡t nhanh.',
            cutOffTime: '13:00 Â· 15/08/2026'
        },
        {
            id: 3,
            flightCode: 'FL-VU340-260815',
            flightNumber: 'VU340',
            route: 'HAN - PQC',
            origin: 'HAN',
            destination: 'PQC',
            originName: 'HÃ  Ná»™i',
            destName: 'PhÃº Quá»‘c',
            etd: '19:15 Â· 15/08/2026',
            eta: '21:30 Â· 15/08/2026',
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
            specialNotes: 'HÃ ng háº£i sáº£n Ä‘Ã´ng láº¡nh tÆ°Æ¡i sá»‘ng Ä‘Ã³ng thÃ¹ng xá»‘p tiÃªu chuáº©n IATA.',
            cutOffTime: '16:00 Â· 15/08/2026'
        },
        {
            id: 4,
            flightCode: 'FL-VU132-260814',
            flightNumber: 'VU132',
            route: 'SGN - HAN',
            origin: 'SGN',
            destination: 'HAN',
            originName: 'TP. Há»“ ChÃ­ Minh',
            destName: 'HÃ  Ná»™i',
            etd: '10:00 Â· 14/08/2026',
            eta: '12:15 Â· 14/08/2026',
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
            specialNotes: 'PhiÃªn Ä‘Ã£ Ä‘Ã³ng hÃ´m qua, tháº¯ng tháº§u chÃ­nh thá»©c.',
            cutOffTime: '07:00 Â· 14/08/2026'
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
            time: '3 phÃºt trÆ°á»›c',
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
            time: '6 phÃºt trÆ°á»›c',
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
            time: '15 phÃºt trÆ°á»›c',
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
            time: '25 phÃºt trÆ°á»›c',
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
            time: '35 phÃºt trÆ°á»›c',
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
            time: '42 phÃºt trÆ°á»›c',
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
            time: '48 phÃºt trÆ°á»›c',
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
            time: '52 phÃºt trÆ°á»›c',
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
            time: '56 phÃºt trÆ°á»›c',
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
            time: '1 giá» trÆ°á»›c',
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
            warehouse: 'Kho hÃ ng TCS TÃ¢n SÆ¡n Nháº¥t (Cá»­a sá»‘ 4)'
        }
    ],
    notifications: [
        {
            id: 1,
            title: 'Báº¡n Ä‘ang dáº«n Ä‘áº§u tháº§u VU130',
            message: 'Má»©c giÃ¡ 21,500 Ä‘/Kg cá»§a báº¡n Ä‘ang lÃ  cao nháº¥t cho chuyáº¿n SGN-HAN.',
            time: '12 phÃºt trÆ°á»›c',
            type: 'HIGHEST',
            read: false,
            link: '04-Detail.html?id=1'
        }
    ],
    registrations: [
        {
            regId: 'REG-2026-0805-01',
            companyName: 'CÃ´ng ty TNHH Giao nháº­n Sao Mai Express',
            taxCode: '0315998877',
            address: '77 Báº¡ch Äáº±ng, PhÆ°á»ng 2, Quáº­n TÃ¢n BÃ¬nh, TP.HCM',
            field: 'Cargo Agent',
            repName: 'HoÃ ng Äá»©c Trá»ng',
            repPosition: 'GiÃ¡m Ä‘á»‘c Ä‘iá»u hÃ nh',
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
        bankName: 'NgÃ¢n hÃ ng TMCP Ngoáº¡i ThÆ°Æ¡ng Viá»‡t Nam (Vietcombank)',
        accountNumber: '1029384756',
        accountName: 'CONG TY CP HANG KHONG VIETRAVEL',
        branch: 'Chi nhÃ¡nh TÃ¢n BÃ¬nh - TP. Há»“ ChÃ­ Minh',
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
                    a.specialNotes = (a.specialNotes ? a.specialNotes + ' ' : '') + '(PhiÃªn Ä‘Ã£ tá»± Ä‘á»™ng Ä‘Ã³ng do chuyáº¿n bay Ä‘Ã£ cáº¥t cÃ¡nh).';
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
    const cleanStr = String(dateStr).replace(/Â·|-/g, ' ').replace(/\s+/g, ' ').trim();

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
                    agent.lockedReason = `Há»‡ thá»‘ng tá»± Ä‘á»™ng khÃ³a do quÃ¡ háº¡n thanh toÃ¡n Ä‘Æ¡n ${item.wonId} (${item.flightNumber} - ${item.route})`;
                    agent.lockedAt = new Date().toLocaleString('vi-VN');
                    item.lockPenaltyHandled = true;
                    modified = true;

                    const hasNotif = (data.notifications || []).some(n => 
                        (n.targetAgentCode || '').toUpperCase() === targetCode &&
                        n.type === 'ALERT' &&
                        (n.title || '').includes('TÃ€I KHOáº¢N ÄÃƒ Bá»Š KHÃ“A')
                    );
                    if (!hasNotif) {
                        const notifId = Date.now() + Math.floor(Math.random() * 1000);
                        data.notifications.unshift({
                            id: notifId,
                            targetAgentCode: item.agentCode,
                            title: `âš ï¸ TÃ€I KHOáº¢N ÄÃƒ Bá»Š KHÃ“A DO QUÃ Háº N THANH TOÃN`,
                            message: `TÃ i khoáº£n Ä‘áº¡i lÃ½ ${item.agentCode} Ä‘Ã£ bá»‹ há»‡ thá»‘ng tá»± Ä‘á»™ng KHÃ“A do khÃ´ng hoÃ n táº¥t thanh toÃ¡n Ä‘Æ¡n hÃ ng tháº¯ng tháº§u ${item.wonId} (Chuyáº¿n bay ${item.flightNumber}) trÆ°á»›c háº¡n chÃ³t. Quyá»n tham gia Ä‘áº¥u giÃ¡ trÃªn sÃ n Ä‘Ã£ bá»‹ táº¡m ngÆ°ng. Vui lÃ²ng liÃªn há»‡ Ban Äiá»u hÃ nh Cargo Ä‘á»ƒ xá»­ lÃ½.`,
                            time: 'Vá»«a xong',
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
            connectionTimeout: 15000, // 15 giÃ¢y timeout káº¿t ná»‘i
            greetingTimeout: 10000,   // 10 giÃ¢y timeout greeting
            socketTimeout: 20000      // 20 giÃ¢y timeout socket
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
      <p style="margin:0 0 4px 0;font-weight:bold;color:#555555;">Ban Quáº£n lÃ½ HÃ ng hÃ³a Vietravel Airlines (VU Cargo)</p>
      <p style="margin:0 0 8px 0;">Hotline: <strong style="color:#1e3a5f;">1900 6699</strong> &middot; ops-cargo@vietravelairlines.vn</p>
      <p style="margin:0;font-size:11px;color:#aaaaaa;">${footerNote || 'Email thÃ´ng bÃ¡o tá»« Há»‡ thá»‘ng VU Cargo.'}</p>
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
        .replace(/&middot;/g, 'Â·')
        .replace(/&mdash;/g, 'â€”')
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

        // ðŸ”’ SEC-01: SEALED-BID PRIVACY GUARD (Strict Sealed-Bid Rule)
        // If requester is Agent or Guest (not Admin/Staff), mask individual bids for OPEN auctions
        if (!isPrivileged) {
            const openAuctionIds = new Set(
                (clientPayload.auctions || [])
                    .filter(a => a.status === 'OPEN')
                    .map(a => Number(a.id))
            );

            // While OPEN, anonymize competitor identities (agentCode & agentName) for competitors
            // so all agents see the realtime bid log with price & time, but competitors are shown as "Äáº¡i lÃ½ áº©n danh (AG-***)"
            clientPayload.bids = (clientPayload.bids || []).map(b => {
                const isAuctionOpen = openAuctionIds.has(Number(b.auctionId));
                if (!isAuctionOpen) return b;
                const isMine = agentCode && String(b.agentCode || '').trim().toUpperCase() === String(agentCode).trim().toUpperCase();
                if (isMine) return b;
                return {
                    ...b,
                    agentCode: 'AG-***',
                    agentName: 'Äáº¡i lÃ½ áº©n danh (AG-***)',
                    isAnonymous: true
                };
            });

            // Mask leading agent name in OPEN auction summaries for competitors
            (clientPayload.auctions || []).forEach(a => {
                if (a.status === 'OPEN' && a.isAnonymous !== false) {
                    if (!agentCode || String(a.leadingAgentCode || '').toUpperCase() !== String(agentCode).toUpperCase()) {
                        a.leadingAgentCode = 'AG-***';
                        a.leadingAgentName = 'Äáº¡i lÃ½ áº©n danh (AG-***)';
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
        const _role = parsedUrl.searchParams.get('role');
        const _category = parsedUrl.searchParams.get('category');
        const _search = parsedUrl.searchParams.get('q');
        ;(async () => {
            let logs;
            try {
                const sqliteLogs = await db.all('SELECT * FROM activity_logs ORDER BY rawTime DESC LIMIT 1000');
                const logMap = new Map();
                (sqliteLogs || []).forEach(l => { if (l && l.id) logMap.set(String(l.id), l); });
                (serverData.activityLogs || []).forEach(l => { if (l && l.id) logMap.set(String(l.id), l); });
                logs = Array.from(logMap.values()).sort((a, b) => (b.rawTime || 0) - (a.rawTime || 0));
                serverData.activityLogs = logs.slice(0, 1000);
            } catch(e) {
                logs = serverData.activityLogs || [];
            }
            if (_role && _role !== 'ALL') logs = logs.filter(l => (l.role || '').toUpperCase() === _role.toUpperCase());
            if (_category && _category !== 'ALL') logs = logs.filter(l => (l.actionCategory || '') === _category);
            if (_search) {
                const q = _search.toLowerCase().trim();
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
            res.end(JSON.stringify({ success: true, logs }), 'utf-8');
        })().catch(err => {
            if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' }); res.end(JSON.stringify({ success: false, error: err.message }), 'utf-8'); }
        });
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
                    id: logData.id || (Date.now() + Math.floor(Math.random() * 1000)),
                    timestamp: timestampStr,
                    rawTime: now.getTime(),
                    actor: logData.actor || 'Quáº£n trá»‹ viÃªn',
                    username: logData.username || 'admin',
                    role: logData.role || 'ADMIN',
                    actionCategory: logData.actionCategory || 'KhÃ¡c',
                    actionTitle: logData.actionTitle || 'Thao tÃ¡c há»‡ thá»‘ng',
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
        res.end(JSON.stringify({ success: true, message: 'ÄÃ£ xÃ³a toÃ n bá»™ nháº­t kÃ½ hoáº¡t Ä‘á»™ng há»‡ thá»‘ng.' }), 'utf-8');
        return;
    }

    // --- REST API: POST /api/bids/place (Atomic Sealed-Bid Placement) ---
    if (pathname === '/api/bids/place' && req.method === 'POST') {
        readBody(req).then(async (body) => {
            try {
                const { auctionId, agentCode, agentName, priceKg, isAnonymous, weightKg } = JSON.parse(body || '{}');
                if (!auctionId || !agentCode || !priceKg) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
                    res.end(JSON.stringify({ success: false, error: 'Thiáº¿u auctionId, agentCode hoáº·c priceKg' }));
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
                    const detailsStr = `Äáº¡i lÃ½ ${(agentObj ? agentObj.companyName : agentCode)} Ä‘áº·t tháº§u thÃ nh cÃ´ng má»©c giÃ¡ ${priceFormatted}Ä‘/Kg cho chuyáº¿n bay ${flightStr} (${aucObj ? aucObj.route : ''}).`;

                    await db.run(
                        `INSERT INTO activity_logs (timestamp, rawTime, actor, username, role, actionCategory, actionTitle, target, details, ip, device)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [timestampStr, now.getTime(), actorName, agentCode, 'AGENT', 'Äáº¥u giÃ¡', 'Äáº·t giÃ¡ tháº§u', flightStr, detailsStr, '113.161.42.12', 'Web Client']
                    ).catch(e => console.error('Failed to log bid activity to db:', e));

                    if (!serverData.activityLogs) serverData.activityLogs = [];
                    serverData.activityLogs.unshift({
                        id: Date.now() + Math.floor(Math.random() * 1000),
                        timestamp: timestampStr,
                        rawTime: now.getTime(),
                        actor: actorName,
                        username: agentCode,
                        role: 'AGENT',
                        actionCategory: 'Äáº¥u giÃ¡',
                        actionTitle: 'Äáº·t giÃ¡ tháº§u',
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
                    message: `Äáº·t tháº§u thÃ nh cÃ´ng má»©c giÃ¡ ${new Intl.NumberFormat('vi-VN').format(priceKg)}Ä‘ / Kg!`
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
                    res.end(JSON.stringify({ success: false, error: 'Há»“ sÆ¡ Ä‘Äƒng kÃ½ khÃ´ng tá»“n táº¡i' }));
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
                        status: 'Hoáº¡t Ä‘á»™ng',
                        isLocked: false
                    };
                    serverData.agentsList.push(agent);
                } else {
                    agent.status = 'Hoáº¡t Ä‘á»™ng';
                    agent.isLocked = false;
                    agent.code = randomCode;
                }

                // Write audit log to serverData.activityLogs so AuditLogs page can show it
                const _now = new Date();
                const _pad = n => String(n).padStart(2, '0');
                const _tsStr = `${_pad(_now.getDate())}/${_pad(_now.getMonth()+1)}/${_now.getFullYear()} ${_pad(_now.getHours())}:${_pad(_now.getMinutes())}:${_pad(_now.getSeconds())}`;
                if (!serverData.activityLogs) serverData.activityLogs = [];
                serverData.activityLogs.unshift({
                    id: _now.getTime() + Math.floor(Math.random() * 1000),
                    timestamp: _tsStr,
                    rawTime: _now.getTime(),
                    actor: approvedBy || 'Quáº£n trá»‹ viÃªn',
                    username: approvedBy || 'admin',
                    role: 'ADMIN',
                    actionCategory: 'Quáº£n lÃ½ Äáº¡i lÃ½',
                    actionTitle: 'Táº¡o tÃ i khoáº£n Äáº¡i lÃ½ má»›i',
                    target: randomCode,
                    details: `Duyá»‡t há»“ sÆ¡ Ä‘Äƒng kÃ½ ${regId} vÃ  cáº¥p mÃ£ Ä‘áº¡i lÃ½ ${randomCode} cho cÃ´ng ty ${reg.companyName} (MST: ${reg.taxCode || 'N/A'}).`,
                    ip: req.socket.remoteAddress || '127.0.0.1',
                    device: 'Admin Portal'
                });
                if (serverData.activityLogs.length > 1000) serverData.activityLogs = serverData.activityLogs.slice(0, 1000);

                saveServerData();
                await db.createAuditLog('ADMIN', approvedBy || 'admin', 'APPROVE_REGISTRATION', regId, `Cáº¥p mÃ£ Ä‘áº¡i lÃ½ ${randomCode} cho ${reg.companyName}`);

                res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({
                    success: true,
                    agentCode: randomCode,
                    message: `Há»“ sÆ¡ ${regId} Ä‘Ã£ Ä‘Æ°á»£c duyá»‡t thÃ nh cÃ´ng! MÃ£ Ä‘áº¡i lÃ½ cáº¥p: ${randomCode}`
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
                if (incoming.notifications && Array.isArray(incoming.notifications)) {
                    const notifMap = new Map();
                    (serverData.notifications || []).forEach(n => { if (n && n.id) notifMap.set(String(n.id), n); });
                    incoming.notifications.forEach(n => { if (n && n.id) notifMap.set(String(n.id), n); });
                    serverData.notifications = Array.from(notifMap.values())
                        .sort((a, b) => (Number(b.timestamp || b.createdAt || b.id) || 0) - (Number(a.timestamp || a.createdAt || a.id) || 0));
                }
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

    // GET /api/chat  â€” Láº¥y danh sÃ¡ch chat (agent xem cá»§a mÃ¬nh, admin/staff xem táº¥t cáº£)
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

    // POST /api/chat/create  â€” Äáº¡i lÃ½ táº¡o phiÃªn chat má»›i
    if (pathname === '/api/chat/create' && req.method === 'POST') {
        readBody(req).then(body => {
            try {
                const { agentCode, agentName, text } = JSON.parse(body);
                if (!agentCode || !text) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Thiáº¿u agentCode hoáº·c text' }));
                    return;
                }
                if (!Array.isArray(serverData.chats)) serverData.chats = [];
                // Kiá»ƒm tra Ä‘Ã£ cÃ³ phiÃªn OPEN/WAITING/ACTIVE chÆ°a
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
                            senderName: 'Há»‡ thá»‘ng',
                            text: 'YÃªu cáº§u há»— trá»£ Ä‘Ã£ Ä‘Æ°á»£c gá»­i. NhÃ¢n viÃªn sáº½ pháº£n há»“i sá»›m nháº¥t cÃ³ thá»ƒ. Vui lÃ²ng chá» trong giÃ¢y lÃ¡t...',
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

    // POST /api/chat/send  â€” Gá»­i tin nháº¯n (text hoáº·c file)
    if (pathname === '/api/chat/send' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('error', err => { console.error('[chat/send] Stream error:', err.message); if (!res.headersSent) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({success:false,error:'Stream error'})); } });
        req.on('end', () => {
            try {
                const { chatId, sender, senderName, text, fileUrl, fileName, fileType } = JSON.parse(body);
                if (!chatId || !sender || (!text && !fileUrl)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Thiáº¿u chatId, sender hoáº·c ná»™i dung tin nháº¯n' }));
                    return;
                }
                if (!Array.isArray(serverData.chats)) serverData.chats = [];
                const chat = serverData.chats.find(c => c.id === chatId);
                if (!chat) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'KhÃ´ng tÃ¬m tháº¥y phiÃªn chat' }));
                    return;
                }
                if (chat.status === 'CLOSED') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'PhiÃªn chat Ä‘Ã£ Ä‘Ã³ng' }));
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

    // POST /api/chat/assign  â€” Admin/Staff nháº­n phiÃªn Ä‘á»ƒ há»— trá»£
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
                    res.end(JSON.stringify({ success: false, error: 'Thiáº¿u chatId hoáº·c staffId' }));
                    return;
                }
                if (!Array.isArray(serverData.chats)) serverData.chats = [];
                const chat = serverData.chats.find(c => c.id === chatId);
                if (!chat) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'KhÃ´ng tÃ¬m tháº¥y phiÃªn chat' }));
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
                    senderName: 'Há»‡ thá»‘ng',
                    text: `${staffName || staffId} Ä‘Ã£ tham gia cuá»™c trÃ² chuyá»‡n vÃ  sáºµn sÃ ng há»— trá»£ báº¡n.`,
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

    // POST /api/chat/request-close â€” Admin/Staff gá»­i yÃªu cáº§u Ä‘Ã³ng phiÃªn chat Ä‘áº¿n Äáº¡i lÃ½
    if (pathname === '/api/chat/request-close' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('error', err => { console.error('[request-close] Stream error:', err.message); if (!res.headersSent) { res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({success:false,error:'Stream error'})); } });
        req.on('end', () => {
            try {
                const { chatId, closedByName } = JSON.parse(body);
                if (!chatId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Thiáº¿u chatId' }));
                    return;
                }
                if (!Array.isArray(serverData.chats)) serverData.chats = [];
                const chat = serverData.chats.find(c => c.id === chatId);
                if (!chat) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'KhÃ´ng tÃ¬m tháº¥y phiÃªn chat' }));
                    return;
                }
                const now = Date.now();
                chat.status = 'CLOSING_REQUEST';
                if (!Array.isArray(chat.messages)) chat.messages = [];
                chat.messages.push({
                    id: 'MSG-' + now + '-reqclose',
                    sender: 'system',
                    senderName: 'Há»‡ thá»‘ng',
                    text: `ðŸ”” ${closedByName || 'NhÃ¢n viÃªn há»— trá»£'} Ä‘Ã£ gá»­i yÃªu cáº§u káº¿t thÃºc cuá»™c trÃ² chuyá»‡n. Äang chá» Ä‘áº¡i lÃ½ pháº£n há»“i xÃ¡c nháº­n...`,
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

    // POST /api/chat/respond-close â€” Äáº¡i lÃ½ pháº£n há»“i tiáº¿p tá»¥c hay káº¿t thÃºc chat
    if (pathname === '/api/chat/respond-close' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('error', err => { console.error('[respond-close] Stream error:', err.message); if (!res.headersSent) { res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({success:false,error:'Stream error'})); } });
        req.on('end', () => {
            try {
                const { chatId, action, agentName } = JSON.parse(body);
                if (!chatId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Thiáº¿u chatId' }));
                    return;
                }
                if (!Array.isArray(serverData.chats)) serverData.chats = [];
                const chat = serverData.chats.find(c => c.id === chatId);
                if (!chat) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'KhÃ´ng tÃ¬m tháº¥y phiÃªn chat' }));
                    return;
                }
                const now = Date.now();
                if (!Array.isArray(chat.messages)) chat.messages = [];

                if (action === 'keep') {
                    chat.status = 'ACTIVE';
                    chat.messages.push({
                        id: 'MSG-' + now + '-keep',
                        sender: 'system',
                        senderName: 'Há»‡ thá»‘ng',
                        text: `ðŸ’¬ Äáº¡i lÃ½ (${agentName || chat.agentName || 'Äáº¡i lÃ½'}) muá»‘n tiáº¿p tá»¥c trao Ä‘á»•i thÃªm thÃ´ng tin.`,
                        fileUrl: null, fileName: null, fileType: null,
                        timestamp: now, read: false
                    });
                } else {
                    chat.status = 'CLOSED';
                    chat.closedAt = new Date(now).toISOString();
                    chat.messages.push({
                        id: 'MSG-' + now + '-close',
                        sender: 'system',
                        senderName: 'Há»‡ thá»‘ng',
                        text: `âœ… Cuá»™c trÃ² chuyá»‡n Ä‘Ã£ káº¿t thÃºc theo xÃ¡c nháº­n tá»« Äáº¡i lÃ½ (${agentName || chat.agentName || 'Äáº¡i lÃ½'}). Cáº£m Æ¡n báº¡n!`,
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

    // POST /api/chat/close  â€” Admin/Staff Ä‘Ã³ng phiÃªn chat
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
                    res.end(JSON.stringify({ success: false, error: 'Thiáº¿u chatId' }));
                    return;
                }
                if (!Array.isArray(serverData.chats)) serverData.chats = [];
                const chat = serverData.chats.find(c => c.id === chatId);
                if (!chat) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'KhÃ´ng tÃ¬m tháº¥y phiÃªn chat' }));
                    return;
                }
                const now = Date.now();
                chat.status = 'CLOSED';
                chat.closedAt = new Date(now).toISOString();
                if (!Array.isArray(chat.messages)) chat.messages = [];
                chat.messages.push({
                    id: 'MSG-' + now + '-close',
                    sender: 'system',
                    senderName: 'Há»‡ thá»‘ng',
                    text: `Cuá»™c trÃ² chuyá»‡n Ä‘Ã£ Ä‘Æ°á»£c ${closedByName || 'nhÃ¢n viÃªn há»— trá»£'} káº¿t thÃºc. Cáº£m Æ¡n báº¡n Ä‘Ã£ liÃªn há»‡!`,
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

    // POST /api/chat/read  â€” ÄÃ¡nh dáº¥u tin nháº¯n Ä‘Ã£ Ä‘á»c
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
                    res.end(JSON.stringify({ success: false, error: 'Thiáº¿u chatId' }));
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
                message: 'ÄÃ£ khÃ´i phá»¥c toÃ n bá»™ dá»¯ liá»‡u mÃ¡y chá»§ vá» tráº¡ng thÃ¡i máº·c Ä‘á»‹nh ban Ä‘áº§u thÃ nh cÃ´ng!',
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
                    res.end(JSON.stringify({ success: false, error: 'Thiáº¿u Ä‘á»‹a chá»‰ email ngÆ°á»i nháº­n (to / regData.email)' }));
                    return;
                }

                let subject = customSubject || '[Vietravel Airlines Cargo] ThÃ´ng bÃ¡o há»‡ thá»‘ng';
                let html = customHtml || '';
                const companyName = (regData && regData.companyName) || 'QuÃ½ doanh nghiá»‡p';
                const repName = (regData && regData.repName) || 'QuÃ½ Ä‘áº¡i lÃ½';
                const regId = (regData && regData.regId) || 'REG-PENDING';

                if (type === 'TEST_EMAIL') {
                    subject = `[Vietravel Airlines Cargo] KIá»‚M TRA Káº¾T Ná»I EMAIL THÃ€NH CÃ”NG (${new Date().toLocaleTimeString('vi-VN')})`;
                    html = buildEmailHtml({
                        title: 'Kiá»ƒm tra Cáº¥u hÃ¬nh Email ThÃ nh cÃ´ng',
                        subtitle: 'Há»‡ thá»‘ng Äáº¥u giÃ¡ HÃ ng hÃ³a Vietravel Airlines Cargo',
                        contentHtml: `
                            <p>Xin chÃ o <strong>${recipient}</strong>,</p>
                            <p style="color:#2e7d32;font-weight:bold;">Cáº¥u hÃ¬nh gá»­i thÆ° SMTP cá»§a báº¡n Ä‘Ã£ hoáº¡t Ä‘á»™ng chÃ­nh xÃ¡c.</p>
                            
                            <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#f0f7f0;border:1px solid #c8e6c9;border-radius:6px;margin:16px 0;">
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Há»™p thÆ° nháº­n:</td><td style="font-weight:bold;color:#1565c0;">${recipient}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Thá»i gian gá»­i:</td><td>${new Date().toLocaleString('vi-VN')}</td></tr>
                                <tr><td style="color:#555;">Tráº¡ng thÃ¡i:</td><td style="font-weight:bold;color:#2e7d32;">HOáº T Äá»˜NG (REAL SMTP)</td></tr>
                            </table>

                            <p style="margin-top:16px;">Tá»« bÃ¢y giá», cÃ¡c thÃ´ng bÃ¡o sáº½ Ä‘Æ°á»£c gá»­i trá»±c tiáº¿p Ä‘áº¿n hÃ²m thÆ° nÃ y:</p>
                            <ul style="padding-left:20px;line-height:1.7;">
                                <li>XÃ¡c nháº­n tiáº¿p nháº­n há»“ sÆ¡ Ä‘áº¡i lÃ½.</li>
                                <li>ThÃ´ng bÃ¡o káº¿t quáº£ phÃª duyá»‡t vÃ  cáº¥p MÃ£ Äáº¡i lÃ½.</li>
                                <li>Phiáº¿u xÃ¡c nháº­n tháº¯ng tháº§u.</li>
                            </ul>
                        `
                    });
                } else if (type === 'REGISTRATION_SUBMITTED') {
                    subject = `[Vietravel Airlines Cargo] Tiáº¿p nháº­n há»“ sÆ¡ Ä‘Äƒng kÃ½ Ä‘áº¡i lÃ½ - ${regId}`;
                    html = buildEmailHtml({
                        title: 'XÃ¡c nháº­n Tiáº¿p nháº­n Há»“ sÆ¡ ÄÄƒng kÃ½ Äáº¡i lÃ½',
                        subtitle: `MÃ£ há»“ sÆ¡: ${regId}`,
                        contentHtml: `
                            <p>KÃ­nh gá»­i <strong>${repName}</strong> (Äáº¡i diá»‡n <strong>${companyName}</strong>),</p>
                            <p>Há»‡ thá»‘ng Vietravel Airlines trÃ¢n trá»ng thÃ´ng bÃ¡o Ä‘Ã£ tiáº¿p nháº­n thÃ nh cÃ´ng há»“ sÆ¡ Ä‘Äƒng kÃ½ Ä‘áº¡i lÃ½ cá»§a QuÃ½ cÃ´ng ty.</p>
                            
                            <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#f5f5f5;border:1px solid #e0e0e0;border-radius:6px;margin:16px 0;">
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">MÃ£ tiáº¿p nháº­n:</td><td style="font-weight:bold;color:#1565c0;font-family:monospace;">${regId}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">TÃªn doanh nghiá»‡p:</td><td>${companyName}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">MÃ£ sá»‘ thuáº¿:</td><td>${(regData && regData.taxCode) || '-'}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">NgÆ°á»i Ä‘áº¡i diá»‡n:</td><td>${repName} (${(regData && regData.repPosition) || 'Äáº¡i diá»‡n'})</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Sá»‘ Ä‘iá»‡n thoáº¡i:</td><td>${(regData && regData.phone) || '-'}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Thá»i gian tiáº¿p nháº­n:</td><td>${(regData && regData.submittedAt) || new Date().toLocaleString('vi-VN')}</td></tr>
                                <tr><td style="color:#555;">Tráº¡ng thÃ¡i:</td><td style="font-weight:bold;color:#e65100;">CHá»œ XÃ‰T DUYá»†T</td></tr>
                            </table>

                            <p style="margin-top:16px;"><strong>Quy trÃ¬nh tiáº¿p theo:</strong></p>
                            <ol style="padding-left:20px;line-height:1.7;">
                                <li>Ban Äiá»u hÃ nh sáº½ tháº©m Ä‘á»‹nh há»“ sÆ¡ trong vÃ²ng <strong>24 giá» lÃ m viá»‡c</strong>.</li>
                                <li>Khi há»“ sÆ¡ Ä‘Æ°á»£c duyá»‡t, há»‡ thá»‘ng sáº½ gá»­i email kÃ¨m <strong>MÃ£ Äáº¡i lÃ½ (AG-xxxx)</strong>.</li>
                                <li>QuÃ½ cÃ´ng ty dÃ¹ng MÃ£ Ä‘áº¡i lÃ½, Máº­t kháº©u vÃ  MÃ£ PIN Ä‘á»ƒ Ä‘Äƒng nháº­p tham gia Ä‘áº¥u giÃ¡.</li>
                            </ol>
                        `
                    });
                } else if (type === 'REGISTRATION_APPROVED') {
                    const finalCode = agentCode || (regData && regData.code) || 'AG-0001';
                    subject = `[Vietravel Airlines Cargo] CHÃšC Má»ªNG! Há»“ sÆ¡ Äáº¡i lÃ½ Ä‘Ã£ Ä‘Æ°á»£c PHÃŠ DUYá»†T - MÃ£: ${finalCode}`;
                    html = buildEmailHtml({
                        title: 'ChÃºc má»«ng! Há»“ sÆ¡ Äáº¡i lÃ½ Ä‘Ã£ Ä‘Æ°á»£c PHÃŠ DUYá»†T',
                        subtitle: `MÃ£ Ä‘áº¡i lÃ½ chÃ­nh thá»©c: ${finalCode}`,
                        contentHtml: `
                            <p>KÃ­nh gá»­i <strong>${repName}</strong> (Äáº¡i diá»‡n <strong>${companyName}</strong>),</p>
                            <p style="color:#2e7d32;font-weight:bold;">Há»“ sÆ¡ Ä‘Äƒng kÃ½ Ä‘áº¡i lÃ½ cá»§a QuÃ½ cÃ´ng ty Ä‘Ã£ Ä‘Æ°á»£c tháº©m Ä‘á»‹nh vÃ  phÃª duyá»‡t thÃ nh cÃ´ng.</p>
                            
                            <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#f0f7f0;border:1px solid #c8e6c9;border-radius:6px;margin:16px 0;">
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">MÃ£ Äáº¡i lÃ½:</td><td style="font-weight:bold;color:#2e7d32;font-family:monospace;font-size:16px;">${finalCode}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">TÃªn doanh nghiá»‡p:</td><td>${companyName}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">TÃªn Ä‘Äƒng nháº­p:</td><td style="font-family:monospace;font-weight:bold;">${finalCode} hoáº·c MST (${(regData && regData.taxCode) || ''})</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Máº­t kháº©u:</td><td style="font-family:monospace;">Máº­t kháº©u QuÃ½ vá»‹ Ä‘Ã£ Ä‘Äƒng kÃ½</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">MÃ£ PIN:</td><td style="font-family:monospace;">MÃ£ PIN QuÃ½ vá»‹ Ä‘Ã£ Ä‘Äƒng kÃ½</td></tr>
                                <tr><td style="color:#555;">Tráº¡ng thÃ¡i:</td><td style="font-weight:bold;color:#2e7d32;">ÄÃƒ HOáº T Äá»˜NG</td></tr>
                            </table>

                            <p style="text-align:center;margin:24px 0;">
                                <a href="http://localhost:8085/01-Login.html" style="display:inline-block;background-color:#1565c0;color:#ffffff;font-weight:bold;padding:12px 28px;border-radius:6px;text-decoration:none;">ÄÄ‚NG NHáº¬P THAM GIA Äáº¤U GIÃ</a>
                            </p>

                            <p><strong>HÆ°á»›ng dáº«n tham gia Ä‘áº¥u giÃ¡:</strong></p>
                                <li>Theo dÃµi káº¿t quáº£ trÃºng tháº§u vÃ  xÃ¡c nháº­n há»£p Ä‘á»“ng váº­n chuyá»ƒn Ä‘iá»‡n tá»­ ngay trÃªn á»©ng dá»¥ng.</li>
                            </ul>
                        `
                    });
                } else if (type === 'REGISTRATION_REJECTED') {
                    const finalReason = reason || (regData && (regData.rejectionReason || regData.rejectReason)) || 'Há»“ sÆ¡ chÆ°a Ä‘áº¡t tiÃªu chuáº©n theo quy cháº¿ xÃ©t duyá»‡t Ä‘áº¡i lÃ½';
                    subject = `[Vietravel Airlines Cargo] YÃªu cáº§u bá»• sung / Káº¿t quáº£ xÃ©t duyá»‡t há»“ sÆ¡ Ä‘áº¡i lÃ½ - ${regId}`;
                    html = buildEmailHtml({
                        title: 'ThÃ´ng bÃ¡o Káº¿t quáº£ XÃ©t duyá»‡t Há»“ sÆ¡ Äáº¡i lÃ½',
                        subtitle: `MÃ£ há»“ sÆ¡: ${regId}`,
                        contentHtml: `
                            <p>KÃ­nh gá»­i <strong>${repName}</strong> (Äáº¡i diá»‡n <strong>${companyName}</strong>),</p>
                            <p>Ban Äiá»u hÃ nh Äáº¥u giÃ¡ Vietravel Airlines Cargo trÃ¢n trá»ng cáº£m Æ¡n QuÃ½ doanh nghiá»‡p Ä‘Ã£ ná»™p há»“ sÆ¡ Ä‘Äƒng kÃ½ tham gia sÃ n Ä‘áº¥u giÃ¡.</p>
                            
                            <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:6px;margin:16px 0;">
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;width:35%;">MÃ£ há»“ sÆ¡:</td><td style="font-weight:bold;color:#e65100;">${regId}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Doanh nghiá»‡p:</td><td>${companyName}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Káº¿t quáº£ xÃ©t duyá»‡t:</td><td style="font-weight:bold;color:#d32f2f;">Tá»ª CHá»I / YÃŠU Cáº¦U Bá»” SUNG</td></tr>
                                <tr><td style="color:#555;vertical-align:top;">LÃ½ do & HÆ°á»›ng dáº«n:</td><td style="color:#d32f2f;font-weight:bold;line-height:1.5;">${finalReason}</td></tr>
                            </table>

                            <p style="margin-top:16px;">Äá»ƒ khÃ´ng lÃ m giÃ¡n Ä‘oáº¡n káº¿ hoáº¡ch tham gia Ä‘áº¥u giÃ¡ táº£i trá»ng, QuÃ½ cÃ´ng ty vui lÃ²ng báº¥m vÃ o nÃºt bÃªn dÆ°á»›i Ä‘á»ƒ chá»‰nh sá»­a vÃ  bá»• sung thÃ´ng tin cáº§n thiáº¿t:</p>

                            <p style="text-align:center;margin:24px 0;">
                                <a href="http://localhost:8085/Register.html?resubmit=${regId}" style="display:inline-block;background-color:#d32f2f;color:#ffffff;font-weight:bold;padding:12px 28px;border-radius:6px;text-decoration:none;box-shadow:0 2px 4px rgba(0,0,0,0.15);">CHá»ˆNH Sá»¬A & Bá»” SUNG Há»’ SÆ </a>
                            </p>

                            <p style="font-size:12px;color:#666;">Náº¿u cáº§n há»— trá»£ thÃªm, QuÃ½ doanh nghiá»‡p vui lÃ²ng liÃªn há»‡ Ban Quáº£n trá»‹ qua Hotline <strong>1900 1337</strong> hoáº·c email <strong>cargo@vietravelairlines.vn</strong>.</p>
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

                    subject = `[Vietravel Airlines Cargo] CHÃšC Má»ªNG TRÃšNG THáº¦U! ÄÆ¡n hÃ ng ${wonId} - Chuyáº¿n ${flightNum} (${route})`;
                    html = buildEmailHtml({
                        title: 'ChÃºc má»«ng QuÃ½ Ä‘áº¡i lÃ½ Ä‘Ã£ TRÃšNG THáº¦U!',
                        subtitle: `MÃ£ Ä‘Æ¡n trÃºng tháº§u: ${wonId} &middot; Chuyáº¿n bay ${flightNum}`,
                        contentHtml: `
                            <p>KÃ­nh gá»­i QuÃ½ Ä‘áº¡i lÃ½ <strong>${reqData.agentName || 'á»¦y quyá»n'}</strong> (${reqData.agentCode || 'AG'}),</p>
                            <p style="color:#2e7d32;font-weight:bold;">Vietravel Airlines Cargo trÃ¢n trá»ng thÃ´ng bÃ¡o QuÃ½ cÃ´ng ty Ä‘Ã£ chÃ­nh thá»©c THáº®NG THáº¦U lÃ´ hÃ ng táº£i trá»ng Ä‘Æ°á»ng hÃ ng khÃ´ng.</p>

                            <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#f0f7f0;border:1px solid #c8e6c9;border-radius:6px;margin:16px 0;">
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">MÃ£ Ä‘Æ¡n tháº¯ng tháº§u:</td><td style="font-weight:bold;color:#1565c0;font-family:monospace;">${wonId}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Chuyáº¿n bay / Tuyáº¿n:</td><td style="font-weight:bold;color:#333;">${flightNum} (${route})</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Táº£i trá»ng chá»‘t tháº¯ng:</td><td style="font-weight:bold;color:#1565c0;">${fmtNum(capacityKg)} Kg</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Má»©c giÃ¡ chá»‘t:</td><td style="font-weight:bold;color:#2e7d32;">${fmtNum(priceKg)} Ä‘ / Kg</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Tá»•ng tiá»n thanh toÃ¡n:</td><td style="font-weight:bold;color:#d32f2f;font-size:16px;">${fmtNum(totalVnd)} Ä‘</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">MÃ£ váº­n Ä‘Æ¡n (AWB):</td><td style="font-family:monospace;font-weight:bold;color:#1565c0;">${awb}</td></tr>
                                <tr><td style="color:#555;">Háº¡n chÃ³t thanh toÃ¡n:</td><td style="color:#d32f2f;font-weight:bold;">Trong vÃ²ng 24 giá» ká»ƒ tá»« thá»i Ä‘iá»ƒm chá»‘t tháº§u</td></tr>
                            </table>

                            <p style="margin-top:16px;"><strong>HÆ°á»›ng dáº«n tiáº¿p theo:</strong></p>
                            <ol style="padding-left:20px;line-height:1.7;">
                                <li>ÄÄƒng nháº­p há»‡ thá»‘ng SÃ n Äáº¥u giÃ¡ Cargo vÃ  truy cáº­p má»¥c <strong>Tháº¯ng tháº§u (Won Auctions)</strong>.</li>
                                <li>HoÃ n táº¥t chuyá»ƒn khoáº£n thanh toÃ¡n vÃ  báº¥m <em>BÃ¡o Ä‘Ã£ chuyá»ƒn khoáº£n</em> Ä‘á»ƒ Ban Äiá»u hÃ nh xÃ¡c nháº­n.</li>
                                <li>Táº£i Phiáº¿u XÃ¡c Nháº­n TrÃºng Tháº§u (PDF) vÃ  bÃ n giao hÃ ng hÃ³a táº¡i kho theo Ä‘Ãºng giá» Cut-off.</li>
                            </ol>

                            <p style="text-align:center;margin:24px 0;">
                                <a href="http://localhost:8085/07-WonAuction.html" style="display:inline-block;background-color:#2e7d32;color:#ffffff;font-weight:bold;padding:12px 28px;border-radius:6px;text-decoration:none;">XEM ÄÆ N TRÃšNG THáº¦U & Váº¬N ÄÆ N</a>
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

                    subject = `[Vietravel Airlines Cargo] XÃC NHáº¬N ÄÃƒ NHáº¬N THANH TOÃN - ÄÆ¡n hÃ ng ${wonId}`;
                    html = buildEmailHtml({
                        title: 'XÃ¡c nháº­n ÄÃ£ Nháº­n Thanh ToÃ¡n ThÃ nh CÃ´ng',
                        subtitle: `MÃ£ Ä‘Æ¡n: ${wonId} &middot; Chuyáº¿n bay ${flightNum}`,
                        contentHtml: `
                            <p>KÃ­nh gá»­i QuÃ½ Ä‘áº¡i lÃ½,</p>
                            <p style="color:#2e7d32;font-weight:bold;">Ban TÃ i chÃ­nh & Äiá»u hÃ nh Vietravel Airlines Cargo xÃ¡c nháº­n Ä‘Ã£ nháº­n Ä‘á»§ sá»‘ tiá»n thanh toÃ¡n cho Ä‘Æ¡n hÃ ng tháº¯ng tháº§u cá»§a QuÃ½ cÃ´ng ty.</p>

                            <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#f0f7f0;border:1px solid #c8e6c9;border-radius:6px;margin:16px 0;">
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">MÃ£ Ä‘Æ¡n tháº¯ng tháº§u:</td><td style="font-weight:bold;color:#1565c0;font-family:monospace;">${wonId}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Chuyáº¿n bay / Tuyáº¿n:</td><td>${flightNum} (${route})</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Sá»‘ tiá»n Ä‘Ã£ nháº­n:</td><td style="font-weight:bold;color:#2e7d32;font-size:16px;">${fmtNum(totalVnd)} Ä‘</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">MÃ£ AWB Ä‘iá»‡n tá»­:</td><td style="font-family:monospace;font-weight:bold;color:#1565c0;">${awb}</td></tr>
                                <tr><td style="color:#555;">Tráº¡ng thÃ¡i thanh toÃ¡n:</td><td style="font-weight:bold;color:#2e7d32;">ÄÃƒ THANH TOÃN (PAID)</td></tr>
                            </table>

                            <p style="margin-top:16px;">Slot váº­n chuyá»ƒn cá»§a QuÃ½ Ä‘áº¡i lÃ½ Ä‘Ã£ Ä‘Æ°á»£c giá»¯ chÃ­nh thá»©c. Vui lÃ²ng in/xuáº¥t trÃ¬nh Phiáº¿u xÃ¡c nháº­n khi bÃ n giao hÃ ng táº¡i kho.</p>

                            <p style="text-align:center;margin:24px 0;">
                                <a href="http://localhost:8085/07-WonAuction.html" style="display:inline-block;background-color:#1565c0;color:#ffffff;font-weight:bold;padding:12px 28px;border-radius:6px;text-decoration:none;">XEM Táº¢I PHIáº¾U BÃ€N GIAO KHO</a>
                            </p>
                        `
                    });
                } else if (type === 'PAYMENT_REJECTED') {
                    const wonData = reqData.wonData || {};
                    const wonId = wonData.wonId || reqData.wonId || 'WON-ORDER';
                    const flightNum = wonData.flightNumber || reqData.flightNumber || '';
                    const route = wonData.route || reqData.route || '';
                    const rejReason = reqData.reason || wonData.rejectionReason || 'BiÃªn lai hoáº·c mÃ£ giao dá»‹ch khÃ´ng há»£p lá»‡';
                    const fmtNum = (n) => new Intl.NumberFormat('vi-VN').format(n);

                    subject = `[Vietravel Airlines Cargo] âŒ YÃŠU Cáº¦U Ná»˜P Láº I BIÃŠN LAI THANH TOÃN - ÄÆ¡n hÃ ng ${wonId}`;
                    html = buildEmailHtml({
                        title: 'YÃªu Cáº§u Ná»™p Láº¡i BiÃªn Lai Thanh ToÃ¡n',
                        subtitle: `MÃ£ Ä‘Æ¡n: ${wonId} &middot; Chuyáº¿n bay ${flightNum}`,
                        contentHtml: `
                            <p>KÃ­nh gá»­i QuÃ½ Ä‘áº¡i lÃ½,</p>
                            <p style="color:#d32f2f;font-weight:bold;">Ban TÃ i chÃ­nh & Tra soÃ¡t Vietravel Airlines Cargo Ä‘Ã£ kiá»ƒm tra thÃ´ng tin chuyá»ƒn khoáº£n cho Ä‘Æ¡n hÃ ng ${wonId} vÃ  yÃªu cáº§u QuÃ½ Ä‘áº¡i lÃ½ Ná»˜P Láº I BIÃŠN LAI THANH TOÃN.</p>

                            <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#ffebee;border:1px solid #ffcdd2;border-radius:6px;margin:16px 0;">
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;width:35%;">MÃ£ Ä‘Æ¡n tháº¯ng tháº§u:</td><td style="font-weight:bold;color:#1565c0;font-family:monospace;">${wonId}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Chuyáº¿n bay / Tuyáº¿n:</td><td>${flightNum} (${route})</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">LÃ½ do tá»« chá»‘i biÃªn lai:</td><td style="font-weight:bold;color:#d32f2f;font-size:14px;">${rejReason}</td></tr>
                                <tr><td style="color:#555;">Thá»i gian tra soÃ¡t:</td><td style="font-weight:bold;color:#333;">${new Date().toLocaleString('vi-VN')}</td></tr>
                            </table>

                            <p style="margin-top:16px;">Vui lÃ²ng kiá»ƒm tra láº¡i sao kÃª chuyá»ƒn khoáº£n ngÃ¢n hÃ ng, chá»¥p rÃµ áº£nh biÃªn lai/mÃ£ FT vÃ  truy cáº­p sÃ n Ä‘áº¥u giÃ¡ Ä‘á»ƒ <strong>Ná»˜P Láº I BIÃŠN LAI Má»šI</strong> trÆ°á»›c thá»i háº¡n Cut-off.</p>

                            <p style="text-align:center;margin:24px 0;">
                                <a href="http://localhost:8085/07-WonAuction.html" style="display:inline-block;background-color:#d32f2f;color:#ffffff;font-weight:bold;padding:12px 28px;border-radius:6px;text-decoration:none;">Ná»˜P Láº I BIÃŠN LAI THANH TOÃN</a>
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

                    subject = `[Vietravel Airlines Cargo] ðŸ”” Má»ž Äáº¤U GIÃ TUYáº¾N QUAN TÃ‚M: Chuyáº¿n ${flightNum} (${route})`;
                    html = buildEmailHtml({
                        title: `Má»Ÿ Äáº¥u GiÃ¡ Tuyáº¿n Báº¡n Quan TÃ¢m: ${route}`,
                        subtitle: `Chuyáº¿n bay ${flightNum} &middot; ${originName} âž” ${destName}`,
                        contentHtml: `
                            <p>KÃ­nh gá»­i QuÃ½ Ä‘áº¡i lÃ½ <strong>${reqData.agentName || 'QuÃ½ Äáº¡i lÃ½'}</strong> (${reqData.agentCode || ''}),</p>
                            <p>Há»‡ thá»‘ng Vietravel Airlines Cargo trÃ¢n trá»ng thÃ´ng bÃ¡o: Tuyáº¿n bay <strong>${route} (${originName} âž” ${destName})</strong> mÃ  QuÃ½ Ä‘áº¡i lÃ½ Ä‘Ã£ Ä‘Äƒng kÃ½ theo dÃµi vá»«a chÃ­nh thá»©c má»Ÿ phiÃªn Ä‘áº¥u giÃ¡ má»›i vá»›i thÃ´ng tin chi tiáº¿t nhÆ° sau:</p>

                            <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#f0f4ff;border:1px solid #c7d2fe;border-radius:6px;margin:16px 0;">
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;width:38%;">Sá»‘ hiá»‡u chuyáº¿n bay:</td><td style="font-weight:bold;color:#1e3a5f;font-family:monospace;font-size:15px;">${flightNum}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">HÃ nh trÃ¬nh / Tuyáº¿n bay:</td><td style="font-weight:bold;color:#333;">${route} (${originName} - ${destName})</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Giá» cáº¥t cÃ¡nh dá»± kiáº¿n (ETD):</td><td style="color:#1e3a5f;font-weight:bold;">${etd}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Táº£i trá»ng má»Ÿ tháº§u:</td><td style="font-weight:bold;color:#1e3a5f;">${fmtNum(capacityKg)} Kg</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">GiÃ¡ khá»Ÿi Ä‘iá»ƒm sÃ n:</td><td style="font-weight:bold;color:#2e7d32;font-size:15px;">${fmtNum(startingPriceKg)} Ä‘ / Kg</td></tr>
                                <tr><td style="color:#555;">Quy Ä‘á»‹nh Ä‘Ã³ng tháº§u:</td><td style="color:#d32f2f;font-weight:bold;">ÄÃ³ng tháº§u trÆ°á»›c ETD 3 giá»</td></tr>
                            </table>

                            <p style="margin-top:16px;">QuÃ½ Ä‘áº¡i lÃ½ vui lÃ²ng truy cáº­p sÃ n Ä‘áº¥u giÃ¡ sá»›m Ä‘á»ƒ Ä‘áº·t má»©c giÃ¡ chÃ o tá»‘t nháº¥t vÃ  giá»¯ slot váº­n chuyá»ƒn:</p>

                            <p style="text-align:center;margin:24px 0;">
                                <a href="http://localhost:8085/04-Detail.html?id=${auctionData.id || 1}" style="display:inline-block;background-color:#1e3a5f;color:#ffffff;font-weight:bold;padding:12px 28px;border-radius:6px;text-decoration:none;">XEM CHI TIáº¾T & Äáº¶T GIÃ NGAY</a>
                            </p>
                        `
                    });
                } else if (type === 'PAYMENT_SUBMITTED_ADMIN') {
                    const paymentData = reqData.paymentData || {};
                    const wonId = paymentData.wonId || reqData.wonId || 'WON-ORDER';
                    const agentCode = paymentData.agentCode || reqData.agentCode || 'AG-XXXX';
                    const agentName = paymentData.agentName || reqData.agentName || 'Äáº¡i lÃ½';
                    const flightNum = paymentData.flightNumber || reqData.flightNumber || '';
                    const route = paymentData.route || reqData.route || '';
                    const totalVnd = paymentData.transferredAmount || paymentData.totalAmountVND || reqData.amount || 0;
                    const memo = paymentData.memo || reqData.memo || '';
                    const transactionRef = paymentData.transactionRef || reqData.transactionRef || '';
                    const proofImageUrl = paymentData.proofImageUrl || reqData.proofImageUrl || '';
                    const submittedAt = paymentData.submittedAt || new Date().toLocaleString('vi-VN');
                    const fmtNum = (n) => new Intl.NumberFormat('vi-VN').format(n);

                    subject = `[Vietravel Airlines Cargo] ðŸ’³ Äáº I LÃ BÃO CHUYá»‚N KHOáº¢N - ÄÆ¡n ${wonId} (${agentCode})`;
                    html = buildEmailHtml({
                        title: 'ThÃ´ng BÃ¡o: Äáº¡i LÃ½ ÄÃ£ BÃ¡o Chuyá»ƒn Khoáº£n',
                        subtitle: `MÃ£ Ä‘Æ¡n: ${wonId} &middot; Äáº¡i lÃ½: ${agentCode} - ${agentName}`,
                        contentHtml: `
                            <p>KÃ­nh gá»­i <strong>Ban Quáº£n trá»‹ & Bá»™ pháº­n Káº¿ toÃ¡n / Tra soÃ¡t</strong>,</p>
                            <p>Äáº¡i lÃ½ <strong>${agentName} (${agentCode})</strong> vá»«a gá»­i thÃ´ng bÃ¡o Ä‘Ã£ hoÃ n táº¥t chuyá»ƒn khoáº£n thanh toÃ¡n cho Ä‘Æ¡n hÃ ng tháº¯ng tháº§u. Vui lÃ²ng Ä‘á»‘i soÃ¡t sao kÃª tÃ i khoáº£n ngÃ¢n hÃ ng vÃ  xÃ¡c nháº­n Ä‘Æ¡n hÃ ng trÃªn há»‡ thá»‘ng Admin:</p>

                            <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#fff8e1;border:1px solid #ffe082;border-radius:6px;margin:16px 0;">
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;width:35%;">MÃ£ Ä‘Æ¡n hÃ ng:</td><td style="font-weight:bold;color:#1e3a5f;font-family:monospace;font-size:15px;">${wonId}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Äáº¡i lÃ½ thanh toÃ¡n:</td><td style="font-weight:bold;color:#333;">${agentCode} - ${agentName}</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Chuyáº¿n bay & Tuyáº¿n:</td><td style="color:#1e3a5f;font-weight:bold;">${flightNum} (${route})</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">Sá»‘ tiá»n bÃ¡o chuyá»ƒn:</td><td style="font-weight:bold;color:#d32f2f;font-size:16px;">${fmtNum(totalVnd)} Ä‘</td></tr>
                                <tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">CÃº phÃ¡p chuyá»ƒn khoáº£n:</td><td style="font-family:monospace;font-weight:bold;color:#2e7d32;background:#e8f5e9;padding:4px 8px;border-radius:4px;">${memo}</td></tr>
                                ${transactionRef ? `<tr><td style="color:#555;border-bottom:1px solid #e0e0e0;">MÃ£ GD ngÃ¢n hÃ ng:</td><td style="font-family:monospace;font-weight:bold;color:#1565c0;">${transactionRef}</td></tr>` : ''}
                                <tr><td style="color:#555;">Thá»i Ä‘iá»ƒm ná»™p:</td><td style="color:#555;">${submittedAt}</td></tr>
                            </table>

                            ${proofImageUrl ? `
                                <div style="margin:16px 0;padding:12px;background:#f5f5f5;border-radius:6px;text-align:center;">
                                    <p style="font-size:12px;color:#666;margin-bottom:8px;font-weight:bold;">áº¢nh biÃªn lai Ä‘áº¡i lÃ½ Ä‘Ã­nh kÃ¨m:</p>
                                    <img src="${proofImageUrl}" alt="BiÃªn lai thanh toÃ¡n" style="max-height:260px;max-width:100%;border-radius:6px;border:1px solid #ddd;" />
                                </div>
                            ` : ''}

                            <p style="margin-top:16px;">Báº¥m nÃºt bÃªn dÆ°á»›i Ä‘á»ƒ chuyá»ƒn trá»±c tiáº¿p Ä‘áº¿n mÃ n hÃ¬nh Äá»‘i soÃ¡t & XÃ¡c nháº­n thanh toÃ¡n:</p>

                            <p style="text-align:center;margin:24px 0;">
                                <a href="http://localhost:8085/Admin/03-AuctionList.html?tab=won&search=${wonId}&reconcile=${wonId}" style="display:inline-block;background-color:#0284c7;color:#ffffff;font-weight:bold;padding:12px 28px;border-radius:6px;text-decoration:none;">Äá»I SOÃT & DUYá»†T ÄÆ N TRÃŠN ADMIN</a>
                            </p>
                        `
                    });
                }

                // Fallback HTML builder if html is still empty
                if (!html || html.trim() === '') {
                    const fallbackTitle = customSubject || reqData.title || '[Vietravel Airlines Cargo] ThÃ´ng bÃ¡o há»‡ thá»‘ng';
                    const fallbackMsg = reqData.message || reqData.content || reqData.text || 'Vietravel Airlines Cargo trÃ¢n trá»ng thÃ´ng bÃ¡o: QuÃ½ vá»‹ cÃ³ má»™t thÃ´ng bÃ¡o má»›i tá»« há»‡ thá»‘ng SÃ n Äáº¥u giÃ¡ Cargo.';
                    subject = customSubject || `[Vietravel Airlines Cargo] ${reqData.title || 'ThÃ´ng bÃ¡o má»›i'}`;
                    html = buildEmailHtml({
                        title: fallbackTitle,
                        subtitle: 'ThÃ´ng bÃ¡o tá»« Ban Äiá»u hÃ nh SÃ n Äáº¥u giÃ¡ Cargo',
                        contentHtml: `
                            <p>KÃ­nh gá»­i QuÃ½ Ä‘áº¡i lÃ½ / KhÃ¡ch hÃ ng,</p>
                            <p style="font-size:14px;color:#333;line-height:1.6;margin:16px 0;">${fallbackMsg}</p>
                            <p style="text-align:center;margin:24px 0;">
                                <a href="http://localhost:8085/02-Dashboard.html" style="display:inline-block;background-color:#1565c0;color:#ffffff;font-weight:bold;padding:12px 28px;border-radius:6px;text-decoration:none;">VÃ€O Há»† THá»NG SÃ€N Äáº¤U GIÃ</a>
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
                    text: htmlToPlainText(html), // Plain text alternative â€” giáº£m spam score
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
                res.end('<h1>404 Not Found</h1><p>Trang khÃ´ng tá»“n táº¡i trÃªn mÃ¡y chá»§.</p>', 'utf-8');
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
        console.error(`\nâš ï¸  [Port In Use] Cá»•ng ${PORT} hiá»‡n Ä‘ang Ä‘Æ°á»£c sá»­ dá»¥ng bá»Ÿi má»™t tiáº¿n trÃ¬nh khÃ¡c.`);
        console.error(`ðŸ‘‰ MÃ¡y chá»§ cÃ³ thá»ƒ Ä‘Ã£ Ä‘ang cháº¡y sáºµn táº¡i: http://localhost:${PORT}/`);
        console.error(`ðŸ‘‰ Äá»ƒ khá»Ÿi Ä‘á»™ng má»›i, báº¡n hÃ£y táº¯t tiáº¿n trÃ¬nh Ä‘ang chiáº¿m cá»•ng ${PORT}.\n`);
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



