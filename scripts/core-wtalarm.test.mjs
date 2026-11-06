// Run: node --test scripts/core-wtalarm.test.mjs   (Node 20+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const a = createRequire(import.meta.url)('./core-wtalarm.js');
const MIN = 60000, OUT = 1e12, DL = OUT + 60 * MIN, B = { outMs: OUT, deadlineMs: DL, limitMin: 60 };
const P = o => Object.assign(a.validPrefs({}), o);

test('defaults: alarm off, warn 5, repeat every 1, chime, 60 percent, no notification', () => { assert.deepEqual(a.validPrefs(undefined), { on: false, warn: 5, repeat: 1, sound: 'chime', vol: 60, notify: false }); });
test('validPrefs: each bad field falls back alone; never trusts stored text', () => {
  assert.deepEqual(a.validPrefs('{"on":true,"warn":10,"repeat":3,"sound":"bell","vol":80,"notify":true}'), { on: true, warn: 10, repeat: 3, sound: 'bell', vol: 80, notify: true });
  for (const bad of [null, '', 'x', '[]', '5', undefined, 7, [], '{"on":"yes"}']) assert.deepEqual(a.validPrefs(bad), a.DEFAULTS, String(bad));
  const p = a.validPrefs({ on: true, warn: 31, repeat: 11, sound: 'siren', vol: 5, notify: 'y' });
  assert.deepEqual(p, { on: true, warn: 5, repeat: 1, sound: 'chime', vol: 60, notify: false });
  assert.equal(a.validPrefs({ warn: 0 }).warn, 0); assert.equal(a.validPrefs({ repeat: 0 }).repeat, 0);
  assert.equal(a.validPrefs({ vol: 10.5 }).vol, 60); assert.equal(a.validPrefs({ warn: '5' }).warn, 5);
});
test('schedule: warning, deadline, then 10 repeats', () => {
  const s = a.schedule(B, P({}));
  assert.equal(s.length, 12); assert.deepEqual(s[0], { atMs: DL - 5 * MIN, kind: 'warn', n: 0 }); assert.deepEqual(s[1], { atMs: DL, kind: 'late', n: 0 });
  assert.equal(s[2].atMs, DL + MIN); assert.equal(s[11].atMs, DL + 10 * MIN); assert.equal(s[11].n, 10); assert.equal(s.filter(e => e.kind === 'repeat').length, 10);
});
test('schedule: repeat step, repeat off, warning off', () => {
  assert.equal(a.schedule(B, P({ repeat: 3 }))[2].atMs, DL + 3 * MIN);
  assert.equal(a.schedule(B, P({ repeat: 0 })).filter(e => e.kind === 'repeat').length, 0);
  assert.equal(a.schedule(B, P({ warn: 0 })).filter(e => e.kind === 'warn').length, 0);
});
test('schedule: no limit means no alarm; a warning before the break even started is dropped', () => {
  assert.deepEqual(a.schedule({ outMs: OUT, deadlineMs: DL, limitMin: 0 }, P({})), []);
  assert.deepEqual(a.schedule(null, P({})), []); assert.deepEqual(a.schedule({ outMs: NaN, deadlineMs: DL, limitMin: 5 }, P({})), []);
  const short = a.schedule({ outMs: OUT, deadlineMs: OUT + 3 * MIN, limitMin: 3 }, P({ warn: 5 })); assert.equal(short.filter(e => e.kind === 'warn').length, 0);
});
test('due: plays moments within 5 s, marks older ones as missed (never replayed)', () => {
  const s = a.schedule(B, P({})), h = new Set();
  let d = a.due(s, h, DL - 6 * MIN); assert.equal(d.play.length + d.missed.length, 0);
  d = a.due(s, h, DL - 5 * MIN + 1000); assert.deepEqual(d.play.map(e => e.kind), ['warn']); d.mark.forEach(i => h.add(i));
  d = a.due(s, h, DL - 5 * MIN + 2000); assert.equal(d.play.length, 0, 'handled moments are not repeated');
  d = a.due(s, h, DL + 1000); assert.deepEqual(d.play.map(e => e.kind), ['late']);
});
test('due: page loaded very late plays nothing (missed alarms are never replayed)', () => {
  const s = a.schedule(B, P({})), d = a.due(s, new Set(), DL + 4 * MIN + 10000);
  assert.equal(d.play.length, 0); assert.equal(d.missed.length, 6); assert.equal(d.mark.length, 6);
  const e = a.due(s, new Set(d.mark), DL + 5 * MIN + 1000); assert.deepEqual(e.play.map(x => x.n), [5]);
});
test('due: after the tenth repeat nothing more is ever due', () => {
  const s = a.schedule(B, P({})), h = new Set(); a.due(s, h, DL + 99 * MIN).mark.forEach(i => h.add(i)); assert.equal(h.size, 12);
  assert.equal(a.due(s, h, DL + 200 * MIN).mark.length, 0);
});
test('sounds: valid notes, every sound at most 2.5 s, volume scales and is capped', () => {
  for (const n of [...a.SOUNDS, 'soft', 'unknown']) for (const v of [10, 60, 100]) {
    const l = a.notes(n, v); assert.ok(l.length > 0, n); assert.ok(a.length(l) <= a.MAX_SOUND_S + 1e-9, n + ' ' + a.length(l));
    l.forEach(x => { assert.ok(x.f >= 200 && x.f <= 4000); assert.ok(x.dur > 0 && x.at >= 0); assert.ok(x.gain > 0 && x.gain <= 0.8, n + ' gain ' + x.gain); assert.ok(['sine', 'square', 'sawtooth'].includes(x.wave)); });
  }
  assert.ok(a.notes('chime', 100)[0].gain > a.notes('chime', 10)[0].gain);
  assert.equal(a.notes('bell', 1000)[0].gain, a.notes('bell', 60)[0].gain, 'out-of-range volume falls back to the default');
  assert.ok(Math.abs(a.length(a.notes("urgent", 60)) - 2.36) < 1e-9);
});
test('R7: title is restored only if it is still ours; a changed title becomes the new original', () => {
  const ours = a.titleFor('Lunch'); assert.equal(ours, 'Late: lunch');
  let s = a.titleStep({ current: 'Portfolio', saved: '', ours, flip: true }); assert.deepEqual(s, { title: 'Late: lunch', saved: 'Portfolio' });
  s = a.titleStep({ current: 'Late: lunch', saved: 'Portfolio', ours, flip: false }); assert.deepEqual(s, { title: 'Portfolio', saved: 'Portfolio' });
  s = a.titleStep({ current: 'Inbox (3)', saved: 'Portfolio', ours, flip: true }); assert.equal(s.saved, 'Inbox (3)', 'another script changed the title while we were not showing ours');
  assert.equal(a.titleRestore({ current: 'Late: lunch', saved: 'Portfolio', ours }), 'Portfolio');
  assert.equal(a.titleRestore({ current: 'Something else', saved: 'Portfolio', ours }), 'Something else', 'never overwrite a title we did not set');
});
test('notification wording is generic: no client id, no time', () => {
  assert.equal(a.notifyText('late', 'Lunch'), 'Time to come back from lunch.'); assert.equal(a.notifyText('warn', 'Last break'), 'Your last break ends soon.');
  for (const t of [a.notifyText('late', 'Lunch'), a.notifyText('warn', 'First break')]) assert.ok(!/\d|[A-Z]{3,}-/.test(t), t);
});
