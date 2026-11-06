/* ==========================================================================
   wt-alarm.js - WorkTrack break alarm (CodeFlow 4.5.0, phase W5c). A BROWSER REMINDER, not a guaranteed alarm.
   Settings live on THIS device only (localStorage 'wtAlarm:v1'). No database access, no audio files, no network.
   Moments come from the W5b deadline (core-wtalarm.js): a soft tone before the limit, the chosen sound at the limit, then repeats (at most 10).
   Sound: Web Audio oscillators with a 10 ms attack and 80 ms release. Browsers allow sound only after a click or key press, so the audio engine is
   unlocked by the first gesture; until then, with the alarm on, the clock shows "Tap to enable alarm sound".
   Timer: a same-origin dedicated worker ticks once a second (page timers are throttled in background tabs); without it the page uses its own interval.
   Stops at once on: the matching 'in' punch, clock out, session closed, sign-out, alarm switched off, or Silence.
   ========================================================================== */
(function () {
  'use strict';
  const al = window.coreWtAlarm; if (!al) return;
  const $ = id => document.getElementById(id), KEY = 'wtAlarm:v1';
  let prefs = al.validPrefs(null), ctx = null, worker = null, fallback = 0, handled = new Set(), sched = [], curKey = '', silencedKey = '', savedTitle = '', ours = '', flip = false, lastRang = 0, playing = null, signed = false;
  const say = (id, m) => { const n = $(id); if (n) n.textContent = m || ''; };
  const emit = () => { try { document.dispatchEvent(new Event('wtalarm:state')); } catch (e) { /* ignore */ } };

  function load() { try { prefs = al.validPrefs(localStorage.getItem(KEY)); } catch (e) { prefs = al.validPrefs(null); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* private mode: kept for this visit only */ } }

  /* ---------------- audio */
  function audio() {
    if (ctx) return ctx;
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    try { ctx = new C(); } catch (e) { ctx = null; }
    if (ctx) ctx.onstatechange = emit;
    return ctx;
  }
  function unlock() { const c = audio(); if (c && c.state !== 'running') { try { const p = c.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } } emit(); }
  const locked = () => !!(prefs.on && signed && (!ctx || ctx.state !== 'running'));
  function play(name, vol) {
    const c = audio(); if (!c || c.state !== 'running') return false;
    stopSound(); const list = al.notes(name, vol), t0 = c.currentTime + 0.02, nodes = [];
    list.forEach(n => {
      const o = c.createOscillator(), g = c.createGain(); o.type = n.wave; o.frequency.value = n.f;
      const a = t0 + n.at, e = a + n.dur;
      g.gain.setValueAtTime(0.0001, a); g.gain.linearRampToValueAtTime(n.gain, a + 0.01); g.gain.setValueAtTime(n.gain, Math.max(a + 0.01, e - 0.08)); g.gain.linearRampToValueAtTime(0.0001, e);
      o.connect(g); g.connect(c.destination); o.start(a); o.stop(e + 0.02); nodes.push(o);
    });
    playing = { nodes, until: Date.now() + al.length(list) * 1000 + 100 }; lastRang = Date.now(); return true;
  }
  function stopSound() { if (playing) { playing.nodes.forEach(o => { try { o.stop(); } catch (e) { /* already stopped */ } }); playing = null; } }

  /* ---------------- tab title (R7): restore only a title that is still ours */
  function titleOn(name, on) {
    if (!on) { if (ours) { const back = al.titleRestore({ current: document.title, saved: savedTitle, ours }); if (document.title !== back) document.title = back; } ours = ''; savedTitle = ''; return; }
    if (!ours) { ours = al.titleFor(name); savedTitle = document.title; }
    const s = al.titleStep({ current: document.title, saved: savedTitle, ours, flip }); savedTitle = s.saved; if (document.title !== s.title) document.title = s.title;
  }

  /* ---------------- notification (only generic text; permission asked only by the button) */
  function notify(kind, name) {
    if (!prefs.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    try { new Notification('WorkTrack', { body: al.notifyText(kind, name), tag: 'wt-break', silent: true }); } catch (e) { /* ignore */ }
  }

  /* ---------------- the once-a-second check */
  function stopAll(keepKey) { stopSound(); titleOn('', false); sched = []; handled = new Set(); flip = false; if (!keepKey) { curKey = ''; silencedKey = ''; } }
  function tick() {
    const a = window.wtApi;
    if (!signed || !prefs.on || !a || !a.signedIn()) { if (curKey || ours) stopAll(); return; }
    const bi = a.breakInfo ? a.breakInfo() : null;
    if (!bi || bi.kind === 'none' || bi.kind === 'nolimit' || !bi.outMs) { if (curKey || ours) { stopAll(); emit(); } return; }
    const key = bi.type + ':' + bi.outMs;
    if (key !== curKey) { const keepSil = silencedKey === key; stopAll(); if (keepSil) silencedKey = key; curKey = key; sched = al.schedule(bi, prefs); const t0 = a.now(); sched.forEach((e, i) => { if (t0 - e.atMs > al.GRACE_MS) handled.add(i); }); emit(); }   // first sight of a break (page just opened, or a setting changed): moments older than 5 s are marked handled and never played; fresh ones still ring
    const now = a.now(), d = al.due(sched, handled, now); d.mark.forEach(i => handled.add(i));
    if (silencedKey === key) { titleOn(bi.name, false); return; }
    if (d.play.length) {
      const last = d.play[d.play.length - 1];
      if (last.kind === 'warn') { play('soft', prefs.vol); notify('warn', bi.name); }
      else { play(prefs.sound, prefs.vol); if (last.kind === 'late') notify('late', bi.name); }
      emit();
    }
    if (bi.kind === 'late') { flip = !flip; titleOn(bi.name, true); } else titleOn(bi.name, false);
  }
  function startTimer() {
    if (worker || fallback) return;
    try { worker = new Worker('scripts/wt-alarm-worker.js'); worker.onmessage = tick; worker.onerror = () => { try { worker.terminate(); } catch (e) { /* ignore */ } worker = null; if (!fallback) fallback = setInterval(tick, 1000); }; worker.postMessage('start'); }
    catch (e) { worker = null; fallback = setInterval(tick, 1000); }
  }
  function stopTimer() { if (worker) { try { worker.postMessage('stop'); worker.terminate(); } catch (e) { /* ignore */ } worker = null; } if (fallback) { clearInterval(fallback); fallback = 0; } }
  function sync() { if (signed && prefs.on) startTimer(); else { stopTimer(); stopAll(); } emit(); drawCard(); }

  /* ---------------- public bits for the clock */
  function silence() { if (curKey) { silencedKey = curKey; stopSound(); titleOn('', false); emit(); drawCard(); } }
  const ringing = () => !!(prefs.on && curKey && silencedKey !== curKey && window.wtApi && window.wtApi.breakInfo().kind === 'late');
  window.wtAlarm = Object.freeze({ locked, silence, ringing, enabled: () => !!(prefs.on && signed), unlock, tick });

  /* ---------------- settings card */
  function drawCard() {
    if (!$('waOn')) return;
    $('waOn').checked = prefs.on; $('waWarn').value = String(prefs.warn); $('waRep').value = String(prefs.repeat); $('waSound').value = prefs.sound; $('waVol').value = String(prefs.vol); $('waVolOut').textContent = prefs.vol + '%';
    const dis = !prefs.on; ['waWarn', 'waRep', 'waSound', 'waVol', 'waNotify'].forEach(i => { $(i).disabled = dis; });
    const nsup = 'Notification' in window, perm = nsup ? Notification.permission : 'unsupported';
    $('waNotify').textContent = !nsup ? 'Notifications not supported here' : (prefs.notify && perm === 'granted') ? 'Notifications on (press to turn off)' : perm === 'denied' ? 'Notifications blocked in the browser' : 'Allow notifications';
    if (!nsup || perm === 'denied') $('waNotify').disabled = true;
    say('waState', !signed ? '' : !prefs.on ? 'The alarm is off. Nothing will sound.' : locked() ? 'Sound is not enabled yet: press "Test sound" or click anywhere on the page once.' : 'Alarm on. It reminds you only while this page is open in a browser.');
    $('waSilence').hidden = !ringing();
  }
  function changed(patch) { Object.assign(prefs, patch); prefs = al.validPrefs(prefs); save(); curKey = ''; sync(); }   // a setting changed: the moments of the open break are worked out again (past ones are marked handled, never replayed)
  function init() {
    load(); signed = !!(window.wtApi && window.wtApi.signedIn());
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, () => { if (prefs.on && signed) unlock(); }, { passive: true }));
    if ($('waOn')) {
      $('waOn').addEventListener('change', e => { const on = e.target.checked; changed({ on }); if (on) unlock(); });   // read the box first: unlock() redraws the card
      $('waWarn').addEventListener('change', e => changed({ warn: Number(e.target.value) }));
      $('waRep').addEventListener('change', e => changed({ repeat: Number(e.target.value) }));
      $('waSound').addEventListener('change', e => { changed({ sound: e.target.value }); });
      $('waVol').addEventListener('input', e => { prefs.vol = Number(e.target.value); $('waVolOut').textContent = prefs.vol + '%'; });
      $('waVol').addEventListener('change', e => changed({ vol: Number(e.target.value) }));
      $('waTest').addEventListener('click', () => { unlock(); const c = audio(); if (!c) { say('waState', 'This browser cannot play the alarm sound.'); return; } const go = () => { if (!play(prefs.sound, prefs.vol)) say('waState', 'The browser still blocks sound. Click the page, then try again.'); }; if (c.state === 'running') go(); else { const p = c.resume(); if (p && p.then) p.then(go).catch(go); else go(); } });
      $('waSilence').addEventListener('click', silence);
      $('waNotify').addEventListener('click', async () => {
        if (!('Notification' in window)) return;
        if (prefs.notify) { changed({ notify: false }); return; }
        try { const r = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission(); changed({ notify: r === 'granted' }); } catch (e) { changed({ notify: false }); }
      });
      $('waPos').addEventListener('click', () => document.dispatchEvent(new Event('wtfl:reset')));
    }
    document.addEventListener('own:auth', e => { signed = !!(e.detail && e.detail.ok); if (!signed) { stopTimer(); stopAll(); if (ctx) { try { ctx.close(); } catch (x) { /* ignore */ } ctx = null; } } sync(); });
    document.addEventListener('wt:changed', () => { if (!signed && window.wtApi && window.wtApi.signedIn()) { signed = true; } sync(); });
    document.addEventListener('dash:page', e => { if (e.detail === 'worktrack') drawCard(); });
    document.addEventListener('wtalarm:state', drawCard);
    sync();
  }
  window.__wtAlarm = { get prefs() { return Object.assign({}, prefs); }, get timer() { return worker ? 'worker' : fallback ? 'interval' : ''; }, get ctxState() { return ctx ? ctx.state : 'none'; }, get title() { return { ours, savedTitle }; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
