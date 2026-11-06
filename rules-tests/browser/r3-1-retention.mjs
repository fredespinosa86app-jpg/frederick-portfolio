import { b, check, errs, fresh, signIn, results, srv } from './w5-harness.mjs';
const DAY = 864e5;
const { ctx, pg } = await fresh(); await signIn(pg); await pg.waitForTimeout(300);
const put = (id, status, ageDays, extra) => pg.evaluate(([id, status, ageDays, extra]) => { window.__store['meetingRequests/' + id] = Object.assign({ name: 'N ' + id, email: 'maria' + id + '@example.com', company: '', date: '2026-01-10', time: '10:00', tz: 'Asia/Manila', platform: 'Zoom', message: 'hi', status, createdAt: Date.now() - ageDays * 864e5 }, extra); }, [id, status, ageDays, extra || {}]);
const has = id => pg.evaluate(id => !!window.__store['meetingRequests/' + id], id);
const future = new Date(Date.now() + 10 * DAY).toISOString().slice(0, 10), past60 = new Date(Date.now() - 60 * DAY).toISOString().slice(0, 10);
// data set (defaults: finished 730, flag 90, unanswered delete 365, grace 30)
await put('f800', 'completed', 800); await put('c900', 'cancelled', 900); await put('f100', 'completed', 100);
await put('u400', 'new', 400); await put('p400', 'pending', 400); await put('u100', 'new', 100); await put('u30', 'new', 30);
await put('k2000f', 'confirmed', 2000, { date: future });           // very old but the meeting is still ahead: protected
await put('k800p', 'confirmed', 800, { date: past60 });             // confirmed, meeting long over, old enough: due
await put('k100p', 'confirmed', 100, { date: past60 });             // confirmed, meeting over, not old: flagged
await put('weird', 'banana', 5000);                                   // unknown status: kept
await pg.evaluate(() => { window.__store['meetingRequests/nodate'] = { status: 'completed', email: 'x@y.zz' }; });
// ---- weekly banner on sign-in
await pg.evaluate(() => document.dispatchEvent(new CustomEvent('own:auth', { detail: { ok: true, email: 't@x.com' } }))); await pg.waitForTimeout(600);
await pg.click('#dashOpen'); await pg.waitForTimeout(300);
let bt = await pg.evaluate(() => ({ hid: document.getElementById('retBanner').hidden, t: document.getElementById('retBannerTxt').textContent, at: (window.__store['ownerPrivate/config'] || {}).retBannerAt }));
check('banner shown on the dashboard when something is due', !bt.hid && /5 requests are past/.test(bt.t) && /2 need/.test(bt.t), JSON.stringify(bt));
check('banner says nothing is deleted without confirmation', /Nothing is deleted until you review/.test(bt.t));
check('banner time saved so it shows once a week', bt.at > Date.now() - 5000);
check('opening the dashboard deleted nothing', (await pg.evaluate(() => Object.keys(window.__store).filter(k => k.startsWith('meetingRequests/')).length)) === 12);
await pg.evaluate(() => { document.getElementById('retBanner').hidden = true; });
await pg.evaluate(() => document.dispatchEvent(new CustomEvent('own:auth', { detail: { ok: true, email: 't@x.com' } }))); await pg.waitForTimeout(500);
check('second sign-in the same week: no banner', await pg.evaluate(() => document.getElementById('retBanner').hidden));
await pg.evaluate(() => { window.__store['ownerPrivate/config'].retBannerAt = Date.now() - 8 * 864e5; });
await pg.evaluate(() => document.dispatchEvent(new CustomEvent('own:auth', { detail: { ok: true, email: 't@x.com' } }))); await pg.waitForTimeout(500);
check('after 8 days the banner shows again', !(await pg.evaluate(() => document.getElementById('retBanner').hidden)));
await pg.click('#retReview'); await pg.waitForTimeout(500);
check('Review opens Privacy & backup and hides the banner', await pg.evaluate(() => document.getElementById('retBanner').hidden && !document.getElementById('dp-privacy').hidden));
// ---- settings
const sel = id => pg.evaluate(id => [...document.getElementById(id).options].map(o => o.value).join(',') + '|' + document.getElementById(id).value, id);
check('new period selectors exist with defaults 90 / 365 / 730', (await sel('rtFlag')) === '30,60,90,180|90' && (await sel('rtStale')) === '180,365,730|365' && /\|730$/.test(await sel('rtReq')), [await sel('rtFlag'), await sel('rtStale'), await sel('rtReq')].join(' ; '));
await pg.selectOption('#rtFlag', '180'); await pg.selectOption('#rtStale', '180'); await pg.click('#rtSave'); await pg.waitForTimeout(300);
check('flag period must be earlier than delete period: not saved', !(await pg.evaluate(() => (window.__store['settings/site'] || {}).retention && window.__store['settings/site'].retention.reqFlag === 180)));
await pg.selectOption('#rtFlag', '90'); await pg.selectOption('#rtStale', '365'); await pg.click('#rtSave'); await pg.waitForTimeout(300);
check('valid periods saved', await pg.evaluate(() => { const r = (window.__store['settings/site'] || {}).retention; return !!r && r.reqFlag === 90 && r.reqStale === 365 && r.requests === 730; }), JSON.stringify(await pg.evaluate(() => window.__store['settings/site'])));
// ---- preview
await pg.click('#rtCheck'); await pg.waitForTimeout(800);
const list = await pg.textContent('#rtList');
check('preview: 5 to delete (finished 2, unanswered 2, confirmed long past 1)', /to delete: 5 \(finished 2, unanswered 2, confirmed meetings long past 1\)/.test(list), list);
check('preview: 2 to review, not deleted', /to review \(not deleted\): 2/.test(list), list);
check('preview samples mask the email', /m\*\*\*@example\.com/.test(list) && !/maria[a-z0-9]*@example/.test(list), list);
check('preview deleted nothing', (await pg.evaluate(() => Object.keys(window.__store).filter(k => k.startsWith('meetingRequests/')).length)) === 12);
check('Delete button enabled', !(await pg.evaluate(() => document.getElementById('rtDel').disabled)));
// the owner changes a status between Check and Delete: that record must be kept
await pg.evaluate(() => { window.__store['meetingRequests/u400'].status = 'confirmed'; window.__store['meetingRequests/u400'].date = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10); });
// ---- delete (warning dialog, skippable)
await pg.click('#rtDel'); await pg.waitForTimeout(300);
const dlg = await pg.evaluate(() => (document.querySelector('dialog[open]') || {}).textContent || '');
check('warning shows the backup state and offers "Delete anyway"', /no backup yet/.test(dlg) && /Delete anyway/.test(dlg), dlg.slice(0, 300));
const cancelBtn = await pg.$('dialog[open] button:not(.danger):not(.primary)'); 
await pg.evaluate(() => { const d = document.querySelector('dialog[open]'); const bs = [...d.querySelectorAll('button')]; (bs.find(x => /cancel|no|keep/i.test(x.textContent)) || bs[0]).click(); }); await pg.waitForTimeout(300);
check('cancel: nothing deleted', (await pg.evaluate(() => Object.keys(window.__store).filter(k => k.startsWith('meetingRequests/')).length)) === 12);
await pg.click('#rtDel'); await pg.waitForTimeout(300);
await pg.evaluate(() => { const d = document.querySelector('dialog[open]'); [...d.querySelectorAll('button')].find(x => /Delete anyway/.test(x.textContent)).click(); }); await pg.waitForTimeout(1500);
const left = await pg.evaluate(() => Object.keys(window.__store).filter(k => k.startsWith('meetingRequests/')).map(k => k.split('/')[1]).sort());
check('deleted exactly the due ones', ['f800', 'c900', 'p400', 'k800p'].every(id => !left.includes(id)), left.join(','));
check('kept: recent, flagged, protected, unknown, no-date, and the one whose status changed', ['f100', 'u100', 'u30', 'k2000f', 'k100p', 'weird', 'nodate', 'u400'].every(id => left.includes(id)) && left.length === 8, left.join(','));
const st = await pg.textContent('#rtState'); check('result message counts deletions and the kept-because-changed one', /4 records deleted, 1 kept because they changed/.test(st), st);
check('last cleanup recorded', await pg.evaluate(() => !!(window.__store['ownerPrivate/config'] || {}).lastPurgeAt));
// ---- paging: 950 old finished records are all found and deleted, none twice
await pg.evaluate(() => { for (let i = 0; i < 950; i++) window.__store['meetingRequests/bulk' + i] = { status: 'completed', email: 'b' + i + '@e.co', createdAt: Date.now() - (800 + i % 50) * 864e5 }; });
await pg.click('#rtCheck'); await pg.waitForTimeout(2500);
check('paging: 950 found across pages (cursor, no repeats)', /to delete: 950 /.test(await pg.textContent('#rtList')), await pg.textContent('#rtList'));
// ---- privacy text
await pg.evaluate(() => { document.getElementById('privacyLink') && document.getElementById('privacyLink').click(); });
const pv = await pg.evaluate(() => document.body.textContent);
check('public privacy text: finished 2 years, unanswered 1 year, confirmed rule, renamed', /finished discovery call requests up to 2 years/.test(pv) && /never answered up to 1 year/.test(pv) && /30 days after their date/.test(pv));
check('page errors: ' + JSON.stringify(errs), errs.length === 0);
const bad = results.filter(r => !r[1]).length; console.log(bad ? 'SOME FAILED' : 'ALL PASSED');
await b.close(); srv.close();
