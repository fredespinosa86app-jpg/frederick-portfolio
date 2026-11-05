/* Portfolio form-verification Worker  (CodeFlow Portfolio 4.5.0, Project F / F5).  Cloudflare Workers, Free plan.
   It does ONE job: after a visitor passes a small challenge, it signs a short-lived Firebase custom token. The page signs in with that
   token and writes the meeting request straight to Firestore; the Firestore rules (firestore.rules.strict) require the token, allow one
   request per token, and enforce the daily cap. The Worker never reads or writes your leads and never sees the form text.

   HONEST LIMITS: the six-digit code is shown to the page, so a script can read it. It is a speed bump, not a CAPTCHA. The real limits are
   the per-visitor throttles below (kept per Worker instance, approximate), the single-use token, and the daily cap in the rules (exact).

   Settings (Worker > Settings > Variables and Secrets):
     SA_JSON              Secret  the whole JSON key of the role-less service account "portfolio-form-signer". Never put it in a file or in chat.
     CH_SECRET            Secret  long random text (40+ characters) that signs challenges and derives the codes.
     ALLOWED_ORIGINS      Text    comma list of page origins, e.g. https://fredespinosa86app-jpg.github.io  (no path, no trailing slash)
     FIREBASE_PROJECT_ID  Text    optional; default is read from the service-account key (project_id). Used only to read content/guard.
   Endpoints (all need an allowed Origin header):  GET /v1/status   POST /v1/challenge   POST /v1/verify
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
  guardCacheMs: 20 * 1000,
  mapMax: 2000
};
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
  if (!e || nowMs - e.t0 > LIMITS.ipWindowMs) { e = { t0: nowMs, c: 0, t: 0, w: 0 }; byIp.set(ip, e); if (byIp.size > LIMITS.mapMax) byIp.delete(byIp.keys().next().value); }
  e[kind]++; return e[kind] <= max;
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
      const g = await readGuard(env, nowMs);
      return J(200, { ok: true, open: !g.paused, paused: g.paused, tokenRequired: g.tokenRequired, cap: g.cap, day: utcDay(nowMs) }, h);
    }
    if (p === '/v1/challenge' && req.method === 'POST') {
      if (!hit(ip, 'c', LIMITS.ipChallenges, nowMs)) return J(429, { error: 'slow' }, h);
      const g = await readGuard(env, nowMs); if (g.paused) return J(503, { error: 'paused' }, h);
      const nonce = randId(12), exp = nowMs + LIMITS.challengeMs;
      return J(200, { challenge: nonce + '.' + exp + '.' + await chalSig(env.CH_SECRET, nonce, exp), code: await codeFor(env.CH_SECRET, nonce, exp), expiresInS: LIMITS.challengeMs / 1000 }, h);
    }
    if (p === '/v1/verify' && req.method === 'POST') {
      const raw = await req.text(); if (raw.length > LIMITS.bodyMax) return J(413, { error: 'big' }, h);
      let b; try { b = JSON.parse(raw); } catch (e) { return J(400, { error: 'bad' }, h); }
      if (!b || typeof b !== 'object' || typeof b.challenge !== 'string' || typeof b.code !== 'string' || !/^\d{6}$/.test(b.code)) return J(400, { error: 'bad' }, h);
      const [nonce, exp, sig, extra] = b.challenge.split('.');
      if (extra !== undefined || !/^[A-Za-z0-9_-]{16}$/.test(nonce || '') || !/^\d{13}$/.test(exp || '') || !sig) return J(400, { error: 'bad' }, h);
      if (!safeEq(sig, await chalSig(env.CH_SECRET, nonce, exp))) return J(400, { error: 'bad' }, h);
      if (nowMs > Number(exp)) return J(410, { error: 'expired' }, h);
      const g = await readGuard(env, nowMs); if (g.paused) return J(503, { error: 'paused' }, h);
      const n = (triesByNonce.get(nonce) || 0) + 1; triesByNonce.set(nonce, n); if (triesByNonce.size > LIMITS.mapMax) triesByNonce.delete(triesByNonce.keys().next().value);
      if (n > LIMITS.maxTries) return J(429, { error: 'tries' }, h);
      if (!safeEq(b.code, await codeFor(env.CH_SECRET, nonce, exp))) {
        if (!hit(ip, 'w', LIMITS.ipWrong, nowMs)) return J(429, { error: 'slow' }, h);
        return J(401, { error: 'code', left: LIMITS.maxTries - n }, h);
      }
      if (!hit(ip, 't', LIMITS.ipTokens, nowMs)) return J(429, { error: 'slow' }, h);
      triesByNonce.set(nonce, LIMITS.maxTries);                         // a solved challenge cannot be solved again on this instance
      const uid = 'm_' + randId(12);                                    // 'm_' + 16 random URL-safe characters; unrelated to the challenge
      let token; try { token = await customToken(loadSa(env), uid, { form: 'meeting' }, nowS); } catch (e) { return J(500, { error: 'sign' }, h); }
      return J(200, { token, uid, expiresInS: LIMITS.tokenS, day: utcDay(nowMs) }, h);
    }
    return J(404, { error: 'not found' }, h);
  }
};
