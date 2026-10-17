'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { db } = require('./db');

const COOKIE_NAME = 'rsvp_admin';
const SESSION_DAYS = 30;

function generatePassword() {
  return crypto.randomBytes(9).toString('base64url');
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

// Used when the account does not exist, so a failed login always costs one bcrypt comparison.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

function verifyPassword(password, hash) {
  return bcrypt.compareSync(String(password || ''), hash || DUMMY_HASH) && Boolean(hash);
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

async function createSession(res, req, adminId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  await db.run('INSERT INTO auth_sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)', sha256(token), adminId, expires);
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

// Attaches req.admin when a valid session cookie is present.
async function loadAdmin(req, _res, next) {
  req.admin = null;
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (token) {
    req.admin = (await db.get(
      `SELECT a.id, a.email, a.name, a.created_at FROM auth_sessions s JOIN admins a ON a.id = s.admin_id
        WHERE s.token_hash = ? AND s.expires_at > ?`,
      sha256(token),
      Date.now()
    )) || null;
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.admin) return res.status(401).json({ error: 'Please log in.' });
  next();
}

// Simple in-memory limiter for login attempts: max 10 per 15 minutes per key.
const attempts = new Map();
function tooManyAttempts(key) {
  const entry = attempts.get(key);
  return Boolean(entry && entry.reset > Date.now() && entry.count >= 10);
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
  generatePassword,
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  loadAdmin,
  requireAdmin,
  tooManyAttempts,
  recordFailedAttempt,
  clearAttempts,
  sha256,
};
