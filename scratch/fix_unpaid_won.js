const db = require('../db');
const fs = require('fs');
const path = require('path');

const SERVER_DATA_PATH = path.join(__dirname, '..', 'server_data.json');

async function fixUnpaid() {
    await db.initDatabase();

    // Set WON-20260909-08 (auction 108) to UNPAID so HP-02 has an UNPAID invoice to test MoMo QR creation
    await db.run(`UPDATE won_auctions SET paymentStatus = 'UNPAID', paidAt = NULL WHERE wonId = 'WON-20260909-08' OR auctionId = 108`);

    if (fs.existsSync(SERVER_DATA_PATH)) {
        const serverData = JSON.parse(fs.readFileSync(SERVER_DATA_PATH, 'utf8'));
        if (Array.isArray(serverData.wonAuctions)) {
            serverData.wonAuctions.forEach(w => {
                if (w.wonId === 'WON-20260909-08' || String(w.auctionId) === '108') {
                    w.paymentStatus = 'UNPAID';
                    w.paidAt = null;
                }
            });
        }
        fs.writeFileSync(SERVER_DATA_PATH, JSON.stringify(serverData, null, 2), 'utf8');
    }

    console.log('Successfully set auction 108 invoice to UNPAID for MoMo test suite compatibility!');
}

fixUnpaid().catch(console.error);
