# R4 live test (4.5.0): rejected survey answer retention + drawer search

## Upload
1. Upload ALL files of the ZIP to GitHub (replace existing), commit, wait for Pages, hard refresh (Ctrl+Shift+R). No rules change, no Worker change.

## Live steps: drawer search
1. Open the Owner Panel. At the top of the left drawer there is a box "Find a section…". Pass: yes / no
2. Type `retention`: only "Privacy & backup" stays. Pass: yes / no
3. Type `turnstile`, press Enter: Security opens. Pass: yes / no
4. Press Esc: the box clears and every entry is back; the dashboard stays open. Pass: yes / no
5. Type `invoice`: the invoice pages show. Type `zzzz`: "No section matches" shows. Pass: yes / no
6. On your phone (narrow screen): open the menu, the box is there and works. Pass: yes / no

## Live steps: retention
7. Owner Panel > Privacy & backup > Retention: a new choice "Rejected survey answers" shows "Keep until I delete them". Pass: yes / no
8. Press "Check what is due": the list says "Rejected survey answers: kept until you delete them". Pass: yes / no
9. Choose a period (I recommend 90 days) and press "Save periods and contact". Then "Check what is due": it counts rejected answers older than that (probably 0 today). Pass: yes / no
10. Nothing is deleted by checking. If a count above 0 shows, read the box: it says the answer and its link go together. Pass: yes / no
11. Open the public privacy notice (the footer link), "Employer feedback survey": the new sentence matches your choice. Tell me if the wording is OK. Pass: yes / no

## If something fails
- Restore the files from the rollback ZIP and delete: `scripts/core-navsearch.js`, `scripts/core-navsearch.test.mjs`, `scripts/owner-navsearch.js`, `rules-tests/browser/r4-1-survey-retention-navsearch.mjs`, `R4-CHECKLIST.md`. Saved settings stay valid (an unknown `svRejected` value is ignored by the old page).

## Result
(to fill in after your live test)
