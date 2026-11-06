/* ==========================================================================
   core-authcleanup.js - when the monthly "m_ sign-in users" cleanup reminder is due (CodeFlow 4.5.0, phase S2-D). No DOM, no database.
   Runs in the browser (window.coreAuthCleanup) and in Node (module.exports) so the SAME code is unit-tested.
   The reminder only reminds. Deleting users is done by the owner in the Firebase Console (see S2D-CHECKLIST.md).
   ========================================================================== */
(function (root) {
  'use strict';
  const DAY = 864e5, EVERY_DAYS = 30, SNOOZE_DAYS = 7;
  const ok = n => typeof n === 'number' && isFinite(n) && n > 0;
  /* state = { lastAt, snoozeUntil } in ms. Due: never done, or 30+ days ago, or a date from the future (bad data). A snooze hides it for 7 days. */
  function due(state, now) {
    const s = state && typeof state === 'object' ? state : {};
    if (ok(s.snoozeUntil) && s.snoozeUntil > now && s.snoozeUntil - now <= SNOOZE_DAYS * DAY) return false;
    if (!ok(s.lastAt) || s.lastAt > now) return true;
    return now - s.lastAt >= EVERY_DAYS * DAY;
  }
  /* whole days since the last cleanup, or null when never / invalid */
  function daysSince(lastAt, now) { return ok(lastAt) && lastAt <= now ? Math.floor((now - lastAt) / DAY) : null; }
  const snoozeUntil = now => now + SNOOZE_DAYS * DAY;
  const api = { due, daysSince, snoozeUntil, EVERY_DAYS, SNOOZE_DAYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreAuthCleanup = api;
})(typeof window !== 'undefined' ? window : globalThis);
