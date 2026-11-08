/* GS-1 browser test: the header login control shows Google's official "Sign in with Google" artwork while signed out; same click behaviour. */
import { b, check, errs, fresh, srv, results } from './w5-harness.mjs';
import fs from 'node:fs'; import crypto from 'node:crypto';
const root = new URL('../../', import.meta.url).pathname;
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const init = () => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); };
const { pg } = await fresh({ init, viewport: { width: 1280, height: 900 } });
const st = () => pg.evaluate(() => { const h = document.getElementById('hdrLogin'), r = h.getBoundingClientRect(), vis = [...h.querySelectorAll('img')].filter(i => getComputedStyle(i).display !== 'none'); return { hidden: h.hidden || getComputedStyle(h).display === 'none', gsi: h.classList.contains('gsi'), label: h.getAttribute('aria-label'), w: r.width, h: r.height, vis: vis.map(i => i.className + ':' + Math.round(i.getBoundingClientRect().width) + 'x' + Math.round(i.getBoundingClientRect().height)), text: [...h.querySelectorAll('.hl-t')].map(t => { const c = getComputedStyle(t); return c.display === 'none' ? '' : t.textContent; }).join(''), svg: getComputedStyle(h.querySelector('svg')).display }; });
// show-rules: not allowed on a first visit from a new device
await pg.waitForTimeout(500);
let s = await st(); check('first visit, no owner device: the control stays hidden (rules unchanged)', s.hidden);
await pg.evaluate(() => { location.hash = '#owner'; const f = document.getElementById('ownerLogin'); f.hidden = false; }); await pg.waitForTimeout(400);
s = await st();
check('signed out: control is visible and uses the Google artwork class', !s.hidden && s.gsi);
check('signed out: accessible name is "Sign in with Google"', s.label === 'Sign in with Google', s.label);
check('desktop: the official 180x40 "Sign in with Google" button shows (' + s.vis.join(',') + ')', s.vis.length === 1 && s.vis[0] === 'gb gb-l:180x40');
check('desktop: no plain-text label or user icon is drawn beside the artwork', s.text === '' && s.svg === 'none');
check('touch target is at least 44px high (' + Math.round(s.h) + ')', s.h >= 44 && s.w >= 44);
const imgs = await pg.evaluate(() => [...document.querySelectorAll('#hdrLogin img')].map(i => i.complete && i.naturalWidth > 0));
check('all four official image files load (no 404, no CSP block)', imgs.length === 4 && imgs.every(Boolean), imgs.join(','));
// the G keeps its four colours (a blocked mask/inline style inside the SVG would break it)
const shot = await pg.locator('#hdrLogin .gb-l').screenshot();
const cols = await pg.evaluate(async b64 => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data, f = (r, g, bl) => { let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - r) < 40 && Math.abs(d[i + 1] - g) < 40 && Math.abs(d[i + 2] - bl) < 40 && d[i + 3] > 200) n++; return n; }; return [f(66, 133, 244), f(234, 67, 53), f(251, 188, 5), f(52, 168, 83)]; }, shot.toString('base64'));
check('the "G" shows its blue, red, yellow and green (' + cols.join('/') + ')', cols.every(n => n > 5));
fs.writeFileSync('/tmp/gs1-light.png', shot);
// the click is the same as before: it clicks the Firebase login handler once
await pg.evaluate(() => { window.__lc = 0; document.getElementById('ownerLogin').addEventListener('click', () => window.__lc++); });
await pg.click('#hdrLogin'); await pg.waitForTimeout(150);
check('click: starts sign-in exactly once (the same #ownerLogin handler)', await pg.evaluate(() => window.__lc) === 1);
await pg.focus('#hdrLogin'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(150);
check('keyboard Enter on the focused control starts sign-in once more', await pg.evaluate(() => window.__lc) === 2);
await pg.evaluate(() => document.activeElement && document.activeElement.blur()); await pg.keyboard.press('Tab');
const ring = await pg.evaluate(() => { document.getElementById('hdrLogin').focus({ focusVisible: true }); const c = getComputedStyle(document.getElementById('hdrLogin')); return c.outlineStyle + ' ' + c.outlineWidth; });
check('keyboard focus ring is visible (' + ring + ')', /solid 3px/.test(ring));
// dark mode
await pg.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); s = await st();
check('dark mode: the official dark button shows (' + s.vis.join(',') + ')', s.vis.length === 1 && s.vis[0] === 'gb gb-d:180x40');
fs.writeFileSync('/tmp/gs1-dark.png', await pg.locator('#hdrLogin .gb-d').screenshot());
// phone / narrow
await pg.setViewportSize({ width: 390, height: 800 }); await pg.waitForTimeout(300); s = await st();
check('phone, dark: the official round dark "G" button shows (' + s.vis.join(',') + ')', s.vis.length === 1 && s.vis[0] === 'gb gb-di:40x40');
check('phone: touch target at least 44x44 (' + Math.round(s.w) + 'x' + Math.round(s.h) + ')', s.w >= 44 && s.h >= 44);
await pg.evaluate(() => document.documentElement.removeAttribute('data-theme')); s = await st();
check('phone, light: the round light "G" button shows (' + s.vis.join(',') + ')', s.vis.length === 1 && s.vis[0] === 'gb gb-li:40x40');
check('phone: page does not scroll sideways', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
fs.writeFileSync('/tmp/gs1-phone.png', await pg.screenshot({ clip: { x: 0, y: 0, width: 390, height: 120 } }));
await pg.setViewportSize({ width: 1280, height: 900 });
// signed in: the plain Owner panel button is back, and it opens the dashboard
await pg.evaluate(() => { window.__dc = 0; document.getElementById('dashOpen').addEventListener('click', () => window.__dc++); document.dispatchEvent(new CustomEvent('own:auth', { detail: { ok: true, email: 'o@x.test', uid: 'u', provider: 'google.com' } })); }); await pg.waitForTimeout(200); s = await st();
check('signed in: no Google artwork, plain button reads "Owner panel"', !s.gsi && s.label === 'Owner panel' && s.vis.length === 0 && s.text === 'Owner panel', JSON.stringify(s));
await pg.click('#hdrLogin'); await pg.waitForTimeout(150);
check('signed in: click still opens the dashboard', await pg.evaluate(() => window.__dc) === 1);
await pg.evaluate(() => document.dispatchEvent(new CustomEvent('own:auth', { detail: { ok: false } }))); await pg.waitForTimeout(200); s = await st();
check('signed out again: the Google button returns', s.gsi && s.label === 'Sign in with Google');
// files and policy
const SRC = '/tmp/gassets/Android + Web/SVG/', map = { 'signin-light.svg': 'Light/Theme=Light, Show text=Yes, Shape=Pill, Platform=Android+Web.svg', 'signin-dark.svg': 'Dark/Theme=Dark, Show text=Yes, Shape=Pill, Platform=Android+Web.svg', 'signin-light-icon.svg': 'Light/Theme=Light, Show text=No, Shape=Pill, Platform=Android+Web.svg', 'signin-dark-icon.svg': 'Dark/Theme=Dark, Show text=No, Shape=Pill, Platform=Android+Web.svg' };
if (fs.existsSync(SRC)) check('the four artwork files are byte-identical to the files downloaded from Google', Object.entries(map).every(([a, o]) => sha(root + 'assets/images/google-signin/' + a) === sha(SRC + o)));
for (const f of Object.keys(map)) { const t = fs.readFileSync(root + 'assets/images/google-signin/' + f, 'utf8'); check(f + ': no script, link, font or event handler inside the SVG', !/<script|href=|<image|font-family|\son[a-z]+=|url\(\s*['"]?http/i.test(t)); }
check('no blocked-by-policy events during the whole run', (await pg.evaluate(() => window.__csp)).length === 0, JSON.stringify(await pg.evaluate(() => window.__csp)));
check('no page errors', errs.length === 0, errs.join('|'));
await b.close(); srv.close();
const bad = results.filter(r => !r[1]).length; console.log(bad ? bad + ' FAILED' : 'ALL PASSED'); process.exit(bad ? 1 : 0);
