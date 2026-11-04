// CodeFlow 4.5.0 W1 - REAL Firestore rules engine tests (Firebase Local Emulator Suite) for WorkTrack.
// Run by GitHub Actions (.github/workflows/rules-emulator.yml) or locally:  cd rules-tests/emulator && npm install && npm test   (needs Java 17+)
// Uses its own demo project name so it can run beside registry.test.mjs. It never touches your real Firebase project.
// STATUS WHEN THIS FILE WAS BUILT: written but NOT executed (the build environment cannot download the emulator).
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

const core = createRequire(import.meta.url)('../../scripts/core-worktrack.js');
const OWNER_UID = '3p2YvH4NSVYAAfA0E6HC2kkyc5F3';
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-worktrack', firestore: { rules: readFileSync('../../firestore.rules.strict', 'utf8') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const google = (uid, extra = {}) => env.authenticatedContext(uid, { email: 'x@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' }, ...extra }).firestore();
const owner = () => google(OWNER_UID);
const SID = 'sess0000000000000001', SID2 = 'sess0000000000000002';
const seed = async (path, data) => env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), ...path.split('/')), data); });
const seedState = (o = {}) => seed('workState/main', { state: 'NOT_STARTED', sid: '', n: 0, fb: false, lu: false, lb: false, lastEid: '', rev: 1, updatedAt: new Date(), ...o });
const stateDoc = async (db) => (await getDoc(doc(db, 'workState', 'main'))).data();
/* the batch the page writes for one punch (built by the page's own plan(), so page and rules are compared) */
function punchBatch(db, cur, type, o = {}) {
  const p = core.plan(cur, type, { sid: SID2, reason: 'Forgot to clock out', ...o }); assert.ok(p.ok, 'plan refused: ' + p.reason);
  const b = writeBatch(db);
  b.set(doc(db, 'workEvents', p.eid), { ...p.event, at: serverTimestamp(), by: OWNER_UID });
  b.set(doc(db, 'workState', 'main'), { ...p.state, updatedAt: serverTimestamp() });
  if (p.newSession) b.set(doc(db, 'workSessions', p.sid), { tz: 'Asia/Manila', date: '2026-11-04', startedAt: serverTimestamp(), by: OWNER_UID });
  return { b, p };
}
const cur = async db => { const d = await stateDoc(db); return { state: d.state, sid: d.sid, n: d.n, fb: d.fb, lu: d.lu, lb: d.lb, lastEid: d.lastEid, rev: d.rev }; };
async function punch(db, type, o) { const { b, p } = punchBatch(db, await cur(db), type, o); await b.commit(); return p; }

test('the state record can be created once in its starting form, and only that form', async () => {
  const db = owner(), ref = doc(db, 'workState', 'main'), init = { state: 'NOT_STARTED', sid: '', n: 0, fb: false, lu: false, lb: false, lastEid: '', rev: 1, updatedAt: serverTimestamp() };
  await assertFails(setDoc(ref, { ...init, state: 'WORKING' })); await assertFails(setDoc(ref, { ...init, rev: 2 })); await assertFails(setDoc(ref, { ...init, name: 'Ann' }));
  await assertFails(setDoc(doc(db, 'workState', 'other'), init));
  await assertSucceeds(setDoc(ref, init));
});
test('a full day of eight punches is accepted, then a new day starts a new session', async () => {
  const db = owner(); await seedState();
  for (const t of ['CLOCK_IN', 'FIRST_BREAK_OUT', 'FIRST_BREAK_IN', 'LUNCH_OUT', 'LUNCH_IN', 'LAST_BREAK_OUT', 'LAST_BREAK_IN', 'CLOCK_OUT']) await assertSucceeds(punch(db, t, { sid: SID }));
  const s = await stateDoc(db); assert.equal(s.state, 'NOT_STARTED'); assert.equal(s.n, 8); assert.equal(s.rev, 9);
  await assertSucceeds(punch(db, 'CLOCK_IN', { sid: SID2 })); assert.equal((await stateDoc(db)).n, 1);
  const ev = await getDocs(collection(db, 'workEvents')); assert.equal(ev.size, 9);
});
test('skipping breaks leaves no gap in the counter', async () => {
  const db = owner(); await seedState();
  for (const t of ['CLOCK_IN', 'LUNCH_OUT', 'LUNCH_IN', 'CLOCK_OUT']) await assertSucceeds(punch(db, t, { sid: SID }));
  assert.equal((await stateDoc(db)).n, 4); assert.ok((await getDoc(doc(db, 'workEvents', SID + '__4'))).exists());
});
test('every punch from every state: the real engine accepts exactly what the page state machine allows', async () => {
  const gen = JSON.parse(execFileSync('node', ['../attack/gen_worktrack_cases.mjs', '../..'], { encoding: 'utf8' }));
  assert.equal(gen.planMismatch, 0); assert.ok(gen.cases.length >= 100);
  const db = owner(), bad = [];
  for (const c of gen.cases) {
    await env.clearFirestore(); await seedState({ ...c.before });
    const b = writeBatch(db);
    b.set(doc(db, 'workEvents', c.event.sid + '__' + c.event.n), { ...c.event, at: serverTimestamp(), by: OWNER_UID });
    b.set(doc(db, 'workState', 'main'), { ...c.after, updatedAt: serverTimestamp() });
    if (c.newSession) b.set(doc(db, 'workSessions', c.event.sid), { tz: 'Asia/Manila', date: '2026-11-04', startedAt: serverTimestamp(), by: OWNER_UID });
    let ok = true; try { await b.commit(); } catch (e) { ok = false; }
    if (ok !== c.js) bad.push(c.name + ' (engine ' + (ok ? 'accepted' : 'refused') + ')');
  }
  assert.deepEqual(bad, []);
});
test('two clock-ins at the same moment: exactly one wins', async () => {
  await seedState(); const a = owner(), b = owner();
  const r = await Promise.allSettled([punchBatch(a, core.initialState(), 'CLOCK_IN', { sid: SID }).b.commit(), punchBatch(b, core.initialState(), 'CLOCK_IN', { sid: SID2 }).b.commit()]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
  const s = await stateDoc(owner()); assert.equal(s.state, 'WORKING'); assert.equal(s.n, 1);
});
test('two tabs doing the same step at the same moment: exactly one wins', async () => {
  const db = owner(); await seedState(); await punch(db, 'CLOCK_IN', { sid: SID }); const before = await cur(db);
  const r = await Promise.allSettled([punchBatch(owner(), before, 'LUNCH_OUT').b.commit(), punchBatch(owner(), before, 'LUNCH_OUT').b.commit()]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1); assert.equal((await stateDoc(db)).n, 2);
});
test('two tabs doing DIFFERENT steps from the same position: exactly one wins', async () => {
  const db = owner(); await seedState(); await punch(db, 'CLOCK_IN', { sid: SID }); const before = await cur(db);
  const r = await Promise.allSettled([punchBatch(owner(), before, 'LUNCH_OUT').b.commit(), punchBatch(owner(), before, 'FIRST_BREAK_OUT').b.commit(), punchBatch(owner(), before, 'CLOCK_OUT').b.commit()]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1); assert.equal((await stateDoc(db)).n, 2);
});
test('a tab holding an old copy of the position is refused', async () => {
  const db = owner(); await seedState(); await punch(db, 'CLOCK_IN', { sid: SID }); const old = await cur(db);
  await punch(db, 'LUNCH_OUT'); await assertFails(punchBatch(db, old, 'FIRST_BREAK_OUT').b.commit());
});
test('a break cannot be used twice, and clock out is refused while a break is open', async () => {
  const db = owner(); await seedState(); await punch(db, 'CLOCK_IN', { sid: SID }); await punch(db, 'LUNCH_OUT');
  const open = await cur(db); const forged = punchBatch(db, { ...open, state: 'WORKING' }, 'CLOCK_OUT').b;   // pretend we were not on lunch
  await assertFails(forged.commit());
  await punch(db, 'LUNCH_IN'); const after = await cur(db);
  await assertFails(punchBatch(db, { ...after, lu: false }, 'LUNCH_OUT').b.commit());                           // pretend lunch was unused
});
test('close as incomplete needs a reason of 3 to 200 characters', async () => {
  const db = owner(); await seedState(); await punch(db, 'CLOCK_IN', { sid: SID }); const c = await cur(db);
  for (const reason of ['', 'ab', 'r'.repeat(201)]) {
    const b = writeBatch(db), n = c.n + 1, eid = SID + '__' + n;
    b.set(doc(db, 'workEvents', eid), { sid: SID, n, type: 'CLOSE_INCOMPLETE', reason, at: serverTimestamp(), by: OWNER_UID });
    b.set(doc(db, 'workState', 'main'), { state: 'NOT_STARTED', sid: SID, n, fb: c.fb, lu: c.lu, lb: c.lb, lastEid: eid, rev: c.rev + 1, updatedAt: serverTimestamp() });
    await assertFails(b.commit());
  }
  await assertSucceeds(punch(db, 'CLOSE_INCOMPLETE', { reason: 'Forgot to clock out' })); assert.equal((await stateDoc(db)).state, 'NOT_STARTED');
});
test('time must come from the server and the actor must be the owner', async () => {
  const db = owner(); await seedState(); const p = core.plan(core.initialState(), 'CLOCK_IN', { sid: SID });
  const mk = (ev, ses) => { const b = writeBatch(db); b.set(doc(db, 'workEvents', p.eid), ev); b.set(doc(db, 'workState', 'main'), { ...p.state, rev: 2, updatedAt: serverTimestamp() }); b.set(doc(db, 'workSessions', SID), ses); return b; };
  const S = { tz: 'Asia/Manila', date: '2026-11-04', startedAt: serverTimestamp(), by: OWNER_UID };
  await assertFails(mk({ ...p.event, at: new Date(), by: OWNER_UID }, S).commit());
  await assertFails(mk({ ...p.event, at: serverTimestamp(), by: 'someone-else' }, S).commit());
  await assertFails(mk({ ...p.event, at: serverTimestamp(), by: OWNER_UID }, { ...S, startedAt: new Date() }).commit());
  await assertFails(mk({ ...p.event, at: serverTimestamp(), by: OWNER_UID }, { ...S, client: 'Ann' }).commit());
  await assertFails(mk({ ...p.event, at: serverTimestamp(), by: OWNER_UID, name: 'Ann' }, S).commit());
  await assertSucceeds(mk({ ...p.event, at: serverTimestamp(), by: OWNER_UID }, S).commit());
});
test('events and sessions can never be edited or deleted, and the state record cannot be deleted', async () => {
  const db = owner(); await seedState(); await punch(db, 'CLOCK_IN', { sid: SID });
  const ev = doc(db, 'workEvents', SID + '__1'), se = doc(db, 'workSessions', SID);
  await assertFails(updateDoc(ev, { reason: 'x' })); await assertFails(deleteDoc(ev)); await assertFails(updateDoc(se, { tz: 'UTC' })); await assertFails(deleteDoc(se)); await assertFails(deleteDoc(doc(db, 'workState', 'main')));
  await assertFails(setDoc(ev, { sid: SID, n: 1, type: 'CLOCK_IN', reason: '', at: serverTimestamp(), by: OWNER_UID }));
});
test('the state cannot be moved without an event, or to a made-up position', async () => {
  const db = owner(); await seedState(); await punch(db, 'CLOCK_IN', { sid: SID }); const c = await cur(db);
  await assertFails(updateDoc(doc(db, 'workState', 'main'), { ...c, state: 'LUNCH', lu: true, n: c.n + 1, rev: c.rev + 1, lastEid: SID + '__2', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'workState', 'main'), { ...c, rev: c.rev + 1, updatedAt: serverTimestamp() }));
});
test('visitors and other accounts have no access at all', async () => {
  await seedState(); await punch(owner(), 'CLOCK_IN', { sid: SID });
  for (const db of [env.unauthenticatedContext().firestore(), google('stranger'), env.authenticatedContext(OWNER_UID, { email_verified: false, firebase: { sign_in_provider: 'google.com' } }).firestore()]) {
    await assertFails(getDoc(doc(db, 'workState', 'main'))); await assertFails(getDoc(doc(db, 'workEvents', SID + '__1'))); await assertFails(getDocs(collection(db, 'workEvents'))); await assertFails(getDocs(collection(db, 'workSessions')));
    await assertFails(punchBatch(db, await cur(owner()), 'LUNCH_OUT').b.commit());
  }
});
test('owner can read and list WorkTrack records, including the query the page uses', async () => {
  const db = owner(); await seedState(); await punch(db, 'CLOCK_IN', { sid: SID });
  await assertSucceeds(getDoc(doc(db, 'workState', 'main'))); await assertSucceeds(getDocs(collection(db, 'workEvents'))); await assertSucceeds(getDoc(doc(db, 'workSessions', SID)));
});
