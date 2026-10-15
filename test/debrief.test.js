'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-debrief-'));
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'admin-password';
process.env.PGLITE_DIR = 'memory';

const { app, prepare } = require('../server/index.js');
const { close: closeDb } = require('../server/db');

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

async function login(identifier, password) {
  const c = client();
  const r = await c('POST', '/api/auth/login', { identifier, password });
  assert.equal(r.status, 200);
  // Accounts created by staff accept the privacy policy at their first login.
  if (r.body.user.privacyRequired) await c('POST', '/api/me/privacy', { acceptPrivacy: true, ageGroup: '16plus' });
  return c;
}

test('teachers write a debrief after class; it is logged once per class with the pouch balance', async () => {
  const admin = await login('admin@test.local', 'admin-password');
  await admin('POST', '/api/staff/members', { name: 'Teacher Tej', email: 'tej@test.local', password: 'password1', role: 'instructor' });
  await admin('POST', '/api/staff/members', { name: 'Teacher Simi', email: 'simi@test.local', password: 'password1', role: 'instructor' });
  const student = await admin('POST', '/api/staff/members', { name: 'Student', email: 'student@test.local', password: 'password1' });

  const tej = await login('tej@test.local', 'password1');
  const { body: { session } } = await tej('POST', '/api/staff/sessions', { title: 'Adults Bhangra', date: '2026-10-08', start_time: '19:30' });
  await tej('POST', `/api/staff/sessions/${session.id}/attendance`, { code: student.body.member.memberId });

  const teachers = await tej('GET', '/api/staff/teachers');
  assert.deepEqual(teachers.body.teachers.map((t) => t.name).sort(), ['Academy Admin', 'Teacher Simi', 'Teacher Tej']);

  const pre = await tej('GET', `/api/staff/debriefs/prefill?session=${session.id}`);
  assert.equal(pre.body.scannedCount, 1);
  assert.equal(pre.body.existing, null);

  // Validation: every required field is checked.
  const good = { sessionId: session.id, classDate: '2026-10-08', ranBy: ['Teacher Tej', 'Teacher Simi'], attendeeCount: 14, pouchBalance: '£1,125.5', feedback: 'Great energy. Two new starters.' };
  for (const [field, value, message] of [['ranBy', [], /who ran/], ['classDate', '8/10', /date/], ['attendeeCount', 2.5, /whole number/], ['pouchBalance', 'lots', /pouch balance/], ['pouchBalance', '-5', /pouch balance/]]) {
    const r = await tej('POST', '/api/staff/debriefs', { ...good, [field]: value });
    assert.equal(r.status, 400, field);
    assert.match(r.body.error, message);
  }

  const created = await tej('POST', '/api/staff/debriefs', good);
  assert.equal(created.status, 201);
  const d = created.body.debrief;
  assert.equal(d.pouchBalancePence, 112550);
  assert.equal(d.ranBy, 'Teacher Tej, Teacher Simi');
  assert.equal(d.classTitle, 'Adults Bhangra', 'class name comes from the session');
  assert.equal(d.submittedByName, 'Teacher Tej');

  const dup = await tej('POST', '/api/staff/debriefs', good);
  assert.equal(dup.status, 409, 'only one debrief per class');
  const pre2 = await tej('GET', `/api/staff/debriefs/prefill?session=${session.id}`);
  assert.equal(pre2.body.existing.id, d.id);
  assert.equal(pre2.body.lastBalance.pence, 112550);

  // Another teacher cannot change it; the author and admins can.
  const simi = await login('simi@test.local', 'password1');
  assert.equal((await simi('PATCH', `/api/staff/debriefs/${d.id}`, { ...good, attendeeCount: 1 })).status, 403);
  const edited = await tej('PATCH', `/api/staff/debriefs/${d.id}`, { ...good, attendeeCount: 15 });
  assert.equal(edited.body.debrief.attendeeCount, 15);
  assert.equal((await admin('PATCH', `/api/staff/debriefs/${d.id}`, { ...good, pouchBalance: '120' })).body.debrief.pouchBalancePence, 12000);

  // Only admins delete; members can't see debriefs at all.
  assert.equal((await tej('DELETE', `/api/staff/debriefs/${d.id}`)).status, 403);
  const member = await login('student@test.local', 'password1');
  assert.equal((await member('GET', '/api/staff/debriefs')).status, 403);

  const csv = await admin('GET', '/api/staff/debriefs.csv');
  assert.match(csv.body, /"2026-10-08","Adults Bhangra","Teacher Tej, Teacher Simi","14","120.00","Great energy\. Two new starters\."/);

  const list = await simi('GET', '/api/staff/debriefs');
  assert.equal(list.body.debriefs.length, 1);
  assert.equal((await admin('DELETE', `/api/staff/debriefs/${d.id}`)).status, 200);
});

test('a debrief can be written for a class that had no scanning session', async () => {
  const admin = await login('admin@test.local', 'admin-password');
  const r = await admin('POST', '/api/staff/debriefs', { classTitle: 'Workshop', classDate: '2026-10-09', ranBy: 'Guest teacher', attendeeCount: 0, pouchBalance: '0' });
  assert.equal(r.status, 201);
  assert.equal(r.body.debrief.sessionId, null);
  assert.equal(r.body.debrief.pouchBalancePence, 0);
});
