// Run: node --test scripts/core-navsearch.test.mjs   (Node 20+)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const N = createRequire(import.meta.url)('./core-navsearch.js');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const nav = html.slice(html.indexOf('<div class="dnav"'), html.indexOf('</aside>'));
const ITEMS = [...nav.matchAll(/data-page="([a-z0-9-]+)"[^>]*>.*?class="dlabel">([^<]*)</g)].map(m => ({ key: m[1], label: m[2].replace(/&amp;/g, '&') }));
test('the drawer has the expected entries (the test list is read from index.html)', () => { assert.ok(ITEMS.length >= 35, String(ITEMS.length)); assert.ok(ITEMS.some(i => i.key === 'privacy')); });
test('every drawer entry has hidden keywords or a clear label, and no keyword key is orphaned', () => {
  const keys = new Set(ITEMS.map(i => i.key)); for (const k of Object.keys(N.KEYWORDS)) assert.ok(keys.has(k), 'keyword key without a drawer entry: ' + k);
  for (const i of ITEMS) assert.ok(N.KEYWORDS[i.key] || i.label.length > 3, i.key);
});
test('empty or blank query matches every entry', () => { for (const q of ['', '   ', null, undefined]) assert.equal(N.match(q, ITEMS).length, ITEMS.length); });
test('finds by label, ignoring case and extra spaces', () => { assert.deepEqual(N.match('  PRIVACY ', ITEMS), ['privacy']); assert.ok(N.match('invoice', ITEMS).includes('invoices')); });
test('finds by hidden keywords the label does not contain', () => {
  assert.ok(N.match('retention', ITEMS).includes('privacy')); assert.ok(N.match('turnstile', ITEMS).includes('security')); assert.ok(N.match('budget', ITEMS).includes('security'));
  assert.ok(N.match('rejected', ITEMS).includes('surveys')); assert.ok(N.match('analytics', ITEMS).includes('visitors')); assert.ok(N.match('cloudflare', ITEMS).includes('domain'));
});
test('all words must match (AND), in any order', () => { assert.ok(N.match('privacy backup', ITEMS).includes('privacy')); assert.deepEqual(N.match('privacy zzzz', ITEMS), []); assert.ok(N.match('backup privacy', ITEMS).includes('privacy')); });
test('no match gives an empty list; special characters never throw or act as patterns', () => { for (const q of ['qqqq', '(', '[', '.*', '\\', '<script>', 'a'.repeat(500)]) assert.ok(Array.isArray(N.match(q, ITEMS)), q); assert.deepEqual(N.match('.*', ITEMS), []); });
test('accents are ignored', () => assert.deepEqual(N.match('priváçy', ITEMS), ['privacy']));
test('every entry can be found by typing its own label', () => { for (const i of ITEMS) assert.ok(N.match(i.label, ITEMS).includes(i.key), i.label); });
test('markup: label tied to the box, status line is polite, scripts load after the drawer, no inline handlers', () => {
  assert.match(html, /<label for="navSearch"/); assert.match(html, /id="navSearchMsg"[^>]*aria-live="polite"/);
  assert.ok(html.indexOf('core-navsearch.js') < html.indexOf('owner-navsearch.js')); assert.ok(html.indexOf('id="navSearch"') < html.indexOf('core-navsearch.js'));
  const seg = html.slice(html.indexOf('<div class="dsearch">'), html.indexOf('<div class="dnav"')); assert.doesNotMatch(seg, /\son[a-z]+=/i);
});
test('the owner script stores nothing and sends nothing', () => {
  const s = fs.readFileSync(new URL('./owner-navsearch.js', import.meta.url), 'utf8');
  for (const bad of ['localStorage', 'sessionStorage', 'fetch(', 'XMLHttpRequest', 'sendBeacon', 'innerHTML', 'eval(', 'document.cookie']) assert.ok(!s.includes(bad), bad);
});
test('R4 Owner Panel wiring: the retention select, the privacy sentence and the cleanup use the core functions', () => {
  const p = fs.readFileSync(new URL('./owner-privacy.js', import.meta.url), 'utf8'), n = fs.readFileSync(new URL('./privacy-notice.js', import.meta.url), 'utf8');
  assert.match(html, /<select id="rtSvRej">/); assert.match(html, /id="pvSvRej"/); assert.match(p, /svRejectedDue/); assert.match(p, /'ownerStatus', '==', 'rejected'/); assert.match(n, /pvSvRej/);
  assert.match(p, /'surveyInvitesPrivate', x\.id/); assert.match(p, /'surveyInvites', x\.id/);
  assert.doesNotMatch(p, /where\('decidedAt'/);   // no composite index needed
});
