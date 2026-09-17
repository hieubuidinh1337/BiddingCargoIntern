const http = require('http');
const db = require('../db.js');

// Start server inline if not running
async function testRealtimeBidding() {
    await db.initDatabase();

    // Start server on 8085
    delete require.cache[require.resolve('../server.js')];
    const serverProcess = require('../server.js');

    // Give server 500ms to listen
    await new Promise(r => setTimeout(r, 500));

    function makeRequest(path, method = 'GET', body = null) {
        return new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: 8085,
                path: path,
                method: method,
                headers: { 'Content-Type': 'application/json' }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); } catch(e) { resolve(data); }
                });
            });
            req.on('error', reject);
            if (body) req.write(JSON.stringify(body));
            req.end();
        });
    }

    console.log('--- TESTING REALTIME BIDDING LOG & ADMIN SYNC ---');

    // Step 1: Admin gets data to find an OPEN auction
    const adminData1 = await makeRequest('/api/data?role=admin');
    const openAuction = adminData1.auctions.find(a => a.status === 'OPEN') || adminData1.auctions[0];
    console.log(`Targeting Open Auction ID: ${openAuction.id} (${openAuction.flightNumber})`);

    const startPrice = openAuction.startingPriceKg || 18000;
    const currentPrice = openAuction.currentPriceKg || startPrice;
    const bid1Price = currentPrice + (openAuction.minStep || 500);
    const bid2Price = bid1Price + (openAuction.minStep || 500);

    // Step 2: Agent A (AG-0892) places bid 1
    console.log(`\n1. Agent A (AG-0892) placing bid ${bid1Price}đ...`);
    const place1 = await makeRequest('/api/bids/place', 'POST', {
        auctionId: openAuction.id,
        agentCode: 'AG-0892',
        agentName: 'ABC Logistics',
        priceKg: bid1Price,
        isAnonymous: true,
        weightKg: openAuction.capacityKg
    });
    console.log('Place 1 Response:', place1.message || place1);

    // Step 3: Agent B (AG-1024) places bid 2
    console.log(`\n2. Agent B (AG-1024) placing bid ${bid2Price}đ...`);
    const place2 = await makeRequest('/api/bids/place', 'POST', {
        auctionId: openAuction.id,
        agentCode: 'AG-1024',
        agentName: 'Vinatrans',
        priceKg: bid2Price,
        isAnonymous: true,
        weightKg: openAuction.capacityKg
    });
    console.log('Place 2 Response:', place2.message || place2);

    // Step 4: Check Agent A's view (GET /api/data?agentCode=AG-0892)
    console.log(`\n3. Agent A (AG-0892) fetching GET /api/data?agentCode=AG-0892...`);
    const agentAData = await makeRequest('/api/data?agentCode=AG-0892');
    const auctionA = agentAData.auctions.find(a => a.id === openAuction.id);
    const bidsA = agentAData.bids.filter(b => b.auctionId === openAuction.id);

    console.log(`Agent A sees Auction ${auctionA.flightNumber}: currentPriceKg = ${auctionA.currentPriceKg}, bidsCount = ${bidsA.length}`);
    bidsA.forEach(b => console.log(`  - Bidder: ${b.agentCode} (${b.agentName}) | Price: ${b.priceKg}đ | Status: ${b.status}`));

    // Step 5: Check Agent B's view (GET /api/data?agentCode=AG-1024)
    console.log(`\n4. Agent B (AG-1024) fetching GET /api/data?agentCode=AG-1024...`);
    const agentBData = await makeRequest('/api/data?agentCode=AG-1024');
    const auctionB = agentBData.auctions.find(a => a.id === openAuction.id);
    const bidsB = agentBData.bids.filter(b => b.auctionId === openAuction.id);

    console.log(`Agent B sees Auction ${auctionB.flightNumber}: currentPriceKg = ${auctionB.currentPriceKg}, bidsCount = ${bidsB.length}`);
    bidsB.forEach(b => console.log(`  - Bidder: ${b.agentCode} (${b.agentName}) | Price: ${b.priceKg}đ | Status: ${b.status}`));

    // Step 6: Check Admin's view (GET /api/data?role=admin)
    console.log(`\n5. Admin fetching GET /api/data?role=admin...`);
    const adminData2 = await makeRequest('/api/data?role=admin');
    const auctionAdmin = adminData2.auctions.find(a => a.id === openAuction.id);
    const bidsAdmin = adminData2.bids.filter(b => b.auctionId === openAuction.id);

    console.log(`Admin sees Auction ${auctionAdmin.flightNumber}: currentPriceKg = ${auctionAdmin.currentPriceKg}, bidsCount = ${bidsAdmin.length}`);
    bidsAdmin.forEach(b => console.log(`  - Bidder: ${b.agentCode} (${b.agentName}) | Price: ${b.priceKg}đ | Status: ${b.status}`));

    // Assertions
    const passA = bidsA.length >= 2 && bidsA.some(b => b.agentCode === 'AG-0892') && bidsA.some(b => b.agentCode === 'AG-***');
    const passB = bidsB.length >= 2 && bidsB.some(b => b.agentCode === 'AG-1024') && bidsB.some(b => b.agentCode === 'AG-***');
    const passAdmin = bidsAdmin.length >= 2 && bidsAdmin.some(b => b.agentCode === 'AG-0892') && bidsAdmin.some(b => b.agentCode === 'AG-1024');

    if (passA && passB && passAdmin) {
        console.log('\n🎉 ALL CHECKS PASSED! Bidding logs are synced, competitor identities are anonymized for agents, and Admin sees full real-time bid history!');
    } else {
        console.error('\n❌ TEST FAILED!', { passA, passB, passAdmin });
    }

    process.exit(0);
}

testRealtimeBidding().catch(err => {
    console.error(err);
    process.exit(1);
});
