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
