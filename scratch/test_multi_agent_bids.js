const http = require('http');

async function runTest() {
    console.log('--- TESTING MULTI-AGENT BIDDING DATA MERGING ---');

    // 1. Start server process or make HTTP calls if server running, or test HTTP endpoints
    const { spawn } = require('child_process');
    const serverProc = spawn('node', ['server.js'], { cwd: process.cwd(), stdio: 'pipe' });

    // Wait for server to start on port 8085
    await new Promise(resolve => setTimeout(resolve, 2500));

    try {
        // Fetch current auctions to get open auction ID
        const initData = await makeRequest('/api/data?role=admin', 'GET');
        const openAuction = initData.auctions.find(a => a.status === 'OPEN');
        if (!openAuction) {
            console.error('No OPEN auction found');
            serverProc.kill();
            return;
        }

        const auctionId = openAuction.id;
        console.log(`Targeting Open Auction ID: ${auctionId} (${openAuction.flightNumber})`);

        // Step 1: Agent A (AG-0892) places bid at 25,000
        const bidA = {
            id: Date.now(),
            timestamp: Date.now(),
            auctionId: auctionId,
            agentCode: 'AG-0892',
            agentName: 'Agent A Corp',
            isAnonymous: true,
            priceKg: 25000,
            status: 'HIGHEST',
            weightKg: 1000
        };

        console.log('\n[Step 1] Agent A (AG-0892) placing bid of 25,000...');
        await makeRequest('/api/data', 'POST', { bids: [bidA] });

        // Step 2: Agent B (AG-002) fetches data (privacy guard strips Agent A's bid for Agent B)
        console.log('\n[Step 2] Agent B (AG-002) fetching GET /api/data?agentCode=AG-002...');
        const agentBData = await makeRequest('/api/data?agentCode=AG-002', 'GET');
        const openBidsForB = agentBData.bids.filter(b => b.auctionId === auctionId);
        console.log(`Agent B sees ${openBidsForB.length} bids for Auction ${auctionId} (Privacy Guard active)`);

        // Step 3: Agent B places bid at 26,000 and POSTs to /api/data with only Agent B's local bids
        const bidB = {
            id: Date.now() + 10,
            timestamp: Date.now() + 10,
            auctionId: auctionId,
            agentCode: 'AG-002',
            agentName: 'Agent B Global',
            isAnonymous: true,
            priceKg: 26000,
            status: 'HIGHEST',
            weightKg: 1000
        };

        console.log('\n[Step 3] Agent B (AG-002) placing bid of 26,000 via POST /api/data...');
        // Agent B's browser local bids array only contains bidB
        await makeRequest('/api/data', 'POST', { bids: [bidB] });

        // Step 4: Admin checks global server data to verify BOTH Agent A and Agent B bids are preserved
        console.log('\n[Step 4] Checking full server data via Admin GET /api/data?role=admin...');
        const adminData = await makeRequest('/api/data?role=admin', 'GET');
        const allAuctionBids = adminData.bids.filter(b => Number(b.auctionId) === Number(auctionId));
        const targetAuctionAfter = adminData.auctions.find(a => a.id === auctionId);

        console.log(`\n=== RESULTS ===`);
        console.log(`Total bids in server memory for Auction ${auctionId}:`, allAuctionBids.length);
        console.log(`Auction currentPriceKg:`, targetAuctionAfter.currentPriceKg);
        console.log(`Auction bidsCount:`, targetAuctionAfter.bidsCount);
        console.log(`Leading Agent Code:`, targetAuctionAfter.leadingAgentCode);

        const hasBidA = allAuctionBids.some(b => b.agentCode === 'AG-0892' && b.priceKg === 25000);
        const hasBidB = allAuctionBids.some(b => b.agentCode === 'AG-002' && b.priceKg === 26000);

        if (hasBidA && hasBidB && targetAuctionAfter.bidsCount >= 2 && targetAuctionAfter.currentPriceKg === 26000) {
            console.log('\n✅ TEST PASSED! Both Agent A and Agent B bids were preserved without data loss!');
        } else {
            console.error('\n❌ TEST FAILED! Agent A bid missing or stats corrupted.');
            console.log('Existing bids:', allAuctionBids);
        }

    } catch (err) {
        console.error('Error during test execution:', err);
    } finally {
        serverProc.kill();
    }
}

function makeRequest(path, method, body = null) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 8085,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

runTest();
