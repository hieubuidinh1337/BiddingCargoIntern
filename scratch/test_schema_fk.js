const db = require('../db.js');

async function testFkSchema() {
    console.log('=== MIGRATING DATABASE SCHEMA TO FULL FOREIGN KEY CONSTRAINTS ===');
    const sqliteDb = db.getDb();

    // Disable foreign keys during schema reconstruction
    await db.run('PRAGMA foreign_keys = OFF;');

    // 1. Ensure all agentCodes referenced in users, chats, bids, won_auctions exist in agents table
    await db.run(`
        INSERT OR IGNORE INTO agents (code, name, companyName, status)
        SELECT DISTINCT agentCode, 'Quản Trị Viên VU', 'Vietravel Airlines HQ', 'ACTIVE'
        FROM users WHERE agentCode IS NOT NULL AND agentCode != ''
    `);

    await db.run(`
        INSERT OR IGNORE INTO agents (code, name, companyName, status)
        SELECT DISTINCT agentCode, 'Đại Lý Hợp Tác', 'Đại lý Cargo', 'ACTIVE'
        FROM chats WHERE agentCode IS NOT NULL AND agentCode != ''
    `);

    await db.run(`
        INSERT OR IGNORE INTO agents (code, name, companyName, status)
        SELECT DISTINCT agentCode, 'Đại Lý Thắng Thầu', 'Đại lý Cargo', 'ACTIVE'
        FROM won_auctions WHERE agentCode IS NOT NULL AND agentCode != ''
    `);

    await db.run(`
        INSERT OR IGNORE INTO agents (code, name, companyName, status)
        SELECT DISTINCT targetAgentCode, 'Đại Lý Thông Báo', 'Đại lý Cargo', 'ACTIVE'
        FROM notifications WHERE targetAgentCode IS NOT NULL AND targetAgentCode != ''
    `);

    // Ensure dummy auctions exist for historical won_auctions if needed
    const historicalAuctions = await db.all('SELECT DISTINCT auctionId FROM won_auctions WHERE auctionId IS NOT NULL');
    for (const item of historicalAuctions) {
        if (item.auctionId) {
            await db.run(`
                INSERT OR IGNORE INTO auctions (id, flightNumber, route, status, startingPriceKg, currentPriceKg)
                VALUES (?, 'VU-HIST', 'SGN - HAN', 'CLOSED', 18000, 22000)
            `, [item.auctionId]);
        }
    }

    // Backup existing tables into temporary memory structures
    const auctionsData = await db.all('SELECT * FROM auctions');
    const bidsData = await db.all('SELECT * FROM bids');
    const wonData = await db.all('SELECT * FROM won_auctions');
    const notifsData = await db.all('SELECT * FROM notifications');
    const regsData = await db.all('SELECT * FROM registrations');
    const usersData = await db.all('SELECT * FROM users');
    const agentsData = await db.all('SELECT * FROM agents');
    const chatsData = await db.all('SELECT * FROM chats');
    const chatMsgsData = await db.all('SELECT * FROM chat_messages');
    const emailLogsData = await db.all('SELECT * FROM email_logs');
    const settingsData = await db.all('SELECT * FROM settings');

    // Drop old tables
    await db.exec(`
        DROP TABLE IF EXISTS chat_messages;
        DROP TABLE IF EXISTS chats;
        DROP TABLE IF EXISTS bids;
        DROP TABLE IF EXISTS won_auctions;
        DROP TABLE IF EXISTS notifications;
        DROP TABLE IF EXISTS users;
        DROP TABLE IF EXISTS auctions;
        DROP TABLE IF EXISTS agents;
        DROP TABLE IF EXISTS registrations;
        DROP TABLE IF EXISTS email_logs;
        DROP TABLE IF EXISTS settings;
    `);

    // Create new Relational Schema with Full Explicit Foreign Keys
    await db.exec(`
        CREATE TABLE agents (
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

        CREATE TABLE users (
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

        CREATE TABLE auctions (
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
            FOREIGN KEY(leadingAgentCode) REFERENCES agents(code) ON DELETE SET NULL ON UPDATE CASCADE,
            FOREIGN KEY(winnerAgentCode) REFERENCES agents(code) ON DELETE SET NULL ON UPDATE CASCADE
        );

        CREATE TABLE bids (
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

        CREATE TABLE won_auctions (
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
            momoExpiresAt TEXT,
            FOREIGN KEY(auctionId) REFERENCES auctions(id) ON DELETE SET NULL ON UPDATE CASCADE,
            FOREIGN KEY(agentCode) REFERENCES agents(code) ON DELETE CASCADE ON UPDATE CASCADE
        );

        CREATE TABLE notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            targetAgentCode TEXT,
            title TEXT,
            message TEXT,
            time TEXT,
            type TEXT,
            read INTEGER DEFAULT 0,
            link TEXT,
            FOREIGN KEY(targetAgentCode) REFERENCES agents(code) ON DELETE SET NULL ON UPDATE CASCADE
        );

        CREATE TABLE chats (
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

        CREATE TABLE chat_messages (
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

        CREATE TABLE registrations (
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

        CREATE TABLE email_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            toAddress TEXT,
            type TEXT,
            subject TEXT,
            messageId TEXT,
            isRealSmtp INTEGER DEFAULT 0,
            previewUrl TEXT,
            sentAt TEXT
        );

        CREATE TABLE settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE INDEX idx_bids_auctionId ON bids(auctionId);
        CREATE INDEX idx_bids_agentCode ON bids(agentCode);
        CREATE INDEX idx_won_agentCode ON won_auctions(agentCode);
        CREATE INDEX idx_chats_agentCode ON chats(agentCode);
        CREATE INDEX idx_chat_msgs_chatId ON chat_messages(chatId);
    `);

    // Restore data into new relational tables
    for (const ag of agentsData) {
        await db.run(`INSERT OR REPLACE INTO agents (code, name, companyName, taxCode, email, phone, status, isLocked, lockedReason, lockedAt, unlockedAt, password, pin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ag.code, ag.name, ag.companyName, ag.taxCode, ag.email, ag.phone, ag.status, ag.isLocked, ag.lockedReason, ag.lockedAt, ag.unlockedAt, ag.password, ag.pin]);
    }

    for (const a of auctionsData) {
        await db.run(`INSERT OR REPLACE INTO auctions (id, flightCode, flightNumber, route, origin, destination, originName, destName, etd, eta, etdIso, aircraft, capacityKg, startingPriceKg, currentPriceKg, minStep, endTime, status, leadingAgentCode, leadingAgentName, bidsCount, winnerAgentCode, winnerAgentName, winningPriceKg, specialNotes, cutOffTime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [a.id, a.flightCode, a.flightNumber, a.route, a.origin, a.destination, a.originName, a.destName, a.etd, a.eta, a.etdIso, a.aircraft, a.capacityKg, a.startingPriceKg, a.currentPriceKg, a.minStep, a.endTime, a.status, a.leadingAgentCode, a.leadingAgentName, a.bidsCount, a.winnerAgentCode, a.winnerAgentName, a.winningPriceKg, a.specialNotes, a.cutOffTime]);
    }

    for (const u of usersData) {
        await db.run(`INSERT OR REPLACE INTO users (id, username, agentCode, password, pin, role, fullName, email, companyName, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [u.id, u.username, u.agentCode, u.password, u.pin, u.role, u.fullName, u.email, u.companyName, u.status]);
    }

    for (const b of bidsData) {
        await db.run(`INSERT OR REPLACE INTO bids (id, timestamp, auctionId, agentCode, agentName, isAnonymous, priceKg, time, status, weightKg) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [b.id, b.timestamp, b.auctionId, b.agentCode, b.agentName, b.isAnonymous, b.priceKg, b.time, b.status, b.weightKg]);
    }

    for (const w of wonData) {
        await db.run(`INSERT OR REPLACE INTO won_auctions (wonId, auctionId, agentCode, flightNumber, route, capacityKg, priceKg, totalAmountVND, paymentDeadline, paymentStatus, paidAt, awbNumber, cutOffTime, warehouse, lockWaivedByAdmin, lockPenaltyHandled, momoOrderId, momoRequestId, momoOrderInfo, momoPayUrl, momoQrCodeUrl, momoDeeplink, momoTransId, momoPaidAt, momoCreatedAt, momoExpiresAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [w.wonId, w.auctionId, w.agentCode, w.flightNumber, w.route, w.capacityKg, w.priceKg, w.totalAmountVND, w.paymentDeadline, w.paymentStatus, w.paidAt, w.awbNumber, w.cutOffTime, w.warehouse, w.lockWaivedByAdmin, w.lockPenaltyHandled, w.momoOrderId, w.momoRequestId, w.momoOrderInfo, w.momoPayUrl, w.momoQrCodeUrl, w.momoDeeplink, w.momoTransId, w.momoPaidAt, w.momoCreatedAt, w.momoExpiresAt]);
    }

    for (const n of notifsData) {
        await db.run(`INSERT OR REPLACE INTO notifications (id, targetAgentCode, title, message, time, type, read, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [n.id, n.targetAgentCode, n.title, n.message, n.time, n.type, n.read, n.link]);
    }

    for (const r of regsData) {
        await db.run(`INSERT OR REPLACE INTO registrations (regId, companyName, taxCode, address, field, repName, repPosition, email, phone, documents, status, submittedAt, rejectionReason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.regId, r.companyName, r.taxCode, r.address, r.field, r.repName, r.repPosition, r.email, r.phone, r.documents, r.status, r.submittedAt, r.rejectionReason]);
    }

    for (const c of chatsData) {
        await db.run(`INSERT OR REPLACE INTO chats (id, agentCode, agentName, status, createdAt, closedAt, assignedTo, assignedName) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [c.id, c.agentCode, c.agentName, c.status, c.createdAt, c.closedAt, c.assignedTo, c.assignedName]);
    }

    for (const cm of chatMsgsData) {
        await db.run(`INSERT OR REPLACE INTO chat_messages (id, chatId, sender, senderName, text, fileUrl, fileName, fileType, timestamp, read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cm.id, cm.chatId, cm.sender, cm.senderName, cm.text, cm.fileUrl, cm.fileName, cm.fileType, cm.timestamp, cm.read]);
    }

    for (const el of emailLogsData) {
        await db.run(`INSERT OR REPLACE INTO email_logs (id, toAddress, type, subject, messageId, isRealSmtp, previewUrl, sentAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [el.id, el.toAddress, el.type, el.subject, el.messageId, el.isRealSmtp, el.previewUrl, el.sentAt]);
    }

    for (const s of settingsData) {
        await db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [s.key, s.value]);
    }

    // Enable foreign keys
    await db.run('PRAGMA foreign_keys = ON;');

    // Run PRAGMA foreign_key_check to verify 0 violations
    const fkErrors = await db.all('PRAGMA foreign_key_check;');
    console.log('\n🔍 PRAGMA foreign_key_check results:');
    if (fkErrors.length === 0) {
        console.log('🎉 100% PERFECT! Zero foreign key violations in SQLite database!');
    } else {
        console.warn('⚠️ Foreign key violations found:', fkErrors);
    }

    process.exit(0);
}

testFkSchema().catch(err => {
    console.error('❌ Error testing FK schema:', err);
    process.exit(1);
});
