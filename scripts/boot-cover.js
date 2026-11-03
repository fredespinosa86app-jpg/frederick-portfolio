/* ==========================================================================
   boot-cover.js - loading cover (Security S3.1, adjustable since S3.2)
   Keeps a screen with three dots over the page until the saved settings and content have been applied,
   so nobody sees the default page first. It is released when ALL of these are true:
     1. the browser finished loading the page,  2. fonts are ready,
     3. owner-panel.js started its Firestore listeners and EVERY one answered (data, empty or error),
     4. the pictures at the top of the page are decoded,  5. the owner's minimum display time has passed.
   Hard limit: the owner's maximum (default 10 s) after navigation. Bots, no-JS visitors and script errors never see it.
   Owner options (Owner panel > General > Loading screen) are read from the cached settings (localStorage.siteCfg.loading),
   so a change applies from the visitor's next visit. The cover also shows briefly when a visitor clicks Hire Me.
   ========================================================================== */
(function () {
  'use strict';
  var root = document.documentElement;
  var DEF = { on: true, max: 10, min: 0.6, fade: 0.35, bg: '#000000', dots: 'pulse' };
  function num(v, lo, hi, d) { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; }
  function readCfg() {
    var l = {}; try { var c = JSON.parse(localStorage.getItem('siteCfg') || 'null'); if (c && c.loading && typeof c.loading === 'object') l = c.loading; } catch (e) { /* ignore */ }
    var o = {
      on: l.on !== false, max: num(l.max, 1, 10, DEF.max), min: num(l.min, 0, 2, DEF.min), fade: num(l.fade, 0.1, 1, DEF.fade),
      bg: /^#[0-9a-fA-F]{6}$/.test(l.bg || '') ? l.bg : DEF.bg, dots: ['pulse', 'bounce', 'none'].indexOf(l.dots) >= 0 ? l.dots : DEF.dots
    };
    if (o.min > o.max) o.min = o.max;
    return o;
  }
  var C = readCfg();
  var MIN = C.min * 1000, MAX = C.max * 1000, FADE = C.fade * 1000;
  var pending = {}, n = 0, panel = false, loaded = false, fonts = false, imgWait = 0, active = true, timer = 0, hard = 0, base = 0;
  var now = function () { return (window.performance && performance.now) ? performance.now() : 0; };
  var el = function () { return document.getElementById('boot'); };
  function lum(h) { var r = parseInt(h.substr(1, 2), 16) / 255, g = parseInt(h.substr(3, 2), 16) / 255, b = parseInt(h.substr(5, 2), 16) / 255; return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
  function style() {
    root.style.setProperty('--boot-bg', C.bg); root.style.setProperty('--boot-fade', C.fade + 's');
    root.style.setProperty('--boot-dot', lum(C.bg) > 0.5 ? '#000' : '#fff');
    root.classList.toggle('boot-dots-bounce', C.dots === 'bounce'); root.classList.toggle('boot-dots-none', C.dots === 'none');
  }
  function release() {
    if (!active) return; active = false; clearTimeout(timer); clearTimeout(hard);
    var b = el(); if (!b) return;
    b.classList.add('boot-out'); b.setAttribute('aria-busy', 'false');
    setTimeout(function () { if (!active) b.hidden = true; }, FADE + 50);
  }
  function topImagesPending() {
    var list = document.images, k, im, r;
    for (k = 0; k < list.length; k++) {
      im = list[k]; if (im.complete || im.hidden) continue;
      r = im.getBoundingClientRect(); if (r.width > 0 && r.top < window.innerHeight && r.bottom > 0) return true;
    }
    return false;
  }
  function check() {
    if (!active || !loaded || !fonts || !panel || n > 0) return;
    var t = now() - base;
    if (t < MIN) { clearTimeout(timer); timer = setTimeout(check, MIN - t + 5); return; }
    if (topImagesPending() && t < MAX - 300 && imgWait++ < 40) { clearTimeout(timer); timer = setTimeout(check, 100); return; }
    release();
  }
  /* second use: a visitor clicks Hire Me / a CTA that opens the schedule view */
  function transition() {
    if (active || !C.on) return;
    var b = el(); if (!b) return;
    base = now(); active = true; imgWait = 0;
    b.hidden = false; void b.offsetWidth; b.classList.remove('boot-out'); b.setAttribute('aria-busy', 'true');
    clearTimeout(hard); hard = setTimeout(release, MAX);
    var go = function () { check(); };
    if (window.requestAnimationFrame) requestAnimationFrame(function () { requestAnimationFrame(go); }); else go();
    var done = function () { var h = document.querySelector('#schedule h2'); if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } };
    setTimeout(done, MIN + FADE + 120);
  }
  window.bootCover = {
    need: function (k) { if (!pending[k]) { pending[k] = 1; n++; } },
    done: function (k) { if (pending[k] === 1) { pending[k] = 2; n--; check(); } },
    panel: function () { panel = true; check(); },
    show: transition,
    cfg: function () { return C; },
    preview: function (o, ms) {          /* owner panel preview: shows the cover with the values on screen, never longer than ms */
      var b = el(); if (!b) return; var keep = C; C = o; style(); active = true; b.hidden = false; void b.offsetWidth; b.classList.remove('boot-out');
      setTimeout(function () { b.classList.add('boot-out'); setTimeout(function () { b.hidden = true; active = false; C = keep; style(); }, (o.fade * 1000) + 60); }, ms || 2000);
    }
  };
  try {
    style();
    if (!C.on || /bot|crawl|spider|slurp|lighthouse/i.test(navigator.userAgent || '')) { root.classList.add('no-boot'); active = false; return; }
    window.addEventListener('error', function () { release(); });
    window.addEventListener('unhandledrejection', function () { setTimeout(release, 1500); });
    window.addEventListener('load', function () { loaded = true; check(); });
    if (document.readyState === 'complete') loaded = true;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fonts = true; check(); }, function () { fonts = true; check(); }); else fonts = true;
    hard = setTimeout(release, Math.max(0, MAX - now()));
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href="#schedule"]') : null;
      if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank') return;
      if (location.hash === '#schedule') return;
      transition();
    }, true);
  } catch (e) { root.classList.add('no-boot'); active = false; }
})();
