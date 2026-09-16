const db = require('../db.js');
const fs = require('fs');
const path = require('path');

async function clean() {
    await db.initDatabase();
    console.log('[Cleanup] Removing test pollution from SQLite database...');
    
    const res1 = await db.run("DELETE FROM won_auctions WHERE wonId LIKE 'TEST_%' OR wonId LIKE 'WON_PAID_TEST_%'");
    console.log('[Cleanup] Deleted from won_auctions:', res1.changes);

    const res2 = await db.run("DELETE FROM bids WHERE id LIKE 'TEST_%' OR id LIKE 'TEST_BID_%'");
    console.log('[Cleanup] Deleted from bids:', res2.changes);

    const seedFile = path.join(__dirname, 'server_data.json');
    if (fs.existsSync(seedFile)) {
        const seedData = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
        if (Array.isArray(seedData.wonAuctions)) {
            const beforeCount = seedData.wonAuctions.length;
            seedData.wonAuctions = seedData.wonAuctions.filter(w => !String(w.wonId).startsWith('TEST_') && !String(w.wonId).startsWith('WON_PAID_TEST_'));
            console.log(`[Cleanup] Filtered wonAuctions in server_data.json: ${beforeCount} -> ${seedData.wonAuctions.length}`);
        }
        if (Array.isArray(seedData.bids)) {
            const beforeBids = seedData.bids.length;
            seedData.bids = seedData.bids.filter(b => !String(b.id).startsWith('TEST_'));
            console.log(`[Cleanup] Filtered bids in server_data.json: ${beforeBids} -> ${seedData.bids.length}`);
        }
        fs.writeFileSync(seedFile, JSON.stringify(seedData, null, 2), 'utf8');
        console.log('[Cleanup] Cleaned server_data.json successfully!');
    }

    console.log('[Cleanup] Database is now 100% clean of test pollution.');
    process.exit(0);
}

clean().catch(err => {
    console.error('[Cleanup] Error:', err);
    process.exit(1);
});
