# S2-D checklist: monthly cleanup of form sign-in users (m_) + reminder

No rules change and no Worker change. Upload the changed files, wait for GitHub Pages, hard-refresh (Ctrl+Shift+R), sign in.

## A. The reminder
1. The first time, the dashboard shows a banner **Monthly cleanup due: form sign-in users** ("No cleanup has been recorded yet"). Pass: yes / no
2. **Remind me next week** hides it; signing out and in again does not show it for 7 days. Pass: yes / no
3. **Open the checklist** opens Owner Panel > Security, where the card **Monthly cleanup: form sign-in users (m_)** lists the steps and the warning not to delete your own row. Pass: yes / no

## B. The cleanup itself (do it once now)
4. Firebase Console > your project > **Authentication** > **Users**. Note how many users there are in total and how many start with `m_`: ____ / ____ (this is the baseline I use to judge whether automation is ever worth it).
5. Type `m_` in the search box. **Does the list filter by ID prefix?** yes / no (if no, sort by Created and look at rows with an empty identifier). Answer: no (confirmed by the owner; use the Created sort and the empty identifier column)
6. **Your own row** shows your email and the Google icon: do not select it. Delete the `m_` rows older than one day (select a page at a time, then Delete). Done: yes / no
7. Sign in to the portfolio again in another tab to confirm you are still the owner (Owner Panel opens normally). Pass: yes / no
8. Press **I did the cleanup today**. The card shows "Last cleanup: today" and "Next reminder in 30 days"; the banner is gone. Pass: yes / no

## C. Automation (not built, on purpose)
A scheduled job would need a second service account allowed to delete users. If its key leaked, it could also delete your own user and lock you out of the panel. Three minutes a month is the safer trade. Revisit only if step 4 shows the number growing past what you are comfortable cleaning by hand.

Rollback: upload the files from `CodeFlow-Portfolio-4.5.0-S2-part1-rollback.zip`.
