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

const data = CargoStore.getData();

// 1. AG-1024 should NOT be locked because WON-2026-0815-02 has lockWaivedByAdmin: true
const ag1024 = (data.agentsList || []).find(a => a.code === 'AG-1024');
console.log('1. Trạng thái tài khoản AG-1024:', ag1024.status);
console.log('   Lý do khóa:', ag1024.lockedReason || '(không có)');

if (ag1024.status === 'Đã khóa') {
    throw new Error('AG-1024 KHÔNG được bị khóa vì đơn WON-2026-0815-02 đã có lockWaivedByAdmin:true!');
}
console.log('   -> ĐÚNG: AG-1024 không bị khóa (đơn lịch sử đã được admin miễn trừ)');

// 2. AG-0556 should be locked (WON-20260909-07, không có lockWaivedByAdmin)
const ag0556 = (data.agentsList || []).find(a => a.code === 'AG-0556');
console.log('\n2. Trạng thái tài khoản AG-0556 ban đầu:', ag0556.status);
console.log('   Lý do khóa:', ag0556.lockedReason);

if (ag0556.status !== 'Đã khóa') {
    throw new Error('AG-0556 phải ở trạng thái "Đã khóa" do quá hạn thanh toán đơn WON-20260909-07!');
}
console.log('   -> ĐÚNG: AG-0556 bị khóa vì WON-20260909-07 quá hạn');

// 3. AG-0892 should NOT be locked (tất cả đơn đều PAID)
const ag0892 = (data.agentsList || []).find(a => a.code === 'AG-0892');
console.log('\n3. Trạng thái tài khoản AG-0892 ban đầu:', ag0892.status);
if (ag0892.status !== 'Đang hoạt động') {
    throw new Error('AG-0892 phải ở trạng thái "Đang hoạt động" do đã thanh toán tất cả đơn hàng!');
}
console.log('   -> ĐÚNG: AG-0892 đang hoạt động (tất cả đơn đã PAID)');

// 4. Kiểm tra AG-1024 đăng nhập được (không bị khóa)
console.log('\n4. Thử đăng nhập tài khoản AG-1024 (không bị khóa):');
const loginRes1024 = CargoStore.loginAgent('AG-1024', 'vina123456');
console.log('   Kết quả:', loginRes1024.success ? 'THÀNH CÔNG (ĐÚNG)' : 'BỊ CHẶN (SAI)');
if (!loginRes1024.success) {
    throw new Error('AG-1024 phải đăng nhập được vì lockWaivedByAdmin:true!');
}

// 5. Thử đăng nhập bằng tài khoản AG-0556 -> Phải bị chặn
console.log('\n5. Thử đăng nhập tài khoản AG-0556:');
const loginRes0556 = CargoStore.loginAgent('AG-0556', 'star123456');
console.log('   Kết quả:', loginRes0556.success ? 'THÀNH CÔNG (SAI)' : 'BỊ CHẶN (ĐÚNG)');
console.log('   isLocked:', loginRes0556.isLocked);

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

// 7. Thử Admin mở khóa cho AG-0556
console.log('\n7. Quản trị viên (ADMIN) mở khóa cho AG-0556:');
CargoStore.loginAdmin('admin', 'admin2026');
const unlockRes = CargoStore.toggleUserLock('AG-0556', 'agent');
console.log('   Kết quả mở khóa:', unlockRes.message);

const loginAfterUnlock = CargoStore.loginAgent('AG-0556', 'star123456');
console.log('   Đăng nhập sau khi Admin mở khóa:', loginAfterUnlock.success ? 'THÀNH CÔNG (ĐÚNG)' : 'THẤT BẠI (SAI)');
if (!loginAfterUnlock.success) {
    throw new Error('Sau khi Admin mở khóa, đại lý phải đăng nhập được!');
}

// 8. Kiểm tra độc lập - AG-1024 vẫn không bị khóa
const dataAfter = CargoStore.getData();
const ag1024After = (dataAfter.agentsList || []).find(a => a.code === 'AG-1024');
console.log('\n8. AG-1024 sau khi AG-0556 được mở khóa:', ag1024After.status);
if (ag1024After.status === 'Đã khóa') {
    throw new Error('AG-1024 phải không bị khóa!');
}

console.log('\n=== TẤT CẢ KIỂM THỬ KHÓA TÀI KHOẢN ĐÃ ĐẠT 100%! ===');
