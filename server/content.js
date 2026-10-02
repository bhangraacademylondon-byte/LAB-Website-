'use strict';

const defaults = require('./defaultContent');
const { getSetting, setSetting } = require('./db');

const SECTIONS = Object.keys(defaults);
const BUILT_IN_PAGES = ['home', 'about', 'timetable', 'pricing', 'gallery', 'contact'];

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
    out.push({ id: item.id, label: String(item.label || item.id), visible: item.visible !== false });
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
  return merged;
}

function getContent() {
  return normalise(getSetting('content', {}));
}

function saveContent(content) {
  const clean = normalise(content);
  setSetting('content', clean);
  return clean;
}

function resetSection(section) {
  if (!SECTIONS.includes(section)) throw new Error('Unknown section');
  const current = getContent();
  current[section] = structuredClone(defaults[section]);
  return saveContent(current);
}

module.exports = { getContent, saveContent, resetSection, SECTIONS };
