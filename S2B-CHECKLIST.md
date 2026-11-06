# S2-B checklist: rate limit for the portfolio-forms Worker (live test)

No Firestore rules change and no page change. This is Worker-only: three Rate limiter bindings in the dashboard plus the updated Worker code. Your secrets (SA_JSON, CH_SECRET, ALLOWED_ORIGINS) stay as they are; pasting new code does not remove them. Do the steps in this order.

## A. Add three Rate limiter bindings
Cloudflare > Workers & Pages > `portfolio-forms` > Settings > Bindings > **Add binding** > **Rate limiter**. Add each one exactly like this (Namespace ID must be a positive whole number that is unique in your account; if 1001 to 1003 are taken, use other numbers):

| Variable name | Namespace ID | Limit | Period |
|---|---|---|---|
| `RL_STATUS` | 1001 | 30 | 60 seconds |
| `RL_CHALLENGE` | 1002 | 5 | 60 seconds |
| `RL_VERIFY` | 1003 | 10 | 60 seconds |

If the form shows different field names, tell me what it shows before continuing. Done: yes / no

## B. Paste the new Worker code
1. Workers & Pages > `portfolio-forms` > **Edit code**. Select all, paste the whole of `server/portfolio-forms-worker.js` from the ZIP, **Deploy**. Done: yes / no
2. Settings > Variables and Secrets still lists SA_JSON, CH_SECRET and ALLOWED_ORIGINS. Pass: yes / no

## C. Check that the limiter is active
3. Open your portfolio in the browser, press F12 > Console, paste this and press Enter:
   `fetch('https://portfolio-forms.fredespinosa86-app.workers.dev/v1/status').then(r=>r.json()).then(console.log)`
   The result should contain **"rl": true**. If it says false, one of the three bindings is missing or has a different variable name. Pass: yes / no
4. Send a real test Discovery Call request (with form verification ON if you use it): it still works. Pass: yes / no

## D. Check that the limit bites (optional, harmless)
5. In the same console paste this (45 status checks in a row):
   `(async()=>{const u='https://portfolio-forms.fredespinosa86-app.workers.dev/v1/status';const c={};for(let i=0;i<45;i++){const r=await fetch(u);c[r.status]=(c[r.status]||0)+1}console.log(c)})()`
   Expect about 30 answers of 200 and the rest 429. The count is approximate and per Cloudflare location, so it can be a few more or less, or the first 429 can arrive a moment late. Result: ____
6. Wait one minute and run step 3 again: it answers normally. Pass: yes / no

## E. Watch it (optional)
7. Workers & Pages > `portfolio-forms` > Observability: 429 responses show there when someone is limited.

## Good to know
- A limit hit shows visitors "Too many attempts from your connection. Please wait a few minutes, or email me instead." A real visitor needs at most about 3 challenges, 9 verify calls and 4 status checks a minute, far below the limits.
- If Cloudflare's limiter is down or a binding is missing, the Worker lets requests through (it never breaks the form); the built-in limits and the daily cap in the rules still apply.
- Everyone behind one shared address (for example an office) shares a counter. The limits are generous enough for that.
- Counts are approximate by design (Cloudflare documents this). This is a speed bump for abuse, not an exact quota.

Rollback: Settings > Bindings > delete the three bindings (the new code works without them), or paste the previous Worker code from `CodeFlow-Portfolio-4.5.0-S2-B-rollback.zip`.
