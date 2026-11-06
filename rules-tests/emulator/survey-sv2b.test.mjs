// CodeFlow 4.5.0 SV2b - REAL Firestore rules engine tests (Firebase Local Emulator Suite) for custom surveys: surveyTemplates, surveyForms, surveyAnswers.
// Run by GitHub Actions (.github/workflows/rules-emulator.yml) or locally:  cd rules-tests/emulator && npm install && npm test   (needs Java 17+)
// Uses a demo project only; it never touches your real Firebase project. The Python simulator (attack_cases.py section 8o, SV2b mutations, sv2b_replay.py) covers the same rules.
// Also the final check of two limits the simulator cannot know: the engine's cap on document reads per request and on expression depth for the per-slot checks.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

const OWNER_UID = '3p2YvH4NSVYAAfA0E6HC2kkyc5F3', K = 'Kq7Zr2Lm9Xc4Vb8Nt3Hy6Wd1Sf5Gj0Pa', DAY = 86400000;
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-survey-sv2b', firestore: { rules: readFileSync('../../firestore.rules.strict', 'utf8') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const google = (uid, email = 'x@example.com') => env.authenticatedContext(uid, { email, email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();
const owner = () => google(OWNER_UID, 'fredespinosa86.app@gmail.com');
const stranger = () => google('someoneelse123', 'stranger@gmail.com');
const visitorTok = () => env.authenticatedContext('m_abcDEF1234567890', { form: 'meeting', firebase: { sign_in_provider: 'custom' } }).firestore();
const pub = () => env.unauthenticatedContext().firestore();
const Q = (n, o = {}) => ({ id: 'q' + n, type: 'short', label: 'What did we do well?', required: false, options: [], ...o });
const QS6 = () => [Q(1, { type: 'stars', required: true }), Q(2, { type: 'long' }), Q(3, { type: 'choice', options: ['A', 'B', 'C', 'D', 'E', 'F'], required: true }), Q(4, { type: 'yesno', required: true }), Q(5), Q(6, { type: 'stars' })];
const tpl = (o = {}) => ({ title: 'Quarterly check-in', intro: 'Hi', questions: QS6(), updatedAt: serverTimestamp(), ...o });
const form = (o = {}) => ({ title: 'Quarterly check-in', intro: 'Hi', questions: QS6(), createdAt: serverTimestamp(), ...o });
const inviteData = (o = {}) => ({ surveyVersion: 'default-1', employerName: 'Ana Cruz', company: 'Acme', ownerName: 'Frederick', status: 'sent', createdAt: serverTimestamp(), expiresAt: new Date(Date.now() + 60 * DAY), ...o });
const seedInvite = async (key = K, o = {}) => env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'surveyInvites', key), { ...inviteData(), createdAt: new Date(Date.now() - DAY), expiresAt: new Date(Date.now() + 10 * DAY), ...o }); });
const seedForm = async (key = K, o = {}) => env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'surveyForms', key), { ...form(), createdAt: new Date(Date.now() - DAY), ...o }); });
const resp = (o = {}) => ({ rating: 5, comment: 'She was reliable, fast and kept me informed.', best: '', recommend: 'yes', videoUrl: '', displayName: 'Ana Cruz', displayRole: 'Founder', displayCompany: 'Acme', consentPublish: true, submittedAt: serverTimestamp(), ownerStatus: 'pending', ...o });
const ans = (o = {}) => ({ q1: 4, q2: 'More reports please', q3: 'F', q4: 'yes', q5: 'ok', q6: 5, submittedAt: serverTimestamp(), ...o });
const submit = (db, a = ans(), r = resp(), key = K) => { const b = writeBatch(db); b.set(doc(db, 'surveyResponses', key), r); if (a) b.set(doc(db, 'surveyAnswers', key), a); b.update(doc(db, 'surveyInvites', key), { status: 'submitted', submittedAt: serverTimestamp() }); return b.commit(); };

test('owner saves, updates, reads, lists and deletes a template with six questions (all types, six options)', async () => {
  const db = owner();
  await assertSucceeds(setDoc(doc(db, 'surveyTemplates', 'Tpl12345678abcd'), tpl())); await assertSucceeds(setDoc(doc(db, 'surveyTemplates', 'Tpl12345678abcd'), tpl({ title: 'Changed' })));
  await assertSucceeds(getDoc(doc(db, 'surveyTemplates', 'Tpl12345678abcd'))); await assertSucceeds(getDocs(collection(db, 'surveyTemplates'))); await assertSucceeds(deleteDoc(doc(db, 'surveyTemplates', 'Tpl12345678abcd')));
});
for (const [name, ctx] of [['public', pub], ['Google stranger', stranger], ['visitor token', visitorTok]]) {
  test(`${name} cannot touch templates, create or list forms, or read answers`, async () => {
    await seedInvite(); await seedForm(); const db = ctx();
    await assertFails(setDoc(doc(db, 'surveyTemplates', 'Tpl12345678abcd'), tpl())); await assertFails(getDocs(collection(db, 'surveyTemplates')));
    await assertFails(getDocs(collection(db, 'surveyForms'))); await assertFails(deleteDoc(doc(db, 'surveyForms', K))); await assertFails(getDoc(doc(db, 'surveyAnswers', K)));
    const b = writeBatch(db); b.set(doc(db, 'surveyInvites', 'Zz7Zr2Lm9Xc4Vb8Nt3Hy6Wd1Sf5Gj0Pa'), inviteData()); b.set(doc(db, 'surveyForms', 'Zz7Zr2Lm9Xc4Vb8Nt3Hy6Wd1Sf5Gj0Pa'), form()); await assertFails(b.commit());
  });
}
test('bad templates are refused: 0 or 7 questions, wrong ids, bad type, long label, bad options, forged time, extra field', async () => {
  const db = owner(), put = o => setDoc(doc(db, 'surveyTemplates', 'Tpl12345678abcd'), tpl(o));
  await assertFails(put({ questions: [] })); await assertFails(put({ questions: [...QS6(), Q(7)] })); await assertFails(put({ questions: [Q(2)] })); await assertFails(put({ questions: [Q(1, { type: 'bad' })] }));
  await assertFails(put({ questions: [Q(1, { label: 'x'.repeat(201) })] })); await assertFails(put({ questions: [Q(1, { label: '' })] })); await assertFails(put({ questions: [Q(1, { type: 'choice', options: ['A'] })] }));
  await assertFails(put({ questions: [Q(1, { type: 'choice', options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] })] })); await assertFails(put({ questions: [Q(1, { options: ['A'] })] })); await assertFails(put({ questions: [Q(1, { required: 'yes' })] }));
  await assertFails(put({ questions: [Q(1, { extra: 1 })] })); await assertFails(put({ title: '' })); await assertFails(put({ title: 'x'.repeat(81) })); await assertFails(put({ intro: 'x'.repeat(301) })); await assertFails(put({ updatedAt: new Date(Date.now() - 5000) })); await assertFails(put({ extra: 1 }));
});
test('owner creates an invite and its form copy together; the form alone, or beside a revoked invite, is refused; nobody edits a form', async () => {
  const db = owner(); const b = writeBatch(db); b.set(doc(db, 'surveyInvites', K), inviteData()); b.set(doc(db, 'surveyForms', K), form()); await assertSucceeds(b.commit());
  await assertFails(setDoc(doc(db, 'surveyForms', 'Zz7Zr2Lm9Xc4Vb8Nt3Hy6Wd1Sf5Gj0Pa'), form())); await assertFails(updateDoc(doc(db, 'surveyForms', K), { title: 'x' })); await assertSucceeds(deleteDoc(doc(db, 'surveyForms', K)));
});
test('a visitor reads the form by key while the invite is sent and open; not when submitted, revoked or expired; owner always', async () => {
  await seedInvite(); await seedForm(); await assertSucceeds(getDoc(doc(pub(), 'surveyForms', K))); await assertSucceeds(getDoc(doc(owner(), 'surveyForms', K)));
  for (const o of [{ status: 'submitted' }, { status: 'revoked' }, { expiresAt: new Date(Date.now() - 1000) }]) { await seedInvite(K, o); await assertFails(getDoc(doc(pub(), 'surveyForms', K))); await assertSucceeds(getDoc(doc(owner(), 'surveyForms', K))); }
});
test('a visitor submits a custom survey: invite flip + response + extra answers in one batch (six questions, all types)', async () => {
  await seedInvite(); await seedForm(); await assertSucceeds(submit(pub()));
});
test('the response for a custom survey without its extra answers is refused; extra answers for a default survey are refused', async () => {
  await seedInvite(); await seedForm(); await assertFails(submit(pub(), null));
  await env.clearFirestore(); await seedInvite(); await assertFails(submit(pub())); await assertSucceeds(submit(pub(), null));
});
test('extra answers are checked slot by slot against the copied questions', async () => {
  const cases = [{ q1: 0 }, { q1: 6 }, { q1: '4' }, { q1: 3.5 }, { q2: 'x'.repeat(701) }, { q3: 'G' }, { q3: '' }, { q4: 'maybe' }, { q5: 'x'.repeat(201) }, { q6: 7 }, { q7: 'x' }, { email: 'a@b.co' }, { submittedAt: new Date(Date.now() - 5000) }];
  for (const c of cases) { await env.clearFirestore(); await seedInvite(); await seedForm(); await assertFails(submit(pub(), ans(c))); }
  for (const miss of ['q1', 'q3', 'q4']) { await env.clearFirestore(); await seedInvite(); await seedForm(); const a = ans(); delete a[miss]; await assertFails(submit(pub(), a)); }
  await env.clearFirestore(); await seedInvite(); await seedForm(); const a = ans(); delete a.q2; delete a.q5; delete a.q6; await assertSucceeds(submit(pub(), a));
  await env.clearFirestore(); await seedInvite(); await seedForm(K, { questions: [Q(1, { type: 'stars', required: true })] }); await assertFails(submit(pub(), ans({ q1: 4 }))); await assertSucceeds(submit(pub(), { q1: 4, submittedAt: serverTimestamp() }));
});
test('an expired, revoked or used invite refuses the submission; the pause stops it; a second submission is refused', async () => {
  for (const o of [{ status: 'revoked' }, { status: 'submitted' }, { expiresAt: new Date(Date.now() - 1000) }]) { await env.clearFirestore(); await seedInvite(K, o); await seedForm(); await assertFails(submit(pub())); }
  await env.clearFirestore(); await seedInvite(); await seedForm(); await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'content', 'guard'), { pause: true }); }); await assertFails(submit(pub()));
  await env.clearFirestore(); await seedInvite(); await seedForm(); await assertSucceeds(submit(pub())); await assertFails(submit(pub()));
});
test('extra answers: only the owner reads or deletes; nobody edits them', async () => {
  await seedInvite(); await seedForm(); await submit(pub());
  await assertSucceeds(getDoc(doc(owner(), 'surveyAnswers', K))); await assertSucceeds(getDocs(collection(owner(), 'surveyAnswers')));
  for (const c of [pub(), stranger(), visitorTok()]) { await assertFails(getDoc(doc(c, 'surveyAnswers', K))); await assertFails(deleteDoc(doc(c, 'surveyAnswers', K))); await assertFails(updateDoc(doc(c, 'surveyAnswers', K), { q1: 1 })); }
  await assertFails(updateDoc(doc(owner(), 'surveyAnswers', K), { q1: 1 })); await assertSucceeds(deleteDoc(doc(owner(), 'surveyAnswers', K)));
});
