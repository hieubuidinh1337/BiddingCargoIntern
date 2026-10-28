/**
 * CARGO BIDDING SYSTEM - Shared Store & Realtime Simulation
 * Synchronizes multi-account SQL database data with distinct passwords per account
 */

const CargoStore = (function () {
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

    let _memoryCacheData = null;
    let _memoryCacheRaw = null;

    function loadData() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                if (!_memoryCacheData) {
                    _memoryCacheData = JSON.parse(JSON.stringify(defaultData));
                    _memoryCacheRaw = "";
                }
                return _memoryCacheData;
            }

            // High-speed fast path: Return memory cache if raw string unchanged
            if (_memoryCacheData && raw === _memoryCacheRaw) {
                if (!_memoryCacheData.adminsList || !Array.isArray(_memoryCacheData.adminsList) || _memoryCacheData.adminsList.length === 0 || !_memoryCacheData.adminsList.some(a => (a.username || '').toLowerCase() === 'admin')) {
                    _memoryCacheData = null; // force reload and self-healing
                } else {
                    return _memoryCacheData;
                }
            }

            let data = JSON.parse(raw);
            let updated = false;

            if (data.activityLogs && Array.isArray(data.activityLogs)) {
                const now = Date.now();
                const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
                const origLen = data.activityLogs.length;
                data.activityLogs = deduplicateActivityLogs(data.activityLogs).filter(l => {
                    if (!l) return false;
                    const timeMs = l.rawTime || parseTimestamp(l.timestamp);
                    if (!timeMs || isNaN(timeMs)) return true;
                    const age = now - timeMs;
                    return age <= NINETY_DAYS_MS && age >= -86400000;
                });
                if (data.activityLogs.length !== origLen) {
                    updated = true;
                }
            }

            if (!data.bankConfig) {
                data.bankConfig = JSON.parse(JSON.stringify(defaultData.bankConfig));
                updated = true;
            }

            if (!data.routeSubscriptions) {
                data.routeSubscriptions = JSON.parse(JSON.stringify(defaultData.routeSubscriptions));
                updated = true;
            }

            if (!data.watchlist || !Array.isArray(data.watchlist)) {
                data.watchlist = [];
                updated = true;
            }

            if (!data.airports || !Array.isArray(data.airports) || data.airports.length === 0) {
                data.airports = JSON.parse(JSON.stringify(defaultData.airports));
                updated = true;
            }

            if (!data.aircraftTypes || !Array.isArray(data.aircraftTypes) || data.aircraftTypes.length === 0) {
                data.aircraftTypes = JSON.parse(JSON.stringify(defaultData.aircraftTypes));
                updated = true;
            }

            // Ensure roles and admins in adminsList
            if (!data.adminsList || !Array.isArray(data.adminsList) || data.adminsList.length === 0) {
                data.adminsList = JSON.parse(JSON.stringify(seedAdmins));
                updated = true;
            } else {
                // Ensure default accounts exist
                seedAdmins.forEach(sAcc => {
                    const found = data.adminsList.find(a => (a.username || '').toLowerCase() === (sAcc.username || '').toLowerCase());
                    if (!found) {
                        data.adminsList.push(JSON.parse(JSON.stringify(sAcc)));
                        updated = true;
                    }
                });

                // Migrate legacy roles for all accounts in adminsList
                data.adminsList.forEach(a => {
                    const u = (a.username || '').toLowerCase();
                    const r = String(a.role || '').toUpperCase();

                    // Migrate standard user details & names
                    if (u === 'admin') {
                        a.role = 'SUPER_ADMIN';
                        a.roles = ['SUPER_ADMIN'];
                        a.fullName = 'Trần Quản Trị (Super Admin)';
                        updated = true;
                    } else if (u === 'cod_admin') {
                        if (r === 'COD_ADMIN' || r === 'COD ADMIN' || !a.role) {
                            a.role = 'COD_MANAGER';
                            updated = true;
                        }
                        a.fullName = 'Lê Khai Thác (COD Manager)';
                    } else if (u === 'settler01') {
                        if (r === 'AUCTION_SETTLEMENT' || r === 'SETTLEMENT_ADMIN' || !a.role) {
                            a.role = 'SETTLEMENT_OFFICER';
                            updated = true;
                        }
                        a.fullName = 'Vũ Thẩm Định (Settlement Officer)';
                    } else if (u === 'staff01') {
                        if (r === 'STAFF' || !a.role) {
                            a.role = 'OPERATIONS_VIEWER';
                            updated = true;
                        }
                        a.fullName = 'Nguyễn Điều Hành (Operations Staff)';
                    } else if (u === 'staff02') {
                        if (!a.role) a.role = 'AGENT_AUDITOR';
                        a.fullName = 'Lê Thị Bích Vân (Agent Auditor)';
                    }

                    // Map legacy roles in roles array
                    if (!Array.isArray(a.roles) || a.roles.length === 0) {
                        a.roles = [a.role || 'OPERATIONS_VIEWER'];
                        updated = true;
                    } else {
                        const originalRolesStr = JSON.stringify(a.roles);
                        a.roles = a.roles.map(item => {
                            const itUpper = String(item || '').toUpperCase();
                            if (itUpper === 'ITD_ADMIN' || itUpper === 'ADMIN') return 'SUPER_ADMIN';
                            if (itUpper === 'COD_ADMIN' || itUpper === 'COD ADMIN') return 'COD_MANAGER';
                            if (itUpper === 'AUCTION_SETTLEMENT' || itUpper === 'SETTLEMENT_ADMIN') return 'SETTLEMENT_OFFICER';
                            if (itUpper === 'STAFF') return 'OPERATIONS_VIEWER';
                            return item;
                        });
                        a.roles = Array.from(new Set(a.roles));
                        if (JSON.stringify(a.roles) !== originalRolesStr) {
                            updated = true;
                        }
                    }
                });

                if (data.currentAdmin) {
                    const matchedStaff = data.adminsList.find(a => (a.username || '').toLowerCase() === (data.currentAdmin.username || '').toLowerCase());
                    if (matchedStaff) {
                        data.currentAdmin.role = matchedStaff.role;
                        data.currentAdmin.roles = matchedStaff.roles;
                        data.currentAdmin.fullName = matchedStaff.fullName;
                        data.currentAdmin.department = matchedStaff.department;
                        updated = true;
                    } else {
                        const cr = String(data.currentAdmin.role || '').toUpperCase();
                        if (cr === 'ITD_ADMIN' || cr === 'ADMIN') {
                            data.currentAdmin.role = 'SUPER_ADMIN';
                            data.currentAdmin.roles = ['SUPER_ADMIN'];
                            updated = true;
                        } else if (cr === 'COD_ADMIN' || cr === 'COD ADMIN') {
                            data.currentAdmin.role = 'COD_MANAGER';
                            data.currentAdmin.roles = ['COD_MANAGER'];
                            updated = true;
                        } else if (cr === 'AUCTION_SETTLEMENT' || cr === 'SETTLEMENT_ADMIN') {
                            data.currentAdmin.role = 'SETTLEMENT_OFFICER';
                            data.currentAdmin.roles = ['SETTLEMENT_OFFICER'];
                            updated = true;
                        } else if (cr === 'STAFF') {
                            data.currentAdmin.role = 'OPERATIONS_VIEWER';
                            data.currentAdmin.roles = ['OPERATIONS_VIEWER'];
                            updated = true;
                        }
                    }
                }
            }

            // Ensure rolesList exists and standard seed roles are up-to-date
            if (!data.rolesList || !Array.isArray(data.rolesList) || data.rolesList.length === 0) {
                data.rolesList = JSON.parse(JSON.stringify(seedRoles));
                updated = true;
            } else {
                seedRoles.forEach(sRole => {
                    const existing = data.rolesList.find(r => r.code === sRole.code || r.id === sRole.id);
                    if (!existing) {
                        data.rolesList.push(JSON.parse(JSON.stringify(sRole)));
                        updated = true;
                    } else if (sRole.isSystem) {
                        existing.permissions = [...ALL_PERMISSION_KEYS];
                        existing.isSystem = true;
                    }
                });
            }

            if (data.bids && Array.isArray(data.bids)) {
                const origCount = data.bids.length;
                data.bids = deduplicateBids(data.bids);
                if (data.bids.length !== origCount) {
                    updated = true;
                }
            }

            // Ensure data.auctions has default seed if missing or empty
            if (!data.auctions || !Array.isArray(data.auctions) || data.auctions.length === 0) {
                data.auctions = JSON.parse(JSON.stringify(defaultData.auctions));
                updated = true;
            }

            // Sanitize and filter out corrupted dummy auctions (e.g. missing origin/destination/flightNumber or VU-HIST)
            if (data.auctions && Array.isArray(data.auctions)) {
                const initialCount = data.auctions.length;
                data.auctions = data.auctions.filter(a =>
                    a &&
                    a.flightNumber &&
                    a.flightNumber !== 'VU-HIST' &&
                    a.origin &&
                    a.destination &&
                    a.originName &&
                    a.destName &&
                    (a.capacityKg || 0) > 0
                );
                if (data.auctions.length !== initialCount) {
                    updated = true;
                }
            }

            // Auto-refresh ETD and end time for OPEN auctions if expired & deduplicate
            const now = Date.now();
            const pad = n => String(n).padStart(2, '0');
            if (data.auctions && Array.isArray(data.auctions)) {
                const seenIds = new Set();
                const uniqueAuctions = [];
                data.auctions.forEach((a, idx) => {
                    const idKey = String(a.id);
                    if (!seenIds.has(idKey)) {
                        seenIds.add(idKey);
                        if (a.status === 'OPEN') {
                            const endTimeMs = a.endTime ? Date.parse(a.endTime) : (a.closeDateIso ? Date.parse(a.closeDateIso) : NaN);

                            if (!isNaN(endTimeMs) && endTimeMs > now) {
                                // Phiên đang OPEN và có hạn đóng hợp lệ trong tương lai:
                                // TUYỆT ĐỐI KHÔNG ghi đè a.endTime! Giữ nguyên thời gian admin/hệ thống đã thiết lập.
                                if (!a.endTime && a.closeDateIso) {
                                    a.endTime = a.closeDateIso;
                                    updated = true;
                                }
                            } else if (isNaN(endTimeMs)) {
                                // Chỉ khi thiếu endTime hoàn toàn: gán mặc định an toàn 1 giờ
                                const safeClose = now + 60 * 60 * 1000;
                                a.endTime = new Date(safeClose).toISOString();
                                updated = true;
                            } else if (endTimeMs <= now) {
                                // Phiên đã hết thời gian đếm ngược: tự động đóng phiên
                                a.status = 'CLOSED';
                                a.closedAt = a.closedAt || new Date(endTimeMs).toISOString();
                                updated = true;
                            }
                        }

                        if (a.status === 'UPCOMING') {
                            const openTimeMs = a.openDateIso ? Date.parse(a.openDateIso) : (a.openDate ? (parseFlightDate(a.openDate)?.getTime() || NaN) : NaN);
                            if (isNaN(openTimeMs) || openTimeMs <= now) {
                                a.status = 'OPEN';
                                updated = true;
                            }
                        }

                        if (!a.flightPeriod) {
                            if (a.flightStartDate && a.flightEndDate) {
                                a.flightPeriod = (a.flightStartDate === a.flightEndDate) ? `Ngày ${a.flightStartDate}` : `Từ ${a.flightStartDate} ➔ Đến ${a.flightEndDate}`;
                            } else {
                                const baseDate = a.etdIso ? new Date(a.etdIso) : (parseFlightDate(a.etd) || new Date(now + 86400000));
                                const pad = n => String(n).padStart(2, '0');
                                const sStr = `${pad(baseDate.getDate())}/${pad(baseDate.getMonth() + 1)}/${baseDate.getFullYear()}`;
                                const isoDateStr = `${baseDate.getFullYear()}-${pad(baseDate.getMonth() + 1)}-${pad(baseDate.getDate())}`;
                                a.flightStartDate = a.flightStartDate || isoDateStr;
                                a.flightEndDate = a.flightEndDate || isoDateStr;
                                a.flightPeriod = `Ngày ${sStr}`;
                                updated = true;
                            }
                        }

                        // Fix corrupted/identical ETD and ETA where ETD was mistakenly set to closeDate
                        if (!a.etd || !a.eta || a.etd === a.eta || (a.closeDate && a.etd === a.closeDate)) {
                            let depDate = a.flightStartDate ? parseFlightDate(`${a.flightStartDate}T08:00`) : parseFlightDate(a.etd);
                            if (!depDate && a.etdIso) depDate = new Date(a.etdIso);
                            if (!depDate) depDate = new Date(now + 86400000);

                            const pad = n => String(n).padStart(2, '0');
                            const dStr = `${pad(depDate.getDate())}/${pad(depDate.getMonth() + 1)}/${depDate.getFullYear()}`;
                            a.etd = `08:00 · ${dStr}`;

                            const durMins = getFlightDurationMinutes(a.origin, a.destination);
                            const totalMins = 8 * 60 + durMins;
                            const etaH = Math.floor(totalMins / 60) % 24;
                            const etaM = totalMins % 60;
                            a.eta = `${pad(etaH)}:${pad(etaM)} · ${dStr}`;
                            updated = true;
                        }

                        uniqueAuctions.push(a);
                    } else {
                        updated = true;
                    }
                });
                data.auctions = uniqueAuctions;

                // Reconcile wonAuctions with auctions and clean up orphan wonAuctions
                if (data.wonAuctions && Array.isArray(data.wonAuctions)) {
                    const validAuctionMap = new Map(data.auctions.map(a => [Number(a.id), a]));
                    const initialWonCount = data.wonAuctions.length;

                    // Delete wonAuctions whose auctionId does not exist in auctions
                    data.wonAuctions = data.wonAuctions.filter(w => {
                        const aId = Number(w.auctionId);
                        return !isNaN(aId) && validAuctionMap.has(aId);
                    });

                    if (data.wonAuctions.length !== initialWonCount) {
                        updated = true;
                    }

                    // Synchronize fields between wonAuctions and matching auctions
                    data.wonAuctions.forEach(w => {
                        const auction = validAuctionMap.get(Number(w.auctionId));
                        if (auction) {
                            if (!w.flightNumber && auction.flightNumber) {
                                w.flightNumber = auction.flightNumber;
                                updated = true;
                            }
                            if (!w.route && auction.route) {
                                w.route = auction.route;
                                updated = true;
                            }
                            if ((!w.capacityKg || Number(w.capacityKg) <= 0) && auction.capacityKg) {
                                w.capacityKg = Number(auction.capacityKg);
                                updated = true;
                            }
                            if (auction.status === 'CLOSED') {
                                if (auction.winnerAgentCode !== w.agentCode) {
                                    auction.winnerAgentCode = w.agentCode;
                                    updated = true;
                                }
                                if (auction.winnerAgentName !== w.agentName) {
                                    auction.winnerAgentName = w.agentName;
                                    updated = true;
                                }
                                if (auction.winningPriceKg !== w.priceKg) {
                                    auction.winningPriceKg = w.priceKg;
                                    updated = true;
                                }
                            }
                        }
                    });
                }
            }

            // Reconcile auction summary fields from bid history so UI always reflects the real highest bid.
            if (data.auctions && Array.isArray(data.auctions)) {
                const allBids = Array.isArray(data.bids) ? data.bids : [];
                data.auctions.forEach(a => {
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
                            updated = true;
                        }

                        const normalizedLeaderCode = (highestBid.agentCode || '').trim();
                        const normalizedLeaderName = (highestBid.agentName || '').trim();

                        if (normalizedLeaderCode && normalizedLeaderCode !== 'AG-***') {
                            if ((a.leadingAgentCode || '').trim() !== normalizedLeaderCode ||
                                (a.leadingAgentName || '').trim() !== normalizedLeaderName) {
                                a.leadingAgentCode = normalizedLeaderCode;
                                a.leadingAgentName = normalizedLeaderName;
                                a.isAnonymous = highestBid.isAnonymous !== false;
                                updated = true;
                            }
                        }

                        const bidCount = auctionBids.length;
                        if ((a.bidsCount || 0) !== bidCount) {
                            a.bidsCount = bidCount;
                            updated = true;
                        }
                    } else {
                        // When there are 0 bids: clear leader info & reset current price to starting price
                        if (a.leadingAgentCode || a.leadingAgentName || (a.bidsCount || 0) !== 0 || (a.startingPriceKg && a.currentPriceKg !== a.startingPriceKg)) {
                            a.leadingAgentCode = null;
                            a.leadingAgentName = null;
                            a.bidsCount = 0;
                            if (a.startingPriceKg) {
                                a.currentPriceKg = a.startingPriceKg;
                            }
                            updated = true;
                        }
                    }
                });
            }

            if (!data.agentsList || !Array.isArray(data.agentsList) || data.agentsList.length === 0) {
                data.agentsList = JSON.parse(JSON.stringify(seedAgents));
                updated = true;
            } else {
                const initialCount = data.agentsList.length;
                data.agentsList = data.agentsList.filter(ag => {
                    if (!ag) return false;
                    const code = String(ag.code || '').trim();
                    if (!code || code === 'undefined' || code === 'null') return false;
                    const codeUpper = code.toUpperCase();
                    if (['ALL', 'STAFF', 'SYSTEM', 'ADMIN', 'VU-ADMIN-01', 'VU-OPS-88'].includes(codeUpper)) return false;
                    const name = String(ag.companyName || ag.name || '').trim();
                    if (!ag.repName && !ag.email && !ag.taxCode && !ag.phone && !name) return false;
                    return true;
                });
                if (data.agentsList.length !== initialCount) {
                    updated = true;
                }
            }

            // Auto-heal & sync currentUser PIN with agentsList
            if (data.currentUser) {
                const curCode = String(data.currentUser.agentCode || data.currentUser.code || '').trim().toUpperCase();
                if (!curCode) {
                    data.currentUser = null;
                    updated = true;
                } else if (Array.isArray(data.agentsList)) {
                    const ag = data.agentsList.find(a => String(a.code || '').trim().toUpperCase() === curCode);
                    if (ag) {
                        if (ag.pin && data.currentUser.pin !== ag.pin) {
                            data.currentUser.pin = ag.pin;
                            data.currentUser.pinCreatedAt = ag.pinCreatedAt || data.currentUser.pinCreatedAt || Date.now();
                            updated = true;
                        } else if (data.currentUser.pin && !ag.pin) {
                            ag.pin = data.currentUser.pin;
                            updated = true;
                        } else if (!data.currentUser.pin && !ag.pin) {
                            data.currentUser.pin = '1234';
                            ag.pin = '1234';
                            updated = true;
                        }
                    } else if (!data.currentUser.pin) {
                        data.currentUser.pin = '1234';
                        updated = true;
                    }
                }
            }

            if (!data.adminsList || !Array.isArray(data.adminsList) || data.adminsList.length === 0) {
                data.adminsList = JSON.parse(JSON.stringify(seedAdmins));
                updated = true;
            }

            if (!data.registrations || !Array.isArray(data.registrations)) {
                data.registrations = JSON.parse(JSON.stringify(defaultData.registrations));
                updated = true;
            }

            if (!data.wonAuctions || !Array.isArray(data.wonAuctions)) {
                data.wonAuctions = [];
                updated = true;
            } else {
                // Self-healing migration for existing localStorage data
                defaultData.wonAuctions.forEach(defWon => {
                    const existing = data.wonAuctions.find(w => w.wonId === defWon.wonId);
                    if (!existing) {
                        data.wonAuctions.push(JSON.parse(JSON.stringify(defWon)));
                        updated = true;
                    } else if (defWon.wonId === 'WON-2026-0815-03' && existing.agentCode !== 'AG-0892') {
                        existing.agentCode = 'AG-0892';
                        existing.agentName = 'ABC Logistics';
                        existing.priceKg = 56000;
                        existing.totalAmountVND = 196000000;
                        updated = true;
                    }
                });

                // CRITICAL MIGRATION: Remap historical wonAuctions that still have old auctionIds
                // conflicting with currently OPEN auctions (ids 1, 2, 3).
                // This runs on any existing localStorage data from before the auctionId fix.
                const HISTORICAL_ID_REMAP = { 1: 101, 2: 102, 3: 103 };
                const openAuctionIds = new Set((data.auctions || []).filter(a => a.status === 'OPEN').map(a => Number(a.id)));
                const historicalWonIds = new Set(['WON-2026-0815-02', 'WON-2026-0815-03', 'WON-2026-0815-04']);

                data.wonAuctions.forEach(w => {
                    if (!historicalWonIds.has(w.wonId)) return;
                    const oldId = Number(w.auctionId);
                    if (openAuctionIds.has(oldId) && HISTORICAL_ID_REMAP[oldId]) {
                        w.auctionId = HISTORICAL_ID_REMAP[oldId];
                        updated = true;
                    }
                });
            }

            // Purge credentials from any existing notifications
            if (data.notifications && Array.isArray(data.notifications)) {
                data.notifications.forEach(n => {
                    if (n && n.message && n.message.includes('Mật khẩu đăng nhập:')) {
                        n.message = n.message.replace(/Mật khẩu đăng nhập:.*?(?=Quý công ty|$)/, 'Quý công ty vui lòng sử dụng Mã Đại lý cùng Mật khẩu và Mã PIN đã đăng ký để đăng nhập vào Sàn Đấu giá Cargo. ');
                        n.message = n.message.replace(/\s+/g, ' ').trim();
                        if (n.title && n.title.includes('[EMAIL THÔNG BÁO]')) {
                            n.title = n.title.replace('[EMAIL THÔNG BÁO] ', '');
                        }
                        updated = true;
                    }
                });
            }

            // Normalize wonAuctions dates if unparseable and purge TEST_ items
            if (data.wonAuctions && Array.isArray(data.wonAuctions)) {
                const initCount = data.wonAuctions.length;
                data.wonAuctions = data.wonAuctions.filter(w => w && w.wonId && !String(w.wonId).startsWith('TEST_') && !String(w.wonId).startsWith('WON_PAID_TEST_'));
                if (data.wonAuctions.length !== initCount) updated = true;

                data.wonAuctions.forEach(w => {
                    if (w.cutOffTime) {
                        if (w.cutOffTime.includes('15/08/2026')) w.cutOffTime = w.cutOffTime.replace('15/08/2026', '09/09/2026');
                        if (w.cutOffTime.includes('16/08/2026')) w.cutOffTime = w.cutOffTime.replace('16/08/2026', '09/09/2026');
                        if (w.cutOffTime.includes('14/08/2026')) w.cutOffTime = w.cutOffTime.replace('14/08/2026', '08/09/2026');
                    }
                });
            }

            // Mark admin reconciliation notifications
            if (data.notifications && Array.isArray(data.notifications)) {
                data.notifications.forEach(n => {
                    if ((n.title || '').includes('ĐẠI LÝ BÁO CHUYỂN KHOẢN') || (n.message || '').includes('đối soát sao kê ngân hàng')) {
                        n.targetRole = 'ADMIN';
                        n.targetAgentCode = null;
                        updated = true;
                    }
                });
            }

            // Self-healing migration for notifications
            if (!data.notifications || !Array.isArray(data.notifications)) {
                data.notifications = JSON.parse(JSON.stringify(defaultData.notifications));
                updated = true;
            } else {
                const origLen = data.notifications.length;
                if (data.deletedNotificationIds && Array.isArray(data.deletedNotificationIds)) {
                    const delSet = new Set(data.deletedNotificationIds.map(String));
                    data.notifications = data.notifications.filter(n => !delSet.has(String(n.id)));
                }
                data.notifications = deduplicateNotifications(data.notifications);
                if (data.notifications.length !== origLen) updated = true;
            }

            // Migrate any old August/early September 2026 dates to active September 2026 dates
            if (data.auctions && Array.isArray(data.auctions)) {
                data.auctions.forEach((a, idx) => {
                    if (a.status === 'OPEN' && a.etd && (a.etd.includes('15/08/2026') || a.etd.includes('08/09/2026') || a.etd.includes('09/09/2026'))) {
                        a.etd = a.etd.replace(/15\/08\/2026|08\/09\/2026|09\/09\/2026/g, '15/09/2026');
                        if (a.eta) a.eta = a.eta.replace(/15\/08\/2026|08\/09\/2026|09\/09\/2026/g, '15/09/2026');
                        if (a.cutOffTime) a.cutOffTime = a.cutOffTime.replace(/15\/08\/2026|08\/09\/2026|09\/09\/2026/g, '15/09/2026');
                        if (a.flightCode) a.flightCode = a.flightCode.replace(/260815|260908|260909/g, '260915');
                        if (a.flightNumber === 'VU130') a.etdIso = '2026-09-15T13:45:00.000Z';
                        if (a.flightNumber === 'VU224') a.etdIso = '2026-09-15T14:30:00.000Z';
                        if (a.flightNumber === 'VU340') a.etdIso = '2026-09-15T15:45:00.000Z';
                        updated = true;
                    }
                });
            }

            // Auto-close expired auctions and create won items/notifications for winners
            // Reconcile auction current prices, leading agents, and bid counts with actual bid logs
            if (reconcileAuctionSummaries(data)) {
                updated = true;
            }

            if (autoCloseExpiredAuctions(data)) {
                updated = true;
            }

            // Check and auto-lock agents with overdue/expired won auction payments
            if (checkAndAutoLockExpiredWonAuctions(data)) {
                updated = true;
            }

            if (!raw || updated) {
                try {
                    const savedStr = JSON.stringify(data);
                    localStorage.setItem(STORAGE_KEY, savedStr);
                    _memoryCacheRaw = savedStr;
                } catch (e) { }
                if (updated && !isSyncing) {
                    saveData(data, true);
                }
            } else {
                _memoryCacheRaw = raw;
            }
            _memoryCacheData = data;
            return data;
        } catch (e) {
            console.error('Error loading CargoStore data', e);
            return defaultData;
        }
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

    let lastServerVersion = Number(typeof localStorage !== 'undefined' ? localStorage.getItem('CARGO_BIDDING_SERVER_VERSION') : 0) || 0;
    let isSyncing = false;
    let saveServerTimeout = null;
    let lastLocalSaveTimestamp = 0;

    // ---- Data epoch: khi DB máy chủ bị dọn sạch/đổi thế hệ, dữ liệu cũ trong localStorage phải bị xóa
    // (nếu không, client sẽ đẩy ngược phiên/đại lý/nhật ký cũ lên DB).
    const EPOCH_KEY = 'CARGO_BIDDING_DATA_EPOCH';
    let epochWiping = false;

    function getLocalEpoch() {
        try { return localStorage.getItem(EPOCH_KEY) || ''; } catch (e) { return ''; }
    }

    // Trả về true nếu được phép tiếp tục; false nếu đang dọn dữ liệu và tải lại trang.
    function applyServerEpoch(serverEpoch) {
        if (!serverEpoch || getLocalEpoch() === serverEpoch) return true;
        let hadData = false;
        try {
            hadData = !!localStorage.getItem(STORAGE_KEY);
            if (hadData) epochWiping = true;
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem('CARGO_BIDDING_SERVER_VERSION');
            localStorage.setItem(EPOCH_KEY, serverEpoch);
        } catch (e) { }
        lastServerVersion = 0;
        if (hadData && typeof location !== 'undefined') {
            location.reload();
            return false;
        }
        return true;
    }

    const _currPath = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname.toLowerCase() : '';
    const _isPublic = _currPath === '' || _currPath === '/' || _currPath === '/home' || _currPath.endsWith('00-home.html') ||
                      _currPath === '/login' || _currPath.endsWith('01-login.html') ||
                      _currPath === '/admin/login' || _currPath.endsWith('01-adminlogin.html') ||
                      _currPath === '/terms' || _currPath.endsWith('10-terms.html') ||
                      _currPath === '/register' || _currPath.endsWith('01-register.html');

    const epochReady = (typeof window !== 'undefined' && typeof fetch !== 'undefined' && !_isPublic)
        ? fetch('/api/epoch', { cache: 'no-store' }).then(r => r.json()).then(j => applyServerEpoch(j && j.dataEpoch)).catch(() => true)
        : Promise.resolve(true);

    function updateHeaderNotifBadges(data) {
        if (!data || typeof document === 'undefined') return;
        try {
            const user = data.currentUser;
            const myCode = user ? (user.agentCode || user.code || '').trim().toUpperCase() : null;
            const notifs = (data.notifications || []);
            const unreadCount = myCode
                ? notifs.filter(n => {
                    if (n.targetRole === 'ADMIN' || n.targetRole === 'admin') return false;
                    if (n.targetAgentCode) return n.targetAgentCode.trim().toUpperCase() === myCode && !n.read;
                    return (n.type === 'SYSTEM' || n.type === 'ANNOUNCEMENT' || n.isBroadcast === true) && !n.read;
                }).length
                : 0;
            const dot = document.getElementById('headerNotifDot');
            if (dot) dot.style.display = unreadCount > 0 ? 'block' : 'none';
            // Also update count badge if exists
            const countBadge = document.getElementById('headerNotifCount');
            if (countBadge) {
                countBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
                countBadge.style.display = unreadCount > 0 ? 'flex' : 'none';
            }
        } catch (e) { }
    }

    async function pushToServerImmediate(data) {
        if (typeof window === 'undefined') return;
        if (saveServerTimeout) {
            clearTimeout(saveServerTimeout);
            saveServerTimeout = null;
        }
        if (_isPublic) return;
        if (!(await epochReady) || epochWiping) return;
        lastLocalSaveTimestamp = Date.now();
        const apiUrl = '/api/data';
        try {
            let currentEpoch = getLocalEpoch();
            if (!currentEpoch) {
                try {
                    const epRes = await fetch('/api/epoch', { cache: 'no-store' });
                    if (epRes.ok) {
                        const epJson = await epRes.json();
                        if (epJson && epJson.dataEpoch) {
                            currentEpoch = epJson.dataEpoch;
                            try { localStorage.setItem(EPOCH_KEY, currentEpoch); } catch (e) { }
                        }
                    }
                } catch (e) { }
            }

            const bodyPayload = JSON.stringify({
                dataEpoch: currentEpoch,
                auctions: data.auctions,
                bids: data.bids,
                wonAuctions: data.wonAuctions,
                notifications: data.notifications,
                deletedNotificationIds: data.deletedNotificationIds || [],
                readNotificationIds: data.readNotificationIds || [],
                registrations: data.registrations,
                agentsList: data.agentsList,
                adminsList: data.adminsList,
                rolesList: data.rolesList,
                settings: data.settings,
                bankConfig: data.bankConfig,
                routeSubscriptions: data.routeSubscriptions,
                activityLogs: data.activityLogs,
                chats: data.chats || []
            });

            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: bodyPayload,
                keepalive: true
            });
            if (res.ok) {
                const resJson = await res.json();
                if (resJson && resJson.stale) {
                    applyServerEpoch(resJson.dataEpoch);
                    return resJson;
                }
                if (resJson && resJson.dataEpoch && !currentEpoch) {
                    try { localStorage.setItem(EPOCH_KEY, resJson.dataEpoch); } catch (e) { }
                }
                if (resJson && resJson.version) {
                    lastServerVersion = resJson.version;
                    try { localStorage.setItem('CARGO_BIDDING_SERVER_VERSION', String(resJson.version)); } catch (e) { }
                }
                if (_syncChannel) {
                    try {
                        _syncChannel.postMessage({ type: 'DATA_SAVED', version: lastServerVersion, timestamp: Date.now() });
                    } catch (e) { }
                }
                return resJson;
            }
        } catch (err) {
            // Offline fallback
        }
    }

    function saveData(data, skipServerSync = false, immediate = false) {
        if (epochWiping) return;
        _memoryCacheData = data;
        let serialized = null;
        try {
            serialized = JSON.stringify(data);
            _memoryCacheRaw = serialized;
            localStorage.setItem(STORAGE_KEY, serialized);
        } catch (e) {
            console.error('Error saving CargoStore data', e);
        }

        // Broadcast to listeners in this browser window
        try {
            window.dispatchEvent(new CustomEvent('cargostore_updated', { detail: data }));
        } catch (e) { }

        // Auto-update notification badge dots on all pages
        updateHeaderNotifBadges(data);

        // Immediate push to server
        if (immediate && !skipServerSync && typeof window !== 'undefined') {
            return pushToServerImmediate(data);
        }

        // Debounced push to server if running over HTTP/HTTPS or local dev server
        if (!skipServerSync && typeof window !== 'undefined') {
            lastLocalSaveTimestamp = Date.now();
            if (saveServerTimeout) clearTimeout(saveServerTimeout);

            saveServerTimeout = setTimeout(async () => {
                await pushToServerImmediate(data);
            }, 300);
        }
    }

    let lastServerSyncTimestamp = 0;
    async function syncWithServer(force = false) {
        if (isSyncing || typeof window === 'undefined') return;

        const pathname = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname.toLowerCase() : '';
        const isPublicPage = pathname === '' || pathname === '/' || pathname === '/home' || pathname.endsWith('00-home.html') ||
                             pathname === '/login' || pathname.endsWith('01-login.html') ||
                             pathname === '/admin/login' || pathname.endsWith('01-adminlogin.html') ||
                             pathname === '/terms' || pathname.endsWith('10-terms.html') ||
                             pathname === '/register' || pathname.endsWith('01-register.html');

        // NGUYÊN TẮC: Trang chủ & các trang công khai tuyệt đối KHÔNG tự ý gọi API đồng bộ ngầm
        if (isPublicPage && !force) return;

        // Guard: Do not sync more than once every 30 seconds
        if (Date.now() - lastServerSyncTimestamp < 30000) return;
        if (!force && typeof document !== 'undefined' && document.hidden) return; // Save CPU when tab is in background
        if (!force && Date.now() - lastLocalSaveTimestamp < 800) return;
        lastServerSyncTimestamp = Date.now();

        try {
            isSyncing = true;
            const local = loadData();
            const isAdminPage = pathname.includes('/admin/');
            const currentAgentCode = (local.currentUser && (local.currentUser.agentCode || local.currentUser.code)) ? String(local.currentUser.agentCode || local.currentUser.code).trim() : null;

            // BẢO MẬT: Chỉ gửi role=admin khi đang ở trang admin VÀ có admin đăng nhập
            let queryParams = [];
            if (isAdminPage && local.currentAdmin) {
                const isStaffSession = !!(String(local.currentAdmin.role).toUpperCase() === 'STAFF');
                queryParams.push(isStaffSession ? 'role=staff' : 'role=admin');
            } else if (currentAgentCode) {
                queryParams.push(`agentCode=${encodeURIComponent(currentAgentCode)}`);
            } else if (!force) {
                // Người dùng chưa đăng nhập -> không gọi API ngầm
                return;
            }

            const baseUrl = '/api/data';
            const apiUrl = queryParams.length > 0 ? `${baseUrl}?${queryParams.join('&')}` : baseUrl;

            const res = await fetch(apiUrl);
            if (!res.ok) return;
            const serverData = await res.json();
            if (serverData && serverData.dataEpoch && !applyServerEpoch(serverData.dataEpoch)) return;
            const localAuctions = local.auctions || [];
            const serverAuctions = serverData.auctions || [];
            const localNotifs = local.notifications || [];
            const serverNotifs = serverData.notifications || [];
            const localWons = local.wonAuctions || [];
            const serverWons = serverData.wonAuctions || [];
            const localBids = local.bids || [];
            const serverBids = serverData.bids || [];
            const localRegs = local.registrations || [];
            const serverRegs = serverData.registrations || [];
            const localAgents = local.agentsList || [];
            const serverAgents = serverData.agentsList || [];

            const localAuctionIds = new Set(localAuctions.map(a => String(a.id)));
            const hasNewAuctionOnServer = serverAuctions.some(a => a && a.id && !localAuctionIds.has(String(a.id)));
            const hasStatusMismatch = serverAuctions.some(sa => {
                if (!sa || !sa.id) return false;
                const la = localAuctions.find(x => String(x.id) === String(sa.id));
                return la && la.status !== sa.status;
            });

            const shouldSync = force || !lastServerVersion ||
                (serverData && serverData.version && serverData.version !== lastServerVersion) ||
                hasNewAuctionOnServer ||
                hasStatusMismatch ||
                serverNotifs.length !== localNotifs.length ||
                serverAuctions.length !== localAuctions.length ||
                serverWons.length !== localWons.length ||
                serverBids.length !== localBids.length ||
                serverRegs.length !== localRegs.length ||
                serverAgents.length !== localAgents.length;
            if (serverData && shouldSync) {
                lastServerVersion = serverData.version || Date.now();
                try { localStorage.setItem('CARGO_BIDDING_SERVER_VERSION', String(lastServerVersion)); } catch (e) { }
                const oldStr = JSON.stringify(local);

                // Merge shared collections from server by ID to preserve local created/updated items
                if (serverData.auctions && Array.isArray(serverData.auctions)) {
                    const validServerAuctions = serverData.auctions.filter(a => a && a.origin && a.destination && a.flightNumber && a.flightNumber !== 'VU-HIST' && (a.capacityKg || 0) > 0);
                    const auctionMap = new Map();
                    validServerAuctions.forEach(a => auctionMap.set(String(a.id), a));
                    (local.auctions || []).forEach(a => {
                        if (!a || !a.origin || !a.destination || !a.flightNumber || a.flightNumber === 'VU-HIST' || !a.originName || !a.destName || (a.capacityKg || 0) <= 0) return;
                        const aKey = String(a.id);
                        const serverItem = auctionMap.get(aKey);
                        if (!serverItem) {
                            auctionMap.set(aKey, a);
                        } else {
                            // Final states (CANCELLED, DELETED) must NEVER be overwritten by server's older status
                            const FINAL_STATES = ['CANCELLED', 'DELETED'];
                            if (FINAL_STATES.includes(a.status)) {
                                auctionMap.set(aKey, {
                                    ...serverItem,
                                    ...a,
                                    status: a.status,
                                    cancelledAt: a.cancelledAt,
                                    cancellationReason: a.cancellationReason,
                                    refundNote: a.refundNote,
                                    refundAmount: a.refundAmount,
                                    deletedAt: a.deletedAt
                                });
                            } else if (a.status === 'CLOSED' || serverItem.status === 'CLOSED') {
                                // If either server or local is CLOSED, stay CLOSED! Never revert to OPEN or UPCOMING
                                auctionMap.set(aKey, {
                                    ...serverItem,
                                    ...a,
                                    status: 'CLOSED',
                                    isFinalLocked: a.isFinalLocked || serverItem.isFinalLocked || false,
                                    closedAt: a.closedAt || serverItem.closedAt,
                                    winnerAgentCode: a.winnerAgentCode || serverItem.winnerAgentCode,
                                    winnerAgentName: a.winnerAgentName || serverItem.winnerAgentName,
                                    winningPriceKg: a.winningPriceKg || serverItem.winningPriceKg
                                });
                            } else {
                                auctionMap.set(aKey, {
                                    ...a,
                                    ...serverItem,
                                    isFinalLocked: a.isFinalLocked || serverItem.isFinalLocked || false
                                });
                            }
                        }
                    });
                    local.auctions = Array.from(auctionMap.values()).sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
                }

                if (serverData.wonAuctions && Array.isArray(serverData.wonAuctions)) {
                    const validServerWons = serverData.wonAuctions.filter(w => w && w.wonId && !String(w.wonId).startsWith('TEST_') && !String(w.wonId).startsWith('WON_PAID_TEST_'));
                    const wonMap = new Map();
                    validServerWons.forEach(w => wonMap.set(String(w.wonId), w));
                    (local.wonAuctions || []).forEach(w => {
                        if (!w || !w.wonId || String(w.wonId).startsWith('TEST_') || String(w.wonId).startsWith('WON_PAID_TEST_')) return;
                        const wKey = String(w.wonId);
                        const serverItem = wonMap.get(wKey);
                        if (!serverItem) {
                            wonMap.set(wKey, w);
                        } else {
                            // Merge: preserve local updates if server has default UNPAID or lacks fields
                            wonMap.set(wKey, {
                                ...w,
                                ...serverItem,
                                paymentStatus: (serverItem.paymentStatus && serverItem.paymentStatus !== 'UNPAID') ? serverItem.paymentStatus : (w.paymentStatus || serverItem.paymentStatus),
                                paymentProof: serverItem.paymentProof || w.paymentProof,
                                cargoDeclaration: serverItem.cargoDeclaration || w.cargoDeclaration
                            });
                        }
                    });
                    local.wonAuctions = Array.from(wonMap.values());
                }

                if (serverData.bids && Array.isArray(serverData.bids)) {
                    const myCode = currentAgentCode ? currentAgentCode.toUpperCase() : null;
                    const localBidMap = new Map();
                    (local.bids || []).forEach(b => {
                        if (b && b.id) localBidMap.set(String(b.id), b);
                    });

                    // Reconcile server bids: never allow masked 'AG-***' to overwrite this agent's own placed bids
                    const reconciledServerBids = serverData.bids.map(sb => {
                        if (!sb || !sb.id) return sb;
                        const lb = localBidMap.get(String(sb.id));
                        if (lb && lb.agentCode && lb.agentCode !== 'AG-***') {
                            const lbCode = String(lb.agentCode).trim().toUpperCase();
                            if (myCode && (lbCode === myCode || sb.agentCode === 'AG-***')) {
                                return {
                                    ...sb,
                                    agentCode: lb.agentCode,
                                    agentName: lb.agentName || sb.agentName,
                                    isAnonymous: (sb.isAnonymous !== undefined) ? sb.isAnonymous : lb.isAnonymous
                                };
                            }
                        }
                        return sb;
                    });

                    const serverBidIds = new Set(reconciledServerBids.map(b => String(b.id)));
                    const pendingLocalBids = (local.bids || []).filter(b => {
                        if (!b || !b.id) return false;
                        if (serverBidIds.has(String(b.id))) return false;
                        return true;
                    });
                    local.bids = deduplicateBids([...reconciledServerBids, ...pendingLocalBids]);
                }

                if (serverData.notifications && Array.isArray(serverData.notifications)) {
                    const notifMap = new Map();
                    serverData.notifications.forEach(n => {
                        if (n && n.id) notifMap.set(String(n.id), n);
                    });
                    // Preserve local notifications not yet in serverData
                    (local.notifications || []).forEach(n => {
                        if (!n || !n.id) return;
                        const nKey = String(n.id);
                        const sItem = notifMap.get(nKey);
                        if (!sItem) {
                            notifMap.set(nKey, n);
                        } else {
                            // Merge: if either marked read, keep read
                            notifMap.set(nKey, {
                                ...sItem,
                                ...n,
                                read: sItem.read || n.read,
                                unread: !sItem.read && !n.read
                            });
                        }
                    });
                    local.notifications = deduplicateNotifications(Array.from(notifMap.values()));
                }

                if (serverData.deletedNotificationIds && Array.isArray(serverData.deletedNotificationIds)) {
                    if (!Array.isArray(local.deletedNotificationIds)) local.deletedNotificationIds = [];
                    const delSet = new Set(local.deletedNotificationIds.map(String));
                    serverData.deletedNotificationIds.forEach(id => delSet.add(String(id)));
                    local.deletedNotificationIds = Array.from(delSet);
                    // Filter deleted notifications from local.notifications immediately
                    local.notifications = (local.notifications || []).filter(n => n && !delSet.has(String(n.id)));
                }

                if (serverData.readNotificationIds && Array.isArray(serverData.readNotificationIds)) {
                    if (!Array.isArray(local.readNotificationIds)) local.readNotificationIds = [];
                    const readSet = new Set(local.readNotificationIds.map(String));
                    serverData.readNotificationIds.forEach(id => readSet.add(String(id)));
                    local.readNotificationIds = Array.from(readSet);
                }

                if (serverData.registrations && Array.isArray(serverData.registrations)) {
                    const regMap = new Map();
                    // Server is authoritative source of truth for registrations
                    serverData.registrations.forEach(r => {
                        if (!r) return;
                        const key = r.regId ? String(r.regId) : String(r.id || r.taxCode || r.email);
                        regMap.set(key, r);
                    });
                    (local.registrations || []).forEach(r => {
                        if (!r) return;
                        const key = r.regId ? String(r.regId) : String(r.id || r.taxCode || r.email);
                        const serverItem = regMap.get(key);
                        if (!serverItem) {
                            regMap.set(key, r);
                        } else {
                            // Merge: serverItem overrides local, but keep local documents dataUrl if server only stored filenames
                            const merged = { ...r, ...serverItem };
                            if (Array.isArray(r.documents) && (!serverItem.documents || serverItem.documents.length === 0)) {
                                merged.documents = r.documents;
                            }
                            regMap.set(key, merged);
                        }
                    });
                    local.registrations = Array.from(regMap.values());
                }

                if (serverData.agentsList && Array.isArray(serverData.agentsList)) {
                    const agentMap = new Map();
                    serverData.agentsList.forEach(ag => {
                        if (!ag || !ag.code) return;
                        agentMap.set(String(ag.code).trim().toUpperCase(), ag);
                    });
                    (local.agentsList || []).forEach(ag => {
                        if (!ag || !ag.code) return;
                        const aKey = String(ag.code).trim().toUpperCase();
                        if (!agentMap.has(aKey)) {
                            agentMap.set(aKey, ag);
                        } else {
                            const sItem = agentMap.get(aKey);
                            const finalPwd = (sItem.password && sItem.password !== '12345678') ? sItem.password : (ag.password || sItem.password || '12345678');
                            const finalPin = (sItem.pin && sItem.pin !== '1234') ? sItem.pin : (ag.pin || sItem.pin || '1234');
                            agentMap.set(aKey, { ...ag, ...sItem, pin: finalPin, password: finalPwd });
                        }
                    });
                    // Self-heal: if any agent still has default '12345678' password, check if registration record has their custom registered password
                    agentMap.forEach((ag, aKey) => {
                        if (!ag.password || ag.password === '12345678') {
                            const matchedReg = (local.registrations || []).find(r =>
                                (r.agentCode && String(r.agentCode).toUpperCase() === aKey) ||
                                (r.taxCode && ag.taxCode && String(r.taxCode).trim() === String(ag.taxCode).trim()) ||
                                (r.email && ag.email && String(r.email).trim().toLowerCase() === String(ag.email).trim().toLowerCase())
                            );
                            if (matchedReg && matchedReg.password) {
                                ag.password = matchedReg.password;
                            }
                        }
                    });
                    local.agentsList = Array.from(agentMap.values()).filter(ag => {
                        const code = String(ag.code || '').trim();
                        if (!code || code === 'undefined' || code === 'null') return false;
                        const codeUpper = code.toUpperCase();
                        if (['ALL', 'STAFF', 'SYSTEM', 'ADMIN', 'VU-ADMIN-01', 'VU-OPS-88'].includes(codeUpper)) return false;
                        const name = String(ag.companyName || ag.name || '').trim();
                        if (!ag.repName && !ag.email && !ag.taxCode && !ag.phone && !name) return false;
                        return true;
                    });
                    if (local.currentUser) {
                        const myCode = String(local.currentUser.agentCode || local.currentUser.code || '').trim().toUpperCase();
                        const serverAg = local.agentsList.find(a => String(a.code || '').trim().toUpperCase() === myCode);
                        if (serverAg) {
                            if (serverAg.pin) local.currentUser.pin = serverAg.pin;
                            if (serverAg.fullName) local.currentUser.fullName = serverAg.fullName;
                            if (serverAg.repName) local.currentUser.repName = serverAg.repName;
                            if (!local.currentUser.fullName && local.currentUser.repName) local.currentUser.fullName = local.currentUser.repName;
                            if (!local.currentUser.repName && local.currentUser.fullName) local.currentUser.repName = local.currentUser.fullName;
                            if (serverAg.position && (!local.currentUser.position || local.currentUser.position === 'Đại diện ủy quyền')) local.currentUser.position = serverAg.position;
                            if (serverAg.address && (!local.currentUser.address || local.currentUser.address === '—')) local.currentUser.address = serverAg.address;
                            if (serverAg.province) local.currentUser.province = serverAg.province;
                            if (serverAg.joinedDate) local.currentUser.joinedDate = serverAg.joinedDate;
                            if (Array.isArray(serverAg.documents) && serverAg.documents.length > 0 && (!Array.isArray(local.currentUser.documents) || local.currentUser.documents.length === 0)) {
                                local.currentUser.documents = serverAg.documents;
                            }
                        }
                    }
                }

                if (serverData.activityLogs && Array.isArray(serverData.activityLogs)) {
                    const logMap = new Map();
                    serverData.activityLogs.forEach(l => {
                        if (!l) return;
                        const k = l.id ? String(l.id) : `${l.username || l.actor}_${l.actionTitle}_${Math.floor((Number(l.rawTime) || 0) / 5000)}`;
                        logMap.set(k, l);
                    });
                    (local.activityLogs || []).forEach(l => {
                        if (!l) return;
                        const k = l.id ? String(l.id) : `${l.username || l.actor}_${l.actionTitle}_${Math.floor((Number(l.rawTime) || 0) / 5000)}`;
                        if (!logMap.has(k)) logMap.set(k, l);
                    });
                    local.activityLogs = deduplicateActivityLogs(Array.from(logMap.values()))
                        .sort((a, b) => getEffectiveLogTime(b) - getEffectiveLogTime(a))
                        .slice(0, 1000);
                }

                if (serverData.chats && Array.isArray(serverData.chats)) {
                    const chatMap = new Map();
                    serverData.chats.forEach(c => { if (c && c.id) chatMap.set(String(c.id), c); });
                    (local.chats || []).forEach(c => {
                        if (!c || !c.id) return;
                        const cKey = String(c.id);
                        const sChat = chatMap.get(cKey);
                        if (!sChat) {
                            chatMap.set(cKey, c);
                        } else {
                            const msgMap = new Map();
                            (sChat.messages || []).forEach(m => { if (m && m.id) msgMap.set(String(m.id), m); });
                            (c.messages || []).forEach(m => { if (m && m.id && !msgMap.has(String(m.id))) msgMap.set(String(m.id), m); });
                            chatMap.set(cKey, {
                                ...c,
                                ...sChat,
                                messages: Array.from(msgMap.values()).sort((x, y) => (Number(x.timestamp) || 0) - (Number(y.timestamp) || 0))
                            });
                        }
                    });
                    local.chats = Array.from(chatMap.values());
                }

                if (serverData.adminsList && Array.isArray(serverData.adminsList) && serverData.adminsList.length > 0) {
                    let list = [...serverData.adminsList];
                    if (!list.some(a => (a.username || '').toLowerCase() === 'admin')) {
                        list.unshift(JSON.parse(JSON.stringify(seedAdmins[0])));
                    }
                    local.adminsList = list;
                } else if (!local.adminsList || !Array.isArray(local.adminsList) || local.adminsList.length === 0) {
                    local.adminsList = JSON.parse(JSON.stringify(seedAdmins));
                }
                if (serverData.rolesList && Array.isArray(serverData.rolesList) && serverData.rolesList.length > 0) {
                    local.rolesList = serverData.rolesList;
                }
                if (serverData.settings) local.settings = serverData.settings;
                if (serverData.bankConfig) local.bankConfig = serverData.bankConfig;
                if (serverData.routeSubscriptions) local.routeSubscriptions = serverData.routeSubscriptions;

                // Reconcile bids and enforce locks
                reconcileAuctionSummaries(local);
                checkAndAutoLockExpiredWonAuctions(local);

                const newStr = JSON.stringify(local);
                if (oldStr !== newStr) {
                    saveData(local, true);
                    try {
                        window.dispatchEvent(new CustomEvent('cargostore_updated', { detail: local }));
                    } catch (e) { }
                    updateHeaderNotifBadges(local);
                }
            }
        } catch (e) {
        } finally {
            isSyncing = false;
        }
    }

    // Inter-tab sync channel via BroadcastChannel
    let _syncChannel = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        try {
            _syncChannel = new BroadcastChannel('cargo_bidding_sync_channel');
            _syncChannel.onmessage = function (e) {
                if (e.data && (e.data.type === 'DATA_SAVED' || e.data.type === 'SYNC_NOW')) {
                    _memoryCacheData = null;
                    _memoryCacheRaw = null;
                    const fresh = loadData();
                    try {
                        window.dispatchEvent(new CustomEvent('cargostore_updated', { detail: fresh }));
                    } catch (err) { }
                    updateHeaderNotifBadges(fresh);
                }
            };
        } catch (e) { }
    }

    // Auto-poll intervals removed per requirement - no repetitive background polling loops
    if (typeof window !== 'undefined') {
        window.addEventListener('storage', function (e) {
            if (!e.key || e.key === STORAGE_KEY) {
                _memoryCacheData = null;
                _memoryCacheRaw = null;
                const fresh = loadData();
                try {
                    window.dispatchEvent(new CustomEvent('cargostore_updated', { detail: fresh }));
                } catch (err) { }
                updateHeaderNotifBadges(fresh);
            }
        });
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
        const allAuctions = (passedData && passedData.auctions) ? passedData.auctions : ((typeof loadData === 'function') ? (loadData().auctions || []) : []);

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
        const data = passedData || loadData();
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

    return {
        getData: loadData,
        saveData: saveData,
        saveDataImmediate: function (data) {
            return pushToServerImmediate(data || loadData());
        },
        syncWithServer: syncWithServer,
        formatCurrency: formatCurrency,
        formatNumber: formatNumber,
        getTimeRemaining: getTimeRemaining,
        formatTimeAgo: formatTimeAgo,
        calculateCutOffTime: calculateCutOffTime,
        calculatePaymentDeadline: calculatePaymentDeadline,
        formatPaymentDeadlineText: formatPaymentDeadlineText,
        parseFlightDate: parseFlightDate,
        parseTimestamp: parseTimestamp,
        isWonAuctionExpired: isWonAuctionExpired,
        checkAndAutoLockExpiredWonAuctions: checkAndAutoLockExpiredWonAuctions,
        getFlightDurationMinutes: getFlightDurationMinutes,
        calculateETA: calculateETA,
        generateNextFlightNumber: generateNextFlightNumber,
        checkDuplicateFlightNumber: function (flightNumber, excludeAuctionId = null) {
            const data = loadData();
            const fn = (flightNumber || '').trim().toUpperCase();
            if (!fn) return { isDuplicate: false };

            const activeAuction = (data.auctions || []).find(a =>
                (a.flightNumber || '').trim().toUpperCase() === fn &&
                (a.status === 'OPEN' || a.status === 'UPCOMING') &&
                (excludeAuctionId === null || a.id != excludeAuctionId)
            );

            if (activeAuction) {
                return {
                    isDuplicate: true,
                    reason: 'ACTIVE_OPEN',
                    message: `Chuyến bay ${fn} hiện đang có một phiên đấu giá ĐANG MỞ (${activeAuction.flightCode}, tuyến ${activeAuction.route}).`
                };
            }

            return { isDuplicate: false };
        },

        /**
         * Server-side Agent Login with offline fallback
         */
        loginAgent: async function (agentCodeOrEmail, password, loginMode = 'password') {
            const isHttp = typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol.startsWith('http');
            if (isHttp) {
                try {
                    const res = await fetch('/api/auth/agent-login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            identifier: agentCodeOrEmail,
                            password: password,
                            loginMode: loginMode
                        })
                    });
                    const resJson = await res.json();
                    if (resJson && resJson.success && resJson.agent) {
                        const local = loadData();
                        local.currentUser = {
                            agentCode: resJson.agent.code,
                            code: resJson.agent.code,
                            name: resJson.agent.name || resJson.agent.companyName,
                            companyName: resJson.agent.companyName || resJson.agent.name,
                            fullName: resJson.agent.fullName || resJson.agent.repName || resJson.agent.name || '',
                            repName: resJson.agent.repName || resJson.agent.fullName || resJson.agent.name || '',
                            position: resJson.agent.position || 'Đại diện ủy quyền',
                            email: resJson.agent.email,
                            phone: resJson.agent.phone,
                            taxCode: resJson.agent.taxCode,
                            address: resJson.agent.address || '',
                            province: resJson.agent.province || 'TP. Hồ Chí Minh',
                            joinedDate: resJson.agent.joinedDate || '15/03/2024',
                            documents: resJson.agent.documents || [],
                            role: 'agent',
                            status: resJson.agent.status || 'Hoạt động'
                        };
                        if (!Array.isArray(local.agentsList)) local.agentsList = [];
                        const exIdx = local.agentsList.findIndex(a => (a.code || '').toUpperCase() === resJson.agent.code.toUpperCase());
                        if (exIdx >= 0) local.agentsList[exIdx] = { ...local.agentsList[exIdx], ...local.currentUser };
                        else local.agentsList.push({ ...local.currentUser });
                        saveData(local, true);
                        document.cookie = "cargo_agent_code=" + encodeURIComponent(resJson.agent.code) + "; path=/; max-age=2592000; SameSite=Lax";
                        return { success: true, user: local.currentUser };
                    }
                    return resJson || { success: false, message: 'Đăng nhập không thành công.' };
                } catch (err) {
                    console.error('Server auth error:', err);
                }
            }
            return this.loginAgentFallback(agentCodeOrEmail, password);
        },

        loginAgentFallback: function (agentCodeOrEmail, password) {
            const data = loadData();
            if (checkAndAutoLockExpiredWonAuctions(data)) {
                saveData(data, true);
            }
            const identifier = (agentCodeOrEmail || '').trim().toLowerCase();

            if (!data.agentsList) {
                data.agentsList = JSON.parse(JSON.stringify(seedAgents));
            }

            // Search agent in list by Agent Code, Tax Code, or Email
            let agent = data.agentsList.find(a =>
                (a.code || '').toLowerCase() === identifier ||
                (a.taxCode || '').toLowerCase() === identifier ||
                (a.email || '').toLowerCase() === identifier
            );

            if (!agent) {
                // Check if user has a pending or rejected registration
                const reg = (data.registrations || []).find(r =>
                    (r.regId || '').toLowerCase() === identifier ||
                    (r.taxCode || '').toLowerCase() === identifier ||
                    (r.email || '').toLowerCase() === identifier
                );

                if (reg) {
                    if (reg.status === 'REJECTED') {
                        return {
                            success: false,
                            isRejected: true,
                            regId: reg.regId,
                            rejectionReason: reg.rejectionReason || reg.rejectReason || 'Hồ sơ chưa đạt tiêu chuẩn theo quy chế xét duyệt đại lý',
                            message: `Hồ sơ đăng ký (${reg.regId}) của Quý công ty đã bị TỪ CHỐI / CẦN BỔ SUNG.\n\nLý do từ chối: "${reg.rejectionReason || reg.rejectReason || 'Hồ sơ chưa đạt tiêu chuẩn'}"\n\nVui lòng bấm "Bổ sung hồ sơ" để chỉnh sửa và nộp lại.`
                        };
                    } else if (reg.status === 'PENDING') {
                        return {
                            success: false,
                            isPending: true,
                            regId: reg.regId,
                            message: `Hồ sơ đăng ký (${reg.regId}) của Quý công ty đang được Ban Điều hành xét duyệt (trong vòng 24h làm việc). Khi được phê duyệt, hệ thống sẽ gửi Mã Đại lý qua email (${reg.email}).`
                        };
                    }
                }

                // Dữ liệu cục bộ có thể chưa kịp đồng bộ (vd: vừa được duyệt) -> kéo dữ liệu mới nhất để lần thử sau thành công
                try { lastLocalSaveTimestamp = 0; syncWithServer(true); } catch (e) { }
                return { success: false, message: `Mã đại lý hoặc Email "${agentCodeOrEmail}" không tồn tại trong CSDL. Nếu hồ sơ vừa được duyệt, vui lòng đợi vài giây rồi đăng nhập lại.` };
            }

            // Check if agent is currently locked due to failed login attempts
            if (agent.status === 'Đã khóa' || agent.status === 'LOCKED' || agent.isLocked) {
                if (agent.lockedReason === 'FAILED_LOGIN_ATTEMPTS' || (agent.failedLoginAttempts || 0) >= 5) {
                    const masked = this.maskEmail ? this.maskEmail(agent.email) : agent.email;
                    return {
                        success: false,
                        isLocked: true,
                        lockReason: 'FAILED_LOGIN_ATTEMPTS',
                        agentCode: agent.code,
                        email: agent.email,
                        maskedEmail: masked,
                        failedAttempts: agent.failedLoginAttempts || 5,
                        unlockOtp: agent.unlockOtp || '',
                        unlockToken: agent.unlockToken || '',
                        message: `Tài khoản ${agent.code} đang bị TẠM KHÓA do nhập sai mật khẩu quá 5 lần liên tiếp.\n\nVui lòng kiểm tra email (${masked}) để mở khóa tài khoản, hoặc bấm nút "Mở khóa tài khoản qua Email" bên dưới.`
                    };
                }
                // Khóa chủ động bởi Admin (hoặc lý do khác): chặn đăng nhập
                return {
                    success: false,
                    isLocked: true,
                    lockReason: 'ADMIN_LOCKED',
                    agentCode: agent.code,
                    message: `Tài khoản ${agent.code} đã bị KHÓA bởi Ban Điều hành${agent.lockedReason ? ` (Lý do: ${agent.lockedReason})` : ''}.\n\nVui lòng liên hệ Tổng đài 1900.6686 hoặc email cargo@vietravelairlines.vn để được hỗ trợ.`
                };
            }

            // Verify against THAT SPECIFIC AGENT'S PASSWORD OR PIN!
            const inputVal = String(password || '').trim();
            let expectedPassword = String(agent.password || '').trim();
            const expectedPin = agent.pin ? String(agent.pin).trim() : '1234';

            // Self-heal from registration record if agent has default password or missing
            if ((!expectedPassword || expectedPassword === '12345678') && Array.isArray(data.registrations)) {
                const reg = data.registrations.find(r =>
                    (r.agentCode && String(r.agentCode).toUpperCase() === String(agent.code).toUpperCase()) ||
                    (r.taxCode && agent.taxCode && String(r.taxCode).trim() === String(agent.taxCode).trim()) ||
                    (r.email && agent.email && String(r.email).trim().toLowerCase() === String(agent.email).trim().toLowerCase())
                );
                if (reg && reg.password) {
                    expectedPassword = String(reg.password).trim();
                    agent.password = expectedPassword;
                }
            }
            if (!expectedPassword) expectedPassword = '12345678';

            const isPasswordMatch = inputVal === expectedPassword || (agent.password && inputVal === String(agent.password).trim());
            const isPinMatch = inputVal === expectedPin;

            if (!isPasswordMatch && !isPinMatch) {
                agent.failedLoginAttempts = (agent.failedLoginAttempts || 0) + 1;

                if (agent.failedLoginAttempts >= 5) {
                    // Lock account and generate unlock token & OTP
                    agent.isLocked = true;
                    agent.status = 'Đã khóa';
                    agent.lockedReason = 'FAILED_LOGIN_ATTEMPTS';
                    agent.lockedAt = new Date().toISOString();
                    const unlockToken = 'ULK-' + Math.random().toString(36).substring(2, 10).toUpperCase();
                    const unlockOtp = String(Math.floor(100000 + Math.random() * 900000));
                    agent.unlockToken = unlockToken;
                    agent.unlockOtp = unlockOtp;
                    agent.unlockExpiresAt = Date.now() + 24 * 3600 * 1000;
                    saveData(data);

                    // Log activity
                    this.logActivity({
                        actor: agent.companyName || agent.code,
                        username: agent.code,
                        role: 'AGENT',
                        actionCategory: 'Bảo mật',
                        actionTitle: 'Tài khoản bị khóa do sai mật khẩu 5 lần',
                        target: 'Tài khoản Agent',
                        details: `Đại lý ${agent.code} (${agent.companyName}) đã bị tạm khóa do nhập sai mật khẩu/mã PIN 5 lần liên tiếp. Hệ thống đã tự động gửi email hướng dẫn mở khóa.`
                    });

                    // Add Notification
                    if (!data.notifications) data.notifications = [];
                    data.notifications.unshift({
                        id: Date.now(),
                        timestamp: Date.now(),
                        targetAgentCode: agent.code,
                        targetEmail: agent.email,
                        title: 'Tài khoản bị tạm khóa do nhập sai mật khẩu 5 lần',
                        message: `Tài khoản ${agent.code} đã bị khóa lúc ${new Date().toLocaleTimeString('vi-VN')}. Vui lòng dùng mã OTP: ${unlockOtp} hoặc bấm link mở khóa trong email để tiếp tục.`,
                        type: 'SECURITY_ALERT',
                        read: false
                    });

                    // Send email notification
                    this.sendEmailNotification({
                        type: 'ACCOUNT_LOCKED_5_FAILS',
                        to: agent.email,
                        agentCode: agent.code,
                        agentName: agent.companyName || agent.repName || agent.code,
                        unlockToken: unlockToken,
                        unlockOtp: unlockOtp,
                        lockedAt: new Date().toLocaleString('vi-VN')
                    });

                    const masked = this.maskEmail ? this.maskEmail(agent.email) : agent.email;
                    return {
                        success: false,
                        isLocked: true,
                        lockReason: 'FAILED_LOGIN_ATTEMPTS',
                        agentCode: agent.code,
                        email: agent.email,
                        maskedEmail: masked,
                        failedAttempts: 5,
                        unlockOtp: unlockOtp,
                        unlockToken: unlockToken,
                        message: `TÀI KHOẢN ĐÃ BỊ TẠM KHÓA do nhập sai mật khẩu quá 5 lần!\n\nHệ thống đã gửi email hướng dẫn mở khóa kèm mã OTP đến địa chỉ ${masked}.`
                    };
                }

                saveData(data);
                const remain = 5 - agent.failedLoginAttempts;
                return {
                    success: false,
                    failedAttempts: agent.failedLoginAttempts,
                    remainingAttempts: remain,
                    agentCode: agent.code,
                    message: `Mật khẩu hoặc Mã PIN không chính xác cho đại lý ${agent.code}!\nQuý khách đã đăng nhập sai ${agent.failedLoginAttempts}/5 lần (còn ${remain} lần thử trước khi tài khoản bị khóa an toàn).`
                };
            }

            // Successful login: reset failed attempts counter & unlock tokens
            agent.failedLoginAttempts = 0;
            delete agent.unlockOtp;
            delete agent.unlockToken;
            delete agent.unlockExpiresAt;

            // Construct specific currentUser object for this agent with PIN intact!
            data.currentUser = {
                id: agent.id,
                role: 'agent',
                code: agent.code,
                agentCode: agent.code,
                password: agent.password,
                pin: agent.pin || '1234',
                pinCreatedAt: agent.pinCreatedAt || null,
                companyName: agent.companyName,
                fullName: agent.repName,
                position: agent.position || 'Đại diện ủy quyền',
                email: agent.email,
                phone: agent.phone,
                taxCode: agent.taxCode,
                address: agent.address,
                province: agent.province || 'TP. Hồ Chí Minh',
                tier: agent.tier || 'TIER1',
                status: agent.status || 'Đang hoạt động',
                joinedDate: agent.joinedDate || '15/03/2024',
                documents: agent.documents || [],
                stats: {
                    totalBids: agent.totalBids || 0,
                    totalWins: agent.totalWins || 0,
                    winRate: agent.winRate || (agent.totalBids ? Math.round(agent.totalWins / agent.totalBids * 100) + '%' : '0%'),
                    totalSpentUSD: agent.totalSpentUSD || '0k',
                    totalSpentVND: agent.totalSpentVND || 0
                }
            };

            // Auto-link documents from registration if not yet on agent record
            if (!data.currentUser.documents || data.currentUser.documents.length === 0) {
                const matchedReg = (data.registrations || []).find(r =>
                    (r.agentCode && r.agentCode.toUpperCase() === agent.code.toUpperCase()) ||
                    (r.taxCode && agent.taxCode && r.taxCode.trim() === agent.taxCode.trim())
                );
                if (matchedReg && matchedReg.documents && matchedReg.documents.length > 0) {
                    data.currentUser.documents = matchedReg.documents;
                    agent.documents = matchedReg.documents;
                }
            }
            if (typeof document !== 'undefined') {
                document.cookie = "cargo_agent_code=" + encodeURIComponent(agent.code) + "; path=/; max-age=2592000; SameSite=Lax";
            }
            saveData(data);
            this.logActivity({
                actor: agent.companyName || agent.repName || agent.code,
                username: agent.code,
                role: 'AGENT',
                actionCategory: 'Đăng nhập',
                actionTitle: 'Đăng nhập hệ thống Agent',
                target: 'Sàn Đấu giá Cargo',
                details: `Đại lý ${agent.companyName || agent.code} (Mã: ${agent.code}) đăng nhập thành công vào hệ thống Sàn Đấu Giá Cargo.`
            });
            return { success: true, user: data.currentUser };
        },

        /**
         * Server-side Admin Login with offline fallback
         */
        loginAdmin: async function (usernameOrEmail, password) {
            const isHttp = typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol.startsWith('http');
            if (isHttp) {
                try {
                    const res = await fetch('/api/auth/admin-login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            username: usernameOrEmail,
                            password: password
                        })
                    });
                    const resJson = await res.json();
                    if (resJson && resJson.success && resJson.admin) {
                        const local = loadData();
                        local.currentAdmin = {
                            id: resJson.admin.id,
                            username: resJson.admin.username,
                            role: resJson.admin.role,
                            roles: Array.isArray(resJson.admin.roles) ? resJson.admin.roles : [resJson.admin.role],
                            fullName: resJson.admin.fullName,
                            email: resJson.admin.email,
                            department: resJson.admin.department || ''
                        };
                        saveData(local, true);
                        document.cookie = "cargo_admin_user=" + encodeURIComponent(resJson.admin.username) + "; path=/; max-age=604800; SameSite=Lax";
                        this.logActivity({
                            actor: local.currentAdmin.fullName || local.currentAdmin.username,
                            username: local.currentAdmin.username,
                            role: local.currentAdmin.role || 'ADMIN',
                            actionCategory: 'Đăng nhập',
                            actionTitle: 'Đăng nhập hệ thống Admin',
                            target: 'Portal Quản trị',
                            details: `Tài khoản ${local.currentAdmin.role || 'ADMIN'} ${local.currentAdmin.fullName} (@${local.currentAdmin.username}) đăng nhập thành công vào Trung tâm Điều hành Cargo.`
                        });
                        return { success: true, admin: local.currentAdmin };
                    }
                    return resJson || { success: false, message: 'Đăng nhập quản trị thất bại.' };
                } catch (err) {
                    console.error('Server admin auth error:', err);
                }
            }
            return this.loginAdminFallback(usernameOrEmail, password);
        },

        loginAdminFallback: function (usernameOrEmail, password) {
            const data = loadData();
            const u = (usernameOrEmail || '').trim().toLowerCase();
            let adminList = (Array.isArray(data.adminsList) && data.adminsList.length > 0) ? data.adminsList : seedAdmins;
            let admin = adminList.find(a =>
                (a.username || '').toLowerCase() === u ||
                (a.email || '').toLowerCase() === u
            );

            // Guaranteed root admin fallback if adminsList was emptied or corrupted
            if (!admin && Array.isArray(seedAdmins)) {
                admin = seedAdmins.find(a =>
                    (a.username || '').toLowerCase() === u ||
                    (a.email || '').toLowerCase() === u
                );
                if (admin) {
                    if (!Array.isArray(data.adminsList)) data.adminsList = [];
                    data.adminsList.unshift(JSON.parse(JSON.stringify(admin)));
                    saveData(data);
                }
            }

            if (!admin) {
                return { success: false, message: `Tài khoản hoặc Email admin "${usernameOrEmail}" không tồn tại.` };
            }

            // Check if admin/staff account is locked
            if (admin.status === 'Đã khóa' || admin.status === 'LOCKED') {
                return {
                    success: false,
                    message: `Tài khoản nhân viên "${admin.username}" hiện đang bị KHÓA bởi Quản trị viên hệ thống.`
                };
            }

            // Verify against THAT SPECIFIC ADMIN'S PASSWORD!
            const expectedPassword = admin.password || 'admin2026';
            if (password !== expectedPassword) {
                return {
                    success: false,
                    message: `Mật khẩu quản trị không chính xác cho tài khoản "${usernameOrEmail}"!`
                };
            }

            data.currentAdmin = {
                id: admin.id,
                username: admin.username,
                password: admin.password,
                role: admin.role,
                roles: Array.isArray(admin.roles) ? [...admin.roles] : [admin.role],
                fullName: admin.fullName,
                email: admin.email,
                department: admin.department
            };
            // Preserve currentUser if testing both portals in same browser session

            saveData(data);
            this.logActivity({
                actor: admin.fullName || admin.username,
                username: admin.username,
                role: admin.role || 'ADMIN',
                actionCategory: 'Đăng nhập',
                actionTitle: 'Đăng nhập hệ thống Admin',
                target: 'Portal Quản trị',
                details: `Tài khoản ${admin.role || 'ADMIN'} ${admin.fullName} (@${admin.username}) đăng nhập thành công vào Trung tâm Điều hành Cargo.`
            });
            return { success: true, admin: data.currentAdmin };
        },

        getCurrentUser: function () {
            const data = loadData();
            if (checkAndAutoLockExpiredWonAuctions(data)) {
                saveData(data, true);
            }
            const user = data.currentUser;
            if (!user) return null;
            const userCode = String(user.agentCode || user.code || '').trim();
            if (!userCode) return null;

            // Verify if current agent account status is locked in agentsList
            if (user.role === 'agent' || user.agentCode || user.code) {
                const targetCode = userCode.toUpperCase();
                const agent = (data.agentsList || []).find(a =>
                    (a.code || '').toUpperCase() === targetCode || a.id == user.id
                );
                if (agent) {
                    if (agent.pin && !user.pin) {
                        user.pin = agent.pin;
                    }
                    if (agent.status === 'Đã khóa' || agent.status === 'LOCKED') {
                        // Auto logout / clear session immediately
                        data.currentUser = null;
                        saveData(data);
                        return null;
                    }
                }
            }
            return user;
        },

        getCurrentAdmin: function () {
            const data = loadData();
            const admin = data.currentAdmin;
            if (!admin) return null;

            // Verify if current admin/staff account status is locked in adminsList
            const targetUsername = (admin.username || '').toLowerCase();
            const staff = (data.adminsList || []).find(a => (a.username || '').toLowerCase() === targetUsername || a.id == admin.id);
            if (staff && (staff.status === 'Đã khóa' || staff.status === 'LOCKED')) {
                // Auto logout / clear session immediately
                data.currentAdmin = null;
                saveData(data);
                return null;
            }
            return admin;
        },

        getPermissionDefinitions: function () {
            return PERMISSION_DEFINITIONS;
        },

        getAllPermissionKeys: function () {
            return ALL_PERMISSION_KEYS;
        },

        getAdminPermissions: function (admin) {
            const data = loadData();
            const cur = admin || (this.getCurrentAdmin ? this.getCurrentAdmin() : data.currentAdmin);
            if (!cur) return [];

            const u = (cur.username || '').toLowerCase();
            const primaryRole = String(cur.role || '').toUpperCase();
            const rolesList = (Array.isArray(cur.roles) ? cur.roles : [cur.role]).filter(Boolean).map(r => String(r || '').toUpperCase());

            // Super Admin / username === 'admin' / ITD_ADMIN always has ALL permissions
            if (u === 'admin' || rolesList.includes('SUPER_ADMIN') || rolesList.includes('ITD_ADMIN') || primaryRole === 'SUPER_ADMIN' || primaryRole === 'ITD_ADMIN') {
                return [...ALL_PERMISSION_KEYS];
            }

            const allRoles = data.rolesList || seedRoles;
            const granted = new Set();

            if (Array.isArray(cur.permissions)) {
                cur.permissions.forEach(p => granted.add(p));
            }

            const roleIdentifiers = new Set(rolesList.concat([cur.role, cur.roleId].filter(Boolean).map(x => String(x).toUpperCase())));

            // Aliases for compatibility
            if (roleIdentifiers.has('COD_ADMIN') || roleIdentifiers.has('COD ADMIN')) roleIdentifiers.add('COD_MANAGER');
            if (roleIdentifiers.has('AUCTION_SETTLEMENT') || roleIdentifiers.has('SETTLEMENT_ADMIN')) roleIdentifiers.add('SETTLEMENT_OFFICER');
            if (roleIdentifiers.has('STAFF')) roleIdentifiers.add('OPERATIONS_VIEWER');

            allRoles.forEach(r => {
                const matchCode = r.code && roleIdentifiers.has(String(r.code).toUpperCase());
                const matchId = r.id && roleIdentifiers.has(String(r.id).toUpperCase());
                const matchName = r.name && roleIdentifiers.has(String(r.name).toUpperCase());
                if (matchCode || matchId || matchName) {
                    (r.permissions || []).forEach(p => granted.add(p));
                }
            });

            return Array.from(granted);
        },

        hasPermission: function (permissionKey, admin) {
            const perms = this.getAdminPermissions(admin);
            return perms.includes(permissionKey);
        },

        hasAdminRole: function (roleName, admin) {
            const data = loadData();
            const cur = admin || (this.getCurrentAdmin ? this.getCurrentAdmin() : data.currentAdmin);
            if (!cur) return false;
            const rUpper = String(roleName || '').trim().toUpperCase();

            // Direct mapping to permission if applicable
            if (rUpper === 'AUCTION_SETTLEMENT' || rUpper === 'SETTLEMENT') {
                return this.hasPermission('auctions.settle_select_winner', cur);
            }

            let rolesList = [];
            if (Array.isArray(cur.roles)) {
                rolesList = cur.roles.map(r => String(r || '').trim().toUpperCase());
            }
            if (cur.role) {
                rolesList.push(String(cur.role).trim().toUpperCase());
            }

            if (rolesList.includes('SUPER_ADMIN') || rolesList.includes('ITD_ADMIN') || rolesList.includes('ADMIN')) {
                return true;
            }

            if (rUpper === 'COD_ADMIN' && (rolesList.includes('COD_MANAGER') || this.hasPermission('auctions.create', cur))) return true;
            if (rUpper === 'STAFF' && (rolesList.includes('OPERATIONS_VIEWER') || this.hasPermission('auctions.view', cur))) return true;

            return rolesList.includes(rUpper);
        },

        hasSettlementRole: function (admin) {
            return this.hasPermission('auctions.settle_select_winner', admin);
        },

        parseFlightDate: function (dateInput) {
            if (!dateInput) return null;
            if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;

            const str = String(dateInput).trim();
            if (!str) return null;

            const d1 = new Date(str);
            if (!isNaN(d1.getTime())) return d1;

            const match = str.match(/(\d{1,2}):(\d{2})\s*(?:·|\s)?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (match) {
                const [, hours, minutes, day, month, year] = match;
                const d = new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes));
                return isNaN(d.getTime()) ? null : d;
            }
            return null;
        },

        formatFlightDateDisplay: function (dateInput) {
            const d = this.parseFlightDate(dateInput);
            if (!d) return String(dateInput || '');
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${hours}:${minutes} · ${day}/${month}/${year}`;
        },

        createAuction: function (auctionData) {
            const data = loadData();
            if (!data.auctions) data.auctions = [];

            const now = new Date();

            let parsedEtd = null;
            let parsedEta = null;
            let parsedOpen = null;
            let parsedClose = null;
            let endTimeDate = null;

            if (auctionData.closeDate) {
                parsedClose = this.parseFlightDate(auctionData.closeDate);
                if (!parsedClose) {
                    return { success: false, message: 'Ngày đóng phiên không đúng định dạng hợp lệ.' };
                }
                if (parsedClose.getTime() <= now.getTime()) {
                    return { success: false, message: 'Ngày đóng phiên phải là thời điểm trong tương lai.' };
                }
                parsedOpen = auctionData.openDate ? this.parseFlightDate(auctionData.openDate) : now;
                if (parsedOpen && parsedClose.getTime() <= parsedOpen.getTime()) {
                    return { success: false, message: 'Ngày đóng phiên phải diễn ra sau ngày mở phiên.' };
                }
                endTimeDate = parsedClose;

                // Parse ETD: prioritize explicit auctionData.etd
                if (auctionData.etd) {
                    parsedEtd = this.parseFlightDate(auctionData.etd);
                }
                if (!parsedEtd && auctionData.flightStartDate) {
                    parsedEtd = this.parseFlightDate(`${auctionData.flightStartDate}T08:00`);
                }
                if (!parsedEtd) {
                    parsedEtd = new Date(parsedClose.getTime() + 12 * 3600 * 1000);
                }

                // Parse ETA: prioritize explicit auctionData.eta, fallback to calculateETA
                if (auctionData.eta) {
                    parsedEta = this.parseFlightDate(auctionData.eta);
                }
                if (!parsedEta && parsedEtd) {
                    parsedEta = calculateETA(parsedEtd, auctionData.origin, auctionData.destination);
                }
            } else {
                // Validate ETD date (legacy flow)
                parsedEtd = this.parseFlightDate(auctionData.etd);
                if (!parsedEtd) {
                    return { success: false, message: 'Thời gian cất cánh dự kiến (ETD) không đúng định dạng hợp lệ.' };
                }

                const closeOffsetHours = Number(auctionData.auctionCloseOffsetHours) || 5;
                const minLeadHours = closeOffsetHours + 1; // At least closeOffset + 1h active bidding window
                const minEtdMs = now.getTime() + (minLeadHours * 3600 * 1000);

                // Check if ETD has sufficient lead time
                if (parsedEtd.getTime() < minEtdMs) {
                    const pad = n => String(n).padStart(2, '0');
                    const minEtdDate = new Date(minEtdMs);
                    const minEtdFormatted = `${pad(minEtdDate.getHours())}:${pad(minEtdDate.getMinutes())} · ${pad(minEtdDate.getDate())}/${pad(minEtdDate.getMonth() + 1)}/${minEtdDate.getFullYear()}`;
                    return {
                        success: false,
                        message: `❌ Thời gian cất cánh (ETD) không đủ thời gian vận hành!\n\nTheo quy định: Hạn chốt thầu là trước ETD ${closeOffsetHours} giờ, thời gian Cut-off kho là trước ETD 3 giờ.\nĐể đủ tối thiểu 1 giờ cho đại lý tham gia đấu giá, thời gian ETD mới phải cách hiện tại ít nhất ${minLeadHours} giờ (Sớm nhất có thể chọn: ${minEtdFormatted}).`
                    };
                }

                // Validate ETA if provided
                if (auctionData.eta) {
                    parsedEta = this.parseFlightDate(auctionData.eta);
                    if (parsedEta && parsedEta.getTime() <= parsedEtd.getTime()) {
                        return {
                            success: false,
                            message: 'Thời gian hạ cánh dự kiến (ETA) phải sau thời gian cất cánh dự kiến (ETD).'
                        };
                    }
                }
                if (!parsedEta && parsedEtd) {
                    parsedEta = calculateETA(parsedEtd, auctionData.origin, auctionData.destination);
                }

                const closeOffset = Number(auctionData.auctionCloseOffsetHours) || 5;
                if (parsedEtd && !isNaN(parsedEtd.getTime())) {
                    const etdCloseTime = new Date(parsedEtd.getTime() - closeOffset * 60 * 60 * 1000);
                    if (etdCloseTime.getTime() > now.getTime()) {
                        endTimeDate = etdCloseTime;
                    } else {
                        endTimeDate = new Date(now.getTime() + 30 * 60 * 1000);
                    }
                } else {
                    endTimeDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                }
            }

            let maxId = 0;
            (data.auctions || []).forEach(a => { maxId = Math.max(maxId, Number(a.id) || 0); });
            (data.wonAuctions || []).forEach(w => { maxId = Math.max(maxId, Number(w.auctionId) || 0); });
            (data.bids || []).forEach(b => { maxId = Math.max(maxId, Number(b.auctionId) || 0); });
            (data.watchlist || []).forEach(w => { maxId = Math.max(maxId, Number(w.auctionId) || 0); });
            (data.registrations || []).forEach(r => { maxId = Math.max(maxId, Number(r.auctionId) || 0); });
            const newId = maxId + 1;
            const flightNumber = (auctionData.flightNumber || 'VU999').trim().toUpperCase();
            const origin = (auctionData.origin || 'SGN').trim().toUpperCase();
            const dest = (auctionData.destination || 'HAN').trim().toUpperCase();

            const originName = this.getAirportName(origin) || origin;
            const destName = this.getAirportName(dest) || dest;
            const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '');
            const flightCode = `FL-${flightNumber}-${dateStr}`;

            // Anti-duplication checks
            const existingCode = (data.auctions || []).find(a => (a.flightCode || '').toUpperCase() === flightCode.toUpperCase());
            if (existingCode) {
                return {
                    success: false,
                    message: `Mã phiên ${flightCode} (Chuyến ${flightNumber}) đã tồn tại trên hệ thống! Vui lòng chọn số hiệu chuyến bay khác để tránh trùng lặp dữ liệu.`
                };
            }

            const existingActive = (data.auctions || []).find(a =>
                (a.flightNumber || '').trim().toUpperCase() === flightNumber &&
                (a.status === 'OPEN' || a.status === 'UPCOMING')
            );
            if (existingActive) {
                return {
                    success: false,
                    message: `Chuyến bay ${flightNumber} hiện đang có một phiên đấu giá mở (${existingActive.flightCode}). Vui lòng không tạo trùng lặp phiên đấu giá.`
                };
            }

            const capacityKg = Number(auctionData.capacityKg) || 3500;
            if (isNaN(capacityKg) || capacityKg < 100 || capacityKg > 50000) {
                return {
                    success: false,
                    message: `Tải trọng chào thầu (${capacityKg ? capacityKg.toLocaleString('vi-VN') : 0} Kg) không hợp lệ! Tải trọng một chuyến bay vận tải hàng không cho phép từ 100 Kg đến tối đa 50.000 Kg (50 tấn).`
                };
            }

            const startingPriceKg = Number(auctionData.startingPriceKg) || 18000;
            const defaultMinIncrement = (data.settings && data.settings.minIncrement) ? Number(data.settings.minIncrement) : 500;
            const minStep = (auctionData.minStep !== undefined && auctionData.minStep !== null && auctionData.minStep !== '')
                ? Number(auctionData.minStep)
                : defaultMinIncrement;

            const formattedOpen = parsedOpen ? this.formatFlightDateDisplay(parsedOpen) : '';
            const formattedClose = parsedClose ? this.formatFlightDateDisplay(parsedClose) : '';
            const formattedEtd = parsedEtd ? this.formatFlightDateDisplay(parsedEtd) : '';
            const formattedEta = parsedEta ? this.formatFlightDateDisplay(parsedEta) : (formattedEtd || 'Chưa cập nhật');
            const endTime = endTimeDate.toISOString();

            const isUpcoming = Boolean((auctionData.isUpcoming !== undefined ? auctionData.isUpcoming : true) && parsedOpen && parsedOpen.getTime() > (now.getTime() + 30000));

            // Process allowedAgents (Approvals for this flight)
            let allowedAgents = ['ALL'];
            if (Array.isArray(auctionData.allowedAgents) && auctionData.allowedAgents.length > 0) {
                if (auctionData.allowedAgents.includes('ALL')) {
                    allowedAgents = ['ALL'];
                } else {
                    allowedAgents = auctionData.allowedAgents.map(c => String(c).trim().toUpperCase()).filter(Boolean);
                }
            } else if (typeof auctionData.allowedAgents === 'string' && auctionData.allowedAgents.trim()) {
                if (auctionData.allowedAgents.trim().toUpperCase() === 'ALL') {
                    allowedAgents = ['ALL'];
                } else {
                    allowedAgents = auctionData.allowedAgents.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
                }
            }

            const flightStartDate = auctionData.flightStartDate || '';
            const flightEndDate = auctionData.flightEndDate || '';
            let flightPeriod = auctionData.flightPeriod || '';
            if (!flightPeriod && flightStartDate) {
                const sFmt = this.formatFlightDateDisplay ? this.formatFlightDateDisplay(flightStartDate) : flightStartDate;
                const eFmt = flightEndDate ? (this.formatFlightDateDisplay ? this.formatFlightDateDisplay(flightEndDate) : flightEndDate) : '';
                flightPeriod = (flightStartDate === flightEndDate || !flightEndDate) ? `Ngày ${sFmt}` : `Từ ${sFmt} ➔ Đến ${eFmt}`;
            }

            const newAuction = {
                id: newId,
                flightCode: flightCode,
                flightNumber: flightNumber,
                route: `${origin} - ${dest}`,
                origin: origin,
                destination: dest,
                originName: originName,
                destName: destName,
                flightStartDate: flightStartDate,
                flightEndDate: flightEndDate,
                flightPeriod: flightPeriod,
                openDate: formattedOpen,
                closeDate: formattedClose,
                openDateIso: parsedOpen ? parsedOpen.toISOString() : now.toISOString(),
                closeDateIso: parsedClose ? parsedClose.toISOString() : endTime,
                etd: formattedEtd,
                eta: formattedEta,
                etdIso: parsedEtd ? parsedEtd.toISOString() : (endTimeDate ? endTimeDate.toISOString() : ''),
                etaIso: parsedEta ? parsedEta.toISOString() : '',
                aircraft: auctionData.aircraft || 'Airbus A321neo Cargo',
                capacityKg: capacityKg,
                startingPriceKg: startingPriceKg,
                currentPriceKg: startingPriceKg,
                minStep: minStep,
                endTime: endTime,
                status: isUpcoming ? 'UPCOMING' : 'OPEN',
                leadingAgentCode: 'Chưa có',
                leadingAgentName: 'Chưa có đại lý nào đặt giá',
                bidsCount: 0,
                specialNotes: auctionData.specialNotes || 'Tải trọng tổng hợp tiêu chuẩn IATA.',
                cutOffTime: auctionData.cutOffTime || 'Theo ngày đóng phiên',
                allowedAgents: allowedAgents
            };

            data.auctions.unshift(newAuction);

            // Notifications
            if (!data.notifications) data.notifications = [];
            if (isUpcoming) {
                if (allowedAgents.includes('ALL')) {
                    data.notifications.unshift({
                        id: Date.now(),
                        timestamp: Date.now(),
                        targetAgentCode: null,
                        title: `⏳ Lên lịch phiên đấu giá: Chuyến ${flightNumber} (${origin} - ${dest})`,
                        message: `Chuyến bay ${flightNumber} (${originName} - ${destName}) với tải trọng ${this.formatNumber(capacityKg)} Kg, giá khởi điểm ${this.formatCurrency(startingPriceKg)}/Kg đã lên lịch mở thầu vào lúc ${formattedOpen}.`,
                        time: 'Vừa xong',
                        type: 'AUCTION_UPCOMING',
                        read: false,
                        link: `04-Detail.html?id=${newId}`
                    });
                } else {
                    allowedAgents.forEach((agentCode, idx) => {
                        data.notifications.unshift({
                            id: Date.now() + idx + 1,
                            timestamp: Date.now(),
                            targetAgentCode: agentCode,
                            title: `🎯 Phê duyệt quyền đấu giá: Chuyến ${flightNumber} (${origin} - ${dest})`,
                            message: `Đại lý ${agentCode} đã được chọn tham gia đấu giá tải trọng ${this.formatNumber(capacityKg)} Kg cho chuyến bay ${flightNumber} (${originName} - ${destName}). Phiên dự kiến mở thầu lúc ${formattedOpen}. Giá khởi điểm: ${this.formatCurrency(startingPriceKg)}/Kg.`,
                            time: 'Vừa xong',
                            type: 'AUCTION_UPCOMING',
                            read: false,
                            link: `02-Dashboard.html`
                        });
                    });
                }
            } else {
                if (allowedAgents.includes('ALL')) {
                    // Broadcast notification for all agents
                    data.notifications.unshift({
                        id: Date.now(),
                        timestamp: Date.now(),
                        targetAgentCode: null, // Broadcast to all agents
                        title: `Mở phiên đấu giá mới: Chuyến ${flightNumber} (${origin} - ${dest})`,
                        message: `Chuyến bay ${flightNumber} (${originName} - ${destName}) với tải trọng ${this.formatNumber(capacityKg)} Kg, giá khởi điểm ${this.formatCurrency(startingPriceKg)}/Kg đã chính thức mở nhận giá thầu.`,
                        time: 'Vừa xong',
                        type: 'AUCTION_OPEN',
                        read: false,
                        link: `04-Detail.html?id=${newId}`
                    });
                } else {
                    // Targeted notifications only to approved assigned agents
                    allowedAgents.forEach((agentCode, idx) => {
                        data.notifications.unshift({
                            id: Date.now() + idx + 1,
                            timestamp: Date.now(),
                            targetAgentCode: agentCode,
                            title: `🎯 Phê duyệt quyền đấu giá: Chuyến ${flightNumber} (${origin} - ${dest})`,
                            message: `Đại lý ${agentCode} đã được chọn tham gia đấu giá tải trọng ${this.formatNumber(capacityKg)} Kg cho chuyến bay ${flightNumber} (${originName} - ${destName}). Giá khởi điểm: ${this.formatCurrency(startingPriceKg)}/Kg.`,
                            time: 'Vừa xong',
                            type: 'AUCTION_OPEN',
                            read: false,
                            link: `02-Dashboard.html`
                        });
                    });
                }
            }

            // Targeted Route Subscription Notifications for agents who subscribed to this specific route
            const routePair = `${origin}-${dest}`.toUpperCase();
            const subMap = data.routeSubscriptions || {};
            Object.keys(subMap).forEach(agentCode => {
                const sub = subMap[agentCode];
                if (sub && sub.notifyOnNewAuction !== false) {
                    const cleanList = (sub.routes || []).map(r => String(r).replace(/\s+/g, '').toUpperCase());
                    if (cleanList.includes(routePair)) {
                        // 1. In-app notification for this specific agent
                        data.notifications.unshift({
                            id: Date.now() + Math.floor(Math.random() * 1000) + 1,
                            timestamp: Date.now(),
                            targetAgentCode: agentCode,
                            title: `🔔 [TUYẾN BẠN QUAN TÂM] Phiên mới: ${flightNumber} (${origin} - ${dest})`,
                            message: `Chuyến bay ${flightNumber} tuyến ${originName} ➔ ${destName} mà Quý đại lý đang theo dõi vừa ${isUpcoming ? `lên lịch mở đấu giá vào lúc ${formattedOpen}` : 'mở đấu giá'} tải trọng ${this.formatNumber(capacityKg)} Kg (Giá khởi điểm: ${this.formatCurrency(startingPriceKg)}/Kg). Đặt giá ngay để không bỏ lỡ slot!`,
                            time: 'Vừa xong',
                            type: isUpcoming ? 'AUCTION_UPCOMING' : 'AUCTION_OPEN',
                            read: false,
                            link: `04-Detail.html?id=${newId}`
                        });

                        // 2. Dispatch automated Email notification if agent enabled emailAlert
                        if (sub.emailAlert !== false) {
                            const agentAcc = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === agentCode.toUpperCase());
                            const defaultTargetEmail = (data.currentUser && data.currentUser.email) ? data.currentUser.email : '';
                            const targetEmail = (agentAcc && agentAcc.email) ? agentAcc.email : defaultTargetEmail;

                            CargoStore.sendEmailNotification({
                                type: 'ROUTE_AUCTION_OPEN',
                                to: targetEmail,
                                notifEmail: agentAcc ? agentAcc.notifEmail : null,
                                agentName: agentAcc ? agentAcc.companyName : `Đại lý ${agentCode}`,
                                agentCode: agentCode,
                                auctionData: newAuction
                            });
                        }
                    }
                }
            });

            const pushPromise = saveData(data, false, true);

            this.logActivity({
                actionCategory: 'Phiên đấu giá',
                actionTitle: 'Tạo mới phiên đấu giá',
                target: flightNumber,
                details: `Khởi tạo phiên đấu giá ${flightCode} (${origin} - ${dest}), ${isUpcoming ? `mở lúc ${formattedOpen}, ` : ''}đóng thầu lúc ${formattedClose}. Tải trọng: ${this.formatNumber(capacityKg)} Kg, Giá sàn: ${this.formatCurrency(startingPriceKg)}/Kg.`
            });

            return {
                success: true,
                message: isUpcoming
                    ? `Tạo phiên đấu giá chuyến ${flightNumber} (${origin} - ${dest}) thành công!\nPhiên ở trạng thái "SẮP DIỄN RA" và sẽ tự động mở nhận giá thầu vào lúc ${formattedOpen}.`
                    : `Tạo phiên đấu giá chuyến ${flightNumber} (${origin} - ${dest}) thành công! Phiên đã mở trực tiếp trên sàn.`,
                auction: newAuction,
                pushPromise: pushPromise,
                ...newAuction
            };
        },

        getFlightDurationMinutes: function (origin, dest) {
            const pair = `${(origin || '').trim().toUpperCase()}-${(dest || '').trim().toUpperCase()}`;
            const routeDurations = {
                'SGN-HAN': 135, // 2h15m
                'HAN-SGN': 135,
                'SGN-DAD': 80,  // 1h20m
                'DAD-SGN': 80,
                'HAN-DAD': 80,  // 1h20m
                'DAD-HAN': 80,
                'HAN-PQC': 135, // 2h15m
                'PQC-HAN': 135,
                'SGN-PQC': 60,  // 1h00m
                'PQC-SGN': 60,
                'SGN-CXR': 60,  // 1h00m
                'CXR-SGN': 60,
                'HAN-CXR': 110, // 1h50m
                'CXR-HAN': 110
            };
            return routeDurations[pair] || 120;
        },



        checkDuplicateFlightNumber: function (flightNumber, currentAuctionId = null) {
            if (!flightNumber) return { isDuplicate: false };
            const data = loadData();
            const fn = String(flightNumber).trim().toUpperCase();

            const existing = (data.auctions || []).find(a => {
                if (currentAuctionId && Number(a.id) === Number(currentAuctionId)) return false;
                return String(a.flightNumber || '').trim().toUpperCase() === fn;
            });

            if (existing) {
                return {
                    isDuplicate: true,
                    message: `Số hiệu chuyến bay ${fn} đã được sử dụng cho phiên ${existing.flightCode || 'ID #' + existing.id} (${existing.route || ''}). Vui lòng chọn hoặc đổi số hiệu khác.`
                };
            }

            return { isDuplicate: false };
        },

        getAuctions: function () {
            const data = loadData();
            const auctions = Array.isArray(data.auctions) ? JSON.parse(JSON.stringify(data.auctions)) : [];
            const bids = data.bids || [];
            const wonList = data.wonAuctions || [];

            auctions.forEach(a => {
                const count = bids.filter(b => b.auctionId == a.id).length;
                if (count > 0) {
                    a.bidsCount = count;
                }
            });

            wonList.forEach(w => {
                const exists = auctions.some(a => String(a.id) === String(w.auctionId));
                if (!exists) {
                    auctions.push({
                        id: w.auctionId,
                        flightCode: w.flightCode || `FL-${w.flightNumber}-CLOSED`,
                        flightNumber: w.flightNumber,
                        route: w.route,
                        origin: w.route ? w.route.split('-')[0].trim() : 'SGN',
                        destination: w.route ? w.route.split('-')[1].trim() : 'HAN',
                        capacityKg: w.capacityKg,
                        startingPriceKg: w.startingPriceKg || Math.max(10000, w.priceKg - 2500),
                        currentPriceKg: w.priceKg,
                        minStep: 500,
                        endTime: w.paymentDeadline || new Date().toISOString(),
                        status: 'CLOSED',
                        bidsCount: w.bidsCount || 4,
                        winnerAgentCode: w.agentCode,
                        winnerAgentName: w.agentName,
                        winningPriceKg: w.priceKg,
                        cutOffTime: w.cutOffTime,
                        aircraft: w.aircraft || 'Airbus A321neo Cargo',
                        etd: w.etd || '09/09/2026',
                        eta: w.eta || '09/09/2026',
                        specialNotes: 'Phiên đã đóng thầu & chốt đại lý trúng thầu.'
                    });
                }
            });

            // Filter out soft-deleted and cancelled auctions from normal views
            return auctions.filter(a => a.status !== 'DELETED' && a.status !== 'CANCELLED');
        },

        // Lấy danh sách các đại lý đã được phê duyệt và đang hoạt động
        getApprovedAgents: function () {
            const data = loadData();
            const list = Array.isArray(data.agentsList) ? data.agentsList : [];
            return list.filter(ag => {
                if (!ag || !ag.code) return false;
                const codeUpper = String(ag.code).trim().toUpperCase();
                if (['ALL', 'STAFF', 'SYSTEM', 'ADMIN', 'VU-ADMIN-01', 'VU-OPS-88'].includes(codeUpper)) return false;
                const isLocked = ag.status === 'Đã khóa' || ag.status === 'LOCKED' || ag.isLocked === true;
                return !isLocked;
            });
        },

        // Kiểm tra xem đại lý có được quyền tham gia đấu giá chuyến bay này không
        isAgentAllowedForAuction: function (auction, agentCode) {
            if (!auction) return false;
            const allowed = auction.allowedAgents;
            // Nếu không giới hạn hoặc gán ALL hoặc mảng rỗng -> cho phép toàn bộ đại lý đã duyệt
            if (!allowed || !Array.isArray(allowed) || allowed.length === 0 || allowed.includes('ALL')) {
                return true;
            }
            if (!agentCode) return false;
            const targetCode = String(agentCode).trim().toUpperCase();
            return allowed.some(c => String(c).trim().toUpperCase() === targetCode);
        },

        // Lấy danh sách các phiên đấu giá mà đại lý cụ thể được quyền xem & tham gia
        getAuctionsForAgent: function (agentCode) {
            const all = this.getAuctions();
            if (!agentCode) return all;
            return all.filter(a => this.isAgentAllowedForAuction(a, agentCode));
        },

        // Admin-only: returns ALL auctions including DELETED and CANCELLED (for audit/management)
        getAllAuctions: function () {
            const data = loadData();
            const auctions = Array.isArray(data.auctions) ? JSON.parse(JSON.stringify(data.auctions)) : [];
            const bids = data.bids || [];
            auctions.forEach(a => {
                const count = bids.filter(b => b.auctionId == a.id).length;
                if (count > 0) a.bidsCount = count;
            });
            return auctions;
        },

        getAuctionById: function (id) {
            if (id === undefined || id === null || id === '') return null;
            const target = String(id).trim().toUpperCase();
            const auctions = this.getAuctions();
            let found = auctions.find(a => 
                String(a.id) === String(id) ||
                (a.flightCode && a.flightCode.toUpperCase() === target) ||
                (a.flightNumber && a.flightNumber.toUpperCase() === target)
            );
            if (!found) {
                const data = loadData();
                const won = (data.wonAuctions || []).find(w => String(w.auctionId) === String(id) || String(w.wonId) === String(id));
                if (won) {
                    found = {
                        id: won.auctionId,
                        flightNumber: won.flightNumber,
                        route: won.route,
                        flightCode: won.flightCode || `FL-${won.flightNumber}`,
                        capacityKg: won.capacityKg,
                        startingPriceKg: won.startingPriceKg || Math.max(10000, won.priceKg - 2500),
                        currentPriceKg: won.priceKg,
                        minStep: 500,
                        status: 'CLOSED',
                        bidsCount: won.bidsCount || 4,
                        winnerAgentCode: won.agentCode,
                        winnerAgentName: won.agentName,
                        winningPriceKg: won.priceKg,
                        cutOffTime: won.cutOffTime,
                        aircraft: won.aircraft || 'Airbus A321-200',
                        etd: won.etd || '09:10 · 09/09/2026',
                        eta: won.eta || '11:15 · 09/09/2026',
                        specialNotes: 'Phiên đấu giá đã đóng thầu & chốt đại lý trúng thầu.'
                    };
                }
            }
            return found;
        },

        getBidsForAuction: function (auctionId) {
            const data = loadData();
            let auction = (data.auctions || []).find(a =>
                String(a.id) === String(auctionId) ||
                (a.flightCode && a.flightCode.toUpperCase() === String(auctionId).toUpperCase())
            );
            const wonItem = (data.wonAuctions || []).find(w =>
                String(w.auctionId) === String(auctionId) ||
                String(w.wonId) === String(auctionId) ||
                (w.flightCode && w.flightCode.toUpperCase() === String(auctionId).toUpperCase())
            );

            const targetAuctionId = auction ? auction.id : (wonItem ? wonItem.auctionId : auctionId);
            const targetFlightCode = auction ? auction.flightCode : (wonItem ? wonItem.flightCode : null);

            if (!data.bids) data.bids = [];
            data.bids = deduplicateBids(data.bids);

            let bids = data.bids.filter(b => {
                if (!b) return false;
                if (String(b.auctionId) === String(auctionId)) return true;
                if (targetAuctionId && String(b.auctionId) === String(targetAuctionId)) return true;
                if (targetFlightCode && b.flightCode && String(b.flightCode).toUpperCase() === String(targetFlightCode).toUpperCase()) return true;
                return false;
            }).sort((a, b) => (Number(b.priceKg) || 0) - (Number(a.priceKg) || 0) || (Number(b.timestamp || b.id) || 0) - (Number(a.timestamp || a.id) || 0));

            return deduplicateBids(bids);
        },

        getPublicAgentName: function (agentCode, agentName, isAnonymous = true, viewerContext = null) {
            const data = loadData();
            const currentUser = viewerContext || data.currentUser;
            const pathname = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '';
            const isAdminPage = pathname.includes('/Admin/') || pathname.includes('/admin/');

            // 1. Admin viewing on Admin Portal -> Full visibility + tag if anonymous
            // Staff viewing on Admin Portal -> Mask bidder identity (STAFF cannot view bidder identities)
            if (isAdminPage && data.currentAdmin) {
                const isStaff = String(data.currentAdmin.role).toUpperCase() === 'STAFF';
                if (isStaff) {
                    return `Đại lý ẩn danh (AG-***)`;
                }
                const anon = isAnonymous !== false;
                if (anon) {
                    return `${agentName || 'Đại lý'} (${agentCode || '-'}) [ẨN DANH]`;
                }
                return `${agentName || 'Đại lý'} (${agentCode || '-'})`;
            }

            // 2. The bidding agent themselves viewing -> Real name with (Bạn)
            const myAgentCode = currentUser ? String(currentUser.agentCode || currentUser.code || '').trim().toUpperCase() : '';
            const targetCode = String(agentCode || '').trim().toUpperCase();
            if (myAgentCode && targetCode && myAgentCode === targetCode) {
                return `${agentName || currentUser.companyName} (Bạn)`;
            }

            // 3. Competitor agent viewing on Agent Portal -> ALWAYS mask identity completely!
            const maskedCode = (targetCode && targetCode !== 'AG-***') ? (targetCode.slice(0, 3) + '***') : 'AG-***';
            return `Đại lý ẩn danh (${maskedCode})`;
        },

        placeBid: function (auctionId, bidPriceKg, isAnonymous = true) {
            const data = loadData();
            if (checkAndAutoLockExpiredWonAuctions(data)) {
                saveData(data, true);
            }
            const auction = data.auctions.find(a =>
                String(a.id) === String(auctionId) ||
                (a.flightCode && a.flightCode.toUpperCase() === String(auctionId).toUpperCase())
            );
            if (!auction) return { success: false, message: 'Phiên đấu giá không tồn tại' };

            // Check if auction is CLOSED (chỉ chặn khi phiên đã thực sự đóng/chốt bởi Admin)
            if (auction.status === 'CLOSED') {
                return { success: false, message: 'Phiên đấu giá này đã đóng thầu, không thể đặt thêm giá.' };
            }

            // Check if auction is UPCOMING
            if (auction.status === 'UPCOMING') {
                return { success: false, message: `Phiên đấu giá này chưa đến giờ mở (Mở lúc: ${auction.openDate || 'Sắp diễn ra'}). Vui lòng quay lại sau!` };
            }

            // Phiên hết thời gian nhưng chưa chốt: tự động gia hạn thêm thời gian để đại lý đặt tiếp
            const timer = getTimeRemaining(auction.endTime);
            if (timer.isEnded) {
                auction.endTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
                auction.isExtended = true;
                auction.extendedTimes = (auction.extendedTimes || 0) + 1;
                saveData(data);
            }

            const hasBids = (auction.bidsCount && auction.bidsCount > 0);
            const minAcceptable = auction.startingPriceKg || auction.currentPriceKg || 0;

            if (bidPriceKg < minAcceptable) {
                return {
                    success: false,
                    message:
                        `Mức giá tối thiểu để đặt thầu là giá khởi điểm ${formatCurrency(minAcceptable)}/Kg`
                };
            }

            let user = data.currentUser || (this.getCurrentUser ? this.getCurrentUser() : null);
            if (!user || !user.agentCode) {
                // Auto fallback to active agent AG-0001 from agentsList if available
                const activeAgent = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === 'AG-0001') || (data.agentsList || [])[0];
                if (activeAgent) {
                    user = {
                        id: activeAgent.id,
                        code: activeAgent.code,
                        agentCode: activeAgent.code,
                        companyName: activeAgent.companyName || 'Công ty CP Giao Nhận Vận Tải Quốc Tế',
                        role: 'agent'
                    };
                    data.currentUser = user;
                } else {
                    return {
                        success: false,
                        message: 'Vui lòng đăng nhập tài khoản Đại lý để tham gia đặt giá.'
                    };
                }
            }

            // Check if agent is permitted to bid on this auction
            if (!this.isAgentAllowedForAuction(auction, user.agentCode)) {
                return {
                    success: false,
                    message: `Đại lý của bạn (${user.agentCode || 'chưa xác định'}) không nằm trong danh sách đại lý được phê duyệt tham gia đấu giá cho chuyến bay ${auction.flightNumber}.`
                };
            }

            // Tài khoản bị Admin khóa thì không được đặt thầu
            const agentAccount = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === (user.agentCode || '').toUpperCase());
            if (agentAccount && (agentAccount.status === 'Đã khóa' || agentAccount.status === 'LOCKED' || agentAccount.isLocked)) {
                return { success: false, message: 'Tài khoản đại lý của bạn đang bị khóa. Vui lòng liên hệ Ban Điều hành để được hỗ trợ.' };
            }

            // Check if agent already submitted a bid for this auction
            const existingBid = (data.bids || []).find(b =>
                String(b.auctionId) === String(auction.id) &&
                String(b.agentCode || '').trim().toUpperCase() === String(user.agentCode || '').trim().toUpperCase()
            );
            if (existingBid) {
                if (Number(bidPriceKg) <= Number(existingBid.priceKg)) {
                    return {
                        success: false,
                        alreadyBid: true,
                        message: `Đại lý của bạn đã nộp mức giá ${formatCurrency(existingBid.priceKg)}/Kg. Mức giá mới phải cao hơn mức giá đã đặt trước đó.`
                    };
                }
                // Update existing bid to the higher price
                existingBid.priceKg = Number(bidPriceKg);
                existingBid.timestamp = Date.now();
                const dExisting = new Date(existingBid.timestamp);
                const padTime = n => String(n).padStart(2, '0');
                existingBid.time = `${dExisting.getFullYear()}-${padTime(dExisting.getMonth() + 1)}-${padTime(dExisting.getDate())} ${padTime(dExisting.getHours())}:${padTime(dExisting.getMinutes())}:${padTime(dExisting.getSeconds())}`;
                existingBid.isAnonymous = (isAnonymous !== false);

                // Update auction stats if higher
                if (Number(bidPriceKg) >= Number(auction.currentPriceKg || 0)) {
                    auction.currentPriceKg = Number(bidPriceKg);
                    auction.leadingAgentCode = user.agentCode;
                    auction.leadingAgentName = user.companyName;
                }
                saveData(data, true);

                // Dispatch to server so database receives the updated bid
                const isHttpUpdate = typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol.startsWith('http');
                if (isHttpUpdate) {
                    const updateBidId = 'BID-' + existingBid.timestamp + '-' + Math.floor(Math.random() * 1000);
                    fetch('/api/bids/place', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            bidId: updateBidId,
                            auctionId: Number(auction.id),
                            agentCode: user.agentCode || user.code,
                            agentName: user.companyName || user.fullName || user.agentCode || user.code,
                            priceKg: Number(bidPriceKg),
                            isAnonymous: (isAnonymous !== false),
                            weightKg: auction.capacityKg
                        })
                    }).then(r => r.json().catch(() => ({}))).then(res => {
                        if (res && res.success && res.bid) {
                            if (typeof syncWithServer === 'function') syncWithServer();
                        }
                    }).catch(() => { });
                }

                return {
                    success: true,
                    updated: true,
                    message: `Nâng giá thầu lên ${formatCurrency(bidPriceKg)}/Kg thành công!`
                };
            }

            // Track previous leader before updating
            const previousLeaderCode = auction.leadingAgentCode;
            const previousLeaderName = auction.leadingAgentName;
            // Outbid logic removed for blind auction
            const anonFlag = isAnonymous !== false;

            const now = Date.now();
            const sharedBidId = 'BID-' + now + '-' + Math.floor(Math.random() * 1000);
            const dNew = new Date(now);
            const padT = n => String(n).padStart(2, '0');
            const formattedTime = `${dNew.getFullYear()}-${padT(dNew.getMonth() + 1)}-${padT(dNew.getDate())} ${padT(dNew.getHours())}:${padT(dNew.getMinutes())}:${padT(dNew.getSeconds())}`;
            // Insert new bid with logged in agent's identity and isAnonymous flag
            const newBid = {
                id: sharedBidId,
                timestamp: now,
                auctionId: auction.id,
                flightCode: auction.flightCode,
                agentCode: user.agentCode,
                agentName: user.companyName,
                isAnonymous: anonFlag,
                priceKg: Number(bidPriceKg),
                time: formattedTime,
                status: 'RECEIVED',
                weightKg: auction.capacityKg
            };
            data.bids.unshift(newBid);

            // Update auction stats
            auction.currentPriceKg = Number(bidPriceKg);
            auction.leadingAgentCode = user.agentCode;
            auction.leadingAgentName = user.companyName;
            auction.isAnonymous = anonFlag;
            auction.bidsCount = (auction.bidsCount || 0) + 1;

            // Update user stats
            if (!user.stats) user.stats = {};
            user.stats.totalBids = (user.stats.totalBids || 0) + 1;

            if (!data.notifications) data.notifications = [];

            // 1. Notification for current bidder (RECORDED)
            data.notifications.unshift({
                id: now,
                timestamp: now,
                targetAgentCode: user.agentCode,
                title: `Đặt giá thành công chuyến ${auction.flightNumber}`,
                message: `Hệ thống đã ghi nhận mức giá đặt thầu ${formatCurrency(bidPriceKg)}/Kg cho chặng ${auction.route}.${anonFlag ? ' (Tên công ty được bảo mật ẩn danh)' : ''}`,
                time: formatTimeAgo(now),
                type: 'BID_RECEIVED',
                read: false,
                link: `04-Detail.html?id=${auction.id}`
            });

            if (!data.activityLogs) data.activityLogs = [];
            const padLog = n => String(n).padStart(2, '0');
            const dLog = new Date(now);
            const tsLogStr = `${padLog(dLog.getDate())}/${padLog(dLog.getMonth() + 1)}/${dLog.getFullYear()} ${padLog(dLog.getHours())}:${padLog(dLog.getMinutes())}:${padLog(dLog.getSeconds())}`;

            const bidActivityLog = {
                id: now,
                timestamp: tsLogStr,
                rawTime: now,
                actor: user.companyName || user.agentCode,
                username: user.agentCode,
                role: 'AGENT',
                actionCategory: 'Đấu giá',
                actionTitle: 'Đặt giá thầu',
                target: auction.flightNumber || `AUC-${auction.id}`,
                details: `Đại lý ${user.companyName || user.agentCode} đặt thầu thành công mức giá ${formatCurrency(bidPriceKg)}/Kg cho chuyến bay ${auction.flightNumber} (${auction.route}).`,
                ip: '113.161.42.12',
                device: 'Web Client'
            };
            data.activityLogs.unshift(bidActivityLog);
            data.activityLogs = deduplicateActivityLogs(data.activityLogs);

            const isHttp = typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol.startsWith('http');

            if (isHttp) {
                fetch('/api/logs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bidActivityLog)
                }).catch(() => { });
            }

            // Set guard BEFORE saving so the periodic syncWithServer() won't
            // overwrite the new bid in the 2-second window before server confirms it.
            lastLocalSaveTimestamp = Date.now();
            saveData(data, true);

            // Auto-close feature for fast testing without waiting for timer
            if (data.settings && data.settings.autoCloseOnBid) {
                setTimeout(() => {
                    if (typeof this.closeAuction === 'function') {
                        this.closeAuction(auction.id);
                    }
                }, 300);
            }

            // Dispatch atomic bid placement to central server if running over HTTP
            if (isHttp) {
                const apiUrl = '/api/bids/place';
                fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        bidId: sharedBidId,
                        auctionId: Number(auction.id),
                        agentCode: user.agentCode || user.code,
                        agentName: user.companyName || user.fullName || user.agentCode || user.code,
                        priceKg: Number(bidPriceKg),
                        isAnonymous: anonFlag,
                        weightKg: auction.capacityKg
                    })
                }).then(r => r.json().catch(() => ({}))).then(res => {
                    if (res && res.success && res.bid) {
                        // Server confirmed — safe to sync now
                        lastLocalSaveTimestamp = 0;
                        if (typeof syncWithServer === 'function') {
                            syncWithServer();
                        }
                    } else if (res && res.success === false) {
                        // Server rejected bid -> rollback local phantom bid immediately
                        console.error('[CargoStore] Server rejected bid:', res.error);
                        const curData = loadData();
                        curData.bids = (curData.bids || []).filter(b => b && b.id !== sharedBidId);
                        reconcileAuctionSummaries(curData);
                        saveData(curData, true);
                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('cargostore_updated', { detail: curData }));
                            const errMsg = res.error || 'Phiên đấu giá đã kết thúc hoặc không thể đặt giá.';
                            if (typeof Swal !== 'undefined') {
                                Swal.fire({
                                    icon: 'error',
                                    title: 'Không thể ghi nhận giá thầu',
                                    text: errMsg,
                                    confirmButtonText: 'Đóng'
                                });
                            } else {
                                alert('❌ Không thể ghi nhận giá thầu: ' + errMsg);
                            }
                        }
                    }
                }).catch(() => { });
            }

            return { success: true, bid: newBid, auction: auction };
        },

        toggleWatchlist: function (auctionId) {
            const data = loadData();
            const id = Number(auctionId);
            if (!id || isNaN(id)) return false;

            if (!Array.isArray(data.watchlist)) data.watchlist = [];

            const normalizedList = data.watchlist
                .map(w => typeof w === 'object' ? Number(w.auctionId || w.id) : Number(w))
                .filter(n => !isNaN(n) && n > 0);

            const index = normalizedList.indexOf(id);
            let isWatched = false;

            if (index > -1) {
                normalizedList.splice(index, 1);
                isWatched = false;
            } else {
                normalizedList.push(id);
                isWatched = true;
            }

            data.watchlist = Array.from(new Set(normalizedList));
            saveData(data);
            return isWatched;
        },

        isWatched: function (auctionId) {
            const data = loadData();
            const id = Number(auctionId);
            if (!id || isNaN(id) || !Array.isArray(data.watchlist)) return false;
            return data.watchlist.some(w => (typeof w === 'object' ? Number(w.auctionId || w.id) : Number(w)) === id);
        },

        getWatchlistAuctions: function () {
            const data = loadData();
            if (!Array.isArray(data.watchlist)) return [];
            const watchedIds = new Set(
                data.watchlist
                    .map(w => typeof w === 'object' ? Number(w.auctionId || w.id) : Number(w))
                    .filter(n => !isNaN(n) && n > 0)
            );
            return (data.auctions || []).filter(a => watchedIds.has(Number(a.id)));
        },

        getMyBids: function () {
            const data = loadData();
            const pathname = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '';
            const isAdminPage = pathname.includes('/Admin/') || pathname.includes('/admin/');

            let list = [];
            if (isAdminPage) {
                list = data.bids || [];
            } else {
                const user = data.currentUser;
                if (!user) {
                    list = (data.bids || []).filter(b => !b.agentCode || String(b.agentCode).trim().toUpperCase() === 'AG-0892');
                } else if (user.role === 'ADMIN' || user.role === 'STAFF') {
                    list = data.bids || [];
                } else {
                    const code = String(user.agentCode || user.code || '').trim().toUpperCase();
                    if (!code) list = data.bids || [];
                    else {
                        list = (data.bids || []).filter(b => {
                            const bCode = String(b.agentCode || b.code || b.bidder || '').trim().toUpperCase();
                            return bCode === code;
                        });
                    }
                }
            }

            // Return bids sorted descending: most recent first
            return [...list].sort((a, b) => {
                const tsA = parseTimestamp(a.timestamp || a.time || a.id);
                const tsB = parseTimestamp(b.timestamp || b.time || b.id);
                return tsB - tsA;
            });
        },

        getWonAuctions: function () {
            const data = loadData();
            const pathname = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '';
            const isAdminPage = pathname.includes('/Admin/') || pathname.includes('/admin/');

            // Admin / staff pages must see the full won-auctions list.
            if (isAdminPage) {
                return data.wonAuctions || [];
            }

            if (data.currentUser && (data.currentUser.role === 'ADMIN' || data.currentUser.role === 'STAFF')) {
                return data.wonAuctions || [];
            }

            const code = String((data.currentUser ? (data.currentUser.agentCode || data.currentUser.code) : '') || 'AG-0892').trim().toUpperCase();
            return (data.wonAuctions || []).filter(w => {
                const wCode = String(w.agentCode || '').trim().toUpperCase();
                return wCode === code;
            });
        },

        isWonAuctionPaid: function (item) {
            if (!item) return false;
            return item.paymentStatus === 'PAID' || item.paymentStatus === 'PAID_LATE' || item.lockWaivedByAdmin === true;
        },

        isWonAuctionPending: function (item) {
            if (!item) return false;
            return item.paymentStatus === 'PENDING_VERIFICATION';
        },

        isWonAuctionUnpaid: function (item, passedData = null) {
            if (!item) return false;
            if (this.isWonAuctionPaid(item)) return false;
            if (this.isWonAuctionPending(item)) return false;
            if (this.isWonAuctionExpired(item, passedData)) return false;
            return true;
        },

        isCargoDeclared: function (item) {
            if (!item || !item.cargoDeclaration) return false;
            const decl = item.cargoDeclaration;
            return !!((decl.cargoName && String(decl.cargoName).trim() !== '') || (decl.hawbNumber && String(decl.hawbNumber).trim() !== ''));
        },

        isCargoUndeclared: function (item) {
            if (!item) return false;
            if (this.isWonAuctionExpired(item)) return false;
            if (item.paymentStatus === 'CANCELLED' || item.paymentStatus === 'CANCELLED_AFTER_PAYMENT' || item.paymentStatus === 'EXPIRED') return false;
            if (item.refundStatus === 'PENDING' || item.refundStatus === 'REFUNDED') return false;
            if (this.isCargoDeclared(item)) return false;

            // Hết hạn khai báo: quá Cut-off (ETD - 3h) hoặc chuyến bay đã cất cánh
            let etdDate = null;
            if (item.etdIso) {
                etdDate = new Date(item.etdIso);
            } else {
                let etdStr = item.etd;
                if (!etdStr) {
                    const auctions = loadData().auctions || [];
                    const match = auctions.find(a => a.id == item.auctionId || (item.flightNumber && a.flightNumber === item.flightNumber));
                    if (match) etdDate = match.etdIso ? new Date(match.etdIso) : null;
                    if (!etdDate && match) etdStr = match.etd;
                }
                if (!etdDate && etdStr) etdDate = parseFlightDate(etdStr);
            }
            if (etdDate && !isNaN(etdDate.getTime()) && Date.now() >= etdDate.getTime() - 3 * 3600 * 1000) return false;
            return true;
        },

        getNotifications: function () {
            const data = loadData();
            const user = data.currentUser;
            const currentAdmin = data.currentAdmin;
            const pathname = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '';
            const isAdminPage = pathname.includes('/Admin/') || pathname.includes('/admin/');

            const normalizeTargetAgentCode = (value) => {
                if (value === null || value === undefined) return null;
                const trimmed = String(value).trim();
                if (!trimmed || trimmed.toUpperCase() === 'CHƯA CÓ' || trimmed.toUpperCase() === 'NULL' || trimmed.toUpperCase() === 'UNDEFINED') return null;
                return trimmed;
            };

            const deletedIds = Array.isArray(data.deletedNotificationIds) ? data.deletedNotificationIds.map(String) : [];
            const readIds = Array.isArray(data.readNotificationIds) ? data.readNotificationIds.map(String) : [];

            // Filter out deleted notifications upfront & deduplicate
            let allNotifs = deduplicateNotifications(data.notifications || []).filter(n => n && !deletedIds.includes(String(n.id)));

            allNotifs = allNotifs.map(n => {
                const ts = n.timestamp || n.createdAt || (typeof n.id === 'number' && n.id > 1577836800000 ? n.id : (typeof n.id === 'string' && !isNaN(Number(n.id)) && Number(n.id) > 1577836800000 ? Number(n.id) : null));
                let displayTime = n.time;
                if (ts) {
                    displayTime = formatTimeAgo(ts, n.time);
                } else if (!n.time || n.time === 'Vừa xong') {
                    displayTime = 'Cách đây ít phút';
                }

                let cleanedMessage = n.message || '';
                let title = n.title || '';
                if (cleanedMessage.includes('Mật khẩu đăng nhập:')) {
                    cleanedMessage = cleanedMessage.replace(/Mật khẩu đăng nhập:.*?(?=Quý công ty|$)/, 'Quý công ty vui lòng sử dụng Mã Đại lý cùng Mật khẩu và Mã PIN đã đăng ký để đăng nhập vào Sàn Đấu giá Cargo. ');
                    title = title.replace('[EMAIL THÔNG BÁO] ', '');
                    cleanedMessage = cleanedMessage.replace(/\s+/g, ' ').trim();
                }

                const nIdStr = String(n.id);
                const isRead = n.read === true || readIds.includes(nIdStr);

                return {
                    ...n,
                    title: title,
                    message: cleanedMessage,
                    time: displayTime,
                    read: isRead,
                    unread: !isRead,
                    targetAgentCode: normalizeTargetAgentCode(n.targetAgentCode)
                };
            });

            const isAdminNotif = (n) => {
                if (!n) return false;
                const role = String(n.targetRole || '').trim().toUpperCase();
                if (role === 'ADMIN' || role === 'STAFF') return true;
                if (n.type === 'REGISTRATION' || n.type === 'AUDIT') return true;
                if (n.link && (n.link.includes('/Admin/') || n.link.includes('Admin/'))) return true;
                const title = String(n.title || '').toUpperCase();
                if (title.includes('HỒ SƠ ĐĂNG KÝ MỚI') || title.includes('[AUDIT]') || title.includes('HỒ SƠ REG-') || title.includes('XÉT DUYỆT HỒ SƠ')) return true;
                return false;
            };

            // 1. Admin / Staff viewing on Admin Portal
            // Only show notifications explicitly scoped to admin/staff.
            // Agent-facing broadcasts (HIGHEST / OUTBID / WON / AUCTION_OPEN) must stay on the agent portal.
            if (isAdminPage && currentAdmin) {
                const adminNotifs = allNotifs.filter(n => isAdminNotif(n));
                return adminNotifs.sort((a, b) => (Number(b.timestamp || b.createdAt || b.id) || 0) - (Number(a.timestamp || a.createdAt || a.id) || 0));
            }

            // 2. Logged-in Agent viewing on Agent Portal
            if (!user) {
                const publicNotifs = allNotifs.filter(n => !isAdminNotif(n) && (n.type === 'SYSTEM' || n.type === 'ANNOUNCEMENT' || n.isBroadcast === true));
                return publicNotifs.sort((a, b) => (Number(b.timestamp || b.createdAt || b.id) || 0) - (Number(a.timestamp || a.createdAt || a.id) || 0));
            }

            const myCode = (user.agentCode || user.code || '').trim().toUpperCase();

            // Dynamically synthesize missing HIGHEST / OUTBID notifications from bids history for current agent
            const userBids = (data.bids || []).filter(b => String(b.agentCode || '').trim().toUpperCase() === myCode);

            userBids.forEach(b => {
                const auc = (data.auctions || []).find(a => a.id == b.auctionId);
                const flightLabel = auc ? auc.flightNumber : `AUC-${b.auctionId}`;
                const routeLabel = auc ? auc.route : '';
                const bTime = Number(b.timestamp || b.id) || Date.now();
                const outbidNotifId = `outbid_${b.auctionId}_${b.id || bTime}`;
                const highestNotifId = `highest_${b.auctionId}_${b.id || bTime}`;

                if (b.status === 'HIGHEST') {
                    const hasHighestNotif = allNotifs.some(n =>
                        (String(n.id) === highestNotifId) ||
                        (n.type === 'BID_RECEIVED' &&
                            String(n.targetAgentCode || '').trim().toUpperCase() === myCode &&
                            (n.link && n.link.includes(`id=${b.auctionId}`)))
                    );
                    const isDeleted = deletedIds.includes(highestNotifId) ||
                        deletedIds.includes(String(bTime)) ||
                        deletedIds.includes(String(b.id)) ||
                        deletedIds.includes(`highest_${b.auctionId}_${b.id}`) ||
                        deletedIds.includes(`highest_${b.auctionId}_${bTime}`);
                    if (!hasHighestNotif && !isDeleted) {
                        const isRead = readIds.includes(highestNotifId) ||
                            readIds.includes(String(bTime)) ||
                            readIds.includes(String(b.id)) ||
                            readIds.includes(`highest_${b.auctionId}_${b.id}`) ||
                            readIds.includes(`highest_${b.auctionId}_${bTime}`);
                        allNotifs.push({
                            id: highestNotifId,
                            timestamp: bTime,
                            targetAgentCode: myCode,
                            title: `Đặt giá thành công chuyến ${flightLabel}`,
                            message: `Hệ thống đã ghi nhận mức giá ${formatCurrency(b.priceKg)}/Kg cho chặng ${routeLabel}.`,
                            time: formatTimeAgo(bTime),
                            type: 'BID_RECEIVED',
                            read: isRead,
                            unread: !isRead,
                            link: `04-Detail.html?id=${b.auctionId}`
                        });
                    }
                } else if (false /* removed */) {
                    const hasOutbidNotif = allNotifs.some(n =>
                        (String(n.id) === outbidNotifId) ||
                        (false /* removed */ &&
                            String(n.targetAgentCode || '').trim().toUpperCase() === myCode &&
                            (n.link && n.link.includes(`id=${b.auctionId}`)))
                    );
                    const isDeleted = deletedIds.includes(outbidNotifId) ||
                        deletedIds.includes(String(bTime + 1)) ||
                        deletedIds.includes(String(bTime)) ||
                        deletedIds.includes(String(b.id)) ||
                        deletedIds.includes(`outbid_${b.auctionId}_${b.id}`) ||
                        deletedIds.includes(`outbid_${b.auctionId}_${bTime}`);
                    if (!hasOutbidNotif && !isDeleted) {
                        const isRead = readIds.includes(outbidNotifId) ||
                            readIds.includes(String(bTime + 1)) ||
                            readIds.includes(String(bTime)) ||
                            readIds.includes(String(b.id)) ||
                            readIds.includes(`outbid_${b.auctionId}_${b.id}`) ||
                            readIds.includes(`outbid_${b.auctionId}_${bTime}`);
                        const higherBid = (data.bids || []).find(hb => hb.auctionId == b.auctionId && Number(hb.priceKg) > Number(b.priceKg));
                        const competitorNameDisplay = higherBid ? (higherBid.isAnonymous ? 'Một đại lý đối thủ (Ẩn danh)' : `Đại lý ${higherBid.agentName} (${higherBid.agentCode})`) : 'Một đại lý đối thủ';
                        const higherPrice = higherBid ? higherBid.priceKg : (auc ? auc.currentPriceKg : b.priceKg);
                        allNotifs.push({
                            id: outbidNotifId,
                            timestamp: bTime + 1,
                            targetAgentCode: myCode,
                            title: `Cảnh báo bị vượt giá chuyến ${flightLabel}!`,
                            message: `${competitorNameDisplay} vừa đặt mức giá mới ${formatCurrency(higherPrice)}/Kg cho chặng ${routeLabel}.`,
                            time: formatTimeAgo(bTime + 1),
                            type: 'BID_RECEIVED',
                            read: isRead,
                            unread: !isRead,
                            link: `04-Detail.html?id=${b.auctionId}`
                        });
                    }
                }
            });

            // Dynamically synthesize missing WON notifications from wonAuctions for current agent
            const userWonAuctions = (data.wonAuctions || []).filter(w => String(w.agentCode || '').trim().toUpperCase() === myCode);
            userWonAuctions.forEach(w => {
                const wonNotifId = `won_${w.wonId || w.auctionId}`;
                const hasWonNotif = allNotifs.some(n =>
                    String(n.id) === wonNotifId ||
                    (n.type === 'WON' && (
                        (n.link && (n.link.includes(String(w.flightNumber)) || n.link.includes(String(w.auctionId)))) ||
                        (n.message && w.flightNumber && n.message.includes(w.flightNumber))
                    ))
                );
                const isDeleted = deletedIds.includes(wonNotifId) ||
                    deletedIds.includes(String(w.wonId)) ||
                    deletedIds.includes(String(w.auctionId));
                if (!hasWonNotif && !isDeleted) {
                    const isRead = readIds.includes(wonNotifId) ||
                        readIds.includes(String(w.wonId)) ||
                        readIds.includes(String(w.auctionId));
                    const wTime = Number(w.timestamp || (w.wonId && w.wonId.split('-')[1]) || Date.now()) || Date.now();
                    allNotifs.push({
                        id: wonNotifId,
                        timestamp: wTime,
                        targetAgentCode: myCode,
                        title: `🏆 CHÚC MỪNG! Bạn đã thắng thầu chuyến bay ${w.flightNumber}`,
                        message: `Đại lý ${w.agentName || myCode} (${myCode}) đã trúng thầu chuyến bay ${w.flightNumber} (${w.route || ''}) với giá ${formatCurrency(w.priceKg)}/Kg. Phiên đấu giá đã hoàn tất thành công và ghi nhận bạn là người trúng thầu.`,
                        time: formatTimeAgo(wTime),
                        type: 'WON',
                        read: isRead,
                        unread: !isRead,
                        link: `07-WonAuction.html?flight=${encodeURIComponent(w.flightNumber || '')}`
                    });
                }
            });

            // Find agent's approval / creation timestamp
            let approvalTimestamp = 0;
            const approvalNotif = allNotifs.find(n => {
                const tCode = String(n.targetAgentCode || '').trim().toUpperCase();
                return tCode === myCode && n.title && (n.title.includes('Phê duyệt Hồ sơ') || n.title.includes('PHÊ DUYỆT'));
            });
            if (approvalNotif) {
                approvalTimestamp = Number(approvalNotif.timestamp || approvalNotif.createdAt || approvalNotif.id) || 0;
            } else {
                const agentObj = (data.agentsList || []).find(a => String(a.code || a.agentCode || '').trim().toUpperCase() === myCode);
                if (agentObj) {
                    const agentIdNum = Number(agentObj.id);
                    if (!isNaN(agentIdNum) && agentIdNum > 1577836800000) {
                        approvalTimestamp = agentIdNum;
                    } else if (agentObj.createdAt) {
                        approvalTimestamp = Number(agentObj.createdAt) || 0;
                    }
                }
            }

            let agentNotifs = allNotifs.filter(n => {
                // Admin / staff / registration / audit notifications must NEVER leak to agents
                if (isAdminNotif(n)) return false;

                const targetCode = String(n.targetAgentCode || '').trim().toUpperCase();
                const titleUpper = String(n.title || '').toUpperCase();
                const msgUpper = String(n.message || '').toUpperCase();
                const combinedText = titleUpper + ' ' + msgUpper;

                // WON, OUTBID, HIGHEST, PAYMENT_REMINDER, and REGISTRATION_APPROVED/REJECTED are strictly agent-specific
                const isAgentSpecific = (
                    n.type === 'WON' || false /* removed */ || n.type === 'BID_RECEIVED' || n.type === 'PAYMENT_REMINDER' ||
                    n.type === 'REGISTRATION_APPROVED' || n.type === 'REGISTRATION_REJECTED' || n.type === 'AGENT' ||
                    titleUpper.includes('PHÊ DUYỆT HỒ SƠ') || titleUpper.includes('CẤP MÃ ĐẠI LÝ') || titleUpper.includes('TỪ CHỐI HỒ SƠ') ||
                    titleUpper.includes('KHÓA TÀI KHOẢN') || msgUpper.includes('CẤP MÃ ĐẠI LÝ') || msgUpper.includes('MÃ ĐẠI LÝ CHÍNH THỨC')
                );

                if (isAgentSpecific) {
                    if (targetCode) {
                        return targetCode === myCode;
                    }
                    const codeMatch = combinedText.match(/AG-\d{4}/);
                    if (codeMatch) {
                        return codeMatch[0] === myCode;
                    }
                    return false; // Do not leak untargeted agent-specific approvals
                }

                // If targeted to a specific agent code, match exact agent code
                if (targetCode) {
                    return targetCode === myCode;
                }

                // Check if title or message mentions a specific AG-xxxx code of ANOTHER agent
                const codeInText = combinedText.match(/AG-\d{4}/);
                if (codeInText && codeInText[0] !== myCode) {
                    return false;
                }

                // Untargeted general notifications (AUCTION_OPEN, CLOSING_SOON, SYSTEM)
                // For newly registered/approved agents, only show notifications created on/after approval
                if (approvalTimestamp > 0) {
                    const nTs = Number(n.timestamp || n.createdAt || n.id) || 0;
                    if (nTs < (approvalTimestamp - 60000)) {
                        return false;
                    }
                }

                return true;
            });

            // Filter out payment-related notifications for demo/bidding-only
            let finalNotifs = agentNotifs.filter(n => {
                if (!n) return false;
                if (n.type === 'PAYMENT_REMINDER' || n.type === 'PAYMENT') return false;
                const titleUpper = String(n.title || '').toUpperCase();
                const msgUpper = String(n.message || '').toUpperCase();
                if (titleUpper.includes('THANH TOÁN') || titleUpper.includes('CHUYỂN KHOẢN') || titleUpper.includes('QUÁ HẠN THANH TOÁN') || titleUpper.includes('CẢNH BÁO THANH TOÁN')) return false;
                if (msgUpper.includes('HOÀN TẤT CHUYỂN KHOẢN') || msgUpper.includes('THANH TOÁN ĐÚNG HẠN') || msgUpper.includes('QUÁ HẠN THANH TOÁN') || msgUpper.includes('KHÓA TÀI KHOẢN ĐẠI LÝ')) return false;
                return true;
            });

            // Clean winning notification message
            finalNotifs = finalNotifs.map(n => {
                let msg = n.message || '';
                if (msg.includes('hoàn tất thanh toán') || msg.includes('khai báo hàng hóa')) {
                    msg = msg.replace(/\s*Vui lòng hoàn tất thanh toán.*$/i, ' Phiên đấu giá đã hoàn tất thành công và ghi nhận bạn là người trúng thầu.');
                    return { ...n, message: msg.trim() };
                }
                return n;
            });

            return finalNotifs.sort((a, b) => (Number(b.timestamp || b.createdAt || b.id) || 0) - (Number(a.timestamp || a.createdAt || a.id) || 0));
        },

        markNotificationRead: function (id) {
            const data = loadData();
            if (!data.notifications) data.notifications = [];
            if (!Array.isArray(data.readNotificationIds)) data.readNotificationIds = [];

            const targetIdStr = String(id);
            if (!data.readNotificationIds.includes(targetIdStr)) {
                data.readNotificationIds.push(targetIdStr);
            }

            if (targetIdStr.startsWith('won_')) {
                const wonSuffix = targetIdStr.substring(4);
                if (!data.readNotificationIds.includes(wonSuffix)) data.readNotificationIds.push(wonSuffix);
            }

            if (targetIdStr.startsWith('outbid_') || targetIdStr.startsWith('highest_')) {
                const parts = targetIdStr.split('_');
                if (parts.length >= 3) {
                    const aucId = parts[1];
                    const bidId = parts[2];
                    const alias1 = `outbid_${aucId}_${bidId}`;
                    const alias2 = `highest_${aucId}_${bidId}`;
                    if (!data.readNotificationIds.includes(bidId)) data.readNotificationIds.push(bidId);
                    if (!data.readNotificationIds.includes(alias1)) data.readNotificationIds.push(alias1);
                    if (!data.readNotificationIds.includes(alias2)) data.readNotificationIds.push(alias2);
                }
            }

            let found = false;
            data.notifications.forEach(n => {
                if (String(n.id) === targetIdStr || n.id == id) {
                    n.read = true;
                    n.unread = false;
                    found = true;
                }
            });

            saveData(data);

            if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                fetch('/api/notifications/read', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: [targetIdStr] })
                }).catch(() => { });
            }
        },

        markAllNotificationsRead: function (agentCode) {
            const data = loadData();
            const notifs = this.getNotifications();
            if (!Array.isArray(data.readNotificationIds)) data.readNotificationIds = [];

            const readIds = [];
            notifs.forEach(n => {
                const idStr = String(n.id);
                if (!data.readNotificationIds.includes(idStr)) {
                    data.readNotificationIds.push(idStr);
                }
                readIds.push(idStr);
                if (idStr.startsWith('won_')) {
                    const wonSuffix = idStr.substring(4);
                    if (!data.readNotificationIds.includes(wonSuffix)) data.readNotificationIds.push(wonSuffix);
                }
                if (idStr.startsWith('outbid_') || idStr.startsWith('highest_')) {
                    const parts = idStr.split('_');
                    if (parts.length >= 3) {
                        const aucId = parts[1];
                        const bidId = parts[2];
                        const alias1 = `outbid_${aucId}_${bidId}`;
                        const alias2 = `highest_${aucId}_${bidId}`;
                        if (!data.readNotificationIds.includes(bidId)) data.readNotificationIds.push(bidId);
                        if (!data.readNotificationIds.includes(alias1)) data.readNotificationIds.push(alias1);
                        if (!data.readNotificationIds.includes(alias2)) data.readNotificationIds.push(alias2);
                    }
                }
            });

            if (data.notifications) {
                const user = data.currentUser;
                const myCode = (agentCode || (user ? (user.agentCode || user.code) : '') || '').trim().toUpperCase();
                data.notifications.forEach(n => {
                    if (n.targetRole === 'ADMIN' || n.targetRole === 'STAFF') return;
                    const nTarget = String(n.targetAgentCode || '').trim().toUpperCase();
                    if (!user || !nTarget || nTarget === myCode) {
                        n.read = true;
                        n.unread = false;
                    }
                });
            }

            saveData(data);

            if (readIds.length > 0 && typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                fetch('/api/notifications/read', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: readIds })
                }).catch(() => { });
            }
        },

        deleteNotification: function (id) {
            this.deleteNotifications([id]);
        },

        deleteNotifications: function (ids) {
            if (!Array.isArray(ids) || ids.length === 0) return;
            const data = loadData();
            if (!data.notifications) data.notifications = [];
            if (!Array.isArray(data.deletedNotificationIds)) data.deletedNotificationIds = [];

            const idStrings = ids.map(id => String(id));

            idStrings.forEach(idStr => {
                if (!data.deletedNotificationIds.includes(idStr)) {
                    data.deletedNotificationIds.push(idStr);
                }
                if (idStr.startsWith('won_')) {
                    const wonSuffix = idStr.substring(4);
                    if (!data.deletedNotificationIds.includes(wonSuffix)) data.deletedNotificationIds.push(wonSuffix);
                }
                if (idStr.startsWith('outbid_') || idStr.startsWith('highest_')) {
                    const parts = idStr.split('_');
                    if (parts.length >= 3) {
                        const aucId = parts[1];
                        const bidId = parts[2];
                        const alias1 = `outbid_${aucId}_${bidId}`;
                        const alias2 = `highest_${aucId}_${bidId}`;
                        if (!data.deletedNotificationIds.includes(bidId)) data.deletedNotificationIds.push(bidId);
                        if (!data.deletedNotificationIds.includes(alias1)) data.deletedNotificationIds.push(alias1);
                        if (!data.deletedNotificationIds.includes(alias2)) data.deletedNotificationIds.push(alias2);
                    }
                }
            });

            const deletedSet = new Set(data.deletedNotificationIds);
            data.notifications = data.notifications.filter(n => !deletedSet.has(String(n.id)));
            saveData(data);

            if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                fetch('/api/notifications/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: idStrings })
                }).catch(() => { });
            }
        },

        registerAgent: function (regData) {
            const data = loadData();
            if (!data.registrations) data.registrations = [];

            const taxClean = (regData.taxCode || '').trim();
            const emailClean = (regData.email || '').trim().toLowerCase();

            // Store-level Validation Rules
            const nameRegex = /^[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂưăạảấầẩẫậắằẳẵặẹẻẽềềểỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸửữựỳỵỷỹ\s]+$/;
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            const phoneRegex = /^(03|05|07|08|09)\d{8}$/;
            const taxRegex = /^\d{10}(\d{3})?$/;
            const pinRegex = /^\d{4}$/;

            const repNameClean = (regData.repName || '').trim();
            if (!repNameClean || repNameClean.split(/\s+/).length < 2 || !nameRegex.test(repNameClean)) {
                return { success: false, message: 'Họ và tên người đại diện phải gồm cả Họ và Tên (tối thiểu 2 từ, chỉ gồm chữ cái).' };
            }

            if (!emailClean || !emailRegex.test(emailClean)) {
                return { success: false, message: 'Email đăng ký không đúng định dạng hợp lệ (VD: user@company.com).' };
            }

            const phoneClean = (regData.phone || '').replace(/\s+/g, '');
            if (!phoneClean || !phoneRegex.test(phoneClean)) {
                return { success: false, message: 'Số điện thoại di động phải gồm 10 chữ số hợp lệ của các nhà mạng Việt Nam (VD: 0901234567).' };
            }

            if (!taxClean || !taxRegex.test(taxClean)) {
                return { success: false, message: 'Mã số thuế (MST) phải gồm 10 hoặc 13 chữ số.' };
            }

            const pwd = regData.password || '';
            const pwdHasUpper = /[A-Z]/.test(pwd);
            const pwdHasLower = /[a-z]/.test(pwd);
            const pwdHasDigit = /[0-9]/.test(pwd);
            const pwdHasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd);

            if (pwd.length < 8 || !pwdHasUpper || !pwdHasLower || !pwdHasDigit || !pwdHasSpecial) {
                return {
                    success: false,
                    message: 'Mật khẩu chưa đạt yêu cầu an toàn! Mật khẩu phải từ 8 ký tự trở lên, gồm chữ HOA, chữ thường, chữ số và ký tự đặc biệt (!@#$%^&*).'
                };
            }

            // PIN is now created post-login; validate only if explicitly supplied
            const pinClean = (regData.pin || '').trim();
            if (pinClean && !pinRegex.test(pinClean)) {
                return { success: false, message: 'Mã PIN bảo mật phải gồm đúng 4 chữ số (0-9).' };
            }

            if (taxClean) {
                const duplicateTax = (data.registrations || []).find(r => r.status === 'PENDING' && (r.taxCode || '').trim() === taxClean) ||
                    (data.agentsList || []).find(a => (a.taxCode || '').trim() === taxClean);
                if (duplicateTax) {
                    return {
                        success: false,
                        message: `Mã số thuế "${taxClean}" đã được đăng ký trên hệ thống bởi (${duplicateTax.companyName}). Vui lòng kiểm tra lại để tránh trùng dữ liệu.`
                    };
                }
            }

            if (emailClean) {
                const duplicateEmail = (data.registrations || []).find(r => r.status === 'PENDING' && (r.email || '').trim().toLowerCase() === emailClean) ||
                    (data.agentsList || []).find(a => (a.email || '').trim().toLowerCase() === emailClean);
                if (duplicateEmail) {
                    return {
                        success: false,
                        message: `Email "${emailClean}" đã được sử dụng trên hệ thống. Vui lòng sử dụng email khác.`
                    };
                }
            }

            if (regData.documents && Array.isArray(regData.documents)) {
                for (const doc of regData.documents) {
                    if (doc && doc.size && doc.size > 10 * 1024 * 1024) {
                        const sizeMB = (doc.size / (1024 * 1024)).toFixed(1);
                        return {
                            success: false,
                            message: `Tệp tin "${doc.name || 'Hồ sơ'}" (${sizeMB}MB) vượt quá dung lượng tối đa cho phép (10MB/tệp tin)!`
                        };
                    }
                }
            }

            const now = new Date();

            // Check if resubmitting an existing rejected registration
            const existingRejectedReg = (data.registrations || []).find(r =>
                (regData.resubmitRegId && r.regId === regData.resubmitRegId) ||
                (taxClean && r.taxCode && r.taxCode.trim() === taxClean && r.status === 'REJECTED')
            );

            if (existingRejectedReg) {
                existingRejectedReg.companyName = regData.companyName || existingRejectedReg.companyName;
                existingRejectedReg.taxCode = taxClean || existingRejectedReg.taxCode;
                existingRejectedReg.businessLicense = regData.businessLicense || existingRejectedReg.businessLicense;
                existingRejectedReg.address = regData.address || existingRejectedReg.address;
                existingRejectedReg.field = regData.field || existingRejectedReg.field;
                existingRejectedReg.repName = regData.repName || existingRejectedReg.repName;
                existingRejectedReg.repPosition = regData.repPosition || existingRejectedReg.repPosition;
                existingRejectedReg.email = emailClean || existingRejectedReg.email;
                existingRejectedReg.phone = phoneClean || existingRejectedReg.phone;
                existingRejectedReg.citizenId = regData.citizenId || existingRejectedReg.citizenId;
                existingRejectedReg.notifEmail = regData.notifEmail || existingRejectedReg.notifEmail;
                if (regData.password) existingRejectedReg.password = regData.password;
                if (regData.pin) existingRejectedReg.pin = regData.pin;
                if (regData.documents && regData.documents.length > 0) {
                    existingRejectedReg.documents = regData.documents.map(d => {
                        if (typeof d === 'string') return { name: d, dataUrl: null, type: d.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png' };
                        return { name: d.name || 'document', dataUrl: d.dataUrl || null, type: d.type || 'application/octet-stream', size: d.size || 0 };
                    });
                }
                existingRejectedReg.status = 'PENDING';
                existingRejectedReg.rejectionReason = null;
                existingRejectedReg.rejectReason = null;
                existingRejectedReg.resubmittedAt = now.toISOString();
                existingRejectedReg.submittedAt = now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' (Bổ sung lại)';

                saveData(data);

                if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                    fetch('/api/registration/submit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(existingRejectedReg)
                    }).then(() => {
                        lastLocalSaveTimestamp = 0;
                        return syncWithServer(true);
                    }).catch(() => { });
                }

                CargoStore.sendEmailNotification({
                    type: 'REGISTRATION_SUBMITTED',
                    to: existingRejectedReg.email,
                    notifEmail: existingRejectedReg.notifEmail,
                    regData: existingRejectedReg
                });

                return existingRejectedReg;
            }

            const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
            const count = data.registrations.length + 1;
            const regId = `REG-${dateStr}-${String(count).padStart(2, '0')}`;

            const newReg = {
                regId: regId,
                companyName: regData.companyName || 'Công ty mới đăng ký',
                taxCode: regData.taxCode || '',
                businessLicense: regData.businessLicense || '',
                address: regData.address || '',
                field: regData.field || 'Cargo Agent',
                repName: regData.repName || '',
                repPosition: regData.repPosition || 'Đại diện ủy quyền',
                email: regData.email || '',
                phone: regData.phone || '',
                citizenId: regData.citizenId || '',
                notifEmail: regData.notifEmail || '',
                password: regData.password || '12345678',
                pin: regData.pin || '1234',
                documents: (regData.documents && regData.documents.length > 0) ? regData.documents.map(d => {
                    // Support both old format (string) and new format ({name, dataUrl, type})
                    if (typeof d === 'string') return { name: d, dataUrl: null, type: d.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png' };
                    return { name: d.name || 'document', dataUrl: d.dataUrl || null, type: d.type || 'application/octet-stream', size: d.size || 0 };
                }) : [
                    { name: 'GPKD_TanSonNhat_Scan.pdf', dataUrl: null, type: 'application/pdf' },
                    { name: 'UyQuyen_Cargo_IATA.pdf', dataUrl: null, type: 'application/pdf' },
                    { name: 'CCCD_TranHoangNam.pdf', dataUrl: null, type: 'application/pdf' }
                ],
                status: 'PENDING',
                submittedAt: now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
            };

            data.registrations.unshift(newReg);

            // Push admin notification for new registration if not already existing
            if (!data.notifications) data.notifications = [];
            const notifMsg = `Mã hồ sơ ${newReg.regId} — ${newReg.companyName} (MST: ${newReg.taxCode}) vừa nộp hồ sơ đăng ký trở thành đại lý. Người đại diện: ${newReg.repName} — ${newReg.email}. Vui lòng xét duyệt trong vòng 24h làm việc.`;
            const alreadyHasNotif = data.notifications.some(n => n.message && n.message.includes(newReg.regId));
            if (!alreadyHasNotif) {
                data.notifications.unshift({
                    id: Date.now(),
                    timestamp: Date.now(),
                    targetRole: 'ADMIN',
                    title: `📋 HỒ SƠ ĐĂNG KÝ MỚI: ${newReg.companyName}`,
                    message: notifMsg,
                    time: 'Vừa xong',
                    type: 'REGISTRATION',
                    read: false,
                    link: '../Admin/06-AgentList.html'
                });
            }

            saveData(data);

            if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                fetch('/api/registration/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newReg)
                }).then(() => {
                    lastLocalSaveTimestamp = 0;
                    return syncWithServer(true);
                }).catch(() => { });
            }

            // Dispatch automated email via Nodemailer
            CargoStore.sendEmailNotification({
                type: 'REGISTRATION_SUBMITTED',
                to: newReg.email,
                notifEmail: newReg.notifEmail,
                regData: newReg
            });

            return newReg;
        },

        getRegistrations: function () {
            return loadData().registrations || [];
        },

        approveRegistration: function (regId) {
            const data = loadData();
            if (data.currentAdmin && data.currentAdmin.role === 'STAFF') {
                return { success: false, message: 'Nhân viên (STAFF) không có quyền phê duyệt hồ sơ đại lý. Thao tác này chỉ dành cho Quản trị viên (ADMIN).' };
            }
            const reg = data.registrations.find(r => r.regId === regId);
            if (!reg) return false;

            reg.status = 'APPROVED';
            if (!data.agentsList) data.agentsList = [];
            const existingCodes = new Set(data.agentsList.map(a => String(a.code || '').trim().toUpperCase()));
            let seq = data.agentsList.length + 1;
            let newCode = `AG-${String(seq).padStart(4, '0')}`;
            while (existingCodes.has(newCode)) {
                seq++;
                newCode = `AG-${String(seq).padStart(4, '0')}`;
            }
            reg.agentCode = newCode;
            const agentPwd = reg.password || '12345678';
            const agentPin = reg.pin || null; // Mã PIN được tạo sau khi đăng nhập thành công

            // Add to agents list with registered password
            const newAgent = {
                id: Date.now(),
                code: newCode,
                password: agentPwd,
                pin: agentPin,
                companyName: reg.companyName,
                repName: reg.repName,
                position: reg.repPosition,
                phone: reg.phone,
                email: reg.email,
                taxCode: reg.taxCode,
                address: reg.address,
                tier: 'TIER2',
                status: 'Đang hoạt động',
                joinedDate: new Date().toLocaleDateString('vi-VN'),
                totalBids: 0,
                totalWins: 0,
                documents: reg.documents || []
            };
            data.agentsList.push(newAgent);

            // Send automated Email Notification record to contact email
            if (!data.notifications) data.notifications = [];
            const now = Date.now();
            data.notifications.unshift({
                id: now,
                timestamp: now,
                targetAgentCode: newCode,
                targetEmail: reg.email,
                title: `Phê duyệt Hồ sơ & Cấp Mã Đại lý ${newCode}`,
                message: `Kính gửi ${reg.repName} (${reg.companyName}), Ban Điều hành Hãng hàng không xin thông báo: Hồ sơ đăng ký của Quý doanh nghiệp đã được PHÊ DUYỆT thành công! Mã Đại lý chính thức của Quý công ty là: ${newCode}. Quý công ty vui lòng sử dụng Mã Đại lý cùng Mật khẩu để đăng nhập vào Sàn Đấu giá Cargo và thiết lập Mã PIN bảo mật.`,
                time: formatTimeAgo(now),
                type: 'SYSTEM',
                read: false,
                link: '01-Login.html'
            });

            saveData(data);
            if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                fetch('/api/registration/approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        regId: regId,
                        agentCode: newCode,
                        password: agentPwd,
                        pin: agentPin,
                        approvedBy: data.currentAdmin ? (data.currentAdmin.fullName || data.currentAdmin.username) : 'Admin'
                    })
                }).then(() => {
                    lastLocalSaveTimestamp = 0;
                    return syncWithServer(true);
                }).catch(() => { });
            }
            this.logActivity({
                actionCategory: 'Quản lý Đại lý',
                actionTitle: 'Duyệt & Cấp mã Đại lý',
                target: reg.companyName,
                details: `Phê duyệt hồ sơ đăng ký đại lý "${reg.companyName}" (MST: ${reg.taxCode || 'N/A'}). Cấp thành công Mã Đại lý: ${newCode}.`
            });

            // Dispatch automated email via Nodemailer
            CargoStore.sendEmailNotification({
                type: 'REGISTRATION_APPROVED',
                to: reg.email,
                notifEmail: reg.notifEmail,
                agentCode: newCode,
                regData: reg
            });

            return {
                success: true,
                code: newCode,
                password: agentPwd,
                pin: agentPin,
                email: reg.email,
                companyName: reg.companyName,
                repName: reg.repName
            };
        },

        requestPasswordResetOtp: function (emailOrCode) {
            const data = loadData();
            const identifier = (emailOrCode || '').trim().toLowerCase();
            if (!identifier) {
                return { success: false, message: 'Vui lòng nhập Email hoặc Mã đại lý của bạn.' };
            }

            const agent = (data.agentsList || []).find(a =>
                (a.email || '').toLowerCase() === identifier ||
                (a.code || '').toLowerCase() === identifier ||
                (a.taxCode || '').toLowerCase() === identifier
            );

            if (!agent) {
                return { success: false, message: `Không tìm thấy tài khoản đại lý với thông tin "${emailOrCode}". Vui lòng kiểm tra lại Email đăng ký.` };
            }

            if (!agent.email) {
                return { success: false, message: `Tài khoản đại lý ${agent.code} chưa cập nhật địa chỉ Email. Vui lòng liên hệ Hotline 1900.6686 để được hỗ trợ.` };
            }

            // Anti-spam cooldown: prevent sending multiple emails within 30 seconds
            if (data.passwordResetOtps && data.passwordResetOtps[agent.code]) {
                const existing = data.passwordResetOtps[agent.code];
                const elapsedSec = Math.floor((Date.now() - (existing.createdAt || 0)) / 1000);
                if (elapsedSec < 30) {
                    const waitSec = 30 - elapsedSec;
                    return {
                        success: false,
                        rateLimited: true,
                        waitSec: waitSec,
                        message: `Hệ thống vừa gửi mã OTP đến email của bạn. Vui lòng đợi ${waitSec} giây nữa trước khi gửi lại.`
                    };
                }
            }

            // Generate 6-digit numeric OTP
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins

            if (!data.passwordResetOtps) data.passwordResetOtps = {};
            data.passwordResetOtps[agent.code] = {
                otp: otp,
                email: agent.email,
                expiresAt: expiresAt,
                createdAt: Date.now()
            };
            saveData(data);

            // Log activity
            this.logActivity({
                actor: agent.companyName || agent.repName || agent.code,
                username: agent.code,
                role: 'AGENT',
                actionCategory: 'Tài khoản',
                actionTitle: 'Yêu cầu mã OTP khôi phục mật khẩu',
                target: 'Email OTP',
                details: `Đại lý ${agent.code} (${agent.companyName}) đã yêu cầu gửi mã xác thực OTP qua email ${agent.email}.`
            });

            // Dispatch email notification via backend
            if (this.sendEmailNotification) {
                this.sendEmailNotification({
                    type: 'PASSWORD_RESET_OTP',
                    to: agent.email,
                    agentCode: agent.code,
                    agentName: agent.companyName || agent.repName || agent.code,
                    otp: otp,
                    expiresMinutes: 15
                });
            }

            // Mask email for privacy display: e.g. lo***@viettelpost.com.vn
            const parts = agent.email.split('@');
            let maskedEmail = agent.email;
            if (parts.length === 2) {
                const namePart = parts[0];
                const visibleLen = Math.min(2, namePart.length);
                maskedEmail = namePart.substring(0, visibleLen) + '••••' + '@' + parts[1];
            }

            return {
                success: true,
                message: `Mã OTP đã được gửi đến email ${maskedEmail}. Vui lòng kiểm tra hộp thư của bạn!`,
                agentCode: agent.code,
                email: agent.email,
                maskedEmail: maskedEmail,
                companyName: agent.companyName || agent.repName,
            };
        },

        verifyPasswordResetOtp: function (emailOrCode, otpInput) {
            const data = loadData();
            const identifier = (emailOrCode || '').trim().toLowerCase();
            const agent = (data.agentsList || []).find(a =>
                (a.email || '').toLowerCase() === identifier ||
                (a.code || '').toLowerCase() === identifier ||
                (a.taxCode || '').toLowerCase() === identifier
            );

            if (!agent) {
                return { success: false, message: 'Không tìm thấy thông tin tài khoản đại lý.' };
            }

            const record = (data.passwordResetOtps || {})[agent.code];
            const cleanOtp = String(otpInput || '').trim();

            if (!record) {
                return { success: false, message: 'Yêu cầu OTP đã hết hạn hoặc chưa được tạo. Vui lòng bấm "Gửi lại OTP".' };
            }

            if (Date.now() > record.expiresAt) {
                return { success: false, message: 'Mã xác nhận OTP đã hết hạn (quá 15 phút). Vui lòng yêu cầu mã OTP mới.' };
            }

            if (cleanOtp !== String(record.otp).trim()) {
                return { success: false, message: 'Mã xác nhận OTP không chính xác. Vui lòng kiểm tra lại hòm thư email.' };
            }

            // Mark OTP as verified
            record.verified = true;
            record.verifiedAt = Date.now();
            saveData(data);

            return {
                success: true,
                message: 'Xác thực mã OTP thành công!',
                agentCode: agent.code,
                companyName: agent.companyName || agent.repName,
                maskedEmail: agent.email
            };
        },

        resetPasswordWithOtp: function (emailOrCode, otpInput, newPassword) {
            const data = loadData();
            const identifier = (emailOrCode || '').trim().toLowerCase();
            const agent = (data.agentsList || []).find(a =>
                (a.email || '').toLowerCase() === identifier ||
                (a.code || '').toLowerCase() === identifier ||
                (a.taxCode || '').toLowerCase() === identifier
            );

            if (!agent) {
                return { success: false, message: 'Không tìm thấy thông tin tài khoản đại lý.' };
            }

            const record = (data.passwordResetOtps || {})[agent.code];
            const cleanOtp = String(otpInput || '').trim();

            if (!record) {
                return { success: false, message: 'Yêu cầu OTP đã hết hạn hoặc chưa được tạo. Vui lòng bấm "Gửi lại OTP".' };
            }

            if (Date.now() > record.expiresAt) {
                return { success: false, message: 'Mã xác nhận OTP đã hết hạn (quá 15 phút). Vui lòng yêu cầu mã OTP mới.' };
            }

            if (cleanOtp !== String(record.otp).trim()) {
                return { success: false, message: 'Mã xác nhận OTP không chính xác. Vui lòng kiểm tra lại email.' };
            }

            const pwd = String(newPassword || '').trim();
            if (pwd.length < 6) {
                return { success: false, message: 'Mật khẩu mới phải có tối thiểu 6 ký tự.' };
            }

            // Update agent password
            agent.password = pwd;
            if (data.currentUser && (data.currentUser.agentCode || '').toUpperCase() === (agent.code || '').toUpperCase()) {
                data.currentUser.password = pwd;
            }

            // Remove used OTP
            delete data.passwordResetOtps[agent.code];
            saveData(data);

            // Log activity
            this.logActivity({
                actor: agent.companyName || agent.repName || agent.code,
                username: agent.code,
                role: 'AGENT',
                actionCategory: 'Tài khoản',
                actionTitle: 'Đặt lại mật khẩu qua Email OTP',
                target: 'Mật khẩu',
                details: `Đại lý ${agent.companyName || agent.code} (${agent.code}) đã đổi mật khẩu thành công qua xác minh Email OTP.`
            });

            // Dispatch confirmation email
            if (this.sendEmailNotification) {
                this.sendEmailNotification({
                    type: 'PASSWORD_RESET_SUCCESS',
                    to: agent.email,
                    agentCode: agent.code,
                    agentName: agent.companyName || agent.repName || agent.code
                });
            }

            return {
                success: true,
                message: 'Đặt lại mật khẩu mới thành công! Quý khách có thể đăng nhập ngay vào hệ thống.',
                agentCode: agent.code,
                newPassword: pwd
            };
        },

        verifyPinAndGetPassword: function (agentCodeOrEmail, pinInput) {
            const data = loadData();
            const identifier = (agentCodeOrEmail || '').trim().toLowerCase();
            const agent = (data.agentsList || []).find(a =>
                (a.code || '').toLowerCase() === identifier ||
                (a.taxCode || '').toLowerCase() === identifier ||
                (a.email || '').toLowerCase() === identifier
            );

            if (!agent) {
                return { success: false, message: `Mã đại lý hoặc Email "${agentCodeOrEmail}" không tồn tại trên hệ thống.` };
            }

            if (!agent.pin) {
                return {
                    success: false,
                    hasNoPin: true,
                    message: `Tài khoản đại lý ${agent.code} chưa thiết lập Mã PIN bảo mật. Quý khách vui lòng liên hệ Tổng đài 1900.6686 hoặc email cargo@vietravelairlines.vn để được hỗ trợ cấp lại mật khẩu.`
                };
            }

            const expectedPin = String(agent.pin).trim();
            if (String(pinInput).trim() !== expectedPin) {
                return { success: false, message: `Mã PIN bảo mật (4 chữ số) không chính xác cho đại lý ${agent.code}!` };
            }

            return {
                success: true,
                password: agent.password || '12345678',
                agent: agent,
                agentCode: agent.code,
                companyName: agent.companyName || agent.repName || agent.code
            };
        },

        createOrUpdatePin: function (agentCode, newPin, currentPassword = '') {
            const data = loadData();
            const pinStr = String(newPin || '').trim();
            if (!/^[0-9]{4}$/.test(pinStr)) {
                return { success: false, message: 'Mã PIN bảo mật phải gồm đúng 4 chữ số (0-9).' };
            }
            const codeClean = (agentCode || '').trim().toUpperCase();
            const agent = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === codeClean);
            if (!agent) {
                return { success: false, message: 'Không tìm thấy thông tin đại lý tương ứng.' };
            }

            if (currentPassword && agent.password && agent.password !== currentPassword) {
                return { success: false, message: 'Mật khẩu tài khoản hiện tại không chính xác!' };
            }

            const isNewPin = !agent.pin;
            agent.pin = pinStr;
            agent.pinCreatedAt = Date.now();
            agent.pinUpdatedAt = Date.now();

            if (data.currentUser && (data.currentUser.agentCode || '').toUpperCase() === codeClean) {
                data.currentUser.pin = pinStr;
                data.currentUser.pinCreatedAt = agent.pinCreatedAt;
            }

            saveData(data);
            this.logActivity({
                actor: agent.companyName || agent.repName || agent.code,
                username: agent.code,
                role: 'AGENT',
                actionCategory: 'Tài khoản',
                actionTitle: isNewPin ? 'Tạo mới Mã PIN bảo mật' : 'Đổi Mã PIN bảo mật',
                target: 'Mã PIN',
                details: `Đại lý ${agent.companyName || agent.code} (${agent.code}) đã ${isNewPin ? 'tạo mới' : 'cập nhật'} thành công Mã PIN bảo mật 4 chữ số.`
            });

            return {
                success: true,
                message: isNewPin ? 'Khởi tạo Mã PIN bảo mật 4 chữ số thành công!' : 'Đổi Mã PIN bảo mật thành công!',
                pin: pinStr
            };
        },

        resetPasswordWithPin: function (agentCode, pinInput, newPassword) {
            const data = loadData();
            const codeClean = (agentCode || '').trim().toUpperCase();
            const agent = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === codeClean);
            if (!agent) {
                return { success: false, message: 'Không tìm thấy thông tin đại lý.' };
            }

            if (!agent.pin) {
                return { success: false, message: 'Tài khoản chưa thiết lập Mã PIN bảo mật. Vui lòng liên hệ Hotline 1900.6686.' };
            }

            if (String(agent.pin).trim() !== String(pinInput).trim()) {
                return { success: false, message: 'Mã PIN bảo mật không chính xác!' };
            }

            const pwd = String(newPassword || '').trim();
            if (pwd.length < 6) {
                return { success: false, message: 'Mật khẩu mới phải có tối thiểu 6 ký tự.' };
            }

            agent.password = pwd;
            if (data.currentUser && (data.currentUser.agentCode || '').toUpperCase() === codeClean) {
                data.currentUser.password = pwd;
            }

            saveData(data);
            this.logActivity({
                actor: agent.companyName || agent.repName || agent.code,
                username: agent.code,
                role: 'AGENT',
                actionCategory: 'Tài khoản',
                actionTitle: 'Đặt lại mật khẩu qua Mã PIN',
                target: 'Mật khẩu',
                details: `Đại lý ${agent.companyName || agent.code} (${agent.code}) đã đặt lại mật khẩu mới thành công qua xác minh Mã PIN.`
            });

            return { success: true, message: 'Đặt lại mật khẩu thành công! Quý khách có thể đăng nhập ngay với mật khẩu mới.' };
        },

        rejectRegistration: function (regId, reason) {
            const data = loadData();
            if (data.currentAdmin && data.currentAdmin.role === 'STAFF') {
                return { success: false, message: 'Nhân viên (STAFF) không có quyền từ chối hồ sơ đại lý. Thao tác này chỉ dành cho Quản trị viên (ADMIN).' };
            }
            const reg = (data.registrations || []).find(r => r.regId === regId);
            if (!reg) return { success: false, message: 'Không tìm thấy hồ sơ đăng ký tương ứng.' };

            const finalReason = (reason || '').trim() || 'Hồ sơ chưa đạt tiêu chuẩn theo quy chế xét duyệt đại lý';
            reg.status = 'REJECTED';
            reg.rejectionReason = finalReason;
            reg.rejectReason = finalReason;
            reg.rejectedAt = new Date().toISOString();

            // Add notification for admin audit
            if (!data.notifications) data.notifications = [];
            data.notifications.unshift({
                id: Date.now(),
                title: `Từ chối hồ sơ ${reg.regId}`,
                message: `Hồ sơ đại lý ${reg.companyName} đã bị từ chối. Lý do: "${finalReason}"`,
                time: 'Vừa xong',
                type: 'AGENT',
                unread: true,
                targetRole: 'ADMIN'
            });
            saveData(data);
            if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                fetch('/api/registration/reject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        regId: regId,
                        reason: finalReason,
                        rejectedBy: data.currentAdmin ? (data.currentAdmin.fullName || data.currentAdmin.username) : 'Admin'
                    })
                }).then(() => {
                    lastLocalSaveTimestamp = 0;
                    return syncWithServer(true);
                }).catch(() => { });
            }
            this.logActivity({
                actionCategory: 'Quản lý Đại lý',
                actionTitle: 'Từ chối hồ sơ Đăng ký',
                target: reg.companyName,
                details: `Từ chối hồ sơ đăng ký đại lý "${reg.companyName}" (${reg.regId}). Lý do từ chối: "${finalReason}".`
            });

            // Dispatch automated email via Nodemailer
            CargoStore.sendEmailNotification({
                type: 'REGISTRATION_REJECTED',
                to: reg.email,
                notifEmail: reg.notifEmail,
                reason: finalReason,
                regData: {
                    ...reg,
                    rejectionReason: finalReason,
                    rejectReason: finalReason
                }
            });

            return {
                success: true,
                message: `Đã từ chối hồ sơ ${regId} và gửi email thông báo lý do đến đại lý (${reg.email}) thành công!`,
                reg: reg
            };
        },

        maskEmail: function (email) {
            if (!email) return '';
            const parts = String(email).split('@');
            if (parts.length !== 2) return email;
            const namePart = parts[0];
            const visibleLen = Math.min(2, namePart.length);
            return namePart.substring(0, visibleLen) + '••••@' + parts[1];
        },

        requestAccountUnlockEmail: function (agentCodeOrEmail) {
            const data = loadData();
            const identifier = (agentCodeOrEmail || '').trim().toLowerCase();
            const agent = (data.agentsList || []).find(a =>
                (a.code || '').toLowerCase() === identifier ||
                (a.email || '').toLowerCase() === identifier ||
                (a.taxCode || '').toLowerCase() === identifier
            );
            if (!agent) {
                return { success: false, message: 'Không tìm thấy tài khoản đại lý trong hệ thống.' };
            }
            if (!agent.isLocked && agent.status !== 'Đã khóa') {
                return { success: false, message: `Tài khoản ${agent.code} hiện tại không bị khóa.` };
            }

            const unlockToken = 'ULK-' + Math.random().toString(36).substring(2, 10).toUpperCase();
            const unlockOtp = String(Math.floor(100000 + Math.random() * 900000));
            agent.unlockToken = unlockToken;
            agent.unlockOtp = unlockOtp;
            agent.unlockExpiresAt = Date.now() + 24 * 3600 * 1000;
            saveData(data);

            this.logActivity({
                actor: agent.companyName || agent.code,
                username: agent.code,
                role: 'AGENT',
                actionCategory: 'Bảo mật',
                actionTitle: 'Yêu cầu gửi lại email mở khóa tài khoản',
                target: 'Tài khoản Agent',
                details: `Đại lý ${agent.code} (${agent.companyName}) đã yêu cầu gửi lại email/OTP mở khóa tài khoản đến ${agent.email}.`
            });

            this.sendEmailNotification({
                type: 'ACCOUNT_LOCKED_5_FAILS',
                to: agent.email,
                agentCode: agent.code,
                agentName: agent.companyName || agent.repName || agent.code,
                unlockToken: unlockToken,
                unlockOtp: unlockOtp,
                lockedAt: new Date().toLocaleString('vi-VN')
            });

            const masked = this.maskEmail(agent.email);
            return {
                success: true,
                agentCode: agent.code,
                email: agent.email,
                maskedEmail: masked,
                unlockOtp: unlockOtp,
                unlockToken: unlockToken,
                message: `Đã gửi lại email hướng dẫn mở khóa đến hộp thư ${masked}.`
            };
        },

        unlockAccountWithOtp: function (agentCodeOrEmail, otpInput) {
            const data = loadData();
            const identifier = (agentCodeOrEmail || '').trim().toLowerCase();
            const agent = (data.agentsList || []).find(a =>
                (a.code || '').toLowerCase() === identifier ||
                (a.email || '').toLowerCase() === identifier ||
                (a.taxCode || '').toLowerCase() === identifier
            );
            if (!agent) {
                return { success: false, message: 'Không tìm thấy tài khoản đại lý.' };
            }
            if (!agent.unlockOtp) {
                return { success: false, message: 'Mã mở khóa chưa được tạo hoặc đã hết hạn. Vui lòng bấm "Gửi lại email mở khóa".' };
            }
            if (agent.unlockExpiresAt && Date.now() > agent.unlockExpiresAt) {
                return { success: false, message: 'Mã mở khóa đã hết hạn. Vui lòng yêu cầu gửi lại email mới.' };
            }
            if (String(otpInput || '').trim() !== String(agent.unlockOtp).trim()) {
                return { success: false, message: 'Mã OTP mở khóa không chính xác. Vui lòng kiểm tra lại hòm thư email.' };
            }

            // Success: Unlock account
            agent.isLocked = false;
            agent.status = 'Đang hoạt động';
            agent.failedLoginAttempts = 0;
            delete agent.lockedReason;
            delete agent.lockedAt;
            delete agent.unlockOtp;
            delete agent.unlockToken;
            delete agent.unlockExpiresAt;
            saveData(data);

            this.logActivity({
                actor: agent.companyName || agent.code,
                username: agent.code,
                role: 'AGENT',
                actionCategory: 'Bảo mật',
                actionTitle: 'Mở khóa tài khoản thành công qua OTP',
                target: 'Tài khoản Agent',
                details: `Đại lý ${agent.code} (${agent.companyName}) đã mở khóa tài khoản thành công bằng mã OTP nhận qua Email.`
            });

            return {
                success: true,
                agentCode: agent.code,
                companyName: agent.companyName,
                message: `Mở khóa tài khoản ${agent.code} thành công! Quý đại lý có thể đăng nhập ngay.`
            };
        },

        unlockAccountWithToken: function (agentCode, tokenInput) {
            const data = loadData();
            const code = (agentCode || '').trim().toUpperCase();
            const token = (tokenInput || '').trim().toUpperCase();
            const agent = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === code);
            if (!agent) {
                return { success: false, message: 'Không tìm thấy tài khoản đại lý.' };
            }
            if (!agent.unlockToken) {
                return { success: false, message: 'Liên kết mở khóa không hợp lệ hoặc tài khoản đã được mở khóa trước đó.' };
            }
            if (agent.unlockExpiresAt && Date.now() > agent.unlockExpiresAt) {
                return { success: false, message: 'Liên kết mở khóa đã hết hạn (quá 24 giờ). Vui lòng yêu cầu gửi lại email mới.' };
            }
            if (String(agent.unlockToken).toUpperCase() !== token) {
                return { success: false, message: 'Mã xác thực mở khóa không chính xác.' };
            }

            // Success: Unlock account
            agent.isLocked = false;
            agent.status = 'Đang hoạt động';
            agent.failedLoginAttempts = 0;
            delete agent.lockedReason;
            delete agent.lockedAt;
            delete agent.unlockOtp;
            delete agent.unlockToken;
            delete agent.unlockExpiresAt;
            saveData(data);

            this.logActivity({
                actor: agent.companyName || agent.code,
                username: agent.code,
                role: 'AGENT',
                actionCategory: 'Bảo mật',
                actionTitle: 'Mở khóa tài khoản thành công qua Link Email',
                target: 'Tài khoản Agent',
                details: `Đại lý ${agent.code} (${agent.companyName}) đã mở khóa tài khoản thành công qua đường dẫn xác thực gửi về Email.`
            });

            return {
                success: true,
                agentCode: agent.code,
                companyName: agent.companyName,
                message: `Tài khoản đại lý ${agent.code} đã được mở khóa thành công! Quý khách có thể đăng nhập ngay.`
            };
        },

        sendEmailNotification: async function (payload) {
            try {
                const res = await fetch('/api/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const json = await res.json();
                console.log('[CargoStore] Nodemailer dispatch:', json);
                return json;
            } catch (err) {
                console.warn('[CargoStore] Nodemailer error:', err);
                return { success: false, error: err.message };
            }
        },

        closeAllOpenAuctions: function (autoSeedIfEmpty = true) {
            const data = loadData();
            const openAuctions = (data.auctions || []).filter(a => a && a.status === 'OPEN');
            if (openAuctions.length === 0) {
                return { success: false, message: 'Hiện không có phiên đấu giá nào đang mở (OPEN) để chốt thầu.' };
            }

            let closedCount = 0;
            openAuctions.forEach(a => {
                const bids = (data.bids || []).filter(b => b.auctionId == a.id).sort((x, y) => Number(y.priceKg) - Number(x.priceKg));
                if (bids.length === 0 && autoSeedIfEmpty) {
                    const testAgent = (data.agentsList || []).find(ag => (ag.code || '').toUpperCase() === 'AG-0006') ||
                        (data.agentsList && data.agentsList[0]) ||
                        { code: 'AG-0006', companyName: 'Công ty CP Viettel Post' };
                    const bidPrice = Number(a.startingPriceKg) || 25000;
                    const testBid = {
                        id: Date.now() + Math.floor(Math.random() * 1000),
                        auctionId: a.id,
                        agentCode: testAgent.code,
                        agentName: testAgent.companyName,
                        priceKg: bidPrice,
                        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                        isAnonymous: true,
                        status: 'WON'
                    };
                    if (!data.bids) data.bids = [];
                    data.bids.unshift(testBid);
                    a.currentPriceKg = bidPrice;
                    a.winningPriceKg = bidPrice;
                    a.winnerAgentCode = testAgent.code;
                    a.winnerAgentName = testAgent.companyName;
                    a.bidsCount = 1;
                }
                saveData(data, true);
                const res = this.closeAuction(a.id);
                if (res && res.success !== false) {
                    closedCount++;
                }
            });

            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Tự động chốt tất cả phiên đang mở',
                target: 'Tất cả phiên OPEN',
                details: `Quản trị viên đã kích hoạt chốt thầu tức thì cho ${closedCount} phiên đấu giá để kiểm thử.`
            });

            return {
                success: true,
                message: `Đã tự động chốt thầu thành công ${closedCount} phiên đấu giá!\nCác phiên đã chuyển sang trạng thái "ĐÃ CHỐT" và sinh đơn hàng trong mục "Đơn trúng thầu" để kiểm thử.`,
                count: closedCount
            };
        },

        closeAuction: function (id, callerAdmin) {
            const data = loadData();
            const currentAdmin = callerAdmin || (this.getCurrentAdmin ? this.getCurrentAdmin() : data.currentAdmin);

            // KIỂM TRA PHÂN QUYỀN CHỐT THẦU: Yêu cầu vai trò AUCTION_SETTLEMENT hoặc ITD_ADMIN
            if (currentAdmin && !this.hasSettlementRole(currentAdmin)) {
                return {
                    success: false,
                    message: 'Quyền bị từ chối: Thao tác Chốt phiên & Auto-confirm thuộc thẩm quyền của Quản trị viên Chốt thầu (AUCTION SETTLEMENT) hoặc ITD Admin!'
                };
            }

            const auction = (data.auctions || []).find(a => a.id == id);
            if (!auction) return { success: false, message: 'Phiên đấu giá không tồn tại' };

            if (auction.status === 'CLOSED') {
                return { success: false, message: 'Phiên đấu giá này đã được đóng trước đó.' };
            }

            auction.status = 'CLOSED';
            auction.closedAt = new Date().toISOString();

            const sysSettings = data.settings || defaultData.settings || {};
            const configReviewMins = Number(sysSettings.reviewWindowMinutes) || 15;
            auction.reviewWindowMinutes = configReviewMins;

            // Find highest bid for this auction
            let bids = (data.bids || []).filter(b => b.auctionId == id).sort((a, b) => b.priceKg - a.priceKg);
            let highestBid = bids.length > 0 ? bids[0] : null;

            // Luôn kích hoạt thời gian điều chỉnh/đối soát khi đóng phiên để Admin có quyền xem xét, từ chối hoặc chốt
            auction.isFinalLocked = false;
            auction.reviewDeadline = new Date(Date.now() + (configReviewMins * 60 * 1000)).toISOString();

            // Khi đóng phiên mà không có đại lý nào đặt giá: không tự tạo bid giả, ghi nhận không có người trúng thầu
            if (!highestBid) {
                auction.winnerAgentCode = null;
                auction.winnerAgentName = null;
                auction.winningPriceKg = null;
                auction.winnerTotalAmountVND = 0;
            }

            if (highestBid) {
                highestBid.status = 'WON';
                auction.winnerAgentCode = highestBid.agentCode;
                auction.winnerAgentName = highestBid.agentName;
                auction.winningPriceKg = highestBid.priceKg;
                auction.winnerTotalAmountVND = highestBid.priceKg * auction.capacityKg;

                if (!data.wonAuctions) data.wonAuctions = [];
                let newWonItem = data.wonAuctions.find(w => w.auctionId == auction.id);
                if (newWonItem) {
                    newWonItem.agentCode = highestBid.agentCode;
                    newWonItem.agentName = highestBid.agentName;
                    newWonItem.flightNumber = auction.flightNumber;
                    newWonItem.route = auction.route;
                    newWonItem.priceKg = highestBid.priceKg;
                    newWonItem.totalAmountVND = highestBid.priceKg * auction.capacityKg;
                    newWonItem.paymentDeadline = calculatePaymentDeadline(auction, new Date());
                    newWonItem.paymentStatus = 'UNPAID';
                    newWonItem.paidAt = null;
                    newWonItem.notifiedAt = null;
                    newWonItem.cargoDeclaration = null;
                } else {
                    const now = new Date();
                    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
                    const payDeadline = calculatePaymentDeadline(auction, now);
                    newWonItem = {
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
                    data.wonAuctions.unshift(newWonItem);
                }

                // Dispatch automated AUCTION_WON email notification to winner
                const defaultTargetEmail = (data.currentUser && data.currentUser.email) ? data.currentUser.email : '';
                const winningAgentAccount = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === (highestBid.agentCode || '').toUpperCase());
                const winnerEmail = (winningAgentAccount && winningAgentAccount.email) ? winningAgentAccount.email : defaultTargetEmail;

                CargoStore.sendEmailNotification({
                    type: 'AUCTION_WON',
                    to: winnerEmail,
                    wonData: newWonItem,
                    auctionData: auction,
                    agentName: highestBid.agentName,
                    agentCode: highestBid.agentCode
                });

                if (!data.notifications) data.notifications = [];
                const closeNotifId = Date.now();
                data.notifications.unshift({
                    id: closeNotifId,
                    timestamp: closeNotifId,
                    targetAgentCode: highestBid.agentCode,
                    title: `🏆 CHÚC MỪNG! Phiên ${auction.flightNumber} đã chốt kết quả!`,
                    message: `Đại lý ${highestBid.agentName} (${highestBid.agentCode}) đã trúng thầu chuyến ${auction.flightNumber} (${auction.route}) mức giá ${formatCurrency(highestBid.priceKg)}/Kg. Phiên đấu giá đã hoàn tất thành công và ghi nhận bạn là người trúng thầu.`,
                    time: formatTimeAgo(closeNotifId),
                    type: 'WON',
                    read: false,
                    link: '07-WonAuction.html'
                });
            }

            saveData(data);
            const adminActor = (data.currentAdmin && (data.currentAdmin.fullName || data.currentAdmin.username))
                ? (data.currentAdmin.fullName || data.currentAdmin.username)
                : 'Ban Điều Hành';
            const adminUsername = (data.currentAdmin && data.currentAdmin.username) ? data.currentAdmin.username : 'admin';
            const adminRole = (data.currentAdmin && data.currentAdmin.role) ? data.currentAdmin.role : 'ADMIN';

            this.logActivity({
                actor: adminActor,
                username: adminUsername,
                role: adminRole,
                actionCategory: 'Phiên đấu giá',
                actionTitle: 'Chốt thầu / Đóng phiên đấu giá',
                target: auction.flightNumber,
                details: `Đóng phiên chuyến bay ${auction.flightNumber} (${auction.route}). ` +
                    (highestBid ? `Tự động xác nhận đại lý cao nhất: ${highestBid.agentName} (${highestBid.agentCode}), Giá: ${this.formatCurrency(highestBid.priceKg)}/Kg. Bắt đầu thời gian điều chỉnh (${configReviewMins} phút).` : 'Không có đại lý trúng thầu.')
            });
            return {
                success: true,
                auction: auction,
                message: `Đã chốt phiên thành công! Hệ thống tự động xác nhận đại lý cao nhất: ${highestBid ? highestBid.agentName : ''} (${this.formatCurrency(highestBid ? highestBid.priceKg : 0)}/Kg). Bắt đầu thời gian điều chỉnh ${configReviewMins} phút theo cấu hình.`
            };
        },

        // Kiểm tra xem phiên đấu giá có đang trong thời gian điều chỉnh hay không
        // Quy tắc: Khi phiên đã ĐÓNG, có đại lý tham gia đặt giá, chưa khóa chốt và thời hạn review còn hiệu lực
        isReviewPeriodActive: function (auction) {
            if (!auction || auction.status !== 'CLOSED') return false;
            if (auction.isFinalLocked === true) return false;

            const bids = this.getBidsForAuction ? this.getBidsForAuction(auction.id) : [];
            if (bids.length === 0) return false;

            // Kiểm tra thời hạn điều chỉnh (mặc định 15 phút)
            const sysSettings = this.getSystemSettings ? this.getSystemSettings() : {};
            const reviewMins = Number(auction.reviewWindowMinutes || sysSettings.reviewWindowMinutes) || 15;

            let deadlineMs = 0;
            if (auction.reviewDeadline) {
                deadlineMs = new Date(auction.reviewDeadline).getTime();
            } else {
                const baseTime = auction.closedAt || auction.endTime;
                if (baseTime) {
                    deadlineMs = new Date(baseTime).getTime() + (reviewMins * 60 * 1000);
                }
            }

            if (!deadlineMs || isNaN(deadlineMs)) return false;
            if (Date.now() >= deadlineMs) {
                auction.isFinalLocked = true;
                auction.finalLockedAt = auction.finalLockedAt || new Date().toISOString();
                return false;
            }
            return true;
        },

        // Lấy thông tin trạng thái hiển thị chuẩn hóa cho phiên đấu giá
        getAuctionStatusInfo: function (auction) {
            if (!auction) return { key: 'UNKNOWN', text: 'KHÔNG XÁC ĐỊNH', shortText: 'KHÔNG RÕ', badgeClass: 'bg-slate-100 text-slate-500 border-slate-300', icon: 'fa-circle', canReview: false };

            if (auction.status === 'OPEN') {
                return {
                    key: 'OPEN',
                    text: 'ĐANG MỞ ĐẤU GIÁ',
                    shortText: 'ĐANG MỞ',
                    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
                    icon: 'fa-signal',
                    canReview: false
                };
            }
            if (auction.status === 'UPCOMING') {
                return {
                    key: 'UPCOMING',
                    text: 'SẮP DIỄN RA',
                    shortText: 'SẮP DIỄN RA',
                    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
                    icon: 'fa-clock',
                    canReview: false
                };
            }
            if (auction.status === 'CANCELLED') {
                return {
                    key: 'CANCELLED',
                    text: 'ĐÃ HỦY',
                    shortText: 'ĐÃ HỦY',
                    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200',
                    icon: 'fa-xmark',
                    canReview: false
                };
            }
            if (auction.status === 'DELETED') {
                return {
                    key: 'DELETED',
                    text: 'ĐÃ XÓA',
                    shortText: 'ĐÃ XÓA',
                    badgeClass: 'bg-slate-100 text-slate-400 line-through border-slate-200',
                    icon: 'fa-trash-can',
                    canReview: false
                };
            }

            // Xử lý status CLOSED:
            const canReview = this.isReviewPeriodActive(auction);
            if (canReview) {
                return {
                    key: 'REVIEW',
                    text: 'THỜI GIAN ĐIỀU CHỈNH',
                    shortText: 'ĐIỀU CHỈNH',
                    badgeClass: 'bg-purple-50 text-purple-800 border-purple-300',
                    icon: 'fa-stopwatch',
                    canReview: true
                };
            }

            // Quy tắc: Cái nào không còn thời gian điều chỉnh thì status là ĐÃ ĐÓNG, nếu có thể thực hiện điều chỉnh thì mới để status THỜI GIAN ĐIỀU CHỈNH
            return {
                key: 'CLOSED',
                text: 'ĐÃ ĐÓNG',
                shortText: 'ĐÃ ĐÓNG',
                badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
                icon: 'fa-lock',
                canReview: false
            };
        },

        // Lấy bảng xếp hạng Top đại lý theo thứ tự giá từ cao xuống thấp & thứ tự tiếp nhận dự phòng
        getAuctionLeaderboard: function (auctionId) {
            const data = loadData();
            const auction = (data.auctions || []).find(a => a.id == auctionId);
            if (!auction) return [];

            const bids = (data.bids || []).filter(b => b.auctionId == auctionId);
            if (bids.length === 0) {
                if (auction.status === 'CLOSED' && !auction.isFinalLocked) {
                    auction.isFinalLocked = true;
                    auction.finalLockedAt = auction.closedAt || auction.endTime || new Date().toISOString();
                    saveData(data);
                }
                return [];
            }

            // Group by agentCode, lấy mức giá cao nhất mà mỗi đại lý đã đặt
            const agentMap = {};
            bids.forEach(b => {
                const code = (b.agentCode || '').toUpperCase();
                if (!agentMap[code] || Number(b.priceKg) > Number(agentMap[code].priceKg)) {
                    agentMap[code] = b;
                }
            });

            // Sắp xếp giảm dần theo priceKg, nếu bằng nhau thì ưu tiên thời gian nộp sớm hơn
            const sortedBids = Object.values(agentMap).sort((a, b) => {
                const diff = Number(b.priceKg) - Number(a.priceKg);
                if (diff !== 0) return diff;
                return (Number(a.timestamp || 0)) - (Number(b.timestamp || 0));
            });

            // Cấu hình thời gian xem xét / review window từ System Settings
            const sysSettings = data.settings || defaultData.settings || {};
            const configMinutes = Number(sysSettings.reviewWindowMinutes) || 15;
            const reviewMinutes = Number(auction.reviewWindowMinutes || configMinutes);
            auction.reviewWindowMinutes = reviewMinutes;

            if (auction.status === 'CLOSED') {
                const baseTimeStr = auction.closedAt || auction.endTime;
                if (!auction.closedAt && baseTimeStr) {
                    auction.closedAt = baseTimeStr;
                }
                if (!auction.reviewDeadline && baseTimeStr) {
                    auction.reviewDeadline = new Date(new Date(baseTimeStr).getTime() + (reviewMinutes * 60 * 1000)).toISOString();
                }
            }

            let isFinalLocked = false;
            if (auction.status === 'CLOSED') {
                const isExpiredByTime = auction.reviewDeadline
                    ? (Date.now() >= new Date(auction.reviewDeadline).getTime())
                    : false;

                isFinalLocked = Boolean(auction.isFinalLocked) || isExpiredByTime;
                if (isExpiredByTime && !auction.isFinalLocked) {
                    auction.isFinalLocked = true;
                    auction.finalLockedAt = new Date().toISOString();
                    saveData(data);
                }
            }

            // Danh sách các đại lý đã bị từ chối / reject
            const rejectedCodes = (auction.rejectedAgents || []).map(c => String(c).toUpperCase());
            if (auction.fallbackTransfers) {
                auction.fallbackTransfers.forEach(t => {
                    if (t.fromAgentCode && !rejectedCodes.includes(t.fromAgentCode.toUpperCase())) {
                        rejectedCodes.push(t.fromAgentCode.toUpperCase());
                    }
                });
            }

            // AUTO-CONFIRM: Tự động chọn đại lý cao nhất chưa bị reject làm người trúng thầu hiện tại
            let currentWinnerCode = (auction.winnerAgentCode || '').toUpperCase();
            if (!currentWinnerCode || rejectedCodes.includes(currentWinnerCode)) {
                const candidate = sortedBids.find(b => !rejectedCodes.includes((b.agentCode || '').toUpperCase()));
                if (candidate) {
                    currentWinnerCode = (candidate.agentCode || '').toUpperCase();
                    auction.winnerAgentCode = candidate.agentCode;
                    auction.winnerAgentName = candidate.agentName;
                    auction.winningPriceKg = Number(candidate.priceKg);
                    auction.winnerTotalAmountVND = Number(candidate.priceKg) * Number(auction.capacityKg);
                }
            }

            return sortedBids.map((b, idx) => {
                const code = (b.agentCode || '').toUpperCase();
                const ag = (data.agentsList || []).find(x => (x.agentCode || '').toUpperCase() === code) || {};
                
                const isRejected = rejectedCodes.includes(code) || b.status === 'REJECTED' || b.status === 'CANCELLED_UNPAID';
                const isCurrentCandidate = code === currentWinnerCode && !isRejected;

                return {
                    rank: idx + 1,
                    agentCode: b.agentCode,
                    agentName: b.agentName || ag.companyName || 'Đại lý',
                    repName: ag.repName || 'Đại diện ủy quyền',
                    phone: ag.phone || '0901 234 567',
                    email: ag.email || '-',
                    priceKg: Number(b.priceKg),
                    totalAmountVND: Number(b.priceKg) * Number(auction.capacityKg),
                    timestamp: b.timestamp,
                    time: b.time || formatTimeAgo(b.timestamp),
                    isCurrentCandidate: isCurrentCandidate,
                    isFinalLocked: isFinalLocked,
                    isFinalConfirmed: isFinalLocked && isCurrentCandidate,
                    isRejected: isRejected
                };
            });
        },

        // Khóa chốt kết quả chính thức (hết hạn thời gian hoặc chốt ngay) - Ẩn toàn bộ nút Reject
        lockAuctionReview: function (auctionId, isAutoSystem = false) {
            const data = loadData();
            const currentAdmin = this.getCurrentAdmin ? this.getCurrentAdmin() : data.currentAdmin;
            if (!isAutoSystem && currentAdmin && !this.hasSettlementRole(currentAdmin)) {
                const roleUpper = String(currentAdmin.role || '').toUpperCase();
                const isSuper = (currentAdmin.username || '').toLowerCase() === 'admin' || roleUpper === 'SUPER_ADMIN' || roleUpper === 'ADMIN';
                if (!isSuper) {
                    return { 
                        success: false, 
                        message: 'Quyền bị từ chối: Thao tác Khóa chốt phiên thuộc thẩm quyền của Quản trị viên Chốt thầu (AUCTION SETTLEMENT) hoặc ITD Admin!' 
                    };
                }
            }

            const auction = (data.auctions || []).find(a => a.id == auctionId);
            if (!auction) return { success: false, message: 'Không tìm thấy chuyến bay / phiên đấu giá.' };

            auction.isFinalLocked = true;
            auction.finalLockedAt = new Date().toISOString();
            auction.reviewDeadline = auction.finalLockedAt;

            // Xác định đại lý cao nhất và chốt thắng thầu chính thức
            const bids = (data.bids || []).filter(b => b.auctionId == auction.id).sort((a, b) => b.priceKg - a.priceKg);
            const highestBid = bids.length > 0 ? bids[0] : null;

            if (highestBid) {
                highestBid.status = 'WON';
                auction.winnerAgentCode = highestBid.agentCode;
                auction.winnerAgentName = highestBid.agentName;
                auction.winningPriceKg = highestBid.priceKg;
                auction.winnerTotalAmountVND = highestBid.priceKg * auction.capacityKg;

                // Sinh đơn trúng thầu wonAuctions nếu chưa có
                if (!data.wonAuctions) data.wonAuctions = [];
                let existingWon = data.wonAuctions.find(w => w.auctionId == auction.id);
                if (!existingWon) {
                    const _now = new Date();
                    const _pad = n => String(n).padStart(2, '0');
                    const dateStr = `${_now.getFullYear()}${_pad(_now.getMonth() + 1)}${_pad(_now.getDate())}`;
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
                        paymentDeadline: calculatePaymentDeadline(auction, _now),
                        paymentStatus: 'UNPAID',
                        paidAt: null,
                        notifiedAt: null,
                        awbNumber: `998-${Math.floor(10000000 + Math.random() * 90000000)}`,
                        cutOffTime: auction.cutOffTime || 'Hôm nay 18:00',
                        warehouse: 'Kho hàng SCSC / TCS Tân Sơn Nhất (Cửa số 4)',
                        cargoDeclaration: null
                    };
                    data.wonAuctions.unshift(existingWon);

                    if (!data.notifications) data.notifications = [];
                    data.notifications.unshift({
                        id: Date.now() + Math.floor(Math.random() * 1000),
                        timestamp: Date.now(),
                        targetAgentCode: highestBid.agentCode,
                        title: `🏆 CHÚC MỪNG! Bạn đã thắng thầu chuyến bay ${auction.flightNumber}`,
                        message: `Đại lý ${highestBid.agentName} (${highestBid.agentCode}) đã trúng thầu chính thức chuyến bay ${auction.flightNumber} (${auction.route}) với giá ${formatCurrency(highestBid.priceKg)}/Kg.`,
                        time: new Date().toLocaleString('vi-VN'),
                        type: 'WON',
                        read: false,
                        link: `07-WinnerManagement.html?wonId=${existingWon.wonId}`
                    });
                }
            }

            saveData(data);

            const adminActor = isAutoSystem ? 'Hệ Thống Tự Động' : ((currentAdmin && (currentAdmin.fullName || currentAdmin.username)) || 'Ban Quản Trị Chốt Thầu');
            const adminRole = isAutoSystem ? 'SYSTEM' : ((currentAdmin && (Array.isArray(currentAdmin.roles) ? currentAdmin.roles.join(', ') : currentAdmin.role)) || 'AUCTION_SETTLEMENT');

            this.logActivity({
                actor: adminActor,
                username: (currentAdmin && currentAdmin.username) || 'system',
                role: adminRole,
                actionCategory: 'Chốt thầu',
                actionTitle: 'Khóa kết quả trúng thầu chính thức',
                target: auction.flightNumber,
                details: `Đã khóa chính thức kết quả trúng thầu chuyến bay ${auction.flightNumber}. Toàn bộ chức năng Reject và điều chuyển đại lý đã được đóng hoàn tất.`
            });

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('cargostore_updated'));
            }

            return { 
                success: true, 
                message: `Đã khóa kết quả trúng thầu chính thức cho chuyến bay ${auction.flightNumber}! Toàn bộ chức năng Reject đã được đóng.` 
            };
        },

        // Cấu hình thời gian xem xét / review window (phút)
        setAuctionReviewWindow: function (auctionId, minutes) {
            const data = loadData();
            const currentAdmin = this.getCurrentAdmin ? this.getCurrentAdmin() : data.currentAdmin;
            if (currentAdmin && !this.hasSettlementRole(currentAdmin)) {
                return { 
                    success: false, 
                    message: 'Quyền bị từ chối: Thao tác cấu hình thời gian xem xét thuộc thẩm quyền của Quản trị viên Chốt thầu (AUCTION SETTLEMENT) hoặc ITD Admin!' 
                };
            }

            const auction = (data.auctions || []).find(a => a.id == auctionId);
            if (!auction) return { success: false, message: 'Không tìm thấy chuyến bay.' };

            const mins = Math.max(1, Number(minutes) || 15);
            auction.reviewWindowMinutes = mins;
            const baseTime = auction.closedAt ? new Date(auction.closedAt).getTime() : Date.now();
            auction.reviewDeadline = new Date(baseTime + (mins * 60 * 1000)).toISOString();
            auction.isFinalLocked = false;

            saveData(data);

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('cargostore_updated'));
            }

            return { success: true, message: `Đã cấu hình thời gian xem xét là ${mins} phút!` };
        },

        // Mở khóa lại xét duyệt (Unlock) nếu cần can thiệp lại
        unlockFinalWinner: function (auctionId) {
            const data = loadData();
            const currentAdmin = this.getCurrentAdmin ? this.getCurrentAdmin() : data.currentAdmin;
            if (currentAdmin && !this.hasSettlementRole(currentAdmin)) {
                return { 
                    success: false, 
                    message: 'Quyền bị từ chối: Thao tác mở khóa xem xét thuộc thẩm quyền của Quản trị viên Chốt thầu (AUCTION SETTLEMENT) hoặc ITD Admin!' 
                };
            }

            const auction = (data.auctions || []).find(a => a.id == auctionId);
            if (!auction) return { success: false, message: 'Không tìm thấy chuyến bay.' };
            
            auction.isFinalLocked = false;
            // Gia hạn thêm 15 phút tính từ thời điểm mở khóa
            const mins = Number(auction.reviewWindowMinutes) || 15;
            auction.closedAt = new Date().toISOString();
            auction.reviewDeadline = new Date(Date.now() + (mins * 60 * 1000)).toISOString();

            saveData(data);

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('cargostore_updated'));
            }
            return { success: true, message: 'Đã mở khóa lại phiên xem xét (gia hạn thêm 15 phút) để Quản trị viên tiếp tục điều chỉnh thao tác.' };
        },

        // Từ chối đại lý hiện tại (Reject) và tự động chuyển quyền cho đại lý kế tiếp
        // Phân quyền đặc trách riêng: AUCTION SETTLEMENT (hoặc ITD ADMIN), ghi audit log đầy đủ
        rejectAndPassToNextAgent: function (auctionId, agentCode, reason, note) {
            const data = loadData();
            const currentAdmin = this.getCurrentAdmin ? this.getCurrentAdmin() : data.currentAdmin;

            // KIỂM TRA PHÂN QUYỀN: AUCTION SETTLEMENT, COD ADMIN hoặc ITD ADMIN có thẩm quyền thay đổi đại lý thắng thầu!
            if (!this.hasSettlementRole(currentAdmin)) {
                return { 
                    success: false, 
                    message: 'Quyền bị từ chối: Thao tác thay đổi đại lý thắng thầu & điều chuyển thuộc thẩm quyền của Quản trị viên Chốt thầu (AUCTION SETTLEMENT / COD ADMIN) hoặc ITD Admin!' 
                };
            }

            const auction = (data.auctions || []).find(a => a.id == auctionId);
            if (!auction) return { success: false, message: 'Không tìm thấy chuyến bay.' };

            // Kiểm tra xem đã hết thời gian điều chỉnh cấu hình chưa
            const isLocked = auction.isFinalLocked || (auction.reviewDeadline && Date.now() >= new Date(auction.reviewDeadline).getTime());
            if (isLocked) {
                return {
                    success: false,
                    message: 'Phiên đấu giá đã hết thời gian điều chỉnh hoặc đã được chốt thầu chính thức. Chức năng thay đổi đại lý thắng thầu đã được đóng.'
                };
            }

            // Ghi nhận agentCode vào danh sách bị Reject
            auction.rejectedAgents = auction.rejectedAgents || [];
            if (!auction.rejectedAgents.includes(agentCode)) {
                auction.rejectedAgents.push(agentCode);
            }

            // Lấy danh sách đặt thầu để tìm đại lý kế tiếp
            const bids = (data.bids || []).filter(b => b.auctionId == auctionId);
            const agentMap = {};
            bids.forEach(b => {
                const c = (b.agentCode || '').toUpperCase();
                if (!agentMap[c] || Number(b.priceKg) > Number(agentMap[c].priceKg)) {
                    agentMap[c] = b;
                }
            });
            const sortedBids = Object.values(agentMap).sort((a, b) => Number(b.priceKg) - Number(a.priceKg));

            const rejectedCodes = auction.rejectedAgents.map(c => String(c).toUpperCase());
            const previousWinnerCode = agentCode;
            const previousBid = bids.find(b => (b.agentCode || '').toUpperCase() === (agentCode || '').toUpperCase());
            const previousWinnerName = previousBid ? previousBid.agentName : agentCode;
            const previousPrice = previousBid ? Number(previousBid.priceKg) : (auction.winningPriceKg || 0);

            // Tìm ứng viên kế tiếp có mức giá cao nhất chưa bị reject
            const nextCandidate = sortedBids.find(b => !rejectedCodes.includes((b.agentCode || '').toUpperCase()));
            if (!nextCandidate) {
                auction.winnerAgentCode = null;
                auction.winnerAgentName = null;
                auction.winningPriceKg = null;
                auction.winnerTotalAmountVND = 0;

                if (data.wonAuctions) {
                    data.wonAuctions = data.wonAuctions.filter(w => w.auctionId != auction.id);
                }

                saveData(data);
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('cargostore_updated'));
                }
                return { 
                    success: true, 
                    message: `Đã từ chối đại lý ${previousWinnerName}. Phiên đấu giá hiện không còn đại lý dự phòng nào khác.` 
                };
            }

            // Cập nhật Auction sang đại lý mới
            auction.winnerAgentCode = nextCandidate.agentCode;
            auction.winnerAgentName = nextCandidate.agentName;
            auction.winningPriceKg = Number(nextCandidate.priceKg);
            auction.winnerTotalAmountVND = Number(nextCandidate.priceKg) * Number(auction.capacityKg);

            // 1. GHI AUDIT LOG RIÊNG BIỆT CHO LẦN REJECT (AUDIT TRAIL)
            const now = new Date();
            const pad = n => String(n).padStart(2, '0');
            const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
            
            const rolesFormatted = (currentAdmin && Array.isArray(currentAdmin.roles)) ? currentAdmin.roles.join(', ') : ((currentAdmin && currentAdmin.role) || 'AUCTION_SETTLEMENT');

            const logEntry = {
                id: `REJ-${Date.now()}`,
                auctionId: auction.id,
                flightNumber: auction.flightNumber,
                actorName: (currentAdmin && currentAdmin.fullName) || 'Vũ Thẩm Định',
                actorUsername: (currentAdmin && currentAdmin.username) || 'settler01',
                actorRole: rolesFormatted,
                fromAgentCode: previousWinnerCode,
                fromAgentName: previousWinnerName,
                fromPriceKg: previousPrice,
                toAgentCode: nextCandidate.agentCode,
                toAgentName: nextCandidate.agentName,
                toPriceKg: Number(nextCandidate.priceKg),
                reason: reason || 'Đại lý không đáp ứng tiến độ yêu cầu',
                note: note || '',
                timestamp: now.toISOString(),
                formattedTime: timeStr,
                auditHash: 'SEC-SETTLE-' + Math.random().toString(36).substring(2, 9).toUpperCase()
            };

            auction.rejectAuditLogs = auction.rejectAuditLogs || [];
            auction.rejectAuditLogs.unshift(logEntry);

            // 2. Ghi nhật ký fallbackTransfers
            auction.fallbackTransfers = auction.fallbackTransfers || [];
            auction.fallbackTransfers.push({
                fromAgentCode: previousWinnerCode,
                fromAgentName: previousWinnerName,
                toAgentCode: nextCandidate.agentCode,
                toAgentName: nextCandidate.agentName,
                priceKg: Number(nextCandidate.priceKg),
                transferredAt: now.toISOString(),
                reason: reason || 'Từ chối đại lý trước và chuyển sang đại lý kế tiếp',
                actor: currentAdmin.fullName || 'Ban Điều Hành COD',
                role: currentAdmin.role || 'COD ADMIN'
            });

            // 3. Cập nhật Bids status
            bids.forEach(b => {
                if ((b.agentCode || '').toUpperCase() === (previousWinnerCode || '').toUpperCase()) {
                    b.status = 'CANCELLED_UNPAID';
                }
                if ((b.agentCode || '').toUpperCase() === (nextCandidate.agentCode || '').toUpperCase()) {
                    b.status = 'WON';
                }
            });

            // 4. Cập nhật WonAuctions
            if (!data.wonAuctions) data.wonAuctions = [];
            let wonItem = data.wonAuctions.find(w => w.auctionId == auction.id);
            const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
            if (wonItem) {
                wonItem.previousWinner = {
                    agentCode: previousWinnerCode,
                    agentName: previousWinnerName,
                    transferredAt: timeStr,
                    reason: reason || 'Từ chối đại lý trước và chuyển sang đại lý kế tiếp'
                };
                wonItem.agentCode = nextCandidate.agentCode;
                wonItem.agentName = nextCandidate.agentName;
                wonItem.priceKg = Number(nextCandidate.priceKg);
                wonItem.totalAmountVND = Number(nextCandidate.priceKg) * Number(auction.capacityKg);
                wonItem.paymentStatus = 'UNPAID';
                wonItem.paidAt = null;
                wonItem.isFallbackHandover = true;
            } else {
                wonItem = {
                    wonId: `WON-${dateStr}-${String(auction.id).padStart(2, '0')}`,
                    auctionId: auction.id,
                    agentCode: nextCandidate.agentCode,
                    agentName: nextCandidate.agentName,
                    flightNumber: auction.flightNumber,
                    route: auction.route,
                    capacityKg: auction.capacityKg,
                    priceKg: Number(nextCandidate.priceKg),
                    totalAmountVND: Number(nextCandidate.priceKg) * Number(auction.capacityKg),
                    paymentDeadline: 'Trước giờ bay 3 giờ',
                    paymentStatus: 'UNPAID',
                    paidAt: null,
                    isFallbackHandover: true
                };
                data.wonAuctions.unshift(wonItem);
            }

            saveData(data);

            // 5. GHI AUDIT LOG HỆ THỐNG TOÀN DIỆN (hiển thị trên trang 10-AuditLogs.html)
            const executorRoles = (currentAdmin && Array.isArray(currentAdmin.roles)) ? currentAdmin.roles.join(', ') : ((currentAdmin && currentAdmin.role) || 'COD_ADMIN');
            this.logActivity({
                actor: (currentAdmin && currentAdmin.fullName) || 'Vũ Thẩm Định',
                username: (currentAdmin && currentAdmin.username) || 'cod_admin',
                role: executorRoles,
                actionCategory: 'Chốt thầu & Điều chuyển',
                actionTitle: 'Thay đổi đại lý thắng thầu & Tự động chuyển dự phòng',
                target: auction.flightNumber,
                details: `[${executorRoles}] ${(currentAdmin && currentAdmin.fullName) || 'Quản trị viên'} đã hủy tư cách thắng thầu của đại lý ${previousWinnerName} (${previousWinnerCode}, mức giá ${this.formatCurrency(previousPrice)}/Kg). Hệ thống tự động chuyển quyền trúng thầu cho đại lý kế tiếp: ${nextCandidate.agentName} (${nextCandidate.agentCode}, mức giá ${this.formatCurrency(nextCandidate.priceKg)}/Kg). Lý do: ${reason}. Ghi chú kiểm toán: ${note || 'Không có'}.`
            });

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('cargostore_updated'));
            }

            return {
                success: true,
                message: `Đã thay đổi đại lý thắng thầu. Hủy tư cách của đại lý ${previousWinnerName} và tự động chuyển quyền thắng thầu sang đại lý kế tiếp: ${nextCandidate.agentName} (${nextCandidate.agentCode}) với mức giá ${this.formatCurrency(nextCandidate.priceKg)}/Kg!`,
                newWinner: nextCandidate
            };
        },

        // Tiện ích: Tạo 3-4 đại lý đặt thầu mẫu cho chuyến bay để kiểm thử xếp hạng & chuyển thầu
        seedDemoBidsForAuction: function (auctionId) {
            return { success: false, message: 'Chức năng tạo dữ liệu mẫu đã được gỡ bỏ' };
            const data = loadData();
            const auction = (data.auctions || []).find(a => a.id == auctionId);
            if (!auction) return { success: false, message: 'Chuyến bay không tồn tại' };

            const basePrice = Number(auction.startingPriceKg || 20000);
            const step = Number(auction.minStep || 500);

            const demoAgents = [
                { code: 'AG-0892', name: 'Công ty TNHH Vận tải ABC Logistics', stepMul: 5 },
                { code: 'AG-1044', name: 'Công ty Cổ phần Giao nhận Tân Sơn Nhất', stepMul: 4 },
                { code: 'AG-2309', name: 'Công ty TNHH Quốc tế Đông Dương Logistics', stepMul: 2 },
                { code: 'AG-3821', name: 'Công ty CP Tiếp vận Hàng không Việt Á', stepMul: 1 }
            ];

            if (!data.bids) data.bids = [];
            data.bids = data.bids.filter(b => b.auctionId != auctionId);

            // Reset auction rejection and confirmed state for fresh demo
            auction.rejectedAgents = [];
            auction.fallbackTransfers = [];
            auction.rejectAuditLogs = [];
            auction.isFinalLocked = false;
            auction.isFinalConfirmed = false;
            auction.reviewWindowMinutes = 15;
            auction.closedAt = new Date().toISOString();
            auction.reviewDeadline = new Date(Date.now() + (15 * 60 * 1000)).toISOString();

            const now = Date.now();
            demoAgents.forEach((ag, i) => {
                const bidPrice = basePrice + ag.stepMul * step;
                data.bids.push({
                    id: 'BID-' + (now - (i * 120000)),
                    timestamp: now - (i * 120000),
                    auctionId: auction.id,
                    flightCode: auction.flightCode,
                    agentCode: ag.code,
                    agentName: ag.name,
                    priceKg: bidPrice,
                    weightKg: auction.capacityKg,
                    time: `${(i + 1) * 3} phút trước`,
                    status: i === 0 ? 'WON' : 'SUBMITTED'
                });
            });

            // Set Top 1 as winner (Auto-confirm highest bidder)
            const topBid = data.bids.find(b => b.auctionId == auction.id && b.agentCode === 'AG-0892');
            if (topBid) {
                auction.currentPriceKg = topBid.priceKg;
                auction.winnerAgentCode = topBid.agentCode;
                auction.winnerAgentName = topBid.agentName;
                auction.winningPriceKg = topBid.priceKg;
                auction.winnerTotalAmountVND = topBid.priceKg * auction.capacityKg;
                auction.status = 'CLOSED';

                if (!data.wonAuctions) data.wonAuctions = [];
                let wonItem = data.wonAuctions.find(w => w.auctionId == auction.id);
                const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                if (wonItem) {
                    wonItem.agentCode = topBid.agentCode;
                    wonItem.agentName = topBid.agentName;
                    wonItem.priceKg = topBid.priceKg;
                    wonItem.totalAmountVND = topBid.priceKg * auction.capacityKg;
                    wonItem.paymentStatus = 'UNPAID';
                    wonItem.isFallbackHandover = false;
                }
            }

            saveData(data);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('cargostore_updated'));
            }
        },

        confirmPayment: function (wonId) {
            const data = loadData();
            if (!data.wonAuctions) data.wonAuctions = [];
            const item = data.wonAuctions.find(w => w.wonId === wonId);
            if (!item) {
                return { success: false, message: `Không tìm thấy đơn thắng thầu "${wonId}".` };
            }

            item.paymentStatus = 'PAID';
            item.paidAt = new Date().toLocaleString('vi-VN');
            item.lockWaivedByAdmin = true;

            // Check if agent has any remaining unpaid overdue orders; if none, restore status
            const targetCode = (item.agentCode || '').toUpperCase();
            const agentAccount = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === targetCode);
            if (agentAccount && (agentAccount.status === 'Đã khóa' || agentAccount.status === 'LOCKED')) {
                const hasRemainingOverdue = (data.wonAuctions || []).some(w =>
                    (w.agentCode || '').toUpperCase() === targetCode &&
                    w.wonId !== item.wonId &&
                    w.paymentStatus !== 'PAID' &&
                    w.paymentStatus !== 'PENDING_VERIFICATION' &&
                    !w.lockWaivedByAdmin &&
                    isWonAuctionExpired(w, data)
                );
                if (!hasRemainingOverdue) {
                    agentAccount.status = 'Đang hoạt động';
                    delete agentAccount.lockedReason;
                    delete agentAccount.lockedAt;
                }
            }

            // Find agent email to dispatch PAYMENT_CONFIRMED email
            const defaultTargetEmail = (data.currentUser && data.currentUser.email) ? data.currentUser.email : '';
            const targetEmail = (agentAccount && agentAccount.email) ? agentAccount.email : defaultTargetEmail;

            CargoStore.sendEmailNotification({
                type: 'PAYMENT_CONFIRMED',
                to: targetEmail,
                wonData: item
            });

            // Create system notification for agent
            if (!data.notifications) data.notifications = [];
            data.notifications.unshift({
                id: Date.now(),
                targetAgentCode: item.agentCode,
                title: `Xác nhận thanh toán đơn ${item.wonId} thành công!`,
                message: `Ban Điều hành đã xác nhận nhận đủ ${formatCurrency(item.totalAmountVND)} cho đơn hàng chuyến ${item.flightNumber} (${item.route}). Mã AWB: ${item.awbNumber}.`,
                time: 'Vừa xong',
                type: 'SYSTEM',
                read: false,
                link: '07-WonAuction.html'
            });

            saveData(data);
            this.logActivity({
                actionCategory: 'Thanh toán',
                actionTitle: 'Xác nhận thanh toán đơn thầu',
                target: item.wonId || wonId,
                details: `Xác nhận nhận thanh toán thành công cho đơn thắng thầu ${item.wonId} (${item.agentName} - ${item.flightNumber}). Số tiền: ${this.formatCurrency(item.totalAmountVND || 0)}.`
            });
            return { success: true, message: `Đã xác nhận nhận thanh toán thành công cho đơn ${wonId}! Email thông báo đã tự động gửi đến đại lý.`, item: item };
        },

        rejectPayment: function (wonId, reason) {
            const data = loadData();
            if (!data.wonAuctions) data.wonAuctions = [];
            const item = data.wonAuctions.find(w => w.wonId === wonId);
            if (!item) {
                return { success: false, message: `Không tìm thấy đơn thắng thầu "${wonId}".` };
            }

            const rejReason = (reason || '').trim() || 'Biên lai chuyển khoản hoặc mã giao dịch không hợp lệ / không khớp sao kê ngân hàng.';

            item.paymentStatus = 'UNPAID';
            item.notifiedAt = null;

            if (!item.paymentProof) item.paymentProof = {};
            item.paymentProof.status = 'REJECTED';
            item.paymentProof.rejectionReason = rejReason;
            item.paymentProof.rejectedAt = new Date().toLocaleString('vi-VN');

            // Find agent email to dispatch PAYMENT_REJECTED email
            const targetCode = (item.agentCode || '').toUpperCase();
            const agentAccount = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === targetCode);
            const defaultTargetEmail = (data.currentUser && data.currentUser.email) ? data.currentUser.email : '';
            const targetEmail = (agentAccount && agentAccount.email) ? agentAccount.email : defaultTargetEmail;

            CargoStore.sendEmailNotification({
                type: 'PAYMENT_REJECTED',
                to: targetEmail,
                wonData: item,
                reason: rejReason
            });

            // Create system notification for agent
            if (!data.notifications) data.notifications = [];
            data.notifications.unshift({
                id: Date.now(),
                targetAgentCode: item.agentCode,
                title: `⚠️ Biên lai thanh toán đơn ${item.wonId} bị từ chối`,
                message: `Ban Điều hành đã từ chối biên lai thanh toán cho đơn hàng ${item.wonId} (Chuyến bay ${item.flightNumber} - ${item.route}). Lý do: "${rejReason}". Vui lòng kiểm tra và nộp lại biên lai mới.`,
                time: 'Vừa xong',
                type: 'SYSTEM',
                read: false,
                link: '07-WonAuction.html'
            });

            saveData(data);
            this.logActivity({
                actionCategory: 'Thanh toán',
                actionTitle: 'Từ chối biên lai thanh toán',
                target: item.wonId || wonId,
                details: `Từ chối biên lai thanh toán đơn thắng thầu ${item.wonId} (${item.agentName}). Lý do: "${rejReason}".`
            });
            return {
                success: true,
                message: `Đã từ chối biên lai thanh toán cho đơn ${wonId}! Email yêu cầu nộp lại biên lai đã tự động gửi đến đại lý (${item.agentCode}).`,
                item: item
            };
        },

        notifyPaymentSent: function (wonId, paymentDetails = {}) {
            const data = loadData();
            if (!data.wonAuctions) data.wonAuctions = [];
            const item = data.wonAuctions.find(w => w.wonId === wonId);
            if (!item) {
                return { success: false, message: `Không tìm thấy đơn thắng thầu "${wonId}".` };
            }

            if (this.isWonAuctionExpired(item)) {
                return { success: false, message: `Đơn hàng "${wonId}" đã quá hạn thanh toán / Cut-off và đã bị hủy bởi hệ thống. Không thể gửi thông báo chuyển khoản.` };
            }

            const bankCfg = data.bankConfig || defaultData.bankConfig;
            const memo = paymentDetails.memo || this.generatePaymentMemo(item.wonId, item.agentCode);
            const transferredAmount = Number(paymentDetails.transferredAmount) || item.totalAmountVND || 0;
            const transactionRef = (paymentDetails.transactionRef || '').trim();
            const proofImageUrl = paymentDetails.proofImageUrl || null;
            const note = (paymentDetails.note || '').trim();
            const bankName = paymentDetails.bankName || bankCfg.bankName;

            if (!transactionRef) {
                return { success: false, message: 'Vui lòng nhập Mã giao dịch / Số FT ngân hàng (Bắt buộc).' };
            }
            if (!proofImageUrl) {
                return { success: false, message: 'Vui lòng tải ảnh chụp biên lai / ủy nhiệm chi chuyển khoản (Bắt buộc).' };
            }

            item.paymentStatus = 'PENDING_VERIFICATION';
            item.notifiedAt = new Date().toLocaleString('vi-VN');
            item.paymentProof = {
                memo: memo,
                transactionRef: transactionRef,
                proofImageUrl: proofImageUrl,
                note: note,
                transferredAmount: transferredAmount,
                bankName: bankName,
                submittedAt: new Date().toLocaleString('vi-VN')
            };

            // 1. Create notification for Admin reconciliation (Targeted to ADMIN only)
            if (!data.notifications) data.notifications = [];
            data.notifications.unshift({
                id: Date.now() + Math.floor(Math.random() * 1000),
                timestamp: Date.now(),
                targetRole: 'ADMIN',
                targetAgentCode: null, // Admin & Staff visible only
                title: `💳 ĐẠI LÝ BÁO CHUYỂN KHOẢN: Đơn ${item.wonId}`,
                message: `Đại lý ${item.agentCode} (${item.agentName || 'ABC Logistics'}) đã báo chuyển khoản ${this.formatCurrency(transferredAmount)} cho đơn ${item.wonId} (Chuyến ${item.flightNumber}). Cú pháp: [${memo}]${transactionRef ? ` | Mã GD: ${transactionRef}` : ''}. Vui lòng đối soát sao kê ngân hàng và xác nhận.`,
                time: 'Vừa xong',
                type: 'PAYMENT',
                read: false,
                wonId: item.wonId,
                link: `03-AuctionList.html?tab=won&search=${item.wonId}&reconcile=${item.wonId}`
            });

            // 2. Create notification for the paying agent themselves
            data.notifications.unshift({
                id: Date.now() + 1,
                timestamp: Date.now(),
                targetAgentCode: item.agentCode,
                title: `Đã gửi thông tin chuyển khoản: Đơn ${item.wonId}`,
                message: `Bạn đã gửi thông báo chuyển khoản ${this.formatCurrency(transferredAmount)} cho đơn ${item.wonId} (Chuyến ${item.flightNumber}). Ban Điều hành đang kiểm tra sao kê ngân hàng và sẽ duyệt đơn trong ít phút.`,
                time: 'Vừa xong',
                type: 'PAYMENT',
                read: false,
                wonId: item.wonId,
                link: `07-WonAuction.html?search=${item.wonId}`
            });

            saveData(data);

            // 3. Log payment activity to Audit Trail
            const curUser = data.currentUser;
            const payingAgent = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === (item.agentCode || '').toUpperCase());
            const actorName = (curUser && (curUser.companyName || curUser.fullName || curUser.agentName || curUser.username)) || (payingAgent && payingAgent.companyName) || item.agentName || 'Đại lý';
            const actorCode = (curUser && (curUser.agentCode || curUser.code || curUser.username)) || item.agentCode || 'AGENT';
            const actorRole = (curUser && curUser.role) || 'AGENT';

            this.logActivity({
                actor: actorName,
                username: actorCode,
                role: actorRole,
                actionCategory: 'Thanh toán',
                actionTitle: 'Đại lý báo chuyển khoản',
                target: item.wonId || wonId,
                details: `Đại lý ${actorName} (${actorCode}) đã gửi thông báo chuyển khoản ${this.formatCurrency(transferredAmount)} cho đơn thắng thầu ${item.wonId} (Chuyến ${item.flightNumber}). Cú pháp: [${memo}]${transactionRef ? ` | Mã GD: ${transactionRef}` : ''}.`
            });

            // 4. Trigger background email dispatch to Admin/Finance
            try {
                const adminEmail = (data.systemConfig && data.systemConfig.supportEmail) || (data.emailConfig && data.emailConfig.auth && data.emailConfig.auth.user) || 'cargo-agent@airline.vn';
                this.sendEmailNotification({
                    type: 'PAYMENT_SUBMITTED_ADMIN',
                    to: adminEmail,
                    paymentData: {
                        wonId: item.wonId,
                        agentCode: item.agentCode,
                        agentName: (payingAgent && payingAgent.companyName) || item.agentName || 'Đại lý',
                        flightNumber: item.flightNumber,
                        route: item.route,
                        transferredAmount: transferredAmount,
                        memo: memo,
                        transactionRef: transactionRef,
                        proofImageUrl: proofImageUrl,
                        submittedAt: item.paymentProof.submittedAt
                    }
                });
            } catch (err) {
                console.warn('[CargoStore] Failed to send admin payment alert email:', err);
            }

            return {
                success: true,
                message: `Đã gửi thông báo chuyển khoản đơn ${wonId} thành công! Ban Điều hành sẽ kiểm tra sao kê ngân hàng và xác nhận trong ít phút.`,
                item: item
            };
        },

        submitRefundBankInfo: function (wonId, refundData = {}) {
            const data = loadData();
            if (!data.wonAuctions) data.wonAuctions = [];
            const item = data.wonAuctions.find(w => w.wonId === wonId);
            if (!item) {
                return { success: false, message: `Không tìm thấy đơn thắng thầu "${wonId}".` };
            }

            const bankName = (refundData.bankName || '').trim();
            const accountNumber = (refundData.accountNumber || '').trim();
            const accountName = (refundData.accountName || '').trim();
            const agentNote = (refundData.agentNote || '').trim();

            if (!bankName || !accountNumber || !accountName) {
                return { success: false, message: 'Vui lòng điền đầy đủ thông tin: Tên ngân hàng, Số tài khoản, Chủ tài khoản.' };
            }

            item.refundBankInfo = {
                bankName: bankName,
                accountNumber: accountNumber,
                accountName: accountName,
                agentNote: agentNote,
                submittedAt: new Date().toLocaleString('vi-VN')
            };
            item.refundStatus = 'PENDING';

            if (!data.notifications) data.notifications = [];
            data.notifications.unshift({
                id: Date.now(),
                targetRole: 'ADMIN',
                title: `💸 ĐẠI LÝ GỬI THÔNG TIN HOÀN TIỀN: Đơn ${item.wonId}`,
                message: `Đại lý ${item.agentCode} (${item.agentName || 'Đại lý'}) đã cung cấp tài khoản nhận tiền hoàn: ${bankName} - STK: ${accountNumber} (${accountName}) cho đơn ${item.wonId}.`,
                time: 'Vừa xong',
                type: 'REFUND_REQUEST',
                read: false,
                wonId: item.wonId,
                link: `03-AuctionList.html?tab=refund&refund=${item.wonId}`
            });

            saveData(data);

            const curUser = data.currentUser;
            const payingAgent = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === (item.agentCode || '').toUpperCase());
            const actorName = (curUser && (curUser.companyName || curUser.fullName || curUser.agentName || curUser.username)) || (payingAgent && payingAgent.companyName) || item.agentName || 'Đại lý';
            const actorCode = (curUser && (curUser.agentCode || curUser.code || curUser.username)) || item.agentCode || 'AGENT';
            const actorRole = (curUser && curUser.role) || 'AGENT';

            this.logActivity({
                actor: actorName,
                username: actorCode,
                role: actorRole,
                actionCategory: 'Thanh toán',
                actionTitle: 'Điền thông tin hoàn tiền',
                target: item.wonId || wonId,
                details: `Đại lý ${actorName} (${actorCode}) đã đăng ký tài khoản nhận tiền hoàn cho đơn ${item.wonId}: ${bankName} - STK: ${accountNumber} (Chủ TK: ${accountName}).`
            });

            return {
                success: true,
                message: `Đã ghi nhận thông tin tài khoản nhận tiền hoàn cho đơn ${wonId} thành công!`,
                item: item
            };
        },

        updateCargoDeclaration: function (wonId, cargoData) {
            const data = loadData();
            if (!data.wonAuctions) data.wonAuctions = [];
            const item = data.wonAuctions.find(w => w.wonId === wonId);
            if (!item) {
                return { success: false, message: `Không tìm thấy đơn thắng thầu "${wonId}".` };
            }

            if (this.isWonAuctionExpired(item)) {
                return { success: false, message: `Đơn hàng "${wonId}" đã quá hạn thanh toán / Cut-off và đã bị hủy. Không thể cập nhật thông tin hàng hóa.` };
            }

            item.cargoDeclaration = {
                cargoType: cargoData.cargoType || 'Hàng bưu kiện / Thương mại điện tử',
                cargoName: cargoData.cargoName || '',
                piecesCount: Number(cargoData.piecesCount) || 1,
                grossWeightKg: Number(cargoData.grossWeightKg) || 0,
                volumeCbm: Number(cargoData.volumeCbm) || 0,
                hawbNumber: cargoData.hawbNumber || '',
                shipperName: cargoData.shipperName || '',
                consigneeName: cargoData.consigneeName || '',
                consigneeAddress: cargoData.consigneeAddress || '',
                specialNotes: cargoData.specialNotes || '',
                dgrDocName: cargoData.dgrDocName || null,
                dgrDocUrl: cargoData.dgrDocUrl || null,
                dgrDocSize: cargoData.dgrDocSize || null,
                dgrDocUploadedAt: cargoData.dgrDocUploadedAt || null,
                updatedAt: new Date().toLocaleString('vi-VN')
            };

            saveData(data);

            const curUser = data.currentUser;
            const payingAgent = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === (item.agentCode || '').toUpperCase());
            const actorName = (curUser && (curUser.companyName || curUser.fullName || curUser.agentName || curUser.username)) || (payingAgent && payingAgent.companyName) || item.agentName || 'Đại lý';
            const actorCode = (curUser && (curUser.agentCode || curUser.code || curUser.username)) || item.agentCode || 'AGENT';
            const actorRole = (curUser && curUser.role) || 'AGENT';

            this.logActivity({
                actor: actorName,
                username: actorCode,
                role: actorRole,
                actionCategory: 'Khai báo hàng hóa',
                actionTitle: 'Cập nhật Khai báo Vận đơn',
                target: item.wonId || wonId,
                details: `Cập nhật thông tin vận đơn AWB / hàng hóa cho đơn thắng thầu ${item.wonId} (${actorName}). Loại hàng: ${item.cargoDeclaration.cargoType}, Trọng lượng: ${item.cargoDeclaration.grossWeightKg} kg.`
            });
            return {
                success: true,
                message: `Đã cập nhật thông tin hàng hóa vận chuyển cho đơn ${wonId} thành công!`,
                cargoDeclaration: item.cargoDeclaration
            };
        },

        changePassword: function (oldPassword, newPassword) {
            const data = loadData();
            const user = data.currentUser;
            if (!user) {
                return { success: false, message: 'Bạn chưa đăng nhập tài khoản!' };
            }

            let agentsList = data.agentsList || seedAgents;
            let agent = agentsList.find(a => (a.code || '').toUpperCase() === (user.agentCode || '').toUpperCase());
            if (!agent) {
                return { success: false, message: 'Không tìm thấy thông tin tài khoản đại lý.' };
            }

            const currentPwd = agent.password || user.password || '12345678';
            if (oldPassword !== currentPwd) {
                return { success: false, message: 'Mật khẩu hiện tại không chính xác!' };
            }

            const trimmedNewPwd = (newPassword || '').trim();
            if (!trimmedNewPwd || trimmedNewPwd.length < 6) {
                return { success: false, message: 'Mật khẩu mới phải có độ dài từ 6 ký tự trở lên!' };
            }

            if (trimmedNewPwd === currentPwd) {
                return { success: false, message: 'Mật khẩu mới không được trùng với mật khẩu hiện tại!' };
            }

            // Update in agent record in agentsList
            agent.password = trimmedNewPwd;
            const agentIdx = agentsList.findIndex(a => (a.code || '').toUpperCase() === (user.agentCode || '').toUpperCase());
            if (agentIdx !== -1) {
                agentsList[agentIdx].password = trimmedNewPwd;
            }
            data.agentsList = agentsList;

            // Update in currentUser
            data.currentUser.password = trimmedNewPwd;

            saveData(data);
            return { success: true, message: 'Đổi mật khẩu thành công! Mật khẩu mặc định/cũ đã bị vô hiệu hóa hoàn toàn.' };
        },

        changeAdminPassword: function (oldPassword, newPassword) {
            const data = loadData();
            const admin = data.currentAdmin;
            if (!admin) {
                return { success: false, message: 'Bạn chưa đăng nhập tài khoản Quản trị!' };
            }

            let adminsList = data.adminsList || seedAdmins;
            let adminRec = adminsList.find(a => (a.username || '').toLowerCase() === (admin.username || '').toLowerCase());
            if (!adminRec) {
                return { success: false, message: 'Không tìm thấy thông tin admin.' };
            }

            const currentPwd = adminRec.password || admin.password || 'admin2026';
            if (oldPassword !== currentPwd) {
                return { success: false, message: 'Mật khẩu hiện tại không chính xác!' };
            }

            const trimmedNewPwd = (newPassword || '').trim();
            if (!trimmedNewPwd || trimmedNewPwd.length < 6) {
                return { success: false, message: 'Mật khẩu mới phải có độ dài từ 6 ký tự trở lên!' };
            }

            if (trimmedNewPwd === currentPwd) {
                return { success: false, message: 'Mật khẩu mới không được trùng với mật khẩu hiện tại!' };
            }

            adminRec.password = trimmedNewPwd;
            const adminIdx = adminsList.findIndex(a => (a.username || '').toLowerCase() === (admin.username || '').toLowerCase());
            if (adminIdx !== -1) {
                adminsList[adminIdx].password = trimmedNewPwd;
            }
            data.adminsList = adminsList;

            data.currentAdmin.password = trimmedNewPwd;

            saveData(data);
            this.logActivity({
                actor: admin.fullName || admin.username,
                username: admin.username,
                role: admin.role || 'ADMIN',
                actionCategory: 'Tài khoản',
                actionTitle: 'Đổi mật khẩu Quản trị',
                target: admin.username,
                details: `Tài khoản ${admin.role || 'ADMIN'} ${admin.fullName} (@${admin.username}) đã thay đổi mật khẩu đăng nhập thành công.`
            });
            return { success: true, message: 'Đổi mật khẩu Admin thành công! Mật khẩu mặc định/cũ đã bị vô hiệu hóa.' };
        },

        updateAgentProfile: function (profileData) {
            const data = loadData();
            const user = data.currentUser;
            if (!user) return { success: false, message: 'Chưa đăng nhập tài khoản đại lý.' };

            if (profileData.repName) {
                user.fullName = profileData.repName;
                user.repName = profileData.repName;
            }
            if (profileData.position) user.position = profileData.position;
            if (profileData.email) user.email = profileData.email;
            if (profileData.phone) user.phone = profileData.phone;
            if (profileData.address) user.address = profileData.address;
            if (profileData.companyName) user.companyName = profileData.companyName;

            // Update in agentsList as well
            if (data.agentsList) {
                const ag = data.agentsList.find(a => (a.code || '').toUpperCase() === (user.agentCode || '').toUpperCase());
                if (ag) {
                    if (profileData.repName) {
                        ag.repName = profileData.repName;
                        ag.fullName = profileData.repName;
                    }
                    if (profileData.position) ag.position = profileData.position;
                    if (profileData.email) ag.email = profileData.email;
                    if (profileData.phone) ag.phone = profileData.phone;
                    if (profileData.address) ag.address = profileData.address;
                    if (profileData.companyName) ag.companyName = profileData.companyName;
                }
            }

            saveData(data);
            return { success: true, message: 'Cập nhật thông tin đại lý thành công!', user: user };
        },

        updateAuction: function (id, updateData) {
            const data = loadData();
            const auction = data.auctions.find(a => a.id == id);
            if (!auction) return { success: false, message: 'Phiên đấu giá không tồn tại.' };

            if (auction.status === 'CLOSED' && !updateData.reopen) {
                return {
                    success: false,
                    message: `Không thể chỉnh sửa chuyến bay ${auction.flightNumber} vì phiên đấu giá đã đóng thầu.`
                };
            }

            // Cho phép gia hạn thời gian đóng thầu ngay cả khi phiên đã có đại lý đặt giá
            const isOnlyExtending = Boolean(updateData.extendMinutes && Number(updateData.extendMinutes) > 0);
            const hasBids = (auction.bidsCount && auction.bidsCount > 0) ||
                (data.bids || []).some(b => b.auctionId == id);
            if (hasBids && !updateData.reopen && !isOnlyExtending) {
                return {
                    success: false,
                    message: `Không thể chỉnh sửa thông số chuyến bay ${auction.flightNumber} (${auction.route}) vì đã có đại lý đặt giá (${auction.bidsCount || 0} lượt đấu giá). Chỉ được phép gia hạn thêm thời gian đấu giá.`
                };
            }

            if (!isOnlyExtending) {
                if (updateData.capacityKg) {
                    const cap = Number(updateData.capacityKg);
                    if (isNaN(cap) || cap < 100 || cap > 50000) {
                        return {
                            success: false,
                            message: `Tải trọng chào thầu (${cap ? cap.toLocaleString('vi-VN') : 0} Kg) không hợp lệ! Tải trọng một chuyến bay vận tải hàng không cho phép từ 100 Kg đến tối đa 50.000 Kg (50 tấn).`
                        };
                    }
                    auction.capacityKg = cap;
                }
                if (updateData.startingPriceKg) {
                    auction.startingPriceKg = Number(updateData.startingPriceKg);
                    if (!auction.currentPriceKg || auction.currentPriceKg < auction.startingPriceKg) {
                        auction.currentPriceKg = auction.startingPriceKg;
                    }
                }
                if (updateData.minStep) auction.minStep = Number(updateData.minStep);
                if (updateData.etd) auction.etd = updateData.etd;
                if (updateData.eta) auction.eta = updateData.eta;
                if (updateData.aircraft) auction.aircraft = updateData.aircraft;
                if (updateData.specialNotes !== undefined) auction.specialNotes = updateData.specialNotes;
                if (updateData.cutOffTime) auction.cutOffTime = updateData.cutOffTime;
                if (updateData.status) auction.status = updateData.status;
            }

            if (updateData.extendMinutes && Number(updateData.extendMinutes) > 0) {
                const nowMs = Date.now();
                const curEndMs = auction.endTime ? Date.parse(auction.endTime) : 0;
                const baseMs = (curEndMs && curEndMs > nowMs) ? curEndMs : nowMs;
                auction.endTime = new Date(baseMs + Number(updateData.extendMinutes) * 60 * 1000).toISOString();
                auction.isExtended = true;
                auction.extendedTimes = (auction.extendedTimes || 0) + 1;
                if (updateData.reopen) auction.status = 'OPEN';
            }

            saveData(data);
            this.logActivity({
                actionCategory: 'Phiên đấu giá',
                actionTitle: isOnlyExtending ? 'Gia hạn thời gian đấu giá' : 'Cập nhật phiên đấu giá',
                target: auction.flightNumber,
                details: isOnlyExtending
                    ? `Gia hạn thêm ${updateData.extendMinutes} phút cho chuyến bay ${auction.flightNumber} (${auction.route || 'Vietravel Airlines'}).`
                    : `Chỉnh sửa thông số chuyến ${auction.flightNumber} (${auction.route || 'Vietravel Airlines'}).`
            });
            return {
                success: true,
                message: isOnlyExtending
                    ? `Gia hạn thêm ${updateData.extendMinutes} phút cho chuyến bay ${auction.flightNumber} thành công!`
                    : `Cập nhật thông số chuyến bay ${auction.flightNumber} thành công!`,
                auction: auction
            };
        },

        deleteAuction: function (id) {
            const data = loadData();
            const idx = data.auctions.findIndex(a => a.id == id);
            if (idx === -1) return { success: false, message: 'Phiên đấu giá không tồn tại.' };

            const auction = data.auctions[idx];
            if (auction.status === 'DELETED') {
                return { success: false, message: `Phiên chuyến bay ${auction.flightNumber} đã bị xóa trước đó.` };
            }
            if (auction.status === 'CANCELLED') {
                return { success: false, message: `Phiên chuyến bay ${auction.flightNumber} đã bị hủy. Không thể xóa.` };
            }

            const allBids = data.bids || [];
            const bidsForThis = allBids.filter(b => b.auctionId == id);
            const bidsCount = (auction.bidsCount !== undefined && auction.bidsCount !== null && auction.bidsCount > 0)
                ? Math.max(auction.bidsCount, bidsForThis.length)
                : bidsForThis.length;

            if (bidsCount > 0) {
                return {
                    success: false,
                    shouldCancel: true,
                    message: `Phiên chuyến bay ${auction.flightNumber} đã có ${bidsCount} lượt đặt giá. Không thể xóa – vui lòng sử dụng chức năng "Hủy chuyến bay" để bảo toàn dữ liệu và hoàn tiền cho đại lý.`
                };
            }

            // Soft delete: keep record in DB, only mark as DELETED
            data.auctions[idx] = {
                ...auction,
                status: 'DELETED',
                deletedAt: new Date().toISOString()
            };

            saveData(data);
            this.logActivity({
                actionCategory: 'Phiên đấu giá',
                actionTitle: 'Xóa phiên đấu giá',
                target: auction.flightNumber,
                details: `Xóa phiên đấu giá chuyến bay ${auction.flightNumber} (${auction.route}) [Chưa có lượt thầu]. Dữ liệu vẫn lưu trong hệ thống.`
            });
            return { success: true, message: `Đã xóa phiên đấu giá chuyến bay ${auction.flightNumber} thành công.` };
        },

        cancelAuction: function (id, reason, refundNote) {
            const data = loadData();
            const idx = data.auctions.findIndex(a => a.id == id);
            if (idx === -1) return { success: false, message: 'Phiên đấu giá không tồn tại.' };

            const auction = data.auctions[idx];
            const cleanReason = (reason && typeof reason === 'string') ? reason.trim() : '';
            const cleanRefundNote = (refundNote && typeof refundNote === 'string') ? refundNote.trim() : '';

            if (!cleanReason) {
                return { success: false, message: 'Bắt buộc phải nhập lý do hủy chuyến bay!' };
            }

            const allBids = data.bids || [];
            const bidsForThis = allBids.filter(b => b.auctionId == id);
            const bidsCount = (auction.bidsCount !== undefined && auction.bidsCount !== null && auction.bidsCount > 0)
                ? Math.max(auction.bidsCount, bidsForThis.length)
                : bidsForThis.length;

            // Find winning agent (highest bidder or winner)
            const winner = auction.winnerAgentCode || auction.leadingAgentCode;
            const winnerName = auction.winnerAgentName || auction.leadingAgentName || winner;
            const winningPrice = Number(auction.winningPriceKg) || Number(auction.currentPriceKg) || 0;
            const refundAmount = winningPrice * (Number(auction.capacityKg) || 0);

            // Mark auction as CANCELLED — do NOT delete
            data.auctions[idx] = {
                ...auction,
                status: 'CANCELLED',
                cancelledAt: new Date().toISOString(),
                cancellationReason: cleanReason,
                refundNote: cleanRefundNote || 'Hoàn tiền 100% trong vòng 3-5 ngày làm việc.',
                refundAmount: refundAmount
            };

            const now = Date.now();

            // Update winner's wonAuction record with cancellation info
            if (winner && data.wonAuctions) {
                const wonItem = data.wonAuctions.find(w =>
                    w.auctionId == id || w.flightNumber === auction.flightNumber
                );
                if (wonItem) {
                    const wasPaid = wonItem.paymentStatus === 'PAID' || wonItem.paymentStatus === 'PAID_LATE' || wonItem.lockWaivedByAdmin === true;
                    wonItem.cancelledAt = new Date().toISOString();
                    wonItem.cancellationReason = cleanReason;
                    wonItem.adminCancelRefundNote = cleanRefundNote || 'Hoàn tiền 100% trong vòng 3-5 ngày làm việc.';
                    if (wasPaid) {
                        // Paid → needs refund process
                        wonItem.paymentStatus = 'CANCELLED_AFTER_PAYMENT';
                        wonItem.refundStatus = wonItem.refundStatus || null; // preserve if already set
                    } else {
                        // Not yet paid → simply cancelled
                        wonItem.paymentStatus = 'CANCELLED';
                    }
                }
            }

            // Notify winner specifically (if exists)
            if (!data.notifications) data.notifications = [];

            if (winner) {
                const wasPaid = (() => {
                    if (!data.wonAuctions) return false;
                    const w = data.wonAuctions.find(w => w.auctionId == id || w.flightNumber === auction.flightNumber);
                    return w && (w.paymentStatus === 'CANCELLED_AFTER_PAYMENT');
                })();
                data.notifications.unshift({
                    id: now + 1,
                    title: `HỦY CHUYẾN BAY ${auction.flightNumber} – ${wasPaid ? 'CHỜ HOÀN TIỀN' : 'THÔNG BÁO HỦY'}`,
                    message: wasPaid
                        ? `Chuyến bay ${auction.flightNumber} (${auction.route}) mà Quý đại lý đã trúng thầu bị HỦY sau khi đã thanh toán. Lý do: ${cleanReason}. Đơn hàng đã chuyển sang trạng thái "Chờ hoàn tiền". Vui lòng truy cập mục Đơn trúng thầu để điền thông tin tài khoản nhận hoàn tiền.`
                        : `Chuyến bay ${auction.flightNumber} (${auction.route}) mà Quý đại lý đã trúng thầu bị HỦY. Lý do: ${cleanReason}. ${cleanRefundNote || 'Hoàn tiền 100% trong vòng 3-5 ngày làm việc.'}`,
                    type: 'WARNING',
                    time: new Date().toLocaleString('vi-VN'),
                    rawTime: now,
                    targetAgent: winner,
                    targetRole: 'AGENT',
                    auctionId: id,
                    read: false,
                    link: '07-WonAuction.html'
                });
            }

            // Notify ALL agents who bid on this auction
            const biddingAgents = [...new Set(bidsForThis.map(b => b.agentCode).filter(Boolean))];
            biddingAgents.forEach((agentCode, i) => {
                if (agentCode === winner) return; // already notified above
                data.notifications.unshift({
                    id: now + 10 + i,
                    title: `HỦY PHIÊN ĐẤU GIÁ CHUYẾN BAY ${auction.flightNumber}`,
                    message: `Phiên đấu giá chuyến bay ${auction.flightNumber} (${auction.route}) mà Quý đại lý đã tham gia đặt thầu bị HỦY. Lý do: ${cleanReason}.`,
                    type: 'SYSTEM',
                    time: new Date().toLocaleString('vi-VN'),
                    rawTime: now,
                    targetAgent: agentCode,
                    targetRole: 'AGENT',
                    auctionId: id,
                    read: false
                });
            });

            // Also broadcast to all agents if no specific agents found
            if (biddingAgents.length === 0) {
                data.notifications.unshift({
                    id: now + 100,
                    title: `HỦY PHIÊN ĐẤU GIÁ CHUYẾN BAY ${auction.flightNumber}`,
                    message: `Phiên đấu giá chuyến bay ${auction.flightNumber} (${auction.route}) đã bị HỦY. Lý do: ${cleanReason}.`,
                    type: 'SYSTEM',
                    time: new Date().toLocaleString('vi-VN'),
                    rawTime: now,
                    targetRole: 'ALL',
                    auctionId: id,
                    read: false
                });
            }

            saveData(data);

            const logMsg = winner
                ? `Hủy chuyến bay ${auction.flightNumber} (${auction.route}). Đại lý trúng thầu: ${winnerName}. Số tiền hoàn: ${cleanRefundNote || 'Theo quy chế'}. Lý do: "${cleanReason}"`
                : `Hủy chuyến bay ${auction.flightNumber} (${auction.route}) [${bidsCount} lượt thầu]. Lý do: "${cleanReason}"`;

            this.logActivity({
                actionCategory: 'Phiên đấu giá',
                actionTitle: 'Hủy chuyến bay',
                target: auction.flightNumber,
                details: logMsg
            });

            return {
                success: true,
                message: `Đã hủy chuyến bay ${auction.flightNumber}. Thông báo hoàn tiền đã được gửi đến ${winner ? 'đại lý trúng thầu' : 'các đại lý tham gia'}. Dữ liệu phiên đấu giá được lưu lại phục vụ kiểm toán.`
            };
        },

        sendBroadcastNotification: function (notifData) {
            const data = loadData();
            if (!data.notifications) data.notifications = [];

            const notifId = Date.now();
            const newNotif = {
                id: notifId,
                title: notifData.title || 'Thông báo từ Ban Điều hành Cargo',
                message: notifData.message || '',
                content: notifData.content || notifData.message || '',
                time: 'Vừa xong',
                type: notifData.type || 'SYSTEM',
                read: false,
                auctionId: notifData.auctionId || null,
                link: `11-NotificationDetail.html?id=${notifId}`,
                targetAgentCode: notifData.targetAgentCode || null,
                sender: 'Ban Quản Trị Sàn Đấu Giá Cargo - Vietravel Airlines',
                createdAt: new Date().toISOString()
            };

            data.notifications.unshift(newNotif);
            saveData(data);
            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Phát thông báo Broadcast',
                target: notifData.targetAgentCode || 'Tất cả đại lý',
                details: `Gửi thông báo hệ thống tới ${notifData.targetAgentCode || 'Tất cả đại lý'}: "${notifData.title}".`
            });
            return { success: true, message: 'Đã phát thông báo đấu giá thành công tới các Đại lý!', notification: newNotif };
        },

        toggleUserLock: function (identifier, type = 'agent', customReason = '') {
            const data = loadData();
            if (data.currentAdmin && data.currentAdmin.role === 'STAFF') {
                return { success: false, message: 'Nhân viên (STAFF) không có quyền kích hoạt hoặc khóa tài khoản. Thao tác này chỉ dành cho Quản trị viên (ADMIN).' };
            }

            if (type === 'agent') {
                const target = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === (identifier || '').toUpperCase());
                if (target) {
                    const isCurrentlyActive = !(target.status === 'Đã khóa' || target.status === 'LOCKED' || target.isLocked);
                    if (isCurrentlyActive) {
                        target.status = 'Đã khóa';
                        target.lockedReason = customReason || 'Quản trị viên chủ động khóa tài khoản';
                        target.lockedAt = new Date().toLocaleString('vi-VN');
                        delete target.unlockedReason;
                        delete target.unlockedAt;
                        // If locking and target is currently logged in, clear currentUser session immediately!
                        if (data.currentUser) {
                            const currentCode = (data.currentUser.agentCode || data.currentUser.code || '').toUpperCase();
                            if (currentCode === (target.code || '').toUpperCase() || data.currentUser.id == target.id) {
                                data.currentUser = null;
                            }
                        }
                    } else {
                        target.status = 'Đang hoạt động';
                        target.isLocked = false;
                        target.failedLoginAttempts = 0;
                        target.unlockedAt = new Date().toLocaleString('vi-VN');
                        target.unlockedBy = data.currentAdmin ? (data.currentAdmin.username || 'ADMIN') : 'ADMIN';
                        target.unlockedReason = customReason || 'Ban Điều hành đã xác minh và chấp thuận mở lại tài khoản hoạt động bình thường';
                        delete target.lockedReason;
                        delete target.lockedAt;

                        // Waive old expired auction penalties so system doesn't immediately re-lock
                        // Also mark expired unpaid orders as PAID_LATE so they no longer appear in "cần thanh toán"
                        const unlockTime = new Date().toLocaleString('vi-VN');
                        (data.wonAuctions || []).forEach(w => {
                            if ((w.agentCode || '').toUpperCase() === (target.code || '').toUpperCase()) {
                                w.lockPenaltyHandled = true;
                                w.lockWaivedByAdmin = true;
                                // If this order was expired and unpaid, mark it as PAID_LATE (supplementary payment)
                                const isExpired = CargoStore.isWonAuctionExpired ? CargoStore.isWonAuctionExpired(w) : false;
                                if (isExpired && w.paymentStatus !== 'PAID') {
                                    w.paymentStatus = 'PAID_LATE';
                                    w.paidAt = unlockTime;
                                    w.paidLateNote = `Đại lý nộp bổ sung sau quá hạn – Được Ban Điều hành chấp thuận mở khóa lúc ${unlockTime}`;
                                }
                            }
                        });

                        // Push official UNLOCK Notification to agent
                        if (!data.notifications) data.notifications = [];
                        data.notifications.unshift({
                            id: Date.now() + Math.floor(Math.random() * 1000),
                            timestamp: Date.now(),
                            targetAgentCode: target.code,
                            title: `🔓 TÀI KHOẢN ĐÃ ĐƯỢC MỞ KHÓA KÍCH HOẠT`,
                            message: `Tài khoản đại lý ${target.code} (${target.companyName}) của bạn đã được Quản trị viên MỞ KHÓA. Lý do mở khóa: "${target.unlockedReason}". Quyền tham gia đấu giá trên sàn đã được khôi phục.`,
                            time: 'Vừa xong',
                            type: 'SYSTEM',
                            read: false,
                            link: '02-Dashboard.html'
                        });

                        // Clean up lock alert notifications for this agent
                        if (data.notifications) {
                            data.notifications = data.notifications.filter(n => {
                                const isTarget = (n.targetAgentCode || '').toUpperCase() === (target.code || '').toUpperCase();
                                const isLockAlert = (n.type === 'ALERT' && (n.title || '').includes('TÀI KHOẢN ĐÃ BỊ KHÓA'));
                                return !(isTarget && isLockAlert);
                            });
                        }
                    }

                    saveData(data);
                    if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                        fetch('/api/agents/lock', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ code: target.code, locked: isCurrentlyActive, reason: customReason || '' })
                        }).then(() => { lastLocalSaveTimestamp = 0; return syncWithServer(true); }).catch(() => { });
                    }
                    this.logActivity({
                        actionCategory: 'Quản lý Đại lý',
                        actionTitle: isCurrentlyActive ? 'Khóa tài khoản Đại lý' : 'Mở khóa tài khoản Đại lý',
                        target: target.code || identifier,
                        details: `${isCurrentlyActive ? 'Đã khóa' : 'Đã mở khóa'} tài khoản đại lý ${target.companyName} (${target.code}). Lý do: "${customReason || 'Thay đổi trạng thái bởi Admin'}".`
                    });
                    return {
                        success: true,
                        newStatus: target.status,
                        message: `Đã ${isCurrentlyActive ? 'KHÓA' : 'KÍCH HOẠT / MỞ KHÓA'} tài khoản đại lý ${target.code} (${target.companyName}).`
                    };
                }
            } else {
                const target = (data.adminsList || []).find(a => (a.username || '').toLowerCase() === (identifier || '').toLowerCase());
                if (target) {
                    const isCurrentlyActive = target.status !== 'Đã khóa';
                    if (isCurrentlyActive) {
                        target.status = 'Đã khóa';
                        target.lockedReason = customReason || 'Quản trị viên chủ động khóa tài khoản';
                        target.lockedAt = new Date().toLocaleString('vi-VN');
                        delete target.unlockedReason;
                        delete target.unlockedAt;
                        // If locking and target staff is currently logged in, clear currentAdmin session immediately!
                        if (data.currentAdmin) {
                            const currentUsername = (data.currentAdmin.username || '').toLowerCase();
                            if (currentUsername === (target.username || '').toLowerCase() || data.currentAdmin.id == target.id) {
                                data.currentAdmin = null;
                            }
                        }
                    } else {
                        target.status = 'Đang hoạt động';
                        target.unlockedAt = new Date().toLocaleString('vi-VN');
                        target.unlockedReason = customReason || 'Quản trị viên kích hoạt mở khóa tài khoản nhân sự';
                        delete target.lockedReason;
                        delete target.lockedAt;
                    }

                    saveData(data);
                    this.logActivity({
                        actionCategory: 'Tài khoản',
                        actionTitle: isCurrentlyActive ? 'Khóa tài khoản Nhân viên' : 'Mở khóa tài khoản Nhân viên',
                        target: target.username || identifier,
                        details: `${isCurrentlyActive ? 'Đã khóa' : 'Đã mở khóa'} tài khoản nhân viên "${target.username}". Lý do: "${customReason || 'Thay đổi trạng thái bởi Admin'}".`
                    });
                    return {
                        success: true,
                        newStatus: target.status,
                        message: `Đã ${isCurrentlyActive ? 'KHÓA' : 'KÍCH HOẠT / MỞ KHÓA'} tài khoản nhân viên "${target.username}".`
                    };
                }
            }

            return { success: false, message: 'Không tìm thấy người dùng trong hệ thống.' };
        },

        getRoles: function () {
            const data = loadData();
            if (!data.rolesList || !Array.isArray(data.rolesList) || data.rolesList.length === 0) {
                data.rolesList = JSON.parse(JSON.stringify(seedRoles));
                saveData(data);
            }
            return data.rolesList;
        },

        getRoleById: function (id) {
            const roles = this.getRoles();
            return roles.find(r => r.id === id || r.code === id) || null;
        },

        createRole: function (roleData) {
            const data = loadData();
            if (!this.hasPermission('staff.edit')) {
                return { success: false, message: 'Bạn không có quyền thẩm quyền tạo vai trò mới (yêu cầu quyền staff.edit).' };
            }
            if (!data.rolesList) data.rolesList = JSON.parse(JSON.stringify(seedRoles));
            const name = (roleData.name || '').trim();
            if (!name) return { success: false, message: 'Tên vai trò không được để trống.' };

            const code = (roleData.code || name.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "_")).replace(/_+/g, "_");
            const exists = data.rolesList.some(r => (r.name || '').toLowerCase() === name.toLowerCase() || (r.code || '').toLowerCase() === code.toLowerCase());
            if (exists) {
                return { success: false, message: `Vai trò "${name}" hoặc mã "${code}" đã tồn tại trên hệ thống.` };
            }

            const permissions = Array.isArray(roleData.permissions) ? roleData.permissions.filter(p => ALL_PERMISSION_KEYS.includes(p)) : [];

            const newRole = {
                id: 'role_' + Date.now(),
                code: code,
                name: name,
                description: (roleData.description || '').trim() || `Vai trò ${name}`,
                permissions: permissions,
                isSystem: false,
                createdAt: new Date().toISOString()
            };

            data.rolesList.push(newRole);
            saveData(data);
            this.logActivity({
                actionCategory: 'Phân quyền',
                actionTitle: 'Tạo vai trò mới',
                target: newRole.name,
                details: `Đã tạo vai trò mới [${newRole.name}] (${newRole.code}) với ${permissions.length} quyền hạn: [${permissions.join(', ')}]`
            });
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cargostore_updated'));
            return { success: true, message: `Đã tạo vai trò mới "${newRole.name}" thành công!`, role: newRole };
        },

        updateRole: function (id, roleData) {
            const data = loadData();
            if (!this.hasPermission('staff.edit')) {
                return { success: false, message: 'Bạn không có quyền chỉnh sửa vai trò (yêu cầu quyền staff.edit).' };
            }
            if (!data.rolesList) data.rolesList = JSON.parse(JSON.stringify(seedRoles));
            const role = data.rolesList.find(r => r.id === id || r.code === id);
            if (!role) {
                return { success: false, message: 'Không tìm thấy vai trò cần cập nhật.' };
            }

            if (role.isSystem && (role.code === 'SUPER_ADMIN' || role.id === 'role_super_admin')) {
                return { success: false, message: 'Không thể chỉnh sửa vai trò Super Admin mặc định của hệ thống!' };
            }

            const name = (roleData.name || '').trim();
            if (name) role.name = name;
            if (roleData.description !== undefined) role.description = roleData.description.trim();
            if (Array.isArray(roleData.permissions)) {
                role.permissions = roleData.permissions.filter(p => ALL_PERMISSION_KEYS.includes(p));
            }
            role.updatedAt = new Date().toISOString();

            saveData(data);
            this.logActivity({
                actionCategory: 'Phân quyền',
                actionTitle: 'Cập nhật vai trò',
                target: role.name,
                details: `Cập nhật vai trò [${role.name}] (${role.code}). Tổng số quyền hạn: ${role.permissions.length}`
            });
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cargostore_updated'));
            return { success: true, message: `Đã cập nhật vai trò "${role.name}" thành công!`, role: role };
        },

        deleteRole: function (id) {
            const data = loadData();
            if (!this.hasPermission('staff.remove')) {
                return { success: false, message: 'Bạn không có quyền xóa vai trò (yêu cầu quyền staff.remove).' };
            }
            if (!data.rolesList) data.rolesList = JSON.parse(JSON.stringify(seedRoles));
            const idx = data.rolesList.findIndex(r => r.id === id || r.code === id);
            if (idx === -1) {
                return { success: false, message: 'Không tìm thấy vai trò cần xóa.' };
            }
            const role = data.rolesList[idx];
            if (role.isSystem) {
                return { success: false, message: `Vai trò "${role.name}" là vai trò hệ thống, không thể xóa!` };
            }

            // Verify if any admin/staff member is currently using this role
            const inUseBy = (data.adminsList || []).filter(a => {
                const roles = (Array.isArray(a.roles) ? a.roles : [a.role]).map(r => String(r || '').toUpperCase());
                return roles.includes(String(role.id).toUpperCase()) || roles.includes(String(role.code).toUpperCase()) || roles.includes(String(role.name).toUpperCase());
            });

            if (inUseBy.length > 0) {
                const names = inUseBy.map(a => a.fullName || a.username).join(', ');
                return {
                    success: false,
                    message: `Không thể xóa vai trò "${role.name}" vì đang có ${inUseBy.length} nhân sự đảm nhiệm (${names}). Vui lòng gỡ vai trò này khỏi nhân sự trước khi xóa.`
                };
            }

            data.rolesList.splice(idx, 1);
            saveData(data);
            this.logActivity({
                actionCategory: 'Phân quyền',
                actionTitle: 'Xóa vai trò',
                target: role.name,
                details: `Đã xóa vai trò [${role.name}] khỏi hệ thống.`
            });
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cargostore_updated'));
            return { success: true, message: `Đã xóa vai trò "${role.name}" thành công!` };
        },

        updateUserRole: function (identifier, newRole, type = 'agent') {
            const data = loadData();

            if (type === 'staff') {
                if (!this.hasPermission('staff.edit')) {
                    return { success: false, message: 'Bạn không có thẩm quyền phân quyền vai trò cho nhân sự (yêu cầu quyền staff.edit).' };
                }
            } else if (!this.hasPermission('agents.lock') && !this.hasPermission('staff.edit')) {
                return { success: false, message: 'Bạn không có quyền thay đổi phân hạng đại lý.' };
            }

            if (type === 'agent') {
                const target = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === (identifier || '').toUpperCase());
                if (target) {
                    target.tier = newRole;
                    saveData(data);
                    this.logActivity({
                        actionCategory: 'Quản lý Đại lý',
                        actionTitle: 'Phân hạng Đại lý',
                        target: target.code || identifier,
                        details: `Cập nhật phân hạng đại lý ${target.code} (${target.companyName}) thành hạng [${newRole}].`
                    });
                    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cargostore_updated'));
                    return { success: true, message: `Đã phân hạng đại lý ${target.code} thành ${newRole}.` };
                }
            } else {
                const target = (data.adminsList || []).find(a => (a.username || '').toLowerCase() === (identifier || '').toLowerCase());
                if (target) {
                    let rolesArr = [];
                    if (Array.isArray(newRole)) {
                        rolesArr = newRole.map(r => String(r).trim()).filter(Boolean);
                    } else if (typeof newRole === 'string' && newRole.includes(',')) {
                        rolesArr = newRole.split(',').map(r => r.trim()).filter(Boolean);
                    } else if (newRole) {
                        rolesArr = [String(newRole).trim()];
                    }
                    if (rolesArr.length === 0) rolesArr = ['OPERATIONS_VIEWER'];

                    target.roles = rolesArr;
                    target.role = rolesArr[0]; // primary role for backwards compatibility

                    // If this is currently logged in admin, update data.currentAdmin too
                    if (data.currentAdmin && (data.currentAdmin.username || '').toLowerCase() === target.username.toLowerCase()) {
                        data.currentAdmin.roles = target.roles;
                        data.currentAdmin.role = target.role;
                    }

                    saveData(data);
                    this.logActivity({
                        actionCategory: 'Tài khoản',
                        actionTitle: 'Phân quyền Nhân viên',
                        target: target.username || identifier,
                        details: `Cập nhật vai trò nhân viên ${target.username} thành [${rolesArr.join(', ')}].`
                    });

                    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cargostore_updated'));
                    return { success: true, message: `Đã cập nhật các vai trò cho "${target.username}" thành: [${rolesArr.join(', ')}].` };
                }
            }
            return { success: false, message: 'Không tìm thấy người dùng trong hệ thống.' };
        },

        createStaffAccount: function (staffData) {
            const data = loadData();
            if (!this.hasPermission('staff.create')) {
                return { success: false, message: 'Bạn không có quyền cấp mới tài khoản nhân sự (yêu cầu quyền staff.create).' };
            }

            if (!data.adminsList) data.adminsList = seedAdmins;

            const u = (staffData.username || '').trim().toLowerCase();
            if (!u) return { success: false, message: 'Tên đăng nhập không được để trống.' };

            const exists = data.adminsList.some(a => (a.username || '').toLowerCase() === u);
            if (exists) return { success: false, message: `Tài khoản "${u}" đã tồn tại trên hệ thống.` };

            let rolesArr = [];
            if (Array.isArray(staffData.roles) && staffData.roles.length > 0) {
                rolesArr = staffData.roles.map(r => String(r).trim());
            } else if (staffData.role) {
                rolesArr = [String(staffData.role).trim()];
            } else {
                rolesArr = ['OPERATIONS_VIEWER'];
            }

            const newStaff = {
                id: Date.now(),
                username: u,
                password: staffData.password || 'staff2026',
                role: rolesArr[0],
                roles: rolesArr,
                fullName: staffData.fullName || 'Nhân viên Điều hành',
                email: staffData.email || `${u}@airline.vn`,
                department: staffData.department || 'Air Cargo Flight Operations',
                status: 'Đang hoạt động'
            };

            data.adminsList.push(newStaff);
            saveData(data);
            this.logActivity({
                actionCategory: 'Tài khoản',
                actionTitle: 'Tạo mới tài khoản Nhân viên',
                target: u,
                details: `Khởi tạo tài khoản nhân viên mới: ${newStaff.fullName} (@${u}), Phòng ban: ${newStaff.department}, Vai trò: [${rolesArr.join(', ')}].`
            });
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cargostore_updated'));
            return { success: true, message: `Đã tạo mới tài khoản "${u}" (${newStaff.fullName}) với vai trò [${rolesArr.join(', ')}].`, staff: newStaff };
        },

        updateStaffAccount: function (idOrUsername, updateData) {
            const data = loadData();
            if (!this.hasPermission('staff.edit')) {
                return { success: false, message: 'Bạn không có quyền chỉnh sửa thông tin nhân viên (yêu cầu quyền staff.edit).' };
            }
            if (!data.adminsList) data.adminsList = seedAdmins;
            const staff = data.adminsList.find(a => 
                (a.id && String(a.id) === String(idOrUsername)) || 
                (a.username && a.username.toLowerCase() === String(idOrUsername).toLowerCase())
            );
            if (!staff) {
                return { success: false, message: 'Không tìm thấy tài khoản nhân viên.' };
            }

            if (updateData.fullName) staff.fullName = updateData.fullName.trim();
            if (updateData.email) staff.email = updateData.email.trim();
            if (updateData.department) staff.department = updateData.department.trim();
            if (updateData.password) staff.password = updateData.password.trim();
            if (updateData.status) staff.status = updateData.status;

            if (updateData.roles) {
                staff.roles = Array.isArray(updateData.roles) ? updateData.roles : [updateData.roles];
                staff.role = staff.roles[0] || 'OPERATIONS_VIEWER';
            } else if (updateData.role) {
                staff.role = updateData.role;
                staff.roles = [updateData.role];
            }

            if (data.currentAdmin && data.currentAdmin.username.toLowerCase() === staff.username.toLowerCase()) {
                data.currentAdmin.fullName = staff.fullName;
                data.currentAdmin.roles = staff.roles;
                data.currentAdmin.role = staff.role;
                data.currentAdmin.department = staff.department;
            }

            saveData(data);
            this.logActivity({
                actionCategory: 'Tài khoản',
                actionTitle: 'Cập nhật tài khoản Nhân viên',
                target: staff.username,
                details: `Cập nhật tài khoản ${staff.fullName} (@${staff.username}). Vai trò: [${(staff.roles || []).join(', ')}]`
            });
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cargostore_updated'));
            return { success: true, message: `Cập nhật thông tin tài khoản "${staff.username}" thành công!` };
        },

        deleteStaffAccount: function (idOrUsername) {
            const data = loadData();
            if (!this.hasPermission('staff.remove')) {
                return { success: false, message: 'Bạn không có quyền xóa tài khoản nhân sự (yêu cầu quyền staff.remove).' };
            }
            if (!data.adminsList) data.adminsList = seedAdmins;
            const targetIdx = data.adminsList.findIndex(a => 
                (a.id && String(a.id) === String(idOrUsername)) || 
                (a.username && a.username.toLowerCase() === String(idOrUsername).toLowerCase())
            );
            if (targetIdx === -1) {
                return { success: false, message: 'Không tìm thấy tài khoản nhân sự cần xóa.' };
            }
            const target = data.adminsList[targetIdx];
            if (target.username && target.username.toLowerCase() === 'admin') {
                return { success: false, message: 'Không thể xóa tài khoản Quản trị viên tối cao (admin)!' };
            }
            if (data.currentAdmin && data.currentAdmin.username.toLowerCase() === target.username.toLowerCase()) {
                return { success: false, message: 'Không thể tự xóa tài khoản của chính mình khi đang đăng nhập!' };
            }

            data.adminsList.splice(targetIdx, 1);
            saveData(data);
            this.logActivity({
                actionCategory: 'Tài khoản',
                actionTitle: 'Xóa tài khoản Nhân viên',
                target: target.username,
                details: `Đã xóa tài khoản nhân sự ${target.fullName} (@${target.username}) khỏi hệ thống.`
            });
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cargostore_updated'));
            return { success: true, message: `Đã xóa tài khoản "${target.username}" thành công!` };
        },

        updateSystemSettings: function (settingsData) {
            const data = loadData();
            const currentAdminRole = (data.currentAdmin && data.currentAdmin.role || '').toUpperCase();
            const isSuperAdmin = (currentAdminRole === 'SUPER_ADMIN' || currentAdminRole === 'ITD_ADMIN' || currentAdminRole === 'ADMIN' || (data.currentAdmin && (data.currentAdmin.username || '').toLowerCase() === 'admin'));

            if (!isSuperAdmin) {
                return { success: false, message: 'Chỉ Quản trị viên Super Admin mới có quyền thay đổi Cấu hình hệ thống (Settings).' };
            }

            if (!data.settings) data.settings = {};

            if (settingsData.minIncrement) data.settings.minIncrement = Number(settingsData.minIncrement);
            if (settingsData.cutoffHours) data.settings.cutoffHours = Number(settingsData.cutoffHours);
            if (settingsData.paymentWindowHours) data.settings.paymentWindowHours = Number(settingsData.paymentWindowHours);
            if (settingsData.reviewWindowMinutes !== undefined) data.settings.reviewWindowMinutes = Math.max(1, Number(settingsData.reviewWindowMinutes) || 15);
            if (settingsData.hotline) data.settings.hotline = settingsData.hotline;
            if (settingsData.supportEmail) data.settings.supportEmail = settingsData.supportEmail;
            if (settingsData.platformFee) data.settings.platformFee = Number(settingsData.platformFee);
            if (settingsData.hideAgentCredentials !== undefined) {
                data.settings.hideAgentCredentials = Boolean(settingsData.hideAgentCredentials);
            }
            if (settingsData.hideCloseAuctionBtn !== undefined) {
                data.settings.hideCloseAuctionBtn = Boolean(settingsData.hideCloseAuctionBtn);
            }
            if (settingsData.autoCloseOnBid !== undefined) {
                data.settings.autoCloseOnBid = Boolean(settingsData.autoCloseOnBid);
            }

            if (settingsData.smtp) {
                data.settings.smtp = {
                    host: (settingsData.smtp.host || 'smtp.gmail.com').trim(),
                    port: Number(settingsData.smtp.port) || 465,
                    user: (settingsData.smtp.user || '').trim(),
                    pass: (settingsData.smtp.pass || '').trim().replace(/\s+/g, ''),
                    fromName: (settingsData.smtp.fromName || 'Vietravel Airlines Cargo').trim(),
                    secure: Number(settingsData.smtp.port) === 465
                };
            }

            saveData(data);
            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Cập nhật tham số hệ thống',
                target: 'Cấu hình chung',
                details: `Cập nhật các tham số vận hành hệ thống (Bước giá, Thời gian Cut-off, Thời gian thanh toán, SMTP email...).`
            });
            return { success: true, message: 'Đã lưu cấu hình hệ thống thành công!', settings: data.settings };
        },

        getSystemSettings: function () {
            return loadData().settings || defaultData.settings;
        },

        // ==========================================
        // AIRPORT CONFIGURATION (Mã & Tên Sân bay)
        // ==========================================
        getAirports: function () {
            const data = loadData();
            return (data.airports && Array.isArray(data.airports)) ? [...data.airports] : [];
        },
        addAirport: function (code, name) {
            if (!code || !name) return { success: false, message: 'Mã và tên sân bay không được để trống.' };
            const cleanCode = String(code).trim().toUpperCase();
            const cleanName = String(name).trim();
            const data = loadData();
            if (!data.airports) data.airports = [];
            if (data.airports.some(a => (a.code || '').toUpperCase() === cleanCode)) {
                return { success: false, message: `Mã sân bay "${cleanCode}" đã tồn tại trên hệ thống!` };
            }
            data.airports.push({ code: cleanCode, name: cleanName });
            saveData(data);
            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Thêm sân bay mới',
                target: `Sân bay ${cleanCode}`,
                details: `Đã thêm sân bay ${cleanCode} - ${cleanName} vào danh mục.`
            });
            return { success: true, message: `Đã thêm sân bay ${cleanCode} (${cleanName}) thành công!` };
        },
        updateAirport: function (oldCode, newCode, name) {
            if (!oldCode || !newCode || !name) return { success: false, message: 'Thông tin sân bay không hợp lệ.' };
            const cleanOld = String(oldCode).trim().toUpperCase();
            const cleanNew = String(newCode).trim().toUpperCase();
            const cleanName = String(name).trim();
            const data = loadData();
            if (!data.airports) return { success: false, message: 'Không tìm thấy danh sách sân bay.' };
            const idx = data.airports.findIndex(a => (a.code || '').toUpperCase() === cleanOld);
            if (idx === -1) return { success: false, message: 'Không tìm thấy sân bay cần cập nhật.' };
            if (cleanNew !== cleanOld && data.airports.some(a => (a.code || '').toUpperCase() === cleanNew)) {
                return { success: false, message: `Mã sân bay "${cleanNew}" đã bị trùng với sân bay khác!` };
            }
            data.airports[idx] = { code: cleanNew, name: cleanName };
            saveData(data);
            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Cập nhật sân bay',
                target: `Sân bay ${cleanNew}`,
                details: `Cập nhật thông tin sân bay ${cleanOld} thành ${cleanNew} - ${cleanName}.`
            });
            return { success: true, message: `Đã cập nhật sân bay ${cleanNew} thành công!` };
        },
        deleteAirport: function (code) {
            const cleanCode = String(code).trim().toUpperCase();
            const data = loadData();
            if (!data.airports) return { success: false, message: 'Danh sách sân bay trống.' };
            const origLen = data.airports.length;
            data.airports = data.airports.filter(a => (a.code || '').toUpperCase() !== cleanCode);
            if (data.airports.length === origLen) {
                return { success: false, message: `Không tìm thấy sân bay "${cleanCode}".` };
            }
            saveData(data);
            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Xóa sân bay',
                target: `Sân bay ${cleanCode}`,
                details: `Đã xóa sân bay ${cleanCode} khỏi danh mục.`
            });
            return { success: true, message: `Đã xóa sân bay ${cleanCode} thành công!` };
        },
        getAirportName: function (code) {
            if (!code) return '';
            const clean = String(code).trim().toUpperCase();
            const list = this.getAirports();
            const found = list.find(a => (a.code || '').toUpperCase() === clean);
            return found ? found.name : clean;
        },
        getAirportCity: function (code) {
            if (!code) return '';
            const clean = String(code).trim().toUpperCase();
            const cityMap = {
                'SGN': 'Sài Gòn',
                'HAN': 'Hà Nội',
                'DAD': 'Đà Nẵng',
                'PQC': 'Phú Quốc',
                'CXR': 'Cam Ranh',
                'DLI': 'Đà Lạt',
                'HPH': 'Hải Phòng',
                'HUI': 'Huế',
                'UIH': 'Quy Nhơn',
                'VCA': 'Cần Thơ',
                'VII': 'Vinh',
                'VDO': 'Vân Đồn'
            };
            if (cityMap[clean]) return cityMap[clean];
            const name = this.getAirportName(clean);
            if (name && name !== clean) {
                return name.replace(/\s+(International\s+)?Airport$/i, '').trim();
            }
            return clean;
        },
        formatRouteDisplay: function (origin, dest) {
            const o = (origin || '').trim().toUpperCase();
            const d = (dest || '').trim().toUpperCase();
            if (!o || !d) return '';
            const c1 = this.getAirportCity(o);
            const c2 = this.getAirportCity(d);
            return `${o} - ${d} (${c1} - ${c2})`;
        },

        // ==========================================
        // AIRCRAFT TYPES CONFIGURATION (msg_AcType)
        // ==========================================
        getAircraftTypes: function () {
            const data = loadData();
            return (data.aircraftTypes && Array.isArray(data.aircraftTypes)) ? [...data.aircraftTypes] : [];
        },
        addAircraftType: function (code, name) {
            if (!code || !name) return { success: false, message: 'Mã và tên loại tàu bay không được để trống.' };
            const cleanCode = String(code).trim().toUpperCase();
            const cleanName = String(name).trim();
            const data = loadData();
            if (!data.aircraftTypes) data.aircraftTypes = [];
            if (data.aircraftTypes.some(a => (a.code || '').toUpperCase() === cleanCode)) {
                return { success: false, message: `Mã loại tàu bay "${cleanCode}" đã tồn tại trên hệ thống!` };
            }
            data.aircraftTypes.push({ code: cleanCode, name: cleanName });
            saveData(data);
            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Thêm loại tàu bay mới',
                target: `Tàu bay ${cleanCode}`,
                details: `Đã thêm loại tàu bay ${cleanCode} - ${cleanName} vào danh mục.`
            });
            return { success: true, message: `Đã thêm loại tàu bay ${cleanCode} (${cleanName}) thành công!` };
        },
        updateAircraftType: function (oldCode, newCode, name) {
            if (!oldCode || !newCode || !name) return { success: false, message: 'Thông tin loại tàu bay không hợp lệ.' };
            const cleanOld = String(oldCode).trim().toUpperCase();
            const cleanNew = String(newCode).trim().toUpperCase();
            const cleanName = String(name).trim();
            const data = loadData();
            if (!data.aircraftTypes) return { success: false, message: 'Không tìm thấy danh sách loại tàu bay.' };
            const idx = data.aircraftTypes.findIndex(a => (a.code || '').toUpperCase() === cleanOld);
            if (idx === -1) return { success: false, message: 'Không tìm thấy loại tàu bay cần cập nhật.' };
            if (cleanNew !== cleanOld && data.aircraftTypes.some(a => (a.code || '').toUpperCase() === cleanNew)) {
                return { success: false, message: `Mã loại tàu bay "${cleanNew}" đã bị trùng!` };
            }
            data.aircraftTypes[idx] = { code: cleanNew, name: cleanName };
            saveData(data);
            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Cập nhật loại tàu bay',
                target: `Tàu bay ${cleanNew}`,
                details: `Cập nhật loại tàu bay ${cleanOld} thành ${cleanNew} - ${cleanName}.`
            });
            return { success: true, message: `Đã cập nhật loại tàu bay ${cleanNew} thành công!` };
        },
        deleteAircraftType: function (code) {
            const cleanCode = String(code).trim().toUpperCase();
            const data = loadData();
            if (!data.aircraftTypes) return { success: false, message: 'Danh sách loại tàu bay trống.' };
            const origLen = data.aircraftTypes.length;
            data.aircraftTypes = data.aircraftTypes.filter(a => (a.code || '').toUpperCase() !== cleanCode);
            if (data.aircraftTypes.length === origLen) {
                return { success: false, message: `Không tìm thấy loại tàu bay "${cleanCode}".` };
            }
            saveData(data);
            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Xóa loại tàu bay',
                target: `Tàu bay ${cleanCode}`,
                details: `Đã xóa loại tàu bay ${cleanCode} khỏi danh mục.`
            });
            return { success: true, message: `Đã xóa loại tàu bay ${cleanCode} thành công!` };
        },
        getAircraftTypeName: function (code) {
            if (!code) return '';
            const clean = String(code).trim().toUpperCase();
            const list = this.getAircraftTypes();
            const found = list.find(a => (a.code || '').toUpperCase() === clean);
            return found ? found.name : clean;
        },

        logActivity: function (logInfo) {
            const data = loadData();
            if (!data.activityLogs) data.activityLogs = defaultData.activityLogs || [];

            const currentAdmin = data.currentAdmin || { username: 'admin', fullName: 'Trần Quản Trị', role: 'ADMIN' };
            const currentUser = data.currentUser || null;

            const pathname = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '';
            const isAdminPage = pathname.includes('/Admin/') || pathname.includes('/admin/');
            const isAdminAction = logInfo && (
                logInfo.actionCategory === 'Quản lý Đại lý' ||
                logInfo.actionCategory === 'Cấu hình' ||
                (logInfo.actionTitle && (
                    logInfo.actionTitle.includes('Chốt thầu') ||
                    logInfo.actionTitle.includes('Đóng phiên') ||
                    logInfo.actionTitle.includes('Hủy phiên') ||
                    logInfo.actionTitle.includes('Tạo phiên') ||
                    logInfo.actionTitle.includes('Duyệt') ||
                    logInfo.actionTitle.includes('Khóa tài khoản')
                ))
            );

            let defaultActor = currentAdmin.fullName || currentAdmin.username || 'Ban Điều Hành';
            let defaultUsername = currentAdmin.username || 'admin';
            let defaultRole = currentAdmin.role || 'ADMIN';

            if (!isAdminPage && !isAdminAction && currentUser && (currentUser.role === 'AGENT' || currentUser.agentCode || currentUser.code)) {
                defaultActor = currentUser.companyName || currentUser.fullName || currentUser.agentName || currentUser.username || 'Đại lý';
                defaultUsername = currentUser.agentCode || currentUser.code || currentUser.username || 'agent';
                defaultRole = currentUser.role || 'AGENT';
            }

            const now = new Date();
            const pad = n => String(n).padStart(2, '0');
            const timestampStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

            const newLog = {
                id: Date.now() + Math.floor(Math.random() * 1000),
                timestamp: timestampStr,
                rawTime: now.getTime(),
                actor: logInfo.actor || defaultActor,
                username: logInfo.username || defaultUsername,
                role: logInfo.role || defaultRole,
                actionCategory: logInfo.actionCategory || 'Khác',
                actionTitle: logInfo.actionTitle || 'Thao tác hệ thống',
                target: logInfo.target || 'N/A',
                details: logInfo.details || '',
                ip: logInfo.ip || '113.161.42.12',
                device: (typeof navigator !== 'undefined' && navigator.userAgent)
                    ? (navigator.userAgent.includes('Windows') ? 'Windows Chrome' : 'Web Browser')
                    : 'Server Node.js'
            };

            const isOnline = typeof window !== 'undefined' && window.location &&
                window.location.protocol && window.location.protocol.startsWith('http');

            // Always keep recent logs in local data so client pages immediately display them
            data.activityLogs.unshift(newLog);
            if (data.activityLogs.length > 1000) {
                data.activityLogs = data.activityLogs.slice(0, 1000);
            }
            saveData(data, true); // true = skipServerSync so we don't trigger a duplicate bulk push

            if (isOnline) {
                const payload = JSON.stringify(newLog);
                if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
                    const blob = new Blob([payload], { type: 'application/json' });
                    navigator.sendBeacon('/api/logs', blob);
                } else if (typeof fetch !== 'undefined') {
                    fetch('/api/logs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: payload
                    }).catch(() => { });
                }
            }

            return newLog;
        },


        getActivityLogs: function (filters = {}) {
            const data = loadData();
            let logs = data.activityLogs || defaultData.activityLogs || [];

            if (filters.role && filters.role !== 'ALL') {
                logs = logs.filter(l => (l.role || '').toUpperCase() === filters.role.toUpperCase());
            }

            if (filters.category && filters.category !== 'ALL') {
                logs = logs.filter(l => (l.actionCategory || '') === filters.category);
            }

            if (filters.search) {
                const q = filters.search.toLowerCase().trim();
                logs = logs.filter(l =>
                    (l.actor || '').toLowerCase().includes(q) ||
                    (l.username || '').toLowerCase().includes(q) ||
                    (l.actionTitle || '').toLowerCase().includes(q) ||
                    (l.target || '').toLowerCase().includes(q) ||
                    (l.details || '').toLowerCase().includes(q) ||
                    (l.ip || '').includes(q)
                );
            }

            return logs;
        },

        clearActivityLogs: function () {
            const data = loadData();
            const currentAdminRole = (data.currentAdmin && data.currentAdmin.role || '').toUpperCase();
            const isSuperAdmin = (currentAdminRole === 'SUPER_ADMIN' || currentAdminRole === 'ITD_ADMIN' || currentAdminRole === 'ADMIN' || (data.currentAdmin && (data.currentAdmin.username || '').toLowerCase() === 'admin'));
            if (!isSuperAdmin) {
                return { success: false, message: 'Chỉ Quản trị viên Super Admin mới có quyền xóa nhật ký hệ thống.' };
            }
            data.activityLogs = [];
            saveData(data);
            return { success: true, message: 'Đã xóa toàn bộ nhật ký hoạt động hệ thống.' };
        },

        getCargoDocumentInfo: function (cargoType = '') {
            const val = String(cargoType || '').trim();
            const lower = val.toLowerCase();

            const isDgr = val.includes('DGR') || lower.includes('nguy hiểm');
            const isVal = val.includes('VAL') || lower.includes('giá trị cao') || lower.includes('linh kiện') || lower.includes('điện tử');
            const isPilMed = val.includes('PIL') || val.includes('MED') || lower.includes('dược phẩm') || lower.includes('y tế');
            const isPerAvi = val.includes('PER') || val.includes('AVI') || lower.includes('thực phẩm') || lower.includes('tươi sống') || lower.includes('hải sản') || lower.includes('nông sản');
            const isGoh = val.includes('GOH') || lower.includes('may mặc') || lower.includes('dệt may');

            if (isDgr) {
                return {
                    isRequired: true,
                    type: 'DGR',
                    title: 'Chứng từ an toàn hàng nguy hiểm / MSDS',
                    badge: 'MSDS / DGR Cert',
                    iconClass: 'fa-solid fa-triangle-exclamation text-amber-600',
                    desc: 'Hàng nguy hiểm yêu cầu bắt buộc phải có <strong>Phiếu an toàn hóa chất (MSDS)</strong> & <strong>Chứng chỉ DGR còn hiệu lực</strong> theo quy định an toàn hàng không ICAO/IATA.',
                    promptTitle: 'Tải lên chứng từ an toàn DGR / MSDS',
                    errorMsg: '<i class="fa-solid fa-circle-exclamation"></i> Vui lòng chọn và tải lên chứng từ an toàn DGR / MSDS!',
                    adminLabel: 'Chứng từ an toàn hàng nguy hiểm (DGR / MSDS):'
                };
            } else if (isVal) {
                return {
                    isRequired: true,
                    type: 'VAL',
                    title: 'Bảo hiểm hàng hóa & Declared Value Certificate',
                    badge: 'Bảo hiểm / Valuation Cert',
                    iconClass: 'fa-solid fa-shield-halved text-blue-600',
                    desc: 'Hàng linh kiện điện tử và hàng giá trị cao (VAL) yêu cầu bắt buộc phải đính kèm <strong>Hợp đồng/Giấy chứng nhận Bảo hiểm hàng hóa</strong> hoặc <strong>Giấy khai báo giá trị hàng hóa (Declared Value)</strong> theo quy định IATA.',
                    promptTitle: 'Tải lên Hợp đồng Bảo hiểm hàng hóa / Giấy khai báo giá trị (VAL)',
                    errorMsg: '<i class="fa-solid fa-circle-exclamation"></i> Vui lòng chọn và tải lên Hợp đồng Bảo hiểm hàng hóa hoặc Giấy khai báo giá trị (VAL)!',
                    adminLabel: 'Hợp đồng Bảo hiểm hàng hóa & Declared Value (VAL):'
                };
            } else if (isPilMed) {
                return {
                    isRequired: true,
                    type: 'PIL_MED',
                    title: 'Giấy phép nhập khẩu & Chứng nhận GDP/GSP Dược phẩm',
                    badge: 'Giấy phép Y tế / GDP Cert',
                    iconClass: 'fa-solid fa-briefcase-medical text-indigo-600',
                    desc: 'Hàng dược phẩm, vắc xin và thiết bị y tế yêu cầu bắt buộc phải có <strong>Giấy phép nhập khẩu y tế</strong> hoặc <strong>Giấy chứng nhận thực hành tốt phân phối (GDP/GSP)</strong> theo quy định Bộ Y tế.',
                    promptTitle: 'Tải lên Giấy phép nhập khẩu Y tế / Chứng nhận GDP/GSP',
                    errorMsg: '<i class="fa-solid fa-circle-exclamation"></i> Vui lòng chọn và tải lên Giấy phép nhập khẩu y tế hoặc chứng nhận GDP/GSP!',
                    adminLabel: 'Giấy phép Nhập khẩu Y tế & GDP/GSP (Medical Cert):'
                };
            } else if (isPerAvi) {
                return {
                    isRequired: true,
                    type: 'PER_AVI',
                    title: 'Giấy chứng nhận kiểm dịch & An toàn thực phẩm',
                    badge: 'Giấy kiểm dịch (Quarantine Cert)',
                    iconClass: 'fa-solid fa-clipboard-check text-emerald-600',
                    desc: 'Hàng thực phẩm, hải sản tươi sống và nông sản/động vật bắt buộc phải có <strong>Giấy chứng nhận kiểm dịch</strong> (Cục Thú y / Cục Bảo vệ Thực vật) còn hiệu lực theo quy định hàng không.',
                    promptTitle: 'Tải lên Giấy chứng nhận kiểm dịch Hải sản / Thực phẩm',
                    errorMsg: '<i class="fa-solid fa-circle-exclamation"></i> Vui lòng chọn và tải lên Giấy chứng nhận kiểm dịch cho hàng hải sản tươi sống / thực phẩm!',
                    adminLabel: 'Giấy chứng nhận kiểm dịch & An toàn thực phẩm (Quarantine Cert):'
                };
            } else if (isGoh) {
                return {
                    isRequired: true,
                    type: 'GOH',
                    title: 'Chứng nhận xuất xứ & Hóa đơn thương mại (CO / Invoice)',
                    badge: 'Chứng nhận CO / Invoice',
                    iconClass: 'fa-solid fa-file-contract text-purple-600',
                    desc: 'Hàng may mặc / dệt may yêu cầu đính kèm <strong>Chứng nhận xuất xứ (Certificate of Origin - CO)</strong> hoặc <strong>Hóa đơn thương mại / Packing List</strong> đi kèm lô hàng.',
                    promptTitle: 'Tải lên Chứng nhận xuất xứ (CO) / Hóa đơn thương mại',
                    errorMsg: '<i class="fa-solid fa-circle-exclamation"></i> Vui lòng chọn và tải lên Chứng nhận xuất xứ (CO) hoặc Hóa đơn thương mại!',
                    adminLabel: 'Chứng nhận xuất xứ & Hóa đơn thương mại (CO / Invoice):'
                };
            }

            return {
                isRequired: false,
                type: 'GEN',
                title: 'Hồ sơ chứng từ bổ sung (Nếu có)',
                badge: 'Chứng từ bổ sung',
                iconClass: 'fa-solid fa-file text-slate-500',
                desc: 'Hàng hóa thông thường không bắt buộc đính kèm chứng từ đặc thù. Quý đại lý có thể tải thêm Packing List / Commercial Invoice nếu cần.',
                promptTitle: 'Tải lên chứng từ bổ sung (Không bắt buộc)',
                errorMsg: '',
                adminLabel: 'Chứng từ đính kèm (Doc / File):'
            };
        },

        logoutAgent: function () {
            if (typeof window !== 'undefined') window._isManualLogout = true;
            try {
                document.cookie = "cargo_agent_code=; path=/; max-age=0; SameSite=Lax";
                fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
            } catch (e) { }
            const data = loadData();
            if (data.currentUser) {
                const cur = data.currentUser;
                this.logActivity({
                    actor: cur.companyName || cur.fullName || cur.agentCode || 'Đại lý',
                    username: cur.agentCode || 'AGENT',
                    role: 'AGENT',
                    actionCategory: 'Đăng nhập',
                    actionTitle: 'Đăng xuất hệ thống Agent',
                    target: 'Sàn Đấu giá Cargo',
                    details: `Đại lý ${cur.companyName || cur.agentCode} (Mã: ${cur.agentCode}) đã đăng xuất khỏi hệ thống.`
                });
            }
            const freshData = loadData();
            freshData.currentUser = null;
            saveData(freshData);
        },

        logoutAdmin: function () {
            if (typeof window !== 'undefined') window._isManualLogout = true;
            try {
                document.cookie = "cargo_admin_user=; path=/; max-age=0; SameSite=Lax";
                fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
            } catch (e) { }
            const data = loadData();
            if (data.currentAdmin) {
                this.logActivity({
                    actor: data.currentAdmin.fullName || data.currentAdmin.username,
                    username: data.currentAdmin.username,
                    role: data.currentAdmin.role || 'ADMIN',
                    actionCategory: 'Đăng nhập',
                    actionTitle: 'Đăng xuất hệ thống Admin',
                    target: 'Portal Quản trị',
                    details: `Quản trị viên ${data.currentAdmin.fullName} (@${data.currentAdmin.username}) đã đăng xuất khỏi hệ thống.`
                });
            }
            const freshData = loadData();
            freshData.currentAdmin = null;
            saveData(freshData);
        },

        syncHeaderUI: function () {
            const user = this.getCurrentUser();
            if (!user) return;

            document.querySelectorAll('.agent-company-name').forEach(el => {
                el.textContent = user.companyName;
            });
            document.querySelectorAll('.agent-code-badge').forEach(el => {
                el.textContent = user.agentCode;
            });
            document.querySelectorAll('.agent-rep-name').forEach(el => {
                el.textContent = user.fullName || user.repName;
            });

            const avatar = document.getElementById('headerUserAvatar') || document.getElementById('hdrAvatar');
            const code = document.getElementById('headerUserCode') || document.getElementById('hdrCode');
            const company = document.getElementById('headerCompanyName') || document.getElementById('hdrCompany');

            if (avatar) avatar.textContent = (user.agentCode || 'AG').slice(0, 2);
            if (code) code.textContent = user.agentCode;
            if (company) company.textContent = user.companyName;
        },

        syncAdminHeaderUI: function () {
            const pathname = (typeof window !== 'undefined' && window.location.pathname) ? window.location.pathname.toLowerCase() : '';
            const isAdminPage = pathname.includes('/admin/') || pathname.includes('\\admin\\') || pathname.startsWith('/admin');
            if (!isAdminPage) return;

            const admin = this.getCurrentAdmin();
            if (!admin) return;

            const roleKey = (admin.role || '').toUpperCase();
            const isSuperAdmin = (admin.username === 'admin' || roleKey === 'SUPER_ADMIN' || roleKey === 'ITD_ADMIN' || roleKey === 'ADMIN');
            
            // Resolve dynamic role information
            const allRoles = (this.getRoles ? this.getRoles() : []);
            const matchedRole = allRoles.find(r => r.id === admin.role || r.id === roleKey || (r.code && r.code.toUpperCase() === roleKey));

            let roleName = matchedRole ? matchedRole.name : (admin.role || 'QUẢN TRỊ VIÊN');
            let roleBadge = matchedRole ? (matchedRole.code || matchedRole.name) : (admin.role || 'ADMIN');
            let badgeClass = 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
            let roleIcon = '<i class="fa-solid fa-shield-halved text-[9px]"></i>';

            if (isSuperAdmin) {
                roleName = 'QUẢN TRỊ VIÊN TỐI CAO (SUPER ADMIN)';
                roleBadge = 'SUPER ADMIN';
                badgeClass = 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
                roleIcon = '<i class="fa-solid fa-crown text-[9px]"></i>';
            } else if (matchedRole) {
                if (matchedRole.color) {
                    badgeClass = matchedRole.color;
                } else {
                    badgeClass = 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30';
                }
                roleIcon = '<i class="fa-solid fa-user-shield text-[9px]"></i>';
            }

            document.querySelectorAll('.admin-header-name').forEach(el => {
                el.textContent = admin.fullName || admin.username;
            });

            document.querySelectorAll('.admin-header-role').forEach(el => {
                el.className = `text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass} inline-flex items-center gap-1`;
                el.innerHTML = `${roleIcon} ${roleBadge}`;
                el.title = roleName;
            });

            // Nav link visibility across headers, mobile menu, and dashboard cards based on granular permissions
            const canCreateAuction = this.hasPermission('auctions.create', admin);
            const canViewAuctions = this.hasPermission('auctions.view', admin);
            const canAccessAgentPortal = this.hasPermission('registrations.view', admin) ||
                                         this.hasPermission('agents.view', admin) ||
                                         this.hasPermission('staff.view', admin);

            if (!canCreateAuction) {
                document.querySelectorAll(`
                    a[href*="04-CreateAuction.html"], a[href*="create-auction"]
                `).forEach(el => {
                    el.style.display = 'none';
                });
            }

            if (!canViewAuctions) {
                document.querySelectorAll(`
                    a[href*="03-AuctionList.html"], a[href*="auction-list"], a[href*="auctions"]
                `).forEach(el => {
                    el.style.display = 'none';
                });
            }

            if (!canAccessAgentPortal) {
                document.querySelectorAll(`
                    a[href*="06-AgentList.html"], a[href*="agents"], a[href*="agent-list"]
                `).forEach(el => {
                    el.style.display = 'none';
                });
            }

            if (!isSuperAdmin) {
                // Settings & Audit Logs reserved for Super Admin / System Admin
                document.querySelectorAll(`
                    a[href*="08-Settings.html"], a[href*="settings"],
                    a[href*="10-AuditLogs.html"], a[href*="audit-logs"]
                `).forEach(el => {
                    el.style.display = 'none';
                });
            }

            // Block access on 04-CreateAuction.html if unauthorized
            if (!canCreateAuction && (pathname.includes('04-createauction') || pathname.endsWith('/create-auction'))) {
                const main = document.querySelector('main');
                if (main) {
                    main.innerHTML = `
                        <div class="max-w-xl mx-auto my-12 bg-white rounded-3xl p-8 border shadow-xl text-center space-y-4">
                            <div class="w-16 h-16 bg-red-100 text-red-600 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-sm">
                                <i class="fa-solid fa-ban"></i>
                            </div>
                            <h2 class="text-xl font-bold text-slate-900">Truy cập bị từ chối (Access Denied)</h2>
                            <p class="text-xs text-slate-600 leading-relaxed">
                                Tài khoản <strong>${admin.fullName || admin.username}</strong> (${roleName}) không có quyền <strong>Tạo phiên đấu giá (auctions.create)</strong>.
                            </p>
                            <a href="02-AdminDashboard.html" class="inline-block bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-3 rounded-xl transition shadow">
                                Quay lại Admin Dashboard
                            </a>
                        </div>
                    `;
                }
            }

            // Block access on 06-AgentList.html if no permission to view registrations, agents, or staff
            if (!canAccessAgentPortal && (pathname.includes('06-agentlist') || pathname.endsWith('/agents') || pathname.endsWith('/agent-list'))) {
                const main = document.querySelector('main');
                if (main) {
                    main.innerHTML = `
                        <div class="max-w-xl mx-auto my-12 bg-white rounded-3xl p-8 border shadow-xl text-center space-y-4">
                            <div class="w-16 h-16 bg-red-100 text-red-600 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-sm">
                                <i class="fa-solid fa-ban"></i>
                            </div>
                            <h2 class="text-xl font-bold text-slate-900">Truy cập bị từ chối (Access Denied)</h2>
                            <p class="text-xs text-slate-600 leading-relaxed">
                                Tài khoản <strong>${admin.fullName || admin.username}</strong> (${roleName}) không có quyền xem <strong>Hồ sơ đăng ký, Đại lý hoặc Nhân sự</strong>.
                            </p>
                            <a href="02-AdminDashboard.html" class="inline-block bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-3 rounded-xl transition shadow">
                                Quay lại Admin Dashboard
                            </a>
                        </div>
                    `;
                }
            }

            // Block access on 08-Settings.html for non-superadmin
            if (!isSuperAdmin && (pathname.includes('08-settings') || pathname.endsWith('/settings') || pathname.endsWith('/setting'))) {
                const main = document.querySelector('main');
                if (main) {
                    main.innerHTML = `
                        <div class="max-w-xl mx-auto my-12 bg-white rounded-3xl p-8 border shadow-xl text-center space-y-4">
                            <div class="w-16 h-16 bg-red-100 text-red-600 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-sm">
                                <i class="fa-solid fa-ban"></i>
                            </div>
                            <h2 class="text-xl font-bold text-slate-900">Truy cập bị từ chối (Access Denied)</h2>
                            <p class="text-xs text-slate-600 leading-relaxed">
                                Tài khoản <strong>${roleName}</strong> không có quyền can thiệp Cấu hình kỹ thuật hệ thống. Trang này thuộc thẩm quyền riêng của <strong>Quản trị viên SUPER ADMIN</strong>.
                            </p>
                            <a href="02-AdminDashboard.html" class="inline-block bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-3 rounded-xl transition shadow">
                                Quay lại Admin Dashboard
                            </a>
                        </div>
                    `;
                }
            }

            // Block access on 10-AuditLogs.html for non-superadmin
            if (!isSuperAdmin && (pathname.includes('10-auditlogs') || pathname.endsWith('/audit-logs') || pathname.endsWith('/logs'))) {
                const main = document.querySelector('main');
                if (main) {
                    main.innerHTML = `
                        <div class="max-w-xl mx-auto my-12 bg-white rounded-3xl p-8 border shadow-xl text-center space-y-4">
                            <div class="w-16 h-16 bg-red-100 text-red-600 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-sm">
                                <i class="fa-solid fa-ban"></i>
                            </div>
                            <h2 class="text-xl font-bold text-slate-900">Truy cập bị từ chối (Access Denied)</h2>
                            <p class="text-xs text-slate-600 leading-relaxed">
                                Tài khoản <strong>${roleName}</strong> không có quyền xem <strong>Nhật ký hoạt động & Bảo mật hệ thống</strong>. Thao tác này thuộc thẩm quyền riêng của <strong>Quản trị viên SUPER ADMIN</strong>.
                            </p>
                            <a href="02-AdminDashboard.html" class="inline-block bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-3 rounded-xl transition shadow">
                                Quay lại Admin Dashboard
                            </a>
                        </div>
                    `;
                }
            }

            // Mount Admin Notification Center (Bell + Dropdown)
            this.initAdminNotificationCenter();
        },

        adminNotifFilter: 'ALL',
        adminNotifSelectMode: false,
        selectedAdminNotifIds: new Set(),

        setAdminNotifFilter: function (filter) {
            this.adminNotifFilter = filter;
            const btnAll = document.getElementById('adminNotifTabAll');
            const btnPay = document.getElementById('adminNotifTabPayment');
            const btnAlert = document.getElementById('adminNotifTabAlert');
            if (btnAll && btnPay && btnAlert) {
                const active = 'px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold transition';
                const inactive = 'px-2.5 py-1 rounded-lg text-slate-600 hover:bg-slate-200 transition';
                btnAll.className = filter === 'ALL' ? active : inactive;
                btnPay.className = (filter === 'PAYMENT' ? active : inactive) + ' flex items-center gap-1';
                btnAlert.className = filter === 'ALERT' ? active : inactive;
            }
            this.renderAdminNotificationList();
        },

        toggleAdminNotifSelectMode: function (forceState) {
            this.adminNotifSelectMode = typeof forceState === 'boolean' ? forceState : !this.adminNotifSelectMode;
            if (!this.adminNotifSelectMode) {
                this.selectedAdminNotifIds.clear();
            }
            this.renderAdminNotificationList();
        },

        toggleAdminNotifSelection: function (id) {
            const sId = String(id);
            if (this.selectedAdminNotifIds.has(sId)) {
                this.selectedAdminNotifIds.delete(sId);
            } else {
                this.selectedAdminNotifIds.add(sId);
            }
            this.renderAdminNotificationList();
        },

        selectAllAdminNotifs: function (selectAll) {
            const allAdminNotifs = this.getAdminNotifications();
            let filtered = allAdminNotifs;
            if (this.adminNotifFilter === 'PAYMENT') {
                filtered = allAdminNotifs.filter(n => n.type === 'PAYMENT' || (n.title || '').includes('ĐẠI LÝ BÁO CHUYỂN KHOẢN') || (n.message || '').includes('đối soát sao kê'));
            } else if (this.adminNotifFilter === 'ALERT') {
                filtered = allAdminNotifs.filter(n => n.type === 'ALERT' || (n.title || '').includes('CẢNH BÁO') || (n.title || '').includes('KHÓA'));
            }

            if (selectAll) {
                filtered.forEach(n => this.selectedAdminNotifIds.add(String(n.id)));
            } else {
                filtered.forEach(n => this.selectedAdminNotifIds.delete(String(n.id)));
            }
            this.renderAdminNotificationList();
        },

        handleAdminNotifClick: function (event, id) {
            if (event.target.closest('a, button, input')) return;
            if (this.adminNotifSelectMode) {
                this.toggleAdminNotifSelection(id);
            } else {
                this.markAdminNotificationAsRead(id);
                const data = loadData();
                const notif = (data.notifications || []).find(n => String(n.id) === String(id));
                if (notif) {
                    const titleUpper = String(notif.title || '').toUpperCase();
                    const msgUpper = String(notif.message || '').toUpperCase();
                    const combined = titleUpper + ' ' + msgUpper;
                    const targetWonId = notif.wonId || combined.match(/WON-[\w-]+/)?.[0];
                    const isRefund = notif.type === 'REFUND_REQUEST' || titleUpper.includes('HOÀN TIỀN') || msgUpper.includes('HOAN TIEN') || msgUpper.includes('HOÀN TIỀN');
                    const isPayment = notif.type === 'PAYMENT' || titleUpper.includes('CHUYỂN KHOẢN');

                    let targetUrl = '';
                    if (isRefund && targetWonId) {
                        targetUrl = `03-AuctionList.html?tab=refund&refund=${targetWonId}`;
                    } else if (isPayment && targetWonId) {
                        targetUrl = `03-AuctionList.html?tab=won&search=${targetWonId}&reconcile=${targetWonId}`;
                    } else if (notif.link) {
                        targetUrl = notif.link;
                        if (targetUrl.startsWith('/Admin/')) targetUrl = targetUrl.replace('/Admin/', '');
                    }

                    if (targetUrl) {
                        window.location.href = targetUrl;
                    }
                }
            }
        },

        deleteAdminNotification: function (id) {
            this.deleteNotification(id);
            this.selectedAdminNotifIds.delete(String(id));
            this.renderAdminNotificationList();
        },

        deleteSelectedAdminNotifications: async function () {
            const ids = Array.from(this.selectedAdminNotifIds);
            if (ids.length === 0) return;
            const ok = window.showConfirm ? await window.showConfirm(`Bạn có chắc chắn muốn xóa ${ids.length} thông báo đã chọn?`) : confirm(`Bạn có chắc chắn muốn xóa ${ids.length} thông báo đã chọn?`);
            if (ok) {
                this.deleteNotifications(ids);
                this.selectedAdminNotifIds.clear();
                this.adminNotifSelectMode = false;
                this.renderAdminNotificationList();
            }
        },

        deleteAllAdminNotifications: async function () {
            const allAdminNotifs = this.getAdminNotifications();
            if (allAdminNotifs.length === 0) return;
            const ok = window.showConfirm ? await window.showConfirm(`Bạn có chắc chắn muốn xóa tất cả ${allAdminNotifs.length} thông báo admin?`) : confirm(`Bạn có chắc chắn muốn xóa tất cả ${allAdminNotifs.length} thông báo admin?`);
            if (ok) {
                const ids = allAdminNotifs.map(n => n.id);
                this.deleteNotifications(ids);
                this.selectedAdminNotifIds.clear();
                this.adminNotifSelectMode = false;
                this.renderAdminNotificationList();
            }
        },

        getAdminNotifications: function () {
            const data = loadData();
            const notifs = deduplicateNotifications(data.notifications || []);

            // Only show notifications scoped to ADMIN or STAFF — never leak agent-only notifications
            const adminNotifs = notifs.filter(n => {
                const role = String(n.targetRole || '').trim().toUpperCase();
                return role === 'ADMIN' || role === 'STAFF';
            });

            const readIdSet = new Set((Array.isArray(data.readNotificationIds) ? data.readNotificationIds : []).map(String));
            const deletedIdSet = new Set((Array.isArray(data.deletedNotificationIds) ? data.deletedNotificationIds : []).map(String));
            return adminNotifs.filter(n => !deletedIdSet.has(String(n.id))).map(n => {
                const isRead = n.read === true || readIdSet.has(String(n.id));
                const ts = n.timestamp || n.createdAt || (typeof n.id === 'number' && n.id > 1577836800000 ? n.id : (typeof n.id === 'string' && !isNaN(Number(n.id)) && Number(n.id) > 1577836800000 ? Number(n.id) : null));
                let displayTime = n.time;
                if (ts) {
                    displayTime = formatTimeAgo(ts, n.time);
                } else if (!n.time || n.time === 'Vừa xong') {
                    displayTime = 'Cách đây ít phút';
                }

                return {
                    ...n,
                    read: isRead,
                    unread: !isRead,
                    time: displayTime
                };
            }).sort((a, b) => (Number(b.timestamp || b.createdAt || b.id) || 0) - (Number(a.timestamp || a.createdAt || a.id) || 0));
        },

        markAllAdminNotificationsAsRead: function () {
            // Only mark admin/staff notifications as read — leave agent notifications untouched
            this.getAdminNotifications().forEach(n => {
                if (!n.read) this.markNotificationRead(n.id);
            });
            this.renderAdminNotificationList();
        },

        markAdminNotificationAsRead: function (id) {
            this.markNotificationRead(id);
            this.renderAdminNotificationList();
        },

        initAdminNotificationCenter: function () {
            if (typeof document === 'undefined') return;
            const admin = this.getCurrentAdmin();
            if (!admin) return;

            // Find the right-side user profile container in the header
            const userAnchor = document.querySelector('header a[href*="01-AdminLogin"], header a[onclick*="logoutAdmin"], header .admin-header-name, header .admin-header-role');
            if (!userAnchor) return;

            const targetContainer = userAnchor.closest('.admin-right') || userAnchor.closest('.flex.items-center') || userAnchor.parentElement;
            if (!targetContainer) return;

            const sepEl = targetContainer.querySelector('.admin-sep');
            const avatarEl = targetContainer.querySelector('.admin-avatar, .admin-header-avatar') || targetContainer.querySelector('.admin-user-info');
            const insertionTarget = sepEl || avatarEl || targetContainer.querySelector('.admin-header-role') || userAnchor;

            // If not mounted yet, mount bell container before user profile elements
            let bellWrapper = document.getElementById('adminNotifBellWrapper');
            if (!bellWrapper) {
                bellWrapper = document.createElement('div');
                bellWrapper.id = 'adminNotifBellWrapper';
                bellWrapper.className = 'relative inline-block';
                bellWrapper.innerHTML = `
                    <button id="adminNotifBellBtn" type="button" class="relative p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer flex items-center justify-center focus:outline-none" title="Thông báo & Yêu cầu duyệt">
                        <i class="fa-solid fa-bell text-sm"></i>
                        <span id="adminNotifBadge" class="hidden absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center shadow-sm animate-pulse border-2 border-slate-900">0</span>
                    </button>

                    <!-- Dropdown Modal / Popover (Opens from right to left) -->
                    <div id="adminNotifDropdown" class="hidden absolute right-0 top-full mt-2 w-80 sm:w-[400px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 text-slate-800 z-[9999] overflow-hidden">
                        <div class="px-4 py-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                            <div class="flex items-center gap-2">
                                <div class="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-xs text-white shadow-xs">
                                    <i class="fa-solid fa-bell"></i>
                                </div>
                                <div>
                                    <h4 class="font-bold text-xs text-white">Thông báo & Yêu cầu duyệt</h4>
                                    <p class="text-[10px] text-slate-400" id="adminNotifSummaryText">0 thông báo mới</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                <button type="button" onclick="CargoStore.markAllAdminNotificationsAsRead()" class="text-[11px] text-blue-400 hover:text-blue-300 font-medium hover:underline cursor-pointer flex items-center gap-1" title="Đánh dấu tất cả là đã đọc">
                                    <i class="fa-solid fa-check-double"></i> Đã đọc
                                </button>
                                <button type="button" onclick="CargoStore.deleteAllAdminNotifications()" class="text-[11px] text-rose-400 hover:text-rose-300 font-medium hover:underline cursor-pointer flex items-center gap-1" title="Xóa tất cả thông báo admin">
                                    <i class="fa-regular fa-trash-can"></i> Xóa tất cả
                                </button>
                            </div>
                        </div>

                        <!-- Filter Tabs & Selection Toggle in Notification Center -->
                        <div class="flex items-center justify-between p-2 bg-slate-50 border-b border-slate-100 text-[11px] font-semibold">
                            <div class="flex items-center gap-1">
                                <button type="button" onclick="CargoStore.setAdminNotifFilter('ALL')" id="adminNotifTabAll" class="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold transition">Tất cả</button>
                                <button type="button" onclick="CargoStore.setAdminNotifFilter('PAYMENT')" id="adminNotifTabPayment" class="px-2.5 py-1 rounded-lg text-slate-600 hover:bg-slate-200 transition flex items-center gap-1">
                                    💳 Chờ duyệt CK <span id="adminNotifPayCount" class="hidden bg-amber-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold">0</span>
                                </button>
                                <button type="button" onclick="CargoStore.setAdminNotifFilter('ALERT')" id="adminNotifTabAlert" class="px-2.5 py-1 rounded-lg text-slate-600 hover:bg-slate-200 transition">Cảnh báo</button>
                            </div>
                            <button type="button" id="adminNotifSelectBtn" onclick="CargoStore.toggleAdminNotifSelectMode()" class="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 transition flex items-center gap-1 text-[11px] cursor-pointer font-medium" title="Bật/tắt chọn xóa nhiều thông báo">
                                <i class="fa-regular fa-square-check text-blue-600"></i> <span id="adminNotifSelectBtnText">Chọn xóa</span>
                            </button>
                        </div>

                        <!-- Selection Toolbar (visible when select mode is active) -->
                        <div id="adminNotifSelectionBar" class="hidden px-3 py-1.5 bg-slate-800 text-white flex items-center justify-between text-xs border-b border-slate-700">
                            <div class="flex items-center gap-2">
                                <input type="checkbox" id="adminNotifSelectAllCb" onchange="CargoStore.selectAllAdminNotifs(this.checked)" class="rounded border-slate-600 text-blue-500 focus:ring-blue-400 cursor-pointer w-4 h-4">
                                <label for="adminNotifSelectAllCb" class="text-[11px] font-medium cursor-pointer text-slate-200">Chọn tất cả</label>
                                <span class="text-[11px] text-slate-400 ml-1">(<span id="adminNotifSelectedCount" class="font-bold text-amber-400">0</span>/<span id="adminNotifTotalCount">0</span>)</span>
                            </div>
                            <button type="button" id="adminNotifDeleteSelectedBtn" onclick="CargoStore.deleteSelectedAdminNotifications()" disabled class="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg text-[11px] transition flex items-center gap-1 cursor-pointer">
                                <i class="fa-regular fa-trash-can"></i> Xóa mục chọn
                            </button>
                        </div>

                        <!-- Notification List Items -->
                        <div id="adminNotifList" class="max-h-[360px] overflow-y-auto divide-y divide-slate-100 p-1">
                            <!-- Populated dynamically -->
                        </div>

                        <!-- Dropdown Footer -->
                        <div class="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
                            <a href="03-AuctionList.html?tab=won" class="text-blue-600 hover:text-blue-800 font-semibold text-[11px] flex items-center gap-1">
                                <i class="fa-solid fa-list-check"></i> Xem danh sách đơn thắng thầu
                            </a>
                            <button type="button" onclick="document.getElementById('adminNotifDropdown').classList.add('hidden')" class="text-slate-500 hover:text-slate-700 text-[11px] font-medium cursor-pointer">
                                Đóng
                            </button>
                        </div>
                    </div>
                `;

                if (insertionTarget) {
                    targetContainer.insertBefore(bellWrapper, insertionTarget);
                } else {
                    targetContainer.appendChild(bellWrapper);
                }

                // Toggle click handler
                const btn = bellWrapper.querySelector('#adminNotifBellBtn');
                const dropdown = bellWrapper.querySelector('#adminNotifDropdown');
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    dropdown.classList.toggle('hidden');
                    if (!dropdown.classList.contains('hidden')) {
                        CargoStore.renderAdminNotificationList();
                    }
                });

                // Click outside to close
                document.addEventListener('click', (e) => {
                    if (!bellWrapper.contains(e.target)) {
                        dropdown.classList.add('hidden');
                    }
                });
            } else {
                if (insertionTarget && bellWrapper.nextElementSibling !== insertionTarget) {
                    targetContainer.insertBefore(bellWrapper, insertionTarget);
                }
            }

            this.renderAdminNotificationList();
        },

        renderAdminNotificationList: function () {
            if (typeof document === 'undefined') return;
            const notifListEl = document.getElementById('adminNotifList');
            const badgeEl = document.getElementById('adminNotifBadge');
            const summaryEl = document.getElementById('adminNotifSummaryText');
            const payCountEl = document.getElementById('adminNotifPayCount');

            const selectionBarEl = document.getElementById('adminNotifSelectionBar');
            const selectBtnTextEl = document.getElementById('adminNotifSelectBtnText');
            const selectAllCbEl = document.getElementById('adminNotifSelectAllCb');
            const selectedCountEl = document.getElementById('adminNotifSelectedCount');
            const totalCountEl = document.getElementById('adminNotifTotalCount');
            const deleteSelectedBtnEl = document.getElementById('adminNotifDeleteSelectedBtn');

            const allAdminNotifs = this.getAdminNotifications();
            const unreadCount = allAdminNotifs.filter(n => !n.read).length;
            const pendingPayCount = allAdminNotifs.filter(n => !n.read && (n.type === 'PAYMENT' || (n.title || '').includes('ĐẠI LÝ BÁO CHUYỂN KHOẢN'))).length;

            if (badgeEl) {
                if (unreadCount > 0) {
                    badgeEl.textContent = unreadCount > 99 ? '99+' : unreadCount;
                    badgeEl.classList.remove('hidden');
                } else {
                    badgeEl.classList.add('hidden');
                }
            }

            if (summaryEl) {
                summaryEl.textContent = unreadCount > 0 ? `${unreadCount} thông báo mới chưa đọc` : 'Không có thông báo chưa đọc';
            }

            if (payCountEl) {
                if (pendingPayCount > 0) {
                    payCountEl.textContent = pendingPayCount;
                    payCountEl.classList.remove('hidden');
                } else {
                    payCountEl.classList.add('hidden');
                }
            }

            if (!notifListEl) return;

            let filtered = allAdminNotifs;
            if (this.adminNotifFilter === 'PAYMENT') {
                filtered = allAdminNotifs.filter(n => n.type === 'PAYMENT' || (n.title || '').includes('ĐẠI LÝ BÁO CHUYỂN KHOẢN') || (n.message || '').includes('đối soát sao kê'));
            } else if (this.adminNotifFilter === 'ALERT') {
                filtered = allAdminNotifs.filter(n => n.type === 'ALERT' || (n.title || '').includes('CẢNH BÁO') || (n.title || '').includes('KHÓA'));
            }

            // Update Selection Mode Toolbar
            if (selectionBarEl) {
                if (this.adminNotifSelectMode) {
                    selectionBarEl.classList.remove('hidden');
                } else {
                    selectionBarEl.classList.add('hidden');
                }
            }
            if (selectBtnTextEl) {
                selectBtnTextEl.textContent = this.adminNotifSelectMode ? 'Hủy chọn' : 'Chọn xóa';
            }

            const totalFilteredCount = filtered.length;
            const currentSelectedCount = Array.from(this.selectedAdminNotifIds).filter(id => filtered.some(n => String(n.id) === String(id))).length;

            if (selectedCountEl) selectedCountEl.textContent = currentSelectedCount;
            if (totalCountEl) totalCountEl.textContent = totalFilteredCount;
            if (deleteSelectedBtnEl) deleteSelectedBtnEl.disabled = currentSelectedCount === 0;
            if (selectAllCbEl) {
                selectAllCbEl.checked = totalFilteredCount > 0 && currentSelectedCount === totalFilteredCount;
            }

            if (filtered.length === 0) {
                notifListEl.innerHTML = `
                    <div class="py-8 text-center text-slate-400">
                        <i class="fa-solid fa-bell-slash text-2xl mb-2 text-slate-300 block"></i>
                        <p class="text-xs">Không có thông báo nào trong mục này</p>
                    </div>
                `;
                return;
            }

            notifListEl.innerHTML = filtered.slice(0, 30).map(n => {
                const sId = String(n.id);
                const isUnread = !n.read;
                const isSelected = this.selectedAdminNotifIds.has(sId);
                const titleUpper = String(n.title || '').toUpperCase();
                const msgUpper = String(n.message || '').toUpperCase();
                const combined = titleUpper + ' ' + msgUpper;

                const isPayment = n.type === 'PAYMENT' || titleUpper.includes('CHUYỂN KHOẢN');
                const isRefund = n.type === 'REFUND_REQUEST' || titleUpper.includes('HOÀN TIỀN') || msgUpper.includes('HOAN TIEN') || msgUpper.includes('HOÀN TIỀN');
                const isAlert = n.type === 'ALERT' || titleUpper.includes('KHÓA');

                let iconClass = 'fa-info-circle text-blue-600 bg-blue-50';
                let iconFa = 'fa-bell';
                let cardBg = isUnread ? 'bg-blue-50/40 font-semibold' : 'bg-white';

                if (isPayment) {
                    iconClass = 'fa-credit-card text-emerald-600 bg-emerald-50';
                    iconFa = 'fa-credit-card';
                    if (isUnread) cardBg = 'bg-emerald-50/50 border-l-4 border-emerald-500';
                } else if (isRefund) {
                    iconClass = 'fa-hand-holding-dollar text-indigo-600 bg-indigo-50';
                    iconFa = 'fa-hand-holding-dollar';
                    if (isUnread) cardBg = 'bg-indigo-50/50 border-l-4 border-indigo-500';
                } else if (isAlert) {
                    iconClass = 'fa-triangle-exclamation text-rose-600 bg-rose-50';
                    iconFa = 'fa-triangle-exclamation';
                    if (isUnread) cardBg = 'bg-rose-50/40 border-l-4 border-rose-500';
                }

                if (isSelected) {
                    cardBg = 'bg-blue-50/80 border-2 border-blue-500 font-semibold';
                }

                // Resolve link for admin
                let actionBtn = '';
                const targetWonId = n.wonId || combined.match(/WON-[\w-]+/)?.[0];

                if (isRefund && targetWonId) {
                    actionBtn = `
                        <a href="03-AuctionList.html?tab=refund&refund=${targetWonId}" onclick="CargoStore.markAdminNotificationAsRead(${n.id})" class="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-[10px] font-bold shadow-xs transition">
                            <i class="fa-solid fa-hand-holding-dollar"></i> Xem & Xử lý hoàn tiền
                        </a>
                    `;
                } else if (isPayment && targetWonId) {
                    actionBtn = `
                        <a href="03-AuctionList.html?tab=won&search=${targetWonId}&reconcile=${targetWonId}" onclick="CargoStore.markAdminNotificationAsRead(${n.id})" class="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[10px] font-bold shadow-xs transition">
                            <i class="fa-solid fa-magnifying-glass-dollar"></i> Đối soát ngay
                        </a>
                    `;
                } else if (titleUpper.includes('ĐĂNG KÝ') || (n.link || '').includes('06-AgentList.html')) {
                    actionBtn = `
                        <a href="06-AgentList.html" onclick="CargoStore.markAdminNotificationAsRead(${n.id})" class="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-[10px] font-bold shadow-xs transition">
                            <i class="fa-solid fa-user-check"></i> Duyệt hồ sơ
                        </a>
                    `;
                }

                return `
                    <div class="group relative p-3 hover:bg-slate-50 transition rounded-xl flex items-start gap-2.5 cursor-pointer ${cardBg}" onclick="CargoStore.handleAdminNotifClick(event, ${n.id})">
                        ${this.adminNotifSelectMode ? `
                            <div class="flex items-center h-full pt-1">
                                <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="event.stopPropagation(); CargoStore.toggleAdminNotifSelection(${n.id})" class="admin-notif-checkbox rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4">
                            </div>
                        ` : ''}
                        <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm ${iconClass}">
                            <i class="fa-solid ${iconFa}"></i>
                        </div>
                        <div class="flex-1 min-w-0 space-y-1 pr-6">
                            <div class="flex items-center justify-between gap-1">
                                <p class="text-xs font-bold text-slate-900 truncate">${n.title || 'Thông báo'}</p>
                                <span class="text-[10px] text-slate-400 whitespace-nowrap">${n.time || 'Vừa xong'}</span>
                            </div>
                            <p class="text-[11px] text-slate-600 leading-snug break-words">${n.message || ''}</p>
                            <div class="flex items-center justify-between pt-1">
                                ${actionBtn}
                                ${isUnread ? '<span class="w-2 h-2 rounded-full bg-blue-600"></span>' : ''}
                            </div>
                        </div>
                        ${!this.adminNotifSelectMode ? `
                            <button type="button" onclick="event.stopPropagation(); CargoStore.deleteAdminNotification(${n.id})" class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-white shadow-xs hover:bg-rose-100 hover:text-rose-600 text-slate-400 p-1.5 rounded-lg border border-slate-200 transition cursor-pointer" title="Xóa thông báo này">
                                <i class="fa-regular fa-trash-can text-xs"></i>
                            </button>
                        ` : ''}
                    </div>
                `;
            }).join('');
        },

        getBankConfig: function () {
            const data = loadData();
            if (!data.bankConfig) {
                data.bankConfig = JSON.parse(JSON.stringify(defaultData.bankConfig));
                saveData(data);
            }
            return data.bankConfig;
        },

        updateBankConfig: function (cfg) {
            const data = loadData();
            data.bankConfig = {
                ...(data.bankConfig || defaultData.bankConfig),
                ...cfg
            };
            saveData(data);
            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Cập nhật ngân hàng VietQR',
                target: data.bankConfig.bankName || 'VietQR',
                details: `Cập nhật thông tin tài khoản ngân hàng thụ hưởng: ${data.bankConfig.bankName} - STK: ${data.bankConfig.accountNumber} (${data.bankConfig.accountName}).`
            });
            return {
                success: true,
                message: 'Đã cập nhật thông tin tài khoản ngân hàng thụ hưởng thành công!',
                bankConfig: data.bankConfig
            };
        },

        generatePaymentMemo: function (wonId, agentCode) {
            const cfg = this.getBankConfig();
            const prefix = (cfg.memoPrefix || 'CARGO').trim().toUpperCase();
            const wId = (wonId || '').trim();
            const aCode = (agentCode || '').trim().toUpperCase();
            return `${prefix} ${wId} ${aCode}`.trim();
        },

        generateVietQRUrl: function (amount, memo) {
            const cfg = this.getBankConfig();
            const bin = cfg.bankBin || '970436';
            const acc = cfg.accountNumber || '';
            const amt = Math.round(Number(amount) || 0);
            const desc = encodeURIComponent(memo || '');
            const accName = encodeURIComponent(cfg.accountName || 'CONG TY CP HANG KHONG VIETRAVEL');
            return `https://img.vietqr.io/image/${bin}-${acc}-compact2.png?amount=${amt}&addInfo=${desc}&accountName=${accName}`;
        },

        getAvailableRoutes: function () {
            const self = this;
            const pairs = [
                // Trục chính Bắc - Nam
                ['SGN', 'HAN'], ['HAN', 'SGN'],
                ['SGN', 'DAD'], ['DAD', 'SGN'],
                ['HAN', 'DAD'], ['DAD', 'HAN'],
                // Tuyến du lịch & công nghiệp từ Sài Gòn
                ['SGN', 'PQC'], ['PQC', 'SGN'],
                ['SGN', 'CXR'], ['CXR', 'SGN'],
                ['SGN', 'DLI'], ['DLI', 'SGN'],
                ['SGN', 'HPH'], ['HPH', 'SGN'],
                ['SGN', 'HUI'], ['HUI', 'SGN'],
                ['SGN', 'UIH'], ['UIH', 'SGN'],
                ['SGN', 'VII'], ['VII', 'SGN'],
                ['SGN', 'VCA'], ['VCA', 'SGN'],
                ['SGN', 'VDO'], ['VDO', 'SGN'],
                // Tuyến từ Hà Nội
                ['HAN', 'PQC'], ['PQC', 'HAN'],
                ['HAN', 'CXR'], ['CXR', 'HAN'],
                ['HAN', 'DLI'], ['DLI', 'HAN'],
                ['HAN', 'HUI'], ['HUI', 'HAN'],
                ['HAN', 'UIH'], ['UIH', 'HAN'],
                ['HAN', 'VCA'], ['VCA', 'HAN'],
                // Tuyến từ Đà Nẵng
                ['DAD', 'PQC'], ['PQC', 'DAD'],
                ['DAD', 'CXR'], ['CXR', 'DAD']
            ];
            return pairs.map(([orig, dest]) => {
                const c1 = self.getAirportCity ? self.getAirportCity(orig) : orig;
                const c2 = self.getAirportCity ? self.getAirportCity(dest) : dest;
                return {
                    pair: `${orig}-${dest}`,
                    name: `${c1} (${orig}) ➔ ${c2} (${dest})`,
                    origin: orig,
                    dest: dest
                };
            });
        },

        getAllRoutes: function () {
            const data = loadData();
            const map = new Map();
            const self = this;

            const addPair = (orig, dest) => {
                if (!orig || !dest) return;
                orig = String(orig).trim().toUpperCase();
                dest = String(dest).trim().toUpperCase();
                if (orig === dest || orig.length !== 3 || dest.length !== 3) return;
                const routeKey = `${orig} - ${dest}`;
                if (!map.has(routeKey)) {
                    const c1 = self.getAirportCity ? self.getAirportCity(orig) : orig;
                    const c2 = self.getAirportCity ? self.getAirportCity(dest) : dest;
                    map.set(routeKey, {
                        route: routeKey,
                        pair: `${orig}-${dest}`,
                        label: `${routeKey} (${c1} - ${c2})`,
                        origin: orig,
                        dest: dest
                    });
                }
            };

            // 1. Quét toàn bộ các chuyến bay thực tế trong cơ sở dữ liệu
            (data.auctions || []).forEach(a => {
                if (a.origin && a.destination) {
                    addPair(a.origin, a.destination);
                } else if (a.route) {
                    const parts = a.route.split('-').map(s => s.trim());
                    if (parts.length === 2) addPair(parts[0], parts[1]);
                }
            });
            (data.wonAuctions || []).forEach(w => {
                if (w.route) {
                    const parts = w.route.split('-').map(s => s.trim());
                    if (parts.length === 2) addPair(parts[0], parts[1]);
                }
            });

            // 2. Bổ sung mạng đường bay tiêu chuẩn của các sân bay
            (this.getAvailableRoutes() || []).forEach(r => {
                addPair(r.origin, r.dest);
            });

            return Array.from(map.values());
        },

        getRouteSubscriptions: function (agentCode) {
            const data = loadData();
            if (!data.routeSubscriptions) data.routeSubscriptions = {};
            const code = (agentCode || (data.currentUser ? data.currentUser.agentCode : '') || '').trim().toUpperCase();
            if (!data.routeSubscriptions[code]) {
                data.routeSubscriptions[code] = {
                    routes: [],
                    notifyOnNewAuction: true,
                    notifyOnOutbid: true,
                    notifyOnClosingSoon: true,
                    notifyOnWon: true,
                    emailAlert: true,
                    soundAlert: true
                };
                saveData(data);
            }
            return data.routeSubscriptions[code];
        },

        saveRouteSubscriptions: function (agentCode, settings) {
            const data = loadData();
            if (!data.routeSubscriptions) data.routeSubscriptions = {};
            const code = (agentCode || (data.currentUser ? data.currentUser.agentCode : '') || '').trim().toUpperCase();
            data.routeSubscriptions[code] = {
                ...(data.routeSubscriptions[code] || {}),
                ...settings
            };
            saveData(data);
            return {
                success: true,
                message: 'Đã lưu cài đặt thông báo tuyến bay thành công!',
                settings: data.routeSubscriptions[code]
            };
        },

        toggleRouteSubscription: function (agentCode, routePair) {
            const data = loadData();
            const code = (agentCode || (data.currentUser ? data.currentUser.agentCode : '') || '').trim().toUpperCase();
            const subs = this.getRouteSubscriptions(code);
            const pair = (routePair || '').trim().toUpperCase().replace(/\s+/g, '');
            let routes = (subs.routes || []).map(r => String(r).replace(/\s+/g, '').toUpperCase());
            let isSubscribed = false;
            if (routes.includes(pair)) {
                routes = routes.filter(r => r !== pair);
                isSubscribed = false;
            } else {
                routes.push(pair);
                isSubscribed = true;
            }
            subs.routes = routes;
            this.saveRouteSubscriptions(code, subs);
            return {
                success: true,
                isSubscribed: isSubscribed,
                routes: routes,
                message: isSubscribed
                    ? `🔔 Đã bật nhận thông báo phiên đấu giá mới cho tuyến ${pair}!`
                    : `🔕 Đã tắt thông báo cho tuyến ${pair}.`
            };
        },

        isRouteSubscribed: function (agentCode, routePair) {
            const subs = this.getRouteSubscriptions(agentCode);
            const pair = (routePair || '').trim().toUpperCase().replace(/\s+/g, '');
            const routes = (subs.routes || []).map(r => String(r).replace(/\s+/g, '').toUpperCase());
            return routes.includes(pair);
        },

        getCurrentTime: function () {
            return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        },

        syncWithServer: function (force = false) {
            return syncWithServer(force);
        },

        resetAllData: async function () {
            try {
                const apiUrl = (typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol.startsWith('http'))
                    ? '/api/reset'
                    : '/api/reset';
                await fetch(apiUrl, { method: 'POST' }).catch(() => { });
            } catch (e) { }

            try {
                if (typeof localStorage !== 'undefined') {
                    // Clear any existing data so loadData() uses fresh defaultData
                    localStorage.removeItem(STORAGE_KEY);
                    localStorage.removeItem('CARGO_BIDDING_SERVER_VERSION');
                    const fresh = loadData();
                    fresh.bids = [];
                    fresh.wonAuctions = [];
                    (fresh.auctions || []).forEach(a => {
                        if (a.status === 'OPEN') {
                            a.bidsCount = 0;
                            a.currentPriceKg = a.startingPriceKg;
                            a.leadingAgentCode = null;
                            a.leadingAgentName = null;
                            a.winnerAgentCode = null;
                            a.winnerAgentName = null;
                            a.winningPriceKg = 0;
                        }
                    });
                    saveData(fresh);
                    window.dispatchEvent(new CustomEvent('cargostore_updated', { detail: fresh }));
                }
            } catch (e) {
                console.error('Error resetting CargoStore data:', e);
            }
            return { success: true, message: 'Đã khôi phục toàn bộ dữ liệu hệ thống về mặc định!' };
        }

    };
})();

// Attach to global window object
if (typeof window !== 'undefined') {
    window.CargoStore = CargoStore;
}
if (typeof globalThis !== 'undefined') {
    globalThis.CargoStore = CargoStore;
}

// Auto sync headers & Session Lock Guard on page load & realtime events
if (typeof window !== 'undefined') {
    let isRedirecting = false;

    // --- Pretty URL Router (Client-side URL beautifier & link transformer) ---
    function initPrettyUrlRouter() {
        if (typeof window === 'undefined' || !window.location) return;
        // Only activate over HTTP/HTTPS to never break file:/// local usage
        if (!window.location.protocol.startsWith('http')) return;

        const ROUTE_MAP = {
            // Agent pages
            '00-home.html': '/home',
            '01-login.html': '/login',
            '02-dashboard.html': '/dashboard',
            '03-index.html': '/auctions',
            '04-detail.html': '/detail',
            '05-watchlist.html': '/watchlist',
            '06-mybids.html': '/my-bids',
            '07-wonauction.html': '/won-auction',
            '08-notifications.html': '/notifications',
            '09-profile.html': '/profile',
            '10-terms.html': '/terms',
            'register.html': '/register',

            // Admin pages
            'admin/01-adminlogin.html': '/admin/login',
            '01-adminlogin.html': '/admin/login',
            'admin/02-admindashboard.html': '/admin/dashboard',
            '02-admindashboard.html': '/admin/dashboard',
            'admin/03-auctionlist.html': '/admin/auctions',
            '03-auctionlist.html': '/admin/auctions',
            'admin/04-createauction.html': '/admin/create-auction',
            '04-createauction.html': '/admin/create-auction',
            'admin/05-auctiondetail.html': '/admin/auction-detail',
            '05-auctiondetail.html': '/admin/auction-detail',
            'admin/06-agentlist.html': '/admin/agents',
            '06-agentlist.html': '/admin/agents',
            'admin/07-reports.html': '/admin/reports',
            '07-reports.html': '/admin/reports',
            'admin/08-settings.html': '/admin/settings',
            '08-settings.html': '/admin/settings',
            'admin/09-agentdetail.html': '/admin/agent-detail',
            '09-agentdetail.html': '/admin/agent-detail',
            'admin/10-auditlogs.html': '/admin/audit-logs',
            '10-auditlogs.html': '/admin/audit-logs'
        };

        // 1. Beautify current URL in address bar if it still has legacy .html
        try {
            const rawPath = window.location.pathname || '';
            const lowerPath = rawPath.toLowerCase();
            const isAdmin = lowerPath.includes('/admin/') || lowerPath.includes('\\admin\\') || lowerPath === '/admin';

            for (const [key, cleanRoute] of Object.entries(ROUTE_MAP)) {
                if (isAdmin && !key.startsWith('admin/') && !lowerPath.includes(key)) {
                    continue;
                }
                const filenameOnly = key.replace(/^admin\//, '');
                if (lowerPath.endsWith('/' + filenameOnly) || lowerPath.endsWith('/' + key) || lowerPath === '/' + filenameOnly || lowerPath === '/' + key) {
                    const target = cleanRoute + window.location.search + window.location.hash;
                    if (window.location.pathname !== cleanRoute) {
                        window.history.replaceState(null, document.title, target);
                    }
                    break;
                }
            }
        } catch (e) { }

        // 2. Helper to resolve any legacy href to clean URL
        function resolveCleanHref(href) {
            if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
                return null;
            }
            if (href.startsWith('http://') || href.startsWith('https://')) {
                try {
                    const u = new URL(href);
                    if (u.origin !== window.location.origin) return null;
                    href = u.pathname + u.search + u.hash;
                } catch (e) {
                    return null;
                }
            }

            const hashIndex = href.indexOf('#');
            const hash = hashIndex !== -1 ? href.substring(hashIndex) : '';
            const withoutHash = hashIndex !== -1 ? href.substring(0, hashIndex) : href;

            const queryIndex = withoutHash.indexOf('?');
            const search = queryIndex !== -1 ? withoutHash.substring(queryIndex) : '';
            const pathOnly = (queryIndex !== -1 ? withoutHash.substring(0, queryIndex) : withoutHash).replace(/^(\.\.\/|\.\/)+/, '');

            const lower = pathOnly.toLowerCase().replace(/^\/+/, '');
            const isCurrentlyAdmin = (window.location.pathname || '').toLowerCase().includes('/admin');

            if (ROUTE_MAP[lower]) {
                return ROUTE_MAP[lower] + search + hash;
            }
            if (isCurrentlyAdmin && ROUTE_MAP['admin/' + lower]) {
                return ROUTE_MAP['admin/' + lower] + search + hash;
            }
            const parts = lower.split('/');
            const fileName = parts[parts.length - 1];
            if (isCurrentlyAdmin && ROUTE_MAP['admin/' + fileName]) {
                return ROUTE_MAP['admin/' + fileName] + search + hash;
            }
            if (!isCurrentlyAdmin && ROUTE_MAP[fileName]) {
                return ROUTE_MAP[fileName] + search + hash;
            }
            return null;
        }

        // 3. Rewrite links in DOM
        function rewriteAllLinks() {
            try {
                const links = document.querySelectorAll('a[href]');
                links.forEach(a => {
                    const raw = a.getAttribute('href');
                    const clean = resolveCleanHref(raw);
                    if (clean && raw !== clean) {
                        a.setAttribute('href', clean);
                    }
                });
            } catch (e) { }
        }

        rewriteAllLinks();

        // 4. Delegated link click interceptor
        document.addEventListener('click', function (e) {
            const a = e.target.closest('a[href]');
            if (!a) return;
            const raw = a.getAttribute('href');
            const clean = resolveCleanHref(raw);
            if (clean && raw !== clean) {
                a.setAttribute('href', clean);
            }
        }, true);

        // 5. Watch dynamic DOM changes
        if (typeof MutationObserver !== 'undefined' && document.body) {
            const observer = new MutationObserver(function (mutations) {
                let shouldRewrite = false;
                for (const m of mutations) {
                    if (m.addedNodes && m.addedNodes.length > 0) {
                        shouldRewrite = true;
                        break;
                    }
                }
                if (shouldRewrite) rewriteAllLinks();
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    function checkAccountLockGuard() {
        if (typeof window === 'undefined' || !window.location || !window.location.pathname) return;
        if (isRedirecting || window._isManualLogout) return;
        if (typeof CargoStore === 'undefined') return;

        const pathname = (window.location.pathname || '').toLowerCase();

        // Never trigger lock/logout alerts or redirects on public, login, or register pages!
        const isPublicOrLoginPage = (
            pathname === '/' ||
            pathname.endsWith('/') ||
            pathname.endsWith('/index.html') ||
            pathname.includes('00-home') ||
            pathname.includes('01-login') ||
            pathname.includes('adminlogin') ||
            pathname.includes('register') ||
            pathname.includes('10-terms') ||
            pathname === '/home' ||
            pathname === '/login' ||
            pathname === '/admin/login' ||
            pathname === '/terms' ||
            pathname === '/register'
        );

        if (isPublicOrLoginPage) return;

        const isAdminPage = (
            pathname.includes('/admin/') ||
            pathname.includes('\\admin\\') ||
            pathname === '/admin' ||
            pathname.startsWith('/admin')
        );

        if (isAdminPage) {
            // Guard protected Admin pages
            if (pathname.includes('01-adminlogin') || pathname === '/admin/login' || pathname === '/admin') return;
            const admin = CargoStore.getCurrentAdmin();
            if (!admin) {
                isRedirecting = true;
                window.location.href = window.location.protocol.startsWith('http') ? '/admin/login' : '01-AdminLogin.html';
                return;
            }
        } else {
            // Guard protected Agent pages
            const isAgentProtectedPage = (
                pathname.includes('02-dashboard') || pathname.includes('/dashboard') ||
                pathname.includes('03-index') || pathname.includes('/auctions') || pathname.includes('/auction') ||
                pathname.includes('04-detail') || pathname.includes('/detail') ||
                pathname.includes('05-watchlist') || pathname.includes('/watchlist') ||
                pathname.includes('06-mybids') || pathname.includes('/my-bids') || pathname.includes('/bids') ||
                pathname.includes('07-wonauction') || pathname.includes('/won') || pathname.includes('/won-auction') ||
                pathname.includes('08-notifications') || pathname.includes('/notifications') || pathname.includes('/notification') ||
                pathname.includes('09-profile') || pathname.includes('/profile')
            );

            if (isAgentProtectedPage) {
                const user = CargoStore.getCurrentUser();
                if (!user) {
                    isRedirecting = true;
                    window.location.href = window.location.protocol.startsWith('http') ? '/login' : '01-Login.html';
                    return;
                }
            }
        }
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', function () {
            initPrettyUrlRouter();
            if (typeof CargoStore !== 'undefined') {
                if (CargoStore.syncHeaderUI) CargoStore.syncHeaderUI();
                if (CargoStore.syncAdminHeaderUI) CargoStore.syncAdminHeaderUI();

                // Initialize notification badge on page load
                try {
                    const data = loadData();
                    const user = data.currentUser;
                    const myCode = user ? (user.agentCode || user.code || '').trim().toUpperCase() : null;
                    const notifs = (data.notifications || []);
                    const unreadCount = myCode
                        ? notifs.filter(n => {
                            if (n.targetRole === 'ADMIN' || n.targetRole === 'admin') return false;
                            if (n.targetAgentCode) return n.targetAgentCode.trim().toUpperCase() === myCode && !n.read;
                            return (n.type === 'SYSTEM' || n.type === 'ANNOUNCEMENT' || n.isBroadcast === true) && !n.read;
                        }).length
                        : 0;
                    const dot = document.getElementById('headerNotifDot');
                    if (dot) dot.style.display = unreadCount > 0 ? 'block' : 'none';
                    const countBadge = document.getElementById('headerNotifCount');
                    if (countBadge) {
                        countBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
                        countBadge.style.display = unreadCount > 0 ? 'flex' : 'none';
                    }
                } catch (e) { }
            }
            checkAccountLockGuard();
        });

        // Cross-tab notification badge sync
        window.addEventListener('storage', function (e) {
            if (e.key !== 'CARGO_BIDDING_DATA_V3') return;
            try {
                const data = e.newValue ? JSON.parse(e.newValue) : null;
                if (!data) return;
                const user = data.currentUser;
                const myCode = user ? (user.agentCode || user.code || '').trim().toUpperCase() : null;
                const notifs = (data.notifications || []);
                const unreadCount = myCode
                    ? notifs.filter(n => {
                        if (n.targetRole === 'ADMIN' || n.targetRole === 'admin') return false;
                        if (n.targetAgentCode) return n.targetAgentCode.trim().toUpperCase() === myCode && !n.read;
                        return (n.type === 'SYSTEM' || n.type === 'ANNOUNCEMENT' || n.isBroadcast === true) && !n.read;
                    }).length
                    : 0;
                const dot = document.getElementById('headerNotifDot');
                if (dot) dot.style.display = unreadCount > 0 ? 'block' : 'none';
                const countBadge = document.getElementById('headerNotifCount');
                if (countBadge) {
                    countBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
                    countBadge.style.display = unreadCount > 0 ? 'flex' : 'none';
                }
            } catch (e) { }
        });
    }

    // Periodically check every 5s on protected pages
    setInterval(checkAccountLockGuard, 5000);
    window.addEventListener('storage', checkAccountLockGuard);
}

// Global SweetAlert2 & custom confirm integration
(function initCargoAlertSystem() {
    if (typeof window === 'undefined') return;

    // Format plain message into structured modern HTML
    function formatCargoDialogHtml(rawText) {
        if (!rawText || typeof rawText !== 'string') return '';
        if (rawText.includes('<div') || rawText.includes('<span') || rawText.includes('<p') || rawText.includes('<table')) {
            return rawText;
        }

        const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length <= 1) {
            return `<div style="font-size: 13.5px; color: #334155; line-height: 1.55; text-align: left;">${rawText}</div>`;
        }

        let headerPill = null;
        const bullets = [];
        let highlightItem = null;
        let noticeText = null;
        let questionText = null;
        const generalLines = [];

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];

            // Notice / warning lines
            if (line.toUpperCase().includes('LƯU Ý') || line.toUpperCase().includes('QUY CHẾ') || line.toUpperCase().includes('CẢNH BÁO') || line.toUpperCase().includes('CHÚ Ý')) {
                noticeText = (noticeText ? noticeText + ' ' : '') + line;
                continue;
            }

            // Question lines
            if (line.endsWith('?') || line.toLowerCase().startsWith('bạn có chắc') || line.toLowerCase().startsWith('quý đại lý có chắc')) {
                questionText = line;
                continue;
            }

            // Header line
            if (i === 0 && (line.endsWith(':') || line === line.toUpperCase()) && !line.startsWith('•') && !line.startsWith('-')) {
                headerPill = line.replace(/:$/, '');
                continue;
            }

            // Bullet lines
            if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
                const clean = line.replace(/^[•\-\*]\s*/, '');
                const colonIdx = clean.indexOf(':');
                if (colonIdx > -1) {
                    const label = clean.substring(0, colonIdx).trim();
                    const val = clean.substring(colonIdx + 1).trim();
                    if (label.toLowerCase().includes('tổng giá') || label.toLowerCase().includes('tổng thành tiền')) {
                        highlightItem = { label, val };
                    } else {
                        bullets.push({ label, val });
                    }
                } else {
                    bullets.push({ label: '', val: clean });
                }
                continue;
            }

            // Key-value lines without bullet (e.g. "Chuyến bay: VU232")
            const colonIdx = line.indexOf(':');
            if (colonIdx > 0 && colonIdx < 35 && !line.includes('http')) {
                const label = line.substring(0, colonIdx).trim();
                const val = line.substring(colonIdx + 1).trim();
                if (label.toLowerCase().includes('tổng giá') || label.toLowerCase().includes('tổng thành tiền')) {
                    highlightItem = { label, val };
                } else {
                    bullets.push({ label, val });
                }
                continue;
            }

            generalLines.push(line);
        }

        let html = '<div style="text-align: left; font-family: inherit;">';

        if (headerPill) {
            html += `
                <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #ffffff; padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 6px rgba(37,99,235,0.2);">
                    <div style="font-size: 13px; font-weight: 700; letter-spacing: 0.3px;">✈️ ${headerPill}</div>
                </div>
            `;
        }

        if (generalLines.length > 0) {
            html += `
                <div style="margin-bottom: 10px; font-size: 13px; color: #475569; line-height: 1.5;">
                    ${generalLines.join('<br>')}
                </div>
            `;
        }

        if (bullets.length > 0) {
            html += `
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 6px 12px; margin-bottom: 10px;">
            `;
            bullets.forEach((b, idx) => {
                const isLast = idx === bullets.length - 1;
                const borderStyle = isLast ? '' : 'border-bottom: 1px solid #f1f5f9;';
                if (b.label) {
                    let valDisplay = b.val;
                    if (b.val.includes('đ') || b.val.includes('VND') || b.val.includes('VNĐ')) {
                        valDisplay = `<span style="color: #047857; font-weight: 700;">${b.val}</span>`;
                    }
                    html += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; ${borderStyle} font-size: 12.5px;">
                            <span style="color: #64748b; font-weight: 500;">${b.label}:</span>
                            <span style="color: #0f172a; font-weight: 600; text-align: right; margin-left: 8px;">${valDisplay}</span>
                        </div>
                    `;
                } else {
                    html += `
                        <div style="padding: 4px 0; ${borderStyle} font-size: 12.5px; color: #334155;">
                            • ${b.val}
                        </div>
                    `;
                }
            });
            html += `</div>`;
        }

        if (highlightItem) {
            html += `
                <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); color: #ffffff; border-radius: 10px; padding: 10px 14px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 3px 8px rgba(5,150,105,0.25);">
                    <div style="font-size: 11px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.4px; opacity: 0.9;">${highlightItem.label}</div>
                    <div style="font-size: 17px; font-weight: 800; letter-spacing: 0.3px;">${highlightItem.val}</div>
                </div>
            `;
        }

        if (noticeText) {
            html += `
                <div style="background: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 8px 12px; font-size: 11.5px; color: #92400e; line-height: 1.45; margin-bottom: 10px;">
                    ${noticeText}
                </div>
            `;
        }

        if (questionText) {
            html += `
                <div style="text-align: center; font-size: 13px; font-weight: 600; color: #1e293b; margin-top: 6px;">
                    ${questionText}
                </div>
            `;
        }

        html += '</div>';
        return html;
    }

    // Inject styles for SweetAlert2
    function injectStyles() {
        const styleId = 'cargo-swal2-styles';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .swal2-container {
                z-index: 999999 !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
                backdrop-filter: blur(6px) !important;
                -webkit-backdrop-filter: blur(6px) !important;
                background: rgba(15, 23, 42, 0.6) !important;
            }
            .swal2-popup.cargo-swal-popup {
                border-radius: 1.25rem !important;
                padding: 1.5rem 1.5rem 1.25rem 1.5rem !important;
                background: #ffffff !important;
                box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.9) !important;
                border: none !important;
                max-width: 32rem !important;
                width: 95% !important;
            }
            .swal2-popup.cargo-swal-popup .swal2-title {
                font-size: 1.25rem !important;
                font-weight: 700 !important;
                color: #0f172a !important;
                padding-top: 0.25rem !important;
                margin-bottom: 0.75rem !important;
                letter-spacing: -0.01em !important;
            }
            .swal2-popup.cargo-swal-popup .swal2-icon {
                margin: 0.25rem auto 0.75rem auto !important;
                border-width: 3px !important;
                width: 4rem !important;
                height: 4rem !important;
            }
            .swal2-popup.cargo-swal-popup .swal2-icon .swal2-icon-content {
                font-size: 2.25rem !important;
            }
            .swal2-popup.cargo-swal-popup .swal2-html-container {
                margin: 0.5rem 0 1rem 0 !important;
                font-size: 0.875rem !important;
                line-height: 1.5 !important;
                color: #334155 !important;
                text-align: left !important;
                word-break: break-word !important;
                max-height: 480px !important;
                overflow-y: auto !important;
                padding: 0 !important;
            }
            .swal2-popup.cargo-swal-popup .swal2-actions {
                gap: 0.75rem !important;
                margin-top: 0.75rem !important;
                width: 100% !important;
                justify-content: flex-end !important;
                padding: 0 !important;
            }
            .cargo-swal-confirm-btn {
                background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%) !important;
                color: #ffffff !important;
                border-radius: 0.75rem !important;
                font-weight: 600 !important;
                font-size: 0.875rem !important;
                padding: 0.65rem 1.5rem !important;
                box-shadow: 0 4px 10px rgba(37, 99, 235, 0.3) !important;
                border: none !important;
                cursor: pointer !important;
                display: inline-flex !important;
                align-items: center !important;
                gap: 0.5rem !important;
                transition: all 0.2s ease !important;
            }
            .cargo-swal-confirm-btn:hover {
                background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%) !important;
                transform: translateY(-1px) !important;
                box-shadow: 0 6px 15px rgba(37, 99, 235, 0.4) !important;
            }
            .cargo-swal-danger-btn {
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
                color: #ffffff !important;
                border-radius: 0.75rem !important;
                font-weight: 600 !important;
                font-size: 0.875rem !important;
                padding: 0.65rem 1.5rem !important;
                box-shadow: 0 4px 10px rgba(239, 68, 68, 0.3) !important;
                border: none !important;
                cursor: pointer !important;
                display: inline-flex !important;
                align-items: center !important;
                gap: 0.5rem !important;
                transition: all 0.2s ease !important;
            }
            .cargo-swal-danger-btn:hover {
                background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%) !important;
                transform: translateY(-1px) !important;
                box-shadow: 0 6px 15px rgba(239, 68, 68, 0.4) !important;
            }
            .cargo-swal-cancel-btn {
                background-color: #f1f5f9 !important;
                color: #475569 !important;
                border-radius: 0.75rem !important;
                font-weight: 600 !important;
                font-size: 0.875rem !important;
                padding: 0.65rem 1.25rem !important;
                border: 1px solid #cbd5e1 !important;
                cursor: pointer !important;
                transition: all 0.15s ease !important;
            }
            .cargo-swal-cancel-btn:hover {
                background-color: #e2e8f0 !important;
                color: #0f172a !important;
            }
        `;
        if (document.head) document.head.appendChild(style);
    }

    function ensureSweetAlertScript(callback) {
        if (typeof Swal !== 'undefined') {
            if (callback) callback();
            return;
        }
        if (document.getElementById('swal2-bundle')) return;

        const script = document.createElement('script');
        script.id = 'swal2-bundle';
        const isSubdir = window.location.pathname.includes('/Admin/') || window.location.pathname.includes('\\Admin\\');
        const prefix = isSubdir ? '../' : '';
        script.src = prefix + 'assets/js/sweetalert2.all.min.js';
        script.onload = () => {
            if (callback) callback();
        };
        if (document.head) document.head.appendChild(script);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            injectStyles();
            ensureSweetAlertScript();
        });
    } else {
        injectStyles();
        ensureSweetAlertScript();
    }

    const _originalAlert = window.alert;

    window.showAlert = function (messageOrOptions, optionalType) {
        if (typeof Swal === 'undefined') {
            ensureSweetAlertScript(() => window.showAlert(messageOrOptions, optionalType));
            if (typeof messageOrOptions === 'string') {
                _originalAlert(messageOrOptions);
            }
            return Promise.resolve();
        }

        let content = '';
        let title = 'Thông báo';
        let icon = optionalType || 'info';

        if (typeof messageOrOptions === 'string') {
            content = messageOrOptions;
            if (!optionalType) {
                if (content.includes('✅') || content.toLowerCase().includes('thành công')) {
                    icon = 'success';
                    title = 'Thành công';
                } else if (content.includes('❌') || content.toLowerCase().includes('thất bại') || content.toLowerCase().includes('lỗi') || content.toLowerCase().includes('không thể') || content.toLowerCase().includes('không đúng') || content.toLowerCase().includes('sai')) {
                    icon = 'error';
                    title = 'Không thể thực hiện';
                } else if (content.includes('⚠️') || content.includes('🔒') || content.toLowerCase().includes('tối thiểu') || content.toLowerCase().includes('vui lòng') || content.toLowerCase().includes('chưa') || content.toLowerCase().includes('cảnh báo')) {
                    icon = 'warning';
                    title = 'Lưu ý';
                }
            }
        } else if (typeof messageOrOptions === 'object' && messageOrOptions !== null) {
            content = messageOrOptions.html || messageOrOptions.text || '';
            title = messageOrOptions.title || title;
            icon = messageOrOptions.icon || optionalType || icon;
        }

        let cleanText = typeof content === 'string' ? content.replace(/^[✅❌⚠️🔒ℹ️\s]+/, '') : '';
        let formattedHtml = formatCargoDialogHtml(cleanText);

        return Swal.fire({
            title: title,
            html: formattedHtml,
            icon: icon,
            confirmButtonText: 'Đã hiểu',
            buttonsStyling: false,
            customClass: {
                popup: 'cargo-swal-popup',
                confirmButton: 'cargo-swal-confirm-btn'
            }
        });
    };

    window.alert = function (message) {
        return window.showAlert(message);
    };

    window.showConfirm = async function (messageOrOptions) {
        if (typeof Swal === 'undefined') {
            return window.confirm(typeof messageOrOptions === 'string' ? messageOrOptions : (messageOrOptions.text || 'Xác nhận?'));
        }

        let content = '';
        let title = 'Xác nhận thao tác';
        let confirmText = 'Xác nhận';
        let cancelText = 'Hủy bỏ';
        let icon = 'question';
        let isDanger = false;

        if (typeof messageOrOptions === 'string') {
            content = messageOrOptions;
            if (content.includes('XÁC NHẬN NỘP PHIẾU GIÁ THẦU')) {
                title = 'Xác nhận nộp phiếu thầu';
                confirmText = 'Nộp giá thầu ngay';
                icon = 'info';
            } else if (content.toLowerCase().includes('xóa') || content.toLowerCase().includes('reset') || content.toLowerCase().includes('từ chối')) {
                title = 'Cảnh báo thao tác';
                confirmText = 'Đồng ý thực hiện';
                isDanger = true;
                icon = 'warning';
            } else if (content.includes('chốt') || content.includes('Chốt')) {
                title = 'Xác nhận chốt phiên / Duyệt';
                confirmText = 'Xác nhận ngay';
                icon = 'question';
            }
        } else if (typeof messageOrOptions === 'object' && messageOrOptions !== null) {
            content = messageOrOptions.html || messageOrOptions.text || '';
            title = messageOrOptions.title || title;
            confirmText = messageOrOptions.confirmText || confirmText;
            cancelText = messageOrOptions.cancelText || cancelText;
            icon = messageOrOptions.icon || icon;
            isDanger = !!messageOrOptions.danger;
        }

        let cleanText = typeof content === 'string' ? content.replace(/^[❓⚠️ℹ️\s]+/, '') : '';
        let formattedHtml = formatCargoDialogHtml(cleanText);

        const result = await Swal.fire({
            title: title,
            html: formattedHtml,
            icon: icon,
            showCancelButton: true,
            confirmButtonText: confirmText,
            cancelButtonText: cancelText,
            reverseButtons: true,
            focusCancel: false,
            buttonsStyling: false,
            customClass: {
                popup: 'cargo-swal-popup',
                confirmButton: isDanger ? 'cargo-swal-danger-btn' : 'cargo-swal-confirm-btn',
                cancelButton: 'cargo-swal-cancel-btn'
            }
        });

        return !!result.isConfirmed;
    };

    window.showToast = function (message, type = 'success') {
        if (typeof Swal === 'undefined') {
            console.log(`[Toast ${type}]`, message);
            return;
        }
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3500,
            timerProgressBar: true,
            didOpen: (toast) => {
                toast.addEventListener('mouseenter', Swal.stopTimer);
                toast.addEventListener('mouseleave', Swal.resumeTimer);
            }
        });

        return Toast.fire({
            icon: type,
            title: message
        });
    };

    if (typeof window.CargoStore !== 'undefined') {
        window.CargoStore.alert = window.showAlert;
        window.CargoStore.confirm = window.showConfirm;
        window.CargoStore.toast = window.showToast;
    }
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CargoStore;
}
