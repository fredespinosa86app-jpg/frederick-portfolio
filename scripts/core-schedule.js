/* ==========================================================================
   core-schedule.js - billing periods from a billing profile's schedule, and what state each period is in (CodeFlow 4.5.0, phase B3).
   Runs in the browser (window.coreSchedule) and in Node (module.exports). No network, no database.
   Nothing here is stored: the periods are WORKED OUT from the saved schedule every time, so they cannot drift from the profile.
   Only the owner's decision to skip a period is saved (periodSkips, create-only).

   Schedules (billing profile field schedKind):
     monthly   the calendar month
     midmonth  1st to 15th, and 16th to the end of the month
     weekly    7 days from the chosen week-start day (mon..sun)
     custom    1 to 4 days of the month (anchors, for example 10,25): a period runs from one anchor day to the day before the next one.
               An anchor beyond the month's last day (31 in April) is the month's last day.
   A period is DUE once its last day has fully passed at the profile's generation time in the profile's time zone: on the day after the
   last day, at genTime. Date maths uses whole calendar days only (no clock), so daylight saving cannot move a boundary.
   Honest limits: the database rules do not check period dates against the schedule; this file and the page do. "Skipped" is also
   enforced by the page only.
   ========================================================================== */
(function (root) {
  'use strict';
  const req = n => (typeof require === 'function' && typeof module !== 'undefined') ? require(n) : null;
  const T = req('./core-time.js') || root.coreTime, I = req('./core-ids.js') || root.coreIds;
  const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], MAX_LIST = 24, MAX_PERIOD_DAYS = 93;
  const pad = n => String(n).padStart(2, '0');
  const split = iso => iso.split('-').map(Number);
  const dayNum = iso => { const [y, m, d] = split(iso); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };      // whole days since 1970-01-01
  const add = (iso, n) => T.addDaysIso(iso, n);
  const monthStart = (y, m) => y + '-' + pad(m) + '-01';
  const monthEnd = (y, m) => y + '-' + pad(m) + '-' + pad(T.daysInMonth(y, m));
  const weekdayIdx = iso => (new Date(dayNum(iso) * 86400000).getUTCDay() + 6) % 7;           // 0 = Monday
  const anchorList = p => String(p.anchors || '').split(',').map(Number).filter(n => n >= 1 && n <= 31);

  /* the cut days of one month for a custom schedule (clamped, de-duplicated, ascending) */
  function cuts(p, y, m) { return Array.from(new Set(anchorList(p).map(a => T.clampDay(y, m, a)))).sort((a, b) => a - b); }
  const prevMonth = (y, m) => m === 1 ? [y - 1, 12] : [y, m - 1], nextMonth = (y, m) => m === 12 ? [y + 1, 1] : [y, m + 1];

  /* the period that contains a calendar date -> { start, end } (ISO dates) */
  function periodAt(p, iso) {
    const [y, m, d] = split(iso);
    if (p.schedKind === 'monthly') return { start: monthStart(y, m), end: monthEnd(y, m) };
    if (p.schedKind === 'midmonth') return d <= 15 ? { start: monthStart(y, m), end: y + '-' + pad(m) + '-15' } : { start: y + '-' + pad(m) + '-16', end: monthEnd(y, m) };
    if (p.schedKind === 'weekly') {
      const w = WEEKDAYS.indexOf(p.weekStart); if (w < 0) throw new Error('Unknown week start.');
      const back = (weekdayIdx(iso) - w + 7) % 7, start = add(iso, -back); return { start, end: add(start, 6) };
    }
    if (p.schedKind === 'custom') {
      if (!anchorList(p).length) throw new Error('No anchor days.');
      const here = cuts(p, y, m).filter(c => c <= d);
      let start;
      if (here.length) start = y + '-' + pad(m) + '-' + pad(here[here.length - 1]);
      else { const [py, pm] = prevMonth(y, m), pc = cuts(p, py, pm); start = py + '-' + pad(pm) + '-' + pad(pc[pc.length - 1]); }
      return { start, end: add(nextStart(p, start), -1) };
    }
    throw new Error('Unknown schedule.');
  }
  /* the start of the period that follows the custom period starting on `start` */
  function nextStart(p, start) {
    const [y, m, d] = split(start), later = cuts(p, y, m).filter(c => c > d);
    if (later.length) return y + '-' + pad(m) + '-' + pad(later[0]);
    const [ny, nm] = nextMonth(y, m); return ny + '-' + pad(nm) + '-' + pad(cuts(p, ny, nm)[0]);
  }
  /* the period right after the one that ends on `endIso` */
  const periodAfter = (p, endIso) => periodAt(p, add(endIso, 1));
  /* true when a date is the first day of a schedule period */
  const isBoundary = (p, iso) => periodAt(p, iso).start === iso;
  const periodDays = per => dayNum(per.end) - dayNum(per.start) + 1;

  /* the moment (UTC ms) a period becomes due: the day after its last day, at genTime, in the profile's zone */
  function dueAt(p, per) {
    const [y, m, d] = split(add(per.end, 1)), [hh, mm] = String(p.genTime || '09:00').split(':').map(Number);
    return T.zonedToUtc(y, m, d, hh, mm, 0, p.tz);
  }
  const isDue = (p, per, nowMs) => dueAt(p, per) <= nowMs;
  const idOf = (clientId, per) => clientId + '__' + per.start.replace(/-/g, '') + '__' + per.end.replace(/-/g, '');

  /* consecutive periods starting on `fromIso` (must be a boundary) that are due now. { periods, hidden } - at most MAX_LIST newest ones are kept. */
  function duePeriods(p, fromIso, nowMs) {
    if (!isBoundary(p, fromIso)) throw new Error('That date is not the start of a period in this schedule.');
    const all = []; let per = periodAt(p, fromIso), guard = 0;
    while (isDue(p, per, nowMs) && guard++ < 5000) { all.push(per); per = periodAfter(p, per.end); }
    return { periods: all.slice(-MAX_LIST), hidden: Math.max(0, all.length - MAX_LIST), next: per };
  }
  /* the newest period that is already due (the default "first period to bill" suggestion), or null */
  function lastDue(p, nowMs) {
    const today = T.localDateKey(nowMs, p.tz); let per = periodAt(p, add(today, -1)), guard = 0;
    while (!isDue(p, per, nowMs) && guard++ < 10) per = periodAt(p, add(per.start, -1));
    return isDue(p, per, nowMs) ? per : null;
  }

  /* ------------------------------------------------------------------ the state of each period */
  const RANK = { DRAFT: 1, SUBMITTED: 2, APPROVED: 3 };
  const overlaps = (a, b) => a.start <= b.end && b.start <= a.end;
  const iso8 = d => d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6);
  /* entries: billableEntries (periodStart/periodEnd as YYYYMMDD); invoices: {id,status}; skips: periodSkips docs.
     -> { state, entries, skip, note }
     states: skipped, check (hours exist for different dates), waiting, draft, submitted, ready, toomany (3+ approved), invoiced, partial */
  function stateOf(clientId, per, entries, invoices, skips) {
    const id = idOf(clientId, per), skip = (skips || []).find(s => s.id === id) || null;
    const mine = (entries || []).filter(e => e.clientId === clientId && e.status !== 'SUPERSEDED' && overlaps(per, { start: iso8(e.periodStart), end: iso8(e.periodEnd) }));
    const exact = mine.filter(e => iso8(e.periodStart) === per.start && iso8(e.periodEnd) === per.end);
    if (skip) return { state: 'skipped', entries: exact, skip, note: exact.length ? 'Hours exist for a period you skipped.' : '' };
    if (mine.length > exact.length) return { state: 'check', entries: exact, skip: null, note: 'Hours exist for dates that overlap this period but do not match it exactly. Open Billable hours to check them.' };
    if (!exact.length) return { state: 'waiting', entries: [], skip: null, note: '' };
    const low = exact.reduce((m, e) => Math.min(m, RANK[e.status] || 1), 3);
    if (low === 1) return { state: 'draft', entries: exact, skip: null, note: '' };
    if (low === 2) return { state: 'submitted', entries: exact, skip: null, note: '' };
    const inv = new Map((invoices || []).map(i => [i.id, i])), live = e => e.relatedInvoiceId && inv.get(e.relatedInvoiceId) && inv.get(e.relatedInvoiceId).status !== 'CANCELLED';
    const n = exact.filter(live).length;
    if (n === exact.length) return { state: 'invoiced', entries: exact, skip: null, note: '' };
    if (n > 0) return { state: 'partial', entries: exact, skip: null, note: 'Some of the hours are on an invoice and some are not.' };
    if (exact.length > 2) return { state: 'toomany', entries: exact, skip: null, note: 'An invoice holds at most 2 hours entries. Replace entries to combine them first.' };
    return { state: 'ready', entries: exact, skip: null, note: '' };
  }
  const STATE_LABEL = { waiting: 'Waiting for hours', draft: 'Hours draft', submitted: 'Submitted', ready: 'Approved, ready to invoice', toomany: 'Too many entries', invoiced: 'Invoiced', partial: 'Part invoiced', skipped: 'Skipped', check: 'Check hours' };
  const ACTION_STATES = ['waiting', 'draft', 'submitted', 'ready', 'toomany', 'partial', 'check'];     // states that still need you (counted by the badge)

  /* where the list starts for one client: the day after the newest period that is finished (invoiced or skipped), as a schedule boundary.
     entries/invoices/skips are the client's records. Returns an ISO date, or '' when the client has nothing yet (the owner then chooses). */
  function listStart(p, clientId, entries, invoices, skips, nowMs) {
    const done = [];
    (skips || []).filter(s => s.clientId === clientId).forEach(s => done.push(iso8(s.periodEnd)));
    const inv = new Map((invoices || []).map(i => [i.id, i]));
    (entries || []).filter(e => e.clientId === clientId && e.status === 'APPROVED' && e.relatedInvoiceId && inv.get(e.relatedInvoiceId) && inv.get(e.relatedInvoiceId).status !== 'CANCELLED').forEach(e => done.push(iso8(e.periodEnd)));
    let any = (entries || []).some(e => e.clientId === clientId && e.status !== 'SUPERSEDED');
    if (!done.length && !any) return '';
    if (!done.length) {                                                                // hours exist but nothing is finished: start at the earliest period holding hours
      const first = (entries || []).filter(e => e.clientId === clientId && e.status !== 'SUPERSEDED').map(e => iso8(e.periodStart)).sort()[0];
      return periodAt(p, first).start;
    }
    return periodAfter(p, periodAt(p, done.sort().slice(-1)[0]).end).start;
  }

  /* what to save for a skip: the period ID is the record ID, so a period can be skipped once */
  function skipPlan(clientId, per, reason, o) {
    const no = r => ({ ok: false, reason: r }), v = I.validateClientId(clientId); if (!v.ok) return no('Invalid Client ID.');
    if (!o || o.registryStatus !== 'active') return no('This Client ID is not active.');
    if (!o.profile || o.profile.arrangement !== 'hourly') return no('Only hourly clients have periods to skip.');
    if (!isBoundary(o.profile, per.start) || periodAt(o.profile, per.start).end !== per.end) return no('That is not a period of this client\'s schedule.');
    if (!isDue(o.profile, per, o.nowMs)) return no('That period is not due yet.');
    const r = String(reason == null ? '' : reason).trim(); if (r.length < 3 || r.length > 200) return no('Give a reason of 3 to 200 characters.');
    if (!(o.uid && typeof o.uid === 'string')) return no('Not signed in.');
    const id = idOf(v.id, per);
    if ((o.skips || []).some(s => s.id === id)) return no('This period was already skipped.');
    if (o.state && o.state !== 'waiting') return no('Hours or an invoice already exist for this period, so it cannot be skipped.');
    return { ok: true, id, doc: { clientId: v.id, periodStart: per.start.replace(/-/g, ''), periodEnd: per.end.replace(/-/g, ''), reason: r, actor: o.uid, createdAt: '@server-time' } };
  }

  const describe = per => per.start + ' to ' + per.end + ' (' + periodDays(per) + ' day' + (periodDays(per) === 1 ? '' : 's') + ')';
  const api = { MAX_LIST, MAX_PERIOD_DAYS, STATE_LABEL, ACTION_STATES, periodAt, periodAfter, isBoundary, periodDays, dueAt, isDue, idOf, duePeriods, lastDue, stateOf, listStart, skipPlan, describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreSchedule = api;
})(typeof window !== 'undefined' ? window : globalThis);
