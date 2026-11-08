# BK-1 checklist: better backups (about 10 minutes)

What changed (plain words)
- The backup file now also saves your WorkTrack break schedules (first break, lunch, last break, for "default" and each client). They were missing before.
- A new test fails automatically whenever a database collection is neither in the backup nor on a short, reasoned "not backed up" list. A gap cannot appear unnoticed again.
- The Owner Panel home shows a "Time for a backup" card when your last backup is 7 days old or more (or there is none). The "!" on the Privacy & backup menu item uses the same 7 days (it was 30). "Later" hides the card until the next sign-in.
- Privacy & backup now explains in plain words what a backup can and cannot bring back.
- No rules change, no Worker change, no console change, no billing.

Files: `index.html`, `scripts/backup-core.js`, `scripts/owner-privacy.js`, `scripts/backup-core.test.mjs`, new `scripts/backup-coverage.test.mjs`,
new `rules-tests/browser/bk1-1-backup-reminder.mjs`, this file.

## Live steps
1. Upload ALL files of the ZIP to GitHub (replace existing, keep the folders), commit, wait 1-2 minutes, hard refresh (Ctrl+Shift+R).
2. Sign in to the Owner Panel and look at the dashboard home. If your last backup is 7 days old or more, or there is none, a card "Time for a backup" shows.
   (If you made a backup in the last 7 days no card shows: that is correct. Carry on with step 3.) Pass: yes / no
3. Click **Open Privacy & backup** on the card (or the menu item). The line above the tick boxes shows your last backup and its age. Pass: yes / no
4. Read the paragraph "What a backup can bring back." It must say: only site settings, site content, private settings and clients can be loaded back; everything else is saved for your records only; make a backup every 7 days. Pass: yes / no
5. In the list of tick boxes find **WorkTrack break schedules** (next to "WorkTrack settings"). Keep your usual ticks, tick this one too, and click **Download backup**.
   The message under the button lists what was saved and includes "WorkTrack break schedules: N". Pass: yes / no
6. Open the downloaded file in Notepad. Near the top you see `"format": "codeflow-portfolio-backup"` and a `counts` list that includes `workSchedules`. The file is not empty. Do not share it: it contains private details. Pass: yes / no
7. Go back to the dashboard home: the "Time for a backup" card is gone and the "!" next to Privacy & backup is gone. Pass: yes / no
8. Copy the file to a second place (for example a USB drive or another cloud folder), so you have two copies in two places. Pass: yes / no
9. F12 > Console during steps 2-7: no red `permission-denied` lines. (Browser-blocker lines `ERR_BLOCKED_BY_CLIENT` and the Google popup messages are normal.) Pass: yes / no

## What this does not do
A backup file can still only bring back site settings, site content, private settings and clients. To-do, WorkTrack, billing, invoices, surveys and history records are saved for your records but cannot be loaded back with one click (the rules deliberately make them create-only). A full restore would be a separate item with its own security review. Automatic scheduled backups need the paid Firebase plan; you chose to stay on the free plan.

## If something fails (rollback)
Upload the rollback ZIP (restores the old `index.html`, `backup-core.js`, `owner-privacy.js`, `backup-core.test.mjs`), then delete `scripts/backup-coverage.test.mjs`,
`rules-tests/browser/bk1-1-backup-reminder.mjs` and `BK1-CHECKLIST.md` from GitHub (optional). Tell me which step failed.
