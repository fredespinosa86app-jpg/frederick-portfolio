/* ==========================================================================
   experience.js - public Experience section (timeline), managed in the owner dashboard.
   Data: Firestore content/experience { enabled, items[] }. Nothing is shown until the owner
   adds entries and switches the section on; no experience is invented here.
   ========================================================================== */
(function () {
  'use strict';
  const CACHE = 'expCfg', MAX = 30, TYPES = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Self-employed', 'Internship', 'Other'];
  let state = { enabled: false, items: [] };

  const str = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '';
  const month = v => /^\d{4}-(0[1-9]|1[0-2])$/.test(v || '') ? v : '';
  const clean = d => {
    const r = d && typeof d === 'object' ? d : {};
    return { enabled: r.enabled === true, items: (Array.isArray(r.items) ? r.items : []).slice(0, MAX).map(x => ({
      id: str(x && x.id, 40), company: str(x && x.company, 100), title: str(x && x.title, 100), type: TYPES.includes(x && x.type) ? x.type : 'Other',
      start: month(x && x.start), end: month(x && x.end), current: !!(x && x.current === true), description: str(x && x.description, 1200), responsibilities: str(x && x.responsibilities, 2000), enabled: !x || x.enabled !== false
    })).filter(x => x.id && x.company && x.title) };
  };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = m => m ? MON[+m.slice(5) - 1] + ' ' + m.slice(0, 4) : '';
  const period = x => { const s = fmt(x.start), e = x.current ? 'Present' : fmt(x.end); return s && e ? s + ' – ' + e : (s || e); };
  const node = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function render(d) {
    const sec = document.getElementById('experience'), box = document.getElementById('xList'), link = document.getElementById('navExp');
    if (!sec || !box) return;
    d = d || state; const items = d.enabled ? d.items.filter(x => x.enabled) : [];
    box.textContent = '';
    items.forEach(x => {
      const li = node('li', 'xitem'), h = node('h3', '', x.title);
      const meta = node('p', 'xmeta'); meta.append(node('strong', '', x.company)); [x.type, period(x)].filter(Boolean).forEach(t => meta.append(' · ', t));
      li.append(h, meta);
      if (x.description) x.description.split(/\n{2,}/).forEach(p => li.appendChild(node('p', 'xdesc', p)));
      const lines = x.responsibilities.split('\n').map(s => s.trim().replace(/^[-•]\s*/, '')).filter(Boolean);
      if (lines.length) { const ul = node('ul', 'points'); lines.forEach(l => ul.appendChild(node('li', '', l))); li.appendChild(ul); }
      box.appendChild(li);
    });
    sec.hidden = !items.length; if (link) link.hidden = !items.length;
    document.dispatchEvent(new Event('content:applied'));
  }
  const cache = () => { try { localStorage.setItem(CACHE, JSON.stringify(state)); } catch (e) { /* ignore */ } };
  window.experienceApi = {
    MAX, TYPES, clean, get: () => clean(state),
    set: d => { state = clean(d); cache(); render(); },
    preview: d => render(clean(d)), render: () => render()
  };
  try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c) state = clean(c); } catch (e) { /* ignore */ }
  render();
})();
