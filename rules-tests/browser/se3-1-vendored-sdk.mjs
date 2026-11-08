// SE-E3: the REAL Firebase SDK files served from this site (assets/vendor/firebase/12.19.0/), under the real page CSP. No fakes for the SDK.
// Google addresses are blocked, so Firestore itself cannot answer: the proof is that the modules load, link to each other as ONE copy, start, and nothing asks Google for the SDK.
import { b, base, check, results, srv } from './w5-harness.mjs';

const KEY = 'Kq7Zr2Lm9Xc4Vb8Nt3Hy6Wd1Sf5Gj0Pa', V = '/assets/vendor/firebase/12.19.0/', FILES = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js', 'firebase-app-check.js'];
async function open(page, hash = '') {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } }); const reqs = [], fails = [];
  ctx.on('request', r => reqs.push(r.url())); ctx.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) fails.push(r.status() + ' ' + r.url()); });
  await ctx.route(/googleapis\.com|google\.com|gstatic\.com|workers\.dev|script\.google|dns\.google|youtube/, r => r.abort());
  const pg = await ctx.newPage(); const perr = []; pg.on('pageerror', e => perr.push(String(e)));
  await pg.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.effectiveDirective + ' ' + e.blockedURI)); });
  await pg.goto(base + page + hash); return { ctx, pg, reqs, perr, fails };
}
const count = (reqs, f) => reqs.filter(u => u.split('?')[0].endsWith(V + f)).length;

{ // A. employer survey page: real SDK + real App Check module, real CSP
  const r = await open('survey.html', '#k=' + KEY);
  await r.pg.waitForFunction(() => ['svInvalid', 'svForm', 'svThanks'].some(i => !document.getElementById(i).hidden), null, { timeout: 15000 });
  await r.pg.waitForTimeout(1500);
  check('A survey: the page ends on the neutral "not valid" page (Firestore unreachable here), not a crash', await r.pg.evaluate(() => !document.getElementById('svInvalid').hidden));
  for (const f of ['firebase-app.js', 'firebase-firestore.js', 'firebase-app-check.js']) check('A survey: ' + f + ' was loaded from this site exactly once', count(r.reqs, f) === 1, String(count(r.reqs, f)));
  check('A survey: firebase-auth.js is not loaded (the survey page never signs in)', count(r.reqs, 'firebase-auth.js') === 0);
  check('A survey: nothing asked gstatic.com for the SDK', !r.reqs.some(u => /gstatic\.com\/firebasejs/.test(u)), JSON.stringify(r.reqs.filter(u => /gstatic/.test(u))));
  check('A survey: no CSP violation for script or module loads and no missing SDK file', (await r.pg.evaluate(() => window.__csp.filter(x => /^(script|connect)/.test(x) && !/google|recaptcha/.test(x)))).length === 0 && r.fails.length === 0, JSON.stringify([await r.pg.evaluate(() => window.__csp), r.fails]));
  check('A survey: no page error', r.perr.length === 0, JSON.stringify(r.perr));
  // C. the real SDK works and is ONE shared copy: the page started the default app, a second import sees that same app
  const c = await r.pg.evaluate(async V => {
    const u = f => new URL(V.slice(1) + f, document.baseURI).href; const app = await import(u('firebase-app.js')), fs = await import(u('firebase-firestore.js')), au = await import(u('firebase-auth.js')), ac = await import(u('firebase-app-check.js'));
    const shared = app.getApps().length >= 1 && app.getApps()[0].options.projectId === window.portfolioSettings.firebase.projectId;
    const a2 = app.initializeApp({ apiKey: 'x', projectId: 'p', appId: '1:1:web:1' }, 'se3test'); const db = fs.getFirestore(a2);
    return { shared, ver: app.SDK_VERSION, path: fs.doc(db, 'a', 'b').path, auth: typeof au.getAuth(a2).signOut, popup: typeof au.signInWithPopup, ac: typeof ac.initializeAppCheck, prov: typeof ac.ReCaptchaEnterpriseProvider };
  }, V);
  check('C real SDK: version 12.19.0, Firestore document path works, Auth and App Check exports exist', c.ver === '12.19.0' && c.path === 'a/b' && c.auth === 'function' && c.popup === 'function' && c.ac === 'function' && c.prov === 'function', JSON.stringify(c));
  check('C real SDK: the page and a later import share ONE firebase-app.js (the page\'s default app is visible)', c.shared === true && count(r.reqs, 'firebase-app.js') === 1);
  await r.ctx.close();
}
{ // B. main page / Owner Panel / visitor form: real SDK modules, real CSP
  const r = await open('index.html');
  await r.pg.waitForFunction(() => document.readyState === 'complete', null, { timeout: 15000 }); await r.pg.waitForTimeout(3000);
  for (const f of ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js', 'firebase-app-check.js']) check('B main: ' + f + ' was loaded from this site exactly once', count(r.reqs, f) === 1, String(count(r.reqs, f)));
  check('B main: nothing asked gstatic.com for the SDK', !r.reqs.some(u => /gstatic\.com\/firebasejs/.test(u)));
  check('B main: no CSP violation for scripts (the SDK is same-origin) and no missing file', (await r.pg.evaluate(() => window.__csp.filter(x => /^script/.test(x) && !/google|recaptcha/.test(x)))).length === 0 && r.fails.filter(x => /vendor/.test(x)).length === 0, JSON.stringify([await r.pg.evaluate(() => window.__csp), r.fails]));
  check('B main: the page still renders (not blank) and the Owner Panel sign-in code started without an import error', await r.pg.evaluate(() => document.body.innerText.length > 200) && !r.perr.some(e => /import|module|firebase/i.test(e)), JSON.stringify(r.perr));
  const fg = await r.pg.evaluate(async V => { const s = document.querySelector('script[src*="form-guard"]').src; const out = []; for (const f of ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js']) { const res = await fetch(new URL('..' + V + f, s)); out.push(res.status + ' ' + (res.headers.get('content-type') || '')); } return out; }, V);
  check('B form: the folder the form guard computes from its own address holds the three files it needs (200, JavaScript)', fg.every(x => /^200 text\/javascript/.test(x)), JSON.stringify(fg));
  await r.ctx.close();
}
const bad = results.filter(x => !x[1]); console.log(bad.length ? 'FAILED ' + bad.length : 'ALL PASSED (' + results.length + ')');
srv.close(); await b.close(); process.exit(bad.length ? 1 : 0);
