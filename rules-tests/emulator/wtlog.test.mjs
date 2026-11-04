// CodeFlow 4.5.0 W3 - REAL Firestore rules engine tests for the sealed log, corrections (24-hour window) and work settings.
// Run by GitHub Actions (.github/workflows/rules-emulator.yml) or locally:  cd rules-tests/emulator && npm install && npm test   (needs Java 17+)
// Own demo project name. It never touches your real Firebase project.
// STATUS WHEN THIS FILE WAS BUILT: written but NOT executed (the build environment cannot download the emulator).
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

const require = createRequire(import.meta.url), L = require('../../scripts/core-wtlog.js');
const OWNER_UID = '3p2YvH4NSVYAAfA0E6HC2kkyc5F3';
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-wtlog', firestore: { rules: readFileSync('../../firestore.rules.strict', 'utf8') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const google = (uid, extra = {}) => env.authenticatedContext(uid, { email: 'x@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' }, ...extra }).firestore();
const owner = () => google(OWNER_UID), stranger = () => google('someoneelse123');
const seed = (path, data) => env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), ...path.split('/')), data); });
const sha = async s => Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(s))).toString('hex');
const HR = 3600000, SID = 'sess0000000000000001';
let k = 0; const nid = () => ('c' + (++k) + 'y'.repeat(20)).slice(0, 24);
const ago = h => new Date(Date.now() - h * HR);
/* a closed session: clock in, lunch out/in, clock out, with the closing punch `closedHoursAgo` ago */
async function closedSession(closedHoursAgo = 2, o = {}) {
  const base = Date.now() - (closedHoursAgo + 8) * HR;
  const E = [['CLOCK_IN', 0], ['LUNCH_OUT', 4], ['LUNCH_IN', 5], ['CLOCK_OUT', 8]];
  for (let i = 0; i < E.length; i++) await seed(`workEvents/${SID}__${i + 1}`, { sid: SID, n: i + 1, type: E[i][0], at: new Date(base + E[i][1] * HR), by: OWNER_UID, reason: '' });
  await seed('workSessions/' + SID, { tz: 'Asia/Manila', date: '2026-11-04', startedAt: new Date(base), by: OWNER_UID });
  await seed('workState/main', { state: 'NOT_STARTED', sid: SID, n: 4, fb: true, lu: true, lb: false, lastEid: SID + '__4', rev: 6, updatedAt: new Date(), ...o });
  await seed('clientRegistry/CL-001', { status: 'active', notes: '', createdAt: new Date(), updatedAt: new Date(), rev: 1, lastAudit: 'a'.repeat(16) });
  await seed('clientRegistry/CL-009', { status: 'archived', notes: '', createdAt: new Date(), updatedAt: new Date(), rev: 2, lastAudit: 'b'.repeat(16) });
  return base;
}
const corr = (o = {}) => ({ sid: SID, kind: 'TIME', n: 4, type: '', clientId: '', at: ago(1.5), at2: null, reason: 'Forgot to clock out on time', closeEid: SID + '__4', closeN: 4, by: OWNER_UID, createdAt: serverTimestamp(), ...o });
const put = (db, c) => setDoc(doc(db, 'workCorrections', nid()), c);

/* ---- corrections ---- */
test('corrections: all four kinds are accepted for a session closed 2 hours ago', async () => {
  const db = owner(); const base = await closedSession(2);
  await assertSucceeds(put(db, corr()));
  await assertSucceeds(put(db, corr({ kind: 'ADD', n: 0, type: 'FIRST_BREAK', at: new Date(base + 2 * HR), at2: new Date(base + 2.5 * HR) })));
  await assertSucceeds(put(db, corr({ kind: 'CLIENT_ADD', n: 0, clientId: 'CL-001', at: null })));
  await assertSucceeds(put(db, corr({ kind: 'CLIENT_REMOVE', n: 0, clientId: 'CL-005', at: null })));
});
test('corrections: refused after the 24-hour window, while the session is open, for other sessions\' closing punch and for a visitor', async () => {
  await closedSession(25); await assertFails(put(owner(), corr({ at: ago(26) })));
  await env.clearFirestore(); await closedSession(23.9); await assertSucceeds(put(owner(), corr()));
  await env.clearFirestore(); await closedSession(2, { state: 'WORKING', n: 3 }); await assertFails(put(owner(), corr()));
  await env.clearFirestore(); await closedSession(2); await assertFails(put(stranger(), corr())); await assertFails(put(env.unauthenticatedContext().firestore(), corr()));
  await assertFails(put(owner(), corr({ closeEid: SID + '__3', closeN: 3 })));            // not a closing punch
});
test('corrections: bad shapes are refused (future time, reason, archived client, extra field, time on a client change)', async () => {
  const db = owner(); await closedSession(2);
  for (const bad of [corr({ at: new Date(Date.now() + 3600000) }), corr({ reason: 'ab' }), corr({ reason: 'r'.repeat(201) }), corr({ by: 'other' }), corr({ extra: 1 }), corr({ kind: 'NOPE' }),
    corr({ kind: 'CLIENT_ADD', n: 0, clientId: 'CL-009', at: null }), corr({ kind: 'CLIENT_ADD', n: 0, clientId: 'CL-001', at: new Date() }), corr({ kind: 'ADD', n: 0, type: 'LUNCH', at: ago(1), at2: ago(2) }), corr({ at: ago(80) })])
    await assertFails(put(db, bad));
});
test('corrections cannot be edited or deleted, even by the owner', async () => {
  const db = owner(); await closedSession(2); const id = nid(); await assertSucceeds(setDoc(doc(db, 'workCorrections', id), corr()));
  await assertFails(updateDoc(doc(db, 'workCorrections', id), { reason: 'changed my mind' }));
  const { deleteDoc } = await import('firebase/firestore'); await assertFails(deleteDoc(doc(db, 'workCorrections', id)));
});

/* ---- seals and chain ---- */
const sealDocs = async (n, prev, kind, recs, upto = 0) => { const s = await L.makeSeal(sha, { n, prev, kind, recs, upto }); return s; };
async function writeSeal(db, s, first) {
  const b = writeBatch(db); b.set(doc(db, 'workSeals', s.hash), { ...s, at: serverTimestamp(), by: OWNER_UID }); b.set(doc(db, 'workChain', 'main'), { cn: s.n, head: s.hash, updatedAt: serverTimestamp() }); return b.commit();
}
test('the starting seal and chain head are written together; a second start and a visitor are refused', async () => {
  await closedSession(2); const recs = [{ path: 'workSessions/' + SID, data: { tz: 'x', startedAt: 1 } }];
  const g = await sealDocs(1, L.ZERO, 'genesis', recs, 1);
  await assertFails(writeSeal(stranger(), g)); await assertSucceeds(writeSeal(owner(), g));
  const g2 = await sealDocs(1, L.ZERO, 'genesis', recs, 2); await assertFails(writeSeal(owner(), g2));
});
test('the next seal must follow the old head, in order, and a seal cannot be replayed, edited or deleted', async () => {
  await closedSession(2); const db = owner();
  const g = await sealDocs(1, L.ZERO, 'genesis', [], 0); await assertSucceeds(writeSeal(db, g));
  const rec = [{ path: 'workEvents/' + SID + '__1', data: { sid: SID, n: 1 } }];
  await assertFails(writeSeal(db, await sealDocs(2, 'f'.repeat(64), 'records', rec)));                         // wrong previous fingerprint
  await assertFails(writeSeal(db, await sealDocs(3, g.hash, 'records', rec)));                                  // skips a number
  const s2 = await sealDocs(2, g.hash, 'records', rec); await assertSucceeds(writeSeal(db, s2));
  await assertFails(writeSeal(db, s2));                                                                          // replay
  await assertFails(updateDoc(doc(db, 'workSeals', s2.hash), { n: 9 }));
  const { deleteDoc } = await import('firebase/firestore'); await assertFails(deleteDoc(doc(db, 'workSeals', s2.hash))); await assertFails(deleteDoc(doc(db, 'workChain', 'main')));
});
test('a seal alone (no chain head in the batch) and a chain head alone are refused', async () => {
  await closedSession(2); const db = owner(); const g = await sealDocs(1, L.ZERO, 'genesis', [], 0);
  await assertFails(setDoc(doc(db, 'workSeals', g.hash), { ...g, at: serverTimestamp(), by: OWNER_UID }));
  await assertFails(setDoc(doc(db, 'workChain', 'main'), { cn: 1, head: g.hash, updatedAt: serverTimestamp() }));
});
test('end to end with real data: seal real records, Verify says intact, then a tampered time is found', async () => {
  const db = owner(); await closedSession(2);
  const read = async () => { const o = {}; for (const c of Object.keys(L.COLLECTIONS)) (await getDocs(collection(db, c))).docs.forEach(d => { o[c + '/' + d.id] = L.plain(d.data()); }); return o; };
  let recs = await read(), list = Object.keys(recs).sort().map(p => ({ path: p, data: recs[p] })), upto = list.reduce((a, r) => Math.max(a, L.timeOf(r.path, r.data)), 0);
  const g = await sealDocs(1, L.ZERO, 'genesis', list, upto); await assertSucceeds(writeSeal(db, g));
  const id = nid(); await assertSucceeds(setDoc(doc(db, 'workCorrections', id), corr()));
  const back = await getDoc(doc(db, 'workCorrections', id)), s2 = await sealDocs(2, g.hash, 'records', [{ path: 'workCorrections/' + id, data: L.plain(back.data()) }]); await assertSucceeds(writeSeal(db, s2));
  const verify = async () => { const seals = (await getDocs(collection(db, 'workSeals'))).docs.map(d => { const x = d.data(); return { id: d.id, ...x, atMs: x.at.toMillis() }; }), ch = (await getDoc(doc(db, 'workChain', 'main'))).data(); return L.verify({ chain: { cn: ch.cn, head: ch.head }, seals, records: await read(), nowMs: Date.now() }, sha); };
  const ok = await verify(); assert.equal(ok.status, 'ok', JSON.stringify(ok.problems)); assert.equal(ok.sealsChecked, 2);
  await seed(`workEvents/${SID}__2`, { sid: SID, n: 2, type: 'LUNCH_OUT', at: new Date(Date.now() - 100 * HR), by: OWNER_UID, reason: '' });        // someone edits a time with console access
  const bad = await verify(); assert.equal(bad.status, 'broken'); assert.match(bad.problems[0], /Seal 1/);
});

/* ---- settings ---- */
const SET = (o = {}) => ({ tz: 'Asia/Manila', weekStart: 'mon', prevTz: '', prevWeekStart: '', rev: 1, updatedAt: serverTimestamp(), ...o });
test('settings: create once, change with the previous values kept, refuse bad values, visitor and delete', async () => {
  const db = owner(), ref = doc(db, 'workSettings', 'main');
  await assertFails(setDoc(doc(stranger(), 'workSettings', 'main'), SET()));
  await assertFails(setDoc(ref, SET({ tz: 'Asia Manila' }))); await assertFails(setDoc(ref, SET({ weekStart: 'xyz' }))); await assertFails(setDoc(ref, SET({ rev: 2 })));
  await assertSucceeds(setDoc(ref, SET()));
  await assertFails(setDoc(ref, SET({ tz: 'Europe/London', prevTz: 'WRONG', prevWeekStart: 'mon', rev: 2 })));
  await assertFails(setDoc(ref, SET({ tz: 'Europe/London', prevTz: 'Asia/Manila', prevWeekStart: 'mon', rev: 3 })));
  await assertSucceeds(setDoc(ref, SET({ tz: 'Europe/London', weekStart: 'sun', prevTz: 'Asia/Manila', prevWeekStart: 'mon', rev: 2 })));
  const { deleteDoc } = await import('firebase/firestore'); await assertFails(deleteDoc(ref));
});
