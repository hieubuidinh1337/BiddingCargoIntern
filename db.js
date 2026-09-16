const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_FILE = path.join(__dirname, 'database.sqlite');
const SEED_FILE = path.join(__dirname, 'server_data.json');

let db = null;

function getDb() {
    if (!db) {
        db = new sqlite3.Database(DB_FILE);
    }
    return db;
}

// Promisified SQL helpers
function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        getDb().run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        getDb().get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        getDb().all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function exec(sql) {
    return new Promise((resolve, reject) => {
        getDb().exec(sql, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function initDatabase() {
    console.log('[Database] Initializing SQLite database:', DB_FILE);
    
    // Enable WAL mode & foreign keys for maximum concurrency & integrity
    await run('PRAGMA journal_mode = WAL;');
    await run('PRAGMA foreign_keys = ON;');

    // Create Tables
    await exec(`
        CREATE TABLE IF NOT EXISTS auctions (
            id INTEGER PRIMARY KEY,
            flightCode TEXT,
            flightNumber TEXT,
            route TEXT,
            origin TEXT,
            destination TEXT,
            originName TEXT,
            destName TEXT,
            etd TEXT,
            eta TEXT,
            etdIso TEXT,
            aircraft TEXT,
            capacityKg INTEGER,
            startingPriceKg INTEGER,
            currentPriceKg INTEGER,
            minStep INTEGER,
            endTime TEXT,
            status TEXT,
            leadingAgentCode TEXT,
            leadingAgentName TEXT,
            bidsCount INTEGER DEFAULT 0,
            winnerAgentCode TEXT,
            winnerAgentName TEXT,
            winningPriceKg INTEGER,
            specialNotes TEXT,
            cutOffTime TEXT
        );

        CREATE TABLE IF NOT EXISTS bids (
            id TEXT PRIMARY KEY,
            timestamp BIGINT,
            auctionId INTEGER,
            agentCode TEXT,
            agentName TEXT,
            isAnonymous INTEGER DEFAULT 1,
            priceKg INTEGER,
            time TEXT,
            status TEXT,
            weightKg INTEGER,
            FOREIGN KEY(auctionId) REFERENCES auctions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS won_auctions (
            wonId TEXT PRIMARY KEY,
            auctionId INTEGER,
            agentCode TEXT,
            flightNumber TEXT,
            route TEXT,
            capacityKg INTEGER,
            priceKg INTEGER,
            totalAmountVND BIGINT,
            paymentDeadline TEXT,
            paymentStatus TEXT,
            paidAt TEXT,
            awbNumber TEXT,
            cutOffTime TEXT,
            warehouse TEXT,
            lockWaivedByAdmin INTEGER DEFAULT 0,
            lockPenaltyHandled INTEGER DEFAULT 0,
            momoOrderId TEXT,
            momoRequestId TEXT,
            momoOrderInfo TEXT,
            momoPayUrl TEXT,
            momoQrCodeUrl TEXT,
            momoDeeplink TEXT,
            momoTransId TEXT,
            momoPaidAt TEXT,
            momoCreatedAt TEXT,
            momoExpiresAt TEXT
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            targetAgentCode TEXT,
            title TEXT,
            message TEXT,
            time TEXT,
            type TEXT,
            read INTEGER DEFAULT 0,
            link TEXT
        );

        CREATE TABLE IF NOT EXISTS registrations (
            regId TEXT PRIMARY KEY,
            companyName TEXT,
            taxCode TEXT,
            address TEXT,
            field TEXT,
            repName TEXT,
            repPosition TEXT,
            email TEXT,
            phone TEXT,
            documents TEXT,
            status TEXT,
            submittedAt TEXT,
            rejectionReason TEXT
        );

        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE,
            agentCode TEXT,
            password TEXT,
            pin TEXT,
            role TEXT,
            fullName TEXT,
            email TEXT,
            companyName TEXT,
            status TEXT
        );

        CREATE TABLE IF NOT EXISTS agents (
            code TEXT PRIMARY KEY,
            name TEXT,
            companyName TEXT,
            taxCode TEXT,
            email TEXT,
            phone TEXT,
            status TEXT,
            isLocked INTEGER DEFAULT 0,
            lockedReason TEXT,
            lockedAt TEXT,
            unlockedAt TEXT,
            password TEXT,
            pin TEXT
        );

        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            agentCode TEXT,
            agentName TEXT,
            status TEXT,
            createdAt TEXT,
            closedAt TEXT,
            assignedTo TEXT,
            assignedName TEXT
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            chatId TEXT,
            sender TEXT,
            senderName TEXT,
            text TEXT,
            fileUrl TEXT,
            fileName TEXT,
            fileType TEXT,
            timestamp BIGINT,
            read INTEGER DEFAULT 0,
            FOREIGN KEY(chatId) REFERENCES chats(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS email_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            toAddress TEXT,
            type TEXT,
            subject TEXT,
            messageId TEXT,
            isRealSmtp INTEGER DEFAULT 0,
            previewUrl TEXT,
            sentAt TEXT
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);

    // Ensure columns exist on existing database
    try { await exec('ALTER TABLE agents ADD COLUMN password TEXT;'); } catch (e) {}
    try { await exec('ALTER TABLE agents ADD COLUMN pin TEXT;'); } catch (e) {}

    // Indexes for high performance
    await exec(`
        CREATE INDEX IF NOT EXISTS idx_bids_auctionId ON bids(auctionId);
        CREATE INDEX IF NOT EXISTS idx_won_agentCode ON won_auctions(agentCode);
        CREATE INDEX IF NOT EXISTS idx_chats_agentCode ON chats(agentCode);
        CREATE INDEX IF NOT EXISTS idx_chat_msgs_chatId ON chat_messages(chatId);
    `);

    // Ensure default users exist
    const userCountResult = await get('SELECT COUNT(*) as count FROM users');
    if (!userCountResult || userCountResult.count === 0) {
        const defaultUsers = [
            { id: 'USR-001', username: 'admin', agentCode: 'VU-ADMIN-01', password: 'admin2026', pin: '1234', role: 'ADMIN', fullName: 'Quản Trị Viên VU', email: 'admin@vietravelairlines.vn', companyName: 'Vietravel Airlines HQ', status: 'ACTIVE' },
            { id: 'USR-002', username: 'staff01', agentCode: 'VU-OPS-88', password: 'staff2026', pin: '1234', role: 'STAFF', fullName: 'Nhân Viên Điều Hành Cargo', email: 'staff@vietravelairlines.vn', companyName: 'Trung Tâm Kho Vận Vietravel Cargo', status: 'ACTIVE' },
            { id: 'USR-003', username: 'AG-0892', agentCode: 'AG-0892', password: 'abc123456', pin: '1234', role: 'AGENT', fullName: 'Nguyễn Văn An', email: 'an.nguyen@abccargo.vn', companyName: 'Công ty TNHH Vận tải ABC Logistics', status: 'ACTIVE' },
            { id: 'USR-004', username: 'AG-1024', agentCode: 'AG-1024', password: 'vina123456', pin: '1234', role: 'AGENT', fullName: 'Lê Minh Khang', email: 'khang.le@vinatrans.com.vn', companyName: 'Công ty CP Giao nhận Kho vận Vinatrans', status: 'ACTIVE' },
            { id: 'USR-005', username: 'AG-0556', agentCode: 'AG-0556', password: 'star123456', pin: '1234', role: 'AGENT', fullName: 'Phạm Thu Thảo', email: 'thao.pham@dhlvietnam.com', companyName: 'Công ty TNHH Tiếp vận Toàn Cầu Golden Star', status: 'ACTIVE' },
            { id: 'USR-006', username: 'AG-0341', agentCode: 'AG-0341', password: 'sky123456', pin: '1234', role: 'AGENT', fullName: 'Hoàng Văn Dũng', email: 'dung.hoang@saigonair.vn', companyName: 'Công ty TNHH SkyFreight Logistics Việt Nam', status: 'ACTIVE' },
            { id: 'USR-007', username: 'AG-0789', agentCode: 'AG-0789', password: 'viet123456', pin: '1234', role: 'AGENT', fullName: 'Nguyễn Thị Hoa', email: 'hoa.nt@vietfreight.vn', companyName: 'Công ty CP Vận chuyển Hàng không Việt Freight', status: 'ACTIVE' }
        ];
        for (const u of defaultUsers) {
            await run(`
                INSERT OR REPLACE INTO users (id, username, agentCode, password, pin, role, fullName, email, companyName, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [u.id, u.username, u.agentCode, u.password, u.pin, u.role, u.fullName, u.email, u.companyName, u.status]);
        }
    }

    // Ensure agent passwords and pins are populated in agents table
    await run("UPDATE agents SET password = 'abc123456', pin = '1234' WHERE (password IS NULL OR password = '') AND UPPER(code) = 'AG-0892';");
    await run("UPDATE agents SET password = 'vina123456', pin = '1234' WHERE (password IS NULL OR password = '') AND UPPER(code) = 'AG-1024';");
    await run("UPDATE agents SET password = 'star123456', pin = '1234' WHERE (password IS NULL OR password = '') AND UPPER(code) = 'AG-0556';");
    await run("UPDATE agents SET password = 'sky123456', pin = '1234' WHERE (password IS NULL OR password = '') AND UPPER(code) = 'AG-0341';");
    await run("UPDATE agents SET password = 'viet123456', pin = '1234' WHERE (password IS NULL OR password = '') AND UPPER(code) = 'AG-0789';");
    await run("UPDATE agents SET password = 'abc123456', pin = '1234' WHERE password IS NULL OR password = '';");

    // Check if initial seeding from server_data.json is needed
    const countResult = await get('SELECT COUNT(*) as count FROM auctions');
    if (countResult && countResult.count === 0 && fs.existsSync(SEED_FILE)) {
        console.log('[Database] Tables are empty. Seeding initial data from server_data.json...');
        try {
            const raw = fs.readFileSync(SEED_FILE, 'utf8');
            const seedData = JSON.parse(raw);
            await seedFullData(seedData);
            console.log('[Database] ✅ Successfully seeded initial data into SQLite database!');
        } catch (e) {
            console.error('[Database] Failed to seed data from server_data.json:', e);
        }
    }
}

let isSeeding = false;

async function seedFullData(data) {
    if (!data || isSeeding) return;
    isSeeding = true;

    try {
        await exec('BEGIN TRANSACTION;');
    } catch (e) {
        // Transaction already active
    }

    try {
        if (Array.isArray(data.auctions)) {
            for (const a of data.auctions) {
                await run(`
                    INSERT OR REPLACE INTO auctions 
                    (id, flightCode, flightNumber, route, origin, destination, originName, destName, etd, eta, etdIso, aircraft, capacityKg, startingPriceKg, currentPriceKg, minStep, endTime, status, leadingAgentCode, leadingAgentName, bidsCount, winnerAgentCode, winnerAgentName, winningPriceKg, specialNotes, cutOffTime)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    a.id, a.flightCode || null, a.flightNumber || null, a.route || null, a.origin || null, a.destination || null,
                    a.originName || null, a.destName || null, a.etd || null, a.eta || null, a.etdIso || null, a.aircraft || null,
                    a.capacityKg || 0, a.startingPriceKg || 0, a.currentPriceKg || 0, a.minStep || 0, a.endTime || null,
                    a.status || 'OPEN', a.leadingAgentCode || null, a.leadingAgentName || null, a.bidsCount || 0,
                    a.winnerAgentCode || null, a.winnerAgentName || null, a.winningPriceKg || 0, a.specialNotes || null, a.cutOffTime || null
                ]);
            }
        }

        if (Array.isArray(data.bids)) {
            for (const b of data.bids) {
                await run(`
                    INSERT OR REPLACE INTO bids (id, timestamp, auctionId, agentCode, agentName, isAnonymous, priceKg, time, status, weightKg)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    String(b.id), b.timestamp || Date.now(), b.auctionId, b.agentCode, b.agentName,
                    b.isAnonymous ? 1 : 0, b.priceKg || 0, b.time || '', b.status || 'OUTBID', b.weightKg || 0
                ]);
            }
        }

        if (Array.isArray(data.wonAuctions)) {
            for (const w of data.wonAuctions) {
                await run(`
                    INSERT OR REPLACE INTO won_auctions
                    (wonId, auctionId, agentCode, flightNumber, route, capacityKg, priceKg, totalAmountVND, paymentDeadline, paymentStatus, paidAt, awbNumber, cutOffTime, warehouse, lockWaivedByAdmin, lockPenaltyHandled, momoOrderId, momoRequestId, momoOrderInfo, momoPayUrl, momoQrCodeUrl, momoDeeplink, momoTransId, momoPaidAt, momoCreatedAt, momoExpiresAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    w.wonId, w.auctionId, w.agentCode, w.flightNumber, w.route, w.capacityKg || 0, w.priceKg || 0,
                    w.totalAmountVND || 0, w.paymentDeadline || null, w.paymentStatus || 'UNPAID', w.paidAt || null,
                    w.awbNumber || null, w.cutOffTime || null, w.warehouse || null, w.lockWaivedByAdmin ? 1 : 0,
                    w.lockPenaltyHandled ? 1 : 0, w.momoOrderId || null, w.momoRequestId || null, w.momoOrderInfo || null,
                    w.momoPayUrl || null, w.momoQrCodeUrl || null, w.momoDeeplink || null, w.momoTransId || null,
                    w.momoPaidAt || null, w.momoCreatedAt || null, w.momoExpiresAt || null
                ]);
            }
        }

        if (Array.isArray(data.notifications)) {
            for (const n of data.notifications) {
                await run(`
                    INSERT OR REPLACE INTO notifications (id, targetAgentCode, title, message, time, type, read, link)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    n.id || null, n.targetAgentCode || null, n.title || '', n.message || '', n.time || '', n.type || 'INFO',
                    n.read ? 1 : 0, n.link || null
                ]);
            }
        }

        if (Array.isArray(data.registrations)) {
            for (const r of data.registrations) {
                await run(`
                    INSERT OR REPLACE INTO registrations (regId, companyName, taxCode, address, field, repName, repPosition, email, phone, documents, status, submittedAt, rejectionReason)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    r.regId, r.companyName || '', r.taxCode || '', r.address || '', r.field || '', r.repName || '',
                    r.repPosition || '', r.email || '', r.phone || '', JSON.stringify(r.documents || []), r.status || 'PENDING',
                    r.submittedAt || '', r.rejectionReason || r.rejectReason || null
                ]);
            }
        }

        const defaultUsers = [
            { id: 'USR-001', username: 'admin', agentCode: 'VU-ADMIN-01', password: 'admin2026', pin: '1234', role: 'ADMIN', fullName: 'Quản Trị Viên VU', email: 'admin@vietravelairlines.vn', companyName: 'Vietravel Airlines HQ', status: 'ACTIVE' },
            { id: 'USR-002', username: 'staff01', agentCode: 'VU-OPS-88', password: 'staff2026', pin: '1234', role: 'STAFF', fullName: 'Nhân Viên Điều Hành Cargo', email: 'staff@vietravelairlines.vn', companyName: 'Trung Tâm Kho Vận Vietravel Cargo', status: 'ACTIVE' },
            { id: 'USR-003', username: 'AG-0892', agentCode: 'AG-0892', password: 'abc123456', pin: '1234', role: 'AGENT', fullName: 'Nguyễn Văn An', email: 'an.nguyen@abccargo.vn', companyName: 'Công ty TNHH Vận tải ABC Logistics', status: 'ACTIVE' },
            { id: 'USR-004', username: 'AG-1024', agentCode: 'AG-1024', password: 'vina123456', pin: '1234', role: 'AGENT', fullName: 'Lê Minh Khang', email: 'khang.le@vinatrans.com.vn', companyName: 'Công ty CP Giao nhận Kho vận Vinatrans', status: 'ACTIVE' },
            { id: 'USR-005', username: 'AG-0556', agentCode: 'AG-0556', password: 'star123456', pin: '1234', role: 'AGENT', fullName: 'Phạm Thu Thảo', email: 'thao.pham@dhlvietnam.com', companyName: 'Công ty TNHH Tiếp vận Toàn Cầu Golden Star', status: 'ACTIVE' },
            { id: 'USR-006', username: 'AG-0341', agentCode: 'AG-0341', password: 'sky123456', pin: '1234', role: 'AGENT', fullName: 'Hoàng Văn Dũng', email: 'dung.hoang@saigonair.vn', companyName: 'Công ty TNHH SkyFreight Logistics Việt Nam', status: 'ACTIVE' },
            { id: 'USR-007', username: 'AG-0789', agentCode: 'AG-0789', password: 'viet123456', pin: '1234', role: 'AGENT', fullName: 'Nguyễn Thị Hoa', email: 'hoa.nt@vietfreight.vn', companyName: 'Công ty CP Vận chuyển Hàng không Việt Freight', status: 'ACTIVE' }
        ];

        for (const u of defaultUsers) {
            await run(`
                INSERT OR REPLACE INTO users (id, username, agentCode, password, pin, role, fullName, email, companyName, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [u.id, u.username, u.agentCode, u.password, u.pin, u.role, u.fullName, u.email, u.companyName, u.status]);
        }

        const defaultPwdMap = {
            'AG-0892': 'abc123456',
            'AG-1024': 'vina123456',
            'AG-0556': 'star123456',
            'AG-0341': 'sky123456',
            'AG-0789': 'viet123456'
        };

        if (Array.isArray(data.agentsList)) {
            for (const ag of data.agentsList) {
                const codeUpper = String(ag.code || '').toUpperCase();
                const pwd = ag.password || defaultPwdMap[codeUpper] || 'abc123456';
                const pin = ag.pin || '1234';
                await run(`
                    INSERT OR REPLACE INTO agents (code, name, companyName, taxCode, email, phone, status, isLocked, lockedReason, lockedAt, unlockedAt, password, pin)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    ag.code, ag.name || ag.companyName || '', ag.companyName || '', ag.taxCode || '', ag.email || '',
                    ag.phone || '', ag.status || 'Hoạt động', ag.isLocked ? 1 : 0, ag.lockedReason || null, ag.lockedAt || null, ag.unlockedAt || null,
                    pwd, pin
                ]);
            }
        }

        if (Array.isArray(data.chats)) {
            for (const c of data.chats) {
                await run(`
                    INSERT OR REPLACE INTO chats (id, agentCode, agentName, status, createdAt, closedAt, assignedTo, assignedName)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    c.id, c.agentCode, c.agentName, c.status, c.createdAt, c.closedAt || null, c.assignedTo || null, c.assignedName || null
                ]);

                if (Array.isArray(c.messages)) {
                    for (const m of c.messages) {
                        await run(`
                            INSERT OR REPLACE INTO chat_messages (id, chatId, sender, senderName, text, fileUrl, fileName, fileType, timestamp, read)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `, [
                            m.id, c.id, m.sender, m.senderName, m.text || null, m.fileUrl || null, m.fileName || null, m.fileType || null, m.timestamp || Date.now(), m.read ? 1 : 0
                        ]);
                    }
                }
            }
        }

        if (data.settings) {
            await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['settings', JSON.stringify(data.settings)]);
        }
        if (data.bankConfig) {
            await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['bankConfig', JSON.stringify(data.bankConfig)]);
        }
        if (data.routeSubscriptions) {
            await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['routeSubscriptions', JSON.stringify(data.routeSubscriptions)]);
        }

        await exec('COMMIT;').catch(() => {});
    } catch (err) {
        await exec('ROLLBACK;').catch(() => {});
        throw err;
    } finally {
        isSeeding = false;
    }
}

// Assembly function to fetch full state object compatible with existing frontend expectations
async function getFullServerData() {
    const auctions = await all('SELECT * FROM auctions ORDER BY id DESC');
    const bids = await all('SELECT * FROM bids ORDER BY timestamp DESC');
    const wonAuctions = await all('SELECT * FROM won_auctions ORDER BY wonId DESC');
    const notifications = await all('SELECT * FROM notifications ORDER BY id DESC');
    const dbRegs = await all('SELECT * FROM registrations');
    const dbAgents = await all('SELECT * FROM agents');
    const dbUsers = await all('SELECT * FROM users');
    const dbChats = await all('SELECT * FROM chats ORDER BY createdAt DESC');
    const dbMessages = await all('SELECT * FROM chat_messages ORDER BY timestamp ASC');
    const dbSettingsRows = await all('SELECT * FROM settings');
    const emailLogsRows = await all('SELECT * FROM email_logs ORDER BY id DESC LIMIT 50');

    const defaultPwdMap = {
        'AG-0892': 'abc123456',
        'AG-1024': 'vina123456',
        'AG-0556': 'star123456',
        'AG-0341': 'sky123456',
        'AG-0789': 'viet123456'
    };

    // Parse registrations documents JSON
    const registrations = dbRegs.map(r => ({
        ...r,
        documents: typeof r.documents === 'string' ? JSON.parse(r.documents || '[]') : (r.documents || [])
    }));

    // Attach messages to chats
    const chatsMap = new Map();
    dbChats.forEach(c => chatsMap.set(c.id, { ...c, messages: [] }));
    dbMessages.forEach(m => {
        const chat = chatsMap.get(m.chatId);
        if (chat) {
            chat.messages.push({
                ...m,
                isAnonymous: m.isAnonymous === 1,
                read: m.read === 1
            });
        }
    });

    const settingsMap = {};
    dbSettingsRows.forEach(row => {
        try {
            settingsMap[row.key] = JSON.parse(row.value);
        } catch (e) {
            settingsMap[row.key] = row.value;
        }
    });

    return {
        version: Date.now(),
        auctions: auctions.map(a => ({
            ...a,
            capacityKg: Number(a.capacityKg),
            startingPriceKg: Number(a.startingPriceKg),
            currentPriceKg: Number(a.currentPriceKg),
            minStep: Number(a.minStep),
            bidsCount: Number(a.bidsCount),
            winningPriceKg: Number(a.winningPriceKg)
        })),
        bids: bids.map(b => ({
            ...b,
            id: isNaN(Number(b.id)) ? b.id : Number(b.id),
            auctionId: Number(b.auctionId),
            priceKg: Number(b.priceKg),
            weightKg: Number(b.weightKg),
            timestamp: Number(b.timestamp),
            isAnonymous: Boolean(b.isAnonymous)
        })),
        wonAuctions: wonAuctions.map(w => ({
            ...w,
            auctionId: Number(w.auctionId),
            capacityKg: Number(w.capacityKg),
            priceKg: Number(w.priceKg),
            totalAmountVND: Number(w.totalAmountVND),
            lockWaivedByAdmin: Boolean(w.lockWaivedByAdmin),
            lockPenaltyHandled: Boolean(w.lockPenaltyHandled)
        })),
        notifications: notifications.map(n => ({
            ...n,
            read: Boolean(n.read)
        })),
        registrations,
        agentsList: dbAgents.map(ag => {
            const codeUpper = String(ag.code || '').toUpperCase();
            return {
                ...ag,
                isLocked: Boolean(ag.isLocked),
                password: ag.password || defaultPwdMap[codeUpper] || 'abc123456',
                pin: ag.pin || '1234'
            };
        }),
        usersList: dbUsers,
        chats: Array.from(chatsMap.values()),
        settings: settingsMap.settings || {},
        bankConfig: settingsMap.bankConfig || {},
        routeSubscriptions: settingsMap.routeSubscriptions || {},
        emailLogs: emailLogsRows.map(el => ({
            ...el,
            isRealSmtp: Boolean(el.isRealSmtp)
        }))
    };
}

async function placeBidAtomic({ auctionId, agentCode, agentName, priceKg, isAnonymous = true, weightKg = 0 }) {
    const agent = await get('SELECT * FROM agents WHERE UPPER(code) = UPPER(?)', [agentCode]);
    if (agent && (agent.isLocked === 1 || agent.status === 'Đã khóa' || agent.status === 'LOCKED')) {
        throw new Error('Tài khoản đại lý đã bị khóa, không thể đặt thầu');
    }

    const auction = await get('SELECT * FROM auctions WHERE id = ?', [auctionId]);
    if (!auction) {
        throw new Error('Chuyến bay đấu giá không tồn tại');
    }
    if (auction.status !== 'OPEN') {
        throw new Error('Phiên đấu giá đã đóng hoặc chưa mở');
    }

    const now = Date.now();
    const endMs = new Date(auction.endTime).getTime();
    if (!isNaN(endMs) && now > endMs) {
        await run('UPDATE auctions SET status = "CLOSED" WHERE id = ?', [auctionId]);
        throw new Error('Phiên đấu giá đã hết giờ');
    }

    const minStep = Number(auction.minStep) || 500;
    const currentPrice = Number(auction.currentPriceKg) || Number(auction.startingPriceKg) || 0;
    const minPriceRequired = currentPrice + ((Number(auction.bidsCount) || 0) > 0 ? minStep : 0);

    if (Number(priceKg) < minPriceRequired) {
        throw new Error(`Giá đặt (${new Intl.NumberFormat('vi-VN').format(priceKg)}đ) phải lớn hơn hoặc bằng giá tối thiểu (${new Intl.NumberFormat('vi-VN').format(minPriceRequired)}đ)`);
    }

    const bidId = 'BID-' + now + '-' + Math.floor(Math.random() * 1000);
    const timeStr = 'Vừa xong';

    try {
        await run('BEGIN IMMEDIATE TRANSACTION;');
    } catch (e) {}

    try {
        await run(`
            INSERT INTO bids (id, timestamp, auctionId, agentCode, agentName, isAnonymous, priceKg, time, status, weightKg)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'HIGHEST', ?)
        `, [bidId, now, auctionId, agentCode, agentName, isAnonymous ? 1 : 0, Number(priceKg), timeStr, Number(weightKg) || Number(auction.capacityKg) || 0]);

        await run(`
            UPDATE bids SET status = 'OUTBID' WHERE auctionId = ? AND id != ?
        `, [auctionId, bidId]);

        const newBidCount = (Number(auction.bidsCount) || 0) + 1;
        await run(`
            UPDATE auctions SET 
                currentPriceKg = ?,
                leadingAgentCode = ?,
                leadingAgentName = ?,
                bidsCount = ?
            WHERE id = ?
        `, [Number(priceKg), agentCode, agentName, newBidCount, auctionId]);

        await run('COMMIT;').catch(() => {});
        return {
            id: bidId,
            timestamp: now,
            auctionId,
            agentCode,
            agentName,
            isAnonymous: Boolean(isAnonymous),
            priceKg: Number(priceKg),
            time: timeStr,
            status: 'HIGHEST',
            weightKg: Number(weightKg) || Number(auction.capacityKg) || 0
        };
    } catch (err) {
        await run('ROLLBACK;').catch(() => {});
        throw err;
    }
}

async function createAuditLog(actorRole, actorId, action, target, details = '') {
    await run(`
        INSERT INTO notifications (targetAgentCode, title, message, time, type, read, link)
        VALUES (?, ?, ?, ?, 'AUDIT', 0, NULL)
    `, [actorId, `[AUDIT] ${action}`, `[${actorRole}] ${actorId} - ${action} trên ${target}: ${details}`, new Date().toLocaleString('vi-VN')]);
}

module.exports = {
    getDb,
    run,
    get,
    all,
    exec,
    initDatabase,
    seedFullData,
    getFullServerData,
    placeBidAtomic,
    createAuditLog
};
