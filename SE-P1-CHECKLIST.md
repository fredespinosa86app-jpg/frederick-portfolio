# SE-P1 live test (4.5.0): private documents out of the public repository

What changes: your design notes, the review pack, the known-limits list and the long README move to a PRIVATE place. The site, the scripts, the rules, the tests and the checklists stay public. The site itself does not change.

## Order (important)
1. **Private place first.** On GitHub: New repository > name `portfolio-private-docs` > choose **Private** > Create. Upload ALL files of `private-docs.zip` (unzip it first; keep the `internal-docs` folder). Check the **lock icon** next to the repository name: it must say Private. Also keep a copy of the unzipped folder on your computer.
2. **Then the public repo.** Upload ALL files of `CodeFlow-Portfolio-4.5.0-SE-P1.zip` to the public repo (replace existing) and commit.
3. **Delete these files from the public repo** (open each file on GitHub > the three dots > Delete file > commit; the folder `internal-docs` can be deleted file by file, GitHub removes the empty folder):
   - the whole `internal-docs/` folder (23 files)
   - `SECURITY-REVIEW-PACK.md`, `SECURITY-FINAL-REPORT.md`, `SECURITY-REVIEW-OWNER-CHECKLIST.md`, `KNOWN-ISSUES.md`
4. Wait for Pages to finish, and for the GitHub Actions run to finish.

## Live steps
1. The private repository shows the lock icon (Private). Pass: yes / no
2. Open `https://fredespinosa86app-jpg.github.io/frederick-portfolio/internal-docs/open-items.md`: "404" (it can take a few minutes after the deletion; try a private window). Pass: yes / no
3. Open `.../SECURITY-REVIEW-PACK.md` and `.../KNOWN-ISSUES.md`: both "404". Pass: yes / no
4. The public repo front page shows the short README with the note about the private place. Pass: yes / no
5. GitHub > Actions: the latest run is green (the review-pack tests are skipped there on purpose). Pass: yes / no
6. The site works as before: open it, book a Discovery Call up to the Cloudflare check, open the Owner Panel. Pass: yes / no

## If something fails (rollback)
- Restore the files from `CodeFlow-Portfolio-4.5.0-SE-P1-rollback.zip` into the public repo (this puts the documents back and the old tests).
- Then delete `tools/private-docs.mjs` and `SE-P1-CHECKLIST.md` from the public repo.
- The old copies also remain in GitHub's history. Nothing is lost.

## Result
(to fill in after your live test)
