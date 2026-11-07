// Run: node --test scripts/core-anon.test.mjs   -- SE-H1: counted anonymous writes (record + daily counter in ONE batch)
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const A = require('./core-anon.js');
const mk = (over = {}) => { const log = { batches: [], sleeps: [] }; let fail = over.fail || []; const env = { db: 'DB', increment: n => ({ inc: n }), doc: (db, c, i) => ({ db, c, i }), now: () => Date.UTC(2026, 10, 7, 23, 59, 59), sleep: async ms => { log.sleeps.push(ms); }, rand: () => 0.5,
  writeBatch: db => { const ops = []; return { set: (r, d, o) => ops.push({ r, d, o }), commit: async () => { log.batches.push(ops); const f = fail.shift(); if (f) throw f; } }; } };
  return { log, counted: A.make(Object.assign(env, over.env || {})) }; };
const denied = () => Object.assign(new Error('x'), { code: 'permission-denied' });
test('UTC day key: late evening UTC stays on the same day, and the key shape matches the rules (v_ or c_ + 8 digits)', () => { assert.equal(A.utcDay(Date.UTC(2026, 10, 7, 23, 59, 59)), '20261107'); assert.equal(A.utcDay(Date.UTC(2026, 10, 8, 0, 0, 0)), '20261108'); assert.match(A.counterId('v', 0), /^v_\d{8}$/); assert.match(A.counterId('c', 1e12), /^c_\d{8}$/); });
test('one batch: the record and the counter bump (count +1, last = the record id, merge)', async () => {
  const { log, counted } = mk(); await counted('v', 'visits', 'sid_view_home', { a: 1 });
  assert.equal(log.batches.length, 1); const [rec, cnt] = log.batches[0];
  assert.deepEqual(rec, { r: { db: 'DB', c: 'visits', i: 'sid_view_home' }, d: { a: 1 }, o: undefined });
  assert.deepEqual(cnt, { r: { db: 'DB', c: 'anonCounters', i: 'v_20261107' }, d: { count: { inc: 1 }, last: 'sid_view_home' }, o: { merge: true } }); });
test('chat questions use the c_ counter', async () => { const { log, counted } = mk(); await counted('c', 'chatUnanswered', 'abc_x1', { q: 1 }); assert.equal(log.batches[0][1].r.i, 'c_20261107'); assert.equal(log.batches[0][1].d.last, 'abc_x1'); });
test('a collision (permission-denied) is retried after a short wait; success on the 2nd try writes twice', async () => {
  const { log, counted } = mk({ fail: [denied()] }); await counted('v', 'visits', 'i', {}); assert.equal(log.batches.length, 2); assert.deepEqual(log.sleeps, [375]); });
test('after 3 tries the refusal is thrown (budget used up): exactly 3 batches and 2 waits', async () => {
  const { log, counted } = mk({ fail: [denied(), denied(), denied()] }); await assert.rejects(counted('v', 'visits', 'i', {}), e => e.code === 'permission-denied'); assert.equal(log.batches.length, 3); assert.equal(log.sleeps.length, 2); });
test('other errors (network, unavailable) are NOT retried', async () => {
  for (const code of ['unavailable', 'deadline-exceeded', 'failed-precondition', undefined]) { const { log, counted } = mk({ fail: [Object.assign(new Error('n'), { code })] }); await assert.rejects(counted('v', 'visits', 'i', {})); assert.equal(log.batches.length, 1); } });
test('the day key is taken at each try (a retry after midnight UTC uses the new day)', async () => {
  let t = Date.UTC(2026, 10, 7, 23, 59, 59); const { log, counted } = mk({ fail: [denied()], env: { now: () => t, sleep: async () => { t = Date.UTC(2026, 10, 8, 0, 0, 1); } } });
  await counted('v', 'visits', 'i', {}); assert.deepEqual(log.batches.map(b => b[1].r.i), ['v_20261107', 'v_20261108']); });
test('an unknown kind is refused before any write', async () => { const { log, counted } = mk(); await assert.rejects(counted('x', 'visits', 'i', {})); assert.equal(log.batches.length, 0); });
test('owner-panel.js and the page use the helper: no plain setDoc for visits or chat questions, no direct booking write, helper loaded before the module', () => {
  const o = fs.readFileSync(new URL('./owner-panel.js', import.meta.url), 'utf8'), h = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!/setDoc\(doc\(rdb,'visits'/.test(o) && !/setDoc\(doc\(rdb,'chatUnanswered'/.test(o)); assert.match(o, /counted\('v','visits'/); assert.match(o, /counted\('c','chatUnanswered'/); assert.match(o, /counted\('v','visits',id,/);
  assert.ok(!/window\.submitMeeting\s*=/.test(o) && !/addDoc\(collection\(rdb,'meetingRequests'\)/.test(o));
  assert.ok(h.indexOf('scripts/core-anon.js') > 0 && h.indexOf('scripts/core-anon.js') < h.indexOf('scripts/owner-panel.js')); });
test('the old direct booking path is gone from the page code', () => {
  const m = fs.readFileSync(new URL('./meeting-form.js', import.meta.url), 'utf8'), g = fs.readFileSync(new URL('./form-guard.js', import.meta.url), 'utf8');
  assert.ok(!/submitMeeting/.test(m) && !/tokenRequired/.test(m) && !/useVerifyFlag/.test(g) && !/Sending…/.test(m)); assert.match(m, /FG\.submit\(d,gx\.hooks,dec\.status\)`?/); });
test('the rules files have no tokenRequired switch and both carry the budget counters and the date window', () => {
  for (const f of ['../firestore.rules', '../firestore.rules.strict']) { const r = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/tokenRequired\(\)/.test(r)); for (const k of ['match /anonCounters/{k}', "getAfter(anonDoc('v_' + today())).data.last == id", "getAfter(anonDoc('c_' + today())).data.last == id", 'dateWindowOk(request.resource.data.date)', "underAnon('visitCap', 1500", "underAnon('chatCap', 300"]) assert.ok(r.includes(k), f + ' ' + k); } });
