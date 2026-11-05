# S1 checklist: rotate the Google Sheets token (token only)

No code changes. The token lives in two places: the Apps Script property `TOKEN`, and your private owner settings (Owner Panel > Integrations > Google Sheets). Both must hold the SAME new text.

## A. Make the new token
1. Generate a random token of at least 24 characters, no spaces (a password manager's generator is best).
2. Keep a copy somewhere private. Do NOT paste it into chat, a document in the repo, a screenshot or an Owner document.

## B. Change it in Apps Script
1. Open your Google Sheet > Extensions > Apps Script.
2. Click the gear icon (Project Settings) > Script properties.
3. Edit `TOKEN`, paste the new value, Save. The old token stops working immediately; no redeploy is needed.

## C. Change it in the Owner Panel
1. Owner Panel > Integrations > Google Sheets.
2. Paste the new token in the token box. Leave the address as it is. Press Save.
3. Press **Test connection**. It must say the script answered and accepted the token.

## D. Prove it works
1. Run one normal sync (for example the Meetings tab).
2. Open the sheet: the rows appear or are updated.

## E. If the test fails
- "The token was not accepted": the text in Apps Script and in the panel differ. Re-paste both from your copy, with no spaces or line breaks.
- Do NOT go back to the old token (it is the one being retired). Set another new one instead.
- If the sync is not needed any more: press Disconnect in the panel and archive the deployment (Apps Script > Deploy > Manage deployments > Archive).

## F. Done when
Test connection passes and one sync wrote rows. Tell Claude "S1 done" (never the token itself).

## Not part of S1
Replacing the /exec address. Only needed if that address was ever shown publicly.
