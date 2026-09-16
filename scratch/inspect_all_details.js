const db = require('../db');
const fs = require('fs');

async function checkDetails() {
    await db.initDatabase();

    const auctions = await db.all('SELECT * FROM auctions');
    const wonAuctions = await db.all('SELECT * FROM won_auctions');
    const bids = await db.all('SELECT * FROM bids');
    const chats = await db.all('SELECT * FROM chats');
    const chatMessages = await db.all('SELECT * FROM chat_messages');

    console.log('=== ALL AUCTIONS ===');
    console.table(auctions.map(a => ({
        id: a.id,
        flightNumber: a.flightNumber,
        status: a.status,
        bidsCount: a.bidsCount,
        winnerAgentCode: a.winnerAgentCode,
        winningBidAmount: a.winningBidAmount
    })));

    console.log('\n=== ALL BIDS ===');
    console.table(bids);

    console.log('\n=== ALL WON AUCTIONS (INVOICES) ===');
    console.table(wonAuctions);

    console.log('\n=== CHATS COUNT ===');
    console.log('Chats count:', chats.length);
    console.log('Chat messages count:', chatMessages.length);
}

checkDetails().catch(console.error);
