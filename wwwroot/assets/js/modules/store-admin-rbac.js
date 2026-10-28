/**
 * CARGO BIDDING SYSTEM - Module 7: Admin Portal, RBAC Roles/Staff, Settings, Logs & Notification Bell
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
        toggleUserLock: function (identifier, type = 'agent', customReason = '') {
            const data = loadData();
            if (data.currentAdmin && data.currentAdmin.role === 'STAFF') {
                return { success: false, message: 'Nhân viên (STAFF) không có quyền kích hoạt hoặc khóa tài khoản. Thao tác này chỉ dành cho Quản trị viên (ADMIN).' };
            }

            if (type === 'agent') {
                const target = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === (identifier || '').toUpperCase());
                if (target) {
                    const isCurrentlyActive = !(target.status === 'Đã khóa' || target.status === 'LOCKED' || target.isLocked);
                    if (isCurrentlyActive) {
                        target.status = 'Đã khóa';
                        target.lockedReason = customReason || 'Quản trị viên chủ động khóa tài khoản';
                        target.lockedAt = new Date().toLocaleString('vi-VN');
                        delete target.unlockedReason;
                        delete target.unlockedAt;
                        // If locking and target is currently logged in, clear currentUser session immediately!
                        if (data.currentUser) {
                            const currentCode = (data.currentUser.agentCode || data.currentUser.code || '').toUpperCase();
                            if (currentCode === (target.code || '').toUpperCase() || data.currentUser.id == target.id) {
                                data.currentUser = null;
                            }
                        }
                    } else {
                        target.status = 'Đang hoạt động';
                        target.isLocked = false;
                        target.failedLoginAttempts = 0;
                        target.unlockedAt = new Date().toLocaleString('vi-VN');
                        target.unlockedBy = data.currentAdmin ? (data.currentAdmin.username || 'ADMIN') : 'ADMIN';
                        target.unlockedReason = customReason || 'Ban Điều hành đã xác minh và chấp thuận mở lại tài khoản hoạt động bình thường';
                        delete target.lockedReason;
                        delete target.lockedAt;

                        // Waive old expired auction penalties so system doesn't immediately re-lock
                        // Also mark expired unpaid orders as PAID_LATE so they no longer appear in "cần thanh toán"
                        const unlockTime = new Date().toLocaleString('vi-VN');
                        (data.wonAuctions || []).forEach(w => {
                            if ((w.agentCode || '').toUpperCase() === (target.code || '').toUpperCase()) {
                                w.lockPenaltyHandled = true;
                                w.lockWaivedByAdmin = true;
                                // If this order was expired and unpaid, mark it as PAID_LATE (supplementary payment)
                                const isExpired = CargoStore.isWonAuctionExpired ? CargoStore.isWonAuctionExpired(w) : false;
                                if (isExpired && w.paymentStatus !== 'PAID') {
                                    w.paymentStatus = 'PAID_LATE';
                                    w.paidAt = unlockTime;
                                    w.paidLateNote = `Đại lý nộp bổ sung sau quá hạn – Được Ban Điều hành chấp thuận mở khóa lúc ${unlockTime}`;
                                }
                            }
                        });

                        // Push official UNLOCK Notification to agent
                        if (!data.notifications) data.notifications = [];
                        data.notifications.unshift({
                            id: Date.now() + Math.floor(Math.random() * 1000),
                            timestamp: Date.now(),
                            targetAgentCode: target.code,
                            title: `🔓 TÀI KHOẢN ĐÃ ĐƯỢC MỞ KHÓA KÍCH HOẠT`,
                            message: `Tài khoản đại lý ${target.code} (${target.companyName}) của bạn đã được Quản trị viên MỞ KHÓA. Lý do mở khóa: "${target.unlockedReason}". Quyền tham gia đấu giá trên sàn đã được khôi phục.`,
                            time: 'Vừa xong',
                            type: 'SYSTEM',
                            read: false,
                            link: '02-Dashboard.html'
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
                    if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                        fetch('/api/agents/lock', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ code: target.code, locked: isCurrentlyActive, reason: customReason || '' })
                        }).then(() => { lastLocalSaveTimestamp = 0; return syncWithServer(true); }).catch(() => { });
                    }
                    this.logActivity({
                        actionCategory: 'Quản lý Đại lý',
                        actionTitle: isCurrentlyActive ? 'Khóa tài khoản Đại lý' : 'Mở khóa tài khoản Đại lý',
                        target: target.code || identifier,
                        details: `${isCurrentlyActive ? 'Đã khóa' : 'Đã mở khóa'} tài khoản đại lý ${target.companyName} (${target.code}). Lý do: "${customReason || 'Thay đổi trạng thái bởi Admin'}".`
                    });
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
                        target.lockedReason = customReason || 'Quản trị viên chủ động khóa tài khoản';
                        target.lockedAt = new Date().toLocaleString('vi-VN');
                        delete target.unlockedReason;
                        delete target.unlockedAt;
                        // If locking and target staff is currently logged in, clear currentAdmin session immediately!
                        if (data.currentAdmin) {
                            const currentUsername = (data.currentAdmin.username || '').toLowerCase();
                            if (currentUsername === (target.username || '').toLowerCase() || data.currentAdmin.id == target.id) {
                                data.currentAdmin = null;
                            }
                        }
                    } else {
                        target.status = 'Đang hoạt động';
                        target.unlockedAt = new Date().toLocaleString('vi-VN');
                        target.unlockedReason = customReason || 'Quản trị viên kích hoạt mở khóa tài khoản nhân sự';
                        delete target.lockedReason;
                        delete target.lockedAt;
                    }

                    saveData(data);
                    this.logActivity({
                        actionCategory: 'Tài khoản',
                        actionTitle: isCurrentlyActive ? 'Khóa tài khoản Nhân viên' : 'Mở khóa tài khoản Nhân viên',
                        target: target.username || identifier,
                        details: `${isCurrentlyActive ? 'Đã khóa' : 'Đã mở khóa'} tài khoản nhân viên "${target.username}". Lý do: "${customReason || 'Thay đổi trạng thái bởi Admin'}".`
                    });
                    return {
                        success: true,
                        newStatus: target.status,
                        message: `Đã ${isCurrentlyActive ? 'KHÓA' : 'KÍCH HOẠT / MỞ KHÓA'} tài khoản nhân viên "${target.username}".`
                    };
                }
            }

            return { success: false, message: 'Không tìm thấy người dùng trong hệ thống.' };
        },

        getRoles: function () {
            const data = loadData();
            if (!data.rolesList || !Array.isArray(data.rolesList) || data.rolesList.length === 0) {
                data.rolesList = JSON.parse(JSON.stringify(seedRoles));
                saveData(data);
            }
            return data.rolesList;
        },

        getRoleById: function (id) {
            const roles = this.getRoles();
            return roles.find(r => r.id === id || r.code === id) || null;
        },

        createRole: function (roleData) {
            const data = loadData();
            if (!this.hasPermission('staff.edit')) {
                return { success: false, message: 'Bạn không có quyền thẩm quyền tạo vai trò mới (yêu cầu quyền staff.edit).' };
            }
            if (!data.rolesList) data.rolesList = JSON.parse(JSON.stringify(seedRoles));
            const name = (roleData.name || '').trim();
            if (!name) return { success: false, message: 'Tên vai trò không được để trống.' };

            const code = (roleData.code || name.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "_")).replace(/_+/g, "_");
            const exists = data.rolesList.some(r => (r.name || '').toLowerCase() === name.toLowerCase() || (r.code || '').toLowerCase() === code.toLowerCase());
            if (exists) {
                return { success: false, message: `Vai trò "${name}" hoặc mã "${code}" đã tồn tại trên hệ thống.` };
            }

            const permissions = Array.isArray(roleData.permissions) ? roleData.permissions.filter(p => ALL_PERMISSION_KEYS.includes(p)) : [];

            const newRole = {
                id: 'role_' + Date.now(),
                code: code,
                name: name,
                description: (roleData.description || '').trim() || `Vai trò ${name}`,
                permissions: permissions,
                isSystem: false,
                createdAt: new Date().toISOString()
            };

            data.rolesList.push(newRole);
            saveData(data);
            this.logActivity({
                actionCategory: 'Phân quyền',
                actionTitle: 'Tạo vai trò mới',
                target: newRole.name,
                details: `Đã tạo vai trò mới [${newRole.name}] (${newRole.code}) với ${permissions.length} quyền hạn: [${permissions.join(', ')}]`
            });
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cargostore_updated'));
            return { success: true, message: `Đã tạo vai trò mới "${newRole.name}" thành công!`, role: newRole };
        },

        updateRole: function (id, roleData) {
            const data = loadData();
            if (!this.hasPermission('staff.edit')) {
                return { success: false, message: 'Bạn không có quyền chỉnh sửa vai trò (yêu cầu quyền staff.edit).' };
            }
            if (!data.rolesList) data.rolesList = JSON.parse(JSON.stringify(seedRoles));
            const role = data.rolesList.find(r => r.id === id || r.code === id);
            if (!role) {
                return { success: false, message: 'Không tìm thấy vai trò cần cập nhật.' };
            }

            if (role.isSystem && (role.code === 'SUPER_ADMIN' || role.id === 'role_super_admin')) {
                return { success: false, message: 'Không thể chỉnh sửa vai trò Super Admin mặc định của hệ thống!' };
            }

            const name = (roleData.name || '').trim();
            if (name) role.name = name;
            if (roleData.description !== undefined) role.description = roleData.description.trim();
            if (Array.isArray(roleData.permissions)) {
                role.permissions = roleData.permissions.filter(p => ALL_PERMISSION_KEYS.includes(p));
            }
            role.updatedAt = new Date().toISOString();

            saveData(data);
            this.logActivity({
                actionCategory: 'Phân quyền',
                actionTitle: 'Cập nhật vai trò',
                target: role.name,
                details: `Cập nhật vai trò [${role.name}] (${role.code}). Tổng số quyền hạn: ${role.permissions.length}`
            });
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cargostore_updated'));
            return { success: true, message: `Đã cập nhật vai trò "${role.name}" thành công!`, role: role };
        },

        deleteRole: function (id) {
            const data = loadData();
            if (!this.hasPermission('staff.remove')) {
                return { success: false, message: 'Bạn không có quyền xóa vai trò (yêu cầu quyền staff.remove).' };
            }
            if (!data.rolesList) data.rolesList = JSON.parse(JSON.stringify(seedRoles));
            const idx = data.rolesList.findIndex(r => r.id === id || r.code === id);
            if (idx === -1) {
                return { success: false, message: 'Không tìm thấy vai trò cần xóa.' };
            }
            const role = data.rolesList[idx];
            if (role.isSystem) {
                return { success: false, message: `Vai trò "${role.name}" là vai trò hệ thống, không thể xóa!` };
            }

            // Verify if any admin/staff member is currently using this role
            const inUseBy = (data.adminsList || []).filter(a => {
                const roles = (Array.isArray(a.roles) ? a.roles : [a.role]).map(r => String(r || '').toUpperCase());
                return roles.includes(String(role.id).toUpperCase()) || roles.includes(String(role.code).toUpperCase()) || roles.includes(String(role.name).toUpperCase());
            });

            if (inUseBy.length > 0) {
                const names = inUseBy.map(a => a.fullName || a.username).join(', ');
                return {
                    success: false,
                    message: `Không thể xóa vai trò "${role.name}" vì đang có ${inUseBy.length} nhân sự đảm nhiệm (${names}). Vui lòng gỡ vai trò này khỏi nhân sự trước khi xóa.`
                };
            }

            data.rolesList.splice(idx, 1);
            saveData(data);
            this.logActivity({
                actionCategory: 'Phân quyền',
                actionTitle: 'Xóa vai trò',
                target: role.name,
                details: `Đã xóa vai trò [${role.name}] khỏi hệ thống.`
            });
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cargostore_updated'));
            return { success: true, message: `Đã xóa vai trò "${role.name}" thành công!` };
        },

        updateUserRole: function (identifier, newRole, type = 'agent') {
            const data = loadData();

            if (type === 'staff') {
                if (!this.hasPermission('staff.edit')) {
                    return { success: false, message: 'Bạn không có thẩm quyền phân quyền vai trò cho nhân sự (yêu cầu quyền staff.edit).' };
                }
            } else if (!this.hasPermission('agents.lock') && !this.hasPermission('staff.edit')) {
                return { success: false, message: 'Bạn không có quyền thay đổi phân hạng đại lý.' };
            }

            if (type === 'agent') {
                const target = (data.agentsList || []).find(a => (a.code || '').toUpperCase() === (identifier || '').toUpperCase());
                if (target) {
                    target.tier = newRole;
                    saveData(data);
                    this.logActivity({
                        actionCategory: 'Quản lý Đại lý',
                        actionTitle: 'Phân hạng Đại lý',
                        target: target.code || identifier,
                        details: `Cập nhật phân hạng đại lý ${target.code} (${target.companyName}) thành hạng [${newRole}].`
                    });
                    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cargostore_updated'));
                    return { success: true, message: `Đã phân hạng đại lý ${target.code} thành ${newRole}.` };
                }
            } else {
                const target = (data.adminsList || []).find(a => (a.username || '').toLowerCase() === (identifier || '').toLowerCase());
                if (target) {
                    let rolesArr = [];
                    if (Array.isArray(newRole)) {
                        rolesArr = newRole.map(r => String(r).trim()).filter(Boolean);
                    } else if (typeof newRole === 'string' && newRole.includes(',')) {
                        rolesArr = newRole.split(',').map(r => r.trim()).filter(Boolean);
                    } else if (newRole) {
                        rolesArr = [String(newRole).trim()];
                    }
                    if (rolesArr.length === 0) rolesArr = ['OPERATIONS_VIEWER'];

                    target.roles = rolesArr;
                    target.role = rolesArr[0]; // primary role for backwards compatibility

                    // If this is currently logged in admin, update data.currentAdmin too
                    if (data.currentAdmin && (data.currentAdmin.username || '').toLowerCase() === target.username.toLowerCase()) {
                        data.currentAdmin.roles = target.roles;
                        data.currentAdmin.role = target.role;
                    }

                    saveData(data);
                    this.logActivity({
                        actionCategory: 'Tài khoản',
                        actionTitle: 'Phân quyền Nhân viên',
                        target: target.username || identifier,
                        details: `Cập nhật vai trò nhân viên ${target.username} thành [${rolesArr.join(', ')}].`
                    });

                    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cargostore_updated'));
                    return { success: true, message: `Đã cập nhật các vai trò cho "${target.username}" thành: [${rolesArr.join(', ')}].` };
                }
            }
            return { success: false, message: 'Không tìm thấy người dùng trong hệ thống.' };
        },

        createStaffAccount: function (staffData) {
            const data = loadData();
            if (!this.hasPermission('staff.create')) {
                return { success: false, message: 'Bạn không có quyền cấp mới tài khoản nhân sự (yêu cầu quyền staff.create).' };
            }

            if (!data.adminsList) data.adminsList = seedAdmins;

            const u = (staffData.username || '').trim().toLowerCase();
            if (!u) return { success: false, message: 'Tên đăng nhập không được để trống.' };

            const exists = data.adminsList.some(a => (a.username || '').toLowerCase() === u);
            if (exists) return { success: false, message: `Tài khoản "${u}" đã tồn tại trên hệ thống.` };

            let rolesArr = [];
            if (Array.isArray(staffData.roles) && staffData.roles.length > 0) {
                rolesArr = staffData.roles.map(r => String(r).trim());
            } else if (staffData.role) {
                rolesArr = [String(staffData.role).trim()];
            } else {
                rolesArr = ['OPERATIONS_VIEWER'];
            }

            const newStaff = {
                id: Date.now(),
                username: u,
                password: staffData.password || 'staff2026',
                role: rolesArr[0],
                roles: rolesArr,
                fullName: staffData.fullName || 'Nhân viên Điều hành',
                email: staffData.email || `${u}@airline.vn`,
                department: staffData.department || 'Air Cargo Flight Operations',
                status: 'Đang hoạt động'
            };

            data.adminsList.push(newStaff);
            saveData(data);
            this.logActivity({
                actionCategory: 'Tài khoản',
                actionTitle: 'Tạo mới tài khoản Nhân viên',
                target: u,
                details: `Khởi tạo tài khoản nhân viên mới: ${newStaff.fullName} (@${u}), Phòng ban: ${newStaff.department}, Vai trò: [${rolesArr.join(', ')}].`
            });
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cargostore_updated'));
            return { success: true, message: `Đã tạo mới tài khoản "${u}" (${newStaff.fullName}) với vai trò [${rolesArr.join(', ')}].`, staff: newStaff };
        },

        updateStaffAccount: function (idOrUsername, updateData) {
            const data = loadData();
            if (!this.hasPermission('staff.edit')) {
                return { success: false, message: 'Bạn không có quyền chỉnh sửa thông tin nhân viên (yêu cầu quyền staff.edit).' };
            }
            if (!data.adminsList) data.adminsList = seedAdmins;
            const staff = data.adminsList.find(a => 
                (a.id && String(a.id) === String(idOrUsername)) || 
                (a.username && a.username.toLowerCase() === String(idOrUsername).toLowerCase())
            );
            if (!staff) {
                return { success: false, message: 'Không tìm thấy tài khoản nhân viên.' };
            }

            if (updateData.fullName) staff.fullName = updateData.fullName.trim();
            if (updateData.email) staff.email = updateData.email.trim();
            if (updateData.department) staff.department = updateData.department.trim();
            if (updateData.password) staff.password = updateData.password.trim();
            if (updateData.status) staff.status = updateData.status;

            if (updateData.roles) {
                staff.roles = Array.isArray(updateData.roles) ? updateData.roles : [updateData.roles];
                staff.role = staff.roles[0] || 'OPERATIONS_VIEWER';
            } else if (updateData.role) {
                staff.role = updateData.role;
                staff.roles = [updateData.role];
            }

            if (data.currentAdmin && data.currentAdmin.username.toLowerCase() === staff.username.toLowerCase()) {
                data.currentAdmin.fullName = staff.fullName;
                data.currentAdmin.roles = staff.roles;
                data.currentAdmin.role = staff.role;
                data.currentAdmin.department = staff.department;
            }

            saveData(data);
            this.logActivity({
                actionCategory: 'Tài khoản',
                actionTitle: 'Cập nhật tài khoản Nhân viên',
                target: staff.username,
                details: `Cập nhật tài khoản ${staff.fullName} (@${staff.username}). Vai trò: [${(staff.roles || []).join(', ')}]`
            });
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cargostore_updated'));
            return { success: true, message: `Cập nhật thông tin tài khoản "${staff.username}" thành công!` };
        },

        deleteStaffAccount: function (idOrUsername) {
            const data = loadData();
            if (!this.hasPermission('staff.remove')) {
                return { success: false, message: 'Bạn không có quyền xóa tài khoản nhân sự (yêu cầu quyền staff.remove).' };
            }
            if (!data.adminsList) data.adminsList = seedAdmins;
            const targetIdx = data.adminsList.findIndex(a => 
                (a.id && String(a.id) === String(idOrUsername)) || 
                (a.username && a.username.toLowerCase() === String(idOrUsername).toLowerCase())
            );
            if (targetIdx === -1) {
                return { success: false, message: 'Không tìm thấy tài khoản nhân sự cần xóa.' };
            }
            const target = data.adminsList[targetIdx];
            if (target.username && target.username.toLowerCase() === 'admin') {
                return { success: false, message: 'Không thể xóa tài khoản Quản trị viên tối cao (admin)!' };
            }
            if (data.currentAdmin && data.currentAdmin.username.toLowerCase() === target.username.toLowerCase()) {
                return { success: false, message: 'Không thể tự xóa tài khoản của chính mình khi đang đăng nhập!' };
            }

            data.adminsList.splice(targetIdx, 1);
            saveData(data);
            this.logActivity({
                actionCategory: 'Tài khoản',
                actionTitle: 'Xóa tài khoản Nhân viên',
                target: target.username,
                details: `Đã xóa tài khoản nhân sự ${target.fullName} (@${target.username}) khỏi hệ thống.`
            });
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cargostore_updated'));
            return { success: true, message: `Đã xóa tài khoản "${target.username}" thành công!` };
        },

        updateSystemSettings: function (settingsData) {
            const data = loadData();
            const currentAdminRole = (data.currentAdmin && data.currentAdmin.role || '').toUpperCase();
            const isSuperAdmin = (currentAdminRole === 'SUPER_ADMIN' || currentAdminRole === 'ITD_ADMIN' || currentAdminRole === 'ADMIN' || (data.currentAdmin && (data.currentAdmin.username || '').toLowerCase() === 'admin'));

            if (!isSuperAdmin) {
                return { success: false, message: 'Chỉ Quản trị viên Super Admin mới có quyền thay đổi Cấu hình hệ thống (Settings).' };
            }

            if (!data.settings) data.settings = {};

            if (settingsData.minIncrement) data.settings.minIncrement = Number(settingsData.minIncrement);
            if (settingsData.cutoffHours) data.settings.cutoffHours = Number(settingsData.cutoffHours);
            if (settingsData.paymentWindowHours) data.settings.paymentWindowHours = Number(settingsData.paymentWindowHours);
            if (settingsData.reviewWindowMinutes !== undefined) data.settings.reviewWindowMinutes = Math.max(1, Number(settingsData.reviewWindowMinutes) || 15);
            if (settingsData.hotline) data.settings.hotline = settingsData.hotline;
            if (settingsData.supportEmail) data.settings.supportEmail = settingsData.supportEmail;
            if (settingsData.platformFee) data.settings.platformFee = Number(settingsData.platformFee);
            if (settingsData.hideAgentCredentials !== undefined) {
                data.settings.hideAgentCredentials = Boolean(settingsData.hideAgentCredentials);
            }
            if (settingsData.hideCloseAuctionBtn !== undefined) {
                data.settings.hideCloseAuctionBtn = Boolean(settingsData.hideCloseAuctionBtn);
            }
            if (settingsData.autoCloseOnBid !== undefined) {
                data.settings.autoCloseOnBid = Boolean(settingsData.autoCloseOnBid);
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
            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Cập nhật tham số hệ thống',
                target: 'Cấu hình chung',
                details: `Cập nhật các tham số vận hành hệ thống (Bước giá, Thời gian Cut-off, Thời gian thanh toán, SMTP email...).`
            });
            return { success: true, message: 'Đã lưu cấu hình hệ thống thành công!', settings: data.settings };
        },

        getSystemSettings: function () {
            return loadData().settings || defaultData.settings;
        },

        // ==========================================
        // AIRPORT CONFIGURATION (Mã & Tên Sân bay)
        // ==========================================
        getAirports: function () {
            const data = loadData();
            return (data.airports && Array.isArray(data.airports)) ? [...data.airports] : [];
        },
        addAirport: function (code, name) {
            if (!code || !name) return { success: false, message: 'Mã và tên sân bay không được để trống.' };
            const cleanCode = String(code).trim().toUpperCase();
            const cleanName = String(name).trim();
            const data = loadData();
            if (!data.airports) data.airports = [];
            if (data.airports.some(a => (a.code || '').toUpperCase() === cleanCode)) {
                return { success: false, message: `Mã sân bay "${cleanCode}" đã tồn tại trên hệ thống!` };
            }
            data.airports.push({ code: cleanCode, name: cleanName });
            saveData(data);
            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Thêm sân bay mới',
                target: `Sân bay ${cleanCode}`,
                details: `Đã thêm sân bay ${cleanCode} - ${cleanName} vào danh mục.`
            });
            return { success: true, message: `Đã thêm sân bay ${cleanCode} (${cleanName}) thành công!` };
        },
        updateAirport: function (oldCode, newCode, name) {
            if (!oldCode || !newCode || !name) return { success: false, message: 'Thông tin sân bay không hợp lệ.' };
            const cleanOld = String(oldCode).trim().toUpperCase();
            const cleanNew = String(newCode).trim().toUpperCase();
            const cleanName = String(name).trim();
            const data = loadData();
            if (!data.airports) return { success: false, message: 'Không tìm thấy danh sách sân bay.' };
            const idx = data.airports.findIndex(a => (a.code || '').toUpperCase() === cleanOld);
            if (idx === -1) return { success: false, message: 'Không tìm thấy sân bay cần cập nhật.' };
            if (cleanNew !== cleanOld && data.airports.some(a => (a.code || '').toUpperCase() === cleanNew)) {
                return { success: false, message: `Mã sân bay "${cleanNew}" đã bị trùng với sân bay khác!` };
            }
            data.airports[idx] = { code: cleanNew, name: cleanName };
            saveData(data);
            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Cập nhật sân bay',
                target: `Sân bay ${cleanNew}`,
                details: `Cập nhật thông tin sân bay ${cleanOld} thành ${cleanNew} - ${cleanName}.`
            });
            return { success: true, message: `Đã cập nhật sân bay ${cleanNew} thành công!` };
        },
        deleteAirport: function (code) {
            const cleanCode = String(code).trim().toUpperCase();
            const data = loadData();
            if (!data.airports) return { success: false, message: 'Danh sách sân bay trống.' };
            const origLen = data.airports.length;
            data.airports = data.airports.filter(a => (a.code || '').toUpperCase() !== cleanCode);
            if (data.airports.length === origLen) {
                return { success: false, message: `Không tìm thấy sân bay "${cleanCode}".` };
            }
            saveData(data);
            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Xóa sân bay',
                target: `Sân bay ${cleanCode}`,
                details: `Đã xóa sân bay ${cleanCode} khỏi danh mục.`
            });
            return { success: true, message: `Đã xóa sân bay ${cleanCode} thành công!` };
        },
        getAirportName: function (code) {
            if (!code) return '';
            const clean = String(code).trim().toUpperCase();
            const list = this.getAirports();
            const found = list.find(a => (a.code || '').toUpperCase() === clean);
            return found ? found.name : clean;
        },
        getAirportCity: function (code) {
            if (!code) return '';
            const clean = String(code).trim().toUpperCase();
            const cityMap = {
                'SGN': 'Sài Gòn',
                'HAN': 'Hà Nội',
                'DAD': 'Đà Nẵng',
                'PQC': 'Phú Quốc',
                'CXR': 'Cam Ranh',
                'DLI': 'Đà Lạt',
                'HPH': 'Hải Phòng',
                'HUI': 'Huế',
                'UIH': 'Quy Nhơn',
                'VCA': 'Cần Thơ',
                'VII': 'Vinh',
                'VDO': 'Vân Đồn'
            };
            if (cityMap[clean]) return cityMap[clean];
            const name = this.getAirportName(clean);
            if (name && name !== clean) {
                return name.replace(/\s+(International\s+)?Airport$/i, '').trim();
            }
            return clean;
        },
        formatRouteDisplay: function (origin, dest) {
            const o = (origin || '').trim().toUpperCase();
            const d = (dest || '').trim().toUpperCase();
            if (!o || !d) return '';
            const c1 = this.getAirportCity(o);
            const c2 = this.getAirportCity(d);
            return `${o} - ${d} (${c1} - ${c2})`;
        },

        // ==========================================
        // AIRCRAFT TYPES CONFIGURATION (msg_AcType)
        // ==========================================
        getAircraftTypes: function () {
            const data = loadData();
            return (data.aircraftTypes && Array.isArray(data.aircraftTypes)) ? [...data.aircraftTypes] : [];
        },
        addAircraftType: function (code, name) {
            if (!code || !name) return { success: false, message: 'Mã và tên loại tàu bay không được để trống.' };
            const cleanCode = String(code).trim().toUpperCase();
            const cleanName = String(name).trim();
            const data = loadData();
            if (!data.aircraftTypes) data.aircraftTypes = [];
            if (data.aircraftTypes.some(a => (a.code || '').toUpperCase() === cleanCode)) {
                return { success: false, message: `Mã loại tàu bay "${cleanCode}" đã tồn tại trên hệ thống!` };
            }
            data.aircraftTypes.push({ code: cleanCode, name: cleanName });
            saveData(data);
            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Thêm loại tàu bay mới',
                target: `Tàu bay ${cleanCode}`,
                details: `Đã thêm loại tàu bay ${cleanCode} - ${cleanName} vào danh mục.`
            });
            return { success: true, message: `Đã thêm loại tàu bay ${cleanCode} (${cleanName}) thành công!` };
        },
        updateAircraftType: function (oldCode, newCode, name) {
            if (!oldCode || !newCode || !name) return { success: false, message: 'Thông tin loại tàu bay không hợp lệ.' };
            const cleanOld = String(oldCode).trim().toUpperCase();
            const cleanNew = String(newCode).trim().toUpperCase();
            const cleanName = String(name).trim();
            const data = loadData();
            if (!data.aircraftTypes) return { success: false, message: 'Không tìm thấy danh sách loại tàu bay.' };
            const idx = data.aircraftTypes.findIndex(a => (a.code || '').toUpperCase() === cleanOld);
            if (idx === -1) return { success: false, message: 'Không tìm thấy loại tàu bay cần cập nhật.' };
            if (cleanNew !== cleanOld && data.aircraftTypes.some(a => (a.code || '').toUpperCase() === cleanNew)) {
                return { success: false, message: `Mã loại tàu bay "${cleanNew}" đã bị trùng!` };
            }
            data.aircraftTypes[idx] = { code: cleanNew, name: cleanName };
            saveData(data);
            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Cập nhật loại tàu bay',
                target: `Tàu bay ${cleanNew}`,
                details: `Cập nhật loại tàu bay ${cleanOld} thành ${cleanNew} - ${cleanName}.`
            });
            return { success: true, message: `Đã cập nhật loại tàu bay ${cleanNew} thành công!` };
        },
        deleteAircraftType: function (code) {
            const cleanCode = String(code).trim().toUpperCase();
            const data = loadData();
            if (!data.aircraftTypes) return { success: false, message: 'Danh sách loại tàu bay trống.' };
            const origLen = data.aircraftTypes.length;
            data.aircraftTypes = data.aircraftTypes.filter(a => (a.code || '').toUpperCase() !== cleanCode);
            if (data.aircraftTypes.length === origLen) {
                return { success: false, message: `Không tìm thấy loại tàu bay "${cleanCode}".` };
            }
            saveData(data);
            this.logActivity({
                actionCategory: 'Cấu hình hệ thống',
                actionTitle: 'Xóa loại tàu bay',
                target: `Tàu bay ${cleanCode}`,
                details: `Đã xóa loại tàu bay ${cleanCode} khỏi danh mục.`
            });
            return { success: true, message: `Đã xóa loại tàu bay ${cleanCode} thành công!` };
        },
        getAircraftTypeName: function (code) {
            if (!code) return '';
            const clean = String(code).trim().toUpperCase();
            const list = this.getAircraftTypes();
            const found = list.find(a => (a.code || '').toUpperCase() === clean);
            return found ? found.name : clean;
        },

        logActivity: function (logInfo) {
            const data = loadData();
            if (!data.activityLogs) data.activityLogs = defaultData.activityLogs || [];

            const currentAdmin = data.currentAdmin || { username: 'admin', fullName: 'Trần Quản Trị', role: 'ADMIN' };
            const currentUser = data.currentUser || null;

            const pathname = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '';
            const isAdminPage = pathname.includes('/Admin/') || pathname.includes('/admin/');
            const isAdminAction = logInfo && (
                logInfo.actionCategory === 'Quản lý Đại lý' ||
                logInfo.actionCategory === 'Cấu hình' ||
                (logInfo.actionTitle && (
                    logInfo.actionTitle.includes('Chốt thầu') ||
                    logInfo.actionTitle.includes('Đóng phiên') ||
                    logInfo.actionTitle.includes('Hủy phiên') ||
                    logInfo.actionTitle.includes('Tạo phiên') ||
                    logInfo.actionTitle.includes('Duyệt') ||
                    logInfo.actionTitle.includes('Khóa tài khoản')
                ))
            );

            let defaultActor = currentAdmin.fullName || currentAdmin.username || 'Ban Điều Hành';
            let defaultUsername = currentAdmin.username || 'admin';
            let defaultRole = currentAdmin.role || 'ADMIN';

            if (!isAdminPage && !isAdminAction && currentUser && (currentUser.role === 'AGENT' || currentUser.agentCode || currentUser.code)) {
                defaultActor = currentUser.companyName || currentUser.fullName || currentUser.agentName || currentUser.username || 'Đại lý';
                defaultUsername = currentUser.agentCode || currentUser.code || currentUser.username || 'agent';
                defaultRole = currentUser.role || 'AGENT';
            }

            const now = new Date();
            const pad = n => String(n).padStart(2, '0');
            const timestampStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

            const newLog = {
                id: Date.now() + Math.floor(Math.random() * 1000),
                timestamp: timestampStr,
                rawTime: now.getTime(),
                actor: logInfo.actor || defaultActor,
                username: logInfo.username || defaultUsername,
                role: logInfo.role || defaultRole,
                actionCategory: logInfo.actionCategory || 'Khác',
                actionTitle: logInfo.actionTitle || 'Thao tác hệ thống',
                target: logInfo.target || 'N/A',
                details: logInfo.details || '',
                ip: logInfo.ip || '113.161.42.12',
                device: (typeof navigator !== 'undefined' && navigator.userAgent)
                    ? (navigator.userAgent.includes('Windows') ? 'Windows Chrome' : 'Web Browser')
                    : 'Server ASP.NET Core'
            };

            const isOnline = typeof window !== 'undefined' && window.location &&
                window.location.protocol && window.location.protocol.startsWith('http');

            // Always keep recent logs in local data so client pages immediately display them
            data.activityLogs.unshift(newLog);
            if (data.activityLogs.length > 1000) {
                data.activityLogs = data.activityLogs.slice(0, 1000);
            }
            saveData(data, true); // true = skipServerSync so we don't trigger a duplicate bulk push

            if (isOnline) {
                const payload = JSON.stringify(newLog);
                if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
                    const blob = new Blob([payload], { type: 'application/json' });
                    navigator.sendBeacon('/api/logs', blob);
                } else if (typeof fetch !== 'undefined') {
                    fetch('/api/logs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: payload
                    }).catch(() => { });
                }
            }

            return newLog;
        },


        getActivityLogs: function (filters = {}) {
            const data = loadData();
            let logs = data.activityLogs || defaultData.activityLogs || [];

            if (filters.role && filters.role !== 'ALL') {
                logs = logs.filter(l => (l.role || '').toUpperCase() === filters.role.toUpperCase());
            }

            if (filters.category && filters.category !== 'ALL') {
                logs = logs.filter(l => (l.actionCategory || '') === filters.category);
            }

            if (filters.search) {
                const q = filters.search.toLowerCase().trim();
                logs = logs.filter(l =>
                    (l.actor || '').toLowerCase().includes(q) ||
                    (l.username || '').toLowerCase().includes(q) ||
                    (l.actionTitle || '').toLowerCase().includes(q) ||
                    (l.target || '').toLowerCase().includes(q) ||
                    (l.details || '').toLowerCase().includes(q) ||
                    (l.ip || '').includes(q)
                );
            }

            return logs;
        },

        clearActivityLogs: function () {
            const data = loadData();
            const currentAdminRole = (data.currentAdmin && data.currentAdmin.role || '').toUpperCase();
            const isSuperAdmin = (currentAdminRole === 'SUPER_ADMIN' || currentAdminRole === 'ITD_ADMIN' || currentAdminRole === 'ADMIN' || (data.currentAdmin && (data.currentAdmin.username || '').toLowerCase() === 'admin'));
            if (!isSuperAdmin) {
                return { success: false, message: 'Chỉ Quản trị viên Super Admin mới có quyền xóa nhật ký hệ thống.' };
            }
            data.activityLogs = [];
            saveData(data);
            return { success: true, message: 'Đã xóa toàn bộ nhật ký hoạt động hệ thống.' };
        },

        getCargoDocumentInfo: function (cargoType = '') {
            const val = String(cargoType || '').trim();
            const lower = val.toLowerCase();

            const isDgr = val.includes('DGR') || lower.includes('nguy hiểm');
            const isVal = val.includes('VAL') || lower.includes('giá trị cao') || lower.includes('linh kiện') || lower.includes('điện tử');
            const isPilMed = val.includes('PIL') || val.includes('MED') || lower.includes('dược phẩm') || lower.includes('y tế');
            const isPerAvi = val.includes('PER') || val.includes('AVI') || lower.includes('thực phẩm') || lower.includes('tươi sống') || lower.includes('hải sản') || lower.includes('nông sản');
            const isGoh = val.includes('GOH') || lower.includes('may mặc') || lower.includes('dệt may');

            if (isDgr) {
                return {
                    isRequired: true,
                    type: 'DGR',
                    title: 'Chứng từ an toàn hàng nguy hiểm / MSDS',
                    badge: 'MSDS / DGR Cert',
                    iconClass: 'fa-solid fa-triangle-exclamation text-amber-600',
                    desc: 'Hàng nguy hiểm yêu cầu bắt buộc phải có <strong>Phiếu an toàn hóa chất (MSDS)</strong> & <strong>Chứng chỉ DGR còn hiệu lực</strong> theo quy định an toàn hàng không ICAO/IATA.',
                    promptTitle: 'Tải lên chứng từ an toàn DGR / MSDS',
                    errorMsg: '<i class="fa-solid fa-circle-exclamation"></i> Vui lòng chọn và tải lên chứng từ an toàn DGR / MSDS!',
                    adminLabel: 'Chứng từ an toàn hàng nguy hiểm (DGR / MSDS):'
                };
            } else if (isVal) {
                return {
                    isRequired: true,
                    type: 'VAL',
                    title: 'Bảo hiểm hàng hóa & Declared Value Certificate',
                    badge: 'Bảo hiểm / Valuation Cert',
                    iconClass: 'fa-solid fa-shield-halved text-blue-600',
                    desc: 'Hàng linh kiện điện tử và hàng giá trị cao (VAL) yêu cầu bắt buộc phải đính kèm <strong>Hợp đồng/Giấy chứng nhận Bảo hiểm hàng hóa</strong> hoặc <strong>Giấy khai báo giá trị hàng hóa (Declared Value)</strong> theo quy định IATA.',
                    promptTitle: 'Tải lên Hợp đồng Bảo hiểm hàng hóa / Giấy khai báo giá trị (VAL)',
                    errorMsg: '<i class="fa-solid fa-circle-exclamation"></i> Vui lòng chọn và tải lên Hợp đồng Bảo hiểm hàng hóa hoặc Giấy khai báo giá trị (VAL)!',
                    adminLabel: 'Hợp đồng Bảo hiểm hàng hóa & Declared Value (VAL):'
                };
            } else if (isPilMed) {
                return {
                    isRequired: true,
                    type: 'PIL_MED',
                    title: 'Giấy phép nhập khẩu & Chứng nhận GDP/GSP Dược phẩm',
                    badge: 'Giấy phép Y tế / GDP Cert',
                    iconClass: 'fa-solid fa-briefcase-medical text-indigo-600',
                    desc: 'Hàng dược phẩm, vắc xin và thiết bị y tế yêu cầu bắt buộc phải có <strong>Giấy phép nhập khẩu y tế</strong> hoặc <strong>Giấy chứng nhận thực hành tốt phân phối (GDP/GSP)</strong> theo quy định Bộ Y tế.',
                    promptTitle: 'Tải lên Giấy phép nhập khẩu Y tế / Chứng nhận GDP/GSP',
                    errorMsg: '<i class="fa-solid fa-circle-exclamation"></i> Vui lòng chọn và tải lên Giấy phép nhập khẩu y tế hoặc chứng nhận GDP/GSP!',
                    adminLabel: 'Giấy phép Nhập khẩu Y tế & GDP/GSP (Medical Cert):'
                };
            } else if (isPerAvi) {
                return {
                    isRequired: true,
                    type: 'PER_AVI',
                    title: 'Giấy chứng nhận kiểm dịch & An toàn thực phẩm',
                    badge: 'Giấy kiểm dịch (Quarantine Cert)',
                    iconClass: 'fa-solid fa-clipboard-check text-emerald-600',
                    desc: 'Hàng thực phẩm, hải sản tươi sống và nông sản/động vật bắt buộc phải có <strong>Giấy chứng nhận kiểm dịch</strong> (Cục Thú y / Cục Bảo vệ Thực vật) còn hiệu lực theo quy định hàng không.',
                    promptTitle: 'Tải lên Giấy chứng nhận kiểm dịch Hải sản / Thực phẩm',
                    errorMsg: '<i class="fa-solid fa-circle-exclamation"></i> Vui lòng chọn và tải lên Giấy chứng nhận kiểm dịch cho hàng hải sản tươi sống / thực phẩm!',
                    adminLabel: 'Giấy chứng nhận kiểm dịch & An toàn thực phẩm (Quarantine Cert):'
                };
            } else if (isGoh) {
                return {
                    isRequired: true,
                    type: 'GOH',
                    title: 'Chứng nhận xuất xứ & Hóa đơn thương mại (CO / Invoice)',
                    badge: 'Chứng nhận CO / Invoice',
                    iconClass: 'fa-solid fa-file-contract text-purple-600',
                    desc: 'Hàng may mặc / dệt may yêu cầu đính kèm <strong>Chứng nhận xuất xứ (Certificate of Origin - CO)</strong> hoặc <strong>Hóa đơn thương mại / Packing List</strong> đi kèm lô hàng.',
                    promptTitle: 'Tải lên Chứng nhận xuất xứ (CO) / Hóa đơn thương mại',
                    errorMsg: '<i class="fa-solid fa-circle-exclamation"></i> Vui lòng chọn và tải lên Chứng nhận xuất xứ (CO) hoặc Hóa đơn thương mại!',
                    adminLabel: 'Chứng nhận xuất xứ & Hóa đơn thương mại (CO / Invoice):'
                };
            }

            return {
                isRequired: false,
                type: 'GEN',
                title: 'Hồ sơ chứng từ bổ sung (Nếu có)',
                badge: 'Chứng từ bổ sung',
                iconClass: 'fa-solid fa-file text-slate-500',
                desc: 'Hàng hóa thông thường không bắt buộc đính kèm chứng từ đặc thù. Quý đại lý có thể tải thêm Packing List / Commercial Invoice nếu cần.',
                promptTitle: 'Tải lên chứng từ bổ sung (Không bắt buộc)',
                errorMsg: '',
                adminLabel: 'Chứng từ đính kèm (Doc / File):'
            };
        },

        logoutAgent: function () {
            if (typeof window !== 'undefined') window._isManualLogout = true;
            try {
                document.cookie = "cargo_agent_code=; path=/; max-age=0; SameSite=Lax";
                fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
            } catch (e) { }
            const data = loadData();
            if (data.currentUser) {
                const cur = data.currentUser;
                this.logActivity({
                    actor: cur.companyName || cur.fullName || cur.agentCode || 'Đại lý',
                    username: cur.agentCode || 'AGENT',
                    role: 'AGENT',
                    actionCategory: 'Đăng nhập',
                    actionTitle: 'Đăng xuất hệ thống Agent',
                    target: 'Sàn Đấu giá Cargo',
                    details: `Đại lý ${cur.companyName || cur.agentCode} (Mã: ${cur.agentCode}) đã đăng xuất khỏi hệ thống.`
                });
            }
            const freshData = loadData();
            freshData.currentUser = null;
            saveData(freshData, true);
        },

        logoutAdmin: function () {
            if (typeof window !== 'undefined') window._isManualLogout = true;
            try {
                document.cookie = "cargo_admin_user=; path=/; max-age=0; SameSite=Lax";
                fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
            } catch (e) { }
            const data = loadData();
            if (data.currentAdmin) {
                this.logActivity({
                    actor: data.currentAdmin.fullName || data.currentAdmin.username,
                    username: data.currentAdmin.username,
                    role: data.currentAdmin.role || 'ADMIN',
                    actionCategory: 'Đăng nhập',
                    actionTitle: 'Đăng xuất hệ thống Admin',
                    target: 'Portal Quản trị',
                    details: `Quản trị viên ${data.currentAdmin.fullName} (@${data.currentAdmin.username}) đã đăng xuất khỏi hệ thống.`
                });
            }
            const freshData = loadData();
            freshData.currentAdmin = null;
            saveData(freshData, true);
        },

        syncHeaderUI: function () {
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

        syncAdminHeaderUI: function () {
            const pathname = (typeof window !== 'undefined' && window.location.pathname) ? window.location.pathname.toLowerCase() : '';
            const isAdminPage = pathname.includes('/admin/') || pathname.includes('\\admin\\') || pathname.startsWith('/admin');
            if (!isAdminPage) return;

            const admin = this.getCurrentAdmin();
            if (!admin) return;

            const roleKey = (admin.role || '').toUpperCase();
            const isSuperAdmin = (admin.username === 'admin' || roleKey === 'SUPER_ADMIN' || roleKey === 'ITD_ADMIN' || roleKey === 'ADMIN');
            
            // Resolve dynamic role information
            const allRoles = (this.getRoles ? this.getRoles() : []);
            const matchedRole = allRoles.find(r => r.id === admin.role || r.id === roleKey || (r.code && r.code.toUpperCase() === roleKey));

            let roleName = matchedRole ? matchedRole.name : (admin.role || 'QUẢN TRỊ VIÊN');
            let roleBadge = matchedRole ? (matchedRole.code || matchedRole.name) : (admin.role || 'ADMIN');
            let badgeClass = 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
            let roleIcon = '<i class="fa-solid fa-shield-halved text-[9px]"></i>';

            if (isSuperAdmin) {
                roleName = 'QUẢN TRỊ VIÊN TỐI CAO (SUPER ADMIN)';
                roleBadge = 'SUPER ADMIN';
                badgeClass = 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
                roleIcon = '<i class="fa-solid fa-crown text-[9px]"></i>';
            } else if (matchedRole) {
                if (matchedRole.color) {
                    badgeClass = matchedRole.color;
                } else {
                    badgeClass = 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30';
                }
                roleIcon = '<i class="fa-solid fa-user-shield text-[9px]"></i>';
            }

            document.querySelectorAll('.admin-header-name').forEach(el => {
                el.textContent = admin.fullName || admin.username;
            });

            document.querySelectorAll('.admin-header-role').forEach(el => {
                el.className = `text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass} inline-flex items-center gap-1`;
                el.innerHTML = `${roleIcon} ${roleBadge}`;
                el.title = roleName;
            });

            // Nav link visibility across headers, mobile menu, and dashboard cards based on granular permissions
            const canCreateAuction = this.hasPermission('auctions.create', admin);
            const canViewAuctions = this.hasPermission('auctions.view', admin);
            const canAccessAgentPortal = this.hasPermission('registrations.view', admin) ||
                                         this.hasPermission('agents.view', admin) ||
                                         this.hasPermission('staff.view', admin);

            if (!canCreateAuction) {
                document.querySelectorAll(`
                    a[href*="04-CreateAuction.html"], a[href*="create-auction"]
                `).forEach(el => {
                    el.style.display = 'none';
                });
            }

            if (!canViewAuctions) {
                document.querySelectorAll(`
                    a[href*="03-AuctionList.html"], a[href*="auction-list"], a[href*="auctions"]
                `).forEach(el => {
                    el.style.display = 'none';
                });
            }

            if (!canAccessAgentPortal) {
                document.querySelectorAll(`
                    a[href*="06-AgentList.html"], a[href*="agents"], a[href*="agent-list"]
                `).forEach(el => {
                    el.style.display = 'none';
                });
            }

            if (!isSuperAdmin) {
                // Settings & Audit Logs reserved for Super Admin / System Admin
                document.querySelectorAll(`
                    a[href*="08-Settings.html"], a[href*="settings"],
                    a[href*="10-AuditLogs.html"], a[href*="audit-logs"]
                `).forEach(el => {
                    el.style.display = 'none';
                });
            }

            // Block access on 04-CreateAuction.html if unauthorized
            if (!canCreateAuction && (pathname.includes('04-createauction') || pathname.endsWith('/create-auction'))) {
                const main = document.querySelector('main');
                if (main) {
                    main.innerHTML = `
                        <div class="max-w-xl mx-auto my-12 bg-white rounded-3xl p-8 border shadow-xl text-center space-y-4">
                            <div class="w-16 h-16 bg-red-100 text-red-600 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-sm">
                                <i class="fa-solid fa-ban"></i>
                            </div>
                            <h2 class="text-xl font-bold text-slate-900">Truy cập bị từ chối (Access Denied)</h2>
                            <p class="text-xs text-slate-600 leading-relaxed">
                                Tài khoản <strong>${admin.fullName || admin.username}</strong> (${roleName}) không có quyền <strong>Tạo phiên đấu giá (auctions.create)</strong>.
                            </p>
                            <a href="02-AdminDashboard.html" class="inline-block bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-3 rounded-xl transition shadow">
                                Quay lại Admin Dashboard
                            </a>
                        </div>
                    `;
                }
            }

            // Block access on 06-AgentList.html if no permission to view registrations, agents, or staff
            if (!canAccessAgentPortal && (pathname.includes('06-agentlist') || pathname.endsWith('/agents') || pathname.endsWith('/agent-list'))) {
                const main = document.querySelector('main');
                if (main) {
                    main.innerHTML = `
                        <div class="max-w-xl mx-auto my-12 bg-white rounded-3xl p-8 border shadow-xl text-center space-y-4">
                            <div class="w-16 h-16 bg-red-100 text-red-600 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-sm">
                                <i class="fa-solid fa-ban"></i>
                            </div>
                            <h2 class="text-xl font-bold text-slate-900">Truy cập bị từ chối (Access Denied)</h2>
                            <p class="text-xs text-slate-600 leading-relaxed">
                                Tài khoản <strong>${admin.fullName || admin.username}</strong> (${roleName}) không có quyền xem <strong>Hồ sơ đăng ký, Đại lý hoặc Nhân sự</strong>.
                            </p>
                            <a href="02-AdminDashboard.html" class="inline-block bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-3 rounded-xl transition shadow">
                                Quay lại Admin Dashboard
                            </a>
                        </div>
                    `;
                }
            }

            // Block access on 08-Settings.html for non-superadmin
            if (!isSuperAdmin && (pathname.includes('08-settings') || pathname.endsWith('/settings') || pathname.endsWith('/setting'))) {
                const main = document.querySelector('main');
                if (main) {
                    main.innerHTML = `
                        <div class="max-w-xl mx-auto my-12 bg-white rounded-3xl p-8 border shadow-xl text-center space-y-4">
                            <div class="w-16 h-16 bg-red-100 text-red-600 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-sm">
                                <i class="fa-solid fa-ban"></i>
                            </div>
                            <h2 class="text-xl font-bold text-slate-900">Truy cập bị từ chối (Access Denied)</h2>
                            <p class="text-xs text-slate-600 leading-relaxed">
                                Tài khoản <strong>${roleName}</strong> không có quyền can thiệp Cấu hình kỹ thuật hệ thống. Trang này thuộc thẩm quyền riêng của <strong>Quản trị viên SUPER ADMIN</strong>.
                            </p>
                            <a href="02-AdminDashboard.html" class="inline-block bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-3 rounded-xl transition shadow">
                                Quay lại Admin Dashboard
                            </a>
                        </div>
                    `;
                }
            }

            // Block access on 10-AuditLogs.html for non-superadmin
            if (!isSuperAdmin && (pathname.includes('10-auditlogs') || pathname.endsWith('/audit-logs') || pathname.endsWith('/logs'))) {
                const main = document.querySelector('main');
                if (main) {
                    main.innerHTML = `
                        <div class="max-w-xl mx-auto my-12 bg-white rounded-3xl p-8 border shadow-xl text-center space-y-4">
                            <div class="w-16 h-16 bg-red-100 text-red-600 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-sm">
                                <i class="fa-solid fa-ban"></i>
                            </div>
                            <h2 class="text-xl font-bold text-slate-900">Truy cập bị từ chối (Access Denied)</h2>
                            <p class="text-xs text-slate-600 leading-relaxed">
                                Tài khoản <strong>${roleName}</strong> không có quyền xem <strong>Nhật ký hoạt động & Bảo mật hệ thống</strong>. Thao tác này thuộc thẩm quyền riêng của <strong>Quản trị viên SUPER ADMIN</strong>.
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
        adminNotifSelectMode: false,
        selectedAdminNotifIds: new Set(),

        setAdminNotifFilter: function (filter) {
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

        toggleAdminNotifSelectMode: function (forceState) {
            this.adminNotifSelectMode = typeof forceState === 'boolean' ? forceState : !this.adminNotifSelectMode;
            if (!this.adminNotifSelectMode) {
                this.selectedAdminNotifIds.clear();
            }
            this.renderAdminNotificationList();
        },

        toggleAdminNotifSelection: function (id) {
            const sId = String(id);
            if (this.selectedAdminNotifIds.has(sId)) {
                this.selectedAdminNotifIds.delete(sId);
            } else {
                this.selectedAdminNotifIds.add(sId);
            }
            this.renderAdminNotificationList();
        },

        selectAllAdminNotifs: function (selectAll) {
            const allAdminNotifs = this.getAdminNotifications();
            let filtered = allAdminNotifs;
            if (this.adminNotifFilter === 'PAYMENT') {
                filtered = allAdminNotifs.filter(n => n.type === 'PAYMENT' || (n.title || '').includes('ĐẠI LÝ BÁO CHUYỂN KHOẢN') || (n.message || '').includes('đối soát sao kê'));
            } else if (this.adminNotifFilter === 'ALERT') {
                filtered = allAdminNotifs.filter(n => n.type === 'ALERT' || (n.title || '').includes('CẢNH BÁO') || (n.title || '').includes('KHÓA'));
            }

            if (selectAll) {
                filtered.forEach(n => this.selectedAdminNotifIds.add(String(n.id)));
            } else {
                filtered.forEach(n => this.selectedAdminNotifIds.delete(String(n.id)));
            }
            this.renderAdminNotificationList();
        },

        handleAdminNotifClick: function (event, id) {
            if (event.target.closest('a, button, input')) return;
            if (this.adminNotifSelectMode) {
                this.toggleAdminNotifSelection(id);
            } else {
                this.markAdminNotificationAsRead(id);
                const data = loadData();
                const notif = (data.notifications || []).find(n => String(n.id) === String(id));
                if (notif) {
                    const titleUpper = String(notif.title || '').toUpperCase();
                    const msgUpper = String(notif.message || '').toUpperCase();
                    const combined = titleUpper + ' ' + msgUpper;
                    const targetWonId = notif.wonId || combined.match(/WON-[\w-]+/)?.[0];
                    const isRefund = notif.type === 'REFUND_REQUEST' || titleUpper.includes('HOÀN TIỀN') || msgUpper.includes('HOAN TIEN') || msgUpper.includes('HOÀN TIỀN');
                    const isPayment = notif.type === 'PAYMENT' || titleUpper.includes('CHUYỂN KHOẢN');

                    let targetUrl = '';
                    if (isRefund && targetWonId) {
                        targetUrl = `03-AuctionList.html?tab=refund&refund=${targetWonId}`;
                    } else if (isPayment && targetWonId) {
                        targetUrl = `03-AuctionList.html?tab=won&search=${targetWonId}&reconcile=${targetWonId}`;
                    } else if (notif.link) {
                        targetUrl = notif.link;
                        if (targetUrl.startsWith('/Admin/')) targetUrl = targetUrl.replace('/Admin/', '');
                    }

                    if (targetUrl) {
                        window.location.href = targetUrl;
                    }
                }
            }
        },

        deleteAdminNotification: function (id) {
            this.deleteNotification(id);
            this.selectedAdminNotifIds.delete(String(id));
            this.renderAdminNotificationList();
        },

        deleteSelectedAdminNotifications: async function () {
            const ids = Array.from(this.selectedAdminNotifIds);
            if (ids.length === 0) return;
            const ok = window.showConfirm ? await window.showConfirm(`Bạn có chắc chắn muốn xóa ${ids.length} thông báo đã chọn?`) : confirm(`Bạn có chắc chắn muốn xóa ${ids.length} thông báo đã chọn?`);
            if (ok) {
                this.deleteNotifications(ids);
                this.selectedAdminNotifIds.clear();
                this.adminNotifSelectMode = false;
                this.renderAdminNotificationList();
            }
        },

        deleteAllAdminNotifications: async function () {
            const allAdminNotifs = this.getAdminNotifications();
            if (allAdminNotifs.length === 0) return;
            const ok = window.showConfirm ? await window.showConfirm(`Bạn có chắc chắn muốn xóa tất cả ${allAdminNotifs.length} thông báo admin?`) : confirm(`Bạn có chắc chắn muốn xóa tất cả ${allAdminNotifs.length} thông báo admin?`);
            if (ok) {
                const ids = allAdminNotifs.map(n => n.id);
                this.deleteNotifications(ids);
                this.selectedAdminNotifIds.clear();
                this.adminNotifSelectMode = false;
                this.renderAdminNotificationList();
            }
        },

        getAdminNotifications: function () {
            const data = loadData();
            const notifs = deduplicateNotifications(data.notifications || []);

            // Only show notifications scoped to ADMIN or STAFF — never leak agent-only notifications
            const adminNotifs = notifs.filter(n => {
                const role = String(n.targetRole || '').trim().toUpperCase();
                return role === 'ADMIN' || role === 'STAFF';
            });

            const readIdSet = new Set((Array.isArray(data.readNotificationIds) ? data.readNotificationIds : []).map(String));
            const deletedIdSet = new Set((Array.isArray(data.deletedNotificationIds) ? data.deletedNotificationIds : []).map(String));
            return adminNotifs.filter(n => !deletedIdSet.has(String(n.id))).map(n => {
                const isRead = n.read === true || readIdSet.has(String(n.id));
                const ts = n.timestamp || n.createdAt || (typeof n.id === 'number' && n.id > 1577836800000 ? n.id : (typeof n.id === 'string' && !isNaN(Number(n.id)) && Number(n.id) > 1577836800000 ? Number(n.id) : null));
                let displayTime = n.time;
                if (ts) {
                    displayTime = formatTimeAgo(ts, n.time);
                } else if (!n.time || n.time === 'Vừa xong') {
                    displayTime = 'Cách đây ít phút';
                }

                return {
                    ...n,
                    read: isRead,
                    unread: !isRead,
                    time: displayTime
                };
            }).sort((a, b) => (Number(b.timestamp || b.createdAt || b.id) || 0) - (Number(a.timestamp || a.createdAt || a.id) || 0));
        },

        markAllAdminNotificationsAsRead: function () {
            // Only mark admin/staff notifications as read — leave agent notifications untouched
            this.getAdminNotifications().forEach(n => {
                if (!n.read) this.markNotificationRead(n.id);
            });
            this.renderAdminNotificationList();
        },

        markAdminNotificationAsRead: function (id) {
            this.markNotificationRead(id);
            this.renderAdminNotificationList();
        },

        initAdminNotificationCenter: function () {
            if (typeof document === 'undefined') return;
            const admin = this.getCurrentAdmin();
            if (!admin) return;

            // Find the right-side user profile container in the header
            const userAnchor = document.querySelector('header a[href*="01-AdminLogin"], header a[onclick*="logoutAdmin"], header .admin-header-name, header .admin-header-role');
            if (!userAnchor) return;

            const targetContainer = userAnchor.closest('.admin-right') || userAnchor.closest('.flex.items-center') || userAnchor.parentElement;
            if (!targetContainer) return;

            const sepEl = targetContainer.querySelector('.admin-sep');
            const avatarEl = targetContainer.querySelector('.admin-avatar, .admin-header-avatar') || targetContainer.querySelector('.admin-user-info');
            const insertionTarget = sepEl || avatarEl || targetContainer.querySelector('.admin-header-role') || userAnchor;

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
                    <div id="adminNotifDropdown" class="hidden absolute right-0 top-full mt-2 w-80 sm:w-[400px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 text-slate-800 z-[9999] overflow-hidden">
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
                            <div class="flex items-center gap-2">
                                <button type="button" onclick="CargoStore.markAllAdminNotificationsAsRead()" class="text-[11px] text-blue-400 hover:text-blue-300 font-medium hover:underline cursor-pointer flex items-center gap-1" title="Đánh dấu tất cả là đã đọc">
                                    <i class="fa-solid fa-check-double"></i> Đã đọc
                                </button>
                                <button type="button" onclick="CargoStore.deleteAllAdminNotifications()" class="text-[11px] text-rose-400 hover:text-rose-300 font-medium hover:underline cursor-pointer flex items-center gap-1" title="Xóa tất cả thông báo admin">
                                    <i class="fa-regular fa-trash-can"></i> Xóa tất cả
                                </button>
                            </div>
                        </div>

                        <!-- Filter Tabs & Selection Toggle in Notification Center -->
                        <div class="flex items-center justify-between p-2 bg-slate-50 border-b border-slate-100 text-[11px] font-semibold">
                            <div class="flex items-center gap-1">
                                <button type="button" onclick="CargoStore.setAdminNotifFilter('ALL')" id="adminNotifTabAll" class="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold transition">Tất cả</button>
                                <button type="button" onclick="CargoStore.setAdminNotifFilter('PAYMENT')" id="adminNotifTabPayment" class="px-2.5 py-1 rounded-lg text-slate-600 hover:bg-slate-200 transition flex items-center gap-1">
                                    💳 Chờ duyệt CK <span id="adminNotifPayCount" class="hidden bg-amber-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold">0</span>
                                </button>
                                <button type="button" onclick="CargoStore.setAdminNotifFilter('ALERT')" id="adminNotifTabAlert" class="px-2.5 py-1 rounded-lg text-slate-600 hover:bg-slate-200 transition">Cảnh báo</button>
                            </div>
                            <button type="button" id="adminNotifSelectBtn" onclick="CargoStore.toggleAdminNotifSelectMode()" class="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 transition flex items-center gap-1 text-[11px] cursor-pointer font-medium" title="Bật/tắt chọn xóa nhiều thông báo">
                                <i class="fa-regular fa-square-check text-blue-600"></i> <span id="adminNotifSelectBtnText">Chọn xóa</span>
                            </button>
                        </div>

                        <!-- Selection Toolbar (visible when select mode is active) -->
                        <div id="adminNotifSelectionBar" class="hidden px-3 py-1.5 bg-slate-800 text-white flex items-center justify-between text-xs border-b border-slate-700">
                            <div class="flex items-center gap-2">
                                <input type="checkbox" id="adminNotifSelectAllCb" onchange="CargoStore.selectAllAdminNotifs(this.checked)" class="rounded border-slate-600 text-blue-500 focus:ring-blue-400 cursor-pointer w-4 h-4">
                                <label for="adminNotifSelectAllCb" class="text-[11px] font-medium cursor-pointer text-slate-200">Chọn tất cả</label>
                                <span class="text-[11px] text-slate-400 ml-1">(<span id="adminNotifSelectedCount" class="font-bold text-amber-400">0</span>/<span id="adminNotifTotalCount">0</span>)</span>
                            </div>
                            <button type="button" id="adminNotifDeleteSelectedBtn" onclick="CargoStore.deleteSelectedAdminNotifications()" disabled class="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg text-[11px] transition flex items-center gap-1 cursor-pointer">
                                <i class="fa-regular fa-trash-can"></i> Xóa mục chọn
                            </button>
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

                if (insertionTarget) {
                    targetContainer.insertBefore(bellWrapper, insertionTarget);
                } else {
                    targetContainer.appendChild(bellWrapper);
                }

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
            } else {
                if (insertionTarget && bellWrapper.nextElementSibling !== insertionTarget) {
                    targetContainer.insertBefore(bellWrapper, insertionTarget);
                }
            }

            this.renderAdminNotificationList();
        },

        renderAdminNotificationList: function () {
            if (typeof document === 'undefined') return;
            const notifListEl = document.getElementById('adminNotifList');
            const badgeEl = document.getElementById('adminNotifBadge');
            const summaryEl = document.getElementById('adminNotifSummaryText');
            const payCountEl = document.getElementById('adminNotifPayCount');

            const selectionBarEl = document.getElementById('adminNotifSelectionBar');
            const selectBtnTextEl = document.getElementById('adminNotifSelectBtnText');
            const selectAllCbEl = document.getElementById('adminNotifSelectAllCb');
            const selectedCountEl = document.getElementById('adminNotifSelectedCount');
            const totalCountEl = document.getElementById('adminNotifTotalCount');
            const deleteSelectedBtnEl = document.getElementById('adminNotifDeleteSelectedBtn');

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

            // Update Selection Mode Toolbar
            if (selectionBarEl) {
                if (this.adminNotifSelectMode) {
                    selectionBarEl.classList.remove('hidden');
                } else {
                    selectionBarEl.classList.add('hidden');
                }
            }
            if (selectBtnTextEl) {
                selectBtnTextEl.textContent = this.adminNotifSelectMode ? 'Hủy chọn' : 'Chọn xóa';
            }

            const totalFilteredCount = filtered.length;
            const currentSelectedCount = Array.from(this.selectedAdminNotifIds).filter(id => filtered.some(n => String(n.id) === String(id))).length;

            if (selectedCountEl) selectedCountEl.textContent = currentSelectedCount;
            if (totalCountEl) totalCountEl.textContent = totalFilteredCount;
            if (deleteSelectedBtnEl) deleteSelectedBtnEl.disabled = currentSelectedCount === 0;
            if (selectAllCbEl) {
                selectAllCbEl.checked = totalFilteredCount > 0 && currentSelectedCount === totalFilteredCount;
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
                const sId = String(n.id);
                const isUnread = !n.read;
                const isSelected = this.selectedAdminNotifIds.has(sId);
                const titleUpper = String(n.title || '').toUpperCase();
                const msgUpper = String(n.message || '').toUpperCase();
                const combined = titleUpper + ' ' + msgUpper;

                const isPayment = n.type === 'PAYMENT' || titleUpper.includes('CHUYỂN KHOẢN');
                const isRefund = n.type === 'REFUND_REQUEST' || titleUpper.includes('HOÀN TIỀN') || msgUpper.includes('HOAN TIEN') || msgUpper.includes('HOÀN TIỀN');
                const isAlert = n.type === 'ALERT' || titleUpper.includes('KHÓA');

                let iconClass = 'fa-info-circle text-blue-600 bg-blue-50';
                let iconFa = 'fa-bell';
                let cardBg = isUnread ? 'bg-blue-50/40 font-semibold' : 'bg-white';

                if (isPayment) {
                    iconClass = 'fa-credit-card text-emerald-600 bg-emerald-50';
                    iconFa = 'fa-credit-card';
                    if (isUnread) cardBg = 'bg-emerald-50/50 border-l-4 border-emerald-500';
                } else if (isRefund) {
                    iconClass = 'fa-hand-holding-dollar text-indigo-600 bg-indigo-50';
                    iconFa = 'fa-hand-holding-dollar';
                    if (isUnread) cardBg = 'bg-indigo-50/50 border-l-4 border-indigo-500';
                } else if (isAlert) {
                    iconClass = 'fa-triangle-exclamation text-rose-600 bg-rose-50';
                    iconFa = 'fa-triangle-exclamation';
                    if (isUnread) cardBg = 'bg-rose-50/40 border-l-4 border-rose-500';
                }

                if (isSelected) {
                    cardBg = 'bg-blue-50/80 border-2 border-blue-500 font-semibold';
                }

                // Resolve link for admin
                let actionBtn = '';
                const targetWonId = n.wonId || combined.match(/WON-[\w-]+/)?.[0];

                if (isRefund && targetWonId) {
                    actionBtn = `
                        <a href="03-AuctionList.html?tab=refund&refund=${targetWonId}" onclick="CargoStore.markAdminNotificationAsRead(${n.id})" class="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-[10px] font-bold shadow-xs transition">
                            <i class="fa-solid fa-hand-holding-dollar"></i> Xem & Xử lý hoàn tiền
                        </a>
                    `;
                } else if (isPayment && targetWonId) {
                    actionBtn = `
                        <a href="03-AuctionList.html?tab=won&search=${targetWonId}&reconcile=${targetWonId}" onclick="CargoStore.markAdminNotificationAsRead(${n.id})" class="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[10px] font-bold shadow-xs transition">
                            <i class="fa-solid fa-magnifying-glass-dollar"></i> Đối soát ngay
                        </a>
                    `;
                } else if (titleUpper.includes('ĐĂNG KÝ') || (n.link || '').includes('06-AgentList.html')) {
                    actionBtn = `
                        <a href="06-AgentList.html" onclick="CargoStore.markAdminNotificationAsRead(${n.id})" class="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-[10px] font-bold shadow-xs transition">
                            <i class="fa-solid fa-user-check"></i> Duyệt hồ sơ
                        </a>
                    `;
                }

                return `
                    <div class="group relative p-3 hover:bg-slate-50 transition rounded-xl flex items-start gap-2.5 cursor-pointer ${cardBg}" onclick="CargoStore.handleAdminNotifClick(event, ${n.id})">
                        ${this.adminNotifSelectMode ? `
                            <div class="flex items-center h-full pt-1">
                                <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="event.stopPropagation(); CargoStore.toggleAdminNotifSelection(${n.id})" class="admin-notif-checkbox rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4">
                            </div>
                        ` : ''}
                        <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm ${iconClass}">
                            <i class="fa-solid ${iconFa}"></i>
                        </div>
                        <div class="flex-1 min-w-0 space-y-1 pr-6">
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
                        ${!this.adminNotifSelectMode ? `
                            <button type="button" onclick="event.stopPropagation(); CargoStore.deleteAdminNotification(${n.id})" class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-white shadow-xs hover:bg-rose-100 hover:text-rose-600 text-slate-400 p-1.5 rounded-lg border border-slate-200 transition cursor-pointer" title="Xóa thông báo này">
                                <i class="fa-regular fa-trash-can text-xs"></i>
                            </button>
                        ` : ''}
                    </div>
                `;
            }).join('');
        }
    });
})();
