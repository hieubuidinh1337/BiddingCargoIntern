const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const jsonPath = path.join(__dirname, '..', 'server_data.json');

console.log('--- Cleaning historical close auction logs ---');

// 1. Clean server_data.json
if (fs.existsSync(jsonPath)) {
    try {
        const raw = fs.readFileSync(jsonPath, 'utf8');
        const data = JSON.parse(raw);
        if (data.activityLogs && Array.isArray(data.activityLogs)) {
            let count = 0;
            data.activityLogs.forEach(log => {
                if (log.actionTitle && (log.actionTitle.includes('Chốt thầu') || log.actionTitle.includes('Đóng phiên'))) {
                    if (log.role === 'AGENT' || (log.username && log.username.startsWith('AG-'))) {
                        log.actor = 'Ban Điều Hành';
                        log.username = 'admin';
                        log.role = 'ADMIN';
                        count++;
                    }
                }
            });
            fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
            console.log(`Updated ${count} logs in server_data.json`);
        }
    } catch (err) {
        console.error('Error updating server_data.json:', err);
    }
}

// 2. Clean database.sqlite
if (fs.existsSync(dbPath)) {
    const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('SQLite connection error:', err);
            process.exit(1);
        }
        db.run(
            `UPDATE activity_logs 
             SET actor = 'Ban Điều Hành', username = 'admin', role = 'ADMIN'
             WHERE (actionTitle LIKE '%Chốt thầu%' OR actionTitle LIKE '%Đóng phiên%') 
               AND (role = 'AGENT' OR username LIKE 'AG-%')`,
            function(err) {
                if (err) {
                    console.error('DB update error:', err);
                } else {
                    console.log(`Updated ${this.changes} logs in SQLite database.sqlite`);
                }
                db.close();
            }
        );
    });
}
