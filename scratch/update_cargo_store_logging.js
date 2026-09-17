const fs = require('fs');

let code = fs.readFileSync('assets/js/cargo-store.js', 'utf8').replace(/\r\n/g, '\n');

const replacements = [
  // 1. loginAdmin
  {
    target: `            data.currentAdmin = {
                id: admin.id,
                username: admin.username,
                password: admin.password,
                role: admin.role,
                fullName: admin.fullName,
                email: admin.email,
                department: admin.department
            };

            saveData(data);
            return { success: true, admin: data.currentAdmin };`,
    replacement: `            data.currentAdmin = {
                id: admin.id,
                username: admin.username,
                password: admin.password,
                role: admin.role,
                fullName: admin.fullName,
                email: admin.email,
                department: admin.department
            };

            saveData(data);
            this.logActivity({
                actor: admin.fullName || admin.username,
                username: admin.username,
                role: admin.role || 'ADMIN',
                actionCategory: 'Đăng nhập',
                actionTitle: 'Đăng nhập hệ thống Admin',
                target: 'Portal Quản trị',
                details: \`Tài khoản \${admin.role || 'ADMIN'} \${admin.fullName} (@\${admin.username}) đăng nhập thành công vào Trung tâm Điều hành Cargo.\`
            });
            return { success: true, admin: data.currentAdmin };`
  },
  // 2. logoutAdmin
  {
    target: `        logoutAdmin: function() {
            if (typeof window !== 'undefined') window._isManualLogout = true;
            const data = loadData();
            data.currentAdmin = null;
            saveData(data);
        },`,
    replacement: `        logoutAdmin: function() {
            if (typeof window !== 'undefined') window._isManualLogout = true;
            const data = loadData();
            if (data.currentAdmin) {
                this.logActivity({
                    actor: data.currentAdmin.fullName || data.currentAdmin.username,
                    username: data.currentAdmin.username,
                    role: data.currentAdmin.role || 'ADMIN',
                    actionCategory: 'Đăng nhập',
                    actionTitle: 'Đăng xuất hệ thống Admin',
                    target: 'Portal Quản trị',
                    details: \`Quản trị viên \${data.currentAdmin.fullName} (@\${data.currentAdmin.username}) đã đăng xuất khỏi hệ thống.\`
                });
            }
            data.currentAdmin = null;
            saveData(data);
        },`
  },
  // 3. approveRegistration
  {
    target: `            saveData(data);

            // Dispatch automated email via Nodemailer
            CargoStore.sendEmailNotification({
                type: 'REGISTRATION_APPROVED',`,
    replacement: `            saveData(data);
            this.logActivity({
                actionCategory: 'Quản lý Đại lý',
                actionTitle: 'Duyệt & Cấp mã Đại lý',
                target: reg.companyName,
                details: \`Phê duyệt hồ sơ đăng ký đại lý "\${reg.companyName}" (MST: \${reg.taxCode || 'N/A'}). Cấp thành công Mã Đại lý: \${newCode}.\`
            });

            // Dispatch automated email via Nodemailer
            CargoStore.sendEmailNotification({
                type: 'REGISTRATION_APPROVED',`
  },
  // 4. rejectRegistration
  {
    target: `            saveData(data);

            // Dispatch automated email via Nodemailer
            CargoStore.sendEmailNotification({
                type: 'REGISTRATION_REJECTED',`,
    replacement: `            saveData(data);
            this.logActivity({
                actionCategory: 'Quản lý Đại lý',
                actionTitle: 'Từ chối hồ sơ Đăng ký',
                target: reg.companyName,
                details: \`Từ chối hồ sơ đăng ký đại lý "\${reg.companyName}" (\${reg.regId}). Lý do từ chối: "\${finalReason}".\`
            });

            // Dispatch automated email via Nodemailer
            CargoStore.sendEmailNotification({
                type: 'REGISTRATION_REJECTED',`
  },
  // 5. closeAuction
  {
    target: `            saveData(data);
            return { success: true, auction: auction };
        },

        confirmPayment: function(wonId) {`,
    replacement: `            saveData(data);
            this.logActivity({
                actionCategory: 'Phiên đấu giá',
                actionTitle: 'Chốt thầu / Đóng phiên đấu giá',
                target: auction.flightNumber,
                details: \`Đóng phiên đấu giá chuyến bay \${auction.flightNumber} (\${auction.route}). \` +
                    (highestBid ? \`Đại lý trúng thầu: \${highestBid.agentName} (\${highestBid.agentCode}), Giá thắng: \${this.formatCurrency(highestBid.priceKg)}/Kg.\` : 'Không có đại lý trúng thầu.')
            });
            return { success: true, auction: auction };
        },

        confirmPayment: function(wonId) {`
  },
  // 6. confirmPayment
  {
    target: `            saveData(data);
            return { success: true, message: \`Đã xác nhận nhận thanh toán thành công cho đơn \${wonId}! Email thông báo đã tự động gửi đến đại lý.\`, item: item };
        },

        rejectPayment: function(wonId, reason) {`,
    replacement: `            saveData(data);
            this.logActivity({
                actionCategory: 'Thanh toán',
                actionTitle: 'Xác nhận thanh toán đơn thầu',
                target: item.wonId || wonId,
                details: \`Xác nhận nhận thanh toán thành công cho đơn thắng thầu \${item.wonId} (\${item.agentName} - \${item.flightNumber}). Số tiền: \${this.formatCurrency(item.totalAmountVND || 0)}.\`
            });
            return { success: true, message: \`Đã xác nhận nhận thanh toán thành công cho đơn \${wonId}! Email thông báo đã tự động gửi đến đại lý.\`, item: item };
        },

        rejectPayment: function(wonId, reason) {`
  },
  // 7. rejectPayment
  {
    target: `            saveData(data);
            return {
                success: true,
                message: \`Đã từ chối biên lai thanh toán cho đơn \${wonId}! Email yêu cầu nộp lại biên lai đã tự động gửi đến đại lý (\${item.agentCode}).\`,
                item: item
            };
        },

        notifyPaymentSent: function(wonId, paymentDetails = {}) {`,
    replacement: `            saveData(data);
            this.logActivity({
                actionCategory: 'Thanh toán',
                actionTitle: 'Từ chối biên lai thanh toán',
                target: item.wonId || wonId,
                details: \`Từ chối biên lai thanh toán đơn thắng thầu \${item.wonId} (\${item.agentName}). Lý do: "\${rejReason}".\`
            });
            return {
                success: true,
                message: \`Đã từ chối biên lai thanh toán cho đơn \${wonId}! Email yêu cầu nộp lại biên lai đã tự động gửi đến đại lý (\${item.agentCode}).\`,
                item: item
            };
        },

        notifyPaymentSent: function(wonId, paymentDetails = {}) {`
  },
  // 8. updateCargoDeclaration
  {
    target: `            saveData(data);
            return {
                success: true,
                message: \`Đã cập nhật thông tin hàng hóa vận chuyển cho đơn \${wonId} thành công!\`,
                cargoDeclaration: item.cargoDeclaration
            };
        },

        changePassword: function(oldPassword, newPassword) {`,
    replacement: `            saveData(data);
            this.logActivity({
                actionCategory: 'Khai báo hàng hóa',
                actionTitle: 'Cập nhật Khai báo Vận đơn',
                target: item.wonId || wonId,
                details: \`Cập nhật thông tin vận đơn AWB / hàng hóa cho đơn thắng thầu \${item.wonId} (\${item.agentName}). Loại hàng: \${item.cargoDeclaration.cargoType}, Trọng lượng: \${item.cargoDeclaration.grossWeightKg} kg.\`
            });
            return {
                success: true,
                message: \`Đã cập nhật thông tin hàng hóa vận chuyển cho đơn \${wonId} thành công!\`,
                cargoDeclaration: item.cargoDeclaration
            };
        },

        changePassword: function(oldPassword, newPassword) {`
  },
  // 9. changeAdminPassword
  {
    target: `            saveData(data);
            return { success: true, message: 'Đổi mật khẩu Admin thành công! Mật khẩu mặc định/cũ đã bị vô hiệu hóa.' };
        },`,
    replacement: `            saveData(data);
            this.logActivity({
                actor: admin.fullName || admin.username,
                username: admin.username,
                role: admin.role || 'ADMIN',
                actionCategory: 'Tài khoản',
                actionTitle: 'Đổi mật khẩu Quản trị',
                target: admin.username,
                details: \`Tài khoản \${admin.role || 'ADMIN'} \${admin.fullName} (@\${admin.username}) đã thay đổi mật khẩu đăng nhập thành công.\`
            });
            return { success: true, message: 'Đổi mật khẩu Admin thành công! Mật khẩu mặc định/cũ đã bị vô hiệu hóa.' };
        },`
  },
  // 10. sendBroadcastNotification
  {
    target: `            data.notifications.unshift(newNotif);
            saveData(data);
            return { success: true, message: 'Đã phát thông báo đấu giá thành công tới các Đại lý!', notification: newNotif };
        },`,
    replacement: `            data.notifications.unshift(newNotif);
            saveData(data);
            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Phát thông báo Broadcast',
                target: notifData.targetAgentCode || 'Tất cả đại lý',
                details: \`Gửi thông báo hệ thống tới \${notifData.targetAgentCode || 'Tất cả đại lý'}: "\${notifData.title}".\`
            });
            return { success: true, message: 'Đã phát thông báo đấu giá thành công tới các Đại lý!', notification: newNotif };
        },`
  },
  // 11. toggleUserLock (Agent)
  {
    target: `                    saveData(data);
                    return {
                        success: true,
                        newStatus: target.status,
                        message: \`Đã \${isCurrentlyActive ? 'KHÓA' : 'KÍCH HOẠT / MỞ KHÓA'} tài khoản đại lý \${target.code} (\${target.companyName}).\`
                    };`,
    replacement: `                    saveData(data);
                    this.logActivity({
                        actionCategory: 'Quản lý Đại lý',
                        actionTitle: isCurrentlyActive ? 'Khóa tài khoản Đại lý' : 'Mở khóa tài khoản Đại lý',
                        target: target.code || identifier,
                        details: \`\${isCurrentlyActive ? 'Đã khóa' : 'Đã mở khóa'} tài khoản đại lý \${target.companyName} (\${target.code}). Lý do: "\${customReason || 'Thay đổi trạng thái bởi Admin'}".\`
                    });
                    return {
                        success: true,
                        newStatus: target.status,
                        message: \`Đã \${isCurrentlyActive ? 'KHÓA' : 'KÍCH HOẠT / MỞ KHÓA'} tài khoản đại lý \${target.code} (\${target.companyName}).\`
                    };`
  },
  // 12. toggleUserLock (Staff)
  {
    target: `                    saveData(data);
                    return {
                        success: true,
                        newStatus: target.status,
                        message: \`Đã \${isCurrentlyActive ? 'KHÓA' : 'KÍCH HOẠT / MỞ KHÓA'} tài khoản nhân viên "\${target.username}".\`
                    };`,
    replacement: `                    saveData(data);
                    this.logActivity({
                        actionCategory: 'Tài khoản',
                        actionTitle: isCurrentlyActive ? 'Khóa tài khoản Nhân viên' : 'Mở khóa tài khoản Nhân viên',
                        target: target.username || identifier,
                        details: \`\${isCurrentlyActive ? 'Đã khóa' : 'Đã mở khóa'} tài khoản nhân viên "\${target.username}". Lý do: "\${customReason || 'Thay đổi trạng thái bởi Admin'}".\`
                    });
                    return {
                        success: true,
                        newStatus: target.status,
                        message: \`Đã \${isCurrentlyActive ? 'KHÓA' : 'KÍCH HOẠT / MỞ KHÓA'} tài khoản nhân viên "\${target.username}".\`
                    };`
  },
  // 13. updateUserRole (Agent)
  {
    target: `                if (target) {
                    target.tier = newRole;
                    saveData(data);
                    return { success: true, message: \`Đã phân hạng đại lý \${target.code} thành \${newRole}.\` };
                }`,
    replacement: `                if (target) {
                    target.tier = newRole;
                    saveData(data);
                    this.logActivity({
                        actionCategory: 'Quản lý Đại lý',
                        actionTitle: 'Phân hạng Đại lý',
                        target: target.code || identifier,
                        details: \`Cập nhật phân hạng đại lý \${target.code} (\${target.companyName}) thành hạng [\${newRole}].\`
                    });
                    return { success: true, message: \`Đã phân hạng đại lý \${target.code} thành \${newRole}.\` };
                }`
  },
  // 14. updateUserRole (Staff)
  {
    target: `                if (target) {
                    target.role = newRole;
                    saveData(data);
                    return { success: true, message: \`Đã cập nhật vai trò cho "\${target.username}" thành \${newRole}.\` };
                }`,
    replacement: `                if (target) {
                    target.role = newRole;
                    saveData(data);
                    this.logActivity({
                        actionCategory: 'Tài khoản',
                        actionTitle: 'Phân quyền Nhân viên',
                        target: target.username || identifier,
                        details: \`Cập nhật vai trò nhân viên \${target.username} thành [\${newRole}].\`
                    });
                    return { success: true, message: \`Đã cập nhật vai trò cho "\${target.username}" thành \${newRole}.\` };
                }`
  },
  // 15. createStaffAccount
  {
    target: `            data.adminsList.push(newStaff);
            saveData(data);
            return { success: true, message: \`Đã tạo mới tài khoản nhân viên "\${u}" (\${newStaff.fullName}).\`, staff: newStaff };`,
    replacement: `            data.adminsList.push(newStaff);
            saveData(data);
            this.logActivity({
                actionCategory: 'Tài khoản',
                actionTitle: 'Tạo mới tài khoản Nhân viên',
                target: u,
                details: \`Khởi tạo tài khoản nhân viên vận hành mới: \${newStaff.fullName} (@\${u}), Phòng ban: \${newStaff.department}, Vai trò: \${newStaff.role}.\`
            });
            return { success: true, message: \`Đã tạo mới tài khoản nhân viên "\${u}" (\${newStaff.fullName}).\`, staff: newStaff };`
  },
  // 16. updateSystemSettings
  {
    target: `            saveData(data);
            return { success: true, message: 'Đã lưu cấu hình hệ thống thành công!', settings: data.settings };
        },

        getSystemSettings: function() {`,
    replacement: `            saveData(data);
            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Cập nhật tham số hệ thống',
                target: 'Cấu hình chung',
                details: \`Cập nhật các tham số vận hành hệ thống (Bước giá, Thời gian Cut-off, Thời gian thanh toán, SMTP email...).\`
            });
            return { success: true, message: 'Đã lưu cấu hình hệ thống thành công!', settings: data.settings };
        },

        getSystemSettings: function() {`
  },
  // 17. updateBankConfig
  {
    target: `            saveData(data);
            return {
                success: true,
                message: 'Đã cập nhật thông tin tài khoản ngân hàng thụ hưởng thành công!',
                bankConfig: data.bankConfig
            };
        },

        generatePaymentMemo: function(wonId, agentCode) {`,
    replacement: `            saveData(data);
            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Cập nhật ngân hàng VietQR',
                target: data.bankConfig.bankName || 'VietQR',
                details: \`Cập nhật thông tin tài khoản ngân hàng thụ hưởng: \${data.bankConfig.bankName} - STK: \${data.bankConfig.accountNumber} (\${data.bankConfig.accountName}).\`
            });
            return {
                success: true,
                message: 'Đã cập nhật thông tin tài khoản ngân hàng thụ hưởng thành công!',
                bankConfig: data.bankConfig
            };
        },

        generatePaymentMemo: function(wonId, agentCode) {`
  }
];

let updatedCount = 0;
replacements.forEach((item, index) => {
  const normTarget = item.target.replace(/\r\n/g, '\n');
  if (code.includes(normTarget)) {
    code = code.replace(normTarget, item.replacement.replace(/\r\n/g, '\n'));
    updatedCount++;
  } else {
    console.warn(`[WARN] Replacement #${index + 1} target string NOT found!`);
  }
});

fs.writeFileSync('assets/js/cargo-store.js', code.replace(/\n/g, '\r\n'), 'utf8');
console.log(`Updated ${updatedCount} / ${replacements.length} sections in cargo-store.js`);
