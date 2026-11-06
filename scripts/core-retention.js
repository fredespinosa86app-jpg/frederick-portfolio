/* ==========================================================================
   core-retention.js - pure retention decisions for Discovery Call requests (CodeFlow 4.5.0, phase R3). No DOM, no database.
   Runs in the browser (window.coreRetention) and in Node (module.exports) so the SAME code is unit-tested.
   It only CLASSIFIES one request; deleting is done by the owner's dashboard after a preview and a confirmation.
   Rules (owner-approved):
     completed / cancelled ........ due when older than `finishedDays` (counted from createdAt)
     new / pending (no reply) ..... flagged when older than `flagDays`, due when older than `unansweredDays`
     confirmed ................... never touched while the meeting is ahead; once the meeting date + `graceDays` has passed it is
                                    treated as finished (flagged "close it"; due when also older than `finishedDays`)
     anything else / bad data ..... kept (never deleted on a guess)
   ========================================================================== */
(function (root) {
  'use strict';
  const DAY = 864e5;
  const DEFAULTS = { finishedDays: 730, flagDays: 90, unansweredDays: 365, graceDays: 30 };
  const LIMITS = { finishedDays: [180, 3650], flagDays: [30, 365], unansweredDays: [90, 1095] };
  const ms = t => { if (t == null) return NaN; if (typeof t.toMillis === 'function') return t.toMillis(); if (t instanceof Date) return t.getTime(); return typeof t === 'number' ? t : NaN; };
  const intIn = (v, d, [lo, hi]) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : d; };
  /* saved settings -> safe numbers; flag must come before delete */
  function settings(r) {
    r = r && typeof r === 'object' ? r : {};
    const o = { finishedDays: intIn(r.requests, DEFAULTS.finishedDays, LIMITS.finishedDays), flagDays: intIn(r.reqFlag, DEFAULTS.flagDays, LIMITS.flagDays), unansweredDays: intIn(r.reqStale, DEFAULTS.unansweredDays, LIMITS.unansweredDays), graceDays: DEFAULTS.graceDays };
    if (o.flagDays >= o.unansweredDays) { o.flagDays = DEFAULTS.flagDays; o.unansweredDays = DEFAULTS.unansweredDays; }
    return o;
  }
  /* the meeting date is a plain YYYY-MM-DD in the owner's zone; use the end of that day in the farthest-ahead zone (UTC+14) so a meeting is never called "past" early */
  function meetingEnd(date) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
    const t = Date.parse(date + 'T00:00:00Z'); if (isNaN(t) || new Date(t).toISOString().slice(0, 10) !== date) return NaN;
    return t + DAY + 14 * 3600e3;
  }
  /* -> 'keep' | 'flag' | 'due'   (reason is for the preview) */
  function classify(doc, now, s) {
    s = s || DEFAULTS; const d = doc && typeof doc === 'object' ? doc : {}, created = ms(d.createdAt);
    if (!isFinite(created) || !isFinite(now) || created > now) return { act: 'keep', why: 'no valid date' };
    const age = (now - created) / DAY, st = d.status;
    if (st === 'completed' || st === 'cancelled') return age >= s.finishedDays ? { act: 'due', why: 'finished' } : { act: 'keep', why: 'finished, within period' };
    if (st === 'new' || st === 'pending' || st === 'read') {
      if (age >= s.unansweredDays) return { act: 'due', why: 'unanswered' };
      return age >= s.flagDays ? { act: 'flag', why: 'unanswered' } : { act: 'keep', why: 'recent' };
    }
    if (st === 'confirmed') {
      const end = meetingEnd(d.date); if (!isFinite(end)) return { act: 'keep', why: 'no valid meeting date' };
      if (now < end + s.graceDays * DAY) return { act: 'keep', why: 'meeting ahead or in grace period' };
      return age >= s.finishedDays ? { act: 'due', why: 'confirmed, meeting long past' } : { act: 'flag', why: 'confirmed, meeting past: close it' };
    }
    return { act: 'keep', why: 'unknown status' };
  }
  /* oldest createdAt that can matter: records newer than this can never be flag/due, so the query can stop there */
  const queryCutoff = (now, s) => now - Math.min(s.flagDays, s.finishedDays) * DAY;
  /* the owner may nag only once a week */
  function bannerDue(lastMs, now) { const l = Number(lastMs); return !isFinite(l) || l <= 0 || l > now || now - l >= 7 * DAY; }
  /* preview rows never show the whole email */
  function mask(email) { const m = String(email || '').match(/^([^@\s])[^@\s]*(@.+)$/); return m ? m[1] + '***' + m[2] : '***'; }
  const api = { DEFAULTS, LIMITS, settings, classify, meetingEnd, queryCutoff, bannerDue, mask };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreRetention = api;
})(typeof window !== 'undefined' ? window : globalThis);
