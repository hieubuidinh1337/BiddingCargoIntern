const db = require('../db.js');

async function cleanup() {
    await db.initDatabase();
    let data = await db.getFullServerData();
    data.auctions = data.auctions.filter(a => a.id !== 110 && a.flightNumber !== 'VU999');
    await db.seedFullData(data);
    console.log('[Cleanup] Removed test auction 110');
}

cleanup().catch(console.error);
