# W5a checklist: floating WorkTrack clock (live test)

No Firebase rules change and no Worker change in this phase. Install the ZIP (replace the files), commit, wait for GitHub Pages, then hard-refresh (Ctrl+Shift+R).

## A. Install
1. Upload the changed files to GitHub (the ZIP lists them).
2. Do NOT republish `firestore.rules.strict` (unchanged).

## B. Live checks (use a private window if the page looks old)
1. Sign in as owner. If you are NOT clocked in, no clock is shown anywhere.
2. Owner Panel > WorkTrack > Clock in. A dark clock appears top right with status "Working". Pass: yes / no
3. Press "Close" on the dashboard (View site). The clock stays on the public site. Pass: yes / no
4. Drag the clock by its bar to another place; refresh the page. It stays where you put it. Pass: yes / no
5. Try to drag it off the screen edge. It stops at the edge. Pass: yes / no
6. Press Tab until the grip is focused, then use the arrow keys. It moves. Home puts it back top right. Pass: yes / no
7. Press "Minimise" then "Expand". Pass: yes / no
8. From the clock press Lunch out: status becomes "On lunch" and only "Lunch in" is offered. Check Owner Panel > WorkTrack: the same punch is listed. Pass: yes / no
9. Press Lunch in, then Clock out. The first press says "Confirm: Clock out"; wait 5 seconds, it goes back to "Clock out". Press twice to confirm: the clock disappears and the WorkTrack page shows the session closed. Pass: yes / no
10. Clock in again, open the Owner dashboard: the clock is still visible (it sits inside the dashboard, below the header). Press Tab repeatedly: focus reaches the clock. Pass: yes / no
11. Sign out. The clock disappears at once. Sign in again: it appears again only if a session is still open. Pass: yes / no
12. Open the site on a second device or tab, punch there (for example First break out). Return to the first tab: within about a minute (after clicking in the page) the clock follows. Pass: yes / no
13. (Optional) Phone: open the site, sign in, check the clock fits the screen and can be dragged with a finger. Pass: yes / no

## C. Free-plan check
Firebase > Firestore > Usage: reads for the day should rise by only a few per sign-in, not continuously while the clock is open.

## D. If something is wrong
Rollback ZIP restores the previous files. The clock never changed any punch data, so nothing needs repairing. Tell me the number of the failed step and what you saw.
