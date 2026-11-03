# Security final report - AI-Automated Online Portfolio (Phase S6)

Build: CodeFlow-Portfolio-Security-Phase-6 (on top of Phase 8.1 + S1-S5.1). Free Firebase Spark plan, GitHub Pages. Nothing here upgrades or adds a paid service.

## 1. Status of the 15 findings from the assessment
| # | Finding | Status | What is left |
|---|---|---|---|
| 1 | Public write endpoints not bot-protected | **Partly closed.** Strict field/size/format rules, id binding (no replays), emergency Pause, flood counters. App Check code is in place but **not enforced**: Google returned HTTP 400 for the reCAPTCHA Enterprise key | Owner: fix/retest the App Check key, then switch enforcement on (or leave the key blank) |
| 2 | Free quota can be exhausted on purpose | **Partly closed.** Cached content keeps the site showing; Pause button; flood warning | App Check enforcement; one-summary-per-visit analytics was not approved |
| 3 | No CSP / security headers | **Mostly closed.** Meta-tag CSP, self-hosted fonts, no inline handlers | Real HTTP headers need Cloudflare in front of a custom domain (not chosen) |
| 4 | Owner check by email only | **Closed in code.** UID + verified Google provider; `firestore.rules.strict` removes the e-mail fallback | Owner: publish the strict file and confirm sign-in still works |
| 5 | Owner session never expires | **Closed.** Session-only sign-in, idle timeout, Sign out | - |
| 6 | Webhook address public | **Ready.** Worker v2 hides it | Only relevant once you have a webhook: deploy the Worker |
| 7 | Prompt injection | **Closed on our side.** Client screen, Worker screen + guard fields + answer checks | When you add an AI step, paste the guard text and give it no tools |
| 8 | Firebase console unverified | **Closed.** You confirmed the five checks | - |
| 9 | No retention / export plan | **Closed.** Retention periods, cleanup, person export/delete, new notice | Run cleanup monthly; review the notice wording |
| 10 | No backup | **Closed.** Backup + validated restore (S5.1) | Download a backup regularly and keep it private |
| 11 | Site can be framed | **Partly closed.** Frame-guard script | Real `frame-ancestors` header needs Cloudflare |
| 12 | Rules not tested | **Closed.** 123 attack cases against the real rules text + 15 mutation checks; emulator tests shipped but could not be run here | Optional: run `rules-tests/owner.test.mjs` with the official emulator |
| 13 | No email/date format checks | **Closed.** In the rules | - |
| 14 | Worker rate limit per instance | **Mitigated.** Four in-Worker limits | Optional free Cloudflare rate-limit rule |
| 15 | Fonts leak IP; unescaped chatbot text | **Closed.** Self-hosted fonts; owner text escaped | - |

## 2. S6 attack tests and results
**Rules (123 cases, real `firestore.rules` text).** Visitors and signed-in strangers cannot read or list any private collection; no unknown or nested path is reachable; no catch-all rule exists; visitors cannot write owner collections; meeting requests, chat questions and visit records reject extra fields, missing fields, wrong types, oversized values, bad email/date/time/time-zone formats, forged status, forged or past timestamps, ids not tied to the content, and replays (a second write of the same id is an update and is refused); the emergency Pause, full capacity and a confirmed time slot each block what they should; wrong sign-in provider, unverified email or another account with the owner's email are refused (strict file: also refused for a different UID); the owner cannot bypass the shape rules for visitor-created data. **15 of 15** deliberate weakenings of the rules were detected.
**Browser (34 checks).** A visitor who forces the owner panel open (developer tools) sees it hidden again and no private collection is requested; script and HTML payloads in the URL, hash and query are not reflected; hostile data in settings, services, toolkit, FAQ, training, experience, videos, testimonials, chatbot name/avatar/answers, SEO and image fields renders as inert text and no `javascript:`/non-image URL reaches a link or image; hostile visitor data (requests, chat questions, clients, activity) is inert in every owner page; typed HTML shows as literal text; form fields carry length limits at or below the rules' limits. A planted vulnerability (an `innerHTML` sink) was detected by the same test, and the browser's CSP blocked 180 inline-handler executions in that run.
**Worker (11 tests), backup engine (7 tests), accessibility (axe), small-screen layout, and all earlier regression suites** pass.
**One real fix found in S6:** the owner-panel code could be forced visible by a visitor and would then fire (denied) database requests; it is now hidden again and no panel code runs without a verified owner sign-in. The rules were already protecting the data.

## 3. Honest limits
- The rules interpreter is mine, not Google's engine; it only knows the constructs these rules use and raises an error on anything else. It was checked with positive controls and mutation tests, but it is not a substitute for the official emulator.
- No test was run against the live Firebase project, Cloudflare or a real AI workflow. Quota exhaustion, App Check behaviour and real headers cannot be tested from here.
- Owner-side protections that cannot be proved from code: your Google account (keep 2-Step Verification on), your GitHub account, and where you keep backups.

## 4. Routine for the owner
Monthly: Privacy & backup > Download backup; Check what is due > Delete due records; Security > Check now. Yearly: renew `security.txt` (expires 2027-10-31). After any rules change: `python3 rules-tests/attack/attack_cases.py .` and `mutation_check.py .`. If something looks wrong: INCIDENT-CHECKLIST.md.
