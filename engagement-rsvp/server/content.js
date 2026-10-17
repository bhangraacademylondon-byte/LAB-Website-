'use strict';

const crypto = require('node:crypto');
const defaults = require('./defaultContent');
const { getSetting, setSetting } = require('./db');

const SECTIONS = Object.keys(defaults);
const QUESTION_TYPES = ['text', 'textarea', 'choice', 'yesno'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

const text = (v, fallback = '', max = 20_000) => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v) : fallback);

// Make saved content match the shape of the defaults: missing keys get their
// default, values of the wrong type fall back, and unknown keys are dropped.
// List items are checked against the first default item's fields.
function conform(base, saved) {
  if (Array.isArray(base)) {
    if (!Array.isArray(saved)) return structuredClone(base);
    const template = base[0];
    if (!isPlainObject(template)) return saved.filter((v) => typeof v === 'string');
    return saved.filter(isPlainObject).slice(0, 200).map((item) => {
      const out = {};
      for (const [key, value] of Object.entries(template)) {
        if (Array.isArray(value)) out[key] = Array.isArray(item[key]) ? item[key].filter((v) => typeof v === 'string').map((v) => v.slice(0, 200)) : [];
        else if (typeof value === 'boolean') out[key] = Boolean(item[key]);
        else out[key] = text(item[key]);
      }
      return out;
    });
  }
  if (isPlainObject(base)) {
    const src = isPlainObject(saved) ? saved : {};
    const out = {};
    for (const [key, value] of Object.entries(base)) out[key] = key in src ? conform(value, src[key]) : structuredClone(value);
    return out;
  }
  if (typeof base === 'boolean') return saved === undefined || saved === null ? base : Boolean(saved);
  return text(saved, base);
}

function cleanQuestions(questions) {
  const seen = new Set();
  return questions
    .filter((q) => q.label.trim())
    .map((q) => {
      let id = q.id.replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
      if (!id || seen.has(id)) id = `q_${crypto.randomBytes(4).toString('hex')}`;
      seen.add(id);
      const type = QUESTION_TYPES.includes(q.type) ? q.type : 'text';
      const options = type === 'choice' ? [...new Set(q.options.map((o) => o.trim()).filter(Boolean))].slice(0, 30) : [];
      return {
        id,
        scope: q.scope === 'household' ? 'household' : 'guest',
        type: type === 'choice' && !options.length ? 'text' : type,
        label: q.label.trim().slice(0, 300),
        help: q.help.slice(0, 500),
        options,
        required: q.required,
      };
    });
}

// Each event keeps a stable id, because invitations and replies refer to it.
function cleanEvents(items) {
  const seen = new Set();
  return items
    .filter((e) => e.name.trim())
    .map((e) => {
      let id = e.id.replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
      if (!id || seen.has(id)) id = `e_${crypto.randomBytes(4).toString('hex')}`;
      seen.add(id);
      return { ...e, id, name: e.name.trim().slice(0, 120), date: DATE_RE.test(e.date) ? e.date : '' };
    });
}

const COLOR_KEYS = Object.keys(defaults.site).filter((k) => k.endsWith('Color'));

function normalise(content) {
  const out = conform(defaults, content);
  const { site, rsvp } = out;
  for (const key of COLOR_KEYS) if (!COLOR_RE.test(site[key])) site[key] = defaults.site[key];
  if (!DATE_RE.test(rsvp.deadline)) rsvp.deadline = '';
  rsvp.questions = cleanQuestions(rsvp.questions);
  out.events.items = cleanEvents(out.events.items);
  // There must always be at least one event to invite people to.
  if (!out.events.items.length) out.events.items = structuredClone(defaults.events.items);
  return out;
}

// The content is read on almost every request, so a copy is kept in memory.
// It is re-read from the database every few seconds, because during a deploy
// another copy of the app may have saved.
const MAX_AGE_MS = 2000;
let cache = null;
let loadedAt = 0;

async function init() {
  cache = normalise(await getSetting('content', {}));
  loadedAt = Date.now();
  return cache;
}

async function refreshIfStale() {
  if (!cache || Date.now() - loadedAt > MAX_AGE_MS) await init();
}

function getContent() {
  if (!cache) throw new Error('Content not loaded yet: call content.init() first.');
  return structuredClone(cache);
}

// Saves one section (e.g. the venue page) on top of the latest saved content,
// so an editor opened earlier can never undo changes made to other sections.
async function saveSection(section, value) {
  if (!SECTIONS.includes(section)) throw new Error('Unknown section');
  const latest = normalise(await getSetting('content', {}));
  latest[section] = value;
  const clean = normalise(latest);
  await setSetting('content', clean);
  cache = clean;
  loadedAt = Date.now();
  return structuredClone(clean);
}

// Puts a section back to its starter content, or just some of its fields.
async function resetSection(section, keys = null) {
  if (!keys) return saveSection(section, structuredClone(defaults[section]));
  const value = normalise(await getSetting('content', {}))[section];
  for (const key of keys) if (key in defaults[section]) value[key] = structuredClone(defaults[section][key]);
  return saveSection(section, value);
}

module.exports = { init, refreshIfStale, getContent, saveSection, resetSection, normalise, SECTIONS, COLOR_KEYS };
