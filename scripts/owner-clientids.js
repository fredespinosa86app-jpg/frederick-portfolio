/* ==========================================================================
   owner-clientids.js - Owner Panel > Client IDs (CodeFlow 4.5.0, phase P0)
   One private registry of client IDs shared by the business pages. It stores ONLY: the ID (as the document ID), status, a private note,
   a revision number and times. No names, e-mails, phones or companies.
     clientRegistry/{ID}        { status, notes, createdAt, updatedAt, rev, lastAudit }
     clientRegistryAudit/{aid}  { clientId, action, prev, next, reason, rev, actor, createdAt }   (append-only)
   Every change is ONE batch: the registry write plus a brand-new audit record, so there is never a change without its audit entry.
   The rules (firestore.rules.strict) enforce this; the checks here only give friendly messages first.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, ids = window.coreIds; if (!kit || !ids) return;
  const { el, notify } = kit;
  const $ = id => document.getElementById(id), own = () => window.OWN;
  let rows = [], loaded = false, signed = false, fmt = Object.assign({}, ids.DEFAULT_FORMAT);
  const errText = e => (e && e.code === 'permission-denied') ? 'The database refused this (permission denied). Publish the newest firestore.rules.strict, sign in again, then refresh this page. If you just edited this ID in another tab, refresh first.' : 'Please try again.';
  const fmtDate = t => { const d = t && typeof t.toDate === 'function' ? t.toDate() : null; return d ? d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; };
  const say = (id, msg) => { const n = $(id); if (n) n.textContent = msg || ''; };

  /* ---------------------------------------------------------------- data */
  async function load(force) {
    if (loaded && !force) return rows;
    const o = own(), f = o.fs;
    try { const m = await f.getDoc(f.doc(o.db, 'ownerPrivate', 'clientIdFormat')); if (m.exists()) { const c = ids.cleanFormat(m.data()); if (c.ok) fmt = c.format; } } catch (e) { /* default format */ }
    const s = await f.getDocs(f.query(f.collection(o.db, 'clientRegistry')));
    rows = s.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => a.id < b.id ? -1 : 1);
    loaded = true; return rows;
  }
  /* write one change as a single batch: registry document + brand-new audit record */
  async function commit(kind, id, cur, patch, audit) {
    const o = own(), f = o.fs, aid = ids.newKey(), b = f.writeBatch(), rd = f.doc(o.db, 'clientRegistry', id);
    const rev = cur ? (Number(cur.rev) || 0) + 1 : 1;
    const base = { status: patch.status, notes: patch.notes, updatedAt: f.serverTimestamp(), rev, lastAudit: aid };
    if (kind === 'create') b.set(rd, Object.assign({ createdAt: f.serverTimestamp() }, base));
    else b.set(rd, Object.assign({ createdAt: cur.createdAt }, base));
    b.set(f.doc(o.db, 'clientRegistryAudit', aid), { clientId: id, action: audit.action, prev: String(audit.prev || '').slice(0, 500), next: String(audit.next || '').slice(0, 500), reason: String(audit.reason || '').slice(0, 200), rev, actor: o.uid(), createdAt: f.serverTimestamp() });
    await b.commit();
  }
  async function fresh(id) { const o = own(), f = o.fs, s = await f.getDoc(f.doc(o.db, 'clientRegistry', id)); return s.exists() ? Object.assign({ id }, s.data()) : null; }

  /* ---------------------------------------------------------------- actions */
  async function add(rawId, note) {
    say('cidErr', '');
    const v = ids.validateClientId(rawId); if (!v.ok) { say('cidErr', v.error); return false; }
    const n = String(note || '').trim(); if (n.length > 500) { say('cidErr', 'The note is too long (500 characters at most).'); return false; }
    try {
      if (await fresh(v.id)) { say('cidErr', v.id + ' already exists. Refreshing the list.'); await load(true); draw(); return false; }
      await commit('create', v.id, null, { status: 'active', notes: n }, { action: 'create', prev: '', next: 'active', reason: '' });
      own().log && own().log('Client ID added: ' + v.id);
      notify(v.id + ' was added.', 'success'); await load(true); draw(); return true;
    } catch (e) { say('cidErr', 'Could not add the ID. ' + errText(e)); return false; }
  }
  /* small modal that asks for a reason (3 to 200 characters) */
  function askReason(title, help, okLabel) {
    return new Promise(res => {
      const d = el('dialog', { class: 'dmodal', 'aria-labelledby': 'cidRT' });
      const inp = el('input', { type: 'text', maxlength: 200, 'aria-label': 'Reason', autocomplete: 'off' }), err = el('p', { class: 'ferr', role: 'alert' });
      let done = false; const fin = v => { if (done) return; done = true; d.close(); res(v); };
      d.append(el('div', {}, el('h2', { id: 'cidRT' }, title), el('p', { class: 'dhelp' }, help), el('label', { class: 'fld' }, 'Reason', inp), err,
        el('div', { class: 'dact-row' }, el('button', { type: 'button', class: 'dbtn', onclick: () => fin(null) }, 'Cancel'),
          el('button', { type: 'button', class: 'dbtn primary', onclick: () => { const r = inp.value.trim(); if (r.length < 3) { err.textContent = 'Please write at least 3 characters.'; return; } fin(r); } }, okLabel))));
      d.addEventListener('close', () => { d.remove(); if (!done) { done = true; res(null); } }); document.body.append(d); d.showModal(); inp.focus();
    });
  }
  async function setStatus(r, to) {
    const reason = await askReason(to === 'archived' ? 'Archive ' + r.id + '?' : 'Restore ' + r.id + '?',
      to === 'archived' ? 'Archived IDs stay in all records and reports but cannot be chosen for new work. Say why (kept in the history).' : 'The ID becomes active again. Say why (kept in the history).', to === 'archived' ? 'Archive' : 'Restore');
    if (!reason) return;
    try {
      const cur = await fresh(r.id); if (!cur) { notify('That ID no longer exists. Refreshing.', 'error'); await load(true); return draw(); }
      if (cur.status === to) { notify(r.id + ' is already ' + to + '.', 'info'); await load(true); return draw(); }
      await commit('update', r.id, cur, { status: to, notes: cur.notes || '' }, { action: 'status', prev: cur.status, next: to, reason });
      own().log && own().log('Client ID ' + (to === 'archived' ? 'archived' : 'restored') + ': ' + r.id);
      notify(r.id + (to === 'archived' ? ' was archived.' : ' was restored.'), 'success'); await load(true); draw();
    } catch (e) { notify('Could not change the status. ' + errText(e), 'error'); }
  }
  function editNote(r) {
    const d = el('dialog', { class: 'dmodal', 'aria-labelledby': 'cidNT' });
    const inp = el('input', { type: 'text', maxlength: 500, value: r.notes || '', 'aria-label': 'Private note', autocomplete: 'off' }), err = el('p', { class: 'ferr', role: 'alert' });
    d.append(el('div', {}, el('h2', { id: 'cidNT' }, 'Note for ' + r.id), el('p', { class: 'dhelp' }, 'Private note. No names, e-mails or phone numbers. Every change is kept in the history.'), el('label', { class: 'fld' }, 'Note', inp), err,
      el('div', { class: 'dact-row' }, el('button', { type: 'button', class: 'dbtn', onclick: () => d.close() }, 'Cancel'),
        el('button', { type: 'button', class: 'dbtn primary', onclick: async () => {
          err.textContent = ''; const n = inp.value.trim();
          try {
            const cur = await fresh(r.id); if (!cur) { err.textContent = 'That ID no longer exists.'; return; }
            if ((cur.notes || '') === n) { d.close(); notify('No change to save: the note is already exactly this.', 'info'); return; }
            await commit('update', r.id, cur, { status: cur.status, notes: n }, { action: 'notes', prev: cur.notes || '', next: n, reason: '' });
            d.close(); notify('Note saved.', 'success'); await load(true); draw();
          } catch (e) { err.textContent = 'Could not save. ' + errText(e); }
        } }, 'Save note'))));
    d.addEventListener('close', () => d.remove()); document.body.append(d); d.showModal(); inp.focus();
  }
  async function history(r) {
    const o = own(), f = o.fs, d = el('dialog', { class: 'dmodal', 'aria-labelledby': 'cidHT' }), list = el('div', { class: 'cidhist' }, el('p', { class: 'dstate' }, 'Loading…'));
    d.append(el('div', {}, el('h2', { id: 'cidHT' }, 'History of ' + r.id), list, el('div', { class: 'dact-row' }, el('button', { type: 'button', class: 'dbtn', onclick: () => d.close() }, 'Close'))));
    d.addEventListener('close', () => d.remove()); document.body.append(d); d.showModal();
    try {
      const s = await f.getDocs(f.query(f.collection(o.db, 'clientRegistryAudit'), f.where('clientId', '==', r.id)));
      const a = s.docs.map(x => x.data()).sort((x, y) => (Number(x.rev) || 0) - (Number(y.rev) || 0));
      const lines = a.map(x => {
        const what = x.action === 'create' ? 'Created as active' : x.action === 'status' ? 'Status ' + x.prev + ' to ' + x.next : 'Note changed';
        return el('div', { class: 'cidh' }, el('strong', {}, '#' + x.rev + ' · ' + what), el('span', { class: 'libmeta' }, fmtDate(x.createdAt)),
          x.action === 'notes' ? el('span', { class: 'libmeta' }, 'From "' + (x.prev || '') + '" to "' + (x.next || '') + '"') : null, x.reason ? el('span', { class: 'libmeta' }, 'Reason: ' + x.reason) : null);
      });
      list.replaceChildren(...(lines.length ? lines : [el('p', { class: 'dstate' }, 'No history found.')]));
    } catch (e) { list.replaceChildren(el('p', { class: 'ferr' }, 'Could not load the history. ' + errText(e))); }
  }

  /* ---------------------------------------------------------------- format */
  function fillFormat() { $('cidPrefix').value = fmt.prefix; $('cidDigits').value = String(fmt.digits); $('cidStart').value = String(fmt.start); $('cidYear').value = fmt.year || ''; preview(); }
  function readFormat() { return ids.cleanFormat({ prefix: $('cidPrefix').value, digits: $('cidDigits').value, start: $('cidStart').value, year: $('cidYear').value }); }
  function preview() {
    const c = readFormat(); if (!c.ok) { say('cidPreview', c.error); return null; }
    const n = ids.nextClientId(c.format, rows.map(r => r.id)); say('cidPreview', n.ok ? 'Next ID with this format: ' + n.id : n.error); return c.format;
  }
  async function saveFormat() {
    const c = readFormat(); if (!c.ok) { say('cidPreview', c.error); return; }
    try { const o = own(), f = o.fs; await f.setDoc(f.doc(o.db, 'ownerPrivate', 'clientIdFormat'), c.format); fmt = c.format; notify('ID format saved.', 'success'); preview(); }
    catch (e) { notify('Could not save the format. ' + errText(e), 'error'); }
  }

  /* ---------------------------------------------------------------- list */
  function draw() {
    const show = $('cidShow').value, q = $('cidSearch').value.trim().toLowerCase();
    const list = rows.filter(r => (show === 'all' || (r.status || 'active') === show) && (!q || r.id.toLowerCase().includes(q) || String(r.notes || '').toLowerCase().includes(q)));
    const act = rows.filter(r => r.status === 'active').length;
    say('cidState', rows.length + ' ID' + (rows.length === 1 ? '' : 's') + ' in total, ' + act + ' active, ' + (rows.length - act) + ' archived.');
    $('cidList').replaceChildren(...(list.length ? list.map(r => el('div', { class: 'cidrow' + (r.status === 'archived' ? ' arch' : '') },
      el('div', { class: 'cidmain' }, el('strong', { class: 'cidid' }, r.id), el('span', { class: 'cidbadge ' + r.status }, r.status === 'archived' ? 'Archived' : 'Active'), el('span', { class: 'libmeta' }, 'Created ' + fmtDate(r.createdAt) + ' · revision ' + r.rev)),
      r.notes ? el('div', { class: 'dhelp cidnote' }, r.notes) : null,
      el('div', { class: 'dact-row' },
        kit.iconBtn('copy', 'Copy', r.id, async () => { try { await navigator.clipboard.writeText(r.id); notify('Copied ' + r.id, 'success'); } catch (e) { notify('Please copy it by hand: ' + r.id, 'info'); } }),
        kit.iconBtn('pencil', 'Edit note', r.id, () => editNote(r)),
        kit.iconBtn('clock', 'History', r.id, () => history(r)),
        r.status === 'archived' ? kit.iconBtn('restore', 'Restore', r.id, () => setStatus(r, 'active')) : kit.iconBtn('archive', 'Archive', r.id, () => setStatus(r, 'archived'), { danger: true })))) : [el('p', { class: 'dstate' }, rows.length ? 'No IDs match.' : 'No client IDs yet. Add your first one above.')]));
    preview();
  }
  async function show() {
    if (!signed) return;
    say('cidState', 'Loading…');
    try { await load(true); fillFormat(); draw(); } catch (e) { say('cidState', 'Could not load the client IDs. ' + errText(e)); }
  }

  function init() {
    $('cidAddNext').addEventListener('click', async () => {
      say('cidErr', ''); const c = readFormat(); if (!c.ok) { say('cidErr', c.error); return; }
      try { await load(true); } catch (e) { say('cidErr', 'Could not read the list. ' + errText(e)); return; }
      const n = ids.nextClientId(c.format, rows.map(r => r.id)); if (!n.ok) { say('cidErr', n.error); return; }
      if (await add(n.id, $('cidNote').value)) $('cidNote').value = '';
    });
    $('cidAddCustom').addEventListener('click', async () => { if (await add($('cidCustom').value, $('cidNote').value)) { $('cidCustom').value = ''; $('cidNote').value = ''; } });
    $('cidCustom').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('cidAddCustom').click(); } });
    $('cidFmtSave').addEventListener('click', saveFormat);
    ['cidPrefix', 'cidDigits', 'cidStart', 'cidYear'].forEach(i => $(i).addEventListener('input', preview));
    $('cidShow').addEventListener('change', draw); $('cidSearch').addEventListener('input', draw); $('cidRefresh').addEventListener('click', show);
    document.addEventListener('dash:page', e => { if (e.detail === 'clientids') show(); });
    document.addEventListener('own:auth', e => { signed = !!(e.detail && e.detail.ok); loaded = false; rows = []; if (!signed) { $('cidList').replaceChildren(); say('cidState', ''); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
