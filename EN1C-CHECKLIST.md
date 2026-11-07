# EN-1C live test (4.5.0): weekly summary card (To-do & focus > Graphs)

What is new: a **Weekly summary** card on the Graphs tab, below the weekly chart. It shows the last COMPLETED Monday-to-Sunday week (in your General time zone): focus time, goal days met (rest days not counted), best day, streak at the end of that week, tasks completed and open now. You can edit the message, then open a draft in your own mail app or copy the text. **Nothing is sent by the site.** The message has numbers only (no task names). The optional "To" address is used only to open the draft: it is never saved anywhere and is forgotten when you leave the page.
There is NO database or rules change in this step: upload, commit, hard-refresh. (No emulator gate, nothing to publish in Firebase.)

## Order
1. Upload ALL files of `CodeFlow-Portfolio-4.5.0-EN1C.zip` to the public repo (replace existing) and commit.
2. Hard-refresh the site and sign in.

## Live steps
1. To-do & focus > Graphs: below "Tasks completed per week" there is a **Weekly summary** card, and "Hours used vs allotted" comes after it. Pass: yes / no
2. The card names last week (Monday to Sunday, not the week we are in) and your time zone. Pass: yes / no
3. If you worked last week: focus time, goal days met, best day, streak at week end and tasks completed look right against the daily chart. If you did not (or last week is before your first record) the card says there is no focus data yet and shows no buttons. Pass: yes / no
4. With a goal per weekday that includes a rest day: "Goal days met" says "(rest days not counted)". With no goals at all: the goal and streak lines are not shown. Pass: yes / no
5. The message box starts with "Focus summary, <dates> (<zone>)", has numbers only (no task names, no e-mail address) and ends with "This is a snapshot taken on <today>". Pass: yes / no
6. Change some words in the message, then press 7 days or 30 days above the chart: your words stay. Press **Reset text**: the original message returns. Pass: yes / no
7. Type `not an address` in "To" and press **Open in my mail app**: a plain red message, no mail app opens. Pass: yes / no
8. Type your own address and press **Open in my mail app**: your mail app opens a draft with the subject "Focus summary, ..." and the message in the body, addressed to that address. Leave "To" empty and try again: the draft opens with no recipient. Pass: yes / no
9. Press **Copy text**, paste into Notes: it is exactly the message in the box. Pass: yes / no
10. Leave the To-do page (for example open General) and come back to Graphs: the "To" box is empty and the message is the fresh one. Switch to the Tasks tab and back: also empty. Pass: yes / no
11. General > Time zone: change the zone and look at the card again: it shows the new zone and (possibly) a different week. Change it back. Pass: yes / no
12. On your phone: the card fits the screen with no sideways scrolling, the facts stack in one column and the two buttons and the address box are easy to tap. Pass: yes / no

## Good to know
- Only the last completed week is shown (a week picker could come later).
- A very long message is refused for the mail link with "Use Copy text" because many mail apps cut long links. "Copy text" always works.
- The streak shown is the streak as it stood at the end of that week, not today's.
- A share link line is added only when a share link exists and is still active and unexpired. The share link (EN-1 Part B) is not built yet, so this line never appears for now.
- The card reads the same data as the graphs (last 60 days, one read). Press Refresh to read again.

## If something fails (rollback)
- Restore the files from `CodeFlow-Portfolio-4.5.0-EN1C-rollback.zip` (they are the EN-1A versions) and delete the new test file `rules-tests/browser/en1c-1-summary.mjs`.
- Nothing in the database changed, so there is nothing to undo there.

## Result
(not tested yet)
