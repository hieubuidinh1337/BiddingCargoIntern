const fs = require('fs');
const path = require('path');

const file_cargo = path.join(__dirname, 'assets/js/cargo-store.js');
if (fs.existsSync(file_cargo)) {
    let content = fs.readFileSync(file_cargo, 'utf-8');

    // Replace mock data in defaultData.bids
    content = content.replace(/status: 'OUTBID'/g, "status: 'RECEIVED'");
    content = content.replace(/status: 'HIGHEST'/g, "status: 'RECEIVED'");

    // Replace type in defaultData.notifications
    content = content.replace(/type: 'OUTBID'/g, "type: 'BID_RECEIVED'");
    content = content.replace(/type: 'HIGHEST'/g, "type: 'BID_RECEIVED'");

    // In sync logic where it synthesizes notifications:
    // "if (b.status === 'OUTBID')" or "if (n.type === 'OUTBID')"
    content = content.replace(/b\.status === 'OUTBID'/g, "false /* removed */");
    content = content.replace(/n\.type === 'OUTBID'/g, "false /* removed */");
    content = content.replace(/n\.type === 'HIGHEST'/g, "n.type === 'BID_RECEIVED'");

    fs.writeFileSync(file_cargo, content, 'utf-8');
    console.log("Patched cargo-store.js mock data & synthetic notification logic");
}
