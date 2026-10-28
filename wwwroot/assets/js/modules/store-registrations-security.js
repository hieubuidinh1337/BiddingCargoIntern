/**
 * CARGO BIDDING SYSTEM - Module 5: Agent Registrations, OTP/PIN Security & Email Dispatch
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
        registerAgent: function (regData) {
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

            // PIN is now created post-login; validate only if explicitly supplied
            const pinClean = (regData.pin || '').trim();
            if (pinClean && !pinRegex.test(pinClean)) {
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

            if (regData.documents && Array.isArray(regData.documents)) {
                for (const doc of regData.documents) {
                    if (doc && doc.size && doc.size > 10 * 1024 * 1024) {
                        const sizeMB = (doc.size / (1024 * 1024)).toFixed(1);
                        return {
                            success: false,
                            message: `Tệp tin "${doc.name || 'Hồ sơ'}" (${sizeMB}MB) vượt quá dung lượng tối đa cho phép (10MB/tệp tin)!`
                        };
                    }
                }
            }

            const now = new Date();

            // Check if resubmitting an existing rejected registration
            const existingRejectedReg = (data.registrations || []).find(r =>
                (regData.resubmitRegId && r.regId === regData.resubmitRegId) ||
                (taxClean && r.taxCode && r.taxCode.trim() === taxClean && r.status === 'REJECTED')
            );

            if (existingRejectedReg) {
                existingRejectedReg.companyName = regData.companyName || existingRejectedReg.companyName;
                existingRejectedReg.taxCode = taxClean || existingRejectedReg.taxCode;
                existingRejectedReg.businessLicense = regData.businessLicense || existingRejectedReg.businessLicense;
                existingRejectedReg.address = regData.address || existingRejectedReg.address;
                existingRejectedReg.field = regData.field || existingRejectedReg.field;
                existingRejectedReg.repName = regData.repName || existingRejectedReg.repName;
                existingRejectedReg.repPosition = regData.repPosition || existingRejectedReg.repPosition;
                existingRejectedReg.email = emailClean || existingRejectedReg.email;
                existingRejectedReg.phone = phoneClean || existingRejectedReg.phone;
                existingRejectedReg.citizenId = regData.citizenId || existingRejectedReg.citizenId;
                existingRejectedReg.notifEmail = regData.notifEmail || existingRejectedReg.notifEmail;
                if (regData.password) existingRejectedReg.password = regData.password;
                if (regData.pin) existingRejectedReg.pin = regData.pin;
                if (regData.documents && regData.documents.length > 0) {
                    existingRejectedReg.documents = regData.documents.map(d => {
                        if (typeof d === 'string') return { name: d, dataUrl: null, type: d.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png' };
                        return { name: d.name || 'document', dataUrl: d.dataUrl || null, type: d.type || 'application/octet-stream', size: d.size || 0 };
                    });
                }
                existingRejectedReg.status = 'PENDING';
                existingRejectedReg.rejectionReason = null;
                existingRejectedReg.rejectReason = null;
                existingRejectedReg.resubmittedAt = now.toISOString();
                existingRejectedReg.submittedAt = now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' (Bổ sung lại)';

                saveData(data);

                if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                    fetch('/api/registration/submit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(existingRejectedReg)
                    }).then(() => {
                        lastLocalSaveTimestamp = 0;
                        return syncWithServer(true);
                    }).catch(() => { });
                }

                CargoStore.sendEmailNotification({
                    type: 'REGISTRATION_SUBMITTED',
                    to: existingRejectedReg.email,
                    notifEmail: existingRejectedReg.notifEmail,
                    regData: existingRejectedReg
                });

                return existingRejectedReg;
            }

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

            // Push admin notification for new registration if not already existing
            if (!data.notifications) data.notifications = [];
            const notifMsg = `Mã hồ sơ ${newReg.regId} — ${newReg.companyName} (MST: ${newReg.taxCode}) vừa nộp hồ sơ đăng ký trở thành đại lý. Người đại diện: ${newReg.repName} — ${newReg.email}. Vui lòng xét duyệt trong vòng 24h làm việc.`;
            const alreadyHasNotif = data.notifications.some(n => n.message && n.message.includes(newReg.regId));
            if (!alreadyHasNotif) {
                data.notifications.unshift({
                    id: Date.now(),
                    timestamp: Date.now(),
                    targetRole: 'ADMIN',
                    title: `📋 HỒ SƠ ĐĂNG KÝ MỚI: ${newReg.companyName}`,
                    message: notifMsg,
                    time: 'Vừa xong',
                    type: 'REGISTRATION',
                    read: false,
                    link: '../Admin/06-AgentList.html'
                });
            }

            saveData(data);

            if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                fetch('/api/registration/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newReg)
                }).then(() => {
                    lastLocalSaveTimestamp = 0;
                    return syncWithServer(true);
                }).catch(() => { });
            }

            // Dispatch automated email via C# MailKit SMTP
            CargoStore.sendEmailNotification({
                type: 'REGISTRATION_SUBMITTED',
                to: newReg.email,
                notifEmail: newReg.notifEmail,
                regData: newReg
            });

            return newReg;
        },

        getRegistrations: function () {
            return loadData().registrations || [];
        },

        approveRegistration: function (regId) {
            const data = loadData();
            if (data.currentAdmin && data.currentAdmin.role === 'STAFF') {
                return { success: false, message: 'Nhân viên (STAFF) không có quyền phê duyệt hồ sơ đại lý. Thao tác này chỉ dành cho Quản trị viên (ADMIN).' };
            }
            const reg = data.registrations.find(r => r.regId === regId);
            if (!reg) return false;

            reg.status = 'APPROVED';
            if (!data.agentsList) data.agentsList = [];
            const existingCodes = new Set(data.agentsList.map(a => String(a.code || '').trim().toUpperCase()));
            let seq = data.agentsList.length + 1;
            let newCode = `AG-${String(seq).padStart(4, '0')}`;
            while (existingCodes.has(newCode)) {
                seq++;
                newCode = `AG-${String(seq).padStart(4, '0')}`;
            }
            reg.agentCode = newCode;
            const agentPwd = reg.password || '12345678';
            const agentPin = reg.pin || null; // Mã PIN được tạo sau khi đăng nhập thành công

            // Add to agents list with registered password
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
                totalWins: 0,
                documents: reg.documents || []
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
                message: `Kính gửi ${reg.repName} (${reg.companyName}), Ban Điều hành Hãng hàng không xin thông báo: Hồ sơ đăng ký của Quý doanh nghiệp đã được PHÊ DUYỆT thành công! Mã Đại lý chính thức của Quý công ty là: ${newCode}. Quý công ty vui lòng sử dụng Mã Đại lý cùng Mật khẩu để đăng nhập vào Sàn Đấu giá Cargo và thiết lập Mã PIN bảo mật.`,
                time: formatTimeAgo(now),
                type: 'SYSTEM',
                read: false,
                link: '01-Login.html'
            });

            saveData(data);
            if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                fetch('/api/registration/approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        regId: regId,
                        agentCode: newCode,
                        password: agentPwd,
                        pin: agentPin,
                        approvedBy: data.currentAdmin ? (data.currentAdmin.fullName || data.currentAdmin.username) : 'Admin'
                    })
                }).then(() => {
                    lastLocalSaveTimestamp = 0;
                    return syncWithServer(true);
                }).catch(() => { });
            }
            this.logActivity({
                actionCategory: 'Quản lý Đại lý',
                actionTitle: 'Duyệt & Cấp mã Đại lý',
                target: reg.companyName,
                details: `Phê duyệt hồ sơ đăng ký đại lý "${reg.companyName}" (MST: ${reg.taxCode || 'N/A'}). Cấp thành công Mã Đại lý: ${newCode}.`
            });

            // Dispatch automated email via C# MailKit SMTP
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

        requestPasswordResetOtp: function (emailOrCode) {
            const data = loadData();
            const identifier = (emailOrCode || '').trim().toLowerCase();
            if (!identifier) {
                return { success: false, message: 'Vui lòng nhập Email hoặc Mã đại lý của bạn.' };
            }

            const agent = (data.agentsList || []).find(a =>
                (a.email || '').toLowerCase() === identifier ||
                (a.code || '').toLowerCase() === identifier ||
                (a.taxCode || '').toLowerCase() === identifier
            );

            if (!agent) {
                return { success: false, message: `Không tìm thấy tài khoản đại lý với thông tin "${emailOrCode}". Vui lòng kiểm tra lại Email đăng ký.` };
            }

            if (!agent.email) {
                return { success: false, message: `Tài khoản đại lý ${agent.code} chưa cập nhật địa chỉ Email. Vui lòng liên hệ Hotline 1900.6686 để được hỗ trợ.` };
            }

            // Anti-spam cooldown: prevent sending multiple emails within 30 seconds
            if (data.passwordResetOtps && data.passwordResetOtps[agent.code]) {
                const existing = data.passwordResetOtps[agent.code];
                const elapsedSec = Math.floor((Date.now() - (existing.createdAt || 0)) / 1000);
                if (elapsedSec < 30) {
                    const waitSec = 30 - elapsedSec;
                    return {
                        success: false,
                        rateLimited: true,
                        waitSec: waitSec,
                        message: `Hệ thống vừa gửi mã OTP đến email của bạn. Vui lòng đợi ${waitSec} giây nữa trước khi gửi lại.`
                    };
                }
            }

            // Generate 6-digit numeric OTP
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins

            if (!data.passwordResetOtps) data.passwordResetOtps = {};
            data.passwordResetOtps[agent.code] = {
                otp: otp,
                email: agent.email,
                expiresAt: expiresAt,
                createdAt: Date.now()
            };
            saveData(data);

            // Log activity
            this.logActivity({
                actor: agent.companyName || agent.repName || agent.code,
                username: agent.code,
                role: 'AGENT',
                actionCategory: 'Tài khoản',
                actionTitle: 'Yêu cầu mã OTP khôi phục mật khẩu',
                target: 'Email OTP',
                details: `Đại lý ${agent.code} (${agent.companyName}) đã yêu cầu gửi mã xác thực OTP qua email ${agent.email}.`
            });

            // Dispatch email notification via backend
            if (this.sendEmailNotification) {
                this.sendEmailNotification({
                    type: 'PASSWORD_RESET_OTP',
                    to: agent.email,
                    agentCode: agent.code,
                    agentName: agent.companyName || agent.repName || agent.code,
                    otp: otp,
                    expiresMinutes: 15
                });
            }

            // Mask email for privacy display: e.g. lo***@viettelpost.com.vn
            const parts = agent.email.split('@');
            let maskedEmail = agent.email;
            if (parts.length === 2) {
                const namePart = parts[0];
                const visibleLen = Math.min(2, namePart.length);
                maskedEmail = namePart.substring(0, visibleLen) + '••••' + '@' + parts[1];
            }

            return {
                success: true,
                message: `Mã OTP đã được gửi đến email ${maskedEmail}. Vui lòng kiểm tra hộp thư của bạn!`,
                agentCode: agent.code,
                email: agent.email,
                maskedEmail: maskedEmail,
                companyName: agent.companyName || agent.repName,
            };
        },

        verifyPasswordResetOtp: function (emailOrCode, otpInput) {
            const data = loadData();
            const identifier = (emailOrCode || '').trim().toLowerCase();
            const agent = (data.agentsList || []).find(a =>
                (a.email || '').toLowerCase() === identifier ||
                (a.code || '').toLowerCase() === identifier ||
                (a.taxCode || '').toLowerCase() === identifier
            );

            if (!agent) {
                return { success: false, message: 'Không tìm thấy thông tin tài khoản đại lý.' };
            }

            const record = (data.passwordResetOtps || {})[agent.code];
            const cleanOtp = String(otpInput || '').trim();

            if (!record) {
                return { success: false, message: 'Yêu cầu OTP đã hết hạn hoặc chưa được tạo. Vui lòng bấm "Gửi lại OTP".' };
            }

            if (Date.now() > record.expiresAt) {
                return { success: false, message: 'Mã xác nhận OTP đã hết hạn (quá 15 phút). Vui lòng yêu cầu mã OTP mới.' };
            }

            if (cleanOtp !== String(record.otp).trim()) {
                return { success: false, message: 'Mã xác nhận OTP không chính xác. Vui lòng kiểm tra lại hòm thư email.' };
            }

            // Mark OTP as verified
            record.verified = true;
            record.verifiedAt = Date.now();
            saveData(data);

            return {
                success: true,
                message: 'Xác thực mã OTP thành công!',
                agentCode: agent.code,
                companyName: agent.companyName || agent.repName,
                maskedEmail: agent.email
            };
        },

        resetPasswordWithOtp: function (emailOrCode, otpInput, newPassword) {
            const data = loadData();
            const identifier = (emailOrCode || '').trim().toLowerCase();
            const agent = (data.agentsList || []).find(a =>
                (a.email || '').toLowerCase() === identifier ||
                (a.code || '').toLowerCase() === identifier ||
                (a.taxCode || '').toLowerCase() === identifier
            );

            if (!agent) {
                return { success: false, message: 'Không tìm thấy thông tin tài khoản đại lý.' };
            }

            const record = (data.passwordResetOtps || {})[agent.code];
            const cleanOtp = String(otpInput || '').trim();

            if (!record) {
                return { success: false, message: 'Yêu cầu OTP đã hết hạn hoặc chưa được tạo. Vui lòng bấm "Gửi lại OTP".' };
            }

            if (Date.now() > record.expiresAt) {
                return { success: false, message: 'Mã xác nhận OTP đã hết hạn (quá 15 phút). Vui lòng yêu cầu mã OTP mới.' };
            }

            if (cleanOtp !== String(record.otp).trim()) {
                return { success: false, message: 'Mã xác nhận OTP không chính xác. Vui lòng kiểm tra lại email.' };
            }

            const pwd = String(newPassword || '').trim();
            if (pwd.length < 6) {
                return { success: false, message: 'Mật khẩu mới phải có tối thiểu 6 ký tự.' };
            }

            // Update agent password
            agent.password = pwd;
            if (data.currentUser && (data.currentUser.agentCode || '').toUpperCase() === (agent.code || '').toUpperCase()) {
                data.currentUser.password = pwd;
            }

            // Remove used OTP
            delete data.passwordResetOtps[agent.code];
            saveData(data);

            // Log activity
            this.logActivity({
                actor: agent.companyName || agent.repName || agent.code,
                username: agent.code,
                role: 'AGENT',
                actionCategory: 'Tài khoản',
                actionTitle: 'Đặt lại mật khẩu qua Email OTP',
                target: 'Mật khẩu',
                details: `Đại lý ${agent.companyName || agent.code} (${agent.code}) đã đổi mật khẩu thành công qua xác minh Email OTP.`
            });

            // Dispatch confirmation email
            if (this.sendEmailNotification) {
                this.sendEmailNotification({
                    type: 'PASSWORD_RESET_SUCCESS',
                    to: agent.email,
                    agentCode: agent.code,
                    agentName: agent.companyName || agent.repName || agent.code
                });
            }

            return {
                success: true,
                message: 'Đặt lại mật khẩu mới thành công! Quý khách có thể đăng nhập ngay vào hệ thống.',
                agentCode: agent.code,
                newPassword: pwd
            };
        },

        verifyPinAndGetPassword: function (agentCodeOrEmail, pinInput) {
            const data = loadData();
            const identifier = (agentCodeOrEmail || '').trim().toLowerCase();
            const agent = (data.agentsList || []).find(a =>
                (a.code || '').toLowerCase() === identifier ||
                (a.taxCode || '').toLowerCase() === identifier ||
                (a.email || '').toLowerCase() === identifier
            );

            if (!agent) {
                return { success: false, message: `Mã đại lý hoặc Email "${agentCodeOrEmail}" không tồn tại trên hệ thống.` };
            }

            if (!agent.pin) {
                return {
                    success: false,
                    hasNoPin: true,
                    message: `Tài khoản đại lý ${agent.code} chưa thiết lập Mã PIN bảo mật. Quý khách vui lòng liên hệ Tổng đài 1900.6686 hoặc email cargo@vietravelairlines.vn để được hỗ trợ cấp lại mật khẩu.`
                };
            }

            const expectedPin = String(agent.pin).trim();
            if (String(pinInput).trim() !== expectedPin) {
                return { success: false, message: `Mã PIN bảo mật (4 chữ số) không chính xác cho đại lý ${agent.code}!` };
            }

            return {
                success: true,
                password: agent.password || '12345678',
                agent: agent,
                agentCode: agent.code,
                companyName: agent.companyName || agent.repName || agent.code
            };
        },

        createOrUpdatePin: function (agentCode, newPin, currentPassword = '') {
            const data = loadData();
            const pinStr = String(newPin || '').trim();
            if (!/^[0-9]{4}$/.test(pinStr)) {
                return { success: false, message: 'Mã PIN bảo mật phải gồm đúng 4 chữ số (0-9).' };
            }
            const codeClean = (agentCode || '').trim().toUpperCase();
            const agent = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === codeClean);
            if (!agent) {
                return { success: false, message: 'Không tìm thấy thông tin đại lý tương ứng.' };
            }

            if (currentPassword && agent.password && agent.password !== currentPassword) {
                return { success: false, message: 'Mật khẩu tài khoản hiện tại không chính xác!' };
            }

            const isNewPin = !agent.pin;
            agent.pin = pinStr;
            agent.pinCreatedAt = Date.now();
            agent.pinUpdatedAt = Date.now();

            if (data.currentUser && (data.currentUser.agentCode || '').toUpperCase() === codeClean) {
                data.currentUser.pin = pinStr;
                data.currentUser.pinCreatedAt = agent.pinCreatedAt;
            }

            saveData(data);
            this.logActivity({
                actor: agent.companyName || agent.repName || agent.code,
                username: agent.code,
                role: 'AGENT',
                actionCategory: 'Tài khoản',
                actionTitle: isNewPin ? 'Tạo mới Mã PIN bảo mật' : 'Đổi Mã PIN bảo mật',
                target: 'Mã PIN',
                details: `Đại lý ${agent.companyName || agent.code} (${agent.code}) đã ${isNewPin ? 'tạo mới' : 'cập nhật'} thành công Mã PIN bảo mật 4 chữ số.`
            });

            return {
                success: true,
                message: isNewPin ? 'Khởi tạo Mã PIN bảo mật 4 chữ số thành công!' : 'Đổi Mã PIN bảo mật thành công!',
                pin: pinStr
            };
        },

        resetPasswordWithPin: function (agentCode, pinInput, newPassword) {
            const data = loadData();
            const codeClean = (agentCode || '').trim().toUpperCase();
            const agent = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === codeClean);
            if (!agent) {
                return { success: false, message: 'Không tìm thấy thông tin đại lý.' };
            }

            if (!agent.pin) {
                return { success: false, message: 'Tài khoản chưa thiết lập Mã PIN bảo mật. Vui lòng liên hệ Hotline 1900.6686.' };
            }

            if (String(agent.pin).trim() !== String(pinInput).trim()) {
                return { success: false, message: 'Mã PIN bảo mật không chính xác!' };
            }

            const pwd = String(newPassword || '').trim();
            if (pwd.length < 6) {
                return { success: false, message: 'Mật khẩu mới phải có tối thiểu 6 ký tự.' };
            }

            agent.password = pwd;
            if (data.currentUser && (data.currentUser.agentCode || '').toUpperCase() === codeClean) {
                data.currentUser.password = pwd;
            }

            saveData(data);
            this.logActivity({
                actor: agent.companyName || agent.repName || agent.code,
                username: agent.code,
                role: 'AGENT',
                actionCategory: 'Tài khoản',
                actionTitle: 'Đặt lại mật khẩu qua Mã PIN',
                target: 'Mật khẩu',
                details: `Đại lý ${agent.companyName || agent.code} (${agent.code}) đã đặt lại mật khẩu mới thành công qua xác minh Mã PIN.`
            });

            return { success: true, message: 'Đặt lại mật khẩu thành công! Quý khách có thể đăng nhập ngay với mật khẩu mới.' };
        },

        rejectRegistration: function (regId, reason) {
            const data = loadData();
            if (data.currentAdmin && data.currentAdmin.role === 'STAFF') {
                return { success: false, message: 'Nhân viên (STAFF) không có quyền từ chối hồ sơ đại lý. Thao tác này chỉ dành cho Quản trị viên (ADMIN).' };
            }
            const reg = (data.registrations || []).find(r => r.regId === regId);
            if (!reg) return { success: false, message: 'Không tìm thấy hồ sơ đăng ký tương ứng.' };

            const finalReason = (reason || '').trim() || 'Hồ sơ chưa đạt tiêu chuẩn theo quy chế xét duyệt đại lý';
            reg.status = 'REJECTED';
            reg.rejectionReason = finalReason;
            reg.rejectReason = finalReason;
            reg.rejectedAt = new Date().toISOString();

            // Add notification for admin audit
            if (!data.notifications) data.notifications = [];
            data.notifications.unshift({
                id: Date.now(),
                title: `Từ chối hồ sơ ${reg.regId}`,
                message: `Hồ sơ đại lý ${reg.companyName} đã bị từ chối. Lý do: "${finalReason}"`,
                time: 'Vừa xong',
                type: 'AGENT',
                unread: true,
                targetRole: 'ADMIN'
            });
            saveData(data);
            if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                fetch('/api/registration/reject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        regId: regId,
                        reason: finalReason,
                        rejectedBy: data.currentAdmin ? (data.currentAdmin.fullName || data.currentAdmin.username) : 'Admin'
                    })
                }).then(() => {
                    lastLocalSaveTimestamp = 0;
                    return syncWithServer(true);
                }).catch(() => { });
            }
            this.logActivity({
                actionCategory: 'Quản lý Đại lý',
                actionTitle: 'Từ chối hồ sơ Đăng ký',
                target: reg.companyName,
                details: `Từ chối hồ sơ đăng ký đại lý "${reg.companyName}" (${reg.regId}). Lý do từ chối: "${finalReason}".`
            });

            // Dispatch automated email via C# MailKit SMTP
            CargoStore.sendEmailNotification({
                type: 'REGISTRATION_REJECTED',
                to: reg.email,
                notifEmail: reg.notifEmail,
                reason: finalReason,
                regData: {
                    ...reg,
                    rejectionReason: finalReason,
                    rejectReason: finalReason
                }
            });

            return {
                success: true,
                message: `Đã từ chối hồ sơ ${regId} và gửi email thông báo lý do đến đại lý (${reg.email}) thành công!`,
                reg: reg
            };
        },

        maskEmail: function (email) {
            if (!email) return '';
            const parts = String(email).split('@');
            if (parts.length !== 2) return email;
            const namePart = parts[0];
            const visibleLen = Math.min(2, namePart.length);
            return namePart.substring(0, visibleLen) + '••••@' + parts[1];
        },

        requestAccountUnlockEmail: function (agentCodeOrEmail) {
            const data = loadData();
            const identifier = (agentCodeOrEmail || '').trim().toLowerCase();
            const agent = (data.agentsList || []).find(a =>
                (a.code || '').toLowerCase() === identifier ||
                (a.email || '').toLowerCase() === identifier ||
                (a.taxCode || '').toLowerCase() === identifier
            );
            if (!agent) {
                return { success: false, message: 'Không tìm thấy tài khoản đại lý trong hệ thống.' };
            }
            if (!agent.isLocked && agent.status !== 'Đã khóa') {
                return { success: false, message: `Tài khoản ${agent.code} hiện tại không bị khóa.` };
            }

            const unlockToken = 'ULK-' + Math.random().toString(36).substring(2, 10).toUpperCase();
            const unlockOtp = String(Math.floor(100000 + Math.random() * 900000));
            agent.unlockToken = unlockToken;
            agent.unlockOtp = unlockOtp;
            agent.unlockExpiresAt = Date.now() + 24 * 3600 * 1000;
            saveData(data);

            this.logActivity({
                actor: agent.companyName || agent.code,
                username: agent.code,
                role: 'AGENT',
                actionCategory: 'Bảo mật',
                actionTitle: 'Yêu cầu gửi lại email mở khóa tài khoản',
                target: 'Tài khoản Agent',
                details: `Đại lý ${agent.code} (${agent.companyName}) đã yêu cầu gửi lại email/OTP mở khóa tài khoản đến ${agent.email}.`
            });

            this.sendEmailNotification({
                type: 'ACCOUNT_LOCKED_5_FAILS',
                to: agent.email,
                agentCode: agent.code,
                agentName: agent.companyName || agent.repName || agent.code,
                unlockToken: unlockToken,
                unlockOtp: unlockOtp,
                lockedAt: new Date().toLocaleString('vi-VN')
            });

            const masked = this.maskEmail(agent.email);
            return {
                success: true,
                agentCode: agent.code,
                email: agent.email,
                maskedEmail: masked,
                unlockOtp: unlockOtp,
                unlockToken: unlockToken,
                message: `Đã gửi lại email hướng dẫn mở khóa đến hộp thư ${masked}.`
            };
        },

        unlockAccountWithOtp: function (agentCodeOrEmail, otpInput) {
            const data = loadData();
            const identifier = (agentCodeOrEmail || '').trim().toLowerCase();
            const agent = (data.agentsList || []).find(a =>
                (a.code || '').toLowerCase() === identifier ||
                (a.email || '').toLowerCase() === identifier ||
                (a.taxCode || '').toLowerCase() === identifier
            );
            if (!agent) {
                return { success: false, message: 'Không tìm thấy tài khoản đại lý.' };
            }
            if (!agent.unlockOtp) {
                return { success: false, message: 'Mã mở khóa chưa được tạo hoặc đã hết hạn. Vui lòng bấm "Gửi lại email mở khóa".' };
            }
            if (agent.unlockExpiresAt && Date.now() > agent.unlockExpiresAt) {
                return { success: false, message: 'Mã mở khóa đã hết hạn. Vui lòng yêu cầu gửi lại email mới.' };
            }
            if (String(otpInput || '').trim() !== String(agent.unlockOtp).trim()) {
                return { success: false, message: 'Mã OTP mở khóa không chính xác. Vui lòng kiểm tra lại hòm thư email.' };
            }

            // Success: Unlock account
            agent.isLocked = false;
            agent.status = 'Đang hoạt động';
            agent.failedLoginAttempts = 0;
            delete agent.lockedReason;
            delete agent.lockedAt;
            delete agent.unlockOtp;
            delete agent.unlockToken;
            delete agent.unlockExpiresAt;
            saveData(data);

            this.logActivity({
                actor: agent.companyName || agent.code,
                username: agent.code,
                role: 'AGENT',
                actionCategory: 'Bảo mật',
                actionTitle: 'Mở khóa tài khoản thành công qua OTP',
                target: 'Tài khoản Agent',
                details: `Đại lý ${agent.code} (${agent.companyName}) đã mở khóa tài khoản thành công bằng mã OTP nhận qua Email.`
            });

            return {
                success: true,
                agentCode: agent.code,
                companyName: agent.companyName,
                message: `Mở khóa tài khoản ${agent.code} thành công! Quý đại lý có thể đăng nhập ngay.`
            };
        },

        unlockAccountWithToken: function (agentCode, tokenInput) {
            const data = loadData();
            const code = (agentCode || '').trim().toUpperCase();
            const token = (tokenInput || '').trim().toUpperCase();
            const agent = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === code);
            if (!agent) {
                return { success: false, message: 'Không tìm thấy tài khoản đại lý.' };
            }
            if (!agent.unlockToken) {
                return { success: false, message: 'Liên kết mở khóa không hợp lệ hoặc tài khoản đã được mở khóa trước đó.' };
            }
            if (agent.unlockExpiresAt && Date.now() > agent.unlockExpiresAt) {
                return { success: false, message: 'Liên kết mở khóa đã hết hạn (quá 24 giờ). Vui lòng yêu cầu gửi lại email mới.' };
            }
            if (String(agent.unlockToken).toUpperCase() !== token) {
                return { success: false, message: 'Mã xác thực mở khóa không chính xác.' };
            }

            // Success: Unlock account
            agent.isLocked = false;
            agent.status = 'Đang hoạt động';
            agent.failedLoginAttempts = 0;
            delete agent.lockedReason;
            delete agent.lockedAt;
            delete agent.unlockOtp;
            delete agent.unlockToken;
            delete agent.unlockExpiresAt;
            saveData(data);

            this.logActivity({
                actor: agent.companyName || agent.code,
                username: agent.code,
                role: 'AGENT',
                actionCategory: 'Bảo mật',
                actionTitle: 'Mở khóa tài khoản thành công qua Link Email',
                target: 'Tài khoản Agent',
                details: `Đại lý ${agent.code} (${agent.companyName}) đã mở khóa tài khoản thành công qua đường dẫn xác thực gửi về Email.`
            });

            return {
                success: true,
                agentCode: agent.code,
                companyName: agent.companyName,
                message: `Tài khoản đại lý ${agent.code} đã được mở khóa thành công! Quý khách có thể đăng nhập ngay.`
            };
        },

        sendEmailNotification: async function (payload) {
            try {
                const res = await fetch('/api/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const json = await res.json();
                console.log('[CargoStore] Email dispatch:', json);
                return json;
            } catch (err) {
                console.warn('[CargoStore] Email dispatch error:', err);
                return { success: false, error: err.message };
            }
        }
    });
})();
