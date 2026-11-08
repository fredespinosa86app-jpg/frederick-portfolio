import fs from 'node:fs';
import { b, check, errs, fresh, signIn, results, srv } from './w5-harness.mjs';
const DAY = 864e5;
const { ctx, pg } = await fresh(); await signIn(pg); await pg.waitForTimeout(300);
const auth = () => pg.evaluate(() => document.dispatchEvent(new CustomEvent('own:auth', { detail: { ok: true, email: 't@x.com' } }))).then(() => pg.waitForTimeout(500));
const banner = () => pg.evaluate(() => ({ hid: document.getElementById('bkBanner').hidden, t: document.getElementById('bkBannerTxt').textContent }));
const setLast = d => pg.evaluate(d => { const c = window.__store['ownerPrivate/config'] || (window.__store['ownerPrivate/config'] = {}); if (d === null) delete c.lastBackupAt; else c.lastBackupAt = Date.now() - d * 864e5; }, d);
await pg.click('#dashOpen'); await pg.waitForTimeout(300);

// no backup yet
await setLast(null); await auth();
let bn = await banner();
check('no backup yet: reminder card shows on the dashboard', !bn.hid && /No backup has been downloaded/.test(bn.t), JSON.stringify(bn));
check('the menu item shows the "!" flag', await pg.evaluate(() => !!document.querySelector('.dnav [data-page="privacy"] .dwarn')));
// 6 days: fine; 7 days: due
await setLast(6); await auth(); bn = await banner();
check('6 days old: no reminder', bn.hid, JSON.stringify(bn));
check('6 days old: no "!" flag', await pg.evaluate(() => !document.querySelector('.dnav [data-page="privacy"] .dwarn')));
await setLast(7); await auth(); bn = await banner();
check('7 days old: reminder shows with the age', !bn.hid && /7 days old/.test(bn.t), JSON.stringify(bn));
await setLast(40); await auth(); bn = await banner();
check('40 days old: reminder shows', !bn.hid && /40 days old/.test(bn.t), JSON.stringify(bn));
// Later hides it for this visit
await pg.click('#bkLater'); check('"Later" hides the card', (await banner()).hid);
// next sign-in shows it again (a reminder, not a one-time notice)
await auth(); check('it comes back at the next sign-in while the backup is old', !(await banner()).hid);
// Open Privacy & backup
await pg.click('#bkReview'); await pg.waitForTimeout(400);
check('"Open Privacy & backup" opens the page and hides the card', await pg.evaluate(() => document.getElementById('bkBanner').hidden && !document.getElementById('dp-privacy').hidden));
const last = await pg.evaluate(() => ({ t: document.getElementById('bkLast').textContent, c: document.getElementById('bkLast').className }));
check('Privacy page line warns after 7 days (not 30)', /7 days old or more/.test(last.t) && /warn/.test(last.c), JSON.stringify(last));
await setLast(5); await pg.evaluate(() => document.dispatchEvent(new CustomEvent('dash:page', { detail: { page: 'privacy' } }))); await pg.waitForTimeout(500);
const last5 = await pg.evaluate(() => ({ t: document.getElementById('bkLast').textContent, c: document.getElementById('bkLast').className }));
check('5 days old: green line, no warning text', /5 days ago/.test(last5.t) && /ok/.test(last5.c) && !/download a new one/.test(last5.t), JSON.stringify(last5));

// plain-words limits text + new tick box
const limits = await pg.evaluate(() => (document.getElementById('bkLimits') || {}).textContent || '');
check('plain-words text says what can and cannot be brought back and the 7-day habit', /Only site settings, site content, private settings and clients/.test(limits) && /cannot be loaded back/.test(limits) && /every 7 days/.test(limits), limits.slice(0, 120));
check('tick box for WorkTrack break schedules exists and is not ticked by default', await pg.evaluate(() => { const e = document.getElementById('bk_workSchedules'); return !!e && !e.checked; }));

// a real download includes the break schedules and resets the reminder
await pg.evaluate(() => { window.__store['workSchedules/default'] = { fb: 15, lu: 60, lb: 15, pfb: 15, plu: 60, plb: 15, rev: 1, updatedAt: Date.now() }; });
await setLast(40); await auth();
await pg.evaluate(() => document.querySelector('.dnav [data-page="privacy"]').click()); await pg.waitForTimeout(300);
await pg.evaluate(() => { document.getElementById('bk_workSchedules').checked = true; });
const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#bkGo')]);
const file = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
check('the backup file contains the break schedules', file.counts && file.counts.workSchedules === 1 && file.data.workSchedules.default.fb === 15, JSON.stringify(file.counts));
await pg.waitForTimeout(500);
check('after the download the last-backup time is today', await pg.evaluate(() => Date.now() - window.__store['ownerPrivate/config'].lastBackupAt < 10000));
check('after the download the reminder card is hidden and the "!" is gone', await pg.evaluate(() => document.getElementById('bkBanner').hidden && !document.querySelector('.dnav [data-page="privacy"] .dwarn')));
const state = await pg.textContent('#bkpState'); check('result message names the break schedules', /WorkTrack break schedules: 1/.test(state), state);

check('no page errors', errs.length === 0, errs.join(' | '));
const bad = results.filter(r => !r[1]).length; console.log(bad ? 'SOME FAILED' : 'ALL PASSED');
await b.close(); srv.close();
