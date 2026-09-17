const db = require('../db.js');

async function cleanUnregisteredBids() {
    console.log('=== PURGING BIDS FROM UNREGISTERED OR ANONYMOUS AGENT CODES ===');
    await db.initDatabase();

    // 1. Get valid agent codes from agents and users tables
    const agents = await db.all('SELECT code, name FROM agents');
    const users = await db.all('SELECT agentCode, username, role FROM users WHERE agentCode IS NOT NULL AND agentCode != ""');

    const validCodes = new Set([
        ...agents.map(a => String(a.code || '').trim().toUpperCase()),
        ...users.map(u => String(u.agentCode || '').trim().toUpperCase())
    ].filter(Boolean));

    console.log('\n✅ Valid agent codes registered in SQLite database:');
    console.log(Array.from(validCodes));

    // 2. Fetch all current bids
    const bidsBefore = await db.all('SELECT * FROM bids');
    console.log(`\n📊 Total bids in database before cleanup: ${bidsBefore.length}`);

    const invalidBids = bidsBefore.filter(b => {
        const code = String(b.agentCode || '').trim().toUpperCase();
        return !code || code === 'AG-***' || code === 'ANONYMOUS' || !validCodes.has(code);
    });

    console.log(`⚠️ Found ${invalidBids.length} invalid/anonymous bids to purge:`);
    invalidBids.forEach(b => {
        console.log(`  - Bid ID: ${b.id} | Auction ID: ${b.auctionId} | Agent: ${b.agentCode} (${b.agentName}) | Price: ${b.priceKg} đ/Kg`);
    });

    if (invalidBids.length > 0) {
        const purgedCount = await db.purgeUnregisteredBids();
        console.log(`\n🗑️ Purged ${purgedCount} bids successfully.`);

        // 3. Reload and reconcile serverData
        const serverData = await db.getFullServerData();
        
        // Manual reconcile check across auctions
        const allBids = serverData.bids || [];
        (serverData.auctions || []).forEach(a => {
            const auctionBids = allBids
                .filter(b => Number(b.auctionId) === Number(a.id))
                .sort((x, y) => Number(y.priceKg) - Number(x.priceKg));

            if (auctionBids.length > 0) {
                const highest = auctionBids[0];
                a.currentPriceKg = Number(highest.priceKg);
                a.leadingAgentCode = highest.agentCode;
                a.leadingAgentName = highest.agentName;
                a.bidsCount = auctionBids.length;
                auctionBids.forEach((b, idx) => b.status = idx === 0 ? 'HIGHEST' : 'OUTBID');
            } else {
                a.leadingAgentCode = null;
                a.leadingAgentName = null;
                a.bidsCount = 0;
                if (a.startingPriceKg) a.currentPriceKg = a.startingPriceKg;
            }
        });

        await db.seedFullData(serverData);
        console.log('✅ Auction summaries reconciled and saved to database.');
    } else {
        console.log('\n✨ Database is already clean. No invalid bids to purge.');
    }

    const bidsAfter = await db.all('SELECT * FROM bids');
    console.log(`\n🎉 Total bids remaining in database: ${bidsAfter.length}`);
    console.log(JSON.stringify(bidsAfter, null, 2));

    process.exit(0);
}

cleanUnregisteredBids().catch(err => {
    console.error('❌ Error cleaning unregistered bids:', err);
    process.exit(1);
});
