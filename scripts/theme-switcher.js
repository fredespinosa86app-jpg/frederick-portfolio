/* ==========================================================================
   theme-switcher.js - owner-selected theme + public Dark Mode toggle + UI effects
   - The owner picks the site theme in the dashboard (saved in Firestore, applied via applySite).
   - Visitors can only toggle Dark Mode for themselves (localStorage "portfolio-dark").
     This never changes the owner's saved theme; switching it off returns to the owner's theme.
   ========================================================================== */
(function () {
  'use strict';
  const THEMES = ['gold-silver', 'nature', 'outer-space', 'classic', 'dark', 'vegapunk', 'girly', 'ocean'];
  const LIGHT_HERO = { 'gold-silver': true, girly: true };   // themes whose hero is light (dark text)
  const KEY = 'portfolio-dark';
  const root = document.documentElement;
  const toggle = document.getElementById('darkToggle');
  window.OWNER_THEMES = THEMES;

  let owner = 'gold-silver', dark = false, preview = false;
  try { dark = localStorage.getItem(KEY) === '1'; } catch (e) { /* storage unavailable */ }

  function paint() {
    const useDark = dark && !preview, id = useDark ? 'dark' : owner;
    root.classList.add('theme-fade');
    root.dataset.theme = id;
    const hero = document.querySelector('.hero');
    if (hero) {
      hero.style.background = useDark ? '' : (window.__heroBg || '');
      hero.classList.toggle('lt', useDark ? false : (window.__cust ? !!window.__ltCust : !!LIGHT_HERO[id]));
    }
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(dark));
      toggle.setAttribute('aria-label', dark ? 'Dark mode is on. Switch back to the site theme' : 'Switch to dark mode');
      toggle.title = dark ? 'Turn dark mode off' : 'Turn dark mode on';
    }
    clearTimeout(paint.timer);
    paint.timer = setTimeout(() => root.classList.remove('theme-fade'), 450);
  }

  /* Called by site-settings.js (owner theme + effects) and by the dashboard preview (force = true). */
  window.applyLook = (theme, fx, force) => {
    owner = THEMES.includes(theme) ? theme : 'gold-silver';
    preview = !!force;
    paint();
    const list = Array.isArray(fx) ? fx : String(fx || '').split(',');
    ['reveal', 'lift', 'glow', 'glass'].forEach(k => document.body.classList.toggle('fx-' + k, list.includes(k)));
    if (list.includes('reveal') && !window.__io && 'IntersectionObserver' in window) {
      window.__io = new IntersectionObserver(entries => entries.forEach(e => {
        if (e.isIntersecting || e.boundingClientRect.top < 0) { e.target.classList.add('in'); window.__io.unobserve(e.target); }
      }), { threshold: 0.08 });
      document.querySelectorAll('main section:not(.hero)').forEach(s => window.__io.observe(s));
    }
  };

  if (toggle) toggle.addEventListener('click', () => {
    dark = !dark; preview = false;
    try { localStorage.setItem(KEY, dark ? '1' : '0'); } catch (e) { /* ignore */ }
    paint();
  });
  paint();
})();
