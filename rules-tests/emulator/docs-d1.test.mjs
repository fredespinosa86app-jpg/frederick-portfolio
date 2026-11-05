// CodeFlow 4.5.0 D1 - REAL Firestore rules engine tests (Firebase Local Emulator Suite) for the owner-only Documents page (ownerDocs).
// Run by GitHub Actions (.github/workflows/rules-emulator.yml) or locally:  cd rules-tests/emulator && npm install && npm test   (needs Java 17+)
// Uses a demo project only; it never touches your real Firebase project.
// STATUS WHEN THIS FILE WAS BUILT: written but NOT executed (the build environment cannot download the emulator).
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const OWNER_UID = '3p2YvH4NSVYAAfA0E6HC2kkyc5F3';
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-portfolio', firestore: { rules: readFileSync('../../firestore.rules.strict', 'utf8') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const google = (uid, email = 'x@example.com') => env.authenticatedContext(uid, { email, email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();
const owner = () => google(OWNER_UID, 'fredespinosa86.app@gmail.com');
const stranger = () => google('someoneelse123', 'stranger@gmail.com');
const visitorTok = () => env.authenticatedContext('m_abcDEF1234567890', { form: 'meeting', firebase: { sign_in_provider: 'custom' } }).firestore();
const pub = () => env.unauthenticatedContext().firestore();
const ID = 'abcd1234ef';
const D = (o = {}) => ({ title: 'Runbook', category: 'runbook', body: 'Steps', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...o });
const seed = async () => env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'ownerDocs', ID), { title: 'Seed', category: 'notes', body: 'x', createdAt: new Date(1700000000000), updatedAt: new Date(1700000000000) }); });

test('owner creates a document', async () => { await assertSucceeds(setDoc(doc(owner(), 'ownerDocs', ID), D())); });
test('owner reads and lists documents', async () => { await seed(); await assertSucceeds(getDoc(doc(owner(), 'ownerDocs', ID))); await assertSucceeds(getDocs(collection(owner(), 'ownerDocs'))); });
test('owner updates title/body/category and updatedAt, createdAt unchanged', async () => { await seed(); await assertSucceeds(updateDoc(doc(owner(), 'ownerDocs', ID), { title: 'New', body: 'y', category: 'security', updatedAt: serverTimestamp() })); });
test('owner deletes a document', async () => { await seed(); await assertSucceeds(deleteDoc(doc(owner(), 'ownerDocs', ID))); });
for (const [name, ctx] of [['public', pub], ['Google stranger', stranger], ['visitor token', visitorTok]]) {
  test(`${name} cannot read, list, create, update or delete`, async () => {
    await seed();
    await assertFails(getDoc(doc(ctx(), 'ownerDocs', ID))); await assertFails(getDocs(collection(ctx(), 'ownerDocs')));
    await assertFails(setDoc(doc(ctx(), 'ownerDocs', 'zzzz1234yy'), D()));
    await assertFails(updateDoc(doc(ctx(), 'ownerDocs', ID), { title: 'hack', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(ctx(), 'ownerDocs', ID)));
  });
}
test('forged createdAt on create is refused', async () => { await assertFails(setDoc(doc(owner(), 'ownerDocs', ID), D({ createdAt: new Date(1700000000000) }))); });
test('forged updatedAt on update is refused', async () => { await seed(); await assertFails(updateDoc(doc(owner(), 'ownerDocs', ID), { title: 'x', updatedAt: new Date(1700000000000) })); });
test('changing createdAt on update is refused', async () => { await seed(); await assertFails(updateDoc(doc(owner(), 'ownerDocs', ID), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() })); });
for (const [name, bad] of [['empty title', { title: '' }], ['121-character title', { title: 'x'.repeat(121) }], ['bad category', { category: 'admin' }], ['body over 50000', { body: 'x'.repeat(50001) }], ['unknown field', { extra: 'x' }], ['list as title', { title: ['x'] }], ['map as body', { body: { a: 1 } }]])
  test(`${name} is refused`, async () => { await assertFails(setDoc(doc(owner(), 'ownerDocs', ID), D(bad))); });
test('missing field is refused', async () => { const d = D(); delete d.category; await assertFails(setDoc(doc(owner(), 'ownerDocs', ID), d)); });
for (const bad of ['abc1234', 'a'.repeat(33), 'ABCD1234EF', 'abcd-1234ef'])
  test(`document ID ${JSON.stringify(bad)} is refused`, async () => { await assertFails(setDoc(doc(owner(), 'ownerDocs', bad), D())); });
test('50000-character body and 120-character title are accepted', async () => { await assertSucceeds(setDoc(doc(owner(), 'ownerDocs', ID), D({ body: 'x'.repeat(50000), title: 'x'.repeat(120) }))); });
