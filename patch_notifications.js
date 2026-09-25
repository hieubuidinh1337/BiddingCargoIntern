const fs = require('fs');
const path = require('path');

const file_notifs = path.join(__dirname, '08-Notifications.html');
if (fs.existsSync(file_notifs)) {
    let content = fs.readFileSync(file_notifs, 'utf-8');

    // 1. Remove stat card for OUTBID
    const statCardRegex = /<div class="bg-white rounded-xl border p-4 flex items-center gap-3 shadow-sm">\s*<div class="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">\s*<i class="fa-solid fa-arrow-trend-up text-amber-600"><\/i>\s*<\/div>\s*<div>\s*<p class="text-xl font-bold text-amber-600" id="statOutbid">0<\/p>\s*<p class="text-xs text-gray-500">Bị vượt giá<\/p>\s*<\/div>\s*<\/div>/;
    content = content.replace(statCardRegex, '');

    // 2. Remove filter buttons
    const filterOutbidRegex = /<button onclick="setFilter\('OUTBID'\)" class="filter-btn text-gray-600 text-xs font-semibold px-3 py-1\.5 rounded-lg whitespace-nowrap" id="f-OUTBID">\s*<i class="fa-solid fa-arrow-trend-up mr-1 text-amber-500"><\/i>Bị vượt giá\s*<\/button>/;
    content = content.replace(filterOutbidRegex, '');
    
    const filterHighestRegex = /<button onclick="setFilter\('HIGHEST'\)" class="filter-btn text-gray-600 text-xs font-semibold px-3 py-1\.5 rounded-lg whitespace-nowrap" id="f-HIGHEST">\s*<i class="fa-solid fa-crown mr-1 text-blue-500"><\/i>Dẫn đầu\s*<\/button>/;
    content = content.replace(filterHighestRegex, '');
    
    // Add BID_RECEIVED filter button
    const filterAllRegex = /(<button onclick="setFilter\('unread'\)" [^>]+>[\s\S]*?<\/button>)/;
    content = content.replace(filterAllRegex, `$1\n            <button onclick="setFilter('BID_RECEIVED')" class="filter-btn text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap" id="f-BID_RECEIVED">\n                <i class="fa-solid fa-check-circle mr-1 text-blue-500"></i>Đã đặt giá\n            </button>`);

    // 3. Replace OUTBID and HIGHEST in typeConfig
    const typeConfigRegex = /'OUTBID': \{[\s\S]*?\},[\s\S]*?'HIGHEST': \{[\s\S]*?\},/;
    const typeConfigReplace = `'BID_RECEIVED': {
            icon: 'fa-check-circle', iconColor: 'text-blue-600', iconBg: 'bg-blue-100',
            borderClass: 'unread', dotColor: 'bg-blue-400', label: 'Đã đặt giá',
            labelBg: 'bg-blue-100 text-blue-700'
        },`;
    content = content.replace(typeConfigRegex, typeConfigReplace);
    
    // 4. Remove stat updates
    content = content.replace(/const outbid = data\.notifications\.filter\(n => n\.type === 'OUTBID' && n\.targetAgentCode === user\.agentCode && !n\.read\)\.length;/g, '');
    content = content.replace(/document\.getElementById\('statOutbid'\)\.textContent = outbid;/g, '');
    
    // 5. Remove msgs mapping
    content = content.replace(/'OUTBID': 'Không có thông báo bị vượt giá',/g, '');
    content = content.replace(/'HIGHEST': 'Không có thông báo dẫn đầu',/g, `'BID_RECEIVED': 'Không có thông báo đặt giá',`);

    fs.writeFileSync(file_notifs, content, 'utf-8');
    console.log("Patched 08-Notifications.html");
}
