import { b, base, check, errs, fresh, results, srv } from './w5-harness.mjs';
/* SE-E6: the booking form's Turnstile step against a stub Cloudflare script and a stub forms Worker (no network). */
const STUB = mode => `window.__tsCalls=[];window.turnstile={render:function(el,o){window.__tsCalls.push({sitekey:o.sitekey,action:o.action});el.setAttribute('data-stub','1');var b=document.createElement('button');b.type='button';b.id='tsStubOk';b.textContent='stub pass';b.onclick=function(){o.callback('STUBTOKEN')};el.appendChild(b);var e=document.createElement('button');e.type='button';e.id='tsStubErr';e.textContent='stub err';e.onclick=function(){o['error-callback']()};el.appendChild(e);return 'w1'},remove:function(){window.__tsRemoved=(window.__tsRemoved||0)+1},reset:function(){}};`;
async function run(name, { ts = true, loadTs = 'ok', verify, viewport } = {}, fn) {
  const { ctx, pg } = await fresh(viewport ? { viewport } : {}); const seen = []; const challenges = { n: 0 };
  await pg.route(/workers\.dev/, async r => { const u = new URL(r.request().url()); const j = (s, o) => r.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' }, body: JSON.stringify(o) });
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST' } });
    if (u.pathname === '/v1/status') return j(200, { ok: true, open: true, paused: false, tokenRequired: true, cap: 30, day: '20261107', turnstile: ts });
    if (u.pathname === '/v1/challenge') { challenges.n++; return j(200, { challenge: 'CH' + challenges.n, code: '123456', expiresInS: 300 }); }
    if (u.pathname === '/v1/verify') { const body = JSON.parse(r.request().postData() || '{}'); seen.push(body); const v = verify ? verify(body, seen.length) : { s: 503, o: { error: 'paused' } }; return j(v.s, v.o); }
    return j(404, {}); });
  await pg.route(/challenges\.cloudflare\.com/, r => loadTs === 'ok' ? r.fulfill({ status: 200, contentType: 'application/javascript', body: STUB() }) : r.abort());
  await pg.goto(base + '#schedule'); await pg.waitForTimeout(500);
  await pg.evaluate(() => { const f = document.getElementById('mForm'); const set = (n, v) => { const e = f.querySelector('[name=' + n + ']'); if (e) e.value = v; };
    set('name', 'Ann Visitor'); set('email', 'ann@example.com'); set('message', 'Hello there'); const c = f.querySelector('[name=company]'); if (c) c.value = 'Acme'; });
  const day = pg.locator('#mCal .cal-b:not([disabled])').first(); await day.click(); await pg.waitForTimeout(150);
  await pg.locator('#mSlots button:not([disabled])').first().click(); await pg.waitForTimeout(150);
  await pg.click('#mBtn'); await pg.waitForTimeout(900);
  const st = { pg, seen, challenges }; try { await fn(st); } catch (e) { check(name + ' (exception)', false, String(e)); } await ctx.close(); }
const vis = (pg, id) => pg.evaluate(i => { const e = document.getElementById(i); return !!e && !e.hidden && e.offsetParent !== null; }, id);

await run('widget path', { verify: (b0) => b0.ts ? { s: 503, o: { error: 'paused' } } : { s: 401, o: {} } }, async ({ pg, seen }) => {
  check('Turnstile box shown, code box hidden', await vis(pg, 'gTsBox') && !(await vis(pg, 'gCodeBox')));
  check('widget rendered with the public key and action "meeting"', await pg.evaluate(() => JSON.stringify(window.__tsCalls)) === '[{"sitekey":"0x4AAAAAAF3CDYLp6mETZLKs","action":"meeting"}]');
  check('widget area has an accessible name and the status line is a live region', await pg.getAttribute('#gTs', 'aria-label') === 'Automatic safety check' && await pg.getAttribute('#gMsg', 'role') === 'status');
  await pg.click('#tsStubOk'); await pg.waitForTimeout(400);
  check('token is sent to the Worker as {challenge, ts}', seen.length === 1 && seen[0].challenge === 'CH1' && seen[0].ts === 'STUBTOKEN' && !('code' in seen[0]), JSON.stringify(seen));
  check('widget removed after the answer', (await pg.evaluate(() => window.__tsRemoved || 0)) >= 1); });

await run('code instead', {}, async ({ pg, seen }) => {
  await pg.click('#gTsCode'); await pg.waitForTimeout(200);
  check('"Use a six-digit code instead" shows the code box', await vis(pg, 'gCodeBox') && !(await vis(pg, 'gTsBox')) && (await pg.textContent('#gCode')) === '123456');
  await pg.fill('#gInput', '123456'); await pg.click('#gOk'); await pg.waitForTimeout(300);
  check('the code goes as {challenge, code} on the same challenge', seen.length === 1 && seen[0].challenge === 'CH1' && seen[0].code === '123456'); });

await run('widget error', {}, async ({ pg }) => {
  await pg.click('#tsStubErr'); await pg.waitForTimeout(250);
  check('widget error -> code box with the plain note', await vis(pg, 'gCodeBox') && /six-digit code/.test(await pg.textContent('#gMsg'))); });

await run('Cloudflare script blocked', { loadTs: 'blocked' }, async ({ pg }) => {
  await pg.waitForTimeout(500);
  check('script cannot load -> code box (form still usable)', await vis(pg, 'gCodeBox') && !(await vis(pg, 'gTsBox')) && /six-digit code/.test(await pg.textContent('#gMsg'))); });

await run('Worker without Turnstile', { ts: false }, async ({ pg }) => {
  check('old code box shown, widget never created', await vis(pg, 'gCodeBox') && !(await vis(pg, 'gTsBox')) && (await pg.evaluate(() => typeof window.turnstile)) === 'undefined'); });

await run('check refused', { verify: (b0, n) => n === 1 ? { s: 400, o: { error: 'turnstile' } } : { s: 503, o: { error: 'paused' } } }, async ({ pg, seen, challenges }) => {
  await pg.click('#tsStubOk'); await pg.waitForTimeout(500);
  check('refusal -> a new challenge and the widget again with the notice', challenges.n === 2 && await vis(pg, 'gTsBox') && /did not pass/.test(await pg.textContent('#gMsg')), challenges.n + ' ' + (await pg.textContent('#gMsg'))); });

await run('keyboard', {}, async ({ pg }) => {
  const f = await pg.evaluate(() => document.activeElement && document.activeElement.id); check('focus lands on a button inside the box', f === 'gTsCode', f);
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(200); check('Enter on the fallback button switches to the code box', await vis(pg, 'gCodeBox')); });

await run('cancel', {}, async ({ pg }) => {
  await pg.click('#gTsCancel'); await pg.waitForTimeout(300);
  check('Cancel hides the box and clears the status', !(await vis(pg, 'mGuard')) && (await pg.textContent('#mStatus')).trim() === '' && (await pg.evaluate(() => (window.__tsRemoved || 0))) >= 1); });

await run('phone width', { viewport: { width: 360, height: 740 } }, async ({ pg }) => {
  const o = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, r: document.getElementById('gTsCode').getBoundingClientRect().right, w: innerWidth }));
  check('no sideways scroll and the buttons fit at 360 px', o.sw <= o.cw + 1 && o.r <= o.w, JSON.stringify(o)); });

check('no page errors', errs.length === 0, errs.join('|'));
await b.close(); srv.close(); const bad = results.filter(r => !r[1]).length; console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
