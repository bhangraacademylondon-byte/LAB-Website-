// Visitor statistics without cookies: which pages are viewed, for how long,
// and which main buttons are pressed. Nothing is stored on the device; the
// server counts each visitor for one day only (see server/visitors.js).
// Browsers set to "do not track" or Global Privacy Control are left out.

const off = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
let view = null; // { id, shown, since }
let landing = true;

const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');

function send(path, body) {
  fetch(path, {
    method: 'POST',
    keepalive: true,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-LAB-CSRF': '1' },
    body: JSON.stringify(body),
  }).catch(() => {});
}

// Time counts only while the page is on screen.
function seconds() {
  if (!view) return 0;
  return Math.round((view.shown + (view.since ? performance.now() - view.since : 0)) / 1000);
}

function flush() {
  const s = seconds();
  if (view && s > 0) send('/api/v/time', { id: view.id, seconds: s });
}

export function trackPage(path) {
  if (off) return;
  flush();
  view = { id: randomId(), shown: 0, since: document.visibilityState === 'visible' ? performance.now() : 0 };
  const body = { id: view.id, path };
  if (landing) {
    const tag = new URLSearchParams(location.search).get('utm_source') || '';
    Object.assign(body, { landing: true, ref: document.referrer, tag: tag.slice(0, 40) });
    landing = false;
  }
  send('/api/v', body);
}

export function trackEvent(name) {
  if (!off) send('/api/v/event', { name, path: location.pathname });
}

// Which button a click was, judged from where the link goes.
function eventFor(a) {
  const href = a.getAttribute('href') || '';
  if (href.startsWith('tel:')) return 'call';
  if (a.hasAttribute('data-ics') || /\.ics$/.test(a.getAttribute('download') || '')) return 'calendar';
  if (/google\.[^/]+\/maps|maps\.google\./.test(href)) return 'directions';
  if (/instagram\.com/.test(href)) return 'instagram';
  if (/^\/register(\b|$)/.test(href)) return 'join';
  return null;
}

if (!off) {
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    const name = a && eventFor(a);
    if (name) trackEvent(name);
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (!view) return;
    if (document.visibilityState === 'hidden') {
      if (view.since) view.shown += performance.now() - view.since;
      view.since = 0;
      flush();
    } else {
      view.since = performance.now();
    }
  });
}
