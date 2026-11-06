/* ==========================================================================
   owner-s2.js - Security phase S2 (owner dashboard): S2-D monthly "m_ users" reminder and S2-C1 connection log.
   Nothing here deletes anything or sends anything anywhere. The reminder date lives in ownerPrivate/config (owner only, existing rule);
   the connection log lives in this browser's localStorage and records host names only.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, ACU = window.coreAuthCleanup, CL = window.coreConnLog;
  if (!kit || !ACU || !CL) return;
  const { el, notify } = kit, $ = id => document.getElementById(id), own = () => window.OWN, DAY = 864e5;
  const fmt = ms => new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  /* ---------------- S2-D: monthly cleanup reminder ---------------- */
  let priv = {};
  async function loadPriv() { try { const o = own(), s = await o.fs.getDoc(o.fs.doc(o.db, 'ownerPrivate', 'config')); priv = s.exists() ? (s.data() || {}) : {}; } catch (e) { /* the reminder just shows as due */ } }
  async function savePriv(patch) { const o = own(); Object.assign(priv, patch); try { await o.fs.setDoc(o.fs.doc(o.db, 'ownerPrivate', 'config'), Object.assign({ updatedAt: Date.now() }, patch), { merge: true }); return true; } catch (e) { notify('Could not save. Please sign in as the owner again.', 'error'); return false; } }
  const state = () => ({ lastAt: priv.authCleanupAt, snoozeUntil: priv.authSnoozeAt });
  function renderAuth() {
    const d = ACU.daysSince(priv.authCleanupAt, Date.now()), last = $('authLast'); if (!last) return;
    last.className = 'dstate-line ' + (ACU.due({ lastAt: priv.authCleanupAt }, Date.now()) ? 'warn' : 'ok');
    last.textContent = d == null ? 'No cleanup recorded yet.' : 'Last cleanup: ' + fmt(priv.authCleanupAt) + ' (' + d + ' day' + (d === 1 ? '' : 's') + ' ago). ' + (d >= ACU.EVERY_DAYS ? 'It is due now.' : 'Next reminder in ' + (ACU.EVERY_DAYS - d) + ' days.');
  }
  function maybeBanner() {
    const b = $('authBanner'); if (!b) return;
    if (!ACU.due(state(), Date.now())) { b.hidden = true; return; }
    const d = ACU.daysSince(priv.authCleanupAt, Date.now());
    $('authBannerTxt').textContent = d == null ? 'No cleanup has been recorded yet. Delete the form sign-in users (IDs starting with m_) in the Firebase Console, then record it here.' : 'The last cleanup was ' + d + ' days ago. Delete the form sign-in users (IDs starting with m_) in the Firebase Console, then record it here.';
    b.hidden = false;
  }
  const goSecurity = () => { const n = document.querySelector('.dnav [data-page="security"]'); if (n) n.click(); };
  if ($('authOpen')) {
    $('authOpen').addEventListener('click', async () => { $('authBanner').hidden = true; await savePriv({ authSnoozeAt: ACU.snoozeUntil(Date.now()) }); goSecurity(); });
    $('authLater').addEventListener('click', async () => { $('authBanner').hidden = true; await savePriv({ authSnoozeAt: ACU.snoozeUntil(Date.now()) }); });
    $('authDone').addEventListener('click', async () => {
      if (await savePriv({ authCleanupAt: Date.now(), authSnoozeAt: 0 })) { try { own().log('Auth user cleanup recorded'); } catch (e) { /* log is optional */ } renderAuth(); maybeBanner(); notify('Cleanup recorded. The next reminder comes in 30 days.', 'success'); }
    });
  }

  /* ---------------- S2-C1: connection log (host names only, this device only) ---------------- */
  let map = CL.parse((() => { try { return localStorage.getItem(CL.KEY) || ''; } catch (e) { return ''; } })()), obs = null, t = 0;
  const persist = () => { clearTimeout(t); t = setTimeout(() => { try { localStorage.setItem(CL.KEY, JSON.stringify(map)); } catch (e) { /* log stays in memory */ } }, 1200); };
  let gap = null;   // [signed-out time, signed-in-again time]: entries made in between are skipped when logging resumes
  const sight = e => { if (!CL.isConnect(e.initiatorType)) return; if (gap && gap[1] && e.startTime >= gap[0] && e.startTime <= gap[1]) return; const o = CL.origin(e.name, location.origin); if (o) { map = CL.record(map, o, Date.now()); persist(); } };
  function startLog() {
    if (obs || typeof PerformanceObserver === 'undefined') return;
    if (gap && !gap[1]) gap[1] = performance.now();
    try { performance.setResourceTimingBufferSize(1000); } catch (e) { /* default size */ }
    try { obs = new PerformanceObserver(l => { l.getEntries().forEach(sight); }); obs.observe({ type: 'resource', buffered: true }); } catch (e) { obs = null; }
  }
  const stopLog = () => { if (obs) { obs.takeRecords().forEach(sight); obs.disconnect(); obs = null; gap = [performance.now(), 0]; } };
  function renderLog() {
    const list = $('clList'); if (!list) return;
    if (obs) obs.takeRecords().forEach(sight);
    const R = CL.rows(map), unknown = R.filter(r => !r.known).length;
    list.replaceChildren(...(R.length ? R.map(r => el('div', { class: 'mrow' + (r.known ? '' : ' off') },
      el('span', { class: 'mthumb ph', 'aria-hidden': 'true' }, r.known ? '✓' : '?'),
      el('div', { class: 'mmain' }, el('strong', {}, r.host + (r.secure ? '' : '  (NOT https)')), el('small', {}, r.why + ' · seen ' + r.n + ' time' + (r.n === 1 ? '' : 's') + ', last ' + new Date(r.last).toLocaleString('en-US')))))
      : [el('p', { class: 'dstate' }, 'Nothing recorded yet. Use the site while signed in, then press Refresh.')]));
    $('clState').textContent = R.length ? R.length + ' host' + (R.length === 1 ? '' : 's') + ' recorded' + (unknown ? ', ' + unknown + ' not in the code scan (marked ?).' : ', all expected.') : '';
  }
  if ($('clRefresh')) {
    $('clRefresh').addEventListener('click', renderLog);
    $('clCopy').addEventListener('click', async () => { renderLog(); const txt = CL.asText(map); if (!txt) return notify('Nothing to copy yet.', 'info'); try { await navigator.clipboard.writeText(txt); notify('List copied. Paste it into the chat.', 'success'); } catch (e) { notify('Could not copy. Select the list on screen instead.', 'error'); } });
    $('clClear').addEventListener('click', () => { map = {}; try { localStorage.removeItem(CL.KEY); } catch (e) { /* ignore */ } renderLog(); notify('Connection log cleared.'); });
  }

  document.addEventListener('dash:page', e => { const p = e.detail && e.detail.page ? e.detail.page : e.detail; if (p === 'security') { renderLog(); renderAuth(); } });
  document.addEventListener('own:auth', async e => {
    if (!(e.detail && e.detail.ok)) { priv = {}; stopLog(); const b = $('authBanner'); if (b) b.hidden = true; return; }
    startLog(); await loadPriv(); renderAuth(); maybeBanner();
  });
})();
