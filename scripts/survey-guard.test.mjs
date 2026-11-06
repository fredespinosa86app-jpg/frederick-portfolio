// Run: node --test scripts/survey-guard.test.mjs   (Node 20+)
// Guards the employer survey page (SV1): its own strict CSP, no way to run employer-supplied text as markup, no network except Firestore,
// every element id the scripts use exists, and the page limits match the Firestore rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SV = require('./core-survey.js'), CSP = require('./core-csp.js');
const dir = path.dirname(new URL(import.meta.url).pathname), root = path.join(dir, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const page = rd('survey.html'), js = rd('scripts/survey-page.js'), own = rd('scripts/owner-surveys.js'), index = rd('index.html'), css = rd('styles/survey.css');
const rules = rd('firestore.rules.strict'), rulesT = rd('firestore.rules');
const cspText = (page.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || '';
const P = CSP.parse(cspText);

test('survey.html has exactly one CSP and it is as strict as designed', () => {
  assert.equal((page.match(/Content-Security-Policy/g) || []).length, 1);
  assert.deepEqual(P['default-src'], ["'none'"]);
  assert.deepEqual(P['script-src'], ["'self'", 'https://www.gstatic.com']);
  assert.deepEqual(P['connect-src'], ['https://firestore.googleapis.com']);
  assert.deepEqual(P['frame-src'], ["'none'"]); assert.deepEqual(P['form-action'], ["'none'"]); assert.deepEqual(P['base-uri'], ["'none'"]); assert.deepEqual(P['object-src'], ["'none'"]);
  assert.deepEqual(P['style-src'], ["'self'"]); assert.deepEqual(P['img-src'], ["'self'", 'data:']); assert.deepEqual(P['font-src'], ["'self'"]);
  assert.ok(!/unsafe-inline|unsafe-eval|\*|https:(?!\/)/.test(cspText.replace(/https:\/\//g, '')), 'no unsafe-inline, unsafe-eval, wildcard or bare https:');
});
test('survey.html is not indexable, sends no referrer, and is not in the sitemap', () => {
  assert.match(page, /<meta name="robots" content="[^"]*noindex[^"]*nofollow/); assert.match(page, /<meta name="referrer" content="no-referrer">/);
  assert.ok(!/survey/i.test(rd('sitemap.xml')));
  assert.match(page, /scripts\/frame-guard\.js/);
});
test('survey.html has no inline script, inline style, style attribute or event-handler attribute (the CSP would block them)', () => {
  assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(page)); assert.ok(!/<style[\s>]/i.test(page)); assert.ok(!/\sstyle=/i.test(page)); assert.ok(!/\son[a-z]+\s*=/i.test(page));
  for (const m of page.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) assert.ok(/^scripts\//.test(m[1]), 'external script ' + m[1]);
  for (const m of page.matchAll(/<link[^>]*href="([^"]+)"/g)) assert.ok(!/^(https?:)?\/\//.test(m[1]), 'external stylesheet ' + m[1]);
});
test('survey.html: element ids are unique, and every id the page script uses exists', () => {
  const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]); assert.equal(new Set(ids).size, ids.length, 'duplicate id');
  const used = new Set([...js.matchAll(/\$\('([A-Za-z0-9_]+)'\)/g)].map(m => m[1]));
  for (const m of js.matchAll(/\$\(('?)([^')]+)\1\)/g)) if (m[1]) used.add(m[2]);
  for (const id of used) assert.ok(ids.includes(id), 'missing id ' + id);
  for (const id of ['svLoading', 'svInvalid', 'svThanks', 'svForm', 'fComment', 'fBest', 'fVideo', 'fName', 'fRole', 'fCompany', 'fConsent', 'svSend']) assert.ok(ids.includes(id), id);
  for (const k of ['Rating', 'Comment', 'Best', 'Rec', 'Video', 'Name', 'Consent', 'Submit']) assert.ok(ids.includes('e' + k), 'e' + k);
});
test('survey-page.js never turns employer text into markup and never uses the network except the Firestore SDK', () => {
  for (const [n, s] of [['survey-page.js', js], ['owner-surveys.js', own]]) {
    const code = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const bad of [/\.innerHTML\s*=/, /\.outerHTML\s*=/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function/, /setTimeout\s*\(\s*['"`]/, /\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /importScripts/])
      assert.ok(!bad.test(code), n + ' uses ' + bad);
  }
  const imports = [...js.matchAll(/import\(([^)]*)\)/g)].map(m => m[1]); assert.ok(imports.length >= 2);
  for (const i of imports) assert.match(i, /^B \+ 'firebase-(app|firestore)\.js'$/);
  assert.match(js, /const B = 'https:\/\/www\.gstatic\.com\/firebasejs\/10\.12\.2\/'/);
  assert.match(rd('scripts/owner-panel.js'), /firebasejs\/10\.12\.2\//, 'SDK version must match the owner panel');
});
test('survey page keeps the key out of the network: it is read from the #fragment and removed after use; no key in any query string', () => {
  assert.match(js, /keyFromHash\(location\.hash\)/); assert.match(js, /history\.replaceState\(null, '', location\.pathname\)/);
  assert.ok(!/location\.search/.test(js)); assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(js), 'the key must not be stored');
});
test('survey page: only the fields the rules allow are written, and the batch holds exactly the response and the invite flip', () => {
  assert.equal((js.match(/b\.(set|update|delete)\(/g) || []).length, 3);   // response, extra answers (custom surveys only), invite flip
  assert.match(js, /if \(form\) b\.set\(fs\.doc\(db, 'surveyAnswers', key\), Object\.assign\(\{\}, ans\.data, \{ submittedAt: fs\.serverTimestamp\(\) \}\)\);/); assert.match(js, /b\.set\(respRef, Object\.assign\(\{\}, v\.data, \{ submittedAt: fs\.serverTimestamp\(\), ownerStatus: 'pending' \}\)\)/);
  assert.match(js, /b\.update\(invRef, \{ status: 'submitted', submittedAt: fs\.serverTimestamp\(\) \}\)/);
});
test('owner page: every id used by owner-surveys.js exists once in index.html; links to employer-supplied addresses are validated and safe', () => {
  const ids = [...index.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  for (const id of new Set([...own.matchAll(/\$\('([A-Za-z0-9_]+)'\)/g)].map(m => m[1]))) assert.equal(ids.filter(x => x === id).length, 1, 'id ' + id);
  assert.ok(ids.includes('dp-surveys') && ids.includes('surveyBadge'));
  assert.match(index, /data-page="surveys"/); assert.match(rd('scripts/owner-dashboard.js'), /surveys: 'Employer surveys'/);
  assert.match(own, /target: '_blank', rel: 'noopener noreferrer'/); assert.match(own, /SV\.parseVideoLink\(r\.videoUrl\)/); assert.match(own, /v\.ok && v\.url \? el\('p'/);
  assert.ok(!/href: r\./.test(own) && !/href: inv\./.test(own), 'never link straight to stored text');
});
test('owner page: an approved answer is added switched OFF and the section flag is not turned on', () => {
  assert.match(own, /SV\.testimonialFromResponse\(r, id\)/); assert.match(own, /enabled: base\.enabled === true/); assert.ok(!/enabled: true/.test(own));
});
test('the page limits equal the Firestore rules (strict and transition files)', () => {
  for (const r of [rules, rulesT]) {
    assert.ok(r.includes("svKey(k) { return k.matches('^[A-Za-z0-9]{32}$'); }")); assert.equal(SV.KEY_RE.source, '^[A-Za-z0-9]{32}$');
    assert.ok(r.includes('d.comment.size() >= 10 && d.comment.size() <= 700')); assert.equal(SV.LIM.comment[1], 700);
    assert.ok(r.includes('d.best is string && d.best.size() <= 500')); assert.equal(SV.LIM.best[1], 500);
    assert.ok(r.includes('d.displayName.size() > 0 && d.displayName.size() <= 80')); assert.equal(SV.LIM.name[1], 80);
    assert.ok(r.includes('d.displayRole is string && d.displayRole.size() <= 80')); assert.equal(SV.LIM.role[1], 80);
    assert.ok(r.includes('d.displayCompany is string && d.displayCompany.size() <= 100')); assert.equal(SV.LIM.company[1], 100);
    assert.ok(r.includes('d.employerName.size() > 0 && d.employerName.size() <= 100')); assert.equal(SV.LIM.employerName, 100);
    assert.ok(r.includes('v.size() <= 300')); assert.equal(SV.LIM.video, 300);
    assert.ok(r.includes("duration.value(61, 'd')")); assert.ok(SV.EXPIRY_DAYS < 61);
    assert.ok(r.includes("d.surveyVersion == 'default-1'")); assert.equal(SV.DEFAULT_SURVEY.version, 'default-1');
  }
  assert.equal(SV.LIM.comment[1], 700, 'a published testimonial holds 700 characters');
});
test('the two rules files carry identical survey rules', () => {
  const cut = r => r.slice(r.indexOf('// SV1 (4.5.0)'), r.indexOf('// end SV1')); assert.ok(cut(rules).length > 2000); assert.equal(cut(rules), cut(rulesT));
});
test('App Check: if a site key is ever set, the survey CSP must allow the reCAPTCHA hosts (otherwise employers could not answer)', () => {
  const key = (rd('scripts/settings.js').match(/appCheckSiteKey:\s*"([^"]*)"/) || [])[1];
  if (key) { assert.ok(P['script-src'].some(h => /google\.com\/recaptcha|gstatic\.com\/recaptcha/.test(h)) || P['script-src'].includes('https://www.google.com/recaptcha/'), 'add the App Check hosts to survey.html and initialise App Check in survey-page.js'); assert.match(js, /AppCheck|appCheck/i); }
});
test('survey styles use theme tokens and no external addresses', () => { assert.ok(!/https?:\/\//.test(css)); assert.ok(!/@import/.test(css)); });
test('SV2b: the employer page renders extra questions with textContent/createElement only, validates them again, and the owner page never uses innerHTML for survey text', () => {
  const code = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // comments may mention the word
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(code(js)), 'survey page');
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(code(own)), 'owner survey page');
  assert.match(js, /SV\.validateAnswers\(form\.questions, extra\)/); assert.match(js, /SV\.QKEYS\[i\]/);
  assert.match(js, /fs\.doc\(db, 'surveyForms', key\)/); assert.match(own, /Object\.assign\(SV\.formFrom\(tpl\), \{ createdAt: f\.serverTimestamp\(\) \}\)/);
  assert.match(own, /b\.delete\(f\.doc\(o\.db, 'surveyForms', inv\.key\)\)/); assert.match(own, /b\.delete\(f\.doc\(o\.db, 'surveyForms', x\.key\)\)/);
});
