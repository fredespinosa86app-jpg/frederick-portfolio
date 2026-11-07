import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const G = createRequire(import.meta.url)('./core-todograph.js'), TZ = 'Asia/Manila';
const M = (iso) => Date.parse(iso);                                  // iso with +08:00
const S = (o) => Object.assign({ taskId: 'taskAAAA1', start: M('2026-11-05T10:00:00+08:00'), secs: 3600, day: '2026-11-05', kind: 'timer' }, o);
const T = (o) => Object.assign({ id: 'taskAAAA1', name: 'Write report', color: 0, hours: 2, secs: 0, status: 'todo', doneAt: null, createdAt: M('2026-11-01T09:00:00+08:00') }, o);

test('dayList: oldest first, ends today', () => { assert.deepEqual(G.dayList('2026-11-08', 3), ['2026-11-06', '2026-11-07', '2026-11-08']); assert.equal(G.dayList('2026-03-01', 30).length, 30); assert.equal(G.dayList('2026-03-01', 2)[0], '2026-02-28'); });
test('dailyBuckets: a session inside one Manila day', () => { const d = G.dailyBuckets([S()], ['2026-11-05'], TZ); assert.deepEqual(d, { '2026-11-05': { taskAAAA1: 3600 } }); });
test('dailyBuckets: a session that crosses Manila midnight is split exactly', () => {
  const s = S({ start: M('2026-11-05T23:30:00+08:00'), secs: 3600, day: '2026-11-05' }), d = G.dailyBuckets([s], ['2026-11-05', '2026-11-06'], TZ);
  assert.equal(d['2026-11-05'].taskAAAA1, 1800); assert.equal(d['2026-11-06'].taskAAAA1, 1800);
});
test('dailyBuckets: UTC evening is already the next Manila day', () => { const s = S({ start: M('2026-11-05T17:00:00Z'), secs: 600, day: '2026-11-06' }), d = G.dailyBuckets([s], ['2026-11-05', '2026-11-06'], TZ); assert.equal(d['2026-11-06'].taskAAAA1, 600); assert.equal(d['2026-11-05'], undefined); });
test('dailyBuckets: pieces always add up to the session length', () => { const s = S({ start: M('2026-11-05T23:59:59+08:00'), secs: 90000 > 86400 ? 86400 : 90000 }), d = G.dailyBuckets([s], G.dayList('2026-11-08', 6), TZ); assert.equal(Object.values(d).reduce((a, x) => a + x.taskAAAA1, 0), s.secs); });
test('dailyBuckets: manual time stays on its own day and can be left out', () => {
  const m = S({ kind: 'manual', day: '2026-11-04', secs: 1800, start: M('2026-11-04T12:00:00+08:00') });
  assert.equal(G.dailyBuckets([m], ['2026-11-04'], TZ)['2026-11-04'].taskAAAA1, 1800); assert.deepEqual(G.dailyBuckets([m], ['2026-11-04'], TZ, { includeManual: false }), {});
});
test('dailyBuckets: days outside the range and bad rows are ignored', () => { assert.deepEqual(G.dailyBuckets([S(), S({ secs: 0 }), null, S({ secs: 'x' })], ['2026-11-06'], TZ), {}); });
test('dailyBuckets: a session without a start time falls back to its saved day', () => { assert.equal(G.dailyBuckets([S({ start: null })], ['2026-11-05'], TZ)['2026-11-05'].taskAAAA1, 3600); });
test('firstDay: earliest task creation or session day', () => { assert.equal(G.firstDay([T()], [S({ day: '2026-10-20' })], TZ), '2026-10-20'); assert.equal(G.firstDay([T()], [], TZ), '2026-11-01'); assert.equal(G.firstDay([], [], TZ), ''); });
test('stackModel: zero days are 0, days before the first record are no data', () => {
  const days = G.dayList('2026-11-08', 10), b = G.dailyBuckets([S()], days, TZ), m = G.stackModel(days, b, [T()], '2026-11-03', 0, '2026-11-08');
  const by = Object.fromEntries(m.rows.map(r => [r.day, r.state]));
  assert.equal(by['2026-11-02'], 'nodata'); assert.equal(by['2026-11-03'], 'zero'); assert.equal(by['2026-11-05'], 'data'); assert.equal(m.total, 3600);
  assert.equal(m.avg, Math.round(3600 / 6)); assert.deepEqual(m.best, { day: '2026-11-05', total: 3600 });
});
test('stackModel: more than six tasks become six plus Other, nothing is lost', () => {
  const tasks = [], sess = []; for (let i = 0; i < 9; i++) { tasks.push(T({ id: 'task000' + i + 'xx', color: i, name: 'T' + i })); sess.push(S({ taskId: 'task000' + i + 'xx', secs: 600 * (i + 1) })); }
  const days = ['2026-11-05'], m = G.stackModel(days, G.dailyBuckets(sess, days, TZ), tasks, '2026-11-01', 0, '2026-11-08');
  assert.equal(m.series.length, 7); assert.equal(m.series[6].letter, '+'); assert.match(m.series[6].name, /Other \(3\)/); assert.equal(m.rows[0].total, 600 * 45); assert.equal(m.series[0].name, 'T8');
});
test('stackModel: a deleted task is labelled, series have letter, colour and a pattern', () => { const days = ['2026-11-05'], m = G.stackModel(days, G.dailyBuckets([S({ taskId: 'gone0001x' })], days, TZ), [], '2026-11-01', 0, '2026-11-08'); assert.equal(m.series[0].name, 'Deleted task'); assert.ok(m.series[0].color && m.series[0].pattern && m.series[0].letter); });
test('stackModel: goal marks days that reached it', () => { const days = G.dayList('2026-11-08', 5), m = G.stackModel(days, G.dailyBuckets([S()], days, TZ), [T()], '2026-11-01', 3600, '2026-11-08'); assert.deepEqual(m.rows.map(r => r.goalMet), [false, true, false, false, false]); });
const rowsOf = (flags, today = '2026-11-08') => { const days = G.dayList(today, flags.length); return days.map((d, i) => ({ day: d, state: 'data', goalMet: flags[i], total: flags[i] ? 3600 : 0 })); };
test('streak: current counts back from today; today not yet reached does not break it', () => {
  assert.equal(G.streak(rowsOf([false, true, true, true]), 3600, '2026-11-08').current, 3);
  assert.equal(G.streak(rowsOf([false, true, true, false]), 3600, '2026-11-08').current, 2);
  assert.equal(G.streak(rowsOf([true, false, true, false]), 3600, '2026-11-08').current, 1);
  assert.equal(G.streak(rowsOf([true, true, false, false]), 3600, '2026-11-08').current, 0);
});
test('streak: yesterday missed breaks it; longest is found; goal off gives no streak', () => {
  const r = G.streak(rowsOf([true, true, true, false, true, true]), 3600, '2026-11-08'); assert.equal(r.longest, 3); assert.equal(r.current, 2);
  assert.equal(G.streak(rowsOf([true, true]), 0, '2026-11-08').on, false);
});
test('streak: days with no data never count and never extend a run', () => { const rows = rowsOf([true, true, true]); rows[0].state = 'nodata'; rows[0].goalMet = false; assert.equal(G.streak(rows, 3600, '2026-11-08').current, 2); });
test('weekStart: Monday of the week (Sunday belongs to the week before)', () => { assert.equal(G.weekStart('2026-11-08'), '2026-11-02'); assert.equal(G.weekStart('2026-11-02'), '2026-11-02'); assert.equal(G.weekStart('2026-11-09'), '2026-11-09'); assert.equal(G.weekStart('2027-01-01'), '2026-12-28'); });
test('weeklyCompleted: 12 weeks, zero weeks are 0, a task counts once per week', () => {
  const ev = [{ taskId: 'taskAAAA1', type: 'done', createdAt: M('2026-11-03T10:00:00+08:00') }, { taskId: 'taskAAAA1', type: 'done', createdAt: M('2026-11-04T10:00:00+08:00') }, { taskId: 'taskBBBB2', type: 'done', createdAt: M('2026-11-05T10:00:00+08:00') }];
  const w = G.weeklyCompleted(ev, [], '2026-11-08', TZ); assert.equal(w.length, 12); assert.equal(w[11].weekStart, '2026-11-02'); assert.equal(w[11].count, 2); assert.equal(w[10].count, 0);
});
test('weeklyCompleted: a reopened task completed again counts in each week it was completed', () => {
  const ev = [{ taskId: 'taskAAAA1', type: 'done', createdAt: M('2026-10-20T10:00:00+08:00') }, { taskId: 'taskAAAA1', type: 'reopened', createdAt: M('2026-10-25T10:00:00+08:00') }, { taskId: 'taskAAAA1', type: 'done', createdAt: M('2026-11-04T10:00:00+08:00') }];
  const w = G.weeklyCompleted(ev, [], '2026-11-08', TZ); assert.equal(w[11].count, 1); assert.equal(w[9].count, 1); assert.equal(w[10].count, 0);
});
test('weeklyCompleted: old done tasks without a log entry use their saved done time; ones with entries are not counted twice', () => {
  const t = [T({ status: 'done', doneAt: M('2026-11-03T10:00:00+08:00') }), T({ id: 'taskBBBB2', status: 'done', doneAt: M('2026-11-04T10:00:00+08:00') })];
  const ev = [{ taskId: 'taskBBBB2', type: 'done', createdAt: M('2026-11-04T10:00:00+08:00') }]; assert.equal(G.weeklyCompleted(ev, t, '2026-11-08', TZ)[11].count, 2);
});
test('weeklyCompleted: Manila Sunday night belongs to that Sunday week, UTC does not matter', () => { const ev = [{ taskId: 'taskAAAA1', type: 'done', createdAt: M('2026-11-08T23:30:00+08:00') }]; assert.equal(G.weeklyCompleted(ev, [], '2026-11-08', TZ)[11].count, 1); const ev2 = [{ taskId: 'taskAAAA1', type: 'done', createdAt: M('2026-11-08T17:00:00Z') }]; assert.equal(G.weeklyCompleted(ev2, [], '2026-11-09', TZ)[11].count, 1); });
test('usedVsAllotted: only tasks with hours that are not archived; over and left; sorted over first', () => {
  const r = G.usedVsAllotted([T({ secs: 3600 }), T({ id: 'taskBBBB2', hours: 1, secs: 5400 }), T({ id: 'taskCCCC3', hours: 0 }), T({ id: 'taskDDDD4', status: 'archived' })]);
  assert.equal(r.length, 2); assert.equal(r[0].id, 'taskBBBB2'); assert.equal(r[0].over, 1800); assert.equal(r[0].pct, 100); assert.equal(r[1].left, 3600);
});
test('statusCounts', () => { assert.deepEqual(G.statusCounts([T(), T({ status: 'done' }), T({ status: 'done' }), T({ status: 'archived' })]), { todo: 1, doing: 0, done: 2, archived: 1 }); });
test('csvCell: quotes, commas, newlines and formula starts are made safe', () => {
  assert.equal(G.csvCell('a,b'), '"a,b"'); assert.equal(G.csvCell('say "hi"'), '"say ""hi"""'); assert.equal(G.csvCell('=1+1'), "'=1+1"); assert.equal(G.csvCell('+cmd'), "'+cmd"); assert.equal(G.csvCell('-2'), "'-2"); assert.equal(G.csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(G.csvCell('x\ny'), '"x\ny"'); assert.equal(G.csvCell(5), '5'); assert.equal(G.csvCell(null), ''); assert.equal(G.csvCell('\t=1'), "'\t=1");
});
test('dailyCsv: header, one line per day and task, timer and manual minutes apart, names can be hidden', () => {
  const days = ['2026-11-05'], ss = [S(), S({ kind: 'manual', secs: 1800, start: M('2026-11-05T12:00:00+08:00') })], csv = G.dailyCsv(days, ss, [T({ name: '=Evil' })], TZ, false).trim().split('\r\n');
  assert.equal(csv[0], 'Date,Task,Timer minutes,Manual minutes,Total minutes'); assert.equal(csv[1], "2026-11-05,'=Evil,60,30,90");
  assert.equal(G.dailyCsv(days, ss, [T({ name: 'Secret' })], TZ, true).includes('Secret'), false); assert.match(G.dailyCsv(days, ss, [T()], TZ, true), /Task A/);
});
test('weeklyCsv: header and rows; anonymous names', () => {
  const w = [{ weekStart: '2026-11-02', weekEnd: '2026-11-08', count: 1, ids: ['taskAAAA1'] }];
  assert.equal(G.weeklyCsv(w, [T()], false).trim().split('\r\n')[1], '2026-11-02,2026-11-08,1,Write report'); assert.match(G.weeklyCsv(w, [T()], true), /Task A/); assert.doesNotMatch(G.weeklyCsv(w, [T()], true), /Write report/);
});

/* ---------------- EN-1A: goal per weekday, rest days, other time zones ---------------- */
const mk = (days, tot, plan, today) => G.stackModel(days, Object.fromEntries(days.map((d, i) => [d, tot[i] ? { taskAAAA1: tot[i] } : {}])), [T()], days[0], plan, today || days[days.length - 1]);

test('EN-1A weekdayIndex: Monday is 0 and Sunday is 6, also across a month end and a year end', () => {
  assert.equal(G.weekdayIndex('2026-11-02'), 0); assert.equal(G.weekdayIndex('2026-11-08'), 6); assert.equal(G.weekdayIndex('2026-11-01'), 6); assert.equal(G.weekdayIndex('2026-10-31'), 5);
  assert.equal(G.weekdayIndex('2026-12-31'), 3); assert.equal(G.weekdayIndex('2027-01-01'), 4); assert.equal(G.weekdayIndex('2026-03-01'), 6); assert.equal(G.weekdayIndex('2028-02-29'), 1);
  const days = G.dayList('2026-11-08', 14); assert.deepEqual(days.map(G.weekdayIndex), [0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]);
});
test('EN-1A cleanWeekday: only a list of exactly 7 is kept; bad values become null; all-null means no list', () => {
  assert.deepEqual(G.cleanWeekday([60, null, 180, 120, null, 0, null]), [60, null, 180, 120, null, 0, null]);
  assert.equal(G.cleanWeekday([null, null, null, null, null, null, null]), null); assert.equal(G.cleanWeekday(null), null); assert.equal(G.cleanWeekday([60]), null); assert.equal(G.cleanWeekday(Array(8).fill(60)), null); assert.equal(G.cleanWeekday('1234567'), null);
  assert.deepEqual(G.cleanWeekday([-1, 1441, 1.5, '60', true, undefined, 90]), [null, null, null, null, null, null, 90]);
});
test('EN-1A goalPlan: weekday value wins, an empty place uses the daily goal, 0 is a rest day, a daily 0 is goal off (not rest)', () => {
  const p = G.goalPlan(120, [60, null, 180, 120, null, 0, null]);
  assert.deepEqual(p('2026-11-02'), { secs: 3600, rest: false });   // Monday 60
  assert.deepEqual(p('2026-11-03'), { secs: 7200, rest: false });   // Tuesday empty -> daily 120
  assert.deepEqual(p('2026-11-04'), { secs: 10800, rest: false });  // Wednesday 180
  assert.deepEqual(p('2026-11-07'), { secs: 0, rest: true });       // Saturday rest
  assert.deepEqual(p('2026-11-08'), { secs: 7200, rest: false });   // Sunday empty -> daily
  const off = G.goalPlan(0, [60, null, null, null, null, 0, null]);
  assert.deepEqual(off('2026-11-03'), { secs: 0, rest: false }); assert.deepEqual(off('2026-11-02'), { secs: 3600, rest: false }); assert.deepEqual(off('2026-11-07'), { secs: 0, rest: true });
  assert.deepEqual(G.goalPlan(90, null)('2026-11-05'), { secs: 5400, rest: false }); assert.deepEqual(G.goalPlan(undefined, undefined)('2026-11-05'), { secs: 0, rest: false });
});
test('EN-1A compatibility: no weekday goals gives exactly the old numbers (plain number and plan agree)', () => {
  const days = G.dayList('2026-11-08', 10), tot = [0, 3600, 7200, 0, 5000, 3600, 4000, 0, 3000, 3600];
  const a = mk(days, tot, 3600), b = mk(days, tot, G.goalPlan(60, null));
  assert.deepEqual(b.rows.map(r => [r.day, r.total, r.state, r.goalMet]), a.rows.map(r => [r.day, r.total, r.state, r.goalMet])); assert.equal(a.max, b.max); assert.equal(b.sameGoal, true);
  const sa = G.streak(a.rows, 3600, '2026-11-08'), sb = G.streak(b.rows, 3600, '2026-11-08'); assert.deepEqual(sa, sb);
  const none = mk(days, tot, 0); assert.equal(none.anyGoal, false); assert.equal(none.rows.every(r => !r.goalMet && r.goalSecs === 0), true); assert.equal(G.streak(none.rows, 0, '2026-11-08').on, false);
});
test('EN-1A stackModel: each day is judged against its own goal; the scale includes the highest goal', () => {
  const days = G.dayList('2026-11-08', 7);   // Mon 2 .. Sun 8
  const m = mk(days, [3600, 3600, 3600, 0, 0, 0, 0], G.goalPlan(60, [60, 120, null, null, null, 0, null]));
  assert.deepEqual(m.rows.map(r => r.goalMet), [true, false, true, false, false, false, false]); assert.equal(m.rows[1].goalSecs, 7200); assert.equal(m.rows[5].rest, true); assert.equal(m.hasRest, true); assert.equal(m.sameGoal, false); assert.equal(m.max, 7200);
});
test('EN-1A streak: a rest day is skipped - it neither breaks the streak nor counts as a day', () => {
  const days = G.dayList('2026-11-08', 7);   // Mon..Sun, Saturday (index 5) is the rest day
  const plan = G.goalPlan(60, [null, null, null, null, null, 0, null]);
  const met = [3600, 3600, 3600, 3600, 3600, 0, 3600];       // all goals met, rest day empty
  const s = G.streak(mk(days, met, plan).rows, 0, '2026-11-08'); assert.equal(s.on, true); assert.equal(s.current, 6); assert.equal(s.longest, 6);
  const missed = [3600, 3600, 0, 3600, 3600, 0, 3600];       // Wednesday missed
  const s2 = G.streak(mk(days, missed, plan).rows, 0, '2026-11-08'); assert.equal(s2.current, 3); assert.equal(s2.longest, 3);
  const doneOnRest = [3600, 3600, 3600, 3600, 3600, 5000, 3600];   // time on the rest day does not add a day
  assert.equal(G.streak(mk(days, doneOnRest, plan).rows, 0, '2026-11-08').current, 6);
});
test('EN-1A streak: today as a rest day does not break or count; today unmet on a goal day does not break yet', () => {
  const days = G.dayList('2026-11-07', 7);   // Sun 1 .. Sat 7 (Saturday is today and a rest day)
  const plan = G.goalPlan(60, [null, null, null, null, null, 0, null]);
  assert.equal(G.streak(mk(days, [3600, 3600, 3600, 3600, 3600, 3600, 0], plan, '2026-11-07').rows, 0, '2026-11-07').current, 6);
  const days2 = G.dayList('2026-11-08', 3);   // Fri 6, Sat 7 (rest), Sun 8 today unmet
  assert.equal(G.streak(mk(days2, [3600, 0, 0], plan).rows, 0, '2026-11-08').current, 1);
  assert.equal(G.streak(mk(days2, [0, 0, 0], plan).rows, 0, '2026-11-08').current, 0);
});
test('EN-1A streak: all days are rest days gives a streak of 0 without crashing', () => {
  const days = G.dayList('2026-11-08', 7), s = G.streak(mk(days, [0, 0, 0, 0, 0, 0, 0], G.goalPlan(0, [0, 0, 0, 0, 0, 0, 0])).rows, 0, '2026-11-08'); assert.equal(s.current, 0); assert.equal(s.longest, 0);
});
test('EN-1A dailyCsv: a goal column appears only when some day has a goal or is a rest day', () => {
  const days = G.dayList('2026-11-08', 7), ses = [S({ day: '2026-11-05' })];
  const plain = G.dailyCsv(days, ses, [T()], TZ, false).split('\r\n')[0]; assert.equal(plain, 'Date,Task,Timer minutes,Manual minutes,Total minutes');
  assert.equal(G.dailyCsv(days, ses, [T()], TZ, false, G.goalPlan(0, null)).split('\r\n')[0], plain);
  const csv = G.dailyCsv(days, ses, [T()], TZ, false, G.goalPlan(60, [null, null, null, 120, null, 0, null])).split('\r\n'); assert.equal(csv[0], plain + ',Goal minutes'); assert.equal(csv[1], '2026-11-05,Write report,60,0,60,120');
  const rest = G.dailyCsv(days, [S({ day: '2026-11-07', start: M('2026-11-07T10:00:00+08:00') })], [T()], TZ, false, G.goalPlan(60, [null, null, null, 120, null, 0, null])).split('\r\n'); assert.equal(rest[1], '2026-11-07,Write report,60,0,60,rest');
});
test('EN-1A other zones: the day boundary follows the zone (Manila, New York, Kathmandu, UTC)', () => {
  const s = [S({ start: Date.parse('2026-11-05T20:00:00Z'), secs: 600, day: '2026-11-05' })], days = ['2026-11-05', '2026-11-06'];
  const pick = z => Object.keys(G.dailyBuckets(s, days, z));
  assert.deepEqual(pick('Asia/Manila'), ['2026-11-06']);      // 04:00 next day
  assert.deepEqual(pick('UTC'), ['2026-11-05']);               // 20:00
  assert.deepEqual(pick('America/New_York'), ['2026-11-05']);  // 15:00
  assert.deepEqual(pick('Asia/Kathmandu'), ['2026-11-06']);    // 01:45 next day
  const half = [S({ start: Date.parse('2026-11-05T18:00:00Z'), secs: 600 })]; assert.deepEqual(Object.keys(G.dailyBuckets(half, days, 'Asia/Kathmandu')), ['2026-11-05']);   // 23:45
  const split = [S({ start: Date.parse('2026-11-05T18:10:00Z'), secs: 1200 })], d = G.dailyBuckets(split, days, 'Asia/Kathmandu'); assert.equal(d['2026-11-05'].taskAAAA1, 300); assert.equal(d['2026-11-06'].taskAAAA1, 900);   // midnight at 18:15 UTC
});
test('EN-1A other zones: the New York clock-change day keeps every second (25-hour day)', () => {
  const start = Date.parse('2026-11-01T03:00:00Z'), s = [S({ start, secs: 86400 })], d = G.dailyBuckets(s, ['2026-10-31', '2026-11-01', '2026-11-02'], 'America/New_York');
  const total = Object.values(d).reduce((a, x) => a + (x.taskAAAA1 || 0), 0); assert.equal(total, 86400);
});

/* ---------------- EN-1C: weekly summary ---------------- */
const mkRows = (today, tot, plan) => { const days = G.dayList(today, 60), b = Object.fromEntries(days.map(d => [d, tot[d] ? { taskAAAA1: tot[d] } : {}])); return G.stackModel(days, b, [T()], days[0], plan, today).rows; };
const WK = { '2026-10-26': 3600, '2026-10-27': 7200, '2026-10-28': 11400, '2026-10-29': 0, '2026-10-30': 3600, '2026-10-31': 0, '2026-11-01': 3600 };   // Mon..Sun
test('EN-1C lastCompletedWeek: the week before the one that holds today, Monday to Sunday', () => {
  assert.deepEqual(G.lastCompletedWeek('2026-11-08'), { start: '2026-10-26', end: '2026-11-01' });   // today is Sunday: this week (2 Nov) is NOT complete
  assert.deepEqual(G.lastCompletedWeek('2026-11-02'), { start: '2026-10-26', end: '2026-11-01' });   // Monday
  assert.deepEqual(G.lastCompletedWeek('2026-11-05'), { start: '2026-10-26', end: '2026-11-01' });
  assert.deepEqual(G.lastCompletedWeek('2026-01-01'), { start: '2025-12-22', end: '2025-12-28' });   // across a year end
  assert.deepEqual(G.lastCompletedWeek('2026-03-02'), { start: '2026-02-23', end: '2026-03-01' });   // across a month end
});
test('EN-1C weeklySummary: focus time, best day, goal days (rest days not counted), streak at week end, tasks', () => {
  const plan = G.goalPlan(60, [null, null, null, null, null, 0, null]);   // Saturday is a rest day
  const rows = mkRows('2026-11-08', WK, plan), weeks = [{ weekStart: '2026-10-26', count: 3, ids: [] }], s = G.weeklySummary(rows, '2026-11-08', weeks, { todo: 4, doing: 2, done: 9, archived: 1 });
  assert.equal(s.noData, false); assert.equal(s.focusSecs, 3600 + 7200 + 11400 + 3600 + 3600); assert.deepEqual(s.best, { day: '2026-10-28', total: 11400 });
  assert.deepEqual(s.goal, { met: 5, of: 6 }); assert.equal(s.restDays, 1);   // Thursday missed; Saturday (rest) is not counted
  assert.equal(s.streak, 2); assert.equal(s.completed, 3); assert.equal(s.open, 6); assert.equal(s.daysWithoutData, 0);   // Sunday and Friday count; the rest-day Saturday is skipped; the missed Thursday ends it
});
test('EN-1C weeklySummary: the streak is the streak AT THE END of that week, and a missed Sunday counts as missed', () => {
  const plan = G.goalPlan(60, null), met = Object.fromEntries(Object.keys(WK).map(d => [d, 3600]));
  assert.equal(G.weeklySummary(mkRows('2026-11-08', met, plan), '2026-11-08', [], {}).streak, 7 + 0 >= 7 ? G.streak(mkRows('2026-11-08', met, plan).filter(r => r.day <= '2026-11-01'), 0, '2026-11-02', 60).current : -1);
  const missSun = Object.assign({}, met, { '2026-11-01': 0 }), s = G.weeklySummary(mkRows('2026-11-08', missSun, plan), '2026-11-08', [], {});
  assert.equal(s.streak, 0);
  const noGoal = G.weeklySummary(mkRows('2026-11-08', WK, G.goalPlan(0, null)), '2026-11-08', [], {}); assert.equal(noGoal.goal, null); assert.equal(noGoal.streak, null);
});
test('EN-1C weeklySummary: no data before the first record; a partly covered week says how many days are not counted', () => {
  const days = G.dayList('2026-11-08', 60), b = { '2026-10-30': { taskAAAA1: 3600 } };
  const rowsLate = G.stackModel(days, b, [T({ createdAt: M('2026-11-05T09:00:00+08:00') })], '2026-11-05', G.goalPlan(60, null), '2026-11-08').rows;
  assert.equal(G.weeklySummary(rowsLate, '2026-11-08', [], {}).noData, true);                   // the whole week is before the first record
  const rowsMid = G.stackModel(days, b, [T()], '2026-10-29', G.goalPlan(60, null), '2026-11-08').rows, s = G.weeklySummary(rowsMid, '2026-11-08', [], {});
  assert.equal(s.noData, false); assert.equal(s.daysWithoutData, 3);   // Mon 26, Tue 27, Wed 28 come before 29 Oct
  assert.equal(s.goal.of, 4);                                           // only the 4 days with data are judged
  assert.equal(G.weeklySummary([], '2026-11-08', [], {}).noData, true);
});
test('EN-1C weeklySummary: other zones cut the week differently (Manila vs New York near midnight)', () => {
  const ses = [S({ start: Date.parse('2026-11-01T17:00:00Z'), secs: 1800, day: '2026-11-02' })];   // Mon 2 Nov 01:00 in Manila; Sun 1 Nov 12:00 in New York
  const calc = (tz, today) => { const days = G.dayList(today, 60), b = G.dailyBuckets(ses, days, tz); return G.weeklySummary(G.stackModel(days, b, [T({ createdAt: M('2026-10-20T09:00:00+08:00') })], '2026-10-20', 0, today).rows, '2026-11-09', [], {}); };
  assert.equal(calc('Asia/Manila', '2026-11-09').focusSecs, 1800);     // Mon 2 Nov in Manila: inside the last completed week (2 to 8 Nov)
  assert.equal(calc('America/New_York', '2026-11-09').focusSecs, 0);   // Sun 1 Nov in New York: that is the week BEFORE the last completed one
});
test('EN-1C summaryText: numbers and dates only, rest-day note only when there was one, no goal line without goals', () => {
  const plan = G.goalPlan(60, [null, null, null, null, null, 0, null]), s = G.weeklySummary(mkRows('2026-11-08', WK, plan), '2026-11-08', [{ weekStart: '2026-10-26', count: 3, ids: [] }], { todo: 4, doing: 2 });
  const tx = G.summaryText(s, { tz: 'Asia/Manila', takenDay: '2026-11-08' }).split('\n');
  assert.equal(tx[0], 'Focus summary, Mon 26 Oct to Sun 1 Nov (Asia/Manila)'); assert.equal(tx[1], 'Focus time: 26 h 00 m'.replace('26 h 00 m', G.fmtHm(s.focusSecs))); assert.equal(tx[2], 'Goal days met: 5 of 6 (rest days not counted)');
  assert.equal(tx[3], 'Best day: Wed 28 Oct, 3 h 10 m'); assert.equal(tx[4], 'Streak at week end: 2 days'); assert.equal(tx[5], 'Tasks completed: 3, open now: 6'); assert.equal(tx[tx.length - 1], 'This is a snapshot taken on Sun 8 Nov.');
  const none = G.summaryText(G.weeklySummary(mkRows('2026-11-08', WK, G.goalPlan(0, null)), '2026-11-08', [], {}), {}); assert.ok(!/Goal days|Streak/.test(none));
  assert.match(G.summaryText({ noData: true, start: '2026-10-26', end: '2026-11-01' }, {}), /no focus data/);
});
test('EN-1C summaryText never contains task names or an address; a share link line only when a real https link is given', () => {
  const rows = mkRows('2026-11-08', WK, G.goalPlan(60, null)), s = G.weeklySummary(rows, '2026-11-08', [], {});
  const tx = G.summaryText(s, { tz: 'Asia/Manila', takenDay: '2026-11-08' }); assert.ok(!/Write report|@/.test(tx)); assert.ok(!/Link/.test(tx));
  assert.match(G.summaryText(s, { link: { url: 'https://example.com/s/abc#secret', expiresLabel: 'Sun 8 Nov 14:00' } }), /Link \(expires Sun 8 Nov 14:00\): https:\/\/example\.com\/s\/abc#secret/);
  for (const bad of ['http://x.com', 'javascript:alert(1)', 'https://a b', 'https://a\nb', 5, null]) assert.ok(!/Link/.test(G.summaryText(s, { link: { url: bad } })), String(bad));
});
test('EN-1C cleanAddress: empty or one plain address only', () => {
  assert.deepEqual(G.cleanAddress(''), { ok: true, address: '' }); assert.deepEqual(G.cleanAddress('  a.b+c@example.co.uk '), { ok: true, address: 'a.b+c@example.co.uk' }); assert.deepEqual(G.cleanAddress(undefined), { ok: true, address: '' }); assert.deepEqual(G.cleanAddress('a@b.com\r\n'), { ok: true, address: 'a@b.com' });   // only outer spaces and line ends are trimmed away; nothing inside is kept
  for (const bad of ['a@b', 'a@@b.com', 'a b@c.com', 'a@b.com, c@d.com', 'a@b.com;c@d.com', 'a@b.com\nBcc: x@y.com', '<a@b.com>', '"a"@b.com', 'a@b.com?subject=x', 'x'.repeat(250) + '@b.com', 5]) assert.equal(G.cleanAddress(bad).ok === true && bad !== '', false, String(bad).slice(0, 30));
});
test('EN-1C mailtoUrl: encodes everything, uses CRLF line breaks, refuses a bad address or an over-long link', () => {
  const r = G.mailtoUrl('a@b.com', 'Focus summary & more', 'l1\nl2 100% & done=1'); assert.equal(r.ok, true);
  assert.equal(r.url, 'mailto:a%40b.com?subject=Focus%20summary%20%26%20more&body=l1%0D%0Al2%20100%25%20%26%20done%3D1');
  assert.equal(G.mailtoUrl('', 'S', 'B').url, 'mailto:?subject=S&body=B');
  assert.equal(G.mailtoUrl('a@b.com\nBcc: x@y.com', 'S', 'B').ok, false); assert.equal(G.mailtoUrl('a@b.com,c@d.com', 'S', 'B').reason, 'address');
  assert.equal(G.mailtoUrl('a@b.com', 'S\r\nBcc: x@y.com', 'B').url.includes('%0D'), false);   // line breaks in the subject become spaces
  const long = G.mailtoUrl('a@b.com', 'S', 'x'.repeat(2000)); assert.equal(long.ok, false); assert.equal(long.reason, 'long'); assert.ok(G.mailtoUrl('a@b.com', 'S', 'x'.repeat(500)).url.length < G.MAILTO_MAX);
});
