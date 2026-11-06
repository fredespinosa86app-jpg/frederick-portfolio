# SV2a live test (4.5.0): survey reminders, cleanup, backup, privacy line

Before you start: publish the new `firestore.rules.strict` in Firebase (Firestore > Rules > paste > Publish), THEN upload the files, then hard refresh. Mark each step pass or fail.

1. Owner Panel > Employer surveys: a new card **Survey reminders** is at the top. Pass: yes / no
2. Choose a Client ID, enter a start work date about 4 months ago, keep 3 months, press **Save reminder**: a row appears saying "due now", and a **Survey due** row shows above with three icons (Create survey link, Snooze 7 days, Not needed). The menu badge counts it. Pass: yes / no
3. Save another reminder with a start date of today: its row says "waiting" and it is NOT in the due list. Pass: yes / no
4. Try months 0 and an empty date: a clear message appears and nothing is saved. Pass: yes / no
5. On the due row press **Snooze 7 days**: it leaves the due list; the all-reminders row says "snoozed until ...". Pass: yes / no
6. Press the pencil on that row (Edit reminder): the form fills in; change the date and Save: the row updates. Pass: yes / no
7. Make it due again (edit the start date to 4 months ago), press **Create survey link**: that Client ID is selected in "Send a survey" and the cursor is in the employer name. Enter a name and e-mail, **Create link**: the reminder row now says "survey sent" and the due card is empty. Pass: yes / no
8. Make another due reminder and press **Not needed**: the row says "not needed". Pass: yes / no
9. Delete a reminder (trash): you are asked first; only that reminder disappears. Pass: yes / no
10. Survey links: **Remove old links** is greyed out and the line says "Nothing to clean up" (unless you have links that ended more than 30 days ago and were never answered). If it offers some, press it, read the message, **Cancel**, then confirm once: only those links go; answers stay. Pass: yes / no
11. Privacy & backup > Back up: the list has Survey links, Survey links: employer e-mails (private), Survey answers, Survey reminders. Tick them, download, and open the file in a text editor: it contains those collections. (Keep this file private: it holds employer e-mail addresses.) Pass: yes / no
12. Restore dry run with that file: the survey items are listed as "kept for your records but not restored". Pass: yes / no
13. Open the public site > Privacy notice: a paragraph "Employer feedback survey" is there. Open a fresh survey link: the small print says only you see the answer and they can ask you to remove it. Pass: yes / no
14. Owner Panel > Security > connection log: no new blocked entries. Pass: yes / no

Not part of this test: custom surveys (SV2b).

Rollback: upload the files from `CodeFlow-Portfolio-4.5.0-SV2a-rollback.zip` and publish the rules file inside it (the reminders rules block is simply absent there). Reminder records already saved stay in the database and nothing reads them.
