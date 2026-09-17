const fs = require('fs');
let code = fs.readFileSync('assets/js/cargo-store.js', 'utf8');

const parseTsFn = `
    function parseTimestamp(tsStr) {
        if (!tsStr) return Date.now();
        if (typeof tsStr === 'number') return tsStr;
        const clean = String(tsStr).trim();
        const parts = clean.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})(?:\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?)?$/);
        if (parts) {
            const day = parseInt(parts[1], 10);
            const month = parseInt(parts[2], 10) - 1;
            const year = parseInt(parts[3], 10);
            const hour = parts[4] ? parseInt(parts[4], 10) : 0;
            const min = parts[5] ? parseInt(parts[5], 10) : 0;
            const sec = parts[6] ? parseInt(parts[6], 10) : 0;
            return new Date(year, month, day, hour, min, sec).getTime();
        }
        const d = new Date(tsStr);
        return isNaN(d.getTime()) ? Date.now() : d.getTime();
    }
`;

if (!code.includes('function parseTimestamp')) {
    code = code.replace('function parseFlightDate', parseTsFn + '\n    function parseFlightDate');
    code = code.replace('parseFlightDate: parseFlightDate,', 'parseFlightDate: parseFlightDate,\n        parseTimestamp: parseTimestamp,');
    fs.writeFileSync('assets/js/cargo-store.js', code, 'utf8');
    console.log('Added parseTimestamp to cargo-store.js');
} else {
    console.log('parseTimestamp already exists in cargo-store.js');
}
