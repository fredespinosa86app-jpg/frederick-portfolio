import { b, base, check, errs, fresh, signIn, signOut, vis, results, srv } from './w5a-harness.mjs';
let { ctx, pg } = await fresh();
await signIn(pg); await pg.waitForTimeout(400);
await pg.evaluate(() => window.wtApi.punch('CLOCK_IN')); await pg.waitForTimeout(400);
const box = () => pg.evaluate(() => { const r = document.getElementById('wtFloat').getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
let b0 = await box(); check('default is top right', b0.y === 8 && b0.x + b0.w >= 1200 - 8 - 2, JSON.stringify(b0));
// drag by the bar
const g = await pg.$('.wtfl-grip'); const gb = await g.boundingBox();
await pg.mouse.move(gb.x + 10, gb.y + 10); await pg.mouse.down(); await pg.mouse.move(gb.x - 400, gb.y + 300, { steps: 8 }); await pg.mouse.up();
let b1 = await box(); check('dragged to new place', Math.abs(b1.x - (b0.x - 410)) < 20 && b1.y > 250, JSON.stringify([b0, b1]));
// drag far outside -> clamped
await pg.mouse.move(b1.x + 20, b1.y + 12); await pg.mouse.down(); await pg.mouse.move(-500, -500, { steps: 5 }); await pg.mouse.up();
let b2 = await box(); check('cannot leave the window (top-left)', b2.x >= 8 && b2.y >= 8, JSON.stringify(b2));
await pg.mouse.move(b2.x + 20, b2.y + 12); await pg.mouse.down(); await pg.mouse.move(5000, 5000, { steps: 5 }); await pg.mouse.up();
let b3 = await box(); check('cannot leave the window (bottom-right)', b3.x + b3.w <= 1200 - 8 + 1 && b3.y + b3.h <= 800 - 8 + 1, JSON.stringify(b3));
// keyboard
await pg.focus('.wtfl-grip'); await pg.keyboard.press('ArrowLeft'); let b4 = await box(); check('arrow key moves 10px', b3.x - b4.x === 10, JSON.stringify([b3, b4]));
await pg.keyboard.press('Shift+ArrowUp'); let b5 = await box(); check('shift+arrow moves 50px', b4.y - b5.y === 50);
// persistence across reload, without opening WorkTrack page
const saved = await pg.evaluate(() => localStorage.getItem('wtFloat:v1')); check('position saved on this device', /"x":\d+/.test(saved), saved);
const store = await pg.evaluate(() => JSON.stringify(window.__store));
await pg.reload(); await pg.waitForFunction(() => window.wtApi);
await pg.evaluate(s => { /* stub store is reset on reload; restore it before sign-in */ Object.assign(window.__store, JSON.parse(s)); }, store);
await signIn(pg); await pg.waitForTimeout(600);
check('after reload: visible without opening WorkTrack page', await vis(pg));
let b6 = await box(); check('after reload: same place', Math.abs(b6.x - b5.x) <= 1 && Math.abs(b6.y - b5.y) <= 1, JSON.stringify([b5, b6]));
// Home resets
await pg.focus('.wtfl-grip'); await pg.keyboard.press('Home'); let b7 = await box(); check('Home resets to top right', b7.y === 8 && b7.x > 800);
// minimise
await pg.click('.wtfl-min'); check('minimise hides buttons', await pg.evaluate(() => document.getElementById('wtflBody').hidden));
check('minimise aria-expanded=false', (await pg.getAttribute('.wtfl-min', 'aria-expanded')) === 'false');
await pg.click('.wtfl-min'); check('expand shows buttons', !(await pg.evaluate(() => document.getElementById('wtflBody').hidden)));
// visible over the public site (dash closed) and in the dashboard
check('parent is body when dashboard closed', await pg.evaluate(() => document.getElementById('wtFloat').parentNode === document.body));
await pg.click('#dashOpen'); await pg.waitForTimeout(400);
check('dashboard open', await pg.evaluate(() => !document.getElementById('dash').hidden));
check('R1: clock moved INSIDE the aria-modal dashboard', await pg.evaluate(() => document.getElementById('dash').contains(document.getElementById('wtFloat'))));
check('clock still visible in dashboard', await vis(pg));
check('clock is above dashboard content (hit test)', await pg.evaluate(() => { const r = document.getElementById('wtFloat').getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + 40); return document.getElementById('wtFloat').contains(e); }));
// punch from inside dashboard
await pg.click('.wtfl-btn[data-punch=FIRST_BREAK_OUT]'); await pg.waitForTimeout(500);
check('punch works inside dashboard', (await pg.textContent('.wtfl-status')) === 'On first break');
// keyboard reachable: tab through dashboard until we reach a wtfl element
await pg.focus('#dtitle').catch(() => {});
let reached = false; for (let i = 0; i < 80 && !reached; i++) { await pg.keyboard.press('Tab'); reached = await pg.evaluate(() => !!document.activeElement.closest && !!document.activeElement.closest('#wtFloat')); }
check('R1: keyboard Tab reaches the clock while dashboard is open', reached);
await pg.waitForFunction(() => !document.getElementById('dClose').disabled, null, { timeout: 15000 }); await pg.click('#dClose'); await pg.waitForTimeout(300);
check('dashboard closed', await pg.evaluate(() => document.getElementById('dash').hidden));
check('clock back on the page (body) and visible', (await vis(pg)) && await pg.evaluate(() => document.getElementById('wtFloat').parentNode === document.body));
// focus sync read budget
await pg.evaluate(() => { window.__r0 = window.__reads(); });
for (let i = 0; i < 5; i++) { await pg.evaluate(() => { window.dispatchEvent(new Event('focus')); }); await pg.waitForTimeout(100); }
const used = await pg.evaluate(() => window.__reads() - window.__r0); check('5 focus events cause at most 1 read', used <= 1, used);
console.log('page errors:', errs.filter(e => !/firebase|gstatic|Failed to load|orderBy/i.test(e)));
await pg.screenshot({ path: '/tmp/w5a-desktop.png' });
await b.close(); srv.close(); console.log(results.filter(x => !x[1]).length ? 'SOME FAILED' : 'ALL PASSED');
