# EN-1C live test (4.5.0): weekly summary card, revised design (To-do & focus > Graphs)

What it is: a **Weekly summary** card on the Graphs tab, below the weekly chart. It shows the last COMPLETED Monday-to-Sunday week in your **General time zone** (Asia/Manila unless you changed it). Top: **Focus time** in big numbers. Below it three small tiles: Goal days met (rest days not counted), Best day, Streak at week end, and a line with tasks completed. Then a separate section, **Share this summary**: an editable message, an optional To address, and the buttons. **Nothing is sent by the site.** Your mail app opens a draft, or you copy the text. The message has numbers only (no task names). The To address is never saved and is forgotten when you leave the page.

This version (revised after the Senior QA review): new layout, empty weeks hide the share section, buttons are at least 44 px tall everywhere, the message box grows to show the whole message, "Reset text" is a small link, a double-click opens only one draft.
No database or rules change: upload, commit, hard-refresh. Nothing to publish in Firebase.

## Order
1. Upload ALL files of `CodeFlow-Portfolio-4.5.0-EN1C.zip` to the public repo (replace existing) and commit.
2. Hard-refresh the site and sign in.

## When can you test?
The card shows the LAST COMPLETED week. Your first record is dated 8 Nov, so until Monday 16 Nov you will only see the "no focus data / before your first record" message. Steps 4 onward need a completed week with data: do at least one focus session or complete a task during 9 to 15 Nov, then test on or after Mon 16 Nov. Steps 1 to 3 can be done now.

## Live steps
1. To-do & focus > Graphs: below "Tasks completed per week" there is a **Weekly summary** card, and "Hours used vs allotted" comes after it. Pass: yes / no
2. The card names last week (Monday to Sunday, not the week we are in) and your time zone. Pass: yes / no
3. Before your first record: the card says there is no focus data yet and shows no message box and no buttons. Pass: yes / no
4. With data: **Focus time** is the biggest figure at the top; under it three tiles (Goal days met, Best day, Streak at week end); then "Tasks completed: n (open now: n)". The numbers agree with the daily chart. Pass: yes / no
5. With a rest day in your weekday goals: Goal days met says "rest days not counted". With no goals at all: the Goal and Streak tiles are left out. Pass: yes / no
6. A week with nothing in it (no focus time and no completed task, but after your first record): the card keeps its title and week and says "No focus time or completed tasks were recorded for this week, so there is nothing to share." There is NO message box, NO To box and NO buttons. Pass: yes / no
7. The **Share this summary** section is a separate part below a thin line. The message starts with "Focus summary, <dates> (<zone>)", has numbers only, and the **whole** message is visible without scrolling inside the box. Pass: yes / no
8. Change some words in the message, then press 7 days or 30 days above the chart: your words stay. Press **Reset text** (the small underlined link): the original message returns. Pass: yes / no
9. Type `not an address` in "To" and press **Open in my mail app**: a plain red message, no mail app opens. Pass: yes / no
10. Type your own address and press **Open in my mail app**: your mail app opens a draft with the subject "Focus summary, ..." and the message in the body. Double-click the button quickly: only ONE draft opens. Pass: yes / no
11. Press **Copy text**, paste into Notes: it is exactly the message in the box. Pass: yes / no
12. Leave the To-do page (for example open General) and come back to Graphs: the To box is empty and the message is the fresh one. Switch to the Tasks tab and back: also empty. Pass: yes / no
13. General > Time zone: change the zone and look at the card again: it shows the new zone and (possibly) a different week. Change it back. Pass: yes / no
14. Keyboard only (Tab key): you can reach the message, the To box, Open in my mail app, Copy text and Reset text in that order, each shows a clear dark blue ring, and Enter or Space presses the buttons. Pass: yes / no
15. On your phone: the card fits the screen with no sideways scrolling, the tiles are in two columns with Best day full width below them (one column on a very small phone), the buttons are full width and easy to tap, and "Best day" does not break awkwardly. Pass: yes / no

## Good to know
- Only the last completed week is shown (a week picker could come later).
- A very long message is refused for the mail link with "Use Copy text" because many mail apps cut long links. Copy text always works.
- The streak shown is the streak as it stood at the end of that week, not today's.
- A share link line is added only when a share link exists and is active. The share link (EN-1 Part B) is not built yet, so this line never appears for now.
- The card reads the same data as the graphs (one read). Press Refresh to read again.
- Not changed in this step: the site-wide keyboard ring used on other dashboard pages is a lighter blue. The card has its own darker ring. The lighter one measures about 2.5:1 on white, below the 3:1 guideline; fixing it everywhere is a separate item that needs its own approval.

## If something fails (rollback)
- Restore the files from `CodeFlow-Portfolio-4.5.0-EN1C-rollback.zip` (the first EN-1C version) and delete nothing else. To go back before EN-1C entirely, use `CodeFlow-Portfolio-4.5.0-EN1C-rollback-to-EN1A.zip`.
- Nothing in the database changed, so there is nothing to undo there.

## Result
Steps 1 to 3 passed on 2026-11-08 on the first version of the card. The revised card has not been live-tested yet: start with steps 1 to 3, and do the rest from Mon 16 Nov 2026.
