// Run:  node --test server/portfolio-forms-worker.test.mjs      (Node 20+; no packages needed)
// Uses a throwaway in-memory RSA key (a fake service account, never a real credential).
import test, { beforeEach } from 'node:test'; import assert from 'node:assert/strict'; import { generateKeyPairSync, createVerify } from 'node:crypto';
import worker, { safeEq, LIMITS, _reset, utcDay, RL, uidFor } from './portfolio-forms-worker.js';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { client_email: 'portfolio-form-signer@demo-proj.iam.gserviceaccount.com', project_id: 'demo-proj', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const env = { SA_JSON: JSON.stringify(SA), CH_SECRET: 'test-secret-'.repeat(5), ALLOWED_ORIGINS: 'https://me.github.io,https://www.example.com' };
const OK = 'https://me.github.io';
let guardFields = null, guardStatus = 404, guardCalls = 0;
const realFetch = globalThis.fetch;
beforeEach(() => { _reset(); guardFields = null; guardStatus = 404; guardCalls = 0;
  globalThis.fetch = async u => { assert.match(String(u), /^https:\/\/firestore\.googleapis\.com\/v1\/projects\/demo-proj\/databases\/\(default\)\/documents\/content\/guard$/); guardCalls++;
    if (guardStatus === 'throw') throw new Error('net'); return guardStatus === 200 ? new Response(JSON.stringify({ fields: guardFields }), { status: 200 }) : new Response('{}', { status: guardStatus }); }; });
const call = (path, method = 'POST', body, o = {}, e = env) => worker.fetch(new Request('https://w.example' + path, { method, headers: Object.assign({ Origin: OK, 'Content-Type': 'application/json', 'CF-Connecting-IP': o.ip || '1.1.1.1' }, o.headers || {}), body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }), e);
const chal = async o => (await call('/v1/challenge', 'POST', undefined, o)).json();
const solve = async (o) => { const c = await chal(o); return call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code }, o); };

test('challenge returns a six-digit code and a three-part signed challenge', async () => { const c = await chal(); assert.match(c.code, /^\d{6}$/); assert.equal(c.challenge.split('.').length, 3); assert.equal(c.expiresInS, 300); });
test('every route refuses a missing or unlisted origin, including preflight', async () => {
  for (const [p, m] of [['/v1/status', 'GET'], ['/v1/challenge', 'POST'], ['/v1/verify', 'POST'], ['/v1/other', 'GET']]) { assert.equal((await call(p, m, undefined, { headers: { Origin: 'https://evil.example' } })).status, 403); assert.equal((await call(p, m, undefined, { headers: { Origin: '' } })).status, 403); }
  assert.equal((await call('/v1/challenge', 'OPTIONS')).status, 204); assert.equal((await call('/v1/challenge', 'OPTIONS', undefined, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call('/v1/status', 'GET', undefined, { headers: { Origin: 'https://me.github.io.evil.example' } })).status, 403);
  assert.equal((await call('/v1/status', 'GET', undefined, { headers: { Origin: 'https://me.github.io/' } })).status, 403); });
test('CORS header echoes only the allowed origin', async () => { const r = await call('/v1/status', 'GET'); assert.equal(r.headers.get('Access-Control-Allow-Origin'), OK); assert.equal(r.headers.get('Vary'), 'Origin'); });
test('right code returns a verifiable RS256 token: claim form=meeting, uid m_+16 chars, 10 minute lifetime, uid unrelated to the nonce', async () => {
  const c = await chal(); const r = await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code }); assert.equal(r.status, 200); const j = await r.json();
  const [h, b, s] = j.token.split('.'); const v = createVerify('RSA-SHA256'); v.update(h + '.' + b); assert.ok(v.verify(publicKey, Buffer.from(s, 'base64url')));
  const p = JSON.parse(Buffer.from(b, 'base64url')); assert.equal(p.iss, SA.client_email); assert.equal(p.sub, SA.client_email); assert.equal(p.claims.form, 'meeting'); assert.equal(p.uid, j.uid);
  assert.match(p.uid, /^m_[A-Za-z0-9_-]{16}$/); assert.equal(p.exp - p.iat, 600); assert.equal(JSON.parse(Buffer.from(h, 'base64url')).alg, 'RS256');
  assert.ok(!j.uid.includes(c.challenge.split('.')[0])); assert.match(p.uid, /^m_[A-Za-z0-9_-]{8,40}$/, 'must satisfy the rules regex'); });
test('F-02: the same solved challenge gives the SAME uid on another Worker instance (state reset), so the database allows one request only', async () => {
  const c = await chal(), body = { challenge: c.challenge, code: c.code };
  const a = await (await call('/v1/verify', 'POST', body)).json();
  _reset();                                                                    // another instance / a restart: the in-memory "used" mark is gone
  const r2 = await call('/v1/verify', 'POST', body); assert.equal(r2.status, 200); const b = await r2.json();
  assert.equal(a.uid, b.uid);
  const claim = t => JSON.parse(Buffer.from(t.split('.')[1], 'base64url')).uid; assert.equal(claim(a.token), claim(b.token)); });
test('F-02: on the same instance a solved challenge is still refused outright (the in-memory mark stays as a first line)', async () => {
  const c = await chal(), body = { challenge: c.challenge, code: c.code }; assert.equal((await call('/v1/verify', 'POST', body)).status, 200); assert.equal((await call('/v1/verify', 'POST', body)).status, 429); });
test('F-02: different challenges give different uids; the uid fits the rules shape and shows no trace of the nonce', async () => {
  const seen = new Set(); for (let i = 0; i < 25; i++) { const c = await chal({ ip: '10.0.0.' + i }); const j = await (await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code }, { ip: '10.0.0.' + i })).json();
    assert.match(j.uid, /^m_[A-Za-z0-9_-]{16}$/); assert.match(j.uid, /^m_[A-Za-z0-9_-]{8,40}$/); assert.ok(!j.uid.includes(c.challenge.split('.')[0])); seen.add(j.uid); }
  assert.equal(seen.size, 25); });
test('F-02: uidFor is stable for one (secret, nonce), differs with another secret or nonce, and is not the plain hash of the nonce', async () => {
  const s1 = 'test-secret-'.repeat(5), s2 = 'other-secret-'.repeat(5), n = 'AAAAAAAAAAAAAAAA';
  assert.equal(await uidFor(s1, n), await uidFor(s1, n)); assert.notEqual(await uidFor(s1, n), await uidFor(s2, n)); assert.notEqual(await uidFor(s1, n), await uidFor(s1, 'BBBBBBBBBBBBBBBB'));
  assert.notEqual(await uidFor(s1, n), 'm_' + Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(n))).toString('base64url').slice(0, 16)); });
test('two tokens never share a uid', async () => { const a = await (await solve({ ip: '2.2.2.2' })).json(), b = await (await solve({ ip: '3.3.3.3' })).json(); assert.notEqual(a.uid, b.uid); });
test('wrong code: 401 with attempts left; the third wrong try locks the challenge even for the right code', async () => {
  const c = await chal(), bad = c.code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 3; i++) { const r = await call('/v1/verify', 'POST', { challenge: c.challenge, code: bad }); assert.equal(r.status, 401); assert.equal((await r.json()).left, 2 - i); }
  assert.equal((await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code })).status, 429); });
test('a solved challenge cannot be solved again', async () => { const c = await chal(); assert.equal((await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code })).status, 200); assert.equal((await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code })).status, 429); });
test('tampered challenge (nonce, expiry, signature, extra part) is refused', async () => { const c = await chal(), [n, e, s] = c.challenge.split('.');
  const flip = x => (x[0] === 'A' ? 'B' : 'A') + x.slice(1);
  for (const ch of [[flip(n), e, s].join('.'), [n, String(Number(e) + 600000), s].join('.'), [n, e, flip(s)].join('.'), c.challenge + '.extra', [n, e].join('.'), '']) assert.equal((await call('/v1/verify', 'POST', { challenge: ch, code: c.code })).status, 400); });
test('expired challenge is refused', async () => { const real = Date.now; try { const c = await chal(); Date.now = () => real() + 6 * 60 * 1000; assert.equal((await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code })).status, 410); } finally { Date.now = real; } });
test('malformed bodies are refused (400/413), never a token', async () => { const c = await chal();
  for (const b of [{}, { challenge: c.challenge }, { code: '123456' }, { challenge: c.challenge, code: '12ab56' }, { challenge: c.challenge, code: 123456 }, { challenge: c.challenge, code: ['123456'] }, { challenge: [c.challenge], code: c.code }, 'not json', 'null', '[]'])
    assert.equal((await call('/v1/verify', 'POST', b)).status, 400);
  assert.equal((await call('/v1/verify', 'POST', 'x'.repeat(LIMITS.bodyMax + 1))).status, 413); });
test('wrong methods are 404', async () => { assert.equal((await call('/v1/challenge', 'GET')).status, 404); assert.equal((await call('/v1/verify', 'GET')).status, 404); assert.equal((await call('/v1/status', 'POST')).status, 404); assert.equal((await call('/nope', 'GET')).status, 404); });
test('per-visitor limit: the 9th challenge from one address in the window is refused, another address is not', async () => {
  for (let i = 0; i < LIMITS.ipChallenges; i++) assert.equal((await call('/v1/challenge', 'POST', undefined, { ip: '9.9.9.9' })).status, 200);
  assert.equal((await call('/v1/challenge', 'POST', undefined, { ip: '9.9.9.9' })).status, 429); assert.equal((await call('/v1/challenge', 'POST', undefined, { ip: '8.8.8.8' })).status, 200); });
test('per-visitor limit: the 4th token from one address in the window is refused', async () => {
  for (let i = 0; i < LIMITS.ipTokens; i++) assert.equal((await solve({ ip: '7.7.7.7' })).status, 200);
  assert.equal((await solve({ ip: '7.7.7.7' })).status, 429); assert.equal((await solve({ ip: '6.6.6.6' })).status, 200); });
test('per-visitor limit: many wrong codes from one address end in 429 even across different challenges', async () => { let last = 0;
  for (let i = 0; i < LIMITS.ipWrong + 2; i++) { const c = await chal({ ip: '5.5.5.' + (i % 2) }); } // different addresses for challenge creation so only the wrong-code counter is exercised
  for (let i = 0; i < 5; i++) { const c = await chal({ ip: '4.4.4.4' }); for (let k = 0; k < 3; k++) { last = (await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code === '000000' ? '111111' : '000000' }, { ip: '4.4.4.4' })).status; if (last === 429) break; } if (last === 429) break; }
  assert.equal(last, 429); });
test('window resets after ten minutes', async () => { const real = Date.now; try { for (let i = 0; i < LIMITS.ipChallenges; i++) await call('/v1/challenge', 'POST', undefined, { ip: '3.3.3.9' }); assert.equal((await call('/v1/challenge', 'POST', undefined, { ip: '3.3.3.9' })).status, 429);
  Date.now = () => real() + LIMITS.ipWindowMs + 1000; assert.equal((await call('/v1/challenge', 'POST', undefined, { ip: '3.3.3.9' })).status, 200); } finally { Date.now = real; } });
test('status: no guard document means open, switch off, cap 30', async () => { const j = await (await call('/v1/status', 'GET')).json(); assert.deepEqual({ ...j, day: undefined }, { ok: true, open: true, paused: false, tokenRequired: false, cap: 30, day: undefined, rl: false, turnstile: false }); assert.match(j.day, /^\d{8}$/); });
test('status reads pause, tokenRequired and cap from content/guard', async () => { guardStatus = 200; guardFields = { pause: { booleanValue: true }, tokenRequired: { booleanValue: true }, cap: { integerValue: '45' } };
  const j = await (await call('/v1/status', 'GET')).json(); assert.deepEqual({ ...j, day: undefined }, { ok: true, open: false, paused: true, tokenRequired: true, cap: 45, day: undefined, rl: false, turnstile: false }); });
test('pause: challenge and verify answer 503 and no token is issued', async () => { const c = await chal(); guardStatus = 200; guardFields = { pause: { booleanValue: true } }; _guardReset();
  assert.equal((await call('/v1/challenge', 'POST')).status, 503); assert.equal((await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code })).status, 503); });
function _guardReset() { _reset(); }
test('guard lookups are cached (one read per 20 seconds per instance)', async () => { await call('/v1/status', 'GET'); await call('/v1/status', 'GET'); await chal(); assert.equal(guardCalls, 1); });
test('if the guard cannot be read the Worker stays open (the rules enforce the pause anyway)', async () => { guardStatus = 'throw'; assert.equal((await call('/v1/challenge', 'POST')).status, 200); _reset(); guardStatus = 500; assert.equal((await call('/v1/challenge', 'POST')).status, 200); });
test('configuration problems answer 500 "config" and never leak details', async () => {
  for (const e of [{ ...env, CH_SECRET: 'short' }, { ...env, CH_SECRET: undefined }, { ...env, SA_JSON: 'not json' }, { ...env, SA_JSON: '{}' }, { ...env, SA_JSON: undefined }]) { _reset(); const r = await call('/v1/challenge', 'POST', undefined, {}, e); assert.equal(r.status, 500); assert.deepEqual(await r.json(), { error: 'config' }); } });
test('a broken private key answers 500 "sign" without a token', async () => { _reset(); const bad = { ...env, SA_JSON: JSON.stringify({ ...SA, private_key: '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----' }) }; const c = await (await call('/v1/challenge', 'POST', undefined, {}, bad)).json();
  const r = await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code }, {}, bad); assert.equal(r.status, 500); assert.equal((await r.json()).error, 'sign'); });
test('responses are never cached and carry nosniff', async () => { const r = await call('/v1/challenge', 'POST'); assert.equal(r.headers.get('Cache-Control'), 'no-store'); assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff'); });
test('no secret is echoed in any response body', async () => { const c = await chal(); const txt = await (await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code })).text() + JSON.stringify(c) + await (await call('/v1/status', 'GET')).text();
  for (const s of [env.CH_SECRET, SA.private_key.slice(40, 80)]) assert.ok(!txt.includes(s)); });
test('safeEq behaves', () => { assert.ok(safeEq('abc', 'abc')); assert.ok(!safeEq('abc', 'abd')); assert.ok(!safeEq('abc', 'abcd')); assert.ok(!safeEq('', 'a')); });
test('the key file text of this Worker contains no private key or token', async () => { const fs = await import('node:fs'); const t = fs.readFileSync(new URL('./portfolio-forms-worker.js', import.meta.url), 'utf8'); assert.ok(!/BEGIN (RSA )?PRIVATE KEY/.test(t)); assert.ok(!/"private_key"\s*:/.test(t)); });
test('F6: day is the Worker UTC date (status and verify), and utcDay handles month and year ends', async () => {
  const s = await (await call('/v1/status', 'GET')).json(); assert.equal(s.day, utcDay(Date.now()));
  const c = await chal(); const v = await (await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code })).json(); assert.equal(v.day, utcDay(Date.now()));
  assert.equal(utcDay(Date.UTC(2026, 11, 31, 23, 59, 59)), '20261231'); assert.equal(utcDay(Date.UTC(2027, 0, 1, 0, 0, 0)), '20270101'); assert.equal(utcDay(Date.UTC(2026, 1, 28, 12)), '20260228'); assert.equal(utcDay(Date.UTC(2026, 8, 5)), '20260905'); });

// ---- S2-B: Cloudflare rate limiter bindings (fake bindings; the real ones are configured in the dashboard)
const fake = (fn) => { const b = { calls: [], limit: async o => { b.calls.push(o.key); return fn ? fn(o.key, b.calls.length) : { success: true }; } }; return b; };
const withRl = (o = {}) => Object.assign({}, env, { RL_STATUS: fake(), RL_CHALLENGE: fake(), RL_VERIFY: fake() }, o);
test('RL: names match the checklist', () => assert.deepEqual(RL, { status: 'RL_STATUS', challenge: 'RL_CHALLENGE', verify: 'RL_VERIFY' }));
test('RL: without bindings everything works and status says rl:false', async () => { const r = await call('/v1/status', 'GET'); assert.equal((await r.json()).rl, false); assert.equal((await chal()).code.length, 6); });
test('RL: with all three bindings status says rl:true; each route uses its own binding, keyed by the visitor address', async () => {
  const e = withRl(); assert.equal((await (await call('/v1/status', 'GET', undefined, { ip: '9.9.9.9' }, e)).json()).rl, true);
  const c = await (await call('/v1/challenge', 'POST', undefined, { ip: '9.9.9.9' }, e)).json(); assert.equal((await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code }, { ip: '9.9.9.9' }, e)).status, 200);
  assert.deepEqual([e.RL_STATUS.calls, e.RL_CHALLENGE.calls, e.RL_VERIFY.calls], [['9.9.9.9'], ['9.9.9.9'], ['9.9.9.9']]); });
test('RL: a limited visitor gets 429 "slow" with Retry-After and the CORS header, on every limited route', async () => {
  for (const [name, path, method, body] of [['RL_STATUS', '/v1/status', 'GET'], ['RL_CHALLENGE', '/v1/challenge', 'POST'], ['RL_VERIFY', '/v1/verify', 'POST', { challenge: 'x', code: '123456' }]]) {
    const r = await call(path, method, body, { ip: '4.4.4.4' }, withRl({ [name]: fake(() => ({ success: false })) }));
    assert.equal(r.status, 429, path); assert.deepEqual(await r.json(), { error: 'slow' }); assert.equal(r.headers.get('Retry-After'), '60'); assert.equal(r.headers.get('Access-Control-Allow-Origin'), OK); } });
test('RL: only the limited visitor is blocked', async () => { const e = withRl({ RL_CHALLENGE: fake(k => ({ success: k !== '5.5.5.5' })) });
  assert.equal((await call('/v1/challenge', 'POST', undefined, { ip: '5.5.5.5' }, e)).status, 429); assert.equal((await call('/v1/challenge', 'POST', undefined, { ip: '6.6.6.6' }, e)).status, 200); });
test('RL: a blocked verify does not use up the challenge: the same challenge still works afterwards', async () => {
  const c = await chal({ ip: '7.7.7.7' }); const blocked = await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code }, { ip: '7.7.7.7' }, withRl({ RL_VERIFY: fake(() => ({ success: false })) }));
  assert.equal(blocked.status, 429); assert.equal((await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code }, { ip: '7.7.7.7' })).status, 200); });
test('RL: fails OPEN when a binding throws, returns nothing, or is missing; status then says rl:false', async () => {
  const boom = { limit: async () => { throw new Error('rl down'); } }, none = { limit: async () => undefined };
  assert.equal((await call('/v1/challenge', 'POST', undefined, {}, withRl({ RL_CHALLENGE: boom }))).status, 200); assert.equal((await call('/v1/challenge', 'POST', undefined, {}, withRl({ RL_CHALLENGE: none }))).status, 200);
  const e = withRl(); delete e.RL_VERIFY; assert.equal((await (await call('/v1/status', 'GET', undefined, {}, e)).json()).rl, false); assert.equal((await call('/v1/challenge', 'POST', undefined, {}, e)).status, 200); });
test('RL: refused origins, preflight and unknown paths never touch a binding', async () => { const e = withRl();
  await call('/v1/status', 'GET', undefined, { headers: { Origin: 'https://evil.example' } }, e); await call('/v1/challenge', 'OPTIONS', undefined, {}, e); await call('/v1/other', 'GET', undefined, {}, e);
  assert.deepEqual([e.RL_STATUS.calls.length, e.RL_CHALLENGE.calls.length, e.RL_VERIFY.calls.length], [0, 0, 0]); });
test('RL: an unknown visitor address is not rate limited by the binding (no shared bucket that could lock everyone out)', async () => { const e = withRl({ RL_CHALLENGE: fake(() => ({ success: false })) });
  const r = await worker.fetch(new Request('https://w.example/v1/challenge', { method: 'POST', headers: { Origin: OK } }), e); assert.equal(r.status, 200); assert.equal(e.RL_CHALLENGE.calls.length, 0); });
test('RL: the in-Worker limits still apply when the binding allows everything (9th challenge from one address)', async () => { const e = withRl(); let last;
  for (let i = 0; i < LIMITS.ipChallenges + 1; i++) last = await call('/v1/challenge', 'POST', undefined, { ip: '8.8.4.4' }, e); assert.equal(last.status, 429); });
