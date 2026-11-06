import { b, check, errs, fresh, signIn, signOut, results, srv } from './w5-harness.mjs';
const stubAudio = pre => {
  window.__tones = []; window.__notes = []; window.__off = 0; const rn = Date.now.bind(Date); Date.now = () => rn() + window.__off;
  window.__ctxs = 0;
  class FakeCtx { constructor() { window.__ctxs++; this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    resume() { this.state = 'running'; if (this.onstatechange) this.onstatechange(); return Promise.resolve(); } close() { this.state = 'closed'; }
    createOscillator() { return { type: '', frequency: { value: 0 }, connect() {}, start() { window.__tones.push({ f: this.frequency.value, w: this.type, t: Date.now() }); }, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} }; } }
  window.AudioContext = FakeCtx;
  window.Notification = class { constructor(t, o) { window.__notes.push({ t, body: o.body, silent: o.silent }); } static async requestPermission() { window.Notification.permission = 'granted'; return 'granted'; } }; window.Notification.permission = 'default';
    if (pre) { try { localStorage.setItem('wtAlarm:v1', pre); } catch (e) { /* ignore */ } }
};
let ORIG = '';
const ON = JSON.stringify({ on: true, warn: 1, repeat: 1, sound: 'chime', vol: 60, notify: true });
const sched = (pg, o = {}) => pg.evaluate(o => { const old = { toMillis: () => Date.now() - 86400000 }; window.__store['workSchedules/default'] = Object.assign({ fb: 15, lu: 2, lb: 15, pfb: 15, plu: 2, plb: 15, rev: 1, updatedAt: old }, o); }, o);
const tones = pg => pg.evaluate(() => window.__tones.length);
const groups = pg => pg.evaluate(() => { const g = []; window.__tones.forEach(x => { if (!g.length || x.t - g[g.length - 1].t > 150) g.push({ t: x.t, f: [x.f] }); else g[g.length - 1].f.push(x.f); }); return g.map(x => x.f.join('/')); });
const at = (pg, off) => pg.evaluate(o => { const bi = window.wtApi.breakInfo(); window.__off += (bi.deadlineMs + o) - window.wtApi.now(); }, off);   // move this page's clock to a moment relative to the deadline
const jump = (pg, ms) => pg.evaluate(ms => { window.__off += ms; }, ms);
const toLunch = async (pg) => { await pg.evaluate(() => window.wtApi.punch('CLOCK_IN')); await pg.waitForTimeout(300); await pg.evaluate(() => window.wtApi.punch('LUNCH_OUT')); await pg.waitForTimeout(500); };

// ---- 1. alarm OFF by default: nothing at all
{ const { ctx, pg } = await fresh({ init: stubAudio, initArg: null }); ORIG = await pg.title(); await signIn(pg); await pg.waitForTimeout(300); await sched(pg);
  await toLunch(pg); await jump(pg, 125000); await pg.waitForTimeout(1500);
  check('off by default: no audio engine created, no timer worker, no tone', (await pg.evaluate(() => window.__ctxs)) === 0 && (await pg.evaluate(() => window.__wtAlarm.timer)) === '' && (await tones(pg)) === 0);
  check('off by default: tab title untouched while late', (await pg.title()) === ORIG);
  check('off by default: no chip, no silence button', await pg.evaluate(() => document.querySelector('.wtfl-chip:not([hidden])') === null));
  await ctx.close(); }

// ---- 2. locked until a gesture, then the full sequence
{ const { ctx, pg } = await fresh({ init: stubAudio, initArg: ON }); ORIG = await pg.title(); await signIn(pg); await pg.waitForTimeout(300); await sched(pg);
  await toLunch(pg); await pg.waitForTimeout(600);
  check('alarm on: timer is a worker', (await pg.evaluate(() => window.__wtAlarm.timer)) === 'worker', await pg.evaluate(() => window.__wtAlarm.timer));
  check('before any click the clock shows "Tap to enable alarm sound"', await pg.evaluate(() => { const c = document.querySelector('.wtfl-chip:not(.wtfl-sil)'); return c && !c.hidden && /Tap to enable alarm sound/.test(c.textContent); }));
  await pg.click('.wtfl-chip:not(.wtfl-sil)'); await pg.waitForTimeout(200);
  check('clicking it unlocks the sound and hides the chip', (await pg.evaluate(() => window.__wtAlarm.ctxState)) === 'running' && await pg.evaluate(() => document.querySelector('.wtfl-chip:not(.wtfl-sil)').hidden));
  // limit 2 min, warn 1 min: jump to 1 s after the warning moment
  await at(pg, -59000); await pg.waitForTimeout(1600);
  check('warning: one soft tone (660 Hz) before the limit', JSON.stringify(await groups(pg)) === '["660"]', JSON.stringify(await groups(pg)));
  check('warning: the clock text is amber ("near")', (await pg.getAttribute('.wtfl-brk', 'data-kind')) === 'near');
  await at(pg, 1000); await pg.waitForTimeout(1600);
  let g = await groups(pg); check('deadline: the chosen sound (chime 880/1175) plays once', g.length === 2 && g[1] === '880/1175', JSON.stringify(g));
  check('late: Silence button is visible', await pg.evaluate(() => { const s = document.querySelector('.wtfl-sil'); return !!s && !s.hidden; }));
  const titles = new Set(); for (let i = 0; i < 4; i++) { titles.add(await pg.title()); await pg.waitForTimeout(1000); }
  check('late: tab title alternates between the page title and "Late: lunch"', titles.has('Late: lunch') && titles.has(ORIG), JSON.stringify([...titles]));
  // repeats: step one minute at a time, count sounds; must stop after 10 repeats
  for (let i = 1; i <= 12; i++) { await at(pg, i * 60000 + 1000); await pg.waitForTimeout(1300); }
  g = await groups(pg); const chimes = g.filter(x => x === '880/1175').length;
  check('1 at the deadline + 10 repeats = 11 chimes, then silence (12 minutes stepped)', chimes === 11, JSON.stringify(g));
  // R7: another script changes the title while we are showing ours; it must not be overwritten when we stop
  await pg.evaluate(() => { document.title = 'Inbox (3)'; }); await pg.waitForTimeout(1500);
  await pg.evaluate(() => window.wtApi.punch('LUNCH_IN')); await pg.waitForTimeout(700);
  check('R7: after Lunch in the title is restored (or left alone), never overwritten with a stale one', ['Inbox (3)'].includes(await pg.title()), await pg.title());
  check('Lunch in stops the alarm: no Silence button, nothing playing', await pg.evaluate(() => document.querySelector('.wtfl-sil').hidden));
  await ctx.close(); }

// ---- 3. title restored to the original when nothing else touched it; Silence; next break re-arms
{ const { ctx, pg } = await fresh({ init: stubAudio, initArg: ON }); ORIG = await pg.title(); await signIn(pg); await pg.waitForTimeout(300); await sched(pg, { fb: 3, plu: 2, pfb: 3 });
  await pg.evaluate(() => window.wtApi.punch('CLOCK_IN')); await pg.waitForTimeout(300); await pg.click('body'); await pg.waitForTimeout(100);
  await pg.evaluate(() => window.wtApi.punch('LUNCH_OUT')); await pg.waitForTimeout(500); await pg.click('.wtfl-chip:not(.wtfl-sil)').catch(() => {});
  await at(pg, 1000); await pg.waitForTimeout(1500);
  const before = await tones(pg); check('late: sound played', before > 0);
  await pg.click('.wtfl-sil'); await pg.waitForTimeout(300);
  await at(pg, 61000); await pg.waitForTimeout(1500);
  check('Silence: no more sound for this break, even at the next repeat', (await tones(pg)) === before);
  check('Silence: title back to the original', (await pg.title()) === ORIG, await pg.title());
  check('Silence: the text and flicker still show late (reminder text is not removed)', /late by/.test(await pg.textContent('.wtfl-brk')) && await pg.evaluate(() => !!document.querySelector('.wtfl-late')));
  await pg.evaluate(() => window.wtApi.punch('LUNCH_IN')); await pg.waitForTimeout(500);
  check('Lunch in: title is the original page title', (await pg.title()) === ORIG);
  await pg.evaluate(() => window.wtApi.punch('FIRST_BREAK_OUT')); await pg.waitForTimeout(500);
  await at(pg, 1000); await pg.waitForTimeout(1500);
  check('the NEXT break rings again (Silence applied to one break only)', (await tones(pg)) > before);
  // sign-out stops everything
  await signOut(pg); await pg.waitForTimeout(400);
  check('sign-out: timer stopped, audio engine closed, title restored', (await pg.evaluate(() => window.__wtAlarm.timer)) === '' && (await pg.evaluate(() => window.__wtAlarm.ctxState)) === 'none' && (await pg.title()) === ORIG, await pg.title());
  const t0 = await tones(pg); await jump(pg, 5 * 60000); await pg.waitForTimeout(1500); check('sign-out: nothing sounds afterwards', (await tones(pg)) === t0);
  await ctx.close(); }

// ---- 4. page opened while already very late: no sound, flicker only
{ const { ctx, pg } = await fresh({ init: stubAudio, initArg: ON }); ORIG = await pg.title(); await signIn(pg); await pg.waitForTimeout(300); await sched(pg);
  await toLunch(pg);
  await pg.evaluate(() => { const ks = Object.keys(window.__store).filter(k => k.startsWith('workEvents/')).sort((a, b) => window.__store[a].n - window.__store[b].n); window.__store[ks[0]].at = { toMillis: () => Date.now() - 40 * 60000 }; window.__store[ks[1]].at = { toMillis: () => Date.now() - 20 * 60000 }; });
  const store = await pg.evaluate(() => JSON.stringify(window.__store)); await pg.reload(); await pg.waitForFunction(() => window.wtApi);
  await pg.evaluate(s => Object.assign(window.__store, JSON.parse(s), {}), store); await signIn(pg); await pg.waitForTimeout(500); await pg.click('.wtfl-chip:not(.wtfl-sil)').catch(() => {}); await pg.waitForTimeout(3500);
  check('opened 18 minutes late: no sound is replayed', (await tones(pg)) === 0, await tones(pg));
  check('opened late: flicker class and "late by" text are there', await pg.evaluate(() => !!document.querySelector('.wtfl-late')) && /late by/.test(await pg.textContent('.wtfl-brk')));
  await ctx.close(); }

// ---- 5. no-limit break and bad stored settings
{ const { ctx, pg } = await fresh({ init: stubAudio, initArg: ON }); ORIG = await pg.title(); await signIn(pg); await pg.waitForTimeout(300); await sched(pg, { lu: 0, plu: 0 });
  await toLunch(pg); await pg.click('body'); await jump(pg, 5 * 3600000); await pg.waitForTimeout(1500);
  check('0 = no limit: the alarm never sounds and the title stays', (await tones(pg)) === 0 && (await pg.title()) === ORIG);
  await ctx.close(); }
{ const { ctx, pg } = await fresh({ init: stubAudio, initArg: '{"on":true,"warn":999,"repeat":-4,"sound":"<script>","vol":0}' }); await signIn(pg); await pg.waitForTimeout(300);
  const p = await pg.evaluate(() => window.__wtAlarm.prefs); check('bad stored settings: each field falls back to its default, alarm flag kept', p.warn === 5 && p.repeat === 1 && p.sound === 'chime' && p.vol === 60 && p.on === true, JSON.stringify(p));
  await ctx.close(); }
{ const { ctx, pg } = await fresh({ init: stubAudio, initArg: 'not json {' }); ORIG = await pg.title(); await signIn(pg); await pg.waitForTimeout(300);
  check('unreadable stored settings: defaults, alarm OFF', (await pg.evaluate(() => window.__wtAlarm.prefs.on)) === false); await ctx.close(); }

// ---- 6. settings card: persists, test sound, notifications generic, position buttons
{ const { ctx, pg } = await fresh({ init: stubAudio, initArg: null }); ORIG = await pg.title(); await signIn(pg); await pg.waitForTimeout(300); await sched(pg);
  await pg.evaluate(() => window.wtApi.punch('CLOCK_IN')); await pg.waitForTimeout(400);
  await pg.click('#dashOpen'); await pg.waitForTimeout(300); await pg.click('.dnav [data-page=worktrack]'); await pg.waitForTimeout(600);
  check('card: everything but the switch is disabled while the alarm is off', await pg.evaluate(() => ['waWarn', 'waRep', 'waSound', 'waVol', 'waNotify'].every(i => document.getElementById(i).disabled)));
  check('card says it is a browser reminder and cannot ring when the browser is closed', /browser reminder/.test(await pg.textContent('#waCard .dhelp')) && /closed/.test(await pg.textContent('#waCard .dhelp')));
  await pg.check('#waOn'); await pg.waitForTimeout(300);
  check('switch on: stored on this device, timer worker starts', (await pg.evaluate(() => JSON.parse(localStorage.getItem('wtAlarm:v1')).on)) === true && (await pg.evaluate(() => window.__wtAlarm.timer)) === 'worker');
  await pg.selectOption('#waSound', 'bell'); await pg.selectOption('#waWarn', '10'); await pg.selectOption('#waRep', '3'); await pg.fill('#waVol', '80');
  await pg.evaluate(() => document.getElementById('waVol').dispatchEvent(new Event('change', { bubbles: true }))); await pg.waitForTimeout(200);
  const st = await pg.evaluate(() => JSON.parse(localStorage.getItem('wtAlarm:v1'))); check('settings saved', st.sound === 'bell' && st.warn === 10 && st.repeat === 3 && st.vol === 80, JSON.stringify(st));
  await pg.click('#waTest'); await pg.waitForTimeout(300);
  check('Test sound plays the chosen sound (bell 660/1320/1980)', JSON.stringify(await groups(pg)) === '["660/1320/1980"]', JSON.stringify(await groups(pg)));
  await pg.click('#waNotify'); await pg.waitForTimeout(300);
  check('notifications: permission asked only when the button is pressed, then on', (await pg.evaluate(() => JSON.parse(localStorage.getItem('wtAlarm:v1')).notify)) === true);
  await pg.click('#waNotify'); check('pressing again turns notifications off', (await pg.evaluate(() => JSON.parse(localStorage.getItem('wtAlarm:v1')).notify)) === false); await pg.click('#waNotify');
  // notification text at the warning and at the deadline
  await pg.evaluate(() => window.wtApi.punch('LUNCH_OUT')); await pg.waitForTimeout(500); await pg.selectOption('#waWarn', '1'); await pg.selectOption('#waSound', 'chime');
  await at(pg, -59000); await pg.waitForTimeout(1600); await at(pg, 1000); await pg.waitForTimeout(1600);
  const notes = await pg.evaluate(() => window.__notes);
  check('notification texts are generic (no client, no time)', notes.length === 2 && notes[0].body === 'Your lunch ends soon.' && notes[1].body === 'Time to come back from lunch.' && notes.every(n => n.silent === true && !/\d/.test(n.body)), JSON.stringify(notes));
  check('the card shows the Silence button while it is ringing', await pg.evaluate(() => !document.getElementById('waSilence').hidden));
  // position buttons
  await pg.evaluate(() => window.wtApi.punch('LUNCH_IN')); await pg.waitForTimeout(500);
  await pg.click('#dClose', { timeout: 20000 }).catch(() => {}); await pg.waitForFunction(() => !document.getElementById('dClose').disabled, null, { timeout: 15000 }).catch(() => {}); await pg.click('#dClose').catch(() => {}); await pg.waitForTimeout(400);
  const pos = () => pg.evaluate(() => { const r = document.getElementById('wtFloat').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; });
  const p0 = await pos(); const seen = [];
  for (let i = 0; i < 4; i++) { await pg.click('.wtfl-corner'); await pg.waitForTimeout(150); seen.push(await pos()); }
  check('Corner button: bottom right, bottom left, top left, top right (clockwise), always inside the window', seen[0][2] >= 1190 && seen[0][3] >= 790 && seen[1][0] <= 10 && seen[1][3] >= 790 && seen[2][0] <= 10 && seen[2][1] <= 10 && seen[3][2] >= 1190 && seen[3][1] <= 10, JSON.stringify(seen));
  await pg.click('.wtfl-corner'); await pg.waitForTimeout(150);
  await pg.click('#dashOpen'); await pg.waitForTimeout(400); await pg.click('.dnav [data-page=worktrack]'); await pg.waitForTimeout(500);
  await pg.click('#waPos'); await pg.waitForTimeout(300); const rp = await pos();
  check('Reset clock position (WorkTrack page) puts it back top right (below the dashboard header)', rp[2] >= 1190 && rp[1] <= 80 && rp[1] >= 8, JSON.stringify(rp));
  await ctx.close(); }

// ---- 7. visitor page has no alarm or clock content
{ const { ctx, pg } = await fresh({ init: stubAudio, initArg: ON }); ORIG = await pg.title();
  check('visitor (not signed in): no timer, no audio, clock hidden, no alarm text on the page', (await pg.evaluate(() => window.__wtAlarm.timer)) === '' && (await pg.evaluate(() => window.__ctxs)) === 0 && await pg.evaluate(() => { const e = document.getElementById('wtFloat'); return !e || e.hidden; }));
  await ctx.close(); }
console.log('page errors:', errs.filter(e => !/firebase|gstatic|Failed to load|orderBy/i.test(e)));
await b.close(); srv.close(); console.log(results.filter(x => !x[1]).length ? 'SOME FAILED' : 'ALL PASSED');
