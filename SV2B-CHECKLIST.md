# SV2b live test (4.5.0): custom surveys

Before you start: publish the new `firestore.rules.strict` in Firebase (Firestore > Rules > paste > Publish), THEN upload the files, then hard refresh. Also check on GitHub that the Firebase emulator job is green for this commit (it tests the new rules with the real engine). Mark each step pass or fail.

1. Owner Panel > Employer surveys: a new card **My surveys** with a **New survey** button. The **Send a survey** form has a **Survey** selector (Default survey). Pass: yes / no
2. **New survey**: leave the title empty and press **Save survey**: a message asks for a title. Pass: yes / no
3. Fill the title "Quarterly check-in" and an introduction. Question 1: wording "How was communication?", tick **Required**. **Add question**: set the type to **Choice**, wording "Which service?", and press Save without options: a message names Question 2. Pass: yes / no
4. Enter options (one per line, e.g. Research, Admin, Support) and **Save survey**: it appears in My surveys with "2 extra questions", and in the Survey selector. Pass: yes / no
5. Try to add 7 questions in one survey: after 6 the **Add question** button is greyed out. Pass: yes / no
6. Choose that survey in **Send a survey**, enter a test employer name and your own e-mail, **Create link**: the new row under Survey links says "Survey: Quarterly check-in". Pass: yes / no
7. Open that link in a private window (or on your phone): the page shows YOUR title and introduction, then your 2 extra questions (the required one marked "(required)"), then the usual rating, message, name and consent. Pass: yes / no
8. Press **Send my feedback** without answering the required extra question: a message appears under that question and nothing is sent. Pass: yes / no
9. Answer everything and send: the thank-you page appears. Pass: yes / no
10. Owner Panel > Employer surveys > Answers to review: the answer shows the rating and message as before, plus **Extra answers ... (only for you, never published)** with each question and the answer. Pass: yes / no
11. Press **Approve**: the new Testimonials item contains only the rating, message and name (never the extra answers). Pass: yes / no
12. Edit the survey in My surveys (change the title, remove a question), save. Open a NEW link for the default survey: it looks as before (no extra questions). The link you already sent keeps its original questions (check the row before answering it, or make another test link and compare). Pass: yes / no
13. Delete the survey in My surveys: you are asked first; links already sent still open. Pass: yes / no
14. Privacy & backup > Back up: the list has My surveys (templates), Survey question copies, Survey extra answers. Pass: yes / no
15. Owner Panel > Security > connection log: no new blocked entries (the survey page must not need anything new). Pass: yes / no

If anything looks wrong, tell me the step number and what you saw.

Not part of this test: nothing is left unbuilt in SV2. Reminder, cleanup, backup and privacy line were SV2a (passed).

Rollback: upload the files from `CodeFlow-Portfolio-4.5.0-SV2b-rollback.zip` and publish the rules file inside it (the SV2b block and the one extra response clause are absent there). Templates, form copies and answers already saved stay in the database and nothing reads them; an unanswered custom link would then show its default questions and be refused on sending, so revoke such links first.
