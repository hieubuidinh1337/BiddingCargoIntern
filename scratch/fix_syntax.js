const fs = require('fs');
const filePath = 'Admin/03-AuctionList.html';
let content = fs.readFileSync(filePath, 'utf8');

const targetSnippet = `                        \${(isOpen && data.currentAdmin && data.currentAdmin.role !== 'STAFF') ? \`
                            <button onclick="handleCloseAuction(\${a.id})" class="inline-flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold px-2 py-1 rounded-lg transition" title="Chốt thầu">
                                <i class="fa-solid fa-gavel text-[10px]"></i> Chốt
                            </button>
                        \` : ''}
                        \` : \`
                            <button onclick="handleDeleteAuction(\${a.id}, '\${a.flightNumber}')" class="inline-flex items-center gap-1 bg-red-50 hover:bg-red-100 text-red-600 font-semibold px-2 py-1 rounded-lg transition" title="Xóa chuyến bay">
                                <i class="fa-solid fa-trash text-[10px]"></i> Xóa
                            </button>
                        \`}`;

const replacementSnippet = `                        \${(isOpen && data.currentAdmin && data.currentAdmin.role !== 'STAFF') ? \`
                            <button onclick="handleCloseAuction(\${a.id})" class="inline-flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold px-2 py-1 rounded-lg transition" title="Chốt thầu">
                                <i class="fa-solid fa-gavel text-[10px]"></i> Chốt
                            </button>
                        \` : ''}
                        \${canDelete ? \`
                            <button onclick="handleDeleteAuction(\${a.id}, '\${a.flightNumber}')" class="inline-flex items-center gap-1 bg-red-50 hover:bg-red-100 text-red-600 font-semibold px-2 py-1 rounded-lg transition" title="Xóa chuyến bay">
                                <i class="fa-solid fa-trash text-[10px]"></i> Xóa
                            </button>
                        \` : \`
                            <button disabled class="inline-flex items-center gap-1 bg-gray-100 text-gray-400 font-semibold px-2 py-1 rounded-lg cursor-not-allowed opacity-60" title="\${isOpen ? 'Không thể xóa khi phiên đang mở' : \`Không thể xóa – đã có \${bidsCount} lượt đặt giá\`}">
                                <i class="fa-solid fa-lock text-[10px]"></i> Xóa
                            </button>
                        \`}`;

// Normalize CRLF to LF for matching
const normContent = content.replace(/\r\n/g, '\n');
const normTarget = targetSnippet.replace(/\r\n/g, '\n');
const normReplacement = replacementSnippet.replace(/\r\n/g, '\n');

if (normContent.includes(normTarget)) {
    const fixed = normContent.replace(normTarget, normReplacement);
    fs.writeFileSync(filePath, fixed, 'utf8');
    console.log('Successfully fixed syntax error in Admin/03-AuctionList.html!');
} else {
    console.log('Target snippet not found exactly. Searching regex...');
    const regex = /\$\{\(isOpen \&\& data\.currentAdmin [\s\S]*?\}\`/m;
    console.log('Match found?', regex.test(normContent));
}
