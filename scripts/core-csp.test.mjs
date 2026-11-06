// Run: node --test scripts/core-csp.test.mjs   (Node 20+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const C = createRequire(import.meta.url)('./core-csp.js');
const PAGE = 'https://fredespinosa86app-jpg.github.io';
const POLICY = "default-src 'self'; connect-src 'self' https://firestore.googleapis.com https://portfolio-forms.fredespinosa86-app.workers.dev; img-src 'self' data: https:; frame-src https://*.cal.com https://cal.com";

test('parse: directives, first one wins, case and spacing tolerated', () => {
  const p = C.parse("Default-Src 'self' ;  connect-src a b;connect-src c; ;");
  assert.deepEqual(p['default-src'], ["'self'"]); assert.deepEqual(p['connect-src'], ['a', 'b']);
  assert.deepEqual(C.parse(null), {}); assert.deepEqual(C.parse(''), {});
});
test('allows: named hosts, self, and nothing else', () => {
  const ok = u => C.allows(POLICY, 'connect-src', u, PAGE);
  assert.equal(ok('https://firestore.googleapis.com/v1/x?y=1'), true);
  assert.equal(ok('https://portfolio-forms.fredespinosa86-app.workers.dev/verify'), true);
  assert.equal(ok(PAGE + '/index.html'), true);
  for (const u of ['https://evil.example/x', 'https://firestore.googleapis.com.evil.example/x', 'https://evilfirestore.googleapis.com/x', 'https://sub.firestore.googleapis.com/x', 'http://firestore.googleapis.com/x',
    'https://firestore.googleapis.com:8443/x', 'https://workers.dev/x', 'https://x.workers.dev/x', 'javascript:alert(1)', 'data:text/plain,hi', 'not a url', '', null, undefined, 5])
    assert.equal(ok(u), false, String(u));
});
test('a bare https: source allows every https address (this is what the tightening removes)', () => {
  assert.equal(C.allows("connect-src 'self' https:", 'connect-src', 'https://evil.example/x', PAGE), true);
  assert.equal(C.allows(POLICY, 'img-src', 'https://anything.example/x.png', PAGE), true);
});
test('wildcard host sources: sub-domains only, never the bare parent when written *.x', () => {
  const ok = u => C.allows(POLICY, 'frame-src', u, PAGE);
  assert.equal(ok('https://app.cal.com/x'), true); assert.equal(ok('https://cal.com/x'), true); assert.equal(ok('https://evilcal.com/x'), false); assert.equal(ok('https://cal.com.evil.io/x'), false);
  assert.equal(C.allows("connect-src https://*.cal.com", 'connect-src', 'https://cal.com', PAGE), false);
});
test('missing directive falls back to default-src; none blocks; no policy at all allows', () => {
  assert.equal(C.allows("default-src 'self'", 'connect-src', 'https://evil.example', PAGE), false);
  assert.equal(C.allows("connect-src 'none'", 'connect-src', PAGE + '/x', PAGE), false);
  assert.equal(C.allows('', 'connect-src', 'https://evil.example', PAGE), true);
});
test('ports: explicit default port is the same as none; other ports need to be listed', () => {
  assert.equal(C.allows('connect-src https://a.test', 'connect-src', 'https://a.test:443/x', PAGE), true);
  assert.equal(C.allows('connect-src https://a.test:8443', 'connect-src', 'https://a.test:8443/x', PAGE), true);
  assert.equal(C.allows('connect-src https://a.test:8443', 'connect-src', 'https://a.test/x', PAGE), false);
});
test('broad: flags schemes, wildcards and anything that is not one named https host', () => {
  assert.deepEqual(C.broad(["'self'", 'https://a.test', 'https://b.test:8443']), []);
  assert.deepEqual(C.broad(['https:', 'http:', '*', 'wss:', 'data:', 'https://*.a.test', 'a.test', 'http://a.test', 'https://a.test/path/*']).length, 9);
});
test('allowsConnect without a page is closed (fails safe)', () => { assert.equal(C.allowsConnect('https://firestore.googleapis.com'), false); });
test('allowsImg without a page: data: and blob: pictures are fine, everything else is closed (fails safe)', () => {
  assert.equal(C.allowsImg('data:image/png;base64,AAAA'), true); assert.equal(C.allowsImg('blob:https://x.test/abc'), true);
  for (const u of ['https://i.ytimg.com/vi/x/hqdefault.jpg', 'assets/images/a.png', '', null, undefined]) assert.equal(C.allowsImg(u), false, String(u));
});
test('img-src / media-src style policy: named hosts, none, data and blob', () => {
  const P = "default-src 'self'; img-src 'self' data: blob: https://i.ytimg.com https://cdn.loom.com; media-src 'none'";
  const img = u => C.allows(P, 'img-src', u, PAGE);
  assert.equal(img('https://i.ytimg.com/vi/abc/hqdefault.jpg'), true); assert.equal(img('https://cdn.loom.com/sessions/thumbnails/x-with-play.gif'), true); assert.equal(img(PAGE + '/assets/a.webp'), true);
  for (const u of ['https://evil.example/x.png?d=secret', 'https://i.ytimg.com.evil.example/x.png', 'https://img.ytimg.com/x.png', 'http://i.ytimg.com/x.png', 'https://cdn.loom.com:444/x.gif']) assert.equal(img(u), false, u);
  assert.equal(C.allows(P, 'media-src', PAGE + '/a.mp3', PAGE), false); assert.equal(C.allows(P, 'media-src', 'https://i.ytimg.com/a.mp4', PAGE), false);
});
