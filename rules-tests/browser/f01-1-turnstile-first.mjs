import { b, base, check, errs, fresh, results, srv } from './w5-harness.mjs';
/* F-01: Turnstile first - the booking form when the Worker says codeFallback:false (strict), with the backup pass, and with the emergency switch. Based on the SE-E6 harness. SE-E6: the booking form's Turnstile step against a stub Cloudflare script and a stub forms Worker (no network). */
const STUB = mode => `window.__tsCalls=[];window.turnstile={render:function(el,o){window.__tsCalls.push({sitekey:o.sitekey,action:o.action});el.setAttribute('data-stub','1');var b=document.createElement('button');b.type='button';b.id='tsStubOk';b.textContent='stub pass';b.onclick=function(){o.callback('STUBTOKEN')};el.appendChild(b);var e=document.createElement('button');e.type='button';e.id='tsStubErr';e.textContent='stub err';e.onclick=function(){o['error-callback']()};el.appendChild(e);return 'w1'},remove:function(){window.__tsRemoved=(window.__tsRemoved||0)+1},reset:function(){}};`;
async function run(name, { ts = true, loadTs = 'ok', verify, viewport, cf } = {}, fn) {
  const { ctx, pg } = await fresh(viewport ? { viewport } : {}); const seen = []; const challenges = { n: 0 };
  await pg.route(/workers\.dev/, async r => { const u = new URL(r.request().url()); const j = (s, o) => r.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' }, body: JSON.stringify(o) });
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST' } });
    if (u.pathname === '/v1/status') return j(200, { ok: true, open: true, paused: false, tokenRequired: true, cap: 30, day: '20261107', turnstile: ts, ...(cf === undefined ? {} : { codeFallback: cf }) });
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


const msgOf = pg => pg.textContent('#mStatus').then(t => t.trim());
const strictMsg = /could not run in this browser/;
await run('strict: widget shown, "use a code" hidden', { cf: false }, async ({ pg }) => {
  check('Turnstile box shown and the six-digit-code button is hidden', await vis(pg, 'gTsBox') && !(await vis(pg, 'gTsCode')) && await vis(pg, 'gTsCancel'));
  const f = await pg.evaluate(() => document.activeElement && document.activeElement.id); check('keyboard focus lands on Cancel, not on a hidden button', f === 'gTsCancel', f); });
await run('strict: Cloudflare script blocked', { cf: false, loadTs: 'blocked' }, async ({ pg, seen }) => {
  await pg.waitForTimeout(500);
  check('no code box; the form says the check could not run and offers email; nothing sent to /verify', !(await vis(pg, 'gCodeBox')) && !(await vis(pg, 'gTsBox')) && strictMsg.test(await pg.textContent('body')) && seen.length === 0, JSON.stringify(seen)); });
await run('strict: widget error', { cf: false }, async ({ pg, seen }) => {
  await pg.click('#tsStubErr'); await pg.waitForTimeout(400);
  check('widget error -> same plain message, no code box, no code ever sent', !(await vis(pg, 'gCodeBox')) && strictMsg.test(await pg.textContent('body')) && seen.every(b0 => !('code' in b0)), JSON.stringify(seen)); });
await run('strict: check refused -> notice without the word code', { cf: false, verify: (b0, n) => n === 1 ? { s: 400, o: { error: 'turnstile' } } : { s: 503, o: { error: 'paused' } } }, async ({ pg, challenges }) => {
  await pg.click('#tsStubOk'); await pg.waitForTimeout(500); const m = await pg.textContent('#gMsg');
  check('new challenge, widget again, notice says try again and does not offer a code', challenges.n === 2 && await vis(pg, 'gTsBox') && /did not pass/.test(m) && !/code/i.test(m) && !(await vis(pg, 'gTsCode')), challenges.n + ' ' + m); });
await run('strict: Cloudflare down with a backup pass', { cf: false, verify: (b0, n) => b0.ts ? { s: 503, o: { error: 'tsdown', fb: '1790000000000.PASS_abc-123' } } : { s: 503, o: { error: 'paused' } } }, async ({ pg, seen, challenges }) => {
  await pg.click('#tsStubOk'); await pg.waitForTimeout(500);
  check('the code box appears on the same challenge', await vis(pg, 'gCodeBox') && challenges.n === 1 && (await pg.textContent('#gCode')) === '123456');
  await pg.fill('#gInput', '123456'); await pg.click('#gOk'); await pg.waitForTimeout(400);
  check('the code is sent WITH the backup pass: {challenge, code, fb}', seen.length === 2 && seen[1].challenge === 'CH1' && seen[1].code === '123456' && seen[1].fb === '1790000000000.PASS_abc-123', JSON.stringify(seen)); });
await run('strict: Cloudflare down without a pass', { cf: false, verify: b0 => b0.ts ? { s: 503, o: { error: 'tsdown' } } : { s: 503, o: { error: 'paused' } } }, async ({ pg, seen }) => {
  await pg.click('#tsStubOk'); await pg.waitForTimeout(500);
  check('no code box; the plain message with the email suggestion; only the Turnstile try was sent', !(await vis(pg, 'gCodeBox')) && strictMsg.test(await pg.textContent('body')) && seen.length === 1 && 'ts' in seen[0], JSON.stringify(seen)); });
await run('strict: Worker answers needts on a code', { cf: false, verify: b0 => b0.ts ? { s: 503, o: { error: 'tsdown', fb: '1790000000000.PASS' } } : { s: 400, o: { error: 'needts' } } }, async ({ pg }) => {
  await pg.click('#tsStubOk'); await pg.waitForTimeout(400); await pg.fill('#gInput', '123456'); await pg.click('#gOk'); await pg.waitForTimeout(500);
  check('needts is shown as the plain message, no loop', strictMsg.test(await pg.textContent('body')) && !(await vis(pg, 'gCodeBox'))); });
await run('emergency switch on (codeFallback true)', { cf: true }, async ({ pg, seen }) => {
  check('the old button is back and works', await vis(pg, 'gTsCode')); await pg.click('#gTsCode'); await pg.waitForTimeout(200);
  check('code box shown', await vis(pg, 'gCodeBox')); await pg.fill('#gInput', '123456'); await pg.click('#gOk'); await pg.waitForTimeout(300);
  check('the code goes as {challenge, code} with no pass', seen.length === 1 && seen[0].code === '123456' && !('fb' in seen[0]), JSON.stringify(seen)); });
await run('older Worker (no codeFallback field)', {}, async ({ pg }) => { check('the old button is shown (backward compatible)', await vis(pg, 'gTsCode')); });
await run('Worker without Turnstile, strict flag ignored', { ts: false, cf: false }, async ({ pg }) => { check('old code box shown', await vis(pg, 'gCodeBox') && !(await vis(pg, 'gTsBox'))); });
await run('strict at phone width', { cf: false, viewport: { width: 360, height: 740 }, loadTs: 'blocked' }, async ({ pg }) => {
  await pg.waitForTimeout(500); const o = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check('no sideways scroll with the new message at 360 px', o.sw <= o.cw + 1, JSON.stringify(o)); });
check('no page errors', errs.length === 0, errs.join('|'));
await b.close(); srv.close(); const bad = results.filter(r => !r[1]).length; console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
