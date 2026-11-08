# RS-1 checklist: publish the strict Firestore rules (about 10 minutes)

What changes: only the Firebase console. No website file changes. The strict rules file (`firestore.rules.strict`) differs from the file you
use now (`firestore.rules`) in ONE rule: the "or this email address" fallback for the owner is removed. After this, the owner is recognized by
your account ID alone. Every other rule is identical. The strict file is the one the automatic emulator tests (GitHub Actions) run against.

## Before you start (do not skip)
1. GitHub > your repository > **Actions**: the latest "rules emulator" run on `main` is **green**. If it is red, stop and tell me.
2. Open the site, sign in to the Owner Panel, open **Security**. Find your **account ID** (a long mix of letters and numbers).
3. Open `firestore.rules.strict` in the repository, find the line `function ownerUid() { return '...'; }` (line 13).
   The ID between the quotes must be exactly the same as the account ID in step 2 (it starts with `3p2Y`).
   - Same: continue. Different: STOP. Publishing would lock you out. Tell me.

## Publish
4. Firebase console > your portfolio project > **Firestore Database > Rules**.
5. Select everything in the box and delete it. Open `firestore.rules.strict` in the repository, click **Raw**, select all, copy, paste into the box.
   The first line should read `// STRICT OWNER MODE: ...`.
6. Click **Publish**. If a red error shows, do NOT continue: send me a screenshot.

## Live test
7. Open the site in a new tab and hard refresh (Ctrl+Shift+R). Sign out of the Owner Panel, then sign in again with the Google button. The panel opens.
8. To-do: add one test task, then delete it.
9. Library and WorkTrack pages load their data.
10. Send one real discovery meeting request as a visitor (private window). It arrives in the Owner Panel.
11. F12 > Console: no red `permission-denied` lines during steps 7 to 10. (Extension-blocked lines `ERR_BLOCKED_BY_CLIENT` and the Google sign-in popup messages are normal.)

## If something fails or you are locked out
- The Firebase console always opens for you, whatever the rules say. Go to Firestore > Rules, paste `firestore.rules` (the old file), click Publish. Takes about a minute. Then tell me which step failed.

## After it passes
Tell me and I record the live rules as "strict" in the docs. Keep both files in the repository as they are.
