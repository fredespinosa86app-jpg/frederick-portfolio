# F5 owner checklist (4 actions, in this order)

Nothing visible changes on your live site after F5. The new switch stays OFF until F7.

1. **Service account key (blocking, do this first).** Google Cloud Console > pick project `my-online-portfolio-db2a5` > IAM & Admin > Service accounts > Create. Name: `portfolio-form-signer`. **Give it no role.** Open it > Keys > Add key > Create new key > JSON. If the console blocks key creation (organisation policy), STOP and tell Claude. Never paste the file or its contents in chat.
2. **Deploy the Worker.** Cloudflare > Workers & Pages > Create > Hello World > name `portfolio-forms` > Deploy > Edit code > replace everything with `server/portfolio-forms-worker.js` > Deploy. Then Settings > Variables and Secrets: `SA_JSON` (Secret, whole key file content), `CH_SECRET` (Secret, 40+ random characters), `ALLOWED_ORIGINS` (Text) = `https://fredespinosa86app-jpg.github.io`. Deploy again. Open `https://portfolio-forms.fredespinosa86-app.workers.dev/v1/status` in a browser: **`{"error":"origin"}` is the correct result.** Then delete the downloaded key file from your computer.
3. **Emulator run.** Upload this ZIP's files to your GitHub repository (as for B3), then Actions > "Firestore rules (emulator)" > Run workflow. Send me the result (expected 164 of 164).
4. **Only after step 3 passes:** publish `firestore.rules.strict` (Firebase Console > Firestore Database > Rules). Then send ONE test meeting request from your live page; it must still work exactly as before.

Rollback: publish `firestore.rules.strict` from `CodeFlow-Portfolio-4.5.0-F5-rollback.zip`. Details: `internal-docs/4.5.0-F5-form-verification.md`.
