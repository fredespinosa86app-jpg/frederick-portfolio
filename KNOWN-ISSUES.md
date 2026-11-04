# Known issues

No open defects.

## Verification status (4.5.0)
- **P0 Client IDs: VERIFIED.** The real-engine emulator tests (workflow "Firestore rules (emulator)") passed 24 of 24, and the live Client IDs page was tested by the owner (add, custom ID, notes, archive and restore with reasons, history, two tabs).
- **W1 WorkTrack: VERIFIED.** Emulator 39 of 39 passed; offline disables the punch buttons; the two-tab "changed in another tab" message works.
- (history) W1-E was: `rules-tests/emulator/worktrack.test.mjs` was written but could not be executed in the build environment (no emulator download). Run the workflow "Firestore rules (emulator)" from the Actions tab. All tests, including the 108-case state-machine comparison and the concurrent clock-in test, must pass.
- **W1-R Real Firebase check.** After publishing `firestore.rules.strict`: clock in, take a break and come back, clock out, reload mid-session, then open the page in two tabs and press a punch in the second (it must say the page changed in another tab).
- **W2 client assignment: VERIFIED.** Emulator 50 of 50 passed (39 earlier + 11 new) and the live tests passed.
- (history) W2-E was: `rules-tests/emulator/assign.test.mjs` could not be run in the build environment (no emulator download). Run the workflow "Firestore rules (emulator)"; expect the earlier 39 plus the new assignment tests, all passing.
- **W2-R Real Firebase check.** After publishing `firestore.rules.strict`: pick two clients before clocking in, clock in (both must appear); add and remove a client during the session; check an archived client cannot be added but can be removed; close the session and confirm the list is read-only; try two tabs.
- **Known limits of W2:** the 10-client limit is enforced by the page, not the database; picks made before clocking in live in this browser only (lost if browser data is cleared); console access can still change data.
- **W3-E Emulator tests for corrections, the sealed log and settings: AWAITING EXTERNAL VERIFICATION.** `rules-tests/emulator/wtlog.test.mjs` was written but could not be executed in the build environment (no emulator download). Run the workflow "Firestore rules (emulator)"; expect the earlier 50 plus the new W3 tests, all passing. This run also confirms, in the real engine, the rules functions the simulator only imitates (timestamp + duration, timestamp comparison).
- **W3-R Real Firebase check.** After publishing `firestore.rules.strict`: change the time zone setting; clock in and out; press "Start the tamper-evident log"; punch, add a client, then "Verify the log" (expect Intact); correct the clock-out time and add a missed break; download the witness file and compare it; open Firebase Console and change one record's time to see Verify report the break (then restore it); check the Firebase usage tab.
- **Known limits of W3:** console access can still change data (the log DETECTS it); the newest seal is only protected by the witness copy you keep; Verify reads every record (a few hundred reads on a normal account); settings changes keep only the previous value, not a full history.
- **Note (public repository):** the site is served with `.nojekyll`, so every file in the repository (including `internal-docs/` and these notes) is publicly readable.
- **Known limits of W1:** someone with Firebase console access can still change data (the tamper-evident chain is planned for W3); the "counter in the event ID" is built by the page and checked by the rules, but a hand-written record by the owner account could still use a wrong time zone name or date text (the time itself is always the server's).

## FIXED in E4.1: KI-1 Toolkit still appeared after "Show the Toolkit section" was unchecked
- **Cause (found and reproduced):** `scripts/content.js` re-evaluated the Toolkit section every time the toolkit list was applied (`sec.hidden = !shown`), which switched the section back on after the owner's switch had hidden it. The menu link stayed hidden, so only the section reappeared. How I Work was unaffected because no other script touches it.
- **Fix:** the owner's Optional sections switch is now remembered in one place (`window.__secOff`) and the content script obeys it. Test `qa_e41` fails on the E4 build and passes on E4.1.

### Original report (kept for the record)

## KI-1 Toolkit still appears after "Show the Toolkit section" is unchecked (reported after E1, 2026-11-04)
- **Reported:** the How I Work switch works; with the Toolkit switch unchecked and saved, "Toolkit" still appears on the public page.
- **Status:** FIXED in E4.1 (deferred on purpose in E1 to E4).
- **Tested in the build environment:** both switches hide the standalone sections and their menu links (cached and live, 40 E1 checks). So the cause is not yet reproduced.
- **To check first when fixed:**
  1. Is the "Toolkit" the owner sees the standalone section (`#toolkit`) or the Toolkit list inside a Training category? The Training lists are intentionally NOT affected by the switch.
  2. Was the change saved (Save sections) and is `settings/site.sections.toolkit` `false` in the database?
  3. Is an older cached copy of the page or scripts being served (hard refresh, version tag)?
  4. Another script re-showing `#toolkit` (content.js re-renders the Toolkit rows; section-bg.js) or the menu link in another place.
- **Do not ship a change for this until the cause is reproduced and a test is added.**
