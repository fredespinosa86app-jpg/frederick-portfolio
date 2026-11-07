# SE-E5: how to get an outside review (owner checklist, plain words)

What you have: `SECURITY-REVIEW-PACK.md` (give this to the reviewer). I can prepare the review, but I cannot do or certify it. Only another person or a scanner can.

## Part 1: free scans of the live site (about 20 minutes, no account needed)
Run each on `https://fredespinosa86app-jpg.github.io/frederick-portfolio/` and save a screenshot.
1. Mozilla Observatory (developer.mozilla.org, search "HTTP Observatory"): expect missing headers. Pass for us means: no "script from other site without a rule" and no mixed-content warning.
2. SSL Labs (ssllabs.com/ssltest): this tests GitHub's certificate, not ours. A normal result is A or A+.
3. securityheaders.com: expect a low grade. That is the **known limit**: GitHub Pages cannot send real security headers (item SE-E2, only if you move your domain to Cloudflare). Not a new finding.
4. Write down anything that is NOT about missing headers and send it to me.

Rule: scans are fine; do not run anything that floods the site.

## Part 2: a person you trust (optional but the real value)
1. Choose one person (a developer friend, a security-minded colleague). Ask for permission to share; do not pick a stranger.
2. Agree a time window (for example one weekend) and tell them your time zone (Asia/Manila).
3. Send them ONLY `SECURITY-REVIEW-PACK.md` (and the project ZIP if they want to read the code). Never send passwords, your Cloudflare or Google logins, or the Turnstile secret. They do not need any of those.
4. Ask them to follow section 2 (scope) and section 7 (how to report). Reports go to the e-mail in `security.txt`.
5. Keep a copy of what they tested and when.

## Part 3: a second pair of eyes on the rules
1. Ask the reviewer to read section 6 of the pack (the Firestore rules) and answer one question: "Can a stranger read or change anything private?"
2. Their answer, yes or no with reasons, goes into the fix table in section 8.
3. The rules include your account ID (not a password; the Security page shows it too). That is fine to share with a reviewer.

## Part 4: confirm which rules file is published (2 minutes)
1. Firebase console > Firestore > Rules: is the first line `// STRICT OWNER MODE`? If yes, `firestore.rules.strict` is live. If not, the transition file is live (it also accepts your e-mail).
2. Tell me which one it is, so I can note it in the pack.

## When a finding arrives
1. Do not panic and do not reply publicly.
2. Forward it to me; I will say how serious it is and propose a fix as its own item (layout first, then approved build with tests).
3. After the fix, ask the reporter to try again, then write the date in the table.
4. If private data may have been exposed, follow `INCIDENT-CHECKLIST.md` first.

## Before you hand the pack out
- `.well-known/security.txt` now lists your e-mail address (`frederickespinosa.onlinejob@gmail.com`, the one already on the site) and the booking form. If you prefer another address, tell me and I will change it. Upload the new `security.txt` and `.well-known/security.txt` files.
- Check the pack still matches the rules: after any rules change I rebuild it (`node tools/review-pack.mjs`); a test fails if it is out of date.
