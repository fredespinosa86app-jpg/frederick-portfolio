/* ==========================================================================
   owner-billhours.js - Owner Panel > Billable hours (CodeFlow 4.5.0, phase B1)
   Hours you bill for a Client ID and a period. DRAFT -> SUBMITTED -> APPROVED (you approve your own entry; your account and the server time are stored).
   An approved entry never changes: a later correction is a NEW entry that points back to it, and the old one becomes "Replaced" in the same batch.
   These hours are NOT the WorkTrack attendance time. WorkTrack time is shown only as a reference and is never split between clients.
   Every step is ONE batch: the entry plus a brand-new audit record. B1 creates no invoice.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, B = window.coreBilling, M = window.coreMoney; if (!kit || !B || !M) return;
  const { el, notify } = kit;
  const $ = id => document.getElementById(id), own = () => window.OWN;
  let signed = false, registry = [], profiles = [], entries = [];
  const errText = e => (e && e.code === 'permission-denied') ? 'The database refused this (permission denied). Publish the newest firestore.rules.strict, sign in again, then refresh this page. If you changed this in another tab, refresh first.' : 'Please try again.';
  const fmtDate = t => { const d = t && typeof t.toDate === 'function' ? t.toDate() : null; return d ? d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; };
  const say = (id, msg) => { const n = $(id); if (n) n.textContent = msg || ''; };
  const hm = min => min == null ? '' : String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  const dec = min => min == null ? '' : (Math.round(min * 100 / 60) / 100).toFixed(2);
  const iso = d => d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6);
  const written = paths => document.dispatchEvent(new CustomEvent('wt:written', { detail: { paths } }));
  const newKey = () => window.coreIds.newKey();

  /* ---------------------------------------------------------------- data */
  async function load() {
    const o = own(), f = o.fs;
    const [rs, ps, es] = await Promise.all([f.getDocs(f.query(f.collection(o.db, 'clientRegistry'))), f.getDocs(f.query(f.collection(o.db, 'billingProfiles'))), f.getDocs(f.query(f.collection(o.db, 'billableEntries')))]);
    registry = rs.docs.map(d => ({ id: d.id, status: d.data().status })); profiles = ps.docs.map(d => d.id);
    entries = es.docs.map(d => Object.assign({ id: d.id }, d.data()));
  }
  const statusOf = id => { const r = registry.find(x => x.id === id); return r ? r.status : ''; };
  /* run a plan as ONE batch */
  async function commit(plan) {
    const o = own(), f = o.fs, b = f.writeBatch(), paths = [];
    plan.writes.forEach((w, i) => {
      const d = Object.assign({}, w.doc); Object.keys(d).forEach(k => { if (d[k] === B.SERVER_TIME) d[k] = f.serverTimestamp(); });
      d.updatedAt = f.serverTimestamp(); d.createdAt = w.kind === 'create' ? f.serverTimestamp() : (entries.find(e => e.id === w.id) || {}).createdAt;
      b.set(f.doc(o.db, 'billableEntries', w.id), d);
      const a = plan.audits[i]; b.set(f.doc(o.db, 'billableEntryAudit', w.doc.lastAudit), Object.assign({}, a.rec, { actor: o.uid(), createdAt: f.serverTimestamp() })); paths.push('billableEntryAudit/' + w.doc.lastAudit);
    });
    await b.commit(); written(paths);
  }
  async function run(action, a, label) {
    const o = own();
    try {
      await load();                                                         // always plan from the newest saved state
      const cur = a.id ? entries.find(e => e.id === a.id) : null, known = a._rev;
      if (cur && known != null && cur.rev !== known) { notify('This entry changed elsewhere. The list was refreshed - please check it and try again.', 'error'); draw(); return { ok: false }; }
      const cid = a.clientId || (cur && cur.clientId);
      const plan = B.entryPlan(entries, action, a, { aid: newKey(), aid2: newKey(), uid: o.uid(), registryStatus: statusOf(cid), profileExists: profiles.indexOf(cid) >= 0 });
      if (!plan.ok) return plan;
      await commit(plan); own().log && own().log('Billable hours: ' + label);
      notify(label + '.', 'success'); await load(); draw(); return { ok: true, id: plan.newId };
    } catch (e) { return { ok: false, reason: 'Could not save. ' + errText(e) }; }
  }

  /* ---------------------------------------------------------------- small form dialog */
  function ask(title, help, fields, okLabel, check) {
    return new Promise(res => {
      const d = el('dialog', { class: 'dmodal', 'aria-labelledby': 'bhDT' }), err = el('p', { class: 'ferr', role: 'alert' }), inputs = {};
      let done = false; const fin = v => { if (done) return; done = true; d.close(); res(v); };
      const rows = fields.map(f => { const i = el('input', { type: 'text', maxlength: f.max || 200, value: f.value || '', autocomplete: 'off', 'aria-label': f.label }); inputs[f.key] = i; return el('label', { class: 'fld' }, f.label, i); });
      d.append(el('div', {}, el('h2', { id: 'bhDT' }, title), el('p', { class: 'dhelp' }, help), ...rows, err,
        el('div', { class: 'dact-row' }, el('button', { type: 'button', class: 'dbtn', onclick: () => fin(null) }, 'Cancel'),
          el('button', { type: 'button', class: 'dbtn primary', onclick: async () => {
            const v = {}; fields.forEach(f => { v[f.key] = inputs[f.key].value.trim(); });
            err.textContent = ''; const r = check ? await check(v) : { ok: true }; if (!r.ok) { err.textContent = r.reason; return; } fin(v);
          } }, okLabel))));
      d.addEventListener('close', () => { d.remove(); if (!done) { done = true; res(null); } }); document.body.append(d); d.showModal(); (inputs[fields[0].key]).focus();
    });
  }
  const dialogRun = (action, base, label) => (title, help, fields, okLabel) => ask(title, help, fields, okLabel, async v => { const r = await run(action, Object.assign({}, base, v), label); return r.ok ? { ok: true } : { ok: false, reason: r.reason || 'Not saved.' }; });

  /* ---------------------------------------------------------------- actions on one entry */
  const edit = e => dialogRun('edit', { id: e.id, _rev: e.rev }, 'Draft updated')('Edit draft', 'Hours as 7.5 or 7:30. Only a draft can be edited.', [{ key: 'minutes', label: 'Hours', value: hm(e.submittedMinutes).replace(/^0/, ''), max: 8 }, { key: 'note', label: 'Note (optional, no personal details)', value: e.note, max: B.MAX_NOTE }], 'Save draft');
  const reopen = e => dialogRun('reopen', { id: e.id, _rev: e.rev }, 'Entry reopened as a draft')('Reopen as a draft', 'The entry goes back to a draft so you can edit it. Say why (kept in the history).', [{ key: 'reason', label: 'Reason', max: 200 }], 'Reopen');
  const approve = e => dialogRun('approve', { id: e.id, _rev: e.rev }, 'Entry approved')('Approve ' + hm(e.submittedMinutes) + ' h', 'You are approving your own hours. Your account and the server time are stored. After this the minutes can never change: a later fix is a new entry that replaces this one. Leave the box as it is to approve the submitted hours, or type different hours.', [{ key: 'minutes', label: 'Approved hours', value: hm(e.submittedMinutes).replace(/^0/, ''), max: 8 }], 'Approve');
  const replace = e => dialogRun('supersede', { id: e.id, _rev: e.rev }, 'Replacement draft created')('Replace this approved entry', 'The approved entry stays as it is and is marked Replaced. A new DRAFT with the corrected hours is created; submit and approve it again. Say why (kept in the history).', [{ key: 'minutes', label: 'Corrected hours', value: hm(e.approvedMinutes).replace(/^0/, ''), max: 8 }, { key: 'note', label: 'Note (optional)', max: B.MAX_NOTE }, { key: 'reason', label: 'Reason', max: 200 }], 'Create replacement');
  async function submit(e) {
    const r = await run('submit', { id: e.id, _rev: e.rev }, 'Entry submitted'); if (!r.ok) notify(r.reason || 'Not saved.', 'error');
  }
  async function history(e) {
    const o = own(), f = o.fs, d = el('dialog', { class: 'dmodal', 'aria-labelledby': 'bhHT' }), list = el('div', { class: 'cidhist' }, el('p', { class: 'dstate' }, 'Loading…'));
    d.append(el('div', {}, el('h2', { id: 'bhHT' }, 'History of ' + e.id), list, el('div', { class: 'dact-row' }, el('button', { type: 'button', class: 'dbtn', onclick: () => d.close() }, 'Close'))));
    d.addEventListener('close', () => d.remove()); document.body.append(d); d.showModal();
    try {
      const s = await f.getDocs(f.query(f.collection(o.db, 'billableEntryAudit'), f.where('entryId', '==', e.id)));
      const a = s.docs.map(x => x.data()).sort((x, y) => (Number(x.rev) || 0) - (Number(y.rev) || 0));
      const L = { create: 'Created as a draft', edit: 'Draft edited', submit: 'Submitted', reopen: 'Reopened as a draft', approve: 'Approved', supersede: 'Replaced by a newer entry' };
      list.replaceChildren(...(a.length ? a.map(x => el('div', { class: 'cidh' }, el('strong', {}, '#' + x.rev + ' · ' + (L[x.action] || x.action)), el('span', { class: 'libmeta' }, fmtDate(x.createdAt)),
        el('span', { class: 'libmeta' }, 'Submitted ' + hm(x.submittedMinutes) + (x.approvedMinutes != null ? ' · approved ' + hm(x.approvedMinutes) : '')), x.reason ? el('span', { class: 'libmeta' }, 'Reason: ' + x.reason) : null)) : [el('p', { class: 'dstate' }, 'No history found.')]));
    } catch (er) { list.replaceChildren(el('p', { class: 'ferr' }, 'Could not load the history. ' + errText(er))); }
  }

  /* ---------------------------------------------------------------- new entry form */
  function drawClientSelects() {
    const ok = registry.filter(r => profiles.indexOf(r.id) >= 0 && r.status === 'active').map(r => r.id).sort();
    $('bhClient').replaceChildren(el('option', { value: '' }, ok.length ? 'Choose a Client ID' : 'No client with a billing profile yet'), ...ok.map(c => el('option', { value: c }, c)));
    const all = Array.from(new Set(entries.map(e => e.clientId))).sort(), cur = $('bhFilter').value;
    $('bhFilter').replaceChildren(el('option', { value: '' }, 'All clients'), ...all.map(c => el('option', { value: c }, c))); if (all.indexOf(cur) >= 0) $('bhFilter').value = cur;
  }
  async function saveDraft() {
    say('bhErr', ''); const c = $('bhClient').value; if (!c) { say('bhErr', 'Choose a Client ID. Create its billing profile first if it is not in the list.'); return; }
    const r = await run('create', { clientId: c, periodStart: $('bhStart').value, periodEnd: $('bhEnd').value, minutes: $('bhHours').value, note: $('bhNote').value }, 'Draft saved');
    if (!r.ok) { say('bhErr', r.reason || 'Not saved.'); return; }
    $('bhHours').value = ''; $('bhNote').value = '';
  }
  function reference() {
    const c = $('bhClient').value, s = $('bhStart').value, e = $('bhEnd').value, R = window.coreWtReport, h = window.__wthist;
    if (!c || !s || !e || !R || !h || !h.loaded) { say('bhRef', 'WorkTrack reference: open WorkTrack > History and reports and load these dates to see your attendance here. It is a reference only and is never split between clients.'); return; }
    if (h.loaded.from > s || h.loaded.to < e) { say('bhRef', 'WorkTrack reference: the report you loaded covers ' + h.loaded.from + ' to ' + h.loaded.to + ', not these dates. It is a reference only and is never split between clients.'); return; }
    const rows = h.rows.filter(r => r.date >= s && r.date <= e), sm = R.summarize(rows).overall;
    say('bhRef', 'WorkTrack reference for ' + s + ' to ' + e + ': ' + R.hm(sm.workingMs) + ' working time over ' + sm.sessions + ' complete session' + (sm.sessions === 1 ? '' : 's') + ' (all clients together, not split between clients). Your billable hours below are your own entry.');
  }

  /* ---------------------------------------------------------------- list */
  const badgeClass = st => st === 'APPROVED' ? 'bb-ok' : st === 'SUPERSEDED' ? 'bb-neutral' : 'bb-info';
  function draw() {
    drawClientSelects(); reference();
    const fc = $('bhFilter').value, fs = $('bhStatus').value;
    const list = entries.filter(e => (!fc || e.clientId === fc) && (fs === 'all' || (fs === 'open' ? (e.status === 'DRAFT' || e.status === 'SUBMITTED') : e.status === fs)))
      .sort((a, b) => a.periodStart < b.periodStart ? 1 : a.periodStart > b.periodStart ? -1 : a.id < b.id ? 1 : -1);
    say('bhState', entries.length + ' entr' + (entries.length === 1 ? 'y' : 'ies') + ' in total, ' + list.length + ' shown.');
    const shown = new Set(); const sums = [];
    list.forEach(e => { const k = e.clientId + e.periodStart + e.periodEnd; if (!shown.has(k)) { shown.add(k); const s = B.periodSummary(entries, e.clientId, iso(e.periodStart), iso(e.periodEnd)); sums.push(el('div', { class: 'dhelp' }, el('strong', {}, e.clientId + ' · ' + iso(e.periodStart) + ' to ' + iso(e.periodEnd)), ': approved ' + hm(s.approvedMinutes) + ' h (' + dec(s.approvedMinutes) + ' decimal) in ' + s.approvedCount + ' entr' + (s.approvedCount === 1 ? 'y' : 'ies') + (s.openCount ? ', ' + s.openCount + ' not approved yet' : ''))); } });
    $('bhSums').replaceChildren(...sums);
    $('bhList').replaceChildren(...(list.length ? list.map(e => {
      const btn = (t, f, cls) => el('button', { type: 'button', class: 'dbtn' + (cls ? ' ' + cls : ''), 'aria-label': t + ' ' + e.id, onclick: f }, t);
      const acts = [];
      if (e.status === 'DRAFT') acts.push(btn('Edit', () => edit(e).then(() => draw())), btn('Submit', () => submit(e), 'primary'));
      if (e.status === 'SUBMITTED') acts.push(btn('Approve', () => approve(e).then(() => draw()), 'primary'), btn('Reopen', () => reopen(e).then(() => draw())));
      if (e.status === 'APPROVED') acts.push(btn('Replace', () => replace(e).then(() => draw())));
      acts.push(btn('History', () => history(e)));
      return el('div', { class: 'cidrow' + (e.status === 'SUPERSEDED' ? ' bhold' : '') },
        el('div', { class: 'cidmain' }, el('strong', { class: 'cidid' }, e.clientId + ' · ' + iso(e.periodStart) + ' to ' + iso(e.periodEnd) + ' · #' + e.seq), el('span', { class: 'bbadge ' + badgeClass(e.status) }, B.statusLabel(e)),
          el('span', { class: 'libmeta' }, 'Submitted ' + hm(e.submittedMinutes) + ' h (' + dec(e.submittedMinutes) + ')' + (e.approvedMinutes != null ? ' · approved ' + hm(e.approvedMinutes) + ' h (' + dec(e.approvedMinutes) + ')' : '') + (e.approvedAt ? ' · ' + fmtDate(e.approvedAt) : ''))),
        e.note ? el('div', { class: 'dhelp cidnote' }, e.note) : null,
        e.supersedes ? el('div', { class: 'dhelp' }, 'Replaces ' + e.supersedes) : null, e.supersededBy ? el('div', { class: 'dhelp' }, 'Replaced by ' + e.supersededBy + ' (these hours no longer count)') : null,
        el('div', { class: 'dact-row' }, ...acts));
    }) : [el('p', { class: 'dstate' }, 'No entries to show.')]));
  }
  async function show() {
    if (!signed) return; say('bhState', 'Loading…');
    try { await load(); draw(); } catch (e) { say('bhState', 'Could not load. ' + errText(e)); }
  }
  function init() {
    $('bhSave').addEventListener('click', saveDraft); $('bhRefresh').addEventListener('click', show);
    ['bhClient', 'bhStart', 'bhEnd'].forEach(i => $(i).addEventListener('change', reference)); ['bhFilter', 'bhStatus'].forEach(i => $(i).addEventListener('change', draw));
    document.addEventListener('dash:page', e => { if (e.detail === 'billhours') show(); });
    document.addEventListener('own:auth', e => { signed = !!(e.detail && e.detail.ok); registry = []; profiles = []; entries = []; if (!signed) { ['bhList', 'bhSums'].forEach(i => $(i).replaceChildren()); ['bhState', 'bhErr', 'bhRef'].forEach(i => say(i, '')); } });
    window.__billhours = { get entries() { return entries; } };      // read-only test hook
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
