const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'server_data.json');
const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const sampleAgents = [
    { code: 'AG-1024', name: 'Công ty CP Giao nhận Kho vận Vinatrans' },
    { code: 'AG-0892', name: 'Công ty TNHH Vận tải ABC Logistics' },
    { code: 'AG-0556', name: 'Công ty TNHH Tiếp vận Toàn Cầu Golden Star' },
    { code: 'AG-0341', name: 'Công ty TNHH SkyFreight Logistics Việt Nam' },
    { code: 'AG-0789', name: 'Công ty CP Vận chuyển Hàng không Việt Freight' }
];

if (!data.bids) data.bids = [];

// Enforce isAnonymous for all existing bids
data.bids.forEach(b => {
    b.isAnonymous = true;
});

// Process each wonAuction
(data.wonAuctions || []).forEach(won => {
    const existingBids = data.bids.filter(b => b.auctionId == won.auctionId);
    
    // Check if winner has a bid in existingBids
    const hasWinnerBid = existingBids.some(b => b.agentCode === won.agentCode && Number(b.priceKg) === Number(won.priceKg));
    
    if (!hasWinnerBid || existingBids.length < 2) {
        console.log(`Generating complete bid history for Won Auction ${won.wonId} (Auction ID ${won.auctionId}, Winner: ${won.agentCode} @ ${won.priceKg}đ)...`);
        
        // Remove incomplete bids for this auctionId
        data.bids = data.bids.filter(b => b.auctionId != won.auctionId);
        
        const count = 4;
        const winPrice = Number(won.priceKg);
        const startPrice = Math.max(10000, winPrice - 3000);
        const step = (winPrice - startPrice) / (count - 1);
        const baseTime = Date.now() - 3 * 24 * 3600 * 1000; // 3 days ago
        
        const newBids = [];
        const competingAgents = sampleAgents.filter(a => a.code !== won.agentCode);
        
        for (let i = 0; i < count - 1; i++) {
            const price = Math.round((startPrice + step * i) / 100) * 100;
            const ag = competingAgents[i % competingAgents.length];
            newBids.push({
                id: baseTime + (i + 1) * 30 * 60 * 1000,
                timestamp: baseTime + (i + 1) * 30 * 60 * 1000,
                auctionId: Number(won.auctionId),
                agentCode: ag.code,
                agentName: ag.name,
                isAnonymous: true,
                priceKg: Number(price),
                time: `${(count - i) * 35} phút trước`,
                status: 'OUTBID',
                weightKg: won.capacityKg || 3000
            });
        }
        
        // Final winning bid
        newBids.push({
            id: baseTime + count * 30 * 60 * 1000,
            timestamp: baseTime + count * 30 * 60 * 1000,
            auctionId: Number(won.auctionId),
            agentCode: won.agentCode,
            agentName: won.agentName,
            isAnonymous: true,
            priceKg: winPrice,
            time: '5 phút trước',
            status: 'WON',
            weightKg: won.capacityKg || 3000
        });
        
        data.bids.push(...newBids);
        won.bidsCount = newBids.length;
    } else {
        won.bidsCount = existingBids.length;
    }
});

// Process active auctions
(data.auctions || []).forEach(auction => {
    auction.isAnonymous = true;
    const existingBids = data.bids.filter(b => b.auctionId == auction.id);
    if (existingBids.length === 0 && (auction.bidsCount || 0) > 0) {
        console.log(`Generating ${auction.bidsCount} bids for active auction ${auction.id}...`);
        const count = auction.bidsCount || 3;
        const startPrice = auction.startingPriceKg || 18000;
        const endPrice = auction.currentPriceKg || (startPrice + count * 500);
        const step = (endPrice - startPrice) / Math.max(1, count - 1);
        const now = Date.now();
        
        for (let i = 0; i < count; i++) {
            const isLast = (i === count - 1);
            const price = isLast ? endPrice : Math.round((startPrice + step * i) / 100) * 100;
            const ag = sampleAgents[i % sampleAgents.length];
            data.bids.push({
                id: now - (count - i) * 15 * 60 * 1000,
                timestamp: now - (count - i) * 15 * 60 * 1000,
                auctionId: Number(auction.id),
                agentCode: ag.code,
                agentName: ag.name,
                isAnonymous: true,
                priceKg: Number(price),
                time: `${(count - i) * 15} phút trước`,
                status: isLast ? 'HIGHEST' : 'OUTBID',
                weightKg: auction.capacityKg || 3000
            });
        }
    } else {
        auction.bidsCount = existingBids.length;
    }
});

data.version = Date.now();
fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
console.log('Successfully fixed all bids in server_data.json!');
