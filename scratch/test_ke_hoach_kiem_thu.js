const fs = require('fs');

// Mock localStorage and window
const store = {};
global.localStorage = {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; }
};
global.window = {
    location: { protocol: 'http:', href: '', pathname: '' },
    dispatchEvent: () => {},
    addEventListener: () => {}
};
global.CustomEvent = class {};
global.StorageEvent = class {};
global.fetch = async () => ({ ok: false }); // mock offline fetch

// Load cargo-store.js
let code = fs.readFileSync('./assets/js/cargo-store.js', 'utf8');
code += '\nglobal.CargoStore = CargoStore;\n';
eval(code);

console.log('=== TRIỂN KHAI KẾ HOẠCH KIỂM THỬ (TEST PLAN) ===');

try {
    // --- 4.1. Quản lý người dùng (User Management) ---
    console.log('\n--- 4.1. Quản lý người dùng (User Management) ---');

    // UM-01: Đăng ký đại lý
    console.log('[UM-01] Đăng ký đại lý:');
    const regRes = CargoStore.registerAgent({
        companyName: 'Công ty Test Kế Hoạch',
        taxCode: '0123456789',
        repName: 'Nguyễn Văn Test',
        phone: '0901234567',
        email: 'test@plan.vn',
        password: 'Password@123',
        pin: '1234'
    });
    const isSuccess = regRes && regRes.regId !== undefined;
    console.log(' -> Kết quả đăng ký:', isSuccess ? 'THÀNH CÔNG' : 'THẤT BÀI - ' + regRes.message);
    if (!isSuccess) throw new Error('UM-01 FAILED');

    // UM-02: Duyệt hồ sơ (Admin phê duyệt)
    console.log('\n[UM-02] Duyệt hồ sơ:');
    CargoStore.loginAdmin('admin', 'admin2026');
    const pendingReg = CargoStore.getRegistrations().find(r => r.companyName === 'Công ty Test Kế Hoạch');
    if (!pendingReg) throw new Error('Không tìm thấy registration vừa đăng ký!');
    const testRegId = pendingReg.regId;
    const approveRes = CargoStore.approveRegistration(testRegId);
    console.log(' -> ADMIN Duyệt hồ sơ đại lý:', testRegId, approveRes.success ? 'THÀNH CÔNG' : 'THẤT BÀI');
    if (!approveRes.success) throw new Error('UM-02 FAILED: ' + approveRes.message);
    
    const activatedAgent = CargoStore.getData().agentsList.find(a => a.taxCode === '0123456789');
    console.log(' -> Trạng thái sau duyệt:', activatedAgent.status);
    if (activatedAgent.status !== 'Đang hoạt động') throw new Error('UM-02 FAILED: Trạng thái chưa đổi sang Đang hoạt động');

    // UM-03: Đăng nhập hệ thống (Phân quyền)
    console.log('\n[UM-03] Đăng nhập hệ thống (Phân quyền):');
    CargoStore.logoutAdmin();
    const loginAgentRes = CargoStore.loginAgent(activatedAgent.code, 'Password@123');
    console.log(' -> Agent đăng nhập:', loginAgentRes.success ? 'THÀNH CÔNG' : 'THẤT BÀI');
    if (!loginAgentRes.success) throw new Error('UM-03 FAILED');

    const loginAdminRes = CargoStore.loginAdmin('admin', 'admin2026');
    console.log(' -> Admin đăng nhập:', loginAdminRes.success ? 'THÀNH CÔNG' : 'THẤT BÀI');
    if (!loginAdminRes.success) throw new Error('UM-03 FAILED');


    // --- 4.2. Quản lý phiên đấu giá (Auction Management) ---
    console.log('\n--- 4.2. Quản lý phiên đấu giá (Auction Management) ---');

    // AM-01: Tạo chuyến bay đấu giá
    console.log('[AM-01] Tạo chuyến bay đấu giá:');
    const createAuctionRes = CargoStore.createAuction({
        flightNumber: 'VU123_TEST',
        origin: 'SGN',
        destination: 'HAN',
        etd: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        capacityKg: 2000,
        startingPriceKg: 10000,
        minStep: 500
    });
    console.log(' -> Tạo chuyến bay:', createAuctionRes.success ? 'THÀNH CÔNG' : 'THẤT BÀI');
    if (!createAuctionRes.success) throw new Error('AM-01 FAILED');
    const newAuctionId = createAuctionRes.auction ? createAuctionRes.auction.id : createAuctionRes.id;

    // AM-02: Mở/Đóng phiên đấu giá
    console.log('\n[AM-02] Mở/Đóng phiên đấu giá:');
    const closeRes = CargoStore.closeAuction(newAuctionId);
    console.log(' -> Đóng phiên đấu giá:', closeRes.success ? 'THÀNH CÔNG' : 'THẤT BÀI');
    if (!closeRes.success) throw new Error('AM-02 FAILED');
    const closedAuction = CargoStore.getAuctionById(newAuctionId);
    console.log(' -> Trạng thái phiên đấu giá:', closedAuction.status);
    if (closedAuction.status !== 'CLOSED') throw new Error('AM-02 FAILED');

    // AM-03: Tổng hợp kết quả
    console.log('\n[AM-03] Tổng hợp kết quả:');
    // Create a new auction, bid on it, then close it.
    const auctionAM03 = CargoStore.createAuction({
        flightNumber: 'VU456_TEST',
        origin: 'SGN',
        destination: 'HAN',
        etd: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        capacityKg: 2000,
        startingPriceKg: 10000,
        minStep: 500
    });
    const am03Id = auctionAM03.auction ? auctionAM03.auction.id : auctionAM03.id;
    CargoStore.logoutAdmin();
    CargoStore.loginAgent(activatedAgent.code, 'Password@123'); // login as agent to place bid
    CargoStore.placeBid(am03Id, 11000, true);
    
    CargoStore.loginAdmin('admin', 'admin2026'); // login as admin to close auction
    const am03Close = CargoStore.closeAuction(am03Id);
    console.log(' -> Đóng phiên có người tham gia:', am03Close.success ? 'THÀNH CÔNG' : 'THẤT BÀI');
    const wonAuctions = CargoStore.getWonAuctions();
    const isWon = wonAuctions.some(w => w.auctionId === am03Id);
    console.log(' -> Đã tạo kết quả thắng thầu:', isWon ? 'CÓ' : 'KHÔNG');
    if (!isWon) throw new Error('AM-03 FAILED');


    // --- 4.3. Nghiệp vụ đấu giá trực tuyến (Bidding Flow) ---
    console.log('\n--- 4.3. Nghiệp vụ đấu giá trực tuyến (Bidding Flow) ---');

    // BF-01: Xem danh sách đấu giá
    console.log('[BF-01] Xem danh sách đấu giá:');
    CargoStore.logoutAdmin();
    CargoStore.loginAgent(activatedAgent.code, 'Password@123');
    const openAuctions = CargoStore.getAuctions().filter(a => a.status === 'OPEN');
    console.log(' -> Số chuyến bay đang mở:', openAuctions.length);
    if (openAuctions.length === 0) throw new Error('BF-01 FAILED (No open auctions)');
    const targetAuction = openAuctions[0];

    // BF-02: Đặt giá thầu
    console.log('\n[BF-02] Đặt giá thầu:');
    const bidPrice = (targetAuction.currentPriceKg || targetAuction.startingPriceKg) + targetAuction.minStep;
    const bidRes = CargoStore.placeBid(targetAuction.id, bidPrice, true);
    console.log(' -> Đặt giá:', bidPrice, bidRes.success ? 'THÀNH CÔNG' : 'THẤT BÀI');
    if (!bidRes.success) throw new Error('BF-02 FAILED: ' + bidRes.message);

    // BF-03: Bảo mật giá thầu
    console.log('\n[BF-03] Bảo mật giá thầu (Ẩn danh):');
    const otherAgentName = CargoStore.getPublicAgentName(activatedAgent.code, activatedAgent.companyName, true, { role: 'agent', code: 'AG-OTHER' });
    console.log(' -> Agent khác nhìn thấy:', otherAgentName);
    if (otherAgentName.includes(activatedAgent.companyName)) throw new Error('BF-03 FAILED: Tên công ty bị lộ!');
    const myName = CargoStore.getPublicAgentName(activatedAgent.code, activatedAgent.companyName, true, CargoStore.getCurrentUser());
    console.log(' -> Chính chủ nhìn thấy:', myName);
    if (!myName.includes('Bạn')) throw new Error('BF-03 FAILED: Chính chủ không thấy nhãn Bạn!');

    // BF-04: Xem lịch sử đấu giá
    console.log('\n[BF-04] Xem lịch sử đấu giá:');
    const myBids = CargoStore.getMyBids();
    console.log(' -> Số lượt đấu giá của đại lý:', myBids.length);
    if (myBids.length === 0) throw new Error('BF-04 FAILED');

    console.log('\n=== HOÀN TẤT TRIỂN KHAI TEST PLAN! TẤT CẢ TEST CASES (UM, AM, BF) ĐÃ PASS! ===');

} catch (err) {
    console.error('\n[LỖI TEST PLAN]:', err.message);
    process.exit(1);
}
