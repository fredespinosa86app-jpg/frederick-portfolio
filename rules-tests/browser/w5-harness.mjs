import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(0, r)); const base = 'http://127.0.0.1:' + srv.address().port + '/';
const results = []; const check = (n, ok, extra) => { results.push([n, !!ok]); console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  ' + (extra || ''))); };

const stub = () => {
  const store = {}; let reads = 0; window.__reads = () => reads; window.__store = store;
  const ts = () => ({ __ts: true, ms: Date.now(), toMillis() { return this.ms; } });
  const get = p => store[p]; 
  const OWN = {
    db: {}, uid: () => 'u1', log: () => {}, save: async (patch, msg) => { store['settings/site'] = Object.assign({}, store['settings/site'], patch); },
    fs: {
      doc: (db, ...p) => ({ path: p.join('/'), id: p[p.length - 1] }), collection: (db, ...p) => ({ col: p.join('/') }),
      where: (f, op, v) => ({ f, op, v }), orderBy: (f, d) => ({ ob: f, d }), limit: n => ({ lim: n }), startAfter: d => ({ sa: d }), query: (c, ...w) => ({ col: c.col, w: w.filter(x => x && x.f), ob: w.find(x => x && x.ob), lim: w.find(x => x && x.lim), sa: w.find(x => x && x.sa) }), serverTimestamp: ts,
      getDoc: async ref => { reads++; const d = get(ref.path); return { exists: () => !!d, data: () => d, id: ref.id }; },
      getDocs: async q => { reads++; const num = x => x == null ? NaN : (x.toMillis ? x.toMillis() : (x instanceof Date ? x.getTime() : +x)); const test = (v, w) => w.op === '<' ? num(v) < num(w.v) : w.op === '>=' ? num(v) >= num(w.v) : v === w.v;
        let docs = Object.keys(store).filter(k => k.startsWith(q.col + '/') && !k.slice(q.col.length + 1).includes('/')).filter(k => (q.w || []).every(w => test(store[k][w.f], w))).map(k => ({ id: k.split('/').pop(), data: () => store[k] }));
        if (q.ob) docs.sort((a, b) => num(a.data()[q.ob.ob]) - num(b.data()[q.ob.ob]) || (a.id < b.id ? -1 : 1));
        if (q.sa) { const i = docs.findIndex(d => d.id === q.sa.sa.id); if (i >= 0) docs = docs.slice(i + 1); }
        if (q.lim) docs = docs.slice(0, q.lim.lim);
        return { docs, empty: !docs.length, size: docs.length, forEach: fn => docs.forEach(fn) }; },
      setDoc: async (ref, d) => { store[ref.path] = d; }, deleteDoc: async ref => { delete store[ref.path]; },
      onSnapshot: () => () => {},
      runTransaction: async (db, fn) => { const pend = []; const tx = { get: async ref => { reads++; const d = get(ref.path); return { exists: () => !!d, data: () => d }; }, set: (ref, d) => pend.push([ref.path, d]) }; await fn(tx); pend.forEach(([k, d]) => { store[k] = d; }); }
    }
  };
  window.OWN = OWN;
};
const b = await chromium.launch(); 
async function fresh(opts0 = {}) { const { init, initArg, ...opts } = opts0; const ctx = await b.newContext(Object.assign({ viewport: { width: 1200, height: 800 } }, opts)); await ctx.route(/gstatic|googleapis|google\.com|recaptcha|workers\.dev/, r => r.abort()); const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(String(e))); await pg.addInitScript(stub); if (init) await pg.addInitScript(init, initArg); await pg.goto(base); await pg.waitForFunction(() => window.wtApi && window.__wtFloat); return { ctx, pg }; }
const errs = [];
const signIn = pg => pg.evaluate(() => document.dispatchEvent(new CustomEvent('own:auth', { detail: { ok: true, email: 't@x.com' } })));
const signOut = pg => pg.evaluate(() => document.dispatchEvent(new CustomEvent('own:auth', { detail: { ok: false } })));
const vis = pg => pg.evaluate(() => { const e = document.getElementById('wtFloat'); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; });

export { b, base, check, errs, fresh, signIn, signOut, vis, results, srv };
