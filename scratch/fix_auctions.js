const db = require('../db.js');
const fs = require('fs');
const path = require('path');

async function fix() {
    await db.initDatabase();
    console.log('[Fix] Reconciling auctions and won_auctions data...');

    // 1. Fix auction 108 in SQLite
    await db.run("UPDATE auctions SET flightNumber = 'VU136', flightCode = 'FL-VU136-260915' WHERE id = 108");
    console.log('[Fix] Updated auction 108 flightNumber to VU136');

    // 2. Ensure historical won_auctions have corresponding CLOSED auction records in SQLite
    const wonList = await db.all('SELECT * FROM won_auctions');
    for (const w of wonList) {
        const existingAuc = await db.get('SELECT * FROM auctions WHERE id = ?', [w.auctionId]);
        if (!existingAuc) {
            console.log(`[Fix] Creating missing closed auction #${w.auctionId} for flight ${w.flightNumber}...`);
            await db.run(`
                INSERT OR REPLACE INTO auctions
                (id, flightCode, flightNumber, route, origin, destination, originName, destName, etd, eta, etdIso, aircraft, capacityKg, startingPriceKg, currentPriceKg, minStep, endTime, status, leadingAgentCode, leadingAgentName, bidsCount, winnerAgentCode, winnerAgentName, winningPriceKg, specialNotes, cutOffTime)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                w.auctionId,
                'FL-' + w.flightNumber + '-CLOSED',
                w.flightNumber,
                w.route || 'SGN - HAN',
                (w.route || '').split(' - ')[0] || 'SGN',
                (w.route || '').split(' - ')[1] || 'HAN',
                'TP. Hồ Chí Minh',
                'Hà Nội',
                '10:00 · 15/08/2026',
                '12:15 · 15/08/2026',
                '2026-08-15T03:00:00.000Z',
                'Airbus A321-200 Cargo',
                w.capacityKg || 3000,
                w.priceKg || 18000,
                w.priceKg || 18000,
                500,
                '2026-08-15T03:00:00.000Z',
                'CLOSED',
                w.agentCode,
                w.agentCode,
                1,
                w.agentCode,
                w.agentCode,
                w.priceKg || 18000,
                'Phiên đã hoàn tất trúng thầu.',
                w.cutOffTime || 'Trước ETD 3h'
            ]);
        } else if (existingAuc.flightNumber !== w.flightNumber) {
            console.log(`[Fix] Mismatch in auction #${w.auctionId}: auction has ${existingAuc.flightNumber} vs won_auction has ${w.flightNumber}. Syncing auction to ${w.flightNumber}...`);
            await db.run('UPDATE auctions SET flightNumber = ?, flightCode = ? WHERE id = ?', [
                w.flightNumber,
                'FL-' + w.flightNumber + '-CLOSED',
                w.auctionId
            ]);
        }
    }

    // 3. Update server_data.json
    const seedFile = path.join(__dirname, '../server_data.json');
    if (fs.existsSync(seedFile)) {
        const fullData = await db.getFullServerData();
        fs.writeFileSync(seedFile, JSON.stringify(fullData, null, 2), 'utf8');
        console.log('[Fix] Updated server_data.json with clean SQLite state.');
    }

    console.log('[Fix] Done reconciling auctions!');
    process.exit(0);
}

fix().catch(err => {
    console.error('[Fix] Error:', err);
    process.exit(1);
});
