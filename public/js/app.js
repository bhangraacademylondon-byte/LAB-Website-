import {
  api, html, raw, mount, esc, safeUrl, safeImg, formatText, toast, formatDate, formatDateTime, formatTime,
  formError, formData, withBusy, initials,
} from './lib.js';

export const state = { content: null, user: null, stats: null };

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const main = () => document.getElementById('main');

// ---------- theme & layout ----------

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
  const logo = safeImg(site.logo) || '/img/logo.png';
  document.getElementById('brand-logo').src = logo;
  document.getElementById('brand-name').textContent = site.name;
}

function pageHref(id) {
  if (id === 'home') return '/';
  if (id.startsWith('page:')) return `/p/${id.slice(5)}`;
  return `/${id}`;
}

function renderHeader() {
  const { nav, home } = state.content;
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
        <a class="btn btn-sm btn-primary" href="/account">My account</a>`
    : html`<a class="btn btn-sm btn-primary" href="/login">Member login</a>`);

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
      <h4>Explore</h4>
      <ul>
        ${nav.filter((n) => n.visible).map((n) => html`<li><a href="${pageHref(n.id)}">${n.label}</a></li>`)}
        <li><a href="/login">Member login</a></li>
      </ul>
    </div>
    <div>
      <h4>Get in touch</h4>
      <ul>
        ${site.address ? html`<li>📍 ${site.address}</li>` : ''}
        ${(site.phones || []).filter(Boolean).map((p) => html`<li>📞 <a href="tel:${p.replace(/\s+/g, '')}">${p}</a></li>`)}
        ${site.email ? html`<li>✉️ <a href="mailto:${site.email}">${site.email}</a></li>` : ''}
      </ul>
    </div>
    <div class="footer-bottom">
      <span>© ${year} ${site.name}</span>
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
  const groups = groupByDay(timetable.classes);
  mount(main(), html`
    <section class="hero ${heroImg ? 'has-image' : ''}" ${raw(heroImg ? `style="background-image:url('${esc(heroImg)}')"` : '')}>
      <div class="container hero-inner">
        <div>
          <span class="eyebrow">${site.shortName || 'Bhangra'} · East London</span>
          <h1>${home.heroTitle}</h1>
          <p>${home.heroSubtitle}</p>
          <div class="btn-row">
            ${home.ctaPrimary?.label ? html`<a class="btn btn-accent" href="${safeUrl(home.ctaPrimary.link)}">${home.ctaPrimary.label}</a>` : ''}
            ${home.ctaSecondary?.label ? html`<a class="btn btn-light" href="${safeUrl(home.ctaSecondary.link)}">${home.ctaSecondary.label}</a>` : ''}
          </div>
        </div>
        <div class="hero-logo"><img src="${safeImg(site.logo) || '/img/logo.png'}" alt="${site.name} logo"></div>
      </div>
    </section>

    ${home.highlights?.length ? html`
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

    <section class="section section-soft">
      <div class="container split">
        <div>
          <span class="eyebrow">Welcome</span>
          <h2>${home.introTitle}</h2>
          <div class="rich">${formatText(home.introText)}</div>
          <div class="btn-row" style="margin-top:20px">
            <a class="btn btn-primary" href="/about">About the academy</a>
            <a class="btn btn-outline" href="/pricing">See pricing</a>
          </div>
        </div>
        <div>
          ${safeImg(home.introImage)
            ? html`<img src="${safeImg(home.introImage)}" alt="" loading="lazy">`
            : html`
              <div class="card">
                <h3>Weekly classes</h3>
                ${[...groups].map(([day, list]) => html`
                  <div class="list-item">
                    <div><strong>${day}</strong><div class="meta">${list.map((c) => c.name).join(' · ')}</div></div>
                    <span class="tag">${formatTime(list[0].start)}</span>
                  </div>`)}
                <a class="btn btn-sm btn-accent" href="/timetable" style="margin-top:12px">Full timetable</a>
              </div>`}
        </div>
      </div>
    </section>

    <section class="section" id="home-insta" hidden>
      <div class="container">
        <div class="section-title"><span class="eyebrow">Instagram</span><h2>Latest from the academy</h2></div>
        <div class="gallery-grid" id="home-insta-grid"></div>
        <div class="center" style="margin-top:24px"><a class="btn btn-outline" href="/gallery">View gallery</a></div>
      </div>
    </section>

    <section class="cta-band">
      <div class="container">
        <h2>Ready to dance?</h2>
        <p>Come along to a class. Beginners are always welcome.</p>
        <div class="btn-row" style="justify-content:center">
          <a class="btn btn-light" href="/timetable">Find a class</a>
          <a class="btn btn-primary" href="/contact">Contact us</a>
        </div>
      </div>
    </section>`);

  api('/api/instagram').then((feed) => {
    const posts = (feed.posts || []).slice(0, 6);
    if (!posts.length) return;
    mount('#home-insta-grid', posts.map(instaItem));
    document.getElementById('home-insta').hidden = false;
  }).catch(() => {});
}

function renderAbout() {
  const { about } = state.content;
  setTitle(about.title);
  mount(main(), html`
    ${pageHero(about.title, about.intro)}
    <section class="section">
      <div class="container ${safeImg(about.image) ? 'split' : ''}">
        <div class="rich" style="max-width:760px;${safeImg(about.image) ? '' : 'margin:0 auto'}">
          <span class="eyebrow">Our story</span>
          ${formatText(about.story)}
        </div>
        ${safeImg(about.image) ? html`<img src="${safeImg(about.image)}" alt="" loading="lazy">` : ''}
      </div>
    </section>
    ${about.values?.length ? html`
    <section class="section section-soft">
      <div class="container">
        <div class="section-title"><h2>What we stand for</h2></div>
        <div class="grid grid-3">${about.values.map((v) => html`<div class="card"><h3>${v.title}</h3><p class="muted">${v.text}</p></div>`)}</div>
      </div>
    </section>` : ''}
    ${about.founders?.length ? html`
    <section class="section">
      <div class="container">
        <div class="section-title"><span class="eyebrow">The team</span><h2>Meet the team</h2></div>
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
  mount(main(), html`
    ${pageHero(timetable.title, timetable.intro)}
    <section class="section">
      <div class="container">
        ${groups.size ? [...groups].map(([day, list]) => html`
          <div class="day-group">
            <h3>${day}</h3>
            ${list.map(classCard)}
          </div>`) : html`<div class="empty">The timetable will be published soon.</div>`}
        ${timetable.notes ? html`<div class="notice">${formatText(timetable.notes)}</div>` : ''}
      </div>
    </section>
    <section class="section section-soft">
      <div class="container split">
        <div>
          <h2>${timetable.venueTitle}</h2>
          <div class="rich">${formatText(timetable.venueText)}</div>
          <a class="btn btn-primary" href="/contact">Questions? Contact us</a>
        </div>
        ${mapEmbed(site.mapQuery)}
      </div>
    </section>`);
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
              ${p.highlight ? html`<span class="badge">Most popular</span>` : ''}
              <h3>${p.name}</h3>
              <div class="plan-price">${p.price}</div>
              <div class="plan-period">${p.period}</div>
              <p class="muted">${p.description}</p>
              <ul>${(p.features || []).filter(Boolean).map((f) => html`<li>${f}</li>`)}</ul>
            </div>`)}
        </div>
        ${pricing.notes ? html`<div class="notice" style="margin-top:32px">${formatText(pricing.notes)}</div>` : ''}
        <div class="center" style="margin-top:24px"><a class="btn btn-accent" href="/contact">Ask about private lessons</a></div>
      </div>
    </section>`);
}

function instaItem(p) {
  const icon = p.type === 'VIDEO' ? '▶' : p.type === 'CAROUSEL_ALBUM' ? '❐' : '';
  return html`
    <a class="gallery-item" href="${safeUrl(p.permalink)}" target="_blank" rel="noopener" aria-label="${p.caption ? p.caption.slice(0, 80) : 'Instagram post'}">
      <img src="${safeImg(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      ${icon ? html`<span class="gi-type">${icon}</span>` : ''}
      ${p.caption ? html`<span class="gi-caption">${p.caption}</span>` : ''}
    </a>`;
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
            <div>@${username}<div class="muted small">Instagram</div></div>
          </div>
          <a class="btn btn-insta" href="${profileUrl}" target="_blank" rel="noopener">Follow on Instagram</a>
        </div>
        <div id="insta-grid" class="gallery-grid"><div class="page-loading" style="grid-column:1/-1;min-height:200px"><div class="spinner"></div></div></div>
      </div>
    </section>
    ${gallery.extraImages?.length ? html`
    <section class="section section-soft">
      <div class="container">
        <div class="section-title"><h2>More photos</h2></div>
        <div class="gallery-grid">
          ${gallery.extraImages.filter((i) => safeImg(i.url)).map((i) => html`
            <figure class="gallery-item" style="margin:0">
              <img src="${safeImg(i.url)}" alt="${i.caption || ''}" loading="lazy">
              ${i.caption ? html`<figcaption class="gi-caption">${i.caption}</figcaption>` : ''}
            </figure>`)}
        </div>
      </div>
    </section>` : ''}`);

  const grid = document.getElementById('insta-grid');
  try {
    const feed = await api('/api/instagram');
    if (feed.posts?.length) mount(grid, feed.posts.map(instaItem));
    else {
      mount(grid, html`
        <div class="empty" style="grid-column:1/-1">
          <p>See our latest photos and videos on Instagram.</p>
          <a class="btn btn-insta" href="${profileUrl}" target="_blank" rel="noopener">Open @${username}</a>
        </div>`);
    }
  } catch {
    mount(grid, html`<div class="empty" style="grid-column:1/-1">Could not load Instagram posts. <a href="${profileUrl}" target="_blank" rel="noopener">View them on Instagram</a>.</div>`);
  }
}

function renderContact() {
  const { contact, site } = state.content;
  setTitle(contact.title);
  mount(main(), html`
    ${pageHero(contact.title, contact.intro)}
    <section class="section">
      <div class="container grid grid-2" style="gap:40px">
        <div>
          <h2>Find us</h2>
          <ul class="contact-list">
            ${site.address ? html`<li><span class="ci">📍</span><div><strong>Address</strong><br>${site.address}</div></li>` : ''}
            ${(site.phones || []).filter(Boolean).length ? html`<li><span class="ci">📞</span><div><strong>Phone</strong><br>${site.phones.filter(Boolean).map((p, i) => html`${i ? raw('<br>') : ''}<a href="tel:${p.replace(/\s+/g, '')}">${p}</a>`)}</div></li>` : ''}
            ${site.email ? html`<li><span class="ci">✉️</span><div><strong>Email</strong><br><a href="mailto:${site.email}">${site.email}</a></div></li>` : ''}
          </ul>
          ${socialLinks(site)}
          <div style="margin-top:24px">${mapEmbed(site.mapQuery)}</div>
        </div>
        ${contact.formEnabled ? html`
        <div class="card">
          <h2>Send a message</h2>
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
            <button class="btn btn-primary" type="submit">Send message</button>
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
        toast('Thanks! Your message has been sent.', 'success');
      } catch (err) {
        formError(form, err.message);
      }
    });
  });
}

function renderCustomPage(slug) {
  const page = state.content.customPages.find((p) => p.slug === slug);
  if (!page) return renderNotFound();
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
  setTitle('Member login');
  const { site } = state.content;
  mount(main(), authShell('Member login', html`
    <p class="center muted">Log in to see your member QR code and class attendance.</p>
    <form class="form" id="login-form" novalidate>
      <label class="field"><span>Email or member ID</span><input name="identifier" required autocomplete="username" autocapitalize="none"></label>
      <label class="field"><span>Password</span><input name="password" type="password" required autocomplete="current-password"></label>
      <div class="form-error" role="alert"></div>
      <button class="btn btn-primary btn-block" type="submit">Log in</button>
    </form>
    <p class="center small muted" style="margin-top:16px">Forgotten your password? Ask an instructor at your next class to reset it.</p>
    ${site.allowRegistration ? html`<p class="center" style="margin:0">New member? <a href="/register">Create an account</a></p>` : ''}`));

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
  setTitle('Join');
  if (!state.content.site.allowRegistration) {
    mount(main(), authShell('Join the academy', html`
      <p class="center">Online registration is currently closed. Please speak to an instructor at your next class and they will set up your account.</p>
      <a class="btn btn-primary btn-block" href="/login">Back to login</a>`));
    return;
  }
  mount(main(), authShell('Create your account', html`
    <p class="center muted">You will get a unique member ID and QR code to scan in at every class.</p>
    <form class="form" id="register-form" novalidate>
      <label class="field"><span>Full name</span><input name="name" required autocomplete="name"></label>
      <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email"></label>
      <label class="field"><span>Phone (optional)</span><input name="phone" type="tel" autocomplete="tel"></label>
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
        toast(`Welcome! Your member ID is ${user.memberId}`, 'success', 6000);
        navigate('/account', { replace: true });
      } catch (err) {
        formError(form, err.message);
      }
    });
  });
}

async function renderAccount() {
  if (!state.user) return navigate('/login?next=/account', { replace: true });
  setTitle('My account');
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
              <div class="small" style="opacity:.8;position:relative;z-index:1">${state.content.site.name}</div>
              <h2>${u.name}</h2>
              <div class="mid">${u.memberId}</div>
              <div class="qr-box"><img src="/api/me/qr.svg?v=${encodeURIComponent(u.memberId)}" alt="QR code for member ID ${u.memberId}" width="256" height="256"></div>
              <div class="small" style="opacity:.85;position:relative;z-index:1">Show this code to your instructor at the start of each class.</div>
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
              <h3>Attendance history</h3>
              ${attendance.length ? html`<ul class="list">${attendance.map((a) => html`
                <li class="list-item">
                  <div><strong>${a.title}</strong><div class="meta">${formatDate(a.date)}${a.startTime ? ` · ${formatTime(a.startTime)}` : ''}</div></div>
                  <span class="tag">✓ Attended</span>
                </li>`)}</ul>` : html`<p class="muted">No classes yet. Your attendance will appear here once an instructor scans your QR code.</p>`}
            </div>
            <div class="card" style="margin-top:20px">
              <h3>My details</h3>
              <form class="form" id="profile-form">
                <label class="field"><span>Name</span><input name="name" value="${u.name}" required></label>
                <label class="field"><span>Phone</span><input name="phone" type="tel" value="${u.phone}"></label>
                <label class="field"><span>Email</span><input value="${u.email}" disabled><small>Ask an instructor to change your email.</small></label>
                <div class="form-error" role="alert"></div>
                <div><button class="btn btn-primary" type="submit">Save details</button></div>
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
      toast('Details saved', 'success');
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

export async function navigate(path, { replace = false } = {}) {
  if (leaveGuard && !leaveGuard()) return;
  leaveGuard = null;
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  await route();
}

let cleanup = null;
export function onLeave(fn) {
  cleanup = fn;
}

async function route() {
  leaveGuard = null;
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

window.addEventListener('popstate', route);
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
