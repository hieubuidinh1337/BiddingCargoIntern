-- ============================================================
-- VIETRAVEL AIRLINES CARGO BIDDING SYSTEM - SQLITE SCHEMA
-- Full Relational Database DDL & Seed Data Script
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 1. AGENTS TABLE (Master Agent Directory)
CREATE TABLE IF NOT EXISTS agents (
    code TEXT PRIMARY KEY,
    name TEXT,
    companyName TEXT,
    taxCode TEXT,
    email TEXT,
    phone TEXT,
    status TEXT DEFAULT 'Hoạt động',
    isLocked INTEGER DEFAULT 0,
    lockedReason TEXT,
    lockedAt TEXT,
    unlockedAt TEXT,
    password TEXT DEFAULT 'abc123456',
    pin TEXT DEFAULT '1234'
);

-- 2. USERS TABLE (System User Accounts)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    agentCode TEXT,
    password TEXT,
    pin TEXT,
    role TEXT,
    fullName TEXT,
    email TEXT,
    companyName TEXT,
    status TEXT DEFAULT 'ACTIVE',
    FOREIGN KEY(agentCode) REFERENCES agents(code) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 3. AUCTIONS TABLE (Flight Bidding Catalog)
CREATE TABLE IF NOT EXISTS auctions (
    id INTEGER PRIMARY KEY,
    flightCode TEXT,
    flightNumber TEXT,
    route TEXT,
    origin TEXT,
    destination TEXT,
    originName TEXT,
    destName TEXT,
    etd TEXT,
    eta TEXT,
    etdIso TEXT,
    aircraft TEXT,
    capacityKg INTEGER,
    startingPriceKg INTEGER,
    currentPriceKg INTEGER,
    minStep INTEGER,
    endTime TEXT,
    status TEXT DEFAULT 'OPEN',
    leadingAgentCode TEXT,
    leadingAgentName TEXT,
    bidsCount INTEGER DEFAULT 0,
    winnerAgentCode TEXT,
    winnerAgentName TEXT,
    winningPriceKg INTEGER,
    specialNotes TEXT,
    cutOffTime TEXT,
    FOREIGN KEY(leadingAgentCode) REFERENCES agents(code) ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY(winnerAgentCode) REFERENCES agents(code) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 4. BIDS TABLE (Sealed-Bid Placement History Log)
CREATE TABLE IF NOT EXISTS bids (
    id TEXT PRIMARY KEY,
    timestamp BIGINT,
    auctionId INTEGER,
    agentCode TEXT,
    agentName TEXT,
    isAnonymous INTEGER DEFAULT 1,
    priceKg INTEGER,
    time TEXT,
    status TEXT DEFAULT 'OUTBID',
    weightKg INTEGER,
    FOREIGN KEY(auctionId) REFERENCES auctions(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY(agentCode) REFERENCES agents(code) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 5. WON_AUCTIONS TABLE (Awarded Orders & Payment Tracking)
CREATE TABLE IF NOT EXISTS won_auctions (
    wonId TEXT PRIMARY KEY,
    auctionId INTEGER,
    agentCode TEXT,
    flightNumber TEXT,
    route TEXT,
    capacityKg INTEGER,
    priceKg INTEGER,
    totalAmountVND BIGINT,
    paymentDeadline TEXT,
    paymentStatus TEXT DEFAULT 'UNPAID',
    paidAt TEXT,
    awbNumber TEXT,
    cutOffTime TEXT,
    warehouse TEXT,
    cargo_declaration_json TEXT,
    lockWaivedByAdmin INTEGER DEFAULT 0,
    lockPenaltyHandled INTEGER DEFAULT 0,
    momoOrderId TEXT,
    momoRequestId TEXT,
    momoOrderInfo TEXT,
    momoPayUrl TEXT,
    momoQrCodeUrl TEXT,
    momoDeeplink TEXT,
    momoTransId TEXT,
    momoPaidAt TEXT,
    momoCreatedAt TEXT,
    momoExpiresAt TEXT,
    FOREIGN KEY(auctionId) REFERENCES auctions(id) ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY(agentCode) REFERENCES agents(code) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 6. NOTIFICATIONS TABLE (System & Targeted Notifications)
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    targetAgentCode TEXT,
    targetRole TEXT,
    title TEXT,
    message TEXT,
    time TEXT,
    type TEXT DEFAULT 'INFO',
    read INTEGER DEFAULT 0,
    link TEXT,
    FOREIGN KEY(targetAgentCode) REFERENCES agents(code) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 7. REGISTRATIONS TABLE (New Agent Membership Applications)
CREATE TABLE IF NOT EXISTS registrations (
    regId TEXT PRIMARY KEY,
    companyName TEXT,
    taxCode TEXT,
    address TEXT,
    field TEXT,
    repName TEXT,
    repPosition TEXT,
    email TEXT,
    phone TEXT,
    documents TEXT,
    status TEXT DEFAULT 'PENDING',
    submittedAt TEXT,
    rejectionReason TEXT
);

-- 8. CHATS TABLE (Live Customer Support Sessions)
CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    agentCode TEXT,
    agentName TEXT,
    status TEXT DEFAULT 'OPEN',
    createdAt TEXT,
    closedAt TEXT,
    assignedTo TEXT,
    assignedName TEXT,
    FOREIGN KEY(agentCode) REFERENCES agents(code) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 9. CHAT_MESSAGES TABLE (Support Chat Messages & File Attachments)
CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    chatId TEXT,
    sender TEXT,
    senderName TEXT,
    text TEXT,
    fileUrl TEXT,
    fileName TEXT,
    fileType TEXT,
    timestamp BIGINT,
    read INTEGER DEFAULT 0,
    FOREIGN KEY(chatId) REFERENCES chats(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 10. EMAIL_LOGS TABLE (SMTP Outbound Mail Logs)
CREATE TABLE IF NOT EXISTS email_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    toAddress TEXT,
    type TEXT,
    subject TEXT,
    messageId TEXT,
    isRealSmtp INTEGER DEFAULT 0,
    previewUrl TEXT,
    sentAt TEXT
);

-- 11. SETTINGS TABLE (System Configurations & Payment Credentials)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- 12. ACTIVITY_LOGS TABLE (Full Audit Trail of User Actions)
CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    rawTime BIGINT,
    actor TEXT,
    username TEXT,
    role TEXT,
    actionCategory TEXT,
    actionTitle TEXT,
    target TEXT,
    details TEXT,
    ip TEXT,
    device TEXT
);

-- INDEXES FOR HIGH PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_bids_auctionId ON bids(auctionId);
CREATE INDEX IF NOT EXISTS idx_bids_agentCode ON bids(agentCode);
CREATE INDEX IF NOT EXISTS idx_won_agentCode ON won_auctions(agentCode);
CREATE INDEX IF NOT EXISTS idx_chats_agentCode ON chats(agentCode);
CREATE INDEX IF NOT EXISTS idx_chat_msgs_chatId ON chat_messages(chatId);

-- ============================================================
-- INITIAL SEED DATA
-- ============================================================

INSERT OR IGNORE INTO agents (code, name, companyName, taxCode, email, phone, status, password, pin) VALUES
('VU-ADMIN-01', 'Quản Trị Viên VU', 'Vietravel Airlines HQ', '0109001122', 'admin@vietravelairlines.vn', '1900 6686', 'Hoạt động', 'admin2026', '1234'),
('VU-OPS-88', 'Nhân Viên Điều Hành Cargo', 'Trung Tâm Kho Vận Vietravel Cargo', '0109001122', 'staff@vietravelairlines.vn', '1900 6686', 'Hoạt động', 'staff2026', '1234'),
('AG-0892', 'ABC Logistics', 'Công ty TNHH Vận tải ABC Logistics', '0315889900', 'an.nguyen@abccargo.vn', '0903 123 456', 'Hoạt động', 'abc123456', '1234'),
('AG-1024', 'Vinatrans', 'Công ty CP Giao nhận Kho vận Vinatrans', '0300445566', 'khang.le@vinatrans.com.vn', '0918 456 789', 'Hoạt động', 'vina123456', '1234'),
('AG-0556', 'Golden Star', 'Công ty TNHH Tiếp vận Toàn Cầu Golden Star', '0312334455', 'thao.pham@dhlvietnam.com', '0988 777 888', 'Hoạt động', 'star123456', '1234'),
('AG-0341', 'SkyFreight', 'Công ty TNHH SkyFreight Logistics Việt Nam', '0314556677', 'dung.hoang@saigonair.vn', '0934 555 666', 'Hoạt động', 'sky123456', '1234'),
('AG-0789', 'Viet Freight', 'Công ty CP Vận chuyển Hàng không Việt Freight', '0316778899', 'hoa.nt@vietfreight.vn', '0909 111 222', 'Hoạt động', 'viet123456', '1234');

INSERT OR IGNORE INTO users (id, username, agentCode, password, pin, role, fullName, email, companyName, status) VALUES
('USR-001', 'admin', 'VU-ADMIN-01', 'admin2026', '1234', 'ADMIN', 'Quản Trị Viên VU', 'admin@vietravelairlines.vn', 'Vietravel Airlines HQ', 'ACTIVE'),
('USR-002', 'staff01', 'VU-OPS-88', 'staff2026', '1234', 'STAFF', 'Nhân Viên Điều Hành Cargo', 'staff@vietravelairlines.vn', 'Trung Tâm Kho Vận Vietravel Cargo', 'ACTIVE'),
('USR-008', 'staff02', 'VU-OPS-88', 'staff2026', '1234', 'STAFF', 'Nhân Viên Thẩm Định Đại Lý', 'staff02@vietravelairlines.vn', 'Phòng Thẩm Định Đại Lý', 'ACTIVE'),
('USR-003', 'AG-0892', 'AG-0892', 'abc123456', '1234', 'AGENT', 'Nguyễn Văn An', 'an.nguyen@abccargo.vn', 'Công ty TNHH Vận tải ABC Logistics', 'ACTIVE'),
('USR-004', 'AG-1024', 'AG-1024', 'vina123456', '1234', 'AGENT', 'Lê Minh Khang', 'khang.le@vinatrans.com.vn', 'Công ty CP Giao nhận Kho vận Vinatrans', 'ACTIVE'),
('USR-005', 'AG-0556', 'AG-0556', 'star123456', '1234', 'AGENT', 'Phạm Thu Thảo', 'thao.pham@dhlvietnam.com', 'Công ty TNHH Tiếp vận Toàn Cầu Golden Star', 'ACTIVE'),
('USR-006', 'AG-0341', 'AG-0341', 'sky123456', '1234', 'AGENT', 'Hoàng Văn Dũng', 'dung.hoang@saigonair.vn', 'Công ty TNHH SkyFreight Logistics Việt Nam', 'ACTIVE'),
('USR-007', 'AG-0789', 'AG-0789', 'viet123456', '1234', 'AGENT', 'Nguyễn Thị Hoa', 'hoa.nt@vietfreight.vn', 'Công ty CP Vận chuyển Hàng không Việt Freight', 'ACTIVE');

