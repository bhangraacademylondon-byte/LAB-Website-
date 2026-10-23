// Shared facts for the public pages: when classes next run, calendar files,
// the academy's links, and the few icons the design uses.

import { html, raw, formatTime, safeUrl } from './lib.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ZONE = 'Europe/London';

// Wall-clock "now" in London, as plain numbers.
function londonNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'long' })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  return { y: +parts.year, m: +parts.month, d: +parts.day, hh: +parts.hour % 24, mm: +parts.minute, weekday: DAYS.indexOf(parts.weekday) };
}

// The next time a weekly class starts (today if it hasn't started yet).
export function nextClass(c, now = londonNow()) {
  const day = DAYS.indexOf(c.day);
  const [sh, sm] = String(c.start || '00:00').split(':').map(Number);
  if (day < 0 || Number.isNaN(sh)) return null;
  let ahead = (day - now.weekday + 7) % 7;
  if (ahead === 0 && now.hh * 60 + now.mm >= sh * 60 + sm) ahead = 7;
  const date = new Date(Date.UTC(now.y, now.m - 1, now.d + ahead));
  const minutes = ahead * 1440 + (sh * 60 + sm) - (now.hh * 60 + now.mm);
  return { date, minutes };
}

export function untilText(minutes) {
  if (minutes < 60) return `starts in ${Math.max(1, minutes)} minutes`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days === 0) return `today, in ${hours} hour${hours === 1 ? '' : 's'}`;
  if (days === 1) return `tomorrow`;
  return `in ${days} days`;
}

export const longDate = (d) => d.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const pad = (n) => String(n).padStart(2, '0');

// A weekly repeating calendar event for the chosen class.
export function icsFor(c, next, site) {
  const ymd = `${next.date.getUTCFullYear()}${pad(next.date.getUTCMonth() + 1)}${pad(next.date.getUTCDate())}`;
  const t = (hhmm) => String(hhmm || '').replace(':', '') + '00';
  const esc = (s) => String(s || '').replace(/[\\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
  const end = c.end || c.start;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//London Academy of Bhangra//Class//EN', 'BEGIN:VEVENT',
    `UID:${ymd}-${t(c.start)}-${encodeURIComponent(c.name)}@lab`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART;TZID=${ZONE}:${ymd}T${t(c.start)}`, `DTEND;TZID=${ZONE}:${ymd}T${t(end)}`,
    'RRULE:FREQ=WEEKLY',
    `SUMMARY:${esc(c.name)} · ${esc(site.name)}`,
    `LOCATION:${esc(c.location || site.address)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

// A UK postcode reads as one thing, so its two halves never wrap apart.
export const keepPostcode = (s) => String(s || '').replace(/\b([A-Z]{1,2}\d[A-Z\d]?) (\d[A-Z]{2})\b/g, '$1 $2');

// "The Royal Liberty School, Gidea Park, RM2 6HJ" -> ["The Royal Liberty School", "Gidea Park, RM2 6HJ"]
export function splitAddress(address) {
  const parts = String(address || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return [parts[0] || '', ''];
  return [parts[0], parts.slice(1).join(', ')];
}

export const mapsHref = (site) => (site.mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.mapQuery)}` : '');
export const telHref = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;
export const firstPhone = (site) => (site.phones || []).filter(Boolean)[0] || '';
export const firstPlan = (pricing) => (pricing.plans || []).find((p) => p && p.price);
export const classDays = (classes) => [...new Set((classes || []).map((c) => c.day).filter(Boolean))];
// "7:30pm" -> "7:30", for big figures where the suffix sits beside them.
export const clockFace = (hhmm) => formatTime(hhmm).replace(/(am|pm)$/, '');

// "Word **word**" -> escaped HTML with the starred words picked out.
export function marked(text, tag = 'b') {
  const e = String(text || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  return raw(e.replace(/\*\*(.+?)\*\*/g, `<${tag}>$1</${tag}>`));
}

// A title in two voices: everything but the last word, then the last word in gold.
export function twoLines(title) {
  const words = String(title || '').trim().split(/\s+/);
  if (words.length < 2) return [words[0] || '', ''];
  return [words.slice(0, -1).join(' '), words[words.length - 1]];
}

const svg = (body, extra = '') => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`);
export const ICON = {
  arrow: svg('<path d="M5 12h13M13 6l6 6-6 6"/>', ' stroke-width="2.6"'),
  pin: svg('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>', ' stroke-width="2"'),
  phone: svg('<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2"/>', ' stroke-width="1.9"'),
  insta: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>', ' stroke-width="2"'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>', ' stroke-width="1.9"'),
};

// Get directions: the big pill and its round pin, or nothing if no map location is set.
export function directions(site, { shimmer = false } = {}) {
  const href = mapsHref(site);
  if (!href) return '';
  return html`<a class="cta-pill ${shimmer ? 'shimmer' : ''}" href="${href}" target="_blank" rel="noopener">Get directions</a><a class="cta-ring" href="${href}" target="_blank" rel="noopener" aria-label="Get directions to ${site.address || site.name}">${ICON.pin}</a>`;
}

export function goLink(label, href) {
  return html`<a class="go-link" href="${safeUrl(href)}">${label} <span class="circ" aria-hidden="true">${ICON.arrow}</span></a>`;
}
