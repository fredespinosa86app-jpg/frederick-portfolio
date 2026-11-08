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
const trap = pg => pg.evaluate(() => { window.__mailto = ''; window.__mailCount = 0; window.__copied = null; document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a'); if (a && /^mailto:/.test(a.href)) { e.preventDefault(); window.__mailto = a.href; window.__mailCount++; } }, true); Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { window.__copied = t; } }, configurable: true }); });

{
  const { ctx, pg } = await mk(); await signIn(pg); await pg.waitForTimeout(300); const sd = await seedWeek(pg); await trap(pg); await openG(pg);
  const label = await pg.evaluate(() => { const G = window.coreTodoGraph, w = G.lastCompletedWeek(window.todoApi.todayKey()); return G.fmtDay(w.start) + ' to ' + G.fmtDay(w.end); });
  check('the card is on the Graphs tab, below the weekly chart and above hours used', await pg.evaluate(() => { const c = document.getElementById('tdWSum'), w = document.getElementById('tdChart2'), h = [...document.querySelectorAll('#tdGraphs h4')].find(x => /Hours used/.test(x.textContent)); return !!c && c.getBoundingClientRect().height > 100 && w.getBoundingClientRect().bottom <= c.getBoundingClientRect().top + 1 && c.getBoundingClientRect().bottom <= h.getBoundingClientRect().top + 1; }));
  check('it names the last completed Monday-to-Sunday week and the zone', (await txt(pg, '#tdWSum')).includes(label) && /\(Asia\/Manila\)/.test(await txt(pg, '#tdWSum')));
  const facts = await pg.evaluate(() => Object.fromEntries([...document.querySelectorAll('.td-wsum-facts .td-wsum-k')].map(k => [k.querySelector('dt').textContent, [(k.querySelector('.v') || {}).textContent || '', (k.querySelector('.n') || {}).textContent || ''].map(s => s.replace(/\u00a0/g, ' '))])));
  check('focus time 4 h 00 m (1 h + 2 h + 1 h) is the first and biggest figure', facts['Focus time'][0] === '4 h 00 m' && await pg.evaluate(() => { const h = document.querySelector('.td-wsum-k.td-k-main .v'), o = document.querySelector('.td-wsum-grid .v'); return parseFloat(getComputedStyle(h).fontSize) >= 28 && parseFloat(getComputedStyle(h).fontSize) > parseFloat(getComputedStyle(o).fontSize) * 1.5; }), JSON.stringify(facts));
  check('goal days met: 3 of 6, the rest-day Saturday is not counted (and says so)', facts['Goal days met'][0] === '3 of 6' && facts['Goal days met'][1] === 'rest days not counted', JSON.stringify(facts));
  check('best day is Wednesday with 2 h 00 m on its own line', /^Wed \d+ \w+$/.test(facts['Best day'][0]) && facts['Best day'][1] === '2 h 00 m', JSON.stringify(facts));
  check('streak at week end is 0 (Sunday had no focus time)', facts['Streak at week end'][0] === '0 days', JSON.stringify(facts));
  check('tasks completed 1, open now 2 (a smaller line under the tiles)', (await txt(pg, '#tdWSTasks')) === 'Tasks completed: 1 (open now: 2)');
  check('two sections: the numbers, then Share this summary with its own heading; nothing to share sits in the numbers section', await pg.evaluate(() => { const st = document.querySelector('.td-wsum-stats'), sh = document.querySelector('.td-wsum-share'); return !!st && !!sh && sh.querySelector('h5').textContent === 'Share this summary' && !st.querySelector('textarea,input,button') && !!sh.querySelector('#tdWSText') && !!sh.querySelector('#tdWSTo') && sh.getAttribute('aria-labelledby') === 'tdWSShareH' && st.getBoundingClientRect().bottom <= sh.getBoundingClientRect().top + 1; }));
  check('the notice says nothing is sent automatically and a draft opens for review', /Nothing is sent automatically\. Your email application will open a draft for your review\./.test(await txt(pg, '.td-wsum-note')));
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
  await pg.waitForTimeout(1700); await setV(pg, 'tdWSTo', ''); await click(pg, 'tdWSMail'); await pg.waitForTimeout(100);
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
const shiftInit = iso => { const real = Date.now.bind(Date), off = Date.parse(iso) - real(), RD = Date; class SD extends RD { constructor(...a) { if (a.length) super(...a); else super(real() + off); } static now() { return real() + off; } } window.Date = SD; const rf = window.fetch.bind(window); window.fetch = (u, o) => /\?clock=/.test(String(u)) ? Promise.resolve(new Response('', { headers: { Date: new Date(real() + off).toUTCString() } })) : rf(u, o); };
/* time zone change moves the week (clock pinned to a Wednesday so the result does not depend on the hour the test runs: with the real clock, Pacific/Kiritimati is already on Monday every Sunday after 10:00 UTC) */
{
  const { ctx, pg } = await mk({ init: shiftInit, initArg: '2026-11-04T12:00:00Z' }); await signIn(pg); await pg.waitForTimeout(300); await seedWeek(pg); await openG(pg);
  await pg.evaluate(() => { window.OWN.fs.setDoc(window.OWN.fs.doc({}, 'ownerPrefs', 'main'), { tz: 'Pacific/Kiritimati', prevTz: '', rev: 1, updatedAt: 1 }); }); await pg.evaluate(() => document.querySelector('.dnav button[data-page="general"]').click()); await pg.waitForTimeout(300);
  await setIn2(pg); await pg.waitForTimeout(500);
  check('the card follows the General time zone', /\(Pacific\/Kiritimati\)/.test(await txt(pg, '#tdWSum')) && (await val(pg, 'tdWSText')).includes('(Pacific/Kiritimati)'));
  await ctx.close();
}
async function setIn2(pg) { await pg.evaluate(() => { const e = document.getElementById('otzTz'); e.value = 'Pacific/Kiritimati'; e.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('otzSave').click(); }); await pg.waitForTimeout(400); await pg.evaluate(() => document.querySelector('.dnav button[data-page="todo"]').click()); await pg.waitForTimeout(500); await pg.evaluate(() => document.getElementById('tdTab_graphs').click()); }
/* layout at the four approved widths (real page) */
const layout = async (w, h, mobile) => {
  const { ctx, pg } = await mk(Object.assign({ viewport: { width: w, height: h } }, mobile ? { isMobile: true, hasTouch: true } : {})); await signIn(pg); await pg.waitForTimeout(300); await seedWeek(pg); await openG(pg);
  const r = await pg.evaluate(() => {
    const R = s => document.querySelector(s).getBoundingClientRect(), card = R('#tdWSum'), k = c => R('.td-wsum-grid .td-k-' + c), best = document.querySelector('.td-wsum-grid .td-k-best'), bv = best.querySelector('.v'), bn = best.querySelector('.n');
    const over = [...document.querySelectorAll('#tdWSum *')].filter(e => { const q = e.getBoundingClientRect(); return q.width && (q.right > innerWidth + 1 || q.left < -1); }).length;
    const ta = document.getElementById('tdWSText'), btn = ['tdWSMail', 'tdWSCopy', 'tdWSReset'].map(i => { const q = R('#' + i); return [Math.round(q.width), Math.round(q.height)]; });
    const lh = parseFloat(getComputedStyle(bv).lineHeight) || parseFloat(getComputedStyle(bv).fontSize) * 1.3;
    return { sw: document.documentElement.scrollWidth, iw: innerWidth, over, taFit: ta.scrollHeight <= ta.clientHeight + 1, btn, inputH: Math.round(R('#tdWSTo').height), hero: [Math.round(R('.td-wsum-k.td-k-main').width), Math.round(card.width)], g: k('goal'), b: k('best'), s: k('streak'), bvLines: Math.round(bv.getBoundingClientRect().height / lh), nBelow: bn.getBoundingClientRect().top >= bv.getBoundingClientRect().bottom - 1, cardW: card.width, gapTop: Math.round(R('.td-wsum-k.td-k-main').top - R('#tdWSum > .dhelp').bottom), gapMid: Math.round(R('.td-wsum-share').top - R('#tdWSTasks').bottom), gapEnd: Math.round(card.bottom - R('.td-wsum-note').bottom), wordBreaks: [...document.querySelectorAll('#tdWSum .td-wsum-k dd span, #tdWSum .td-wsum-k dt')].reduce((n, e) => { const tn = e.firstChild; if (!tn || tn.nodeType !== 3) return n; const s = tn.textContent, rg = document.createRange(), sep = ch => /\s/.test(ch) && ch !== '\u00a0'; let i = 0; while (i < s.length) { while (i < s.length && sep(s[i])) i++; let j = i; while (j < s.length && !sep(s[j])) j++; if (j > i) { const tops = new Set(); for (let k = i; k < j; k++) { rg.setStart(tn, k); rg.setEnd(tn, k + 1); const q = rg.getClientRects()[0]; if (q && q.width) tops.add(Math.round(q.top)); } if (tops.size > 1) n++; } i = j; } return n; }, 0) };
  });
  await ctx.close(); return r;
};
for (const [w, h, name, mobile] of [[1280, 900, 'desktop 1280'], [768, 1000, 'tablet 768'], [375, 812, 'phone 375', true], [320, 700, 'phone 320', true]]) {
  const r = await layout(w, h, mobile);
  check(name + ': no sideways scrolling and nothing sticks out of the card', r.sw <= r.iw + 1 && r.over === 0, JSON.stringify([r.sw, r.iw, r.over]));
  check(name + ': the whole message is visible in the box, no inner scrolling', r.taFit);
  check(name + ': Open in my mail app, Copy text and Reset text are each at least 44 x 44 px, and the address box at least 44 px tall', r.btn.every(x => x[0] >= 43.5 && x[1] >= 43.5) && r.inputH >= 43.5, JSON.stringify(r.btn));
  check(name + ': the Best day value is on one line with the hours below it', r.bvLines === 1 && r.nBelow, JSON.stringify([r.bvLines, r.nBelow]));
  if (w >= 768) check(name + ': the three tiles sit in one row', Math.abs(r.g.top - r.b.top) <= 1 && Math.abs(r.b.top - r.s.top) <= 1 && r.g.left < r.b.left && r.b.left < r.s.left);
  if (w === 375) check(name + ': Goal days and Streak side by side, Best day full width below them', Math.abs(r.g.top - r.s.top) <= 1 && r.b.top >= r.g.bottom - 1 && r.b.width > r.g.width * 1.8, JSON.stringify([r.g.top, r.s.top, r.b.top, r.b.width, r.g.width]));
  if (w === 320) check(name + ': the tiles stay vertically stacked in one column', Math.abs(r.g.left - r.b.left) <= 1 && Math.abs(r.b.left - r.s.left) <= 1 && r.g.top < r.b.top && r.b.top < r.s.top);
  if (w <= 375) check(name + ': the two main buttons are full width', r.btn[0][0] === r.btn[1][0] && r.btn[0][0] >= r.cardW - 40, JSON.stringify(r.btn));
  check(name + ': no big empty gaps: the numbers start close under the week label, the share section close under the numbers, and the card ends close under the notice', r.gapTop >= 0 && r.gapTop <= 30 && r.gapMid >= 0 && r.gapMid <= 40 && r.gapEnd >= 0 && r.gapEnd <= 30, JSON.stringify([r.gapTop, r.gapMid, r.gapEnd]));
  check(name + ': the note under Goal days met breaks between words, never inside one', r.wordBreaks === 0, String(r.wordBreaks));
  check(name + ': the focus time tile spans the card', r.hero[0] >= r.hero[1] - 40, JSON.stringify(r.hero));
}
/* the no-reportable-activity state (a week after the first record with nothing in it) hides every sharing control */
{
  const { ctx, pg } = await mk(); await signIn(pg); await pg.waitForTimeout(300);
  await pg.evaluate(() => { const T = window.coreTime, G = window.coreTodoGraph, tz = window.ownerTz.get(), wk = G.lastCompletedWeek(window.todoApi.todayKey()), c = T.zonedToUtc(...T.addDaysIso(wk.start, -10).split('-').map(Number), 9, 0, 0, tz); window.__store['todoTasks/taskAAAA1'] = { name: 'Old task', desc: '', due: '', hours: 1, focusMin: 25, status: 'todo', secs: 0, doneAt: null, color: 0, createdAt: window.__ts(c), updatedAt: window.__ts(c) }; });
  await openG(pg);
  const q = await pg.evaluate(() => ({ quiet: (document.getElementById('tdWSQuiet') || {}).textContent || '', ctl: ['tdWSText', 'tdWSTo', 'tdWSMail', 'tdWSCopy', 'tdWSReset'].filter(i => document.getElementById(i)).length, sec: !!document.querySelector('.td-wsum-share, .td-wsum-stats, .td-wsum textarea, .td-wsum input, .td-wsum button'), title: !!document.querySelector('#tdWSum h4') }));
  check('empty week: the card keeps its title and week and says there is nothing to share', q.title && q.quiet === 'No focus time or completed tasks were recorded for this week, so there is nothing to share.' && /Asia\/Manila/.test(await txt(pg, '#tdWSum')));
  check('empty week: no message box, address box or buttons, and no sharing section', q.ctl === 0 && !q.sec, JSON.stringify(q));
  await ctx.close();
}
/* a week with only a completed task (no focus time) is still reportable */
{
  const { ctx, pg } = await mk(); await signIn(pg); await pg.waitForTimeout(300);
  await pg.evaluate(() => { const T = window.coreTime, G = window.coreTodoGraph, tz = window.ownerTz.get(), wk = G.lastCompletedWeek(window.todoApi.todayKey()), at = (d, h) => T.zonedToUtc(...d.split('-').map(Number), h, 0, 0, tz); window.__store['todoTasks/taskBBBB2'] = { name: 'Plan week', desc: '', due: '', hours: 1, focusMin: 25, status: 'todo', secs: 0, doneAt: null, color: 1, createdAt: window.__ts(at(T.addDaysIso(wk.start, -10), 9)), updatedAt: window.__ts(at(T.addDaysIso(wk.start, -10), 9)) }; window.__store['todoEvents/evntDone01'] = { taskId: 'taskBBBB2', type: 'done', createdAt: window.__ts(at(T.addDaysIso(wk.start, 1), 15)) }; });
  await openG(pg);
  check('a week with a completed task but no focus time still offers the share section', await pg.evaluate(() => !!document.getElementById('tdWSMail') && !document.getElementById('tdWSQuiet')) && /Focus time: 0 m/.test(await val(pg, 'tdWSText')));
  await ctx.close();
}
/* other time zones: the week, the label, the message and the mail subject all use the General zone (the clock is set so New York is still on Sunday while Manila and Auckland are already on Monday) */
const FROZEN = '2026-11-08T17:00:00Z';
const zoneRun = async zone => {
  const { ctx, pg } = await mk({ init: shiftInit, initArg: FROZEN }); await signIn(pg); await pg.waitForTimeout(300); await trap(pg);
  await pg.click('#dashOpen'); await pg.waitForTimeout(400); await pg.evaluate(() => document.querySelector('.dnav button[data-page="general"]').click()); await pg.waitForTimeout(400);
  await pg.evaluate(z => { const e = document.getElementById('otzTz'); e.value = z; e.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('otzSave').click(); }, zone); await pg.waitForTimeout(500);
  const zoneNow = await pg.evaluate(() => window.ownerTz.get()); await seedWeek(pg);
  await pg.evaluate(() => document.querySelector('.dnav button[data-page="todo"]').click()); await pg.waitForTimeout(600); await pg.evaluate(() => document.getElementById('tdTab_graphs').click()); await pg.waitForTimeout(700);
  const label = await pg.evaluate(() => { const G = window.coreTodoGraph, w = G.lastCompletedWeek(window.todoApi.todayKey()); return G.fmtDay(w.start) + ' to ' + G.fmtDay(w.end); });
  const card = await txt(pg, '#tdWSum'), msg = await val(pg, 'tdWSText'), focus = await pg.evaluate(() => (document.querySelector('.td-wsum-k.td-k-main .v') || {}).textContent || '');
  await click(pg, 'tdWSMail'); await pg.waitForTimeout(150); const mt = decodeURIComponent(await pg.evaluate(() => window.__mailto));
  await ctx.close(); return { zoneNow, label, card, msg, focus: focus.replace(/ /g, ' '), mt };
};
const zr = {};
for (const z of ['America/New_York', 'Pacific/Auckland', 'Asia/Manila']) zr[z] = await zoneRun(z);
for (const z of ['America/New_York', 'Pacific/Auckland']) {
  const r = zr[z];
  check(z + ': the General zone is the one in use, and the card, the message title and the mail subject all name the same week', r.zoneNow === z && r.card.includes(r.label + ' (' + z + ')') && r.msg.split('\n')[0] === 'Focus summary, ' + r.label + ' (' + z + ')' && r.mt.startsWith('mailto:?subject=Focus summary, ' + r.label + '&body='), JSON.stringify([r.zoneNow, r.label]));
  check(z + ': the numbers for that zone\'s week are right (4 h 00 m of focus time)', r.focus === '4 h 00 m', r.focus);
}
check('New York is still on Sunday 8 Nov, so its last completed week is Mon 26 Oct to Sun 1 Nov', zr['America/New_York'].label === 'Mon 26 Oct to Sun 1 Nov', zr['America/New_York'].label);
check('Auckland and Manila are already on Monday 9 Nov, so their last completed week is Mon 2 Nov to Sun 8 Nov', zr['Pacific/Auckland'].label === 'Mon 2 Nov to Sun 8 Nov' && zr['Asia/Manila'].label === 'Mon 2 Nov to Sun 8 Nov', JSON.stringify([zr['Pacific/Auckland'].label, zr['Asia/Manila'].label]));
check('Manila still works with the same clock: label, title and focus time', zr['Asia/Manila'].card.includes('(Asia/Manila)') && zr['Asia/Manila'].focus === '4 h 00 m');
/* repeated clicks: one click is one draft; a quick double or triple click is still one; after a moment another draft is allowed */
{
  const { ctx, pg } = await mk(); await signIn(pg); await pg.waitForTimeout(300); await seedWeek(pg); await trap(pg); await openG(pg);
  await setV(pg, 'tdWSTo', 'a@b.com');
  await pg.evaluate(() => { const m = document.getElementById('tdWSMail'); m.click(); m.click(); m.click(); }); await pg.waitForTimeout(200);
  check('three quick clicks on Open in my mail app open exactly one draft', (await pg.evaluate(() => window.__mailCount)) === 1 && (await pg.evaluate(() => document.getElementById('tdWSMail').getAttribute('aria-disabled'))) === 'true');
  await pg.waitForTimeout(1700);
  check('after a moment the button works again and the next click opens a second draft', (await pg.evaluate(() => document.getElementById('tdWSMail').getAttribute('aria-disabled'))) === null && await (async () => { await click(pg, 'tdWSMail'); await pg.waitForTimeout(150); return (await pg.evaluate(() => window.__mailCount)) === 2; })());
  await pg.waitForTimeout(1700); await setV(pg, 'tdWSTo', 'bad address'); await pg.evaluate(() => { const m = document.getElementById('tdWSMail'); m.click(); m.click(); }); await pg.waitForTimeout(150);
  check('a refused address never opens a draft, however often the button is pressed, and the message stays', (await pg.evaluate(() => window.__mailCount)) === 2 && /one e-mail address/.test(await txt(pg, '#tdWSErr')));
  await ctx.close();
}
/* accessibility: contrast, labels, keyboard, focus ring, announcements (real page, real colours) */
{
  const { ctx, pg } = await mk({ viewport: { width: 1280, height: 1000 } }); await signIn(pg); await pg.waitForTimeout(300); await seedWeek(pg); await trap(pg); await openG(pg);
  const A = await pg.evaluate(() => {
    const parse = c => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
    const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }, lum = c => .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b), ratio = (x, y) => { const p = lum(x), q = lum(y); return (Math.max(p, q) + .05) / (Math.min(p, q) + .05); };
    const bgOf = el => { const layers = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.a > 0) { layers.push(c); if (c.a >= 1) break; } } let base = { r: 255, g: 255, b: 255 }; for (const l of layers.reverse()) base = { r: l.r * l.a + base.r * (1 - l.a), g: l.g * l.a + base.g * (1 - l.a), b: l.b * l.a + base.b * (1 - l.a) }; return base; };
    const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) });
    const text = [], card = document.getElementById('tdWSum');
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT); let n; while ((n = walker.nextNode())) { const e = n.parentElement, s = n.textContent.trim(); if (!s || e.tagName === 'TEXTAREA') continue; const cs = getComputedStyle(e); if (!e.getClientRects().length) continue; const bg = bgOf(e), fg = blend(parse(cs.color), bg), px = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700, large = px >= 24 || (bold && px >= 18.66); text.push({ s: s.slice(0, 30), ratio: +ratio(fg, bg).toFixed(2), need: large ? 3 : 4.5 }); }
    const area = ['tdWSText', 'tdWSTo'].map(i => { const e = document.getElementById(i), cs = getComputedStyle(e), bg = bgOf(e); return { s: i + ' text', ratio: +ratio(blend(parse(cs.color), bg), bg).toFixed(2), need: 4.5 }; });
    const ph = (() => { const e = document.getElementById('tdWSTo'), cs = getComputedStyle(e, '::placeholder'), bg = bgOf(e); return { s: 'placeholder', ratio: +ratio(blend(parse(cs.color), bg), bg).toFixed(2), need: 4.5 }; })();
    const borders = ['tdWSText', 'tdWSTo', 'tdWSCopy'].map(i => { const e = document.getElementById(i), cs = getComputedStyle(e); return { s: i + ' border', ratio: +ratio(parse(cs.borderTopColor), bgOf(e.parentElement)).toFixed(2), need: 3 }; });
    const primary = (() => { const e = document.getElementById('tdWSMail'), cs = getComputedStyle(e); return { s: 'primary button text', ratio: +ratio(parse(cs.color), parse(cs.backgroundColor)).toFixed(2), need: 4.5 }; })();
    const link = (() => { const e = document.getElementById('tdWSReset'), cs = getComputedStyle(e), bg = bgOf(e.parentElement); return { s: 'Reset text link', ratio: +ratio(parse(cs.color), bg).toFixed(2), need: 4.5 }; })();
    return { rows: text.concat(area, [ph, primary, link], borders), parse: null };
  });
  const weak = A.rows.filter(r => r.ratio < r.need);
  check('contrast: every text, the placeholder, the buttons and the box borders meet WCAG 2.2 AA (' + A.rows.length + ' items, lowest ' + Math.min(...A.rows.map(r => r.ratio)) + ')', weak.length === 0, JSON.stringify(weak));
  const L = await pg.evaluate(() => ['tdWSText', 'tdWSTo'].map(i => !!document.querySelector('label[for="' + i + '"]')).concat([document.getElementById('tdWSErr').getAttribute('role') === 'alert', document.getElementById('tdWSTo').getAttribute('aria-describedby') === 'tdWSErr', !!document.querySelector('#tdWSum [role=group][aria-label]'), !!document.querySelector('#tdWSum [role=group][aria-labelledby="tdWSShareH"]'), document.getElementById('tdWSShareH').tagName === 'H5']));
  check('labels: both boxes have a label, the error is an alert tied to the address box, both sections are named', L.every(Boolean), JSON.stringify(L));
  const seq = []; await pg.evaluate(() => document.getElementById('tdWSText').focus());
  const ring = async () => pg.evaluate(() => { const e = document.activeElement, cs = getComputedStyle(e); const parse = c => c.match(/[\d.]+/g).map(Number); const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }, lum = m => .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); let bg = [255, 255, 255]; for (let x = e.parentElement; x; x = x.parentElement) { const c = parse(getComputedStyle(x).backgroundColor); if (c.length < 4 || c[3] >= 1) { if (c.length < 4 || c[3] === 1) { bg = c; break; } } } const o = parse(cs.outlineColor), r = (Math.max(lum(o), lum(bg)) + .05) / (Math.min(lum(o), lum(bg)) + .05); return { id: e.id, style: cs.outlineStyle, w: parseFloat(cs.outlineWidth), ratio: +r.toFixed(2), visible: e.matches(':focus-visible') }; });
  seq.push(await ring()); for (let i = 0; i < 4; i++) { await pg.keyboard.press('Tab'); seq.push(await ring()); }
  check('keyboard: Tab goes message, address, Open in my mail app, Copy text, Reset text', seq.map(s => s.id).join(',') === 'tdWSText,tdWSTo,tdWSMail,tdWSCopy,tdWSReset', seq.map(s => s.id).join(','));
  check('focus ring: every control shows a solid ring at least 2 px wide with at least 3:1 contrast', seq.every(s => s.visible && s.style === 'solid' && s.w >= 2 && s.ratio >= 3), JSON.stringify(seq));
  await pg.keyboard.press('Shift+Tab'); check('keyboard: Shift+Tab goes back to Copy text', (await ring()).id === 'tdWSCopy');
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(150); check('keyboard: Enter on Copy text copies the message', (await pg.evaluate(() => window.__copied)) === (await val(pg, 'tdWSText')));
  await setV(pg, 'tdWSText', 'changed'); await pg.evaluate(() => document.getElementById('tdWSReset').focus()); await pg.keyboard.press('Space'); await pg.waitForTimeout(100); check('keyboard: Space on Reset text brings the original back', (await val(pg, 'tdWSText')).startsWith('Focus summary, '));
  await setV(pg, 'tdWSTo', 'a@b.com'); await pg.evaluate(() => document.getElementById('tdWSMail').focus()); await pg.keyboard.press('Enter'); await pg.waitForTimeout(150); check('keyboard: Enter on Open in my mail app opens one draft', (await pg.evaluate(() => window.__mailCount)) === 1);
  await pg.waitForTimeout(1700); await setV(pg, 'tdWSTo', 'nope'); await pg.evaluate(() => document.getElementById('tdWSMail').focus()); await pg.keyboard.press('Enter'); await pg.waitForTimeout(100);
  check('the refusal message is in the alert region (read out by screen readers) and the address box is described by it', /one e-mail address/.test(await txt(pg, '#tdWSErr[role=alert]')) && (await pg.evaluate(() => document.getElementById('tdWSTo').getAttribute('aria-describedby'))) === 'tdWSErr');
  await ctx.close();
}
/* lab measurements: layout shift while the card is drawn and used, and the time the page takes to react to clicks and typing */
{
  const out = {};
  for (const [w, h, name] of [[1280, 900, 'desktop'], [375, 812, 'phone']]) {
    const { ctx, pg } = await mk({ viewport: { width: w, height: h } }); await signIn(pg); await pg.waitForTimeout(300); await seedWeek(pg); await trap(pg);
    await pg.evaluate(() => { window.__cls = 0; window.__ev = []; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); new PerformanceObserver(l => { for (const e of l.getEntries()) window.__ev.push(e.duration); }).observe({ type: 'event', durationThreshold: 16, buffered: true }); });
    await openG(pg); await pg.waitForTimeout(900);
    await pg.evaluate(() => document.getElementById('tdWSum').scrollIntoView()); await pg.click('#tdWSCopy'); await pg.click('#tdWSReset'); await pg.click('#tdWSText'); await pg.keyboard.type('hello world, a few words more', { delay: 15 }); await pg.click('#tdWSTo'); await pg.keyboard.type('a@b.com', { delay: 15 }); await pg.click('#tdWSMail'); await pg.waitForTimeout(600);
    const m = await pg.evaluate(() => ({ cls: +window.__cls.toFixed(4), maxEvent: Math.max(0, ...window.__ev), events: window.__ev.length }));
    out[name] = m; check(name + ' (lab): layout shift while the Graphs tab with the card is drawn and used is at most 0.1 (measured ' + m.cls + ')', m.cls <= 0.1); check(name + ' (lab): the slowest click or keystroke handled in at most 200 ms (measured ' + m.maxEvent + ' ms over ' + m.events + ' slow events)', m.maxEvent <= 200);
    await ctx.close();
  }
  fs.writeFileSync('/tmp/claude-0/en1c-lab.json', JSON.stringify(out));
}
check('no page errors', errs.length === 0, errs.join('|'));
await b.close(); srv.close();
const bad = results.filter(r => !r[1]).length; console.log(bad ? bad + ' FAILED' : 'ALL PASSED'); process.exit(bad ? 1 : 0);
