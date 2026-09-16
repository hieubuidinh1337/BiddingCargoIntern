const db = require('../db');

async function checkBids() {
    await db.initDatabase();

    const auctions = await db.all('SELECT * FROM auctions');
    const bids = await db.all('SELECT * FROM bids');
    const wonAuctions = await db.all('SELECT * FROM won_auctions');

    console.log('=== AUCTIONS ===');
    auctions.forEach(a => {
        const aBids = bids.filter(b => String(b.auctionId) === String(a.id));
        console.log(`Auction ID ${a.id} | Flight: ${a.flightNumber} | Status: ${a.status} | bidsCount field: ${a.bidsCount} | Winner: ${a.winnerAgentCode} | Actual bids in bids table: ${aBids.length}`);
    });

    console.log('\n=== WON AUCTIONS (INVOICES) ===');
    wonAuctions.forEach(w => {
        const a = auctions.find(a => String(a.id) === String(w.auctionId));
        console.log(`WonAuction ID: ${w.id} | code: ${w.code} | auctionId: ${w.auctionId} | flightNumber in invoice: ${w.flightNumber} | Agent: ${w.winnerAgentCode} => Auction exists? ${a ? 'YES (ID: ' + a.id + ', Flight: ' + a.flightNumber + ', Status: ' + a.status + ')' : 'NO (ORPHAN)'}`);
    });
}

checkBids().catch(console.error);
