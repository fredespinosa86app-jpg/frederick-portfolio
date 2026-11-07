/* ==========================================================================
   core-todo.js - pure logic of the personal To-do & focus tracker (CodeFlow 4.5.0, phase TD1). No DOM, no database, no clock of its own.
   Runs in the browser (window.coreTodo) and in Node (module.exports) so the SAME code is unit-tested.
   Data (owner only; see firestore.rules.strict "TD1"):
     todoTasks/{id}      { name, desc, due, hours, focusMin, status, secs, doneAt, color, createdAt, updatedAt }   secs = cached total of the task's sessions
     todoSessions/{id}   { taskId, start, secs, day, kind: 'timer' | 'manual', createdAt }
     todoNotes/{id}      { taskId, text, sessionId, createdAt, editedAt }
     todoState/main      { taskId, startedAt, goalMin, lastSid, rev, updatedAt }   the ONE running timer ('' = nothing running)
   Days are calendar days in the owner's time zone (Asia/Manila unless told otherwise); a session belongs to the day it STARTED.
   ========================================================================== */
(function (root) {
  'use strict';
  const LIMITS = { name: 120, desc: 2000, note: 2000, hours: 1000, focusMin: 240, tasks: 500, sessionSecs: 86400, longSecs: 43200, colors: 12 };
  const STATUSES = ['todo', 'doing', 'done', 'archived'];
  const STATUS_LABEL = { todo: 'To do', doing: 'In progress', done: 'Done', archived: 'Archived' };
  const FOCUS_CHOICES = [15, 25, 45, 50, 90];
  const DEFAULT_FOCUS = 25;
  const num = v => typeof v === 'number' && isFinite(v);
  const ms = t => !t ? NaN : typeof t.toMillis === 'function' ? t.toMillis() : t instanceof Date ? t.getTime() : num(t) ? t : NaN;
  const pad = n => String(n).padStart(2, '0');

  /* a real calendar date written YYYY-MM-DD (the rules check the shape; this also rejects 2027-02-30) */
  function validDay(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }
  /* the calendar day of an instant in a time zone */
  function dayKey(msv, tz) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(msv)), g = t => p.find(x => x.type === t).value;
    return g('year') + '-' + g('month') + '-' + g('day');
  }
  const dayDiff = (a, b) => Math.round((Date.UTC(...a.split('-').map((x, i) => i === 1 ? Number(x) - 1 : Number(x))) - Date.UTC(...b.split('-').map((x, i) => i === 1 ? Number(x) - 1 : Number(x)))) / 86400000);   // a - b in days

  /* ---- ids: 20 letters and digits; rand() returns a number 0..1 (crypto in the browser, a stub in tests) */
  function newId(rand) {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let s = '';
    for (let i = 0; i < 20; i++) s += A[Math.min(A.length - 1, Math.floor(rand() * A.length))];
    return s;
  }
  const idOk = i => typeof i === 'string' && /^[A-Za-z0-9]{8,40}$/.test(i);

  /* ---- a task typed in the form -> the clean document (or the reasons it is not acceptable) */
  function cleanTask(inp, colorIndex) {
    inp = inp && typeof inp === 'object' ? inp : {}; const errors = [];
    const name = String(inp.name == null ? '' : inp.name).replace(/\s+/g, ' ').trim();
    if (!name) errors.push('Give the task a name.'); else if (name.length > LIMITS.name) errors.push('The name can have at most ' + LIMITS.name + ' characters.');
    const desc = String(inp.desc == null ? '' : inp.desc).trim(); if (desc.length > LIMITS.desc) errors.push('The description can have at most ' + LIMITS.desc + ' characters.');
    const due = String(inp.due == null ? '' : inp.due).trim(); if (due && !validDay(due)) errors.push('The due date is not a real date.');
    const hRaw = String(inp.hours == null ? '' : inp.hours).trim().replace(',', '.'); let hours = hRaw === '' ? 0 : Number(hRaw);
    if (!num(hours) || hours < 0 || hours > LIMITS.hours) { errors.push('Hours allotted must be a number from 0 to ' + LIMITS.hours + '.'); hours = 0; }
    hours = Math.round(hours * 100) / 100;
    const fRaw = String(inp.focusMin == null ? DEFAULT_FOCUS : inp.focusMin).trim(); let focusMin = fRaw === '' ? DEFAULT_FOCUS : Number(fRaw);
    if (!num(focusMin) || !Number.isInteger(focusMin) || focusMin < 1 || focusMin > LIMITS.focusMin) { errors.push('The focus block must be a whole number of minutes from 1 to ' + LIMITS.focusMin + '.'); focusMin = DEFAULT_FOCUS; }
    let color = Number.isInteger(inp.color) ? inp.color : (Number.isInteger(colorIndex) ? colorIndex : 0); color = ((color % LIMITS.colors) + LIMITS.colors) % LIMITS.colors;
    return { ok: !errors.length, errors, doc: { name, desc, due, hours, focusMin, color } };
  }
  /* next colour for a new task: the least used of the 12, lowest number first */
  function nextColor(tasks) {
    const use = new Array(LIMITS.colors).fill(0); (tasks || []).forEach(t => { if (t && Number.isInteger(t.color) && t.color >= 0 && t.color < LIMITS.colors) use[t.color]++; });
    return use.indexOf(Math.min(...use));
  }

  /* ---- time shown to the owner */
  function fmtClock(secs) { secs = Math.max(0, Math.floor(num(secs) ? secs : 0)); const h = Math.floor(secs / 3600), m = Math.floor(secs % 3600 / 60), s = secs % 60; return (h ? h + ':' + pad(m) : String(m)) + ':' + pad(s); }
  function fmtHours(secs) {
    secs = Math.max(0, Math.round(num(secs) ? secs : 0)); if (secs < 60) return secs ? secs + ' s' : '0 h';
    const m = Math.round(secs / 60), h = Math.floor(m / 60), r = m % 60;
    return h ? h + ' h' + (r ? ' ' + r + ' min' : '') : m + ' min';
  }
  const hoursNum = secs => Math.round(secs / 36) / 100;     // 2 decimals, for tables

  /* ---- progress of a task: used time against the allotted hours */
  function progress(task) {
    const used = Math.max(0, num(task && task.secs) ? task.secs : 0), plan = Math.max(0, num(task && task.hours) ? task.hours : 0) * 3600;
    if (!plan) return { used, plan, pct: 0, over: false, left: 0, noPlan: true };
    return { used, plan, pct: Math.min(100, Math.round(used / plan * 100)), over: used > plan, left: Math.max(0, plan - used), noPlan: false };
  }

  /* ---- due dates */
  function dueInfo(task, today) {
    if (!task || !task.due || !validDay(task.due) || !validDay(today)) return { kind: 'none', days: 0, text: '' };
    const d = dayDiff(task.due, today), done = task.status === 'done' || task.status === 'archived';
    if (d < 0) return { kind: done ? 'past' : 'overdue', days: -d, text: done ? 'Was due ' + task.due : 'Overdue by ' + (-d) + (d === -1 ? ' day' : ' days') };
    if (d === 0) return { kind: 'today', days: 0, text: 'Due today' };
    return { kind: 'soon', days: d, text: d === 1 ? 'Due tomorrow' : 'Due in ' + d + ' days' };
  }
  const isOverdue = (task, today) => dueInfo(task, today).kind === 'overdue';

  /* ---- the list: filter and sort */
  function filterTasks(tasks, f) {
    const list = (tasks || []).filter(t => t && t.status);
    if (f === 'open') return list.filter(t => t.status === 'todo' || t.status === 'doing');
    if (f === 'todo' || f === 'doing' || f === 'done' || f === 'archived') return list.filter(t => t.status === f);
    return list.filter(t => t.status !== 'archived');    // 'all' hides archived ones; they have their own filter
  }
  /* open tasks first (soonest due first, no due date last), then done (newest first), then archived; name breaks ties */
  function sortTasks(tasks) {
    const rank = t => t.status === 'doing' || t.status === 'todo' ? 0 : t.status === 'done' ? 1 : 2;
    return (tasks || []).slice().sort((a, b) => rank(a) - rank(b)
      || (rank(a) === 0 ? ((a.due || '9999-99-99') < (b.due || '9999-99-99') ? -1 : (a.due || '9999-99-99') > (b.due || '9999-99-99') ? 1 : 0) : (ms(b.doneAt) || 0) - (ms(a.doneAt) || 0))
      || String(a.name).localeCompare(String(b.name)));
  }

  /* ---- the running timer */
  const isRunning = st => !!(st && st.taskId && idOk(st.taskId) && num(ms(st.startedAt)));
  function elapsedSecs(st, nowMs) { if (!isRunning(st) || !num(nowMs)) return 0; return Math.max(0, Math.floor((nowMs - ms(st.startedAt)) / 1000)); }
  function focusInfo(st, nowMs) {
    const el = elapsedSecs(st, nowMs), goal = isRunning(st) && num(st.goalMin) ? Math.max(0, st.goalMin) * 60 : 0;
    return { elapsed: el, goal, remaining: goal ? Math.max(0, goal - el) : 0, reached: !!goal && el >= goal, over: goal ? Math.max(0, el - goal) : 0 };
  }
  /* a timer that ran longer than 12 hours was probably forgotten */
  const needsTrim = (st, nowMs) => elapsedSecs(st, nowMs) > LIMITS.longSecs;
  /* the session saved when the timer stops. trimTo = seconds to keep (optional). Never longer than a day, never zero (the database wants at least one second). */
  function stopSession(st, nowMs, tz, trimTo) {
    if (!isRunning(st)) return null;
    let secs = elapsedSecs(st, nowMs); if (num(trimTo) && trimTo >= 1) secs = Math.min(secs, Math.floor(trimTo));
    secs = Math.min(LIMITS.sessionSecs, Math.max(1, secs));
    return { taskId: st.taskId, start: ms(st.startedAt), secs, day: dayKey(ms(st.startedAt), tz), kind: 'timer' };
  }
  /* what pressing Play on a task does while a timer may already be running */
  function playPlan(st, taskId) {
    if (!idOk(taskId)) return { kind: 'invalid' };
    if (!isRunning(st)) return { kind: 'start' };
    return st.taskId === taskId ? { kind: 'already' } : { kind: 'switch', from: st.taskId };
  }
  /* a task cannot be completed, archived or deleted while its timer runs */
  const canLeave = (st, taskId) => !(isRunning(st) && st.taskId === taskId);

  /* ---- manual time ("I forgot to start the timer"): minutes on a given day, 1 minute to 24 hours */
  function cleanManual(inp, today) {
    inp = inp && typeof inp === 'object' ? inp : {}; const errors = [];
    const day = String(inp.day == null ? '' : inp.day).trim(); if (!validDay(day)) errors.push('Pick a real date.'); else if (validDay(today) && dayDiff(day, today) > 0) errors.push('The date cannot be in the future.');
    const m = Number(String(inp.minutes == null ? '' : inp.minutes).trim().replace(',', '.')); const mins = Math.round(m);
    if (!num(m) || String(inp.minutes).trim() === '' || mins < 1 || mins > 1440) errors.push('Minutes must be a whole number from 1 to 1440.');
    return { ok: !errors.length, errors, day, secs: errors.length ? 0 : mins * 60 };
  }

  /* ---- sums */
  const sumSecs = sessions => (sessions || []).reduce((a, s) => a + (s && num(s.secs) && s.secs > 0 ? s.secs : 0), 0);
  /* secs of the task after a change (never negative) */
  const addSecs = (task, delta) => Math.max(0, Math.min(3600000, Math.round((task && num(task.secs) ? task.secs : 0) + delta)));

  /* ---- history of one task: sessions, notes and status changes in one list, newest first */
  function history(task, sessions, notes) {
    const out = [];
    (sessions || []).forEach(s => { if (s && num(ms(s.start))) out.push({ type: 'session', id: s.id, at: ms(s.start), secs: s.secs, kind: s.kind, day: s.day }); });
    (notes || []).forEach(n => { if (n && num(ms(n.createdAt))) out.push({ type: 'note', id: n.id, at: ms(n.createdAt), text: n.text, sessionId: n.sessionId || '', edited: !!n.editedAt }); });
    if (task && num(ms(task.createdAt))) out.push({ type: 'created', id: 'created', at: ms(task.createdAt) });
    if (task && task.status === 'done' && num(ms(task.doneAt))) out.push({ type: 'done', id: 'done', at: ms(task.doneAt) });
    return out.sort((a, b) => b.at - a.at || String(a.id).localeCompare(String(b.id)));
  }
  /* sessions of a task within the list, newest first (for the "recalculate" button) */
  const forTask = (list, taskId) => (list || []).filter(x => x && x.taskId === taskId);

  const api = { LIMITS, STATUSES, STATUS_LABEL, FOCUS_CHOICES, DEFAULT_FOCUS, validDay, dayKey, dayDiff, newId, idOk, cleanTask, nextColor, fmtClock, fmtHours, hoursNum, progress, dueInfo, isOverdue,
    filterTasks, sortTasks, isRunning, elapsedSecs, focusInfo, needsTrim, stopSession, playPlan, canLeave, cleanManual, sumSecs, addSecs, history, forTask };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreTodo = api;
})(typeof window !== 'undefined' ? window : globalThis);
