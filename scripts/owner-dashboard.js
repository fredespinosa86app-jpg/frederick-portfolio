/* ==========================================================================
   owner-dashboard.js - owner dashboard: navigation, inbox, chatbot question history,
   overview, activity feed and social/contact link manager.
   Data access goes through window.OWN (created by owner-panel.js after Firebase loads);
   Firestore security rules decide who can actually read or write.
   ========================================================================== */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const dash = $('dash'), openBtn = $('dashOpen');
  if (!dash || !openBtn) return;

  const TITLES = { security: 'Security', privacy: 'Privacy & backup', seo: 'SEO & social preview', svcforms: 'Service forms', chatid: 'Chatbot appearance & filter', chatkb: 'Chatbot knowledge base', visitors: 'Visitors', integrations: 'Integrations', domain: 'Custom domain', experience: 'Experience', booking: 'Availability, rates & capacity', clients: 'Clients & invoices', clientids: 'Client IDs', billing: 'Billing profiles', billhours: 'Billable hours', invoices: 'Invoices', worktrack: 'WorkTrack', training: 'Training categories', videos: 'How I Work videos', faq: 'FAQ', secbg: 'Section backgrounds', dashboard: 'Dashboard', inbox: 'Inbox: meeting requests', questions: 'Chatbot question history', marcus: 'Marcus configuration',
    services: 'Services', toolkit: 'Toolkit', testimonials: 'Testimonials', video: 'Intro video', library: 'Image library', theme: 'Theme & effects', hero: 'Hero', social: 'Social media & contact', general: 'General settings' };
  const REQ_STATUS = { new: 'New', pending: 'Pending', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' };
  const Q_STATUS = { new: 'New', reviewed: 'Reviewed', addressed: 'Addressed', archived: 'Archived' };
  /* Security S3.2: small tag when the requested day is the day the request was sent */
  const sameDayTag = r => { try { const ms = toDate(r.createdAt), tz = window.availApi.tzOk(r.tz) ? r.tz : window.availApi.cfg().tz; return ms && r.date && window.availApi.parts(+ms, tz).date === r.date ? el('span', { class: 'chip svc' }, 'Same day') : ''; } catch (e) { return ''; } };
  const normReq = s => REQ_STATUS[s] ? s : (s === 'read' ? 'pending' : 'new');
  const normQ = s => Q_STATUS[s] ? s : 'new';

  /* ---------- small helpers ---------- */
  function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) { if (typeof v === 'function') e.addEventListener(k.slice(2), v); }
      else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach(k => e.append(k instanceof Node ? k : document.createTextNode(k == null ? '' : String(k))));
    return e;
  }
  const toDate = v => (v && typeof v.toDate === 'function') ? v.toDate() : null;
  const fmt = d => d ? d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '-';
  const chip = (label, kind) => el('span', { class: 'chip chip-' + kind }, label);
  const hint = e => (e && e.code === 'permission-denied') ? 'Check your Firestore rules.' : '';

  /* ---- toasts (bottom-right, non-blocking) and the "View site" lock ---- */
  const ICON = { success: '✓', error: '✕', warning: '!', info: 'i' }, TIME = { success: 3500, info: 4000, warning: 6000, error: 8000 };
  let pending = 0, toasts = 0, confirming = 0;
  function syncLock() {
    const b = $('dClose'); if (!b) return;
    const on = pending > 0 || toasts > 0 || confirming > 0;
    b.disabled = on; b.setAttribute('aria-disabled', String(on));
    b.title = on ? 'Please wait until the current action has finished' : '';
  }
  window.dashBusy = n => { pending = Math.max(0, pending + n); syncLock(); };
  function notify(msg, type, goPage) {
    type = ICON[type] ? type : 'info';
    const box = $('dtoasts'); const live = [...box.children].filter(c => !c.classList.contains('out')); live.slice(0, Math.max(0, live.length - 3)).forEach(c => c.dispatchEvent(new Event('toast:end')));
    const t = el('div', { class: 'dtoast ' + type, role: type === 'error' ? 'alert' : 'status' }, el('span', { class: 'dti', 'aria-hidden': 'true' }, ICON[type]), el('span', { class: 'dtm' }, msg));
    let done = false, timer;
    const end = () => { if (done) return; done = true; clearTimeout(timer); t.classList.add('out'); setTimeout(() => { t.remove(); toasts = Math.max(0, toasts - 1); syncLock(); }, 180); };
    t.addEventListener('toast:end', end);
    if (goPage) { t.classList.add('go'); t.addEventListener('click', () => { openDash(); go(goPage); end(); }); }
    toasts++; syncLock(); box.append(t);
    timer = setTimeout(end, TIME[type]);
  }
  window.dashNotify = notify;

  function confirmBox(title, message, okLabel) {
    const d = $('dConfirm');
    $('dcTitle').textContent = title; $('dcMsg').textContent = message; $('dcOk').textContent = okLabel || 'Delete';
    return new Promise(resolve => {
      const done = v => { d.close(); d.removeEventListener('cancel', onCancel); resolve(v); };
      const onCancel = e => { e.preventDefault(); done(false); };
      d.addEventListener('cancel', onCancel);
      $('dcOk').onclick = () => done(true); $('dcNo').onclick = () => done(false);
      confirming++; syncLock(); d.showModal(); $('dcNo').focus();
    }).then(v => { confirming = Math.max(0, confirming - 1); syncLock(); return v; });
  }

  window.dashKit = { el, notify, confirmBox };   // shared with owner-content.js

  /* ---------- navigation ---------- */
  /* Security S6: the panel only works for a verified owner sign-in. If someone forces the panel visible (developer tools) it is hidden again
     and no panel code runs, so no private data is even requested. The database rules remain the real protection. */
  let signedOwner = false;
  function go(page) {
    if (!signedOwner) { dash.hidden = true; return; }
    if (!$('dp-' + page)) page = 'dashboard';
    document.querySelectorAll('.dpage').forEach(p => { p.hidden = p.id !== 'dp-' + page; });
    document.querySelectorAll('.dnav [data-page]').forEach(b => b.setAttribute('aria-current', b.dataset.page === page ? 'page' : 'false'));
    $('dtitle').textContent = TITLES[page];
    dash.classList.remove('drawer');
    try { sessionStorage.setItem('dash-page', page); } catch (e) { /* ignore */ }
    $('dbody').scrollTop = 0;
    document.dispatchEvent(new CustomEvent('dash:page', { detail: page }));
  }
  function openDash() {
    if (!signedOwner) { dash.hidden = true; return; }
    dash.hidden = false; document.body.classList.add('dash-lock');
    let p = 'dashboard'; try { p = sessionStorage.getItem('dash-page') || p; } catch (e) { /* ignore */ }
    go(p); $('dtitle').focus();
  }
  function closeDash() { dash.hidden = true; document.body.classList.remove('dash-lock'); document.dispatchEvent(new Event('dash:closed')); if (!openBtn.hidden) openBtn.focus(); }
  document.querySelectorAll('.dnav [data-page]').forEach(b => b.addEventListener('click', () => go(b.dataset.page)));
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
  openBtn.addEventListener('click', openDash);
  $('dClose').addEventListener('click', () => { if (!$('dClose').disabled) closeDash(); });
  $('dMenu').addEventListener('click', () => dash.classList.toggle('drawer'));
  $('dScrim').addEventListener('click', () => dash.classList.remove('drawer'));
  $('dCollapse').addEventListener('click', () => $('dCollapse').setAttribute('aria-pressed', dash.classList.toggle('collapsed')));
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || dash.hidden || document.querySelector('dialog[open]')) return;
    if (dash.classList.contains('drawer')) dash.classList.remove('drawer'); else closeDash();
  });

  /* ---------- live data ---------- */
  const S = { req: [], q: [], act: [], loaded: {}, error: {} };
  window.dashData = { requests: () => S.req.slice() };   /* read-only view for the Google Sheets sender (E4) */
  const F = { req: { search: '', status: 'all', since: '', sort: 'new' }, q: { search: '', status: 'active', since: '', sort: 'new' } };
  let unsubs = [];

  function subscribe(key, col, max) {
    const { fs, db } = window.OWN;
    let first = true;
    return fs.onSnapshot(fs.query(fs.collection(db, col), fs.orderBy('createdAt', 'desc'), fs.limit(max)), snap => {
      const arr = []; snap.forEach(d => arr.push(Object.assign({ id: d.id, ref: d.ref }, d.data())));
      S[key] = arr; S.loaded[key] = true; S.error[key] = null;
      if (!first) snap.docChanges().forEach(c => {
        if (c.type !== 'added' || (c.doc.metadata && c.doc.metadata.hasPendingWrites)) return;
        const r = c.doc.data();
        if (key === 'req') notify('New meeting request from ' + (r.name || 'a client'), 'info', 'inbox');
        if (key === 'q') notify('New unanswered chatbot question recorded', 'info', 'questions');
      });
      first = false; renderAll();
    }, err => { S.error[key] = err; S.loaded[key] = true; renderAll(); });
  }
  function start() {
    stop();
    unsubs = [subscribe('req', 'meetingRequests', 300), subscribe('q', 'chatUnanswered', 300), subscribe('act', 'activity', 30)];
    renderAll();
  }
  function stop() { unsubs.forEach(u => u && u()); unsubs = []; S.req = []; S.q = []; S.act = []; S.loaded = {}; S.error = {}; renderAll(); }

  function stateFor(key, hasAny, emptyMsg) {
    if (!S.loaded[key]) return el('p', { class: 'dstate' }, el('span', { class: 'spin', 'aria-hidden': 'true' }), ' Loading…');
    if (S.error[key]) return el('div', { class: 'dstate err' }, el('p', {}, 'Could not load this data. ' + hint(S.error[key])), el('button', { class: 'dbtn', type: 'button', onclick: start }, 'Retry'));
    return hasAny ? null : el('p', { class: 'dstate' }, emptyMsg);
  }
  function filterList(list, f, fields, norm) {
    const q = f.search.trim().toLowerCase(), since = f.since ? new Date(f.since + 'T00:00:00') : null;
    const out = list.filter(x => {
      if (q && !fields(x).some(v => String(v || '').toLowerCase().includes(q))) return false;
      const s = norm(x.status);
      if (f.status === 'active' ? s === 'archived' : (f.status !== 'all' && s !== f.status)) return false;
      if (since) { const d = toDate(x.createdAt); if (!d || d < since) return false; }
      return true;
    });
    out.sort((a, b) => (toDate(a.createdAt) || 0) - (toDate(b.createdAt) || 0));
    return f.sort === 'old' ? out : out.reverse();
  }
  async function update(ref, data, logText, okText) {
    try { await window.OWN.fs.updateDoc(ref, Object.assign({ updatedAt: Date.now() }, data)); window.OWN.log(logText); notify(okText, 'success'); return true; }
    catch (e) { notify('Could not save the change. ' + hint(e), 'error'); return false; }
  }
  async function remove(ref, logText) {
    try { await window.OWN.fs.deleteDoc(ref); window.OWN.log(logText); notify('Deleted.', 'success'); return true; }
    catch (e) { notify('Could not delete. ' + hint(e), 'error'); return false; }
  }

  /* ---------- rendering ---------- */
  function renderAll() { renderBadges(); renderDashboard(); renderInbox(); renderQuestions(); document.dispatchEvent(new CustomEvent('dash:requests', { detail: { list: S.req, loaded: !!S.loaded.req } })); }

  function renderBadges() {
    const nReq = S.req.filter(r => normReq(r.status) === 'new').length, nQ = S.q.filter(q => normQ(q.status) === 'new').length;
    [['nbInbox', nReq], ['nbQ', nQ], ['dashOpenBadge', nReq + nQ]].forEach(([id, n]) => { const b = $(id); b.textContent = n; b.hidden = !n; });
  }

  function renderDashboard() {
    const ld = k => S.loaded[k] && !S.error[k];
    const pub = { svc: document.querySelectorAll('#services .row').length, tools: document.querySelectorAll('#toolkit .badges span').length,
      testi: (() => { const s = $('testimonials'); return s && !s.hidden ? document.querySelectorAll('#tGrid .tcard').length : 0; })() };
    const cards = [
      ['Total meeting requests', ld('req') ? S.req.length : '…', 'inbox'],
      ['New meeting requests', ld('req') ? S.req.filter(r => normReq(r.status) === 'new').length : '…', 'inbox'],
      ['Unanswered chatbot questions', ld('q') ? S.q.filter(q => normQ(q.status) !== 'archived').length : '…', 'questions'],
      ['Questions awaiting review', ld('q') ? S.q.filter(q => normQ(q.status) === 'new').length : '…', 'questions'],
      ['Published services', pub.svc], ['Active toolkit items', pub.tools], ['Published testimonials', pub.testi]];
    $('dstats').replaceChildren(...cards.map(([l, n, page]) => el(page ? 'button' : 'div', { class: 'stat', type: page ? 'button' : false, onclick: page ? () => go(page) : false },
      el('span', { class: 'stat-n' }, n), el('span', { class: 'stat-l' }, l))));
    const items = [].concat(
      S.act.map(a => ({ t: toDate(a.createdAt), text: a.text })),
      S.req.slice(0, 15).map(r => ({ t: toDate(r.createdAt), text: 'New meeting request received from ' + (r.name || 'a client') })),
      S.q.slice(0, 15).map(q => ({ t: toDate(q.createdAt), text: 'New unanswered chatbot question recorded: “' + String(q.question || '').slice(0, 70) + '”' }))
    ).filter(i => i.t).sort((a, b) => b.t - a.t).slice(0, 12);
    const box = $('dActivity');
    box.replaceChildren(...(items.length ? items.map(i => el('li', {}, el('time', { datetime: i.t.toISOString() }, fmt(i.t)), el('span', {}, i.text)))
      : [el('li', {}, ld('req') ? 'No activity yet.' : 'Loading…')]));
  }

  function renderInbox() {
    const c = { new: 0, pending: 0, confirmed: 0, completed: 0 };
    S.req.forEach(r => { const s = normReq(r.status); if (s in c) c[s]++; });
    $('inboxStats').replaceChildren(...[['Total requests', S.req.length], ['New', c.new], ['Pending', c.pending], ['Confirmed', c.confirmed], ['Completed', c.completed]]
      .map(([l, n]) => el('div', { class: 'stat' }, el('span', { class: 'stat-n' }, S.loaded.req ? n : '…'), el('span', { class: 'stat-l' }, l))));
    const root = $('inboxList'), st = stateFor('req', S.req.length, 'No meeting requests yet. New client inquiries will appear here.');
    if (st) return root.replaceChildren(st);
    const rows = filterList(S.req, F.req, r => [r.name, r.email, r.company, r.service], normReq);
    if (!rows.length) return root.replaceChildren(el('p', { class: 'dstate' }, 'No requests match your filters.'));
    root.replaceChildren(el('div', { class: 'twrap' }, el('table', { class: 'dtable' },
      el('thead', {}, el('tr', {}, ...['Client', 'Purpose / message', 'Requested', 'Submitted', 'Status', 'Actions'].map(h => el('th', { scope: 'col' }, h)))),
      el('tbody', {}, ...rows.map(r => {
        const s = normReq(r.status), msg = String(r.message || '');
        return el('tr', { class: s === 'new' ? 'unread' : '' },
          el('td', { 'data-label': 'Client' }, el('strong', {}, r.name || '-'), el('br'), el('small', {}, r.email || '')),
          el('td', { 'data-label': 'Purpose' }, r.service ? el('span', { class: 'chip svc' }, String(r.service).slice(0, 60)) : '', r.service ? el('br') : '', msg.slice(0, 80) + (msg.length > 80 ? '…' : '')),
          el('td', { 'data-label': 'Requested' }, [r.date, r.time].filter(Boolean).join(' '), sameDayTag(r), el('br'), el('small', {}, r.tz || '')),
          el('td', { 'data-label': 'Submitted' }, fmt(toDate(r.createdAt))),
          el('td', { 'data-label': 'Status' }, chip(REQ_STATUS[s], s)),
          el('td', { 'data-label': 'Actions' }, el('button', { class: 'dbtn sm', type: 'button', onclick: () => openRequest(r.id) }, 'View'),
            s === 'new' || s === 'pending' ? el('button', { class: 'dbtn sm primary', type: 'button', onclick: () => setReq(r, 'confirmed') }, 'Confirm') : ''));
      })))));
  }
  const setReq = async (r, status) => {
    if (status === 'confirmed' && window.availApi) {   // warn before double-booking a confirmed time
      const other = window.availApi.conflict(r, S.req);
      if (other && !(await confirmBox('Possible double booking', 'This time overlaps a meeting already confirmed with ' + (other.name || 'another visitor') + ' (' + other.date + ' ' + other.time + '). Confirm anyway?', 'Confirm anyway'))) return;
    }
    if (status === 'confirmed' && window.calendarApi && window.calendarApi.connected()) {   // Google Calendar conflict check (only when connected)
      const busy = await window.calendarApi.conflictFor(r);
      if (busy && !(await confirmBox('Calendar conflict', 'Google Calendar shows you are busy at that time. Confirm anyway?', 'Confirm anyway'))) return;
    }
    const res = await setReq0(r, status);
    if (status === 'confirmed' && window.calendarApi) window.calendarApi.onConfirmed(r);
    return res;
  };
  const setReq0 = (r, status) => update(r.ref, { status }, 'Meeting request from ' + (r.name || 'a client') + ' marked ' + REQ_STATUS[status], 'Request marked ' + REQ_STATUS[status] + '.');

  /* answers to a service-specific form are stored as a JSON text; parse defensively and show as plain text only */
  function answerRows(r) {
    if (!r.answers) return [];
    try { const a = JSON.parse(r.answers); if (!Array.isArray(a)) return [];
      return a.slice(0, 20).map(x => [String(x && x.q || '').slice(0, 160), el('span', { class: 'pre' }, String(x && x.a || '').slice(0, 1000))]).filter(x => x[0]); }
    catch (e) { return [['Answers', el('span', { class: 'pre' }, String(r.answers).slice(0, 1000))]]; }
  }
  function openRequest(id) {
    const r = S.req.find(x => x.id === id); if (!r) return;
    const d = $('dDetail'), s = normReq(r.status);
    const rows = [['Name', r.name], ['Email', el('a', { href: 'mailto:' + (r.email || '') }, r.email)], ['Company', r.company || '-'], ['Preferred date', r.date], ['Preferred time', r.time],
      ['Service', r.service || '-'], ...(r.formName ? [['Form used', r.formName]] : []), ...answerRows(r), ['Time zone', r.tz], ['Platform', r.platform || '-'], ...((window.googleHub && window.googleHub.linkFor(r.platform)) ? [['Meeting link', el('a', { href: window.googleHub.linkFor(r.platform), target: '_blank', rel: 'noopener noreferrer' }, window.googleHub.linkFor(r.platform))]] : []), ['Submitted', fmt(toDate(r.createdAt))], ['Status', chip(REQ_STATUS[s], s)], ['Message', el('span', { class: 'pre' }, r.message || '-')]];
    $('ddBody').replaceChildren(el('dl', { class: 'ddl' }, ...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v == null ? '-' : v)])));
    $('ddActs').replaceChildren(
      ...[['new', 'Mark as New'], ['pending', 'Mark as Pending'], ['confirmed', 'Confirm Meeting'], ['completed', 'Mark as Completed'], ['cancelled', 'Cancel Request']].map(([k, l]) =>
        el('button', { type: 'button', class: 'dbtn' + (k === 'confirmed' ? ' primary' : ''), disabled: s === k, onclick: async e => { e.currentTarget.disabled = true; await setReq(r, k); d.close(); } }, l)),
      el('button', { type: 'button', class: 'dbtn danger', onclick: async () => {
        if (await confirmBox('Delete this request?', 'This permanently deletes the request from ' + (r.name || 'this client') + '. This cannot be undone.')) {
          if (await remove(r.ref, 'Meeting request from ' + (r.name || 'a client') + ' deleted')) d.close();
        } } }, 'Delete Request'));
    d.showModal();
  }

  function renderQuestions() {
    const root = $('qList'), st = stateFor('q', S.q.length, 'No unanswered questions recorded. Marcus is currently handling the available questions.');
    if (st) return root.replaceChildren(st);
    const rows = filterList(S.q, F.q, q => [q.question, q.context], normQ);
    if (!rows.length) return root.replaceChildren(el('p', { class: 'dstate' }, 'No questions match your filters.'));
    const btn = (q, status, label) => el('button', { class: 'dbtn sm', type: 'button', disabled: normQ(q.status) === status,
      onclick: () => update(q.ref, { status }, 'Chatbot question marked ' + Q_STATUS[status], 'Question marked ' + Q_STATUS[status] + '.') }, label);
    root.replaceChildren(el('div', { class: 'twrap' }, el('table', { class: 'dtable' },
      el('thead', {}, el('tr', {}, ...['Visitor question', 'Related context', 'Date', 'Status', 'Actions'].map(h => el('th', { scope: 'col' }, h)))),
      el('tbody', {}, ...rows.map(q => {
        const s = normQ(q.status);
        return el('tr', { class: s === 'new' ? 'unread' : '' },
          el('td', { 'data-label': 'Question' }, el('strong', {}, q.question || '-')),
          el('td', { 'data-label': 'Context' }, q.context ? el('small', {}, 'Previous message: ' + q.context) : el('small', {}, '-')),
          el('td', { 'data-label': 'Date' }, fmt(toDate(q.createdAt))),
          el('td', { 'data-label': 'Status' }, chip(Q_STATUS[s], s)),
          el('td', { 'data-label': 'Actions' }, btn(q, 'reviewed', 'Reviewed'), btn(q, 'addressed', 'Addressed'), btn(q, 'archived', 'Archive'),
            el('button', { class: 'dbtn sm danger', type: 'button', onclick: async () => {
              if (await confirmBox('Delete this question?', 'This permanently deletes the recorded question.')) remove(q.ref, 'Chatbot question deleted'); } }, 'Delete')));
      })))));
  }

  /* filters */
  function bindFilters(prefix, key, render) {
    const map = { Search: 'search', Status: 'status', Since: 'since', Sort: 'sort' };
    Object.entries(map).forEach(([suffix, prop]) => {
      const input = $(prefix + suffix);
      input.addEventListener('input', () => { F[key][prop] = input.value; render(); });
    });
    $(prefix + 'Clear').addEventListener('click', () => {
      Object.assign(F[key], { search: '', status: key === 'q' ? 'active' : 'all', since: '', sort: 'new' });
      Object.entries(map).forEach(([suffix, prop]) => { $(prefix + suffix).value = F[key][prop]; });
      render();
    });
  }
  bindFilters('in', 'req', renderInbox); bindFilters('qf', 'q', renderQuestions);

  /* ---------- social media & contact links ---------- */
  let socialDirty = false, socialBuilt = false;
  function validateRow(type) {
    const api = window.contactsApi, v = $('soc-' + type).value.trim(), on = $('soc-en-' + type).checked, err = $('soc-err-' + type);
    let msg = '';
    if (v) { const r = api.validate(type, v); if (!r.ok) msg = r.error; } else if (on) msg = 'Add a link first, or turn off "Show on site".';
    err.textContent = msg; return !msg;
  }
  function buildSocial() {
    if (socialBuilt || !window.contactsApi) return; socialBuilt = true;
    const api = window.contactsApi;
    $('socialRows').replaceChildren(...api.ORDER.map(t => {
      const m = api.META[t], pill = el('span', { class: 'ico-pill' });
      pill.innerHTML = '<svg aria-hidden="true"><use href="#' + m.icon + '"/></svg>';
      return el('div', { class: 'srow' }, el('div', { class: 'srow-h' }, pill, el('strong', {}, m.label)),
        el('label', { class: 'fld' }, el('span', { class: 'sr' }, m.label + ' link or contact'), el('input', { type: t === 'email' ? 'email' : 'text', id: 'soc-' + t, placeholder: m.hint, autocomplete: 'off', maxlength: '200' })),
        el('label', { class: 'tog' }, el('input', { type: 'checkbox', id: 'soc-en-' + t }), 'Show on site'),
        el('button', { type: 'button', class: 'dbtn sm', onclick: () => { $('soc-' + t).value = ''; $('soc-en-' + t).checked = false; socialDirty = true; validateRow(t); } }, 'Clear'),
        el('p', { class: 'ferr', id: 'soc-err-' + t, role: 'alert' }));
    }));
    api.ORDER.forEach(t => ['soc-' + t, 'soc-en-' + t].forEach(id => $(id).addEventListener('input', () => { socialDirty = true; validateRow(t); })));
    fillSocial();
  }
  function fillSocial() {
    if (socialDirty || !socialBuilt) return;
    window.contactsApi.list().forEach(i => { $('soc-' + i.type).value = i.value; $('soc-en-' + i.type).checked = i.enabled && !!i.value; $('soc-err-' + i.type).textContent = ''; });
  }
  $('socialSave').addEventListener('click', async e => {
    const api = window.contactsApi; if (!api) return;
    if (!api.ORDER.map(validateRow).every(Boolean)) return notify('Please fix the highlighted links before saving.', 'error');
    const btn = e.currentTarget; btn.disabled = true;
    const contacts = api.ORDER.map(type => { const value = $('soc-' + type).value.trim(); return { type, value, enabled: !!value && $('soc-en-' + type).checked }; });
    try { await window.OWN.save({ contacts }, 'Social media & contact links saved.'); socialDirty = false; } finally { btn.disabled = false; }
  });
  $('socialDiscard').addEventListener('click', () => { socialDirty = false; fillSocial(); notify('Changes discarded.'); });
  $('thDiscard').addEventListener('click', () => { window.applySite(window.__lastCfg || {}); notify('Preview discarded. Showing the saved settings.'); });

  /* ---------- events from other scripts ---------- */
  document.addEventListener('site:applied', () => { renderDashboard(); fillSocial(); });
  document.addEventListener('content:applied', renderDashboard);
  const ownerLink = $('ownerLogin');
  if (ownerLink) ownerLink.addEventListener('click', () => {
    if (window.__ownerLoginReady) return;   // the Firebase module handles the click
    const msg = location.protocol === 'file:'
      ? 'Owner login needs a web address. Open the project through a local web server (for example the VS Code Live Server extension) or use your published site. Opening index.html straight from the folder blocks it.'
      : (window.__ownerLoginError ? 'Owner login could not start: ' + window.__ownerLoginError : 'Owner login is still loading. Please try again in a moment.');
    notify(msg, 'error');
  });
  document.addEventListener('own:auth', e => {
    const ok = e.detail.ok; signedOwner = !!ok;
    openBtn.hidden = !ok;
    if (ok && window.__ownerJustSignedIn) { window.__ownerJustSignedIn = false; openDash(); notify('Signed in as owner.', 'success'); }
    if (ok) { $('adminEmail').textContent = e.detail.email; buildSocial(); start(); }
    else { stop(); if (!dash.hidden) closeDash(); }
  });
  new MutationObserver(() => { if (!signedOwner && (!dash.hidden || dash.style.display === 'block')) { dash.hidden = true; dash.style.display = ''; document.body.classList.remove('dash-lock'); } }).observe(dash, { attributes: true, attributeFilter: ['hidden', 'style'] });
  renderAll();
  const ddClose = document.getElementById('ddClose'); if (ddClose) ddClose.addEventListener('click', () => document.getElementById('dDetail').close());
})();
