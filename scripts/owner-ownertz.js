/* ==========================================================================
   owner-ownertz.js - Owner Panel > General > Time zone (CodeFlow 4.5.0, EN-1A). Owner only, private.
   The owner's DEFAULT time zone, saved in ownerPrefs/main (rules: "EN-1A"). Other scripts ask window.ownerTz:
     ownerTz.get()              the owner's default zone (Asia/Manila until one is saved)
     ownerTz.resolve(specific)  a project's own zone when it has a valid one, else the default
   and listen for the event "owner:tz" (detail = the new zone) to redraw. Nothing here changes data already saved by other projects.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, Z = window.coreOwnerTz; if (!kit || !Z) return;
  const { notify } = kit, $ = id => document.getElementById(id), own = () => window.OWN;
  let cur = Z.fromDoc(null), signed = false, busy = false, clockT = 0;
  const say = (id, msg) => { const n = $(id); if (n) n.textContent = msg || ''; };
  const errText = e => {
    const c = e && e.code;
    if (c === 'permission-denied') return 'The database refused this (permission denied). Publish the newest firestore.rules.strict, sign in again, then refresh this page.';
    if (c === 'unavailable' || /offline|network/i.test(String(e && e.message))) return 'No connection to the database, so nothing was saved. Check your internet and try again.';
    return 'Please refresh the page and try again.';
  };
  const publish = () => document.dispatchEvent(new CustomEvent('owner:tz', { detail: cur.tz }));
  window.ownerTz = { get: () => cur.tz, resolve: specific => Z.resolve(specific, cur.tz), saved: () => cur.saved, rev: () => cur.rev, prev: () => cur.prevTz };

  function drawNow() {
    const tz = ($('otzTz') && Z.isValid($('otzTz').value.trim())) ? $('otzTz').value.trim() : cur.tz, ms = Date.now();
    say('otzNow', (cur.saved ? 'Saved: ' : 'Not saved yet, using ') + cur.tz + '. ' + (tz !== cur.tz ? 'The zone typed above: ' + tz + ' is ' + Z.offsetLabel(tz, ms) + ', now ' + Z.clockText(tz, ms) + '.' : 'Now there: ' + Z.clockText(cur.tz, ms) + ' (' + Z.offsetLabel(cur.tz, ms) + ').') + (cur.prevTz ? ' Before the last change: ' + cur.prevTz + '.' : ''));
  }
  function draw() {
    if (!$('otzTz')) return;
    if (document.activeElement !== $('otzTz')) $('otzTz').value = cur.tz;
    const l = $('otzZoneList'); if (l && !l.children.length) { try { const z = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['Asia/Manila', 'UTC', 'Europe/London', 'America/New_York']; z.concat(['UTC']).forEach(n => { const o = document.createElement('option'); o.value = n; l.appendChild(o); }); } catch (e) { /* the box still accepts typing */ } }
    $('otzSave').disabled = busy; $('otzReset').disabled = busy; drawNow();
  }
  async function load() {
    const o = own(); if (!o || !o.fs) return;
    try { const f = o.fs, s = await f.getDoc(f.doc(o.db, 'ownerPrefs', 'main')); cur = Z.fromDoc(s.exists() ? s.data() : null); }
    catch (e) { cur = Z.fromDoc(null); say('otzErr', errText(e)); }
    draw(); publish();
  }
  async function save(raw) {
    say('otzErr', ''); const r = Z.check(raw); if (!r.ok) { say('otzErr', r.error); return; }
    if (cur.saved && r.tz === cur.tz) { say('otzErr', 'No change to save: this is already your time zone.'); return; }
    if (!navigator.onLine) { say('otzErr', 'You are offline. Nothing was saved.'); return; }
    const o = own(), f = o.fs; busy = true; draw();
    try {
      const d = Z.nextDoc(cur, r.tz);
      await f.setDoc(f.doc(o.db, 'ownerPrefs', 'main'), Object.assign({}, d, { updatedAt: f.serverTimestamp() }));
      await load(); notify('Time zone saved: ' + r.tz + '.', 'success');
    } catch (e) { say('otzErr', errText(e)); await load().catch(() => 0); }
    finally { busy = false; draw(); }
  }
  function init() {
    if ($('otzSave')) {
      $('otzSave').addEventListener('click', () => save($('otzTz').value));
      $('otzReset').addEventListener('click', () => { $('otzTz').value = Z.FALLBACK; save(Z.FALLBACK); });
      $('otzTz').addEventListener('input', drawNow);
    }
    document.addEventListener('own:auth', e => {
      if (!(e.detail && e.detail.ok)) { signed = false; cur = Z.fromDoc(null); clearInterval(clockT); clockT = 0; draw(); publish(); return; }
      signed = true; load(); clearInterval(clockT); clockT = setInterval(() => { if (!document.hidden && signed) drawNow(); }, 30000);
    });
    document.addEventListener('dash:page', e => { if (e.detail === 'general' && signed) load(); });
    draw();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
