'use strict';

const defaults = require('./defaultContent');
const { getSetting, setSetting } = require('./db');

const SECTIONS = Object.keys(defaults);
const BUILT_IN_PAGES = ['home', 'about', 'timetable', 'pricing', 'gallery', 'contact', 'performances', 'workshops', 'faq'];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Make a list item's fields the same kind as the starter item's (list, object
// or plain value), without copying the starter item's text into it.
function sanitiseItem(template, item) {
  const out = { ...item };
  for (const [key, value] of Object.entries(template)) {
    if (!(key in out)) continue;
    if (Array.isArray(value)) {
      out[key] = Array.isArray(out[key]) ? out[key].filter((v) => v !== null && v !== undefined && typeof v !== 'object') : [];
    } else if (isPlainObject(value)) {
      if (!isPlainObject(out[key])) out[key] = {};
    } else if (out[key] !== null && typeof out[key] === 'object') {
      out[key] = typeof value === 'boolean' ? false : '';
    }
  }
  return out;
}

// Fill in any keys missing from saved content with their defaults, so new
// fields added in later versions of the app show up without a migration.
// Values of the wrong type (e.g. text where a list belongs, from the Advanced
// editor) fall back to the default so the site and scanner never break.
function mergeDefaults(base, saved) {
  if (Array.isArray(base)) {
    if (!Array.isArray(saved)) return structuredClone(base);
    const template = base[0];
    if (template === undefined) return saved.filter((item) => item !== null && item !== undefined);
    if (!isPlainObject(template)) return saved.filter((item) => item !== null && item !== undefined && typeof item !== 'object');
    return saved.filter(isPlainObject).map((item) => sanitiseItem(template, item));
  }
  if (!isPlainObject(base)) {
    if (saved === undefined || saved === null || typeof saved === 'object') return base;
    return typeof base === 'boolean' ? Boolean(saved) : saved;
  }
  if (!isPlainObject(saved)) return structuredClone(base);
  const out = { ...saved };
  for (const [key, value] of Object.entries(base)) {
    out[key] = key in saved ? mergeDefaults(value, saved[key]) : structuredClone(value);
  }
  return out;
}

function normaliseNav(nav, customPages) {
  const items = Array.isArray(nav) ? nav.filter((n) => isPlainObject(n) && typeof n.id === 'string') : [];
  const known = new Set([...BUILT_IN_PAGES, ...customPages.map((p) => `page:${p.slug}`)]);
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!known.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    // The Contact tab's old default name becomes "Contact us"; a name an admin chose stays.
    const label = item.id === 'contact' && item.label === 'Contact' ? 'Contact us' : String(item.label || item.id);
    out.push({ id: item.id, label, visible: item.visible !== false });
  }
  // Any page missing from the nav list (e.g. a newly added custom page) is appended.
  for (const id of known) {
    if (seen.has(id)) continue;
    const def = defaults.nav.find((n) => n.id === id);
    const page = customPages.find((p) => `page:${p.slug}` === id);
    out.push({ id, label: def ? def.label : page.title, visible: true });
  }
  return out;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const RETIRED_DEFAULTS = [
  ['pricing', 'notes', 'Payment is cash only at the class.'],
  ['pricing', 'notes', 'Pay at the class by cash or card.'],
  ...require('./retiredDefaults'),
];

function normalise(content) {
  const merged = mergeDefaults(defaults, isPlainObject(content) ? content : {});
  for (const key of Object.keys(merged)) if (!SECTIONS.includes(key)) delete merged[key];

  const pages = Array.isArray(merged.customPages) ? merged.customPages.filter(isPlainObject) : [];
  const slugs = new Set(BUILT_IN_PAGES);
  merged.customPages = [];
  for (const page of pages) {
    let slug = slugify(page.slug || page.title);
    if (!slug || slugs.has(slug) || ['login', 'register', 'account', 'admin', 'api', 'uploads'].includes(slug)) {
      slug = `${slug || 'page'}-${merged.customPages.length + 1}`;
    }
    slugs.add(slug);
    merged.customPages.push({
      slug,
      title: String(page.title || 'Untitled page'),
      intro: String(page.intro || ''),
      body: String(page.body || ''),
      image: String(page.image || ''),
    });
  }
  merged.nav = normaliseNav(merged.nav, merged.customPages);

  // Phone numbers became named contacts. Content saved before then has only the
  // numbers: keep them, naming each from the defaults where the number matches.
  const savedSite = isPlainObject(content?.site) ? content.site : {};
  const digits = (p) => String(p || '').replace(/\D/g, '');
  if (!Array.isArray(savedSite.contacts) && Array.isArray(savedSite.phones)) {
    merged.site.contacts = savedSite.phones
      .filter((p) => typeof p === 'string' && p.trim())
      .map((phone) => ({ name: defaults.site.contacts.find((c) => digits(c.phone) === digits(phone))?.name || '', phone }));
  }
  merged.site.contacts = merged.site.contacts
    .map((c) => ({ name: String(c.name || '').trim(), phone: String(c.phone || '').trim() }))
    .filter((c) => digits(c.phone));
  delete merged.site.phones;

  // The "Monthly unlimited" plan was withdrawn; it goes from saved pricing too, unless it was edited.
  merged.pricing.plans = (merged.pricing.plans || []).filter((p) => !(p?.name === 'Monthly unlimited' && p?.price === 'Ask us'));

  // Wording we have since corrected, replaced only where it was never edited.
  for (const [section, key, old] of RETIRED_DEFAULTS) {
    if (JSON.stringify(merged[section][key]) === JSON.stringify(old)) merged[section][key] = structuredClone(defaults[section][key]);
  }
  // An empty version would let everyone skip the privacy policy, so never allow it.
  merged.privacy.version = String(merged.privacy.version || '').trim().slice(0, 40) || defaults.privacy.version;
  return merged;
}

// The content is read on almost every request, so a copy is kept in memory.
// It is re-read from the database every few seconds, because during a deploy
// (or on a host running several copies of the app) another copy may have saved.
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

async function saveContent(content) {
  const clean = normalise(content);
  await setSetting('content', clean);
  cache = clean;
  loadedAt = Date.now();
  return structuredClone(clean);
}

// Saves one section (e.g. the home page) on top of the latest saved content,
// so an editor opened earlier can never undo changes made to other sections.
async function saveSection(section, value) {
  if (!SECTIONS.includes(section)) throw new Error('Unknown section');
  const latest = normalise(await getSetting('content', {}));
  latest[section] = value;
  return saveContent(latest);
}

async function resetSection(section) {
  return saveSection(section, structuredClone(defaults[section]));
}

module.exports = { init, refreshIfStale, getContent, saveContent, saveSection, resetSection, SECTIONS };
