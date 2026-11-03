// Run: node --test server/google-sheets-script.test.mjs   (Node 20+). Runs the real Apps Script file against an in-memory fake of Google's classes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const SRC = fs.readFileSync(new URL('./google-sheets-script.gs', import.meta.url), 'utf8');
function world(token = 'tok-' + 'x'.repeat(20)) {
  const sheets = {}; let locks = 0;
  const mkSheet = () => { const s = { rows: [], fmt: null, frozen: 0 }; return s; };
  const sheetApi = name => { const s = sheets[name]; return {
    getLastRow: () => s.rows.length, getMaxRows: () => Math.max(s.rows.length + 10, 1000), setFrozenRows: n => { s.frozen = n; },
    getRange: (r, c, nr, nc) => ({
      setValues(v) { v.forEach((row, i) => { s.rows[r - 1 + i] = row.slice(0, nc || row.length); }); return this; },
      getValues() { const o = []; for (let i = 0; i < nr; i++) o.push((s.rows[r - 1 + i] || []).slice(c - 1, c - 1 + (nc || 1))); return o; },
      setFontWeight() { return this; }, setNumberFormat(f) { s.fmt = f; return this; } }) }; };
  const ctx = vm.createContext({
    JSON, Math, String, Array, Object, Number, RegExp,
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'TOKEN' ? token : null) }) },
    LockService: { getScriptLock: () => ({ waitLock() { locks++; }, releaseLock() { locks--; } }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => (sheets[n] ? sheetApi(n) : null), insertSheet: n => { sheets[n] = mkSheet(); return sheetApi(n); } }) }
  });
  vm.runInContext(SRC, ctx);
  const post = body => JSON.parse(vm.runInContext('doPost', ctx)({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent());
  return { post, sheets, locks: () => locks, token };
}
const T = 'tok-' + 'x'.repeat(20);
test('wrong, missing or short token is denied; nothing is written', () => {
  const w = world();
  for (const b of [{ token: 'nope', tab: 'Meetings', rows: [['1']] }, { tab: 'Meetings', rows: [['1']] }, { token: '', tab: 'Meetings', rows: [['1']] }]) assert.equal(w.post(b).error, 'denied');
  assert.deepEqual(Object.keys(w.sheets), []);
  const weak = world('short'); assert.equal(weak.post({ token: 'short', action: 'ping' }).error, 'denied');
});
test('ping works with the token', () => { assert.deepEqual(world().post({ token: T, action: 'ping' }), { ok: true, pong: true }); });
test('bad requests: unknown tab, too many rows, not an array, invalid JSON', () => {
  const w = world();
  assert.equal(w.post({ token: T, tab: 'Secrets', rows: [['1']] }).error, 'bad request');
  assert.equal(w.post({ token: T, tab: 'Meetings', rows: Array.from({ length: 201 }, (_, i) => [String(i)]) }).error, 'bad request');
  assert.equal(w.post({ token: T, tab: 'Meetings', rows: 'x' }).error, 'bad request');
  assert.equal(w.post('{not json').error, 'failed');
  assert.equal(w.locks(), 0);
});
test('creates the tab with a header, appends rows, then updates by id (no duplicates)', () => {
  const w = world();
  assert.deepEqual(w.post({ token: T, tab: 'Visitors', rows: [['2026-11-01', '2026-11-01', '3', '2', '4', '5'], ['2026-11-02', '2026-11-02', '1', '1', '1', '0']] }), { ok: true, added: 2, updated: 0 });
  assert.equal(w.sheets.Visitors.rows[0][0], 'id'); assert.equal(w.sheets.Visitors.rows.length, 3); assert.equal(w.sheets.Visitors.frozen, 1);
  assert.deepEqual(w.post({ token: T, tab: 'Visitors', rows: [['2026-11-01', '2026-11-01', '9', '9', '9', '9'], ['2026-11-03', '2026-11-03', '1', '1', '1', '1']] }), { ok: true, added: 1, updated: 1 });
  assert.equal(w.sheets.Visitors.rows.length, 4); assert.equal(w.sheets.Visitors.rows[1][2], '9');
});
test('cells are text-formatted and a leading = + - @ is neutralised; control characters are removed', () => {
  const w = world();
  w.post({ token: T, tab: 'Clients', rows: [['c1', '=HYPERLINK("x")', '+1', '-2', '@SUM(A1)', 'a\u0000b\u0007c', 'x'.repeat(1500)]] });
  const r = w.sheets.Clients.rows[1];
  assert.equal(w.sheets.Clients.fmt, '@');
  assert.equal(JSON.stringify(r.slice(1, 6)), JSON.stringify(["'=HYPERLINK(\"x\")", "'+1", "'-2", "'@SUM(A1)", 'abc'])); assert.equal(r[6].length, 1000);
});
test('rows without an id or not arrays are skipped; short rows are padded', () => {
  const w = world();
  assert.deepEqual(w.post({ token: T, tab: 'Clients', rows: [[''], 'x', null, ['c9', 'Ann']] }), { ok: true, added: 1, updated: 0 });
  assert.equal(w.sheets.Clients.rows[1].length, 10); assert.equal(w.sheets.Clients.rows[1][2], '');
});
test('the lock is always released', () => { const w = world(); w.post({ token: T, tab: 'Meetings', rows: [['a']] }); assert.equal(w.locks(), 0); });
test('the script contains no secret, URL or e-mail address', () => { assert.ok(!/https?:\/\//.test(SRC.replace(/\/\*[\s\S]*?\*\//, ''))); assert.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(SRC)); });
