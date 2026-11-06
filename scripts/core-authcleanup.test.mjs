// Run: node --test scripts/core-authcleanup.test.mjs   (Node 20+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const A = createRequire(import.meta.url)('./core-authcleanup.js');
const DAY = 864e5, NOW = Date.UTC(2027, 0, 15, 12);
test('never done: due', () => { for (const s of [undefined, null, {}, { lastAt: 0 }, { lastAt: 'x' }, { lastAt: -5 }, 'x', 5]) assert.equal(A.due(s, NOW), true, JSON.stringify(s)); });
test('30-day rule with edge days', () => { assert.equal(A.due({ lastAt: NOW - 29 * DAY }, NOW), false); assert.equal(A.due({ lastAt: NOW - 30 * DAY }, NOW), true); assert.equal(A.due({ lastAt: NOW - 31 * DAY }, NOW), true); assert.equal(A.due({ lastAt: NOW - 1000 }, NOW), false); });
test('a date from the future is bad data: due', () => assert.equal(A.due({ lastAt: NOW + DAY }, NOW), true));
test('snooze hides it for up to 7 days, then it returns; absurd snoozes are ignored', () => {
  const old = NOW - 90 * DAY;
  assert.equal(A.due({ lastAt: old, snoozeUntil: NOW + 3 * DAY }, NOW), false); assert.equal(A.due({ lastAt: old, snoozeUntil: NOW + 7 * DAY }, NOW), false);
  assert.equal(A.due({ lastAt: old, snoozeUntil: NOW }, NOW), true); assert.equal(A.due({ lastAt: old, snoozeUntil: NOW - DAY }, NOW), true);
  assert.equal(A.due({ lastAt: old, snoozeUntil: NOW + 400 * DAY }, NOW), true, 'a snooze far in the future must not hide it for a year');
  assert.equal(A.snoozeUntil(NOW), NOW + 7 * DAY);
});
test('daysSince', () => { assert.equal(A.daysSince(NOW - 3.5 * DAY, NOW), 3); assert.equal(A.daysSince(undefined, NOW), null); assert.equal(A.daysSince(NOW + 5, NOW), null); assert.equal(A.daysSince(0, NOW), null); });
