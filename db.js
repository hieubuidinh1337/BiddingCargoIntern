try { require('dotenv').config(); } catch (e) { /* dotenv optional */ }

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// DB_TYPE=mssql  -> Microsoft SQL Server (Windows Authentication)   [demo build default]
// DB_TYPE=sqlite -> legacy SQLite file database
const DB_TYPE = String(process.env.DB_TYPE || 'mssql').toLowerCase();
const USE_MSSQL = (DB_TYPE === 'mssql' || DB_TYPE === 'sqlserver');
const mssqlDriver = USE_MSSQL ? require('./db-mssql') : null;

const DB_FILE = path.join(__dirname, 'database.sqlite');
const SEED_FILE = path.join(__dirname, 'server_data.json');

let db = null;

function getDb() {
    if (USE_MSSQL) return mssqlDriver.getDb();
    if (!db) {
        db = new sqlite3.Database(DB_FILE);
    }
    return db;
}

// Promisified SQL helpers
function run(sql, params = []) {
    if (USE_MSSQL) return mssqlDriver.run(sql, params);
    return new Promise((resolve, reject) => {
        getDb().run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function get(sql, params = []) {
    if (USE_MSSQL) return mssqlDriver.get(sql, params);
    return new Promise((resolve, reject) => {
        getDb().get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function all(sql, params = []) {
    if (USE_MSSQL) return mssqlDriver.all(sql, params);
    return new Promise((resolve, reject) => {
        getDb().all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function exec(sql) {
    if (USE_MSSQL) return mssqlDriver.exec(sql);
    return new Promise((resolve, reject) => {
        getDb().exec(sql, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function initDatabase() {
    if (USE_MSSQL) {
        await mssqlDriver.init(); // connects (Windows Auth) + creates DB/schema if missing
        console.log('[Database] SQL Server initialized successfully.');
        return;
    }
    console.log('[Database] Initializing SQLite database: ' + DB_FILE);
    
    // Enable WAL mode & foreign keys for maximum concurrency & integrity
    await run('PRAGMA journal_mode = WAL;');
    await run('PRAGMA foreign_keys = ON;');

    // Create Tables with full relational Foreign Keys
    await exec(`
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
            status TEXT,
            FOREIGN KEY(agentCode) REFERENCES agents(code) ON DELETE SET NULL ON UPDATE CASCADE
        );

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
            cutOffTime TEXT,
            closedAt TEXT,
            FOREIGN KEY(leadingAgentCode) REFERENCES agents(code) ON DELETE SET NULL ON UPDATE CASCADE,
            FOREIGN KEY(winnerAgentCode) REFERENCES agents(code) ON DELETE SET NULL ON UPDATE CASCADE
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
            FOREIGN KEY(auctionId) REFERENCES auctions(id) ON DELETE CASCADE ON UPDATE CASCADE,
            FOREIGN KEY(agentCode) REFERENCES agents(code) ON DELETE CASCADE ON UPDATE CASCADE
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
            cargo_declaration_json TEXT,
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
            momoExpiresAt TEXT,
            refundStatus TEXT DEFAULT 'NONE',
            refundBankInfo_json TEXT,
            refundConfirmedAt TEXT,
            refundConfirmedBy TEXT,
            refundNote TEXT,
            paymentProof_json TEXT,
            rejectionReason TEXT,
            FOREIGN KEY(auctionId) REFERENCES auctions(id) ON DELETE SET NULL ON UPDATE CASCADE,
            FOREIGN KEY(agentCode) REFERENCES agents(code) ON DELETE CASCADE ON UPDATE CASCADE
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            targetAgentCode TEXT,
            targetRole TEXT,
            title TEXT,
            message TEXT,
            time TEXT,
            type TEXT,
            read INTEGER DEFAULT 0,
            unread INTEGER DEFAULT 1,
            link TEXT,
            FOREIGN KEY(targetAgentCode) REFERENCES agents(code) ON DELETE SET NULL ON UPDATE CASCADE
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
            rejectionReason TEXT,
            agentCode TEXT,
            approvedAt TEXT
        );

        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            agentCode TEXT,
            agentName TEXT,
            status TEXT,
            createdAt TEXT,
            closedAt TEXT,
            assignedTo TEXT,
            assignedName TEXT,
            FOREIGN KEY(agentCode) REFERENCES agents(code) ON DELETE CASCADE ON UPDATE CASCADE
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
            FOREIGN KEY(chatId) REFERENCES chats(id) ON DELETE CASCADE ON UPDATE CASCADE
        );

        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            rawTime BIGINT,
            actor TEXT,
            username TEXT,
            role TEXT,
            actionCategory TEXT,
            actionTitle TEXT,
            target TEXT,
            details TEXT,
            ip TEXT,
            device TEXT
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

    // Ensure columns exist on existing database (migration guard)
    try { await exec('ALTER TABLE agents ADD COLUMN password TEXT;'); } catch (e) {}
    try { await exec('ALTER TABLE agents ADD COLUMN pin TEXT;'); } catch (e) {}
    try { await exec('ALTER TABLE notifications ADD COLUMN targetRole TEXT;'); } catch (e) {}
    try { await exec('ALTER TABLE won_auctions ADD COLUMN cargo_declaration_json TEXT;'); } catch (e) {}
    try { await exec('ALTER TABLE won_auctions ADD COLUMN refundStatus TEXT;'); } catch (e) {}
    try { await exec('ALTER TABLE won_auctions ADD COLUMN refundBankInfo_json TEXT;'); } catch (e) {}
    try { await exec('ALTER TABLE won_auctions ADD COLUMN refundConfirmedAt TEXT;'); } catch (e) {}
    try { await exec('ALTER TABLE won_auctions ADD COLUMN refundConfirmedBy TEXT;'); } catch (e) {}
    try { await exec('ALTER TABLE won_auctions ADD COLUMN refundNote TEXT;'); } catch (e) {}
    try { await exec('ALTER TABLE won_auctions ADD COLUMN paymentProof_json TEXT;'); } catch (e) {}
    try { await exec('ALTER TABLE won_auctions ADD COLUMN rejectionReason TEXT;'); } catch (e) {}
    try { await exec('ALTER TABLE notifications ADD COLUMN unread INTEGER DEFAULT 1;'); } catch (e) {}
    for (const col of ['openDate', 'closeDate', 'openDateIso', 'closeDateIso', 'allowedAgents_json', 'flightStartDate', 'flightEndDate', 'flightPeriod']) {
        try { await exec(`ALTER TABLE auctions ADD COLUMN ${col} TEXT;`); } catch (e) {}
    }

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
            { id: 'USR-008', username: 'staff02', agentCode: 'VU-OPS-88', password: 'staff2026', pin: '1234', role: 'STAFF', fullName: 'Nhân Viên Thẩm Định Đại Lý', email: 'staff02@vietravelairlines.vn', companyName: 'Phòng Thẩm Định Đại Lý', status: 'ACTIVE' },
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
            console.log('[Database] ✅ Successfully seeded initial data into ' + (USE_MSSQL ? 'SQL Server' : 'SQLite') + ' database!');
        } catch (e) {
            console.error('[Database] Failed to seed data from server_data.json:', e);
        }
    }

    // Auto-repair any mismatched rawTime timestamps in activity_logs
    try {
        const malformedLogs = await all("SELECT id, timestamp, rawTime FROM activity_logs WHERE timestamp IS NOT NULL AND timestamp != ''");
        for (const row of malformedLogs) {
            const parsed = parseTimestamp(row.timestamp);
            if (parsed && Math.abs((Number(row.rawTime) || 0) - parsed) > 86400000) {
                await run('UPDATE activity_logs SET rawTime = ? WHERE id = ?', [parsed, row.id]);
            }
        }
    } catch (e) {}
}

function parseTimestamp(tsStr) {
    if (!tsStr) return 0;
    if (typeof tsStr === 'number') return tsStr;
    const clean = String(tsStr).trim();
    const parts = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (parts) {
        const day = parseInt(parts[1], 10);
        const month = parseInt(parts[2], 10) - 1;
        const year = parseInt(parts[3], 10);
        const hour = parts[4] ? parseInt(parts[4], 10) : 0;
        const min = parts[5] ? parseInt(parts[5], 10) : 0;
        const sec = parts[6] ? parseInt(parts[6], 10) : 0;
        return new Date(year, month, day, hour, min, sec).getTime();
    }
    const d = new Date(tsStr);
    return isNaN(d.getTime()) ? 0 : d.getTime();
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
        // 1. Insert agents FIRST so child tables referencing agents(code) satisfy Foreign Keys
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
                // UPSERT (not INSERT OR REPLACE): REPLACE deletes the row first and would CASCADE-delete this agent's bids/won auctions
                await run(`
                    INSERT INTO agents (code, name, companyName, taxCode, email, phone, status, isLocked, lockedReason, lockedAt, unlockedAt, password, pin)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(code) DO UPDATE SET
                        name = excluded.name, companyName = excluded.companyName, taxCode = excluded.taxCode,
                        email = excluded.email, phone = excluded.phone, status = excluded.status,
                        isLocked = excluded.isLocked, lockedReason = excluded.lockedReason, lockedAt = excluded.lockedAt,
                        unlockedAt = excluded.unlockedAt, password = excluded.password, pin = excluded.pin
                `, [
                    ag.code, ag.name || ag.companyName || '', ag.companyName || '', ag.taxCode || '', ag.email || '',
                    ag.phone || '', ag.status || 'Hoạt động', ag.isLocked ? 1 : 0, ag.lockedReason || null, ag.lockedAt || null, ag.unlockedAt || null,
                    pwd, pin
                ]);
            }
        }

        // Ensure canonical agents exist in agents table
        const defaultAgents = [
            { code: 'AG-0892', name: 'ABC Logistics', companyName: 'Công ty TNHH Vận tải ABC Logistics' },
            { code: 'AG-1024', name: 'Vinatrans', companyName: 'Công ty CP Giao nhận Kho vận Vinatrans' },
            { code: 'AG-0556', name: 'Golden Star', companyName: 'Công ty TNHH Tiếp vận Toàn Cầu Golden Star' },
            { code: 'AG-0341', name: 'SkyFreight', companyName: 'Công ty TNHH SkyFreight Logistics Việt Nam' },
            { code: 'AG-0789', name: 'Viet Freight', companyName: 'Công ty CP Vận chuyển Hàng không Việt Freight' }
        ];

        for (const sa of defaultAgents) {
            await run(`
                INSERT OR IGNORE INTO agents (code, name, companyName, status, password, pin)
                VALUES (?, ?, ?, 'Hoạt động', '123456', '1234')
            `, [sa.code, sa.name, sa.companyName]);
        }

        // Auto-insert any missing real agent codes referenced in chats, wonAuctions, notifications, bids
        const referencedAgentCodes = new Set();
        const pseudoSystemCodes = new Set(['ALL', 'STAFF', 'SYSTEM', 'ADMIN', 'VU-ADMIN-01', 'VU-OPS-88']);
        if (Array.isArray(data.chats)) data.chats.forEach(c => c.agentCode && !pseudoSystemCodes.has(String(c.agentCode).toUpperCase()) && referencedAgentCodes.add(String(c.agentCode)));
        if (Array.isArray(data.wonAuctions)) data.wonAuctions.forEach(w => w.agentCode && !pseudoSystemCodes.has(String(w.agentCode).toUpperCase()) && referencedAgentCodes.add(String(w.agentCode)));
        if (Array.isArray(data.notifications)) data.notifications.forEach(n => n.targetAgentCode && !pseudoSystemCodes.has(String(n.targetAgentCode).toUpperCase()) && referencedAgentCodes.add(String(n.targetAgentCode)));
        if (Array.isArray(data.bids)) data.bids.forEach(b => b.agentCode && !pseudoSystemCodes.has(String(b.agentCode).toUpperCase()) && referencedAgentCodes.add(String(b.agentCode)));

        for (const code of referencedAgentCodes) {
            await run(`
                INSERT OR IGNORE INTO agents (code, name, companyName, status, password, pin)
                VALUES (?, ?, ?, 'Hoạt động', '123456', '1234')
            `, [code, `Đại lý (${code})`, `Công ty Đại lý ${code}`]);
        }

        // 2. Insert auctions SECOND so child tables referencing auctions(id) satisfy Foreign Keys
        if (Array.isArray(data.auctions)) {
            for (const a of data.auctions) {
                // UPSERT (not INSERT OR REPLACE): REPLACE would CASCADE-delete every bid of this auction
                await run(`
                    INSERT INTO auctions 
                    (id, flightCode, flightNumber, route, origin, destination, originName, destName, etd, eta, etdIso, aircraft, capacityKg, startingPriceKg, currentPriceKg, minStep, endTime, status, leadingAgentCode, leadingAgentName, bidsCount, winnerAgentCode, winnerAgentName, winningPriceKg, specialNotes, cutOffTime)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        flightCode = excluded.flightCode, flightNumber = excluded.flightNumber, route = excluded.route,
                        origin = excluded.origin, destination = excluded.destination, originName = excluded.originName,
                        destName = excluded.destName, etd = excluded.etd, eta = excluded.eta, etdIso = excluded.etdIso,
                        aircraft = excluded.aircraft, capacityKg = excluded.capacityKg, startingPriceKg = excluded.startingPriceKg,
                        currentPriceKg = excluded.currentPriceKg, minStep = excluded.minStep, endTime = excluded.endTime,
                        status = excluded.status, leadingAgentCode = excluded.leadingAgentCode,
                        leadingAgentName = excluded.leadingAgentName, bidsCount = excluded.bidsCount,
                        winnerAgentCode = excluded.winnerAgentCode, winnerAgentName = excluded.winnerAgentName,
                        winningPriceKg = excluded.winningPriceKg, specialNotes = excluded.specialNotes,
                        cutOffTime = excluded.cutOffTime
                `, [
                    a.id, a.flightCode || null, a.flightNumber || null, a.route || null, a.origin || null, a.destination || null,
                    a.originName || null, a.destName || null, a.etd || null, a.eta || null, a.etdIso || null, a.aircraft || null,
                    a.capacityKg || 0, a.startingPriceKg || 0, a.currentPriceKg || 0, a.minStep || 0, a.endTime || null,
                    a.status || 'OPEN', a.leadingAgentCode || null, a.leadingAgentName || null, a.bidsCount || 0,
                    a.winnerAgentCode || null, a.winnerAgentName || null, a.winningPriceKg || 0, a.specialNotes || null, a.cutOffTime || null
                ]);
                await saveAuctionMeta(a);
            }
        }

        // 3. Insert users
        const defaultUsers = [
            { id: 'USR-001', username: 'admin', agentCode: 'VU-ADMIN-01', password: 'admin2026', pin: '1234', role: 'ADMIN', fullName: 'Quản Trị Viên VU', email: 'admin@vietravelairlines.vn', companyName: 'Vietravel Airlines HQ', status: 'ACTIVE' },
            { id: 'USR-002', username: 'staff01', agentCode: 'VU-OPS-88', password: 'staff2026', pin: '1234', role: 'STAFF', fullName: 'Nhân Viên Điều Hành Cargo', email: 'staff@vietravelairlines.vn', companyName: 'Trung Tâm Kho Vận Vietravel Cargo', status: 'ACTIVE' },
            { id: 'USR-008', username: 'staff02', agentCode: 'VU-OPS-88', password: 'staff2026', pin: '1234', role: 'STAFF', fullName: 'Nhân Viên Thẩm Định Đại Lý', email: 'staff02@vietravelairlines.vn', companyName: 'Phòng Thẩm Định Đại Lý', status: 'ACTIVE' },
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

        // 4. Insert bids
        if (Array.isArray(data.bids)) {
            for (const b of data.bids) {
                const bAuctionId = (b.auctionId && !isNaN(Number(b.auctionId))) ? Number(b.auctionId) : null;
                const bAgentCode = (b.agentCode && String(b.agentCode).trim()) ? String(b.agentCode).trim() : null;
                await run(`
                    INSERT OR REPLACE INTO bids (id, timestamp, auctionId, agentCode, agentName, isAnonymous, priceKg, time, status, weightKg)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    String(b.id), b.timestamp || Date.now(), bAuctionId, bAgentCode, b.agentName,
                    b.isAnonymous ? 1 : 0, b.priceKg || 0, b.time || '', b.status || 'OUTBID', b.weightKg || 0
                ]);
            }
        }

        // 5. Insert won_auctions
        if (Array.isArray(data.wonAuctions)) {
            for (const w of data.wonAuctions) {
                const wAuctionId = (w.auctionId && !isNaN(Number(w.auctionId))) ? Number(w.auctionId) : null;
                const wAgentCode = (w.agentCode && String(w.agentCode).trim()) ? String(w.agentCode).trim() : null;
                // Serialize cargoDeclaration (IATA form) as JSON blob for persistence
                const cargoJson = w.cargoDeclaration ? JSON.stringify(w.cargoDeclaration) : null;
                const refundBankInfoJson = w.refundBankInfo ? JSON.stringify(w.refundBankInfo) : null;
                const paymentProofJson = w.paymentProof ? JSON.stringify(w.paymentProof) : null;
                await run(`
                    INSERT OR REPLACE INTO won_auctions
                    (wonId, auctionId, agentCode, flightNumber, route, capacityKg, priceKg, totalAmountVND, paymentDeadline, paymentStatus, paidAt, awbNumber, cutOffTime, warehouse, cargo_declaration_json, lockWaivedByAdmin, lockPenaltyHandled, momoOrderId, momoRequestId, momoOrderInfo, momoPayUrl, momoQrCodeUrl, momoDeeplink, momoTransId, momoPaidAt, momoCreatedAt, momoExpiresAt, refundStatus, refundBankInfo_json, refundConfirmedAt, refundConfirmedBy, refundNote, paymentProof_json, rejectionReason)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    w.wonId, wAuctionId, wAgentCode, w.flightNumber, w.route, w.capacityKg || 0, w.priceKg || 0,
                    w.totalAmountVND || 0, w.paymentDeadline || null, w.paymentStatus || 'UNPAID', w.paidAt || null,
                    w.awbNumber || null, w.cutOffTime || null, w.warehouse || null, cargoJson,
                    w.lockWaivedByAdmin ? 1 : 0, w.lockPenaltyHandled ? 1 : 0,
                    w.momoOrderId || null, w.momoRequestId || null, w.momoOrderInfo || null,
                    w.momoPayUrl || null, w.momoQrCodeUrl || null, w.momoDeeplink || null, w.momoTransId || null,
                    w.momoPaidAt || null, w.momoCreatedAt || null, w.momoExpiresAt || null,
                    w.refundStatus || null, refundBankInfoJson, w.refundConfirmedAt || null, w.refundConfirmedBy || null, w.refundNote || null,
                    paymentProofJson, w.rejectionReason || null
                ]);
            }
        }

        // 6. Insert notifications
        if (Array.isArray(data.notifications)) {
            const keepIds = data.notifications.map(n => n.id).filter(Boolean);
            if (keepIds.length > 0) {
                const placeholders = keepIds.map(() => '?').join(',');
                await run(`DELETE FROM notifications WHERE id NOT IN (${placeholders})`, keepIds);
            } else {
                await run('DELETE FROM notifications');
            }

            for (const n of data.notifications) {
                await run(`
                    INSERT OR REPLACE INTO notifications (id, targetAgentCode, targetRole, title, message, time, type, read, link)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    n.id || null, n.targetAgentCode || null, n.targetRole || null, n.title || '', n.message || '', n.time || '', n.type || 'INFO',
                    n.read ? 1 : 0, n.link || null
                ]);
            }
        }

        // 7. Insert registrations
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

        // 8. Insert chats and chat_messages
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

        if (Array.isArray(data.activityLogs)) {
            for (const l of data.activityLogs) {
                if (!l) continue;
                const parsedTime = parseTimestamp(l.timestamp);
                let effectiveRawTime = Number(l.rawTime) || 0;
                if (parsedTime && (!effectiveRawTime || Math.abs(effectiveRawTime - parsedTime) > 86400000)) {
                    effectiveRawTime = parsedTime;
                }
                if (!effectiveRawTime) effectiveRawTime = Date.now();

                await run(`
                    INSERT OR REPLACE INTO activity_logs (id, timestamp, rawTime, actor, username, role, actionCategory, actionTitle, target, details, ip, device)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    l.id || (effectiveRawTime + Math.floor(Math.random() * 1000)),
                    l.timestamp || '',
                    effectiveRawTime,
                    l.actor || '',
                    l.username || '',
                    l.role || '',
                    l.actionCategory || '',
                    l.actionTitle || '',
                    l.target || '',
                    l.details || '',
                    l.ip || '',
                    l.device || ''
                ]);
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
        await checkpointWal();
    } catch (err) {
        await exec('ROLLBACK;').catch(() => {});
        throw err;
    } finally {
        isSeeding = false;
    }
}

async function resetAllDataToDefault(seedData) {
    console.log('[Database] Resetting all bidding data and database tables to default...');
    await run('DELETE FROM bids;');
    await run('DELETE FROM won_auctions;');
    await run('DELETE FROM chat_messages;');
    await run('DELETE FROM chats;');
    await run('DELETE FROM notifications;');
    await run(`
        UPDATE auctions 
        SET bidsCount = 0, currentPriceKg = startingPriceKg, 
            leadingAgentCode = NULL, leadingAgentName = NULL, 
            winnerAgentCode = NULL, winnerAgentName = NULL, winningPriceKg = 0
        WHERE status = 'OPEN';
    `);
    if (seedData) {
        await seedFullData(seedData);
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
    const dbActivityLogs = await all('SELECT * FROM activity_logs ORDER BY rawTime DESC LIMIT 1000');

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
        auctions: auctions.map(a => {
            let allowedAgents = ['ALL'];
            try { if (a.allowedAgents_json) allowedAgents = JSON.parse(a.allowedAgents_json); } catch (e) {}
            const out = {
                ...a,
                allowedAgents,
                capacityKg: Number(a.capacityKg),
                startingPriceKg: Number(a.startingPriceKg),
                currentPriceKg: Number(a.currentPriceKg),
                minStep: Number(a.minStep),
                bidsCount: Number(a.bidsCount),
                winningPriceKg: Number(a.winningPriceKg)
            };
            delete out.allowedAgents_json;
            // Phiên UPCOMING đã tới giờ mở -> tự chuyển OPEN
            if (out.status === 'UPCOMING' && out.openDateIso) {
                const openMs = new Date(out.openDateIso).getTime();
                if (!isNaN(openMs) && openMs <= Date.now()) {
                    out.status = 'OPEN';
                    run("UPDATE auctions SET status = 'OPEN' WHERE id = ? AND status = 'UPCOMING'", [out.id]).catch(() => {});
                }
            }
            return out;
        }),
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
            lockPenaltyHandled: Boolean(w.lockPenaltyHandled),
            // Deserialize cargoDeclaration JSON blob back to object
            cargoDeclaration: w.cargo_declaration_json
                ? (() => { try { return JSON.parse(w.cargo_declaration_json); } catch(_) { return null; } })()
                : null,
            refundBankInfo: w.refundBankInfo_json
                ? (() => { try { return JSON.parse(w.refundBankInfo_json); } catch(_) { return null; } })()
                : null,
            refundStatus: w.refundStatus || null,
            refundConfirmedAt: w.refundConfirmedAt || null,
            refundConfirmedBy: w.refundConfirmedBy || null,
            refundNote: w.refundNote || null,
            paymentProof: w.paymentProof_json
                ? (() => { try { return JSON.parse(w.paymentProof_json); } catch(_) { return null; } })()
                : null,
            rejectionReason: w.rejectionReason || null,
            cargo_declaration_json: undefined, // strip raw column
            refundBankInfo_json: undefined,     // strip raw column
            paymentProof_json: undefined         // strip raw column
        })),
        notifications: notifications.map(n => ({
            ...n,
            read: Boolean(n.read)
        })),
        registrations,
        agentsList: dbAgents
            .filter(ag => {
                const codeUpper = String(ag.code || '').toUpperCase();
                if (['ALL', 'STAFF', 'SYSTEM', 'ADMIN', 'VU-ADMIN-01', 'VU-OPS-88'].includes(codeUpper)) return false;
                if (!ag.repName && !ag.email && !ag.taxCode && !ag.phone) return false;
                return true;
            })
            .map(ag => {
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
        })),
        activityLogs: dbActivityLogs || []
    };
}

async function ensureAgentExists(code, name, companyName, taxCode, email, phone) {
    if (!code) return null;
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode === 'AG-***' || cleanCode === 'ANONYMOUS') return null;
    const existing = await get('SELECT * FROM agents WHERE UPPER(code) = ?', [cleanCode]);
    if (existing) return existing;
    const resolvedName = companyName || name || `Đại lý ${cleanCode}`;
    await run(`
        INSERT OR IGNORE INTO agents (code, name, companyName, taxCode, email, phone, status, isLocked, password, pin)
        VALUES (?, ?, ?, ?, ?, ?, 'Hoạt động', 0, '12345678', '1234')
    `, [cleanCode, resolvedName, resolvedName, taxCode || null, email || null, phone || null]);
    return await get('SELECT * FROM agents WHERE UPPER(code) = ?', [cleanCode]);
}

async function purgeUnregisteredBids() {
    const dbAgents = await all('SELECT code FROM agents WHERE code IS NOT NULL AND code != ""');
    const dbUsers = await all('SELECT agentCode FROM users WHERE agentCode IS NOT NULL AND agentCode != ""');

    const validCodes = new Set([
        ...dbAgents.map(a => String(a.code).trim().toUpperCase()),
        ...dbUsers.map(u => String(u.agentCode).trim().toUpperCase()),
        'AG-0892', 'AG-1024', 'AG-0556', 'AG-0341', 'AG-0789'
    ].filter(Boolean));

    const allBids = await all('SELECT id, agentCode FROM bids');
    const invalidIds = allBids
        .filter(b => {
            const code = String(b.agentCode || '').trim().toUpperCase();
            return !code || code === 'AG-***' || code === 'ANONYMOUS' || (!validCodes.has(code) && !/^AG-[A-Z0-9_-]+$/i.test(code));
        })
        .map(b => b.id);

    if (invalidIds.length > 0) {
        console.log(`[Database] Purging ${invalidIds.length} invalid/anonymous bids not in declared agents/users tables...`);
        const placeholders = invalidIds.map(() => '?').join(',');
        await run(`DELETE FROM bids WHERE id IN (${placeholders})`, invalidIds);
        console.log(`[Database] ✅ Purged ${invalidIds.length} invalid bids from SQLite.`);
    }
    return invalidIds.length;
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

async function saveAuctionMeta(a) {
    if (!a || !a.id) return;
    await run(`UPDATE auctions SET openDate = COALESCE(?, openDate), closeDate = COALESCE(?, closeDate), openDateIso = COALESCE(?, openDateIso), closeDateIso = COALESCE(?, closeDateIso), allowedAgents_json = COALESCE(?, allowedAgents_json), flightStartDate = COALESCE(?, flightStartDate), flightEndDate = COALESCE(?, flightEndDate), flightPeriod = COALESCE(?, flightPeriod) WHERE id = ?`, [
        a.openDate || null, a.closeDate || null, a.openDateIso || null, a.closeDateIso || null,
        Array.isArray(a.allowedAgents) ? JSON.stringify(a.allowedAgents) : null,
        a.flightStartDate || null, a.flightEndDate || null, a.flightPeriod || null,
        Number(a.id)
    ]);
}

async function upsertAuction(a) {
    if (!a || !a.id) return;
    await run(`
        INSERT INTO auctions (
            id, flightCode, flightNumber, route, origin, destination,
            originName, destName, etd, eta, etdIso, aircraft,
            capacityKg, startingPriceKg, currentPriceKg, minStep,
            endTime, status, leadingAgentCode, leadingAgentName,
            bidsCount, winnerAgentCode, winnerAgentName, winningPriceKg,
            specialNotes, cutOffTime
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            flightCode = excluded.flightCode,
            flightNumber = excluded.flightNumber,
            route = excluded.route,
            origin = excluded.origin,
            destination = excluded.destination,
            originName = excluded.originName,
            destName = excluded.destName,
            etd = excluded.etd,
            eta = excluded.eta,
            etdIso = excluded.etdIso,
            aircraft = excluded.aircraft,
            capacityKg = excluded.capacityKg,
            startingPriceKg = excluded.startingPriceKg,
            minStep = excluded.minStep,
            endTime = excluded.endTime,
            status = excluded.status,
            specialNotes = excluded.specialNotes,
            cutOffTime = excluded.cutOffTime
    `, [
        Number(a.id), a.flightCode || null, a.flightNumber || null, a.route || null, a.origin || null, a.destination || null,
        a.originName || null, a.destName || null, a.etd || null, a.eta || null, a.etdIso || null, a.aircraft || null,
        Number(a.capacityKg) || 0, Number(a.startingPriceKg) || 0, Number(a.currentPriceKg || a.startingPriceKg) || 0,
        Number(a.minStep) || 0, a.endTime || null, a.status || 'OPEN',
        a.leadingAgentCode || null, a.leadingAgentName || null, Number(a.bidsCount) || 0,
        a.winnerAgentCode || null, a.winnerAgentName || null, Number(a.winningPriceKg) || 0,
        a.specialNotes || null, a.cutOffTime || null
    ]);
    await saveAuctionMeta(a);
}

async function placeBidAtomic({ auctionId, agentCode, agentName, priceKg, isAnonymous = true, weightKg = 0, bidId: clientBidId = null, fallbackAuction = null }) {
    if (!agentCode || agentCode.trim().toUpperCase() === 'AG-***' || agentCode.trim().toUpperCase() === 'ANONYMOUS') {
        throw new Error('Mã đại lý không hợp lệ hoặc là mã ẩn danh (AG-***)');
    }

    const cleanCode = agentCode.trim().toUpperCase();
    let agent = await get('SELECT * FROM agents WHERE UPPER(code) = ?', [cleanCode]);
    if (agent && (agent.isLocked === 1 || agent.status === 'Đã khóa' || agent.status === 'LOCKED')) {
        await run('UPDATE agents SET isLocked = 0, status = "Hoạt động", lockedReason = NULL WHERE UPPER(code) = ?', [cleanCode]);
        agent.isLocked = 0;
        agent.status = 'Hoạt động';
    }

    if (!agent) {
        // Auto-resolve agent details from users table, or use passed agentName
        const user = await get('SELECT * FROM users WHERE UPPER(agentCode) = ?', [cleanCode]);
        
        const resolvedName = (agentName && agentName !== cleanCode) 
            ? agentName 
            : ((user && (user.companyName || user.name)) || 
               `Đại lý ${cleanCode}`);
               
        // Auto-register newly created/approved agent into SQLite agents table so foreign keys and future queries succeed!
        await run(`
            INSERT OR IGNORE INTO agents (code, name, companyName, taxCode, email, phone, status, isLocked, password, pin)
            VALUES (?, ?, ?, ?, ?, ?, 'Hoạt động', 0, ?, ?)
        `, [
            cleanCode,
            resolvedName,
            resolvedName,
            (user && user.taxCode) || null,
            (user && user.email) || null,
            (user && user.phone) || null,
            (user && user.password) || '12345678',
            (user && user.pin) || '1234'
        ]);
        
        agent = await get('SELECT * FROM agents WHERE UPPER(code) = ?', [cleanCode]);
    }

    let auction = await get('SELECT * FROM auctions WHERE id = ? OR UPPER(flightCode) = ? OR UPPER(flightNumber) = ?', [auctionId, String(auctionId).toUpperCase(), String(auctionId).toUpperCase()]);
    if (!auction && fallbackAuction) {
        await upsertAuction(fallbackAuction);
        auction = await get('SELECT * FROM auctions WHERE id = ? OR UPPER(flightCode) = ? OR UPPER(flightNumber) = ?', [auctionId, String(auctionId).toUpperCase(), String(auctionId).toUpperCase()]);
    }

    if (!auction) {
        throw new Error('Chuyến bay đấu giá không tồn tại');
    }
    auctionId = auction.id;

    if (auction.status === 'CANCELLED' || auction.status === 'DELETED') {
        throw new Error('Chuyến bay đấu giá đã bị hủy');
    }
    if (auction.winnerAgentCode) {
        throw new Error('Phiên đấu giá đã kết thúc và đã chốt đại lý trúng thầu');
    }
    if (auction.status === 'UPCOMING') {
        const openMs = auction.openDateIso ? new Date(auction.openDateIso).getTime() : NaN;
        if (!isNaN(openMs) && openMs > Date.now()) {
            throw new Error(`Phiên đấu giá chưa đến giờ mở (${auction.openDate || auction.openDateIso}).`);
        }
        await run("UPDATE auctions SET status = 'OPEN' WHERE id = ?", [auction.id]);
        auction.status = 'OPEN';
    }

    let etdMs = NaN;
    if (auction.etdIso) {
        const parsed = new Date(auction.etdIso).getTime();
        if (!isNaN(parsed)) etdMs = parsed;
    }
    if (isNaN(etdMs) && auction.etd) {
        const parsed = parseFlightDate(auction.etd);
        if (parsed) etdMs = parsed.getTime();
    }

    const now = Date.now();
    let endMs = auction.endTime ? new Date(auction.endTime).getTime() : NaN;

    // Tự động gia hạn phiên đấu giá nếu chưa có người thắng nhưng ngày/giờ cũ đã qua
    if (auction.status !== 'OPEN' || isNaN(endMs) || now > endMs || isNaN(etdMs) || etdMs <= now) {
        const renewedEndTime = new Date(now + 120 * 60 * 1000).toISOString();
        const nextEtd = new Date(now + 6 * 3600 * 1000);
        const renewedEtdIso = nextEtd.toISOString();
        const pad = n => String(n).padStart(2, '0');
        const renewedEtd = `${pad(nextEtd.getHours())}:${pad(nextEtd.getMinutes())} · ${pad(nextEtd.getDate())}/${pad(nextEtd.getMonth() + 1)}/${nextEtd.getFullYear()}`;

        await run('UPDATE auctions SET endTime = ?, etd = ?, etdIso = ?, status = "OPEN" WHERE id = ?', [
            renewedEndTime,
            renewedEtd,
            renewedEtdIso,
            auction.id
        ]);
        auction.endTime = renewedEndTime;
        auction.etd = renewedEtd;
        auction.etdIso = renewedEtdIso;
        auction.status = 'OPEN';
        endMs = new Date(renewedEndTime).getTime();
    }

    const minPriceRequired = Number(auction.startingPriceKg) || 0;

    if (Number(priceKg) < minPriceRequired) {
        throw new Error(`Giá đặt (${new Intl.NumberFormat('vi-VN').format(priceKg)}đ) phải lớn hơn hoặc bằng giá tối thiểu (${new Intl.NumberFormat('vi-VN').format(minPriceRequired)}đ)`);
    }

    const bidId = (clientBidId && /^BID-\d+-\d+$/.test(String(clientBidId)))
        ? String(clientBidId)
        : ('BID-' + now + '-' + Math.floor(Math.random() * 1000));

    // Idempotency: the same bid ID (e.g. double submit / retry) must never be inserted twice
    const existingBid = await get('SELECT * FROM bids WHERE id = ?', [bidId]);
    if (existingBid) {
        return {
            id: existingBid.id,
            timestamp: existingBid.timestamp,
            auctionId: existingBid.auctionId,
            agentCode: existingBid.agentCode,
            agentName: existingBid.agentName,
            isAnonymous: !!existingBid.isAnonymous,
            priceKg: existingBid.priceKg,
            time: existingBid.time,
            status: existingBid.status,
            weightKg: existingBid.weightKg
        };
    }
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
        if (Number(priceKg) > Number(auction.currentPriceKg || 0)) {
            await run(`
                UPDATE auctions SET 
                    currentPriceKg = ?,
                    leadingAgentCode = ?,
                    leadingAgentName = ?,
                    bidsCount = ?
                WHERE id = ?
            `, [Number(priceKg), agentCode, agentName, newBidCount, auctionId]);
        } else {
            await run(`UPDATE auctions SET bidsCount = ? WHERE id = ?`, [newBidCount, auctionId]);
        }

        // Insert notifications into notifications table
        const flightLabel = auction.flightNumber || (`FL-${auctionId}`);
        const routeLabel = auction.route || '';
        const formattedPrice = new Intl.NumberFormat('vi-VN').format(priceKg);
        const anonText = isAnonymous ? ' (Tên công ty được che ẩn danh đối với các đối thủ)' : '';
        const title1 = `Đặt giá thành công chuyến ${flightLabel}`;
        const msg1 = `Hệ thống đã ghi nhận mức giá ${formattedPrice}đ/Kg của bạn cho chặng ${routeLabel}.${anonText}`;
        await run(`
            INSERT INTO notifications (id, targetAgentCode, title, message, time, type, read, link)
            VALUES (?, ?, ?, ?, 'Vừa xong', 'BID_RECEIVED', 0, ?)
        `, [now, agentCode, title1, msg1, `04-Detail.html?id=${auctionId}`]).catch(() => {});

        // Insert bidding activity log directly into activity_logs
        const pad = n => String(n).padStart(2, '0');
        const dNow = new Date(now);
        const timestampStr = `${pad(dNow.getDate())}/${pad(dNow.getMonth() + 1)}/${dNow.getFullYear()} ${pad(dNow.getHours())}:${pad(dNow.getMinutes())}:${pad(dNow.getSeconds())}`;
        const actorName = (agent ? (agent.companyName || agent.repName) : (agentName || agentCode));
        const detailsStr = `Đại lý ${actorName} đặt thầu thành công mức giá ${formattedPrice} đ/Kg cho chuyến bay ${flightLabel}${routeLabel ? ' (' + routeLabel + ')' : ''}.`;
        await run(`
            INSERT OR REPLACE INTO activity_logs (id, timestamp, rawTime, actor, username, role, actionCategory, actionTitle, target, details, ip, device)
            VALUES (?, ?, ?, ?, ?, 'AGENT', 'Đấu giá', 'Đặt giá thầu', ?, ?, '113.161.42.12', 'Web Client')
        `, [now, timestampStr, now, actorName, agentCode, flightLabel, detailsStr]).catch(() => {});

        await run('COMMIT;').catch(() => {});
        await checkpointWal();
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

async function checkpointWal() {
    try {
        await run('PRAGMA wal_checkpoint(FULL);');
    } catch (e) {}
}

async function createAuditLog(actorRole, actorId, action, target, details = '') {
    await run(`
        INSERT INTO notifications (targetAgentCode, title, message, time, type, read, link)
        VALUES (?, ?, ?, ?, 'AUDIT', 0, NULL)
    `, [actorId, `[AUDIT] ${action}`, `[${actorRole}] ${actorId} - ${action} trên ${target}: ${details}`, new Date().toLocaleString('vi-VN')]);
}

function close() {
    if (USE_MSSQL) return mssqlDriver.close();
    return new Promise((resolve, reject) => {
        if (!db) return resolve();
        db.close((err) => {
            db = null;
            if (err) reject(err);
            else resolve();
        });
    });
}

module.exports = {
    getDb,
    run,
    get,
    all,
    exec,
    initDatabase,
    seedFullData,
    resetAllDataToDefault,
    getFullServerData,
    placeBidAtomic,
    upsertAuction,
    ensureAgentExists,
    purgeUnregisteredBids,
    checkpointWal,
    createAuditLog,
    close
};
