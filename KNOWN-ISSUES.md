# Known issues

No open defects.

## Open verification items (4.5.0 P0)
- **V-1 Emulator tests not yet run.** `rules-tests/emulator/registry.test.mjs` tests the registry rules in Google's real rules engine. The build environment could not download the emulator, so it has not been executed. Run the workflow "Firestore rules (emulator)" (Actions tab) and keep the result. Until then the rules are verified only by the project's own simulator.
- **V-2 Real Firebase check.** After publishing `firestore.rules.strict`, add one client ID, archive and restore it, and open its History.
- **Note (public repository):** the site is served with `.nojekyll`, so every file in the repository (including `internal-docs/` and these notes) is publicly readable.

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
