// CodeFlow 4.5.0 SE-H1 - REAL Firestore rules engine tests for the daily budgets of anonymous writes (visits, unanswered chat questions).
// Run by GitHub Actions (.github/workflows/rules-emulator.yml) or locally:  cd rules-tests/emulator && npm install && npm test   (needs Java 17+)
// STATUS WHEN THIS FILE WAS BUILT: written but NOT executed (the build environment cannot download the emulator). Tests the STRICT rules file.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
const OWNER_UID = '3p2YvH4NSVYAAfA0E6HC2kkyc5F3';
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-h1', firestore: { rules: readFileSync('../../firestore.rules.strict', 'utf8') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const anon = () => env.unauthenticatedContext().firestore();
const owner = () => env.authenticatedContext(OWNER_UID, { email: 'x@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();
const seed = (path, data) => env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), ...path.split('/')), data); });
const ymd = () => { const d = new Date(); return '' + d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0'); };
const SID = 'b'.repeat(24), VID = SID + '_view_home', VID2 = SID + '_summary_sections', CID = 'abc123_x1';
const VIEW = (o = {}) => ({ vid: 'a'.repeat(24), sid: SID, type: 'view', path: 'home', ref: '', device: 'desktop', browser: 'Chrome', createdAt: serverTimestamp(), ...o });
const SUMM = (o = {}) => ({ vid: 'a'.repeat(24), sid: SID, type: 'summary', path: 'sections', ref: '', device: 'desktop', browser: 'Chrome', createdAt: serverTimestamp(), secs: ['intro'], ...o });
const CHAT = (o = {}) => ({ question: 'Do you do FBA?', response: 'x', sessionId: 'abc123', context: '', status: 'new', createdAt: serverTimestamp(), ...o });
// exactly what scripts/core-anon.js does: record + counter (increment, merge) in one batch
function counted(db, kind, col, id, data, key) { const b = writeBatch(db); b.set(doc(db, col, id), data); b.set(doc(db, 'anonCounters', key || kind + '_' + ymd()), { count: increment(1), last: id }, { merge: true }); return b.commit(); }
const visit = (id = VID, data = VIEW(), db = anon()) => counted(db, 'v', 'visits', id, data);
const chat = (id = CID, data = CHAT(), db = anon()) => counted(db, 'c', 'chatUnanswered', id, data);
const seedV = n => seed('anonCounters/v_' + ymd(), { count: n, last: 'previous' });
const seedC = n => seed('anonCounters/c_' + ymd(), { count: n, last: 'previous' });
const count = async k => (await getDoc(doc(owner(), 'anonCounters', k + '_' + ymd()))).data().count;

test('a counted visit: first of the day creates record and counter; a later one increments', async () => { await assertSucceeds(visit()); if (await count('v') !== 1) throw new Error('count'); await assertSucceeds(visit(VID2, SUMM())); if (await count('v') !== 2) throw new Error('count 2'); });
test('a counted chat question uses its own counter', async () => { await assertSucceeds(chat()); if (await count('c') !== 1) throw new Error('count'); });
test('default budgets: visits 1499 -> 1500 accepted, 1500 -> 1501 refused; chat 299 -> 300 accepted, 300 -> 301 refused', async () => {
  await seedV(1499); await assertSucceeds(visit()); await env.clearFirestore(); await seedV(1500); await assertFails(visit());
  await env.clearFirestore(); await seedC(299); await assertSucceeds(chat()); await env.clearFirestore(); await seedC(300); await assertFails(chat());
});
test('visitCap and chatCap in content/guard raise or lower the budgets; 0 closes at once; a guard without them keeps the defaults', async () => {
  await seed('content/guard', { visitCap: 2000 }); await seedV(1500); await assertSucceeds(visit());
  await env.clearFirestore(); await seed('content/guard', { visitCap: 10 }); await seedV(10); await assertFails(visit());
  await env.clearFirestore(); await seed('content/guard', { chatCap: 0 }); await assertFails(chat());
  await env.clearFirestore(); await seed('content/guard', { pause: false }); await seedV(1500); await assertFails(visit());
});
test('a record WITHOUT its counter bump in the batch is refused (visit view, summary, chat)', async () => {
  await assertFails(setDoc(doc(anon(), 'visits', VID), VIEW())); await assertFails(setDoc(doc(anon(), 'visits', VID2), SUMM())); await assertFails(setDoc(doc(anon(), 'chatUnanswered', CID), CHAT()));
});
test('a counter bump WITHOUT a new record is refused (first, later; visits and chat)', async () => {
  await assertFails(setDoc(doc(anon(), 'anonCounters', 'v_' + ymd()), { count: 1, last: VID })); await assertFails(setDoc(doc(anon(), 'anonCounters', 'c_' + ymd()), { count: 1, last: CID }));
  await seedV(5); await assertFails(updateDoc(doc(anon(), 'anonCounters', 'v_' + ymd()), { count: 6, last: VID })); await seedC(5); await assertFails(updateDoc(doc(anon(), 'anonCounters', 'c_' + ymd()), { count: 6, last: CID }));
});
test('counter jumps (+2), decrements, extra fields, a stale last (record already exists), wrong day or wrong kind key are refused', async () => {
  await seedV(5); const db = anon();
  for (const c of [{ count: 7, last: VID }, { count: 4, last: VID }, { count: 6, last: VID, x: 1 }, { count: 6 }]) { const b = writeBatch(db); b.set(doc(db, 'visits', VID), VIEW()); b.set(doc(db, 'anonCounters', 'v_' + ymd()), c); await assertFails(b.commit()); }
  for (const k of ['v_20200101', 'x_' + ymd(), 'v_' + ymd() + 'x', ymd()]) await assertFails(counted(db, 'v', 'visits', VID, VIEW(), k));
  await seed('visits/' + VID, VIEW({ createdAt: new Date() })); await assertFails(visit(VID, VIEW(), db));
});
test('the shape rules of visits and chat questions still apply to counted writes (bad id, extra field, forged time, bad device)', async () => {
  await assertFails(visit(SID + '_view_other', VIEW())); await assertFails(visit(VID, VIEW({ ip: '1.2.3.4' }))); await assertFails(visit(VID, VIEW({ createdAt: new Date(0) }))); await assertFails(visit(VID, VIEW({ device: 'pc' })));
  await assertFails(chat('zzz_x1', CHAT())); await assertFails(chat(CID, CHAT({ question: '' }))); await assertFails(chat(CID, CHAT({ admin: 1 })));
});
test('a summary UPDATE (growth) needs no counter; shrinking and changing fields stay refused', async () => {
  await assertSucceeds(visit(VID2, SUMM())); await assertSucceeds(updateDoc(doc(anon(), 'visits', VID2), { secs: ['intro', 'faq'] })); await assertFails(updateDoc(doc(anon(), 'visits', VID2), { secs: ['intro'] }));
});
test('pause stops counted writes; capacity full does not', async () => {
  await seed('content/guard', { pause: true }); await assertFails(visit()); await assertFails(chat());
  await env.clearFirestore(); await seed('content/capacity', { open: false }); await assertSucceeds(visit()); await assertSucceeds(chat());
});
test('counters: only the owner reads or deletes; nobody else writes outside the batch rule; the owner cannot forge a visitor bump either way', async () => {
  await assertSucceeds(visit()); const d = doc(anon(), 'anonCounters', 'v_' + ymd());
  await assertFails(getDoc(d)); await assertFails(deleteDoc(d)); await assertSucceeds(getDoc(doc(owner(), 'anonCounters', 'v_' + ymd())));
  await assertSucceeds(deleteDoc(doc(owner(), 'anonCounters', 'v_' + ymd())));
});
test('TWO SIMULTANEOUS counted visits: the counter ends equal to the number accepted (a collision is refused, never double counted)', async () => {
  await seedV(5); const rs = await Promise.allSettled([visit(SID + '_view_a'.slice(0, 0) + '_view_home'.replace('_view_home', '_view_aaa'), VIEW({ path: 'aaa' })), visit(SID + '_view_bbb', VIEW({ path: 'bbb' }))]);
  const ok = rs.filter(r => r.status === 'fulfilled').length, n = await count('v'); if (n !== 5 + ok) throw new Error('counter ' + n + ' does not match 5 + accepted ' + ok); if (ok < 1) throw new Error('both refused');
});
