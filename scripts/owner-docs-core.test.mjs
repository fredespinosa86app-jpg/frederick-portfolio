import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const C = createRequire(import.meta.url)('./owner-docs-core.js');
const ok = (o) => C.cleanDoc(Object.assign({ title: 'Runbook', category: 'runbook', body: 'Step 1: open the panel.' }, o));

test('a normal document is accepted and trimmed', () => {
  const r = ok({ title: '  Roll   back  the switch ' }); assert.equal(r.ok, true); assert.equal(r.doc.title, 'Roll back the switch');
});
test('title and category are required, with limits', () => {
  assert.equal(ok({ title: '' }).ok, false); assert.equal(ok({ title: '   ' }).ok, false);
  assert.equal(ok({ title: 'x'.repeat(121) }).ok, false); assert.equal(ok({ title: 'x'.repeat(120) }).ok, true);
  assert.equal(ok({ category: 'admin' }).ok, false); assert.equal(ok({ category: undefined }).ok, false);
  for (const c of C.CATEGORIES) assert.equal(ok({ category: c }).ok, true);
});
test('body limit is 50000 characters; empty body is allowed', () => {
  assert.equal(ok({ body: 'x'.repeat(50000) }).ok, true); assert.equal(ok({ body: 'x'.repeat(50001) }).ok, false); assert.equal(ok({ body: '' }).ok, true);
});
test('control characters are removed and line endings normalised', () => {
  const r = ok({ body: 'a\u0000b\r\nc\rd\u0007' }); assert.equal(r.doc.body, 'ab\nc\nd');
});
test('obvious secrets are refused in the title and in the body', () => {
  const bad = [
    '-----BEGIN PRIVATE KEY-----\nMIIE', 'AIza' + 'a'.repeat(35), 'https://hooks.slack.com/services/T0/B0/xyz',
    'https://example.com/webhook/abc', 'ghp_' + 'A1'.repeat(15), 'xoxb-1234567890-abcdef', 'sk-' + 'a1'.repeat(15),
    'Qx7Lm2Rt9Vb4Nc8Zd3Kp6Hs1Wf5Jg0Ya', 'aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5', 'Qx7Lm2Rt-9Vb4Nc8_Zd3Kp6Hs1Wf5Jg0Yaaa',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk', 'password: Abcd1234Efgh5678Ijkl', 'api_key=abcdEFGH12345678ijkl'
  ];
  for (const t of bad) { assert.equal(ok({ body: t }).ok, false, t); assert.equal(ok({ title: t }).ok, false, 'title ' + t); }
});
test('normal technical wording is not flagged', () => {
  for (const t of ['Set the secret SA_JSON in Cloudflare.', 'The token: see the Cloudflare dashboard.', 'password: ask the owner', 'Open https://github.com/user/repo/settings', 'Rotate the key every year.', 'commit 3f786850e387550fdab836ed7e6dc881de23001b', 'sha256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'https://github.com/fredespinosa86app-jpg/frederick-portfolio/blob/main/scripts/owner-docs-core.js', 'CodeFlow-Portfolio-4.5.0-D1-rollback.zip', 'Firestore rules emulator workflow'])
    assert.equal(ok({ body: t }).ok, true, t);
});
test('new ids match the rules pattern and differ', () => {
  const a = C.newId(), b = C.newId(); assert.match(a, C.ID_RE); assert.match(b, C.ID_RE); assert.notEqual(a, b);
});
test('filter by search text and category', () => {
  const rows = [{ title: 'Rollback', category: 'runbook', body: 'switch off' }, { title: 'Notes', category: 'notes', body: 'Safari' }];
  assert.equal(C.filterDocs(rows, 'safari', 'all').length, 1); assert.equal(C.filterDocs(rows, '', 'runbook').length, 1);
  assert.equal(C.filterDocs(rows, 'ROLL', '').length, 1); assert.equal(C.filterDocs(rows, 'zzz', 'all').length, 0); assert.equal(C.filterDocs(null, '', '').length, 0);
});
