// Public website: home, our story, venue, getting there, FAQ and RSVP.
// Pages under /admin are handled by admin.js.

import { html, raw, mount, api, el, formatText, safeImg, safeUrl, longDate, daysUntil, formatDateTime, toast, withBusy } from './lib.js';

export let C = null; // website content

const PAGES = [
  { path: '/', key: 'home' },
  { path: '/our-story', key: 'story' },
  { path: '/venue', key: 'venue' },
  { path: '/getting-there', key: 'travel' },
  { path: '/faq', key: 'faq' },
  { path: '/rsvp', key: 'rsvp' },
];

// ---------- larger text ----------

function readLargeText() {
  try {
    return localStorage.getItem('largeText') === '1';
  } catch {
    return false;
  }
}

function applyLargeText(on) {
  document.documentElement.classList.toggle('large-text', on);
  const btn = document.getElementById('text-size');
  btn.setAttribute('aria-pressed', String(on));
  btn.querySelector('.text-size-label').textContent = on ? 'Normal text' : 'Larger text';
}

applyLargeText(readLargeText());
document.getElementById('text-size').addEventListener('click', () => {
  const on = !document.documentElement.classList.contains('large-text');
  applyLargeText(on);
  try {
    localStorage.setItem('largeText', on ? '1' : '0');
  } catch {
    /* private browsing: the setting just isn't remembered */
  }
});

// ---------- menu & routing ----------

const menuToggle = document.getElementById('menu-toggle');
const siteNav = document.getElementById('site-nav');
menuToggle.addEventListener('click', () => {
  const open = !siteNav.classList.contains('open');
  siteNav.classList.toggle('open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
});

export function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  route();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || a.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || a.hasAttribute('download') || /^\/(api|uploads)\//.test(url.pathname) || /\.\w+$/.test(url.pathname)) return;
  e.preventDefault();
  navigate(url.pathname + url.search);
});
window.addEventListener('popstate', route);

function visiblePages() {
  return PAGES.filter((p) => C[p.key].visible !== false);
}

function renderChrome(path) {
  const { site } = C;
  document.getElementById('brand').textContent = site.coupleNames;
  mount('#nav-list', visiblePages().map((p) => html`<li><a href="${p.path}" class="${p.key === 'rsvp' ? 'nav-rsvp' : ''}" ${raw(path === p.path ? 'aria-current="page"' : '')}>${C[p.key].label}</a></li>`));
  siteNav.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
  mount('#footer', html`
    <div class="names">${site.coupleNames}</div>
    ${site.eventDate ? html`<div>${longDate(site.eventDate)}</div>` : ''}
    ${site.contactText ? html`<p style="margin-top:14px">${site.contactText}</p>` : ''}
    <p>
      ${site.contactPhone ? html`<a href="tel:${site.contactPhone.replace(/[^\d+]/g, '')}">📞 ${site.contactPhone}</a>` : ''}
      ${site.contactPhone && site.contactEmail ? raw(' &nbsp;·&nbsp; ') : ''}
      ${site.contactEmail ? html`<a href="mailto:${site.contactEmail}">✉️ ${site.contactEmail}</a>` : ''}
    </p>
    ${site.footerNote ? html`<p>${site.footerNote}</p>` : ''}
    <a class="admin-link" href="/admin">Admin</a>
  `);
}

async function loadContent() {
  C = await api('/api/content');
  document.documentElement.style.setProperty('--accent', C.site.accentColor);
  document.documentElement.style.setProperty('--bg', C.site.backgroundColor);
}
export async function reloadContent() {
  await loadContent();
}

async function route() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (!C) await loadContent();
  renderChrome(path);
  const main = document.getElementById('main');
  if (path === '/admin' || path.startsWith('/admin/')) {
    const admin = await import('./admin.js');
    await admin.render(path, main);
    return;
  }
  const page = PAGES.find((p) => p.path === path && C[p.key].visible !== false);
  document.title = `${C.site.coupleNames} · ${page && page.key !== 'home' ? C[page.key].label : C.site.eventTitle}`;
  if (!page) mount(main, notFound());
  else if (page.key === 'rsvp') renderRsvp(main);
  else mount(main, RENDER[page.key]());
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

function notFound() {
  return html`<section class="page"><div class="container center"><h1>Page not found</h1><p><a class="btn" href="/">Go to the home page</a></p></div></section>`;
}

function pageHead(heading, intro) {
  return html`<div class="page-head"><h1>${heading}</h1><div class="ornament" aria-hidden="true">✦</div>${intro ? html`<div class="intro">${formatText(intro)}</div>` : ''}</div>`;
}

// ---------- pages ----------

function venueQuery() {
  const v = C.venue;
  return [v.name, v.address.replace(/\n/g, ', '), v.postcode].filter(Boolean).join(', ');
}
const mapsLink = () => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueQuery())}`;

function deadlineNotice() {
  const { rsvp } = C;
  if (!rsvp.open || !rsvp.deadline) return '';
  const days = daysUntil(rsvp.deadline);
  if (days < 0) return '';
  return html`<div class="notice center">Please reply by ${longDate(rsvp.deadline)}</div>`;
}

const RENDER = {
  home() {
    const { site, home, venue } = C;
    const img = safeImg(home.image);
    const days = daysUntil(site.eventDate);
    return html`<section class="hero"><div class="container">
      ${img ? html`<div class="hero-image"><img src="${img}" alt="${site.coupleNames}"></div>` : ''}
      ${home.kicker ? html`<div class="kicker">${home.kicker}</div>` : ''}
      <h1>${home.heading}</h1>
      ${home.subheading ? html`<div class="sub">${home.subheading}</div>` : ''}
      <div class="ornament" aria-hidden="true">✦</div>
      <div class="event-facts">
        <div class="fact"><div class="label">Date</div><div class="value">${site.eventDate ? longDate(site.eventDate) : 'To be announced'}</div></div>
        ${site.eventTime ? html`<div class="fact"><div class="label">Time</div><div class="value">${site.eventTime}</div></div>` : ''}
        ${venue.name ? html`<div class="fact"><div class="label">Venue</div><div class="value">${venue.visible ? html`<a href="/venue">${venue.name}</a>` : venue.name}</div></div>` : ''}
      </div>
      ${home.showCountdown && days !== null && days > 0 ? html`<p class="countdown">${days === 1 ? 'Tomorrow!' : `${days} days to go`}</p>` : ''}
      ${home.showCountdown && days === 0 ? html`<p class="countdown">It's today!</p>` : ''}
      ${home.intro ? html`<div class="prose" style="max-width:640px;margin:20px auto 0;font-size:1.1rem">${formatText(home.intro)}</div>` : ''}
      ${deadlineNotice()}
      <p style="margin-top:22px"><a class="btn btn-big" href="/rsvp">${home.buttonText || 'RSVP'}</a></p>
    </div></section>`;
  },

  story() {
    const { story } = C;
    return html`<section class="page"><div class="container">
      ${pageHead(story.heading, story.intro)}
      ${story.chapters.map((ch) => {
        const img = safeImg(ch.image);
        return html`<div class="chapter ${img ? 'has-image' : ''}">
          ${img ? html`<div class="chapter-image"><img src="${img}" alt="${ch.title}" loading="lazy"></div>` : ''}
          <div class="card">
            ${ch.when ? html`<div class="when">${ch.when}</div>` : ''}
            ${ch.title ? html`<h2>${ch.title}</h2>` : ''}
            <div class="prose">${formatText(ch.text)}</div>
          </div>
        </div>`;
      })}
    </div></section>`;
  },

  venue() {
    const { venue } = C;
    const img = safeImg(venue.image);
    return html`<section class="page"><div class="container">
      ${pageHead(venue.heading, '')}
      ${img ? html`<img class="photo" src="${img}" alt="${venue.name}" style="max-height:420px">` : ''}
      <div class="card">
        <h2>${venue.name}</h2>
        <div class="address">${venue.address}</div>
        ${venue.postcode ? html`<div class="label">Postcode for your sat nav</div><div class="postcode">${venue.postcode}</div>` : ''}
        <div class="btn-row">
          <a class="btn" href="${mapsLink()}" target="_blank" rel="noopener">📍 Open in Google Maps</a>
          ${venue.phone ? html`<a class="btn btn-outline" href="tel:${venue.phone.replace(/[^\d+]/g, '')}">📞 Call the venue</a>` : ''}
          ${venue.website ? html`<a class="btn btn-outline" href="${safeUrl(venue.website)}" target="_blank" rel="noopener">Venue website</a>` : ''}
        </div>
      </div>
      ${venue.text ? html`<div class="card prose">${formatText(venue.text)}</div>` : ''}
      ${venue.showMap ? html`<iframe class="map" title="Map showing ${venue.name}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${encodeURIComponent(venueQuery())}&output=embed"></iframe>` : ''}
      ${C.travel.visible ? html`<p class="center" style="margin-top:24px"><a class="btn btn-outline" href="/getting-there">${C.travel.label}: directions & parking</a></p>` : ''}
    </div></section>`;
  },

  travel() {
    const { travel, venue } = C;
    return html`<section class="page"><div class="container">
      ${pageHead(travel.heading, travel.intro)}
      <div class="card">
        <h2 style="font-size:1.6rem">${venue.name}</h2>
        <div class="address">${venue.address}</div>
        ${venue.postcode ? html`<div class="postcode">${venue.postcode}</div>` : ''}
        <div class="btn-row"><a class="btn" href="${mapsLink()}" target="_blank" rel="noopener">📍 Directions in Google Maps</a></div>
      </div>
      ${travel.sections.map((s) => html`<div class="card travel-section">${s.title ? html`<h3>${s.title}</h3>` : ''}<div class="prose">${formatText(s.text)}</div></div>`)}
    </div></section>`;
  },

  faq() {
    const { faq, site } = C;
    return html`<section class="page"><div class="container">
      ${pageHead(faq.heading, faq.intro)}
      <div class="faq">
        ${faq.items.map((item) => html`<details><summary>${item.q}</summary><div class="answer prose">${formatText(item.a)}</div></details>`)}
      </div>
      ${site.contactText ? html`<div class="card center" style="margin-top:28px"><p>${site.contactText}</p>
        ${site.contactPhone ? html`<p><a class="btn btn-outline" href="tel:${site.contactPhone.replace(/[^\d+]/g, '')}">📞 ${site.contactPhone}</a></p>` : ''}</div>` : ''}
    </div></section>`;
  },
};

// ---------- RSVP ----------

const TOKEN_KEY = 'rsvpToken';
const store = {
  get() {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(v) {
    try {
      if (v) sessionStorage.setItem(TOKEN_KEY, v);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* not remembered: they'll just type their name again */
    }
  },
};

let R = null; // RSVP state for this visit

function resetRsvp() {
  R = { step: 'lookup', token: null, invite: null, matches: [], draft: null, error: '', name: '', justSent: false };
}

function contactLine() {
  const { site } = C;
  const bits = [];
  if (site.contactPhone) bits.push(html`<a href="tel:${site.contactPhone.replace(/[^\d+]/g, '')}">${site.contactPhone}</a>`);
  if (site.contactEmail) bits.push(html`<a href="mailto:${site.contactEmail}">${site.contactEmail}</a>`);
  return bits.length ? html`<p>Contact us: ${bits.map((b, i) => html`${i ? ' or ' : ''}${b}`)}</p>` : '';
}

async function renderRsvp(main) {
  if (!R) resetRsvp();
  // Coming back to the page within a few hours keeps their place.
  if (!R.invite && store.get()) {
    R.token = store.get();
    try {
      R.invite = (await api('/api/rsvp/invite', { headers: { 'X-RSVP-Token': R.token } })).invite;
      R.step = 'overview';
    } catch {
      store.set(null);
      resetRsvp();
    }
  }
  drawRsvp(main);
}

function drawRsvp(main = document.getElementById('main')) {
  const { rsvp } = C;
  const body = el('div', { class: 'container' });
  body.innerHTML = String(pageHead(rsvp.heading, R.step === 'lookup' ? rsvp.intro : ''));
  const wrap = el('section', { class: 'page' }, body);

  if (!rsvp.open) {
    body.append(el('div', { class: 'card center' }, el('p', { text: rsvp.notOpenText })));
  } else if (R.step === 'lookup') body.append(lookupStep());
  else if (R.step === 'choose') body.append(chooseStep());
  else if (R.step === 'overview') body.append(overviewStep());
  else if (R.step === 'form') body.append(formStep());
  else if (R.step === 'review') body.append(reviewStep());

  main.replaceChildren(wrap);
  window.scrollTo(0, 0);
  const first = main.querySelector('[data-autofocus]');
  if (first) first.focus();
}

function stepper(current) {
  const steps = ['Find your invitation', 'Your reply', 'Check & send'];
  return el('ol', { class: 'steps', 'aria-label': 'Steps' }, steps.map((s, i) => el('li', { class: i === current ? 'current' : '', 'aria-current': i === current ? 'step' : null, text: `${i + 1}. ${s}` })));
}

function errorBox(message) {
  return el('div', { class: 'form-error', role: 'alert', text: message || '' });
}

function lookupStep() {
  const { rsvp } = C;
  const input = el('input', { type: 'text', id: 'lookup-name', name: 'name', autocomplete: 'name', autocapitalize: 'words', value: R.name, 'data-autofocus': true, required: true });
  const error = el('div', { class: 'form-error', role: 'alert' });
  if (R.error) {
    error.innerHTML = String(html`<p style="margin:0 0 6px">${R.error}</p>${contactLine()}`);
  }
  const button = el('button', { class: 'btn btn-big btn-block', type: 'submit', text: 'Find my invitation' });
  const form = el('form', { class: 'card', novalidate: true },
    el('label', { for: 'lookup-name', text: rsvp.lookupLabel }),
    el('span', { class: 'help', text: rsvp.lookupHelp }),
    input,
    error,
    el('div', { style: 'margin-top:18px' }, button)
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    R.name = input.value.trim();
    if (!R.name) {
      R.error = 'Please type your first name and last name.';
      drawRsvp();
      return;
    }
    await withBusy(button, async () => {
      try {
        const { matches } = await api('/api/rsvp/lookup', { method: 'POST', body: { name: R.name } });
        if (!matches.length) {
          R.error = rsvp.notFoundText;
          drawRsvp();
          return;
        }
        R.error = '';
        if (matches.length === 1) await openInvite(matches[0].token);
        else {
          R.matches = matches;
          R.step = 'choose';
          drawRsvp();
        }
      } catch (err) {
        R.error = err.message;
        drawRsvp();
      }
    });
  });
  return el('div', {}, stepper(0), form);
}

async function openInvite(token) {
  const { invite } = await api('/api/rsvp/invite', { headers: { 'X-RSVP-Token': token } });
  R.token = token;
  R.invite = invite;
  store.set(token);
  R.step = invite.responded || !invite.canReply ? 'overview' : 'form';
  R.draft = null;
  drawRsvp();
}

function chooseStep() {
  return el('div', {}, stepper(0),
    el('div', { class: 'card' },
      el('h2', { text: 'Which invitation is yours?' }),
      el('p', { text: 'More than one invitation has that name. Please choose the one with your family on it.' }),
      el('div', { class: 'match-list' }, R.matches.map((m) => el('button', {
        class: 'btn btn-outline btn-block', type: 'button',
        text: `Invitation for ${listNames(m.firstNames)}`,
        onclick: () => openInvite(m.token).catch((err) => toast(err.message, 'error')),
      }))),
      el('div', { class: 'btn-row' }, el('button', { class: 'link-btn', type: 'button', text: '← Search for a different name', onclick: startAgain }))
    )
  );
}

// "Hello Raj, Priya & Anil"
function greeting(inv) {
  return `Hello ${listNames(inv.guests.map((g) => g.name.trim().split(/\s+/)[0]))}`;
}

function listNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;
}

function startAgain() {
  store.set(null);
  resetRsvp();
  drawRsvp();
}

// Their current reply, with the option to change it while they still can.
function overviewStep() {
  const { rsvp } = C;
  const inv = R.invite;
  const everyone = [...inv.guests, ...inv.plusOnes];
  const anyComing = everyone.some((g) => g.attending === true);
  const box = el('div', {});
  if (R.justSent) {
    box.append(el('div', { class: 'card thanks' },
      el('div', { class: 'big', 'aria-hidden': 'true', text: anyComing ? '♥' : '✉' }),
      el('h2', { text: anyComing ? rsvp.thankYouComing : rsvp.thankYouNotComing }),
      el('p', { class: 'muted', text: 'Your reply has been sent to us.' })
    ));
  }
  const card = el('div', { class: 'card' });
  if (inv.responded) {
    card.append(
      el('h2', { text: R.justSent ? 'Your reply' : greeting(inv) }),
      el('p', { class: 'muted', text: `${R.justSent ? 'Sent' : 'You replied'} on ${formatDateTime(inv.updatedAt || inv.respondedAt, { day: 'numeric', month: 'long', year: 'numeric' })}.` }),
      replySummary(inv)
    );
    if (inv.canReply) {
      card.append(
        el('p', { text: inv.deadline ? `You can change your reply until ${longDate(inv.deadline)}.` : 'You can change your reply at any time.' }),
        el('div', { class: 'btn-row' },
          el('button', { class: 'btn', type: 'button', text: 'Change my reply', onclick: () => { R.step = 'form'; R.draft = null; R.justSent = false; drawRsvp(); } }),
          el('a', { class: 'btn btn-outline', href: '/', text: 'Back to home page' })
        )
      );
    } else {
      const closed = el('div', { class: 'notice' });
      closed.innerHTML = String(html`${rsvp.closedText}${contactLine()}`);
      card.append(closed);
    }
  } else {
    // Not replied, and replies are closed.
    const closed = el('div', {});
    closed.innerHTML = String(html`<h2>${greeting(inv)}</h2><p>${rsvp.closedText}</p>${contactLine()}`);
    card.append(closed);
  }
  card.append(el('div', { class: 'btn-row' }, el('button', { class: 'link-btn', type: 'button', text: 'Not you? Search for a different name', onclick: startAgain })));
  box.append(card);
  return box;
}

function statusBadge(attending) {
  if (attending === true) return el('span', { class: 'badge yes', text: `✓ ${C.rsvp.attendingLabel}` });
  if (attending === false) return el('span', { class: 'badge no', text: C.rsvp.notAttendingLabel });
  return el('span', { class: 'badge none', text: 'No reply yet' });
}

function replySummary(inv, draft = null) {
  const qs = C.rsvp.questions;
  const guestQs = qs.filter((q) => q.scope === 'guest');
  const houseQs = qs.filter((q) => q.scope === 'household');
  const people = draft
    ? [
        ...inv.guests.map((g) => ({ name: g.name, attending: draft.guests[g.id].attending, answers: draft.guests[g.id].answers })),
        ...draft.plusOnes.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), attending: true, answers: p.answers, plusOne: true })),
      ]
    : [...inv.guests, ...inv.plusOnes.map((p) => ({ ...p, plusOne: true }))];
  const answers = draft ? draft.answers : inv.answers;
  const list = el('ul', { class: 'summary-list' }, people.map((p) => el('li', {},
    el('div', { style: 'display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center' },
      el('strong', { text: p.name + (p.plusOne ? ' (your guest)' : '') }), statusBadge(p.attending)),
    p.attending ? guestQs.filter((q) => p.answers?.[q.id]).map((q) => el('div', { class: 'muted', text: `${q.label}: ${p.answers[q.id]}` })) : []
  )));
  const extra = houseQs.filter((q) => answers?.[q.id]).map((q) => el('p', {}, el('strong', { text: `${q.label}: ` }), String(answers[q.id])));
  return el('div', {}, list, extra);
}

function makeDraft(inv) {
  const draft = { guests: {}, plusOnes: [], answers: { ...inv.answers } };
  for (const g of inv.guests) draft.guests[g.id] = { attending: g.attending, answers: { ...g.answers } };
  draft.plusOnes = inv.plusOnes.map((p) => ({ name: p.name, answers: { ...p.answers } }));
  return draft;
}

let fieldSeq = 0;
function questionField(q, answers) {
  const id = `q${++fieldSeq}`;
  const value = answers[q.id] || '';
  const wrap = el('div', { class: 'field' });
  const labelText = q.label + (q.required ? ' *' : '');
  const help = q.help ? el('span', { class: 'help', id: `${id}-help`, text: q.help }) : null;
  const set = (v) => {
    if (v) answers[q.id] = v;
    else delete answers[q.id];
  };
  if (q.type === 'choice' || q.type === 'yesno') {
    const options = q.type === 'yesno' ? ['Yes', 'No'] : q.options;
    const group = el('fieldset', { style: 'border:none;padding:0;margin:0' },
      el('legend', { class: 'label', text: labelText }), help,
      el('div', { class: 'option-list' }, options.map((opt) => el('label', {},
        el('input', { type: 'radio', name: id, value: opt, checked: value === opt, onchange: () => set(opt) }), opt)))
    );
    wrap.append(group);
    return wrap;
  }
  const input = q.type === 'textarea'
    ? el('textarea', { id, rows: 3, 'aria-describedby': help ? `${id}-help` : null })
    : el('input', { type: 'text', id, 'aria-describedby': help ? `${id}-help` : null });
  input.value = value;
  input.addEventListener('input', () => set(input.value.trim()));
  wrap.append(...[el('label', { for: id, text: labelText }), help, input].filter(Boolean));
  return wrap;
}

function formStep() {
  const { rsvp } = C;
  const inv = R.invite;
  if (!R.draft) R.draft = makeDraft(inv);
  const draft = R.draft;
  const guestQs = rsvp.questions.filter((q) => q.scope === 'guest');
  const houseQs = rsvp.questions.filter((q) => q.scope === 'household');
  const error = errorBox(R.error);

  const guestCard = (g) => {
    const d = draft.guests[g.id];
    const card = el('div', { class: `guest-card ${d.attending === true ? 'is-yes' : d.attending === false ? 'is-no' : ''}` });
    const choose = (value) => {
      d.attending = value;
      R.error = '';
      redrawKeepingScroll();
    };
    card.append(
      el('div', { class: 'guest-name', text: g.name }),
      el('div', { class: 'choice-pair', role: 'group', 'aria-label': `Is ${g.name} coming?` },
        el('button', { type: 'button', class: 'yes', 'aria-pressed': String(d.attending === true), onclick: () => choose(true) },
          el('span', { class: 'tick', 'aria-hidden': 'true', text: d.attending === true ? '✓' : '○' }), rsvp.attendingLabel),
        el('button', { type: 'button', class: 'no', 'aria-pressed': String(d.attending === false), onclick: () => choose(false) },
          el('span', { class: 'tick', 'aria-hidden': 'true', text: d.attending === false ? '✓' : '○' }), rsvp.notAttendingLabel)
      )
    );
    if (d.attending === true && guestQs.length) card.append(el('div', { class: 'guest-questions' }, guestQs.map((q) => questionField(q, d.answers))));
    return card;
  };

  const plusOneSection = () => {
    if (!inv.plusOnesAllowed) return null;
    const section = el('div', { class: 'card' },
      el('h2', { text: inv.plusOnesAllowed === 1 ? 'Bringing a guest?' : 'Bringing guests?' }),
      el('p', { text: `${rsvp.plusOnesText} (up to ${inv.plusOnesAllowed})` })
    );
    draft.plusOnes.forEach((p, i) => {
      const nameId = `plus-${i}`;
      const nameInput = el('input', { type: 'text', id: nameId, autocomplete: 'off', autocapitalize: 'words' });
      nameInput.value = p.name;
      nameInput.addEventListener('input', () => { p.name = nameInput.value; });
      section.append(el('div', { class: 'guest-card is-yes' },
        el('div', { class: 'field' }, el('label', { for: nameId, text: `Your guest's full name` }), nameInput),
        guestQs.map((q) => questionField(q, p.answers)),
        el('button', { type: 'button', class: 'link-btn', text: `Remove this guest`, onclick: () => { draft.plusOnes.splice(i, 1); redrawKeepingScroll(); } })
      ));
    });
    if (draft.plusOnes.length < inv.plusOnesAllowed) {
      section.append(el('button', { type: 'button', class: 'btn btn-outline', text: '+ Add a guest', onclick: () => { draft.plusOnes.push({ name: '', answers: {} }); redrawKeepingScroll(`#plus-${draft.plusOnes.length - 1}`); } }));
    }
    return section;
  };

  const next = el('button', { class: 'btn btn-big btn-block', type: 'button', text: 'Next: check your reply' });
  next.addEventListener('click', () => {
    const problem = checkDraft(inv, draft);
    R.error = problem;
    if (problem) {
      error.textContent = problem;
      error.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    R.step = 'review';
    drawRsvp();
  });

  return el('div', {},
    stepper(1),
    el('div', { class: 'card' },
      el('h2', { text: greeting(inv) }),
      el('p', { text: inv.guests.length > 1 ? 'Please tell us who is coming. Choose an answer for each person.' : 'Please tell us if you can come.' }),
      inv.guests.map(guestCard)
    ),
    plusOneSection(),
    houseQs.length ? el('div', { class: 'card' }, houseQs.map((q) => questionField(q, draft.answers))) : null,
    error,
    next,
    el('div', { class: 'btn-row' }, el('button', { class: 'link-btn', type: 'button', text: inv.responded ? '← Cancel, keep my reply as it was' : '← Not you? Search for a different name', onclick: () => { if (inv.responded) { R.step = 'overview'; R.draft = null; R.error = ''; drawRsvp(); } else startAgain(); } }))
  );
}

function redrawKeepingScroll(focusSelector) {
  const y = window.scrollY;
  drawRsvp();
  window.scrollTo(0, y);
  if (focusSelector) document.querySelector(focusSelector)?.focus();
}

function checkDraft(inv, draft) {
  const qs = C.rsvp.questions;
  for (const g of inv.guests) {
    const d = draft.guests[g.id];
    if (typeof d.attending !== 'boolean') return `Please choose "${C.rsvp.attendingLabel}" or "${C.rsvp.notAttendingLabel}" for ${g.name}.`;
    if (d.attending) {
      for (const q of qs) if (q.scope === 'guest' && q.required && !d.answers[q.id]) return `Please answer "${q.label}" for ${g.name}.`;
    }
  }
  for (const p of draft.plusOnes) {
    if (!p.name.trim()) {
      if (Object.keys(p.answers).length) return "Please type your guest's name, or remove them.";
      continue;
    }
    for (const q of qs) if (q.scope === 'guest' && q.required && !p.answers[q.id]) return `Please answer "${q.label}" for ${p.name.trim()}.`;
  }
  for (const q of qs) if (q.scope === 'household' && q.required && !draft.answers[q.id]) return `Please answer "${q.label}".`;
  return '';
}

function reviewStep() {
  const inv = R.invite;
  const draft = R.draft;
  const error = errorBox('');
  const send = el('button', { class: 'btn btn-big btn-block', type: 'button', text: 'Send my reply' });
  send.addEventListener('click', () => withBusy(send, async () => {
    const body = {
      guests: inv.guests.map((g) => ({ id: g.id, attending: draft.guests[g.id].attending, answers: draft.guests[g.id].answers })),
      plusOnes: draft.plusOnes.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), answers: p.answers })),
      answers: draft.answers,
    };
    try {
      const result = await api('/api/rsvp/reply', { method: 'POST', body, headers: { 'X-RSVP-Token': R.token } });
      R.invite = result.invite;
      R.draft = null;
      R.justSent = true;
      R.step = 'overview';
      drawRsvp();
    } catch (err) {
      if (err.status === 401) {
        toast(err.message, 'error', 6000);
        startAgain();
        return;
      }
      error.textContent = err.message;
    }
  }));
  return el('div', {},
    stepper(2),
    el('div', { class: 'card' },
      el('h2', { text: 'Please check your reply' }),
      replySummary(inv, draft),
      error,
      send,
      el('div', { class: 'btn-row' }, el('button', { class: 'btn btn-outline btn-block', type: 'button', text: '← Go back and change something', onclick: () => { R.step = 'form'; drawRsvp(); } }))
    )
  );
}

// ---------- start ----------

route().catch((err) => {
  mount('#main', html`<section class="page"><div class="container center"><h1>Sorry, something went wrong</h1><p>${err.message}</p><p><a class="btn" href="/">Try again</a></p></div></section>`);
});

