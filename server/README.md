# Marcus chat proxy (Cloudflare Worker)

Browsers can read anything a website sends them, so a webhook URL stored in the portfolio or in a
public Firestore document can be copied and abused (spam, cost, data scraping). This Worker hides it.

## Set up (about 10 minutes, free)
1. Create a free account at cloudflare.com > Workers & Pages > Create > Worker. Name it e.g. `marcus-chat`.
2. Edit the code, paste the whole of `chat-proxy-worker.js`, Deploy.
3. Worker > Settings > Variables and Secrets, add:
   - `UPSTREAM_URL` (type Secret) = your real n8n / Make webhook URL
   - `UPSTREAM_AUTH_HEADER` + `UPSTREAM_AUTH_VALUE` (Secret, optional) = a header your workflow checks, e.g. `X-Webhook-Token` and a long random value. In n8n/Make add a check that rejects requests without it.
   - `ALLOWED_ORIGINS` (Text) = `https://fredespinosa86app-jpg.github.io` (add your custom domain too, comma separated)
   - `MAX_PER_MINUTE` (Text, optional) = `8`
4. In Owner Panel > Marcus configuration paste the Worker address (`https://marcus-chat.<you>.workers.dev`) instead of the n8n/Make address and save.
5. For a hard rate limit add a Cloudflare Rate Limiting rule on the Worker route (the in-Worker limit is best effort).
6. Rotate (replace) the old n8n/Make webhook URL, because it was publicly readable until now.

## What it checks
POST only, allowed Origin only, JSON only, body size, message length, session id format, history size and roles; unknown fields are dropped; per-address rate limit; upstream timeout; the upstream URL and secret never reach the browser.
