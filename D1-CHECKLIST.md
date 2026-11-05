# D1 checklist: Owner documents (private notes and runbooks)

## A. Install (in this order)
1. Upload the D1 files to GitHub (including the new `scripts/owner-docs.js`, `scripts/owner-docs-core.js`, `scripts/owner-docs-core.test.mjs`, `rules-tests/emulator/docs-d1.test.mjs`) and hard-refresh.
2. **Republish the rules:** Firebase > Firestore > Rules: paste the whole of `firestore.rules.strict`, Publish. Without this the Documents page shows "permission denied".
3. GitHub > Actions > "Firestore rules (emulator)" > Run workflow. All tests must pass (the new file `docs-d1.test.mjs` adds 23 tests). Send me a screenshot of the result.

## B. Test as owner
1. Sign in, open the drawer > Settings > **Owner documents**.
2. New document: title "Rollback steps", category Runbook, some text, Save. It appears in the list.
3. Open it: the text shows as plain text. Edit it (change the title), Save. Still one document.
4. Try to save text containing `https://hooks.slack.com/services/abc` : it must be refused with "looks like a webhook address".
5. Try a document with an empty title: refused.
6. Fill from a small `.txt` or `.md` file: the text is filled in (not saved until you press Save).
7. Delete a test document: confirm box, then it disappears.

## C. Test as a visitor
1. Private window, open the public site. There is no Documents page and nothing about it is visible.
2. In Firebase > Firestore > Data, the collection `ownerDocs` shows your documents, but a visitor cannot read them (the rules refuse everyone except you).

## D. Backup
Owner Panel > Privacy & backup: the export has a new checkbox "Owner documents (private notes)". It is export only (never restored by the page), so keep the file safe: it contains your private notes.

## E. Rules to keep
Never put keys, tokens, passwords or webhook addresses in a document. They stay only in the Cloudflare secrets.

## F. What this phase did NOT do
It did not move or delete any file in your public GitHub repo. `internal-docs/` and the root checklists are still public. Tell me which of them should become private and I will move them in a separate step (the old versions stay in GitHub's history).
