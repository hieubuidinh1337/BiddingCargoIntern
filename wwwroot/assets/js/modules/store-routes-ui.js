/**
 * CARGO BIDDING SYSTEM - Module 8: VietQR Bank Config, Route Subscriptions, Pretty Router & SweetAlert2 UI
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
        getFlightDurationMinutes, calculateETA, generateNextFlightNumber,
        loadData, saveData, pushToServerImmediate, syncWithServer, updateHeaderNotifBadges
    } = Core;
    const CargoStore = window.CargoStore;
    let lastLocalSaveTimestamp = 0;
    let isRedirecting = false;

    Object.assign(CargoStore, {
        getBankConfig: function () {
            const data = loadData();
            if (!data.bankConfig) {
                data.bankConfig = JSON.parse(JSON.stringify(defaultData.bankConfig));
                saveData(data, true);
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

            // Tự động kết nối mọi sân bay trong danh mục cấu hình (kể cả sân bay mới thêm) với các Hub chính
            const airports = self.getAirports ? self.getAirports() : (loadData().airports || []);
            const configuredCodes = (airports || []).map(a => (a.code || '').trim().toUpperCase()).filter(c => c && c.length === 3);
            const hubs = ['SGN', 'HAN', 'DAD'].filter(h => configuredCodes.includes(h));
            if (hubs.length === 0 && configuredCodes.length > 0) hubs.push(configuredCodes[0]);

            const pairSet = new Set(pairs.map(([o, d]) => `${o}-${d}`));

            configuredCodes.forEach(code => {
                hubs.forEach(h => {
                    if (h !== code) {
                        const p1 = `${h}-${code}`;
                        const p2 = `${code}-${h}`;
                        if (!pairSet.has(p1)) {
                            pairs.push([h, code]);
                            pairSet.add(p1);
                        }
                        if (!pairSet.has(p2)) {
                            pairs.push([code, h]);
                            pairSet.add(p2);
                        }
                    }
                });
            });

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

            // 3. Tự động sinh tất cả các tuyến bay liên quan đến mọi sân bay trong Cấu hình (Settings)
            const airports = self.getAirports ? self.getAirports() : (data.airports || []);
            const validAirports = (airports || []).map(a => (a.code || '').trim().toUpperCase()).filter(c => c && c.length === 3);
            const hubs = ['SGN', 'HAN', 'DAD'].filter(h => validAirports.includes(h));
            if (hubs.length === 0 && validAirports.length > 0) hubs.push(validAirports[0]);

            validAirports.forEach(code => {
                // Kết nối 2 chiều với các Hubs chính
                hubs.forEach(h => {
                    if (h !== code) {
                        addPair(h, code);
                        addPair(code, h);
                    }
                });
                // Kết nối 2 chiều với mọi sân bay còn lại trong hệ thống
                validAirports.forEach(otherCode => {
                    if (otherCode !== code) {
                        addPair(code, otherCode);
                        addPair(otherCode, code);
                    }
                });
            });

            // Sắp xếp thứ tự ưu tiên: SGN, HAN, DAD trước, sau đó theo bảng chữ cái
            const hubRank = { 'SGN': 1, 'HAN': 2, 'DAD': 3 };
            return Array.from(map.values()).sort((a, b) => {
                const rA = hubRank[a.origin] || 99;
                const rB = hubRank[b.origin] || 99;
                if (rA !== rB) return rA - rB;
                if (a.origin !== b.origin) return a.origin.localeCompare(b.origin);
                const rdA = hubRank[a.dest] || 99;
                const rdB = hubRank[b.dest] || 99;
                if (rdA !== rdB) return rdA - rdB;
                return a.dest.localeCompare(b.dest);
            });
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
                saveData(data, true);
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
        },

        kickOutLockedAgent: function (reason = 'Tài khoản đại lý của bạn đã bị KHÓA bởi Quản trị viên hệ thống.') {
            if (isRedirecting) return;
            isRedirecting = true;
            try {
                const data = loadData();
                data.currentUser = null;
                saveData(data, true);
            } catch (e) { }

            try {
                document.cookie = "cargo_agent_code=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax";
            } catch (e) { }

            const targetUrl = (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http'))
                ? `/login?locked=1&reason=${encodeURIComponent(reason)}`
                : `01-Login.html?locked=1&reason=${encodeURIComponent(reason)}`;

            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'error',
                    title: 'TÀI KHOẢN ĐÃ BỊ KHÓA',
                    html: `<div style="font-size: 13.5px; color: #334155; line-height: 1.5; text-align: left; padding: 4px 6px;">
                        <p style="margin-bottom: 8px; font-weight: 700; color: #dc2626;">Phiên làm việc đã bị chấm dứt.</p>
                        <p style="margin-bottom: 8px;">${reason}</p>
                        <p style="font-size: 12px; color: #64748b;">Vui lòng liên hệ Ban Điều hành Cargo để được hỗ trợ mở khóa tài khoản.</p>
                    </div>`,
                    confirmButtonText: 'Quay lại Đăng nhập',
                    confirmButtonColor: '#dc2626',
                    allowOutsideClick: false,
                    allowEscapeKey: false
                }).then(() => {
                    window.location.href = targetUrl;
                });
            } else {
                alert(`TÀI KHOẢN ĐÃ BỊ KHÓA:\n\n${reason}\n\nPhiên làm việc đã bị chấm dứt. Vui lòng liên hệ Ban Điều hành để được hỗ trợ.`);
                window.location.href = targetUrl;
            }
        }
    });


// Attach to global window object
if (typeof window !== 'undefined') {
    window.CargoStore = CargoStore;
}
if (typeof globalThis !== 'undefined') {
    globalThis.CargoStore = CargoStore;
}

// Auto sync headers & Session Lock Guard on page load & realtime events
if (typeof window !== 'undefined') {

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
        function rewriteLinkElement(a) {
            try {
                const raw = a.getAttribute('href');
                const clean = resolveCleanHref(raw);
                if (clean && raw !== clean) {
                    a.setAttribute('href', clean);
                }
            } catch (e) { }
        }

        function rewriteAllLinks(root = document) {
            try {
                const links = root.querySelectorAll('a[href]');
                links.forEach(rewriteLinkElement);
            } catch (e) { }
        }

        rewriteAllLinks();

        // 4. Delegated link click interceptor
        document.addEventListener('click', function (e) {
            const a = e.target.closest('a[href]');
            if (!a) return;
            rewriteLinkElement(a);
        }, true);

        // 5. Watch dynamic DOM changes (only inspect newly added Element nodes, never re-scan whole document)
        if (typeof MutationObserver !== 'undefined' && document.body) {
            const observer = new MutationObserver(function (mutations) {
                for (const m of mutations) {
                    if (!m.addedNodes || m.addedNodes.length === 0) continue;
                    for (const node of m.addedNodes) {
                        if (node.nodeType === 1) {
                            if (node.tagName === 'A' && node.hasAttribute('href')) {
                                rewriteLinkElement(node);
                            } else if (node.querySelectorAll) {
                                rewriteAllLinks(node);
                            }
                        }
                    }
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    let _isCheckingLockGuard = false;
    let _lastLockGuardCheck = 0;

    async function checkAccountLockGuard() {
        if (typeof window === 'undefined' || !window.location || !window.location.pathname) return;
        if (typeof document !== 'undefined' && document.hidden) return;
        if (isRedirecting || window._isManualLogout) return;
        if (typeof CargoStore === 'undefined') return;

        // In-flight guard & time throttle to prevent request loops and browser lag
        if (_isCheckingLockGuard) return;
        const now = Date.now();
        if (now - _lastLockGuardCheck < 10000) return;
        _isCheckingLockGuard = true;
        _lastLockGuardCheck = now;

        try {
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

                    // Check lock status actively with server
                    const myCode = (user.agentCode || user.code || '').trim().toUpperCase();
                    if (myCode && typeof fetch === 'function' && window.location.protocol.startsWith('http')) {
                        try {
                            const statusRes = await fetch(`/api/agent/status?code=${encodeURIComponent(myCode)}`, { cache: 'no-store' });
                            if (statusRes.status === 403) {
                                const errJson = await statusRes.json().catch(() => ({}));
                                CargoStore.kickOutLockedAgent(errJson.message || 'Tài khoản đại lý của bạn đã bị KHÓA bởi Quản trị viên hệ thống.');
                                return;
                            }
                            if (statusRes.ok) {
                                const statusData = await statusRes.json();
                                if (statusData && statusData.isLocked) {
                                    CargoStore.kickOutLockedAgent(statusData.reason);
                                    return;
                                }
                                if (statusData && !statusData.isLocked) {
                                    // Synchronize active status to local storage so client doesn't hold stale lock state
                                    try {
                                        const local = loadData();
                                        let changed = false;
                                        if (Array.isArray(local.agentsList)) {
                                            const ag = local.agentsList.find(a => (a.code || '').toUpperCase() === myCode);
                                            if (ag && (ag.isLocked || ag.status === 'Đã khóa' || ag.status === 'LOCKED')) {
                                                ag.isLocked = false;
                                                ag.status = 'Đang hoạt động';
                                                delete ag.lockedReason;
                                                changed = true;
                                            }
                                        }
                                        if (local.currentUser && (local.currentUser.agentCode || local.currentUser.code || '').toUpperCase() === myCode) {
                                            if (local.currentUser.isLocked || local.currentUser.status === 'Đã khóa' || local.currentUser.status === 'LOCKED') {
                                                local.currentUser.isLocked = false;
                                                local.currentUser.status = 'Đang hoạt động';
                                                changed = true;
                                            }
                                        }
                                        if (changed) {
                                            saveData(local, true);
                                        }
                                    } catch (e) { }
                                }
                            }
                        } catch (e) { }
                    }
                }
            }
        } finally {
            _isCheckingLockGuard = false;
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

    // Periodically check every 15s on protected pages
    setInterval(checkAccountLockGuard, 15000);
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

    if (typeof window !== 'undefined') {
        window.__CargoModulesLoaded = true;
    }
})();
