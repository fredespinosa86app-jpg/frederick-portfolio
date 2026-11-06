# R3 checklist: retention for Discovery Call requests (live test)

No rules change and no Worker change. Upload the changed files, wait for GitHub Pages, hard-refresh (Ctrl+Shift+R). Do NOT republish the Firestore rules. Take a backup first (Privacy & backup > Backup).

## A. Settings
1. Privacy & backup > How long personal data is kept shows three request selectors: **Delete finished** (default 2 years), **Flag unanswered** (90 days), **Delete unanswered** (1 year). Pass: yes / no
2. Set Flag to 180 days and Delete unanswered to 180 days, press Save: it refuses (flag must be earlier). Set 90 / 1 year and Save: it saves. Pass: yes / no
3. Open the public Privacy notice: it names the finished period, the unanswered period and the 30-day rule. Pass: yes / no

## B. Preview (nothing is deleted yet)
4. Press **Check what is due**. You see counts: to delete (finished / unanswered / confirmed long past) and to review (not deleted), plus up to 5 samples with the email partly hidden. Pass: yes / no
5. Compare with your Inbox: a request that is **confirmed with a meeting still ahead** is never in the delete count, however old. Pass: yes / no
6. Nothing changed in the Inbox after the check. Pass: yes / no

## C. Delete
7. Press **Delete due records**: the warning shows how old your last backup is and offers **Delete anyway**. Cancel once: nothing is deleted. Pass: yes / no
8. Delete anyway: the result says how many were deleted; "Last cleanup" shows today; Check again shows nothing due. Pass: yes / no / not applicable (nothing was due)
9. Change a due request's status in the Inbox after pressing Check but before Delete: it is kept and the message says so. Pass: yes / no / not tried

## D. Weekly banner
10. Sign out and in: if something is due or flagged, a banner appears on the dashboard; it says nothing is deleted until you confirm. Sign out and in again right away: no banner. Pass: yes / no / nothing was due
11. **Review** opens Privacy & backup; **Remind me next week** hides the banner. Pass: yes / no

## E. Outside the database (by hand)
12. Delete the matching rows in your Google Sheet, remove old backup files, old calendar events, and the monthly "m_" sign-in accounts. Pass: understood

Rollback: upload the files from `CodeFlow-Portfolio-4.5.0-R3-rollback.zip`.
