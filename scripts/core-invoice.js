/* ==========================================================================
   core-invoice.js - invoices, payments, reversals, credits, adjustments and due-date changes for CodeFlow 4.5.0 (phase B2).
   Runs in the browser (window.coreInvoice) and in Node (module.exports). No network, no database. The page and the tests use these functions.
   Money is never a float: integer minor units (core-money.js). Total = hourly rate x minutes / 60, rounded ONCE (half up) at the invoice total.

   Records (all owner only; see firestore.rules):
     invoices/{CLIENTID__YYYYMMDD__YYYYMMDD[__NN]}  workflow state + a small CACHED balance (paidMinor, creditMinor, adjMinor) that the rules keep honest
     invoiceAudit/{aid}        create-only: create / ready / send / cancel
     payments/{pid}            create-only: kind payment or credit; the ID is made by the browser, so a retry can never add a second one
     paymentReversals/{pid}    create-only: the ID IS the payment ID, so a payment can be reversed once (whole payment only)
     invoiceAdjustments/{aid}  create-only: signed amount with a reason (after the invoice was sent)
     invoiceDueDates/{id}      create-only: due date change after sending, old and new date and a reason
   Payment state (UNPAID / PARTIALLY_PAID / PAID) and the overdue flag are DERIVED here from the records; they are never typed or stored as text.
   Honest limits: the database rules cannot do calendar maths, so "payment date is not in the future" and the due-date arithmetic are page checks;
   an invoice holds at most MAX_ENTRIES approved entries because the rules add their minutes up without a loop.
   ========================================================================== */
(function (root) {
  'use strict';
  const req = n => (typeof require === 'function' && typeof module !== 'undefined') ? require(n) : null;
  const M = req('./core-money.js') || root.coreMoney, I = req('./core-ids.js') || root.coreIds, T = req('./core-time.js') || root.coreTime;
  const MAX_ENTRIES = 2, MAX_AMOUNT = 1000000000000, REASON_MIN = 3, REASON_MAX = 200, MAX_NOTE = 200, MAX_METHOD = 40, SERVER_TIME = '@server-time';
  const WORKFLOW = ['DRAFT', 'READY', 'SENT', 'CANCELLED'];
  const WORKFLOW_LABEL = { DRAFT: 'Draft', READY: 'Ready (amounts locked)', SENT: 'Sent', CANCELLED: 'Cancelled' };
  const PAY_LABEL = { UNPAID: 'Unpaid', PARTIALLY_PAID: 'Partially paid', PAID: 'Paid' };
  const str = v => String(v == null ? '' : v).trim();
  const no = (r, extra) => Object.assign({ ok: false, reason: r }, extra || {});
  const reasonOk = r => r.length >= REASON_MIN && r.length <= REASON_MAX;
  const digits = iso => iso.replace(/-/g, ''), isoOf = d => d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6);
  const DATE8 = /^[0-9]{8}$/, SUFFIX = /^(0[2-9]|[1-9][0-9])$/;

  /* ---------------------------------------------------------------- IDs */
  function invoiceId(clientId, start, end, suffix) {
    const v = I.validateClientId(clientId); if (!v.ok) throw new Error('Invalid Client ID: ' + v.error);
    const a = DATE8.test(start) ? isoOf(start) : start, b = DATE8.test(end) ? isoOf(end) : end;
    const base = I.invoiceId(v.id, a, b), s = suffix || '';
    if (s !== '' && !SUFFIX.test(s)) throw new Error('Invalid invoice number suffix.');
    return base + (s ? '__' + s : '');
  }
  function parseInvoiceId(id) {
    const m = /^(.*?__[0-9]{8}__[0-9]{8})(?:__(0[2-9]|[1-9][0-9]))?$/.exec(String(id)); if (!m) return null;
    const p = I.parseInvoiceId(m[1]); return p ? Object.assign({ suffix: m[2] || '' }, p) : null;
  }
  /* the next free suffix for a client and period: '' for the first invoice ever made for it (even a cancelled one keeps its ID), then 02, 03 ... */
  function nextSuffix(invoices, clientId, start, end) {
    const ps = digits(start), pe = digits(end), same = (invoices || []).filter(i => i.clientId === clientId && i.periodStart === ps && i.periodEnd === pe);
    if (!same.length) return { ok: true, suffix: '' };
    const n = Math.max.apply(null, same.map(i => i.suffix ? Number(i.suffix) : 1)) + 1;
    return n <= 99 ? { ok: true, suffix: String(n).padStart(2, '0') } : no('This period already has 99 invoices.');
  }

  /* ---------------------------------------------------------------- money helpers */
  const today = (nowMs, tz) => T.localDateKey(nowMs, tz);
  /* the total of a list of approved minutes at a rate: minutes are added first, rounded once */
  function totalFor(rateMinor, minutesList) { const r = M.invoiceTotal(rateMinor, minutesList); return { minutes: r.minutes, totalMinor: r.amount }; }
  /* amount text (optionally signed when o.signed) -> minor units */
  function amountFrom(text, cur, signed) {
    let s = str(text), neg = false;
    if (signed && /^[+-]/.test(s)) { neg = s[0] === '-'; s = s.slice(1).trim(); }
    let v; try { v = M.toMinor(s, cur); } catch (e) { return { ok: false, error: e.message }; }
    if (v < 1) return { ok: false, error: 'The amount must be more than zero.' };
    if (v > MAX_AMOUNT) return { ok: false, error: 'That amount is too large.' };
    return { ok: true, minor: neg ? -v : v };
  }

  /* ---------------------------------------------------------------- derived state (from the records, never typed) */
  /* payments: [{id,kind,amountMinor}], reversals: [{id}] (a reversal's ID is the payment's ID), adjustments: [{amountMinor}] */
  function derive(inv, payments, reversals, adjustments, nowMs) {
    const rev = {}; (reversals || []).forEach(r => { rev[r.id] = true; });
    let paid = 0, credit = 0, adj = 0, reversedCount = 0;
    (payments || []).forEach(p => { if (rev[p.id]) { reversedCount++; return; } if (p.kind === 'credit') credit += p.amountMinor; else paid += p.amountMinor; });
    (adjustments || []).forEach(a => { adj += a.amountMinor; });
    const total = inv.totalMinor + adj, balance = total - paid;
    let payState = null;
    if (inv.status === 'SENT') payState = balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
    const overdue = inv.status === 'SENT' && !!inv.dueDate && balance > 0 && today(nowMs, inv.tz) > inv.dueDate;
    return { paidMinor: paid, creditMinor: credit, adjMinor: adj, totalMinor: total, balanceMinor: balance, payState, overdue, reversedCount, cacheOk: inv.paidMinor === paid && inv.creditMinor === credit && inv.adjMinor === adj };
  }
  const reversedSet = reversals => { const s = {}; (reversals || []).forEach(r => { s[r.id] = true; }); return s; };

  /* ---------------------------------------------------------------- builders */
  const INV_KEYS = ['clientId', 'periodStart', 'periodEnd', 'suffix', 'currency', 'exp', 'rateMinor', 'tz', 'dueKind', 'dueDays', 'dueDate', 'entryIds', 'minutes', 'totalMinor', 'status', 'sentAt', 'paidMinor', 'creditMinor', 'adjMinor', 'rev', 'createdAt', 'updatedAt', 'lastKind', 'lastRef'];
  function updated(inv, patch, kind, ref) {
    const d = {}; INV_KEYS.forEach(k => { if (inv[k] !== undefined) d[k] = Array.isArray(inv[k]) ? inv[k].slice() : inv[k]; });
    return Object.assign(d, patch, { rev: inv.rev + 1, lastKind: kind, lastRef: ref });
  }
  const iAudit = (id, action, from, to, rev, total, reason) => ({ invoiceId: id, action, fromStatus: from, toStatus: to, rev, totalMinor: total, reason: reason || '' });
  const eLink = (e, action, rev, reason) => ({ entryId: e.id, clientId: e.clientId, action, fromStatus: 'APPROVED', toStatus: 'APPROVED', rev, submittedMinutes: e.submittedMinutes, approvedMinutes: e.approvedMinutes, reason: reason || '' });
  const sameKey = (e, c, s, f) => e.clientId === c && e.periodStart === s && e.periodEnd === f;

  /* approved entries of one client and period that are not on an invoice */
  function eligibleEntries(entries, clientId, start, end) {
    const s = digits(start), f = digits(end);
    return (entries || []).filter(e => sameKey(e, clientId, s, f) && e.status === 'APPROVED' && !e.relatedInvoiceId);
  }
  /* groups of approved, not-yet-invoiced entries: [{clientId, periodStart, periodEnd, entries, minutes}] */
  function readyGroups(entries) {
    const g = {};
    (entries || []).filter(e => e.status === 'APPROVED' && !e.relatedInvoiceId).forEach(e => { const k = e.clientId + '|' + e.periodStart + '|' + e.periodEnd; (g[k] = g[k] || { clientId: e.clientId, periodStart: e.periodStart, periodEnd: e.periodEnd, entries: [], minutes: 0 }); g[k].entries.push(e); g[k].minutes += e.approvedMinutes || 0; });
    return Object.keys(g).sort().map(k => g[k]);
  }

  /* ---------------------------------------------------------------- invoice: create */
  /* a: { clientId, periodStart:'YYYYMMDD', periodEnd:'YYYYMMDD', entryIds:[...] }
     o: { aid (invoice audit ID), entryAids:[one per entry], nowMs, profile (saved billing profile), registryStatus, entries, invoices }
     -> { ok, id, writes:[{ coll, kind, id, doc }] }  (one batch; the page adds the server times) */
  function createPlan(a, o) {
    a = a || {}; o = o || {};
    const v = I.validateClientId(a.clientId); if (!v.ok) return no(v.error);
    if (!DATE8.test(str(a.periodStart)) || !DATE8.test(str(a.periodEnd))) return no('The period is not valid.');
    if (o.registryStatus !== 'active') return no(v.id + (o.registryStatus === 'archived' ? ' is archived, so a new invoice cannot be made.' : ' is not in the Client IDs list.'));
    const p = o.profile; if (!p) return no(v.id + ' has no billing profile. Create the profile first.');
    if (p.arrangement !== 'hourly') return no(v.id + ' is billed a monthly fee. Invoices from hours are only for hourly clients in this version.');
    if (!(p.rateMinor > 0)) return no('The billing profile has no hourly rate. Set the rate first.');
    const ids = Array.isArray(a.entryIds) ? a.entryIds.slice() : [];
    if (ids.length < 1) return no('Choose at least one approved entry.');
    if (ids.length > MAX_ENTRIES) return no('An invoice can hold at most ' + MAX_ENTRIES + ' approved entries.');
    if (new Set(ids).size !== ids.length) return no('The same entry was chosen twice.');
    const list = [];
    for (const id of ids) {
      const e = (o.entries || []).find(x => x.id === id); if (!e) return no('Entry ' + id + ' was not found.');
      if (!sameKey(e, v.id, a.periodStart, a.periodEnd)) return no('Every entry must be for the same client and period.');
      if (e.status !== 'APPROVED') return no('Only approved entries can be invoiced.');
      if (e.relatedInvoiceId) return no('Entry ' + id + ' is already on invoice ' + e.relatedInvoiceId + '.');
      list.push(e);
    }
    if (!o.aid || !(o.entryAids && o.entryAids.length === ids.length)) return no('A change needs its own ID.');
    const ns = nextSuffix(o.invoices, v.id, a.periodStart, a.periodEnd); if (!ns.ok) return ns;
    const t = totalFor(p.rateMinor, list.map(e => e.approvedMinutes));
    if (t.minutes < 1) return no('The approved hours are zero, so there is nothing to invoice.');
    const id = invoiceId(v.id, a.periodStart, a.periodEnd, ns.suffix);
    let dueDate = '';
    if (p.dueKind === 'fixed') dueDate = p.dueDate; else if (p.dueKind === 'afterGeneration') dueDate = T.addDaysIso(today(o.nowMs, p.tz), p.dueDays);
    const doc = { clientId: v.id, periodStart: a.periodStart, periodEnd: a.periodEnd, suffix: ns.suffix, currency: p.currency, exp: p.exp, rateMinor: p.rateMinor, tz: p.tz, dueKind: p.dueKind, dueDays: p.dueDays, dueDate,
      entryIds: ids, minutes: t.minutes, totalMinor: t.totalMinor, status: 'DRAFT', sentAt: null, paidMinor: 0, creditMinor: 0, adjMinor: 0, rev: 1, lastKind: 'create', lastRef: o.aid };
    const writes = [{ coll: 'invoices', kind: 'create', id, doc }, { coll: 'invoiceAudit', kind: 'create', id: o.aid, doc: iAudit(id, 'create', '', 'DRAFT', 1, t.totalMinor, '') }];
    list.forEach((e, i) => {
      const ed = Object.assign({}, e); delete ed.id; ed.relatedInvoiceId = id; ed.rev = e.rev + 1; ed.lastAudit = o.entryAids[i];
      writes.push({ coll: 'billableEntries', kind: 'update', id: e.id, doc: ed });
      writes.push({ coll: 'billableEntryAudit', kind: 'create', id: o.entryAids[i], doc: eLink(Object.assign({ id: e.id }, e), 'link', ed.rev, '') });
    });
    return { ok: true, id, writes, totalMinor: t.totalMinor, minutes: t.minutes };
  }

  /* ---------------------------------------------------------------- invoice: ready / send / cancel */
  /* action: ready | send | cancel.  inv: the saved invoice (with id).  a: { reason }.  o: { aid, nowMs, entries, entryAids } */
  function workflowPlan(inv, action, a, o) {
    a = a || {}; o = o || {};
    if (!inv) return no('That invoice was not found.'); if (!o.aid) return no('A change needs its own ID.');
    if (action === 'ready') {
      if (inv.status !== 'DRAFT') return no('Only a draft can be made ready.');
      return { ok: true, writes: [{ coll: 'invoices', kind: 'update', id: inv.id, doc: updated(inv, { status: 'READY' }, 'ready', o.aid) }, { coll: 'invoiceAudit', kind: 'create', id: o.aid, doc: iAudit(inv.id, 'ready', 'DRAFT', 'READY', inv.rev + 1, inv.totalMinor, '') }] };
    }
    if (action === 'send') {
      if (inv.status !== 'READY') return no('Only a ready invoice can be marked as sent.');
      const patch = { status: 'SENT', sentAt: SERVER_TIME };
      if (inv.dueKind === 'afterSend') patch.dueDate = T.addDaysIso(today(o.nowMs, inv.tz), inv.dueDays);
      return { ok: true, dueDate: patch.dueDate || inv.dueDate, writes: [{ coll: 'invoices', kind: 'update', id: inv.id, doc: updated(inv, patch, 'send', o.aid) }, { coll: 'invoiceAudit', kind: 'create', id: o.aid, doc: iAudit(inv.id, 'send', 'READY', 'SENT', inv.rev + 1, inv.totalMinor, '') }] };
    }
    if (action === 'cancel') {
      if (inv.status !== 'DRAFT' && inv.status !== 'READY') return no('Only a draft or a ready invoice can be cancelled. For a sent invoice use an adjustment.');
      const reason = str(a.reason); if (!reasonOk(reason)) return no('Write a reason of ' + REASON_MIN + ' to ' + REASON_MAX + ' characters.');
      if (!(o.entryAids && o.entryAids.length === inv.entryIds.length)) return no('A change needs its own ID.');
      const writes = [{ coll: 'invoices', kind: 'update', id: inv.id, doc: updated(inv, { status: 'CANCELLED' }, 'cancel', o.aid) }, { coll: 'invoiceAudit', kind: 'create', id: o.aid, doc: iAudit(inv.id, 'cancel', inv.status, 'CANCELLED', inv.rev + 1, inv.totalMinor, reason) }];
      for (let i = 0; i < inv.entryIds.length; i++) {
        const e = (o.entries || []).find(x => x.id === inv.entryIds[i]); if (!e) return no('Entry ' + inv.entryIds[i] + ' was not found.');
        if (e.relatedInvoiceId !== inv.id) return no('Entry ' + e.id + ' is not linked to this invoice any more. Refresh and check.');
        const ed = Object.assign({}, e); delete ed.id; ed.relatedInvoiceId = ''; ed.rev = e.rev + 1; ed.lastAudit = o.entryAids[i];
        writes.push({ coll: 'billableEntries', kind: 'update', id: e.id, doc: ed }); writes.push({ coll: 'billableEntryAudit', kind: 'create', id: o.entryAids[i], doc: eLink(e, 'unlink', ed.rev, reason) });
      }
      return { ok: true, writes };
    }
    return no('Unknown step.');
  }

  /* ---------------------------------------------------------------- payments, credits, reversals */
  /* what the retry check hashes: every field that decides what the payment is */
  function paymentPayload(inv, p) { return { invoiceId: inv.id, kind: p.kind, amountMinor: p.amountMinor, date: p.date, method: p.method, note: p.note, reason: p.reason, correctionId: p.correctionId }; }
  /* a: { id (made by the browser when the form opened), kind:'payment'|'credit', amount:'text', date:'YYYY-MM-DD', method, note, reason, correctionId }
     o: { hash (payload hash, made by the page), nowMs, payments, reversals, adjustments } */
  function paymentPlan(inv, a, o) {
    a = a || {}; o = o || {};
    if (!inv) return no('That invoice was not found.');
    if (inv.status !== 'SENT') return no('Payments can only be recorded on a sent invoice.');
    if (!/^[A-Za-z0-9]{16,40}$/.test(str(a.id))) return no('A payment needs its own ID.');
    if (!/^[0-9a-f]{64}$/.test(str(o.hash))) return no('The payment could not be fingerprinted. Please try again.');
    const kind = a.kind === 'credit' ? 'credit' : a.kind === 'payment' ? 'payment' : ''; if (!kind) return no('Choose payment or credit.');
    const am = amountFrom(a.amount, inv.currency, false); if (!am.ok) return no(am.error, { field: 'amount' });
    const date = str(a.date); if (!I.validIsoDate(date)) return no('Choose a real payment date.', { field: 'date' });
    if (date > today(o.nowMs, inv.tz)) return no('The payment date cannot be in the future.', { field: 'date' });
    const method = str(a.method), note = str(a.note), reason = str(a.reason), corr = str(a.correctionId);
    if (method.length > MAX_METHOD) return no('The method is too long (' + MAX_METHOD + ' characters at most).');
    if (note.length > MAX_NOTE) return no('The note is too long (' + MAX_NOTE + ' characters at most).');
    if (reason.length > REASON_MAX) return no('The reason is too long.');
    if (corr && !/^[A-Za-z0-9]{16,40}$/.test(corr)) return no('The correction ID is not valid.');
    const d = derive(inv, o.payments, o.reversals, o.adjustments, o.nowMs);
    if (kind === 'payment') {
      if (d.balanceMinor <= 0) return no('This invoice is already paid in full. To record money received beyond the invoice, record a credit with a reason.');
      if (am.minor > d.balanceMinor) return no('That is more than the balance (' + M.format(d.balanceMinor, inv.currency) + '). Record the balance as a payment and the extra as a credit with a reason.', { field: 'amount' });
    } else {
      if (d.balanceMinor > 0) return no('A credit is only for money received beyond a fully paid invoice. Record a payment first.');
      if (!reasonOk(reason)) return no('A credit needs a reason of ' + REASON_MIN + ' to ' + REASON_MAX + ' characters.', { field: 'reason' });
    }
    const doc = { invoiceId: inv.id, clientId: inv.clientId, kind, amountMinor: am.minor, currency: inv.currency, date, method, note, reason, correctionId: corr, payloadHash: o.hash };
    const patch = kind === 'payment' ? { paidMinor: inv.paidMinor + am.minor } : { creditMinor: inv.creditMinor + am.minor };
    return { ok: true, id: a.id, payment: doc, writes: [{ coll: 'payments', kind: 'create', id: a.id, doc }, { coll: 'invoices', kind: 'update', id: inv.id, doc: updated(inv, patch, kind, a.id) }] };
  }
  /* whole payment (or credit) only; the reversal's ID is the payment's ID.  a: { reason, correctionId } */
  function reversalPlan(inv, payment, a, o) {
    a = a || {}; o = o || {};
    if (!inv || !payment) return no('That payment was not found.');
    if (inv.status !== 'SENT') return no('Payments can only be reversed on a sent invoice.');
    if (payment.invoiceId !== inv.id) return no('That payment belongs to another invoice.');
    if (reversedSet(o.reversals)[payment.id]) return no('That payment was already reversed.');
    const reason = str(a.reason); if (!reasonOk(reason)) return no('Write a reason of ' + REASON_MIN + ' to ' + REASON_MAX + ' characters.', { field: 'reason' });
    const corr = str(a.correctionId); if (corr && !/^[A-Za-z0-9]{16,40}$/.test(corr)) return no('The correction ID is not valid.');
    const credit = payment.kind === 'credit', cur = credit ? inv.creditMinor : inv.paidMinor;
    if (!credit && inv.creditMinor > 0) return no('This invoice holds a credit. Reverse the credit first, then the payment.');
    if (cur < payment.amountMinor) return no('The invoice balance record does not cover this payment. Refresh and check.');
    const doc = { invoiceId: inv.id, clientId: inv.clientId, kind: payment.kind, amountMinor: payment.amountMinor, reason, correctionId: corr };
    const patch = credit ? { creditMinor: inv.creditMinor - payment.amountMinor } : { paidMinor: inv.paidMinor - payment.amountMinor };
    return { ok: true, id: payment.id, writes: [{ coll: 'paymentReversals', kind: 'create', id: payment.id, doc }, { coll: 'invoices', kind: 'update', id: inv.id, doc: updated(inv, patch, 'reversal', payment.id) }] };
  }

  /* ---------------------------------------------------------------- adjustments and due-date changes (sent invoices) */
  /* a: { amount: '-25.00' | '+10', reason, entryRef }.  o: { aid } */
  function adjustmentPlan(inv, a, o) {
    a = a || {}; o = o || {};
    if (!inv) return no('That invoice was not found.'); if (inv.status !== 'SENT') return no('An adjustment is only for a sent invoice. Before that, cancel and make a new invoice.');
    if (!/^[A-Za-z0-9]{16,40}$/.test(str(o.aid))) return no('A change needs its own ID.');
    if (inv.creditMinor > 0) return no('This invoice holds a credit. Reverse the credit first, then adjust.');
    const am = amountFrom(a.amount, inv.currency, true); if (!am.ok) return no(am.error, { field: 'amount' });
    const reason = str(a.reason); if (!reasonOk(reason)) return no('Write a reason of ' + REASON_MIN + ' to ' + REASON_MAX + ' characters.', { field: 'reason' });
    const ref = str(a.entryRef); if (ref.length > 80) return no('The entry reference is too long.');
    if (inv.totalMinor + inv.adjMinor + am.minor < inv.paidMinor) return no('That would make the invoice total smaller than what was already paid. Reverse or refund the payment first.', { field: 'amount' });
    const doc = { invoiceId: inv.id, clientId: inv.clientId, amountMinor: am.minor, reason, entryRef: ref };
    return { ok: true, id: o.aid, writes: [{ coll: 'invoiceAdjustments', kind: 'create', id: o.aid, doc }, { coll: 'invoices', kind: 'update', id: inv.id, doc: updated(inv, { adjMinor: inv.adjMinor + am.minor }, 'adjustment', o.aid) }] };
  }
  /* a: { date:'YYYY-MM-DD', reason }.  o: { aid } */
  function dueChangePlan(inv, a, o) {
    a = a || {}; o = o || {};
    if (!inv) return no('That invoice was not found.'); if (inv.status !== 'SENT') return no('The due date can only be changed on a sent invoice.');
    if (!/^[A-Za-z0-9]{16,40}$/.test(str(o.aid))) return no('A change needs its own ID.');
    const date = str(a.date); if (!I.validIsoDate(date)) return no('Choose a real date.', { field: 'date' });
    if (date === inv.dueDate) return no('That is already the due date.', { field: 'date' });
    const reason = str(a.reason); if (!reasonOk(reason)) return no('Write a reason of ' + REASON_MIN + ' to ' + REASON_MAX + ' characters.', { field: 'reason' });
    const doc = { invoiceId: inv.id, clientId: inv.clientId, previous: inv.dueDate, next: date, reason };
    return { ok: true, id: o.aid, writes: [{ coll: 'invoiceDueDates', kind: 'create', id: o.aid, doc }, { coll: 'invoices', kind: 'update', id: inv.id, doc: updated(inv, { dueDate: date }, 'due', o.aid) }] };
  }

  const describeDue = inv => inv.dueDate ? 'Due ' + inv.dueDate : (inv.dueKind === 'afterSend' ? 'Due ' + inv.dueDays + ' day' + (inv.dueDays === 1 ? '' : 's') + ' after you mark it sent' : 'No due date');
  const api = { MAX_ENTRIES, MAX_AMOUNT, REASON_MIN, REASON_MAX, MAX_NOTE, MAX_METHOD, SERVER_TIME, WORKFLOW, WORKFLOW_LABEL, PAY_LABEL,
    invoiceId, parseInvoiceId, nextSuffix, totalFor, amountFrom, derive, eligibleEntries, readyGroups, createPlan, workflowPlan, paymentPayload, paymentPlan, reversalPlan, adjustmentPlan, dueChangePlan, describeDue, reversedSet };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreInvoice = api;
})(typeof window !== 'undefined' ? window : globalThis);
