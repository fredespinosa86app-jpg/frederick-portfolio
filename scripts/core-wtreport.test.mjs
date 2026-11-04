import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const R = require('./core-wtreport.js'), T = require('./core-time.js'), W = require('./core-worktrack.js');
const H = 3600000, M = 60000, MANILA = 'Asia/Manila';
const at = (y, mo, d, h, mi, s, tz) => T.zonedToUtc(y, mo, d, h, mi, s || 0, tz || MANILA);
const ev = (n, type, atMs) => ({ n, type, atMs, reason: '' });
const T0 = at(2026, 11, 4, 8, 0, 0);
const day = (t0 = T0, o = {}) => [ev(1, 'CLOCK_IN', t0), ev(2, 'LUNCH_OUT', t0 + 4 * H), ev(3, 'LUNCH_IN', t0 + 5 * H), ev(4, 'CLOCK_OUT', t0 + (o.len || 9) * H)];
let k = 0;
const S = (o = {}) => Object.assign({ sid: 'sess' + String(++k).padStart(16, '0'), tz: MANILA, date: '2026-11-04', events: day(), corrections: [], assign: [{ clientId: 'CL-001', status: 'active' }] }, o);
const C = (o = {}) => Object.assign({ id: 'c' + (++k), kind: 'TIME', n: 4, atMs: T0 + 9 * H + 10 * M, reason: 'Forgot to clock out on time', createdMs: T0 + 10 * H }, o);

test('hh:mm and decimal hours round once, half up', () => {
  assert.equal(R.hm(8 * H), '08:00'); assert.equal(R.hm(8 * H + 29 * M + 29999), '08:29'); assert.equal(R.hm(8 * H + 29 * M + 30000), '08:30'); assert.equal(R.hm(null), '');
  assert.equal(R.hours(90 * M), '1.50'); assert.equal(R.hours(17999), '0.00'); assert.equal(R.hours(18000), '0.01'); assert.equal(R.hours(100 * H), '100.00');
});
test('date range: valid, reversed, too long, impossible date, default is 31 days', () => {
  assert.equal(R.validRange('2026-11-01', '2026-11-30').days, 30); assert.equal(R.validRange('2026-11-04', '2026-11-04').days, 1);
  assert.equal(R.validRange('2026-11-05', '2026-11-04').ok, false); assert.equal(R.validRange('2026-02-30', '2026-03-02').ok, false); assert.equal(R.validRange('', '2026-03-02').ok, false);
  assert.equal(R.validRange('2026-01-01', '2026-04-02').ok, true);     // 92 days
  assert.equal(R.validRange('2026-01-01', '2026-04-03').ok, false);    // 93 days
  const d = R.defaultRange('2026-11-04'); assert.equal(d.to, '2026-11-04'); assert.equal(R.dayCount(d.from, d.to), 31);
});
test('estimate: confirm above 60 sessions, refuse above 150, worst case from the real limits', () => {
  assert.equal(R.estimate(60).needsConfirm, false); assert.equal(R.estimate(61).needsConfirm, true); assert.equal(R.estimate(150).tooMany, false); assert.equal(R.estimate(151).tooMany, true);
  assert.equal(R.estimate(10).typical, 130); assert.equal(R.estimate(10).most, 10 * (1 + W.MAX_EVENTS + W.MAX_CLIENTS + 20));
});
test('a complete day: 9 h session, 1 h lunch, 8 h working', () => {
  const r = R.buildRow(S());
  assert.equal(r.status, 'complete'); assert.equal(r.eff.sessionMs, 9 * H); assert.equal(r.eff.workingMs, 8 * H); assert.equal(r.eff.breakMs, H); assert.equal(r.corrected, false); assert.deepEqual(r.clientsEff, ['CL-001']);
});
test('three clients on a 9 hour day: attendance counted once, clients not added together', () => {
  const rows = [R.buildRow(S({ assign: ['CL-001', 'CL-002', 'CL-003'].map(c => ({ clientId: c, status: 'active' })) }))];
  const s = R.summarize(rows);
  assert.equal(s.overall.workingMs, 8 * H); assert.equal(s.overall.sessions, 1);
  assert.deepEqual(s.clients.map(c => [c.key, c.workingMs]), [['CL-001', 8 * H], ['CL-002', 8 * H], ['CL-003', 8 * H]]);   // each shows the full attendance of its session, not a third
  assert.equal(s.days.length, 1); assert.equal(s.days[0].workingMs, 8 * H);
});
test('midnight: a night session stays on its start day, the whole time', () => {
  const t0 = at(2026, 11, 4, 22, 0, 0), r = R.buildRow(S({ events: [ev(1, 'CLOCK_IN', t0), ev(2, 'CLOCK_OUT', t0 + 8 * H)] }));
  const s = R.summarize([r]); assert.equal(r.date, '2026-11-04'); assert.deepEqual(s.days.map(d => [d.key, d.workingMs]), [['2026-11-04', 8 * H]]);
  assert.equal(R.localText(r.eff.endMs, MANILA), '2026-11-05 06:00:00');
});
test('daylight saving: New York elapsed time is exact on both change days', () => {
  const NY = 'America/New_York', a = at(2026, 3, 7, 22, 0, 0, NY), b = at(2026, 3, 8, 6, 0, 0, NY);
  const spring = R.buildRow(S({ tz: NY, date: '2026-03-07', events: [ev(1, 'CLOCK_IN', a), ev(2, 'CLOCK_OUT', b)] }));
  assert.equal(spring.eff.sessionMs, 7 * H);
  const c = at(2026, 10, 31, 22, 0, 0, NY), d = at(2026, 11, 1, 6, 0, 0, NY);
  const fall = R.buildRow(S({ tz: NY, date: '2026-10-31', events: [ev(1, 'CLOCK_IN', c), ev(2, 'CLOCK_OUT', d)] }));
  assert.equal(fall.eff.sessionMs, 9 * H);
});
test('a session in another zone keeps its own zone, not the current setting', () => {
  const t0 = at(2026, 6, 10, 9, 0, 0, 'Europe/London'), r = R.buildRow(S({ tz: 'Europe/London', date: '2026-06-10', events: [ev(1, 'CLOCK_IN', t0), ev(2, 'CLOCK_OUT', t0 + 4 * H)] }));
  assert.equal(R.localText(r.eff.startMs, r.tz), '2026-06-10 09:00:00'); assert.equal(R.localText(r.eff.startMs, 'Asia/Manila'), '2026-06-10 16:00:00');
});
test('corrections: effective values change, the original stays beside them', () => {
  const r = R.buildRow(S({ corrections: [C()] }));
  assert.equal(r.corrected, true); assert.equal(r.orig.sessionMs, 9 * H); assert.equal(r.eff.sessionMs, 9 * H + 10 * M); assert.equal(r.eff.workingMs, 8 * H + 10 * M); assert.equal(r.orig.workingMs, 8 * H);
});
test('corrections: an added break lowers working time; client corrections change the effective clients only', () => {
  const add = C({ kind: 'ADD', n: 0, type: 'FIRST_BREAK', atMs: T0 + 2 * H, at2Ms: T0 + 2 * H + 15 * M });
  const r = R.buildRow(S({ corrections: [add, C({ kind: 'CLIENT_ADD', clientId: 'CL-002', n: 0, atMs: null, createdMs: T0 + 11 * H }), C({ kind: 'CLIENT_REMOVE', clientId: 'CL-001', n: 0, atMs: null, createdMs: T0 + 12 * H })] }));
  assert.equal(r.eff.workingMs, 8 * H - 15 * M); assert.deepEqual(r.clientsOrig, ['CL-001']); assert.deepEqual(r.clientsEff, ['CL-002']);
});
test('corrections that give an invalid day fall back to the original with a warning', () => {
  const bad = C({ atMs: T0 + 4 * H + 30 * M });          // clock out in the middle of lunch
  const r = R.buildRow(S({ corrections: [bad] }));
  assert.equal(r.fellBack, true); assert.equal(r.corrected, false); assert.equal(r.eff.sessionMs, 9 * H); assert.match(r.problem, /original punches are used/);
});
test('corrections that end the day early and leave later punches are also refused', () => {
  const r = R.buildRow(S({ corrections: [C({ atMs: T0 + 2 * H })] }));     // clock out before lunch, lunch punches then follow it
  assert.equal(r.fellBack, true); assert.equal(r.eff.sessionMs, 9 * H);
});
test('incomplete, open and invalid sessions are listed, kept out of totals, and counted', () => {
  const inc = R.buildRow(S({ events: [ev(1, 'CLOCK_IN', T0), ev(2, 'CLOSE_INCOMPLETE', T0 + 20 * H)] }));
  const open = R.buildRow(S({ events: [ev(1, 'CLOCK_IN', T0)] }));
  const bad = R.buildRow(S({ events: [ev(1, 'CLOCK_IN', T0), ev(3, 'CLOCK_OUT', T0 + H)] }));
  const ok = R.buildRow(S());
  assert.equal(inc.status, 'incomplete'); assert.equal(inc.eff.workingMs, null); assert.equal(open.status, 'open'); assert.equal(bad.status, 'invalid'); assert.equal(bad.eff.sessionMs, null);
  const s = R.summarize([inc, open, bad, ok]); assert.equal(s.overall.sessions, 1); assert.equal(s.overall.workingMs, 8 * H); assert.deepEqual(s.overall.excluded, { incomplete: 1, open: 1, invalid: 1 });
});
test('a session with no punches at all is an invalid record, never "in progress"', () => {
  const r = R.buildRow(S({ events: [] })); assert.equal(r.status, 'invalid'); assert.match(r.problem, /No punches/); assert.equal(R.summarize([r]).overall.excluded.invalid, 1);
});
test('totals are added in milliseconds and rounded once', () => {
  const mk = i => R.buildRow(S({ date: '2026-11-0' + i, events: [ev(1, 'CLOCK_IN', T0), ev(2, 'CLOCK_OUT', T0 + H + 20000)] }));
  const rows = [mk(1), mk(2), mk(3)], s = R.summarize(rows);
  rows.forEach(r => assert.equal(R.hm(r.eff.workingMs), '01:00'));
  assert.equal(s.overall.workingMs, 3 * H + 60000); assert.equal(R.hm(s.overall.workingMs), '03:01'); assert.equal(R.hours(s.overall.workingMs), '3.02');
});
test('independent total: three days of 8, 7.5 and 9 working hours', () => {
  const mk = (i, len) => R.buildRow(S({ date: '2026-11-0' + i, events: [ev(1, 'CLOCK_IN', T0), ev(2, 'CLOCK_OUT', T0 + len)] }));
  const s = R.summarize([mk(1, 8 * H), mk(2, 7.5 * H), mk(3, 9 * H)]); assert.equal(R.hm(s.overall.workingMs), '24:30'); assert.equal(R.hours(s.overall.workingMs), '24.50');
});
test('week start: every setting, across a month and a year end', () => {
  const exp = { mon: '2026-11-02', tue: '2026-11-03', wed: '2026-11-04', thu: '2026-10-29', fri: '2026-10-30', sat: '2026-10-31', sun: '2026-11-01' };
  Object.keys(exp).forEach(w => assert.equal(R.weekKey('2026-11-04', w), exp[w], w));
  assert.equal(R.weekKey('2026-01-01', 'mon'), '2025-12-29'); assert.equal(R.weekKey('2026-11-02', 'mon'), '2026-11-02'); assert.equal(R.weekKey('2026-11-08', 'mon'), '2026-11-02'); assert.equal(R.weekKey('2026-11-09', 'mon'), '2026-11-09');
});
test('summaries group by day, week (current week start) and month, newest first', () => {
  const mk = d => R.buildRow(S({ date: d, events: day() }));
  const s = R.summarize([mk('2026-10-31'), mk('2026-11-01'), mk('2026-11-02'), mk('2026-11-04')], { weekStart: 'mon' });
  assert.deepEqual(s.months.map(m => [m.key, m.sessions]), [['2026-11', 3], ['2026-10', 1]]);
  assert.deepEqual(s.weeks.map(w => [w.key, w.sessions]), [['2026-11-02', 2], ['2026-10-26', 2]]);
  assert.deepEqual(s.days.map(d => d.key), ['2026-11-04', '2026-11-02', '2026-11-01', '2026-10-31']);
  assert.deepEqual(R.summarize([mk('2026-11-01')], { weekStart: 'sun' }).weeks.map(w => w.key), ['2026-11-01']);
});
test('filters: client uses the effective clients, status filters, newest first', () => {
  const a = R.buildRow(S({ date: '2026-11-01' })), b = R.buildRow(S({ date: '2026-11-03', assign: [{ clientId: 'CL-002', status: 'active' }] }));
  const c = R.buildRow(S({ date: '2026-11-02', corrections: [C({ kind: 'CLIENT_REMOVE', clientId: 'CL-001', n: 0, atMs: null }), C({ kind: 'CLIENT_ADD', clientId: 'CL-009', n: 0, atMs: null, createdMs: T0 + 11 * H })] }));
  const rows = [a, b, c];
  assert.deepEqual(R.filterRows(rows, {}).map(r => r.date), ['2026-11-03', '2026-11-02', '2026-11-01']);
  assert.deepEqual(R.filterRows(rows, { client: 'CL-001' }).map(r => r.date), ['2026-11-01']);
  assert.deepEqual(R.filterRows(rows, { client: 'CL-009' }).map(r => r.date), ['2026-11-02']);
  assert.deepEqual(R.filterRows(rows, { status: 'corrected' }).map(r => r.date), ['2026-11-02']);
  assert.deepEqual(R.filterRows(rows, { status: 'open' }), []);
});
test('csv cells: quoting and formula injection', () => {
  assert.equal(R.cell('plain'), 'plain'); assert.equal(R.cell('a,b'), '"a,b"'); assert.equal(R.cell('say "hi"'), '"say ""hi"""'); assert.equal(R.cell('l1\nl2'), '"l1\nl2"'); assert.equal(R.cell(null), ''); assert.equal(R.cell(0), '0');
  ['=1+1', '+1', '-1', '@SUM(A1)', '\t=1', '\r=1', ' =1', '=HYPERLINK("http://x","y")'].forEach(v => { const o = R.cell(v); assert.ok(o.replace(/^"/, '').startsWith("'"), JSON.stringify(v) + ' -> ' + o); });
  assert.equal(R.cell('\tabc'), "'\tabc"); assert.equal(R.cell('a=b'), 'a=b'); assert.equal(R.cell('2026-11-04'), '2026-11-04');
});
function parseCsv(t) {                                         // small RFC 4180 reader for the test
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\r') { /* skip */ } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); } return rows;
}
test('csv file: BOM, CRLF, every row has every column, original and effective side by side', () => {
  const corrected = R.buildRow(S({ corrections: [C({ reason: 'Said "late", then = comma, here\nnew line' })], assign: [{ clientId: 'CL-001', status: 'active' }, { clientId: 'CL-002', status: 'active' }] }));
  const open = R.buildRow(S({ events: [ev(1, 'CLOCK_IN', T0)] }));
  const text = R.csv([corrected, open]);
  assert.equal(text.charCodeAt(0), 0xFEFF); assert.ok(text.endsWith('\r\n')); assert.ok(!/[^\r]\n(?=[^"]*(?:"[^"]*"[^"]*)*$)/.test(text.replace(/"[^"]*"/g, '""')), 'bare line feed outside quotes');
  const rows = parseCsv(text.slice(1)); assert.equal(rows.length, 3); rows.forEach(r => assert.equal(r.length, R.COLUMNS.length));
  const h = rows[0], col = (r, n) => r[h.indexOf(n)], a = rows[1];
  assert.equal(col(a, 'corrected'), 'yes'); assert.equal(col(a, 'original_end'), '2026-11-04 17:00:00'); assert.equal(col(a, 'effective_end'), '2026-11-04 17:10:00');
  assert.equal(col(a, 'original_working_hhmm'), '08:00'); assert.equal(col(a, 'working_hhmm'), '08:10'); assert.equal(col(a, 'working_hours'), '8.17'); assert.equal(col(a, 'effective_clients'), 'CL-001 CL-002');
  assert.match(col(a, 'correction_notes'), /Said "late", then = comma, here\nnew line/); assert.equal(col(a, 'corrections'), '1');
  const o = rows[2]; assert.equal(col(o, 'status'), 'In progress'); assert.equal(col(o, 'working_hours'), '');
});
test('csv name is safe', () => { assert.equal(R.csvName('2026-11-01', '2026-11-30', 'Asia/Manila'), 'worktrack-2026-11-01_to_2026-11-30-Asia-Manila.csv'); assert.equal(R.csvName('a', 'b', '../x y'), 'worktrack-a_to_b--x-y.csv'); });
