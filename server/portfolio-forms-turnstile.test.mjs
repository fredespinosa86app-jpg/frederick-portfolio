// SE-E6 Part A: Cloudflare Turnstile in the forms Worker.  Run:  node --test server/portfolio-forms-turnstile.test.mjs
// Cloudflare is replaced by a fake (never contacted); the service account is a throwaway in-memory key.
import test, { beforeEach } from 'node:test'; import assert from 'node:assert/strict'; import { generateKeyPairSync } from 'node:crypto';
import worker, { LIMITS, _reset, TS_URL, TS_ACTION, fbPass, fbValid } from './portfolio-forms-worker.js';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { client_email: 'portfolio-form-signer@demo-proj.iam.gserviceaccount.com', project_id: 'demo-proj', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const SECRET = '1x0000000000000000000000000000000AA';          // Cloudflare's published always-pass TEST secret shape; not a real secret
const base = { SA_JSON: JSON.stringify(SA), CH_SECRET: 'test-secret-'.repeat(5), ALLOWED_ORIGINS: 'https://me.github.io,https://www.example.com' };
const env = Object.assign({}, base, { TURNSTILE_SECRET: SECRET });
const OK = 'https://me.github.io';
let ts, guardFields, guardStatus, logs;
const realFetch = globalThis.fetch, realLog = console.log, realErr = console.error, realWarn = console.warn;
beforeEach(() => {
  _reset(); guardFields = null; guardStatus = 404; logs = 0;
  ts = { mode: 'ok', hostname: 'me.github.io', action: TS_ACTION, calls: [] };
  console.log = console.error = console.warn = () => { logs++; };
  globalThis.fetch = async (u, init) => {
    if (String(u) === TS_URL) {
      ts.calls.push({ init, body: JSON.parse(init.body) });
      if (ts.mode === 'throw') throw new Error('net');
      if (ts.mode === 'hang') return new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
      if (ts.mode === '500') return new Response('oops', { status: 500 });
      if (ts.mode === 'html') return new Response('<html>', { status: 200 });
      const codes = { invalid: ['invalid-input-response'], dup: ['timeout-or-duplicate'], internal: ['internal-error'], badsecret: ['invalid-input-secret'], badreq: ['bad-request'] };
      if (codes[ts.mode]) return new Response(JSON.stringify({ success: false, 'error-codes': codes[ts.mode] }), { status: 200 });
      return new Response(JSON.stringify({ success: true, hostname: ts.hostname, action: ts.action, challenge_ts: new Date().toISOString() }), { status: 200 });
    }
    assert.match(String(u), /^https:\/\/firestore\.googleapis\.com\/v1\/projects\/demo-proj\/databases\/\(default\)\/documents\/content\/guard$/);
    return guardStatus === 200 ? new Response(JSON.stringify({ fields: guardFields }), { status: 200 }) : new Response('{}', { status: guardStatus });
  };
});
test.after(() => { globalThis.fetch = realFetch; console.log = realLog; console.error = realErr; console.warn = realWarn; });
const call = (path, method = 'POST', body, o = {}, e = env) => worker.fetch(new Request('https://w.example' + path, { method, headers: Object.assign({ Origin: OK, 'Content-Type': 'application/json', 'CF-Connecting-IP': o.ip || '1.1.1.1' }, o.headers || {}), body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }), e);
const chal = async o => (await call('/v1/challenge', 'POST', undefined, o)).json();
const TOKEN = 'XXXX.DUMMY.TURNSTILE.TOKEN.' + 'a'.repeat(300);
const viaTs = async (o, tok) => { const c = await chal(o); return { c, r: await call('/v1/verify', 'POST', { challenge: c.challenge, ts: tok === undefined ? TOKEN : tok }, o) }; };
const bad = c => (c.code === '000000' ? '111111' : '000000');
const allBodies = [];

test('status: turnstile is reported true only when a secret of a sane length is set', async () => {
  assert.equal((await (await call('/v1/status', 'GET')).json()).turnstile, true);
  for (const e of [base, { ...base, TURNSTILE_SECRET: '' }, { ...base, TURNSTILE_SECRET: 'short' }, { ...base, TURNSTILE_SECRET: 123456789012 }]) assert.equal((await (await call('/v1/status', 'GET', undefined, {}, e)).json()).turnstile, false);
});
test('no secret set: the Worker behaves as before, a ts field is ignored and the code is still required', async () => {
  const c = await chal({}); const r = await call('/v1/verify', 'POST', { challenge: c.challenge, ts: TOKEN }, {}, base); assert.equal(r.status, 400); assert.deepEqual(await r.json(), { error: 'bad' }); assert.equal(ts.calls.length, 0);
  const ok = await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code }, {}, base); assert.equal(ok.status, 200); assert.equal(ts.calls.length, 0);
});
test('valid Turnstile token: 200 and a Firebase token with the same claims as the code path; Cloudflare asked once with secret, token, address and a unique key', async () => {
  const { r } = await viaTs({}); assert.equal(r.status, 200); const j = await r.json(); assert.match(j.uid, /^m_[A-Za-z0-9_-]{16}$/); assert.equal(j.expiresInS, 600); assert.match(j.day, /^\d{8}$/);
  const p = JSON.parse(Buffer.from(j.token.split('.')[1], 'base64url')); assert.equal(p.claims.form, 'meeting'); assert.equal(p.uid, j.uid); assert.equal(Object.keys(p.claims).length, 1);
  assert.equal(ts.calls.length, 1); const c0 = ts.calls[0]; assert.equal(c0.init.method, 'POST'); assert.equal(c0.body.secret, SECRET); assert.equal(c0.body.response, TOKEN); assert.equal(c0.body.remoteip, '1.1.1.1'); assert.match(c0.body.idempotency_key, /^[0-9a-f-]{36}$/);
  const { r: r2 } = await viaTs({ ip: '4.4.4.4' }); assert.equal(r2.status, 200); assert.notEqual(ts.calls[1].body.idempotency_key, c0.body.idempotency_key);
});
test('remoteip is left out when the visitor address is unknown', async () => { const { r } = await viaTs({ ip: 'unknown' }); assert.equal(r.status, 200); assert.equal('remoteip' in ts.calls[0].body, false); });
test('Cloudflare refuses the token (invalid, duplicate/expired): 400 turnstile, never a token', async () => {
  for (const mode of ['invalid', 'dup']) { _reset(); ts.mode = mode; const { r } = await viaTs({}); assert.equal(r.status, 400, mode); const j = await r.json(); assert.deepEqual(j, { error: 'turnstile' }); }
});
test('wrong hostname or wrong action is refused even if Cloudflare says success; the second allowed origin is accepted', async () => {
  for (const [hostname, action, want] of [['evil.example', 'meeting', 400], ['me.github.io.evil.example', 'meeting', 400], ['', 'meeting', 400], ['me.github.io', 'login', 400], ['me.github.io', '', 400], ['me.github.io', 'MEETING', 400], ['www.example.com', 'meeting', 200], ['me.github.io', 'meeting', 200]]) {
    _reset(); ts.hostname = hostname; ts.action = action; const { r } = await viaTs({}); assert.equal(r.status, want, hostname + '|' + action); if (want === 400) assert.deepEqual(await r.json(), { error: 'turnstile' });
  }
});
test('Cloudflare cannot be checked (network, 500, not JSON, internal error, wrong secret, malformed, timeout): 503 tsdown and the try is NOT used up', async () => {
  const real = LIMITS.tsTimeoutMs; LIMITS.tsTimeoutMs = 40;
  try {
    for (const mode of ['throw', '500', 'html', 'internal', 'badsecret', 'badreq', 'hang']) {
      _reset(); ts.mode = mode; const c = await chal({}); const t0 = Date.now(); const passes = [];
      for (let i = 0; i < 4; i++) { const r = await call('/v1/verify', 'POST', { challenge: c.challenge, ts: TOKEN }, {}); assert.equal(r.status, 503, mode + ' #' + i); const j = await r.json(); assert.equal(j.error, 'tsdown'); assert.match(j.fb, /^\d{13}\.[A-Za-z0-9_-]+$/); passes.push(j.fb); }   // 4 > maxTries 3: proves the try is refunded
      assert.ok(Date.now() - t0 < 2000, mode + ' answered within the timeout');
      const strict = await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code }, {}); assert.equal(strict.status, 400, mode + ': the code alone is refused (F-01)'); assert.deepEqual(await strict.json(), { error: 'needts' });
      const ok = await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code, fb: passes[0] }, {}); assert.equal(ok.status, 200, mode + ' then the code works with the backup pass');
    }
  } finally { LIMITS.tsTimeoutMs = real; }
});
test('with the emergency switch CODE_FALLBACK=on the code path is open but tighter: 2 tokens then slow, 6 wrong codes then slow', async () => {
  const envOn = Object.assign({}, env, { CODE_FALLBACK: 'on' });
  const ok = async ip => { const c = await chal({ ip }); return call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code }, { ip }, envOn); };
  assert.equal((await ok('7.7.7.7')).status, 200); assert.equal((await ok('7.7.7.7')).status, 200); const third = await ok('7.7.7.7'); assert.equal(third.status, 429); assert.deepEqual(await third.json(), { error: 'slow' });
  let wrong = 0; for (let k = 0; k < 3; k++) { const c = await chal({ ip: '8.8.8.8' }); for (let i = 0; i < 3 && wrong < 7; i++) { const r = await call('/v1/verify', 'POST', { challenge: c.challenge, code: bad(c) }, { ip: '8.8.8.8' }, envOn); wrong++; assert.equal(r.status, wrong <= 6 ? 401 : 429, 'wrong #' + wrong); } }
  assert.equal(wrong, 7);
  assert.equal(LIMITS.ipTokensCode < LIMITS.ipTokens && LIMITS.ipWrongCode < LIMITS.ipWrong, true, 'never weaker than the normal limits');
});
test('without Turnstile the code path keeps its normal limits (3 tokens per address)', async () => {
  const ok = async () => { const c = await chal({ ip: '9.9.9.9' }); return call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code }, { ip: '9.9.9.9' }, base); };
  for (let i = 0; i < 3; i++) assert.equal((await ok()).status, 200); assert.equal((await ok()).status, 429);
});
test('Turnstile path limits: 3 tokens per address, refused tokens count as wrong tries (12) and per challenge (3)', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await viaTs({ ip: '5.5.5.5' })).r.status, 200); assert.equal((await viaTs({ ip: '5.5.5.5' })).r.status, 429);
  _reset(); ts.mode = 'invalid'; const c = await chal({ ip: '6.6.6.6' });
  for (let i = 0; i < 3; i++) assert.equal((await call('/v1/verify', 'POST', { challenge: c.challenge, ts: TOKEN }, { ip: '6.6.6.6' })).status, 400);
  const t = await call('/v1/verify', 'POST', { challenge: c.challenge, ts: TOKEN }, { ip: '6.6.6.6' }); assert.equal(t.status, 429); assert.deepEqual(await t.json(), { error: 'tries' });
  _reset(); let n = 0; const seen = [];
  for (let k = 0; k < 5 && n < LIMITS.ipWrong + 1; k++) { const cc = await chal({ ip: '6.6.6.7' }); for (let i = 0; i < 3 && n < LIMITS.ipWrong + 1; i++) { n++; const r = await call('/v1/verify', 'POST', { challenge: cc.challenge, ts: TOKEN }, { ip: '6.6.6.7' }); seen.push(r.status); } }
  assert.deepEqual(seen, [...Array(LIMITS.ipWrong).fill(400), 429], 'twelve refused tokens, then the visitor address is slowed down');
});
test('a challenge solved with Turnstile cannot be used again, by token or by code', async () => {
  const { c, r } = await viaTs({}); assert.equal(r.status, 200);
  assert.equal((await call('/v1/verify', 'POST', { challenge: c.challenge, ts: TOKEN })).status, 429); assert.equal((await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code }, {}, Object.assign({}, env, { CODE_FALLBACK: 'on' }))).status, 429);
});
test('cheap refusals never reach Cloudflare: tampered/expired challenge, pause, bad body, rate limiter', async () => {
  const c = await chal({}); const [n, e, s] = c.challenge.split('.');
  for (const ch of [[n, e, (s[0] === 'A' ? 'B' : 'A') + s.slice(1)].join('.'), c.challenge + '.x', 'junk', '']) assert.equal((await call('/v1/verify', 'POST', { challenge: ch, ts: TOKEN })).status, 400);
  for (const body of [{ challenge: c.challenge, ts: 123 }, { challenge: c.challenge, ts: '' }, { challenge: c.challenge, ts: 'x'.repeat(LIMITS.tsMax + 1) }, { challenge: 5, ts: TOKEN }, '[]', 'not json']) assert.equal((await call('/v1/verify', 'POST', body)).status, 400);
  assert.equal((await call('/v1/verify', 'POST', 'x'.repeat(LIMITS.bodyMaxTs + 1))).status, 413);
  const real = Date.now; try { Date.now = () => real() + 6 * 60 * 1000; assert.equal((await call('/v1/verify', 'POST', { challenge: c.challenge, ts: TOKEN })).status, 410); } finally { Date.now = real; }
  _reset(); guardStatus = 200; guardFields = { pause: { booleanValue: true } }; const c2 = await chal({ ip: '1.2.3.4' }).catch(() => null);
  const c3 = c; const r = await call('/v1/verify', 'POST', { challenge: c3.challenge, ts: TOKEN }, { ip: '1.2.3.4' }); assert.equal(r.status, 503); assert.deepEqual(await r.json(), { error: 'paused' });
  assert.equal(ts.calls.length, 0, 'Cloudflare was not called for any of these');
  const slowEnv = { ...env, RL_STATUS: { limit: async () => ({ success: true }) }, RL_CHALLENGE: { limit: async () => ({ success: true }) }, RL_VERIFY: { limit: async () => ({ success: false }) } };
  const rr = await call('/v1/verify', 'POST', { challenge: c.challenge, ts: TOKEN }, {}, slowEnv); assert.equal(rr.status, 429); assert.equal(ts.calls.length, 0);
});
test('a long Turnstile token (2048 characters) fits the body limit', async () => { const { r } = await viaTs({}, 'T'.repeat(LIMITS.tsMax)); assert.equal(r.status, 200); assert.equal(ts.calls[0].body.response.length, LIMITS.tsMax); });
test('the secret never appears in any response body or header, and nothing is logged', async () => {
  const seen = []; const grab = async r => { seen.push(JSON.stringify([...r.headers]) + await r.clone().text()); return r; };
  await grab(await call('/v1/status', 'GET')); await grab((await viaTs({})).r); ts.mode = 'invalid'; await grab((await viaTs({ ip: '3.3.3.3' })).r); ts.mode = 'throw'; await grab((await viaTs({ ip: '3.3.3.4' })).r); ts.mode = 'internal'; await grab((await viaTs({ ip: '3.3.3.5' })).r);
  for (const t of seen) { assert.ok(!t.includes(SECRET), 'secret leaked'); assert.ok(!/error-codes|invalid-input|internal-error/.test(t), 'Cloudflare details leaked'); }
  assert.equal(logs, 0, 'the Worker must not log');
});
test('origin rules are unchanged for the new field: an unlisted origin is refused before anything else', async () => {
  const c = await chal({}); const r = await call('/v1/verify', 'POST', { challenge: c.challenge, ts: TOKEN }, { headers: { Origin: 'https://evil.example' } }); assert.equal(r.status, 403); assert.equal(ts.calls.length, 0);
});

/* ---------- F-01: Turnstile first ---------- */
test('F-01: with Turnstile on, a code request without a backup pass is refused (400 needts), whatever the code; no try is used up, no token, no Cloudflare call', async () => {
  const c = await chal({}); for (let i = 0; i < 6; i++) { const r = await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code }, {}); assert.equal(r.status, 400); assert.deepEqual(await r.json(), { error: 'needts' }); }
  assert.equal(ts.calls.length, 0);
  const viaTsNow = await call('/v1/verify', 'POST', { challenge: c.challenge, ts: TOKEN }, {}); assert.equal(viaTsNow.status, 200, 'the challenge is still fresh: refused code tries burned nothing');
});
test('F-01: status says codeFallback false while Turnstile is on and strict; true with the switch; true when Turnstile is not set up', async () => {
  assert.equal((await (await call('/v1/status', 'GET')).json()).codeFallback, false);
  assert.equal((await (await call('/v1/status', 'GET', undefined, {}, Object.assign({}, env, { CODE_FALLBACK: 'on' }))).json()).codeFallback, true);
  assert.equal((await (await call('/v1/status', 'GET', undefined, {}, base)).json()).codeFallback, true);
  for (const v of ['off', '', 'true', '1', 'ON ', 'yes']) { const j = await (await call('/v1/status', 'GET', undefined, {}, Object.assign({}, env, { CODE_FALLBACK: v }))).json(); assert.equal(j.codeFallback, v.trim().toLowerCase() === 'on', JSON.stringify(v)); }
});
test('F-01: CODE_FALLBACK=on brings back the old behaviour (code works without a pass); Turnstile not set up is unchanged', async () => {
  const c = await chal({ ip: '5.5.5.5' }); assert.equal((await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code }, { ip: '5.5.5.5' }, Object.assign({}, env, { CODE_FALLBACK: 'on' }))).status, 200);
  const d = await chal({ ip: '5.5.5.6' }); assert.equal((await call('/v1/verify', 'POST', { challenge: d.challenge, code: d.code }, { ip: '5.5.5.6' }, base)).status, 200);
});
test('F-01: the backup pass is valid only for its own challenge, for 3 minutes, and cannot be forged or changed', async () => {
  const S = env.CH_SECRET, now = Date.now(), nonce = 'AAAAAAAAAAAAAAAA', other = 'BBBBBBBBBBBBBBBB';
  const pass = await fbPass(S, nonce, now);
  assert.equal(await fbValid(S, nonce, pass, now), true); assert.equal(await fbValid(S, nonce, pass, now + LIMITS.fbMs - 1000), true);
  assert.equal(await fbValid(S, nonce, pass, now + LIMITS.fbMs + 1), false, 'expired');
  assert.equal(await fbValid(S, other, pass, now), false, 'other challenge');
  assert.equal(await fbValid('x'.repeat(40), nonce, pass, now), false, 'other secret');
  const [exp, sig] = pass.split('.'); assert.equal(await fbValid(S, nonce, (Number(exp) + 60000) + '.' + sig, now), false, 'longer life asked');
  assert.equal(await fbValid(S, nonce, exp + '.' + (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1), now), false, 'sig changed');
  for (const junk of [undefined, null, 5, '', '.', 'a.b', exp, exp + '.', '.' + sig, pass + '.x', 'x'.repeat(200)]) assert.equal(await fbValid(S, nonce, junk, now), false, String(junk));
});
test('F-01: the pass is handed out only when Cloudflare could not be checked, never when the visitor failed the check; a pass for another challenge or an old one is refused', async () => {
  ts.mode = 'invalid'; const a = await chal({}); const r1 = await call('/v1/verify', 'POST', { challenge: a.challenge, ts: TOKEN }, {}); assert.equal(r1.status, 400); assert.deepEqual(await r1.json(), { error: 'turnstile' });
  _reset(); ts.mode = '500'; const c = await chal({}), d = await chal({ ip: '2.2.2.2' });
  const down = await (await call('/v1/verify', 'POST', { challenge: c.challenge, ts: TOKEN }, {})).json(); assert.equal(down.error, 'tsdown'); assert.ok(down.fb);
  const wrongChal = await call('/v1/verify', 'POST', { challenge: d.challenge, code: d.code, fb: down.fb }, { ip: '2.2.2.2' }); assert.equal(wrongChal.status, 400);
  assert.equal((await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code, fb: 123 }, {})).status, 400);
  assert.equal((await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code, fb: down.fb }, {})).status, 200);
});
test('F-01: a backup pass works on another Worker instance (state reset) and a second use gives the same uid (F-02)', async () => {
  ts.mode = '500'; const c = await chal({}); const down = await (await call('/v1/verify', 'POST', { challenge: c.challenge, ts: TOKEN }, {})).json();
  const a = await (await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code, fb: down.fb }, {})).json(); _reset();
  const r = await call('/v1/verify', 'POST', { challenge: c.challenge, code: c.code, fb: down.fb }, {}); assert.equal(r.status, 200); assert.equal((await r.json()).uid, a.uid);
});
test('F-01: wrong codes with a valid pass still count (401 with tries left) and the code limits per address still apply', async () => {
  ts.mode = '500'; const c = await chal({}); const down = await (await call('/v1/verify', 'POST', { challenge: c.challenge, ts: TOKEN }, {})).json();
  const r = await call('/v1/verify', 'POST', { challenge: c.challenge, code: bad(c), fb: down.fb }, {}); assert.equal(r.status, 401); assert.equal((await r.json()).left, 2);
});
