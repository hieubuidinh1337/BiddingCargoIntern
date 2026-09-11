const fs = require('fs');
let c = fs.readFileSync('server.js', 'utf8');

function errFor(name) {
  return `req.on('error', err => { console.error('[${name}] Stream error:', err.message); if (!res.headersSent) { res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({success:false,error:'Stream error'})); } });`;
}

['assign','close','read'].forEach(name => {
  const anchor = `pathname === '/api/chat/${name}'`;
  const idx = c.indexOf(anchor);
  if (idx === -1) { console.log('NOT FOUND:', name); return; }
  const dataSearch = "req.on('data', chunk => { body += chunk; });";
  const dataIdx = c.indexOf(dataSearch, idx);
  if (dataIdx === -1) { console.log('No data handler for:', name); return; }
  const insertAt = dataIdx + dataSearch.length;
  const errLine = '\n        ' + errFor(name);
  c = c.slice(0, insertAt) + errLine + c.slice(insertAt);
  console.log('Fixed:', name);
});

fs.writeFileSync('server.js', c, 'utf8');
const count = (c.match(/req\.on\('error'/g) || []).length;
console.log('Done. Total req.on(error) handlers:', count);
