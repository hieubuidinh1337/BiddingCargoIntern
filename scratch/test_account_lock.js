// Mock browser environment for Node.js
global.window = {
    location: { protocol: 'http:', pathname: '/01-Login.html', search: '', href: 'http://localhost:8085/01-Login.html' },
    addEventListener: () => {},
    dispatchEvent: () => {}
};
global.document = {
    hidden: false,
    addEventListener: () => {},
    getElementById: () => null
};
global.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
    clear() { this._data = {}; }
};

const CargoStore = require('../assets/js/cargo-store.js');

console.log('=== BẮT ĐẦU KIỂM THỬ KHÓA TÀI KHOẢN KHI QUÁ HẠN THANH TOÁN ===\n');

// 1. Kiểm tra tài khoản AG-1024 (Vinatrans) có đơn WON-2026-0815-02 quá hạn
const data = CargoStore.getData();
const ag1024 = (data.agentsList || []).find(a => a.code === 'AG-1024');
console.log('1. Trạng thái tài khoản AG-1024 ban đầu:', ag1024.status);
console.log('   Lý do khóa:', ag1024.lockedReason);

if (ag1024.status !== 'Đã khóa') {
    throw new Error('AG-1024 phải ở trạng thái "Đã khóa" do quá hạn thanh toán đơn hàng!');
}

// 2. Thử đăng nhập bằng tài khoản AG-1024 -> Phải bị chặn và trả về isLocked = true
console.log('\n2. Thử đăng nhập tài khoản AG-1024:');
const loginRes = CargoStore.loginAgent('AG-1024', 'vina123456');
console.log('   Kết quả:', loginRes.success ? 'THÀNH CÔNG (SAI)' : 'BỊ CHẶN (ĐÚNG)');
console.log('   isLocked:', loginRes.isLocked);
console.log('   Thông báo lỗi:', loginRes.message);

if (loginRes.success || !loginRes.isLocked) {
    throw new Error('Đăng nhập tài khoản bị khóa phải trả về isLocked = true!');
}

// 3. Thử kiểm tra phiên currentUser khi AG-1024 cố tình lưu session
data.currentUser = { id: 2, role: 'agent', agentCode: 'AG-1024', status: 'Đang hoạt động' };
CargoStore.saveData(data);
const sessionUser = CargoStore.getCurrentUser();
console.log('\n3. Kiểm tra kiểm duyệt session đại lý bị khóa:', sessionUser === null ? 'ĐÃ TỰ ĐỘNG CLEAR SESSION (ĐÚNG)' : 'VẪN CÒN SESSION (SAI)');
if (sessionUser !== null) {
    throw new Error('Session của đại lý bị khóa phải bị hủy ngay lập tức!');
}

// 4. Thử đặt giá thầu từ tài khoản AG-1024
console.log('\n4. Thử đặt giá thầu bằng AG-1024:');
data.currentUser = { id: 2, role: 'agent', agentCode: 'AG-1024' };
CargoStore.saveData(data);
const openAuction = CargoStore.getAuctions().find(a => a.status === 'OPEN');
const bidRes = CargoStore.placeBid(openAuction.id, openAuction.currentPriceKg + openAuction.minStep, true);
console.log('   Kết quả đặt giá:', bidRes.success ? 'THÀNH CÔNG (SAI)' : 'BỊ CHẶN (ĐÚNG)');
console.log('   Thông báo:', bidRes.message);

if (bidRes.success) {
    throw new Error('Tài khoản bị khóa không được phép đặt giá thầu!');
}

// 5. Thử Admin mở khóa cho AG-1024
console.log('\n5. Quản trị viên (ADMIN) mở khóa cho AG-1024:');
CargoStore.loginAdmin('admin', 'admin2026');
const unlockRes = CargoStore.toggleUserLock('AG-1024', 'agent');
console.log('   Kết quả mở khóa:', unlockRes.message);

// Kiểm tra đăng nhập sau khi Admin mở khóa -> Phải thành công
const loginAfterUnlock = CargoStore.loginAgent('AG-1024', 'vina123456');
console.log('   Đăng nhập sau khi Admin mở khóa:', loginAfterUnlock.success ? 'THÀNH CÔNG (ĐÚNG)' : 'THẤT BÀI (SAI)');
if (!loginAfterUnlock.success) {
    throw new Error('Sau khi Admin mở khóa, đại lý phải đăng nhập được!');
}

console.log('\n=== TẤT CẢ KIỂM THỬ KHÓA TÀI KHOẢN DO NỢ CƯỚC / QUÁ HẠN THANH TOÁN ĐÃ ĐẠT 100%! ===');
