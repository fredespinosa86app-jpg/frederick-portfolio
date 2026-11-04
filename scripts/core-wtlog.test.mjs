import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module'; import { webcrypto } from 'node:crypto';
const require = createRequire(import.meta.url); const L = require('./core-wtlog.js'), W = require('./core-worktrack.js');
const sha = async s => Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(s))).toString('hex');
const H = 3600000, T0 = 1_800_000_000_000, SID = 'sess0000000000000001';
const ev = (n, type, atMs) => ({ n, type, atMs, reason: '' });
const DAY = [ev(1, 'CLOCK_IN', T0), ev(2, 'LUNCH_OUT', T0 + 4 * H), ev(3, 'LUNCH_IN', T0 + 5 * H), ev(4, 'CLOCK_OUT', T0 + 9 * H)];
const NOW = T0 + 10 * H;
const S = (o = {}) => Object.assign({ sid: SID, events: DAY, corrections: [], assign: [{ clientId: 'CL-001', status: 'active' }], closeAtMs: T0 + 9 * H, closeN: 4, closeEid: SID + '__4', closed: true }, o);
const C = (o = {}) => Object.assign({ kind: 'TIME', n: 4, atMs: T0 + 9 * H + 600000, reason: 'Forgot to clock out on time' }, o);

test('canonical text: key order and Date/Timestamp do not matter', () => {
  const a = L.canonRecord('workEvents/x', { b: 1, a: new Date(5), c: { z: 1, y: [1, 2] } });
  const b = L.canonRecord('workEvents/x', { c: { y: [1, 2], z: 1 }, a: { toMillis: () => 5 }, b: 1 });
  assert.equal(a, b);
});
async function chainOf(recs) {                       // genesis + two record seals
  const legacy = ['workEvents/a1', 'workSessions/s1'].map(p => ({ path: p, data: recs[p] }));
  const g = await L.makeSeal(sha, { n: 1, prev: L.ZERO, kind: 'genesis', recs: legacy, upto: 100 });
  const s2 = await L.makeSeal(sha, { n: 2, prev: g.hash, kind: 'records', recs: [{ path: 'workEvents/e2', data: recs['workEvents/e2'] }] });
  const s3 = await L.makeSeal(sha, { n: 3, prev: s2.hash, kind: 'records', recs: [{ path: 'workCorrections/c3', data: recs['workCorrections/c3'] }, { path: 'workAssignAudit/u3', data: recs['workAssignAudit/u3'] }] });
  return { seals: [g, s2, s3].map((s, i) => Object.assign({ id: s.hash, atMs: 1000 + i }, s)), chain: { cn: 3, head: s3.hash } };
}
const RECS = () => ({ 'workEvents/a1': { n: 1, at: 50 }, 'workSessions/s1': { startedAt: 60 }, 'workEvents/e2': { n: 2, at: 500, type: 'LUNCH_OUT' }, 'workCorrections/c3': { kind: 'TIME', createdAt: 600 }, 'workAssignAudit/u3': { action: 'add', createdAt: 610 } });
test('verify: an untouched chain is ok', async () => { const c = await chainOf(RECS()); const v = await L.verify({ ...c, records: RECS(), nowMs: 700 }, sha); assert.equal(v.status, 'ok'); assert.equal(v.sealsChecked, 3); assert.deepEqual(v.problems, []); });
test('verify: no chain and no seals is "none"', async () => { assert.equal((await L.verify({ chain: null, seals: [], records: RECS() }, sha)).status, 'none'); });
test('verify: changing a covered record is found (time, field)', async () => {
  const c = await chainOf(RECS());
  for (const [p, k, val] of [['workEvents/e2', 'at', 501], ['workEvents/e2', 'type', 'LUNCH_IN'], ['workCorrections/c3', 'kind', 'ADD'], ['workAssignAudit/u3', 'action', 'remove']]) {
    const r = RECS(); r[p][k] = val; const v = await L.verify({ ...c, records: r, nowMs: 700 }, sha);
    assert.equal(v.status, 'broken', p + k); assert.match(v.problems[0], /Seal [23]/);
  }
});
test('verify: a changed or removed legacy record breaks the starting point', async () => {
  const c = await chainOf(RECS()); const r = RECS(); r['workEvents/a1'].at = 51;
  assert.equal((await L.verify({ ...c, records: r, nowMs: 700 }, sha)).status, 'broken');
  const r2 = RECS(); delete r2['workSessions/s1']; assert.match((await L.verify({ ...c, records: r2, nowMs: 700 }, sha)).problems[0], /Seal 1/);
  const r3 = RECS(); r3['workEvents/back'] = { n: 9, at: 70 }; assert.match((await L.verify({ ...c, records: r3, nowMs: 700 }, sha)).problems[0], /Seal 1/);       // back-dated extra record
});
test('verify: a removed record, removed seal, removed newest seal, edited seal and wrong head are found', async () => {
  const c = await chainOf(RECS());
  const r = RECS(); delete r['workEvents/e2']; assert.match((await L.verify({ ...c, records: r, nowMs: 700 }, sha)).problems[0], /no longer exists/);
  assert.match((await L.verify({ chain: c.chain, seals: [c.seals[0], c.seals[2]], records: RECS(), nowMs: 700 }, sha)).problems[0], /out of sequence/);
  const nw = await L.verify({ chain: c.chain, seals: c.seals.slice(0, 2), records: RECS(), nowMs: 700 }, sha); assert.equal(nw.status, 'broken'); assert.match(nw.problems[0], /head/);
  const e = c.seals.map(s => ({ ...s })); e[1].ids = ['workEvents/a1']; assert.equal((await L.verify({ chain: c.chain, seals: e, records: RECS(), nowMs: 700 }, sha)).status, 'broken');
  const e2 = c.seals.map(s => ({ ...s })); e2[1].prev = 'f'.repeat(64); assert.match((await L.verify({ chain: c.chain, seals: e2, records: RECS(), nowMs: 700 }, sha)).problems[0], /does not follow/);
  assert.equal((await L.verify({ chain: { cn: 3, head: 'a'.repeat(64) }, seals: c.seals, records: RECS(), nowMs: 700 }, sha)).status, 'broken');
  assert.match((await L.verify({ chain: null, seals: c.seals, records: RECS(), nowMs: 700 }, sha)).problems[0], /head record is missing/);
});
test('verify: records written without a seal are reported (old = problem, very recent = waiting note)', async () => {
  const c = await chainOf(RECS()); const r = RECS(); r['workEvents/sneaky'] = { n: 5, at: 900 };
  assert.equal((await L.verify({ ...c, records: r, nowMs: 900 + 60000 }, sha)).status, 'ok');
  assert.match((await L.verify({ ...c, records: r, nowMs: 900 + 60000 }, sha)).notes.join(' '), /waiting to be sealed/);
  const old = await L.verify({ ...c, records: r, nowMs: 900 + 11 * 60000 }, sha); assert.equal(old.status, 'broken'); assert.match(old.problems[0], /not covered/);
});
test('witness: write, parse, compare (deleted newest seal and altered seal are found)', async () => {
  const c = await chainOf(RECS()); const txt = L.witnessText(c.seals); const saved = L.parseWitness(txt); assert.equal(saved.length, 3);
  assert.ok(L.compareWitness(saved, c.seals).ok);
  assert.equal(L.compareWitness(saved, c.seals.slice(0, 2)).ok, false);
  const alt = c.seals.map(s => ({ ...s })); alt[2].hash = 'e'.repeat(64); assert.match(L.compareWitness(saved, alt).problems[0], /differs/);
  assert.equal(L.compareWitness(L.parseWitness('nothing here'), c.seals).ok, false);
  assert.equal(L.compareWitness(saved.slice(0, 1), c.seals).newer, 2);
  assert.equal(L.parseWitness(L.witnessLine(c.seals[1]))[0].n, 2);
});
test('corrections: window is 24 hours from the closing punch', () => {
  assert.ok(L.windowOpen(T0 + 9 * H, T0 + 9 * H + 23.9 * H)); assert.ok(!L.windowOpen(T0 + 9 * H, T0 + 9 * H + 24 * H)); assert.ok(!L.windowOpen(0, T0));
  assert.equal(L.correctionPlan(S(), C(), { nowMs: NOW + 24 * H }).ok, false);
  assert.match(L.correctionPlan(S(), C(), { nowMs: NOW + 24 * H }).reason, /24-hour/);
});
test('corrections: change a time, add a missed break, clients', () => {
  const t = L.correctionPlan(S(), C(), { nowMs: NOW }); assert.ok(t.ok); assert.equal(t.doc.n, 4); assert.equal(t.doc.atMs, T0 + 9 * H + 600000); assert.equal(t.doc.at2Ms, null);
  const a = L.correctionPlan(S(), { kind: 'ADD', type: 'FIRST_BREAK', atMs: T0 + 2 * H, at2Ms: T0 + 2 * H + 900000, reason: 'Missed to punch the break' }, { nowMs: NOW }); assert.ok(a.ok); assert.equal(a.doc.type, 'FIRST_BREAK');
  const ci = L.correctionPlan(S(), { kind: 'CLIENT_ADD', clientId: 'CL-002', reason: 'Worked for them too' }, { nowMs: NOW, registryStatus: 'active' }); assert.ok(ci.ok); assert.equal(ci.doc.clientId, 'CL-002');
  const cr = L.correctionPlan(S(), { kind: 'CLIENT_REMOVE', clientId: 'CL-001', reason: 'Added by mistake' }, { nowMs: NOW }); assert.ok(cr.ok);
});
test('corrections: refusals', () => {
  const no = (c, o, s) => { const r = L.correctionPlan(s || S(), c, Object.assign({ nowMs: NOW }, o)); assert.equal(r.ok, false, JSON.stringify(c)); return r.reason; };
  assert.match(no(C({ reason: 'ab' })), /reason/); assert.match(no(C({ reason: 'x'.repeat(201) })), /reason/);
  assert.match(no(C({ atMs: NOW + 1 })), /future/); assert.match(no(C({ atMs: T0 + 9 * H })), /already the time/); assert.match(no(C({ n: 9 })), /Choose which punch/);
  assert.match(no(C({ n: 2, atMs: T0 + 6 * H })), /order of the day/);                     // lunch out after lunch in
  assert.match(no(C({ n: 1, atMs: T0 + 4.5 * H })), /order of the day/);                   // clock in after the lunch out
  assert.match(no(C({ n: 4, atMs: T0 + 4.5 * H })), /order of the day/);                   // clock out in the middle of lunch
  assert.match(no(C({ kind: 'NOPE' })), /Unknown/); assert.match(no(C({ atMs: NaN })), /Choose the corrected/);
  assert.match(no({ kind: 'ADD', type: 'LUNCH', atMs: T0 + 1 * H, at2Ms: T0 + 2 * H, reason: 'Missed lunch punch' }), /order of the day/);     // lunch already used
  assert.match(no({ kind: 'ADD', type: 'FIRST_BREAK', atMs: T0 + 2 * H, at2Ms: T0 + 2 * H, reason: 'Missed break punch' }), /end after/);
  assert.match(no({ kind: 'ADD', type: 'DINNER', atMs: T0 + 2 * H, at2Ms: T0 + 3 * H, reason: 'Missed break punch' }), /missed break/);
  assert.match(no({ kind: 'ADD', type: 'LAST_BREAK', atMs: T0 + 8 * H, at2Ms: T0 + 10 * H, reason: 'Missed break punch' }), /order of the day|future/);
  assert.match(no({ kind: 'CLIENT_ADD', clientId: 'CL-001', reason: 'again please' }, { registryStatus: 'active' }), /already on/);
  assert.match(no({ kind: 'CLIENT_ADD', clientId: 'CL-002', reason: 'archived one' }, { registryStatus: 'archived' }), /archived/);
  assert.match(no({ kind: 'CLIENT_ADD', clientId: 'cl-2', reason: 'bad id here' }, { registryStatus: 'active' }), /valid Client/);
  assert.match(no({ kind: 'CLIENT_REMOVE', clientId: 'CL-009', reason: 'not on it' }), /not on this session/);
  assert.match(no(C(), {}, S({ closed: false })), /closed session/);
  assert.match(no(C(), {}, S({ corrections: Array.from({ length: 20 }, (_, i) => ({ id: 'c' + i, kind: 'CLIENT_ADD', clientId: 'X', createdMs: i })) })), /at most 20/);
  const full = Array.from({ length: 10 }, (_, i) => ({ clientId: 'CL-0' + String(i).padStart(2, '0'), status: 'active' }));
  assert.match(no({ kind: 'CLIENT_ADD', clientId: 'CL-099', reason: 'one too many' }, { registryStatus: 'active' }, S({ assign: full })), /at most 10/);
});
test('effective: corrections are applied in order, originals untouched, hours counted once', () => {
  const orig = DAY.map(e => ({ ...e }));
  const r = L.effective(DAY, [{ id: 'b', kind: 'TIME', n: 4, atMs: T0 + 9 * H + 1800000, createdMs: 2 }, { id: 'a', kind: 'TIME', n: 4, atMs: T0 + 9 * H + 600000, createdMs: 1 }]);
  assert.equal(r.derived.valid, true); assert.equal(r.derived.grossMs, 9 * H + 1800000);                    // the later correction wins
  assert.deepEqual(DAY, orig);
  const add = L.effective(DAY, [{ id: 'x', kind: 'ADD', type: 'FIRST_BREAK', atMs: T0 + 2 * H, at2Ms: T0 + 2 * H + 900000, createdMs: 1 }]);
  assert.equal(add.derived.valid, true); assert.equal(add.derived.breaks.length, 2); assert.equal(add.derived.netMs, 9 * H - 3600000 - 900000); assert.ok(add.events.some(e => e.added));
  assert.deepEqual(L.effectiveClients([{ clientId: 'CL-001', status: 'active' }, { clientId: 'CL-002', status: 'removed' }], [{ id: 'q', kind: 'CLIENT_ADD', clientId: 'CL-003', createdMs: 1 }, { id: 'r', kind: 'CLIENT_REMOVE', clientId: 'CL-001', createdMs: 2 }]), ['CL-003']);
  assert.equal(L.describe({ kind: 'CLIENT_ADD', clientId: 'CL-003' }, x => x, x => x), 'Added CL-003');
});
