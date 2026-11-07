// Run:  node --test scripts/form-guard.test.mjs      (Node 20+; no packages)
// Fake Worker + fake Firebase. Nothing here talks to the network.
import test, { beforeEach } from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const guard = require('./form-guard.js'); const G = guard._G;
const DATA = { name: 'Ann Visitor', email: 'ann@example.com', company: 'Acme', date: '2026-12-01', time: '09:00', tz: 'Asia/Manila', platform: 'Zoom', message: 'Hello there' };
let w, fs, calls, signIns, signOuts, apps;
function reset() {
  calls = []; signIns = []; signOuts = 0; apps = [];
  w = { status: { ok: true, open: true, paused: false, tokenRequired: false, cap: 30, day: '20261105' }, statusCode: 200, challengeCode: 200, verifyQueue: [], challenges: 0, down: false, uid: 'm_testUID1234567890' };
  fs = { docs: new Map(), commitHook: null, commits: [], getFail: null };
  G.api = 'https://forms.example'; G.cfg = { projectId: 'demo' }; G.search = ''; G.handle = null; G.sleep = async () => {};
  G.fetch = async (url, opt = {}) => {
    calls.push({ url, method: opt.method, body: opt.body }); if (w.down) throw new TypeError('Failed to fetch');
    const j = (s, o) => ({ status: s, ok: s >= 200 && s < 300, json: async () => o });
    if (url.endsWith('/v1/status')) return j(w.statusCode, w.status);
    if (url.endsWith('/v1/challenge')) { if (w.challengeCode !== 200) return j(w.challengeCode, { error: 'x' }); w.challenges++; return j(200, { challenge: 'CH' + w.challenges, code: '123456', expiresInS: 300 }); }
    if (url.endsWith('/v1/verify')) { const b = JSON.parse(opt.body); const q = w.verifyQueue.length ? w.verifyQueue.shift() : null; if (q) return j(q.s, q.o); return j(b.code === '123456' ? 200 : 401, b.code === '123456' ? { token: 'TOKEN', uid: w.uid, day: '20261105', expiresInS: 600 } : { error: 'code', left: 2 }); }
    return j(404, {});
  };
  const ref = p => ({ path: p });
  G.fb = {
    initializeApp: (cfg, name) => { apps.push(name); return { name }; }, initializeAuth: (app, o) => ({ app, o }), inMemoryPersistence: 'MEM',
    signInWithCustomToken: async (auth, t) => { signIns.push({ auth, t }); if (w.signErr) throw w.signErr; return { user: { uid: w.signUid || w.uid } }; }, signOut: async () => { signOuts++; },
    getFirestore: app => ({ app }), doc: (db, c, id) => ref(c + '/' + id), serverTimestamp: () => '<SERVER_TIME>',
    getDoc: async r => { if (fs.getFail && fs.getFail(r.path)) throw fs.getFail(r.path); const d = fs.docs.get(r.path); return { exists: () => d !== undefined, data: () => d }; },
    writeBatch: () => { const ops = []; return { set: (r, d) => ops.push([r.path, d]), commit: async () => { if (fs.commitHook) await fs.commitHook(ops); for (const [p, d] of ops) fs.docs.set(p, d); fs.commits.push(ops); } }; }
  };
}
beforeEach(reset);
const ui = (answers) => { const asked = []; const q = [...answers]; return { asked, askCode: async o => { asked.push(o); const a = q.shift(); return typeof a === 'function' ? a(o) : a; } }; };
const submit = (u, d = DATA) => guard.submit(d, u, w.status);

test('decide: old path while the switch is off; token path when on or with ?verify=1', async () => {
  assert.deepEqual((await guard.decide()).token, false);
  w.status.tokenRequired = true; assert.equal((await guard.decide()).token, true);
  w.status.tokenRequired = false; G.search = '?verify=1'; assert.equal((await guard.decide()).token, true);
  G.search = '?verify=10'; assert.equal((await guard.decide()).token, false); G.search = '?x=1&verify=1#schedule'; assert.equal((await guard.decide()).token, true); });
test('decide: Worker unreachable -> old path (rules decide); with ?verify=1 -> token path that reports "unreachable"', async () => {
  w.down = true; let d = await guard.decide(); assert.equal(d.token, false); assert.equal(d.error, null);
  G.search = '?verify=1'; d = await guard.decide(); assert.equal(d.token, true); assert.equal(d.error, 'unreachable');
  w.down = false; w.statusCode = 500; w.status = { error: 'config' }; G.search = ''; assert.equal((await guard.decide()).token, false); });
test('decide: no Worker address configured -> old path; with ?verify=1 -> config message', async () => { G.api = ''; assert.equal((await guard.decide()).token, false); G.search = '?verify=1'; assert.equal((await guard.decide()).error, 'config'); });

test('happy path: request id = token uid, counter 1, day from the Worker, server time, separate in-memory app, signed out afterwards', async () => {
  const u = ui(['123456']); const r = await submit(u); assert.deepEqual(r, { ok: true });
  assert.equal(u.asked.length, 1); assert.equal(u.asked[0].code, '123456'); assert.equal(u.asked[0].left, 3);
  const [[rp, rd], [cp, cd]] = fs.commits[0]; assert.equal(rp, 'meetingRequests/' + w.uid); assert.equal(cp, 'reqCounters/20261105');
  assert.deepEqual(cd, { count: 1, lastReq: w.uid }); assert.equal(rd.status, 'new'); assert.equal(rd.day, '20261105'); assert.equal(rd.createdAt, '<SERVER_TIME>');
  for (const k of Object.keys(DATA)) assert.equal(rd[k], DATA[k]);
  assert.deepEqual(apps, ['visitor']); assert.equal(signIns.length, 1); assert.equal(signIns[0].t, 'TOKEN'); assert.equal(signIns[0].auth.o.persistence, 'MEM'); assert.equal(signOuts, 1); });
test('existing counter 5 -> 6, stamped with this uid', async () => { fs.docs.set('reqCounters/20261105', { count: 5, lastReq: 'm_other' }); assert.equal((await submit(ui(['123456']))).ok, true); assert.deepEqual(fs.commits[0][1][1], { count: 6, lastReq: w.uid }); });
test('the form text is NEVER sent to the Worker; the typed code goes only to /verify', async () => {
  await submit(ui(['123456'])); const all = calls.map(c => (c.body || '') + c.url).join('|');
  for (const s of [DATA.email, DATA.name, DATA.message, 'Acme']) assert.ok(!all.includes(s));
  assert.equal(calls.filter(c => c.url.endsWith('/v1/challenge')).every(c => !c.body), true);
  const v = calls.find(c => c.url.endsWith('/v1/verify')); assert.deepEqual(Object.keys(JSON.parse(v.body)).sort(), ['challenge', 'code']); });
test('requests carry no cookies (credentials omitted) and are never cached', async () => {
  let seen; const f = G.fetch; G.fetch = async (u, o) => { seen = o; return f(u, o); }; await guard.decide(); assert.equal(seen.credentials, 'omit'); assert.equal(seen.cache, 'no-store'); });

test('wrong code: the page is told, attempts left are passed on, then the right code works', async () => {
  const u = ui(['000000', '123456']); const r = await submit(u); assert.equal(r.ok, true); assert.equal(u.asked[1].error, 'wrong'); assert.equal(u.asked[1].left, 2); });
test('three wrong codes -> a NEW challenge is shown automatically; right code then works', async () => {
  w.verifyQueue = [{ s: 401, o: { error: 'code', left: 2 } }, { s: 401, o: { error: 'code', left: 1 } }, { s: 401, o: { error: 'code', left: 0 } }];
  const u = ui(['1', '2', '3', '123456']); const r = await submit(u); assert.equal(r.ok, true); assert.equal(w.challenges, 2); assert.equal(u.asked[3].error, 'wrong'); });
test('after three challenges the visitor gets a plain failure, never an endless loop', async () => {
  w.verifyQueue = Array(9).fill({ s: 401, o: { error: 'code', left: 0 } }); const u = ui(Array(9).fill('000000')); const r = await submit(u); assert.equal(r.ok, false); assert.equal(r.code, 'failed'); assert.equal(w.challenges, 3); assert.equal(signIns.length, 0); });
test('expired challenge (410) or the page timer -> new code shown, then success', async () => {
  w.verifyQueue = [{ s: 410, o: { error: 'expired' } }]; let r = await submit(ui(['123456', '123456'])); assert.equal(r.ok, true); assert.equal(w.challenges, 2);
  reset(); const u = ui([{ expired: true }, '123456']); r = await submit(u); assert.equal(r.ok, true); assert.equal(w.challenges, 2); assert.equal(u.asked[1].error, 'expired'); });
test('cancel: nothing is sent, nobody is signed in', async () => { const r = await submit(ui([null])); assert.equal(r.code, 'cancelled'); assert.equal(signIns.length, 0); assert.equal(fs.commits.length, 0); });
test('Worker answers: slow (429 on challenge or verify), paused (503), config (500)', async () => {
  w.challengeCode = 429; assert.equal((await submit(ui([]))).code, 'slow'); w.challengeCode = 503; assert.equal((await submit(ui([]))).code, 'paused'); w.challengeCode = 500; assert.equal((await submit(ui([]))).code, 'config');
  w.challengeCode = 200; w.verifyQueue = [{ s: 429, o: { error: 'slow' } }]; assert.equal((await submit(ui(['123456']))).code, 'slow');
  w.verifyQueue = [{ s: 503, o: { error: 'paused' } }]; assert.equal((await submit(ui(['123456']))).code, 'paused'); });
test('Worker down mid-way -> "unreachable" message; nothing written', async () => { w.down = true; const r = await submit(ui([])); assert.equal(r.code, 'unreachable'); assert.equal(fs.commits.length, 0); });

test('counter race: another visitor bumped the counter first -> the page re-reads and succeeds on the next try', async () => {
  fs.docs.set('reqCounters/20261105', { count: 5, lastReq: 'm_a' }); let n = 0;
  fs.commitHook = async ops => { n++; if (n === 1) { fs.docs.set('reqCounters/20261105', { count: 6, lastReq: 'm_b' }); throw Object.assign(new Error('denied'), { code: 'permission-denied' }); } };
  const r = await submit(ui(['123456'])); assert.equal(r.ok, true); assert.deepEqual(fs.commits[0][1][1], { count: 7, lastReq: w.uid }); assert.equal(n, 2); });
test('cap reached: reported as "full" without trying to write', async () => { fs.docs.set('reqCounters/20261105', { count: 30, lastReq: 'm_a' }); const r = await submit(ui(['123456'])); assert.equal(r.code, 'full'); assert.equal(fs.commits.length, 0); });
test('cap comes from the Worker status (owner can change it)', async () => { w.status.cap = 5; fs.docs.set('reqCounters/20261105', { count: 5, lastReq: 'm_a' }); assert.equal((await submit(ui(['123456']))).code, 'full'); w.status.cap = 6; assert.equal((await submit(ui(['123456']))).ok, true); });
test('lost acknowledgement: the write landed but the commit threw -> success, no second request', async () => {
  fs.commitHook = async ops => { for (const [p, d] of ops) fs.docs.set(p, d); throw Object.assign(new Error('network'), { code: 'unavailable' }); };
  const r = await submit(ui(['123456'])); assert.equal(r.ok, true); assert.equal(fs.docs.get('meetingRequests/' + w.uid).name, DATA.name); });
test('connection fails and nothing landed -> "unreachable" (the token stays valid 10 minutes for a retry)', async () => {
  fs.commitHook = async () => { throw Object.assign(new Error('network'), { code: 'unavailable' }); }; const r = await submit(ui(['123456'])); assert.equal(r.ok, false); assert.equal(r.code, 'unreachable'); assert.equal(fs.docs.has('meetingRequests/' + w.uid), false); });
test('permission refused three times: diagnosed as full, paused, or a plain failure', async () => {
  const deny = async () => { throw Object.assign(new Error('denied'), { code: 'permission-denied' }); };
  fs.commitHook = deny; fs.docs.set('reqCounters/20261105', { count: 29, lastReq: 'm_a' }); let r = await submit(ui(['123456'])); assert.equal(r.code, 'failed');
  reset(); fs.commitHook = deny; let n = 0; fs.docs.set('reqCounters/20261105', { count: 29, lastReq: 'm_a' }); fs.commitHook = async () => { n++; fs.docs.set('reqCounters/20261105', { count: 30, lastReq: 'm_x' }); throw Object.assign(new Error('d'), { code: 'permission-denied' }); };
  r = await submit(ui(['123456'])); assert.equal(r.code, 'full');
  reset(); fs.commitHook = deny; w.status.paused = true; r = await submit(ui(['123456'])); assert.equal(r.code, 'paused'); });
test('retries are bounded (3 writes) and each uses the same document ID', async () => { let n = 0; fs.commitHook = async () => { n++; throw Object.assign(new Error('d'), { code: 'permission-denied' }); }; await submit(ui(['123456'])); assert.equal(n, 3); });

test('sign-in problems: wrong uid returned -> failed; a refused fresh pass is a setup problem (config) with the real code; only an OLD pass says "session"', async () => {
  w.signUid = 'm_someoneelse12345'; assert.equal((await submit(ui(['123456']))).code, 'failed'); w.signUid = null;
  w.signErr = Object.assign(new Error('x'), { code: 'auth/custom-token-mismatch' }); let r = await submit(ui(['123456'])); assert.equal(r.code, 'config'); assert.equal(r.detail, 'auth/custom-token-mismatch');
  w.signErr = Object.assign(new Error('x'), { code: 'auth/invalid-custom-token' }); r = await submit(ui(['123456'])); assert.equal(r.code, 'config'); assert.equal(r.detail, 'auth/invalid-custom-token');
  let clock = 1000; G.now = () => clock; const sw = G.fb.signInWithCustomToken; G.fb.signInWithCustomToken = async (a, tk) => { clock += 600000; return sw(a, tk); };   /* ten minutes pass between the pass being issued and the sign-in */
  r = await submit(ui(['123456'])); assert.equal(r.code, 'session'); G.now = () => Date.now(); G.fb.signInWithCustomToken = sw;
  w.signErr = Object.assign(new Error('x'), { code: 'auth/invalid-api-key' }); assert.equal((await submit(ui(['123456']))).code, 'config');
  w.signErr = Object.assign(new Error('x'), { code: 'auth/network-request-failed', message: 'network error' }); assert.equal((await submit(ui(['123456']))).code, 'unreachable'); assert.equal(fs.commits.length, 0); });
test('Worker without a day field is refused as a configuration problem (never guesses the day from the visitor clock)', async () => { w.verifyQueue = [{ s: 200, o: { token: 'T', uid: w.uid } }]; assert.equal((await submit(ui(['123456']))).code, 'config'); assert.equal(fs.commits.length, 0); });
test('missing Firebase configuration -> config message', async () => { G.cfg = null; const keep = globalThis.portfolioSettings; globalThis.portfolioSettings = undefined; assert.equal((await submit(ui(['123456']))).code, 'config'); globalThis.portfolioSettings = keep; });

test('every message is plain text without codes, and all codes used by the flow have a message', () => {
  for (const k of ['paused', 'full', 'slow', 'wrong', 'expired', 'cancelled', 'offline', 'unreachable', 'session', 'failed', 'config']) { assert.ok(typeof guard.MSG[k] === 'string' && guard.MSG[k].length > 10); assert.ok(!/error|exception|undefined|\b[45]\d\d\b/i.test(guard.MSG[k]), k); } });
test('mailto draft carries what the visitor typed, is URL-safe and bounded', () => {
  const m = guard.mailtoFor('me@example.com', { ...DATA, message: 'x'.repeat(5000) + '\nline & more' }); assert.ok(m.startsWith('mailto:me@example.com?subject=Meeting%20request&body='));
  assert.ok(!/[\n ]/.test(m)); assert.ok(decodeURIComponent(m).includes('Name: Ann Visitor')); assert.ok(decodeURIComponent(m).includes('ann@example.com')); assert.ok(m.length < 4000); });
test('the file contains no key, token or secret', async () => { const fsm = await import('node:fs'); const t = fsm.readFileSync(new URL('./form-guard.js', import.meta.url), 'utf8'); assert.ok(!/BEGIN (RSA )?PRIVATE KEY|private_key|AIza[0-9A-Za-z_-]{20,}/.test(t)); });

/* ---- SE-E6 Part A: Turnstile step with the six-digit code as the fallback ---- */
const SK = '0x4AAAAAAF3CDYLp6mETZLKs';
const tsUi = (tsAnswers, codeAnswers = []) => { const t = [...tsAnswers], c = [...codeAnswers]; const asked = [], tsAsked = []; return { asked, tsAsked, turnstile: async o => { tsAsked.push(o); return t.shift(); }, askCode: async o => { asked.push(o); return c.shift(); } }; };
const withTs = fn => async () => { globalThis.portfolioSettings = { turnstileSiteKey: SK }; w.status.turnstile = true; try { await fn(); } finally { delete globalThis.portfolioSettings; } };
const verifyBodies = () => calls.filter(c => c.url.endsWith('/v1/verify')).map(c => JSON.parse(c.body));

test('Turnstile: token goes to /v1/verify as {challenge, ts}; the code box is never asked', withTs(async () => {
  const u = tsUi([{ token: 'TSTOKEN' }]); w.verifyQueue.push({ s: 200, o: { token: 'TOKEN', uid: w.uid, day: '20261105', expiresInS: 600 } });
  const r = await submit(u); assert.deepEqual(r, { ok: true }); assert.equal(u.asked.length, 0); assert.equal(u.tsAsked[0].siteKey, SK); assert.equal(u.tsAsked[0].action, 'meeting');
  assert.deepEqual(verifyBodies(), [{ challenge: 'CH1', ts: 'TSTOKEN' }]); }));
test('Turnstile: off when the Worker does not report it, when the key is missing or malformed, or when the page has no widget', async () => {
  for (const [flag, key, hasUi] of [[false, SK, true], [true, undefined, true], [true, 'not-a-key', true], [true, '0x4' + 'x'.repeat(300), true], [true, SK, false]]) {
    reset(); globalThis.portfolioSettings = key === undefined ? {} : { turnstileSiteKey: key }; w.status.turnstile = flag;
    const u = hasUi ? tsUi([{ token: 'T' }], ['123456']) : ui(['123456']); const r = await submit(u);
    assert.deepEqual(r, { ok: true }); if (hasUi) assert.equal(u.tsAsked.length, 0); assert.equal(verifyBodies()[0].code, '123456'); }
  delete globalThis.portfolioSettings; });
test('Turnstile: "use the code instead" and "unavailable" fall back to the code box on the same challenge, once', withTs(async () => {
  for (const first of [{ useCode: true }, { unavailable: true }]) {
    reset(); globalThis.portfolioSettings = { turnstileSiteKey: SK }; w.status.turnstile = true;
    const u = tsUi([first, { token: 'NEVER' }], ['123456']); const r = await submit(u); assert.deepEqual(r, { ok: true });
    assert.equal(u.tsAsked.length, 1); assert.equal(u.asked.length, 1); assert.equal(w.challenges, 1); assert.equal(verifyBodies()[0].code, '123456');
    assert.equal(u.asked[0].error, first.unavailable ? 'tsnote' : ''); } }));
test('Turnstile: a throwing widget counts as unavailable', withTs(async () => {
  const u = tsUi([], ['123456']); u.turnstile = async () => { throw new Error('boom'); }; assert.deepEqual(await submit(u), { ok: true }); assert.equal(u.asked[0].error, 'tsnote'); }));
test('Turnstile: cancelled -> "cancelled"; empty or oversize token -> code box', withTs(async () => {
  let r = await submit(tsUi([null])); assert.equal(r.code, 'cancelled'); assert.equal(verifyBodies().length, 0);
  reset(); globalThis.portfolioSettings = { turnstileSiteKey: SK }; w.status.turnstile = true;
  const u = tsUi([{ token: 'x'.repeat(2049) }], ['123456']); r = await submit(u); assert.deepEqual(r, { ok: true }); assert.equal(u.asked.length, 1); assert.ok(verifyBodies().every(b => !b.ts)); }));
test('Turnstile: Worker says 400 turnstile -> notice and a NEW challenge, widget shown again with the notice', withTs(async () => {
  const u = tsUi([{ token: 'BAD' }, { token: 'GOOD' }]); w.verifyQueue.push({ s: 400, o: { error: 'turnstile' } }, { s: 200, o: { token: 'TOKEN', uid: w.uid, day: '20261105', expiresInS: 600 } });
  assert.deepEqual(await submit(u), { ok: true }); assert.equal(w.challenges, 2); assert.equal(u.tsAsked[1].error, 'tsfail'); assert.deepEqual(verifyBodies().map(b => b.challenge), ['CH1', 'CH2']); }));
test('Turnstile: three failed checks end with the plain failure message (no endless loop)', withTs(async () => {
  const u = tsUi([{ token: 'a' }, { token: 'b' }, { token: 'c' }, { token: 'd' }]); for (let i = 0; i < 4; i++) w.verifyQueue.push({ s: 400, o: { error: 'turnstile' } });
  const r = await submit(u); assert.equal(r.ok, false); assert.equal(r.code, 'failed'); assert.equal(w.challenges, 3); }));
test('Turnstile: Worker says Cloudflare is down (503 tsdown) -> the code box on the same challenge, no new challenge', withTs(async () => {
  const u = tsUi([{ token: 'T' }], ['123456']); w.verifyQueue.push({ s: 503, o: { error: 'tsdown' } });
  assert.deepEqual(await submit(u), { ok: true }); assert.equal(w.challenges, 1); assert.equal(u.asked[0].error, 'tsnote'); assert.deepEqual(verifyBodies().map(b => b.ts || b.code), ['T', '123456']); }));
test('Turnstile: paused 503, rate limit 429, 410 expired, 500 config and a network error keep their own messages', withTs(async () => {
  for (const [q, code] of [[{ s: 503, o: { error: 'paused' } }, 'paused'], [{ s: 429, o: { error: 'slow' } }, 'slow'], [{ s: 500, o: {} }, 'config'], [{ s: 404, o: {} }, 'unreachable']]) {
    reset(); globalThis.portfolioSettings = { turnstileSiteKey: SK }; w.status.turnstile = true; w.verifyQueue.push(q);
    const r = await submit(tsUi([{ token: 'T' }])); assert.equal(r.code, code); }
  reset(); globalThis.portfolioSettings = { turnstileSiteKey: SK }; w.status.turnstile = true; w.verifyQueue.push({ s: 410, o: {} });
  const u = tsUi([{ token: 'T' }, { token: 'T2' }]); w.verifyQueue.push({ s: 200, o: { token: 'TOKEN', uid: w.uid, day: '20261105', expiresInS: 600 } });
  assert.deepEqual(await submit(u), { ok: true }); assert.equal(w.challenges, 2); }));
test('Turnstile: no secret or token text appears in visitor messages', () => { for (const k of ['tsfail', 'tsnote']) assert.ok(guard.MSG[k].length > 10 && !/token|secret|0x4/i.test(guard.MSG[k])); });
