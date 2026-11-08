/* (shared helpers copied from the TD2 test) */
/* UI-1 browser test: the page never needs inline styles. Records every style="" attribute, setAttribute('style'), and every securitypolicyviolation on public + all dashboard pages with seeded data. Works with the CSP loose (Stage 1) and strict (Stage 2). */
import { b, check, errs, fresh, signIn, signOut, srv, results } from './w5-harness.mjs';
import fs from 'node:fs';
const extra = () => {
  const S = window.__store, F = window.OWN.fs; window.__ts = ms => ({ __ts: true, ms, toMillis() { return this.ms; } });
  const num = x => x == null ? NaN : x.toMillis ? x.toMillis() : x instanceof Date ? x.getTime() : x;
  const cmp = (v, op, w) => { const a = typeof v === 'string' ? v : num(v), c = typeof w === 'string' ? w : num(w); return op === '==' ? v === w : op === '>=' ? a >= c : op === '<' ? a < c : true; };
  let reads = 0; window.__reads2 = () => reads;
  F.getDocs = async q => { reads++; let docs = Object.keys(S).filter(k => k.startsWith(q.col + '/') && !k.slice(q.col.length + 1).includes('/')).filter(k => (q.w || []).every(w => cmp(S[k][w.f], w.op, w.v))).map(k => ({ id: k.split('/').pop(), data: () => S[k] })); if (q.lim) docs = docs.slice(0, q.lim.lim); return { docs, empty: !docs.length, size: docs.length, forEach: fn => docs.forEach(fn) }; };
  const g0 = F.getDoc; F.getDoc = async r => { reads++; const d = S[r.path]; return { exists: () => !!d, data: () => d, id: r.id }; }; void g0;
  F.updateDoc = async (ref, d) => { if (!S[ref.path]) throw Object.assign(new Error('nf'), { code: 'not-found' }); S[ref.path] = Object.assign({}, S[ref.path], d); };
  const apply = ops => ops.forEach(([k, p, d]) => { if (k === 's') S[p] = d; else if (k === 'u') S[p] = Object.assign({}, S[p], d); else delete S[p]; });
  F.writeBatch = () => { const ops = []; return { set: (r, d) => ops.push(['s', r.path, d]), update: (r, d) => ops.push(['u', r.path, d]), delete: r => ops.push(['d', r.path]), commit: async () => apply(ops) }; };
  F.runTransaction = async (db, fn) => { const ops = []; const tx = { get: async r => { const d = S[r.path]; return { exists: () => !!d, data: () => d }; }, set: (r, d) => ops.push(['s', r.path, d]), update: (r, d) => ops.push(['u', r.path, d]), delete: r => ops.push(['d', r.path]) }; const res = await fn(tx); apply(ops); return res; };
  F.setDoc = async (ref, d) => { S[ref.path] = d; };
};
const mk = async (opts = {}) => { const c = await fresh(opts); await c.pg.evaluate(extra); await c.pg.waitForFunction(() => window.todoApi && window.coreTodoGraph && window.__todoGraphTest); return c; };
const S = pg => pg.evaluate(() => JSON.parse(JSON.stringify(window.__store, (k, v) => v && v.__ts ? v.ms : v)));
const keys = (s, p) => Object.keys(s).filter(k => k.startsWith(p));
const seed = async pg => pg.evaluate(() => {
  const St = window.__store, T = window.coreTime, tz = 'Asia/Manila', today = window.todoApi.todayKey(), P = n => { const [y, m, d] = window.coreTime.addDaysIso(today, n).split('-').map(Number); return T.zonedToUtc(y, m, d, 0, 0, 0, tz); };
  const task = (id, name, o) => St['todoTasks/' + id] = Object.assign({ name, desc: '', due: '', hours: 1, focusMin: 25, status: 'todo', secs: 0, doneAt: null, color: 0, createdAt: window.__ts(P(-5)), updatedAt: window.__ts(P(-5)) }, o);
  task('taskAAAA1', 'Write report', { color: 0, hours: 2, secs: 6000 }); task('taskBBBB2', 'Plan week', { color: 1, hours: 0.5, secs: 3600 }); task('taskCCCC3', 'Old finished', { status: 'done', doneAt: window.__ts(P(-1) + 3600000), color: 2, hours: 0, secs: 0 });
  const ses = (id, taskId, start, secs, kind) => St['todoSessions/' + id] = { taskId, start: window.__ts(start), secs, day: T.localDateKey(start, tz), kind: kind || 'timer', createdAt: window.__ts(start) };
  ses('sessT00001', 'taskAAAA1', P(0), 3600); ses('sessY00001', 'taskBBBB2', P(-1) + 36000000, 1800); ses('sessM00001', 'taskAAAA1', P(-2) + 43200000, 1200, 'manual');
  ses('sessX00001', 'taskAAAA1', P(-2) - 1800000, 3600);                       // 23:30 three days ago to 00:30
  St['todoEvents/evntDone01'] = { taskId: 'taskBBBB2', type: 'done', createdAt: window.__ts(P(0) + 60000) };
  return { today, d0: P(0) };
});
const open = async pg => { await pg.click('#dashOpen'); await pg.waitForTimeout(400); await pg.evaluate(() => document.querySelector('.dnav button[data-page="todo"]').click()); await pg.waitForTimeout(500); await pg.evaluate(() => document.getElementById('tdTab_graphs').click()); await pg.waitForTimeout(500); };
const txt = (pg, sel) => pg.evaluate(s => (document.querySelector(s) || {}).textContent || '', sel);
const dl = async (pg, sel) => { const p = pg.waitForEvent('download', { timeout: 8000 }); await pg.evaluate(s => document.querySelector(s).click(), sel); const d = await p, path = await d.path(); return { name: d.suggestedFilename(), buf: fs.readFileSync(path) }; };


const seedWeek = async pg => pg.evaluate(() => {
  const St = window.__store, T = window.coreTime, G = window.coreTodoGraph, tz = window.ownerTz.get(), today = window.todoApi.todayKey(), wk = G.lastCompletedWeek(today);
  const at = (day, h) => { const [y, m, d] = day.split('-').map(Number); return T.zonedToUtc(y, m, d, h, 0, 0, tz); };
  St['todoTasks/taskAAAA1'] = { name: 'Write report', desc: '', due: '', hours: 20, focusMin: 25, status: 'doing', secs: 14400, doneAt: null, color: 0, createdAt: window.__ts(at(T.addDaysIso(wk.start, -10), 9)), updatedAt: window.__ts(at(T.addDaysIso(wk.start, -10), 9)) };
  St['todoTasks/taskBBBB2'] = { name: 'Plan week', desc: '', due: '', hours: 1, focusMin: 25, status: 'todo', secs: 0, doneAt: null, color: 1, createdAt: window.__ts(at(T.addDaysIso(wk.start, -10), 9)), updatedAt: window.__ts(at(T.addDaysIso(wk.start, -10), 9)) };
  const ses = (id, day, secs) => St['todoSessions/' + id] = { taskId: 'taskAAAA1', start: window.__ts(at(day, 10)), secs, day, kind: 'timer', createdAt: window.__ts(at(day, 10)) };
  ses('sessMon001', wk.start, 3600); ses('sessWed001', T.addDaysIso(wk.start, 2), 7200); ses('sessFri001', T.addDaysIso(wk.start, 4), 3600);
  St['todoEvents/evntDone01'] = { taskId: 'taskBBBB2', type: 'done', createdAt: window.__ts(at(T.addDaysIso(wk.start, 1), 15)) };
  St['todoPrefs/main'] = { dailyGoalMin: 60, weekdayGoalMin: [null, null, null, null, null, 0, null], updatedAt: window.__ts(Date.now()) };
  return { today, wk };
});
const openG = async pg => { await pg.click('#dashOpen'); await pg.waitForTimeout(400); await pg.evaluate(() => document.querySelector('.dnav button[data-page="todo"]').click()); await pg.waitForTimeout(600); await pg.evaluate(() => document.getElementById('tdTab_graphs').click()); await pg.waitForTimeout(700); };

const init = () => {
  window.__csp = []; window.__sa = [];
  document.addEventListener('securitypolicyviolation', e => window.__csp.push([e.violatedDirective, (e.sourceFile || '').split('/').pop() + ':' + e.lineNumber]));
  const sa = Element.prototype.setAttribute; Element.prototype.setAttribute = function (k, v) { if (String(k).toLowerCase() === 'style') window.__sa.push((this.tagName || '') + '#' + (this.id || '') + '.' + (this.className && this.className.baseVal === undefined ? this.className : '')); return sa.call(this, k, v); };
};
const scan = pg => pg.evaluate(() => ({ attrs: [...document.querySelectorAll('[style]')].map(e => e.tagName + '#' + e.id + '.' + (typeof e.className === 'string' ? e.className : '')), sa: window.__sa.slice(), csp: window.__csp.slice(), styleEls: document.querySelectorAll('style').length }));
const policy = await (await fetch('http://127.0.0.1:' + srv.address().port + '/index.html')).text();
const meta = (policy.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || '';
const styleSrc = (meta.match(/style-src ([^;]*)/) || [])[1] || '';
const { ctx, pg } = await mk({ init, viewport: { width: 1280, height: 1000 } });
await pg.waitForTimeout(800);
let r = await scan(pg);
const root = new URL('../../', import.meta.url).pathname;
const srcFiles = ['index.html', 'survey.html', ...fs.readdirSync(root + 'scripts').filter(f => f.endsWith('.js') && !f.endsWith('.test.mjs')).map(f => 'scripts/' + f)];
const hits = srcFiles.filter(f => /[\s"'`]style\s*=/.test(fs.readFileSync(root + f, 'utf8')) ).filter(f => /<[a-z][^>]*\sstyle\s*=/i.test(fs.readFileSync(root + f, 'utf8')));
check('no file writes a style="" attribute in markup or in an HTML string (' + srcFiles.length + ' files scanned)', hits.length === 0, hits.join(','));
check('no inline <style> block in index.html or survey.html (the noscript one is now a file)', !/<style[\s>]/i.test(fs.readFileSync(root + 'index.html', 'utf8')) && !/<style[\s>]/i.test(fs.readFileSync(root + 'survey.html', 'utf8')));
check('public page: no inline <style> element', r.styleEls === 0, String(r.styleEls));
check('public page: nothing called setAttribute("style")', r.sa.length === 0, r.sa.join(','));
check('public page: no blocked-style events', r.csp.length === 0, JSON.stringify(r.csp));
await pg.evaluate(() => { for (const b of [...document.querySelectorAll('button')].slice(0, 120)) if (b.offsetParent !== null && !b.closest('#dash') && !/delete|remove|clear|sign/i.test(b.textContent)) b.click(); }); await pg.waitForTimeout(600);
await pg.setViewportSize({ width: 390, height: 800 }); await pg.waitForTimeout(400); await pg.setViewportSize({ width: 1280, height: 1000 });
await signIn(pg); await pg.waitForTimeout(300); await seedWeek(pg);
await pg.evaluate(() => { const S = window.__store; S['todoTasks/taskAAAA1'].hours = 2; S['todoTasks/taskAAAA1'].secs = 3600; });
await pg.click('#dashOpen'); await pg.waitForTimeout(500);
const list = await pg.evaluate(() => [...document.querySelectorAll('.dnav button[data-page]')].map(x => x.dataset.page));
check('the walk covers every dashboard page (at least 30)', list.length >= 30, String(list.length));
for (const p of list) { await pg.evaluate(p => document.querySelector('.dnav button[data-page="' + p + '"]').click(), p); await pg.waitForTimeout(450);
  if (p === 'todo') for (const t of ['tasks', 'graphs', 'focus', 'notes']) { await pg.evaluate(t => { const e = document.getElementById('tdTab_' + t); if (e) e.click(); }, t); await pg.waitForTimeout(600); } }
r = await scan(pg);
check('dashboard: nothing called setAttribute("style")', r.sa.length === 0, r.sa.join(','));
check('dashboard: no blocked-style events', r.csp.length === 0, JSON.stringify(r.csp));
const bars = await pg.evaluate(() => { document.querySelector('.dnav button[data-page="todo"]').click(); return 1; }); await pg.waitForTimeout(500);
await pg.evaluate(() => document.getElementById('tdTab_graphs').click()); await pg.waitForTimeout(700);
const w = await pg.evaluate(() => [...document.querySelectorAll('.td-bar i, .td-seg *, .bt i')].map(e => e.style.width).filter(Boolean));
check('progress/segment bars still get their widths through the CSSOM (found ' + w.length + ')', w.length >= 1 && w.every(x => /%$/.test(x)), w.join(','));



check('index.html style-src has no unsafe-inline (Stage 2 gate; value: ' + styleSrc + ')', !/unsafe-inline/.test(styleSrc) || process.env.STAGE1 === '1');
check('noscript fallback is an external file, not an inline block', /<noscript><link rel="stylesheet" href="styles\/noscript\.css/.test(policy));
check('no page errors', errs.length === 0, errs.join('|'));
await b.close(); srv.close();
const bad = results.filter(r => !r[1]).length; console.log(bad ? bad + ' FAILED' : 'ALL PASSED'); process.exit(bad ? 1 : 0);
