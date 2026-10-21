/**
 * CARGO BIDDING - Global SweetAlert2 & Modal Notification System
 * Replaces native browser alert() and confirm() with modern, responsive dialogs.
 */

(function () {
    // 1. Inject styles for SweetAlert2 customization
    const styleId = 'cargo-swal2-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .swal2-container {
                z-index: 999999 !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
            }
            .swal2-popup.cargo-swal-popup {
                border-radius: 1.25rem !important;
                padding: 1.75rem 1.5rem !important;
                background: #ffffff !important;
                box-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.15), 0 8px 10px -6px rgba(15, 23, 42, 0.1) !important;
                border: 1px solid #e2e8f0 !important;
                max-width: 32rem !important;
            }
            .swal2-popup.cargo-swal-popup .swal2-title {
                font-size: 1.2rem !important;
                font-weight: 700 !important;
                color: #0f172a !important;
                padding-top: 0.5rem !important;
                margin-bottom: 0.5rem !important;
            }
            .swal2-popup.cargo-swal-popup .swal2-html-container {
                margin: 0.75rem 0 1.25rem 0 !important;
                font-size: 0.875rem !important;
                line-height: 1.6 !important;
                color: #475569 !important;
                text-align: left !important;
                word-break: break-word !important;
                white-space: pre-line !important;
                max-height: 380px !important;
                overflow-y: auto !important;
                padding: 0 0.25rem !important;
            }
            .swal2-popup.cargo-swal-popup .swal2-actions {
                gap: 0.75rem !important;
                margin-top: 0.5rem !important;
                width: 100% !important;
                justify-content: flex-end !important;
            }
            .cargo-swal-confirm-btn {
                background-color: #2563eb !important;
                color: #ffffff !important;
                border-radius: 0.75rem !important;
                font-weight: 600 !important;
                font-size: 0.875rem !important;
                padding: 0.65rem 1.5rem !important;
                box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.25) !important;
                border: none !important;
                cursor: pointer !important;
                transition: all 0.15s ease-in-out !important;
            }
            .cargo-swal-confirm-btn:hover {
                background-color: #1d4ed8 !important;
                box-shadow: 0 6px 10px -1px rgba(37, 99, 235, 0.35) !important;
            }
            .cargo-swal-danger-btn {
                background-color: #ef4444 !important;
                color: #ffffff !important;
                border-radius: 0.75rem !important;
                font-weight: 600 !important;
                font-size: 0.875rem !important;
                padding: 0.65rem 1.5rem !important;
                box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.25) !important;
                border: none !important;
                cursor: pointer !important;
                transition: all 0.15s ease-in-out !important;
            }
            .cargo-swal-danger-btn:hover {
                background-color: #dc2626 !important;
                box-shadow: 0 6px 10px -1px rgba(239, 68, 68, 0.35) !important;
            }
            .cargo-swal-cancel-btn {
                background-color: #f1f5f9 !important;
                color: #475569 !important;
                border-radius: 0.75rem !important;
                font-weight: 600 !important;
                font-size: 0.875rem !important;
                padding: 0.65rem 1.25rem !important;
                border: 1px solid #cbd5e1 !important;
                cursor: pointer !important;
                transition: all 0.15s ease-in-out !important;
            }
            .cargo-swal-cancel-btn:hover {
                background-color: #e2e8f0 !important;
                color: #0f172a !important;
            }
        `;
        document.head.appendChild(style);
    }

    // 2. Ensure SweetAlert2 JS is loaded
    function ensureSweetAlertScript(callback) {
        if (typeof Swal !== 'undefined') {
            if (callback) callback();
            return;
        }
        if (document.getElementById('swal2-bundle')) return;

        const script = document.createElement('script');
        script.id = 'swal2-bundle';
        const isSubdir = window.location.pathname.includes('/Admin/') || window.location.pathname.includes('\\Admin\\');
        const prefix = isSubdir ? '../' : '';
        script.src = prefix + 'assets/js/sweetalert2.all.min.js';
        script.onload = () => {
            if (callback) callback();
        };
        document.head.appendChild(script);
    }
    ensureSweetAlertScript();

    // 3. Helper: Global Custom Alert
    const _originalAlert = window.alert;

    window.showAlert = function (messageOrOptions, optionalType) {
        if (typeof Swal === 'undefined') {
            ensureSweetAlertScript(() => window.showAlert(messageOrOptions, optionalType));
            if (typeof messageOrOptions === 'string') {
                _originalAlert(messageOrOptions);
            }
            return Promise.resolve();
        }

        let text = '';
        let title = 'Thông báo';
        let icon = optionalType || 'info';

        if (typeof messageOrOptions === 'string') {
            text = messageOrOptions;
            if (!optionalType) {
                if (text.includes('✅') || text.toLowerCase().includes('thành công')) {
                    icon = 'success';
                    title = 'Thành công';
                } else if (text.includes('❌') || text.toLowerCase().includes('thất bại') || text.toLowerCase().includes('lỗi') || text.toLowerCase().includes('không thể') || text.toLowerCase().includes('không đúng') || text.toLowerCase().includes('sai')) {
                    icon = 'error';
                    title = 'Không thể thực hiện';
                } else if (text.includes('⚠️') || text.includes('🔒') || text.toLowerCase().includes('tối thiểu') || text.toLowerCase().includes('vui lòng') || text.toLowerCase().includes('chưa') || text.toLowerCase().includes('cảnh báo')) {
                    icon = 'warning';
                    title = 'Lưu ý';
                }
            }
        } else if (typeof messageOrOptions === 'object' && messageOrOptions !== null) {
            text = messageOrOptions.text || messageOrOptions.html || '';
            title = messageOrOptions.title || title;
            icon = messageOrOptions.icon || optionalType || icon;
        }

        let cleanText = text.replace(/^[✅❌⚠️🔒ℹ️\s]+/, '');

        return Swal.fire({
            title: title,
            text: cleanText,
            icon: icon,
            confirmButtonText: 'Đã hiểu',
            buttonsStyling: false,
            customClass: {
                popup: 'cargo-swal-popup',
                confirmButton: 'cargo-swal-confirm-btn'
            }
        });
    };

    // Override native window.alert globally
    window.alert = function (message) {
        return window.showAlert(message);
    };

    // 4. Helper: Global Custom Confirm Modal
    window.showConfirm = async function (messageOrOptions) {
        if (typeof Swal === 'undefined') {
            return window.confirm(typeof messageOrOptions === 'string' ? messageOrOptions : (messageOrOptions.text || 'Xác nhận?'));
        }

        let text = '';
        let title = 'Xác nhận thao tác';
        let confirmText = 'Xác nhận';
        let cancelText = 'Hủy bỏ';
        let icon = 'question';
        let isDanger = false;

        if (typeof messageOrOptions === 'string') {
            text = messageOrOptions;
            if (text.includes('XÁC NHẬN NỘP PHIẾU GIÁ THẦU')) {
                title = 'Xác nhận nộp phiếu thầu';
                confirmText = 'Nộp giá thầu ngay';
                icon = 'info';
            } else if (text.toLowerCase().includes('xóa') || text.toLowerCase().includes('reset') || text.toLowerCase().includes('từ chối')) {
                title = 'Cảnh báo thao tác';
                confirmText = 'Đồng ý thực hiện';
                isDanger = true;
                icon = 'warning';
            } else if (text.includes('chốt') || text.includes('Chốt')) {
                title = 'Xác nhận chốt phiên / Duyệt';
                confirmText = 'Xác nhận ngay';
                icon = 'question';
            }
        } else if (typeof messageOrOptions === 'object' && messageOrOptions !== null) {
            text = messageOrOptions.text || messageOrOptions.html || '';
            title = messageOrOptions.title || title;
            confirmText = messageOrOptions.confirmText || confirmText;
            cancelText = messageOrOptions.cancelText || cancelText;
            icon = messageOrOptions.icon || icon;
            isDanger = !!messageOrOptions.danger;
        }

        let cleanText = text.replace(/^[❓⚠️ℹ️\s]+/, '');

        const result = await Swal.fire({
            title: title,
            text: cleanText,
            icon: icon,
            showCancelButton: true,
            confirmButtonText: confirmText,
            cancelButtonText: cancelText,
            reverseButtons: true,
            focusCancel: false,
            buttonsStyling: false,
            customClass: {
                popup: 'cargo-swal-popup',
                confirmButton: isDanger ? 'cargo-swal-danger-btn' : 'cargo-swal-confirm-btn',
                cancelButton: 'cargo-swal-cancel-btn'
            }
        });

        return !!result.isConfirmed;
    };

    // 5. Helper: Global Toast Notification
    window.showToast = function (message, type = 'success') {
        if (typeof Swal === 'undefined') {
            console.log(`[Toast ${type}]`, message);
            return;
        }
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3500,
            timerProgressBar: true,
            didOpen: (toast) => {
                toast.addEventListener('mouseenter', Swal.stopTimer);
                toast.addEventListener('mouseleave', Swal.resumeTimer);
            }
        });

        return Toast.fire({
            icon: type,
            title: message
        });
    };

    // Also attach to window.CargoStore if available
    if (typeof window.CargoStore !== 'undefined') {
        window.CargoStore.alert = window.showAlert;
        window.CargoStore.confirm = window.showConfirm;
        window.CargoStore.toast = window.showToast;
    }
})();
