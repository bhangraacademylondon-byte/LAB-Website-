import {
  api, html, raw, mount, esc, safeUrl, safeImg, formatText, toast, formatDate, formatDateTime, formatTime,
  formError, formData, withBusy, initials, el, openDialog,
} from './lib.js';
import { renderHome as renderHomePage } from './home.js';
import {
  nextClass, untilText, longDate, icsFor, keepPostcode, mapsHref, telHref, firstPlan, classDays, clockFace, contacts,
  marked, twoLines, ICON, directions, goLink, whatsappButton,
} from './classes.js';
import { blurFade, numberTickers, enableRipples, confetti } from './effects.js';
import { trackPage, trackEvent } from './track.js';

export const state = { content: null, user: null, stats: null };

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const main = () => document.getElementById('main');

// ---------- header, menu & footer ----------

function applyTheme() {
  const { site } = state.content;
  document.getElementById('brand-logo').src = safeImg(site.logo) || '/img/logo.webp';
  document.getElementById('brand-short').textContent = site.shortName || site.name;
  document.getElementById('brand-name').textContent = site.name;
  document.getElementById('brand').setAttribute('aria-label', `${site.name}, home`);
}

function pageHref(id) {
  if (id === 'home') return '/';
  if (id.startsWith('page:')) return `/p/${id.slice(5)}`;
  return `/${id}`;
}

const BUTTON_STYLES = { Gold: 'btn-accent', Navy: 'btn-primary', White: 'btn-light', Outline: 'btn-outline' };

function buttons(list, extraClass = '') {
  const items = (list || []).filter((b) => b && b.label);
  if (!items.length) return '';
  return html`<div class="btn-row ${extraClass}">${items.map((b) => {
    const href = safeUrl(b.link);
    const external = /^https?:/i.test(href);
    return html`<a class="btn ${BUTTON_STYLES[b.style] || 'btn-primary'}" href="${href}"${raw(external ? ' target="_blank" rel="noopener"' : '')}>${b.label}</a>`;
  })}</div>`;
}

// A short note beside a page in the menu ("Thursdays, 7:30pm", "£7 per class").
function menuNote(id) {
  const { timetable, pricing } = state.content;
  const classes = (timetable.classes || []).filter((c) => c && c.name);
  if (id === 'timetable' && classes.length) {
    const days = classDays(classes);
    return `${days.length === 1 ? `${days[0]}s` : 'Weekly'}, ${formatTime(classes[0].start)}`;
  }
  const plan = firstPlan(pricing);
  if (id === 'pricing' && plan) return [`${plan.price} ${plan.period || ''}`.trim(), pricing.payment].filter(Boolean).join(' · ');
  return '';
}

function renderHeader() {
  const { nav, home, site, members } = state.content;
  const path = location.pathname;
  const visible = nav.filter((n) => n.visible && n.id !== 'home');
  const isCurrent = (href) => href === path || (href !== '/' && path.startsWith(href + '/'));
  const current = (href) => raw(isCurrent(href) ? ' aria-current="page"' : '');
  const u = state.user;

  // On wide screens: the timetable first, then the gallery and joining (or your account).
  const lead = visible.find((n) => n.id === 'timetable');
  const featured = visible.filter((n) => n.id === 'gallery');
  const own = u ? { label: site.accountButtonLabel || 'My account', href: '/account' }
    : members.allowRegistration ? { label: 'Join the LAB', href: '/register' } : { label: site.loginButtonLabel || 'Member login', href: '/login' };
  mount('#mnav-links', html`
    ${lead ? html`<a class="first" href="${pageHref(lead.id)}"${current(pageHref(lead.id))}>${lead.label} <span class="circ" aria-hidden="true">${ICON.arrow}</span></a><span class="sep" aria-hidden="true"></span>` : ''}
    ${featured.map((n) => html`<a href="${pageHref(n.id)}"${current(pageHref(n.id))}>${n.label}</a>`)}
    <a href="${own.href}"${current(own.href)}>${own.label}</a>`);

  const people = contacts(site);
  const call = document.getElementById('call-btn');
  call.hidden = !people.length;
  call.setAttribute('aria-haspopup', people.length > 1 ? 'dialog' : 'false');
  call.setAttribute('aria-label', people.length === 1 ? `Call ${people[0].name || 'us'} on ${people[0].phone}` : 'Call us');
  mount('#hdr-cta', directions(site, { shimmer: true }));

  // The menu, in three groups: classes, booking us, and about the academy (which
  // also takes any extra pages and the Contact page, where the details live).
  let i = 0;
  const item = (label, href, note = '') => html`<li style="--i:${i++}"><a href="${href}"${current(href)}>${label}${note ? html` <small>${note}</small>` : ''}</a></li>`;
  const inGroup = (ids) => visible.filter((n) => ids.includes(n.id));
  const classes = inGroup(['timetable', 'pricing', 'faq']);
  const booking = inGroup(['performances', 'workshops']);
  const rest = visible.filter((n) => !classes.includes(n) && !booking.includes(n));
  const group = (title, body, extra = '') => html`
    <div class="mgroup"><h3>${title}</h3><ul>${body}</ul>${extra}</div>`;
  const account = u
    ? html`<p class="msmall">${u.role !== 'member' ? html`<a href="/admin">${u.role === 'admin' ? 'Admin' : 'Teacher'}</a><span aria-hidden="true">·</span>` : ''}<button type="button" id="menu-logout">Log out</button></p>`
    : html`<p class="msmall">Already a member? <a href="/login">${site.loginButtonLabel || 'Member login'}</a></p>`;
  mount('#menu-inner', html`
    <div class="mgroups">
      ${group('Classes', html`
        ${classes.map((n) => item(n.label, pageHref(n.id), menuNote(n.id)))}
        ${u ? item(site.accountButtonLabel || 'My account', '/account', 'Your pass and classes')
          : members.allowRegistration ? item('Join the LAB', '/register', 'Get your member pass') : ''}`, account)}
      ${booking.length ? group('Book us', booking.map((n) => item(n.label, pageHref(n.id)))) : ''}
      ${rest.length ? group('About LAB', rest.map((n) => item(n.label, pageHref(n.id), menuNote(n.id)))) : ''}
    </div>`);
  document.getElementById('menu-logout')?.addEventListener('click', logout);

  // Teachers on a phone get a one-tap shortcut to the QR scanner on every page.
  const fab = document.getElementById('scan-fab');
  fab.hidden = !u || u.role === 'member' || path.startsWith('/admin/scanner') || path.startsWith('/admin/debriefs');

  const bar = document.getElementById('announcement');
  if (home.announcement?.enabled && home.announcement.text) {
    bar.textContent = home.announcement.text;
    bar.hidden = false;
  } else bar.hidden = true;
}

function renderFooter() {
  const { site, nav, timetable, pricing, privacy } = state.content;
  const year = new Date().getFullYear();
  const classes = (timetable.classes || []).filter((c) => c && c.name);
  const days = classDays(classes);
  const plan = firstPlan(pricing);
  const [a, b] = (() => {
    const words = String(site.name).split(/\s+/);
    const cut = words.findIndex((w, k) => k > 0 && /^(of|and|&)$/i.test(w));
    return cut > 0 ? [words.slice(0, cut).join(' '), words.slice(cut).join(' ')] : twoLines(site.name);
  })();
  const handle = String(site.socials?.instagram || '').replace(/\/+$/, '').split('/').pop();

  // The ticker: the class's facts, scrolling slowly above the footer.
  const facts = [
    days.length === 1 ? `Every ${days[0]}` : days.length ? days.map((d) => `${d}s`).join(' & ') : '',
    classes[0] ? formatTime(classes[0].start) : '',
    site.address,
    plan ? `${plan.price} ${plan.period || ''}`.trim() : '',
    pricing.payment,
    classes[0]?.ages || '',
  ].filter(Boolean);
  const ticker = document.getElementById('ticker');
  ticker.hidden = !facts.length;
  ticker.setAttribute('aria-label', facts.join('. '));
  mount(ticker, html`<div class="ticker-track" aria-hidden="true">${[1, 2, 3, 4].map(() => html`<span>${facts.join(' · ')}</span>`)}</div>`);

  mount('#footer', html`
    <div>
      <div class="fl">${a} <span>${b}</span></div>
      ${site.footerText ? html`<p style="margin-top:14px">${site.footerText}</p>` : ''}
    </div>
    <div>
      <h2>${site.footerContactTitle || 'Contact us'}</h2>
      <ul>
        ${contacts(site).map((c) => html`<li><a href="${telHref(c.phone)}">${c.name ? `${c.name}: ` : ''}${c.phone}</a></li>`)}
        ${site.email ? html`<li><a href="mailto:${site.email}">${site.email}</a></li>` : ''}
        ${site.address ? html`<li>${keepPostcode(site.address)}</li>` : ''}
      </ul>
    </div>
    <div>
      <h2>${days.length === 1 ? `Every ${days[0]}` : 'Classes'}</h2>
      <ul>
        ${classes.map((c) => html`<li>${formatTime(c.start)}${c.end ? ` to ${formatTime(c.end)}` : ''}${classes.length > 1 ? ` · ${c.name}` : ''}</li>`)}
        ${plan ? html`<li>${plan.price} ${plan.period || ''}</li>` : ''}
        ${handle ? html`<li><a href="${safeUrl(site.socials.instagram)}" target="_blank" rel="noopener">@${handle}</a></li>` : ''}
      </ul>
    </div>
    <div>
      <h2>${site.footerExploreTitle || 'Explore'}</h2>
      <ul>
        ${nav.filter((n) => n.visible).map((n) => html`<li><a href="${pageHref(n.id)}">${n.label}</a></li>`)}
        <li><a href="/login">${site.loginButtonLabel || 'Member login'}</a></li>
      </ul>
    </div>
    <div class="base">
      <span>${site.copyrightText || `© ${year} ${site.name}`}</span>
      <a href="/privacy">${privacy.title}</a>
    </div>`);
}

// The top of every inner page: the title in two voices, the introduction and actions beside it.
function pageHead(title, intro, { second = '', actions = '' } = {}) {
  const [a, b] = second ? [title, second] : twoLines(title);
  return html`
    <section class="page-head">
      <h1>${a}${b ? html` <span>${b}</span>` : ''}</h1>
      <div>
        ${intro ? html`<p>${marked(intro)}</p>` : ''}
        ${actions ? html`<div class="p-actions">${actions}</div>` : ''}
      </div>
    </section>`;
}

// A heading in two voices: "Meet the <span>team</span>".
function h2(text, extra = '') {
  const [a, b] = twoLines(text);
  return html`<h2 class="p-h2" ${raw(extra)}>${a}${b ? html` <span>${b}</span>` : ''}</h2>`;
}

function setTitle(title) {
  const name = state.content.site.name;
  document.title = title ? `${title} | ${name}` : name;
}

function mapEmbed(query) {
  if (!query) return '';
  const src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  return html`<iframe class="map-embed" src="${src}" loading="lazy" title="Map" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
}

const TONES = ['t-gold', 't-deep', 't-cream'];

// ---------- public pages ----------

function groupByDay(classes) {
  const groups = new Map();
  const sorted = [...classes].sort((a, b) => {
    const da = DAYS.indexOf(a.day);
    const db = DAYS.indexOf(b.day);
    return (da < 0 ? 99 : da) - (db < 0 ? 99 : db) || String(a.start).localeCompare(String(b.start));
  });
  for (const c of sorted) {
    if (!groups.has(c.day)) groups.set(c.day, []);
    groups.get(c.day).push(c);
  }
  return groups;
}

function renderHome() {
  renderHomePage({ state, main, setTitle, onLeave });
}

// ----- Performances and Workshops: booking pages with the same layout -----

function renderService(key) {
  const page = state.content[key];
  setTitle(page.title);
  const hero = safeImg(page.heroImage);
  const items = (page.items || []).filter(Boolean);
  const facts = (page.facts || []).filter((f) => f && f.label && f.value);
  const photos = (page.gallery || []).filter((g) => g && safeImg(g.image));
  const enquire = page.buttonLabel ? html`<a class="cta-pill gold" href="${safeUrl(page.buttonLink)}">${page.buttonLabel}</a>` : '';
  mount(main(), html`
    <section class="p-sec svc-hero-wrap">
      <div class="tile svc-hero ${hero ? 'has-photo' : 't-deep'}" style="${hero ? `--pic:url('${hero.replace(/['\\\n]/g, '')}')` : ''}">
        <h1>${page.title}</h1>
        ${page.tagline ? html`<p class="svc-tag">${page.tagline}</p>` : ''}
      </div>
    </section>
    <section class="p-sec tg2 p-split svc-intro" data-fade style="align-items:stretch">
      <div class="tile t-white tile-card">
        ${h2(page.introTitle, 'style="margin:0"')}
        ${page.intro ? html`<div class="p-body">${formatText(page.intro)}</div>` : ''}
        ${enquire ? html`<div class="p-actions" style="margin-top:8px">${enquire}</div>` : ''}
      </div>
      ${items.length ? html`
      <div class="tile t-gold tile-card">
        <span class="tile-no">${page.listTitle}</span>
        <ol class="svc-list">${items.map((it, k) => html`<li><span>${String(k + 1).padStart(2, '0')}</span>${it}</li>`)}</ol>
      </div>` : ''}
    </section>
    ${facts.length ? html`
    <section class="p-sec svc-facts" data-fade style="grid-template-columns:repeat(${Math.min(facts.length, 3)},minmax(0,1fr))">
      ${facts.map((f, k) => html`<div class="tile ${['t-deep', 't-cream', 't-mid'][k % 3]} tile-card"><span class="tile-no">${f.label}</span><p class="svc-fact">${f.value}</p></div>`)}
    </section>` : ''}
    ${page.featureTitle ? html`
    <section class="p-sec" data-fade>
      <div class="tile t-dark tile-card svc-feature">
        <div>
          ${h2(page.featureTitle, 'style="margin:0"')}
          ${page.featureSubtitle ? html`<p class="svc-sub">${page.featureSubtitle}</p>` : ''}
        </div>
        <div>
          ${page.featureText ? html`<p>${page.featureText}</p>` : ''}
          ${enquire ? html`<div class="p-actions" style="margin-top:14px">${enquire}</div>` : ''}
        </div>
      </div>
    </section>` : ''}
    ${photos.length || state.user?.role === 'admin' ? html`
    <section class="p-sec">
      ${h2(page.galleryTitle)}
      ${photos.length ? html`
      <div class="tg3 svc-gallery" data-fade>${photos.map((g) => html`
        <figure class="tile svc-photo"><img src="${safeImg(g.image)}" alt="${g.caption || ''}" loading="lazy">${g.caption ? html`<figcaption>${g.caption}</figcaption>` : ''}</figure>`)}
      </div>` : html`
      <div class="tg3 svc-gallery">${[0, 1, 2].map(() => html`<a class="tile t-cream svc-photo svc-empty" href="/admin/content/${key}">+ Add a photo in Admin</a>`)}</div>
      <p class="small muted" style="margin-top:10px">Only admins see this until photos are added.</p>`}
    </section>` : ''}`);

  // The title's longest word always fits the tile, whatever the phone's text size setting.
  const title = main().querySelector('.svc-hero h1');
  const fit = () => {
    title.style.fontSize = '';
    let size = parseFloat(getComputedStyle(title).fontSize);
    while (title.scrollWidth > title.clientWidth + 1 && size > 20) {
      size -= 2;
      title.style.fontSize = `${size}px`;
    }
  };
  fit();
  document.fonts?.ready.then(fit);
  addEventListener('resize', fit);
  onLeave(() => removeEventListener('resize', fit));
}

// ----- FAQs: questions that open with a tap -----

function renderFaq() {
  const { faq, site } = state.content;
  setTitle(faq.title);
  const items = (faq.items || []).filter((q) => q && q.question);
  mount(main(), html`
    ${pageHead(faq.title, faq.intro)}
    <section class="p-sec">
      <div class="faq-list" data-fade>
        ${items.map((q, k) => html`
          <details class="tile t-white faq-item" ${raw(k === 0 ? 'open' : '')}>
            <summary><span class="tile-no">${String(k + 1).padStart(2, '0')}</span><span class="faq-q">${q.question}</span><span class="faq-icon" aria-hidden="true"></span></summary>
            <div class="p-body faq-a">${formatText(q.answer)}</div>
          </details>`)}
      </div>
    </section>
    ${faq.ctaTitle ? html`
    <section class="p-sec" data-fade>
      <div class="tile t-dark tile-card svc-feature">
        <div>${h2(faq.ctaTitle, 'style="margin:0"')}</div>
        <div>
          ${faq.ctaText ? html`<p>${faq.ctaText}</p>` : ''}
          <div class="p-actions" style="margin-top:14px">${whatsappButton(site)}<a class="cta-pill light" href="/contact">Send a message</a></div>
        </div>
      </div>
    </section>` : ''}`);
}

function renderAbout() {
  const { about } = state.content;
  setTitle(about.title);
  const img = safeImg(about.image);
  const founders = (about.founders || []).filter((f) => f && f.name);
  const values = (about.values || []).filter((v) => v && v.title);
  mount(main(), html`
    ${pageHead(about.title, about.intro)}
    ${about.story ? html`
    <section class="p-sec tg2 p-split" data-fade style="${img ? '' : 'grid-template-columns:1fr'}">
      <div class="tile t-white tile-card" style="justify-content:center"><div class="p-body" style="max-width:62ch">${formatText(about.story)}</div></div>
      ${img ? html`<div class="tile tile-photo"><img src="${img}" alt="" loading="lazy"></div>` : ''}
    </section>` : ''}
    ${founders.length ? html`
    <section class="p-sec">
      ${h2(about.teamTitle)}
      <div class="tg2" data-fade>
        ${founders.map((f, k) => html`
          <div class="tile t-dark tile-card person-tile">
            ${safeImg(f.image)
              ? html`<img src="${safeImg(f.image)}" alt="${f.name}" loading="lazy" style="width:38%;aspect-ratio:1;object-fit:cover;border-radius:16px;flex:none">`
              : html`<div aria-hidden="true" style="width:38%;aspect-ratio:1;border-radius:16px;flex:none;display:grid;place-items:center;background:var(--navy-2);font:900 clamp(32px,4vw,56px)/1 var(--display);color:var(--gold)">${initials(f.name)}</div>`}
            <div style="display:grid;gap:10px;min-width:0">
              <span class="tile-no">${String(k + 1).padStart(2, '0')}${f.role ? ` · ${f.role}` : ''}</span>
              <h3>${f.name}</h3>
              ${f.bio ? html`<p>${f.bio}</p>` : ''}
            </div>
          </div>`)}
      </div>
    </section>` : ''}
    ${values.length ? html`
    <section class="p-sec">
      ${h2(about.valuesTitle)}
      <div class="tg3" data-fade>
        ${values.map((v, k) => html`<div class="tile ${TONES[k % 3]} tile-card"><span class="tile-no">${String(k + 1).padStart(2, '0')}</span><h3>${v.title}</h3>${v.text ? html`<p>${v.text}</p>` : ''}</div>`)}
      </div>
    </section>` : ''}`);
}

// One class as a wide navy tile: the start time big, the details, and when it next runs.
function classTile(c, k, site) {
  const next = nextClass(c);
  const plan = firstPlan(state.content.pricing);
  return html`
    <div class="tile t-deep tile-card class-tile">
      <div class="big-num" style="color:var(--gold)" data-count="${clockFace(c.start)}">${clockFace(c.start)}</div>
      <div style="display:grid;gap:8px;min-width:0">
        <span class="tile-no">A${k + 1}${c.day ? ` · ${c.day}` : ''} · ${formatTime(c.start)}${c.end ? ` to ${formatTime(c.end)}` : ''}</span>
        <h3>${c.name}</h3>
        <p>${[c.level, c.ages].filter(Boolean).join(' · ')}</p>
        ${c.notes ? html`<p style="opacity:.8">${c.notes}</p>` : ''}
        ${c.location ? html`<p style="opacity:.8">${keepPostcode(c.location)}</p>` : ''}
      </div>
      ${next ? html`
      <div style="display:grid;gap:10px;justify-items:start">
        <p><b>Next: ${longDate(next.date)}</b><br><span style="opacity:.75">${untilText(next.minutes)}${plan ? ` · ${plan.price} ${plan.period || ''}` : ''}</span></p>
        <a class="cta-pill gold" data-ics="${k}" href="#" download="${String(c.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics">Add to my calendar</a>
      </div>` : ''}
    </div>`;
}

function renderTimetable() {
  const { timetable, site } = state.content;
  setTitle(timetable.title);
  const classes = [...groupByDay((timetable.classes || []).filter((c) => c && c.name)).values()].flat();
  const days = classDays(classes);
  const showMap = timetable.showMap && site.mapQuery;
  const before = String(timetable.notes || '').split(/\n+|(?<=\.)\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
  mount(main(), html`
    ${pageHead(timetable.title, timetable.intro, { second: days.length === 1 ? `every ${days[0]}` : '', actions: directions(site) })}
    <section class="p-sec" style="display:grid;gap:var(--gap)">
      <h2 class="sr-only">Classes</h2>
      ${classes.length ? classes.map((c, k) => classTile(c, k, site)) : html`<div class="tile t-white tile-card"><p>${timetable.emptyText}</p></div>`}
    </section>
    ${timetable.venueTitle || timetable.venueText || showMap ? html`
    <section class="p-sec tg2 p-split" data-fade style="${showMap ? '' : 'grid-template-columns:1fr'}">
      <div class="tile t-white tile-card">
        ${h2(timetable.venueTitle, 'style="margin:0"')}
        <div class="p-body">${formatText(timetable.venueText)}</div>
        <div class="p-actions" style="margin-top:10px">${directions(site)}${timetable.venueButton?.label ? html`<span style="margin-left:18px">${goLink(timetable.venueButton.label, timetable.venueButton.link)}</span>` : ''}</div>
      </div>
      ${showMap ? html`<div class="tile t-mid map-tile">${mapEmbed(site.mapQuery)}</div>` : ''}
    </section>` : ''}
    ${before.length ? html`
    <section class="p-sec">
      ${h2('Before you come')}
      <div class="tg3" data-fade>${before.map((t, k) => html`<div class="tile ${['t-gold', 't-cream', 't-dark'][k % 3]} tile-card"><span class="tile-no">${String(k + 1).padStart(2, '0')}</span><h3>${t.replace(/\.$/, '')}</h3></div>`)}</div>
    </section>` : ''}`);

  // Each class's calendar file is made when its button is pressed.
  main().querySelectorAll('[data-ics]').forEach((a) => {
    const c = classes[Number(a.dataset.ics)];
    const next = nextClass(c);
    if (!next) return;
    a.href = URL.createObjectURL(new Blob([icsFor(c, next, site)], { type: 'text/calendar' }));
  });
}

function renderPricing() {
  const { pricing } = state.content;
  setTitle(pricing.title);
  const plan = firstPlan(pricing);
  const plans = (pricing.plans || []).filter((p) => p && p.name);
  mount(main(), html`
    ${pageHead(pricing.title, pricing.intro, { second: plan ? `${plan.price} ${String(plan.period || '').replace(/^per /, 'a ')}` : '' })}
    <section class="p-sec tg3" data-fade style="${plans.length < 3 ? `grid-template-columns:repeat(${Math.max(1, plans.length)},minmax(0,1fr))` : ''}">
      ${plans.map((p, k) => html`
        <div class="tile ${TONES[k % 3]} tile-card">
          <span class="tile-no">A${k + 1} · ${p.name}${p.highlight && pricing.highlightBadge ? ` · ${pricing.highlightBadge}` : ''}</span>
          <div class="big-num ${/\d/.test(p.price) ? '' : 'sm'}" ${raw(/^\D?\d+$/.test(p.price) ? `data-count="${p.price.replace(/\D/g, '')}"` : '')}>${p.price}</div>
          ${p.period ? html`<p><b>${p.period}</b></p>` : ''}
          ${p.description ? html`<p>${p.description}</p>` : ''}
          ${(p.features || []).filter(Boolean).length ? html`<p>${(p.features || []).filter(Boolean).join(' · ')}</p>` : ''}
        </div>`)}
    </section>
    ${pricing.notes || pricing.ctaButton?.label ? html`
    <section class="p-sec" data-fade>
      <div class="tile t-dark tile-card p-split" style="display:grid;grid-template-columns:1.2fr 1fr;gap:28px;align-items:center">
        <div class="p-body" style="color:#fff;font-size:18px">${formatText(pricing.notes)}</div>
        ${pricing.ctaButton?.label ? html`<div><a class="cta-pill gold" href="${safeUrl(pricing.ctaButton.link)}">${pricing.ctaButton.label}</a></div>` : ''}
      </div>
    </section>` : ''}`);
}

// ----- Instagram grid & lightbox -----

function instaItem(p, i) {
  const icon = p.type === 'VIDEO' ? '▶' : p.type === 'CAROUSEL_ALBUM' ? '❐' : '';
  return html`
    <a class="gallery-item" href="${safeUrl(p.permalink)}" target="_blank" rel="noopener" data-post="${i}" aria-label="${p.caption ? p.caption.slice(0, 80) : 'Instagram post'}">
      <img src="${safeImg(p.thumb || p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      ${icon ? html`<span class="gi-type">${icon}</span>` : ''}
      ${p.caption ? html`<span class="gi-caption">${p.caption}</span>` : ''}
    </a>`;
}

function mountInstaGrid(grid, posts) {
  mount(grid, posts.map(instaItem));
  grid.addEventListener('click', (e) => {
    const a = e.target.closest('[data-post]');
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    openLightbox(posts, Number(a.dataset.post));
  });
}

function openLightbox(posts, index) {
  let i = index;
  let slide = 0;
  const dialog = document.createElement('dialog');
  dialog.className = 'lightbox';
  document.body.appendChild(dialog);

  const draw = () => {
    const p = posts[i];
    const media = p.children?.length ? p.children : [p];
    slide = Math.min(slide, media.length - 1);
    const m = media[slide];
    const date = p.timestamp ? new Date(p.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    mount(dialog, html`
      <div class="lb-inner">
        <button class="lb-close" data-act="close" aria-label="Close">✕</button>
        <div class="lb-media">
          ${m.video && safeImg(m.video)
            ? html`<video src="${safeImg(m.video)}" poster="${safeImg(m.image)}" controls autoplay playsinline></video>`
            : html`<img src="${safeImg(m.image)}" alt="" referrerpolicy="no-referrer">`}
          ${media.length > 1 ? html`
            <button class="lb-slide prev" data-act="slide-prev" aria-label="Previous photo" ${raw(slide === 0 ? 'disabled' : '')}>‹</button>
            <button class="lb-slide next" data-act="slide-next" aria-label="Next photo" ${raw(slide === media.length - 1 ? 'disabled' : '')}>›</button>
            <div class="lb-dots">${media.map((_, k) => html`<span class="${k === slide ? 'on' : ''}"></span>`)}</div>` : ''}
        </div>
        <div class="lb-side">
          ${date ? html`<div class="muted small">${date}</div>` : ''}
          ${p.caption ? html`<p class="lb-caption">${p.caption}</p>` : ''}
          ${p.permalink ? html`<div class="btn-row">
            <a class="btn btn-sm btn-insta" href="${safeUrl(p.permalink)}" target="_blank" rel="noopener">View on Instagram</a>
          </div>` : ''}
          <div class="lb-nav">
            <button class="btn btn-sm btn-outline" data-act="prev" ${raw(i === 0 ? 'disabled' : '')}>← Previous</button>
            <button class="btn btn-sm btn-outline" data-act="next" ${raw(i === posts.length - 1 ? 'disabled' : '')}>Next →</button>
          </div>
        </div>
      </div>`);
  };

  const go = (act) => {
    if (act === 'close') return dialog.close();
    if (act === 'prev' && i > 0) { i--; slide = 0; }
    if (act === 'next' && i < posts.length - 1) { i++; slide = 0; }
    if (act === 'slide-prev') slide = Math.max(0, slide - 1);
    if (act === 'slide-next') slide++;
    draw();
  };

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) return dialog.close();
    const btn = e.target.closest('[data-act]');
    if (btn && !btn.disabled) go(btn.dataset.act);
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') go(posts[i].children?.length > 1 ? 'slide-next' : 'next');
    if (e.key === 'ArrowLeft') go(posts[i].children?.length > 1 ? 'slide-prev' : 'prev');
  });
  let touchX = null;
  dialog.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  dialog.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) < 50) return;
    const multi = posts[i].children?.length > 1;
    go(dx < 0 ? (multi ? 'slide-next' : 'next') : (multi ? 'slide-prev' : 'prev'));
  });
  dialog.addEventListener('close', () => dialog.remove());
  draw();
  dialog.showModal();
}

async function renderGallery() {
  const { gallery, site } = state.content;
  setTitle(gallery.title);
  const username = String(gallery.instagramUsername || '').replace(/^@/, '');
  const profileUrl = username ? `https://www.instagram.com/${encodeURIComponent(username)}/` : safeUrl(site.socials?.instagram);
  const follow = html`<a class="cta-pill" href="${profileUrl}" target="_blank" rel="noopener">${gallery.followButton}</a><a class="cta-ring" href="${profileUrl}" target="_blank" rel="noopener" aria-label="@${username} on Instagram">${ICON.insta}</a>`;
  mount(main(), html`
    ${pageHead(gallery.title, gallery.intro, { second: 'on Instagram', actions: follow })}
    <section class="p-sec">
      <p class="small muted" id="insta-updated" style="margin:0 0 14px">@${username}</p>
      <div id="insta-grid" class="tg4 stagger"><div class="page-loading" style="grid-column:1/-1;min-height:200px"><div class="spinner"></div></div></div>
    </section>
    ${gallery.extraImages?.length ? html`
    <section class="p-sec">
      ${h2(gallery.extraTitle)}
      <div class="tg4 stagger" id="extra-grid">
        ${gallery.extraImages.filter((img) => safeImg(img.url)).map((img, k) => html`
          <a class="gallery-item" href="${safeImg(img.url)}" data-post="${k}">
            <img src="${safeImg(img.url)}" alt="${img.caption || ''}" loading="lazy">
            ${img.caption ? html`<span class="gi-caption">${img.caption}</span>` : ''}
          </a>`)}
      </div>
    </section>` : ''}`);

  const extra = document.getElementById('extra-grid');
  if (extra) {
    const photos = gallery.extraImages.filter((img) => safeImg(img.url)).map((img) => ({ image: img.url, caption: img.caption || '' }));
    extra.addEventListener('click', (e) => {
      const a = e.target.closest('[data-post]');
      if (!a) return;
      e.preventDefault();
      openLightbox(photos, Number(a.dataset.post));
    });
  }

  const grid = document.getElementById('insta-grid');
  const empty = html`
    <div class="tile t-white tile-card" style="grid-column:1/-1">
      <p>${gallery.emptyText}</p>
      <div><a class="cta-pill" href="${profileUrl}" target="_blank" rel="noopener">Open @${username}</a></div>
    </div>`;
  try {
    const feed = await api('/api/instagram');
    const posts = (feed.posts || []).slice(0, Math.max(1, Number(gallery.maxPosts) || 12));
    if (posts.length) {
      mountInstaGrid(grid, posts);
      const newest = posts[0].timestamp ? new Date(posts[0].timestamp) : null;
      if (newest) document.getElementById('insta-updated').textContent = `@${username} · latest post ${newest.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
    } else mount(grid, empty);
  } catch {
    mount(grid, empty);
  }
}

function renderContact() {
  const { contact, site } = state.content;
  setTitle(contact.title);
  const phones = contacts(site);
  const handle = String(site.socials?.instagram || '').replace(/\/+$/, '').split('/').pop();
  mount(main(), html`
    ${pageHead(contact.title, contact.intro)}
    <section class="p-sec tg2 p-split" style="align-items:start;${contact.formEnabled ? '' : 'grid-template-columns:1fr'}">
      ${contact.formEnabled ? html`
      <div class="tile t-white form-card">
        ${h2(contact.formTitle, 'style="margin:0 0 6px"')}
        <p class="small muted" style="margin:0 0 18px">${contact.formIntro}</p>
        <form class="form" id="contact-form" novalidate>
          <div class="form-row">
            <label class="field"><span>Name</span><input name="name" required autocomplete="name"></label>
            <label class="field"><span>Phone (optional)</span><input name="phone" type="tel" autocomplete="tel"></label>
          </div>
          <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email"></label>
          <label class="field"><span>Subject</span><input name="subject" value="${new URLSearchParams(location.search).get('subject') || ''}"></label>
          <label class="field"><span>Message</span><textarea name="message" required rows="5"></textarea></label>
          <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
          <div class="form-error" role="alert"></div>
          <p class="small muted" style="margin:0">We only use your details to reply to you. See our <a href="/privacy">Privacy Policy</a>.</p>
          <div><button class="cta-pill" type="submit">${contact.submitLabel || 'Send message'}</button></div>
        </form>
      </div>` : ''}
      <div style="display:grid;gap:var(--gap)">
        <div class="tile t-deep tile-card">
          <span class="tile-no">${contact.detailsTitle}</span>
          ${phones.map((c) => html`<a href="${telHref(c.phone)}" style="display:flex;gap:12px;align-items:center;text-decoration:none"><span style="width:20px;display:grid">${ICON.phone}</span><span>${c.name ? html`<small style="display:block;font:600 14px/1.2 var(--sans);opacity:.8;margin-bottom:4px">${c.name}</small>` : ''}<span style="font:800 26px/1 var(--display)">${c.phone}</span></span></a>`)}
          ${site.email ? html`<a href="mailto:${site.email}" style="display:flex;gap:12px;align-items:center;font-weight:600;text-decoration:none"><span style="width:20px;display:grid">${ICON.mail}</span>${site.email}</a>` : ''}
          ${whatsappButton(site) ? html`<div style="margin:4px 0 2px">${whatsappButton(site)}</div>` : ''}
          ${site.address ? html`<p style="opacity:.82">${keepPostcode(site.address)}</p>` : ''}
          ${handle ? html`<a href="${safeUrl(site.socials.instagram)}" target="_blank" rel="noopener" style="display:flex;gap:8px;align-items:center;text-decoration:none"><span style="width:18px;display:grid">${ICON.insta}</span>@${handle}</a>` : ''}
        </div>
        ${contact.showMap && site.mapQuery ? html`<div class="tile t-mid map-tile" style="min-height:260px">${mapEmbed(site.mapQuery)}</div>` : ''}
        <div class="p-actions">${directions(site)}</div>
      </div>
    </section>`);

  const form = document.getElementById('contact-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError(form, '');
    const button = form.querySelector('button[type=submit]');
    await withBusy(button, async () => {
      try {
        await api('/api/contact', { method: 'POST', body: formData(form) });
        form.reset();
        confetti(button);
        trackEvent('contact');
        toast(contact.successMessage || 'Message sent', 'success', 5000);
      } catch (err) {
        formError(form, err.message);
      }
    });
  });
}

function renderCustomPage(slug) {
  const page = state.content.customPages.find((p) => p.slug === slug);
  const nav = state.content.nav.find((n) => n.id === `page:${slug}`);
  if (!page || (nav && !nav.visible)) return renderNotFound();
  setTitle(page.title);
  const img = safeImg(page.image);
  mount(main(), html`
    ${pageHead(page.title, page.intro)}
    <section class="p-sec tg2 p-split" style="${img ? '' : 'grid-template-columns:1fr'}">
      <div class="tile t-white tile-card"><div class="p-body" style="max-width:68ch">${formatText(page.body)}</div></div>
      ${img ? html`<div class="tile tile-photo"><img src="${img}" alt="" loading="lazy"></div>` : ''}
    </section>`);
}

function renderNotFound() {
  setTitle('Page not found');
  mount(main(), html`
    ${pageHead('Page not found', 'Sorry, we could not find that page.', { actions: html`<a class="cta-pill" href="/">Go to the home page</a>` })}`);
}

// ---------- privacy policy & consent ----------

function renderPrivacy() {
  const { privacy } = state.content;
  setTitle(privacy.title);
  mount(main(), html`
    ${pageHead(privacy.title, privacy.intro)}
    <section class="p-sec">
      <div class="tile t-white tile-card policy">
        <p class="small muted">Version ${privacy.version}${privacy.lastUpdated ? ` · Last updated ${privacy.lastUpdated}` : ''}</p>
        <div class="p-body rich" style="max-width:72ch">${formatText(privacy.body)}</div>
      </div>
    </section>`);
}

// The age question, parent/guardian details and agreement checkboxes, shared by
// the sign-up form and the "accept the policy" page.
function consentFields(user = null) {
  const { members } = state.content;
  const under16 = Boolean(user?.under16);
  return html`
    <fieldset class="consent-box">
      <legend class="field-label">Age of the member</legend>
      <label class="checkbox"><input type="radio" name="ageGroup" value="16plus" ${raw(user?.privacyVersion && !under16 ? 'checked' : '')} required> 16 or over</label>
      <label class="checkbox"><input type="radio" name="ageGroup" value="under16" ${raw(under16 ? 'checked' : '')}> Under 16</label>
      <div class="guardian-fields" ${raw(under16 ? '' : 'hidden')}>
        <p class="small" style="margin:4px 0 0">For members under 16, a <strong>parent or guardian</strong> must fill in this part.</p>
        <label class="field"><span>Parent or guardian's full name</span><input name="guardianName" value="${user?.guardianName || ''}" autocomplete="off"></label>
        <label class="field"><span>Parent or guardian's email</span><input name="guardianEmail" type="email" value="${user?.guardianEmail || ''}" autocomplete="off"></label>
        <label class="field"><span>Parent or guardian's phone (optional)</span><input name="guardianPhone" type="tel" value="${user?.guardianPhone || ''}" autocomplete="off"></label>
        <label class="checkbox consent-check"><input type="checkbox" name="guardianConsent"> <span>${members.guardianConsentText}</span></label>
      </div>
    </fieldset>
    <label class="checkbox consent-check"><input type="checkbox" name="acceptPrivacy" required>
      <span>${members.privacyCheckboxText} <a href="/privacy" target="_blank" rel="noopener">Read the Privacy Policy</a></span></label>`;
}

function bindConsentFields(form, onAgeChange) {
  const update = () => {
    const under16 = form.querySelector('input[name=ageGroup]:checked')?.value === 'under16';
    form.querySelector('.guardian-fields').hidden = !under16;
    onAgeChange?.(under16);
  };
  form.querySelectorAll('input[name=ageGroup]').forEach((r) => r.addEventListener('change', update));
  update();
}

function readConsentForm(form) {
  const fd = new FormData(form);
  return {
    acceptPrivacy: fd.get('acceptPrivacy') === 'on',
    ageGroup: fd.get('ageGroup') || '',
    guardianName: fd.get('guardianName') || '',
    guardianEmail: fd.get('guardianEmail') || '',
    guardianPhone: fd.get('guardianPhone') || '',
    guardianConsent: fd.get('guardianConsent') === 'on',
  };
}

function renderConsent() {
  if (!state.user) return navigate('/login', { replace: true });
  const { members, privacy } = state.content;
  setTitle(privacy.title);
  const next = nextPath();
  if (!state.user.privacyRequired) return navigate(next, { replace: true });
  const changed = Boolean(state.user.privacyVersion);
  mount(main(), authShell(changed ? 'Our privacy policy has changed' : privacy.title, html`
    <p class="muted">${members.consentPageIntro}</p>
    <div class="policy-scroll rich" tabindex="0">${formatText(privacy.body)}</div>
    <form class="form" id="consent-form" novalidate style="margin-top:16px">
      ${consentFields(state.user)}
      <div class="form-error" role="alert"></div>
      <button class="cta-pill" type="submit" style="width:100%">Accept and continue</button>
    </form>
    <p class="small" style="margin:16px 0 0"><button class="btn btn-ghost btn-sm" id="consent-logout">Log out instead</button></p>`));

  const form = document.getElementById('consent-form');
  bindConsentFields(form);
  document.getElementById('consent-logout').addEventListener('click', logout);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError(form, '');
    await withBusy(form.querySelector('button[type=submit]'), async () => {
      try {
        const { user } = await api('/api/me/privacy', { method: 'POST', body: readConsentForm(form) });
        state.user = user;
        toast('Thank you', 'success');
        navigate(next, { replace: true });
      } catch (err) {
        formError(form, err.message);
      }
    });
  });
}

// Where to go after logging in: the consent page first if the policy needs accepting.
function afterLogin(user, next) {
  if (user.privacyRequired) return navigate(`/privacy-consent?next=${encodeURIComponent(next)}`, { replace: true });
  navigate(next, { replace: true });
}

// ---------- auth & member pages ----------

// A form on a white card, with the title in two voices; an optional column beside it.
function authShell(title, inner, aside = '') {
  const [a, b] = twoLines(title);
  return html`
    <section class="p-sec auth2 ${aside ? 'tg2 p-split' : ''}" style="align-items:start">
      <div class="tile t-white form-card" style="${aside ? '' : 'max-width:500px;margin:0 auto;width:100%'}">
        <h1 class="auth-title">${a}${b ? html` <span>${b}</span>` : ''}</h1>
        ${inner}
      </div>
      ${aside}
    </section>`;
}

function nextPath() {
  const next = new URLSearchParams(location.search).get('next') || '';
  return /^\/(?!\/)/.test(next) ? next : '/account';
}

function renderLogin() {
  if (state.user) return navigate(nextPath(), { replace: true });
  const { members } = state.content;
  setTitle(members.loginTitle);
  mount(main(), authShell(members.loginTitle, html`
    <p class="muted">${members.loginIntro}</p>
    <form class="form" id="login-form" novalidate>
      <label class="field"><span>Email or member ID</span><input name="identifier" required autocomplete="username" autocapitalize="none"></label>
      <label class="field"><span>Password</span><input name="password" type="password" required autocomplete="current-password"></label>
      <div class="form-error" role="alert"></div>
      <button class="cta-pill" type="submit" style="width:100%">Log in</button>
    </form>
    <p class="small muted" style="margin-top:16px">${members.forgotPasswordText}</p>
    ${members.allowRegistration ? html`<p style="margin:0">New here? <a href="/register"><b>Create an account</b></a></p>` : ''}`));

  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError(form, '');
    await withBusy(form.querySelector('button[type=submit]'), async () => {
      try {
        const { user } = await api('/api/auth/login', { method: 'POST', body: formData(form) });
        state.user = user;
        afterLogin(user, nextPath());
      } catch (err) {
        formError(form, err.message);
      }
    });
  });
}

function renderRegister() {
  if (state.user) return navigate('/account', { replace: true });
  const { members } = state.content;
  setTitle(members.registerTitle);
  if (!members.allowRegistration) {
    mount(main(), authShell(members.registerTitle, html`
      <p>${members.registrationClosedText}</p>
      <a class="cta-pill" href="/login" style="width:100%">Back to login</a>`));
    return;
  }
  const perks = [
    ['Your member pass', 'A QR code your teacher scans at the door.'],
    ['Your classes', 'Every class you attend, all in one place.'],
    ['Your data, your choice', 'Download or delete it any time.'],
  ];
  mount(main(), authShell(members.registerTitle, html`
    <p class="muted">${members.registerIntro}</p>
    <form class="form" id="register-form" novalidate>
      <label class="field"><span>Full name</span><input name="name" required autocomplete="name"></label>
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email"><small id="email-hint" hidden>For under 16s this can be a parent's email. Leave it blank if a brother or sister already uses that email; you will then log in with the member ID you are given.</small></label>
      <label class="field"><span>Phone (optional)</span><input name="phone" type="tel" autocomplete="tel"></label>
      <label class="field"><span>About you (optional)</span><textarea name="bio" rows="3" maxlength="1000" placeholder="${members.bioPrompt}"></textarea></label>
      <label class="field"><span>Password</span><input name="password" type="password" required minlength="8" autocomplete="new-password"><small>At least 8 characters.</small></label>
      ${consentFields()}
      <div class="form-error" role="alert"></div>
      <div><button class="cta-pill" type="submit">Create my account</button></div>
    </form>
    <p style="margin:16px 0 0">Already a member? <a href="/login"><b>Log in</b></a></p>`,
  html`<div style="display:grid;gap:var(--gap)">${perks.map(([t, d], k) => html`<div class="tile ${TONES[k % 3]} tile-card"><span class="tile-no">${String(k + 1).padStart(2, '0')}</span><h3>${t}</h3><p>${d}</p></div>`)}</div>`));

  const form = document.getElementById('register-form');
  bindConsentFields(form, (under16) => { document.getElementById('email-hint').hidden = !under16; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError(form, '');
    const button = form.querySelector('button[type=submit]');
    await withBusy(button, async () => {
      try {
        const f = formData(form);
        const body = { name: f.name, email: f.email, phone: f.phone, bio: f.bio, password: f.password, ...readConsentForm(form) };
        const { user } = await api('/api/auth/register', { method: 'POST', body });
        state.user = user;
        confetti(button);
        toast(`${members.welcomeMessage} (${user.memberId})`, 'success', 6000);
        navigate('/account', { replace: true });
      } catch (err) {
        formError(form, err.message);
      }
    });
  });
}

export function monthlyChart(monthly) {
  if (!monthly?.length) return '';
  const max = Math.max(1, ...monthly.map((m) => m.count));
  return html`
    <div class="month-chart" role="img" aria-label="Classes attended per month">
      ${monthly.map((m) => {
        const [y, mo] = m.month.split('-').map(Number);
        const label = new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
        return html`
          <div class="mc-col" title="${label}: ${m.count} ${m.count === 1 ? 'class' : 'classes'}">
            <span class="mc-count">${m.count}</span>
            <div class="mc-bar" style="height:${Math.round((m.count / max) * 100)}%"></div>
            <span class="mc-label">${label}</span>
          </div>`;
      })}
    </div>`;
}

// ----- paying for a class online (Monzo payment link) -----

const PAY_STATUS = { claimed: 'Paid online', received: 'Paid online ✓ checked', not_received: 'Not received', cash: 'Paid cash', card: 'Paid card' };
const payLabel = (p) => (p.method === 'online' ? PAY_STATUS[p.status] : PAY_STATUS[p.method]);
const isPaid = (p) => p && p.status !== 'not_received' && p.status !== 'started';
const classDate = (iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });

async function payForClass(box) {
  let data;
  try {
    data = await api('/api/me/payments');
  } catch {
    return;
  }
  const { payOnline, dates } = data;
  if (!payOnline.enabled && !data.payments.length) return;
  box.hidden = false;
  let pending = data.pending;
  let chosen = dates.find((d) => !isPaid(data.payments.find((p) => p.date === d))) || dates[0];

  const history = () => (data.payments.length ? html`
    <div class="tile t-white tile-card">
      <h3>Payment history</h3>
      <ul class="pay-list">${data.payments.map((p) => html`
        <li><span><b>${classDate(p.date, { weekday: 'short', day: 'numeric', month: 'long' })}</b><small>${p.method === 'online' ? p.reference : 'At the door'}</small></span>
          <span class="pay-badge ${isPaid(p) ? '' : 'bad'}">${payLabel(p)}</span></li>`)}</ul>
    </div>` : '');

  const draw = () => {
    const paidFor = (d) => data.payments.find((p) => p.date === d && isPaid(p));
    let main;
    if (pending) {
      main = html`
        <div class="tile t-cream tile-card pay-card" id="pay-confirm">
          <h3>Did your payment go through?</h3>
          <p>${payOnline.amount} for <b>${classDate(pending.date)}</b>, reference <b>${pending.reference}</b>. This payment is for that class only and is not transferable.</p>
          <div class="pay-shot">📸 <span><b>Take a screenshot of Monzo's payment confirmation</b>, just in case your account doesn't update. Show it to a teacher if you need to.</span></div>
          <div class="p-actions"><button class="cta-pill" type="button" id="pay-yes">Yes, I've paid</button><button class="cta-pill light" type="button" id="pay-no">No, not yet</button></div>
          <p class="small muted" style="margin:0">Only tap "Yes" once Monzo shows the payment as complete. Payments are checked against Monzo.</p>
        </div>`;
    } else if (payOnline.enabled && dates.length) {
      const done = paidFor(chosen);
      main = html`
        <div class="tile t-white tile-card pay-card">
          <h3>Pay for a class</h3>
          <label class="field"><span>Which class are you paying for?</span>
            <select id="pay-date">${dates.map((d, k) => html`<option value="${d}" ${raw(d === chosen ? 'selected' : '')}>${classDate(d)}${k === 0 ? ' (next class)' : ''}${paidFor(d) ? ' · paid ✓' : ''}</option>`)}</select></label>
          ${done ? html`
            <p class="pay-done"><span class="pay-badge">✓ ${payLabel(done)}</span> You're all set for ${classDate(chosen, { weekday: 'long', day: 'numeric', month: 'long' })}. Just show your QR code at the door.</p>`
          : html`
            <div class="pay-ref"><small>Put this in the Monzo payment note</small><div><b id="pay-ref">…</b><button type="button" class="pay-copy" id="pay-copy">Copy</button></div></div>
            <div class="pay-shot">📸 <span>After paying, <b>take a screenshot of the confirmation</b>, just in case your account doesn't update.</span></div>
            <label class="pay-terms"><input type="checkbox" id="pay-agree"> <span><b>Class payments are not transferable.</b> This payment is only for ${classDate(chosen)}. If you miss the class, it can't be moved to another date or refunded.</span></label>
            <div><a class="cta-pill gold" id="pay-go" href="${payOnline.link}" target="_blank" rel="noopener" aria-disabled="true">Pay ${payOnline.amount} with Monzo</a></div>
            <p class="small muted" style="margin:0" id="pay-hint">Tick the box above to continue to Monzo's secure payment page.</p>`}
        </div>`;
    }
    mount(box, html`<div class="tg2 p-split" style="align-items:start">${main || ''}${history()}</div>`);
    wire();
  };

  // The reference for the chosen date, as the server will record it.
  const refFor = (d) => {
    const u = state.user;
    const [, m, day] = d.split('-').map(Number);
    const base = `${u.memberId} ${String(day).padStart(2, '0')}${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][m - 1]}`;
    const words = u.name.toUpperCase().replace(/[^A-Z\s'-]/g, '').split(/\s+/).filter(Boolean);
    const room = 30 - base.length - 1;
    const name = [words.join(' '), words.length > 1 ? `${words[0]} ${words.at(-1)[0]}` : words[0] || '', words.map((w) => w[0]).join('')].find((o) => o && o.length <= room) || '';
    return name ? `${base} ${name}` : base;
  };

  const wire = () => {
    const sel = box.querySelector('#pay-date');
    sel?.addEventListener('change', () => { chosen = sel.value; draw(); });
    const ref = box.querySelector('#pay-ref');
    if (ref) ref.textContent = refFor(chosen);
    box.querySelector('#pay-copy')?.addEventListener('click', async (e) => {
      try {
        await navigator.clipboard.writeText(ref.textContent);
        e.target.textContent = 'Copied';
      } catch {
        toast('Select the reference and copy it', 'error');
      }
    });
    // The Monzo button only works once they've ticked that payments are not transferable.
    const agree = box.querySelector('#pay-agree');
    const go = box.querySelector('#pay-go');
    agree?.addEventListener('change', () => {
      go.setAttribute('aria-disabled', String(!agree.checked));
      box.querySelector('#pay-hint').textContent = agree.checked ? "Opens Monzo's secure payment page." : 'Tick the box above to continue to Monzo\'s secure payment page.';
    });
    go?.addEventListener('click', (e) => {
      if (agree.checked) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      agree.closest('label').classList.add('is-needed');
      agree.focus();
    });
    box.querySelector('#pay-go')?.addEventListener('click', async () => {
      // The link opens Monzo in a new tab; the payment is recorded as started meanwhile.
      try {
        const r = await api('/api/me/payments', { method: 'POST', body: { date: chosen } });
        pending = { id: r.payment.id, date: r.payment.date, reference: r.payment.reference };
        draw();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    box.querySelector('#pay-yes')?.addEventListener('click', async (e) => {
      await withBusy(e.target, async () => {
        try {
          const r = await api(`/api/me/payments/${pending.id}/confirm`, { method: 'POST' });
          data.payments = r.payments;
          chosen = pending.date;
          pending = null;
          confetti(e.target);
          toast('Thanks! Your class is paid for.', 'success');
          draw();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
    box.querySelector('#pay-no')?.addEventListener('click', async () => {
      await api(`/api/me/payments/${pending.id}`, { method: 'DELETE' }).catch(() => {});
      pending = null;
      draw();
    });
  };
  draw();
}

async function renderAccount() {
  if (!state.user) return navigate('/login?next=/account', { replace: true });
  setTitle('My account');
  const { members, site, timetable } = state.content;
  const { attendance, stats } = await api('/api/me/attendance');
  const u = state.user;
  const classes = (timetable.classes || []).filter((c) => c && c.name);
  const next = classes[0] ? nextClass(classes[0]) : null;
  const since = u.createdAt ? formatDateTime(u.createdAt, { month: 'long', year: 'numeric' }) : '';
  mount(main(), html`
    <section class="page-head">
      <div>
        <p style="font-weight:700;color:var(--gold-text);margin:0 0 10px">Hello, ${u.name.split(' ')[0]}</p>
        <h1>Your <span>pass</span></h1>
        <p style="margin-top:20px">${members.qrHint}</p>
        <div class="p-actions no-print" style="margin-top:22px">
          ${u.role !== 'member' ? html`<a class="cta-pill gold" href="/admin/scanner">Open scanner</a><a class="cta-pill light" href="/admin">${u.role === 'admin' ? 'Admin' : 'Teacher'} dashboard</a>` : ''}
          <button class="cta-pill light" type="button" id="print-card">Print card</button>
        </div>
      </div>
      <div class="tile t-cream tile-card pass-card member-card-print">
        <span class="tile-no">${site.name}</span>
        <div class="qr-box"><img src="/api/me/qr.svg?v=${encodeURIComponent(u.memberId)}" alt="QR code for member ID ${u.memberId}" width="256" height="256"></div>
        <div class="pass-id">${u.memberId}</div>
        <p class="small muted">${u.name}${since ? ` · member since ${since}` : ''}</p>
      </div>
    </section>
    <div class="no-print">
      <section class="p-sec" id="pay-section" hidden></section>
      <section class="p-sec tg2 p-split" style="align-items:stretch" data-fade>
        <div class="tile t-deep tile-card">
          <span class="tile-no">Classes attended</span>
          <div class="big-num" style="color:var(--gold)" data-count="${stats.total}">${stats.total}</div>
          <p>${stats.thisMonth} this month${stats.lastAttended ? ` · last class ${formatDate(stats.lastAttended, { day: 'numeric', month: 'short' })}` : ''}</p>
          ${next ? html`<p style="opacity:.8">Next: ${longDate(next.date)}, ${formatTime(classes[0].start)}</p>` : ''}
          ${monthlyChart(stats.monthly)}
        </div>
        <div class="tile t-white tile-card">
          <h3>Attendance</h3>
          ${attendance.length ? html`<ul class="attend-list">${attendance.map((a, k) => html`
            <li><span><span class="tile-no" style="margin-right:12px;color:var(--gold-text)">${String(attendance.length - k).padStart(2, '0')}</span><b>${formatDate(a.date, { weekday: 'long', day: 'numeric', month: 'long' })}</b></span><span class="small muted">${a.startTime ? formatTime(a.startTime) : ''}${a.title ? ` · ${a.title}` : ''}</span></li>`)}</ul>`
            : html`<p class="muted">No classes yet. Your attendance will appear here once a teacher scans your QR code.</p>`}
        </div>
      </section>
      <section class="p-sec tg2 p-split" style="align-items:start" data-fade>
        <div class="tile t-white form-card">
          <h3 style="margin:0 0 14px">My profile</h3>
          <form class="form" id="profile-form">
            <label class="field"><span>Name</span><input name="name" value="${u.name}" required></label>
            <label class="field"><span>Phone</span><input name="phone" type="tel" value="${u.phone}"></label>
            <label class="field"><span>Bio</span><textarea name="bio" rows="4" maxlength="1000" placeholder="${members.bioPrompt}">${u.bio}</textarea><small>Your teachers can see this.</small></label>
            <label class="field"><span>Email</span><input value="${u.email}" disabled><small>Ask a teacher to change your email.</small></label>
            <div class="form-error" role="alert"></div>
            <div><button class="cta-pill" type="submit">Save profile</button></div>
          </form>
        </div>
        <div class="tile t-white form-card">
          <h3 style="margin:0 0 14px">Change password</h3>
          <form class="form" id="password-form">
            <label class="field"><span>Current password</span><input name="current" type="password" required autocomplete="current-password"></label>
            <label class="field"><span>New password</span><input name="next" type="password" required minlength="8" autocomplete="new-password"></label>
            <div class="form-error" role="alert"></div>
            <div><button class="cta-pill" type="submit">Update password</button></div>
          </form>
        </div>
      </section>
      <section class="p-sec" id="privacy-card" data-fade>
        <div class="tile t-gold tile-card">
          <h3>Your data &amp; privacy</h3>
          ${u.privacyRequired
            ? html`<p>You have not accepted the current Privacy Policy. <a href="/privacy-consent?next=/account"><b>Review and accept it</b></a>.</p>`
            : html`<p>You accepted Privacy Policy version ${u.privacyVersion} on ${formatDateTime(u.privacyAcceptedAt, { day: 'numeric', month: 'long', year: 'numeric' })}.</p>`}
          ${u.under16 ? html`<p>Under 16 · Parent or guardian: <strong>${u.guardianName}</strong> (${u.guardianEmail}${u.guardianPhone ? `, ${u.guardianPhone}` : ''})</p>` : ''}
          <div class="p-actions">
            <a class="cta-pill" href="/privacy">Read the Privacy Policy</a>
            <a class="cta-pill light" href="/api/me/export" download>Download my data</a>
            <button class="cta-pill light" id="delete-account" type="button">Delete my account</button>
            <button class="cta-pill light" id="logout" type="button">Log out</button>
          </div>
        </div>
      </section>
    </div>`);

  document.getElementById('logout').addEventListener('click', logout);
  document.getElementById('print-card').addEventListener('click', () => window.print());
  payForClass(document.getElementById('pay-section'));
  document.getElementById('delete-account').addEventListener('click', deleteAccountDialog);
  const profile = document.getElementById('profile-form');
  profile.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError(profile, '');
    try {
      const { user } = await api('/api/me', { method: 'PATCH', body: formData(profile) });
      state.user = user;
      toast('Profile saved', 'success');
    } catch (err) {
      formError(profile, err.message);
    }
  });
  const pw = document.getElementById('password-form');
  pw.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError(pw, '');
    try {
      await api('/api/me/password', { method: 'POST', body: formData(pw) });
      pw.reset();
      toast('Password updated', 'success');
    } catch (err) {
      formError(pw, err.message);
    }
  });
}

function deleteAccountDialog() {
  const form = el('form', { class: 'form' });
  form.innerHTML = html`
    <p>This permanently deletes your account, member ID and attendance history. It cannot be undone.</p>
    <p class="small muted">Tip: use <strong>Download my data</strong> first if you want a copy.</p>
    <label class="field"><span>Enter your password to confirm</span><input name="password" type="password" required autocomplete="current-password"></label>
    <div class="form-error" role="alert"></div>
    <button class="btn btn-danger" type="submit">Delete my account</button>`.s;
  const { close } = openDialog('Delete your account?', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await withBusy(form.querySelector('[type=submit]'), async () => {
      try {
        await api('/api/me/delete', { method: 'POST', body: { password: form.password.value } });
        close();
        state.user = null;
        toast('Your account has been deleted.', 'success', 5000);
        navigate('/');
      } catch (err) {
        formError(form, err.message);
      }
    });
  });
}

export async function logout() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  state.user = null;
  navigate('/');
}

// ---------- router ----------

let leaveGuard = null;
export function setLeaveGuard(fn) {
  leaveGuard = fn;
}

let currentUrl = location.pathname + location.search;

export async function navigate(path, { replace = false } = {}) {
  if (leaveGuard && !leaveGuard()) return;
  leaveGuard = null;
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  await route();
}

// Back/forward buttons: honour the unsaved-changes warning too.
function onPopState() {
  if (leaveGuard && !leaveGuard()) {
    history.pushState({}, '', currentUrl);
    return;
  }
  route();
}

let cleanup = null;
export function onLeave(fn) {
  cleanup = fn;
}

async function route() {
  leaveGuard = null;
  currentUrl = location.pathname + location.search;
  if (cleanup) {
    try {
      cleanup();
    } catch {}
    cleanup = null;
  }
  closeMenu();
  closeCallChooser();
  const path = location.pathname.replace(/\/+$/, '') || '/';
  renderHeader();
  const navItem = (id) => state.content.nav.find((n) => n.id === id);
  const routes = {
    '/': renderHome,
    '/about': renderAbout,
    '/timetable': renderTimetable,
    '/pricing': renderPricing,
    '/gallery': renderGallery,
    '/faq': renderFaq,
    '/performances': () => renderService('performances'),
    '/workshops': () => renderService('workshops'),
    '/contact': renderContact,
    '/login': renderLogin,
    '/register': renderRegister,
    '/account': renderAccount,
    '/privacy': renderPrivacy,
    '/privacy-consent': renderConsent,
  };
  try {
    const gated = path === '/account' || path === '/admin' || path.startsWith('/admin/');
    if (gated && state.user?.privacyRequired && state.user.role !== 'admin') {
      return navigate(`/privacy-consent?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
    }
    if (routes[path]) {
      const id = path === '/' ? 'home' : path.slice(1);
      if (navItem(id) && !navItem(id).visible && id !== 'home') renderNotFound();
      else {
        await routes[path]();
        // Counted only if the page didn't send the visitor elsewhere (e.g. to log in).
        if ((location.pathname.replace(/\/+$/, '') || '/') === path) trackPage(path);
      }
    } else if (path.startsWith('/p/')) {
      renderCustomPage(decodeURIComponent(path.slice(3)));
      trackPage(path);
    }
    else if (path === '/admin' || path.startsWith('/admin/')) {
      if (!state.user) return navigate(`/login?next=${encodeURIComponent(path)}`, { replace: true });
      if (state.user.role === 'member') return renderNotFound();
      const admin = await import('./admin.js');
      await admin.render(path.split('/').slice(2));
    } else renderNotFound();
  } catch (err) {
    if (err.status === 401) {
      state.user = null;
      return navigate(`/login?next=${encodeURIComponent(path)}`, { replace: true });
    }
    if (err.code === 'PRIVACY_REQUIRED') {
      if (state.user) state.user.privacyRequired = true;
      return navigate(`/privacy-consent?next=${encodeURIComponent(path)}`, { replace: true });
    }
    console.error(err);
    mount(main(), html`<section class="section"><div class="container empty"><h2>Something went wrong</h2><p>${err.message}</p><a class="btn btn-primary" href="${location.pathname}">Try again</a></div></section>`);
  }
  if (!location.hash) window.scrollTo(0, 0);
  // Pages soften into view and their figures count up as they scroll in.
  blurFade(main());
  numberTickers(main());
}

export async function reloadContent() {
  state.content = await api('/api/content');
  applyTheme();
  renderHeader();
  renderFooter();
}

// ----- the Call button: one number rings straight away; with more, choose who to call -----

let callPop = null;

function closeCallChooser(returnFocus = false) {
  if (!callPop) return;
  const { box, trigger } = callPop;
  callPop = null;
  box.remove();
  trigger.setAttribute('aria-expanded', 'false');
  if (returnFocus) trigger.focus();
}

function openCallChooser(trigger) {
  const people = contacts(state.content.site);
  if (!people.length) return;
  if (people.length === 1) {
    trackEvent('call');
    location.href = telHref(people[0].phone);
    return;
  }
  const again = callPop?.trigger === trigger;
  closeCallChooser();
  if (again) return;
  const box = el('div', { class: 'call-pop', role: 'dialog', 'aria-label': 'Who would you like to call?' });
  mount(box, html`
    <p class="call-pop-title">Who would you like to call?</p>
    ${people.map((c) => html`<a href="${telHref(c.phone)}">${ICON.phone}<span>${c.name ? html`<b>${c.name}</b>` : ''}<span>${c.phone}</span></span></a>`)}`);
  document.body.appendChild(box);
  // Below the button, kept on screen; above it if there is no room underneath.
  const r = trigger.getBoundingClientRect();
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  const left = Math.min(Math.max(16, r.right - w), innerWidth - w - 16);
  const top = r.bottom + 10 + h > innerHeight - 16 ? Math.max(16, r.top - 10 - h) : r.bottom + 10;
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  trigger.setAttribute('aria-expanded', 'true');
  callPop = { box, trigger };
  box.querySelector('a')?.focus({ preventScroll: true });
  box.addEventListener('click', (e) => { if (e.target.closest('a')) setTimeout(() => closeCallChooser(), 0); });
}

function setMenu(open, viaKey = false) {
  const hdr = document.getElementById('hdr');
  const btn = document.getElementById('menu-toggle');
  hdr.toggleAttribute('data-open', open);
  btn.setAttribute('aria-expanded', String(open));
  btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  if (open && viaKey) setTimeout(() => hdr.querySelector('.menu-inner a, .menu-inner button')?.focus(), 60);
}

function closeMenu() {
  setMenu(false);
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (a.target === '_blank' || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  if (/^\/(api|uploads|img|css|js|vendor)\//.test(url.pathname)) return;
  if (url.pathname === location.pathname && url.hash) return;
  e.preventDefault();
  navigate(url.pathname + url.search + url.hash);
});

window.addEventListener('popstate', onPopState);
window.addEventListener('beforeunload', (e) => {
  if (leaveGuard && !leaveGuard(true)) e.preventDefault();
});

async function start() {
  // The menu: its button, Escape, a click outside it, or choosing a link closes it.
  const hdr = document.getElementById('hdr');
  document.getElementById('menu-toggle').addEventListener('click', (e) => setMenu(!hdr.hasAttribute('data-open'), e.detail === 0));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && hdr.hasAttribute('data-open')) {
      setMenu(false);
      document.getElementById('menu-toggle').focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (hdr.hasAttribute('data-open') && !hdr.contains(e.target)) setMenu(false);
    const call = e.target.closest('[data-call]');
    if (call) openCallChooser(call);
    else if (callPop && !callPop.box.contains(e.target)) closeCallChooser();
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && callPop) closeCallChooser(true); });
  addEventListener('scroll', () => closeCallChooser(), { passive: true });
  addEventListener('resize', () => closeCallChooser());
  enableRipples();
  try {
    const [content, me] = await Promise.all([api('/api/content'), api('/api/me')]);
    state.content = content;
    state.user = me.user;
  } catch (err) {
    mount(main(), html`<div class="container empty"><h2>Could not load the site</h2><p>${err.message}</p></div>`);
    return;
  }
  applyTheme();
  renderFooter();
  await route();
}

start();
