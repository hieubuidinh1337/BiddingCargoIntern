/* ==========================================================================
   Vietravel Airlines - Data Store & Local Storage Management
   ========================================================================== */

const STORAGE_KEYS = {
    CURRENT_USER: 'VU_BIDDING_CURRENT_USER',
    CURRENT_ROLE: 'VU_BIDDING_CURRENT_ROLE',
    USERS: 'VU_BIDDING_USERS',
    FLIGHTS: 'VU_BIDDING_FLIGHTS',
    BIDS: 'VU_BIDDING_BIDS',
    REGISTRATIONS: 'VU_BIDDING_REGISTRATIONS'
};

// Initial Mock Users - Each account has its OWN distinct password
const INITIAL_USERS = [
    {
        id: 'USR-001',
        name: 'Quản Trị Viên VU',
        email: 'admin@vietravelairlines.vn',
        password: 'admin2026',
        role: 'admin',
        agentCode: 'VU-ADMIN-01',
        company: 'Vietravel Airlines HQ',
        status: 'ACTIVE'
    },
    {
        id: 'USR-002',
        name: 'Nhân Viên Điều Hành Cargo',
        email: 'staff@vietravelairlines.vn',
        password: 'staff2026',
        role: 'staff',
        agentCode: 'VU-OPS-88',
        company: 'Trung Tâm Kho Vận Vietravel Cargo',
        status: 'ACTIVE'
    },
    {
        id: 'USR-003',
        name: 'Công ty TNHH Vận tải ABC Logistics',
        email: 'an.nguyen@abccargo.vn',
        password: 'abc123456',
        role: 'agent',
        agentCode: 'AG-0892',
        company: 'ABC Logistics Corp',
        tier: 'TIER1',
        status: 'ACTIVE'
    },
    {
        id: 'USR-004',
        name: 'Công ty CP Giao nhận Kho vận Vinatrans',
        email: 'khang.le@vinatrans.com.vn',
        password: 'vina123456',
        role: 'agent',
        agentCode: 'AG-1024',
        company: 'Vinatrans Logistics',
        tier: 'TIER1',
        status: 'ACTIVE'
    },
    {
        id: 'USR-005',
        name: 'Công ty TNHH Tiếp vận Toàn Cầu Golden Star',
        email: 'thao.pham@dhlvietnam.com',
        password: 'star123456',
        role: 'agent',
        agentCode: 'AG-0556',
        company: 'Golden Star Forwarding',
        tier: 'TIER1',
        status: 'ACTIVE'
    },
    {
        id: 'USR-006',
        name: 'Công ty TNHH SkyFreight Logistics Việt Nam',
        email: 'dung.hoang@saigonair.vn',
        password: 'sky123456',
        role: 'agent',
        agentCode: 'AG-0341',
        company: 'SkyFreight Vietnam',
        tier: 'TIER2',
        status: 'ACTIVE'
    }
];

// Initial Flight Auctions
const now = new Date();

function getFutureTime(minutes) {
    return new Date(now.getTime() + minutes * 60000).toISOString();
}

function getPastTime(minutes) {
    return new Date(now.getTime() - minutes * 60000).toISOString();
}

const INITIAL_FLIGHTS = [
    {
        id: 'FL-VU130',
        flightNumber: 'VU130',
        route: 'SGN-HAN',
        departureTime: '2026-09-04T14:30',
        payloadCapacityKg: 5000,
        referencePriceKg: 18500,
        startTime: getPastTime(5),
        endTime: getFutureTime(15),
        status: 'OPEN',
        allowedTiers: ['TIER1', 'TIER2', 'TIER3'],
        createdBy: 'staff@vietravelairlines.vn'
    },
    {
        id: 'FL-VU221',
        flightNumber: 'VU221',
        route: 'SGN-DAD',
        departureTime: '2026-09-04T18:00',
        payloadCapacityKg: 3500,
        referencePriceKg: 16000,
        startTime: getPastTime(2),
        endTime: getFutureTime(25),
        status: 'OPEN',
        allowedTiers: ['TIER1', 'TIER2'],
        createdBy: 'staff@vietravelairlines.vn'
    },
    {
        id: 'FL-VU782',
        flightNumber: 'VU782',
        route: 'HAN-PQC',
        departureTime: '2026-09-05T08:15',
        payloadCapacityKg: 4200,
        referencePriceKg: 22000,
        startTime: getPastTime(1),
        endTime: getFutureTime(40),
        status: 'OPEN',
        allowedTiers: ['TIER1', 'TIER2', 'TIER3'],
        createdBy: 'staff@vietravelairlines.vn'
    }
];

// Data Store Engine
const DataStore = {
    init: function() {
        if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
            localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(INITIAL_USERS));
        }
        if (!localStorage.getItem(STORAGE_KEYS.FLIGHTS)) {
            localStorage.setItem(STORAGE_KEYS.FLIGHTS, JSON.stringify(INITIAL_FLIGHTS));
        }
        if (!localStorage.getItem(STORAGE_KEYS.BIDS)) {
            localStorage.setItem(STORAGE_KEYS.BIDS, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.REGISTRATIONS)) {
            localStorage.setItem(STORAGE_KEYS.REGISTRATIONS, JSON.stringify([]));
        }
    },

    getUsers: function() {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS)) || INITIAL_USERS;
    },

    getFlights: function() {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.FLIGHTS)) || [];
    },

    getBids: function() {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.BIDS)) || [];
    },

    getRegistrations: function() {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.REGISTRATIONS)) || [];
    },

    login: function(usernameOrCode, password) {
        const users = this.getUsers();
        const input = (usernameOrCode || '').trim().toLowerCase();
        const user = users.find(u =>
            (u.email || '').toLowerCase() === input ||
            (u.agentCode || '').toLowerCase() === input
        );

        if (!user) {
            return { success: false, message: `Mã tài khoản "${usernameOrCode}" không tồn tại trong CSDL.` };
        }

        if (user.password !== password) {
            return { success: false, message: `Mật khẩu không chính xác cho tài khoản "${usernameOrCode}"!` };
        }

        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
        localStorage.setItem(STORAGE_KEYS.CURRENT_ROLE, user.role);
        return { success: true, user: user };
    },

    getCurrentUser: function() {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.CURRENT_USER)) || null;
    },

    logout: function() {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        localStorage.removeItem(STORAGE_KEYS.CURRENT_ROLE);
    }
};

DataStore.init();
