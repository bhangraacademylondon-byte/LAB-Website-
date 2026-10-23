// Small motion effects in the spirit of Magic UI, without React:
// blur fade, number ticker, ripple and confetti. All are skipped for
// visitors who ask their device for reduced motion.

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Blur fade: parts of the page soften into view as they scroll in.
// Anything already on screen when the page opens shows straight away.
export function blurFade(root) {
  if (still() || !('IntersectionObserver' in window)) return;
  const parts = root.querySelectorAll('[data-fade] > *');
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      en.target.classList.add('is-in');
      io.unobserve(en.target);
    }
  }, { rootMargin: '0px 0px -10% 0px' });
  parts.forEach((el, i) => {
    if (el.getBoundingClientRect().top < innerHeight * 0.9) return;
    el.classList.add('fade');
    el.style.setProperty('--d', `${(i % 3) * 70}ms`);
    io.observe(el);
  });
}

// Number ticker: a figure counts up to its value when it comes into view.
// data-count holds the number, or hours:minutes, to count to.
export function numberTickers(root) {
  if (still() || !('IntersectionObserver' in window)) return;
  root.querySelectorAll('[data-count]').forEach((el) => {
    const text = el.textContent;
    const nums = el.dataset.count.split(':').map(Number);
    if (nums.some(Number.isNaN)) return;
    const m = text.match(/\d+(?::\d{2})?/);
    if (!m) return;
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + m[0].length);
    const fmt = (t) => before + (nums.length === 2
      ? `${Math.round(nums[0] * t)}:${String(Math.round(nums[1] * t)).padStart(2, '0')}`
      : Math.round(nums[0] * t)) + after;
    el.textContent = fmt(0);
    const seen = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      seen.disconnect();
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / 1100);
        el.textContent = t < 1 ? fmt(1 - (1 - t) ** 4) : text;
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    seen.observe(el);
  });
}

// Ripple: a ring spreads from where a button is pressed.
export function enableRipples() {
  document.addEventListener('pointerdown', (e) => {
    if (still()) return;
    const el = e.target.closest('.cta-pill, .cta-ring, .call-btn, .motion-btn');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const d = Math.max(r.width, r.height) * 2.2;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    el.appendChild(dot);
    setTimeout(() => dot.remove(), 600);
  });
}

// Confetti: a short burst of gold and navy from a point, for moments that succeed.
export function confetti(from) {
  if (still()) return;
  const r = from?.getBoundingClientRect?.();
  const x = r ? r.left + r.width / 2 : innerWidth / 2;
  const y = r ? r.top + r.height / 2 : innerHeight / 2;
  const c = document.createElement('canvas');
  const dpr = Math.min(2, devicePixelRatio || 1);
  c.className = 'confetti';
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  document.body.appendChild(c);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const colours = ['#c9a463', '#e7c98a', '#1d1d3b', '#2a2a52', '#f9f6f1'];
  const bits = Array.from({ length: 110 }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const v = 7 + Math.random() * 9;
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colours[(Math.random() * colours.length) | 0] };
  });
  const t0 = performance.now();
  const frame = (now) => {
    const t = (now - t0) / 1600;
    g.clearRect(0, 0, innerWidth, innerHeight);
    g.globalAlpha = Math.max(0, 1 - Math.max(0, t - 0.6) / 0.4);
    for (const b of bits) {
      b.vy += 0.32; b.vx *= 0.985; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore();
    }
    if (t < 1) requestAnimationFrame(frame);
    else c.remove();
  };
  requestAnimationFrame(frame);
}
