'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const compression = require('compression');
const multer = require('multer');
const QRCode = require('qrcode');

const { db, transaction, getSetting, setSetting, init: initDb, isUniqueViolation, DATA_DIR, DATABASE_URL } = require('./db');
const storage = require('./storage');
const auth = require('./auth');
const content = require('./content');
const visitors = require('./visitors');
const payments = require('./payments');
const twostep = require('./twostep');
const mailer = require('./email');
const instagram = require('./instagram');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const TIME_ZONE = process.env.TZ_NAME || 'Europe/London';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY !== undefined ? Number(process.env.TRUST_PROXY) : 1);

// ---------- helpers ----------

const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// A real calendar date ("2026-02-30" is refused) and a real time of day, or blank.
function isDate(value) {
  const v = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
const isTime = (value) => /^(([01]\d|2[0-3]):[0-5]\d)?$/.test(String(value ?? ''));

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function todayInfo(date = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, weekday: 'long' }).format(date);
  return { date: ymd, weekday };
}

function publicUser(u, { includeNotes = false } = {}) {
  return {
    id: u.id,
    memberId: u.member_id,
    name: u.name,
    email: u.email || '',
    phone: u.phone || '',
    role: u.role,
    active: Boolean(u.active),
    bio: u.bio || '',
    notes: includeNotes ? u.notes || '' : undefined,
    createdAt: u.created_at,
    under16: Boolean(u.under_16),
    // Under 16 and not yet approved by a teacher or admin: no pass until then.
    needsApproval: Boolean(u.under_16 && !u.under16_approved_at),
    guardianName: u.guardian_name || '',
    guardianEmail: u.guardian_email || '',
    guardianPhone: u.guardian_phone || '',
    privacyVersion: u.privacy_version || '',
    privacyAcceptedAt: u.privacy_accepted_at || '',
    privacyRequired: u.privacy_version !== currentPrivacyVersion(),
    mustChangePassword: Boolean(u.must_change_password),
    twoStepEnabled: Boolean(u.totp_enabled),
    twoStepSetupRequired: auth.needsTwoStep(u) && !u.totp_enabled,
  };
}

// Teachers an admin has allowed to edit the Our journey page (and nothing else on the site).
async function timelineEditors() {
  const ids = await getSetting('timeline_editors', []);
  return new Set(Array.isArray(ids) ? ids.map(Number) : []);
}

async function canEditTimeline(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === 'instructor' && (await timelineEditors()).has(user.id);
}

// ---------- privacy policy consent ----------

function currentPrivacyVersion() {
  return content.getContent().privacy.version;
}

// Reads the privacy agreement from a sign-up or consent form. Members under 16
// need a parent or guardian's details and their explicit consent. Teachers and
// admins aren't asked their age. Someone already marked as under 16 (by staff
// or an earlier answer) can't answer "16 or over" to remove it: only staff can.
function readConsent(body, user = null) {
  if (body.acceptPrivacy !== true) throw new HttpError(400, 'Please read and accept the Privacy Policy to continue.');
  const none = { under16: false, guardianName: null, guardianEmail: null, guardianPhone: null };
  if (user && user.role !== 'member') return none;
  const known = Boolean(user?.under_16);
  if (!known && !['16plus', 'under16'].includes(body.ageGroup)) throw new HttpError(400, 'Please tell us whether the member is 16 or over, or under 16.');
  const under16 = known || body.ageGroup === 'under16';
  if (!under16) return none;
  const guardianName = str(body.guardianName, 120) || (known ? user.guardian_name || '' : '');
  const guardianEmail = str(body.guardianEmail, 200) || (known ? user.guardian_email || '' : '');
  const guardianPhone = str(body.guardianPhone, 40) || (known ? user.guardian_phone || '' : '');
  if (!guardianName) throw new HttpError(400, "Please enter the parent or guardian's name.");
  if (!EMAIL_RE.test(guardianEmail)) throw new HttpError(400, "Please enter the parent or guardian's email address.");
  if (!guardianPhone) throw new HttpError(400, "Please enter the parent or guardian's mobile number, for emergencies.");
  if (body.guardianConsent !== true) throw new HttpError(400, 'A parent or guardian must give their consent for members under 16.');
  return { under16: true, guardianName, guardianEmail, guardianPhone: guardianPhone || null };
}

async function recordConsent(userId, consent) {
  const version = currentPrivacyVersion();
  (await db.run(`UPDATE users SET privacy_version = ?, privacy_accepted_at = ${db.NOW}, under_16 = ?,
            guardian_name = ?, guardian_email = ?, guardian_phone = ? WHERE id = ?`, version, consent.under16 ? 1 : 0, consent.guardianName, consent.guardianEmail, consent.guardianPhone, userId));
  (await db.run('INSERT INTO privacy_consents (user_id, version, under_16, guardian_name, guardian_email) VALUES (?, ?, ?, ?, ?)', userId, version, consent.under16 ? 1 : 0, consent.guardianName, consent.guardianEmail));
}

async function memberStats(userId) {
  const { date } = todayInfo();
  const month = date.slice(0, 7);
  const total = (await db.get('SELECT COUNT(*) AS n FROM attendance WHERE user_id = ?', userId)).n;
  const thisMonth = (await db.get(`SELECT COUNT(*) AS n FROM attendance a JOIN class_sessions s ON s.id = a.session_id
        WHERE a.user_id = ? AND substr(s.date, 1, 7) = ?`, userId, month)).n;
  const last = (await db.get(`SELECT s.date FROM attendance a JOIN class_sessions s ON s.id = a.session_id
        WHERE a.user_id = ? ORDER BY s.date DESC LIMIT 1`, userId));
  // Attendance per month for the last 6 months (oldest first), including empty months.
  const counts = new Map(
    (await db.all(`SELECT substr(s.date, 1, 7) AS month, COUNT(*) AS n FROM attendance a JOIN class_sessions s ON s.id = a.session_id
          WHERE a.user_id = ? GROUP BY month`, userId))
      .map((r) => [r.month, r.n])
  );
  const [y, m] = month.split('-').map(Number);
  const monthly = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = d.toISOString().slice(0, 7);
    monthly.push({ month: key, count: counts.get(key) || 0 });
  }
  return { total, thisMonth, lastAttended: last ? last.date : null, monthly };
}

async function memberAttendance(userId, limit = 200) {
  return (await db.all(`SELECT s.id AS "sessionId", s.title, s.date, s.start_time AS "startTime", s.end_time AS "endTime",
              s.location, a.method, a.created_at AS "scannedAt"
         FROM attendance a JOIN class_sessions s ON s.id = a.session_id
        WHERE a.user_id = ? ORDER BY s.date DESC, s.start_time DESC LIMIT ?`, userId, limit));
}

// Login accepts an email address or a member ID typed on its own (e.g. "LAB-7K3Q9X").
// Anything containing "@" is always treated as an email, so an address such as
// "slab234567@…" is never mistaken for a member ID.
async function findUserByIdentifier(identifier) {
  const value = identifier.trim();
  if (!value) return null;
  if (!value.includes('@')) {
    const match = value.toUpperCase().match(/^LAB-?([2-9A-HJ-NP-Z]{6})$/);
    return match ? (await db.get('SELECT * FROM users WHERE member_id = ?', `LAB-${match[1]}`)) : null;
  }
  return (await db.get('SELECT * FROM users WHERE lower(email) = lower(?)', value));
}

function extractMemberId(value) {
  const match = String(value).toUpperCase().match(/LAB-?([2-9A-HJ-NP-Z]{6})/);
  return match ? `LAB-${match[1]}` : null;
}

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formula injection and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function sendCsv(res, filename, header, rows) {
  const lines = [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + lines.join('\r\n'));
}

async function qrSvg(memberId) {
  return QRCode.toString(memberId, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#1f1f3a', light: '#ffffff' } });
}

// ---------- security & parsing ----------

app.use(async (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Browsers that have visited over HTTPS never try plain HTTP for a year.
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "frame-src https://www.google.com https://maps.google.com",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  next();
});

// Text (pages, code, styles, content) is sent compressed: about a quarter of the size.
app.use(compression());
// A backup being restored can be large; everything else is small.
const smallJson = express.json({ limit: '2mb' });
const largeJson = express.json({ limit: '50mb' });
app.use((req, res, next) => (req.path === '/api/admin/restore' ? largeJson : smallJson)(req, res, next));
app.use(async (req, _res, next) => {
  // Static files (images, scripts) don't need the website content.
  if (!/\.\w+$/.test(req.path) || req.path.startsWith('/api/')) await content.refreshIfStale();
  next();
});
app.use(auth.loadUser);

// State-changing API calls must carry a custom header. Browsers will not send
// it cross-site without a CORS preflight (which we never allow), so this
// blocks CSRF in combination with SameSite cookies.
app.use('/api', async (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (req.get('X-LAB-CSRF') !== '1') return res.status(403).json({ error: 'Missing request header.' });
  next();
});

// Logged-in members and teachers must accept the current privacy policy before
// using their account. Admins are not blocked (so they can edit the policy),
// but are asked to accept it in the app too.
const PRIVACY_EXEMPT = new Set([
  'GET /me', 'POST /me/privacy', 'GET /me/export', 'POST /me/delete',
  // A new password and two-step login come before accepting the policy.
  'POST /me/password', 'POST /me/two-step/setup', 'GET /me/two-step/qr.svg', 'POST /me/two-step/enable',
  'POST /auth/logout', 'POST /auth/login', 'POST /auth/register', 'POST /auth/two-step',
  'POST /auth/verify', 'POST /auth/forgot', 'POST /auth/reset',
  'GET /content', 'GET /instagram', 'POST /contact',
  'POST /v', 'POST /v/time', 'POST /v/event',
]);
// Anyone whose password must change (too weak, or set by someone else) does that first.
const PASSWORD_EXEMPT = new Set([
  'GET /me', 'POST /me/password', 'POST /auth/logout', 'POST /auth/login',
  'GET /content', 'GET /instagram', 'POST /contact', 'POST /v', 'POST /v/time', 'POST /v/event',
]);
app.use('/api', (req, res, next) => {
  if (!req.user?.must_change_password || PASSWORD_EXEMPT.has(`${req.method} ${req.path}`)) return next();
  res.status(403).json({ error: 'Please choose a new password to continue.', code: 'PASSWORD_CHANGE' });
});

// Admins and teachers set up two-step login before using their account.
const TWO_STEP_EXEMPT = new Set([
  'GET /me', 'POST /me/password', 'POST /me/two-step/setup', 'GET /me/two-step/qr.svg', 'POST /me/two-step/enable',
  'POST /auth/logout', 'POST /auth/login', 'POST /auth/two-step',
  'GET /content', 'GET /instagram', 'POST /contact', 'POST /v', 'POST /v/time', 'POST /v/event',
]);
app.use('/api', (req, res, next) => {
  if (!auth.needsTwoStep(req.user) || req.user.totp_enabled || TWO_STEP_EXEMPT.has(`${req.method} ${req.path}`)) return next();
  res.status(403).json({ error: 'Please set up two-step login to continue.', code: 'TWO_STEP_SETUP' });
});

app.use('/api', async (req, res, next) => {
  if (!req.user || req.user.role === 'admin' || PRIVACY_EXEMPT.has(`${req.method} ${req.path}`)) return next();
  if (req.user.privacy_version === currentPrivacyVersion()) return next();
  res.status(403).json({ error: 'Please read and accept the Privacy Policy to continue.', code: 'PRIVACY_REQUIRED' });
});

// ---------- public API ----------

// Used by the hosting platform to check the app is up (also checks the database).
app.get('/healthz', async (_req, res) => {
  (await db.get('SELECT 1'));
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true });
});

app.get('/api/content', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.json(content.getContent());
});

app.get('/api/instagram', async (_req, res) => {
  const feed = await instagram.getFeed();
  const { gallery, home } = content.getContent();
  const max = Math.min(Math.max(Number(gallery.maxPosts) || 8, Number(home.instagramPostCount) || 0, 1), 50);
  res.setHeader('Cache-Control', 'public, max-age=120');
  res.json({ ...feed, posts: (feed.posts || []).slice(0, max) });
});

// Small in-memory per-IP limiter: allows `max` hits per `windowMs`.
function rateLimiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return false;
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) {
      for (const [k, list] of hits) if (!list.some((t) => now - t < windowMs)) hits.delete(k);
    }
    return true;
  };
}

// Visitor statistics (see visitors.js). Always answers 204 so a failure never troubles the page.
const allowStats = rateLimiter(600, 3600_000);
const stat = (record) => async (req, res) => {
  if (allowStats(req.ip)) await record(req, req.body || {}).catch((err) => console.error('Visitor stats:', err.message));
  res.status(204).end();
};
app.post('/api/v', stat(visitors.recordView));
app.post('/api/v/time', stat(visitors.recordTime));
app.post('/api/v/event', stat(visitors.recordEvent));

app.post('/api/contact', async (req, res) => {
  if (!content.getContent().contact.formEnabled) throw new HttpError(400, 'The contact form is turned off.');
  const name = str(req.body.name, 120);
  const email = str(req.body.email, 200);
  const phone = str(req.body.phone, 40);
  const subject = str(req.body.subject, 200);
  const body = str(req.body.message, 5000);
  if (str(req.body.website)) return res.json({ ok: true }); // honeypot field
  if (!name || !EMAIL_RE.test(email) || !body) throw new HttpError(400, 'Please give your name, a valid email and a message.');
  if (!(await auth.allow(`contact:${req.ip}`, 5, 3600_000))) throw new HttpError(429, 'Too many messages. Please try again later.');
  (await db.run('INSERT INTO messages (name, email, phone, subject, body) VALUES (?, ?, ?, ?, ?)', name, email, phone, subject, body));
  // A copy to the academy's inbox; pressing Reply answers the sender.
  await mailer.send({
    to: mailer.ACADEMY_EMAIL,
    replyTo: email,
    subject: `Website message: ${subject || `from ${name}`}`,
    paragraphs: [`${name} sent a message through the website.`, `Email: ${email}${phone ? `\nPhone: ${phone}` : ''}`, body, 'Reply to this email to answer them. The message is also in Admin → Messages.'],
  });
  res.json({ ok: true });
});

// ---------- auth ----------

// Failed logins are capped per connection (whatever account is tried) and per
// account (whatever connection tries it), for 15 minutes.
const LOGIN_WINDOW = 15 * 60_000;
const LOGIN_MAX_PER_IP = 20;
const LOGIN_MAX_PER_ACCOUNT = 10;

app.post('/api/auth/login', async (req, res) => {
  const identifier = str(req.body.identifier, 200);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const ipKey = `login-ip:${req.ip}`;
  const idKey = `login-id:${identifier.toLowerCase()}`;
  if ((await auth.limitCount(ipKey)) >= LOGIN_MAX_PER_IP || (await auth.limitCount(idKey)) >= LOGIN_MAX_PER_ACCOUNT) {
    throw new HttpError(429, 'Too many attempts. Please wait 15 minutes and try again.');
  }
  const user = await findUserByIdentifier(identifier);
  // Always run a bcrypt comparison so response time does not reveal whether the account exists.
  if (!(await auth.verifyPassword(password, user?.password_hash)) || !user) {
    await auth.limitHit(ipKey, LOGIN_WINDOW);
    await auth.limitHit(idKey, LOGIN_WINDOW);
    throw new HttpError(401, 'Incorrect email/member ID or password.');
  }
  if (!user.active) throw new HttpError(403, 'This account has been deactivated. Please speak to a teacher.');
  // An account made online can't be used until its email address is confirmed.
  if (user.email && !user.email_verified_at && mailer.enabled()) {
    if (await auth.allow(`verify-send:${user.id}`, 3, 3600_000)) await sendVerifyEmail(req, user);
    throw new HttpError(403, "Please confirm your email address first. We've sent you an email with a link (check your spam folder too).");
  }
  await auth.limitClear(idKey);
  // A password that doesn't meet today's rules has to be changed before going any further.
  if (auth.passwordProblem(password) && !user.must_change_password) {
    await db.run('UPDATE users SET must_change_password = 1 WHERE id = ?', user.id);
    user.must_change_password = 1;
  }
  // Admins and teachers then enter a code from their authenticator app.
  if (auth.needsTwoStep(user) && user.totp_enabled) return res.json({ twoStep: true, ticket: await auth.createChallenge(user.id) });
  await auth.createSession(res, req, user.id);
  res.json({ user: publicUser(user) });
});

// The second step: a code from the authenticator app, or one of the backup codes.
app.post('/api/auth/two-step', async (req, res) => {
  const ticket = str(req.body.ticket, 100);
  const code = str(req.body.code, 20);
  const userId = await auth.useChallenge(ticket);
  if (!userId) throw new HttpError(401, 'That took too long or had too many tries. Please log in again.');
  const user = await db.get('SELECT * FROM users WHERE id = ?', userId);
  if (!user?.active) throw new HttpError(401, 'Please log in again.');
  const counter = twostep.check(user.totp_secret, code, Number(user.totp_last));
  if (counter !== null) {
    await db.run('UPDATE users SET totp_last = ? WHERE id = ?', counter, user.id);
  } else {
    const remaining = twostep.useBackupCode(user.totp_backup, code);
    if (remaining === null) throw new HttpError(400, "That code didn't work. Check the app and try the newest code.");
    await db.run('UPDATE users SET totp_backup = ? WHERE id = ?', remaining, user.id);
  }
  await auth.endChallenge(ticket);
  await auth.createSession(res, req, user.id);
  res.json({ user: publicUser(user) });
});

async function sendVerifyEmail(req, user) {
  const token = await auth.createEmailToken(user.id, 'verify', 48);
  await mailer.send({
    to: user.email,
    subject: 'Confirm your email for the London Academy of Bhangra',
    paragraphs: [`Hi ${user.name.split(' ')[0]},`, 'Thanks for joining the LAB! Please confirm this is your email address to finish setting up your account. The link works for 48 hours.', "If you didn't sign up, you can ignore this email."],
    button: { label: 'Confirm my email', url: `${siteOrigin(req)}/verify-email?token=${token}` },
  });
}

// The link in the sign-up email: confirms the address and logs them in.
app.post('/api/auth/verify', async (req, res) => {
  const userId = await auth.useEmailToken(str(req.body.token, 100), 'verify');
  if (!userId) throw new HttpError(400, 'That link has expired or has already been used. Log in to get a new one.');
  await db.run(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, ${db.NOW}) WHERE id = ?`, userId);
  const user = await db.get('SELECT * FROM users WHERE id = ?', userId);
  if (!user?.active) throw new HttpError(403, 'This account has been deactivated. Please speak to a teacher.');
  if (auth.needsTwoStep(user) && user.totp_enabled) return res.json({ verified: true });
  await auth.createSession(res, req, user.id);
  res.json({ verified: true, user: publicUser(user) });
});

// Forgotten password: a one-time link by email. The answer is the same whether
// or not there's an account, so nobody can use it to check who's a member.
app.post('/api/auth/forgot', async (req, res) => {
  if (!mailer.enabled()) throw new HttpError(503, 'Resetting a password by email is not available yet. Please ask a teacher or admin.');
  const address = str(req.body.email, 200).toLowerCase();
  if (!EMAIL_RE.test(address)) throw new HttpError(400, 'Please enter your email address.');
  if (!(await auth.allow(`forgot-ip:${req.ip}`, 10, 3600_000))) throw new HttpError(429, 'Too many requests. Please try again later.');
  const user = await db.get('SELECT * FROM users WHERE lower(email) = ? AND active = 1', address);
  if (user && (await auth.allow(`forgot:${user.id}`, 3, 3600_000))) {
    const token = await auth.createEmailToken(user.id, 'reset', 1);
    await mailer.send({
      to: user.email,
      subject: 'Reset your London Academy of Bhangra password',
      paragraphs: [`Hi ${user.name.split(' ')[0]},`, 'Someone (hopefully you) asked to reset the password for your LAB account. The link below works once, for the next hour.', "If it wasn't you, ignore this email: your password hasn't changed."],
      button: { label: 'Choose a new password', url: `${siteOrigin(req)}/reset-password?token=${token}` },
    });
  }
  res.json({ ok: true });
});

app.post('/api/auth/reset', async (req, res) => {
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const weak = auth.passwordProblem(password);
  if (weak) throw new HttpError(400, weak);
  const userId = await auth.useEmailToken(str(req.body.token, 100), 'reset');
  if (!userId) throw new HttpError(400, 'That link has expired or has already been used. Please ask for a new one.');
  // Following the link also proves the email address is theirs.
  await db.run(`UPDATE users SET password_hash = ?, must_change_password = 0, email_verified_at = COALESCE(email_verified_at, ${db.NOW}) WHERE id = ?`, await auth.hashPassword(password), userId);
  await auth.destroyAllSessionsFor(userId);
  res.json({ ok: true });
});

app.post('/api/auth/register', async (req, res) => {
  if (!content.getContent().members.allowRegistration) throw new HttpError(403, 'Online registration is closed. Please ask a teacher to create your account.');
  const name = str(req.body.name, 120);
  const email = str(req.body.email, 200);
  const phone = str(req.body.phone, 40);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const bio = str(req.body.bio, 1000);
  if (!name) throw new HttpError(400, 'Please enter your name.');
  const consent = readConsent(req.body);
  // Under-16s may leave their own email blank (e.g. a brother or sister already
  // uses the parent's email); they then log in with their member ID.
  if (email ? !EMAIL_RE.test(email) : !consent.under16) throw new HttpError(400, 'Please enter a valid email address.');
  const weak = auth.passwordProblem(password);
  if (weak) throw new HttpError(400, weak);
  if (!(await auth.allow(`register:${req.ip}`, 10, 3600_000))) throw new HttpError(429, 'Too many sign-ups from this connection. Please try again later.');
  const checking = Boolean(email) && mailer.enabled();
  const existing = email ? await db.get('SELECT id, name, email FROM users WHERE lower(email) = lower(?)', email) : null;
  if (existing && checking) {
    // Same answer as a new sign-up; the owner of the address hears about it instead.
    if (await auth.allow(`exists-send:${existing.id}`, 2, 3600_000)) {
      await mailer.send({
        to: existing.email,
        subject: 'You already have a London Academy of Bhangra account',
        paragraphs: [`Hi ${existing.name.split(' ')[0]},`, 'Someone tried to sign up with this email address, but you already have an account. You can log in, or reset your password if you have forgotten it.', "If this wasn't you, you don't need to do anything."],
        button: { label: 'Reset my password', url: `${siteOrigin(req)}/forgot-password` },
      });
    }
    return res.status(202).json({ checkEmail: true });
  }
  if (existing) throw new HttpError(409, 'An account with that email already exists. Try logging in, or leave the email blank for a child who shares a parent\'s email.');
  const memberId = await auth.generateMemberId();
  let info;
  try {
    info = (await db.run('INSERT INTO users (member_id, name, email, phone, password_hash, role, bio) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id', memberId, name, email || null, phone, await auth.hashPassword(password), 'member', bio));
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'An account with that email already exists. Try logging in.');
    throw err;
  }
  const newId = info.rows[0].id;
  await recordConsent(newId, consent);
  // Without email switched on (or without an email address), there's nothing to check.
  if (!checking) await db.run(`UPDATE users SET email_verified_at = ${db.NOW} WHERE id = ?`, newId);
  const user = await db.get('SELECT * FROM users WHERE id = ?', newId);
  if (checking) {
    await sendVerifyEmail(req, user);
    return res.status(202).json({ checkEmail: true });
  }
  await auth.createSession(res, req, user.id);
  res.status(201).json({ user: publicUser(user) });
});

app.post('/api/auth/logout', async (req, res) => {
  await auth.destroySession(req, res);
  res.json({ ok: true });
});

// ---------- member (self) ----------

app.get('/api/me', async (req, res) => {
  // Whether the site can send email (password resets etc.), for the login page.
  const emailEnabled = mailer.enabled();
  if (!req.user) return res.json({ user: null, emailEnabled });
  res.json({ user: { ...publicUser(req.user), canEditTimeline: await canEditTimeline(req.user) }, stats: await memberStats(req.user.id), emailEnabled });
});

app.post('/api/me/privacy', auth.requireRole('member'), async (req, res) => {
  await recordConsent(req.user.id, readConsent(req.body, req.user));
  res.json({ user: publicUser((await db.get('SELECT * FROM users WHERE id = ?', req.user.id))) });
});

// Right of access: everything the academy holds about the member, as a JSON file.
app.get('/api/me/export', auth.requireRole('member'), async (req, res) => {
  const u = (await db.get('SELECT * FROM users WHERE id = ?', req.user.id));
  const data = {
    exportedAt: new Date().toISOString(),
    account: { ...publicUser(u), privacyRequired: undefined },
    attendance: await memberAttendance(u.id, 100000),
    payments: await payments.forMember(u.id),
    privacyConsents: (await db.all('SELECT version, under_16 AS under16, guardian_name AS "guardianName", guardian_email AS "guardianEmail", accepted_at AS "acceptedAt" FROM privacy_consents WHERE user_id = ? ORDER BY id', u.id)),
    // Notes staff have written about them are their personal data too. (Messages
    // sent through the contact form aren't included: an email address alone
    // doesn't prove who sent them. Members can ask the academy for those.)
    staffNotes: u.notes || '',
  };
  res.setHeader('Content-Disposition', `attachment; filename="lab-my-data-${u.member_id}.json"`);
  res.setHeader('Cache-Control', 'no-store');
  res.type('application/json').send(JSON.stringify(data, null, 2));
});

// Deleting an account keeps its payment records (the academy's accounts need
// them), with the name and member ID copied onto them.
async function deleteAccount(userId) {
  await db.run(`UPDATE class_payments p SET payer_name = u.name, payer_member_id = u.member_id
                  FROM users u WHERE u.id = p.user_id AND p.user_id = ? AND p.status <> 'started'`, userId);
  await db.run("DELETE FROM class_payments WHERE user_id = ? AND status = 'started'", userId);
  await db.run('DELETE FROM users WHERE id = ?', userId);
}

// Right to erasure: members can delete their own account (password required).
app.post('/api/me/delete', auth.requireRole('member'), async (req, res) => {
  const row = (await db.get('SELECT password_hash, role FROM users WHERE id = ?', req.user.id));
  if (!(await auth.verifyPassword(req.body.password, row.password_hash))) throw new HttpError(400, 'Your password is incorrect.');
  if (row.role === 'admin' && (await db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1")).n <= 1) {
    throw new HttpError(400, 'You are the only admin. Make someone else an admin before deleting your account.');
  }
  await deleteAccount(req.user.id);
  await auth.destroySession(req, res);
  res.json({ ok: true });
});

// ----- two-step login setup (admins and teachers) -----

// Starts (or restarts) setting up: a new secret, shown as a QR code to scan.
app.post('/api/me/two-step/setup', auth.requireRole('instructor'), async (req, res) => {
  const user = await db.get('SELECT totp_enabled FROM users WHERE id = ?', req.user.id);
  if (user.totp_enabled) throw new HttpError(400, 'Two-step login is already set up.');
  const secret = twostep.newSecret();
  await db.run('UPDATE users SET totp_secret = ? WHERE id = ?', secret, req.user.id);
  res.json({ secret: secret.replace(/(.{4})/g, '$1 ').trim() });
});

app.get('/api/me/two-step/qr.svg', auth.requireRole('instructor'), async (req, res) => {
  const user = await db.get('SELECT totp_secret, totp_enabled, email, member_id FROM users WHERE id = ?', req.user.id);
  if (!user.totp_secret || user.totp_enabled) throw new HttpError(404, 'Nothing to set up.');
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-store');
  res.send(await qrSvg(twostep.setupUrl(user.totp_secret, user.email || user.member_id)));
});

// Confirms the app works by checking one code, then gives the backup codes (shown once).
app.post('/api/me/two-step/enable', auth.requireRole('instructor'), async (req, res) => {
  const user = await db.get('SELECT totp_secret, totp_enabled FROM users WHERE id = ?', req.user.id);
  if (user.totp_enabled) throw new HttpError(400, 'Two-step login is already set up.');
  if (!(await auth.allow(`two-step-setup:${req.user.id}`, 10, 15 * 60_000))) throw new HttpError(429, 'Too many tries. Please wait 15 minutes.');
  const counter = twostep.check(user.totp_secret, str(req.body.code, 10));
  if (counter === null) throw new HttpError(400, "That code didn't match. Check the app shows London Academy of Bhangra and try the newest code.");
  const backup = twostep.newBackupCodes();
  await db.run('UPDATE users SET totp_enabled = 1, totp_last = ?, totp_backup = ? WHERE id = ?', counter, backup.stored, req.user.id);
  res.json({ backupCodes: backup.codes, user: publicUser(await db.get('SELECT * FROM users WHERE id = ?', req.user.id)) });
});

app.get('/api/me/attendance', auth.requireRole('member'), async (req, res) => {
  res.json({ attendance: await memberAttendance(req.user.id), stats: await memberStats(req.user.id) });
});

app.get('/api/me/qr.svg', auth.requireRole('member'), async (req, res) => {
  if (req.user.under_16 && !req.user.under16_approved_at) throw new HttpError(403, 'Your pass will appear once a teacher has approved your account.');
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(await qrSvg(req.user.member_id));
});

app.patch('/api/me', auth.requireRole('member'), async (req, res) => {
  const name = str(req.body.name, 120);
  const phone = str(req.body.phone, 40);
  if (!name) throw new HttpError(400, 'Name cannot be empty.');
  const bio = str(req.body.bio, 1000);
  (await db.run('UPDATE users SET name = ?, phone = ?, bio = ? WHERE id = ?', name, phone, bio, req.user.id));
  res.json({ user: publicUser((await db.get('SELECT * FROM users WHERE id = ?', req.user.id))) });
});

app.post('/api/me/password', auth.requireRole('member'), async (req, res) => {
  const current = typeof req.body.current === 'string' ? req.body.current : '';
  const next = typeof req.body.next === 'string' ? req.body.next : '';
  const row = (await db.get('SELECT password_hash FROM users WHERE id = ?', req.user.id));
  if (!(await auth.verifyPassword(current, row.password_hash))) throw new HttpError(400, 'Your current password is incorrect.');
  const weak = auth.passwordProblem(next);
  if (weak) throw new HttpError(400, weak);
  if (next === current) throw new HttpError(400, 'Please choose a different password from your current one.');
  (await db.run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', await auth.hashPassword(next), req.user.id));
  await auth.destroyAllSessionsFor(req.user.id);
  await auth.createSession(res, req, req.user.id);
  res.json({ ok: true });
});

// ---------- member: paying for a class ----------

function payOnline() {
  const { pricing } = content.getContent();
  const link = safeHttpsUrl(pricing.payLink);
  return { enabled: Boolean(link), link, amount: pricing.payAmount || '', amountPence: payments.pence(pricing.payAmount) };
}

function safeHttpsUrl(url) {
  try {
    const u = new URL(String(url || '').trim());
    return u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
}

app.get('/api/me/payments', auth.requireRole('member'), async (req, res) => {
  const dates = payments.upcomingDates(content.getContent().timetable.classes);
  // A payment they started but haven't confirmed yet (e.g. they closed the page while in Monzo).
  const pending = await db.get(`SELECT id, class_date AS date, reference FROM class_payments WHERE user_id = ? AND status = 'started' AND class_date >= ? ORDER BY created_at DESC LIMIT 1`, req.user.id, payments.londonToday());
  res.json({ payOnline: payOnline(), dates, payments: await payments.forMember(req.user.id), pending: pending || null });
});

// Starting a payment for a class date: records it and gives the Monzo reference.
app.post('/api/me/payments', auth.requireRole('member'), async (req, res) => {
  const pay = payOnline();
  if (!pay.enabled) throw new HttpError(400, 'Online payment is not available at the moment. Please pay at the class.');
  const date = str(req.body.date, 10);
  if (!payments.upcomingDates(content.getContent().timetable.classes).includes(date)) throw new HttpError(400, 'Please choose one of the upcoming class dates.');
  const existing = await payments.find(req.user.id, date);
  if (existing?.status === 'not_received') throw new HttpError(409, "We couldn't find your payment for that class in Monzo. Please speak to a teacher, or pay at the door.");
  if (existing && existing.status !== 'started') throw new HttpError(409, 'You have already paid for that class.');
  const ref = payments.reference(req.user, date);
  await db.run(
    `INSERT INTO class_payments (user_id, class_date, method, status, amount_pence, reference) VALUES (?, ?, 'online', 'started', ?, ?)
     ON CONFLICT (user_id, class_date) DO UPDATE SET method = 'online', status = 'started', amount_pence = EXCLUDED.amount_pence,
       reference = EXCLUDED.reference, claimed_at = NULL, checked_by = NULL, checked_at = NULL`,
    req.user.id, date, pay.amountPence, ref
  );
  res.json({ payment: await payments.find(req.user.id, date), link: pay.link });
});

// "Yes, I've paid": the class now shows as paid in their account and on the teachers' list.
app.post('/api/me/payments/:id/confirm', auth.requireRole('member'), async (req, res) => {
  const r = await db.run(`UPDATE class_payments SET status = 'claimed', claimed_at = ${db.NOW} WHERE id = ? AND user_id = ? AND status = 'started'`, Number(req.params.id), req.user.id);
  if (!r.changes) throw new HttpError(404, 'That payment was not found.');
  res.json({ payments: await payments.forMember(req.user.id) });
});

// "No, not yet": forget the unfinished payment.
app.delete('/api/me/payments/:id', auth.requireRole('member'), async (req, res) => {
  await db.run("DELETE FROM class_payments WHERE id = ? AND user_id = ? AND status = 'started'", Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

// ---------- staff: teachers (role 'instructor') & admins ----------

const staff = express.Router();
staff.use(auth.requireRole('instructor'));

staff.get('/stats', async (_req, res) => {
  const { date } = todayInfo();
  res.json({
    members: (await db.get("SELECT COUNT(*) AS n FROM users WHERE active = 1")).n,
    todaySessions: (await db.get('SELECT COUNT(*) AS n FROM class_sessions WHERE date = ?', date)).n,
    todayAttendance: (await db.get('SELECT COUNT(*) AS n FROM attendance a JOIN class_sessions s ON s.id = a.session_id WHERE s.date = ?', date)).n,
    last30Attendance: (await db.get("SELECT COUNT(*) AS n FROM attendance a JOIN class_sessions s ON s.id = a.session_id WHERE s.date >= to_char(?::date - 30, 'YYYY-MM-DD')", date)).n,
    unreadMessages: (await db.get('SELECT COUNT(*) AS n FROM messages WHERE is_read = 0')).n,
    toApprove: (await db.get('SELECT COUNT(*) AS n FROM users WHERE active = 1 AND under_16 = 1 AND under16_approved_at IS NULL')).n,
    // Sessions from the last 14 days that still need a debrief.
    debriefsDue: (await db.get(`SELECT COUNT(*) AS n FROM class_sessions s WHERE s.date BETWEEN to_char(?::date - 14, 'YYYY-MM-DD') AND ?
           AND NOT EXISTS (SELECT 1 FROM class_debriefs d WHERE d.session_id = s.id)
           AND EXISTS (SELECT 1 FROM attendance a WHERE a.session_id = s.id)`, date, date)).n,
  });
});

staff.get('/today', async (_req, res) => {
  const today = todayInfo();
  const classes = content
    .getContent()
    .timetable.classes.filter((c) => String(c.day || '').toLowerCase() === today.weekday.toLowerCase());
  const sessions = (await db.all(`SELECT s.*, (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) AS count
         FROM class_sessions s WHERE s.date = ? ORDER BY s.start_time`, today.date));
  res.json({ ...today, classes, sessions });
});

staff.get('/sessions', async (req, res) => {
  const from = isDate(req.query.from || '') ? req.query.from : '0000-00-00';
  const to = isDate(req.query.to || '') ? req.query.to : '9999-12-31';
  const sessions = (await db.all(`SELECT s.*, (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) AS count
         FROM class_sessions s WHERE s.date BETWEEN ? AND ?
        ORDER BY s.date DESC, s.start_time DESC LIMIT 500`, from, to));
  res.json({ sessions });
});

staff.post('/sessions', async (req, res) => {
  const title = str(req.body.title, 120);
  const date = str(req.body.date, 10) || todayInfo().date;
  const start = str(req.body.start_time, 5);
  const end = str(req.body.end_time, 5);
  const location = str(req.body.location, 200);
  if (!title) throw new HttpError(400, 'Please give the session a name.');
  if (!isDate(date) || !isTime(start) || !isTime(end)) throw new HttpError(400, 'Invalid date or time.');
  (await db.run(`INSERT INTO class_sessions (title, date, start_time, end_time, location, created_by)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (title, date, start_time) DO NOTHING`, title, date, start, end, location, req.user.id));
  const session = (await db.get('SELECT * FROM class_sessions WHERE title = ? AND date = ? AND start_time = ?', title, date, start));
  res.json({ session });
});

async function loadSession(id) {
  const session = (await db.get('SELECT * FROM class_sessions WHERE id = ?', Number(id)));
  if (!session) throw new HttpError(404, 'Session not found.');
  return session;
}

async function sessionAttendees(sessionId) {
  return (await db.all(`SELECT u.id, u.member_id AS "memberId", u.name, a.method, a.created_at AS "scannedAt", sb.name AS "scannedBy",
              u.under_16 = 1 AS "under16", u.guardian_name AS "guardianName", u.guardian_phone AS "guardianPhone",
              (u.under_16 = 1 AND u.under16_approved_at IS NULL) AS "needsApproval"
         FROM attendance a JOIN users u ON u.id = a.user_id
         LEFT JOIN users sb ON sb.id = a.scanned_by
        WHERE a.session_id = ? ORDER BY a.created_at DESC`, sessionId));
}

staff.get('/sessions/:id', async (req, res) => {
  const session = await loadSession(req.params.id);
  res.json({ session, attendees: await sessionAttendees(session.id) });
});

staff.patch('/sessions/:id', async (req, res) => {
  const session = await loadSession(req.params.id);
  const title = str(req.body.title ?? session.title, 120);
  const date = str(req.body.date ?? session.date, 10);
  const start = str(req.body.start_time ?? session.start_time, 5);
  const end = str(req.body.end_time ?? session.end_time, 5);
  const location = str(req.body.location ?? session.location, 200);
  if (!title || !isDate(date) || !isTime(start) || !isTime(end)) throw new HttpError(400, 'Invalid session details.');
  try {
    (await db.run('UPDATE class_sessions SET title = ?, date = ?, start_time = ?, end_time = ?, location = ? WHERE id = ?', title, date, start, end, location, session.id));
  } catch {
    throw new HttpError(409, 'Another session already has that name, date and start time.');
  }
  res.json({ session: await loadSession(session.id) });
});

staff.delete('/sessions/:id', auth.requireRole('admin'), async (req, res) => {
  const session = await loadSession(req.params.id);
  (await db.run('DELETE FROM class_sessions WHERE id = ?', session.id));
  res.json({ ok: true });
});

// Record attendance from a scanned QR code, a typed member ID, or a user id (manual pick).
staff.post('/sessions/:id/attendance', async (req, res) => {
  const session = await loadSession(req.params.id);
  let member = null;
  let method = 'qr';
  if (req.body.userId) {
    member = (await db.get('SELECT * FROM users WHERE id = ?', Number(req.body.userId)));
    method = 'manual';
  } else {
    const memberId = extractMemberId(str(req.body.code, 300));
    if (!memberId) throw new HttpError(400, 'That code is not a London Academy of Bhangra member ID.');
    member = (await db.get('SELECT * FROM users WHERE member_id = ?', memberId));
    if (req.body.method === 'manual') method = 'manual';
  }
  if (!member) throw new HttpError(404, 'No member found with that ID.');
  if (!member.active) throw new HttpError(403, `${member.name}'s membership is inactive.`);
  const info = (await db.run('INSERT INTO attendance (session_id, user_id, scanned_by, method) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING', session.id, member.id, req.user.id, method));
  res.json({
    status: info.changes ? 'recorded' : 'already',
    member: {
      id: member.id, memberId: member.member_id, name: member.name,
      // Under-16s: the parent or guardian stays on site, and their number is to hand in an emergency.
      under16: Boolean(member.under_16), needsApproval: Boolean(member.under_16 && !member.under16_approved_at),
      guardianName: member.under_16 ? member.guardian_name || '' : '', guardianPhone: member.under_16 ? member.guardian_phone || '' : '',
    },
    stats: await memberStats(member.id),
    payment: (await payments.find(member.id, session.date)) || null,
    date: session.date,
    count: (await db.get('SELECT COUNT(*) AS n FROM attendance WHERE session_id = ?', session.id)).n,
  });
});

staff.delete('/sessions/:id/attendance/:userId', async (req, res) => {
  const session = await loadSession(req.params.id);
  (await db.run('DELETE FROM attendance WHERE session_id = ? AND user_id = ?', session.id, Number(req.params.userId)));
  res.json({ ok: true });
});

staff.get('/sessions/:id/export.csv', async (req, res) => {
  const session = await loadSession(req.params.id);
  const rows = (await sessionAttendees(session.id)).map((a) => [a.memberId, a.name, a.method, a.scannedAt, a.scannedBy || '']);
  sendCsv(res, `attendance-${session.date}-${session.id}.csv`, ['Member ID', 'Name', 'Method', 'Recorded at (UTC)', 'Recorded by'], rows);
});

staff.get('/attendance.csv', async (req, res) => {
  const from = isDate(req.query.from || '') ? req.query.from : '0000-00-00';
  const to = isDate(req.query.to || '') ? req.query.to : '9999-12-31';
  const rows = (await db.all(`SELECT s.date, s.start_time, s.title, u.member_id, u.name, a.method, a.created_at
         FROM attendance a JOIN class_sessions s ON s.id = a.session_id JOIN users u ON u.id = a.user_id
        WHERE s.date BETWEEN ? AND ? ORDER BY s.date, s.start_time, u.name`, from, to))
    .map((r) => [r.date, r.start_time, r.title, r.member_id, r.name, r.method, r.created_at]);
  sendCsv(res, 'attendance.csv', ['Date', 'Start', 'Session', 'Member ID', 'Name', 'Method', 'Recorded at (UTC)'], rows);
});

// What staff see of a member. Admins see everything; teachers see what they need
// at class: name, member ID, role and attendance, plus, for under-16s, the
// parent or guardian's name and phone for emergencies. Not emails, phone
// numbers, staff notes or bios.
function staffView(row, viewer) {
  const full = publicUser(row, { includeNotes: true });
  if (viewer.role === 'admin') return full;
  return {
    id: full.id, memberId: full.memberId, name: full.name, role: full.role, active: full.active, createdAt: full.createdAt,
    under16: full.under16, needsApproval: full.needsApproval,
    guardianName: full.under16 ? full.guardianName : '', guardianPhone: full.under16 ? full.guardianPhone : '',
    privacyVersion: full.privacyVersion, privacyAcceptedAt: full.privacyAcceptedAt, privacyRequired: full.privacyRequired,
    email: '', phone: '', bio: '', notes: '', guardianEmail: '',
  };
}

staff.get('/members', async (req, res) => {
  const q = str(req.query.q, 100);
  const like = `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
  // Teachers search by name or member ID only.
  const byContact = req.user.role === 'admin' ? like : null;
  const rows = (await db.all(`SELECT u.*, (SELECT COUNT(*) FROM attendance a WHERE a.user_id = u.id) AS attended,
              (SELECT MAX(s.date) FROM attendance a JOIN class_sessions s ON s.id = a.session_id WHERE a.user_id = u.id) AS last_attended
         FROM users u
        WHERE (? = '' OR u.name ILIKE ? ESCAPE '\\' OR u.member_id ILIKE ? ESCAPE '\\' OR u.email ILIKE ? ESCAPE '\\' OR u.phone ILIKE ? ESCAPE '\\')
        ORDER BY u.active DESC, lower(u.name) LIMIT 1000`, q, like, like, byContact, byContact));
  res.json({ members: rows.map((r) => ({ ...staffView(r, req.user), attended: r.attended, lastAttended: r.last_attended })) });
});

staff.post('/members', async (req, res) => {
  const name = str(req.body.name, 120);
  const email = str(req.body.email, 200);
  const phone = str(req.body.phone, 40);
  const notes = str(req.body.notes, 2000);
  const bio = str(req.body.bio, 1000);
  const under16 = req.body.under16 === true;
  const guardianName = under16 ? str(req.body.guardianName, 120) : '';
  const guardianEmail = under16 ? str(req.body.guardianEmail, 200) : '';
  const guardianPhone = under16 ? str(req.body.guardianPhone, 40) : '';
  if (guardianEmail && !EMAIL_RE.test(guardianEmail)) throw new HttpError(400, "The parent or guardian's email address does not look right.");
  let role = ['member', 'instructor', 'admin'].includes(req.body.role) ? req.body.role : 'member';
  if (req.user.role !== 'admin') role = 'member';
  if (!name) throw new HttpError(400, 'Please enter a name.');
  if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'That email address does not look right.');
  if (email && (await db.get('SELECT 1 FROM users WHERE lower(email) = lower(?)', email))) throw new HttpError(409, 'A member with that email already exists.');
  const password = str(req.body.password, 200) || auth.generatePassword();
  const weak = auth.passwordProblem(password);
  if (weak) throw new HttpError(400, weak);
  const memberId = await auth.generateMemberId();
  const info = (await db.run(`INSERT INTO users (member_id, name, email, phone, password_hash, role, notes, bio, under_16, guardian_name, guardian_email, guardian_phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, memberId, name, email || null, phone, await auth.hashPassword(password), role, notes, bio, under16 ? 1 : 0, guardianName || null, guardianEmail || null, guardianPhone || null));
  // Staff made the account, so its email address doesn't need checking.
  await db.run(`UPDATE users SET email_verified_at = ${db.NOW} WHERE id = ?`, info.rows[0].id);
  // Staff entered the parent's details themselves, so the account is approved by them.
  if (under16) await db.run(`UPDATE users SET under16_approved_by = ?, under16_approved_at = ${db.NOW} WHERE id = ?`, req.user.id, info.rows[0].id);
  const user = await db.get('SELECT * FROM users WHERE id = ?', info.rows[0].id);
  res.status(201).json({ member: publicUser(user, { includeNotes: true }), password });
});

async function loadMember(id) {
  const member = (await db.get('SELECT * FROM users WHERE id = ?', Number(id)));
  if (!member) throw new HttpError(404, 'Member not found.');
  return member;
}

staff.get('/members/:id', async (req, res) => {
  const member = await loadMember(req.params.id);
  res.json({ member: { ...staffView(member, req.user), canEditTimeline: await canEditTimeline(member) }, stats: await memberStats(member.id), attendance: await memberAttendance(member.id) });
});

// A teacher or admin approves an under-16's account once they've checked the parent's details.
staff.post('/members/:id/approve', async (req, res) => {
  const member = await loadMember(req.params.id);
  if (!member.under_16) throw new HttpError(400, 'Only under-16 accounts need approving.');
  if (!member.guardian_name || !member.guardian_phone) throw new HttpError(400, "Add the parent or guardian's name and phone number before approving.");
  await db.run(`UPDATE users SET under16_approved_by = ?, under16_approved_at = ${db.NOW} WHERE id = ? AND under16_approved_at IS NULL`, req.user.id, member.id);
  res.json({ member: staffView(await loadMember(member.id), req.user) });
});

staff.get('/members/:id/qr.svg', async (req, res) => {
  const member = await loadMember(req.params.id);
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(await qrSvg(member.member_id));
});

// ----- class debriefs -----

// "£123.45", "123.4" or "123" -> pence. Returns null for anything else.
function parsePounds(value) {
  const m = String(value ?? '').trim().replace(/,/g, '').match(/^£?\s*(\d{1,7})(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] || '0').padEnd(2, '0'));
}

function publicDebrief(d) {
  return {
    id: d.id,
    sessionId: d.session_id,
    classTitle: d.class_title,
    classDate: d.class_date,
    ranBy: d.ran_by,
    attendeeCount: d.attendee_count,
    pouchBalancePence: d.pouch_balance_pence,
    feedback: d.feedback,
    submittedBy: d.submitted_by,
    submittedByName: d.submitted_by_name || '',
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

const DEBRIEF_SELECT = `SELECT d.*, u.name AS submitted_by_name FROM class_debriefs d LEFT JOIN users u ON u.id = d.submitted_by`;

async function loadDebrief(id) {
  const d = (await db.get(`${DEBRIEF_SELECT} WHERE d.id = ?`, Number(id)));
  if (!d) throw new HttpError(404, 'Debrief not found.');
  return d;
}

function readDebrief(body) {
  const ranBy = (Array.isArray(body.ranBy) ? body.ranBy : [body.ranBy])
    .map((n) => str(n, 120))
    .filter(Boolean);
  const classDate = str(body.classDate, 10);
  const classTitle = str(body.classTitle, 120);
  const attendeeCount = Number(body.attendeeCount);
  const pence = parsePounds(body.pouchBalance);
  const feedback = str(body.feedback, 5000);
  if (!ranBy.length) throw new HttpError(400, 'Please say who ran the class.');
  if (!isDate(classDate)) throw new HttpError(400, 'Please enter the date of the class.');
  if (!Number.isInteger(attendeeCount) || attendeeCount < 0 || attendeeCount > 2000) throw new HttpError(400, 'Please enter the number of attendees as a whole number.');
  if (pence === null) throw new HttpError(400, 'Please enter the LAB pouch balance in pounds, e.g. 125.50');
  return { ranBy: [...new Set(ranBy)].join(', ').slice(0, 500), classDate, classTitle, attendeeCount, pence, feedback };
}

// Who has paid for a class date: online (and whether it's been checked in Monzo) and at the door.
staff.get('/payments', async (req, res) => {
  const date = isDate(req.query.date || '') ? req.query.date : todayInfo().date;
  const dates = payments.upcomingDates(content.getContent().timetable.classes);
  res.json({ date, dates, payOnline: payOnline(), payments: await payments.forDate(date) });
});

// Check an online payment against Monzo: admins only, as only they can see the Monzo account.
staff.patch('/payments/:id', auth.requireRole('admin'), async (req, res) => {
  const status = req.body.status;
  if (!['received', 'not_received', 'claimed'].includes(status)) throw new HttpError(400, 'Unknown payment status.');
  const r = await db.run(
    `UPDATE class_payments SET status = ?, checked_by = ?, checked_at = ${db.NOW} WHERE id = ? AND method = 'online' AND status <> 'started'`,
    status, status === 'claimed' ? null : req.user.id, Number(req.params.id)
  );
  if (!r.changes) throw new HttpError(404, 'That payment was not found.');
  res.json({ ok: true });
});

// Cash or card at the door. Replaces an online payment that was not received.
staff.post('/payments', async (req, res) => {
  const date = str(req.body.date, 10);
  const method = req.body.method;
  if (!isDate(date) || !['cash', 'card'].includes(method)) throw new HttpError(400, 'Invalid payment.');
  const member = await db.get('SELECT id FROM users WHERE id = ?', Number(req.body.userId));
  if (!member) throw new HttpError(404, 'Member not found.');
  await db.run(
    `INSERT INTO class_payments (user_id, class_date, method, status, amount_pence, checked_by, checked_at) VALUES (?, ?, ?, 'received', ?, ?, ${db.NOW})
     ON CONFLICT (user_id, class_date) DO UPDATE SET method = EXCLUDED.method, status = 'received', amount_pence = EXCLUDED.amount_pence,
       reference = '', checked_by = EXCLUDED.checked_by, checked_at = EXCLUDED.checked_at`,
    member.id, date, method, payOnline().amountPence || payments.pence(content.getContent().pricing.plans?.[0]?.price), req.user.id
  );
  res.json({ payment: await payments.find(member.id, date) });
});

// Undo a door payment recorded by mistake. Admins can also remove an online claim entirely.
staff.delete('/payments/:id', async (req, res) => {
  const methods = req.user.role === 'admin' ? "('cash', 'card', 'online')" : "('cash', 'card')";
  await db.run(`DELETE FROM class_payments WHERE id = ? AND method IN ${methods}`, Number(req.params.id));
  res.json({ ok: true });
});

staff.get('/teachers', async (_req, res) => {
  const teachers = (await db.all("SELECT id, name FROM users WHERE role IN ('instructor', 'admin') AND active = 1 ORDER BY lower(name)"));
  res.json({ teachers });
});

// Everything the form needs: session details, scanned head count, teachers,
// the last recorded pouch balance, and any debrief already written for it.
staff.get('/debriefs/prefill', async (req, res) => {
  const session = req.query.session ? await loadSession(req.query.session) : null;
  const existing = session ? (await db.get(`${DEBRIEF_SELECT} WHERE d.session_id = ?`, session.id)) : null;
  const last = (await db.get('SELECT pouch_balance_pence, class_date, class_title FROM class_debriefs WHERE pouch_balance_pence IS NOT NULL ORDER BY class_date DESC, id DESC LIMIT 1'));
  res.json({
    session,
    scannedCount: session ? (await db.get('SELECT COUNT(*) AS n FROM attendance WHERE session_id = ?', session.id)).n : null,
    existing: existing ? publicDebrief(existing) : null,
    lastBalance: last ? { pence: last.pouch_balance_pence, date: last.class_date, title: last.class_title } : null,
    today: todayInfo().date,
  });
});

staff.get('/debriefs', async (req, res) => {
  const from = isDate(req.query.from || '') ? req.query.from : '0000-00-00';
  const to = isDate(req.query.to || '') ? req.query.to : '9999-12-31';
  const rows = (await db.all(`${DEBRIEF_SELECT} WHERE d.class_date BETWEEN ? AND ? ORDER BY d.class_date DESC, d.id DESC LIMIT 500`, from, to));
  res.json({ debriefs: rows.map(publicDebrief) });
});

staff.get('/debriefs.csv', async (req, res) => {
  const from = isDate(req.query.from || '') ? req.query.from : '0000-00-00';
  const to = isDate(req.query.to || '') ? req.query.to : '9999-12-31';
  const rows = (await db.all(`${DEBRIEF_SELECT} WHERE d.class_date BETWEEN ? AND ? ORDER BY d.class_date, d.id`, from, to))
    .map((d) => [
      d.class_date, d.class_title, d.ran_by, d.attendee_count,
      d.pouch_balance_pence === null ? '' : (d.pouch_balance_pence / 100).toFixed(2),
      d.feedback, d.submitted_by_name || '', d.created_at,
    ]);
  sendCsv(res, 'class-debriefs.csv', ['Date', 'Class', 'Ran by', 'Attendees', 'LAB pouch balance (£)', 'Feedback', 'Submitted by', 'Submitted at (UTC)'], rows);
});

staff.get('/debriefs/:id', async (req, res) => {
  res.json({ debrief: publicDebrief(await loadDebrief(req.params.id)) });
});

staff.post('/debriefs', async (req, res) => {
  const d = readDebrief(req.body);
  const session = req.body.sessionId ? await loadSession(req.body.sessionId) : null;
  if (session) {
    const existing = (await db.get('SELECT id FROM class_debriefs WHERE session_id = ?', session.id));
    if (existing) throw new HttpError(409, 'A debrief has already been written for this class. Open it to make changes.');
  }
  const info = (await db.run(`INSERT INTO class_debriefs (session_id, class_title, class_date, ran_by, attendee_count, pouch_balance_pence, feedback, submitted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, session ? session.id : null, d.classTitle || (session ? session.title : ''), d.classDate, d.ranBy, d.attendeeCount, d.pence, d.feedback, req.user.id));
  res.status(201).json({ debrief: publicDebrief(await loadDebrief(info.rows[0].id)) });
});

// Teachers can correct their own debriefs; admins can change any.
staff.patch('/debriefs/:id', async (req, res) => {
  const existing = await loadDebrief(req.params.id);
  if (req.user.role !== 'admin' && existing.submitted_by !== req.user.id) {
    throw new HttpError(403, 'Only the teacher who wrote this debrief, or an admin, can change it.');
  }
  const d = readDebrief(req.body);
  (await db.run(`UPDATE class_debriefs SET class_title = ?, class_date = ?, ran_by = ?, attendee_count = ?, pouch_balance_pence = ?,
            feedback = ?, updated_at = ${db.NOW} WHERE id = ?`, d.classTitle || existing.class_title, d.classDate, d.ranBy, d.attendeeCount, d.pence, d.feedback, existing.id));
  res.json({ debrief: publicDebrief(await loadDebrief(existing.id)) });
});

staff.delete('/debriefs/:id', auth.requireRole('admin'), async (req, res) => {
  const d = await loadDebrief(req.params.id);
  (await db.run('DELETE FROM class_debriefs WHERE id = ?', d.id));
  res.json({ ok: true });
});

app.use('/api/staff', staff);

// ---------- admin only ----------

const admin = express.Router();
admin.use(auth.requireRole('admin'));

admin.patch('/members/:id', async (req, res) => {
  const member = await loadMember(req.params.id);
  const name = req.body.name !== undefined ? str(req.body.name, 120) : member.name;
  const email = req.body.email !== undefined ? str(req.body.email, 200) : member.email || '';
  const phone = req.body.phone !== undefined ? str(req.body.phone, 40) : member.phone || '';
  const notes = req.body.notes !== undefined ? str(req.body.notes, 2000) : member.notes || '';
  const bio = req.body.bio !== undefined ? str(req.body.bio, 1000) : member.bio || '';
  const under16 = req.body.under16 !== undefined ? (req.body.under16 ? 1 : 0) : member.under_16;
  const guardianName = req.body.guardianName !== undefined ? str(req.body.guardianName, 120) : member.guardian_name || '';
  const guardianEmail = req.body.guardianEmail !== undefined ? str(req.body.guardianEmail, 200) : member.guardian_email || '';
  const guardianPhone = req.body.guardianPhone !== undefined ? str(req.body.guardianPhone, 40) : member.guardian_phone || '';
  if (guardianEmail && !EMAIL_RE.test(guardianEmail)) throw new HttpError(400, "The parent or guardian's email address does not look right.");
  const role = req.body.role !== undefined ? req.body.role : member.role;
  const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : member.active;
  if (!name) throw new HttpError(400, 'Name cannot be empty.');
  if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'That email address does not look right.');
  if (!['member', 'instructor', 'admin'].includes(role)) throw new HttpError(400, 'Invalid role.');
  if (member.id === req.user.id && (role !== 'admin' || !active)) throw new HttpError(400, 'You cannot remove your own admin access.');
  if (email && (await db.get('SELECT 1 FROM users WHERE lower(email) = lower(?) AND id != ?', email, member.id))) throw new HttpError(409, 'Another member already uses that email.');
  (await db.run('UPDATE users SET name = ?, email = ?, phone = ?, notes = ?, bio = ?, role = ?, active = ? WHERE id = ?', name, email || null, phone, notes, bio, role, active, member.id));
  (await db.run('UPDATE users SET under_16 = ?, guardian_name = ?, guardian_email = ?, guardian_phone = ? WHERE id = ?', under16, guardianName || null, guardianEmail || null, guardianPhone || null, member.id));
  // An admin marking someone under 16 approves the account; taking it off clears the approval.
  if (under16 && !member.under_16) await db.run(`UPDATE users SET under16_approved_by = ?, under16_approved_at = ${db.NOW} WHERE id = ?`, req.user.id, member.id);
  if (!under16) await db.run('UPDATE users SET under16_approved_by = NULL, under16_approved_at = NULL WHERE id = ?', member.id);
  if (!active) await auth.destroyAllSessionsFor(member.id);
  // Only teachers keep the Our journey permission; it goes if they become a member (or an admin, who has it anyway).
  const editors = await timelineEditors();
  const allowed = role === 'instructor' && (req.body.canEditTimeline !== undefined ? req.body.canEditTimeline === true : editors.has(member.id));
  if (allowed !== editors.has(member.id)) {
    if (allowed) editors.add(member.id);
    else editors.delete(member.id);
    await setSetting('timeline_editors', [...editors]);
  }
  const saved = await loadMember(member.id);
  res.json({ member: { ...publicUser(saved, { includeNotes: true }), canEditTimeline: await canEditTimeline(saved) } });
});

admin.post('/members/:id/reset-password', async (req, res) => {
  const member = await loadMember(req.params.id);
  const password = str(req.body.password, 200) || auth.generatePassword();
  const weak = auth.passwordProblem(password);
  if (weak) throw new HttpError(400, weak);
  (await db.run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', await auth.hashPassword(password), member.id));
  await auth.destroyAllSessionsFor(member.id);
  res.json({ password });
});

// For a teacher (or admin) who has lost their phone and backup codes: they set it up again at next login.
admin.post('/members/:id/reset-two-step', async (req, res) => {
  const member = await loadMember(req.params.id);
  await db.run('UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_last = -1, totp_backup = NULL WHERE id = ?', member.id);
  await auth.destroyAllSessionsFor(member.id);
  res.json({ ok: true });
});

admin.post('/members/:id/new-member-id', async (req, res) => {
  const member = await loadMember(req.params.id);
  const memberId = await auth.generateMemberId();
  (await db.run('UPDATE users SET member_id = ? WHERE id = ?', memberId, member.id));
  res.json({ member: publicUser(await loadMember(member.id), { includeNotes: true }) });
});

admin.delete('/members/:id', async (req, res) => {
  const member = await loadMember(req.params.id);
  if (member.id === req.user.id) throw new HttpError(400, 'You cannot delete your own account.');
  await deleteAccount(member.id);
  res.json({ ok: true });
});

// Everything in a backup, parents before the tables that refer to them.
const BACKUP_TABLES = ['users', 'settings', 'class_sessions', 'attendance', 'class_debriefs', 'privacy_consents', 'messages', 'class_payments', 'page_views', 'site_events'];

// Puts a backup back, replacing everything (all in one go: if anything fails,
// nothing changes). Everyone is logged out, as the logins aren't in the backup.
admin.post('/restore', async (req, res) => {
  const backup = req.body;
  if (backup?.app !== 'london-academy-of-bhangra' || !backup.tables || typeof backup.tables !== 'object') throw new HttpError(400, "That file isn't a backup from this website.");
  const users = backup.tables.users;
  if (!Array.isArray(users) || !users.some((u) => u.role === 'admin' && Number(u.active) === 1)) throw new HttpError(400, 'That backup has no active admin, so restoring it would lock everyone out.');
  if (req.body.confirm !== 'RESTORE') throw new HttpError(400, 'Type RESTORE to confirm.');
  const counts = {};
  await transaction(async (tx) => {
    await tx.run(`TRUNCATE ${BACKUP_TABLES.join(', ')}, auth_sessions, login_challenges CASCADE`);
    for (const table of BACKUP_TABLES) {
      const rows = Array.isArray(backup.tables[table]) ? backup.tables[table] : [];
      const cols = new Set((await tx.all('SELECT column_name FROM information_schema.columns WHERE table_name = ?', table)).map((c) => c.column_name));
      for (const row of rows) {
        const keys = Object.keys(row || {}).filter((k) => cols.has(k));
        if (!keys.length) continue;
        await tx.run(`INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...keys.map((k) => row[k]));
      }
      if (cols.has('id')) await tx.run(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`);
      counts[table] = rows.length;
    }
  });
  await content.init();
  res.clearCookie('lab_session', { path: '/' });
  res.json({ ok: true, counts });
});

// Full backup of everything in the database (Supabase's free plan has no
// restorable backups). Contains personal data and password hashes: keep it safe.
admin.get('/backup.json', async (_req, res) => {
  const backup = { app: 'london-academy-of-bhangra', createdAt: new Date().toISOString(), tables: {} };
  for (const t of BACKUP_TABLES) backup.tables[t] = await db.all(`SELECT * FROM ${t} ORDER BY 1`);
  res.setHeader('Content-Disposition', `attachment; filename="lab-backup-${todayInfo().date}.json"`);
  res.setHeader('Cache-Control', 'no-store');
  res.type('application/json').send(JSON.stringify(backup));
});

admin.put('/content/:section', async (req, res) => {
  const value = req.body?.value;
  if (!content.SECTIONS.includes(req.params.section) || value === undefined || value === null || typeof value !== 'object') {
    throw new HttpError(400, 'Invalid content.');
  }
  res.json(await content.saveSection(req.params.section, value));
});

// Replaces all content at once (used by Admin → Advanced to restore a backup).
admin.put('/content', async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid content.');
  res.json(await content.saveContent(body));
});

admin.post('/content/reset', async (req, res) => {
  try {
    res.json(await content.resetSection(str(req.body.section, 40)));
  } catch {
    throw new HttpError(400, 'Unknown section.');
  }
});

const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, Boolean(IMAGE_TYPES[file.mimetype])),
});

async function saveUpload(req, res) {
  if (!req.file) throw new HttpError(400, 'Please choose a JPG, PNG, WebP or GIF image (max 10 MB).');
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${IMAGE_TYPES[req.file.mimetype]}`;
  const url = await storage.save(name, req.file.buffer, req.file.mimetype);
  res.status(201).json({ url });
}

admin.post('/upload', upload.single('file'), saveUpload);

// Teachers allowed to edit Our journey can save that page and add photos to it, and nothing more.
async function requireTimelineEditor(req, _res, next) {
  if (!(await canEditTimeline(req.user))) return next(new HttpError(403, 'You do not have permission to edit Our journey.'));
  next();
}

staff.put('/content/timeline', requireTimelineEditor, async (req, res) => {
  const value = req.body?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Invalid content.');
  res.json(await content.saveSection('timeline', value));
});

staff.post('/upload', requireTimelineEditor, upload.single('file'), saveUpload);

admin.get('/uploads', async (_req, res) => {
  res.json({ files: await storage.list() });
});

admin.delete('/uploads/:name', async (req, res) => {
  await storage.remove(req.params.name);
  res.json({ ok: true });
});

admin.get('/instagram', async (_req, res) => res.json(await instagram.status()));

admin.post('/instagram', async (req, res) => {
  const token = str(req.body.accessToken, 1000);
  const beholdUrl = str(req.body.beholdUrl, 300);
  if (beholdUrl) {
    try {
      await instagram.setBeholdUrl(beholdUrl);
    } catch (err) {
      throw new HttpError(400, `Could not load that feed: ${err.message}`);
    }
    return res.json(await instagram.status());
  }
  if (!token) throw new HttpError(400, 'Please paste a Behold feed link or an access token.');
  try {
    await instagram.setToken(token);
  } catch (err) {
    throw new HttpError(400, `Instagram rejected that token: ${err.message}`);
  }
  res.json(await instagram.status());
});

admin.post('/instagram/refresh', async (_req, res) => {
  const feed = await instagram.getFeed({ force: true });
  res.json({ ...(await instagram.status()), postCount: feed.posts.length });
});

admin.delete('/instagram', async (_req, res) => {
  await instagram.clearToken();
  res.json(await instagram.status());
});

admin.get('/messages', async (_req, res) => {
  res.json({ messages: (await db.all('SELECT * FROM messages ORDER BY created_at DESC LIMIT 500')) });
});

admin.patch('/messages/:id', async (req, res) => {
  (await db.run('UPDATE messages SET is_read = ? WHERE id = ?', req.body.read ? 1 : 0, Number(req.params.id)));
  res.json({ ok: true });
});

admin.delete('/messages/:id', async (req, res) => {
  (await db.run('DELETE FROM messages WHERE id = ?', Number(req.params.id)));
  res.json({ ok: true });
});

admin.get('/visitors', async (req, res) => {
  res.json(await visitors.summary(Number(req.query.range)));
});

admin.get('/visitors.csv', async (req, res) => {
  const s = await visitors.summary(Number(req.query.range));
  sendCsv(res, `visitors-${s.from}-to-${s.to}.csv`, [s.byMonth ? 'Month' : 'Date', 'People', 'Pages viewed'], s.series.map((r) => [r.k, r.people, r.views]));
});

app.use('/api/admin', admin);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// ---------- static files & SPA ----------

app.use('/uploads', express.static(storage.UPLOAD_DIR, { maxAge: '30d', immutable: true }));
// Self-hosted typefaces for the home page (SIL Open Font License).
for (const face of ['archivo', 'inter']) {
  app.use(`/fonts/${face}`, express.static(path.join(path.dirname(require.resolve(`@fontsource-variable/${face}/package.json`)), 'files'), { maxAge: '365d', immutable: true }));
}
app.get('/vendor/html5-qrcode.min.js', async (_req, res) => {
  res.sendFile(require.resolve('html5-qrcode/html5-qrcode.min.js'), { maxAge: '7d' });
});
// Scripts, styles and the manifest are revalidated on every load (cheap 304s via ETag),
// so after an update browsers never mix new and old app files. Images cache for a day.
app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    setHeaders: (res, file) => {
      res.setHeader('Cache-Control', /\.(png|jpe?g|webp|gif|svg|ico)$/i.test(file) ? 'public, max-age=86400' : 'no-cache');
    },
  })
);

const indexTemplate = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The site's own address, for links that must be absolute (sitemap, link previews).
const siteOrigin = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

// Each page's own title and description, so search results and WhatsApp link
// previews show the right thing (they don't run the page's scripts).
const PAGE_META = { '/about': 'about', '/timetable': 'timetable', '/pricing': 'pricing', '/gallery': 'gallery', '/faq': 'faq', '/timeline': 'timeline', '/performances': 'performances', '/workshops': 'workshops', '/contact': 'contact', '/privacy': 'privacy' };
function pageMeta(c, pagePath) {
  const key = PAGE_META[pagePath];
  const section = key ? c[key] : null;
  const plain = (t) => String(t || '').replace(/[*_#>`[\]()]/g, '').replace(/\s+/g, ' ').trim();
  const intro = plain(section?.intro || section?.tagline || '');
  return {
    title: section?.title ? `${plain(section.title)} | ${c.site.name}` : c.site.name,
    description: (intro || c.site.tagline).slice(0, 200),
  };
}

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /account\nDisallow: /api/\nSitemap: ${siteOrigin(req)}/sitemap.xml\n`);
});

app.get('/sitemap.xml', (req, res) => {
  const c = content.getContent();
  const visible = new Set(c.nav.filter((n) => n.visible).map((n) => n.id));
  const pages = ['/', ...Object.keys(PAGE_META).filter((p) => p === '/privacy' || visible.has(PAGE_META[p])), ...c.customPages.filter((p) => visible.has(`page:${p.slug}`)).map((p) => `/p/${p.slug}`)];
  const urls = pages.map((p) => `  <url><loc>${escapeHtml(siteOrigin(req) + p)}</loc></url>`).join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
});

// Browsers ask for /favicon.ico whatever the page says.
app.get('/favicon.ico', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(PUBLIC_DIR, 'img', 'favicon-48.png'));
});

app.get('/{*path}', async (req, res) => {
  if (path.extname(req.path)) return res.status(404).send('Not found');
  const c = content.getContent();
  const site = c.site;
  const color = /^#[0-9a-f]{3,8}$/i.test(site.primaryColor) ? site.primaryColor : '#2f2f52';
  const meta = pageMeta(c, req.path.replace(/\/+$/, '') || '/');
  const origin = siteOrigin(req);
  const html = indexTemplate
    .replace('<title>{{SITE_NAME}}</title>', `<title>${escapeHtml(meta.title)}</title>`)
    .replace('<meta property="og:title" content="{{SITE_NAME}}">', `<meta property="og:title" content="${escapeHtml(meta.title)}">`)
    .replace('content="/img/og-backdrop.jpg"', `content="${escapeHtml(origin)}/img/og-backdrop.jpg"`)
    .replaceAll('{{SITE_NAME}}', escapeHtml(site.name))
    .replaceAll('{{SITE_DESCRIPTION}}', escapeHtml(meta.description))
    .replaceAll('{{THEME_COLOR}}', color);
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(html);
});

// ---------- errors ----------

app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That is too large to save.' });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Images must be 10 MB or smaller.' : err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// ---------- first run ----------

async function ensureAdmin() {
  const hasAdmin = (await db.get("SELECT 1 FROM users WHERE role = 'admin'"));
  if (hasAdmin) return;
  const email = process.env.ADMIN_EMAIL || 'admin@londonacademyofbhangra.org';
  const password = process.env.ADMIN_PASSWORD || auth.generatePassword();
  await db.run(
    `INSERT INTO users (member_id, name, email, password_hash, role, email_verified_at) VALUES (?, ?, ?, ?, ?, ${db.NOW})`,
    await auth.generateMemberId(), 'Academy Admin', email, await auth.hashPassword(password), 'admin'
  );
  console.log('\n================ First run ================');
  console.log(' Admin account created');
  console.log(`   Email:    ${email}`);
  if (!process.env.ADMIN_PASSWORD) console.log(`   Password: ${password}`);
  console.log(' Log in at /login and change this password.');
  console.log('===========================================\n');
}

// Connects to the database and loads the website content. Call before listening.
async function prepare() {
  // Render's free plan has no permanent disk: without a database URL every
  // member and attendance record would be lost on the next restart.
  if (process.env.RENDER && !DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Add your Supabase connection string in Render → Environment.');
  }
  await initDb();
  await content.init();
  await instagram.init();
  await storage.init();
  await ensureAdmin();
  // Daily tidy-up of what the privacy policy says isn't kept.
  await tidyUp().catch((err) => console.error('Tidy-up:', err.message));
  setInterval(() => tidyUp().catch((err) => console.error('Tidy-up:', err.message)), 24 * 3600_000).unref();
}

// Contact messages go after 12 months; expired logins and login tickets go too.
async function tidyUp() {
  await db.run("DELETE FROM messages WHERE created_at < to_char((now() at time zone 'utc') - interval '12 months', 'YYYY-MM-DD HH24:MI:SS')");
  await db.run('DELETE FROM auth_sessions WHERE expires_at < ?', Date.now());
  await db.run('DELETE FROM login_challenges WHERE expires_at < ?', Date.now());
  await db.run('DELETE FROM rate_limits WHERE reset_at < ?', Date.now());
}

if (require.main === module) {
  prepare()
    .then(() => {
      instagram.startBackgroundRefresh();
      console.log(`Database: ${db.kind === 'postgres' ? 'Postgres (DATABASE_URL)' : 'embedded Postgres in ' + DATA_DIR}`);
      console.log(`Uploads: ${storage.describe()}`);
      app.listen(PORT, () => console.log(`London Academy of Bhangra running on http://localhost:${PORT}`));
    })
    .catch((err) => {
      console.error(`\nCould not start: ${err.message}\n`);
      process.exit(1);
    });
}

module.exports = { app, prepare, ensureAdmin, extractMemberId };
