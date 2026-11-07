// Run: node tools/build-review-zip.mjs [out.zip]   -- builds the CLEAN review ZIP for an outside reviewer (code, tests, rules, pack; no images, fonts, test-tool packages or backups; the vendored Firebase SDK files ARE included so the hash tests can run).
// It scans every file it adds for secret-shaped text and STOPS (no ZIP) if it finds any. The one public Firebase web key in scripts/settings.js and the public Turnstile site key are the only allowed matches.
import fs from 'node:fs'; import os from 'node:os'; import { privateRoot, privateList } from './private-docs.mjs'; import path from 'node:path'; import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SKIP_DIR = /(^|\/)(node_modules|__pycache__|\.git)(\/|$)/, SKIP_PATH = /^(assets\/(images|fonts|videos)\/)/, SKIP_EXT = /\.(zip|png|jpe?g|gif|webp|ico|woff2?|mp4|webm|pdf)$/i;
export const walk = (d = '') => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap(e => { const p = d ? d + '/' + e.name : e.name; if (SKIP_DIR.test(p)) return []; return e.isDirectory() ? walk(p) : [p]; });
export const pick = () => walk().filter(p => !SKIP_PATH.test(p) && !SKIP_EXT.test(p) && !/(^|\/)\.env/.test(p) && !/backup.*\.(json|csv)$/i.test(p)).sort();
export const scan = (file, text, allow) => {
  const bad = []; const rules = [[/-----BEGIN [A-Z ]*PRIVATE KEY-----\s*[A-Za-z0-9+/=]{40,}/, 'private key body'], [/AIza[0-9A-Za-z_-]{30,}/g, 'Google API key'], [/\bsk-[A-Za-z0-9_-]{20,}/, 'sk- key'], [/\bghp_[0-9A-Za-z]{20,}/, 'GitHub token'], [/\bxox[abp]-[0-9A-Za-z-]{10,}/, 'Slack token'], [/\b0x4[A-Za-z0-9_-]{20,}/g, 'Turnstile key'], [/"private_key"\s*:\s*"[^"]{40,}/, 'service account key'], [/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/, 'token-like (a.b.c)']];
  for (const [re, name] of rules) { const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); for (const m of text.matchAll(g)) if (!allow.has(m[0])) bad.push(file + ': ' + name); }
  return bad; };
/* two obviously fake strings that the tests feed to the secret-detection code */
export const FAKE = ['xoxb-1234567890-abcdef', 'sk-abcdefghijklmnop1234'];
export const allowList = () => { const s = fs.readFileSync(path.join(root, 'scripts/settings.js'), 'utf8'); return new Set([...FAKE, ...(s.match(/AIza[0-9A-Za-z_-]{30,}/g) || []), ...(s.match(/0x4[A-Za-z0-9_-]{10,60}/g) || [])]); };
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  /* SE-P1: the private documents (pack, internal notes, KNOWN-ISSUES, full README) are NOT in the repository. They are added from the private folder so the reviewer still gets them. */
  const out = path.resolve(process.argv[2] || 'Portfolio-clean-review.zip'); const files = pick(), priv = privateList(), pr = privateRoot(); const allow = allowList(); const bad = [];
  if (!pr) { console.error('STOPPED: the private documents folder was not found (set PRIVATE_DOCS or keep ../private-docs). The reviewer needs the review pack.'); process.exit(1); }
  for (const f of files) bad.push(...scan(f, fs.readFileSync(path.join(root, f), 'utf8'), allow));
  for (const f of priv) bad.push(...scan(f, fs.readFileSync(path.join(pr, f), 'utf8'), allow));
  if (bad.length) { console.error('STOPPED, secret-shaped text found:\n' + [...new Set(bad)].join('\n')); process.exit(1); }
  if (fs.existsSync(out)) fs.rmSync(out);
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'review-stage-'));
  try {
    for (const f of files) { fs.mkdirSync(path.dirname(path.join(stage, f)), { recursive: true }); fs.copyFileSync(path.join(root, f), path.join(stage, f)); }
    for (const f of priv) { fs.mkdirSync(path.dirname(path.join(stage, f)), { recursive: true }); fs.copyFileSync(path.join(pr, f), path.join(stage, f)); }
    const all = [...files, ...priv].sort(); fs.writeFileSync(path.join(os.tmpdir(), 'review-zip-list.txt'), all.join('\n'));
    execFileSync('zip', ['-q', out, '-@'], { cwd: stage, input: all.join('\n') }); console.log('wrote ' + out + ' (' + all.length + ' files, ' + priv.length + ' from the private folder)');
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}
