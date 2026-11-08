# Cloudflare security checklist (2026-11-08): two-step verification and protections note

No site, Worker, rules or database change in this step. Nothing to upload. These are actions in your own Cloudflare account. Never send recovery codes, passwords or keys to anyone, including me.

## Part 1: two-step verification on your Cloudflare login
1. Check that your Cloudflare email address is verified (Cloudflare warns you can lock yourself out otherwise). If you signed up with Google or Apple login, first set a Cloudflare password with "Forgot password". Done: yes / no
2. Open Cloudflare, then My Profile, then Authentication. Done: yes / no
3. Under Two-Factor Authentication, add **Mobile App Authentication**: scan the QR code with an authenticator app, enter the 6-digit code and your password. Done: yes / no
4. Add a **second method** (Cloudflare recommends at least two): a security key or built-in fingerprint / Windows Hello if you have one, otherwise **Email Authentication**. Done: yes / no
5. When Cloudflare shows the **recovery (backup) codes**, save them in your password manager (each works once). Done: yes / no
6. Test: sign out of Cloudflare, sign in again; it must ask for a code. Pass: yes / no
7. The Authentication page lists your methods. Pass: yes / no

If you ever lose your phone: use a recovery code, then register a new authenticator. Regenerating codes (Manage, then Regenerate) cancels the old ones.

## Part 2: rate-limit rule for the form Worker (decision: option A)
- Step 0 result (owner, 2026-11-08): the Cloudflare account lists NO website/domain. Cloudflare's WAF rate-limiting rules belong to a domain, so the rule is not available for the `workers.dev` address of `portfolio-forms`.
- Decision: **option A**, accept the existing protections and write them down (`CF-PROTECTIONS-AND-LIMITS.md` in the private documents). No rule is created.
- Reopen when: you buy a custom domain (then one free WAF rate-limit rule can be added; this ties to SE-E2), or the Worker's request count keeps rising.

### What to watch (owner, now and then, 2 minutes)
8. Cloudflare dashboard, Workers & Pages, `portfolio-forms`, Metrics: look at the requests per day. Note the highest day: ______. The free plan stops at 100,000 requests a day (resets at midnight UTC). If a day passes about 20,000, tell me. Done: yes / no

## Result
(owner to fill in after the steps) Part 1 passed: yes / no. Date: ______
