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
