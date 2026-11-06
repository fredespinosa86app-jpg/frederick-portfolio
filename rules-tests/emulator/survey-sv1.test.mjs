// CodeFlow 4.5.0 SV1 - REAL Firestore rules engine tests (Firebase Local Emulator Suite) for the employer survey (surveyInvites, surveyInvitesPrivate, surveyResponses).
// Run by GitHub Actions (.github/workflows/rules-emulator.yml) or locally:  cd rules-tests/emulator && npm install && npm test   (needs Java 17+)
// Uses a demo project only; it never touches your real Firebase project.
// STATUS WHEN THIS FILE WAS BUILT: written but NOT executed (the build environment cannot download the emulator). The Python rules simulator (attack_cases.py section 8m, 65 mutations) covers the same cases.
// The submit is ONE batch (response create + invite update) exactly like scripts/survey-page.js.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';

const OWNER_UID = '3p2YvH4NSVYAAfA0E6HC2kkyc5F3', K = 'Kq7Zr2Lm9Xc4Vb8Nt3Hy6Wd1Sf5Gj0Pa', K2 = 'Zz7Zr2Lm9Xc4Vb8Nt3Hy6Wd1Sf5Gj0Pa', DAY = 86400000;
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-survey-sv1', firestore: { rules: readFileSync('../../firestore.rules.strict', 'utf8') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const google = (uid, email = 'x@example.com') => env.authenticatedContext(uid, { email, email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();
const owner = () => google(OWNER_UID, 'fredespinosa86.app@gmail.com');
const stranger = () => google('someoneelse123', 'stranger@gmail.com');
const visitorTok = () => env.authenticatedContext('m_abcDEF1234567890', { form: 'meeting', firebase: { sign_in_provider: 'custom' } }).firestore();
const pub = () => env.unauthenticatedContext().firestore();
const inviteData = (o = {}) => ({ surveyVersion: 'default-1', employerName: 'Ana Cruz', company: 'Acme', ownerName: 'Frederick', status: 'sent', createdAt: serverTimestamp(), expiresAt: new Date(Date.now() + 60 * DAY), ...o });
const seedInvite = async (key = K, o = {}) => env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'surveyInvites', key), { ...inviteData(), createdAt: new Date(Date.now() - DAY), expiresAt: new Date(Date.now() + 10 * DAY), ...o }); });
const seedResp = async (key = K, o = {}) => env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'surveyResponses', key), { ...resp(), submittedAt: new Date(Date.now() - 1000), ...o }); });
const resp = (o = {}) => ({ rating: 5, comment: 'She was reliable, fast and kept me informed.', best: '', recommend: 'yes', videoUrl: '', displayName: 'Ana Cruz', displayRole: 'Founder', displayCompany: 'Acme', consentPublish: true, submittedAt: serverTimestamp(), ownerStatus: 'pending', ...o });
const submit = (db, r = resp(), key = K, flip = {}) => { const b = writeBatch(db); b.set(doc(db, 'surveyResponses', key), r); b.update(doc(db, 'surveyInvites', key), { status: 'submitted', submittedAt: serverTimestamp(), ...flip }); return b.commit(); };

test('owner creates an invite and its private record', async () => { await assertSucceeds(setDoc(doc(owner(), 'surveyInvites', K), inviteData())); await assertSucceeds(setDoc(doc(owner(), 'surveyInvitesPrivate', K), { employerEmail: 'a@b.co', clientId: '', createdAt: serverTimestamp() })); });
for (const [name, ctx] of [['public', pub], ['Google stranger', stranger], ['visitor token', visitorTok]]) {
  test(`${name} cannot create, delete or list invites, nor touch private data`, async () => {
    await seedInvite();
    await assertFails(setDoc(doc(ctx(), 'surveyInvites', K2), inviteData())); await assertFails(deleteDoc(doc(ctx(), 'surveyInvites', K))); await assertFails(getDocs(collection(ctx(), 'surveyInvites')));
    await assertFails(getDoc(doc(ctx(), 'surveyInvitesPrivate', K))); await assertFails(setDoc(doc(ctx(), 'surveyInvitesPrivate', K), { employerEmail: 'a@b.co' })); await assertFails(getDocs(collection(ctx(), 'surveyInvitesPrivate')));
  });
}
test('a visitor can read ONE sent, unexpired invite by its key, never list', async () => { await seedInvite(); await assertSucceeds(getDoc(doc(pub(), 'surveyInvites', K))); await assertFails(getDocs(collection(pub(), 'surveyInvites'))); });
test('a visitor cannot read a submitted, revoked or expired invite', async () => {
  for (const o of [{ status: 'submitted' }, { status: 'revoked' }, { expiresAt: new Date(Date.now() - 1000) }]) { await env.clearFirestore(); await seedInvite(K, o); await assertFails(getDoc(doc(pub(), 'surveyInvites', K))); }
});
test('a missing invite and a bad key shape cannot be read', async () => { await assertFails(getDoc(doc(pub(), 'surveyInvites', K))); await seedInvite('short'); await assertFails(getDoc(doc(pub(), 'surveyInvites', 'short'))); });
for (const [name, bad] of [['submitted status', { status: 'submitted' }], ['forged createdAt', { createdAt: new Date(1700000000000) }], ['expiry in the past', { expiresAt: new Date(Date.now() - 1000) }], ['expiry 90 days away', { expiresAt: new Date(Date.now() + 90 * DAY) }], ['extra field', { clientId: 'ACME-1' }], ['employer e-mail in the public record', { employerEmail: 'a@b.co' }], ['empty employer name', { employerName: '' }], ['101-char employer name', { employerName: 'a'.repeat(101) }], ['other survey version', { surveyVersion: 'custom-9' }]])
  test(`invite create with ${name} is refused`, async () => { await assertFails(setDoc(doc(owner(), 'surveyInvites', K), inviteData(bad))); });
test('invite create with a key that is not 32 letters/digits is refused', async () => { for (const k of ['short', K + 'x', K.slice(0, 31) + '-']) await assertFails(setDoc(doc(owner(), 'surveyInvites', k), inviteData())); });

test('SUBMIT: the batch (response + invite flip) succeeds once', async () => { await seedInvite(); await assertSucceeds(submit(pub())); });
test('SUBMIT by a visitor token or any signed-in stranger also works (the key is the credential)', async () => { await seedInvite(); await assertSucceeds(submit(stranger())); });
test('REPLAY: a second submit with the same key is refused', async () => { await seedInvite(); await assertSucceeds(submit(pub())); await assertFails(submit(pub())); });
test('the response alone, or the flip alone, is refused', async () => {
  await seedInvite(); await assertFails(setDoc(doc(pub(), 'surveyResponses', K), resp()));
  await assertFails(updateDoc(doc(pub(), 'surveyInvites', K), { status: 'submitted', submittedAt: serverTimestamp() }));
});
test('an expired, revoked or already-submitted invite cannot be answered', async () => {
  for (const o of [{ expiresAt: new Date(Date.now() - 1000) }, { status: 'revoked' }, { status: 'submitted' }]) { await env.clearFirestore(); await seedInvite(K, o); await assertFails(submit(pub())); }
});
test('a key without an invite cannot be answered', async () => { const b = writeBatch(pub()); b.set(doc(pub(), 'surveyResponses', K2), resp()); await assertFails(b.commit()); });
test('the flip cannot change the name, company, owner name, version or dates', async () => {
  for (const f of [{ employerName: 'Hacker' }, { company: 'X' }, { ownerName: 'Y' }, { surveyVersion: 'x' }, { expiresAt: new Date(Date.now() + 90 * DAY) }, { status: 'approved' }, { status: 'sent' }, { extra: 1 }]) { await env.clearFirestore(); await seedInvite(); await assertFails(submit(pub(), resp(), K, f)); }
});
for (const [name, bad] of [['rating 0', { rating: 0 }], ['rating 6', { rating: 6 }], ['rating 2.5', { rating: 2.5 }], ['rating as text', { rating: '5' }], ['comment of 5 characters', { comment: 'short' }], ['comment of 701 characters', { comment: 'c'.repeat(701) }], ['best of 501 characters', { best: 'b'.repeat(501) }], ['recommend maybe', { recommend: 'maybe' }],
  ['video on another host', { videoUrl: 'https://evil.example/x' }], ['http video', { videoUrl: 'http://youtu.be/dQw4w9WgXcQ' }], ['look-alike video host', { videoUrl: 'https://youtube.com.evil.com/x' }], ['empty display name', { displayName: '' }], ['81-char display name', { displayName: 'n'.repeat(81) }],
  ['consent false', { consentPublish: false }], ['consent as text', { consentPublish: 'true' }], ['owner status approved', { ownerStatus: 'approved' }], ['forged submittedAt', { submittedAt: new Date(1700000000000) }], ['extra field', { isAdmin: true }], ['decision fields', { decidedAt: serverTimestamp(), testimonialId: 'sv_abcd' }]])
  test(`response with ${name} is refused`, async () => { await seedInvite(); await assertFails(submit(pub(), resp(bad))); });
test('video links from YouTube, Loom and Drive, and an empty link, are accepted', async () => {
  for (const v of ['', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://www.loom.com/share/0123456789abcdef', 'https://drive.google.com/file/d/1AbC/view']) { await env.clearFirestore(); await seedInvite(); await assertSucceeds(submit(pub(), resp({ videoUrl: v }))); }
});
test('the emergency pause stops submissions', async () => { await seedInvite(); await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'content', 'guard'), { pause: true }); }); await assertFails(submit(pub())); });

for (const [name, ctx] of [['public', pub], ['Google stranger', stranger], ['visitor token', visitorTok]]) {
  test(`${name} cannot read, list, update or delete responses`, async () => {
    await seedResp(); await assertFails(getDoc(doc(ctx(), 'surveyResponses', K))); await assertFails(getDocs(collection(ctx(), 'surveyResponses')));
    await assertFails(updateDoc(doc(ctx(), 'surveyResponses', K), { ownerStatus: 'approved', decidedAt: serverTimestamp(), testimonialId: 'sv_abcd' })); await assertFails(deleteDoc(doc(ctx(), 'surveyResponses', K)));
  });
}
test('owner reads and lists responses, revokes a sent invite, deletes', async () => {
  await seedInvite(); await seedResp(K2); await assertSucceeds(getDoc(doc(owner(), 'surveyResponses', K2))); await assertSucceeds(getDocs(collection(owner(), 'surveyResponses'))); await assertSucceeds(getDocs(collection(owner(), 'surveyInvites'))); await assertSucceeds(getDocs(collection(owner(), 'surveyInvitesPrivate')));
  await assertSucceeds(updateDoc(doc(owner(), 'surveyInvites', K), { status: 'revoked' })); await assertSucceeds(deleteDoc(doc(owner(), 'surveyResponses', K2)));
});
test('owner cannot revoke a submitted invite, extend a sent one or change its name', async () => {
  await seedInvite(K, { status: 'submitted' }); await assertFails(updateDoc(doc(owner(), 'surveyInvites', K), { status: 'revoked' }));
  await env.clearFirestore(); await seedInvite(); await assertFails(updateDoc(doc(owner(), 'surveyInvites', K), { expiresAt: new Date(Date.now() + 99 * DAY) })); await assertFails(updateDoc(doc(owner(), 'surveyInvites', K), { status: 'revoked', employerName: 'Z' }));
});
test('owner decides once: approve with a testimonial id, reject without', async () => {
  await seedResp(K); await assertSucceeds(updateDoc(doc(owner(), 'surveyResponses', K), { ownerStatus: 'approved', decidedAt: serverTimestamp(), testimonialId: 'sv_abcd1234' }));
  await seedResp(K2); await assertSucceeds(updateDoc(doc(owner(), 'surveyResponses', K2), { ownerStatus: 'rejected', decidedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(owner(), 'surveyResponses', K), { ownerStatus: 'rejected', decidedAt: serverTimestamp() }));
});
test('owner decision cannot edit the answer, forge the time, or use a bad id', async () => {
  await seedResp();
  for (const f of [{ comment: 'Edited by owner, text here' }, { rating: 1 }, { consentPublish: false }, { displayName: 'Other' }, { decidedAt: new Date(1700000000000) }, { testimonialId: 'ab' }, { testimonialId: 'a b c d' }, { ownerStatus: 'pending' }, { ownerStatus: 'deleted' }])
    await assertFails(updateDoc(doc(owner(), 'surveyResponses', K), { ownerStatus: 'approved', decidedAt: serverTimestamp(), testimonialId: 'sv_abcd1234', ...f }));
  await assertFails(updateDoc(doc(owner(), 'surveyResponses', K), { ownerStatus: 'rejected', decidedAt: serverTimestamp(), testimonialId: 'sv_abcd1234' }));
});
test('survey data cannot be written through a similar name, and content/testimonials is owner only', async () => {
  await assertFails(setDoc(doc(pub(), 'surveyInvite', K), inviteData())); await assertFails(setDoc(doc(pub(), 'content', 'testimonials'), { enabled: true, items: [] })); await assertFails(updateDoc(doc(stranger(), 'content', 'testimonials'), { enabled: true }));
});
// --- added after the generated mutation run (mutations_sv1_gen.py): gaps in the first version of these tests
test('a video link of exactly 300 characters is accepted, 301 refused', async () => {
  const link = n => 'https://drive.google.com/' + 'a'.repeat(n - 'https://drive.google.com/'.length);
  await seedInvite(); await assertSucceeds(submit(pub(), resp({ videoUrl: link(300) })));
  await env.clearFirestore(); await seedInvite(); await assertFails(submit(pub(), resp({ videoUrl: link(301) })));
});
test('text fields must be text: a list or a map is refused in the invite and in the answer', async () => {
  for (const f of ['employerName', 'company', 'ownerName']) for (const v of [['x', 'x', 'x', 'x', 'x'], { a: 1 }, true]) await assertFails(setDoc(doc(owner(), 'surveyInvites', K), inviteData({ [f]: v })));
  for (const f of ['comment', 'best', 'displayName', 'displayRole', 'displayCompany']) for (const v of [Array(12).fill('x'), { a: 1 }, true]) { await env.clearFirestore(); await seedInvite(); await assertFails(submit(pub(), resp({ [f]: v }))); }
});
test('the owner revoke freezes every other field', async () => {
  for (const c of [{ surveyVersion: 'x' }, { employerName: 'Z' }, { company: 'Z' }, { ownerName: 'Z' }, { createdAt: new Date(1700000000000) }, { expiresAt: new Date(Date.now() + 99 * DAY) }, { submittedAt: new Date() }]) { await env.clearFirestore(); await seedInvite(); await assertFails(updateDoc(doc(owner(), 'surveyInvites', K), { status: 'revoked', ...c })); }
});
test('the submit flip is refused while a response already exists for the key', async () => { await seedInvite(); await seedResp(); await assertFails(updateDoc(doc(pub(), 'surveyInvites', K), { status: 'submitted', submittedAt: serverTimestamp() })); });
test('the owner decision freezes every answer field', async () => {
  for (const c of [{ best: 'changed' }, { recommend: 'no' }, { displayRole: 'CEO' }, { displayCompany: 'Other' }, { comment: 'Changed by the owner' }, { videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }, { displayName: 'Z' }, { rating: 1 }, { consentPublish: false }, { submittedAt: new Date(1700000000000) }]) {
    await env.clearFirestore(); await seedResp(); await assertFails(updateDoc(doc(owner(), 'surveyResponses', K), { ownerStatus: 'approved', decidedAt: serverTimestamp(), testimonialId: 'sv_abcd1234', ...c }));
  }
});
