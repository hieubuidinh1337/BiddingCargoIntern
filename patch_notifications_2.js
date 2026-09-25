const fs = require('fs');
const path = require('path');

const file_notifs = path.join(__dirname, '08-Notifications.html');
if (fs.existsSync(file_notifs)) {
    let content = fs.readFileSync(file_notifs, 'utf-8');

    content = content.replace(/const outbid = notifs\.filter\(n => n\.type === 'OUTBID'\)\.length;/g, '');
    content = content.replace(/\(n\.type === 'OUTBID' \? 'bg-amber-50\/30' : /g, '(');
    
    // Remove the "Đặt lại ngay" button logic
    const actionBtnTarget = `                        if (n.type === 'OUTBID' && n.link) {
                            actionBtnHtml = \`<a href="\${n.link}" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition shadow-sm whitespace-nowrap"><i class="fa-solid fa-gavel"></i> Đặt lại ngay</a>\`;
                        }`;
    content = content.replace(actionBtnTarget, '');

    fs.writeFileSync(file_notifs, content, 'utf-8');
    console.log("Patched 08-Notifications.html residual OUTBID");
}
