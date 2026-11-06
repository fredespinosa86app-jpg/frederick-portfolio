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

/* ---- S2-C2 additions ---- */
test('media types are logged separately from connections', () => {
  for (const t of ['img', 'image', 'video', 'audio', 'track', 'css']) { assert.equal(C.isMedia(t), true, t); assert.equal(C.isConnect(t), false, t); }
  for (const t of ['fetch', 'script', 'link', 'iframe', 'font', undefined]) assert.equal(C.isMedia(t), false, String(t));
});
test('blockedKey: directive + origin only; paths, queries and tokens are cut off', () => {
  assert.equal(C.blockedKey({ effectiveDirective: 'connect-src', blockedURI: 'https://evil.example/steal?token=ABC#x' }, PAGE), 'connect-src https://evil.example');
  assert.equal(C.blockedKey({ violatedDirective: 'img-src https: data:', blockedURI: 'http://odd.test:81/a.png' }, PAGE), 'img-src http://odd.test:81');
  assert.equal(C.blockedKey({ effectiveDirective: 'script-src-elem', blockedURI: 'inline' }, PAGE), 'script-src-elem inline');
  assert.equal(C.blockedKey({ effectiveDirective: 'script-src', blockedURI: 'eval' }, PAGE), 'script-src eval');
  assert.equal(C.blockedKey({ effectiveDirective: 'img-src', blockedURI: 'data' }, PAGE), 'img-src data');
  assert.equal(C.blockedKey({ effectiveDirective: 'frame-src', blockedURI: 'weird-thing' }, PAGE), 'frame-src other');
});
test('blockedKey: refuses odd or hostile events', () => {
  for (const v of [null, undefined, 5, 'x', {}, { effectiveDirective: '', blockedURI: 'https://a.test' }, { effectiveDirective: 'CONNECT SRC;x', blockedURI: 'https://a.test' }, { effectiveDirective: 'connect-src', blockedURI: PAGE + '/own' }, { effectiveDirective: '<b>', blockedURI: 'inline' }])
    assert.equal(C.blockedKey(v, PAGE), null, JSON.stringify(v));
});
test('recordBlocked counts, caps at 60 and keeps the input unchanged; parseBlocked cleans stored data', () => {
  const a = {}; let m = C.recordBlocked(a, 'connect-src https://evil.example', 10); m = C.recordBlocked(m, 'connect-src https://evil.example', 20);
  assert.deepEqual(a, {}); assert.deepEqual(m['connect-src https://evil.example'], { n: 2, first: 10, last: 20 }); assert.deepEqual(C.recordBlocked(m, null, 30), m);
  let big = {}; for (let i = 0; i < 61; i++) big = C.recordBlocked(big, 'connect-src https://h' + i + '.test', 100 + i);
  assert.equal(Object.keys(big).length, 60); assert.equal(big['connect-src https://h0.test'], undefined);
  const p = C.parseBlocked(JSON.stringify({ 'connect-src https://ok.test': { n: 1 }, 'https://no-directive.test': { n: 1 }, 'x y z': { n: 1 }, 'script-src inline': { n: 3 }, 'connect-src https://p.test/path': { n: 1 } }));
  assert.deepEqual(Object.keys(p).sort(), ['connect-src https://ok.test', 'script-src inline']); assert.deepEqual(C.parseBlocked('bad'), {}); assert.deepEqual(C.parseBlocked('[1]'), {});
});
test('blockedRows and mediaRows: sorted by count, readable fields', () => {
  let b = {}; for (const [k, n] of [['img-src https://a.test', 1], ['connect-src https://b.test', 3], ['script-src inline', 2]]) for (let i = 0; i < n; i++) b = C.recordBlocked(b, k, 5 + i);
  assert.deepEqual(C.blockedRows(b).map(r => r.dir + ' ' + r.host), ['connect-src b.test', 'script-src inline', 'img-src a.test']);
  let m = {}; for (const [o, n] of [['https://img.test', 1], ['https://cdn.test', 4]]) for (let i = 0; i < n; i++) m = C.record(m, o, 10 + i);
  assert.deepEqual(C.mediaRows(m).map(r => r.host), ['cdn.test', 'img.test']);
});
test('asTextAll: three sections, hosts and counts only', () => {
  let c = C.record({}, 'https://dns.google', 1), m = C.record({}, 'https://cdn.test', 1), b = C.recordBlocked({}, 'connect-src https://evil.example', 1);
  const t = C.asTextAll({ connect: c, media: m, blocked: b });
  assert.match(t, /CONNECTIONS\ndns\.google {2}x1/); assert.match(t, /PICTURES AND MEDIA\ncdn\.test {2}x1/); assert.match(t, /BLOCKED BY THE RULE\nconnect-src {2}evil\.example {2}x1/);
  assert.ok(!/https?:\/\//.test(t)); assert.match(C.asTextAll({}), /CONNECTIONS\n\(none\)\n\nPICTURES AND MEDIA\n\(none\)\n\nBLOCKED BY THE RULE\n\(none\)/);
});
