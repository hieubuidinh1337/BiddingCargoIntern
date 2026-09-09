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

// 2. Kiểm tra tài khoản AG-0556 (Golden Star) có đơn WON-20260909-07 quá hạn
const ag0556 = (data.agentsList || []).find(a => a.code === 'AG-0556');
console.log('\n2. Trạng thái tài khoản AG-0556 ban đầu:', ag0556.status);
console.log('   Lý do khóa:', ag0556.lockedReason);

if (ag0556.status !== 'Đã khóa') {
    throw new Error('AG-0556 phải ở trạng thái "Đã khóa" do quá hạn thanh toán đơn WON-20260909-07!');
}

// 3. Kiểm tra tài khoản AG-0892 (ABC Logistics) đã thanh toán hết
const ag0892 = (data.agentsList || []).find(a => a.code === 'AG-0892');
console.log('\n3. Trạng thái tài khoản AG-0892 ban đầu:', ag0892.status);
if (ag0892.status !== 'Đang hoạt động') {
    throw new Error('AG-0892 phải ở trạng thái "Đang hoạt động" do đã thanh toán tất cả đơn hàng!');
}

// 4. Thử đăng nhập bằng tài khoản AG-1024 -> Phải bị chặn và trả về isLocked = true
console.log('\n4. Thử đăng nhập tài khoản AG-1024:');
const loginRes1024 = CargoStore.loginAgent('AG-1024', 'vina123456');
console.log('   Kết quả:', loginRes1024.success ? 'THÀNH CÔNG (SAI)' : 'BỊ CHẶN (ĐÚNG)');
console.log('   isLocked:', loginRes1024.isLocked);
console.log('   Thông báo lỗi:', loginRes1024.message);

if (loginRes1024.success || !loginRes1024.isLocked) {
    throw new Error('Đăng nhập tài khoản bị khóa AG-1024 phải trả về isLocked = true!');
}

// 5. Thử đăng nhập bằng tài khoản AG-0556 -> Phải bị chặn và trả về isLocked = true
console.log('\n5. Thử đăng nhập tài khoản AG-0556:');
const loginRes0556 = CargoStore.loginAgent('AG-0556', 'star123456');
console.log('   Kết quả:', loginRes0556.success ? 'THÀNH CÔNG (SAI)' : 'BỊ CHẶN (ĐÚNG)');
console.log('   isLocked:', loginRes0556.isLocked);
console.log('   Thông báo lỗi:', loginRes0556.message);

if (loginRes0556.success || !loginRes0556.isLocked) {
    throw new Error('Đăng nhập tài khoản bị khóa AG-0556 phải trả về isLocked = true!');
}

// 6. Thử đăng nhập bằng tài khoản AG-0892 -> Phải thành công
console.log('\n6. Thử đăng nhập tài khoản AG-0892:');
const loginRes0892 = CargoStore.loginAgent('AG-0892', 'abc123456');
console.log('   Kết quả:', loginRes0892.success ? 'THÀNH CÔNG (ĐÚNG)' : 'BỊ CHẶN (SAI)');
if (!loginRes0892.success) {
    throw new Error('AG-0892 phải đăng nhập được vì không nợ cước!');
}

// 7. Thử Admin mở khóa cho AG-1024
console.log('\n7. Quản trị viên (ADMIN) mở khóa cho AG-1024:');
CargoStore.loginAdmin('admin', 'admin2026');
const unlockRes = CargoStore.toggleUserLock('AG-1024', 'agent');
console.log('   Kết quả mở khóa:', unlockRes.message);

// Kiểm tra đăng nhập sau khi Admin mở khóa -> Phải thành công
const loginAfterUnlock = CargoStore.loginAgent('AG-1024', 'vina123456');
console.log('   Đăng nhập sau khi Admin mở khóa:', loginAfterUnlock.success ? 'THÀNH CÔNG (ĐÚNG)' : 'THẤT BÀI (SAI)');
if (!loginAfterUnlock.success) {
    throw new Error('Sau khi Admin mở khóa, đại lý phải đăng nhập được!');
}

// 8. Đảm bảo khi AG-1024 được mở khóa, AG-0556 VẪN BỊ KHÓA RIÊNG BIỆT (Không bị mở lây)
const dataAfter = CargoStore.getData();
const ag0556After = (dataAfter.agentsList || []).find(a => a.code === 'AG-0556');
console.log('\n8. Kiểm tra tính độc lập: AG-0556 sau khi AG-1024 được mở khóa:', ag0556After.status);
if (ag0556After.status !== 'Đã khóa') {
    throw new Error('AG-0556 phải VẪN BỊ KHÓA khi admin chỉ mở khóa cho AG-1024!');
}

console.log('\n=== TẤT CẢ KIỂM THỬ KHÓA TÀI KHOẢN DO NỢ CƯỚC / QUÁ HẠN THANH TOÁN ĐÃ ĐẠT 100%! ===');
