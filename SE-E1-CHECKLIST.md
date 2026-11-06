# SE-E1 stage A live test (4.5.0): App Check in monitoring mode

**Before the upload (2 minutes, no site change):**
- A. Confirm that the key you gave me came from the field labelled **Site key** (not **Secret key**). If it was the Secret key, tell me before you commit anything: it must be replaced and the secret key rotated.
- B. Firebase console > App Check > Apps > your web app > register with the **reCAPTCHA Enterprise** provider and the SITE key. Leave **Cloud Firestore enforcement OFF**. Do not turn enforcement on in this stage.
- C. No Firestore rules change in this stage: do NOT republish rules. Upload the files, then hard refresh (Ctrl+Shift+R).

1. Public page opens and shows your content as usual. Pass: yes / no
2. Press F12 > Console on the public page: no red message that mentions "Content Security Policy", "recaptcha" or "App Check could not start". Pass: yes / no
3. Owner Panel: sign in with Google works as before. Pass: yes / no
4. Send a test request through the discovery-call form: it works end to end (verification code, then submitted). Pass: yes / no
5. Owner Panel > Employer surveys: create a test link, open it in a private window: the form opens. Press F12 > Console there too: no red message about "Content Security Policy" or "recaptcha". Pass: yes / no
6. Answer that survey and send: the thank-you page appears and the answer shows under Answers to review. Pass: yes / no
7. Owner Panel > Security > connection log: no new blocked entries (the three Google hosts are now expected). Pass: yes / no
8. Owner Panel > Security checklist: the App Check line mentions the Enterprise provider and the 7-day check. Pass: yes / no
9. After a few hours: Firebase console > App Check > APIs > Cloud Firestore: the request graph shows **verified** requests (your own visits). Write down the verified and unverified numbers. Pass: yes / no
10. Day 7: look at the graph again and at reCAPTCHA usage (Google Cloud > reCAPTCHA): note verified vs unverified requests and the monthly assessment count (free up to 10,000). Send me the numbers. Enforcement is a SEPARATE step that you decide after this.

If anything fails: restore the files from the rollback ZIP (or set `appCheckSiteKey: ""` in `scripts/settings.js`: everything works without App Check). No console change is needed for a rollback while enforcement is off.
