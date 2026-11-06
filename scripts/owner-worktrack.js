/* ==========================================================================
   owner-worktrack.js - Owner Panel > WorkTrack (CodeFlow 4.5.0, phase W1: punches and live clock)
   Records the eight punches of a workday. Records are create-only and use the DATABASE's time, never this device's clock.
     workState/main          the current position (state, session, event counter, which breaks were used, revision)
     workSessions/{sid}      { tz, date, startedAt, by }                       (one per day worked; create-only)
     workEvents/{sid}__{n}   { sid, n, type, at, by, reason }                  (one per punch; create-only)
   One punch = ONE transaction: the new event + the state moved by exactly one valid step (+ the session record at clock in).
   The same state machine (core-worktrack.js) draws the buttons and is compared with the database rules in the test suite.
   A punch needs a live connection on purpose: a write queued while offline would be stamped with a LATER time when it finally arrives.
   W2 adds client assignment (workAssign / workAssignAudit): Client IDs only, no hours, so attendance is never multiplied by the number of clients.
   Corrections and reports arrive in later phases.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, core = window.coreWork, ids = window.coreIds, tm = window.coreTime, sch = window.coreWtSched; if (!kit || !core || !ids || !tm || !sch) return;
  const { el, notify } = kit;
  const $ = id => document.getElementById(id), own = () => window.OWN;
  let TZ = 'Asia/Manila';                        // default; the Work settings card (W3) sets the zone used for NEW sessions
  let S = { st: null, events: [], derived: null, sessionTz: TZ, sessionDate: '', assign: [], sched: { docs: {}, err: '' } }, registry = [], pending = readPending(), signed = false, timer = 0, skew = 0, skewKnown = false, busyPunch = false, wasOnline = true;
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

  /* clients picked for the NEXT session are kept on this device only until Clock in (nothing is saved in the database before that) */
  function readPending() { try { const a = JSON.parse(localStorage.getItem('wtPending') || '[]'); return Array.isArray(a) ? a.filter(core.validClient).slice(0, core.MAX_CLIENTS) : []; } catch (e) { return []; } }
  function savePending() { try { localStorage.setItem('wtPending', JSON.stringify(pending)); } catch (e) { /* private mode: the picks just stay in memory */ } }
  const regStatus = id => { const r = registry.find(x => x.id === id); return r ? r.status : ''; };
  async function loadRegistry() {
    const o = own(), f = o.fs, q = await f.getDocs(f.query(f.collection(o.db, 'clientRegistry')));
    registry = q.docs.map(d => ({ id: d.id, status: d.data().status })).sort((a, b) => a.id < b.id ? -1 : 1);
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
    const st = readState(snap.data()); let events = [], tz = TZ, date = '', assign = [];
    if (st.sid) {
      const q = await f.getDocs(f.query(f.collection(o.db, 'workEvents'), f.where('sid', '==', st.sid)));
      events = q.docs.map(d => { const x = d.data(); return { n: x.n, type: x.type, atMs: ms(x.at), reason: x.reason || '' }; });
      try { const ss = await f.getDoc(f.doc(o.db, 'workSessions', st.sid)); if (ss.exists()) { tz = ss.data().tz || TZ; date = ss.data().date || ''; } } catch (e) { /* display only */ }
    }
    if (st.sid) {
      const qa = await f.getDocs(f.query(f.collection(o.db, 'workAssign'), f.where('sid', '==', st.sid)));
      assign = qa.docs.map(d => { const x = d.data(); return { clientId: x.clientId, status: x.status, rev: x.rev, addedAt: x.addedAt }; }).sort((a, b) => a.clientId < b.clientId ? -1 : 1);
    }
    const sched = st.sid && st.state !== 'NOT_STARTED' ? await loadSched(assign) : { docs: {}, err: '' };      // W5b: only while a session is open
    S = { st, events, derived: core.derive(events, now()), sessionTz: tz, sessionDate: date, assign, sched };
    const d = S.derived;
    if (d.valid && st.sid && (d.events.length !== st.n || (d.closed ? 'NOT_STARTED' : d.state) !== st.state)) { d.valid = false; d.problem = 'The saved records and the current position do not agree (' + d.events.length + ' records, position "' + st.state + '", counter ' + st.n + ').'; }
    changed();
  }

  /* ---------------------------------------------------------------- one punch = one transaction */
  async function punch(type, reason) {
    if (busyPunch) return; say('wtErr', '');
    if (!signed) return;
    if (navigator.onLine === false) { say('wtErr', 'You are offline. Punches need a connection so the saved time is the database\'s time. Nothing was recorded.'); return; }
    const o = own(), f = o.fs, seen = S.st; let picks = [];
    if (type === 'CLOCK_IN' && pending.length) {          // clients picked beforehand: check they are all still active, then save them together with the clock in
      busyPunch = true; draw();
      try { await loadRegistry(); } catch (e) { busyPunch = false; draw(); say('wtErr', errText(e)); return; }
      const bad = pending.filter(c => regStatus(c) !== 'active');
      if (bad.length) { pending = pending.filter(c => regStatus(c) === 'active'); savePending(); busyPunch = false; draw(); say('wtErr', 'Nothing was recorded. ' + bad.join(', ') + (bad.length > 1 ? ' are' : ' is') + ' no longer an active Client ID, so ' + (bad.length > 1 ? 'they were' : 'it was') + ' removed from your picks. Check the list and press Clock in again.'); return; }
      picks = pending.slice();
    }
    busyPunch = true; draw();
    try {
      let done = null, written = [], auds = {};
      await f.runTransaction(o.db, async tx => {
        const snap = await tx.get(stateRef());
        if (!snap.exists()) throw new Error('refused:The WorkTrack record does not exist yet. Refresh the page.');
        const cur = readState(snap.data());
        if (cur.rev !== seen.rev) throw new Error('stale');
        const plan = core.plan(cur, type, { sid: ids.newKey(), reason });
        if (!plan.ok) throw new Error('refused:' + plan.reason);
        if (plan.newSession) picks.forEach(c => {
          const aid = ids.newKey(), a = core.assignPlan([], plan.sid, c, 'add', { aid, registryStatus: 'active' }); auds[c] = aid;
          if (!a.ok) throw new Error('refused:' + a.reason);
          tx.set(f.doc(o.db, 'workAssign', a.id), Object.assign({}, a.doc, { addedAt: f.serverTimestamp(), updatedAt: f.serverTimestamp() }));
          tx.set(f.doc(o.db, 'workAssignAudit', aid), Object.assign({}, a.audit, { actor: o.uid(), createdAt: f.serverTimestamp() }));
        });
        tx.set(f.doc(o.db, 'workEvents', plan.eid), Object.assign({}, plan.event, { at: f.serverTimestamp(), by: o.uid() }));
        tx.set(stateRef(), Object.assign({}, plan.state, { updatedAt: f.serverTimestamp() }));
        if (plan.newSession) tx.set(f.doc(o.db, 'workSessions', plan.sid), { tz: TZ, date: tm.localDateKey(Date.now(), TZ), startedAt: f.serverTimestamp(), by: o.uid() });
        done = plan;
        written = ['workEvents/' + plan.eid].concat(plan.newSession ? ['workSessions/' + plan.sid] : []).concat(plan.newSession ? picks.map(c => 'workAssignAudit/' + auds[c]) : []);
      });
      if (type === 'CLOCK_IN' && picks.length) { pending = []; savePending(); }
      document.dispatchEvent(new CustomEvent('wt:written', { detail: { paths: written } }));
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
    } finally { busyPunch = false; draw(); tick(); changed(); }
  }
  async function safeLoad() { try { await load(); } catch (e) { say('wtErr', 'Could not read WorkTrack. ' + errText(e)); } }

  /* a small dialog that asks for a reason (3 to 200 characters) */
  function askReason(title, help, okLabel, min) {
    if (min == null) min = core.REASON_MIN;
    return new Promise(res => {
      const d = el('dialog', { class: 'dmodal', 'aria-labelledby': 'wtRT' });
      const inp = el('input', { type: 'text', maxlength: core.REASON_MAX, 'aria-label': 'Reason', autocomplete: 'off' }), err = el('p', { class: 'ferr', role: 'alert' });
      let done = false; const fin = v => { if (done) return; done = true; d.close(); res(v); };
      d.append(el('div', {}, el('h2', { id: 'wtRT' }, title), el('p', { class: 'dhelp' }, help), el('label', { class: 'fld' }, 'Reason', inp), err,
        el('div', { class: 'dact-row' }, el('button', { type: 'button', class: 'dbtn', onclick: () => fin(null) }, 'Cancel'),
          el('button', { type: 'button', class: 'dbtn primary', onclick: () => { const r = inp.value.trim(); if (r.length < min) { err.textContent = 'Please write at least ' + min + ' characters.'; return; } fin(r); } }, okLabel))));
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
    drawList(); drawClients(); tick();
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
    if (!d || !d.events.length) { say('wtGross', '00:00:00'); say('wtNet', '00:00:00'); say('wtNote', 'Press Clock in to start. Session time keeps running during breaks; working time pauses.'); applyBreak(); return; }
    const live = core.derive(d.events, t); S.derived.grossMs = live.grossMs; S.derived.netMs = live.netMs; S.derived.breakMs = live.breakMs;
    say('wtGross', tm.formatDuration(live.grossMs));
    say('wtNet', live.netMs == null ? '—' : tm.formatDuration(live.netMs));
    say('wtNote', live.closed ? (live.incomplete ? 'Closed as incomplete: no working-time total is kept for this session.' : 'Finished. Breaks taken: ' + tm.formatDuration(live.breakMs) + '.') : 'Session time keeps running during breaks; working time pauses.');
    applyBreak();
  }
  /* ---------------------------------------------------------------- clients on the session (W2) */
  const openSession = () => !!(S.st && S.st.state !== 'NOT_STARTED' && S.derived && S.derived.valid);
  function drawClients() {
    const open = openSession(), st = S.st; if (!st) return;
    const active = S.assign.filter(a => a.status === 'active'), removed = S.assign.filter(a => a.status === 'removed');
    const list = open ? active.map(a => a.clientId) : (st.state === 'NOT_STARTED' ? pending.slice() : []);
    const mode = open ? 'open' : 'next';
    say('wtCliHelp', open ? 'Clients on this session. Add or remove while the session is open. Attendance time is counted once, however many clients are assigned.'
      : 'Clients for your next session. They stay on this device and are saved together with Clock in. Attendance time is counted once, however many clients are assigned.');
    const sel = $('wtCliSel'), keep = sel.value, taken = new Set(list);
    sel.replaceChildren(el('option', { value: '' }, registry.some(r => r.status === 'active') ? 'Choose a Client ID…' : 'No active Client IDs yet'));
    registry.filter(r => r.status === 'active' && !taken.has(r.id)).forEach(r => sel.append(el('option', { value: r.id }, r.id)));
    if (keep && !taken.has(keep) && regStatus(keep) === 'active') sel.value = keep;
    const full = list.length >= core.MAX_CLIENTS, off = !!blocked() || busyPunch;
    $('wtCliAdd').disabled = off || full || !sel.value; $('wtCliSel').disabled = off || full;
    $('wtCliAdd').dataset.mode = mode;
    say('wtCliFull', full ? 'A session can have at most ' + core.MAX_CLIENTS + ' clients.' : '');
    const box = $('wtChips'); box.replaceChildren();
    if (!list.length) box.append(el('span', { class: 'libmeta' }, open ? 'No clients on this session yet.' : 'No clients picked yet.'));
    list.forEach(id => {
      const arch = regStatus(id) === 'archived';
      const rm = el('button', { type: 'button', class: 'dbtn wtx', 'aria-label': 'Remove ' + id, onclick: () => removeClient(id) }, 'Remove'); rm.disabled = off;
      box.append(el('span', { class: 'wtchip' }, el('strong', { class: 'cidid' }, id), arch ? el('span', { class: 'cidbadge archived' }, 'archived') : null, rm));
    });
    /* assignments of the current or last session, including removed ones (read-only when no session is open) */
    const hist = $('wtCliHist'); hist.replaceChildren();
    if (!open && active.length) hist.append(el('div', { class: 'libmeta' }, 'Last session: ' + active.map(a => a.clientId).join(', ')));
    if (removed.length) hist.append(el('div', { class: 'libmeta' }, 'Removed from ' + (open ? 'this' : 'the last') + ' session: ' + removed.map(a => a.clientId).join(', ')));
    $('wtCliHistBtn').hidden = !S.assign.length;
  }
  async function showClientHistory() {
    const o = own(), f = o.fs, box = $('wtCliAudit'); box.replaceChildren(el('p', { class: 'dstate' }, 'Loading…'));
    try {
      const q = await f.getDocs(f.query(f.collection(o.db, 'workAssignAudit'), f.where('sid', '==', S.st.sid)));
      const rows = q.docs.map(d => d.data()).sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
      box.replaceChildren(...rows.map(x => el('div', { class: 'wtev' }, el('strong', {}, (x.action === 'add' ? 'Added ' : x.action === 'readd' ? 'Added back ' : 'Removed ') + x.clientId), el('span', { class: 'libmeta' }, timeFmt(ms(x.createdAt), S.sessionTz)), x.reason ? el('span', { class: 'libmeta' }, 'Reason: ' + x.reason) : null)));
      if (!rows.length) box.replaceChildren(el('p', { class: 'libmeta' }, 'No changes recorded.'));
    } catch (e) { box.replaceChildren(el('p', { class: 'ferr' }, 'Could not load the history. ' + errText(e))); }
  }
  async function addClient() {
    say('wtCliErr', ''); const id = $('wtCliSel').value; if (!id || !S.st) return;
    if (!openSession()) {                                        // before clock in: device-only pick
      if (pending.includes(id)) return;
      if (pending.length >= core.MAX_CLIENTS) { say('wtCliErr', 'A session can have at most ' + core.MAX_CLIENTS + ' clients.'); return; }
      if (regStatus(id) !== 'active') { say('wtCliErr', id + ' is not an active Client ID.'); return; }
      pending.push(id); savePending(); drawClients(); return;
    }
    await changeAssignment('add', id, '');
  }
  async function removeClient(id) {
    say('wtCliErr', '');
    if (!openSession()) { pending = pending.filter(x => x !== id); savePending(); drawClients(); return; }
    const r = await askReason('Remove ' + id + ' from this session?', 'The client is taken off this session. It stays in the history. A reason is optional.', 'Remove', 0);
    if (r === null) return;
    await changeAssignment('remove', id, r);
  }
  /* one change = one transaction (assignment + its audit entry); the session must still be open and the assignment is re-read first */
  async function changeAssignment(action, cid, reason) {
    if (busyPunch) return; if (navigator.onLine === false) { say('wtCliErr', 'You are offline. Nothing was changed.'); return; }
    const o = own(), f = o.fs, sid = S.st.sid; let written = []; busyPunch = true; draw();
    try {
      try { await loadRegistry(); } catch (e) { /* keep the cached list */ }
      await f.runTransaction(o.db, async tx => {
        const sSnap = await tx.get(stateRef()); if (!sSnap.exists() || sSnap.data().sid !== sid || sSnap.data().state === 'NOT_STARTED') throw new Error('refused:The session is no longer open, so its clients can no longer be changed here.');
        const ref = f.doc(o.db, 'workAssign', sid + '__' + cid), snap = await tx.get(ref), d = snap.exists() ? snap.data() : null;
        const recs = S.assign.filter(a => a.clientId !== cid).concat(d ? [{ clientId: cid, status: d.status, rev: d.rev, addedAt: d.addedAt }] : []);
        const aid = ids.newKey(), plan = core.assignPlan(recs, sid, cid, action, { aid, reason, registryStatus: regStatus(cid) });
        if (!plan.ok) throw new Error('refused:' + plan.reason);
        const doc = plan.kind === 'create' ? Object.assign({}, plan.doc, { addedAt: f.serverTimestamp(), updatedAt: f.serverTimestamp() }) : Object.assign({}, plan.doc, { updatedAt: f.serverTimestamp() });
        tx.set(ref, doc); tx.set(f.doc(o.db, 'workAssignAudit', aid), Object.assign({}, plan.audit, { actor: o.uid(), createdAt: f.serverTimestamp() }));
        written = ['workAssignAudit/' + aid];
      });
      document.dispatchEvent(new CustomEvent('wt:written', { detail: { paths: written } }));
      await load(); notify(cid + (action === 'add' ? ' added.' : ' removed.'), 'success');
    } catch (e) {
      const m = String(e && e.message || '');
      if (m.startsWith('refused:')) { await safeLoad(); say('wtCliErr', m.slice(8)); }
      else if (e && e.code === 'permission-denied') { await safeLoad(); say('wtCliErr', 'The database refused this change. It may have changed in another tab, or the Client ID is no longer active. The page has been refreshed.'); }
      else say('wtCliErr', errText(e));
    } finally { busyPunch = false; draw(); changed(); }
  }

  /* ---------------------------------------------------------------- W5b: break schedules (display only; nothing here writes a punch)
     Read on every full load: the schedule client's document and 'default' (two reads at most), so another device's edit is seen at the next load. */
  async function loadSched(assign) {
    const o = own(), f = o.fs, cid = sch.scheduleClient(assign), want = cid ? [cid, 'default'] : ['default'], docs = {}; let err = '';
    for (const id of want) {
      try { const sn = await f.getDoc(f.doc(o.db, 'workSchedules', id)); if (sn.exists()) docs[id] = sn.data(); }
      catch (e) { err = (e && e.code) || 'error'; }
    }
    return { docs, err };
  }
  const flickerOn = () => { try { return localStorage.getItem('wtFlicker:v1') !== '0'; } catch (e) { return true; } };
  function breakInfo() {                       // what the page and the clock show about the break that is open right now
    if (!S.st || !S.derived || !S.derived.valid) return { kind: 'none', text: '', src: '', inType: '' };
    const p = sch.pick(S.assign, S.sched ? S.sched.docs : {}), st = sch.breakStatus(S.st.state, S.derived.events, now(), p);
    return { kind: st.kind, type: st.type || '', inType: st.inType || '', outMs: st.outMs || 0, text: sch.describe(st), src: sch.sourceText(st, p), name: st.name || '', limitMin: st.limitMin, deadlineMs: st.deadlineMs || 0, err: S.sched && S.sched.err ? S.sched.err : '' };
  }
  let lastKind = 'none';
  function applyBreak() {                      // page: text, flicker class on the existing button (never rebuilt), one polite announcement when it turns late
    const bi = breakInfo(), box = $('wtBtns');
    say('wtBrk', bi.kind === 'none' ? '' : bi.text + (bi.src ? ' · ' + bi.src : ''));
    const brk = $('wtBrk'); if (brk) brk.dataset.kind = bi.kind;
    if (box) box.querySelectorAll('[data-punch]').forEach(b => b.classList.toggle('wtb-late', bi.kind === 'late' && flickerOn() && b.dataset.punch === bi.inType));
    if (bi.kind === 'late' && lastKind !== 'late') say('wtBrkSr', bi.name + ' limit passed. ' + bi.text + '.');
    if (bi.kind !== 'late') say('wtBrkSr', '');
    lastKind = bi.kind;
  }
  async function reloadSched() {
    if (!signed || !S.st || !S.st.sid || S.st.state === 'NOT_STARTED') return;
    try { S.sched = await loadSched(S.assign); } catch (e) { /* keep what is shown */ }
    changed(); applyBreak();
  }
  document.addEventListener('wt:schedchanged', reloadSched);

  /* ---------------------------------------------------------------- W5a: read-only door for the floating clock (wt-float.js)
     The clock never talks to the database itself: it asks this module, so every punch still goes through the ONE transaction above. */
  const changed = () => { try { document.dispatchEvent(new CustomEvent('wt:changed')); } catch (e) { /* ignore */ } };
  let lastSync = 0, syncBusy = false, ensureBusy = false;
  async function ensure() {                                   // sign-in / page open: load the state once, even if the WorkTrack page was never opened
    if (!signed || S.st || ensureBusy) return; ensureBusy = true;
    try { syncClock(); await load(); } catch (e) { /* the clock simply stays hidden; the WorkTrack page shows the error */ } finally { ensureBusy = false; }
    if (!signed && S.st) { S = { st: null, events: [], derived: null, sessionTz: TZ, sessionDate: '', assign: [], sched: { docs: {}, err: '' } }; changed(); }   // signed out while loading: drop it
  }
  async function sync() {                                     // tab focus: at most one read of workState/main per minute; a full load only when its revision changed
    if (!signed || busyPunch || syncBusy || ensureBusy) return;
    if (!S.st) return ensure();
    const t = Date.now(); if (t - lastSync < 60000) return; lastSync = t; syncBusy = true;
    try { const snap = await own().fs.getDoc(stateRef()); if (signed && snap.exists() && snap.data().rev !== S.st.rev) { await load(); draw(); } }
    catch (e) { /* keep what is shown; the next focus tries again */ } finally { syncBusy = false; }
  }
  async function apiPunch(type) {                             // same path as the page buttons; returns the outcome instead of only writing it on the page
    if (!signed || !S.st) return { ok: false, error: 'Not ready.' };
    say('wtErr', ''); await punch(type); const err = ($('wtErr') && $('wtErr').textContent) || '';
    return { ok: !err, error: err };
  }
  window.wtApi = Object.freeze({
    signedIn: () => signed, state: () => S.st ? Object.assign({}, S.st) : null,
    derived: () => S.derived && S.derived.events ? core.derive(S.derived.events, now()) : null,
    sessionTz: () => S.sessionTz, now, busy: () => busyPunch, breakInfo, flicker: flickerOn, registry: () => registry.slice(), assign: () => S.assign.slice(), schedDocs: () => Object.assign({}, S.sched ? S.sched.docs : {}), punch: apiPunch, refresh: async () => { if (!signed) return; try { await load(); draw(); } catch (e) { /* ignore */ } }, sync, ensure
  });

  function startTimer() { stopTimer(); timer = setInterval(() => { if (!document.hidden) tick(); }, 1000); }
  function stopTimer() { if (timer) clearInterval(timer); timer = 0; }

  async function show() {
    if (!signed) return;
    say('wtErr', ''); say('wtState', 'Loading…');
    try { syncClock(); await load(); try { await loadRegistry(); } catch (e) { /* the clients card shows what it has */ } say('wtState', ''); draw(); startTimer(); changed(); }
    catch (e) { say('wtState', 'Could not load WorkTrack. ' + errText(e)); }
  }
  function init() {
    $('wtRefresh').addEventListener('click', show);
    $('wtClose').addEventListener('click', closeIncomplete);
    $('wtCliAdd').addEventListener('click', addClient); $('wtCliSel').addEventListener('change', () => { $('wtCliAdd').disabled = !$('wtCliSel').value || !!blocked() || busyPunch; }); $('wtCliHistBtn').addEventListener('click', showClientHistory);
    window.addEventListener('online', () => { if (S.st) { say('wtErr', ''); draw(); } });
    window.addEventListener('offline', () => { if (S.st) draw(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.st && timer) { syncClock(); tick(); } });
    document.addEventListener('dash:page', e => { if (e.detail === 'worktrack') show(); else stopTimer(); });
    document.addEventListener('own:auth', e => { signed = !!(e.detail && e.detail.ok); S = { st: null, events: [], derived: null, sessionTz: TZ, sessionDate: '', assign: [], sched: { docs: {}, err: '' } }; registry = []; stopTimer(); if (!signed) { $('wtBtns').replaceChildren(); $('wtList').replaceChildren(); $('wtChips').replaceChildren(); $('wtCliHist').replaceChildren(); $('wtCliAudit').replaceChildren(); say('wtState', ''); say('wtErr', ''); } lastSync = 0; changed(); if (signed) ensure(); });
  }
  document.addEventListener('wt:settings', e => { if (e.detail && e.detail.tz) { TZ = e.detail.tz; if (S && S.st && !(S.derived && S.derived.events && S.derived.events.length)) S.sessionTz = TZ; if (S && S.st) draw(); } });
  window.__wt = { get state() { return S; } };     // read-only test hook
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
