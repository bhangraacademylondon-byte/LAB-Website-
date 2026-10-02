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

test('members can add a bio at sign-up and edit it later; monthly stats are returned', async () => {
  const member = client();
  const reg = await member('POST', '/api/auth/register', { name: 'Bio Person', email: 'bio@test.local', password: 'password1', bio: 'Danced giddha for 3 years' });
  assert.equal(reg.body.user.bio, 'Danced giddha for 3 years');
  const upd = await member('PATCH', '/api/me', { name: 'Bio Person', phone: '', bio: 'Now learning dhol too' });
  assert.equal(upd.body.user.bio, 'Now learning dhol too');
  const me = await member('GET', '/api/me');
  assert.equal(me.body.user.bio, 'Now learning dhol too');
  assert.equal(me.body.stats.monthly.length, 6);

  const admin = client();
  await admin('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' });
  const detail = await admin('GET', `/api/staff/members/${reg.body.user.id}`);
  assert.equal(detail.body.member.bio, 'Now learning dhol too');
});

test('online registration can be switched off from the member pages content', async () => {
  const admin = client();
  await admin('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' });
  const { body: content } = await admin('GET', '/api/content');
  content.members.allowRegistration = false;
  await admin('PUT', '/api/admin/content', content);
  const res = await client()('POST', '/api/auth/register', { name: 'Late', email: 'late@test.local', password: 'password1' });
  assert.equal(res.status, 403);
  content.members.allowRegistration = true;
  await admin('PUT', '/api/admin/content', content);
});

test('gallery serves live posts from a Behold feed', async () => {
  const realFetch = global.fetch;
  let calls = 0;
  global.fetch = async (url, opts) => {
    if (String(url).startsWith('https://feeds.behold.so/')) {
      calls++;
      return new Response(JSON.stringify({
        username: 'londonacademyofbhangra',
        posts: [
          { id: '1', mediaType: 'IMAGE', mediaUrl: 'https://cdn.example/1.jpg', permalink: 'https://www.instagram.com/p/1/', caption: 'Thursday class!', timestamp: '2026-10-01T19:00:00Z', sizes: { medium: { mediaUrl: 'https://behold.example/1-m.jpg' } } },
          { id: '2', mediaType: 'VIDEO', mediaUrl: 'https://cdn.example/2.mp4', thumbnailUrl: 'https://cdn.example/2.jpg', permalink: 'https://www.instagram.com/reel/2/', caption: 'Performance', timestamp: '2026-09-28T19:00:00Z' },
          { id: '3', mediaType: 'CAROUSEL_ALBUM', mediaUrl: 'https://cdn.example/3.jpg', permalink: 'https://www.instagram.com/p/3/', children: [{ mediaType: 'IMAGE', mediaUrl: 'https://cdn.example/3a.jpg' }, { mediaType: 'IMAGE', mediaUrl: 'https://cdn.example/3b.jpg' }] },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(url, opts);
  };
  try {
    const admin = client();
    await admin('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' });
    const bad = await admin('POST', '/api/admin/instagram', { beholdUrl: 'https://evil.example/feed' });
    assert.equal(bad.status, 400);
    const ok = await admin('POST', '/api/admin/instagram', { beholdUrl: 'https://feeds.behold.so/abc123' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.provider, 'behold');
    assert.equal(ok.body.username, 'londonacademyofbhangra');

    const feed = await client()('GET', '/api/instagram');
    assert.equal(feed.body.configured, true);
    assert.equal(feed.body.posts.length, 3);
    assert.equal(feed.body.posts[0].image, 'https://behold.example/1-m.jpg');
    assert.equal(feed.body.posts[1].video, 'https://cdn.example/2.mp4');
    assert.equal(feed.body.posts[1].image, 'https://cdn.example/2.jpg');
    assert.equal(feed.body.posts[2].children.length, 2);
    const before = calls;
    await client()('GET', '/api/instagram');
    assert.equal(calls, before, 'second request is served from the cache');
    await admin('DELETE', '/api/admin/instagram');
  } finally {
    global.fetch = realFetch;
  }
});
