# SE-H1 live test (4.5.0): booking always needs the check, and daily budgets for anonymous writes

What changed in plain words
- The old "direct" booking route (no Cloudflare check) is gone from the rules for good. A booking always needs the Worker's check.
- Visitor analytics records (`visits`) and unanswered chatbot questions (`chatUnanswered`) now have a daily budget: 1500 visit records and 300 unanswered questions per UTC day. Over the budget the extra records are simply refused (the site keeps working).
- A booking date must be today or later (yesterday UTC is allowed because of time zones) and at most 366 days ahead.
- Owner Panel > Security shows the daily budgets and says verification is always on. The old on/off switch is gone.

## Publish order (important, do it in this order)
1. Upload ALL files of the ZIP to GitHub (replace existing), commit, wait for Pages, hard refresh (Ctrl+Shift+R). Safe on its own: the new page always uses the check, which the old rules also accept.
2. GitHub > Actions: wait for the "rules emulator" run on your commit. It must be GREEN. (I could not run the official emulator here; this is the real test of the new rules. If it is red, STOP and send me the red line. Do not publish the rules.)
3. Firebase console > Firestore > Rules: paste `firestore.rules.strict` (or `firestore.rules` if you still use the transition file) and Publish.
4. Do the live steps below.

## Live steps
1. Book a Discovery Call (pick a date and time, fill the form, pass the Cloudflare check): the thank-you appears and the request arrives in the Owner Panel. Pass: yes / no
2. Book for a date in the past is not possible in the calendar (greyed out). Pass: yes / no
3. Open the site in another tab and click through 3 sections, then wait a minute: Owner Panel > Analytics shows the visit. Pass: yes / no
4. Chatbot: ask a question it cannot answer (nonsense text): it still replies, and the question appears in the unanswered list. Pass: yes / no
5. Owner Panel > Security > "Form verification": it says verification is always on, there is no switch, and one line shows "visit records X of 1500; unanswered chat questions Y of 300". Pass: yes / no
6. F12 > Console on the site: no red `permission-denied` lines during normal use (one now and then under heavy simultaneous use is normal and is retried). Pass: yes / no

## Notes
- If two visitors write at the same instant, one write may be refused and retried up to 3 times; a rare lost analytics record is acceptable.
- Two small documents per day appear in the `anonCounters` collection (`v_YYYYMMDD`, `c_YYYYMMDD`). You may delete old ones in the Firebase console; only you can read them.
- To change a budget: Firebase console > `content` > `guard` > add a number field `visitCap` or `chatCap`. 0 closes that kind for the day.

## If something fails (rollback)
1. Firebase console: publish your previous rules file again (the old rules still accept the new page).
2. Restore the old site files from the rollback ZIP and delete: `scripts/core-anon.js`, `scripts/core-anon.test.mjs`, `rules-tests/attack/mutations_h1.py`, `rules-tests/browser/seh1-1-token-only-and-budgets.mjs`, `rules-tests/emulator/anon-budget-h1.test.mjs`, `SE-H1-CHECKLIST.md`.

## Result
(to fill in after your live test)
