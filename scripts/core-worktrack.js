/* ==========================================================================
   core-worktrack.js - WorkTrack state machine and clock maths for CodeFlow 4.5.0 (phase W1).
   Runs in the browser (window.coreWork) and in Node (module.exports) so the SAME table is unit-tested and is compared,
   case by case, with the database rules (firestore.rules.strict, "workEvents").
   Nothing here touches the network or the database.

   Events:  CLOCK_IN, FIRST_BREAK_OUT/IN, LUNCH_OUT/IN, LAST_BREAK_OUT/IN, CLOCK_OUT, CLOSE_INCOMPLETE (needs a reason).
   State :  NOT_STARTED | WORKING | FIRST_BREAK | LUNCH | LAST_BREAK, plus three "already used" flags (fb, lu, lb).
   The counter n counts EVENTS RECORDED in the session (1, 2, 3 ...). A skipped break leaves no hole: the next event just takes the next number.
   ========================================================================== */
(function (root) {
  'use strict';
  const TYPES = ['CLOCK_IN', 'FIRST_BREAK_OUT', 'FIRST_BREAK_IN', 'LUNCH_OUT', 'LUNCH_IN', 'LAST_BREAK_OUT', 'LAST_BREAK_IN', 'CLOCK_OUT', 'CLOSE_INCOMPLETE'];
  const STATES = ['NOT_STARTED', 'WORKING', 'FIRST_BREAK', 'LUNCH', 'LAST_BREAK'];
  const LABEL = { CLOCK_IN: 'Clock in', FIRST_BREAK_OUT: 'First break out', FIRST_BREAK_IN: 'First break in', LUNCH_OUT: 'Lunch out', LUNCH_IN: 'Lunch in', LAST_BREAK_OUT: 'Last break out', LAST_BREAK_IN: 'Last break in', CLOCK_OUT: 'Clock out', CLOSE_INCOMPLETE: 'Close as incomplete' };
  const STATE_LABEL = { NOT_STARTED: 'Not clocked in', WORKING: 'Working', FIRST_BREAK: 'On first break', LUNCH: 'On lunch', LAST_BREAK: 'On last break' };
  /* which break an OUT/IN type belongs to: state it enters, flag it uses, and the name used in messages */
  const BREAKS = {
    FIRST_BREAK_OUT: { to: 'FIRST_BREAK', flag: 'fb', name: 'first break' }, LUNCH_OUT: { to: 'LUNCH', flag: 'lu', name: 'lunch' }, LAST_BREAK_OUT: { to: 'LAST_BREAK', flag: 'lb', name: 'last break' }
  };
  const BREAK_IN = { FIRST_BREAK_IN: 'FIRST_BREAK', LUNCH_IN: 'LUNCH', LAST_BREAK_IN: 'LAST_BREAK' };
  const OPEN_NAME = { FIRST_BREAK: 'first break', LUNCH: 'lunch', LAST_BREAK: 'last break' };
  const MAX_EVENTS = 12;        // a session has at most 9 events; the rules allow up to 12 as a safety margin
  const REASON_MIN = 3, REASON_MAX = 200;

  const initialState = () => ({ state: 'NOT_STARTED', sid: '', n: 0, fb: false, lu: false, lb: false, lastEid: '', rev: 1 });
  const eventId = (sid, n) => sid + '__' + n;
  const isType = t => TYPES.indexOf(t) >= 0;

  /* The whole table. Returns { ok:true, after } or { ok:false, reason }. `st` is the state BEFORE the event. */
  function next(st, type, sid) {
    if (!isType(type)) return { ok: false, reason: 'Unknown punch.' };
    if (!st || STATES.indexOf(st.state) < 0) return { ok: false, reason: 'The current state is unknown. Refresh the page.' };
    const S = st.state, base = { sid: st.sid, n: st.n + 1, fb: st.fb, lu: st.lu, lb: st.lb };
    if (type === 'CLOCK_IN') {
      if (S !== 'NOT_STARTED') return { ok: false, reason: 'You are already clocked in.' };
      if (!sid) return { ok: false, reason: 'A new session needs its own ID.' };
      return { ok: true, after: { state: 'WORKING', sid, n: 1, fb: false, lu: false, lb: false } };
    }
    if (S === 'NOT_STARTED') return { ok: false, reason: type === 'CLOSE_INCOMPLETE' ? 'There is no open session to close.' : 'Clock in first.' };
    if (type === 'CLOSE_INCOMPLETE') return { ok: true, after: Object.assign({}, base, { state: 'NOT_STARTED' }) };
    if (type === 'CLOCK_OUT') {
      if (S === 'WORKING') return { ok: true, after: Object.assign({}, base, { state: 'NOT_STARTED' }) };
      return { ok: false, reason: 'Your ' + OPEN_NAME[S] + ' is still open. End it first.' };
    }
    if (BREAKS[type]) {
      const b = BREAKS[type];
      if (S !== 'WORKING') return { ok: false, reason: 'Your ' + OPEN_NAME[S] + ' is still open. End it first.' };
      if (st[b.flag]) return { ok: false, reason: 'The ' + b.name + ' was already used in this session.' };
      return { ok: true, after: Object.assign({}, base, { state: b.to, [b.flag]: true }) };
    }
    /* a break-in */
    const need = BREAK_IN[type];
    if (S === need) return { ok: true, after: Object.assign({}, base, { state: 'WORKING' }) };
    if (S === 'WORKING') return { ok: false, reason: 'No break is open.' };
    return { ok: false, reason: 'Your ' + OPEN_NAME[S] + ' is the one that is open, not the ' + OPEN_NAME[need] + '.' };
  }
  /* every punch with whether it is allowed now (for the page buttons) */
  function options(st, sid) { return TYPES.map(t => { const r = next(st, t, sid || 'x'); return { type: t, label: LABEL[t], ok: r.ok, reason: r.ok ? '' : r.reason }; }); }

  /* ---------------- rebuild what happened from the stored events ----------------
     events: [{ n, type, atMs, reason }]  (sorted or not).  nowMs is used only while a session is still open. */
  function derive(events, nowMs) {
    const ev = (events || []).slice().sort((a, b) => a.n - b.n);
    const out = { events: ev, startMs: null, endMs: null, closed: false, incomplete: false, breaks: [], grossMs: 0, netMs: 0, breakMs: 0, valid: true, problem: '' };
    if (!ev.length) return out;
    if (ev[0].type !== 'CLOCK_IN') { out.valid = false; out.problem = 'The first record is not a clock in.'; return out; }
    out.startMs = ev[0].atMs;
    let st = initialState(), sid = 'derive';
    let openBreak = null;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i], r = next(st, e.type, sid);
      if (e.n !== i + 1) { out.valid = false; out.problem = 'A record is missing or out of order (expected number ' + (i + 1) + ').'; return out; }
      if (i > 0 && e.atMs < ev[i - 1].atMs) { out.valid = false; out.problem = 'Record ' + e.n + ' is dated before the one before it.'; return out; }
      if (!r.ok) { out.valid = false; out.problem = 'Record ' + e.n + ' (' + (LABEL[e.type] || e.type) + ') does not follow the allowed order.'; return out; }
      st = Object.assign({}, r.after, { lastEid: '', rev: 0 }); if (e.type === 'CLOCK_IN') st.sid = sid;
      if (BREAKS[e.type]) { openBreak = { kind: BREAKS[e.type].name, startMs: e.atMs, endMs: null }; out.breaks.push(openBreak); }
      else if (BREAK_IN[e.type]) { openBreak.endMs = e.atMs; openBreak = null; }
      if (e.type === 'CLOCK_OUT' || e.type === 'CLOSE_INCOMPLETE') { out.closed = true; out.endMs = e.atMs; out.incomplete = e.type === 'CLOSE_INCOMPLETE'; }
    }
    out.state = st.state;
    const stop = out.closed ? out.endMs : Math.max(nowMs == null ? out.startMs : nowMs, ev[ev.length - 1].atMs);
    out.grossMs = Math.max(0, stop - out.startMs);
    out.breakMs = out.breaks.reduce((a, b) => a + Math.max(0, (b.endMs == null ? stop : b.endMs) - b.startMs), 0);
    out.netMs = out.incomplete ? null : Math.max(0, out.grossMs - out.breakMs);
    return out;
  }
  const STALE_HOURS = 16;
  const isStale = (d, nowMs, hours) => !!(d && d.valid && d.startMs != null && !d.closed && nowMs - d.startMs > (hours || STALE_HOURS) * 3600000);

  /* the three documents one punch writes (the page and the tests use this, so they cannot disagree) */
  function plan(st, type, o) {
    const sid = type === 'CLOCK_IN' ? o.sid : st.sid, r = next(st, type, sid);
    if (!r.ok) return { ok: false, reason: r.reason };
    const reason = type === 'CLOSE_INCOMPLETE' ? String(o.reason || '').trim() : '';
    if (type === 'CLOSE_INCOMPLETE' && (reason.length < REASON_MIN || reason.length > REASON_MAX)) return { ok: false, reason: 'Write a reason of ' + REASON_MIN + ' to ' + REASON_MAX + ' characters.' };
    const n = r.after.n, eid = eventId(r.after.sid, n);
    return {
      ok: true, eid, sid: r.after.sid,
      event: { sid: r.after.sid, n, type, reason },
      state: { state: r.after.state, sid: r.after.sid, n, fb: r.after.fb, lu: r.after.lu, lb: r.after.lb, lastEid: eid, rev: st.rev + 1 },
      newSession: type === 'CLOCK_IN'
    };
  }
  const SID_RE = /^[A-Za-z0-9]{16,40}$/, EID_RE = /^[A-Za-z0-9]{16,40}__[0-9]{1,2}$/;

  /* ---------------- client assignment (W2) ----------------
     A session can have several Client IDs. The assignment records hold NO hours, so attendance time is counted once however many clients are assigned. */
  const MAX_CLIENTS = 10, CLIENT_RE = /^[A-Z][A-Z0-9-]{1,22}[A-Z0-9]$/;
  const validClient = id => typeof id === 'string' && CLIENT_RE.test(id) && !/--/.test(id);
  /* records: [{ clientId, status, rev, addedAt }] -> ids split into active and removed (sorted) */
  function clientsOf(records) {
    const a = [], r = [];
    (records || []).forEach(x => (x.status === 'active' ? a : r).push(x.clientId));
    return { active: a.sort(), removed: r.sort() };
  }
  /* decide one change. action: 'add' | 'remove'. registryStatus: 'active' | 'archived' | '' (not in the registry).
     Returns the document, the audit record and whether it is a create or an update (add-back of a removed client is an update). */
  function assignPlan(records, sid, clientId, action, o) {
    o = o || {};
    if (!core_sidOk(sid)) return { ok: false, reason: 'There is no open session.' };
    if (!validClient(clientId)) return { ok: false, reason: 'That is not a valid Client ID.' };
    const rec = (records || []).find(x => x.clientId === clientId), reason = String(o.reason || '').trim();
    if (reason.length > REASON_MAX) return { ok: false, reason: 'The reason is too long (' + REASON_MAX + ' characters at most).' };
    if (!o.aid) return { ok: false, reason: 'A change needs its own ID.' };
    const id = sid + '__' + clientId;
    if (action === 'add') {
      if (rec && rec.status === 'active') return { ok: false, reason: clientId + ' is already on this session.' };
      if (o.registryStatus !== 'active') return { ok: false, reason: o.registryStatus === 'archived' ? clientId + ' is archived and cannot be added to a session.' : clientId + ' is not in the Client IDs list.' };
      if (clientsOf(records).active.length >= MAX_CLIENTS) return { ok: false, reason: 'A session can have at most ' + MAX_CLIENTS + ' clients.' };
      if (!rec) return { ok: true, id, kind: 'create', doc: { sid, clientId, status: 'active', rev: 1, lastAudit: o.aid }, audit: { sid, clientId, action: 'add', reason: '', rev: 1 } };
      return { ok: true, id, kind: 'update', doc: { sid, clientId, status: 'active', rev: rec.rev + 1, lastAudit: o.aid, addedAt: rec.addedAt }, audit: { sid, clientId, action: 'readd', reason: '', rev: rec.rev + 1 } };
    }
    if (action === 'remove') {
      if (!rec || rec.status !== 'active') return { ok: false, reason: clientId + ' is not on this session.' };
      return { ok: true, id, kind: 'update', doc: { sid, clientId, status: 'removed', rev: rec.rev + 1, lastAudit: o.aid, addedAt: rec.addedAt }, audit: { sid, clientId, action: 'remove', reason, rev: rec.rev + 1 } };
    }
    return { ok: false, reason: 'Unknown change.' };
  }
  function core_sidOk(sid) { return typeof sid === 'string' && SID_RE.test(sid); }
  /* the numbers shown for a session: attendance never depends on how many clients are assigned */
  function summary(derived, records) {
    const c = clientsOf(records);
    return { sessionMs: derived ? derived.grossMs : 0, workingMs: derived ? derived.netMs : 0, clientCount: c.active.length, clients: c.active };
  }
  const api = { MAX_CLIENTS, validClient, clientsOf, assignPlan, summary, TYPES, STATES, LABEL, STATE_LABEL, MAX_EVENTS, REASON_MIN, REASON_MAX, STALE_HOURS, SID_RE, EID_RE, initialState, eventId, isType, next, options, derive, isStale, plan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreWork = api;
})(typeof window !== 'undefined' ? window : globalThis);
