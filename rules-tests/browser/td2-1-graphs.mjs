/* TD2 browser tests: Graphs tab (daily stack, goal and streak, weekly completions, used vs allotted, tables, CSV, picture, keyboard, phone) with a fake database */
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

{
  const { ctx, pg } = await mk(); await signIn(pg); await pg.waitForTimeout(300); const sd = await seed(pg); await open(pg);
  check('the dashboard is really open and the page is visible', await pg.evaluate(() => !document.getElementById('dash').hidden && document.getElementById('tdGraphs').getBoundingClientRect().height > 100));
  check('tabs exist and Graphs is selected', await pg.evaluate(() => document.getElementById('tdTab_graphs').getAttribute('aria-selected') === 'true' && !document.getElementById('tdGraphs').hidden && document.getElementById('tdTasksView').hidden));
  check('daily chart drawn with one bar per day (14 by default on desktop)', await pg.evaluate(() => document.querySelectorAll('#tdChart1 .td-gbar').length === 14));
  for (const n of [7, 30, 14]) { await pg.evaluate(n => document.querySelector('#tdGRange button[data-r="' + n + '"]').click(), n); await pg.waitForTimeout(100); check('range ' + n + ' days shows ' + n + ' bars', await pg.evaluate(n => document.querySelectorAll('#tdChart1 .td-gbar').length === n, n)); }
  const r0 = await pg.evaluate(() => window.__reads2()); await pg.evaluate(() => document.querySelector('#tdGRange button[data-r="7"]').click()); await pg.waitForTimeout(100);
  check('changing the range costs no extra reads', (await pg.evaluate(() => window.__reads2())) === r0);
  check('summary text has total and average', /Total 2 h 10 m/.test(await txt(pg, '#tdGBody .td-gsec .dhelp')) || /Total/.test(await txt(pg, '#tdGBody .td-gsec .dhelp')));
  check('legend lists tasks with a letter', await pg.evaluate(() => /A\s+Write report/.test(document.querySelector('.td-legend').textContent)));
  check('the midnight-crossing session is split (3 days ago 30 min, 2 days ago has 30+20 min)', await pg.evaluate(() => { const t = [...document.querySelectorAll('#tdChart1 .td-gbar')].map(g => g.dataset.tip); return t.some(x => /50 m/.test(x)); }));
  check('days before the first record say no data, days after with nothing say 0', await pg.evaluate(() => { const t = [...document.querySelectorAll('#tdChart1 .td-gbar')].map(g => g.dataset.tip); return t.slice(-7).some(x => /no time recorded|no data/.test(x)); }));
  /* table */
  await pg.evaluate(() => [...document.querySelectorAll('#tdGraphs button')].find(x => /Show as table/.test(x.textContent)).click()); await pg.waitForTimeout(150);
  check('table lists days with headers', await pg.evaluate(() => { const t = document.querySelector('#tdTbl_daily table'); return !!t && t.querySelectorAll('thead th').length >= 3 && t.querySelectorAll('tbody tr').length === 7 && !!t.querySelector('caption'); }));
  /* keyboard */
  await pg.evaluate(() => document.querySelector('#tdChart1 .td-gbar[tabindex="0"]').focus()); await pg.keyboard.press('ArrowLeft'); await pg.waitForTimeout(100);
  check('arrow keys move between days and announce the day', await pg.evaluate(() => document.activeElement.classList.contains('td-gbar') && document.activeElement.dataset.i === '5' && document.getElementById('tdGInfo').textContent === document.activeElement.dataset.tip));
  await pg.keyboard.press('Home'); check('Home goes to the first day', await pg.evaluate(() => document.activeElement.dataset.i === '0'));
  /* used vs allotted, done vs open, weekly */
  check('used vs allotted shows OVER for the task past its hours', await pg.evaluate(() => /Plan week[\s\S]*OVER by/.test(document.querySelector('.td-uva').textContent)));
  check('done vs open counts', /Done 1 · In progress 0 · To do 2 · Archived 0/.test(await txt(pg, '.td-counts')));
  check('weekly chart has 12 bars; this week has 2 completed (event + old task)', await pg.evaluate(() => document.querySelectorAll('#tdChart2 .td-gbar').length === 12 && /: 2 tasks completed/.test([...document.querySelectorAll('#tdChart2 .td-gbar')].pop().dataset.tip) || /: [12] task/.test([...document.querySelectorAll('#tdChart2 .td-gbar')].pop().dataset.tip)));
  /* goal and streak */
  await pg.evaluate(() => { document.getElementById('tdGGoal').value = '30'; document.getElementById('tdGGoalSave').click(); }); await pg.waitForTimeout(400);
  let s = await S(pg);
  check('goal saved to todoPrefs/main', s['todoPrefs/main'] && s['todoPrefs/main'].dailyGoalMin === 30);
  check('streak text appears and counts today (60 min today >= 30)', /Current streak: [1-9]/.test(await txt(pg, '#tdGStreak')) && /goal reached/.test(await txt(pg, '#tdGStreak')));
  check('a goal line and a check mark are drawn', await pg.evaluate(() => /goal 30 m/.test(document.querySelector('#tdChart1 svg').textContent) && /✓/.test(document.querySelector('#tdChart1 svg').textContent)));
  await pg.evaluate(() => { document.getElementById('tdGGoal').value = '2000'; document.getElementById('tdGGoalSave').click(); }); await pg.waitForTimeout(300);
  check('a goal above 1440 minutes is refused and not saved', (await S(pg))['todoPrefs/main'].dailyGoalMin === 30);
  await pg.evaluate(() => { document.getElementById('tdGGoal').value = '0'; document.getElementById('tdGGoalSave').click(); }); await pg.waitForTimeout(300);
  check('goal 0 turns streaks off', /Set a daily goal/.test(await txt(pg, '#tdGStreak')));
  /* CSV */
  let f = await dl(pg, '#tdGCsv_daily');
  let text = f.buf.toString('utf8');
  check('daily CSV: BOM, header, task names hidden by default', text.charCodeAt(0) === 0xFEFF && /Date,Task,Timer minutes,Manual minutes,Total minutes/.test(text) && /Task A/.test(text) && !/Write report/.test(text) && /anonymous/.test(f.name));
  await pg.evaluate(() => { const c = document.getElementById('tdGAnon'); c.checked = false; c.dispatchEvent(new Event('change')); });
  f = await dl(pg, '#tdGCsv_daily'); text = f.buf.toString('utf8'); check('with the box off the real names are used', /Write report/.test(text) && !/anonymous/.test(f.name));
  check('CSV has separate timer and manual minutes', /,60,0,60|,\d+,20,\d+/.test(text));
  f = await dl(pg, '#tdGCsv_weekly'); text = f.buf.toString('utf8'); check('weekly CSV downloads with header', /Week starting \(Monday\)/.test(text) && /Plan week/.test(text));
  await pg.evaluate(() => { const c = document.getElementById('tdGAnon'); c.checked = true; c.dispatchEvent(new Event('change')); });
  /* picture */
  f = await dl(pg, '#tdGPng_daily'); check('picture: a real PNG file, anonymous name', f.buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a' && f.buf.length > 3000 && /anonymous\.png$/.test(f.name));
  f = await dl(pg, '#tdGPng_weekly'); check('weekly picture is a PNG too', f.buf.slice(0, 4).toString('hex') === '89504e47');
  await ctx.close();
}
{
  /* the status log is written by the task screens, and a task name cannot inject markup or a formula */
  const { ctx, pg } = await mk(); await signIn(pg); await pg.waitForTimeout(300);
  await pg.evaluate(() => { const St = window.__store, t = window.__ts(Date.now() - 86400000 * 3); St['todoTasks/taskEVIL01'] = { name: '=HYPERLINK("http://x")<img src=x onerror=alert(1)>', desc: '', due: '', hours: 1, focusMin: 25, status: 'todo', secs: 0, doneAt: null, color: 3, createdAt: t, updatedAt: t }; St['todoSessions/sessEVIL01'] = { taskId: 'taskEVIL01', start: window.__ts(Date.now() - 7200000), secs: 600, day: window.coreTime.localDateKey(Date.now() - 7200000, 'Asia/Manila'), kind: 'manual', createdAt: t }; });
  await open(pg);
  check('markup in a task name is shown as text, not injected', await pg.evaluate(() => !document.querySelector('#tdGraphs img') && !document.querySelector('#tdGraphs svg img') && /onerror/.test(document.querySelector('.td-legend').textContent)));
  const f = await dl(pg, '#tdGCsv_daily'); await pg.evaluate(() => { const c = document.getElementById('tdGAnon'); c.checked = false; c.dispatchEvent(new Event('change')); }); const g = await dl(pg, '#tdGCsv_daily');
  check('a formula-looking task name is neutralised in the CSV', /,'=HYPERLINK/.test(g.buf.toString('utf8')) || /"'=HYPERLINK/.test(g.buf.toString('utf8'))); void f;
  /* log entries written by the task screens */
  await pg.evaluate(() => document.getElementById('tdTab_tasks').click()); await pg.waitForTimeout(200);
  await pg.evaluate(() => document.getElementById('tdNew').click()); await pg.waitForTimeout(200);
  await pg.evaluate(() => { const d = document.querySelector('dialog[open]'); [...d.querySelectorAll('input')].find(x => x.getAttribute('aria-label') === 'Task name').value = 'Logged task'; [...d.querySelectorAll('button')].find(x => x.textContent.trim() === 'Add task').click(); }); await pg.waitForTimeout(400);
  let s = await S(pg), ev = keys(s, 'todoEvents/').map(k => s[k]);
  check('creating a task writes a "created" log entry', ev.some(e => e.type === 'created'));
  const id = keys(s, 'todoTasks/').map(k => k.split('/')[1]).find(i => s['todoTasks/' + i].name === 'Logged task');
  const click = async re => { await pg.evaluate(([id, re]) => { const r = new RegExp(re, 'i'); [...document.querySelectorAll('.td-card[data-task="' + id + '"] button')].find(x => r.test(x.textContent + ' ' + (x.getAttribute('aria-label') || '')))?.click(); }, [id, re]); await pg.waitForTimeout(350); };
  await click('mark done'); s = await S(pg); check('Done writes a "done" log entry', keys(s, 'todoEvents/').map(k => s[k]).some(e => e.type === 'done' && e.taskId === id));
  await pg.evaluate(() => [...document.querySelectorAll('.td-filters button')].find(x => /all/i.test(x.textContent)).click()); await click('reopen'); s = await S(pg);
  check('Reopen writes a "reopened" log entry', keys(s, 'todoEvents/').map(k => s[k]).some(e => e.type === 'reopened' && e.taskId === id));
  await click('mark done'); s = await S(pg); check('finishing it again writes a second "done" entry', keys(s, 'todoEvents/').map(k => s[k]).filter(e => e.type === 'done' && e.taskId === id).length === 2);
  await pg.evaluate(() => document.getElementById('tdTab_graphs').click()); await pg.waitForTimeout(300); await pg.evaluate(() => document.getElementById('tdGRefresh').click()); await pg.waitForTimeout(500);
  check('this week counts that task once even with two completions', await pg.evaluate(() => /: [1-9] task/.test([...document.querySelectorAll('#tdChart2 .td-gbar')].pop().dataset.tip)));
  /* deleting a task removes its log entries */
  await pg.evaluate(() => document.getElementById('tdTab_tasks').click()); await pg.waitForTimeout(150);
  await pg.evaluate(id => { [...document.querySelectorAll('.td-card[data-task="' + id + '"] button')].find(x => /delete/i.test(x.getAttribute('aria-label') || ''))?.click(); }, id); await pg.waitForTimeout(300);
  await pg.evaluate(() => { const d = document.querySelector('dialog[open]'); [...d.querySelectorAll('button')].find(x => /delete task/i.test(x.textContent))?.click(); }); await pg.waitForTimeout(600); s = await S(pg);
  check('delete task also removes its log entries', !keys(s, 'todoEvents/').map(k => s[k]).some(e => e.taskId === id) && !s['todoTasks/' + id]);
  await signOut(pg); await pg.waitForTimeout(200);
  check('sign-out clears the graphs', await pg.evaluate(() => document.getElementById('tdGBody').children.length === 0));
  await ctx.close();
}
{
  const { ctx, pg } = await mk({ viewport: { width: 390, height: 844 } }); await signIn(pg); await pg.waitForTimeout(300); await seed(pg); await open(pg);
  check('phone: the graphs are really on screen', await pg.evaluate(() => document.querySelector('#tdChart1').getBoundingClientRect().height > 100 && document.querySelector('#tdChart1').getBoundingClientRect().width > 200));
  check('phone: default range is 7 days', await pg.evaluate(() => document.querySelectorAll('#tdChart1 .td-gbar').length === 7));
  check('phone: no horizontal scrolling, chart fits', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('#tdChart1').getBoundingClientRect().width <= innerWidth));
  check('phone: buttons are at least 44px high (and there are some to measure)', await pg.evaluate(() => { const bs = [...document.querySelectorAll('#tdGraphs .dbtn, .td-tabs button')].filter(x => x.offsetParent); return bs.length >= 8 && bs.every(x => x.getBoundingClientRect().height >= 43.5); }));
  await pg.evaluate(() => document.querySelector('#tdGRange button[data-r="30"]').click()); await pg.waitForTimeout(100);
  check('phone: 30 days still fits', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelectorAll('#tdChart1 .td-gbar').length === 30));
  await ctx.close();
}
{
  const { ctx, pg } = await mk(); await signIn(pg); await pg.waitForTimeout(300); await open(pg);
  check('empty account: the page shows messages, not errors', await pg.evaluate(() => /No time recorded/.test(document.querySelector('.td-legend').textContent) && /No task has allotted hours/.test(document.getElementById('tdGBody').textContent)));
  await ctx.close();
}
check('no page errors', errs.length === 0, errs.join('|'));
await b.close(); srv.close();
const bad = results.filter(r => !r[1]).length; console.log(bad ? bad + ' FAILED' : 'ALL PASSED'); process.exit(bad ? 1 : 0);
