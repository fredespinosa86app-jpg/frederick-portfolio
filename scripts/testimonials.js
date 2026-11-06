/* ==========================================================================
   testimonials.js - public Testimonials section (Grid, Carousel or List view)
   Data: Firestore content/testimonials { enabled, view, items[] } published from the owner dashboard.
   Older testimonials saved as "Quote | Name, role" text (settings/site) are still shown until the
   owner publishes the new format. Everything is re-validated here before it reaches the page.
   ========================================================================== */
(function () {
  'use strict';
  const CACHE = 'testiCfg', MAX_ITEMS = 20;
  const $ = id => document.getElementById(id);
  const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
  const img = v => typeof v === 'string' && v.length <= 60000 && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : '';
  /* Google Drive link only (https, exact host, no user name or port, no spaces); anything else is dropped. Same rule as core-survey.js parseVideoLink 'drive'. */
  const drive = v => { if (typeof v !== 'string' || v.length > 300 || /\s/.test(v)) return ''; try { const u = new URL(v); return u.protocol === 'https:' && u.hostname === 'drive.google.com' && !u.username && !u.password && !u.port && u.pathname.length > 1 ? u.href : ''; } catch (e) { return ''; } };
  const rating = v => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0; };   // 0 = no rating (never defaults to 5)

  function clean(raw) {
    const o = raw && typeof raw === 'object' ? raw : {};
    return {
      enabled: o.enabled === true,
      view: ['grid', 'carousel', 'list'].includes(o.view) ? o.view : 'grid',
      items: (Array.isArray(o.items) ? o.items : []).slice(0, MAX_ITEMS).map(t => ({
        id: str(t && t.id, 40), name: str(t && t.name, 80), role: str(t && t.role, 100), quote: str(t && t.quote, 700),
        rating: rating(t && t.rating), photo: img(t && t.photo), video: drive(t && t.video), enabled: !t || t.enabled !== false
      })).filter(t => t.id && t.name && t.quote)
    };
  }
  /* John Smith -> JS, Maria Santos -> MS, David -> D */
  function initials(name) {
    const w = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!w.length) return '?';
    const first = Array.from(w[0])[0], last = w.length > 1 ? Array.from(w[w.length - 1])[0] : '';
    return (first + last).toUpperCase();
  }
  function legacyDoc(l) {
    const lines = String((l && l.text) || '').split('\n').map(x => x.trim()).filter(Boolean);
    return { enabled: !!(l && l.enabled), view: 'grid', items: lines.map((line, i) => {
      const k = line.lastIndexOf('|'), q = k > 0 ? line.slice(0, k) : line, who = k > 0 ? line.slice(k + 1).trim() : '';
      const c = who.indexOf(',');
      return { id: 'lg' + (i + 1), name: (c > 0 ? who.slice(0, c) : who) || 'Client', role: c > 0 ? who.slice(c + 1) : '', quote: q.trim(), rating: 0, photo: '', enabled: true };
    }) };
  }

  const node = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function card(t) {
    const f = node('figure', 'tcard');
    if (t.rating) {
      const s = node('div', 'tstars'); s.setAttribute('role', 'img'); s.setAttribute('aria-label', 'Rated ' + t.rating + ' out of 5');
      s.innerHTML = '<svg aria-hidden="true"><use href="#star"/></svg>'.repeat(t.rating); f.appendChild(s);
    }
    f.appendChild(node('blockquote', '', t.quote));
    const a = node('div', 'tauthor');
    if (t.photo) { const i = node('img', 'tav'); i.src = t.photo; i.alt = ''; i.width = 48; i.height = 48; i.loading = 'lazy'; a.appendChild(i); }
    else { const s = node('span', 'tav', initials(t.name)); s.setAttribute('aria-hidden', 'true'); a.appendChild(s); }
    const who = node('div'); who.appendChild(node('strong', '', t.name)); if (t.role) who.appendChild(node('small', '', t.role));
    a.appendChild(who); f.appendChild(a);
    if (t.video) { const l = node('a', 'tvideo', 'Watch Testimonial Video'); l.href = t.video; l.target = '_blank'; l.rel = 'noopener noreferrer'; f.appendChild(l); }
    return f;
  }

  let observer = null;
  function render(raw) {
    const d = clean(raw), sec = $('testimonials'), root = $('tRoot'), grid = $('tGrid');
    if (!sec || !root || !grid) return;
    const items = d.items.filter(t => t.enabled);
    if (observer) { observer.disconnect(); observer = null; }
    root.querySelectorAll('.tnav').forEach(n => n.remove());
    ['tabindex', 'role', 'aria-roledescription', 'aria-label'].forEach(a => grid.removeAttribute(a));
    grid.textContent = '';
    root.dataset.view = d.view;
    items.forEach(t => grid.appendChild(card(t)));
    sec.hidden = !(d.enabled && items.length);
    if (d.view === 'carousel' && items.length > 1) carousel(root, grid, items.length);
    document.dispatchEvent(new Event('content:applied'));
  }

  function carousel(root, grid, n) {
    grid.tabIndex = 0; grid.setAttribute('role', 'group'); grid.setAttribute('aria-roledescription', 'carousel'); grid.setAttribute('aria-label', 'Testimonials');
    const mk = (txt, label) => { const b = node('button', '', txt); b.type = 'button'; b.setAttribute('aria-label', label); return b; };
    const prev = mk('‹', 'Previous testimonial'), next = mk('›', 'Next testimonial'), count = node('span', 'tcount');
    count.setAttribute('aria-live', 'polite');
    const nav = node('div', 'tnav'); nav.append(prev, count, next); root.appendChild(nav);
    const step = () => { const c = grid.querySelector('.tcard'); return c ? c.getBoundingClientRect().width + 20 : 300; };
    const update = () => {
      const i = Math.min(n - 1, Math.round(grid.scrollLeft / step()));
      count.textContent = (i + 1) + ' / ' + n;
      prev.disabled = grid.scrollLeft <= 2; next.disabled = grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 2;
    };
    prev.addEventListener('click', () => grid.scrollBy({ left: -step(), behavior: 'smooth' }));
    next.addEventListener('click', () => grid.scrollBy({ left: step(), behavior: 'smooth' }));
    let timer; grid.addEventListener('scroll', () => { clearTimeout(timer); timer = setTimeout(update, 60); }, { passive: true });
    grid.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); prev.click(); }
    });
    if ('ResizeObserver' in window) { observer = new ResizeObserver(update); observer.observe(grid); }
    update();
  }

  /* ---- state: published doc (or cache) wins over the older text format ---- */
  const state = { doc: null, legacy: null };
  const effective = () => clean(state.doc || legacyDoc(state.legacy));
  const save = () => { try { if (state.doc) localStorage.setItem(CACHE, JSON.stringify(state.doc)); else localStorage.removeItem(CACHE); } catch (e) { /* ignore */ } };

  window.testiApi = {
    get: effective, render, initials, driveUrl: drive,
    setDoc: raw => { state.doc = raw ? clean(raw) : null; save(); render(effective()); },
    setLegacy: l => { state.legacy = l; render(effective()); }
  };
  try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c) state.doc = clean(c); } catch (e) { /* ignore */ }
  render(effective());
})();
