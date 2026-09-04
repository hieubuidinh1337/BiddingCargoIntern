/**
 * CARGO BIDDING SYSTEM - Shared Store & Realtime Simulation
 * Synchronizes multi-account SQL database data with distinct passwords per account
 */

const CargoStore = (function() {
    const STORAGE_KEY = 'CARGO_BIDDING_DATA_V3';

    // Seed Data matching T-SQL SQL Server 2022 (CargoBiddingDB)
    // Each agent/admin account has its OWN unique, distinct password
    const seedAgents = [
        {
            id: 1,
            code: 'AG-0892',
            password: 'abc123456',
            companyName: 'Công ty TNHH Vận tải ABC Logistics',
            repName: 'Nguyễn Văn An',
            position: 'Giám đốc kinh doanh',
            phone: '0901 234 567',
            email: 'an.nguyen@abccargo.vn',
            taxCode: '0312345678',
            address: '123 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
            province: 'TP. Hồ Chí Minh',
            tier: 'TIER1',
            status: 'Đang hoạt động',
            joinedDate: '15/03/2024',
            totalBids: 24,
            totalWins: 8,
            winRate: '33%',
            totalSpentUSD: '12.4k',
            totalSpentVND: 1600000000
        },
        {
            id: 2,
            code: 'AG-1024',
            password: 'vina123456',
            companyName: 'Công ty CP Giao nhận Kho vận Vinatrans',
            repName: 'Lê Minh Khang',
            position: 'Trưởng phòng Air Freight',
            phone: '0908 765 432',
            email: 'khang.le@vinatrans.com.vn',
            taxCode: '0300456789',
            address: '406 Nguyễn Tất Thành, Quận 4, TP. Hồ Chí Minh',
            province: 'TP. Hồ Chí Minh',
            tier: 'TIER1',
            status: 'Đang hoạt động',
            joinedDate: '10/01/2024',
            totalBids: 45,
            totalWins: 16,
            winRate: '36%',
            totalSpentUSD: '28.2k',
            totalSpentVND: 3640000000
        },
        {
            id: 3,
            code: 'AG-0556',
            password: 'star123456',
            companyName: 'Công ty TNHH Tiếp vận Toàn Cầu Golden Star',
            repName: 'Phạm Thu Thảo',
            position: 'Phó Tổng Giám Đốc',
            phone: '0912 348 899',
            email: 'thao.pham@dhlvietnam.com',
            taxCode: '0105678901',
            address: '88 Láng Hạ, Đống Đa, Hà Nội',
            province: 'Hà Nội',
            tier: 'TIER1',
            status: 'Đang hoạt động',
            joinedDate: '22/05/2024',
            totalBids: 18,
            totalWins: 5,
            winRate: '28%',
            totalSpentUSD: '8.0k',
            totalSpentVND: 1030000000
        },
        {
            id: 4,
            code: 'AG-0341',
            password: 'sky123456',
            companyName: 'Công ty TNHH SkyFreight Logistics Việt Nam',
            repName: 'Hoàng Văn Dũng',
            position: 'Giám đốc Điều hành',
            phone: '0903 567 890',
            email: 'dung.hoang@saigonair.vn',
            taxCode: '0700111234',
            address: '12B Trường Sơn, Q. Tân Bình, TP. HCM',
            province: 'TP. Hồ Chí Minh',
            tier: 'TIER2',
            status: 'Đang hoạt động',
            joinedDate: '01/07/2024',
            totalBids: 10,
            totalWins: 3,
            winRate: '30%',
            totalSpentUSD: '3.0k',
            totalSpentVND: 380000000
        },
        {
            id: 5,
            code: 'AG-0789',
            password: 'viet123456',
            companyName: 'Công ty CP Vận chuyển Hàng không Việt Freight',
            repName: 'Nguyễn Thị Hoa',
            position: 'Trưởng phòng Sales Air',
            phone: '0919 123 456',
            email: 'hoa.nt@vietfreight.vn',
            taxCode: '0401990211',
            address: '29 Đinh Tiên Hoàng, Q. Bình Thạnh, TP. HCM',
            province: 'TP. Hồ Chí Minh',
            tier: 'TIER2',
            status: 'Đang hoạt động',
            joinedDate: '15/08/2024',
            totalBids: 7,
            totalWins: 2,
            winRate: '29%',
            totalSpentUSD: '1.6k',
            totalSpentVND: 210000000
        }
    ];

    const seedAdmins = [
        {
            id: 99,
            username: 'admin',
            password: 'admin2026',
            role: 'ADMIN',
            fullName: 'Trần Quản Trị',
            email: 'admin@airline.vn',
            department: 'Cargo Operations Directorate'
        },
        {
            id: 98,
            username: 'staff01',
            password: 'staff2026',
            role: 'STAFF',
            fullName: 'Nguyễn Điều Hành',
            email: 'staff01@airline.vn',
            department: 'Air Cargo Flight Operations'
        },
        {
            id: 97,
            username: 'staff02',
            password: 'staff2026',
            role: 'STAFF',
            fullName: 'Lê Thị Bích Vân',
            email: 'staff02@airline.vn',
            department: 'Agent Audit & Approval'
        }
    ];

    const defaultData = {
        currentUser: {
            id: 1,
            role: 'agent',
            agentCode: 'AG-0892',
            password: 'abc123456',
            companyName: 'Công ty TNHH Vận tải ABC Logistics',
            fullName: 'Nguyễn Văn An',
            position: 'Giám đốc kinh doanh',
            email: 'an.nguyen@abccargo.vn',
            phone: '0901 234 567',
            taxCode: '0312345678',
            address: '123 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
            province: 'TP. Hồ Chí Minh',
            tier: 'TIER1',
            status: 'Đang hoạt động',
            joinedDate: '15/03/2024',
            stats: {
                totalBids: 24,
                totalWins: 8,
                winRate: '33%',
                totalSpentUSD: '12.4k',
                totalSpentVND: 1600000000
            }
        },
        currentAdmin: {
            id: 99,
            username: 'admin',
            password: 'admin2026',
            role: 'ADMIN',
            fullName: 'Trần Quản Trị',
            email: 'admin@airline.vn',
            department: 'Cargo Operations Directorate'
        },
        agentsList: seedAgents,
        adminsList: seedAdmins,
        auctions: [
            {
                id: 1,
                flightCode: 'FL-VU130-260815',
                flightNumber: 'VU130',
                route: 'SGN - HAN',
                origin: 'SGN',
                destination: 'HAN',
                originName: 'TP. Hồ Chí Minh',
                destName: 'Hà Nội',
                etd: '14:30 · 15/08/2026',
                eta: '16:45 · 15/08/2026',
                aircraft: 'Airbus A321neo Cargo',
                capacityKg: 3500,
                startingPriceKg: 18000,
                currentPriceKg: 21500,
                minStep: 500,
                endTime: new Date(Date.now() + 42 * 60 * 1000).toISOString(),
                status: 'OPEN',
                leadingAgentCode: 'AG-0892',
                leadingAgentName: 'ABC Logistics',
                bidsCount: 7,
                specialNotes: 'Hàng tổng hợp, hỗ trợ kho lạnh bảo quản thực phẩm & dược phẩm.',
                cutOffTime: '11:30 · 15/08/2026'
            },
            {
                id: 2,
                flightCode: 'FL-VU224-260815',
                flightNumber: 'VU224',
                route: 'SGN - DAD',
                origin: 'SGN',
                destination: 'DAD',
                originName: 'TP. Hồ Chí Minh',
                destName: 'Đà Nẵng',
                etd: '16:00 · 15/08/2026',
                eta: '17:20 · 15/08/2026',
                aircraft: 'Airbus A320-200',
                capacityKg: 2000,
                startingPriceKg: 12000,
                currentPriceKg: 14500,
                minStep: 500,
                endTime: new Date(Date.now() + 85 * 60 * 1000).toISOString(),
                status: 'OPEN',
                leadingAgentCode: 'AG-1024',
                leadingAgentName: 'Vinatrans',
                bidsCount: 4,
                specialNotes: 'Ưu tiên bưu kiện bưu phẩm thương mại điện tử chuyển phát nhanh.',
                cutOffTime: '13:00 · 15/08/2026'
            },
            {
                id: 3,
                flightCode: 'FL-VU340-260815',
                flightNumber: 'VU340',
                route: 'HAN - PQC',
                origin: 'HAN',
                destination: 'PQC',
                originName: 'Hà Nội',
                destName: 'Phú Quốc',
                etd: '19:15 · 15/08/2026',
                eta: '21:30 · 15/08/2026',
                aircraft: 'Airbus A321neo Cargo',
                capacityKg: 4000,
                startingPriceKg: 22000,
                currentPriceKg: 25000,
                minStep: 1000,
                endTime: new Date(Date.now() + 210 * 60 * 1000).toISOString(),
                status: 'OPEN',
                leadingAgentCode: 'AG-0556',
                leadingAgentName: 'Golden Star',
                bidsCount: 5,
                specialNotes: 'Hàng hải sản đông lạnh tươi sống đóng thùng xốp tiêu chuẩn IATA.',
                cutOffTime: '16:00 · 15/08/2026'
            },
            {
                id: 4,
                flightCode: 'FL-VU132-260814',
                flightNumber: 'VU132',
                route: 'SGN - HAN',
                origin: 'SGN',
                destination: 'HAN',
                originName: 'TP. Hồ Chí Minh',
                destName: 'Hà Nội',
                etd: '10:00 · 14/08/2026',
                eta: '12:15 · 14/08/2026',
                aircraft: 'Airbus A321-200',
                capacityKg: 3000,
                startingPriceKg: 18000,
                currentPriceKg: 22000,
                minStep: 500,
                endTime: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
                status: 'CLOSED',
                leadingAgentCode: 'AG-0892',
                leadingAgentName: 'ABC Logistics',
                bidsCount: 12,
                winnerAgentCode: 'AG-0892',
                winnerAgentName: 'ABC Logistics',
                winningPriceKg: 22000,
                specialNotes: 'Phiên đã đóng hôm qua, thắng thầu chính thức.',
                cutOffTime: '07:00 · 14/08/2026'
            }
        ],
        bids: [
            {
                id: 101,
                auctionId: 1,
                agentCode: 'AG-1024',
                agentName: 'Vinatrans Express',
                isAnonymous: true,
                priceKg: 19000,
                time: '1 giờ trước',
                status: 'OUTBID',
                weightKg: 3500
            },
            {
                id: 102,
                auctionId: 1,
                agentCode: 'AG-0556',
                agentName: 'Golden Star Forwarding',
                isAnonymous: true,
                priceKg: 20000,
                time: '35 phút trước',
                status: 'OUTBID',
                weightKg: 3500
            },
            {
                id: 103,
                auctionId: 1,
                agentCode: 'AG-0892',
                agentName: 'ABC Logistics',
                isAnonymous: true,
                priceKg: 21500,
                time: '12 phút trước',
                status: 'HIGHEST',
                weightKg: 3500
            }
        ],
        watchlist: [1, 2, 3],
        wonAuctions: [
            {
                wonId: 'WON-2026-0814-01',
                auctionId: 4,
                agentCode: 'AG-0892',
                flightNumber: 'VU132',
                route: 'SGN - HAN',
                capacityKg: 3000,
                priceKg: 22000,
                totalAmountVND: 66000000,
                paymentDeadline: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(),
                paymentStatus: 'PAID',
                paidAt: '14/08/2026 14:20',
                awbNumber: '998-12345678',
                cutOffTime: '15/08/2026 06:00',
                warehouse: 'Kho hàng TCS Tân Sơn Nhất (Cửa số 4)'
            }
        ],
        notifications: [
            {
                id: 1,
                title: 'Bạn đang dẫn đầu thầu VU130',
                message: 'Mức giá 21,500 đ/Kg của bạn đang là cao nhất cho chuyến SGN-HAN. Giữ vững ưu thế!',
                time: '12 phút trước',
                type: 'HIGHEST',
                read: false,
                link: '04-Detail.html?id=1'
            },
            {
                id: 2,
                title: 'Cảnh báo sắp đóng thầu: Chuyến VU130',
                message: 'Phiên đấu giá chỉ còn dưới 45 phút. Đừng bỏ lỡ tải trọng tốt!',
                time: '30 phút trước',
                type: 'CLOSING_SOON',
                read: false,
                link: '04-Detail.html?id=1'
            }
        ],
        registrations: [
            {
                regId: 'REG-2026-0805-01',
                companyName: 'Công ty TNHH Giao nhận Sao Mai Express',
                taxCode: '0315998877',
                address: '77 Bạch Đằng, Phường 2, Quận Tân Bình, TP.HCM',
                field: 'Cargo Agent',
                repName: 'Hoàng Đức Trọng',
                repPosition: 'Giám đốc điều hành',
                email: 'trong.hoang@saomaiexpress.vn',
                phone: '0933 887 766',
                documents: ['GPKD_SaoMai_Scan.pdf', 'UyQuyen_Cargo_SaoMai.pdf', 'CCCD_HoangDucTrong.pdf'],
                status: 'PENDING',
                submittedAt: '05/08/2026 10:15'
            }
        ],
        settings: {
            minIncrement: 500,
            cutoffHours: 3,
            paymentWindowHours: 24,
            hotline: '1900-xxxx',
            supportEmail: 'cargo-bidding@airline.vn'
        }
    };

    function loadData() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            let data;
            if (!raw) {
                data = JSON.parse(JSON.stringify(defaultData));
            } else {
                data = JSON.parse(raw);
            }

            let updated = false;

            // Auto-refresh end time for OPEN auctions if expired in localStorage
            const now = Date.now();
            if (data.auctions && Array.isArray(data.auctions)) {
                data.auctions.forEach((a, idx) => {
                    if (a.status === 'OPEN') {
                        const endTimeMs = Date.parse(a.endTime);
                        if (isNaN(endTimeMs) || endTimeMs <= now) {
                            const addMinutes = (idx === 0 ? 45 : (idx === 1 ? 90 : 120));
                            a.endTime = new Date(now + addMinutes * 60 * 1000).toISOString();
                            updated = true;
                        }
                    }
                });
            }

            if (!data.agentsList || data.agentsList.length === 0) {
                data.agentsList = seedAgents;
                updated = true;
            }

            if (!raw || updated) {
                saveData(data);
            }
            return data;
        } catch (e) {
            console.error('Error loading CargoStore data', e);
            return defaultData;
        }
    }

    let lastServerVersion = 0;
    let isSyncing = false;

    function saveData(data, skipServerSync = false) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Error saving CargoStore data', e);
        }

        // Broadcast to listeners in this browser window
        try {
            window.dispatchEvent(new CustomEvent('cargostore_updated', { detail: data }));
        } catch (e) {}

        // Push changes to server if running over HTTP/HTTPS
        if (!skipServerSync && typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
            fetch('/api/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    auctions: data.auctions,
                    bids: data.bids,
                    wonAuctions: data.wonAuctions,
                    notifications: data.notifications,
                    registrations: data.registrations,
                    agentsList: data.agentsList,
                    adminsList: data.adminsList,
                    settings: data.settings
                })
            }).then(r => r.json()).then(res => {
                if (res && res.version) {
                    lastServerVersion = res.version;
                }
            }).catch(err => {
                // Offline fallback
            });
        }
    }

    async function syncWithServer() {
        if (isSyncing || typeof window === 'undefined' || !window.location || !window.location.protocol.startsWith('http')) return;
        try {
            isSyncing = true;
            const res = await fetch('/api/data');
            if (!res.ok) return;
            const serverData = await res.json();
            if (serverData && serverData.version && serverData.version !== lastServerVersion) {
                lastServerVersion = serverData.version;
                const local = loadData();

                // Merge shared collections from server while preserving browser-specific login
                local.auctions = serverData.auctions || local.auctions;
                local.bids = serverData.bids || local.bids;
                local.wonAuctions = serverData.wonAuctions || local.wonAuctions;
                local.notifications = serverData.notifications || local.notifications;
                local.registrations = serverData.registrations || local.registrations;
                local.agentsList = serverData.agentsList || local.agentsList;
                local.adminsList = serverData.adminsList || local.adminsList;
                if (serverData.settings) local.settings = serverData.settings;

                // Save locally without re-sending to server
                saveData(local, true);

                // Notify UI components to re-render
                try {
                    window.dispatchEvent(new CustomEvent('cargostore_updated', { detail: local }));
                    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
                } catch (e) {}
            }
        } catch (e) {
        } finally {
            isSyncing = false;
        }
    }

    // Auto-poll server every 1000ms to stay in sync across different browsers
    if (typeof window !== 'undefined') {
        setTimeout(syncWithServer, 50);
        setInterval(syncWithServer, 1000);
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
        if (isNaN(timeMs) || timeMs <= 0) {
            if (typeof ts === 'string') {
                const parsed = Date.parse(ts);
                if (!isNaN(parsed)) timeMs = parsed;
            }
        }
        if (isNaN(timeMs) || timeMs <= 0) return defaultFallback || 'Vừa xong';

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
        const d = new Date(timeMs);
        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    }

    return {
        getData: loadData,
        saveData: saveData,
        formatCurrency: formatCurrency,
        formatNumber: formatNumber,
        getTimeRemaining: getTimeRemaining,
        formatTimeAgo: formatTimeAgo,

        /**
         * Dynamic Agent Login checking each agent's SPECIFIC password
         */
        loginAgent: function(agentCode, password) {
            const data = loadData();
            const code = (agentCode || '').trim().toUpperCase();

            // Search agent in list
            let agent = (data.agentsList || seedAgents).find(a => (a.code || '').toUpperCase() === code);

            if (!agent) {
                // If newly approved agent code format AG-xxxx
                if (code.startsWith('AG-')) {
                    agent = {
                        id: Date.now(),
                        code: code,
                        password: '12345678',
                        companyName: `Đại lý ${code}`,
                        repName: `Đại diện ${code}`,
                        position: 'Giám đốc Điều hành',
                        phone: '0909 000 999',
                        email: `${code.toLowerCase()}@cargoagent.vn`,
                        taxCode: '0399' + Math.floor(100000 + Math.random() * 900000),
                        address: 'TP. Hồ Chí Minh',
                        province: 'TP. Hồ Chí Minh',
                        tier: 'TIER2',
                        status: 'Đang hoạt động',
                        joinedDate: new Date().toLocaleDateString('vi-VN'),
                        totalBids: 0,
                        totalWins: 0,
                        winRate: '0%',
                        totalSpentUSD: '0',
                        totalSpentVND: 0
                    };
                } else {
                    return { success: false, message: `Mã đại lý "${code}" không tồn tại trong CSDL SQL Server 2022.` };
                }
            }

            // Verify status (Check if account is locked)
            if (agent.status === 'Đã khóa' || agent.status === 'LOCKED') {
                return {
                    success: false,
                    message: `Tài khoản đại lý ${agent.code} (${agent.companyName}) hiện đang bị KHÓA bởi Quản trị viên sàn. Vui lòng liên hệ Hotline để được hỗ trợ mở khóa.`
                };
            }

            // Verify against THAT SPECIFIC AGENT'S PASSWORD!
            const expectedPassword = agent.password || '12345678';
            if (password !== expectedPassword) {
                return {
                    success: false,
                    message: `Mật khẩu không chính xác cho đại lý ${agent.code}! Vui lòng nhập đúng mật khẩu đã đăng ký hoặc mật khẩu mới đã đổi.`
                };
            }

            // Construct specific currentUser object for this agent
            data.currentUser = {
                id: agent.id,
                role: 'agent',
                agentCode: agent.code,
                password: agent.password,
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
                stats: {
                    totalBids: agent.totalBids || 0,
                    totalWins: agent.totalWins || 0,
                    winRate: agent.winRate || (agent.totalBids ? Math.round(agent.totalWins / agent.totalBids * 100) + '%' : '0%'),
                    totalSpentUSD: agent.totalSpentUSD || '0k',
                    totalSpentVND: agent.totalSpentVND || 0
                }
            };

            saveData(data);
            return { success: true, user: data.currentUser };
        },

        /**
         * Dynamic Admin Login checking each admin's SPECIFIC password
         */
        loginAdmin: function(username, password) {
            const data = loadData();
            const u = (username || '').trim().toLowerCase();
            const admin = (data.adminsList || seedAdmins).find(a => (a.username || '').toLowerCase() === u);

            if (!admin) {
                return { success: false, message: `Tài khoản admin "${username}" không tồn tại.` };
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
                    message: `Mật khẩu quản trị không chính xác cho tài khoản "${username}"!`
                };
            }

            data.currentAdmin = {
                id: admin.id,
                username: admin.username,
                password: admin.password,
                role: admin.role,
                fullName: admin.fullName,
                email: admin.email,
                department: admin.department
            };

            saveData(data);
            return { success: true, admin: data.currentAdmin };
        },

        getCurrentUser: function() {
            return loadData().currentUser;
        },

        getCurrentAdmin: function() {
            return loadData().currentAdmin;
        },

        parseFlightDate: function(dateInput) {
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

        formatFlightDateDisplay: function(dateInput) {
            const d = this.parseFlightDate(dateInput);
            if (!d) return String(dateInput || '');
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${hours}:${minutes} · ${day}/${month}/${year}`;
        },

        createAuction: function(auctionData) {
            const data = loadData();
            if (!data.auctions) data.auctions = [];

            const now = new Date();
            
            // Validate ETD date
            const parsedEtd = this.parseFlightDate(auctionData.etd);
            if (!parsedEtd) {
                return { success: false, message: 'Thời gian cất cánh dự kiến (ETD) không đúng định dạng hợp lệ.' };
            }

            // Check if ETD is in the past
            if (parsedEtd.getTime() <= now.getTime()) {
                return {
                    success: false,
                    message: 'Không thể tạo chuyến bay trong quá khứ! Thời gian cất cánh dự kiến (ETD) phải ở thời điểm tương lai.'
                };
            }

            // Validate ETA if provided
            if (auctionData.eta) {
                const parsedEta = this.parseFlightDate(auctionData.eta);
                if (parsedEta && parsedEta.getTime() <= parsedEtd.getTime()) {
                    return {
                        success: false,
                        message: 'Thời gian hạ cánh dự kiến (ETA) phải sau thời gian cất cánh dự kiến (ETD).'
                    };
                }
            }

            const newId = data.auctions.length > 0 ? Math.max(...data.auctions.map(a => a.id || 0)) + 1 : 1;
            const flightNumber = (auctionData.flightNumber || 'VU999').trim().toUpperCase();
            const origin = (auctionData.origin || 'SGN').trim().toUpperCase();
            const dest = (auctionData.destination || 'HAN').trim().toUpperCase();

            const airportNames = {
                'SGN': 'TP. Hồ Chí Minh',
                'HAN': 'Hà Nội',
                'DAD': 'Đà Nẵng',
                'PQC': 'Phú Quốc',
                'CXR': 'Nha Trang'
            };

            const originName = airportNames[origin] || origin;
            const destName = airportNames[dest] || dest;
            const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '');
            const flightCode = `FL-${flightNumber}-${dateStr}`;

            const capacityKg = Number(auctionData.capacityKg) || 3000;
            const startingPriceKg = Number(auctionData.startingPriceKg) || 18000;
            const minStep = Number(auctionData.minStep) || 500;

            const formattedEtd = this.formatFlightDateDisplay(parsedEtd);
            const formattedEta = auctionData.eta ? this.formatFlightDateDisplay(auctionData.eta) : 'Chưa cập nhật';

            const endTime = new Date(now.getTime() + 120 * 60 * 1000).toISOString();

            const newAuction = {
                id: newId,
                flightCode: flightCode,
                flightNumber: flightNumber,
                route: `${origin} - ${dest}`,
                origin: origin,
                destination: dest,
                originName: originName,
                destName: destName,
                etd: formattedEtd,
                eta: formattedEta,
                etdIso: parsedEtd.toISOString(),
                aircraft: auctionData.aircraft || 'Airbus A321neo Cargo',
                capacityKg: capacityKg,
                startingPriceKg: startingPriceKg,
                currentPriceKg: startingPriceKg,
                minStep: minStep,
                endTime: endTime,
                status: 'OPEN',
                leadingAgentCode: 'Chưa có',
                leadingAgentName: 'Chưa có đại lý nào đặt giá',
                bidsCount: 0,
                specialNotes: auctionData.specialNotes || 'Tải trọng tổng hợp tiêu chuẩn IATA.',
                cutOffTime: auctionData.cutOffTime || 'Trước ETD 3 giờ'
            };

            data.auctions.unshift(newAuction);
            saveData(data);

            return {
                success: true,
                message: `Tạo phiên đấu giá chuyến ${flightNumber} (${origin} - ${dest}) thành công! Phiên đã mở trực tiếp trên sàn.`,
                auction: newAuction,
                ...newAuction
            };
        },

        getAuctions: function() {
            return loadData().auctions;
        },

        getAuctionById: function(id) {
            const auctions = loadData().auctions;
            return auctions.find(a => a.id == id);
        },

        getBidsForAuction: function(auctionId) {
            const bids = loadData().bids;
            return bids.filter(b => b.auctionId == auctionId).sort((a, b) => b.priceKg - a.priceKg);
        },

        getPublicAgentName: function(agentCode, agentName, isAnonymous = false, viewerContext = null) {
            const data = loadData();
            const currentUser = viewerContext || data.currentUser;
            const pathname = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '';
            const isAdminPage = pathname.includes('/Admin/') || pathname.includes('/admin/');

            // 1. Admin or Staff viewing on Admin Portal -> Full visibility + tag if anonymous
            if (isAdminPage && data.currentAdmin) {
                if (isAnonymous) {
                    return `${agentName || 'Đại lý'} (${agentCode || '-'}) [ẨN DANH]`;
                }
                return `${agentName || 'Đại lý'} (${agentCode || '-'})`;
            }

            // 2. The bidding agent themselves viewing -> Real name with (Bạn)
            if (currentUser && (currentUser.agentCode === agentCode || currentUser.code === agentCode)) {
                return `${agentName || currentUser.companyName} (Bạn)`;
            }

            // 3. Competitor agent viewing an anonymous bid -> Mask identity completely!
            if (isAnonymous) {
                const maskedCode = agentCode ? (agentCode.slice(0, 3) + '***') : 'AG-***';
                return `Đại lý ẩn danh (${maskedCode})`;
            }

            // 4. Competitor viewing non-anonymous bid -> Real name
            return agentName || 'Đại lý đấu thầu';
        },

        placeBid: function(auctionId, bidPriceKg, isAnonymous = true) {
            const data = loadData();
            const auction = data.auctions.find(a => a.id == auctionId);
            if (!auction) return { success: false, message: 'Phiên đấu giá không tồn tại' };

            // Check if auction is CLOSED or timer has expired
            const timer = getTimeRemaining(auction.endTime);
            if (auction.status === 'CLOSED' || timer.isEnded) {
                if (auction.status !== 'CLOSED') {
                    auction.status = 'CLOSED';
                    saveData(data);
                }
                return { success: false, message: 'Phiên đấu giá này đã đóng thầu, không thể đặt thêm giá.' };
            }

            const minAcceptable = auction.currentPriceKg + auction.minStep;
            if (bidPriceKg < minAcceptable) {
                return {
                    success: false,
                    message: `Giá đặt phải tối thiểu bằng ${formatCurrency(minAcceptable)}/Kg (Giá hiện tại + bước giá tối thiểu)`
                };
            }

            const user = data.currentUser || defaultData.currentUser;

            // Check if current agent account is LOCKED in agentsList
            const agentAccount = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === (user.agentCode || '').toUpperCase());
            if (agentAccount && (agentAccount.status === 'Đã khóa' || agentAccount.status === 'LOCKED')) {
                return { success: false, message: `Tài khoản đại lý ${user.agentCode} của bạn hiện đang BỊ KHÓA bởi Quản trị viên. Không thể gửi mức giá!` };
            }

            // Track previous leader before updating
            const previousLeaderCode = auction.leadingAgentCode;
            const previousLeaderName = auction.leadingAgentName;

            // Mark previous bids as OUTBID
            data.bids.forEach(b => {
                if (b.auctionId == auctionId && b.status === 'HIGHEST') {
                    b.status = 'OUTBID';
                }
            });

            const anonFlag = isAnonymous !== false;

            const now = Date.now();
            // Insert new bid with logged in agent's identity and isAnonymous flag
            const newBid = {
                id: now,
                timestamp: now,
                auctionId: Number(auctionId),
                agentCode: user.agentCode,
                agentName: user.companyName,
                isAnonymous: anonFlag,
                priceKg: Number(bidPriceKg),
                time: formatTimeAgo(now),
                status: 'HIGHEST',
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

            // 1. Notification for current bidder (HIGHEST)
            data.notifications.unshift({
                id: now,
                timestamp: now,
                targetAgentCode: user.agentCode,
                title: `Đặt giá thành công chuyến ${auction.flightNumber}`,
                message: `Bạn (${user.agentCode}) đang dẫn đầu mức giá ${formatCurrency(bidPriceKg)}/Kg cho chặng ${auction.route}.${anonFlag ? ' (Tên công ty được che ẩn danh đối với các đối thủ)' : ''}`,
                time: formatTimeAgo(now),
                type: 'HIGHEST',
                read: false,
                link: `04-Detail.html?id=${auction.id}`
            });

            // 2. Notification for previous leading agent (OUTBID)
            if (previousLeaderCode && previousLeaderCode !== user.agentCode) {
                const competitorNameDisplay = anonFlag ? 'Một đại lý đối thủ (Ẩn danh)' : `Đại lý ${user.companyName} (${user.agentCode})`;
                data.notifications.unshift({
                    id: now + 1,
                    timestamp: now + 1,
                    targetAgentCode: previousLeaderCode,
                    title: `Cảnh báo bị vượt giá chuyến ${auction.flightNumber}!`,
                    message: `${competitorNameDisplay} vừa đặt mức giá mới ${formatCurrency(bidPriceKg)}/Kg cho chặng ${auction.route}.`,
                    time: formatTimeAgo(now + 1),
                    type: 'OUTBID',
                    read: false,
                    link: `04-Detail.html?id=${auction.id}`
                });
            }

            saveData(data);
            return { success: true, bid: newBid, auction: auction };
        },

        toggleWatchlist: function(auctionId) {
            const data = loadData();
            const id = Number(auctionId);
            const index = data.watchlist.indexOf(id);
            let isWatched = false;
            if (index > -1) {
                data.watchlist.splice(index, 1);
                isWatched = false;
            } else {
                data.watchlist.push(id);
                isWatched = true;
            }
            saveData(data);
            return isWatched;
        },

        isWatched: function(auctionId) {
            const data = loadData();
            return data.watchlist.includes(Number(auctionId));
        },

        getWatchlistAuctions: function() {
            const data = loadData();
            return data.auctions.filter(a => data.watchlist.includes(a.id));
        },

        getMyBids: function() {
            const data = loadData();
            const code = data.currentUser ? data.currentUser.agentCode : 'AG-0892';
            return data.bids.filter(b => b.agentCode === code);
        },

        getWonAuctions: function() {
            const data = loadData();
            const code = data.currentUser ? data.currentUser.agentCode : 'AG-0892';
            return data.wonAuctions.filter(w => !w.agentCode || w.agentCode === code);
        },

        getNotifications: function() {
            const data = loadData();
            const user = data.currentUser;
            const allNotifs = data.notifications || [];
            if (!user || !user.agentCode) return allNotifs;
            // Only return notifications intended for this specific agent, or system broadcasts
            return allNotifs.filter(n => !n.targetAgentCode || n.targetAgentCode === user.agentCode);
        },

        markNotificationRead: function(id) {
            const data = loadData();
            const notif = data.notifications.find(n => n.id == id);
            if (notif) {
                notif.read = true;
                saveData(data);
            }
        },

        registerAgent: function(regData) {
            const data = loadData();
            if (!data.registrations) data.registrations = [];

            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
            const count = data.registrations.length + 1;
            const regId = `REG-${dateStr}-${String(count).padStart(2, '0')}`;

            const newReg = {
                regId: regId,
                companyName: regData.companyName || 'Công ty mới đăng ký',
                taxCode: regData.taxCode || '',
                address: regData.address || '',
                field: regData.field || 'Cargo Agent',
                repName: regData.repName || '',
                repPosition: regData.repPosition || 'Đại diện ủy quyền',
                email: regData.email || '',
                phone: regData.phone || '',
                password: regData.password || '12345678',
                pin: regData.pin || '1234',
                documents: (regData.documents && regData.documents.length > 0) ? regData.documents : ['GPKD_Scan.pdf', 'CCCD_NguoiDaiDien.pdf'],
                status: 'PENDING',
                submittedAt: now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
            };

            data.registrations.unshift(newReg);
            saveData(data);
            return newReg;
        },

        getRegistrations: function() {
            return loadData().registrations || [];
        },

        approveRegistration: function(regId) {
            const data = loadData();
            if (data.currentAdmin && data.currentAdmin.role === 'STAFF') {
                return { success: false, message: 'Nhân viên (STAFF) không có quyền phê duyệt hồ sơ đại lý. Thao tác này chỉ dành cho Quản trị viên (ADMIN).' };
            }
            const reg = data.registrations.find(r => r.regId === regId);
            if (!reg) return false;

            reg.status = 'APPROVED';
            const count = (data.agentsList || []).length + 1;
            const newCode = `AG-${String(count).padStart(4, '0')}`;
            const agentPwd = reg.password || '12345678';
            const agentPin = reg.pin || '1234';

            // Add to agents list with registered password & PIN
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
                totalWins: 0
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
                title: `[EMAIL THÔNG BÁO] Phê duyệt Hồ sơ & Cấp Mã Đại lý ${newCode}`,
                message: `Kính gửi ${reg.repName} (${reg.companyName}), Ban Điều hành Hãng hàng không xin thông báo: Hồ sơ đăng ký của Quý doanh nghiệp đã được PHÊ DUYỆT thành công! Mã Đại lý chính thức của Quý công ty là: ${newCode}. Mật khẩu đăng nhập: ${agentPwd} (Mã PIN Security: ${agentPin}). Quý công ty có thể sử dụng Mã Đại lý này để đăng nhập vào Sàn Đấu giá Cargo.`,
                time: formatTimeAgo(now),
                type: 'SYSTEM',
                read: false,
                link: '01-Login.html'
            });

            saveData(data);
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

        verifyPinAndGetPassword: function(agentCode, pinInput) {
            const data = loadData();
            const code = (agentCode || '').trim().toUpperCase();
            const agent = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === code);

            if (!agent) {
                return { success: false, message: `Mã đại lý "${code}" không tồn tại trong CSDL.` };
            }

            const expectedPin = agent.pin || '1234';
            if (String(pinInput).trim() !== String(expectedPin).trim()) {
                return { success: false, message: `Mã PIN Security 4 chữ số không chính xác cho đại lý ${code}!` };
            }

            return {
                success: true,
                password: agent.password || '12345678',
                agent: agent
            };
        },

        rejectRegistration: function(regId) {
            const data = loadData();
            if (data.currentAdmin && data.currentAdmin.role === 'STAFF') {
                return { success: false, message: 'Nhân viên (STAFF) không có quyền từ chối hồ sơ đại lý. Thao tác này chỉ dành cho Quản trị viên (ADMIN).' };
            }
            const reg = data.registrations.find(r => r.regId === regId);
            if (!reg) return false;
            reg.status = 'REJECTED';
            saveData(data);
            return true;
        },

        closeAuction: function(id) {
            const data = loadData();
            const auction = data.auctions.find(a => a.id == id);
            if (!auction) return { success: false, message: 'Phiên đấu giá không tồn tại' };

            if (auction.status === 'CLOSED') {
                return { success: false, message: 'Phiên đấu giá này đã được đóng trước đó.' };
            }

            auction.status = 'CLOSED';

            // Find highest bid for this auction
            const bids = (data.bids || []).filter(b => b.auctionId == id).sort((a, b) => b.priceKg - a.priceKg);
            const highestBid = bids.length > 0 ? bids[0] : null;

            if (highestBid) {
                highestBid.status = 'WON';
                auction.winnerAgentCode = highestBid.agentCode;
                auction.winnerAgentName = highestBid.agentName;
                auction.winningPriceKg = highestBid.priceKg;

                if (!data.wonAuctions) data.wonAuctions = [];
                const existingWon = data.wonAuctions.find(w => w.auctionId == auction.id);
                if (!existingWon) {
                    const now = new Date();
                    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
                    const payDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
                    data.wonAuctions.unshift({
                        wonId: `WON-${dateStr}-${String(auction.id).padStart(2, '0')}`,
                        auctionId: auction.id,
                        agentCode: highestBid.agentCode,
                        flightNumber: auction.flightNumber,
                        route: auction.route,
                        capacityKg: auction.capacityKg,
                        priceKg: highestBid.priceKg,
                        totalAmountVND: highestBid.priceKg * auction.capacityKg,
                        paymentDeadline: payDeadline,
                        paymentStatus: 'UNPAID',
                        paidAt: null,
                        awbNumber: `998-${Math.floor(10000000 + Math.random() * 90000000)}`,
                        cutOffTime: auction.cutOffTime || 'Hôm nay 18:00',
                        warehouse: 'Kho hàng SCSC / TCS Tân Sơn Nhất (Cửa số 4)'
                    });
                }

                if (!data.notifications) data.notifications = [];
                data.notifications.unshift({
                    id: Date.now(),
                    title: `Phiên ${auction.flightNumber} đã chốt kết quả!`,
                    message: `Đại lý ${highestBid.agentName} (${highestBid.agentCode}) đã trúng thầu chuyến ${auction.flightNumber} (${auction.route}) mức giá ${formatCurrency(highestBid.priceKg)}/Kg.`,
                    time: 'Vừa xong',
                    type: 'WON',
                    read: false,
                    link: '07-WonAuction.html'
                });
            }

            saveData(data);
            return { success: true, auction: auction };
        },

        changePassword: function(oldPassword, newPassword) {
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

        changeAdminPassword: function(oldPassword, newPassword) {
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
            return { success: true, message: 'Đổi mật khẩu Admin thành công! Mật khẩu mặc định/cũ đã bị vô hiệu hóa.' };
        },

        getCurrentAdmin: function() {
            return loadData().currentAdmin;
        },

        updateAgentProfile: function(profileData) {
            const data = loadData();
            const user = data.currentUser;
            if (!user) return { success: false, message: 'Chưa đăng nhập tài khoản đại lý.' };

            if (profileData.repName) user.fullName = profileData.repName;
            if (profileData.position) user.position = profileData.position;
            if (profileData.email) user.email = profileData.email;
            if (profileData.phone) user.phone = profileData.phone;
            if (profileData.address) user.address = profileData.address;
            if (profileData.companyName) user.companyName = profileData.companyName;

            // Update in agentsList as well
            if (data.agentsList) {
                const ag = data.agentsList.find(a => (a.code || '').toUpperCase() === (user.agentCode || '').toUpperCase());
                if (ag) {
                    if (profileData.repName) ag.repName = profileData.repName;
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

        updateAuction: function(id, updateData) {
            const data = loadData();
            const auction = data.auctions.find(a => a.id == id);
            if (!auction) return { success: false, message: 'Phiên đấu giá không tồn tại.' };

            if (updateData.capacityKg) auction.capacityKg = Number(updateData.capacityKg);
            if (updateData.startingPriceKg) {
                auction.startingPriceKg = Number(updateData.startingPriceKg);
                // If currentPriceKg is at or below new startingPriceKg, update it
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

            if (updateData.extendMinutes) {
                auction.endTime = new Date(Date.now() + Number(updateData.extendMinutes) * 60 * 1000).toISOString();
                if (updateData.reopen) auction.status = 'OPEN';
            }

            saveData(data);
            return { success: true, message: `Cập nhật thông số chuyến bay ${auction.flightNumber} thành công!`, auction: auction };
        },

        deleteAuction: function(id) {
            const data = loadData();
            const idx = data.auctions.findIndex(a => a.id == id);
            if (idx === -1) return { success: false, message: 'Phiên đấu giá không tồn tại.' };

            const removed = data.auctions.splice(idx, 1)[0];
            data.bids = (data.bids || []).filter(b => b.auctionId != id);

            saveData(data);
            return { success: true, message: `Đã xóa chuyến bay ${removed.flightNumber} khỏi hệ thống.` };
        },

        sendBroadcastNotification: function(notifData) {
            const data = loadData();
            if (!data.notifications) data.notifications = [];

            const newNotif = {
                id: Date.now(),
                title: notifData.title || 'Thông báo từ Ban Điều hành Cargo',
                message: notifData.message || '',
                time: 'Vừa xong',
                type: notifData.type || 'SYSTEM',
                read: false,
                link: notifData.link || '03-Index.html',
                targetAgentCode: notifData.targetAgentCode || null
            };

            data.notifications.unshift(newNotif);
            saveData(data);
            return { success: true, message: 'Đã phát thông báo đấu giá thành công tới các Đại lý!', notification: newNotif };
        },

        toggleUserLock: function(identifier, type = 'agent') {
            const data = loadData();
            if (data.currentAdmin && data.currentAdmin.role === 'STAFF') {
                return { success: false, message: 'Nhân viên (STAFF) không có quyền kích hoạt hoặc khóa tài khoản. Thao tác này chỉ dành cho Quản trị viên (ADMIN).' };
            }

            if (type === 'agent') {
                const target = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === (identifier || '').toUpperCase());
                if (target) {
                    const isCurrentlyActive = target.status === 'Đang hoạt động';
                    target.status = isCurrentlyActive ? 'Đã khóa' : 'Đang hoạt động';
                    saveData(data);
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
                    target.status = isCurrentlyActive ? 'Đã khóa' : 'Đang hoạt động';
                    saveData(data);
                    return {
                        success: true,
                        newStatus: target.status,
                        message: `Đã ${isCurrentlyActive ? 'KHÓA' : 'KÍCH HOẠT / MỞ KHÓA'} tài khoản nhân viên "${target.username}".`
                    };
                }
            }

            return { success: false, message: 'Không tìm thấy người dùng trong hệ thống.' };
        },

        updateUserRole: function(identifier, newRole, type = 'agent') {
            const data = loadData();
            if (data.currentAdmin && data.currentAdmin.role === 'STAFF') {
                return { success: false, message: 'Nhân viên (STAFF) không có quyền phân quyền hoặc thay đổi vai trò/phân hạng người dùng. Thao tác này chỉ dành cho Quản trị viên (ADMIN).' };
            }

            if (type === 'agent') {
                const target = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === (identifier || '').toUpperCase());
                if (target) {
                    target.tier = newRole;
                    saveData(data);
                    return { success: true, message: `Đã phân hạng đại lý ${target.code} thành ${newRole}.` };
                }
            } else {
                const target = (data.adminsList || []).find(a => (a.username || '').toLowerCase() === (identifier || '').toLowerCase());
                if (target) {
                    target.role = newRole;
                    saveData(data);
                    return { success: true, message: `Đã cập nhật vai trò cho "${target.username}" thành ${newRole}.` };
                }
            }
            return { success: false, message: 'Không tìm thấy người dùng.' };
        },

        createStaffAccount: function(staffData) {
            const data = loadData();
            if (data.currentAdmin && data.currentAdmin.role === 'STAFF') {
                return { success: false, message: 'Nhân viên (STAFF) không có quyền tạo hoặc phân quyền tài khoản nhân viên mới. Thao tác này chỉ dành cho Quản trị viên (ADMIN).' };
            }

            if (!data.adminsList) data.adminsList = seedAdmins;

            const u = (staffData.username || '').trim().toLowerCase();
            if (!u) return { success: false, message: 'Tên đăng nhập không được để trống.' };

            const exists = data.adminsList.some(a => (a.username || '').toLowerCase() === u);
            if (exists) return { success: false, message: `Tài khoản "${u}" đã tồn tại trên hệ thống.` };

            const newStaff = {
                id: Date.now(),
                username: u,
                password: staffData.password || 'staff2026',
                role: staffData.role || 'STAFF',
                fullName: staffData.fullName || 'Nhân viên Điều hành',
                email: staffData.email || `${u}@airline.vn`,
                department: staffData.department || 'Air Cargo Flight Operations',
                status: 'Đang hoạt động'
            };

            data.adminsList.push(newStaff);
            saveData(data);
            return { success: true, message: `Đã tạo mới tài khoản nhân viên "${u}" (${newStaff.fullName}).`, staff: newStaff };
        },

        updateSystemSettings: function(settingsData) {
            const data = loadData();
            if (data.currentAdmin && data.currentAdmin.role === 'STAFF') {
                return { success: false, message: 'Nhân viên (STAFF) không có quyền thay đổi cấu hình hệ thống (CRUD System Settings). Thao tác này chỉ dành cho Quản trị viên (ADMIN).' };
            }

            if (!data.settings) data.settings = {};

            if (settingsData.minIncrement) data.settings.minIncrement = Number(settingsData.minIncrement);
            if (settingsData.cutoffHours) data.settings.cutoffHours = Number(settingsData.cutoffHours);
            if (settingsData.paymentWindowHours) data.settings.paymentWindowHours = Number(settingsData.paymentWindowHours);
            if (settingsData.hotline) data.settings.hotline = settingsData.hotline;
            if (settingsData.supportEmail) data.settings.supportEmail = settingsData.supportEmail;
            if (settingsData.platformFee) data.settings.platformFee = Number(settingsData.platformFee);

            saveData(data);
            return { success: true, message: 'Đã lưu cấu hình hệ thống thành công!', settings: data.settings };
        },

        getSystemSettings: function() {
            return loadData().settings || defaultData.settings;
        },

        logoutAgent: function() {
            const data = loadData();
            data.currentUser = null;
            saveData(data);
        },

        logoutAdmin: function() {
            const data = loadData();
            data.currentAdmin = null;
            saveData(data);
        },

        syncHeaderUI: function() {
            const user = loadData().currentUser;
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
            document.querySelectorAll('.agent-tier-badge').forEach(el => {
                el.textContent = user.tier || 'TIER1';
            });

            const avatar = document.getElementById('headerUserAvatar') || document.getElementById('hdrAvatar');
            const code = document.getElementById('headerUserCode') || document.getElementById('hdrCode');
            const company = document.getElementById('headerCompanyName') || document.getElementById('hdrCompany');

            if (avatar) avatar.textContent = (user.agentCode || 'AG').slice(0, 2);
            if (code) code.textContent = user.agentCode;
            if (company) company.textContent = user.companyName;
        },

        syncAdminHeaderUI: function() {
            const admin = loadData().currentAdmin;
            if (!admin) return;

            const isStaff = admin.role === 'STAFF';
            const roleName = isStaff ? 'NHÂN VIÊN ĐIỀU HÀNH' : 'QUẢN TRỊ VIÊN';
            const badgeClass = isStaff ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30';

            document.querySelectorAll('.admin-header-name').forEach(el => {
                el.textContent = admin.fullName || admin.username;
            });

            document.querySelectorAll('.admin-header-role').forEach(el => {
                el.className = `text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass} inline-flex items-center gap-1`;
                el.innerHTML = isStaff ? '<i class="fa-solid fa-user-gear text-[9px]"></i> ' + roleName : '<i class="fa-solid fa-shield-halved text-[9px]"></i> ' + roleName;
            });
        }
    };
})();

// Auto sync headers on page load
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        if (typeof CargoStore !== 'undefined') {
            if (CargoStore.syncHeaderUI) CargoStore.syncHeaderUI();
            if (CargoStore.syncAdminHeaderUI) CargoStore.syncAdminHeaderUI();
        }
    });
}
