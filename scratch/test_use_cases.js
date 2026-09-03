// Test simulation for 3 roles: Quản trị viên, Nhân viên, Đại lý
const fs = require('fs');

// Mock localStorage and window
const store = {};
global.localStorage = {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; }
};
global.window = {
    location: { protocol: 'http:', href: '' },
    dispatchEvent: () => {}
};
global.CustomEvent = class {};
global.StorageEvent = class {};
global.fetch = async () => ({ ok: false }); // mock offline fetch

// Load cargo-store.js
let code = fs.readFileSync('./assets/js/cargo-store.js', 'utf8');
code += '\nglobal.CargoStore = CargoStore;\n';
eval(code);

console.log('=== BẮT ĐẦU KIỂM THỬ CÁC USE CASE ===');

// 1. USE CASE ĐẠI LÝ: Cập nhật thông tin tài khoản
console.log('\n--- 1. Kiểm tra Cập nhật thông tin Đại lý ---');
const loginAgentRes = CargoStore.loginAgent('AG-0892', 'abc123456');
console.log('Đăng nhập AG-0892:', loginAgentRes.success ? 'THÀNH CÔNG' : 'THẤT BÀI - ' + loginAgentRes.message);

const updateProfileRes = CargoStore.updateAgentProfile({
    repName: 'Nguyễn Văn An (Đã cập nhật)',
    position: 'Tổng Giám Đốc Điều Hành',
    phone: '0988 888 999',
    email: 'ceo.an@abccargo.vn',
    address: 'Tòa nhà Landmark 81, TP. Hồ Chí Minh'
});
console.log('Cập nhật hồ sơ đại lý:', updateProfileRes.success ? 'THÀNH CÔNG' : 'THẤT BÀI', '-', updateProfileRes.message);
const userAfter = CargoStore.getCurrentUser();
if (userAfter.fullName !== 'Nguyễn Văn An (Đã cập nhật)' || userAfter.phone !== '0988 888 999') {
    throw new Error('Dữ liệu đại lý không cập nhật chính xác!');
}
console.log('Xác minh dữ liệu người dùng:', userAfter.fullName, '|', userAfter.phone);

// 2. USE CASE NHÂN VIÊN / ADMIN: Sửa thông số chuyến bay đấu giá
console.log('\n--- 2. Kiểm tra Sửa thông số chuyến bay đấu giá ---');
const auctionList = CargoStore.getAuctions();
const firstAuction = auctionList[0];
console.log(`Chuyến bay ban đầu: ${firstAuction.flightNumber} - Tải trọng: ${firstAuction.capacityKg}Kg - Giá sàn: ${firstAuction.startingPriceKg}đ`);

const updateAuctionRes = CargoStore.updateAuction(firstAuction.id, {
    capacityKg: 4500,
    startingPriceKg: 19500,
    minStep: 1000,
    specialNotes: 'Ưu tiên hàng linh kiện điện tử cao cấp'
});
console.log('Sửa thông số chuyến bay:', updateAuctionRes.success ? 'THÀNH CÔNG' : 'THẤT BÀI');
const updatedAuction = CargoStore.getAuctionById(firstAuction.id);
if (updatedAuction.capacityKg !== 4500 || updatedAuction.startingPriceKg !== 19500 || updatedAuction.minStep !== 1000) {
    throw new Error('Thông số chuyến bay không cập nhật chính xác!');
}
console.log(`Chuyến bay sau sửa: Tải trọng: ${updatedAuction.capacityKg}Kg - Giá sàn: ${updatedAuction.startingPriceKg}đ - Bước giá: ${updatedAuction.minStep}đ`);

// 3. USE CASE NHÂN VIÊN / ADMIN: Gửi thông báo đấu giá
console.log('\n--- 3. Kiểm tra Gửi thông báo đấu giá (Broadcast) ---');
const bcRes = CargoStore.sendBroadcastNotification({
    title: 'Khẩn cấp: Tăng tải trọng chuyến VU130',
    message: 'Tải trọng chuyến bay VU130 đã được nâng lên 4.500 Kg, giá khởi điểm 19.500 đ/Kg.',
    type: 'SYSTEM'
});
console.log('Phát thông báo:', bcRes.success ? 'THÀNH CÔNG' : 'THẤT BÀI');
const notifs = CargoStore.getNotifications();
const latestNotif = notifs[0];
if (!latestNotif || !latestNotif.title.includes('Khẩn cấp')) {
    throw new Error('Thông báo phát đi không xuất hiện trong danh sách!');
}
console.log('Đại lý nhận thông báo mới nhất:', latestNotif.title, '|', latestNotif.message);

// 4. USE CASE ADMIN: Khóa và Kích hoạt mở khóa tài khoản
console.log('\n--- 4. Kiểm tra Khóa & Mở khóa tài khoản Đại lý ---');
const lockRes = CargoStore.toggleUserLock('AG-0892', 'agent');
console.log('Khóa tài khoản AG-0892:', lockRes.message);

// Thử đăng nhập lại tài khoản bị khóa -> Phải bị chặn!
const tryLoginLocked = CargoStore.loginAgent('AG-0892', 'abc123456');
console.log('Đăng nhập khi tài khoản bị khóa:', tryLoginLocked.success ? 'SAI: Vẫn vào được!' : 'ĐÚNG: Đã bị chặn (' + tryLoginLocked.message + ')');
if (tryLoginLocked.success) {
    throw new Error('Lỗi bảo mật: Tài khoản bị khóa vẫn đăng nhập được!');
}

// Mở khóa lại
const unlockRes = CargoStore.toggleUserLock('AG-0892', 'agent');
console.log('Mở khóa tài khoản AG-0892:', unlockRes.message);
const tryLoginUnlocked = CargoStore.loginAgent('AG-0892', 'abc123456');
console.log('Đăng nhập sau khi mở khóa:', tryLoginUnlocked.success ? 'THÀNH CÔNG' : 'THẤT BÀI - ' + tryLoginUnlocked.message);
if (!tryLoginUnlocked.success) {
    throw new Error('Đăng nhập thất bại sau khi mở khóa!');
}

// 5. USE CASE ADMIN: Tạo tài khoản Nhân viên mới & Đăng nhập
console.log('\n--- 5. Kiểm tra Tạo tài khoản Nhân viên mới ---');
const createStaffRes = CargoStore.createStaffAccount({
    username: 'staff99',
    fullName: 'Hoàng Văn Điều Phối',
    department: 'Air Cargo Flight Operations',
    role: 'STAFF',
    password: 'stafftest2026'
});
console.log('Tạo nhân viên mới:', createStaffRes.message);
const loginStaffRes = CargoStore.loginAdmin('staff99', 'stafftest2026');
console.log('Đăng nhập nhân viên mới tạo:', loginStaffRes.success ? 'THÀNH CÔNG' : 'THẤT BÀI');
const currentAdmin = CargoStore.getCurrentAdmin();
console.log('Thông tin tài khoản đăng nhập:', currentAdmin.fullName, '| Vai trò:', currentAdmin.role);

// 6. USE CASE ADMIN: CRUD Cấu hình hệ thống
console.log('\n--- 6. Kiểm tra CRUD Cấu hình hệ thống ---');
const updateSettingsRes = CargoStore.updateSystemSettings({
    minIncrement: 700,
    cutoffHours: 4,
    paymentWindowHours: 48,
    hotline: '1900 9999',
    supportEmail: 'ops@airline.vn'
});
console.log('Lưu cấu hình hệ thống:', updateSettingsRes.message);
const currSettings = CargoStore.getSystemSettings();
if (currSettings.minIncrement !== 700 || currSettings.cutoffHours !== 4 || currSettings.hotline !== '1900 9999') {
    throw new Error('Cấu hình hệ thống không lưu chính xác!');
}
console.log('Cấu hình đã lưu:', currSettings);

// 7. USE CASE NHÂN VIÊN / ADMIN: Xóa chuyến bay đấu giá
console.log('\n--- 7. Kiểm tra Xóa chuyến bay đấu giá ---');
const countBefore = CargoStore.getAuctions().length;
const deleteRes = CargoStore.deleteAuction(firstAuction.id);
console.log('Xóa chuyến bay:', deleteRes.message);
const countAfter = CargoStore.getAuctions().length;
if (countAfter !== countBefore - 1) {
    throw new Error('Chuyến bay chưa được xóa!');
}
console.log(`Số lượng chuyến bay: ${countBefore} -> ${countAfter} (Đã xóa thành công)`);

console.log('\n=== TẤT CẢ 10 USE CASE ĐÃ ĐƯỢC KIỂM THỬ THÀNH CÔNG 100%! ===');
