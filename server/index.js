'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');

const { db, DATA_DIR, transaction } = require('./db');
const auth = require('./auth');
const content = require('./content');
const instagram = require('./instagram');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const TIME_ZONE = process.env.TZ_NAME || 'Europe/London';
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY !== undefined ? Number(process.env.TRUST_PROXY) : 1);

// ---------- helpers ----------

const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(\d{2}:\d{2})?$/;

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
    notes: includeNotes ? u.notes || '' : undefined,
    createdAt: u.created_at,
  };
}

function memberStats(userId) {
  const { date } = todayInfo();
  const month = date.slice(0, 7);
  const total = db.prepare('SELECT COUNT(*) AS n FROM attendance WHERE user_id = ?').get(userId).n;
  const thisMonth = db
    .prepare(
      `SELECT COUNT(*) AS n FROM attendance a JOIN class_sessions s ON s.id = a.session_id
        WHERE a.user_id = ? AND substr(s.date, 1, 7) = ?`
    )
    .get(userId, month).n;
  const last = db
    .prepare(
      `SELECT s.date FROM attendance a JOIN class_sessions s ON s.id = a.session_id
        WHERE a.user_id = ? ORDER BY s.date DESC LIMIT 1`
    )
    .get(userId);
  return { total, thisMonth, lastAttended: last ? last.date : null };
}

function memberAttendance(userId, limit = 200) {
  return db
    .prepare(
      `SELECT s.id AS sessionId, s.title, s.date, s.start_time AS startTime, s.end_time AS endTime,
              s.location, a.method, a.created_at AS scannedAt
         FROM attendance a JOIN class_sessions s ON s.id = a.session_id
        WHERE a.user_id = ? ORDER BY s.date DESC, s.start_time DESC LIMIT ?`
    )
    .all(userId, limit);
}

function findUserByIdentifier(identifier) {
  const value = identifier.trim();
  if (!value) return null;
  const memberId = extractMemberId(value);
  if (memberId) return db.prepare('SELECT * FROM users WHERE member_id = ?').get(memberId);
  return db.prepare('SELECT * FROM users WHERE email = ?').get(value);
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

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
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

app.use(express.json({ limit: '2mb' }));
app.use(auth.loadUser);

// State-changing API calls must carry a custom header. Browsers will not send
// it cross-site without a CORS preflight (which we never allow), so this
// blocks CSRF in combination with SameSite cookies.
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (req.get('X-LAB-CSRF') !== '1') return res.status(403).json({ error: 'Missing request header.' });
  next();
});

// ---------- public API ----------

app.get('/api/content', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.json(content.getContent());
});

app.get('/api/instagram', async (_req, res) => {
  const feed = await instagram.getFeed();
  const max = Math.min(Math.max(Number(content.getContent().gallery.maxPosts) || 12, 1), 50);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ ...feed, posts: (feed.posts || []).slice(0, max) });
});

const contactLimiter = new Map();
app.post('/api/contact', (req, res) => {
  if (!content.getContent().contact.formEnabled) throw new HttpError(400, 'The contact form is turned off.');
  const name = str(req.body.name, 120);
  const email = str(req.body.email, 200);
  const phone = str(req.body.phone, 40);
  const subject = str(req.body.subject, 200);
  const body = str(req.body.message, 5000);
  if (str(req.body.website)) return res.json({ ok: true }); // honeypot field
  if (!name || !EMAIL_RE.test(email) || !body) throw new HttpError(400, 'Please give your name, a valid email and a message.');
  const now = Date.now();
  const recent = (contactLimiter.get(req.ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= 5) throw new HttpError(429, 'Too many messages. Please try again later.');
  recent.push(now);
  contactLimiter.set(req.ip, recent);
  db.prepare('INSERT INTO messages (name, email, phone, subject, body) VALUES (?, ?, ?, ?, ?)').run(name, email, phone, subject, body);
  res.json({ ok: true });
});

// ---------- auth ----------

app.post('/api/auth/login', (req, res) => {
  const identifier = str(req.body.identifier, 200);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const key = `${req.ip}|${identifier.toLowerCase()}`;
  if (auth.tooManyAttempts(key)) throw new HttpError(429, 'Too many attempts. Please wait 15 minutes and try again.');
  const user = findUserByIdentifier(identifier);
  if (!user || !auth.verifyPassword(password, user.password_hash)) {
    auth.recordFailedAttempt(key);
    throw new HttpError(401, 'Incorrect email/member ID or password.');
  }
  if (!user.active) throw new HttpError(403, 'This account has been deactivated. Please speak to an instructor.');
  auth.clearAttempts(key);
  auth.createSession(res, req, user.id);
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/register', (req, res) => {
  if (!content.getContent().site.allowRegistration) throw new HttpError(403, 'Online registration is closed. Please ask an instructor to create your account.');
  const name = str(req.body.name, 120);
  const email = str(req.body.email, 200);
  const phone = str(req.body.phone, 40);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!name) throw new HttpError(400, 'Please enter your name.');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'An account with that email already exists. Try logging in.');
  const memberId = auth.generateMemberId();
  const info = db
    .prepare('INSERT INTO users (member_id, name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)')
    .run(memberId, name, email, phone, auth.hashPassword(password), 'member');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  auth.createSession(res, req, user.id);
  res.status(201).json({ user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  auth.destroySession(req, res);
  res.json({ ok: true });
});

// ---------- member (self) ----------

app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: publicUser(req.user), stats: memberStats(req.user.id) });
});

app.get('/api/me/attendance', auth.requireRole('member'), (req, res) => {
  res.json({ attendance: memberAttendance(req.user.id), stats: memberStats(req.user.id) });
});

app.get('/api/me/qr.svg', auth.requireRole('member'), async (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(await qrSvg(req.user.member_id));
});

app.patch('/api/me', auth.requireRole('member'), (req, res) => {
  const name = str(req.body.name, 120);
  const phone = str(req.body.phone, 40);
  if (!name) throw new HttpError(400, 'Name cannot be empty.');
  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, phone, req.user.id);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

app.post('/api/me/password', auth.requireRole('member'), (req, res) => {
  const current = typeof req.body.current === 'string' ? req.body.current : '';
  const next = typeof req.body.next === 'string' ? req.body.next : '';
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!auth.verifyPassword(current, row.password_hash)) throw new HttpError(400, 'Your current password is incorrect.');
  if (next.length < 8) throw new HttpError(400, 'New password must be at least 8 characters.');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(next), req.user.id);
  auth.destroyAllSessionsFor(req.user.id);
  auth.createSession(res, req, req.user.id);
  res.json({ ok: true });
});

// ---------- staff: instructors & admins ----------

const staff = express.Router();
staff.use(auth.requireRole('instructor'));

staff.get('/stats', (_req, res) => {
  const { date } = todayInfo();
  res.json({
    members: db.prepare("SELECT COUNT(*) AS n FROM users WHERE active = 1").get().n,
    todaySessions: db.prepare('SELECT COUNT(*) AS n FROM class_sessions WHERE date = ?').get(date).n,
    todayAttendance: db
      .prepare('SELECT COUNT(*) AS n FROM attendance a JOIN class_sessions s ON s.id = a.session_id WHERE s.date = ?')
      .get(date).n,
    last30Attendance: db
      .prepare("SELECT COUNT(*) AS n FROM attendance a JOIN class_sessions s ON s.id = a.session_id WHERE s.date >= date(?, '-30 days')")
      .get(date).n,
    unreadMessages: db.prepare('SELECT COUNT(*) AS n FROM messages WHERE is_read = 0').get().n,
  });
});

staff.get('/today', (_req, res) => {
  const today = todayInfo();
  const classes = content
    .getContent()
    .timetable.classes.filter((c) => String(c.day || '').toLowerCase() === today.weekday.toLowerCase());
  const sessions = db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) AS count
         FROM class_sessions s WHERE s.date = ? ORDER BY s.start_time`
    )
    .all(today.date);
  res.json({ ...today, classes, sessions });
});

staff.get('/sessions', (req, res) => {
  const from = DATE_RE.test(req.query.from || '') ? req.query.from : '0000-00-00';
  const to = DATE_RE.test(req.query.to || '') ? req.query.to : '9999-12-31';
  const sessions = db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) AS count
         FROM class_sessions s WHERE s.date BETWEEN ? AND ?
        ORDER BY s.date DESC, s.start_time DESC LIMIT 500`
    )
    .all(from, to);
  res.json({ sessions });
});

staff.post('/sessions', (req, res) => {
  const title = str(req.body.title, 120);
  const date = str(req.body.date, 10) || todayInfo().date;
  const start = str(req.body.start_time, 5);
  const end = str(req.body.end_time, 5);
  const location = str(req.body.location, 200);
  if (!title) throw new HttpError(400, 'Please give the session a name.');
  if (!DATE_RE.test(date) || !TIME_RE.test(start) || !TIME_RE.test(end)) throw new HttpError(400, 'Invalid date or time.');
  db.prepare(
    `INSERT INTO class_sessions (title, date, start_time, end_time, location, created_by)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (title, date, start_time) DO NOTHING`
  ).run(title, date, start, end, location, req.user.id);
  const session = db.prepare('SELECT * FROM class_sessions WHERE title = ? AND date = ? AND start_time = ?').get(title, date, start);
  res.json({ session });
});

function loadSession(id) {
  const session = db.prepare('SELECT * FROM class_sessions WHERE id = ?').get(Number(id));
  if (!session) throw new HttpError(404, 'Session not found.');
  return session;
}

function sessionAttendees(sessionId) {
  return db
    .prepare(
      `SELECT u.id, u.member_id AS memberId, u.name, a.method, a.created_at AS scannedAt, sb.name AS scannedBy
         FROM attendance a JOIN users u ON u.id = a.user_id
         LEFT JOIN users sb ON sb.id = a.scanned_by
        WHERE a.session_id = ? ORDER BY a.created_at DESC`
    )
    .all(sessionId);
}

staff.get('/sessions/:id', (req, res) => {
  const session = loadSession(req.params.id);
  res.json({ session, attendees: sessionAttendees(session.id) });
});

staff.patch('/sessions/:id', (req, res) => {
  const session = loadSession(req.params.id);
  const title = str(req.body.title ?? session.title, 120);
  const date = str(req.body.date ?? session.date, 10);
  const start = str(req.body.start_time ?? session.start_time, 5);
  const end = str(req.body.end_time ?? session.end_time, 5);
  const location = str(req.body.location ?? session.location, 200);
  if (!title || !DATE_RE.test(date) || !TIME_RE.test(start) || !TIME_RE.test(end)) throw new HttpError(400, 'Invalid session details.');
  try {
    db.prepare('UPDATE class_sessions SET title = ?, date = ?, start_time = ?, end_time = ?, location = ? WHERE id = ?').run(
      title, date, start, end, location, session.id
    );
  } catch {
    throw new HttpError(409, 'Another session already has that name, date and start time.');
  }
  res.json({ session: loadSession(session.id) });
});

staff.delete('/sessions/:id', auth.requireRole('admin'), (req, res) => {
  const session = loadSession(req.params.id);
  db.prepare('DELETE FROM class_sessions WHERE id = ?').run(session.id);
  res.json({ ok: true });
});

// Record attendance from a scanned QR code, a typed member ID, or a user id (manual pick).
staff.post('/sessions/:id/attendance', (req, res) => {
  const session = loadSession(req.params.id);
  let member = null;
  let method = 'qr';
  if (req.body.userId) {
    member = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.body.userId));
    method = 'manual';
  } else {
    const memberId = extractMemberId(str(req.body.code, 300));
    if (!memberId) throw new HttpError(400, 'That code is not a London Academy of Bhangra member ID.');
    member = db.prepare('SELECT * FROM users WHERE member_id = ?').get(memberId);
    if (req.body.method === 'manual') method = 'manual';
  }
  if (!member) throw new HttpError(404, 'No member found with that ID.');
  if (!member.active) throw new HttpError(403, `${member.name}'s membership is inactive.`);
  const info = db
    .prepare('INSERT INTO attendance (session_id, user_id, scanned_by, method) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING')
    .run(session.id, member.id, req.user.id, method);
  res.json({
    status: info.changes ? 'recorded' : 'already',
    member: { id: member.id, memberId: member.member_id, name: member.name },
    stats: memberStats(member.id),
    count: db.prepare('SELECT COUNT(*) AS n FROM attendance WHERE session_id = ?').get(session.id).n,
  });
});

staff.delete('/sessions/:id/attendance/:userId', (req, res) => {
  const session = loadSession(req.params.id);
  db.prepare('DELETE FROM attendance WHERE session_id = ? AND user_id = ?').run(session.id, Number(req.params.userId));
  res.json({ ok: true });
});

staff.get('/sessions/:id/export.csv', (req, res) => {
  const session = loadSession(req.params.id);
  const rows = sessionAttendees(session.id).map((a) => [a.memberId, a.name, a.method, a.scannedAt, a.scannedBy || '']);
  sendCsv(res, `attendance-${session.date}-${session.id}.csv`, ['Member ID', 'Name', 'Method', 'Recorded at (UTC)', 'Recorded by'], rows);
});

staff.get('/attendance.csv', (req, res) => {
  const from = DATE_RE.test(req.query.from || '') ? req.query.from : '0000-00-00';
  const to = DATE_RE.test(req.query.to || '') ? req.query.to : '9999-12-31';
  const rows = db
    .prepare(
      `SELECT s.date, s.start_time, s.title, u.member_id, u.name, a.method, a.created_at
         FROM attendance a JOIN class_sessions s ON s.id = a.session_id JOIN users u ON u.id = a.user_id
        WHERE s.date BETWEEN ? AND ? ORDER BY s.date, s.start_time, u.name`
    )
    .all(from, to)
    .map((r) => [r.date, r.start_time, r.title, r.member_id, r.name, r.method, r.created_at]);
  sendCsv(res, 'attendance.csv', ['Date', 'Start', 'Session', 'Member ID', 'Name', 'Method', 'Recorded at (UTC)'], rows);
});

staff.get('/members', (req, res) => {
  const q = str(req.query.q, 100);
  const like = `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
  const rows = db
    .prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM attendance a WHERE a.user_id = u.id) AS attended,
              (SELECT MAX(s.date) FROM attendance a JOIN class_sessions s ON s.id = a.session_id WHERE a.user_id = u.id) AS last_attended
         FROM users u
        WHERE (? = '' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR u.member_id LIKE ? ESCAPE '\\' OR u.phone LIKE ? ESCAPE '\\')
        ORDER BY u.active DESC, u.name COLLATE NOCASE LIMIT 1000`
    )
    .all(q, like, like, like, like);
  res.json({ members: rows.map((r) => ({ ...publicUser(r, { includeNotes: true }), attended: r.attended, lastAttended: r.last_attended })) });
});

staff.post('/members', (req, res) => {
  const name = str(req.body.name, 120);
  const email = str(req.body.email, 200);
  const phone = str(req.body.phone, 40);
  const notes = str(req.body.notes, 2000);
  let role = ['member', 'instructor', 'admin'].includes(req.body.role) ? req.body.role : 'member';
  if (req.user.role !== 'admin') role = 'member';
  if (!name) throw new HttpError(400, 'Please enter a name.');
  if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'That email address does not look right.');
  if (email && db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'A member with that email already exists.');
  const password = str(req.body.password, 200) || auth.generatePassword();
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  const memberId = auth.generateMemberId();
  const info = db
    .prepare('INSERT INTO users (member_id, name, email, phone, password_hash, role, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(memberId, name, email || null, phone, auth.hashPassword(password), role, notes);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ member: publicUser(user, { includeNotes: true }), password });
});

function loadMember(id) {
  const member = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
  if (!member) throw new HttpError(404, 'Member not found.');
  return member;
}

staff.get('/members/:id', (req, res) => {
  const member = loadMember(req.params.id);
  res.json({ member: publicUser(member, { includeNotes: true }), stats: memberStats(member.id), attendance: memberAttendance(member.id) });
});

staff.get('/members/:id/qr.svg', async (req, res) => {
  const member = loadMember(req.params.id);
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(await qrSvg(member.member_id));
});

app.use('/api/staff', staff);

// ---------- admin only ----------

const admin = express.Router();
admin.use(auth.requireRole('admin'));

admin.patch('/members/:id', (req, res) => {
  const member = loadMember(req.params.id);
  const name = req.body.name !== undefined ? str(req.body.name, 120) : member.name;
  const email = req.body.email !== undefined ? str(req.body.email, 200) : member.email || '';
  const phone = req.body.phone !== undefined ? str(req.body.phone, 40) : member.phone || '';
  const notes = req.body.notes !== undefined ? str(req.body.notes, 2000) : member.notes || '';
  const role = req.body.role !== undefined ? req.body.role : member.role;
  const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : member.active;
  if (!name) throw new HttpError(400, 'Name cannot be empty.');
  if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'That email address does not look right.');
  if (!['member', 'instructor', 'admin'].includes(role)) throw new HttpError(400, 'Invalid role.');
  if (member.id === req.user.id && (role !== 'admin' || !active)) throw new HttpError(400, 'You cannot remove your own admin access.');
  if (email && db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(email, member.id)) throw new HttpError(409, 'Another member already uses that email.');
  db.prepare('UPDATE users SET name = ?, email = ?, phone = ?, notes = ?, role = ?, active = ? WHERE id = ?').run(
    name, email || null, phone, notes, role, active, member.id
  );
  if (!active) auth.destroyAllSessionsFor(member.id);
  res.json({ member: publicUser(loadMember(member.id), { includeNotes: true }) });
});

admin.post('/members/:id/reset-password', (req, res) => {
  const member = loadMember(req.params.id);
  const password = str(req.body.password, 200) || auth.generatePassword();
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(password), member.id);
  auth.destroyAllSessionsFor(member.id);
  res.json({ password });
});

admin.post('/members/:id/new-member-id', (req, res) => {
  const member = loadMember(req.params.id);
  const memberId = auth.generateMemberId();
  db.prepare('UPDATE users SET member_id = ? WHERE id = ?').run(memberId, member.id);
  res.json({ member: publicUser(loadMember(member.id), { includeNotes: true }) });
});

admin.delete('/members/:id', (req, res) => {
  const member = loadMember(req.params.id);
  if (member.id === req.user.id) throw new HttpError(400, 'You cannot delete your own account.');
  db.prepare('DELETE FROM users WHERE id = ?').run(member.id);
  res.json({ ok: true });
});

admin.put('/content', (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid content.');
  res.json(content.saveContent(body));
});

admin.post('/content/reset', (req, res) => {
  try {
    res.json(content.resetSection(str(req.body.section, 40)));
  } catch {
    throw new HttpError(400, 'Unknown section.');
  }
});

const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${IMAGE_TYPES[file.mimetype]}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, Boolean(IMAGE_TYPES[file.mimetype])),
});

admin.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) throw new HttpError(400, 'Please choose a JPG, PNG, WebP or GIF image (max 10 MB).');
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});

admin.get('/uploads', (_req, res) => {
  const files = fs
    .readdirSync(UPLOAD_DIR)
    .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f))
    .map((f) => ({ url: `/uploads/${f}`, mtime: fs.statSync(path.join(UPLOAD_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  res.json({ files });
});

admin.delete('/uploads/:name', (req, res) => {
  const name = path.basename(req.params.name);
  const file = path.join(UPLOAD_DIR, name);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ ok: true });
});

admin.get('/instagram', (_req, res) => res.json(instagram.status()));

admin.post('/instagram', async (req, res) => {
  const token = str(req.body.accessToken, 1000);
  if (!token) throw new HttpError(400, 'Please paste an access token.');
  try {
    await instagram.setToken(token);
  } catch (err) {
    throw new HttpError(400, `Instagram rejected that token: ${err.message}`);
  }
  res.json(instagram.status());
});

admin.post('/instagram/refresh', async (_req, res) => {
  const feed = await instagram.getFeed({ force: true });
  res.json({ ...instagram.status(), postCount: feed.posts.length });
});

admin.delete('/instagram', (_req, res) => {
  instagram.clearToken();
  res.json(instagram.status());
});

admin.get('/messages', (_req, res) => {
  res.json({ messages: db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 500').all() });
});

admin.patch('/messages/:id', (req, res) => {
  db.prepare('UPDATE messages SET is_read = ? WHERE id = ?').run(req.body.read ? 1 : 0, Number(req.params.id));
  res.json({ ok: true });
});

admin.delete('/messages/:id', (req, res) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.use('/api/admin', admin);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// ---------- static files & SPA ----------

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.get('/vendor/html5-qrcode.min.js', (_req, res) => {
  res.sendFile(require.resolve('html5-qrcode/html5-qrcode.min.js'), { maxAge: '7d' });
});
app.use(express.static(PUBLIC_DIR, { index: false, maxAge: '1h' }));

const indexTemplate = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

app.get('/{*path}', (req, res) => {
  if (path.extname(req.path)) return res.status(404).send('Not found');
  const site = content.getContent().site;
  const color = /^#[0-9a-f]{3,8}$/i.test(site.primaryColor) ? site.primaryColor : '#2f2f52';
  const html = indexTemplate
    .replaceAll('{{SITE_NAME}}', escapeHtml(site.name))
    .replaceAll('{{SITE_DESCRIPTION}}', escapeHtml(site.tagline))
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

function ensureAdmin() {
  const hasAdmin = db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get();
  if (hasAdmin) return;
  const email = process.env.ADMIN_EMAIL || 'admin@londonacademyofbhangra.org';
  const password = process.env.ADMIN_PASSWORD || auth.generatePassword();
  transaction(() => {
    db.prepare('INSERT INTO users (member_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(
      auth.generateMemberId(), 'Academy Admin', email, auth.hashPassword(password), 'admin'
    );
  });
  console.log('\n================ First run ================');
  console.log(' Admin account created');
  console.log(`   Email:    ${email}`);
  if (!process.env.ADMIN_PASSWORD) console.log(`   Password: ${password}`);
  console.log(' Log in at /login and change this password.');
  console.log('===========================================\n');
}

if (require.main === module) {
  ensureAdmin();
  instagram.startBackgroundRefresh();
  app.listen(PORT, () => console.log(`London Academy of Bhangra running on http://localhost:${PORT}`));
}

module.exports = { app, ensureAdmin, extractMemberId };
