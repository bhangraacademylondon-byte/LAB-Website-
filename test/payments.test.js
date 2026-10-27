'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-pay-'));
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'admin-password';
process.env.PGLITE_DIR = 'memory';
process.env.LAB_TEST_SKIP_TWO_STEP = '1';

const { app, prepare } = require('../server/index.js');
const { close: closeDb } = require('../server/db');
const payments = require('../server/payments');

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

async function member(name, email) {
  const c = client();
  const reg = await c('POST', '/api/auth/register', { name, email, password: 'Password-test-1!', acceptPrivacy: true, ageGroup: '16plus' });
  assert.equal(reg.status, 201);
  return { c, user: reg.body.user };
}

async function staff(role) {
  const admin = client();
  await admin('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' });
  if (role === 'admin') return admin;
  await admin('POST', '/api/staff/members', { name: 'Teacher Gurdeep', email: 'gurdeep@test.local', password: 'Password-test-1!', role: 'instructor' });
  const teacher = client();
  await teacher('POST', '/api/auth/login', { identifier: 'gurdeep@test.local', password: 'Password-test-1!' });
  await teacher('POST', '/api/me/privacy', { acceptPrivacy: true, ageGroup: '16plus' });
  return teacher;
}

test('the Monzo reference has the member ID, the date and the name, shortened to fit', () => {
  const r = (name) => payments.reference({ member_id: 'LAB-K7M2QX', name }, '2026-10-29');
  assert.equal(r('Simran Kaur'), 'LAB-K7M2QX 29OCT SIMRAN KAUR');
  assert.equal(r('Simran Kaur Dhaliwal'), 'LAB-K7M2QX 29OCT SIMRAN D');
  assert.equal(r('Gurpreetinder Singhabcdef'), 'LAB-K7M2QX 29OCT GS');
  for (const name of ['Simran Kaur', 'Simran Kaur Dhaliwal', 'Gurpreetinder Singhabcdef']) assert.ok(r(name).length <= 30);
});

test('a price becomes pence', () => {
  assert.equal(payments.pence('£7'), 700);
  assert.equal(payments.pence('£7.50'), 750);
  assert.equal(payments.pence('Ask us'), 0);
});

test('a member pays for a chosen class date, confirms, and it shows as paid to teachers', async () => {
  const { c, user } = await member('Simran Kaur', 'simran@test.local');
  const mine = await c('GET', '/api/me/payments');
  assert.equal(mine.status, 200);
  assert.ok(mine.body.payOnline.enabled);
  assert.match(mine.body.payOnline.link, /^https:\/\/monzo\.com\/pay\//);
  assert.ok(mine.body.dates.length >= 4, 'upcoming class dates to choose from');
  const date = mine.body.dates[1];
  assert.equal(new Date(`${date}T12:00:00Z`).getUTCDay(), 4, 'class dates are Thursdays');

  assert.equal((await c('POST', '/api/me/payments', { date: '2026-10-27' })).status, 400, 'not a class day');

  const start = await c('POST', '/api/me/payments', { date });
  assert.equal(start.status, 200);
  assert.equal(start.body.payment.reference, payments.reference({ member_id: user.memberId, name: 'Simran Kaur' }, date));
  assert.equal(start.body.payment.amountPence, 700);
  assert.equal((await c('GET', '/api/me/payments')).body.pending.id, start.body.payment.id, 'unconfirmed payment is remembered');

  const teacher = await staff('instructor');
  assert.equal((await teacher('GET', `/api/staff/payments?date=${date}`)).body.payments.length, 0, 'not paid until confirmed');

  const confirm = await c('POST', `/api/me/payments/${start.body.payment.id}/confirm`);
  assert.equal(confirm.status, 200);
  assert.equal(confirm.body.payments[0].status, 'claimed');
  assert.equal((await c('POST', '/api/me/payments', { date })).status, 409, 'cannot pay twice');

  const list = await teacher('GET', `/api/staff/payments?date=${date}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.payments.length, 1);
  assert.equal(list.body.payments[0].name, 'Simran Kaur');
  assert.equal(list.body.payments[0].memberId, user.memberId);
  assert.equal(list.body.payments[0].attended, false);

  // Only an admin, who can see Monzo, marks it received; a teacher can't.
  const id = list.body.payments[0].id;
  assert.equal((await teacher('PATCH', `/api/staff/payments/${id}`, { status: 'received' })).status, 403);
  assert.equal((await teacher('DELETE', `/api/staff/payments/${id}`)).status, 200);
  assert.equal((await teacher('GET', `/api/staff/payments?date=${date}`)).body.payments.length, 1, 'a teacher cannot remove an online claim');
  const admin = await staff('admin');
  assert.equal((await admin('PATCH', `/api/staff/payments/${id}`, { status: 'received' })).status, 200);
  const checked = (await teacher('GET', `/api/staff/payments?date=${date}`)).body.payments[0];
  assert.equal(checked.status, 'received');
  assert.equal(checked.checkedBy, 'Academy Admin');

  // Scanning them in on the night shows they've paid; the payment stays on its date.
  const { body: { session } } = await teacher('POST', '/api/staff/sessions', { title: 'Bhangra', date, start_time: '19:30' });
  const scan = await teacher('POST', `/api/staff/sessions/${session.id}/attendance`, { code: user.memberId });
  assert.equal(scan.body.payment.status, 'received');
  assert.equal((await teacher('GET', `/api/staff/payments?date=${date}`)).body.payments[0].attended, true);

  const exported = await c('GET', '/api/me/export');
  assert.equal(exported.body.payments[0].date, date);
});

test('"not received" stops the member claiming again online; they pay at the door instead', async () => {
  const { c, user } = await member('Arjun Singh', 'arjun@test.local');
  const admin = await staff('admin');
  const date = (await c('GET', '/api/me/payments')).body.dates[0];
  const start = await c('POST', '/api/me/payments', { date });
  await c('POST', `/api/me/payments/${start.body.payment.id}/confirm`);
  await admin('PATCH', `/api/staff/payments/${start.body.payment.id}`, { status: 'not_received' });
  assert.equal((await c('GET', '/api/me/payments')).body.payments[0].status, 'not_received');
  assert.equal((await c('POST', '/api/me/payments', { date })).status, 409, 'cannot restart and wipe the "not received" mark');
  assert.equal((await c('GET', '/api/me/payments')).body.payments[0].status, 'not_received');

  const { body: { session } } = await admin('POST', '/api/staff/sessions', { title: 'Bhangra', date, start_time: '19:30' });
  const scan = await admin('POST', `/api/staff/sessions/${session.id}/attendance`, { code: user.memberId });
  assert.equal(scan.body.payment.status, 'not_received');
  const cash = await admin('POST', '/api/staff/payments', { userId: user.id, date, method: 'cash' });
  assert.equal(cash.status, 200);
  assert.equal(cash.body.payment.method, 'cash');
  assert.equal(cash.body.payment.status, 'received');
  assert.equal(cash.body.payment.amountPence, 700);
});

test('"No, not yet" forgets the payment; members cannot touch anyone else\'s', async () => {
  const a = await member('Priya Sandhu', 'priya@test.local');
  const b = await member('Jas Gill', 'jas@test.local');
  const date = (await a.c('GET', '/api/me/payments')).body.dates[2];
  const start = await a.c('POST', '/api/me/payments', { date });
  assert.equal((await b.c('POST', `/api/me/payments/${start.body.payment.id}/confirm`)).status, 404);
  await b.c('DELETE', `/api/me/payments/${start.body.payment.id}`);
  assert.ok((await a.c('GET', '/api/me/payments')).body.pending, 'still there after someone else tried to delete it');
  await a.c('DELETE', `/api/me/payments/${start.body.payment.id}`);
  assert.equal((await a.c('GET', '/api/me/payments')).body.pending, null);
  assert.equal((await b.c('GET', '/api/staff/payments')).status, 403, 'members cannot see the list');
  assert.equal((await b.c('PATCH', `/api/staff/payments/${start.body.payment.id}`, { status: 'received' })).status, 403);
});

test('the attendance list shows each member ID', async () => {
  const { user } = await member('Kiran Bains', 'kiran@test.local');
  const admin = await staff('admin');
  const { body: { session } } = await admin('POST', '/api/staff/sessions', { title: 'Check', date: '2026-01-15' });
  await admin('POST', `/api/staff/sessions/${session.id}/attendance`, { code: user.memberId });
  const { body } = await admin('GET', `/api/staff/sessions/${session.id}`);
  assert.equal(body.attendees[0].memberId, user.memberId);
});

test('deleting an account keeps its payment records, with the name kept on them', async () => {
  const { c, user } = await member('Leaving Member', 'leaving@test.local');
  const admin = await staff('admin');
  const date = (await c('GET', '/api/me/payments')).body.dates[3];
  await admin('POST', '/api/staff/payments', { userId: user.id, date, method: 'cash' });
  assert.equal((await c('POST', '/api/me/delete', { password: 'Password-test-1!' })).status, 200);
  const kept = (await admin('GET', `/api/staff/payments?date=${date}`)).body.payments.find((p) => p.memberId === user.memberId);
  assert.ok(kept, 'the payment is still on record');
  assert.equal(kept.name, 'Leaving Member (account deleted)');
  assert.equal(kept.method, 'cash');
});
