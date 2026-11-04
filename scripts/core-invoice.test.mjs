import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const V = require('./core-invoice.js'), M = require('./core-money.js');
const NOW = Date.UTC(2026, 10, 5, 4, 0, 0); // 2026-11-05 12:00 Manila
const prof = (o) => Object.assign({ arrangement: 'hourly', currency: 'USD', exp: 2, rateMinor: 2500, tz: 'Asia/Manila', dueKind: 'afterGeneration', dueDays: 14, dueDate: '' }, o || {});
const ent = (n, mins, o) => Object.assign({ id: 'ABC-0001__20261001__20261031__0' + n, clientId: 'ABC-0001', periodStart: '20261001', periodEnd: '20261031', status: 'APPROVED', approvedMinutes: mins, submittedMinutes: mins, relatedInvoiceId: '', rev: 3 }, o || {});
const mk = (o) => Object.assign({ entries: [ent(1, 90), ent(2, 30)], profile: prof(), registryStatus: 'active', invoices: [], aid: 'aid1', entryAids: ['ea1', 'ea2'], nowMs: NOW }, o || {});
const make = (o, ids) => V.createPlan({ clientId: 'ABC-0001', periodStart: '20261001', periodEnd: '20261031', entryIds: ids || ['ABC-0001__20261001__20261031__01', 'ABC-0001__20261001__20261031__02'] }, mk(o));
const inv = (o) => { const p = make(); const d = Object.assign({ id: p.id }, p.writes[0].doc, { sentAt: 1 }); return Object.assign(d, o || {}); };
const PID = 'abcdefghij012345', HASH = 'a'.repeat(64);

test('ids and suffix', () => {
  assert.equal(V.invoiceId('ABC-0001', '20261001', '20261031', ''), 'ABC-0001__20261001__20261031');
  assert.equal(V.invoiceId('ABC-0001', '2026-10-01', '2026-10-31', '02'), 'ABC-0001__20261001__20261031__02');
  assert.throws(() => V.invoiceId('ABC-0001', '20261001', '20261031', '01'));
  assert.equal(V.parseInvoiceId('ABC-0001__20261001__20261031__03').suffix, '03');
  assert.equal(V.parseInvoiceId('ABC-0001__20261001__20261031').suffix, '');
  const base = { clientId: 'ABC-0001', periodStart: '20261001', periodEnd: '20261031' };
  assert.equal(V.nextSuffix([], 'ABC-0001', '20261001', '20261031').suffix, '');
  assert.equal(V.nextSuffix([Object.assign({ suffix: '' }, base)], 'ABC-0001', '20261001', '20261031').suffix, '02');
  assert.equal(V.nextSuffix([Object.assign({ suffix: '' }, base), Object.assign({ suffix: '02' }, base)], 'ABC-0001', '20261001', '20261031').suffix, '03');
  assert.equal(V.nextSuffix([Object.assign({ suffix: '99' }, base)], 'ABC-0001', '20261001', '20261031').ok, false);
});

test('create: total rounded once, links entries, due date', () => {
  const p = make();
  assert.ok(p.ok, p.reason);
  assert.equal(p.minutes, 120); assert.equal(p.totalMinor, 5000);
  assert.equal(p.id, 'ABC-0001__20261001__20261031');
  const d = p.writes[0].doc;
  assert.equal(d.dueDate, '2026-11-19'); assert.equal(d.status, 'DRAFT'); assert.equal(d.rev, 1); assert.equal(d.lastRef, 'aid1');
  assert.equal(p.writes.length, 6);
  assert.equal(p.writes[2].doc.relatedInvoiceId, p.id); assert.equal(p.writes[2].doc.rev, 4);
  assert.equal(p.writes[3].doc.action, 'link');
});
test('create: rounding at the exact half, once not per entry', () => {
  // rate 2500/h, 1 minute -> 41.666 -> 42 ; two entries of 1 minute -> 83.33 -> 83 (not 84)
  const e = [ent(1, 1), ent(2, 1)];
  assert.equal(make({ entries: e }).totalMinor, 83);
  // exact half: rate 3000 minor/h (30.00), 1 min = 50 exactly; rate 1 minor/h, 30 min = 0.5 -> 1
  assert.equal(make({ entries: [ent(1, 30)], profile: prof({ rateMinor: 1 }), entryAids: ['ea1'] }, ['ABC-0001__20261001__20261031__01']).totalMinor, 1);
  assert.equal(make({ entries: [ent(1, 29)], profile: prof({ rateMinor: 1 }), entryAids: ['ea1'] }, ['ABC-0001__20261001__20261031__01']).ok, true);
  assert.equal(make({ entries: [ent(1, 29)], profile: prof({ rateMinor: 1 }), entryAids: ['ea1'] }, ['ABC-0001__20261001__20261031__01']).totalMinor, 0);
});
for (const [cur, exp, rate] of [['USD', 2, 2500], ['GBP', 2, 2000], ['EUR', 2, 1999], ['AUD', 2, 3333], ['CAD', 2, 1], ['PHP', 2, 45000], ['JPY', 0, 3000], ['KWD', 3, 7500]]) {
  test('total per currency ' + cur, () => {
    const p = make({ profile: prof({ currency: cur, exp, rateMinor: rate }) });
    assert.ok(p.ok, p.reason);
    assert.equal(p.totalMinor, M.invoiceTotal(rate, [90, 30]).amount);
    assert.ok(Number.isInteger(p.totalMinor));
  });
}
test('create: refusals', () => {
  assert.equal(make({ registryStatus: 'archived' }).ok, false);
  assert.equal(make({ profile: null }).ok, false);
  assert.equal(make({ profile: prof({ arrangement: 'monthly' }) }).ok, false);
  assert.equal(make({ profile: prof({ rateMinor: 0 }) }).ok, false);
  assert.equal(make({}, []).ok, false);
  assert.equal(make({}, ['ABC-0001__20261001__20261031__01', 'ABC-0001__20261001__20261031__01']).ok, false);
  assert.equal(make({ entries: [ent(1, 90, { status: 'SUBMITTED' }), ent(2, 30)] }).ok, false);
  assert.equal(make({ entries: [ent(1, 90, { relatedInvoiceId: 'X__20261001__20261031' }), ent(2, 30)] }).ok, false);
  assert.equal(make({ entries: [ent(1, 90, { clientId: 'ZZZ-0002' }), ent(2, 30)] }).ok, false);
  assert.equal(make({ entries: [ent(1, 0), ent(2, 0)] }).ok, false);
  assert.equal(V.createPlan({ clientId: 'ABC-0001', periodStart: '20261001', periodEnd: '20261031', entryIds: ['a', 'b', 'c'] }, mk()).ok, false);
});
test('re-invoice after cancel gets suffix 02', () => {
  const first = { clientId: 'ABC-0001', periodStart: '20261001', periodEnd: '20261031', suffix: '', status: 'CANCELLED' };
  const p = make({ invoices: [first] });
  assert.equal(p.id, 'ABC-0001__20261001__20261031__02'); assert.equal(p.writes[0].doc.suffix, '02');
});
test('due kinds', () => {
  assert.equal(make({ profile: prof({ dueKind: 'fixed', dueDate: '2026-12-01' }) }).writes[0].doc.dueDate, '2026-12-01');
  assert.equal(make({ profile: prof({ dueKind: 'afterSend', dueDays: 7 }) }).writes[0].doc.dueDate, '');
});
test('workflow ready / send / cancel', () => {
  const d = inv();
  assert.equal(V.workflowPlan(d, 'send', {}, { aid: 'x' }).ok, false);
  const r = V.workflowPlan(d, 'ready', {}, { aid: 'x1' }); assert.ok(r.ok); assert.equal(r.writes[0].doc.status, 'READY'); assert.equal(r.writes[0].doc.rev, 2);
  const ready = Object.assign({}, d, { status: 'READY' });
  const s = V.workflowPlan(ready, 'send', {}, { aid: 'x2', nowMs: NOW }); assert.ok(s.ok); assert.equal(s.writes[0].doc.sentAt, V.SERVER_TIME);
  const as = V.workflowPlan(Object.assign({}, ready, { dueKind: 'afterSend', dueDays: 7, dueDate: '' }), 'send', {}, { aid: 'x3', nowMs: NOW });
  assert.equal(as.writes[0].doc.dueDate, '2026-11-12');
  const ents = [ent(1, 90, { relatedInvoiceId: d.id }), ent(2, 30, { relatedInvoiceId: d.id })];
  assert.equal(V.workflowPlan(d, 'cancel', { reason: 'ab' }, { aid: 'c', entryAids: ['1', '2'], entries: ents }).ok, false);
  const c = V.workflowPlan(ready, 'cancel', { reason: 'wrong rate' }, { aid: 'c', entryAids: ['1', '2'], entries: ents });
  assert.ok(c.ok); assert.equal(c.writes.length, 6); assert.equal(c.writes[2].doc.relatedInvoiceId, ''); assert.equal(c.writes[3].doc.action, 'unlink');
  assert.equal(V.workflowPlan(Object.assign({}, d, { status: 'SENT' }), 'cancel', { reason: 'wrong rate' }, { aid: 'c', entryAids: ['1', '2'], entries: ents }).ok, false);
  assert.equal(V.workflowPlan(d, 'cancel', { reason: 'wrong rate' }, { aid: 'c', entryAids: ['1', '2'], entries: [ent(1, 90), ent(2, 30)] }).ok, false);
});

const sent = (o) => inv(Object.assign({ status: 'SENT', dueDate: '2026-11-19' }, o || {}));
const pay = (i, amount, o, ctx) => V.paymentPlan(i, Object.assign({ id: PID, kind: 'payment', amount, date: '2026-11-05', method: 'bank', note: '', reason: '', correctionId: '' }, o || {}), Object.assign({ hash: HASH, nowMs: NOW, payments: [], reversals: [], adjustments: [] }, ctx || {}));
test('payments: partial, full, overpay, future date, state', () => {
  const i = sent();
  const a = pay(i, '20.00'); assert.ok(a.ok, a.reason); assert.equal(a.writes[1].doc.paidMinor, 2000); assert.equal(a.writes[1].doc.lastKind, 'payment');
  const i2 = sent({ paidMinor: 2000 });
  const d = V.derive(i2, [{ id: 'p1', kind: 'payment', amountMinor: 2000 }], [], [], NOW);
  assert.equal(d.payState, 'PARTIALLY_PAID'); assert.equal(d.balanceMinor, 3000); assert.equal(d.cacheOk, true);
  assert.equal(pay(i2, '30.01', {}, { payments: [{ id: 'p1', kind: 'payment', amountMinor: 2000 }] }).ok, false);
  assert.ok(pay(i2, '30.00', {}, { payments: [{ id: 'p1', kind: 'payment', amountMinor: 2000 }] }).ok);
  assert.equal(pay(i, '10', { date: '2026-11-06' }).ok, false);
  assert.equal(pay(i, '0').ok, false); assert.equal(pay(i, '-5').ok, false); assert.equal(pay(i, '0.1.2').ok, false);
  assert.equal(pay(inv(), '10').ok, false);
  assert.equal(pay(i, '10', { id: 'short' }).ok, false);
  assert.equal(pay(i, '10', {}, { hash: 'zz' }).ok, false);
  assert.equal(pay(i, '10', { method: 'x'.repeat(41) }).ok, false);
});
test('float trap 0.1 + 0.2', () => {
  const i = sent({ totalMinor: 30 });
  const a = pay(i, '0.10'); assert.ok(a.ok); const i2 = Object.assign({}, i, { paidMinor: 10 });
  const b = pay(i2, '0.20', { id: 'abcdefghij012346' }, { payments: [{ id: PID, kind: 'payment', amountMinor: 10 }] });
  assert.ok(b.ok); assert.equal(b.writes[1].doc.paidMinor, 30);
  assert.equal(V.derive(Object.assign({}, i, { paidMinor: 30 }), [{ id: 'a', kind: 'payment', amountMinor: 10 }, { id: 'b', kind: 'payment', amountMinor: 20 }], [], [], NOW).payState, 'PAID');
});
test('credit only beyond a fully paid invoice, with reason', () => {
  const paid = sent({ paidMinor: 5000 }), ps = [{ id: 'p1', kind: 'payment', amountMinor: 5000 }];
  assert.equal(pay(paid, '10', {}, { payments: ps }).ok, false);
  assert.equal(pay(paid, '10', { kind: 'credit' }, { payments: ps }).ok, false);
  const c = pay(paid, '10', { kind: 'credit', reason: 'overpaid by client' }, { payments: ps });
  assert.ok(c.ok, c.reason); assert.equal(c.writes[1].doc.creditMinor, 1000); assert.equal(c.writes[1].doc.paidMinor, 5000);
  assert.equal(pay(sent(), '10', { kind: 'credit', reason: 'overpaid by client' }).ok, false);
});
test('reversal: whole payment once, then re-payment; wrong-invoice correction', () => {
  const i = sent({ paidMinor: 2000 }), p = { id: 'p1', invoiceId: i.id, kind: 'payment', amountMinor: 2000 };
  assert.equal(V.reversalPlan(i, p, { reason: 'x' }, {}).ok, false);
  const r = V.reversalPlan(i, p, { reason: 'wrong invoice', correctionId: PID }, { reversals: [] });
  assert.ok(r.ok); assert.equal(r.id, 'p1'); assert.equal(r.writes[1].doc.paidMinor, 0); assert.equal(r.writes[1].doc.lastKind, 'reversal');
  assert.equal(V.reversalPlan(i, p, { reason: 'wrong invoice' }, { reversals: [{ id: 'p1' }] }).ok, false);
  assert.equal(V.reversalPlan(i, Object.assign({}, p, { invoiceId: 'other' }), { reason: 'wrong invoice' }, {}).ok, false);
  const after = Object.assign({}, i, { paidMinor: 0 });
  const d = V.derive(after, [p], [{ id: 'p1' }], [], NOW); assert.equal(d.paidMinor, 0); assert.equal(d.payState, 'UNPAID'); assert.equal(d.reversedCount, 1); assert.equal(d.cacheOk, true);
  const again = pay(after, '20.00', { id: 'abcdefghij012399' }, { payments: [p], reversals: [{ id: 'p1' }] }); assert.ok(again.ok);
  const cp = { id: 'c1', invoiceId: i.id, kind: 'credit', amountMinor: 500 };
  assert.equal(V.reversalPlan(sent({ paidMinor: 5000, creditMinor: 500 }), cp, { reason: 'mistake' }, {}).writes[1].doc.creditMinor, 0);
  assert.equal(V.reversalPlan(sent({ paidMinor: 5000, creditMinor: 500 }), { id: 'p2', invoiceId: i.id, kind: 'payment', amountMinor: 5000 }, { reason: 'mistake' }, {}).ok, false);
});
test('adjustments', () => {
  const i = sent();
  const a = V.adjustmentPlan(i, { amount: '-10.00', reason: 'rate error' }, { aid: PID }); assert.ok(a.ok); assert.equal(a.writes[1].doc.adjMinor, -1000);
  assert.equal(V.adjustmentPlan(i, { amount: '10', reason: 'extra' }, { aid: PID }).writes[1].doc.adjMinor, 1000);
  assert.equal(V.adjustmentPlan(i, { amount: '-10.00', reason: 'x' }, { aid: PID }).ok, false);
  assert.equal(V.adjustmentPlan(i, { amount: '0', reason: 'none' }, { aid: PID }).ok, false);
  assert.equal(V.adjustmentPlan(inv(), { amount: '-1', reason: 'draft' }, { aid: PID }).ok, false);
  assert.equal(V.adjustmentPlan(sent({ paidMinor: 5000 }), { amount: '-1', reason: 'too late' }, { aid: PID }).ok, false);
  assert.equal(V.adjustmentPlan(sent({ paidMinor: 5000, creditMinor: 100 }), { amount: '1', reason: 'holds credit' }, { aid: PID }).ok, false);
  const d = V.derive(sent({ adjMinor: -1000 }), [], [], [{ amountMinor: -1000 }], NOW); assert.equal(d.totalMinor, 4000); assert.equal(d.balanceMinor, 4000);
});
test('due date change and overdue', () => {
  const i = sent();
  assert.equal(V.dueChangePlan(i, { date: '2026-11-19', reason: 'same' }, { aid: PID }).ok, false);
  assert.equal(V.dueChangePlan(i, { date: '2026-13-01', reason: 'bad date' }, { aid: PID }).ok, false);
  const c = V.dueChangePlan(i, { date: '2026-12-01', reason: 'client asked' }, { aid: PID });
  assert.ok(c.ok); assert.equal(c.writes[0].doc.previous, '2026-11-19'); assert.equal(c.writes[1].doc.dueDate, '2026-12-01');
  const late = Date.UTC(2026, 10, 25), early = Date.UTC(2026, 10, 19, 3, 0);
  assert.equal(V.derive(i, [], [], [], late).overdue, true);
  assert.equal(V.derive(i, [], [], [], early).overdue, false); // 19th Manila is the due date itself
  assert.equal(V.derive(sent({ paidMinor: 5000 }), [{ id: 'a', kind: 'payment', amountMinor: 5000 }], [], [], late).overdue, false);
  assert.equal(V.derive(inv(), [], [], [], late).overdue, false);
  assert.equal(V.derive(sent({ dueDate: '' }), [], [], [], late).overdue, false);
  assert.equal(V.derive(sent({ paidMinor: 5 }), [], [], [], NOW).cacheOk, false);
});
test('ready groups and eligible', () => {
  const es = [ent(1, 90), ent(2, 30, { relatedInvoiceId: 'x' }), ent(3, 10, { status: 'SUBMITTED' })];
  assert.equal(V.eligibleEntries(es, 'ABC-0001', '2026-10-01', '2026-10-31').length, 1);
  const g = V.readyGroups(es); assert.equal(g.length, 1); assert.equal(g[0].minutes, 90);
});
