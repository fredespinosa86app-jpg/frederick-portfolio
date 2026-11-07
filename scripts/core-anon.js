/* ==========================================================================
   core-anon.js - daily-budget writes for anonymous records (CodeFlow 4.5.0, SE-H1).
   A visit record or an unanswered chat question is written TOGETHER with a counter bump (anonCounters/<v|c>_<UTC day>, count +1, last = the record id) in ONE batch.
   The Firestore rules refuse the batch when the day's budget (content/guard.visitCap / chatCap) is used up, or when the counter is bumped without a brand-new record.
   A refused write is dropped by the caller (analytics only). Two visitors bumping at the same moment collide on the counter: the loser retries after a short random wait (3 tries).
   Runs in the browser (window.coreAnon) and in Node (module.exports) so the SAME code is unit-tested with fakes.
   ========================================================================== */
(function (root) {
  'use strict';
  const TRIES = 3;
  const utcDay = ms => { const d = new Date(ms); return String(d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()); };
  const counterId = (kind, ms) => kind + '_' + utcDay(ms);
  /* env: { writeBatch, doc, increment, db, now?, sleep?, rand? }  ->  async counted(kind 'v'|'c', collection, id, data) */
  function make(env) {
    const now = env.now || (() => Date.now()), sleep = env.sleep || (ms => new Promise(r => setTimeout(r, ms))), rand = env.rand || Math.random;
    return async function counted(kind, col, id, data) {
      if (kind !== 'v' && kind !== 'c') throw new Error('kind');
      for (let n = 0; n < TRIES; n++) {
        try {
          const b = env.writeBatch(env.db);
          b.set(env.doc(env.db, col, id), data);
          b.set(env.doc(env.db, 'anonCounters', counterId(kind, now())), { count: env.increment(1), last: id }, { merge: true });
          await b.commit(); return;
        } catch (e) {
          if (!e || e.code !== 'permission-denied' || n === TRIES - 1) throw e;     // only a collision (or a used-up budget) is retried, and only twice
          await sleep(150 + Math.floor(rand() * 450));
        }
      }
    };
  }
  const api = { make, utcDay, counterId, TRIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreAnon = api;
})(typeof window !== 'undefined' ? window : globalThis);
