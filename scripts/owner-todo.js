/* ==========================================================================
   owner-todo.js - Owner Panel > To-do & focus (CodeFlow 4.5.0, phase TD1). Owner only, private.
   Tasks with a due date, allotted hours and a focus block; a focus timer that can run for ONE task at a time; personal notes; a history per task.
     todoTasks/{id}  todoSessions/{id}  todoNotes/{id}  todoState/main (the one running timer)   see core-todo.js and the "TD1" rules.
   Start, switch and pause are ONE transaction each: the running record moves by one valid step and the finished session is written in the same transaction
   (the rules refuse a stop without its session), so time is never lost and two timers can never run, even from two devices.
   A timer needs a live connection on purpose (the start time is the database's time). The floating clock (td-float.js) talks to this file only through window.todoApi.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, C = window.coreTodo, tm = window.coreTime; if (!kit || !C || !tm) return;
  const { el, notify, confirmBox, iconBtn } = kit;
  const $ = id => document.getElementById(id), own = () => window.OWN;
  const TZ = () => (window.ownerTz ? window.ownerTz.get() : 'Asia/Manila');   // EN-1A: the owner's default zone (General > Time zone)
  let tasks = [], st = null, loaded = false, signed = false, filter = 'open', skew = 0, skewKnown = false, busy = false, hist = {}, moreOpen = {}, openHist = '', stateRead = 0, nameCache = {}, tickT = 0, lastErr = '', deleting = '', q = '';
  const ms = t => !t ? 0 : typeof t.toMillis === 'function' ? t.toMillis() : t instanceof Date ? t.getTime() : Number(t) || 0;
  const now = () => Date.now() + skew;
  const todayKey = () => C.dayKey(now(), TZ());
  const say = (id, msg) => { const n = $(id); if (n) n.textContent = msg || ''; };
  const errText = e => {
    const c = e && e.code;
    if (c === 'permission-denied') return 'The database refused this (permission denied). Publish the newest firestore.rules.strict, sign in again, then refresh this page.';
    if (c === 'unavailable' || c === 'failed-precondition' || /offline|network/i.test(String(e && e.message))) return 'No connection to the database, so nothing was saved. Check your internet and try again.';
    if (c === 'aborted' || c === 'already-exists') return 'Something changed at the same moment (maybe on another device). Please try again.';
    return 'Please refresh the page and try again.';
  };
  /* TD1-fix: the focus timer and WorkTrack never run together. Working = clocked in and not on a break (breaks and lunch are free time). */
  async function workingNow() {
    const w = window.wtApi; if (!w || !w.signedIn()) return false;
    try { await w.refresh(); } catch (e) { /* the last known state is used */ }
    const s = w.state(); return !!(s && s.state === 'WORKING');
  }
  const WORK_MSG = 'You are clocked in to WorkTrack and working. Clock out or start a break before you focus on a task.';
  const dtFmt = (m) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ(), weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(m));
  const dayFmt = d => { const p = d.split('-').map(Number); return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(p[0], p[1] - 1, p[2]))); };
  const ev = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));

  /* the website's own server sends a Date header; the difference to this device's clock is used for the LIVE display only (saved times come from the database) */
  async function syncClock() {
    try {
      const t0 = Date.now(), r = await fetch(location.pathname + '?clock=' + t0, { method: 'HEAD', cache: 'no-store' }), t1 = Date.now(), d = r.headers.get('Date'), sv = d ? Date.parse(d) : NaN;
      if (isFinite(sv)) { const next = (sv + 500) - Math.round((t0 + t1) / 2); if (!skewKnown || Math.abs(next - skew) > 1500) { skew = next; skewKnown = true; } }
    } catch (e) { /* keep the previous estimate */ }
  }

  /* ---------------------------------------------------------------- references */
  const taskRef = id => { const o = own(); return o.fs.doc(o.db, 'todoTasks', id); };
  const sessRef = id => { const o = own(); return o.fs.doc(o.db, 'todoSessions', id); };
  const noteRef = id => { const o = own(); return o.fs.doc(o.db, 'todoNotes', id); };
  const evRef = id => { const o = own(); return o.fs.doc(o.db, 'todoEvents', id); };
  const prefRef = () => { const o = own(); return o.fs.doc(o.db, 'todoPrefs', 'main'); };
  const stateRef = () => { const o = own(); return o.fs.doc(o.db, 'todoState', 'main'); };
  const rid = () => { const b = new Uint32Array(20); (window.crypto || { getRandomValues: a => a.map(() => Math.random() * 4294967296) }).getRandomValues(b); let i = 0; return C.newId(() => b[i++ % 20] / 4294967296); };
  const taskOf = id => tasks.find(t => t.id === id) || null;
  const nameOf = id => (taskOf(id) && taskOf(id).name) || nameCache[id] || '';

  /* ---------------------------------------------------------------- loading */
  async function ensureState() {
    const o = own(), f = o.fs;
    try {
      let s = await f.getDoc(stateRef());
      if (!s.exists()) { try { await f.setDoc(stateRef(), { taskId: '', startedAt: null, goalMin: 0, lastSid: '', rev: 1, updatedAt: f.serverTimestamp() }); } catch (e) { /* another tab did it first */ } s = await f.getDoc(stateRef()); }
      st = s.exists() ? s.data() : null; stateRead = Date.now();
      if (C.isRunning(st) && !nameOf(st.taskId)) { try { const t = await f.getDoc(taskRef(st.taskId)); if (t.exists()) nameCache[st.taskId] = t.data().name; } catch (e) { /* the name is only a label */ } }
    } catch (e) { lastErr = errText(e); }
    changed();
  }
  async function loadTasks() {
    const o = own(), f = o.fs;
    try {
      const s = await f.getDocs(f.query(f.collection(o.db, 'todoTasks'), f.limit(C.LIMITS.tasks)));
      tasks = s.docs.map(d => Object.assign({ id: d.id }, d.data())); tasks.forEach(t => { nameCache[t.id] = t.name; }); loaded = true; lastErr = '';
    } catch (e) { lastErr = errText(e); }
  }
  async function reload() { await ensureState(); await loadTasks(); hist = {}; changed(); draw(); }
  function changed() { ev('td:changed', null); }

  /* ---------------------------------------------------------------- the timer */
  const running = () => C.isRunning(st);
  async function start(taskId) {
    const o = own(), f = o.fs, plan = C.playPlan(st, taskId);
    if (plan.kind === 'invalid') return { ok: false, error: 'That task is not valid.' };
    if (plan.kind === 'already') return { ok: true, already: true };
    const t = taskOf(taskId); if (t && (t.status === 'done' || t.status === 'archived')) return { ok: false, error: 'Reopen the task first.' };
    if (busy) return { ok: false, error: 'One moment, the last change is still being saved.' };
    if (deleting === taskId) return { ok: false, error: 'This task is being deleted.' };
    if (await workingNow()) return { ok: false, error: WORK_MSG };
    busy = true; draw();
    try {
      await ensureState();                                  // the newest state and the record must exist before the transaction
      const result = await f.runTransaction(o.db, async tx => {
        const sSnap = await tx.get(stateRef()); if (!sSnap.exists()) throw new Error('no state');
        const cur = sSnap.data(), p = C.playPlan(cur, taskId); if (p.kind === 'already') return { already: true };
        const nSnap = await tx.get(taskRef(taskId)); if (!nSnap.exists()) throw new Error('missing task'); const nt = nSnap.data(); if (nt.status === 'done' || nt.status === 'archived') throw new Error('closed task');
        let sess = null, oSnap = null; const nowMs = now();
        if (p.kind === 'switch') { oSnap = await tx.get(taskRef(cur.taskId)); sess = C.stopSession(cur, nowMs, TZ()); }
        const sid = sess ? rid() : '';
        if (sess) {
          tx.set(sessRef(sid), { taskId: sess.taskId, start: cur.startedAt, secs: sess.secs, day: sess.day, kind: 'timer', createdAt: f.serverTimestamp() });
          if (oSnap && oSnap.exists()) tx.update(taskRef(cur.taskId), { secs: C.addSecs(oSnap.data(), sess.secs), updatedAt: f.serverTimestamp() });
        }
        if (nt.status === 'todo') tx.update(taskRef(taskId), { status: 'doing', updatedAt: f.serverTimestamp() });
        tx.update(stateRef(), { taskId, startedAt: f.serverTimestamp(), goalMin: nt.focusMin, lastSid: sess ? sid : cur.lastSid, rev: (Number(cur.rev) || 0) + 1, updatedAt: f.serverTimestamp() });
        return { switched: !!sess, from: sess ? cur.taskId : '', sid, secs: sess ? sess.secs : 0 };
      });
      await ensureState(); await loadTasks(); hist = {}; busy = false; draw(); changed();
      if (result && result.switched) ev('td:stopped', { taskId: result.from, sid: result.sid, secs: result.secs, name: nameOf(result.from), switched: true });
      return Object.assign({ ok: true }, result);
    } catch (e) { busy = false; await ensureState(); draw(); return { ok: false, error: errText(e) }; }
  }
  /* pause = stop. opts.trimTo (seconds) keeps only that much of a very long run */
  async function pause(opts) {
    opts = opts || {}; const o = own(), f = o.fs;
    if (!running()) return { ok: true, none: true };
    if (busy) return { ok: false, error: 'One moment, the last change is still being saved.' };
    if (C.needsTrim(st, now()) && !(opts.trimTo >= 1)) return { ok: false, needsTrim: true, elapsed: C.elapsedSecs(st, now()), taskId: st.taskId };
    busy = true; draw();
    try {
      const result = await f.runTransaction(o.db, async tx => {
        const sSnap = await tx.get(stateRef()); if (!sSnap.exists()) throw new Error('no state'); const cur = sSnap.data(); if (!C.isRunning(cur)) return { none: true };
        const tSnap = await tx.get(taskRef(cur.taskId)), sess = C.stopSession(cur, now(), TZ(), opts.trimTo), sid = rid();
        tx.set(sessRef(sid), { taskId: sess.taskId, start: cur.startedAt, secs: sess.secs, day: sess.day, kind: 'timer', createdAt: f.serverTimestamp() });
        if (tSnap.exists()) tx.update(taskRef(cur.taskId), { secs: C.addSecs(tSnap.data(), sess.secs), updatedAt: f.serverTimestamp() });
        const ran = C.elapsedSecs(cur, now());
        if (ran > sess.secs) tx.set(noteRef(rid()), { taskId: sess.taskId, text: 'Auto note: this timer ran ' + C.fmtHours(ran) + ' and you chose to save ' + C.fmtHours(sess.secs) + '. The original length is kept here.', sessionId: sid, createdAt: f.serverTimestamp(), editedAt: null });
        tx.update(stateRef(), { taskId: '', startedAt: null, goalMin: 0, lastSid: sid, rev: (Number(cur.rev) || 0) + 1, updatedAt: f.serverTimestamp() });
        return { sid, secs: sess.secs, taskId: sess.taskId };
      });
      await ensureState(); await loadTasks(); hist = {}; busy = false; draw(); changed();
      if (result && result.sid) ev('td:stopped', { taskId: result.taskId, sid: result.sid, secs: result.secs, name: nameOf(result.taskId), switched: false });
      return Object.assign({ ok: true }, result);
    } catch (e) { busy = false; await ensureState(); draw(); return { ok: false, error: errText(e) }; }
  }

  /* ---------------------------------------------------------------- tasks */
  async function saveTask(id, doc) {
    const o = own(), f = o.fs;
    if (!id) {
      if (tasks.length >= C.LIMITS.tasks) return { ok: false, error: 'There are already ' + C.LIMITS.tasks + ' tasks. Delete finished ones first.' };
      const nid = rid(), b = f.writeBatch();      // TD2: the task and its "created" log entry are saved together
      b.set(taskRef(nid), Object.assign({}, doc, { status: 'todo', secs: 0, doneAt: null, createdAt: f.serverTimestamp(), updatedAt: f.serverTimestamp() })); b.set(evRef(rid()), { taskId: nid, type: 'created', createdAt: f.serverTimestamp() }); await b.commit(); return { ok: true, id: nid };
    }
    await f.updateDoc(taskRef(id), Object.assign({}, doc, { updatedAt: f.serverTimestamp() })); return { ok: true, id };
  }
  /* TD2: finishing and reopening also write a log entry in the SAME batch (the rules require it), so weekly "completed" counts stay right */
  async function setStatus(id, status) {
    const o = own(), f = o.fs; if (deleting === id) return { ok: false, error: 'This task is being deleted.' };
    if (!C.canLeave(st, id) && status !== 'doing') return { ok: false, error: 'Pause the timer for this task first.' };
    const was = (taskOf(id) || {}).status, b = f.writeBatch();
    if (status === 'done') b.update(taskRef(id), { status: 'done', doneAt: f.serverTimestamp(), updatedAt: f.serverTimestamp() });
    else b.update(taskRef(id), { status, doneAt: null, updatedAt: f.serverTimestamp() });
    if (status === 'done' && was !== 'done') b.set(evRef(rid()), { taskId: id, type: 'done', createdAt: f.serverTimestamp() });
    else if (was === 'done' && (status === 'doing' || status === 'todo')) b.set(evRef(rid()), { taskId: id, type: 'reopened', createdAt: f.serverTimestamp() });
    await b.commit(); return { ok: true };
  }
  async function readAll(col, id, lim) { const o = own(), f = o.fs, s = await f.getDocs(f.query(f.collection(o.db, col), f.where('taskId', '==', id), f.limit(lim || 1000))); return s.docs.map(d => Object.assign({ id: d.id }, d.data())); }
  async function loadHist(id, force) {
    if (hist[id] && !force) return hist[id];
    const [ss, nn] = await Promise.all([readAll('todoSessions', id), readAll('todoNotes', id)]); hist[id] = { sessions: ss, notes: nn }; return hist[id];
  }
  /* delete in controlled rounds: up to 400 records at a time, repeated until none are left, and the task itself LAST.
     If it is interrupted the task still exists, so pressing Delete again finishes the job safely. While it runs the task accepts no new time or notes. */
  async function deleteTask(id) {
    const o = own(), f = o.fs; if (!C.canLeave(st, id)) return { ok: false, error: 'Pause the timer for this task first.' };
    const h = await loadHist(id, true), ns = h.sessions.length, nn = h.notes.length, more = ns >= 1000 || nn >= 1000;
    const ok = await confirmBox('Delete this task?', '“' + nameOf(id) + '” will be deleted together with ' + (ns >= 1000 ? '1000 or more' : ns) + ' focus session' + (ns === 1 ? '' : 's') + ' and ' + (nn >= 1000 ? '1000 or more' : nn) + ' note' + (nn === 1 ? '' : 's') + '. This cannot be undone. A JSON backup is on the Privacy & backup page.', 'Delete task');
    if (!ok) return { ok: false, cancelled: true };
    deleting = id; draw();
    try {
      for (const col of ['todoSessions', 'todoNotes', 'todoEvents']) {
        for (let guard = 0; guard < 500; guard++) {
          const part = await readAll(col, id, 400); if (!part.length) break;
          const b = f.writeBatch(); part.forEach(r => b.delete(f.doc(o.db, col, r.id))); await b.commit();
        }
      }
      await f.deleteDoc(taskRef(id)); delete hist[id]; if (own().log) own().log('To-do task deleted'); return { ok: true };
    } catch (e) { return { ok: false, error: 'The delete was interrupted: ' + errText(e) + ' The task is still there; press Delete again to finish.' }; }
    finally { deleting = ''; draw(); }
  }
  /* manual time: one batch = the session + the new cached total */
  async function addManual(id, v) {
    const o = own(), f = o.fs, t = taskOf(id); if (!t) return { ok: false, error: 'Task not found.' }; if (deleting === id) return { ok: false, error: 'This task is being deleted.' };
    const startMs = tm.zonedToUtc(Number(v.day.slice(0, 4)), Number(v.day.slice(5, 7)), Number(v.day.slice(8, 10)), 12, 0, 0, TZ()), b = f.writeBatch();
    b.set(sessRef(rid()), { taskId: id, start: new Date(startMs), secs: v.secs, day: v.day, kind: 'manual', createdAt: f.serverTimestamp() });
    b.update(taskRef(id), { secs: C.addSecs(t, v.secs), updatedAt: f.serverTimestamp() }); await b.commit(); delete hist[id]; return { ok: true };
  }
  async function trimSession(taskId, s, newSecs) {
    const o = own(), f = o.fs, t = taskOf(taskId), b = f.writeBatch();
    b.update(sessRef(s.id), { secs: newSecs });
    if (newSecs < s.secs) b.set(noteRef(rid()), { taskId, text: 'Auto note: a session of ' + C.fmtHours(s.secs) + ' was trimmed to ' + C.fmtHours(newSecs) + '. The original length is kept here.', sessionId: s.id, createdAt: f.serverTimestamp(), editedAt: null }); if (t) b.update(taskRef(taskId), { secs: C.addSecs(t, newSecs - s.secs), updatedAt: f.serverTimestamp() }); await b.commit(); delete hist[taskId]; return { ok: true };
  }
  async function deleteSession(taskId, s) {
    const o = own(), f = o.fs, t = taskOf(taskId), b = f.writeBatch();
    b.delete(sessRef(s.id)); if (t) b.update(taskRef(taskId), { secs: C.addSecs(t, -s.secs), updatedAt: f.serverTimestamp() }); await b.commit(); delete hist[taskId]; return { ok: true };
  }
  async function recalc(taskId) {
    const o = own(), f = o.fs, h = await loadHist(taskId, true), total = Math.min(3600000, C.sumSecs(h.sessions)); await f.updateDoc(taskRef(taskId), { secs: total, updatedAt: f.serverTimestamp() }); return { ok: true, total };
  }
  /* notes */
  async function addNote(taskId, text, sessionId) {
    const o = own(), f = o.fs, t = String(text == null ? '' : text).trim(); if (deleting === taskId) return { ok: false, error: 'This task is being deleted.' }; if (!t) return { ok: false, error: 'Write something first.' }; if (t.length > C.LIMITS.note) return { ok: false, error: 'The note can have at most ' + C.LIMITS.note + ' characters.' };
    await f.setDoc(noteRef(rid()), { taskId, text: t, sessionId: sessionId && C.idOk(sessionId) ? sessionId : '', createdAt: f.serverTimestamp(), editedAt: null }); delete hist[taskId]; return { ok: true };
  }
  async function editNote(taskId, n, text) {
    const o = own(), f = o.fs, t = String(text == null ? '' : text).trim(); if (!t) return { ok: false, error: 'A note cannot be empty. Use Delete instead.' }; if (t.length > C.LIMITS.note) return { ok: false, error: 'The note can have at most ' + C.LIMITS.note + ' characters.' };
    await f.updateDoc(noteRef(n.id), { text: t, editedAt: f.serverTimestamp() }); delete hist[taskId]; return { ok: true };
  }

  /* ---------------------------------------------------------------- dialogs */
  function formDialog(cfg) {
    return new Promise(res => {
      const d = el('dialog', { class: 'dmodal', 'aria-labelledby': 'tdDlgT' }), inputs = {}, err = el('p', { class: 'ferr', role: 'alert' });
      const rows = cfg.fields.map((fd, i) => {
        const inp = fd.type === 'textarea' ? el('textarea', { rows: fd.rows || 4, maxlength: fd.max || 2000, 'aria-label': fd.label }) : el('input', Object.assign({ type: fd.type || 'text', 'aria-label': fd.label, autocomplete: 'off' }, fd.attrs || {}));
        inp.value = fd.value == null ? '' : fd.value; if (fd.id) inp.id = fd.id; inputs[fd.key] = inp;
        return el('label', { class: 'fld' }, fd.label, inp, fd.help ? el('span', { class: 'dhelp' }, fd.help) : null);
      });
      let done = false; const fin = v => { if (done) return; done = true; d.close(); d.remove(); res(v); };
      const submit = () => { const vals = {}; Object.keys(inputs).forEach(k => { vals[k] = inputs[k].value; }); const m = cfg.check ? cfg.check(vals) : ''; if (m) { err.textContent = m; return; } fin(vals); };
      d.append(el('div', {}, el('h2', { id: 'tdDlgT' }, cfg.title), cfg.help ? el('p', { class: 'dhelp' }, cfg.help) : null, rows, err,
        el('div', { class: 'dact-row' }, el('button', { type: 'button', class: 'dbtn', onclick: () => fin(null) }, 'Cancel'), el('button', { type: 'button', class: 'dbtn primary', onclick: submit }, cfg.okLabel || 'Save'))));
      d.addEventListener('cancel', e => { e.preventDefault(); fin(null); });
      d.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); submit(); } });
      document.body.append(d); d.showModal(); const first = d.querySelector('input,textarea'); if (first) first.focus();
    });
  }
  async function taskForm(t) {
    const edit = !!t, vals = await formDialog({
      title: edit ? 'Edit task' : 'New task', okLabel: edit ? 'Save task' : 'Add task',
      fields: [
        { key: 'name', label: 'Task name', value: edit ? t.name : '', attrs: { maxlength: C.LIMITS.name } },
        { key: 'desc', label: 'Description (optional)', type: 'textarea', value: edit ? t.desc : '', rows: 4 },
        { key: 'due', label: 'Due date (optional)', type: 'date', value: edit ? t.due : '' },
        { key: 'hours', label: 'Hours allotted', type: 'number', value: edit ? t.hours : '', attrs: { min: 0, max: C.LIMITS.hours, step: '0.25', inputmode: 'decimal' }, help: 'How many hours you plan to give this task. Leave empty if you do not plan.' },
        { key: 'focusMin', label: 'Focus block (minutes)', type: 'number', value: edit ? t.focusMin : C.DEFAULT_FOCUS, attrs: { min: 1, max: C.LIMITS.focusMin, step: '1', inputmode: 'numeric', list: 'tdFocusList' }, help: 'How long you want to focus in one go (for example 25 or 50). You are reminded when it ends; the timer keeps running until you pause.' }
      ],
      check: v => { const r = C.cleanTask(v, edit ? t.color : C.nextColor(tasks)); return r.ok ? '' : r.errors[0]; }
    });
    if (!vals) return;
    const r = C.cleanTask(vals, edit ? t.color : C.nextColor(tasks));
    try { const res = await saveTask(edit ? t.id : '', edit ? { name: r.doc.name, desc: r.doc.desc, due: r.doc.due, hours: r.doc.hours, focusMin: r.doc.focusMin } : r.doc); if (!res.ok) { notify(res.error, 'error'); return; } notify(edit ? 'Task saved.' : 'Task added.', 'success'); await loadTasks(); draw(); changed(); }
    catch (e) { notify('Could not save the task. ' + errText(e), 'error'); }
  }
  const act = async (fn, okMsg) => { try { const r = await fn(); if (r && r.ok === false && !r.cancelled) { notify(r.error || 'That did not work.', 'error'); return r; } if (r && r.ok && okMsg) notify(okMsg, 'success'); return r; } catch (e) { notify(errText(e), 'error'); return { ok: false }; } };
  async function manualForm(t) {
    const vals = await formDialog({ title: 'Add time to “' + t.name + '”', help: 'Use this when you forgot to start the timer. It is saved as a manual entry.', okLabel: 'Add time',
      fields: [{ key: 'day', label: 'Day', type: 'date', value: todayKey(), attrs: { max: todayKey() } }, { key: 'minutes', label: 'Minutes worked', type: 'number', value: '', attrs: { min: 1, max: 1440, step: '1', inputmode: 'numeric' } }],
      check: v => { const r = C.cleanManual(v, todayKey()); return r.ok ? '' : r.errors[0]; } });
    if (!vals) return; const r = C.cleanManual(vals, todayKey());
    const x = await act(() => addManual(t.id, r), 'Time added.'); if (x && x.ok) { await loadTasks(); draw(); changed(); }
  }
  async function noteForm(t, sessionId) {
    const vals = await formDialog({ title: 'Note for “' + t.name + '”', help: 'A private note for yourself. It shows in the history of this task.', okLabel: 'Save note', fields: [{ key: 'text', label: 'Note', type: 'textarea', value: '', rows: 5, max: C.LIMITS.note }], check: v => String(v.text).trim() ? '' : 'Write something first.' });
    if (!vals) return; const x = await act(() => addNote(t.id, vals.text, sessionId), 'Note saved.'); if (x && x.ok) { await refreshHist(t.id); }
  }
  async function refreshHist(id) { await loadHist(id, true); draw(); }

  /* ---------------------------------------------------------------- drawing */
  const FILTERS = [['open', 'To do & in progress'], ['done', 'Done'], ['all', 'All'], ['archived', 'Archived']];
  function nowBar() {
    const box = $('tdNow'); if (!box) return; box.replaceChildren();
    if (!running()) { box.append(el('p', { class: 'dhelp' }, 'No timer is running. Press Play on a task to start focusing.')); return; }
    const fi = C.focusInfo(st, now()), n = nameOf(st.taskId) || 'a task';
    box.append(el('div', { class: 'td-nowrow' }, el('strong', {}, 'Running: ' + n), el('span', { class: 'td-clock', id: 'tdNowClock' }, C.fmtClock(fi.elapsed) + ' / ' + C.fmtClock(fi.goal)),
      el('button', { type: 'button', class: 'dbtn primary', id: 'tdNowPause', onclick: () => doPause() }, 'Pause & save')));
  }
  async function doPause() {
    const r = await pause();
    if (r.needsTrim) { const t = taskOf(r.taskId), focusS = (t ? t.focusMin : C.DEFAULT_FOCUS) * 60; const choice = await trimChoice(r.elapsed, focusS); if (choice == null) return; const r2 = await pause({ trimTo: choice }); if (!r2.ok) notify(r2.error, 'error'); return; }
    if (!r.ok) notify(r.error, 'error');
  }
  /* a run longer than 12 hours: keep the focus block, keep the 12 hour maximum, or leave the timer running */
  function trimChoice(elapsed, focusS) {
    return new Promise(res => {
      const d = el('dialog', { class: 'dmodal', 'aria-labelledby': 'tdTrimT' }); let done = false; const fin = v => { if (done) return; done = true; d.close(); d.remove(); res(v); };
      d.append(el('div', {}, el('h2', { id: 'tdTrimT' }, 'This timer ran for ' + C.fmtHours(elapsed)), el('p', { class: 'dhelp' }, 'Did you forget to stop it? Choose how much time to save for this session. You can trim it later from the history.'),
        el('div', { class: 'dact-row' }, el('button', { type: 'button', class: 'dbtn', onclick: () => fin(null) }, 'Cancel (keep running)'),
          el('button', { type: 'button', class: 'dbtn', onclick: () => fin(C.LIMITS.longSecs) }, 'Save 12 h'), el('button', { type: 'button', class: 'dbtn primary', onclick: () => fin(focusS) }, 'Save only ' + C.fmtHours(focusS)))));
      d.addEventListener('cancel', e => { e.preventDefault(); fin(null); }); document.body.append(d); d.showModal();
    });
  }
  function chip(txt, cls) { return el('span', { class: 'td-chip' + (cls ? ' ' + cls : '') }, txt); }
  function card(t) {
    const p = C.progress(t), due = C.dueInfo(t, todayKey()), isRun = running() && st.taskId === t.id, closed = t.status === 'done' || t.status === 'archived';
    const bar = el('div', { class: 'td-bar' + (p.over ? ' over' : ''), role: 'progressbar', 'aria-label': 'Time used on ' + t.name, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': p.pct, 'aria-valuetext': p.noPlan ? C.fmtHours(p.used) + ' used, no hours allotted' : C.fmtHours(p.used) + ' of ' + t.hours + ' hours' }, el('span', { style: 'width:' + p.pct + '%' }));
    const usedTxt = p.noPlan ? C.fmtHours(p.used) + ' used (no hours allotted)' : C.fmtHours(p.used) + ' of ' + t.hours + ' h' + (p.over ? ' · over plan by ' + C.fmtHours(p.used - p.plan) : ' · ' + C.fmtHours(p.left) + ' left');
    const actions = el('div', { class: 'td-act' }), more = el('div', { class: 'td-act td-act2' + (moreOpen[t.id] ? ' open' : '') });
    if (!closed) actions.append(isRun ? iconBtn('pause', 'Pause', t.name, () => doPause(), { primary: true, text: 'Pause & save' }) : iconBtn('play', 'Play', t.name, () => doPlay(t), { primary: true, text: 'Play' }));
    more.append(iconBtn('pencil', 'Add note', t.name, () => noteForm(t, ''), { text: 'Note' }), iconBtn('plus', 'Add time', t.name, () => manualForm(t), { text: 'Add time' }), iconBtn('pencil', 'Edit', t.name, () => taskForm(t)));
    if (t.status === 'done') more.append(iconBtn('restore', 'Reopen', t.name, () => act(async () => { const r = await setStatus(t.id, 'doing'); await loadTasks(); draw(); changed(); return r; }, 'Task reopened.')));
    else if (t.status !== 'archived') actions.append(iconBtn('check', 'Mark done', t.name, () => act(async () => { const r = await setStatus(t.id, 'done'); await loadTasks(); draw(); changed(); return r; }, 'Task done. Well done!'), { text: 'Done' }));
    if (t.status === 'archived') more.append(iconBtn('restore', 'Restore', t.name, () => act(async () => { const r = await setStatus(t.id, 'todo'); await loadTasks(); draw(); changed(); return r; }, 'Task restored.')));
    else more.append(iconBtn('archive', 'Archive', t.name, () => act(async () => { const r = await setStatus(t.id, 'archived'); await loadTasks(); draw(); changed(); return r; }, 'Task archived.')));
    more.append(iconBtn('clock', openHist === t.id ? 'Hide history' : 'History', t.name, () => toggleHist(t), { text: openHist === t.id ? 'Hide history' : 'History' }), iconBtn('trash', 'Delete', t.name, () => act(async () => { const r = await deleteTask(t.id); if (r.ok) { await loadTasks(); draw(); changed(); } return r; }, 'Task deleted.'), { danger: true }));
    const c = el('li', { class: 'td-card' + (isRun ? ' running' : '') + (closed ? ' closed' : ''), 'data-task': t.id, 'data-color': t.color },
      el('div', { class: 'td-head' }, el('span', { class: 'td-dot', 'aria-hidden': 'true' }), el('h3', {}, t.name), chip(C.STATUS_LABEL[t.status] || t.status, 's-' + t.status), due.kind !== 'none' ? chip(due.text, 'd-' + due.kind) : null, isRun ? chip('Running', 'run') : null),
      t.desc ? el('p', { class: 'td-desc' }, t.desc) : null, bar, el('p', { class: 'td-meta' }, usedTxt + ' · focus block ' + t.focusMin + ' min' + (t.doneAt ? ' · done ' + dtFmt(ms(t.doneAt)) : '')), actions,
      el('button', { type: 'button', class: 'dbtn sm td-morebtn', 'aria-expanded': moreOpen[t.id] ? 'true' : 'false', onclick: () => { moreOpen[t.id] = !moreOpen[t.id]; draw(); } }, moreOpen[t.id] ? 'Fewer actions' : 'More actions'), more);
    if (openHist === t.id) c.append(histPanel(t));
    return c;
  }
  async function doPlay(t) {
    try { window.__tdAudioUnlock && window.__tdAudioUnlock(); } catch (e) { /* the chime is optional */ }
    const plan = C.playPlan(st, t.id);
    if (plan.kind === 'switch') { const ok = await confirmBox('Switch task?', 'Pause “' + nameOf(st.taskId) + '” (its time is saved) and start “' + t.name + '”?', 'Pause and start'); if (!ok) return; }
    const r = await start(t.id); if (!r.ok) notify(r.error, 'error');
  }
  async function toggleHist(t) { openHist = openHist === t.id ? '' : t.id; draw(); if (openHist === t.id) { try { await loadHist(t.id, true); } catch (e) { notify('Could not load the history. ' + errText(e), 'error'); } draw(); } }
  function histPanel(t) {
    const h = hist[t.id], box = el('div', { class: 'td-hist' });
    if (!h) { box.append(el('p', { class: 'dhelp' }, 'Loading the history…')); return box; }
    const items = C.history(t, h.sessions, h.notes), sum = C.sumSecs(h.sessions);
    if (h.sessions.length >= 1000 || h.notes.length >= 1000) box.append(el('p', { class: 'ferr' }, 'Only the first 1000 sessions and 1000 notes are shown here.'));
    box.append(el('p', { class: 'dhelp' }, items.length + ' entr' + (items.length === 1 ? 'y' : 'ies') + ' · focus time in the history: ' + C.fmtHours(sum) + (sum !== t.secs ? ' (the task shows ' + C.fmtHours(t.secs) + ')' : '')));
    if (sum !== t.secs) box.append(el('button', { type: 'button', class: 'dbtn sm', onclick: () => act(async () => { const r = await recalc(t.id); await loadTasks(); draw(); changed(); return r; }, 'Total recalculated from the history.') }, 'Recalculate the total from the history'));
    const ul = el('ul', { class: 'td-hl' });
    items.forEach(i => {
      if (i.type === 'session') { const s = h.sessions.find(x => x.id === i.id); ul.append(el('li', { class: 'td-hs' }, el('span', { class: 'td-ht' }, dtFmt(i.at)), el('span', {}, (i.kind === 'manual' ? 'Added time: ' : 'Focus session: ') + C.fmtHours(i.secs)),
        iconBtn('pencil', 'Trim', 'session of ' + dtFmt(i.at), () => trimForm(t, s), { text: 'Trim' }), iconBtn('trash', 'Delete', 'session of ' + dtFmt(i.at), () => act(async () => { if (!await confirmBox('Delete this session?', C.fmtHours(i.secs) + ' will be removed from “' + t.name + '”.', 'Delete session')) return { ok: false, cancelled: true }; const r = await deleteSession(t.id, s); await loadTasks(); await refreshHist(t.id); changed(); return r; }, 'Session deleted.'), { danger: true }))); }
      else if (i.type === 'note') { const n = h.notes.find(x => x.id === i.id); ul.append(el('li', { class: 'td-hn' }, el('span', { class: 'td-ht' }, dtFmt(i.at)), el('span', { class: 'td-note' }, i.text + (i.edited ? ' (edited)' : '')),
        iconBtn('pencil', 'Edit note', dtFmt(i.at), () => editNoteForm(t, n), { text: 'Edit' }), iconBtn('trash', 'Delete note', dtFmt(i.at), () => act(async () => { if (!await confirmBox('Delete this note?', 'The note will be removed from the history.', 'Delete note')) return { ok: false, cancelled: true }; const o = own(); await o.fs.deleteDoc(noteRef(n.id)); await refreshHist(t.id); return { ok: true }; }, 'Note deleted.'), { danger: true }))); }
      else ul.append(el('li', { class: 'td-hm' }, el('span', { class: 'td-ht' }, dtFmt(i.at)), el('span', {}, i.type === 'done' ? 'Marked done' : 'Task created')));
    });
    box.append(ul); return box;
  }
  async function trimForm(t, s) {
    const vals = await formDialog({ title: 'Trim this session', help: 'It is ' + C.fmtHours(s.secs) + ' now. You can only make it shorter.', okLabel: 'Trim', fields: [{ key: 'minutes', label: 'New length in minutes', type: 'number', value: Math.max(1, Math.floor(s.secs / 60)), attrs: { min: 1, max: Math.max(1, Math.ceil(s.secs / 60)), step: '1', inputmode: 'numeric' } }],
      check: v => { const m = Math.round(Number(v.minutes)); return !isFinite(m) || m < 1 ? 'Enter at least 1 minute.' : m * 60 > s.secs ? 'A session can only be made shorter.' : ''; } });
    if (!vals) return; const secs = Math.min(s.secs, Math.round(Number(vals.minutes)) * 60);
    const x = await act(async () => { const r = await trimSession(t.id, s, secs); await loadTasks(); await refreshHist(t.id); changed(); return r; }, 'Session trimmed.'); return x;
  }
  async function editNoteForm(t, n) {
    const vals = await formDialog({ title: 'Edit note', okLabel: 'Save note', fields: [{ key: 'text', label: 'Note', type: 'textarea', value: n.text, rows: 5, max: C.LIMITS.note }], check: v => String(v.text).trim() ? '' : 'A note cannot be empty. Use Delete instead.' });
    if (!vals) return; await act(async () => { const r = await editNote(t.id, n, vals.text); await refreshHist(t.id); return r; }, 'Note saved.');
  }
  function draw() {
    const root = $('dp-todo'); if (!root || !root.dataset.built) return; nowBar();
    const list = $('tdList'), needle = q.trim().toLowerCase(), shown = C.sortTasks(C.filterTasks(tasks, filter)).filter(t => !needle || (t.name + ' ' + t.desc).toLowerCase().includes(needle)); list.replaceChildren();
    $('tdFilters').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === filter ? 'true' : 'false'));
    const open = C.filterTasks(tasks, 'open').length;
    say('tdCount', !loaded ? 'Loading…' : tasks.length + ' task' + (tasks.length === 1 ? '' : 's') + ' · ' + open + ' open' + (lastErr ? ' · ' + lastErr : ''));
    if (loaded && !shown.length) list.append(el('li', { class: 'dhelp td-empty' }, tasks.length ? 'No task matches this filter or search.' : 'No tasks yet. Press “New task” to add your first one.'));
    shown.forEach(t => list.append(card(t)));
  }
  let view = 'tasks';
  function setView(v) {
    view = v; const g = $('tdGraphs'), tv = $('tdTasksView'); if (!g || !tv) return; g.hidden = v !== 'graphs'; tv.hidden = v === 'graphs';
    document.querySelectorAll('.td-tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === v ? 'true' : 'false'));
    ev('td:view', v);
  }
  function build() {
    const root = $('dp-todo'); if (!root || root.dataset.built) return; root.dataset.built = '1';
    const dl = el('datalist', { id: 'tdFocusList' }, C.FOCUS_CHOICES.map(n => el('option', { value: n })));
    const filters = el('div', { class: 'td-filters', id: 'tdFilters', role: 'group', 'aria-label': 'Show tasks' }, FILTERS.map(([k, l]) => el('button', { type: 'button', class: 'dbtn sm', 'data-f': k, 'aria-pressed': k === filter ? 'true' : 'false', onclick: () => { filter = k; draw(); } }, l)));
    const tabs = el('div', { class: 'td-tabs', role: 'tablist', 'aria-label': 'To-do sections' }, [['tasks', 'Tasks'], ['graphs', 'Graphs']].map(([k, l]) => el('button', { type: 'button', role: 'tab', class: 'dbtn', id: 'tdTab_' + k, 'data-tab': k, 'aria-selected': k === 'tasks' ? 'true' : 'false', 'aria-controls': k === 'tasks' ? 'tdTasksView' : 'tdGraphs', onclick: () => setView(k) }, l)));
    root.append(el('div', { class: 'dcard' }, el('h2', {}, 'To-do & focus'), tabs,
      el('p', { class: 'dhelp' }, 'Your personal task list and focus timer. Give a task an allotted number of hours and a focus block, then press Play: a floating clock shows your focus time. Only one task can run at a time. Pause to save the session and leave a private note for your history. Times use Asia/Manila. This page is private to you.'),
      el('div', { id: 'tdGraphs', class: 'td-graphs', role: 'tabpanel', 'aria-labelledby': 'tdTab_graphs', hidden: 'hidden' }),
      el('div', { id: 'tdTasksView', role: 'tabpanel', 'aria-labelledby': 'tdTab_tasks' }, el('div', { id: 'tdNow', class: 'td-now', 'aria-live': 'polite' }), el('div', { class: 'td-bar-row' }, el('button', { type: 'button', class: 'dbtn primary', id: 'tdNew', onclick: () => taskForm(null) }, 'New task'), el('input', { type: 'search', id: 'tdSearch', class: 'td-search', placeholder: 'Search tasks', 'aria-label': 'Search tasks by name or description', maxlength: 60, autocomplete: 'off', oninput: e => { q = e.target.value; draw(); } }), filters, el('span', { class: 'dhelp', id: 'tdCount', role: 'status' })), el('ul', { class: 'td-list', id: 'tdList' })), dl));
  }

  /* ---------------------------------------------------------------- the door the floating clock uses */
  /* WorkTrack asks this before it records a CLOCK IN or the end of a break (the moments you start working). If a focus timer is running you decide: pause and save it, or stay as you are. */
  window.tdGuard = { async beforeWork(type) {
    if (!/^(CLOCK_IN|FIRST_BREAK_IN|LUNCH_IN|LAST_BREAK_IN)$/.test(String(type)) || !signed) return true;
    await ensureState(); if (!running()) return true;
    const ok = await confirmBox('A focus timer is running', '“' + (nameOf(st.taskId) || 'a task') + '” is being timed. Pause and save it, then continue with WorkTrack? The two clocks never run together.', 'Pause and continue'); if (!ok) return false;
    let r = await pause();
    if (r.needsTrim) { const t = taskOf(r.taskId), choice = await trimChoice(r.elapsed, ((t && t.focusMin) || C.DEFAULT_FOCUS) * 60); if (choice == null) return false; r = await pause({ trimTo: choice }); }
    if (!r.ok) { notify(r.error || 'The focus timer could not be paused.', 'error'); return false; }
    return true;
  } };
  /* TD2: what the graphs page needs. Reads are bounded: sessions from one day key on, log entries from one moment on. */
  async function sessionsSince(day) { const o = own(), f = o.fs, s = await f.getDocs(f.query(f.collection(o.db, 'todoSessions'), f.where('day', '>=', day), f.limit(3000))); return s.docs.map(d => Object.assign({ id: d.id }, d.data())); }
  async function eventsSince(msFrom) { const o = own(), f = o.fs, s = await f.getDocs(f.query(f.collection(o.db, 'todoEvents'), f.where('createdAt', '>=', new Date(msFrom)), f.limit(3000))); return s.docs.map(d => Object.assign({ id: d.id }, d.data())); }
  async function getPrefs() { const o = own(), s = await o.fs.getDoc(prefRef()); return s.exists() ? s.data() : { dailyGoalMin: 0 }; }
  async function setPrefs(min, weekday) {
    const f = own().fs, v = Math.round(Number(min)); if (!isFinite(v) || v < 0 || v > 1440) return { ok: false, error: 'The goal must be between 0 and 1440 minutes.' };
    let wk = null;
    if (weekday !== undefined && weekday !== null) {   // EN-1A: 7 values, Monday first; null = use the daily goal, 0 = rest day
      if (!Array.isArray(weekday) || weekday.length !== 7) return { ok: false, error: 'The weekday goals need exactly 7 values.' };
      wk = []; for (let i = 0; i < 7; i++) { const x = weekday[i]; if (x === null || x === '' || x === undefined) { wk.push(null); continue; } const n = Number(x); if (!Number.isInteger(n) || n < 0 || n > 1440) return { ok: false, error: 'Each weekday goal must be a whole number from 0 to 1440, or empty.' }; wk.push(n); }
      if (wk.every(x => x === null)) wk = null;   // nothing set: the field is left out, exactly like before
    }
    const doc = { dailyGoalMin: v, updatedAt: f.serverTimestamp() }; if (wk) doc.weekdayGoalMin = wk;
    await f.setDoc(prefRef(), doc); return { ok: true, value: v, weekday: wk };
  }
  window.todoApi = { sessionsSince, eventsSince, getPrefs, setPrefs, tasks: () => tasks.slice(), todayKey, loaded: () => loaded, reloadTasks: async () => { await loadTasks(); draw(); }, signedIn: () => signed, state: () => st, now, running, tz: () => TZ(), nameOf, focusInfo: () => C.focusInfo(st, now()), pause, start, addNote, sync, busy: () => busy,
    task: id => { const t = taskOf(id); return t ? Object.assign({}, t) : null; } };
  async function sync(force) { if (!signed) return; if (!force && Date.now() - stateRead < 60000) return; await syncClock(); await ensureState(); if (loaded && $('dp-todo') && !$('dp-todo').hidden) { await loadTasks(); draw(); } }
  function tick() { if (!signed || !running()) return; const fi = C.focusInfo(st, now()), c = $('tdNowClock'); if (c) c.textContent = C.fmtClock(fi.elapsed) + ' / ' + C.fmtClock(fi.goal); }
  function teardown() { signed = false; tasks = []; st = null; loaded = false; hist = {}; openHist = ''; moreOpen = {}; q = ''; deleting = ''; nameCache = {}; busy = false; ev('td:view', 'off'); clearInterval(tickT); tickT = 0; const l = $('tdList'); if (l) l.replaceChildren(); const n = $('tdNow'); if (n) n.replaceChildren(); say('tdCount', ''); const si = $('tdSearch'); if (si) si.value = ''; changed(); }
  function init() {
    build();
    document.addEventListener('own:auth', async e => {
      if (!(e.detail && e.detail.ok)) { teardown(); return; }
      signed = true; await syncClock(); await ensureState(); clearInterval(tickT); tickT = setInterval(() => { if (!document.hidden) tick(); }, 1000);
    });
    document.addEventListener('dash:page', async e => { if (e.detail === 'todo' && signed) { build(); await syncClock(); await ensureState(); await loadTasks(); draw(); changed(); } });
    document.addEventListener('owner:tz', () => { if (signed && loaded) draw(); });   // EN-1A: times and days follow the owner's zone
    const wake = () => { if (!document.hidden && signed) sync(); };
    document.addEventListener('visibilitychange', wake); window.addEventListener('focus', wake);
    draw();
  }
  window.__todoTest = { reload, setView, get tasks() { return tasks.slice(); } };   // read-only test hook
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
