# SE-E3 live test (4.5.0): the Firebase SDK is served from your own site

Before you start: no Firebase or Google console change and no Firestore rules change. Upload ALL files of the ZIP, including the whole `assets/vendor/firebase/` folder (4 files, `manifest.json`, `README.md`) and `tools/vendor-firebase.mjs`. Then hard refresh (Ctrl+Shift+R). If the site shows blank or "loading" forever after the upload, one of the four SDK files did not upload: check that `assets/vendor/firebase/10.12.2/` on GitHub holds `firebase-app.js`, `firebase-auth.js`, `firebase-firestore.js` and `firebase-app-check.js`.

1. Public page opens and shows your content as usual. Pass: yes / no
2. F12 > Network, type `firebase` in the filter, hard refresh: you see four `firebase-*.js` files loaded from YOUR site (`.../assets/vendor/firebase/10.12.2/...`, status 200), and none from `gstatic.com/firebasejs`. (The reCAPTCHA scripts still come from Google: that is expected.) Pass: yes / no
3. F12 > Console: no red "Content Security Policy" message, and the old `.js.map` lines are gone. Pass: yes / no
4. Owner Panel: sign in with Google works, and sign-out works. Pass: yes / no
5. Send a test request through the discovery-call form: it works end to end. Pass: yes / no
6. Create a test survey link, open it in a private window, answer it: the thank-you page appears and the answer shows under Answers to review. Pass: yes / no
7. Owner Panel > Security > connection log, F12 CLOSED: press Clear log, use the site once, press Refresh: the Blocked list is empty. Pass: yes / no
8. App Check still works: F12 > Application > Clear site data, hard refresh, Network filter `exchange`: status 200. Pass: yes / no
9. Owner Panel > Security checklist: a new line "Firebase SDK version reviewed (every 3 months)" and the web API key line mentions Firebase App Check API. Pass: yes / no
10. Open the site on your phone (and once in a private window): it loads and the form works. Pass: yes / no
11. OPTIONAL, for the curious: on your computer, download https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js (right-click > Save as) and compare its fingerprint (PowerShell: `Get-FileHash firebase-app.js`) with `originalSha256` of `firebase-app.js` in `assets/vendor/firebase/manifest.json`. If they match, the copy on your site is the same official file. If they differ, tell me (it is not necessarily a problem: the CDN may add a line ending or a banner).

If anything fails: restore the files from the rollback ZIP (it puts back the Google address and the old CSP); the `assets/vendor` folder can stay or be deleted.
