import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const B = require('./core-billing.js'), M = require('./core-money.js');
const AID = 'a'.repeat(16), AID2 = 'b'.repeat(16), UID = 'uid-owner';
const P = (o = {}) => Object.assign({ currency: 'USD', rate: '25', arrangement: 'hourly', schedKind: 'monthly', weekStart: 'mon', genTime: '09:00', tz: 'Asia/Manila', dueKind: 'afterSend', dueDays: 14 }, o);
const create = (o, cid = 'CL-001') => B.profilePlan(cid, null, P(o), { aid: AID, registryStatus: 'active' });

test('profile: defaults, rate as integer minor units, exponent snapshot', () => {
  const r = create(); assert.equal(r.ok, true); assert.equal(r.kind, 'create'); assert.equal(r.doc.rateMinor, 2500); assert.equal(r.doc.exp, 2); assert.equal(r.doc.rev, 1); assert.equal(r.doc.lastAudit, AID);
  assert.equal(r.doc.dueKind, 'afterSend'); assert.equal(r.doc.dueDays, 14); assert.equal(r.doc.dueDate, ''); assert.equal(r.doc.anchors, ''); assert.equal(r.audit.action, 'create'); assert.equal(r.audit.rateMinor, 2500);
});
test('profile: JPY has no decimals, KWD has three, too many decimals refused, 0.1 style amounts are exact', () => {
  assert.equal(create({ currency: 'JPY', rate: '3000' }).doc.rateMinor, 3000); assert.equal(create({ currency: 'JPY', rate: '3000' }).doc.exp, 0);
  assert.equal(create({ currency: 'JPY', rate: '3000.5' }).ok, false); assert.equal(create({ currency: 'KWD', rate: '1.234' }).doc.rateMinor, 1234); assert.equal(create({ currency: 'KWD', rate: '1.2345' }).ok, false);
  assert.equal(create({ rate: '0.30' }).doc.rateMinor, 30); assert.equal(create({ rate: '1e3' }).ok, false); assert.equal(create({ rate: '-5' }).ok, false);
});
test('profile: empty rate means "not set" (0); a rate above the limit is refused; unknown currency refused', () => {
  assert.equal(create({ rate: '' }).doc.rateMinor, 0); assert.equal(create({ rate: '10000000.01' }).ok, false); assert.equal(create({ rate: '10000000' }).ok, true);
  const r = create({ currency: 'XYZ' }); assert.equal(r.ok, false); assert.ok(r.errors.currency);
});
test('profile: a new profile needs an active registry entry', () => {
  assert.match(B.profilePlan('CL-001', null, P(), { aid: AID, registryStatus: 'archived' }).reason, /archived/); assert.match(B.profilePlan('CL-001', null, P(), { aid: AID, registryStatus: '' }).reason, /not in the Client IDs/);
  assert.equal(B.profilePlan('cl 001', null, P(), { aid: AID, registryStatus: 'active' }).ok, false); assert.equal(B.profilePlan('CL-001', null, P(), { registryStatus: 'active' }).ok, false);
});
test('profile: schedules - weekly, mid-month, custom anchors (1-4 days, ascending, 1-31)', () => {
  assert.equal(create({ schedKind: 'weekly', weekStart: 'wed' }).doc.weekStart, 'wed'); assert.equal(create({ schedKind: 'midmonth' }).doc.anchors, '');
  assert.equal(create({ schedKind: 'custom', anchors: '10, 25' }).doc.anchors, '10,25'); assert.equal(create({ schedKind: 'custom', anchors: '31' }).doc.anchors, '31');
  ['', '25,10', '10,10', '0,5', '32', 'a,b', '1,2,3,4,5'].forEach(a => assert.equal(create({ schedKind: 'custom', anchors: a }).ok, false, a));
  assert.equal(create({ schedKind: 'monthly', anchors: '10,25' }).doc.anchors, '');       // anchors only matter for "custom"
  assert.equal(create({ schedKind: 'yearly' }).ok, false); assert.equal(create({ weekStart: 'funday' }).ok, false);
});
test('profile: generation time and time zone', () => {
  ['09:00', '00:00', '23:59'].forEach(t => assert.equal(create({ genTime: t }).ok, true, t)); ['24:00', '9:00', '09:60', ''].forEach(t => assert.equal(create({ genTime: t }).ok, false, t));
  assert.equal(create({ tz: 'Europe/London' }).ok, true); assert.equal(create({ tz: 'Not/AZone' }).ok, false); assert.equal(create({ tz: '' }).ok, false);
});
test('profile: due rules - fixed date, days after sending, days after generation', () => {
  const f = create({ dueKind: 'fixed', dueDate: '2026-12-31' }).doc; assert.equal(f.dueDate, '2026-12-31'); assert.equal(f.dueDays, 0);
  assert.equal(create({ dueKind: 'fixed', dueDate: '2026-02-30' }).ok, false); assert.equal(create({ dueKind: 'fixed', dueDate: '' }).ok, false);
  assert.equal(create({ dueKind: 'afterGeneration', dueDays: 30 }).doc.dueDays, 30); assert.equal(create({ dueDays: 0 }).ok, true); assert.equal(create({ dueDays: 365 }).ok, true);
  [366, -1, 1.5, 'x'].forEach(d => assert.equal(create({ dueDays: d }).ok, false, String(d))); assert.equal(create({ dueKind: 'whenever' }).ok, false);
});
test('profile: a change needs a reason and a real change; the audit says what changed; the revision moves by one', () => {
  const old = create().doc, plan = (inp, reason) => B.profilePlan('CL-001', old, P(inp), { aid: AID2, reason, registryStatus: 'active' });
  assert.equal(plan({}, 'no change at all').reason, 'No change to save.'); assert.match(plan({ rate: '30' }, '').reason, /reason/); assert.match(plan({ rate: '30' }, 'ab').reason, /reason/);
  const r = plan({ rate: '30', dueDays: 30 }, 'Agreed a new rate'); assert.equal(r.ok, true); assert.equal(r.kind, 'update'); assert.equal(r.doc.rev, 2); assert.equal(r.doc.lastAudit, AID2); assert.equal(r.keyChange, true);
  assert.match(r.audit.summary, /rate USD 25.00 to USD 30.00/); assert.match(r.audit.summary, /due days 14 to 30/); assert.equal(r.audit.rev, 2); assert.equal(r.audit.rateMinor, 3000); assert.equal(r.audit.reason, 'Agreed a new rate');
  assert.equal(plan({ genTime: '10:00' }, 'Later in the day').keyChange, false); assert.equal(plan({ rate: '31' }, 'abc').ok, true);
  assert.match(B.profilePlan('CL-001', old, P({ rate: '30' }), { aid: AID2, reason: 'Fine reason', registryStatus: '' }).reason, /not in the Client IDs/);
  assert.equal(B.profilePlan('CL-001', old, P({ rate: '30' }), { aid: AID2, reason: 'Archived client edit', registryStatus: 'archived' }).ok, true);
});
test('profile: plain-language descriptions', () => {
  assert.equal(B.describeSchedule(create({ schedKind: 'weekly', weekStart: 'fri' }).doc), 'Weekly, weeks start on Friday, generated at 09:00 (Asia/Manila)'); assert.match(B.describeSchedule(create({ schedKind: 'custom', anchors: '10,25' }).doc), /Custom days 10, 25/);
  assert.equal(B.describeDue(create({ dueKind: 'afterGeneration', dueDays: 1 }).doc), 'Due 1 day after it is generated'); assert.equal(B.describeDue(create().doc), 'Due 14 days after it is sent'); assert.equal(B.rateText(create({ rate: '' }).doc), 'rate not set');
  assert.equal(B.rateText(create({ arrangement: 'monthly', rate: '500' }).doc), 'USD 500.00 per month');
});
test('entry ids: layout, parse, period limits, sequence', () => {
  assert.equal(B.entryId('CL-001', '2026-11-01', '2026-11-15', 1), 'CL-001__20261101__20261115__01'); assert.deepEqual(B.parseEntryId('CL-001__20261101__20261115__07'), { clientId: 'CL-001', start: '2026-11-01', end: '2026-11-15', seq: 7 });
  ['CL-001__20261101__20261115__00', 'CL-001__20261115__20261101__01', 'CL-001__20261301__20261315__01', 'cl-001__20261101__20261115__01', 'CL-001__20261101__20261115'].forEach(i => assert.equal(B.parseEntryId(i), null, i));
  assert.equal(B.validPeriod('2026-01-01', '2026-04-03').ok, true); assert.equal(B.validPeriod('2026-01-01', '2026-04-04').ok, false); assert.equal(B.validPeriod('2026-02-30', '2026-03-01').ok, false); assert.equal(B.validPeriod('2026-11-02', '2026-11-01').ok, false); assert.equal(B.validPeriod('2026-11-01', '2026-11-01').days, 1);
  assert.throws(() => B.entryId('CL-001', '2026-11-01', '2026-11-15', 100)); assert.throws(() => B.entryId('CL-001', '2026-11-01', '2026-11-15', 0));
});
test('entry minutes: hours, hh:mm, whole minutes only, bounds', () => {
  assert.equal(B.minutesFromInput('7.5').minutes, 450); assert.equal(B.minutesFromInput('7:30').minutes, 450); assert.equal(B.minutesFromInput('40').minutes, 2400); assert.equal(B.minutesFromInput('0:01').minutes, 1);
  ['0', '0:00', '', 'abc', '7:60', '7.333', '-1', '2232.1'].forEach(t => assert.equal(B.minutesFromInput(t).ok, false, t));
  assert.equal(B.minutesFromInput('2232').minutes, 133920); assert.equal(B.minutesFromInput('2232:01').ok, false);
});
const E = (o = {}) => Object.assign({ id: 'CL-001__20261101__20261115__01', clientId: 'CL-001', periodStart: '20261101', periodEnd: '20261115', seq: '01', submittedMinutes: 480, approvedMinutes: null, status: 'DRAFT', note: '', supersedes: '', supersededBy: '', approvedAt: null, approverUid: '', relatedInvoiceId: '', rev: 1, lastAudit: AID }, o);
const O = (o = {}) => Object.assign({ aid: AID, aid2: AID2, uid: UID, registryStatus: 'active', profileExists: true }, o);
const CRE = { clientId: 'CL-001', periodStart: '2026-11-01', periodEnd: '2026-11-15', minutes: '8', note: 'First week' };
test('entry create: a draft with all the empty fields, paired audit, first sequence number', () => {
  const r = B.entryPlan([], 'create', CRE, O()); assert.equal(r.ok, true); const w = r.writes[0];
  assert.equal(w.id, 'CL-001__20261101__20261115__01'); assert.equal(w.kind, 'create'); assert.equal(w.doc.status, 'DRAFT'); assert.equal(w.doc.submittedMinutes, 480); assert.equal(w.doc.approvedMinutes, null); assert.equal(w.doc.approverUid, ''); assert.equal(w.doc.relatedInvoiceId, ''); assert.equal(w.doc.rev, 1); assert.equal(w.doc.seq, '01');
  assert.deepEqual(r.audits[0].rec, { entryId: w.id, clientId: 'CL-001', action: 'create', fromStatus: '', toStatus: 'DRAFT', rev: 1, submittedMinutes: 480, approvedMinutes: null, reason: '' });
});
test('entry create: needs an active client and a profile; second entry for the period gets sequence 02', () => {
  assert.match(B.entryPlan([], 'create', CRE, O({ profileExists: false })).reason, /no billing profile/); assert.match(B.entryPlan([], 'create', CRE, O({ registryStatus: 'archived' })).reason, /archived/); assert.match(B.entryPlan([], 'create', CRE, O({ registryStatus: '' })).reason, /not in the Client IDs/);
  assert.equal(B.entryPlan([E()], 'create', CRE, O()).writes[0].id, 'CL-001__20261101__20261115__02'); assert.equal(B.entryPlan([E()], 'create', Object.assign({}, CRE, { periodEnd: '2026-11-16' }), O()).writes[0].id, 'CL-001__20261101__20261116__01');
  assert.equal(B.entryPlan([E({ seq: '99' })], 'create', CRE, O()).ok, false); assert.equal(B.entryPlan([], 'create', Object.assign({}, CRE, { note: 'x'.repeat(201) }), O()).ok, false); assert.equal(B.entryPlan([], 'create', Object.assign({}, CRE, { minutes: '' }), O()).ok, false);
});
test('entry steps: edit, submit, reopen (reason), approve (self-approved, minutes locked afterwards)', () => {
  const d = E(), edit = B.entryPlan([d], 'edit', { id: d.id, minutes: '7.5', note: 'fixed' }, O()); assert.equal(edit.ok, true); assert.equal(edit.writes[0].doc.submittedMinutes, 450); assert.equal(edit.writes[0].doc.rev, 2); assert.equal(edit.audits[0].rec.action, 'edit');
  assert.equal(B.entryPlan([d], 'edit', { id: d.id, minutes: '8', note: '' }, O()).reason, 'No change to save.');
  const sub = B.entryPlan([d], 'submit', { id: d.id }, O()); assert.equal(sub.writes[0].doc.status, 'SUBMITTED'); assert.equal(sub.audits[0].rec.fromStatus, 'DRAFT'); assert.equal(sub.audits[0].rec.toStatus, 'SUBMITTED');
  const s = E({ status: 'SUBMITTED' });
  assert.equal(B.entryPlan([s], 'edit', { id: s.id, minutes: '9' }, O()).ok, false); assert.equal(B.entryPlan([s], 'submit', { id: s.id }, O()).ok, false);
  assert.match(B.entryPlan([s], 'reopen', { id: s.id, reason: '' }, O()).reason, /reason/); const re = B.entryPlan([s], 'reopen', { id: s.id, reason: 'Hours were wrong' }, O()); assert.equal(re.writes[0].doc.status, 'DRAFT'); assert.equal(re.audits[0].rec.reason, 'Hours were wrong');
  const ap = B.entryPlan([s], 'approve', { id: s.id }, O()); const a = ap.writes[0].doc; assert.equal(a.status, 'APPROVED'); assert.equal(a.approvedMinutes, 480); assert.equal(a.approverUid, UID); assert.equal(a.approvedAt, B.SERVER_TIME); assert.equal(ap.audits[0].rec.approvedMinutes, 480);
  assert.equal(B.entryPlan([s], 'approve', { id: s.id, minutes: '7:45' }, O()).writes[0].doc.approvedMinutes, 465); assert.equal(B.entryPlan([s], 'approve', { id: s.id }, O({ uid: '' })).ok, false);
  assert.equal(B.entryPlan([d], 'approve', { id: d.id }, O()).ok, false);
  const ok = E({ status: 'APPROVED', approvedMinutes: 480 }); ['edit', 'submit', 'reopen', 'approve'].forEach(x => assert.equal(B.entryPlan([ok], x, { id: ok.id, minutes: '9', reason: 'a reason' }, O()).ok, false, x));
});
test('entry supersede: an approved entry is replaced by a new draft linked both ways, with a reason', () => {
  const ok = E({ status: 'APPROVED', approvedMinutes: 480, approvedAt: 5, approverUid: UID });
  assert.match(B.entryPlan([ok], 'supersede', { id: ok.id, minutes: '9', reason: '' }, O()).reason, /reason/);
  const r = B.entryPlan([ok], 'supersede', { id: ok.id, minutes: '9', note: 'Corrected', reason: 'Client sent a correction' }, O()); assert.equal(r.ok, true); assert.equal(r.writes.length, 2);
  const [nw, od] = r.writes; assert.equal(nw.kind, 'create'); assert.equal(nw.id, 'CL-001__20261101__20261115__02'); assert.equal(nw.doc.supersedes, ok.id); assert.equal(nw.doc.status, 'DRAFT'); assert.equal(nw.doc.submittedMinutes, 540);
  assert.equal(od.kind, 'update'); assert.equal(od.doc.status, 'SUPERSEDED'); assert.equal(od.doc.supersededBy, nw.id); assert.equal(od.doc.approvedMinutes, 480); assert.equal(od.doc.submittedMinutes, 480); assert.equal(od.doc.rev, 2); assert.equal(od.doc.lastAudit, AID2); assert.equal(nw.doc.lastAudit, AID);
  assert.equal(r.audits[1].rec.action, 'supersede'); assert.equal(r.audits[1].rec.reason, 'Client sent a correction'); assert.equal(r.audits[0].rec.reason, 'Client sent a correction');
  assert.equal(B.entryPlan([E()], 'supersede', { id: E().id, minutes: '9', reason: 'a reason' }, O()).ok, false);
  assert.match(B.entryPlan([E({ status: 'APPROVED', approvedMinutes: 1, relatedInvoiceId: 'INV1' })], 'supersede', { id: E().id, minutes: '9', reason: 'a reason' }, O()).reason, /invoice/);
});
test('period summary: only approved entries count, a replaced one drops out, open and replaced are counted apart', () => {
  const es = [E({ status: 'SUPERSEDED', approvedMinutes: 480, id: 'x1' }), E({ status: 'APPROVED', approvedMinutes: 540, seq: '02', id: 'x2' }), E({ status: 'APPROVED', approvedMinutes: 60, seq: '03', id: 'x3' }), E({ status: 'SUBMITTED', seq: '04', id: 'x4' }), E({ clientId: 'CL-002', status: 'APPROVED', approvedMinutes: 999, id: 'y' })];
  assert.deepEqual(B.periodSummary(es, 'CL-001', '2026-11-01', '2026-11-15'), { approvedMinutes: 600, approvedCount: 2, openCount: 1, supersededCount: 1 }); assert.equal(B.periodSummary(es, 'CL-001', '2026-11-16', '2026-11-30').approvedMinutes, 0);
  assert.equal(B.statusLabel(E({ status: 'APPROVED' })), 'Approved (self-approved)');
});
const LEG = [{ id: 'old1', name: 'Alpha Ltd', rate: 25, arrangement: 'hourly', status: 'active' }, { id: 'old2', name: 'Beta', rate: 500, arrangement: 'monthly', status: 'active' }, { id: 'old3', name: 'Gamma', rate: null, arrangement: 'hourly', status: 'active' }, { id: 'old4', name: 'Delta', rate: 12.5, arrangement: 'hourly', status: 'paused' }, { id: 'old5', name: 'Eps', rate: 0.1 + 0.2, arrangement: 'hourly', status: 'active' }];
const CTX = { currency: 'USD', registry: [{ id: 'CL-001', status: 'active' }, { id: 'CL-009', status: 'archived' }], profiles: [] };
test('migration rows: ready, review (monthly, no rate), blocked (unsupported currency), done (already mapped), float noise refused', () => {
  const rows = B.migrationRows(LEG, [], CTX), by = id => rows.find(r => r.id === id);
  assert.equal(by('old1').state, 'ready'); assert.equal(by('old1').rateText, '25'); assert.equal(by('old2').state, 'review'); assert.match(by('old2').notes.join(' '), /Monthly client/); assert.equal(by('old3').state, 'review'); assert.match(by('old3').notes.join(' '), /No rate/);
  assert.equal(by('old4').state, 'ready'); assert.match(by('old4').notes.join(' '), /paused/); assert.equal(by('old5').state, 'review'); assert.match(by('old5').notes.join(' '), /not a simple amount/);
  assert.equal(B.migrationRows(LEG, [{ legacyId: 'old1', clientId: 'CL-001' }], CTX).find(r => r.id === 'old1').state, 'done');
  const blocked = B.migrationRows(LEG, [], Object.assign({}, CTX, { currency: 'XYZ' })); assert.ok(blocked.every(r => r.state === 'blocked')); assert.match(B.migrationPlan(blocked[0], { mode: 'new' }, { aids: { profile: AID, registry: AID2 }, format: { prefix: 'CL', digits: 3, start: 1, year: '' }, existingIds: [], registry: [], profiles: [] }).reason, /not in the supported list/); assert.equal(B.migrationRows([{ id: 'j', rate: 100.5, arrangement: 'hourly' }], [], Object.assign({}, CTX, { currency: 'JPY' }))[0].notes.join(' ').includes('decimals'), true);
});
const MO = (o = {}) => Object.assign({ aids: { profile: AID, registry: AID2 }, uid: UID, existingIds: ['CL-001', 'CL-009'], registry: CTX.registry, profiles: [], format: { prefix: 'CL', digits: 3, start: 1, year: '' } }, o);
test('migration plan: new ID writes registry + audit + profile + audit + mapping in order; no name, email, phone or company anywhere', () => {
  const row = B.migrationRows(LEG, [], CTX)[0], r = B.migrationPlan(row, { mode: 'new' }, MO());
  assert.equal(r.ok, true); assert.equal(r.newId, 'CL-010'); assert.deepEqual(r.writes.map(w => w.coll), ['clientRegistry', 'clientRegistryAudit', 'billingProfiles', 'billingProfileAudit', 'billingMigration']);
  assert.equal(r.writes[2].doc.rateMinor, 2500); assert.equal(r.writes[2].doc.arrangement, 'hourly'); assert.equal(r.writes[4].id, 'old1'); assert.deepEqual(r.writes[4].doc, { clientId: 'CL-010', profileNew: true, registryNew: true, arrangement: 'hourly' });
  const text = JSON.stringify(r.writes); ['Alpha', 'Ltd', '@', 'phone', 'company'].forEach(w => assert.ok(!text.includes(w), w)); assert.equal(r.writes[3].doc.reason, 'Migrated from an existing client record');
});
test('migration plan: existing ID writes profile + audit + mapping only; conflicts and unsafe choices are refused', () => {
  const row = B.migrationRows(LEG, [], CTX)[0], r = B.migrationPlan(row, { mode: 'existing', clientId: 'CL-001' }, MO()); assert.equal(r.ok, true); assert.deepEqual(r.writes.map(w => w.coll), ['billingProfiles', 'billingProfileAudit', 'billingMigration']); assert.equal(r.writes[2].doc.registryNew, false);
  assert.match(B.migrationPlan(row, { mode: 'existing', clientId: 'CL-001' }, MO({ profiles: ['CL-001'] })).reason, /already has a billing profile/); assert.match(B.migrationPlan(row, { mode: 'existing', clientId: 'CL-009' }, MO()).reason, /archived/);
  assert.match(B.migrationPlan(row, { mode: 'existing', clientId: 'CL-777' }, MO()).reason, /not in the Client IDs/); assert.equal(B.migrationPlan(row, { mode: 'skip' }, MO()).ok, false); assert.equal(B.migrationPlan(row, {}, MO()).ok, false);
  assert.match(B.migrationPlan(Object.assign({}, row, { state: 'done', mapped: 'CL-001' }), { mode: 'new' }, MO()).reason, /already migrated/);
});
test('migration plan: review clients need a tick; blocked never; a second run changes nothing (done rows are refused)', () => {
  const rows = B.migrationRows(LEG, [], CTX), monthly = rows[1];
  assert.match(B.migrationPlan(monthly, { mode: 'new' }, MO()).reason, /checked this client/); const r = B.migrationPlan(monthly, { mode: 'new', confirmReview: true }, MO()); assert.equal(r.ok, true); assert.equal(r.writes[2].doc.arrangement, 'monthly'); assert.equal(r.writes[2].doc.rateMinor, 50000);
  const noRate = B.migrationPlan(rows[2], { mode: 'new', confirmReview: true }, MO()); assert.equal(noRate.ok, true); assert.equal(noRate.writes[2].doc.rateMinor, 0);
  assert.equal(B.migrationPlan(B.migrationRows(LEG, [], Object.assign({}, CTX, { currency: 'XYZ' }))[0], { mode: 'new' }, MO()).ok, false);
  const again = B.migrationRows(LEG, LEG.map((l, i) => ({ legacyId: l.id, clientId: 'CL-0' + (20 + i) })), CTX); assert.ok(again.every(r => r.state === 'done')); again.forEach(r => assert.equal(B.migrationPlan(r, { mode: 'new' }, MO()).ok, false));
  assert.equal(B.migrationPlan(rows[0], { mode: 'new' }, MO({ aids: { profile: AID } })).ok, false);
});
test('migration plan: successive new IDs do not collide when the list grows', () => {
  const rows = B.migrationRows(LEG, [], CTX); let ids = ['CL-001'], got = [];
  [rows[0], rows[3]].forEach(r => { const p = B.migrationPlan(r, { mode: 'new' }, MO({ existingIds: ids })); got.push(p.newId); ids = ids.concat(p.newId); }); assert.deepEqual(got, ['CL-002', 'CL-003']);
});
test('rate and money helpers stay exact', () => { assert.equal(M.lineTotal(2500, 450), 18750); assert.equal(create({ rate: '25.10' }).doc.rateMinor, 2510); });
