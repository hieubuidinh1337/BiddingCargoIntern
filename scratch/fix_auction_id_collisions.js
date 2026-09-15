const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'server_data.json');
const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('--- REMAPPING HISTORICAL WON AUCTION IDS ---');

const REMAP = {
    'WON-2026-0816-05': 105,
    'WON-20260908-06': 106,
    'WON-20260909-07': 107
};

(data.wonAuctions || []).forEach(w => {
    if (REMAP[w.wonId]) {
        const oldId = w.auctionId;
        const newId = REMAP[w.wonId];
        w.auctionId = newId;
        console.log(`Remapped WonAuction ${w.wonId}: auctionId ${oldId} -> ${newId}`);

        // Remap bids that belong to this won auction
        (data.bids || []).forEach(b => {
            if (Number(b.auctionId) === Number(oldId)) {
                b.auctionId = newId;
                console.log(`  -> Remapped bid ${b.id} (${b.agentCode}): auctionId ${oldId} -> ${newId}`);
            }
        });
    }
});

data.version = Date.now();
fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
console.log('--- COMPLETED REMAPPING IN server_data.json ---');
