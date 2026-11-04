/* ==========================================================================
   owner-worktrack.js - Owner Panel > WorkTrack (CodeFlow 4.5.0, phase W1: punches and live clock)
   Records the eight punches of a workday. Records are create-only and use the DATABASE's time, never this device's clock.
     workState/main          the current position (state, session, event counter, which breaks were used, revision)
     workSessions/{sid}      { tz, date, startedAt, by }                       (one per day worked; create-only)
     workEvents/{sid}__{n}   { sid, n, type, at, by, reason }                  (one per punch; create-only)
   One punch = ONE transaction: the new event + the state moved by exactly one valid step (+ the session record at clock in).
   The same state machine (core-worktrack.js) draws the buttons and is compared with the database rules in the test suite.
   A punch needs a live connection on purpose: a write queued while offline would be stamped with a LATER time when it finally arrives.
   Corrections, client assignment and reports arrive in later phases.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, core = window.coreWork, ids = window.coreIds, tm = window.coreTime; if (!kit || !core || !ids || !tm) return;
  const { el, notify } = kit;
  const $ = id => document.getElementById(id), own = () => window.OWN;
  const TZ = 'Asia/Manila';                      // fixed in W1; the audited setting arrives with the corrections phase
  let S = { st: null, events: [], derived: null, sessionTz: TZ, sessionDate: '' }, signed = false, timer = 0, skew = 0, skewKnown = false, busyPunch = false, wasOnline = true;
  const say = (id, msg) => { const n = $(id); if (n) n.textContent = msg || ''; };
  const ms = t => !t ? 0 : typeof t.toMillis === 'function' ? t.toMillis() : t instanceof Date ? t.getTime() : Number(t) || 0;
  const now = () => Date.now() + skew;
  const timeFmt = (m, tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz || TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(m));
  const dateFmt = (m, tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz || TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(m));
  const errText = e => {
    const c = e && e.code;
    if (c === 'permission-denied') return 'The database refused this (permission denied). Publish the newest firestore.rules.strict, sign in again, then refresh this page.';
    if (c === 'unavailable' || c === 'failed-precondition' || /offline|network/i.test(String(e && e.message))) return 'No connection to the database, so nothing was recorded. Check your internet and try again.';
    return 'Please refresh the page and try again.';
  };

  /* server time estimate: the website's own server sends a Date header; the difference to this device's clock is remembered for the live display only.
     Saved punch times always come from the database. */
  async function syncClock() {
    try {
      const t0 = Date.now(), r = await fetch(location.pathname + '?clock=' + t0, { method: 'HEAD', cache: 'no-store' }), t1 = Date.now(), d = r.headers.get('Date');
      const sv = d ? Date.parse(d) : NaN;
      if (isFinite(sv)) { const next = (sv + 500) - Math.round((t0 + t1) / 2); if (!skewKnown || Math.abs(next - skew) > 1500) { skew = next; skewKnown = true; } }   // header has 1-second resolution: +500 ms is the middle of that second; small differences are ignored so the clock never jitters
    } catch (e) { /* keep the previous estimate */ }
  }

  /* ---------------------------------------------------------------- data */
  const stateRef = () => { const o = own(); return o.fs.doc(o.db, 'workState', 'main'); };
  function readState(d) { return { state: d.state, sid: d.sid, n: d.n, fb: d.fb, lu: d.lu, lb: d.lb, lastEid: d.lastEid, rev: d.rev }; }
  async function load() {
    const o = own(), f = o.fs;
    let snap = await f.getDoc(stateRef());
    if (!snap.exists()) {                                   // first use only: one starting record
      try { await f.setDoc(stateRef(), Object.assign(core.initialState(), { updatedAt: f.serverTimestamp() })); } catch (e) { /* another tab did it first */ }
      snap = await f.getDoc(stateRef());
      if (!snap.exists()) throw new Error('state missing');
    }
    const st = readState(snap.data()); let events = [], tz = TZ, date = '';
    if (st.sid) {
      const q = await f.getDocs(f.query(f.collection(o.db, 'workEvents'), f.where('sid', '==', st.sid)));
      events = q.docs.map(d => { const x = d.data(); return { n: x.n, type: x.type, atMs: ms(x.at), reason: x.reason || '' }; });
      try { const ss = await f.getDoc(f.doc(o.db, 'workSessions', st.sid)); if (ss.exists()) { tz = ss.data().tz || TZ; date = ss.data().date || ''; } } catch (e) { /* display only */ }
    }
    S = { st, events, derived: core.derive(events, now()), sessionTz: tz, sessionDate: date };
    const d = S.derived;
    if (d.valid && st.sid && (d.events.length !== st.n || (d.closed ? 'NOT_STARTED' : d.state) !== st.state)) { d.valid = false; d.problem = 'The saved records and the current position do not agree (' + d.events.length + ' records, position "' + st.state + '", counter ' + st.n + ').'; }
  }

  /* ---------------------------------------------------------------- one punch = one transaction */
  async function punch(type, reason) {
    if (busyPunch) return; say('wtErr', '');
    if (!signed) return;
    if (navigator.onLine === false) { say('wtErr', 'You are offline. Punches need a connection so the saved time is the database\'s time. Nothing was recorded.'); return; }
    const o = own(), f = o.fs, seen = S.st; busyPunch = true; draw();
    try {
      let done = null;
      await f.runTransaction(o.db, async tx => {
        const snap = await tx.get(stateRef());
        if (!snap.exists()) throw new Error('refused:The WorkTrack record does not exist yet. Refresh the page.');
        const cur = readState(snap.data());
        if (cur.rev !== seen.rev) throw new Error('stale');
        const plan = core.plan(cur, type, { sid: ids.newKey(), reason });
        if (!plan.ok) throw new Error('refused:' + plan.reason);
        tx.set(f.doc(o.db, 'workEvents', plan.eid), Object.assign({}, plan.event, { at: f.serverTimestamp(), by: o.uid() }));
        tx.set(stateRef(), Object.assign({}, plan.state, { updatedAt: f.serverTimestamp() }));
        if (plan.newSession) tx.set(f.doc(o.db, 'workSessions', plan.sid), { tz: TZ, date: tm.localDateKey(Date.now(), TZ), startedAt: f.serverTimestamp(), by: o.uid() });
        done = plan;
      });
      await load();
      const last = S.derived.events[S.derived.events.length - 1];
      notify(core.LABEL[type] + ' recorded.', 'success');
      say('wtState', core.LABEL[type] + ' recorded at ' + (last ? timeFmt(last.atMs, S.sessionTz) : '') + '.');
      if (last) { skew = last.atMs - Date.now() + 400; skewKnown = true; }      // the database time of this punch is the freshest clock reading we have
    } catch (e) {
      const m = String(e && e.message || '');
      if (m === 'stale') { await safeLoad(); say('wtErr', 'This changed in another tab or on another device after this page was opened. The page has been refreshed. Nothing was recorded; check the buttons and press again.'); }
      else if (m.startsWith('refused:')) { await safeLoad(); say('wtErr', m.slice(8)); }
      else if (e && e.code === 'permission-denied') { await safeLoad(); say('wtErr', errText(e) + ' If this ID changed in another tab, the page has just been refreshed.'); }
      else say('wtErr', errText(e));
    } finally { busyPunch = false; draw(); tick(); }
  }
  async function safeLoad() { try { await load(); } catch (e) { say('wtErr', 'Could not read WorkTrack. ' + errText(e)); } }

  /* a small dialog that asks for a reason (3 to 200 characters) */
  function askReason(title, help, okLabel) {
    return new Promise(res => {
      const d = el('dialog', { class: 'dmodal', 'aria-labelledby': 'wtRT' });
      const inp = el('input', { type: 'text', maxlength: core.REASON_MAX, 'aria-label': 'Reason', autocomplete: 'off' }), err = el('p', { class: 'ferr', role: 'alert' });
      let done = false; const fin = v => { if (done) return; done = true; d.close(); res(v); };
      d.append(el('div', {}, el('h2', { id: 'wtRT' }, title), el('p', { class: 'dhelp' }, help), el('label', { class: 'fld' }, 'Reason', inp), err,
        el('div', { class: 'dact-row' }, el('button', { type: 'button', class: 'dbtn', onclick: () => fin(null) }, 'Cancel'),
          el('button', { type: 'button', class: 'dbtn primary', onclick: () => { const r = inp.value.trim(); if (r.length < core.REASON_MIN) { err.textContent = 'Please write at least ' + core.REASON_MIN + ' characters.'; return; } fin(r); } }, okLabel))));
      d.addEventListener('close', () => { d.remove(); if (!done) { done = true; res(null); } }); document.body.append(d); d.showModal(); inp.focus();
    });
  }
  async function closeIncomplete() {
    const r = await askReason('Close this session as incomplete?', 'Use this only if you forgot to clock out. The session is closed without a working-time total and the reason is kept with it. This cannot be undone here.', 'Close as incomplete');
    if (r) punch('CLOSE_INCOMPLETE', r);
  }

  /* ---------------------------------------------------------------- drawing */
  const D = () => S.derived;
  function blocked() {
    if (!S.st) return 'Loading…';
    if (D() && !D().valid) return 'The saved records do not follow the allowed order, so punching is paused. ' + D().problem;
    if (navigator.onLine === false) return 'You are offline. Punches need a connection.';
    return '';
  }
  const MAIN = ['CLOCK_IN', 'CLOCK_OUT'], BREAKS = ['FIRST_BREAK_OUT', 'FIRST_BREAK_IN', 'LUNCH_OUT', 'LUNCH_IN', 'LAST_BREAK_OUT', 'LAST_BREAK_IN'];
  function draw() {
    if (!S.st) return;
    const st = S.st, d = D(), opts = core.options(st, 'x'), why = blocked(), by = {}; opts.forEach(o => { by[o.type] = o; });
    const btn = (t, cls) => {
      const o = by[t], off = !o.ok || !!why || busyPunch;
      const b = el('button', { type: 'button', class: 'dbtn wtb ' + (cls || ''), 'data-punch': t, onclick: () => punch(t) }, core.LABEL[t]); if (off) b.disabled = true;
      return el('div', { class: 'wtbw' }, b, off && !o.ok && !busyPunch ? el('span', { class: 'wtwhy' }, o.reason) : null);
    };
    $('wtBtns').replaceChildren(
      el('div', { class: 'wtrow' }, btn('CLOCK_IN', 'primary'), btn('CLOCK_OUT', 'primary')),
      el('div', { class: 'wtrow' }, btn('FIRST_BREAK_OUT'), btn('FIRST_BREAK_IN'), btn('LUNCH_OUT'), btn('LUNCH_IN'), btn('LAST_BREAK_OUT'), btn('LAST_BREAK_IN')));
    $('wtStatus').textContent = core.STATE_LABEL[st.state] + (d && d.valid && d.closed && st.state === 'NOT_STARTED' && d.incomplete ? ' (last session closed as incomplete)' : '');
    $('wtStatus').dataset.state = st.state;
    say('wtBlock', why && why !== 'Loading…' ? why : '');
    const stale = d && core.isStale(d, now());
    say('wtWarn', stale ? 'This session has been open for more than ' + core.STALE_HOURS + ' hours. If you forgot to clock out, use "Close as incomplete" below.' : '');
    $('wtClose').hidden = st.state === 'NOT_STARTED';
    $('wtClose').disabled = !!why || busyPunch;
    drawList(); tick();
  }
  function drawList() {
    const d = D(), box = $('wtList'); box.replaceChildren();
    if (!d || !d.events.length) { say('wtListHead', 'No punches recorded yet.'); return; }
    const first = d.events[0];
    say('wtListHead', (d.closed ? 'Last session' : 'Current session') + ' · ' + dateFmt(first.atMs, S.sessionTz) + ' · ' + S.sessionTz + (d.incomplete ? ' · closed as incomplete' : ''));
    d.events.forEach(e => box.append(el('div', { class: 'wtev' }, el('strong', {}, '#' + e.n + ' ' + (core.LABEL[e.type] || e.type)), el('span', { class: 'libmeta' }, timeFmt(e.atMs, S.sessionTz)), e.reason ? el('span', { class: 'libmeta' }, 'Reason: ' + e.reason) : null)));
  }
  /* live clock: re-derives from the stored events every second (cheap, no database reads) */
  function tick() {
    const d = S.st && S.derived, t = now();
    say('wtNow', timeFmt(t));
    if (!d || !d.events.length) { say('wtGross', '00:00:00'); say('wtNet', '00:00:00'); say('wtNote', 'Press Clock in to start. Session time keeps running during breaks; working time pauses.'); return; }
    const live = core.derive(d.events, t); S.derived.grossMs = live.grossMs; S.derived.netMs = live.netMs; S.derived.breakMs = live.breakMs;
    say('wtGross', tm.formatDuration(live.grossMs));
    say('wtNet', live.netMs == null ? '—' : tm.formatDuration(live.netMs));
    say('wtNote', live.closed ? (live.incomplete ? 'Closed as incomplete: no working-time total is kept for this session.' : 'Finished. Breaks taken: ' + tm.formatDuration(live.breakMs) + '.') : 'Session time keeps running during breaks; working time pauses.');
  }
  function startTimer() { stopTimer(); timer = setInterval(() => { if (!document.hidden) tick(); }, 1000); }
  function stopTimer() { if (timer) clearInterval(timer); timer = 0; }

  async function show() {
    if (!signed) return;
    say('wtErr', ''); say('wtState', 'Loading…');
    try { syncClock(); await load(); say('wtState', ''); draw(); startTimer(); }
    catch (e) { say('wtState', 'Could not load WorkTrack. ' + errText(e)); }
  }
  function init() {
    $('wtRefresh').addEventListener('click', show);
    $('wtClose').addEventListener('click', closeIncomplete);
    window.addEventListener('online', () => { if (S.st) { say('wtErr', ''); draw(); } });
    window.addEventListener('offline', () => { if (S.st) draw(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.st && timer) { syncClock(); tick(); } });
    document.addEventListener('dash:page', e => { if (e.detail === 'worktrack') show(); else stopTimer(); });
    document.addEventListener('own:auth', e => { signed = !!(e.detail && e.detail.ok); S = { st: null, events: [], derived: null, sessionTz: TZ, sessionDate: '' }; stopTimer(); if (!signed) { $('wtBtns').replaceChildren(); $('wtList').replaceChildren(); say('wtState', ''); say('wtErr', ''); } });
  }
  window.__wt = { get state() { return S; } };     // read-only test hook
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
