/* SE-E1: App Check helper and guard tests (node --test scripts/app-check.test.mjs) */
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const AC = require('./app-check.js'); const dir = path.dirname(new URL(import.meta.url).pathname); const root = path.join(dir, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8'); const code = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const KEY = '6L' + 'a'.repeat(38);
const quiet = async fn => { const w = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = w; } };

test('plan: off for empty, missing, malformed or secret-shaped-wrong keys; on for a well-formed key', () => {
  for (const S of [undefined, null, {}, { appCheckSiteKey: '' }, { appCheckSiteKey: '   ' }, { appCheckSiteKey: 5 }, { appCheckSiteKey: KEY + '`' }, { appCheckSiteKey: '6L' + 'a'.repeat(37) }, { appCheckSiteKey: '6L' + 'a'.repeat(39) }, { appCheckSiteKey: 'XX' + 'a'.repeat(38) }, { appCheckSiteKey: '6L' + 'a b'.repeat(13).slice(0, 38) }])
    assert.equal(AC.plan(S).on, false, JSON.stringify(S));
  assert.equal(AC.plan({ appCheckSiteKey: KEY + '`' }).malformed, true); assert.equal(AC.plan({}).malformed, false);
  const p = AC.plan({ appCheckSiteKey: ' ' + KEY + ' ' }); assert.deepEqual([p.on, p.key, p.provider], [true, KEY, 'enterprise']);
});
test('plan: provider is enterprise unless exactly "v3"', () => {
  assert.equal(AC.plan({ appCheckSiteKey: KEY, appCheckProvider: 'v3' }).provider, 'v3');
  for (const v of [undefined, 'enterprise', 'V3', 'x', 3, {}]) assert.equal(AC.plan({ appCheckSiteKey: KEY, appCheckProvider: v }).provider, 'enterprise');
});
test('the real settings.js key is well-formed and is not left half-edited', () => {
  const m = rd('scripts/settings.js').match(/appCheckSiteKey:\s*"([^"]*)"/); assert.ok(m); assert.ok(m[1] === '' || AC.KEY_RE.test(m[1]), 'appCheckSiteKey must be empty or a 40-character 6L... key');
});
function fakeAC(log, opts = {}) {
  class E { constructor(k) { this.k = k; this.t = 'enterprise'; } } class V { constructor(k) { this.k = k; this.t = 'v3'; } }
  return { ReCaptchaEnterpriseProvider: E, ReCaptchaV3Provider: V, initializeAppCheck(app, o) { if (opts.throwInit) throw new Error('already'); log.push({ app, o }); } };
}
test('start: no key means no import and no init', async () => {
  let loads = 0; const r = await AC.start('B/', {}, {}, async () => { loads++; return fakeAC([]); }); assert.equal(r, false); assert.equal(loads, 0);
});
test('start: key set loads firebase-app-check.js from the SDK folder and initialises with the right provider and auto-refresh', async () => {
  const log = []; let url = ''; const app = { name: 'x' };
  assert.equal(await AC.start('https://sdk/10.12.2/', app, { appCheckSiteKey: KEY }, async u => { url = u; return fakeAC(log); }), true);
  assert.equal(url, 'https://sdk/10.12.2/firebase-app-check.js'); assert.equal(log.length, 1); assert.equal(log[0].app, app); assert.equal(log[0].o.isTokenAutoRefreshEnabled, true); assert.deepEqual([log[0].o.provider.t, log[0].o.provider.k], ['enterprise', KEY]);
  const l2 = []; await AC.start('B/', app, { appCheckSiteKey: KEY, appCheckProvider: 'v3' }, async () => fakeAC(l2)); assert.equal(l2[0].o.provider.t, 'v3');
});
test('start never throws: a failed load or a second init resolves false', async () => {
  assert.equal(await quiet(() => AC.start('B/', {}, { appCheckSiteKey: KEY }, async () => { throw new Error('offline'); })), false);
  assert.equal(await quiet(() => AC.start('B/', {}, { appCheckSiteKey: KEY }, async () => fakeAC([], { throwInit: true }))), false);
  assert.equal(await quiet(() => AC.start('B/', {}, { appCheckSiteKey: KEY }, async () => ({}))), false);
});
test('GUARD: every script that creates a Firebase app starts App Check for it, before it uses any other service', () => {
  const found = fs.readdirSync(path.join(root, 'scripts')).filter(f => f.endsWith('.js') && !f.endsWith('.test.mjs')).filter(f => /initializeApp\(/.test(code(rd('scripts/' + f))));
  assert.deepEqual(found.sort(), ['form-guard.js', 'owner-panel.js', 'survey-page.js'], 'a new Firebase client must be added to this list AND start App Check, or enforcement will block it');
  const op = code(rd('scripts/owner-panel.js')), fg = code(rd('scripts/form-guard.js')), sp = code(rd('scripts/survey-page.js'));
  assert.ok(op.indexOf('initializeApp(FIREBASE_CONFIG)') < op.indexOf('coreAppCheck.start(B,app,S)') && op.indexOf('coreAppCheck.start(B,app,S)') < op.indexOf('getAuth(app)'));
  assert.ok(fg.indexOf("initializeApp(cfg, 'visitor')") < fg.indexOf('coreAppCheck.start(SDK, app,') && fg.indexOf('coreAppCheck.start(SDK, app,') < fg.indexOf('initializeAuth(app'));
  assert.ok(sp.indexOf('initializeApp(CFG)') < sp.indexOf('coreAppCheck.start(B, app,') && sp.indexOf('coreAppCheck.start(B, app,') < sp.indexOf('getFirestore(app)'));
});
test('GUARD: both pages load app-check.js after settings.js and before the scripts that use it', () => {
  const ix = rd('index.html'), sv = rd('survey.html'); const at = (h, s) => h.indexOf('scripts/' + s);
  assert.ok(at(ix, 'settings.js') < at(ix, 'app-check.js') && at(ix, 'app-check.js') < at(ix, 'form-guard.js') && at(ix, 'app-check.js') < at(ix, 'owner-panel.js'));
  assert.ok(at(sv, 'settings.js') < at(sv, 'app-check.js') && at(sv, 'app-check.js') < at(sv, 'survey-page.js'));
});
test('GUARD: the App Check hosts are on both pages (connect-src), reCAPTCHA scripts and frames are allowed, and nothing broad was added', () => {
  const pol = h => { const o = {}; for (const part of h.match(/Content-Security-Policy" content="([^"]*)"/)[1].split(';')) { const t = part.trim().split(/\s+/); if (t[0]) o[t[0]] = t.slice(1); } return o; };
  const ix = pol(rd('index.html')), sv = pol(rd('survey.html'));
  for (const P of [ix, sv]) { for (const h of AC.HOSTS) assert.ok(P['connect-src'].includes(h), h); assert.ok(P['script-src'].includes('https://www.google.com/recaptcha/') && P['script-src'].includes('https://www.gstatic.com/recaptcha/')); for (const d of Object.keys(P)) assert.ok(!P[d].some(s => s === '*' || s === 'https:' || s === 'http:' || s === 'data:' && d !== 'img-src'), d); assert.ok(!P['script-src'].includes("'unsafe-inline'") && !P['script-src'].includes("'unsafe-eval'")); }
  assert.deepEqual(sv['default-src'], ["'none'"]); assert.deepEqual(sv['frame-src'], ['https://www.google.com/recaptcha/', 'https://recaptcha.google.com/recaptcha/']);
  assert.ok(sv['connect-src'].every(h => h === 'https://firestore.googleapis.com' || AC.HOSTS.includes(h)), 'survey connect-src holds only Firestore and the App Check hosts'); assert.deepEqual(sv['form-action'], ["'none'"]); assert.deepEqual(sv['object-src'], ["'none'"]);
});
test('GUARD: the App Check module is imported only through the helper, from the same SDK folder as the other Firebase files', () => {
  assert.match(code(rd('scripts/app-check.js')), /base \+ 'firebase-app-check\.js'/);
  for (const f of ['owner-panel.js', 'form-guard.js', 'survey-page.js']) assert.ok(!/firebase-app-check/.test(code(rd('scripts/' + f))), f);
});
