// CodeFlow 4.5.0 F5 (+ SE-H1) - REAL Firestore rules engine tests for the form-verification design (visitor token, daily counter; token-only since SE-H1).
// Run by GitHub Actions (.github/workflows/rules-emulator.yml) or locally:  cd rules-tests/emulator && npm install && npm test   (needs Java 17+)
// Own demo project name. It never touches your real Firebase project. Tests the STRICT rules file.
// STATUS WHEN THIS FILE WAS BUILT: written but NOT executed (the build environment cannot download the emulator).
// What this adds over the project's simulator: the real engine's view of getAfter/existsAfter (the "stamp"), the exact cap boundary, and two simultaneous requests.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { doc, getDoc, setDoc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

const OWNER_UID = '3p2YvH4NSVYAAfA0E6HC2kkyc5F3';
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-forms5', firestore: { rules: readFileSync('../../firestore.rules.strict', 'utf8') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const UID = 'm_abcDEF1234567890';
const tok = (uid = UID, claims = { form: 'meeting' }, provider = 'custom') => env.authenticatedContext(uid, { ...claims, firebase: { sign_in_provider: provider } }).firestore();
const owner = () => env.authenticatedContext(OWNER_UID, { email: 'x@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const seed = (path, data) => env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), ...path.split('/')), data); });
const ymd = () => { const d = new Date(); return '' + d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0'); };
/* SE-H1: dates are relative to today (the rules refuse past dates and dates more than 366 days ahead) */
export const dayPlus = n => { const d = new Date(Date.now() + n * 86400000); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); };
const BOOKDAY = dayPlus(30);
const BASE = (o = {}) => ({ name: 'Ann', email: 'ann@example.com', company: 'Acme', date: BOOKDAY, time: '09:00', tz: 'Asia/Manila', platform: 'Zoom', message: 'Hello', status: 'new', createdAt: serverTimestamp(), ...o });
const TREQ = (o = {}) => BASE({ day: ymd(), ...o });
const seedCounter = n => seed('reqCounters/' + ymd(), { count: n, lastReq: 'm_previous_0000' });
// One token submission, as the page will do it: read today's counter, then ONE batch (request + counter with an explicit new count).
async function send(db, uid = UID, o = {}) {
  const cref = doc(db, 'reqCounters', ymd()); let cur = 0;
  try { const s = await getDoc(cref); cur = s.exists() ? s.data().count : 0; } catch (e) { throw e; }
  const b = writeBatch(db); b.set(doc(db, 'meetingRequests', uid), TREQ(o)); b.set(cref, { count: cur + 1, lastReq: uid }); return b.commit();
}
const sendAs = (uid, o) => send(tok(uid), uid, o);   // the token's uid and the request's document ID must be the same
const counterNow = async () => (await getDoc(doc(owner(), 'reqCounters', ymd()))).data().count;   // read as the owner (withSecurityRulesDisabled returns nothing)
const direct = (db, id, o = {}) => setDoc(doc(db, 'meetingRequests', id), BASE(o));

test('token request: first of the day creates request and counter', async () => { await assertSucceeds(send(tok())); });
test('token request: later request on an existing counter (explicit count + 1)', async () => { await seedCounter(5); await assertSucceeds(send(tok())); });
test('cap boundary: 29 -> 30 accepted, 30 -> 31 refused (default cap 30)', async () => { await seedCounter(29); await assertSucceeds(sendAs('m_one_abcdefgh12')); await assertFails(sendAs('m_two_abcdefgh12')); });
test('cap from content/guard: 50 allows 30 -> 31, 5 refuses 5 -> 6, a guard without cap keeps 30', async () => {
  await seed('content/guard', { pause: false, cap: 50 }); await seedCounter(30); await assertSucceeds(sendAs('m_one_abcdefgh12'));
  await seed('content/guard', { pause: false, cap: 5 }); await seedCounter(5); await assertFails(sendAs('m_two_abcdefgh12'));
  await seed('content/guard', { pause: false }); await seedCounter(30); await assertFails(sendAs('m_three_abcdefg12'));
});
test('a request without its counter write (stamp missing) is refused', async () => { await seedCounter(5); await assertFails(setDoc(doc(tok(), 'meetingRequests', UID), TREQ())); });
test('a counter bump without its request is refused (update and create)', async () => {
  await seedCounter(5); await assertFails(setDoc(doc(tok(), 'reqCounters', ymd()), { count: 6, lastReq: UID }));
  await env.clearFirestore(); await assertFails(setDoc(doc(tok(), 'reqCounters', ymd()), { count: 1, lastReq: UID }));
});
test('a request whose counter was stamped by ANOTHER token in the same batch is refused', async () => {
  await seedCounter(5); const db = tok(); const b = writeBatch(db); b.set(doc(db, 'meetingRequests', UID), TREQ()); b.set(doc(db, 'reqCounters', ymd()), { count: 6, lastReq: 'm_other_abcdefgh12' }); await assertFails(b.commit());
});
test('counter jumps (+2), decrements, extra fields and other day keys are refused', async () => {
  await seedCounter(5); const db = tok();
  for (const c of [{ count: 7, lastReq: UID }, { count: 4, lastReq: UID }, { count: 6, lastReq: UID, x: 1 }, { count: 6 }]) { const b = writeBatch(db); b.set(doc(db, 'meetingRequests', UID), TREQ()); b.set(doc(db, 'reqCounters', ymd()), c); await assertFails(b.commit()); }
  const b = writeBatch(db); b.set(doc(db, 'meetingRequests', UID), TREQ()); b.set(doc(db, 'reqCounters', '20200101'), { count: 1, lastReq: UID }); await assertFails(b.commit());
});
test('the request day field must be today; the document ID must be the token uid', async () => {
  await assertFails(send(tok(), UID, { day: '20200101' })); await assertFails(send(tok(), 'm_other_abcdefgh12'));
});
test('one request per token: a second submission with the same token is refused', async () => { const db = tok(); await assertSucceeds(send(db)); await assertFails(send(db)); });
test('no sign-in, Google stranger, wrong claim, non-custom provider, bad uid shape: all refused', async () => {
  await assertFails(send(anon()));
  await assertFails(send(env.authenticatedContext(UID, { email: 'a@b.co', email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore()));
  await assertFails(send(tok(UID, { form: 'other' }))); await assertFails(send(tok(UID, {}))); await assertFails(send(tok(UID, { form: 'meeting' }, 'anonymous')));
  await assertFails(send(tok('abc', { form: 'meeting' }), 'abc')); await assertFails(send(tok('m_short', { form: 'meeting' }), 'm_short'));
});
test('token request keeps the normal field checks (bad e-mail, long name, extra field, forged status)', async () => {
  for (const o of [{ email: 'x' }, { name: 'n'.repeat(101) }, { admin: true }, { status: 'confirmed' }, { message: '' }]) await assertFails(send(tok(), UID, o));
});
test('pause, capacity full and a busy slot also stop token requests', async () => {
  await seed('content/guard', { pause: true }); await assertFails(send(tok()));
  await env.clearFirestore(); await seed('content/capacity', { open: false }); await assertFails(send(tok()));
  await env.clearFirestore(); await seed('content/busy', { keys: [BOOKDAY + 'T09:00'] }); await assertFails(send(tok()));
});
test('SE-H1: the old direct form is refused whatever content/guard says (absent, tokenRequired false / true / string, no field)', async () => {
  await assertFails(direct(anon(), 'auto1')); await assertFails(direct(tok(), 'auto2')); await assertFails(direct(anon(), 'auto3', { day: ymd() }));
  for (const g of [{ pause: false, tokenRequired: false }, { pause: false }, { tokenRequired: true }, { tokenRequired: 'true' }, { tokenRequired: 1 }]) { await seed('content/guard', g); await assertFails(direct(anon(), 'auto4')); await assertFails(direct(tok(), 'auto5')); }
});
test('SE-H1: the token path works whatever the old switch says; deleting the guard document cannot reopen the direct path', async () => {
  await seed('content/guard', { pause: false, tokenRequired: false }); await assertSucceeds(send(tok('m_one_abcdefgh12'), 'm_one_abcdefgh12'));
  await env.clearFirestore(); await assertFails(direct(anon(), 'auto1')); await assertSucceeds(send(tok()));
});
test('SE-H1 date window: today, yesterday (UTC) and +366 days accepted; two days ago, last year, +367 days and a far date refused', async () => {
  await assertSucceeds(send(tok('m_d1_abcdefghij12'), 'm_d1_abcdefghij12', { date: dayPlus(0) })); await assertSucceeds(send(tok('m_d2_abcdefghij12'), 'm_d2_abcdefghij12', { date: dayPlus(-1) }));
  await assertSucceeds(send(tok('m_d3_abcdefghij12'), 'm_d3_abcdefghij12', { date: dayPlus(366) }));
  for (const [i, d] of [dayPlus(-2), dayPlus(-400), dayPlus(367), '2999-01-01', '1999-01-01'].entries()) { const u = 'm_bad' + i + '_abcdefgh12'; await assertFails(send(tok(u), u, { date: d })); }
});
test('only the owner can change content/guard (switch, cap, pause)', async () => {
  await seed('content/guard', { cap: 30, visitCap: 1500 });
  for (const db of [anon(), tok()]) await assertFails(updateDoc(doc(db, 'content', 'guard'), { cap: 99999, visitCap: 99999, chatCap: 99999 }));
  await assertSucceeds(updateDoc(doc(owner(), 'content', 'guard'), { cap: 40 }));
});
test('reads: a token reads today counter and ONLY its own request; no lists; owner reads all', async () => {
  const db = tok(); await assertSucceeds(send(db));
  await assertSucceeds(getDoc(doc(db, 'reqCounters', ymd()))); await assertSucceeds(getDoc(doc(db, 'meetingRequests', UID)));
  await assertFails(getDoc(doc(tok('m_other_abcdefgh12'), 'meetingRequests', UID)));
  await assertFails(getDoc(doc(anon(), 'reqCounters', ymd()))); await assertFails(getDoc(doc(anon(), 'meetingRequests', UID)));
  const { getDocs, collection } = await import('firebase/firestore');
  await assertFails(getDocs(collection(db, 'meetingRequests'))); await assertFails(getDocs(collection(db, 'reqCounters')));
  await assertSucceeds(getDoc(doc(owner(), 'meetingRequests', UID))); await assertSucceeds(getDocs(collection(owner(), 'reqCounters')));
});
test('a token cannot update or delete its request, and nobody can delete a counter', async () => {
  const db = tok(); await assertSucceeds(send(db));
  await assertFails(updateDoc(doc(db, 'meetingRequests', UID), { message: 'changed' }));
  const { deleteDoc } = await import('firebase/firestore');
  await assertFails(deleteDoc(doc(db, 'meetingRequests', UID))); await assertFails(deleteDoc(doc(db, 'reqCounters', ymd()))); await assertFails(deleteDoc(doc(owner(), 'reqCounters', ymd())));
});
test('TWO SIMULTANEOUS requests from two tokens: the counter ends equal to the number accepted (no lost count, no overshoot at the cap)', async () => {
  await seedCounter(29);
  const rs = await Promise.allSettled([send(tok('m_aaaa_abcdefgh12'), 'm_aaaa_abcdefgh12'), send(tok('m_bbbb_abcdefgh12'), 'm_bbbb_abcdefgh12')]);
  const ok = rs.filter(r => r.status === 'fulfilled').length;
  const n = await counterNow();
  if (n !== 29 + ok) throw new Error('counter ' + n + ' does not match 29 + accepted ' + ok);
  if (n > 30) throw new Error('cap overshoot: ' + n);
  if (ok < 1) throw new Error('both refused');
});
test('TWO SIMULTANEOUS requests below the cap: counter equals the number accepted (a refused one is retried by the page)', async () => {
  await seedCounter(5);
  const rs = await Promise.allSettled([send(tok('m_aaaa_abcdefgh12'), 'm_aaaa_abcdefgh12'), send(tok('m_bbbb_abcdefgh12'), 'm_bbbb_abcdefgh12')]);
  const ok = rs.filter(r => r.status === 'fulfilled').length;
  const n = await counterNow();
  if (n !== 5 + ok) throw new Error('counter ' + n + ' does not match 5 + accepted ' + ok);
  if (ok < 1) throw new Error('both refused');
});
