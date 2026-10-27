'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-twostep-'));
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'admin-password';
process.env.PGLITE_DIR = 'memory';

const { app, prepare } = require('../server/index.js');
const { db, close: closeDb } = require('../server/db');
const twostep = require('../server/twostep');

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

const secretOf = async (email) => (await db.get('SELECT totp_secret FROM users WHERE email = ?', email)).totp_secret;
const codeFor = (secret, offset = 0) => twostep.codeAt(secret, twostep.counterNow() + offset);

test('codes match the standard (RFC 6238) and are accepted once, with a window either side', () => {
  const secret = twostep.newSecret();
  const now = twostep.counterNow();
  assert.equal(twostep.check(secret, codeFor(secret)), now);
  assert.equal(twostep.check(secret, codeFor(secret, -1)), now - 1, 'a slow phone clock is fine');
  assert.equal(twostep.check(secret, codeFor(secret), now), null, 'a code cannot be used twice');
  assert.equal(twostep.check(secret, '000000x'), null);
});

test('an admin must set up two-step login, then needs a code at every login', async () => {
  const c = client();
  const first = await c('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' });
  assert.equal(first.status, 200);
  assert.equal(first.body.user.twoStepSetupRequired, true);
  const blocked = await c('GET', '/api/staff/members');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'TWO_STEP_SETUP');

  assert.equal((await c('POST', '/api/me/two-step/setup')).status, 200);
  assert.equal((await c('GET', '/api/me/two-step/qr.svg')).status, 200);
  const secret = await secretOf('admin@test.local');
  assert.equal((await c('POST', '/api/me/two-step/enable', { code: '123456' })).status, 400);
  const on = await c('POST', '/api/me/two-step/enable', { code: codeFor(secret) });
  assert.equal(on.status, 200);
  assert.equal(on.body.backupCodes.length, 8);
  assert.equal((await c('GET', '/api/staff/members')).status, 200);

  // Next login: the password alone gives no session.
  const d = client();
  const step1 = await d('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' });
  assert.equal(step1.body.twoStep, true);
  assert.equal(step1.body.user, undefined);
  assert.equal((await d('GET', '/api/staff/members')).status, 401);
  assert.equal((await d('POST', '/api/auth/two-step', { ticket: step1.body.ticket, code: '000000' })).status, 400);
  const step2 = await d('POST', '/api/auth/two-step', { ticket: step1.body.ticket, code: codeFor(secret, 1) });
  assert.equal(step2.status, 200);
  assert.equal((await d('GET', '/api/staff/members')).status, 200);

  // A backup code works once.
  const e = client();
  const t1 = (await e('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' })).body.ticket;
  assert.equal((await e('POST', '/api/auth/two-step', { ticket: t1, code: on.body.backupCodes[0] })).status, 200);
  const f = client();
  const t2 = (await f('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' })).body.ticket;
  assert.equal((await f('POST', '/api/auth/two-step', { ticket: t2, code: on.body.backupCodes[0] })).status, 400);
});

test('a ticket allows five tries at most, and members never need a code', async () => {
  const admin = client();
  const t = (await admin('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' })).body.ticket;
  for (let i = 0; i < 5; i++) assert.equal((await admin('POST', '/api/auth/two-step', { ticket: t, code: '111111' })).status, 400);
  const secret = await secretOf('admin@test.local');
  assert.equal((await admin('POST', '/api/auth/two-step', { ticket: t, code: codeFor(secret, 1) })).status, 401);

  const m = client();
  const reg = await m('POST', '/api/auth/register', { name: 'Member', email: 'member@test.local', password: 'Password-test-1!', acceptPrivacy: true, ageGroup: '16plus' });
  assert.equal(reg.body.user.twoStepSetupRequired, false);
  assert.equal((await m('GET', '/api/me/attendance')).status, 200);
});
