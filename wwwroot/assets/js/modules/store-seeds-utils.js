/**
 * CARGO BIDDING SYSTEM - Module 1: Seed Data, Permissions & Utility Helpers
 */
var CargoStore = (typeof window !== 'undefined') ? (window.CargoStore = window.CargoStore || {}) : {};
if (typeof globalThis !== 'undefined') globalThis.CargoStore = CargoStore;

(function () {
    const Core = window.__CargoCore = window.__CargoCore || {};

    const STORAGE_KEY = 'CARGO_BIDDING_DATA_V3';

    // Seed Data matching T-SQL SQL Server 2022 (CargoBiddingDB)
    // Each agent/admin account has its OWN unique, distinct password
    const seedAgents = [];

    /**
     * HỆ THỐNG PHÂN QUYỀN HẠT NHÂN (PERMISSION MATRIX DEFINITIONS)
     * 4 Phân hệ nghiệp vụ với 14 quyền hạn chi tiết:
     * - registrations: Hồ sơ đăng ký đại lý (view, approve_reject)
     * - auctions: Phiên đấu giá (view, create, edit, remove, close, settle_select_winner)
     * - agents: Đại lý ủy quyền (view, lock)
     * - staff: Nhân viên nội bộ & phân quyền (view, create, edit, remove)
     */
    const PERMISSION_DEFINITIONS = [
        {
            category: 'registrations',
            categoryName: 'Hồ sơ đăng ký đại lý',
            icon: 'fa-solid fa-address-card',
            color: 'blue',
            permissions: [
                { key: 'registrations.view', name: 'Xem hồ sơ đăng ký', description: 'Xem danh sách và chi tiết các hồ sơ đăng ký đại lý mới' },
                { key: 'registrations.approve_reject', name: 'Duyệt / Từ chối hồ sơ', description: 'Phê duyệt cấp mã hoặc từ chối hồ sơ đại lý' }
            ]
        },
        {
            category: 'auctions',
            categoryName: 'Phiên đấu giá',
            icon: 'fa-solid fa-plane-departure',
            color: 'purple',
            permissions: [
                { key: 'auctions.view', name: 'Xem phiên đấu giá', description: 'Xem danh sách phiên, thông tin chi tiết và diễn biến đặt giá' },
                { key: 'auctions.create', name: 'Tạo mới phiên', description: 'Tạo phiên đấu giá tải trọng chuyến bay mới' },
                { key: 'auctions.edit', name: 'Chỉnh sửa phiên', description: 'Sửa thông tin chuyến bay, tải trọng, giá sàn, thời gian' },
                { key: 'auctions.remove', name: 'Xóa / Hủy phiên', description: 'Xóa hoặc hủy bỏ phiên đấu giá tải trọng' },
                { key: 'auctions.close', name: 'Chốt phiên (Đóng phiên)', description: 'Chốt đóng phiên sớm hoặc dừng nhận đặt giá' },
                { key: 'auctions.settle_select_winner', name: 'Chốt / Chọn đại lý thắng thầu', description: 'Thẩm định và xác nhận đại lý trúng thầu, đổi hoặc hủy chọn người thắng' }
            ]
        },
        {
            category: 'agents',
            categoryName: 'Đại lý ủy quyền',
            icon: 'fa-solid fa-building-shield',
            color: 'emerald',
            permissions: [
                { key: 'agents.view', name: 'Xem danh sách đại lý', description: 'Xem danh sách đại lý hoạt động và hồ sơ chi tiết' },
                { key: 'agents.lock', name: 'Khóa / Mở khóa đại lý', description: 'Tạm khóa hoặc mở khóa quyền tham gia sàn của đại lý' }
            ]
        },
        {
            category: 'staff',
            categoryName: 'Nhân viên nội bộ & Vai trò',
            icon: 'fa-solid fa-users-gear',
            color: 'amber',
            permissions: [
                { key: 'staff.view', name: 'Xem danh sách nhân viên', description: 'Xem danh sách tài khoản nội bộ và vai trò' },
                { key: 'staff.create', name: 'Tạo mới nhân viên', description: 'Cấp mới tài khoản nhân sự điều hành' },
                { key: 'staff.edit', name: 'Chỉnh sửa nhân viên & Vai trò', description: 'Chỉnh sửa thông tin nhân viên, tạo và sửa các vai trò' },
                { key: 'staff.remove', name: 'Xóa nhân viên & Vai trò', description: 'Xóa tài khoản nhân sự hoặc xóa vai trò khỏi hệ thống' }
            ]
        }
    ];

    const ALL_PERMISSION_KEYS = PERMISSION_DEFINITIONS.flatMap(c => c.permissions.map(p => p.key));

    const seedRoles = [
        {
            id: 'role_super_admin',
            code: 'SUPER_ADMIN',
            name: 'Quản trị viên Hệ thống (Super Admin)',
            description: 'Toàn quyền cấu hình, vận hành và quản lý trên toàn bộ hệ thống',
            isSystem: true,
            permissions: [...ALL_PERMISSION_KEYS]
        },
        {
            id: 'role_cod_manager',
            code: 'COD_MANAGER',
            name: 'Điều hành Khai thác Bay (COD Manager)',
            description: 'Quản lý phiên đấu giá chuyến bay, duyệt đại lý và chốt người thắng thầu',
            isSystem: false,
            permissions: [
                'registrations.view',
                'registrations.approve_reject',
                'auctions.view',
                'auctions.create',
                'auctions.edit',
                'auctions.close',
                'auctions.settle_select_winner',
                'agents.view'
            ]
        },
        {
            id: 'role_settlement',
            code: 'SETTLEMENT_OFFICER',
            name: 'Hội đồng Chốt thầu (Settlement Officer)',
            description: 'Chuyên trách chốt phiên, phê duyệt hoặc lựa chọn đại lý thắng thầu',
            isSystem: false,
            permissions: [
                'auctions.view',
                'auctions.close',
                'auctions.settle_select_winner'
            ]
        },
        {
            id: 'role_agent_auditor',
            code: 'AGENT_AUDITOR',
            name: 'Chuyên viên Thẩm định Đại lý (Agent Auditor)',
            description: 'Chuyên trách kiểm tra, duyệt hồ sơ đại lý và khóa/mở khóa tài khoản đại lý',
            isSystem: false,
            permissions: [
                'registrations.view',
                'registrations.approve_reject',
                'agents.view',
                'agents.lock'
            ]
        },
        {
            id: 'role_viewer',
            code: 'OPERATIONS_VIEWER',
            name: 'Nhân viên Giám sát & Báo cáo (Viewer)',
            description: 'Chỉ có quyền xem các thông tin phiên đấu giá, đại lý, hồ sơ và nhân sự',
            isSystem: false,
            permissions: [
                'registrations.view',
                'auctions.view',
                'agents.view',
                'staff.view'
            ]
        }
    ];

    // Tài khoản khởi tạo duy nhất để đăng nhập lần đầu - hãy đổi mật khẩu ngay sau khi vào hệ thống.
    const seedAdmins = [
        {
            id: 99, username: 'admin', role: 'SUPER_ADMIN', roles: ['SUPER_ADMIN'],
            fullName: 'Quản trị hệ thống', email: '', department: ''
        }
    ];

    const defaultData = {
        currentUser: null,
        currentAdmin: null,
        rolesList: seedRoles,
        agentsList: [],
        adminsList: [],
        airports: [
            { code: 'DAD', name: 'Da Nang International Airport' },
            { code: 'DLI', name: 'Lien Khuong Airport' },
            { code: 'HAN', name: 'Noi Bai International Airport' },
            { code: 'HPH', name: 'Cat Bi International Airport' },
            { code: 'HUI', name: 'Phu Bai International Airport' },
            { code: 'SGN', name: 'Tan Son Nhat International Airport' },
            { code: 'UIH', name: 'Phu Cat Airport' },
            { code: 'PQC', name: 'Phu Quoc International Airport' },
            { code: 'VCA', name: 'Can Tho International Airport' },
            { code: 'CXR', name: 'Cam Ranh International Airport' },
            { code: 'VII', name: 'Vinh International Airport' },
            { code: 'VDO', name: 'Van Don International Airport' }
        ],
        aircraftTypes: [
            { code: '32V', name: 'A320' },
            { code: '32I', name: 'A321' },
            { code: '32E', name: 'A321' },
            { code: '32S', name: 'A320' },
            { code: '32O', name: 'A320' },
            { code: '32Q', name: 'A320' },
            { code: '32Y', name: 'A320' },
            { code: '32L', name: 'A320' },
            { code: '32B', name: 'A321' },
            { code: '320', name: 'A320' },
            { code: '321', name: 'A321' }
        ],
        auctions: [],
        bids: [],
        watchlist: [],
        wonAuctions: [],
        notifications: [],
        registrations: [],
        settings: {
            minIncrement: 500, cutoffHours: 3, paymentWindowHours: 24, reviewWindowMinutes: 15,
            hotline: '', supportEmail: '', hideAgentCredentials: true, autoCloseOnBid: false, hideCloseAuctionBtn: false,
            smtp: { host: '', port: 465, user: '', pass: '', fromName: '' }
        },
        bankConfig: { bankName: '', bankCode: '', bankBin: '', accountNumber: '', accountName: '', branch: '', memoPrefix: 'CARGO' },
        routeSubscriptions: {},
        activityLogs: [],
    };

    function deduplicateBids(bidsList) {
        if (!Array.isArray(bidsList)) return [];
        const bidMap = new Map();
        const sorted = [...bidsList].sort((a, b) => {
            const timeA = Number(a.timestamp || a.id || 0);
            const timeB = Number(b.timestamp || b.id || 0);
            return timeB - timeA;
        });

        sorted.forEach(b => {
            if (!b) return;
            const code = String(b.agentCode || '').trim().toUpperCase();
            if (!code) return;

            const bidId = b.id ? String(b.id) : null;
            const key = bidId
                ? `${b.auctionId || b.flightCode}_${bidId}`
                : `${b.auctionId || b.flightCode}_${code}_${Number(b.priceKg)}_${Number(b.timestamp || 0)}`;

            if (!bidMap.has(key)) {
                bidMap.set(key, b);
            } else {
                const existing = bidMap.get(key);
                if (String(b.id || '').startsWith('BID-') && !String(existing.id || '').startsWith('BID-')) {
                    bidMap.set(key, b);
                }
            }
        });

        return Array.from(bidMap.values()).sort((a, b) => (Number(b.timestamp || b.id || 0)) - (Number(a.timestamp || a.id || 0)));
    }

    function getEffectiveLogTime(l) {
        if (!l) return 0;
        const parsed = (l.timestamp && typeof parseTimestamp === 'function') ? parseTimestamp(l.timestamp) : 0;
        const raw = Number(l.rawTime) || 0;
        if (parsed && (!raw || Math.abs(raw - parsed) > 86400000)) return parsed;
        return raw || parsed || 0;
    }

    function deduplicateActivityLogs(logs) {
        if (!Array.isArray(logs)) return [];
        const result = [];
        const seenIds = new Set();

        logs.forEach(l => {
            if (!l) return;
            const idStr = l.id ? String(l.id) : null;
            if (idStr && seenIds.has(idStr)) return;

            const timeMs = getEffectiveLogTime(l);
            const titleStr = String(l.actionTitle || '').trim().toUpperCase();
            const targetStr = String(l.target || '').trim().toUpperCase();
            const userStr = String(l.username || l.actor || '').trim().toUpperCase();

            // Semantic match within 10 seconds
            const existingIdx = result.findIndex(r => {
                const rTime = getEffectiveLogTime(r);
                if (Math.abs(timeMs - rTime) > 10000) return false;
                const rTitle = String(r.actionTitle || '').trim().toUpperCase();
                if (rTitle !== titleStr) return false;

                const rTarget = String(r.target || '').trim().toUpperCase();
                if (targetStr && rTarget && targetStr !== 'N/A' && rTarget !== 'N/A' && targetStr !== rTarget) {
                    return false;
                }

                const rUser = String(r.username || r.actor || '').trim().toUpperCase();
                const isAdminAction = (userStr.includes('ADMIN') || userStr === 'ADMIN') && (rUser.includes('ADMIN') || rUser === 'ADMIN');
                if (!isAdminAction && userStr && rUser && userStr !== rUser) {
                    return false;
                }

                return true;
            });

            if (existingIdx >= 0) {
                const existing = result[existingIdx];
                if (l.device && l.device !== 'Web App' && (!existing.device || existing.device === 'Web App')) {
                    result[existingIdx] = l;
                } else if ((l.actor || '').length > (existing.actor || '').length && existing.device === 'Web App') {
                    result[existingIdx] = l;
                }
                if (idStr) seenIds.add(idStr);
                return;
            }

            if (idStr) seenIds.add(idStr);
            result.push(l);
        });

        return result;
    }

    function deduplicateNotifications(notifs) {
        if (!Array.isArray(notifs)) return [];
        const seenKeys = new Set();
        const seenIds = new Set();
        const result = [];

        notifs.forEach(n => {
            if (!n) return;
            const idStr = n.id ? String(n.id) : null;
            if (idStr && seenIds.has(idStr)) return;

            const msg = String(n.message || '').trim();
            const title = String(n.title || '').trim();
            const role = String(n.targetRole || '').trim().toUpperCase();
            const code = String(n.targetAgentCode || '').trim().toUpperCase();

            // Semantic fingerprint: collapse duplicate notifications for the same registration / event
            const regMatch = msg.match(/REG-\d+-\d+/i);
            const wonMatch = msg.match(/WON-\d+-\d+-\d+/i);
            const fingerprint = regMatch ? `reg_${regMatch[0].toUpperCase()}_${role}`
                : wonMatch ? `won_${wonMatch[0].toUpperCase()}_${role}_${title}`
                : `${role}|${code}|${title}|${msg}`;

            if (seenKeys.has(fingerprint)) return;

            if (idStr) seenIds.add(idStr);
            seenKeys.add(fingerprint);
            result.push(n);
        });

        return result.sort((a, b) => (Number(b.id || b.timestamp || 0)) - (Number(a.id || a.timestamp || 0)));
    }


    function reconcileAuctionSummaries(data) {
        if (!data || !Array.isArray(data.auctions)) return false;

        let changed = false;
        const allBids = Array.isArray(data.bids) ? data.bids : [];

        data.auctions.forEach(a => {
            // Filter bids directly from allBids — do NOT use this.getBidsForAuction()
            // because this function is a standalone (not a CargoStore method), so "this" is undefined/window.
            const auctionBids = allBids
                .filter(b => b && (
                    String(b.auctionId) === String(a.id) ||
                    (a.flightCode && b.flightCode && String(b.flightCode).toUpperCase() === String(a.flightCode).toUpperCase())
                ))
                .filter(b => b && Number.isFinite(Number(b.priceKg)) && Number(b.priceKg) > 0)
                .sort((x, y) => (Number(y.priceKg) || 0) - (Number(x.priceKg) || 0));

            if (auctionBids.length > 0) {
                const highestBid = auctionBids[0];
                const highestPrice = Number(highestBid.priceKg);

                if (Number.isFinite(highestPrice) && a.currentPriceKg !== highestPrice) {
                    a.currentPriceKg = highestPrice;
                    changed = true;
                }

                const normalizedLeaderCode = (highestBid.agentCode || '').trim();
                const normalizedLeaderName = (highestBid.agentName || '').trim();

                if (normalizedLeaderCode && normalizedLeaderCode !== 'AG-***') {
                    if ((a.leadingAgentCode || '').trim() !== normalizedLeaderCode ||
                        (a.leadingAgentName || '').trim() !== normalizedLeaderName) {
                        a.leadingAgentCode = normalizedLeaderCode;
                        a.leadingAgentName = normalizedLeaderName;
                        a.isAnonymous = highestBid.isAnonymous !== false;
                        changed = true;
                    }
                }

                const bidCount = auctionBids.length;
                if ((a.bidsCount || 0) !== bidCount) {
                    a.bidsCount = bidCount;
                    changed = true;
                }
            } else {
                if (a.leadingAgentCode || a.leadingAgentName || (a.bidsCount || 0) !== 0 || (a.startingPriceKg && a.currentPriceKg !== a.startingPriceKg)) {
                    a.leadingAgentCode = null;
                    a.leadingAgentName = null;
                    a.bidsCount = 0;
                    if (a.startingPriceKg) {
                        a.currentPriceKg = a.startingPriceKg;
                    }
                    changed = true;
                }
            }
        });

        return changed;
    }


    function formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN').format(amount) + ' đ';
    }

    function formatNumber(num) {
        return new Intl.NumberFormat('vi-VN').format(num);
    }

    function getTimeRemaining(endTimeStr) {
        const total = Date.parse(endTimeStr) - Date.now();
        if (total <= 0) {
            return { total: 0, hours: 0, minutes: 0, seconds: 0, isEnded: true };
        }
        const seconds = Math.floor((total / 1000) % 60);
        const minutes = Math.floor((total / 1000 / 60) % 60);
        const hours = Math.floor(total / (1000 * 60 * 60));
        return { total, hours, minutes, seconds, isEnded: false };
    }

    function formatTimeAgo(ts, defaultFallback) {
        if (!ts) return defaultFallback || 'Vừa xong';
        let timeMs = Number(ts);
        // Epoch timestamp lower bound: year 2020 (1577836800000)
        if (isNaN(timeMs) || timeMs < 1577836800000) {
            if (typeof ts === 'string') {
                const parsed = Date.parse(ts);
                if (!isNaN(parsed) && parsed > 1577836800000) {
                    timeMs = parsed;
                } else {
                    return defaultFallback || 'Vừa xong';
                }
            } else {
                return defaultFallback || 'Vừa xong';
            }
        }

        const now = Date.now();
        const diffSec = Math.floor((now - timeMs) / 1000);

        if (diffSec < 0 || diffSec < 45) return 'Vừa xong';
        if (diffSec < 3600) {
            const mins = Math.max(1, Math.floor(diffSec / 60));
            return `${mins} phút trước`;
        }
        if (diffSec < 86400) {
            const hours = Math.floor(diffSec / 3600);
            return `${hours} giờ trước`;
        }
        const days = Math.floor(diffSec / 86400);
        if (days < 30) {
            return `${days} ngày trước`;
        }
        if (defaultFallback && defaultFallback !== 'Vừa xong') return defaultFallback;
        const d = new Date(timeMs);
        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    }


    function parseTimestamp(tsStr) {
        if (!tsStr) return Date.now();
        if (typeof tsStr === 'number') return tsStr;
        const clean = String(tsStr).trim();
        const parts = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
        if (parts) {
            const day = parseInt(parts[1], 10);
            const month = parseInt(parts[2], 10) - 1;
            const year = parseInt(parts[3], 10);
            const hour = parts[4] ? parseInt(parts[4], 10) : 0;
            const min = parts[5] ? parseInt(parts[5], 10) : 0;
            const sec = parts[6] ? parseInt(parts[6], 10) : 0;
            return new Date(year, month, day, hour, min, sec).getTime();
        }
        const d = new Date(tsStr);
        return isNaN(d.getTime()) ? Date.now() : d.getTime();
    }

    function parseFlightDate(dateStr) {
        if (!dateStr) return null;
        if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
        const cleanStr = String(dateStr).replace(/·|-/g, ' ').replace(/\s+/g, ' ').trim();

        const p1 = cleanStr.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        const p2 = cleanStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
        const p3 = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);

        if (p1) {
            return new Date(parseInt(p1[5], 10), parseInt(p1[4], 10) - 1, parseInt(p1[3], 10), parseInt(p1[1], 10), parseInt(p1[2], 10));
        } else if (p2) {
            return new Date(parseInt(p2[3], 10), parseInt(p2[2], 10) - 1, parseInt(p2[1], 10), parseInt(p2[4], 10), parseInt(p2[5], 10));
        } else if (p3) {
            const d = new Date(dateStr);
            return isNaN(d.getTime()) ? null : d;
        }
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
    }

    function isWonAuctionExpired(item, passedData = null) {
        if (!item) return false;
        if (item.paymentStatus === 'PAID') return false;
        if (item.paymentStatus === 'PAID_LATE') return false;  // Supplementary payment approved by admin
        // CRITICAL PROTECTION: If admin waived the lock penalty, this order is no longer expired
        if (item.lockWaivedByAdmin === true) return false;
        // CRITICAL PROTECTION: If agent already reported bank transfer (PENDING_VERIFICATION),
        // order is protected from auto-cancellation & account lock while Admin reconciles!
        if (item.paymentStatus === 'PENDING_VERIFICATION') return false;
        if (item.paymentStatus === 'CANCELLED' || item.paymentStatus === 'CANCELLED_AFTER_PAYMENT') return false;
        if (item.paymentStatus === 'EXPIRED') return true;

        const now = Date.now();
        const allAuctions = (passedData && passedData.auctions) ? passedData.auctions : ((window.__CargoCore && typeof window.__CargoCore.loadData === 'function') ? (window.__CargoCore.loadData().auctions || []) : []);

        // Guard: if the linked auction is still OPEN, the won item cannot be expired.
        // This prevents historical wonAuctions sharing an auctionId with a newly created
        // OPEN auction from being incorrectly flagged after a fresh clone/deploy.
        const linkedAuction = allAuctions.find(a => a.id == item.auctionId);
        if (linkedAuction && linkedAuction.status === 'OPEN') return false;

        // 1. Check explicit paymentDeadline timestamp
        if (item.paymentDeadline) {
            const dlMs = new Date(item.paymentDeadline).getTime();
            if (!isNaN(dlMs) && now > dlMs) return true;
        }

        // 2. Check auction end time (+ 24h) - only if linked auction exists and is CLOSED
        if (linkedAuction && linkedAuction.endTime && linkedAuction.status === 'CLOSED') {
            const endMs = new Date(linkedAuction.endTime).getTime();
            if (!isNaN(endMs) && (now > endMs + 24 * 3600 * 1000)) return true;
        }

        // 3. Check Cut-off time using only the won item's own ETD data.
        // Do NOT use auction ETD, which may have been auto-renewed for a new session
        // with the same flight number.
        if (item.etdIso) {
            const etdDate = new Date(item.etdIso);
            if (!isNaN(etdDate.getTime())) {
                const cutoffDeadlineMs = etdDate.getTime() - 3 * 3600 * 1000;
                if (now >= cutoffDeadlineMs) return true;
            }
        }

        return false;
    }

    function autoCloseExpiredAuctions(data) {
        if (!data || !data.auctions) return false;
        let modified = false;
        const _now = new Date();
        const _pad = n => String(n).padStart(2, '0');
        const dateStr = `${_now.getFullYear()}${_pad(_now.getMonth() + 1)}${_pad(_now.getDate())}`;

        (data.auctions || []).forEach(auction => {
            const timer = getTimeRemaining(auction.endTime);
            const isTimerEnded = timer.isEnded;

            // QUY TẮC NGHIỆP VỤ: Tự động chuyển UPCOMING -> OPEN khi đến giờ mở phiên
            if (auction.status === 'UPCOMING') {
                const openTimeMs = auction.openDateIso ? Date.parse(auction.openDateIso) : (parseFlightDate(auction.openDate)?.getTime() || 0);
                if (openTimeMs > 0 && openTimeMs <= _now.getTime()) {
                    if (isTimerEnded) {
                        auction.status = 'CLOSED';
                        auction.closedAt = auction.closedAt || _now.toISOString();
                        modified = true;
                    } else {
                        auction.status = 'OPEN';
                        auction.openedAt = auction.openedAt || _now.toISOString();
                        modified = true;

                        if (!data.notifications) data.notifications = [];
                        data.notifications.unshift({
                            id: Date.now() + Math.floor(Math.random() * 1000),
                            timestamp: Date.now(),
                            targetAgentCode: null,
                            title: `🚀 CHÍNH THỨC MỞ THẦU: Chuyến ${auction.flightNumber} (${auction.route})`,
                            message: `Phiên đấu giá chuyến bay ${auction.flightNumber} (${auction.originName || ''} - ${auction.destName || ''}) đã đến giờ mở thầu. Mời các đại lý tham gia đặt giá ngay!`,
                            time: 'Vừa xong',
                            type: 'AUCTION_OPEN',
                            read: false,
                            link: `04-Detail.html?id=${auction.id}`
                        });
                    }
                }
            }

            // Tự động chuyển về UPCOMING nếu phiên chưa có lượt đặt nào nhưng giờ mở openDate vẫn ở tương lai (> 30s)
            if (auction.status === 'OPEN' && (!auction.bidsCount || auction.bidsCount === 0)) {
                const openTimeMs = auction.openDateIso ? Date.parse(auction.openDateIso) : (parseFlightDate(auction.openDate)?.getTime() || 0);
                if (openTimeMs > (_now.getTime() + 30000)) {
                    auction.status = 'UPCOMING';
                    modified = true;
                }
            }

            // QUY TẮC NGHIỆP VỤ: Khi phiên hết thời gian (isTimerEnded), phiên tự động ĐÓNG (status = 'CLOSED')
            if (auction.status === 'OPEN' && isTimerEnded) {
                auction.status = 'CLOSED';
                auction.closedAt = auction.closedAt || new Date().toISOString();
                modified = true;
            }

            // Xử lý chốt kết quả và người trúng thầu đối với phiên đã CLOSED
            if (auction.status === 'CLOSED') {
                const bids = (data.bids || []).filter(b => b.auctionId == auction.id).sort((a, b) => b.priceKg - a.priceKg);
                const highestBid = bids.length > 0 ? bids[0] : null;

                if (!highestBid) {
                    // Phiên không có đại lý nào tham gia đặt giá: xóa thông tin người thắng và giá thắng
                    if (auction.winnerAgentCode || auction.winnerAgentName || auction.winningPriceKg) {
                        auction.winnerAgentCode = null;
                        auction.winnerAgentName = null;
                        auction.winningPriceKg = 0;
                        auction.leadingAgentCode = null;
                        auction.leadingAgentName = null;
                        auction.bidsCount = 0;
                        modified = true;
                    }
                    auction.isFinalLocked = true;
                } else {
                    auction.winnerAgentCode = highestBid.agentCode;
                    auction.winnerAgentName = highestBid.agentName;
                    auction.winningPriceKg = highestBid.priceKg;
                    auction.winnerTotalAmountVND = highestBid.priceKg * auction.capacityKg;

                    // Tự động chốt kết quả khi hết thời gian điều chỉnh
                    const sysSettings = data.settings || {};
                    const reviewMins = Number(auction.reviewWindowMinutes || sysSettings.reviewWindowMinutes) || 15;
                    const baseTime = auction.closedAt || auction.endTime;
                    if (!auction.reviewDeadline && baseTime) {
                        auction.reviewDeadline = new Date(new Date(baseTime).getTime() + (reviewMins * 60 * 1000)).toISOString();
                        modified = true;
                    }
                    const reviewDeadlineMs = auction.reviewDeadline ? new Date(auction.reviewDeadline).getTime() : 0;
                    if (reviewDeadlineMs > 0 && _now.getTime() >= reviewDeadlineMs) {
                        if (!auction.isFinalLocked) {
                            auction.isFinalLocked = true;
                            auction.finalLockedAt = auction.finalLockedAt || _now.toISOString();
                            modified = true;
                        }
                    }

                    // Chỉ sinh đơn wonAuctions và set status WON khi phiên đã chốt thầu chính thức
                    if (auction.isFinalLocked) {
                        highestBid.status = 'WON';
                        if (!data.wonAuctions) data.wonAuctions = [];
                        let existingWon = data.wonAuctions.find(w => w.auctionId == auction.id);

                        if (!existingWon) {
                            const auctionCloseTime = auction.endTime ? new Date(auction.endTime) : new Date();
                            const payDeadline = calculatePaymentDeadline(auction, auctionCloseTime);

                        existingWon = {
                            wonId: `WON-${dateStr}-${String(auction.id).padStart(2, '0')}`,
                            auctionId: auction.id,
                            agentCode: highestBid.agentCode,
                            agentName: highestBid.agentName,
                            flightNumber: auction.flightNumber,
                            route: auction.route,
                            capacityKg: auction.capacityKg,
                            priceKg: highestBid.priceKg,
                            totalAmountVND: highestBid.priceKg * auction.capacityKg,
                            paymentDeadline: payDeadline,
                            paymentStatus: 'UNPAID',
                            paidAt: null,
                            notifiedAt: null,
                            awbNumber: `998-${Math.floor(10000000 + Math.random() * 90000000)}`,
                            cutOffTime: auction.cutOffTime || 'Hôm nay 18:00',
                            warehouse: 'Kho hàng SCSC / TCS Tân Sơn Nhất (Cửa số 4)',
                            cargoDeclaration: null
                        };
                        data.wonAuctions.unshift(existingWon);
                        modified = true;

                        if (!data.notifications) data.notifications = [];
                        const targetCode = (highestBid.agentCode || '').toUpperCase();
                        const hasNotif = data.notifications.some(n =>
                            (n.targetAgentCode || '').toUpperCase() === targetCode &&
                            n.type === 'WON' &&
                            (n.message || '').includes(auction.flightNumber)
                        );
                        if (!hasNotif) {
                            const wonNotifId = Date.now() + Math.floor(Math.random() * 1000);
                            data.notifications.unshift({
                                id: wonNotifId,
                                timestamp: wonNotifId,
                                targetAgentCode: highestBid.agentCode,
                                title: `🏆 CHÚC MỪNG! Bạn đã thắng thầu chuyến bay ${auction.flightNumber}`,
                                message: `Đại lý ${highestBid.agentName} (${highestBid.agentCode}) đã trúng thầu chuyến bay ${auction.flightNumber} (${auction.route}) với giá ${formatCurrency(highestBid.priceKg)}/Kg. Phiên đấu giá đã hoàn tất thành công và ghi nhận bạn là người trúng thầu.`,
                                time: formatTimeAgo(wonNotifId),
                                type: 'WON',
                                read: false,
                                link: `07-WonAuction.html?flight=${encodeURIComponent(auction.flightNumber)}`
                            });
                            modified = true;
                        }
                    }
                }
                }
            }
        });

        return modified;
    }

    function checkAndAutoLockExpiredWonAuctions(data) {
        if (!data) return false;
        let modified = false;

        // Lưu ý: không tự động mở khóa đại lý ở đây - trạng thái khóa do Admin đặt phải được giữ nguyên.

        // Clean up high-priority account lock alert notifications
        if (Array.isArray(data.notifications)) {
            const beforeLen = data.notifications.length;
            data.notifications = data.notifications.filter(n => !(n.type === 'ALERT' && (n.title || '').includes('TÀI KHOẢN ĐÃ BỊ KHÓA')));
            if (data.notifications.length !== beforeLen) {
                modified = true;
            }
        }

        return modified;
    }

    function calculateCutOffTime(etdStr, offsetHours = 3) {
        if (!etdStr) return `Trước ETD ${offsetHours} giờ`;

        const cleanStr = String(etdStr).replace(/·|-/g, ' ').replace(/\s+/g, ' ').trim();

        let hours = null, minutes = null, day = null, month = null, year = null;

        const p1 = cleanStr.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        const p2 = cleanStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
        const p3 = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);

        if (p1) {
            hours = parseInt(p1[1], 10);
            minutes = parseInt(p1[2], 10);
            day = parseInt(p1[3], 10);
            month = parseInt(p1[4], 10) - 1;
            year = parseInt(p1[5], 10);
        } else if (p2) {
            day = parseInt(p2[1], 10);
            month = parseInt(p2[2], 10) - 1;
            year = parseInt(p2[3], 10);
            hours = parseInt(p2[4], 10);
            minutes = parseInt(p2[5], 10);
        } else if (p3) {
            year = parseInt(p3[1], 10);
            month = parseInt(p3[2], 10) - 1;
            day = parseInt(p3[3], 10);
            hours = parseInt(p3[4], 10);
            minutes = parseInt(p3[5], 10);
        }

        if (hours !== null && day !== null && year !== null) {
            const dt = new Date(year, month, day, hours, minutes);
            dt.setHours(dt.getHours() - offsetHours);

            const pad = n => String(n).padStart(2, '0');
            const cutH = pad(dt.getHours());
            const cutM = pad(dt.getMinutes());
            const cutD = pad(dt.getDate());
            const cutMo = pad(dt.getMonth() + 1);
            const cutY = dt.getFullYear();

            return `${cutH}:${cutM} · ${cutD}/${cutMo}/${cutY} (Trước ETD ${offsetHours}h)`;
        }

        const d = new Date(etdStr);
        if (!isNaN(d.getTime())) {
            d.setHours(d.getHours() - offsetHours);
            const pad = n => String(n).padStart(2, '0');
            return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} (Trước ETD ${offsetHours}h)`;
        }

        return `Trước ETD ${offsetHours} giờ`;
    }

    function calculatePaymentDeadline(auction, nowDate = null) {
        let baseMs = Date.now();
        if (nowDate) {
            const p = (nowDate instanceof Date) ? nowDate.getTime() : new Date(nowDate).getTime();
            if (!isNaN(p)) baseMs = p;
        } else if (auction && auction.endTime) {
            const p = new Date(auction.endTime).getTime();
            if (!isNaN(p)) baseMs = p;
        }

        const default24hMs = baseMs + 24 * 60 * 60 * 1000;

        if (!auction) return new Date(default24hMs).toISOString();

        let etdDate = null;
        if (auction.etdIso) {
            etdDate = new Date(auction.etdIso);
        } else if (auction.etd) {
            etdDate = parseFlightDate(auction.etd);
        }

        if (etdDate && !isNaN(etdDate.getTime())) {
            const cutOffMs = etdDate.getTime() - 3 * 3600 * 1000;
            // Ensure payment deadline is never already in the past upon creation (minimum 2 hours grace)
            if (cutOffMs > baseMs + 2 * 3600 * 1000) {
                const effectiveMs = Math.min(cutOffMs, default24hMs);
                return new Date(effectiveMs).toISOString();
            }
        }

        return new Date(default24hMs).toISOString();
    }

    function formatPaymentDeadlineText(auction, paymentDeadlineIso) {
        if (!paymentDeadlineIso) return 'Trong vòng 24 giờ kể từ thời điểm chốt thầu';
        const dlDate = new Date(paymentDeadlineIso);
        if (isNaN(dlDate.getTime())) return 'Trong vòng 24 giờ kể me thời điểm chốt thầu';

        const pad = n => String(n).padStart(2, '0');
        const dlFormatted = `${pad(dlDate.getHours())}:${pad(dlDate.getMinutes())} ngày ${pad(dlDate.getDate())}/${pad(dlDate.getMonth() + 1)}/${dlDate.getFullYear()}`;

        if (auction && auction.etd) {
            const etdClean = String(auction.etd).replace(/·|-/g, ' ').replace(/\s+/g, ' ').trim();
            const p1 = etdClean.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            const p2 = etdClean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
            const p3 = etdClean.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
            let h = null, d = null, m = null, y = null, mins = null;

            if (p1) { h = parseInt(p1[1], 10); mins = parseInt(p1[2], 10); d = parseInt(p1[3], 10); m = parseInt(p1[4], 10) - 1; y = parseInt(p1[5], 10); }
            else if (p2) { d = parseInt(p2[1], 10); m = parseInt(p2[2], 10) - 1; y = parseInt(p2[3], 10); h = parseInt(p2[4], 10); mins = parseInt(p2[5], 10); }
            else if (p3) { y = parseInt(p3[1], 10); m = parseInt(p3[2], 10) - 1; d = parseInt(p3[3], 10); h = parseInt(p3[4], 10); mins = parseInt(p3[5], 10); }

            if (h !== null && d !== null) {
                const etdDate = new Date(y, m, d, h, mins);
                const cutOffMs = etdDate.getTime() - 3 * 3600 * 1000;
                const diffHoursFromNow = (cutOffMs - Date.now()) / (3600 * 1000);
                if (diffHoursFromNow < 24) {
                    return `${dlFormatted} (Trước Cut-off kho do bay trong ngày)`;
                }
            }
        }

        return `${dlFormatted} (Hạn 24 tiếng)`;
    }

    const ROUTE_DURATIONS_MINUTES = {
        'SGN-HAN': 135, // 2h 15m
        'HAN-SGN': 135,
        'SGN-DAD': 80,  // 1h 20m
        'DAD-SGN': 80,
        'HAN-DAD': 80,  // 1h 20m
        'DAD-HAN': 80,
        'SGN-PQC': 60,  // 1h 00m
        'PQC-SGN': 60,
        'HAN-PQC': 135, // 2h 15m
        'PQC-HAN': 135,
        'DAD-PQC': 105, // 1h 45m
        'PQC-DAD': 105,
        'SGN-CXR': 60,  'CXR-SGN': 60,
        'HAN-CXR': 115, 'CXR-HAN': 115,
        'SGN-DLI': 50,  'DLI-SGN': 50,
        'HAN-DLI': 115, 'DLI-HAN': 115,
        'SGN-HPH': 120, 'HPH-SGN': 120,
        'SGN-HUI': 85,  'HUI-SGN': 85,
        'HAN-HUI': 70,  'HUI-HAN': 70,
        'SGN-UIH': 70,  'UIH-SGN': 70,
        'HAN-UIH': 95,  'UIH-HAN': 95,
        'SGN-VII': 105, 'VII-SGN': 105,
        'HAN-VII': 60,  'VII-HAN': 60,
        'SGN-VCA': 45,  'VCA-SGN': 45,
        'HAN-VCA': 130, 'VCA-HAN': 130,
        'SGN-VDO': 135, 'VDO-SGN': 135,
        'DAD-CXR': 65,  'CXR-DAD': 65
    };

    function getFlightDurationMinutes(origin, destination) {
        if (!origin || !destination) return 90;
        const key = `${String(origin).trim().toUpperCase()}-${String(destination).trim().toUpperCase()}`;
        return ROUTE_DURATIONS_MINUTES[key] || 90;
    }

    function calculateETA(etdStr, origin, destination) {
        if (!etdStr) return null;
        const etdDate = new Date(etdStr);
        if (isNaN(etdDate.getTime())) return null;

        const durationMins = getFlightDurationMinutes(origin, destination);
        return new Date(etdDate.getTime() + durationMins * 60 * 1000);
    }

    function generateNextFlightNumber(origin = 'SGN', destination = 'HAN', skipCount = 0, passedData = null) {
        const data = passedData || (window.__CargoCore && typeof window.__CargoCore.loadData === 'function' ? window.__CargoCore.loadData() : defaultData);
        const existingNumbers = new Set(
            (data.auctions || [])
                .map(a => String(a.flightNumber || '').trim().toUpperCase())
                .concat((data.wonAuctions || []).map(w => String(w.flightNumber || '').trim().toUpperCase()))
                .filter(Boolean)
        );

        const origStr = String(origin || 'SGN').trim().toUpperCase();
        const destStr = String(destination || 'HAN').trim().toUpperCase();
        const pair = `${origStr}-${destStr}`;

        // Extended realistic flight number pools for Vietravel Airlines (VU)
        // Even numbers for Southbound/Eastbound, Odd for Northbound/Westbound
        const routeBases = {
            'SGN-HAN': [130, 132, 134, 136, 138, 140, 142, 144, 146, 148],
            'HAN-SGN': [131, 133, 135, 137, 139, 141, 143, 145, 147, 149],
            'SGN-DAD': [220, 222, 224, 226, 228, 230, 232, 234],
            'DAD-SGN': [221, 223, 225, 227, 229, 231, 233, 235],
            'HAN-DAD': [260, 262, 264, 266, 268, 270],
            'DAD-HAN': [261, 263, 265, 267, 269, 271],
            'HAN-PQC': [340, 342, 344, 346, 348],
            'PQC-HAN': [341, 343, 345, 347, 349],
            'SGN-PQC': [450, 452, 454, 456, 458],
            'PQC-SGN': [451, 453, 455, 457, 459],
            'DAD-PQC': [510, 512, 514, 516],
            'PQC-DAD': [511, 513, 515, 517],
            'SGN-CXR': [620, 622, 624, 626],
            'CXR-SGN': [621, 623, 625, 627],
            'HAN-CXR': [640, 642, 644, 646],
            'CXR-HAN': [641, 643, 645, 647],
            'SGN-DLI': [710, 712, 714],
            'DLI-SGN': [711, 713, 715],
            'HAN-DLI': [730, 732, 734],
            'DLI-HAN': [731, 733, 735],
            'SGN-VII': [810, 812, 814],
            'VII-SGN': [811, 813, 815],
            'SGN-HPH': [830, 832, 834],
            'HPH-SGN': [831, 833, 835],
            'SGN-HUI': [850, 852, 854],
            'HUI-SGN': [851, 853, 855],
            'SGN-UIH': [870, 872, 874],
            'UIH-SGN': [871, 873, 875],
            'SGN-VCA': [890, 892, 894],
            'VCA-SGN': [891, 893, 895],
            'SGN-VDO': [910, 912, 914],
            'VDO-SGN': [911, 913, 915]
        };

        const defaultCandidates = [610, 612, 614, 616, 618, 620, 622, 624, 626, 628, 630, 632, 634, 636, 638, 640];
        const candidates = routeBases[pair] || defaultCandidates;
        const available = candidates.filter(num => !existingNumbers.has(`VU${num}`));

        if (available.length > 0) {
            const randomIndex = Math.floor(Math.random() * available.length);
            return `VU${available[randomIndex]}`;
        }

        // Fallback if primary numbers taken
        const isEven = (candidates[0] % 2 === 0);
        let randomNum = Math.floor(Math.random() * 400) * 2 + (isEven ? 100 : 101);
        let attempts = 0;
        while (existingNumbers.has(`VU${randomNum}`) && attempts < 500) {
            randomNum = Math.floor(Math.random() * 400) * 2 + (isEven ? 100 : 101);
            attempts++;
        }
        return `VU${randomNum}`;
    }


    Object.assign(Core, {
        STORAGE_KEY,
        seedAgents,
        PERMISSION_DEFINITIONS,
        ALL_PERMISSION_KEYS,
        seedRoles,
        seedAdmins,
        defaultData,
        deduplicateBids,
        getEffectiveLogTime,
        deduplicateActivityLogs,
        deduplicateNotifications,
        reconcileAuctionSummaries,
        formatCurrency,
        formatNumber,
        getTimeRemaining,
        formatTimeAgo,
        parseTimestamp,
        parseFlightDate,
        isWonAuctionExpired,
        autoCloseExpiredAuctions,
        checkAndAutoLockExpiredWonAuctions,
        calculateCutOffTime,
        calculatePaymentDeadline,
        formatPaymentDeadlineText,
        ROUTE_DURATIONS_MINUTES,
        getFlightDurationMinutes,
        calculateETA,
        generateNextFlightNumber
    });
})();
