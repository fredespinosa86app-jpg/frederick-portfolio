# SE-E1 stage A live test (4.5.0): App Check in monitoring mode

**Before the upload (set up once in Google Cloud and Firebase; no site change). These four were needed in the live setup:**
- A. Google Cloud console > Security > Fraud Defense > **Keys**: a **Website**, score-based (no checkbox) key for the domain `fredespinosa86app-jpg.github.io` must exist IN THIS PROJECT. Its Key ID is the public site key in `scripts/settings.js`. A key made on the old reCAPTCHA admin page did NOT appear here and caused HTTP 400 ("site key is not from the same project"). Do not enable billing.
- B. Google Cloud console > APIs & Services > Enabled APIs: **reCAPTCHA Enterprise API** and **Firebase App Check API** must both be enabled (without the first: HTTP 400 FAILED_PRECONDITION).
- C. Google Cloud console > APIs & Services > Credentials > **Browser key** > API restrictions: add **Firebase App Check API** to the allowed list (without it: HTTP 403 API_KEY_SERVICE_BLOCKED). Keep the other APIs and the website restriction.
- D. Firebase console > App Check > Apps > your web app > **Fraud Defense (reCAPTCHA Enterprise)** with the same Key ID, token lifetime 7 days. Leave **Cloud Firestore enforcement OFF**.
- E. No Firestore rules change: do NOT republish rules. Upload the files, clear the site data once (F12 > Application > Storage > Clear site data: Firebase pauses App Check for a day after a failed attempt), hard refresh.

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
