const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', '08-Notifications.html');
let content = fs.readFileSync(filePath, 'utf8');

// Replace the entire <script> block with a clean, fully working version
const scriptStartMarker = '<script>';
const scriptEndMarker = '</script>';

const scriptStartIndex = content.lastIndexOf(scriptStartMarker);
const scriptEndIndex = content.lastIndexOf(scriptEndMarker);

if (scriptStartIndex !== -1 && scriptEndIndex !== -1) {
    const cleanScript = `<script>
    let currentFilter = 'all';
    let selectedNotifIds = new Set();
    let pendingDeleteIds = [];

    const typeConfig = {
        'OUTBID': {
            icon: 'fa-arrow-trend-up', iconColor: 'text-amber-600', iconBg: 'bg-amber-100',
            borderClass: 'warn', dotColor: 'bg-amber-400', label: 'Bị vượt giá',
            labelBg: 'bg-amber-100 text-amber-700'
        },
        'HIGHEST': {
            icon: 'fa-crown', iconColor: 'text-blue-600', iconBg: 'bg-blue-100',
            borderClass: 'unread', dotColor: 'bg-blue-400', label: 'Đang dẫn đầu',
            labelBg: 'bg-blue-100 text-blue-700'
        },
        'WON': {
            icon: 'fa-trophy', iconColor: 'text-emerald-600', iconBg: 'bg-emerald-100',
            borderClass: 'won', dotColor: 'bg-emerald-400', label: 'Trúng thầu',
            labelBg: 'bg-emerald-100 text-emerald-700'
        },
        'CLOSING_SOON': {
            icon: 'fa-hourglass-end', iconColor: 'text-orange-600', iconBg: 'bg-orange-100',
            borderClass: 'urgent', dotColor: 'bg-orange-400', label: 'Sắp đóng thầu',
            labelBg: 'bg-orange-100 text-orange-700'
        },
        'SYSTEM': {
            icon: 'fa-gear', iconColor: 'text-gray-500', iconBg: 'bg-gray-100',
            borderClass: '', dotColor: 'bg-gray-400', label: 'Hệ thống',
            labelBg: 'bg-gray-100 text-gray-600'
        },
        'PAYMENT': {
            icon: 'fa-credit-card', iconColor: 'text-rose-600', iconBg: 'bg-rose-100',
            borderClass: 'urgent', dotColor: 'bg-rose-400', label: 'Thanh toán',
            labelBg: 'bg-rose-100 text-rose-700'
        },
        'AUCTION_OPEN': {
            icon: 'fa-plane-departure', iconColor: 'text-indigo-600', iconBg: 'bg-indigo-100',
            borderClass: 'unread', dotColor: 'bg-indigo-500', label: 'Phiên mới mở',
            labelBg: 'bg-indigo-100 text-indigo-700'
        },
        'NEW_AUCTION': {
            icon: 'fa-plane-departure', iconColor: 'text-indigo-600', iconBg: 'bg-indigo-100',
            borderClass: 'unread', dotColor: 'bg-indigo-500', label: 'Phiên mới mở',
            labelBg: 'bg-indigo-100 text-indigo-700'
        }
    };

    function getConfig(type) {
        return typeConfig[type] || typeConfig['SYSTEM'];
    }

    function setFilter(f) {
        currentFilter = f;
        selectedNotifIds.clear();
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('f-' + f);
        if (btn) btn.classList.add('active');
        renderNotifications();
    }

    function getCurrentlyFilteredNotifs() {
        if (typeof CargoStore === 'undefined') return [];
        let notifs = CargoStore.getNotifications ? CargoStore.getNotifications().slice() : [];
        if (currentFilter === 'unread') notifs = notifs.filter(n => !n.read);
        else if (currentFilter !== 'all') notifs = notifs.filter(n => n.type === currentFilter);
        return notifs;
    }

    function renderNotifications() {
        if (typeof CargoStore === 'undefined') return;

        let notifs = CargoStore.getNotifications ? CargoStore.getNotifications().slice() : [];

        const total = notifs.length;
        const unread = notifs.filter(n => !n.read).length;
        const outbid = notifs.filter(n => n.type === 'OUTBID').length;
        const won = notifs.filter(n => n.type === 'WON').length;
        document.getElementById('statTotal').textContent = total;
        document.getElementById('statUnread').textContent = unread;
        document.getElementById('statOutbid').textContent = outbid;
        document.getElementById('statWon').textContent = won;

        if (currentFilter === 'unread') notifs = notifs.filter(n => !n.read);
        else if (currentFilter !== 'all') notifs = notifs.filter(n => n.type === currentFilter);

        const container = document.getElementById('notifList');
        const markAllBtn = document.getElementById('markAllBtn');
        if (markAllBtn) markAllBtn.style.display = unread === 0 ? 'none' : 'flex';

        const toolbar = document.getElementById('selectionToolbar');
        if (toolbar) {
            toolbar.style.display = notifs.length === 0 ? 'none' : 'flex';
        }

        if (notifs.length === 0) {
            const msgs = {
                'all': 'Hộp thư thông báo trống',
                'unread': 'Không có thông báo chưa đọc',
                'OUTBID': 'Không có thông báo bị vượt giá',
                'HIGHEST': 'Không có thông báo dẫn đầu',
                'WON': 'Bạn chưa trúng thầu nào',
                'CLOSING_SOON': 'Không có cảnh báo sắp đóng thầu',
                'SYSTEM': 'Không có thông báo hệ thống'
            };
            container.innerHTML = \`
                <div class="bg-white rounded-2xl border p-16 text-center shadow-sm">
                    <div class="empty-anim text-6xl mb-5">🔔</div>
                    <p class="font-bold text-slate-700 text-lg">\${msgs[currentFilter] || 'Trống'}</p>
                    <p class="text-sm text-gray-400 mt-1">Các thông báo mới sẽ xuất hiện tại đây theo thời gian thực</p>
                    <a href="03-Index.html" class="inline-flex items-center gap-2 mt-5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition shadow">
                        <i class="fa-solid fa-gavel"></i> Tham gia đấu giá
                    </a>
                </div>\`;
            updateSelectionUI();
            return;
        }

        container.innerHTML = notifs.map((n, idx) => {
            const cfg = getConfig(n.type);
            const isSelected = selectedNotifIds.has(String(n.id));
            const readClass = n.read ? '' : cfg.borderClass;
            const bgClass = isSelected ? 'bg-indigo-50/50 ring-2 ring-indigo-500/40' : (n.read ? 'bg-white' : (n.type === 'OUTBID' ? 'bg-amber-50/30' : (n.type === 'WON' ? 'bg-emerald-50/30' : (n.type === 'CLOSING_SOON' ? 'bg-red-50/20' : 'bg-blue-50/20'))));

            return \`
            <div id="notif-card-\${n.id}" class="notif-card \${readClass} \${bgClass} rounded-xl border shadow-sm fade-in transition" style="animation-delay:\${idx * 0.03}s">
                <div class="flex items-start gap-3.5 p-4">
                    <div class="pt-1.5 flex-shrink-0">
                        <input type="checkbox" class="notif-item-cb w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" 
                               value="\${n.id}" 
                               \${isSelected ? 'checked' : ''} 
                               onchange="toggleSelectNotif('\${n.id}', this.checked, event)">
                    </div>

                    <div class="w-10 h-10 rounded-xl \${cfg.iconBg} flex items-center justify-center flex-shrink-0 shadow-sm">
                        <i class="fa-solid \${cfg.icon} \${cfg.iconColor} text-base"></i>
                    </div>

                    <div class="flex-1 min-w-0">
                        <div class="flex items-start justify-between gap-2 mb-1">
                            <div class="flex items-center gap-2 flex-wrap">
                                \${!n.read ? \`<span class="badge-dot \${cfg.dotColor}"></span>\` : ''}
                                <h3 class="font-bold text-sm text-slate-900">\${n.title}</h3>
                                <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full \${cfg.labelBg}">\${cfg.label}</span>
                            </div>
                            <span class="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap">\${CargoStore.formatTimeAgo ? CargoStore.formatTimeAgo(n.timestamp || n.createdAt || n.id, n.time) : (n.time || '')}</span>
                        </div>
                        <p class="text-xs text-gray-600 leading-relaxed">\${n.message}</p>
                        
                        <div class="flex items-center gap-3 mt-3 flex-wrap">
                            \${n.link ? \`
                            <a href="\${n.link}" onclick="markReadById('\${n.id}')" class="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline transition">
                                <i class="fa-solid fa-arrow-right text-[9px]"></i> Xem chi tiết
                            </a>
                            <span class="text-gray-200">|</span>
                            \` : ''}
                            \${!n.read ? \`
                            <button onclick="markReadById('\${n.id}')" class="text-xs text-gray-400 hover:text-gray-700 hover:underline transition flex items-center gap-1 cursor-pointer">
                                <i class="fa-regular fa-circle-check text-[10px]"></i> Đánh dấu đã đọc
                            </button>
                            <span class="text-gray-200">|</span>
                            \` : \`
                            <span class="text-xs text-gray-300 flex items-center gap-1"><i class="fa-solid fa-check text-[9px]"></i> Đã đọc</span>
                            <span class="text-gray-200">|</span>
                            \`}
                            <button onclick="confirmDeleteSingle('\${n.id}')" class="text-xs text-gray-400 hover:text-red-600 hover:underline transition flex items-center gap-1 cursor-pointer" title="Xóa thông báo này">
                                <i class="fa-regular fa-trash-can text-[10px]"></i> Xóa
                            </button>
                        </div>
                    </div>

                    \${(() => {
                        if (n.type === 'OUTBID' && n.link) {
                            const allAuctions = CargoStore.getAuctions ? CargoStore.getAuctions() : [];
                            const match = (n.link || '').match(/id=([^&]+)/);
                            const aId = match ? match[1] : null;
                            let isClosed = false;
                            if (aId) {
                                const foundA = allAuctions.find(a => String(a.id) === String(aId));
                                if (foundA) {
                                    const tm = (foundA.endTime && CargoStore.getTimeRemaining) ? CargoStore.getTimeRemaining(foundA.endTime) : null;
                                    isClosed = foundA.status === 'CLOSED' || foundA.status === 'ENDED' || foundA.status === 'EXPIRED' || (tm && tm.isEnded);
                                }
                            }
                            if (isClosed) {
                                return \`
                                <a href="\${n.link}" onclick="markReadById('\${n.id}')" class="flex-shrink-0 bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-medium px-3 py-2 rounded-xl transition shadow-xs flex items-center gap-1.5 whitespace-nowrap" title="Phiên đấu giá đã đóng">
                                    <i class="fa-solid fa-lock text-[10px]"></i> Đã đóng
                                </a>\`;
                            }
                            return \`
                            <a href="\${n.link}" onclick="markReadById('\${n.id}')" class="flex-shrink-0 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition shadow flex items-center gap-1.5 whitespace-nowrap">
                                <i class="fa-solid fa-gavel text-[10px]"></i> Đặt lại ngay
                            </a>\`;
                        } else if (n.type === 'WON') {
                            return \`
                            <a href="07-WonAuction.html" onclick="markReadById('\${n.id}')" class="flex-shrink-0 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition shadow flex items-center gap-1.5 whitespace-nowrap">
                                <i class="fa-solid fa-circle-check text-[10px]"></i> Xem đơn
                            </a>\`;
                        }
                        return '';
                    })()}
                </div>
            </div>
            \`;
        }).join('');

        updateSelectionUI();
        renderNotifSubscribedBadges();
    }

    function toggleSelectNotif(id, checked, e) {
        if (e && e.stopPropagation) e.stopPropagation();
        const strId = String(id);
        if (checked) {
            selectedNotifIds.add(strId);
        } else {
            selectedNotifIds.delete(strId);
        }
        updateSelectionUI();
    }

    function toggleSelectAll(checked) {
        const visibleNotifs = getCurrentlyFilteredNotifs();
        if (checked) {
            visibleNotifs.forEach(n => selectedNotifIds.add(String(n.id)));
        } else {
            visibleNotifs.forEach(n => selectedNotifIds.delete(String(n.id)));
        }
        renderNotifications();
    }

    function deselectAll() {
        selectedNotifIds.clear();
        renderNotifications();
    }

    function updateSelectionUI() {
        const visibleNotifs = getCurrentlyFilteredNotifs();
        const visibleIds = visibleNotifs.map(n => String(n.id));
        const selectedCount = visibleIds.filter(id => selectedNotifIds.has(id)).length;
        const totalVisible = visibleNotifs.length;

        const selectAllCb = document.getElementById('selectAllCheckbox');
        const badge = document.getElementById('selectedCountBadge');
        const countNum = document.getElementById('selectedCountNum');
        const markBtn = document.getElementById('markSelectedReadBtn');
        const delBtn = document.getElementById('deleteSelectedBtn');
        const deselectBtn = document.getElementById('deselectAllBtn');
        const deleteCount = document.getElementById('deleteSelectedCount');
        const markCount = document.getElementById('markReadCount');
        const selectAllLabel = document.getElementById('selectAllLabel');

        if (selectAllCb) {
            selectAllCb.checked = totalVisible > 0 && selectedCount === totalVisible;
            selectAllCb.indeterminate = selectedCount > 0 && selectedCount < totalVisible;
        }

        if (selectAllLabel) {
            selectAllLabel.textContent = totalVisible > 0 ? \`Chọn tất cả (\${totalVisible})\` : 'Chọn tất cả';
        }

        if (selectedCount > 0) {
            if (badge) {
                badge.classList.remove('hidden');
                badge.classList.add('inline-flex');
            }
            if (countNum) countNum.textContent = selectedCount;
            if (markBtn) {
                markBtn.classList.remove('hidden');
                markBtn.classList.add('inline-flex');
            }
            if (delBtn) {
                delBtn.classList.remove('hidden');
                delBtn.classList.add('inline-flex');
            }
            if (deselectBtn) {
                deselectBtn.classList.remove('hidden');
            }
            if (deleteCount) deleteCount.textContent = selectedCount;
            if (markCount) markCount.textContent = selectedCount;
        } else {
            if (badge) badge.classList.add('hidden');
            if (markBtn) markBtn.classList.add('hidden');
            if (delBtn) delBtn.classList.add('hidden');
            if (deselectBtn) deselectBtn.classList.add('hidden');
        }

        document.querySelectorAll('.notif-item-cb').forEach(cb => {
            const card = cb.closest('.notif-card');
            if (card) {
                if (cb.checked) {
                    card.classList.add('ring-2', 'ring-indigo-500/40', 'bg-indigo-50/50');
                } else {
                    card.classList.remove('ring-2', 'ring-indigo-500/40', 'bg-indigo-50/50');
                }
            }
        });
    }

    function confirmDeleteSelected() {
        const visibleNotifs = getCurrentlyFilteredNotifs();
        const idsToDelete = visibleNotifs.map(n => String(n.id)).filter(id => selectedNotifIds.has(id));
        if (idsToDelete.length === 0) {
            showToast('Chưa chọn thông báo nào để xóa');
            return;
        }

        pendingDeleteIds = idsToDelete;
        document.getElementById('deleteModalTitle').textContent = \`Xác nhận xóa \${idsToDelete.length} thông báo\`;
        document.getElementById('deleteModalDesc').textContent = \`Bạn có chắc chắn muốn xóa \${idsToDelete.length} thông báo đã chọn không? Thao tác này sẽ xóa vĩnh viễn khỏi danh sách.\`;
        document.getElementById('deleteConfirmModal').classList.remove('hidden');
    }

    function confirmDeleteSingle(id) {
        pendingDeleteIds = [String(id)];
        document.getElementById('deleteModalTitle').textContent = 'Xác nhận xóa thông báo';
        document.getElementById('deleteModalDesc').textContent = 'Bạn có chắc chắn muốn xóa thông báo này không? Thao tác này sẽ xóa vĩnh viễn khỏi danh sách.';
        document.getElementById('deleteConfirmModal').classList.remove('hidden');
    }

    function closeDeleteModal() {
        pendingDeleteIds = [];
        document.getElementById('deleteConfirmModal').classList.add('hidden');
    }

    function executeDelete() {
        if (!pendingDeleteIds || pendingDeleteIds.length === 0) {
            closeDeleteModal();
            return;
        }

        const count = pendingDeleteIds.length;
        if (typeof CargoStore !== 'undefined' && CargoStore.deleteNotifications) {
            CargoStore.deleteNotifications(pendingDeleteIds);
        }

        pendingDeleteIds.forEach(id => selectedNotifIds.delete(id));
        closeDeleteModal();
        showToast(\`Đã xóa \${count} thông báo thành công\`);
        renderNotifications();
    }

    function markSelectedAsRead() {
        const visibleNotifs = getCurrentlyFilteredNotifs();
        const idsToMark = visibleNotifs.map(n => String(n.id)).filter(id => selectedNotifIds.has(id));
        if (idsToMark.length === 0) return;

        const data = CargoStore.getData ? CargoStore.getData() : null;
        if (data && data.notifications) {
            const idSet = new Set(idsToMark);
            data.notifications.forEach(n => {
                if (idSet.has(String(n.id))) {
                    n.read = true;
                }
            });
            if (CargoStore.saveData) CargoStore.saveData(data);
        }

        showToast(\`Đã đánh dấu \${idsToMark.length} thông báo là đã đọc\`);
        renderNotifications();
    }

    function renderNotifSubscribedBadges() {
        const container = document.getElementById('notifSubscribedBadges');
        if (!container || typeof CargoStore === 'undefined') return;

        const subs = CargoStore.getRouteSubscriptions ? CargoStore.getRouteSubscriptions() : { routes: [] };
        const routes = subs.routes || [];

        if (routes.length === 0) {
            container.innerHTML = \`<span class="text-slate-400 italic text-[11px]">Chưa chọn tuyến nào</span>\`;
            return;
        }

        container.innerHTML = routes.map(r => \`
            <span class="inline-flex items-center gap-1.5 bg-white border border-indigo-200 text-indigo-900 font-bold px-2 py-0.5 rounded-lg text-[10px] shadow-2xs">
                <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                <span>\${r}</span>
                <button type="button" onclick="handleQuickToggleRoute('\${r}')" class="text-slate-400 hover:text-red-500 ml-0.5 cursor-pointer" title="Tắt thông báo tuyến \${r}">
                    <i class="fa-solid fa-xmark text-[9px]"></i>
                </button>
            </span>
        \`).join('');
    }

    function handleQuickToggleRoute(routePair) {
        if (typeof CargoStore === 'undefined' || !CargoStore.toggleRouteSubscription) return;
        const res = CargoStore.toggleRouteSubscription(null, routePair);
        showToast(res.message);
        renderNotifSubscribedBadges();
    }

    function openRouteAlertModal() {
        if (typeof CargoStore === 'undefined') return;

        const subs = CargoStore.getRouteSubscriptions ? CargoStore.getRouteSubscriptions() : { routes: [] };
        const availableRoutes = CargoStore.getAvailableRoutes ? CargoStore.getAvailableRoutes() : [];
        const curRoutes = (subs.routes || []).map(r => r.replace(/\\s+/g, '').toUpperCase());

        const grid = document.getElementById('routeCheckboxesGrid');
        if (grid) {
            grid.innerHTML = availableRoutes.map(r => {
                const cleanPair = r.pair.replace(/\\s+/g, '').toUpperCase();
                const isChecked = curRoutes.includes(cleanPair);
                return \`
                    <label class="flex items-center justify-between p-3 rounded-xl border \${isChecked ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-200 bg-white hover:bg-slate-50'} transition cursor-pointer select-none">
                        <div class="flex items-center gap-2">
                            <i class="fa-solid fa-plane-departure \${isChecked ? 'text-indigo-600' : 'text-slate-400'} text-xs"></i>
                            <span class="font-bold text-slate-900 text-xs">\${r.pair}</span>
                            <span class="text-[10px] text-slate-500 hidden sm:inline">(\${r.origin} ➔ \${r.dest})</span>
                        </div>
                        <input type="checkbox" name="routeSubCheckbox" value="\${r.pair}" \${isChecked ? 'checked' : ''} class="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500">
                    </label>
                \`;
            }).join('');
        }

        document.getElementById('subNotifyNewAuction').checked = subs.notifyOnNewAuction !== false;
        document.getElementById('subNotifyOutbid').checked = subs.notifyOnOutbid !== false;
        document.getElementById('subNotifyClosingSoon').checked = subs.notifyOnClosingSoon !== false;
        document.getElementById('subEmailAlert').checked = subs.emailAlert !== false;

        const curUser = CargoStore.getCurrentUser ? CargoStore.getCurrentUser() : null;
        const emailDisp = document.getElementById('subEmailDisplay');
        if (emailDisp) {
            emailDisp.textContent = (curUser && curUser.email) ? curUser.email : 'email_daily@cargoagent.vn';
        }

        document.getElementById('routeAlertModal').classList.remove('hidden');
    }

    function closeRouteAlertModal() {
        document.getElementById('routeAlertModal').classList.add('hidden');
    }

    function handleSaveRouteAlertForm(e) {
        e.preventDefault();
        if (typeof CargoStore === 'undefined' || !CargoStore.saveRouteSubscriptions) return;

        const checkedBoxes = Array.from(document.querySelectorAll('input[name="routeSubCheckbox"]:checked')).map(cb => cb.value);
        const notifyNew = document.getElementById('subNotifyNewAuction').checked;
        const notifyOutbid = document.getElementById('subNotifyOutbid').checked;
        const notifyClosing = document.getElementById('subNotifyClosingSoon').checked;
        const emailAlert = document.getElementById('subEmailAlert').checked;

        const res = CargoStore.saveRouteSubscriptions(null, {
            routes: checkedBoxes,
            notifyOnNewAuction: notifyNew,
            notifyOnOutbid: notifyOutbid,
            notifyOnClosingSoon: notifyClosing,
            emailAlert: emailAlert,
            soundAlert: true
        });

        if (res.success) {
            showToast(res.message);
            closeRouteAlertModal();
            renderNotifSubscribedBadges();
        }
    }

    function markReadById(id) {
        if (typeof CargoStore !== 'undefined' && CargoStore.markNotificationRead) {
            CargoStore.markNotificationRead(id);
        }
        renderNotifications();
    }

    function markAllRead() {
        if (typeof CargoStore !== 'undefined' && CargoStore.markAllNotificationsRead) {
            CargoStore.markAllNotificationsRead();
        }
        showToast('Đã đánh dấu tất cả là đã đọc');
        renderNotifications();
    }

    function clearAllRead() {
        const data = CargoStore.getData ? CargoStore.getData() : null;
        if (!data) return;
        const user = CargoStore.getCurrentUser ? CargoStore.getCurrentUser() : null;
        const myCode = user ? String(user.agentCode || user.code || '').trim().toUpperCase() : null;
        if (!Array.isArray(data.deletedNotificationIds)) data.deletedNotificationIds = [];
        data.notifications = (data.notifications || []).filter(n => {
            if (n.targetRole === 'ADMIN' || n.targetRole === 'STAFF') return true;
            const targetCode = String(n.targetAgentCode || '').trim().toUpperCase();
            if (!user || !targetCode || targetCode === myCode) {
                if (n.read) {
                    data.deletedNotificationIds.push(String(n.id));
                    return false;
                }
                return true;
            }
            return true;
        });
        if (CargoStore.saveData) CargoStore.saveData(data);
        showToast('Đã xóa các thông báo đã đọc');
        renderNotifications();
    }

    function showToast(msg) {
        const t = document.getElementById('toast');
        if (!t) return;
        document.getElementById('toastText').textContent = msg;
        t.classList.remove('hidden');
        setTimeout(() => t.classList.add('hidden'), 2800);
    }

    function toggleAgentMobileNav() {
        const nav = document.getElementById('agentMobileNav');
        if (nav) nav.classList.toggle('hidden');
    }

    document.addEventListener('DOMContentLoaded', function() {
        renderNotifications();
    });

    window.addEventListener('storage', function(e) {
        if (e.key === 'CARGO_BIDDING_DATA_V3') {
            renderNotifications();
        }
    });
    window.addEventListener('cargostore_updated', renderNotifications);
    </script>`;

    content = content.substring(0, scriptStartIndex) + cleanScript + content.substring(scriptEndIndex + scriptEndMarker.length);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Successfully cleaned up 08-Notifications.html script block!');
} else {
    console.error('Could not find script markers in 08-Notifications.html');
}
