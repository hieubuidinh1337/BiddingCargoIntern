/**
 * CARGO BIDDING SYSTEM - Modular Store Entry Point & Loader
 * Dữ liệu & nghiệp vụ đã được tách thành 8 phân hệ độc lập trong /assets/js/modules/
 * và kết nối trực tiếp với các REST API C# ASP.NET Core (/api/*).
 */
(function () {
    if (typeof window === 'undefined' || window.__CargoModulesLoaded) return;

    const MODULES = [
        'store-seeds-utils.js',
        'store-sync.js',
        'store-auth-permissions.js',
        'store-auctions-bidding.js',
        'store-registrations-security.js',
        'store-settlement-payments.js',
        'store-admin-rbac.js',
        'store-routes-ui.js'
    ];

    let basePath = '/assets/js/modules/';
    try {
        const currentScript = document.currentScript || document.querySelector('script[src*="cargo-store.js"]');
        if (currentScript && currentScript.src) {
            const srcUrl = currentScript.getAttribute('src') || '';
            const idx = srcUrl.lastIndexOf('cargo-store.js');
            if (idx >= 0) {
                basePath = srcUrl.substring(0, idx) + 'modules/';
            }
        }
    } catch (e) { }

    const CACHE_VER = '?v=20261029_3';
    if (typeof document !== 'undefined' && document.readyState === 'loading') {
        const tags = MODULES.map(m => `<script src="${basePath}${m}${CACHE_VER}"><\/script>`).join('\n');
        document.write(tags);
    } else if (typeof document !== 'undefined' && document.head) {
        MODULES.forEach(m => {
            const s = document.createElement('script');
            s.src = basePath + m + CACHE_VER;
            s.async = false;
            document.head.appendChild(s);
        });
    }
})();
