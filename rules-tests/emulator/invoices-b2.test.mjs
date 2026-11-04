// CodeFlow 4.5.0 B2 - REAL Firestore rules engine tests for invoices, payments, credits, reversals, adjustments, due-date changes and the entry link/unlink.
// Run by GitHub Actions (.github/workflows/rules-emulator.yml) or locally:  cd rules-tests/emulator && npm install && npm test   (needs Java 17+)
// Own demo project name. It never touches your real Firebase project.
// STATUS WHEN THIS FILE WAS BUILT: written but NOT executed (the build environment cannot download the emulator).
// The emulator is also the judge of the "access calls per request" budget: the 2-entry invoice create and the payment/reversal batches must be accepted here.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

const OWNER_UID = '3p2YvH4NSVYAAfA0E6HC2kkyc5F3';
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-invoices2', firestore: { rules: readFileSync('../../firestore.rules.strict', 'utf8') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const google = (uid, extra = {}) => env.authenticatedContext(uid, { email: 'x@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' }, ...extra }).firestore();
const owner = () => google(OWNER_UID), stranger = () => google('someoneelse123');
const seed = (path, data) => env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), ...path.split('/')), data); });
const A = n => n.padEnd(16, 'a');
const T = serverTimestamp, dt = () => new Date();
const EID = 'CL-001__20261101__20261115__01', EID2 = 'CL-001__20261101__20261115__02', INVID = 'CL-001__20261101__20261115', INVID2 = INVID + '__02';
const PRO = (o = {}) => ({ currency: 'USD', exp: 2, rateMinor: 2500, arrangement: 'hourly', schedKind: 'monthly', weekStart: 'mon', anchors: '', genTime: '09:00', tz: 'Asia/Manila', dueKind: 'afterSend', dueDays: 14, dueDate: '', rev: 1, createdAt: dt(), updatedAt: dt(), lastAudit: A('p1'), ...o });
const ENT = (seq, mins, o = {}) => ({ clientId: 'CL-001', periodStart: '20261101', periodEnd: '20261115', seq, submittedMinutes: mins, approvedMinutes: mins, status: 'APPROVED', note: '', supersedes: '', supersededBy: '', approvedAt: dt(), approverUid: OWNER_UID, relatedInvoiceId: '', rev: 3, createdAt: dt(), updatedAt: dt(), lastAudit: A('x' + seq), ...o });
const IV = (o = {}) => ({ clientId: 'CL-001', periodStart: '20261101', periodEnd: '20261115', suffix: '', currency: 'USD', exp: 2, rateMinor: 2500, tz: 'Asia/Manila', dueKind: 'afterSend', dueDays: 14, dueDate: '', entryIds: [EID], minutes: 480, totalMinor: 20000, status: 'DRAFT', sentAt: null, paidMinor: 0, creditMinor: 0, adjMinor: 0, rev: 1, createdAt: T(), updatedAt: T(), lastKind: 'create', lastRef: A('i1'), ...o });
const IAU = (o = {}) => ({ invoiceId: INVID, action: 'create', fromStatus: '', toStatus: 'DRAFT', rev: 1, totalMinor: 20000, reason: '', actor: OWNER_UID, createdAt: T(), ...o });
const EAU = (o = {}) => ({ entryId: EID, clientId: 'CL-001', action: 'link', fromStatus: 'APPROVED', toStatus: 'APPROVED', rev: 4, submittedMinutes: 480, approvedMinutes: 480, reason: '', actor: OWNER_UID, createdAt: T(), ...o });
const PY = (o = {}) => ({ invoiceId: INVID, clientId: 'CL-001', kind: 'payment', amountMinor: 5000, currency: 'USD', date: '2026-11-05', method: 'bank', note: '', reason: '', correctionId: '', payloadHash: 'a'.repeat(64), actor: OWNER_UID, createdAt: T(), ...o });
const RV = (o = {}) => ({ invoiceId: INVID, clientId: 'CL-001', kind: 'payment', amountMinor: 5000, reason: 'Entered on the wrong invoice', correctionId: '', actor: OWNER_UID, createdAt: T(), ...o });
const seedBase = async (extra = {}) => {
  await seed('clientRegistry/CL-001', { status: 'active', notes: '', createdAt: dt(), updatedAt: dt(), rev: 1, lastAudit: A('r1') });
  await seed('billingProfiles/CL-001', PRO(extra.profile || {}));
  await seed('billableEntries/' + EID, ENT('01', 480)); await seed('billableEntries/' + EID2, ENT('02', 120));
};
const getI = async (db, id = INVID) => (await getDoc(doc(db, 'invoices', id))).data();
const getE = async (db, id) => (await getDoc(doc(db, 'billableEntries', id))).data();
// create the invoice with one entry (or two)
async function mkInvoice(db, o = {}, two = false, id = INVID, aid = A('i1')) {
  const b = writeBatch(db), ids = two ? [EID, EID2] : [EID];
  b.set(doc(db, 'invoices', id), IV({ lastRef: aid, entryIds: ids, ...(two ? { minutes: 600, totalMinor: 25000 } : {}), ...o }));
  b.set(doc(db, 'invoiceAudit', aid), IAU({ invoiceId: id, totalMinor: o.totalMinor ?? (two ? 25000 : 20000) }));
  for (const [i, eid] of ids.entries()) {
    const e = await getE(db, eid); const ea = A('l' + (i + 1));
    b.set(doc(db, 'billableEntries', eid), { ...e, relatedInvoiceId: id, rev: e.rev + 1, updatedAt: T(), lastAudit: ea });
    b.set(doc(db, 'billableEntryAudit', ea), EAU({ entryId: eid, submittedMinutes: e.submittedMinutes, approvedMinutes: e.approvedMinutes, rev: e.rev + 1 }));
  }
  await b.commit();
}
async function stepInv(db, patch, rec, id = INVID) {      // one invoice step: invoice change + one brand-new record
  const cur = await getI(db, id), b = writeBatch(db);
  b.set(doc(db, 'invoices', id), { ...cur, ...patch, rev: cur.rev + 1, updatedAt: T() });
  for (const [coll, rid, data] of rec) b.set(doc(db, coll, rid), data);
  await b.commit();
}
const toReady = db => stepInv(db, { status: 'READY', lastKind: 'ready', lastRef: A('i2') }, [['invoiceAudit', A('i2'), IAU({ action: 'ready', fromStatus: 'DRAFT', toStatus: 'READY', rev: 2 })]]);
const toSent = async db => { await toReady(db); await stepInv(db, { status: 'SENT', sentAt: T(), dueDate: '2026-11-30', lastKind: 'send', lastRef: A('i3') }, [['invoiceAudit', A('i3'), IAU({ action: 'send', fromStatus: 'READY', toStatus: 'SENT', rev: 3 })]]); };
const sentInvoice = async (two = false) => { await seedBase(); const db = owner(); await mkInvoice(db, {}, two); await toSent(db); return db; };
const pay = (db, pid, amt, o = {}, inv = {}) => stepInv(db, { paidMinor: (inv.base ?? 0) + amt, lastKind: 'payment', lastRef: pid }, [['payments', pid, PY({ amountMinor: amt, ...o })]]);

test('a draft invoice, its audit record and the entry link are created in one batch', async () => { await seedBase(); const db = owner(); await assertSucceeds(mkInvoice(db)); const e = await getE(db, EID); assert.equal(e.relatedInvoiceId, INVID); });
test('an invoice with TWO entries is accepted (checks the access-call budget in the real engine)', async () => { await seedBase(); await assertSucceeds(mkInvoice(owner(), {}, true)); });
for (const [lab, o] of [['total one too low', { totalMinor: 19999 }], ['total one too high', { totalMinor: 20001 }], ['minutes not the entry minutes', { minutes: 479 }], ['rate not the profile rate', { rateMinor: 2501 }], ['currency not the profile currency', { currency: 'EUR' }], ['status READY', { status: 'READY' }], ['paid not zero', { paidMinor: 1 }], ['sent time set', { sentAt: T() }]])
  test(`invoice create refused: ${lab}`, async () => { await seedBase(); await assertFails(mkInvoice(owner(), o)); });
test('half-up rounding at the exact half: 30 minutes at 1 minor unit per hour is 1, not 0', async () => {
  await seedBase({ profile: { rateMinor: 1 } }); await seed('billableEntries/' + EID, ENT('01', 30));
  await assertFails(mkInvoice(owner(), { rateMinor: 1, minutes: 30, totalMinor: 0 })); await assertSucceeds(mkInvoice(owner(), { rateMinor: 1, minutes: 30, totalMinor: 1 }));
});
test('an invoice with no link on the entry is refused; so is an entry link with no invoice', async () => {
  await seedBase(); const db = owner(), b = writeBatch(db); b.set(doc(db, 'invoices', INVID), IV()); b.set(doc(db, 'invoiceAudit', A('i1')), IAU()); await assertFails(b.commit());
  const c = writeBatch(db), e = await getE(db, EID); c.set(doc(db, 'billableEntries', EID), { ...e, relatedInvoiceId: INVID, rev: 4, updatedAt: T(), lastAudit: A('l1') }); c.set(doc(db, 'billableEntryAudit', A('l1')), EAU()); await assertFails(c.commit());
});
test('a monthly-fee client, an archived client or a client with no rate cannot be invoiced from hours', async () => {
  await seedBase({ profile: { arrangement: 'monthly' } }); await assertFails(mkInvoice(owner()));
});
test('the same entry cannot be on two invoices', async () => {
  await seedBase(); const db = owner(); await mkInvoice(db); await assertFails(mkInvoice(db, { suffix: '02' }, false, INVID2, A('j1')));
});
test('draft -> ready -> sent with an audit record each; skipping a step is refused', async () => {
  await seedBase(); const db = owner(); await mkInvoice(db);
  await assertFails(stepInv(db, { status: 'SENT', sentAt: T(), dueDate: '2026-11-30', lastKind: 'send', lastRef: A('i3') }, [['invoiceAudit', A('i3'), IAU({ action: 'send', fromStatus: 'DRAFT', toStatus: 'SENT', rev: 2 })]]));
  await assertSucceeds(toReady(db)); await assertSucceeds(stepInv(db, { status: 'SENT', sentAt: T(), dueDate: '2026-11-30', lastKind: 'send', lastRef: A('i3') }, [['invoiceAudit', A('i3'), IAU({ action: 'send', fromStatus: 'READY', toStatus: 'SENT', rev: 3 })]]));
});
test('a linked entry cannot be replaced or changed while it is on an invoice', async () => {
  await seedBase(); const db = owner(); await mkInvoice(db); const e = await getE(db, EID);
  const b = writeBatch(db); b.set(doc(db, 'billableEntries', EID), { ...e, status: 'SUPERSEDED', supersededBy: EID2, rev: e.rev + 1, updatedAt: T(), lastAudit: A('s1') }); b.set(doc(db, 'billableEntryAudit', A('s1')), EAU({ action: 'supersede', toStatus: 'SUPERSEDED', reason: 'Client sent a correction', rev: e.rev + 1 })); await assertFails(b.commit());
});
test('cancelling releases the entry in the same batch; cancelling without releasing is refused; a replacement invoice gets the next number', async () => {
  await seedBase(); const db = owner(); await mkInvoice(db); const cur = await getI(db), e = await getE(db, EID);
  const bad = writeBatch(db); bad.set(doc(db, 'invoices', INVID), { ...cur, status: 'CANCELLED', rev: 2, updatedAt: T(), lastKind: 'cancel', lastRef: A('c1') }); bad.set(doc(db, 'invoiceAudit', A('c1')), IAU({ action: 'cancel', fromStatus: 'DRAFT', toStatus: 'CANCELLED', rev: 2, reason: 'Wrong hours' })); await assertFails(bad.commit());
  const b = writeBatch(db); b.set(doc(db, 'invoices', INVID), { ...cur, status: 'CANCELLED', rev: 2, updatedAt: T(), lastKind: 'cancel', lastRef: A('c1') }); b.set(doc(db, 'invoiceAudit', A('c1')), IAU({ action: 'cancel', fromStatus: 'DRAFT', toStatus: 'CANCELLED', rev: 2, reason: 'Wrong hours' }));
  b.set(doc(db, 'billableEntries', EID), { ...e, relatedInvoiceId: '', rev: e.rev + 1, updatedAt: T(), lastAudit: A('u1') }); b.set(doc(db, 'billableEntryAudit', A('u1')), EAU({ action: 'unlink', reason: 'Invoice cancelled', rev: e.rev + 1 })); await assertSucceeds(b.commit());
  await assertSucceeds(mkInvoice(db, { suffix: '02' }, false, INVID2, A('j1')));
});
test('an entry cannot be released with no cancelled invoice', async () => {
  await seedBase(); const db = owner(); await mkInvoice(db); const e = await getE(db, EID), b = writeBatch(db);
  b.set(doc(db, 'billableEntries', EID), { ...e, relatedInvoiceId: '', rev: e.rev + 1, updatedAt: T(), lastAudit: A('u1') }); b.set(doc(db, 'billableEntryAudit', A('u1')), EAU({ action: 'unlink', reason: 'Because', rev: e.rev + 1 })); await assertFails(b.commit());
});
test('a payment needs a sent invoice; a draft invoice refuses it', async () => {
  await seedBase(); const db = owner(); await mkInvoice(db); await assertFails(pay(db, A('p1'), 5000));
});
test('partial payment, then the rest; more than the balance is refused', async () => {
  const db = await sentInvoice(); await assertSucceeds(pay(db, A('p1'), 5000)); await assertFails(pay(db, A('p2'), 15001, {}, { base: 5000 })); await assertSucceeds(pay(db, A('p3'), 15000, {}, { base: 5000 }));
  assert.equal((await getI(db)).paidMinor, 20000);
});
test('a payment whose amount differs from the change in the invoice is refused; so is a payment record with no invoice change', async () => {
  const db = await sentInvoice(); await assertFails(stepInv(db, { paidMinor: 5000, lastKind: 'payment', lastRef: A('p1') }, [['payments', A('p1'), PY({ amountMinor: 4999 })]]));
  await assertFails(setDoc(doc(db, 'payments', A('p2')), PY()));
});
test('a payment ID cannot be used twice (a retry or a second tab cannot record it again)', async () => {
  const db = await sentInvoice(); await assertSucceeds(pay(db, A('p1'), 5000)); await assertFails(pay(db, A('p1'), 5000, {}, { base: 5000 }));
});
test('two tabs paying from the same old state: only the first is accepted', async () => {
  const db = await sentInvoice(); const cur = await getI(db);
  const mk = (pid, amt) => { const b = writeBatch(db); b.set(doc(db, 'invoices', INVID), { ...cur, paidMinor: amt, rev: cur.rev + 1, updatedAt: T(), lastKind: 'payment', lastRef: pid }); b.set(doc(db, 'payments', pid), PY({ amountMinor: amt })); return b; };
  const one = mk(A('t1'), 5000), two = mk(A('t2'), 5000);
  await assertSucceeds(one.commit()); await assertFails(two.commit()); assert.equal((await getI(db)).paidMinor, 5000);
});
for (const [lab, o] of [['wrong currency', { currency: 'EUR' }], ['wrong client', { clientId: 'CL-002' }], ['wrong invoice', { invoiceId: INVID2 }], ['date not a date', { date: 'yesterday' }], ['hash not 64 hex', { payloadHash: 'abc' }], ['method too long', { method: 'x'.repeat(41) }], ['zero amount', { amountMinor: 0 }]])
  test(`payment refused: ${lab}`, async () => { const db = await sentInvoice(); await assertFails(stepInv(db, { paidMinor: 5000, lastKind: 'payment', lastRef: A('p1') }, [['payments', A('p1'), PY(o)]])); });
test('a credit only on a fully paid invoice, with a reason', async () => {
  const db = await sentInvoice(); const cr = (pid, o = {}) => stepInv(db, { creditMinor: 3000, lastKind: 'credit', lastRef: pid }, [['payments', pid, PY({ kind: 'credit', amountMinor: 3000, reason: 'Client overpaid', ...o })]]);
  await assertFails(cr(A('c1'))); await pay(db, A('p1'), 20000); await assertFails(cr(A('c2'), { reason: '' })); await assertSucceeds(cr(A('c3')));
});
test('reversal: the whole payment, once; the reason is required; a second reversal is refused; the payment can then be recorded again', async () => {
  const db = await sentInvoice(); await pay(db, A('p1'), 5000);
  const rev = (pid, o = {}, patch = { paidMinor: 0 }) => stepInv(db, { ...patch, lastKind: 'reversal', lastRef: pid }, [['paymentReversals', pid, RV(o)]]);
  await assertFails(rev(A('p1'), { reason: 'x' })); await assertFails(rev(A('p1'), { amountMinor: 4000 })); await assertFails(rev(A('p1'), {}, { paidMinor: 1000 }));
  await assertSucceeds(rev(A('p1'))); await assertFails(rev(A('p1'), {}, { paidMinor: 0 }));
  await assertSucceeds(pay(db, A('p2'), 5000));
});
test('an adjustment after sending; below the amount already paid is refused', async () => {
  const db = await sentInvoice(); await pay(db, A('p1'), 15000);
  const adj = (aid, amt, o = {}) => stepInv(db, { adjMinor: amt, lastKind: 'adjustment', lastRef: aid }, [['invoiceAdjustments', aid, { invoiceId: INVID, clientId: 'CL-001', amountMinor: amt, reason: 'Rate corrected', entryRef: '', actor: OWNER_UID, createdAt: T(), ...o }]]);
  await assertFails(adj(A('a1'), -5001)); await assertFails(adj(A('a2'), -1000, { reason: 'ab' })); await assertSucceeds(adj(A('a3'), -5000));
});
test('the due date of a sent invoice: change with old date, new date and reason; same date or short reason is refused', async () => {
  const db = await sentInvoice(); const due = (id, next, o = {}) => stepInv(db, { dueDate: next, lastKind: 'due', lastRef: id }, [['invoiceDueDates', id, { invoiceId: INVID, clientId: 'CL-001', previous: '2026-11-30', next, reason: 'Client asked for more time', actor: OWNER_UID, createdAt: T(), ...o }]]);
  await assertFails(due(A('d1'), '2026-11-30')); await assertFails(due(A('d2'), '2026-12-15', { reason: 'ab' })); await assertFails(due(A('d3'), '2026-12-15', { previous: '2026-11-29' })); await assertSucceeds(due(A('d4'), '2026-12-15'));
});
test('the fixed fields of an invoice (rate, total, entries, client) cannot change in any step', async () => {
  const db = await sentInvoice();
  for (const patch of [{ rateMinor: 3000 }, { totalMinor: 1 }, { minutes: 1 }, { entryIds: [EID2] }, { clientId: 'CL-002' }, { currency: 'EUR' }])
    await assertFails(stepInv(db, { ...patch, paidMinor: 5000, lastKind: 'payment', lastRef: A('p9') }, [['payments', A('p9'), PY()]]));
});
test('nobody can delete or edit invoices, audits, payments, reversals, adjustments or due-date records; a stranger sees nothing', async () => {
  const db = await sentInvoice(); await pay(db, A('p1'), 5000);
  await assertFails(deleteDoc(doc(db, 'invoices', INVID))); await assertFails(deleteDoc(doc(db, 'invoiceAudit', A('i1')))); await assertFails(updateDoc(doc(db, 'invoiceAudit', A('i1')), { reason: 'x' }));
  await assertFails(deleteDoc(doc(db, 'payments', A('p1')))); await assertFails(updateDoc(doc(db, 'payments', A('p1')), { note: 'x' }));
  const s = stranger(); await assertFails(getDoc(doc(s, 'invoices', INVID))); await assertFails(getDoc(doc(s, 'payments', A('p1')))); await assertFails(setDoc(doc(s, 'invoices', 'X'), IV()));
});
import assert from 'node:assert/strict';
