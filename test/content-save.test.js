'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-content-'));
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'admin-password';
process.env.PGLITE_DIR = 'memory';

const { app, prepare } = require('../server/index.js');
const { close: closeDb, setSetting } = require('../server/db');

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

async function adminClient() {
  let cookie = '';
  const call = async (method, url, body) => {
    const headers = { 'X-LAB-CSRF': '1' };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
  await call('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'admin-password' });
  return call;
}

test('saving one page never undoes changes made to another page from a different tab or device', async () => {
  const tabA = await adminClient();
  const tabB = await adminClient();
  // Both editors are opened, so both hold the same starting content.
  const a = (await tabA('GET', '/api/content')).body;
  const b = (await tabB('GET', '/api/content')).body;

  a.home.heroTitle = 'Edited in tab A';
  assert.equal((await tabA('PUT', '/api/admin/content/home', { value: a.home })).status, 200);

  b.about.title = 'Edited in tab B';
  assert.equal((await tabB('PUT', '/api/admin/content/about', { value: b.about })).status, 200);

  const now = (await tabA('GET', '/api/content')).body;
  assert.equal(now.home.heroTitle, 'Edited in tab A', 'tab B must not overwrite the home page with its old copy');
  assert.equal(now.about.title, 'Edited in tab B');
});

test('unknown sections are rejected', async () => {
  const admin = await adminClient();
  assert.equal((await admin('PUT', '/api/admin/content/nope', { value: {} })).status, 400);
});

test('content changed by another running copy of the app is picked up', async () => {
  const admin = await adminClient();
  const fresh = (await admin('GET', '/api/content')).body;
  // Simulate another server instance (e.g. during a Render deploy) saving directly.
  await setSetting('content', { ...fresh, contact: { ...fresh.contact, title: 'Saved elsewhere' } });
  await new Promise((r) => setTimeout(r, 2100));
  assert.equal((await admin('GET', '/api/content')).body.contact.title, 'Saved elsewhere');
});

test('phone numbers saved before names existed get Ravi and Gurdeep, and old payment wording is updated', async () => {
  const admin = await adminClient();
  const fresh = (await admin('GET', '/api/content')).body;
  const { contacts, ...site } = fresh.site;
  // Content as it was saved before: numbers only, in a different order, plus one new number.
  await setSetting('content', {
    ...fresh,
    site: { ...site, phones: ['07538 687118', '07851564285', '020 7946 0000'] },
    pricing: { ...fresh.pricing, notes: 'Payment is cash only at the class.' },
  });
  await new Promise((r) => setTimeout(r, 2100));
  const now = (await admin('GET', '/api/content')).body;
  assert.deepEqual(now.site.contacts, [
    { name: 'Gurdeep', phone: '07538 687118' },
    { name: 'Ravi', phone: '07851564285' },
    { name: '', phone: '020 7946 0000' },
  ]);
  assert.equal(now.site.phones, undefined);
  assert.match(now.pricing.notes, /cash or card.*not transferable/);
  assert.equal(now.pricing.payment, 'Cash or card');
});

test('the old Performances and Workshops wording is replaced where it was never edited', async () => {
  const admin = await adminClient();
  const fresh = (await admin('GET', '/api/content')).body;
  await setSetting('content', {
    ...fresh,
    performances: { ...fresh.performances, introTitle: 'Bringing culture to your event', featureTitle: 'Our own heading' },
    workshops: { ...fresh.workshops, listTitle: "Who it's for" },
  });
  await new Promise((r) => setTimeout(r, 2100));
  const now = (await admin('GET', '/api/content')).body;
  assert.equal(now.performances.introTitle, 'Bhangra at your event');
  assert.equal(now.performances.featureTitle, 'Our own heading', 'edited wording is kept');
  assert.equal(now.workshops.listTitle, 'Good for');
});
