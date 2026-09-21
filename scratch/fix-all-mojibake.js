const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const win1252ToByte = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
    0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E,
    0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F
};

function tryBufferDecode(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code <= 0xFF) {
            bytes.push(code);
        } else if (win1252ToByte[code] !== undefined) {
            bytes.push(win1252ToByte[code]);
        } else {
            return str;
        }
    }
    try {
        const decoded = Buffer.from(bytes).toString('utf8');
        if (!decoded.includes('\uFFFD')) {
            return decoded;
        }
    } catch (e) {}
    return str;
}

function fixVietnameseMojibake(str) {
    if (!/[ÃÄÂÆï¿½â]|áº|á»|·/.test(str)) {
        return str;
    }

    let prev = '';
    let current = str;
    
    // Iteratively decode using buffer if possible
    while (current !== prev && /[ÃÄÂÆâ]|áº|á»/.test(current)) {
        prev = current;
        current = tryBufferDecode(current);
    }

    // Secondary fixes for strings where \u00A0 or control chars were altered during file saves
    current = current
        .replace(/HÃ\xA0/g, 'Hà')
        .replace(/HÃ\s+Ná»™i/g, 'Hà Nội')
        .replace(/HÃ\s+/g, 'Hà ')
        .replace(/Ä\s+Ã\xA0/g, 'Đà')
        .replace(/Ä\s+Ã\s+/g, 'Đà ')
        .replace(/Ã\xA0/g, 'à')
        .replace(/Ä\s+áººu/g, 'Đấu')
        .replace(/Ä\s+áº¥u/g, 'Đấu')
        .replace(/Ä\s+áºot/g, 'Đặt')
        .replace(/Ä\s+áº¡i/g, 'Đại')
        .replace(/Ã\s+áº¡i/g, 'Đại')
        .replace(/Ä\s+Ã/g, 'Đã')
        .replace(/đ/g, 'đ')
        .replace(/Ư/g, 'Ư')
        .replace(/ư/g, 'ư')
        .replace(/·/g, '·')
        .replace(/âš\uFE0F/g, '⚠️')
        .replace(/âš\s?ï¸/g, '⚠️')
        .replace(/Yêu cầu hỗ trợ/g, 'Yêu cầu hỗ trợ')
        .replace(/Yêu cầu hỗ trợ/g, 'Yêu cầu hỗ trợ')
        .replace(/m nhất có thể/g, 'm nhất có thể')
        .replace(/Vui lÃºng chÃ\| trong giÃºy lÃjt/g, 'Vui lòng chờ trong giây lát');

    if (/[ÃÄÂÆâ]|áº|á»/.test(current)) {
        current = tryBufferDecode(current);
    }

    return current;
}

function getFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (file === 'node_modules' || file === '.git' || file === 'uploads') continue;
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            getFiles(filePath, fileList);
        } else {
            if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.json') || filePath.endsWith('.sql') || filePath.endsWith('.css') || filePath.endsWith('.md')) {
                fileList.push(filePath);
            }
        }
    }
    return fileList;
}

const allFiles = getFiles(rootDir);
console.log(`Processing ${allFiles.length} text files for encoding fixes...`);

let filesModified = 0;
let totalLinesFixed = 0;

for (const file of allFiles) {
    const relPath = path.relative(rootDir, file);
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    let modified = false;
    let fileLinesFixed = 0;

    const newLines = lines.map((line, idx) => {
        const fixed = fixVietnameseMojibake(line);
        if (fixed !== line) {
            modified = true;
            fileLinesFixed++;
            return fixed;
        }
        return line;
    });

    if (modified) {
        fs.writeFileSync(file, newLines.join('\n'), 'utf8');
        filesModified++;
        totalLinesFixed += fileLinesFixed;
        console.log(`Fixed ${fileLinesFixed} lines in ${relPath}`);
    }
}

console.log(`\nDONE! Modified ${filesModified} files, fixed ${totalLinesFixed} corrupted lines total.`);
