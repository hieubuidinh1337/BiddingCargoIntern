const fs = require('fs');

const data = JSON.parse(fs.readFileSync('./server_data.json', 'utf8'));
const notifs = data.notifications || [];

const isAdminNotif = (n) => {
    if (!n) return false;
    const role = String(n.targetRole || '').trim().toUpperCase();
    if (role === 'ADMIN' || role === 'STAFF') return true;
    if (n.type === 'REGISTRATION' || n.type === 'AUDIT') return true;
    if (n.link && (n.link.includes('/Admin/') || n.link.includes('Admin/'))) return true;
    const title = String(n.title || '').toUpperCase();
    if (title.includes('HỒ SƠ ĐĂNG KÝ MỚI') || title.includes('[AUDIT]') || title.includes('HỒ SƠ REG-') || title.includes('XÉT DUYỆT HỒ SƠ')) return true;
    return false;
};

console.log('=== NOTIFICATION FILTER DIAGNOSTIC TEST ===');
console.log(`Total notifications in server_data.json: ${notifs.length}`);

console.log('\n--- ADMIN NOTIFICATIONS (Visible ONLY on Admin Portal) ---');
const adminNotifs = notifs.filter(n => isAdminNotif(n));
adminNotifs.forEach(n => console.log(`  [ADMIN] ID: ${n.id} | Type: ${n.type} | Title: ${n.title}`));

console.log('\n--- AGENT NOTIFICATIONS (Visible ONLY on Agent Portal) ---');
const agentNotifs = notifs.filter(n => !isAdminNotif(n));
agentNotifs.forEach(n => console.log(`  [AGENT] ID: ${n.id} | Type: ${n.type} | Title: ${n.title}`));

const leakedAdminNotifsInAgentView = agentNotifs.filter(n => n.type === 'REGISTRATION' || (n.title && n.title.includes('HỒ SƠ ĐĂNG KÝ MỚI')));
console.log(`\nLeak Check: ${leakedAdminNotifsInAgentView.length} admin notifications leaked into agent view.`);

if (leakedAdminNotifsInAgentView.length === 0) {
    console.log('🎉 SUCCESS! Zero admin notifications leaked to agent portal!');
} else {
    console.error('❌ TEST FAILED! Leaked notifications found.');
}
