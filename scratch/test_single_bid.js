const http = require('http');

async function checkBids() {
    const res = await fetch('http://localhost:8085/api/data');
    const data = await res.json();
    const openAuction = data.auctions.find(a => a.status === 'OPEN');
    console.log('Auction before bid:', {
        id: openAuction.id,
        flightNumber: openAuction.flightNumber,
        currentPriceKg: openAuction.currentPriceKg,
        bidsCount: openAuction.bidsCount
    });

    const initialBidsCount = openAuction.bidsCount;
    const initialBidsLength = data.bids.filter(b => b.auctionId === openAuction.id).length;

    console.log('Placing 1 bid via /api/bids/place...');
    const placeRes = await fetch('http://localhost:8085/api/bids/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            auctionId: openAuction.id,
            agentCode: 'AG-0892',
            agentName: 'ABC Logistics',
            priceKg: openAuction.currentPriceKg + openAuction.minStep,
            isAnonymous: true,
            weightKg: openAuction.capacityKg
        })
    });
    const placeData = await placeRes.json();
    console.log('Place bid response:', placeData);

    const afterRes = await fetch('http://localhost:8085/api/data');
    const afterData = await afterRes.json();
    const updatedAuction = afterData.auctions.find(a => a.id === openAuction.id);
    const updatedBidsLength = afterData.bids.filter(b => b.auctionId === openAuction.id).length;

    console.log('Auction after 1 bid placement:', {
        id: updatedAuction.id,
        currentPriceKg: updatedAuction.currentPriceKg,
        bidsCount: updatedAuction.bidsCount,
        bidsCountDiff: updatedAuction.bidsCount - initialBidsCount,
        bidsLengthDiff: updatedBidsLength - initialBidsLength
    });
}

checkBids().catch(console.error);
