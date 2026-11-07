/* ==========================================================================
   vendor-firebase.mjs - copies the Firebase web SDK into assets/vendor/firebase/<version>/ (CodeFlow 4.5.0, SE-E3).
   NOT part of the site and not run by visitors. Run it by hand ONLY when the SDK version is changed on purpose:
       node tools/vendor-firebase.mjs                 (downloads firebase@<version> from npm and checks its published checksum)
       node tools/vendor-firebase.mjs --tarball FILE  (uses a package file you downloaded yourself; the same check applies)
   Safety: the package must match the pinned checksum below or nothing is written. Each file gets exactly TWO edits, both listed in
   manifest.json and asserted by scripts/vendor-firebase.test.mjs:
     1. the import of firebase-app.js from the Google address becomes a relative import (so the site loads one copy from itself);
     2. the trailing "sourceMappingURL" comment is removed (no source-map requests to Google).
   ========================================================================== */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import crypto from 'node:crypto'; import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

export const VERSION = '10.12.2';
export const INTEGRITY = 'sha512-ZxEdtSvP1I9su1yf32D8TIdgxtPgxwr6z3jYAR1TXS/t+fVfpoPc/N1/N2bxOco9mNjUoc+od34v5Fn4GeKs6Q==';   // published by the npm registry for firebase@10.12.2
export const FILES = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js', 'firebase-app-check.js'];
export const ABS_IMPORT = 'from"https://www.gstatic.com/firebasejs/' + VERSION + '/firebase-app.js"';
export const REL_IMPORT = 'from"./firebase-app.js"';
export const MAP_RE = /\n*\/\/# sourceMappingURL=[^\n]*\n*$/;
/* the exact text that is removed at the end of a file (kept in the manifest so the original can be rebuilt byte for byte; one official file ends with a Windows line break) */
export const tailOf = text => { const m = text.match(MAP_RE); return m ? m[0] : ''; };
export const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
export const integrityOf = b => 'sha512-' + crypto.createHash('sha512').update(b).digest('base64');

/* original file text -> vendored file text. firebase-app.js itself has no import (its two Google-address strings are only a library name). */
export function transform(name, text) {
  const n = text.split(ABS_IMPORT).length - 1;
  const want = name === 'firebase-app.js' ? 0 : 1;
  if (n !== want) throw new Error(name + ': expected ' + want + ' import of firebase-app.js, found ' + n);
  if (!MAP_RE.test(text)) throw new Error(name + ': no trailing sourceMappingURL comment found');
  return text.split(ABS_IMPORT).join(REL_IMPORT).replace(MAP_RE, '\n');
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dest = path.join(root, 'assets', 'vendor', 'firebase', VERSION);
  const ti = process.argv.indexOf('--tarball'); let tgz = ti > 0 ? path.resolve(process.argv[ti + 1]) : null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbvendor-'));
  if (!tgz) { execFileSync('npm', ['pack', 'firebase@' + VERSION, '--silent'], { cwd: tmp, stdio: ['ignore', 'pipe', 'inherit'] }); tgz = path.join(tmp, 'firebase-' + VERSION + '.tgz'); }
  const got = integrityOf(fs.readFileSync(tgz));
  if (got !== INTEGRITY) { console.error('STOP: the package does not match the pinned checksum.\n expected ' + INTEGRITY + '\n got      ' + got); process.exit(1); }
  execFileSync('tar', ['xzf', tgz, '-C', tmp]);
  fs.mkdirSync(dest, { recursive: true });
  const files = {};
  for (const f of FILES) {
    const orig = fs.readFileSync(path.join(tmp, 'package', f)); const out = transform(f, orig.toString('utf8'));
    fs.writeFileSync(path.join(dest, f), out);
    files[f] = { originalSha256: sha256(orig), originalBytes: orig.length, removedTail: tailOf(orig.toString('utf8')), vendoredSha256: sha256(Buffer.from(out)), vendoredBytes: Buffer.byteLength(out) };
  }
  const manifest = { package: 'firebase', version: VERSION, tarballIntegrity: INTEGRITY, source: 'npm registry (firebase@' + VERSION + ')', edits: ['import of firebase-app.js: Google address -> ./firebase-app.js', 'trailing sourceMappingURL comment removed'], files };
  fs.writeFileSync(path.join(root, 'assets', 'vendor', 'firebase', 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('OK: vendored ' + FILES.length + ' files for firebase ' + VERSION + ' into ' + path.relative(root, dest));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
