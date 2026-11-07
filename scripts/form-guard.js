/* ==========================================================================
   form-guard.js - visitor side of the Meeting Request protection (CodeFlow 4.5.0, Project F / F6).
   Flow: status -> challenge (six-digit code shown to the visitor) -> verify (Worker signs a Firebase custom token)
         -> sign in on a SEPARATE Firebase app (in-memory, so an owner session on this site is never replaced)
         -> read today's counter -> ONE batch: the request (document ID = the token's uid) + the counter with an explicit count + 1.
   Safe to retry: the document ID is the token's uid, so a retry can never create a second request; before reporting a failure the module
   reads the visitor's own request back (a lost acknowledgement is reported as success).
   The six-digit code is shown to the page, so a script can read it: it is a speed bump, not a CAPTCHA. The real limits are the Worker's
   per-visitor throttles, the single-use token and the daily cap in the Firestore rules.
   Runs in the browser (window.formGuard) and in Node (module.exports) so the flow is unit-tested with a fake Worker and fake Firebase.
   No secret is stored here: the Worker address is public.
   ========================================================================== */
(function (root) {
  'use strict';
  /* SE-E3: the Firebase SDK is served from this site (assets/vendor/firebase/<version>/), found from this script's own address; no query string (the vendored files import each other without one) */
  const SDK_DIR = 'assets/vendor/firebase/10.12.2/';
  const SDK = (function () { try { const d = root.document; const s = d && d.currentScript && d.currentScript.src; if (s) return new URL('../' + SDK_DIR, s).href; if (d && d.baseURI) return new URL(SDK_DIR, d.baseURI).href; } catch (e) { } return './' + SDK_DIR; })();
  const MAX_CHALLENGES = 3, MAX_WRITES = 3, FETCH_MS = 8000, WRITE_MS = 15000;
  const G = { fb: null, sdk: null, handle: null, fetch: null, now: () => Date.now(), sleep: ms => new Promise(r => setTimeout(r, ms)), api: '', cfg: null, search: '' };

  /* every message the visitor can see, in one place (plain language, no codes) */
  const MSG = {
    paused: 'Meeting requests are paused for a short time. Please try again later, or email me instead.',
    full: 'Today’s request limit has been reached. Please try again tomorrow, or email me instead.',
    slow: 'Too many attempts from your connection. Please wait a few minutes, or email me instead.',
    wrong: 'That code does not match. Check the digits and try again.',
    expired: 'The code expired. A new code is shown below.',
    cancelled: 'Request not sent.',
    offline: 'You seem to be offline. Please check your connection and press Send again, or email me instead.',
    unreachable: 'The safety check could not be reached right now. Please try again in a moment, or email me instead.',
    session: 'The safety check expired before your request was sent. Please press Send again.',
    failed: 'Sorry, your request could not be sent. The time may have just been taken, or the connection failed. You can email me instead.',
    config: 'The safety check is not available right now. Please email me instead.',
    tsfail: 'The safety check did not pass. Please try again, or use the code instead.',
    tsnote: 'The automatic check is not available, so please use the six-digit code instead.'
  };
  /* SE-E6: public Turnstile site key shape (the secret never appears in this site) */
  const TS_KEY_RE = /^0x4[A-Za-z0-9_-]{10,60}$/;

  const withTimeout = (p, ms, tag) => Promise.race([p, new Promise((_, j) => setTimeout(() => j(Object.assign(new Error('timeout'), { code: tag || 'timeout' })), ms))]);
  const fail = (code, extra) => Object.assign({ ok: false, code, message: MSG[code] || MSG.failed }, extra || {});
  const isNet = e => !!e && (e.code === 'unavailable' || e.code === 'timeout' || e.code === 'network' || e.name === 'TypeError' || /network|offline|fetch|timeout/i.test(String(e.message || '')));

  async function call(path, method, body) {
    const f = G.fetch || root.fetch.bind(root);
    const r = await withTimeout(f(G.api + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'omit', cache: 'no-store' }), FETCH_MS, 'timeout');
    let j = null; try { j = await r.json(); } catch (e) { /* no body */ }
    return { status: r.status, ok: r.ok, json: j || {} };
  }
  const apiBase = () => String(G.api || '').replace(/\/+$/, '');
  const useVerifyFlag = () => /(?:^|[?&])verify=1(?:&|#|$)/.test(G.search || (root.location && root.location.search) || '');

  /* Decide which path this send uses. Returns {token: bool, status: obj|null}.
     token path when the owner's switch (content/guard.tokenRequired) is on, or when the address has ?verify=1 (owner test before the switch-over).
     Otherwise the old direct path, unchanged. If the Worker cannot be reached and the switch state is unknown, the old path is tried
     (the rules decide; a refusal shows the normal failure message with the email fallback). */
  async function decide() {
    G.api = G.api || apiBase();
    const verify = useVerifyFlag();
    if (!G.api) return { token: verify, status: null, error: verify ? 'config' : null };
    try {
      const r = await call('/v1/status', 'GET');
      if (r.ok && r.json && r.json.ok) return { token: !!r.json.tokenRequired || verify, status: r.json };
      return { token: verify, status: null, error: verify ? 'unreachable' : null };
    } catch (e) { return { token: verify, status: null, error: verify ? (isNet(e) && root.navigator && root.navigator.onLine === false ? 'offline' : 'unreachable') : null }; }
  }

  async function sdk() {
    if (G.fb) return G.fb;
    if (G.sdk) return G.sdk;
    G.sdk = (async () => {
      const [app, auth, fs] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
      return { initializeApp: app.initializeApp, getApps: app.getApps, initializeAuth: auth.initializeAuth, inMemoryPersistence: auth.inMemoryPersistence, signInWithCustomToken: auth.signInWithCustomToken, signOut: auth.signOut,
        getFirestore: fs.getFirestore, doc: fs.doc, getDoc: fs.getDoc, writeBatch: fs.writeBatch, serverTimestamp: fs.serverTimestamp };
    })();
    return G.sdk;
  }
  /* the visitor app is separate from the owner app, with in-memory sign-in: a visitor token can never replace an owner session */
  async function visitorApp() {
    if (G.handle) return G.handle;
    const F = await sdk(); const cfg = G.cfg || (root.portfolioSettings && root.portfolioSettings.firebase);
    if (!cfg) throw Object.assign(new Error('no config'), { code: 'config' });
    const app = F.initializeApp(cfg, 'visitor'); if (root.coreAppCheck) await root.coreAppCheck.start(SDK, app, root.portfolioSettings);   /* SE-E1: before any other service */
    const auth = F.initializeAuth(app, { persistence: F.inMemoryPersistence });
    G.handle = { F, app, auth, db: F.getFirestore(app) }; return G.handle;
  }

  /* ui hooks supplied by the page:
       ui.askCode({ code, left, error, fresh }) -> Promise<string | null | { expired: true }>   (null = the visitor cancelled)
       ui.progress(text)                                                                         (optional status line) */
  async function getToken(ui, status) {
    let challenges = 0, notice = '';
    /* SE-E6: Turnstile first when the Worker has it on, the site key is valid and the page can show it; any problem falls back to the six-digit code on the same challenge */
    const sk = root.portfolioSettings && root.portfolioSettings.turnstileSiteKey;
    let useTs = !!(status && status.turnstile === true && typeof sk === 'string' && TS_KEY_RE.test(sk) && ui && typeof ui.turnstile === 'function');
    while (challenges < MAX_CHALLENGES) {
      challenges++;
      let c;
      try { c = await call('/v1/challenge', 'POST'); } catch (e) { return fail(isNet(e) && root.navigator && root.navigator.onLine === false ? 'offline' : 'unreachable'); }
      if (c.status === 429) return fail('slow'); if (c.status === 503) return fail('paused'); if (c.status === 500) return fail('config');
      if (!c.ok || !c.json.challenge || !/^\d{6}$/.test(String(c.json.code || ''))) return fail('unreachable');
      let left = 3, error = notice; notice = '';
      for (;;) {
        if (useTs) {
          let r = null; try { r = await ui.turnstile({ siteKey: sk, action: 'meeting', error }); } catch (e) { r = { unavailable: true }; }
          if (r === null || r === undefined) return fail('cancelled');
          if (r.useCode || r.unavailable) { useTs = false; error = r.unavailable ? 'tsnote' : error; continue; }
          if (!r.token || typeof r.token !== 'string' || r.token.length > 2048) { useTs = false; error = 'tsnote'; continue; }
          let tv;
          try { tv = await call('/v1/verify', 'POST', { challenge: c.json.challenge, ts: r.token }); } catch (e) { return fail(isNet(e) && root.navigator && root.navigator.onLine === false ? 'offline' : 'unreachable'); }
          if (tv.status === 200 && tv.json.token && tv.json.uid) return { ok: true, token: tv.json.token, uid: tv.json.uid, day: tv.json.day, expiresInS: tv.json.expiresInS, issuedAt: G.now() };
          if (tv.status === 400 && tv.json.error === 'turnstile') { notice = 'tsfail'; break; }
          if (tv.status === 503 && tv.json.error === 'tsdown') { useTs = false; error = 'tsnote'; continue; }
          if (tv.status === 410) { notice = 'expired'; break; }
          if (tv.status === 429) return fail('slow');
          if (tv.status === 503) return fail('paused'); if (tv.status === 500) return fail('config');
          return fail('unreachable');
        }
        const ans = await ui.askCode({ code: c.json.code, left, error, fresh: challenges > 1 && !error, expiresInS: c.json.expiresInS });
        if (ans === null || ans === undefined) return fail('cancelled');
        if (ans && (ans.expired || ans.renew)) { notice = ans.renew ? '' : 'expired'; break; }
        let v;
        try { v = await call('/v1/verify', 'POST', { challenge: c.json.challenge, code: String(ans) }); } catch (e) { return fail(isNet(e) && root.navigator && root.navigator.onLine === false ? 'offline' : 'unreachable'); }
        if (v.status === 200 && v.json.token && v.json.uid) return { ok: true, token: v.json.token, uid: v.json.uid, day: v.json.day, expiresInS: v.json.expiresInS, issuedAt: G.now() };
        if (v.status === 401) { left = typeof v.json.left === 'number' ? v.json.left : left - 1; error = 'wrong'; if (left <= 0) { notice = 'wrong'; break; } continue; }
        if (v.status === 410) { notice = 'expired'; break; }
        if (v.status === 429) { if (v.json.error === 'tries') { notice = 'wrong'; break; } return fail('slow'); }
        if (v.status === 503) return fail('paused'); if (v.status === 500) return fail('config');
        return fail('unreachable');
      }
    }
    return fail('failed');
  }

  const dayOk = d => /^\d{8}$/.test(String(d || ''));
  async function writeRequest(h, tk, data, status) {
    const F = h.F, uid = tk.uid, day = tk.day, cap = status && Number(status.cap) > 0 ? Number(status.cap) : 30;
    const cref = F.doc(h.db, 'reqCounters', day), rref = F.doc(h.db, 'meetingRequests', uid);
    const ownExists = async () => { try { return (await F.getDoc(rref)).exists(); } catch (e) { return false; } };
    let lastErr = null;
    for (let attempt = 0; attempt < MAX_WRITES; attempt++) {
      let cur = 0;
      try { const s = await withTimeout(F.getDoc(cref), WRITE_MS, 'timeout'); cur = s.exists() ? Number(s.data().count) || 0 : 0; }
      catch (e) { lastErr = e; if (isNet(e)) { if (await ownExists()) return { ok: true }; return fail(root.navigator && root.navigator.onLine === false ? 'offline' : 'unreachable'); } return fail('failed'); }
      if (cur >= cap) return fail('full');
      try {
        const b = F.writeBatch(h.db);
        b.set(rref, Object.assign({}, data, { status: 'new', day, createdAt: F.serverTimestamp() }));
        b.set(cref, { count: cur + 1, lastReq: uid });
        await withTimeout(b.commit(), WRITE_MS, 'timeout'); return { ok: true };
      } catch (e) {
        lastErr = e;
        if (await ownExists()) return { ok: true };                    /* the write landed, only the acknowledgement was lost */
        if (isNet(e)) return fail(root.navigator && root.navigator.onLine === false ? 'offline' : 'unreachable');
        if (e && e.code === 'permission-denied' && attempt < MAX_WRITES - 1) { await G.sleep(150 + Math.floor(Math.random() * 450)); continue; }   /* another visitor bumped the counter first: re-read and try again */
        break;
      }
    }
    /* final diagnosis for the visitor: full, paused or a plain failure */
    try { const s = await F.getDoc(cref); if (s.exists() && Number(s.data().count) >= cap) return fail('full'); } catch (e) { /* ignore */ }
    try { const r = await call('/v1/status', 'GET'); if (r.ok && r.json.paused) return fail('paused'); } catch (e) { /* ignore */ }
    return fail('failed', { detail: lastErr && lastErr.code });
  }

  /* data = the same object the old path sends (name, email, company, date, time, tz, platform, message, optional service fields) */
  async function submit(data, ui, status) {
    const t = await getToken(ui, status); if (!t.ok) return t;
    if (!dayOk(t.day)) return fail('config');
    let h;
    try { h = await visitorApp(); } catch (e) { return fail('config'); }
    try { const cred = await withTimeout(h.F.signInWithCustomToken(h.auth, t.token), FETCH_MS, 'timeout'); const u = cred && cred.user && cred.user.uid; if (u !== t.uid) return fail('failed', { detail: 'uid-mismatch' }); }
    catch (e) {
      const code = e && e.code ? String(e.code) : 'unknown';
      if (root.console && root.console.warn) root.console.warn('formGuard: sign-in refused (' + code + ')');   /* an error code only, never the token */
      if (isNet(e)) return fail(root.navigator && root.navigator.onLine === false ? 'offline' : 'unreachable', { detail: code });
      /* "session expired" only when the pass really is old (the Worker's pass lives 10 minutes); any other refusal is a setup problem, not something the visitor can fix by retrying */
      const age = G.now() - (t.issuedAt || G.now());
      return fail(age > 540000 ? 'session' : 'config', { detail: code });
    }
    const r = await writeRequest(h, t, data, status);
    try { await h.F.signOut(h.auth); } catch (e) { /* the token is single-use anyway */ }
    return r;
  }

  /* an email draft with what the visitor typed, for every failure (never silently drop a visitor) */
  function mailtoFor(address, d) {
    const lines = ['Name: ' + (d.name || ''), 'Email: ' + (d.email || ''), d.company ? 'Company: ' + d.company : '', (d.date && d.time) ? 'Preferred time: ' + d.date + ' ' + d.time + ' (' + (d.tz || '') + ')' : '', d.platform ? 'Platform: ' + d.platform : '', '', String(d.message || '').slice(0, 1200)].filter((x, i) => x !== '' || i === 5);
    return 'mailto:' + address + '?subject=' + encodeURIComponent('Meeting request') + '&body=' + encodeURIComponent(lines.join('\n'));
  }

  const api = { MSG, decide, submit, mailtoFor, _G: G };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.formGuard = api; G.api = (root.portfolioSettings && root.portfolioSettings.formsApi) || ''; }
})(typeof window !== 'undefined' ? window : globalThis);
