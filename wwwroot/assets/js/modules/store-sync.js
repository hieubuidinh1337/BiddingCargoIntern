/**
 * CARGO BIDDING SYSTEM - Module 2: Storage Engine & Server Synchronization (/api/data)
 */
(function () {
    const Core = window.__CargoCore;
    const {
        STORAGE_KEY, PERMISSION_DEFINITIONS, ALL_PERMISSION_KEYS,
        seedRoles, seedAdmins, seedAgents, defaultData,
        deduplicateBids, getEffectiveLogTime, deduplicateActivityLogs, deduplicateNotifications,
        reconcileAuctionSummaries, formatCurrency, formatNumber, getTimeRemaining, formatTimeAgo,
        parseTimestamp, parseFlightDate, isWonAuctionExpired,
        autoCloseExpiredAuctions, checkAndAutoLockExpiredWonAuctions,
        calculateCutOffTime, calculatePaymentDeadline, formatPaymentDeadlineText,
        getFlightDurationMinutes, calculateETA, generateNextFlightNumber
    } = Core;
    const CargoStore = window.CargoStore;

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
                        if (a.role !== 'SUPER_ADMIN' || !Array.isArray(a.roles) || a.roles.length !== 1 || a.roles[0] !== 'SUPER_ADMIN' || a.fullName !== 'Trần Quản Trị (Super Admin)') {
                            a.role = 'SUPER_ADMIN';
                            a.roles = ['SUPER_ADMIN'];
                            a.fullName = 'Trần Quản Trị (Super Admin)';
                            updated = true;
                        }
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
                        if (!a.role) {
                            a.role = 'AGENT_AUDITOR';
                            updated = true;
                        }
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
                        if (data.currentAdmin.role !== matchedStaff.role ||
                            JSON.stringify(data.currentAdmin.roles) !== JSON.stringify(matchedStaff.roles) ||
                            data.currentAdmin.fullName !== matchedStaff.fullName ||
                            data.currentAdmin.department !== matchedStaff.department) {
                            data.currentAdmin.role = matchedStaff.role;
                            data.currentAdmin.roles = matchedStaff.roles;
                            data.currentAdmin.fullName = matchedStaff.fullName;
                            data.currentAdmin.department = matchedStaff.department;
                            updated = true;
                        }
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
                                if (w.agentCode && auction.winnerAgentCode !== w.agentCode) {
                                    auction.winnerAgentCode = w.agentCode;
                                    updated = true;
                                }
                                if (w.agentName && auction.winnerAgentName !== w.agentName) {
                                    auction.winnerAgentName = w.agentName;
                                    updated = true;
                                }
                                if (w.priceKg && auction.winningPriceKg !== w.priceKg) {
                                    auction.winningPriceKg = w.priceKg;
                                    updated = true;
                                }
                            }
                        }
                    });
                }
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
                        if (n.targetRole !== 'ADMIN' || n.targetAgentCode !== null) {
                            n.targetRole = 'ADMIN';
                            n.targetAgentCode = null;
                            updated = true;
                        }
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

            if (updated && !isSyncing) {
                saveData(data, true);
            } else if (!raw || updated) {
                try {
                    const savedStr = JSON.stringify(data);
                    localStorage.setItem(STORAGE_KEY, savedStr);
                    _memoryCacheRaw = savedStr;
                } catch (e) { }
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

            const buildPayload = (epochVal) => JSON.stringify({
                dataEpoch: epochVal,
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
                airports: data.airports || [],
                aircraftTypes: data.aircraftTypes || [],
                activityLogs: Array.isArray(data.activityLogs) ? data.activityLogs.slice(0, 100) : [],
                chats: data.chats || []
            }, (k, v) => (k === 'dataUrl' && typeof v === 'string' && v.length > 2000) ? null : v);

            const sendPush = async (epochVal) => {
                const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
                try {
                    return await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: buildPayload(epochVal),
                        signal: controller ? controller.signal : undefined
                    });
                } finally {
                    if (timer) clearTimeout(timer);
                }
            };

            let res = await sendPush(currentEpoch);
            if (res.status === 409) {
                const conflictJson = await res.json().catch(() => null);
                if (conflictJson && conflictJson.dataEpoch) {
                    currentEpoch = conflictJson.dataEpoch;
                    try { localStorage.setItem(EPOCH_KEY, currentEpoch); } catch (e) { }
                    res = await sendPush(currentEpoch);
                }
            }
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
            // localStorage đầy (thường do file PDF/ảnh base64): lưu bản rút gọn, nội dung tệp vẫn nằm trên server
            try {
                const slim = JSON.stringify(data, (k, v) => (k === 'dataUrl' && typeof v === 'string' && v.length > 2000) ? null : v);
                localStorage.setItem(STORAGE_KEY, slim);
                _memoryCacheRaw = slim;
            } catch (e2) { }
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

        // Guard: không đồng bộ quá dày (force: tối thiểu 1s, thường: 30s)
        if (Date.now() - lastServerSyncTimestamp < (force ? 1000 : 30000)) return;
        if (!force && typeof document !== 'undefined' && document.hidden) return; // Save CPU when tab is in background
        if (force) lastLocalSaveTimestamp = 0;
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
            const hasUnmaskedBidOnServer = serverBids.some(sb => {
                if (!sb || !sb.id) return false;
                const lb = localBids.find(x => String(x.id) === String(sb.id));
                if (!lb) return true;
                return (Number(sb.priceKg) > 0 && !(Number(lb.priceKg) > 0)) ||
                       (sb.agentCode && sb.agentCode !== 'AG-***' && (!lb.agentCode || lb.agentCode === 'AG-***'));
            });
            const hasWinnerUpdateOnServer = serverAuctions.some(sa => {
                if (!sa || !sa.id) return false;
                const la = localAuctions.find(x => String(x.id) === String(sa.id));
                if (!la) return true;
                return (Number(sa.winningPriceKg) > 0 && Number(la.winningPriceKg) !== Number(sa.winningPriceKg)) ||
                       (sa.winnerAgentCode && sa.winnerAgentCode !== 'AG-***' && la.winnerAgentCode !== sa.winnerAgentCode);
            });

            const shouldSync = force || !lastServerVersion ||
                (serverData && serverData.version && serverData.version !== lastServerVersion) ||
                hasNewAuctionOnServer ||
                hasStatusMismatch ||
                hasUnmaskedBidOnServer ||
                hasWinnerUpdateOnServer ||
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
                let hasUnsyncedLocalAuction = false;
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
                            hasUnsyncedLocalAuction = true;
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
                                const validWinnerCode = (serverItem.winnerAgentCode && serverItem.winnerAgentCode !== 'AG-***')
                                    ? serverItem.winnerAgentCode
                                    : ((a.winnerAgentCode && a.winnerAgentCode !== 'AG-***') ? a.winnerAgentCode : (serverItem.winnerAgentCode || a.winnerAgentCode));
                                const validWinnerName = (serverItem.winnerAgentName && !String(serverItem.winnerAgentName).includes('Bảo mật') && !String(serverItem.winnerAgentName).includes('ẩn danh'))
                                    ? serverItem.winnerAgentName
                                    : ((a.winnerAgentName && !String(a.winnerAgentName).includes('Bảo mật') && !String(a.winnerAgentName).includes('ẩn danh')) ? a.winnerAgentName : (serverItem.winnerAgentName || a.winnerAgentName));
                                const validWinningPrice = Math.max(Number(serverItem.winningPriceKg) || 0, Number(a.winningPriceKg) || 0);
                                const validCurrentPrice = Math.max(Number(serverItem.currentPriceKg) || 0, Number(a.currentPriceKg) || 0, validWinningPrice);
                                auctionMap.set(aKey, {
                                    ...a,
                                    ...serverItem,
                                    status: 'CLOSED',
                                    isFinalLocked: a.isFinalLocked || serverItem.isFinalLocked || false,
                                    closedAt: serverItem.closedAt || a.closedAt,
                                    winnerAgentCode: validWinnerCode,
                                    winnerAgentName: validWinnerName,
                                    winningPriceKg: validWinningPrice,
                                    currentPriceKg: validCurrentPrice
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
                            const validPriceKg = Math.max(Number(serverItem.priceKg) || 0, Number(w.priceKg) || 0);
                            const validCapKg = Math.max(Number(serverItem.capacityKg) || 0, Number(w.capacityKg) || 0);
                            const validTotal = Math.max(Number(serverItem.totalAmountVND) || 0, Number(w.totalAmountVND) || 0, validPriceKg * validCapKg);
                            wonMap.set(wKey, {
                                ...w,
                                ...serverItem,
                                priceKg: validPriceKg,
                                totalAmountVND: validTotal,
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

                    // Reconcile server bids: never allow masked 'AG-***' or null priceKg to overwrite valid local bids
                    const reconciledServerBids = serverData.bids.map(sb => {
                        if (!sb || !sb.id) return sb;
                        const lb = localBidMap.get(String(sb.id));
                        if (!lb) return sb;

                        const resolvedPriceKg = (Number(sb.priceKg) > 0) ? Number(sb.priceKg) : ((Number(lb.priceKg) > 0) ? Number(lb.priceKg) : 0);
                        const resolvedWeightKg = (Number(sb.weightKg) > 0) ? Number(sb.weightKg) : ((Number(lb.weightKg) > 0) ? Number(lb.weightKg) : 0);
                        const sbCodeValid = sb.agentCode && sb.agentCode !== 'AG-***';
                        const lbCodeValid = lb.agentCode && lb.agentCode !== 'AG-***';
                        const resolvedAgentCode = sbCodeValid ? sb.agentCode : (lbCodeValid ? lb.agentCode : sb.agentCode);
                        const sbNameValid = sb.agentName && !String(sb.agentName).includes('Bảo mật') && !String(sb.agentName).includes('ẩn danh');
                        const resolvedAgentName = sbNameValid ? sb.agentName : (lb.agentName || sb.agentName);

                        return {
                            ...lb,
                            ...sb,
                            agentCode: resolvedAgentCode,
                            agentName: resolvedAgentName,
                            priceKg: resolvedPriceKg,
                            weightKg: resolvedWeightKg,
                            isAnonymous: (sb.isAnonymous !== undefined) ? sb.isAnonymous : lb.isAnonymous
                        };
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
                            if (serverAg.isLocked || serverAg.status === 'Đã khóa' || serverAg.status === 'LOCKED') {
                                local.currentUser = null;
                                saveData(local);
                                if (typeof CargoStore !== 'undefined' && CargoStore.kickOutLockedAgent) {
                                    CargoStore.kickOutLockedAgent(serverAg.lockedReason || 'Tài khoản của bạn đã bị KHÓA bởi Quản trị viên.');
                                    return;
                                }
                            }
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
                if (serverData.airports && Array.isArray(serverData.airports) && serverData.airports.length > 0) {
                    local.airports = serverData.airports;
                }
                if (serverData.aircraftTypes && Array.isArray(serverData.aircraftTypes) && serverData.aircraftTypes.length > 0) {
                    local.aircraftTypes = serverData.aircraftTypes;
                }

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
                if (hasUnsyncedLocalAuction && isAdminPage && local.currentAdmin) {
                    pushToServerImmediate(local);
                }
            }
        } catch (e) {
        } finally {
            isSyncing = false;
        }
    }

    // Kiểm tra nhẹ phiên bản dữ liệu trên server mỗi 4s: có thay đổi (phiên mới, tự đóng phiên...) thì đồng bộ ngay.
    let _versionPollTimer = null;
    let _versionPolling = false;
    async function pollServerVersion() {
        if (_versionPolling || _isPublic || epochWiping) return;
        if (typeof document !== 'undefined' && document.hidden) return;
        _versionPolling = true;
        try {
            const res = await fetch('/api/version', { cache: 'no-store' });
            if (!res.ok) return;
            const j = await res.json();
            if (!j || !j.version) return;
            if (j.dataEpoch && !applyServerEpoch(j.dataEpoch)) return;
            if (Number(j.version) !== Number(lastServerVersion)) {
                const before = lastServerVersion;
                await syncWithServer(true);
                if (lastServerVersion !== before) {
                    try { window.dispatchEvent(new CustomEvent('cargostore_remote_changed', { detail: { version: lastServerVersion } })); } catch (e) { }
                }
            }
        } catch (e) {
        } finally {
            _versionPolling = false;
        }
    }

    // Đồng hồ đã chạy về 0 -> yêu cầu server chốt phiên rồi đồng bộ về (throttle 3s, KHÔNG render lại liên tục)
    let _lastExpiredSyncMs = 0;
    function checkAutoCloseAuctions() {
        let modified = false;
        try {
            const data = loadData();
            if (autoCloseExpiredAuctions(data)) {
                modified = true;
                saveData(data, true);
            }
        } catch (e) { }
        const now = Date.now();
        if (now - _lastExpiredSyncMs > 3000) {
            _lastExpiredSyncMs = now;
            lastServerSyncTimestamp = 0;
            Promise.resolve(syncWithServer(true)).then(() => {
                try { window.dispatchEvent(new CustomEvent('cargostore_remote_changed', { detail: { expired: true } })); } catch (e) { }
            }).catch(() => { });
        }
        return modified;
    }

    if (typeof window !== 'undefined' && !_isPublic && !_versionPollTimer) {
        _versionPollTimer = setInterval(pollServerVersion, 4000);
        setTimeout(pollServerVersion, 600);
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) pollServerVersion();
        });
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


    Object.assign(Core, {
        loadData,
        saveData,
        pushToServerImmediate,
        syncWithServer,
        updateHeaderNotifBadges
    });

    Object.assign(CargoStore, {
        getData: loadData,
        saveData: saveData,
        saveDataImmediate: function (data) {
            return pushToServerImmediate(data || loadData());
        },
        syncWithServer: syncWithServer,
        checkAutoCloseAuctions: checkAutoCloseAuctions,
        pollServerVersion: pollServerVersion,
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
    });
})();
