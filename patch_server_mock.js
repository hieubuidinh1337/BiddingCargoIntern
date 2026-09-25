const fs = require('fs');
const path = require('path');

const file_server = path.join(__dirname, 'server.js');
if (fs.existsSync(file_server)) {
    let content = fs.readFileSync(file_server, 'utf-8');
    
    // Replace the status logic in reconcileAuctionSummaries
    const reconcileTarget = `            auctionBids.forEach((b, idx) => {
                b.status = (idx === 0) ? 'HIGHEST' : 'OUTBID';
            });`;
    const reconcileReplace = `            auctionBids.forEach((b, idx) => {
                if (b.status === 'OUTBID' || b.status === 'HIGHEST') {
                    b.status = 'RECEIVED';
                } else if (!b.status) {
                    b.status = 'RECEIVED';
                }
            });`;
    
    content = content.replace(reconcileTarget, reconcileReplace);
    
    // Also let's just globally replace 'OUTBID' with 'RECEIVED' and 'HIGHEST' with 'RECEIVED' where it's about status
    // Or just replacing string literals in the mock data
    content = content.replace(/status: 'OUTBID'/g, "status: 'RECEIVED'");
    content = content.replace(/status: 'HIGHEST'/g, "status: 'RECEIVED'");
    
    // Note: this will also change mock notifications that might have type: 'OUTBID'. Let's see if type is used.
    // Replace notification types
    content = content.replace(/type: 'OUTBID'/g, "type: 'BID_RECEIVED'");
    content = content.replace(/type: 'HIGHEST'/g, "type: 'BID_RECEIVED'");

    fs.writeFileSync(file_server, content, 'utf-8');
    console.log("Patched server.js mock data & logic");
}
