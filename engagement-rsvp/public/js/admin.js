// Admin area: overview, guest list, replies log, website editors and settings.

import { api, el, toast, confirmDialog, openDialog, longDate, daysUntil, formatDateTime, withBusy, safeImg } from './lib.js';
import { C, navigate, reloadContent } from './app.js';

let me = null;

const TABS = [
  { path: '/admin', label: 'Overview' },
  { path: '/admin/guests', label: 'Guest list' },
  { path: '/admin/log', label: 'Replies log' },
  { path: '/admin/website', label: 'Edit website' },
  { path: '/admin/settings', label: 'Settings' },
];

export async function render(path, main) {
  document.title = `Admin · ${C.site.coupleNames}`;
  if (!me) me = (await api('/api/auth/me')).admin;
  if (!me) return loginPage(main);
  const shell = el('section', { class: 'admin-shell' });
  const container = el('div', { class: 'container wide' });
  const active = TABS.slice().reverse().find((t) => path === t.path || path.startsWith(`${t.path}/`)) || TABS[0];
  container.append(el('ul', { class: 'admin-tabs' }, TABS.map((t) => el('li', {}, el('a', { href: t.path, 'aria-current': t === active ? 'page' : null, text: t.label })))));
  const view = el('div', {}, el('div', { class: 'page-loading' }, el('div', { class: 'spinner' })));
  container.append(view);
  shell.append(container);
  main.replaceChildren(shell);
  window.scrollTo(0, 0);
  try {
    const m = path.match(/^\/admin\/guests\/(\d+|new)$/);
    const w = path.match(/^\/admin\/website\/(\w+)$/);
    if (path === '/admin') await overviewPage(view);
    else if (path === '/admin/guests') await guestListPage(view);
    else if (m) await householdPage(view, m[1]);
    else if (path === '/admin/log') await logPage(view);
    else if (path === '/admin/website') websiteMenu(view);
    else if (w && EDITORS[w[1]]) contentEditor(view, w[1]);
    else if (path === '/admin/settings') await settingsPage(view);
    else view.replaceChildren(el('p', { text: 'Page not found.' }));
  } catch (err) {
    if (err.status === 401) {
      me = null;
      return loginPage(main);
    }
    view.replaceChildren(el('div', { class: 'alert bad', text: err.message }));
  }
}

// ---------- login ----------

function loginPage(main) {
  const emailInput = el('input', { type: 'email', id: 'login-email', autocomplete: 'username', required: true, 'data-autofocus': true });
  const password = el('input', { type: 'password', id: 'login-password', autocomplete: 'current-password', required: true });
  const error = el('div', { class: 'form-error', role: 'alert' });
  const button = el('button', { class: 'btn btn-block', type: 'submit', text: 'Log in' });
  const form = el('form', { class: 'card' },
    el('div', { class: 'field' }, el('label', { for: 'login-email', text: 'Email' }), emailInput),
    el('div', { class: 'field' }, el('label', { for: 'login-password', text: 'Password' }), password),
    error, button
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    withBusy(button, async () => {
      try {
        me = (await api('/api/auth/login', { method: 'POST', body: { email: emailInput.value, password: password.value } })).admin;
        navigate(location.pathname, { replace: true });
      } catch (err) {
        error.textContent = err.message;
      }
    });
  });
  main.replaceChildren(el('section', { class: 'page' }, el('div', { class: 'container', style: 'max-width:480px' },
    el('div', { class: 'page-head' }, el('h1', { text: 'Admin login' })), form)));
  emailInput.focus();
}

// ---------- shared bits ----------

const STATUS_TEXT = { replied: 'Replied', waiting: 'Not replied yet', overdue: 'Overdue: chase' };
const statusBadge = (s) => el('span', { class: `badge ${s}`, text: STATUS_TEXT[s] });

function guestLine(guests) {
  return el('div', { class: 'hh-guests' }, guests.map((g, i) => [
    i ? ', ' : '',
    el('span', { class: g.attending === true ? 'yes' : g.attending === false ? 'no' : '', text: `${g.attending === true ? '✓ ' : ''}${g.name}${g.isPlusOne ? ' (guest)' : ''}${g.isChild ? ' (child)' : ''}` }),
  ]));
}

function deadlineText(deadline) {
  if (!deadline) return null;
  const days = daysUntil(deadline);
  if (days > 1) return `RSVP deadline: ${longDate(deadline)} (${days} days left)`;
  if (days === 1) return `RSVP deadline: tomorrow, ${longDate(deadline)}`;
  if (days === 0) return `RSVP deadline: today, ${longDate(deadline)}`;
  return `RSVP deadline passed on ${longDate(deadline)} (${-days} day${days === -1 ? '' : 's'} ago)`;
}

function householdCard(h) {
  return el('a', { class: `hh ${h.status}`, href: `/admin/guests/${h.id}` },
    el('div', { class: 'hh-top' }, el('span', { class: 'hh-name', text: h.name }), statusBadge(h.status)),
    guestLine(h.guests),
    el('div', { class: 'muted', style: 'font-size:0.9rem' },
      h.respondedAt ? `Replied ${formatDateTime(h.respondedAt)}${h.responseCount > 1 ? ` · changed ${h.responseCount - 1} time${h.responseCount > 2 ? 's' : ''}, last ${formatDateTime(h.updatedAt)}` : ''}` : '',
      !h.respondedAt && h.contactPhone ? `📞 ${h.contactPhone}` : '',
      !h.respondedAt && h.chasedAt ? ` · Chased ${formatDateTime(h.chasedAt, { day: 'numeric', month: 'short' })}` : ''
    )
  );
}

// ---------- overview ----------

async function overviewPage(view) {
  const data = await api('/api/admin/overview');
  const s = data.stats;
  const notReplied = data.households.filter((h) => h.status !== 'replied');
  const parts = [];

  parts.push(el('h1', { text: `Hello${me.name ? `, ${me.name}` : ''}` }));
  if (!data.deadline) parts.push(el('div', { class: 'alert warn' }, 'No RSVP deadline set yet. ', el('a', { href: '/admin/website/rsvp', text: 'Set the deadline' })));
  else parts.push(el('div', { class: `alert ${data.deadlinePassed ? 'bad' : 'good'}`, text: deadlineText(data.deadline) }));
  if (!data.open) parts.push(el('div', { class: 'alert warn' }, 'RSVPs are switched off, so guests cannot reply. ', el('a', { href: '/admin/website/rsvp', text: 'Change this' })));
  if (!data.email.provider) parts.push(el('div', { class: 'alert warn' }, 'Email updates are not set up yet, so you will not get emails when people reply. ', el('a', { href: '/admin/settings', text: 'See Settings' })));
  else if (data.email.lastError) parts.push(el('div', { class: 'alert bad' }, `The last update email failed: ${data.email.lastError} `, el('a', { href: '/admin/settings', text: 'Settings' })));

  parts.push(el('div', { class: 'stat-grid' },
    stat(s.coming, 'Coming', 'good', `${s.comingAdults} adult${s.comingAdults === 1 ? '' : 's'}, ${s.comingChildren} child${s.comingChildren === 1 ? '' : 'ren'}${s.extraGuests ? `, incl. ${s.extraGuests} extra guest${s.extraGuests === 1 ? '' : 's'}` : ''}`),
    stat(s.notComing, 'Not coming'),
    stat(s.noReply, 'Guests yet to reply'),
    stat(`${s.replied}/${s.households}`, 'Invitations replied'),
    stat(s.overdue, 'Overdue: need chasing', s.overdue ? 'bad' : '')
  ));

  parts.push(el('div', { class: 'btn-row', style: 'margin:0 0 26px' },
    el('a', { class: 'btn', href: '/admin/guests/new', text: '+ Add a family or guest' }),
    el('a', { class: 'btn btn-outline', href: '/api/admin/export.csv', download: true, text: 'Download spreadsheet' })
  ));

  if (notReplied.length) {
    const overdue = notReplied.filter((h) => h.status === 'overdue');
    parts.push(el('h2', { text: overdue.length ? `Need chasing (${overdue.length})` : `Not replied yet (${notReplied.length})` }));
    if (overdue.length) parts.push(el('p', { class: 'muted', text: 'The deadline has passed and these invitations have no reply. Tap one to see their details, then mark them as chased.' }));
    parts.push(el('div', { class: 'hh-list', style: 'margin-bottom:28px' }, (overdue.length ? overdue : notReplied).map(householdCard)));
  } else if (data.households.length) {
    parts.push(el('div', { class: 'alert good', text: 'Everyone has replied! 🎉' }));
  } else {
    parts.push(el('div', { class: 'card' }, el('h2', { text: 'Start your guest list' }), el('p', { text: 'Add each family or group you are inviting. Anyone named on an invitation can then find it on the RSVP page by typing their name.' }), el('a', { class: 'btn', href: '/admin/guests', text: 'Go to the guest list' })));
  }

  if (data.recent.length) {
    parts.push(el('h2', { text: 'Latest replies' }), ...data.recent.map(logItem), el('a', { href: '/admin/log', text: 'See every reply and change →' }));
  }
  view.replaceChildren(...parts);
}

function stat(n, label, kind = '', note = '') {
  return el('div', { class: `stat ${kind}` }, el('div', { class: 'n', text: String(n) }), el('div', { class: 'l', text: label }), note ? el('div', { class: 'muted', style: 'font-size:0.85rem', text: note }) : null);
}

// ---------- guest list ----------

let listFilter = { q: '', status: 'all' };

async function guestListPage(view) {
  const { households, stats } = await api('/api/admin/households');
  const search = el('input', { type: 'text', placeholder: 'Search names…', 'aria-label': 'Search names', value: listFilter.q });
  const filter = el('select', { 'aria-label': 'Show' },
    [['all', 'Show all'], ['replied', 'Replied'], ['notreplied', 'Not replied'], ['overdue', 'Overdue'], ['coming', 'Has someone coming'], ['notcoming', 'Nobody coming']]
      .map(([v, t]) => el('option', { value: v, text: t })));
  filter.value = listFilter.status;
  const list = el('div', { class: 'hh-list' });
  const count = el('p', { class: 'muted' });

  const draw = () => {
    listFilter = { q: search.value.trim().toLowerCase(), status: filter.value };
    const shown = households.filter((h) => {
      const f = listFilter.status;
      if (f === 'replied' && h.status !== 'replied') return false;
      if (f === 'notreplied' && h.status === 'replied') return false;
      if (f === 'overdue' && h.status !== 'overdue') return false;
      if (f === 'coming' && !h.guests.some((g) => g.attending === true)) return false;
      if (f === 'notcoming' && (h.status !== 'replied' || h.guests.some((g) => g.attending === true))) return false;
      if (!listFilter.q) return true;
      return h.name.toLowerCase().includes(listFilter.q) || h.guests.some((g) => g.name.toLowerCase().includes(listFilter.q));
    });
    count.textContent = `Showing ${shown.length} of ${households.length} invitations (${stats.invited} guests invited).`;
    list.replaceChildren(...(shown.length ? shown.map(householdCard) : [el('p', { text: households.length ? 'No invitations match.' : 'No guests yet. Add your first family above.' })]));
  };
  search.addEventListener('input', draw);
  filter.addEventListener('change', draw);
  draw();

  view.replaceChildren(
    el('h1', { text: 'Guest list' }),
    el('p', { class: 'muted', text: 'Each invitation is a family or group who reply together. Anyone named on it can find it by typing their name on the RSVP page.' }),
    el('div', { class: 'btn-row', style: 'margin:0 0 18px' },
      el('a', { class: 'btn', href: '/admin/guests/new', text: '+ Add a family or guest' }),
      el('button', { class: 'btn btn-outline', type: 'button', text: 'Add many at once', onclick: bulkDialog }),
      el('a', { class: 'btn btn-outline', href: '/api/admin/export.csv', download: true, text: 'Download spreadsheet' })
    ),
    el('div', { class: 'toolbar' }, search, filter),
    count,
    list
  );
}

function bulkDialog() {
  const text = el('textarea', { id: 'bulk-text', rows: 10, placeholder: 'Patel family: Raj Patel, Priya Patel, Anil Patel (child)\nSunita Shah, Vikram Shah +1\nJohn Smith' });
  const error = el('div', { class: 'form-error', role: 'alert' });
  const button = el('button', { class: 'btn', type: 'button', text: 'Add to guest list' });
  const body = el('div', {},
    el('p', { text: 'Type one invitation (family or group) per line. Separate names with commas.' }),
    el('ul', {},
      el('li', {}, 'Start with a family name and a colon if you like: ', el('code', { text: 'Patel family: Raj Patel, Priya Patel' })),
      el('li', {}, 'Add ', el('code', { text: '(child)' }), ' after a child’s name.'),
      el('li', {}, 'End with ', el('code', { text: '+1' }), ' or ', el('code', { text: '+2' }), ' to let them bring extra guests.')
    ),
    el('label', { for: 'bulk-text', text: 'Guest list' }), text, error, el('div', { class: 'btn-row' }, button)
  );
  const d = openDialog('Add many at once', body);
  text.focus();
  button.addEventListener('click', () => withBusy(button, async () => {
    try {
      const r = await api('/api/admin/households/bulk', { method: 'POST', body: { text: text.value } });
      d.close();
      toast(`Added ${r.added} invitation${r.added === 1 ? '' : 's'} (${r.guests} guests).`, 'success');
      for (const w of r.warnings) toast(w, 'info', 8000);
      navigate('/admin/guests', { replace: true });
    } catch (err) {
      error.textContent = err.message;
    }
  }));
}

// ---------- one invitation ----------

async function householdPage(view, id) {
  const isNew = id === 'new';
  const data = isNew ? { household: { name: '', guests: [{ name: '', isChild: false }], plusOnes: 0, contactPhone: '', contactEmail: '', notes: '' }, log: [] } : await api(`/api/admin/households/${id}`);
  const h = data.household;
  const parts = [el('p', {}, el('a', { href: '/admin/guests', text: '← Guest list' }))];

  if (!isNew) {
    parts.push(el('div', { class: 'hh-top', style: 'margin-bottom:10px' }, el('h1', { style: 'margin:0', text: h.name }), statusBadge(h.status)));
    parts.push(replyCard(h));
  } else {
    parts.push(el('h1', { text: 'Add a family or guest' }));
  }
  parts.push(detailsForm(h, isNew));
  if (!isNew && data.log.length) parts.push(el('h2', { text: 'History' }), ...data.log.map(logItem));
  if (!isNew) {
    parts.push(el('div', { class: 'btn-row', style: 'margin-top:30px' }, el('button', {
      class: 'btn btn-danger', type: 'button', text: 'Delete this invitation',
      onclick: async () => {
        if (!(await confirmDialog(`Delete ${h.name} and their reply from the guest list? This can't be undone.`, { confirmLabel: 'Delete', danger: true }))) return;
        await api(`/api/admin/households/${h.id}`, { method: 'DELETE' });
        toast('Deleted.', 'success');
        navigate('/admin/guests');
      },
    })));
  }
  view.replaceChildren(...parts);
}

function replyCard(h) {
  const card = el('div', { class: 'card' }, el('h2', { text: 'Their reply' }));
  if (h.respondedAt) {
    card.append(el('p', { class: 'muted', text: `First replied ${formatDateTime(h.respondedAt)}${h.responseCount > 1 ? `, last changed ${formatDateTime(h.updatedAt)}` : ''}${h.respondedBy?.startsWith('admin:') ? ` (last edit by ${h.respondedBy.slice(6)})` : ''}.` }));
    const qs = C.rsvp.questions;
    card.append(el('ul', { class: 'summary-list' }, h.guests.map((g) => el('li', {},
      el('div', { style: 'display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap' },
        el('strong', { text: g.name + (g.isPlusOne ? ' (extra guest)' : '') }),
        el('span', { class: `badge ${g.attending === true ? 'yes' : g.attending === false ? 'no' : 'none'}`, text: g.attending === true ? 'Coming' : g.attending === false ? 'Not coming' : 'No reply' })),
      qs.filter((q) => q.scope === 'guest' && g.answers[q.id]).map((q) => el('div', { class: 'muted', text: `${q.label}: ${g.answers[q.id]}` }))
    ))));
    for (const q of qs.filter((q) => q.scope === 'household' && h.answers[q.id])) card.append(el('p', {}, el('strong', { text: `${q.label}: ` }), h.answers[q.id]));
  } else {
    card.append(el('p', { text: h.status === 'overdue' ? 'No reply, and the deadline has passed.' : 'No reply yet.' }));
    if (h.contactPhone || h.contactEmail) card.append(el('p', {}, h.contactPhone ? el('a', { href: `tel:${h.contactPhone.replace(/[^\d+]/g, '')}`, text: `📞 ${h.contactPhone}` }) : '', h.contactPhone && h.contactEmail ? ' · ' : '', h.contactEmail ? el('a', { href: `mailto:${h.contactEmail}`, text: `✉️ ${h.contactEmail}` }) : ''));
    card.append(el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: Boolean(h.chasedAt), onchange: async (e) => { await api(`/api/admin/households/${h.id}/chased`, { method: 'POST', body: { chased: e.target.checked } }); toast(e.target.checked ? 'Marked as chased.' : 'Unmarked.', 'success'); } }),
      h.chasedAt ? `Chased (${formatDateTime(h.chasedAt, { day: 'numeric', month: 'short' })})` : 'I have chased them'));
  }
  card.append(el('div', { class: 'btn-row' },
    el('button', { class: 'btn', type: 'button', text: h.respondedAt ? 'Edit their reply' : 'Enter a reply for them', onclick: () => replyEditor(h) }),
    h.respondedAt ? el('button', { class: 'btn btn-outline', type: 'button', text: 'Clear reply', onclick: async () => {
      if (!(await confirmDialog(`Clear ${h.name}'s reply? They will show as not replied, and can reply again.`, { confirmLabel: 'Clear reply', danger: true }))) return;
      await api(`/api/admin/households/${h.id}/reply`, { method: 'DELETE' });
      toast('Reply cleared.', 'success');
      navigate(location.pathname, { replace: true });
    } }) : null
  ));
  return card;
}

// Admins can enter or change a reply (e.g. when someone phones instead).
function replyEditor(h) {
  const qs = C.rsvp.questions;
  const guestQs = qs.filter((q) => q.scope === 'guest');
  const houseQs = qs.filter((q) => q.scope === 'household');
  const invited = h.guests.filter((g) => !g.isPlusOne);
  const state = {
    guests: invited.map((g) => ({ id: g.id, name: g.name, attending: g.attending, answers: { ...g.answers } })),
    plusOnes: h.guests.filter((g) => g.isPlusOne).map((g) => ({ name: g.name, answers: { ...g.answers } })),
    answers: { ...h.answers },
  };
  const qInput = (q, answers) => {
    let input;
    if (q.type === 'choice' || q.type === 'yesno') {
      input = el('select', {}, el('option', { value: '', text: '—' }), (q.type === 'yesno' ? ['Yes', 'No'] : q.options).map((o) => el('option', { value: o, text: o })));
    } else input = el(q.type === 'textarea' ? 'textarea' : 'input', { type: 'text', rows: 2 });
    input.value = answers[q.id] || '';
    input.addEventListener('input', () => { if (input.value.trim()) answers[q.id] = input.value.trim(); else delete answers[q.id]; });
    input.addEventListener('change', () => { if (input.value.trim()) answers[q.id] = input.value.trim(); else delete answers[q.id]; });
    return el('label', { style: 'font-weight:400' }, el('span', { class: 'label', text: q.label }), input);
  };
  const plusBox = el('div', {});
  const drawPlus = () => {
    plusBox.replaceChildren(
      ...state.plusOnes.map((p, i) => {
        const name = el('input', { type: 'text', value: p.name, 'aria-label': 'Extra guest name' });
        name.addEventListener('input', () => { p.name = name.value; });
        return el('div', { class: 'editor-list-item' }, el('span', { class: 'label', text: 'Extra guest name' }), name, guestQs.map((q) => qInput(q, p.answers)),
          el('button', { class: 'link-btn', type: 'button', text: 'Remove', onclick: () => { state.plusOnes.splice(i, 1); drawPlus(); } }));
      }),
      state.plusOnes.length < h.plusOnes ? el('button', { class: 'btn btn-outline btn-small', type: 'button', text: '+ Add extra guest', onclick: () => { state.plusOnes.push({ name: '', answers: {} }); drawPlus(); } }) : ''
    );
  };
  drawPlus();
  const error = el('div', { class: 'form-error', role: 'alert' });
  const save = el('button', { class: 'btn', type: 'button', text: 'Save reply' });
  const body = el('div', {},
    state.guests.map((g) => {
      const sel = el('select', { 'aria-label': `${g.name} reply` }, el('option', { value: '', text: 'Choose…' }), el('option', { value: 'yes', text: 'Coming' }), el('option', { value: 'no', text: 'Not coming' }));
      sel.value = g.attending === true ? 'yes' : g.attending === false ? 'no' : '';
      sel.addEventListener('change', () => { g.attending = sel.value === 'yes' ? true : sel.value === 'no' ? false : null; });
      return el('div', { class: 'editor-list-item' }, el('strong', { text: g.name }), sel, guestQs.map((q) => qInput(q, g.answers)));
    }),
    h.plusOnes ? [el('h3', { text: `Extra guests (up to ${h.plusOnes})` }), plusBox] : null,
    houseQs.map((q) => qInput(q, state.answers)),
    error,
    el('div', { class: 'btn-row' }, save)
  );
  const d = openDialog(`Reply for ${h.name}`, body);
  save.addEventListener('click', () => withBusy(save, async () => {
    try {
      await api(`/api/admin/households/${h.id}/reply`, {
        method: 'PUT',
        body: { guests: state.guests.map((g) => ({ id: g.id, attending: g.attending, answers: g.answers })), plusOnes: state.plusOnes.filter((p) => p.name.trim()), answers: state.answers },
      });
      d.close();
      toast('Reply saved.', 'success');
      navigate(location.pathname, { replace: true });
    } catch (err) {
      error.textContent = err.message;
    }
  }));
}

function detailsForm(h, isNew) {
  const guests = h.guests.filter((g) => !g.isPlusOne).map((g) => ({ ...g }));
  const rows = el('div', {});
  const drawRows = (focusLast = false) => {
    rows.replaceChildren(...guests.map((g, i) => {
      const name = el('input', { type: 'text', value: g.name, 'aria-label': `Guest ${i + 1} full name`, placeholder: 'Full name, e.g. Priya Sharma', autocapitalize: 'words' });
      name.addEventListener('input', () => { g.name = name.value; });
      return el('div', { class: 'guest-row' }, name,
        el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: g.isChild, onchange: (e) => { g.isChild = e.target.checked; } }), 'Child'),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': `Remove ${g.name || 'guest'}`, text: '✕', onclick: () => { guests.splice(i, 1); drawRows(); } }));
    }));
    if (focusLast) rows.querySelector('.guest-row:last-child input')?.focus();
  };
  drawRows();
  const field = (label, input, help) => el('div', { class: 'field' }, el('label', { for: input.id, text: label }), help ? el('span', { class: 'help', text: help }) : null, input);
  const nameInput = el('input', { type: 'text', id: 'hh-name', value: h.name, placeholder: 'e.g. The Patel family' });
  const plusInput = el('input', { type: 'number', id: 'hh-plus', min: 0, max: 20, value: String(h.plusOnes || 0) });
  const phone = el('input', { type: 'tel', id: 'hh-phone', value: h.contactPhone });
  const emailInput = el('input', { type: 'email', id: 'hh-email', value: h.contactEmail });
  const notes = el('textarea', { id: 'hh-notes', rows: 3 });
  notes.value = h.notes;
  const error = el('div', { class: 'form-error', role: 'alert' });
  const save = el('button', { class: 'btn', type: 'button', text: isNew ? 'Add to guest list' : 'Save details' });
  save.addEventListener('click', () => withBusy(save, async () => {
    const body = { name: nameInput.value, guests: guests.map((g) => ({ id: g.id, name: g.name, isChild: g.isChild })), plusOnes: Number(plusInput.value) || 0, contactPhone: phone.value, contactEmail: emailInput.value, notes: notes.value };
    try {
      const r = await api(isNew ? '/api/admin/households' : `/api/admin/households/${h.id}`, { method: isNew ? 'POST' : 'PUT', body });
      toast(isNew ? 'Added to the guest list.' : 'Saved.', 'success');
      for (const w of r.warnings || []) toast(w, 'info', 8000);
      navigate(isNew ? `/admin/guests/${r.id}` : location.pathname, { replace: true });
    } catch (err) {
      error.textContent = err.message;
    }
  }));
  return el('div', { class: 'card' },
    el('h2', { text: isNew ? 'Who is on this invitation?' : 'Invitation details' }),
    el('span', { class: 'label', text: 'Guests on this invitation' }),
    el('span', { class: 'help', text: 'Type each person’s full name as they are likely to type it. Any of them can reply for everyone on the invitation.' }),
    rows,
    el('button', { class: 'btn btn-outline btn-small', type: 'button', text: '+ Add another person', onclick: () => { guests.push({ name: '', isChild: false }); drawRows(true); } }),
    el('div', { style: 'height:20px' }),
    el('div', { class: 'grid-2' },
      field('Invitation name (optional)', nameInput, 'Shown in your lists and greeting, e.g. "The Patel family". Left blank, the guests’ names are used.'),
      field('Extra guests they may bring', plusInput, '0 means only the people named above.'),
      field('Phone (for chasing)', phone),
      field('Email', emailInput)
    ),
    field('Private notes (only admins see these)', notes),
    error,
    save
  );
}

// ---------- log ----------

const ACTION_TEXT = { submitted: 'Replied', updated: 'Changed their reply', admin_edit: 'Reply edited by', cleared: 'Reply cleared by' };

function logItem(l) {
  const who = l.action === 'admin_edit' || l.action === 'cleared' ? ` ${l.actor}` : '';
  return el('div', { class: `log-item ${l.action}` },
    el('div', {},
      l.householdId ? el('a', { href: `/admin/guests/${l.householdId}`, style: 'font-weight:700', text: l.householdName }) : el('strong', { text: `${l.householdName} (deleted)` }),
      ` · ${ACTION_TEXT[l.action] || l.action}${who}`),
    el('div', { class: 'when', text: `${formatDateTime(l.createdAt, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${l.summary}` }),
    l.changes.length ? el('ul', {}, l.changes.map((c) => el('li', { text: c }))) : null
  );
}

async function logPage(view) {
  const { log } = await api('/api/admin/log');
  const search = el('input', { type: 'text', placeholder: 'Search by name…', 'aria-label': 'Search by name' });
  const list = el('div', {});
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const shown = log.filter((l) => !q || l.householdName.toLowerCase().includes(q) || (l.snapshot.guests || []).some((g) => g.name.toLowerCase().includes(q)));
    list.replaceChildren(...(shown.length ? shown.map(logItem) : [el('p', { text: log.length ? 'Nothing matches.' : 'No replies yet.' })]));
  };
  search.addEventListener('input', draw);
  draw();
  view.replaceChildren(
    el('h1', { text: 'Replies log' }),
    el('p', { class: 'muted', text: 'Every reply and every change, newest first.' }),
    el('div', { class: 'toolbar' }, search, el('a', { class: 'btn btn-outline btn-small', href: '/api/admin/export.csv', download: true, text: 'Download spreadsheet' })),
    list
  );
}

// ---------- website editors ----------

const FORMAT_HELP = 'Leave a blank line between paragraphs. **bold**, - at the start of a line for a bullet list, [link text](https://…) for a link.';
const pageFields = [
  { key: 'label', label: 'Menu name' },
  { key: 'visible', type: 'checkbox', label: 'Show this page on the website' },
  { key: 'heading', label: 'Page heading' },
];

const EDITORS = {
  site: {
    title: 'Names, date & contact',
    view: '/',
    fields: [
      { key: 'coupleNames', label: 'Your names', help: 'Shown at the top of every page.' },
      { key: 'eventTitle', label: 'Event name' },
      { key: 'eventDate', type: 'date', label: 'Date of the party' },
      { key: 'eventTime', label: 'Time', help: 'e.g. 6:00pm until late' },
      { key: 'contactText', type: 'textarea', label: 'Contact message', help: 'Shown at the bottom of every page and when someone can’t find their name.' },
      { key: 'contactPhone', label: 'Contact phone number' },
      { key: 'contactEmail', label: 'Contact email (shown to guests)' },
      { key: 'footerNote', label: 'Sign-off at the bottom of each page' },
      { key: 'accentColor', type: 'color', label: 'Main colour (buttons and links)', help: 'Choose a dark colour so text on buttons is easy to read.' },
      { key: 'backgroundColor', type: 'color', label: 'Background colour' },
    ],
  },
  home: {
    title: 'Home page',
    view: '/',
    fields: [
      { key: 'label', label: 'Menu name' },
      { key: 'image', type: 'image', label: 'Main photo' },
      { key: 'kicker', label: 'Small line above your names' },
      { key: 'heading', label: 'Main heading' },
      { key: 'subheading', label: 'Line under the heading' },
      { key: 'intro', type: 'textarea', label: 'Welcome message', help: FORMAT_HELP },
      { key: 'buttonText', label: 'RSVP button text' },
      { key: 'showCountdown', type: 'checkbox', label: 'Show "days to go" countdown' },
    ],
  },
  story: {
    title: 'Our story',
    view: '/our-story',
    fields: [
      ...pageFields,
      { key: 'intro', type: 'textarea', label: 'Introduction', help: FORMAT_HELP },
      { key: 'chapters', type: 'list', label: 'Chapters', itemName: 'chapter', fields: [
        { key: 'title', label: 'Title' },
        { key: 'when', label: 'When (optional)', help: 'e.g. Summer 2019' },
        { key: 'text', type: 'textarea', label: 'Text', help: FORMAT_HELP },
        { key: 'image', type: 'image', label: 'Photo (optional)' },
      ] },
    ],
  },
  venue: {
    title: 'Venue',
    view: '/venue',
    fields: [
      ...pageFields,
      { key: 'name', label: 'Venue name' },
      { key: 'address', type: 'textarea', label: 'Address', help: 'One line per row.' },
      { key: 'postcode', label: 'Postcode', help: 'Shown large, for sat navs.' },
      { key: 'image', type: 'image', label: 'Photo of the venue' },
      { key: 'text', type: 'textarea', label: 'About the venue', help: FORMAT_HELP },
      { key: 'phone', label: 'Venue phone number' },
      { key: 'website', label: 'Venue website' },
      { key: 'showMap', type: 'checkbox', label: 'Show a map' },
    ],
  },
  travel: {
    title: 'Getting there & parking',
    view: '/getting-there',
    fields: [
      ...pageFields,
      { key: 'intro', type: 'textarea', label: 'Introduction', help: FORMAT_HELP },
      { key: 'sections', type: 'list', label: 'Sections', itemName: 'section', fields: [
        { key: 'title', label: 'Heading', help: 'e.g. Parking' },
        { key: 'text', type: 'textarea', label: 'Details', help: FORMAT_HELP },
      ] },
    ],
  },
  faq: {
    title: 'FAQ',
    view: '/faq',
    fields: [
      ...pageFields,
      { key: 'intro', type: 'textarea', label: 'Introduction (optional)' },
      { key: 'items', type: 'list', label: 'Questions', itemName: 'question', fields: [
        { key: 'q', label: 'Question' },
        { key: 'a', type: 'textarea', label: 'Answer', help: FORMAT_HELP },
      ] },
    ],
  },
  rsvp: {
    title: 'RSVP page & questions',
    view: '/rsvp',
    fields: [
      { key: 'open', type: 'checkbox', label: 'RSVPs are open (guests can reply)' },
      { key: 'deadline', type: 'date', label: 'RSVP deadline', help: 'Guests can change their reply until the end of this day. After it, people who haven’t replied are highlighted for chasing.' },
      { key: 'allowLateReplies', type: 'checkbox', label: 'Let people who haven’t replied still reply after the deadline' },
      { key: 'label', label: 'Menu name' },
      { key: 'heading', label: 'Page heading' },
      { key: 'intro', type: 'textarea', label: 'Introduction' },
      { key: 'questions', type: 'list', label: 'Questions', itemName: 'question', help: '"For each guest who is coming" questions are asked once per person (e.g. dietary needs). "Once per invitation" questions are asked once for the whole family.', fields: [
        { key: 'label', label: 'Question' },
        { key: 'help', label: 'Hint under the question (optional)' },
        { key: 'scope', type: 'select', label: 'Ask', options: [['guest', 'For each guest who is coming'], ['household', 'Once per invitation']] },
        { key: 'type', type: 'select', label: 'Answer type', options: [['text', 'Short answer'], ['textarea', 'Long answer'], ['choice', 'Pick one option'], ['yesno', 'Yes or no']] },
        { key: 'options', type: 'lines', label: 'Options (for "Pick one option": one per line)' },
        { key: 'required', type: 'checkbox', label: 'Must be answered' },
      ] },
      { key: 'lookupLabel', label: 'Name box label' },
      { key: 'lookupHelp', label: 'Name box hint' },
      { key: 'notFoundText', type: 'textarea', label: 'Message when a name isn’t found' },
      { key: 'attendingLabel', label: 'Button: coming' },
      { key: 'notAttendingLabel', label: 'Button: not coming' },
      { key: 'plusOnesText', type: 'textarea', label: 'Message about extra guests' },
      { key: 'thankYouComing', type: 'textarea', label: 'Thank you message (someone is coming)' },
      { key: 'thankYouNotComing', type: 'textarea', label: 'Thank you message (nobody coming)' },
      { key: 'closedText', type: 'textarea', label: 'Message after the deadline' },
      { key: 'notOpenText', type: 'textarea', label: 'Message when RSVPs are switched off' },
    ],
  },
};

function websiteMenu(view) {
  view.replaceChildren(
    el('h1', { text: 'Edit website' }),
    el('p', { class: 'muted', text: 'Choose a part of the website to change. Changes show on the site as soon as you save.' }),
    el('div', { class: 'hh-list' }, Object.entries(EDITORS).map(([key, ed]) => el('a', { class: 'hh', href: `/admin/website/${key}` },
      el('span', { class: 'hh-name', text: ed.title }),
      el('span', { class: 'muted', text: key === 'rsvp' ? 'Deadline, questions and messages' : key === 'site' ? 'Your names, date, colours and contact details' : `The ${ed.title.toLowerCase()} page` })
    )))
  );
}

let uid = 0;

function imageInput(value, onChange) {
  const box = el('div', { class: 'image-field' });
  const file = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', class: 'hidden' });
  const draw = (url) => {
    const img = safeImg(url);
    box.replaceChildren(
      img ? el('img', { src: img, alt: '' }) : el('span', { class: 'muted', text: 'No photo' }),
      el('button', { class: 'btn btn-outline btn-small', type: 'button', text: img ? 'Change photo' : 'Upload photo', onclick: () => file.click() }),
      img ? el('button', { class: 'link-btn', type: 'button', text: 'Remove', onclick: () => { onChange(''); draw(''); } }) : '',
      file
    );
  };
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    const form = new FormData();
    form.append('file', file.files[0]);
    toast('Uploading…');
    try {
      const { url } = await api('/api/admin/upload', { method: 'POST', form });
      onChange(url);
      draw(url);
      toast('Photo uploaded. Remember to save.', 'success');
    } catch (err) {
      toast(err.message, 'error', 6000);
    }
    file.value = '';
  });
  draw(value);
  return box;
}

function fieldInput(spec, obj) {
  const id = `f${++uid}`;
  const set = (v) => { obj[spec.key] = v; };
  const help = spec.help ? el('span', { class: 'help', text: spec.help }) : null;
  const value = obj[spec.key];
  if (spec.type === 'checkbox') {
    return el('div', { class: 'field' }, el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: Boolean(value), onchange: (e) => set(e.target.checked) }), spec.label), help);
  }
  if (spec.type === 'image') return el('div', { class: 'field' }, el('span', { class: 'label', text: spec.label }), help, imageInput(value, set));
  if (spec.type === 'list') return listEditor(spec, obj);
  let input;
  if (spec.type === 'textarea') input = el('textarea', { id, rows: 4 });
  else if (spec.type === 'lines') input = el('textarea', { id, rows: 3 });
  else if (spec.type === 'select') input = el('select', { id }, spec.options.map(([v, t]) => el('option', { value: v, text: t })));
  else input = el('input', { id, type: spec.type === 'date' ? 'date' : spec.type === 'color' ? 'color' : 'text' });
  if (spec.type === 'color') input.style.cssText = 'width:90px;padding:4px;';
  input.value = spec.type === 'lines' ? (value || []).join('\n') : value ?? '';
  const update = () => set(spec.type === 'lines' ? input.value.split('\n').map((s) => s.trim()).filter(Boolean) : input.value);
  input.addEventListener('input', update);
  input.addEventListener('change', update);
  return el('div', { class: 'field' }, el('label', { for: id, text: spec.label }), help, input);
}

function listEditor(spec, obj) {
  const items = obj[spec.key];
  const box = el('div', { class: 'field' });
  const draw = () => {
    box.replaceChildren(
      el('h2', { text: spec.label, style: 'font-size:1.6rem' }),
      spec.help ? el('p', { class: 'muted', text: spec.help }) : '',
      ...items.map((item, i) => el('div', { class: 'editor-list-item' },
        spec.fields.map((f) => fieldInput(f, item)),
        el('div', { class: 'item-tools' },
          i > 0 ? el('button', { class: 'btn btn-outline btn-small', type: 'button', text: '↑ Move up', onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; draw(); } }) : '',
          i < items.length - 1 ? el('button', { class: 'btn btn-outline btn-small', type: 'button', text: '↓ Move down', onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; draw(); } }) : '',
          el('button', { class: 'btn btn-outline btn-small', type: 'button', text: `Remove this ${spec.itemName}`, onclick: () => { items.splice(i, 1); draw(); } })
        )
      )),
      el('button', { class: 'btn btn-outline', type: 'button', text: `+ Add a ${spec.itemName}`, onclick: () => {
        const blank = {};
        for (const f of spec.fields) blank[f.key] = f.type === 'checkbox' ? false : f.type === 'lines' ? [] : f.type === 'select' ? f.options[0][0] : '';
        items.push(blank);
        draw();
        box.querySelector('.editor-list-item:last-of-type input, .editor-list-item:last-of-type textarea')?.focus();
      } })
    );
  };
  draw();
  return box;
}

function contentEditor(view, section) {
  const ed = EDITORS[section];
  const data = structuredClone(C[section]);
  const save = el('button', { class: 'btn', type: 'button', text: 'Save changes' });
  save.addEventListener('click', () => withBusy(save, async () => {
    try {
      await api(`/api/admin/content/${section}`, { method: 'PUT', body: data });
      await reloadContent();
      toast('Saved. The website is updated.', 'success');
      navigate(location.pathname, { replace: true });
    } catch (err) {
      toast(err.message, 'error', 6000);
    }
  }));
  view.replaceChildren(
    el('p', {}, el('a', { href: '/admin/website', text: '← Edit website' })),
    el('h1', { text: ed.title }),
    el('div', { class: 'card' }, ed.fields.map((f) => fieldInput(f, data))),
    el('div', { class: 'sticky-save btn-row' }, save,
      el('a', { class: 'btn btn-outline', href: ed.view, target: '_blank', rel: 'noopener', text: 'View page' }),
      el('button', { class: 'link-btn', type: 'button', text: 'Reset to starter text', onclick: async () => {
        if (!(await confirmDialog(`Replace everything in "${ed.title}" with the starter text?`, { confirmLabel: 'Reset', danger: true }))) return;
        await api(`/api/admin/content/${section}/reset`, { method: 'POST' });
        await reloadContent();
        navigate(location.pathname, { replace: true });
      } })
    )
  );
}

// ---------- settings ----------

async function settingsPage(view) {
  const [notify, { admins }] = await Promise.all([api('/api/admin/notify'), api('/api/admin/admins')]);
  view.replaceChildren(
    el('h1', { text: 'Settings' }),
    emailCard(notify),
    adminsCard(admins),
    accountCard(),
    el('div', { class: 'card' },
      el('h2', { text: 'Backup' }),
      el('p', { text: 'Download everything (guest list, replies, log and website text) as one file. Keep it somewhere private.' }),
      el('div', { class: 'btn-row' },
        el('a', { class: 'btn btn-outline', href: '/api/admin/backup', download: true, text: 'Download a backup' }),
        el('a', { class: 'btn btn-outline', href: '/api/admin/export.csv', download: true, text: 'Download spreadsheet' }))
    ),
    el('button', { class: 'btn btn-outline', type: 'button', text: 'Log out', onclick: async () => { await api('/api/auth/logout', { method: 'POST' }); me = null; navigate('/'); } })
  );
}

function emailCard(notify) {
  const s = notify.email;
  const recipients = el('textarea', { id: 'notify-to', rows: 3 });
  recipients.value = notify.recipients.join('\n');
  const onEdit = el('input', { type: 'checkbox', checked: notify.onAdminEdit });
  const save = el('button', { class: 'btn', type: 'button', text: 'Save' });
  const test = el('button', { class: 'btn btn-outline', type: 'button', text: 'Send a test email' });
  save.addEventListener('click', () => withBusy(save, async () => {
    try {
      await api('/api/admin/notify', { method: 'PUT', body: { recipients: recipients.value.split(/[\n,]/).map((x) => x.trim()).filter(Boolean), onAdminEdit: onEdit.checked } });
      toast('Saved.', 'success');
    } catch (err) {
      toast(err.message, 'error', 6000);
    }
  }));
  test.addEventListener('click', () => withBusy(test, async () => {
    try {
      const r = await api('/api/admin/notify/test', { method: 'POST' });
      toast(`Test email sent to ${r.to.join(', ')}. Check your inbox (and spam).`, 'success', 7000);
    } catch (err) {
      toast(err.message, 'error', 9000);
    }
  }));
  return el('div', { class: 'card' },
    el('h2', { text: 'Email updates' }),
    el('p', { text: 'You get an email every time someone replies or changes their reply.' }),
    s.provider
      ? el('div', { class: `alert ${s.lastError ? 'bad' : 'good'}`, text: s.lastError ? `Email is set up (${s.provider}), but the last email failed: ${s.lastError}` : `Email is set up (sending with ${s.provider === 'resend' ? 'Resend' : 'Brevo'} from ${s.from}).` })
      : el('div', { class: 'alert warn', text: 'Email is not set up yet. Add a RESEND_API_KEY (or BREVO_API_KEY) in your hosting settings: see the README for the steps.' }),
    el('div', { class: 'field' }, el('label', { for: 'notify-to', text: 'Send updates to' }), el('span', { class: 'help', text: 'One email address per line. With Resend’s free plan (no domain of your own), only the address you signed up to Resend with will receive them.' }), recipients),
    el('label', { class: 'check' }, onEdit, 'Also email when an admin edits a reply'),
    el('div', { class: 'btn-row' }, save, test)
  );
}

function adminsCard(admins) {
  const emailInput = el('input', { type: 'email', id: 'new-admin-email' });
  const name = el('input', { type: 'text', id: 'new-admin-name' });
  const pass = el('input', { type: 'text', id: 'new-admin-pass', autocomplete: 'off' });
  const add = el('button', { class: 'btn', type: 'button', text: 'Add admin' });
  add.addEventListener('click', () => withBusy(add, async () => {
    try {
      await api('/api/admin/admins', { method: 'POST', body: { email: emailInput.value, name: name.value, password: pass.value } });
      toast('Admin added. Give them their password.', 'success');
      navigate(location.pathname, { replace: true });
    } catch (err) {
      toast(err.message, 'error', 6000);
    }
  }));
  return el('div', { class: 'card' },
    el('h2', { text: 'Admins' }),
    el('p', { class: 'muted', text: 'People who can log in here and see all replies.' }),
    el('ul', { class: 'summary-list' }, admins.map((a) => el('li', { style: 'display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap' },
      el('span', {}, el('strong', { text: a.name || a.email }), a.name ? ` · ${a.email}` : ''),
      a.id === me.id ? el('span', { class: 'muted', text: '(you)' }) : el('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Remove', onclick: async () => {
        if (!(await confirmDialog(`Remove admin access for ${a.email}?`, { confirmLabel: 'Remove', danger: true }))) return;
        await api(`/api/admin/admins/${a.id}`, { method: 'DELETE' });
        navigate(location.pathname, { replace: true });
      } })
    ))),
    el('h3', { text: 'Add an admin' }),
    el('div', { class: 'grid-2' },
      el('div', { class: 'field' }, el('label', { for: 'new-admin-name', text: 'Name' }), name),
      el('div', { class: 'field' }, el('label', { for: 'new-admin-email', text: 'Email' }), emailInput),
      el('div', { class: 'field' }, el('label', { for: 'new-admin-pass', text: 'Password (at least 8 characters)' }), pass)
    ),
    add
  );
}

function accountCard() {
  const name = el('input', { type: 'text', id: 'my-name', value: me.name || '' });
  const current = el('input', { type: 'password', id: 'my-current', autocomplete: 'current-password' });
  const next = el('input', { type: 'password', id: 'my-new', autocomplete: 'new-password' });
  const save = el('button', { class: 'btn', type: 'button', text: 'Save' });
  save.addEventListener('click', () => withBusy(save, async () => {
    try {
      await api('/api/admin/account', { method: 'POST', body: { name: name.value, currentPassword: current.value, newPassword: next.value } });
      me.name = name.value.trim();
      current.value = '';
      next.value = '';
      toast('Saved.', 'success');
    } catch (err) {
      toast(err.message, 'error', 6000);
    }
  }));
  return el('div', { class: 'card' },
    el('h2', { text: 'My account' }),
    el('p', { class: 'muted', text: `Logged in as ${me.email}` }),
    el('div', { class: 'grid-2' },
      el('div', { class: 'field' }, el('label', { for: 'my-name', text: 'Your name' }), name),
      el('div', {}),
      el('div', { class: 'field' }, el('label', { for: 'my-current', text: 'Current password' }), current),
      el('div', { class: 'field' }, el('label', { for: 'my-new', text: 'New password' }), next)
    ),
    save
  );
}

