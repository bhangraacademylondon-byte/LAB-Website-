import {
  api, html, raw, mount, esc, safeUrl, safeImg, formatText, toast, formatDate, formatDateTime, formatTime,
  formError, formData, withBusy, initials,
} from './lib.js';

export const state = { content: null, user: null, stats: null };

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const main = () => document.getElementById('main');

// ---------- theme & layout ----------

const FONTS = ['Poppins', 'Montserrat', 'Lato', 'Open Sans', 'Raleway', 'Nunito', 'Playfair Display', 'Merriweather', 'Oswald', 'Bebas Neue'];
const loadedFonts = new Set(['Poppins']);

function loadFont(name) {
  if (!FONTS.includes(name) || loadedFonts.has(name)) return;
  loadedFonts.add(name);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:wght@400;500;600;700;800&display=swap`;
  document.head.appendChild(link);
}

function shade(hex, amount) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const ch = (shift) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * (1 + amount))));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

function applyTheme() {
  const { site } = state.content;
  const root = document.documentElement.style;
  if (shade(site.primaryColor, 0)) {
    root.setProperty('--primary', site.primaryColor);
    root.setProperty('--primary-dark', shade(site.primaryColor, -0.32));
  }
  if (shade(site.accentColor, 0)) {
    root.setProperty('--accent', site.accentColor);
    root.setProperty('--accent-light', shade(site.accentColor, 0.28));
  }
  for (const [prop, font] of [['--font-heading', site.headingFont], ['--font-body', site.bodyFont]]) {
    const name = FONTS.includes(font) ? font : 'Poppins';
    loadFont(name);
    root.setProperty(prop, `'${name}'`);
  }
  const logo = safeImg(site.logo) || '/img/logo.png';
  document.getElementById('brand-logo').src = logo;
  document.getElementById('brand-name').textContent = site.name;
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

function renderHeader() {
  const { nav, home, site } = state.content;
  const path = location.pathname;
  mount('#nav-list', nav.filter((n) => n.visible).map((n) => {
    const href = pageHref(n.id);
    const current = href === path || (href !== '/' && path.startsWith(href + '/'));
    return html`<li><a href="${href}"${raw(current ? ' aria-current="page"' : '')}>${n.label}</a></li>`;
  }));

  const u = state.user;
  mount('#nav-account', u
    ? html`
        ${u.role !== 'member' ? html`<a class="btn btn-sm btn-outline" href="/admin">${u.role === 'admin' ? 'Admin' : 'Instructor'}</a>` : ''}
        <a class="btn btn-sm btn-primary" href="/account">${site.accountButtonLabel || 'My account'}</a>`
    : html`<a class="btn btn-sm btn-primary" href="/login">${site.loginButtonLabel || 'Member login'}</a>`);

  const bar = document.getElementById('announcement');
  if (home.announcement?.enabled && home.announcement.text) {
    bar.textContent = home.announcement.text;
    bar.hidden = false;
  } else bar.hidden = true;
}

function renderFooter() {
  const { site, nav } = state.content;
  const year = new Date().getFullYear();
  mount('#footer', html`
    <div>
      <div class="footer-brand">
        <img src="${safeImg(site.logo) || '/img/logo.png'}" alt="" width="56" height="56">
        <strong style="color:#fff">${site.name}</strong>
      </div>
      <p>${site.footerText}</p>
      ${socialLinks(site, true)}
    </div>
    <div>
      <h4>${site.footerExploreTitle}</h4>
      <ul>
        ${nav.filter((n) => n.visible).map((n) => html`<li><a href="${pageHref(n.id)}">${n.label}</a></li>`)}
        <li><a href="/login">${site.loginButtonLabel || 'Member login'}</a></li>
      </ul>
    </div>
    <div>
      <h4>${site.footerContactTitle}</h4>
      <ul>
        ${site.address ? html`<li>📍 ${site.address}</li>` : ''}
        ${(site.phones || []).filter(Boolean).map((p) => html`<li>📞 <a href="tel:${p.replace(/\s+/g, '')}">${p}</a></li>`)}
        ${site.email ? html`<li>✉️ <a href="mailto:${site.email}">${site.email}</a></li>` : ''}
      </ul>
    </div>
    <div class="footer-bottom">
      <span>${site.copyrightText || `© ${year} ${site.name}`}</span>
    </div>`);
}

function socialLinks(site, light = false) {
  const labels = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' };
  const links = Object.entries(site.socials || {}).filter(([, url]) => url);
  if (!links.length) return '';
  return html`<div class="socials">${links.map(([k, url]) => html`
    <a class="btn btn-sm ${light ? 'btn-light' : k === 'instagram' ? 'btn-insta' : 'btn-outline'}" href="${safeUrl(url)}" target="_blank" rel="noopener">${labels[k] || k}</a>`)}</div>`;
}

function pageHero(title, intro) {
  return html`<section class="page-hero"><div class="container"><h1>${title}</h1>${intro ? html`<p>${intro}</p>` : ''}</div></section>`;
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

// ---------- public pages ----------

function classCard(c) {
  return html`
    <div class="card class-card">
      <div class="class-time">${formatTime(c.start)}<small>${c.end ? `to ${formatTime(c.end)}` : ''}</small></div>
      <div>
        <h3 style="margin:0">${c.name}</h3>
        ${c.location ? html`<div class="muted small">📍 ${c.location}</div>` : ''}
        <div class="tags">
          ${c.level ? html`<span class="tag">${c.level}</span>` : ''}
          ${c.ages ? html`<span class="tag tag-gold">${c.ages}</span>` : ''}
        </div>
        ${c.notes ? html`<div class="small muted" style="margin-top:6px">${c.notes}</div>` : ''}
      </div>
    </div>`;
}

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
  const { home, site, timetable } = state.content;
  setTitle('');
  const heroImg = safeImg(home.heroImage);
  // Percent-encode characters that could end the CSS url('…') early.
  const heroCss = heroImg.replace(/["'()\\\s<>]/g, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
  const groups = groupByDay(timetable.classes);
  mount(main(), html`
    <section class="hero ${heroImg ? 'has-image' : ''} ${home.showHeroLogo ? '' : 'no-logo'}" ${raw(heroImg ? `style="background-image:url('${esc(heroCss)}')"` : '')}>
      <div class="container hero-inner">
        <div>
          ${home.heroEyebrow ? html`<span class="eyebrow">${home.heroEyebrow}</span>` : ''}
          <h1>${home.heroTitle}</h1>
          <p>${home.heroSubtitle}</p>
          ${buttons(home.heroButtons)}
        </div>
        ${home.showHeroLogo ? html`<div class="hero-logo"><img src="${safeImg(site.logo) || '/img/logo.png'}" alt="${site.name} logo"></div>` : ''}
      </div>
    </section>

    ${home.showHighlights && home.highlights?.length ? html`
    <section class="section">
      <div class="container grid grid-4">
        ${home.highlights.map((h) => html`
          <div class="card feature">
            <div class="feature-icon" aria-hidden="true">${h.icon || '★'}</div>
            <h3>${h.title}</h3>
            <p class="muted">${h.text}</p>
          </div>`)}
      </div>
    </section>` : ''}

    ${home.showIntro ? html`
    <section class="section section-soft">
      <div class="container split">
        <div>
          ${home.introEyebrow ? html`<span class="eyebrow">${home.introEyebrow}</span>` : ''}
          <h2>${home.introTitle}</h2>
          <div class="rich">${formatText(home.introText)}</div>
          ${buttons(home.introButtons, 'mt-20')}
        </div>
        <div>
          ${safeImg(home.introImage)
            ? html`<img src="${safeImg(home.introImage)}" alt="" loading="lazy">`
            : html`
              <div class="card">
                <h3>${home.classesCardTitle}</h3>
                ${[...groups].map(([day, list]) => html`
                  <div class="list-item">
                    <div><strong>${day}</strong><div class="meta">${list.map((c) => c.name).join(' · ')}</div></div>
                    <span class="tag">${formatTime(list[0].start)}</span>
                  </div>`)}
                ${home.classesCardButton ? html`<a class="btn btn-sm btn-accent" href="/timetable" style="margin-top:12px">${home.classesCardButton}</a>` : ''}
              </div>`}
        </div>
      </div>
    </section>` : ''}

    ${home.showInstagram ? html`
    <section class="section" id="home-insta" hidden>
      <div class="container">
        <div class="section-title">${home.instagramEyebrow ? html`<span class="eyebrow">${home.instagramEyebrow}</span>` : ''}<h2>${home.instagramTitle}</h2></div>
        <div class="gallery-grid" id="home-insta-grid"></div>
        ${home.instagramButton ? html`<div class="center" style="margin-top:24px"><a class="btn btn-outline" href="/gallery">${home.instagramButton}</a></div>` : ''}
      </div>
    </section>` : ''}

    ${home.showCta ? html`
    <section class="cta-band">
      <div class="container">
        <h2>${home.ctaTitle}</h2>
        ${home.ctaText ? html`<p>${home.ctaText}</p>` : ''}
        ${buttons(home.ctaButtons, 'justify-center')}
      </div>
    </section>` : ''}`);

  if (!home.showInstagram) return;
  api('/api/instagram').then((feed) => {
    const posts = (feed.posts || []).slice(0, Math.max(1, Number(home.instagramPostCount) || 6));
    const section = document.getElementById('home-insta');
    if (!posts.length || !section) return;
    mountInstaGrid(document.getElementById('home-insta-grid'), posts);
    section.hidden = false;
  }).catch(() => {});
}

function renderAbout() {
  const { about } = state.content;
  setTitle(about.title);
  const img = safeImg(about.image);
  mount(main(), html`
    ${pageHero(about.title, about.intro)}
    <section class="section">
      <div class="container ${img ? 'split' : ''}">
        <div class="rich" style="max-width:760px;${img ? '' : 'margin:0 auto'}">
          ${about.storyEyebrow ? html`<span class="eyebrow">${about.storyEyebrow}</span>` : ''}
          ${formatText(about.story)}
        </div>
        ${img ? html`<img src="${img}" alt="" loading="lazy">` : ''}
      </div>
    </section>
    ${about.values?.length ? html`
    <section class="section section-soft">
      <div class="container">
        <div class="section-title"><h2>${about.valuesTitle}</h2></div>
        <div class="grid grid-3">${about.values.map((v) => html`<div class="card"><h3>${v.title}</h3><p class="muted">${v.text}</p></div>`)}</div>
      </div>
    </section>` : ''}
    ${about.founders?.length ? html`
    <section class="section">
      <div class="container">
        <div class="section-title">${about.teamEyebrow ? html`<span class="eyebrow">${about.teamEyebrow}</span>` : ''}<h2>${about.teamTitle}</h2></div>
        <div class="grid grid-3">
          ${about.founders.map((f) => html`
            <div class="card person">
              ${safeImg(f.image) ? html`<img class="person-photo" src="${safeImg(f.image)}" alt="${f.name}" loading="lazy">` : html`<div class="person-photo">${initials(f.name)}</div>`}
              <h3>${f.name}</h3>
              <div class="role">${f.role}</div>
              <p class="muted">${f.bio}</p>
            </div>`)}
        </div>
      </div>
    </section>` : ''}`);
}

function renderTimetable() {
  const { timetable, site } = state.content;
  setTitle(timetable.title);
  const groups = groupByDay(timetable.classes);
  const showMap = timetable.showMap && site.mapQuery;
  mount(main(), html`
    ${pageHero(timetable.title, timetable.intro)}
    <section class="section">
      <div class="container">
        ${groups.size ? [...groups].map(([day, list]) => html`
          <div class="day-group">
            <h3>${day}</h3>
            ${list.map(classCard)}
          </div>`) : html`<div class="empty">${timetable.emptyText}</div>`}
        ${timetable.notes ? html`<div class="notice">${formatText(timetable.notes)}</div>` : ''}
      </div>
    </section>
    ${timetable.venueTitle || timetable.venueText || showMap ? html`
    <section class="section section-soft">
      <div class="container ${showMap ? 'split' : ''}">
        <div>
          <h2>${timetable.venueTitle}</h2>
          <div class="rich">${formatText(timetable.venueText)}</div>
          ${timetable.venueButton?.label ? html`<a class="btn btn-primary" href="${safeUrl(timetable.venueButton.link)}">${timetable.venueButton.label}</a>` : ''}
        </div>
        ${showMap ? mapEmbed(site.mapQuery) : ''}
      </div>
    </section>` : ''}`);
}

function renderPricing() {
  const { pricing } = state.content;
  setTitle(pricing.title);
  mount(main(), html`
    ${pageHero(pricing.title, pricing.intro)}
    <section class="section">
      <div class="container">
        <div class="grid grid-3" style="align-items:stretch">
          ${pricing.plans.map((p) => html`
            <div class="card plan ${p.highlight ? 'highlight' : ''}">
              ${p.highlight && pricing.highlightBadge ? html`<span class="badge">${pricing.highlightBadge}</span>` : ''}
              <h3>${p.name}</h3>
              <div class="plan-price">${p.price}</div>
              <div class="plan-period">${p.period}</div>
              <p class="muted">${p.description}</p>
              <ul>${(p.features || []).filter(Boolean).map((f) => html`<li>${f}</li>`)}</ul>
            </div>`)}
        </div>
        ${pricing.notes ? html`<div class="notice" style="margin-top:32px">${formatText(pricing.notes)}</div>` : ''}
        ${pricing.ctaButton?.label ? html`<div class="center" style="margin-top:24px"><a class="btn btn-accent" href="${safeUrl(pricing.ctaButton.link)}">${pricing.ctaButton.label}</a></div>` : ''}
      </div>
    </section>`);
}

// ----- Instagram grid & lightbox -----

function instaItem(p, i) {
  const icon = p.type === 'VIDEO' ? '▶' : p.type === 'CAROUSEL_ALBUM' ? '❐' : '';
  return html`
    <a class="gallery-item" href="${safeUrl(p.permalink)}" target="_blank" rel="noopener" data-post="${i}" aria-label="${p.caption ? p.caption.slice(0, 80) : 'Instagram post'}">
      <img src="${safeImg(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">
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
  mount(main(), html`
    ${pageHero(gallery.title, gallery.intro)}
    <section class="section">
      <div class="container">
        <div class="insta-head">
          <div class="insta-handle">
            <img src="${safeImg(site.logo) || '/img/logo.png'}" alt="">
            <div>@${username}<div class="muted small" id="insta-updated">Instagram</div></div>
          </div>
          <a class="btn btn-insta" href="${profileUrl}" target="_blank" rel="noopener">${gallery.followButton}</a>
        </div>
        <div id="insta-grid" class="gallery-grid"><div class="page-loading" style="grid-column:1/-1;min-height:200px"><div class="spinner"></div></div></div>
      </div>
    </section>
    ${gallery.extraImages?.length ? html`
    <section class="section section-soft">
      <div class="container">
        <div class="section-title"><h2>${gallery.extraTitle}</h2></div>
        <div class="gallery-grid" id="extra-grid">
          ${gallery.extraImages.filter((img) => safeImg(img.url)).map((img, k) => html`
            <a class="gallery-item" href="${safeImg(img.url)}" data-post="${k}">
              <img src="${safeImg(img.url)}" alt="${img.caption || ''}" loading="lazy">
              ${img.caption ? html`<span class="gi-caption">${img.caption}</span>` : ''}
            </a>`)}
        </div>
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
    <div class="empty" style="grid-column:1/-1">
      <p>${gallery.emptyText}</p>
      <a class="btn btn-insta" href="${profileUrl}" target="_blank" rel="noopener">Open @${username}</a>
    </div>`;
  try {
    const feed = await api('/api/instagram');
    const posts = (feed.posts || []).slice(0, Math.max(1, Number(gallery.maxPosts) || 12));
    if (posts.length) {
      mountInstaGrid(grid, posts);
      const newest = posts[0].timestamp ? new Date(posts[0].timestamp) : null;
      if (newest) document.getElementById('insta-updated').textContent = `Latest post ${newest.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
    } else mount(grid, empty);
  } catch {
    mount(grid, empty);
  }
}

function renderContact() {
  const { contact, site } = state.content;
  setTitle(contact.title);
  mount(main(), html`
    ${pageHero(contact.title, contact.intro)}
    <section class="section">
      <div class="container grid ${contact.formEnabled ? 'grid-2' : ''}" style="gap:40px">
        <div>
          <h2>${contact.detailsTitle}</h2>
          <ul class="contact-list">
            ${site.address ? html`<li><span class="ci">📍</span><div><strong>Address</strong><br>${site.address}</div></li>` : ''}
            ${(site.phones || []).filter(Boolean).length ? html`<li><span class="ci">📞</span><div><strong>Phone</strong><br>${site.phones.filter(Boolean).map((p, i) => html`${i ? raw('<br>') : ''}<a href="tel:${p.replace(/\s+/g, '')}">${p}</a>`)}</div></li>` : ''}
            ${site.email ? html`<li><span class="ci">✉️</span><div><strong>Email</strong><br><a href="mailto:${site.email}">${site.email}</a></div></li>` : ''}
          </ul>
          ${socialLinks(site)}
          ${contact.showMap ? html`<div style="margin-top:24px">${mapEmbed(site.mapQuery)}</div>` : ''}
        </div>
        ${contact.formEnabled ? html`
        <div class="card">
          <h2>${contact.formTitle}</h2>
          <p class="muted">${contact.formIntro}</p>
          <form class="form" id="contact-form" novalidate>
            <div class="form-row">
              <label class="field"><span>Name</span><input name="name" required autocomplete="name"></label>
              <label class="field"><span>Phone (optional)</span><input name="phone" type="tel" autocomplete="tel"></label>
            </div>
            <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email"></label>
            <label class="field"><span>Subject</span><input name="subject"></label>
            <label class="field"><span>Message</span><textarea name="message" required rows="5"></textarea></label>
            <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
            <div class="form-error" role="alert"></div>
            <button class="btn btn-primary" type="submit">${contact.submitLabel || 'Send message'}</button>
          </form>
        </div>` : ''}
      </div>
    </section>`);

  const form = document.getElementById('contact-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError(form, '');
    await withBusy(form.querySelector('button[type=submit]'), async () => {
      try {
        await api('/api/contact', { method: 'POST', body: formData(form) });
        form.reset();
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
    ${pageHero(page.title, page.intro)}
    <section class="section">
      <div class="container ${img ? 'split' : ''}">
        <div class="rich" style="max-width:760px;${img ? '' : 'margin:0 auto'}">${formatText(page.body)}</div>
        ${img ? html`<img src="${img}" alt="" loading="lazy">` : ''}
      </div>
    </section>`);
}

function renderNotFound() {
  setTitle('Page not found');
  mount(main(), html`
    <section class="section"><div class="container empty">
      <h1>Page not found</h1>
      <p>Sorry, we could not find that page.</p>
      <a class="btn btn-primary" href="/">Go to the home page</a>
    </div></section>`);
}

// ---------- auth & member pages ----------

function authShell(title, inner) {
  const { site } = state.content;
  return html`
    <div class="auth-wrap">
      <div class="card">
        <img class="auth-logo" src="${safeImg(site.logo) || '/img/logo.png'}" alt="">
        <h1 class="center" style="font-size:1.6rem">${title}</h1>
        ${inner}
      </div>
    </div>`;
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
    <p class="center muted">${members.loginIntro}</p>
    <form class="form" id="login-form" novalidate>
      <label class="field"><span>Email or member ID</span><input name="identifier" required autocomplete="username" autocapitalize="none"></label>
      <label class="field"><span>Password</span><input name="password" type="password" required autocomplete="current-password"></label>
      <div class="form-error" role="alert"></div>
      <button class="btn btn-primary btn-block" type="submit">Log in</button>
    </form>
    <p class="center small muted" style="margin-top:16px">${members.forgotPasswordText}</p>
    ${members.allowRegistration ? html`<p class="center" style="margin:0">New member? <a href="/register">Create an account</a></p>` : ''}`));

  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError(form, '');
    await withBusy(form.querySelector('button[type=submit]'), async () => {
      try {
        const { user } = await api('/api/auth/login', { method: 'POST', body: formData(form) });
        state.user = user;
        navigate(nextPath(), { replace: true });
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
      <p class="center">${members.registrationClosedText}</p>
      <a class="btn btn-primary btn-block" href="/login">Back to login</a>`));
    return;
  }
  mount(main(), authShell(members.registerTitle, html`
    <p class="center muted">${members.registerIntro}</p>
    <form class="form" id="register-form" novalidate>
      <label class="field"><span>Full name</span><input name="name" required autocomplete="name"></label>
      <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email"></label>
      <label class="field"><span>Phone (optional)</span><input name="phone" type="tel" autocomplete="tel"></label>
      <label class="field"><span>About you (optional)</span><textarea name="bio" rows="3" maxlength="1000" placeholder="${members.bioPrompt}"></textarea></label>
      <label class="field"><span>Password</span><input name="password" type="password" required minlength="8" autocomplete="new-password"><small>At least 8 characters.</small></label>
      <div class="form-error" role="alert"></div>
      <button class="btn btn-primary btn-block" type="submit">Create account</button>
    </form>
    <p class="center" style="margin:16px 0 0">Already a member? <a href="/login">Log in</a></p>`));

  const form = document.getElementById('register-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError(form, '');
    await withBusy(form.querySelector('button[type=submit]'), async () => {
      try {
        const { user } = await api('/api/auth/register', { method: 'POST', body: formData(form) });
        state.user = user;
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

async function renderAccount() {
  if (!state.user) return navigate('/login?next=/account', { replace: true });
  setTitle('My account');
  const { members, site } = state.content;
  const { attendance, stats } = await api('/api/me/attendance');
  const u = state.user;
  mount(main(), html`
    <section class="section">
      <div class="container">
        <div class="admin-head">
          <h1 style="font-size:1.8rem">Hi, ${u.name.split(' ')[0]} 👋</h1>
          <div class="btn-row no-print">
            ${u.role !== 'member' ? html`<a class="btn btn-sm btn-accent" href="/admin/scanner">Open scanner</a><a class="btn btn-sm btn-outline" href="/admin">${u.role === 'admin' ? 'Admin' : 'Instructor'} dashboard</a>` : ''}
            <button class="btn btn-sm btn-ghost" id="logout">Log out</button>
          </div>
        </div>
        <div class="account-grid">
          <div>
            <div class="member-card">
              <div class="small" style="opacity:.8;position:relative;z-index:1">${site.name}</div>
              <h2>${u.name}</h2>
              <div class="mid">${u.memberId}</div>
              <div class="qr-box"><img src="/api/me/qr.svg?v=${encodeURIComponent(u.memberId)}" alt="QR code for member ID ${u.memberId}" width="256" height="256"></div>
              <div class="small" style="opacity:.85;position:relative;z-index:1">${members.qrHint}</div>
            </div>
            <div class="btn-row no-print" style="margin-top:16px;justify-content:center">
              <button class="btn btn-sm btn-outline" id="print-card">Print card</button>
            </div>
            <p class="small muted center no-print" style="margin-top:12px">Tip: add this page to your home screen for quick access to your QR code.</p>
          </div>
          <div class="no-print">
            <div class="stat-grid">
              <div class="stat"><div class="stat-value">${stats.total}</div><div class="stat-label">Classes attended</div></div>
              <div class="stat"><div class="stat-value">${stats.thisMonth}</div><div class="stat-label">This month</div></div>
              <div class="stat"><div class="stat-value" style="font-size:1.1rem;padding:8px 0">${stats.lastAttended ? formatDate(stats.lastAttended, { day: 'numeric', month: 'short' }) : '-'}</div><div class="stat-label">Last class</div></div>
            </div>
            <div class="card" style="margin-top:20px">
              <h3>Last 6 months</h3>
              ${monthlyChart(stats.monthly)}
            </div>
            <div class="card" style="margin-top:20px">
              <h3>Attendance history</h3>
              ${attendance.length ? html`<ul class="list">${attendance.map((a) => html`
                <li class="list-item">
                  <div><strong>${a.title}</strong><div class="meta">${formatDate(a.date)}${a.startTime ? ` · ${formatTime(a.startTime)}` : ''}</div></div>
                  <span class="tag">✓ Attended</span>
                </li>`)}</ul>` : html`<p class="muted">No classes yet. Your attendance will appear here once an instructor scans your QR code.</p>`}
            </div>
            <div class="card" style="margin-top:20px">
              <h3>My profile</h3>
              <form class="form" id="profile-form">
                <label class="field"><span>Name</span><input name="name" value="${u.name}" required></label>
                <label class="field"><span>Phone</span><input name="phone" type="tel" value="${u.phone}"></label>
                <label class="field"><span>Bio</span><textarea name="bio" rows="4" maxlength="1000" placeholder="${members.bioPrompt}">${u.bio}</textarea><small>Your instructors can see this.</small></label>
                <label class="field"><span>Email</span><input value="${u.email}" disabled><small>Ask an instructor to change your email.</small></label>
                <div class="form-error" role="alert"></div>
                <div><button class="btn btn-primary" type="submit">Save profile</button></div>
              </form>
            </div>
            <div class="card" style="margin-top:20px">
              <h3>Change password</h3>
              <form class="form" id="password-form">
                <label class="field"><span>Current password</span><input name="current" type="password" required autocomplete="current-password"></label>
                <label class="field"><span>New password</span><input name="next" type="password" required minlength="8" autocomplete="new-password"></label>
                <div class="form-error" role="alert"></div>
                <div><button class="btn btn-primary" type="submit">Update password</button></div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </section>`);

  document.getElementById('logout').addEventListener('click', logout);
  document.getElementById('print-card').addEventListener('click', () => window.print());
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
  const path = location.pathname.replace(/\/+$/, '') || '/';
  renderHeader();
  const navItem = (id) => state.content.nav.find((n) => n.id === id);
  const routes = {
    '/': renderHome,
    '/about': renderAbout,
    '/timetable': renderTimetable,
    '/pricing': renderPricing,
    '/gallery': renderGallery,
    '/contact': renderContact,
    '/login': renderLogin,
    '/register': renderRegister,
    '/account': renderAccount,
  };
  try {
    if (routes[path]) {
      const id = path === '/' ? 'home' : path.slice(1);
      if (navItem(id) && !navItem(id).visible && id !== 'home') renderNotFound();
      else await routes[path]();
    } else if (path.startsWith('/p/')) renderCustomPage(decodeURIComponent(path.slice(3)));
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
    console.error(err);
    mount(main(), html`<section class="section"><div class="container empty"><h2>Something went wrong</h2><p>${err.message}</p><a class="btn btn-primary" href="${location.pathname}">Try again</a></div></section>`);
  }
  if (!location.hash) window.scrollTo(0, 0);
}

export async function reloadContent() {
  state.content = await api('/api/content');
  applyTheme();
  renderHeader();
  renderFooter();
}

function closeMenu() {
  document.getElementById('site-nav').classList.remove('open');
  document.getElementById('menu-toggle').setAttribute('aria-expanded', 'false');
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
  document.getElementById('menu-toggle').addEventListener('click', () => {
    const nav = document.getElementById('site-nav');
    const open = !nav.classList.contains('open');
    nav.classList.toggle('open', open);
    document.getElementById('menu-toggle').setAttribute('aria-expanded', String(open));
  });
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
