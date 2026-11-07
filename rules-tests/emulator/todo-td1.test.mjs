// CodeFlow 4.5.0 TD1 - REAL Firestore rules engine tests (Firebase Local Emulator Suite) for To-do & focus: todoTasks, todoSessions, todoNotes, todoState.
// Run by GitHub Actions (.github/workflows/rules-emulator.yml) or locally:  cd rules-tests/emulator && npm install && npm test   (needs Java 17+)
// Demo project only; never touches the real Firebase project.
// STATUS WHEN THIS FILE WAS BUILT: written but NOT executed (the build environment cannot download the emulator). The Python rules simulator (section 8q) covers the same cases.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

const OWNER_UID = '3p2YvH4NSVYAAfA0E6HC2kkyc5F3';
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-todotd1', firestore: { rules: readFileSync('../../firestore.rules.strict', 'utf8') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const google = (uid, email = 'x@example.com') => env.authenticatedContext(uid, { email, email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();
const owner = () => google(OWNER_UID, 'fredespinosa86.app@gmail.com');
const stranger = () => google('someoneelse123', 'stranger@gmail.com');
const visitorTok = () => env.authenticatedContext('m_abcDEF1234567890', { form: 'meeting', firebase: { sign_in_provider: 'custom' } }).firestore();
const pub = () => env.unauthenticatedContext().firestore();
const OLD = new Date(1700000000000);
const T = (o = {}) => ({ name: 'Write report', desc: 'details', due: '2099-01-02', hours: 2, focusMin: 25, status: 'todo', secs: 0, doneAt: null, color: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...o });
const TS = (o = {}) => ({ ...T(), createdAt: OLD, updatedAt: OLD, ...o });
const IDLE = (o = {}) => ({ taskId: '', startedAt: null, goalMin: 0, lastSid: '', rev: 1, updatedAt: OLD, ...o });
const RUN = (taskId, o = {}) => ({ taskId, startedAt: new Date(Date.now() - 600000), goalMin: 25, lastSid: '', rev: 2, updatedAt: OLD, ...o });
const seedDoc = (path, data) => env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), ...path.split('/')), data); });
const TK = 'task00001', TK2 = 'task00002', SID = 'sess00001';

test('owner creates a task', async () => { await assertSucceeds(setDoc(doc(owner(), 'todoTasks', TK), T())); });
for (const [name, bad] of [['empty name', { name: '' }], ['121-char name', { name: 'x'.repeat(121) }], ['bad due', { due: '2099-13-01' }], ['negative hours', { hours: -1 }], ['hours 1001', { hours: 1001 }], ['focus 0', { focusMin: 0 }], ['focus 241', { focusMin: 241 }], ['bad status', { status: 'x' }], ['starts done', { status: 'done', doneAt: new Date() }], ['secs not 0 on create', { secs: 5 }], ['color 12', { color: 12 }], ['unknown field', { x: 1 }], ['forged createdAt', { createdAt: OLD }]])
  test(`task create with ${name} is refused`, async () => { await assertFails(setDoc(doc(owner(), 'todoTasks', TK), T(bad))); });
test('task id must be 8-40 letters/digits', async () => { for (const id of ['short', 'has space1', 'x'.repeat(41)]) await assertFails(setDoc(doc(owner(), 'todoTasks', id), T())); });
test('owner marks a task done only with doneAt = now, and cannot forge it', async () => {
  await seedDoc('todoTasks/' + TK, TS());
  await assertFails(updateDoc(doc(owner(), 'todoTasks', TK), { status: 'done', doneAt: OLD, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(owner(), 'todoTasks', TK), { status: 'done', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(owner(), 'todoTasks', TK), { status: 'done', doneAt: serverTimestamp(), updatedAt: serverTimestamp() }));
});
test('owner reopens a done task (doneAt back to null)', async () => { await seedDoc('todoTasks/' + TK, TS({ status: 'done', doneAt: OLD })); await assertSucceeds(updateDoc(doc(owner(), 'todoTasks', TK), { status: 'doing', doneAt: null, updatedAt: serverTimestamp() })); });
test('task update cannot change createdAt, and needs updatedAt = now', async () => { await seedDoc('todoTasks/' + TK, TS()); await assertFails(updateDoc(doc(owner(), 'todoTasks', TK), { createdAt: new Date(), updatedAt: serverTimestamp() })); await assertFails(updateDoc(doc(owner(), 'todoTasks', TK), { name: 'x', updatedAt: OLD })); await assertSucceeds(updateDoc(doc(owner(), 'todoTasks', TK), { name: 'x', updatedAt: serverTimestamp() })); });
test('owner reads, lists and deletes tasks', async () => { await seedDoc('todoTasks/' + TK, TS()); await assertSucceeds(getDoc(doc(owner(), 'todoTasks', TK))); await assertSucceeds(getDocs(collection(owner(), 'todoTasks'))); await assertSucceeds(deleteDoc(doc(owner(), 'todoTasks', TK))); });

const SESS = (o = {}) => ({ taskId: TK, start: new Date(Date.now() - 600000), secs: 600, day: '2026-11-07', kind: 'manual', createdAt: serverTimestamp(), ...o });
test('manual session create works; bad values are refused', async () => {
  await assertSucceeds(setDoc(doc(owner(), 'todoSessions', SID), SESS()));
  for (const bad of [{ secs: 0 }, { secs: 86401 }, { kind: 'auto' }, { day: '2026-13-01' }, { taskId: 'x' }, { x: 1 }, { createdAt: OLD }]) await assertFails(setDoc(doc(owner(), 'todoSessions', 'sess0000' + Math.floor(Math.random() * 9)), SESS(bad)));
});
test('timer session cannot be created on its own (needs the state step in the same batch)', async () => { await seedDoc('todoState/main', RUN(TK)); await assertFails(setDoc(doc(owner(), 'todoSessions', SID), SESS({ kind: 'timer' }))); });
test('session update may only make it shorter', async () => {
  await seedDoc('todoSessions/' + SID, { ...SESS(), createdAt: OLD, start: OLD });
  await assertFails(updateDoc(doc(owner(), 'todoSessions', SID), { secs: 700 })); await assertFails(updateDoc(doc(owner(), 'todoSessions', SID), { day: '2026-11-08' })); await assertSucceeds(updateDoc(doc(owner(), 'todoSessions', SID), { secs: 300 }));
});
test('owner deletes a session', async () => { await seedDoc('todoSessions/' + SID, { ...SESS(), createdAt: OLD, start: OLD }); await assertSucceeds(deleteDoc(doc(owner(), 'todoSessions', SID))); });

const NOTE = (o = {}) => ({ taskId: TK, text: 'went well', sessionId: '', createdAt: serverTimestamp(), editedAt: null, ...o });
test('notes: create, edit text only, delete', async () => {
  await assertSucceeds(setDoc(doc(owner(), 'todoNotes', 'note0001'), NOTE()));
  for (const bad of [{ text: '' }, { text: 'x'.repeat(2001) }, { sessionId: 'x y' }, { editedAt: serverTimestamp() }, { x: 1 }]) await assertFails(setDoc(doc(owner(), 'todoNotes', 'note0002'), NOTE(bad)));
  await seedDoc('todoNotes/note0003', { ...NOTE(), createdAt: OLD });
  await assertFails(updateDoc(doc(owner(), 'todoNotes', 'note0003'), { text: 'edit' })); await assertFails(updateDoc(doc(owner(), 'todoNotes', 'note0003'), { taskId: TK2, text: 'edit', editedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(owner(), 'todoNotes', 'note0003'), { text: 'edit', editedAt: serverTimestamp() })); await assertSucceeds(deleteDoc(doc(owner(), 'todoNotes', 'note0003')));
});

/* the one running timer */
test('state: only the idle record can be created, only at todoState/main', async () => {
  await assertSucceeds(setDoc(doc(owner(), 'todoState', 'main'), IDLE({ updatedAt: serverTimestamp() })));
  await env.clearFirestore();
  await assertFails(setDoc(doc(owner(), 'todoState', 'main'), RUN(TK, { startedAt: serverTimestamp(), updatedAt: serverTimestamp(), rev: 1 })));
  await assertFails(setDoc(doc(owner(), 'todoState', 'other'), IDLE({ updatedAt: serverTimestamp() })));
});
test('state: start from idle (startedAt = now, rev+1)', async () => {
  await seedDoc('todoState/main', IDLE());
  await assertFails(updateDoc(doc(owner(), 'todoState', 'main'), { taskId: TK, startedAt: OLD, goalMin: 25, lastSid: '', rev: 2, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(owner(), 'todoState', 'main'), { taskId: TK, startedAt: serverTimestamp(), goalMin: 25, lastSid: '', rev: 3, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(owner(), 'todoState', 'main'), { taskId: TK, startedAt: serverTimestamp(), goalMin: 0, lastSid: '', rev: 2, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(owner(), 'todoState', 'main'), { taskId: TK, startedAt: serverTimestamp(), goalMin: 25, lastSid: '', rev: 2, updatedAt: serverTimestamp() }));
});
test('state: two devices starting at once - the second sees rev 2 and its rev-2 write is refused', async () => {
  await seedDoc('todoState/main', IDLE());
  await assertSucceeds(updateDoc(doc(owner(), 'todoState', 'main'), { taskId: TK, startedAt: serverTimestamp(), goalMin: 25, lastSid: '', rev: 2, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(owner(), 'todoState', 'main'), { taskId: TK2, startedAt: serverTimestamp(), goalMin: 25, lastSid: '', rev: 2, updatedAt: serverTimestamp() }));
});
test('state: stop WITHOUT its session is refused; stop WITH it works in one batch', async () => {
  await seedDoc('todoState/main', RUN(TK));
  await assertFails(updateDoc(doc(owner(), 'todoState', 'main'), { taskId: '', startedAt: null, goalMin: 0, lastSid: SID, rev: 3, updatedAt: serverTimestamp() }));
  const st = (await env.withSecurityRulesDisabled(async c => (await getDoc(doc(c.firestore(), 'todoState', 'main'))).data()));
  void st;
  const db = owner(), b = writeBatch(db);
  const started = (await new Promise(r => env.withSecurityRulesDisabled(async c => r((await getDoc(doc(c.firestore(), 'todoState', 'main'))).data().startedAt))));
  b.set(doc(db, 'todoSessions', SID), { taskId: TK, start: started, secs: 600, day: '2026-11-07', kind: 'timer', createdAt: serverTimestamp() });
  b.update(doc(db, 'todoState', 'main'), { taskId: '', startedAt: null, goalMin: 0, lastSid: SID, rev: 3, updatedAt: serverTimestamp() });
  await assertSucceeds(b.commit());
});
test('state: a session for the wrong task or a wrong start time cannot close the timer', async () => {
  await seedDoc('todoState/main', RUN(TK));
  const started = await new Promise(r => env.withSecurityRulesDisabled(async c => r((await getDoc(doc(c.firestore(), 'todoState', 'main'))).data().startedAt)));
  for (const [taskId, start] of [[TK2, started], [TK, new Date(1700000000000)]]) {
    const db = owner(), b = writeBatch(db);
    b.set(doc(db, 'todoSessions', SID), { taskId, start, secs: 600, day: '2026-11-07', kind: 'timer', createdAt: serverTimestamp() });
    b.update(doc(db, 'todoState', 'main'), { taskId: '', startedAt: null, goalMin: 0, lastSid: SID, rev: 3, updatedAt: serverTimestamp() });
    await assertFails(b.commit());
  }
});
test('state: switching needs the finished session in the same batch', async () => {
  await seedDoc('todoState/main', RUN(TK));
  await assertFails(updateDoc(doc(owner(), 'todoState', 'main'), { taskId: TK2, startedAt: serverTimestamp(), goalMin: 25, lastSid: SID, rev: 3, updatedAt: serverTimestamp() }));
  const started = await new Promise(r => env.withSecurityRulesDisabled(async c => r((await getDoc(doc(c.firestore(), 'todoState', 'main'))).data().startedAt)));
  const db = owner(), b = writeBatch(db);
  b.set(doc(db, 'todoSessions', SID), { taskId: TK, start: started, secs: 600, day: '2026-11-07', kind: 'timer', createdAt: serverTimestamp() });
  b.update(doc(db, 'todoState', 'main'), { taskId: TK2, startedAt: serverTimestamp(), goalMin: 25, lastSid: SID, rev: 3, updatedAt: serverTimestamp() });
  await assertSucceeds(b.commit());
});
test('state: the same task cannot be switched to itself, and it cannot be deleted', async () => {
  await seedDoc('todoState/main', RUN(TK));
  await assertFails(updateDoc(doc(owner(), 'todoState', 'main'), { taskId: TK, startedAt: serverTimestamp(), goalMin: 25, lastSid: '', rev: 3, updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(owner(), 'todoState', 'main')));
});
for (const [name, ctx] of [['public', pub], ['Google stranger', stranger], ['visitor token', visitorTok]]) {
  test(`${name} cannot touch any to-do record`, async () => {
    await seedDoc('todoTasks/' + TK, TS()); await seedDoc('todoState/main', IDLE());
    for (const [c, id] of [['todoTasks', TK], ['todoSessions', SID], ['todoNotes', 'note0001'], ['todoState', 'main']]) { await assertFails(getDoc(doc(ctx(), c, id))); await assertFails(getDocs(collection(ctx(), c))); await assertFails(setDoc(doc(ctx(), c, id), { x: 1 })); await assertFails(deleteDoc(doc(ctx(), c, id))); }
  });
}
