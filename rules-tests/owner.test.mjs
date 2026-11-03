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

// ---- Security S2: visitor write rules (not executed in the build environment) ----
import { serverTimestamp } from 'firebase/firestore';
const visitor = () => env.unauthenticatedContext().firestore();
const visit = (sid, type = 'view', path = 'home') => ({ vid: 'a'.repeat(24), sid, type, path, ref: '', device: 'desktop', browser: 'Chrome', createdAt: serverTimestamp() });
const SID = '0123456789abcdef01234567';
test('visitor can create a visit with the id session_type_page', async () => { await assertSucceeds(setDoc(doc(visitor(), 'visits', `${SID}_view_home`), visit(SID))); });
test('visit with a mismatching id is refused', async () => { await assertFails(setDoc(doc(visitor(), 'visits', 'whatever'), visit(SID))); });
test('same visit cannot be written twice (update refused)', async () => { await assertFails(setDoc(doc(visitor(), 'visits', `${SID}_view_home`), visit(SID))); });
test('visit with non-hex session is refused', async () => { const s = 'Z'.repeat(24); await assertFails(setDoc(doc(visitor(), 'visits', `${s}_view_home`), visit(s))); });
const meeting = (o = {}) => ({ name: 'A', email: 'a@b.co', company: '', date: '2030-01-07', time: '10:00', tz: 'Asia/Manila', platform: 'Zoom', message: 'hi', status: 'new', createdAt: serverTimestamp(), ...o });
test('valid meeting request is accepted', async () => { await assertSucceeds(setDoc(doc(visitor(), 'meetingRequests', 'm1'), meeting())); });
test('bad e-mail / date / time / tz are refused', async () => {
  for (const o of [{ email: 'a@b' }, { date: '2030-1-7' }, { time: '9:00' }, { tz: 'Asia/Manila; x' }]) await assertFails(setDoc(doc(visitor(), 'meetingRequests', 'bad'), meeting(o)));
});
test('pause switch (content/guard.pause) refuses public writes', async () => {
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'content', 'guard'), { pause: true }); });
  await assertFails(setDoc(doc(visitor(), 'meetingRequests', 'm2'), meeting()));
  await assertFails(setDoc(doc(visitor(), 'visits', `${SID.replace(/0/g, '1')}_view_home`), visit(SID.replace(/0/g, '1'))));
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'content', 'guard'), { pause: false }); });
});
