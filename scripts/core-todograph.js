/* ==========================================================================
   core-todograph.js - pure maths of the To-do & focus graphs (CodeFlow 4.5.0, phase TD2). No DOM, no database, no clock.
   Runs in the browser (window.coreTodoGraph) and in Node so the SAME code is unit-tested.
   Days are calendar days in the owner's zone (Asia/Manila). Weeks run Monday to Sunday.
   A timer session is split at local midnight, so each day shows what was really done on it (task totals are not changed by this).
   A manual entry belongs to the day it was entered for. Days before the first record are "no data"; days with records but no time are 0.
   EN-1A: the goal can differ per weekday. weekdayGoalMin = 7 values, Monday first; each is null (use the daily goal) or 0..1440 minutes. An explicit 0 is a REST DAY:
   it has no goal, and in the streak it is skipped (it neither breaks the streak nor counts as a day). A daily goal of 0 still means "goal off" (not a rest day).
   ========================================================================== */
(function (root) {
  'use strict';
  const tm = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./core-time.js') : root.coreTime;
  const COLORS = ['#2f4fb3', '#2f8f5b', '#b3261e', '#9a5b00', '#7a3fb3', '#0f7a8a', '#b33f8a', '#5b6b1f', '#8a4b2a', '#3f5f8a', '#1f6b4f', '#6b2f5f'];
  const PATTERNS = ['solid', 'stripes', 'dots', 'cross', 'hstripes', 'zigzag', 'solid', 'stripes', 'dots', 'cross', 'hstripes', 'zigzag'];
  const RANGES = [7, 14, 30], WINDOW_DAYS = 60, WEEKS = 12, TOP = 6;
  const ms = t => !t ? 0 : typeof t.toMillis === 'function' ? t.toMillis() : t instanceof Date ? t.getTime() : Number(t) || 0;
  const num = x => typeof x === 'number' && isFinite(x);
  const letter = i => String.fromCharCode(65 + (i % 26));

  /* the last n day keys, oldest first, ending with todayKey */
  function dayList(todayKey, n) { const out = []; for (let i = n - 1; i >= 0; i--) out.push(tm.addDaysIso(todayKey, -i)); return out; }
  /* seconds per day per task: { 'YYYY-MM-DD': { taskId: secs } } for the given day keys only */
  function dailyBuckets(sessions, days, tz, opts) {
    const want = new Set(days), inc = !opts || opts.includeManual !== false, out = {};
    const add = (d, id, secs) => { if (!want.has(d) || !(secs > 0)) return; (out[d] = out[d] || {})[id] = (out[d][id] || 0) + secs; };
    (sessions || []).forEach(s => {
      if (!s || !num(s.secs) || s.secs < 1) return;
      if (s.kind === 'manual') { if (inc) add(s.day, s.taskId, s.secs); return; }
      const st = ms(s.start); if (!st) { add(s.day, s.taskId, s.secs); return; }
      let pieces; try { pieces = tm.splitByLocalDay(st, st + s.secs * 1000, tz); } catch (e) { pieces = [{ date: s.day, ms: s.secs * 1000 }]; }
      let used = 0; pieces.forEach((p, i) => { const secs = i === pieces.length - 1 ? s.secs - used : Math.round(p.ms / 1000); used += secs; add(p.date, s.taskId, secs); });
    });
    return out;
  }
  /* the earliest day with any record (a task created, or a session); '' when there is nothing at all */
  function firstDay(tasks, sessions, tz) {
    let best = ''; const take = d => { if (d && (!best || d < best)) best = d; };
    (tasks || []).forEach(t => { const c = ms(t.createdAt); if (c) take(tm.localDateKey(c, tz)); });
    (sessions || []).forEach(s => take(s.day));
    return best;
  }
  /* Monday = 0 ... Sunday = 6 for a day key (calendar maths only, so it is the same in every zone) */
  function weekdayIndex(day) { const [y, m, d] = day.split('-').map(Number); return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; }
  /* the saved list -> 7 values (null or whole minutes 0..1440), or null when it is absent, the wrong size or has nothing set */
  function cleanWeekday(a) {
    if (!Array.isArray(a) || a.length !== 7) return null;
    const out = a.map(v => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1440) ? v : null);
    return out.some(v => v !== null) ? out : null;
  }
  /* day key -> { secs, rest }. secs = the goal for that day in seconds (0 = no goal); rest = the owner set 0 for that weekday on purpose */
  function goalPlan(dailyMin, weekday) {
    const dm = num(dailyMin) && dailyMin > 0 ? Math.min(1440, Math.round(dailyMin)) : 0, wk = cleanWeekday(weekday);
    return day => {
      const w = wk ? wk[weekdayIndex(day)] : null;
      if (w === 0) return { secs: 0, rest: true };
      if (w > 0) return { secs: w * 60, rest: false };
      return { secs: dm * 60, rest: false };
    };
  }
  /* rows for the stacked chart and its table. Top tasks by time in the range, the rest grouped as "Other". */
  function stackModel(days, buckets, tasks, first, goal, today) {
    const gf = typeof goal === 'function' ? goal : () => ({ secs: num(goal) && goal > 0 ? goal : 0, rest: false });   // a plain number = the same goal every day (the old way)
    const byId = {}; (tasks || []).forEach(t => { byId[t.id] = t; });
    const tot = {}; days.forEach(d => Object.keys(buckets[d] || {}).forEach(id => { tot[id] = (tot[id] || 0) + buckets[d][id]; }));
    const ids = Object.keys(tot).sort((a, b) => tot[b] - tot[a] || (a < b ? -1 : 1)), top = ids.slice(0, TOP), rest = ids.slice(TOP);
    const series = top.map((id, i) => { const t = byId[id] || {}, c = num(t.color) ? t.color % 12 : i; return { key: id, name: t.name || 'Deleted task', letter: letter(c), color: COLORS[c], pattern: PATTERNS[c], total: tot[id] }; });
    if (rest.length) series.push({ key: '_other', name: 'Other (' + rest.length + ')', letter: '+', color: '#6b7280', pattern: 'solid', total: rest.reduce((a, id) => a + tot[id], 0), ids: rest });
    const rows = days.map(d => {
      const b = buckets[d] || {}, parts = {}; let total = 0;
      series.forEach(s => { const v = s.key === '_other' ? s.ids.reduce((a, id) => a + (b[id] || 0), 0) : (b[s.key] || 0); if (v) parts[s.key] = v; total += v; });
      const state = first && d < first ? 'nodata' : (d > today ? 'future' : (total > 0 ? 'data' : 'zero'));
      const g = gf(d), gs = num(g.secs) && g.secs > 0 ? g.secs : 0;
      return { day: d, total, parts, state, goalSecs: gs, rest: !!g.rest, goalMet: gs > 0 && state !== 'nodata' && total >= gs };
    });
    const have = rows.filter(r => r.state === 'data' || r.state === 'zero'), sum = rows.reduce((a, r) => a + r.total, 0);
    let best = null; rows.forEach(r => { if (r.total > 0 && (!best || r.total > best.total)) best = r; });
    return { series, rows, total: sum, avg: have.length ? Math.round(sum / have.length) : 0, best: best ? { day: best.day, total: best.total } : null, max: Math.max(...rows.map(r => r.goalSecs), ...rows.map(r => r.total), 1), anyGoal: rows.some(r => r.goalSecs > 0 || r.rest), hasRest: rows.some(r => r.rest), sameGoal: rows.every(r => r.goalSecs === rows[0].goalSecs && r.rest === rows[0].rest) };
  }
  /* streak of days that reached the goal. Today does not break a streak until it is over (it may still be reached). Counted inside the loaded window only.
     A rest day (goal set to 0 for that weekday) is skipped: it neither breaks the streak nor counts as a day. */
  function streak(rows, goalSecs, today, windowDays) {
    const on = (num(goalSecs) && goalSecs > 0) || rows.some(r => r.goalSecs > 0);
    if (!on) return { on: false, current: 0, longest: 0, windowDays };
    let longest = 0, run = 0;
    rows.forEach(r => { if (r.state === 'nodata' || r.state === 'future') { run = 0; return; } if (r.rest) return; if (r.goalMet) { run++; longest = Math.max(longest, run); } else run = 0; });
    let cur = 0, i = rows.length - 1; while (i >= 0 && rows[i].state === 'future') i--;
    if (i >= 0 && rows[i].day === today && !rows[i].goalMet && !rows[i].rest) i--;
    while (i >= 0 && (rows[i].rest || rows[i].goalMet)) { if (!rows[i].rest) cur++; i--; }
    return { on: true, current: cur, longest, windowDays, capped: i < 0 && cur > 0 };
  }
  /* Monday of the week that contains a day key */
  function weekStart(day) { const [y, m, d] = day.split('-').map(Number), dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; return tm.addDaysIso(day, -dow); }
  /* tasks completed per week: a task counts once in every week it was completed (done events). Old tasks without events use their saved done time. */
  function weeklyCompleted(events, tasks, today, tz, weeks) {
    const n = weeks || WEEKS, cur = weekStart(today), starts = []; for (let i = n - 1; i >= 0; i--) starts.push(tm.addDaysIso(cur, -7 * i));
    const sets = {}; starts.forEach(s => { sets[s] = new Set(); });
    const hasDone = new Set(); (events || []).forEach(e => { if (e.type === 'done') hasDone.add(e.taskId); });
    const put = (id, at) => { if (!at) return; const w = weekStart(tm.localDateKey(at, tz)); if (sets[w]) sets[w].add(id); };
    (events || []).forEach(e => { if (e.type === 'done') put(e.taskId, ms(e.createdAt)); });
    (tasks || []).forEach(t => { if (t.status === 'done' && t.doneAt && !hasDone.has(t.id)) put(t.id, ms(t.doneAt)); });
    return starts.map(s => ({ weekStart: s, weekEnd: tm.addDaysIso(s, 6), count: sets[s].size, ids: [...sets[s]] }));
  }
  function usedVsAllotted(tasks) {
    return (tasks || []).filter(t => t.status !== 'archived' && num(t.hours) && t.hours > 0).map(t => {
      const plan = Math.round(t.hours * 3600), used = num(t.secs) ? t.secs : 0;
      return { id: t.id, name: t.name, color: num(t.color) ? t.color % 12 : 0, usedSecs: used, planSecs: plan, over: Math.max(0, used - plan), left: Math.max(0, plan - used), pct: Math.min(100, Math.round(used / plan * 100)) };
    }).sort((a, b) => (b.over > 0) - (a.over > 0) || b.usedSecs - a.usedSecs || (a.id < b.id ? -1 : 1));
  }
  function statusCounts(tasks) { const c = { todo: 0, doing: 0, done: 0, archived: 0 }; (tasks || []).forEach(t => { if (c[t.status] != null) c[t.status]++; }); return c; }
  /* ---- CSV: a cell that starts with = + - @ (or a tab / return) is prefixed with an apostrophe so a spreadsheet never runs it as a formula */
  function csvCell(v) {
    let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  const csvRow = a => a.map(csvCell).join(',');
  const mins = secs => Math.round(secs / 60);
  /* one line per day and task (all tasks, not only the top six) with timer and manual minutes kept apart */
  function dailyCsv(days, sessions, tasks, tz, anon, goalFn) {
    const names = nameMap(tasks, anon), tm1 = dailyBuckets(sessions.filter(s => s.kind !== 'manual'), days, tz), mn = dailyBuckets(sessions.filter(s => s.kind === 'manual'), days, tz);
    const gcol = typeof goalFn === 'function' && days.some(d => { const g = goalFn(d); return g.secs > 0 || g.rest; });   // the goal column is added only when some day has a goal or is a rest day
    const goalCell = d => { const g = goalFn(d); return g.rest ? 'rest' : (g.secs > 0 ? mins(g.secs) : ''); };
    const lines = [csvRow(['Date', 'Task', 'Timer minutes', 'Manual minutes', 'Total minutes'].concat(gcol ? ['Goal minutes'] : []))];
    days.forEach(d => { const ids = new Set([...Object.keys(tm1[d] || {}), ...Object.keys(mn[d] || {})]); [...ids].sort().forEach(id => { const a = (tm1[d] || {})[id] || 0, b = (mn[d] || {})[id] || 0; lines.push(csvRow([d, names(id), mins(a), mins(b), mins(a + b)].concat(gcol ? [goalCell(d)] : []))); }); });
    return lines.join('\r\n') + '\r\n';
  }
  function weeklyCsv(weeks, tasks, anon) {
    const names = nameMap(tasks, anon), lines = [csvRow(['Week starting (Monday)', 'Week ending (Sunday)', 'Tasks completed', 'Tasks'])];
    weeks.forEach(w => lines.push(csvRow([w.weekStart, w.weekEnd, w.count, w.ids.map(names).join('; ')])));
    return lines.join('\r\n') + '\r\n';
  }
  /* real names, or "Task A", "Task B" ... (by position in the list) when the owner hides names */
  function nameMap(tasks, anon) {
    const byId = {}; (tasks || []).forEach(t => { byId[t.id] = t; }); const order = {}; let k = 0;
    return id => { if (!anon) return (byId[id] && byId[id].name) || 'Deleted task'; if (!(id in order)) order[id] = k++; return 'Task ' + letter(order[id]); };
  }
  const api = { COLORS, PATTERNS, RANGES, WINDOW_DAYS, WEEKS, TOP, dayList, dailyBuckets, firstDay, weekdayIndex, cleanWeekday, goalPlan, stackModel, streak, weekStart, weeklyCompleted, usedVsAllotted, statusCounts, csvCell, dailyCsv, weeklyCsv, nameMap, letter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreTodoGraph = api;
})(typeof window !== 'undefined' ? window : globalThis);
