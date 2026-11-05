# Open items (internal; public repository, nothing secret here)

## Firebase web key restriction (started 2026-11-05, parked until B2 is resolved)
- Goal: close the GitHub "exposed key" alert by restricting the Firebase web API key to the site's own addresses. The key is public by design; Firestore rules are the real protection.
- Finding: Google Cloud > APIs & Services > Credentials shows "No API keys to display" for project my-online-portfolio-db2a5, although the key in `scripts/settings.js` matches the Firebase console. The OAuth client "My Online Portfolio" is listed.
- A new key can be created, but the new form requires choosing APIs. Identity Toolkit API and Token Service API were enabled in the Library and can be chosen; "Cloud Firestore API" is not offered in the list. A key without Firestore would break the site, so the key was NOT created and `settings.js` is unchanged.
- Website restrictions prepared: `https://fredespinosa86-app-jpg.github.io/*`, `https://my-online-portfolio-db2a5.firebaseapp.com/*`, `https://my-online-portfolio-db2a5.web.app/*`.
- Options when resumed: (a) try the filter "firestore" / Library "Cloud Firestore API" again; (b) stop and dismiss the alert as "public by design / used in tests".
- Raise this again right after B2 is verified (emulator 131 of 131, rules republished).

## Update 2026-11-05: new restricted web key made and swapped in (`scripts/settings.js`)
- New key "Portfolio web key": website restrictions (github.io, firebaseapp.com, web.app) and API restrictions (Identity Toolkit, Token Service, Cloud Firestore).
- Old key stays alive until the live test passes (sign-in, owner data pages, public pages); then delete the old key in Google Cloud > Credentials (it was not listed there, so it may need to be deleted from the Firebase console / left as is) and close the GitHub alert.
- To go back: restore the old `apiKey` line (the old key starts `AIzaSyAZpd6C`).
