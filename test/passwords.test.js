'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-passwords-'));
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'admin-password';
process.env.PGLITE_DIR = 'memory';
process.env.LAB_TEST_SKIP_TWO_STEP = '1';

const { app, prepare } = require('../server/index.js');
const { db, close: closeDb } = require('../server/db');
const auth = require('../server/auth');

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

function client(ip) {
  let cookie = '';
  return async (method, url, body) => {
    const headers = { 'X-LAB-CSRF': '1' };
    if (ip) headers['X-Forwarded-For'] = ip;
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
  };
}

test('passwords need 12+ characters and a special character', () => {
  assert.match(auth.passwordProblem('Short-1!'), /12 characters/);
  assert.match(auth.passwordProblem('LongButPlain123'), /special character/);
  assert.match(auth.passwordProblem('password123!'), /too easy/);
  assert.equal(auth.passwordProblem('Dhol-practice-2026!'), '');
  for (let i = 0; i < 20; i++) assert.equal(auth.passwordProblem(auth.generatePassword()), '', 'generated passwords meet the rules');
});

test('sign-up refuses a weak password', async () => {
  const r = await client()('POST', '/api/auth/register', { name: 'Weak', email: 'weak@test.local', password: 'password1', acceptPrivacy: true, ageGroup: '16plus' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /12 characters/);
});

test('someone with an old, weak password must change it before doing anything else', async () => {
  const hash = await auth.hashPassword('Teacher1');
  await db.run("INSERT INTO users (member_id, name, email, password_hash, role, privacy_version) VALUES ('LAB-WEAK22', 'Old Teacher', 'old@test.local', ?, 'instructor', '2026-01')", hash);
  const c = client();
  const login = await c('POST', '/api/auth/login', { identifier: 'old@test.local', password: 'Teacher1' });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.mustChangePassword, true);
  const blocked = await c('GET', '/api/staff/members');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'PASSWORD_CHANGE');
  assert.equal((await c('POST', '/api/me/password', { current: 'Teacher1', next: 'Teacher12345' })).status, 400, 'still too weak');
  assert.equal((await c('POST', '/api/me/password', { current: 'Teacher1', next: 'Gidea-Park-2026!' })).status, 200);
  assert.equal((await c('GET', '/api/staff/members')).body.code, 'PRIVACY_REQUIRED', 'then the updated policy');
  assert.equal((await c('POST', '/api/me/privacy', { acceptPrivacy: true })).status, 200);
  assert.equal((await c('GET', '/api/staff/members')).status, 200);
  assert.equal((await c('GET', '/api/me')).body.user.mustChangePassword, false);
});

test('failed logins are capped per connection, whatever account name is tried', async () => {
  const c = client('203.0.113.9');
  for (let i = 0; i < 20; i++) {
    assert.equal((await c('POST', '/api/auth/login', { identifier: `nobody${i}@test.local`, password: 'wrong' })).status, 401);
  }
  assert.equal((await c('POST', '/api/auth/login', { identifier: 'someone-new@test.local', password: 'wrong' })).status, 429);
  // Another connection is unaffected.
  assert.equal((await client('203.0.113.10')('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' })).status, 200);
});

test('failed logins are capped per account, from any connection', async () => {
  for (let i = 0; i < 10; i++) {
    await client(`198.51.100.${i}`)('POST', '/api/auth/login', { identifier: 'target@test.local', password: 'wrong' });
  }
  assert.equal((await client('198.51.100.200')('POST', '/api/auth/login', { identifier: 'target@test.local', password: 'wrong' })).status, 429);
});
