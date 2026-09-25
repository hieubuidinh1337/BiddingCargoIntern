const fs = require('fs');
const path = require('path');

// 1. Patch assets/js/cargo-store.js
const file_assets = path.join(__dirname, 'assets/js/cargo-store.js');
let assets_content = fs.readFileSync(file_assets, 'utf-8');

// Remove the logic that marks previous bids as OUTBID
const markOutbidTarget = `            // Mark previous bids as OUTBID
            data.bids.forEach(b => {
                if ((String(b.auctionId) === String(auction.id) || (auction.flightCode && b.flightCode === auction.flightCode)) && b.status === 'HIGHEST') {
                    b.status = 'OUTBID';
                }
            });`;
const markOutbidReplace = `            // Outbid logic removed for blind auction`;

assets_content = assets_content.replace(markOutbidTarget, markOutbidReplace);
// fallback regex if string replacement fails due to formatting
assets_content = assets_content.replace(/\s*\/\/ Mark previous bids as OUTBID[\s\S]*?b\.status = 'OUTBID';\s*\}\s*\}\);\s*/, '\n            // Outbid logic removed for blind auction\n');

// Change newBid.status from 'HIGHEST' to 'RECEIVED'
const newBidStatusTarget = `status: 'HIGHEST'`;
const newBidStatusReplace = `status: 'RECEIVED'`;
// Make sure we only change it in placeBid (around line 2933)
// Since it's inside placeBid, we can just replace it via regex but targeting the specific block
assets_content = assets_content.replace(/time: formatTimeAgo\(now\),\s*status: 'HIGHEST',/g, "time: formatTimeAgo(now),\n                status: 'RECEIVED',");

// Update auction stats correctly
const updateStatsTarget = `            // Update auction stats
            auction.currentPriceKg = Number(bidPriceKg);
            auction.leadingAgentCode = user.agentCode;
            auction.leadingAgentName = user.companyName;
            auction.isAnonymous = anonFlag;
            auction.bidsCount = (auction.bidsCount || 0) + 1;`;

const updateStatsReplace = `            // Update auction stats
            if (Number(bidPriceKg) > (auction.currentPriceKg || 0)) {
                auction.currentPriceKg = Number(bidPriceKg);
                auction.leadingAgentCode = user.agentCode;
                auction.leadingAgentName = user.companyName;
                auction.isAnonymous = anonFlag;
                // Since this is a blind auction, we don't update bids' status to HIGHEST in real time.
            }
            auction.bidsCount = (auction.bidsCount || 0) + 1;`;

assets_content = assets_content.replace(updateStatsTarget, updateStatsReplace);

// Update Notifications
const notifTarget = `            // 1. Notification for current bidder (HIGHEST)
            data.notifications.unshift({
                id: now,
                timestamp: now,
                targetAgentCode: user.agentCode,
                title: \`Đặt giá thành công chuyến \${auction.flightNumber}\`,
                message: \`Bạn (\${user.agentCode}) đang dẫn đầu mức giá \${formatCurrency(bidPriceKg)}/Kg cho chặng \${auction.route}.\${anonFlag ? ' (Tên công ty được che ẩn danh đối với các đối thủ)' : ''}\`,
                time: formatTimeAgo(now),
                type: 'HIGHEST',
                read: false,
                link: \`04-Detail.html?id=\${auction.id}\`
            });

            // 2. Notification for previous leading agent (OUTBID)
            if (previousLeaderCode && previousLeaderCode !== user.agentCode) {
                const competitorNameDisplay = anonFlag ? 'Một đại lý đối thủ (Ẩn danh)' : \`Đại lý \${user.companyName} (\${user.agentCode})\`;
                data.notifications.unshift({
                    id: now + 1,
                    timestamp: now + 1,
                    targetAgentCode: previousLeaderCode,
                    title: \`Cảnh báo bị vượt giá chuyến \${auction.flightNumber}!\`,
                    message: \`\${competitorNameDisplay} vừa đặt mức giá mới \${formatCurrency(bidPriceKg)}/Kg cho chặng \${auction.route}.\`,
                    time: formatTimeAgo(now + 1),
                    type: 'OUTBID',
                    read: false,
                    link: \`04-Detail.html?id=\${auction.id}\`
                });
            }`;

const notifReplace = `            // 1. Notification for current bidder (BID_RECEIVED)
            data.notifications.unshift({
                id: now,
                timestamp: now,
                targetAgentCode: user.agentCode,
                title: \`Đặt giá thành công chuyến \${auction.flightNumber}\`,
                message: \`Hệ thống đã ghi nhận mức giá \${formatCurrency(bidPriceKg)}/Kg của bạn cho chặng \${auction.route}.\${anonFlag ? ' (Tên công ty được che ẩn danh đối với các đối thủ)' : ''}\`,
                time: formatTimeAgo(now),
                type: 'BID_RECEIVED',
                read: false,
                link: \`04-Detail.html?id=\${auction.id}\`
            });`;

assets_content = assets_content.replace(notifTarget, notifReplace);
fs.writeFileSync(file_assets, assets_content, 'utf-8');
console.log("Patched assets/js/cargo-store.js");


// 2. Patch db.js
const file_db = path.join(__dirname, 'db.js');
let db_content = fs.readFileSync(file_db, 'utf-8');

const db_updateTarget = `        const newBidCount = (Number(auction.bidsCount) || 0) + 1;
        await run(\`
            UPDATE auctions SET 
                currentPriceKg = ?,
                leadingAgentCode = ?,
                leadingAgentName = ?,
                bidsCount = ?
            WHERE id = ?
        \`, [Number(priceKg), agentCode, agentName, newBidCount, auctionId]);`;

const db_updateReplace = `        const newBidCount = (Number(auction.bidsCount) || 0) + 1;
        if (Number(priceKg) > Number(auction.currentPriceKg || 0)) {
            await run(\`
                UPDATE auctions SET 
                    currentPriceKg = ?,
                    leadingAgentCode = ?,
                    leadingAgentName = ?,
                    bidsCount = ?
                WHERE id = ?
            \`, [Number(priceKg), agentCode, agentName, newBidCount, auctionId]);
        } else {
            await run(\`UPDATE auctions SET bidsCount = ? WHERE id = ?\`, [newBidCount, auctionId]);
        }`;

db_content = db_content.replace(db_updateTarget, db_updateReplace);

const db_notifTarget = `        // Insert notifications into notifications table
        const flightLabel = auction.flightNumber || (\`FL-\${auctionId}\`);
        const routeLabel = auction.route || '';
        const formattedPrice = new Intl.NumberFormat('vi-VN').format(priceKg);
        const anonText = isAnonymous ? ' (Tên công ty được che ẩn danh đối với các đối thủ)' : '';
        const title1 = \`Đặt giá thành công chuyến \${flightLabel}\`;
        const msg1 = \`Bạn (\${agentCode}) đang dẫn đầu mức giá \${formattedPrice}đ/Kg cho chặng \${routeLabel}.\${anonText}\`;
        await run(\`
            INSERT INTO notifications (id, targetAgentCode, title, message, time, type, read, link)
            VALUES (?, ?, ?, ?, 'Vừa xong', 'HIGHEST', 0, ?)
        \`, [now, agentCode, title1, msg1, \`04-Detail.html?id=\${auctionId}\`]).catch(() => {});

        const prevLeaderCode = auction.leadingAgentCode;
        if (prevLeaderCode && String(prevLeaderCode).trim().toUpperCase() !== String(agentCode).trim().toUpperCase()) {
            const competitorDisplay = isAnonymous ? 'Một đại lý đối thủ (Ẩn danh)' : \`Đại lý \${agentName} (\${agentCode})\`;
            const title2 = \`Cảnh báo bị vượt giá chuyến \${flightLabel}!\`;
            const msg2 = \`\${competitorDisplay} vừa đặt mức giá mới \${formattedPrice}đ/Kg cho chặng \${routeLabel}.\`;
            await run(\`
                INSERT INTO notifications (id, targetAgentCode, title, message, time, type, read, link)
                VALUES (?, ?, ?, ?, 'Vừa xong', 'OUTBID', 0, ?)
            \`, [now + 1, prevLeaderCode, title2, msg2, \`04-Detail.html?id=\${auctionId}\`]).catch(() => {});
        }`;

const db_notifReplace = `        // Insert notifications into notifications table
        const flightLabel = auction.flightNumber || (\`FL-\${auctionId}\`);
        const routeLabel = auction.route || '';
        const formattedPrice = new Intl.NumberFormat('vi-VN').format(priceKg);
        const anonText = isAnonymous ? ' (Tên công ty được che ẩn danh đối với các đối thủ)' : '';
        const title1 = \`Đặt giá thành công chuyến \${flightLabel}\`;
        const msg1 = \`Hệ thống đã ghi nhận mức giá \${formattedPrice}đ/Kg của bạn cho chặng \${routeLabel}.\${anonText}\`;
        await run(\`
            INSERT INTO notifications (id, targetAgentCode, title, message, time, type, read, link)
            VALUES (?, ?, ?, ?, 'Vừa xong', 'BID_RECEIVED', 0, ?)
        \`, [now, agentCode, title1, msg1, \`04-Detail.html?id=\${auctionId}\`]).catch(() => {});`;

db_content = db_content.replace(db_notifTarget, db_notifReplace);
// Also fallback if not found
if (!db_content.includes(db_updateReplace)) {
    console.log("Fallback needed for db.js");
}
fs.writeFileSync(file_db, db_content, 'utf-8');
console.log("Patched db.js");


// 3. Patch Admin/05-AuctionDetail.html
const file_adminDetail = path.join(__dirname, 'Admin/05-AuctionDetail.html');
let admin_content = fs.readFileSync(file_adminDetail, 'utf-8');

const admin_statusTarget = `                    <td class="py-3 px-4">
                        \${b.status === 'HIGHEST' || b.status === 'WON' ?
                    '<span class="bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded text-[10px]">DẪN ĐẦU</span>' :
                    '<span class="bg-gray-100 text-gray-500 px-2 py-0.5 rounded text-[10px]">BỊ VƯỢT</span>'}
                    </td>`;

const admin_statusReplace = `                    <td class="py-3 px-4">
                        \${(b.status === 'WON' || (auction.status === 'CLOSED' && i === 0)) ?
                    '<span class="bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded text-[10px]">THẮNG THẦU</span>' :
                    '<span class="bg-blue-50 text-blue-600 font-medium px-2 py-0.5 rounded text-[10px]">ĐÃ GHI NHẬN</span>'}
                    </td>`;

if (admin_content.includes(admin_statusTarget)) {
    admin_content = admin_content.replace(admin_statusTarget, admin_statusReplace);
} else {
    // try regex for formatting differences
    admin_content = admin_content.replace(/<td class="py-3 px-4">\s*\$\{b\.status === 'HIGHEST' \|\| b\.status === 'WON' \?[\s\S]*?BỊ VƯỢT<\/span>'\}\s*<\/td>/, admin_statusReplace);
}
fs.writeFileSync(file_adminDetail, admin_content, 'utf-8');
console.log("Patched Admin/05-AuctionDetail.html");
