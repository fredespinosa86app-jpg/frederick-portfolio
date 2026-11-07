import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const Z = createRequire(import.meta.url)('./core-ownertz.js');

test('fallback is Asia/Manila', () => assert.equal(Z.FALLBACK, 'Asia/Manila'));
test('isValid accepts real zones and refuses odd names', () => {
  for (const t of ['Asia/Manila', 'UTC', 'Europe/London', 'America/Argentina/Buenos_Aires', 'Etc/GMT+8', 'Asia/Kathmandu']) assert.equal(Z.isValid(t), true, t);
  for (const t of ['', ' ', 'Asia Manila', 'Not/AZone', 'Asia/Manila;', '<b>', 'A'.repeat(61), 5, null, undefined, {}, ['UTC']]) assert.equal(Z.isValid(t), false, String(t));
});
test('check trims, explains, and never throws', () => {
  assert.deepEqual(Z.check('  Europe/London '), { ok: true, tz: 'Europe/London' });
  assert.equal(Z.check('').ok, false); assert.equal(Z.check(null).ok, false); assert.match(Z.check('Mars/Base').error, /not a valid time zone/); assert.match(Z.check('').error, /Examples/);
  assert.ok(Z.check('x'.repeat(500)).error.length < 200);
});
test('fromDoc: damaged or missing data falls back safely', () => {
  assert.deepEqual(Z.fromDoc(null), { tz: 'Asia/Manila', prevTz: '', rev: 0, saved: false });
  assert.deepEqual(Z.fromDoc({ tz: 'bad zone', rev: 3 }), { tz: 'Asia/Manila', prevTz: '', rev: 0, saved: false });
  assert.deepEqual(Z.fromDoc({ tz: 'UTC', prevTz: 'Asia/Manila', rev: 4 }), { tz: 'UTC', prevTz: 'Asia/Manila', rev: 4, saved: true });
  assert.deepEqual(Z.fromDoc({ tz: 'UTC', prevTz: 'nope!', rev: 0 }), { tz: 'UTC', prevTz: '', rev: 1, saved: true });
});
test('nextDoc matches the rules: first save rev 1 and empty previous; a change keeps the replaced zone and adds exactly 1', () => {
  assert.deepEqual(Z.nextDoc(Z.fromDoc(null), 'UTC'), { tz: 'UTC', prevTz: '', rev: 1 });
  assert.deepEqual(Z.nextDoc(Z.fromDoc({ tz: 'UTC', prevTz: '', rev: 1 }), 'Europe/London'), { tz: 'Europe/London', prevTz: 'UTC', rev: 2 });
});
test('resolve: the project zone wins, then the owner default, then Asia/Manila', () => {
  assert.equal(Z.resolve('America/New_York', 'Europe/London'), 'America/New_York');
  assert.equal(Z.resolve('', 'Europe/London'), 'Europe/London'); assert.equal(Z.resolve(undefined, 'Europe/London'), 'Europe/London');
  assert.equal(Z.resolve('not a zone', 'Europe/London'), 'Europe/London'); assert.equal(Z.resolve('', 'junk'), 'Asia/Manila'); assert.equal(Z.resolve(), 'Asia/Manila');
});
test('offsetLabel: whole hours, half hours, 45 minutes, UTC, and summer time', () => {
  const jan = Date.UTC(2026, 0, 15, 12), jul = Date.UTC(2026, 6, 15, 12);
  assert.equal(Z.offsetLabel('Asia/Manila', jan), 'UTC+8'); assert.equal(Z.offsetLabel('UTC', jan), 'UTC'); assert.equal(Z.offsetLabel('Asia/Kolkata', jan), 'UTC+5:30'); assert.equal(Z.offsetLabel('Asia/Kathmandu', jan), 'UTC+5:45');
  assert.equal(Z.offsetLabel('America/New_York', jan), 'UTC-5'); assert.equal(Z.offsetLabel('America/New_York', jul), 'UTC-4'); assert.equal(Z.offsetLabel('bad zone', jan), '');
});
test('clockText shows the hour and minute in that zone', () => {
  const ms = Date.UTC(2026, 10, 7, 21, 12); assert.equal(Z.clockText('Asia/Manila', ms), '05:12'); assert.equal(Z.clockText('UTC', ms), '21:12'); assert.equal(Z.clockText('x y', ms), '');
});
