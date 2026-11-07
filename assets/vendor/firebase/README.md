# Firebase web SDK, served from this site (SE-E3)

These four files are the official Firebase SDK 10.12.2 (`firebase-app`, `firebase-auth`, `firebase-firestore`, `firebase-app-check`), taken from the npm package `firebase@10.12.2` and checked against the checksum npm publishes for that package (see `manifest.json`).

Only two edits were made to each file, both listed in `manifest.json`: the import of `firebase-app.js` points to the sibling file instead of a Google address, and the trailing `sourceMappingURL` comment was removed. `scripts/vendor-firebase.test.mjs` proves this: undoing the two edits gives back the official file's hash.

Do not edit these files by hand and do not add `?v=` to their addresses (the files import each other without one; a query string would load a second copy of `firebase-app.js` and break Firebase).

To change the SDK version on purpose: edit `VERSION` and `INTEGRITY` in `tools/vendor-firebase.mjs`, run `node tools/vendor-firebase.mjs`, update the version folder name in `owner-panel.js`, `form-guard.js`, `survey-page.js` and the tests, then run every suite and do the live checklist. Check the Firebase release notes for security fixes every 3 months (Owner Panel > Security has a reminder line).
