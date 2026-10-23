'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-test-'));
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'admin-password';
process.env.PGLITE_DIR = 'memory';

const { app, prepare } = require('../server/index.js');
const { db, close: closeDb } = require('../server/db');
const { source, device } = require('../server/visitors');

const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1';
let server;
let base;

before(async () => {
  await prepare();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  server.close();
  await closeDb();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

const id = () => require('node:crypto').randomBytes(12).toString('hex');

async function post(url, body, { ua = PHONE, cookie = '', headers = {} } = {}) {
  return fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-LAB-CSRF': '1', 'User-Agent': ua, ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: JSON.stringify(body),
  });
}

async function adminCookie() {
  const res = await post('/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' });
  assert.equal(res.status, 200);
  return res.headers.get('set-cookie').split(';')[0];
}

test('works out where a visit came from', () => {
  assert.equal(source('https://l.instagram.com/?u=x', '', 'lab.org'), 'Instagram');
  assert.equal(source('https://www.google.co.uk/', '', 'lab.org'), 'Google search');
  assert.equal(source('https://lm.facebook.com/', '', 'lab.org'), 'Facebook');
  assert.equal(source('', '', 'lab.org'), 'Typed in or saved link');
  assert.equal(source('https://lab.org/about', '', 'lab.org'), 'Typed in or saved link');
  assert.equal(source('', 'whatsapp', 'lab.org'), 'WhatsApp');
  assert.equal(source('https://example.com/', '', 'lab.org'), 'Other sites');
});

test('tells phones, tablets and computers apart', () => {
  assert.equal(device(PHONE), 'phone');
  assert.equal(device('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'tablet');
  assert.equal(device('Mozilla/5.0 (Linux; Android 14; SM-X700)'), 'tablet');
  assert.equal(device('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130'), 'computer');
});

test('counts a visit, its time on the page and a button press, without setting cookies', async () => {
  const view = id();
  const res = await post('/api/v', { id: view, path: '/timetable', landing: true, ref: 'https://l.instagram.com/' });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal((await post('/api/v/time', { id: view, seconds: 75 })).status, 204);
  assert.equal((await post('/api/v/time', { id: view, seconds: 9999 })).status, 204);
  assert.equal((await post('/api/v/event', { name: 'directions', path: '/timetable' })).status, 204);

  const row = await db.get('SELECT * FROM page_views WHERE view_id = ?', view);
  assert.equal(row.path, '/timetable');
  assert.equal(row.source, 'Instagram');
  assert.equal(row.device, 'phone');
  assert.equal(row.seconds, 1800, 'time on a page is capped at 30 minutes');
  assert.match(row.visitor, /^[a-f0-9]{32}$/);
  assert.equal((await db.get("SELECT COUNT(*)::int AS n FROM site_events WHERE name = 'directions'")).n, 1);
});

test('keeps no IP address or browser details', async () => {
  const cols = (await db.all("SELECT column_name FROM information_schema.columns WHERE table_name IN ('page_views', 'site_events')")).map((c) => c.column_name);
  for (const bad of ['ip', 'user_agent', 'ua', 'email', 'user_id']) assert.ok(!cols.includes(bad), `no ${bad} column`);
});

test('the same visitor gets the same code within a day, and a different browser a different one', async () => {
  const a = id();
  const b = id();
  const c = id();
  await post('/api/v', { id: a, path: '/' });
  await post('/api/v', { id: b, path: '/about' });
  await post('/api/v', { id: c, path: '/' }, { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130' });
  const code = async (v) => (await db.get('SELECT visitor FROM page_views WHERE view_id = ?', v)).visitor;
  assert.equal(await code(a), await code(b));
  assert.notEqual(await code(a), await code(c));
});

test('leaves out bots, "do not track", admin pages, bad input and admin visits', async () => {
  const before = (await db.get('SELECT COUNT(*)::int AS n FROM page_views')).n;
  await post('/api/v', { id: id(), path: '/' }, { ua: 'Googlebot/2.1 (+http://www.google.com/bot.html)' });
  await post('/api/v', { id: id(), path: '/' }, { headers: { 'Sec-GPC': '1' } });
  await post('/api/v', { id: id(), path: '/admin/members' });
  await post('/api/v', { id: id(), path: 'https://evil.example/' });
  await post('/api/v', { id: 'not-an-id', path: '/' });
  await post('/api/v', { id: id(), path: '/' }, { cookie: await adminCookie() });
  assert.equal((await db.get('SELECT COUNT(*)::int AS n FROM page_views')).n, before);
  assert.equal((await post('/api/v/event', { name: 'anything', path: '/' })).status, 204);
  assert.equal((await db.get("SELECT COUNT(*)::int AS n FROM site_events WHERE name = 'anything'")).n, 0);
});

test('a request without the site header is refused', async () => {
  const res = await fetch(`${base}/api/v`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id(), path: '/' }) });
  assert.equal(res.status, 403);
});

test('only admins can see the figures', async () => {
  assert.equal((await fetch(`${base}/api/admin/visitors`)).status, 401);
  const cookie = await adminCookie();
  const res = await fetch(`${base}/api/admin/visitors?range=7`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const v = await res.json();
  assert.equal(v.series.length, 7, 'one bar for each day, including empty ones');
  assert.ok(v.now.views >= 4);
  assert.ok(v.now.people >= 2);
  assert.ok(v.pages.some((p) => p.path === '/timetable'));
  assert.deepEqual(v.sources.find((s) => s.label === 'Instagram')?.n, 1);
  assert.equal(v.events.directions, 1);
  const year = await (await fetch(`${base}/api/admin/visitors?range=365`, { headers: { Cookie: cookie } })).json();
  assert.equal(year.series.length, 12, 'one bar for each month');
  const csv = await fetch(`${base}/api/admin/visitors.csv?range=30`, { headers: { Cookie: cookie } });
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(await csv.text(), /"Date","People","Pages viewed"/);
});

test('figures older than 13 months are deleted', async () => {
  await db.run("INSERT INTO page_views (view_id, day, visitor, path, device) VALUES ('old-view-0000000000', '2020-01-01', 'x', '/', 'phone')");
  await require('../server/visitors').prune();
  assert.equal(await db.get("SELECT 1 FROM page_views WHERE view_id = 'old-view-0000000000'"), undefined);
});
