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

Note: a line "fs.orderBy is not a function" can appear from unrelated owner-panel modules because the stand-in database is minimal; it is filtered out of the page-error check.
