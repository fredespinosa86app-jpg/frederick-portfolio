import { b, base, check, errs, fresh, signIn, signOut, vis, results, srv } from './w5-harness.mjs';
// ---- cross-device refresh
{ const { ctx, pg } = await fresh(); await signIn(pg); await pg.waitForTimeout(300);
  await pg.evaluate(() => window.wtApi.punch('CLOCK_IN')); await pg.waitForTimeout(400);
  await pg.evaluate(() => { window.__tdr = 0; { const g = window.OWN.fs.getDoc; window.OWN.fs.getDoc = async r => { if (/^todo/.test(r.path)) window.__tdr++; return g(r); }; } window.__r1 = window.__reads(); const o = Date.now; Date.now = () => o() + 61000; window.dispatchEvent(new Event('focus')); });
  await pg.waitForTimeout(500);
  const unchanged = await pg.evaluate(() => window.__reads() - window.__r1 - window.__tdr);   /* TD1: the to-do timer check is its own read and is not counted here */ check('same revision: exactly 1 read, no full reload', unchanged === 1, unchanged);
  await pg.evaluate(() => { const s = window.__store, m = s['workState/main']; const sid = m.sid; s['workState/main'] = Object.assign({}, m, { state: 'FIRST_BREAK', fb: true, n: 2, rev: m.rev + 1, lastEid: sid + '__2' }); s['workEvents/' + sid + '__2'] = { sid, n: 2, type: 'FIRST_BREAK_OUT', at: { toMillis: () => Date.now() - 1000 }, by: 'u1' }; });
  await pg.evaluate(() => { const o = Date.now; Date.now = () => o() + 61000; window.dispatchEvent(new Event('focus')); });
  await pg.waitForTimeout(700);
  check('other device punched: clock follows after focus check', (await pg.textContent('.wtfl-status')) === 'On first break', await pg.textContent('.wtfl-status'));
  await ctx.close(); }
// ---- phone size, touch drag
{ const { ctx, pg } = await fresh({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true }); await signIn(pg); await pg.waitForTimeout(300);
  await pg.evaluate(() => window.wtApi.punch('CLOCK_IN')); await pg.waitForTimeout(400);
  const r = await pg.evaluate(() => { const r = document.getElementById('wtFloat').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, sw: document.documentElement.scrollWidth, vw: innerWidth }; });
  check('phone: fits inside 375px width', r.l >= 0 && r.r <= 375 && r.sw <= 375, JSON.stringify(r));
  check('phone: buttons are at least 40px tall', await pg.$$eval('.wtfl-btn', e => e.every(x => x.getBoundingClientRect().height >= 40)));
  await pg.click('.wtfl-min:not(.wtfl-corner)'); const m = await pg.evaluate(() => document.getElementById('wtFloat').getBoundingClientRect().width); check('phone: minimised stays inside screen', m <= 367, m);
  await pg.screenshot({ path: '/tmp/w5a-phone.png' }); await ctx.close(); }
// ---- reduced motion + forced colors
{ const { ctx, pg } = await fresh(); await pg.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' }); await signIn(pg); await pg.waitForTimeout(300);
  await pg.evaluate(() => window.wtApi.punch('CLOCK_IN')); await pg.waitForTimeout(400);
  check('reduced motion: no transition/animation on the clock', await pg.evaluate(() => { const c = getComputedStyle(document.getElementById('wtFloat')); return c.transitionDuration.split(',').every(x => parseFloat(x) === 0) && c.animationName === 'none'; }));
  check('forced colors: system colours used (border drawn)', await pg.evaluate(() => parseFloat(getComputedStyle(document.getElementById('wtFloat')).borderTopWidth) >= 2));
  await pg.screenshot({ path: '/tmp/w5a-forced.png' }); await ctx.close(); }
// ---- dark-mode / text zoom 200%
{ const { ctx, pg } = await fresh({ viewport: { width: 640, height: 400 } }); await signIn(pg); await pg.waitForTimeout(300);
  await pg.evaluate(() => window.wtApi.punch('CLOCK_IN')); await pg.waitForTimeout(400);
  await pg.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const r = await pg.evaluate(() => { const r = document.getElementById('wtFloat').getBoundingClientRect(); return { r: r.right, b: r.bottom }; }); check('small window: clock inside the window', r.r <= 640 && r.b <= 400 + 1, JSON.stringify(r));
  await ctx.close(); }
console.log('page errors:', errs.filter(e => !/firebase|gstatic|Failed to load|orderBy/i.test(e)));
await b.close(); srv.close(); console.log(results.filter(x => !x[1]).length ? 'SOME FAILED' : 'ALL PASSED');
