import { b, check, errs, fresh, signIn, results, srv } from './w5-harness.mjs';
const { ctx, pg } = await fresh(); await signIn(pg); await pg.waitForTimeout(300);
const B64 = n => 'data:image/png;base64,' + 'A'.repeat(n);
await pg.evaluate(() => {
  window.videosApi.set([{ id: 'v1', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'V1', description: '', category: 'tr3', enabled: true }, { id: 'v2', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcR', title: 'V2', description: '', category: 'tr3', enabled: true }], 'youtube');
  window.faqApi.set([{ id: 'f1', q: 'Q1?', a: 'A', category: 'tr3', enabled: true, kb: false }]);
});
await pg.click('#dashOpen'); await pg.waitForTimeout(300); await pg.click('.dnav [data-page=training]'); await pg.waitForTimeout(500);
const rows = () => pg.$$('#trList .mrow'); const rowTitles = () => pg.$$eval('#trList .mrow .mmain strong', e => e.map(x => x.textContent));
const pub = () => pg.evaluate(() => window.__store['content/training']);
const live = async () => { await pg.evaluate(() => window.trainingApi.set(window.__store['content/training'].items)); await pg.waitForTimeout(200); };
const en = d => d.items.filter(x => x.enabled !== false).length;
const cards = () => pg.$$eval('#tcatGrid .tcat', e => e.length);
const dlgClick = async re => { await pg.waitForTimeout(150); await pg.evaluate(re => { const d = document.querySelector('dialog[open]'); [...d.querySelectorAll('button')].find(x => new RegExp(re, 'i').test(x.textContent)).click(); }, re); await pg.waitForTimeout(250); };
const dlgText = () => pg.evaluate(() => (document.querySelector('dialog[open]') || {}).textContent || '');
// ---- icons and accessible names
const btns = await pg.$$eval('#trList .mrow:first-child .mctl button', bs => bs.map(x => ({ n: x.getAttribute('aria-label'), t: x.title, use: (x.querySelector('use') || {}).getAttribute && x.querySelector('use').getAttribute('href'), txt: x.textContent.trim(), w: Math.round(x.getBoundingClientRect().width), h: Math.round(x.getBoundingClientRect().height), hid: x.querySelector('svg') && x.querySelector('svg').getAttribute('aria-hidden') })));
check('row has up, down, copy, edit, delete icon buttons', ['#ic-up', '#ic-down', '#ic-copy', '#ic-pencil', '#ic-trash'].every(u => btns.some(x => x.use === u)), JSON.stringify(btns));
check('icon-only: no visible text, tooltip set, svg hidden from screen readers', btns.every(x => x.txt === '' && x.t && x.hid === 'true'), JSON.stringify(btns));
check('accessible names name the item ("Delete: Amazon…")', btns.every(x => /: /.test(x.n)) && btns.some(x => /^Delete: Amazon/.test(x.n)), JSON.stringify(btns.map(x => x.n)));
check('touch targets are at least 36px', btns.every(x => x.w >= 36 && x.h >= 36), JSON.stringify(btns.map(x => [x.w, x.h])));
const unnamed = await pg.$$eval('#dp-training button, #dp-training input', bs => bs.filter(x => !x.hidden && x.offsetParent && !(x.getAttribute('aria-label') || x.textContent.trim() || (x.labels && x.labels.length))).length);
check('every control on the page has an accessible name', unnamed === 0, unnamed);
check('7 of 7: Add and Copy disabled, "Delete one" hint, Restore disabled', await pg.evaluate(() => { const bs = [...document.querySelectorAll('#trBar button')]; return bs.every(x => x.disabled) && /7 of 7 categories\. Delete one/.test(document.getElementById('trBar').textContent) && [...document.querySelectorAll('#trList .mrow:first-child .ibtn')].find(x => /Copy/.test(x.getAttribute('aria-label'))).disabled; }));
const meter = await pg.textContent('#trMeter'); check('size meter shown', /Training content size: \d+ KB of 900 KB/.test(meter), meter);
// ---- delete (keyboard: focus + Enter)
await pg.focus('#trList .mrow:nth-child(3) button[aria-label^="Delete"]'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(250);
let t = await dlgText(); check('delete confirm names the content and the linked videos/FAQs that stay', /tools?,/.test(t) && /2 videos and 1 FAQ are linked/.test(t) && /not deleted/.test(t), t.slice(0, 400));
await dlgClick('^\\s*(cancel|no|keep)'); check('cancel: still 7 categories', (await rows()).length === 7);
await pg.click('#trList .mrow:nth-child(3) button[aria-label^="Delete"]'); await dlgClick('^\\s*delete');
check('delete: 6 categories, the right one gone, not published yet', (await rows()).length === 6 && !(await rowTitles()).some(x => /tr3/.test(x)) && !(await pub()));
const gone = await pg.evaluate(() => window.trainingApi.get().length); check('draft only: live data still has 7 until Publish', gone === 7, gone);
await pg.click('#trDiscard'); await pg.waitForTimeout(200); check('Discard brings the deleted category back', (await rows()).length === 7);
await pg.click('#trList .mrow:nth-child(3) button[aria-label^="Delete"]'); await dlgClick('^\\s*delete');
await pg.click('#trPublish'); await pg.waitForTimeout(500);
let d = await pub(); check('published: 6 items, original ids kept, tr3 gone', d && d.items.length === 6 && !d.items.some(x => x.id === 'tr3') && d.items.some(x => x.id === 'tr1') && d.items.some(x => x.id === 'tr7'), JSON.stringify(d && d.items.map(x => x.id)));
await live(); check('public grid shows exactly the enabled categories (tr3 gone)', (await cards()) === en(d) && en(d) > 0 && !(await pg.$('#tb-tr3')), await cards() + ' vs ' + en(d));
const vf = await pg.evaluate(() => [window.videosApi.get().items.length, window.faqApi.get().length, window.videosApi.get().items.every(v => v.category === 'tr3')]);
check('videos and FAQs of the deleted category are untouched', vf[0] === 2 && vf[1] === 1 && vf[2]);
// ---- add
check('Add is enabled again, count 6 of 7', await pg.evaluate(() => !document.querySelector('#trBar button').disabled) && /6 of 7/.test(await pg.textContent('#trBar')));
await pg.click('#trBar button:first-child'); await pg.waitForTimeout(300);
check('Add opens the editor on a "New category"', await pg.evaluate(() => !document.getElementById('trEdit').hidden && document.getElementById('tre-title').value === 'New category'));
await pg.fill('#tre-title', 'My new area'); await pg.fill('#tre-ov', 'Overview text'); await pg.click('#trEdit button:first-child'); await pg.waitForTimeout(250);
check('back to the list: 7 categories, new one hidden from the site', (await rows()).length === 7 && /Hidden from the site/.test(await pg.textContent('#trList .mrow:last-child')) && (await rowTitles()).includes('My new area'));
check('Add disabled again at 7', await pg.evaluate(() => document.querySelector('#trBar button').disabled));
await pg.click('#trPublish'); await pg.waitForTimeout(500); d = await pub();
check('published hidden; ids unique; id short', d.items.length === 7 && new Set(d.items.map(x => x.id)).size === 7 && d.items[6].enabled === false && d.items[6].id.length <= 20, JSON.stringify(d.items.map(x => [x.id, x.enabled])));
const before = en(d); await live(); check('public grid unchanged (hidden one not shown)', (await cards()) === before, await cards() + ' vs ' + before);
await pg.check('#trList .mrow:last-child input[type=checkbox]'); await pg.click('#trPublish'); await pg.waitForTimeout(500); d = await pub(); await live();
check('switched on and published: public grid grows by one', (await cards()) === before + 1 && (await pg.$$eval('#tcatGrid .tcat-h', e => e.some(x => /My new area/.test(x.textContent)))), await cards());
// ---- copy at 7 disabled; delete one then copy
await pg.click('#trList .mrow:last-child button[aria-label^="Delete"]'); await dlgClick('^\\s*delete');
await pg.click('#trList .mrow:nth-child(1) button[aria-label^="Copy"]'); await pg.waitForTimeout(300);
const tt = await rowTitles(); const row2 = await pg.textContent('#trList .mrow:nth-child(2)');
check('copy sits right after the original, "Copy of", hidden', /^Copy of /.test(tt[1]) && tt[1].endsWith(tt[0]) && /Hidden from the site/.test(row2) && tt.length === 7, tt.join(' | '));
await pg.click('#trPublish'); await pg.waitForTimeout(500); d = await pub();
check('copy saved with a new id and new tool ids', new Set(d.items.map(x => x.id)).size === 7 && d.items[1].tools.length === d.items[0].tools.length && d.items[1].tools.every((x, i) => x.id !== d.items[0].tools[i].id) && d.items[0].enabled !== false, '');
// ---- copy without images when a full copy would be too large (6 images of ~139 KB = ~835 KB used)
await pg.evaluate(([a]) => { const l = window.trainingApi.get(); const im = () => ({ src: a, alt: 'x' }); l[0].handsOn.image = im(); l[0].tools = [['bt1', 2], ['bt2', 2], ['bt3', 1]].map(([id, n]) => ({ id, name: id.toUpperCase(), images: Array.from({ length: n }, im) })); window.trainingApi.set(l); }, [B64(139000)]);
await pg.evaluate(() => document.dispatchEvent(new CustomEvent('dash:page', { detail: 'training' }))); await pg.waitForTimeout(400);
const warn = await pg.evaluate(() => ({ c: document.getElementById('trMeter').className, t: document.getElementById('trMeter').textContent })); check('meter warns when almost full', /warn/.test(warn.c) && /Almost full/.test(warn.t), JSON.stringify(warn));
await pg.click('#trList .mrow:last-child button[aria-label^="Delete"]'); await dlgClick('^\\s*delete');   // make room: 7 -> 6
await pg.click('#trList .mrow:nth-child(1) button[aria-label^="Copy"]'); await pg.waitForTimeout(300);
t = await dlgText(); check('big copy: offered "Copy without images"', /Copy without images/.test(t) && /too large/.test(t), t.slice(0, 200));
await dlgClick('^\\s*cancel|^\\s*no'); check('declining makes no copy', (await rows()).length === 6);
await pg.click('#trList .mrow:nth-child(1) button[aria-label^="Copy"]'); await dlgClick('^\\s*copy without images');
check('copy added', (await rows()).length === 7);
await pg.click('#trPublish'); await pg.waitForTimeout(500); d = await pub();
const imgs = x => (x.handsOn.image ? 1 : 0) + x.tools.reduce((n, y) => n + y.images.length, 0);
check('copy has no images but keeps its text and tools; original keeps all 6 images', imgs(d.items[1]) === 0 && d.items[1].tools.length === 3 && /^Copy of /.test(d.items[1].title) && imgs(d.items[0]) === 6, JSON.stringify([imgs(d.items[0]), imgs(d.items[1]), d.items[1].tools.length]));
check('published document stays under the limit', JSON.stringify(d.items).length <= 900000, JSON.stringify(d.items).length);
// ---- tools icons in the editor
await pg.click('#trList .mrow:nth-child(1) button[aria-label^="Edit"]'); await pg.waitForTimeout(300);
const tb = await pg.$$eval('#trEdit .mrow .mctl button', bs => bs.map(x => x.getAttribute('aria-label') + '|' + (x.querySelector('use') || { getAttribute: () => '' }).getAttribute('href')));
check('editor tools have pencil, trash, up, down icons with names', tb.some(x => /^Edit: BT1\|#ic-pencil/.test(x)) && tb.some(x => /^Delete: BT1\|#ic-trash/.test(x)) && tb.some(x => /^Move down: BT1\|#ic-down/.test(x)), tb.join(' ; '));
check('Add tool and Back have icons and visible text', await pg.evaluate(() => [...document.querySelectorAll('#trEdit .ibtn')].filter(x => x.textContent.trim()).map(x => x.textContent.trim()).join('|')) === 'Back to all categories|Add tool');
await pg.click('#trEdit button:first-child'); await pg.waitForTimeout(200);
// ---- zero categories
await pg.evaluate(() => document.dispatchEvent(new CustomEvent('dash:page', { detail: 'training' }))); await pg.waitForTimeout(300);
for (let i = 0; i < 12 && (await rows()).length; i++) { await pg.click('#trList .mrow:first-child button[aria-label^="Delete"]'); await dlgClick('^\\s*delete'); }
check('all deleted: friendly message, Add enabled, Restore enabled', (await rows()).length === 0 && /Training section is hidden/.test(await pg.textContent('#trList')) && await pg.evaluate(() => [...document.querySelectorAll('#trBar button')].every(x => !x.disabled)));
await pg.click('#trPublish'); await pg.waitForTimeout(500); d = await pub(); await live();
check('published empty list', d && Array.isArray(d.items) && d.items.length === 0);
const hid = await pg.evaluate(() => ({ sec: document.getElementById('training').hidden, link: [...document.querySelectorAll('a[href="#training"]')].every(a => (a.closest('li') || a).hidden) }));
check('public: Training section and its menu link are hidden', hid.sec && hid.link, JSON.stringify(hid));
await pg.click('#trBar button:nth-child(2)'); await pg.waitForTimeout(300);
check('Restore brings back all 7 originals', (await rows()).length === 7 && (await pg.evaluate(() => window.trainingApi.get().length)) === 0);
await pg.click('#trPublish'); await pg.waitForTimeout(500); d = await pub(); await live();
const back = await pg.evaluate(() => ({ sec: document.getElementById('training').hidden, link: [...document.querySelectorAll('a[href="#training"]')].some(a => !(a.closest('li') || a).hidden), n: document.querySelectorAll('#tcatGrid .tcat').length }));
check('published: section and link visible again with the enabled originals', !back.sec && back.link && back.n === en(d) && d.items.length === 7, JSON.stringify(back));
check('page errors: ' + JSON.stringify(errs), errs.length === 0);
const bad = results.filter(r => !r[1]).length; console.log(bad ? 'SOME FAILED' : 'ALL PASSED');
await b.close(); srv.close();
