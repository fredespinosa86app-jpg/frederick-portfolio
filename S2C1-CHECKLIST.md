# S2-C1 checklist: connection log (live test)

No rules change and no Worker change. This only RECORDS which websites the page contacts while you are signed in, on this device, host names only. It changes no connection rule. Upload the changed files, wait for GitHub Pages, hard-refresh (Ctrl+Shift+R), sign in.

## A. Use every feature once while signed in (same browser, same tab or tabs)
Visit these and do the action; after each, the log fills in by itself.
1. Public site: home page loads, open the Privacy notice, play a video (YouTube or Loom), open Training and FAQ.
2. Chatbot: send two questions (one the built-in answers know, one that needs the AI if you use the webhook or chat proxy).
3. Discovery Call: open the section, pick a date, and send a real test request (with form verification ON if you use it) or load the outside calendar if you use one.
4. Owner Panel: Inbox, Availability, Clients, WorkTrack clock-in and out, Backup (download), Privacy cleanup > Check what is due.
5. Integrations: Google Sheets "Send meeting requests", Google Calendar connect/check, Zoom link save, Domain page > Check (it contacts a DNS service and your domain).
6. Videos page: paste a YouTube link (title lookup).
7. If you enabled App Check: reload once.

## B. Read the log
8. Owner Panel > **Security** > **Connection log**: press **Refresh**. Hosts marked ✓ are expected; hosts marked ? are not in my code scan. Pass: yes / no
9. The list shows only host names, no addresses, paths or search terms. Pass: yes / no
10. Press **Copy list** and paste it into the chat. I use it to build the tightened rule (S2-C2). Done: yes / no
11. **Clear log** empties it (do this after sending me the list). Pass: yes / no

Notes: the log sees requests the page makes itself. Requests made inside background workers are not visible (the break alarm only uses this site).

Rollback: upload the files from `CodeFlow-Portfolio-4.5.0-S2-part1-rollback.zip`.
