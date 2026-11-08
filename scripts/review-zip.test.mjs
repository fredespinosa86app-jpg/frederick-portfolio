// Run: node --test scripts/review-zip.test.mjs   -- the clean review ZIP builder refuses secrets and leaves out private material
import test from 'node:test'; import assert from 'node:assert/strict'; import { pick, scan, allowList, SKIP_PATH, FAKE } from '../tools/build-review-zip.mjs'; import { privateRoot, privateList } from '../tools/private-docs.mjs'; import path0 from 'node:path';
const files = pick(), allow = allowList();
test('the clean list has the code, tests, rules and pack, and no pictures, fonts or tool packages (the SDK files are kept so the hash tests can run)', () => {
  for (const f of ['index.html', 'firestore.rules.strict', 'server/portfolio-forms-worker.js', 'scripts/form-guard.js', 'assets/vendor/firebase/manifest.json', 'assets/vendor/firebase/12.19.0/firebase-app.js']) assert.ok(files.includes(f), f);
  assert.ok(!files.some(f => /^assets\/(images|fonts|videos)\//.test(f) || /node_modules|__pycache__|\.zip$|\.png$|\.woff2$/.test(f))); });
test('no file in the list contains secret-shaped text (only the public web key, the public site key and two fake test strings)', () => {
  const fs = require_fs(); const bad = []; for (const f of files) bad.push(...scan(f, fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), allow)); assert.deepEqual(bad, []); });
test('SE-P1: the private documents are NOT in the public file list (they come from the private folder)', () => { for (const f of ['SECURITY-REVIEW-PACK.md', 'KNOWN-ISSUES.md', 'README-FULL.md', 'SECURITY-FINAL-REPORT.md', 'SECURITY-REVIEW-OWNER-CHECKLIST.md']) assert.ok(!files.includes(f), f); assert.ok(!files.some(f => f.startsWith('internal-docs/'))); });
test('SE-P1: the private files carry no secret-shaped text (skipped when the private folder is not available)', { skip: privateRoot() ? false : 'private documents folder not available' }, () => { const bad = []; for (const f of privateList()) bad.push(...scan(f, fs0.readFileSync(path0.join(privateRoot(), f), 'utf8'), allow)); assert.deepEqual(bad, []); assert.ok(privateList().includes('SECURITY-REVIEW-PACK.md') && privateList().includes('internal-docs/open-items.md')); });
test('the scanner catches real-looking secrets and ignores the allowed ones', () => {
  assert.equal(scan('x', 'key AIza' + 'B'.repeat(35), new Set()).length, 1); assert.equal(scan('x', '-----BEGIN PRIVATE KEY-----\n' + 'A'.repeat(60), new Set()).length, 1);
  assert.equal(scan('x', 'ghp_' + 'a'.repeat(30), new Set()).length, 1); assert.equal(scan('x', 'sk-' + 'a'.repeat(30), new Set()).length, 1);
  assert.equal(scan('x', 'xoxb-1234567890-abcdef', new Set()).length, 1); assert.equal(scan('x', '0x4' + 'A'.repeat(30), new Set()).length, 1);
  assert.equal(scan('x', ['a', 'b', 'c'].map(c => c.repeat(21)).join('.'), new Set()).length, 1);
  for (const a of allow) assert.equal(scan('x', a, allow).length, 0); for (const a of FAKE) assert.equal(scan('x', a, allow).length, 0); });
test('only one Google key and one site key are allowed through, both from settings.js', () => { assert.equal([...allow].filter(a => a.startsWith('AIza')).length, 1); assert.equal([...allow].filter(a => a.startsWith('0x4')).length, 1); assert.ok(SKIP_PATH.test('assets/images/a.png')); });
import fs0 from 'node:fs'; function require_fs() { return fs0; }
