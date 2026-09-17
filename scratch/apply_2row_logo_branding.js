const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

// 1. Process User HTML files (root directory)
const userFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.html'));

userFiles.forEach(file => {
    const filePath = path.join(rootDir, file);
    let html = fs.readFileSync(filePath, 'utf8');

    // Replace header logo anchor with 2-row logo and compact text
    // Replace vietravel-logo-official.png or old logo divs in user headers
    html = html.replace(
        /<a href="[^"]*" class="flex items-center gap-2[^"]*">[\s\S]*?<img src="assets\/images\/vietravel-logo-official\.png"[^>]*>[\s\S]*?<\/a>/g,
        `<a href="03-Index.html" class="flex items-center gap-2.5 shrink-0">
            <img src="assets/images/vietravel-logo-doc.png" alt="Vietravel Airlines" class="h-8 sm:h-9 object-contain" />
            <span class="font-bold text-sm sm:text-base text-slate-900 tracking-tight border-l border-slate-200 pl-2.5">Cargo Bidding</span>
        </a>`
    );

    // Also replace fallback vietravel-logo-official in header if present
    html = html.replace(/src="assets\/images\/vietravel-logo-official\.png"/g, 'src="assets/images/vietravel-logo-doc.png"');

    fs.writeFileSync(filePath, html, 'utf8');
    console.log(`✅ Updated 2-row logo branding in ${file}`);
});

// 2. Process Admin HTML files (Admin subfolder)
const adminDir = path.join(rootDir, 'Admin');
if (fs.existsSync(adminDir)) {
    const adminFiles = fs.readdirSync(adminDir).filter(f => f.endsWith('.html'));
    adminFiles.forEach(file => {
        const filePath = path.join(adminDir, file);
        let html = fs.readFileSync(filePath, 'utf8');

        // Replace Admin Header Brand Anchor with 2-row logo (white version for dark header) and compact text
        html = html.replace(
            /<a href="02-AdminDashboard\.html" class="flex items-center gap-2[^"]*">[\s\S]*?<\/a>/g,
            `<a href="02-AdminDashboard.html" class="flex items-center gap-2.5 shrink-0">
                <img src="../assets/images/vietravel-logo-doc-white.png" alt="Vietravel Airlines" class="h-8 sm:h-9 object-contain" />
                <span class="font-bold text-xs sm:text-sm text-white tracking-tight border-l border-slate-700 pl-2.5">Cargo Bidding Admin</span>
            </a>`
        );

        // Replace any remaining vietravel-logo-official in Admin
        html = html.replace(/src="\.\.\/assets\/images\/vietravel-logo-official\.png"/g, 'src="../assets/images/vietravel-logo-doc-white.png"');

        fs.writeFileSync(filePath, html, 'utf8');
        console.log(`✅ Updated 2-row logo branding in Admin/${file}`);
    });
}
