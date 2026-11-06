# C1 checklist: Discovery Call and outside calendar (live test)

No rules change and no Worker change. Upload the changed files, wait for GitHub Pages, hard-refresh (Ctrl+Shift+R). Do NOT republish the Firestore rules.

## A. Rename
1. The public section heading is **Book a Discovery Call**, the button says **Send Discovery Call Request**, and the browser tab says "Book a Discovery Call". Pass: yes / no
2. Owner dashboard: the drawer item and inbox say **Discovery call requests**; old requests still appear. Pass: yes / no

## B. Outside calendar
3. Owner Panel > Service forms: a **Booking method** card at the top, built-in form selected. Pass: yes / no
4. Choose **Use an outside calendar**, paste your Calendly link or the full embed code from Calendly or GoHighLevel. It says **Detected: <provider>** and shows a preview. Pass: yes / no
5. Paste a link from another provider (for example https://example.com): refused with a message, and Publish does nothing. Pass: yes / no
6. Paste code that also contains a script: only the address is kept; the box shows the address after you click away. Pass: yes / no
7. Publish. Open the public site > Book a Discovery Call: the **built-in form is gone**, your calendar shows, and the third-party notice and "Open the calendar in a new tab" link are there. Book a test slot. Pass: yes / no
8. If the calendar frame stays blank, note the provider (use the new-tab link meanwhile). Pass: yes / no / notes
9. Switch back to **Use my built-in form** and publish: the built-in form returns. Your service forms are still there. Pass: yes / no
10. Turn "Hire Me" off (hiring closed): the section shows the closed message and no calendar. Turn it back on. Pass: yes / no

Rollback: upload the files from `CodeFlow-Portfolio-4.5.0-C1-rollback.zip`.
