const db = require('../db.js');
(async () => {
    await db.initDatabase();
    console.log('AUCTION 1:', await db.get('SELECT id, status, currentPriceKg, minStep, endTime FROM auctions WHERE id = 1'));
    console.log('UNPAID WON:', await db.all("SELECT wonId, auctionId, paymentStatus, paymentDeadline, totalAmountVND FROM won_auctions WHERE paymentStatus = 'UNPAID'"));
    process.exit(0);
})();
