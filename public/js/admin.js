import {
  api, html, raw, mount, el, toast, openDialog, confirmDialog, formatDate, formatDateTime, formatTime,
  todayLondon, formError, formData, withBusy, safeImg, safeUrl,
} from './lib.js';
import { state, navigate, onLeave, setLeaveGuard, reloadContent, monthlyChart } from './app.js';

const isAdmin = () => state.user?.role === 'admin';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ---------- layout ----------

const NAV = [
  { heading: 'Attendance' },
  { path: '', label: 'Dashboard', icon: '🏠' },
  { path: 'scanner', label: 'QR scanner', icon: '📷' },
  { path: 'sessions', label: 'Sessions', icon: '📅' },
  { path: 'members', label: 'Members', icon: '👥' },
  { heading: 'Website', admin: true },
  { path: 'content/site', label: 'Site & branding', icon: '🎨', admin: true },
  { path: 'content/nav', label: 'Menu tabs', icon: '🧭', admin: true },
  { path: 'content/home', label: 'Home page', icon: '🏡', admin: true },
  { path: 'content/about', label: 'About page', icon: '📖', admin: true },
  { path: 'content/timetable', label: 'Timetable', icon: '🕒', admin: true },
  { path: 'content/pricing', label: 'Pricing', icon: '💷', admin: true },
  { path: 'content/gallery', label: 'Gallery', icon: '🖼️', admin: true },
  { path: 'content/contact', label: 'Contact page', icon: '✉️', admin: true },
  { path: 'content/members', label: 'Member pages', icon: '🔑', admin: true },
  { path: 'content/customPages', label: 'Extra pages', icon: '📄', admin: true },
  { path: 'instagram', label: 'Instagram', icon: '📸', admin: true },
  { path: 'messages', label: 'Messages', icon: '💬', admin: true },
  { path: 'content/json', label: 'Advanced', icon: '⚙️', admin: true },
];

function layout(active) {
  const items = NAV.filter((n) => !n.admin || isAdmin());
  mount('#main', html`
    <div class="container admin-layout">
      <nav class="admin-nav" aria-label="Admin">
        ${items.map((n) => n.heading
          ? html`<div class="nav-heading">${n.heading}</div>`
          : html`<a href="/admin${n.path ? '/' + n.path : ''}" class="${n.path === active ? 'active' : ''}"><span aria-hidden="true">${n.icon}</span>${n.label}</a>`)}
      </nav>
      <div class="admin-main" id="admin-main"><div class="page-loading"><div class="spinner"></div></div></div>
    </div>`);
  const activeLink = document.querySelector('.admin-nav a.active');
  activeLink?.scrollIntoView({ block: 'nearest', inline: 'center' });
  return document.getElementById('admin-main');
}

function head(title, actions = '') {
  return html`<div class="admin-head"><h1>${title}</h1><div class="btn-row">${actions}</div></div>`;
}

export async function render(parts) {
  const [section = '', sub, id] = parts;
  document.title = `Admin | ${state.content.site.name}`;
  const adminOnly = ['content', 'instagram', 'messages'];
  if (adminOnly.includes(section) && !isAdmin()) return navigate('/admin', { replace: true });

  if (section === '') return dashboard(layout(''));
  if (section === 'scanner') return scanner(layout('scanner'));
  if (section === 'sessions') return sub ? sessionDetail(layout('sessions'), sub) : sessionsList(layout('sessions'));
  if (section === 'members') return sub ? memberDetail(layout('members'), sub) : membersList(layout('members'));
  if (section === 'content') return contentEditor(layout(`content/${sub}`), sub, id);
  if (section === 'instagram') return instagramPage(layout('instagram'));
  if (section === 'messages') return messagesPage(layout('messages'));
  navigate('/admin', { replace: true });
}

// ---------- dashboard ----------

async function dashboard(root) {
  const [stats, today] = await Promise.all([api('/api/staff/stats'), api('/api/staff/today')]);
  mount(root, html`
    ${head(`Welcome, ${state.user.name.split(' ')[0]}`, html`<a class="btn btn-accent" href="/admin/scanner">📷 Scan attendance</a>`)}
    <div class="stat-grid">
      <div class="stat"><div class="stat-value">${stats.members}</div><div class="stat-label">Active members</div></div>
      <div class="stat"><div class="stat-value">${stats.todayAttendance}</div><div class="stat-label">Checked in today</div></div>
      <div class="stat"><div class="stat-value">${stats.last30Attendance}</div><div class="stat-label">Check-ins (30 days)</div></div>
      ${isAdmin() ? html`<a class="stat" href="/admin/messages" style="text-decoration:none"><div class="stat-value">${stats.unreadMessages}</div><div class="stat-label">Unread messages</div></a>` : ''}
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
          ${isAdmin() ? html`
          <li class="list-item"><a href="/admin/content/home">Edit the website</a></li>
          <li class="list-item"><a href="/admin/instagram">Instagram gallery settings</a></li>` : ''}
          <li class="list-item"><a href="/account">My member card</a></li>
        </ul>
      </div>
    </div>`);
}

// ---------- scanner ----------

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
            </div>
          </div>
          <div class="btn-row" style="margin-top:12px">
            <button class="btn btn-sm btn-outline" id="stop-camera" hidden>Stop camera</button>
            <button class="btn btn-sm btn-ghost" id="switch-camera" hidden>Switch camera</button>
          </div>
          <div id="scan-result"></div>
          <div class="card" style="margin-top:16px">
            <h3>Manual check-in</h3>
            <p class="muted small">No phone? Type their member ID or search by name.</p>
            <form id="manual-form" class="form">
              <input name="q" type="search" placeholder="Member ID or name" autocomplete="off" autocapitalize="characters">
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
          showResult('ok', '✅', html`<strong>${r.member.name}</strong> checked in<br><span class="small">${r.member.memberId} · ${r.stats.total} classes total</span>`);
        } else {
          beep(true);
          showResult('warn', 'ℹ️', html`<strong>${r.member.name}</strong> is already checked in`);
        }
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
        const secure = window.isSecureContext ? '' : ' The camera only works when the site is opened over https.';
        showResult('err', '⚠️', `Could not start the camera: ${err?.message || err}.${secure}`);
      }
    };

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

async function sessionDetail(root, id) {
  const { session, attendees } = await api(`/api/staff/sessions/${id}`);
  mount(root, html`
    ${head(session.title, html`
      <a class="btn btn-sm btn-accent" href="/admin/scanner?session=${session.id}">📷 Scan into this session</a>
      <a class="btn btn-sm btn-outline" href="/api/staff/sessions/${session.id}/export.csv">Export CSV</a>`)}
    <p class="muted" style="margin-top:-12px">${formatDate(session.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${session.start_time ? ` · ${formatTime(session.start_time)}` : ''}${session.end_time ? ` to ${formatTime(session.end_time)}` : ''}</p>
    <div class="grid grid-2" style="align-items:start">
      <div class="card">
        <h3>Present (${attendees.length})</h3>
        ${attendees.length ? html`<ul class="list">${attendees.map((a) => html`
          <li class="list-item">
            <div><a href="/admin/members/${a.id}"><strong>${a.name}</strong></a><div class="meta">${a.memberId} · ${formatDateTime(a.scannedAt)} · ${a.method}${a.scannedBy ? ` by ${a.scannedBy}` : ''}</div></div>
            <button class="icon-btn danger" data-remove="${a.id}" aria-label="Remove">✕</button>
          </li>`)}</ul>` : html`<p class="muted">No one has been checked in yet.</p>`}
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

// ---------- members ----------

function rolePill(m) {
  if (!m.active) return html`<span class="pill pill-inactive">Inactive</span>`;
  if (m.role === 'admin') return html`<span class="pill pill-admin">Admin</span>`;
  if (m.role === 'instructor') return html`<span class="pill pill-instructor">Instructor</span>`;
  return html`<span class="pill">Member</span>`;
}

async function membersList(root) {
  const q = new URLSearchParams(location.search).get('q') || '';
  const { members } = await api(`/api/staff/members?q=${encodeURIComponent(q)}`);
  mount(root, html`
    ${head('Members', html`<button class="btn btn-accent" id="add-member">+ Add member</button>`)}
    <form id="member-search" style="margin-bottom:16px">
      <input type="search" name="q" value="${q}" placeholder="Search by name, email, phone or member ID">
    </form>
    <p class="muted small">${members.length} ${members.length === 1 ? 'person' : 'people'}</p>
    ${members.length ? html`
    <div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Member ID</th><th>Role</th><th>Classes</th><th>Last class</th></tr></thead>
      <tbody>${members.map((m) => html`
        <tr class="clickable" data-href="/admin/members/${m.id}">
          <td><a href="/admin/members/${m.id}"><strong>${m.name}</strong></a><div class="muted small">${m.email}</div></td>
          <td><code>${m.memberId}</code></td>
          <td>${rolePill(m)}</td>
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
      <option value="member">Member</option><option value="instructor">Instructor (can scan attendance)</option><option value="admin">Admin (full access)</option>
    </select></label>` : ''}
    <label class="field"><span>Password (optional)</span><input name="password" type="text" autocomplete="off"><small>Leave blank to generate one.</small></label>
    <label class="field"><span>Bio (visible to the member)</span><textarea name="bio" rows="2" maxlength="1000"></textarea></label>
    <label class="field"><span>Notes (staff only)</span><textarea name="notes" rows="2"></textarea></label>
    <div class="form-error"></div>
    <button class="btn btn-primary" type="submit">Create member</button>`.s;
  const { close } = openDialog('Add member', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await withBusy(form.querySelector('[type=submit]'), async () => {
      try {
        const { member, password } = await api('/api/staff/members', { method: 'POST', body: formData(form) });
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
        <div class="stat-grid">
          <div class="stat"><div class="stat-value">${stats.total}</div><div class="stat-label">Classes attended</div></div>
          <div class="stat"><div class="stat-value">${stats.thisMonth}</div><div class="stat-label">This month</div></div>
          <div class="stat"><div class="stat-value" style="font-size:1.1rem;padding:8px 0">${stats.lastAttended ? formatDate(stats.lastAttended, { day: 'numeric', month: 'short' }) : '-'}</div><div class="stat-label">Last class</div></div>
        </div>
        <div class="card" style="margin-top:20px">
          <h3>Last 6 months</h3>
          ${monthlyChart(stats.monthly)}
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
                ${['member', 'instructor', 'admin'].map((r) => html`<option value="${r}" ${raw(member.role === r ? 'selected' : '')}>${r[0].toUpperCase() + r.slice(1)}</option>`)}
              </select></label>
              <label class="field"><span>Status</span><select name="active">
                <option value="1" ${raw(member.active ? 'selected' : '')}>Active</option>
                <option value="0" ${raw(!member.active ? 'selected' : '')}>Inactive</option>
              </select></label>
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
  if (!isAdmin()) return;
  const form = root.querySelector('#member-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = formData(form);
    body.active = body.active === '1';
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

const FONTS = ['Poppins', 'Montserrat', 'Lato', 'Open Sans', 'Raleway', 'Nunito', 'Playfair Display', 'Merriweather', 'Oswald', 'Bebas Neue'];
const BUTTON_FIELDS = [
  { key: 'label', label: 'Button text' },
  { key: 'link', label: 'Link', hint: 'A page like /timetable, or a full web address (https://…)' },
  { key: 'style', label: 'Colour', type: 'select', options: ['Gold', 'Navy', 'White', 'Outline'] },
];
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
      h('Look & feel'),
      { key: 'logo', label: 'Logo', type: 'image' },
      { key: 'primaryColor', label: 'Main colour', type: 'color' },
      { key: 'accentColor', label: 'Accent colour', type: 'color' },
      { key: 'headingFont', label: 'Heading font', type: 'select', options: FONTS },
      { key: 'bodyFont', label: 'Text font', type: 'select', options: FONTS },
      h('Contact details'),
      { key: 'email', label: 'Email address', type: 'email' },
      { key: 'phones', label: 'Phone numbers', type: 'strings', itemLabel: 'phone number' },
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
      h('Top banner'),
      { key: 'heroEyebrow', label: 'Small text above the heading' },
      { key: 'heroTitle', label: 'Main heading' },
      { key: 'heroSubtitle', label: 'Sub heading', type: 'textarea' },
      { key: 'heroImage', label: 'Background image (optional)', type: 'image' },
      { key: 'showHeroLogo', label: 'Show the logo in the banner', type: 'bool' },
      buttonList('heroButtons', 'Banner buttons'),
      h('Highlights'),
      { key: 'showHighlights', label: 'Show the highlights section', type: 'bool' },
      { key: 'highlights', label: 'Highlights', type: 'list', itemLabel: 'highlight', titleKey: 'title', fields: [
        { key: 'icon', label: 'Icon (emoji)' }, { key: 'title', label: 'Title' }, { key: 'text', label: 'Text', type: 'textarea' },
      ] },
      h('Welcome section'),
      { key: 'showIntro', label: 'Show the welcome section', type: 'bool' },
      { key: 'introEyebrow', label: 'Small text above the heading' },
      { key: 'introTitle', label: 'Heading' },
      { key: 'introText', label: 'Text', type: 'rich' },
      buttonList('introButtons', 'Buttons'),
      { key: 'introImage', label: 'Image (optional, replaces the weekly classes box)', type: 'image' },
      { key: 'classesCardTitle', label: 'Weekly classes box heading' },
      { key: 'classesCardButton', label: 'Weekly classes box button text' },
      h('Instagram section'),
      { key: 'showInstagram', label: 'Show latest Instagram posts on the home page', type: 'bool' },
      { key: 'instagramEyebrow', label: 'Small text above the heading' },
      { key: 'instagramTitle', label: 'Heading' },
      { key: 'instagramPostCount', label: 'Number of posts', type: 'number' },
      { key: 'instagramButton', label: 'Button text' },
      h('Call to action band'),
      { key: 'showCta', label: 'Show the call to action band', type: 'bool' },
      { key: 'ctaTitle', label: 'Heading' },
      { key: 'ctaText', label: 'Text' },
      buttonList('ctaButtons', 'Buttons'),
    ],
  },
  about: {
    title: 'About page',
    view: '/about',
    fields: [
      { key: 'title', label: 'Page title' },
      { key: 'intro', label: 'Introduction', type: 'textarea' },
      h('Our story'),
      { key: 'storyEyebrow', label: 'Small text above the story' },
      { key: 'story', label: 'Story', type: 'rich' },
      { key: 'image', label: 'Image', type: 'image' },
      h('Values'),
      { key: 'valuesTitle', label: 'Heading' },
      { key: 'values', label: 'Values', type: 'list', itemLabel: 'value', titleKey: 'title', fields: [
        { key: 'title', label: 'Title' }, { key: 'text', label: 'Text', type: 'textarea' },
      ] },
      h('Team'),
      { key: 'teamEyebrow', label: 'Small text above the heading' },
      { key: 'teamTitle', label: 'Heading' },
      { key: 'founders', label: 'Team members', type: 'list', itemLabel: 'person', titleKey: 'name', fields: [
        { key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }, { key: 'bio', label: 'Bio', type: 'textarea' }, { key: 'image', label: 'Photo', type: 'image' },
      ] },
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
  const { url } = await api('/api/admin/upload', { method: 'POST', form });
  return url;
}

function newItem(fields) {
  const item = {};
  for (const f of fields) {
    if (f.type === 'bool') item[f.key] = false;
    else if (f.type === 'strings') item[f.key] = [];
    else if (f.type === 'list') item[f.key] = [];
    else if (f.type === 'object') item[f.key] = newItem(f.fields);
    else if (f.type === 'select') item[f.key] = f.options[0];
    else item[f.key] = '';
  }
  return item;
}

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
      return wrap(el('textarea', { id, rows: f.type === 'rich' ? 7 : 3, value: obj[f.key] ?? '', oninput: (e) => set(e.target.value) }));
    case 'number':
      return wrap(el('input', { id, type: 'number', min: 1, max: 50, value: obj[f.key] ?? '', oninput: (e) => set(Number(e.target.value) || 0) }));
    case 'select':
      return wrap(el('select', { id, onchange: (e) => set(e.target.value) },
        f.options.map((o) => el('option', { value: o, selected: obj[f.key] === o ? 'selected' : null, text: o }))));
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
      return wrap(el('input', { id, type: f.type || 'text', value: obj[f.key] ?? '', oninput: (e) => set(e.target.value) }));
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
            el('input', { type: 'text', value: item, oninput: (e) => { arr[i] = e.target.value; onChange(); } }),
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

async function saveContent(next) {
  const saved = await api('/api/admin/content', { method: 'PUT', body: next });
  state.content = saved;
  await reloadContent();
  return saved;
}

async function contentEditor(root, section) {
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
        if (schema.root) draftAll[section] = holder.$;
        await saveContent(draftAll);
        setDirty(false);
        toast('Saved! The website has been updated.', 'success');
        if (schema.root) contentEditor(root, section);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }, schema.view);

  const onChange = () => setDirty(true);
  const resetBtn = el('button', { class: 'btn btn-sm btn-ghost', text: 'Restore defaults', onclick: async () => {
    if (!(await confirmDialog(`Replace everything in "${schema.title}" with the original starter content?`, { confirmLabel: 'Restore', danger: true }))) return;
    state.content = await api('/api/admin/content/reset', { method: 'POST', body: { section } });
    await reloadContent();
    setDirty(false);
    contentEditor(root, section);
    toast('Defaults restored', 'success');
  } });

  root.replaceChildren(
    el('div', { class: 'admin-head' }, el('h1', { text: schema.title }), el('div', { class: 'btn-row' }, resetBtn)),
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
    return { home: 'Home page', about: 'About page', timetable: 'Timetable page', pricing: 'Pricing page', gallery: 'Gallery page', contact: 'Contact page' }[id] || id;
  };
  const { bar, setDirty } = saveBar(async (btn) => {
    await withBusy(btn, async () => {
      try {
        await saveContent(draftAll);
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
  const download = el('a', { class: 'btn btn-sm btn-outline', text: 'Download backup', href: '#', onclick: (e) => {
    e.preventDefault();
    const blob = new Blob([JSON.stringify(state.content, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `lab-website-content-${todayLondon()}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  } });
  root.replaceChildren(
    el('div', { class: 'admin-head' }, el('h1', { text: 'Advanced: all content' }), el('div', { class: 'btn-row' }, download)),
    el('div', { class: 'notice warn', text: 'This shows all of the website content as JSON. You can download it as a backup, or paste in a backup to restore it. Most changes are easier in the other editors.' }),
    area,
    bar
  );
}

// ---------- instagram ----------

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
        </div>`
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
