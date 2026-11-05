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
- R2 (key API restriction): documented in `R2-CHECKLIST.md`, awaiting the owner's run. Remaining after R2: rotate the Sheets token, custom domain move, D1/D2.
