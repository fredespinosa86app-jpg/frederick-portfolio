// Run: node --test scripts/backup-core.test.mjs   (Node 20+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const BC = createRequire(import.meta.url)('./backup-core.js');
const ts = ms => ({ toMillis: () => ms });
const sample = () => ({ settings: [{ id: 'site', data: { hireEnabled: true, loading: { max: 10 } } }], content: [{ id: 'faq', data: { items: [{ q: 'a', a: 'b' }] } }, { id: 'guard', data: { pause: false, at: 5 } }], clients: [{ id: 'c1', data: { name: 'Ann', email: 'a@b.co', createdAt: ts(1700000000000) } }], meetingRequests: [{ id: 'r1', data: { name: 'Bob', createdAt: new Date(1700000000000) } }] });

test('build + validate round trip keeps data and timestamps', async () => {
  const b = await BC.build(sample()); const r = await BC.validate(JSON.stringify(b));
  assert.equal(r.ok, true, r.errors.join()); assert.deepEqual(r.summary, { settings: 1, content: 2, clients: 1, meetingRequests: 1 });
  assert.equal(b.data.clients.c1.createdAt.__ts, 1700000000000);
  const w = BC.plan(r.data, ['clients']); assert.equal(w.length, 1); assert.ok(w[0].data.createdAt instanceof Date);
});
test('export-only collections are never planned for restore, with a warning', async () => {
  const r = await BC.validate(JSON.stringify(await BC.build(sample())));
  assert.equal(BC.plan(r.data, ['meetingRequests', 'visits', 'activity', 'chatUnanswered']).length, 0);
  assert.ok(r.warnings.some(w => /Meeting requests/.test(w)));
});
test('tampering is caught by the checksum', async () => {
  const b = await BC.build(sample()); b.data.clients.c1.name = 'Eve';
  const r = await BC.validate(JSON.stringify(b)); assert.equal(r.ok, false); assert.match(r.errors[0], /checksum/);
});
const resign = async (b) => { b.sha256 = await BC.sha256(JSON.stringify(b.data)); return JSON.stringify(b); };
test('rejects unknown collections, bad names, forbidden fields, huge docs, bad shapes', async () => {
  const mk = async f => { const b = await BC.build(sample()); f(b); return BC.validate(await resign(b)); };
  assert.equal((await mk(b => { b.data.users = { x: { a: 1 } }; })).ok, false);
  assert.equal((await mk(b => { b.data.content['../x'] = { a: 1 }; })).ok, false);
  assert.equal((await mk(b => { b.data.content['a b'] = { a: 1 }; })).ok, false);
  assert.equal((await mk(b => { b.data.content.faq = JSON.parse('{"__proto__":{"x":1}}'); })).ok, false);
  assert.equal((await mk(b => { b.data.content.faq = { constructor: 1 }; })).ok, false);
  assert.equal((await mk(b => { b.data.content.faq = { big: 'x'.repeat(1000001) }; })).ok, false);
  assert.equal((await mk(b => { b.data.content.faq = []; })).ok, false);
  assert.equal((await mk(b => { let o = {}; let c = o; for (let i = 0; i < 40; i++) { c.n = {}; c = c.n; } b.data.content.faq = o; })).ok, false);
  assert.equal((await mk(b => { b.data = {}; })).ok, false);
});
test('rejects wrong format, version, bad json, empty, oversize, missing checksum', async () => {
  const b = await BC.build(sample());
  assert.equal((await BC.validate('')).ok, false); assert.equal((await BC.validate('{nope')).ok, false); assert.equal((await BC.validate('[]')).ok, false);
  assert.equal((await BC.validate(JSON.stringify({ ...b, format: 'x' }))).ok, false);
  assert.equal((await BC.validate(JSON.stringify({ ...b, version: 2 }))).ok, false);
  assert.equal((await BC.validate(JSON.stringify({ ...b, sha256: 'abc' }))).ok, false);
  assert.equal((await BC.validate('x'.repeat(9 * 1024 * 1024))).ok, false);
});
test('encode drops functions/undefined, clamps depth, keeps plain data; decode only revives exact timestamp shape', () => {
  const e = BC.encode({ a: 1, f() {}, u: undefined, n: NaN, d: new Date(5), arr: [1, undefined, 'x'] });
  assert.deepEqual(e, { a: 1, n: null, d: { __ts: 5 }, arr: [1, null, 'x'] });
  assert.ok(BC.decode({ __ts: 5 }) instanceof Date); assert.deepEqual(BC.decode({ __ts: 5, x: 1 }), { __ts: 5, x: 1 }); assert.deepEqual(BC.decode({ __ts: '5' }), { __ts: '5' });
});
test('skips documents with unsafe ids when building', async () => {
  const b = await BC.build({ content: [{ id: 'ok_1', data: { a: 1 } }, { id: 'bad/id', data: { a: 2 } }] });
  assert.deepEqual(Object.keys(b.data.content), ['ok_1']);
});
test('E4: Google connection settings (ownerPrivate/google) are never exported', async () => {
  const b = await BC.build({ ownerPrivate: [{ id: 'config', data: { currency: 'USD' } }, { id: 'google', data: { sheetsUrl: 'https://script.google.com/macros/s/AAAA/exec', sheetsToken: 'secret-secret-secret' } }] });
  assert.deepEqual(Object.keys(b.data.ownerPrivate), ['config']);
  assert.ok(!JSON.stringify(b).includes('secret-secret') && !JSON.stringify(b).includes('script.google.com'));
});
test('E4: a backup that contains ownerPrivate/google is accepted but that document is dropped with a warning', async () => {
  const data = { ownerPrivate: { config: { currency: 'USD' }, google: { sheetsToken: 'x'.repeat(20) } } };
  const sha = await (async () => { const c = (await import('node:crypto')).webcrypto; const h = await c.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data))); return Array.from(new Uint8Array(h)).map(x => x.toString(16).padStart(2, '0')).join(''); })();
  const r = await BC.validate(JSON.stringify({ format: 'codeflow-portfolio-backup', version: 1, createdAt: new Date().toISOString(), app: 'x', counts: {}, data, sha256: sha }));
  assert.equal(r.ok, true, r.errors.join());
  assert.ok(!('google' in r.data.ownerPrivate)); assert.ok(r.warnings.some(w => /never restored/.test(w)));
});

test('4.5.0: client ID registry and its history are saved but never restored', async () => {
  const s = sample(); s.clientRegistry = [{ id: 'CL-001', data: { status: 'active', notes: '', rev: 1, lastAudit: 'a'.repeat(16), createdAt: ts(1700000000000), updatedAt: ts(1700000000000) } }];
  s.clientRegistryAudit = [{ id: 'a'.repeat(16), data: { clientId: 'CL-001', action: 'create', prev: '', next: 'active', reason: '', rev: 1, actor: 'u', createdAt: ts(1700000000000) } }];
  const b = await BC.build(s), r = await BC.validate(JSON.stringify(b));
  assert.equal(r.ok, true, r.errors.join()); assert.equal(r.summary.clientRegistry, 1); assert.equal(r.summary.clientRegistryAudit, 1);
  assert.ok(r.warnings.some(w => /Client IDs/.test(w)), 'warns that they are not restored');
  assert.deepEqual(BC.plan(b.data, ['clientRegistry', 'clientRegistryAudit']), []);
  assert.ok(BC.EXPORT_ONLY.includes('clientRegistry') && !BC.RESTORABLE.includes('clientRegistry'));
});
test('SV2a: survey collections are saved in a backup for your records but never restored (visitors create answers; the rules tie each write to the clock)', () => {
  for (const c of ['surveyInvites', 'surveyInvitesPrivate', 'surveyResponses', 'surveyReminders', 'surveyTemplates', 'surveyForms', 'surveyAnswers']) { assert.ok(BC.EXPORT_ONLY.includes(c), c); assert.ok(!BC.RESTORABLE.includes(c), c); assert.ok(BC.LABEL[c], c); }
});

// ---- BK-1: reminder threshold (7 days) and the new export-only collection
test('BK-1: backupStatus: none / ok / due at exactly 7 days', () => {
  const now = Date.UTC(2026, 10, 9, 12), D = 864e5;
  assert.equal(BC.BACKUP_DUE_DAYS, 7);
  assert.deepEqual(BC.backupStatus(undefined, now), { state: 'none', days: null });
  assert.deepEqual(BC.backupStatus(0, now), { state: 'none', days: null });
  assert.deepEqual(BC.backupStatus(NaN, now), { state: 'none', days: null });
  assert.deepEqual(BC.backupStatus(now - 6 * D - 1000, now), { state: 'ok', days: 6 });
  assert.deepEqual(BC.backupStatus(now - 7 * D, now), { state: 'due', days: 7 });
  assert.deepEqual(BC.backupStatus(now - 40 * D, now), { state: 'due', days: 40 });
  assert.deepEqual(BC.backupStatus(now + 5 * D, now), { state: 'ok', days: 0 });   // a clock set in the future is never "due"
});
test('BK-1: workSchedules is export-only (the rules tie each edit to the clock) and is saved', async () => {
  assert.ok(BC.EXPORT_ONLY.includes('workSchedules') && !BC.RESTORABLE.includes('workSchedules'));
  const b = await BC.build({ workSchedules: [{ id: 'default', data: { fb: 15, lu: 60, lb: 15, rev: 1 } }] });
  assert.equal(b.counts.workSchedules, 1);
  const v = await BC.validate(JSON.stringify(b));
  assert.ok(v.ok, JSON.stringify(v.errors));
  assert.ok(v.warnings.some(w => /WorkTrack break schedules/.test(w) && /not restored/.test(w)));
  assert.equal(BC.plan(v.data, ['workSchedules']).length, 0, 'export-only: never written back');
});
