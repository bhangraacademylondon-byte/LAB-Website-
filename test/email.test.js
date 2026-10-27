'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-email-'));
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'admin-password';
process.env.PGLITE_DIR = 'memory';
process.env.LAB_TEST_SKIP_TWO_STEP = '1';

const mailer = require('../server/email');
const sent = [];
mailer.useTestTransport(async (m) => { sent.push(m); });

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

const linkIn = (m, page) => new URL(m.text.match(new RegExp(`https?://\\S+/${page}\\?token=\\S+`))[0]).searchParams.get('token');
const last = (to) => sent.filter((m) => m.to[0] === to).at(-1);

test('a contact message is emailed to the academy, with Reply going to the sender', async () => {
  const r = await client()('POST', '/api/contact', { name: 'Wedding Enquiry', email: 'bride@test.local', message: 'Can you perform on 5 June?' });
  assert.equal(r.status, 200);
  const m = last('bhangraacademy.london@gmail.com');
  assert.ok(m, 'sent to the academy');
  assert.equal(m.reply_to, 'bride@test.local');
  assert.match(m.text, /5 June/);
});

test('sign-up checks the email address before the account can be used', async () => {
  const c = client();
  const reg = await c('POST', '/api/auth/register', { name: 'New Dancer', email: 'new@test.local', password: 'Password-test-1!', acceptPrivacy: true, ageGroup: '16plus' });
  assert.equal(reg.status, 202);
  assert.equal(reg.body.checkEmail, true);
  assert.equal((await c('GET', '/api/me')).body.user, null, 'not logged in yet');
  const login = await client()('POST', '/api/auth/login', { identifier: 'new@test.local', password: 'Password-test-1!' });
  assert.equal(login.status, 403);
  assert.match(login.body.error, /confirm your email/);

  const token = linkIn(last('new@test.local'), 'verify-email');
  const v = await c('POST', '/api/auth/verify', { token });
  assert.equal(v.status, 200);
  assert.equal(v.body.user.name, 'New Dancer');
  assert.equal((await c('POST', '/api/auth/verify', { token })).status, 400, 'a link works once');
  assert.equal((await client()('POST', '/api/auth/login', { identifier: 'new@test.local', password: 'Password-test-1!' })).status, 200);
});

test('signing up with an email that already has an account gives the same answer, and tells its owner', async () => {
  const before = sent.length;
  const r = await client()('POST', '/api/auth/register', { name: 'Imposter', email: 'new@test.local', password: 'Password-test-1!', acceptPrivacy: true, ageGroup: '16plus' });
  assert.equal(r.status, 202);
  assert.equal(r.body.checkEmail, true);
  const m = sent.slice(before).find((x) => x.to[0] === 'new@test.local');
  assert.match(m.subject, /already have/);
});

test('forgotten password: a one-time link by email, and the same answer for unknown emails', async () => {
  assert.deepEqual((await client()('POST', '/api/auth/forgot', { email: 'nobody@test.local' })).body, { ok: true });
  assert.equal(last('nobody@test.local'), undefined);
  assert.deepEqual((await client()('POST', '/api/auth/forgot', { email: 'NEW@test.local' })).body, { ok: true });
  const token = linkIn(last('new@test.local'), 'reset-password');
  assert.equal((await client()('POST', '/api/auth/reset', { token, password: 'short' })).status, 400);
  assert.equal((await client()('POST', '/api/auth/reset', { token, password: 'Brand-new-pass-2026!' })).status, 200);
  assert.equal((await client()('POST', '/api/auth/reset', { token, password: 'Another-pass-2026!' })).status, 400, 'used up');
  assert.equal((await client()('POST', '/api/auth/login', { identifier: 'new@test.local', password: 'Password-test-1!' })).status, 401);
  assert.equal((await client()('POST', '/api/auth/login', { identifier: 'new@test.local', password: 'Brand-new-pass-2026!' })).status, 200);
});

test('accounts made by staff, and the first admin, need no email check', async () => {
  const admin = client();
  assert.equal((await admin('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' })).status, 200);
  await admin('POST', '/api/staff/members', { name: 'Door Signup', email: 'door@test.local', password: 'Password-test-1!' });
  assert.equal((await client()('POST', '/api/auth/login', { identifier: 'door@test.local', password: 'Password-test-1!' })).status, 200);
});
