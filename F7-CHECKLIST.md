# F7 checklist: switch-over, rollback drill, monitoring

Do these in order. Stop at any step that does not match and tell Claude what you saw. Nothing here needs new files, except the docs in this ZIP.

## A. Before you start
1. Take a backup: Owner Panel > Backup > export (all boxes ticked, including `reqCounters`). Keep the file.
2. Open `https://portfolio-forms.fredespinosa86-app.workers.dev/v1/status` from the live site console (or use the Security page "Check now"): must say `ok: true`, `open: true`, `paused: false`.
3. Firebase > Firestore > Rules: the published rules must contain `visitorTok` (that is `firestore.rules.strict`).
4. Owner Panel > Security > Form verification: daily limit 30.
5. Safari: owner decision recorded (recorded in the private KNOWN-ISSUES, "Safari"). Go live without Safari verification; the "Email me instead" button is the safety net.

## B. Switch ON
1. Owner Panel > Security > Form verification > turn the switch ON and confirm.
2. Open the live page in a private window WITHOUT `?verify=1`, go to Schedule, fill the form, press Send.
3. A "Quick check" box must appear. Type the code. The request must arrive in the inbox.
4. Today's count on the Security page goes up by 1.
5. Delete the new `m_` user in Firebase Authentication.

## C. Rollback drill (do it once on purpose)
1. Security page: turn the switch OFF.
2. Private window, same page: send a request. No Quick check box appears; it arrives in the inbox (old direct path).
3. Turn the switch ON again and repeat B.2 and B.3.
4. Delete the test `m_` user. Leave the switch ON.

If the page or the Worker misbehaves later: turn the switch OFF (instant), then tell Claude.

## D. Done when
B and C both passed, the switch is ON, and the two test inbox entries were removed or marked done.
