const db = require('../db');
const fs = require('fs');
const path = require('path');

async function inspect() {
    await db.initDatabase();

    console.log('--- CLOSED AUCTIONS WITH 0 BIDS OR NO WINNER ---');
    const closedNoBids = await db.all(`
      SELECT id, flightNumber, status, bidsCount, winnerAgentCode 
      FROM auctions 
      WHERE status = 'CLOSED' AND (bidsCount = 0 OR bidsCount IS NULL OR winnerAgentCode IS NULL OR winnerAgentCode = '')
    `);
    console.log(closedNoBids);

    console.log('\n--- ALL WON AUCTIONS (INVOICES) AND THEIR MATCHING AUCTION ---');
    const wonAuctions = await db.all(`SELECT * FROM won_auctions`);
    const allAuctions = await db.all(`SELECT id, flightNumber, status FROM auctions`);
    const auctionMap = new Map();
    allAuctions.forEach(a => auctionMap.set(String(a.id), a));

    const orphanInvoices = [];
    wonAuctions.forEach(w => {
      const matching = auctionMap.get(String(w.auctionId));
      console.log(`Invoice ID ${w.id} (AuctionID: ${w.auctionId}, Flight: ${w.flightNumber}, Agent: ${w.winnerAgentCode}): matching auction =>`, matching ? `Found ID ${matching.id} (${matching.flightNumber})` : 'NOT FOUND!');
      if (!matching) {
        orphanInvoices.push(w);
      }
    });
    console.log('\nOrphan invoices count:', orphanInvoices.length, orphanInvoices);

    console.log('\n--- CHATS SUMMARY ---');
    const chats = await db.all(`SELECT id, agentCode, agentName, status FROM chats`);
    console.log('Total chats in DB:', chats.length);
    const testChats = chats.filter(c => (c.agentName && c.agentName.includes('Test')) || (c.agentCode && c.agentCode.includes('TEST')));
    console.log('Test chats count:', testChats.length);
    console.log(testChats);
}

inspect().catch(console.error);
