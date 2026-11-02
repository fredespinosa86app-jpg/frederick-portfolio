/* ==========================================================================
   capacity.js - public side of the client-capacity switch (Phase 7).
   Public doc: content/capacity { enforce, open, msgOn, msg, updatedAt }
   `open` is computed by the owner panel from the REAL client records
   (active clients < maximum). The numbers themselves stay private.
   When closed: Hire Me buttons, the Contact section and its nav link are hidden, the
   #schedule page cannot be opened, and the Firestore rules refuse new inquiries.
   ========================================================================== */
(function () {
  'use strict';
  const CACHE = 'capState', DEFAULT_MSG = 'Currently at full client capacity. Please check back later for availability.';
  let st = { open: true, msgOn: false, msg: DEFAULT_MSG }, hireOn = true;
  const listeners = [];
  const clean = r => {
    r = r && typeof r === 'object' ? r : {};
    const msg = typeof r.msg === 'string' ? r.msg.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 160) : '';
    return { open: r.open !== false, msgOn: r.msgOn === true, msg: msg || DEFAULT_MSG };
  };
  try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c) st = clean(c); } catch (e) { /* optional */ }

  function apply() {
    const show = hireOn && st.open;
    document.querySelectorAll('.hire-cta').forEach(e => { e.hidden = !show; });
    const sec = document.getElementById('contact'); if (sec) sec.hidden = !show;
    document.querySelectorAll('a[href="#schedule"], a[href="#contact"]').forEach(a => { if (!a.closest('.hire-cta')) a.hidden = !show; });
    const m = document.getElementById('capMsg');
    if (m) { m.textContent = st.msg; m.hidden = st.open || !st.msgOn; }
    if (!st.open && location.hash === '#schedule') { history.replaceState(null, '', location.pathname + location.search + '#home'); window.dispatchEvent(new HashChangeEvent('hashchange')); }
    listeners.forEach(f => { try { f(st); } catch (e) { /* ignore */ } });
  }
  window.capacityApi = {
    DEFAULT_MSG,
    open: () => st.open,
    state: () => Object.assign({}, st),
    set(raw) { st = clean(raw); try { localStorage.setItem(CACHE, JSON.stringify(st)); } catch (e) { /* optional */ } apply(); },
    setHire(on) { hireOn = on !== false; apply(); },
    onChange(f) { listeners.push(f); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})();
