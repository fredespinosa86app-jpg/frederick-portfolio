import { b, base, check, errs, fresh, results, srv } from './w5-harness.mjs';
/* SE-H1: the booking form has no direct path any more; the helper for counted anonymous writes is loaded; the Owner Security page shows no switch. */
const { ctx, pg } = await fresh(); const fsReq = []; pg.on('request', r => { if (/firestore\.googleapis\.com/.test(r.url())) fsReq.push(r.url()); });
await pg.goto(base + '#schedule'); await pg.waitForTimeout(500);
check('core-anon helper is loaded before the module and exposes make()', await pg.evaluate(() => typeof window.coreAnon === 'object' && typeof window.coreAnon.make === 'function' && /^\d{8}$/.test(window.coreAnon.utcDay(Date.now()))));
check('no direct booking write function exists', await pg.evaluate(() => typeof window.submitMeeting === 'undefined'));
await pg.evaluate(() => { const f = document.getElementById('mForm'); const set = (n, v) => { const e = f.querySelector('[name=' + n + ']'); if (e) e.value = v; }; set('name', 'Ann Visitor'); set('email', 'ann@example.com'); set('message', 'Hello there'); });
await pg.locator('#mCal .cal-b:not([disabled])').first().click(); await pg.waitForTimeout(150); await pg.locator('#mSlots button:not([disabled])').first().click(); await pg.waitForTimeout(150);
await pg.click('#mBtn'); await pg.waitForTimeout(1500);
const st = (await pg.textContent('#mStatus')) || '';
check('Worker unreachable: a plain "safety check could not be reached" message with the e-mail fallback, form stays filled', /safety check could not be reached/i.test(st) && (await pg.locator('#mStatus a.gfb').count()) === 1 && (await pg.inputValue('#mForm [name=name]')) === 'Ann Visitor', st);
check('and NO database write was attempted for the booking (no Firestore request at all)', fsReq.length === 0, fsReq.join(','));
check('Quick check box stays hidden (nothing to verify without the Worker)', await pg.evaluate(() => document.getElementById('mGuard').hidden));
const sec = await pg.evaluate(() => ({ sw: !!document.getElementById('vfSwitch'), state: (document.getElementById('vfState') || {}).textContent, bud: !!document.getElementById('vfBudget') }));
check('Owner Security: no on/off switch; "always on" note and a budget line exist', !sec.sw && /always on/i.test(sec.state) && sec.bud, JSON.stringify(sec));
check('no page errors', errs.length === 0, errs.join('|'));
await ctx.close(); await b.close(); srv.close(); const bad = results.filter(r => !r[1]).length; console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
