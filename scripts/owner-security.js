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
    ['apikey', 'Web API key is restricted to your site', 'Google Cloud console > APIs & Services > Credentials > your browser key > Websites: add only your site address and the firebaseapp.com address. Under API restrictions the list must include Firebase App Check API (without it App Check is blocked).'],
    ['rules', 'Published rules match the file in this project', 'Firestore Database > Rules: the published text equals firestore.rules (Security S1 version), then press Publish.'],
    ['appcheck', 'App Check is registered and in monitoring mode', 'Firebase console > App Check > Apps: register this site with the reCAPTCHA Enterprise provider and the PUBLIC site key (the key is already in scripts/settings.js), watch the Firestore request graph for 7 days. Check that visits from the main page, the form and the survey page show as verified.'],
    ['enforce', 'App Check is enforced for Cloud Firestore', 'App Check > APIs > Cloud Firestore > Enforce, only after the graph shows your own visits as verified.'],
    ['sdk', 'Firebase SDK version reviewed (every 3 months)', 'The site serves its own copy of the Firebase SDK (assets/vendor/firebase). Every 3 months read the Firebase release notes for security fixes; if there is one, ask for an SDK update (tools/vendor-firebase.mjs).'],
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
  /* ---- abuse protection (Security S2) ---- */
  const LIMITS = [['visits', 'Visits recorded', 400], ['meetingRequests', 'Meeting requests', 10], ['chatUnanswered', 'Chatbot questions', 60]];
  let paused = false, flood = false;
  const sod = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  function drawGuard() { $('secGuard').textContent = paused ? 'Public submissions are PAUSED. Visitors cannot send anything until you resume.' : 'Public submissions are open.'; $('secPause').textContent = paused ? 'Resume public submissions' : 'Pause public submissions'; }
  async function loadGuard() { try { const o = own(); const s = await o.fs.getDocs(o.fs.query(o.fs.collection(o.db, 'content'))); paused = false; s.forEach(x => { if (x.id === 'guard' && x.data().pause === true) paused = true; }); } catch (e) { } drawGuard(); }
  async function checkFlood() {
    const o = own(); if (!o || !o.count) return; const tb = $('secFlood'); tb.textContent = ''; flood = false; let total = 0, failed = false;
    for (const [c, label, lim] of LIMITS) {
      let h = '?', d = '?';
      try { h = await o.count(c, Date.now() - 3600000); d = await o.count(c, sod()); total += d; if (h > lim) flood = true; } catch (e) { failed = true; }
      const tr = document.createElement('tr'); [label, h, d, lim].forEach((v, i) => { const t = document.createElement(i ? 'td' : 'th'); if (!i) t.scope = 'row'; t.textContent = String(v); tr.appendChild(t); });
      tb.appendChild(tr);
    }
    $('secFloodMsg').textContent = failed ? 'Could not read the counts right now. Try again in a moment.' : (flood ? 'WARNING: one count is far above normal. If you did not expect this, press Pause public submissions.' : 'Looks normal. About ' + total + ' of the 20,000 daily writes are visible here (other writes are not counted).');
    if (flood) notify('Unusually many public submissions in the last hour. See Security > Abuse protection.', 'error');
  }
  $('secCheck').addEventListener('click', () => { checkFlood(); loadGuard(); loadVf(); });
  $('secPause').addEventListener('click', async () => {
    const o = own(), want = !paused;
    try { await o.fs.setDoc(o.fs.doc(o.db, 'content', 'guard'), { pause: want, at: Date.now() }, { merge: true }); paused = want; drawGuard(); notify(want ? 'Public submissions paused.' : 'Public submissions resumed.', 'success'); }
    catch (e) { notify('Could not change the pause setting.', 'error'); }
  });
  /* ---- form verification (Project F / F6): daily limit, switch, today's count ---- */
  let vf = { cap: 30, on: false }, vfBusy = false;
  const utcDay = () => { const d = new Date(); return String(d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()); };
  function drawVf() {
    $('vfCap').value = String(vf.cap);
    $('vfState').textContent = vf.on ? 'Verification is ON: visitors must pass the code check. The old direct form is refused.' : 'Verification is OFF: the form works as before.';
    $('vfSwitch').textContent = vf.on ? 'Turn verification OFF (rollback)' : 'Turn verification ON';
  }
  async function loadVf() {
    const o = own(); if (!o) return;
    try { const s = await o.fs.getDoc(o.fs.doc(o.db, 'content', 'guard')); const d = s.exists() ? s.data() : {}; vf = { cap: Number.isInteger(d.cap) && d.cap >= 1 ? d.cap : 30, on: d.tokenRequired === true }; drawVf(); } catch (e) { $('vfState').textContent = 'Could not read the current setting. Try again in a moment.'; }
    try { const c = await o.fs.getDoc(o.fs.doc(o.db, 'reqCounters', utcDay())); const n = c.exists() ? Number(c.data().count) || 0 : 0; $('vfToday').textContent = 'Requests counted today (UTC day ' + utcDay() + '): ' + n + ' of ' + vf.cap + (n >= vf.cap ? '. The limit is reached: visitors see "try again tomorrow" until the UTC day changes.' : '.'); }
    catch (e) { $('vfToday').textContent = 'Could not read today\u2019s count.'; }
  }
  $('vfCapSave').addEventListener('click', async () => {
    const n = Number($('vfCap').value); const msg = $('vfCapMsg');
    if (!Number.isInteger(n) || n < 1 || n > 200) { msg.textContent = 'Enter a whole number from 1 to 200.'; return; }
    try { await own().fs.setDoc(own().fs.doc(own().db, 'content', 'guard'), { cap: n, at: Date.now() }, { merge: true }); vf.cap = n; drawVf(); msg.textContent = 'Daily limit saved: ' + n + '.'; notify('Daily limit saved.', 'success'); loadVf(); }
    catch (e) { msg.textContent = 'Could not save. Check that you are signed in as the owner.'; notify('Could not save the daily limit.', 'error'); }
  });
  $('vfSwitch').addEventListener('click', async () => {
    if (vfBusy) return; const want = !vf.on;
    const ask = want ? 'Turn verification ON?\n\nThe old direct form will be refused by the database. Only turn this on after you tested the form with ?verify=1 and the switch-over checklist says so.' : 'Turn verification OFF?\n\nThe old direct form works again.';
    if (!window.confirm(ask)) return;
    vfBusy = true;
    try { await own().fs.setDoc(own().fs.doc(own().db, 'content', 'guard'), { tokenRequired: want, at: Date.now() }, { merge: true }); vf.on = want; drawVf(); notify(want ? 'Verification is ON.' : 'Verification is OFF.', 'success'); }
    catch (e) { notify('Could not change the switch.', 'error'); } finally { vfBusy = false; }
  });
  let floodTimer = 0;
  document.addEventListener('dash:page', e => {
    const on = e.detail && (e.detail.page === 'security' || e.detail === 'security');
    clearInterval(floodTimer); if (on) { checkFlood(); loadGuard(); loadVf(); floodTimer = setInterval(checkFlood, 300000); }
  });
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
