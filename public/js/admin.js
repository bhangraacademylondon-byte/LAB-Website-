import {
  api, html, raw, mount, el, toast, openDialog, confirmDialog, formatDate, formatDateTime, formatTime,
  todayLondon, formError, formData, withBusy, safeImg, safeUrl,
} from './lib.js';
import { state, navigate, onLeave, setLeaveGuard, reloadContent, monthlyChart } from './app.js';

const isAdmin = () => state.user?.role === 'admin';
// Teachers an admin has allowed to edit Our journey (admins always can).
const canEditTimeline = () => isAdmin() || Boolean(state.user?.canEditTimeline);
// The 'instructor' role is shown to people as "Teacher".
const ROLE_LABELS = { member: 'Member', instructor: 'Teacher', admin: 'Admin' };
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ---------- layout ----------

// The page editors, grouped on one "Edit website" page rather than listed in the menu.
const EDITORS = [
  { group: 'The whole site', items: [
    { path: 'content/site', label: 'Site & branding', icon: '🎨', note: 'Name, logo, colours, phone numbers' },
    { path: 'content/nav', label: 'Menu tabs', icon: '🧭', note: 'Which pages are in the menu' },
  ] },
  { group: 'Pages', items: [
    { path: 'content/home', label: 'Home page', icon: '🏡' },
    { path: 'content/about', label: 'About page', icon: '📖', note: 'Story and team' },
    { path: 'content/timetable', label: 'Timetable', icon: '🕒', note: 'Classes, times and place' },
    { path: 'content/pricing', label: 'Pricing', icon: '💷', note: 'Prices and Monzo link' },
    { path: 'content/faq', label: 'FAQs', icon: '❓' },
    { path: 'content/gallery', label: 'Gallery', icon: '🖼️' },
    { path: 'content/timeline', label: 'Our journey', icon: '🛤️', note: 'Milestones' },
    { path: 'content/performances', label: 'Performances', icon: '🎉' },
    { path: 'content/workshops', label: 'Workshops', icon: '💃' },
    { path: 'content/contact', label: 'Contact page', icon: '✉️' },
    { path: 'content/customPages', label: 'Extra pages', icon: '📄' },
  ] },
  { group: 'Members', items: [
    { path: 'content/members', label: 'Member pages', icon: '🔑', note: 'Sign-up and login wording' },
    { path: 'content/privacy', label: 'Privacy policy', icon: '🔒' },
  ] },
];

const NAV = [
  { heading: 'Attendance' },
  { path: '', label: 'Dashboard', icon: '🏠' },
  { path: 'scanner', label: 'QR scanner', icon: '📷' },
  { path: 'sessions', label: 'Sessions', icon: '📅' },
  { path: 'payments', label: 'Payments', icon: '💷' },
  { path: 'members', label: 'Members', icon: '👥' },
  { path: 'debriefs', label: 'Class debriefs', icon: '📝' },
  { heading: 'Website', admin: true, timeline: true },
  { path: 'website', label: 'Edit website', icon: '✏️', admin: true },
  // Teachers allowed to edit Our journey see just that.
  { path: 'content/timeline', label: 'Our journey', icon: '🛤️', timelineOnly: true },
  { path: 'visitors', label: 'Visitors', icon: '📈', admin: true },
  { path: 'instagram', label: 'Instagram', icon: '📸', admin: true },
  { path: 'messages', label: 'Messages', icon: '💬', admin: true },
  { path: 'content/json', label: 'Advanced', icon: '⚙️', admin: true },
];

function layout(active) {
  const items = NAV.filter((n) => (n.timelineOnly ? !isAdmin() && canEditTimeline() : !n.admin || isAdmin() || (n.timeline && canEditTimeline())));
  // Any page editor counts as "Edit website" in the menu.
  const current = isAdmin() && active.startsWith('content/') && active !== 'content/json' ? 'website' : active;
  mount('#main', html`
    <div class="container admin-layout">
      <nav class="admin-nav" aria-label="Admin">
        ${items.map((n) => n.heading
          ? html`<div class="nav-heading">${n.heading}</div>`
          : html`<a href="/admin${n.path ? '/' + n.path : ''}" class="${n.path === current ? 'active' : ''}"><span aria-hidden="true">${n.icon}</span>${n.label}</a>`)}
      </nav>
      <div class="admin-main" id="admin-main"><div class="page-loading"><div class="spinner"></div></div></div>
    </div>`);
  const activeLink = document.querySelector('.admin-nav a.active');
  activeLink?.scrollIntoView({ block: 'nearest', inline: 'center' });
  return document.getElementById('admin-main');
}

function websiteIndex(root) {
  mount(root, html`
    ${head('Edit website')}
    ${EDITORS.map((g) => html`
      <h3 style="margin:18px 0 10px">${g.group}</h3>
      <div class="editor-grid">${g.items.map((e) => html`
        <a class="card editor-tile" href="/admin/${e.path}"><span class="et-icon" aria-hidden="true">${e.icon}</span><span><b>${e.label}</b>${e.note ? html`<small>${e.note}</small>` : ''}</span></a>`)}
      </div>`)}`);
}

function head(title, actions = '') {
  return html`<div class="admin-head"><h1>${title}</h1><div class="btn-row">${actions}</div></div>`;
}

export async function render(parts) {
  const [section = '', sub, id] = parts;
  document.title = `Admin | ${state.content.site.name}`;
  const adminOnly = ['content', 'website', 'instagram', 'messages', 'visitors'];
  const timelineOnly = section === 'content' && sub === 'timeline' && canEditTimeline();
  if (adminOnly.includes(section) && !isAdmin() && !timelineOnly) return navigate('/admin', { replace: true });

  if (section === '') return dashboard(layout(''));
  if (section === 'scanner') return scanner(layout('scanner'));
  if (section === 'sessions') return sub ? sessionDetail(layout('sessions'), sub) : sessionsList(layout('sessions'));
  if (section === 'payments') return paymentsPage(layout('payments'));
  if (section === 'members') return sub ? memberDetail(layout('members'), sub) : membersList(layout('members'));
  if (section === 'debriefs') {
    const root = layout('debriefs');
    if (sub === 'new') return debriefForm(root);
    if (sub && id === 'edit') return debriefForm(root, { id: sub });
    if (sub) return debriefView(root, sub);
    return debriefsList(root);
  }
  if (section === 'website') return websiteIndex(layout('website'));
  if (section === 'content') return contentEditor(layout(`content/${sub}`), sub, id);
  if (section === 'instagram') return instagramPage(layout('instagram'));
  if (section === 'messages') return messagesPage(layout('messages'));
  if (section === 'visitors') return visitorsPage(layout('visitors'));
  navigate('/admin', { replace: true });
}

// ---------- dashboard ----------

async function dashboard(root) {
  const [stats, today] = await Promise.all([api('/api/staff/stats'), api('/api/staff/today')]);
  mount(root, html`
    ${state.user.privacyRequired ? html`<div class="notice warn">You have not accepted the current Privacy Policy yet. <a href="/privacy-consent?next=/admin">Review and accept it</a>${isAdmin() ? html`, or <a href="/admin/content/privacy">edit the policy</a> first` : ''}.</div>` : ''}
    ${head(`Welcome, ${state.user.name.split(' ')[0]}`, html`<a class="btn btn-accent" href="/admin/scanner">📷 Scan attendance</a>`)}
    <div class="stat-grid">
      <div class="stat"><div class="stat-value">${stats.members}</div><div class="stat-label">Active members</div></div>
      <div class="stat"><div class="stat-value">${stats.todayAttendance}</div><div class="stat-label">Checked in today</div></div>
      <div class="stat"><div class="stat-value">${stats.last30Attendance}</div><div class="stat-label">Check-ins (30 days)</div></div>
      <a class="stat" href="/admin/debriefs" style="text-decoration:none"><div class="stat-value">${stats.debriefsDue}</div><div class="stat-label">Debriefs to write</div></a>
      ${isAdmin() ? html`<a class="stat" href="/admin/messages" style="text-decoration:none"><div class="stat-value">${stats.unreadMessages}</div><div class="stat-label">Unread messages</div></a>` : ''}
      ${stats.toApprove ? html`<a class="stat" href="/admin/members?approve=1" style="text-decoration:none;background:#f6ecd8"><div class="stat-value">${stats.toApprove}</div><div class="stat-label">Under-16 accounts to approve</div></a>` : ''}
    </div>
    <div class="grid grid-2" style="margin-top:24px">
      <div class="card">
        <h3>Today · ${today.weekday}</h3>
        ${today.classes.length ? html`<ul class="list">${today.classes.map((c) => html`
          <li class="list-item"><div><strong>${c.name}</strong><div class="meta">${formatTime(c.start)}${c.end ? ` to ${formatTime(c.end)}` : ''}</div></div></li>`)}</ul>`
          : html`<p class="muted">No classes on the timetable today.</p>`}
        ${today.sessions.length ? html`<h4 style="margin-top:16px">Sessions recorded today</h4><ul class="list">${today.sessions.map((s) => html`
          <li class="list-item"><a href="/admin/sessions/${s.id}">${s.title}</a><span class="tag">${s.count} present</span></li>`)}</ul>` : ''}
      </div>
      <div class="card">
        <h3>Quick links</h3>
        <ul class="list">
          <li class="list-item"><a href="/admin/members">Add or find a member</a></li>
          <li class="list-item"><a href="/admin/sessions">Attendance history & CSV export</a></li>
          <li class="list-item"><a href="/admin/debriefs">Class debriefs & LAB pouch balance</a></li>
          ${!isAdmin() && canEditTimeline() ? html`<li class="list-item"><a href="/admin/content/timeline">Edit the Our journey page</a></li>` : ''}
          ${isAdmin() ? html`
          <li class="list-item"><a href="/admin/website">Edit the website</a></li>
          <li class="list-item"><a href="/admin/instagram">Instagram gallery settings</a></li>
          <li class="list-item"><a href="/api/admin/backup.json" download>Download a full backup</a><span class="meta">Do this regularly and keep the file somewhere safe and private.</span></li>` : ''}
          <li class="list-item"><a href="/account">My member card</a></li>
        </ul>
      </div>
    </div>`);
}

// ---------- scanner ----------

// Explains, in plain words, why the camera could not start and how to fix it.
function cameraHelp(err) {
  const text = String(err?.name || '') + ' ' + String(err?.message || err || '');
  if (!window.isSecureContext) {
    return html`The camera only works when the site is opened with a secure <strong>https://</strong> address.`;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return html`This browser can't use the camera. If you opened the link from an app like Instagram or WhatsApp, open it in <strong>Safari</strong> (iPhone) or <strong>Chrome</strong> (Android) instead, or use <strong>Scan from a photo</strong>.`;
  }
  if (/NotAllowed|Permission|denied/i.test(text)) {
    return html`Camera access was blocked. <strong>iPhone:</strong> tap <strong>aA</strong> in the address bar → Website Settings → Camera → Allow. <strong>Android (Chrome):</strong> tap the icon left of the address → Permissions → Camera → Allow. Then tap <strong>Start camera</strong> again.`;
  }
  if (/NotFound|Overconstrained|no camera/i.test(text)) {
    return html`No camera was found on this device. Use manual check-in below instead.`;
  }
  if (/NotReadable|in use|Could not start video/i.test(text)) {
    return html`The camera is being used by another app. Close other camera apps and tap <strong>Start camera</strong> again.`;
  }
  return html`Could not start the camera (${text.trim()}). Try <strong>Scan from a photo</strong> or manual check-in.`;
}

let qrLibPromise = null;
function loadQrLib() {
  if (!qrLibPromise) {
    qrLibPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/vendor/html5-qrcode.min.js';
      s.onload = () => resolve(window.__Html5QrcodeLibrary__);
      s.onerror = () => reject(new Error('Could not load the scanner.'));
      document.head.appendChild(s);
    });
  }
  return qrLibPromise;
}

function beep(ok = true) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (ok ? 0.12 : 0.3));
    o.onended = () => ctx.close();
  } catch {}
  navigator.vibrate?.(ok ? 80 : [60, 40, 60]);
}

async function scanner(root) {
  const params = new URLSearchParams(location.search);
  let sessionId = Number(params.get('session')) || Number(sessionStorage.getItem('lab-scan-session')) || null;
  let scannerInstance = null;
  let lastCode = '';
  let lastAt = 0;
  let busy = false;

  const stopCamera = async () => {
    if (scannerInstance) {
      try {
        await scannerInstance.stop();
        scannerInstance.clear();
      } catch {}
      scannerInstance = null;
    }
  };
  onLeave(() => stopCamera());

  const today = await api('/api/staff/today');
  if (sessionId) {
    try {
      const { session } = await api(`/api/staff/sessions/${sessionId}`);
      if (session.date !== today.date && !params.get('session')) sessionId = null;
    } catch {
      sessionId = null;
    }
  }

  const choose = async (body) => {
    const { session } = await api('/api/staff/sessions', { method: 'POST', body });
    sessionId = session.id;
    sessionStorage.setItem('lab-scan-session', String(session.id));
    showScanner();
  };

  function showPicker() {
    stopCamera();
    sessionStorage.removeItem('lab-scan-session');
    mount(root, html`
      ${head('QR scanner')}
      <div class="card">
        <h3>1. Choose the class you are taking attendance for</h3>
        <p class="muted">${formatDate(today.date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <div class="session-pick">
          ${today.classes.map((c, i) => html`
            <button class="session-option" data-class="${i}">
              <span><strong>${c.name}</strong><br><span class="muted small">${formatTime(c.start)}${c.end ? ` to ${formatTime(c.end)}` : ''} · From timetable</span></span>
              <span class="btn btn-sm btn-primary">Start</span>
            </button>`)}
          ${today.sessions.filter((s) => !today.classes.some((c) => c.name === s.title && c.start === s.start_time)).map((s) => html`
            <button class="session-option" data-session="${s.id}">
              <span><strong>${s.title}</strong><br><span class="muted small">${[formatTime(s.start_time), `${s.count} checked in`].filter(Boolean).join(' · ')}</span></span>
              <span class="btn btn-sm btn-primary">Continue</span>
            </button>`)}
          ${!today.classes.length && !today.sessions.length ? html`<p class="muted">No classes on the timetable for today. Create a session below.</p>` : ''}
        </div>
        <h3 style="margin-top:24px">Or create a one-off session</h3>
        <form class="form" id="custom-session">
          <div class="form-row">
            <label class="field"><span>Session name</span><input name="title" required placeholder="e.g. Workshop, Rehearsal"></label>
            <label class="field"><span>Date</span><input name="date" type="date" value="${today.date}" required></label>
          </div>
          <div class="form-row">
            <label class="field"><span>Start time</span><input name="start_time" type="time"></label>
            <label class="field"><span>End time</span><input name="end_time" type="time"></label>
          </div>
          <div class="form-error"></div>
          <div><button class="btn btn-outline" type="submit">Create session</button></div>
        </form>
      </div>`);
    root.querySelectorAll('[data-class]').forEach((b) => b.addEventListener('click', () => {
      const c = today.classes[Number(b.dataset.class)];
      choose({ title: c.name, date: today.date, start_time: c.start || '', end_time: c.end || '', location: c.location || '' }).catch((e) => toast(e.message, 'error'));
    }));
    root.querySelectorAll('[data-session]').forEach((b) => b.addEventListener('click', () => {
      sessionId = Number(b.dataset.session);
      sessionStorage.setItem('lab-scan-session', String(sessionId));
      showScanner();
    }));
    const form = root.querySelector('#custom-session');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      choose(formData(form)).catch((err) => formError(form, err.message));
    });
  }

  async function showScanner() {
    const { session, attendees } = await api(`/api/staff/sessions/${sessionId}`);
    mount(root, html`
      ${head(session.title, html`<button class="btn btn-sm btn-outline" id="change-session">Change session</button>`)}
      <p class="muted" style="margin-top:-12px">${formatDate(session.date, { weekday: 'long', day: 'numeric', month: 'long' })}${session.start_time ? ` · ${formatTime(session.start_time)}` : ''}</p>
      <div class="scanner-layout">
        <div>
          <div class="scanner-view">
            <div id="qr-reader"></div>
            <div class="scanner-placeholder" id="scanner-placeholder">
              <p>Point the camera at a member's QR code.</p>
              <button class="btn btn-accent" id="start-camera">📷 Start camera</button>
              <p class="small" style="opacity:.75;margin-top:12px">Your phone will ask to use the camera. Tap <strong>Allow</strong>.</p>
            </div>
          </div>
          <div class="btn-row" style="margin-top:12px">
            <button class="btn btn-sm btn-outline" id="stop-camera" hidden>Stop camera</button>
            <button class="btn btn-sm btn-ghost" id="switch-camera" hidden>Switch camera</button>
            <label class="btn btn-sm btn-ghost" id="photo-scan-label">📸 Scan from a photo
              <input type="file" accept="image/*" capture="environment" id="photo-scan" hidden>
            </label>
          </div>
          <div id="scan-result"></div>
          <div class="card" style="margin-top:16px">
            <h3>Manual check-in</h3>
            <p class="muted small">No phone? Type their member ID or search by name.</p>
            <form id="manual-form" class="form">
              <input name="q" type="search" placeholder="Member ID or name" aria-label="Member ID or name" autocomplete="off" autocapitalize="characters">
            </form>
            <ul class="list" id="manual-results"></ul>
          </div>
        </div>
        <div class="card">
          <div class="admin-head" style="margin-bottom:8px">
            <h3 style="margin:0">Checked in <span class="pill" id="att-count">${attendees.length}</span></h3>
            <a class="btn btn-sm btn-ghost" href="/api/staff/sessions/${session.id}/export.csv">Export CSV</a>
          </div>
          <ul class="list" id="attendee-list"></ul>
          <div class="debrief-cta">
            <p class="small muted" style="margin:0 0 10px">Class finished? Log who ran it, the head count, the LAB pouch balance and how it went.</p>
            <a class="btn btn-accent btn-block" href="/admin/debriefs/new?session=${session.id}">📝 Finish class &amp; write debrief</a>
          </div>
        </div>
      </div>`);

    const list = root.querySelector('#attendee-list');
    const renderAttendees = (rows) => {
      root.querySelector('#att-count').textContent = rows.length;
      mount(list, rows.length ? rows.map((a) => html`
        <li class="list-item">
          <div><strong>${a.name}</strong><div class="meta">${a.memberId} · ${formatDateTime(a.scannedAt, { hour: '2-digit', minute: '2-digit' })}${a.method === 'manual' ? ' · manual' : ''}</div></div>
          <button class="icon-btn danger" data-remove="${a.id}" aria-label="Remove ${a.name}">✕</button>
        </li>`) : html`<li class="muted">Nobody yet. Scan a QR code to check someone in.</li>`);
    };
    renderAttendees(attendees);
    const refresh = async () => renderAttendees((await api(`/api/staff/sessions/${session.id}`)).attendees);

    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-remove]');
      if (!btn) return;
      await api(`/api/staff/sessions/${session.id}/attendance/${btn.dataset.remove}`, { method: 'DELETE' });
      refresh();
    });

    const resultBox = root.querySelector('#scan-result');
    const showResult = (kind, icon, text) => {
      mount(resultBox, html`<div class="scan-result ${kind}"><span class="sr-icon">${icon}</span><div>${text}</div></div>`);
    };

    const checkIn = async (body) => {
      try {
        const r = await api(`/api/staff/sessions/${session.id}/attendance`, { method: 'POST', body });
        if (r.status === 'recorded') {
          beep(true);
          showResult('ok', '✅', html`<strong>${r.member.name}</strong> checked in<br><span class="small">${r.member.memberId} · ${r.stats.total} ${r.stats.total === 1 ? 'class' : 'classes'} total</span>${under16Line(r.member)}${paymentLine(r.payment, r.member.id, r.date)}`);
        } else {
          beep(true);
          showResult('warn', 'ℹ️', html`<strong>${r.member.name}</strong> is already checked in${under16Line(r.member)}${paymentLine(r.payment, r.member.id, r.date)}`);
        }
        wireDoorPay(resultBox, () => checkIn(body));
        wireApprove(resultBox, () => checkIn(body));
        refresh();
      } catch (err) {
        beep(false);
        showResult('err', '⚠️', err.message);
      }
    };

    const onScan = async (text) => {
      const now = Date.now();
      if (busy || (text === lastCode && now - lastAt < 4000)) return;
      lastCode = text;
      lastAt = now;
      busy = true;
      await checkIn({ code: text });
      busy = false;
    };

    let cameras = [];
    let cameraIndex = -1;
    const startCamera = async () => {
      const placeholder = root.querySelector('#scanner-placeholder');
      try {
        const lib = await loadQrLib();
        await stopCamera();
        scannerInstance = new lib.Html5Qrcode('qr-reader', { verbose: false });
        const config = { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.7); return { width: s, height: s }; } };
        const source = cameraIndex >= 0 && cameras[cameraIndex] ? cameras[cameraIndex].id : { facingMode: 'environment' };
        await scannerInstance.start(source, config, onScan, () => {});
        placeholder.hidden = true;
        root.querySelector('#stop-camera').hidden = false;
        if (!cameras.length) cameras = await lib.Html5Qrcode.getCameras().catch(() => []);
        root.querySelector('#switch-camera').hidden = cameras.length < 2;
      } catch (err) {
        scannerInstance = null;
        placeholder.hidden = false;
        showResult('err', '⚠️', cameraHelp(err));
      }
    };

    // Fallback for phones where the live camera is blocked (e.g. in-app browsers):
    // take a photo of the QR code with the camera app and read it from the photo.
    root.querySelector('#photo-scan').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const lib = await loadQrLib();
        await stopCamera();
        root.querySelector('#scanner-placeholder').hidden = false;
        const reader = new lib.Html5Qrcode('qr-reader', { verbose: false });
        const text = await reader.scanFile(file, false);
        reader.clear();
        await checkIn({ code: text });
      } catch {
        beep(false);
        showResult('err', '⚠️', 'No QR code found in that photo. Try again with the code filling more of the picture.');
      }
    });

    // On phones and tablets, open the camera straight away.
    if (window.matchMedia('(pointer: coarse)').matches && navigator.mediaDevices?.getUserMedia) startCamera();

    root.querySelector('#start-camera').addEventListener('click', startCamera);
    root.querySelector('#stop-camera').addEventListener('click', async () => {
      await stopCamera();
      root.querySelector('#scanner-placeholder').hidden = false;
      root.querySelector('#stop-camera').hidden = true;
      root.querySelector('#switch-camera').hidden = true;
    });
    root.querySelector('#switch-camera').addEventListener('click', () => {
      cameraIndex = (cameraIndex + 1) % cameras.length;
      startCamera();
    });
    root.querySelector('#change-session').addEventListener('click', showPicker);

    // Manual search / entry
    const manual = root.querySelector('#manual-form');
    const results = root.querySelector('#manual-results');
    let timer = null;
    manual.q.addEventListener('input', () => {
      clearTimeout(timer);
      const q = manual.q.value.trim();
      if (q.length < 2) return mount(results, '');
      timer = setTimeout(async () => {
        const { members } = await api(`/api/staff/members?q=${encodeURIComponent(q)}`);
        mount(results, members.slice(0, 8).map((m) => html`
          <li class="list-item">
            <div><strong>${m.name}</strong><div class="meta">${m.memberId}${m.active ? '' : ' · inactive'}</div></div>
            <button class="btn btn-sm btn-primary" data-checkin="${m.id}">Check in</button>
          </li>`));
      }, 250);
    });
    manual.addEventListener('submit', (e) => {
      e.preventDefault();
      if (manual.q.value.trim()) checkIn({ code: manual.q.value.trim(), method: 'manual' });
    });
    results.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-checkin]');
      if (!btn) return;
      await checkIn({ userId: Number(btn.dataset.checkin) });
      manual.reset();
      mount(results, '');
    });
  }

  if (sessionId) showScanner();
  else showPicker();
}

// ---------- sessions ----------

async function sessionsList(root) {
  const params = new URLSearchParams(location.search);
  const to = params.get('to') || todayLondon();
  const fromDefault = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const from = params.get('from') || fromDefault;
  const { sessions } = await api(`/api/staff/sessions?from=${from}&to=${to}`);
  mount(root, html`
    ${head('Sessions', html`<a class="btn btn-sm btn-outline" href="/api/staff/attendance.csv?from=${from}&to=${to}">Export all (CSV)</a><a class="btn btn-sm btn-accent" href="/admin/scanner">New session</a>`)}
    <form class="form-row card" id="range" style="margin-bottom:20px;padding:16px;align-items:end">
      <label class="field"><span>From</span><input type="date" name="from" value="${from}"></label>
      <label class="field"><span>To</span><input type="date" name="to" value="${to}"></label>
      <button class="btn btn-primary" type="submit">Show</button>
    </form>
    ${sessions.length ? html`
    <div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Session</th><th>Time</th><th>Present</th></tr></thead>
      <tbody>${sessions.map((s) => html`
        <tr class="clickable" data-href="/admin/sessions/${s.id}">
          <td>${formatDate(s.date)}</td><td><a href="/admin/sessions/${s.id}">${s.title}</a></td>
          <td>${formatTime(s.start_time)}</td><td><span class="pill">${s.count}</span></td>
        </tr>`)}</tbody>
    </table></div>` : html`<div class="empty">No sessions in this date range.</div>`}`);
  root.querySelector('#range').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    navigate(`/admin/sessions?from=${f.from}&to=${f.to}`);
  });
  root.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', (e) => {
    if (!e.target.closest('a')) navigate(tr.dataset.href);
  }));
}

// On a class's page: who paid, and who's checked in without paying (with cash / card buttons).
async function sessionPayments(box, session, attendees) {
  const { payments } = await api(`/api/staff/payments?date=${session.date}`);
  const unpaid = attendees.filter((a) => !payPaid(payments.find((p) => p.userId === a.id)));
  mount(box, html`
    <div class="admin-head" style="margin-bottom:8px"><h3 style="margin:0">Payments</h3><a class="btn btn-sm btn-ghost" href="/admin/payments?date=${session.date}">All payments →</a></div>
    ${paySummary(payments)}
    ${unpaid.length ? html`
      <h4 style="margin:0 0 6px">Checked in, not paid (${unpaid.length})</h4>
      <ul class="pay-list">${unpaid.map((a) => html`<li><span><b>${a.name}</b><small>${a.memberId}</small></span>${paymentLine(null, a.id, session.date)}</li>`)}</ul>` : ''}
    <h4 style="margin:14px 0 6px">Paid (${payments.filter(payPaid).length})</h4>
    <div id="session-pay-rows">${payRows(payments)}</div>`);
  const reload = () => sessionPayments(box, session, attendees);
  wireDoorPay(box, reload);
  wirePayRows(box.querySelector('#session-pay-rows'), reload);
}

async function sessionDetail(root, id) {
  const { session, attendees } = await api(`/api/staff/sessions/${id}`);
  mount(root, html`
    ${head(session.title, html`
      <a class="btn btn-sm btn-accent" href="/admin/scanner?session=${session.id}">📷 Scan into this session</a>
      <a class="btn btn-sm btn-primary" href="/admin/debriefs/new?session=${session.id}">📝 Debrief</a>
      <a class="btn btn-sm btn-outline" href="/api/staff/sessions/${session.id}/export.csv">Export CSV</a>`)}
    <p class="muted" style="margin-top:-12px">${formatDate(session.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${session.start_time ? ` · ${formatTime(session.start_time)}` : ''}${session.end_time ? ` to ${formatTime(session.end_time)}` : ''}</p>
    <div class="grid grid-2" style="align-items:start">
      <div class="card">
        <h3>Present (${attendees.length})</h3>
        ${attendees.length ? html`<ul class="list">${attendees.map((a) => html`
          <li class="list-item">
            <div><a href="/admin/members/${a.id}"><strong>${a.name}</strong></a><div class="meta">${a.memberId} · ${formatDateTime(a.scannedAt)} · ${a.method}${a.scannedBy ? ` by ${a.scannedBy}` : ''}</div>${under16Line(a)}</div>
            <button class="icon-btn danger" data-remove="${a.id}" aria-label="Remove">✕</button>
          </li>`)}</ul>` : html`<p class="muted">No one has been checked in yet.</p>`}
      </div>
      <div class="card" id="session-pay">
        <h3>Payments</h3>
        <p class="muted small">Loading…</p>
      </div>
      <div class="card">
        <h3>Edit session</h3>
        <form class="form" id="edit-session">
          <label class="field"><span>Name</span><input name="title" value="${session.title}" required></label>
          <div class="form-row">
            <label class="field"><span>Date</span><input type="date" name="date" value="${session.date}" required></label>
            <label class="field"><span>Start</span><input type="time" name="start_time" value="${session.start_time}"></label>
            <label class="field"><span>End</span><input type="time" name="end_time" value="${session.end_time}"></label>
          </div>
          <div class="form-error"></div>
          <div class="btn-row">
            <button class="btn btn-primary" type="submit">Save</button>
            ${isAdmin() ? html`<button class="btn btn-danger" type="button" id="delete-session">Delete session</button>` : ''}
          </div>
        </form>
      </div>
    </div>`);
  sessionPayments(root.querySelector('#session-pay'), session, attendees);
  wireApprove(root, () => sessionDetail(root, id));
  root.querySelector('.grid').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    if (!(await confirmDialog('Remove this person from the session?', { confirmLabel: 'Remove', danger: true }))) return;
    await api(`/api/staff/sessions/${session.id}/attendance/${btn.dataset.remove}`, { method: 'DELETE' });
    sessionDetail(root, id);
  });
  const form = root.querySelector('#edit-session');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(`/api/staff/sessions/${session.id}`, { method: 'PATCH', body: formData(form) });
      toast('Session saved', 'success');
      sessionDetail(root, id);
    } catch (err) {
      formError(form, err.message);
    }
  });
  root.querySelector('#delete-session')?.addEventListener('click', async () => {
    if (!(await confirmDialog('Delete this session and all of its attendance records?', { confirmLabel: 'Delete', danger: true }))) return;
    await api(`/api/staff/sessions/${session.id}`, { method: 'DELETE' });
    toast('Session deleted');
    navigate('/admin/sessions');
  });
}

// ---------- payments ----------

// An online payment only "says paid" until an admin finds it in Monzo; only received money counts.
const PAY_LABELS = { claimed: 'Says paid online', received: 'Received ✓', not_received: 'Not received' };
const payPaid = (p) => p && p.status !== 'not_received' && p.status !== 'started';
const payText = (p) => (p.method === 'online' ? PAY_LABELS[p.status] : p.method === 'cash' ? 'Paid cash' : 'Paid card');
const classDay = (iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });

// Under 16: the parent or guardian stays on site, and their number is to hand. An
// account the member made themselves needs a teacher to approve it.
function under16Line(m) {
  if (!m?.under16) return '';
  const tel = m.guardianPhone ? html` · <a href="tel:${m.guardianPhone.replace(/[^\d+]/g, '')}">${m.guardianPhone}</a>` : '';
  return html`<div class="u16-line"><span class="pay-badge wait">Under 16 · parent or guardian stays on site</span>
    <span class="small">Emergency contact: ${m.guardianName || 'not given'}${tel}</span>
    ${m.needsApproval ? html`<span class="u16-approve"><span class="small">New account: check the parent is here and these details are right.</span><button type="button" class="btn btn-sm btn-accent" data-approve="${m.id}">Approve account</button></span>` : ''}</div>`;
}

function wireApprove(box, after) {
  box.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await api(`/api/staff/members/${b.dataset.approve}/approve`, { method: 'POST', body: {} });
      toast('Account approved. Their pass is now switched on.', 'success');
      after?.();
    } catch (err) {
      toast(err.message, 'error');
    }
  }));
}

// Under a scan: whether they've paid for this class, or buttons to record cash or card.
function paymentLine(p, userId, date) {
  if (p?.status === 'claimed') return html`<div style="margin-top:8px"><span class="pay-badge wait">Says paid online for tonight · not yet checked</span></div>`;
  if (payPaid(p)) return html`<div style="margin-top:8px"><span class="pay-badge">✓ ${payText(p)}${p.method === 'online' ? ' for tonight' : ''}</span></div>`;
  return html`<div style="margin-top:8px"><span class="pay-badge bad">${p?.status === 'not_received' ? 'Online payment not received · ' : ''}Pay at the door</span>
    <span class="pay-acts" style="margin-top:6px;display:flex;justify-content:flex-start"><button type="button" data-door="cash" data-user="${userId}" data-date="${date}">Paid cash</button><button type="button" data-door="card" data-user="${userId}" data-date="${date}">Paid card</button></span></div>`;
}

function wireDoorPay(box, after) {
  box.querySelectorAll('[data-door]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await api('/api/staff/payments', { method: 'POST', body: { userId: Number(b.dataset.user), date: b.dataset.date, method: b.dataset.door } });
      toast(`Recorded: paid ${b.dataset.door}`, 'success');
      after?.();
    } catch (err) {
      toast(err.message, 'error');
    }
  }));
}

function paySummary(list) {
  const says = list.filter((p) => p.status === 'claimed');
  const received = list.filter((p) => p.method === 'online' && p.status === 'received');
  const door = list.filter((p) => p.method !== 'online');
  const notRec = list.filter((p) => p.status === 'not_received');
  const gbp = (rows) => (rows.reduce((a, p) => a + (p.amountPence || 0), 0) / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
  return html`<div class="pay-sum">
    <div><b>${says.length}</b>Say they paid online, not yet checked</div>
    <div><b>${received.length}</b>Received in Monzo</div>
    <div><b>${door.length}</b>Cash or card at the door</div>
    <div><b>${gbp([...received, ...door])}</b>Received in total${notRec.length ? ` · ${notRec.length} not received` : ''}</div>
  </div>`;
}

function payRows(list) {
  if (!list.length) return html`<p class="muted" style="margin:0">Nobody has paid for this class yet.</p>`;
  return html`<ul class="pay-list">${list.map((p) => html`
    <li>
      <span><b>${p.name}</b><small>${p.method === 'online' ? p.reference : `${p.method === 'cash' ? 'Cash' : 'Card'} at the door`} · ${p.attended ? 'checked in' : 'not checked in'}${p.checkedBy ? ` · ${p.method === 'online' ? 'checked' : 'recorded'} by ${p.checkedBy}` : ''}</small></span>
      ${p.method === 'online' && isAdmin() ? html`
        <span class="pay-acts" role="group" aria-label="Found in Monzo?">
          <button type="button" data-pay="${p.id}" data-status="received" aria-pressed="${String(p.status === 'received')}">Received</button>
          <button type="button" class="no" data-pay="${p.id}" data-status="not_received" aria-pressed="${String(p.status === 'not_received')}">Not received</button>
          <button type="button" data-remove="${p.id}" aria-label="Remove ${p.name}'s payment record">Remove</button>
        </span>`
      : p.method === 'online' ? html`<span class="pay-badge ${p.status === 'received' ? '' : p.status === 'claimed' ? 'wait' : 'bad'}">${payText(p)}</span>`
      : html`<span class="pay-acts"><span class="pay-badge">${payText(p)}</span><button type="button" data-undo="${p.id}" aria-label="Undo ${p.name}'s payment">Undo</button></span>`}
    </li>`)}</ul>`;
}

function wirePayRows(box, reload) {
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pay], [data-undo], [data-remove]');
    if (!b) return;
    try {
      if (b.dataset.remove) {
        if (!(await confirmDialog('Remove this payment record completely? Use this for test or mistaken claims.', { confirmLabel: 'Remove', danger: true }))) return;
        await api(`/api/staff/payments/${b.dataset.remove}`, { method: 'DELETE' });
      } else if (b.dataset.undo) {
        if (!(await confirmDialog('Undo this door payment?', { confirmLabel: 'Undo', danger: true }))) return;
        await api(`/api/staff/payments/${b.dataset.undo}`, { method: 'DELETE' });
      } else {
        // Pressing the chosen button again takes the check back off.
        const status = b.getAttribute('aria-pressed') === 'true' ? 'claimed' : b.dataset.status;
        await api(`/api/staff/payments/${b.dataset.pay}`, { method: 'PATCH', body: { status } });
      }
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function paymentsPage(root, date = new URLSearchParams(location.search).get('date')) {
  const v = await api(`/api/staff/payments${date ? `?date=${date}` : ''}`);
  const day = date || (v.dates.includes(todayLondon()) ? todayLondon() : v.dates[0] || v.date);
  const data = day === v.date ? v : await api(`/api/staff/payments?date=${day}`);
  const options = [...new Set([...data.dates, day])].sort();
  mount(root, html`
    ${head('Payments')}
    <p class="muted" style="margin-top:-12px">Who has paid for each class. When a member says they've paid online it shows as "Says paid"${data.payOnline.enabled ? '' : ' (online payment is switched off in Admin → Pricing)'}. ${isAdmin() ? 'Check Monzo and mark each one Received or Not received; only received money counts.' : 'An admin checks these in Monzo; only received money counts.'}</p>
    <div class="card" style="margin-bottom:16px">
      <label class="field" style="max-width:340px"><span>Class date</span>
        <select id="pay-day">${options.map((d) => html`<option value="${d}" ${raw(d === day ? 'selected' : '')}>${classDay(d)}</option>`)}</select></label>
      <label class="field" style="max-width:340px;margin-top:8px"><span>Or another date</span><input type="date" id="pay-other" value="${day}"></label>
    </div>
    ${paySummary(data.payments)}
    <div class="card" id="pay-rows">
      <h3 style="margin-top:0">${classDay(day)}</h3>
      ${payRows(data.payments)}
    </div>`);
  const go = (d) => {
    history.replaceState(null, '', `/admin/payments?date=${d}`);
    paymentsPage(root, d);
  };
  root.querySelector('#pay-day').addEventListener('change', (e) => go(e.target.value));
  root.querySelector('#pay-other').addEventListener('change', (e) => e.target.value && go(e.target.value));
  wirePayRows(root.querySelector('#pay-rows'), () => paymentsPage(root, day));
}

// ---------- class debriefs ----------

const money = (pence) => (pence === null || pence === undefined ? '-' : (pence / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' }));
const canEditDebrief = (d) => isAdmin() || d.submittedBy === state.user.id;

async function debriefsList(root) {
  const params = new URLSearchParams(location.search);
  const to = params.get('to') || todayLondon();
  const from = params.get('from') || new Date(Date.now() - 180 * 86400_000).toISOString().slice(0, 10);
  const { debriefs } = await api(`/api/staff/debriefs?from=${from}&to=${to}`);
  const latest = debriefs.find((d) => d.pouchBalancePence !== null);
  mount(root, html`
    ${head('Class debriefs', html`
      <a class="btn btn-sm btn-outline" href="/api/staff/debriefs.csv?from=${from}&to=${to}">Export CSV</a>
      <a class="btn btn-sm btn-accent" href="/admin/debriefs/new">+ New debrief</a>`)}
    <div class="stat-grid" style="margin-bottom:20px">
      <div class="stat"><div class="stat-value">${debriefs.length}</div><div class="stat-label">Debriefs in range</div></div>
      <div class="stat"><div class="stat-value" style="font-size:1.5rem">${latest ? money(latest.pouchBalancePence) : '-'}</div><div class="stat-label">Latest pouch balance${latest ? ` (${formatDate(latest.classDate, { day: 'numeric', month: 'short' })})` : ''}</div></div>
      <div class="stat"><div class="stat-value">${debriefs.length ? Math.round(debriefs.reduce((n, d) => n + d.attendeeCount, 0) / debriefs.length) : '-'}</div><div class="stat-label">Average attendees</div></div>
    </div>
    <form class="form-row card" id="range" style="margin-bottom:20px;padding:16px;align-items:end">
      <label class="field"><span>From</span><input type="date" name="from" value="${from}"></label>
      <label class="field"><span>To</span><input type="date" name="to" value="${to}"></label>
      <button class="btn btn-primary" type="submit">Show</button>
    </form>
    ${debriefs.length ? html`
    <div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Class</th><th>Ran by</th><th>Attendees</th><th>Pouch balance</th><th>Feedback</th></tr></thead>
      <tbody>${debriefs.map((d) => html`
        <tr class="clickable" data-href="/admin/debriefs/${d.id}">
          <td><a href="/admin/debriefs/${d.id}">${formatDate(d.classDate)}</a></td>
          <td>${d.classTitle || '-'}</td>
          <td>${d.ranBy}</td>
          <td>${d.attendeeCount}</td>
          <td>${money(d.pouchBalancePence)}</td>
          <td class="cell-clip">${d.feedback || '-'}</td>
        </tr>`)}</tbody>
    </table></div>` : html`<div class="empty">No debriefs in this date range yet. After a class, open the QR scanner and tap <strong>Finish class &amp; write debrief</strong>.</div>`}`);
  root.querySelector('#range').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    navigate(`/admin/debriefs?from=${f.from}&to=${f.to}`);
  });
  root.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', (e) => {
    if (!e.target.closest('a')) navigate(tr.dataset.href);
  }));
}

async function debriefForm(root, { id = null } = {}) {
  const sessionId = Number(new URLSearchParams(location.search).get('session')) || null;
  const [{ teachers }, prefill, current] = await Promise.all([
    api('/api/staff/teachers'),
    api(`/api/staff/debriefs/prefill${sessionId ? `?session=${sessionId}` : ''}`),
    id ? api(`/api/staff/debriefs/${id}`).then((r) => r.debrief) : Promise.resolve(null),
  ]);
  // A debrief already exists for this class: open it instead of starting a second one.
  if (!id && prefill.existing) return navigate(`/admin/debriefs/${prefill.existing.id}/edit`, { replace: true });
  if (current && !canEditDebrief(current)) return navigate(`/admin/debriefs/${current.id}`, { replace: true });

  const session = prefill.session;
  const ranBy = current ? current.ranBy.split(',').map((n) => n.trim()).filter(Boolean) : [state.user.name];
  const teacherNames = teachers.map((t) => t.name);
  const otherNames = ranBy.filter((n) => !teacherNames.includes(n)).join(', ');
  const values = {
    classTitle: current?.classTitle ?? session?.title ?? '',
    classDate: current?.classDate ?? session?.date ?? prefill.today,
    attendeeCount: current?.attendeeCount ?? prefill.scannedCount ?? '',
    pouchBalance: current && current.pouchBalancePence !== null ? (current.pouchBalancePence / 100).toFixed(2) : '',
    feedback: current?.feedback ?? '',
  };

  mount(root, html`
    ${head(current ? 'Edit class debrief' : 'Class debrief', html`<a class="btn btn-sm btn-ghost" href="/admin/debriefs">All debriefs</a>`)}
    <form class="card form" id="debrief-form" novalidate>
      ${session ? html`<div class="notice" style="margin:0">For <strong>${session.title}</strong>, ${formatDate(session.date, { weekday: 'long', day: 'numeric', month: 'long' })}${prefill.scannedCount !== null ? `. ${prefill.scannedCount} ${prefill.scannedCount === 1 ? 'person was' : 'people were'} scanned in.` : ''}</div>` : ''}
      <div class="form-row">
        <label class="field"><span>Class</span><input name="classTitle" value="${values.classTitle}" placeholder="e.g. Adults Bhangra"></label>
        <label class="field"><span>Date of class</span><input name="classDate" type="date" value="${values.classDate}" required></label>
      </div>
      <fieldset class="field" style="border:0;padding:0;margin:0">
        <legend class="field-label" style="margin-bottom:8px">Who ran the class</legend>
        <div class="check-grid">
          ${teachers.map((t) => html`<label class="checkbox"><input type="checkbox" name="ranBy" value="${t.name}" ${raw(ranBy.includes(t.name) ? 'checked' : '')}> ${t.name}</label>`)}
        </div>
        <input name="ranByOther" value="${otherNames}" placeholder="Anyone else (separate names with commas)" aria-label="Anyone else who ran the class" style="margin-top:10px">
      </fieldset>
      <div class="form-row">
        <label class="field"><span>Number of attendees</span><input name="attendeeCount" type="number" inputmode="numeric" min="0" step="1" value="${values.attendeeCount}" required>
          ${prefill.scannedCount !== null ? html`<small>${prefill.scannedCount} scanned in. Change this if some people weren't scanned.</small>` : ''}</label>
        <label class="field"><span>LAB pouch balance (£)</span><input name="pouchBalance" inputmode="decimal" value="${values.pouchBalance}" placeholder="e.g. 125.50" required>
          <small>Count the cash in the pouch at the end of class.${prefill.lastBalance && !current ? ` Last recorded: ${money(prefill.lastBalance.pence)} on ${formatDate(prefill.lastBalance.date, { day: 'numeric', month: 'short' })}.` : ''}</small></label>
      </div>
      <label class="field"><span>Class feedback</span><textarea name="feedback" rows="6" placeholder="How did the class go? What did you teach? Any issues, injuries, new starters or things to follow up?">${values.feedback}</textarea></label>
      <div class="form-error" role="alert"></div>
      <div class="btn-row">
        <button class="btn btn-primary" type="submit">${current ? 'Save changes' : 'Submit debrief'}</button>
        <a class="btn btn-ghost" href="${current ? `/admin/debriefs/${current.id}` : '/admin/debriefs'}">Cancel</a>
      </div>
    </form>`);

  const form = root.querySelector('#debrief-form');
  let dirty = false;
  form.addEventListener('input', () => { dirty = true; });
  setLeaveGuard((silent) => !dirty || (!silent && confirm('Your debrief has not been saved. Leave anyway?')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError(form, '');
    const fd = new FormData(form);
    const names = [...fd.getAll('ranBy'), ...String(fd.get('ranByOther') || '').split(',')].map((n) => n.trim()).filter(Boolean);
    const body = {
      sessionId: current ? undefined : session?.id,
      classTitle: fd.get('classTitle'),
      classDate: fd.get('classDate'),
      ranBy: names,
      attendeeCount: fd.get('attendeeCount') === '' ? NaN : Number(fd.get('attendeeCount')),
      pouchBalance: fd.get('pouchBalance'),
      feedback: fd.get('feedback'),
    };
    await withBusy(form.querySelector('[type=submit]'), async () => {
      try {
        const { debrief } = current
          ? await api(`/api/staff/debriefs/${current.id}`, { method: 'PATCH', body })
          : await api('/api/staff/debriefs', { method: 'POST', body });
        dirty = false;
        toast(current ? 'Debrief updated' : 'Thanks! Debrief saved.', 'success');
        navigate(`/admin/debriefs/${debrief.id}`);
      } catch (err) {
        formError(form, err.message);
        form.querySelector('.form-error').scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });
  });
}

async function debriefView(root, id) {
  const { debrief: d } = await api(`/api/staff/debriefs/${id}`);
  mount(root, html`
    ${head(`Debrief: ${formatDate(d.classDate, { day: 'numeric', month: 'short', year: 'numeric' })}`, html`
      <a class="btn btn-sm btn-ghost" href="/admin/debriefs">All debriefs</a>
      ${canEditDebrief(d) ? html`<a class="btn btn-sm btn-primary" href="/admin/debriefs/${d.id}/edit">Edit</a>` : ''}
      ${isAdmin() ? html`<button class="btn btn-sm btn-danger" id="delete-debrief">Delete</button>` : ''}`)}
    <div class="stat-grid">
      <div class="stat"><div class="stat-value">${d.attendeeCount}</div><div class="stat-label">Attendees</div></div>
      <div class="stat"><div class="stat-value" style="font-size:1.5rem">${money(d.pouchBalancePence)}</div><div class="stat-label">LAB pouch balance</div></div>
    </div>
    <div class="card" style="margin-top:20px">
      <dl class="detail-list">
        <dt>Class</dt><dd>${d.classTitle || '-'}${d.sessionId ? html` · <a href="/admin/sessions/${d.sessionId}">see attendance</a>` : ''}</dd>
        <dt>Date</dt><dd>${formatDate(d.classDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</dd>
        <dt>Ran by</dt><dd>${d.ranBy}</dd>
        <dt>Submitted by</dt><dd>${d.submittedByName || '-'} · ${formatDateTime(d.createdAt)}${d.updatedAt !== d.createdAt ? ` (edited ${formatDateTime(d.updatedAt)})` : ''}</dd>
      </dl>
      <h3 style="margin-top:20px">Class feedback</h3>
      ${d.feedback ? html`<p class="bio-box">${d.feedback}</p>` : html`<p class="muted">No feedback written.</p>`}
    </div>`);
  root.querySelector('#delete-debrief')?.addEventListener('click', async () => {
    if (!(await confirmDialog('Delete this class debrief?', { confirmLabel: 'Delete', danger: true }))) return;
    await api(`/api/staff/debriefs/${d.id}`, { method: 'DELETE' });
    toast('Debrief deleted');
    navigate('/admin/debriefs');
  });
}

// ---------- members ----------

function rolePill(m) {
  if (!m.active) return html`<span class="pill pill-inactive">Inactive</span>`;
  if (m.role === 'admin') return html`<span class="pill pill-admin">Admin</span>`;
  if (m.role === 'instructor') return html`<span class="pill pill-instructor">Teacher</span>`;
  return html`<span class="pill">Member</span>`;
}

async function membersList(root) {
  const params = new URLSearchParams(location.search);
  const q = params.get('q') || '';
  const approve = params.get('approve') === '1';
  const all = (await api(`/api/staff/members?q=${encodeURIComponent(q)}`)).members;
  const members = approve ? all.filter((m) => m.needsApproval) : all;
  mount(root, html`
    ${head('Members', html`<button class="btn btn-accent" id="add-member">+ Add member</button>`)}
    <form id="member-search" style="margin-bottom:16px">
      <input type="search" name="q" value="${q}" placeholder="Search by name, email, phone or member ID" aria-label="Search members">
    </form>
    <p class="muted small">${approve ? html`Under-16 accounts waiting for approval · <a href="/admin/members">Show everyone</a>` : `${members.length} ${members.length === 1 ? 'person' : 'people'}`}</p>
    ${members.length ? html`
    <div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Member ID</th><th>Role</th><th>Classes</th><th>Last class</th></tr></thead>
      <tbody>${members.map((m) => html`
        <tr class="clickable" data-href="/admin/members/${m.id}">
          <td><a href="/admin/members/${m.id}"><strong>${m.name}</strong></a><div class="muted small">${m.email}</div></td>
          <td><code>${m.memberId}</code></td>
          <td>${rolePill(m)}${m.under16 ? html` <span class="pill pill-u16">Under 16${m.needsApproval ? ' · to approve' : ''}</span>` : ''}</td>
          <td>${m.attended}</td>
          <td>${m.lastAttended ? formatDate(m.lastAttended, { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</td>
        </tr>`)}</tbody>
    </table></div>` : html`<div class="empty">No members found.</div>`}`);

  const search = root.querySelector('#member-search');
  let timer;
  search.q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      history.replaceState({}, '', `/admin/members${search.q.value ? `?q=${encodeURIComponent(search.q.value)}` : ''}`);
      const pos = search.q.selectionStart;
      await membersList(root);
      const input = root.querySelector('#member-search input');
      input.focus();
      input.setSelectionRange(pos, pos);
    }, 300);
  });
  search.addEventListener('submit', (e) => e.preventDefault());
  root.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', (e) => {
    if (!e.target.closest('a')) navigate(tr.dataset.href);
  }));
  root.querySelector('#add-member').addEventListener('click', () => addMemberDialog());
}

function addMemberDialog() {
  const form = el('form', { class: 'form' });
  form.innerHTML = html`
    <label class="field"><span>Full name</span><input name="name" required></label>
    <label class="field"><span>Email (used to log in)</span><input name="email" type="email"></label>
    <label class="field"><span>Phone</span><input name="phone" type="tel"></label>
    ${isAdmin() ? html`<label class="field"><span>Role</span><select name="role">
      <option value="member">Member</option><option value="instructor">Teacher (can scan attendance and write class debriefs)</option><option value="admin">Admin (full access)</option>
    </select></label>` : ''}
    <label class="field"><span>Password (optional)</span><input name="password" type="text" autocomplete="off"><small>Leave blank to generate one.</small></label>
    <label class="checkbox"><input type="checkbox" name="under16"> Under 16</label>
    <div class="guardian-fields" hidden>
      <label class="field"><span>Parent or guardian's name</span><input name="guardianName"></label>
      <label class="field"><span>Parent or guardian's email</span><input name="guardianEmail" type="email"></label>
      <label class="field"><span>Parent or guardian's phone</span><input name="guardianPhone" type="tel"></label>
      <small class="muted">The parent or guardian will be asked to give consent when the account is first used.</small>
    </div>
    <label class="field"><span>Bio (visible to the member)</span><textarea name="bio" rows="2" maxlength="1000"></textarea></label>
    <label class="field"><span>Notes (staff only)</span><textarea name="notes" rows="2"></textarea></label>
    <div class="form-error"></div>
    <button class="btn btn-primary" type="submit">Create member</button>`.s;
  const { close } = openDialog('Add member', form);
  form.under16.addEventListener('change', () => { form.querySelector('.guardian-fields').hidden = !form.under16.checked; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await withBusy(form.querySelector('[type=submit]'), async () => {
      try {
        const body = { ...formData(form), under16: form.under16.checked };
        const { member, password } = await api('/api/staff/members', { method: 'POST', body });
        close();
        credentialsDialog(member, password, 'Member created');
      } catch (err) {
        formError(form, err.message);
      }
    });
  });
}

function credentialsDialog(member, password, title) {
  const body = el('div');
  body.innerHTML = html`
    <div class="member-card">
      <h2>${member.name}</h2>
      <div class="mid">${member.memberId}</div>
      <div class="qr-box"><img src="/api/staff/members/${member.id}/qr.svg" alt="QR code"></div>
    </div>
    <div class="notice" style="margin-top:16px">
      <strong>Login details. Share these with the member now:</strong><br>
      Login: ${member.email || member.memberId}<br>
      Password: <code>${password}</code><br>
      <span class="small muted">They can change the password from their account page.</span>
    </div>
    <div class="btn-row"><a class="btn btn-primary" href="/admin/members/${member.id}">Open member</a></div>`.s;
  openDialog(title, body, { onClose: () => location.pathname === '/admin/members' && navigate('/admin/members', { replace: true }) });
}

async function memberDetail(root, id) {
  const { member, stats, attendance } = await api(`/api/staff/members/${id}`);
  mount(root, html`
    ${head(member.name, html`<a class="btn btn-sm btn-ghost" href="/admin/members">← All members</a>`)}
    <div class="account-grid">
      <div>
        <div class="member-card">
          <h2>${member.name}</h2>
          <div class="mid">${member.memberId}</div>
          <div class="qr-box"><img src="/api/staff/members/${member.id}/qr.svg?v=${member.memberId}" alt="QR code"></div>
          <div style="position:relative;z-index:1">${rolePill(member)}</div>
        </div>
        <div class="btn-row no-print" style="margin-top:12px;justify-content:center">
          <button class="btn btn-sm btn-outline" id="print">Print card</button>
        </div>
      </div>
      <div class="no-print">
        ${member.under16 ? html`<div class="card" style="margin-bottom:20px">${under16Line(member)}</div>` : ''}
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
          <h3>Privacy &amp; consent</h3>
          ${member.privacyVersion
            ? html`<p class="small">Accepted Privacy Policy version <strong>${member.privacyVersion}</strong> on ${formatDateTime(member.privacyAcceptedAt, { day: 'numeric', month: 'long', year: 'numeric' })}.${member.privacyRequired ? ' A newer version is waiting to be accepted.' : ''}</p>`
            : html`<p class="small">Has not accepted the Privacy Policy yet. They will be asked at their next login.</p>`}
          ${member.under16 ? html`<p class="small"><span class="pill pill-u16">Under 16</span> Parent or guardian: <strong>${member.guardianName || 'not given'}</strong>${member.guardianEmail ? html` · <a href="mailto:${member.guardianEmail}">${member.guardianEmail}</a>` : ''}${member.guardianPhone ? html` · <a href="tel:${member.guardianPhone}">${member.guardianPhone}</a>` : ''}</p>` : ''}
        </div>
        ${!isAdmin() ? html`<div class="card" style="margin-top:20px"><h3>Bio</h3>${member.bio ? html`<p class="bio-box">${member.bio}</p>` : html`<p class="muted">No bio yet.</p>`}</div>` : ''}
        ${isAdmin() ? html`
        <div class="card" style="margin-top:20px">
          <h3>Details</h3>
          <form class="form" id="member-form">
            <div class="form-row">
              <label class="field"><span>Name</span><input name="name" value="${member.name}" required></label>
              <label class="field"><span>Phone</span><input name="phone" value="${member.phone}"></label>
            </div>
            <label class="field"><span>Email</span><input name="email" type="email" value="${member.email}"></label>
            <div class="form-row">
              <label class="field"><span>Role</span><select name="role">
                ${['member', 'instructor', 'admin'].map((r) => html`<option value="${r}" ${raw(member.role === r ? 'selected' : '')}>${ROLE_LABELS[r]}</option>`)}
              </select></label>
              <label class="field"><span>Status</span><select name="active">
                <option value="1" ${raw(member.active ? 'selected' : '')}>Active</option>
                <option value="0" ${raw(!member.active ? 'selected' : '')}>Inactive</option>
              </select></label>
            </div>
            <label class="checkbox" id="timeline-perm" ${raw(member.role === 'instructor' ? '' : 'hidden')}><input type="checkbox" name="canEditTimeline" ${raw(member.canEditTimeline ? 'checked' : '')}> Can edit the Our journey page (nothing else on the website)</label>
            <label class="checkbox"><input type="checkbox" name="under16" ${raw(member.under16 ? 'checked' : '')}> Under 16</label>
            <div class="form-row">
              <label class="field"><span>Parent or guardian's name</span><input name="guardianName" value="${member.guardianName}"></label>
              <label class="field"><span>Parent or guardian's email</span><input name="guardianEmail" type="email" value="${member.guardianEmail}"></label>
              <label class="field"><span>Parent or guardian's phone</span><input name="guardianPhone" value="${member.guardianPhone}"></label>
            </div>
            <label class="field"><span>Bio (written by the member)</span><textarea name="bio" rows="3" maxlength="1000">${member.bio}</textarea></label>
            <label class="field"><span>Notes (staff only)</span><textarea name="notes" rows="3">${member.notes}</textarea></label>
            <div class="form-error"></div>
            <div><button class="btn btn-primary" type="submit">Save changes</button></div>
          </form>
        </div>
        <div class="card" style="margin-top:20px">
          <h3>Account actions</h3>
          <div class="btn-row">
            <button class="btn btn-sm btn-outline" id="reset-pw">Reset password</button>
            <button class="btn btn-sm btn-outline" id="new-id">Issue new member ID</button>
            ${member.role !== 'member' ? html`<button class="btn btn-sm btn-outline" id="reset-2fa">Reset two-step login</button>` : ''}
            <button class="btn btn-sm btn-danger" id="delete-member">Delete member</button>
          </div>
          <p class="small muted" style="margin-top:10px">Issuing a new ID makes the old QR code stop working (e.g. if a card is lost). Deleting removes all of their attendance history.</p>
        </div>` : member.notes ? html`<div class="notice" style="margin-top:20px"><strong>Notes:</strong> ${member.notes}</div>` : ''}
        <div class="card" style="margin-top:20px">
          <h3>Attendance (${attendance.length})</h3>
          ${attendance.length ? html`<ul class="list">${attendance.map((a) => html`
            <li class="list-item"><div><a href="/admin/sessions/${a.sessionId}">${a.title}</a><div class="meta">${formatDate(a.date)}${a.startTime ? ` · ${formatTime(a.startTime)}` : ''} · ${a.method}</div></div></li>`)}</ul>`
            : html`<p class="muted">No classes attended yet.</p>`}
        </div>
      </div>
    </div>`);

  root.querySelector('#print').addEventListener('click', () => window.print());
  wireApprove(root, () => memberDetail(root, id));
  if (!isAdmin()) return;
  const form = root.querySelector('#member-form');
  // The Our journey permission is only for teachers (admins can edit everything anyway).
  form.role.addEventListener('change', () => { root.querySelector('#timeline-perm').hidden = form.role.value !== 'instructor'; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = formData(form);
    body.active = body.active === '1';
    body.under16 = form.under16.checked;
    body.canEditTimeline = form.canEditTimeline.checked;
    try {
      await api(`/api/admin/members/${member.id}`, { method: 'PATCH', body });
      toast('Member saved', 'success');
      memberDetail(root, id);
    } catch (err) {
      formError(form, err.message);
    }
  });
  root.querySelector('#reset-pw').addEventListener('click', async () => {
    if (!(await confirmDialog(`Generate a new password for ${member.name}? They will be logged out everywhere.`, { confirmLabel: 'Reset password' }))) return;
    const { password } = await api(`/api/admin/members/${member.id}/reset-password`, { method: 'POST', body: {} });
    credentialsDialog(member, password, 'Password reset');
  });
  root.querySelector('#reset-2fa')?.addEventListener('click', async () => {
    if (!(await confirmDialog(`Reset ${member.name}'s two-step login? Use this if they've lost their phone and backup codes. They'll be logged out and set it up again next time they log in.`, { confirmLabel: 'Reset' }))) return;
    await api(`/api/admin/members/${member.id}/reset-two-step`, { method: 'POST', body: {} });
    toast('Two-step login reset', 'success');
  });
  root.querySelector('#new-id').addEventListener('click', async () => {
    if (!(await confirmDialog('Issue a new member ID? The old QR code will stop working.', { confirmLabel: 'Issue new ID' }))) return;
    await api(`/api/admin/members/${member.id}/new-member-id`, { method: 'POST', body: {} });
    toast('New member ID issued', 'success');
    memberDetail(root, id);
  });
  root.querySelector('#delete-member').addEventListener('click', async () => {
    if (!(await confirmDialog(`Permanently delete ${member.name} and all their attendance records?`, { confirmLabel: 'Delete', danger: true }))) return;
    try {
      await api(`/api/admin/members/${member.id}`, { method: 'DELETE' });
      toast('Member deleted');
      navigate('/admin/members');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ---------- content editor ----------

const RICH_HINT = 'Leave a blank line for a new paragraph. Use **bold**, *italic* and [link text](https://example.com).';

const BUTTON_FIELDS = [
  { key: 'label', label: 'Button text' },
  { key: 'link', label: 'Link', hint: 'A page like /timetable, or a full web address (https://…)' },
  { key: 'style', label: 'Colour', type: 'select', options: ['Gold', 'Navy', 'White', 'Outline'] },
];
// Performances and Workshops share one layout, so they share one editor.
function serviceSchema(title, view, noun) {
  return {
    title,
    view,
    fields: [
      h('Top of the page'),
      { key: 'title', label: 'Page title' },
      { key: 'tagline', label: 'Line under the title' },
      { key: 'heroImage', label: 'Big photo at the top', type: 'image', hint: 'A wide, landscape photo works best.' },
      h('Introduction'),
      { key: 'introTitle', label: 'Heading' },
      { key: 'intro', label: 'Text', type: 'rich' },
      { key: 'listTitle', label: 'List heading', hint: 'e.g. "Perfect for"' },
      { key: 'items', label: 'List', type: 'strings', itemLabel: 'item' },
      h('Key facts'),
      { key: 'facts', label: 'Facts', type: 'list', itemLabel: 'fact', titleKey: 'label', hint: 'Up to three short facts, e.g. Length, Dancers, Outfits.', fields: [
        { key: 'label', label: 'Label' }, { key: 'value', label: 'Value' },
      ] },
      h('Highlight'),
      { key: 'featureTitle', label: 'Heading' },
      { key: 'featureSubtitle', label: 'Subheading' },
      { key: 'featureText', label: 'Text', type: 'textarea' },
      h('Enquiry button'),
      { key: 'buttonLabel', label: 'Button text' },
      { key: 'buttonLink', label: 'Button link', hint: 'The contact page, with the subject filled in: /contact?subject=…' },
      h('Photos'),
      { key: 'galleryTitle', label: 'Heading' },
      { key: 'gallery', label: 'Photos', type: 'list', itemLabel: 'photo', titleKey: 'caption', hint: `Photos from your ${noun}s. Each shows in the grid with its caption.`, fields: [
        { key: 'image', label: 'Photo', type: 'image' }, { key: 'caption', label: 'Caption (optional)' },
      ] },
    ],
  };
}

const buttonList = (key, label) => ({ key, label, type: 'list', itemLabel: 'button', titleKey: 'label', fields: BUTTON_FIELDS });
const singleButton = (key, label) => ({ key, label, type: 'object', fields: [
  { key: 'label', label: 'Button text', hint: 'Leave blank to hide the button.' },
  { key: 'link', label: 'Link' },
] });
const h = (text) => ({ type: 'heading', label: text });

const SCHEMAS = {
  site: {
    title: 'Site & branding',
    view: '/',
    fields: [
      h('Academy'),
      { key: 'name', label: 'Academy name' },
      { key: 'shortName', label: 'Short name' },
      { key: 'tagline', label: 'Tagline', type: 'textarea', hint: 'Shown in search engine results and link previews.' },
      h('Logo'),
      { key: 'logo', label: 'Logo', type: 'image' },
      h('Contact details'),
      { key: 'email', label: 'Email address', type: 'email' },
      { key: 'contacts', label: 'Phone numbers', type: 'list', itemLabel: 'person', titleKey: 'name', hint: 'The Call button lets visitors choose who to ring. The name shows next to the number.', fields: [
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone number', type: 'tel' },
      ] },
      { key: 'whatsapp', label: 'WhatsApp number', type: 'tel', hint: 'The "Message us on WhatsApp" buttons open a chat with this number. Leave blank to hide them.' },
      { key: 'address', label: 'Address', type: 'textarea' },
      { key: 'mapQuery', label: 'Map location', hint: 'Address or postcode to show on the Google map.' },
      { key: 'socials', label: 'Social media links', type: 'object', fields: [
        { key: 'instagram', label: 'Instagram URL', type: 'url' },
        { key: 'facebook', label: 'Facebook URL', type: 'url' },
        { key: 'tiktok', label: 'TikTok URL', type: 'url' },
        { key: 'youtube', label: 'YouTube URL', type: 'url' },
      ] },
      h('Header & footer'),
      { key: 'loginButtonLabel', label: 'Header login button text' },
      { key: 'accountButtonLabel', label: 'Header account button text (when logged in)' },
      { key: 'footerText', label: 'Footer text', type: 'textarea' },
      { key: 'footerExploreTitle', label: 'Footer links heading' },
      { key: 'footerContactTitle', label: 'Footer contact heading' },
      { key: 'copyrightText', label: 'Copyright line', hint: 'Leave blank for "© <year> <academy name>".' },
    ],
  },
  home: {
    title: 'Home page',
    view: '/',
    fields: [
      h('Announcement bar'),
      { key: 'announcement', label: 'Announcement bar (shown at the top of every page)', type: 'object', fields: [
        { key: 'enabled', label: 'Show the announcement bar', type: 'bool' },
        { key: 'text', label: 'Announcement text' },
      ] },
      h('Top of the page'),
      { key: 'heroTitle', label: 'Main heading', hint: 'The last word sits on the navy tile.' },
      { key: 'heroTagline', label: 'Punchline (under the heading)', hint: 'Put **stars** round a word to pick it out in gold, e.g. from the **pind** to the **people**.' },
      { key: 'heroSubtitle', label: 'Welcome text', type: 'textarea', hint: 'Put **stars** round words to make them bold.' },
      h('Picture wall'),
      { key: 'showInstagram', label: 'Show the latest Instagram photos in the picture wall', type: 'bool', hint: "When it's off, or before any posts load, the wall shows the academy's own artwork." },
      { key: 'instagramPostCount', label: 'Number of Instagram photos to use', type: 'number' },
      { key: 'tileWords', label: 'Words on the changing tile', type: 'strings', itemLabel: 'word or phrase', hint: 'Short phrases work best, e.g. "Kids & adults".' },
    ],
  },
  about: {
    title: 'About page',
    view: '/about',
    fields: [
      { key: 'title', label: 'Page title' },
      { key: 'intro', label: 'Introduction', type: 'textarea' },
      h('Our story'),
      { key: 'story', label: 'Story', type: 'rich' },
      { key: 'image', label: 'Image', type: 'image' },
      h('Values'),
      { key: 'valuesTitle', label: 'Heading' },
      { key: 'values', label: 'Values', type: 'list', itemLabel: 'value', titleKey: 'title', fields: [
        { key: 'title', label: 'Title' }, { key: 'text', label: 'Text', type: 'textarea' },
      ] },
      h('Team'),
      { key: 'teamTitle', label: 'Heading' },
      { key: 'founders', label: 'Team members', type: 'list', itemLabel: 'person', titleKey: 'name', fields: [
        { key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }, { key: 'bio', label: 'Bio', type: 'textarea' }, { key: 'image', label: 'Photo', type: 'image' },
      ] },
    ],
  },
  faq: {
    title: 'FAQs page',
    view: '/faq',
    fields: [
      { key: 'title', label: 'Page title' },
      { key: 'intro', label: 'Introduction', type: 'textarea' },
      { key: 'items', label: 'Questions', type: 'list', itemLabel: 'question', titleKey: 'question', hint: 'Shown in this order; the first one starts open. Use the ↑ ↓ arrows to reorder.', fields: [
        { key: 'question', label: 'Question' },
        { key: 'answer', label: 'Answer', type: 'rich' },
      ] },
      h('Bottom of the page'),
      { key: 'ctaTitle', label: 'Heading' },
      { key: 'ctaText', label: 'Text', type: 'textarea' },
    ],
  },
  performances: serviceSchema('Performances page', '/performances', 'event'),
  workshops: serviceSchema('Workshops page', '/workshops', 'workshop'),
  timeline: {
    title: 'Our journey',
    view: '/timeline',
    fields: [
      { key: 'title', label: 'Page title' },
      { key: 'intro', label: 'Introduction', type: 'textarea' },
      h('Milestones'),
      { key: 'milestones', label: 'Milestones', type: 'list', itemLabel: 'milestone', titleKey: 'title', hint: 'Oldest first. They appear down the page in this order; use the ↑ ↓ arrows to reorder.', fields: [
        { key: 'date', label: 'When', hint: 'Month and year, e.g. "June 2025"' },
        { key: 'title', label: 'Title' },
        { key: 'text', label: 'What happened', type: 'textarea' },
        { key: 'type', label: 'Type', type: 'select', options: ['The beginning', 'Classes', 'Workshop', 'Competition', 'Charity', 'Performance', 'The team', 'Other'], hint: 'Sets the colour of the tile.' },
        { key: 'image', label: 'Photo (optional)', type: 'image' },
      ] },
      h('End of the page'),
      { key: 'endTitle', label: 'Heading' },
      { key: 'endText', label: 'Text', type: 'textarea' },
      { key: 'endButton', label: 'Button', type: 'object', fields: [{ key: 'label', label: 'Button text' }, { key: 'link', label: 'Link' }] },
    ],
  },
  timetable: {
    title: 'Timetable',
    view: '/timetable',
    fields: [
      { key: 'title', label: 'Page title' },
      { key: 'intro', label: 'Introduction', type: 'textarea' },
      { key: 'classes', label: 'Classes', type: 'list', itemLabel: 'class', titleKey: 'name', hint: 'Classes on today\'s day show up in the QR scanner automatically.', fields: [
        { key: 'name', label: 'Class name' },
        { key: 'day', label: 'Day', type: 'select', options: DAYS },
        { key: 'start', label: 'Start time', type: 'time' },
        { key: 'end', label: 'End time', type: 'time' },
        { key: 'level', label: 'Level' },
        { key: 'ages', label: 'Ages / group' },
        { key: 'location', label: 'Location' },
        { key: 'notes', label: 'Notes' },
      ] },
      { key: 'emptyText', label: 'Text shown when there are no classes' },
      { key: 'notes', label: 'Notes under the timetable', type: 'rich' },
      h('Venue'),
      { key: 'venueTitle', label: 'Heading' },
      { key: 'venueText', label: 'Details', type: 'rich' },
      { key: 'showMap', label: 'Show a map (location set under Site & branding)', type: 'bool' },
      singleButton('venueButton', 'Button'),
    ],
  },
  pricing: {
    title: 'Pricing',
    view: '/pricing',
    fields: [
      { key: 'title', label: 'Page title' },
      { key: 'intro', label: 'Introduction', type: 'textarea' },
      { key: 'plans', label: 'Prices', type: 'list', itemLabel: 'price option', titleKey: 'name', fields: [
        { key: 'name', label: 'Name' }, { key: 'price', label: 'Price', hint: 'e.g. £7' }, { key: 'period', label: 'Per…', hint: 'e.g. per class' },
        { key: 'description', label: 'Description', type: 'textarea' }, { key: 'features', label: 'Bullet points', type: 'strings', itemLabel: 'bullet point' },
        { key: 'highlight', label: 'Highlight this option', type: 'bool' },
      ] },
      { key: 'highlightBadge', label: 'Badge text on the highlighted option' },
      { key: 'payLink', label: 'Online payment link (Monzo)', type: 'url', hint: 'Members choose a class date in their account and pay through this link. Leave blank to turn online payment off.' },
      { key: 'payAmount', label: 'Price of a class paid online', hint: 'e.g. £7' },
      { key: 'payment', label: 'How people can pay', hint: 'A short phrase shown with the price in the menu and the strip above the footer, e.g. "Cash or card".' },
      { key: 'notes', label: 'Notes', type: 'rich' },
      singleButton('ctaButton', 'Button under the prices'),
    ],
  },
  gallery: {
    title: 'Gallery',
    view: '/gallery',
    note: 'Instagram posts load automatically once Instagram is connected under Admin → Instagram.',
    fields: [
      { key: 'title', label: 'Page title' },
      { key: 'intro', label: 'Introduction', type: 'textarea' },
      { key: 'instagramUsername', label: 'Instagram username', hint: 'Used for the Follow button.' },
      { key: 'followButton', label: 'Follow button text' },
      { key: 'maxPosts', label: 'Number of Instagram posts to show', type: 'number' },
      { key: 'emptyText', label: 'Text shown when no posts are available' },
      h('Extra photos'),
      { key: 'extraTitle', label: 'Heading' },
      { key: 'extraImages', label: 'Photos (shown under the Instagram feed)', type: 'list', itemLabel: 'photo', titleKey: 'caption', fields: [
        { key: 'url', label: 'Image', type: 'image' }, { key: 'caption', label: 'Caption' },
      ] },
    ],
  },
  contact: {
    title: 'Contact page',
    view: '/contact',
    note: 'Address, phone numbers, email and social links are edited under Site & branding.',
    fields: [
      { key: 'title', label: 'Page title' },
      { key: 'intro', label: 'Introduction', type: 'textarea' },
      { key: 'detailsTitle', label: 'Contact details heading' },
      { key: 'showMap', label: 'Show a map', type: 'bool' },
      h('Contact form'),
      { key: 'formEnabled', label: 'Show the contact form (messages appear under Admin → Messages)', type: 'bool' },
      { key: 'formTitle', label: 'Form heading' },
      { key: 'formIntro', label: 'Text above the form', type: 'textarea' },
      { key: 'submitLabel', label: 'Send button text' },
      { key: 'successMessage', label: 'Message shown after sending' },
    ],
  },
  members: {
    title: 'Member pages',
    view: '/login',
    note: 'Wording on the member login, sign-up and account pages.',
    fields: [
      { key: 'allowRegistration', label: 'Let new members create their own account online', type: 'bool' },
      h('Login page'),
      { key: 'loginTitle', label: 'Heading' },
      { key: 'loginIntro', label: 'Introduction', type: 'textarea' },
      { key: 'forgotPasswordText', label: 'Forgotten password text', type: 'textarea' },
      h('Sign-up page'),
      { key: 'registerTitle', label: 'Heading' },
      { key: 'registerIntro', label: 'Introduction', type: 'textarea' },
      { key: 'bioPrompt', label: 'Hint shown in the bio box', type: 'textarea' },
      { key: 'welcomeMessage', label: 'Message shown after signing up' },
      { key: 'registrationClosedText', label: 'Text shown when sign-up is turned off', type: 'textarea' },
      h('Member account page'),
      { key: 'qrHint', label: 'Text under the QR code' },
      h('Privacy agreement'),
      { key: 'privacyCheckboxText', label: 'Privacy Policy checkbox text', type: 'textarea' },
      { key: 'guardianConsentText', label: 'Parent or guardian consent checkbox text (under 16s)', type: 'textarea' },
      { key: 'consentPageIntro', label: 'Text at the top of the "accept the policy" page', type: 'textarea' },
    ],
  },
  privacy: {
    title: 'Privacy policy',
    view: '/privacy',
    note: 'This is a starting draft written for UK data protection law (UK GDPR). Please check it matches how the academy really works, especially how long you keep information and photo consent, and consider having it reviewed by someone qualified. Changing the version asks every member and teacher to accept the policy again at their next login.',
    fields: [
      { key: 'title', label: 'Page title' },
      { key: 'version', label: 'Version', hint: 'Change this (e.g. to 2027-01) when you make changes people should agree to again.' },
      { key: 'lastUpdated', label: 'Last updated (shown on the page)' },
      { key: 'intro', label: 'Introduction', type: 'textarea' },
      { key: 'body', label: 'Policy', type: 'rich', hint: 'Start a line with "## " for a heading and "- " for a bullet point. Leave a blank line between paragraphs. Use **bold** and [link text](https://example.com).' },
    ],
  },
  customPages: {
    title: 'Extra pages',
    root: true,
    note: 'Create extra pages (e.g. Performances, Workshops, Policies). New pages are added to the menu automatically; you can hide or reorder them under Menu tabs.',
    fields: [
      { key: '$', type: 'list', itemLabel: 'page', titleKey: 'title', fields: [
        { key: 'title', label: 'Page title' },
        { key: 'slug', label: 'Web address', hint: 'The page will be at /p/<this>. Leave blank to use the title.' },
        { key: 'intro', label: 'Introduction', type: 'textarea' },
        { key: 'body', label: 'Content', type: 'rich' },
        { key: 'image', label: 'Image', type: 'image' },
      ] },
    ],
  },
};

async function uploadImage(file) {
  const form = new FormData();
  form.append('file', file);
  const { url } = await api(isAdmin() ? '/api/admin/upload' : '/api/staff/upload', { method: 'POST', form });
  return url;
}

function newItem(fields) {
  const item = {};
  for (const f of fields) {
    if (f.type === 'bool') item[f.key] = false;
    else if (f.type === 'strings') item[f.key] = [];
    else if (f.type === 'list') item[f.key] = [];
    else if (f.type === 'object') item[f.key] = newItem(f.fields);
    else if (f.type === 'select') item[f.key] = optionValue(f.options[0]);
    else item[f.key] = '';
  }
  return item;
}

const optionValue = (o) => (o && typeof o === 'object' ? o.value : o);

function buildField(f, obj, onChange) {
  const id = `f-${Math.random().toString(36).slice(2, 9)}`;
  const hint = f.hint || (f.type === 'rich' ? RICH_HINT : '');
  const set = (v) => {
    obj[f.key] = v;
    onChange();
  };
  const wrap = (control) => el('div', { class: 'field' },
    el('label', { class: 'field-label', for: id, text: f.label }),
    control,
    hint ? el('small', { text: hint }) : null
  );

  switch (f.type) {
    case 'heading':
      return el('h3', { class: 'form-heading', text: f.label });
    case 'bool':
      return el('label', { class: 'checkbox' },
        el('input', { type: 'checkbox', checked: obj[f.key], onchange: (e) => set(e.target.checked) }), f.label);
    case 'textarea':
    case 'rich':
      return wrap(el('textarea', { id, rows: f.type === 'rich' ? 7 : 3, value: obj[f.key] ?? '', oninput: (e) => set(e.target.value), onchange: (e) => set(e.target.value) }));
    case 'number':
      return wrap(el('input', { id, type: 'number', min: 1, max: 50, value: obj[f.key] ?? '', oninput: (e) => set(Number(e.target.value) || 0), onchange: (e) => set(Number(e.target.value) || 0) }));
    case 'select':
      return wrap(el('select', { id, onchange: (e) => set(e.target.value) },
        f.options.map((o) => el('option', { value: optionValue(o), selected: obj[f.key] === optionValue(o) ? 'selected' : null, text: o.label ?? o }))));
    case 'color': {
      const text = el('input', { type: 'text', value: obj[f.key] || '', style: 'max-width:140px', oninput: (e) => { picker.value = e.target.value; set(e.target.value); } });
      const picker = el('input', { id, type: 'color', value: /^#[0-9a-f]{6}$/i.test(obj[f.key]) ? obj[f.key] : '#000000', oninput: (e) => { text.value = e.target.value; set(e.target.value); } });
      return wrap(el('div', { class: 'image-field' }, picker, text));
    }
    case 'image': {
      const thumb = el('img', { class: 'thumb', alt: '', src: safeImg(obj[f.key]) || '/img/favicon-32.png' });
      const input = el('input', { id, type: 'text', value: obj[f.key] || '', placeholder: 'Upload, or paste an image URL', oninput: (e) => { thumb.src = safeImg(e.target.value) || '/img/favicon-32.png'; set(e.target.value); } });
      const file = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true });
      const btn = el('button', { type: 'button', class: 'btn btn-sm btn-outline', text: 'Upload', onclick: () => file.click() });
      file.addEventListener('change', async () => {
        if (!file.files[0]) return;
        await withBusy(btn, async () => {
          try {
            const url = await uploadImage(file.files[0]);
            input.value = url;
            thumb.src = url;
            set(url);
          } catch (err) {
            toast(err.message, 'error');
          }
        });
        file.value = '';
      });
      const clear = el('button', { type: 'button', class: 'btn btn-sm btn-ghost', text: 'Remove', onclick: () => { input.value = ''; thumb.src = '/img/favicon-32.png'; set(''); } });
      return wrap(el('div', { class: 'image-field' }, thumb, input, btn, clear, file));
    }
    case 'object': {
      obj[f.key] = obj[f.key] && typeof obj[f.key] === 'object' ? obj[f.key] : newItem(f.fields);
      return el('fieldset', { class: 'list-editor-item' },
        el('legend', { class: 'field-label', text: f.label }),
        f.fields.map((sub) => buildField(sub, obj[f.key], onChange)));
    }
    case 'strings':
    case 'list':
      return buildList(f, obj, onChange);
    default:
      // Listen to "change" as well as "input": Safari's time picker (iPhone/iPad)
      // may only report the new time on "change".
      return wrap(el('input', { id, type: f.type || 'text', value: obj[f.key] ?? '', oninput: (e) => set(e.target.value), onchange: (e) => set(e.target.value) }));
  }
}

function buildList(f, obj, onChange) {
  if (!Array.isArray(obj[f.key])) obj[f.key] = [];
  const arr = obj[f.key];
  const container = el('div', { class: 'list-editor' });
  const isStrings = f.type === 'strings';

  const rerender = () => {
    container.replaceChildren(
      ...arr.map((item, i) => {
        const actions = el('div', { class: 'list-editor-actions' },
          el('button', { type: 'button', class: 'icon-btn', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0 ? 'disabled' : null, text: '↑', onclick: () => { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; onChange(); rerender(); } }),
          el('button', { type: 'button', class: 'icon-btn', title: 'Move down', 'aria-label': 'Move down', disabled: i === arr.length - 1 ? 'disabled' : null, text: '↓', onclick: () => { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; onChange(); rerender(); } }),
          el('button', { type: 'button', class: 'icon-btn danger', title: 'Remove', 'aria-label': 'Remove', text: '✕', onclick: async () => {
            if (!isStrings && !(await confirmDialog(`Remove this ${f.itemLabel}?`, { confirmLabel: 'Remove', danger: true }))) return;
            arr.splice(i, 1); onChange(); rerender();
          } })
        );
        if (isStrings) {
          return el('div', { class: 'image-field' },
            el('input', { type: 'text', value: item, 'aria-label': `${f.label}: ${f.itemLabel || 'item'} ${i + 1}`, oninput: (e) => { arr[i] = e.target.value; onChange(); }, onchange: (e) => { arr[i] = e.target.value; onChange(); } }),
            actions);
        }
        const title = el('strong', { text: item[f.titleKey] || `New ${f.itemLabel}` });
        const fields = f.fields.map((sub) => buildField(sub, item, () => {
          title.textContent = item[f.titleKey] || `New ${f.itemLabel}`;
          onChange();
        }));
        return el('div', { class: 'list-editor-item' }, el('div', { class: 'list-editor-head' }, title, actions), fields);
      }),
      el('div', {}, el('button', { type: 'button', class: 'btn btn-sm btn-outline', text: `+ Add ${f.itemLabel}`, onclick: () => {
        arr.push(isStrings ? '' : newItem(f.fields));
        onChange();
        rerender();
        const items = container.querySelectorAll(isStrings ? 'input' : '.list-editor-item');
        items[items.length - 1]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } }))
    );
  };
  rerender();
  if (!f.label) return container;
  return el('div', { class: 'field' },
    el('span', { class: 'field-label', text: f.label }),
    f.hint ? el('small', { text: f.hint }) : null,
    container);
}

function saveBar(onSave, viewLink) {
  const status = el('span', { class: 'status', text: 'All changes saved' });
  const saveBtn = el('button', { class: 'btn btn-primary', text: 'Save changes', onclick: () => onSave(saveBtn) });
  const bar = el('div', { class: 'save-bar' }, status,
    viewLink ? el('a', { class: 'btn btn-outline', href: viewLink, target: '_blank', rel: 'noopener', text: 'View page ↗' }) : null,
    saveBtn);
  let dirty = false;
  const setDirty = (v) => {
    dirty = v;
    status.textContent = v ? 'Unsaved changes' : 'All changes saved';
    status.classList.toggle('dirty', v);
  };
  setLeaveGuard((silent) => !dirty || (!silent && confirm('You have unsaved changes. Leave without saving?')));
  return { bar, setDirty, isDirty: () => dirty };
}

// Saves one section only, so an editor opened earlier (another tab, phone or
// person) can't overwrite newer changes to other sections.
async function saveSection(section, value) {
  // A teacher allowed to edit Our journey saves through their own, narrower route.
  const base = isAdmin() ? '/api/admin' : '/api/staff';
  const saved = await api(`${base}/content/${section}`, { method: 'PUT', body: { value } });
  state.content = saved;
  await reloadContent();
  return saved;
}

async function saveContent(next) {
  const saved = await api('/api/admin/content', { method: 'PUT', body: next });
  state.content = saved;
  await reloadContent();
  return saved;
}

async function contentEditor(root, section) {
  // Always start editing from the latest saved content, not the copy this
  // browser loaded earlier.
  await reloadContent();
  if (section === 'nav') return navEditor(root);
  if (section === 'json') return jsonEditor(root);
  const schema = SCHEMAS[section];
  if (!schema) return navigate('/admin', { replace: true });

  const draftAll = structuredClone(state.content);
  const holder = schema.root ? { $: draftAll[section] } : null;
  const draft = schema.root ? holder : draftAll[section];

  const { bar, setDirty } = saveBar(async (btn) => {
    await withBusy(btn, async () => {
      try {
        await saveSection(section, schema.root ? holder.$ : draftAll[section]);
        setDirty(false);
        toast('Saved! The website has been updated.', 'success');
        const y = window.scrollY;
        await contentEditor(root, section);
        window.scrollTo(0, y);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }, schema.view);

  const onChange = () => setDirty(true);
  const resetBtn = el('button', { class: 'btn btn-sm btn-ghost', text: 'Restore defaults', onclick: async () => {
    if (!(await confirmDialog(`Replace everything in "${schema.title}" with the original starter content? All your changes to this page will be lost and can't be undone.`, { confirmLabel: 'Restore defaults', danger: true }))) return;
    state.content = await api('/api/admin/content/reset', { method: 'POST', body: { section } });
    await reloadContent();
    setDirty(false);
    contentEditor(root, section);
    toast('Defaults restored', 'success');
  } });

  root.replaceChildren(
    el('div', { class: 'admin-head' }, el('h1', { text: schema.title }), el('div', { class: 'btn-row' }, isAdmin() ? resetBtn : '')),
    schema.note ? el('div', { class: 'notice', text: schema.note }) : '',
    el('div', { class: 'card form' }, schema.fields.map((f) => buildField(f, draft, onChange))),
    bar
  );
}

function navEditor(root) {
  const draftAll = structuredClone(state.content);
  const nav = draftAll.nav;
  const pageTitle = (id) => {
    if (id.startsWith('page:')) return `Extra page: /p/${id.slice(5)}`;
    return { home: 'Home page', about: 'About page', timetable: 'Timetable page', pricing: 'Pricing page', gallery: 'Gallery page', contact: 'Contact page', performances: 'Performances page', workshops: 'Workshops page', faq: 'FAQs page', timeline: 'Our journey page' }[id] || id;
  };
  const { bar, setDirty } = saveBar(async (btn) => {
    await withBusy(btn, async () => {
      try {
        await saveSection('nav', nav);
        setDirty(false);
        toast('Menu saved', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }, '/');
  const list = el('div', { class: 'list-editor' });
  const rerender = () => list.replaceChildren(...nav.map((item, i) => el('div', { class: 'nav-editor-row' },
    el('input', { type: 'checkbox', checked: item.visible, title: 'Show in menu', 'aria-label': 'Show in menu', style: 'width:20px;height:20px', onchange: (e) => { item.visible = e.target.checked; setDirty(true); } }),
    el('div', {},
      el('input', { type: 'text', value: item.label, 'aria-label': 'Menu label', oninput: (e) => { item.label = e.target.value; setDirty(true); } }),
      el('small', { class: 'muted', text: pageTitle(item.id) })),
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move up', disabled: i === 0 ? 'disabled' : null, text: '↑', onclick: () => { [nav[i - 1], nav[i]] = [nav[i], nav[i - 1]]; setDirty(true); rerender(); } }),
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move down', disabled: i === nav.length - 1 ? 'disabled' : null, text: '↓', onclick: () => { [nav[i + 1], nav[i]] = [nav[i], nav[i + 1]]; setDirty(true); rerender(); } })
  )));
  rerender();
  root.replaceChildren(
    el('div', { class: 'admin-head' }, el('h1', { text: 'Menu tabs' })),
    el('div', { class: 'notice', text: 'Rename, reorder or hide the tabs in the site menu. Untick a tab to hide that page from visitors.' }),
    el('div', { class: 'card' }, list),
    bar
  );
}

function jsonEditor(root) {
  const area = el('textarea', { class: 'code-area', spellcheck: 'false', value: JSON.stringify(state.content, null, 2) });
  const { bar, setDirty } = saveBar(async (btn) => {
    let parsed;
    try {
      parsed = JSON.parse(area.value);
    } catch (err) {
      return toast(`That is not valid JSON: ${err.message}`, 'error', 6000);
    }
    // One bad paste here changes every page at once, so it always asks first.
    if (!(await confirmDialog('Replace ALL of the website\'s wording, pages and settings with what is in this box? Every page will change at once.', { confirmLabel: 'Replace everything', danger: true }))) return;
    await withBusy(btn, async () => {
      try {
        await saveContent(parsed);
        area.value = JSON.stringify(state.content, null, 2);
        setDirty(false);
        toast('Saved', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
  area.addEventListener('input', () => setDirty(true));
  const download = el('a', { class: 'btn btn-sm btn-outline', text: 'Download content only', href: '#', onclick: (e) => {
    e.preventDefault();
    const blob = new Blob([JSON.stringify(state.content, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `lab-website-content-${todayLondon()}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  } });

  // The whole database: download, and put a backup back.
  const file = el('input', { type: 'file', accept: '.json,application/json' });
  const confirmBox = el('input', { placeholder: 'Type RESTORE', autocomplete: 'off' });
  const restore = el('button', { class: 'btn btn-sm btn-danger', type: 'button', text: 'Restore this backup', onclick: async () => {
    const f = file.files[0];
    if (!f) return toast('Choose a backup file first', 'error');
    let backup;
    try {
      backup = JSON.parse(await f.text());
    } catch {
      return toast("That file isn't a backup from this website.", 'error');
    }
    await withBusy(restore, async () => {
      try {
        const r = await api('/api/admin/restore', { method: 'POST', body: { ...backup, confirm: confirmBox.value.trim() } });
        alert(`Restored: ${r.counts.users} people, ${r.counts.class_sessions} sessions, ${r.counts.class_payments} payments. Everyone has been logged out, so please log in again.`);
        location.href = '/login';
      } catch (err) {
        toast(err.message, 'error', 6000);
      }
    });
  } });
  const backupCard = el('div', { class: 'card form', style: 'margin-bottom:20px' },
    el('h3', { text: 'Database backup', style: 'margin:0' }),
    el('p', { class: 'small', text: 'A backup holds everything: members, attendance, payments, debriefs, messages, visitor figures and all website content. Download one regularly and keep it somewhere safe and private.' }),
    el('div', { class: 'btn-row' }, el('a', { class: 'btn btn-sm btn-primary', href: '/api/admin/backup.json', download: '', text: 'Download a full backup' })),
    el('h4', { text: 'Restore from a backup', style: 'margin:12px 0 0' }),
    el('p', { class: 'small', text: 'This replaces EVERYTHING in the database with the backup, and logs everyone out. Only use it if something has gone badly wrong.' }),
    file, confirmBox, el('div', { class: 'btn-row' }, restore));

  const details = el('details', { class: 'card' },
    el('summary', { text: 'Edit all website content as JSON (experts only)', style: 'cursor:pointer;font-weight:700' }),
    el('div', { class: 'notice warn', style: 'margin-top:12px', text: 'This is all of the website content as JSON. A mistake here changes every page at once, so it asks before saving. Most changes are easier and safer in the other editors.' }),
    el('div', { class: 'btn-row', style: 'margin-bottom:10px' }, download),
    area, bar);
  root.replaceChildren(el('div', { class: 'admin-head' }, el('h1', { text: 'Advanced' })), backupCard, details);
}

// ---------- instagram ----------

// What the website actually receives: how many posts, with thumbnails, so a
// connection that works but brings no pictures is easy to spot.
async function instagramPreview(box) {
  if (!box) return;
  let feed;
  try {
    feed = await api(`/api/instagram?t=${Date.now()}`);
  } catch (err) {
    mount(box, html`<div class="notice warn">Could not load the posts: ${err.message}</div>`);
    return;
  }
  const posts = (feed.posts || []).filter((p) => safeImg(p.image));
  if (!posts.length) {
    mount(box, html`<div class="notice warn"><strong>Connected, but no posts came through.</strong> ${feed.error || ''}
      Check that the Instagram account has posts and is a public Professional account, and that the Behold feed shows posts on behold.so. Then press “Check for new posts now”.</div>`);
    return;
  }
  mount(box, html`
    <p class="small"><strong>${posts.length} ${posts.length === 1 ? 'post' : 'posts'} received.</strong> The newest:</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px">
      ${posts.slice(0, 8).map((p) => html`<a href="${safeUrl(p.permalink)}" target="_blank" rel="noopener" style="display:block;aspect-ratio:1;border-radius:12px;overflow:hidden;background:var(--cream)"><img src="${safeImg(p.image)}" alt="${p.caption ? p.caption.slice(0, 80) : 'Instagram post'}" loading="lazy" style="width:100%;height:100%;object-fit:cover" data-ig-thumb></a>`)}
    </div>
    <p class="muted small" id="ig-broken" hidden>Some pictures could not be loaded from Instagram. Press “Check for new posts now” to fetch fresh links.</p>`);
  box.querySelectorAll('[data-ig-thumb]').forEach((img) => img.addEventListener('error', () => {
    img.style.opacity = '0';
    box.querySelector('#ig-broken').hidden = false;
  }));
}

async function instagramPage(root) {
  const status = await api('/api/admin/instagram');
  const expires = status.expiresAt ? new Date(status.expiresAt) : null;
  const via = status.provider === 'behold' ? 'a Behold feed' : 'the Instagram API';
  mount(root, html`
    ${head('Instagram gallery')}
    <div class="card">
      <h3>Status</h3>
      ${status.configured ? html`
        <p>✅ Connected${status.username ? html` to <strong>@${status.username}</strong>` : ''} via ${via}.</p>
        <p class="muted small">New posts appear on the Gallery and Home pages automatically. The site checks for new posts every 10 minutes.
          ${status.provider === 'instagram' && status.fromEnv ? 'The token comes from the INSTAGRAM_ACCESS_TOKEN setting on the server.' : ''}
          ${status.provider === 'instagram' && !status.fromEnv && expires ? `The access token renews itself automatically (current token valid until ${expires.toLocaleDateString('en-GB')}).` : ''}
          ${status.lastFetchedAt ? `Last checked ${new Date(status.lastFetchedAt).toLocaleString('en-GB')}.` : ''}</p>
        ${status.lastError ? html`<div class="notice warn">Last error: ${status.lastError}</div>` : ''}
        <div class="btn-row">
          <button class="btn btn-sm btn-primary" id="ig-refresh">Check for new posts now</button>
          ${!status.fromEnv ? html`<button class="btn btn-sm btn-danger" id="ig-disconnect">Disconnect</button>` : ''}
          <a class="btn btn-sm btn-outline" href="/gallery" target="_blank" rel="noopener">View gallery ↗</a>
        </div>
        <div id="ig-preview" style="margin-top:18px"><p class="muted small">Loading the latest posts…</p></div>`
      : html`<p>⚪ Not connected yet. Until you connect, the Gallery page shows a "Follow on Instagram" button and any extra photos you add under <a href="/admin/content/gallery">Gallery</a>.</p>`}
    </div>

    <div class="card" style="margin-top:20px">
      <h3>Option 1 (easiest): Behold feed link</h3>
      <p class="small muted">Behold is a service that connects to Instagram for you and keeps the connection working. Its free plan is enough for one gallery.</p>
      <ol class="small" style="padding-left:20px">
        <li>Make sure @londonacademyofbhangra is a <strong>Professional</strong> account (Business or Creator). In the Instagram app go to Settings → Account type and tools → Switch to professional account.</li>
        <li>Sign up at <a href="https://behold.so" target="_blank" rel="noopener">behold.so</a> and connect the academy's Instagram account.</li>
        <li>Create a <strong>JSON feed</strong> and copy its link. It looks like <code>https://feeds.behold.so/abc123</code>.</li>
        <li>Paste the link below.</li>
      </ol>
      <form class="form" id="behold-form">
        <label class="field"><span>Behold JSON feed link</span><input name="beholdUrl" type="url" required placeholder="https://feeds.behold.so/…" value="${status.beholdUrl}"></label>
        <div class="form-error"></div>
        <div><button class="btn btn-primary" type="submit">Save & test connection</button></div>
      </form>
    </div>

    <details class="card" style="margin-top:20px">
      <summary><strong>Option 2 (advanced): Instagram API access token</strong></summary>
      <ol class="small" style="padding-left:20px;margin-top:12px">
        <li>The Instagram account must be a <strong>Professional</strong> account (see above).</li>
        <li>Go to <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com/apps</a>, create an app (type "Business") and add the <strong>Instagram</strong> product ("API setup with Instagram login").</li>
        <li>Under "Generate access tokens", add the academy's Instagram account and click <strong>Generate token</strong>.</li>
        <li>Paste the token below. It lasts 60 days and this site renews it automatically.</li>
      </ol>
      <form class="form" id="ig-form">
        <label class="field"><span>Access token</span><input name="accessToken" type="password" autocomplete="off" required placeholder="IGAA…"></label>
        <div class="form-error"></div>
        <div><button class="btn btn-primary" type="submit">Save & test connection</button></div>
      </form>
    </details>`);

  for (const id of ['behold-form', 'ig-form']) {
    const form = root.querySelector(`#${id}`);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await withBusy(form.querySelector('[type=submit]'), async () => {
        try {
          await api('/api/admin/instagram', { method: 'POST', body: formData(form) });
          toast('Instagram connected! New posts will now appear in the gallery.', 'success', 5000);
          instagramPage(root);
        } catch (err) {
          formError(form, err.message);
        }
      });
    });
  }
  instagramPreview(root.querySelector('#ig-preview'));
  root.querySelector('#ig-refresh')?.addEventListener('click', async (e) => {
    await withBusy(e.target, async () => {
      const r = await api('/api/admin/instagram/refresh', { method: 'POST' });
      if (r.lastError) toast(r.lastError, 'error', 6000);
      else toast(`Loaded ${r.postCount} posts`, 'success');
      instagramPage(root);
    });
  });
  root.querySelector('#ig-disconnect')?.addEventListener('click', async () => {
    if (!(await confirmDialog('Disconnect Instagram? The gallery will stop showing posts.', { confirmLabel: 'Disconnect', danger: true }))) return;
    await api('/api/admin/instagram', { method: 'DELETE' });
    instagramPage(root);
  });
}

// ---------- messages ----------

async function messagesPage(root) {
  const { messages } = await api('/api/admin/messages');
  mount(root, html`
    ${head('Messages')}
    <div id="message-list">
    ${messages.length ? messages.map((m) => html`
      <div class="card" style="margin-bottom:14px;${m.is_read ? '' : 'border-left:4px solid var(--accent)'}">
        <div class="list-editor-head">
          <div><strong>${m.subject || '(no subject)'}</strong>${m.is_read ? '' : html` <span class="badge">New</span>`}
            <div class="muted small">${m.name} · <a href="mailto:${m.email}">${m.email}</a>${m.phone ? html` · <a href="tel:${m.phone}">${m.phone}</a>` : ''} · ${formatDateTime(m.created_at)}</div>
          </div>
          <div class="list-editor-actions">
            <button class="icon-btn" data-read="${m.id}" data-value="${m.is_read ? 0 : 1}" title="${m.is_read ? 'Mark unread' : 'Mark read'}">${m.is_read ? '✉' : '✓'}</button>
            <button class="icon-btn danger" data-delete="${m.id}" title="Delete">✕</button>
          </div>
        </div>
        <p style="white-space:pre-wrap;margin:12px 0 0">${m.body}</p>
        <a class="btn btn-sm btn-outline" style="margin-top:12px" href="${safeUrl(`mailto:${m.email}?subject=${encodeURIComponent('Re: ' + (m.subject || 'Your message'))}`)}">Reply by email</a>
      </div>`) : html`<div class="empty">No messages yet. Messages sent from the Contact page will appear here.</div>`}
    </div>`);

  root.querySelector('#message-list').addEventListener('click', async (e) => {
    const read = e.target.closest('[data-read]');
    const del = e.target.closest('[data-delete]');
    if (read) {
      await api(`/api/admin/messages/${read.dataset.read}`, { method: 'PATCH', body: { read: read.dataset.value === '1' } });
      messagesPage(root);
    } else if (del) {
      if (!(await confirmDialog('Delete this message?', { confirmLabel: 'Delete', danger: true }))) return;
      await api(`/api/admin/messages/${del.dataset.delete}`, { method: 'DELETE' });
      messagesPage(root);
    }
  });
}

// ---------- visitors ----------

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const EVENT_LABELS = { directions: 'Get directions', calendar: 'Add to my calendar', call: 'Call us', whatsapp: 'WhatsApp', join: 'Join the LAB', instagram: 'Instagram link', contact: 'Contact form sent' };
const DEVICE_LABELS = { phone: 'Phone', computer: 'Computer', tablet: 'Tablet' };

const count = (n) => Number(n || 0).toLocaleString('en-GB');
const duration = (s) => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
const dayOf = (iso) => new Date(`${iso}T12:00:00Z`);

function pageName(path) {
  const { nav, customPages } = state.content;
  const fixed = { '/': 'Home', '/login': 'Log in', '/register': 'Join the LAB', '/account': 'My account', '/privacy': 'Privacy policy', '/privacy-consent': 'Privacy agreement' };
  if (fixed[path]) return fixed[path];
  if (path.startsWith('/p/')) return customPages.find((p) => p.slug === path.slice(3))?.title || path;
  return nav.find((n) => `/${n.id}` === path)?.label || path;
}

// "▲ 18% on the 30 days before", or nothing when there is no earlier period to compare with.
function change(now, before, days) {
  if (!before) return '';
  const pct = Math.round(((now - before) / before) * 100);
  const span = days === 365 ? 'the 12 months before' : `the ${days} days before`;
  if (!pct) return html`<small>Same as ${span}</small>`;
  return html`<small><span class="${pct > 0 ? 'up' : 'down'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span> on ${span}</small>`;
}

// A list of labelled bars, each as long as its share of the largest.
function barRows(rows) {
  const top = Math.max(1, ...rows.map((r) => r.n));
  const total = rows.reduce((a, r) => a + r.n, 0) || 1;
  if (!rows.some((r) => r.n)) return html`<li class="none">Nothing counted yet.</li>`;
  return rows.map((r) => html`
    <li><span>${r.label}</span><span class="n">${count(r.n)}<small>${Math.round((r.n / total) * 100)}%</small></span>
      <div class="vz-meter" aria-hidden="true"><i style="width:${(r.n / top) * 100}%"></i></div></li>`);
}

// Round steps for the chart's scale lines (1, 2 or 5 times a power of ten), about four of them.
function scaleSteps(v) {
  const rough = Math.max(1, v) / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((m) => m >= rough));
  const top = Math.max(step, Math.ceil(v / step) * step);
  return { top, lines: Array.from({ length: top / step }, (_, i) => (i + 1) * step) };
}

async function visitorsPage(root) {
  const classDays = new Set((state.content.timetable.classes || []).map((c) => c?.day).filter(Boolean));
  let range = 30;
  let body = null;

  const draw = (v) => {
    const { now, before, series, byMonth } = v;
    const empty = !now.views && !before.views;
    const { top: max, lines } = scaleSteps(Math.max(...series.map((r) => r.people)));
    const compare = (a, b) => (v.comparable ? change(a, b, range) : '');
    const isClassDay = (r) => !byMonth && classDays.has(WEEKDAYS[(dayOf(r.k).getUTCDay() + 6) % 7]);
    const label = (r) => (byMonth
      ? new Date(`${r.k}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
      : dayOf(r.k).toLocaleDateString('en-GB', series.length <= 7 ? { weekday: 'short', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' }));
    const longLabel = (r) => (byMonth
      ? new Date(`${r.k}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      : dayOf(r.k).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }));
    const showAxis = (i) => byMonth || series.length <= 7 || i % 7 === (series.length - 1) % 7;
    const labelBar = (r) => r.people > 0 && (byMonth || series.length <= 7 || isClassDay(r));

    // Class days against the rest, when there is enough to say something.
    let callout = '';
    if (!byMonth && classDays.size) {
      const on = series.filter(isClassDay);
      const offDays = series.filter((r) => !isClassDay(r));
      const avg = (rows) => rows.reduce((a, r) => a + r.people, 0) / (rows.length || 1);
      const ratio = avg(offDays) ? avg(on) / avg(offDays) : 0;
      const names = [...classDays].map((d) => `${d}s`).join(' and ');
      const howMuch = ratio >= 2.5 ? `${Math.round(ratio)} times as many visitors as` : ratio >= 1.8 ? 'about twice as many visitors as' : `about ${Math.round((ratio - 1) * 100)}% more visitors than`;
      if (on.length && ratio >= 1.3) callout = `${names} (class night) bring ${howMuch} other days.`;
    }

    const weekRows = WEEKDAYS.map((d, i) => ({ label: d, n: v.weekdays.find((w) => w.dow === i + 1)?.n || 0 })).sort((a, b) => b.n - a.n);
    const deviceRows = ['phone', 'computer', 'tablet'].map((k) => ({ label: DEVICE_LABELS[k], n: v.devices.find((d) => d.label === k)?.n || 0 }));
    const eventRows = Object.entries(EVENT_LABELS).map(([k, l]) => ({ label: l, n: v.events[k] || 0 })).sort((a, b) => b.n - a.n);
    const pagesTop = Math.max(1, ...v.pages.map((p) => p.views));
    const perVisit = now.people ? (now.views / now.people).toFixed(1) : '0';

    mount(body, html`
      ${empty ? html`<p class="vz-empty">No visits counted yet. Figures appear here as people visit the website (your own visits as an admin or teacher are not counted).</p>` : ''}
      <div class="vz-stats">
        <div class="vz-stat"><b>${count(now.people)}</b><span>People visited</span>${compare(now.people, before.people)}</div>
        <div class="vz-stat"><b>${count(now.views)}</b><span>Pages viewed</span>${compare(now.views, before.views)}</div>
        <div class="vz-stat"><b>${duration(now.visitSeconds)}</b><span>Average visit</span><small>${perVisit} pages a visit</small></div>
        <div class="vz-stat"><b>${count(now.joined)}</b><span>Joined the LAB</span><small>${now.people ? `${((now.joined / now.people) * 100).toFixed(1)}% of visitors signed up` : 'New member accounts'}</small></div>
      </div>

      <section class="vz-card">
        <h2>People visiting each ${byMonth ? 'month' : 'day'}</h2>
        <p class="note">Hover over or tap a bar for its numbers.${!byMonth && classDays.size && series.length > 7 ? ' Class days are labelled.' : ''}</p>
        <div class="vz-days" id="vz-days" style="--n:${series.length}" role="group" aria-label="People visiting each ${byMonth ? 'month' : 'day'}">
          ${lines.map((g) => html`<div class="grid" style="bottom:calc((100% - 22px) * ${g / max})"><i>${count(g)}</i></div>`)}
          ${series.map((r, i) => html`
            <div class="vz-day" tabindex="0" data-i="${i}" role="img" aria-label="${`${longLabel(r)}: ${count(r.people)} ${r.people === 1 ? 'person' : 'people'}, ${count(r.views)} pages`}">
              <div class="bar" style="height:${(r.people / max) * 100}%"></div>
              ${labelBar(r) ? html`<span class="lab" style="bottom:calc(${(r.people / max) * 100}% + 4px)">${count(r.people)}</span>` : ''}
            </div>`)}
          <div class="vz-tip" id="vz-tip" aria-hidden="true" hidden></div>
        </div>
        <div class="vz-axis" style="--n:${series.length}" aria-hidden="true">${series.map((r, i) => html`<span class="${showAxis(i) ? 'k' : ''}">${showAxis(i) ? label(r) : ''}</span>`)}</div>
        <p class="vz-callout">${callout}</p>
      </section>

      <section class="vz-card">
        <h2>Most popular pages</h2>
        <p class="note">Time on page counts only while the page is open on screen.</p>
        ${v.pages.length ? html`
          <table class="vz-table">
            <thead><tr><th scope="col">Page</th><th scope="col" class="n">Views</th><th scope="col" class="n hide-s">People</th><th scope="col" class="n">Avg. time</th></tr></thead>
            <tbody>${v.pages.map((p) => html`
              <tr><td class="pg"><b>${pageName(p.path)}</b><small>${p.path}</small><div class="vz-meter" aria-hidden="true"><i style="width:${(p.views / pagesTop) * 100}%"></i></div></td>
                <td class="n">${count(p.views)}</td><td class="n hide-s">${count(p.people)}</td><td class="n">${p.seconds ? duration(p.seconds) : '–'}</td></tr>`)}
            </tbody>
          </table>` : html`<p class="muted" style="margin:0">Nothing counted yet.</p>`}
      </section>

      <div class="vz-two">
        <section class="vz-card"><h2>Where visitors came from</h2><p class="note">The site or app they clicked through from.</p><ul class="vz-rows">${barRows(v.sources.map((s) => ({ label: s.label, n: s.n })))}</ul></section>
        <section class="vz-card"><h2>Buttons pressed</h2><p class="note">How often each main action was used.</p><ul class="vz-rows">${barRows(eventRows)}</ul></section>
      </div>
      <div class="vz-two">
        <section class="vz-card"><h2>Phone or computer</h2><p class="note">Share of visitors on each kind of device.</p><ul class="vz-rows">${barRows(deviceRows)}</ul></section>
        <section class="vz-card"><h2>Busiest days</h2><p class="note">When people visit, across the week.</p><ul class="vz-rows">${barRows(weekRows)}</ul></section>
      </div>`);

    // One tooltip, filled with text (never HTML) for the bar under the pointer or focus.
    const box = body.querySelector('#vz-days');
    const tip = body.querySelector('#vz-tip');
    const show = (col) => {
      const r = series[Number(col.dataset.i)];
      const when = longLabel(r);
      const strong = document.createElement('b');
      strong.textContent = `${count(r.people)} ${r.people === 1 ? 'person' : 'people'}`;
      tip.replaceChildren(strong, document.createTextNode(`${count(r.views)} pages · ${when}`));
      tip.hidden = false;
      const bar = col.querySelector('.bar');
      const left = Math.min(Math.max(col.offsetLeft + col.offsetWidth / 2, tip.offsetWidth / 2), box.clientWidth - tip.offsetWidth / 2);
      tip.style.left = `${left}px`;
      tip.style.top = `${col.offsetTop + col.offsetHeight - bar.offsetHeight}px`;
    };
    box.querySelectorAll('.vz-day').forEach((col) => {
      col.addEventListener('pointerenter', () => show(col));
      col.addEventListener('focus', () => show(col));
      col.addEventListener('pointerleave', () => { tip.hidden = true; });
      col.addEventListener('blur', () => { tip.hidden = true; });
    });
  };

  const load = async () => {
    body?.classList.add('is-loading');
    const v = await api(`/api/admin/visitors?range=${range}`);
    body.classList.remove('is-loading');
    draw(v);
    root.querySelector('#vz-csv').href = `/api/admin/visitors.csv?range=${range}`;
  };

  mount(root, html`
    ${head('Visitors', html`<a class="btn btn-ghost" id="vz-csv" href="/api/admin/visitors.csv?range=30" download>Download CSV</a>`)}
    <div class="vz-filters" role="group" aria-label="Time range">
      ${[[7, 'Last 7 days'], [30, 'Last 30 days'], [365, 'Last 12 months']].map(([d, l]) => html`<button type="button" data-range="${d}" aria-pressed="${String(d === range)}">${l}</button>`)}
    </div>
    <div class="vz-body" id="vz-body"></div>
    <div class="vz-privacy"><span aria-hidden="true">🔒</span><p style="margin:0"><b>Counted without cookies.</b> Nothing is saved on visitors' phones or computers and no names, emails or exact addresses are kept. Each visitor is counted using a scrambled code that changes every day, so nobody can be followed from one day to the next, and someone who visits on two days counts twice. Admin and teacher visits are not counted, nor are browsers set to "do not track". Figures older than 13 months are deleted automatically.</p></div>`);
  body = root.querySelector('#vz-body');
  root.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', async () => {
    range = Number(b.dataset.range);
    root.querySelectorAll('[data-range]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    try {
      await load();
    } catch (err) {
      body.classList.remove('is-loading');
      toast(err.message, 'error');
    }
  }));
  await load();
}
