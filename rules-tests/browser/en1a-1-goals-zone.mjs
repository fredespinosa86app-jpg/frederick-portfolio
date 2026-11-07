/* (shared helpers copied from the TD2 test) */
/* EN-1A browser tests: goal per weekday on the Graphs tab, rest days, and the owner time zone card (General page) - with a fake database */
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

const gen = async pg => { await pg.evaluate(() => document.querySelector('.dnav button[data-page="general"]').click()); await pg.waitForTimeout(300); };
const gridOk = pg => pg.evaluate(() => { const g = document.querySelector('.td-gwk-grid'), r = g.getBoundingClientRect(), ins = [...g.querySelectorAll('input')].map(i => i.getBoundingClientRect()); return ins.length === 7 && ins.every(x => x.width > 20 && x.left >= 0 && x.right <= innerWidth + 1) && document.documentElement.scrollWidth <= innerWidth + 1 && r.height > 30; });
const setIn = (pg, id, v) => pg.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
const click = (pg, id) => pg.evaluate(id => document.getElementById(id).click(), id);

{
  const { ctx, pg } = await mk(); await signIn(pg); await pg.waitForTimeout(300); await seed(pg); await open(pg);
  check('the weekday grid shows 7 labelled boxes with an accessible name each', await pg.evaluate(() => { const ins = [...document.querySelectorAll('.td-gwk-grid input')]; return ins.length === 7 && ins.every(i => document.querySelector('label[for="' + i.id + '"]').textContent.length > 3) && /Monday goal in minutes/.test(document.querySelector('label[for="tdGWd0"]').textContent) && /Sunday goal in minutes/.test(document.querySelector('label[for="tdGWd6"]').textContent); }));
  check('with nothing set the boxes are empty and say "no goal"', await pg.evaluate(() => [...document.querySelectorAll('.td-gwk-grid input')].every(i => i.value === '') && document.getElementById('tdGWh0').textContent === 'no goal'));
  await setIn(pg, 'tdGGoal', '30'); await click(pg, 'tdGGoalSave'); await pg.waitForTimeout(300);
  let s = await S(pg);
  check('saving only the daily goal writes no weekday list (exactly the old document)', JSON.stringify(Object.keys(s['todoPrefs/main']).sort()) === JSON.stringify(['dailyGoalMin', 'updatedAt']) && s['todoPrefs/main'].dailyGoalMin === 30);
  check('boxes show "uses 30" once a daily goal exists', await txt(pg, '#tdGWh2') === 'uses 30');
  await setIn(pg, 'tdGWd0', '45'); await click(pg, 'tdGWdCopy'); await setIn(pg, 'tdGWd5', '0');
  check('Copy Monday fills Tuesday to Friday only; a 0 shows "rest"', await pg.evaluate(() => ['tdGWd1', 'tdGWd2', 'tdGWd3', 'tdGWd4'].every(i => document.getElementById(i).value === '45') && document.getElementById('tdGWd5').value === '0' && document.getElementById('tdGWd6').value === '' && document.getElementById('tdGWh5').textContent === 'rest'));
  await click(pg, 'tdGWdSave'); await pg.waitForTimeout(400); s = await S(pg);
  check('Save goals writes the list (Monday first) and keeps the daily goal', JSON.stringify(s['todoPrefs/main'].weekdayGoalMin) === JSON.stringify([45, 45, 45, 45, 45, 0, null]) && s['todoPrefs/main'].dailyGoalMin === 30);
  check('the chart shows per-day dashed marks, a "rest" label and no single goal line', await pg.evaluate(() => { const t = document.querySelector('#tdChart1 svg'); return /dashed mark = goal for that day/.test(t.textContent) && /rest/.test(t.textContent) && !/goal 30 m<\/text>/.test(t.outerHTML) && t.querySelectorAll('line[stroke-dasharray="5 3"]').length >= 4; }));
  check('the streak line mentions skipped rest days', /rest days skipped/.test(await txt(pg, '#tdGStreak')));
  check('every bar tooltip names its own goal or rest day', await pg.evaluate(() => { const t = [...document.querySelectorAll('#tdChart1 .td-gbar')].map(g => g.dataset.tip); return t.some(x => /rest day/.test(x)) && t.some(x => /goal 45 m/.test(x)) && t.some(x => /goal 30 m/.test(x)); }));
  await pg.evaluate(() => [...document.querySelectorAll('#tdGraphs button')].find(x => /Show as table/.test(x.textContent)).click()); await pg.waitForTimeout(150);
  check('the table gets a Goal column that says "rest day" for the rest day', await pg.evaluate(() => { const t = document.querySelector('#tdTbl_daily table'); return !!t && [...t.querySelectorAll('thead th')].some(h => h.textContent === 'Goal') && /rest day/.test(t.textContent) && /45 m, (reached|not reached)/.test(t.textContent); }));
  const f = await dl(pg, '#tdGCsv_daily'), text = f.buf.toString('utf8');
  check('the CSV gets a Goal minutes column', /Total minutes,Goal minutes/.test(text.split('\r\n')[0]));
  /* refusals */
  await setIn(pg, 'tdGWd0', '1441'); await click(pg, 'tdGWdSave'); await pg.waitForTimeout(300); s = await S(pg);
  check('1441 is refused and nothing changes in the database', JSON.stringify(s['todoPrefs/main'].weekdayGoalMin) === JSON.stringify([45, 45, 45, 45, 45, 0, null]));
  await setIn(pg, 'tdGWd0', '1.5'); await click(pg, 'tdGWdSave'); await pg.waitForTimeout(300); s = await S(pg);
  check('a fraction is refused', s['todoPrefs/main'].weekdayGoalMin[0] === 45);
  await setIn(pg, 'tdGWd0', '45');
  /* daily save keeps the saved weekday list */
  await setIn(pg, 'tdGGoal', '90'); await click(pg, 'tdGGoalSave'); await pg.waitForTimeout(300); s = await S(pg);
  check('saving the daily goal afterwards keeps the weekday list', s['todoPrefs/main'].dailyGoalMin === 90 && JSON.stringify(s['todoPrefs/main'].weekdayGoalMin) === JSON.stringify([45, 45, 45, 45, 45, 0, null]));
  /* clear */
  await click(pg, 'tdGWdClear'); await click(pg, 'tdGWdSave'); await pg.waitForTimeout(300); s = await S(pg);
  check('clearing and saving removes the list; the daily goal is used for every day again', !('weekdayGoalMin' in s['todoPrefs/main']) && s['todoPrefs/main'].dailyGoalMin === 90 && /goal 1 h 30 m/.test(await txt(pg, '#tdChart1 svg')) && !/rest days skipped/.test(await txt(pg, '#tdGStreak')));
  /* all rest + daily 0 */
  await setIn(pg, 'tdGGoal', '0'); await click(pg, 'tdGGoalSave'); await pg.waitForTimeout(300);
  check('daily goal 0 and no weekday goals: streaks off, no goal marks', /Set a daily goal, or a goal for a weekday/.test(await txt(pg, '#tdGStreak')) && !/dashed mark/.test(await txt(pg, '#tdChart1 svg')));
  await setIn(pg, 'tdGWd2', '60'); await click(pg, 'tdGWdSave'); await pg.waitForTimeout(300);
  check('a goal on a single weekday turns the streak on even with the daily goal off', /Current streak/.test(await txt(pg, '#tdGStreak')));
  await ctx.close();
}
/* a new account with no records before today (the owner's live-test case) */
{
  const { ctx, pg } = await mk(); await signIn(pg); await pg.waitForTimeout(300);
  await pg.evaluate(() => { window.__store['todoPrefs/main'] = { dailyGoalMin: 0, weekdayGoalMin: [60, 60, 60, 60, 60, 0, null], updatedAt: window.__ts(Date.now()) }; window.__store['todoTasks/taskAAAA1'] = { name: 'First task', desc: '', due: '', hours: 1, focusMin: 25, status: 'todo', secs: 0, doneAt: null, color: 0, createdAt: window.__ts(Date.now()), updatedAt: window.__ts(Date.now()) }; });   // the first record is today, like a new account
  await open(pg); await pg.evaluate(() => [...document.querySelectorAll('#tdGraphs button')].find(x => /Show as table/.test(x.textContent)).click()); await pg.waitForTimeout(200);
  check('empty account: the streak line ends with "(rest days skipped)"', /\(rest days skipped\)$/.test((await txt(pg, '#tdGStreak')).trim()), await txt(pg, '#tdGStreak'));
  check('empty account: a Saturday with "no data" still says "rest day" in the Goal column', await pg.evaluate(() => { const rows = [...document.querySelectorAll('#tdTbl_daily tbody tr')]; const sat = rows.filter(r => /^Sat /.test(r.querySelector('th').textContent)); return sat.length >= 1 && sat.every(r => /rest day/.test(r.lastElementChild.textContent)) && sat.some(r => /no data/.test(r.children[1].textContent)); }));
  check('empty account: other no-data days leave the Goal cell empty (nothing invented)', await pg.evaluate(() => { const rows = [...document.querySelectorAll('#tdTbl_daily tbody tr')].filter(r => /no data/.test(r.children[1].textContent) && !/^Sat /.test(r.querySelector('th').textContent)); return rows.length >= 3 && rows.every(r => r.lastElementChild.textContent === ''); }));
  check('empty account: the per-day note does not sit on the top gridline (it has its own band above the plot)', await pg.evaluate(() => { const svg = document.querySelector('#tdChart1 svg'), tx = [...svg.querySelectorAll('text')].find(x => /dashed mark/.test(x.textContent)), top = [...svg.querySelectorAll('line')].map(l => Number(l.getAttribute('y1'))).filter(Boolean); return !!tx && Number(tx.getAttribute('y')) < Math.min(...top) - 8; }));
  await ctx.close();
}
/* phone */
{
  const { ctx, pg } = await mk({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }); await signIn(pg); await pg.waitForTimeout(300); await seed(pg); await open(pg);
  check('phone: the weekday grid fits the screen, no sideways scrolling', await gridOk(pg));
  check('phone: boxes and buttons are at least 44 px tall', await pg.evaluate(() => [...document.querySelectorAll('.td-gwk-grid input, .td-gwk-act .dbtn')].every(e => e.getBoundingClientRect().height >= 43.5)));
  check('phone: the grid uses two rows (4 + 3)', await pg.evaluate(() => { const t = [...document.querySelectorAll('.td-gwk-grid input')].map(i => Math.round(i.getBoundingClientRect().top)); return new Set(t).size === 2; }));
  await ctx.close();
}
/* owner time zone card */
{
  const { ctx, pg } = await mk(); await signIn(pg); await pg.waitForTimeout(300); await seed(pg); await pg.click('#dashOpen'); await pg.waitForTimeout(400); await gen(pg);
  check('the Time zone card is on the General page, visible, with the default', await pg.evaluate(() => { const c = document.getElementById('otzCard'); return !!c && c.getBoundingClientRect().height > 80 && document.getElementById('otzTz').value === 'Asia/Manila' && /Not saved yet, using Asia\/Manila/.test(document.getElementById('otzNow').textContent) && window.ownerTz.get() === 'Asia/Manila' && !window.ownerTz.saved(); }));
  check('the list of zones is offered', await pg.evaluate(() => document.querySelectorAll('#otzZoneList option').length > 20));
  await setIn(pg, 'otzTz', 'Bad zone'); await click(pg, 'otzSave'); await pg.waitForTimeout(200);
  check('a bad name is refused with an example and nothing is saved', /not a valid time zone/.test(await txt(pg, '#otzErr')) && !(await S(pg))['ownerPrefs/main']);
  await setIn(pg, 'otzTz', ''); await click(pg, 'otzSave'); await pg.waitForTimeout(150);
  check('an empty name is refused', /Type or pick/.test(await txt(pg, '#otzErr')));
  await setIn(pg, 'otzTz', 'America/New_York'); check('typing shows the offset and time of the typed zone before saving', /America\/New_York is UTC-[45], now \d\d:\d\d/.test(await txt(pg, '#otzNow')));
  let ev = 0; await pg.evaluate(() => { window.__tzEv = []; document.addEventListener('owner:tz', e => window.__tzEv.push(e.detail)); });
  await click(pg, 'otzSave'); await pg.waitForTimeout(400); let s = await S(pg); void ev;
  check('first save: revision 1, no previous zone, zone stored', s['ownerPrefs/main'] && s['ownerPrefs/main'].tz === 'America/New_York' && s['ownerPrefs/main'].prevTz === '' && s['ownerPrefs/main'].rev === 1);
  check('other pages are told: ownerTz.get() and the owner:tz event', await pg.evaluate(() => window.ownerTz.get() === 'America/New_York' && window.__tzEv.includes('America/New_York') && window.ownerTz.saved()));
  check('the to-do page now uses that zone (todoApi.tz and today key)', await pg.evaluate(() => window.todoApi.tz() === 'America/New_York' && window.todoApi.todayKey() === window.coreTime.localDateKey(Date.now(), 'America/New_York')));
  await setIn(pg, 'otzTz', 'America/New_York'); await click(pg, 'otzSave'); await pg.waitForTimeout(200);
  check('saving the same zone again says there is no change', /No change to save/.test(await txt(pg, '#otzErr')));
  await setIn(pg, 'otzTz', 'Asia/Kathmandu'); await click(pg, 'otzSave'); await pg.waitForTimeout(400); s = await S(pg);
  check('a change keeps the replaced zone and raises the revision by one', s['ownerPrefs/main'].tz === 'Asia/Kathmandu' && s['ownerPrefs/main'].prevTz === 'America/New_York' && s['ownerPrefs/main'].rev === 2 && /Before the last change: America\/New_York/.test(await txt(pg, '#otzNow')) && /UTC\+5:45/.test(await txt(pg, '#otzNow')));
  await click(pg, 'otzReset'); await pg.waitForTimeout(400); s = await S(pg);
  check('Reset to Asia/Manila saves it as revision 3', s['ownerPrefs/main'].tz === 'Asia/Manila' && s['ownerPrefs/main'].prevTz === 'Asia/Kathmandu' && s['ownerPrefs/main'].rev === 3);
  await setIn(pg, 'otzTz', 'Pacific/Kiritimati'); await click(pg, 'otzSave'); await pg.waitForTimeout(400);
  check('the graphs follow the zone: the last bar is the zone\'s today (UTC+14 here)', await pg.evaluate(async () => { document.querySelector('.dnav button[data-page="todo"]').click(); await new Promise(r => setTimeout(r, 500)); document.getElementById('tdTab_graphs').click(); await new Promise(r => setTimeout(r, 700)); const key = window.todoApi.todayKey(), exp = window.coreTime.localDateKey(Date.now(), 'Pacific/Kiritimati'), bars = document.querySelectorAll('#tdChart1 .td-gbar'), tip = bars[bars.length - 1].dataset.tip; return key === exp && new RegExp('\\b' + Number(key.slice(8, 10)) + '\\b').test(tip); }));
  await gen(pg); await click(pg, 'otzReset'); await pg.waitForTimeout(400);
  await signOut(pg); await pg.waitForTimeout(200);
  check('after sign-out the default is Asia/Manila again and the card shows no saved zone', await pg.evaluate(() => window.ownerTz.get() === 'Asia/Manila' && !window.ownerTz.saved()));
  await ctx.close();
}
/* a project's own zone wins */
{
  const { ctx, pg } = await mk(); await signIn(pg); await pg.waitForTimeout(300);
  check('resolve(): a project zone wins, else the owner default, else Asia/Manila', await pg.evaluate(() => window.ownerTz.resolve('Europe/London') === 'Europe/London' && window.ownerTz.resolve('') === 'Asia/Manila' && window.ownerTz.resolve('bad zone') === 'Asia/Manila'));
  await ctx.close();
}
check('no page errors', errs.length === 0, errs.join('|'));
await b.close(); srv.close();
const bad = results.filter(r => !r[1]).length; console.log(bad ? bad + ' FAILED' : 'ALL PASSED'); process.exit(bad ? 1 : 0);
