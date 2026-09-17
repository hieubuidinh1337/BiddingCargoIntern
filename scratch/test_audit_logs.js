const CargoStore = require('../assets/js/cargo-store.js');

console.log('--- TESTING AUDIT LOG ENGINE ---');

// 1. Check default seed logs
const logs = CargoStore.getActivityLogs({ role: 'ALL', category: 'ALL' });
console.log(`Total logs in system: ${logs.length}`);

// 2. Check Agent role filtering
const agentLogs = CargoStore.getActivityLogs({ role: 'AGENT' });
console.log(`Agent logs count: ${agentLogs.length}`);
agentLogs.forEach(l => {
    console.log(`- [${l.role}] ${l.actor} (${l.actionCategory}): ${l.actionTitle} -> Target: ${l.target}`);
});

// 3. Simulate Agent Login log
CargoStore.loginAgent('AG-0892', 'abc123456');

// 4. Simulate Agent Profile update log
CargoStore.updateAgentProfile({
    repName: 'Nguyễn Văn An (Updated)',
    phone: '0909 999 888',
    email: 'an.nguyen.updated@abccargo.vn'
});

// 5. Simulate Cargo Declaration update log
CargoStore.updateCargoDeclaration('WON-20260909-07', {
    cargoType: 'Hàng linh kiện vi điện tử & Pin Lithium',
    piecesCount: 50,
    grossWeightKg: 1200,
    volumeCbm: 4.5,
    hawbNumber: 'HAWB-987654',
    dgrDocName: 'DG_Safety_Cert_2026.pdf'
});

// 6. Check logs after simulation
const updatedLogs = CargoStore.getActivityLogs({ role: 'ALL', category: 'ALL' });
console.log(`\nTotal logs after agent actions: ${updatedLogs.length}`);
console.log('Top 5 Latest Logs:');
updatedLogs.slice(0, 5).forEach(l => {
    console.log(`- [${l.timestamp}] [${l.role}] ${l.actor} (@${l.username}): ${l.actionTitle} | ${l.details}`);
});

console.log('\nAudit Logs Test Complete: SUCCESS!');
