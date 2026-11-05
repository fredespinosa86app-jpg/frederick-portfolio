# F6 owner checklist (5 actions, in this order)

The switch stays OFF. Visitors see no change until F7.

1. **Update the Worker.** Cloudflare > Workers & Pages > `portfolio-forms` > Edit code > replace everything with `server/portfolio-forms-worker.js` from this ZIP > Deploy. Secrets stay as they are. Check in your portfolio's browser Console: `fetch('https://portfolio-forms.fredespinosa86-app.workers.dev/v1/status').then(r=>r.json()).then(console.log)` must now include `day: "2026...."`.
2. **Upload the F6 files to GitHub** (same way as before; the whole ZIP is fine) and hard-refresh your site (Ctrl+F5).
3. **Live test of the new path (the key proof).** Open `https://fredespinosa86app-jpg.github.io/frederick-portfolio/?verify=1#schedule`, fill the form, press Send. A "Quick check" box with a six-digit code must appear. Type the code, press Confirm. The request must arrive in your inbox. In Firebase Console > Authentication > Users there must be ONE new user whose ID starts with `m_`; delete it afterwards. If anything differs, send me a screenshot of the message.
4. **Old path unchanged.** Open the same page WITHOUT `?verify=1`, send a test request: it must behave exactly as before (no Quick check box).
5. **Owner Security page:** open Owner Panel > Security > Form verification. Check the daily limit shows 30 and today's count. Change the limit to 31 and back to 30. **Do not turn verification ON.**

Also try once: turn your device offline, press Send on the `?verify=1` page: you must get a plain message and an "Email me instead" button.

Rollback: upload the files from `CodeFlow-Portfolio-4.5.0-F6-rollback.zip` (previous page files).
