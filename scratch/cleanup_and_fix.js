const db = require('../db');
const fs = require('fs');
const path = require('path');

const SERVER_DATA_PATH = path.join(__dirname, '..', 'server_data.json');

async function runCleanup() {
    await db.initDatabase();

    console.log('=== STEP 1: CLEANING CLOSED AUCTIONS WITH 0 BIDS ===');
    // Find closed auctions with 0 bids
    const closedNoBids = await db.all(`
        SELECT a.id, a.flightNumber, a.status, a.bidsCount
        FROM auctions a
        LEFT JOIN bids b ON a.id = b.auctionId
        WHERE a.status = 'CLOSED'
        GROUP BY a.id
        HAVING COUNT(b.id) = 0
    `);
    console.log('Closed auctions with 0 bids to delete:', closedNoBids);

    const deleteIds = closedNoBids.map(a => a.id);
    if (deleteIds.length > 0) {
        const placeholders = deleteIds.map(() => '?').join(',');
        await db.run(`DELETE FROM auctions WHERE id IN (${placeholders})`, deleteIds);
        console.log(`Deleted ${deleteIds.length} closed 0-bid auctions from database.sqlite`);
    }

    console.log('\n=== STEP 2: CLEANING INVOICES (won_auctions) FOR NON-EXISTENT AUCTIONS ===');
    const orphanInvoices = await db.all(`
        SELECT w.wonId, w.auctionId, w.flightNumber, w.agentCode
        FROM won_auctions w
        LEFT JOIN auctions a ON w.auctionId = a.id
        WHERE a.id IS NULL
    `);
    console.log('Orphan invoices to delete:', orphanInvoices);

    const deleteInvoiceIds = orphanInvoices.map(w => w.wonId);
    if (deleteInvoiceIds.length > 0) {
        const placeholders = deleteInvoiceIds.map(() => '?').join(',');
        await db.run(`DELETE FROM won_auctions WHERE wonId IN (${placeholders})`, deleteInvoiceIds);
        console.log(`Deleted ${deleteInvoiceIds.length} orphan invoices from database.sqlite`);
    }

    console.log('\n=== STEP 3: CLEANING TEST AGENT CHATS ===');
    const testChats = await db.all(`
        SELECT id, agentCode, agentName FROM chats
        WHERE agentCode LIKE 'AG-TEST-%' OR agentName LIKE '%Test%'
    `);
    console.log('Test chats to delete:', testChats.length, testChats);

    const deleteChatIds = testChats.map(c => c.id);
    if (deleteChatIds.length > 0) {
        const placeholders = deleteChatIds.map(() => '?').join(',');
        await db.run(`DELETE FROM chat_messages WHERE chatId IN (${placeholders})`, deleteChatIds);
        await db.run(`DELETE FROM chats WHERE id IN (${placeholders})`, deleteChatIds);
        console.log(`Deleted ${deleteChatIds.length} test chats and their messages from database.sqlite`);
    }

    console.log('\n=== STEP 4: UPDATING server_data.json ===');
    if (fs.existsSync(SERVER_DATA_PATH)) {
        const serverData = JSON.parse(fs.readFileSync(SERVER_DATA_PATH, 'utf8'));

        const remainingAuctionIds = new Set((await db.all('SELECT id FROM auctions')).map(a => Number(a.id)));
        const remainingWonAuctions = await db.all('SELECT * FROM won_auctions');
        const remainingChats = await db.all('SELECT * FROM chats');
        const remainingChatMessages = await db.all('SELECT * FROM chat_messages');

        // Filter auctions
        if (Array.isArray(serverData.auctions)) {
            const initialCount = serverData.auctions.length;
            serverData.auctions = serverData.auctions.filter(a => remainingAuctionIds.has(Number(a.id)));
            console.log(`server_data.json auctions: ${initialCount} -> ${serverData.auctions.length}`);
        }

        // Filter wonAuctions
        if (Array.isArray(serverData.wonAuctions)) {
            const initialCount = serverData.wonAuctions.length;
            const validWonIds = new Set(remainingWonAuctions.map(w => w.wonId));
            serverData.wonAuctions = serverData.wonAuctions.filter(w => validWonIds.has(w.wonId) && remainingAuctionIds.has(Number(w.auctionId)));
            console.log(`server_data.json wonAuctions: ${initialCount} -> ${serverData.wonAuctions.length}`);
        }

        // Filter chats
        if (Array.isArray(serverData.chats)) {
            const initialCount = serverData.chats.length;
            const validChatIds = new Set(remainingChats.map(c => c.id));
            serverData.chats = serverData.chats.filter(c => validChatIds.has(c.id) && !c.agentCode.startsWith('AG-TEST-') && !c.agentName.includes('Test'));
            console.log(`server_data.json chats: ${initialCount} -> ${serverData.chats.length}`);
        }

        fs.writeFileSync(SERVER_DATA_PATH, JSON.stringify(serverData, null, 2), 'utf8');
        console.log('Successfully updated server_data.json!');
    }

    console.log('\n=== CLEANUP COMPLETED SUCCESSFULLY ===');
}

runCleanup().catch(console.error);
