// CodeFlow 4.5.0 EN-1A - REAL Firestore rules engine tests (Firebase Local Emulator Suite): goal per weekday (todoPrefs.weekdayGoalMin) and the owner's default time zone (ownerPrefs).
// Both rules files are run through the SAME tests, so a difference in behaviour between firestore.rules.strict and firestore.rules fails here.
// Run by GitHub Actions (.github/workflows/rules-emulator.yml) or locally:  cd rules-tests/emulator && npm install && npm test   (needs Java 17+)
// STATUS WHEN THIS FILE WAS BUILT: written but NOT executed (the build environment cannot download the emulator). The Python rules simulator (section 8s) covers the same cases.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { describe, before, after, beforeEach, test } from 'node:test';
import { doc, getDoc, getDocs, collection, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const OWNER_UID = '3p2YvH4NSVYAAfA0E6HC2kkyc5F3';
const FILES = [['firestore.rules.strict', '../../firestore.rules.strict'], ['firestore.rules (transition)', '../../firestore.rules']];

for (const [label, path] of FILES) describe(`EN-1A on ${label}`, () => {
  let env;
  before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-en1a', firestore: { rules: readFileSync(path, 'utf8') } }); });
  after(async () => { await env.cleanup(); });
  beforeEach(async () => { await env.clearFirestore(); });
  const google = (uid, email = 'x@example.com') => env.authenticatedContext(uid, { email, email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();
  const owner = () => google(OWNER_UID, 'fredespinosa86.app@gmail.com');
  const stranger = () => google('someoneelse123', 'stranger@gmail.com');
  const visitorTok = () => env.authenticatedContext('m_abcDEF1234567890', { form: 'meeting', firebase: { sign_in_provider: 'custom' } }).firestore();
  const pub = () => env.unauthenticatedContext().firestore();
  const OLD = new Date(1700000000000);
  const PF = (o = {}) => ({ dailyGoalMin: 120, updatedAt: serverTimestamp(), ...o });
  const put = (db, o) => setDoc(doc(db, 'todoPrefs', 'main'), o);
  const W7 = [60, null, 180, 120, null, 0, null];

  test('weekday goals: a list of 7 values (null or 0..1440) is accepted; the list is optional', async () => {
    await assertSucceeds(put(owner(), PF())); await assertSucceeds(put(owner(), PF({ weekdayGoalMin: W7 })));
    await assertSucceeds(put(owner(), PF({ weekdayGoalMin: [null, null, null, null, null, null, null] }))); await assertSucceeds(put(owner(), PF({ weekdayGoalMin: [1440, 1440, 1440, 1440, 1440, 1440, 1440] })));
  });
  test('weekday goals: wrong sizes and non-lists are refused', async () => {
    for (const bad of [[], [60], Array(6).fill(60), Array(8).fill(60), '60,60,60,60,60,60,60', 60, null, { 0: 60 }, true]) await assertFails(put(owner(), PF({ weekdayGoalMin: bad })));
  });
  test('weekday goals: each of the 7 places refuses -1, 1441, a fraction, text, true and a map (a list inside a list cannot even be sent: Firestore does not allow nested arrays, so the Python simulator covers that case only)', async () => {
    for (let i = 0; i < 7; i++) for (const bad of [-1, 1441, 1.5, '60', true, { a: 1 }]) { const l = Array(7).fill(60); l[i] = bad; await assertFails(put(owner(), PF({ weekdayGoalMin: l }))); }
  });
  test('weekday goals: an extra key, no daily goal, a forged time and another id are refused', async () => {
    await assertFails(put(owner(), PF({ weekdayGoalMin: W7, x: 1 }))); await assertFails(put(owner(), { weekdayGoalMin: W7, updatedAt: serverTimestamp() }));
    await assertFails(put(owner(), PF({ weekdayGoalMin: W7, updatedAt: OLD }))); await assertFails(setDoc(doc(owner(), 'todoPrefs', 'other'), PF({ weekdayGoalMin: W7 })));
  });
  for (const [name, ctx] of [['public', pub], ['Google stranger', stranger], ['visitor token', visitorTok]]) test(`${name} cannot write the weekday goals`, async () => { await assertFails(put(ctx(), PF({ weekdayGoalMin: W7 }))); });

  const OP = (o = {}) => ({ tz: 'Asia/Manila', prevTz: '', rev: 1, updatedAt: serverTimestamp(), ...o });
  const oput = (db, o, id = 'main') => setDoc(doc(db, 'ownerPrefs', id), o);
  test('owner zone: the owner creates main (valid name, no previous zone, revision 1)', async () => {
    await assertSucceeds(oput(owner(), OP())); await env.clearFirestore();
    for (const tz of ['America/Argentina/Buenos_Aires', 'Etc/GMT+8', 'UTC']) { await assertSucceeds(oput(owner(), OP({ tz }))); await env.clearFirestore(); }
  });
  test('owner zone: bad names, a previous zone or a revision other than 1 on create are refused', async () => {
    for (const tz of ['', 'A'.repeat(61), 'Asia Manila', 'Asia/Manila;', 'Asia/Manila\n', '<b>', 5, null, true]) await assertFails(oput(owner(), OP({ tz })));
    await assertFails(oput(owner(), OP({ prevTz: 'Asia/Manila' }))); for (const rev of [0, 2, -1, 1.5, 1.0 + 0.5, '1', null]) await assertFails(oput(owner(), OP({ rev })));
  });
  test('owner zone: extra or missing keys, a forged time, another id are refused', async () => {
    await assertFails(oput(owner(), { ...OP(), x: 1 })); for (const k of ['tz', 'prevTz', 'rev', 'updatedAt']) { const d = OP(); delete d[k]; await assertFails(oput(owner(), d)); }
    await assertFails(oput(owner(), OP({ updatedAt: OLD }))); await assertFails(oput(owner(), OP(), 'other'));
  });
  test('owner zone: a change keeps the replaced zone and raises the revision by exactly one', async () => {
    await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'ownerPrefs', 'main'), { tz: 'Asia/Manila', prevTz: '', rev: 1, updatedAt: OLD }); });
    const nx = (o = {}) => OP({ tz: 'Europe/London', prevTz: 'Asia/Manila', rev: 2, ...o });
    await assertFails(oput(owner(), nx({ prevTz: '' }))); await assertFails(oput(owner(), nx({ prevTz: 'UTC' })));
    for (const rev of [1, 3, 0, -1, 2.5, '2']) await assertFails(oput(owner(), nx({ rev })));
    await assertFails(oput(owner(), nx({ tz: 'bad name' }))); await assertFails(oput(owner(), nx({ updatedAt: OLD })));
    await assertFails(oput(stranger(), nx())); await assertFails(oput(pub(), nx()));
    await assertSucceeds(oput(owner(), nx()));
  });
  test('owner zone: read and delete are owner only; nobody else reads, lists or deletes', async () => {
    await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'ownerPrefs', 'main'), { tz: 'Asia/Manila', prevTz: '', rev: 1, updatedAt: OLD }); });
    await assertSucceeds(getDoc(doc(owner(), 'ownerPrefs', 'main')));
    for (const ctx of [pub, stranger, visitorTok]) { await assertFails(getDoc(doc(ctx(), 'ownerPrefs', 'main'))); await assertFails(getDocs(collection(ctx(), 'ownerPrefs'))); await assertFails(deleteDoc(doc(ctx(), 'ownerPrefs', 'main'))); }
    await assertSucceeds(deleteDoc(doc(owner(), 'ownerPrefs', 'main')));
  });
});
