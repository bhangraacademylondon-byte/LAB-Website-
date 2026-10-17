'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rsvp-test-'));
process.env.ADMIN_EMAIL = 'Ravi.akshee@gmail.com';
process.env.ADMIN_PASSWORD = 'admin-password';
process.env.PGLITE_DIR = 'memory';

const { app, prepare, composeEmail } = require('../server/index.js');
const { close: closeDb } = require('../server/db');
const rsvp = require('../server/rsvp');

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
  return async (method, url, body, headers = {}) => {
    const h = { 'X-RSVP-CSRF': '1', ...headers };
    if (cookie) h.Cookie = cookie;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(base + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
  };
}

async function adminClient() {
  const a = client();
  const login = await a('POST', '/api/auth/login', { email: 'ravi.akshee@gmail.com', password: 'admin-password' });
  assert.equal(login.status, 200);
  return a;
}

const BOTH = { pooja: true, party: true };
const NEITHER = { pooja: false, party: false };

async function setRsvp(a, changes) {
  const current = (await a('GET', '/api/content')).body.rsvp;
  const r = await a('PUT', '/api/admin/content/rsvp', { ...current, ...changes });
  assert.equal(r.status, 200);
}

test('name matching ignores case, accents, titles and middle names', () => {
  assert.equal(rsvp.matchScore('priya sharma', 'Priya Sharma'), 2);
  assert.equal(rsvp.matchScore('Mrs Priyá  Sharma', 'Priya Sharma'), 2);
  assert.equal(rsvp.matchScore('Priya Sharma', 'Priya Devi Sharma'), 1);
  assert.equal(rsvp.matchScore('Priya Sharmaa', 'Priya Sharma'), 1);
  assert.equal(rsvp.matchScore("O'Neil Jones", 'ONeil Jones'), 2);
  assert.equal(rsvp.matchScore('Priya', 'Priya Sharma'), 0);
  assert.equal(rsvp.matchScore('Anita Sharma', 'Priya Sharma'), 0);
});

test('admin routes need a login, and mutating calls need the CSRF header', async () => {
  const anon = client();
  assert.equal((await anon('GET', '/api/admin/households')).status, 401);
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
  const bad = await anon('POST', '/api/auth/login', { email: 'ravi.akshee@gmail.com', password: 'wrong' });
  assert.equal(bad.status, 401);
});

test('only people on the guest list can RSVP, for their whole family, and edits are logged', async () => {
  const a = await adminClient();
  const created = await a('POST', '/api/admin/households', {
    name: 'The Patel family',
    guests: [{ name: 'Raj Patel' }, { name: 'Priya Patel' }, { name: 'Anil Patel', isChild: true }],
    plusOnes: 1,
    contactPhone: '07700 900000',
  });
  assert.equal(created.status, 201);
  const id = created.body.id;

  const guest = client();
  const notFound = await guest('POST', '/api/rsvp/lookup', { name: 'Someone Else' });
  assert.deepEqual(notFound.body.matches, []);

  const found = await guest('POST', '/api/rsvp/lookup', { name: 'priya patel' });
  assert.equal(found.body.matches.length, 1);
  const token = found.body.matches[0].token;
  const auth = { 'X-RSVP-Token': token };

  const invite = (await guest('GET', '/api/rsvp/invite', undefined, auth)).body.invite;
  assert.equal(invite.guests.length, 3);
  assert.equal(invite.plusOnesAllowed, 1);
  assert.equal(invite.responded, false);
  const [raj, priya, anil] = invite.guests;

  // Every person needs an answer, for every event.
  const missing = await guest('POST', '/api/rsvp/reply', { guests: [{ id: raj.id, attendance: BOTH }] }, auth);
  assert.equal(missing.status, 400);
  const halfAnswered = await guest('POST', '/api/rsvp/reply', {
    guests: [{ id: raj.id, attendance: BOTH }, { id: priya.id, attendance: { pooja: true } }, { id: anil.id, attendance: NEITHER }],
  }, auth);
  assert.equal(halfAnswered.status, 400);
  assert.match(halfAnswered.body.error, /Priya Patel is coming to the Engagement Party/);

  // Too many extra guests.
  const tooMany = await guest('POST', '/api/rsvp/reply', {
    guests: [{ id: raj.id, attendance: BOTH }, { id: priya.id, attendance: BOTH }, { id: anil.id, attendance: BOTH }],
    plusOnes: [{ name: 'A B' }, { name: 'C D' }],
  }, auth);
  assert.equal(tooMany.status, 400);

  const reply = await guest('POST', '/api/rsvp/reply', {
    guests: [
      { id: raj.id, attendance: BOTH, answers: { dietary: 'Vegetarian' } },
      { id: priya.id, attendance: BOTH },
      { id: anil.id, attendance: NEITHER, answers: { dietary: 'ignored when not coming' } },
    ],
    plusOnes: [{ name: 'Meera Shah', answers: { dietary: 'Vegan' } }],
    answers: { message: 'Congratulations!' },
  }, auth);
  assert.equal(reply.status, 200);
  assert.equal(reply.body.firstReply, true);
  assert.equal(reply.body.invite.responded, true);
  assert.equal(reply.body.invite.plusOnes[0].name, 'Meera Shah');
  assert.deepEqual(reply.body.invite.guests[2].answers, {});

  // Change the reply before the deadline.
  const change = await guest('POST', '/api/rsvp/reply', {
    guests: [{ id: raj.id, attendance: BOTH, answers: { dietary: 'Vegetarian' } }, { id: priya.id, attendance: { pooja: true, party: false } }, { id: anil.id, attendance: NEITHER }],
    plusOnes: [],
    answers: { message: 'Congratulations!' },
  }, auth);
  assert.equal(change.status, 200);
  assert.equal(change.body.firstReply, false);

  const log = (await a('GET', '/api/admin/log')).body.log;
  assert.equal(log.length, 2);
  assert.equal(log[0].action, 'updated');
  assert.ok(log[0].changes.includes('Priya Patel, Engagement Party: Coming → Not coming'));
  assert.ok(!log[0].changes.some((c) => c.startsWith('Priya Patel, Pooja')));
  assert.ok(log[0].changes.includes('Meera Shah removed'));
  assert.equal(log[1].action, 'submitted');
  assert.equal(log[1].summary, 'Pooja: 3 coming, 1 not coming · Engagement Party: 3 coming, 1 not coming');

  const detail = (await a('GET', `/api/admin/households/${id}`)).body.household;
  assert.equal(detail.status, 'replied');
  assert.equal(detail.responseCount, 2);

  const csv = await a('GET', '/api/admin/export.csv');
  assert.match(csv.body, /"Pooja","Engagement Party"/);
  assert.match(csv.body, /Raj Patel","Invited","Adult","Coming","Coming","Vegetarian"/);
  assert.match(csv.body, /Priya Patel","Invited","Adult","Coming","Not coming"/);

  const overview = (await a('GET', '/api/admin/overview')).body.stats.events;
  const party = overview.find((e) => e.id === 'party');
  assert.equal(party.coming, 1);
  assert.equal(party.notComing, 2);
});

test('after the deadline, replies are locked and non-repliers are flagged as overdue', async () => {
  const a = await adminClient();
  const replied = (await a('POST', '/api/admin/households', { guests: [{ name: 'Sunita Shah' }] })).body.id;
  const silent = (await a('POST', '/api/admin/households', { guests: [{ name: 'Vikram Rao' }], contactPhone: '0123' })).body.id;

  const guest = client();
  const tokenFor = async (name) => ({ 'X-RSVP-Token': (await guest('POST', '/api/rsvp/lookup', { name })).body.matches[0].token });
  const sunita = await tokenFor('Sunita Shah');
  const inv = (await guest('GET', '/api/rsvp/invite', undefined, sunita)).body.invite;
  assert.equal((await guest('POST', '/api/rsvp/reply', { guests: [{ id: inv.guests[0].id, attendance: BOTH }] }, sunita)).status, 200);

  await setRsvp(a, { deadline: '2020-01-01', allowLateReplies: false });
  const late = await guest('POST', '/api/rsvp/reply', { guests: [{ id: inv.guests[0].id, attendance: NEITHER }] }, sunita);
  assert.equal(late.status, 403);
  const view = (await guest('GET', '/api/rsvp/invite', undefined, sunita)).body.invite;
  assert.equal(view.canReply, false);
  assert.equal(view.guests[0].attending, true);

  const overview = (await a('GET', '/api/admin/overview')).body;
  assert.equal(overview.deadlinePassed, true);
  assert.equal(overview.households.find((h) => h.id === silent).status, 'overdue');
  assert.equal(overview.households.find((h) => h.id === replied).status, 'replied');

  // Late replies from people who haven't replied can be allowed.
  await setRsvp(a, { allowLateReplies: true });
  const vik = await tokenFor('Vikram Rao');
  const vInv = (await guest('GET', '/api/rsvp/invite', undefined, vik)).body.invite;
  assert.equal(vInv.canReply, true);
  assert.equal((await guest('GET', '/api/rsvp/invite', undefined, sunita)).body.invite.canReply, false);

  // Admins can still edit any reply after the deadline.
  const edit = await a('PUT', `/api/admin/households/${replied}/reply`, { guests: [{ id: inv.guests[0].id, attendance: NEITHER }] });
  assert.equal(edit.status, 200);
  const log = (await a('GET', '/api/admin/log')).body.log;
  assert.equal(log[0].action, 'admin_edit');

  await setRsvp(a, { deadline: '', allowLateReplies: true });
});

test('the same name on two invitations asks the guest to choose', async () => {
  const a = await adminClient();
  await a('POST', '/api/admin/households', { guests: [{ name: 'Amit Kumar' }, { name: 'Neha Kumar' }] });
  const second = await a('POST', '/api/admin/households', { guests: [{ name: 'Amit Kumar' }, { name: 'Rohan Kumar' }] });
  assert.equal(second.body.warnings.length, 1);
  const guest = client();
  const found = await guest('POST', '/api/rsvp/lookup', { name: 'Amit Kumar' });
  assert.equal(found.body.matches.length, 2);
  assert.deepEqual(found.body.matches.map((m) => m.firstNames).sort(), [['Amit', 'Neha'], ['Amit', 'Rohan']]);
});

test('bulk add reads family names, children and extra guests', async () => {
  const a = await adminClient();
  const r = await a('POST', '/api/admin/households/bulk', { text: 'Singh family: Harpreet Singh, Simran Kaur, Jas Singh (child) +2\n\nJohn Smith' });
  assert.equal(r.status, 201);
  assert.equal(r.body.added, 2);
  const { households } = (await a('GET', '/api/admin/households')).body;
  const singh = households.find((h) => h.name === 'Singh family');
  assert.equal(singh.plusOnes, 2);
  assert.deepEqual(singh.guests.map((g) => [g.name, g.isChild]), [['Harpreet Singh', false], ['Simran Kaur', false], ['Jas Singh', true]]);
  assert.ok(households.some((h) => h.name === 'John Smith'));
});

test('custom questions: required and choice answers are checked', async () => {
  const a = await adminClient();
  const current = (await a('GET', '/api/content')).body.rsvp;
  await setRsvp(a, {
    questions: [...current.questions, { id: '', scope: 'guest', type: 'choice', label: 'Starter', help: '', options: ['Paneer', 'Chicken'], required: true }],
  });
  const q = (await a('GET', '/api/content')).body.rsvp.questions.find((x) => x.label === 'Starter');
  assert.ok(q.id);
  const id = (await a('POST', '/api/admin/households', { guests: [{ name: 'Leela Menon' }] })).body.id;
  const guest = client();
  const auth = { 'X-RSVP-Token': (await guest('POST', '/api/rsvp/lookup', { name: 'Leela Menon' })).body.matches[0].token };
  const gid = (await guest('GET', '/api/rsvp/invite', undefined, auth)).body.invite.guests[0].id;
  assert.equal((await guest('POST', '/api/rsvp/reply', { guests: [{ id: gid, attendance: BOTH }] }, auth)).status, 400);
  assert.equal((await guest('POST', '/api/rsvp/reply', { guests: [{ id: gid, attendance: BOTH, answers: { [q.id]: 'Fish' } }] }, auth)).status, 400);
  assert.equal((await guest('POST', '/api/rsvp/reply', { guests: [{ id: gid, attendance: BOTH, answers: { [q.id]: 'Paneer' } }] }, auth)).status, 200);
  // Not coming: no questions needed.
  await a('DELETE', `/api/admin/households/${id}/reply`);
  assert.equal((await guest('POST', '/api/rsvp/reply', { guests: [{ id: gid, attendance: NEITHER }] }, auth)).status, 200);
  await setRsvp(a, { questions: current.questions });
});

test('a tampered RSVP token is rejected', async () => {
  const guest = client();
  const r = await guest('GET', '/api/rsvp/invite', undefined, { 'X-RSVP-Token': '1.99999999999999.abc' });
  assert.equal(r.status, 401);
});

test('update emails show each event when invited to both', () => {
  const msg = composeEmail({
    action: 'submitted',
    summary: 'Pooja: 1 coming, 0 not coming · Engagement Party: 0 coming, 1 not coming',
    changes: [],
    snapshot: { household: 'Raj Patel', events: ['Pooja', 'Engagement Party'], answers: [],
      guests: [{ name: 'Raj Patel', attending: true, events: [{ name: 'Pooja', attending: true }, { name: 'Engagement Party', attending: false }], answers: [] }] },
  }, 'https://example.test/admin/guests/1');
  assert.match(msg.text, /Invited to: Pooja and Engagement Party/);
  assert.match(msg.text, /Raj Patel: ✓ Pooja: Coming · ✗ Engagement Party: Not coming/);
});

test('update emails list who is coming and what changed', () => {
  const msg = composeEmail({
    action: 'updated',
    summary: '1 coming, 1 not coming',
    changes: ['Priya Patel: Coming → Not coming'],
    snapshot: {
      household: 'The Patel family',
      events: ['Pooja'],
      guests: [
        { name: 'Raj Patel', attending: true, events: [{ name: 'Pooja', attending: true }], answers: [{ q: 'Dietary', a: 'Vegetarian' }] },
        { name: 'Priya Patel', attending: false, events: [{ name: 'Pooja', attending: false }], answers: [] },
      ],
      answers: [{ q: 'Message', a: '<b>hi</b>' }],
    },
  }, 'https://example.test/admin/guests/1');
  assert.equal(msg.subject, 'RSVP changed: The Patel family: 1 coming, 1 not coming');
  assert.match(msg.text, /✓ Raj Patel: Coming/);
  assert.match(msg.text, /Priya Patel: Coming → Not coming/);
  assert.match(msg.html, /&lt;b&gt;hi&lt;\/b&gt;/);
});

test('pages are served with the couple’s names', async () => {
  const res = await fetch(`${base}/rsvp`);
  const body = await res.text();
  assert.match(body, /<title>Ravi &amp; Akshee · Pooja &amp; Engagement Party<\/title>/);
});

test('Pooja-only invitations only answer for the Pooja', async () => {
  const a = await adminClient();
  const id = (await a('POST', '/api/admin/households', { guests: [{ name: 'Kamla Devi' }], events: ['pooja'] })).body.id;
  assert.equal((await a('POST', '/api/admin/households', { guests: [{ name: 'X Y' }], events: [] })).status, 400);
  const guest = client();
  const auth = { 'X-RSVP-Token': (await guest('POST', '/api/rsvp/lookup', { name: 'Kamla Devi' })).body.matches[0].token };
  const inv = (await guest('GET', '/api/rsvp/invite', undefined, auth)).body.invite;
  assert.deepEqual(inv.events.map((e) => e.id), ['pooja']);
  // An answer for an event they're not invited to is ignored.
  const r = await guest('POST', '/api/rsvp/reply', { guests: [{ id: inv.guests[0].id, attendance: { pooja: true, party: true } }] }, auth);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.invite.guests[0].attendance, { pooja: true });
  const h = (await a('GET', `/api/admin/households/${id}`)).body.household;
  assert.deepEqual(h.events, ['pooja']);
  const log = (await a('GET', '/api/admin/log')).body.log;
  assert.equal(log[0].summary, '1 coming, 0 not coming');
  const csv = (await a('GET', '/api/admin/export.csv')).body;
  assert.match(csv, /Kamla Devi","Invited","Adult","Coming","Not invited"/);

  // Bulk add can put a whole list on the Pooja only.
  await a('POST', '/api/admin/households/bulk', { text: 'Asha Rani\nBimla Rani', events: ['pooja'] });
  const { households } = (await a('GET', '/api/admin/households')).body;
  assert.deepEqual(households.find((x) => x.name === 'Bimla Rani').events, ['pooja']);
});

test('colours can be changed and reset without touching other settings', async () => {
  const a = await adminClient();
  const site = (await a('GET', '/api/content')).body.site;
  const saved = (await a('PUT', '/api/admin/content/site', { ...site, accentColor: '#123456', headingColor: 'red', coupleNames: 'R & A' })).body.site;
  assert.equal(saved.accentColor, '#123456');
  assert.equal(saved.headingColor, '#2b2420'); // not a valid colour, so the default is kept
  const page = await (await fetch(`${base}/`)).text();
  assert.match(page, /--accent: #123456;/);
  const reset = (await a('POST', '/api/admin/content/site/reset', { keys: ['accentColor'] })).body.site;
  assert.equal(reset.accentColor, '#8a6a1f');
  assert.equal(reset.coupleNames, 'R & A');
  await a('POST', '/api/admin/content/site/reset', {});
});
