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
                flightCode: 'FL-VU130-260908',
                flightNumber: 'VU130',
                route: 'SGN - HAN',
                origin: 'SGN',
                destination: 'HAN',
                originName: 'TP. Hồ Chí Minh',
                destName: 'Hà Nội',
                etd: '20:45 · 08/09/2026',
                eta: '23:00 · 08/09/2026',
                etdIso: new Date(Date.now() + 3 * 3600 * 1000 + 48 * 60 * 1000).toISOString(),
                aircraft: 'Airbus A321neo Cargo',
                capacityKg: 3500,
                startingPriceKg: 18000,
                currentPriceKg: 56500,
                minStep: 500,
                endTime: new Date(Date.now() + 48 * 60 * 1000).toISOString(),
                status: 'OPEN',
                leadingAgentCode: 'AG-0892',
                leadingAgentName: 'ABC Logistics',
                bidsCount: 10,
                specialNotes: 'Hàng tổng hợp, hỗ trợ kho lạnh bảo quản thực phẩm & dược phẩm.',
                cutOffTime: '17:45 · 08/09/2026',
                isAnonymous: true
            },
            {
                id: 2,
                flightCode: 'FL-VU224-260908',
                flightNumber: 'VU224',
                route: 'SGN - DAD',
                origin: 'SGN',
                destination: 'DAD',
                originName: 'TP. Hồ Chí Minh',
                destName: 'Đà Nẵng',
                etd: '21:30 · 08/09/2026',
                eta: '22:50 · 08/09/2026',
                etdIso: new Date(Date.now() + 4 * 3600 * 1000 + 35 * 60 * 1000).toISOString(),
                aircraft: 'Airbus A320-200',
                capacityKg: 2000,
                startingPriceKg: 12000,
                currentPriceKg: 14500,
                minStep: 500,
                endTime: new Date(Date.now() + 95 * 60 * 1000).toISOString(),
                status: 'OPEN',
                leadingAgentCode: 'AG-1024',
                leadingAgentName: 'Vinatrans',
                bidsCount: 4,
                specialNotes: 'Ưu tiên bưu kiện bưu phẩm thương mại điện tử chuyển phát nhanh.',
                cutOffTime: '18:30 · 08/09/2026',
                isAnonymous: true
            },
            {
                id: 3,
                flightCode: 'FL-VU340-260908',
                flightNumber: 'VU340',
                route: 'HAN - PQC',
                origin: 'HAN',
                destination: 'PQC',
                originName: 'Hà Nội',
                destName: 'Phú Quốc',
                etd: '22:45 · 08/09/2026',
                eta: '01:00 · 09/09/2026',
                etdIso: new Date(Date.now() + 5 * 3600 * 1000 + 50 * 60 * 1000).toISOString(),
                aircraft: 'Airbus A321neo Cargo',
                capacityKg: 4000,
                startingPriceKg: 22000,
                currentPriceKg: 30000,
                minStep: 1000,
                endTime: new Date(Date.now() + 170 * 60 * 1000).toISOString(),
                status: 'OPEN',
                leadingAgentCode: 'AG-0556',
                leadingAgentName: 'Golden Star',
                bidsCount: 6,
                specialNotes: 'Hàng hải sản đông lạnh tươi sống đóng thùng xốp tiêu chuẩn IATA.',
                cutOffTime: '19:45 · 08/09/2026',
                isAnonymous: true
            },
            {
                id: 4,
                flightCode: 'FL-VU132-260908',
                flightNumber: 'VU132',
                route: 'SGN - HAN',
                origin: 'SGN',
                destination: 'HAN',
                originName: 'TP. Hồ Chí Minh',
                destName: 'Hà Nội',
                etd: '10:00 · 08/09/2026',
                eta: '12:15 · 08/09/2026',
                etdIso: '2026-09-08T03:00:00.000Z',
                aircraft: 'Airbus A321-200',
                capacityKg: 3000,
                startingPriceKg: 18000,
                currentPriceKg: 22000,
                minStep: 500,
                endTime: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
                status: 'CLOSED',
                leadingAgentCode: 'AG-0892',
                leadingAgentName: 'ABC Logistics',
                bidsCount: 12,
                winnerAgentCode: 'AG-0892',
                winnerAgentName: 'ABC Logistics',
                winningPriceKg: 22000,
                specialNotes: 'Phiên đã đóng hôm nay, thắng thầu chính thức.',
                cutOffTime: '07:00 · 08/09/2026',
                isAnonymous: true
            }
        ],
        bids: [
            {
                id: Date.now() - 3 * 60 * 1000,
                timestamp: Date.now() - 3 * 60 * 1000,
                auctionId: 1,
                agentCode: 'AG-0892',
                agentName: 'ABC Logistics',
                isAnonymous: true,
                priceKg: 56500,
                time: '3 phút trước',
                status: 'HIGHEST',
                weightKg: 3500
            },
            {
                id: Date.now() - 6 * 60 * 1000,
                timestamp: Date.now() - 6 * 60 * 1000,
                auctionId: 1,
                agentCode: 'AG-0892',
                agentName: 'ABC Logistics',
                isAnonymous: true,
                priceKg: 56000,
                time: '6 phút trước',
                status: 'OUTBID',
                weightKg: 3500
            },
            {
                id: Date.now() - 15 * 60 * 1000,
                timestamp: Date.now() - 15 * 60 * 1000,
                auctionId: 1,
                agentCode: 'AG-0556',
                agentName: 'Golden Star Forwarding',
                isAnonymous: true,
                priceKg: 41500,
                time: '15 phút trước',
                status: 'OUTBID',
                weightKg: 3500
            },
            {
                id: Date.now() - 25 * 60 * 1000,
                timestamp: Date.now() - 25 * 60 * 1000,
                auctionId: 1,
                agentCode: 'AG-1024',
                agentName: 'Vinatrans Express',
                isAnonymous: true,
                priceKg: 39000,
                time: '25 phút trước',
                status: 'OUTBID',
                weightKg: 3500
            },
            {
                id: Date.now() - 35 * 60 * 1000,
                timestamp: Date.now() - 35 * 60 * 1000,
                auctionId: 1,
                agentCode: 'AG-0556',
                agentName: 'Golden Star Forwarding',
                isAnonymous: true,
                priceKg: 25000,
                time: '35 phút trước',
                status: 'OUTBID',
                weightKg: 3500
            },
            {
                id: Date.now() - 42 * 60 * 1000,
                timestamp: Date.now() - 42 * 60 * 1000,
                auctionId: 1,
                agentCode: 'AG-1024',
                agentName: 'Vinatrans Express',
                isAnonymous: true,
                priceKg: 24500,
                time: '42 phút trước',
                status: 'OUTBID',
                weightKg: 3500
            },
            {
                id: Date.now() - 48 * 60 * 1000,
                timestamp: Date.now() - 48 * 60 * 1000,
                auctionId: 1,
                agentCode: 'AG-0556',
                agentName: 'Golden Star Forwarding',
                isAnonymous: true,
                priceKg: 23000,
                time: '48 phút trước',
                status: 'OUTBID',
                weightKg: 3500
            },
            {
                id: Date.now() - 52 * 60 * 1000,
                timestamp: Date.now() - 52 * 60 * 1000,
                auctionId: 1,
                agentCode: 'AG-0892',
                agentName: 'ABC Logistics',
                isAnonymous: true,
                priceKg: 21500,
                time: '52 phút trước',
                status: 'OUTBID',
                weightKg: 3500
            },
            {
                id: Date.now() - 56 * 60 * 1000,
                timestamp: Date.now() - 56 * 60 * 1000,
                auctionId: 1,
                agentCode: 'AG-0556',
                agentName: 'Golden Star Forwarding',
                isAnonymous: true,
                priceKg: 20000,
                time: '56 phút trước',
                status: 'OUTBID',
                weightKg: 3500
            },
            {
                id: Date.now() - 60 * 60 * 1000,
                timestamp: Date.now() - 60 * 60 * 1000,
                auctionId: 1,
                agentCode: 'AG-1024',
                agentName: 'Vinatrans Express',
                isAnonymous: true,
                priceKg: 19000,
                time: '1 giờ trước',
                status: 'OUTBID',
                weightKg: 3500
            }
        ],
        watchlist: [1, 2, 3],
        wonAuctions: [
            {
                wonId: 'WON-2026-0814-01',
                auctionId: 4,
                agentCode: 'AG-0892',
                agentName: 'ABC Logistics',
                flightNumber: 'VU132',
                route: 'SGN - HAN',
                capacityKg: 3000,
                priceKg: 22000,
                totalAmountVND: 66000000,
                paymentDeadline: '2026-09-08T00:00:00.000Z',
                paymentStatus: 'PAID',
                paidAt: '08/09/2026 08:30',
                awbNumber: '998-12345678',
                cutOffTime: '07:00 · 08/09/2026',
                warehouse: 'Kho hàng TCS Tân Sơn Nhất (Cửa số 4)',
                cargoDeclaration: null
            },
            {
                wonId: 'WON-2026-0815-02',
                auctionId: 2,
                agentCode: 'AG-1024',
                agentName: 'Vinatrans Express',
                flightNumber: 'VU224',
                route: 'SGN - DAD',
                capacityKg: 2000,
                priceKg: 14500,
                totalAmountVND: 29000000,
                paymentDeadline: '2026-09-09T06:00:00.000Z',
                paymentStatus: 'UNPAID',
                paidAt: null,
                awbNumber: '998-22409811',
                cutOffTime: '13:00 · 09/09/2026',
                warehouse: 'Kho hàng TCS Tân Sơn Nhất (Cửa số 2)',
                cargoDeclaration: null
            },
            {
                wonId: 'WON-2026-0815-03',
                auctionId: 1,
                agentCode: 'AG-0892',
                agentName: 'ABC Logistics',
                flightNumber: 'VU130',
                route: 'SGN - HAN',
                capacityKg: 3500,
                priceKg: 56000,
                totalAmountVND: 196000000,
                paymentDeadline: '2026-09-09T04:30:00.000Z',
                paymentStatus: 'PAID',
                paidAt: '08/09/2026 14:15',
                awbNumber: '998-13098722',
                cutOffTime: '11:30 · 09/09/2026',
                warehouse: 'Kho hàng SCSC Tân Sơn Nhất',
                cargoDeclaration: null
            },
            {
                wonId: 'WON-2026-0815-04',
                auctionId: 3,
                agentCode: 'AG-0556',
                agentName: 'Golden Star Logistics',
                flightNumber: 'VU340',
                route: 'HAN - PQC',
                capacityKg: 4000,
                priceKg: 25000,
                totalAmountVND: 100000000,
                paymentDeadline: '2026-09-09T09:15:00.000Z',
                paymentStatus: 'UNPAID',
                paidAt: null,
                notifiedAt: null,
                awbNumber: '998-34077611',
                cutOffTime: '16:15 · 09/09/2026',
                warehouse: 'Kho hàng Cargo Nội Bài (Cửa số 1)',
                cargoDeclaration: null
            },
            {
                wonId: 'WON-2026-0816-05',
                auctionId: 5,
                agentCode: 'AG-0892',
                agentName: 'ABC Logistics',
                flightNumber: 'VU226',
                route: 'SGN - DAD',
                capacityKg: 2500,
                priceKg: 18500,
                totalAmountVND: 46250000,
                paymentDeadline: '2026-09-09T11:00:00.000Z',
                paymentStatus: 'PAID',
                paidAt: '08/09/2026 15:45',
                awbNumber: '998-22688192',
                cutOffTime: '18:00 · 09/09/2026',
                warehouse: 'Kho hàng TCS Tân Sơn Nhất (Cửa số 3)',
                cargoDeclaration: null
            },
            {
                wonId: 'WON-20260908-06',
                auctionId: 6,
                agentCode: 'AG-0892',
                agentName: 'ABC Logistics',
                flightNumber: 'VU32453',
                route: 'SGN - HAN',
                capacityKg: 3000,
                priceKg: 25000,
                totalAmountVND: 75000000,
                paymentDeadline: '2026-09-09T00:57:00.000Z',
                paymentStatus: 'UNPAID',
                paidAt: null,
                awbNumber: '998-18929204',
                cutOffTime: '07:57 · 09/09/2026',
                warehouse: 'Kho hàng SCSC / TCS Tân Sơn Nhất (Cửa số 4)',
                cargoDeclaration: null
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
                documents: [
                    { name: 'GPKD_SaoMai_Scan.pdf', dataUrl: null, type: 'application/pdf' },
                    { name: 'UyQuyen_Cargo_SaoMai.pdf', dataUrl: null, type: 'application/pdf' },
                    { name: 'CCCD_HoangDucTrong.pdf', dataUrl: null, type: 'application/pdf' }
                ],
                status: 'PENDING',
                submittedAt: '05/08/2026 10:15'
            }
        ],
        settings: {
            minIncrement: 500,
            cutoffHours: 3,
            paymentWindowHours: 24,
            hotline: '1900-xxxx',
            supportEmail: 'cargo-bidding@airline.vn',
            hideAgentCredentials: true,
            smtp: {
                host: 'smtp.gmail.com',
                port: 465,
                user: 'jome7093@gmail.com',
                pass: 'fcjuktvwjqhgilzb',
                fromName: 'Vietravel Airlines Cargo'
            }
        },
        bankConfig: {
            bankName: 'Ngân hàng TMCP Ngoại thương Việt Nam (Vietcombank)',
            bankCode: 'VCB',
            bankBin: '970436',
            accountNumber: '1029384756',
            accountName: 'CONG TY CP HANG KHONG VIETRAVEL',
            branch: 'Chi nhánh Tân Bình - TP. Hồ Chí Minh',
            memoPrefix: 'CARGO'
        },
        routeSubscriptions: {
            'AG-0892': {
                routes: ['HAN-SGN', 'SGN-HAN', 'SGN-DAD'],
                notifyOnNewAuction: true,
                notifyOnOutbid: true,
                notifyOnClosingSoon: true,
                notifyOnWon: true,
                emailAlert: true,
                soundAlert: true
            },
            'AG-1024': {
                routes: ['SGN-DAD', 'DAD-SGN'],
                notifyOnNewAuction: true,
                notifyOnOutbid: true,
                notifyOnClosingSoon: true,
                notifyOnWon: true,
                emailAlert: true,
                soundAlert: true
            }
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

            if (!data.bankConfig) {
                data.bankConfig = JSON.parse(JSON.stringify(defaultData.bankConfig));
                updated = true;
            }

            if (!data.routeSubscriptions) {
                data.routeSubscriptions = JSON.parse(JSON.stringify(defaultData.routeSubscriptions));
                updated = true;
            }

            // Ensure data.auctions has default seed if missing or empty
            if (!data.auctions || !Array.isArray(data.auctions) || data.auctions.length === 0) {
                data.auctions = JSON.parse(JSON.stringify(defaultData.auctions));
                updated = true;
            }

            // Auto-refresh ETD and end time for OPEN auctions if expired & deduplicate
            const now = Date.now();
            const pad = n => String(n).padStart(2, '0');
            if (data.auctions && Array.isArray(data.auctions)) {
                const seenIds = new Set();
                const uniqueAuctions = [];
                data.auctions.forEach((a, idx) => {
                    const idKey = a.id;
                    if (!seenIds.has(idKey)) {
                        seenIds.add(idKey);
                        if (a.status === 'OPEN') {
                            const endTimeMs = Date.parse(a.endTime);
                            let etdDate = a.etdIso ? new Date(a.etdIso) : parseFlightDate(a.etd);
                            
                            // Check if ETD is in the past or less than 3h from now (Cut-off is 3h before ETD)
                            const isEtdPastOrTooClose = !etdDate || isNaN(etdDate.getTime()) || etdDate.getTime() <= (now + 3 * 3600 * 1000);
                            
                            if (isEtdPastOrTooClose) {
                                // Calculate a realistic upcoming departure ETD (tomorrow or later with sufficient lead time)
                                const durationMins = getFlightDurationMinutes(a.origin, a.destination);
                                const futureEtdDate = new Date(now + 8 * 3600 * 1000 + (idx % 5) * 3 * 3600 * 1000);
                                futureEtdDate.setMinutes(Math.round(futureEtdDate.getMinutes() / 15) * 15, 0, 0);

                                a.etd = `${pad(futureEtdDate.getHours())}:${pad(futureEtdDate.getMinutes())} · ${pad(futureEtdDate.getDate())}/${pad(futureEtdDate.getMonth() + 1)}/${futureEtdDate.getFullYear()}`;
                                a.etdIso = futureEtdDate.toISOString();

                                const etaDate = new Date(futureEtdDate.getTime() + durationMins * 60 * 1000);
                                a.eta = `${pad(etaDate.getHours())}:${pad(etaDate.getMinutes())} · ${pad(etaDate.getDate())}/${pad(etaDate.getMonth() + 1)}/${etaDate.getFullYear()}`;

                                const cutOffDate = new Date(futureEtdDate.getTime() - 3 * 3600 * 1000);
                                a.cutOffTime = `${pad(cutOffDate.getHours())}:${pad(cutOffDate.getMinutes())} · ${pad(cutOffDate.getDate())}/${pad(cutOffDate.getMonth() + 1)}/${cutOffDate.getFullYear()}`;

                                // Auction closes 5h before ETD (or at least 2h from now)
                                const closeMs = Math.max(now + 2 * 3600 * 1000, futureEtdDate.getTime() - 5 * 3600 * 1000);
                                a.endTime = new Date(closeMs).toISOString();
                                updated = true;
                            } else if (isNaN(endTimeMs) || endTimeMs <= now) {
                                // If ETD is valid future date, but endTime expired: set endTime to close safely before cut-off
                                const safeClose = Math.min(now + 3 * 3600 * 1000, etdDate.getTime() - 4 * 3600 * 1000);
                                a.endTime = new Date(Math.max(now + 30 * 60 * 1000, safeClose)).toISOString();
                                updated = true;
                            }
                        }
                        uniqueAuctions.push(a);
                    } else {
                        updated = true;
                    }
                });
                data.auctions = uniqueAuctions;
            }

            // Self-healing: Ensure at least 3 active OPEN auctions exist for the live portal demo
            const openAuctionsList = (data.auctions || []).filter(a => a.status === 'OPEN');
            if (openAuctionsList.length < 2) {
                if (!data.auctions || data.auctions.length < 3) {
                    data.auctions = JSON.parse(JSON.stringify(defaultData.auctions));
                    updated = true;
                } else {
                    data.auctions.forEach((a, idx) => {
                        if (a.id === 1 || a.id === 2 || a.id === 3 || idx < 3) {
                            a.status = 'OPEN';
                            a.endTime = new Date(now + (idx + 1) * 90 * 60 * 1000).toISOString();
                            updated = true;
                        }
                    });
                }
            }

            if (!data.agentsList || !Array.isArray(data.agentsList) || data.agentsList.length === 0) {
                data.agentsList = JSON.parse(JSON.stringify(seedAgents));
                updated = true;
            }

            if (!data.adminsList || !Array.isArray(data.adminsList) || data.adminsList.length === 0) {
                data.adminsList = JSON.parse(JSON.stringify(seedAdmins));
                updated = true;
            }

            if (!data.registrations || !Array.isArray(data.registrations) || data.registrations.length === 0) {
                data.registrations = JSON.parse(JSON.stringify(defaultData.registrations));
                updated = true;
            }

            if (!data.wonAuctions || !Array.isArray(data.wonAuctions) || data.wonAuctions.length < 5) {
                data.wonAuctions = JSON.parse(JSON.stringify(defaultData.wonAuctions));
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

            // Normalize wonAuctions and migrate August dates & un-cancel expired won orders
            if (data.wonAuctions && Array.isArray(data.wonAuctions)) {
                data.wonAuctions.forEach(w => {
                    const auction = (data.auctions || []).find(a => a.id == w.auctionId || a.flightNumber === w.flightNumber);
                    
                    if (w.cutOffTime) {
                        if (w.cutOffTime.includes('15/08/2026')) w.cutOffTime = w.cutOffTime.replace('15/08/2026', '09/09/2026');
                        if (w.cutOffTime.includes('16/08/2026')) w.cutOffTime = w.cutOffTime.replace('16/08/2026', '09/09/2026');
                        if (w.cutOffTime.includes('14/08/2026')) w.cutOffTime = w.cutOffTime.replace('14/08/2026', '08/09/2026');
                    }

                    const curDlMs = w.paymentDeadline ? new Date(w.paymentDeadline).getTime() : 0;
                    if (auction && (isNaN(curDlMs) || curDlMs < Date.now() || (w.paymentDeadline && w.paymentDeadline.includes('2026-08')))) {
                        const correctDl = calculatePaymentDeadline(auction, new Date());
                        w.paymentDeadline = correctDl;
                        updated = true;
                    }

                    // Restore won auctions from EXPIRED back to UNPAID
                    if (w.paymentStatus === 'EXPIRED') {
                        w.paymentStatus = 'UNPAID';
                        updated = true;
                    }
                });
            }

            // Migration cleanup complete

            // Clean up obsolete lock notifications & mark admin reconciliation notifications
            if (data.notifications && Array.isArray(data.notifications)) {
                const originalLen = data.notifications.length;
                data.notifications = data.notifications.filter(n => {
                    if (!n) return false;
                    const isLockAlert = (n.type === 'ALERT' && (n.title || '').includes('TÀI KHOẢN ĐÃ BỊ KHÓA')) || ((n.message || '').includes('tự động KHÓA'));
                    return !isLockAlert;
                });
                data.notifications.forEach(n => {
                    if ((n.title || '').includes('ĐẠI LÝ BÁO CHUYỂN KHOẢN') || (n.message || '').includes('đối soát sao kê ngân hàng')) {
                        n.targetRole = 'ADMIN';
                        n.targetAgentCode = null;
                        updated = true;
                    }
                });
                if (data.notifications.length !== originalLen) updated = true;
            }

            // Migrate any old August 2026 or outdated auction dates to current/upcoming September 2026 dates
            if (data.auctions && Array.isArray(data.auctions)) {
                data.auctions.forEach(a => {
                    if (a.etd && a.etd.includes('15/08/2026')) {
                        a.etd = a.etd.replace('15/08/2026', '09/09/2026');
                        if (a.eta) a.eta = a.eta.replace('15/08/2026', '09/09/2026');
                        if (a.cutOffTime) a.cutOffTime = a.cutOffTime.replace('15/08/2026', '09/09/2026');
                        if (a.flightCode) a.flightCode = a.flightCode.replace('260815', '260909');
                        if (a.flightNumber === 'VU130') a.etdIso = '2026-09-09T07:30:00.000Z';
                        if (a.flightNumber === 'VU224') a.etdIso = '2026-09-09T09:00:00.000Z';
                        if (a.flightNumber === 'VU340') a.etdIso = '2026-09-09T12:15:00.000Z';
                        updated = true;
                    } else if (a.etd && a.etd.includes('14/08/2026')) {
                        a.etd = a.etd.replace('14/08/2026', '08/09/2026');
                        if (a.eta) a.eta = a.eta.replace('14/08/2026', '08/09/2026');
                        if (a.cutOffTime) a.cutOffTime = a.cutOffTime.replace('14/08/2026', '08/09/2026');
                        if (a.flightCode) a.flightCode = a.flightCode.replace('260814', '260908');
                        if (a.flightNumber === 'VU132') a.etdIso = '2026-09-08T03:00:00.000Z';
                        updated = true;
                    }
                    // If open auction has expired endTime, refresh endTime to future so countdown is live
                    if (a.status === 'OPEN') {
                        const endMs = new Date(a.endTime).getTime();
                        if (isNaN(endMs) || endMs <= Date.now()) {
                            a.endTime = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
                            updated = true;
                        }
                    }
                });
            }

            // Check and auto-lock agents with overdue/expired won auction payments
            if (checkAndAutoLockExpiredWonAuctions(data)) {
                updated = true;
            }

            if (!raw || updated) {
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                } catch (e) {}
            }
            return data;
        } catch (e) {
            console.error('Error loading CargoStore data', e);
            return defaultData;
        }
    }

    let lastServerVersion = 0;
    let isSyncing = false;
    let saveServerTimeout = null;
    let lastLocalSaveTimestamp = 0;

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

        // Debounced push to server if running over HTTP/HTTPS or local dev server
        if (!skipServerSync && typeof window !== 'undefined') {
            lastLocalSaveTimestamp = Date.now();
            if (saveServerTimeout) clearTimeout(saveServerTimeout);

            saveServerTimeout = setTimeout(() => {
                const apiUrl = (window.location && window.location.protocol.startsWith('http'))
                    ? '/api/data'
                    : 'http://localhost:8085/api/data';

                fetch(apiUrl, {
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
                        settings: data.settings,
                        bankConfig: data.bankConfig,
                        routeSubscriptions: data.routeSubscriptions
                    })
                }).then(r => r.json()).then(res => {
                    if (res && res.version) {
                        lastServerVersion = res.version;
                    }
                }).catch(err => {
                    // Offline fallback
                });
            }, 300);
        }
    }

    async function syncWithServer() {
        if (isSyncing || typeof window === 'undefined') return;
        if (typeof document !== 'undefined' && document.hidden) return; // Save CPU when tab is in background
        // Prevent sync race condition if local save occurred in the last 2000ms
        if (Date.now() - lastLocalSaveTimestamp < 2000) return;

        try {
            isSyncing = true;
            const apiUrl = (window.location && window.location.protocol.startsWith('http'))
                ? '/api/data'
                : 'http://localhost:8085/api/data';

            const res = await fetch(apiUrl);
            if (!res.ok) return;
            const serverData = await res.json();
            if (serverData && serverData.version && serverData.version !== lastServerVersion) {
                lastServerVersion = serverData.version;
                const local = loadData();

                // Merge shared collections from server by ID to preserve local created items
                if (serverData.auctions && Array.isArray(serverData.auctions)) {
                    const auctionMap = new Map();
                    serverData.auctions.forEach(a => auctionMap.set(a.id, a));
                    (local.auctions || []).forEach(a => {
                        if (!auctionMap.has(a.id)) {
                            auctionMap.set(a.id, a);
                        }
                    });
                    local.auctions = Array.from(auctionMap.values()).sort((a, b) => (b.id || 0) - (a.id || 0));
                }

                local.bids = serverData.bids || local.bids;
                local.wonAuctions = serverData.wonAuctions || local.wonAuctions;
                local.notifications = serverData.notifications || local.notifications;
                local.registrations = serverData.registrations || local.registrations;
                local.agentsList = serverData.agentsList || local.agentsList;
                local.adminsList = serverData.adminsList || local.adminsList;
                if (serverData.settings) local.settings = serverData.settings;
                if (serverData.bankConfig) local.bankConfig = serverData.bankConfig;
                if (serverData.routeSubscriptions) local.routeSubscriptions = serverData.routeSubscriptions;

                // Save locally without re-sending to server
                saveData(local, true);
            }
        } catch (e) {
        } finally {
            isSyncing = false;
        }
    }

    // Auto-poll server every 3500ms to stay in sync across different browsers without lagging
    if (typeof window !== 'undefined') {
        setTimeout(syncWithServer, 200);
        setInterval(syncWithServer, 3500);
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
        // CRITICAL PROTECTION: If agent already reported bank transfer (PENDING_VERIFICATION),
        // order is protected from auto-cancellation & account lock while Admin reconciles!
        if (item.paymentStatus === 'PENDING_VERIFICATION') return false;
        if (item.paymentStatus === 'CANCELLED') return true;

        const now = Date.now();

        // 1. Check explicit paymentDeadline timestamp
        if (item.paymentDeadline) {
            const dlMs = new Date(item.paymentDeadline).getTime();
            if (!isNaN(dlMs) && now > dlMs) return true;
        }

        // 2. Check Cut-off time (3h before ETD) or ETD from auction
        const allAuctions = (passedData && passedData.auctions) ? passedData.auctions : ((typeof loadData === 'function') ? (loadData().auctions || []) : []);
        const auctionMatch = allAuctions.find(a => a.id == item.auctionId || a.flightNumber === item.flightNumber);
        const etdStr = item.etd || (auctionMatch ? auctionMatch.etd : null);
        
        let etdDate = null;
        if (item.etdIso) {
            etdDate = new Date(item.etdIso);
        } else if (etdStr) {
            etdDate = parseFlightDate(etdStr);
        }

        if (etdDate && !isNaN(etdDate.getTime())) {
            const cutoffDeadlineMs = etdDate.getTime() - 3 * 3600 * 1000;
            if (now >= cutoffDeadlineMs) return true;
        }

        return false;
    }

    function checkAndAutoLockExpiredWonAuctions(data) {
        if (!data) return false;
        let modified = false;
        const wonAuctions = data.wonAuctions || [];
        const agentsList = data.agentsList || [];
        if (!data.notifications) data.notifications = [];

        wonAuctions.forEach(item => {
            // NEVER lock or cancel if already paid or pending verification by Admin
            if (item.paymentStatus === 'PAID' || item.paymentStatus === 'PENDING_VERIFICATION') {
                return;
            }

            const isExpired = isWonAuctionExpired(item, data);
            const targetCode = (item.agentCode || '').toUpperCase();
            const agent = agentsList.find(a => (a.code || '').toUpperCase() === targetCode);

            if (isExpired && item.paymentStatus !== 'PAID' && item.paymentStatus !== 'PENDING_VERIFICATION') {
                if (item.paymentStatus !== 'EXPIRED' && item.paymentStatus !== 'CANCELLED') {
                    item.paymentStatus = 'EXPIRED';
                    modified = true;
                }

                // Check if this expired order penalty was already processed or if Admin explicitly unlocked the agent
                const orderExpiredTime = item.paymentDeadline ? new Date(item.paymentDeadline).getTime() : 0;
                const agentUnlockedTime = agent && agent.unlockedAt ? new Date(agent.unlockedAt).getTime() : 0;
                const isWaivedOrHandled = item.lockPenaltyHandled === true || item.lockWaivedByAdmin === true || (agentUnlockedTime > 0 && agentUnlockedTime >= orderExpiredTime);

                // Auto-lock agent account ONLY if not already locked AND penalty not yet handled/waived by Admin
                if (!isWaivedOrHandled && agent && agent.status !== 'Đã khóa' && agent.status !== 'LOCKED') {
                    agent.status = 'Đã khóa';
                    agent.lockedReason = `Hệ thống tự động khóa do quá hạn thanh toán đơn ${item.wonId} (${item.flightNumber} - ${item.route})`;
                    agent.lockedAt = new Date().toLocaleString('vi-VN');
                    item.lockPenaltyHandled = true; // Mark penalty as applied
                    modified = true;

                    // Push high-priority lock notification
                    const notifId = Date.now() + Math.floor(Math.random() * 1000);
                    data.notifications.unshift({
                        id: notifId,
                        targetAgentCode: item.agentCode,
                        title: `⚠️ TÀI KHOẢN ĐÃ BỊ KHÓA DO QUÁ HẠN THANH TOÁN`,
                        message: `Tài khoản đại lý ${item.agentCode} đã bị hệ thống tự động KHÓA do không hoàn tất thanh toán đơn hàng thắng thầu ${item.wonId} (Chuyến bay ${item.flightNumber}) trước hạn chót. Quyền tham gia đấu giá trên sàn đã bị tạm ngưng. Vui lòng liên hệ Ban Điều hành Cargo để xử lý.`,
                        time: 'Vừa xong',
                        type: 'ALERT',
                        read: false,
                        link: '07-WonAuction.html'
                    });

                    // Clear session if logged in
                    if (data.currentUser) {
                        const currentCode = (data.currentUser.agentCode || data.currentUser.code || '').toUpperCase();
                        if (currentCode === targetCode || data.currentUser.id == agent.id) {
                            data.currentUser = null;
                        }
                    }
                }
            } else if (!isExpired && item.paymentStatus !== 'PAID') {
                // If previously marked EXPIRED erroneously, restore to UNPAID
                if (item.paymentStatus === 'EXPIRED') {
                    item.paymentStatus = 'UNPAID';
                    modified = true;
                }

                // Ensure warning notification exists for this unpaid order
                const existingWarning = data.notifications.find(n => 
                    (n.targetAgentCode || '').toUpperCase() === targetCode && 
                    n.type === 'PAYMENT_REMINDER' && 
                    (n.message || '').includes(item.wonId)
                );
                if (!existingWarning) {
                    const payDl = item.paymentDeadline ? new Date(item.paymentDeadline).toLocaleString('vi-VN') : (item.cutOffTime || 'Hạn chót Cut-off');
                    data.notifications.unshift({
                        id: Date.now() + Math.floor(Math.random() * 1000),
                        targetAgentCode: item.agentCode,
                        title: `⏰ CẢNH BÁO THANH TOÁN: Đơn ${item.wonId} (${item.flightNumber})`,
                        message: `Quý đại lý vui lòng hoàn tất chuyển khoản cho đơn hàng ${item.wonId} trước ${payDl}. LƯU Ý: Nếu không thanh toán đúng hạn, hệ thống sẽ TỰ ĐỘNG KHÓA TÀI KHOẢN ĐẠI LÝ và hủy quyền đấu giá.`,
                        time: 'Vừa xong',
                        type: 'PAYMENT_REMINDER',
                        read: false,
                        link: '07-WonAuction.html'
                    });
                    modified = true;
                }
            }
        });

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

    function calculatePaymentDeadline(auction, nowDate = new Date()) {
        const nowMs = (nowDate instanceof Date) ? nowDate.getTime() : new Date(nowDate).getTime();
        const default24hMs = nowMs + 24 * 60 * 60 * 1000;

        if (!auction) return new Date(default24hMs).toISOString();

        let etdDate = null;
        if (auction.etdIso) {
            etdDate = new Date(auction.etdIso);
        } else if (auction.etd) {
            etdDate = parseFlightDate(auction.etd);
        }

        if (etdDate && !isNaN(etdDate.getTime())) {
            const cutOffMs = etdDate.getTime() - 3 * 3600 * 1000;
            // The effective payment deadline is Cut-off time (or 24h from close if earlier)
            const effectiveMs = Math.min(cutOffMs, default24hMs);
            return new Date(effectiveMs).toISOString();
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

            if (p1) { h = parseInt(p1[1], 10); mins = parseInt(p1[2], 10); d = parseInt(p1[3], 10); m = parseInt(p1[4], 10)-1; y = parseInt(p1[5], 10); }
            else if (p2) { d = parseInt(p2[1], 10); m = parseInt(p2[2], 10)-1; y = parseInt(p2[3], 10); h = parseInt(p2[4], 10); mins = parseInt(p2[5], 10); }
            else if (p3) { y = parseInt(p3[1], 10); m = parseInt(p3[2], 10)-1; d = parseInt(p3[3], 10); h = parseInt(p3[4], 10); mins = parseInt(p3[5], 10); }

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
        'PQC-DAD': 105
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

    function generateNextFlightNumber(origin, destination, skipCount = 0) {
        const data = loadData();
        const existingNumbers = new Set(
            (data.auctions || [])
                .map(a => (a.flightNumber || '').trim().toUpperCase())
                .filter(Boolean)
        );

        let baseNumber = 100;
        const key = `${String(origin || '').toUpperCase()}-${String(destination || '').toUpperCase()}`;
        if (key.includes('SGN') && key.includes('HAN')) baseNumber = 134;
        else if (key.includes('SGN') && key.includes('DAD')) baseNumber = 226;
        else if (key.includes('HAN') && key.includes('PQC')) baseNumber = 342;
        else if (key.includes('SGN') && key.includes('PQC')) baseNumber = 412;
        else if (key.includes('HAN') && key.includes('DAD')) baseNumber = 512;
        else baseNumber = 612;

        let candidateNum = baseNumber;
        let skipped = 0;
        while (existingNumbers.has(`VU${candidateNum}`) || skipped < skipCount) {
            if (existingNumbers.has(`VU${candidateNum}`)) {
                candidateNum += 2;
            } else {
                if (skipped < skipCount) {
                    skipped++;
                    candidateNum += 2;
                }
            }
        }

        return `VU${candidateNum}`;
    }

    return {
        getData: loadData,
        saveData: saveData,
        formatCurrency: formatCurrency,
        formatNumber: formatNumber,
        getTimeRemaining: getTimeRemaining,
        formatTimeAgo: formatTimeAgo,
        calculateCutOffTime: calculateCutOffTime,
        calculatePaymentDeadline: calculatePaymentDeadline,
        formatPaymentDeadlineText: formatPaymentDeadlineText,
        parseFlightDate: parseFlightDate,
        isWonAuctionExpired: isWonAuctionExpired,
        checkAndAutoLockExpiredWonAuctions: checkAndAutoLockExpiredWonAuctions,
        getFlightDurationMinutes: getFlightDurationMinutes,
        calculateETA: calculateETA,
        generateNextFlightNumber: generateNextFlightNumber,

        /**
         * Dynamic Agent Login checking each agent's SPECIFIC password
         */
        loginAgent: function(agentCodeOrEmail, password) {
            const data = loadData();
            const identifier = (agentCodeOrEmail || '').trim().toLowerCase();

            // Search agent in list by Agent Code, Tax Code, or Email
            let agent = (data.agentsList || seedAgents).find(a => 
                (a.code || '').toLowerCase() === identifier ||
                (a.taxCode || '').toLowerCase() === identifier ||
                (a.email || '').toLowerCase() === identifier
            );

            if (!agent) {
                // If newly approved agent code format AG-xxxx
                if (identifier.startsWith('ag-')) {
                    const code = identifier.toUpperCase();
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
                    return { success: false, message: `Mã đại lý hoặc Email "${agentCodeOrEmail}" không tồn tại trong CSDL.` };
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
        loginAdmin: function(usernameOrEmail, password) {
            const data = loadData();
            const u = (usernameOrEmail || '').trim().toLowerCase();
            const admin = (data.adminsList || seedAdmins).find(a => 
                (a.username || '').toLowerCase() === u ||
                (a.email || '').toLowerCase() === u
            );

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
                fullName: admin.fullName,
                email: admin.email,
                department: admin.department
            };

            saveData(data);
            return { success: true, admin: data.currentAdmin };
        },

        getCurrentUser: function() {
            const data = loadData();
            const user = data.currentUser;
            if (!user) return null;

            // Verify if current agent account status is locked in agentsList
            if (user.role === 'agent' || user.agentCode || user.code) {
                const targetCode = (user.agentCode || user.code || '').toUpperCase();
                const agent = (data.agentsList || []).find(a => 
                    (a.code || '').toUpperCase() === targetCode || a.id == user.id
                );
                if (agent && (agent.status === 'Đã khóa' || agent.status === 'LOCKED')) {
                    // Auto logout / clear session immediately
                    data.currentUser = null;
                    saveData(data);
                    return null;
                }
            }
            return user;
        },

        getCurrentAdmin: function() {
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
                const parsedEta = this.parseFlightDate(auctionData.eta);
                if (parsedEta && parsedEta.getTime() <= parsedEtd.getTime()) {
                    return {
                        success: false,
                        message: 'Thời gian hạ cánh dự kiến (ETA) phải sau thời gian cất cánh dự kiến (ETD).'
                    };
                }
            }

            const newId = (data.auctions || []).reduce((max, a) => Math.max(max, Number(a.id) || 0), 0) + 1;
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

            const capacityKg = Number(auctionData.capacityKg) || 3000;
            if (isNaN(capacityKg) || capacityKg < 100 || capacityKg > 50000) {
                return {
                    success: false,
                    message: `Tải trọng chào thầu (${capacityKg ? capacityKg.toLocaleString('vi-VN') : 0} Kg) không hợp lệ! Tải trọng một chuyến bay vận tải hàng không cho phép từ 100 Kg đến tối đa 50.000 Kg (50 tấn).`
                };
            }

            const startingPriceKg = Number(auctionData.startingPriceKg) || 18000;
            const minStep = Number(auctionData.minStep) || 500;

            const formattedEtd = this.formatFlightDateDisplay(parsedEtd);
            const formattedEta = auctionData.eta ? this.formatFlightDateDisplay(auctionData.eta) : 'Chưa cập nhật';

            // Calculate End Time (Thời gian đóng thầu): e.g. 5 hours before ETD so agent has time to pay & declare before warehouse Cut-off (ETD - 3h)
            let endTimeDate;
            if (parsedEtd && !isNaN(parsedEtd.getTime())) {
                const etdCloseTime = new Date(parsedEtd.getTime() - closeOffsetHours * 60 * 60 * 1000);
                if (etdCloseTime.getTime() > now.getTime()) {
                    endTimeDate = etdCloseTime;
                } else {
                    endTimeDate = new Date(now.getTime() + 30 * 60 * 1000);
                }
            } else {
                endTimeDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            }
            const endTime = endTimeDate.toISOString();

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

            // Broadcast notification for all agents
            if (!data.notifications) data.notifications = [];
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
                            message: `Chuyến bay ${flightNumber} tuyến ${originName} ➔ ${destName} mà Quý đại lý đang theo dõi vừa mở đấu giá tải trọng ${this.formatNumber(capacityKg)} Kg (Giá khởi điểm: ${this.formatCurrency(startingPriceKg)}/Kg). Đặt giá ngay để không bỏ lỡ slot!`,
                            time: 'Vừa xong',
                            type: 'AUCTION_OPEN',
                            read: false,
                            link: `04-Detail.html?id=${newId}`
                        });

                        // 2. Dispatch automated Email notification if agent enabled emailAlert
                        if (sub.emailAlert !== false) {
                            const agentAcc = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === agentCode.toUpperCase());
                            const defaultTargetEmail = (data.currentUser && data.currentUser.email) ? data.currentUser.email : 'jome7093@gmail.com';
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

            saveData(data);

            return {
                success: true,
                message: `Tạo phiên đấu giá chuyến ${flightNumber} (${origin} - ${dest}) thành công! Phiên đã mở trực tiếp trên sàn.`,
                auction: newAuction,
                ...newAuction
            };
        },

        getFlightDurationMinutes: function(origin, dest) {
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

        generateNextFlightNumber: function(origin, dest, skipCount = 0) {
            const data = loadData();
            const existingFlightNumbers = new Set(
                (data.auctions || []).map(a => (a.flightNumber || '').trim().toUpperCase())
            );

            const pair = `${(origin || '').trim().toUpperCase()}-${(dest || '').trim().toUpperCase()}`;
            const routeBases = {
                'SGN-HAN': [130, 132, 134, 136, 138, 140, 142, 144, 146, 148],
                'HAN-SGN': [131, 133, 135, 137, 139, 141, 143, 145, 147, 149],
                'SGN-DAD': [220, 222, 224, 226, 228, 230, 232, 234],
                'DAD-SGN': [221, 223, 225, 227, 229, 231, 233, 235],
                'HAN-DAD': [240, 242, 244, 246, 248, 250],
                'DAD-HAN': [241, 243, 245, 247, 249, 251],
                'HAN-PQC': [340, 342, 344, 346, 348, 350],
                'PQC-HAN': [341, 343, 345, 347, 349, 351],
                'SGN-PQC': [450, 452, 454, 456, 458],
                'PQC-SGN': [451, 453, 455, 457, 459]
            };

            const candidates = routeBases[pair] || [510, 512, 514, 516, 518, 520];
            const available = candidates.filter(num => !existingFlightNumbers.has(`VU${num}`));

            if (available.length > 0) {
                const idx = (Math.max(0, skipCount)) % available.length;
                return `VU${available[idx]}`;
            }

            // Fallback if all standard candidates exist
            const baseNum = candidates[0] || 500;
            const nextNum = baseNum + (Math.max(0, skipCount) + 1) * 2;
            return `VU${nextNum}`;
        },

        getAuctions: function() {
            const data = loadData();
            const auctions = data.auctions || [];
            const bids = data.bids || [];
            auctions.forEach(a => {
                const count = bids.filter(b => b.auctionId == a.id).length;
                if (count > 0) {
                    a.bidsCount = count;
                }
            });
            return auctions;
        },

        getAuctionById: function(id) {
            const auctions = this.getAuctions();
            return auctions.find(a => a.id == id);
        },

        getBidsForAuction: function(auctionId) {
            const data = loadData();
            const auction = (data.auctions || []).find(a => a.id == auctionId);
            let bids = (data.bids || []).filter(b => b.auctionId == auctionId);

            if (auction && (auction.bidsCount > 0) && bids.length === 0) {
                const sampleAgents = [
                    { code: 'AG-1024', name: 'Công ty CP Giao nhận Kho vận Vinatrans' },
                    { code: 'AG-0892', name: 'Công ty TNHH Vận tải ABC Logistics' },
                    { code: 'AG-0556', name: 'Công ty TNHH Tiếp vận Toàn Cầu Golden Star' },
                    { code: 'AG-0341', name: 'Công ty TNHH SkyFreight Logistics Việt Nam' },
                    { code: 'AG-0789', name: 'Công ty CP Vận chuyển Hàng không Việt Freight' }
                ];
                const count = auction.bidsCount || 2;
                const startPrice = auction.startingPriceKg || 18000;
                let endPrice = auction.currentPriceKg || (startPrice + count * (auction.minStep || 500));
                if (endPrice > startPrice * 10) {
                    endPrice = startPrice + count * (auction.minStep || 500) * 3;
                }
                const step = (endPrice - startPrice) / Math.max(1, count - 1);
                const now = Date.now();

                bids = [];
                for (let i = 0; i < count; i++) {
                    const isLast = (i === count - 1);
                    const price = isLast ? endPrice : Math.round((startPrice + step * i) / 100) * 100;
                    const ag = sampleAgents[i % sampleAgents.length];
                    bids.push({
                        id: now - (count - i) * 20 * 60 * 1000,
                        timestamp: now - (count - i) * 20 * 60 * 1000,
                        auctionId: Number(auctionId),
                        agentCode: ag.code,
                        agentName: ag.name,
                        isAnonymous: true,
                        priceKg: Number(price),
                        time: `${(count - i) * 20} phút trước`,
                        status: isLast ? (auction.status === 'CLOSED' ? 'WON' : 'HIGHEST') : 'OUTBID',
                        weightKg: auction.capacityKg
                    });
                }
                if (!data.bids) data.bids = [];
                data.bids.push(...bids);
                saveData(data);
            }

            return bids.sort((a, b) => b.priceKg - a.priceKg);
        },

        getPublicAgentName: function(agentCode, agentName, isAnonymous = true, viewerContext = null) {
            const data = loadData();
            const currentUser = viewerContext || data.currentUser;
            const pathname = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '';
            const isAdminPage = pathname.includes('/Admin/') || pathname.includes('/admin/');
            const anon = isAnonymous !== false;

            // 1. Admin or Staff viewing on Admin Portal -> Full visibility + tag if anonymous
            if (isAdminPage && data.currentAdmin) {
                if (anon) {
                    return `${agentName || 'Đại lý'} (${agentCode || '-'}) [ẨN DANH]`;
                }
                return `${agentName || 'Đại lý'} (${agentCode || '-'})`;
            }

            // 2. The bidding agent themselves viewing -> Real name with (Bạn)
            if (currentUser && (currentUser.agentCode === agentCode || currentUser.code === agentCode)) {
                return `${agentName || currentUser.companyName} (Bạn)`;
            }

            // 3. Competitor agent viewing an anonymous bid -> Mask identity completely!
            if (anon) {
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

            const hasBids = (auction.bidsCount && auction.bidsCount > 0);
            const minAcceptable = hasBids
                ? (auction.currentPriceKg + auction.minStep)
                : (auction.startingPriceKg || auction.currentPriceKg);

            if (bidPriceKg < minAcceptable) {
                return {
                    success: false,
                    message: hasBids
                        ? `Giá đặt phải tối thiểu bằng ${formatCurrency(minAcceptable)}/Kg (Giá hiện tại + bước giá tối thiểu ${formatCurrency(auction.minStep)})`
                        : `Lượt đặt giá đầu tiên phải tối thiểu bằng giá khởi điểm ${formatCurrency(minAcceptable)}/Kg`
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
            if (!data.currentUser) {
                return (data.wonAuctions || []).filter(w => !w.agentCode || String(w.agentCode).trim().toUpperCase() === 'AG-0892');
            }
            if (data.currentUser.role === 'ADMIN' || data.currentUser.role === 'STAFF') {
                return data.wonAuctions || [];
            }
            const code = String(data.currentUser.agentCode || data.currentUser.code || '').trim().toUpperCase();
            if (!code) return [];
            return (data.wonAuctions || []).filter(w => String(w.agentCode || '').trim().toUpperCase() === code);
        },

        isCargoDeclared: function(item) {
            if (!item || !item.cargoDeclaration) return false;
            const decl = item.cargoDeclaration;
            return !!((decl.cargoName && String(decl.cargoName).trim() !== '') || (decl.hawbNumber && String(decl.hawbNumber).trim() !== ''));
        },

        isCargoUndeclared: function(item) {
            return !this.isCargoDeclared(item);
        },

        getNotifications: function() {
            const data = loadData();
            const user = data.currentUser;
            const currentAdmin = data.currentAdmin;
            const pathname = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '';
            const isAdminPage = pathname.includes('/Admin/') || pathname.includes('/admin/') || !!currentAdmin;

            let allNotifs = data.notifications || [];
            allNotifs = allNotifs.map(n => {
                if (n && n.message && n.message.includes('Mật khẩu đăng nhập:')) {
                    const cleanedMessage = n.message.replace(/Mật khẩu đăng nhập:.*?(?=Quý công ty|$)/, 'Quý công ty vui lòng sử dụng Mã Đại lý cùng Mật khẩu và Mã PIN đã đăng ký để đăng nhập vào Sàn Đấu giá Cargo. ');
                    return { 
                        ...n, 
                        title: (n.title || '').replace('[EMAIL THÔNG BÁO] ', ''),
                        message: cleanedMessage.replace(/\s+/g, ' ').trim() 
                    };
                }
                return n;
            });

            // 1. Admin / Staff viewing on Admin Portal
            if (isAdminPage && currentAdmin) {
                return allNotifs.filter(n => !n.targetAgentCode || n.targetRole === 'ADMIN' || n.targetRole === 'admin');
            }

            // 2. Logged-in Agent viewing on Agent Portal
            if (!user) {
                return allNotifs.filter(n => (n.type === 'SYSTEM' || n.type === 'ANNOUNCEMENT' || n.isBroadcast === true) && n.targetRole !== 'ADMIN');
            }

            const myCode = (user.agentCode || user.code || '').trim().toUpperCase();

            return allNotifs.filter(n => {
                // Admin reconciliation notifications must NEVER leak to agents
                if (n.targetRole === 'ADMIN' || n.targetRole === 'admin') return false;
                if ((n.title || '').includes('ĐẠI LÝ BÁO CHUYỂN KHOẢN') || (n.message || '').includes('đối soát sao kê ngân hàng')) {
                    return false;
                }
                // If targeted to a specific agent, match exact agent code
                if (n.targetAgentCode) {
                    return n.targetAgentCode.trim().toUpperCase() === myCode;
                }
                // Only allow public system broadcasts if targetAgentCode is null/empty
                return n.type === 'SYSTEM' || n.type === 'ANNOUNCEMENT' || n.type === 'AUCTION_OPEN' || n.isBroadcast === true;
            });
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

            const pinClean = (regData.pin || '').trim();
            if (!pinClean || !pinRegex.test(pinClean)) {
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

            const now = new Date();
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
            saveData(data);

            // Dispatch automated email via Nodemailer
            CargoStore.sendEmailNotification({
                type: 'REGISTRATION_SUBMITTED',
                to: newReg.email,
                notifEmail: newReg.notifEmail,
                regData: newReg
            });

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
                title: `Phê duyệt Hồ sơ & Cấp Mã Đại lý ${newCode}`,
                message: `Kính gửi ${reg.repName} (${reg.companyName}), Ban Điều hành Hãng hàng không xin thông báo: Hồ sơ đăng ký của Quý doanh nghiệp đã được PHÊ DUYỆT thành công! Mã Đại lý chính thức của Quý công ty là: ${newCode}. Quý công ty vui lòng sử dụng Mã Đại lý cùng Mật khẩu và Mã PIN đã đăng ký để đăng nhập vào Sàn Đấu giá Cargo.`,
                time: formatTimeAgo(now),
                type: 'SYSTEM',
                read: false,
                link: '01-Login.html'
            });

            saveData(data);

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

        verifyPinAndGetPassword: function(agentCodeOrEmail, pinInput) {
            const data = loadData();
            const identifier = (agentCodeOrEmail || '').trim().toLowerCase();
            const agent = (data.agentsList || []).find(a => 
                (a.code || '').toLowerCase() === identifier ||
                (a.taxCode || '').toLowerCase() === identifier ||
                (a.email || '').toLowerCase() === identifier
            );

            if (!agent) {
                return { success: false, message: `Mã đại lý hoặc Email "${agentCodeOrEmail}" không tồn tại trong CSDL.` };
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

            // Dispatch automated email via Nodemailer
            CargoStore.sendEmailNotification({
                type: 'REGISTRATION_REJECTED',
                to: reg.email,
                notifEmail: reg.notifEmail,
                regData: reg
            });

            return true;
        },

        sendEmailNotification: async function(payload) {
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

        closeAuction: function(id) {
            const data = loadData();
            if (data.currentAdmin && data.currentAdmin.role === 'STAFF') {
                return { success: false, message: 'Nhân viên (STAFF) không có quyền chốt thầu sớm. Thao tác này chỉ dành cho Quản trị viên (ADMIN).' };
            }
            
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
                let newWonItem = data.wonAuctions.find(w => w.auctionId == auction.id);
                if (newWonItem) {
                    newWonItem.agentCode = highestBid.agentCode;
                    newWonItem.agentName = highestBid.agentName;
                    newWonItem.flightNumber = auction.flightNumber;
                    newWonItem.route = auction.route;
                    newWonItem.capacityKg = auction.capacityKg;
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
                const defaultTargetEmail = (data.currentUser && data.currentUser.email) ? data.currentUser.email : 'jome7093@gmail.com';
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
                data.notifications.unshift({
                    id: Date.now(),
                    targetAgentCode: highestBid.agentCode,
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

        confirmPayment: function(wonId) {
            const data = loadData();
            if (!data.wonAuctions) data.wonAuctions = [];
            const item = data.wonAuctions.find(w => w.wonId === wonId);
            if (!item) {
                return { success: false, message: `Không tìm thấy đơn thắng thầu "${wonId}".` };
            }

            if (this.isWonAuctionExpired(item)) {
                return { success: false, message: `Đơn hàng "${wonId}" đã quá hạn thanh toán / Cut-off và đã bị hủy bởi hệ thống.` };
            }

            item.paymentStatus = 'PAID';
            item.paidAt = new Date().toLocaleString('vi-VN');

            // Find agent email to dispatch PAYMENT_CONFIRMED email
            const defaultTargetEmail = (data.currentUser && data.currentUser.email) ? data.currentUser.email : 'jome7093@gmail.com';
            const agentAccount = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === (item.agentCode || '').toUpperCase());
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
            return { success: true, message: `Đã xác nhận nhận thanh toán thành công cho đơn ${wonId}! Email thông báo đã tự động gửi đến đại lý.`, item: item };
        },

        notifyPaymentSent: function(wonId, paymentDetails = {}) {
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

            // 3. Trigger background email dispatch to Admin/Finance
            try {
                const adminEmail = (data.systemConfig && data.systemConfig.supportEmail) || (data.emailConfig && data.emailConfig.auth && data.emailConfig.auth.user) || 'cargo-agent@airline.vn';
                const payingAgent = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === (item.agentCode || '').toUpperCase());
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

        updateCargoDeclaration: function(wonId, cargoData) {
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
                updatedAt: new Date().toLocaleString('vi-VN')
            };

            saveData(data);
            return {
                success: true,
                message: `Đã cập nhật thông tin hàng hóa vận chuyển cho đơn ${wonId} thành công!`,
                cargoDeclaration: item.cargoDeclaration
            };
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

            // Only allow editing if no agent has placed a bid yet
            const hasBids = (auction.bidsCount && auction.bidsCount > 0) ||
                            (data.bids || []).some(b => b.auctionId == id);
            if (hasBids) {
                return {
                    success: false,
                    message: `Không thể chỉnh sửa chuyến bay ${auction.flightNumber} (${auction.route}) vì đã có đại lý đặt giá (${auction.bidsCount || 0} lượt đấu giá). Chỉ được sửa thông số khi chưa có đại lý nào tham gia đấu giá.`
                };
            }

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

            const auction = data.auctions[idx];
            const hasBids = (auction.bidsCount && auction.bidsCount > 0) ||
                            (data.bids || []).some(b => b.auctionId == id);
            if (hasBids) {
                return {
                    success: false,
                    message: `Không thể xóa chuyến bay ${auction.flightNumber} vì đã có đại lý đặt giá. Chỉ được xóa chuyến bay khi chưa có người tham gia.`
                };
            }

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
                    if (isCurrentlyActive) {
                        target.status = 'Đã khóa';
                        target.lockedReason = 'Quản trị viên chủ động khóa tài khoản';
                        target.lockedAt = new Date().toLocaleString('vi-VN');
                        // If locking and target is currently logged in, clear currentUser session immediately!
                        if (data.currentUser) {
                            const currentCode = (data.currentUser.agentCode || data.currentUser.code || '').toUpperCase();
                            if (currentCode === (target.code || '').toUpperCase() || data.currentUser.id == target.id) {
                                data.currentUser = null;
                            }
                        }
                    } else {
                        target.status = 'Đang hoạt động';
                        target.unlockedAt = new Date().toISOString();
                        target.unlockedBy = data.currentAdmin ? (data.currentAdmin.username || 'ADMIN') : 'ADMIN';
                        delete target.lockedReason;
                        delete target.lockedAt;

                        // Waive old expired auction penalties so system doesn't immediately re-lock
                        (data.wonAuctions || []).forEach(w => {
                            if ((w.agentCode || '').toUpperCase() === (target.code || '').toUpperCase()) {
                                w.lockPenaltyHandled = true;
                                w.lockWaivedByAdmin = true;
                            }
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
                        target.lockedReason = 'Quản trị viên chủ động khóa tài khoản';
                        target.lockedAt = new Date().toLocaleString('vi-VN');
                        // If locking and target staff is currently logged in, clear currentAdmin session immediately!
                        if (data.currentAdmin) {
                            const currentUsername = (data.currentAdmin.username || '').toLowerCase();
                            if (currentUsername === (target.username || '').toLowerCase() || data.currentAdmin.id == target.id) {
                                data.currentAdmin = null;
                            }
                        }
                    } else {
                        target.status = 'Đang hoạt động';
                        target.unlockedAt = new Date().toISOString();
                        delete target.lockedReason;
                        delete target.lockedAt;
                    }

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
            if (settingsData.hideAgentCredentials !== undefined) {
                data.settings.hideAgentCredentials = Boolean(settingsData.hideAgentCredentials);
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
            return { success: true, message: 'Đã lưu cấu hình hệ thống thành công!', settings: data.settings };
        },

        getSystemSettings: function() {
            return loadData().settings || defaultData.settings;
        },

        logoutAgent: function() {
            if (typeof window !== 'undefined') window._isManualLogout = true;
            const data = loadData();
            data.currentUser = null;
            saveData(data);
        },

        logoutAdmin: function() {
            if (typeof window !== 'undefined') window._isManualLogout = true;
            const data = loadData();
            data.currentAdmin = null;
            saveData(data);
        },

        syncHeaderUI: function() {
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

        syncAdminHeaderUI: function() {
            const pathname = (typeof window !== 'undefined' && window.location.pathname) ? window.location.pathname.toLowerCase() : '';
            const isAdminPage = pathname.includes('/admin/') || pathname.includes('\\admin\\');
            if (!isAdminPage) return;

            const admin = this.getCurrentAdmin();
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

            // Hide AgentList nav links for STAFF across headers & dashboard
            if (isStaff) {
                document.querySelectorAll('a[href*="06-AgentList.html"]').forEach(el => {
                    el.style.display = 'none';
                });
            }

            // Block access on 06-AgentList.html for STAFF
            if (isStaff && typeof window !== 'undefined' && window.location.pathname.includes('06-AgentList.html')) {
                const main = document.querySelector('main');
                if (main) {
                    main.innerHTML = `
                        <div class="max-w-xl mx-auto my-12 bg-white rounded-3xl p-8 border shadow-xl text-center space-y-4">
                            <div class="w-16 h-16 bg-red-100 text-red-600 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-sm">
                                <i class="fa-solid fa-ban"></i>
                            </div>
                            <h2 class="text-xl font-bold text-slate-900">Truy cập bị từ chối (Access Denied)</h2>
                            <p class="text-xs text-slate-600 leading-relaxed">
                                Tài khoản <strong>Nhân viên Điều hành (STAFF)</strong> không có quyền sử dụng trang Quản lý Đại lý & Phê duyệt hồ sơ. Thao tác này thuộc thẩm quyền của <strong>Quản trị viên (ADMIN)</strong>.
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

        setAdminNotifFilter: function(filter) {
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

        getAdminNotifications: function() {
            const data = loadData();
            const notifs = data.notifications || [];
            return notifs.filter(n => {
                if (n.targetRole === 'ADMIN') return true;
                if (!n.targetAgentCode) return true;
                if (n.type === 'PAYMENT' && (n.title || '').includes('ĐẠI LÝ BÁO CHUYỂN KHOẢN')) return true;
                return false;
            });
        },

        markAllAdminNotificationsAsRead: function() {
            const data = loadData();
            if (data.notifications) {
                data.notifications.forEach(n => {
                    if (n.targetRole === 'ADMIN' || !n.targetAgentCode || (n.title || '').includes('ĐẠI LÝ BÁO CHUYỂN KHOẢN')) {
                        n.read = true;
                    }
                });
                saveData(data);
            }
            this.renderAdminNotificationList();
        },

        markAdminNotificationAsRead: function(id) {
            const data = loadData();
            if (data.notifications) {
                const item = data.notifications.find(n => n.id == id);
                if (item) {
                    item.read = true;
                    saveData(data);
                }
            }
            this.renderAdminNotificationList();
        },

        initAdminNotificationCenter: function() {
            if (typeof document === 'undefined') return;
            const admin = this.getCurrentAdmin();
            if (!admin) return;

            // Find the right-side user profile container in the header
            const userAnchor = document.querySelector('header a[href*="01-AdminLogin"], header a[onclick*="logoutAdmin"], header .admin-header-name, header .admin-header-role');
            if (!userAnchor) return;

            const targetContainer = userAnchor.closest('.flex.items-center') || userAnchor.parentElement;
            if (!targetContainer) return;

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
                    <div id="adminNotifDropdown" class="hidden absolute right-0 top-full mt-2 w-80 sm:w-[380px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 text-slate-800 z-[9999] overflow-hidden">
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
                            <button type="button" onclick="CargoStore.markAllAdminNotificationsAsRead()" class="text-[11px] text-blue-400 hover:text-blue-300 font-medium hover:underline cursor-pointer">
                                <i class="fa-solid fa-check-double"></i> Đã đọc tất cả
                            </button>
                        </div>

                        <!-- Filter Tabs in Notification Center -->
                        <div class="flex items-center gap-1 p-2 bg-slate-50 border-b border-slate-100 text-[11px] font-semibold">
                            <button type="button" onclick="CargoStore.setAdminNotifFilter('ALL')" id="adminNotifTabAll" class="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold transition">Tất cả</button>
                            <button type="button" onclick="CargoStore.setAdminNotifFilter('PAYMENT')" id="adminNotifTabPayment" class="px-2.5 py-1 rounded-lg text-slate-600 hover:bg-slate-200 transition flex items-center gap-1">
                                💳 Chờ duyệt CK <span id="adminNotifPayCount" class="hidden bg-amber-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold">0</span>
                            </button>
                            <button type="button" onclick="CargoStore.setAdminNotifFilter('ALERT')" id="adminNotifTabAlert" class="px-2.5 py-1 rounded-lg text-slate-600 hover:bg-slate-200 transition">Cảnh báo</button>
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

                const roleEl = targetContainer.querySelector('.admin-header-role') || userAnchor;
                targetContainer.insertBefore(bellWrapper, roleEl);

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
            }

            this.renderAdminNotificationList();
        },

        renderAdminNotificationList: function() {
            if (typeof document === 'undefined') return;
            const notifListEl = document.getElementById('adminNotifList');
            const badgeEl = document.getElementById('adminNotifBadge');
            const summaryEl = document.getElementById('adminNotifSummaryText');
            const payCountEl = document.getElementById('adminNotifPayCount');

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
                const isUnread = !n.read;
                const isPayment = n.type === 'PAYMENT' || (n.title || '').includes('ĐẠI LÝ BÁO CHUYỂN KHOẢN');
                const isAlert = n.type === 'ALERT' || (n.title || '').includes('KHÓA');
                
                let iconClass = 'fa-info-circle text-blue-600 bg-blue-50';
                let cardBg = isUnread ? 'bg-blue-50/40 font-semibold' : 'bg-white';
                
                if (isPayment) {
                    iconClass = 'fa-credit-card text-emerald-600 bg-emerald-50';
                    if (isUnread) cardBg = 'bg-emerald-50/50 border-l-4 border-emerald-500';
                } else if (isAlert) {
                    iconClass = 'fa-triangle-exclamation text-rose-600 bg-rose-50';
                    if (isUnread) cardBg = 'bg-rose-50/40 border-l-4 border-rose-500';
                }

                // Resolve link for admin
                let actionBtn = '';
                if (isPayment && n.wonId) {
                    actionBtn = `
                        <a href="03-AuctionList.html?tab=won&search=${n.wonId}&reconcile=${n.wonId}" onclick="CargoStore.markAdminNotificationAsRead(${n.id})" class="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[10px] font-bold shadow-xs transition">
                            <i class="fa-solid fa-magnifying-glass-dollar"></i> Đối soát ngay
                        </a>
                    `;
                } else if ((n.title || '').includes('ĐĂNG KÝ') || (n.link || '').includes('06-AgentList.html')) {
                    actionBtn = `
                        <a href="06-AgentList.html" onclick="CargoStore.markAdminNotificationAsRead(${n.id})" class="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-[10px] font-bold shadow-xs transition">
                            <i class="fa-solid fa-user-check"></i> Duyệt hồ sơ
                        </a>
                    `;
                }

                return `
                    <div class="p-3 hover:bg-slate-50 transition rounded-xl flex items-start gap-2.5 ${cardBg}" onclick="CargoStore.markAdminNotificationAsRead(${n.id})">
                        <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm ${iconClass}">
                            <i class="fa-solid ${isPayment ? 'fa-credit-card' : (isAlert ? 'fa-triangle-exclamation' : 'fa-bell')}"></i>
                        </div>
                        <div class="flex-1 min-w-0 space-y-1">
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
                    </div>
                `;
            }).join('');
        },

        getBankConfig: function() {
            const data = loadData();
            if (!data.bankConfig) {
                data.bankConfig = JSON.parse(JSON.stringify(defaultData.bankConfig));
                saveData(data);
            }
            return data.bankConfig;
        },

        updateBankConfig: function(cfg) {
            const data = loadData();
            data.bankConfig = {
                ...(data.bankConfig || defaultData.bankConfig),
                ...cfg
            };
            saveData(data);
            return {
                success: true,
                message: 'Đã cập nhật thông tin tài khoản ngân hàng thụ hưởng thành công!',
                bankConfig: data.bankConfig
            };
        },

        generatePaymentMemo: function(wonId, agentCode) {
            const cfg = this.getBankConfig();
            const prefix = (cfg.memoPrefix || 'CARGO').trim().toUpperCase();
            const wId = (wonId || '').trim();
            const aCode = (agentCode || '').trim().toUpperCase();
            return `${prefix} ${wId} ${aCode}`.trim();
        },

        generateVietQRUrl: function(amount, memo) {
            const cfg = this.getBankConfig();
            const bin = cfg.bankBin || '970436';
            const acc = cfg.accountNumber || '1029384756';
            const amt = Math.round(Number(amount) || 0);
            const desc = encodeURIComponent(memo || '');
            const accName = encodeURIComponent(cfg.accountName || 'CONG TY CP HANG KHONG VIETRAVEL');
            return `https://img.vietqr.io/image/${bin}-${acc}-compact2.png?amount=${amt}&addInfo=${desc}&accountName=${accName}`;
        },

        getAvailableRoutes: function() {
            return [
                { pair: 'HAN-SGN', name: 'Hà Nội (HAN) ➔ TP.HCM (SGN)', origin: 'HAN', dest: 'SGN' },
                { pair: 'SGN-HAN', name: 'TP.HCM (SGN) ➔ Hà Nội (HAN)', origin: 'SGN', dest: 'HAN' },
                { pair: 'SGN-DAD', name: 'TP.HCM (SGN) ➔ Đà Nẵng (DAD)', origin: 'SGN', dest: 'DAD' },
                { pair: 'DAD-SGN', name: 'Đà Nẵng (DAD) ➔ TP.HCM (SGN)', origin: 'DAD', dest: 'SGN' },
                { pair: 'HAN-DAD', name: 'Hà Nội (HAN) ➔ Đà Nẵng (DAD)', origin: 'HAN', dest: 'DAD' },
                { pair: 'DAD-HAN', name: 'Đà Nẵng (DAD) ➔ Hà Nội (HAN)', origin: 'DAD', dest: 'HAN' },
                { pair: 'HAN-PQC', name: 'Hà Nội (HAN) ➔ Phú Quốc (PQC)', origin: 'HAN', dest: 'PQC' },
                { pair: 'PQC-HAN', name: 'Phú Quốc (PQC) ➔ Hà Nội (HAN)', origin: 'PQC', dest: 'HAN' },
                { pair: 'SGN-PQC', name: 'TP.HCM (SGN) ➔ Phú Quốc (PQC)', origin: 'SGN', dest: 'PQC' },
                { pair: 'PQC-SGN', name: 'Phú Quốc (PQC) ➔ TP.HCM (SGN)', origin: 'PQC', dest: 'SGN' },
                { pair: 'SGN-CXR', name: 'TP.HCM (SGN) ➔ Cam Ranh (CXR)', origin: 'SGN', dest: 'CXR' },
                { pair: 'CXR-SGN', name: 'Cam Ranh (CXR) ➔ TP.HCM (SGN)', origin: 'CXR', dest: 'SGN' }
            ];
        },

        getRouteSubscriptions: function(agentCode) {
            const data = loadData();
            if (!data.routeSubscriptions) data.routeSubscriptions = {};
            const code = (agentCode || (data.currentUser ? data.currentUser.agentCode : 'AG-0892') || 'AG-0892').trim().toUpperCase();
            if (!data.routeSubscriptions[code]) {
                data.routeSubscriptions[code] = {
                    routes: ['HAN-SGN', 'SGN-HAN'],
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

        saveRouteSubscriptions: function(agentCode, settings) {
            const data = loadData();
            if (!data.routeSubscriptions) data.routeSubscriptions = {};
            const code = (agentCode || (data.currentUser ? data.currentUser.agentCode : 'AG-0892') || 'AG-0892').trim().toUpperCase();
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

        toggleRouteSubscription: function(agentCode, routePair) {
            const data = loadData();
            const code = (agentCode || (data.currentUser ? data.currentUser.agentCode : 'AG-0892') || 'AG-0892').trim().toUpperCase();
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

        isRouteSubscribed: function(agentCode, routePair) {
            const subs = this.getRouteSubscriptions(agentCode);
            const pair = (routePair || '').trim().toUpperCase().replace(/\s+/g, '');
            const routes = (subs.routes || []).map(r => String(r).replace(/\s+/g, '').toUpperCase());
            return routes.includes(pair);
        },

        getCurrentTime: function() {
            return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
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
            pathname.includes('10-terms')
        );

        if (isPublicOrLoginPage) return;

        const isAdminPage = pathname.includes('/admin/') || pathname.includes('\\admin\\');

        if (isAdminPage) {
            // Guard protected Admin pages (02-AdminDashboard, 03-AuctionList, 04-CreateAuction, 05-AuctionDetail, 06-AgentList, 07-Reports, 08-Settings)
            if (pathname.includes('01-adminlogin')) return;
            const admin = CargoStore.getCurrentAdmin();
            if (!admin) {
                isRedirecting = true;
                window.location.href = '01-AdminLogin.html';
                return;
            }
        } else {
            // Guard protected Agent pages (02-Dashboard, 03-Index, 04-Detail, 05-Watchlist, 06-MyBids, 07-WonAuction, 08-Notifications, 09-Profile)
            const isAgentProtectedPage = (
                pathname.includes('02-dashboard') ||
                pathname.includes('03-index') ||
                pathname.includes('04-detail') ||
                pathname.includes('05-watchlist') ||
                pathname.includes('06-mybids') ||
                pathname.includes('07-wonauction') ||
                pathname.includes('08-notifications') ||
                pathname.includes('09-profile')
            );

            if (isAgentProtectedPage) {
                const user = CargoStore.getCurrentUser();
                if (!user) {
                    isRedirecting = true;
                    window.location.href = '01-Login.html';
                    return;
                }
            }
        }
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', function() {
            if (typeof CargoStore !== 'undefined') {
                if (CargoStore.syncHeaderUI) CargoStore.syncHeaderUI();
                if (CargoStore.syncAdminHeaderUI) CargoStore.syncAdminHeaderUI();
            }
            checkAccountLockGuard();
        });
    }

    // Periodically check every 5s on protected pages
    setInterval(checkAccountLockGuard, 5000);
    window.addEventListener('storage', checkAccountLockGuard);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CargoStore;
}
