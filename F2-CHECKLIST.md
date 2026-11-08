# F-02 checklist: one solved challenge, one request (about 5 minutes)

What changed: the Cloudflare Worker `portfolio-forms` now makes the visitor's token ID from the challenge (using the Worker's secret key) instead of a random one.
Your database rules already allow only one request per token ID, so the same challenge can never produce two requests, on any Worker copy.
Visitors notice nothing. No new secret, no setting, no database rules change, no website file change.

Only file to deploy: `server/portfolio-forms-worker.js`. (The other files in the ZIP are tests and notes for the repository.)

1. In GitHub, upload the files from the ZIP (keep the folder names) and commit.
2. Open Cloudflare, then Workers & Pages, then `portfolio-forms`, then **Edit code**.
3. Select all the old code, paste the full contents of the new `server/portfolio-forms-worker.js`, click **Deploy**.
4. Check the Worker still shows your three settings (SA_JSON, CH_SECRET, ALLOWED_ORIGINS) under Settings > Variables and Secrets. Do not change them. Do not paste them anywhere.
5. Open your website in a normal window, go to the meeting form, fill it in, and send one real test request. It should send as before, with the Turnstile check passing.
6. Open the dashboard and confirm the test request arrived.
7. Optional: send a second request right after. It should also work (it uses a new challenge).

If something fails: in Cloudflare **Edit code**, paste the old file from the rollback ZIP and Deploy again. Tell me which step failed.
