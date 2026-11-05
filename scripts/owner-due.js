/* ==========================================================================
   owner-due.js - Owner Panel > Billing due (CodeFlow 4.5.0, phase B3)
   Shows each hourly client's billing periods, worked out from the billing profile schedule (core-schedule.js). Nothing about a period is stored
   except a period you SKIP (create-only record, with your reason). Nothing is created, sent or emailed for you and nothing runs while the panel is closed.
   From a row you jump to Billable hours (dates filled in) or to Invoices (the period preselected); those pages do the saving, as in B1 and B2.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, S = window.coreSchedule, I = window.coreIds, T = window.coreTime; if (!kit || !S || !I || !T) return;
  const { el, notify } = kit;
  const $ = id => document.getElementById(id), own = () => window.OWN;
  let signed = false, st = null, rows = [], picked = {};                  // picked: { clientId: 'YYYY-MM-DD' } the owner's first-period choice for a client with no history (this visit only)
  const errText = e => (e && e.code === 'permission-denied') ? 'The database refused this (permission denied). Publish the newest firestore.rules.strict, sign in again, then refresh this page.' : ((e && e.message) || 'Something went wrong.');
  const say = (id, msg) => { const n = $(id); if (n) n.textContent = msg || ''; };
  const written = paths => document.dispatchEvent(new CustomEvent('wt:written', { detail: { paths } }));
  const BADGE = { waiting: 'bb-warn', draft: 'bb-info', submitted: 'bb-info', ready: 'bb-ok', toomany: 'bb-bad', invoiced: 'bb-neutral', partial: 'bb-bad', skipped: 'bb-neutral', check: 'bb-bad' };

  /* ---------------------------------------------------------------- data */
  async function load() {
    const o = own(), f = o.fs, all = c => f.getDocs(f.query(f.collection(o.db, c))).then(s => s.docs.map(d => Object.assign({ id: d.id }, d.data())));
    const [registry, profiles, entries, invoices, skips] = await Promise.all(['clientRegistry', 'billingProfiles', 'billableEntries', 'invoices', 'periodSkips'].map(all));
    st = { registry, profiles, entries, invoices, skips };
  }
  /* the rows to show: one block per active client with a billing profile */
  function build(nowMs) {
    const out = [];
    st.registry.filter(r => r.status === 'active').sort((a, b) => a.id < b.id ? -1 : 1).forEach(r => {
      const p = st.profiles.find(x => x.id === r.id); if (!p) return;
      const blk = { clientId: r.id, profile: p, periods: [], hidden: 0, note: '', start: '', choose: false, next: null };
      if (p.arrangement !== 'hourly') { blk.note = 'Monthly arrangement: no hours invoice, so no billing periods here yet.'; out.push(blk); return; }
      try {
        let from = S.listStart(p, r.id, st.entries, st.invoices, st.skips, nowMs);
        if (!from) {
          blk.choose = true; const d = picked[r.id];
          if (!d) { const ld = S.lastDue(p, nowMs); blk.suggest = ld ? ld.start : ''; out.push(blk); return; }
          from = S.periodAt(p, d).start;
        }
        blk.start = from;
        const dp = S.duePeriods(p, from, nowMs); blk.hidden = dp.hidden; blk.next = dp.next;
        blk.periods = dp.periods.map(per => Object.assign({ per, id: S.idOf(r.id, per) }, S.stateOf(r.id, per, st.entries, st.invoices, st.skips))).reverse();
      } catch (e) { blk.note = 'This client\'s schedule could not be read (' + e.message + '). Check the billing profile.'; }
      out.push(blk);
    });
    return out;
  }
  const needs = rows0 => rows0.reduce((n, b) => n + b.periods.filter(x => S.ACTION_STATES.indexOf(x.state) >= 0).length, 0);
  function badge() {
    const n = $('dueBadge'); if (!n) return; const c = st ? needs(rows) : 0;
    n.textContent = String(c); n.hidden = !c; n.setAttribute('aria-label', c + ' billing period' + (c === 1 ? '' : 's') + ' need action');
  }

  /* ---------------------------------------------------------------- jumping to the other pages (they do the saving) */
  function waitFor(test, then) { let n = 0; const t = setInterval(() => { if (test()) { clearInterval(t); then(); } else if (++n > 40) clearInterval(t); }, 150); }
  function goPage(page) { const b = document.querySelector('.dnav button[data-page="' + page + '"]'); if (b) b.click(); }
  function enterHours(clientId, per) {
    goPage('billhours');
    waitFor(() => { const s = $('bhClient'); return s && Array.from(s.options).some(o => o.value === clientId); }, () => {
      $('bhClient').value = clientId; $('bhStart').value = per.start; $('bhEnd').value = per.end;
      ['bhClient', 'bhStart', 'bhEnd'].forEach(i => $(i).dispatchEvent(new Event('change'))); $('bhHours').focus();
    });
  }
  function makeInvoice(clientId, per) {
    goPage('invoices'); const key = clientId + '|' + per.start.replace(/-/g, '') + '|' + per.end.replace(/-/g, '');
    waitFor(() => { const s = $('ivGroup'); return s && Array.from(s.options).some(o => o.value === key); }, () => { $('ivGroup').value = key; $('ivGroup').dispatchEvent(new Event('change')); });
  }

  /* ---------------------------------------------------------------- skipping a period */
  function skipDialog(blk, x) {
    return new Promise(res => {
      const d = el('dialog', { class: 'dmodal', 'aria-labelledby': 'dueDT' }), err = el('p', { class: 'ferr', role: 'alert' }), wait = el('p', { class: 'dstate', role: 'status' });
      const inp = el('input', { type: 'text', maxlength: 200, autocomplete: 'off', 'aria-label': 'Reason' }); let done = false, busy = false;
      const fin = v => { if (done) return; done = true; d.close(); res(v); };
      const ok = el('button', { type: 'button', class: 'dbtn primary', onclick: async () => {
        if (busy) return; busy = true; ok.disabled = true; err.textContent = ''; wait.textContent = 'Saving…';
        const r = await skip(blk, x, inp.value);
        busy = false; ok.disabled = false; wait.textContent = '';
        if (r.ok) fin(true); else err.textContent = r.reason;
      } }, 'Skip this period');
      d.append(el('div', {}, el('h2', { id: 'dueDT' }, 'Skip ' + blk.clientId + ' ' + S.describe(x.per)), el('p', { class: 'dhelp' }, 'A skipped period is left out of the list. You cannot undo it. Say why (3 to 200 characters; kept with your account and the server time). Hours cannot be skipped once they exist.'),
        el('label', { class: 'fld' }, 'Reason', inp), err, wait, el('div', { class: 'dact-row' }, el('button', { type: 'button', class: 'dbtn', onclick: () => fin(false) }, 'Cancel'), ok)));
      d.addEventListener('close', () => { d.remove(); if (!done) { done = true; res(false); } }); document.body.append(d); d.showModal(); inp.focus();
    });
  }
  async function skip(blk, x, reason) {
    const o = own(), f = o.fs;
    try {
      await load(); rows = build(Date.now());
      const stt = S.stateOf(blk.clientId, x.per, st.entries, st.invoices, st.skips).state;
      const reg = st.registry.find(r => r.id === blk.clientId), prof = st.profiles.find(p => p.id === blk.clientId);
      const plan = S.skipPlan(blk.clientId, x.per, reason, { registryStatus: reg ? reg.status : '', profile: prof, nowMs: Date.now(), uid: o.uid(), skips: st.skips, state: stt });
      if (!plan.ok) { draw(); return plan; }
      const d = Object.assign({}, plan.doc, { createdAt: f.serverTimestamp() });
      try { await f.setDoc(f.doc(o.db, 'periodSkips', plan.id), d); }
      catch (e) {
        if (e && e.code === 'permission-denied') { await load(); if (st.skips.some(s => s.id === plan.id)) { rows = build(Date.now()); draw(); badge(); return { ok: true }; } }
        throw e;
      }
      written(['periodSkips/' + plan.id]); own().log && own().log('Billing due: skipped ' + plan.id);
      notify('Period skipped.', 'success'); await load(); rows = build(Date.now()); draw(); badge(); return { ok: true };
    } catch (e) { return { ok: false, reason: 'Could not save. ' + errText(e) }; }
  }

  /* ---------------------------------------------------------------- drawing */
  function actions(blk, x) {
    const a = [], per = x.per;
    if (x.state === 'waiting') { a.push(el('button', { type: 'button', class: 'dbtn primary', onclick: () => enterHours(blk.clientId, per) }, 'Enter hours')); a.push(el('button', { type: 'button', class: 'dbtn', onclick: async () => { await skipDialog(blk, x); } }, 'Skip…')); }
    else if (x.state === 'draft' || x.state === 'submitted' || x.state === 'check' || x.state === 'toomany') a.push(el('button', { type: 'button', class: 'dbtn', onclick: () => goPage('billhours') }, 'Open Billable hours'));
    else if (x.state === 'ready') a.push(el('button', { type: 'button', class: 'dbtn primary', onclick: () => makeInvoice(blk.clientId, per) }, 'Make invoice'));
    else if (x.state === 'invoiced' || x.state === 'partial') a.push(el('button', { type: 'button', class: 'dbtn', onclick: () => goPage('invoices') }, 'Open Invoices'));
    return a;
  }
  function draw() {
    if (!st) return;
    const fc = $('dueFilter').value, show = $('dueShow').value, ids = rows.map(b => b.clientId), cur = fc;
    $('dueFilter').replaceChildren(el('option', { value: '' }, 'All clients'), ...ids.map(c => el('option', { value: c }, c))); if (ids.indexOf(cur) >= 0) $('dueFilter').value = cur;
    const list = rows.filter(b => !$('dueFilter').value || b.clientId === $('dueFilter').value), nodes = [];
    list.forEach(blk => {
      const head = el('div', { class: 'cidmain' }, el('strong', { class: 'cidid' }, blk.clientId), el('span', { class: 'dhelp' }, ' · ' + window.coreBilling.describeSchedule(blk.profile)));
      const kids = [];
      if (blk.note) kids.push(el('p', { class: 'dhelp' }, blk.note));
      if (blk.choose && !blk.periods.length) {
        const inp = el('input', { type: 'date', value: blk.suggest || '', 'aria-label': 'A date in the first period to bill for ' + blk.clientId });
        kids.push(el('p', { class: 'dhelp' }, 'No hours or invoices yet for this client. Choose a date inside the first period you want to bill; the list then runs from that period to the newest finished one.'),
          el('div', { class: 'ab' }, el('label', { class: 'fld' }, 'A date in the first period', inp), el('button', { type: 'button', class: 'dbtn', onclick: () => { if (!inp.value) { notify('Choose a date.', 'error'); return; } picked[blk.clientId] = inp.value; rows = build(Date.now()); draw(); badge(); } }, 'Show periods')));
      }
      const shown = blk.periods.filter(x => show === 'all' || S.ACTION_STATES.indexOf(x.state) >= 0);
      shown.forEach(x => kids.push(el('div', { class: 'cidrow' },
        el('div', { class: 'cidmain' }, el('strong', {}, S.describe(x.per)), ' ', el('span', { class: 'bbadge ' + (BADGE[x.state] || 'bb-neutral') }, S.STATE_LABEL[x.state]),
          el('span', { class: 'dhelp' }, ' due ' + new Date(S.dueAt(blk.profile, x.per)).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: blk.profile.tz }) + ' (' + blk.profile.tz + ')'),
          x.skip ? el('span', { class: 'dhelp' }, ' · reason: ' + x.skip.reason) : '', x.note ? el('span', { class: 'dhelp' }, ' · ' + x.note) : ''),
        el('div', { class: 'dact-row' }, ...actions(blk, x)))));
      if (blk.hidden) kids.push(el('p', { class: 'dhelp' }, blk.hidden + ' older period' + (blk.hidden === 1 ? ' is' : 's are') + ' not shown (the newest ' + S.MAX_LIST + ' are listed). Skip or invoice the newer ones to see more.'));
      if (!shown.length && !blk.note && !blk.choose) kids.push(el('p', { class: 'dstate' }, blk.periods.length ? 'Nothing needs action for this client.' : 'No finished periods yet.' + (blk.next ? ' The next one ends ' + blk.next.end + '.' : '')));
      nodes.push(el('div', { class: 'cidblock' }, head, ...kids));
    });
    $('dueList').replaceChildren(...(nodes.length ? nodes : [el('p', { class: 'dstate' }, 'No active hourly client with a billing profile yet. Create a billing profile first.')]));
    const n = needs(rows); say('dueState', n ? n + ' period' + (n === 1 ? '' : 's') + ' need action.' : 'Nothing needs action right now.');
  }
  async function show() {
    if (!signed) return; say('dueState', 'Loading…');
    try { await load(); rows = build(Date.now()); draw(); badge(); } catch (e) { say('dueState', 'Could not load. ' + errText(e)); }
  }
  async function quiet() {                                                // on sign-in: load only to fill the badge
    if (!signed) return;
    try { await load(); rows = build(Date.now()); badge(); } catch (e) { /* the badge simply stays hidden */ }
  }
  function init() {
    $('dueRefresh').addEventListener('click', show); ['dueFilter', 'dueShow'].forEach(i => $(i).addEventListener('change', draw));
    document.addEventListener('dash:page', e => { if (e.detail === 'due') show(); });
    document.addEventListener('own:auth', e => {
      signed = !!(e.detail && e.detail.ok); st = null; rows = []; picked = {};
      if (!signed) { $('dueList').replaceChildren(); say('dueState', ''); badge(); } else quiet();
    });
    window.__due = { get state() { return st; }, get rows() { return rows; } };      // read-only test hook
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
