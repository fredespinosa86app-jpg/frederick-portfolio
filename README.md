# Frederick Espinosa – Portfolio

Static website (HTML, CSS, JavaScript). No build step. Optional owner features use Firebase.

## Structure
```
index.html
assets/images/{hero,profile,tools,projects,icons}/   images (WebP)
assets/videos/                                         reserved for local videos
styles/  main.css  components.css  themes.css  responsive.css
scripts/ settings.js  main.js  chatbot.js  video-section.js  theme-switcher.js
         site-settings.js  meeting-form.js  owner-ui.js  owner-panel.js (module)
```
Load order matters: `settings.js` first, `owner-panel.js` (type="module") last.

## Run locally / publish
- Local preview: `python3 -m http.server` in this folder, open http://localhost:8000
  (Firebase features need http/https, not `file://`).
- GitHub Pages: upload the **contents** of this folder to the repository root
  (`index.html` must be at the top level), then Settings > Pages > main / root.

## Dark mode, themes and the owner dashboard
- Visitors only get a **Dark Mode** toggle in the header (saved in `localStorage` as `portfolio-dark`). It never changes the
  owner's saved theme; turning it off returns to the owner's theme.
- The owner picks the site theme (Gold & Silver, Nature, Outer Space, plus Classic, Dark, Vegapunk, Girly, Ocean) in
  **Owner login > Dashboard > Theme & effects**. Changes preview instantly and are published with Save.
- Dashboard pages: Overview, Inbox (meeting requests), Chatbot question history, Marcus configuration, Testimonials,
  Intro video, Theme & effects, Hero, Social media & contact, General settings.
- Contact/social icons come from `scripts/settings.js` (defaults) or Dashboard > Social media & contact. Only valid, enabled links are shown.
- Marcus records a visitor question only when it shows its fallback answer (one record per distinct question per visit).
  Review them in Dashboard > Chatbot question history; nothing is added to Marcus automatically.

## Services and Toolkit content
- The original services and toolkit are the defaults in `scripts/content.js`.
- Dashboard > Services / Toolkit lets the owner add, edit, delete, reorder, hide and add icons or logos. Edits preview on the
  site and go live with **Publish changes** (stored in Firestore `content/services` and `content/toolkit`, owner-write only).
- A section with nothing enabled is hidden. Everything is re-validated before it is rendered on the public page.

## Testimonials
- Dashboard > Testimonials: add, edit, delete, reorder and hide testimonials; set name, position/company, text, a 1-5 star rating
  (optional, never defaulted) and a profile photo (initials such as JS or D are shown when there is no photo).
- View format (Grid, Carousel, List) and the section on/off switch are published with **Publish changes** and stored in
  Firestore `content/testimonials` (covered by the `content` rules above).
- Testimonials saved earlier as "Quote | Name, role" text keep showing until you publish the new format.

## Owner login troubleshooting
1. **Run it from a web address**, not by double-clicking `index.html` (browsers block the Firebase module on `file://`).
   Use the published site, or the VS Code *Live Server* extension.
2. **Authorized domains:** Firebase Console > Authentication > Settings > Authorized domains must list the address you use:
   your GitHub Pages domain, `localhost`, and (for Live Server) `127.0.0.1`. The sign-in message tells you the exact hostname.
3. **Google sign-in enabled:** Authentication > Sign-in method > Google.
4. **Replace the whole folder** (delete old files first) so old and new scripts are not mixed, then hard-refresh (Ctrl+Shift+R).
5. Sign in with the owner Google account set in `scripts/settings.js` (`ownerEmail`).
6. Open the browser console (F12) for the exact error.

## Themes
- Visitors choose **Gold & Silver** (default), **Nature** or **Outer Space** in the header.
  The choice is saved in `localStorage` (`portfolio-theme`).
- All colors are CSS variables in `styles/themes.css`; add a theme by adding a
  `[data-theme="name"]` block and listing it in `scripts/theme-switcher.js`.
- Owner panel > Theme & effects sets the site default (also offers Classic, Dark, Vegapunk, Girly, Ocean).

## "A Quick Message Before You Go" video
Edit `scripts/settings.js`:
```js
showThankYouVideo: true,                 // false hides the whole section
thankYouVideoUrl: "https://youtu.be/XXXXXXXXXXX"   // YouTube or Loom link
```
While the URL is `"YOUR_VIDEO_EMBED_URL"` (or invalid) the section stays hidden, with no blank space.
The video never autoplays and loads only when scrolled near.

## Replace an image
Overwrite the file in `assets/images/...` keeping the same name (e.g. `tools/keepa-price-history.webp`).

## Owner panel and meeting requests (Firebase)
Google sign-in for the owner account, saved site settings and the meeting-request inbox use
Firebase Authentication + Firestore. Firestore rules:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Security S1: only a verified Google sign-in can be the owner.
    function isGoogleSignIn() {
      return request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.firebase.sign_in_provider == 'google.com';
    }
    // Your Firebase account ID. Owner panel > Security shows it after you sign in.
    function ownerUid() { return '3p2YvH4NSVYAAfA0E6HC2kkyc5F3'; }
    function isOwner() {
      return isGoogleSignIn()
        && (request.auth.uid == ownerUid()
            || request.auth.token.email == 'fredespinosa86.app@gmail.com');
    }
    // Phase 2: true when the requested start time is not already confirmed (best effort, see README)
    function slotFree() {
      let ref = /databases/$(database)/documents/content/busy;
      return !exists(ref) || !((request.resource.data.date + 'T' + request.resource.data.time) in get(ref).data.get('keys', []));
    }
    // Phase 7: true unless the owner panel has marked the business as full (content/capacity.open == false).
    function capOpen() {
      let cap = /databases/$(database)/documents/content/capacity;
      return !exists(cap) || get(cap).data.get('open', true) != false;
    }
    // Security S2: emergency pause. The owner panel (Security > Abuse protection) sets content/guard.pause = true,
    // which makes every public write below refuse until it is switched back.
    function intakeOpen() {
      let g = /databases/$(database)/documents/content/guard;
      return !exists(g) || get(g).data.get('pause', false) != true;
    }
    match /settings/site { allow read: if true; allow write: if isOwner(); }
    match /meetingRequests/{id} {
      allow create: if request.resource.data.keys().hasOnly(['name','email','company','date','time','tz','platform','message','status','createdAt','service','formId','formName','answers'])
        && request.resource.data.keys().hasAll(['name','email','company','date','time','tz','platform','message','status','createdAt'])
        && request.resource.data.name is string && request.resource.data.name.size() > 0 && request.resource.data.name.size() <= 100
        && request.resource.data.email is string && request.resource.data.email.size() > 4 && request.resource.data.email.size() <= 120
        && request.resource.data.email.matches('^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$')
        && request.resource.data.message is string && request.resource.data.message.size() > 0 && request.resource.data.message.size() <= 2000
        && request.resource.data.company is string && request.resource.data.company.size() <= 120
        && request.resource.data.platform is string && request.resource.data.platform.size() <= 60
        && request.resource.data.date is string && request.resource.data.date.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        && request.resource.data.time is string && request.resource.data.time.matches('^[0-9]{2}:[0-9]{2}$')
        && request.resource.data.tz is string && request.resource.data.tz.size() <= 60 && request.resource.data.tz.matches('^[A-Za-z0-9_+/-]+$')
        && (request.resource.data.get('service', '') is string && request.resource.data.get('service', '').size() <= 60)
        && (request.resource.data.get('formId', '') is string && request.resource.data.get('formId', '').size() <= 40)
        && (request.resource.data.get('formName', '') is string && request.resource.data.get('formName', '').size() <= 100)
        && (request.resource.data.get('answers', '') is string && request.resource.data.get('answers', '').size() <= 4000)
        && request.resource.data.status == 'new'
        && request.resource.data.createdAt == request.time
        && intakeOpen()
        && capOpen()
        && slotFree();
      allow read, update, delete: if isOwner();
    }
    match /chatUnanswered/{id} {
      allow create: if intakeOpen()
        && request.resource.data.sessionId is string && request.resource.data.sessionId.matches('^[a-z0-9]{1,20}$')
        && id.matches('^' + request.resource.data.sessionId + '_[a-z0-9]{1,12}$')
        && request.resource.data.keys().hasOnly(['question','response','sessionId','context','status','createdAt'])
        && request.resource.data.keys().hasAll(['question','response','sessionId','context','status','createdAt'])
        && request.resource.data.question is string && request.resource.data.question.size() > 0 && request.resource.data.question.size() <= 300
        && request.resource.data.response is string && request.resource.data.response.size() <= 600
        && request.resource.data.sessionId is string && request.resource.data.sessionId.size() <= 40
        && request.resource.data.context is string && request.resource.data.context.size() <= 300
        && request.resource.data.status == 'new'
        && request.resource.data.createdAt == request.time;
      allow read, update, delete: if isOwner();
    }
    match /activity/{id} {
      allow read, create, delete: if isOwner();
    }
    // Phase 2: private business data. Never readable by visitors.
    // Phase 3: anonymous visit counter. Visitors may only create; only the owner reads or deletes.
    match /visits/{id} {
      allow create: if intakeOpen()
        && request.resource.data.keys().hasOnly(['vid','sid','type','path','ref','device','browser','createdAt'])
        && request.resource.data.keys().hasAll(['vid','sid','type','path','ref','device','browser','createdAt'])
        && request.resource.data.vid is string && request.resource.data.vid.matches('^[0-9a-f]{24}$')
        && request.resource.data.sid is string && request.resource.data.sid.matches('^[0-9a-f]{24}$')
        && request.resource.data.type in ['view','section']
        && request.resource.data.path is string && request.resource.data.path.matches('^[A-Za-z0-9_-]{1,40}$')
        && id == request.resource.data.sid + '_' + request.resource.data.type + '_' + request.resource.data.path
        && request.resource.data.ref is string && request.resource.data.ref.size() <= 100
        && request.resource.data.device in ['desktop','tablet','mobile']
        && request.resource.data.browser is string && request.resource.data.browser.size() <= 20
        && request.resource.data.createdAt == request.time;
      allow read, delete: if isOwner();
    }
    match /clients/{id} { allow read, write: if isOwner(); }
    match /ownerPrivate/{doc} { allow read, write: if isOwner(); }
    match /content/{doc} {
      allow read: if true;
      allow write: if isOwner();
    }
  }
}
```
Add your site domain under Firebase Authentication > Settings > Authorized domains.

## SEO (Phase 4)
- Baseline tags (title, description, canonical, Open Graph, Twitter card, favicons, JSON-LD Person + WebSite) are in the `<head>` of `index.html`. Link-preview sites read these directly.
- `robots.txt` and `sitemap.xml` point at `https://fredespinosa86app-jpg.github.io/frederick-portfolio/`. If you move to a custom domain, edit that address in `index.html`, `robots.txt` and `sitemap.xml`, and in Owner Panel > SEO & social preview.
- Owner Panel > SEO & social preview edits title, description, keywords, social image path, canonical address and the "allow search engines" switch. Values are stored in `settings/site.seo` (no Firestore rule change needed). They apply for browsers and for crawlers that run JavaScript; use "Copy tags" and paste into `index.html` so Facebook, LinkedIn and X also pick them up.
- Social image: 1200 x 630, stored at `assets/images/social/og-image.jpg`.
- After deploying, submit the sitemap in Google Search Console.

## Phase 1 (public portfolio) - new Firestore documents
No rule change is needed: the existing `content/{doc}` rule (public read, owner write) covers them.
- `content/training` {items[7]}, `content/videos` {view, items[<=20]}, `content/faq` {items[<=60]}, `content/heroPhoto` {photo}
- `content/services` and `content/toolkit` gain a `view` field (`list` default, `grid`, `compact`).
- `settings/site` gains `heroText2`, `heroLayout` (`text-left` | `image-left`) and `secBg` {sectionId: '#rrggbb'}.
Older records without these fields keep working (safe defaults). Images are stored as small WebP data URLs (Firebase Storage needs a paid plan).

## Phase 2 (Experience, availability, capacity, clients) - Firebase configuration
**Publish the updated rules above** (Firebase console > Firestore Database > Rules; the same text is in `firestore.rules`). Without them the new owner pages cannot save private data and the double-booking check is inactive. Nothing else is required on the free Spark plan.
- Public documents (covered by `content/{doc}`): `content/experience` {enabled, items[]}, `content/availability` {days, start, end, slot, tz, blocked[]}, `content/busy` {keys[], items[]} (start times of future confirmed meetings only, no names), `content/rates` {currency, hourly, monthly} (only the rates the owner ticked as public; otherwise null).
- Private documents (owner only): `clients/{id}` {name, email, phone, company, rate, arrangement, invoiceDue, status, notes}, `ownerPrivate/config` {capacity, currency, hourly, monthly, showHourly, showMonthly}.
- `content/busy` is refreshed by the owner dashboard whenever it is open and signed in. Confirm or cancel meetings from the dashboard and it updates itself.
- Visitors choose times in the owner's time zone; their own time zone is appended to the message. The booking rule blocks an exact start time that is already confirmed; overlap between different slot lengths is handled in the page, because Firestore rules cannot loop over lists. Atomic reservation and rate limiting would need Cloud Functions (paid plan).

## Phase 3 (visitors, toasts, integrations, custom domain)
**Publish the updated rules again** (new `visits` block; `firestore.rules` has the full text).
- **Visitor monitoring**: `scripts/analytics.js` writes one small document per visit/section to `visits` (random anonymous id, tab session id, page or section, referrer host, device, browser, time). No cookies, no IP, no personal data; Do Not Track / Global Privacy Control, a footer opt-out and bots are respected; the owner's signed-in device is skipped. A refresh does not count again (once per tab session). Owner Panel > Visitors shows totals, unique visitors, page views, sections, referrers, devices, browsers and a chart with Today / 7 / 30 days / custom filters, and can delete records older than 90 days. Spark limits: 20,000 writes and 50,000 reads per day; the page reads at most 5,000 records per load. Rules cannot rate-limit, so a malicious visitor could inflate counts.
- **Toasts**: bottom-right, auto-dismiss (success 3.5 s, warning 6 s, error 8 s). "View site" is disabled while a save, a confirmation dialog or a toast is active, and enabled again afterwards.
- **Integrations**: Google Calendar uses Google Identity Services (OAuth 2.0 token flow). The Client ID is public and saved in `ownerPrivate/config`; the access token stays in browser memory only (no server exists on Spark, so no refresh token can be kept: reconnect after a reload). Needs a Google Cloud project with the Calendar API, an OAuth Web client with your site as an authorized JavaScript origin, and your account as a test user while unverified. Drive and Gmail are NOT implemented: they need Cloud Functions (Blaze plan) and, for Gmail, Google app verification.
- **Custom domain**: stored in `ownerPrivate/config.domain`. Verification uses Google's public DNS-over-HTTPS and a fetch of `https://<domain>/index.html`. It is "verified" only when DNS, HTTPS and the portfolio content all check out. DNS, GitHub Pages' custom-domain setting, the CNAME file and Firebase Authorized domains must still be done by you.

## Phase 5 (chatbot)
No Firestore rule change is needed (new documents live under `content/{doc}`: public read, owner write).
- **Documents**: `content/chatbot` {name, avatar (small data URL), mod{extra[], allow[]}} and `content/chatKb` {items[{id,q,a,alts[],category,enabled}]}. If `content/chatKb` does not exist the three predefined answers (birthday, "Is this a scam?", greetings) are used; once you publish the knowledge base it replaces them (the owner page can restore them).
- **Matching**: `scripts/chat-engine.js` compares the visitor's words (case, punctuation, plurals and filler words ignored) with each question and its alternative phrases. Strong matches (60%+) from the knowledge base are answered first, then the webhook (if on), then the built-in keyword answers, then a polite fallback. Nothing is invented.
- **Timing**: stored answers appear after a controlled 2 to 8 seconds (longer answers wait a little longer). Webhook answers appear as soon as they arrive, but not before 2 seconds, and a webhook that does not answer in 15 seconds is dropped for the built-in answer. The typing indicator shows meanwhile and the input stays locked until the reply, an error or the timeout.
- **Timestamps**: `November 2, 2026 – 8:30 PM`, in the visitor's own time zone (hover shows the zone).
- **Language filter**: runs before anything is forwarded. Profanity (English and common Filipino words, configurable lists in the owner page) gets a polite warning the first time; a second profane message in the same browser-tab session hides the chatbot until the tab is closed (counter kept in `sessionStorage`). Threats and sexual requests are refused politely, are not counted as profanity and never reach the webhook. Ordinary criticism is never flagged. Limit: spaced-out letters ("f u c k") are not detected.
- **Idle message**: after 5 minutes without interaction while the chat is open, once per idle period; not sent after the chat is closed or while a reply is running.
- **Webhook security review**: see Owner Panel > Marcus configuration, and `server/` for a ready proxy. Finding: the webhook address is stored in `settings/site`, which visitors can read, and is called from the browser, so it is publicly visible. On the free Spark plan nothing inside Firebase can hide it, so the fix is the free Cloudflare Worker in `server/` (keeps the real URL and secret, checks origin, size, format and rate). **Replace the old webhook URL in n8n/Make** once the proxy is in use.

## Phase 6 (themes and service-specific forms)
**Publish the updated rules again.** The `meetingRequests` create rule now also accepts the optional `service`, `formId`, `formName` and `answers` fields (size-limited). Until then, a meeting request sent with the service-forms switch ON is rejected by Firestore, so publish the rules before enabling the switch.
- **Themes**: `Dark Mode - Matrix` (green accents) and `Dark Mode - Netflix` (red accents) were added to Owner Panel > Theme & effects. Existing themes are unchanged; the preview is the same instant preview as for the other themes, and Save stores it in `settings/site.theme` like before. The dashboard keeps its light layout; only its accent colour follows these two themes. No animation was added.
- **Service forms**: Owner Panel > Service forms. Data lives in `content/serviceForms` {enabled, services[], forms[]} (questions only, public read like the other content documents). The master switch is OFF by default; while off, the meeting request form is exactly the old one.
- **Submissions**: the normal request fields plus `service`, `formId`, `formName` and `answers` (JSON text of question/answer pairs, up to 4,000 characters). The question text is copied into every submission, so editing, deactivating or deleting a form never changes old inquiries. They appear in Owner Panel > Inbox with the service shown and the answers in the detail view; only the owner can read them.
- **Not included**: the File Upload field, because Firebase Storage needs a paid plan. Spam protection is the existing honeypot, 60-second throttle and size-limited rules; a hard rate limit needs App Check or a server.


## Phase 7 - Capacity-based Hire Me and Contact visibility

* **Where:** Owner Panel > Availability, rates & capacity. Set your maximum under *Client capacity*, then use the new *When you are at full capacity* card.
* **How it counts:** only clients with status **Active** on the Clients page. Inactive, completed and archived clients are ignored. The count is never typed in by hand.
* **When active clients reach the maximum:** the Hire Me buttons, the Contact section and its menu link are hidden, `#schedule` cannot be opened (a direct link goes back to the home page), the chatbot stops suggesting a meeting, and the database refuses new inquiries.
* **Maximum 0 means no limit.** Nothing is hidden until you set a maximum of 1 or more.
* **Optional message:** tick *Show an availability message* to show your text (default: "Currently at full client capacity. Please check back later for availability.") under the home banner while you are full. It is off by default.
* **Nothing is deleted:** contact settings, service forms and past inquiries are kept.
* **Firestore rules:** republish `firestore.rules` (it gained a `capOpen()` check) so the block also works on the server.
* **Good to know:** the public flag lives in `content/capacity` (`open`, plus your message settings; the numbers stay private). It is refreshed by the owner panel whenever clients, your maximum or the switch change, and all of those only change inside the panel. Footer and social contact icons are not part of the Contact section and stay visible.

## Phase 8 - Final review, setup checklist and known limits

### One-time setup checklist (in this order)
1. **Publish `firestore.rules`** (Firebase Console > Firestore Database > Rules > paste the whole file > Publish). Do this before enabling Service forms or the capacity switch.
2. **Authorised domains** (Firebase Console > Authentication > Settings): add `fredespinosa86app-jpg.github.io` and your custom domain, if any.
3. **Restrict the Firebase web API key** (Google Cloud Console > APIs & Services > Credentials): limit it to HTTP referrers `https://fredespinosa86app-jpg.github.io/*` (and your custom domain). The key in `scripts/settings.js` is public by design, but restricting it stops reuse elsewhere.
4. **Sign in once** as the owner, then open *Availability, rates & capacity* so the public capacity flag is created.
5. **Marcus webhook** (optional): deploy `server/chat-proxy-worker.js` on Cloudflare (free) and paste the Worker address instead of the n8n/Make address. Replace any webhook URL that was saved before Phase 5.
6. **GitHub Pages**: push the folder contents to the repository root (the branch Pages serves). Browsers pick up new files because every script/style link has a version tag (`?v=p8`); change it when you edit a file.

### What was reviewed in Phase 8
* **Files:** every local file, image, script, style, anchor and element id referenced by the page exists; no unreferenced assets; every image has alt text; no inline event handlers or `javascript:` links; external links use `rel="noopener"`.
* **Accessibility:** automated WCAG 2 AA scan (axe-core) of all 10 themes, the meeting page and all 26 owner pages reports 0 violations. Fixes this phase: low text contrast in Classic, Girly and Netflix, disabled-row contrast in the owner lists, and the calendar's ARIA role.
* **Responsive:** no horizontal scrolling from 320 px to 1920 px on the home page, the meeting page and every owner page. Fixed this phase at 320 px: the calendar grid and the long e-mail address in the Contact panel.
* **Database rules:** every collection the code touches has a rule; there is no catch-all rule; visitors can only *create* (never read, change or delete) meeting requests, unanswered chat questions and visit records, each with a strict field list and size limits; everything private is owner-only (verified Google e-mail).
* **Webhook:** the saved address must start with `https://` (checked when saving and again when used); replies are shown as plain text; the Worker proxy in `server/` hides the real address.
* **Secrets:** no private keys, tokens or webhook addresses are in any shipped file. Only the public Firebase web config is present.

### Known limits (free Firebase plan)
* **Reads:** each page view opens 16 live listeners, so roughly 16 reads and 1 write per visit. The free plan allows 50,000 reads and 20,000 writes per day, which is about 3,000 visits per day before reads run out. Heavy traffic needs the Blaze plan or a caching layer.
* **Spam protection:** the honeypot, the one-request-per-minute limit and the field limits slow abuse, but a determined script can still create requests. A hard server-side limit needs App Check or Cloud Functions (paid).
* **Capacity flag:** refreshed by the owner panel while you are signed in (all inputs change only there).
* **Gmail, Drive and file-upload questions:** not available without the paid plan.
* **Browsers tested:** Chromium only (desktop and mobile sizes). Firefox and Safari could not be run in the test environment, so they are untested; the code uses only standard CSS and JavaScript, but please open the site once in each and report anything odd.
* **Owner panel code is loaded for every visitor** (about 45 KB gzipped). Splitting it needs a build step, so it was left alone to protect stability.
* **Content-Security-Policy and Subresource Integrity** are not set. GitHub Pages cannot send headers; a `<meta>` policy is possible but needs separate testing and your approval.

## Phase 8.1 - Dialog fixes
* **Owner panel pop-ups (request details, confirm boxes, Add/Edit forms):** the main buttons (Confirm Meeting, Save, Confirm) were white on a transparent background and could not be seen. The pop-ups now carry their own colour settings, so those buttons show in every theme (the accent follows Matrix and Netflix too).
* **Privacy notice on the public site:** the pop-up had no background of its own, so the page showed through it and the text was almost unreadable. It now has a solid background that follows the active theme, with readable text (checked on all 10 themes at desktop and phone sizes).

## Security S1 - Owner identity, sign-in session and rules

**What changed**
- The database rules now accept the owner only when the sign-in is a *verified Google* sign-in, and only for your account ID (UID) **or**, during the transition, your e-mail address.
- Owner panel > **Security** shows your account ID with a Copy button, the idle-timeout choice, "keep me signed in" (off by default), Sign out now, and a Firebase console checklist. A **Sign out** button is also always visible at the bottom of the left menu.
- Sign-in lasts only until the browser is closed (unless you switch "keep me signed in" on). After 30 minutes without activity (you can choose 15 / 30 / 60 / 120) the panel signs you out; a warning appears one minute before.

**Step 1 - get your account ID (once)**
1. Publish the new `firestore.rules` (Firestore Database > Rules > paste > Publish). It still lets you in by e-mail.
2. Sign in, open Owner panel > Security, press **Copy account ID** and send it to the assistant (or keep it for step 2). It is an identifier, not a password.

**Step 2 - Strict owner mode (after the ID is known and sign-in has been tested)**
1. Open `firestore.rules.strict`, replace `3p2YvH4NSVYAAfA0E6HC2kkyc5F3` with your ID.
2. Publish it. Sign out and in again; check Inbox, Settings and one save.
3. If anything is refused, publish `firestore.rules` again to go back. If the ID in the strict file ever differs from the one shown on the Security page, you would be locked out until you publish the transition file again.

**Firebase console checklist** (also on the Security page): only Google sign-in enabled; authorised domains only yours; API key restricted to your site address; published rules equal this file; a budget alert.

**Honest limits**
- The idle timeout and session choice work in your browser only. Without a server (the free plan has none) a sign-in token cannot be cancelled from elsewhere; it simply expires within about an hour. Signing out on this device is immediate.
- Rules tests: `rules-tests/` contains an emulator-based test file. It was **not** run in the build environment (no emulator download available); run it on your computer with `npm install` then `npm test` inside that folder (needs Java and the Firebase emulator). The sandbox tests only check the owner logic and the rule text.

## Security S2 - Abuse and quota protection

**What changed**
- **Stricter rules for visitor writes:** e-mail, date (`YYYY-MM-DD`), time (`HH:MM`) and time zone must have the right shape; visit and chatbot records must use their exact ID pattern.
- **One record per visit/page:** a visit record's ID is now `session_type_page`, so the same record can never be created twice (existing visit records are untouched and still counted).
- **Emergency pause:** Owner panel > Security > Abuse protection counts public submissions (last hour and today), warns above a limit, and has a **Pause public submissions** button. It writes `content/guard.pause`; the rules then refuse new visits, meeting requests and chatbot questions until you resume. Your owner panel keeps working.
- **App Check (optional, free):** the site starts Firebase App Check with reCAPTCHA v3 when `appCheckSiteKey` in `scripts/settings.js` is filled in. Empty (the default) = nothing changes.
- Two new items on the Security checklist (App Check registered, App Check enforced).

**App Check set-up (do in this order; do not skip the monitoring step)**
1. Firebase console > App Check > Apps > your web app > reCAPTCHA v3 > create the key pair at google.com/recaptcha/admin (type v3, add your site domain). Paste the **secret** key only into the Firebase console, never into a file.
2. Paste the **site** key into `appCheckSiteKey` in `scripts/settings.js`, upload, and browse your site and owner panel once.
3. App Check > APIs > Cloud Firestore: watch "verified vs unverified" for a few days. Only when your own traffic shows as verified, press **Enforce**. Enforcing too early blocks real visitors; you can un-enforce at any time.
4. For testing on localhost, App Check needs a debug token (App Check > Apps > Manage debug tokens); do not publish a debug token.

**Honest limits**
- Firestore rules cannot count requests per person. A bot that changes its random ID can still send valid-looking records; the format rules, the pause button and App Check (once enforced) are what limit that. Free-plan quotas still apply (20,000 writes and 50,000 reads a day); at the limit, writes simply fail until the daily reset.
- Each guarded write now costs one extra document read for the pause check (the existing capacity check already worked this way).
- The flood counter only runs while the Security page is open; there is no background monitor on the free plan. Google's usage graphs (Firebase console > Usage) are the other signal.
- Public reading of site content is open by design; App Check enforcement also covers reads.
- reCAPTCHA v3 free limits are set by Google and I could not verify the current figure; check the reCAPTCHA admin page before relying on it. If it ever needs billing, skip App Check (nothing else depends on it).
- Not done in S2: one analytics summary per visit (it would change the stored visit format and the visitors page), Cloudflare. Say so if you want either.
