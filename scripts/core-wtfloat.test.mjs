// Run: node --test scripts/core-wtfloat.test.mjs   (Node 20+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const rq = createRequire(import.meta.url), f = rq('./core-wtfloat.js'), core = rq('./core-worktrack.js');
const st = (state, o = {}) => Object.assign({ state, sid: 'S1S1S1S1S1S1S1S1S1', n: state === 'NOT_STARTED' ? 0 : 1, fb: false, lu: false, lb: false, lastEid: '', rev: 1 }, o);
const ok = { valid: true }, bad = { valid: false };
const types = v => v.buttons.map(b => b.type);

test('hidden when not clocked in, unknown, or missing data', () => {
  assert.equal(f.view(st('NOT_STARTED'), ok, core).visible, false);
  assert.equal(f.view(null, ok, core).visible, false);
  assert.equal(f.view(st('WORKING'), null, core).visible, false);
  assert.equal(f.view(st('WORKING'), ok, null).visible, false);
  assert.equal(f.view(st('BOGUS'), ok, core).visible, false);
});
test('visible when a session is open, with exactly the legal next punches', () => {
  assert.deepEqual(types(f.view(st('WORKING'), ok, core)), ['FIRST_BREAK_OUT', 'LUNCH_OUT', 'LAST_BREAK_OUT', 'CLOCK_OUT']);
  assert.deepEqual(types(f.view(st('FIRST_BREAK'), ok, core)), ['FIRST_BREAK_IN']);
  assert.deepEqual(types(f.view(st('LUNCH'), ok, core)), ['LUNCH_IN']);
  assert.deepEqual(types(f.view(st('LAST_BREAK'), ok, core)), ['LAST_BREAK_IN']);
});
test('used breaks are not offered again', () => {
  assert.deepEqual(types(f.view(st('WORKING', { fb: true, lu: true }), ok, core)), ['LAST_BREAK_OUT', 'CLOCK_OUT']);
  assert.deepEqual(types(f.view(st('WORKING', { fb: true, lu: true, lb: true }), ok, core)), ['CLOCK_OUT']);
});
test('never offers Clock in or Close as incomplete; only Clock out asks to confirm', () => {
  for (const s of core.STATES) { const v = f.view(st(s), ok, core); v.buttons.forEach(b => { assert.notEqual(b.type, 'CLOCK_IN'); assert.notEqual(b.type, 'CLOSE_INCOMPLETE'); assert.equal(b.confirm, b.type === 'CLOCK_OUT'); }); }
});
test('every button is a punch the state machine allows (matrix of all states)', () => {
  for (const s of core.STATES) for (const fb of [false, true]) for (const lu of [false, true]) for (const lb of [false, true]) {
    const stt = st(s, { fb, lu, lb }), v = f.view(stt, ok, core);
    v.buttons.forEach(b => assert.equal(core.next(stt, b.type, 'x').ok, true, s + ' ' + b.type));
  }
});
test('records out of order: clock shows, no buttons', () => {
  const v = f.view(st('WORKING'), bad, core); assert.equal(v.visible, true); assert.equal(v.paused, true); assert.deepEqual(v.buttons, []);
});
test('clamp keeps the clock inside the window', () => {
  const vp = { w: 1000, h: 700 }, sz = { w: 220, h: 100 };
  assert.deepEqual(f.clamp({ x: -50, y: -50 }, vp, sz), { x: 8, y: 8 });
  assert.deepEqual(f.clamp({ x: 5000, y: 5000 }, vp, sz), { x: 772, y: 592 });
  assert.deepEqual(f.clamp({ x: 300, y: 200 }, vp, sz), { x: 300, y: 200 });
  assert.deepEqual(f.clamp({ x: NaN, y: 'a' }, vp, sz), { x: 772, y: 8 });
  assert.deepEqual(f.clamp(null, vp, sz), { x: 772, y: 8 });
});
test('clamp on a tiny window never gives negative coordinates', () => {
  const p = f.clamp({ x: 100, y: 100 }, { w: 100, h: 50 }, { w: 220, h: 100 }); assert.ok(p.x >= 8 && p.y >= 8);
});
test('default position is top right, or lower when asked (below the dashboard header)', () => { assert.deepEqual(f.defaultPos({ w: 1000, h: 700 }, { w: 220, h: 100 }), { x: 772, y: 8 }); assert.deepEqual(f.defaultPos({ w: 1000, h: 700 }, { w: 220, h: 100 }, 72), { x: 772, y: 72 }); });
test('stored preferences are parsed safely', () => {
  assert.deepEqual(f.parsePrefs('{"x":10.4,"y":20,"min":true}'), { x: 10, y: 20, min: true });
  for (const bad of ['', 'null', '[]', '5', '{"x":"a","y":1}', 'not json', '{"x":1}', undefined, null]) assert.deepEqual(f.parsePrefs(bad), { x: null, y: null, min: false }, String(bad));
  assert.equal(f.parsePrefs('{"x":1,"y":2,"min":"yes"}').min, false);
  assert.deepEqual(f.parsePrefs(f.serializePrefs({ x: 5, y: 6, min: true })), { x: 5, y: 6, min: true });
});
test('keyboard nudge', () => {
  assert.deepEqual(f.nudge({ x: 100, y: 100 }, 'ArrowLeft', false), { x: 90, y: 100 });
  assert.deepEqual(f.nudge({ x: 100, y: 100 }, 'ArrowDown', true), { x: 100, y: 150 });
  assert.equal(f.nudge({ x: 1, y: 1 }, 'a', false), null);
});
test('next corner goes clockwise: top right, bottom right, bottom left, top left, top right', () => {
  const vp = { w: 1000, h: 700 }, sz = { w: 220, h: 100 }; let p = { x: 772, y: 8 }; const seen = [];
  for (let i = 0; i < 5; i++) { p = f.nextCorner(p, vp, sz); seen.push(p.x + ',' + p.y); }
  assert.deepEqual(seen, ['772,592', '8,592', '8,8', '772,8', '772,592']);
  assert.deepEqual(f.nextCorner({ x: 100, y: 100 }, vp, sz, 72), { x: 772, y: 72 }, 'from the top left the next corner is the top right (below the dashboard header when top = 72)');
  assert.deepEqual(f.nextCorner(null, vp, sz), { x: 772, y: 592 });
  const tiny = f.nextCorner({ x: 0, y: 0 }, { w: 100, h: 50 }, sz); assert.ok(tiny.x >= 8 && tiny.y >= 8);
});
