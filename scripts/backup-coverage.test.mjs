// BK-1: every database collection named in the Firestore rules must be either in the backup (restorable or export-only)
// or on the short, reasoned "not backed up" list below. Adding a collection without deciding fails here.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import { createRequire } from 'node:module';
const BC = createRequire(import.meta.url)('./backup-core.js');
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const collections = f => [...read(f).matchAll(/^    match \/([A-Za-z0-9_]+)\//gm)].map(m => m[1]);

/* Deliberately NOT in the main JSON backup. Keep each reason honest and short. */
const NOT_BACKED_UP = {
  anonCounters: 'daily abuse-budget counters; rebuilt by themselves each day and safe to lose',
  library: 'image library: has its own backup file on the Library page (button "libBk")',
  libraryFull: 'image library full-size pictures: covered by the same Library backup',
};

for (const rulesFile of ['firestore.rules.strict', 'firestore.rules']) {
  const cols = collections(rulesFile);
  test(rulesFile + ': found the collection list', () => assert.ok(cols.length > 40, 'only ' + cols.length));
  test(rulesFile + ': every collection is backed up or deliberately skipped', () => {
    const have = new Set([...BC.RESTORABLE, ...BC.EXPORT_ONLY]);
    const missing = cols.filter(c => !have.has(c) && !NOT_BACKED_UP[c]);
    assert.deepEqual(missing, [], 'collections with no backup decision: ' + missing.join(', '));
  });
  test(rulesFile + ': nothing on the skip list is also in the backup, and every skip entry still exists in the rules', () => {
    for (const c of Object.keys(NOT_BACKED_UP)) { assert.ok(cols.includes(c), c + ' is on the skip list but not in the rules (remove it from the list)'); assert.ok(![...BC.RESTORABLE, ...BC.EXPORT_ONLY].includes(c), c + ' is both skipped and backed up'); }
  });
}
test('every backed-up collection is a real collection in the rules', () => {
  const cols = new Set(collections('firestore.rules.strict'));
  for (const c of [...BC.RESTORABLE, ...BC.EXPORT_ONLY]) assert.ok(cols.has(c), c + ' is in the backup lists but the rules do not have it');
});
test('every backed-up collection has a label for the screen', () => { for (const c of [...BC.RESTORABLE, ...BC.EXPORT_ONLY]) assert.ok(BC.LABEL[c], 'no label for ' + c); });
test('the Library backup button the skip list points to exists', () => assert.ok(read('scripts/owner-library.js').includes("'libBk'") || read('scripts/owner-library.js').includes('libBk')));
