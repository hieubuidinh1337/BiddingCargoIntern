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
global.window = { location: { pathname: '/08-Notifications.html', protocol: 'file:' }, dispatchEvent: () => {}, addEventListener: () => {} };
global.document = { getElementById: () => null, addEventListener: () => {} };

// Load server_data.json into localStorage
const serverData = JSON.parse(fs.readFileSync(path.join(__dirname, '../server_data.json'), 'utf8'));
localStorageMap.set('CARGO_BIDDING_DATA_V3', JSON.stringify(serverData));

// Require cargo-store
const CargoStore = require(path.join(__dirname, '../assets/js/cargo-store.js'));

console.log('=== TEST NOTIFICATIONS ACROSS ALL AGENTS ===');

const agents = ['AG-0892', 'AG-0556', 'AG-1024', 'AG-0341'];

agents.forEach(code => {
    // Set current user
    const data = CargoStore.getData();
    data.currentUser = { agentCode: code, code: code, fullName: `Đại lý ${code}` };
    CargoStore.saveData(data);

    const notifs = CargoStore.getNotifications();
    console.log(`\nAgent ${code} has ${notifs.length} notifications:`);
    notifs.forEach(n => {
        console.log(` - [${n.read ? 'READ' : 'UNREAD'}] ID: ${n.id} | Title: ${n.title}`);
    });
});

// Test marking read for AG-0892
console.log('\n--- TESTING MARK AS READ FOR AG-0892 ---');
let data = CargoStore.getData();
data.currentUser = { agentCode: 'AG-0892', code: 'AG-0892' };
CargoStore.saveData(data);

let notifsAG892 = CargoStore.getNotifications();
if (notifsAG892.length > 0) {
    const targetId = notifsAG892[0].id;
    console.log(`Marking notification ${targetId} as READ for AG-0892...`);
    CargoStore.markNotificationRead(targetId);

    const updatedNotifs = CargoStore.getNotifications();
    const targetNotif = updatedNotifs.find(n => String(n.id) === String(targetId));
    console.log(`Result: target notification read state = ${targetNotif ? targetNotif.read : 'NOT FOUND'} (Expected: true)`);
    if (!targetNotif || !targetNotif.read) {
        console.error('FAIL: Notification was not marked as read!');
        process.exit(1);
    }
}

// Test deleting notification for AG-0892
console.log('\n--- TESTING DELETE NOTIFICATION FOR AG-0892 ---');
notifsAG892 = CargoStore.getNotifications();
if (notifsAG892.length > 0) {
    const targetId = notifsAG892[0].id;
    console.log(`Deleting notification ${targetId} for AG-0892...`);
    CargoStore.deleteNotification(targetId);

    const afterDeleteNotifs = CargoStore.getNotifications();
    const exists = afterDeleteNotifs.some(n => String(n.id) === String(targetId));
    console.log(`Result: deleted notification exists = ${exists} (Expected: false)`);
    if (exists) {
        console.error('FAIL: Notification still exists after deletion!');
        process.exit(1);
    }
}

console.log('\n--- ALL TESTS PASSED SUCCESSFULLY! ---');
