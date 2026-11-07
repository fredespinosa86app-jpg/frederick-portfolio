/* ==========================================================================
   core-ownertz.js - the owner's default time zone (CodeFlow 4.5.0, EN-1A). No DOM, no database, no clock of its own.
   Runs in the browser (window.coreOwnerTz) and in Node so the SAME code is unit-tested.
   One default zone for every project that has no zone of its own. A project that needs a different zone (a client's, say) keeps its own setting and wins:
   resolve(specific) = the project's own zone if it is valid, else the owner's default, else Asia/Manila.
   ========================================================================== */
(function (root) {
  'use strict';
  const FALLBACK = 'Asia/Manila', NAME_RE = /^[A-Za-z0-9_+\/-]{1,60}$/;
  /* the same test the rules use for the name's shape, plus a real check that the browser knows the zone */
  function isValid(tz) {
    if (typeof tz !== 'string' || !NAME_RE.test(tz)) return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
  }
  /* what the owner typed -> { ok, tz } or { ok:false, error } */
  function check(raw) {
    const tz = typeof raw === 'string' ? raw.trim() : '';
    if (!tz) return { ok: false, error: 'Type or pick a time zone. Examples: Asia/Manila, Europe/London, America/New_York, UTC.' };
    if (!isValid(tz)) return { ok: false, error: '"' + tz.slice(0, 60) + '" is not a valid time zone name. Examples: Asia/Manila, Europe/London, America/New_York, UTC.' };
    return { ok: true, tz };
  }
  /* a saved document -> the safe parts, or the fallback when it is missing or damaged */
  function fromDoc(d) {
    if (!d || typeof d !== 'object' || !isValid(d.tz)) return { tz: FALLBACK, prevTz: '', rev: 0, saved: false };
    return { tz: d.tz, prevTz: isValid(d.prevTz) ? d.prevTz : '', rev: Number.isInteger(d.rev) && d.rev > 0 ? d.rev : 1, saved: true };
  }
  /* the document to write: first save has revision 1 and no previous zone; every change keeps the zone it replaces and adds exactly 1 */
  function nextDoc(current, tz) {
    const c = current && current.saved ? current : null;
    return c ? { tz, prevTz: c.tz, rev: c.rev + 1 } : { tz, prevTz: '', rev: 1 };
  }
  /* project zone first, then the owner's default, then Asia/Manila */
  function resolve(specific, ownerTz) { return isValid(specific) ? specific : (isValid(ownerTz) ? ownerTz : FALLBACK); }
  /* "UTC+8", "UTC-4:30", "UTC" at a moment (summer time is respected because the offset is read at that moment) */
  function offsetLabel(tz, ms) {
    if (!isValid(tz)) return '';
    try {
      const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)), g = t => Number(p.find(x => x.type === t).value);
      const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')), diff = Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
      if (!diff) return 'UTC'; const a = Math.abs(diff), h = Math.floor(a / 60), m = a % 60;
      return 'UTC' + (diff < 0 ? '-' : '+') + h + (m ? ':' + String(m).padStart(2, '0') : '');
    } catch (e) { return ''; }
  }
  /* "05:12" in that zone */
  function clockText(tz, ms) {
    if (!isValid(tz)) return '';
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms)); } catch (e) { return ''; }
  }
  const api = { FALLBACK, isValid, check, fromDoc, nextDoc, resolve, offsetLabel, clockText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreOwnerTz = api;
})(typeof window !== 'undefined' ? window : globalThis);
