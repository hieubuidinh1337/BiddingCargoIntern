/**
 * CARGO BIDDING SYSTEM - Module 3: Authentication & RBAC Permission Checks
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
                            actionTitle: 'Đăng nhập hệ thống Quản trị',
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
                actionTitle: 'Đăng nhập hệ thống Quản trị',
                target: 'Portal Quản trị',
                details: `Tài khoản ${admin.role || 'ADMIN'} ${admin.fullName} (@${admin.username}) đăng nhập thành công vào Trung tâm Điều hành Cargo.`
            });
            return { success: true, admin: data.currentAdmin };
        },

        getCurrentUser: function () {
            const data = loadData();
            const user = data.currentUser;
            if (!user) return null;
            const userCode = String(user.agentCode || user.code || '').trim();
            if (!userCode) return null;

            // Sync latest pin from agentsList without destructively wiping currentUser on simple read
            if (user.role === 'agent' || user.agentCode || user.code) {
                const targetCode = userCode.toUpperCase();
                const agent = (data.agentsList || []).find(a =>
                    (a.code || '').toUpperCase() === targetCode || a.id == user.id
                );
                if (agent) {
                    if (agent.pin && !user.pin) {
                        user.pin = agent.pin;
                    }
                    const isHttp = typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol.startsWith('http');
                    if (!isHttp && (agent.status === 'Đã khóa' || agent.status === 'LOCKED' || agent.isLocked)) {
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
        }
    });
})();
