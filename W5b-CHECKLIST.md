# W5b checklist: break schedules, lateness and flicker (live test)

This phase changes the Firestore rules. Order matters: install, publish the rules, then test.

## A. Install
1. Upload the changed files to GitHub (the ZIP lists them) and wait for GitHub Pages.
2. Firebase console > Firestore Database > Rules: paste the whole of **`firestore.rules.strict`** and press **Publish**.
3. Hard-refresh the site (Ctrl+Shift+R), sign in again.
   If the card later says "The database refused this", the rules were not published: repeat step 2.

## B. Live checks
1. Owner Panel > WorkTrack: a card **Break schedules** shows a Default row and one row per active Client ID, a search box, and "Showing x of y clients". Pass: yes / no
2. In the Default row set **Lunch to 2** (leave the others), press Save. A green message appears and the row says "Own schedule · version 1". Pass: yes / no
3. Type 241, then -1, then abc in a minutes box and press Save: each is refused with a message and nothing is saved. Pass: yes / no
4. Clock in (add a client if you like), then press **Lunch out** (after step 2). The clock and the page say "Lunch: 01:5x left · Default schedule (2 min)". Pass: yes / no
5. Wait. About 1 minute in the text turns amber. At 2:00 it says **"Lunch: late by 00:01"** and the **Lunch in** button pulses (red outline) on the page AND on the floating clock. Pass: yes / no
6. Press Tab to the pulsing button: keyboard focus stays on it (it does not jump away). Pass: yes / no
7. Untick **Flicker the button when a break is late**: the pulse stops, the text still says late. Tick it again. Pass: yes / no
8. Press **Lunch in**: the pulse and the "late" text stop at once. Pass: yes / no
9. (Edit applies to the NEXT break) Press **First break out**. While it runs, change the First break limit in the Default row to 1 and Save. The running break still shows "(15 min)" and is not late after 1 minute. Press First break in. Pass: yes / no
10. Set Last break to **0**, save, then Last break out: the text says "Last break: no time limit" and it never turns late. Last break in. Pass: yes / no
11. Save a schedule for one Client ID (for example Lunch 90). Clock out, clock in with that client FIRST, lunch out: the text says "Schedule of <ID>". Pass: yes / no
12. (Optional) Turn on your computer's "reduce motion": the late button has a steady thick red outline instead of pulsing. Pass: yes / no
13. Remove each test schedule (press Remove twice to confirm), or set the Default back to 15 / 60 / 15. Pass: yes / no

## C. Free-plan check
Firebase > Firestore > Usage: a few extra reads per sign-in (the schedule documents), nothing continuous.

## D. If something is wrong
Rollback ZIP restores the previous files. Also republish the previous `firestore.rules.strict` (the rollback ZIP contains it). Schedule documents left in Firestore are harmless. Tell me the failed step number and what you saw.
