// Run: node --test scripts/core-trainingcats.test.mjs   (Node 20+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const C = createRequire(import.meta.url)('./core-trainingcats.js');
const img = s => ({ src: 'data:image/png;base64,' + s, alt: 'a' });
const cat = (id, o) => Object.assign({ id, title: 'Cat ' + id, summary: '', enabled: true, overview: 'o', handsOn: { text: 'h', image: null }, tools: [], toolkit: '', howIWork: '' }, o);
const L = n => Array.from({ length: n }, (_, i) => cat('tr' + (i + 1)));
const seq = () => { let n = 0; return () => 'x' + (n++); };

test('the cap stays 7', () => assert.equal(C.MAX, 7));
test('add: new hidden blank category at the end, unique id, up to the cap', () => {
  const r = C.add(L(3), seq()); assert.equal(r.ok, true); assert.equal(r.list.length, 4); assert.equal(r.added.enabled, false);
  assert.equal(r.added.title, 'New category'); assert.ok(r.added.id.length <= 20 && r.added.id.startsWith('tc')); assert.equal(r.list[3], r.added);
  assert.equal(new Set(r.list.map(t => t.id)).size, 4);
});
test('add: refused at 7, original list untouched', () => { const l = L(7); const r = C.add(l); assert.equal(r.ok, false); assert.match(r.error, /up to 7/); assert.equal(l.length, 7); });
test('add: ids stay unique even when the random part clashes (it retries or stops, never repeats)', () => {
  const g = () => 'same'; let l = [];
  for (let k = 0; k < 7; k++) { try { l = C.add(l, g).list; } catch (e) { assert.match(e.message, /unique id/); break; } }
  assert.equal(new Set(l.map(t => t.id)).size, l.length);
  const taken = ('tc' + Date.now().toString(36).slice(-5) + 'same').slice(0, 20); const id = C.newId([{ id: taken }], 'tc', () => 'other'); assert.notEqual(id, taken);
});
test('copy: right after the original, hidden, "Copy of", new category id, new tool ids, original untouched', () => {
  const l = L(3); l[1].tools = [{ id: 'tl1', name: 'T', images: [img('AAA')] }]; l[1].handsOn.image = img('BBB');
  const r = C.copy(l, 'tr2', {}, seq()); assert.equal(r.ok, true); assert.equal(r.list.length, 4); assert.equal(r.list[2], r.added);
  assert.equal(r.added.title, 'Copy of Cat tr2'); assert.equal(r.added.enabled, false); assert.notEqual(r.added.id, 'tr2');
  assert.notEqual(r.added.tools[0].id, 'tl1'); assert.equal(r.added.tools[0].images.length, 1); assert.equal(r.added.handsOn.image.src, l[1].handsOn.image.src);
  assert.notEqual(r.added.tools, l[1].tools); assert.equal(l[1].enabled, true); assert.equal(l.length, 3);
});
test('copy without images drops every image only in the copy', () => {
  const l = L(2); l[0].tools = [{ id: 'a', name: 'T', images: [img('1'), img('2')] }]; l[0].handsOn.image = img('3');
  const r = C.copy(l, 'tr1', { noImages: true }, seq()); assert.equal(C.imageCount(r.added), 0); assert.equal(r.imagesDropped, true); assert.equal(C.imageCount(l[0]), 3);
  assert.equal(C.copy(L(2), 'tr1', { noImages: true }, seq()).imagesDropped, false);
});
test('copy: title limit, unknown id, full list', () => {
  const l = L(2); l[0].title = 'x'.repeat(80); assert.equal(C.copy(l, 'tr1', {}, seq()).added.title.length, 80);
  assert.equal(C.copy(l, 'nope').ok, false); assert.equal(C.copy(L(7), 'tr1').ok, false);
});
test('copyFits: a big copy is refused in full but fits without images', () => {
  const l = L(2); l[0].handsOn.image = img('A'.repeat(139000)); l[0].tools = [{ id: 'a', name: 'T', images: [img('B'.repeat(139000)), img('C'.repeat(139000))] }];
  l[1].handsOn.image = img('D'.repeat(139000)); l[1].tools = [{ id: 'b', name: 'T', images: [img('E'.repeat(139000)), img('F'.repeat(139000))] }];
  const f = C.copyFits(l, 'tr1', seq()); assert.equal(f.full, false); assert.equal(f.light, true);
  assert.deepEqual(C.copyFits(L(2), 'tr1', seq()), { full: true, light: true }); assert.deepEqual(C.copyFits(L(7), 'tr1'), { full: false, light: false });
});
test('remove: only that id; down to zero is allowed', () => { let l = L(3); l = C.remove(l, 'tr2'); assert.deepEqual(l.map(t => t.id), ['tr1', 'tr3']); l = C.remove(C.remove(l, 'tr1'), 'tr3'); assert.deepEqual(l, []); assert.deepEqual(C.remove(l, 'x'), []); });
test('impact counts tools, images and the videos/FAQs linked by id', () => {
  const t = cat('tr1', { tools: [{ id: 'a', name: 'T', images: [img('1')] }, { id: 'b', name: 'U', images: [] }] }); t.handsOn.image = img('2');
  assert.deepEqual(C.impact(t, [{ category: 'tr1' }, { category: 'tr2' }, { category: '' }, null], [{ category: 'tr1' }, { category: 'tr1' }]), { tools: 2, images: 2, videos: 1, faqs: 2 });
  assert.deepEqual(C.impact(null, null, null), { tools: 0, images: 0, videos: 0, faqs: 0 });
});
test('restore: adds only missing originals, never overwrites, respects the cap', () => {
  const defs = L(7); let l = C.remove(C.remove(L(7), 'tr3'), 'tr5'); l[0].title = 'Mine';
  let r = C.restore(l, defs); assert.equal(r.added, 2); assert.equal(r.list.length, 7); assert.equal(r.list[0].title, 'Mine'); assert.deepEqual(r.list.slice(5).map(t => t.id), ['tr3', 'tr5']);
  const full = C.add(C.remove(L(7), 'tr7'), seq()).list; r = C.restore(full, defs); assert.equal(r.added, 0); assert.equal(r.skipped, 1); assert.equal(r.list.length, 7);
  assert.equal(C.restore(L(7), defs).added, 0); assert.equal(C.restore([], defs).added, 7);
  r.list[0].title = 'changed'; assert.notEqual(defs[0].title, 'changed');
});
test('knownOrGeneral: deleted or empty category ids become General', () => {
  const l = L(2); assert.equal(C.knownOrGeneral('tr1', l), 'tr1'); assert.equal(C.knownOrGeneral('gone', l), ''); assert.equal(C.knownOrGeneral('', l), ''); assert.equal(C.knownOrGeneral(undefined, l), '');
});
test('size: matches the publish check', () => { const l = L(2); assert.equal(C.sizeOf(l), JSON.stringify(l).length); assert.equal(C.LIMIT, 900000); });
