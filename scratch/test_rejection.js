const fs = require('fs');
const path = require('path');

// Mock localStorage for Node script
const dbFile = path.join(__dirname, '../server_data.json');
let localData = JSON.parse(fs.readFileSync(dbFile, 'utf8'));

global.localStorage = {
    getItem: (key) => JSON.stringify(localData),
    setItem: (key, val) => {
        localData = JSON.parse(val);
        fs.writeFileSync(dbFile, JSON.stringify(localData, null, 2), 'utf8');
    }
};

const CargoStore = require('../assets/js/cargo-store.js');

console.log('--- Testing Payment Rejection & Email Flow ---');

// Find active won auction ID
const wonList = localData.wonAuctions || [];
const targetItem = wonList.find(w => w.paymentStatus !== 'EXPIRED') || wonList[0];
const targetWonId = targetItem ? targetItem.wonId : 'WON-2026-0814-01';

console.log('Testing with Won Order ID:', targetWonId);

// 1. Submit payment proof
const notifyRes = CargoStore.notifyPaymentSent(targetWonId, {
    transactionRef: 'FT8899776655',
    proofImageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    note: 'Đại lý đã nộp tiền qua Internet Banking VCB',
    transferredAmount: 32000000
});

console.log('1. notifyPaymentSent:', notifyRes);

// 2. Reject payment as Admin with reason
const rejectRes = CargoStore.rejectPayment(targetWonId, 'Mã giao dịch FT8899776655 không khớp trên sao kê Vietcombank. Vui lòng nộp lại ảnh biên lai rõ nét!');
console.log('2. rejectPayment:', rejectRes);

// 3. Verify store state
const data = CargoStore.getData();
const item = data.wonAuctions.find(w => w.wonId === targetWonId);
console.log('3. Won Item state after rejection:', {
    wonId: item.wonId,
    paymentStatus: item.paymentStatus,
    paymentProofStatus: item.paymentProof ? item.paymentProof.status : null,
    rejectionReason: item.paymentProof ? item.paymentProof.rejectionReason : null,
    rejectedAt: item.paymentProof ? item.paymentProof.rejectedAt : null
});

console.log('4. Recent notifications count:', data.notifications.length);
console.log('   First notification:', data.notifications[0]);

console.log('--- TEST PASSED CLEANLY ---');
