import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('./core-schedule.js');
const P = (o = {}) => Object.assign({ schedKind: 'monthly', weekStart: 'mon', anchors: '', genTime: '09:00', tz: 'Asia/Manila', arrangement: 'hourly' }, o);
const per = (p, d) => S.periodAt(p, d);

test('monthly: the calendar month, including February and a leap year', () => {
  assert.deepEqual(per(P(), '2026-11-17'), { start: '2026-11-01', end: '2026-11-30' });
  assert.deepEqual(per(P(), '2026-02-10'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(per(P(), '2028-02-29'), { start: '2028-02-01', end: '2028-02-29' });
  assert.deepEqual(per(P(), '2026-12-31'), { start: '2026-12-01', end: '2026-12-31' });
});
test('midmonth: 1st to 15th and 16th to the month end', () => {
  const p = P({ schedKind: 'midmonth' });
  assert.deepEqual(per(p, '2026-11-15'), { start: '2026-11-01', end: '2026-11-15' });
  assert.deepEqual(per(p, '2026-11-16'), { start: '2026-11-16', end: '2026-11-30' });
  assert.deepEqual(per(p, '2026-02-20'), { start: '2026-02-16', end: '2026-02-28' });
});
test('weekly: seven days from the chosen week start, across a year end', () => {
  assert.deepEqual(per(P({ schedKind: 'weekly', weekStart: 'mon' }), '2026-11-05'), { start: '2026-11-02', end: '2026-11-08' });
  assert.deepEqual(per(P({ schedKind: 'weekly', weekStart: 'mon' }), '2026-11-02'), { start: '2026-11-02', end: '2026-11-08' });
  assert.deepEqual(per(P({ schedKind: 'weekly', weekStart: 'sun' }), '2026-11-05'), { start: '2026-11-01', end: '2026-11-07' });
  assert.deepEqual(per(P({ schedKind: 'weekly', weekStart: 'fri' }), '2027-01-01'), { start: '2027-01-01', end: '2027-01-07' });
  assert.deepEqual(per(P({ schedKind: 'weekly', weekStart: 'wed' }), '2027-01-01'), { start: '2026-12-30', end: '2027-01-05' });
});
test('custom: one anchor makes a period from that day to the day before it next month', () => {
  const p = P({ schedKind: 'custom', anchors: '10' });
  assert.deepEqual(per(p, '2026-11-20'), { start: '2026-11-10', end: '2026-12-09' });
  assert.deepEqual(per(p, '2026-11-05'), { start: '2026-10-10', end: '2026-11-09' });
  assert.deepEqual(per(p, '2026-12-31'), { start: '2026-12-10', end: '2027-01-09' });
});
test('custom: two anchors', () => {
  const p = P({ schedKind: 'custom', anchors: '10,25' });
  assert.deepEqual(per(p, '2026-11-10'), { start: '2026-11-10', end: '2026-11-24' });
  assert.deepEqual(per(p, '2026-11-24'), { start: '2026-11-10', end: '2026-11-24' });
  assert.deepEqual(per(p, '2026-11-25'), { start: '2026-11-25', end: '2026-12-09' });
  assert.deepEqual(per(p, '2026-11-01'), { start: '2026-10-25', end: '2026-11-09' });
});
test('custom: anchor 31 is the last day of a short month', () => {
  const p = P({ schedKind: 'custom', anchors: '31' });
  assert.deepEqual(per(p, '2026-02-28'), { start: '2026-02-28', end: '2026-03-30' });
  assert.deepEqual(per(p, '2026-03-31'), { start: '2026-03-31', end: '2026-04-29' });
  assert.deepEqual(per(p, '2026-04-30'), { start: '2026-04-30', end: '2026-05-30' });
});
test('custom: 30 and 31 in February collapse to one cut day', () => {
  const p = P({ schedKind: 'custom', anchors: '15,30,31' });
  assert.deepEqual(per(p, '2026-02-28'), { start: '2026-02-28', end: '2026-03-14' });
  assert.deepEqual(per(p, '2026-03-30'), { start: '2026-03-30', end: '2026-03-30' });
  assert.deepEqual(per(p, '2026-03-31'), { start: '2026-03-31', end: '2026-04-14' });
});
test('custom: four anchors, and anchor 1 equals the calendar month', () => {
  assert.deepEqual(per(P({ schedKind: 'custom', anchors: '1,8,15,22' }), '2026-11-20'), { start: '2026-11-15', end: '2026-11-21' });
  assert.deepEqual(per(P({ schedKind: 'custom', anchors: '1,8,15,22' }), '2026-11-30'), { start: '2026-11-22', end: '2026-11-30' });
  assert.deepEqual(per(P({ schedKind: 'custom', anchors: '1' }), '2026-11-20'), { start: '2026-11-01', end: '2026-11-30' });
});
test('every schedule: periods follow each other with no gap and no overlap, and none is over 93 days (two years of days)', () => {
  const kinds = [P(), P({ schedKind: 'midmonth' }), P({ schedKind: 'weekly', weekStart: 'sat' }), P({ schedKind: 'custom', anchors: '31' }), P({ schedKind: 'custom', anchors: '1,8,15,22' }), P({ schedKind: 'custom', anchors: '28,29,30,31' }), P({ schedKind: 'custom', anchors: '5' })];
  for (const p of kinds) {
    let cur = per(p, '2026-01-01'), n = 0;
    while (cur.end < '2028-02-01') {
      const next = S.periodAfter(p, cur.end);
      assert.equal(next.start, S.periodAt(p, cur.end).end === cur.end ? next.start : '');
      assert.ok(next.start > cur.end && S.periodDays(cur) >= 1 && S.periodDays(cur) <= 93, p.schedKind + ' ' + p.anchors + ' ' + cur.start);
      assert.equal(next.start, new Date(Date.parse(cur.end + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10));
      assert.ok(S.isBoundary(p, next.start) && S.isBoundary(p, cur.start));
      cur = next; n++;
    }
    assert.ok(n > 20);
  }
});
test('every date belongs to exactly one period of its own schedule', () => {
  const p = P({ schedKind: 'custom', anchors: '3,17' });
  for (let d = Date.parse('2026-01-01T00:00:00Z'); d < Date.parse('2027-03-01T00:00:00Z'); d += 86400000) {
    const iso = new Date(d).toISOString().slice(0, 10), q = per(p, iso);
    assert.ok(q.start <= iso && iso <= q.end, iso);
  }
});
test('unknown schedule or week start is refused; not a boundary is refused', () => {
  assert.throws(() => per(P({ schedKind: 'daily' }), '2026-11-01'));
  assert.throws(() => per(P({ schedKind: 'weekly', weekStart: 'xyz' }), '2026-11-01'));
  assert.throws(() => per(P({ schedKind: 'custom', anchors: '' }), '2026-11-01'));
  assert.throws(() => S.duePeriods(P(), '2026-11-05', Date.now()));
});
test('a period is due on the day after its last day at the generation time in the profile zone', () => {
  const p = P(), pr = { start: '2026-10-01', end: '2026-10-31' };           // Manila is UTC+8: Nov 1 09:00 = Nov 1 01:00 UTC
  assert.equal(S.dueAt(p, pr), Date.UTC(2026, 10, 1, 1, 0, 0));
  assert.equal(S.isDue(p, pr, Date.UTC(2026, 10, 1, 0, 59, 59)), false);
  assert.equal(S.isDue(p, pr, Date.UTC(2026, 10, 1, 1, 0, 0)), true);
});
test('due time follows daylight saving: New York (clocks go back on 1 Nov 2026) and Sydney (forward on 4 Oct 2026)', () => {
  assert.equal(S.dueAt(P({ tz: 'America/New_York' }), { start: '2026-10-01', end: '2026-10-31' }), Date.UTC(2026, 10, 1, 14, 0, 0));       // 09:00 EST = 14:00 UTC
  assert.equal(S.dueAt(P({ tz: 'America/New_York' }), { start: '2026-09-01', end: '2026-09-30' }), Date.UTC(2026, 9, 1, 13, 0, 0));        // 09:00 EDT = 13:00 UTC
  assert.equal(S.dueAt(P({ tz: 'Australia/Sydney' }), { start: '2026-09-01', end: '2026-10-03' }), Date.UTC(2026, 9, 3, 22, 0, 0));       // 09:00 AEDT = 22:00 UTC the day before
});
test('generation time is respected (late evening time)', () => {
  const p = P({ genTime: '23:30' }), pr = { start: '2026-10-01', end: '2026-10-31' };
  assert.equal(S.dueAt(p, pr), Date.UTC(2026, 10, 1, 15, 30, 0));
});
test('duePeriods lists consecutive due periods and stops at the first one not due', () => {
  const now = Date.UTC(2026, 10, 5, 0, 0, 0);                                   // 5 Nov 2026 UTC (Manila 08:00)
  const r = S.duePeriods(P(), '2026-08-01', now);
  assert.deepEqual(r.periods.map(x => x.start), ['2026-08-01', '2026-09-01', '2026-10-01']);
  assert.equal(r.next.start, '2026-11-01'); assert.equal(r.hidden, 0);
  assert.deepEqual(S.duePeriods(P(), '2026-11-01', now).periods, []);
});
test('duePeriods keeps only the newest 24 and says how many were hidden', () => {
  const r = S.duePeriods(P({ schedKind: 'weekly' }), '2025-01-06', Date.UTC(2026, 10, 5));
  assert.equal(r.periods.length, 24); assert.ok(r.hidden > 50);
  assert.equal(r.periods[23].end < '2026-11-05', true);
});
test('lastDue gives the newest finished period', () => {
  assert.equal(S.lastDue(P(), Date.UTC(2026, 10, 5)).start, '2026-10-01');
  assert.equal(S.lastDue(P(), Date.UTC(2026, 9, 31, 20)).start, '2026-09-01');
  assert.equal(S.lastDue(P({ schedKind: 'midmonth' }), Date.UTC(2026, 10, 5)).start, '2026-10-16');
});
const E = (o) => Object.assign({ clientId: 'CL-001', periodStart: '20261001', periodEnd: '20261031', status: 'APPROVED', relatedInvoiceId: '' }, o);
const PER = { start: '2026-10-01', end: '2026-10-31' };
test('period state: waiting, draft, submitted, ready', () => {
  const st = (es, inv = [], sk = []) => S.stateOf('CL-001', PER, es, inv, sk).state;
  assert.equal(st([]), 'waiting');
  assert.equal(st([E({ status: 'DRAFT' })]), 'draft');
  assert.equal(st([E({ status: 'SUBMITTED' })]), 'submitted');
  assert.equal(st([E({ status: 'APPROVED' })]), 'ready');
  assert.equal(st([E({ status: 'APPROVED' }), E({ status: 'DRAFT' })]), 'draft');
  assert.equal(st([E({ status: 'SUPERSEDED' }), E({ status: 'APPROVED' })]), 'ready');
});
test('period state: the least advanced entry decides', () => {
  assert.equal(S.stateOf('CL-001', PER, [E({ status: 'APPROVED' }), E({ status: 'SUBMITTED' })], [], []).state, 'submitted');
});
test('period state: invoiced, part invoiced, cancelled invoice frees the period, three entries', () => {
  const inv = [{ id: 'I1', status: 'SENT' }, { id: 'I2', status: 'CANCELLED' }];
  assert.equal(S.stateOf('CL-001', PER, [E({ relatedInvoiceId: 'I1' })], inv, []).state, 'invoiced');
  assert.equal(S.stateOf('CL-001', PER, [E({ relatedInvoiceId: 'I2' })], inv, []).state, 'ready');
  assert.equal(S.stateOf('CL-001', PER, [E({ relatedInvoiceId: 'I1' }), E({})], inv, []).state, 'partial');
  assert.equal(S.stateOf('CL-001', PER, [E(), E(), E()], inv, []).state, 'toomany');
});
test('period state: hours for other dates that overlap are flagged, other clients and non-overlapping hours are ignored', () => {
  assert.equal(S.stateOf('CL-001', PER, [E({ periodStart: '20261015', periodEnd: '20261115' })], [], []).state, 'check');
  assert.equal(S.stateOf('CL-001', PER, [E({ clientId: 'CL-002' })], [], []).state, 'waiting');
  assert.equal(S.stateOf('CL-001', PER, [E({ periodStart: '20260901', periodEnd: '20260930' })], [], []).state, 'waiting');
});
test('period state: a skipped period shows as skipped (and warns when hours exist)', () => {
  const sk = [{ id: 'CL-001__20261001__20261031', clientId: 'CL-001' }];
  assert.equal(S.stateOf('CL-001', PER, [], [], sk).state, 'skipped');
  assert.ok(S.stateOf('CL-001', PER, [E()], [], sk).note.length > 0);
});
test('list start: nothing yet, after the newest invoiced period, after a skip, or at the earliest period holding hours', () => {
  const p = P(), now = Date.UTC(2026, 10, 5);
  assert.equal(S.listStart(p, 'CL-001', [], [], [], now), '');
  const inv = [{ id: 'I1', status: 'SENT' }];
  assert.equal(S.listStart(p, 'CL-001', [E({ relatedInvoiceId: 'I1', periodStart: '20260901', periodEnd: '20260930' })], inv, [], now), '2026-10-01');
  assert.equal(S.listStart(p, 'CL-001', [], [], [{ clientId: 'CL-001', periodStart: '20260801', periodEnd: '20260831' }], now), '2026-09-01');
  assert.equal(S.listStart(p, 'CL-001', [E({ status: 'DRAFT', periodStart: '20260801', periodEnd: '20260831' }), E({ status: 'DRAFT' })], [], [], now), '2026-08-01');
  assert.equal(S.listStart(p, 'CL-001', [E({ relatedInvoiceId: 'I1' })], [{ id: 'I1', status: 'CANCELLED' }], [], now), '2026-10-01');
});
const O = (o = {}) => Object.assign({ registryStatus: 'active', profile: P(), nowMs: Date.UTC(2026, 10, 5), uid: 'U1', skips: [], state: 'waiting' }, o);
test('skip plan: a valid skip uses the period ID and the digits form of the dates', () => {
  const r = S.skipPlan('CL-001', PER, 'Client paused work', O());
  assert.equal(r.ok, true); assert.equal(r.id, 'CL-001__20261001__20261031');
  assert.deepEqual(r.doc, { clientId: 'CL-001', periodStart: '20261001', periodEnd: '20261031', reason: 'Client paused work', actor: 'U1', createdAt: '@server-time' });
});
test('skip plan refusals', () => {
  const no = (per, reason, o) => assert.equal(S.skipPlan('CL-001', per, reason, o).ok, false);
  no(PER, 'ab', O()); no(PER, 'x'.repeat(201), O()); no(PER, '   ', O());
  no(PER, 'Because', O({ registryStatus: 'archived' })); no(PER, 'Because', O({ profile: P({ arrangement: 'monthly' }) }));
  no({ start: '2026-10-02', end: '2026-10-31' }, 'Because', O()); no({ start: '2026-10-01', end: '2026-10-30' }, 'Because', O());
  no({ start: '2026-11-01', end: '2026-11-30' }, 'Because', O());                                   // not due yet
  no(PER, 'Because', O({ skips: [{ id: 'CL-001__20261001__20261031' }] })); no(PER, 'Because', O({ state: 'draft' })); no(PER, 'Because', O({ uid: '' }));
  assert.equal(S.skipPlan('bad id', PER, 'Because', O()).ok, false);
});
test('labels exist for every state and the badge counts the states that still need you', () => {
  for (const k of ['waiting', 'draft', 'submitted', 'ready', 'toomany', 'invoiced', 'partial', 'skipped', 'check']) assert.ok(S.STATE_LABEL[k]);
  assert.ok(S.ACTION_STATES.includes('waiting') && !S.ACTION_STATES.includes('invoiced') && !S.ACTION_STATES.includes('skipped'));
});
test('period length is exact and the description reads right in singular and plural', () => {
  assert.equal(S.periodDays({ start: '2026-02-01', end: '2026-02-28' }), 28);
  assert.equal(S.periodDays({ start: '2028-02-01', end: '2028-02-29' }), 29);
  assert.equal(S.periodDays({ start: '2026-10-05', end: '2026-10-05' }), 1);
  assert.equal(S.describe({ start: '2026-10-05', end: '2026-10-05' }), '2026-10-05 to 2026-10-05 (1 day)');
  assert.equal(S.describe({ start: '2026-10-05', end: '2026-10-06' }), '2026-10-05 to 2026-10-06 (2 days)');
});
test('the 24 kept periods are the NEWEST 24, in order, ending at the newest due period', () => {
  const p = P({ schedKind: 'weekly' }), now = Date.UTC(2026, 10, 5), r = S.duePeriods(p, '2025-01-06', now);
  assert.equal(r.periods[23].start, S.lastDue(p, now).start);
  for (let i = 1; i < 24; i++) assert.equal(r.periods[i].start, S.periodAfter(p, r.periods[i - 1].end).start);
  assert.equal(r.hidden + 24, Math.round((Date.parse(r.next.start + 'T00:00:00Z') - Date.parse('2025-01-06T00:00:00Z')) / 86400000 / 7));
});
test('hours that touch the period by even one day are flagged; hours that do not touch are ignored; a matching start with a different end is flagged', () => {
  const st = e => S.stateOf('CL-001', PER, [e], [], []).state;
  assert.equal(st(E({ periodStart: '20260925', periodEnd: '20261001' })), 'check');
  assert.equal(st(E({ periodStart: '20261031', periodEnd: '20261105' })), 'check');
  assert.equal(st(E({ periodStart: '20260925', periodEnd: '20260930' })), 'waiting');
  assert.equal(st(E({ periodStart: '20261101', periodEnd: '20261105' })), 'waiting');
  assert.equal(st(E({ periodEnd: '20261030' })), 'check');
  assert.equal(st(E({ periodStart: '20261002' })), 'check');
});
test('exactly two approved entries are ready to invoice (the limit is more than two)', () => {
  assert.equal(S.stateOf('CL-001', PER, [E(), E()], [], []).state, 'ready');
});
test('list start ignores other clients and replaced entries', () => {
  const p = P(), now = Date.UTC(2026, 10, 5);
  assert.equal(S.listStart(p, 'CL-001', [E({ clientId: 'CL-002' })], [], [], now), '');
  assert.equal(S.listStart(p, 'CL-001', [E({ status: 'SUPERSEDED' })], [], [], now), '');
  assert.equal(S.listStart(p, 'CL-001', [], [], [{ clientId: 'CL-002', periodStart: '20261001', periodEnd: '20261031' }], now), '');
  assert.equal(S.listStart(p, 'CL-001', [E({ status: 'SUPERSEDED', periodStart: '20260801', periodEnd: '20260831' }), E({ status: 'DRAFT' })], [], [], now), '2026-10-01');
});
test('skip reason: 3 and 200 characters are accepted, 2 and 201 are refused', () => {
  assert.equal(S.skipPlan('CL-001', PER, 'abc', O()).ok, true);
  assert.equal(S.skipPlan('CL-001', PER, 'x'.repeat(200), O()).ok, true);
  assert.equal(S.skipPlan('CL-001', PER, 'ab', O()).ok, false);
  assert.equal(S.skipPlan('CL-001', PER, 'x'.repeat(201), O()).ok, false);
});
