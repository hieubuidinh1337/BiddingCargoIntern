const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'server_data.json');
const raw = fs.readFileSync(dbPath, 'utf8');
const data = JSON.parse(raw);

const sampleAgents = [
    { code: 'AG-1024', name: 'Công ty CP Giao nhận Kho vận Vinatrans' },
    { code: 'AG-0892', name: 'Công ty TNHH Vận tải ABC Logistics' },
    { code: 'AG-0556', name: 'Công ty TNHH Tiếp vận Toàn Cầu Golden Star' },
    { code: 'AG-0341', name: 'Công ty TNHH SkyFreight Logistics Việt Nam' },
    { code: 'AG-0789', name: 'Công ty CP Vận chuyển Hàng không Việt Freight' }
];

function generateBidsForAuction(auction) {
    const count = auction.bidsCount || 2;
    const startPrice = auction.startingPriceKg || 18000;
    let endPrice = auction.currentPriceKg || (startPrice + count * (auction.minStep || 500));
    if (endPrice > startPrice * 10) {
        endPrice = startPrice + count * (auction.minStep || 500) * 3;
    }

    const step = (endPrice - startPrice) / Math.max(1, count - 1);
    const now = Date.now();
    const bids = [];

    for (let i = 0; i < count; i++) {
        const isLast = (i === count - 1);
        const price = isLast ? endPrice : Math.round((startPrice + step * i) / 100) * 100;
        const ag = sampleAgents[i % sampleAgents.length];
        
        let status = 'OUTBID';
        if (isLast) {
            status = auction.status === 'CLOSED' ? 'WON' : 'HIGHEST';
        }

        bids.push({
            id: now - (count - i) * 20 * 60 * 1000,
            timestamp: now - (count - i) * 20 * 60 * 1000,
            auctionId: auction.id,
            agentCode: ag.code,
            agentName: ag.name,
            isAnonymous: true,
            priceKg: Number(price),
            time: `${(count - i) * 20} phút trước`,
            status: status,
            weightKg: auction.capacityKg
        });
    }
    return bids;
}

if (!data.bids) data.bids = [];

// Check each auction
(data.auctions || []).forEach(auction => {
    const existingBids = data.bids.filter(b => b.auctionId == auction.id);
    if (existingBids.length === 0 && (auction.bidsCount || 0) > 0) {
        console.log(`Generating ${auction.bidsCount} sample bids for Auction ID ${auction.id} (${auction.flightNumber})...`);
        const newBids = generateBidsForAuction(auction);
        data.bids.push(...newBids);
    } else {
        auction.bidsCount = existingBids.length;
    }
});

data.version = Date.now();
fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
console.log('Successfully updated server_data.json bids!');
