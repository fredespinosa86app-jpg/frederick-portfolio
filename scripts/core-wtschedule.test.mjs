// Run: node --test scripts/core-wtschedule.test.mjs   (Node 20+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const s = createRequire(import.meta.url)('./core-wtschedule.js');
const MIN = 60000, T0 = Date.UTC(2026, 10, 6, 4, 0, 0);          // 12:00 Manila
const doc = (o = {}) => Object.assign({ fb: 15, lu: 60, lb: 15, pfb: 15, plu: 60, plb: 15, rev: 1, updatedAt: T0 - 86400000 }, o);
const ev = (n, type, atMs) => ({ n, type, atMs });
const A = (clientId, addedAt, status = 'active') => ({ clientId, status, addedAt });

test('built-in values are 15 / 60 / 15', () => { assert.deepEqual({ ...s.BUILTIN }, { fb: 15, lu: 60, lb: 15 }); });

test('parseMinutes: whole numbers 0 to 240 only', () => {
  for (const [t, v] of [['0', 0], ['60', 60], [' 240 ', 240], ['007', 7]]) assert.deepEqual(s.parseMinutes(t), { ok: true, value: v }, t);
  for (const t of ['', ' ', '-1', '241', '1.5', '1e2', 'abc', '15 min', '1000', null, undefined, '٣']) assert.equal(s.parseMinutes(t).ok, false, String(t));
});

test('clean: accepts a good document, rejects anything odd', () => {
  assert.equal(s.clean(doc()).lu, 60);
  for (const bad of [null, undefined, 5, 'x', [], doc({ fb: -1 }), doc({ lu: 241 }), doc({ lb: 1.5 }), doc({ pfb: '15' }), doc({ plu: null }), doc({ updatedAt: 'now' }), doc({ updatedAt: undefined }), { fb: 1 }])
    assert.equal(s.clean(bad), null, JSON.stringify(bad));
  assert.equal(s.clean(doc({ updatedAt: { toMillis: () => 5 } })).updatedAtMs, 5);
  assert.equal(s.clean(doc({ rev: 'x' })).rev, 1);
});

test('schedule client: earliest addedAt wins; ties by alphabetical Client ID; removed ones ignored', () => {
  assert.equal(s.scheduleClient([A('BETA', 200), A('ALPHA', 300)]), 'BETA');
  assert.equal(s.scheduleClient([A('BETA', 100), A('ALPHA', 100)]), 'ALPHA');
  assert.equal(s.scheduleClient([A('ALPHA', 50, 'removed'), A('BETA', 100)]), 'BETA');
  assert.equal(s.scheduleClient([]), ''); assert.equal(s.scheduleClient(null), '');
  assert.equal(s.scheduleClient([A('ZED', { toMillis: () => 10 }), A('ABC', 20)]), 'ZED');
  assert.equal(s.scheduleClient([A('B', undefined), A('A', undefined)]), 'A');
  assert.equal(s.scheduleClient([A('B', undefined), A('A', 5)]), 'A');
});

test('pick: client schedule, else default, else built-in; first client without a schedule uses default, NOT the second client', () => {
  const docs = { default: doc({ lu: 45 }), BETA: doc({ lu: 90 }) };
  assert.equal(s.pick([A('BETA', 1)], docs).source, 'client');
  assert.equal(s.pick([A('BETA', 1)], docs).doc.lu, 90);
  const p = s.pick([A('ALPHA', 1), A('BETA', 2)], docs);     // ALPHA first and has no schedule; BETA must NOT be used
  assert.equal(p.source, 'default'); assert.equal(p.doc.lu, 45); assert.equal(p.clientId, 'ALPHA');
  assert.equal(s.pick([], docs).source, 'default');
  assert.equal(s.pick([A('ALPHA', 1)], {}).source, 'builtin');
  assert.equal(s.pick([A('BETA', 1)], { BETA: doc({ fb: -3 }) }).source, 'builtin', 'a bad client document falls back, then default if present');
  assert.equal(s.pick([A('BETA', 1)], { BETA: { junk: 1 }, default: doc() }).source, 'default');
});

test('limits: the edit applies from the NEXT break', () => {
  const p = s.pick([], { default: doc({ lu: 30, plu: 60, updatedAt: T0 + 30 * MIN }) });   // edited 12:30, lunch 60 -> 30
  assert.equal(s.limitsAt(p, T0).lu, 60, 'lunch out at 12:00 (before the edit) keeps 60');
  assert.equal(s.limitsAt(p, T0 + 30 * MIN).lu, 30, 'a break out exactly at the edit time uses the new value');
  assert.equal(s.limitsAt(p, T0 + 31 * MIN).lu, 30);
  assert.equal(s.limitsAt(s.pick([], {}), T0).lu, 60, 'built-in');
  assert.equal(s.limitsAt(p, NaN).lu, 30);
});

test('QA example: lunch 12:00, limit 60, edited to 30 at 12:30 -> still due 13:00, not late at 12:31', () => {
  const p = s.pick([], { default: doc({ lu: 30, plu: 60, updatedAt: T0 + 30 * MIN }) });
  const evs = [ev(1, 'CLOCK_IN', T0 - 3600000), ev(2, 'LUNCH_OUT', T0)];
  const st = s.breakStatus('LUNCH', evs, T0 + 31 * MIN, p);
  assert.equal(st.kind, 'ok'); assert.equal(st.deadlineMs, T0 + 60 * MIN);
  assert.equal(s.breakStatus('LUNCH', evs, T0 + 61 * MIN, p).kind, 'late');
});

test('example table: 12:59:59 no flicker, 13:00:01 late by 00:01', () => {
  const p = s.pick([], { default: doc() }), evs = [ev(1, 'CLOCK_IN', T0 - 1), ev(2, 'LUNCH_OUT', T0)];
  const a = s.breakStatus('LUNCH', evs, T0 + 3600000 - 1000, p); assert.notEqual(a.kind, 'late'); assert.equal(s.mmss(a.remainingMs), '00:01');
  assert.equal(s.breakStatus('LUNCH', evs, T0 + 3600000, p).kind, 'near', 'exactly at the deadline is not late');
  const b = s.breakStatus('LUNCH', evs, T0 + 3600000 + 1000, p); assert.equal(b.kind, 'late'); assert.equal(s.describe(b), 'Lunch: late by 00:01');
});

test('kinds: ok, near (5 min or half the limit), late, nolimit, none', () => {
  const p = s.pick([], { default: doc() }), evs = [ev(2, 'LUNCH_OUT', T0)];
  assert.equal(s.breakStatus('LUNCH', evs, T0 + 10 * MIN, p).kind, 'ok');
  assert.equal(s.breakStatus('LUNCH', evs, T0 + 56 * MIN, p).kind, 'near');
  const p2 = s.pick([], { default: doc({ fb: 4 }) }), e2 = [ev(2, 'FIRST_BREAK_OUT', T0)];
  assert.equal(s.breakStatus('FIRST_BREAK', e2, T0 + 1 * MIN, p2).kind, 'ok', 'half of 4 min is 2 min');
  assert.equal(s.breakStatus('FIRST_BREAK', e2, T0 + 2.5 * MIN, p2).kind, 'near');
  const p0 = s.pick([], { default: doc({ lu: 0 }) }); const z = s.breakStatus('LUNCH', evs, T0 + 9e9, p0); assert.equal(z.kind, 'nolimit'); assert.equal(s.describe(z), 'Lunch: no time limit');
  assert.equal(s.breakStatus('WORKING', evs, T0, p).kind, 'none');
  assert.equal(s.breakStatus('NOT_STARTED', [], T0, p).kind, 'none');
});

test('each break uses its own limit', () => {
  const p = s.pick([], { default: doc({ fb: 10, lu: 50, lb: 20 }) });
  assert.equal(s.breakStatus('FIRST_BREAK', [ev(2, 'FIRST_BREAK_OUT', T0)], T0, p).limitMin, 10);
  assert.equal(s.breakStatus('LUNCH', [ev(2, 'LUNCH_OUT', T0)], T0, p).limitMin, 50);
  assert.equal(s.breakStatus('LAST_BREAK', [ev(2, 'LAST_BREAK_OUT', T0)], T0, p).limitMin, 20);
});

test('only an open break counts: newest punch must be its break-out and match the state', () => {
  const p = s.pick([], { default: doc() });
  assert.equal(s.breakStatus('LUNCH', [ev(2, 'LUNCH_OUT', T0), ev(3, 'LUNCH_IN', T0 + MIN)], T0 + 2 * MIN, p).kind, 'none');
  assert.equal(s.breakStatus('LUNCH', [ev(2, 'FIRST_BREAK_OUT', T0)], T0, p).kind, 'none', 'mismatched punch');
  assert.equal(s.breakStatus('LUNCH', [ev(2, 'LUNCH_OUT', NaN)], T0, p).kind, 'none');
  assert.equal(s.breakStatus('LUNCH', [ev(3, 'LUNCH_OUT', T0), ev(2, 'CLOCK_IN', T0 - 5)], T0 + MIN, p).kind, 'ok', 'order by n, not array order');
});

test('describe and source text', () => {
  const p = s.pick([A('ACME-1', 1)], { 'ACME-1': doc({ lu: 90 }) });
  const st = s.breakStatus('LUNCH', [ev(2, 'LUNCH_OUT', T0)], T0 + 5 * MIN, p);
  assert.equal(s.describe(st), 'Lunch: 1:25:00 left'); assert.equal(s.sourceText(st, p), 'Schedule of ACME-1 (90 min)');
  assert.equal(s.sourceText(s.breakStatus('LUNCH', [ev(2, 'LUNCH_OUT', T0)], T0, s.pick([], {})), s.pick([], {})), 'Built-in schedule (60 min)');
  assert.equal(s.describe({ kind: 'none' }), ''); assert.equal(s.mmss(-5), '00:00'); assert.equal(s.mmss(3725000), '1:02:05');
});
