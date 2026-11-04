/* ==========================================================================
   owner-billing.js - Owner Panel > Billing profiles (CodeFlow 4.5.0, phase B1)
   One billing profile per Client ID (currency, rate, hourly or monthly, invoice schedule, due rule), a history of every change, and a tool that
   turns your OLD client records into Client IDs + billing profiles. Names, e-mails and phones are NEVER copied: only the ID, the rate and the arrangement.
   B1 stores settings only. It creates no invoice and runs no schedule (that is B3).
   Every create or change is ONE batch: the record plus a brand-new audit record (the database rules enforce this; the checks here give friendly messages first).
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, B = window.coreBilling, ids = window.coreIds, M = window.coreMoney; if (!kit || !B || !ids || !M) return;
  const { el, notify } = kit;
  const $ = id => document.getElementById(id), own = () => window.OWN;
  let signed = false, registry = [], profiles = [], legacy = [], maps = [], defCur = 'USD', fmt = Object.assign({}, ids.DEFAULT_FORMAT), editing = null;
  const errText = e => (e && e.code === 'permission-denied') ? 'The database refused this (permission denied). Publish the newest firestore.rules.strict, sign in again, then refresh this page. If you changed this in another tab, refresh first.' : 'Please try again.';
  const fmtDate = t => { const d = t && typeof t.toDate === 'function' ? t.toDate() : null; return d ? d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; };
  const say = (id, msg) => { const n = $(id); if (n) n.textContent = msg || ''; };
  const written = paths => document.dispatchEvent(new CustomEvent('wt:written', { detail: { paths } }));

  /* ---------------------------------------------------------------- data */
  async function load() {
    const o = own(), f = o.fs;
    const [rs, ps] = await Promise.all([f.getDocs(f.query(f.collection(o.db, 'clientRegistry'))), f.getDocs(f.query(f.collection(o.db, 'billingProfiles')))]);
    registry = rs.docs.map(d => ({ id: d.id, status: d.data().status })).sort((a, b) => a.id < b.id ? -1 : 1);
    profiles = ps.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => a.id < b.id ? -1 : 1);
    try { const m = await f.getDoc(f.doc(o.db, 'ownerPrivate', 'clientIdFormat')); if (m.exists()) { const c = ids.cleanFormat(m.data()); if (c.ok) fmt = c.format; } } catch (e) { /* default */ }
    try { const m = await f.getDoc(f.doc(o.db, 'ownerPrivate', 'config')); if (m.exists() && M.isSupported(m.data().currency)) defCur = m.data().currency; } catch (e) { /* default */ }
  }
  async function loadLegacy() {
    const o = own(), f = o.fs;
    const [ls, ms] = await Promise.all([f.getDocs(f.query(f.collection(o.db, 'clients'))), f.getDocs(f.query(f.collection(o.db, 'billingMigration')))]);
    legacy = ls.docs.map(d => { const x = d.data(); return { id: d.id, name: String(x.name || x.company || ''), rate: x.rate == null ? '' : x.rate, arrangement: x.arrangement, status: x.status || '' }; });
    maps = ms.docs.map(d => ({ legacyId: d.id, clientId: d.data().clientId }));
  }
  const byId = id => profiles.find(p => p.id === id) || null;
  const statusOf = id => { const r = registry.find(x => x.id === id); return r ? r.status : ''; };

  /* ---------------------------------------------------------------- profile form */
  const F = ['bpCur', 'bpRate', 'bpArr', 'bpSched', 'bpWeek', 'bpAnch', 'bpGen', 'bpTz', 'bpDueKind', 'bpDueDays', 'bpDueDate'];
  function readForm() {
    return { currency: $('bpCur').value, rate: $('bpRate').value, arrangement: $('bpArr').value, schedKind: $('bpSched').value, weekStart: $('bpWeek').value, anchors: $('bpAnch').value, genTime: $('bpGen').value, tz: $('bpTz').value, dueKind: $('bpDueKind').value, dueDays: $('bpDueDays').value, dueDate: $('bpDueDate').value };
  }
  function fillForm(p) {
    const d = p ? { currency: p.currency, rate: p.rateMinor ? M.fromMinor(p.rateMinor, p.currency) : '', arrangement: p.arrangement, schedKind: p.schedKind, weekStart: p.weekStart, anchors: p.anchors, genTime: p.genTime, tz: p.tz, dueKind: p.dueKind, dueDays: String(p.dueDays), dueDate: p.dueDate } : Object.assign(B.defaults(), { currency: defCur, dueDays: String(B.DEFAULT_DUE_DAYS) });
    $('bpCur').value = d.currency; $('bpRate').value = d.rate; $('bpArr').value = d.arrangement; $('bpSched').value = d.schedKind; $('bpWeek').value = d.weekStart; $('bpAnch').value = d.anchors; $('bpGen').value = d.genTime; $('bpTz').value = d.tz;
    $('bpDueKind').value = d.dueKind; $('bpDueDays').value = d.dueDays; $('bpDueDate').value = d.dueDate; $('bpReason').value = ''; showHide(); say('bpErr', ''); F.concat(['bpReason']).forEach(i => $(i).removeAttribute('aria-invalid'));
  }
  function showHide() {
    const k = $('bpSched').value, due = $('bpDueKind').value;
    $('bpWeekWrap').hidden = k !== 'weekly'; $('bpAnchWrap').hidden = k !== 'custom'; $('bpDueDaysWrap').hidden = due === 'fixed'; $('bpDueDateWrap').hidden = due !== 'fixed';
    const c = byId($('bpClient').value); $('bpReasonWrap').hidden = !c; $('bpSave').textContent = c ? 'Save changes' : 'Create profile';
  }
  function pickClient() {
    const id = $('bpClient').value; editing = id; const p = byId(id); fillForm(p); showHide();
    say('bpPick', !id ? 'Choose a Client ID. Add IDs on the Client IDs page first.' : p ? 'Editing the billing profile of ' + id + ' (revision ' + p.rev + ').' : id + ' has no billing profile yet.');
  }
  function drawClientSelect(keep) {
    const act = registry.filter(r => r.status === 'active' || byId(r.id));
    $('bpClient').replaceChildren(el('option', { value: '' }, act.length ? 'Choose a Client ID' : 'No Client IDs yet'), ...act.map(r => el('option', { value: r.id }, r.id + (byId(r.id) ? ' (has a profile)' : '') + (r.status === 'archived' ? ' - archived' : ''))));
    if (keep && act.some(r => r.id === keep)) $('bpClient').value = keep;
  }
  const mark = (errors) => { F.forEach(i => $(i).removeAttribute('aria-invalid')); const map = { currency: 'bpCur', rate: 'bpRate', arrangement: 'bpArr', schedKind: 'bpSched', weekStart: 'bpWeek', anchors: 'bpAnch', genTime: 'bpGen', tz: 'bpTz', dueKind: 'bpDueKind', dueDays: 'bpDueDays', dueDate: 'bpDueDate' }; Object.keys(errors || {}).forEach(k => { const n = $(map[k]); if (n) n.setAttribute('aria-invalid', 'true'); }); };
  async function commitProfile(plan, cur) {
    const o = own(), f = o.fs, b = f.writeBatch(), ref = f.doc(o.db, 'billingProfiles', plan.id);
    b.set(ref, Object.assign({}, plan.doc, { createdAt: cur ? cur.createdAt : f.serverTimestamp(), updatedAt: f.serverTimestamp() }));
    b.set(f.doc(o.db, 'billingProfileAudit', plan.doc.lastAudit), Object.assign({}, plan.audit, { actor: o.uid(), createdAt: f.serverTimestamp() }));
    await b.commit(); written(['billingProfileAudit/' + plan.doc.lastAudit]);
  }
  async function saveProfile() {
    say('bpErr', ''); const id = $('bpClient').value; if (!id) { say('bpErr', 'Choose a Client ID first.'); return; }
    const o = own(), f = o.fs;
    try {
      const s = await f.getDoc(f.doc(o.db, 'billingProfiles', id)), cur = s.exists() ? s.data() : null;
      const known = byId(id); if ((cur ? cur.rev : 0) !== (known ? known.rev : 0)) { await refresh(id); say('bpErr', 'This profile was changed elsewhere. It was refreshed - please check it and try again.'); return; }
      const rs = await f.getDoc(f.doc(o.db, 'clientRegistry', id));
      const plan = B.profilePlan(id, cur, readForm(), { aid: ids.newKey(), reason: $('bpReason').value, registryStatus: rs.exists() ? rs.data().status : '' });
      if (!plan.ok) { mark(plan.errors); const first = plan.errors ? Object.keys(plan.errors).map(k => plan.errors[k])[0] : ''; say('bpErr', (plan.reason || '') + (first ? ' ' + first : '')); if (!plan.errors && /reason/i.test(plan.reason)) $('bpReason').setAttribute('aria-invalid', 'true'); return; }
      mark({});
      if (plan.kind === 'update' && plan.keyChange && !window.confirm('You are changing the currency, rate or arrangement of ' + id + '. It applies to invoices made from now on. Continue?')) return;
      await commitProfile(plan, cur);
      own().log && own().log('Billing profile ' + (plan.kind === 'create' ? 'created: ' : 'changed: ') + id);
      notify('Billing profile ' + (plan.kind === 'create' ? 'created' : 'saved') + ' for ' + id + '.', 'success'); await refresh(id);
    } catch (e) { say('bpErr', 'Could not save. ' + errText(e)); }
  }

  /* ---------------------------------------------------------------- list + history */
  async function history(p) {
    const o = own(), f = o.fs, d = el('dialog', { class: 'dmodal', 'aria-labelledby': 'bpHT' }), list = el('div', { class: 'cidhist' }, el('p', { class: 'dstate' }, 'Loading…'));
    d.append(el('div', {}, el('h2', { id: 'bpHT' }, 'History of the billing profile of ' + p.id), list, el('div', { class: 'dact-row' }, el('button', { type: 'button', class: 'dbtn', onclick: () => d.close() }, 'Close'))));
    d.addEventListener('close', () => d.remove()); document.body.append(d); d.showModal();
    try {
      const s = await f.getDocs(f.query(f.collection(o.db, 'billingProfileAudit'), f.where('clientId', '==', p.id)));
      const a = s.docs.map(x => x.data()).sort((x, y) => (Number(x.rev) || 0) - (Number(y.rev) || 0));
      list.replaceChildren(...(a.length ? a.map(x => el('div', { class: 'cidh' }, el('strong', {}, '#' + x.rev + ' · ' + (x.action === 'create' ? 'Created' : 'Changed')), el('span', { class: 'libmeta' }, fmtDate(x.createdAt)), el('span', { class: 'libmeta' }, x.summary), x.reason ? el('span', { class: 'libmeta' }, 'Reason: ' + x.reason) : null)) : [el('p', { class: 'dstate' }, 'No history found.')]));
    } catch (e) { list.replaceChildren(el('p', { class: 'ferr' }, 'Could not load the history. ' + errText(e))); }
  }
  function drawList() {
    say('bpState', profiles.length + ' billing profile' + (profiles.length === 1 ? '' : 's') + '.');
    $('bpList').replaceChildren(...(profiles.length ? profiles.map(p => el('div', { class: 'cidrow' + (statusOf(p.id) === 'archived' ? ' bhold' : '') },
      el('div', { class: 'cidmain' }, el('strong', { class: 'cidid' }, p.id), el('span', { class: 'bbadge ' + (statusOf(p.id) === 'archived' ? 'bb-neutral' : 'bb-ok') }, statusOf(p.id) === 'archived' ? 'Archived client' : 'Active'), el('span', { class: 'libmeta' }, 'Revision ' + p.rev + ' · updated ' + fmtDate(p.updatedAt))),
      el('div', { class: 'dhelp' }, B.rateText(p) + ' (' + p.arrangement + ')'), el('div', { class: 'dhelp' }, B.describeSchedule(p)), el('div', { class: 'dhelp' }, B.describeDue(p)),
      el('div', { class: 'dact-row' },
        el('button', { type: 'button', class: 'dbtn', 'aria-label': 'Edit the billing profile of ' + p.id, onclick: () => { $('bpClient').value = p.id; pickClient(); $('bpClient').scrollIntoView({ block: 'center' }); $('bpClient').focus(); } }, 'Edit'),
        el('button', { type: 'button', class: 'dbtn', 'aria-label': 'History of the billing profile of ' + p.id, onclick: () => history(p) }, 'History')))) : [el('p', { class: 'dstate' }, 'No billing profiles yet.')]));
  }

  /* ---------------------------------------------------------------- migration of old client records */
  function ctx() { return { currency: defCur, registry, profiles: profiles.map(p => p.id) }; }
  function drawMigration() {
    const rows = B.migrationRows(legacy, maps, ctx()), todo = rows.filter(r => r.state !== 'done');
    say('mgState', legacy.length ? rows.length + ' old client record' + (rows.length === 1 ? '' : 's') + ': ' + (rows.length - todo.length) + ' already migrated, ' + todo.length + ' waiting.' : 'No old client records found. Nothing to migrate.');
    $('mgList').replaceChildren(...rows.map(r => {
      if (r.state === 'done') return el('div', { class: 'cidrow bhold' }, el('div', { class: 'cidmain' }, el('strong', {}, r.label), el('span', { class: 'bbadge bb-neutral' }, 'Migrated to ' + r.mapped)));
      const mode = el('select', { 'aria-label': 'What to do with ' + r.label }, el('option', { value: 'skip' }, 'Do nothing for now'), el('option', { value: 'new' }, 'Create a new Client ID'), el('option', { value: 'existing' }, 'Use an existing Client ID'));
      const pick = el('select', { 'aria-label': 'Existing Client ID for ' + r.label, hidden: true }, ...registry.filter(x => x.status === 'active' && !byId(x.id)).map(x => el('option', { value: x.id }, x.id)));
      const chk = el('input', { type: 'checkbox', 'aria-label': 'I have checked ' + r.label }), go = el('button', { type: 'button', class: 'dbtn primary', disabled: r.state === 'blocked' }, 'Migrate'), err = el('p', { class: 'ferr', role: 'alert' });
      mode.addEventListener('change', () => { pick.hidden = mode.value !== 'existing'; });
      go.addEventListener('click', async () => {
        err.textContent = ''; if (mode.value === 'skip') { err.textContent = 'Choose what to do first.'; return; }
        go.disabled = true;
        try { const res = await migrate(r, { mode: mode.value, clientId: pick.value, confirmReview: chk.checked }); if (!res.ok) err.textContent = res.reason; } catch (e) { err.textContent = 'Could not migrate. ' + errText(e); }
        go.disabled = r.state === 'blocked';
      });
      return el('div', { class: 'cidrow' }, el('div', { class: 'cidmain' }, el('strong', {}, r.label), el('span', { class: 'bbadge ' + (r.state === 'ready' ? 'bb-ok' : r.state === 'review' ? 'bb-warn' : 'bb-neutral') }, r.state === 'ready' ? 'Ready' : r.state === 'review' ? 'Needs review' : 'Blocked'),
        el('span', { class: 'libmeta' }, (r.rateText ? r.currency + ' ' + r.rateText : 'no rate') + ' · ' + r.arrangement)),
        ...r.notes.map(n => el('div', { class: 'dhelp' }, n)),
        el('div', { class: 'ab' }, mode, pick, r.state === 'review' ? el('label', {}, chk, ' I have checked this client') : null, go), err);
    }));
  }
  async function migrate(row, choice) {
    const o = own(), f = o.fs; await load(); await loadLegacy();
    const fresh = B.migrationRows(legacy, maps, ctx()).find(x => x.id === row.id); if (!fresh || fresh.state === 'done') { drawMigration(); return { ok: false, reason: 'Already migrated. The list was refreshed.' }; }
    const plan = B.migrationPlan(fresh, choice, { aids: { profile: ids.newKey(), registry: ids.newKey() }, uid: o.uid(), existingIds: registry.map(r => r.id), registry, profiles: profiles.map(p => p.id), format: fmt });
    if (!plan.ok) return plan;
    const ok = window.confirm('Create ' + (plan.registryNew ? 'the new Client ID ' + plan.newId + ' and ' : '') + 'a billing profile for ' + plan.newId + ' from this old client record? Only the ID, the rate and hourly/monthly are copied. No name, e-mail or phone is stored.');
    if (!ok) return { ok: false, reason: 'Cancelled.' };
    const b = f.writeBatch(), paths = [];
    plan.writes.forEach(w => {
      const d = Object.assign({}, w.doc);
      if (w.coll === 'clientRegistry' || w.coll === 'billingProfiles') { d.createdAt = f.serverTimestamp(); d.updatedAt = f.serverTimestamp(); }
      else { d.createdAt = f.serverTimestamp(); if (w.coll === 'billingMigration') d.by = o.uid(); else d.actor = o.uid(); }
      b.set(f.doc(o.db, w.coll, w.id), d); if (w.coll === 'billingProfileAudit' || w.coll === 'billingMigration') paths.push(w.coll + '/' + w.id);
    });
    await b.commit(); written(paths);
    own().log && own().log('Old client record migrated to ' + plan.newId);
    notify('Migrated to ' + plan.newId + '.', 'success'); await refresh(plan.newId); return { ok: true };
  }

  /* ---------------------------------------------------------------- wiring */
  async function refresh(keep) {
    await load(); await loadLegacy(); drawClientSelect(keep || editing); pickClient(); drawList(); drawMigration();
  }
  async function show() {
    if (!signed) return; say('bpState', 'Loading…');
    try { await refresh(editing); } catch (e) { say('bpState', 'Could not load. ' + errText(e)); }
  }
  function init() {
    try { const z = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['Asia/Manila', 'UTC']; $('bpZoneList').replaceChildren(...z.concat(['UTC']).map(x => el('option', { value: x }))); } catch (e) { /* free text still works */ }
    $('bpCur').replaceChildren(...['USD', 'GBP', 'EUR', 'AUD', 'CAD', 'PHP', 'JPY', 'KWD'].map(c => el('option', { value: c }, c)));
    $('bpClient').addEventListener('change', pickClient); $('bpSched').addEventListener('change', showHide); $('bpDueKind').addEventListener('change', showHide);
    $('bpSave').addEventListener('click', saveProfile); $('bpRefresh').addEventListener('click', show); $('mgRefresh').addEventListener('click', async () => { try { await load(); await loadLegacy(); drawMigration(); } catch (e) { say('mgState', 'Could not load. ' + errText(e)); } });
    document.addEventListener('dash:page', e => { if (e.detail === 'billing') show(); });
    document.addEventListener('own:auth', e => { signed = !!(e.detail && e.detail.ok); registry = []; profiles = []; legacy = []; maps = []; editing = null; if (!signed) { ['bpList', 'mgList'].forEach(i => $(i).replaceChildren()); ['bpState', 'bpErr', 'mgState', 'bpPick'].forEach(i => say(i, '')); } });
    window.__billing = { get profiles() { return profiles; }, get registry() { return registry; } };      // read-only test hook
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
