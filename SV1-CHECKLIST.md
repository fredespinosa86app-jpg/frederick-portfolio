# SV1 checklist: employer testimonial survey (live test)

**Order matters.** (1) Publish the new `firestore.rules.strict` in Firebase (Firestore > Rules > paste > Publish). (2) Upload the files. (3) Wait for GitHub Pages, hard-refresh (Ctrl+Shift+R), sign in.
Upload: `survey.html`, `styles/survey.css`, `scripts/survey-page.js`, `scripts/core-survey.js`, `scripts/owner-surveys.js`, and the changed `index.html`, `scripts/owner-dashboard.js`, `styles/owner.css`.
Use a second e-mail address of your own as the "employer" for this test. Use a private (incognito) window, not signed in, to play the employer.

1. Owner Panel menu, Business group: **Employer surveys** is there. Pass: yes / no
2. Open it. Fill employer name, your second e-mail, a company, your name, pick a Client ID (or None). Press **Create link**. A "Link ready" box appears with a link that looks like `.../survey.html#k=` and a long code. Pass: yes / no
3. Press **Open e-mail**: your mail program opens with the address, a short message and the link. (Do not send yet, or send it to yourself.) Pass: yes / no
4. Press **Copy link**, open it in the private window. The survey opens, greets the employer by name and shows your name. Pass: yes / no
5. In the private window, change one character of the code in the address and press Enter; then remove everything after `survey.html`. Both show "This survey link is not valid". Pass: yes / no
6. Back on the real link, press **Send my feedback** with nothing filled in: red messages explain what is missing and nothing is sent. Pass: yes / no
7. Tap the 4th star (then use the arrow keys to move it). Write a message, choose Yes, paste a YouTube or Loom link, tick the consent, send. A thank-you page appears and the address bar no longer shows the code. Pass: yes / no
8. Open the same link again (from the e-mail or the copied text). It says "not valid" (it works once). Pass: yes / no
9. Owner Panel: the **Employer surveys** menu item shows a small number 1. Open the page. The answer is under "Answers to review" with the stars, the message and the video link (it opens in a new tab). Pass: yes / no
10. Press **Approve** and confirm. Open **Testimonials**: the new item is there and is switched **OFF**. Nothing changed on the public site. (Switch it on and publish only if you want it live.) Pass: yes / no
11. Make a second link and answer it. Press **Reject** and confirm. It is not added to Testimonials. Pass: yes / no
12. Make a third link, do not answer it. Press **Revoke link** and confirm; open the link: "not valid". The row now has a trash icon; delete it. Pass: yes / no
13. On your phone: open a fresh link. Stars and buttons are easy to tap, nothing runs off the screen, the keyboard does not hide the Send button. Pass: yes / no / not tried
14. In the Firebase console (Firestore): the invite document under `surveyInvites` has NO e-mail; the e-mail is only in `surveyInvitesPrivate`. Pass: yes / no / not tried
15. Owner Panel > Security > connection log still shows no blocked connections. Pass: yes / no

If anything looks wrong, tell me the step number and what you saw. If the survey page says "not valid" for a brand-new link, the rules in step 1 were probably not published yet.

Not part of this test (not built yet): reminder after 3 months, custom surveys, automatic cleanup, backup of survey data.

Rollback: upload the files from `CodeFlow-Portfolio-4.5.0-SV1-rollback.zip` and publish the rules file inside it. (The survey documents already created stay in the database and are ignored.)
