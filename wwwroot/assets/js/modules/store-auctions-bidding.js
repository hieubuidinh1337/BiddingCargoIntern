/**
 * CARGO BIDDING SYSTEM - Module 4: Auctions, Sealed-Bid Placement, Watchlist & Notifications
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
            const auctions = Array.isArray(data.auctions) ? data.auctions.map(a => ({ ...a })) : [];
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
            const auctions = Array.isArray(data.auctions) ? data.auctions.map(a => ({ ...a })) : [];
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
                if (typeof this.kickOutLockedAgent === 'function') {
                    this.kickOutLockedAgent(agentAccount.lockedReason || 'Tài khoản đại lý của bạn đang bị khóa.');
                }
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
        }
    });
})();
