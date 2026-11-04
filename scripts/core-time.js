/* ==========================================================================
   core-time.js - UTC and time-zone helpers for CodeFlow 4.5.0 (P0 library; used by WorkTrack and billing).
   Rules: instants are stored as UTC milliseconds; the IANA zone is kept beside them for display only.
   Durations are always differences of UTC instants - never of formatted local strings - so daylight-saving days are exact.
   ========================================================================== */
(function (root) {
  'use strict';
  const isValidTimeZone = tz => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return typeof tz === 'string' && /^[A-Za-z0-9_+\/-]{1,60}$/.test(tz); } catch (e) { return false; } };
  const fmtCache = {};
  function parts(ms, tz) {
    const f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    const o = {}; f.formatToParts(new Date(ms)).forEach(p => { if (p.type !== 'literal') o[p.type] = Number(p.value); });
    return o;
  }
  /* offset of the zone from UTC at an instant, in ms (positive east of UTC) */
  function offsetMs(ms, tz) { const p = parts(ms, tz); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000; }
  const pad = n => String(n).padStart(2, '0');
  const localDateKey = (ms, tz) => { const p = parts(ms, tz); return p.year + '-' + pad(p.month) + '-' + pad(p.day); };
  /* the UTC instant of a local wall-clock time in a zone (the first one when a time repeats at a DST end) */
  function zonedToUtc(y, mo, d, h, mi, s, tz) {
    const guess = Date.UTC(y, mo - 1, d, h || 0, mi || 0, s || 0);
    let utc = guess - offsetMs(guess, tz);
    const off2 = offsetMs(utc, tz);
    if (guess - off2 !== utc) utc = guess - off2;
    return utc;
  }
  const durationMs = (startMs, endMs) => { if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) throw new Error('End must not be before start.'); return endMs - startMs; };
  function formatDuration(ms) {
    const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }
  /* split a UTC interval into one piece per LOCAL calendar day (midnight-crossing sessions, DST-safe) */
  function splitByLocalDay(startMs, endMs, tz) {
    durationMs(startMs, endMs); if (!isValidTimeZone(tz)) throw new Error('Unknown time zone.');
    const out = []; let cur = startMs, guard = 0;
    while (cur < endMs && guard++ < 400) {
      const p = parts(cur, tz), nextMid = zonedToUtc(p.year, p.month, p.day + 1, 0, 0, 0, tz), stop = Math.min(nextMid, endMs);
      out.push({ date: localDateKey(cur, tz), startMs: cur, endMs: stop, ms: stop - cur }); cur = stop;
    }
    if (cur < endMs) throw new Error('Interval is too long to split.');
    return out;
  }
  const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();               // m = 1..12
  const clampDay = (y, m, day) => Math.min(day, daysInMonth(y, m));                       // 31 -> last day of short months
  function addDaysIso(iso, n) { const [y, m, d] = iso.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d + n)); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
  const api = { isValidTimeZone, parts, offsetMs, localDateKey, zonedToUtc, durationMs, formatDuration, splitByLocalDay, daysInMonth, clampDay, addDaysIso };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreTime = api;
})(typeof window !== 'undefined' ? window : globalThis);
