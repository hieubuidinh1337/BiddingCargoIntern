const db = require('../db.js');

async function testNewAuctionVisibility() {
    await db.initDatabase();
    let serverData = await db.getFullServerData();

    // Create a new auction
    const maxId = Math.max(...(serverData.auctions || []).map(a => a.id || 0), 0);
    const newAuctionId = maxId + 1;
    const newAuction = {
        id: newAuctionId,
        flightCode: `FL-VU999-260917`,
        flightNumber: 'VU999',
        route: 'PQC - SGN',
        origin: 'PQC',
        destination: 'SGN',
        originName: 'Phú Quốc',
        destName: 'TP. Hồ Chí Minh',
        etd: '20:00 · 18/09/2026',
        eta: '21:00 · 18/09/2026',
        etdIso: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        aircraft: 'Airbus A321neo Cargo',
        capacityKg: 3000,
        startingPriceKg: 20000,
        currentPriceKg: 20000,
        minStep: 500,
        endTime: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
        status: 'OPEN',
        leadingAgentCode: null,
        leadingAgentName: null,
        bidsCount: 0,
        specialNotes: 'Phiên thử nghiệm tính hiển thị đại lý',
        cutOffTime: '17:00 · 18/09/2026'
    };

    serverData.auctions.unshift(newAuction);
    await db.seedFullData(serverData);
    console.log(`[Test] Created auction ID ${newAuctionId} (VU999 - PQC - SGN) in DB`);

    // Verify it is in database
    const freshData = await db.getFullServerData();
    const found = freshData.auctions.find(a => a.id === newAuctionId);
    if (found) {
        console.log(`[PASS] Auction ID ${newAuctionId} successfully retrieved in serverData!`);
    } else {
        console.error(`[FAIL] Auction ID ${newAuctionId} NOT found in serverData!`);
    }
}

testNewAuctionVisibility().catch(console.error);
