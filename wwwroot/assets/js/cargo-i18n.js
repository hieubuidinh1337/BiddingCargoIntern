/**
 * CARGO BIDDING SYSTEM - Internationalization (i18n) Module
 * Supports seamless switching between Vietnamese (vi) and English (en)
 * across all public and admin pages.
 */
(function () {
    if (typeof window === 'undefined') return;

    const STORAGE_KEY = 'CARGO_LANG';

    const DICTIONARY = {
        // --- Navigation & Branding ---
        "Vietravel Airlines": "Vietravel Airlines",
        "Hệ thống đấu giá hàng hoá": "Air Cargo Bidding System",
        "Sàn đấu giá trực tuyến": "Live Bidding Portal",
        "Lịch sử thầu": "Bidding History",
        "Lịch sử đặt thầu": "Bidding History",
        "Thắng thầu": "Won Auctions",
        "Theo dõi": "Watchlist",
        "Đang theo dõi": "Watchlisted",
        "Bỏ theo dõi": "Unwatch",
        "Thông báo": "Notifications",
        "Tài khoản": "Account",
        "Hồ sơ": "Profile",
        "Đăng nhập": "Log In",
        "Đăng nhập Cổng Đại lý": "Agent Portal Login",
        "Đăng nhập hệ thống Quản trị": "Admin Portal Login",
        "Đăng xuất": "Log Out",
        "Đăng xuất hệ thống Admin": "Admin Logout",
        "Đăng xuất hệ thống Agent": "Agent Logout",
        "Đăng ký": "Register",
        "Đăng ký tài khoản": "Register Account",
        "Đăng ký tài khoản đại lý": "Agent Account Registration",
        "Trang chủ": "Home",
        "Về trang chủ": "Back to Home",
        "Trở về trang chủ": "Back to Home",
        "Trở về trang chủ ngay": "Back to Home Now",
        "Quay lại": "Back",
        "Hủy": "Cancel",
        "Hủy bỏ": "Cancel",
        "Xác nhận": "Confirm",
        "Lưu": "Save",
        "Lưu thay đổi": "Save Changes",
        "Lưu cấu hình": "Save Settings",
        "Cập nhật": "Update",
        "Thao tác": "Actions",
        "Tất cả": "All",
        "Tìm kiếm": "Search",
        "Lọc": "Filter",
        "Làm mới": "Refresh",
        "Làm mới dữ liệu tức thì": "Refresh Data Instantly",
        "Xem chi tiết": "View Details",
        "Xem chi tiết & lịch sử": "View Details & History",
        "Trạng thái": "Status",
        "Doanh nghiệp": "Company",
        "Người đại diện": "Representative",
        "Số điện thoại": "Phone",
        "Mã số thuế": "Tax Code",
        "Địa chỉ": "Address",
        "Website doanh nghiệp": "Company Website",
        "Lĩnh vực hoạt động": "Business Field",
        "Chưa cập nhật": "Not updated",
        "Vừa xong": "Just now",

        // --- Admin Navigation ---
        "Dashboard": "Dashboard",
        "Quản lý phiên": "Auctions",
        "Tạo phiên": "Create Auction",
        "Đại lý": "Agents",
        "Báo cáo": "Reports",
        "Cài đặt": "Settings",
        "Nhật ký": "Audit Logs",
        "Quản trị viên": "Administrator",
        "QUẢN TRỊ VIÊN": "ADMINISTRATOR",
        "Sàn công khai": "Public Portal",

        // --- Dashboard & KPIs ---
        "Phiên đang mở thầu": "Open Auctions",
        "Hôm nay sẵn sàng đấu giá": "Ready to bid today",
        "Gói thầu đã tham gia": "Joined Bids",
        "Gói thầu đang tham gia": "Active Bids",
        "Đã trúng thầu": "Won Auctions",
        "chuyến": "flights",
        "đơn": "orders",
        "Hiện chưa có phiên đấu giá nào đang mở.": "No live auction sessions at the moment.",
        "Giai đoạn bay:": "Flight Period:",
        "Giai đoạn bay": "Flight Period",
        "Doanh thu & Tải trọng theo từng đường bay": "Revenue & Capacity by Route",
        "Tự động tổng hợp và nhóm từ toàn bộ các chuyến bay trong hệ thống": "Automatically aggregated and grouped from all flights in the system",
        "Tất cả thời gian": "All Time",
        "Hôm nay": "Today",
        "7 ngày qua": "Last 7 days",
        "30 ngày qua": "Last 30 days",
        "90 ngày qua": "Last 90 days",
        "Tháng này": "This month",
        "Tuyến đường bay": "Flight Route",
        "Số chuyến đấu giá": "Auction Count",
        "Tổng tải trọng chào": "Total Offered Capacity",
        "Tải trọng trúng thầu": "Won Capacity",
        "Giá bình quân": "Average Price",
        "Tổng doanh thu": "Total Revenue",
        "TỔNG CỘNG TOÀN MẠNG": "NETWORK TOTAL",

        // --- Auctions & Bidding ---
        "Tải trọng chào thầu": "Offered Capacity",
        "Giá khởi điểm sàn": "Starting Price",
        "Giá sàn khởi điểm": "Starting Price",
        "Giá chốt thắng thầu": "Winning Price",
        "Mức giá cao nhất": "Highest Bid",
        "Mức giá của bạn": "Your Bid",
        "Thời gian đếm ngược": "Countdown Timer",
        "Thời gian mở phiên": "Opening Time",
        "Thời gian đóng phiên": "Closing Time",
        "Thời gian còn lại": "Time Remaining",
        "Giờ cất cánh (ETD)": "Departure Time (ETD)",
        "Giờ hạ cánh (ETA)": "Arrival Time (ETA)",
        "Giờ cất cánh": "Departure (ETD)",
        "Giờ hạ cánh": "Arrival (ETA)",
        "Đã kết thúc": "Ended",
        "ĐÃ KẾT THÚC": "ENDED",
        "Đã đóng": "Closed",
        "ĐÃ ĐÓNG": "CLOSED",
        "Sắp diễn ra": "Upcoming",
        "SẮP DIỄN RA": "UPCOMING",
        "Đang mở": "Live",
        "ĐANG MỞ": "LIVE",
        "Bảo mật trong phiên": "Confidential during auction",
        "Chưa có đại lý nào đặt giá": "No bids placed yet",
        "Không có đại lý trúng thầu": "No winning agent",
        "Chưa tham gia": "Not participated",
        "Giá bạn đã đặt": "Your Bid Price",
        "Loại tàu bay": "Aircraft Type",
        "Loại tàu bay khai thác": "Operating Aircraft",
        "Mã chuyến bay": "Flight Number",
        "Mã định danh": "Flight Code",
        "Mã định danh phiên đấu giá": "Auction Session ID",
        "Quy định giao nhận & Cut-off kho": "Cargo Cut-off & Regulations",
        "Theo ngày đóng phiên": "By closing date",
        "Ghi chú": "Notes",
        "Đặt giá thầu": "Place Bid",
        "Nhập giá chào mới của bạn": "Enter your new bid",
        "Tăng nhanh mức giá:": "Quick increment:",
        "Tăng nhanh mức giá": "Quick increment",
        "Bước giá tối thiểu": "Minimum Increment",
        "Quy tắc đấu giá": "Bidding Rules",
        "Mã AWB": "AWB Number",
        "Khai báo hàng hóa": "Cargo Declaration",
        "Thanh toán": "Payment",
        "Đã thanh toán": "Paid",
        "Chờ thanh toán": "Pending Payment",

        // --- Settings & Fleet ---
        "Danh mục Sân bay khai thác": "Operating Airports Directory",
        "Danh mục Loại tàu bay khai thác": "Operating Aircraft Fleet Directory",
        "Quản lý danh sách mã IATA và tên sân bay phục vụ khai thác vận chuyển hàng hóa": "Manage IATA codes and airport names for cargo transport operations",
        "Thêm Sân bay mới": "Add New Airport",
        "Thêm Loại tàu bay": "Add Aircraft Type",
        "Mã Sân bay": "Airport Code",
        "Tên Sân bay": "Airport Name",
        "Mã tàu bay": "Aircraft Code",
        "Tên loại tàu bay": "Aircraft Model",
        "Tên loại tàu bay (AcName)": "Aircraft Model (AcName)",
        "Mã tàu bay (AcCode)": "Aircraft Code (AcCode)",
        "Tên sân bay (Airport Description)": "Airport Description",
        "Cấu hình tham số sàn": "Platform Parameter Configuration",
        "Bước giá tối thiểu sàn": "Minimum Bid Increment",
        "Thời gian Cut-off trước ETD": "Cut-off Time before ETD",
        "Thời gian điều chỉnh người thắng": "Winner Review Window",
        "Thời gian thanh toán sau khi chốt": "Payment Window after Close",
        "Cấu hình tài khoản ngân hàng thụ hưởng": "Beneficiary Bank Account Configuration",
        "Tên ngân hàng": "Bank Name",
        "Số tài khoản": "Account Number",
        "Chủ tài khoản": "Account Holder",
        "Chi nhánh": "Branch",
        "Cú pháp chuyển khoản": "Transfer Memo Syntax",

        // --- Registrations & Profile ---
        "Quản lý Đại lý & Hồ sơ đăng ký": "Agent Management & Registrations",
        "Chờ xét duyệt": "Pending Approval",
        "CHỜ XÉT DUYỆT (PENDING)": "PENDING APPROVAL",
        "Đã phê duyệt": "Approved",
        "Đã từ chối": "Rejected",
        "Đang hoạt động": "Active",
        "Tạm khóa": "Locked",
        "Chức vụ": "Position",
        "Số GPKD": "Business License",
        "Địa chỉ trụ sở chính": "Headquarters Address",
        "Nộp hồ sơ đăng ký đại lý": "Submit Agent Registration",
        "Đã nộp hồ sơ thành công!": "Registration Submitted Successfully!",

        // --- Audit Logs ---
        "Nhật ký hệ thống": "System Audit Logs",
        "Nhật ký hoạt động": "Activity Logs",
        "Người thực hiện": "User / Actor",
        "Phân hệ": "Module",
        "Chi tiết thao tác": "Operation Details",
        "Địa chỉ IP & Thiết bị": "IP & Device",
        "Tất cả danh mục": "All Categories",
        "Thời gian:": "Time:",

        // --- Common Alerts & Prompts ---
        "Thành công!": "Success!",
        "Thất bại!": "Failed!",
        "Lỗi!": "Error!",
        "Cảnh báo!": "Warning!",
        "Thông báo tự động": "Automated Notification",
        "Mức giá đặt": "Bid Price",
        "Mức giá chào mới": "New Bid Price",
        "Tải trọng thầu": "Bid Capacity",
        "Tải trọng thầu (Kg)": "Bid Capacity (Kg)",
        "Giá khởi điểm sàn (đ/Kg)": "Starting Price (VND/Kg)",
        "Quy định giao nhận": "Delivery Regulations",
        "Chuyến bay": "Flight",
        "Đại lý trúng thầu": "Winning Agent",
        "Chưa có": "None",
        "Đang xử lý...": "Processing...",
        "Đang lưu...": "Saving...",
        "Đang tải...": "Loading...",
        "Gửi hồ sơ đăng ký chính thức": "Submit Official Registration",
        "Họ và tên người đại diện": "Representative Full Name",
        "Lĩnh vực hoạt động": "Business Activity",
        "Giấy phép kinh doanh số": "Business License No.",
        "Mật khẩu": "Password",
        "Mật khẩu tạm thời": "Temporary Password",
        "Xác nhận mật khẩu": "Confirm Password",
        "Mã đại lý": "Agent Code",
        "Mã PIN": "PIN Code",
        "Quên mật khẩu?": "Forgot Password?",
        "Chưa có tài khoản?": "Don't have an account?",
        "Đăng ký ngay": "Register Now",
        "Ghi nhớ đăng nhập": "Remember me",
        "Bản quyền thuộc về Vietravel Airlines": "Copyright © Vietravel Airlines",
        "Tất cả các quyền được bảo lưu": "All rights reserved"
    };

    // Build reverse dictionary (EN -> VI)
    const REVERSE_DICT = {};
    Object.keys(DICTIONARY).forEach(viKey => {
        const enVal = DICTIONARY[viKey];
        if (!REVERSE_DICT[enVal]) {
            REVERSE_DICT[enVal] = viKey;
        }
    });

    let currentLang = 'vi';
    try {
        currentLang = localStorage.getItem(STORAGE_KEY) || 'vi';
    } catch (e) { }

    function getLanguage() {
        return currentLang;
    }

    function setLanguage(lang) {
        if (lang !== 'vi' && lang !== 'en') lang = 'vi';
        currentLang = lang;
        try {
            localStorage.setItem(STORAGE_KEY, lang);
        } catch (e) { }

        updateAllSwitcherButtons();
        translatePage();

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('cargo:languageChanged', { detail: { lang: currentLang } }));
        }
    }

    function toggleLanguage() {
        setLanguage(currentLang === 'vi' ? 'en' : 'vi');
    }

    function t(text, fallback) {
        if (!text) return fallback || '';
        const trimmed = String(text).trim();
        if (currentLang === 'en') {
            return DICTIONARY[trimmed] || fallback || text;
        } else {
            return REVERSE_DICT[trimmed] || fallback || text;
        }
    }

    function translateTextNode(node) {
        if (!node || node.nodeType !== Node.TEXT_NODE) return;
        const raw = node.nodeValue;
        if (!raw || !raw.trim()) return;

        const trimmed = raw.trim();

        if (currentLang === 'en') {
            if (DICTIONARY[trimmed]) {
                if (typeof node.__origText === 'undefined') {
                    node.__origText = raw;
                }
                const translated = DICTIONARY[trimmed];
                // Preserve leading and trailing whitespace
                const leading = raw.match(/^\s*/)[0];
                const trailing = raw.match(/\s*$/)[0];
                node.nodeValue = leading + translated + trailing;
            }
        } else {
            if (typeof node.__origText !== 'undefined') {
                node.nodeValue = node.__origText;
            } else if (REVERSE_DICT[trimmed]) {
                const translated = REVERSE_DICT[trimmed];
                const leading = raw.match(/^\s*/)[0];
                const trailing = raw.match(/\s*$/)[0];
                node.nodeValue = leading + translated + trailing;
            }
        }
    }

    function translateElementAttributes(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
        if (el.dataset && el.dataset.noTranslate) return;

        ['placeholder', 'title', 'alt', 'aria-label'].forEach(attr => {
            const val = el.getAttribute(attr);
            if (!val || !val.trim()) return;
            const trimmed = val.trim();

            const storageKey = '__orig_' + attr;
            if (currentLang === 'en') {
                if (DICTIONARY[trimmed]) {
                    if (typeof el[storageKey] === 'undefined') {
                        el[storageKey] = val;
                    }
                    el.setAttribute(attr, DICTIONARY[trimmed]);
                }
            } else {
                if (typeof el[storageKey] !== 'undefined') {
                    el.setAttribute(attr, el[storageKey]);
                } else if (REVERSE_DICT[trimmed]) {
                    el.setAttribute(attr, REVERSE_DICT[trimmed]);
                }
            }
        });
    }

    function walkNode(node) {
        if (!node) return;
        if (node.nodeType === Node.ELEMENT_NODE) {
            // Skip script, style, code, and language switcher itself
            const tagName = node.tagName.toLowerCase();
            if (['script', 'style', 'code', 'pre', 'noscript'].includes(tagName)) return;
            if (node.classList && (node.classList.contains('cargo-lang-switch') || node.classList.contains('cargo-lang-floating'))) return;

            translateElementAttributes(node);

            let child = node.firstChild;
            while (child) {
                const next = child.nextSibling;
                walkNode(child);
                child = next;
            }
        } else if (node.nodeType === Node.TEXT_NODE) {
            translateTextNode(node);
        }
    }

    let isTranslating = false;
    function translatePage() {
        if (isTranslating) return;
        isTranslating = true;
        try {
            walkNode(document.body);
            document.documentElement.lang = currentLang;
        } finally {
            isTranslating = false;
        }
    }

    // --- Switcher UI Injection ---
    function createSwitcherHtml(isFloating = false) {
        const isVi = currentLang === 'vi';
        const isEn = currentLang === 'en';

        if (isFloating) {
            return `
                <div class="cargo-lang-floating flex items-center bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-full p-1 shadow-lg text-xs font-semibold text-slate-700 transition-all hover:shadow-xl select-none" style="z-index: 99999;">
                    <button type="button" onclick="CargoI18n.setLanguage('vi')" 
                        class="lang-btn-vi flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${isVi ? 'bg-blue-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900 font-medium'}">
                        <span>🇻🇳</span> <span class="hidden sm:inline">Tiếng Việt</span><span class="sm:hidden">VI</span>
                    </button>
                    <button type="button" onclick="CargoI18n.setLanguage('en')" 
                        class="lang-btn-en flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${isEn ? 'bg-blue-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900 font-medium'}">
                        <span>🇬🇧</span> <span class="hidden sm:inline">English</span><span class="sm:hidden">EN</span>
                    </button>
                </div>
            `;
        }

        return `
            <div class="cargo-lang-switch inline-flex items-center bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-xl p-0.5 text-xs font-semibold shadow-2xs transition-all cursor-pointer select-none">
                <button type="button" onclick="CargoI18n.setLanguage('vi')" 
                    class="lang-btn-vi px-2 py-1 rounded-lg transition-all flex items-center gap-1 ${isVi ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800 font-medium'}">
                    <span>🇻🇳</span> <span>VI</span>
                </button>
                <button type="button" onclick="CargoI18n.setLanguage('en')" 
                    class="lang-btn-en px-2 py-1 rounded-lg transition-all flex items-center gap-1 ${isEn ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800 font-medium'}">
                    <span>🇬🇧</span> <span>EN</span>
                </button>
            </div>
        `;
    }

    function updateAllSwitcherButtons() {
        const isVi = currentLang === 'vi';
        document.querySelectorAll('.cargo-lang-switch, .cargo-lang-floating').forEach(container => {
            const viBtn = container.querySelector('.lang-btn-vi');
            const enBtn = container.querySelector('.lang-btn-en');
            if (viBtn && enBtn) {
                if (container.classList.contains('cargo-lang-floating')) {
                    if (isVi) {
                        viBtn.className = 'lang-btn-vi flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all bg-blue-600 text-white shadow-xs font-bold';
                        enBtn.className = 'lang-btn-en flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-slate-600 hover:text-slate-900 font-medium';
                    } else {
                        viBtn.className = 'lang-btn-vi flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-slate-600 hover:text-slate-900 font-medium';
                        enBtn.className = 'lang-btn-en flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all bg-blue-600 text-white shadow-xs font-bold';
                    }
                } else {
                    if (isVi) {
                        viBtn.className = 'lang-btn-vi px-2 py-1 rounded-lg transition-all flex items-center gap-1 bg-white text-blue-700 shadow-2xs font-bold';
                        enBtn.className = 'lang-btn-en px-2 py-1 rounded-lg transition-all flex items-center gap-1 text-slate-500 hover:text-slate-800 font-medium';
                    } else {
                        viBtn.className = 'lang-btn-vi px-2 py-1 rounded-lg transition-all flex items-center gap-1 text-slate-500 hover:text-slate-800 font-medium';
                        enBtn.className = 'lang-btn-en px-2 py-1 rounded-lg transition-all flex items-center gap-1 bg-white text-blue-700 shadow-2xs font-bold';
                    }
                }
            }
        });
    }

    function injectSwitchers() {
        if (!document.getElementById('cargo-i18n-styles')) {
            const style = document.createElement('style');
            style.id = 'cargo-i18n-styles';
            style.textContent = `
                .admin-right .cargo-lang-switch {
                    background: rgba(255, 255, 255, 0.08) !important;
                    border: 1px solid rgba(255, 255, 255, 0.15) !important;
                }
                .admin-right .cargo-lang-switch button {
                    color: rgba(226, 232, 240, 0.85) !important;
                }
                .admin-right .cargo-lang-switch button.active-lang {
                    background: #2563eb !important;
                    color: #ffffff !important;
                }
                .cargo-lang-floating {
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
                }
            `;
            document.head.appendChild(style);
        }

        // 1. Inject Header Switcher if suitable container found
        // Admin header right bar
        const adminRight = document.querySelector('.admin-right');
        if (adminRight && !adminRight.querySelector('.cargo-lang-switch')) {
            const div = document.createElement('div');
            div.className = 'admin-lang-wrap mr-1 flex items-center';
            div.innerHTML = createSwitcherHtml(false);
            adminRight.insertBefore(div, adminRight.firstChild);
        }

        // Public / Agent Portal header
        const publicHeaderRight = document.querySelector('header .flex.items-center.gap-1\\.5, header .flex.items-center.gap-2, header .flex.items-center.gap-3, nav .flex.items-center');
        if (publicHeaderRight && !publicHeaderRight.querySelector('.cargo-lang-switch') && !adminRight) {
            const div = document.createElement('div');
            div.className = 'header-lang-wrap mr-1 flex items-center';
            div.innerHTML = createSwitcherHtml(false);
            publicHeaderRight.insertBefore(div, publicHeaderRight.firstChild);
        }

        // 2. Inject sleek floating switcher (accessible everywhere)
        let floatingContainer = document.getElementById('cargoFloatingLangWidget');
        if (!floatingContainer) {
            floatingContainer = document.createElement('div');
            floatingContainer.id = 'cargoFloatingLangWidget';
            floatingContainer.className = 'fixed bottom-4 right-4 z-50 print:hidden';
            floatingContainer.innerHTML = createSwitcherHtml(true);
            document.body.appendChild(floatingContainer);
        }
    }

    // --- Mutation Observer for Dynamic Content ---
    let observerTimeout = null;
    function setupMutationObserver() {
        if (!window.MutationObserver) return;
        const observer = new MutationObserver((mutations) => {
            if (currentLang === 'vi' || isTranslating) return;
            let shouldTranslate = false;
            for (let i = 0; i < mutations.length; i++) {
                const m = mutations[i];
                if (m.type === 'childList' && m.addedNodes.length > 0) {
                    for (let j = 0; j < m.addedNodes.length; j++) {
                        const node = m.addedNodes[j];
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.classList && (node.classList.contains('cargo-lang-switch') || node.classList.contains('cargo-lang-floating'))) {
                                continue;
                            }
                            shouldTranslate = true;
                            break;
                        }
                    }
                }
                if (shouldTranslate) break;
            }

            if (shouldTranslate) {
                clearTimeout(observerTimeout);
                observerTimeout = setTimeout(() => {
                    translatePage();
                }, 60);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // --- Initialization ---
    function init() {
        injectSwitchers();
        if (currentLang === 'en') {
            translatePage();
        }
        setupMutationObserver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose API
    window.CargoI18n = {
        getLanguage,
        setLanguage,
        toggleLanguage,
        t,
        translatePage
    };
})();
