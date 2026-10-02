'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { db } = require('./db');

const COOKIE_NAME = 'lab_session';
const SESSION_DAYS = 30;
const ROLE_RANK = { member: 0, instructor: 1, admin: 2 };

// No 0/O/1/I/L so IDs are easy to read out loud and type by hand.
const ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function generateMemberId() {
  for (;;) {
    let code = '';
    const bytes = crypto.randomBytes(6);
    for (const b of bytes) code += ID_ALPHABET[b % ID_ALPHABET.length];
    const id = `LAB-${code}`;
    if (!db.prepare('SELECT 1 FROM users WHERE member_id = ?').get(id)) return id;
  }
}

function generatePassword() {
  return crypto.randomBytes(9).toString('base64url');
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compareSync(password, hash);
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

function createSession(res, req, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  db.prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    sha256(token),
    userId,
    expires
  );
  db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(Date.now());
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: SESSION_DAYS * 86400_000,
    path: '/',
  });
}

function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (token) db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(sha256(token));
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function destroyAllSessionsFor(userId) {
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId);
}

// Attaches req.user when a valid session cookie is present.
function loadUser(req, _res, next) {
  req.user = null;
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (token) {
    const row = db
      .prepare(
        `SELECT u.id, u.member_id, u.name, u.email, u.phone, u.bio, u.role, u.active
           FROM auth_sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ? AND s.expires_at > ?`
      )
      .get(sha256(token), Date.now());
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

// Simple in-memory limiter for login attempts: max 10 per 15 minutes per key.
const attempts = new Map();
function tooManyAttempts(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.reset < now) return false;
  return entry.count >= 10;
}
function recordFailedAttempt(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.reset < now) attempts.set(key, { count: 1, reset: now + 15 * 60_000 });
  else entry.count += 1;
  if (attempts.size > 10_000) {
    for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
  }
}
function clearAttempts(key) {
  attempts.delete(key);
}

module.exports = {
  ROLE_RANK,
  generateMemberId,
  generatePassword,
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  destroyAllSessionsFor,
  loadUser,
  requireRole,
  tooManyAttempts,
  recordFailedAttempt,
  clearAttempts,
};
