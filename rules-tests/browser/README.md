# Browser tests for the floating clock (W5a)

These run the real page in headless Chromium with an in-memory stand-in for the database (no Firebase, no network).
They prove the clock's behaviour on screen; they do NOT prove sound, Safari, or the real database (those are live checks in W5a-CHECKLIST.md).

Run (needs Node 20+ and Playwright with Chromium):

    cd rules-tests/browser
    node w5a-1-lifecycle.mjs
    node w5a-2-drag-dashboard.mjs
    node w5a-3-sync-a11y.mjs

Each prints PASS/FAIL per check and "ALL PASSED" at the end. Not part of the GitHub Actions emulator run.

W5b (schedules and flicker):

    node w5b-1-schedules.mjs
    node w5b-2-rules-of-choice.mjs
    node c1-1-discovery-call.mjs
    node r3-1-retention.mjs
    node t1-1-training-cats.mjs
    node s2-1-auth-reminder-connlog.mjs
    node s2c2-1-connect-rule.mjs
    node s2c3-1-img-media-rule.mjs
    node t2-1-icon-buttons.mjs

Note: the stand-in database now also offers orderBy and limit, so the owner dashboard modules load without errors.

## SV1 (employer survey)
`node sv1-1-survey.mjs` runs the real `survey.html` (real CSP, fake Firebase SDK) and the Owner Panel surveys page, and records the page's writes in `/tmp/sv/captured.json`. Copy that file to `../attack/sv1_captured.json` and run `python3 ../attack/sv1_replay.py ../..` to check the page's writes against the real rules text.

TD1 (To-do & focus and its floating focus clock):

    node td1-1-todo-focus.mjs
