// Run: node --test scripts/core.test.mjs   (Node 20+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const ids = req('./core-ids.js'), money = req('./core-money.js'), tm = req('./core-time.js');

/* ---------------- Client IDs ---------------- */
test('client ID: valid forms are accepted and upper-cased', () => {
  for (const s of ['CL-001', 'cl-001', ' oa-uk-001 ', 'GHL-PROJ-003', 'AUTOMATION-001', 'CLIENT-2026-002', 'ABC']) assert.equal(ids.validateClientId(s).ok, true, s);
  assert.equal(ids.validateClientId(' oa-uk-001 ').id, 'OA-UK-001');
});
test('client ID: invalid forms are refused', () => {
  for (const s of ['', 'AB', 'A'.repeat(25), '1CL-001', 'CL_001', 'CL 001', 'CL--001', 'CL-001-', '-CL001', 'CL/001', 'CL.001', 'ÉCL-001', 'CL\n001']) assert.equal(ids.validateClientId(s).ok, false, JSON.stringify(s));
});
test('client ID: 24 characters is the longest allowed', () => { assert.equal(ids.validateClientId('A' + 'B'.repeat(22) + 'C').ok, true); });
test('client ID regex matches exactly what the validator accepts (rules parity)', () => {
  const samples = ['CL-001', 'AB', 'ABC', 'A-B', 'A--B', 'AB-', 'A1B', 'AAAAAAAAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAAAAAAAAA', 'A_B', 'a-b'];
  for (const s of samples) { const strict = ids.CLIENT_ID_RE.test(s) && !/--/.test(s); assert.equal(strict, ids.validateClientId(s).ok && ids.normalizeClientId(s) === s, s); }
});
test('numbering format: defaults, validation and next ID', () => {
  assert.deepEqual(ids.nextClientId(ids.DEFAULT_FORMAT, []).id, 'CL-001');
  assert.equal(ids.nextClientId(ids.DEFAULT_FORMAT, ['CL-001', 'CL-002', 'OTHER-009']).id, 'CL-003');
  assert.equal(ids.nextClientId(ids.DEFAULT_FORMAT, ['CL-007']).id, 'CL-008');          // never fills lower gaps
  assert.equal(ids.nextClientId({ prefix: 'OA', digits: 4, start: 50, year: '' }, []).id, 'OA-0050');
  assert.equal(ids.nextClientId({ prefix: 'CLIENT', digits: 3, start: 1, year: '2026' }, ['CLIENT-2026-002']).id, 'CLIENT-2026-003');
  assert.equal(ids.nextClientId({ prefix: 'CL', digits: 3, start: 1, year: '' }, ['CL-999']).ok, false);
  for (const f of [{ prefix: 'C' }, { prefix: 'ABCDEFG' }, { prefix: 'C1' }, { prefix: 'CL', digits: 2 }, { prefix: 'CL', digits: 7 }, { prefix: 'CL', start: 0 }, { prefix: 'CL', year: '26' }]) assert.equal(ids.cleanFormat(f).ok, false, JSON.stringify(f));
});
test('numbering format: generated IDs always pass the validator', () => {
  for (const f of [{ prefix: 'CL', digits: 3, start: 1, year: '' }, { prefix: 'ABCDEF', digits: 6, start: 999999, year: '2026' }]) { const r = ids.nextClientId(f, []); if (r.ok) assert.equal(ids.validateClientId(r.id).ok, true, r.id); }
});

/* ---------------- Invoice IDs and idempotency ---------------- */
test('invoice ID: layout is stable and unambiguous', () => {
  assert.equal(ids.invoiceId('cl-001', '2026-11-01', '2026-11-15'), 'CL-001__20261101__20261115');
  assert.deepEqual(ids.parseInvoiceId('CL-001__20261101__20261115'), { clientId: 'CL-001', start: '2026-11-01', end: '2026-11-15' });
  assert.equal(ids.parseInvoiceId('CL-001__20261115__20261101'), null);
  assert.equal(ids.parseInvoiceId('CL-001_20261101_20261115'), null);
  assert.equal(ids.parseInvoiceId('CL-001__20261301__20261315'), null);
  assert.throws(() => ids.invoiceId('CL_001', '2026-11-01', '2026-11-15'));
  assert.throws(() => ids.invoiceId('CL-001', '2026-02-30', '2026-03-01'));
  assert.throws(() => ids.invoiceId('CL-001', '2026-11-15', '2026-11-01'));
});
test('invoice ID: two different clients and periods never collide', () => {
  const s = new Set(); for (const c of ['CL-001', 'CL-0011', 'CL-001-1']) for (const [a, b] of [['2026-11-01', '2026-11-15'], ['2026-11-16', '2026-11-30']]) s.add(ids.invoiceId(c, a, b));
  assert.equal(s.size, 6);
});
test('idempotency: keys, operation names and hashes', async () => {
  const k = ids.newKey(); assert.match(k, /^[A-Za-z0-9]{12,40}$/); assert.notEqual(k, ids.newKey());
  assert.equal(ids.opId('payment', 'abcdefghijkl'), 'payment:abcdefghijkl');
  assert.throws(() => ids.opId('Pay', 'abcdefghijkl')); assert.throws(() => ids.opId('payment', 'short'));
  const a = await ids.payloadHash({ b: 2, a: [1, { y: 1, x: 2 }] }), b = await ids.payloadHash({ a: [1, { x: 2, y: 1 }], b: 2 });
  assert.equal(a, b); assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(await ids.checkRetry('', { a: 1 }), 'new');
  assert.equal(await ids.checkRetry(await ids.payloadHash({ a: 1 }), { a: 1 }), 'same');
  assert.equal(await ids.checkRetry(await ids.payloadHash({ a: 1 }), { a: 2 }), 'conflict');
});

/* ---------------- Money ---------------- */
test('money: supported currencies and exponents', () => {
  assert.deepEqual([money.exponent('USD'), money.exponent('JPY'), money.exponent('KWD')], [2, 0, 3]);
  assert.throws(() => money.exponent('XYZ')); assert.throws(() => money.exponent('usd')); assert.equal(money.isSupported('constructor'), false);
});
test('money: toMinor / fromMinor never use floats', () => {
  assert.equal(money.toMinor('3.00', 'USD'), 300); assert.equal(money.toMinor('3', 'USD'), 300); assert.equal(money.toMinor('0.1', 'USD'), 10);
  assert.equal(money.toMinor('1500', 'JPY'), 1500); assert.equal(money.toMinor('1.234', 'KWD'), 1234);
  assert.throws(() => money.toMinor('1.5', 'JPY')); assert.throws(() => money.toMinor('1.234', 'USD')); assert.throws(() => money.toMinor('-1', 'USD')); assert.throws(() => money.toMinor('1e3', 'USD')); assert.throws(() => money.toMinor('', 'USD'));
  assert.equal(money.fromMinor(300, 'USD'), '3.00'); assert.equal(money.fromMinor(5, 'USD'), '0.05'); assert.equal(money.fromMinor(1500, 'JPY'), '1500'); assert.equal(money.fromMinor(1234, 'KWD'), '1.234'); assert.equal(money.fromMinor(7, 'KWD'), '0.007');
  assert.equal(money.toMinor('0.1', 'USD') + money.toMinor('0.2', 'USD'), money.toMinor('0.3', 'USD'));
  assert.equal(money.format(123456789, 'USD'), 'USD 1,234,567.89'); assert.equal(money.format(1500, 'JPY'), 'JPY 1,500');
});
test('invoice total: 40 hours at $3.00 = $120.00 (spec example)', () => {
  assert.equal(money.invoiceTotal(300, [40 * 60]).amount, 12000); assert.equal(money.fromMinor(12000, 'USD'), '120.00');
});
test('invoice total: rounds once, half up, at the total', () => {
  assert.equal(money.lineTotal(300, 1), 5);          // 3.00/h for 1 min = 0.05
  assert.equal(money.lineTotal(1, 30), 1);           // 0.5 -> 1 (half up)
  assert.equal(money.lineTotal(1, 29), 0);           // 0.483 -> 0
  assert.equal(money.lineTotal(1, 31), 1);
  // rounding per entry would give 1+1 = 2; summing first gives round(0.5+0.5)=1
  assert.equal(money.invoiceTotal(1, [30, 30]).amount, 1);
  assert.equal(money.lineTotal(0, 100), 0); assert.equal(money.lineTotal(100, 0), 0);
  assert.equal(money.lineTotal(333, 7 * 60 + 15), 2414); // 333 x 7.25 = 2414.25 -> 2414
});
test('invoice total: JPY and KWD scales', () => {
  assert.equal(money.lineTotal(money.toMinor('1500', 'JPY'), 90), 2250);
  assert.equal(money.fromMinor(money.lineTotal(money.toMinor('2.500', 'KWD'), 150), 'KWD'), '6.250');
});
test('invoice total: invalid inputs are refused', () => {
  assert.throws(() => money.lineTotal(-1, 10)); assert.throws(() => money.lineTotal(1.5, 10)); assert.throws(() => money.lineTotal(1, 1.5)); assert.throws(() => money.invoiceTotal(1, [10, -1])); assert.throws(() => money.lineTotal(Number.MAX_SAFE_INTEGER, 100000));
});
test('hours to minutes', () => {
  assert.equal(money.hoursToMinutes('40'), 2400); assert.equal(money.hoursToMinutes('7.5'), 450); assert.equal(money.hoursToMinutes('7.25'), 435);
  assert.throws(() => money.hoursToMinutes('7.33')); assert.throws(() => money.hoursToMinutes('-1')); assert.throws(() => money.hoursToMinutes('x'));
});

/* ---------------- Time ---------------- */
const MNL = 'Asia/Manila', NY = 'America/New_York';
test('time zones: validation', () => { assert.equal(tm.isValidTimeZone(MNL), true); assert.equal(tm.isValidTimeZone('Mars/Base'), false); assert.equal(tm.isValidTimeZone('Asia/Manila; x'), false); assert.equal(tm.isValidTimeZone(''), false); });
test('time: durations are UTC differences and reject negative spans', () => {
  assert.equal(tm.durationMs(1000, 4000), 3000); assert.throws(() => tm.durationMs(5, 4)); assert.throws(() => tm.durationMs(NaN, 4));
  assert.equal(tm.formatDuration(3661000), '01:01:01'); assert.equal(tm.formatDuration(-5), '00:00:00'); assert.equal(tm.formatDuration(100 * 3600000), '100:00:00');
});
test('time: Manila local date and offset (+08:00, no DST)', () => {
  const t = Date.UTC(2026, 10, 4, 16, 30); // 2026-11-05 00:30 Manila
  assert.equal(tm.localDateKey(t, MNL), '2026-11-05'); assert.equal(tm.offsetMs(t, MNL), 8 * 3600000);
  assert.equal(tm.zonedToUtc(2026, 11, 5, 0, 30, 0, MNL), t);
});
test('time: session crossing local midnight splits into two days with the right totals', () => {
  const s = tm.zonedToUtc(2026, 11, 4, 22, 0, 0, MNL), e = tm.zonedToUtc(2026, 11, 5, 6, 0, 0, MNL), p = tm.splitByLocalDay(s, e, MNL);
  assert.deepEqual(p.map(x => [x.date, x.ms / 3600000]), [['2026-11-04', 2], ['2026-11-05', 6]]); assert.equal(p.reduce((a, x) => a + x.ms, 0), e - s);
});
test('time: DST spring-forward day in New York is 23 hours', () => {
  const s = tm.zonedToUtc(2026, 3, 8, 0, 0, 0, NY), e = tm.zonedToUtc(2026, 3, 9, 0, 0, 0, NY);
  assert.equal((e - s) / 3600000, 23); const p = tm.splitByLocalDay(s - 3600000, e + 3600000, NY);
  assert.deepEqual(p.map(x => [x.date, x.ms / 3600000]), [['2026-03-07', 1], ['2026-03-08', 23], ['2026-03-09', 1]]);
});
test('time: DST fall-back day in New York is 25 hours', () => {
  const s = tm.zonedToUtc(2026, 11, 1, 0, 0, 0, NY), e = tm.zonedToUtc(2026, 11, 2, 0, 0, 0, NY);
  assert.equal((e - s) / 3600000, 25); assert.deepEqual(tm.splitByLocalDay(s, e, NY).map(x => [x.date, x.ms / 3600000]), [['2026-11-01', 25]]);
});
test('time: a work shift over a DST change counts real elapsed time', () => {
  const s = tm.zonedToUtc(2026, 3, 7, 22, 0, 0, NY), e = tm.zonedToUtc(2026, 3, 8, 6, 0, 0, NY); assert.equal((e - s) / 3600000, 7);   // 8 wall-clock hours, 7 elapsed
});
test('time: month helpers (leap years, 31st clamps, year change)', () => {
  assert.equal(tm.daysInMonth(2028, 2), 29); assert.equal(tm.daysInMonth(2026, 2), 28); assert.equal(tm.daysInMonth(2026, 4), 30);
  assert.equal(tm.clampDay(2026, 2, 31), 28); assert.equal(tm.clampDay(2028, 2, 31), 29); assert.equal(tm.clampDay(2026, 4, 31), 30); assert.equal(tm.clampDay(2026, 12, 31), 31); assert.equal(tm.clampDay(2026, 4, 15), 15);
  assert.equal(tm.addDaysIso('2026-12-31', 1), '2027-01-01'); assert.equal(tm.addDaysIso('2028-02-28', 1), '2028-02-29'); assert.equal(tm.addDaysIso('2026-03-01', -1), '2026-02-28');
});
test('time: unknown zone and over-long intervals are refused', () => {
  assert.throws(() => tm.splitByLocalDay(0, 1000, 'Mars/Base')); assert.throws(() => tm.splitByLocalDay(0, 500 * 86400000, MNL));
});
