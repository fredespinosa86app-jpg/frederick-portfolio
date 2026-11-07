# SE-E6 live test (4.5.0): Cloudflare Turnstile on the booking form

You already created the widget and put the secret into the Worker's settings (Settings > Variables and Secrets > `TURNSTILE_SECRET`). Never paste the secret anywhere else.

## Upload order (important)
1. Cloudflare > Workers > `portfolio-forms` > Edit code: replace the code with `server/portfolio-forms-worker.js` from the ZIP, then Deploy. (Safe on its own: the old page ignores the new field.)
2. Cloudflare > Turnstile > your widget > Hostnames: make sure `fredespinosa86app-jpg.github.io` is listed (add it if not).
3. Upload ALL files of the ZIP to GitHub (replace existing), commit, wait for Pages to finish.
4. Hard refresh the site (Ctrl+Shift+R).

## Live steps
1. Open your site, press F12 > Console and run: `fetch('https://portfolio-forms.fredespinosa86-app.workers.dev/v1/status').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))`. The text contains `"turnstile":true`. (Typing the address in the address bar shows `{"error":"origin"}` and a favicon 403: that is the Worker's origin rule working, not a fault.) Pass: yes / no
2. Open the site > Book a Discovery Call, pick a date and time, fill the form, press Send: a "Quick check" box appears with the Cloudflare check (usually it passes by itself). Pass: yes / no
3. After it passes, the request is sent and the thank-you appears. Pass: yes / no
4. The request arrives in the Owner Panel as usual. Pass: yes / no
5. Click "Use a six-digit code instead" on a second try: the code box appears, the code works. Pass: yes / no
6. Press Cancel in the box: nothing is sent, the form stays filled. Pass: yes / no
7. F12 > Console: no red "Content Security Policy" line mentioning cloudflare. Pass: yes / no
8. Open the page in a private window and on your phone: the check and the form work. Pass: yes / no
9. Keyboard only: Tab to the box, Enter on "Use a six-digit code instead" works. Pass: yes / no
10. Other pages (survey link, Owner Panel sign-in) still work as before. Pass: yes / no
11. Chatbot: ask two questions: scripted answers as before (no AI webhook is set, so no switch message appears). Pass: yes / no
12. Read the new paragraph "Spam check on the booking form" in the privacy notice and tell me if the wording is OK.

## If something fails
- Turnstile misbehaves: remove the line `turnstileSiteKey` from `scripts/settings.js` (commit); the page goes back to the six-digit code. Or delete `TURNSTILE_SECRET` in the Worker: it switches itself back (status says `"turnstile":false`).
- Everything else: restore the files from the rollback ZIP (and, if wanted, the previous Worker code).
- The rollback ZIP puts back the 15 changed files. Delete these four test files if you roll back (they only apply to SE-E6): `scripts/se6-guard.test.mjs`, `server/portfolio-forms-turnstile.test.mjs`, `rules-tests/browser/se6-1-turnstile.mjs`, `SE-E6-CHECKLIST.md`.

## Result (2026-11-07, owner's live test)
Steps 1-12 passed. Lesson: a wrong `TURNSTILE_SECRET` makes the Worker answer `503 tsdown` and the page falls back to the six-digit code; re-entering the secret (type Secret, Production) and redeploying fixed it.
