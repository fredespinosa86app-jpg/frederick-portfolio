// CodeFlow 4.5.0 W2 - REAL Firestore rules engine tests (Firebase Local Emulator Suite) for client assignment on a work session.
// Run by GitHub Actions (.github/workflows/rules-emulator.yml) or locally:  cd rules-tests/emulator && npm install && npm test   (needs Java 17+)
// Own demo project name so it can run beside the other test files. It never touches your real Firebase project.
// STATUS WHEN THIS FILE WAS BUILT: written but NOT executed (the build environment cannot download the emulator).
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

const core = createRequire(import.meta.url)('../../scripts/core-worktrack.js');
const OWNER_UID = '3p2YvH4NSVYAAfA0E6HC2kkyc5F3';
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-assign', firestore: { rules: readFileSync('../../firestore.rules.strict', 'utf8') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const google = (uid, extra = {}) => env.authenticatedContext(uid, { email: 'x@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' }, ...extra }).firestore();
const owner = () => google(OWNER_UID);
const SID = 'sess0000000000000001', SID2 = 'sess0000000000000002';
const seed = (path, data) => env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), ...path.split('/')), data); });
const seedClient = (id, status = 'active') => seed('clientRegistry/' + id, { status, notes: '', createdAt: new Date(), updatedAt: new Date(), rev: 1, lastAudit: 'a'.repeat(16) });
const seedState = (o = {}) => seed('workState/main', { state: 'WORKING', sid: SID, n: 1, fb: false, lu: false, lb: false, lastEid: SID + '__1', rev: 2, updatedAt: new Date(), ...o });
const recs = async db => (await getDocs(collection(db, 'workAssign'))).docs.map(d => d.data());
const aidN = () => core_aid();
let k = 0; const core_aid = () => ('t' + (++k) + 'x'.repeat(20)).slice(0, 24);
/* the batch the page writes for one change, built by the page's own assignPlan() */
async function change(db, action, cid, o = {}) {
  const records = await recs(db), reg = await getDoc(doc(db, 'clientRegistry', cid));
  const aid = aidN(), p = core.assignPlan(records.filter(r => r.sid === (o.sid || SID)).map(r => ({ clientId: r.clientId, status: r.status, rev: r.rev, addedAt: r.addedAt })), o.sid || SID, cid, action, { aid, reason: o.reason || '', registryStatus: reg.exists() ? reg.data().status : '' });
  assert.ok(p.ok, 'plan refused: ' + p.reason);
  const b = writeBatch(db), ref = doc(db, 'workAssign', p.id);
  b.set(ref, p.kind === 'create' ? { ...p.doc, addedAt: serverTimestamp(), updatedAt: serverTimestamp() } : { ...p.doc, updatedAt: serverTimestamp() });
  b.set(doc(db, 'workAssignAudit', aid), { ...p.audit, actor: OWNER_UID, createdAt: serverTimestamp() });
  await b.commit(); return p;
}
const setup = async () => { await seedState(); await seedClient('CL-001'); await seedClient('CL-002'); await seedClient('CL-003'); };

test('add, remove and add back a client on the open session (each change is one batch with its audit entry)', async () => {
  const db = owner(); await setup();
  await assertSucceeds(change(db, 'add', 'CL-001'));
  await assertSucceeds(change(db, 'remove', 'CL-001', { reason: 'wrong client' }));
  await assertSucceeds(change(db, 'add', 'CL-001'));
  const r = (await getDoc(doc(db, 'workAssign', SID + '__CL-001'))).data(); assert.equal(r.status, 'active'); assert.equal(r.rev, 3);
  assert.equal((await getDocs(collection(db, 'workAssignAudit'))).size, 3);
});
test('three clients on one session are three records and no hours anywhere', async () => {
  const db = owner(); await setup();
  for (const c of ['CL-001', 'CL-002', 'CL-003']) await assertSucceeds(change(db, 'add', c));
  const r = await recs(db); assert.equal(r.length, 3); assert.ok(r.every(x => !('hours' in x) && !('minutes' in x)));
});
test('the same client added twice at the same moment: exactly one wins', async () => {
  await setup();
  const mk = () => { const db = owner(), aid = aidN(), b = writeBatch(db);
    b.set(doc(db, 'workAssign', SID + '__CL-001'), { sid: SID, clientId: 'CL-001', status: 'active', rev: 1, addedAt: serverTimestamp(), updatedAt: serverTimestamp(), lastAudit: aid });
    b.set(doc(db, 'workAssignAudit', aid), { sid: SID, clientId: 'CL-001', action: 'add', reason: '', rev: 1, actor: OWNER_UID, createdAt: serverTimestamp() }); return b; };
  const r = await Promise.allSettled([mk().commit(), mk().commit(), mk().commit()]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1); assert.equal((await recs(owner())).length, 1);
});
test('two tabs removing the same client at the same moment: exactly one wins', async () => {
  const db = owner(); await setup(); await change(db, 'add', 'CL-001');
  const before = (await recs(db)).map(r => ({ clientId: r.clientId, status: r.status, rev: r.rev, addedAt: r.addedAt }));
  const mk = () => { const d = owner(), aid = aidN(), p = core.assignPlan(before, SID, 'CL-001', 'remove', { aid }), b = writeBatch(d);
    b.set(doc(d, 'workAssign', p.id), { ...p.doc, updatedAt: serverTimestamp() }); b.set(doc(d, 'workAssignAudit', aid), { ...p.audit, actor: OWNER_UID, createdAt: serverTimestamp() }); return b; };
  const r = await Promise.allSettled([mk().commit(), mk().commit()]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
});
test('an add racing a remove on the same client: the loser is refused and the result is consistent', async () => {
  const db = owner(); await setup(); await change(db, 'add', 'CL-001'); await change(db, 'remove', 'CL-001');
  const before = (await recs(db)).map(r => ({ clientId: r.clientId, status: r.status, rev: r.rev, addedAt: r.addedAt }));   // removed, rev 2
  const mk = (action) => { const d = owner(), aid = aidN(), p = core.assignPlan(before, SID, 'CL-001', action, { aid, registryStatus: 'active' }); if (!p.ok) return null; const b = writeBatch(d);
    b.set(doc(d, 'workAssign', p.id), { ...p.doc, updatedAt: serverTimestamp() }); b.set(doc(d, 'workAssignAudit', aid), { ...p.audit, actor: OWNER_UID, createdAt: serverTimestamp() }); return b; };
  const forged = (() => { const d = owner(), aid = aidN(), b = writeBatch(d);    // a stale tab still thinks the client is active and removes it
    b.set(doc(d, 'workAssign', SID + '__CL-001'), { sid: SID, clientId: 'CL-001', status: 'removed', rev: 2, addedAt: before[0].addedAt, updatedAt: serverTimestamp(), lastAudit: aid });
    b.set(doc(d, 'workAssignAudit', aid), { sid: SID, clientId: 'CL-001', action: 'remove', reason: '', rev: 2, actor: OWNER_UID, createdAt: serverTimestamp() }); return b; })();
  const r = await Promise.allSettled([mk('add').commit(), forged.commit()]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
});
test('an archived or unknown client cannot be added; an archived one already on the session can be removed', async () => {
  const db = owner(); await setup(); await change(db, 'add', 'CL-001');
  await seed('clientRegistry/CL-001', { status: 'archived', notes: '', createdAt: new Date(), updatedAt: new Date(), rev: 2, lastAudit: 'b'.repeat(16) });
  await seedClient('CL-002', 'archived');
  const aid = aidN(), b = writeBatch(db);
  b.set(doc(db, 'workAssign', SID + '__CL-002'), { sid: SID, clientId: 'CL-002', status: 'active', rev: 1, addedAt: serverTimestamp(), updatedAt: serverTimestamp(), lastAudit: aid });
  b.set(doc(db, 'workAssignAudit', aid), { sid: SID, clientId: 'CL-002', action: 'add', reason: '', rev: 1, actor: OWNER_UID, createdAt: serverTimestamp() });
  await assertFails(b.commit());
  const aid2 = aidN(), b2 = writeBatch(db);
  b2.set(doc(db, 'workAssign', SID + '__CL-009'), { sid: SID, clientId: 'CL-009', status: 'active', rev: 1, addedAt: serverTimestamp(), updatedAt: serverTimestamp(), lastAudit: aid2 });
  b2.set(doc(db, 'workAssignAudit', aid2), { sid: SID, clientId: 'CL-009', action: 'add', reason: '', rev: 1, actor: OWNER_UID, createdAt: serverTimestamp() });
  await assertFails(b2.commit());
  await assertSucceeds(change(db, 'remove', 'CL-001'));
});
test('assignments cannot change after the session is closed or for a different session', async () => {
  const db = owner(); await setup(); await change(db, 'add', 'CL-001');
  await seedState({ state: 'NOT_STARTED' });
  const rec0 = (await recs(db)).map(r => ({ clientId: r.clientId, status: r.status, rev: r.rev, addedAt: r.addedAt }));
  const aid = aidN(), p = core.assignPlan(rec0, SID, 'CL-001', 'remove', { aid }), b = writeBatch(db);
  b.set(doc(db, 'workAssign', p.id), { ...p.doc, updatedAt: serverTimestamp() }); b.set(doc(db, 'workAssignAudit', aid), { ...p.audit, actor: OWNER_UID, createdAt: serverTimestamp() });
  await assertFails(b.commit());
  const aid2 = aidN(), b2 = writeBatch(db);
  b2.set(doc(db, 'workAssign', SID2 + '__CL-002'), { sid: SID2, clientId: 'CL-002', status: 'active', rev: 1, addedAt: serverTimestamp(), updatedAt: serverTimestamp(), lastAudit: aid2 });
  b2.set(doc(db, 'workAssignAudit', aid2), { sid: SID2, clientId: 'CL-002', action: 'add', reason: '', rev: 1, actor: OWNER_UID, createdAt: serverTimestamp() });
  await assertFails(b2.commit());
});
test('clock in with clients picked beforehand is one all-or-nothing batch (and one archived pick makes the whole thing fail)', async () => {
  const db = owner(); await seedClient('CL-001'); await seedClient('CL-002');
  await seed('workState/main', { state: 'NOT_STARTED', sid: '', n: 0, fb: false, lu: false, lb: false, lastEid: '', rev: 1, updatedAt: new Date() });
  const build = picks => {
    const p = core.plan(core.initialState(), 'CLOCK_IN', { sid: SID2 }), b = writeBatch(db);
    b.set(doc(db, 'workEvents', p.eid), { ...p.event, at: serverTimestamp(), by: OWNER_UID });
    b.set(doc(db, 'workState', 'main'), { ...p.state, updatedAt: serverTimestamp() });
    b.set(doc(db, 'workSessions', SID2), { tz: 'Asia/Manila', date: '2026-11-04', startedAt: serverTimestamp(), by: OWNER_UID });
    for (const c of picks) { const aid = aidN(); b.set(doc(db, 'workAssign', SID2 + '__' + c), { sid: SID2, clientId: c, status: 'active', rev: 1, addedAt: serverTimestamp(), updatedAt: serverTimestamp(), lastAudit: aid }); b.set(doc(db, 'workAssignAudit', aid), { sid: SID2, clientId: c, action: 'add', reason: '', rev: 1, actor: OWNER_UID, createdAt: serverTimestamp() }); }
    return b;
  };
  await seedClient('CL-002', 'archived');
  await assertFails(build(['CL-001', 'CL-002']).commit());
  assert.equal((await getDoc(doc(db, 'workState', 'main'))).data().state, 'NOT_STARTED'); assert.equal((await getDocs(collection(db, 'workEvents'))).size, 0);
  await seedClient('CL-002');
  await assertSucceeds(build(['CL-001', 'CL-002']).commit());
  assert.equal((await recs(db)).length, 2); assert.equal((await getDoc(doc(db, 'workState', 'main'))).data().state, 'WORKING');
});
test('assignments and audit entries can never be edited or deleted; no extra fields', async () => {
  const db = owner(); await setup(); const p = await change(db, 'add', 'CL-001');
  const ref = doc(db, 'workAssign', p.id), aref = doc(db, 'workAssignAudit', (await getDocs(collection(db, 'workAssignAudit'))).docs[0].id);
  await assertFails(deleteDoc(ref)); await assertFails(deleteDoc(aref)); await assertFails(updateDoc(aref, { reason: 'x' })); await assertFails(updateDoc(ref, { hours: 9 }));
  const aid = aidN(), b = writeBatch(db);
  b.set(doc(db, 'workAssign', SID + '__CL-002'), { sid: SID, clientId: 'CL-002', status: 'active', rev: 1, addedAt: serverTimestamp(), updatedAt: serverTimestamp(), lastAudit: aid, name: 'Ann' });
  b.set(doc(db, 'workAssignAudit', aid), { sid: SID, clientId: 'CL-002', action: 'add', reason: '', rev: 1, actor: OWNER_UID, createdAt: serverTimestamp() });
  await assertFails(b.commit());
});
test('visitors and other accounts have no access at all', async () => {
  const db0 = owner(); await setup(); await change(db0, 'add', 'CL-001');
  for (const db of [env.unauthenticatedContext().firestore(), google('stranger'), env.authenticatedContext(OWNER_UID, { email_verified: false, firebase: { sign_in_provider: 'google.com' } }).firestore()]) {
    await assertFails(getDocs(collection(db, 'workAssign'))); await assertFails(getDocs(collection(db, 'workAssignAudit'))); await assertFails(getDoc(doc(db, 'workAssign', SID + '__CL-001')));
    await assertFails(setDoc(doc(db, 'workAssign', SID + '__CL-002'), { sid: SID, clientId: 'CL-002', status: 'active', rev: 1, addedAt: serverTimestamp(), updatedAt: serverTimestamp(), lastAudit: 'z'.repeat(16) }));
  }
});
test('the query the page uses (assignments of one session) is allowed for the owner', async () => {
  const db = owner(); await setup(); await change(db, 'add', 'CL-001');
  const { query, where } = await import('firebase/firestore');
  await assertSucceeds(getDocs(query(collection(db, 'workAssign'), where('sid', '==', SID))));
});
