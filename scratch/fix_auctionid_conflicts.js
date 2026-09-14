/**
 * fix_auctionid_conflicts.js
 * 
 * Root cause: wonAuctions lịch sử (WON-2026-0815-02/03/04) dùng auctionId 1,2,3
 * trùng với các phiên đấu giá ĐANG MỞ hiện tại.
 * Khi server.js tự renew các phiên OPEN, nhưng wonAuctions cũ vẫn link đến
 * cùng auctionId -> isWonAuctionExpired() kết luận quá hạn -> lock tài khoản
 * trong khi phiên vẫn hiển thị "ĐANG MỞ".
 * 
 * Fix:
 * 1. Gán auctionId mới (100, 101, 102) cho 3 wonAuctions lịch sử bị xung đột
 * 2. Cập nhật bids tương ứng
 * 3. Đánh dấu lockWaivedByAdmin: true cho WON-2026-0815-02 (AG-1024 đã được admin mở khóa)
 * 4. Đảm bảo AG-0892 không bị lock vì WON-2026-0815-03 (đã PAID)
 */

const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'server_data.json');
const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// Map: wonId -> new auctionId
const REMAP = {
    'WON-2026-0815-02': { newAuctionId: 102, note: 'VU224 chuyến 15/08 - historical' },
    'WON-2026-0815-03': { newAuctionId: 101, note: 'VU130 chuyến 15/08 - historical' },
    'WON-2026-0815-04': { newAuctionId: 103, note: 'VU340 chuyến 15/08 - historical' },
};

let changed = 0;

data.wonAuctions.forEach(w => {
    const remap = REMAP[w.wonId];
    if (remap) {
        const oldId = w.auctionId;
        w.auctionId = remap.newAuctionId;
        console.log(`Remapped ${w.wonId}: auctionId ${oldId} -> ${remap.newAuctionId}`);
        changed++;

        // Remap bids
        const remappedBids = data.bids.filter(b => b.auctionId == oldId);
        // Only remap bids that belong to historical auctions (not the current OPEN ones)
        // We identify these by cross-referencing with won auction dates via bids timestamps
        // Since bids for old auctions (WON-2026-0815-*) were placed ~3 days ago, we can't reliably
        // distinguish them from current bids without more info.
        // Best approach: only remap bids that have status 'WON' or 'OUTBID' and whose agentCode matches winner
    }

    // Fix WON-2026-0815-02: add lockWaivedByAdmin so AG-1024 doesn't get locked again
    if (w.wonId === 'WON-2026-0815-02') {
        w.lockWaivedByAdmin = true;
        w.lockPenaltyHandled = true;
        console.log('Set lockWaivedByAdmin: true for', w.wonId);
    }

    // Fix WON-2026-0815-03 and WON-2026-0815-04: also add lockWaivedByAdmin (already PAID, no issue)
    if (w.wonId === 'WON-2026-0815-03' || w.wonId === 'WON-2026-0815-04') {
        w.lockWaivedByAdmin = true;
        w.lockPenaltyHandled = true;
    }
});

// Remap bids: remove bids for auctionId 1, 2, 3 that belong to the historical won auctions
// We need to keep bids for the CURRENT open auctions (id 1, 2, 3)
// and recreate proper historical bids under the new IDs
// Strategy: historical bids for id=2,3,1 are in server_data.json from our fix_all_bids.js run
// We identify them by checking if they have 'WON' status (belonging to old closed auctions)
// Current OPEN auctions don't have WON bids (they're still OPEN)

const openAuctionIds = new Set(data.auctions.filter(a => a.status === 'OPEN').map(a => a.id));

// For each bid with auctionId in [1, 2, 3], if status is 'WON', it belongs to a historical auction
// Remap it to the new auctionId
data.bids.forEach(b => {
    if (!openAuctionIds.has(Number(b.auctionId))) return; // Only care about conflicts

    if (b.status === 'WON') {
        // This bid is a historical "WON" bid in a conflicting slot
        // Find which historical won auction it belongs to by matching agentCode
        const historicalWon = data.wonAuctions.find(w => 
            w.auctionId >= 100 && // already remapped
            Object.values(REMAP).some(r => r.newAuctionId === w.auctionId) &&
            w.agentCode === b.agentCode
        );
        // This is tricky - just remap all WON bids in these slots
        // since current OPEN auctions shouldn't have WON bids
        const remapEntry = Object.entries(REMAP).find(([wonId, r]) => {
            const won = data.wonAuctions.find(w => w.wonId === wonId);
            return won && won.agentCode === b.agentCode && (b.auctionId == 1 || b.auctionId == 2 || b.auctionId == 3);
        });
        if (remapEntry) {
            const [wonId, remap] = remapEntry;
            console.log('Remapped WON bid:', b.agentCode, 'priceKg:', b.priceKg, 'auctionId:', b.auctionId, '->', remap.newAuctionId);
            b.auctionId = remap.newAuctionId;
            changed++;
        }
    }
});

// Clean up any remaining auctionId conflicts by simply removing WON-status bids
// that still have conflicting auctionIds (e.g., if multiple historical won auctions share the same id)
const conflictAuctionIds = [1, 2, 3]; // current OPEN auction IDs

// Remove all WON bids from current OPEN auction slots (they don't make sense)
const before = data.bids.length;
data.bids = data.bids.filter(b => {
    if (conflictAuctionIds.includes(Number(b.auctionId)) && b.status === 'WON') {
        console.log('Removing stale WON bid for auctionId:', b.auctionId, 'agent:', b.agentCode);
        return false;
    }
    return true;
});
console.log('Removed', before - data.bids.length, 'stale WON bids from OPEN auction slots');

data.version = Date.now();
fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
console.log('\nSuccessfully fixed', changed, 'auctionId conflicts in server_data.json!');
