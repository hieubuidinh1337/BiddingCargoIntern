const fs = require('fs');
const path = require('path');

const files_to_patch = [
    ['db.js', 
     'const minPriceRequired = currentPrice + ((Number(auction.bidsCount) || 0) > 0 ? minStep : 0);',
     'const minPriceRequired = Number(auction.startingPriceKg) || 0;'],

    ['assets/js/cargo-store.js',
     'const minAcceptable = hasBids\n                ? (auction.currentPriceKg + auction.minStep)\n                : (auction.startingPriceKg || auction.currentPriceKg);',
     'const minAcceptable = auction.startingPriceKg || auction.currentPriceKg || 0;'],

    ['assets/js/cargo-store.js',
     '? `Mức giá của bạn chưa đủ cạnh tranh để vươn lên dẫn đầu. Vui lòng đặt giá cao hơn!`\n                        : `Lượt đặt giá đầu tiên phải tối thiểu bằng giá khởi điểm ${formatCurrency(minAcceptable)}/Kg`',
     '`Mức giá tối thiểu để đặt thầu là giá khởi điểm ${formatCurrency(minAcceptable)}/Kg`'],

    ['04-Detail.html',
     'const minAcceptable = hasBids\n                ? (currentAuction.currentPriceKg + currentAuction.minStep)\n                : (currentAuction.startingPriceKg || currentAuction.currentPriceKg);',
     'const minAcceptable = currentAuction.startingPriceKg || currentAuction.currentPriceKg || 0;'],

    ['04-Detail.html',
     'alertBox.innerHTML = hasBids\n                    ? `⚠️ Mức giá <strong>${CargoStore.formatCurrency(price)}/Kg</strong> thấp hơn mức tối thiểu. Vui lòng nhập tối thiểu <strong>${minFmt}/Kg</strong> (Giá hiện tại + bước giá ${CargoStore.formatCurrency(currentAuction.minStep)}).`\n                    : `⚠️ Lượt đặt đầu tiên phải tối thiểu bằng giá khởi điểm <strong>${minFmt}/Kg</strong>.`;',
     'alertBox.innerHTML = `⚠️ Mức giá <strong>${CargoStore.formatCurrency(price)}/Kg</strong> thấp hơn mức tối thiểu. Vui lòng nhập tối thiểu bằng giá khởi điểm <strong>${minFmt}/Kg</strong>.`;'],
     
    ['04-Detail.html',
     '${isMine ? CargoStore.formatCurrency(b.priceKg) : \'??? (Ẩn)\'}',
     '${(isMine || isClosed) ? CargoStore.formatCurrency(b.priceKg) : \'??? (Ẩn)\'}'],
     
    ['04-Detail.html',
     '${isMine ? CargoStore.formatCurrency(b.priceKg * b.weightKg) : \'??? (Ẩn)\'}',
     '${(isMine || isClosed) ? CargoStore.formatCurrency(b.priceKg * b.weightKg) : \'??? (Ẩn)\'}'],
     
    ['06-MyBids.html',
     '${isMe ? (CargoStore.formatCurrency ? CargoStore.formatCurrency(price) : price + \' đ\') : \'??? (Ẩn)\'}',
     '${(isMe || auction.status === \'CLOSED\') ? (CargoStore.formatCurrency ? CargoStore.formatCurrency(price) : price + \' đ\') : \'??? (Ẩn)\'}'],
     
    ['06-MyBids.html',
     '${isMe ? (CargoStore.formatCurrency ? CargoStore.formatCurrency(total) : total + \' đ\') : \'??? (Ẩn)\'}',
     '${(isMe || auction.status === \'CLOSED\') ? (CargoStore.formatCurrency ? CargoStore.formatCurrency(total) : total + \' đ\') : \'??? (Ẩn)\'}'],
     
    ['05-Watchlist.html',
     'modalMinPrice = hasBids ? (a.currentPriceKg + (a.minStep || 500)) : (a.startingPriceKg || a.currentPriceKg);',
     'modalMinPrice = a.startingPriceKg || a.currentPriceKg || 0;'],
     
    ['05-Watchlist.html',
     'document.getElementById(\'modalCurrentPrice\').textContent = \'??? (Ẩn)\';',
     'document.getElementById(\'modalCurrentPrice\').textContent = (a.status === \'CLOSED\') ? (CargoStore.formatCurrency(a.currentPriceKg) + \' đ/Kg\') : \'??? (Ẩn)\';'],
     
    ['05-Watchlist.html',
     '<p class=\"text-xl font-bold text-gray-500\">??? (Ẩn)</p>',
     '<p class=\"text-xl font-bold ${a.status === \'CLOSED\' ? \'text-blue-600\' : \'text-gray-500\'}\">${a.status === \'CLOSED\' ? (CargoStore.formatCurrency(a.currentPriceKg) + \' đ/Kg\') : \'??? (Ẩn)\'}</p>'],
     
    ['05-Watchlist.html',
     '<p class=\"text-base font-bold text-slate-700\">??? (Ẩn)</p>',
     '<p class=\"text-base font-bold text-slate-700\">${a.status === \'CLOSED\' ? (CargoStore.formatCurrency(a.currentPriceKg * (a.capacityKg || a.chargeableWeightKg || 0)) + \' đ\') : \'??? (Ẩn)\'}</p>'],
     
    ['02-Dashboard.html',
     '<p class=\"text-base font-bold text-gray-500\">??? (Ẩn)</p>',
     '<p class=\"text-base font-bold ${a.status === \'CLOSED\' ? \'text-blue-600\' : \'text-gray-500\'}\">${a.status === \'CLOSED\' ? (CargoStore.formatCurrency(a.currentPriceKg) + \' đ/Kg\') : \'??? (Ẩn)\'}</p>'],
     
    ['03-Index.html',
     '<p class=\"text-lg font-bold text-gray-500\">??? (Ẩn)</p>',
     '<p class=\"text-lg font-bold ${a.status === \'CLOSED\' ? \'text-blue-600\' : \'text-gray-500\'}\">${a.status === \'CLOSED\' ? (CargoStore.formatCurrency(a.currentPriceKg) + \' đ/Kg\') : \'??? (Ẩn)\'}</p>']
];

for (const [filename, target, replacement] of files_to_patch) {
    const p = path.join(__dirname, filename);
    if (!fs.existsSync(p)) continue;
    
    let content = fs.readFileSync(p, 'utf-8');
    const targetNorm = target.replace(/\\r\\n/g, '\\n');
    content = content.replace(/\\r\\n/g, '\\n');
    
    if (content.includes(targetNorm)) {
        content = content.replace(targetNorm, replacement);
        fs.writeFileSync(p, content, 'utf-8');
        console.log(`Patched ${filename}`);
    } else {
        console.log(`Target not found in ${filename}`);
    }
}
