// Every record type the backup code can save must have a tick box on the Privacy & backup page (the TD1 live test found four missing).
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import { createRequire } from 'node:module';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'), priv = fs.readFileSync(new URL('./owner-privacy.js', import.meta.url), 'utf8');
const cols = [...(priv.match(/const chosenCols = \(\) => \[([^\]]*)\]/)[1].matchAll(/'([A-Za-z]+)'/g))].map(m => m[1]);
test('chosenCols is not empty', () => assert.ok(cols.length > 20));
for (const c of cols) test('backup tick box exists for ' + c, () => assert.ok(html.includes('id="bk_' + c + '"'), 'missing checkbox bk_' + c));
test('every backup tick box is read by chosenCols', () => { const ids = [...html.matchAll(/id="bk_([A-Za-z]+)"/g)].map(m => m[1]); for (const i of ids) assert.ok(cols.includes(i), 'bk_' + i + ' is on the page but not in chosenCols'); });
test('to-do records are in the backup core as export-only', () => { const BC = createRequire(import.meta.url)('./backup-core.js'); for (const c of ['todoTasks', 'todoSessions', 'todoNotes', 'todoState']) { assert.ok(BC.LABEL[c], c); assert.ok(!BC.RESTORABLE.includes(c), c + ' must not be restorable'); } });
