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
    db: {}, uid: () => 'u1',
    fs: {
      doc: (db, ...p) => ({ path: p.join('/'), id: p[p.length - 1] }), collection: (db, ...p) => ({ col: p.join('/') }),
      where: (f, op, v) => ({ f, op, v }), query: (c, ...w) => ({ col: c.col, w }), serverTimestamp: ts,
      getDoc: async ref => { reads++; const d = get(ref.path); return { exists: () => !!d, data: () => d, id: ref.id }; },
      getDocs: async q => { reads++; const docs = Object.keys(store).filter(k => k.startsWith(q.col + '/') && !k.slice(q.col.length + 1).includes('/')).filter(k => (q.w || []).every(w => store[k][w.f] === w.v)).map(k => ({ id: k.split('/').pop(), data: () => store[k] })); return { docs, empty: !docs.length, size: docs.length }; },
      setDoc: async (ref, d) => { store[ref.path] = d; },
      onSnapshot: () => () => {},
      runTransaction: async (db, fn) => { const pend = []; const tx = { get: async ref => { reads++; const d = get(ref.path); return { exists: () => !!d, data: () => d }; }, set: (ref, d) => pend.push([ref.path, d]) }; await fn(tx); pend.forEach(([k, d]) => { store[k] = d; }); }
    }
  };
  window.OWN = OWN;
};
const b = await chromium.launch(); 
async function fresh(opts = {}) { const ctx = await b.newContext(Object.assign({ viewport: { width: 1200, height: 800 } }, opts)); await ctx.route(/gstatic|googleapis|google\.com|recaptcha|workers\.dev/, r => r.abort()); const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(String(e))); await pg.addInitScript(stub); await pg.goto(base); await pg.waitForFunction(() => window.wtApi && window.__wtFloat); return { ctx, pg }; }
const errs = [];
const signIn = pg => pg.evaluate(() => document.dispatchEvent(new CustomEvent('own:auth', { detail: { ok: true, email: 't@x.com' } })));
const signOut = pg => pg.evaluate(() => document.dispatchEvent(new CustomEvent('own:auth', { detail: { ok: false } })));
const vis = pg => pg.evaluate(() => { const e = document.getElementById('wtFloat'); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; });

export { b, base, check, errs, fresh, signIn, signOut, vis, results, srv };
