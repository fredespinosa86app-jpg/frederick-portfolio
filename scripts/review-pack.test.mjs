// Run: node --test scripts/review-pack.test.mjs   -- SE-E5 guards: the review pack cannot go stale or leak a secret
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { splice, BEGIN, END } from '../tools/review-pack.mjs'; import { privateRoot } from '../tools/private-docs.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const PR = privateRoot();
/* SE-P1: the pack and the owner checklist are private. Without the private folder (GitHub Actions) the tests about them are skipped, not failed. */
const SKIP = PR ? false : 'private documents folder not available (set PRIVATE_DOCS or keep ../private-docs)';
const rd = f => fs.readFileSync(path.join(root, f), 'utf8'), rp = f => fs.readFileSync(path.join(PR, f), 'utf8');
const pack = PR ? rp('SECURITY-REVIEW-PACK.md') : '';
const has = f => fs.existsSync(path.join(root, f)) || (PR && fs.existsSync(path.join(PR, f)));
test('the rules block in the pack equals firestore.rules.strict exactly', { skip: SKIP }, () => { assert.equal(pack, splice(pack, rd('firestore.rules.strict'))); assert.ok(pack.includes(BEGIN) && pack.includes(END)); });
test('the splice tool detects a changed rules file (the block would differ)', { skip: SKIP }, () => { assert.notEqual(pack, splice(pack, rd('firestore.rules.strict') + '\n// changed')); assert.throws(() => splice('no markers', 'x')); });
test('every file path named in the pack exists', { skip: SKIP }, () => {
  const out = pack.slice(0, pack.indexOf(BEGIN)) + pack.slice(pack.indexOf(END)); const seen = new Set();
  for (const m of out.matchAll(/`((?:scripts|server|rules-tests|tools|internal-docs|assets|\.github|\.well-known)\/[^`\s*<>]+|firestore\.rules(?:\.strict)?|[A-Z0-9-]+\.md|security\.txt)`/g)) { const f = m[1].replace(/[.,;:]$/, ''); if (seen.has(f)) continue; seen.add(f); assert.ok(has(f), 'missing: ' + f); }
  assert.ok(seen.size >= 25); });
test('required sections are present, in order', { skip: SKIP }, () => { let at = -1; for (const h of ['## 1. What the site is', '## 2. Scope', '## 3. Threat list', '## 4. Known limits', '## 5. How to run', '## 6. The Firestore rules', '## 7. How to report', '## 8. Fix-tracking table']) { const i = pack.indexOf(h); assert.ok(i > at, h); at = i; } assert.match(pack, /preparation only/); assert.match(pack, /Out of scope/); });
test('no secret-shaped text in the pack, the owner checklist or security.txt', { skip: SKIP }, () => {
  for (const f of ['SECURITY-REVIEW-PACK.md', 'SECURITY-REVIEW-OWNER-CHECKLIST.md', 'security.txt', '.well-known/security.txt']) { const s = has(f) ? (fs.existsSync(path.join(root, f)) ? rd(f) : rp(f)) : ''; /* public file or private file */
    assert.ok(!/-----BEGIN [A-Z ]*PRIVATE KEY/.test(s), f); assert.ok(!/AIza[0-9A-Za-z_-]{30,}/.test(s), f + ' api key'); assert.ok(!/\b0x4[A-Za-z0-9_-]{20,}/.test(s), f + ' turnstile'); assert.ok(!/(?:secret|password|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i.test(s.replace(/\/\/.*$/gm, '')), f + ' assignment'); assert.ok(!/sk-[A-Za-z0-9]{20,}/.test(s), f); } });
test('the two security.txt copies match, give an e-mail and the form, and do not expire soon', () => {
  const a = rd('security.txt'), b = rd('.well-known/security.txt'); assert.equal(a, b); assert.match(a, /^Contact: mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/m); assert.match(a, /^Contact: https:\/\/.+#schedule$/m);
  const e = a.match(/^Expires: (\S+)$/m); assert.ok(e && new Date(e[1]) > new Date('2027-01-01')); assert.match(a, /^Canonical: https:\/\//m); });
test('the owner checklist covers scans, a trusted reviewer, the rules question, the published file and what to do with a finding', { skip: SKIP }, () => {
  const c = rp('SECURITY-REVIEW-OWNER-CHECKLIST.md'); for (const k of ['Part 1', 'Part 2', 'Part 3', 'Part 4', 'When a finding arrives', 'Never send passwords']) assert.ok(c.includes(k), k); assert.match(c, /cannot do or certify/); });
