# UI-1 checklist: stricter style rule (about 10 minutes)

What changed: the page's security rule no longer allows "inline" styling. Nothing should look different.
The site was changed in two stages. You can test either one; the ZIP names tell you which.

Files that changed: `index.html`, `scripts/owner-dashboard.js`, `styles/main.css`, new `styles/noscript.css`.

## Stage 1 (code fixes, rule still loose) - upload this first

1. Upload the Stage 1 files to GitHub, commit, and wait 1-2 minutes for GitHub Pages.
2. Open the site with a hard refresh (Ctrl+Shift+R). Check it looks the same as before.
3. Sign in, open **To-do**, **Graphs** and **Phase 3** pages. Check the progress bars still show their length.
4. If anything looks wrong, stop and tell me which page. Use the Stage 1 rollback ZIP if needed.

## Stage 2 (the rule is tightened) - upload only after Stage 1 passed

5. Upload the Stage 2 files (only `index.html` and `scripts/csp-guard.test.mjs` change), commit, wait, hard refresh.
6. Public page: scroll the whole page. Check the icons, buttons and layout look the same. Open and close the chat button.
7. Contact form: fill it in and check the Cloudflare check box (Turnstile) appears and passes. Submit one test message.
8. Sign in with Google. Check the Google button shows and the sign-in works.
9. Dashboard: open **To-do**, **Graphs**, **Phase 3**, **Library**, **WorkTrack**. Check progress bars show.
10. Open the survey page. Check it works.
11. Optional, for a precise check: press F12, open the **Console** tab, reload, and look for red messages that say
    "Refused to apply inline style" or "Content Security Policy". Send me a screenshot if you see any.

## If something fails

- Quick fix: in `index.html`, line 5, put `'unsafe-inline'` back after `style-src 'self'`. Commit. Done.
- Or upload the Stage 2 rollback ZIP (restores the Stage 1 files).
- Tell me which step failed; I will fix that one thing and give you a new ZIP.
