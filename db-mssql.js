/**
 * SQL Server (Microsoft SQL Server / SSMS) driver adapter.
 *
 * Exposes the same promise helpers as the SQLite layer in db.js
 * (run / get / all / exec / getDb / close) and transparently translates the
 * SQLite dialect used by the project into T-SQL, so server.js and db.js
 * business logic do not need to change.
 *
 * Connection (Windows Authentication):
 *   Server=JAKIVIP; Integrated Security=True; Encrypt=True; TrustServerCertificate=True
 */
'use strict';

let sql;
try {
    sql = require('mssql/msnodesqlv8'); // required for Windows Authentication (Integrated Security)
} catch (e) {
    sql = require('mssql');
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const SERVER = process.env.MSSQL_SERVER || 'JAKIVIP';
const DATABASE = process.env.MSSQL_DATABASE || 'BiddingCargo';
const ODBC_DRIVER = process.env.MSSQL_ODBC_DRIVER || 'ODBC Driver 18 for SQL Server';

function buildConnectionString(database) {
    if (process.env.MSSQL_CONNECTION_STRING) {
        return process.env.MSSQL_CONNECTION_STRING.replace(/Database=[^;]*/i, `Database=${database}`);
    }
    return `Driver={${ODBC_DRIVER}};Server=${SERVER};Database=${database};` +
        'Trusted_Connection=Yes;Encrypt=Yes;TrustServerCertificate=Yes;';
}

function buildConfig(database) {
    return {
        connectionString: buildConnectionString(database),
        // ONE connection on purpose: db.js drives BEGIN/COMMIT as separate statements
        // (exactly like the single SQLite connection), so every statement must share a session.
        pool: { max: 1, min: 1 },
        options: { trustedConnection: true, encrypt: true, trustServerCertificate: true }
    };
}

// ---------------------------------------------------------------------------
// Dialect metadata
// ---------------------------------------------------------------------------
const PK = {
    agents: ['code'], users: ['id'], auctions: ['id'], bids: ['id'], won_auctions: ['wonId'],
    notifications: ['id'], registrations: ['regId'], chats: ['id'], chat_messages: ['id'],
    activity_logs: ['id'], email_logs: ['id'], settings: ['key']
};
// Tables that were AUTOINCREMENT in SQLite: id is generated when omitted.
const AUTO_ID = new Set(['notifications', 'email_logs']);
// Identifiers that are reserved / special in T-SQL and must be bracketed.
const QUOTE_WORDS = ['read', 'key', 'timestamp'];
const BIGINT_NAMES = new Set(['timestamp', 'rawTime', 'totalAmountVND']);

let pool = null;
let txActive = false;

// ---------------------------------------------------------------------------
// SQL translation helpers
// ---------------------------------------------------------------------------
/** Split SQL into code / string-literal tokens ('...' and "..." both become N'...'). */
function tokenize(text) {
    const tokens = [];
    let i = 0, code = '';
    while (i < text.length) {
        const ch = text[i];
        if (ch === "'" || ch === '"') {
            if (code) { tokens.push({ lit: false, v: code }); code = ''; }
            let j = i + 1, body = '';
            while (j < text.length) {
                if (text[j] === ch) {
                    if (text[j + 1] === ch) { body += ch; j += 2; continue; }
                    break;
                }
                body += text[j]; j++;
            }
            tokens.push({ lit: true, v: "N'" + body.replace(/'/g, "''") + "'" });
            i = j + 1;
        } else { code += ch; i++; }
    }
    if (code) tokens.push({ lit: false, v: code });
    return tokens;
}

function splitTopLevelCommas(text) {
    const out = []; let cur = '', q = null;
    for (const ch of text) {
        if (q) { cur += ch; if (ch === q) q = null; continue; }
        if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
        if (ch === ',') { out.push(cur.trim()); cur = ''; continue; }
        cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

const bq = c => '[' + String(c).replace(/^\[|\]$/g, '') + ']';

/** INSERT OR IGNORE / INSERT OR REPLACE / ON CONFLICT DO UPDATE  ->  MERGE ;  auto id for AUTOINCREMENT tables. */
function rewriteInsert(sqlText) {
    const m = /^\s*INSERT\s+(?:OR\s+(IGNORE|REPLACE)\s+)?INTO\s+(\w+)\s*\(([^)]*)\)\s*VALUES\s*\(([\s\S]*?)\)\s*(ON\s+CONFLICT[\s\S]*)?;?\s*$/i.exec(sqlText);
    if (!m) return sqlText;
    const mode = m[1] ? m[1].toUpperCase() : (m[5] ? 'UPSERT' : null);
    const table = m[2];
    const cols = m[3].split(',').map(s => s.trim().replace(/^\[|\]$/g, ''));
    const vals = splitTopLevelCommas(m[4]);
    if (cols.length !== vals.length) return sqlText;

    if (!mode) {
        if (AUTO_ID.has(table) && !cols.some(c => c.toLowerCase() === 'id')) {
            return `INSERT INTO ${table} (id, ${cols.map(bq).join(', ')}) ` +
                `SELECT ISNULL(MAX(id), 0) + 1, ${vals.join(', ')} FROM ${table} WITH (TABLOCKX, HOLDLOCK)`;
        }
        return sqlText;
    }

    const pk = PK[table.toLowerCase()];
    if (!pk) return sqlText;
    const on = pk.map(k => `tgt.${bq(k)} = src.${bq(k)}`).join(' AND ');
    const nonPk = cols.filter(c => !pk.includes(c));
    let stmt = `MERGE INTO ${table} WITH (HOLDLOCK) AS tgt ` +
        `USING (VALUES (${vals.join(', ')})) AS src (${cols.map(bq).join(', ')}) ON (${on}) ` +
        `WHEN NOT MATCHED THEN INSERT (${cols.map(bq).join(', ')}) VALUES (${cols.map(c => 'src.' + bq(c)).join(', ')})`;
    if ((mode === 'REPLACE' || mode === 'UPSERT') && nonPk.length) {
        stmt += ` WHEN MATCHED THEN UPDATE SET ${nonPk.map(c => `tgt.${bq(c)} = src.${bq(c)}`).join(', ')}`;
    }
    return stmt + ';';
}

function toLiteral(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
    if (typeof v === 'boolean') return v ? '1' : '0';
    return "N'" + String(v).replace(/'/g, "''") + "'";
}

/** Translate one SQLite statement. Returns { text, params } ready for mssql (named @pN params). */
function translate(sqlText, params) {
    params = params || [];
    let text = rewriteInsert(sqlText.trim());
    const inline = params.length > 2000; // SQL Server hard limit: 2100 parameters / request
    let n = 0;
    const out = tokenize(text).map(tok => {
        if (tok.lit) return tok.v;
        let c = tok.v;
        for (const w of QUOTE_WORDS) c = c.replace(new RegExp(`(?<![\\[\\w.])${w}(?![\\]\\w])`, 'gi'), `[${w}]`);
        c = c.replace(/\bLIMIT\s+(\d+)\s*;?\s*$/i, 'OFFSET 0 ROWS FETCH NEXT $1 ROWS ONLY');
        c = c.replace(/\?/g, () => {
            const idx = n++;
            return inline ? toLiteral(params[idx]) : '@arg' + (idx + 1);
        });
        return c;
    });
    return { text: out.join(''), params: inline ? [] : params };
}

function bindType(v) {
    if (v === null || v === undefined) return [sql.NVarChar(4000), null];
    if (typeof v === 'boolean') return [sql.Int, v ? 1 : 0];
    if (typeof v === 'number') return Number.isInteger(v) ? [sql.BigInt, v] : [sql.Float, v];
    if (v instanceof Date) return [sql.NVarChar(sql.MAX), v.toISOString()];
    const s = String(v);
    return [s.length <= 4000 ? sql.NVarChar(4000) : sql.NVarChar(sql.MAX), s];
}

function normalizeRows(result) {
    const rows = (result && result.recordset) || [];
    if (!rows.length) return rows;
    const cols = result.recordset.columns || {};
    const bigCols = Object.keys(cols).filter(k => {
        const t = cols[k] && cols[k].type;
        return BIGINT_NAMES.has(k) || t === sql.BigInt || (t && t.name === 'BigInt');
    });
    if (!bigCols.length) return rows;
    for (const r of rows) {
        for (const k of bigCols) {
            if (typeof r[k] === 'string' && r[k] !== '' && !isNaN(Number(r[k]))) r[k] = Number(r[k]);
        }
    }
    return rows;
}

// ---------------------------------------------------------------------------
// Core execution
// ---------------------------------------------------------------------------
async function execute(statement, params) {
    if (!pool) await init();
    const req = pool.request();
    params.forEach((v, i) => { const [t, val] = bindType(v); req.input('arg' + (i + 1), t, val); });
    return req.query(statement);
}

async function runStatement(sqlText, params = []) {
    const trimmed = String(sqlText).trim().replace(/;+\s*$/, '');
    const upper = trimmed.toUpperCase();

    if (upper.startsWith('PRAGMA')) return { recordset: [], rowsAffected: [0] };

    if (/^BEGIN(\s+(IMMEDIATE|DEFERRED|EXCLUSIVE))?(\s+TRANSACTION)?$/.test(upper)) {
        if (txActive) throw new Error('cannot start a transaction within a transaction');
        const r = await execute('BEGIN TRANSACTION', []);
        txActive = true;
        return r;
    }
    if (upper === 'COMMIT' || upper === 'COMMIT TRANSACTION' || upper === 'END') {
        if (!txActive) throw new Error('cannot commit - no transaction is active');
        const r = await execute('COMMIT TRANSACTION', []);
        txActive = false;
        return r;
    }
    if (upper === 'ROLLBACK' || upper === 'ROLLBACK TRANSACTION') {
        if (!txActive) throw new Error('cannot rollback - no transaction is active');
        const r = await execute('ROLLBACK TRANSACTION', []);
        txActive = false;
        return r;
    }

    const t = translate(sqlText, params);
    return execute(t.text, t.params);
}

function run(sqlText, params = []) {
    return runStatement(sqlText, params).then(r => ({
        lastID: null,
        changes: (r && r.rowsAffected && r.rowsAffected.reduce((a, b) => a + b, 0)) || 0
    }));
}

function get(sqlText, params = []) {
    return runStatement(sqlText, params).then(r => normalizeRows(r)[0]);
}

function all(sqlText, params = []) {
    return runStatement(sqlText, params).then(r => normalizeRows(r));
}

/** Multi-statement helper. SQLite DDL (CREATE ... IF NOT EXISTS / ALTER ADD COLUMN) is handled by init() instead. */
async function exec(sqlText) {
    const text = String(sqlText);
    if (/CREATE\s+(TABLE|INDEX)\s+IF\s+NOT\s+EXISTS/i.test(text) || /^\s*ALTER\s+TABLE\s+\w+\s+ADD\s+COLUMN/i.test(text)) {
        return; // schema is created by init()
    }
    const first = text.trim().replace(/;+\s*$/, '').toUpperCase();
    if (/^(BEGIN|COMMIT|ROLLBACK|END|PRAGMA)\b/.test(first)) {
        await runStatement(text);
        return;
    }
    await execute(text, []);
}

// ---------------------------------------------------------------------------
// Schema (T-SQL equivalent of the SQLite schema in db.js)
// ---------------------------------------------------------------------------
const TEXT = 'NVARCHAR(MAX)';
const KEY = 'NVARCHAR(450)';

const SCHEMA = [
    `CREATE TABLE agents (
        code ${KEY} NOT NULL PRIMARY KEY, name ${TEXT}, companyName ${TEXT}, taxCode NVARCHAR(100), email NVARCHAR(255),
        phone NVARCHAR(100), status NVARCHAR(100), isLocked INT DEFAULT 0, lockedReason ${TEXT},
        lockedAt NVARCHAR(100), unlockedAt NVARCHAR(100), password NVARCHAR(255), pin NVARCHAR(50))`,
    `CREATE TABLE users (
        id ${KEY} NOT NULL PRIMARY KEY, username ${KEY} UNIQUE, agentCode ${KEY}, password NVARCHAR(255), pin NVARCHAR(50),
        role NVARCHAR(50), fullName ${TEXT}, email NVARCHAR(255), companyName ${TEXT}, status NVARCHAR(50))`,
    `CREATE TABLE auctions (
        id INT NOT NULL PRIMARY KEY, flightCode NVARCHAR(100), flightNumber NVARCHAR(100), route NVARCHAR(100),
        origin NVARCHAR(50), destination NVARCHAR(50), originName NVARCHAR(255), destName NVARCHAR(255),
        etd NVARCHAR(100), eta NVARCHAR(100), etdIso NVARCHAR(100), aircraft NVARCHAR(255), capacityKg INT,
        startingPriceKg INT, currentPriceKg INT, minStep INT, endTime NVARCHAR(100), status NVARCHAR(50),
        leadingAgentCode ${KEY}, leadingAgentName ${TEXT}, bidsCount INT DEFAULT 0, winnerAgentCode ${KEY},
        winnerAgentName ${TEXT}, winningPriceKg INT, specialNotes ${TEXT}, cutOffTime NVARCHAR(100))`,
    `CREATE TABLE bids (
        id ${KEY} NOT NULL PRIMARY KEY, [timestamp] BIGINT, auctionId INT, agentCode ${KEY}, agentName ${TEXT},
        isAnonymous INT DEFAULT 1, priceKg INT, [time] NVARCHAR(100), status NVARCHAR(50), weightKg INT,
        CONSTRAINT FK_bids_auction FOREIGN KEY (auctionId) REFERENCES auctions(id) ON DELETE CASCADE ON UPDATE NO ACTION)`,
    `CREATE TABLE won_auctions (
        wonId ${KEY} NOT NULL PRIMARY KEY, auctionId INT, agentCode ${KEY}, flightNumber NVARCHAR(100), route NVARCHAR(100),
        capacityKg INT, priceKg INT, totalAmountVND BIGINT, paymentDeadline NVARCHAR(100), paymentStatus NVARCHAR(50),
        paidAt NVARCHAR(100), awbNumber NVARCHAR(100), cutOffTime NVARCHAR(100), warehouse ${TEXT},
        cargo_declaration_json ${TEXT}, lockWaivedByAdmin INT DEFAULT 0, lockPenaltyHandled INT DEFAULT 0,
        momoOrderId NVARCHAR(255), momoRequestId NVARCHAR(255), momoOrderInfo ${TEXT}, momoPayUrl ${TEXT},
        momoQrCodeUrl ${TEXT}, momoDeeplink ${TEXT}, momoTransId NVARCHAR(255), momoPaidAt NVARCHAR(100),
        momoCreatedAt NVARCHAR(100), momoExpiresAt NVARCHAR(100), refundStatus NVARCHAR(50), refundBankInfo_json ${TEXT},
        refundConfirmedAt NVARCHAR(100), refundConfirmedBy NVARCHAR(255), refundNote ${TEXT}, paymentProof_json ${TEXT},
        rejectionReason ${TEXT})`,
    `CREATE TABLE notifications (
        id BIGINT NOT NULL PRIMARY KEY, targetAgentCode ${KEY}, targetRole NVARCHAR(100), title ${TEXT}, message ${TEXT},
        [time] NVARCHAR(100), [type] NVARCHAR(100), [read] INT DEFAULT 0, link ${TEXT}, unread INT DEFAULT 1)`,
    `CREATE TABLE registrations (
        regId ${KEY} NOT NULL PRIMARY KEY, companyName ${TEXT}, taxCode NVARCHAR(100), address ${TEXT}, field ${TEXT},
        repName ${TEXT}, repPosition ${TEXT}, email NVARCHAR(255), phone NVARCHAR(100), documents ${TEXT},
        status NVARCHAR(50), submittedAt NVARCHAR(100), rejectionReason ${TEXT}, agentCode ${KEY}, approvedAt NVARCHAR(100))`,
    `CREATE TABLE chats (
        id ${KEY} NOT NULL PRIMARY KEY, agentCode ${KEY}, agentName ${TEXT}, status NVARCHAR(50), createdAt NVARCHAR(100),
        closedAt NVARCHAR(100), assignedTo NVARCHAR(255), assignedName ${TEXT})`,
    `CREATE TABLE chat_messages (
        id ${KEY} NOT NULL PRIMARY KEY, chatId ${KEY}, sender NVARCHAR(100), senderName ${TEXT}, [text] ${TEXT},
        fileUrl ${TEXT}, fileName ${TEXT}, fileType NVARCHAR(255), [timestamp] BIGINT, [read] INT DEFAULT 0,
        CONSTRAINT FK_chat_messages_chat FOREIGN KEY (chatId) REFERENCES chats(id) ON DELETE CASCADE ON UPDATE NO ACTION)`,
    `CREATE TABLE activity_logs (
        id BIGINT NOT NULL PRIMARY KEY, [timestamp] NVARCHAR(100), rawTime BIGINT, actor ${TEXT}, username NVARCHAR(255),
        role NVARCHAR(100), actionCategory NVARCHAR(255), actionTitle ${TEXT}, target ${TEXT}, details ${TEXT},
        ip NVARCHAR(100), device ${TEXT})`,
    `CREATE TABLE email_logs (
        id BIGINT NOT NULL PRIMARY KEY, toAddress NVARCHAR(255), [type] NVARCHAR(100), subject ${TEXT}, messageId ${TEXT},
        isRealSmtp INT DEFAULT 0, previewUrl ${TEXT}, sentAt NVARCHAR(100))`,
    `CREATE TABLE settings ([key] ${KEY} NOT NULL PRIMARY KEY, value ${TEXT})`
];

const INDEXES = [
    ['idx_bids_auctionId', 'bids', 'auctionId'],
    ['idx_won_agentCode', 'won_auctions', 'agentCode'],
    ['idx_chats_agentCode', 'chats', 'agentCode'],
    ['idx_chat_msgs_chatId', 'chat_messages', 'chatId']
];

async function ensureDatabase() {
    const master = new sql.ConnectionPool(buildConfig('master'));
    await master.connect();
    try {
        await master.request().query(`IF DB_ID(N'${DATABASE}') IS NULL CREATE DATABASE [${DATABASE}]`);
    } finally {
        await master.close();
    }
}

async function init() {
    if (pool) return pool;
    console.log(`[Database] Connecting to SQL Server "${SERVER}" / database "${DATABASE}" (Windows Authentication, Encrypt=True, TrustServerCertificate=True)`);
    await ensureDatabase();
    const p = new sql.ConnectionPool(buildConfig(DATABASE));
    await p.connect();
    pool = p;

    for (const ddl of SCHEMA) {
        const name = /CREATE TABLE (\w+)/.exec(ddl)[1];
        await pool.request().query(`IF OBJECT_ID(N'dbo.${name}', N'U') IS NULL BEGIN ${ddl} END`);
    }
    for (const [idx, table, col] of INDEXES) {
        await pool.request().query(
            `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'${idx}' AND object_id = OBJECT_ID(N'dbo.${table}')) CREATE INDEX ${idx} ON ${table}(${col})`);
    }
    console.log('[Database] SQL Server schema ready.');
    return pool;
}

function getDb() { return pool; }

async function close() {
    if (pool) { await pool.close(); pool = null; txActive = false; }
}

module.exports = { init, getDb, run, get, all, exec, close, translate };
