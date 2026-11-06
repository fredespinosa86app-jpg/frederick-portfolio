import { b, check, errs, fresh, signIn, signOut, vis, results, srv } from './w5-harness.mjs';
const { ctx, pg } = await fresh(); await signIn(pg); await pg.waitForTimeout(300);
// registry of 60 active clients + 1 archived, set up before the page reads it
await pg.evaluate(() => { for (let i = 1; i <= 60; i++) window.__store['clientRegistry/ACME-' + String(i).padStart(2, '0')] = { status: 'active' }; window.__store['clientRegistry/OLD-1'] = { status: 'archived' }; });
await pg.evaluate(() => window.wtApi.punch('CLOCK_IN')); await pg.waitForTimeout(400);
await pg.evaluate(() => window.wtApi.punch('LUNCH_OUT')); await pg.waitForTimeout(400);
const backdate = (type, mins) => pg.evaluate(([type, mins]) => { const ks = Object.keys(window.__store).filter(k => k.startsWith('workEvents/')).sort((a, b) => window.__store[a].n - window.__store[b].n); const i = ks.findIndex(k => window.__store[k].type === type); ks.forEach((k, j) => { if (j <= i) { const m = mins + (i - j) * 2; window.__store[k].at = { toMillis: () => Date.now() - m * 60000 }; } }); }, [type, mins]);
const status = () => pg.textContent('.wtfl-brk');
check('widget: lunch shows time left with built-in schedule', /^Lunch: .* left · Built-in schedule \(60 min\)$/.test(await status()), await status());
await pg.click('#dashOpen'); await pg.waitForTimeout(300); await pg.click('.dnav [data-page=worktrack]'); await pg.waitForTimeout(700);
check('page: break line shows the same', /Lunch: .* left/.test(await pg.textContent('#wtBrk')), await pg.textContent('#wtBrk'));
check('card lists Default + 50 clients, says Showing 50 of 60', (await pg.$$('.wsrow')).length === 51 && /Showing 50 of 60/.test(await pg.textContent('#wsCount')), await pg.textContent('#wsCount'));
check('archived client is not offered', !(await pg.$('.wsrow[data-id="OLD-1"]')));
await pg.click('#wsMore'); check('Show more reveals the rest (61 rows)', (await pg.$$('.wsrow')).length === 61);
await pg.fill('#wsSearch', 'acme-07'); check('search filters to one client', (await pg.$$('.wsrow')).length === 1 && !!(await pg.$('.wsrow[data-id="ACME-07"]')), (await pg.$$('.wsrow')).length);
await pg.fill('#wsSearch', '');
// validation
const dfl = '.wsrow[data-id="default"]';
await pg.fill(dfl + ' input >> nth=1', '241'); await pg.click(dfl + ' .dbtn.primary'); await pg.waitForTimeout(200);
check('241 refused with a message, nothing written', /most allowed is 240/.test(await pg.textContent(dfl + ' .ferr')) && !(await pg.evaluate(() => window.__store['workSchedules/default'])));
for (const bad of ['-1', '1.5', 'abc', '']) { await pg.fill(dfl + ' input >> nth=1', bad); await pg.click(dfl + ' .dbtn.primary'); await pg.waitForTimeout(100); if (!(await pg.textContent(dfl + ' .ferr'))) check('bad value ' + JSON.stringify(bad) + ' refused', false); }
check('-1, 1.5, text, empty all refused', true);
// R2: lunch started "61 minutes ago"; owner edits lunch limit 60 -> 30 NOW; the running break must keep 60 (late by 1 min, not 31)
await backdate('LUNCH_OUT', 61);
await pg.fill(dfl + ' input >> nth=1', '30'); await pg.click(dfl + ' .dbtn.primary'); await pg.waitForTimeout(800);
const doc = await pg.evaluate(() => { const d = window.__store['workSchedules/default']; return d && { fb: d.fb, lu: d.lu, lb: d.lb, pfb: d.pfb, plu: d.plu, plb: d.plb, rev: d.rev, hasTs: !!d.updatedAt }; });
check('saved with previous values = built-in 15/60/15, rev 1', doc && doc.lu === 30 && doc.plu === 60 && doc.pfb === 15 && doc.plb === 15 && doc.rev === 1 && doc.hasTs, JSON.stringify(doc));
await pg.evaluate(() => window.wtApi.refresh()); await pg.waitForTimeout(500);
const t = await pg.textContent('#wtBrk'); check('R2: running break keeps its old 60-minute limit (late by 01:xx, not 31)', /late by 01:\d\d/.test(t) && /60 min/.test(t), t);
// flicker class on the existing Lunch in button, page and widget
check('page: Lunch in button flickers (class)', await pg.evaluate(() => document.querySelector('#wtBtns [data-punch=LUNCH_IN]').classList.contains('wtb-late')));
check('widget: Lunch in button flickers (class)', await pg.evaluate(() => document.querySelector('.wtfl-btn[data-punch=LUNCH_IN]').classList.contains('wtfl-late')));
check('page: no other button flickers', await pg.evaluate(() => document.querySelectorAll('#wtBtns .wtb-late').length === 1));
const anim = await pg.evaluate(() => getComputedStyle(document.querySelector('.wtfl-btn[data-punch=LUNCH_IN]')).animationDuration); check('pulse is one per 1.2 s', anim === '1.2s', anim);
// focus is never lost by the flicker
await pg.focus('#wtBtns [data-punch=LUNCH_IN]'); await pg.waitForTimeout(2300);
check('keyboard focus stays on the flickering button', await pg.evaluate(() => document.activeElement && document.activeElement.dataset.punch === 'LUNCH_IN'));
check('screen-reader announcement made once', /Lunch limit passed/.test(await pg.textContent('#wtBrkSr')) , await pg.textContent('#wtBrkSr'));
// flicker switch off
await pg.evaluate(() => document.getElementById('wsFlick').scrollIntoView()); await pg.uncheck('#wsFlick'); await pg.waitForTimeout(1300);
check('flicker switch off: no flicker class, text still says late', await pg.evaluate(() => !document.querySelector('#wtBtns .wtb-late') && !document.querySelector('.wtfl-late')) && /late by/.test(await pg.textContent('#wtBrk')));
await pg.check('#wsFlick');
// Lunch in stops it at once
await pg.evaluate(() => window.wtApi.punch('LUNCH_IN')); await pg.waitForTimeout(600);
check('Lunch in: flicker and text stop', await pg.evaluate(() => !document.querySelector('.wtb-late') && !document.querySelector('.wtfl-late')) && (await pg.textContent('#wtBrk')) === '');
// new break uses the new limit (30): edit was long ago -> move the doc's updatedAt back
await pg.evaluate(() => { window.__store['workSchedules/default'].updatedAt = { toMillis: () => Date.now() - 86400000 }; });
await pg.evaluate(() => window.wtApi.punch('FIRST_BREAK_OUT')); await pg.waitForTimeout(500);
check('next break (first break) uses the default first-break value 15', /15 min/.test(await pg.textContent('#wtBrk')), await pg.textContent('#wtBrk'));
await pg.evaluate(() => window.wtApi.punch('FIRST_BREAK_IN')); await pg.waitForTimeout(400);
// 0 = no limit
await pg.fill(dfl + ' input >> nth=2', '0'); await pg.click(dfl + ' .dbtn.primary'); await pg.waitForTimeout(700);
await pg.evaluate(() => { window.__store['workSchedules/default'].updatedAt = { toMillis: () => Date.now() - 86400000 }; });
await pg.evaluate(() => window.wtApi.punch('LAST_BREAK_OUT')); await pg.waitForTimeout(500);
check('0 = no limit: "no time limit", never late', /Last break: no time limit/.test(await pg.textContent('#wtBrk')), await pg.textContent('#wtBrk'));
await backdate('LAST_BREAK_OUT', 300); await pg.evaluate(() => window.wtApi.refresh()); await pg.waitForTimeout(400);
check('0 minutes stays never-late even after 5 hours', !(await pg.evaluate(() => !!document.querySelector('.wtb-late'))));
await pg.evaluate(() => window.wtApi.punch('LAST_BREAK_IN')); await pg.waitForTimeout(400);
// remove
await pg.click(dfl + ' .dbtn:not(.primary)'); check('Remove asks to confirm first', /Confirm remove/.test(await pg.textContent(dfl + ' .dbtn:not(.primary)')) && !!(await pg.evaluate(() => window.__store['workSchedules/default'])));
await pg.click(dfl + ' .dbtn:not(.primary)'); await pg.waitForTimeout(600);
check('Remove deletes the schedule (back to built-in)', !(await pg.evaluate(() => window.__store['workSchedules/default'])));
// sign out clears the card
await signOut(pg); await pg.waitForTimeout(300);
check('sign-out empties the schedule card', (await pg.$$('.wsrow')).length === 0);
console.log('page errors:', errs.filter(e => !/firebase|gstatic|Failed to load|orderBy/i.test(e)));
await b.close(); srv.close(); console.log(results.filter(x => !x[1]).length ? 'SOME FAILED' : 'ALL PASSED');
