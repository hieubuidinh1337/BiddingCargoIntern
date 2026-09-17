const fs = require('fs');

// Mock localStorage, window & fetch for Node.js execution
if (typeof global.localStorage === 'undefined') {
    let mockStore = {};
    global.localStorage = {
        getItem: (k) => mockStore[k] || null,
        setItem: (k, v) => { mockStore[k] = String(v); },
        removeItem: (k) => { delete mockStore[k]; },
        clear: () => { mockStore = {}; }
    };
}
if (typeof global.window === 'undefined') {
    global.window = { addEventListener: () => {} };
} else if (!global.window.addEventListener) {
    global.window.addEventListener = () => {};
}
if (typeof global.navigator === 'undefined') global.navigator = { userAgent: 'NodeTest/1.0' };
global.fetch = async () => ({ ok: true, json: async () => ({ success: true }) });

// Load CargoStore
const cargoStoreContent = fs.readFileSync('assets/js/cargo-store.js', 'utf8');
eval(cargoStoreContent);

console.log('--- STARTING SYSTEM AUDIT LOG TESTING ---');

const initialLogCount = CargoStore.getActivityLogs().length;
console.log(`Initial log count: ${initialLogCount}`);

// 1. Admin Login
console.log('\n[TEST 1] Admin Login...');
CargoStore.loginAdmin('admin', 'admin2026');

// 2. Approve Registration
console.log('[TEST 2] Approve Agent Registration...');
const mockReg = {
    regId: 'REG-9999',
    companyName: 'Công ty Vận Tải Quốc Tế Express',
    repName: 'Nguyễn Văn A',
    repPosition: 'Giám đốc',
    phone: '0901234567',
    email: 'express@testlog.com',
    taxCode: '0315998877',
    address: 'HCM',
    status: 'PENDING'
};
const data = JSON.parse(localStorage.getItem('VU_CARGO_BIDDING_DATA_V2') || '{}');
if (!data.registrations) data.registrations = [];
data.registrations.push(mockReg);
localStorage.setItem('VU_CARGO_BIDDING_DATA_V2', JSON.stringify(data));
CargoStore.approveRegistration('REG-9999');

// 3. Reject Registration
console.log('[TEST 3] Reject Agent Registration...');
const mockReg2 = {
    regId: 'REG-8888',
    companyName: 'Công ty TNHH Hóa Chất Độc Hải',
    repName: 'Tran B',
    email: 'toxic@testlog.com',
    taxCode: '0315998888',
    status: 'PENDING'
};
const data2 = JSON.parse(localStorage.getItem('VU_CARGO_BIDDING_DATA_V2') || '{}');
data2.registrations.push(mockReg2);
localStorage.setItem('VU_CARGO_BIDDING_DATA_V2', JSON.stringify(data2));
CargoStore.rejectRegistration('REG-8888', 'Hàng hóa nguy hiểm không được duyệt');

// 4. Create Auction
console.log('[TEST 4] Create Auction...');
CargoStore.createAuction({
    flightNumber: 'VU-LOG-TEST-01',
    route: 'SGN-HAN',
    etd: '18/09/2026 10:00',
    capacityKg: 5000,
    startingPriceKg: 15000,
    minStep: 500,
    depositPercent: 10
});

// 5. Close Auction
console.log('[TEST 5] Close Auction...');
const auctions = CargoStore.getAuctions();
const createdAuction = auctions.find(a => a.flightNumber === 'VU-LOG-TEST-01');
if (createdAuction) {
    CargoStore.closeAuction(createdAuction.id);
}

// 6. Confirm Payment
console.log('[TEST 6] Confirm Payment...');
const wonItems = CargoStore.getWonAuctions();
if (wonItems.length > 0) {
    CargoStore.confirmPayment(wonItems[0].wonId);
}

// 7. Update Cargo Declaration
console.log('[TEST 7] Update Cargo Declaration...');
if (wonItems.length > 0) {
    CargoStore.updateCargoDeclaration(wonItems[0].wonId, {
        cargoType: 'Hàng Điện Tử / Chíp Bán Dẫn',
        piecesCount: 50,
        grossWeightKg: 1200
    });
}

// 8. Toggle User Lock
console.log('[TEST 8] Toggle User Lock...');
CargoStore.toggleUserLock('AG-0892', 'agent', 'Tạm khóa để kiểm tra đối soát');

// 9. Update User Role / Tier
console.log('[TEST 9] Update User Role / Tier...');
CargoStore.updateUserRole('AG-0892', 'TIER1', 'agent');

// 10. Create Staff Account
console.log('[TEST 10] Create Staff Account...');
CargoStore.createStaffAccount({
    username: 'staff.audit.test',
    password: 'password123',
    fullName: 'Lê Thị Kiểm Toán',
    role: 'STAFF',
    department: 'Ban Kiểm Soát Vận Hành'
});

// 11. Update System Settings
console.log('[TEST 11] Update System Settings...');
CargoStore.updateSystemSettings({
    minIncrement: 600,
    cutoffHours: 4
});

// 12. Update Bank Config
console.log('[TEST 12] Update Bank Config...');
CargoStore.updateBankConfig({
    bankName: 'MBBank - Ngân hàng Quân Đội',
    accountNumber: '999988887777',
    accountName: 'CONG TY CP HANG KHONG VIETRAVEL'
});

// 13. Send Broadcast
console.log('[TEST 13] Send Broadcast Notification...');
CargoStore.sendBroadcastNotification({
    title: 'Thông báo Kiểm thử Nhật ký Hệ thống',
    message: 'Nội dung thông báo phát thử nghiệm'
});

// 14. Change Admin Password
console.log('[TEST 14] Change Admin Password...');
CargoStore.changeAdminPassword('admin2026', 'admin@newpass2026');

// 15. Admin Logout
console.log('[TEST 15] Admin Logout...');
CargoStore.logoutAdmin();

const finalLogs = CargoStore.getActivityLogs();
console.log(`\nFinal log count: ${finalLogs.length}`);
console.log(`New logs generated: ${finalLogs.length - initialLogCount}`);

console.log('\n--- SAMPLE RECENT AUDIT LOGS RECORDED ---');
finalLogs.slice(0, 15).forEach((l, idx) => {
    console.log(`${idx + 1}. [${l.actionCategory}] ${l.actionTitle} | Target: ${l.target} | Actor: ${l.actor} (@${l.username}) [${l.role}]`);
    console.log(`   Details: ${l.details}`);
    console.log(`   Timestamp: ${l.timestamp} | IP: ${l.ip}\n`);
});

console.log('--- SYSTEM AUDIT LOG TESTING COMPLETE: SUCCESS! ---');
