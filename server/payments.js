'use strict';

// Paying for a class. Members pay online through the academy's Monzo payment
// link for a particular class date; the website can't see into Monzo, so a
// payment counts once the member confirms it went through ("claimed"), and
// whoever checks Monzo can mark it "received" or "not received". Teachers
// record cash and card payments at the door. A payment stays on its class date
// even if the member misses the class.

const { db } = require('./db');

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PAID = ['claimed', 'received'];
const REF_MAX = 30;

const londonToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

// The amount in pence from a price such as "£7" or "£7.50".
function pence(price) {
  const m = String(price || '').replace(/,/g, '').match(/(\d+)(?:\.(\d{1,2}))?/);
  return m ? Number(m[1]) * 100 + Number((m[2] || '0').padEnd(2, '0')) : 0;
}

// The next class dates from the timetable, starting today.
function upcomingDates(classes, count = 8) {
  const days = new Set((classes || []).filter((c) => c && c.name).map((c) => String(c.day || '').toLowerCase()));
  const out = [];
  const d = new Date(`${londonToday()}T12:00:00Z`);
  for (let i = 0; out.length < count && i < 120; i++) {
    if (days.has(DAYS[d.getUTCDay()].toLowerCase())) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// e.g. "LAB-K7M2QX 29OCT SIMRAN KAUR": member ID, class date and name, so the
// payment can be matched in Monzo. A long name is shortened, then initials.
function reference(member, date) {
  const [, m, d] = date.split('-').map(Number);
  const base = `${member.member_id} ${String(d).padStart(2, '0')}${MONTHS[m - 1]}`;
  const words = String(member.name || '').toUpperCase().replace(/[^A-Z\s'-]/g, '').split(/\s+/).filter(Boolean);
  const room = REF_MAX - base.length - 1;
  const options = [
    words.join(' '),
    words.length > 1 ? `${words[0]} ${words.at(-1)[0]}` : words[0] || '',
    words.map((w) => w[0]).join(''),
  ];
  const name = options.find((o) => o && o.length <= room) || '';
  return name ? `${base} ${name}` : base;
}

const PUBLIC_FIELDS = `p.id, p.class_date AS date, p.method, p.status, p.amount_pence AS "amountPence", p.reference,
  p.created_at AS "createdAt", p.claimed_at AS "claimedAt", p.checked_at AS "checkedAt"`;

async function forMember(userId) {
  return db.all(`SELECT ${PUBLIC_FIELDS} FROM class_payments p WHERE p.user_id = ? AND p.status <> 'started' ORDER BY p.class_date DESC`, userId);
}

async function find(userId, date) {
  return db.get(`SELECT ${PUBLIC_FIELDS} FROM class_payments p WHERE p.user_id = ? AND p.class_date = ?`, userId, date);
}

async function forDate(date) {
  return db.all(
    `SELECT ${PUBLIC_FIELDS}, u.id AS "userId", u.name, u.member_id AS "memberId", cb.name AS "checkedBy",
            EXISTS (SELECT 1 FROM attendance a JOIN class_sessions s ON s.id = a.session_id WHERE a.user_id = u.id AND s.date = p.class_date) AS attended
       FROM class_payments p JOIN users u ON u.id = p.user_id
       LEFT JOIN users cb ON cb.id = p.checked_by
      WHERE p.class_date = ? AND p.status <> 'started'
      ORDER BY u.name`,
    date
  );
}

module.exports = { pence, upcomingDates, reference, forMember, find, forDate, londonToday, PAID };
