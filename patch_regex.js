const fs = require('fs');
const path = require('path');

const file_assets = path.join(__dirname, 'assets/js/cargo-store.js');
let assets_content = fs.readFileSync(file_assets, 'utf-8');

assets_content = assets_content.replace(
    /const minAcceptable = hasBids\s*\?\s*\(auction\.currentPriceKg \+ auction\.minStep\)\s*:\s*\(auction\.startingPriceKg \|\| auction\.currentPriceKg\);/g,
    'const minAcceptable = auction.startingPriceKg || auction.currentPriceKg || 0;'
);

assets_content = assets_content.replace(
    /\?\s*`Mức giá của bạn chưa đủ cạnh tranh để vươn lên dẫn đầu\. Vui lòng đặt giá cao hơn!`\s*:\s*`Lượt đặt giá đầu tiên phải tối thiểu bằng giá khởi điểm \$\{formatCurrency\(minAcceptable\)\}\/Kg`/g,
    '`Mức giá tối thiểu để đặt thầu là giá khởi điểm ${formatCurrency(minAcceptable)}/Kg`'
);
assets_content = assets_content.replace(/message: hasBids/g, 'message:');
fs.writeFileSync(file_assets, assets_content, 'utf-8');

const file_detail = path.join(__dirname, '04-Detail.html');
let detail_content = fs.readFileSync(file_detail, 'utf-8');

detail_content = detail_content.replace(
    /const minAcceptable = hasBids\s*\?\s*\(currentAuction\.currentPriceKg \+ currentAuction\.minStep\)\s*:\s*\(currentAuction\.startingPriceKg \|\| currentAuction\.currentPriceKg\);/g,
    'const minAcceptable = currentAuction.startingPriceKg || currentAuction.currentPriceKg || 0;'
);

detail_content = detail_content.replace(
    /alertBox\.innerHTML = hasBids\s*\?\s*`⚠️ Mức giá <strong>\$\{CargoStore\.formatCurrency\(price\)\}\/Kg<\/strong> thấp hơn mức tối thiểu\. Vui lòng nhập tối thiểu <strong>\$\{minFmt\}\/Kg<\/strong> \(Giá hiện tại \+ bước giá \$\{CargoStore\.formatCurrency\(currentAuction\.minStep\)\}\)\.`\s*:\s*`⚠️ Lượt đặt đầu tiên phải tối thiểu bằng giá khởi điểm <strong>\$\{minFmt\}\/Kg<\/strong>\.`;/g,
    'alertBox.innerHTML = `⚠️ Mức giá <strong>${CargoStore.formatCurrency(price)}/Kg</strong> thấp hơn mức tối thiểu. Vui lòng nhập tối thiểu bằng giá khởi điểm <strong>${minFmt}/Kg</strong>.`;'
);
fs.writeFileSync(file_detail, detail_content, 'utf-8');

console.log("Regex patch applied.");
