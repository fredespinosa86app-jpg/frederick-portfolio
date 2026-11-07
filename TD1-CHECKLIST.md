# TD1 live test (4.5.0): To-do & focus (Owner Panel > Planner)

What is new: a personal task list with a focus timer. Each task has a name, description, due date, hours allotted and a focus block (minutes). Press **Play** and a floating clock shows your focus time (like WorkTrack). Only ONE task can run at a time, even across two devices. Pause saves the session and offers a private note; the history of each task shows sessions and notes. Times use Asia/Manila. The two graphs come in the next build (TD2).

## Order (important)
1. Upload ALL files of `CodeFlow-Portfolio-4.5.0-TD1.zip` to the public repo (replace existing) and commit.
2. Wait for GitHub Actions: the **emulator run must be green** (it now includes the to-do rules tests).
3. Only then publish `firestore.rules.strict` in Firebase Console > Firestore > Rules > Publish.
4. Hard-refresh the site and sign in to the Owner Panel.

## Live steps
1. Drawer: a new **Planner** heading with **To-do & focus**. Typing "timer" in the drawer search finds it. Pass: yes / no
2. New task: name "Test A", hours 1, focus block 1 minute. An empty name shows a message and saves nothing. Pass: yes / no
3. New task "Test B" (focus block 25). Both appear with a progress bar. Pass: yes / no
4. Press **Play** on Test A. A floating clock appears and counts up. Drag it, minimise it, press Corner. Pass: yes / no
5. Wait 1 minute: banner "Focus block complete" (and a chime if your sound is on). The timer keeps running. Pass: yes / no
6. Press **Play** on Test B: a box asks to switch. Choose Pause and start. A note box appears: write "first note" and Save. Pass: yes / no
7. Open the site on a second device or a second browser window signed in as owner: the same clock shows there too, and Play on a task asks you to switch instead of starting a second timer. Pass: yes / no
8. Pause from the floating clock. The clock disappears; Skip (or write) the note. Test B shows the time used. Pass: yes / no
9. **Add time** (manual) 30 minutes on Test A. In **History**: the focus session, "Added time" and your note are listed. Trim a session to a shorter time. Pass: yes / no
10. Mark Test A **Done**, then Reopen, then Archive and Restore. Pass: yes / no
11. Privacy & backup > JSON backup includes the to-do records (tasks, sessions, notes, timer state). Pass: yes / no
12. Delete both test tasks (confirm). Their sessions and notes go too. Sign out: the clock disappears. Pass: yes / no

## Good to know
- The timer runs on the database clock; it keeps counting if you close the browser. If you come back after 12 hours the clock asks what to save (the focus block, 12 h, or keep running).
- The chime and the "block complete" banner only work while the page is open. The sound needs one click on Play first (browsers require it).
- A session belongs to the day it STARTED. Task totals are cached; History has "Recalculate the total" if they ever differ.
- Starting or pausing needs an internet connection on purpose.

## If something fails (rollback)
- Publish the previous `firestore.rules.strict`/`firestore.rules` from `CodeFlow-Portfolio-4.5.0-TD1-rollback.zip` and restore its files to the repo.
- Then delete the new files: `scripts/core-todo.js`, `scripts/core-todo.test.mjs`, `scripts/owner-todo.js`, `scripts/td-float.js`, `rules-tests/emulator/todo-td1.test.mjs`, `rules-tests/attack/mutations_td1.py`, `rules-tests/browser/td1-1-todo-focus.mjs`, `TD1-CHECKLIST.md`.
- Your to-do data stays in the database (no rules → it is simply not reachable).

## Result
(to fill in after your live test)
