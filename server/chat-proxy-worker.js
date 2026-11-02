/* ==========================================================================
   Marcus chat proxy - Cloudflare Worker (free plan is enough)
   Why: the portfolio runs in the visitor's browser, so any webhook address placed in it can be
   read and called by anyone. This Worker keeps the real n8n / Make webhook URL (and any secret
   header) in encrypted Worker secrets, checks every request, rate-limits it, and only then
   forwards a cleaned-up copy. The portfolio is given the Worker address instead.

   Secrets / variables (Cloudflare dashboard > Worker > Settings > Variables):
     UPSTREAM_URL          secret   your real n8n / Make webhook URL
     UPSTREAM_AUTH_HEADER  secret   optional header name, e.g. X-Webhook-Token
     UPSTREAM_AUTH_VALUE   secret   optional header value (the shared secret your workflow checks)
     ALLOWED_ORIGINS       text     comma list, e.g. https://fredespinosa86app-jpg.github.io,https://example.com
     MAX_PER_MINUTE        text     optional, default 8 requests per visitor address per minute
   ========================================================================== */
const MAX_BODY = 6000, MAX_MSG = 300, MAX_HIST = 10, MAX_HIST_MSG = 600;
const hits = new Map();   // per Worker instance: visitor address -> recent timestamps (best effort; use Cloudflare rate-limit rules for a hard limit)

export function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid body' };
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > MAX_MSG) return { error: 'Invalid message' };
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 40) : '';
  if (!/^[a-z0-9]{1,40}$/i.test(sessionId)) return { error: 'Invalid session' };
  const history = (Array.isArray(body.history) ? body.history : []).slice(-MAX_HIST)
    .filter(h => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
    .map(h => ({ role: h.role, content: h.content.slice(0, MAX_HIST_MSG) }));
  const page = typeof body.page === 'string' ? body.page.slice(0, 200) : '';
  return { value: { message, sessionId, history, page } };   // unknown fields are dropped
}

function limited(ip, max) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 60000) hits.delete(k);
  return arr.length > max;
}

export default {
  async fetch(request, env) {
    const origins = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin') || '';
    const allowed = origins.includes(origin);
    const cors = allowed ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : { 'Vary': 'Origin' };
    const reply = (status, obj, extra) => new Response(JSON.stringify(obj), { status, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors, extra) });

    if (request.method === 'OPTIONS') {
      return allowed ? new Response(null, { status: 204, headers: Object.assign({ 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' }, cors) }) : new Response(null, { status: 403 });
    }
    if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' }, { Allow: 'POST' });
    if (!allowed) return reply(403, { error: 'Origin not allowed' });
    if (!env.UPSTREAM_URL) return reply(500, { error: 'Not configured' });
    if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) return reply(415, { error: 'JSON required' });
    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > MAX_BODY) return reply(413, { error: 'Too large' });

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (limited(ip, Math.max(1, Number(env.MAX_PER_MINUTE) || 8))) return reply(429, { error: 'Too many requests' }, { 'Retry-After': '30' });

    let text; try { text = await request.text(); } catch (e) { return reply(400, { error: 'Bad request' }); }
    if (text.length > MAX_BODY) return reply(413, { error: 'Too large' });
    let body; try { body = JSON.parse(text); } catch (e) { return reply(400, { error: 'Bad JSON' }); }
    const v = validate(body); if (v.error) return reply(400, { error: v.error });

    const headers = { 'Content-Type': 'application/json' };
    if (env.UPSTREAM_AUTH_HEADER && env.UPSTREAM_AUTH_VALUE) headers[env.UPSTREAM_AUTH_HEADER] = env.UPSTREAM_AUTH_VALUE;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 14000);
    try {
      const up = await fetch(env.UPSTREAM_URL, { method: 'POST', headers, body: JSON.stringify(v.value), signal: ctl.signal });
      if (!up.ok) return reply(502, { error: 'Upstream error' });
      const out = (await up.text()).slice(0, 8000);
      return new Response(out, { status: 200, headers: Object.assign({ 'Content-Type': up.headers.get('Content-Type') || 'text/plain', 'Cache-Control': 'no-store' }, cors) });
    } catch (e) { return reply(504, { error: 'Upstream timeout' }); }
    finally { clearTimeout(timer); }
  }
};
