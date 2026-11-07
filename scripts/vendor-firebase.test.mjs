/* SE-E3: the vendored Firebase SDK, its manifest and the guards that keep the site from loading the SDK from Google again.
   Run: node --test scripts/vendor-firebase.test.mjs */
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
import { VERSION, INTEGRITY, FILES, ABS_IMPORT, REL_IMPORT, transform, tailOf, sha256 } from '../tools/vendor-firebase.mjs';
const dir = path.dirname(new URL(import.meta.url).pathname), root = path.join(dir, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8'); const code = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const vdir = 'assets/vendor/firebase/' + VERSION + '/'; const man = JSON.parse(rd('assets/vendor/firebase/manifest.json'));
const pol = h => { const o = {}; for (const part of h.match(/Content-Security-Policy" content="([^"]*)"/)[1].split(';')) { const t = part.trim().split(/\s+/); if (t[0]) o[t[0]] = t.slice(1); } return o; };

test('manifest: pinned package, the four files, and the pinned checksum agree with the tool', () => {
  assert.equal(man.package, 'firebase'); assert.equal(man.version, VERSION); assert.equal(man.tarballIntegrity, INTEGRITY); assert.match(INTEGRITY, /^sha512-[A-Za-z0-9+/]{86}==$/);
  assert.deepEqual(Object.keys(man.files).sort(), [...FILES].sort()); assert.equal(man.edits.length, 2);
});
test('vendored files: exactly the four files (no source maps, nothing extra) and each matches its recorded hash and size', () => {
  assert.deepEqual(fs.readdirSync(path.join(root, vdir)).sort(), [...FILES].sort());
  for (const f of FILES) { const b = fs.readFileSync(path.join(root, vdir + f)); assert.equal(sha256(b), man.files[f].vendoredSha256, f); assert.equal(b.length, man.files[f].vendoredBytes, f); }
});
test('the ONLY differences from the official files are the two listed edits (undoing them gives back the original hash)', () => {
  for (const f of FILES) {
    let t = rd(vdir + f); assert.ok(t.endsWith('\n') && !t.includes('sourceMappingURL'), f);
    const tail = man.files[f].removedTail; assert.match(tail, /^\n\n\/\/# sourceMappingURL=firebase-[a-z-]+\.js\.map\r?\n$/, f + ': the removed text must be only the map comment'); t = t.split(REL_IMPORT).join(ABS_IMPORT).replace(/\n$/, tail);
    assert.equal(sha256(Buffer.from(t)), man.files[f].originalSha256, f + ': differs from the official file by more than the two edits');
  }
});
test('vendored files import only firebase-app.js, relatively; nothing else is imported or fetched from an address', () => {
  for (const f of FILES) { const t = rd(vdir + f); const imps = [...t.matchAll(/\bimport\s*(?:[\w$*{},\s]*from\s*)?["']([^"']+)["']/g)].map(m => m[1]); assert.deepEqual(imps, f === 'firebase-app.js' ? [] : ['./firebase-app.js'], f); assert.ok(!/\bimport\s*\(/.test(t), f + ' has a dynamic import'); assert.ok(!t.includes(ABS_IMPORT), f); }
});
test('transform: refuses unexpected input (wrong import count, no map comment)', () => {
  const ok = 'import{a}' + ABS_IMPORT + ';x;\n\n//# sourceMappingURL=firebase-x.js.map\n';
  assert.equal(transform('firebase-x.js', ok), 'import{a}' + REL_IMPORT + ';x;\n');
  assert.throws(() => transform('firebase-x.js', 'x;\n\n//# sourceMappingURL=a.map\n'), /expected 1/);
  assert.throws(() => transform('firebase-x.js', ok + ok), /expected 1/);
  assert.throws(() => transform('firebase-x.js', 'import{a}' + ABS_IMPORT + ';x;'), /sourceMappingURL/);
  assert.throws(() => transform('firebase-app.js', ok), /expected 0/);
  assert.equal(transform('firebase-app.js', 'x;\n\n//# sourceMappingURL=a.map\n'), 'x;\n');
  assert.equal(tailOf('x;\n\n//# sourceMappingURL=a.map\r\n'), '\n\n//# sourceMappingURL=a.map\r\n'); assert.equal(tailOf('x;'), '');
});
test('GUARD: no page or script loads the SDK from Google any more, and no SDK address carries a query string', () => {
  const files = [...fs.readdirSync(path.join(root, 'scripts')).filter(f => f.endsWith('.js')).map(f => 'scripts/' + f), 'index.html', 'survey.html'];
  for (const f of files) { const c = code(rd(f)); assert.ok(!/gstatic\.com\/firebasejs/.test(c), f + ' loads the SDK from Google'); assert.ok(!/firebase-(app|auth|firestore|app-check)\.js\s*\?/.test(c), f + ': a query string on an SDK address would load a second copy of firebase-app.js'); }
  for (const f of ['owner-panel.js', 'survey-page.js']) assert.ok(code(rd('scripts/' + f)).includes("assets/vendor/firebase/" + VERSION + "/"), f);
  assert.ok(rd('scripts/form-guard.js').includes("const SDK_DIR = 'assets/vendor/firebase/" + VERSION + "/'"));
});
test('GUARD: form-guard finds the SDK folder from its own address, also under a sub-folder like /frederick-portfolio/', () => {
  const m = rd('scripts/form-guard.js').match(/const SDK = \((function \(\) \{[\s\S]*?\})\)\(\);/); assert.ok(m);
  const f = new Function('root', 'SDK_DIR', 'return (' + m[1] + ')();');
  assert.equal(f({ document: { currentScript: { src: 'https://u.github.io/frederick-portfolio/scripts/form-guard.js?v=se3' } } }, 'assets/vendor/firebase/' + VERSION + '/'), 'https://u.github.io/frederick-portfolio/assets/vendor/firebase/' + VERSION + '/');
  assert.equal(f({ document: { baseURI: 'https://u.github.io/frederick-portfolio/' } }, 'assets/vendor/firebase/' + VERSION + '/'), 'https://u.github.io/frederick-portfolio/assets/vendor/firebase/' + VERSION + '/');
  assert.equal(f({}, 'assets/vendor/firebase/' + VERSION + '/'), './assets/vendor/firebase/' + VERSION + '/');
});
test('GUARD: script-src on both pages no longer trusts all of www.gstatic.com, only its reCAPTCHA path; nothing else was widened', () => {
  for (const f of ['index.html', 'survey.html']) { const P = pol(rd(f)); assert.ok(!P['script-src'].includes('https://www.gstatic.com'), f); assert.ok(P['script-src'].includes('https://www.gstatic.com/recaptcha/') && P['script-src'].includes('https://www.google.com/recaptcha/'), f); assert.ok(!P['script-src'].includes("'unsafe-inline'") && !P['script-src'].includes("'unsafe-eval'")); for (const d of Object.keys(P)) assert.ok(!P[d].some(s => /gstatic\.com(?!\/recaptcha\/)/.test(s)), f + ' ' + d + ' still names gstatic'); }
  const ix = pol(rd('index.html')); for (const h of ['https://apis.google.com', 'https://accounts.google.com']) assert.ok(ix['script-src'].includes(h), 'Google sign-in still needs ' + h);
});
test('GUARD: the Owner Panel security checklist has the quarterly SDK review line and the App Check API reminder', () => {
  const s = rd('scripts/owner-security.js'); assert.match(s, /\['sdk', 'Firebase SDK version reviewed/); assert.match(s, /Firebase App Check API/);
});
