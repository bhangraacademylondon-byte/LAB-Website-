'use strict';

// Database layer. In production the data lives in Postgres (e.g. Supabase),
// set with DATABASE_URL. Without it (local development and tests) the app uses
// PGlite, an embedded Postgres stored in DATA_DIR, so there is nothing to install.
//
// Queries are written with "?" placeholders; they are converted to $1, $2, ...

const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const DATABASE_URL = process.env.DATABASE_URL || '';

// Timestamps are stored as UTC text ("2026-10-15 19:30:00"), which the front end expects.
const NOW = "to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id                  SERIAL PRIMARY KEY,
    member_id           TEXT NOT NULL UNIQUE,
    name                TEXT NOT NULL,
    email               TEXT,
    phone               TEXT,
    password_hash       TEXT,
    role                TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'instructor', 'admin')),
    active              INTEGER NOT NULL DEFAULT 1,
    notes               TEXT,
    bio                 TEXT NOT NULL DEFAULT '',
    privacy_version     TEXT,
    privacy_accepted_at TEXT,
    under_16            INTEGER NOT NULL DEFAULT 0,
    guardian_name       TEXT,
    guardian_email      TEXT,
    guardian_phone      TEXT,
    created_at          TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (lower(email));

  CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS class_sessions (
    id         SERIAL PRIMARY KEY,
    title      TEXT NOT NULL,
    date       TEXT NOT NULL,
    start_time TEXT NOT NULL DEFAULT '',
    end_time   TEXT NOT NULL DEFAULT '',
    location   TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    UNIQUE (title, date, start_time)
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id         SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scanned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    method     TEXT NOT NULL DEFAULT 'qr',
    created_at TEXT NOT NULL DEFAULT ${NOW},
    UNIQUE (session_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    phone      TEXT,
    subject    TEXT,
    body       TEXT NOT NULL,
    is_read    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  -- Filled in by a teacher after each class. pouch_balance_pence is the cash in
  -- the LAB pouch at the end of the class, stored in pence to avoid rounding.
  CREATE TABLE IF NOT EXISTS class_debriefs (
    id                  SERIAL PRIMARY KEY,
    session_id          INTEGER UNIQUE REFERENCES class_sessions(id) ON DELETE SET NULL,
    class_title         TEXT NOT NULL DEFAULT '',
    class_date          TEXT NOT NULL,
    ran_by              TEXT NOT NULL,
    attendee_count      INTEGER NOT NULL DEFAULT 0,
    pouch_balance_pence INTEGER,
    feedback            TEXT NOT NULL DEFAULT '',
    submitted_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at          TEXT NOT NULL DEFAULT ${NOW},
    updated_at          TEXT NOT NULL DEFAULT ${NOW}
  );

  -- Record of every privacy policy acceptance (who agreed to which version, and when).
  CREATE TABLE IF NOT EXISTS privacy_consents (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    version        TEXT NOT NULL,
    under_16       INTEGER NOT NULL DEFAULT 0,
    guardian_name  TEXT,
    guardian_email TEXT,
    accepted_at    TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE INDEX IF NOT EXISTS idx_debriefs_date ON class_debriefs(class_date);
  CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_date ON class_sessions(date);
  CREATE INDEX IF NOT EXISTS idx_consents_user ON privacy_consents(user_id);
`;

// "?" -> "$1", "$2", ... (none of our SQL contains a literal question mark).
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

let driver = null; // { query(sql, params) -> { rows, rowCount }, close() }

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

const db = {
  NOW,
  get kind() {
    return driver?.kind || (DATABASE_URL ? 'postgres' : 'pglite');
  },
  async get(sql, ...params) {
    return (await query(sql, params)).rows[0];
  },
  async all(sql, ...params) {
    return (await query(sql, params)).rows;
  },
  async run(sql, ...params) {
    const r = await query(sql, params);
    return { changes: r.rowCount, rows: r.rows };
  },
};

// Runs fn with a transaction-scoped { get, all, run }.
async function transaction(fn) {
  if (!driver) await init();
  return driver.transaction((tx) => {
    const q = (sql, params) => tx.query(toPg(sql), params);
    return fn({
      get: async (sql, ...p) => (await q(sql, p)).rows[0],
      all: async (sql, ...p) => (await q(sql, p)).rows,
      run: async (sql, ...p) => {
        const r = await q(sql, p);
        return { changes: r.rowCount, rows: r.rows };
      },
    });
  });
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
