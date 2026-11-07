/* owner-navsearch.js - "Find a section" box at the top of the Owner Panel drawer (R4). Hides drawer entries (and headings with no entry left) that do not match.
   Stores nothing, sends nothing. Enter opens the first match; Esc clears. Uses a CSS class (never the hidden attribute) so no other script's state is touched. */
(function () {
  'use strict';
  const NS = window.coreNavSearch, box = document.getElementById('navSearch'), nav = document.querySelector('.dnav'), msg = document.getElementById('navSearchMsg');
  if (!NS || !box || !nav || !msg) return;
  const buttons = () => [...nav.querySelectorAll('button[data-page]')];
  const label = b => (b.querySelector('.dlabel') || b).textContent.trim();
  function apply() {
    const bs = buttons(), keys = new Set(NS.match(box.value, bs.map(b => ({ key: b.dataset.page, label: label(b) }))));
    bs.forEach(b => b.classList.toggle('ns-hide', !keys.has(b.dataset.page)));
    nav.querySelectorAll('h2').forEach(h => { let n = h.nextElementSibling, any = false; while (n && n.tagName !== 'H2') { if (n.matches('button[data-page]') && !n.classList.contains('ns-hide')) any = true; n = n.nextElementSibling; } h.classList.toggle('ns-hide', !any); });
    msg.textContent = keys.size ? (box.value.trim() ? keys.size + (keys.size === 1 ? ' section found.' : ' sections found.') : '') : 'No section matches. Try another word.';
  }
  box.addEventListener('input', apply);
  box.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); const b = buttons().find(x => !x.classList.contains('ns-hide')); if (b) { b.click(); } }
    else if (e.key === 'Escape' && box.value) { e.preventDefault(); e.stopPropagation(); box.value = ''; apply(); }
  });
  const clear = document.getElementById('navSearchClear'); if (clear) clear.addEventListener('click', () => { box.value = ''; apply(); box.focus(); });
})();
