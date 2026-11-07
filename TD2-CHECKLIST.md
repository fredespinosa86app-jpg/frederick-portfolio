# TD2 live test (4.5.0): To-do & focus graphs, daily goal and streak, CSV and picture downloads

What is new: a **Graphs** tab on the To-do & focus page. Time per day (stacked by task, 7/14/30 days, Asia/Manila), a daily goal with a streak, tasks completed per week, hours used vs allotted, done vs open. Every chart has a text table. Downloads: CSV files and a picture (PNG). Task names are hidden in downloads by default. There is no public link, on purpose.
There IS a database rules change (a status log and the daily goal), so the order below matters.

## Order (important)
1. Upload ALL files of `CodeFlow-Portfolio-4.5.0-TD2.zip` to the public repo (replace existing) and commit.
2. Wait for GitHub Actions: the **emulator run must be green** (it now includes the TD2 rules tests).
3. Only then publish `firestore.rules.strict` in Firebase Console > Firestore > Rules > Publish.
4. Hard-refresh the site and sign in.

## Live steps
1. Privacy & backup: six to-do tick boxes (tasks, focus sessions and added time, notes, running timer, **status log**, **daily goal**). Pass: yes / no
2. To-do & focus shows two tabs: **Tasks** and **Graphs**. Pass: yes / no
3. Add a task "TD2 test" (hours 1). Play it, wait about 2 minutes, Pause & save. Mark it Done, Reopen it, Mark it Done again. (This writes the status log.) Pass: yes / no
4. Graphs > Time per day: today shows a bar for "TD2 test" with its letter and pattern. Try 7, 14 and 30 days. Pass: yes / no
5. Days before your first task say "no data"; later empty days show 0. Pass: yes / no
6. Press **Show as table**: the same numbers as text. Pass: yes / no
7. Tab to the chart and use the arrow keys: each day is read out and shown under the chart. Pass: yes / no
8. Daily goal: type 1 (minute) and Save goal. The bar gets a check mark, a dashed goal line appears, and "Current streak" shows at least 1. Set it to 0: streaks turn off. Pass: yes / no
9. Tasks completed per week: this week shows 1 for "TD2 test" even though you completed it twice. Pass: yes / no
10. Hours used vs allotted and Done vs open look right. Pass: yes / no
11. Download CSV (daily): opens in Excel or Sheets, names show as Task A, Task B. Untick "Hide task names" and download again: real names. Pass: yes / no
12. Save as picture: a PNG downloads (on a phone the share sheet may open). With the box ticked the picture shows Task A/B, not your task names. Pass: yes / no
13. On your phone: the Graphs tab fits the screen with no sideways scrolling and the buttons are easy to tap. Pass: yes / no
14. Delete "TD2 test": its status-log entries go too (Graphs > Refresh: this week's count drops). Pass: yes / no

## Good to know
- A session that crosses Manila midnight is split between the two days in the graph only; task totals do not change.
- Streak and the 7/14/30 day charts use the last 60 days (one read of those sessions; switching range costs no extra reads). Press Refresh to read again.
- Tasks finished before TD2 have no status-log entry; their saved done time is used.
- Downloads are created in your browser; nothing is uploaded or shared by the page.

## If something fails (rollback)
- Publish the previous `firestore.rules.strict` / `firestore.rules` from `CodeFlow-Portfolio-4.5.0-TD2-rollback.zip` and restore its files.
- Delete the new files: `scripts/core-todograph.js`, `scripts/core-todograph.test.mjs`, `scripts/owner-todograph.js`, `rules-tests/attack/mutations_td2.py`, `rules-tests/browser/td2-1-graphs.mjs`, `rules-tests/emulator/todo-td2.test.mjs`, `TD2-CHECKLIST.md`.
- Your data stays in the database; with the old rules the log and goal are simply not reachable.

## Result
(to fill in after your live test)
