const fs = require('fs');

// 1. Update assets/js/cargo-store.js to auto-purge logs older than 7 days inside loadData()
let storeCode = fs.readFileSync('assets/js/cargo-store.js', 'utf8');

const autoPurgeBlock = `
            if (data.activityLogs && Array.isArray(data.activityLogs)) {
                const now = Date.now();
                const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
                const origLen = data.activityLogs.length;
                data.activityLogs = data.activityLogs.filter(l => {
                    const timeMs = l.rawTime || parseTimestamp(l.timestamp);
                    if (!timeMs) return true;
                    return (now - timeMs) <= SEVEN_DAYS_MS;
                });
                if (data.activityLogs.length !== origLen) {
                    updated = true;
                }
            }
`;

if (!storeCode.includes('SEVEN_DAYS_MS')) {
    storeCode = storeCode.replace('if (!data.bankConfig) {', autoPurgeBlock + '\n            if (!data.bankConfig) {');
    fs.writeFileSync('assets/js/cargo-store.js', storeCode, 'utf8');
    console.log('Successfully updated cargo-store.js with 7-day auto-purge log retention logic!');
} else {
    console.log('7-day auto-purge already exists in cargo-store.js');
}
