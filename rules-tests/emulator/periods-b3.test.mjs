// CodeFlow 4.5.0 B3 - REAL Firestore rules engine tests for skipping a billing period (periodSkips).
// Run by GitHub Actions (.github/workflows/rules-emulator.yml) or locally:  cd rules-tests/emulator && npm install && npm test   (needs Java 17+)
// Own demo project name. It never touches your real Firebase project.
// STATUS WHEN THIS FILE WAS BUILT: written but NOT executed (the build environment cannot download the emulator).
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const OWNER_UID = '3p2YvH4NSVYAAfA0E6HC2kkyc5F3';
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-periods3', firestore: { rules: readFileSync('../../firestore.rules.strict', 'utf8') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const google = (uid, extra = {}) => env.authenticatedContext(uid, { email: 'x@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' }, ...extra }).firestore();
const owner = () => google(OWNER_UID), stranger = () => google('someoneelse123');
const seed = (path, data) => env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), ...path.split('/')), data); });
const A = n => n.padEnd(16, 'a');
const dt = () => new Date(), T = serverTimestamp;
const SID = 'CL-001__20261001__20261031';
const PRO = (o = {}) => ({ currency: 'USD', exp: 2, rateMinor: 2500, arrangement: 'hourly', schedKind: 'monthly', weekStart: 'mon', anchors: '', genTime: '09:00', tz: 'Asia/Manila', dueKind: 'afterSend', dueDays: 14, dueDate: '', rev: 1, createdAt: dt(), updatedAt: dt(), lastAudit: A('p1'), ...o });
const SK = (o = {}) => ({ clientId: 'CL-001', periodStart: '20261001', periodEnd: '20261031', reason: 'Client paused work', actor: OWNER_UID, createdAt: T(), ...o });
const seedBase = async (o = {}) => {
  if (o.registry !== false) await seed('clientRegistry/CL-001', { status: o.registry || 'active', notes: '', createdAt: dt(), updatedAt: dt(), rev: 1, lastAudit: A('r1') });
  if (o.profile !== false) await seed('billingProfiles/CL-001', PRO(o.profile || {}));
};
const skip = (db, o = {}, id = SID) => setDoc(doc(db, 'periodSkips', id), SK(o));

test('the owner skips a period of an active hourly client', async () => { await seedBase(); await assertSucceeds(skip(owner())); });
test('boundary: reason of 3 and of 200 characters, a one-day period', async () => {
  await seedBase(); const db = owner();
  await assertSucceeds(skip(db, { reason: 'abc' }));
  await assertSucceeds(skip(db, { reason: 'x'.repeat(200), periodStart: '20261101', periodEnd: '20261101' }, 'CL-001__20261101__20261101'));
});
test('not the owner, or not signed in, cannot skip', async () => {
  await seedBase(); await assertFails(skip(stranger())); await assertFails(skip(env.unauthenticatedContext().firestore()));
});
test('the record ID must match the client and both dates', async () => {
  await seedBase(); const db = owner();
  for (const id of ['CL-001__20261001__20261030', 'CL-001__20261002__20261031', 'CL-002__20261001__20261031', 'anything']) await assertFails(skip(db, {}, id));
});
test('client not registered, archived, without a billing profile, or on a monthly arrangement', async () => {
  for (const o of [{ registry: false }, { registry: 'archived' }, { profile: false }, { profile: { arrangement: 'monthly' } }]) { await env.clearFirestore(); await seedBase(o); await assertFails(skip(owner())); }
});
test('extra or missing fields are refused', async () => {
  await seedBase(); const db = owner();
  await assertFails(skip(db, { extra: 1 }));
  for (const k of ['reason', 'actor', 'periodEnd', 'createdAt']) { const d = SK(); delete d[k]; await assertFails(setDoc(doc(db, 'periodSkips', SID), d)); }
});
test('reason too short, too long, or not text', async () => {
  await seedBase(); const db = owner();
  for (const r of ['ab', '', 'x'.repeat(201), 5]) await assertFails(skip(db, { reason: r }));
});
test('a signed-in stranger who writes their own ID as the actor is refused; so are a period end that is not 8 digits and a list as the reason', async () => {
  await seedBase(); await assertFails(setDoc(doc(stranger(), 'periodSkips', SID), SK({ actor: 'someoneelse123' })));
  await assertFails(skip(owner(), { periodEnd: 'abcdefgh' }, 'CL-001__20261001__abcdefgh')); await assertFails(skip(owner(), { periodEnd: '202610319' }, 'CL-001__20261001__202610319'));
  await assertFails(skip(owner(), { reason: ['a', 'b', 'c'] }));
});
test('actor must be the signed-in owner and the time must be the server time', async () => {
  await seedBase(); const db = owner();
  await assertFails(skip(db, { actor: 'someoneelse123' })); await assertFails(skip(db, { createdAt: new Date(Date.now() - 1000) }));
});
test('dates must be YYYYMMDD and the end must not be before the start', async () => {
  await seedBase(); const db = owner();
  await assertFails(skip(db, { periodStart: '2026-10-01' }, 'CL-001__2026-10-01__20261031'));
  await assertFails(skip(db, { periodStart: '20261031', periodEnd: '20261001' }, 'CL-001__20261031__20261001'));
  await assertFails(skip(db, { periodStart: 20261001 }));
});
test('a skip cannot be changed, removed or recorded twice', async () => {
  await seedBase(); const db = owner(); await assertSucceeds(skip(db));
  await assertFails(updateDoc(doc(db, 'periodSkips', SID), { reason: 'Changed my mind' })); await assertFails(deleteDoc(doc(db, 'periodSkips', SID))); await assertFails(skip(db, { reason: 'Again please' }));
  const s = (await getDoc(doc(db, 'periodSkips', SID))).data(); if (s.reason !== 'Client paused work') throw new Error('skip was changed');
});
test('only the owner can read skips', async () => {
  await seedBase(); await assertSucceeds(skip(owner()));
  await assertSucceeds(getDoc(doc(owner(), 'periodSkips', SID))); await assertFails(getDoc(doc(stranger(), 'periodSkips', SID))); await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'periodSkips', SID)));
});
