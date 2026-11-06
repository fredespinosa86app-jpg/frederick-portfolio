// Run: node --test scripts/core-retention.test.mjs   (Node 20+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url)('./core-retention.js');
const DAY = 864e5, NOW = Date.UTC(2027, 0, 15, 12), S = R.DEFAULTS;
const ago = d => NOW - d * DAY;
const c = (status, days, extra) => R.classify(Object.assign({ status, createdAt: ago(days), date: '2026-12-01' }, extra), NOW, S).act;
const ymd = off => new Date(NOW + off * DAY).toISOString().slice(0, 10);

test('defaults are the approved numbers', () => assert.deepEqual(S, { finishedDays: 730, flagDays: 90, unansweredDays: 365, graceDays: 30 }));
test('finished (completed/cancelled): delete directly at the retention age, edge days', () => {
  for (const st of ['completed', 'cancelled']) { assert.equal(c(st, 729), 'keep'); assert.equal(c(st, 730), 'due'); assert.equal(c(st, 731), 'due'); assert.equal(c(st, 1), 'keep'); }
});
test('unanswered (new/pending/read): flag at 90, due at 365', () => {
  for (const st of ['new', 'pending', 'read']) { assert.equal(c(st, 89), 'keep'); assert.equal(c(st, 90), 'flag'); assert.equal(c(st, 364), 'flag'); assert.equal(c(st, 365), 'due'); }
});
test('confirmed with the meeting ahead or today is never touched, even if the request is very old', () => {
  for (const off of [1, 0, 30, 400]) assert.equal(R.classify({ status: 'confirmed', createdAt: ago(2000), date: ymd(off) }, NOW, S).act, 'keep', 'offset ' + off);
});
test('confirmed past: kept through the 30-day grace, then flagged, then due once also old enough', () => {
  const at = (dateOff, age) => R.classify({ status: 'confirmed', createdAt: ago(age), date: ymd(dateOff) }, NOW, S).act;
  assert.equal(at(-1, 100), 'keep'); assert.equal(at(-29, 100), 'keep'); assert.equal(at(-32, 100), 'flag'); assert.equal(at(-60, 100), 'flag');
  assert.equal(at(-60, 729), 'flag'); assert.equal(at(-60, 730), 'due'); assert.equal(at(-1, 800), 'keep');
});
test('anything unsafe is kept: unknown status, missing/invalid/future createdAt, bad meeting date, non-objects', () => {
  assert.equal(c('weird', 5000), 'keep'); assert.equal(c(undefined, 5000), 'keep'); assert.equal(c('NEW', 5000), 'keep');
  for (const v of [null, undefined, 'x', 5, [], {}]) assert.equal(R.classify(v, NOW, S).act, 'keep');
  assert.equal(R.classify({ status: 'completed' }, NOW, S).act, 'keep');
  assert.equal(R.classify({ status: 'completed', createdAt: 'yesterday' }, NOW, S).act, 'keep');
  assert.equal(R.classify({ status: 'completed', createdAt: NOW + DAY }, NOW, S).act, 'keep');
  assert.equal(R.classify({ status: 'completed', createdAt: ago(900) }, NaN, S).act, 'keep');
  for (const d of [undefined, '', '2026-13-01', '2026-02-30', '12/01/2026', 20261201]) assert.equal(R.classify({ status: 'confirmed', createdAt: ago(5000), date: d }, NOW, S).act, 'keep', String(d));
});
test('createdAt may be a Firestore Timestamp, a Date or milliseconds', () => {
  const ts = { toMillis: () => ago(800) };
  assert.equal(R.classify({ status: 'completed', createdAt: ts }, NOW, S).act, 'due');
  assert.equal(R.classify({ status: 'completed', createdAt: new Date(ago(800)) }, NOW, S).act, 'due');
  assert.equal(R.classify({ status: 'completed', createdAt: ago(800) }, NOW, S).act, 'due');
});
test('settings: valid values used, invalid fall back, flag always before delete', () => {
  assert.deepEqual(R.settings({ requests: 365, reqFlag: 60, reqStale: 180 }), { finishedDays: 365, flagDays: 60, unansweredDays: 180, graceDays: 30 });
  assert.deepEqual(R.settings(null), S); assert.deepEqual(R.settings('x'), S);
  for (const bad of [0, -1, 1.5, '90x', 'abc', 99999, null, NaN]) assert.equal(R.settings({ requests: bad }).finishedDays, 730, String(bad));
  const s = R.settings({ reqFlag: 365, reqStale: 180 }); assert.ok(s.flagDays < s.unansweredDays);
  assert.equal(R.settings({ requests: 30 }).finishedDays, 730);
});
test('meetingEnd: valid dates only, end of day in UTC+14', () => {
  assert.equal(R.meetingEnd('2026-12-01'), Date.UTC(2026, 11, 2) + 14 * 3600e3);
  for (const d of ['2026-02-30', '2026-1-1', '', null, 5]) assert.ok(isNaN(R.meetingEnd(d)), String(d));
});
test('query cutoff is the youngest age that can matter', () => assert.equal(R.queryCutoff(NOW, S), NOW - 90 * DAY));
test('weekly banner: first time, after 7 days, not before, bad values show it', () => {
  assert.equal(R.bannerDue(undefined, NOW), true); assert.equal(R.bannerDue(0, NOW), true); assert.equal(R.bannerDue('x', NOW), true);
  assert.equal(R.bannerDue(NOW - 6.9 * DAY, NOW), false); assert.equal(R.bannerDue(NOW - 7 * DAY, NOW), true); assert.equal(R.bannerDue(NOW + DAY, NOW), true);
});
test('mask hides most of the email', () => { assert.equal(R.mask('maria@example.com'), 'm***@example.com'); assert.equal(R.mask('bad'), '***'); assert.equal(R.mask(null), '***'); });
