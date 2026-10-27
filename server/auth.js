'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { db } = require('./db');

const COOKIE_NAME = 'lab_session';
const SESSION_DAYS = 30;
const ROLE_RANK = { member: 0, instructor: 1, admin: 2 };

// No 0/O/1/I/L so IDs are easy to read out loud and type by hand.
const ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

async function generateMemberId() {
  for (;;) {
    let code = '';
    const bytes = crypto.randomBytes(6);
    for (const b of bytes) code += ID_ALPHABET[b % ID_ALPHABET.length];
    const id = `LAB-${code}`;
    if (!(await db.get('SELECT 1 FROM users WHERE member_id = ?', id))) return id;
  }
}

// A random password that meets the rules below, e.g. "k3Vq-9xTw-Lp2m!".
function generatePassword() {
  const part = () => crypto.randomBytes(3).toString('base64url').replace(/[-_]/g, 'x');
  return `${part()}-${part()}-${part()}!`;
}

// The password rules: at least 12 characters, at least one character that
// isn't a letter or number, and not one of the most common passwords.
const COMMON = new Set(['password123!', 'password1234!', 'qwerty123456!', 'welcome12345!', 'letmein12345!', 'bhangra12345!', 'p@ssword1234', 'p@ssw0rd1234', 'passw0rd123!', '123456789012!']);
function passwordProblem(password) {
  const p = String(password || '');
  if (p.length < 12) return 'Passwords must be at least 12 characters long.';
  if (!/[^A-Za-z0-9]/.test(p)) return 'Passwords must include at least one special character, such as ! ? # or -.';
  if (COMMON.has(p.toLowerCase()) || /^(.)\1+$/.test(p)) return 'That password is too easy to guess. Please choose another.';
  return '';
}

// Hashing and checking run asynchronously, so a burst of logins can't freeze the site.
function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

// Used when the account does not exist, so a failed login always costs one bcrypt comparison.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

async function verifyPassword(password, hash) {
  return (await bcrypt.compare(String(password || ''), hash || DUMMY_HASH)) && Boolean(hash);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

async function createSession(res, req, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  await db.run('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), userId, expires);
  await db.run('DELETE FROM auth_sessions WHERE expires_at < ?', Date.now());
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: SESSION_DAYS * 86400_000,
    path: '/',
  });
}

async function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (token) await db.run('DELETE FROM auth_sessions WHERE token_hash = ?', sha256(token));
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

// Admins and teachers must use two-step login. Only the automated tests, which
// run on a throwaway in-memory database, can switch this off.
const TWO_STEP_REQUIRED = !(process.env.PGLITE_DIR === 'memory' && process.env.LAB_TEST_SKIP_TWO_STEP === '1');
const needsTwoStep = (user) => TWO_STEP_REQUIRED && Boolean(user) && user.role !== 'member';

// After the password, a ticket valid for 5 minutes to enter the code.
async function createChallenge(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.run('DELETE FROM login_challenges WHERE expires_at < ? OR user_id = ?', Date.now(), userId);
  await db.run('INSERT INTO login_challenges (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), userId, Date.now() + 5 * 60_000);
  return token;
}

// Counts a try at the ticket (5 at most) and returns its user ID, or null.
async function useChallenge(token) {
  const row = await db.get('UPDATE login_challenges SET tries = tries + 1 WHERE token_hash = ? AND expires_at > ? RETURNING user_id, tries', sha256(String(token || '')), Date.now());
  if (!row || row.tries > 5) return null;
  return row.user_id;
}

async function endChallenge(token) {
  await db.run('DELETE FROM login_challenges WHERE token_hash = ?', sha256(String(token || '')));
}

// A one-time link for email: valid for `hours`, replacing any earlier one of the same kind.
async function createEmailToken(userId, purpose, hours) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.run('DELETE FROM email_tokens WHERE (user_id = ? AND purpose = ?) OR expires_at < ?', userId, purpose, Date.now());
  await db.run('INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)', sha256(token), userId, purpose, Date.now() + hours * 3600_000);
  return token;
}

// Uses up a link: returns its user ID, or null if it's wrong, used or out of date.
async function useEmailToken(token, purpose) {
  const row = await db.get('DELETE FROM email_tokens WHERE token_hash = ? AND purpose = ? RETURNING user_id, expires_at', sha256(String(token || '')), purpose);
  return row && row.expires_at > Date.now() ? row.user_id : null;
}

async function destroyAllSessionsFor(userId) {
  await db.run('DELETE FROM auth_sessions WHERE user_id = ?', userId);
}

// Attaches req.user when a valid session cookie is present.
async function loadUser(req, _res, next) {
  req.user = null;
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (token) {
    const row = await db.get(
      `SELECT u.id, u.member_id, u.name, u.email, u.phone, u.bio, u.role, u.active, u.created_at,
              u.privacy_version, u.privacy_accepted_at, u.under_16, u.guardian_name, u.guardian_email, u.guardian_phone, u.under16_approved_at, u.must_change_password, u.totp_enabled, u.email_verified_at
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`,
      sha256(token),
      Date.now()
    );
    if (row && row.active) req.user = row;
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please log in.' });
    if (ROLE_RANK[req.user.role] < ROLE_RANK[role]) {
      return res.status(403).json({ error: 'You do not have permission to do that.' });
    }
    next();
  };
}

// Limits kept in the database (so a restart doesn't reset them): how many times
// something keyed by e.g. a connection or an account has happened in a window.
async function limitCount(key) {
  const row = await db.get('SELECT count, reset_at FROM rate_limits WHERE key = ?', key);
  return row && row.reset_at > Date.now() ? row.count : 0;
}

// Counts one more; returns the new count for the current window.
async function limitHit(key, windowMs) {
  const now = Date.now();
  const row = await db.get(
    `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.reset_at < ? THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at < ? THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END
     RETURNING count`,
    key, now + windowMs, now, now
  );
  if (Math.random() < 0.02) await db.run('DELETE FROM rate_limits WHERE reset_at < ?', now);
  return row.count;
}

async function limitClear(key) {
  await db.run('DELETE FROM rate_limits WHERE key = ?', key);
}

// Allows `max` per window for the key; counts this one.
async function allow(key, max, windowMs) {
  return (await limitHit(key, windowMs)) <= max;
}

module.exports = {
  ROLE_RANK,
  generateMemberId,
  generatePassword,
  passwordProblem,
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  destroyAllSessionsFor,
  createEmailToken,
  useEmailToken,
  needsTwoStep,
  createChallenge,
  useChallenge,
  endChallenge,
  loadUser,
  requireRole,
  limitCount,
  limitHit,
  limitClear,
  allow,
};
