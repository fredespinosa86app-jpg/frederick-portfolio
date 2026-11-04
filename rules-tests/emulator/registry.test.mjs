// CodeFlow 4.5.0 P0 - REAL Firestore rules engine tests (Firebase Local Emulator Suite) for the Client ID registry.
// Run by GitHub Actions (.github/workflows/rules-emulator.yml) or locally:  cd rules-tests/emulator && npm install && npm test   (needs Java 17+)
// Uses a demo project only; it never touches your real Firebase project.
// STATUS WHEN THIS FILE WAS BUILT: written but NOT executed (the build environment cannot download the emulator).
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

const OWNER_UID = '3p2YvH4NSVYAAfA0E6HC2kkyc5F3';
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-portfolio', firestore: { rules: readFileSync('../../firestore.rules.strict', 'utf8') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const google = (uid, extra = {}) => env.authenticatedContext(uid, { email: 'x@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' }, ...extra }).firestore();
const owner = () => google(OWNER_UID);
const A = n => n.padEnd(16, 'a');                                   // audit ids: 16 to 40 letters/digits
const REG = (o = {}) => ({ status: 'active', notes: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), rev: 1, lastAudit: A('a1'), ...o });
const AUD = (o = {}) => ({ clientId: 'CL-001', action: 'create', prev: '', next: 'active', reason: '', rev: 1, actor: OWNER_UID, createdAt: serverTimestamp(), ...o });
async function createClient(db, id = 'CL-001', aid = A('a1')) {
  const b = writeBatch(db); b.set(doc(db, 'clientRegistry', id), REG({ lastAudit: aid })); b.set(doc(db, 'clientRegistryAudit', aid), AUD({ clientId: id })); await b.commit();
}
async function updateClient(db, id, cur, patch, audit, aid) {
  const b = writeBatch(db);
  b.set(doc(db, 'clientRegistry', id), { status: cur.status, notes: cur.notes, createdAt: cur.createdAt, updatedAt: serverTimestamp(), rev: cur.rev + 1, lastAudit: aid, ...patch });
  b.set(doc(db, 'clientRegistryAudit', aid), AUD({ clientId: id, rev: cur.rev + 1, ...audit })); await b.commit();
}
const read = async (db, id = 'CL-001') => (await getDoc(doc(db, 'clientRegistry', id))).data();

test('owner creates a client ID with its audit record in one batch', async () => { await assertSucceeds(createClient(owner())); });
test('registry entry without its audit record is refused', async () => { await assertFails(setDoc(doc(owner(), 'clientRegistry', 'CL-001'), REG())); });
test('orphan audit record (no registry entry in the batch) is refused', async () => { await assertFails(setDoc(doc(owner(), 'clientRegistryAudit', A('a1')), AUD())); });
test('re-creating an existing ID is refused (cannot overwrite)', async () => { await createClient(owner()); await assertFails(createClient(owner(), 'CL-001', A('a2'))); });
for (const bad of ['cl-001', 'CL_001', 'CL--001', 'CL-001-', '1CL-001', 'AB', 'A'.repeat(25), 'CL 001'])
  test(`bad Client ID ${JSON.stringify(bad)} is refused`, async () => { await assertFails(createClient(owner(), bad)); });
test('personal-data fields are refused', async () => {
  const db = owner(), b = writeBatch(db); b.set(doc(db, 'clientRegistry', 'CL-001'), REG({ name: 'Ann', email: 'a@b.co' })); b.set(doc(db, 'clientRegistryAudit', A('a1')), AUD()); await assertFails(b.commit());
});
test('archive with a reason is accepted and bumps the revision', async () => {
  const db = owner(); await createClient(db); const cur = await read(db);
  await assertSucceeds(updateClient(db, 'CL-001', cur, { status: 'archived' }, { action: 'status', prev: 'active', next: 'archived', reason: 'Contract ended' }, A('a2')));
  assert.equal((await read(db)).rev, 2);
});
test('status change with a too-short reason is refused', async () => {
  const db = owner(); await createClient(db); const cur = await read(db);
  await assertFails(updateClient(db, 'CL-001', cur, { status: 'archived' }, { action: 'status', prev: 'active', next: 'archived', reason: 'no' }, A('a2')));
});
test('stale revision (two tabs) is refused', async () => {
  const db = owner(); await createClient(db); const cur = await read(db);
  await updateClient(db, 'CL-001', cur, { notes: 'x' }, { action: 'notes', prev: '', next: 'x' }, A('a2'));
  await assertFails(updateClient(db, 'CL-001', cur, { notes: 'y' }, { action: 'notes', prev: '', next: 'y' }, A('a3')));
});
test('two simultaneous updates from the same revision: exactly one wins', async () => {
  const db = owner(); await createClient(db); const cur = await read(db);
  const r = await Promise.allSettled([
    updateClient(db, 'CL-001', cur, { notes: 'one' }, { action: 'notes', prev: '', next: 'one' }, A('b1')),
    updateClient(db, 'CL-001', cur, { notes: 'two' }, { action: 'notes', prev: '', next: 'two' }, A('b2'))]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal((await read(db)).rev, 2);
});
test('an old audit id cannot be reused (replay)', async () => {
  const db = owner(); await createClient(db); const cur = await read(db);
  await assertFails(updateClient(db, 'CL-001', cur, { notes: 'x' }, { action: 'notes', prev: '', next: 'x' }, A('a1')));
});
test('created time cannot be changed and client time is refused', async () => {
  const db = owner(); await createClient(db);
  const b = writeBatch(db); b.set(doc(db, 'clientRegistry', 'CL-001'), REG({ createdAt: new Date(0), rev: 2, lastAudit: A('a2') })); b.set(doc(db, 'clientRegistryAudit', A('a2')), AUD({ action: 'notes', rev: 2 })); await assertFails(b.commit());
});
test('audit record with another actor is refused', async () => {
  const db = owner(), b = writeBatch(db); b.set(doc(db, 'clientRegistry', 'CL-001'), REG()); b.set(doc(db, 'clientRegistryAudit', A('a1')), AUD({ actor: 'someone-else' })); await assertFails(b.commit());
});
test('audit whose old/new values do not match the registry is refused', async () => {
  const db = owner(); await createClient(db); const cur = await read(db);
  await assertFails(updateClient(db, 'CL-001', cur, { status: 'archived' }, { action: 'status', prev: 'archived', next: 'archived', reason: 'Contract ended' }, A('a2')));
});
test('nobody can delete a registry entry or an audit record, or edit an audit record', async () => {
  const db = owner(); await createClient(db);
  await assertFails(deleteDoc(doc(db, 'clientRegistry', 'CL-001'))); await assertFails(deleteDoc(doc(db, 'clientRegistryAudit', A('a1'))));
  await assertFails(updateDoc(doc(db, 'clientRegistryAudit', A('a1')), { reason: 'edited' }));
});
test('owner can read and list', async () => { const db = owner(); await createClient(db); await assertSucceeds(getDoc(doc(db, 'clientRegistry', 'CL-001'))); await assertSucceeds(getDocs(collection(db, 'clientRegistry'))); await assertSucceeds(getDocs(collection(db, 'clientRegistryAudit'))); });
test('visitors and other accounts have no access at all', async () => {
  await env.withSecurityRulesDisabled(async c => { await createClient(c.firestore()); });
  for (const db of [env.unauthenticatedContext().firestore(), google('stranger'), google(OWNER_UID, { email_verified: false }), env.authenticatedContext(OWNER_UID, { firebase: { sign_in_provider: 'anonymous' } }).firestore()]) {
    await assertFails(getDoc(doc(db, 'clientRegistry', 'CL-001'))); await assertFails(getDocs(collection(db, 'clientRegistry'))); await assertFails(getDocs(collection(db, 'clientRegistryAudit')));
    await assertFails(createClient(db, 'CL-009', A('z9')));
  }
});
