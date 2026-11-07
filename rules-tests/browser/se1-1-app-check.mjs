// SE-E1 stage A: the employer survey page (real survey.html, real CSP) starts App Check in monitoring mode and never depends on it.
// The Firebase SDK and the App Check module are in-page fakes; the test records the order of calls and any CSP violation.
import { b, base, check, results, srv } from './w5-harness.mjs';

const KEY = 'Kq7Zr2Lm9Xc4Vb8Nt3Hy6Wd1Sf5Gj0Pa', SITE = '6LeC_RMuAAAAAELcd2_Knc3OuYpetZgz5bBZMmoc';
const FAKE_APP = 'export const initializeApp = c => { window.__order.push("initializeApp"); return { cfg: c }; };';
const FAKE_FS = `export const getFirestore = a => { window.__order.push("getFirestore"); return {}; };
export const doc = (db, col, id) => ({ path: col + '/' + id, id });
export const serverTimestamp = () => ({ __sv: true });
export const getDoc = async ref => { const d = window.__docs[ref.path]; return { exists: () => !!d, data: () => d }; };
export const writeBatch = db => { const ops = []; return { set: (r, d) => ops.push(d), update: (r, d) => ops.push(d), commit: async () => { window.__commits.push(ops); } }; };`;
const FAKE_AC = 'export class ReCaptchaEnterpriseProvider { constructor(k) { this.k = k; this.t = "enterprise"; } } export class ReCaptchaV3Provider { constructor(k) { this.k = k; this.t = "v3"; } } export const initializeAppCheck = (app, o) => { window.__order.push("initializeAppCheck"); window.__ac = { key: o.provider.k, t: o.provider.t, auto: o.isTokenAutoRefreshEnabled, hasCfg: !!app.cfg }; };';
const invite = { status: 'sent', employerName: 'Ana Cruz', company: 'Acme Ltd', ownerName: 'Frederick Espinosa', expiresAt: Date.now() + 5e8 };

async function open({ ac }) {
  const ctx = await b.newContext({ viewport: { width: 1000, height: 900 } }); const csp = []; const reqs = [];
  ctx.on('request', r => reqs.push(r.url()));
  await ctx.route(/\/assets\/vendor\/firebase\/10\.12\.2\/firebase-app\.js$/, r => r.fulfill({ contentType: 'text/javascript', body: FAKE_APP }));
  await ctx.route(/\/assets\/vendor\/firebase\/10\.12\.2\/firebase-firestore\.js$/, r => r.fulfill({ contentType: 'text/javascript', body: FAKE_FS }));
  await ctx.route(/\/assets\/vendor\/firebase\/10\.12\.2\/firebase-app-check\.js$/, r => ac === 'ok' ? r.fulfill({ contentType: 'text/javascript', body: FAKE_AC }) : ac === 'broken' ? r.fulfill({ contentType: 'text/javascript', body: 'throw new Error("boom")' }) : r.abort());
  const pg = await ctx.newPage(); const perr = []; pg.on('pageerror', e => perr.push(String(e)));
  pg.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text()); });
  await pg.addInitScript(d => { window.__docs = d; window.__order = []; window.__commits = []; }, { ['surveyInvites/' + KEY]: invite });
  await pg.goto(base + 'survey.html#k=' + KEY); await pg.waitForFunction(() => ['svInvalid', 'svForm', 'svThanks'].some(i => !document.getElementById(i).hidden), null, { timeout: 8000 });
  return { ctx, pg, perr, csp, reqs };
}
const shown = pg => pg.evaluate(() => ['svLoading', 'svInvalid', 'svThanks', 'svForm'].filter(i => !document.getElementById(i).hidden).join(','));

{ // A. App Check module loads: started once, right key, right provider, before Firestore is used
  const r = await open({ ac: 'ok' });
  check('A survey page shows the form', (await shown(r.pg)) === 'svForm');
  const o = await r.pg.evaluate(() => window.__order), ac = await r.pg.evaluate(() => window.__ac);
  check('A order: initializeApp, then App Check, then Firestore', JSON.stringify(o) === '["initializeApp","initializeAppCheck","getFirestore"]', JSON.stringify(o));
  check('A site key, enterprise provider, auto refresh on', ac && ac.key === SITE && ac.t === 'enterprise' && ac.auto === true && ac.hasCfg, JSON.stringify(ac));
  check('A the SDK folder is on this site and nothing left the site', r.reqs.every(u => u.startsWith(base)), JSON.stringify(r.reqs.filter(u => !u.startsWith(base))));
  check('A no page error and no CSP violation', r.perr.length === 0 && r.csp.length === 0, JSON.stringify([r.perr, r.csp]));
  // the employer can still answer: the batch is written as before
  await r.pg.click('.sv-star:nth-child(5)'); await r.pg.fill('#fComment', 'She was reliable, fast and always kept me informed about progress.'); await r.pg.click('input[name=recommend][value=yes]'); await r.pg.check('#fConsent');
  await r.pg.click('#svSubmit, button[type=submit]'); await r.pg.waitForFunction(() => !document.getElementById('svThanks').hidden, null, { timeout: 8000 }).catch(() => {});
  check('A submit still works with App Check on', (await shown(r.pg)) === 'svThanks' && (await r.pg.evaluate(() => window.__commits.length)) === 1);
  await r.ctx.close();
}
for (const [name, ac] of [['module fails to load', 'abort'], ['module throws on start', 'broken']]) { // B. App Check trouble must never stop the survey
  const r = await open({ ac });
  check('B ' + name + ': the form still opens', (await shown(r.pg)) === 'svForm');
  const o = await r.pg.evaluate(() => window.__order); check('B ' + name + ': Firestore still used', o.includes('getFirestore'), JSON.stringify(o));
  await r.ctx.close();
}
const bad = results.filter(x => !x[1]); console.log(bad.length ? 'FAILED ' + bad.length : 'ALL PASSED (' + results.length + ')');
srv.close(); await b.close(); process.exit(bad.length ? 1 : 0);
