const fs = require('fs');
const assert = require('assert');

console.log('--- TEST VERIFICATION START ---');

const wonHtml = fs.readFileSync('07-WonAuction.html', 'utf8');
const myBidsHtml = fs.readFileSync('06-MyBids.html', 'utf8');

// Check 1: Won Auction contains PENDING_VERIFICATION payment proof block
assert(wonHtml.includes('Thông tin chuyển khoản đã gửi · Đang chờ Admin xác nhận đối soát'), '07-WonAuction.html must render PENDING_VERIFICATION payment proof block');
assert(wonHtml.includes('Mã giao dịch (FT / Ref):'), '07-WonAuction.html must display transaction reference label');

// Check 2: Won Auction contains PAID payment confirmation block
assert(wonHtml.includes('Xác nhận thanh toán thành công · Đã phát hành AWB'), '07-WonAuction.html must render PAID payment proof block');

// Check 3: Agent Cargo Declaration Header label
assert(wonHtml.includes('Thông tin hàng hóa khai báo vận chuyển (Đại lý đã điền)'), '07-WonAuction.html must clarify agent filled cargo declaration');
assert(wonHtml.includes('Khai báo thông tin hàng hóa vận chuyển (Đại lý thực hiện)'), '07-WonAuction.html must clarify agent task for cargo declaration');

// Check 4: My Bids contains PENDING_VERIFICATION action button
assert(myBidsHtml.includes('Xem biên lai'), '06-MyBids.html must display "Xem biên lai" button when PENDING_VERIFICATION');

console.log('✅ ALL TESTS PASSED SUCCESSFULLY!');
