# TD1-fix live test (4.5.0): backup tick boxes, WorkTrack and focus never together, phone layout, search

No database rules change in this fix, so there is nothing to publish in Firebase. Upload the files, wait for Pages, hard-refresh.

## What changed
- Privacy & backup now has four tick boxes for the to-do records (found by your step 11). They are saved for your records only, not restored.
- The focus timer and WorkTrack never run together: Play is refused while WorkTrack says Working (breaks and lunch are allowed); clocking in, or ending a break, while a focus timer runs asks to pause and save it first.
- Phone: the focus clock is a bar at the bottom edge, bigger tap buttons, a "More actions" button on each task.
- New: search tasks; the button is now "Pause & save"; trimming a session keeps the original length in an automatic note; deleting a task with a very long history works in rounds and can be finished if interrupted.

## Order
1. Upload ALL files of `CodeFlow-Portfolio-4.5.0-TD1-fix.zip` to the public repo (replace existing) and commit. Wait for Pages and for the green GitHub Actions run.
2. Hard-refresh the site and sign in.

## Live steps
1. Privacy & backup: four new boxes (To-do tasks, focus sessions and added time, notes, running timer) and the sentence "saved for your records only". Tick them, Download backup: the file contains the to-do records. Pass: yes / no
2. WorkTrack: clock in (Working). To-do & focus > Play on a task: refused with a clear message. Pass: yes / no
3. Start a WorkTrack break or lunch. Play now works. Pass: yes / no
4. With the focus timer running, press WorkTrack **End break** or **Clock in**: a box asks to pause and save the focus timer. Cancel keeps it and does not clock in; "Pause and continue" saves the session, then WorkTrack continues. Pass: yes / no
5. Only one clock is ever on screen. Pass: yes / no
6. On your phone (or a narrow window): the focus clock is a bar at the bottom, "Pause & save" is easy to press, each task shows Play / Done and a "More actions" button. Pass: yes / no
7. Type in the new search box: tasks filter by name or description. Pass: yes / no
8. History > Trim a session: a new note "Auto note ... original length is kept here" appears. Pass: yes / no
9. The button reads "Pause & save" (page and floating clock). Pass: yes / no

## If something fails (rollback)
Restore the files from `CodeFlow-Portfolio-4.5.0-TD1-fix-rollback.zip` (the TD1 versions). Then delete `rules-tests/browser/td1-2-fix.mjs`, `scripts/backup-checkboxes.test.mjs` and `TD1-FIX-CHECKLIST.md`. No data is changed by this fix.

## Result
(to fill in after your live test)
