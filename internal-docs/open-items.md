# Open items (internal; public repository, nothing secret here)

## Firebase web key restriction (started 2026-11-05, parked until B2 is resolved)
- Goal: close the GitHub "exposed key" alert by restricting the Firebase web API key to the site's own addresses. The key is public by design; Firestore rules are the real protection.
- Finding: Google Cloud > APIs & Services > Credentials shows "No API keys to display" for project my-online-portfolio-db2a5, although the key in `scripts/settings.js` matches the Firebase console. The OAuth client "My Online Portfolio" is listed.
- A new key can be created, but the new form requires choosing APIs. Identity Toolkit API and Token Service API were enabled in the Library and can be chosen; "Cloud Firestore API" is not offered in the list. A key without Firestore would break the site, so the key was NOT created and `settings.js` is unchanged.
- Website restrictions prepared: `https://fredespinosa86app-jpg.github.io/*`, `https://my-online-portfolio-db2a5.firebaseapp.com/*`, `https://my-online-portfolio-db2a5.web.app/*`.
- Options when resumed: (a) try the filter "firestore" / Library "Cloud Firestore API" again; (b) stop and dismiss the alert as "public by design / used in tests".
- Raise this again right after B2 is verified (emulator 131 of 131, rules republished).

## Update 2026-11-05: new restricted web key made and swapped in (`scripts/settings.js`)
- New key "Portfolio web key": website restrictions (github.io, firebaseapp.com, web.app) and API restrictions (Identity Toolkit, Token Service, Cloud Firestore).
- Old key stays alive until the live test passes (sign-in, owner data pages, public pages); then delete the old key in Google Cloud > Credentials (it was not listed there, so it may need to be deleted from the Firebase console / left as is) and close the GitHub alert.
- To go back: restore the old `apiKey` line (the old key starts `AIzaSyAZpd6C`).
- 2026-11-05: first sign-in test failed with auth/requests-from-referer-blocked because the restriction had a typo (86-app); correct address is fredespinosa86app-jpg.github.io.
- 2026-11-05 ROLLED BACK: with the new key, sign-in failed with auth/configuration-not-found (400 CONFIGURATION_NOT_FOUND on get_project_config). The new key was probably made in a different Google Cloud project than the Firebase project (same display name, different project ID; that project also holds the "My Online Portfolio" OAuth client). `scripts/settings.js` is back on the old key. To resume: confirm the Cloud project ID is my-online-portfolio-db2a5 (the Firebase projectId), look for the key there, or drop the restriction work and dismiss the GitHub alert as public by design. The stray new key should be deleted from the wrong project.

## Decision 2026-11-05: Phases M1, M2, M3 skipped (owner decision)
- Owner chose to keep leads in Firestore under the existing rules and keep the Google Sheet as a copy synced by the owner panel (as today, via `google-sheets-script.gs`).
- The Rev 2 principle "Sheet holds lead details, Firestore only Lead ID and status" is therefore NOT implemented. Names/emails stay in `meetingRequests` (and `clients`).
- Existing protections stay: rules limits, retention and scrub tools (owner-privacy), backups, token-protected Sheets sync.
- Reason: a public Apps Script endpoint would add a flood/lock-out risk (global caps only) and make lead capture depend on Google availability.
- Can be reopened later; the M1-M3 outlines were reviewed in conversation only (no code written).
- Next planned phase: D1 (documentation portal). Open question for D1: where private docs live (repo is public).

## Update 2026-11-05: Project F, phase F5 built
- Worker `portfolio-forms`, rules (visitor token, daily counter, `tokenRequired` switch, cap in `content/guard.cap`), tests and runbook delivered; awaiting the owner's service-account key, Worker deploy, emulator run and rules republish. Switch stays OFF until F7.
- F6 is verified live. F7 (switch-over, rollback drill, monitoring, Safari owner decision) is documented in `F7-CHECKLIST.md`; DONE 2026-11-06: switch is ON in production. Project F complete. D1 and D2 stay parked until Project F is done.

- R1 (reads reduction) built: browser cache for visitors, awaiting live check. Approach B (Worker-served content) stays an option if traffic grows.
- R2 (key API restriction): DONE 2026-11-06 (live test passed). Remaining after R2: rotate the Sheets token, custom domain move, D1/D2.
- D1 (Owner documents) DONE 2026-11-06 (live test passed, emulator 187/187). Open: which existing public docs to move into the portal. D2 scope still to be defined.

## Decision 2026-11-06: Phase D2 rejected (owner decision)
- D2 (moving existing docs into the Owner documents portal and cleaning the public repo) will not be built. Reason: build history and documentation already live in `README.md`.
- Existing docs stay where they are. The Owner documents page (D1) stays available for new private notes. Can be reopened later.
- S1 (Sheets token rotation): DONE 2026-11-06 (token rotated, sync verified). Remaining after S1: custom domain move (optional). D2 rejected.

## Update 2026-11-06: remaining security list (owner decision)
- Done by the owner: two-step verification on Google (also covers Firebase) and GitHub.
- TODO 1: turn on two-step verification on the Cloudflare account (owner action, no code).
- TODO 2: add a Cloudflare rate-limit rule in front of the form Worker (`portfolio-forms`) as a harder backstop for its per-instance limits (free plan; owner action, checklist to be written).
- TODO 3 (DONE in S2-C2, live-verified; S2-C3 `img-src`/`media-src` DONE, live-verified): tighten the page's Content Security Policy `connect-src` from `'self' https:` to only the addresses in use (Firebase, the form Worker, and any chat/Calendar/Sheets address in use); needs a code change and a live test.
- Optional, not security: custom domain move.

## Update 2026-11-06: WorkTrack W5 (owner approved Revision 2 of the QA layout)
- QA review accepted: R1 to R10 (see the layout doc). Confirm-step audit done: no change needed (see `4.5.0-W5a-floating-clock.md`).
- W5a floating clock: AUTOMATED_TESTED, awaiting the owner's live test (`W5a-CHECKLIST.md`). Then W5b (schedules, lateness flicker; includes R2 effective-from rule, R3, R4, R5, R6) and W5c (alarm; R7, R10), each stopping for approval.
- Status labels from now on: DESIGNED, IMPLEMENTED, AUTOMATED_TESTED, MANUALLY_VERIFIED, PRODUCTION_APPROVED.
- Other QA findings parked: retention policy for old meeting requests; streamed size limit in the chat Worker (chat is scripted only); module-dependency note for the docs.

## Update 2026-11-06: W5a verified, W5b built
- W5a: MANUALLY_VERIFIED (owner live test passed).
- W5b (schedules, lateness, flicker; R2 to R6): AUTOMATED_TESTED, awaiting rules republish and the owner's live test (`W5b-CHECKLIST.md`). Next: W5c (alarm; R7, R10) after approval.

## Update 2026-11-06: W5b verified
- W5b: MANUALLY_VERIFIED (owner live test passed: card, schedule choice, lateness, flicker, refused values not stored). GitHub emulator run passed 206/206 against `firestore.rules.strict`. Next: W5c (alarm; R7, R10), awaiting layout approval. Optional additions noted for W5c: a "next corner" move button and "Reset position" on the WorkTrack page (in the layout doc but not in W5a).

## Update 2026-11-06: W5c built
- W5c (alarm; R7, R10, Corner and Reset-position buttons): AUTOMATED_TESTED, awaiting the owner's live test (`W5c-CHECKLIST.md`). No rules, CSP or database change. After it passes the W5 plan is complete.
- Still open (unchanged): Cloudflare 2FA, Cloudflare rate-limit rule for `portfolio-forms`, tighter CSP `connect-src`, retention policy for old meeting requests, optional custom domain move.

## Update 2026-11-06: W5c live result
- Passed live: alarm card, sequence, stops, no replay, sounds, Corner and Reset position buttons.
- Not yet seen live (owner): notifications (B10) and the title rule R7. Stay AUTOMATED_TESTED until tried. W5 plan is complete apart from these two checks.
- 2026-11-06 follow-up: tab title confirmed live. Notifications: blocked by the browser for this site; owner can allow them in the browser's site settings and retry step B10, or leave them off (the alarm sound, title and pulse work without them).

## Update 2026-11-06: security enhancement review list (owner request, status DESIGNED)
Five items recorded in `4.5.0-security-enhancement-review.md`, each needing the owner's approval before a build: **E1** App Check enforcement (monitor first), **E2** real security headers (needs a Cloudflare domain move; optional), **E3** pin or self-host the Firebase SDK (recommended first), **E4** navigation and calendar-frame residual risk (trim `frame-src` to the provider in use), **E5** independent review (prepare a review pack; the review itself needs another person). Recommended order: E3, E1, E5, E4, E2.

## Update 2026-11-06: T2 icon buttons built
- T2 (icon buttons on the other dashboard pages): MANUALLY_VERIFIED (live test passed). No rules, CSP or database change. Remaining approved items: security enhancement review E1 to E5 (recommended order E3, E1, E5, E4, E2).


## Update 2026-11-07: SV1 employer survey built
- SV1 (employer testimonial survey, `survey.html` + Owner Panel > Employer surveys): AUTOMATED_TESTED, awaiting the owner's live test (`SV1-CHECKLIST.md`). Rules changed (new collections `surveyInvites`, `surveyInvitesPrivate`, `surveyResponses`): publish `firestore.rules.strict` BEFORE uploading the files.
- SV2 (designed, not approved): custom surveys; 3-month reminder from a Client ID `startDate`; automatic deletion of unanswered invites (expiry + 30 days); survey data in backup export / restore; privacy-notice line.
- Emulator test `rules-tests/emulator/survey-sv1.test.mjs` is written but has not been executed anywhere yet (it runs in GitHub Actions on the next push).

## Update 2026-11-07: SV1 live-tested, SV2a built
- SV1: MANUALLY_VERIFIED (all steps incl. 3, 16, 17). Decisions kept: YouTube/Loom links stay in the survey list; only a Google Drive link becomes "Watch Testimonial Video".
- SV2a: reminders (`surveyReminders`, separate from the registry on purpose: the registry is shared with billing/work hours and audited), manual cleanup, survey collections in backup (export-only), privacy line. AUTOMATED_TESTED; awaiting `SV2A-CHECKLIST.md`.
- SV2b not built: custom surveys (templates, snapshot into the invite, validated answer shape). Needs its own layout round and rules.
- Still open from before: retention periods for rejected answers (kept until the owner deletes them), security enhancements E1-E5 (recommended order E3, E1, E5, E4, E2), optional "Build" footer label.

## Update 2026-11-07: SV2a verified, SV2b built
- SV2a: MANUALLY_VERIFIED (all 14 steps).
- SV2b (custom surveys): built and AUTOMATED_TESTED, awaiting `SV2B-CHECKLIST.md`. Decisions: extra questions only; templates export-only in backups; limits 10 surveys / 6 questions.
- Known limits: the 10-survey cap is page-enforced; each sent link keeps its own question copy (editing a template never changes it); extra answers are never published and are not part of the testimonial.
- Still open: retention period for rejected answers (kept until the owner deletes them), security enhancements E1-E5 (order E3, E1, E5, E4, E2), optional "Build" footer label.

## Update 2026-11-07: SV2 complete
- SV2b: MANUALLY_VERIFIED (all 15 steps). The whole survey feature (SV1, SV2a, SV2b) is live-tested.
- Still open (none approved to build): retention period for rejected answers (kept until the owner deletes them), security enhancements E1-E5 (recommended order E3, E1, E5, E4, E2), optional "Build" footer label, a rules-side cap on the number of surveys (needs a counter document).

## Update 2026-11-07: security enhancement E6 added (status DESIGNED, nothing built)
**E6** Cloudflare Turnstile for the forms Worker, plus a two-level chatbot (AI first, scripted fallback when any limit is reached; the fallback idea is the owner's). Recorded in `4.5.0-security-enhancement-review.md`. Naming: call them SE-E1 to SE-E6 (the README has older finished "Enhancement E1 to E4"). Recommended order now: E3, E6, E1, E5, E4, E2. Prompt for a new session: `SE-prompt.md`. Part B (chatbot) only if an AI chatbot is added.

## Update 2026-11-07: SE-E1 stage A built (App Check monitoring), awaiting live test
`SE-E1-CHECKLIST.md`. Next for E1: after 7 days of clean numbers the owner decides on enforcement (console only, separate step). Remaining security items: E3, E6, E5, E4, E2 (recommended order E3, E6, E5, E4, E2; each needs approval first).

## Update 2026-11-07: SE-E3 built (Firebase SDK served from this site), awaiting live test
`SE-E3-CHECKLIST.md`, `assets/vendor/firebase/README.md`. SE-E1 stage A still in its 7-day monitoring window (decision on enforcement on 2026-11-14). Remaining security items: E6, E5, E4, E2 (each needs approval first). Possible later: SDK upgrade as its own item.

## Update 2026-11-07: SE-E6 built (Turnstile + chatbot switch), awaiting live test
`SE-E6-CHECKLIST.md`. Owner-side: Worker redeploy, TURNSTILE_SECRET already set by the owner, upload site files, approve privacy wording. Waiting: SE-E3 live test, SE-E1 day-7 numbers on 2026-11-14. Remaining security items: E5, E4, E2 (each needs approval first); Part B2 only if an AI chatbot is enabled.

## Update 2026-11-07: SE-E5 built (review pack and owner checklist)
`SECURITY-REVIEW-PACK.md`, `SECURITY-REVIEW-OWNER-CHECKLIST.md`. Owner: pick a reviewer, run the free scans, confirm the published rules file. Waiting: SE-E1 day-7 numbers on 2026-11-14. Remaining security items: E4 (needs the calendar provider choice), E2 (only if the domain moves).

## Update 2026-11-07: SE-H1 built, LIVE-TESTED and published (strict rules, emulator green)
`SE-H1-CHECKLIST.md`. Order: upload files, green Actions emulator run, then publish rules, then live test. Not yet approved from the QA review: F-02 shared single-use challenge consumption, F-01 Turnstile-first code path, optional removal of `style-src 'unsafe-inline'`, moving `internal-docs/` and the review pack out of the public repo. Still waiting: SE-E1 day-7 numbers on 2026-11-14.

## Update 2026-11-07: SE-E2 recorded as an open item
SE-E2 (real security headers via Cloudflare in front of a custom domain). Needs a domain the owner buys or already has (about $10-15 a year); cannot work on github.io. Layout was shown; the owner has not approved it. Recommendation: do it only if a custom domain is wanted anyway, otherwise skip. Order if approved: domain and Cloudflare DNS, GitHub Pages custom domain, update every allowed-origin list (Worker, Turnstile, Firebase auth, OAuth, App Check), Report-Only CSP trial, live test, rescan.

## Update 2026-11-07: R4 built (rejected survey answer retention + drawer search), awaiting live test
`R4-CHECKLIST.md`. Item 9 of the open list is done once the owner picks a period (the owner's decision). Still open: F-02, F-01, `unsafe-inline` styles, private documents out of the public repo, SE-E4, SE-E2 (needs a domain), SDK upgrade, Part B2, App Check numbers on 2026-11-14 (reminder set).
