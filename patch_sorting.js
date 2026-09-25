const fs = require('fs');
const path = require('path');

const file_detail = path.join(__dirname, '04-Detail.html');
let detail_content = fs.readFileSync(file_detail, 'utf-8');

const detail_target_1 = `            const tbody = document.getElementById('bidsTableBody');`;
const detail_replace_1 = `            if (!isClosed) {
                bids = bids.sort((a, b) => (Number(b.timestamp || b.id) || 0) - (Number(a.timestamp || a.id) || 0));
            }
            const tbody = document.getElementById('bidsTableBody');`;

detail_content = detail_content.replace(detail_target_1, detail_replace_1);

const detail_target_2 = `                        <td class="py-3 px-4 text-right">
                            \${isFirst ? \`
                                <span class="\${isClosed ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold' : 'bg-green-100 text-green-700 font-bold'} px-2.5 py-1 rounded-full text-[10px] inline-flex items-center gap-1 shadow-xs">
                                    <i class="fa-solid \${isClosed ? 'fa-trophy text-amber-600' : 'fa-crown text-emerald-600'} text-[9px]"></i> \${isClosed ? 'Thắng thầu' : 'Dẫn đầu'}
                                </span>
                            \` : \`
                                <span class="bg-gray-100 text-gray-500 font-medium px-2 py-0.5 rounded-full text-[10px]">
                                    Bị vượt
                                </span>
                            \`}
                        </td>`;

const detail_replace_2 = `                        <td class="py-3 px-4 text-right">
                            \${isClosed ? (isFirst ? \`
                                <span class="bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2.5 py-1 rounded-full text-[10px] inline-flex items-center gap-1 shadow-xs">
                                    <i class="fa-solid fa-trophy text-amber-600 text-[9px]"></i> Thắng thầu
                                </span>
                            \` : \`
                                <span class="bg-gray-100 text-gray-500 font-medium px-2 py-0.5 rounded-full text-[10px]">
                                    Bị vượt
                                </span>
                            \`) : \`
                                <span class="bg-blue-50 text-blue-600 font-medium px-2 py-0.5 rounded-full text-[10px]">
                                    Đã ghi nhận
                                </span>
                            \`}
                        </td>`;

// Let's use string replace but handle line endings properly
detail_content = detail_content.split('\n').join('\n'); // normalize
const d_t1 = detail_target_1.split('\n').join('\n');
const d_r1 = detail_replace_1.split('\n').join('\n');
const d_t2 = detail_target_2.split('\n').join('\n');
const d_r2 = detail_replace_2.split('\n').join('\n');

if (detail_content.includes(d_t1)) {
    detail_content = detail_content.replace(d_t1, d_r1);
} else {
    console.log("Failed to find target 1 in 04-Detail.html");
}

if (detail_content.includes(d_t2)) {
    detail_content = detail_content.replace(d_t2, d_r2);
} else {
    // try regex for t2
    detail_content = detail_content.replace(/<td class="py-3 px-4 text-right">[\s\S]*?<\/td>/, d_r2);
}

// update the isFirst class logic
const detail_target_3 = `const isFirst = index === 0;`;
const detail_replace_3 = `const isFirst = isClosed ? index === 0 : false;`;
detail_content = detail_content.replace(detail_target_3, detail_replace_3);

fs.writeFileSync(file_detail, detail_content, 'utf-8');
console.log("Patched 04-Detail.html");

const file_mybids = path.join(__dirname, '06-MyBids.html');
let mybids_content = fs.readFileSync(file_mybids, 'utf-8');

const mybids_target = `} else if (idx === 0 && (b.status === 'HIGHEST' || auction.leadingAgentCode === bCode)) {
                            statusTag = '<span class="bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded text-[10px]">Dẫn đầu</span>';
                        } else {
                            statusTag = '<span class="bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded text-[10px]">Đã đặt</span>';
                        }`;
const mybids_replace = `} else if (auction.status === 'CLOSED' && idx === 0 && (b.status === 'HIGHEST' || auction.leadingAgentCode === bCode)) {
                            statusTag = '<span class="bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded text-[10px]">Dẫn đầu</span>';
                        } else {
                            statusTag = '<span class="bg-blue-50 text-blue-600 font-medium px-2 py-0.5 rounded text-[10px]">Đã ghi nhận</span>';
                        }`;

if (mybids_content.includes(mybids_target)) {
    mybids_content = mybids_content.replace(mybids_target, mybids_replace);
} else {
    // fallback with regex
    mybids_content = mybids_content.replace(/\} else if \(idx === 0 && \(b\.status === 'HIGHEST' \|\| auction\.leadingAgentCode === bCode\)\) \{[\s\S]*?Đã đặt<\/span>';\n\s*\}/, mybids_replace);
}

fs.writeFileSync(file_mybids, mybids_content, 'utf-8');
console.log("Patched 06-MyBids.html");
