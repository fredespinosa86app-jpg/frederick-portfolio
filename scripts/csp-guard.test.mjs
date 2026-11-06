// Run: node --test scripts/csp-guard.test.mjs   (Node 20+)
// Guards the page's Content-Security-Policy (phase S2-C2): the connection rule stays a short list of named hosts, and every address the code
// fetches is on it. A new fetch() in the code, or a wider rule, makes this test fail until someone looks at it on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const CSP = require('./core-csp.js'), CL = require('./core-connlog.js'), BK = require('./core-booking.js');
const dir = path.dirname(new URL(import.meta.url).pathname), root = path.join(dir, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const metas = [...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/g)];
const policy = CSP.parse(metas[0] ? metas[0][1] : '');
const connect = policy['connect-src'] || [];
const hostsOf = l => l.filter(s => s !== "'self'").map(s => s.replace(/^https:\/\//, ''));
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && !f.endsWith('.test.mjs')).map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')]);

test('there is exactly one CSP meta tag and it has a connect-src', () => { assert.equal(metas.length, 1); assert.ok(connect.length > 1); });
test("connect-src is 'self' plus named https hosts: no https:, http:, *, wildcards, ports or paths", () => {
  assert.equal(connect[0], "'self'"); assert.deepEqual(CSP.broad(connect), []);
  assert.ok(!connect.includes('https:') && !connect.includes('*') && !connect.some(s => s.includes('*')));
  assert.equal(new Set(connect).size, connect.length, 'a host is listed twice');
});
test('connect-src hosts are exactly the connection hosts of the code scan (nothing extra, nothing missing)', () => {
  const used = CL.EXPECTED.filter(e => !/only if enabled/i.test(e[1])).map(e => e[0]).sort();
  assert.deepEqual(hostsOf(connect).sort(), used);
});
test('every literal https address in a fetch() call is allowed by connect-src', () => {
  let n = 0;
  for (const [f, src] of files) for (const m of src.matchAll(/\bfetch\s*\(\s*(['"`])(https:\/\/[^'"`/?#]+)/g)) { n++; assert.ok(CSP.allows(policy, 'connect-src', m[2] + '/x', 'https://page.test'), f + ' fetches ' + m[2] + ' which the rule blocks'); }
  assert.ok(n >= 2, 'expected to find the known literal fetches (dns.google, youtube)');
});
test('every fetch() in the code is a known, reviewed call (a new one fails here until it is reviewed)', () => {
  /* argument text -> why it is safe under the rule */
  const KNOWN = new Map([
    ["location.pathname + '?clock=' + t0", 'same-origin clock check'],
    ['cfg.sheetsUrl', 'Apps Script address; owner-google.js URL_RE only accepts https://script.google.com/macros/s/.../exec'],
    ['url', 'gcFetch(): every caller passes https://www.googleapis.com/calendar/v3/...'],
    ['window.chatHook', 'chat webhook; chatbot.js hookAllowed() and the owner save check use core-csp'],
    ['G.fetch || root.fetch.bind(root)', 'form-guard: address is settings.formsApi']]);
  const seen = [];
  for (const [f, src] of files) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of code.matchAll(/(?<![\w.$])fetch\s*\(\s*([^,)]*?)\s*(?:[,)]|$)/gm)) {
      const arg = m[1]; if (/^(['"`])https:\/\//.test(arg)) continue;        // literal: covered by the previous test
      if (/^function\b/.test(arg) || arg === '') continue;
      seen.push(f + ': ' + arg); assert.ok(KNOWN.has(arg), 'unreviewed fetch in ' + f + ': fetch(' + arg + ')');
    }
    if (/\bfetch\.bind\(|\.fetch\.bind\(/.test(code)) seen.push(f + ': fetch.bind');
  }
  assert.ok(seen.length >= 4, seen.join('\n'));
});
test('the dynamic fetches stay inside the rule', () => {
  const g = fs.readFileSync(path.join(dir, 'owner-google.js'), 'utf8'); assert.ok(g.includes("URL_RE = /^https:\\/\\/script\\.google\\.com\\/macros\\/s\\/"));
  const p3 = fs.readFileSync(path.join(dir, 'owner-phase3.js'), 'utf8');
  for (const m of p3.matchAll(/gcFetch\(\s*(['"`])([^'"`]*)/g)) assert.ok(m[2].startsWith('https://www.googleapis.com/calendar/v3/'), 'gcFetch to ' + m[2]);
  assert.ok(!/fetch\(\s*'https:\/\/'\s*\+/.test(p3), 'the custom-domain check must not fetch an arbitrary address');
  const st = fs.readFileSync(path.join(dir, 'settings.js'), 'utf8').match(/formsApi:\s*"(https:\/\/[^"]+)"/);
  assert.ok(st && CSP.allows(policy, 'connect-src', st[1] + '/verify', 'https://page.test'), 'formsApi host must be in connect-src');
  const cb = fs.readFileSync(path.join(dir, 'chatbot.js'), 'utf8'); assert.match(cb, /window\.chatHook&&hookAllowed\(\)/);
});
test('no other way of opening a connection appears in the code', () => {
  for (const [f, src] of files) { const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); for (const w of ['XMLHttpRequest', 'sendBeacon', 'EventSource', 'WebSocket', 'importScripts', 'navigator.serviceWorker']) assert.ok(!code.includes(w), f + ' uses ' + w); }
});
test('App Check: if a site key is set in settings.js, its Google hosts must be on the rule', () => {
  const key = fs.readFileSync(path.join(dir, 'settings.js'), 'utf8').match(/appCheckSiteKey:\s*"([^"]*)"/);
  assert.ok(key, 'appCheckSiteKey not found in settings.js');
  if (key[1]) for (const h of ['https://www.google.com', 'https://recaptchaenterprise.googleapis.com', 'https://content-firebaseappcheck.googleapis.com']) assert.ok(connect.includes(h), 'App Check is on but connect-src lacks ' + h);
});
test('frame-src still allows every calendar provider host, and no frame-src is a bare scheme', () => {
  const fs2 = policy['frame-src']; for (const h of BK.CSP_HOSTS) assert.ok(fs2.includes(h), h); assert.ok(!fs2.some(s => /^[a-z]+:$/.test(s) || s === '*'));
});
test('the rest of the policy has not been loosened by this phase', () => {
  assert.deepEqual(policy['default-src'], ["'self'"]); assert.deepEqual(policy['object-src'], ["'none'"]); assert.deepEqual(policy['base-uri'], ["'self'"]); assert.deepEqual(policy['form-action'], ["'self'"]);
  assert.ok(!policy['script-src'].includes("'unsafe-inline'") && !policy['script-src'].includes("'unsafe-eval'") && !policy['script-src'].includes('https:'));
});
test('index.html has no duplicate element ids (a repeated id made the S2-C1 log write into the Clients page)', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]); const dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
  assert.deepEqual(dup, []);
});
