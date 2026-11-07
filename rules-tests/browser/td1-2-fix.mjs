/* TD1-fix browser tests: WorkTrack exclusion, search, auto-notes, big/interrupted delete, reload recovery, phone layout (fake database, no network) */
import { b, check, errs, fresh, signIn, srv, results } from './w5-harness.mjs';
const extra = () => {
  const S = window.__store, F = window.OWN.fs;
  F.updateDoc = async (ref, d) => { if (!S[ref.path]) throw Object.assign(new Error('nf'), { code: 'not-found' }); S[ref.path] = Object.assign({}, S[ref.path], d); };
  const apply = ops => ops.forEach(([k, p, d]) => { if (k === 's') S[p] = d; else if (k === 'u') S[p] = Object.assign({}, S[p], d); else delete S[p]; });
  window.__batches = 0; window.__failAfter = -1;
  F.writeBatch = () => { const ops = []; return { set: (r, d) => ops.push(['s', r.path, d]), update: (r, d) => ops.push(['u', r.path, d]), delete: r => ops.push(['d', r.path]), commit: async () => { if (window.__failAfter >= 0 && window.__batches >= window.__failAfter) throw Object.assign(new Error('x'), { code: 'unavailable' }); window.__batches++; apply(ops); } }; };
  F.runTransaction = async (db, fn) => { const ops = []; const tx = { get: async r => { const d = S[r.path]; return { exists: () => !!d, data: () => d }; }, set: (r, d) => ops.push(['s', r.path, d]), update: (r, d) => ops.push(['u', r.path, d]), delete: r => ops.push(['d', r.path]) }; const res = await fn(tx); apply(ops); return res; };
  window.__ts = ms => ({ __ts: true, ms, toMillis() { return this.ms; } });
};
const seedTask = (id, o = {}) => ({ name: 'Task ' + id, desc: 'about ' + id, due: '', hours: 1, focusMin: 25, status: 'todo', secs: 0, doneAt: null, color: 0, createdAt: { __ts: true, ms: 1700000000000 }, updatedAt: { __ts: true, ms: 1700000000000 }, ...o });
const mkPage = async (opts = {}) => { const c = await fresh(opts); await c.pg.evaluate(extra); await c.pg.waitForFunction(() => window.todoApi && window.__tdFloat); return c; };
const S = pg => pg.evaluate(() => JSON.parse(JSON.stringify(window.__store, (k, v) => v && v.__ts ? v.ms : v)));
const keys = (s, p) => Object.keys(s).filter(k => k.startsWith(p));
const openPage = async pg => { await pg.evaluate(() => { document.getElementById('dp-todo').hidden = false; document.dispatchEvent(new CustomEvent('dash:page', { detail: 'todo' })); }); await pg.waitForTimeout(300); };
const vis = pg => pg.evaluate(() => { const e = document.getElementById('tdFloat'); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; });
const dlgClick = async (pg, re) => { await pg.evaluate(re => { const d = document.querySelector('dialog[open]'); const r = new RegExp(re, 'i'); [...d.querySelectorAll('button')].find(x => r.test(x.textContent))?.click(); }, re); await pg.waitForTimeout(300); };
const clickIn = async (pg, id, re) => { await pg.evaluate(([id, re]) => { const r = new RegExp(re, 'i'); [...document.querySelectorAll('.td-card[data-task="' + id + '"] button')].find(x => r.test(x.textContent + ' ' + (x.getAttribute('aria-label') || '')))?.click(); }, [id, re]); await pg.waitForTimeout(300); };
const seed = (pg, objs) => pg.evaluate(o => { Object.keys(o).forEach(k => { const v = JSON.parse(JSON.stringify(o[k]), (kk, vv) => vv && vv.__ts ? window.__ts(vv.ms) : vv); window.__store[k] = v; }); }, objs);

/* ---- 1. WorkTrack exclusion */
{
  const { ctx, pg } = await mkPage(); await signIn(pg); await pg.waitForTimeout(300);
  await seed(pg, { 'todoTasks/taskAAAA1': seedTask('taskAAAA1'), 'todoTasks/taskBBBB2': seedTask('taskBBBB2') }); await openPage(pg);
  await pg.evaluate(() => { window.__wt = 'WORKING'; window.wtApi = { signedIn: () => true, refresh: async () => {}, state: () => ({ state: window.__wt }), now: () => Date.now() }; });
  await clickIn(pg, 'taskAAAA1', 'play');
  let s = await S(pg);
  check('Play is refused while WorkTrack says WORKING', s['todoState/main'].taskId === '' && !(await vis(pg)));
  check('the refusal is explained', await pg.evaluate(() => /clocked in to WorkTrack/i.test(document.body.textContent)));
  await pg.evaluate(() => { window.__wt = 'LUNCH'; }); await clickIn(pg, 'taskAAAA1', 'play'); s = await S(pg);
  check('Play is allowed during lunch', s['todoState/main'].taskId === 'taskAAAA1' && await vis(pg));
  for (const st of ['FIRST_BREAK', 'LAST_BREAK', 'NOT_STARTED']) { await pg.evaluate(() => [...document.querySelectorAll('#tdFloat button')].find(x => /pause & save/i.test(x.textContent)).click()); await pg.waitForTimeout(300); await pg.evaluate(() => [...document.querySelectorAll('#tdFloat button')].find(x => x.textContent === 'Skip')?.click()); await pg.evaluate(v => { window.__wt = v; }, st); await clickIn(pg, 'taskAAAA1', 'play'); s = await S(pg); check('Play is allowed in state ' + st, s['todoState/main'].taskId === 'taskAAAA1'); }
  /* WorkTrack side: clock in while a timer runs */
  await pg.evaluate(() => { window.__g = null; window.tdGuard.beforeWork('CLOCK_IN').then(v => { window.__g = v; }); }); await pg.waitForTimeout(300);
  check('clock-in asks to pause the focus timer', await pg.evaluate(() => !!document.querySelector('dialog[open]') && /focus timer is running/i.test(document.querySelector('dialog[open]').textContent)));
  await dlgClick(pg, 'cancel|no|keep'); s = await S(pg);
  check('cancel: timer keeps running and clock-in is not allowed', s['todoState/main'].taskId === 'taskAAAA1' && await pg.evaluate(() => window.__g === false));
  await pg.evaluate(() => { window.__g = null; window.tdGuard.beforeWork('LUNCH_IN').then(v => { window.__g = v; }); }); await pg.waitForTimeout(300); await dlgClick(pg, 'pause and continue'); s = await S(pg);
  check('confirm: timer paused and saved, clock-in may continue', s['todoState/main'].taskId === '' && await pg.evaluate(() => window.__g === true) && keys(s, 'todoSessions/').length >= 1);
  check('other punches (break start) are not asked', await pg.evaluate(async () => (await window.tdGuard.beforeWork('LUNCH_OUT')) === true));
  check('owner-worktrack.js calls the guard before recording', (await import('node:fs')).readFileSync(new URL('../../scripts/owner-worktrack.js', import.meta.url), 'utf8').includes('window.tdGuard.beforeWork(type)'));
  await ctx.close();
}
/* ---- 2. search, More actions, auto-notes, trim */
{
  const { ctx, pg } = await mkPage(); await signIn(pg); await pg.waitForTimeout(300);
  await seed(pg, { 'todoTasks/taskAAAA1': seedTask('taskAAAA1', { name: 'Invoice review' }), 'todoTasks/taskBBBB2': seedTask('taskBBBB2', { name: 'Plan week', desc: 'quarterly goals' }) }); await openPage(pg);
  await pg.evaluate(v => { const i = document.getElementById('tdSearch'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, 'invoice'); await pg.waitForTimeout(150);
  check('search by name', await pg.evaluate(() => document.querySelectorAll('.td-card').length === 1 && /Invoice review/.test(document.querySelector('.td-card').textContent)));
  await pg.evaluate(v => { const i = document.getElementById('tdSearch'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, 'quarterly'); await pg.waitForTimeout(150);
  check('search by description', await pg.evaluate(() => document.querySelectorAll('.td-card').length === 1 && /Plan week/.test(document.querySelector('.td-card').textContent)));
  await pg.evaluate(v => { const i = document.getElementById('tdSearch'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, 'zzz'); await pg.waitForTimeout(150);
  check('no match message', await pg.evaluate(() => /No task matches/.test(document.getElementById('tdList').textContent)));
  await pg.evaluate(v => { const i = document.getElementById('tdSearch'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, ''); await pg.waitForTimeout(150);
  /* manual time then trim writes an auto note with the original length */
  await seed(pg, { 'todoSessions/sessAAAA1': { taskId: 'taskAAAA1', start: window0(), secs: 3600, day: '2026-11-07', kind: 'manual', createdAt: window0() } });
  await pg.evaluate(() => window.__todoTest.reload()); await pg.waitForTimeout(200);
  await pg.evaluate(() => { document.querySelector('.td-card[data-task="taskAAAA1"] .td-morebtn').click(); }); await pg.waitForTimeout(100);
  await clickIn(pg, 'taskAAAA1', 'history'); await pg.waitForTimeout(300);
  await pg.evaluate(() => [...document.querySelectorAll('.td-hist button')].find(x => /trim/i.test(x.getAttribute('aria-label') || '')).click()); await pg.waitForTimeout(200);
  await pg.evaluate(() => { const d = document.querySelector('dialog[open]'); d.querySelector('input').value = '10'; [...d.querySelectorAll('button')].find(x => x.textContent.trim() === 'Trim').click(); }); await pg.waitForTimeout(400);
  let s = await S(pg); const n = keys(s, 'todoNotes/').map(k => s[k]);
  check('trim keeps the original length in an auto note linked to the session', n.length === 1 && /Auto note/.test(n[0].text) && /1h|1 h|60/.test(n[0].text) && n[0].sessionId === 'sessAAAA1');
  check('trimmed session is shorter', s['todoSessions/sessAAAA1'].secs === 600);
  /* 13 h run trimmed to the focus block: auto note too */
  await pg.evaluate(() => { document.querySelector('.td-card[data-task="taskBBBB2"] button[aria-label^="Play"]').click(); }); await pg.waitForTimeout(400);
  await pg.evaluate(() => { window.__store['todoState/main'].startedAt = window.__ts(Date.now() - 13 * 3600000); window.todoApi.sync(true); }); await pg.waitForTimeout(1400);
  await pg.evaluate(() => [...document.querySelectorAll('#tdFloat .tdfl-panel button')].find(x => /^Save 25/.test(x.textContent) || /^Save 0/.test(x.textContent) || /^Save/.test(x.textContent)).click()); await pg.waitForTimeout(500);
  s = await S(pg); const n2 = keys(s, 'todoNotes/').map(k => s[k]).filter(x => x.taskId === 'taskBBBB2');
  check('12 h guard trim writes an auto note', n2.length === 1 && /ran 13/.test(n2[0].text.replace('h ', 'h ')) || (n2.length === 1 && /Auto note/.test(n2[0].text)));
  await ctx.close();
}
function window0() { return { __ts: true, ms: 1700000000000 }; }
/* ---- 3. big delete (1200 sessions) and an interrupted delete */
{
  const { ctx, pg } = await mkPage(); await signIn(pg); await pg.waitForTimeout(300);
  await pg.evaluate(() => { const S = window.__store, t = window.__ts(1700000000000); S['todoTasks/taskBIG01'] = { name: 'Big', desc: '', due: '', hours: 0, focusMin: 25, status: 'todo', secs: 0, doneAt: null, color: 0, createdAt: t, updatedAt: t }; for (let i = 0; i < 1200; i++) S['todoSessions/sessBIG' + String(i).padStart(5, '0')] = { taskId: 'taskBIG01', start: t, secs: 60, day: '2026-11-07', kind: 'manual', createdAt: t }; for (let i = 0; i < 30; i++) S['todoNotes/noteBIG' + String(i).padStart(5, '0')] = { taskId: 'taskBIG01', text: 'n' + i, sessionId: '', createdAt: t, editedAt: null }; window.__failAfter = 2; });
  await openPage(pg);
  await clickIn(pg, 'taskBIG01', 'history'); await pg.waitForTimeout(300);
  check('big history shows the 1000 limit notice', await pg.evaluate(() => /first 1000/.test(document.querySelector('.td-hist').textContent)));
  await pg.evaluate(() => document.querySelector('.td-card[data-task="taskBIG01"] .td-morebtn').click());
  await clickIn(pg, 'taskBIG01', 'delete'); await pg.waitForTimeout(100); check('confirm says 1000 or more', await pg.evaluate(() => /1000 or more/.test(document.querySelector('dialog[open]').textContent)));
  await dlgClick(pg, 'delete task'); await pg.waitForTimeout(500);
  let s = await S(pg);
  check('interrupted delete: the task is still there, partly cleaned', !!s['todoTasks/taskBIG01'] && keys(s, 'todoSessions/').length > 0 && keys(s, 'todoSessions/').length < 1200);
  check('interrupted delete: an error with next step is shown', await pg.evaluate(() => /interrupted/i.test(document.body.textContent)));
  await pg.evaluate(() => { window.__failAfter = -1; }); await pg.evaluate(() => document.querySelector('.td-card[data-task="taskBIG01"] .td-morebtn')?.click());
  await clickIn(pg, 'taskBIG01', 'delete'); await dlgClick(pg, 'delete task'); await pg.waitForTimeout(800); s = await S(pg);
  check('second try finishes: no task, no sessions, no notes', !s['todoTasks/taskBIG01'] && keys(s, 'todoSessions/').length === 0 && keys(s, 'todoNotes/').length === 0);
  check('deleted in batches of at most 400 (several rounds)', await pg.evaluate(() => window.__batches >= 4));
  await ctx.close();
}
/* ---- 4. reload recovery: a timer started earlier is shown after a fresh page load */
{
  const { ctx, pg } = await fresh({ init: () => { const S = window.__store, t = ms => ({ __ts: true, ms, toMillis() { return this.ms; } }); S['todoTasks/taskREC01'] = { name: 'Recover me', desc: '', due: '', hours: 1, focusMin: 25, status: 'doing', secs: 0, doneAt: null, color: 0, createdAt: t(1700000000000), updatedAt: t(1700000000000) }; S['todoState/main'] = { taskId: 'taskREC01', startedAt: t(Date.now() - 7 * 60000), goalMin: 25, lastSid: '', rev: 2, updatedAt: t(1700000000000) }; } });
  await pg.waitForFunction(() => window.todoApi); await signIn(pg); await pg.waitForTimeout(600);
  check('after a reload the clock is back with the elapsed time (about 7 min)', await vis(pg) && await pg.evaluate(() => /^[67]:\d\d$/.test(document.querySelector('#tdFloat .wtfl-time').textContent)));
  check('and it names the task', await pg.evaluate(() => /Recover me/.test(document.querySelector('#tdFloat').textContent)));
  await ctx.close();
}
/* ---- 5. phone layout */
{
  const { ctx, pg } = await mkPage({ viewport: { width: 390, height: 844 } }); await signIn(pg); await pg.waitForTimeout(300);
  await seed(pg, { 'todoTasks/taskAAAA1': seedTask('taskAAAA1') }); await pg.click('#dashOpen'); await pg.waitForTimeout(400); await pg.evaluate(() => document.querySelector('.dnav button[data-page="todo"]').click()); await pg.waitForTimeout(500);
  check('phone: the task page is really on screen', await pg.evaluate(() => document.querySelector('.td-card').getBoundingClientRect().height > 50));
  check('phone: secondary actions hidden until More actions is pressed', await pg.evaluate(() => { const m = document.querySelector('.td-act2'), btn = document.querySelector('.td-morebtn'); return getComputedStyle(m).display === 'none' && getComputedStyle(btn).display !== 'none'; }));
  await pg.evaluate(() => document.querySelector('.td-morebtn').click()); await pg.waitForTimeout(100);
  check('phone: More actions shows them', await pg.evaluate(() => getComputedStyle(document.querySelector('.td-act2')).display === 'flex'));
  check('phone: tap targets are at least 44px (and there are some to measure)', await pg.evaluate(() => { const bs = [...document.querySelectorAll('.td-card .dbtn')].filter(x => x.offsetParent); return bs.length >= 4 && bs.every(x => x.getBoundingClientRect().height >= 43.5); }));
  await pg.evaluate(() => document.querySelector('.td-card button[aria-label^="Play"]').click()); await pg.waitForTimeout(500);
  const r = await pg.evaluate(() => { const e = document.getElementById('tdFloat').getBoundingClientRect(); const p = [...document.querySelectorAll('#tdFloat button')].find(x => /pause & save/i.test(x.textContent)).getBoundingClientRect(); return { l: e.left, r: e.right, b: e.bottom, w: e.width, ph: p.height, vw: innerWidth, vh: innerHeight, pw: p.width }; });
  check('phone: focus clock is a full-width bar at the bottom edge', r.l <= 1 && Math.abs(r.r - r.vw) <= 1 && Math.abs(r.b - r.vh) <= 1);
  check('phone: Pause & save is big enough and inside the screen', r.ph >= 43.5 && r.pw > 60);
  check('phone: no horizontal scrolling', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await ctx.close();
}
check('no page errors', errs.length === 0, errs.join('|'));
await b.close(); srv.close();
const bad = results.filter(r => !r[1]).length; console.log(bad ? bad + ' FAILED' : 'ALL PASSED'); process.exit(bad ? 1 : 0);
