// Run: node --test scripts/core-todo.test.mjs   (Node 20+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const C = createRequire(import.meta.url)('./core-todo.js');
const NOW = Date.UTC(2027, 0, 15, 8, 0, 0);          // 2027-01-15 16:00 in Manila
const TID = 'task00001', TID2 = 'task00002';
const T = o => Object.assign({ name: 'Write brief', desc: '', due: '2027-01-20', hours: 4, focusMin: 25, status: 'todo', secs: 0, doneAt: null, color: 1 }, o);
const run = (o) => Object.assign({ taskId: TID, startedAt: new Date(NOW - 600000), goalMin: 25, lastSid: '', rev: 2 }, o);

test('validDay accepts only real calendar dates', () => {
  for (const d of ['2027-01-15', '2028-02-29', '2027-12-31']) assert.equal(C.validDay(d), true, d);
  for (const d of ['2027-02-29', '2027-02-30', '2027-13-01', '2027-00-10', '2027-1-1', '20270115', '', null, undefined, 5, '2027-01-15T00:00', ' 2027-01-15']) assert.equal(C.validDay(d), false, String(d));
});
test('dayKey uses the owner time zone: 17:00 UTC is already the next day in Manila; a different zone gives another day', () => {
  assert.equal(C.dayKey(Date.UTC(2027, 0, 15, 17, 0), 'Asia/Manila'), '2027-01-16'); assert.equal(C.dayKey(Date.UTC(2027, 0, 15, 15, 59, 59), 'Asia/Manila'), '2027-01-15');
  assert.equal(C.dayKey(Date.UTC(2027, 0, 15, 17, 0), 'UTC'), '2027-01-15'); assert.equal(C.dayKey(Date.UTC(2027, 0, 15, 17, 0)), '2027-01-16');
  assert.equal(C.dayKey(Date.UTC(2027, 11, 31, 16, 0), 'Asia/Manila'), '2028-01-01');
});
test('dayDiff counts calendar days (month and year ends, leap day)', () => { assert.equal(C.dayDiff('2027-01-20', '2027-01-15'), 5); assert.equal(C.dayDiff('2027-01-15', '2027-01-20'), -5); assert.equal(C.dayDiff('2028-03-01', '2028-02-28'), 2); assert.equal(C.dayDiff('2028-01-01', '2027-12-31'), 1); assert.equal(C.dayDiff('2027-03-01', '2027-02-28'), 1); });
test('newId makes 20 letters and digits that the database rules accept, and reaches the end of the alphabet safely', () => {
  let i = 0; const id = C.newId(() => (i++ % 100) / 100); assert.match(id, /^[A-Za-z0-9]{20}$/); assert.ok(C.idOk(id));
  assert.match(C.newId(() => 0.999999999), /^[A-Za-z0-9]{20}$/); assert.match(C.newId(() => 1), /^[A-Za-z0-9]{20}$/); assert.match(C.newId(() => 0), /^[A-Za-z0-9]{20}$/);
  for (const bad of ['abc', 'x'.repeat(41), 'task-0001', 'task 0001', '', null, undefined, 5]) assert.equal(C.idOk(bad), false, String(bad));
  assert.equal(C.idOk('abcdefgh'), true); assert.equal(C.idOk('a'.repeat(40)), true);
});
test('cleanTask: a good form becomes the document; spaces are tidied; commas in hours work', () => {
  const r = C.cleanTask({ name: '  Write   the  brief ', desc: ' notes ', due: '2027-02-01', hours: '2,5', focusMin: '50' }, 3);
  assert.equal(r.ok, true); assert.deepEqual(r.doc, { name: 'Write the brief', desc: 'notes', due: '2027-02-01', hours: 2.5, focusMin: 50, color: 3 });
});
test('cleanTask: the limits (name 1..120, description 2000, hours 0..1000, focus 1..240 whole minutes, real due date)', () => {
  assert.equal(C.cleanTask({ name: '' }).ok, false); assert.equal(C.cleanTask({ name: '   ' }).ok, false); assert.equal(C.cleanTask({ name: 'a'.repeat(121) }).ok, false); assert.equal(C.cleanTask({ name: 'a'.repeat(120) }).ok, true);
  assert.equal(C.cleanTask({ name: 'a', desc: 'd'.repeat(2001) }).ok, false); assert.equal(C.cleanTask({ name: 'a', desc: 'd'.repeat(2000) }).ok, true);
  for (const h of ['-1', '1001', 'abc', 'NaN', 'Infinity']) assert.equal(C.cleanTask({ name: 'a', hours: h }).ok, false, h); for (const h of ['0', '1000', '0.25', '', undefined]) assert.equal(C.cleanTask({ name: 'a', hours: h }).ok, true, String(h));
  for (const m of ['0', '241', '25.5', 'x', '-5']) assert.equal(C.cleanTask({ name: 'a', focusMin: m }).ok, false, m); for (const m of ['1', '240', '25', '', undefined]) assert.equal(C.cleanTask({ name: 'a', focusMin: m }).ok, true, String(m));
  for (const d of ['2027-02-30', 'tomorrow', '2027-1-1']) assert.equal(C.cleanTask({ name: 'a', due: d }).ok, false, d); assert.equal(C.cleanTask({ name: 'a', due: '' }).ok, true);
  assert.equal(C.cleanTask(null).ok, false); assert.equal(C.cleanTask('x').ok, false); assert.ok(C.cleanTask({ name: '' , hours: -5}).errors.length >= 2);
});
test('cleanTask: hours are rounded to 2 decimals; colour wraps into 0..11; default focus is 25', () => {
  assert.equal(C.cleanTask({ name: 'a', hours: '1.239' }).doc.hours, 1.24); assert.equal(C.cleanTask({ name: 'a' }, 13).doc.color, 1); assert.equal(C.cleanTask({ name: 'a' }, -1).doc.color, 11); assert.equal(C.cleanTask({ name: 'a' }).doc.focusMin, 25);
});
test('nextColor picks the least used colour, lowest number first, and ignores damaged values', () => {
  assert.equal(C.nextColor([]), 0); assert.equal(C.nextColor([{ color: 0 }]), 1); assert.equal(C.nextColor([{ color: 0 }, { color: 1 }, { color: 0 }]), 2);
  assert.equal(C.nextColor(Array.from({ length: 12 }, (_, i) => ({ color: i }))), 0); assert.equal(C.nextColor([{ color: 99 }, { color: 'x' }, null, undefined]), 0);
  assert.equal(C.nextColor(Array.from({ length: 13 }, (_, i) => ({ color: i % 12 }))), 1);
});
test('fmtClock and fmtHours', () => {
  assert.equal(C.fmtClock(0), '0:00'); assert.equal(C.fmtClock(59), '0:59'); assert.equal(C.fmtClock(600), '10:00'); assert.equal(C.fmtClock(3725), '1:02:05'); assert.equal(C.fmtClock(-5), '0:00'); assert.equal(C.fmtClock(NaN), '0:00'); assert.equal(C.fmtClock(61.9), '1:01');
  assert.equal(C.fmtHours(0), '0 h'); assert.equal(C.fmtHours(30), '30 s'); assert.equal(C.fmtHours(60), '1 min'); assert.equal(C.fmtHours(3600), '1 h'); assert.equal(C.fmtHours(9000), '2 h 30 min'); assert.equal(C.fmtHours(-1), '0 h'); assert.equal(C.fmtHours(undefined), '0 h');
  assert.equal(C.hoursNum(5400), 1.5); assert.equal(C.hoursNum(0), 0);
});
test('progress: used against allotted; over the plan is flagged; no plan is its own case; the bar never exceeds 100', () => {
  assert.deepEqual(C.progress(T({ secs: 3600, hours: 4 })), { used: 3600, plan: 14400, pct: 25, over: false, left: 10800, noPlan: false });
  const o = C.progress(T({ secs: 18000, hours: 4 })); assert.equal(o.over, true); assert.equal(o.pct, 100); assert.equal(o.left, 0);
  assert.equal(C.progress(T({ secs: 600, hours: 0 })).noPlan, true); assert.equal(C.progress(null).used, 0); assert.equal(C.progress(T({ secs: -5 })).used, 0);
  assert.equal(C.progress(T({ secs: 14400, hours: 4 })).over, false);
});
test('dueInfo: overdue, today, tomorrow, soon, past-but-done, none, damaged', () => {
  const t = '2027-01-15';
  assert.deepEqual([C.dueInfo(T({ due: '2027-01-14' }), t).kind, C.dueInfo(T({ due: '2027-01-14' }), t).text], ['overdue', 'Overdue by 1 day']);
  assert.equal(C.dueInfo(T({ due: '2027-01-10' }), t).text, 'Overdue by 5 days'); assert.equal(C.dueInfo(T({ due: t }), t).text, 'Due today'); assert.equal(C.dueInfo(T({ due: '2027-01-16' }), t).text, 'Due tomorrow'); assert.equal(C.dueInfo(T({ due: '2027-01-20' }), t).text, 'Due in 5 days');
  assert.equal(C.dueInfo(T({ due: '2027-01-10', status: 'done' }), t).kind, 'past'); assert.equal(C.dueInfo(T({ due: '2027-01-10', status: 'archived' }), t).kind, 'past');
  assert.equal(C.dueInfo(T({ due: '' }), t).kind, 'none'); assert.equal(C.dueInfo(T({ due: 'bad' }), t).kind, 'none'); assert.equal(C.dueInfo(T(), 'bad').kind, 'none'); assert.equal(C.dueInfo(null, t).kind, 'none');
  assert.equal(C.isOverdue(T({ due: '2027-01-14' }), t), true); assert.equal(C.isOverdue(T({ due: '2027-01-14', status: 'done' }), t), false); assert.equal(C.isOverdue(T({ due: t }), t), false);
});
test('filterTasks: open = to do + in progress; all hides archived; each status filters exactly', () => {
  const L = [T({ status: 'todo' }), T({ status: 'doing' }), T({ status: 'done', doneAt: 1 }), T({ status: 'archived' }), null, {}];
  assert.deepEqual(C.filterTasks(L, 'open').map(t => t.status), ['todo', 'doing']); assert.equal(C.filterTasks(L, 'all').length, 3); assert.equal(C.filterTasks(L, 'archived').length, 1);
  for (const s of ['todo', 'doing', 'done']) assert.deepEqual(C.filterTasks(L, s).map(t => t.status), [s]); assert.equal(C.filterTasks(L, 'weird').length, 3); assert.deepEqual(C.filterTasks(null, 'all'), []);
});
test('sortTasks: open first by soonest due (no date last), then done newest first, then archived; names break ties; input untouched', () => {
  const L = [T({ name: 'z', status: 'archived' }), T({ name: 'b', due: '' }), T({ name: 'a', due: '2027-03-01' }), T({ name: 'd1', status: 'done', doneAt: new Date(1000) }), T({ name: 'c', due: '2027-02-01', status: 'doing' }), T({ name: 'd2', status: 'done', doneAt: new Date(5000) }), T({ name: 'a2', due: '2027-03-01' })];
  const before = L.map(t => t.name).join(); const s = C.sortTasks(L).map(t => t.name);
  assert.deepEqual(s, ['c', 'a', 'a2', 'b', 'd2', 'd1', 'z']); assert.equal(L.map(t => t.name).join(), before); assert.deepEqual(C.sortTasks(null), []);
});
test('isRunning needs a valid task id and a start time', () => {
  assert.equal(C.isRunning(run()), true); assert.equal(C.isRunning(run({ taskId: '' })), false); assert.equal(C.isRunning(run({ startedAt: null })), false); assert.equal(C.isRunning(run({ taskId: 'bad id' })), false); assert.equal(C.isRunning(null), false); assert.equal(C.isRunning({}), false);
  assert.equal(C.isRunning(run({ startedAt: { toMillis: () => NOW } })), true); assert.equal(C.isRunning(run({ startedAt: NOW })), true);
});
test('elapsedSecs counts whole seconds from the start, never below zero (clock skew), zero when idle', () => {
  assert.equal(C.elapsedSecs(run(), NOW), 600); assert.equal(C.elapsedSecs(run(), NOW + 999), 600); assert.equal(C.elapsedSecs(run(), NOW + 1000), 601); assert.equal(C.elapsedSecs(run(), NOW - 700000), 0);
  assert.equal(C.elapsedSecs(run({ taskId: '' }), NOW), 0); assert.equal(C.elapsedSecs(null, NOW), 0); assert.equal(C.elapsedSecs(run(), NaN), 0);
});
test('focusInfo: remaining, reached exactly at the goal, minutes beyond the goal; no goal means never reached', () => {
  const a = C.focusInfo(run({ goalMin: 25 }), NOW); assert.deepEqual([a.elapsed, a.goal, a.remaining, a.reached, a.over], [600, 1500, 900, false, 0]);
  const b = C.focusInfo(run({ goalMin: 10 }), NOW); assert.deepEqual([b.remaining, b.reached, b.over], [0, true, 0]); const c = C.focusInfo(run({ goalMin: 10 }), NOW + 90000); assert.deepEqual([c.reached, c.over], [true, 90]);
  assert.equal(C.focusInfo(run({ goalMin: 0 }), NOW).reached, false); assert.equal(C.focusInfo(null, NOW).goal, 0);
  assert.equal(C.focusInfo(run({ goalMin: 10, startedAt: new Date(NOW - 599999) }), NOW).reached, false);
});
test('needsTrim triggers only after 12 hours', () => {
  assert.equal(C.needsTrim(run({ startedAt: new Date(NOW - 43200 * 1000) }), NOW), false); assert.equal(C.needsTrim(run({ startedAt: new Date(NOW - 43201 * 1000) }), NOW), true); assert.equal(C.needsTrim(null, NOW), false);
});
test('stopSession: the finished session (task, start, whole seconds, Manila day of the START, kind timer)', () => {
  const s = C.stopSession(run(), NOW, 'Asia/Manila'); assert.deepEqual(s, { taskId: TID, start: NOW - 600000, secs: 600, day: '2027-01-15', kind: 'timer' });
  const late = C.stopSession(run({ startedAt: new Date(Date.UTC(2027, 0, 15, 15, 50)) }), Date.UTC(2027, 0, 15, 16, 20), 'Asia/Manila'); assert.equal(late.day, '2027-01-15'); assert.equal(late.secs, 1800);   // crosses Manila midnight, belongs to the day it started
  assert.equal(C.stopSession(null, NOW), null); assert.equal(C.stopSession(run({ taskId: '' }), NOW), null);
});
test('stopSession: at least 1 second, trimmed on request, never above 24 hours', () => {
  assert.equal(C.stopSession(run({ startedAt: new Date(NOW) }), NOW).secs, 1); assert.equal(C.stopSession(run(), NOW, 'Asia/Manila', 300).secs, 300); assert.equal(C.stopSession(run(), NOW, 'Asia/Manila', 9999).secs, 600);
  assert.equal(C.stopSession(run(), NOW, 'Asia/Manila', 0).secs, 600); assert.equal(C.stopSession(run(), NOW, 'Asia/Manila', -5).secs, 600); assert.equal(C.stopSession(run(), NOW, 'Asia/Manila', 0.5).secs, 600);
  assert.equal(C.stopSession(run({ startedAt: new Date(NOW - 90000 * 1000) }), NOW).secs, 86400); assert.equal(C.stopSession(run({ startedAt: new Date(NOW - 50000 * 1000) }), NOW, 'Asia/Manila', 43200).secs, 43200);
});
test('playPlan: start when idle; already when the same task runs; switch (ending the other) when another task runs; bad id invalid', () => {
  assert.deepEqual(C.playPlan(null, TID), { kind: 'start' }); assert.deepEqual(C.playPlan(run({ taskId: '' }), TID), { kind: 'start' }); assert.deepEqual(C.playPlan(run(), TID), { kind: 'already' }); assert.deepEqual(C.playPlan(run(), TID2), { kind: 'switch', from: TID });
  assert.equal(C.playPlan(run(), 'bad id').kind, 'invalid'); assert.equal(C.playPlan(null, '').kind, 'invalid'); assert.equal(C.playPlan(null, undefined).kind, 'invalid');
});
test('canLeave: the running task cannot be completed, archived or deleted', () => { assert.equal(C.canLeave(run(), TID), false); assert.equal(C.canLeave(run(), TID2), true); assert.equal(C.canLeave(null, TID), true); assert.equal(C.canLeave(run({ taskId: '' }), TID), true); });
test('cleanManual: real past or current day, 1..1440 whole minutes', () => {
  const ok = C.cleanManual({ day: '2027-01-14', minutes: '90' }, '2027-01-15'); assert.deepEqual([ok.ok, ok.day, ok.secs], [true, '2027-01-14', 5400]);
  assert.equal(C.cleanManual({ day: '2027-01-15', minutes: 1 }, '2027-01-15').secs, 60); assert.equal(C.cleanManual({ day: '2027-01-15', minutes: 1440 }, '2027-01-15').secs, 86400); assert.equal(C.cleanManual({ day: '2027-01-15', minutes: '90,4' }, '2027-01-15').secs, 5400);
  for (const m of ['0', '1441', '', 'x', null, undefined, '-5', '0.4']) assert.equal(C.cleanManual({ day: '2027-01-15', minutes: m }, '2027-01-15').ok, false, String(m));
  for (const d of ['2027-01-16', '2027-02-30', '', 'today', null]) assert.equal(C.cleanManual({ day: d, minutes: 30 }, '2027-01-15').ok, false, String(d)); assert.equal(C.cleanManual(null, '2027-01-15').ok, false);
  assert.equal(C.cleanManual({ day: '2027-01-15', minutes: 30 }, 'bad').ok, true);
});
test('sumSecs and addSecs: sums ignore damaged values; the cached total never goes below zero or above the rule maximum', () => {
  assert.equal(C.sumSecs([{ secs: 60 }, { secs: 120 }, { secs: -5 }, null, {}, { secs: 'x' }]), 180); assert.equal(C.sumSecs(null), 0);
  assert.equal(C.addSecs(T({ secs: 100 }), 50), 150); assert.equal(C.addSecs(T({ secs: 100 }), -500), 0); assert.equal(C.addSecs(T({ secs: 3599990 }), 100), 3600000); assert.equal(C.addSecs(null, 30), 30); assert.equal(C.addSecs(T({ secs: 10 }), 0.6), 11);
});
test('history merges sessions, notes, creation and completion, newest first; edited notes are marked', () => {
  const task = T({ createdAt: new Date(1000), status: 'done', doneAt: new Date(9000) });
  const h = C.history(task, [{ id: 's1', start: new Date(3000), secs: 60, kind: 'timer', day: 'd' }, { id: 's2', start: new Date(7000), secs: 90, kind: 'manual', day: 'd' }], [{ id: 'n1', createdAt: new Date(5000), text: 'x', sessionId: 's1', editedAt: new Date(6000) }, { id: 'n2', createdAt: new Date(7000), text: 'y' }]);
  assert.deepEqual(h.map(x => x.type + ':' + x.id), ['done:done', 'note:n2', 'session:s2', 'note:n1', 'session:s1', 'created:created']); assert.equal(h.find(x => x.id === 'n1').edited, true); assert.equal(h.find(x => x.id === 'n2').edited, false);
  assert.equal(C.history(T({ createdAt: new Date(1000) }), [], []).length, 1); assert.deepEqual(C.history(null, null, null), []); assert.equal(C.history(T({ createdAt: new Date(1000) }), [{ id: 'x', start: null }], [{ id: 'y' }]).length, 1);
});
test('forTask keeps only the matching records', () => { assert.deepEqual(C.forTask([{ taskId: 'a', n: 1 }, { taskId: 'b', n: 2 }, null], 'a'), [{ taskId: 'a', n: 1 }]); assert.deepEqual(C.forTask(null, 'a'), []); });
test('pure: no DOM, storage, network or clock use in the core file', async () => {
  const fs = await import('node:fs'); const s = fs.readFileSync(new URL('./core-todo.js', import.meta.url), 'utf8');
  for (const bad of ['document.', 'localStorage', 'sessionStorage', 'fetch(', 'Date.now', 'new Date()', 'Math.random', 'innerHTML', 'eval(']) assert.ok(!s.includes(bad), bad);
});
