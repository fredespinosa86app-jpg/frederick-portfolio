// Run: node --test scripts/core-worktrack.test.mjs   (Node 20+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const w = createRequire(import.meta.url)('./core-worktrack.js');

const st = (state, o = {}) => Object.assign({ state, sid: 'S1S1S1S1S1S1S1S1S1', n: state === 'NOT_STARTED' ? 0 : 3, fb: false, lu: false, lb: false, lastEid: '', rev: 5 }, o);

/* Expected result of every punch from every state: 9 punches x 5 states = 45 cases (the rules attack tests use the SAME matrix). */
const ALLOWED = {
  NOT_STARTED: ['CLOCK_IN'],
  WORKING: ['FIRST_BREAK_OUT', 'LUNCH_OUT', 'LAST_BREAK_OUT', 'CLOCK_OUT', 'CLOSE_INCOMPLETE'],
  FIRST_BREAK: ['FIRST_BREAK_IN', 'CLOSE_INCOMPLETE'],
  LUNCH: ['LUNCH_IN', 'CLOSE_INCOMPLETE'],
  LAST_BREAK: ['LAST_BREAK_IN', 'CLOSE_INCOMPLETE']
};
test('transition table: all 45 state x punch cases', () => {
  let n = 0;
  for (const s of w.STATES) for (const t of w.TYPES) {
    const r = w.next(st(s), t, 'NEWSIDNEWSIDNEWSID1');
    assert.equal(r.ok, ALLOWED[s].includes(t), s + ' + ' + t); n++;
    if (!r.ok) assert.ok(r.reason && r.reason.length > 5, 'a refusal always says why: ' + s + ' + ' + t);
  }
  assert.equal(n, 45);
});
test('each break type can be used only once per session', () => {
  assert.equal(w.next(st('WORKING', { fb: true }), 'FIRST_BREAK_OUT').ok, false);
  assert.equal(w.next(st('WORKING', { lu: true }), 'LUNCH_OUT').ok, false);
  assert.equal(w.next(st('WORKING', { lb: true }), 'LAST_BREAK_OUT').ok, false);
  assert.equal(w.next(st('WORKING', { fb: true }), 'LUNCH_OUT').ok, true);
  assert.match(w.next(st('WORKING', { lu: true }), 'LUNCH_OUT').reason, /already used/);
});
test('break order is free and a skipped break leaves no hole in the counter', () => {
  let s = w.initialState(), log = [];
  for (const [t, extra] of [['CLOCK_IN', { sid: 'AAAAAAAAAAAAAAAAAA' }], ['LAST_BREAK_OUT'], ['LAST_BREAK_IN'], ['LUNCH_OUT'], ['LUNCH_IN'], ['CLOCK_OUT']]) {
    const p = w.plan(s, t, extra || {}); assert.equal(p.ok, true, t); s = p.state; log.push(p.event.n);
  }
  assert.deepEqual(log, [1, 2, 3, 4, 5, 6]);
  assert.equal(s.state, 'NOT_STARTED');
});
test('clock in starts a fresh session: counter 1, flags cleared, new session id', () => {
  const p = w.plan(st('NOT_STARTED', { n: 7, fb: true, lu: true, lb: true, sid: 'OLDOLDOLDOLDOLDOLD' }), 'CLOCK_IN', { sid: 'NEWNEWNEWNEWNEWNEW' });
  assert.equal(p.ok, true); assert.equal(p.event.n, 1); assert.equal(p.eid, 'NEWNEWNEWNEWNEWNEW__1'); assert.equal(p.newSession, true);
  assert.deepEqual([p.state.fb, p.state.lu, p.state.lb, p.state.n, p.state.rev], [false, false, false, 1, 6]);
});
test('close as incomplete needs a reason of 3 to 200 characters', () => {
  const s = st('LUNCH');
  assert.equal(w.plan(s, 'CLOSE_INCOMPLETE', {}).ok, false);
  assert.equal(w.plan(s, 'CLOSE_INCOMPLETE', { reason: 'ab' }).ok, false);
  assert.equal(w.plan(s, 'CLOSE_INCOMPLETE', { reason: 'x'.repeat(201) }).ok, false);
  const p = w.plan(s, 'CLOSE_INCOMPLETE', { reason: '  Forgot to clock out  ' });
  assert.equal(p.ok, true); assert.equal(p.event.reason, 'Forgot to clock out'); assert.equal(p.state.state, 'NOT_STARTED');
  assert.equal(w.plan(st('WORKING'), 'CLOCK_OUT', { reason: 'ignored' }).event.reason, '');
});
test('options(): refusals carry a reason and exactly the allowed punches are enabled', () => {
  const o = w.options(st('FIRST_BREAK'));
  assert.deepEqual(o.filter(x => x.ok).map(x => x.type), ALLOWED.FIRST_BREAK);
  assert.ok(o.find(x => x.type === 'CLOCK_OUT').reason.includes('first break'));
});
test('event ids and id patterns', () => {
  assert.equal(w.eventId('A'.repeat(20), 4), 'A'.repeat(20) + '__4');
  assert.ok(w.EID_RE.test('A'.repeat(20) + '__12')); assert.ok(!w.EID_RE.test('A'.repeat(20) + '__123')); assert.ok(!w.EID_RE.test('short__1'));
});

/* ---------------- clock maths ---------------- */
const H = 3600000, M = 60000, T0 = Date.UTC(2026, 10, 4, 0, 0, 0);
const E = (n, type, atMs, reason = '') => ({ n, type, atMs, reason });
test('derive: gross keeps running through breaks, net pauses', () => {
  const d = w.derive([E(1, 'CLOCK_IN', T0), E(2, 'FIRST_BREAK_OUT', T0 + 2 * H), E(3, 'FIRST_BREAK_IN', T0 + 2 * H + 15 * M), E(4, 'LUNCH_OUT', T0 + 4 * H), E(5, 'LUNCH_IN', T0 + 5 * H), E(6, 'CLOCK_OUT', T0 + 9 * H)], T0 + 20 * H);
  assert.equal(d.valid, true); assert.equal(d.closed, true); assert.equal(d.incomplete, false);
  assert.equal(d.grossMs, 9 * H); assert.equal(d.breakMs, 75 * M); assert.equal(d.netMs, 9 * H - 75 * M);
  assert.equal(d.breaks.length, 2);
});
test('derive: open session counts up to now; an open break is still running', () => {
  const d = w.derive([E(1, 'CLOCK_IN', T0), E(2, 'LUNCH_OUT', T0 + 3 * H)], T0 + 4 * H);
  assert.equal(d.closed, false); assert.equal(d.state, 'LUNCH'); assert.equal(d.grossMs, 4 * H); assert.equal(d.breakMs, 1 * H); assert.equal(d.netMs, 3 * H);
});
test('derive: a clock that is slightly behind never gives negative time', () => {
  const d = w.derive([E(1, 'CLOCK_IN', T0)], T0 - 5000);
  assert.equal(d.grossMs, 0); assert.equal(d.netMs, 0);
});
test('derive: closed as incomplete has no net total', () => {
  const d = w.derive([E(1, 'CLOCK_IN', T0), E(2, 'CLOSE_INCOMPLETE', T0 + 30 * H, 'Forgot')], T0 + 40 * H);
  assert.equal(d.incomplete, true); assert.equal(d.closed, true); assert.equal(d.netMs, null); assert.equal(d.grossMs, 30 * H);
});
test('derive: detects a missing, reordered or illegal record', () => {
  assert.equal(w.derive([E(1, 'CLOCK_IN', T0), E(3, 'CLOCK_OUT', T0 + H)], T0).valid, false);
  assert.equal(w.derive([E(1, 'CLOCK_IN', T0), E(2, 'CLOCK_OUT', T0 - H)], T0).valid, false);
  assert.equal(w.derive([E(1, 'CLOCK_IN', T0), E(2, 'LUNCH_IN', T0 + H)], T0).valid, false);
  assert.equal(w.derive([E(1, 'LUNCH_OUT', T0)], T0).valid, false);
  assert.equal(w.derive([E(1, 'CLOCK_IN', T0), E(2, 'CLOCK_OUT', T0 + H), E(3, 'LUNCH_OUT', T0 + 2 * H)], T0).valid, false);
});
test('derive: input order does not matter and an empty list is fine', () => {
  const d = w.derive([E(2, 'CLOCK_OUT', T0 + H), E(1, 'CLOCK_IN', T0)], T0);
  assert.equal(d.valid, true); assert.equal(d.netMs, H);
  assert.equal(w.derive([], T0).startMs, null);
});
test('stale session warning after 16 hours (configurable)', () => {
  const d = w.derive([E(1, 'CLOCK_IN', T0)], T0);
  assert.equal(w.isStale(d, T0 + 15 * H), false); assert.equal(w.isStale(d, T0 + 17 * H), true); assert.equal(w.isStale(d, T0 + 5 * H, 4), true);
  assert.equal(w.isStale(w.derive([E(1, 'CLOCK_IN', T0), E(2, 'CLOCK_OUT', T0 + H)], T0), T0 + 99 * H), false);
});
test('a session that crosses midnight keeps one continuous duration (DST-free zone)', () => {
  const tm = createRequire(import.meta.url)('./core-time.js');
  const a = Date.UTC(2026, 10, 4, 15, 0, 0), b = Date.UTC(2026, 10, 4, 18, 0, 0);   // 23:00 to 02:00 in Manila
  const d = w.derive([E(1, 'CLOCK_IN', a), E(2, 'CLOCK_OUT', b)], b);
  assert.equal(d.grossMs, 3 * H); assert.notEqual(tm.localDateKey(a, 'Asia/Manila'), tm.localDateKey(b, 'Asia/Manila'));
});
