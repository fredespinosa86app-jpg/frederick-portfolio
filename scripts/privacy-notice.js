/* privacy-notice.js - fills the privacy notice with the owner's retention periods and contact (Security S5).
   Values come from the cached settings (settings/site.retention, .privacyContact); defaults match the owner panel. */
(function () {
  'use strict';
  const D = { visits: 90, chat: 180, requests: 730, reqStale: 365 };
  const lbl = n => n >= 365 && n % 365 === 0 ? (n / 365) + (n === 365 ? ' year' : ' years') : n + ' days';
  const cfg = () => { try { return window.__lastCfg || JSON.parse(localStorage.getItem('siteCfg') || 'null') || {}; } catch (e) { return {}; } };
  function fill() {
    const c = cfg(), r = c.retention && typeof c.retention === 'object' ? c.retention : {};
    [['pvVisits', 'visits'], ['pvChat', 'chat'], ['pvReq', 'requests'], ['pvStale', 'reqStale']].forEach(([id, k]) => {
      const e = document.getElementById(id), n = Number(r[k]); if (e) e.textContent = lbl(n >= 1 && n <= 3650 ? Math.round(n) : D[k]);
    });
    const line = document.getElementById('pvContactLine'), ct = String(c.privacyContact || '').trim();
    if (!line) return;
    if (!line.dataset.def) line.dataset.def = line.textContent; else line.textContent = line.dataset.def;   // back to the standard sentence unless a valid contact follows
    if (/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(ct)) { line.textContent = 'To ask about your data, email '; const a = document.createElement('a'); a.href = 'mailto:' + ct; a.textContent = ct; line.append(a, '.'); }
    else if (/^https:\/\/[^\s<>]+$/.test(ct)) { line.textContent = 'To ask about your data, use '; const a = document.createElement('a'); a.href = ct; a.rel = 'noopener noreferrer'; a.textContent = ct; line.append(a, '.'); }
  }
  const open = document.getElementById('privacyLink'); if (open) open.addEventListener('click', fill);
  document.addEventListener('site:applied', fill);
})();
