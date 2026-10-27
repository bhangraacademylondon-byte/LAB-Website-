'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-timeline-'));
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'admin-password';
process.env.PGLITE_DIR = 'memory';
process.env.LAB_TEST_SKIP_TWO_STEP = '1';

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
  const call = async (method, url, body, form) => {
    const headers = { 'X-LAB-CSRF': '1' };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + url, { method, headers, body: form || (body === undefined ? undefined : JSON.stringify(body)) });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
  };
  return call;
}

const png = () => {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000000000500010d0a2db40000000049454e44ae426082', 'hex')], { type: 'image/png' }), 'dot.png');
  return form;
};

test('an admin can let one teacher edit Our journey, and nothing else on the site', async () => {
  const admin = client();
  await admin('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' });
  const made = await admin('POST', '/api/staff/members', { name: 'Teacher Simrit', email: 'simrit@test.local', password: 'Password-test-1!', role: 'instructor' });
  const id = made.body.member.id;
  const teacher = client();
  await teacher('POST', '/api/auth/login', { identifier: 'simrit@test.local', password: 'Password-test-1!' });
  await teacher('POST', '/api/me/privacy', { acceptPrivacy: true, ageGroup: '16plus' });

  const timeline = (await teacher('GET', '/api/content')).body.timeline;
  const edited = { ...timeline, title: 'Our story so far' };

  // Not allowed until an admin ticks the box.
  assert.equal((await teacher('GET', '/api/me')).body.user.canEditTimeline, false);
  assert.equal((await teacher('PUT', '/api/staff/content/timeline', { value: edited })).status, 403);
  assert.equal((await teacher('POST', '/api/staff/upload', undefined, png())).status, 403);

  const granted = await admin('PATCH', `/api/admin/members/${id}`, { canEditTimeline: true });
  assert.equal(granted.status, 200);
  assert.equal(granted.body.member.canEditTimeline, true);
  assert.equal((await admin('GET', `/api/staff/members/${id}`)).body.member.canEditTimeline, true);
  assert.equal((await teacher('GET', '/api/me')).body.user.canEditTimeline, true);

  const saved = await teacher('PUT', '/api/staff/content/timeline', { value: edited });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.timeline.title, 'Our story so far');
  assert.equal((await teacher('POST', '/api/staff/upload', undefined, png())).status, 201, 'can add photos to milestones');

  // Everything else stays admin-only.
  const about = (await teacher('GET', '/api/content')).body.about;
  assert.equal((await teacher('PUT', '/api/admin/content/about', { value: { ...about, title: 'Hacked' } })).status, 403);
  assert.equal((await teacher('PUT', '/api/admin/content/timeline', { value: edited })).status, 403);
  assert.equal((await teacher('PUT', '/api/staff/content/about', { value: about })).status, 404);
  assert.equal((await teacher('POST', '/api/admin/upload', undefined, png())).status, 403);

  // Taking the tick away, or making them a member, removes it.
  await admin('PATCH', `/api/admin/members/${id}`, { canEditTimeline: false });
  assert.equal((await teacher('PUT', '/api/staff/content/timeline', { value: edited })).status, 403);
  await admin('PATCH', `/api/admin/members/${id}`, { canEditTimeline: true });
  await admin('PATCH', `/api/admin/members/${id}`, { role: 'member' });
  await admin('PATCH', `/api/admin/members/${id}`, { role: 'instructor' });
  assert.equal((await admin('GET', `/api/staff/members/${id}`)).body.member.canEditTimeline, false, 'not restored by changing role back');
});

test('teachers see names, member IDs and emergency contacts only, and search by name or ID', async () => {
  const admin = client();
  await admin('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' });
  await admin('POST', '/api/staff/members', { name: 'Private Person', email: 'private@test.local', phone: '07700 111222', notes: 'staff note', password: 'Password-test-1!' });
  await admin('POST', '/api/staff/members', { name: 'Little One', email: 'little@test.local', password: 'Password-test-1!', under16: true, guardianName: 'Mum', guardianEmail: 'mum@test.local', guardianPhone: '07700 333444' });
  await admin('POST', '/api/staff/members', { name: 'Teacher Viewer', email: 'viewer@test.local', password: 'Password-test-1!', role: 'instructor' });
  const t = client();
  await t('POST', '/api/auth/login', { identifier: 'viewer@test.local', password: 'Password-test-1!' });
  await t('POST', '/api/me/privacy', { acceptPrivacy: true });

  const all = (await t('GET', '/api/staff/members')).body.members;
  const p = all.find((m) => m.name === 'Private Person');
  assert.equal(p.email, '');
  assert.equal(p.phone, '');
  assert.equal(p.notes, '');
  assert.equal(JSON.stringify(all).includes('private@test.local'), false);
  const kid = all.find((m) => m.name === 'Little One');
  assert.equal(kid.guardianPhone, '07700 333444', 'emergency contact for under-16s');
  assert.equal(kid.guardianEmail, '');

  assert.equal((await t('GET', '/api/staff/members?q=private%40test')).body.members.length, 0, 'no searching by email');
  assert.equal((await t('GET', '/api/staff/members?q=Private')).body.members.length, 1);
  assert.equal((await admin('GET', '/api/staff/members?q=private%40test')).body.members.length, 1, 'admins can');
  assert.equal((await admin('GET', `/api/staff/members/${p.id}`)).body.member.email, 'private@test.local');
});
