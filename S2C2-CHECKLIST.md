# S2-C2 checklist: tightened connection rule (live test)

What changed: the page's connection rule (`connect-src` in `index.html`) no longer allows "any https address". It allows only these 9 hosts plus this site:

    firestore.googleapis.com            database (everyone)
    identitytoolkit.googleapis.com      sign-in (everyone)
    securetoken.googleapis.com          sign-in (everyone)
    portfolio-forms.fredespinosa86-app.workers.dev   form verification (visitors)
    www.googleapis.com                  Google Calendar (owner)
    script.google.com                   Google Sheets (owner)
    script.googleusercontent.com        Google Sheets reply (owner)
    www.youtube.com                     video title lookup (owner)
    dns.google                          custom-domain DNS check (owner)

No rules change, no Worker change. Upload the changed files, wait for GitHub Pages, hard-refresh (Ctrl+Shift+R). A wrong rule fails silently (a feature just stops working), so test in this order and keep the **Blocked by the rule** list in view.

Also fixed in this package: the S2-C1 Connection log card shared two element IDs with the Clients page, so on the Security page the log could stay empty and could overwrite the Clients list. It uses its own IDs now (`connList`, `connState`).

## A. Before you start
1. Owner Panel > Security > Connection log > **Clear log** (so only new events show). Pass: yes / no

## B. Visitor features (open the public site in a normal window, not signed in, then also check here while signed in)
2. Home page loads fully, no feature is missing. Pass: yes / no
3. Chatbot: ask two questions (a built-in one and a random one). It answers. Pass: yes / no
4. Discovery Call: pick a date and send a real test request (with form verification ON if you use it). It is sent. Pass: yes / no
5. If you use an outside calendar: it loads in the Discovery Call section. Pass: yes / no / not used

## C. Owner features (signed in)
6. Sign out and sign in with Google again. Pass: yes / no
7. Inbox, Clients, Availability, WorkTrack clock in/out, Backup download. Pass: yes / no
8. Integrations: Google Sheets **Test connection**; Google Calendar **Connect** and a calendar check. Pass: yes / no / not used
9. Videos page: paste a YouTube link: the title is filled in. Pass: yes / no
10. Custom domain page: **Verify** (only if a domain is saved). It checks DNS and shows an **https://your-domain/ link**; open that link in a new tab yourself. There is no longer an automatic HTTPS check. Pass: yes / no / not used

## D. Read the result
11. Owner Panel > Security > Connection log > **Refresh**.
    - **Blocked by the rule** must say "Nothing blocked. Good." Pass: yes / no
    - **Connections**: every row has ✓. Pass: yes / no
    - **Pictures and media**: a list of outside picture hosts. This is information for the next step (S2-C3), nothing is restricted yet.
12. If anything is listed under **Blocked by the rule**: press **Copy list**, paste it into the chat, and do the rollback below until I fix it.
13. Press **Copy list** once anyway and paste it into the chat (three sections: connections, pictures and media, blocked). Done: yes / no

## Rollback (one minute)
In GitHub open `index.html` > pencil (edit). In the first `<meta http-equiv="Content-Security-Policy" ...>` line find the text that starts with `connect-src 'self' https://firestore.googleapis.com` and ends with `https://dns.google;` and replace all of it with:

    connect-src 'self' https:;

Commit. That restores the old behavior at once; nothing else needs to change. Or upload the files from `CodeFlow-Portfolio-4.5.0-S2-C2-rollback.zip` (delete the new files it lists in `ROLLBACK-S2-C2.txt`).

## Things that behave differently now
- **Chat webhook:** an address that is not on the list above is refused when you press Save in the chatbot settings, with a message, and is skipped quietly for visitors. To use one, the host must be added to the rule first (ask me).
- **Custom domain:** DNS is checked; HTTPS is a link you open yourself.
- **App Check:** if you ever turn it on (site key in `settings.js`), three more Google hosts must be added to the rule. A test fails if they are missing.
- **Google sign-in popup / Calendar sign-in:** they open in their own windows and are not covered by this rule. If Calendar Connect fails, the Blocked list will name the host.

Known limit: pictures and media (`img-src`, `media-src`) still allow any https address. A hostile script could leak small amounts of data through a picture address. That is the optional follow-up S2-C3, which will use the Pictures and media list.
