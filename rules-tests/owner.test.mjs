// Run: npm install && npm test   (needs Java; uses the local Firestore emulator, never your real project)
// NOT executed in the environment that built this ZIP.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { doc, getDoc, setDoc } from 'firebase/firestore';
const OWNER = 'fredespinosa86.app@gmail.com';
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-portfolio', firestore: { rules: readFileSync('../firestore.rules', 'utf8') } }); });
after(async () => { await env.cleanup(); });
const google = (uid, email, verified = true) => env.authenticatedContext(uid, { email, email_verified: verified, firebase: { sign_in_provider: 'google.com' } }).firestore();
test('owner (google, verified, owner e-mail) can write settings', async () => { await assertSucceeds(setDoc(doc(google('o1', OWNER), 'settings', 'site'), { a: 1 })); });
test('stranger with Google cannot write settings', async () => { await assertFails(setDoc(doc(google('x', 'x@example.com'), 'settings', 'site'), { a: 1 })); });
test('owner e-mail but unverified is refused', async () => { await assertFails(setDoc(doc(google('o1', OWNER, false), 'settings', 'site'), { a: 1 })); });
test('owner e-mail through another provider is refused', async () => { const db = env.authenticatedContext('o1', { email: OWNER, email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore(); await assertFails(setDoc(doc(db, 'settings', 'site'), { a: 1 })); });
test('signed-out visitor can read settings but not write', async () => { const db = env.unauthenticatedContext().firestore(); await assertSucceeds(getDoc(doc(db, 'settings', 'site'))); await assertFails(setDoc(doc(db, 'settings', 'site'), { a: 1 })); });
test('private collections are closed to visitors and strangers', async () => { await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'ownerPrivate', 'config'))); await assertFails(getDoc(doc(google('x', 'x@example.com'), 'clients', 'c1'))); });
test('owner can read private config', async () => { await assertSucceeds(getDoc(doc(google('o1', OWNER), 'ownerPrivate', 'config'))); });
