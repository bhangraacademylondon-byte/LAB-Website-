'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');

const { db, init: initDb, transaction, getSetting, setSetting, isUniqueViolation, DATA_DIR, DATABASE_URL } = require('./db');
const storage = require('./storage');
const auth = require('./auth');
const content = require('./content');
const email = require('./email');
const rsvp = require('./rsvp');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'Ravi.akshee@gmail.com').trim();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY !== undefined ? Number(process.env.TRUST_PROXY) : 1);

// ---------- helpers ----------

const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
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
const allowLookup = rateLimiter(30, 15 * 60_000);

function siteUrl(req) {
  const configured = (process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  return configured || `${req.protocol}://${req.get('host')}`;
}

// ---------- RSVP links ----------
// After a guest finds their name, they get a short-lived signed token for
// their invitation, so the next steps don't need the name typed again.

let tokenSecret = null;
const TOKEN_HOURS = 6;

function hmac(value) {
  return crypto.createHmac('sha256', tokenSecret).update(value).digest('base64url');
}

function signInviteToken(householdId) {
  const payload = `${householdId}.${Date.now() + TOKEN_HOURS * 3600_000}`;
  return `${payload}.${hmac(payload)}`;
}

function readInviteToken(req) {
  const token = String(req.get('X-RSVP-Token') || '');
  const [id, exp, sig] = token.split('.');
  if (!id || !exp || !sig) return null;
  const expected = Buffer.from(hmac(`${id}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  if (Number(exp) < Date.now()) return null;
  return Number(id);
}

async function requireInvite(req) {
  const id = readInviteToken(req);
  if (!id) throw new HttpError(401, 'For your privacy this page timed out. Please type your name again.');
  const invite = await rsvp.loadHousehold(id);
  if (!invite) throw new HttpError(404, 'We could not find your invitation. Please type your name again.');
  return invite;
}

// ---------- notification emails ----------

async function notifySettings() {
  const saved = await getSetting('notify', null);
  return {
    recipients: Array.isArray(saved?.recipients) ? saved.recipients.filter((e) => EMAIL_RE.test(e)) : [ADMIN_EMAIL],
    onAdminEdit: Boolean(saved?.onAdminEdit),
  };
}

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function composeEmail(result, link) {
  const { snapshot: snap, changes, action, summary } = result;
  const site = content.getContent().site;
  const verb = { submitted: 'has replied', updated: 'has changed their reply', admin_edit: 'reply was edited by an admin' }[action];
  const subject = `${action === 'submitted' ? 'New RSVP' : 'RSVP changed'}: ${snap.household}: ${summary}`;
  const guestLines = snap.guests.map((g) => {
    const mark = g.attending === true ? '✓' : g.attending === false ? '✗' : '?';
    const status = g.attending === true ? 'Coming' : g.attending === false ? 'Not coming' : 'No reply';
    const extra = g.plusOne ? ' (extra guest)' : '';
    return { head: `${mark} ${g.name}${extra}: ${status}`, answers: g.answers.map((a) => `${a.q}: ${a.a}`) };
  });
  const text = [
    `${snap.household} ${verb}.`,
    summary,
    '',
    ...(changes.length ? ['What changed:', ...changes.map((c) => `  • ${c}`), ''] : []),
    'Guests:',
    ...guestLines.flatMap((g) => [`  ${g.head}`, ...g.answers.map((a) => `      ${a}`)]),
    ...(snap.answers.length ? ['', ...snap.answers.map((a) => `${a.q}: ${a.a}`)] : []),
    '',
    `See all replies: ${link}`,
  ].join('\n');
  const html = `<div style="font-family:Georgia,serif;font-size:17px;line-height:1.5;color:#2b2420;max-width:600px">
    <h2 style="margin:0 0 4px">${escHtml(snap.household)} ${escHtml(verb)}</h2>
    <p style="margin:0 0 16px;font-size:18px"><strong>${escHtml(summary)}</strong></p>
    ${changes.length ? `<p style="margin:0">What changed:</p><ul>${changes.map((c) => `<li>${escHtml(c)}</li>`).join('')}</ul>` : ''}
    <ul style="padding-left:0;list-style:none">${guestLines.map((g) => `<li style="margin-bottom:8px">${escHtml(g.head)}${g.answers.map((a) => `<br><span style="color:#6b5e55;padding-left:22px">${escHtml(a)}</span>`).join('')}</li>`).join('')}</ul>
    ${snap.answers.map((a) => `<p style="margin:0 0 8px"><strong>${escHtml(a.q)}:</strong> ${escHtml(a.a).replace(/\n/g, '<br>')}</p>`).join('')}
    <p style="margin-top:20px"><a href="${escHtml(link)}" style="color:#8a6a1f">See all replies</a></p>
  </div>`;
  return { subject, text, html, fromName: `${site.coupleNames} RSVPs` };
}

async function sendUpdateEmail(req, result, householdId) {
  const settings = await notifySettings();
  if (result.action === 'admin_edit' && !settings.onAdminEdit) return;
  const message = composeEmail(result, `${siteUrl(req)}/admin/guests/${householdId}`);
  await email.sendQuietly({ ...message, to: settings.recipients });
}

// ---------- security & parsing ----------

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      'frame-src https://www.google.com https://maps.google.com',
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(async (req, _res, next) => {
  // Static files (images, scripts) don't need the website content.
  if (!/\.\w+$/.test(req.path) || req.path.startsWith('/api/')) await content.refreshIfStale();
  next();
});
app.use(auth.loadAdmin);

// State-changing API calls must carry a custom header. Browsers will not send
// it cross-site without a CORS preflight (which we never allow), so this
// blocks CSRF in combination with SameSite cookies.
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (req.get('X-RSVP-CSRF') !== '1') return res.status(403).json({ error: 'Missing request header.' });
  next();
});

// ---------- public ----------

// Used by the hosting platform to check the app is up (also checks the database).
app.get('/healthz', async (_req, res) => {
  await db.get('SELECT 1');
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true });
});

app.get('/api/content', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.json(content.getContent());
});

app.post('/api/rsvp/lookup', async (req, res) => {
  const settings = content.getContent().rsvp;
  if (!settings.open) throw new HttpError(403, settings.notOpenText);
  const name = str(req.body.name, 120);
  if (rsvp.nameTokens(name).length === 0) throw new HttpError(400, 'Please type your first and last name.');
  if (!allowLookup(req.ip)) throw new HttpError(429, 'Too many tries. Please wait 15 minutes, or contact us and we will help.');
  const ids = await rsvp.findHouseholds(name);
  const matches = [];
  for (const id of ids.slice(0, 5)) {
    const guests = await db.all('SELECT name FROM guests WHERE household_id = ? AND is_plus_one = 0 ORDER BY sort, id', id);
    // When the same name is on more than one invitation, first names help people pick theirs.
    matches.push({ token: signInviteToken(id), firstNames: guests.map((g) => g.name.trim().split(/\s+/)[0]) });
  }
  res.json({ matches });
});

app.get('/api/rsvp/invite', async (req, res) => {
  const invite = await requireInvite(req);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ invite: rsvp.inviteView(invite, content.getContent().rsvp) });
});

app.post('/api/rsvp/reply', async (req, res) => {
  const current = await requireInvite(req);
  const settings = content.getContent().rsvp;
  const view = rsvp.inviteView(current, settings);
  if (!view.canReply) throw new HttpError(403, settings.open ? settings.closedText : settings.notOpenText);
  const result = await rsvp.saveReply(current.household.id, req.body, settings, { actor: 'guest' });
  sendUpdateEmail(req, result, current.household.id).catch((err) => console.error(err));
  res.json({ invite: rsvp.inviteView(result.saved, settings), firstReply: result.firstReply });
});

// ---------- admin login ----------

app.post('/api/auth/login', async (req, res) => {
  const emailAddr = str(req.body.email, 200);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const key = `${req.ip}|${emailAddr.toLowerCase()}`;
  if (auth.tooManyAttempts(key)) throw new HttpError(429, 'Too many attempts. Please wait 15 minutes and try again.');
  const admin = await db.get('SELECT * FROM admins WHERE lower(email) = lower(?)', emailAddr);
  // Always run a bcrypt comparison so response time does not reveal whether the account exists.
  if (!auth.verifyPassword(password, admin?.password_hash) || !admin) {
    auth.recordFailedAttempt(key);
    throw new HttpError(401, 'Incorrect email or password.');
  }
  auth.clearAttempts(key);
  await auth.createSession(res, req, admin.id);
  res.json({ admin: { id: admin.id, email: admin.email, name: admin.name } });
});

app.post('/api/auth/logout', async (req, res) => {
  await auth.destroySession(req, res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ admin: req.admin });
});

// ---------- admin ----------

const admin = express.Router();
admin.use(auth.requireAdmin);
admin.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

function householdStatus(h, deadlinePassed) {
  if (h.responded_at) return 'replied';
  return deadlinePassed ? 'overdue' : 'waiting';
}

function householdView(h, guests, deadlinePassed) {
  return {
    id: h.id,
    name: h.name,
    contactPhone: h.contact_phone,
    contactEmail: h.contact_email,
    notes: h.notes,
    plusOnes: h.plus_ones,
    answers: rsvp.parseJson(h.answers, {}),
    respondedBy: h.responded_by,
    respondedAt: h.responded_at,
    updatedAt: h.updated_at,
    responseCount: h.response_count,
    chasedAt: h.chased_at,
    createdAt: h.created_at,
    status: householdStatus(h, deadlinePassed),
    guests: guests.map(rsvp.guestView),
  };
}

async function allHouseholds() {
  const passed = rsvp.deadlinePassed(content.getContent().rsvp);
  const households = await db.all('SELECT * FROM households ORDER BY lower(name), id');
  const guests = await db.all('SELECT * FROM guests ORDER BY is_plus_one, sort, id');
  const byHousehold = new Map();
  for (const g of guests) {
    if (!byHousehold.has(g.household_id)) byHousehold.set(g.household_id, []);
    byHousehold.get(g.household_id).push(g);
  }
  return households.map((h) => householdView(h, byHousehold.get(h.id) || [], passed));
}

function stats(households) {
  const s = { households: households.length, replied: 0, waiting: 0, overdue: 0, invited: 0, coming: 0, notComing: 0, noReply: 0, comingAdults: 0, comingChildren: 0, extraGuests: 0 };
  for (const h of households) {
    s[h.status] += 1;
    for (const g of h.guests) {
      if (!g.isPlusOne) s.invited += 1;
      else s.extraGuests += 1;
      if (g.attending === true) {
        s.coming += 1;
        if (g.isChild) s.comingChildren += 1;
        else s.comingAdults += 1;
      } else if (g.attending === false) s.notComing += 1;
      else s.noReply += 1;
    }
  }
  return s;
}

admin.get('/overview', async (_req, res) => {
  const households = await allHouseholds();
  const settings = content.getContent().rsvp;
  const recent = await db.all('SELECT * FROM rsvp_log ORDER BY id DESC LIMIT 8');
  res.json({
    stats: stats(households),
    deadline: settings.deadline,
    deadlinePassed: rsvp.deadlinePassed(settings),
    today: rsvp.todayLondon(),
    open: settings.open,
    households,
    recent: recent.map(logView),
    email: email.status(),
  });
});

admin.get('/households', async (_req, res) => {
  const households = await allHouseholds();
  res.json({ households, stats: stats(households) });
});

admin.get('/households/:id', async (req, res) => {
  const loaded = await rsvp.loadHousehold(Number(req.params.id));
  if (!loaded) throw new HttpError(404, 'Invitation not found.');
  const passed = rsvp.deadlinePassed(content.getContent().rsvp);
  const log = await db.all('SELECT * FROM rsvp_log WHERE household_id = ? ORDER BY id DESC', loaded.household.id);
  res.json({ household: householdView(loaded.household, loaded.guests, passed), log: log.map(logView) });
});

// Reads the details form for a family: name, guests on the invitation, extra
// places, contact details and notes.
function readHouseholdForm(body) {
  const guests = (Array.isArray(body.guests) ? body.guests : [])
    .map((g) => ({ id: Number(g?.id) || null, name: str(g?.name, 120).replace(/\s+/g, ' '), isChild: Boolean(g?.isChild) }))
    .filter((g) => g.name);
  if (!guests.length) throw new HttpError(400, 'Please add at least one guest name.');
  if (guests.length > 50) throw new HttpError(400, 'An invitation can have up to 50 guests.');
  const plusOnes = Number(body.plusOnes) || 0;
  if (!Number.isInteger(plusOnes) || plusOnes < 0 || plusOnes > 20) throw new HttpError(400, 'Extra guests must be a whole number from 0 to 20.');
  const contactEmail = str(body.contactEmail, 200);
  if (contactEmail && !EMAIL_RE.test(contactEmail)) throw new HttpError(400, 'That email address does not look right.');
  return {
    name: str(body.name, 120) || defaultHouseholdName(guests.map((g) => g.name)),
    guests,
    plusOnes,
    contactPhone: str(body.contactPhone, 60),
    contactEmail,
    notes: str(body.notes, 2000),
  };
}

function defaultHouseholdName(names) {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;
}

// Names that are already on another invitation: guests typing that name will
// be asked to choose, so the admin is warned.
async function duplicateWarnings(names, exceptHouseholdId) {
  const others = await db.all('SELECT name FROM guests WHERE is_plus_one = 0 AND household_id != ?', exceptHouseholdId || 0);
  const warnings = [];
  for (const n of names) {
    if (others.some((o) => rsvp.matchScore(n, o.name) === 2)) warnings.push(`${n} is also on another invitation. When they RSVP they'll be asked to pick theirs by the first names on it.`);
  }
  return warnings;
}

async function insertHousehold(tx, form) {
  const { rows } = await tx.run(
    'INSERT INTO households (name, contact_phone, contact_email, notes, plus_ones) VALUES (?, ?, ?, ?, ?) RETURNING id',
    form.name, form.contactPhone, form.contactEmail, form.notes, form.plusOnes
  );
  const id = rows[0].id;
  for (const [i, g] of form.guests.entries()) {
    await tx.run('INSERT INTO guests (household_id, name, is_child, sort) VALUES (?, ?, ?, ?)', id, g.name, g.isChild ? 1 : 0, i);
  }
  return id;
}

admin.post('/households', async (req, res) => {
  const form = readHouseholdForm(req.body);
  const warnings = await duplicateWarnings(form.guests.map((g) => g.name));
  const id = await transaction((tx) => insertHousehold(tx, form));
  res.status(201).json({ id, warnings });
});

// Several families at once, one per line:
//   Patel family: Raj Patel, Priya Patel, Anil Patel (child) +1
//   Sunita Shah, Vik Shah
admin.post('/households/bulk', async (req, res) => {
  const lines = str(req.body.text, 100_000).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new HttpError(400, 'Please type at least one family, one per line.');
  if (lines.length > 500) throw new HttpError(400, 'Please add up to 500 families at a time.');
  const forms = lines.map((line, i) => {
    let rest = line;
    let name = '';
    const colon = rest.indexOf(':');
    if (colon > 0) {
      name = rest.slice(0, colon).trim();
      rest = rest.slice(colon + 1);
    }
    let plusOnes = 0;
    rest = rest.replace(/\+\s*(\d{1,2})\s*$/, (_m, n) => {
      plusOnes = Number(n);
      return '';
    });
    const guests = rest.split(/[,;]/).map((n) => n.trim()).filter(Boolean).map((n) => {
      const isChild = /\((child|kid|c)\)\s*$/i.test(n);
      return { name: n.replace(/\((child|kid|c)\)\s*$/i, '').trim(), isChild };
    });
    try {
      return readHouseholdForm({ name, guests, plusOnes });
    } catch (err) {
      throw new HttpError(400, `Line ${i + 1} ("${line.slice(0, 60)}"): ${err.message}`);
    }
  });
  const warnings = await duplicateWarnings(forms.flatMap((f) => f.guests.map((g) => g.name)));
  await transaction(async (tx) => {
    for (const form of forms) await insertHousehold(tx, form);
  });
  res.status(201).json({ added: forms.length, guests: forms.reduce((n, f) => n + f.guests.length, 0), warnings });
});

admin.put('/households/:id', async (req, res) => {
  const id = Number(req.params.id);
  const form = readHouseholdForm(req.body);
  const warnings = await duplicateWarnings(form.guests.map((g) => g.name), id);
  await transaction(async (tx) => {
    const household = await tx.get('SELECT id FROM households WHERE id = ? FOR UPDATE', id);
    if (!household) throw new HttpError(404, 'Invitation not found.');
    await tx.run('UPDATE households SET name = ?, contact_phone = ?, contact_email = ?, notes = ?, plus_ones = ? WHERE id = ?',
      form.name, form.contactPhone, form.contactEmail, form.notes, form.plusOnes, id);
    const existing = await tx.all('SELECT id FROM guests WHERE household_id = ? AND is_plus_one = 0', id);
    const keep = new Set(form.guests.map((g) => g.id).filter(Boolean));
    for (const g of existing) if (!keep.has(g.id)) await tx.run('DELETE FROM guests WHERE id = ?', g.id);
    const existingIds = new Set(existing.map((g) => g.id));
    for (const [i, g] of form.guests.entries()) {
      if (g.id && existingIds.has(g.id)) await tx.run('UPDATE guests SET name = ?, is_child = ?, sort = ? WHERE id = ?', g.name, g.isChild ? 1 : 0, i, g.id);
      else await tx.run('INSERT INTO guests (household_id, name, is_child, sort) VALUES (?, ?, ?, ?)', id, g.name, g.isChild ? 1 : 0, i);
    }
  });
  res.json({ ok: true, warnings });
});

admin.delete('/households/:id', async (req, res) => {
  const r = await db.run('DELETE FROM households WHERE id = ?', Number(req.params.id));
  if (!r.changes) throw new HttpError(404, 'Invitation not found.');
  res.json({ ok: true });
});

admin.put('/households/:id/reply', async (req, res) => {
  const id = Number(req.params.id);
  const settings = content.getContent().rsvp;
  const result = await rsvp.saveReply(id, req.body, settings, { actor: 'admin', actorName: req.admin.name || req.admin.email });
  sendUpdateEmail(req, result, id).catch((err) => console.error(err));
  res.json({ ok: true });
});

admin.delete('/households/:id/reply', async (req, res) => {
  await rsvp.clearReply(Number(req.params.id), req.admin.name || req.admin.email);
  res.json({ ok: true });
});

admin.post('/households/:id/chased', async (req, res) => {
  const chased = req.body.chased !== false;
  const r = await db.run(`UPDATE households SET chased_at = ${chased ? db.NOW : 'NULL'} WHERE id = ?`, Number(req.params.id));
  if (!r.changes) throw new HttpError(404, 'Invitation not found.');
  res.json({ ok: true });
});

function logView(l) {
  return {
    id: l.id,
    householdId: l.household_id,
    householdName: l.household_name,
    action: l.action,
    actor: l.actor,
    summary: l.summary,
    changes: rsvp.parseJson(l.changes, []),
    snapshot: rsvp.parseJson(l.snapshot, {}),
    createdAt: l.created_at,
  };
}

admin.get('/log', async (_req, res) => {
  const rows = await db.all('SELECT * FROM rsvp_log ORDER BY id DESC LIMIT 1000');
  res.json({ log: rows.map(logView) });
});

admin.get('/export.csv', async (_req, res) => {
  const households = await allHouseholds();
  const questions = content.getContent().rsvp.questions;
  const guestQs = questions.filter((q) => q.scope === 'guest');
  const houseQs = questions.filter((q) => q.scope === 'household');
  const status = (a) => (a === true ? 'Coming' : a === false ? 'Not coming' : 'No reply');
  const rows = [];
  for (const h of households) {
    for (const g of h.guests) {
      rows.push([
        h.name, g.name, g.isPlusOne ? 'Extra guest' : 'Invited', g.isChild ? 'Child' : 'Adult', status(g.attending),
        ...guestQs.map((q) => g.answers[q.id] || ''),
        ...houseQs.map((q) => h.answers[q.id] || ''),
        h.respondedAt || '', h.updatedAt || '', h.contactPhone, h.contactEmail, h.notes,
      ]);
    }
  }
  sendCsv(res, `rsvps-${rsvp.todayLondon()}.csv`, [
    'Family / group', 'Guest', 'Type', 'Age', 'Reply',
    ...guestQs.map((q) => q.label), ...houseQs.map((q) => q.label),
    'First replied (UTC)', 'Last changed (UTC)', 'Phone', 'Email', 'Notes',
  ], rows);
});

// ---------- admin: website content ----------

admin.put('/content/:section', async (req, res) => {
  const section = req.params.section;
  if (!content.SECTIONS.includes(section)) throw new HttpError(400, 'Unknown section.');
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new HttpError(400, 'Invalid content.');
  res.json(await content.saveSection(section, req.body));
});

admin.post('/content/:section/reset', async (req, res) => {
  if (!content.SECTIONS.includes(req.params.section)) throw new HttpError(400, 'Unknown section.');
  res.json(await content.resetSection(req.params.section));
});

const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, Boolean(IMAGE_TYPES[file.mimetype])),
});

admin.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Please choose a JPG, PNG, WebP or GIF photo (max 10 MB).');
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${IMAGE_TYPES[req.file.mimetype]}`;
  const url = await storage.save(name, req.file.buffer, req.file.mimetype);
  res.status(201).json({ url });
});

// ---------- admin: email updates ----------

admin.get('/notify', async (_req, res) => {
  res.json({ ...(await notifySettings()), email: email.status() });
});

admin.put('/notify', async (req, res) => {
  const list = (Array.isArray(req.body.recipients) ? req.body.recipients : []).map((e) => str(e, 200)).filter(Boolean);
  const bad = list.find((e) => !EMAIL_RE.test(e));
  if (bad) throw new HttpError(400, `"${bad}" doesn't look like an email address.`);
  if (list.length > 10) throw new HttpError(400, 'Up to 10 email addresses.');
  await setSetting('notify', { recipients: [...new Set(list)], onAdminEdit: Boolean(req.body.onAdminEdit) });
  res.json({ ...(await notifySettings()), email: email.status() });
});

admin.post('/notify/test', async (req, res) => {
  const { recipients } = await notifySettings();
  const site = content.getContent().site;
  try {
    await email.send({
      to: recipients,
      subject: 'Test: RSVP email updates are working',
      text: `This is a test from your ${site.eventTitle} website. When someone replies or changes their reply, you'll get an email like this at ${recipients.join(', ')}.\n\n${siteUrl(req)}/admin`,
      html: `<p style="font-family:Georgia,serif;font-size:17px">This is a test from your ${escHtml(site.eventTitle)} website. When someone replies or changes their reply, you'll get an email like this.</p>`,
      fromName: `${site.coupleNames} RSVPs`,
    });
  } catch (err) {
    throw new HttpError(400, err.message);
  }
  res.json({ ok: true, to: recipients });
});

// ---------- admin: accounts ----------

admin.get('/admins', async (_req, res) => {
  res.json({ admins: await db.all('SELECT id, email, name, created_at AS "createdAt" FROM admins ORDER BY id') });
});

admin.post('/admins', async (req, res) => {
  const emailAddr = str(req.body.email, 200);
  const name = str(req.body.name, 120);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!EMAIL_RE.test(emailAddr)) throw new HttpError(400, 'Please enter a valid email address.');
  if (password.length < 8) throw new HttpError(400, 'The password must be at least 8 characters.');
  try {
    await db.run('INSERT INTO admins (email, name, password_hash) VALUES (?, ?, ?)', emailAddr, name, auth.hashPassword(password));
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'There is already an admin with that email.');
    throw err;
  }
  res.status(201).json({ ok: true });
});

admin.delete('/admins/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.admin.id) throw new HttpError(400, "You can't remove your own account.");
  const r = await db.run('DELETE FROM admins WHERE id = ?', id);
  if (!r.changes) throw new HttpError(404, 'Admin not found.');
  res.json({ ok: true });
});

admin.post('/account', async (req, res) => {
  const name = str(req.body.name, 120);
  const current = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
  const next = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
  await db.run('UPDATE admins SET name = ? WHERE id = ?', name, req.admin.id);
  if (next) {
    const row = await db.get('SELECT password_hash FROM admins WHERE id = ?', req.admin.id);
    if (!auth.verifyPassword(current, row.password_hash)) throw new HttpError(400, 'Your current password is not right.');
    if (next.length < 8) throw new HttpError(400, 'The new password must be at least 8 characters.');
    await db.run('UPDATE admins SET password_hash = ? WHERE id = ?', auth.hashPassword(next), req.admin.id);
  }
  res.json({ ok: true });
});

admin.get('/backup', async (_req, res) => {
  const data = {
    exportedAt: new Date().toISOString(),
    content: content.getContent(),
    notify: await notifySettings(),
    households: await db.all('SELECT * FROM households ORDER BY id'),
    guests: await db.all('SELECT * FROM guests ORDER BY id'),
    log: await db.all('SELECT * FROM rsvp_log ORDER BY id'),
  };
  res.setHeader('Content-Disposition', `attachment; filename="rsvp-backup-${rsvp.todayLondon()}.json"`);
  res.json(data);
});

app.use('/api/admin', admin);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// ---------- files & pages ----------

app.use('/uploads', express.static(storage.UPLOAD_DIR, { maxAge: '30d', immutable: true }));
// Scripts and styles are revalidated on every load (cheap 304s via ETag), so
// after an update browsers never mix new and old files. Images cache for a day.
app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    setHeaders: (res, file) => {
      res.setHeader('Cache-Control', /\.(png|jpe?g|webp|gif|svg|ico)$/i.test(file) ? 'public, max-age=86400' : 'no-cache');
    },
  })
);

const indexTemplate = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');

app.get('/{*path}', (req, res) => {
  if (path.extname(req.path)) return res.status(404).send('Not found');
  const { site, home } = content.getContent();
  const html = indexTemplate
    .replaceAll('{{TITLE}}', escHtml(`${site.coupleNames} · ${site.eventTitle}`))
    .replaceAll('{{DESCRIPTION}}', escHtml(`${home.kicker} ${home.heading} ${home.subheading}`.trim()))
    .replaceAll('{{ACCENT}}', site.accentColor)
    .replaceAll('{{BACKGROUND}}', site.backgroundColor);
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(html);
});

// ---------- errors ----------

app.use((err, _req, res, _next) => {
  if (err instanceof HttpError || err instanceof rsvp.RsvpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That is too large to save.' });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Photos must be 10 MB or smaller.' : err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// ---------- first run ----------

async function ensureAdmin() {
  const existing = await db.get('SELECT id FROM admins WHERE lower(email) = lower(?)', ADMIN_EMAIL);
  const password = process.env.ADMIN_PASSWORD || '';
  if (existing) {
    if (process.env.ADMIN_PASSWORD_RESET && password) {
      await db.run('UPDATE admins SET password_hash = ? WHERE id = ?', auth.hashPassword(password), existing.id);
      await db.run('DELETE FROM auth_sessions WHERE admin_id = ?', existing.id);
      console.log(`Admin password for ${ADMIN_EMAIL} was reset from ADMIN_PASSWORD. Remove ADMIN_PASSWORD_RESET now.`);
    }
    return;
  }
  if ((await db.get('SELECT COUNT(*) AS n FROM admins')).n > 0) return;
  const initial = password || auth.generatePassword();
  await db.run('INSERT INTO admins (email, name, password_hash) VALUES (?, ?, ?)', ADMIN_EMAIL, 'Ravi', auth.hashPassword(initial));
  console.log('\n================ First run ================');
  console.log(' Admin account created');
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  if (!password) console.log(`   Password: ${initial}`);
  console.log(' Log in at /admin');
  console.log('===========================================\n');
}

// Connects to the database and loads the website content. Call before listening.
async function prepare() {
  // Render's free plan has no permanent disk: without a database URL every
  // RSVP would be lost on the next restart.
  if (process.env.RENDER && !DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Add your Supabase connection string in Render → Environment.');
  }
  await initDb();
  tokenSecret = await getSetting('tokenSecret', null);
  if (!tokenSecret) {
    tokenSecret = crypto.randomBytes(32).toString('hex');
    await setSetting('tokenSecret', tokenSecret);
  }
  await content.init();
  await storage.init();
  await ensureAdmin();
}

if (require.main === module) {
  prepare()
    .then(() => {
      console.log(`Database: ${db.kind === 'postgres' ? 'Postgres (DATABASE_URL)' : 'embedded Postgres in ' + DATA_DIR}`);
      console.log(`Photos: ${storage.describe()}`);
      console.log(`Email updates: ${email.status().provider || 'NOT SET UP (add RESEND_API_KEY or BREVO_API_KEY)'}`);
      app.listen(PORT, () => console.log(`RSVP website running on http://localhost:${PORT}`));
    })
    .catch((err) => {
      console.error(`\nCould not start: ${err.message}\n`);
      process.exit(1);
    });
}

module.exports = { app, prepare, composeEmail };
