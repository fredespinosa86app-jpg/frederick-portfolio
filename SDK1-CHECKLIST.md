# SDK-1 checklist: Firebase library upgrade 10.12.2 to 12.19.0 (about 15 minutes)

What changed: the copy of Firebase's web library that your site serves from its own `assets/vendor/firebase/` folder is now version 12.19.0
(was 10.12.2). It was taken from the official npm package and checked against the checksum npm publishes. Nothing else changed:
no Firestore rules change, no Worker change, no Firebase or Google console change.

Files: upload ALL files from the ZIP (keep the folder names), including the new folder `assets/vendor/firebase/12.19.0/` (4 files),
`assets/vendor/firebase/manifest.json` and `README.md`, `index.html`, `survey.html`, and the three scripts. You may leave the old folder
`assets/vendor/firebase/10.12.2/` in place for now (it is used only by the rollback).

1. Upload, commit, wait 1-2 minutes. Hard refresh (Ctrl+Shift+R). If something looks stale, close the tab and open the site again.
2. Press F12 > Network, type `firebase` in the filter, and reload. You should see `firebase-app.js` and others loaded from YOUR site
   with `12.19.0` in the address (status 200). If you still see `10.12.2`, hard refresh again.
3. Press F12 > Console. Look for red messages that mention "Content Security Policy" or "Firebase". There should be none. (Yellow warnings are OK.)
4. Sign in with the Google button. The Google popup should open and the owner panel should open after you sign in.
5. In the owner panel open To-do, Library, WorkTrack and Settings. Data should load as before. In To-do, add one test task and then delete it.
6. Press Sign out, then sign in again (checks that the saved sign-in still works). Close the tab, open the site again and check the owner login behaves as before.
7. As a visitor (a private window is fine): send one real discovery meeting request. It should go through and arrive in the dashboard.
8. Open the survey page (`survey.html`). It should load and show its normal message for a page without a valid invite.
9. Open the dashboard App Check page. Tomorrow (not today) check that App Check still shows requests for your web app in the Firebase console.
   Do not turn enforcement on.

If something fails: tell me the step number and send a screenshot of the Console (F12).
Quick undo: upload the rollback ZIP (it restores the old library files, the manifest and the version references), then hard refresh.
After everything has passed for a few days you can delete the folder `assets/vendor/firebase/10.12.2/` from GitHub.
