const fs = require('fs');
const path = require('path');

const file_watchlist = path.join(__dirname, '05-Watchlist.html');
if (fs.existsSync(file_watchlist)) {
    let content = fs.readFileSync(file_watchlist, 'utf-8');
    
    // Hide the 'Dẫn đầu' tab/filter
    const filterTab = `<button onclick="setFilter('leading')" id="filter-leading" class="filter-tab pb-3 border-b-2 font-medium text-sm text-gray-500 border-transparent hover:text-gray-700 transition">
                        Dẫn đầu <span class="ml-1 bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full" id="countLeading">0</span>
                    </button>`;
    const replaceTab = `<!-- Filter leading hidden for blind auction -->`;
    
    // Also remove the "Dẫn đầu" badge
    const badge = `\${isLeading ? '<span class="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"><i class="fa-solid fa-crown text-[10px]"></i> Dẫn đầu</span>' : ''}`;
    const replaceBadge = `\${(isLeading && a.status === 'CLOSED') ? '<span class="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"><i class="fa-solid fa-crown text-[10px]"></i> Thắng thầu</span>' : ''}`;
    
    // Update the 'Đại lý dẫn đầu' block
    const leaderHtml = `                            <p class="text-[11px] text-gray-400 mb-0.5">Đại lý dẫn đầu</p>
                            <p class="text-sm font-semibold text-slate-700">\${isLeading ? \`<span class="text-emerald-600">🏆 Bạn (\${currentAgentCode})</span>\` : (a.leadingAgentCode ? CargoStore.getPublicAgentName(a.leadingAgentCode, a.leadingAgentName, a.isAnonymous) : '—')}</p>
                            <p class="text-[11px] text-gray-400">\${isLeading ? (data.currentUser ? data.currentUser.companyName + ' (Công ty của bạn)' : 'Công ty của bạn') : (a.leadingAgentName ? (a.isAnonymous ? 'Thông tin đã được ẩn danh' : a.leadingAgentName) : 'Chưa có lượt thầu')}</p>`;
                            
    const leaderReplace = `                            <p class="text-[11px] text-gray-400 mb-0.5">Đại lý \${a.status === 'CLOSED' ? 'thắng thầu' : 'dẫn đầu'}</p>
                            <p class="text-sm font-semibold text-slate-700">\${a.status === 'CLOSED' ? (isLeading ? \`<span class="text-emerald-600">🏆 Bạn (\${currentAgentCode})</span>\` : (a.leadingAgentCode ? CargoStore.getPublicAgentName(a.leadingAgentCode, a.leadingAgentName, a.isAnonymous) : '—')) : '??? (Ẩn)'}</p>
                            <p class="text-[11px] text-gray-400">\${a.status === 'CLOSED' ? (isLeading ? (data.currentUser ? data.currentUser.companyName + ' (Công ty của bạn)' : 'Công ty của bạn') : (a.leadingAgentName ? (a.isAnonymous ? 'Thông tin đã được ẩn danh' : a.leadingAgentName) : 'Chưa có lượt thầu')) : 'Đang trong phiên (Ẩn danh)'}</p>`;

    // Simple string replacements ignoring formatting slightly by using regex
    content = content.replace(/<button onclick="setFilter\('leading'\)"[\s\S]*?<\/button>/, replaceTab);
    content = content.replace(/\$\{isLeading \? '<span class="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"><i class="fa-solid fa-crown text-\[10px\]"><\/i> Dẫn đầu<\/span>' : ''\}/, replaceBadge);
    
    // Using simple replacements for leader block
    content = content.replace(/<p class="text-\[11px\] text-gray-400 mb-0\.5">Đại lý dẫn đầu<\/p>[\s\S]*?Công ty của bạn'\) : \(a\.leadingAgentName \? \(a\.isAnonymous \? 'Thông tin đã được ẩn danh' : a\.leadingAgentName\) : 'Chưa có lượt thầu'\)\}<\/p>/, leaderReplace);

    fs.writeFileSync(file_watchlist, content, 'utf-8');
    console.log("Patched 05-Watchlist.html");
}

const file_index = path.join(__dirname, '03-Index.html');
if (fs.existsSync(file_index)) {
    let content = fs.readFileSync(file_index, 'utf-8');
    
    const badge = `\${isLeading ? '<span class="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1"><i class="fa-solid fa-crown text-[10px]"></i> Dẫn đầu</span>' : ''}`;
    const replaceBadge = `\${(isLeading && a.status === 'CLOSED') ? '<span class="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1"><i class="fa-solid fa-crown text-[10px]"></i> Thắng thầu</span>' : ''}`;
    
    content = content.replace(/\$\{isLeading \? '<span class="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0\.5 rounded-full shadow-xs flex items-center gap-1"><i class="fa-solid fa-crown text-\[10px\]"><\/i> Dẫn đầu<\/span>' : ''\}/, replaceBadge);
    fs.writeFileSync(file_index, content, 'utf-8');
    console.log("Patched 03-Index.html");
}

const file_dashboard = path.join(__dirname, '02-Dashboard.html');
if (fs.existsSync(file_dashboard)) {
    let content = fs.readFileSync(file_dashboard, 'utf-8');
    
    const badge = `\${isLeading ? '<span class="bg-emerald-100 text-emerald-700 text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1"><i class="fa-solid fa-crown text-[9px]"></i> Dẫn đầu</span>' : ''}`;
    const replaceBadge = `\${(isLeading && a.status === 'CLOSED') ? '<span class="bg-emerald-100 text-emerald-700 text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1"><i class="fa-solid fa-crown text-[9px]"></i> Thắng thầu</span>' : ''}`;
    
    content = content.replace(/\$\{isLeading \? '<span class="bg-emerald-100 text-emerald-700 text-\[10px\] font-semibold px-2 py-0\.5 rounded-full shadow-xs flex items-center gap-1"><i class="fa-solid fa-crown text-\[9px\]"><\/i> Dẫn đầu<\/span>' : ''\}/, replaceBadge);
    fs.writeFileSync(file_dashboard, content, 'utf-8');
    console.log("Patched 02-Dashboard.html");
}
