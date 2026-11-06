import { b, check, errs, fresh, signIn, signOut, results, srv } from './w5-harness.mjs';
const OLD = { toMillis: () => Date.now() - 86400000 };
{ const { ctx, pg } = await fresh(); await signIn(pg); await pg.waitForTimeout(300);
  await pg.evaluate(() => { const s = window.__store; ['ALPHA-1', 'BETA-1'].forEach(c => { s['clientRegistry/' + c] = { status: 'active' }; }); });
  await pg.evaluate(() => window.wtApi.punch('CLOCK_IN')); await pg.waitForTimeout(300);
  await pg.evaluate(old => { const s = window.__store, sid = s['workState/main'].sid; const t = Date.now();
    s['workAssign/' + sid + '__ALPHA-1'] = { sid, clientId: 'ALPHA-1', status: 'active', rev: 1, addedAt: { toMillis: () => t - 5000 } };
    s['workAssign/' + sid + '__BETA-1'] = { sid, clientId: 'BETA-1', status: 'active', rev: 1, addedAt: { toMillis: () => t - 1000 } };
    const d = (lu) => ({ fb: 15, lu, lb: 15, pfb: 15, plu: lu, plb: 15, rev: 1, updatedAt: old });
    s['workSchedules/default'] = d(45); s['workSchedules/BETA-1'] = d(90); window.__old = old; }, null);
  await pg.evaluate(() => { const o = { toMillis: () => Date.now() - 86400000 }; for (const k of ['workSchedules/default', 'workSchedules/BETA-1']) window.__store[k].updatedAt = o; });
  await pg.evaluate(() => window.wtApi.punch('LUNCH_OUT')); await pg.waitForTimeout(500);
  let t = await pg.textContent('.wtfl-brk');
  check('first client (ALPHA-1) has no schedule: the DEFAULT (45) is used, not the second client (90)', /Default schedule \(45 min\)/.test(t), t);
  await pg.evaluate(() => window.wtApi.punch('LUNCH_IN')); await pg.waitForTimeout(300);
  await pg.evaluate(() => { const s = window.__store, sid = s['workState/main'].sid; s['workAssign/' + sid + '__ALPHA-1'].status = 'removed'; s['workAssign/' + sid + '__ALPHA-1'].rev = 2; });
  await pg.evaluate(() => window.wtApi.punch('LAST_BREAK_OUT')); await pg.waitForTimeout(500);
  t = await pg.textContent('.wtfl-brk'); check('ALPHA-1 removed: BETA-1 is first, its own schedule is used', /Schedule of BETA-1 \(15 min\)/.test(t), t);
  await pg.evaluate(() => window.wtApi.punch('LAST_BREAK_IN')); await pg.waitForTimeout(300);
  // read cost of one full refresh while a session is open with clients
  await pg.evaluate(() => { window.__r0 = window.__reads(); }); await pg.evaluate(() => window.wtApi.refresh()); await pg.waitForTimeout(300);
  const n = await pg.evaluate(() => window.__reads() - window.__r0); check('a full load costs at most 7 reads (state, events, session, assignments, 2 schedules)', n <= 7, n);
  await ctx.close(); }
{ const { ctx, pg } = await fresh(); await signIn(pg); await pg.waitForTimeout(300);
  await pg.evaluate(() => { const g = window.OWN.fs.getDoc; window.OWN.fs.getDoc = async ref => { if (ref.path.startsWith('workSchedules/')) { const e = new Error('denied'); e.code = 'permission-denied'; throw e; } return g(ref); }; });
  await pg.evaluate(() => window.wtApi.punch('CLOCK_IN')); await pg.waitForTimeout(300); await pg.evaluate(() => window.wtApi.punch('LUNCH_OUT')); await pg.waitForTimeout(500);
  check('rules not published (schedule read refused): the clock still works with the built-in values', /Built-in schedule \(60 min\)/.test(await pg.textContent('.wtfl-brk')));
  check('and the punch buttons still work', (await pg.$$('.wtfl-btn')).length === 1);
  await ctx.close(); }
{ const { ctx, pg } = await fresh(); await pg.emulateMedia({ reducedMotion: 'reduce' }); await signIn(pg); await pg.waitForTimeout(300);
  await pg.evaluate(() => window.wtApi.punch('CLOCK_IN')); await pg.waitForTimeout(300); await pg.evaluate(() => window.wtApi.punch('FIRST_BREAK_OUT')); await pg.waitForTimeout(300);
  await pg.evaluate(() => { const ks = Object.keys(window.__store).filter(k => k.startsWith('workEvents/')).sort((a, b) => window.__store[a].n - window.__store[b].n); window.__store[ks[0]].at = { toMillis: () => Date.now() - 3600000 }; window.__store[ks[1]].at = { toMillis: () => Date.now() - 40 * 60000 }; window.wtApi.refresh(); }); await pg.waitForTimeout(500);
  const r = await pg.evaluate(() => { const c = getComputedStyle(document.querySelector('.wtfl-btn[data-punch=FIRST_BREAK_IN]')); return { cls: document.querySelector('.wtfl-btn[data-punch=FIRST_BREAK_IN]').classList.contains('wtfl-late'), anim: c.animationName, ow: parseFloat(c.outlineWidth) }; });
  check('reduced motion: late button has NO animation but a steady thick outline', r.cls && r.anim === 'none' && r.ow >= 5, JSON.stringify(r));
  check('late is also written as text (not colour or flicker alone)', /late by/.test(await pg.textContent('.wtfl-brk')));
  await pg.screenshot({ path: '/tmp/w5b-late.png' });
  await ctx.close(); }
console.log('page errors:', errs.filter(e => !/firebase|gstatic|Failed to load|orderBy/i.test(e)));
await b.close(); srv.close(); console.log(results.filter(x => !x[1]).length ? 'SOME FAILED' : 'ALL PASSED');
