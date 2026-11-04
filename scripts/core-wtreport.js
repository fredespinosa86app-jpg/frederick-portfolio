/* ==========================================================================
   core-wtreport.js - WorkTrack history and reports for CodeFlow 4.5.0 (phase W4).
   Runs in the browser (window.coreWtReport) and in Node (module.exports). No network, no database, READ-ONLY maths.
   The page and the CSV both use these functions, so what you see and what you export cannot disagree.

   Rules (all tested):
   - Times are integer milliseconds. Hours are shown as hh:mm (rounded to the nearest minute, once, at the figure shown) and as decimal hours
     (hundredths, half up). A total is added up in milliseconds and rounded once - never by adding rounded rows.
   - A session belongs to the day it STARTED, in its own stored zone (workSessions.date). A session that crosses midnight stays on its start day.
   - The effective values are the original punches with the corrections applied (core-wtlog.effective). The original is never changed and is
     always shown beside the effective values. If the corrected sequence is not valid, the original values are used and a warning is shown.
   - Totals count each complete session once. Attendance is never multiplied by the number of clients.
   - The by-client table shows the attendance time of the sessions each client was on. It is NOT split between clients and is never added up.
   - Incomplete, still-open and invalid sessions are listed but left out of every total, and counted in a visible note.
   - Weeks start on the CURRENT week-start setting (the setting keeps no history).
   ========================================================================== */
(function (root) {
  'use strict';
  const W = (typeof require === 'function' && typeof module !== 'undefined') ? require('./core-worktrack.js') : root.coreWork;
  const L = (typeof require === 'function' && typeof module !== 'undefined') ? require('./core-wtlog.js') : root.coreWtLog;
  const T = (typeof require === 'function' && typeof module !== 'undefined') ? require('./core-time.js') : root.coreTime;
  const DEFAULT_DAYS = 31, MAX_DAYS = 92, MAX_SESSIONS = 150, CONFIRM_SESSIONS = 60, TYPICAL_DOCS = 12;
  const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const STATUS_LABEL = { complete: 'Complete', incomplete: 'Closed as incomplete', open: 'In progress', invalid: 'Invalid record' };
  const ISO = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
  const pad = n => String(n).padStart(2, '0');

  /* ---------------- number formats ---------------- */
  function hm(ms) { if (ms == null || !isFinite(ms)) return ''; const t = Math.round(Math.max(0, ms) / 60000); return pad(Math.floor(t / 60)) + ':' + pad(t % 60); }
  function hours(ms) { if (ms == null || !isFinite(ms)) return ''; const c = Math.round(Math.max(0, ms) * 100 / 3600000); return Math.floor(c / 100) + '.' + pad(c % 100); }

  /* ---------------- date range ---------------- */
  const isoOk = s => ISO.test(s || '') && T.addDaysIso(s, 0) === s;
  function dayCount(from, to) { const a = from.split('-').map(Number), b = to.split('-').map(Number); return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000) + 1; }
  function validRange(from, to) {
    if (!isoOk(from) || !isoOk(to)) return { ok: false, reason: 'Choose both dates.' };
    if (to < from) return { ok: false, reason: 'The end date is before the start date.' };
    const days = dayCount(from, to);
    if (days > MAX_DAYS) return { ok: false, reason: 'Choose at most ' + MAX_DAYS + ' days at a time.' };
    return { ok: true, days };
  }
  function defaultRange(todayIso) { return { from: T.addDaysIso(todayIso, -(DEFAULT_DAYS - 1)), to: todayIso }; }
  /* each session costs one read for itself plus its punches, clients and corrections */
  function estimate(n) { const per = W.MAX_EVENTS + W.MAX_CLIENTS + L.MAX_CORRECTIONS; return { sessions: n, typical: n * (1 + TYPICAL_DOCS), most: n * (1 + per), tooMany: n > MAX_SESSIONS, needsConfirm: n > CONFIRM_SESSIONS && n <= MAX_SESSIONS }; }

  /* ---------------- one session -> one row ----------------
     s: { sid, tz, date, events:[{n,type,atMs,reason}], corrections:[{id,kind,n,type,clientId,atMs,at2Ms,reason,createdMs}], assign:[{clientId,status}] } */
  const view = d => !d.valid ? { startMs: null, endMs: null, sessionMs: null, workingMs: null, breakMs: null } : ({ startMs: d.startMs, endMs: d.endMs, sessionMs: d.startMs == null ? null : d.grossMs, workingMs: d.netMs, breakMs: d.startMs == null ? null : d.breakMs });
  function statusOf(d) { if (!d.valid) return 'invalid'; if (!d.closed) return 'open'; return d.incomplete ? 'incomplete' : 'complete'; }
  function buildRow(s) {
    const evs = (s.events || []).map(e => ({ n: e.n, type: e.type, atMs: e.atMs, reason: e.reason || '' }));
    const orig = W.derive(evs, null), corrs = (s.corrections || []).slice();
    let used = orig, effEvents = orig.events, fellBack = false, problem = orig.valid ? '' : orig.problem;
    if (corrs.length && orig.valid) {
      const eff = L.effective(evs, corrs);
      if (eff.derived.valid && eff.derived.closed) { used = eff.derived; effEvents = eff.events; }
      else { fellBack = true; problem = 'The corrections on this session do not give a valid day, so the original punches are used.'; }
    }
    const co = W.clientsOf(s.assign || []).active, ce = L.effectiveClients(s.assign || [], corrs);
    const corrected = corrs.length > 0 && !fellBack;
    return {
      sid: s.sid, date: s.date || '', tz: s.tz || '', status: evs.length ? statusOf(used) : 'invalid', corrected, fellBack, problem: evs.length ? problem : 'No punches were found for this session.',
      orig: view(orig), eff: view(used), origEvents: orig.events, effEvents,
      clientsOrig: co, clientsEff: ce,
      corrections: corrs.slice().sort((a, b) => (a.createdMs - b.createdMs) || (a.id < b.id ? -1 : 1))
    };
  }
  const counts = r => r.status === 'complete';

  /* ---------------- filters ---------------- */
  /* f: { client:'' | 'CL-001', status:'all'|'complete'|'incomplete'|'open'|'invalid'|'corrected' } */
  function filterRows(rows, f) {
    f = f || {}; const c = f.client || '', st = f.status || 'all';
    return rows.filter(r => (!c || r.clientsEff.indexOf(c) >= 0)
      && (st === 'all' || (st === 'corrected' ? r.corrected : r.status === st))).slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.eff.startMs || 0) - (a.eff.startMs || 0)));
  }

  /* ---------------- summaries ---------------- */
  function weekKey(date, weekStart) {
    const i = Math.max(0, WEEKDAYS.indexOf(weekStart)), p = date.split('-').map(Number), dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
    return T.addDaysIso(date, -((dow - i + 7) % 7));
  }
  const blank = key => ({ key, sessions: 0, sessionMs: 0, workingMs: 0, breakMs: 0 });
  const add = (g, r) => { g.sessions += 1; g.sessionMs += r.eff.sessionMs; g.workingMs += r.eff.workingMs; g.breakMs += r.eff.breakMs; };
  function summarize(rows, o) {
    o = o || {}; const ws = o.weekStart || 'mon';
    const overall = blank('all'), day = {}, week = {}, month = {}, cli = {}; overall.excluded = { incomplete: 0, open: 0, invalid: 0 };
    rows.forEach(r => {
      if (!counts(r)) { overall.excluded[r.status] += 1; return; }
      add(overall, r);
      [[day, r.date], [week, weekKey(r.date, ws)], [month, r.date.slice(0, 7)]].forEach(p => add(p[0][p[1]] || (p[0][p[1]] = blank(p[1])), r));
      r.clientsEff.forEach(c => add(cli[c] || (cli[c] = blank(c)), r));           // each client row counts the session once; rows are never added together
    });
    const list = m => Object.keys(m).sort().reverse().map(k => m[k]);
    return { overall, days: list(day), weeks: list(week), months: list(month), clients: Object.keys(cli).sort().map(k => cli[k]), weekStart: ws };
  }

  /* ---------------- CSV ---------------- */
  /* a cell that starts like a formula is stored as text, so a spreadsheet never runs it */
  function cell(v) {
    let t = v == null ? '' : String(v);
    if (/^[\t\r ]*[=+\-@]/.test(t) || /^[\t\r]/.test(t)) t = "'" + t;
    return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  const localText = (ms, tz) => { if (ms == null) return ''; const p = T.parts(ms, tz || 'UTC'); return p.year + '-' + pad(p.month) + '-' + pad(p.day) + ' ' + pad(p.hour) + ':' + pad(p.minute) + ':' + pad(p.second); };
  const COLUMNS = ['session_id', 'date', 'time_zone', 'status', 'corrected',
    'original_start', 'original_end', 'original_session_hhmm', 'original_working_hhmm', 'original_break_hhmm', 'original_working_hours',
    'effective_start', 'effective_end', 'session_hhmm', 'working_hhmm', 'break_hhmm', 'session_hours', 'working_hours',
    'original_clients', 'effective_clients', 'corrections', 'correction_notes', 'warning'];
  const corrText = (c, tz) => (L.KIND_LABEL[c.kind] || c.kind) + (c.kind === 'CLIENT_ADD' || c.kind === 'CLIENT_REMOVE' ? ' ' + c.clientId : c.kind === 'TIME' ? ' #' + c.n + ' to ' + localText(c.atMs, tz) : ' ' + (L.ADD_NAME[c.type] || c.type) + ' ' + localText(c.atMs, tz) + ' - ' + localText(c.at2Ms, tz)) + ' (' + c.reason + ')';
  function rowCsv(r) {
    const o = r.orig, e = r.eff, done = r.status === 'complete', cl = x => x.join(' ');
    return [r.sid, r.date, r.tz, STATUS_LABEL[r.status], r.corrected ? 'yes' : 'no',
      localText(o.startMs, r.tz), localText(o.endMs, r.tz), hm(o.sessionMs), hm(o.workingMs), hm(o.breakMs), hours(o.workingMs),
      localText(e.startMs, r.tz), localText(e.endMs, r.tz), hm(e.sessionMs), hm(e.workingMs), hm(e.breakMs), done ? hours(e.sessionMs) : '', done ? hours(e.workingMs) : '',
      cl(r.clientsOrig), cl(r.clientsEff), r.corrections.length, r.corrections.map(c => corrText(c, r.tz)).join(' | '), r.problem || ''].map(cell).join(',');
  }
  function csv(rows) { return '\uFEFF' + [COLUMNS.join(',')].concat(rows.map(rowCsv)).join('\r\n') + '\r\n'; }
  function csvName(from, to, tzLabel) { return 'worktrack-' + from + '_to_' + to + '-' + String(tzLabel || 'zones').replace(/[^A-Za-z0-9_+-]+/g, '-') + '.csv'; }

  const api = { DEFAULT_DAYS, MAX_DAYS, MAX_SESSIONS, CONFIRM_SESSIONS, WEEKDAYS, STATUS_LABEL, COLUMNS, hm, hours, validRange, defaultRange, dayCount, estimate, buildRow, filterRows, weekKey, summarize, cell, csv, csvName, localText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreWtReport = api;
})(typeof window !== 'undefined' ? window : globalThis);
