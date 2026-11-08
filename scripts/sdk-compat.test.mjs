/* SDK-1: every Firebase function the site calls exists in the vendored SDK files. Run: node --test scripts/sdk-compat.test.mjs
   The names are READ FROM THE SITE'S OWN CODE (the import lists of owner-panel.js, the SDK list in form-guard.js, the survey page's fs.* calls,
   the App Check module), so a new call that the SDK lacks fails here. The exports are read from the vendored files themselves. */
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
import { VERSION } from '../tools/vendor-firebase.mjs';
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8'); const code = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const vdir = 'assets/vendor/firebase/' + VERSION + '/';
const exportsOf = f => { const t = rd(vdir + f), ms = [...t.matchAll(/export\s*\{/g)], m = ms[ms.length - 1]; assert.ok(m, f + ': no export clause'); const i = m.index, body = t.slice(i + m[0].length, t.indexOf('}', i));
  return new Set(body.split(',').map(s => s.trim()).filter(Boolean).map(s => (s.split(/\s+as\s+/)[1] || s).trim())); };
const EXP = Object.fromEntries(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js', 'firebase-app-check.js'].map(f => [f, exportsOf(f)]));
const listOf = (src, mod) => { const m = code(src).match(new RegExp('const\\s*\\{([^}]*)\\}\\s*=\\s*await import\\(B\\+\'' + mod.replace('.', '\\.') + '\'\\)')); assert.ok(m, 'import list for ' + mod + ' not found'); return m[1].split(',').map(s => s.trim()).filter(Boolean); };

const own = rd('scripts/owner-panel.js'), guard = code(rd('scripts/form-guard.js')), survey = code(rd('scripts/survey-page.js')), ac = code(rd('scripts/app-check.js'));
const NEED = {
  'firebase-app.js': [...listOf(own, 'firebase-app.js'), 'initializeApp', 'getApps'],
  'firebase-auth.js': [...listOf(own, 'firebase-auth.js'), 'initializeAuth', 'inMemoryPersistence', 'signInWithCustomToken'],
  'firebase-firestore.js': [...listOf(own, 'firebase-firestore.js'), 'getFirestore', 'doc', 'getDoc', 'writeBatch', 'serverTimestamp', ...[...survey.matchAll(/\bfs\.(\w+)/g)].map(m => m[1])],
  'firebase-app-check.js': [...[...ac.matchAll(/\bAC\.(\w+)/g)].map(m => m[1]), 'initializeAppCheck', 'ReCaptchaEnterpriseProvider', 'ReCaptchaV3Provider']
};
for (const k of Object.keys(NEED)) NEED[k] = [...new Set(NEED[k])];

test('the lists really were read from the code (guards against a silent empty list)', () => {
  assert.ok(NEED['firebase-auth.js'].length >= 10 && NEED['firebase-firestore.js'].length >= 20 && NEED['firebase-app.js'].length >= 2 && NEED['firebase-app-check.js'].length >= 3, JSON.stringify(Object.fromEntries(Object.entries(NEED).map(([k, v]) => [k, v.length]))));
  for (const n of ['signInWithPopup', 'GoogleAuthProvider', 'onAuthStateChanged', 'browserLocalPersistence']) assert.ok(NEED['firebase-auth.js'].includes(n), n);
  for (const n of ['runTransaction', 'writeBatch', 'getCountFromServer', 'increment', 'onSnapshot']) assert.ok(NEED['firebase-firestore.js'].includes(n), n);
});
for (const [file, names] of Object.entries(NEED)) test('every ' + file.replace('.js', '') + ' name the site uses is exported by the vendored SDK ' + VERSION + ' (' + names.length + ' names)', () => {
  const missing = names.filter(n => !EXP[file].has(n)); assert.deepEqual(missing, [], file + ' lacks: ' + missing.join(', '));
});
test('App Check is always started with a provider (12.17.0 no longer allows initializeAppCheck without one)', () => {
  const calls = [...ac.matchAll(/initializeAppCheck\s*\(([^;]*)\)/g)].map(m => m[1]); assert.ok(calls.length >= 1);
  for (const c of calls) assert.match(c, /provider\s*:/, 'initializeAppCheck(' + c + ')');
});
test('the Authentication referrer change (12.15.0) needs no code: no site code sets a referrer policy for SDK requests', () => {
  for (const f of ['scripts/owner-panel.js', 'scripts/form-guard.js', 'scripts/survey-page.js', 'scripts/app-check.js']) assert.ok(!/referrerPolicy|referrer-policy/i.test(code(rd(f))), f);
});
test('no site code still names the old SDK version', () => {
  for (const f of fs.readdirSync(path.join(root, 'scripts')).filter(f => f.endsWith('.js'))) assert.ok(!/firebase\/10\.12\.2/.test(rd('scripts/' + f)), f);
  for (const f of ['index.html', 'survey.html']) assert.ok(!/firebase\/10\.12\.2/.test(rd(f)), f);
});
test('the vendored SDK names no Google/Firebase address that the page policy does not already allow (only documentation text links are new)', () => {
  const all = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js', 'firebase-app-check.js'].map(f => rd(vdir + f)).join('\n');
  const hosts = new Set([...all.matchAll(/[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.(?:googleapis|google|gstatic|firebaseapp|web)\.(?:com|app)/g)].map(m => m[0]));
  const ix = rd('index.html'), csp = ix.match(/Content-Security-Policy" content="([^"]*)"/)[1];
  const TEXT_ONLY = new Set(['console.firebase.google.com', 'firebase.google.com']);          // inside the App Check debug-token message text, never fetched
  const OLD_UNUSED = new Set(['staging-identitytoolkit.sandbox.googleapis.com', 'test-identitytoolkit.sandbox.googleapis.com', 'securetoken.google.com']);   // also in 10.12.2: Google's own test endpoints (used only if an app is configured for them) and a token-issuer name, not fetched by this site
  for (const h of hosts) assert.ok(TEXT_ONLY.has(h) || OLD_UNUSED.has(h) || csp.includes(h) || /^(www\.)?google\.com$|^www\.gstatic\.com$|^apis\.google\.com$/.test(h), 'new address in the SDK: ' + h);
});
