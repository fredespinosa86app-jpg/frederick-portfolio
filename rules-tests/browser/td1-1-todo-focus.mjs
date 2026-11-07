/* TD1 browser test: To-do & focus page + floating focus clock (fake database, no network) */
import { b, check, errs, fresh, signIn, signOut, srv } from './w5-harness.mjs';
const extra = () => {
  const S = window.__store, F = window.OWN.fs, ms = () => Date.now();
  F.updateDoc = async (ref, d) => { if (!S[ref.path]) throw Object.assign(new Error('nf'), { code: 'not-found' }); S[ref.path] = Object.assign({}, S[ref.path], d); };
  F.writeBatch = () => { const ops = []; return { set: (r, d) => ops.push(['s', r.path, d]), update: (r, d) => ops.push(['u', r.path, d]), delete: r => ops.push(['d', r.path]), commit: async () => { ops.forEach(([k, p, d]) => { if (k === 's') S[p] = d; else if (k === 'u') S[p] = Object.assign({}, S[p], d); else delete S[p]; }); } }; };
  F.runTransaction = async (db, fn) => { const ops = []; const tx = { get: async r => { const d = S[r.path]; return { exists: () => !!d, data: () => d }; }, set: (r, d) => ops.push(['s', r.path, d]), update: (r, d) => ops.push(['u', r.path, d]), delete: r => ops.push(['d', r.path]) }; const res = await fn(tx); ops.forEach(([k, p, d]) => { if (k === 's') S[p] = d; else if (k === 'u') S[p] = Object.assign({}, S[p], d); else delete S[p]; }); return res; };
  window.__sess = () => Object.keys(S).filter(k => k.startsWith('todoSessions/')).map(k => S[k]);
};
const { ctx, pg } = await (async () => { const c = await fresh({ init: () => {} }); return c; })();
await pg.evaluate(extra);
await pg.waitForFunction(() => window.todoApi && window.__tdFloat);
const vis = () => pg.evaluate(() => { const e = document.getElementById('tdFloat'); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; });
const openPage = async () => { await pg.evaluate(() => { document.getElementById('dp-todo').hidden = false; document.dispatchEvent(new CustomEvent('dash:page', { detail: 'todo' })); }); await pg.waitForTimeout(250); };
const fillDlg = async (vals, okText) => { for (const [k, v] of Object.entries(vals)) { await pg.evaluate(([k, v]) => { const d = document.querySelector('dialog.dmodal[open]'); const i = [...d.querySelectorAll('input,textarea')].find(x => x.getAttribute('aria-label') === k); i.value = v; }, [k, v]); } await pg.evaluate(t => { const d = document.querySelector('dialog.dmodal[open]'); [...d.querySelectorAll('button')].find(x => x.textContent.trim() === t).click(); }, okText); await pg.waitForTimeout(250); };
const clickText = async (sel, re) => { await pg.evaluate(([sel, re]) => { const r = new RegExp(re, 'i'); [...document.querySelectorAll(sel)].find(x => r.test(x.textContent + ' ' + (x.getAttribute('aria-label') || '')))?.click(); }, [sel, re]); await pg.waitForTimeout(250); };
const dlgClick = async re => { await pg.evaluate(re => { const d = document.querySelector('dialog[open]'); const r = new RegExp(re, 'i'); [...d.querySelectorAll('button')].find(x => r.test(x.textContent))?.click(); }, re); await pg.waitForTimeout(300); };
const S = () => pg.evaluate(() => JSON.parse(JSON.stringify(window.__store, (k, v) => v && v.__ts ? v.ms : v)));
const keys = (s, p) => Object.keys(s).filter(k => k.startsWith(p));

await signIn(pg); await pg.waitForTimeout(400);
let s = await S();
check('state record created idle', s['todoState/main'] && s['todoState/main'].taskId === '' && s['todoState/main'].rev === 1);
check('nothing floating when idle', !(await vis()));
await openPage();
check('page built with New task button', await pg.evaluate(() => !!document.getElementById('tdNew')));
check('drawer has Planner section and To-do item', await pg.evaluate(() => [...document.querySelectorAll('.dnav h2')].some(h => h.textContent === 'Planner') && !!document.querySelector('.dnav button[data-page="todo"]')));

/* empty name is refused with a message, nothing saved */
await clickText('#tdNew', 'new task');
await pg.evaluate(() => { [...document.querySelector('dialog[open]').querySelectorAll('button')].find(x => /add task/i.test(x.textContent)).click(); }); await pg.waitForTimeout(150);
check('empty name refused', await pg.evaluate(() => /name/i.test(document.querySelector('dialog[open] .ferr').textContent)) && keys(await S(), 'todoTasks/').length === 0);
await fillDlg({ 'Task name': 'Write report', 'Description (optional)': 'Quarterly numbers', 'Due date (optional)': '2099-01-02', 'Hours allotted': '2', 'Focus block (minutes)': '1' }, 'Add task');
s = await S(); let tk = keys(s, 'todoTasks/');
check('task saved with the right shape', tk.length === 1 && s[tk[0]].name === 'Write report' && s[tk[0]].status === 'todo' && s[tk[0]].secs === 0 && s[tk[0]].hours === 2 && s[tk[0]].focusMin === 1 && s[tk[0]].due === '2099-01-02' && s[tk[0]].doneAt === null);
const id1 = tk[0].split('/')[1];
await clickText('#tdNew', 'new task'); await fillDlg({ 'Task name': 'Plan week', 'Hours allotted': '1', 'Focus block (minutes)': '25' }, 'Add task');
tk = keys(await S(), 'todoTasks/'); check('second task saved', tk.length === 2);
const id2 = tk.map(k => k.split('/')[1]).find(i => i !== id1);

/* play task 1 */
await clickText('.td-card[data-task="' + id1 + '"] button', 'play');
s = await S();
check('play: state runs task 1, goal = focus block, rev 2, task is doing', s['todoState/main'].taskId === id1 && s['todoState/main'].goalMin === 1 && s['todoState/main'].rev === 2 && s['todoTasks/' + id1].status === 'doing');
check('floating clock appears', await vis());
check('only one Pause button on the page', await pg.evaluate(() => document.querySelectorAll('.td-card button[aria-label^="Pause"]').length) === 1);

/* switching asks, then pauses task 1 and starts task 2 */
await clickText('.td-card[data-task="' + id2 + '"] button', 'play');
check('switch asks first', await pg.evaluate(() => !!document.querySelector('dialog[open]') && /switch/i.test(document.querySelector('dialog[open]').textContent)));
await dlgClick('cancel|no|keep'); s = await S();
check('cancel keeps task 1 running', s['todoState/main'].taskId === id1 && keys(s, 'todoSessions/').length === 0);
/* pretend 3 minutes passed on task 1 */
await pg.evaluate(() => { const st = window.__store['todoState/main']; st.startedAt = { __ts: true, ms: Date.now() - 180000, toMillis() { return this.ms; } }; });
await pg.evaluate(() => window.todoApi.sync(true)); await pg.waitForTimeout(1300);
check('focus block banner after the goal', await pg.evaluate(() => { const b = document.querySelector('#tdFloat .tdfl-banner'); return !!b && !b.hidden && /complete/i.test(b.textContent); }));
check('timer keeps running after the block', (await S())['todoState/main'].taskId === id1 && await vis());
await clickText('.td-card[data-task="' + id2 + '"] button', 'play'); await dlgClick('pause and start');
s = await S(); const ss = keys(s, 'todoSessions/');
check('switch: session for task 1 saved (about 3 min), task 1 secs updated', ss.length === 1 && s[ss[0]].taskId === id1 && s[ss[0]].secs >= 178 && s[ss[0]].secs <= 200 && s['todoTasks/' + id1].secs === s[ss[0]].secs);
check('switch: state now task 2, lastSid is the new session', s['todoState/main'].taskId === id2 && s['todoState/main'].lastSid === ss[0].split('/')[1] && s['todoState/main'].rev === 3);
check('note panel offered after the switch', await pg.evaluate(() => !document.querySelector('#tdFloat .tdfl-notepanel').hidden));
await pg.evaluate(() => { const t = document.querySelector('#tdFloat .tdfl-notepanel textarea'); t.value = 'Good progress on the numbers'; [...document.querySelectorAll('#tdFloat .tdfl-notepanel button')].find(x => /save note/i.test(x.textContent)).click(); }); await pg.waitForTimeout(300);
s = await S(); const nk = keys(s, 'todoNotes/');
check('note saved linked to the session', nk.length === 1 && s[nk[0]].taskId === id1 && s[nk[0]].text === 'Good progress on the numbers' && s[nk[0]].sessionId === ss[0].split('/')[1] && s[nk[0]].editedAt === null);

/* pause from the floating clock */
await pg.evaluate(() => { const st = window.__store['todoState/main']; st.startedAt = { __ts: true, ms: Date.now() - 120000, toMillis() { return this.ms; } }; });
await pg.evaluate(() => [...document.querySelectorAll('#tdFloat button')].find(x => x.textContent === 'Pause & save').click()); await pg.waitForTimeout(400);
s = await S();
check('pause: idle state, 2 sessions, task 2 has its time', s['todoState/main'].taskId === '' && s['todoState/main'].startedAt === null && keys(s, 'todoSessions/').length === 2 && s['todoTasks/' + id2].secs >= 118);
check('clock hidden but note panel still shown, then skip closes it', await pg.evaluate(() => !document.querySelector('#tdFloat .tdfl-notepanel').hidden));
await pg.evaluate(() => [...document.querySelectorAll('#tdFloat button')].find(x => x.textContent === 'Skip').click()); await pg.waitForTimeout(200);
check('after skip nothing floats', !(await vis()));

/* 12 hour guard */
await clickText('.td-card[data-task="' + id2 + '"] button', 'play');
await pg.evaluate(() => { const st = window.__store['todoState/main']; st.startedAt = { __ts: true, ms: Date.now() - 13 * 3600000, toMillis() { return this.ms; } }; });
await pg.evaluate(() => window.todoApi.sync(true)); await pg.waitForTimeout(1300);
check('13 h run: trim choices appear', await pg.evaluate(() => { const p = document.querySelector('#tdFloat .tdfl-panel'); return !p.hidden && /Save 12 h/.test(p.textContent) && /Keep running/.test(p.textContent); }));
await pg.evaluate(() => [...document.querySelectorAll('#tdFloat .tdfl-panel button')].find(x => /^Save 12 h/.test(x.textContent)).click()); await pg.waitForTimeout(400);
s = await S(); const big = keys(s, 'todoSessions/').map(k => s[k]).find(x => x.secs === 43200);
check('trimmed session saved at 12 h', !!big && s['todoState/main'].taskId === '');
await pg.evaluate(() => [...document.querySelectorAll('#tdFloat button')].find(x => x.textContent === 'Skip')?.click()); await pg.waitForTimeout(150);

/* manual time, history, trim, delete session */
await clickText('.td-card[data-task="' + id1 + '"] button', 'add time');
await fillDlg({ 'Minutes worked': '30' }, 'Add time'); s = await S();
const man = keys(s, 'todoSessions/').map(k => s[k]).find(x => x.kind === 'manual');
check('manual entry saved and labelled manual', !!man && man.secs === 1800 && man.taskId === id1);
await clickText('.td-card[data-task="' + id1 + '"] button', 'history');
check('history lists focus session, manual time and note', await pg.evaluate(() => { const t = document.querySelector('.td-hist').textContent; return /Focus session/.test(t) && /Added time/.test(t) && /Good progress/.test(t); }));
await pg.evaluate(() => [...document.querySelectorAll('.td-hist button')].find(x => /trim/i.test(x.getAttribute('aria-label') || '')).click()); await pg.waitForTimeout(200);
await fillDlg({ 'New length in minutes': '1' }, 'Trim'); s = await S();
check('trim makes a session shorter', keys(s, 'todoSessions/').some(k => s[k].taskId === id1 && s[k].secs === 60));

/* done, reopen */
await clickText('.td-card[data-task="' + id1 + '"] button', 'mark done'); s = await S();
check('mark done sets doneAt', s['todoTasks/' + id1].status === 'done' && s['todoTasks/' + id1].doneAt !== null);

/* delete cascade */
await clickText('.td-filters button', 'all');
await clickText('.td-card[data-task="' + id1 + '"] button', 'delete'); await dlgClick('delete task'); await pg.waitForTimeout(300); s = await S();
check('delete removes task, its sessions and notes', !s['todoTasks/' + id1] && !keys(s, 'todoSessions/').some(k => s[k].taskId === id1) && !keys(s, 'todoNotes/').some(k => s[k].taskId === id1));   /* the 12 h trim of task 2 left its own auto note, which must stay */

/* sign out clears */
await clickText('.td-card[data-task="' + id2 + '"] button', 'play');
check('running again', await vis());
await signOut(pg); await pg.waitForTimeout(200);
check('sign-out hides the clock and clears the list', !(await vis()) && await pg.evaluate(() => document.getElementById('tdList').children.length === 0 && document.getElementById('tdNow').children.length === 0));
check('no page errors', errs.length === 0, errs.join('|'));
await ctx.close(); await b.close(); srv.close();
const bad = (await import('./w5-harness.mjs')).results.filter(r => !r[1]).length; console.log(bad ? bad + ' FAILED' : 'ALL PASSED'); process.exit(bad ? 1 : 0);
