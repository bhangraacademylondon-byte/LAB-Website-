// Shared helpers for the public site and the admin area.

class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

export const raw = (s) => new Raw(String(s));

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderValue(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return esc(v);
}

// Tagged template that escapes every interpolated value unless it is raw()/html``.
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += renderValue(values[i]);
  });
  return new Raw(out);
}

export function safeUrl(url) {
  const u = String(url || '').trim();
  if (/^(https?:|mailto:|tel:)/i.test(u) || /^\/(?!\/)/.test(u) || u.startsWith('#')) return u;
  if (/^www\./i.test(u)) return `https://${u}`;
  return '#';
}

export function safeImg(url) {
  const u = String(url || '').trim();
  if (/^https?:\/\//i.test(u) || /^\/(?!\/)/.test(u)) return u;
  return '';
}

// Turns admin-entered plain text into safe HTML: paragraphs, line breaks,
// **bold**, *italic* and [links](https://...).
export function formatText(text) {
  const paragraphs = String(text || '').trim().split(/\n\s*\n/);
  return raw(
    paragraphs
      .filter(Boolean)
      .map((p) => {
        let s = esc(p);
        s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
        s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => {
          const decoded = href.replace(/&amp;/g, '&');
          const safe = safeUrl(decoded);
          const external = /^https?:/i.test(safe);
          return `<a href="${esc(safe)}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
        });
        return `<p>${s.replace(/\n/g, '<br>')}</p>`;
      })
      .join('')
  );
}

export function mount(target, content) {
  const node = typeof target === 'string' ? document.querySelector(target) : target;
  node.innerHTML = renderValue(content);
  return node;
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (method !== 'GET') opts.headers['X-LAB-CSRF'] = '1';
  if (form) opts.body = form;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const err = new Error((isJson && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function toast(message, type = 'info', ms = 3500) {
  const region = document.getElementById('toast-region');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  region.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// Small DOM builder used by the admin editors.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') node.value = v;
    else if (k === 'checked') node.checked = Boolean(v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function openDialog(title, bodyNode, { onClose } = {}) {
  const dialog = el('dialog');
  const close = () => dialog.close();
  dialog.append(
    el('div', { class: 'dialog-body' },
      el('div', { class: 'dialog-head' },
        el('h2', { text: title }),
        el('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close, text: '✕' })
      ),
      bodyNode
    )
  );
  dialog.addEventListener('close', () => {
    dialog.remove();
    onClose?.();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  document.body.appendChild(dialog);
  dialog.showModal();
  return { dialog, close };
}

export function confirmDialog(message, { confirmLabel = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const body = el('div', {},
      el('p', { text: message }),
      el('div', { class: 'btn-row' },
        el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, text: confirmLabel, onclick: () => { result = true; d.close(); } }),
        el('button', { class: 'btn btn-outline', text: 'Cancel', onclick: () => d.close() })
      )
    );
    const d = openDialog('Are you sure?', body, { onClose: () => resolve(result) });
  });
}

const LONDON = 'Europe/London';

export function formatDate(ymd, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });
}

// SQLite datetime('now') values are UTC without a zone marker.
export function formatDateTime(sqlUtc, opts = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) {
  if (!sqlUtc) return '';
  const d = new Date(sqlUtc.replace(' ', 'T') + (sqlUtc.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleString('en-GB', { timeZone: LONDON, ...opts });
}

export function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')}${suffix}`;
}

export function todayLondon() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: LONDON, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

export function formError(form, message) {
  const box = form.querySelector('.form-error');
  if (box) box.textContent = message || '';
}

export function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export async function withBusy(button, fn) {
  const label = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = 'Please wait…';
  }
  try {
    return await fn();
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = label;
    }
  }
}
