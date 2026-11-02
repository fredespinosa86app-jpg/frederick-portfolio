/* ==========================================================================
   section-bg.js - per-section background colours (every section except the hero).
   Data: settings/site.secBg { sectionId: '#rrggbb' }. Each section only receives its own colour.
   Text, borders and chips switch to a light or dark palette so the text always stays readable.
   ========================================================================== */
(function () {
  'use strict';
  const SECTIONS = [['intro', 'Meet Frederick (intro video)'], ['services', 'Services'], ['training', 'Training & Hands-on Experience'], ['toolkit', 'Toolkit'],
    ['process', 'How I Work'], ['testimonials', 'Testimonials'], ['faq', 'FAQ'], ['thank-you', 'Thank-you video'], ['contact', 'Contact']];
  const HEX = /^#[0-9a-f]{6}$/i;
  const lum = c => { const n = parseInt(c.slice(1), 16), f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(n >> 16 & 255) + 0.7152 * f(n >> 8 & 255) + 0.0722 * f(n & 255); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const LIGHT = { '--navy': '#14213d', '--hc': '#14213d', '--ink': '#2b3550', '--muted': '#4a5468', '--line': '#cdd3df', '--paper': '#ffffff', '--tag': '#efe2bf', '--tagc': '#5a4210', '--gold': '#8f6712', '--field': '#ffffff' };
  const DARK = { '--navy': '#ffffff', '--hc': '#ffffff', '--ink': '#e8ecf5', '--muted': '#c3cbe0', '--line': 'rgba(255,255,255,.24)', '--paper': 'rgba(255,255,255,.07)', '--tag': 'rgba(255,255,255,.14)', '--tagc': '#ffffff', '--gold': '#e6c262', '--field': '#1a2238' };

  function paint(el, color) {
    const keys = Object.keys(LIGHT);
    if (!color) { el.style.background = ''; keys.forEach(k => el.style.removeProperty(k)); el.removeAttribute('data-secbg'); return; }
    const pal = ratio(color, '#14213d') >= ratio(color, '#ffffff') ? LIGHT : DARK;   // pick the text palette with the better contrast
    el.style.background = color; el.setAttribute('data-secbg', pal === LIGHT ? 'light' : 'dark');
    keys.forEach(k => el.style.setProperty(k, pal[k]));
  }
  function apply(map) {
    const m = map && typeof map === 'object' ? map : {};
    SECTIONS.forEach(([id]) => { const el = document.getElementById(id); if (el) paint(el, HEX.test(m[id] || '') ? m[id] : ''); });
    window.__secBg = m;
  }
  /* contrast of the best text colour against a background, for the dashboard hint */
  const contrast = c => HEX.test(c) ? Math.max(ratio(c, '#14213d'), ratio(c, '#ffffff')) : 0;
  window.secBgApi = { apply, SECTIONS, contrast, HEX };
})();
