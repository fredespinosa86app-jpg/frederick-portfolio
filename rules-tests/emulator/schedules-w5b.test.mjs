// CodeFlow 4.5.0 W5b - REAL Firestore rules engine tests (Firebase Local Emulator Suite) for the break schedules (workSchedules).
// Run by GitHub Actions (.github/workflows/rules-emulator.yml) or locally:  cd rules-tests/emulator && npm install && npm test   (needs Java 17+)
// Uses a demo project only; it never touches your real Firebase project.
// STATUS WHEN THIS FILE WAS BUILT: written but NOT executed (the build environment cannot download the emulator). The Python rules simulator covers the same cases.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const OWNER_UID = '3p2YvH4NSVYAAfA0E6HC2kkyc5F3';
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-schedules5b', firestore: { rules: readFileSync('../../firestore.rules.strict', 'utf8') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const google = (uid, email = 'x@example.com') => env.authenticatedContext(uid, { email, email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();
const owner = () => google(OWNER_UID, 'fredespinosa86.app@gmail.com');
const stranger = () => google('someoneelse123', 'stranger@gmail.com');
const visitorTok = () => env.authenticatedContext('m_abcDEF1234567890', { form: 'meeting', firebase: { sign_in_provider: 'custom' } }).firestore();
const pub = () => env.unauthenticatedContext().firestore();
const S = (o = {}) => ({ fb: 15, lu: 60, lb: 15, pfb: 15, plu: 60, plb: 15, rev: 1, updatedAt: serverTimestamp(), ...o });
const seed = async (id = 'default', o = {}) => env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'workSchedules', id), { ...S(), updatedAt: new Date(1700000000000), ...o }); });
const seedClient = async id => env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'clientRegistry', id), { status: 'active', rev: 1, createdAt: new Date(1700000000000), updatedAt: new Date(1700000000000), lastAudit: 'a'.repeat(20) }); });

test('owner creates the default schedule', async () => { await assertSucceeds(setDoc(doc(owner(), 'workSchedules', 'default'), S())); });
test('owner creates a schedule for an existing client', async () => { await seedClient('ACME-1'); await assertSucceeds(setDoc(doc(owner(), 'workSchedules', 'ACME-1'), S())); });
test('a schedule for a client that is not in the registry is refused', async () => { await assertFails(setDoc(doc(owner(), 'workSchedules', 'ACME-1'), S())); });
test('other document names are refused', async () => { for (const id of ['Default', 'all', 'acme-1']) await assertFails(setDoc(doc(owner(), 'workSchedules', id), S())); });
test('owner reads, lists and deletes', async () => { await seed(); await assertSucceeds(getDoc(doc(owner(), 'workSchedules', 'default'))); await assertSucceeds(getDocs(collection(owner(), 'workSchedules'))); await assertSucceeds(deleteDoc(doc(owner(), 'workSchedules', 'default'))); });
test('update: rev +1, updatedAt now, previous values = replaced values', async () => { await seed(); await assertSucceeds(updateDoc(doc(owner(), 'workSchedules', 'default'), { fb: 20, lu: 45, lb: 10, pfb: 15, plu: 60, plb: 15, rev: 2, updatedAt: serverTimestamp() })); });
test('update with wrong previous values is refused', async () => { await seed(); await assertFails(updateDoc(doc(owner(), 'workSchedules', 'default'), { lu: 45, plu: 99, rev: 2, updatedAt: serverTimestamp() })); });
test('update with rev not +1 is refused', async () => { await seed(); for (const r of [1, 3]) await assertFails(updateDoc(doc(owner(), 'workSchedules', 'default'), { lu: 45, rev: r, updatedAt: serverTimestamp() })); });
test('update with a forged updatedAt is refused', async () => { await seed(); await assertFails(updateDoc(doc(owner(), 'workSchedules', 'default'), { lu: 45, plu: 60, rev: 2, updatedAt: new Date(1700000000000) })); });
for (const [name, bad] of [['-1 minutes', { fb: -1 }], ['241 minutes', { lu: 241 }], ['decimal', { lb: 1.5 }], ['text', { fb: '15' }], ['unknown field', { x: 1 }], ['rev 2 on create', { rev: 2 }]])
  test(`create with ${name} is refused`, async () => { await assertFails(setDoc(doc(owner(), 'workSchedules', 'default'), S(bad))); });
test('0 and 240 minutes are accepted', async () => { await assertSucceeds(setDoc(doc(owner(), 'workSchedules', 'default'), S({ fb: 0, lu: 240, lb: 0 }))); });
for (const [name, ctx] of [['public', pub], ['Google stranger', stranger], ['visitor token', visitorTok]]) {
  test(`${name} cannot read, list, create, update or delete`, async () => {
    await seed();
    await assertFails(getDoc(doc(ctx(), 'workSchedules', 'default'))); await assertFails(getDocs(collection(ctx(), 'workSchedules')));
    await assertFails(setDoc(doc(ctx(), 'workSchedules', 'default'), S()));
    await assertFails(updateDoc(doc(ctx(), 'workSchedules', 'default'), { lu: 1, plu: 60, rev: 2, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(ctx(), 'workSchedules', 'default')));
  });
}
