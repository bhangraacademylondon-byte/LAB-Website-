'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-test-'));
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'admin-password';

const { app, ensureAdmin, extractMemberId } = require('../server/index.js');

let server;
let base;

before(async () => {
  ensureAdmin();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const headers = { 'X-LAB-CSRF': '1' };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
  };
}

test('extractMemberId accepts IDs with or without a dash and in lowercase', () => {
  assert.equal(extractMemberId('lab-abc234'), 'LAB-ABC234');
  assert.equal(extractMemberId('LABABC234'), 'LAB-ABC234');
  assert.equal(extractMemberId('hello'), null);
});

test('mutating requests without the CSRF header are rejected', async () => {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
});

test('member registers, gets an ID, and is scanned into a session', async () => {
  const member = client();
  const reg = await member('POST', '/api/auth/register', { name: 'Simran', email: 'simran@test.local', password: 'password1' });
  assert.equal(reg.status, 201);
  assert.match(reg.body.user.memberId, /^LAB-[2-9A-HJ-NP-Z]{6}$/);

  const forbidden = await member('GET', '/api/staff/stats');
  assert.equal(forbidden.status, 403);

  const admin = client();
  assert.equal((await admin('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' })).status, 200);

  const { body: { session } } = await admin('POST', '/api/staff/sessions', { title: 'Adults', date: '2026-01-08', start_time: '19:30' });
  const again = await admin('POST', '/api/staff/sessions', { title: 'Adults', date: '2026-01-08', start_time: '19:30' });
  assert.equal(again.body.session.id, session.id, 'same class and date reuses the session');

  const first = await admin('POST', `/api/staff/sessions/${session.id}/attendance`, { code: reg.body.user.memberId });
  assert.equal(first.body.status, 'recorded');
  const second = await admin('POST', `/api/staff/sessions/${session.id}/attendance`, { code: reg.body.user.memberId.toLowerCase() });
  assert.equal(second.body.status, 'already');

  const mine = await member('GET', '/api/me/attendance');
  assert.equal(mine.body.stats.total, 1);
  assert.equal(mine.body.attendance[0].title, 'Adults');
});

test('deactivated members cannot be checked in or log in', async () => {
  const admin = client();
  await admin('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' });
  const { body } = await admin('POST', '/api/staff/members', { name: 'Old Member', email: 'old@test.local', password: 'password1' });
  await admin('PATCH', `/api/admin/members/${body.member.id}`, { active: false });
  const { body: { session } } = await admin('POST', '/api/staff/sessions', { title: 'Kids', date: '2026-01-08' });
  const scan = await admin('POST', `/api/staff/sessions/${session.id}/attendance`, { code: body.member.memberId });
  assert.equal(scan.status, 403);
  const login = await client()('POST', '/api/auth/login', { identifier: 'old@test.local', password: 'password1' });
  assert.equal(login.status, 403);
});

test('instructors cannot edit content or create admins', async () => {
  const admin = client();
  await admin('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' });
  await admin('POST', '/api/staff/members', { name: 'Teacher', email: 'teacher@test.local', password: 'password1', role: 'instructor' });

  const teacher = client();
  await teacher('POST', '/api/auth/login', { identifier: 'teacher@test.local', password: 'password1' });
  assert.equal((await teacher('PUT', '/api/admin/content', {})).status, 403);
  const created = await teacher('POST', '/api/staff/members', { name: 'Sneaky', role: 'admin' });
  assert.equal(created.body.member.role, 'member');
});

test('admin content edits are saved and merged with defaults', async () => {
  const admin = client();
  await admin('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' });
  const { body: content } = await admin('GET', '/api/content');
  content.home.heroTitle = 'Hello LAB';
  content.customPages = [{ title: 'Performances', body: 'Book us!' }];
  delete content.pricing;
  const saved = await admin('PUT', '/api/admin/content', content);
  assert.equal(saved.body.home.heroTitle, 'Hello LAB');
  assert.ok(saved.body.pricing.plans.length > 0, 'missing sections fall back to defaults');
  assert.equal(saved.body.customPages[0].slug, 'performances');
  assert.ok(saved.body.nav.some((n) => n.id === 'page:performances'));

  const page = await fetch(`${base}/p/performances`);
  assert.equal(page.status, 200);
});

test('member responses never include staff notes', async () => {
  const admin = client();
  await admin('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' });
  await admin('POST', '/api/staff/members', { name: 'Noted', email: 'noted@test.local', password: 'password1', notes: 'secret' });
  const member = client();
  const login = await member('POST', '/api/auth/login', { identifier: 'noted@test.local', password: 'password1' });
  assert.equal(login.body.user.notes, undefined);
});
