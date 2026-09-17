const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

// 1. Update server_data.json default settings
const serverDataPath = path.join(rootDir, 'server_data.json');
if (fs.existsSync(serverDataPath)) {
    try {
        const sData = JSON.parse(fs.readFileSync(serverDataPath, 'utf8'));
        if (sData.settings) {
            sData.settings.hotline = '1900.6686';
            sData.settings.supportEmail = 'customercare@vietravelairlines.vn';
            fs.writeFileSync(serverDataPath, JSON.stringify(sData, null, 2), 'utf8');
            console.log('✅ Updated server_data.json settings with official Vietravel Airlines contact info!');
        }
    } catch(e) {
        console.error('Error updating server_data.json:', e);
    }
}

// 2. Update cargo-store.js default settings
const cargoStorePath = path.join(rootDir, 'assets', 'js', 'cargo-store.js');
if (fs.existsSync(cargoStorePath)) {
    let content = fs.readFileSync(cargoStorePath, 'utf8');
    content = content.replace(/hotline:\s*['"]1900-[^'"]+['"]/g, "hotline: '1900.6686'");
    content = content.replace(/supportEmail:\s*['"][^'"]+['"]/g, "supportEmail: 'customercare@vietravelairlines.vn'");
    content = content.replace(/1900-xxxx/g, "1900.6686");
    content = content.replace(/1900 6699/g, "1900.6686");
    content = content.replace(/1900 1337/g, "1900.6686");
    content = content.replace(/ops-cargo@vietravelairlines\.vn/g, "customercare@vietravelairlines.vn");
    fs.writeFileSync(cargoStorePath, content, 'utf8');
    console.log('✅ Updated cargo-store.js with official Vietravel Airlines contact info!');
}

// Official Footer Replacement HTML (for user pages)
const userFooterHtml = `
<!-- Footer Official Vietravel Airlines -->
<footer class="bg-slate-950 text-slate-400 text-xs border-t border-slate-800 mt-16">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-8 pb-8 border-b border-slate-800">
            <!-- Cột 1: THÔNG TIN -->
            <div class="lg:col-span-2 space-y-3">
                <h4 class="font-bold text-white text-xs tracking-wider uppercase mb-3 text-blue-400">THÔNG TIN</h4>
                <p class="font-semibold text-slate-200">Trụ sở chính</p>
                <p class="text-slate-400 text-xs leading-relaxed">Số 172 Ngọc Khánh, Phường Giảng Võ, Thành phố Hà Nội, Việt Nam</p>
                <div class="pt-1">
                    <p class="text-slate-400 text-[11px] font-medium">Hotline hỗ trợ:</p>
                    <p class="text-lg font-black text-amber-400 tracking-tight flex flex-col gap-0.5 mt-0.5">
                        <span>1900.6686</span>
                        <span class="text-xs font-bold text-amber-300/90">+84 2873026686</span>
                    </p>
                </div>
                <div class="pt-1">
                    <p class="text-slate-400 text-[11px] font-medium">Chăm sóc khách hàng & Cargo:</p>
                    <a href="mailto:customercare@vietravelairlines.vn" class="text-amber-400 font-semibold hover:underline text-xs block">customercare@vietravelairlines.vn</a>
                    <a href="mailto:cargo@vietravelairlines.vn" class="text-blue-400 font-semibold hover:underline text-xs block">cargo@vietravelairlines.vn</a>
                </div>
            </div>

            <!-- Cột 2: VIETRAVEL AIRLINES -->
            <div>
                <h4 class="font-bold text-white text-xs tracking-wider uppercase mb-3 text-blue-400">VIETRAVEL AIRLINES</h4>
                <ul class="space-y-2 text-xs">
                    <li><a href="https://www.vietravelairlines.com" target="_blank" class="hover:text-white transition">T&T Group</a></li>
                    <li><a href="https://www.vietravelairlines.com" target="_blank" class="hover:text-white transition">Giới thiệu về Vietravel Airlines</a></li>
                    <li><a href="https://www.vietravelairlines.com" target="_blank" class="hover:text-white transition">Thông tin báo chí</a></li>
                    <li><a href="https://www.vietravelairlines.com" target="_blank" class="hover:text-white transition">Điểm đến</a></li>
                    <li><a href="https://www.vietravelairlines.com" target="_blank" class="hover:text-white transition">Cơ hội nghề nghiệp</a></li>
                </ul>
            </div>

            <!-- Cột 3: LIÊN HỆ -->
            <div>
                <h4 class="font-bold text-white text-xs tracking-wider uppercase mb-3 text-blue-400">LIÊN HỆ</h4>
                <ul class="space-y-2 text-xs">
                    <li><a href="03-Index.html" class="hover:text-white transition">Thông tin GSA</a></li>
                    <li><a href="08-Notifications.html" class="hover:text-white transition">Liên hệ Hãng</a></li>
                    <li><a href="03-Index.html" class="hover:text-white transition">Sàn Đấu Giá Cargo</a></li>
                </ul>
            </div>

            <!-- Cột 4: PHÁP LÝ -->
            <div>
                <h4 class="font-bold text-white text-xs tracking-wider uppercase mb-3 text-blue-400">PHÁP LÝ</h4>
                <ul class="space-y-2 text-xs">
                    <li><a href="10-Terms.html" class="hover:text-white transition">Quy định pháp luật liên quan</a></li>
                    <li><a href="10-Terms.html" class="hover:text-white transition">Chính sách Thương mại</a></li>
                    <li><a href="10-Terms.html" class="hover:text-white transition">Điều lệ vận chuyển</a></li>
                </ul>
            </div>

            <!-- Cột 5: HỖ TRỢ -->
            <div>
                <h4 class="font-bold text-white text-xs tracking-wider uppercase mb-3 text-blue-400">HỖ TRỢ</h4>
                <ul class="space-y-2 text-xs">
                    <li><a href="08-Notifications.html" class="hover:text-white transition">Chăm sóc khách hàng</a></li>
                    <li><a href="10-Terms.html" class="hover:text-white transition">Hỏi đáp & Quy trình</a></li>
                    <li><a href="03-Index.html" class="hover:text-white transition">Lịch bay & Tải trọng Cargo</a></li>
                </ul>
            </div>
        </div>

        <!-- Bottom Copyright & Legal Info -->
        <div class="pt-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div class="flex items-center gap-3">
                <img src="assets/images/vietravel-logo-white.png" alt="Vietravel Airlines Logo" class="h-7 object-contain" />
                <div class="text-[10px] text-slate-400 leading-tight">
                    <p class="font-bold text-white uppercase">CÔNG TY CỔ PHẦN HÀNG KHÔNG LỮ HÀNH VIỆT NAM (Vietravel Airlines)</p>
                    <p class="text-slate-400 text-[10px] mt-0.5">Mã số doanh nghiệp: <strong>3301644331</strong>, đăng ký lần đầu ngày 19/02/2019, đăng ký thay đổi lần thứ 9 ngày 12/12/2025, cấp bởi Sở Tài chính TP. Hà Nội.</p>
                </div>
            </div>

            <div class="flex flex-wrap items-center gap-4 text-[10px] text-slate-400">
                <a href="10-Terms.html" class="hover:text-white transition">Điều kiện sử dụng cookies</a>
                <span>|</span>
                <a href="10-Terms.html" class="hover:text-white transition">Chính sách bảo mật thông tin</a>
                <span>|</span>
                <a href="10-Terms.html" class="hover:text-white transition">Điều khoản sử dụng website</a>
                <span class="bg-blue-600/30 text-blue-400 font-bold px-2 py-0.5 rounded text-[10px] border border-blue-500/30 flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> ĐÃ THÔNG BÁO BỘ CÔNG THƯƠNG</span>
            </div>
        </div>
    </div>
</footer>`;

// 3. Process HTML files in root directory
const files = fs.readdirSync(rootDir).filter(f => f.endsWith('.html'));

files.forEach(file => {
    const filePath = path.join(rootDir, file);
    let html = fs.readFileSync(filePath, 'utf8');

    // Replace header VN div logo with official img logo
    html = html.replace(/<div class="[^"]*">VN<\/div>/g, '<img src="assets/images/vietravel-logo-official.png" alt="Vietravel Airlines Logo" class="h-7 sm:h-8 object-contain" />');

    // Replace footer if present
    if (html.includes('<footer') && html.includes('</footer>')) {
        html = html.replace(/<footer[\s\S]*?<\/footer>/, userFooterHtml);
    }

    // Replace hotline and email placeholders
    html = html.replace(/1900-xxxx/g, '1900.6686');
    html = html.replace(/1900 6699/g, '1900.6686');
    html = html.replace(/1900 1337/g, '1900.6686');
    html = html.replace(/cargo-bidding@airline\.vn/g, 'customercare@vietravelairlines.vn');
    html = html.replace(/ops-cargo@vietravelairlines\.vn/g, 'customercare@vietravelairlines.vn');

    fs.writeFileSync(filePath, html, 'utf8');
    console.log(`✅ Updated branding in ${file}`);
});

// 4. Process HTML files in Admin subfolder
const adminDir = path.join(rootDir, 'Admin');
if (fs.existsSync(adminDir)) {
    const adminFiles = fs.readdirSync(adminDir).filter(f => f.endsWith('.html'));
    adminFiles.forEach(file => {
        const filePath = path.join(adminDir, file);
        let html = fs.readFileSync(filePath, 'utf8');

        html = html.replace(/<div class="[^"]*">VN<\/div>/g, '<img src="../assets/images/vietravel-logo-official.png" alt="Vietravel Airlines Logo" class="h-7 sm:h-8 object-contain" />');

        html = html.replace(/1900-xxxx/g, '1900.6686');
        html = html.replace(/1900 6699/g, '1900.6686');
        html = html.replace(/1900 1337/g, '1900.6686');
        html = html.replace(/cargo-bidding@airline\.vn/g, 'customercare@vietravelairlines.vn');
        html = html.replace(/ops-cargo@vietravelairlines\.vn/g, 'customercare@vietravelairlines.vn');

        fs.writeFileSync(filePath, html, 'utf8');
        console.log(`✅ Updated branding in Admin/${file}`);
    });
}
