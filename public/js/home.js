// Home page: the academy's name set big on the left, and a wall of rounded
// tiles (Instagram photos, the academy's artwork and a few facts) drifting
// up and down on the right. The whole page fits one screen on every device.
// Everything shown comes from the content edited in Admin.

import { api, html, raw, mount, safeImg, formatTime } from './lib.js';
import { classDays, firstPlan, firstPhone, telHref, splitAddress, marked, directions, goLink, ICON } from './classes.js';

const MODES = ['desk', 'mob', 'mob-l', 'tab', 'tab-l', 'tab-p'];
// Brand pictures fill the photo tiles until Instagram posts arrive (or if there are none).
const BRAND = ['/img/logo-backdrop.webp', '/img/pattern.webp', '/img/emblem-cream.webp'];

// The layout follows the screen's shape (see home.css), scaled from a 1280 x 800 canvas on wide screens.
function fit() {
  const root = document.documentElement;
  const mode = getComputedStyle(root).getPropertyValue('--home-mode').trim() || 'mob';
  root.classList.remove(...MODES, 'ex1', 'ex2', 'ex3');
  root.classList.add(mode);
  if (mode.startsWith('tab')) root.classList.add('tab');
  if (mode.startsWith('mob')) root.classList.add('mob');
  const vw = innerWidth;
  const vh = innerHeight;
  const st = root.style;
  if (mode === 'desk' || mode === 'tab-l') {
    const s = vw / vh > 1280 / 800 ? vh / 800 : vw / 1280;
    st.setProperty('--s', s);
    st.setProperty('--W', vw / s);
    st.setProperty('--H', vh / s);
    const extra = Math.max(0, Math.min(3, Math.floor((vw / s - 1294) / 218.33)));
    if (mode === 'desk' && extra) root.classList.add(`ex${extra}`);
  } else {
    for (const p of ['--s', '--W', '--H']) st.removeProperty(p);
  }
}

function unfit() {
  const root = document.documentElement;
  root.classList.remove(...MODES, 'ex1', 'ex2', 'ex3');
  for (const p of ['--s', '--W', '--H']) root.style.removeProperty(p);
}

// A short phrase set on two rows, broken where the rows come out most even.
function twoRows(text) {
  const words = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').split(/\s+/);
  if (words.length < 2) return words.join('');
  let best = 1;
  for (let i = 1; i < words.length; i++) {
    const cost = (k) => Math.max(words.slice(0, k).join(' ').length, words.slice(k).join(' ').length);
    if (cost(i) < cost(best)) best = i;
  }
  return `${words.slice(0, best).join(' ')}<br>${words.slice(best).join(' ')}`;
}

export function renderHome(ctx) {
  const { state, main, setTitle, onLeave } = ctx;
  const { home, site, timetable, pricing } = state.content;
  setTitle('');

  const classes = (timetable.classes || []).filter((c) => c && c.name);
  const days = classDays(classes);
  const plan = firstPlan(pricing);
  const phone = firstPhone(site);
  const [, area] = splitAddress(site.address);
  const words = String(home.heroTitle || site.name).trim().split(/\s+/);
  const rotate = (home.tileWords || []).filter(Boolean);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // A longer heading is set smaller so it always fits the screen: the design suits up to
  // four lines of about nine letters, the length of "London Academy of Bhangra".
  const longest = Math.max(...words.map((w) => w.length));
  const fitScale = Math.max(0.45, Math.min(1, 9 / longest, 4 / words.length));

  // The facts on the tiles, each from the content.
  const facts = {
    day: days.length === 1 ? `Every ${days[0]}` : days.length ? `${days.length} days a week` : '',
    time: classes[0] ? formatTime(classes[0].start) : '',
    price: plan ? `${plan.price} ${String(plan.period || '').replace(/^per /, 'a ')}`.trim() : '',
    area: String(area).split(',')[0] || '',
  };
  const word = (text) => (text ? html`<span class="m-word">${raw(twoRows(text))}</span>` : '');
  const rot = rotate.length ? html`<span class="m-word rotate"><span class="rw">${raw(twoRows(rotate[0]))}</span></span>` : '';
  const P = (n) => html`<div class="m-cell ph" data-slot="${n}"></div>`;
  const C = (tone, inner = '') => html`<div class="m-cell ${tone}">${inner}</div>`;
  const cols = {
    // Photo numbers are spread so neighbouring tiles never repeat a picture.
    x3: [P(2), C('deep'), C('dark'), P(6), C('gold')],
    x2: [C('gold'), P(7), C('cream'), C('mid'), P(5)],
    x1: [C('deep'), P(6), C('mid'), P(1), C('cream')],
    c1: [C('gold', word(facts.day)), P(0), P(4), C('deep', word(facts.time)), P(2)],
    c2: [C('mid', rot), P(1), C('dark'), P(5), C('gold', word(facts.price))],
    c3: [C('deep'), C('cream', word(facts.area)), P(3), C('gold'), P(7)],
  };

  document.body.classList.add('on-home');
  mount(main(), html`
    <div class="home2" id="home2">
      <div class="m-grid" id="m-grid" aria-hidden="true">
        ${Object.entries(cols).map(([k, cells]) => html`<div class="m-col ${k}">${cells}${cells}</div>`)}
      </div>
      <button class="motion-btn" id="motion-btn" type="button" aria-pressed="false" aria-label="Pause the moving pictures">
        <svg class="i-pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
        <svg class="i-play" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z"/></svg>
      </button>
      <section class="home-hero" aria-labelledby="hero-title">
        <h1 id="hero-title" style="--hs:${fitScale}">${words.map((w, i) => html`<span class="${i === words.length - 1 ? 'tile-word' : ''}"><span class="ln">${w}</span></span> `)}</h1>
        ${home.heroTagline ? html`<p class="home-tag">${marked(home.heroTagline, 'em')}</p>` : ''}
        ${home.heroSubtitle ? html`<p class="home-lede">${marked(home.heroSubtitle)}</p>` : ''}
        <div class="home-acts">
          ${directions(site, { shimmer: true })}
          ${phone ? html`<a class="cta-pill light call-pill" href="${telHref(phone)}">${ICON.phone}Call us</a>` : ''}
          ${goLink(state.content.nav.find((n) => n.id === 'timetable')?.label || 'Timetable', '/timetable')}
        </div>
      </section>
    </div>`);

  // The header joins the composition on this page, and goes back on leaving.
  const stage = document.getElementById('home2');
  const hdr = document.getElementById('hdr');
  stage.prepend(hdr);
  fit();
  addEventListener('resize', fit);
  addEventListener('orientationchange', fit);

  // Photo tiles: brand pictures now, the newest Instagram posts when they arrive.
  const fill = (urls) => {
    stage.querySelectorAll('.m-cell.ph').forEach((cell) => {
      const url = urls[Number(cell.dataset.slot) % urls.length];
      cell.style.setProperty('--pic', `url("${String(url).replace(/["\\\n]/g, '')}")`);
      cell.classList.toggle('is-photo', !BRAND.includes(url));
    });
  };
  fill(BRAND);
  if (home.showInstagram) {
    api('/api/instagram').then((feed) => {
      const urls = (feed.posts || []).map((p) => safeImg(p.image)).filter(Boolean).slice(0, Math.max(4, Number(home.instagramPostCount) || 8));
      if (urls.length && document.body.contains(stage)) fill(urls.length >= 4 ? urls : [...urls, ...BRAND]);
    }).catch(() => {});
  }

  // Pause / play the moving pictures (they move for longer than five seconds).
  const grid = document.getElementById('m-grid');
  const pause = document.getElementById('motion-btn');
  pause.addEventListener('click', () => {
    const paused = !grid.classList.contains('is-paused');
    grid.classList.toggle('is-paused', paused);
    pause.setAttribute('aria-pressed', String(paused));
    pause.setAttribute('aria-label', paused ? 'Play the moving pictures' : 'Pause the moving pictures');
  });

  // Word rotate: the tile cycles through who the class is for.
  let timer = 0;
  if (rotate.length > 1 && !still) {
    let k = 0;
    timer = setInterval(() => {
      if (document.hidden || grid.classList.contains('is-paused')) return;
      k = (k + 1) % rotate.length;
      const next = twoRows(rotate[k]);
      stage.querySelectorAll('.rotate .rw').forEach((rw) => {
        rw.classList.add('out');
        setTimeout(() => {
          rw.innerHTML = next;
          rw.classList.remove('out');
          rw.classList.add('in');
          void rw.offsetWidth;
          rw.classList.remove('in');
        }, 260);
      });
    }, 2600);
  }

  onLeave(() => {
    clearInterval(timer);
    removeEventListener('resize', fit);
    removeEventListener('orientationchange', fit);
    document.body.classList.remove('on-home');
    main().before(hdr);
    unfit();
  });

  if (still || !document.body.animate) return;
  // The one entrance: header slides down, the name rises line by line, and the
  // tiles glide in and hand over to their endless drift at 2.1s.
  const EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const QUART = 'cubic-bezier(0.25, 1, 0.5, 1)';
  const QUINT = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const run = (el, frames, opts) => el && el.animate(frames, { fill: 'backwards', ...opts });
  run(hdr, [{ transform: 'translateY(calc(-100% - 48px))' }, { transform: 'none' }], { duration: 950, easing: EXPO });
  stage.querySelectorAll('#hero-title .ln').forEach((el, i) => run(el, [{ transform: 'translateY(110%)' }, { transform: 'none' }], { duration: 1000, delay: 300 + i * 85, easing: EXPO }));
  run(stage.querySelector('.home-tag'), [{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 620, easing: QUART });
  run(stage.querySelector('.home-lede'), [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 700, easing: QUART });
  stage.querySelectorAll('.home-acts > *').forEach((el, i) => run(el, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: 820 + i * 70, easing: QUART }));
  const HANDOFF = 2100;
  const lead = 3.42 * (HANDOFF / 1000) * 0.5 + 8;
  stage.querySelectorAll('.m-col').forEach((col, i) => {
    if (getComputedStyle(col).display === 'none') return;
    const up = /\b(c2|x1|x3)\b/.test(col.className);
    const end = up ? -50 : 0;
    col.style.animationPlayState = 'paused';
    run(col, [{ transform: `translate3d(0,${up ? end - lead : end + lead}%,0)`, opacity: 0 }, { opacity: 1, offset: 0.35 }, { transform: `translate3d(0,${end}%,0)`, opacity: 1 }], { duration: HANDOFF - i * 60, delay: i * 60, easing: QUINT });
  });
  setTimeout(() => stage.querySelectorAll('.m-col').forEach((col) => { col.style.animationPlayState = ''; }), HANDOFF);
}
