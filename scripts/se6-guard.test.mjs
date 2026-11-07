// Run: node --test scripts/se6-guard.test.mjs   -- SE-E6 guards: Turnstile hosts/keys and the chatbot AI->scripted gate
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url); const dir = path.dirname(fileURLToPath(import.meta.url)), root = path.join(dir, '..');
const E = require('./chat-engine.js'); const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const csp = h => (h.match(/Content-Security-Policy" content="([^"]*)"/) || [])[1] || '';
const dirOf = (p, n) => (p.split(';').map(s => s.trim()).find(s => s.startsWith(n + ' ')) || '').split(/\s+/).slice(1);
const store = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m }; };

test('Turnstile host is in script-src and frame-src of index.html only, never in connect-src, never on other pages', () => {
  const p = csp(rd('index.html')); assert.ok(dirOf(p, 'script-src').includes('https://challenges.cloudflare.com')); assert.ok(dirOf(p, 'frame-src').includes('https://challenges.cloudflare.com'));
  assert.ok(!dirOf(p, 'connect-src').some(h => /cloudflare/.test(h)));
  for (const f of fs.readdirSync(root).filter(f => f.endsWith('.html') && f !== 'index.html')) assert.ok(!/challenges\.cloudflare\.com/.test(csp(rd(f))), f);
  assert.ok(dirOf(p, 'script-src').every(h => h !== '*' && !/^https:$/.test(h))); });
test('site key is the public shape; no Turnstile secret is anywhere in the site files', () => {
  const s = rd('scripts/settings.js'); const m = s.match(/turnstileSiteKey:\s*"([^"]*)"/); assert.ok(m && /^0x4[A-Za-z0-9_-]{10,60}$/.test(m[1]));
  for (const f of ['scripts/settings.js', 'scripts/form-guard.js', 'scripts/meeting-form.js', 'index.html', 'scripts/chatbot.js']) assert.ok(!/TURNSTILE_SECRET|0x4[A-Za-z0-9_-]{30,}/.test(rd(f)), f); });
test('the widget script is loaded only by meeting-form.js, from the one Cloudflare address, only on demand', () => {
  const m = rd('scripts/meeting-form.js'); assert.match(m, /https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);
  assert.ok(!/challenges\.cloudflare\.com/.test(rd('index.html').replace(/Content-Security-Policy[^>]*>/, '').replace(/<p><strong>Spam check[\s\S]*?<\/p>/, '')), 'no script tag for the widget in the page'); });
test('the privacy notice names Cloudflare Turnstile and the code fallback', () => { assert.match(rd('index.html'), /Cloudflare Turnstile check[\s\S]{0,400}six-digit code/); });
test('the page has the labelled widget area and the fallback and cancel buttons', () => { const h = rd('index.html'); for (const id of ['gTsBox', 'gTs', 'gTsCode', 'gTsCancel', 'gCodeBox']) assert.match(h, new RegExp('id="' + id + '"')); assert.match(h, /id="gMsg"[^>]*role="status"/); });

test('hook gate: 429 and 503 switch off at once, once, and persist for the visit', () => {
  for (const st of [429, 503]) { const s = store(), g = E.hookGate(s); assert.equal(g.isOff(), false); assert.equal(g.fail(st), true); assert.equal(g.isOff(), true); assert.equal(g.fail(st), false); assert.equal(s.m.get(E.GATE_KEY), '1'); assert.equal(E.hookGate(s).isOff(), true); } });
test('hook gate: other failures switch off after two in a row; a success resets the count', () => {
  const g = E.hookGate(store()); assert.equal(g.fail(0), false); assert.equal(g.isOff(), false); g.ok(); assert.equal(g.fail(500), false); assert.equal(g.fail(0), true); assert.equal(g.isOff(), true); });
test('hook gate: never switches back, success after off does not re-enable; broken storage is safe', () => {
  const g = E.hookGate(store()); g.fail(429); g.ok(); assert.equal(g.isOff(), true);
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } }; const h = E.hookGate(bad); assert.equal(h.isOff(), false); assert.equal(h.fail(429), true); assert.equal(h.isOff(), true);
  assert.equal(E.hookGate(null).fail(503), true); });
test('chatbot.js: no call to the webhook when the gate is off; one switch notice; 4xx/5xx status is passed to the gate', () => {
  const c = rd('scripts/chatbot.js'); assert.match(c, /window\.chatHook&&!GATE\.isOff\(\)&&hookAllowed\(\)/); assert.match(c, /throw \{status:r\.status\}/); assert.match(c, /switchNoted/); assert.match(c, /I’ve switched to quick answers\. For anything else, book a discovery call or email me\./); });
