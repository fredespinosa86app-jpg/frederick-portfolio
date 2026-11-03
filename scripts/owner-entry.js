/* ==========================================================================
   owner-entry.js - header "Owner login" button and the owner-panel cards for the loading screen
   and the button's visibility (Security Phase 3.2).
   The header button only forwards to the real sign-in handler in owner-panel.js; who may enter is still decided by
   Google sign-in and the Firestore rules. Visible when: the owner chose "everyone", or this device has signed in as
   owner before (localStorage.ownerDevice), or the address ends with #owner.
   ========================================================================== */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const hdr = $('hdrLogin'); if (!hdr) return;
  const LS = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const cfgShow = () => { try { const c = JSON.parse(LS('siteCfg') || 'null'); return c && c.loginShow === 'everyone' ? 'everyone' : 'device'; } catch (e) { return 'device'; } };
  let signedIn = false;
  function sync() {
    const foot = $('ownerLogin'), fbReady = !!foot && !foot.hidden && !signedIn || signedIn;   /* Firebase is configured and loaded */
    const allowed = cfgShow() === 'everyone' || LS('ownerDevice') === '1' || location.hash === '#owner' || signedIn;
    hdr.hidden = !(fbReady && allowed);
    const label = signedIn ? 'Owner panel' : 'Owner login';
    hdr.setAttribute('aria-label', label); hdr.querySelector('.hl-t').textContent = label;
  }
  hdr.addEventListener('click', () => {
    if (signedIn) { const d = $('dashOpen'); if (d) d.click(); }
    else { const f = $('ownerLogin'); if (f) f.click(); }
  });
  document.addEventListener('own:auth', e => { signedIn = !!(e.detail && e.detail.ok); sync(); });
  document.addEventListener('site:applied', sync);
  window.addEventListener('hashchange', sync);
  const f0 = $('ownerLogin'); if (f0) new MutationObserver(sync).observe(f0, { attributes: true, attributeFilter: ['hidden'] });
  sync();

  /* ------------- owner-panel cards (General page) ------------- */
  const DEF = { on: true, max: 10, min: 0.6, fade: 0.35, bg: '#000000', dots: 'pulse' };
  const opt = (sel, vals, fmt) => { sel.replaceChildren(...vals.map(v => { const o = document.createElement('option'); o.value = String(v); o.textContent = fmt(v); return o; })); };
  const MAXV = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], MINV = [0, 0.2, 0.4, 0.6, 0.8, 1, 1.5, 2], FADEV = [0.1, 0.2, 0.35, 0.5, 0.75, 1];
  const s = v => (v === 1 ? '1 second' : v + ' seconds');
  if ($('ldMax')) {
    opt($('ldMax'), MAXV, s); opt($('ldMin'), MINV, v => v === 0 ? 'No minimum' : s(v)); opt($('ldFade'), FADEV, s);
    const read = () => {
      let mx = +$('ldMax').value, mn = +$('ldMin').value; if (mn > mx) mn = mx;
      return { on: $('ldOn').checked, max: mx, min: mn, fade: +$('ldFade').value, bg: /^#[0-9a-f]{6}$/i.test($('ldBg').value) ? $('ldBg').value : '#000000', dots: $('ldDots').value };
    };
    const put = o => {
      o = Object.assign({}, DEF, o || {});
      $('ldOn').checked = o.on !== false; $('ldMax').value = String(o.max); $('ldMin').value = String(o.min); $('ldFade').value = String(o.fade); $('ldBg').value = o.bg; $('ldDots').value = o.dots;
      ['ldMax', 'ldMin', 'ldFade', 'ldBg', 'ldDots'].forEach(id => { $(id).disabled = !$('ldOn').checked; });
    };
    const lum = h => { const r = parseInt(h.substr(1, 2), 16) / 255, g = parseInt(h.substr(3, 2), 16) / 255, b = parseInt(h.substr(5, 2), 16) / 255; return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const note = () => { const o = read(); $('ldNote').textContent = o.on ? 'Visitors wait until the page is ready, at most ' + s(o.max) + ' (at least ' + (o.min ? s(o.min) : '0 seconds') + '). Dots are drawn in ' + (lum(o.bg) > 0.5 ? 'black' : 'white') + ' so they stay visible on this colour.' : 'The loading screen is off: the page appears as soon as it loads, and the default page may flash briefly.'; };
    const fromCfg = () => { const c = window.__lastCfg || {}; put(c.loading); note(); if ($('lsShow')) $('lsShow').value = c.loginShow === 'everyone' ? 'everyone' : 'device'; };
    document.addEventListener('dash:page', e => { if (e.detail === 'general') fromCfg(); });
    document.addEventListener('site:applied', fromCfg);
    ['ldOn', 'ldMax', 'ldMin', 'ldFade', 'ldBg', 'ldDots'].forEach(id => $(id).addEventListener('change', () => { put(read()); note(); }));
    $('ldSave').addEventListener('click', () => { const o = read(); if (!window.OWN) return window.dashNotify && window.dashNotify('Could not save. Please sign in as the owner first.', 'error'); window.OWN.save({ loading: o }, 'Loading screen saved. Visitors see it on their next visit.'); });
    $('ldReset').addEventListener('click', () => { put(DEF); note(); window.dashNotify && window.dashNotify('Standard values restored. Press Save to keep them.', 'success'); });
    $('ldPrev').addEventListener('click', () => { if (window.bootCover) window.bootCover.preview(read(), 2000); });
    $('lsSave').addEventListener('click', () => { if (!window.OWN) return; window.OWN.save({ loginShow: $('lsShow').value === 'everyone' ? 'everyone' : 'device' }, 'Owner login button setting saved.'); });
  }
})();
