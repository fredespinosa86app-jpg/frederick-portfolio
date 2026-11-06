// Run: node --test scripts/core-connlog.test.mjs   (Node 20+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const C = createRequire(import.meta.url)('./core-connlog.js');
const PAGE = 'https://fredespinosa86app-jpg.github.io';
test('origin: host only, never path or query; same-origin and non-http ignored', () => {
  assert.equal(C.origin('https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?gsessionid=SECRET&x=1', PAGE), 'https://firestore.googleapis.com');
  assert.equal(C.origin('https://fredespinosa86app-jpg.github.io/frederick-portfolio/index.html', PAGE), null);
  for (const u of ['data:text/plain,hi', 'blob:https://x/1', 'javascript:alert(1)', 'not a url', '', null, undefined, 5, 'chrome-extension://abc/x.js']) assert.equal(C.origin(u, PAGE), null, String(u));
  assert.equal(C.origin('http://insecure.test:8080/a', PAGE), 'http://insecure.test:8080');
});
test('which resource types count as connections', () => { for (const t of ['fetch', 'xmlhttprequest', 'beacon', 'other']) assert.equal(C.isConnect(t), true); for (const t of ['script', 'img', 'css', 'link', 'iframe', 'font', undefined]) assert.equal(C.isConnect(t), false); });
test('record counts sightings and keeps first/last times; the input is not changed', () => {
  const a = {}; const b = C.record(a, 'https://dns.google', 100); const c = C.record(b, 'https://dns.google', 200);
  assert.deepEqual(a, {}); assert.deepEqual(c['https://dns.google'], { n: 2, first: 100, last: 200 }); assert.deepEqual(C.record(c, null, 300), c);
});
test('cap of 60 hosts: the least recently seen is dropped, the new one is kept', () => {
  let m = {}; for (let i = 0; i < 60; i++) m = C.record(m, 'https://h' + i + '.test', 1000 + i);
  m = C.record(m, 'https://h0.test', 5000);                  // h0 seen again: now the freshest
  m = C.record(m, 'https://new.test', 6000);
  assert.equal(Object.keys(m).length, 60); assert.ok(m['https://new.test']); assert.ok(m['https://h0.test']); assert.equal(m['https://h1.test'], undefined);
});
test('parse: damaged or hostile stored data becomes an empty or cleaned list', () => {
  assert.deepEqual(C.parse('not json'), {}); assert.deepEqual(C.parse('null'), {}); assert.deepEqual(C.parse('[1,2]'), {});
  const m = C.parse(JSON.stringify({ 'https://ok.test': { n: 2, first: 1, last: 2 }, 'javascript:x': { n: 1 }, 'https://bad path.test/x': { n: 1 }, 'https://neg.test': { n: -1 }, 'https://nan.test': { n: 'x' }, 'https://p.test/path': { n: 1 } }));
  assert.deepEqual(Object.keys(m), ['https://ok.test']);
});
test('classify: known hosts explained, unknown flagged', () => {
  assert.equal(C.classify('https://firestore.googleapis.com').known, true); assert.equal(C.classify('https://portfolio-forms.fredespinosa86-app.workers.dev').known, true);
  assert.equal(C.classify('https://evil.example').known, false); assert.equal(C.classify('https://firestore.googleapis.com.evil.example').known, false);
});
test('rows are sorted by count; asText has hosts only and marks unknown / non-https', () => {
  let m = {}; for (const [o, n] of [['https://dns.google', 1], ['https://firestore.googleapis.com', 5], ['http://odd.test:81', 2], ['https://mystery.test', 3]]) for (let i = 0; i < n; i++) m = C.record(m, o, 10 + i);
  assert.deepEqual(C.rows(m).map(r => r.host), ['firestore.googleapis.com', 'mystery.test', 'odd.test:81', 'dns.google']);
  const t = C.asText(m); assert.match(t, /mystery\.test {2}x3 {2}\(unknown\)/); assert.match(t, /odd\.test:81 {2}x2 {2}\(unknown\) {2}\(NOT https\)/); assert.ok(!/https?:\/\//.test(t) && !/\?/.test(t));
});
test('expected list covers every host in the code scan', () => { for (const h of ['firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'script.google.com', 'dns.google', 'www.youtube.com']) assert.ok(C.EXPECTED.some(x => x[0] === h), h); });
