# EN-1A live test (4.5.0): owner time zone (General page) and goal per weekday (Graphs tab)

What is new: (1) **General > Time zone**: one default time zone for all your projects. A project can still have its own zone (for example a client's), and that wins. Right now the To-do & focus page and its graphs follow this setting; WorkTrack, billing and booking availability keep their own settings and are not changed. (2) On **To-do & focus > Graphs**, a goal can differ by weekday (Monday first). An empty box uses the daily goal; **0 is a rest day**: it has no goal and is skipped in the streak (it neither breaks the streak nor counts as a day).
There IS a database rules change (two new kinds of saved settings), so the order below matters.

## Order (important)
1. Upload ALL files of `CodeFlow-Portfolio-4.5.0-EN1A.zip` to the public repo (replace existing) and commit.
2. Wait for GitHub Actions: the **emulator run must be green** (it now includes `en1a.test.mjs`, which runs the same tests against BOTH rules files).
3. Only then publish `firestore.rules.strict` in Firebase Console > Firestore > Rules > Publish. (Firebase uses ONE rules text: the strict file. `firestore.rules` is the transition copy kept in the repository; the tests prove both behave the same.)
4. Hard-refresh the site and sign in.

## Live steps
### Time zone
1. Privacy & backup: two tick boxes changed or are new: **To-do goals (daily and per weekday)** and **Owner default time zone**. Pass: yes / no
2. General page: a **Time zone** card at the top. It shows Asia/Manila and "Not saved yet, using Asia/Manila", with the current time there. Pass: yes / no
3. Type `Bad zone` and press Save time zone: a red message with examples appears, nothing is saved. Pass: yes / no
4. Type `America/New_York`: before saving, the card shows its offset and time (UTC-5 or UTC-4). Press Save: it says "Saved: America/New_York". Pass: yes / no
5. Open To-do & focus > Graphs: the last bar (today) is New York's date, which can be the day before Manila's early in your morning. Pass: yes / no
6. Back to General: change to `Asia/Kathmandu`. The card shows UTC+5:45 and "Before the last change: America/New_York". Pass: yes / no
7. Press **Reset to Asia/Manila**. Everything looks as before. Pass: yes / no
8. WorkTrack > Work settings still shows its own zone, unchanged by steps 4 to 7. Pass: yes / no

### Goal per weekday
9. Graphs tab: under the daily goal there are seven boxes, Mon to Sun, each with a spoken name such as "Monday goal in minutes". With no goals they are empty. Pass: yes / no
10. Set the daily goal to 30 and press Save goal. The boxes now say "uses 30". Pass: yes / no
11. Type 45 in Monday, press **Copy Monday to Mon-Fri**, type 0 in Saturday (it says "rest"), press **Save goals**. Pass: yes / no
12. The chart now has a short dashed mark on each day at that day's goal, "rest" on Saturdays, and the note "dashed mark = goal for that day". A day gets its check mark against its own goal. Pass: yes / no
13. The streak line ends with "(rest days skipped)". Pass: yes / no
14. Show as table: a **Goal** column; Saturday says "rest day". Pass: yes / no
15. Download CSV (daily): the last column is **Goal minutes**; a rest day shows `rest`. Pass: yes / no
16. Type 1441 in a box and press Save goals: it is refused and nothing changes. Pass: yes / no
17. Change the daily goal and press Save goal: the weekday goals are still there. Pass: yes / no
18. Press **Clear weekday goals** then **Save goals**: back to one dashed goal line and no "rest days skipped". Pass: yes / no
19. On your phone: the boxes sit in two rows (4 + 3), are easy to tap, and the page does not scroll sideways. Pass: yes / no

## Good to know
- Changing the time zone regroups your past to-do days, graphs and streaks into the new zone's days. Nothing is deleted or rewritten, and changing back restores the old view.
- A daily goal of 0 still means "goal off" (not a rest day). A rest day is a weekday you set to 0 yourself.
- Time you work on a rest day is still shown in the chart; it just does not add a day to the streak.
- With no weekday goals saved, the saved goal document is exactly what it was before this update.

## If something fails (rollback)
- Publish the previous `firestore.rules.strict` / `firestore.rules` from `CodeFlow-Portfolio-4.5.0-EN1A-rollback.zip` and restore its files.
- Delete the new files: `scripts/core-ownertz.js`, `scripts/core-ownertz.test.mjs`, `scripts/owner-ownertz.js`, `rules-tests/attack/mutations_en1.py`, `rules-tests/browser/en1a-1-goals-zone.mjs`, `rules-tests/emulator/en1a.test.mjs`.
- Your data stays in the database; with the old rules the new settings are simply not reachable and the old single daily goal keeps working.

## Result
(not tested yet)
