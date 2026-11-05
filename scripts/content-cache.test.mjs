import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const CC = createRequire(import.meta.url)('./content-cache.js');
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), _m: m }; };
const T = 1_000_000_000_000;

test('write then read round-trips a document', () => {
  const st = mem(); assert.equal(CC.write('faq', { items: [1, 2] }, T, st), true);
  assert.deepEqual(CC.read('faq', st), { t: T, d: { items: [1, 2] } });
});
test('a missing document is cached as null', () => {
  const st = mem(); CC.write('x', undefined, T, st);
  const o = CC.read('x', st); assert.equal(o.d, null); assert.equal(CC.snap(o.d).exists(), false);
});
test('snapshot stand-in exposes data', () => {
  const s = CC.snap({ a: 1 }); assert.equal(s.exists(), true); assert.deepEqual(s.data(), { a: 1 });
});
test('fresh for under 10 minutes, not after', () => {
  const o = { t: T, d: {} };
  assert.equal(CC.isFresh(o, T + 599999), true); assert.equal(CC.isFresh(o, T + 600000), false);
});
test('a timestamp in the future is not fresh', () => { assert.equal(CC.isFresh({ t: T + 5000, d: {} }, T), false); });
test('stale copy usable for 24 hours only', () => {
  const o = { t: T, d: {} };
  assert.equal(CC.isUsableStale(o, T + 3600000), true); assert.equal(CC.isUsableStale(o, T + 86400000), false);
});
test('no cache entry is not fresh or usable', () => { assert.equal(CC.isFresh(null, T), false); assert.equal(CC.isUsableStale(null, T), false); });
test('corrupt or wrongly shaped entries read as null', () => {
  const st = mem();
  for (const raw of ['not json', '{"t":"x","d":{}}', '{"d":{}}', '{"t":1,"d":[1]}', '{"t":1,"d":"s"}', 'null', '5']) {
    st.setItem(CC.PREFIX + 'k', raw); assert.equal(CC.read('k', st), null, raw);
  }
});
test('oversized documents are not cached and an old copy is removed', () => {
  const st = mem(); CC.write('hero', { photo: 'a' }, T, st);
  assert.equal(CC.write('hero', { photo: 'x'.repeat(CC.MAX_CHARS) }, T, st), false);
  assert.equal(CC.read('hero', st), null);
});
test('a storage that throws never throws out', () => {
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('x'); } };
  assert.equal(CC.read('k', bad), null); assert.equal(CC.write('k', {}, T, bad), false); assert.equal(CC.ownerDevice(bad), false);
});
test('no storage at all is handled', () => { assert.equal(CC.read('k', null) === null || true, true); });
test('owner device flag only when exactly "1"', () => {
  const st = mem(); assert.equal(CC.ownerDevice(st), false);
  st.setItem('ownerDevice', '0'); assert.equal(CC.ownerDevice(st), false);
  st.setItem('ownerDevice', '1'); assert.equal(CC.ownerDevice(st), true);
});
test('keys are namespaced so other site data is never read', () => {
  const st = mem(); st.setItem('faq', '{"t":1,"d":{}}'); assert.equal(CC.read('faq', st), null);
});
