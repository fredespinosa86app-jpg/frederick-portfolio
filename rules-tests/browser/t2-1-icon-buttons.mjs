// T2: row actions on the other dashboard pages are icon buttons. Per page: icon-only, names, tooltips, disabled ends, move / edit / delete / archive behavior, keyboard, touch size.
import { b, check, errs, fresh, signIn, results, srv } from './w5-harness.mjs';
const { ctx, pg } = await fresh(); await signIn(pg); await pg.waitForTimeout(300);
await pg.evaluate(() => {
  const ts = ms => ({ toDate: () => new Date(ms), toMillis: () => ms }), mk = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  window.contentApi.setServices(mk(3, i => ({ id: 's' + i, title: ['Alpha service', 'Beta service', 'Gamma service'][i], description: 'Description ' + i, enabled: true })));
  window.contentApi.setToolkit([{ id: 'c1', name: 'Cat One', tools: [{ id: 't1', name: 'Tool One', description: 'd' }, { id: 't2', name: 'Tool Two', description: 'd' }] }, { id: 'c2', name: 'Cat Two', tools: [] }]);
  window.testiApi.setDoc({ enabled: true, view: 'grid', items: mk(3, i => ({ id: 'm' + i, name: ['Ann', 'Bob', 'Cy'][i], role: 'Client', quote: 'Great work ' + i, rating: 5, enabled: true })) });
  window.faqApi.set(mk(3, i => ({ id: 'f' + i, q: ['First question?', 'Second question?', 'Third question?'][i], a: 'Answer', category: '', enabled: true, kb: false })));
  window.videosApi.set(mk(3, i => ({ id: 'v' + i, url: 'https://www.youtube.com/watch?v=dQw4w9WgXc' + 'ABC'[i], title: ['Video A', 'Video B', 'Video C'][i], description: '', category: '', enabled: true })), 'grid');
  window.experienceApi.set({ enabled: true, items: mk(3, i => ({ id: 'x' + i, title: 'Role ' + i, company: ['Acme', 'Beta Co', 'Gamma Ltd'][i], type: 'Other', start: '2020-01', end: '2021-01', current: false, description: 'd', responsibilities: '- a', enabled: true })) });
  window.chatEngine.setKb({ items: mk(3, i => ({ id: 'k' + i, q: ['Kb one?', 'Kb two?', 'Kb three?'][i], a: 'Answer', alts: [], category: '' })) });
  window.__store['clientRegistry/CL-0001'] = { status: 'active', notes: 'n1', createdAt: ts(1700000000000), updatedAt: ts(1700000000000), rev: 1, lastAudit: 'a' };
  window.__store['clientRegistry/CL-0002'] = { status: 'archived', notes: '', createdAt: ts(1700000100000), updatedAt: ts(1700000100000), rev: 2, lastAudit: 'b' };
  window.__store['ownerDocs/d1'] = { title: 'Contract A', category: 'contract', body: 'text', updatedAt: ts(1700000000000), createdAt: ts(1700000000000) };
  window.__store['ownerDocs/d2'] = { title: 'Contract B', category: 'other', body: 'text', updatedAt: ts(1700000100000), createdAt: ts(1700000100000) };
});
await pg.click('#dashOpen'); await pg.waitForTimeout(300);
const open = async page => { await pg.evaluate(p => document.querySelector('.dnav [data-page=' + p + ']').click(), page); await pg.waitForTimeout(600); };
const info = (list, row) => pg.$$eval(list + ' ' + row, rows => rows.map(r => ({
  title: (r.querySelector('.mmain strong, .cidid, .cidmain strong') || {}).textContent || '',
  btns: [...r.querySelectorAll('.mctl button, .dact-row button')].map(x => ({ a: x.getAttribute('aria-label') || '', t: x.getAttribute('title') || '', text: x.textContent.trim(), icon: (x.querySelector('use') ? x.querySelector('use').getAttribute('href') : ''), io: x.classList.contains('icon-only'), ibtn: x.classList.contains('ibtn'), dis: x.disabled, w: Math.round(x.getBoundingClientRect().width), h: Math.round(x.getBoundingClientRect().height), danger: x.classList.contains('danger') }))
})));
const titles = (list, row) => pg.$$eval(list + ' ' + row + ' :is(.mmain strong, .cidid)', e => e.map(x => x.textContent));
const dlgText = () => pg.evaluate(() => { const d = document.querySelector('dialog[open]'); return d ? d.textContent.replace(/\s+/g, ' ') : ''; });
const dlgClick = async re => { await pg.waitForTimeout(150); await pg.evaluate(re => { const d = document.querySelector('dialog[open]'); [...d.querySelectorAll('button')].find(x => new RegExp(re, 'i').test(x.textContent)).click(); }, re); await pg.waitForTimeout(250); };
const ACTION = /^(Move up|Move down|Edit|Rename|Delete|Copy|Edit note|History|Archive|Restore|Open|Edit billing profile|History of billing profile)(?: [a-z]+)?: /;

// ---- 1. every list page: all row actions are icon-only buttons with a name, tooltip and symbol
const PAGES = [
  ['services', '#svcList', '.mrow', 'Alpha service', ['Move up', 'Move down', 'Edit', 'Delete']],
  ['testimonials', '#tmList', '.mrow', 'Ann', ['Move up', 'Move down', 'Edit', 'Delete']],
  ['faq', '#fqList', '.mrow', 'First question?', ['Move up', 'Move down', 'Edit', 'Delete']],
  ['videos', '#vdList', '.mrow', 'Video A', ['Move up', 'Move down', 'Edit', 'Delete']],
  ['experience', '#exList', '.mrow', 'Beta Co', ['Move up', 'Move down', 'Edit', 'Delete']],
  ['chatkb', '#kbList', '.mrow', 'Kb one?', ['Move up', 'Move down', 'Edit', 'Delete']]];
for (const [page, list, row, first, acts] of PAGES) {
  await open(page); const R = await info(list, row); const all = R.flatMap(r => r.btns);
  check(page + ': rows are shown', R.length === 3 && R.some(r => r.title.includes(first.split(' ')[0]) || r.title === first), JSON.stringify(R.map(r => r.title)));
  const acts0 = R[0] ? R[0].btns.filter(x => ACTION.test(x.a)).map(x => x.a.split(':')[0]) : [];
  check(page + ': the four actions (move up, move down, edit, delete) are there', JSON.stringify(acts0) === JSON.stringify(acts), JSON.stringify(acts0));
  const act = all.filter(x => ACTION.test(x.a));
  check(page + ': every action is an icon-only button with a symbol, a tooltip and the name "Action: Name"', act.length >= 12 && act.every(x => x.io && x.ibtn && x.text === '' && /^#ic-/.test(x.icon) && x.t && x.a.startsWith(x.t + ': ')), JSON.stringify(act.slice(0, 4)));
  check(page + ': delete is the danger button with the trash icon, edit has the pencil', act.filter(x => x.a.startsWith('Delete')).every(x => x.danger && x.icon === '#ic-trash') && act.filter(x => /^Edit|^Rename/.test(x.a)).every(x => x.icon === '#ic-pencil'));
  check(page + ': first row cannot move up, last row cannot move down', R[0].btns.find(x => x.a.startsWith('Move up')).dis && R[2].btns.find(x => x.a.startsWith('Move down')).dis && !R[1].btns.find(x => x.a.startsWith('Move up')).dis && !R[1].btns.find(x => x.a.startsWith('Move down')).dis);
  const before = await titles(list, row);
  await pg.click(list + ' ' + row + ':nth-child(1) button[aria-label^="Move down"]'); await pg.waitForTimeout(250);
  const after = await titles(list, row);
  check(page + ': Move down swaps the first two rows', after[0] === before[1] && after[1] === before[0] && after[2] === before[2], JSON.stringify([before, after]));
  await pg.click(list + ' ' + row + ':nth-child(2) button[aria-label^="Move up"]'); await pg.waitForTimeout(250);
  check(page + ': Move up puts it back', JSON.stringify(await titles(list, row)) === JSON.stringify(before));
  await pg.click(list + ' ' + row + ':nth-child(1) button[aria-label^="Edit"]'); await pg.waitForTimeout(300);
  check(page + ': Edit opens its dialog', /edit|save|cancel/i.test(await dlgText()) && !!(await pg.$('dialog[open]')), (await dlgText()).slice(0, 80));
  await dlgClick('^\\s*cancel'); await pg.waitForTimeout(150);
  await pg.focus(list + ' ' + row + ':nth-child(3) button[aria-label^="Delete"]'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(250);
  check(page + ': Delete (keyboard) asks first and names the item in quotes', /delete/i.test(await dlgText()) && /“[^”]+”/.test(await dlgText()), (await dlgText()).slice(0, 120));
  await dlgClick('^\\s*(cancel|no|keep)'); check(page + ': cancel keeps all 3', (await titles(list, row)).length === 3);
  await pg.click(list + ' ' + row + ':nth-child(3) button[aria-label^="Delete"]'); await dlgClick('^\\s*delete'); check(page + ': confirming removes it (draft)', (await titles(list, row)).length === 2 && !(await titles(list, row)).includes(before[2]) && !!(await pg.evaluate(() => [...document.querySelectorAll('.dact-row button, .dbar button, [id$=Publish]')].some(x => /publish/i.test(x.textContent) && !x.disabled))));
}

// ---- 2. toolkit: two sets (categories and tools)
await open('toolkit'); let all = (await pg.$$eval('#tkList button', bs => bs.map(x => ({ a: x.getAttribute('aria-label') || '', io: x.classList.contains('icon-only'), icon: x.querySelector('use') ? x.querySelector('use').getAttribute('href') : '' })))).filter(x => ACTION.test(x.a) || /^Delete (category|tool)/.test(x.a));
check('toolkit: categories and tools both have icon-only actions (rename, delete / edit, delete)', all.length >= 12 && all.every(x => x.io && /^#ic-/.test(x.icon) && x.a.includes(': ')) && all.some(x => x.a.startsWith('Rename: Cat One')) && all.some(x => x.a.startsWith('Edit: Tool One')) && all.some(x => x.a.startsWith('Delete category: Cat One')) && all.some(x => x.a.startsWith('Delete tool: Tool One')), JSON.stringify(all.map(x => x.a)));
await pg.click('#tkList button[aria-label^="Delete category: Cat Two"]'); await pg.waitForTimeout(250); check('toolkit: deleting a category asks first, by name', /Cat Two/.test(await dlgText()), await dlgText()); await dlgClick('^\\s*cancel');

// ---- 3. service forms (options, forms, questions)
await open('svcforms'); const sfAll = await pg.$$eval('#sfSvcList .mctl button, #sfList .mctl button, #sfQList .mctl button', bs => bs.map(x => ({ a: x.getAttribute('aria-label') || '', io: x.classList.contains('icon-only'), text: x.textContent.trim(), icon: (x.querySelector('use') ? x.querySelector('use').getAttribute('href') : '') })));
const sfAct = sfAll.filter(x => /^(Move up|Move down|Edit|Rename|Delete)/.test(x.a));
check('service forms: options and forms (and questions when a form is opened) use icon-only actions', sfAct.length >= 8 && sfAct.every(x => x.io && x.text === '' && /^#ic-/.test(x.icon)), JSON.stringify(sfAll.map(x => x.a)));
check('service forms: there is a Delete for an option and a form', sfAct.some(x => /^Delete/.test(x.a) && x.icon === '#ic-trash') && sfAll.length >= 8);
await pg.click('#sfFormAdd'); await pg.waitForTimeout(500);
for (const lbl of ['Your name', 'Your email', 'Your goal']) { if ((await pg.$$('#sfQList .mrow')).length >= 3) break; await pg.evaluate(() => [...document.querySelectorAll('#sfEdit button')].find(x => /add question/i.test(x.textContent)).click()); await pg.waitForTimeout(250); await pg.evaluate(l => { const d = document.querySelector('dialog[open]'); const i = d.querySelector('input[type=text], input:not([type]), textarea'); i.value = l; i.dispatchEvent(new Event('input', { bubbles: true })); }, lbl); await dlgClick('^\\s*(save|add|ok)'); await pg.waitForTimeout(250); }
const qBtns = await pg.$$eval('#sfQList .mctl button', bs => bs.map(x => ({ a: x.getAttribute('aria-label') || '', io: x.classList.contains('icon-only') })));
check('service forms: the question rows have icon-only Move up, Move down, Edit, Delete', qBtns.length >= 4 && qBtns.every(x => x.io) && qBtns.some(x => x.a.startsWith('Delete')) && qBtns.some(x => x.a.startsWith('Move up')), JSON.stringify(qBtns));

// ---- 4. client IDs: copy, edit note, history, archive / restore
await open('clientids'); await pg.selectOption('#cidShow', 'all'); await pg.waitForTimeout(300); const ci = await info('#cidList', '.cidrow'); const a1 = ci.find(r => r.title === 'CL-0001'), a2 = ci.find(r => r.title === 'CL-0002');
check('client IDs: both rows are listed', ci.length === 2 && a1 && a2, JSON.stringify(ci.map(r => r.title)));
check('client IDs: active row has Copy, Edit note, History, Archive (danger) as icons', a1 && JSON.stringify(a1.btns.map(x => x.a)) === JSON.stringify(['Copy: CL-0001', 'Edit note: CL-0001', 'History: CL-0001', 'Archive: CL-0001']) && a1.btns.every(x => x.io && /^#ic-/.test(x.icon)) && JSON.stringify(a1.btns.map(x => x.icon)) === JSON.stringify(['#ic-copy', '#ic-pencil', '#ic-clock', '#ic-archive']) && a1.btns[3].danger, JSON.stringify(a1 && a1.btns));
check('client IDs: archived row has Restore instead of Archive', a2 && a2.btns.map(x => x.a).includes('Restore: CL-0002') && !a2.btns.some(x => x.a.startsWith('Archive')) && a2.btns.find(x => x.a.startsWith('Restore')).icon === '#ic-restore');
await pg.evaluate(() => { navigator.clipboard.writeText = async t => { window.__copied = t; }; });
await pg.click('#cidList button[aria-label="Copy: CL-0001"]'); await pg.waitForTimeout(250); check('client IDs: Copy puts the ID on the clipboard', await pg.evaluate(() => window.__copied) === 'CL-0001');
await pg.click('#cidList button[aria-label="Edit note: CL-0001"]'); await pg.waitForTimeout(300); check('client IDs: Edit note opens its dialog', !!(await pg.$('dialog[open]'))); await dlgClick('^\\s*cancel');
await pg.click('#cidList button[aria-label="History: CL-0001"]'); await pg.waitForTimeout(400); check('client IDs: History opens its dialog', !!(await pg.$('dialog[open]'))); await dlgClick('^\\s*(close|ok|cancel)');
await pg.click('#cidList button[aria-label="Archive: CL-0001"]'); await pg.waitForTimeout(300); check('client IDs: Archive asks for a reason (dialog)', !!(await pg.$('dialog[open]')) && /reason|why|archiv/i.test(await dlgText()), (await dlgText()).slice(0, 100)); await dlgClick('^\\s*cancel');

// ---- 5. documents
await open('ownerdocs'); const od = await info('#odList', '.cidrow'); const d0 = od[0];
check('documents: Open, Edit and Delete are icon-only (eye, pencil, trash)', od.length === 2 && d0.btns.length === 3 && JSON.stringify(d0.btns.map(x => x.icon)) === JSON.stringify(['#ic-eye', '#ic-pencil', '#ic-trash']) && d0.btns.every(x => x.io && /: /.test(x.a)) && d0.btns[2].danger, JSON.stringify(d0 && d0.btns));
await pg.click('#odList .cidrow:nth-child(1) button[aria-label^="Delete"]'); await pg.waitForTimeout(250); check('documents: Delete asks first, by title', /Contract/.test(await dlgText()), await dlgText()); await dlgClick('^\\s*cancel');

// ---- 6. Add buttons keep their text and have the plus icon
const adds = await pg.$$eval('#svcAdd, #tkAddCat, #kbAdd, #tmAdd, #cidAddNext, #cidAddCustom, #vdAdd, #fqAdd, #exAdd, #clAdd, #sfSvcAdd, #sfFormAdd, #wtCliAdd', bs => bs.map(x => ({ id: x.id, text: x.textContent.trim(), icon: (x.querySelector('use') || { getAttribute: () => '' }).getAttribute('href'), ibtn: x.classList.contains('ibtn') })));
check('13 Add buttons: text kept, plus icon, ibtn style', adds.length === 13 && adds.every(x => x.text.length > 2 && x.icon === '#ic-plus' && x.ibtn), JSON.stringify(adds.filter(x => !(x.icon === '#ic-plus'))));

// ---- 7. phone width: touch targets of 44px, rows do not overflow
await pg.setViewportSize({ width: 390, height: 800 }); await open('services');
const small = await info('#svcList', '.mrow'); const sw = small.flatMap(r => r.btns).filter(x => ACTION.test(x.a));
check('phone: every action is at least 44 x 44 px', sw.length >= 8 && sw.every(x => x.w >= 44 && x.h >= 44), JSON.stringify(sw.slice(0, 3)));
check('phone: no horizontal scroll on the page', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await pg.evaluate(() => document.documentElement.scrollWidth));
await pg.setViewportSize({ width: 1280, height: 800 });

// ---- 8. accessibility: every control on the changed pages has a name
for (const [page, sel] of [['services', '#dp-services'], ['clientids', '#dp-clientids'], ['ownerdocs', '#dp-ownerdocs'], ['faq', '#dp-faq']]) {
  await open(page); const unnamed = await pg.$$eval(sel + ' button, ' + sel + ' input, ' + sel + ' select', bs => bs.filter(x => !x.hidden && x.offsetParent && !(x.getAttribute('aria-label') || x.textContent.trim() || x.getAttribute('title') || (x.labels && x.labels.length))).length);
  check(page + ': every control has an accessible name', unnamed === 0, unnamed);
}
check('page errors: ' + JSON.stringify(errs), errs.length === 0);
const bad = results.filter(r => !r[1]).length; console.log(bad ? 'SOME FAILED' : 'ALL PASSED');
await b.close(); srv.close();
