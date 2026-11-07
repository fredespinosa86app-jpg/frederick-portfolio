// CodeFlow 4.5.0 TD2 - REAL Firestore rules engine tests (Firebase Local Emulator Suite) for the to-do status log (todoEvents) and todoPrefs.
// Run by GitHub Actions (.github/workflows/rules-emulator.yml) or locally:  cd rules-tests/emulator && npm install && npm test   (needs Java 17+)
// STATUS WHEN THIS FILE WAS BUILT: written but NOT executed (the build environment cannot download the emulator). The Python rules simulator (section 8r) covers the same cases.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { doc, getDoc, getDocs, collection, setDoc, deleteDoc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

const OWNER_UID = '3p2YvH4NSVYAAfA0E6HC2kkyc5F3';
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-todotd2', firestore: { rules: readFileSync('../../firestore.rules.strict', 'utf8') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const google = (uid, email = 'x@example.com') => env.authenticatedContext(uid, { email, email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();
const owner = () => google(OWNER_UID, 'fredespinosa86.app@gmail.com');
const stranger = () => google('someoneelse123', 'stranger@gmail.com');
const visitorTok = () => env.authenticatedContext('m_abcDEF1234567890', { form: 'meeting', firebase: { sign_in_provider: 'custom' } }).firestore();
const pub = () => env.unauthenticatedContext().firestore();
const OLD = new Date(1700000000000);
const TASK = (o = {}) => ({ name: 'Write report', desc: '', due: '', hours: 2, focusMin: 25, status: 'todo', secs: 0, doneAt: null, color: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...o });
const seedTask = (id, o = {}) => env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'todoTasks', id), { ...TASK(), createdAt: OLD, updatedAt: OLD, ...o }); });
const EV = (type, taskId = 'task00001') => ({ taskId, type, createdAt: serverTimestamp() });
const TK = 'task00001';

test('creating a task with its "created" log entry in one batch works; the entry alone does not', async () => {
  const db = owner(), b = writeBatch(db); b.set(doc(db, 'todoTasks', TK), TASK()); b.set(doc(db, 'todoEvents', 'evnt00001'), EV('created')); await assertSucceeds(b.commit());
  await env.clearFirestore(); await assertFails(setDoc(doc(owner(), 'todoEvents', 'evnt00001'), EV('created')));
});
test('"created" for a task that already exists is refused', async () => { await seedTask(TK); await assertFails(setDoc(doc(owner(), 'todoEvents', 'evnt00001'), EV('created'))); });
test('"done" works only in the same batch as the task becoming done', async () => {
  await seedTask(TK, { status: 'doing' });
  await assertFails(setDoc(doc(owner(), 'todoEvents', 'evnt00001'), EV('done')));
  const db = owner(), b = writeBatch(db); b.update(doc(db, 'todoTasks', TK), { status: 'done', doneAt: serverTimestamp(), updatedAt: serverTimestamp() }); b.set(doc(db, 'todoEvents', 'evnt00001'), EV('done')); await assertSucceeds(b.commit());
});
test('"done" for an already-done task is refused', async () => { await seedTask(TK, { status: 'done', doneAt: OLD }); const db = owner(), b = writeBatch(db); b.update(doc(db, 'todoTasks', TK), { name: 'x', updatedAt: serverTimestamp() }); b.set(doc(db, 'todoEvents', 'evnt00001'), EV('done')); await assertFails(b.commit()); });
test('"reopened" works for a done task that becomes doing, not for one that is archived or not done', async () => {
  await seedTask(TK, { status: 'done', doneAt: OLD });
  let db = owner(), b = writeBatch(db); b.update(doc(db, 'todoTasks', TK), { status: 'archived', doneAt: null, updatedAt: serverTimestamp() }); b.set(doc(db, 'todoEvents', 'evnt00001'), EV('reopened')); await assertFails(b.commit());
  db = owner(); b = writeBatch(db); b.update(doc(db, 'todoTasks', TK), { status: 'doing', doneAt: null, updatedAt: serverTimestamp() }); b.set(doc(db, 'todoEvents', 'evnt00001'), EV('reopened')); await assertSucceeds(b.commit());
  await env.clearFirestore(); await seedTask(TK, { status: 'doing' }); db = owner(); b = writeBatch(db); b.update(doc(db, 'todoTasks', TK), { name: 'x', updatedAt: serverTimestamp() }); b.set(doc(db, 'todoEvents', 'evnt00001'), EV('reopened')); await assertFails(b.commit());
});
test('log entries cannot be edited; the owner may delete; others cannot read, list or delete', async () => {
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'todoEvents', 'evnt00001'), { taskId: TK, type: 'done', createdAt: OLD }); });
  await assertFails(updateDoc(doc(owner(), 'todoEvents', 'evnt00001'), { type: 'created' }));
  await assertSucceeds(getDoc(doc(owner(), 'todoEvents', 'evnt00001'))); await assertSucceeds(getDocs(collection(owner(), 'todoEvents')));
  for (const ctx of [pub, stranger, visitorTok]) { await assertFails(getDoc(doc(ctx(), 'todoEvents', 'evnt00001'))); await assertFails(getDocs(collection(ctx(), 'todoEvents'))); await assertFails(deleteDoc(doc(ctx(), 'todoEvents', 'evnt00001'))); }
  await assertSucceeds(deleteDoc(doc(owner(), 'todoEvents', 'evnt00001')));
});
test('bad event shapes are refused (type, extra key, forged time, bad ids)', async () => {
  await seedTask(TK, { status: 'doing' });
  for (const bad of [{ type: 'deleted' }, { x: 1 }, { createdAt: OLD }, { taskId: 'bad id' }]) { const db = owner(), b = writeBatch(db); b.update(doc(db, 'todoTasks', TK), { status: 'done', doneAt: serverTimestamp(), updatedAt: serverTimestamp() }); b.set(doc(db, 'todoEvents', 'evnt00001'), { ...EV('done'), ...bad }); await assertFails(b.commit()); }
});
test('daily goal: owner sets 0..1440 on main only', async () => {
  await assertSucceeds(setDoc(doc(owner(), 'todoPrefs', 'main'), { dailyGoalMin: 120, updatedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(owner(), 'todoPrefs', 'main'), { dailyGoalMin: 0, updatedAt: serverTimestamp() }));
  for (const bad of [-1, 1441, 1.5, '60']) await assertFails(setDoc(doc(owner(), 'todoPrefs', 'main'), { dailyGoalMin: bad, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(owner(), 'todoPrefs', 'other'), { dailyGoalMin: 60, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(owner(), 'todoPrefs', 'main'), { dailyGoalMin: 60, updatedAt: OLD }));
});
for (const [name, ctx] of [['public', pub], ['Google stranger', stranger], ['visitor token', visitorTok]]) test(`${name} cannot read or write the daily goal`, async () => {
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'todoPrefs', 'main'), { dailyGoalMin: 60, updatedAt: OLD }); });
  await assertFails(getDoc(doc(ctx(), 'todoPrefs', 'main'))); await assertFails(setDoc(doc(ctx(), 'todoPrefs', 'main'), { dailyGoalMin: 30, updatedAt: serverTimestamp() })); await assertFails(deleteDoc(doc(ctx(), 'todoPrefs', 'main')));
});
