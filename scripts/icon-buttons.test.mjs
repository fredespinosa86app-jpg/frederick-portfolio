// Run: node --test scripts/icon-buttons.test.mjs   (Node 20+)
// Phase T2: row actions on the owner dashboard are icon buttons (dashKit.iconBtn). These checks keep it that way and keep every icon defined.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname), root = path.join(dir, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const owner = fs.readdirSync(dir).filter(f => /^owner-.*\.js$/.test(f)).map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')]);
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const symbols = [...html.matchAll(/<symbol id="ic-([a-z-]+)"/g)].map(m => m[1]);

test('every icon symbol is defined exactly once', () => { assert.equal(new Set(symbols).size, symbols.length); for (const s of ['up', 'down', 'pencil', 'trash', 'copy', 'plus', 'restore', 'clock', 'archive', 'eye']) assert.ok(symbols.includes(s), s); });
test('every icon used in the page or in an iconBtn() call exists', () => {
  const used = new Set([...html.matchAll(/<use href="#ic-([a-z-]+)"/g)].map(m => m[1]));
  for (const [, src] of owner) for (const m of strip(src).matchAll(/iconBtn\(\s*'([a-z-]+)'/g)) used.add(m[1]);
  for (const u of used) assert.ok(symbols.includes(u), 'missing icon symbol: ' + u);
  assert.ok(used.size >= 10);
});
test('no row-action text button is left (Edit, Delete, Move up/down, Rename, Copy, Archive, Restore, Open, Note, History)', () => {
  const left = [];
  for (const [f, src] of owner) strip(src).split('\n').forEach((l, i) => { if (/\},\s*'(Edit|Delete|Move up|Move down|Rename|Copy|Archive|Restore|Open|Note|History)'\)/.test(l)) left.push(f + ':' + (i + 1) + ' ' + l.trim().slice(0, 90)); });
  /* allowed: the Delete button inside the library picture dialog (a confirm action of a dialog, not a row action) */
  const real = left.filter(x => !/^owner-library\.js/.test(x) || !/d\.close\(\)/.test(x));
  assert.deepEqual(real, []);
});
test('the shared helpers build icon buttons: ctl() for Move up/down, Edit, Rename; del() in both copies; text kept for other labels', () => {
  const c = fs.readFileSync(path.join(dir, 'owner-content.js'), 'utf8');
  assert.match(c, /CTL_ICON = \{ 'Move up': 'up', 'Move down': 'down', 'Edit': 'pencil', 'Rename': 'pencil' \}/); assert.match(c, /\? kit\.iconBtn\(CTL_ICON\[label\], label, name, fn, \{ disabled: !!disabled \}\)/);
  for (const f of ['owner-phase1.js', 'owner-phase2.js']) assert.match(fs.readFileSync(path.join(dir, f), 'utf8'), /const del = \(name, what, (after|fn)\) => iconBtn\('trash', 'Delete', name,[\s\S]*?\{ danger: true \}\);/, f);
});
test('Client IDs: copy, edit note, history, archive/restore are icon buttons with the ID in the name', () => {
  const s = fs.readFileSync(path.join(dir, 'owner-clientids.js'), 'utf8');
  for (const re of [/iconBtn\('copy', 'Copy', r\.id/, /iconBtn\('pencil', 'Edit note', r\.id/, /iconBtn\('clock', 'History', r\.id/, /iconBtn\('restore', 'Restore', r\.id/, /iconBtn\('archive', 'Archive', r\.id[^\n]*danger: true/]) assert.match(s, re);
});
test('the 13 Add buttons keep their text and have the plus icon', () => {
  for (const id of ['svcAdd', 'tkAddCat', 'kbAdd', 'tmAdd', 'wtCliAdd', 'cidAddNext', 'cidAddCustom', 'vdAdd', 'fqAdd', 'exAdd', 'clAdd', 'sfSvcAdd', 'sfFormAdd']) {
    const m = html.match(new RegExp('<button[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)</button>')); assert.ok(m, id);
    assert.match(m[1], /^<svg aria-hidden="true" focusable="false"><use href="#ic-plus"\/><\/svg><span>[A-Za-z ]+<\/span>$/, id); assert.match(m[0], /class="dbtn( primary)? ibtn"/, id);
  }
});
test('workflow and status buttons stay as text (their label depends on the state)', () => {
  const inv = fs.readFileSync(path.join(dir, 'owner-invoices.js'), 'utf8'), bh = fs.readFileSync(path.join(dir, 'owner-billhours.js'), 'utf8'), ws = fs.readFileSync(path.join(dir, 'owner-wtsched.js'), 'utf8');
  assert.match(inv, /btn\('Mark ready'/); assert.match(bh, /btn\('Submit'/); assert.match(bh, /btn\('Replace'/); assert.match(ws, /'Confirm remove'/);
});
test('icon buttons keep an accessible name "Action: Name" and a tooltip', () => {
  const d = fs.readFileSync(path.join(dir, 'owner-dashboard.js'), 'utf8');
  assert.match(d, /title: action, 'aria-label': name \? action \+ ': ' \+ name : action/);
});
