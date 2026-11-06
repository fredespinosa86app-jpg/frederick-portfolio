# Prompt: CodeFlow Portfolio 4.5.x, Security enhancements SE-E1 to SE-E6

Paste everything below into a new session together with the latest portfolio ZIPs (`CodeFlow-Portfolio-4.5.0-SV1.zip`, `-SV2a.zip`, `-SV2b.zip` and `SV2b-docs-update.zip` applied on top of the repo, in that order) and `Security-enhancement-review-list.zip` (or the updated `internal-docs/4.5.0-security-enhancement-review.md`).

---

## Who and what

I am Frederick Espinosa (Philippines, Asia/Manila), an Amazon Product Researcher / virtual assistant. My site is a static HTML/CSS/vanilla-JS "CodeFlow Portfolio" 4.5.0 on GitHub Pages (https://fredespinosa86app-jpg.github.io/frederick-portfolio/), Firebase Spark (project `my-online-portfolio-db2a5`: Auth, Firestore, no paid features) and a Cloudflare Worker `portfolio-forms` (Free plan). No frameworks, no build step, no inline scripts. I am not a developer: explain in plain words and give me numbered checklists I can follow.

## Standing rules (always)

1. Security first. Check the existing system structure before implementing anything.
2. Show the **layout and decisions first**; **do not build until I say "approved to build"**. One item at a time unless I approve a group.
3. Never ask me to paste, and never write into chat or the repo, secrets, recovery codes, passwords or API keys. Public site keys are fine; secrets go only into the Worker's or console's own settings, entered by me.
4. Workflow per item: layout, my approval, build, tests, ZIP plus a rollback ZIP (verify by unzipping), README / KNOWN-ISSUES / `internal-docs/open-items.md` / checklist updates, a commit title and description (end the description with the two trailer lines the session gives you), then stop for my live test.
5. Keep my style: owner-panel icon buttons (`dashKit.iconBtn`), `confirmBox` with an explicit OK label, `el()` helper, text via `textContent` only.
6. Anything that changes Firestore rules ships `firestore.rules.strict` and the transition `firestore.rules` with identical logic, covered by the attack simulator, mutation tests and emulator tests.
7. Naming: these are **SE-E1 to SE-E6**. The README has older, finished "Enhancement E1 to E4" sections; they are unrelated.

## What to read first (the real files, not this summary)

- `internal-docs/4.5.0-security-enhancement-review.md` (the six items with today's state, risks, options, plans), `internal-docs/open-items.md`, `SECURITY-FINAL-REPORT.md`, `internal-docs/4.5.0-S2-security.md`.
- `scripts/form-guard.js`, `scripts/owner-panel.js`, `index.html` (CSP meta tag), `scripts/csp-guard.test.mjs`, `scripts/form-guard.test.mjs`, `scripts/frame-guard.js`.
- `server/portfolio-forms-worker.js` (+ test, + `portfolio-forms.wrangler.toml`), `server/chat-proxy-worker.js` (+ test), `scripts/chatbot.js`, `scripts/chat-engine.js`.
- `rules-tests/` (attack simulator, mutation tests, emulator tests, browser tests) and the GitHub Actions workflow.

## The six items (summary only; the review document has the detail)

- **SE-E3** Pin or self-host the Firebase SDK (today loaded from `www.gstatic.com`, version only in the URL). Recommended: vendor the exact files under `assets/vendor/firebase/<version>/`, SHA-256 manifest, test that fails on a changed hash or any `gstatic.com` URL, then tighten `script-src`. Small, no owner setup except getting the files if this workspace cannot reach gstatic.
- **SE-E6** Cloudflare Turnstile for the forms Worker (Part A, buildable now) and a two-level chatbot (Part B, only if an AI chatbot is added): AI first; when any limit is hit (session, address, daily budget, emergency pause, Worker down or out of quota, Turnstile failed) the page switches for the rest of the session to the scripted chatbot, shows one plain notice, stops calling the Worker and does not switch back. The Worker, not the browser, decides. Note the chatbot is already scripted-first and falls back to scripted on any hook failure; check how much of level 2 already exists before proposing work.
- **SE-E1** Firebase App Check enforcement. Monitor mode for 7 days before enforcing; an earlier reCAPTCHA Enterprise attempt returned HTTP 400; needs my console steps and the public site key. Rollback is switching enforcement off in the console.
- **SE-E5** Independent review preparation: `SECURITY-REVIEW-PACK.md` (scope, live URL, in and out of scope, threat list, rules text, test list, known limits, reporting, fix-tracking table) and an owner checklist for a free automated scan. You can prepare only; you cannot perform or certify a review.
- **SE-E4** Trim `frame-src` to the one calendar provider I really use, with a test that the CSP and the in-use provider agree; navigation-away stays a documented residual risk. Ask me which provider stays.
- **SE-E2** Real security headers through Cloudflare, only if I decide to move the domain `frederickespinosa.com`. Biggest and most disruptive; do last or not at all. Do not start without my clear yes to the domain move and its consequences.

Recommended order: SE-E3, SE-E6, SE-E1, SE-E5, SE-E4, SE-E2. Challenge this order if the code says otherwise.

## Decisions to put in front of me (with a recommended option each)

- Order and grouping: one item per session, or small ones together (SE-E3 with SE-E5)?
- SE-E6: Turnstile managed/invisible mode or visible; keep the old code challenge as a fallback or replace it; **fail-closed or fail-open** if Cloudflare cannot be reached (forms must not become unusable, but must not become unprotected); is an AI chatbot planned at all (otherwise Part B stays documented only).
- SE-E6 Part B, if wanted: limits per session / per address / per day, message and answer length, who sees the switch notice text.
- SE-E1: which provider (v3, Enterprise retry, or monitor only), and who does the console steps.
- SE-E3: self-host vs import map with integrity; how to get the files; a quarterly reminder to check Firebase release notes.
- Anything else you find that is a security or data-protection gap; list it, do not silently build it.

## Test and delivery requirements

- Keep every existing suite green: unit (`scripts/*.test.mjs`), Worker tests, attack simulator (both rules files), mutation tests, replay of real page writes, browser suites in `rules-tests/browser`, and the official Firebase emulator tests (they run in GitHub Actions for me).
- New CSP hosts, Worker routes and fallback behaviour need guard tests, Worker tests (valid, expired, reused, missing, wrong hostname, upstream unreachable) and browser tests (accessible names, keyboard, phone width).
- Deliver per item: `CodeFlow-Portfolio-4.5.x-<item>.zip` (changed and new files only), a `-rollback.zip` that really restores the previous files, updated README, KNOWN-ISSUES, `internal-docs/open-items.md`, a numbered live checklist, and the commit title and description.
- Before building, tell me whether anything must be changed in the Firebase or Cloudflare console, and in which order versus the file upload.

## First reply I expect

Do not build yet. Reply with: (1) what you found in the current code that affects these items (including anything that changed since the review document), (2) the proposed order and layout for the FIRST item only, (3) any rules, CSP or Worker changes in words, (4) the decisions above with your recommendation, (5) risks, (6) the test plan, (7) what I must do in the consoles. Then wait for "approved to build".
