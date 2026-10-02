'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-review-'));
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'admin-password';

const { app, ensureAdmin } = require('../server/index.js');

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
    return { status: res.status, headers: res.headers, body: type.includes('json') ? await res.json() : await res.text() };
  };
}

test('members whose email contains a member-ID-like string can still log in by email', async () => {
  const email = 'slab234567@test.local';
  const reg = await client()('POST', '/api/auth/register', { name: 'Slab', email, password: 'password1' });
  assert.equal(reg.status, 201);
  const login = await client()('POST', '/api/auth/login', { identifier: email, password: 'password1' });
  assert.equal(login.status, 200);
});

test('content saved with the wrong shape does not break the site or the scanner', async () => {
  const admin = client();
  await admin('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' });
  const { body: content } = await admin('GET', '/api/content');
  const saved = await admin('PUT', '/api/admin/content', { ...content, timetable: { ...content.timetable, classes: 'oops' }, home: { ...content.home, highlights: [null, { title: 'ok' }] } });
  assert.ok(Array.isArray(saved.body.timetable.classes));
  assert.deepEqual(saved.body.home.highlights.map((h) => h.title), ['ok']);
  const today = await admin('GET', '/api/staff/today');
  assert.equal(today.status, 200);
});

test('scripts and styles are revalidated so updates are never mixed with stale files', async () => {
  const res = await fetch(`${base}/js/app.js`);
  assert.match(res.headers.get('cache-control') || '', /no-cache/);
});

test('sign-ups are rate limited per address', async () => {
  let last;
  for (let i = 0; i < 12; i++) {
    last = await client()('POST', '/api/auth/register', { name: `Spam ${i}`, email: `spam${i}@test.local`, password: 'password1' });
  }
  assert.equal(last.status, 429);
});

test('a Behold feed is used even when a server token is set, and failures back off', async () => {
  process.env.INSTAGRAM_ACCESS_TOKEN = 'env-token';
  const realFetch = global.fetch;
  let beholdCalls = 0;
  let failing = false;
  global.fetch = async (url, opts) => {
    if (String(url).startsWith('https://graph.instagram.com')) throw new Error('graph should not be called');
    if (String(url).startsWith('https://feeds.behold.so/')) {
      beholdCalls++;
      if (failing) return new Response('down', { status: 503 });
      return new Response(JSON.stringify([{ id: '1', mediaType: 'IMAGE', mediaUrl: 'https://cdn.example/1.jpg', permalink: 'https://www.instagram.com/p/1/' }]), { headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(url, opts);
  };
  try {
    const admin = client();
    await admin('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' });
    const set = await admin('POST', '/api/admin/instagram', { beholdUrl: 'https://feeds.behold.so/xyz' });
    assert.equal(set.body.provider, 'behold');
    assert.equal((await client()('GET', '/api/instagram')).body.posts.length, 1);

    failing = true;
    const forced = await admin('POST', '/api/admin/instagram/refresh');
    assert.match(forced.body.lastError, /503/);
    assert.equal(forced.body.postCount, 1, 'last good posts are kept when Instagram is down');
    const before = beholdCalls;
    await client()('GET', '/api/instagram');
    await client()('GET', '/api/instagram');
    assert.equal(beholdCalls, before, 'no retries during the back-off period');
  } finally {
    global.fetch = realFetch;
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
  }
});
