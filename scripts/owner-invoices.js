/* ==========================================================================
   owner-invoices.js - Owner Panel > Invoices (CodeFlow 4.5.0, phase B2)
   Make an invoice from approved billable hours, move it Draft -> Ready -> Sent, record payments, credits, reversals, adjustments and due-date changes.
   Every step is ONE batch: the invoice change plus a brand-new record that explains it. The rules check it again on the server.
   The payment state (Unpaid / Partially paid / Paid) and "Overdue" are worked out here from the records; they are never typed or stored as text.
   No email and no PDF: "Sent" is a mark you make yourself after you sent the invoice some other way.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, V = window.coreInvoice, M = window.coreMoney, I = window.coreIds, T = window.coreTime; if (!kit || !V || !M || !I || !T) return;
  const { el, notify } = kit;
  const $ = id => document.getElementById(id), own = () => window.OWN;
  let signed = false, st = null;
  const empty = () => ({ registry: [], profiles: [], entries: [], invoices: [], payments: [], reversals: [], adjustments: [], dues: [], audits: [] });
  const errText = e => (e && e.code === 'permission-denied') ? 'The database refused this (permission denied). Publish the newest firestore.rules.strict, sign in again, then refresh this page. If you changed this in another tab, refresh first.' : 'Please try again. ' + ((e && e.message) || '');
  const fmtDate = t => { const d = t && typeof t.toDate === 'function' ? t.toDate() : null; return d ? d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; };
  const say = (id, msg) => { const n = $(id); if (n) n.textContent = msg || ''; };
  const hm = min => min == null ? '' : String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  const iso = d => d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6);
  const money = (minor, cur) => { try { return M.format(minor, cur); } catch (e) { return String(minor) + ' ' + cur; } };
  const written = paths => document.dispatchEvent(new CustomEvent('wt:written', { detail: { paths } }));
  const newKey = () => I.newKey();
  const AUDITED = ['invoiceAudit', 'payments', 'paymentReversals', 'invoiceAdjustments', 'invoiceDueDates', 'billableEntryAudit'];

  /* ---------------------------------------------------------------- data */
  async function load() {
    const o = own(), f = o.fs, all = c => f.getDocs(f.query(f.collection(o.db, c))).then(s => s.docs.map(d => Object.assign({ id: d.id }, d.data())));
    const [registry, profiles, entries, invoices, payments, reversals, adjustments, dues, audits] = await Promise.all(['clientRegistry', 'billingProfiles', 'billableEntries', 'invoices', 'payments', 'paymentReversals', 'invoiceAdjustments', 'invoiceDueDates', 'invoiceAudit'].map(all));
    st = { registry, profiles, entries, invoices, payments, reversals, adjustments, dues, audits };
  }
  const regStatus = id => { const r = st.registry.find(x => x.id === id); return r ? r.status : ''; };
  const profileOf = id => st.profiles.find(x => x.id === id) || null;
  const of = (list, inv) => list.filter(x => x.invoiceId === inv.id);
  const derived = inv => V.derive(inv, of(st.payments, inv), of(st.reversals, inv), of(st.adjustments, inv), Date.now());
  /* one batch for a plan */
  async function commit(plan) {
    const o = own(), f = o.fs, b = f.writeBatch(), paths = [];
    plan.writes.forEach(w => {
      const d = Object.assign({}, w.doc); Object.keys(d).forEach(k => { if (d[k] === V.SERVER_TIME) d[k] = f.serverTimestamp(); });
      if (w.coll === 'invoices' || w.coll === 'billableEntries') { d.updatedAt = f.serverTimestamp(); if (w.coll === 'invoices' && w.kind === 'create') d.createdAt = f.serverTimestamp(); }
      else { d.actor = o.uid(); d.createdAt = f.serverTimestamp(); }
      b.set(f.doc(o.db, w.coll, w.id), d);
      if (w.kind === 'create' && AUDITED.indexOf(w.coll) >= 0) paths.push(w.coll + '/' + w.id);
    });
    await b.commit(); written(paths);
  }
  /* reload, check the invoice is still the one the person was looking at, build a plan with fresh data, save it */
  async function act(invId, knownRev, label, build, early) {
    try {
      await load();
      const cur = invId ? st.invoices.find(i => i.id === invId) : null;
      if (invId && !cur) return { ok: false, reason: 'That invoice was not found. Refresh the page.' };
      const pre = early ? await early(cur) : null;                     // a retry of something that already saved is answered BEFORE the revision check
      if (pre) { if (pre.ok) { notify(pre.already, 'success'); draw(); } return pre; }
      if (cur && knownRev != null && cur.rev !== knownRev) { draw(); return { ok: false, reason: 'This invoice changed elsewhere (another tab, or an earlier try that did save). The page was refreshed - please check it and try again.' }; }
      const plan = await build(cur); if (!plan.ok) return plan;
      if (plan.already) { notify(plan.already, 'success'); draw(); return { ok: true }; }
      await commit(plan); own().log && own().log('Invoices: ' + label);
      notify(label + '.', 'success'); await load(); draw(); return { ok: true, id: plan.id };
    } catch (e) { return { ok: false, reason: 'Could not save. ' + errText(e) }; }
  }

  /* ---------------------------------------------------------------- dialog */
  /* fields: { key, label, type: 'text'|'date'|'select', value, max, options:[{v,t}] }.  submit(values) -> { ok, reason } ; the dialog stays open (same payment ID) until it succeeds */
  function form(title, help, fields, okLabel, submit) {
    return new Promise(res => {
      const d = el('dialog', { class: 'dmodal', 'aria-labelledby': 'ivDT' }), err = el('p', { class: 'ferr', role: 'alert' }), wait = el('p', { class: 'dstate', role: 'status' }), inputs = {};
      let done = false, busy = false; const fin = v => { if (done) return; done = true; d.close(); res(v); };
      const rows = fields.map(f => {
        const i = f.type === 'select' ? el('select', { 'aria-label': f.label }, ...f.options.map(o => el('option', { value: o.v }, o.t))) : el('input', { type: f.type === 'date' ? 'date' : 'text', maxlength: f.max || 200, autocomplete: 'off', 'aria-label': f.label });
        i.value = f.value || ''; inputs[f.key] = i; return el('label', { class: 'fld' }, f.label, i);
      });
      const ok = el('button', { type: 'button', class: 'dbtn primary', onclick: async () => {
        if (busy) return; const v = {}; fields.forEach(f => { v[f.key] = inputs[f.key].value.trim(); });
        err.textContent = ''; busy = true; ok.disabled = true; wait.textContent = 'Saving… waiting for the server to confirm. Nothing is recorded until it does.';
        const slow = setTimeout(() => { wait.textContent = 'Still waiting for the server. If you are offline, nothing has been recorded yet. You can wait, or close this and refresh the page to check. Pressing Save again is safe: it cannot record the same entry twice.'; }, 12000);
        let r; try { r = await submit(v); } catch (e) { r = { ok: false, reason: 'Could not save. ' + errText(e) }; }
        clearTimeout(slow); busy = false; ok.disabled = false; wait.textContent = '';
        if (!r.ok) { err.textContent = r.reason || 'Not saved.'; return; } fin(v);
      } }, okLabel);
      d.append(el('div', {}, el('h2', { id: 'ivDT' }, title), el('p', { class: 'dhelp' }, help), ...rows, err, wait, el('div', { class: 'dact-row' }, el('button', { type: 'button', class: 'dbtn', onclick: () => fin(null) }, 'Cancel'), ok)));
      d.addEventListener('close', () => { d.remove(); if (!done) { done = true; res(null); } }); document.body.append(d); d.showModal(); (fields.length ? inputs[fields[0].key] : ok).focus();
    });
  }

  /* ---------------------------------------------------------------- make an invoice */
  function groups() {
    return V.readyGroups(st.entries).filter(g => regStatus(g.clientId) === 'active').map(g => {
      const p = profileOf(g.clientId); let why = '';
      if (!p) why = 'no billing profile'; else if (p.arrangement !== 'hourly') why = 'billed a monthly fee (hours invoices are for hourly clients)'; else if (!(p.rateMinor > 0)) why = 'the billing profile has no hourly rate';
      return Object.assign({ why, profile: p }, g);
    });
  }
  let picked = [];
  function drawMake() {
    const gs = groups(), sel = $('ivGroup'), cur = sel.value;
    sel.replaceChildren(el('option', { value: '' }, gs.length ? 'Choose a client and period' : 'No approved hours are waiting for an invoice'), ...gs.map(g => el('option', { value: g.clientId + '|' + g.periodStart + '|' + g.periodEnd }, g.clientId + ' · ' + iso(g.periodStart) + ' to ' + iso(g.periodEnd) + ' · ' + hm(g.minutes) + ' h approved' + (g.why ? ' (cannot invoice: ' + g.why + ')' : ''))));
    if (gs.some(g => g.clientId + '|' + g.periodStart + '|' + g.periodEnd === cur)) sel.value = cur;
    drawPick();
  }
  function curGroup() { const v = $('ivGroup').value; return groups().find(g => g.clientId + '|' + g.periodStart + '|' + g.periodEnd === v) || null; }
  function drawPick() {
    const g = curGroup(), box = $('ivEntries'); say('ivErr', '');
    if (!g) { picked = []; box.replaceChildren(); say('ivPreview', ''); $('ivMake').disabled = true; return; }
    picked = picked.filter(id => g.entries.some(e => e.id === id)); if (!picked.length) picked = g.entries.slice(0, V.MAX_ENTRIES).map(e => e.id);
    box.replaceChildren(...g.entries.map(e => {
      const c = el('input', { type: 'checkbox', id: 'ivE_' + e.id, 'aria-label': 'Include entry ' + e.id }); c.checked = picked.indexOf(e.id) >= 0;
      c.addEventListener('change', () => { picked = picked.filter(x => x !== e.id); if (c.checked) picked.push(e.id); drawPick(); });
      return el('label', { class: 'tog' }, c, ' #' + e.seq + ' · ' + hm(e.approvedMinutes) + ' h approved' + (e.note ? ' · ' + e.note : ''));
    }));
    const p = g.profile, list = g.entries.filter(e => picked.indexOf(e.id) >= 0);
    $('ivMake').disabled = !!g.why || !list.length || list.length > V.MAX_ENTRIES;
    if (g.why) { say('ivPreview', 'This client cannot be invoiced from hours yet: ' + g.why + '.'); return; }
    const t = V.totalFor(p.rateMinor, list.map(e => e.approvedMinutes));
    say('ivPreview', (list.length > V.MAX_ENTRIES ? 'An invoice holds at most ' + V.MAX_ENTRIES + ' approved entries. Untick some; invoice the rest as a second invoice for this period. ' : '') +
      hm(t.minutes) + ' h x ' + money(p.rateMinor, p.currency) + ' per hour = ' + money(t.totalMinor, p.currency) + ' (rounded once, half up, at the total). ' +
      (p.dueKind === 'fixed' ? 'Due ' + p.dueDate + '.' : p.dueKind === 'afterGeneration' ? 'Due ' + p.dueDays + ' days after today.' : 'Due ' + p.dueDays + ' days after you mark it sent.'));
  }
  async function makeInvoice() {
    say('ivErr', ''); const g = curGroup(); if (!g) { say('ivErr', 'Choose a client and period.'); return; }
    const ids = picked.slice();
    const r = await act(null, null, 'Draft invoice created', async () => V.createPlan({ clientId: g.clientId, periodStart: g.periodStart, periodEnd: g.periodEnd, entryIds: ids },
      { aid: newKey(), entryAids: ids.map(() => newKey()), nowMs: Date.now(), profile: profileOf(g.clientId), registryStatus: regStatus(g.clientId), entries: st.entries, invoices: st.invoices }));
    if (!r.ok) say('ivErr', r.reason || 'Not saved.'); else picked = [];
  }

  /* ---------------------------------------------------------------- steps on one invoice */
  const wf = (inv, action, label, extra) => act(inv.id, inv.rev, label, async cur => V.workflowPlan(cur, action, extra || {}, { aid: newKey(), entryAids: cur.entryIds.map(() => newKey()), entries: st.entries, nowMs: Date.now() }));
  async function ready(inv) {
    const r = await wf(inv, 'ready', 'Invoice marked ready'); if (!r.ok) notify(r.reason, 'error');
  }
  async function markSent(inv) {
    await form('Mark as sent', 'This only records that YOU sent the invoice to the client (by email or any other way). Nothing is emailed from here. The amounts stay locked; from now on use payments, credits and adjustments.', [], 'Mark as sent', v => wf(inv, 'send', 'Invoice marked as sent'));
  }
  async function cancel(inv) {
    await form('Cancel this invoice', 'The hours on it are released so you can make a new invoice for the same period. The cancelled invoice stays in the list for the record. Say why.', [{ key: 'reason', label: 'Reason (3 to 200 characters)', max: 200 }], 'Cancel invoice', v => wf(inv, 'cancel', 'Invoice cancelled', { reason: v.reason }));
  }
  async function recordMoney(inv, kind) {
    const payId = newKey(), d = derived(inv), tz = inv.tz, today = T.localDateKey(Date.now(), tz);
    const fixes = st.reversals.filter(r => { const p = st.payments.find(x => x.id === r.id); return p && p.clientId === inv.clientId; }).map(r => ({ v: r.id, t: r.id.slice(0, 8) + '… ' + money(r.amountMinor, inv.currency) + ' (reversed)' }));
    const fields = [{ key: 'amount', label: 'Amount in ' + inv.currency + (kind === 'payment' ? ' (balance ' + money(d.balanceMinor, inv.currency) + ')' : ''), max: 20 }, { key: 'date', label: 'Date received', type: 'date', value: today }, { key: 'method', label: 'Method (optional, e.g. bank transfer)', max: V.MAX_METHOD }, { key: 'note', label: 'Note (optional, no personal details)', max: V.MAX_NOTE }];
    if (kind === 'credit') fields.push({ key: 'reason', label: 'Reason for the extra money (3 to 200 characters)', max: 200 });
    if (fixes.length) fields.push({ key: 'correctionId', label: 'This replaces a reversed payment (optional)', type: 'select', options: [{ v: '', t: 'No' }].concat(fixes) });
    await form(kind === 'payment' ? 'Record a payment' : 'Record a credit', kind === 'payment' ? 'Money you received for this invoice. It cannot be more than the balance. The date cannot be in the future. A mistake is fixed by reversing the whole payment, never by editing it.' : 'Money received beyond a fully paid invoice, kept as a credit with a reason.', fields, 'Save', v => {
      const parse = cur => { const am = V.amountFrom(v.amount, cur.currency, false); return am.ok ? { ok: true, p: { kind, amountMinor: am.minor, date: v.date, method: v.method || '', note: v.note || '', reason: v.reason || '', correctionId: v.correctionId || '' } } : { ok: false, reason: am.error }; };
      return act(inv.id, inv.rev, kind === 'payment' ? 'Payment recorded' : 'Credit recorded', async cur => {
        const q = parse(cur); if (!q.ok) return q;
        const hash = await I.payloadHash(V.paymentPayload(cur, q.p));
        return V.paymentPlan(cur, Object.assign({ id: payId }, q.p, { amount: v.amount }), { hash, nowMs: Date.now(), payments: of(st.payments, cur), reversals: of(st.reversals, cur), adjustments: of(st.adjustments, cur) });
      }, async cur => {
        const have = st.payments.find(x => x.id === payId); if (!have) return null;
        const q = parse(cur); if (!q.ok) return null;
        const k = await I.checkRetry(have.payloadHash, V.paymentPayload(cur, q.p));
        return k === 'same' ? { ok: true, already: 'That entry was already recorded (an earlier try did save). Nothing was added twice.' } : { ok: false, reason: 'A different entry already uses this ID. Close this and refresh.' };
      });
    });
  }
  async function reverse(inv, pay) {
    await form('Reverse this ' + pay.kind, 'The WHOLE ' + money(pay.amountMinor, inv.currency) + ' dated ' + pay.date + ' is reversed and stays in the history. It can be reversed once. If it was entered on the wrong invoice, record it again on the right one afterwards.', [{ key: 'reason', label: 'Reason (3 to 200 characters)', max: 200 }], 'Reverse', v =>
      act(inv.id, inv.rev, 'Payment reversed', async cur => V.reversalPlan(cur, st.payments.find(x => x.id === pay.id), { reason: v.reason }, { reversals: of(st.reversals, cur) })));
  }
  async function adjust(inv) {
    await form('Adjust this sent invoice', 'A signed amount: -25.00 lowers the invoice, +10.00 raises it. The invoice total cannot go below what was already paid. Say why.', [{ key: 'amount', label: 'Amount in ' + inv.currency + ' (use - to lower)', max: 20 }, { key: 'reason', label: 'Reason (3 to 200 characters)', max: 200 }, { key: 'entryRef', label: 'Related entry (optional)', max: 80 }], 'Save adjustment', v =>
      act(inv.id, inv.rev, 'Adjustment recorded', async cur => V.adjustmentPlan(cur, v, { aid: newKey() })));
  }
  async function changeDue(inv) {
    await form('Change the due date', 'Current due date: ' + (inv.dueDate || 'none') + '. The old date, the new date and your reason are kept in the history.', [{ key: 'date', label: 'New due date', type: 'date', value: inv.dueDate }, { key: 'reason', label: 'Reason (3 to 200 characters)', max: 200 }], 'Save', v =>
      act(inv.id, inv.rev, 'Due date changed', async cur => V.dueChangePlan(cur, v, { aid: newKey() })));
  }
  async function history(inv) {
    const d = el('dialog', { class: 'dmodal', 'aria-labelledby': 'ivHT' }), items = [];
    const ev = (t, label, extra) => items.push({ t: t && t.toMillis ? t.toMillis() : (t instanceof Date ? t.getTime() : 0), label, extra });
    st.audits.filter(a => a.invoiceId === inv.id).forEach(a => ev(a.createdAt, { create: 'Created as a draft', ready: 'Marked ready', send: 'Marked as sent', cancel: 'Cancelled' }[a.action] || a.action, a.reason ? 'Reason: ' + a.reason : ''));
    of(st.payments, inv).forEach(p => ev(p.createdAt, (p.kind === 'credit' ? 'Credit ' : 'Payment ') + money(p.amountMinor, inv.currency) + ' dated ' + p.date, [p.method, p.note, p.reason ? 'Reason: ' + p.reason : ''].filter(Boolean).join(' · ')));
    of(st.reversals, inv).forEach(r => ev(r.createdAt, 'Reversed ' + r.kind + ' ' + money(r.amountMinor, inv.currency), 'Reason: ' + r.reason));
    of(st.adjustments, inv).forEach(a => ev(a.createdAt, 'Adjustment ' + money(a.amountMinor, inv.currency), 'Reason: ' + a.reason));
    of(st.dues, inv).forEach(x => ev(x.createdAt, 'Due date ' + x.previous + ' to ' + x.next, 'Reason: ' + x.reason));
    items.sort((a, b) => a.t - b.t);
    d.append(el('div', {}, el('h2', { id: 'ivHT' }, 'History of ' + inv.id), el('div', { class: 'cidhist' }, ...(items.length ? items.map(i => el('div', { class: 'cidh' }, el('strong', {}, i.label), el('span', { class: 'libmeta' }, i.t ? new Date(i.t).toLocaleString() : ''), i.extra ? el('span', { class: 'libmeta' }, i.extra) : null)) : [el('p', { class: 'dstate' }, 'No history found.')])),
      el('div', { class: 'dact-row' }, el('button', { type: 'button', class: 'dbtn', onclick: () => d.close() }, 'Close'))));
    d.addEventListener('close', () => d.remove()); document.body.append(d); d.showModal();
  }

  /* ---------------------------------------------------------------- list */
  function badges(inv, d) {
    const b = [el('span', { class: 'bbadge ' + (inv.status === 'SENT' ? 'bb-info' : inv.status === 'CANCELLED' ? 'bb-neutral' : 'bb-warn') }, V.WORKFLOW_LABEL[inv.status] || inv.status)];
    if (d.payState) b.push(el('span', { class: 'bbadge ' + (d.payState === 'PAID' ? 'bb-ok' : 'bb-warn') }, V.PAY_LABEL[d.payState]));
    if (d.overdue) b.push(el('span', { class: 'bbadge bb-bad' }, 'Overdue'));
    if (!d.cacheOk) b.push(el('span', { class: 'bbadge bb-bad' }, 'Balance record differs - refresh'));
    return b;
  }
  function draw() {
    if (!st) return; drawMake();
    const fc = $('ivFilter').value, fs = $('ivStatus').value, cl = Array.from(new Set(st.invoices.map(i => i.clientId))).sort();
    $('ivFilter').replaceChildren(el('option', { value: '' }, 'All clients'), ...cl.map(c => el('option', { value: c }, c))); if (cl.indexOf(fc) >= 0) $('ivFilter').value = fc;
    const rows = st.invoices.filter(i => (!$('ivFilter').value || i.clientId === $('ivFilter').value) && (fs === 'all' || (fs === 'open' ? (i.status === 'SENT' && derived(i).balanceMinor > 0) : fs === 'overdue' ? derived(i).overdue : i.status === fs)))
      .sort((a, b) => a.periodStart < b.periodStart ? 1 : a.periodStart > b.periodStart ? -1 : a.id < b.id ? 1 : -1);
    say('ivState', st.invoices.length + ' invoice' + (st.invoices.length === 1 ? '' : 's') + ' in total, ' + rows.length + ' shown.');
    $('ivList').replaceChildren(...(rows.length ? rows.map(inv => {
      const d = derived(inv), btn = (t, f, cls) => el('button', { type: 'button', class: 'dbtn' + (cls ? ' ' + cls : ''), 'aria-label': t + ' ' + inv.id, onclick: f }, t), acts = [];
      if (inv.status === 'DRAFT') acts.push(btn('Mark ready', () => ready(inv), 'primary'), btn('Cancel', () => cancel(inv).then(draw)));
      if (inv.status === 'READY') acts.push(btn('Mark as sent', () => markSent(inv).then(draw), 'primary'), btn('Cancel', () => cancel(inv).then(draw)));
      if (inv.status === 'SENT') {
        if (d.balanceMinor > 0) acts.push(btn('Record payment', () => recordMoney(inv, 'payment').then(draw), 'primary')); else acts.push(btn('Record credit', () => recordMoney(inv, 'credit').then(draw)));
        acts.push(btn('Adjust', () => adjust(inv).then(draw)), btn('Change due date', () => changeDue(inv).then(draw)));
      }
      acts.push(btn('History', () => history(inv)));
      const revSet = V.reversedSet(of(st.reversals, inv)), pays = of(st.payments, inv).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
      return el('div', { class: 'cidrow' + (inv.status === 'CANCELLED' ? ' bhold' : '') },
        el('div', { class: 'cidmain' }, el('strong', { class: 'cidid' }, inv.id), ...badges(inv, d)),
        el('div', { class: 'dhelp' }, hm(inv.minutes) + ' h x ' + money(inv.rateMinor, inv.currency) + '/h = ' + money(inv.totalMinor, inv.currency) + (d.adjMinor ? ' · adjustments ' + money(d.adjMinor, inv.currency) + ' · now ' + money(d.totalMinor, inv.currency) : '')),
        inv.status === 'SENT' ? el('div', { class: 'dhelp' }, 'Paid ' + money(d.paidMinor, inv.currency) + ' · balance ' + money(Math.max(d.balanceMinor, 0), inv.currency) + (d.creditMinor ? ' · credit held ' + money(d.creditMinor, inv.currency) : '') + ' · ' + V.describeDue(inv) + (inv.sentAt ? ' · sent ' + fmtDate(inv.sentAt) : '')) : el('div', { class: 'dhelp' }, V.describeDue(inv)),
        ...pays.map(p => el('div', { class: 'dhelp' + (revSet[p.id] ? ' bhold' : '') }, (p.kind === 'credit' ? 'Credit ' : 'Payment ') + money(p.amountMinor, inv.currency) + ' · ' + p.date + (p.method ? ' · ' + p.method : '') + (revSet[p.id] ? ' · reversed' : ' '),
          (inv.status === 'SENT' && !revSet[p.id]) ? el('button', { type: 'button', class: 'dbtn', 'aria-label': 'Reverse ' + p.kind + ' ' + p.id, onclick: () => reverse(inv, p).then(draw) }, 'Reverse') : null)),
        el('div', { class: 'dact-row' }, ...acts));
    }) : [el('p', { class: 'dstate' }, 'No invoices to show.')]));
  }
  async function show() {
    if (!signed) return; say('ivState', 'Loading…');
    try { await load(); draw(); } catch (e) { say('ivState', 'Could not load. ' + errText(e)); }
  }
  function init() {
    $('ivMake').addEventListener('click', makeInvoice); $('ivRefresh').addEventListener('click', show); $('ivGroup').addEventListener('change', () => { picked = []; drawPick(); });
    ['ivFilter', 'ivStatus'].forEach(i => $(i).addEventListener('change', draw));
    document.addEventListener('dash:page', e => { if (e.detail === 'invoices') show(); });
    document.addEventListener('own:auth', e => { signed = !!(e.detail && e.detail.ok); st = signed ? st : null; picked = []; if (!signed) { ['ivList', 'ivEntries'].forEach(i => $(i).replaceChildren()); ['ivState', 'ivErr', 'ivPreview'].forEach(i => say(i, '')); } });
    window.__invoices = { get state() { return st; } };      // read-only test hook
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
