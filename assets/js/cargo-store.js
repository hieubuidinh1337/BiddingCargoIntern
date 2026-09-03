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
            if (!raw) {
                saveData(defaultData);
                return defaultData;
            }
            const data = JSON.parse(raw);
            if (!data.agentsList || data.agentsList.length === 0) {
                data.agentsList = seedAgents;
                saveData(data);
            }
            return data;
        } catch (e) {
            console.error('Error loading CargoStore data', e);
            return defaultData;
        }
    }

    function saveData(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Error saving CargoStore data', e);
        }
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

    return {
        getData: loadData,
        saveData: saveData,
        formatCurrency: formatCurrency,
        formatNumber: formatNumber,
        getTimeRemaining: getTimeRemaining,

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

        createAuction: function(auctionData) {
            const data = loadData();
            if (!data.auctions) data.auctions = [];

            const newId = data.auctions.length > 0 ? Math.max(...data.auctions.map(a => a.id || 0)) + 1 : 1;
            const now = new Date();
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
                etd: auctionData.etd || '18:30 · Hôm nay',
                eta: auctionData.eta || '20:45 · Hôm nay',
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
            return newAuction;
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

        placeBid: function(auctionId, bidPriceKg) {
            const data = loadData();
            const auction = data.auctions.find(a => a.id == auctionId);
            if (!auction) return { success: false, message: 'Phiên đấu giá không tồn tại' };

            const minAcceptable = auction.currentPriceKg + auction.minStep;
            if (bidPriceKg < minAcceptable) {
                return {
                    success: false,
                    message: `Giá đặt phải tối thiểu bằng ${formatCurrency(minAcceptable)}/Kg (Giá hiện tại + bước giá tối thiểu)`
                };
            }

            // Mark previous bids as OUTBID
            data.bids.forEach(b => {
                if (b.auctionId == auctionId && b.status === 'HIGHEST') {
                    b.status = 'OUTBID';
                }
            });

            const user = data.currentUser || defaultData.currentUser;

            // Insert new bid with logged in agent's identity
            const newBid = {
                id: Date.now(),
                auctionId: Number(auctionId),
                agentCode: user.agentCode,
                agentName: user.companyName,
                priceKg: Number(bidPriceKg),
                time: 'Vừa xong',
                status: 'HIGHEST',
                weightKg: auction.capacityKg
            };
            data.bids.unshift(newBid);

            // Update auction stats
            auction.currentPriceKg = Number(bidPriceKg);
            auction.leadingAgentCode = user.agentCode;
            auction.leadingAgentName = user.companyName;
            auction.bidsCount = (auction.bidsCount || 0) + 1;

            // Update user stats
            user.stats.totalBids = (user.stats.totalBids || 0) + 1;

            // Create notification
            data.notifications.unshift({
                id: Date.now(),
                title: `Đặt giá thành công chuyến ${auction.flightNumber}`,
                message: `Bạn (${user.agentCode}) đang dẫn đầu mức giá ${formatCurrency(bidPriceKg)}/Kg cho chặng ${auction.route}.`,
                time: 'Vừa xong',
                type: 'HIGHEST',
                read: false,
                link: `04-Detail.html?id=${auction.id}`
            });

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
            return loadData().notifications || [];
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
            const reg = data.registrations.find(r => r.regId === regId);
            if (!reg) return false;

            reg.status = 'APPROVED';
            const count = (data.agentsList || []).length + 1;
            const newCode = `AG-${String(count).padStart(4, '0')}`;

            // Add to agents list with default password
            data.agentsList.push({
                id: Date.now(),
                code: newCode,
                password: '12345678',
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
            });

            saveData(data);
            return newCode;
        },

        rejectRegistration: function(regId) {
            const data = loadData();
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
        }
    };
})();

// Auto sync headers on page load
document.addEventListener('DOMContentLoaded', function() {
    if (typeof CargoStore !== 'undefined' && CargoStore.syncHeaderUI) {
        CargoStore.syncHeaderUI();
    }
});
