/* ==========================================================================
   td-float.js - the floating FOCUS clock of To-do & focus (CodeFlow 4.5.0, phase TD1). Owner only.
   Shown only while a focus timer is running. Draggable (pointer or arrow keys), can be minimised, remembers its place on this device (own key).
   It talks to the database ONLY through window.todoApi (owner-todo.js). Same placement helpers as the WorkTrack clock (core-wtfloat.js).
   When the focus block ends: a banner and a short chime (only while this page is open); the timer keeps running until you pause.
   After a pause it offers a private note. A run over 12 hours asks what to save. Signing out removes it and clears everything it showed.
   ========================================================================== */
(function () {
  'use strict';
  const fl = window.coreWtFloat, C = window.coreTodo; if (!fl || !C) return;
  const $ = id => document.getElementById(id), KEY = 'tdFloat:v1', SKEY = 'tdSound:v1';
  let root, grip, stat, timeEl, goalEl, nameEl, bannerEl, srEl, btnBox, errEl, minBtn, cornerBtn, soundBtn, notePanel, trimPanel, noteTa, bar;
  let prefs = { x: null, y: null, min: false }, sound = true, timer = 0, shown = false, announced = '', ctx = null, sinceSync = 0, busy = false, pendingNote = null, trimAsked = '';
  const mk = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  const vp = () => ({ w: document.documentElement.clientWidth || window.innerWidth, h: document.documentElement.clientHeight || window.innerHeight });
  const size = () => { const r = root.getBoundingClientRect(); return { w: r.width, h: r.height }; };
  const api = () => window.todoApi;
  function loadPrefs() { try { prefs = fl.parsePrefs(localStorage.getItem(KEY)); } catch (e) { prefs = { x: null, y: null, min: false }; } try { sound = localStorage.getItem(SKEY) !== 'off'; } catch (e) { sound = true; } }
  function savePrefs() { try { localStorage.setItem(KEY, fl.serializePrefs(prefs)); } catch (e) { /* not remembered */ } }

  /* ---------------- chime: two short Web Audio tones, no files; browsers allow sound only after a click, which Play gives us */
  function audio() { if (ctx) return ctx; const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; try { ctx = new A(); } catch (e) { ctx = null; } return ctx; }
  window.__tdAudioUnlock = () => { const c = audio(); if (c && c.state !== 'running') { try { const p = c.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } } };
  function chime() {
    if (!sound) return; const c = audio(); if (!c || c.state !== 'running') return;
    [660, 880].forEach((f, i) => { try { const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + i * 0.28; o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.26); } catch (e) { /* ignore */ } });
  }

  function build() {
    root = mk('div', 'wtfl tdfl'); root.id = 'tdFloat'; root.hidden = true; root.setAttribute('role', 'group'); root.setAttribute('aria-label', 'Focus timer');
    bar = mk('div', 'wtfl-bar');
    grip = mk('button', 'wtfl-grip', '⠿'); grip.type = 'button'; grip.setAttribute('aria-label', 'Move the focus clock. Drag it, or use the arrow keys. Press Home to put it back in the top right corner.');
    stat = mk('span', 'wtfl-status', 'Focusing'); stat.setAttribute('role', 'status'); stat.setAttribute('aria-live', 'polite');
    cornerBtn = mk('button', 'wtfl-min tdfl-corner', 'Corner'); cornerBtn.type = 'button'; cornerBtn.setAttribute('aria-label', 'Move the focus clock to the next corner of the window');
    minBtn = mk('button', 'wtfl-min'); minBtn.type = 'button'; minBtn.setAttribute('aria-controls', 'tdflBody');
    bar.append(grip, stat, cornerBtn, minBtn);
    const body = mk('div', 'wtfl-body'); body.id = 'tdflBody';
    nameEl = mk('div', 'tdfl-name'); timeEl = mk('div', 'wtfl-time'); timeEl.setAttribute('role', 'timer'); timeEl.setAttribute('aria-label', 'Focus time so far');
    goalEl = mk('div', 'wtfl-net'); bannerEl = mk('p', 'tdfl-banner'); bannerEl.setAttribute('role', 'alert'); bannerEl.hidden = true;
    srEl = mk('p', 'wtfl-sr'); srEl.setAttribute('role', 'status');
    btnBox = mk('div', 'wtfl-btns'); errEl = mk('p', 'wtfl-err'); errEl.setAttribute('role', 'alert');
    soundBtn = mk('button', 'tdfl-chip tdfl-sound'); soundBtn.type = 'button';
    trimPanel = mk('div', 'tdfl-panel'); trimPanel.hidden = true;
    body.append(nameEl, timeEl, goalEl, bannerEl, srEl, btnBox, trimPanel, soundBtn, errEl);
    notePanel = mk('div', 'tdfl-panel tdfl-notepanel'); notePanel.hidden = true; notePanel.setAttribute('role', 'group');
    root.append(bar, body, notePanel); document.body.append(root);
    cornerBtn.addEventListener('click', () => { const r = root.getBoundingClientRect(), p = place(fl.nextCorner({ x: r.left, y: r.top }, vp(), size(), topGap())); prefs.x = p.x; prefs.y = p.y; savePrefs(); });
    minBtn.addEventListener('click', () => { prefs.min = !prefs.min; savePrefs(); applyMin(); place(); });
    soundBtn.addEventListener('click', () => { sound = !sound; try { localStorage.setItem(SKEY, sound ? 'on' : 'off'); } catch (e) { /* ignore */ } window.__tdAudioUnlock(); if (sound) chime(); soundLabel(); });
    wireDrag();
  }
  const soundLabel = () => { soundBtn.textContent = sound ? 'Chime on (tap to turn off)' : 'Chime off (tap to turn on)'; soundBtn.setAttribute('aria-pressed', sound ? 'true' : 'false'); };
  function applyMin() {
    root.classList.toggle('wtfl-min-on', prefs.min); minBtn.textContent = prefs.min ? 'Expand' : 'Minimise';
    minBtn.setAttribute('aria-expanded', prefs.min ? 'false' : 'true'); minBtn.setAttribute('aria-label', prefs.min ? 'Expand the focus clock' : 'Minimise the focus clock');
    $('tdflBody').hidden = prefs.min;
  }
  const topGap = () => root.parentNode && root.parentNode.id === 'dash' ? 72 : fl.MARGIN;
  function place(p) { const pos = fl.clamp(p || (prefs.x == null ? fl.defaultPos(vp(), size(), topGap()) : { x: prefs.x, y: prefs.y }), vp(), size()); root.style.left = pos.x + 'px'; root.style.top = pos.y + 'px'; return pos; }
  function wireDrag() {
    let drag = null;
    bar.addEventListener('pointerdown', e => { if (e.button !== 0 || (e.target.closest('button') && e.target !== grip)) return; const r = root.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId }; try { bar.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } root.classList.add('wtfl-drag'); e.preventDefault(); });
    bar.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; const p = place({ x: e.clientX - drag.dx, y: e.clientY - drag.dy }); prefs.x = p.x; prefs.y = p.y; });
    const end = e => { if (!drag || (e && e.pointerId !== drag.id)) return; drag = null; root.classList.remove('wtfl-drag'); savePrefs(); };
    bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end); bar.addEventListener('lostpointercapture', () => end());
    grip.addEventListener('keydown', e => {
      if (e.key === 'Home') { prefs.x = prefs.y = null; savePrefs(); place(); e.preventDefault(); return; }
      const r = root.getBoundingClientRect(), n = fl.nudge({ x: r.left, y: r.top }, e.key, e.shiftKey); if (n) { const p = place(n); prefs.x = p.x; prefs.y = p.y; savePrefs(); e.preventDefault(); }
    });
    grip.addEventListener('dblclick', () => { prefs.x = prefs.y = null; savePrefs(); place(); });
  }
  function home() {
    if (!root) return; const dash = $('dash'), want = dash && !dash.hidden ? dash : document.body;
    if (root.parentNode !== want) { const had = root.contains(document.activeElement) ? document.activeElement : null; want.append(root); if (had && document.activeElement !== had) { try { had.focus(); } catch (e) { /* ignore */ } } place(); }
  }

  /* ---------------- drawing */
  function btn(label, cls, fn) { const b = mk('button', 'wtfl-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.disabled = busy || api().busy(); b.addEventListener('click', fn); return b; }
  function render() {
    if (!root) return; const a = api();
    const run = !!(a && a.signedIn() && a.running());
    if (!run) { if (shown) hideClock(); if (pendingNote) showNote(); return; }
    if (!shown) { shown = true; root.hidden = false; home(); applyMin(); soundLabel(); place(); startTimer(); }
    const st = a.state(); nameEl.textContent = a.nameOf(st.taskId) || 'Focus task'; root.dataset.state = 'FOCUS';
    btnBox.replaceChildren(btn('Pause & save', 'wtfl-out', onPause));
    tick(); if (pendingNote) showNote();
  }
  async function onPause() {
    errEl.textContent = ''; busy = true; render(); const r = await api().pause(); busy = false;
    if (r.needsTrim) { askTrim(r.elapsed, r.taskId); render(); return; }
    if (!r.ok) errEl.textContent = r.error || 'That did not work.'; render();
  }
  function askTrim(elapsed, taskId) {
    const t = api().task(taskId), focusS = ((t && t.focusMin) || C.DEFAULT_FOCUS) * 60; trimPanel.replaceChildren(); trimPanel.hidden = false;
    trimPanel.append(mk('p', 'tdfl-p', 'This timer ran for ' + C.fmtHours(elapsed) + '. Did you forget to stop it? Choose what to save:'));
    const go = async secs => { trimPanel.hidden = true; busy = true; render(); const r = await api().pause({ trimTo: secs }); busy = false; if (!r.ok) errEl.textContent = r.error || 'That did not work.'; render(); };
    const row = mk('div', 'wtfl-btns'); row.append(btn('Save ' + C.fmtHours(focusS), '', () => go(focusS)), btn('Save 12 h', '', () => go(C.LIMITS.longSecs)), btn('Keep running', 'wtfl-out', () => { trimPanel.hidden = true; }));
    trimPanel.append(row);
  }
  /* the focus block ended: banner + chime once per run; the timer keeps running */
  function tick() {
    const a = api(); if (!a || !a.signedIn() || !shown || !a.running()) return;
    const fi = a.focusInfo(), st = a.state(); timeEl.textContent = C.fmtClock(fi.elapsed);
    goalEl.textContent = fi.reached ? 'Over the focus block by ' + C.fmtClock(fi.over) : 'Focus block ' + C.fmtClock(fi.goal) + ' · ' + C.fmtClock(fi.remaining) + ' left';
    const key = String(st.taskId) + '|' + String(st.startedAt && (st.startedAt.seconds || (st.startedAt.toMillis && st.startedAt.toMillis()) || st.startedAt));
    if (fi.reached) { bannerEl.hidden = false; bannerEl.textContent = 'Focus block complete. Pause when you are ready, or keep going.'; stat.textContent = 'Block complete'; root.dataset.state = 'DONE'; if (announced !== key) { announced = key; srEl.textContent = 'Focus block complete.'; chime(); } }
    else { bannerEl.hidden = true; stat.textContent = 'Focusing'; root.dataset.state = 'FOCUS'; announced = announced === key ? announced : ''; }
    if (C.needsTrim(st, a.now()) && trimAsked !== key) { trimAsked = key; askTrim(fi.elapsed, st.taskId); }
    if (++sinceSync >= 60) { sinceSync = 0; a.sync(true); }
  }
  /* a pause just happened: offer a private note (skippable) */
  function showNote() {
    const p = pendingNote; if (!p) return; if (root.hidden) { root.hidden = false; home(); applyMin(); place(); }
    notePanel.hidden = false; notePanel.replaceChildren();
    noteTa = mk('textarea'); noteTa.rows = 3; noteTa.maxLength = C.LIMITS.note; noteTa.setAttribute('aria-label', 'Note for ' + (p.name || 'this task')); noteTa.placeholder = 'What did you get done? What would you improve next time?';
    const msg = mk('p', 'tdfl-p', 'Saved ' + C.fmtHours(p.secs) + (p.name ? ' on “' + p.name + '”' : '') + '. Leave a private note?'), err = mk('p', 'wtfl-err'); err.setAttribute('role', 'alert');
    const row = mk('div', 'wtfl-btns');
    const save = mk('button', 'wtfl-btn', 'Save note'); save.type = 'button'; const skip = mk('button', 'wtfl-btn wtfl-out', 'Skip'); skip.type = 'button';
    save.addEventListener('click', async () => { const r = await api().addNote(p.taskId, noteTa.value, p.sid); if (!r.ok) { err.textContent = r.error || 'Could not save the note.'; return; } closeNote(); });
    skip.addEventListener('click', closeNote); row.append(save, skip); notePanel.append(msg, noteTa, row, err);
    notePanel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeNote(); } });
    try { noteTa.focus(); } catch (e) { /* ignore */ }
  }
  function closeNote() { pendingNote = null; notePanel.hidden = true; notePanel.replaceChildren(); noteTa = null; if (!shown) root.hidden = true; }
  function hideClock() { stopTimer(); shown = false; bannerEl.hidden = true; trimPanel.hidden = true; trimPanel.replaceChildren(); timeEl.textContent = ''; goalEl.textContent = ''; nameEl.textContent = ''; srEl.textContent = ''; errEl.textContent = ''; btnBox.replaceChildren(); announced = ''; trimAsked = ''; sinceSync = 0; if (!pendingNote) root.hidden = true; }
  function startTimer() { stopTimer(); timer = setInterval(() => { if (!document.hidden) tick(); }, 1000); }
  function stopTimer() { if (timer) clearInterval(timer); timer = 0; }
  function teardown() { pendingNote = null; if (!root) return; hideClock(); notePanel.hidden = true; notePanel.replaceChildren(); root.hidden = true; delete root.dataset.state; if (root.parentNode !== document.body) document.body.append(root); }

  function init() {
    loadPrefs(); build(); applyMin(); soundLabel();
    document.addEventListener('td:changed', render);
    document.addEventListener('td:stopped', e => { const d = e.detail || {}; if (d.taskId && d.sid && d.secs > 0) { pendingNote = d; render(); } });
    document.addEventListener('wtfl:reset', () => { prefs.x = prefs.y = null; prefs.min = false; savePrefs(); if (shown) { applyMin(); place(); } });
    document.addEventListener('own:auth', e => { if (!(e.detail && e.detail.ok)) teardown(); });
    window.addEventListener('resize', () => { if (shown) place(); });
    const dash = $('dash'); if (dash) new MutationObserver(() => { if (shown || pendingNote) { home(); place(); } }).observe(dash, { attributes: true, attributeFilter: ['hidden'] });
    const wake = () => { const a = api(); if (!document.hidden && a && a.signedIn()) { a.sync(); tick(); } };
    document.addEventListener('visibilitychange', wake); window.addEventListener('focus', wake);
    render();
  }
  window.__tdFloat = { get shown() { return shown; }, get timerOn() { return !!timer; }, get prefs() { return Object.assign({}, prefs); }, get notePending() { return !!pendingNote; } };   // read-only test hook
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
