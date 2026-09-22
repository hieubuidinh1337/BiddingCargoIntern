const fs = require('fs');
const path = require('path');

// Mock localStorage and DOM for node environment
const localStorageMap = new Map();
global.localStorage = {
    getItem: (key) => localStorageMap.get(key) || null,
    setItem: (key, val) => localStorageMap.set(key, String(val)),
    removeItem: (key) => localStorageMap.delete(key),
    clear: () => localStorageMap.clear()
};

let lastLocationHref = '';
global.window = { 
    location: { 
        pathname: '/Admin/01-Dashboard.html', 
        protocol: 'http:',
        get href() { return lastLocationHref; },
        set href(v) { lastLocationHref = v; }
    }, 
    dispatchEvent: () => {}, 
    addEventListener: () => {} 
};

let innerHTMLStore = '';
global.document = { 
    getElementById: (id) => {
        if (id === 'adminNotifList') {
            return {
                set innerHTML(val) { innerHTMLStore = val; },
                get innerHTML() { return innerHTMLStore; }
            };
        }
        return null;
    }, 
    addEventListener: () => {} 
};

// Load server_data.json into localStorage
const serverData = JSON.parse(fs.readFileSync(path.join(__dirname, '../server_data.json'), 'utf8'));
localStorageMap.set('CARGO_BIDDING_DATA_V3', JSON.stringify(serverData));

// Require cargo-store
const CargoStore = require(path.join(__dirname, '../assets/js/cargo-store.js'));

console.log('=== TEST ADMIN REFUND NOTIFICATION NAVIGATION ===');

const data = CargoStore.getData();
data.currentAdmin = { username: 'admin', fullName: 'Quản trị viên', role: 'ADMIN' };
data.notifications = data.notifications || [];
data.notifications.unshift({
    id: 999888777,
    targetRole: 'ADMIN',
    title: 'Yêu cầu hoàn tiền từ đại lý AG-0892',
    message: 'Don hang WON-20260922-02 can xac nhan hoan tien.',
    time: 'Vừa xong',
    type: 'REFUND_REQUEST',
    read: false,
    wonId: 'WON-20260922-02',
    link: '03-AuctionList.html?tab=refund&refund=WON-20260922-02'
});
CargoStore.saveData(data);

// Test rendering admin notification list
CargoStore.renderAdminNotificationList();
console.log('Admin Notification List Render Output:');
console.log(innerHTMLStore);

if (!innerHTMLStore.includes('Xem & Xử lý hoàn tiền') || !innerHTMLStore.includes('03-AuctionList.html?tab=refund&refund=WON-20260922-02')) {
    console.error('FAIL: Action button for refund was not rendered!');
    process.exit(1);
}

// Test click navigation
CargoStore.handleAdminNotifClick({ target: { closest: () => null } }, 999888777);
console.log('\nNavigated URL on click:', lastLocationHref);

if (!lastLocationHref.includes('03-AuctionList.html?tab=refund&refund=WON-20260922-02')) {
    console.error('FAIL: Click did not navigate to refund modal URL!');
    process.exit(1);
}

console.log('\n✅ ADMIN REFUND NOTIFICATION NAVIGATION TEST PASSED SUCCESSFULLY!');
