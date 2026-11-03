/* ==========================================================================
   boot-cover.js - loading cover (Security S3.1)
   Keeps a black screen with three dots over the page until the saved settings and content have been applied,
   so nobody sees the default page first. It is released when ALL of these are true:
     1. the browser finished loading the page (images, styles),  2. fonts are ready,
     3. owner-panel.js has started its Firestore listeners and EVERY one has answered (data, empty or error),
     4. the pictures at the top of the page are decoded,         5. at least 0.6 s have passed (no flicker).
   Hard limit: 10 s after navigation, whatever is still missing. Search-engine bots, no-JS visitors and any script
   error never see the cover. The cover appears once per page load only.
   ========================================================================== */
(function () {
  'use strict';
  var MIN = 600, MAX = 10000, FADE = 400, pending = {}, n = 0, panel = false, loaded = false, fonts = false, imgWait = 0, gone = false, timer = 0;
  var root = document.documentElement;
  var now = function () { return (window.performance && performance.now) ? performance.now() : 0; };
  var el = function () { return document.getElementById('boot'); };
  function hide() {
    if (gone) return; gone = true; clearTimeout(timer);
    var b = el(); if (!b) return;
    b.classList.add('boot-out'); b.setAttribute('aria-busy', 'false');
    setTimeout(function () { b.hidden = true; }, FADE);
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
    if (gone || !loaded || !fonts || !panel || n > 0) return;
    var t = now();
    if (t < MIN) { clearTimeout(timer); timer = setTimeout(check, MIN - t + 5); return; }
    if (topImagesPending() && t < MAX - 300 && imgWait++ < 40) { clearTimeout(timer); timer = setTimeout(check, 100); return; }
    hide();
  }
  window.bootCover = {
    need: function (k) { if (!pending[k]) { pending[k] = 1; n++; } },
    done: function (k) { if (pending[k] === 1) { pending[k] = 2; n--; check(); } },
    panel: function () { panel = true; check(); }
  };
  try {
    if (/bot|crawl|spider|slurp|lighthouse/i.test(navigator.userAgent || '')) { root.classList.add('no-boot'); gone = true; return; }
    window.addEventListener('error', function () { hide(); });
    window.addEventListener('unhandledrejection', function () { /* a failed import must not trap the visitor */ setTimeout(hide, 1500); });
    window.addEventListener('load', function () { loaded = true; check(); });
    if (document.readyState === 'complete') loaded = true;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fonts = true; check(); }, function () { fonts = true; check(); }); else fonts = true;
    setTimeout(hide, Math.max(0, MAX - now()));
  } catch (e) { root.classList.add('no-boot'); gone = true; }
})();
