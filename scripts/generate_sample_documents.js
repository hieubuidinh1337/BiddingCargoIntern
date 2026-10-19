const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

async function createAllSampleDocuments() {
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fontRegularBytes = fs.readFileSync('C:\\Windows\\Fonts\\arial.ttf');
    const fontBoldBytes = fs.readFileSync('C:\\Windows\\Fonts\\arialbd.ttf');

    // 1. GPKD_Doanh_Nghiep.pdf
    await generateGPKD(uploadsDir, fontRegularBytes, fontBoldBytes);

    // 2. IATA_Cargo_Authorization.pdf
    await generateIATA(uploadsDir, fontRegularBytes, fontBoldBytes);

    // 3. CCCD_NguoiDaiDien.pdf
    await generateCCCD(uploadsDir, fontRegularBytes, fontBoldBytes);

    // 4. Quy_che_dau_gia_tai_trong_Vietravel_Cargo.pdf
    await generateQuyChe(uploadsDir, fontRegularBytes, fontBoldBytes);

    console.log('All 4 sample PDF documents generated successfully in uploads/');
}

// -------------------------------------------------------------
// 1. GIẤY CHỨNG NHẬN ĐĂNG KÝ DOANH NGHIỆP (GPKD)
// -------------------------------------------------------------
async function generateGPKD(outDir, fontReg, fontBold) {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const regular = await doc.embedFont(fontReg);
    const bold = await doc.embedFont(fontBold);

    const page = doc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    // Decorative Border
    page.drawRectangle({
        x: 20,
        y: 20,
        width: width - 40,
        height: height - 40,
        borderColor: rgb(0.7, 0.55, 0.2),
        borderWidth: 2,
    });
    page.drawRectangle({
        x: 24,
        y: 24,
        width: width - 48,
        height: height - 48,
        borderColor: rgb(0.8, 0.7, 0.4),
        borderWidth: 0.8,
    });

    let y = height - 55;

    // Header
    page.drawText('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', {
        x: 140,
        y,
        size: 13,
        font: bold,
        color: rgb(0.8, 0.1, 0.1)
    });
    y -= 18;
    page.drawText('Độc lập - Tự do - Hạnh phúc', {
        x: 215,
        y,
        size: 12,
        font: bold,
        color: rgb(0.1, 0.1, 0.1)
    });
    y -= 8;
    page.drawLine({
        start: { x: 200, y },
        end: { x: 395, y },
        thickness: 1,
        color: rgb(0.1, 0.1, 0.1)
    });

    y -= 35;
    page.drawText('SỞ KẾ HOẠCH VÀ ĐẦU TƯ TP. HỒ CHÍ MINH', {
        x: 40,
        y,
        size: 10,
        font: bold,
        color: rgb(0.2, 0.2, 0.2)
    });
    page.drawText('PHÒNG ĐĂNG KÝ KINH DOANH', {
        x: 40,
        y: y - 14,
        size: 9.5,
        font: regular,
        color: rgb(0.3, 0.3, 0.3)
    });

    y -= 45;
    page.drawText('GIẤY CHỨNG NHẬN ĐĂNG KÝ DOANH NGHIỆP', {
        x: 100,
        y,
        size: 17,
        font: bold,
        color: rgb(0.75, 0.1, 0.1)
    });
    y -= 20;
    page.drawText('CÔNG TY TNHH HAI THÀNH VIÊN TRỞ LÊN', {
        x: 155,
        y,
        size: 13,
        font: bold,
        color: rgb(0.1, 0.2, 0.5)
    });
    y -= 16;
    page.drawText('Mã số doanh nghiệp: 0312345678 (Đăng ký lần đầu: 15/03/2018)', {
        x: 125,
        y,
        size: 10,
        font: regular,
        color: rgb(0.2, 0.2, 0.2)
    });

    y -= 30;

    const sections = [
        ['1. Tên doanh nghiệp viết bằng tiếng Việt:', 'CÔNG TY TNHH VẬN TẢI ABC LOGISTICS'],
        ['   Tên doanh nghiệp viết bằng tiếng Anh:', 'ABC LOGISTICS TRANSPORT COMPANY LIMITED'],
        ['   Tên viết tắt:', 'ABC LOGISTICS CO., LTD (Mã đại lý: AG-0892)'],
        ['2. Địa chỉ trụ sở chính:', 'Tầng 8, Tòa nhà V-Tower, 123 Nguyễn Huệ, P. Bến Nghé, Quận 1, TP. HCM'],
        ['   Điện thoại: 028 3822 9999 / 0901 234 567', 'Email: an.nguyen@abccargo.vn - Website: https://abccargo.vn'],
        ['3. Vốn điều lệ:', '50.000.000.000 VNĐ (Năm mươi tỷ đồng chẵn)'],
        ['4. Người đại diện theo pháp luật:', 'NGUYỄN VĂN AN'],
        ['   Chức danh: Giám đốc điều hành', 'Sinh ngày: 15/08/1984 - Quốc tịch: Việt Nam'],
        ['   Số CCCD/Hộ chiếu: 079090001234', 'Ngày cấp: 10/05/2021 tại Cục Cảnh sát QLHC về TTXH'],
        ['   Địa chỉ thường trú:', 'Số 45/12 Lê Lợi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh'],
        ['5. Ngành, nghề kinh doanh chính:', 'Vận tải hàng hóa hàng không, dịch vụ giao nhận kho vận quốc tế (Freight Forwarding), dịch vụ logistics tổng hợp (Mã ngành: 5120 - 5229)']
    ];

    sections.forEach(([title, val]) => {
        page.drawText(title, { x: 45, y, size: 9.5, font: bold, color: rgb(0.1, 0.2, 0.3) });
        y -= 14;
        if (val) {
            page.drawText(val, { x: 60, y, size: 9.5, font: regular, color: rgb(0.1, 0.1, 0.1) });
            y -= 16;
        }
    });

    // E-KYC Badge
    y -= 10;
    page.drawRectangle({
        x: 45,
        y: y - 5,
        width: 505,
        height: 50,
        color: rgb(0.95, 0.98, 0.95),
        borderColor: rgb(0.2, 0.7, 0.3),
        borderWidth: 1
    });
    page.drawText('XÁC THỰC SỐ HÓA E-KYC HỢP LỆ TRÊN CỔNG ĐẤU GIÁ CARGO VIETRAVEL AIRLINES', {
        x: 60,
        y: y + 25,
        size: 9.5,
        font: bold,
        color: rgb(0.1, 0.5, 0.2)
    });
    page.drawText('Mã định danh E-KYC: KYC-AG0892-2026-VERIFIED | Ngày xác thực: 15/03/2026 bởi ITD & Legal Dept', {
        x: 60,
        y: y + 10,
        size: 8.5,
        font: regular,
        color: rgb(0.2, 0.4, 0.2)
    });

    // Stamp & Signature Simulation
    y -= 50;
    page.drawText('TP. Hồ Chí Minh, ngày 15 tháng 03 năm 2026', { x: 330, y, size: 9, font: regular, color: rgb(0.3, 0.3, 0.3) });
    y -= 14;
    page.drawText('TRƯỞNG PHÒNG ĐĂNG KÝ KINH DOANH', { x: 330, y, size: 9.5, font: bold, color: rgb(0.1, 0.1, 0.1) });
    y -= 30;
    page.drawCircle({
        x: 410,
        y: y - 10,
        size: 32,
        borderColor: rgb(0.85, 0.15, 0.15),
        borderWidth: 1.5
    });
    page.drawText('ĐÃ CHỨNG THỰC ĐIỆN TỬ', { x: 360, y: y - 8, size: 7.5, font: bold, color: rgb(0.85, 0.15, 0.15) });
    page.drawText('SỞ KH&ĐT TP.HCM', { x: 375, y: y - 18, size: 7.5, font: bold, color: rgb(0.85, 0.15, 0.15) });

    const pdfBytes = await doc.save();
    fs.writeFileSync(path.join(outDir, 'GPKD_Doanh_Nghiep.pdf'), pdfBytes);
}

// -------------------------------------------------------------
// 2. GIẤY ỦY QUYỀN ĐẠI LÝ CARGO / CHỨNG NHẬN IATA
// -------------------------------------------------------------
async function generateIATA(outDir, fontReg, fontBold) {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const regular = await doc.embedFont(fontReg);
    const bold = await doc.embedFont(fontBold);

    const page = doc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();

    // Border
    page.drawRectangle({
        x: 20,
        y: 20,
        width: width - 40,
        height: height - 40,
        borderColor: rgb(0.1, 0.35, 0.65),
        borderWidth: 2,
    });
    page.drawRectangle({
        x: 24,
        y: 24,
        width: width - 48,
        height: height - 48,
        borderColor: rgb(0.3, 0.55, 0.8),
        borderWidth: 0.8,
    });

    let y = height - 55;

    page.drawText('INTERNATIONAL AIR TRANSPORT ASSOCIATION (IATA)', {
        x: 130,
        y,
        size: 12,
        font: bold,
        color: rgb(0.1, 0.3, 0.6)
    });
    y -= 16;
    page.drawText('& VIETRAVEL AIRLINES CARGO DIRECTORATE', {
        x: 170,
        y,
        size: 11,
        font: bold,
        color: rgb(0.8, 0.2, 0.1)
    });
    y -= 10;
    page.drawLine({
        start: { x: 150, y },
        end: { x: 445, y },
        thickness: 1,
        color: rgb(0.1, 0.3, 0.6)
    });

    y -= 45;
    page.drawText('CARGO AGENT ACCREDITATION CERTIFICATE', {
        x: 105,
        y,
        size: 16,
        font: bold,
        color: rgb(0.1, 0.2, 0.5)
    });
    y -= 18;
    page.drawText('GIẤY CHỨNG NHẬN & ỦY QUYỀN ĐẠI LÝ HÀNG HÓA HÀNG KHÔNG CHÍNH THỨC', {
        x: 75,
        y,
        size: 10.5,
        font: bold,
        color: rgb(0.8, 0.2, 0.1)
    });
    y -= 15;
    page.drawText('Số ủy quyền: IATA-CASS-VN-0892 | Niên khóa thẩm định: 2024 - 2027', {
        x: 140,
        y,
        size: 9.5,
        font: regular,
        color: rgb(0.3, 0.3, 0.3)
    });

    y -= 35;
    const content = [
        ['ĐƠN VỊ ĐƯỢC CHỨNG NHẬN / ACCREDITED CARGO AGENT:', ''],
        ['Tên đại lý:', 'CÔNG TY TNHH VẬN TẢI ABC LOGISTICS'],
        ['Mã IATA Numeric Code:', '37-4 0892 / CASS Code: VN-0892'],
        ['Địa chỉ đăng ký hoạt động:', 'Tầng 8, Tòa nhà V-Tower, 123 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh'],
        ['Đại diện thẩm định:', 'Ông NGUYỄN VĂN AN - Giám đốc điều hành'],
        ['', ''],
        ['QUYỀN HẠN VÀ PHẠM VI ỦY QUYỀN TẢI TRỌNG:', ''],
        ['1. Khai thác vận chuyển hàng không:', 'Được quyền trực tiếp xuất vận đơn hàng không điện tử (e-AWB - Hãng VU / 897), đăng ký tải trọng chuyến bay và tham gia toàn bộ các phiên đấu thầu tải trọng trực tuyến của Vietravel Airlines.'],
        ['2. Hạng mức tín dụng & Ký quỹ:', 'Tier 1 CASS Accredited - Hạn mức bảo lãnh thanh toán tiêu chuẩn theo quy chế CASS Việt Nam.'],
        ['3. Chứng chỉ chuyên ngành:', 'Đã hoàn tất kiểm định nhân sự theo chuẩn IATA DGR Cat 6 (Hàng nguy hiểm) và Live Animals Regulations (LAR).'],
        ['4. Hiệu lực chứng nhận:', 'Chứng nhận có hiệu lực từ ngày 01/01/2024 đến hết ngày 31/12/2027 trên toàn mạng bay nội địa và quốc tế của Vietravel Airlines.']
    ];

    content.forEach(([lbl, val]) => {
        if (!val) {
            y -= 6;
            page.drawText(lbl, { x: 45, y, size: 10, font: bold, color: rgb(0.1, 0.25, 0.5) });
            y -= 16;
        } else {
            page.drawText(lbl, { x: 50, y, size: 9.5, font: bold, color: rgb(0.2, 0.2, 0.2) });
            y -= 14;
            page.drawText(val, { x: 65, y, size: 9, font: regular, color: rgb(0.15, 0.15, 0.15) });
            y -= 16;
        }
    });

    y -= 25;
    // Seal box
    page.drawRectangle({
        x: 45,
        y: y - 5,
        width: 505,
        height: 65,
        color: rgb(0.96, 0.98, 1.0),
        borderColor: rgb(0.2, 0.4, 0.8),
        borderWidth: 1
    });
    page.drawText('VIETRAVEL AIRLINES CARGO OPERATIONS - AUDIT STATUS: COMPLIANT', {
        x: 60,
        y: y + 42,
        size: 9.5,
        font: bold,
        color: rgb(0.1, 0.3, 0.7)
    });
    page.drawText('Hồ sơ đại lý đã vượt qua kỳ thẩm tra năng lực pháp lý & vận hành kho bãi Tân Sơn Nhất / Nội Bài.', {
        x: 60,
        y: y + 26,
        size: 8.5,
        font: regular,
        color: rgb(0.2, 0.3, 0.5)
    });
    page.drawText('Trạng thái trên Sàn Bidding Cargo: HOẠT ĐỘNG TOÀN DIỆN (TIER 1 ELITE)', {
        x: 60,
        y: y + 10,
        size: 8.5,
        font: bold,
        color: rgb(0.1, 0.5, 0.2)
    });

    const pdfBytes = await doc.save();
    fs.writeFileSync(path.join(outDir, 'IATA_Cargo_Authorization.pdf'), pdfBytes);
}

// -------------------------------------------------------------
// 3. BẢN CHỤP CCCD / HỘ CHIẾU NGƯỜI ĐẠI DIỆN
// -------------------------------------------------------------
async function generateCCCD(outDir, fontReg, fontBold) {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const regular = await doc.embedFont(fontReg);
    const bold = await doc.embedFont(fontBold);

    const page = doc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();

    // Border
    page.drawRectangle({
        x: 20,
        y: 20,
        width: width - 40,
        height: height - 40,
        borderColor: rgb(0.3, 0.3, 0.3),
        borderWidth: 1.5,
    });

    let y = height - 55;

    page.drawText('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', {
        x: 140,
        y,
        size: 13,
        font: bold,
        color: rgb(0.8, 0.1, 0.1)
    });
    y -= 18;
    page.drawText('Độc lập - Tự do - Hạnh phúc', {
        x: 215,
        y,
        size: 12,
        font: bold,
        color: rgb(0.1, 0.1, 0.1)
    });
    y -= 8;
    page.drawLine({
        start: { x: 200, y },
        end: { x: 395, y },
        thickness: 1,
        color: rgb(0.1, 0.1, 0.1)
    });

    y -= 35;
    page.drawText('BẢN SAO CHỨNG THỰC CĂN CƯỚC CÔNG DÂN GẮN CHIP', {
        x: 95,
        y,
        size: 14,
        font: bold,
        color: rgb(0.1, 0.2, 0.4)
    });
    y -= 16;
    page.drawText('(Dành cho Người đại diện pháp luật đăng ký tài khoản đấu giá Cargo)', {
        x: 125,
        y,
        size: 9.5,
        font: regular,
        color: rgb(0.4, 0.4, 0.4)
    });

    // Simulated CCCD Front Card
    y -= 35;
    page.drawRectangle({
        x: 55,
        y: y - 130,
        width: 480,
        height: 140,
        color: rgb(0.96, 0.98, 0.96),
        borderColor: rgb(0.3, 0.6, 0.4),
        borderWidth: 1.5
    });

    page.drawText('CĂN CƯỚC CÔNG DÂN / IDENTITY CARD', {
        x: 170,
        y: y - 18,
        size: 11,
        font: bold,
        color: rgb(0.8, 0.1, 0.1)
    });
    page.drawText('Số / No.: 079 090 001234', {
        x: 195,
        y: y - 35,
        size: 12,
        font: bold,
        color: rgb(0.8, 0.1, 0.1)
    });

    // Photo placeholder box
    page.drawRectangle({
        x: 75,
        y: y - 115,
        width: 80,
        height: 100,
        color: rgb(0.9, 0.9, 0.9),
        borderColor: rgb(0.5, 0.5, 0.5),
        borderWidth: 1
    });
    page.drawText('ẢNH 3x4', { x: 95, y: y - 65, size: 9, font: bold, color: rgb(0.4, 0.4, 0.4) });
    page.drawText('NGUYỄN VĂN AN', { x: 80, y: y - 80, size: 7, font: regular, color: rgb(0.4, 0.4, 0.4) });

    page.drawText('Họ và tên / Full name: NGUYỄN VĂN AN', { x: 175, y: y - 55, size: 9.5, font: bold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText('Ngày sinh / Date of birth: 15/08/1984        Giới tính / Sex: Nam', { x: 175, y: y - 72, size: 9, font: regular, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('Quốc tịch / Nationality: Việt Nam', { x: 175, y: y - 88, size: 9, font: regular, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('Quê quán: Bến Nghé, Quận 1, TP. Hồ Chí Minh', { x: 175, y: y - 104, size: 9, font: regular, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('Nơi thường trú: Số 45/12 Lê Lợi, Phường Bến Nghé, Quận 1, TP. HCM', { x: 175, y: y - 120, size: 8.5, font: regular, color: rgb(0.2, 0.2, 0.2) });

    // Simulated CCCD Back Card
    y -= 160;
    page.drawRectangle({
        x: 55,
        y: y - 130,
        width: 480,
        height: 140,
        color: rgb(0.96, 0.98, 0.96),
        borderColor: rgb(0.3, 0.6, 0.4),
        borderWidth: 1.5
    });

    page.drawText('MẶT SAU THẺ CĂN CƯỚC CÔNG DÂN GẮN CHIP ĐIỆN TỬ', {
        x: 130,
        y: y - 20,
        size: 10,
        font: bold,
        color: rgb(0.2, 0.3, 0.4)
    });
    page.drawText('Đặc điểm nhân dạng: Nốt ruồi c.1cm dưới sau đuôi lông mày phải', {
        x: 80,
        y: y - 45,
        size: 9,
        font: regular,
        color: rgb(0.2, 0.2, 0.2)
    });
    page.drawText('Ngày cấp: 10/05/2021 | Có giá trị đến: 15/08/2044', {
        x: 80,
        y: y - 62,
        size: 9,
        font: regular,
        color: rgb(0.2, 0.2, 0.2)
    });
    page.drawText('CỤC TRƯỞNG CỤC CẢNH SÁT QUẢN LÝ HÀNH CHÍNH VỀ TRẬT TỰ XÃ HỘI', {
        x: 80,
        y: y - 79,
        size: 8.5,
        font: bold,
        color: rgb(0.1, 0.1, 0.1)
    });
    page.drawText('CHIP ĐIỆN TỬ ĐÃ ĐƯỢC ĐỐI SOÁT VÀ KHỚP VỚI CƠ SỞ DỮ LIỆU QUỐC GIA', {
        x: 80,
        y: y - 110,
        size: 8,
        font: bold,
        color: rgb(0.1, 0.5, 0.2)
    });

    // Notarization stamp
    y -= 160;
    page.drawRectangle({
        x: 55,
        y: y - 55,
        width: 480,
        height: 60,
        color: rgb(1.0, 0.98, 0.95),
        borderColor: rgb(0.85, 0.2, 0.2),
        borderWidth: 1
    });
    page.drawText('CHỨNG THỰC BẢN SAO ĐÚNG VỚI BẢN CHÍNH', {
        x: 75,
        y: y - 18,
        size: 9.5,
        font: bold,
        color: rgb(0.85, 0.15, 0.15)
    });
    page.drawText('Số chứng thực: 1482/CT-PCC | Ngày chứng thực: 18/03/2026', {
        x: 75,
        y: y - 32,
        size: 8.5,
        font: regular,
        color: rgb(0.3, 0.3, 0.3)
    });
    page.drawText('VĂN PHÒNG CÔNG CHỨNG SÀI GÒN - CÔNG CHỨNG VIÊN ĐÃ KÝ VÀ ĐÓNG DẤU', {
        x: 75,
        y: y - 46,
        size: 8,
        font: bold,
        color: rgb(0.2, 0.2, 0.2)
    });

    const pdfBytes = await doc.save();
    fs.writeFileSync(path.join(outDir, 'CCCD_NguoiDaiDien.pdf'), pdfBytes);
}

// -------------------------------------------------------------
// 4. QUY CHẾ & CAM KẾT ĐẤU THẦU TẢI TRỌNG CARGO
// -------------------------------------------------------------
async function generateQuyChe(outDir, fontReg, fontBold) {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const regular = await doc.embedFont(fontReg);
    const bold = await doc.embedFont(fontBold);

    const page = doc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();

    // Border
    page.drawRectangle({
        x: 20,
        y: 20,
        width: width - 40,
        height: height - 40,
        borderColor: rgb(0.1, 0.3, 0.6),
        borderWidth: 1.5,
    });

    let y = height - 55;

    page.drawText('VIETRAVEL AIRLINES - KHỐI THƯƠNG MẠI HÀNG HÓA CARGO', {
        x: 100,
        y,
        size: 11.5,
        font: bold,
        color: rgb(0.8, 0.2, 0.1)
    });
    y -= 16;
    page.drawText('SÀN ĐẤU GIÁ TRỰC TUYẾN TẢI TRỌNG CARGO (ONLINE CARGO BIDDING)', {
        x: 80,
        y,
        size: 10.5,
        font: bold,
        color: rgb(0.1, 0.3, 0.6)
    });
    y -= 10;
    page.drawLine({
        start: { x: 120, y },
        end: { x: 475, y },
        thickness: 1,
        color: rgb(0.8, 0.2, 0.1)
    });

    y -= 40;
    page.drawText('QUY CHẾ VẬN HÀNH & BẢN CAM KẾT ĐẤU THẦU TẢI TRỌNG', {
        x: 75,
        y,
        size: 14,
        font: bold,
        color: rgb(0.1, 0.2, 0.5)
    });
    y -= 16;
    page.drawText('Mã quy chế: QC-VU-CARGO-2026/01 | Ban hành theo Quyết định số 88/QĐ-VU', {
        x: 120,
        y,
        size: 9,
        font: regular,
        color: rgb(0.4, 0.4, 0.4)
    });

    y -= 30;

    const rules = [
        ['ĐIỀU 1: NGUYÊN TẮC ĐẤU THẦU KÍN (SEALED-BID AUCTION)', 
         'Các phiên đấu thầu tải trọng Vietravel Cargo áp dụng hình thức đấu thầu kín bảo mật. Mọi mức giá của các đại lý tham gia được mã hóa tự động, che tên ẩn danh (AG-***) đối với đối thủ để đảm bảo tính công bằng, minh bạch tuyệt đối.'],
        ['ĐIỀU 2: NGUYÊN TẮC ĐẶT GIÁ VÀ XÁC ĐỊNH NGƯỜI TRÚNG THẦU', 
         'Mỗi đại lý tham gia được đặt mức giá hợp lệ theo đúng bước giá quy định của gói thầu. Khi phiên đóng thầu, hệ thống tự động xác định đại lý trả giá cao nhất (Highest Bidder) và gửi thông báo xác nhận trúng thầu đến email và tài khoản đại lý.'],
        ['ĐIỀU 3: NGHĨA VỤ THANH TOÁN & THỜI HẠN CUT-OFF', 
         'Đại lý trúng thầu có nghĩa vụ hoàn tất thanh toán tiền cước tải trọng (qua MoMo hoặc Chuyển khoản QR ngân hàng) trước thời hạn Payment Deadline (tối thiểu 2 giờ trước giờ đóng quầy Cut-off của chuyến bay). Quá hạn thanh toán, hệ thống sẽ tự động khóa quyền đấu giá và chuyển quyền cho đại lý kế tiếp.'],
        ['ĐIỀU 4: CAM KẾT VẬN CHUYỂN HÀNG HÓA VÀ KHAI BÁO AN TOÀN IATA', 
         'Đại lý cam kết toàn bộ hàng hóa ký gửi tuân thủ nghiêm ngặt quy định an ninh hàng không, tiêu chuẩn IATA Dangerous Goods Regulations (DGR) và quy trình khai báo vận đơn điện tử e-AWB của Vietravel Airlines.'],
        ['ĐIỀU 5: XỬ LÝ VI PHẠM & BẢO LƯU QUYỀN HỦY PHIÊN', 
         'Hãng hàng không bảo lưu quyền hủy kết quả hoặc tạm dừng tài khoản đối với đại lý có hành vi thao túng giá, bỏ thầu không thanh toán hoặc vi phạm quy chế thương mại. Tiền ký quỹ có thể bị khấu trừ theo quy định bồi hoàn tải trọng rỗng.']
    ];

    rules.forEach(([title, desc]) => {
        page.drawText(title, { x: 45, y, size: 9.5, font: bold, color: rgb(0.1, 0.25, 0.5) });
        y -= 14;
        
        // Wrap text simply
        const words = desc.split(' ');
        let line = '';
        for (const w of words) {
            if ((line + w).length > 95) {
                page.drawText(line, { x: 55, y, size: 8.8, font: regular, color: rgb(0.15, 0.15, 0.15) });
                y -= 13;
                line = w + ' ';
            } else {
                line += w + ' ';
            }
        }
        if (line) {
            page.drawText(line, { x: 55, y, size: 8.8, font: regular, color: rgb(0.15, 0.15, 0.15) });
            y -= 16;
        }
    });

    // Signature box
    y -= 15;
    page.drawText('ĐẠI DIỆN ĐẠI LÝ KÝ TÊN & ĐÓNG DẤU CAM KẾT', { x: 50, y, size: 9.5, font: bold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText('VIETRAVEL AIRLINES CARGO DUYỆT', { x: 340, y, size: 9.5, font: bold, color: rgb(0.1, 0.1, 0.1) });
    
    y -= 14;
    page.drawText('Đã ký số điện tử: NGUYỄN VĂN AN', { x: 50, y, size: 8.5, font: regular, color: rgb(0.3, 0.3, 0.3) });
    page.drawText('Đã phê duyệt hồ sơ tham gia đấu thầu', { x: 340, y, size: 8.5, font: regular, color: rgb(0.1, 0.5, 0.2) });

    const pdfBytes = await doc.save();
    fs.writeFileSync(path.join(outDir, 'Quy_che_dau_gia_tai_trong_Vietravel_Cargo.pdf'), pdfBytes);
}

createAllSampleDocuments().catch(err => {
    console.error('Error generating PDF documents:', err);
    process.exit(1);
});
