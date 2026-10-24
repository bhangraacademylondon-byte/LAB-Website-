'use strict';

// Visitor statistics without cookies. Nothing is stored on the visitor's
// device. A visitor is recognised for one day only, by a hash of their
// connection and browser mixed with a random value that is replaced every
// day (and the old one thrown away), so nobody can be followed from one day
// to the next. Figures older than 13 months are deleted.

const crypto = require('node:crypto');
const { db, getSetting, setSetting } = require('./db');

const KEEP_MONTHS = 13;
const EVENTS = ['directions', 'calendar', 'call', 'whatsapp', 'join', 'instagram', 'contact'];
const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp\/|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|node-fetch|axios|go-http/i;

const londonDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

let salt = null; // { day, value }
async function dailySalt() {
  const day = londonDay();
  if (salt?.day === day) return salt.value;
  const saved = await getSetting('visitor_salt');
  if (saved?.day === day) {
    salt = saved;
  } else {
    // A new day: a fresh random value, and the old one is gone for good.
    salt = { day, value: crypto.randomBytes(32).toString('hex') };
    await setSetting('visitor_salt', salt);
    await prune();
  }
  return salt.value;
}

async function prune() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - KEEP_MONTHS);
  const day = londonDay(cutoff);
  await db.run('DELETE FROM page_views WHERE day < ?', day);
  await db.run('DELETE FROM site_events WHERE day < ?', day);
}

async function visitorId(req) {
  const value = await dailySalt();
  return crypto.createHash('sha256').update(`${value}|${req.ip}|${req.get('user-agent') || ''}`).digest('hex').slice(0, 32);
}

function device(ua) {
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return 'phone';
  return 'computer';
}

// Where a visit came from: a tag on the link (?utm_source=whatsapp), or the referring site.
function source(ref, tag, ownHost) {
  const t = String(tag || '').toLowerCase();
  if (t) {
    if (/insta|^ig$/.test(t)) return 'Instagram';
    if (/whats|^wa$/.test(t)) return 'WhatsApp';
    if (/face|^fb$/.test(t)) return 'Facebook';
    if (/google/.test(t)) return 'Google search';
    if (/tiktok/.test(t)) return 'TikTok';
    return 'Other sites';
  }
  let host = '';
  try {
    host = new URL(ref).hostname.replace(/^www\./, '');
  } catch {
    return 'Typed in or saved link';
  }
  if (!host || host === ownHost) return 'Typed in or saved link';
  if (/(^|\.)instagram\.com$/.test(host)) return 'Instagram';
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(host)) return 'Facebook';
  if (/(^|\.)whatsapp\.(com|net)$|^wa\.me$/.test(host)) return 'WhatsApp';
  if (/(^|\.)google\./.test(host)) return 'Google search';
  if (/(^|\.)tiktok\.com$/.test(host)) return 'TikTok';
  if (/(^|\.)(bing\.com|duckduckgo\.com|yahoo\.com|ecosia\.org)$/.test(host)) return 'Other search engines';
  return 'Other sites';
}

const cleanPath = (p) => {
  const path = String(p || '').split(/[?#]/)[0].slice(0, 120);
  return /^\/[\w\-/]*$/.test(path) ? path.replace(/(.)\/+$/, '$1') : null;
};
const cleanId = (id) => (/^[a-f0-9]{16,40}$/.test(String(id || '')) ? String(id) : null);

// Admin and teacher visits are left out, as are bots and browsers asking not to be tracked.
function counted(req) {
  if (req.user && req.user.role !== 'member') return false;
  if (req.get('sec-gpc') === '1' || req.get('dnt') === '1') return false;
  return !BOTS.test(req.get('user-agent') || '');
}

async function recordView(req, body) {
  if (!counted(req)) return;
  const path = cleanPath(body.path);
  const id = cleanId(body.id);
  if (!path || !id || path.startsWith('/admin')) return;
  const ua = req.get('user-agent') || '';
  const from = body.landing ? source(body.ref, body.tag, req.hostname) : null;
  await db.run(
    'INSERT INTO page_views (view_id, day, visitor, path, source, device) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (view_id) DO NOTHING',
    id, londonDay(), await visitorId(req), path, from, device(ua)
  );
}

// Time on the page, sent when the visitor leaves it. Only ever raised, and capped at 30 minutes.
async function recordTime(req, body) {
  const id = cleanId(body.id);
  const seconds = Math.min(1800, Math.max(0, Math.round(Number(body.seconds) || 0)));
  if (!id || !seconds) return;
  await db.run('UPDATE page_views SET seconds = GREATEST(seconds, ?) WHERE view_id = ? AND visitor = ?', seconds, id, await visitorId(req));
}

async function recordEvent(req, body) {
  if (!counted(req) || !EVENTS.includes(body.name)) return;
  await db.run('INSERT INTO site_events (day, visitor, name, path) VALUES (?, ?, ?, ?)', londonDay(), await visitorId(req), body.name, cleanPath(body.path));
}

// ---------- the summary shown in Admin ----------

const RANGES = { 7: 7, 30: 30, 365: 365 };

function span(days, back = 0) {
  const end = new Date();
  end.setDate(end.getDate() - back * days);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return [londonDay(start), londonDay(end)];
}

async function totals(from, to) {
  const t = await db.get(
    `SELECT COUNT(*)::int AS views, COUNT(DISTINCT day || visitor)::int AS people FROM page_views WHERE day BETWEEN ? AND ?`,
    from, to
  );
  const visit = await db.get(
    `SELECT COALESCE(ROUND(AVG(s)), 0)::int AS seconds FROM (SELECT SUM(seconds) AS s FROM page_views WHERE day BETWEEN ? AND ? GROUP BY day, visitor) v`,
    from, to
  );
  const joined = await db.get(
    `SELECT COUNT(*)::int AS n FROM users WHERE role = 'member' AND substr(created_at, 1, 10) BETWEEN ? AND ?`,
    from, to
  );
  return { views: t.views, people: t.people, visitSeconds: visit.seconds, joined: joined.n };
}

async function summary(rangeDays) {
  const days = RANGES[rangeDays] || 30;
  const [from, to] = span(days);
  const [pFrom, pTo] = span(days, 1);
  const byMonth = days === 365;
  const bucket = byMonth ? 'substr(day, 1, 7)' : 'day';
  const series = await db.all(
    `SELECT ${bucket} AS k, COUNT(DISTINCT day || visitor)::int AS people, COUNT(*)::int AS views FROM page_views WHERE day BETWEEN ? AND ? GROUP BY k ORDER BY k`,
    from, to
  );
  // Every day (or month) in the range gets a bar, including ones nobody visited.
  const keys = [];
  for (let i = byMonth ? 11 : days - 1; i >= 0; i--) {
    const d = new Date();
    if (byMonth) {
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
    } else {
      d.setDate(d.getDate() - i);
    }
    keys.push(byMonth ? londonDay(d).slice(0, 7) : londonDay(d));
  }
  const found = new Map(series.map((r) => [r.k, r]));
  const filled = keys.map((k) => found.get(k) || { k, people: 0, views: 0 });
  const pages = await db.all(
    `SELECT path, COUNT(*)::int AS views, COUNT(DISTINCT day || visitor)::int AS people,
            COALESCE(ROUND(AVG(NULLIF(seconds, 0))), 0)::int AS seconds
       FROM page_views WHERE day BETWEEN ? AND ? GROUP BY path ORDER BY views DESC, path LIMIT 12`,
    from, to
  );
  const sources = await db.all(
    `SELECT source AS label, COUNT(DISTINCT day || visitor)::int AS n FROM page_views
      WHERE day BETWEEN ? AND ? AND source IS NOT NULL GROUP BY source ORDER BY n DESC, source`,
    from, to
  );
  const devices = await db.all(
    `SELECT device AS label, COUNT(DISTINCT day || visitor)::int AS n FROM page_views
      WHERE day BETWEEN ? AND ? GROUP BY device ORDER BY n DESC, device`,
    from, to
  );
  const weekdays = await db.all(
    `SELECT EXTRACT(ISODOW FROM day::date)::int AS dow, COUNT(DISTINCT day || visitor)::int AS n FROM page_views
      WHERE day BETWEEN ? AND ? GROUP BY dow ORDER BY dow`,
    from, to
  );
  const events = await db.all(
    'SELECT name, COUNT(*)::int AS n FROM site_events WHERE day BETWEEN ? AND ? GROUP BY name',
    from, to
  );
  // A comparison is only fair if counting had started by the beginning of the earlier period.
  const first = (await db.get('SELECT MIN(day) AS day FROM page_views'))?.day;
  return {
    range: days, from, to, byMonth, comparable: Boolean(first && first <= pFrom),
    now: await totals(from, to),
    before: await totals(pFrom, pTo),
    series: filled, pages, sources, devices, weekdays,
    events: Object.fromEntries(events.map((e) => [e.name, e.n])),
  };
}

module.exports = { recordView, recordTime, recordEvent, summary, prune, londonDay, source, device, EVENTS };
