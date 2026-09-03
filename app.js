/* ==========================================================================
   Vietravel Airlines - Bidding Cargo System (Application Core Controller)
   ========================================================================== */

let currentUser = null;
let currentRole = 'guest'; // 'guest' | 'agent' | 'staff' | 'admin'
let countdownInterval = null;

// Currency Formatter
function formatVND(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function formatDate(isoStr) {
    if (!isoStr) return '--:--';
    const d = new Date(isoStr);
    return d.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// Toast Notifications
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'danger') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initRoleSimulator();
    setupNavigation();
    setupForms();
    startCountdownTimer();
    renderAllViews();
});

// Role Switcher Simulation
function initRoleSimulator() {
    const rolePills = document.querySelectorAll('.role-pill');
    rolePills.forEach(pill => {
        pill.addEventListener('click', (e) => {
            rolePills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            
            const selectedRole = pill.dataset.role;
            setRole(selectedRole);
        });
    });
    
    // Set Default Role as Guest
    setRole('guest');
}

function setRole(role) {
    currentRole = role;
    const users = db.getUsers();
    
    // Pick active mock user based on role
    if (role === 'guest') {
        currentUser = null;
    } else if (role === 'agent') {
        currentUser = users.find(u => u.role === 'agent') || users[2];
    } else if (role === 'staff') {
        currentUser = users.find(u => u.role === 'staff') || users[1];
    } else if (role === 'admin') {
        currentUser = users.find(u => u.role === 'admin') || users[0];
    }
    
    updateHeaderUserBadge();
    updateSidebarVisibility();
    
    // Switch default tab for that role
    if (role === 'guest') switchToTab('guest-home');
    if (role === 'agent') switchToTab('agent-auctions');
    if (role === 'staff') switchToTab('staff-manage');
    if (role === 'admin') switchToTab('admin-approvals');
    
    renderAllViews();
}

function updateHeaderUserBadge() {
    const avatar = document.getElementById('userAvatarCircle');
    const userName = document.getElementById('currentUserName');
    const roleTag = document.getElementById('currentUserRoleTag');
    const authBtn = document.getElementById('authActionBtn');

    if (!currentUser) {
        avatar.textContent = 'K';
        userName.textContent = 'Khách Vãng Lai';
        roleTag.textContent = 'VAI TRÒ: KHÁCH';
        authBtn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Đăng Nhập`;
        authBtn.onclick = openLoginModal;
    } else {
        avatar.textContent = currentUser.name.charAt(0).toUpperCase();
        userName.textContent = currentUser.company || currentUser.name;
        roleTag.textContent = `VAI TRÒ: ${currentUser.role.toUpperCase()} (${currentUser.agentCode || 'VU'})`;
        authBtn.innerHTML = `<i class="fa-solid fa-right-from-bracket"></i> Đăng Xuất`;
        authBtn.onclick = () => {
            setRole('guest');
            showToast('Đã đăng xuất khỏi hệ thống', 'info');
        };
    }
}

function updateSidebarVisibility() {
    const groups = document.querySelectorAll('.menu-group');
    groups.forEach(g => {
        if (g.dataset.group === currentRole) {
            g.classList.remove('hidden');
        } else {
            g.classList.add('hidden');
        }
    });
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabTarget = item.dataset.tab;
            switchToTab(tabTarget);
        });
    });
}

function switchToTab(tabId) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(i => i.classList.remove('active'));

    const currentNav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    if (currentNav) currentNav.classList.add('active');

    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(t => t.classList.remove('active'));

    const activeTab = document.getElementById(`tab-${tabId}`);
    if (activeTab) {
        activeTab.classList.add('active');
        renderAllViews();
    }
}

// Global View Render Dispatcher
function renderAllViews() {
    renderAgentAuctions();
    renderAgentHistory();
    renderAgentProfile();
    renderStaffFlightTable();
    renderStaffWinnersReport();
    renderAdminApprovals();
    renderAdminUsers();
    updateCounts();
}

function updateCounts() {
    const flights = db.getFlights();
    const activeFlights = flights.filter(f => f.status === 'OPEN');
    document.getElementById('activeAuctionCount').textContent = activeFlights.length;

    const regs = db.getRegistrations();
    const pendingRegs = regs.filter(r => r.status === 'PENDING');
    document.getElementById('pendingApprovalCount').textContent = pendingRegs.length;
}

/* ==========================================================================
   AGENTS VIEW: Bidding & Flight Cards
   ========================================================================== */

function renderAgentAuctions() {
    const cardsContainer = document.getElementById('agentAuctionCards');
    if (!cardsContainer) return;

    const flights = db.getFlights();
    const filterRoute = document.getElementById('agentFlightFilter')?.value || 'ALL';
    
    let filtered = flights.filter(f => f.status === 'OPEN');
    if (filterRoute !== 'ALL') {
        filtered = filtered.filter(f => f.route === filterRoute);
    }

    if (filtered.length === 0) {
        cardsContainer.innerHTML = `
            <div class="card full-width" style="grid-column: 1/-1; text-align: center; padding: 48px;">
                <i class="fa-solid fa-plane-slash" style="font-size: 48px; color: var(--text-muted); margin-bottom: 16px;"></i>
                <h3>Hiện Chưa Có Chuyến Bay Đấu Giá</h3>
                <p style="color: var(--text-secondary);">Vui lòng quay lại sau hoặc liên hệ bộ phận Vận tải Vietravel Airlines.</p>
            </div>
        `;
        return;
    }

    const bids = db.getBids();

    cardsContainer.innerHTML = filtered.map(fl => {
        const flightBids = bids.filter(b => b.flightId === fl.id);
        const myBid = currentUser ? flightBids.find(b => b.agentId === currentUser.id) : null;
        
        return `
            <div class="auction-card">
                <div>
                    <div class="auction-card-header">
                        <div>
                            <span class="flight-code">${fl.flightNumber}</span>
                            <div style="font-size: 11px; color: var(--text-muted);">Khởi hành: ${formatDate(fl.departureTime)}</div>
                        </div>
                        <span class="route-badge">${fl.route}</span>
                    </div>

                    <div class="flight-info-rows">
                        <div class="info-row">
                            <span class="label">Sức chứa Cargo đấu giá:</span>
                            <span class="val">${fl.payloadCapacityKg.toLocaleString('vi-VN')} Kg (${(fl.payloadCapacityKg/1000).toFixed(1)} Tấn)</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Giá tham khảo Hãng:</span>
                            <span class="val text-gold">${formatVND(fl.referencePriceKg)} / kg</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Hình thức đấu giá:</span>
                            <span class="val text-cyan"><i class="fa-solid fa-lock"></i> Đấu giá kín niêm phong</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Lượt đấu kín hiện tại:</span>
                            <span class="val">${flightBids.length} lượt</span>
                        </div>
                    </div>

                    <div class="timer-box" id="timer-box-${fl.id}">
                        <div class="timer-title"><i class="fa-solid fa-stopwatch"></i> THỜI GIAN ĐẤU GIÁ CÒN LẠI</div>
                        <div class="timer-countdown" id="countdown-${fl.id}">--:--:--</div>
                    </div>
                </div>

                <div>
                    ${myBid ? `
                        <div style="background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: var(--radius-md); padding: 12px; margin-bottom: 12px; font-size: 12px;">
                            <i class="fa-solid fa-circle-check text-success"></i> Bạn đã nộp giá kín: <strong class="text-gold">${formatVND(myBid.bidPriceKg)} / kg</strong> (${myBid.bidWeightKg.toLocaleString()} kg)
                        </div>
                    ` : ''}

                    <button class="btn btn-primary btn-block btn-lg" onclick="openBidModal('${fl.id}')">
                        <i class="fa-solid fa-gavel"></i> ${myBid ? 'Cập Nhật Mức Giá Đấu Kín' : 'Tham Gia Đấu Giá Kín'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Countdown Timer Engine
function startCountdownTimer() {
    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
        const flights = db.getFlights();
        const nowMs = new Date().getTime();

        flights.forEach(fl => {
            const el = document.getElementById(`countdown-${fl.id}`);
            if (!el) return;

            if (fl.status === 'CLOSED') {
                el.textContent = 'ĐÃ ĐÓNG PHIÊN';
                const timerBox = document.getElementById(`timer-box-${fl.id}`);
                if (timerBox) timerBox.classList.add('closed');
                return;
            }

            const endMs = new Date(fl.endTime).getTime();
            const diff = endMs - nowMs;

            if (diff <= 0) {
                el.textContent = '00:00:00 - HẾT GIỜ';
                // Auto close flight auction!
                db.updateFlightStatus(fl.id, 'CLOSED');
                renderAllViews();
            } else {
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);

                const hStr = hours < 10 ? `0${hours}` : hours;
                const mStr = minutes < 10 ? `0${minutes}` : minutes;
                const sStr = seconds < 10 ? `0${seconds}` : seconds;

                el.textContent = `${hStr}:${mStr}:${sStr}`;
            }
        });
    }, 1000);
}

// Open Sealed Bid Modal
function openBidModal(flightId) {
    if (!currentUser || currentUser.role !== 'agent') {
        showToast('Bạn cần đăng nhập tài khoản Đại Lý VU để thực hiện đặt giá!', 'danger');
        openLoginModal();
        return;
    }

    const flights = db.getFlights();
    const flight = flights.find(f => f.id === flightId);
    if (!flight) return;

    document.getElementById('modalFlightId').value = flight.id;
    document.getElementById('bidModalFlightSummary').innerHTML = `
        <div class="summary-item">
            <label>Số Hiệu CB:</label>
            <strong>${flight.flightNumber} (${flight.route})</strong>
        </div>
        <div class="summary-item">
            <label>Tải Trọng Đấu:</label>
            <strong>${flight.payloadCapacityKg.toLocaleString()} Kg</strong>
        </div>
        <div class="summary-item">
            <label>Giá Tham Khảo VU:</label>
            <strong>${formatVND(flight.referencePriceKg)} / kg</strong>
        </div>
    `;

    document.getElementById('bidPriceHint').textContent = `Mức giá tham khảo của Vietravel Airlines: ${formatVND(flight.referencePriceKg)} / kg`;
    document.getElementById('bidWeightInput').value = flight.payloadCapacityKg;

    // Check existing bid
    const bids = db.getBids();
    const existing = bids.find(b => b.flightId === flightId && b.agentId === currentUser.id);
    if (existing) {
        document.getElementById('bidPriceInput').value = existing.bidPriceKg;
        document.getElementById('bidWeightInput').value = existing.bidWeightKg;
        document.getElementById('bidCargoNote').value = existing.cargoNote || '';
    } else {
        document.getElementById('bidPriceInput').value = flight.referencePriceKg + 1000;
        document.getElementById('bidCargoNote').value = '';
    }

    calculateBidTotal();
    document.getElementById('bidModal').classList.add('active');
}

function calculateBidTotal() {
    const price = parseFloat(document.getElementById('bidPriceInput').value) || 0;
    const weight = parseFloat(document.getElementById('bidWeightInput').value) || 0;
    const total = price * weight;
    document.getElementById('estimatedTotalVal').textContent = formatVND(total);
}

document.getElementById('bidPriceInput')?.addEventListener('input', calculateBidTotal);
document.getElementById('bidWeightInput')?.addEventListener('input', calculateBidTotal);

// Agent Sealed Bid Submission Form
document.getElementById('submitSealedBidForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const flightId = document.getElementById('modalFlightId').value;
    const price = parseFloat(document.getElementById('bidPriceInput').value);
    const weight = parseFloat(document.getElementById('bidWeightInput').value);
    const note = document.getElementById('bidCargoNote').value;

    if (!price || price <= 0 || !weight || weight <= 0) {
        showToast('Vui lòng nhập giá đấu và trọng lượng hợp lệ!', 'danger');
        return;
    }

    const bids = db.getBids();
    const existingIndex = bids.findIndex(b => b.flightId === flightId && b.agentId === currentUser.id);

    const bidData = {
        id: existingIndex >= 0 ? bids[existingIndex].id : `BID-${Math.floor(1000 + Math.random() * 9000)}`,
        flightId: flightId,
        agentId: currentUser.id,
        agentCode: currentUser.agentCode,
        companyName: currentUser.company,
        bidPriceKg: price,
        bidWeightKg: weight,
        cargoNote: note,
        timestamp: new Date().toISOString(),
        isWinner: false
    };

    if (existingIndex >= 0) {
        bids[existingIndex] = bidData;
        db.saveBids(bids);
        showToast('Đã cập nhật mức giá đấu kín thành công!', 'success');
    } else {
        db.addBid(bidData);
        showToast('Đã niêm phong và lưu mức giá đấu kín thành công!', 'success');
    }

    closeModal('bidModal');
    renderAllViews();
});

// Render Agent Bid History
function renderAgentHistory() {
    const tbody = document.getElementById('agentBidHistoryBody');
    if (!tbody) return;

    if (!currentUser || currentUser.role !== 'agent') {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Vui lòng đăng nhập với vai trò Đại lý để xem lịch sử.</td></tr>`;
        return;
    }

    const bids = db.getBids().filter(b => b.agentId === currentUser.id);
    const flights = db.getFlights();

    if (bids.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Chưa có lịch sử đặt giá nào.</td></tr>`;
        return;
    }

    tbody.innerHTML = bids.map(bid => {
        const fl = flights.find(f => f.id === bid.flightId);
        const flStatus = fl ? fl.status : 'N/A';
        
        let resultBadge = '<span class="badge badge-info">Đang chờ đóng phiên</span>';
        if (flStatus === 'CLOSED') {
            if (bid.isWinner) {
                resultBadge = '<span class="badge badge-success"><i class="fa-solid fa-trophy"></i> Thắng Thầu VU</span>';
            } else {
                resultBadge = '<span class="badge badge-danger">Chưa Trúng Thầu</span>';
            }
        }

        return `
            <tr>
                <td><strong>${bid.id}</strong></td>
                <td><strong>${fl ? fl.flightNumber : bid.flightId}</strong></td>
                <td><span class="route-badge">${fl ? fl.route : '--'}</span></td>
                <td>${bid.bidWeightKg.toLocaleString()} kg</td>
                <td><strong class="text-gold">${formatVND(bid.bidPriceKg)}</strong></td>
                <td>${formatDate(bid.timestamp)}</td>
                <td><span class="badge ${flStatus === 'OPEN' ? 'badge-gold' : 'badge-danger'}">${flStatus === 'OPEN' ? 'ĐANG MỞ' : 'ĐÃ ĐÓNG'}</span></td>
                <td>${resultBadge}</td>
            </tr>
        `;
    }).join('');
}

// Render Agent Profile Tab
function renderAgentProfile() {
    const container = document.getElementById('agentProfileDetail');
    if (!container) return;

    if (!currentUser || currentUser.role !== 'agent') {
        container.innerHTML = `<p style="text-align: center; color: var(--text-muted);">Vui lòng đăng nhập tài khoản Đại Lý để xem hợp đồng.</p>`;
        return;
    }

    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px;">
            <div>
                <h4 style="color: var(--vu-gold); margin-bottom: 12px;"><i class="fa-solid fa-building"></i> Hồ Sơ Doanh Nghiệp</h4>
                <p><strong>Tên Đại Lý:</strong> ${currentUser.company}</p>
                <p><strong>Mã Hợp Đồng VU:</strong> ${currentUser.agentCode}</p>
                <p><strong>Email Đăng Ký:</strong> ${currentUser.email}</p>
                <p><strong>Hạng Đại Lý:</strong> <span class="badge badge-gold">${currentUser.tier || 'TIER1'} - Diamond Cargo Partner</span></p>
            </div>
            <div>
                <h4 style="color: var(--vu-cyan); margin-bottom: 12px;"><i class="fa-solid fa-file-contract"></i> Điều Khoản Đấu Giá Kín</h4>
                <p>• Bảo mật niêm phong 100% dữ liệu chào giá.</p>
                <p>• Quyền ưu tiên phân bổ tải trọng cho Hãng vận tải Vietravel Airlines.</p>
                <p>• Hạn mức thanh toán sau trúng thầu: 24h kể từ khi công bố kết quả.</p>
            </div>
        </div>
    `;
}

/* ==========================================================================
   STAFF VIEW: Cargo Operations & Flight Auction Management
   ========================================================================== */

function renderStaffFlightTable() {
    const tbody = document.getElementById('staffFlightTableBody');
    if (!tbody) return;

    const flights = db.getFlights();
    const bids = db.getBids();

    if (flights.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center;">Chưa có chuyến bay đấu giá nào.</td></tr>`;
        return;
    }

    tbody.innerHTML = flights.map(fl => {
        const flightBids = bids.filter(b => b.flightId === fl.id);
        const isOpen = (fl.status === 'OPEN');

        return `
            <tr>
                <td><strong class="text-gold">${fl.flightNumber}</strong></td>
                <td><span class="route-badge">${fl.route}</span></td>
                <td>${formatDate(fl.departureTime)}</td>
                <td>${(fl.payloadCapacityKg/1000).toFixed(1)} Tấn</td>
                <td>${formatVND(fl.referencePriceKg)}</td>
                <td><span id="countdown-staff-${fl.id}">${isOpen ? 'Đang chạy' : 'Đã đóng'}</span></td>
                <td>
                    <span class="badge badge-info">
                        <i class="fa-solid fa-lock"></i> ${flightBids.length} Lượt Đặt
                    </span>
                </td>
                <td>
                    <span class="badge ${isOpen ? 'badge-gold' : 'badge-danger'}">
                        ${isOpen ? 'ĐANG MỞ ĐẤU GIÁ' : 'ĐÃ ĐÓNG PHIÊN'}
                    </span>
                </td>
                <td>
                    <div style="display: flex; gap: 6px;">
                        <button class="btn btn-outline btn-sm" onclick="openViewBidsModal('${fl.id}')" title="Xem danh sách đấu giá">
                            <i class="fa-solid fa-eye"></i> Xem Bids
                        </button>
                        ${isOpen ? `
                            <button class="btn btn-secondary btn-sm" onclick="toggleFlightStatus('${fl.id}', 'CLOSED')" style="color: var(--danger);" title="Đóng thầu ngay">
                                <i class="fa-solid fa-lock"></i> Đóng Thầu
                            </button>
                        ` : `
                            <button class="btn btn-outline btn-sm" onclick="toggleFlightStatus('${fl.id}', 'OPEN')" title="Mở lại thầu">
                                <i class="fa-solid fa-lock-open"></i> Mở Lại
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function toggleFlightStatus(flightId, newStatus) {
    db.updateFlightStatus(flightId, newStatus);
    showToast(`Đã thay đổi trạng thái phiên chuyến bay sang ${newStatus === 'OPEN' ? 'ĐANG MỞ' : 'ĐÃ ĐÓNG'}`, 'info');
    renderAllViews();
}

// Create New Flight Form
document.getElementById('createFlightForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const num = document.getElementById('flNum').value.trim();
    const route = document.getElementById('flRoute').value;
    const depTime = document.getElementById('flDepTime').value;
    const payload = parseFloat(document.getElementById('flPayload').value) * 1000; // Convert Tấn to Kg
    const refPrice = parseFloat(document.getElementById('flRefPrice').value);
    const durationMins = parseInt(document.getElementById('flDuration').value);

    const nowTime = new Date();
    const endTime = new Date(nowTime.getTime() + durationMins * 60000);

    const newFlight = {
        id: `FL-${num.toUpperCase()}`,
        flightNumber: num.toUpperCase(),
        route: route,
        departureTime: depTime,
        payloadCapacityKg: payload,
        referencePriceKg: refPrice,
        startTime: nowTime.toISOString(),
        endTime: endTime.toISOString(),
        status: 'OPEN',
        allowedTiers: ['TIER1', 'TIER2', 'TIER3'],
        createdBy: currentUser ? currentUser.email : 'staff@vietravelairlines.vn'
    };

    db.addFlight(newFlight);
    showToast(`Đã tạo và mở phiên đấu giá cho chuyến bay ${num.toUpperCase()} thành công!`, 'success');
    switchToTab('staff-manage');
});

// View Bids Modal for Staff (Hides values if OPEN, Decrypts if CLOSED)
function openViewBidsModal(flightId) {
    const flights = db.getFlights();
    const flight = flights.find(f => f.id === flightId);
    if (!flight) return;

    const bids = db.getBids().filter(b => b.flightId === flightId);
    const isOpen = (flight.status === 'OPEN');

    document.getElementById('viewBidsFlightSummary').innerHTML = `
        <div class="summary-item">
            <label>Mã Chuyến Bay:</label>
            <strong>${flight.flightNumber} (${flight.route})</strong>
        </div>
        <div class="summary-item">
            <label>Trạng Thái Phiên:</label>
            <strong class="${isOpen ? 'text-gold' : 'text-danger'}">${isOpen ? 'ĐANG MỞ ĐẤU GIÁ' : 'ĐÃ ĐÓNG (GIẢI MÃ SUCCESS)'}</strong>
        </div>
        <div class="summary-item">
            <label>Tổng Lượt Đặt Kín:</label>
            <strong>${bids.length} Lượt Đại Lý</strong>
        </div>
    `;

    const warningEl = document.getElementById('sealedPrivacyWarning');
    if (isOpen) {
        warningEl.classList.remove('hidden');
    } else {
        warningEl.classList.add('hidden');
    }

    const tbody = document.getElementById('viewBidsTableBody');
    if (bids.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Chưa có đại lý nào gửi giá cho chuyến bay này.</td></tr>`;
    } else {
        tbody.innerHTML = bids.map(b => {
            // Privacy protection during OPEN state
            const displayPrice = isOpen ? '•••••••• (BẢO MẬT KÍN)' : formatVND(b.bidPriceKg);
            const displayTotal = isOpen ? '••••••••' : formatVND(b.bidPriceKg * b.bidWeightKg);
            const displayCompany = isOpen ? `${b.companyName.substring(0, 5)}***` : b.companyName;

            let winBadge = '<span class="badge badge-info">Chờ Đóng Phiên</span>';
            if (!isOpen) {
                winBadge = b.isWinner ? '<span class="badge badge-success"><i class="fa-solid fa-trophy"></i> CHIẾN THẮNG THẦU</span>' : '<span class="badge badge-danger">Không Trúng</span>';
            }

            return `
                <tr>
                    <td><strong>${b.agentCode}</strong></td>
                    <td>${displayCompany}</td>
                    <td>${formatDate(b.timestamp)}</td>
                    <td><strong class="text-gold">${displayPrice}</strong></td>
                    <td>${b.bidWeightKg.toLocaleString()} kg</td>
                    <td>${displayTotal}</td>
                    <td>${winBadge}</td>
                </tr>
            `;
        }).join('');
    }

    document.getElementById('viewBidsModal').classList.add('active');
}

// Render Staff Winners Report Tab
function renderStaffWinnersReport() {
    const tbody = document.getElementById('staffWinnersBody');
    if (!tbody) return;

    const flights = db.getFlights().filter(f => f.status === 'CLOSED');
    const bids = db.getBids();

    if (flights.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Chưa có chuyến bay nào kết thúc đấu giá.</td></tr>`;
        return;
    }

    tbody.innerHTML = flights.map(fl => {
        const winningBid = bids.find(b => b.flightId === fl.id && b.isWinner);

        if (!winningBid) {
            return `
                <tr>
                    <td><strong>${fl.flightNumber}</strong></td>
                    <td><span class="route-badge">${fl.route}</span></td>
                    <td colspan="5" style="color: var(--text-muted); text-align: center;">Không có đại lý tham gia đấu giá</td>
                    <td>--</td>
                </tr>
            `;
        }

        const totalValue = winningBid.bidPriceKg * winningBid.bidWeightKg;

        return `
            <tr>
                <td><strong class="text-gold">${fl.flightNumber}</strong></td>
                <td><span class="route-badge">${fl.route}</span></td>
                <td><strong>${winningBid.companyName}</strong> (${winningBid.agentCode})</td>
                <td><strong class="text-gold">${formatVND(winningBid.bidPriceKg)}</strong></td>
                <td>${(winningBid.bidWeightKg/1000).toFixed(1)} Tấn</td>
                <td><strong style="color: var(--success);">${formatVND(totalValue)}</strong></td>
                <td><span class="badge badge-success"><i class="fa-solid fa-paper-plane"></i> Đã Gửi Email & SMS</span></td>
                <td>
                    <button class="btn btn-outline btn-sm" onclick="sendWinnerNotification('${fl.flightNumber}', '${winningBid.companyName}')">
                        <i class="fa-solid fa-bell"></i> Gửi Lại Thư VU
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function sendWinnerNotification(flightNum, compName) {
    showToast(`Đã gửi lại thông báo kết quả trúng thầu cho chuyến bay ${flightNum} tới ${compName}!`, 'success');
}

function exportCargoReport() {
    showToast('Đã xuất báo cáo tổng hợp đấu giá Vietravel Airlines thành công (PDF/Excel)!', 'success');
}

/* ==========================================================================
   ADMIN VIEW: Approvals & Users
   ========================================================================== */

function renderAdminApprovals() {
    const tbody = document.getElementById('adminApprovalTableBody');
    if (!tbody) return;

    const regs = db.getRegistrations();

    if (regs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Không có hồ sơ nào chờ duyệt.</td></tr>`;
        return;
    }

    tbody.innerHTML = regs.map(r => `
        <tr>
            <td><strong>${r.id}</strong></td>
            <td><strong>${r.companyName}</strong></td>
            <td><span class="badge badge-gold">${r.agentCode}</span></td>
            <td>${r.email}<br><small>${r.phone}</small></td>
            <td>
                <div style="font-size: 11px;">
                    <i class="fa-solid fa-file-pdf text-gold"></i> ${r.biziDoc || 'DKKD_Scan.pdf'}<br>
                    <i class="fa-solid fa-file-contract text-cyan"></i> ${r.contractDoc || 'VU_Contract_2026.pdf'}
                </div>
            </td>
            <td>${formatDate(r.submittedAt)}</td>
            <td><span class="badge ${r.status === 'PENDING' ? 'badge-warning' : (r.status === 'APPROVED' ? 'badge-success' : 'badge-danger')}">${r.status}</span></td>
            <td>
                ${r.status === 'PENDING' ? `
                    <div style="display: flex; gap: 6px;">
                        <button class="btn btn-primary btn-sm" onclick="approveRegistration('${r.id}')">
                            <i class="fa-solid fa-check"></i> Duyệt & Kích Hoạt
                        </button>
                        <button class="btn btn-outline btn-sm" style="color: var(--danger);" onclick="rejectRegistration('${r.id}')">
                            <i class="fa-solid fa-xmark"></i> Từ Chối
                        </button>
                    </div>
                ` : `<span style="font-size: 12px; color: var(--text-muted);">Đã xử lý</span>`}
            </td>
        </tr>
    `).join('');
}

function approveRegistration(regId) {
    const regs = db.getRegistrations();
    const reg = regs.find(r => r.id === regId);
    if (!reg) return;

    reg.status = 'APPROVED';
    db.saveRegistrations(regs);

    // Create Agent user
    const users = db.getUsers();
    const newUser = {
        id: `USR-${Math.floor(100 + Math.random() * 900)}`,
        name: reg.companyName,
        email: reg.email,
        password: '123',
        role: 'agent',
        agentCode: reg.agentCode,
        company: reg.companyName,
        tier: 'TIER2',
        status: 'ACTIVE'
    };
    users.push(newUser);
    db.saveUsers(users);

    showToast(`Đã duyệt hồ sơ và kích hoạt tài khoản đại lý cho ${reg.companyName}!`, 'success');
    renderAllViews();
}

function rejectRegistration(regId) {
    const regs = db.getRegistrations();
    const reg = regs.find(r => r.id === regId);
    if (reg) {
        reg.status = 'REJECTED';
        db.saveRegistrations(regs);
        showToast(`Đã từ chối hồ sơ ${reg.companyName}`, 'info');
        renderAllViews();
    }
}

function renderAdminUsers() {
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;

    const users = db.getUsers();
    tbody.innerHTML = users.map(u => `
        <tr>
            <td><strong>${u.id}</strong></td>
            <td><strong>${u.company || u.name}</strong></td>
            <td>${u.email}</td>
            <td><span class="badge ${u.role === 'admin' ? 'badge-danger' : (u.role === 'staff' ? 'badge-gold' : 'badge-info')}">${u.role.toUpperCase()}</span></td>
            <td><span class="badge badge-success">${u.status}</span></td>
            <td>
                <button class="btn btn-outline btn-sm" onclick="showToast('Tài khoản đang hoạt động bình thường', 'info')">
                    <i class="fa-solid fa-pen-to-square"></i> Sửa Quyền
                </button>
            </td>
        </tr>
    `).join('');
}

/* ==========================================================================
   FORMS & MODALS HANDLERS
   ========================================================================== */

function setupForms() {
    // Agent Registration Form
    document.getElementById('agentRegisterForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const compName = document.getElementById('regCompName').value.trim();
        const agentCode = document.getElementById('regAgentCode').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const phone = document.getElementById('regPhone').value.trim();
        const address = document.getElementById('regAddress').value.trim();

        const biziFile = document.getElementById('fileBiziDoc').files[0];
        const contractFile = document.getElementById('fileContractDoc').files[0];

        const newReg = {
            id: `REG-${Math.floor(1000 + Math.random() * 9000)}`,
            companyName: compName,
            agentCode: agentCode,
            email: email,
            phone: phone,
            address: address,
            biziDoc: biziFile ? biziFile.name : 'GiayPhep_DKKD.pdf',
            contractDoc: contractFile ? contractFile.name : 'HopDong_VU_2026.pdf',
            submittedAt: new Date().toISOString(),
            status: 'PENDING'
        };

        db.addRegistration(newReg);
        showToast('Đã nộp hồ sơ đăng ký đại lý thành công! Admin Vietravel Airlines sẽ duyệt hồ sơ của bạn.', 'success');
        
        // Clear form
        document.getElementById('agentRegisterForm').reset();
        document.getElementById('fileBiziName').textContent = 'Chưa chọn file';
        document.getElementById('fileContractName').textContent = 'Chưa chọn file';

        // Switch to Guest Home
        switchToTab('guest-home');
    });

    // File name updates
    document.getElementById('fileBiziDoc')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        document.getElementById('fileBiziName').textContent = file ? file.name : 'Chưa chọn file';
    });
    document.getElementById('fileContractDoc')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        document.getElementById('fileContractName').textContent = file ? file.name : 'Chưa chọn file';
    });

    // Login Form
    document.getElementById('loginForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const users = db.getUsers();
        const found = users.find(u => u.email.toLowerCase() === email.toLowerCase());

        if (found) {
            // Find role pill and activate
            const pill = document.querySelector(`.role-pill[data-role="${found.role}"]`);
            if (pill) pill.click();

            currentUser = found;
            updateHeaderUserBadge();
            closeModal('loginModal');
            showToast(`Đăng nhập thành công với vai trò ${found.role.toUpperCase()} (${found.name})!`, 'success');
        } else {
            showToast('Không tìm thấy tài khoản với email này trên hệ thống VU!', 'danger');
        }
    });
}

function openLoginModal() {
    document.getElementById('loginModal').classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function quickFillLogin(email, password) {
    document.getElementById('loginEmail').value = email;
    document.getElementById('loginPassword').value = password;
}
