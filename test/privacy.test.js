'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-privacy-'));
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

const adult = { acceptPrivacy: true, ageGroup: '16plus' };
const child = { acceptPrivacy: true, ageGroup: 'under16', guardianName: 'Parminder Kaur', guardianEmail: 'parent@test.local', guardianConsent: true };

test('sign-up requires accepting the privacy policy and saying whether the member is under 16', async () => {
  const base = { name: 'Adult', email: 'adult@test.local', password: 'password1' };
  assert.match((await client()('POST', '/api/auth/register', base)).body.error, /Privacy Policy/);
  assert.match((await client()('POST', '/api/auth/register', { ...base, acceptPrivacy: 'yes', ageGroup: '16plus' })).body.error, /Privacy Policy/);
  assert.match((await client()('POST', '/api/auth/register', { ...base, acceptPrivacy: true })).body.error, /16 or over/);
  const ok = await client()('POST', '/api/auth/register', { ...base, ...adult });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.user.privacyRequired, false);
  assert.equal(ok.body.user.under16, false);
  assert.equal(ok.body.user.privacyVersion, '2026-10');
});

test('children under 16 need a parent or guardian, who can sign up siblings with one email', async () => {
  const kid = { name: 'Kid One', email: '', password: 'password1' };
  for (const [patch, message] of [
    [{ guardianName: '' }, /guardian's name/],
    [{ guardianEmail: 'nope' }, /guardian's email/],
    [{ guardianConsent: false }, /consent/],
  ]) {
    const r = await client()('POST', '/api/auth/register', { ...kid, ...child, ...patch });
    assert.equal(r.status, 400);
    assert.match(r.body.error, message);
  }
  // An adult must still give an email address.
  assert.equal((await client()('POST', '/api/auth/register', { ...kid, ...adult })).status, 400);

  const first = await client()('POST', '/api/auth/register', { ...kid, ...child });
  assert.equal(first.status, 201);
  assert.equal(first.body.user.under16, true);
  assert.equal(first.body.user.guardianEmail, 'parent@test.local');
  const second = await client()('POST', '/api/auth/register', { ...kid, name: 'Kid Two', ...child });
  assert.equal(second.status, 201, 'a sibling can sign up with the same parent details');

  // Children without their own email log in with their member ID.
  const login = await client()('POST', '/api/auth/login', { identifier: first.body.user.memberId, password: 'password1' });
  assert.equal(login.status, 200);
});

test('people added by staff must accept the policy at first login before using their account', async () => {
  const admin = client();
  await admin('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' });
  await admin('POST', '/api/staff/members', { name: 'New Teacher', email: 'teach@test.local', password: 'password1', role: 'instructor' });

  const teacher = client();
  const login = await teacher('POST', '/api/auth/login', { identifier: 'teach@test.local', password: 'password1' });
  assert.equal(login.body.user.privacyRequired, true);
  for (const url of ['/api/me/attendance', '/api/staff/today', '/api/staff/debriefs']) {
    const r = await teacher('GET', url);
    assert.equal(r.status, 403, url);
    assert.equal(r.body.code, 'PRIVACY_REQUIRED');
  }
  assert.equal((await teacher('GET', '/api/me')).status, 200, 'can still see their own status');
  await teacher('POST', '/api/me/privacy', adult);
  assert.equal((await teacher('GET', '/api/staff/today')).status, 200);
});

test('changing the policy version asks everyone to accept again; admins are never locked out', async () => {
  const member = client();
  await member('POST', '/api/auth/register', { name: 'Reaccept', email: 'reaccept@test.local', password: 'password1', ...adult });
  assert.equal((await member('GET', '/api/me/attendance')).status, 200);

  const admin = client();
  await admin('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' });
  const { body: content } = await admin('GET', '/api/content');
  const saved = await admin('PUT', '/api/admin/content', { ...content, privacy: { ...content.privacy, version: '2027-01' } });
  assert.equal(saved.status, 200, 'admin can edit content without having accepted');
  const blank = await admin('PUT', '/api/admin/content', { ...content, privacy: { ...content.privacy, version: '   ' } });
  assert.equal(blank.body.privacy.version, '2026-10', 'the version can never be blank');
  await admin('PUT', '/api/admin/content', { ...content, privacy: { ...content.privacy, version: '2027-01' } });

  assert.equal((await member('GET', '/api/me/attendance')).body.code, 'PRIVACY_REQUIRED');
  const accepted = await member('POST', '/api/me/privacy', adult);
  assert.equal(accepted.body.user.privacyVersion, '2027-01');
  assert.equal((await member('GET', '/api/me/attendance')).status, 200);
});

test('members can download their data and delete their account', async () => {
  const member = client();
  const reg = await member('POST', '/api/auth/register', { name: 'Leaver', email: 'leaver@test.local', password: 'password1', bio: 'hi', ...adult });
  await client()('POST', '/api/contact', { name: 'Leaver', email: 'leaver@test.local', message: 'Question about classes' });

  const exp = await member('GET', '/api/me/export');
  assert.match(exp.headers.get('content-disposition'), /attachment/);
  const data = exp.body;
  assert.equal(data.account.memberId, reg.body.user.memberId);
  assert.equal(data.account.bio, 'hi');
  assert.equal(data.privacyConsents.length, 1);
  assert.equal(data.messagesSent[0].body, 'Question about classes');
  assert.equal(JSON.stringify(data).includes('password'), false, 'no password hash in the export');

  assert.equal((await member('POST', '/api/me/delete', { password: 'wrong' })).status, 400);
  assert.equal((await member('POST', '/api/me/delete', { password: 'password1' })).status, 200);
  assert.equal((await client()('POST', '/api/auth/login', { identifier: 'leaver@test.local', password: 'password1' })).status, 401);

  const admin = client();
  await admin('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' });
  assert.match((await admin('POST', '/api/me/delete', { password: 'admin-password' })).body.error, /only admin/);
});
