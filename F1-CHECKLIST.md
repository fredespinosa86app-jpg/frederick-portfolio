# F-01 checklist: Turnstile first (about 10 minutes)

What changed: when Cloudflare's "are you a person" check (Turnstile) is on, the Worker no longer accepts the six-digit code from anyone.
The code is allowed only when the Worker itself could not reach Cloudflare to check (it then hands the page a short-lived signed "backup pass"),
or when you switch the emergency setting on. A visitor whose browser blocks the check sees a plain message and an "Email me instead" button.

Files for the website (upload first): `index.html`, `scripts/form-guard.js`, `scripts/meeting-form.js`.
File for Cloudflare (paste second): `server/portfolio-forms-worker.js`.
The other files in the ZIP are tests and notes for the repository.

## Part 1 - website files first (order matters)
1. In GitHub upload the website files and the other files from the ZIP (keep folder names), commit, wait 1-2 minutes, hard refresh (Ctrl+Shift+R).
2. Open the meeting form and send one real test request. It should work exactly as before (the Cloudflare check box appears and passes).

## Part 2 - the Worker second
3. Cloudflare > Workers & Pages > `portfolio-forms` > **Edit code**. Select all, paste the full new `server/portfolio-forms-worker.js`, click **Deploy**.
4. Check Settings > Variables and Secrets still lists SA_JSON, CH_SECRET, ALLOWED_ORIGINS and TURNSTILE_SECRET. Do not change them. Do not paste them anywhere.
5. Open the website in a normal window (hard refresh), fill the meeting form and send one real request. It should arrive in the dashboard.
6. Look at the form: the button "Use a six-digit code instead" should NOT appear next to the Cloudflare check box any more.

## Part 3 - blocked-check test (optional but recommended, 3 minutes)
7. In Chrome open the site, press F12, open the **Network** tab, find the box "Network request blocking" (three dots menu > More tools > Network request blocking), add `challenges.cloudflare.com`, then reload the page with the F12 window still open.
8. Fill the meeting form and press Send. You should see: "The safety check could not run in this browser. Please allow it for this site or try another browser, or email me instead." and an "Email me instead" button. There must be no six-digit code box.
9. Remove the blocking entry (or close F12) and reload. The form works again.

## Part 4 - emergency switch (optional, 3 minutes; know it exists)
10. Cloudflare > `portfolio-forms` > Settings > Variables and Secrets > Add variable: name `CODE_FALLBACK`, value `on` (type Text). Deploy.
11. Reload the site: the "Use a six-digit code instead" button is back. (This is the old behavior, for use only if Turnstile ever breaks.)
12. Delete the `CODE_FALLBACK` variable and Deploy to return to strict mode. Reload and confirm the button is gone.

## If something fails
- Worker problem: in Cloudflare paste the old Worker file from the rollback ZIP and Deploy (the website files keep working with the old Worker).
- Website problem: upload the 3 old website files from the rollback ZIP.
- Visitors blocked by their browser and you want them back quickly: add `CODE_FALLBACK = on` (Part 4) instead of rolling back.
- Tell me which step failed.
