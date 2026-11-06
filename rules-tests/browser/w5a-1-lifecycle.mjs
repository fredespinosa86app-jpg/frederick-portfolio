import { b, base, check, errs, fresh, signIn, signOut, vis, results, srv } from './w5-harness.mjs';
const { ctx, pg } = await fresh();
check('hidden before sign-in', !(await vis(pg)));
await signIn(pg); await pg.waitForTimeout(500);
check('hidden when signed in but not clocked in', !(await vis(pg)));
// clock in through the API
let r = await pg.evaluate(() => window.wtApi.punch('CLOCK_IN')); check('API clock in ok', r.ok, JSON.stringify(r));
await pg.waitForTimeout(300);
check('visible after clock in', await vis(pg));
check('status Working', (await pg.textContent('.wtfl-status')) === 'Working');
const btns = async () => pg.$$eval('.wtfl-btn', e => e.map(x => x.dataset.punch));
check('buttons after clock in', JSON.stringify(await btns()) === JSON.stringify(['FIRST_BREAK_OUT','LUNCH_OUT','LAST_BREAK_OUT','CLOCK_OUT']), JSON.stringify(await btns()));
check('time ticks', await (async () => { const a = await pg.textContent('.wtfl-time'); await pg.waitForTimeout(1300); return a !== await pg.textContent('.wtfl-time'); })());
// punch from widget
await pg.click('.wtfl-btn[data-punch=LUNCH_OUT]'); await pg.waitForTimeout(500);
check('widget punch lunch out -> On lunch', (await pg.textContent('.wtfl-status')) === 'On lunch', await pg.textContent('.wtfl-status'));
check('only Lunch in offered', JSON.stringify(await btns()) === '["LUNCH_IN"]');
const ev = await pg.evaluate(() => Object.keys(window.__store).filter(k => k.startsWith('workEvents/')).length); check('2 event records, one per punch', ev === 2, ev);
await pg.click('.wtfl-btn[data-punch=LUNCH_IN]'); await pg.waitForTimeout(500);
// clock out needs confirm
await pg.click('.wtfl-btn[data-punch=CLOCK_OUT]'); await pg.waitForTimeout(200);
check('clock out asks to confirm (still visible)', (await vis(pg)) && /Confirm/.test(await pg.textContent('.wtfl-out')));
check('no clock-out record yet', await pg.evaluate(() => Object.values(window.__store).filter(x => x.type === 'CLOCK_OUT').length) === 0);
await pg.waitForTimeout(5300);
check('confirm expires after 5 s', /^Clock out$/.test(await pg.textContent('.wtfl-out')));
await pg.click('.wtfl-btn[data-punch=CLOCK_OUT]'); await pg.click('.wtfl-btn[data-punch=CLOCK_OUT]'); await pg.waitForTimeout(600);
check('hidden after clock out', !(await vis(pg)));
// clock in again then sign-out cleanup
await pg.evaluate(() => window.wtApi.punch('CLOCK_IN')); await pg.waitForTimeout(400);
check('visible again', await vis(pg)); check('timer running', await pg.evaluate(() => window.__wtFloat.timerOn));
await signOut(pg); await pg.waitForTimeout(200);
check('sign-out hides', !(await vis(pg)));
check('sign-out stops timer', !(await pg.evaluate(() => window.__wtFloat.timerOn)));
check('sign-out clears private text', await pg.evaluate(() => { const e = document.getElementById('wtFloat'); return e.textContent === '' || !/Working|\d\d:\d\d/.test(e.textContent); }), await pg.evaluate(() => document.getElementById('wtFloat').textContent));
check('api state cleared', await pg.evaluate(() => window.wtApi.state() === null));
console.log('page errors:', errs.filter(e => !/firebase|gstatic|Failed to load/i.test(e)));
await b.close(); srv.close(); console.log(results.filter(x => !x[1]).length ? 'SOME FAILED' : 'ALL PASSED');
