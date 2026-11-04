// CodeFlow 4.5.0 B1 - REAL Firestore rules engine tests for billing profiles, billable hours (state machine, adjustments), their audit records and the migration mapping.
// Run by GitHub Actions (.github/workflows/rules-emulator.yml) or locally:  cd rules-tests/emulator && npm install && npm test   (needs Java 17+)
// Own demo project name. It never touches your real Firebase project.
// STATUS WHEN THIS FILE WAS BUILT: written but NOT executed (the build environment cannot download the emulator).
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { doc, getDoc, getDocs, collection, setDoc, deleteDoc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

const OWNER_UID = '3p2YvH4NSVYAAfA0E6HC2kkyc5F3';
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-billing1', firestore: { rules: readFileSync('../../firestore.rules.strict', 'utf8') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const google = (uid, extra = {}) => env.authenticatedContext(uid, { email: 'x@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' }, ...extra }).firestore();
const owner = () => google(OWNER_UID), stranger = () => google('someoneelse123');
const seed = (path, data) => env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), ...path.split('/')), data); });
const A = n => n.padEnd(16, 'a');
const T = serverTimestamp;
const REG = (o = {}) => ({ status: 'active', notes: '', createdAt: T(), updatedAt: T(), rev: 1, lastAudit: A('r1'), ...o });
const PRO = (o = {}) => ({ currency: 'USD', exp: 2, rateMinor: 2500, arrangement: 'hourly', schedKind: 'monthly', weekStart: 'mon', anchors: '', genTime: '09:00', tz: 'Asia/Manila', dueKind: 'afterSend', dueDays: 14, dueDate: '', rev: 1, createdAt: T(), updatedAt: T(), lastAudit: A('p1'), ...o });
const PAU = (o = {}) => ({ clientId: 'CL-001', action: 'create', rev: 1, currency: 'USD', rateMinor: 2500, arrangement: 'hourly', summary: 'Profile created', reason: '', actor: OWNER_UID, createdAt: T(), ...o });
const EID = 'CL-001__20261101__20261115__01', EID2 = 'CL-001__20261101__20261115__02';
const ENT = (o = {}) => ({ clientId: 'CL-001', periodStart: '20261101', periodEnd: '20261115', seq: '01', submittedMinutes: 480, approvedMinutes: null, status: 'DRAFT', note: '', supersedes: '', supersededBy: '', approvedAt: null, approverUid: '', relatedInvoiceId: '', rev: 1, createdAt: T(), updatedAt: T(), lastAudit: A('e1'), ...o });
const EAU = (o = {}) => ({ entryId: EID, clientId: 'CL-001', action: 'create', fromStatus: '', toStatus: 'DRAFT', rev: 1, submittedMinutes: 480, approvedMinutes: null, reason: '', actor: OWNER_UID, createdAt: T(), ...o });
const MIG = (o = {}) => ({ clientId: 'CL-001', profileNew: true, registryNew: false, arrangement: 'hourly', by: OWNER_UID, createdAt: T(), ...o });
const LEG = 'oldClientDoc0000001';
const seedClient = async () => { await seed('clientRegistry/CL-001', { status: 'active', notes: '', createdAt: new Date(), updatedAt: new Date(), rev: 1, lastAudit: A('r1') }); };
const seedProfile = async () => { await seedClient(); await seed('billingProfiles/CL-001', { ...PRO(), createdAt: new Date(), updatedAt: new Date() }); };
const dt = () => new Date();
async function mkProfile(db, o = {}) { const b = writeBatch(db); b.set(doc(db, 'billingProfiles', 'CL-001'), PRO(o)); b.set(doc(db, 'billingProfileAudit', A('p1')), PAU()); await b.commit(); }
async function mkEntry(db, o = {}, id = EID, aid = A('e1'), au = {}) { const b = writeBatch(db); b.set(doc(db, 'billableEntries', id), ENT({ lastAudit: aid, ...o })); b.set(doc(db, 'billableEntryAudit', aid), EAU({ entryId: id, ...au })); await b.commit(); }
async function step(db, cur, patch, audit, aid) {
  const b = writeBatch(db); b.set(doc(db, 'billableEntries', EID), { ...cur, ...patch, updatedAt: T(), lastAudit: aid, rev: cur.rev + 1 }); b.set(doc(db, 'billableEntryAudit', aid), EAU({ rev: cur.rev + 1, ...audit })); await b.commit();
}
const getE = async (db, id = EID) => (await getDoc(doc(db, 'billableEntries', id))).data();
const plain = d => { const o = { ...d }; return o; };

test('a profile and its audit record are created together', async () => { await seedClient(); await assertSucceeds(mkProfile(owner())); });
test('a profile without its audit record is refused', async () => { await seedClient(); await assertFails(setDoc(doc(owner(), 'billingProfiles', 'CL-001'), PRO())); });
test('a profile for an unknown client is refused', async () => { await assertFails(mkProfile(owner())); });
test('a profile for an archived client is refused', async () => { await seed('clientRegistry/CL-001', { status: 'archived', notes: '', createdAt: dt(), updatedAt: dt(), rev: 2, lastAudit: A('r1') }); await assertFails(mkProfile(owner())); });
for (const [lab, o] of [['JPY with 2 decimals', { currency: 'JPY' }], ['rate above the limit', { rateMinor: 1000000001 }], ['negative rate', { rateMinor: -1 }], ['unknown schedule', { schedKind: 'yearly' }], ['personal data field', { name: 'Ann' }], ['revision 2 on create', { rev: 2 }], ['client-side time', { createdAt: new Date(0) }]])
  test(`profile refused: ${lab}`, async () => { await seedClient(); await assertFails(mkProfile(owner(), o)); });
test('a profile change needs revision +1 and a new audit record', async () => {
  await seedClient(); const db = owner(); await mkProfile(db);
  const cur = (await getDoc(doc(db, 'billingProfiles', 'CL-001'))).data();
  const b = writeBatch(db); b.set(doc(db, 'billingProfiles', 'CL-001'), { ...cur, rateMinor: 3000, rev: 2, updatedAt: T(), lastAudit: A('p2') }); b.set(doc(db, 'billingProfileAudit', A('p2')), PAU({ action: 'update', rev: 2, rateMinor: 3000, reason: 'New agreement' })); await assertSucceeds(b.commit());
  const c = writeBatch(db); c.set(doc(db, 'billingProfiles', 'CL-001'), { ...cur, rateMinor: 3500, rev: 2, updatedAt: T(), lastAudit: A('p3') }); c.set(doc(db, 'billingProfileAudit', A('p3')), PAU({ action: 'update', rev: 2, rateMinor: 3500, reason: 'Stale tab' })); await assertFails(c.commit());
});
test('nobody can delete a profile or edit/delete its audit record', async () => {
  await seedClient(); const db = owner(); await mkProfile(db);
  await assertFails(deleteDoc(doc(db, 'billingProfiles', 'CL-001'))); await assertFails(deleteDoc(doc(db, 'billingProfileAudit', A('p1')))); await assertFails(updateDoc(doc(db, 'billingProfileAudit', A('p1')), { summary: 'edited' }));
});
test('an audit record whose money fields differ from the profile is refused', async () => {
  await seedClient(); const db = owner(), b = writeBatch(db); b.set(doc(db, 'billingProfiles', 'CL-001'), PRO()); b.set(doc(db, 'billingProfileAudit', A('p1')), PAU({ rateMinor: 9999 })); await assertFails(b.commit());
});

test('a draft entry is created with its audit; the ID must match the fields', async () => { await seedProfile(); await assertSucceeds(mkEntry(owner())); });
test('an entry for a client with no billing profile is refused', async () => { await seedClient(); await assertFails(mkEntry(owner())); });
test('an entry whose ID does not match its fields is refused', async () => { await seedProfile(); await assertFails(mkEntry(owner(), {}, 'CL-001__20261101__20261115__09', A('e9'))); });
for (const [lab, o] of [['already approved', { status: 'APPROVED', approvedMinutes: 480, approvedAt: dt(), approverUid: OWNER_UID }], ['zero minutes', { submittedMinutes: 0 }], ['above the limit', { submittedMinutes: 133921 }], ['period reversed', { periodEnd: '20261031' }]])
  test(`entry refused: ${lab}`, async () => { await seedProfile(); await assertFails(mkEntry(owner(), o)); });
test('submit, reopen with a reason, submit again, approve (server time and your account)', async () => {
  await seedProfile(); const db = owner(); await mkEntry(db); let cur = await getE(db);
  await assertSucceeds(step(db, cur, { status: 'SUBMITTED' }, { action: 'submit', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, A('e2'))); cur = await getE(db);
  await assertSucceeds(step(db, cur, { status: 'DRAFT' }, { action: 'reopen', fromStatus: 'SUBMITTED', toStatus: 'DRAFT', reason: 'Hours were wrong' }, A('e3'))); cur = await getE(db);
  await assertSucceeds(step(db, cur, { status: 'SUBMITTED' }, { action: 'submit', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, A('e4'))); cur = await getE(db);
  await assertSucceeds(step(db, cur, { status: 'APPROVED', approvedMinutes: 470, approvedAt: T(), approverUid: OWNER_UID }, { action: 'approve', fromStatus: 'SUBMITTED', toStatus: 'APPROVED', approvedMinutes: 470 }, A('e5')));
});
test('reopen without a reason is refused', async () => {
  await seedProfile(); const db = owner(); await mkEntry(db); let cur = await getE(db);
  await step(db, cur, { status: 'SUBMITTED' }, { action: 'submit', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, A('e2')); cur = await getE(db);
  await assertFails(step(db, cur, { status: 'DRAFT' }, { action: 'reopen', fromStatus: 'SUBMITTED', toStatus: 'DRAFT', reason: 'x' }, A('e3')));
});
test('draft cannot jump to approved; approve with another approver or a client time is refused', async () => {
  await seedProfile(); const db = owner(); await mkEntry(db); let cur = await getE(db);
  await assertFails(step(db, cur, { status: 'APPROVED', approvedMinutes: 480, approvedAt: T(), approverUid: OWNER_UID }, { action: 'approve', fromStatus: 'DRAFT', toStatus: 'APPROVED', approvedMinutes: 480 }, A('e2')));
  await step(db, cur, { status: 'SUBMITTED' }, { action: 'submit', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, A('e3')); cur = await getE(db);
  await assertFails(step(db, cur, { status: 'APPROVED', approvedMinutes: 480, approvedAt: T(), approverUid: 'someoneelse123' }, { action: 'approve', fromStatus: 'SUBMITTED', toStatus: 'APPROVED', approvedMinutes: 480 }, A('e4')));
  await assertFails(step(db, cur, { status: 'APPROVED', approvedMinutes: 480, approvedAt: new Date(0), approverUid: OWNER_UID }, { action: 'approve', fromStatus: 'SUBMITTED', toStatus: 'APPROVED', approvedMinutes: 480 }, A('e5')));
});
async function approved(db) {
  await mkEntry(db); let cur = await getE(db);
  await step(db, cur, { status: 'SUBMITTED' }, { action: 'submit', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, A('e2')); cur = await getE(db);
  await step(db, cur, { status: 'APPROVED', approvedMinutes: 480, approvedAt: T(), approverUid: OWNER_UID }, { action: 'approve', fromStatus: 'SUBMITTED', toStatus: 'APPROVED', approvedMinutes: 480 }, A('e3')); return getE(db);
}
test('an approved entry is locked: no edit, no change of minutes, no reopen', async () => {
  await seedProfile(); const db = owner(); const cur = await approved(db);
  await assertFails(step(db, cur, { submittedMinutes: 500 }, { action: 'edit', fromStatus: 'APPROVED', toStatus: 'APPROVED', submittedMinutes: 500 }, A('e4')));
  await assertFails(step(db, cur, { approvedMinutes: 999 }, { action: 'approve', fromStatus: 'APPROVED', toStatus: 'APPROVED', approvedMinutes: 999 }, A('e5')));
  await assertFails(step(db, cur, { status: 'DRAFT', approvedMinutes: null, approvedAt: null, approverUid: '' }, { action: 'reopen', fromStatus: 'APPROVED', toStatus: 'DRAFT', reason: 'Please' }, A('e6')));
});
test('an adjustment is a NEW draft and the old entry becomes SUPERSEDED in the same batch', async () => {
  await seedProfile(); const db = owner(); const cur = await approved(db);
  const b = writeBatch(db);
  b.set(doc(db, 'billableEntries', EID2), ENT({ seq: '02', supersedes: EID, lastAudit: A('e5') })); b.set(doc(db, 'billableEntryAudit', A('e5')), EAU({ entryId: EID2, reason: 'Client sent a correction' }));
  b.set(doc(db, 'billableEntries', EID), { ...cur, status: 'SUPERSEDED', supersededBy: EID2, updatedAt: T(), lastAudit: A('e4'), rev: cur.rev + 1 });
  b.set(doc(db, 'billableEntryAudit', A('e4')), EAU({ action: 'supersede', fromStatus: 'APPROVED', toStatus: 'SUPERSEDED', rev: cur.rev + 1, approvedMinutes: 480, reason: 'Client sent a correction' }));
  await assertSucceeds(b.commit());
});
test('an adjustment without marking the old entry superseded is refused, and a lone supersede is refused', async () => {
  await seedProfile(); const db = owner(); const cur = await approved(db);
  const b = writeBatch(db); b.set(doc(db, 'billableEntries', EID2), ENT({ seq: '02', supersedes: EID, lastAudit: A('e5') })); b.set(doc(db, 'billableEntryAudit', A('e5')), EAU({ entryId: EID2, reason: 'Client sent a correction' })); await assertFails(b.commit());
  await assertFails(step(db, cur, { status: 'SUPERSEDED', supersededBy: EID2 }, { action: 'supersede', fromStatus: 'APPROVED', toStatus: 'SUPERSEDED', approvedMinutes: 480, reason: 'Client sent a correction' }, A('e6')));
});
test('nobody can delete an entry or edit/delete an entry audit record', async () => {
  await seedProfile(); const db = owner(); await mkEntry(db);
  await assertFails(deleteDoc(doc(db, 'billableEntries', EID))); await assertFails(deleteDoc(doc(db, 'billableEntryAudit', A('e1')))); await assertFails(updateDoc(doc(db, 'billableEntryAudit', A('e1')), { reason: 'edited' }));
});
test('two simultaneous steps from the same revision: exactly one wins', async () => {
  await seedProfile(); const db = owner(); await mkEntry(db); const cur = await getE(db);
  const r = await Promise.allSettled([step(db, cur, { status: 'SUBMITTED' }, { action: 'submit', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, A('f1')), step(db, cur, { note: 'x' }, { action: 'edit', fromStatus: 'DRAFT', toStatus: 'DRAFT' }, A('f2'))]);
  if (r.filter(x => x.status === 'fulfilled').length !== 1) throw new Error('expected exactly one winner');
});

async function migrate(db, { reg = false, lid = LEG, cid = 'CL-001', prof = {}, mig = {} } = {}) {
  const b = writeBatch(db);
  if (reg) { b.set(doc(db, 'clientRegistry', cid), REG({ lastAudit: A('r2') })); b.set(doc(db, 'clientRegistryAudit', A('r2')), { clientId: cid, action: 'create', prev: '', next: 'active', reason: '', rev: 1, actor: OWNER_UID, createdAt: T() }); }
  b.set(doc(db, 'billingProfiles', cid), PRO(prof)); b.set(doc(db, 'billingProfileAudit', A('p1')), PAU({ clientId: cid }));
  b.set(doc(db, 'billingMigration', lid), MIG({ clientId: cid, registryNew: reg, ...mig })); await b.commit();
}
test('migration to an existing Client ID: profile + audit + mapping in one batch', async () => { await seedClient(); await assertSucceeds(migrate(owner())); });
test('migration to a NEW Client ID: registry + registry audit + profile + audit + mapping in one batch', async () => { await assertSucceeds(migrate(owner(), { reg: true })); });
test('two old records cannot share one profile (second mapping is refused)', async () => { await seedClient(); await migrate(owner()); await assertFails(migrate(owner(), { lid: 'oldClientDoc0000002' })); });
test('mapping with a wrong arrangement, a wrong registry flag or without a profile is refused', async () => {
  await seedClient(); const db = owner();
  await assertFails(migrate(db, { mig: { arrangement: 'monthly' } })); await assertFails(migrate(db, { mig: { registryNew: true } }));
  await assertFails(setDoc(doc(db, 'billingMigration', LEG), MIG()));
});
test('a mapping cannot be changed or deleted', async () => { await seedClient(); const db = owner(); await migrate(db); await assertFails(updateDoc(doc(db, 'billingMigration', LEG), { clientId: 'CL-002' })); await assertFails(deleteDoc(doc(db, 'billingMigration', LEG))); });

test('owner can read and list all five collections', async () => {
  await seedProfile(); const db = owner(); await mkEntry(db);
  for (const c of ['billingProfiles', 'billingProfileAudit', 'billableEntries', 'billableEntryAudit', 'billingMigration']) await assertSucceeds(getDocs(collection(db, c)));
  await assertSucceeds(getDoc(doc(db, 'billableEntries', EID)));
});
test('visitors, other accounts and an unverified owner email have no access at all', async () => {
  await seedProfile(); await seed('billableEntries/' + EID, { ...ENT(), createdAt: dt(), updatedAt: dt() });
  for (const db of [env.unauthenticatedContext().firestore(), stranger(), google(OWNER_UID, { email_verified: false }), env.authenticatedContext(OWNER_UID, { firebase: { sign_in_provider: 'anonymous' } }).firestore()]) {
    for (const c of ['billingProfiles', 'billingProfileAudit', 'billableEntries', 'billableEntryAudit', 'billingMigration']) await assertFails(getDocs(collection(db, c)));
    await assertFails(getDoc(doc(db, 'billingProfiles', 'CL-001'))); await assertFails(getDoc(doc(db, 'billableEntries', EID)));
    await assertFails(mkEntry(db, {}, EID, A('z9')));
  }
});
