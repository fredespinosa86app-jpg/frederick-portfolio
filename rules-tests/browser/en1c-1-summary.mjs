/* (shared helpers copied from the TD2 test) */
/* EN-1C browser tests: weekly summary card on the Graphs tab (numbers, mail draft, copy, no storage, leaving the page, phone) - with a fake database */
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
const val = (pg, id) => pg.evaluate(id => document.getElementById(id).value, id);
const setV = (pg, id, v) => pg.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
const click = (pg, id) => pg.evaluate(id => document.getElementById(id).click(), id);
const snap = pg => pg.evaluate(() => JSON.stringify({ db: window.__store, ls: Object.entries(localStorage), ss: Object.entries(sessionStorage), ck: document.cookie }, (k, v) => v && v.__ts ? v.ms : v));
const trap = pg => pg.evaluate(() => { window.__mailto = ''; window.__copied = null; document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a'); if (a && /^mailto:/.test(a.href)) { e.preventDefault(); window.__mailto = a.href; } }, true); Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { window.__copied = t; } }, configurable: true }); });

{
  const { ctx, pg } = await mk(); await signIn(pg); await pg.waitForTimeout(300); const sd = await seedWeek(pg); await trap(pg); await openG(pg);
  const label = await pg.evaluate(() => { const G = window.coreTodoGraph, w = G.lastCompletedWeek(window.todoApi.todayKey()); return G.fmtDay(w.start) + ' to ' + G.fmtDay(w.end); });
  check('the card is on the Graphs tab, below the weekly chart and above hours used', await pg.evaluate(() => { const c = document.getElementById('tdWSum'), w = document.getElementById('tdChart2'), h = [...document.querySelectorAll('#tdGraphs h4')].find(x => /Hours used/.test(x.textContent)); return !!c && c.getBoundingClientRect().height > 100 && w.getBoundingClientRect().bottom <= c.getBoundingClientRect().top + 1 && c.getBoundingClientRect().bottom <= h.getBoundingClientRect().top + 1; }));
  check('it names the last completed Monday-to-Sunday week and the zone', (await txt(pg, '#tdWSum')).includes(label) && /\(Asia\/Manila\)/.test(await txt(pg, '#tdWSum')));
  const facts = await pg.evaluate(() => Object.fromEntries([...document.querySelectorAll('.td-wsum-facts dt')].map(d => [d.textContent, d.nextElementSibling.textContent])));
  check('focus time 4 h 00 m (1 h + 2 h + 1 h)', facts['Focus time'] === '4 h 00 m', JSON.stringify(facts));
  check('goal days met: 3 of 6, the rest-day Saturday is not counted', facts['Goal days met'] === '3 of 6 (rest days not counted)', JSON.stringify(facts));
  check('best day is Wednesday with 2 h 00 m', /^Wed \d+ \w+, 2 h 00 m$/.test(facts['Best day']), JSON.stringify(facts));
  check('streak at week end is 0 (Sunday had no focus time)', facts['Streak at week end'] === '0 days', JSON.stringify(facts));
  check('tasks completed 1, open now 2', facts['Tasks completed'] === '1 (open now: 2)', JSON.stringify(facts));
  const msg = await val(pg, 'tdWSText');
  check('the message starts with the title line and has numbers only (no task names, no address)', msg.split('\n')[0] === 'Focus summary, ' + label + ' (Asia/Manila)' && !/Write report|Plan week|@/.test(msg) && /Focus time: 4 h 00 m/.test(msg) && /snapshot taken on/.test(msg));
  const before = await snap(pg);
  await setV(pg, 'tdWSTo', 'not an address'); await click(pg, 'tdWSMail'); await pg.waitForTimeout(150);
  check('a bad address is refused with a plain message and no mail draft opens', /one e-mail address/.test(await txt(pg, '#tdWSErr')) && (await pg.evaluate(() => window.__mailto)) === '');
  await setV(pg, 'tdWSTo', 'a@b.com\nBcc: x@y.com'); await click(pg, 'tdWSMail'); await pg.waitForTimeout(100);
  check('an address with a hidden second line is refused', (await pg.evaluate(() => window.__mailto)) === '' && /one e-mail address/.test(await txt(pg, '#tdWSErr')));
  await setV(pg, 'tdWSTo', 'a@b.com'); await click(pg, 'tdWSMail'); await pg.waitForTimeout(150);
  const mt = await pg.evaluate(() => window.__mailto);
  check('a good address opens one mail draft: encoded subject and body with line breaks', mt.startsWith('mailto:a%40b.com?subject=Focus%20summary') && /&body=Focus%20summary/.test(mt) && mt.includes('%0D%0A') && !/%40b.com.*%40b.com/.test(mt) && (await txt(pg, '#tdWSErr')) === '', mt.slice(0, 120));
  await setV(pg, 'tdWSTo', ''); await click(pg, 'tdWSMail'); await pg.waitForTimeout(100);
  check('an empty address is allowed (the draft opens without a recipient)', /^mailto:\?subject=/.test(await pg.evaluate(() => window.__mailto)));
  await click(pg, 'tdWSCopy'); await pg.waitForTimeout(150);
  check('Copy text copies exactly what is in the box', (await pg.evaluate(() => window.__copied)) === (await val(pg, 'tdWSText')));
  await setV(pg, 'tdWSText', 'My own words\nFocus time: 4 h'); await pg.evaluate(() => document.querySelector('#tdGRange button[data-r="7"]').click()); await pg.waitForTimeout(200);
  check('an edited message survives redrawing the graphs; Reset text brings the original back', (await val(pg, 'tdWSText')).startsWith('My own words') && await (async () => { await click(pg, 'tdWSReset'); return (await val(pg, 'tdWSText')).startsWith('Focus summary, '); })());
  await pg.evaluate(() => { const e = document.getElementById('tdWSText'); e.maxLength = 99999; }); await pg.evaluate(() => { window.__mailto = ''; }); await setV(pg, 'tdWSText', 'x'.repeat(2500)); await click(pg, 'tdWSMail'); await pg.waitForTimeout(100);
  check('a message too long for a mail link says to use Copy text', /Copy text/.test(await txt(pg, '#tdWSErr')) && (await pg.evaluate(() => window.__mailto)) === '');
  await click(pg, 'tdWSReset');
  const after = await snap(pg);
  check('using the card writes nothing: the database, local storage, session storage and cookies are unchanged', before === after);
  await setV(pg, 'tdWSTo', 'a@b.com'); await setV(pg, 'tdWSText', 'edited');
  await pg.evaluate(() => document.querySelector('.dnav button[data-page="general"]').click()); await pg.waitForTimeout(300); await pg.evaluate(() => document.querySelector('.dnav button[data-page="todo"]').click()); await pg.waitForTimeout(500);
  await pg.evaluate(() => document.getElementById('tdTab_graphs').click()); await pg.waitForTimeout(600);
  check('after leaving the page and coming back the address box is empty and the text is the fresh one', (await val(pg, 'tdWSTo')) === '' && (await val(pg, 'tdWSText')).startsWith('Focus summary, '));
  check('the typed address is nowhere in the page storage or the database', !(await snap(pg)).includes('a@b.com'));
  await pg.evaluate(() => { const e = document.getElementById('tdWSTo'); e.value = 'z@y.com'; e.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('tdTab_tasks').click(); }); await pg.waitForTimeout(300); await pg.evaluate(() => document.getElementById('tdTab_graphs').click()); await pg.waitForTimeout(600);
  check('switching to the Tasks tab also forgets the address', (await val(pg, 'tdWSTo')) === '');
  await ctx.close();
}
/* a new account: the week is before the first record */
{
  const { ctx, pg } = await mk(); await signIn(pg); await pg.waitForTimeout(300);
  await pg.evaluate(() => { window.__store['todoTasks/taskAAAA1'] = { name: 'First task', desc: '', due: '', hours: 1, focusMin: 25, status: 'todo', secs: 0, doneAt: null, color: 0, createdAt: window.__ts(Date.now()), updatedAt: window.__ts(Date.now()) }; });
  await openG(pg);
  check('new account: the card says there is no data yet and offers no mail or copy buttons', /no focus data for this week yet/.test(await txt(pg, '#tdWSNo')) && !(await pg.evaluate(() => !!document.getElementById('tdWSMail') || !!document.getElementById('tdWSCopy'))));
  await ctx.close();
}
/* no goals at all */
{
  const { ctx, pg } = await mk(); await signIn(pg); await pg.waitForTimeout(300); await seedWeek(pg); await pg.evaluate(() => { window.__store['todoPrefs/main'] = { dailyGoalMin: 0, updatedAt: window.__ts(Date.now()) }; }); await openG(pg);
  const facts = await pg.evaluate(() => [...document.querySelectorAll('.td-wsum-facts dt')].map(d => d.textContent));
  check('no goals: the goal and streak lines are left out, focus time stays', !facts.includes('Goal days met') && !facts.includes('Streak at week end') && facts.includes('Focus time') && !/Goal days|Streak/.test(await val(pg, 'tdWSText')));
  await ctx.close();
}
/* time zone change moves the week */
{
  const { ctx, pg } = await mk(); await signIn(pg); await pg.waitForTimeout(300); await seedWeek(pg); await openG(pg);
  await pg.evaluate(() => { window.OWN.fs.setDoc(window.OWN.fs.doc({}, 'ownerPrefs', 'main'), { tz: 'Pacific/Kiritimati', prevTz: '', rev: 1, updatedAt: 1 }); }); await pg.evaluate(() => document.querySelector('.dnav button[data-page="general"]').click()); await pg.waitForTimeout(300);
  await setIn2(pg); await pg.waitForTimeout(500);
  check('the card follows the General time zone', /\(Pacific\/Kiritimati\)/.test(await txt(pg, '#tdWSum')) && (await val(pg, 'tdWSText')).includes('(Pacific/Kiritimati)'));
  await ctx.close();
}
async function setIn2(pg) { await pg.evaluate(() => { const e = document.getElementById('otzTz'); e.value = 'Pacific/Kiritimati'; e.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('otzSave').click(); }); await pg.waitForTimeout(400); await pg.evaluate(() => document.querySelector('.dnav button[data-page="todo"]').click()); await pg.waitForTimeout(500); await pg.evaluate(() => document.getElementById('tdTab_graphs').click()); }
/* phone */
{
  const { ctx, pg } = await mk({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }); await signIn(pg); await pg.waitForTimeout(300); await seedWeek(pg); await openG(pg);
  check('phone: the card fits the screen with no sideways scrolling', await pg.evaluate(() => { const c = document.getElementById('tdWSum').getBoundingClientRect(); return c.left >= 0 && c.right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1 && c.height > 150; }));
  const sz = await pg.evaluate(() => ['tdWSMail', 'tdWSCopy', 'tdWSTo'].map(i => { const r = document.getElementById(i).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  check('phone: the two buttons and the address box are at least 44 px tall and the buttons are full width', sz.every(s => s[1] >= 43.5) && sz[0][0] === sz[1][0] && sz[0][0] >= (await pg.evaluate(() => Math.round(document.getElementById('tdWSum').getBoundingClientRect().width))) - 30, JSON.stringify(sz));
  check('phone: the facts stack in one column', await pg.evaluate(() => { const dts = [...document.querySelectorAll('.td-wsum-facts dt')].map(d => Math.round(d.getBoundingClientRect().left)), dds = [...document.querySelectorAll('.td-wsum-facts dd')].map(d => Math.round(d.getBoundingClientRect().left)); return new Set(dts.concat(dds)).size === 1; }));
  await ctx.close();
}
check('no page errors', errs.length === 0, errs.join('|'));
await b.close(); srv.close();
const bad = results.filter(r => !r[1]).length; console.log(bad ? bad + ' FAILED' : 'ALL PASSED'); process.exit(bad ? 1 : 0);
