/* ==========================================================================
   analytics.js - privacy-friendly visitor counter (Phase 3)
   Collects only: a random anonymous id, a per-tab session id, the page or section viewed,
   the referring website's host name, device category and browser family, and the time.
   No cookies, no IP address, no name, no email, no fingerprinting. Respects Do Not Track and
   Global Privacy Control, a visitor opt-out, and does not count the owner's own device.
   ========================================================================== */
(function () {
  'use strict';
  const LS = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)); } catch (e) { return null; } };
  const SS = (k, v) => { try { return v === undefined ? sessionStorage.getItem(k) : sessionStorage.setItem(k, v); } catch (e) { return null; } };
  const rid = () => { const a = new Uint8Array(12); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; }); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); };

  const optedOut = () => LS('noTrack') === '1' || navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  const isBot = () => /bot|crawl|spider|headless|lighthouse|preview/i.test(navigator.userAgent || '');
  const skip = () => optedOut() || isBot() || LS('ownerDevice') === '1' || /^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname) && !window.__trackLocal;

  function device() {
    const ua = navigator.userAgent || '', w = Math.min(screen.width || innerWidth, screen.height || innerWidth), touch = navigator.maxTouchPoints > 1;
    if (/ipad|tablet|kindle|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua)) || (touch && /macintosh/i.test(ua))) return 'tablet';
    if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return 'mobile';
    return touch && w >= 600 && w < 1100 ? 'tablet' : 'desktop';
  }
  function browser() {
    const ua = navigator.userAgent || '';
    if (/edg\//i.test(ua)) return 'Edge'; if (/opr\/|opera/i.test(ua)) return 'Opera'; if (/firefox|fxios/i.test(ua)) return 'Firefox';
    if (/samsungbrowser/i.test(ua)) return 'Samsung Internet'; if (/chrome|crios/i.test(ua)) return 'Chrome'; if (/safari/i.test(ua)) return 'Safari'; return 'Other';
  }
  function referrer() {
    try {
      const u = new URLSearchParams(location.search).get('utm_source'); if (u) return ('utm:' + u).replace(/[^\w:.\- ]/g, '').slice(0, 60);
      if (!document.referrer) return '';
      const h = new URL(document.referrer).hostname.replace(/^www\./, ''); return h === location.hostname.replace(/^www\./, '') ? '' : h.slice(0, 100);
    } catch (e) { return ''; }
  }

  let vid = LS('vid'); if (!/^[0-9a-f]{24}$/.test(vid || '')) { vid = rid(); LS('vid', vid); }
  let sid = SS('sid'); if (!/^[0-9a-f]{24}$/.test(sid || '')) { sid = rid(); SS('sid', sid); }
  const dev = device(), br = browser(), ref = referrer();

  /* send each (type,path) once per tab session, so refreshing never inflates the numbers */
  const sent = new Set((SS('sent') || '').split(',').filter(Boolean));
  function send(type, path) {
    const key = type + ':' + path; if (sent.has(key) || skip()) return;
    if (typeof window.recordVisit !== 'function') return false;
    sent.add(key); SS('sent', [...sent].join(','));
    window.recordVisit({ vid, sid, type, path: String(path).slice(0, 40), ref: type === 'view' ? ref : '', device: dev, browser: br }).catch(() => { sent.delete(key); });
    return true;
  }
  const page = () => location.hash === '#schedule' ? 'schedule' : 'home';
  function boot() {
    let tries = 0;
    const wait = setInterval(() => {
      if (typeof window.recordVisit === 'function') { clearInterval(wait); start(); } else if (++tries > 40) clearInterval(wait);
    }, 250);
  }
  function start() {
    send('view', page());
    window.addEventListener('hashchange', () => send('view', page()));
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && e.target.id) { send('section', e.target.id); io.unobserve(e.target); } }), { threshold: 0.35 });
      document.querySelectorAll('main section[id]').forEach(s => io.observe(s));
    }
  }
  window.analyticsApi = { optedOut, setOptOut: on => { LS('noTrack', on ? '1' : null); }, device: () => dev, browser: () => br, skip };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

/* privacy notice dialog (footer link) with a visitor opt-out */
(function () {
  'use strict';
  const d = document.getElementById('privacyDlg'), open = document.getElementById('privacyLink'); if (!d || !open) return;
  const chk = document.getElementById('privOpt'), st = document.getElementById('privState');
  const sync = () => { const api = window.analyticsApi; chk.checked = api.optedOut(); const auto = navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true; chk.disabled = auto; st.textContent = auto ? 'Your browser sends a Do Not Track or Global Privacy Control signal, so your visits are not counted.' : (chk.checked ? 'Your visits are not counted.' : 'Your visits are counted anonymously.'); };
  open.addEventListener('click', () => { sync(); d.showModal(); });
  chk.addEventListener('change', () => { window.analyticsApi.setOptOut(chk.checked); sync(); });
  document.getElementById('privClose').addEventListener('click', () => d.close());
})();
