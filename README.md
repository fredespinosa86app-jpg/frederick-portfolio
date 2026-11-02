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
    function isOwner() {
      return request.auth != null
        && request.auth.token.email == 'fredespinosa86.app@gmail.com'
        && request.auth.token.email_verified == true;
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
    match /settings/site { allow read: if true; allow write: if isOwner(); }
    match /meetingRequests/{id} {
      allow create: if request.resource.data.keys().hasOnly(['name','email','company','date','time','tz','platform','message','status','createdAt','service','formId','formName','answers'])
        && request.resource.data.keys().hasAll(['name','email','company','date','time','tz','platform','message','status','createdAt'])
        && request.resource.data.name is string && request.resource.data.name.size() > 0 && request.resource.data.name.size() <= 100
        && request.resource.data.email is string && request.resource.data.email.size() > 4 && request.resource.data.email.size() <= 120
        && request.resource.data.message is string && request.resource.data.message.size() > 0 && request.resource.data.message.size() <= 2000
        && request.resource.data.company is string && request.resource.data.company.size() <= 120
        && request.resource.data.platform is string && request.resource.data.platform.size() <= 60
        && request.resource.data.date is string && request.resource.data.date.size() <= 20
        && request.resource.data.time is string && request.resource.data.time.size() <= 20
        && request.resource.data.tz is string && request.resource.data.tz.size() <= 60
        && (request.resource.data.get('service', '') is string && request.resource.data.get('service', '').size() <= 60)
        && (request.resource.data.get('formId', '') is string && request.resource.data.get('formId', '').size() <= 40)
        && (request.resource.data.get('formName', '') is string && request.resource.data.get('formName', '').size() <= 100)
        && (request.resource.data.get('answers', '') is string && request.resource.data.get('answers', '').size() <= 4000)
        && request.resource.data.status == 'new'
        && request.resource.data.createdAt == request.time
        && capOpen()
        && slotFree();
      allow read, update, delete: if isOwner();
    }
    match /chatUnanswered/{id} {
      allow create: if request.resource.data.keys().hasOnly(['question','response','sessionId','context','status','createdAt'])
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
      allow create: if request.resource.data.keys().hasOnly(['vid','sid','type','path','ref','device','browser','createdAt'])
        && request.resource.data.keys().hasAll(['vid','sid','type','path','ref','device','browser','createdAt'])
        && request.resource.data.vid is string && request.resource.data.vid.size() == 24
        && request.resource.data.sid is string && request.resource.data.sid.size() == 24
        && request.resource.data.type in ['view','section']
        && request.resource.data.path is string && request.resource.data.path.size() <= 40
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
