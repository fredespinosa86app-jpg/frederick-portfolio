# R2 checklist: limit the Firebase browser key to the APIs the site uses

Project: the one named `my-online-portfolio` (ID `my-online-portfolio-db2a5`). Check the name at the top of Google Cloud first; the project named `my-online-portfolio-db2a5` is the WRONG one.

Needed APIs (from the code): Identity Toolkit API, Token Service API, Cloud Firestore API. Nothing else (no Storage, Analytics, Messaging, Functions; App Check stays off; the Calendar calls use your sign-in permission, not this key).

## A. Before you change anything
1. Open APIs & Services > Credentials > the Browser key (starts `AIzaSyAZpd6C`).
2. Take a screenshot of its Restrictions section (websites and APIs). This is your way back.
3. Open a second browser window already signed in as owner, and keep it open while you test.

## B. Change
1. Under API restrictions choose "Restrict key".
2. Tick only: Identity Toolkit API, Token Service API, Cloud Firestore API. (If one is not in the list, type its name in the search box.)
3. Keep the website restriction from before (3 entries). Save. Wait 5 minutes.

## C. Test (private window unless stated)
1. Open the live site, hard-refresh: content must show.
2. Fill the Meeting Request form and send: Quick check box appears, you type the code, the request arrives in the inbox.
3. In the owner window: sign out and sign in again, open the Owner Panel: inbox visible.
4. Delete the test `m_` user in Firebase Authentication.

## D. If something fails
- Press F12 > Network, click the failing request, read the Response. `API_KEY_SERVICE_BLOCKED` names the service that was blocked. Add that one API to the key, save, wait 5 minutes, test again.
- Fast undo: set API restrictions to "Don't restrict key", save, wait 5 minutes.
- Do not delete the key.

## E. Done when
C1 to C4 all pass. Tell Claude which APIs ended up on the key.
