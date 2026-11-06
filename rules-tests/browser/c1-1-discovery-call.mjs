import { b, base, check, errs, fresh, signIn, results, srv } from './w5-harness.mjs';
import fs from 'node:fs';
const CB = (await import('../../scripts/core-booking.js')).default;
const { ctx, pg } = await fresh();
const sched = () => pg.evaluate(() => { const f = document.getElementById('mForm'), e = document.getElementById('mEmbed'), v = x => !!x && getComputedStyle(x).display !== 'none' && !x.hidden && x.offsetParent !== null;
  const fr = e.querySelector('iframe'); return { form: v(f), embed: v(e), src: fr && fr.src, sb: fr && fr.getAttribute('sandbox'), ref: fr && fr.referrerPolicy, title: fr && fr.title, frames: document.querySelectorAll('#schedule iframe').length, scripts: document.querySelectorAll('#schedule script').length,
    head: [...document.querySelectorAll('#schedule .head p')].filter(p => p.offsetParent !== null).map(p => p.textContent).join('|'), h2: document.querySelector('#schedule .head h2').textContent, link: (e.querySelector('a') || {}).href, linkRel: (e.querySelector('a') || {}).rel }; });
const setB = o => pg.evaluate(o => window.serviceFormsApi.set(Object.assign({ enabled: false }, o)), o);
await pg.evaluate(() => { location.hash = '#schedule'; }); await pg.waitForTimeout(300);
let s = await sched();
check('default: built-in form shown, no calendar frame', s.form && !s.embed && s.frames === 0, JSON.stringify(s));
check('heading is "Book a Discovery Call"', s.h2 === 'Book a Discovery Call' && /Tell me a little/.test(s.head), s.h2 + ' ' + s.head);
check('tab title renamed', /^Book a Discovery Call/.test(await pg.title()), await pg.title());
check('button says "Send Discovery Call Request"', /Send Discovery Call Request/.test(await pg.textContent('#mBtn')));
await setB({ booking: { mode: 'embed', url: 'https://calendly.com/fred/30min' } }); await pg.waitForTimeout(150); s = await sched();
check('outside calendar on: built-in form hidden', !s.form);
check('outside calendar on: frame shown with the checked address', s.embed && s.frames === 1 && s.src === 'https://calendly.com/fred/30min', JSON.stringify(s));
check('frame is sandboxed, no-referrer, titled', /allow-scripts/.test(s.sb) && !/allow-top-navigation(?!-by)/.test(s.sb) && s.ref === 'no-referrer' && /discovery call/i.test(s.title), s.sb + s.ref);
check('fallback link opens in new tab safely', s.link === 'https://calendly.com/fred/30min' && /noopener/.test(s.linkRel));
check('intro text switches to the calendar sentence', /Choose a time/.test(s.head) && !/Tell me a little/.test(s.head), s.head);
check('no script elements were added to the section', s.scripts === 0);
check('the third-party notice is shown', /third-party/.test(await pg.textContent('#mEmbed')));
// bad or tampered saved values fall back to the built-in form
for (const bad of [{ mode: 'embed', url: 'https://evil.com/x' }, { mode: 'embed', url: 'javascript:alert(1)' }, { mode: 'embed', url: '<iframe src="https://calendly.com/x">' }, { mode: 'embed', url: '' }, { mode: 'embed' }, 'embed', null]) {
  await setB({ booking: bad }); await pg.waitForTimeout(80); s = await sched();
  if (!(s.form && !s.embed && s.frames === 0)) check('bad saved value falls back: ' + JSON.stringify(bad), false, JSON.stringify(s));
}
check('7 bad saved values all fall back to the built-in form, no frame', true);
await setB({ booking: { mode: 'embed', url: 'https://calendly.com/fred/30min' } }); await pg.waitForTimeout(100);
await setB({ booking: { mode: 'native', url: '' } }); await pg.waitForTimeout(100); s = await sched();
check('switching back to built-in: form back, frame removed', s.form && !s.embed && s.frames === 0, JSON.stringify(s));
await setB({ booking: { mode: 'embed', url: 'https://calendly.com/fred/30min' } });
await pg.evaluate(() => document.getElementById('schedule').classList.add('closed')); await pg.waitForTimeout(100); s = await sched();
check('hiring closed: calendar hidden too, closed message shown', !s.embed && !s.form && await pg.isVisible('.closedMsg'), JSON.stringify(s));
check('closed message says Discovery call', /Discovery call requests are not being accepted/.test(await pg.textContent('.closedMsg')));
await pg.evaluate(() => document.getElementById('schedule').classList.remove('closed'));
// CSP lists every provider host in frame-src only
const csp = await pg.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
const fs_ = (csp.match(/frame-src ([^;]*)/) || [])[1] || '';
check('CSP frame-src has every provider host', CB.CSP_HOSTS.every(h => fs_.split(' ').includes(h)), CB.CSP_HOSTS.filter(h => !fs_.split(' ').includes(h)).join(','));
check('CSP: nothing else loosened (script-src/default-src unchanged by providers)', !/calendly|leadconnector|msgsndr/.test(csp.replace(/frame-src [^;]*/, '')));
// ---- owner side ----
await setB({ booking: { mode: 'native', url: '' } });
await pg.evaluate(() => { location.hash = '#home'; }); await signIn(pg); await pg.waitForTimeout(300);
await pg.evaluate(() => { for (const k of Object.keys(window.__store)) if (k.startsWith('content/')) delete window.__store[k]; });
await pg.click('#dashOpen'); await pg.waitForTimeout(300); await pg.click('.dnav [data-page=svcforms]'); await pg.waitForTimeout(500);
const own = () => pg.evaluate(() => ({ native: document.getElementById('bkNative').checked, embed: document.getElementById('bkEmbed').checked, box: !document.getElementById('bkEmbedBox').hidden, info: document.getElementById('bkInfo').textContent, prev: document.querySelectorAll('#bkPrev iframe').length, pub: !document.getElementById('sfPublish').disabled }));
let o = await own();
check('owner: Booking method card defaults to built-in form, paste box hidden', o.native && !o.embed && !o.box && !o.pub, JSON.stringify(o));
await pg.check('#bkEmbed'); await pg.waitForTimeout(150); o = await own();
check('owner: choosing outside calendar shows the paste box', o.embed && o.box && /Nothing pasted/.test(o.info), JSON.stringify(o));
await pg.click('#sfPublish'); await pg.waitForTimeout(300);
check('owner: publish refused with nothing pasted, nothing saved', !(await pg.evaluate(() => window.__store['content/serviceForms'])));
const ghl = '<iframe src="https://api.leadconnectorhq.com/widget/booking/AbC123" style="width:100%" id="x"></iframe>\n<script src="https://link.msgsndr.com/js/form_embed.js" type="text/javascript"></script><script>alert(1)</script>';
await pg.fill('#bkCode', 'https://evil.com/book'); await pg.waitForTimeout(150); o = await own();
check('owner: unapproved provider explained, no preview', /not on the approved list/.test(o.info) && o.prev === 0, o.info);
await pg.click('#sfPublish'); await pg.waitForTimeout(300);
check('owner: unapproved provider cannot be published', !(await pg.evaluate(() => window.__store['content/serviceForms'])));
await pg.fill('#bkCode', ghl); await pg.waitForTimeout(150); o = await own();
check('owner: GoHighLevel code detected, preview shown', /Detected: GoHighLevel/.test(o.info) && o.prev === 1, JSON.stringify(o));
check('owner: preview frame is sandboxed', /allow-scripts/.test(await pg.getAttribute('#bkPrev iframe', 'sandbox')));
await pg.click('#sfPublish'); await pg.waitForTimeout(500);
let doc = await pg.evaluate(() => window.__store['content/serviceForms']);
check('owner: published booking is only mode + checked address', doc && JSON.stringify(doc.booking) === '{"mode":"embed","url":"https://api.leadconnectorhq.com/widget/booking/AbC123"}', JSON.stringify(doc && doc.booking));
check('owner: nothing pasted other than the address was stored', !/script|alert|iframe|form_embed/.test(JSON.stringify(doc)));
check('owner: existing service forms data kept in the same document', Array.isArray(doc.services) && Array.isArray(doc.forms) && doc.enabled === false);
await pg.waitForTimeout(200);
await pg.click('#dClose').catch(() => {}); await pg.waitForTimeout(300);
await pg.evaluate(() => { location.hash = '#schedule'; window.serviceFormsApi.set(window.__store['content/serviceForms']); }); await pg.waitForTimeout(200); s = await sched();
check('visitor now sees the published calendar and no built-in form', s.embed && !s.form && s.src === 'https://api.leadconnectorhq.com/widget/booking/AbC123', JSON.stringify(s));
// switch back + discard behaviour
await pg.evaluate(() => { location.hash = '#home'; }); await pg.click('#dashOpen'); await pg.waitForTimeout(300); await pg.click('.dnav [data-page=svcforms]'); await pg.waitForTimeout(400);
o = await own(); check('owner: reopening shows the saved calendar choice', o.embed && o.box && /Detected/.test(o.info), JSON.stringify(o));
await pg.check('#bkNative'); await pg.waitForTimeout(100); await pg.click('#sfDiscard'); await pg.waitForTimeout(200); o = await own();
check('owner: Discard restores the saved choice', o.embed && o.box, JSON.stringify(o));
await pg.check('#bkNative'); await pg.waitForTimeout(100); await pg.click('#sfPublish'); await pg.waitForTimeout(500);
doc = await pg.evaluate(() => window.__store['content/serviceForms']);
check('owner: switching back saves native mode with no address', doc.booking.mode === 'native' && doc.booking.url === '', JSON.stringify(doc.booking));
// owner labels
const txt = await pg.evaluate(() => document.getElementById('dash').textContent);
check('owner dashboard says Discovery call requests, no "Meeting requests" label left', /Discovery call requests/.test(txt) && !/Meeting requests\b/.test(txt) && !/Meeting Request form/.test(txt));
check('page errors: ' + JSON.stringify(errs), errs.length === 0);
const bad = results.filter(r => !r[1]).length; console.log(bad ? 'SOME FAILED' : 'ALL PASSED');
await b.close(); srv.close();
