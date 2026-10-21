/**
 * Clean junk / surplus auctions from the configured database (DB_TYPE in .env).
 *
 *   node scripts/cleanup_auctions.js            -> DRY RUN (lists what would be removed)
 *   node scripts/cleanup_auctions.js --apply    -> actually delete (SQLite file is backed up first)
 *
 * Removed:
 *   1. Corrupt auctions: missing origin/destination/capacity, or flightNumber VU-HIST / flightCode FL-TEST-*
 *   2. Surplus auctions: CLOSED/ENDED, end time in the past, with NO bids and NO won record
 *   3. Won records pointing at a removed auction or with a NULL auctionId
 * Never removed: auctions that are OPEN/UPCOMING, or that have bids / won records (unless corrupt).
 */
const fs = require('fs');
const path = require('path');
const db = require('../db');

const APPLY = process.argv.includes('--apply');

(async () => {
    await db.initDatabase();

    const auctions = await db.all('SELECT * FROM auctions');
    const bids = await db.all('SELECT auctionId FROM bids');
    const won = await db.all('SELECT wonId, auctionId FROM won_auctions');

    const bidCount = new Map(); bids.forEach(b => bidCount.set(Number(b.auctionId), (bidCount.get(Number(b.auctionId)) || 0) + 1));
    const wonCount = new Map(); won.forEach(w => w.auctionId != null && wonCount.set(Number(w.auctionId), (wonCount.get(Number(w.auctionId)) || 0) + 1));

    const now = Date.now();
    const remove = [];
    for (const a of auctions) {
        const corrupt = !a.origin || !a.destination || !(Number(a.capacityKg) > 0)
            || String(a.flightNumber || '').toUpperCase() === 'VU-HIST'
            || /^FL-TEST/i.test(a.flightCode || '');
        const endMs = Date.parse(a.endTime);
        const finished = ['CLOSED', 'ENDED', 'DELETED', 'CANCELLED'].includes(String(a.status).toUpperCase());
        const unused = !(bidCount.get(Number(a.id)) > 0) && !(wonCount.get(Number(a.id)) > 0);
        const surplus = finished && unused && !isNaN(endMs) && endMs < now;
        if (corrupt) remove.push({ a, why: 'corrupt' });
        else if (surplus) remove.push({ a, why: 'surplus (closed, no bids, no won)' });
    }
    const ids = new Set(remove.map(r => Number(r.a.id)));
    const wonRemove = won.filter(w => w.auctionId == null || ids.has(Number(w.auctionId)));

    console.log(`\nDatabase: ${process.env.DB_TYPE || 'mssql'}   Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
    console.log(`Auctions total: ${auctions.length}`);
    console.log('\nAuctions to remove:');
    remove.forEach(r => console.log(`  #${r.a.id}  ${r.a.flightNumber || '-'}  ${r.a.flightCode || '-'}  [${r.a.status}]  -> ${r.why}`));
    console.log('\nWon records to remove:');
    wonRemove.forEach(w => console.log(`  ${w.wonId} (auctionId=${w.auctionId})`));

    if (!APPLY) { console.log('\nDry run only. Re-run with --apply to delete.'); process.exit(0); }

    if ((process.env.DB_TYPE || 'mssql').toLowerCase() === 'sqlite') {
        const src = path.join(__dirname, '..', 'database.sqlite');
        const bak = src + '.bak-' + Date.now();
        await db.run('PRAGMA wal_checkpoint(FULL);').catch(() => {});
        fs.copyFileSync(src, bak);
        console.log('Backup written:', bak);
    } else {
        console.log('NOTE: SQL Server - take a backup yourself if you have not already.');
    }

    for (const w of wonRemove) await db.run('DELETE FROM won_auctions WHERE wonId = ?', [w.wonId]);
    for (const id of ids) {
        await db.run('DELETE FROM bids WHERE auctionId = ?', [id]);
        await db.run('DELETE FROM won_auctions WHERE auctionId = ?', [id]);
        await db.run('DELETE FROM auctions WHERE id = ?', [id]);
    }
    console.log(`\nDeleted ${ids.size} auctions and ${wonRemove.length} won records.`);
    process.exit(0);
})().catch(e => { console.error('Cleanup failed:', e); process.exit(1); });
