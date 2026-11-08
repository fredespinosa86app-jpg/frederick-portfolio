# GS-1 checklist: "Sign in with Google" button (about 8 minutes)

What changed: the header login control now shows Google's official "Sign in with Google" button while you are signed out.
Clicking it does exactly what the old "Owner login" button did (same Google popup). After you sign in it goes back to the plain "Owner panel" button.
The Google artwork files are the ones you downloaded from Google, unchanged. Nothing new is loaded from the internet.

Files: `index.html`, `scripts/owner-entry.js`, `styles/components.css`, the new folder `assets/images/google-signin/` (4 images + a README), and the new test file.

1. Upload the files (keep the folder name `assets/images/google-signin`), commit, wait 1-2 minutes, then hard refresh (Ctrl+Shift+R).
2. Open the site the way you normally reach the login (a device you signed in on before, or add `#owner` to the web address).
   You should see a white pill button with the coloured Google "G" and the words "Sign in with Google" in the header, left of the moon button.
3. Click it. Google's sign-in popup should open. Sign in. You should land in the owner panel, and the header button should now read "Owner panel" (plain, with the person icon).
4. Sign out. The Google button should come back.
5. Press the moon button (dark mode). The button should turn dark with the same "G" and words.
6. Make the window narrow, or use your phone. The button becomes a small round "G" only. Tap it: the popup opens.
7. Press the Tab key until the button is selected. You should see a clear blue outline (white in dark mode). Press Enter: the popup opens.
8. Optional: press F12, open the Console, reload. There should be no red messages about "Content Security Policy" or missing images.

If something fails: tell me the step number and send a screenshot.
Quick undo: upload the rollback ZIP files (3 files), and delete the folder `assets/images/google-signin` and `rules-tests/browser/gs1-1-signin-button.mjs`.
