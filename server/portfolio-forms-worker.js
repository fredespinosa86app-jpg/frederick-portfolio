/* Portfolio form-verification Worker  (CodeFlow Portfolio 4.5.0, Project F / F5).  Cloudflare Workers, Free plan.
   It does ONE job: after a visitor passes a small challenge, it signs a short-lived Firebase custom token. The page signs in with that
   token and writes the meeting request straight to Firestore; the Firestore rules (firestore.rules.strict) require the token, allow one
   request per token, and enforce the daily cap. The Worker never reads or writes your leads and never sees the form text.

   HONEST LIMITS: the six-digit code is shown to the page, so a script can read it. It is a speed bump, not a CAPTCHA. The real limits are
   the per-visitor throttles below (kept per Worker instance, approximate), the single-use token, and the daily cap in the rules (exact).
   (F-02) A solved challenge can be redeemed only once in the DATABASE: the token's uid is derived from the challenge, and the rules allow one request per uid.

   Settings (Worker > Settings > Variables and Secrets):
     SA_JSON              Secret  the whole JSON key of the role-less service account "portfolio-form-signer". Never put it in a file or in chat.
     CH_SECRET            Secret  long random text (40+ characters) that signs challenges and derives the codes.
     ALLOWED_ORIGINS      Text    comma list of page origins, e.g. https://fredespinosa86app-jpg.github.io  (no path, no trailing slash)
     FIREBASE_PROJECT_ID  Text    optional; default is read from the service-account key (project_id). Used only to read content/guard.
     TURNSTILE_SECRET     Secret  (SE-E6) the secret key of your Cloudflare Turnstile widget. Optional: when it is not set the Worker behaves exactly as before
                                  (six-digit code only). When it is set, the page proves it is not a bot with Turnstile and /v1/verify checks the token with
                                  Cloudflare (siteverify) before signing the Firebase token. Never put it in a file or in chat.
   Rate limiter bindings (S2-B, optional; Worker > Settings > Bindings > Add > Rate limiter). Names and values:
     RL_STATUS     limit 30  per 60 seconds   (namespace ID 1001)
     RL_CHALLENGE  limit 5   per 60 seconds   (namespace ID 1002)
     RL_VERIFY     limit 10  per 60 seconds   (namespace ID 1003)
     Keyed by the visitor address. Counts are per Cloudflare location and approximate; a missing binding or an error FAILS OPEN so the form never
     breaks, and the in-Worker limits below plus the daily cap in the rules still apply. GET /v1/status reports `rl: true` when all three are bound.
   Endpoints (all need an allowed Origin header):  GET /v1/status   POST /v1/challenge   POST /v1/verify
   (SE-E6) With TURNSTILE_SECRET set: /v1/verify accepts {challenge, ts} (Turnstile token) or the old {challenge, code}.
     ts valid (success, hostname is one of ALLOWED_ORIGINS, action "meeting") -> token. ts refused -> 400 {error:'turnstile'}.
     Cloudflare unreachable / 5xx / secret misconfigured -> 503 {error:'tsdown'}: the page then shows the six-digit code (the try is not used up).
     (F-01) Turnstile first: with TURNSTILE_SECRET set, a code request is refused (400 {error:'needts'}) unless it carries `fb`, a signed backup pass that the
     Worker returns inside the 503 tsdown answer (only when IT could not check Turnstile; valid 3 minutes, one challenge, any instance), or the owner set
     the text setting CODE_FALLBACK = on (emergency switch: the old behaviour; delete it to go back to strict). The tighter code limits below still apply.
     GET /v1/status adds turnstile:true/false and codeFallback:true/false (false = the page must not offer the code).
   (F6: status and verify also return `day`, the Worker's UTC date as YYYYMMDD.)          */
const enc = new TextEncoder();
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uStr = s => b64u(enc.encode(s));
export const LIMITS = {
  challengeMs: 5 * 60 * 1000,      // a challenge is valid for 5 minutes
  tokenS: 600,                     // a custom token is valid for 10 minutes (sign-in must happen within that time)
  maxTries: 3,                     // wrong codes allowed per challenge
  ipWindowMs: 10 * 60 * 1000,      // per-visitor window
  ipChallenges: 8,                 // challenges per visitor address per window
  ipTokens: 3,                     // tokens per visitor address per window (one token = one request)
  ipWrong: 12,                     // wrong codes per visitor address per window
  bodyMax: 2048,
  bodyMaxTs: 4096,                 // (SE-E6) with Turnstile on: a Turnstile token can be up to 2048 characters
  fbMs: 3 * 60 * 1000,             // (F-01) a backup pass (code allowed although Turnstile is on) lives 3 minutes
  tsMax: 2048,                     // longest accepted Turnstile token
  tsTimeoutMs: 4000,               // how long the Worker waits for Cloudflare before it falls back to the code
  ipTokensCode: 2,                 // tokens per visitor address per window on the CODE path while Turnstile is on (the normal limit is ipTokens)
  ipWrongCode: 6,                  // wrong codes per visitor address per window on the CODE path while Turnstile is on (the normal limit is ipWrong)
  guardCacheMs: 20 * 1000,
  mapMax: 2000
};
export const RL = { status: 'RL_STATUS', challenge: 'RL_CHALLENGE', verify: 'RL_VERIFY' };
const rlBound = env => Object.values(RL).every(n => env[n] && typeof env[n].limit === 'function');
/* true = allowed. Fails OPEN on a missing binding, an error, or an unknown address (a shared 'unknown' bucket could lock everyone out). */
async function rateOk(env, name, ip) {
  const b = env[name]; if (!b || typeof b.limit !== 'function' || !ip || ip === 'unknown') return true;
  try { const r = await b.limit({ key: ip }); return !r || r.success !== false; } catch (e) { return true; }
}
const slow = h => J(429, { error: 'slow' }, Object.assign({}, h, { 'Retry-After': '60' }));
const AUD = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const triesByNonce = new Map(), byIp = new Map();      // per Worker instance (best effort; resets when the instance restarts)
let guardCache = { at: 0, v: null }, keyCache = null, saCache = null;
export function _reset() { triesByNonce.clear(); byIp.clear(); guardCache = { at: 0, v: null }; keyCache = null; saCache = null; }

export function safeEq(a, b) {
  a = String(a); b = String(b); let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
export async function codeFor(secret, nonce, exp) {
  const h = await hmac(secret, 'code|' + nonce + '|' + exp);
  return String((((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0) % 1000000).padStart(6, '0');
}
const chalSig = async (secret, nonce, exp) => b64u(await hmac(secret, 'chal|' + nonce + '|' + exp));
// UTC calendar day as YYYYMMDD from the Worker's clock. The page uses it for the request's day field and the counter's document ID,
// so a visitor whose own clock is wrong cannot break the daily counter (the rules compare it with Firestore's server time).
export const utcDay = ms => { const d = new Date(ms); return String(d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()); };
const randId = n => b64u(crypto.getRandomValues(new Uint8Array(n)));
/* (F-02) The token's uid is derived from the challenge (HMAC with CH_SECRET), not random. The Firestore rules allow ONE request per uid (the request's document ID
   must equal the token's uid and it can only be created once), so a challenge that is solved again, on another Worker instance or after a restart, gets the
   SAME uid and the database refuses the second request. Shape: 'm_' + 16 URL-safe characters (the rules need ^m_[A-Za-z0-9_-]{8,40}$). Not linkable to the
   challenge without CH_SECRET. */
export async function uidFor(secret, nonce) { return 'm_' + b64u((await hmac(secret, 'uid|' + nonce)).slice(0, 12)); }
function pemToDer(pem) { const s = atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')); return Uint8Array.from(s, c => c.charCodeAt(0)); }
// The service-account key is parsed and imported once per instance, not on every request.
function loadSa(env) {
  if (saCache) return saCache;
  let sa; try { sa = JSON.parse(env.SA_JSON); } catch (e) { return null; }
  if (!sa || typeof sa.client_email !== 'string' || typeof sa.private_key !== 'string' || !sa.client_email.includes('@')) return null;
  saCache = sa; return sa;
}
async function signKey(sa) {
  if (!keyCache) keyCache = crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']).catch(e => { keyCache = null; throw e; });
  return keyCache;
}
export async function customToken(sa, uid, claims, nowS) {
  const head = b64uStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64uStr(JSON.stringify({ iss: sa.client_email, sub: sa.client_email, aud: AUD, iat: nowS, exp: nowS + LIMITS.tokenS, uid, claims }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await signKey(sa), enc.encode(head + '.' + body));
  return head + '.' + body + '.' + b64u(sig);
}
function corsHeaders(env, req) {
  const o = req.headers.get('Origin') || '', ok = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return o && ok.includes(o) ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Max-Age': '600', 'Vary': 'Origin' } : null;
}
const J = (status, obj, h = {}) => new Response(JSON.stringify(obj), { status, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, h) });
// per-visitor counters: kind -> count inside a sliding window
function hit(ip, kind, max, nowMs) {
  let e = byIp.get(ip);
  if (!e || nowMs - e.t0 > LIMITS.ipWindowMs) { e = { t0: nowMs, c: 0, t: 0, w: 0, tc: 0 }; byIp.set(ip, e); if (byIp.size > LIMITS.mapMax) byIp.delete(byIp.keys().next().value); }
  e[kind]++; return e[kind] <= max;
}
/* ---------- (SE-E6) Cloudflare Turnstile ---------- */
export const TS_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TS_ACTION = 'meeting';
const tsEnabled = env => typeof env.TURNSTILE_SECRET === 'string' && env.TURNSTILE_SECRET.length >= 10;
const allowedHosts = env => { const out = new Set(); for (const o of String(env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean)) { try { out.add(new URL(o).hostname); } catch (e) { /* ignore a bad entry */ } } return out; };
/* (F-01) With Turnstile on, the six-digit code is refused unless (a) the owner set CODE_FALLBACK=on (emergency switch), or (b) the request carries a signed
   backup pass for THIS challenge. The Worker hands out a pass only when it could not check Turnstile itself (Cloudflare unreachable / 5xx / bad secret),
   so a script cannot ask for one. A pass is HMAC(CH_SECRET, nonce + expiry): valid on every Worker instance, 3 minutes, one challenge. */
const codeFallbackOn = env => String(env.CODE_FALLBACK || '').trim().toLowerCase() === 'on';
const fbSig = async (secret, nonce, exp) => b64u(await hmac(secret, 'fb|' + nonce + '|' + exp));
export async function fbPass(secret, nonce, nowMs) { const exp = nowMs + LIMITS.fbMs; return exp + '.' + await fbSig(secret, nonce, exp); }
export async function fbValid(secret, nonce, pass, nowMs) {
  if (typeof pass !== 'string' || pass.length > 80) return false;
  const [exp, sig, extra] = pass.split('.'); if (extra !== undefined || !/^\d{13}$/.test(exp || '') || !sig) return false;
  if (nowMs > Number(exp) || Number(exp) > nowMs + LIMITS.fbMs + 1000) return false;
  return safeEq(sig, await fbSig(secret, nonce, exp));
}
/* -> { ok:true, hostname, action } | { invalid:true } (Cloudflare refused the token) | { down:true } (could not be checked: network, timeout, 5xx, bad secret) */
async function turnstileVerify(env, token, ip) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), LIMITS.tsTimeoutMs);
  try {
    const body = { secret: String(env.TURNSTILE_SECRET), response: token, idempotency_key: crypto.randomUUID() };
    if (ip && ip !== 'unknown') body.remoteip = ip;
    const r = await fetch(TS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    if (r.status >= 500) return { down: true };
    let j; try { j = await r.json(); } catch (e) { return { down: true }; }
    if (j && j.success === true) return { ok: true, hostname: String(j.hostname || ''), action: String(j.action || '') };
    const codes = Array.isArray(j && j['error-codes']) ? j['error-codes'] : [];
    if (codes.some(c => c === 'internal-error' || c === 'invalid-input-secret' || c === 'missing-input-secret' || c === 'bad-request')) return { down: true };   // our side or Cloudflare's, not the visitor's: fall back to the code
    return { invalid: true };
  } catch (e) { return { down: true }; }
  finally { clearTimeout(timer); }
}
// Read content/guard (public read in the rules) so the page can see a pause and the Worker can refuse early. Fails OPEN: the rules enforce the pause anyway.
async function readGuard(env, nowMs) {
  if (guardCache.v && nowMs - guardCache.at < LIMITS.guardCacheMs) return guardCache.v;
  const sa = loadSa(env), pid = String(env.FIREBASE_PROJECT_ID || (sa && sa.project_id) || '');
  let v = { paused: false, tokenRequired: false, cap: 30, known: false };
  if (/^[a-z0-9-]{4,40}$/.test(pid)) {
    try {
      const r = await fetch('https://firestore.googleapis.com/v1/projects/' + pid + '/databases/(default)/documents/content/guard', { headers: { Accept: 'application/json' } });
      if (r.status === 404) v = { paused: false, tokenRequired: false, cap: 30, known: true };
      else if (r.ok) {
        const f = (await r.json()).fields || {}, c = f.cap && (f.cap.integerValue ?? f.cap.doubleValue);
        v = { paused: !!(f.pause && f.pause.booleanValue === true), tokenRequired: !!(f.tokenRequired && f.tokenRequired.booleanValue === true), cap: c != null && Number.isFinite(Number(c)) ? Number(c) : 30, known: true };
      }
    } catch (e) { /* keep the open defaults */ }
  }
  guardCache = { at: nowMs, v }; return v;
}
export default {
  async fetch(req, env) {
    const url = new URL(req.url), h = corsHeaders(env, req), p = url.pathname.replace(/\/+$/, '');
    if (req.method === 'OPTIONS') return h ? new Response(null, { status: 204, headers: h }) : J(403, { error: 'origin' });
    if (!h) return J(403, { error: 'origin' });
    const nowMs = Date.now(), nowS = Math.floor(nowMs / 1000), ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    if (!env.CH_SECRET || String(env.CH_SECRET).length < 32 || !loadSa(env)) return J(500, { error: 'config' }, h);
    if (p === '/v1/status' && req.method === 'GET') {
      if (!await rateOk(env, RL.status, ip)) return slow(h);
      const g = await readGuard(env, nowMs);
      return J(200, { ok: true, open: !g.paused, paused: g.paused, tokenRequired: g.tokenRequired, cap: g.cap, day: utcDay(nowMs), rl: rlBound(env), turnstile: tsEnabled(env), codeFallback: !tsEnabled(env) || codeFallbackOn(env) }, h);
    }
    if (p === '/v1/challenge' && req.method === 'POST') {
      if (!await rateOk(env, RL.challenge, ip)) return slow(h);
      if (!hit(ip, 'c', LIMITS.ipChallenges, nowMs)) return J(429, { error: 'slow' }, h);
      const g = await readGuard(env, nowMs); if (g.paused) return J(503, { error: 'paused' }, h);
      const nonce = randId(12), exp = nowMs + LIMITS.challengeMs;
      return J(200, { challenge: nonce + '.' + exp + '.' + await chalSig(env.CH_SECRET, nonce, exp), code: await codeFor(env.CH_SECRET, nonce, exp), expiresInS: LIMITS.challengeMs / 1000 }, h);
    }
    if (p === '/v1/verify' && req.method === 'POST') {
      if (!await rateOk(env, RL.verify, ip)) return slow(h);
      const tsOn = tsEnabled(env);
      const raw = await req.text(); if (raw.length > (tsOn ? LIMITS.bodyMaxTs : LIMITS.bodyMax)) return J(413, { error: 'big' }, h);
      let b; try { b = JSON.parse(raw); } catch (e) { return J(400, { error: 'bad' }, h); }
      const useTs = tsOn && !!b && typeof b === 'object' && b.ts !== undefined;      // the visitor's page sent a Turnstile token
      if (!b || typeof b !== 'object' || typeof b.challenge !== 'string') return J(400, { error: 'bad' }, h);
      if (useTs) { if (typeof b.ts !== 'string' || !b.ts || b.ts.length > LIMITS.tsMax) return J(400, { error: 'bad' }, h); }
      else if (typeof b.code !== 'string' || !/^\d{6}$/.test(b.code)) return J(400, { error: 'bad' }, h);
      const [nonce, exp, sig, extra] = b.challenge.split('.');
      if (extra !== undefined || !/^[A-Za-z0-9_-]{16}$/.test(nonce || '') || !/^\d{13}$/.test(exp || '') || !sig) return J(400, { error: 'bad' }, h);
      if (!safeEq(sig, await chalSig(env.CH_SECRET, nonce, exp))) return J(400, { error: 'bad' }, h);
      if (nowMs > Number(exp)) return J(410, { error: 'expired' }, h);
      if (!useTs && tsOn && !codeFallbackOn(env) && !await fbValid(env.CH_SECRET, nonce, b.fb, nowMs)) return J(400, { error: 'needts' }, h);   // (F-01) Turnstile first: no code without a backup pass
      const g = await readGuard(env, nowMs); if (g.paused) return J(503, { error: 'paused' }, h);
      const n = (triesByNonce.get(nonce) || 0) + 1; triesByNonce.set(nonce, n); if (triesByNonce.size > LIMITS.mapMax) triesByNonce.delete(triesByNonce.keys().next().value);
      if (n > LIMITS.maxTries) return J(429, { error: 'tries' }, h);
      if (useTs) {
        const v = await turnstileVerify(env, b.ts, ip);
        if (v.down) { triesByNonce.set(nonce, n - 1); return J(503, { error: 'tsdown', fb: await fbPass(env.CH_SECRET, nonce, nowMs) }, h); }        // could not be checked: the page falls back to the code, this try is not used up
        if (!v.ok || v.action !== TS_ACTION || !allowedHosts(env).has(v.hostname)) {
          if (!hit(ip, 'w', LIMITS.ipWrong, nowMs)) return J(429, { error: 'slow' }, h);
          return J(400, { error: 'turnstile' }, h);
        }
        if (!hit(ip, 't', LIMITS.ipTokens, nowMs)) return J(429, { error: 'slow' }, h);
      } else {
        if (!safeEq(b.code, await codeFor(env.CH_SECRET, nonce, exp))) {
          if (!hit(ip, 'w', tsOn ? LIMITS.ipWrongCode : LIMITS.ipWrong, nowMs)) return J(429, { error: 'slow' }, h);
          return J(401, { error: 'code', left: LIMITS.maxTries - n }, h);
        }
        if (!hit(ip, tsOn ? 'tc' : 't', tsOn ? LIMITS.ipTokensCode : LIMITS.ipTokens, nowMs)) return J(429, { error: 'slow' }, h);
      }
      triesByNonce.set(nonce, LIMITS.maxTries);                         // a solved challenge cannot be solved again on this instance
      const uid = await uidFor(env.CH_SECRET, nonce);                   // (F-02) same challenge -> same uid -> one request in the database, on every Worker instance
      let token; try { token = await customToken(loadSa(env), uid, { form: 'meeting' }, nowS); } catch (e) { return J(500, { error: 'sign' }, h); }
      return J(200, { token, uid, expiresInS: LIMITS.tokenS, day: utcDay(nowMs) }, h);
    }
    return J(404, { error: 'not found' }, h);
  }
};
