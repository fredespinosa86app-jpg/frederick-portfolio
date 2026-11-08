# EN-1C release notes (4.5.0), revised card

## What changed since the first EN-1C version
- New layout approved by Senior QA (96/100): Focus time as the main figure; Goal days met, Best day and Streak as compact tiles; "Tasks completed" as a smaller line; a separate "Share this summary" section.
- Empty week (focus time 0 and no completed task) hides the whole share section and says there is nothing to share. Before your first record the card still shows the "no focus data yet" message.
- All buttons and the To box are at least 44 px tall at every width. Open in my mail app is primary, Copy text secondary, Reset text a small link with a 44 px tap area.
- The message box grows to show the whole message.
- Best day shows the date on one line and the hours on its own line; at 375 px it sits full width under the other two tiles; at 320 px everything is one column.
- One click on Open in my mail app opens one draft; the button waits 1.5 s before it can open another. A refused address is still refused every time.
- Card-specific dark blue focus ring (10.36:1 on white); the To box is tied to its error message for screen readers.
- Notice under the buttons: "Nothing is sent automatically. Your email application will open a draft for your review."

## Unchanged
Calculations, the General time zone rule, privacy (address never saved), no database or rules change, no new request, no new library, no Worker.

## Tested (real page, headless Chromium)
Unit 673, attack 2723/2723, all 24 browser suites. New in this card's suite: widths 1280/768/375/320, empty week, completed-task-only week, New York and Auckland zones on a fixed clock, repeated clicks, contrast of 28 items, labels, keyboard order and activation, focus ring, layout shift and click timing (lab).

## Found and fixed while testing
- A style name of mine (`hero`) clashed with the site's own `hero` style and made the Focus time figure almost invisible; caught by the contrast test, renamed.
- Two `section` elements picked up the site's large section spacing (about 80 px gaps); replaced by neutral groups, with a spacing check added.
- A note broke in the middle of a word at 375 px; fixed, with a word-break check added.

## Known limits
Only the last completed week; very long messages are refused for the mail link (Copy text always works); lab numbers are not real-user numbers; the site-wide dashboard focus ring (light blue, about 2.5:1) is not changed here.

## Rollback
`CodeFlow-Portfolio-4.5.0-EN1C-rollback.zip` restores the first EN-1C version; `-EN1C-rollback-to-EN1A.zip` restores the state before EN-1C. No database change either way.
