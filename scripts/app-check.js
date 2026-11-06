/* ==========================================================================
   app-check.js - starts Firebase App Check for ONE Firebase app (CodeFlow 4.5.0, SE-E1 stage A: monitoring mode).
   Used by all three Firebase clients: the main page / Owner Panel (owner-panel.js), the visitor form app (form-guard.js) and the employer
   survey page (survey-page.js). Enforcement is a separate console step (Firebase console > App Check > Cloud Firestore), done only after a
   clean monitoring period; if one client did not send tokens, enforcement would block it.
   Active only when settings.js holds a well-formed PUBLIC reCAPTCHA site key. A failure never blocks the site (start() never throws).
   Runs in the browser (window.coreAppCheck) and in Node (module.exports) so the SAME code is unit-tested.
   ========================================================================== */
(function (root) {
  'use strict';
  const KEY_RE = /^6L[0-9A-Za-z_-]{38}$/;                 // shape of a reCAPTCHA key (site keys and secret keys look alike: only the SITE key belongs here)
  const HOSTS = ['https://www.google.com', 'https://recaptchaenterprise.googleapis.com', 'https://content-firebaseappcheck.googleapis.com'];
  /* settings -> { on, key, provider }. Off for an empty or malformed key. Provider: 'v3' only when asked for, otherwise 'enterprise'. */
  function plan(S) {
    const k = S && typeof S.appCheckSiteKey === 'string' ? S.appCheckSiteKey.trim() : '';
    if (!KEY_RE.test(k)) return { on: false, key: '', provider: 'enterprise', malformed: !!k };
    return { on: true, key: k, provider: S.appCheckProvider === 'v3' ? 'v3' : 'enterprise', malformed: false };
  }
  /* start App Check for `app`; `base` is the Firebase SDK folder URL; `imp` lets tests replace the module loader. Resolves true/false, never throws. */
  async function start(base, app, S, imp) {
    const p = plan(S);
    if (!p.on) { if (p.malformed) { try { console.warn('App Check is off: appCheckSiteKey in settings.js is not a valid reCAPTCHA key'); } catch (e) {} } return false; }
    try {
      const AC = await (imp || (u => import(u)))(base + 'firebase-app-check.js');
      const Prov = p.provider === 'v3' ? AC.ReCaptchaV3Provider : AC.ReCaptchaEnterpriseProvider;
      AC.initializeAppCheck(app, { provider: new Prov(p.key), isTokenAutoRefreshEnabled: true });
      return true;
    } catch (e) { try { console.warn('App Check could not start', e); } catch (e2) {} return false; }
  }
  const api = { KEY_RE, HOSTS, plan, start };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreAppCheck = api;
})(typeof window !== 'undefined' ? window : globalThis);
