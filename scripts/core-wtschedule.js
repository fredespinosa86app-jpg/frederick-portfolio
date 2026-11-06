/* ==========================================================================
   core-wtschedule.js - pure logic of the WorkTrack break schedules (CodeFlow 4.5.0, phase W5b). No DOM, no database.
   Runs in the browser (window.coreWtSched) and in Node (module.exports) so the SAME code is unit-tested.
   Display only: lateness is worked out from the stored punch time and is never written to a punch, a report or the sealed log.
   Rules it implements (owner-approved W5 layout, Revision 2):
     - The schedule client is the FIRST active client on the session (earliest addedAt, ties: alphabetical Client ID).
       Schedule used: that client's, else 'default', else the built-in 15 / 60 / 15 minutes. A first client without a schedule means 'default' (never the second client).
     - A break's deadline = the DATABASE time of its break-out punch + the allowed minutes (0 = no limit, never late).
     - A schedule edit applies from the NEXT break: each schedule keeps the previous values and the time of its last edit,
       and a break whose break-out punch is older than that edit keeps the previous limit.
   ========================================================================== */
(function (root) {
  'use strict';
  const BUILTIN = Object.freeze({ fb: 15, lu: 60, lb: 15 }), MAX_MIN = 240, NEAR_MS = 5 * 60000;
  const BREAKS = Object.freeze({
    FIRST_BREAK: { out: 'FIRST_BREAK_OUT', inn: 'FIRST_BREAK_IN', key: 'fb', name: 'First break' },
    LUNCH: { out: 'LUNCH_OUT', inn: 'LUNCH_IN', key: 'lu', name: 'Lunch' },
    LAST_BREAK: { out: 'LAST_BREAK_OUT', inn: 'LAST_BREAK_IN', key: 'lb', name: 'Last break' }
  });
  const KEYS = ['fb', 'lu', 'lb'], PREV = { fb: 'pfb', lu: 'plu', lb: 'plb' };
  const toMs = t => !t ? NaN : typeof t.toMillis === 'function' ? t.toMillis() : t instanceof Date ? t.getTime() : typeof t === 'number' ? t : NaN;
  const isMin = v => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_MIN;

  /* text typed in a minutes box -> { ok, value } or { ok:false, error } */
  function parseMinutes(text) {
    const t = String(text == null ? '' : text).trim();
    if (!/^\d{1,3}$/.test(t)) return { ok: false, error: 'Use a whole number of minutes from 0 to ' + MAX_MIN + ' (0 = no limit, never late).' };
    const v = Number(t); if (v > MAX_MIN) return { ok: false, error: 'The most allowed is ' + MAX_MIN + ' minutes.' };
    return { ok: true, value: v };
  }

  /* a stored schedule document -> a safe object, or null if anything is wrong (a bad document is ignored, never trusted) */
  function clean(d) {
    if (!d || typeof d !== 'object') return null;
    const out = {};
    for (const k of KEYS) { if (!isMin(d[k]) || !isMin(d[PREV[k]])) return null; out[k] = d[k]; out[PREV[k]] = d[PREV[k]]; }
    const at = toMs(d.updatedAt); if (!isFinite(at)) return null;
    out.updatedAtMs = at; out.rev = Number.isInteger(d.rev) ? d.rev : 1;
    return out;
  }

  /* active assignments -> the client whose schedule applies ('' when none) */
  function scheduleClient(assign) {
    const list = (assign || []).filter(a => a && a.status === 'active' && typeof a.clientId === 'string')
      .map(a => ({ id: a.clientId, at: isFinite(toMs(a.addedAt)) ? toMs(a.addedAt) : Infinity }));
    list.sort((a, b) => a.at !== b.at ? (a.at < b.at ? -1 : 1) : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return list.length ? list[0].id : '';
  }

  /* which schedule is in force. docs = { 'default': rawDoc, 'ACME-1': rawDoc, ... } */
  function pick(assign, docs) {
    docs = docs || {}; const cid = scheduleClient(assign);
    const c = cid ? clean(docs[cid]) : null; if (c) return { clientId: cid, source: 'client', doc: c };
    const d = clean(docs.default); if (d) return { clientId: cid, source: 'default', doc: d };
    return { clientId: cid, source: 'builtin', doc: null };
  }

  /* allowed minutes for a break whose break-out punch was at outMs */
  function limitsAt(p, outMs) {
    if (!p || !p.doc) return { fb: BUILTIN.fb, lu: BUILTIN.lu, lb: BUILTIN.lb };
    const old = isFinite(outMs) && outMs < p.doc.updatedAtMs;
    return { fb: old ? p.doc.pfb : p.doc.fb, lu: old ? p.doc.plu : p.doc.lu, lb: old ? p.doc.plb : p.doc.lb };
  }

  /* the break that is open right now: the state is a break and the newest punch is its break-out */
  function openBreak(state, events) {
    const b = BREAKS[state]; if (!b || !events || !events.length) return null;
    let last = null; events.forEach(e => { if (!last || e.n > last.n) last = e; });
    return last && last.type === b.out && isFinite(last.atMs) ? { type: state, name: b.name, key: b.key, inType: b.inn, outMs: last.atMs } : null;
  }

  /* kind: none (no break open) | nolimit | ok | near (5 minutes, or half the limit, left) | late */
  function breakStatus(state, events, nowMs, p) {
    const o = openBreak(state, events); if (!o) return { kind: 'none' };
    const lim = limitsAt(p, o.outMs)[o.key], base = { name: o.name, type: o.type, inType: o.inType, outMs: o.outMs, limitMin: lim, source: p ? p.source : 'builtin', clientId: p ? p.clientId : '' };
    if (lim === 0) return Object.assign(base, { kind: 'nolimit' });
    const deadline = o.outMs + lim * 60000, rem = deadline - nowMs;
    const kind = rem < 0 ? 'late' : rem <= Math.min(NEAR_MS, lim * 30000) ? 'near' : 'ok';
    return Object.assign(base, { kind, deadlineMs: deadline, remainingMs: Math.max(0, rem), overMs: Math.max(0, -rem) });
  }

  const mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60, p = n => (n < 10 ? '0' : '') + n; return (h ? h + ':' : '') + p(m) + ':' + p(x); };
  function describe(st) {
    if (!st || st.kind === 'none') return '';
    if (st.kind === 'nolimit') return st.name + ': no time limit';
    if (st.kind === 'late') return st.name + ': late by ' + mmss(st.overMs);
    return st.name + ': ' + mmss(st.remainingMs) + ' left';
  }
  const sourceText = (st, p) => !st || st.kind === 'none' ? '' : (p && p.source === 'client' ? 'Schedule of ' + p.clientId : p && p.source === 'default' ? 'Default schedule' : 'Built-in schedule') + ' (' + st.limitMin + ' min)';

  const api = { BUILTIN, MAX_MIN, NEAR_MS, BREAKS, parseMinutes, clean, scheduleClient, pick, limitsAt, openBreak, breakStatus, describe, sourceText, mmss };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreWtSched = api;
})(typeof window !== 'undefined' ? window : globalThis);
