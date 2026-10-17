'use strict';

// Guest list lookups and RSVP replies.

const { db, transaction } = require('./db');

const TIME_ZONE = process.env.TZ_NAME || 'Europe/London';
const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof', 'sir', 'lady', 'master']);

class RsvpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- dates ----------

function todayLondon(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// Replies can be changed up to and including the deadline day (UK time).
function deadlinePassed(rsvpContent, date = new Date()) {
  return Boolean(rsvpContent.deadline) && todayLondon(date) > rsvpContent.deadline;
}

// ---------- name matching ----------

// "Mrs Priyá  O'Neil-Shah" -> ['priya', 'oneil', 'shah']
function nameTokens(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !TITLES.has(w));
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

// How well a typed name matches a guest's name: 2 = exact, 1 = close enough
// (first and last name match but a middle name was left out or added, or one
// small typo in a longer name), 0 = no match.
function matchScore(typed, guestName) {
  const a = nameTokens(typed);
  const b = nameTokens(guestName);
  if (!a.length || !b.length) return 0;
  if (a.join(' ') === b.join(' ')) return 2;
  if (a.length >= 2 && b.length >= 2 && a[0] === b[0] && a.at(-1) === b.at(-1)) return 1;
  const joinedA = a.join(' ');
  const joinedB = b.join(' ');
  if (a.length >= 2 && b.length >= 2 && joinedA.length >= 8 && editDistance(joinedA, joinedB) <= 1) return 1;
  return 0;
}

// Households whose invited guests (not plus-ones) match the typed name.
// Exact matches win; close matches are only used when there is no exact one.
async function findHouseholds(typed) {
  const guests = await db.all('SELECT id, household_id, name FROM guests WHERE is_plus_one = 0');
  const byScore = { 1: new Set(), 2: new Set() };
  for (const g of guests) {
    const score = matchScore(typed, g.name);
    if (score) byScore[score].add(g.household_id);
  }
  return [...(byScore[2].size ? byScore[2] : byScore[1])];
}

// ---------- reading ----------

function parseJson(value, fallback) {
  try {
    const v = JSON.parse(value);
    return v && typeof v === 'object' ? v : fallback;
  } catch {
    return fallback;
  }
}

async function loadHousehold(id, q = db) {
  const household = await q.get('SELECT * FROM households WHERE id = ?', id);
  if (!household) return null;
  const guests = await q.all('SELECT * FROM guests WHERE household_id = ? ORDER BY is_plus_one, sort, id', id);
  return { household, guests };
}

function guestView(g) {
  return {
    id: g.id,
    name: g.name,
    isChild: Boolean(g.is_child),
    isPlusOne: Boolean(g.is_plus_one),
    attending: g.attending === null || g.attending === undefined ? null : Boolean(g.attending),
    answers: parseJson(g.answers, {}),
  };
}

// What a guest sees of their own invitation.
function inviteView({ household, guests }, rsvpContent) {
  const responded = Boolean(household.responded_at);
  const passed = deadlinePassed(rsvpContent);
  const canReply = rsvpContent.open && (responded ? !passed : !passed || rsvpContent.allowLateReplies);
  return {
    name: household.name,
    plusOnesAllowed: household.plus_ones,
    guests: guests.filter((g) => !g.is_plus_one).map(guestView),
    plusOnes: guests.filter((g) => g.is_plus_one).map(guestView),
    answers: parseJson(household.answers, {}),
    responded,
    respondedAt: household.responded_at,
    updatedAt: household.updated_at,
    canReply,
    deadline: rsvpContent.deadline,
    deadlinePassed: passed,
  };
}

// ---------- summaries for emails and the log ----------

function answerText(question, value) {
  if (value === undefined || value === null || value === '') return '';
  return String(value);
}

function snapshot({ household, guests }, questions) {
  const guestQs = questions.filter((q) => q.scope === 'guest');
  const houseQs = questions.filter((q) => q.scope === 'household');
  const hAnswers = parseJson(household.answers, {});
  return {
    household: household.name,
    guests: guests.map((g) => {
      const v = guestView(g);
      return {
        name: v.name,
        plusOne: v.isPlusOne,
        child: v.isChild,
        attending: v.attending,
        answers: guestQs.map((q) => ({ q: q.label, a: answerText(q, v.answers[q.id]) })).filter((x) => x.a),
      };
    }),
    answers: houseQs.map((q) => ({ q: q.label, a: answerText(q, hAnswers[q.id]) })).filter((x) => x.a),
  };
}

const statusWord = (a) => (a === true ? 'Coming' : a === false ? 'Not coming' : 'No reply');

function countLine(snap) {
  const coming = snap.guests.filter((g) => g.attending === true).length;
  const notComing = snap.guests.filter((g) => g.attending === false).length;
  return `${coming} coming, ${notComing} not coming`;
}

// Plain-language list of what changed between two snapshots.
function diff(before, after) {
  const lines = [];
  const prev = new Map(before.guests.map((g) => [g.name.toLowerCase(), g]));
  const next = new Map(after.guests.map((g) => [g.name.toLowerCase(), g]));
  for (const [key, g] of next) {
    const old = prev.get(key);
    if (!old) {
      lines.push(`${g.name} added${g.plusOne ? ' as a guest' : ''} (${statusWord(g.attending)})`);
      continue;
    }
    if (old.attending !== g.attending) lines.push(`${g.name}: ${statusWord(old.attending)} → ${statusWord(g.attending)}`);
    const oldAnswers = new Map(old.answers.map((x) => [x.q, x.a]));
    const newAnswers = new Map(g.answers.map((x) => [x.q, x.a]));
    for (const q of new Set([...oldAnswers.keys(), ...newAnswers.keys()])) {
      if ((oldAnswers.get(q) || '') !== (newAnswers.get(q) || '')) lines.push(`${g.name}, ${q}: "${oldAnswers.get(q) || '—'}" → "${newAnswers.get(q) || '—'}"`);
    }
  }
  for (const [key, g] of prev) if (!next.has(key)) lines.push(`${g.name} removed`);
  const oldH = new Map(before.answers.map((x) => [x.q, x.a]));
  const newH = new Map(after.answers.map((x) => [x.q, x.a]));
  for (const q of new Set([...oldH.keys(), ...newH.keys()])) {
    if ((oldH.get(q) || '') !== (newH.get(q) || '')) lines.push(`${q}: "${oldH.get(q) || '—'}" → "${newH.get(q) || '—'}"`);
  }
  return lines;
}

// ---------- saving a reply ----------

function readAnswer(q, raw) {
  if (raw === undefined || raw === null) return '';
  if (q.type === 'yesno') {
    if (raw === true || raw === 'Yes') return 'Yes';
    if (raw === false || raw === 'No') return 'No';
    return '';
  }
  const value = String(raw).trim().slice(0, q.type === 'textarea' ? 2000 : 300);
  if (q.type === 'choice' && value && !q.options.includes(value)) throw new RsvpError(400, `Please choose an answer for "${q.label}".`);
  return value;
}

function readAnswers(questions, raw, { strict, who }) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const q of questions) {
    const value = readAnswer(q, src[q.id]);
    if (!value && q.required && strict) throw new RsvpError(400, who ? `Please answer "${q.label}" for ${who}.` : `Please answer "${q.label}".`);
    if (value) out[q.id] = value;
  }
  return out;
}

// Validates and saves a reply for a household. actor is 'guest' or 'admin'
// (admins can skip required questions). Returns what happened, for the log
// and the email.
async function saveReply(householdId, body, rsvpContent, { actor, actorName = '' }) {
  const strict = actor === 'guest';
  const questions = rsvpContent.questions;
  const guestQs = questions.filter((q) => q.scope === 'guest');
  const houseQs = questions.filter((q) => q.scope === 'household');
  const replies = Array.isArray(body?.guests) ? body.guests : [];
  const plusOnesIn = Array.isArray(body?.plusOnes) ? body.plusOnes : [];

  return transaction(async (tx) => {
    // Lock the household so two replies at once can't interleave.
    const current = await loadHousehold(householdId, {
      get: (sql, ...p) => tx.get(`${sql} FOR UPDATE`, ...p),
      all: tx.all,
    });
    if (!current) throw new RsvpError(404, 'Invitation not found.');
    const { household } = current;
    const before = snapshot(current, questions);
    const wasResponded = Boolean(household.responded_at);

    const invited = current.guests.filter((g) => !g.is_plus_one);
    const updates = [];
    for (const g of invited) {
      const reply = replies.find((r) => Number(r?.id) === g.id);
      if (!reply || typeof reply.attending !== 'boolean') throw new RsvpError(400, `Please say whether ${g.name} is coming.`);
      const answers = reply.attending ? readAnswers(guestQs, reply.answers, { strict, who: g.name }) : {};
      updates.push({ id: g.id, attending: reply.attending, answers });
    }

    const plusOnes = [];
    for (const p of plusOnesIn) {
      const name = typeof p?.name === 'string' ? p.name.trim().slice(0, 120) : '';
      if (!name) continue;
      plusOnes.push({ name, answers: readAnswers(guestQs, p.answers, { strict, who: name }) });
    }
    if (plusOnes.length > household.plus_ones) {
      throw new RsvpError(400, household.plus_ones ? `You can add up to ${household.plus_ones} extra guest${household.plus_ones === 1 ? '' : 's'}.` : 'Extra guests are not included in this invitation.');
    }
    const houseAnswers = readAnswers(houseQs, body?.answers, { strict });

    for (const u of updates) {
      await tx.run('UPDATE guests SET attending = ?, answers = ? WHERE id = ?', u.attending ? 1 : 0, JSON.stringify(u.answers), u.id);
    }
    await tx.run('DELETE FROM guests WHERE household_id = ? AND is_plus_one = 1', householdId);
    for (const [i, p] of plusOnes.entries()) {
      await tx.run('INSERT INTO guests (household_id, name, is_plus_one, attending, answers, sort) VALUES (?, ?, 1, 1, ?, ?)', householdId, p.name, JSON.stringify(p.answers), i);
    }
    await tx.run(
      `UPDATE households SET answers = ?, responded_by = ?, responded_at = COALESCE(responded_at, ${db.NOW}),
              updated_at = ${db.NOW}, response_count = response_count + 1 WHERE id = ?`,
      JSON.stringify(houseAnswers), actor === 'admin' ? `admin:${actorName}` : 'guest', householdId
    );

    const saved = await loadHousehold(householdId, tx);
    const after = snapshot(saved, questions);
    const changes = wasResponded ? diff(before, after) : [];
    const action = actor === 'admin' ? 'admin_edit' : wasResponded ? 'updated' : 'submitted';
    const summary = countLine(after);
    await tx.run(
      'INSERT INTO rsvp_log (household_id, household_name, action, actor, summary, changes, snapshot) VALUES (?, ?, ?, ?, ?, ?, ?)',
      householdId, household.name, action, actor === 'admin' ? actorName : 'Guest', summary, JSON.stringify(changes), JSON.stringify(after)
    );
    return { saved, snapshot: after, changes, action, summary, firstReply: !wasResponded };
  });
}

// Admin: wipe a reply so the household shows as "not replied" again.
async function clearReply(householdId, actorName) {
  return transaction(async (tx) => {
    const household = await tx.get('SELECT * FROM households WHERE id = ?', householdId);
    if (!household) throw new RsvpError(404, 'Invitation not found.');
    await tx.run("UPDATE guests SET attending = NULL, answers = '{}' WHERE household_id = ?", householdId);
    await tx.run('DELETE FROM guests WHERE household_id = ? AND is_plus_one = 1', householdId);
    await tx.run("UPDATE households SET answers = '{}', responded_by = NULL, responded_at = NULL, updated_at = NULL, response_count = 0 WHERE id = ?", householdId);
    await tx.run(
      'INSERT INTO rsvp_log (household_id, household_name, action, actor, summary) VALUES (?, ?, ?, ?, ?)',
      householdId, household.name, 'cleared', actorName, 'Reply cleared: now shows as not replied'
    );
  });
}

module.exports = {
  RsvpError,
  todayLondon,
  deadlinePassed,
  nameTokens,
  matchScore,
  findHouseholds,
  loadHousehold,
  guestView,
  inviteView,
  snapshot,
  diff,
  countLine,
  saveReply,
  clearReply,
  parseJson,
};
