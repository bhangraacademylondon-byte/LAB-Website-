'use strict';

// Database layer. In production the data lives in Postgres (e.g. Supabase),
// set with DATABASE_URL. Without it (local use and tests) the app uses PGlite,
// an embedded Postgres stored in DATA_DIR, so there is nothing to install.
//
// Queries are written with "?" placeholders; they are converted to $1, $2, ...

const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const DATABASE_URL = process.env.DATABASE_URL || '';

// Timestamps are stored as UTC text ("2026-10-15 19:30:00"), which the front end expects.
const NOW = "to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS admins (
    id            SERIAL PRIMARY KEY,
    email         TEXT NOT NULL,
    name          TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE UNIQUE INDEX IF NOT EXISTS admins_email_lower ON admins (lower(email));

  CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- One invitation: a family or group who reply together.
  -- events lists the ids of the events they are invited to, as JSON.
  -- answers holds the replies to the family-wide RSVP questions, as JSON.
  CREATE TABLE IF NOT EXISTS households (
    id             SERIAL PRIMARY KEY,
    name           TEXT NOT NULL,
    contact_phone  TEXT NOT NULL DEFAULT '',
    contact_email  TEXT NOT NULL DEFAULT '',
    notes          TEXT NOT NULL DEFAULT '',
    plus_ones      INTEGER NOT NULL DEFAULT 0,
    events         TEXT NOT NULL DEFAULT '[]',
    answers        TEXT NOT NULL DEFAULT '{}',
    responded_by   TEXT,
    responded_at   TEXT,
    updated_at     TEXT,
    response_count INTEGER NOT NULL DEFAULT 0,
    chased_at      TEXT,
    created_at     TEXT NOT NULL DEFAULT ${NOW}
  );

  -- attendance: which events the guest is coming to, as JSON {"pooja": true, "party": false}.
  -- An event missing from it means no reply yet for that event.
  -- Plus-ones are added by the family when they reply (is_plus_one = 1).
  CREATE TABLE IF NOT EXISTS guests (
    id           SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    is_child     INTEGER NOT NULL DEFAULT 0,
    is_plus_one  INTEGER NOT NULL DEFAULT 0,
    attendance   TEXT NOT NULL DEFAULT '{}',
    answers      TEXT NOT NULL DEFAULT '{}',
    sort         INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT ${NOW}
  );

  -- Every RSVP, change and admin edit, with what changed.
  CREATE TABLE IF NOT EXISTS rsvp_log (
    id             SERIAL PRIMARY KEY,
    household_id   INTEGER REFERENCES households(id) ON DELETE SET NULL,
    household_name TEXT NOT NULL,
    action         TEXT NOT NULL,
    actor          TEXT NOT NULL DEFAULT '',
    summary        TEXT NOT NULL DEFAULT '',
    changes        TEXT NOT NULL DEFAULT '[]',
    snapshot       TEXT NOT NULL DEFAULT '{}',
    created_at     TEXT NOT NULL DEFAULT ${NOW}
  );

  -- Databases created before invitations could be for several events.
  ALTER TABLE households ADD COLUMN IF NOT EXISTS events TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE guests ADD COLUMN IF NOT EXISTS attendance TEXT NOT NULL DEFAULT '{}';

  CREATE INDEX IF NOT EXISTS idx_guests_household ON guests(household_id);
  CREATE INDEX IF NOT EXISTS idx_log_household ON rsvp_log(household_id);
`;

// "?" -> "$1", "$2", ... (none of our SQL contains a literal question mark).
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

let driver = null; // { query(sql, params) -> { rows, rowCount }, exec, transaction, close }

async function connectPostgres() {
  const pg = require('pg');
  // COUNT(*) and other BIGINTs come back as strings by default; the numbers here are small.
  pg.types.setTypeParser(20, (v) => Number.parseInt(v, 10));
  const url = new URL(DATABASE_URL);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  // Hosted Postgres such as Supabase needs TLS. Its certificates are signed by
  // the provider's own authority, so the connection is encrypted without
  // checking the chain against Node's built-in list.
  url.searchParams.delete('sslmode');
  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl: local ? false : { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_SIZE) || 5,
    idleTimeoutMillis: 30_000,
  });
  pool.on('error', (err) => console.error('Database connection error:', err.message));
  return {
    kind: 'postgres',
    query: (sql, params) => pool.query(sql, params),
    exec: (sql) => pool.query(sql),
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: (sql, params) => client.query(sql, params) });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function connectPglite() {
  const { PGlite } = require('@electric-sql/pglite');
  const dir = process.env.PGLITE_DIR || path.join(DATA_DIR, 'pglite');
  if (dir !== 'memory') fs.mkdirSync(dir, { recursive: true });
  const pglite = new PGlite(dir === 'memory' ? undefined : dir);
  await pglite.waitReady;
  const wrap = (r) => ({ rows: r.rows, rowCount: r.affectedRows ?? r.rows.length });
  return {
    kind: 'pglite',
    query: async (sql, params) => wrap(await pglite.query(sql, params)),
    exec: (sql) => pglite.exec(sql),
    transaction: (fn) => pglite.transaction((tx) => fn({ query: async (sql, params) => wrap(await tx.query(sql, params)) })),
    close: () => pglite.close(),
  };
}

let ready = null;
function init() {
  if (!ready) {
    ready = (async () => {
      driver = DATABASE_URL ? await connectPostgres() : await connectPglite();
      await driver.exec(SCHEMA);
      return driver;
    })();
  }
  return ready;
}

async function query(sql, params = []) {
  if (!driver) await init();
  return driver.query(toPg(sql), params);
}

function helpers(q) {
  return {
    get: async (sql, ...p) => (await q(sql, p)).rows[0],
    all: async (sql, ...p) => (await q(sql, p)).rows,
    run: async (sql, ...p) => {
      const r = await q(sql, p);
      return { changes: r.rowCount, rows: r.rows };
    },
  };
}

const db = {
  NOW,
  get kind() {
    return driver?.kind || (DATABASE_URL ? 'postgres' : 'pglite');
  },
  ...helpers(query),
};

// Runs fn with a transaction-scoped { get, all, run }.
async function transaction(fn) {
  if (!driver) await init();
  return driver.transaction((tx) => fn(helpers((sql, params) => tx.query(toPg(sql), params))));
}

async function getSetting(key, fallback = null) {
  const row = await db.get('SELECT value FROM settings WHERE key = ?', key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

async function setSetting(key, value) {
  await db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    key,
    JSON.stringify(value)
  );
}

// True for Postgres "unique constraint" errors (e.g. an email already in use).
function isUniqueViolation(err) {
  return err?.code === '23505';
}

async function close() {
  if (driver) await driver.close();
  driver = null;
  ready = null;
}

module.exports = { db, init, close, transaction, getSetting, setSetting, isUniqueViolation, DATA_DIR, DATABASE_URL };
