/* ==========================================================================
   owner-security.js - Owner Panel > Security (Security Phase S1)
   - shows the account ID the Firestore rules can be locked to
   - idle timeout (client side) + explicit "keep me signed in" choice + Sign out
   - Firebase console checklist, ticks saved privately in ownerPrivate/config.securityChecks
   The idle timeout runs in this browser only: it cannot revoke a Google sign-in token elsewhere.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit;
  if (!kit) return;
  const $ = id => document.getElementById(id), own = () => window.OWN;
  const notify = (m, t) => window.dashNotify ? window.dashNotify(m, t) : 0;
  const CHECKS = [
    ['signin', 'Only Google sign-in is turned on', 'Firebase console > Authentication > Sign-in method: Google enabled, every other provider disabled (no Anonymous, no Email/Password).'],
    ['domains', 'Authorised domains are only your own', 'Authentication > Settings > Authorised domains: keep localhost only while testing; remove anything you do not own.'],
    ['apikey', 'Web API key is restricted to your site', 'Google Cloud console > APIs & Services > Credentials > your browser key > Websites: add only your site address and the firebaseapp.com address.'],
    ['rules', 'Published rules match the file in this project', 'Firestore Database > Rules: the published text equals firestore.rules (Security S1 version), then press Publish.'],
    ['budget', 'Budget alert is set', 'Google Cloud console > Billing > Budgets & alerts: a low alert (for example 1 USD) so any surprise charge is noticed. The project stays on the free plan.']
  ];
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
  let idleMin = parseInt(lsGet('ownerIdleMin', '30'), 10);
  if (![15, 30, 60, 120].includes(idleMin)) idleMin = 30;
  let last = Date.now(), warned = false, timer = 0, active = false, checks = {};

  function state(t) { const s = $('secState'); if (s) s.textContent = t || ''; }
  function stop() { active = false; clearInterval(timer); timer = 0; }
  function doOut(msg) { stop(); const o = own(); if (o && o.session) o.session.signOut(); if (msg) notify(msg, 'success'); }
  function tick() {
    if (!active) return;
    const idle = Date.now() - last, lim = idleMin * 60000;
    if (idle >= lim) { doOut('Signed out after ' + idleMin + ' minutes of inactivity.'); return; }
    if (!warned && idle >= lim - 60000) { warned = true; notify('You will be signed out in about a minute. Move the mouse or press a key to stay signed in.', 'error'); }
  }
  function touch() { last = Date.now(); warned = false; }
  ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(ev => document.addEventListener(ev, () => { if (active) touch(); }, { passive: true, capture: true }));

  function renderList() {
    const ul = $('secList'); if (!ul) return; ul.textContent = '';
    CHECKS.forEach(c => {
      const li = document.createElement('li'), lb = document.createElement('label'), cb = document.createElement('input'), sp = document.createElement('span'), sm = document.createElement('small');
      cb.type = 'checkbox'; cb.id = 'secChk_' + c[0]; cb.checked = !!checks[c[0]];
      sp.textContent = c[1]; sm.textContent = c[2]; sp.appendChild(sm);
      lb.appendChild(cb); lb.appendChild(sp); li.appendChild(lb); ul.appendChild(li);
      cb.addEventListener('change', async () => {
        checks[c[0]] = cb.checked; progress();
        try { const o = own(); await o.fs.setDoc(o.fs.doc(o.db, 'ownerPrivate', 'config'), { securityChecks: checks, updatedAt: Date.now() }, { merge: true }); }
        catch (e) { notify('Could not save the checklist.', 'error'); }
      });
    });
    progress();
  }
  function progress() { const n = CHECKS.filter(c => checks[c[0]]).length; const p = $('secProg'); if (p) p.textContent = n + ' of ' + CHECKS.length + ' checked.'; }

  function wire() {
    $('secIdle').value = String(idleMin);
    $('secIdle').addEventListener('change', e => { idleMin = parseInt(e.target.value, 10); lsSet('ownerIdleMin', String(idleMin)); touch(); state('Idle timeout set to ' + idleMin + ' minutes.'); });
    const k = $('secKeep'); k.checked = lsGet('ownerKeep', '0') === '1';
    k.addEventListener('change', async () => { lsSet('ownerKeep', k.checked ? '1' : '0'); const o = own(); if (o && o.session) await o.session.setKeep(k.checked); state(k.checked ? 'This device will stay signed in after the browser closes (until the idle timer or Sign out).' : 'Closing the browser will sign you out.'); });
    $('secOut').addEventListener('click', () => doOut());
    $('dSignOut').addEventListener('click', () => doOut());
    $('secCopy').addEventListener('click', async () => {
      const v = $('secUid').value; let ok = false;
      try { await navigator.clipboard.writeText(v); ok = true; } catch (e) { try { $('secUid').select(); ok = document.execCommand('copy'); } catch (e2) { } }
      state(ok ? 'Account ID copied.' : 'Could not copy automatically. Select the ID and copy it by hand.');
    });
  }
  wire();

  document.addEventListener('own:auth', async e => {
    const d = e.detail || {};
    if (!d.ok) { stop(); return; }
    $('secEmail').textContent = d.email; $('secProv').textContent = 'Google'; $('secUid').value = d.uid || '';
    touch(); active = true; clearInterval(timer); timer = setInterval(tick, 15000);
    try { const o = own(); const s = await o.fs.getDocs(o.fs.query(o.fs.collection(o.db, 'ownerPrivate'))); s.forEach(x => { if (x.id === 'config' && x.data().securityChecks) checks = x.data().securityChecks; }); } catch (err) { }
    renderList();
  });
  renderList();
})();
