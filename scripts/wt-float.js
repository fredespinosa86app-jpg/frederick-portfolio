/* ==========================================================================
   wt-float.js - the floating WorkTrack clock (CodeFlow 4.5.0, phase W5a)
   Shown only while the signed-in owner has an open WorkTrack session. Draggable (pointer or arrow keys), can be minimised, remembers its place on this device.
   It reads and punches ONLY through window.wtApi (owner-worktrack.js), so every punch is still the one existing transaction.
   When the dashboard dialog (aria-modal) is open the clock moves INSIDE it, so keyboard and screen-reader users can reach it; otherwise it floats over the public site.
   Signing out removes it, stops its timer and clears everything it showed.
   ========================================================================== */
(function () {
  'use strict';
  const fl = window.coreWtFloat, core = window.coreWork, tm = window.coreTime; if (!fl || !core || !tm) return;
  const $ = id => document.getElementById(id);
  let root, bar, stat, timeEl, netEl, btnBox, errEl, minBtn, grip, prefs = { x: null, y: null, min: false }, timer = 0, shown = false, confirmType = '', confirmT = 0, busy = false, lastStatus = '';
  const mk = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  const vp = () => ({ w: document.documentElement.clientWidth || window.innerWidth, h: document.documentElement.clientHeight || window.innerHeight });
  const size = () => { const r = root.getBoundingClientRect(); return { w: r.width, h: r.height }; };
  const timeFmt = (m, tz) => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(m)); } catch (e) { return ''; } };

  function loadPrefs() { try { prefs = fl.parsePrefs(localStorage.getItem(fl.KEY)); } catch (e) { prefs = { x: null, y: null, min: false }; } }
  function savePrefs() { try { localStorage.setItem(fl.KEY, fl.serializePrefs(prefs)); } catch (e) { /* private mode: the place is just not remembered */ } }

  function build() {
    root = mk('div', 'wtfl'); root.id = 'wtFloat'; root.hidden = true; root.setAttribute('role', 'group'); root.setAttribute('aria-label', 'WorkTrack clock');
    bar = mk('div', 'wtfl-bar');
    grip = mk('button', 'wtfl-grip', '⠿'); grip.type = 'button';
    grip.setAttribute('aria-label', 'Move the clock. Drag it, or use the arrow keys. Press Home to put it back in the top right corner.');
    stat = mk('span', 'wtfl-status'); stat.setAttribute('role', 'status'); stat.setAttribute('aria-live', 'polite');
    minBtn = mk('button', 'wtfl-min'); minBtn.type = 'button';
    bar.append(grip, stat, minBtn);
    const body = mk('div', 'wtfl-body'); body.id = 'wtflBody';
    timeEl = mk('div', 'wtfl-time'); timeEl.setAttribute('role', 'timer'); timeEl.setAttribute('aria-label', 'Current time');
    netEl = mk('div', 'wtfl-net');
    btnBox = mk('div', 'wtfl-btns'); errEl = mk('p', 'wtfl-err'); errEl.setAttribute('role', 'alert');
    body.append(timeEl, netEl, btnBox, errEl);
    root.append(bar, body); document.body.append(root);
    minBtn.setAttribute('aria-controls', 'wtflBody');
    minBtn.addEventListener('click', () => { prefs.min = !prefs.min; savePrefs(); applyMin(); place(); });
    wireDrag();
  }
  function applyMin() {
    root.classList.toggle('wtfl-min-on', prefs.min); minBtn.textContent = prefs.min ? 'Expand' : 'Minimise';
    minBtn.setAttribute('aria-expanded', prefs.min ? 'false' : 'true'); minBtn.setAttribute('aria-label', prefs.min ? 'Expand the clock' : 'Minimise the clock');
    $('wtflBody').hidden = prefs.min;
  }
  function place(p) {
    const pos = fl.clamp(p || (prefs.x == null ? fl.defaultPos(vp(), size(), root.parentNode && root.parentNode.id === 'dash' ? 72 : fl.MARGIN) : { x: prefs.x, y: prefs.y }), vp(), size());
    root.style.left = pos.x + 'px'; root.style.top = pos.y + 'px'; return pos;
  }

  /* ---------------- dragging: pointer events (mouse, touch, pen) and arrow keys */
  function wireDrag() {
    let drag = null;
    bar.addEventListener('pointerdown', e => {
      if (e.button !== 0 || (e.target.closest('button') && e.target !== grip)) return;
      const r = root.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
      try { bar.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } root.classList.add('wtfl-drag'); e.preventDefault();
    });
    bar.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; const p = place({ x: e.clientX - drag.dx, y: e.clientY - drag.dy }); prefs.x = p.x; prefs.y = p.y; });
    const end = e => { if (!drag || (e && e.pointerId !== drag.id)) return; drag = null; root.classList.remove('wtfl-drag'); savePrefs(); };
    bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end); bar.addEventListener('lostpointercapture', () => end());
    grip.addEventListener('keydown', e => {
      if (e.key === 'Home') { prefs.x = prefs.y = null; savePrefs(); place(); e.preventDefault(); return; }
      const r = root.getBoundingClientRect(), n = fl.nudge({ x: r.left, y: r.top }, e.key, e.shiftKey);
      if (n) { const p = place(n); prefs.x = p.x; prefs.y = p.y; savePrefs(); e.preventDefault(); }
    });
    grip.addEventListener('dblclick', () => { prefs.x = prefs.y = null; savePrefs(); place(); });
  }

  /* ---------------- the dashboard dialog is aria-modal: while it is open the clock lives inside it */
  function home() {
    if (!root) return;
    const dash = $('dash'), want = dash && !dash.hidden ? dash : document.body, had = root.contains(document.activeElement) ? document.activeElement : null;
    if (root.parentNode !== want) { want.append(root); if (had && had.isConnected === false) { /* focus was lost by the move */ } if (had && document.activeElement !== had) { try { had.focus(); } catch (e) { /* ignore */ } } place(); }
  }

  /* ---------------- drawing */
  function render() {
    if (!root) return;
    const api = window.wtApi, st = api && api.signedIn() ? api.state() : null, d = st ? api.derived() : null, v = fl.view(st, d, core);
    if (!v.visible || !api.signedIn()) { teardown(); return; }
    if (!shown) { shown = true; root.hidden = false; home(); applyMin(); place(); startTimer(); }
    if (v.label !== lastStatus) { lastStatus = v.label; stat.textContent = v.label; }
    root.dataset.state = v.state;
    const keep = confirmType && v.buttons.some(b => b.type === confirmType) ? confirmType : ''; if (!keep) confirmType = '';
    btnBox.replaceChildren();
    v.buttons.forEach(b => btnBox.append(button(b)));
    if (v.paused) { errEl.textContent = 'Records are out of order, so punching is paused. Open WorkTrack for details.'; }
    tick();
  }
  function button(b) {
    const asking = confirmType === b.type, n = mk('button', 'wtfl-btn' + (b.type === 'CLOCK_OUT' ? ' wtfl-out' : ''), asking ? 'Confirm: ' + b.label : b.label);
    n.type = 'button'; n.dataset.punch = b.type; n.disabled = busy || (window.wtApi && window.wtApi.busy());
    n.addEventListener('click', () => click(b));
    return n;
  }
  async function click(b) {
    errEl.textContent = '';
    if (b.confirm && confirmType !== b.type) { confirmType = b.type; clearTimeout(confirmT); confirmT = setTimeout(() => { confirmType = ''; render(); }, 5000); render(); return; }
    clearTimeout(confirmT); confirmType = ''; busy = true; render();
    const r = await window.wtApi.punch(b.type); busy = false;
    render(); if (!r.ok) errEl.textContent = r.error;
  }
  function tick() {
    const api = window.wtApi; if (!api || !api.signedIn() || !shown) return;
    const st = api.state(); if (!st || st.state === 'NOT_STARTED') return;
    timeEl.textContent = timeFmt(api.now(), api.sessionTz());
    const d = api.derived(); netEl.textContent = d && d.valid && d.netMs != null ? 'Working time ' + tm.formatDuration(d.netMs) : '';
  }
  function startTimer() { stopTimer(); timer = setInterval(() => { if (!document.hidden) tick(); }, 1000); }
  function stopTimer() { if (timer) clearInterval(timer); timer = 0; }
  /* sign-out or session closed: stop everything and clear what was shown (no timer, no private text left in the page) */
  function teardown() {
    stopTimer(); clearTimeout(confirmT); confirmType = ''; busy = false; shown = false; lastStatus = '';
    if (!root) return;
    root.hidden = true; stat.textContent = ''; timeEl.textContent = ''; netEl.textContent = ''; errEl.textContent = ''; btnBox.replaceChildren(); delete root.dataset.state;
    if (root.parentNode !== document.body) document.body.append(root);
  }

  function init() {
    loadPrefs(); build(); applyMin();
    document.addEventListener('wt:changed', render);
    document.addEventListener('own:auth', e => { if (!(e.detail && e.detail.ok)) teardown(); });
    window.addEventListener('resize', () => { if (shown) place(); });
    const dash = $('dash'); if (dash) new MutationObserver(() => { if (shown) { home(); place(); } }).observe(dash, { attributes: true, attributeFilter: ['hidden'] });
    const wake = () => { const a = window.wtApi; if (!document.hidden && a && a.signedIn()) { a.sync(); tick(); } };
    document.addEventListener('visibilitychange', wake); window.addEventListener('focus', wake);
    render();
  }
  window.__wtFloat = { get shown() { return shown; }, get timerOn() { return !!timer; }, get prefs() { return Object.assign({}, prefs); } };   // read-only test hook
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
