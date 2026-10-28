/**
 * CARGO BIDDING SYSTEM - Module 6: Auction Settlement, Payments, Refunds & Cargo Declarations
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

    Object.assign(CargoStore, {
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
                    saveData(data, true);
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
                    saveData(data, true);
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
            if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                fetch('/api/admin/auctions/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: id })
                }).catch(() => {});
            }
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
            if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                fetch('/api/admin/auctions/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: id, reason: cleanReason, refundNote: cleanRefundNote })
                }).catch(() => {});
            }

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
        }
    });
})();
