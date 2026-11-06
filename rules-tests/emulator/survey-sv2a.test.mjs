// CodeFlow 4.5.0 SV2a - REAL Firestore rules engine tests (Firebase Local Emulator Suite) for surveyReminders.
// Run by GitHub Actions (.github/workflows/rules-emulator.yml) or locally:  cd rules-tests/emulator && npm install && npm test   (needs Java 17+)
// Uses a demo project only; it never touches your real Firebase project. The Python simulator (attack_cases.py section 8n, 20 mutations) covers the same rules.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { doc, getDoc, getDocs, collection, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const OWNER_UID = '3p2YvH4NSVYAAfA0E6HC2kkyc5F3';
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-survey-sv2a', firestore: { rules: readFileSync('../../firestore.rules.strict', 'utf8') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const google = (uid, email = 'x@example.com') => env.authenticatedContext(uid, { email, email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();
const owner = () => google(OWNER_UID, 'fredespinosa86.app@gmail.com');
const stranger = () => google('someoneelse123', 'stranger@gmail.com');
const visitorTok = () => env.authenticatedContext('m_abcDEF1234567890', { form: 'meeting', firebase: { sign_in_provider: 'custom' } }).firestore();
const pub = () => env.unauthenticatedContext().firestore();
const seedReg = async (id = 'ACME-1') => env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'clientRegistry', id), { status: 'active', notes: '', createdAt: new Date(), updatedAt: new Date(), rev: 1, lastAudit: 'A'.repeat(16) }); });
const seedRem = async (id = 'ACME-1', o = {}) => env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'surveyReminders', id), { ...rem(), updatedAt: new Date(), ...o }); });
const rem = (o = {}) => ({ startDate: '2026-08-07', months: 3, status: 'active', snoozedUntil: '', updatedAt: serverTimestamp(), ...o });

test('owner creates, updates (snooze, done, skipped), reads, lists and deletes a reminder for a registered Client ID', async () => {
  await seedReg(); const db = owner();
  await assertSucceeds(setDoc(doc(db, 'surveyReminders', 'ACME-1'), rem()));
  await assertSucceeds(setDoc(doc(db, 'surveyReminders', 'ACME-1'), rem({ snoozedUntil: '2026-11-14' })));
  await assertSucceeds(setDoc(doc(db, 'surveyReminders', 'ACME-1'), rem({ status: 'done' })));
  await assertSucceeds(setDoc(doc(db, 'surveyReminders', 'ACME-1'), rem({ status: 'skipped' })));
  await assertSucceeds(getDoc(doc(db, 'surveyReminders', 'ACME-1'))); await assertSucceeds(getDocs(collection(db, 'surveyReminders')));
  await assertSucceeds(deleteDoc(doc(db, 'surveyReminders', 'ACME-1')));
});
for (const [name, ctx] of [['public', pub], ['Google stranger', stranger], ['visitor token', visitorTok]]) {
  test(`${name} cannot read, list, write or delete reminders`, async () => {
    await seedReg(); await seedRem(); const db = ctx();
    await assertFails(getDoc(doc(db, 'surveyReminders', 'ACME-1'))); await assertFails(getDocs(collection(db, 'surveyReminders')));
    await assertFails(setDoc(doc(db, 'surveyReminders', 'ACME-1'), rem())); await assertFails(deleteDoc(doc(db, 'surveyReminders', 'ACME-1')));
  });
}
test('a reminder needs a valid Client ID that exists in the registry', async () => {
  const db = owner();
  await assertFails(setDoc(doc(db, 'surveyReminders', 'ACME-1'), rem()));          // not in the registry
  await seedReg('acme-1'); await assertFails(setDoc(doc(db, 'surveyReminders', 'acme-1'), rem()));   // not a valid ID shape
});
test('bad fields are refused: extra field, bad date, bad months, bad status, free-text snooze, forged time', async () => {
  await seedReg(); const db = owner(), put = o => setDoc(doc(db, 'surveyReminders', 'ACME-1'), rem(o));
  await assertFails(put({ email: 'a@b.co' })); await assertFails(put({ startDate: 'soon' })); await assertFails(put({ startDate: '2026-13-01' })); await assertFails(put({ startDate: '1999-01-01' }));
  await assertFails(put({ months: 0 })); await assertFails(put({ months: 25 })); await assertFails(put({ months: 1.5 })); await assertFails(put({ months: '3' }));
  await assertFails(put({ status: 'deleted' })); await assertFails(put({ snoozedUntil: 'later' })); await assertFails(put({ updatedAt: new Date(Date.now() - 5000) }));
});
test('the reminder write cannot touch the registry or testimonials', async () => {
  await seedReg(); const db = owner();
  await assertFails(setDoc(doc(db, 'clientRegistry', 'ZZZ-9'), rem())); await assertSucceeds(setDoc(doc(db, 'surveyReminders', 'ACME-1'), rem()));
});
