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
- Dashboard pages: Overview, Inbox (meeting requests), Chatbot question history, Chatbot configuration, Testimonials,
  Intro video, Theme & effects, Hero, Social media & contact, General settings.
- Contact/social icons come from `scripts/settings.js` (defaults) or Dashboard > Social media & contact. Only valid, enabled links are shown.
- The chatbot records a visitor question only when it shows its fallback answer (one record per distinct question per visit).
  Review them in Dashboard > Chatbot question history; nothing is added to the chatbot automatically.

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
    // P0 (4.5.0): Client ID registry helpers. An ID is A-Z, 0-9 and "-", 3 to 24 characters, starts with a letter, no "--", no trailing "-".
    function validClientId(id) { return id.matches('^[A-Z][A-Z0-9-]{1,22}[A-Z0-9]$') && !id.matches('.*--.*'); }
    function regDoc(cid) { return /databases/$(database)/documents/clientRegistry/$(cid); }
    function regAudit(aid) { return /databases/$(database)/documents/clientRegistryAudit/$(aid); }
    // W1 (4.5.0): WorkTrack helpers. Sessions, events and the current-state record. Owner only; see the match blocks below.
    function wkState() { return /databases/$(database)/documents/workState/main; }
    function wkSess(sid) { return /databases/$(database)/documents/workSessions/$(sid); }
    function wkEvt(eid) { return /databases/$(database)/documents/workEvents/$(eid); }
    function wkSid(s) { return s is string && s.matches('^[A-Za-z0-9]{16,40}$'); }
    // The event ID is the session ID, two underscores and the event counter (1 to 12), so counters cannot be skipped or reused.
    function wkEid(sid, n, eid) {
      return (n == 1 && eid == sid + '__1') || (n == 2 && eid == sid + '__2') || (n == 3 && eid == sid + '__3') || (n == 4 && eid == sid + '__4')
        || (n == 5 && eid == sid + '__5') || (n == 6 && eid == sid + '__6') || (n == 7 && eid == sid + '__7') || (n == 8 && eid == sid + '__8')
        || (n == 9 && eid == sid + '__9') || (n == 10 && eid == sid + '__10') || (n == 11 && eid == sid + '__11') || (n == 12 && eid == sid + '__12');
    }
    function wkKeep(b, a) { return a.fb == b.fb && a.lu == b.lu && a.lb == b.lb; }
    // The transition table. t = punch, b = state before the batch, a = state after the batch. Anything not listed is refused.
    function wkStep(t, b, a) {
      return (t == 'CLOCK_IN' && b.state == 'NOT_STARTED' && a.state == 'WORKING' && a.n == 1 && a.fb == false && a.lu == false && a.lb == false)
        || (a.sid == b.sid && a.n == b.n + 1 && (
             (t == 'FIRST_BREAK_OUT' && b.state == 'WORKING' && b.fb == false && a.state == 'FIRST_BREAK' && a.fb == true && a.lu == b.lu && a.lb == b.lb)
          || (t == 'FIRST_BREAK_IN' && b.state == 'FIRST_BREAK' && a.state == 'WORKING' && wkKeep(b, a))
          || (t == 'LUNCH_OUT' && b.state == 'WORKING' && b.lu == false && a.state == 'LUNCH' && a.lu == true && a.fb == b.fb && a.lb == b.lb)
          || (t == 'LUNCH_IN' && b.state == 'LUNCH' && a.state == 'WORKING' && wkKeep(b, a))
          || (t == 'LAST_BREAK_OUT' && b.state == 'WORKING' && b.lb == false && a.state == 'LAST_BREAK' && a.lb == true && a.fb == b.fb && a.lu == b.lu)
          || (t == 'LAST_BREAK_IN' && b.state == 'LAST_BREAK' && a.state == 'WORKING' && wkKeep(b, a))
          || (t == 'CLOCK_OUT' && b.state == 'WORKING' && a.state == 'NOT_STARTED' && wkKeep(b, a))
          || (t == 'CLOSE_INCOMPLETE' && b.state in ['WORKING','FIRST_BREAK','LUNCH','LAST_BREAK'] && a.state == 'NOT_STARTED' && wkKeep(b, a))));
    }
    // W2 (4.5.0): WorkTrack client assignment helpers. One record per (session, Client ID); no hours are stored on it, so hours can never be multiplied.
    function waAuditRef(aid) { return /databases/$(database)/documents/workAssignAudit/$(aid); }
    function waRef(id) { return /databases/$(database)/documents/workAssign/$(id); }
    // True when, after this batch, the session is the one that is open right now (assignments can only change while it is open).
    function wkOpen(sid) { return existsAfter(wkState()) && getAfter(wkState()).data.sid == sid && getAfter(wkState()).data.state != 'NOT_STARTED'; }
    function regActive(cid) { return exists(regDoc(cid)) && get(regDoc(cid)).data.status == 'active'; }
    // W3 (4.5.0): the sealed log and corrections. Rules can check order and numbering only; the SHA-256 maths is done (and checked again by Verify) on the page.
    function wkSealRef(h) { return /databases/$(database)/documents/workSeals/$(h); }
    function wkChainRef() { return /databases/$(database)/documents/workChain/main; }
    function isHex64(s) { return s is string && s.matches('^[0-9a-f]{64}$'); }
    // B1 (4.5.0): billing profiles, billable hours and the migration of old client records. Owner only; see the match blocks before "clients".
    function bpDoc(cid) { return /databases/$(database)/documents/billingProfiles/$(cid); }
    function bpAudit(aid) { return /databases/$(database)/documents/billingProfileAudit/$(aid); }
    function beDoc(id) { return /databases/$(database)/documents/billableEntries/$(id); }
    function beAudit(aid) { return /databases/$(database)/documents/billableEntryAudit/$(aid); }
    function plainKey(k) { return k is string && k.matches('^[A-Za-z0-9]{16,40}$'); }
    // Currency and its decimal places must agree (the same table as core-money.js).
    function curExp(c, e) { return (c == 'USD' && e == 2) || (c == 'GBP' && e == 2) || (c == 'EUR' && e == 2) || (c == 'AUD' && e == 2) || (c == 'CAD' && e == 2) || (c == 'PHP' && e == 2) || (c == 'JPY' && e == 0) || (c == 'KWD' && e == 3); }
    // The shape of a billing profile. Custom anchor days are checked for count and format here; their order and 1-31 range are checked by the page (rules cannot loop).
    function bpOk(d) {
      return d.keys().hasOnly(['currency','exp','rateMinor','arrangement','schedKind','weekStart','anchors','genTime','tz','dueKind','dueDays','dueDate','rev','createdAt','updatedAt','lastAudit'])
        && d.keys().hasAll(['currency','exp','rateMinor','arrangement','schedKind','weekStart','anchors','genTime','tz','dueKind','dueDays','dueDate','rev','createdAt','updatedAt','lastAudit'])
        && d.currency is string && d.exp is int && curExp(d.currency, d.exp)
        && d.rateMinor is int && d.rateMinor >= 0 && d.rateMinor <= 1000000000
        && d.arrangement in ['hourly','monthly']
        && d.schedKind in ['weekly','monthly','midmonth','custom']
        && d.weekStart in ['mon','tue','wed','thu','fri','sat','sun']
        && d.anchors is string && d.anchors.matches('^$|^[0-9]{1,2}(,[0-9]{1,2}){0,3}$') && ((d.schedKind == 'custom') == (d.anchors.size() > 0))
        && d.genTime is string && d.genTime.matches('^([01][0-9]|2[0-3]):[0-5][0-9]$')
        && d.tz is string && d.tz.size() <= 60 && d.tz.matches('^[A-Za-z0-9_+/-]+$')
        && d.dueKind in ['fixed','afterSend','afterGeneration']
        && d.dueDays is int && d.dueDays >= 0 && d.dueDays <= 365
        && d.dueDate is string && d.dueDate.matches('^$|^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        && ((d.dueKind == 'fixed') == (d.dueDate.size() == 10))
        && (d.dueKind != 'fixed' || d.dueDays == 0)
        && d.rev is int && d.rev >= 1 && plainKey(d.lastAudit);
    }
    // The shape of one billable entry (hours for a client and a period). The document ID is checked against these fields in the match block.
    function beOk(d) {
      return d.keys().hasOnly(['clientId','periodStart','periodEnd','seq','submittedMinutes','approvedMinutes','status','note','supersedes','supersededBy','approvedAt','approverUid','relatedInvoiceId','rev','createdAt','updatedAt','lastAudit'])
        && d.keys().hasAll(['clientId','periodStart','periodEnd','seq','submittedMinutes','approvedMinutes','status','note','supersedes','supersededBy','approvedAt','approverUid','relatedInvoiceId','rev','createdAt','updatedAt','lastAudit'])
        && d.clientId is string && validClientId(d.clientId)
        && d.periodStart is string && d.periodStart.matches('^[0-9]{8}$') && d.periodEnd is string && d.periodEnd.matches('^[0-9]{8}$') && d.periodEnd >= d.periodStart
        && d.seq is string && d.seq.matches('^(0[1-9]|[1-9][0-9])$')
        && d.submittedMinutes is int && d.submittedMinutes >= 1 && d.submittedMinutes <= 133920
        && (d.approvedMinutes == null || (d.approvedMinutes is int && d.approvedMinutes >= 0 && d.approvedMinutes <= 133920))
        && d.status in ['DRAFT','SUBMITTED','APPROVED','SUPERSEDED']
        && d.note is string && d.note.size() <= 200
        && d.supersedes is string && d.supersedes.size() <= 80 && d.supersededBy is string && d.supersededBy.size() <= 80
        && d.approverUid is string && d.approverUid.size() <= 128
        && d.relatedInvoiceId is string && d.relatedInvoiceId.size() <= 80
        && d.rev is int && d.rev >= 1 && plainKey(d.lastAudit);
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
        && request.resource.data.type == 'view'
        && request.resource.data.path is string && request.resource.data.path.matches('^[A-Za-z0-9_-]{1,40}$')
        && id == request.resource.data.sid + '_' + request.resource.data.type + '_' + request.resource.data.path
        && request.resource.data.ref is string && request.resource.data.ref.size() <= 100
        && request.resource.data.device in ['desktop','tablet','mobile']
        && request.resource.data.browser is string && request.resource.data.browser.size() <= 20
        && request.resource.data.createdAt == request.time;
      allow create: if intakeOpen()
        && request.resource.data.keys().hasOnly(['vid','sid','type','path','ref','device','browser','createdAt','secs'])
        && request.resource.data.keys().hasAll(['vid','sid','type','path','ref','device','browser','createdAt','secs'])
        && request.resource.data.vid is string && request.resource.data.vid.matches('^[0-9a-f]{24}$')
        && request.resource.data.sid is string && request.resource.data.sid.matches('^[0-9a-f]{24}$')
        && request.resource.data.type == 'summary' && request.resource.data.path == 'sections'
        && id == request.resource.data.sid + '_summary_sections'
        && request.resource.data.ref == ''
        && request.resource.data.device in ['desktop','tablet','mobile']
        && request.resource.data.browser is string && request.resource.data.browser.size() <= 20
        && request.resource.data.createdAt == request.time
        && request.resource.data.secs is list && request.resource.data.secs.size() >= 1 && request.resource.data.secs.size() <= 12
        && request.resource.data.secs.hasOnly(['intro','services','training','experience','toolkit','process','testimonials','faq','thank-you','contact','schedule']);
      // E2: a session's summary may only GROW (same fields, more sections), a few times at most
      allow update: if intakeOpen()
        && resource.data.type == 'summary'
        && request.resource.data.keys().hasOnly(['vid','sid','type','path','ref','device','browser','createdAt','secs'])
        && request.resource.data.vid == resource.data.vid && request.resource.data.sid == resource.data.sid
        && request.resource.data.type == resource.data.type && request.resource.data.path == resource.data.path
        && request.resource.data.ref == resource.data.ref && request.resource.data.device == resource.data.device
        && request.resource.data.browser == resource.data.browser && request.resource.data.createdAt == resource.data.createdAt
        && request.resource.data.secs is list && request.resource.data.secs.size() <= 12
        && request.resource.data.secs.size() > resource.data.secs.size()
        && request.resource.data.secs.hasOnly(['intro','services','training','experience','toolkit','process','testimonials','faq','thank-you','contact','schedule'])
        && request.resource.data.secs.hasAll(resource.data.secs);
      allow read, delete: if isOwner();
    }
    // E3: private image library. Owner only (read, write, delete); every write is shape- and size-limited.
    match /library/{id} {
      allow read, delete: if isOwner();
      allow create, update: if isOwner()
        && request.resource.data.keys().hasOnly(['name','tags','mime','w','h','bytes','hash','thumb','used','usedIn','createdAt'])
        && request.resource.data.keys().hasAll(['name','tags','mime','w','h','bytes','hash','thumb','used','usedIn','createdAt'])
        && request.resource.data.name is string && request.resource.data.name.size() >= 1 && request.resource.data.name.size() <= 80
        && request.resource.data.tags is list && request.resource.data.tags.size() <= 10
        && request.resource.data.mime == 'image/webp'
        && request.resource.data.w is number && request.resource.data.h is number
        && request.resource.data.w >= 1 && request.resource.data.w <= 4000 && request.resource.data.h >= 1 && request.resource.data.h <= 4000
        && request.resource.data.bytes is number && request.resource.data.bytes >= 1 && request.resource.data.bytes <= 262144
        && request.resource.data.hash is string && request.resource.data.hash.size() <= 64
        && request.resource.data.thumb is string && request.resource.data.thumb.size() <= 24000
        && request.resource.data.used is number && request.resource.data.usedIn is list && request.resource.data.usedIn.size() <= 8
        && request.resource.data.createdAt is number;
    }
    match /libraryFull/{id} {
      allow read, delete: if isOwner();
      allow create, update: if isOwner()
        && request.resource.data.keys().hasOnly(['data','bytes'])
        && request.resource.data.keys().hasAll(['data','bytes'])
        && request.resource.data.data is string && request.resource.data.data.size() <= 360000
        && request.resource.data.data.matches('^data:image/webp;base64,[A-Za-z0-9+/]+={0,2}$')
        && request.resource.data.bytes is number && request.resource.data.bytes <= 262144;
    }
    // P0 (4.5.0): shared Client ID registry. IDs only - never a name, e-mail, phone or company. Owner only.
    // The ID is the document ID, so it can never be edited or reused, and there is no delete (archive instead).
    // Every create or update must be written in one batch with a BRAND-NEW audit record (lastAudit) and a revision number one higher,
    // so two tabs cannot overwrite each other and no change exists without its audit entry.
    match /clientRegistry/{id} {
      allow read: if isOwner();
      allow create: if isOwner() && validClientId(id)
        && request.resource.data.keys().hasOnly(['status','notes','createdAt','updatedAt','rev','lastAudit'])
        && request.resource.data.keys().hasAll(['status','notes','createdAt','updatedAt','rev','lastAudit'])
        && request.resource.data.status == 'active'
        && request.resource.data.notes is string && request.resource.data.notes.size() <= 500
        && request.resource.data.rev == 1
        && request.resource.data.createdAt == request.time && request.resource.data.updatedAt == request.time
        && request.resource.data.lastAudit is string && request.resource.data.lastAudit.matches('^[A-Za-z0-9]{16,40}$')
        && !exists(regAudit(request.resource.data.lastAudit)) && existsAfter(regAudit(request.resource.data.lastAudit));
      allow update: if isOwner() && validClientId(id)
        && request.resource.data.keys().hasOnly(['status','notes','createdAt','updatedAt','rev','lastAudit'])
        && request.resource.data.keys().hasAll(['status','notes','createdAt','updatedAt','rev','lastAudit'])
        && request.resource.data.status in ['active','archived']
        && request.resource.data.notes is string && request.resource.data.notes.size() <= 500
        && request.resource.data.rev is number && request.resource.data.rev == resource.data.rev + 1
        && request.resource.data.createdAt == resource.data.createdAt && request.resource.data.updatedAt == request.time
        && request.resource.data.lastAudit is string && request.resource.data.lastAudit.matches('^[A-Za-z0-9]{16,40}$')
        && !exists(regAudit(request.resource.data.lastAudit)) && existsAfter(regAudit(request.resource.data.lastAudit));
    }
    match /clientRegistryAudit/{aid} {
      allow read: if isOwner();
      allow create: if isOwner() && aid.matches('^[A-Za-z0-9]{16,40}$')
        && request.resource.data.keys().hasOnly(['clientId','action','prev','next','reason','rev','actor','createdAt'])
        && request.resource.data.keys().hasAll(['clientId','action','prev','next','reason','rev','actor','createdAt'])
        && request.resource.data.clientId is string && validClientId(request.resource.data.clientId)
        && request.resource.data.action in ['create','status','notes']
        && request.resource.data.prev is string && request.resource.data.prev.size() <= 500
        && request.resource.data.next is string && request.resource.data.next.size() <= 500
        && request.resource.data.reason is string && request.resource.data.reason.size() <= 200
        && (request.resource.data.action != 'status' || request.resource.data.reason.size() >= 3)
        && request.resource.data.rev is number
        && request.resource.data.actor == request.auth.uid
        && request.resource.data.createdAt == request.time
        && existsAfter(regDoc(request.resource.data.clientId))
        && getAfter(regDoc(request.resource.data.clientId)).data.lastAudit == aid
        && getAfter(regDoc(request.resource.data.clientId)).data.rev == request.resource.data.rev
        && ((request.resource.data.action == 'create') == (request.resource.data.rev == 1))
        && (request.resource.data.action != 'create' || request.resource.data.next == getAfter(regDoc(request.resource.data.clientId)).data.status)
        && (request.resource.data.action != 'status' || (request.resource.data.prev == get(regDoc(request.resource.data.clientId)).data.status && request.resource.data.next == getAfter(regDoc(request.resource.data.clientId)).data.status))
        && (request.resource.data.action != 'notes' || (request.resource.data.prev == get(regDoc(request.resource.data.clientId)).data.notes && request.resource.data.next == getAfter(regDoc(request.resource.data.clientId)).data.notes));
    }
    // W1 (4.5.0): WorkTrack. Owner only. Sessions and events are create-only (no edit, no delete), time is the server's (request.time).
    // Every punch is ONE batch: a brand-new event + the current-state record moved by exactly one valid step (revision +1, counter +1).
    // A second tab that tries the same step is refused, because the state it read is already out of date.
    match /workState/{id} {
      allow read: if isOwner();
      allow create: if isOwner() && id == 'main'
        && request.resource.data.keys().hasOnly(['state','sid','n','fb','lu','lb','lastEid','rev','updatedAt'])
        && request.resource.data.keys().hasAll(['state','sid','n','fb','lu','lb','lastEid','rev','updatedAt'])
        && request.resource.data.state == 'NOT_STARTED' && request.resource.data.sid == '' && request.resource.data.n == 0
        && request.resource.data.fb == false && request.resource.data.lu == false && request.resource.data.lb == false
        && request.resource.data.lastEid == '' && request.resource.data.rev == 1 && request.resource.data.updatedAt == request.time;
      allow update: if isOwner() && id == 'main'
        && request.resource.data.keys().hasOnly(['state','sid','n','fb','lu','lb','lastEid','rev','updatedAt'])
        && request.resource.data.keys().hasAll(['state','sid','n','fb','lu','lb','lastEid','rev','updatedAt'])
        && request.resource.data.state in ['NOT_STARTED','WORKING','FIRST_BREAK','LUNCH','LAST_BREAK']
        && wkSid(request.resource.data.sid)
        && request.resource.data.n is number && request.resource.data.n >= 1 && request.resource.data.n <= 12
        && request.resource.data.fb is bool && request.resource.data.lu is bool && request.resource.data.lb is bool
        && request.resource.data.lastEid is string && request.resource.data.lastEid.matches('^[A-Za-z0-9]{16,40}__[0-9]{1,2}$')
        && request.resource.data.rev is number && request.resource.data.rev == resource.data.rev + 1
        && request.resource.data.updatedAt == request.time
        && !exists(wkEvt(request.resource.data.lastEid)) && existsAfter(wkEvt(request.resource.data.lastEid));
    }
    match /workSessions/{sid} {
      allow read: if isOwner();
      allow create: if isOwner() && wkSid(sid)
        && request.resource.data.keys().hasOnly(['tz','date','startedAt','by'])
        && request.resource.data.keys().hasAll(['tz','date','startedAt','by'])
        && request.resource.data.tz is string && request.resource.data.tz.size() <= 60 && request.resource.data.tz.matches('^[A-Za-z0-9_+/-]+$')
        && request.resource.data.date is string && request.resource.data.date.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        && request.resource.data.startedAt == request.time && request.resource.data.by == request.auth.uid
        && existsAfter(wkEvt(sid + '__1')) && getAfter(wkEvt(sid + '__1')).data.type == 'CLOCK_IN';
    }
    match /workEvents/{eid} {
      allow read: if isOwner();
      allow create: if isOwner()
        && request.resource.data.keys().hasOnly(['sid','n','type','at','by','reason'])
        && request.resource.data.keys().hasAll(['sid','n','type','at','by','reason'])
        && wkSid(request.resource.data.sid)
        && request.resource.data.n is number && request.resource.data.n >= 1 && request.resource.data.n <= 12
        && wkEid(request.resource.data.sid, request.resource.data.n, eid)
        && request.resource.data.type in ['CLOCK_IN','FIRST_BREAK_OUT','FIRST_BREAK_IN','LUNCH_OUT','LUNCH_IN','LAST_BREAK_OUT','LAST_BREAK_IN','CLOCK_OUT','CLOSE_INCOMPLETE']
        && request.resource.data.at == request.time && request.resource.data.by == request.auth.uid
        && request.resource.data.reason is string
        && ((request.resource.data.type == 'CLOSE_INCOMPLETE' && request.resource.data.reason.size() >= 3 && request.resource.data.reason.size() <= 200)
            || (request.resource.data.type != 'CLOSE_INCOMPLETE' && request.resource.data.reason == ''))
        && exists(wkState()) && existsAfter(wkState())
        && getAfter(wkState()).data.lastEid == eid && getAfter(wkState()).data.sid == request.resource.data.sid && getAfter(wkState()).data.n == request.resource.data.n
        && wkStep(request.resource.data.type, get(wkState()).data, getAfter(wkState()).data)
        && (request.resource.data.type != 'CLOCK_IN' || (!exists(wkSess(request.resource.data.sid)) && existsAfter(wkSess(request.resource.data.sid))));
    }
    // W2 (4.5.0): client assignment on a work session. Owner only. IDs only (never a name). Every create or update is ONE batch with a BRAND-NEW
    // audit record and revision +1. Only while the session is open, only active Client IDs can be added, a client appears once per session
    // (removed ones can be added back), and there is no delete.
    match /workAssign/{id} {
      allow read: if isOwner();
      allow create: if isOwner()
        && request.resource.data.keys().hasOnly(['sid','clientId','status','rev','addedAt','updatedAt','lastAudit'])
        && request.resource.data.keys().hasAll(['sid','clientId','status','rev','addedAt','updatedAt','lastAudit'])
        && wkSid(request.resource.data.sid) && request.resource.data.clientId is string && validClientId(request.resource.data.clientId)
        && id == request.resource.data.sid + '__' + request.resource.data.clientId
        && request.resource.data.status == 'active' && request.resource.data.rev == 1
        && request.resource.data.addedAt == request.time && request.resource.data.updatedAt == request.time
        && request.resource.data.lastAudit is string && request.resource.data.lastAudit.matches('^[A-Za-z0-9]{16,40}$')
        && !exists(waAuditRef(request.resource.data.lastAudit)) && existsAfter(waAuditRef(request.resource.data.lastAudit))
        && wkOpen(request.resource.data.sid) && regActive(request.resource.data.clientId);
      allow update: if isOwner()
        && request.resource.data.keys().hasOnly(['sid','clientId','status','rev','addedAt','updatedAt','lastAudit'])
        && request.resource.data.keys().hasAll(['sid','clientId','status','rev','addedAt','updatedAt','lastAudit'])
        && request.resource.data.sid == resource.data.sid && request.resource.data.clientId == resource.data.clientId
        && request.resource.data.addedAt == resource.data.addedAt && request.resource.data.updatedAt == request.time
        && request.resource.data.status in ['active','removed'] && request.resource.data.status != resource.data.status
        && request.resource.data.rev is number && request.resource.data.rev == resource.data.rev + 1
        && request.resource.data.lastAudit is string && request.resource.data.lastAudit.matches('^[A-Za-z0-9]{16,40}$')
        && !exists(waAuditRef(request.resource.data.lastAudit)) && existsAfter(waAuditRef(request.resource.data.lastAudit))
        && wkOpen(request.resource.data.sid)
        && (request.resource.data.status == 'removed' || regActive(request.resource.data.clientId));
    }
    match /workAssignAudit/{aid} {
      allow read: if isOwner();
      allow create: if isOwner() && aid.matches('^[A-Za-z0-9]{16,40}$')
        && request.resource.data.keys().hasOnly(['sid','clientId','action','reason','rev','actor','createdAt'])
        && request.resource.data.keys().hasAll(['sid','clientId','action','reason','rev','actor','createdAt'])
        && wkSid(request.resource.data.sid) && request.resource.data.clientId is string && validClientId(request.resource.data.clientId)
        && request.resource.data.action in ['add','remove','readd']
        && request.resource.data.reason is string && request.resource.data.reason.size() <= 200
        && request.resource.data.rev is number
        && request.resource.data.actor == request.auth.uid && request.resource.data.createdAt == request.time
        && existsAfter(waRef(request.resource.data.sid + '__' + request.resource.data.clientId))
        && getAfter(waRef(request.resource.data.sid + '__' + request.resource.data.clientId)).data.lastAudit == aid
        && getAfter(waRef(request.resource.data.sid + '__' + request.resource.data.clientId)).data.rev == request.resource.data.rev
        && ((request.resource.data.action == 'add') == (request.resource.data.rev == 1))
        && (request.resource.data.action != 'add' || (!exists(waRef(request.resource.data.sid + '__' + request.resource.data.clientId)) && getAfter(waRef(request.resource.data.sid + '__' + request.resource.data.clientId)).data.status == 'active'))
        && (request.resource.data.action != 'remove' || (get(waRef(request.resource.data.sid + '__' + request.resource.data.clientId)).data.status == 'active' && getAfter(waRef(request.resource.data.sid + '__' + request.resource.data.clientId)).data.status == 'removed'))
        && (request.resource.data.action != 'readd' || (get(waRef(request.resource.data.sid + '__' + request.resource.data.clientId)).data.status == 'removed' && getAfter(waRef(request.resource.data.sid + '__' + request.resource.data.clientId)).data.status == 'active'));
    }
    // W3 (4.5.0): sealed log. A seal is create-only, its ID is its own fingerprint, and it is always written together with the chain head record
    // (the head moves exactly one step: number +1, previous fingerprint = the old head). No edit, no delete.
    match /workSeals/{h} {
      allow read: if isOwner();
      allow create: if isOwner() && isHex64(h)
        && request.resource.data.keys().hasOnly(['n','prev','hash','kind','ids','upto','legacyN','at','by'])
        && request.resource.data.keys().hasAll(['n','prev','hash','kind','ids','upto','legacyN','at','by'])
        && request.resource.data.hash == h && isHex64(request.resource.data.prev)
        && request.resource.data.n is int && request.resource.data.n >= 1 && request.resource.data.n <= 1000000
        && request.resource.data.kind in ['genesis','records']
        && request.resource.data.ids is list && request.resource.data.ids.size() <= 30
        && request.resource.data.upto is number && request.resource.data.upto >= 0
        && request.resource.data.legacyN is number && request.resource.data.legacyN >= 0 && request.resource.data.legacyN <= 100000
        && request.resource.data.at == request.time && request.resource.data.by == request.auth.uid
        && ((request.resource.data.kind == 'genesis' && request.resource.data.n == 1 && request.resource.data.prev == '0000000000000000000000000000000000000000000000000000000000000000' && request.resource.data.ids.size() == 0)
            || (request.resource.data.kind == 'records' && request.resource.data.n >= 2 && request.resource.data.ids.size() >= 1 && request.resource.data.upto == 0 && request.resource.data.legacyN == 0))
        && existsAfter(wkChainRef()) && getAfter(wkChainRef()).data.head == h && getAfter(wkChainRef()).data.cn == request.resource.data.n
        && ((request.resource.data.n == 1 && !exists(wkChainRef()))
            || (request.resource.data.n > 1 && exists(wkChainRef()) && get(wkChainRef()).data.head == request.resource.data.prev && get(wkChainRef()).data.cn + 1 == request.resource.data.n));
    }
    match /workChain/{id} {
      allow read: if isOwner();
      allow create: if isOwner() && id == 'main'
        && request.resource.data.keys().hasOnly(['cn','head','updatedAt'])
        && request.resource.data.keys().hasAll(['cn','head','updatedAt'])
        && request.resource.data.cn == 1 && isHex64(request.resource.data.head) && request.resource.data.updatedAt == request.time
        && !exists(wkSealRef(request.resource.data.head)) && existsAfter(wkSealRef(request.resource.data.head))
        && getAfter(wkSealRef(request.resource.data.head)).data.n == 1 && getAfter(wkSealRef(request.resource.data.head)).data.kind == 'genesis';
      allow update: if isOwner() && id == 'main'
        && request.resource.data.keys().hasOnly(['cn','head','updatedAt'])
        && request.resource.data.keys().hasAll(['cn','head','updatedAt'])
        && request.resource.data.cn is int && request.resource.data.cn == resource.data.cn + 1
        && isHex64(request.resource.data.head) && request.resource.data.updatedAt == request.time
        && !exists(wkSealRef(request.resource.data.head)) && existsAfter(wkSealRef(request.resource.data.head))
        && getAfter(wkSealRef(request.resource.data.head)).data.n == request.resource.data.cn
        && getAfter(wkSealRef(request.resource.data.head)).data.prev == resource.data.head;
    }
    // W3 (4.5.0): corrections. A closed session is never edited: a correction is a NEW create-only record with a reason, allowed only for 24 hours after
    // the session's closing punch (measured with the database's clock). Four kinds: change the time of a punch, add a missed break (out and in),
    // add a client, remove a client. Whether the corrected day is still in a valid order is checked by the page (rules cannot sort).
    match /workCorrections/{cid} {
      allow read: if isOwner();
      allow create: if isOwner() && cid.matches('^[A-Za-z0-9]{16,40}$')
        && request.resource.data.keys().hasOnly(['sid','kind','n','type','clientId','at','at2','reason','closeEid','closeN','by','createdAt'])
        && request.resource.data.keys().hasAll(['sid','kind','n','type','clientId','at','at2','reason','closeEid','closeN','by','createdAt'])
        && wkSid(request.resource.data.sid)
        && request.resource.data.kind in ['TIME','ADD','CLIENT_ADD','CLIENT_REMOVE']
        && request.resource.data.reason is string && request.resource.data.reason.size() >= 3 && request.resource.data.reason.size() <= 200
        && request.resource.data.by == request.auth.uid && request.resource.data.createdAt == request.time
        && request.resource.data.closeN is number && request.resource.data.closeN >= 1 && request.resource.data.closeN <= 12
        && wkEid(request.resource.data.sid, request.resource.data.closeN, request.resource.data.closeEid)
        && exists(wkEvt(request.resource.data.closeEid)) && get(wkEvt(request.resource.data.closeEid)).data.sid == request.resource.data.sid
        && get(wkEvt(request.resource.data.closeEid)).data.type in ['CLOCK_OUT','CLOSE_INCOMPLETE']
        && request.time < get(wkEvt(request.resource.data.closeEid)).data.at + duration.value(24, 'h')
        && exists(wkSess(request.resource.data.sid))
        && exists(wkState()) && (get(wkState()).data.sid != request.resource.data.sid || get(wkState()).data.state == 'NOT_STARTED')
        && ((request.resource.data.kind == 'TIME'
              && request.resource.data.n is number && request.resource.data.n >= 1 && request.resource.data.n <= 12
              && request.resource.data.type == '' && request.resource.data.clientId == ''
              && request.resource.data.at is timestamp && request.resource.data.at2 == null
              && request.resource.data.at <= request.time && request.resource.data.at > get(wkEvt(request.resource.data.closeEid)).data.at - duration.value(48, 'h'))
            || (request.resource.data.kind == 'ADD'
              && request.resource.data.n == 0 && request.resource.data.type in ['FIRST_BREAK','LUNCH','LAST_BREAK'] && request.resource.data.clientId == ''
              && request.resource.data.at is timestamp && request.resource.data.at2 is timestamp
              && request.resource.data.at2 > request.resource.data.at && request.resource.data.at2 <= request.time
              && request.resource.data.at > get(wkEvt(request.resource.data.closeEid)).data.at - duration.value(48, 'h'))
            || (request.resource.data.kind == 'CLIENT_ADD'
              && request.resource.data.n == 0 && request.resource.data.type == ''
              && request.resource.data.clientId is string && validClientId(request.resource.data.clientId)
              && request.resource.data.at == null && request.resource.data.at2 == null && regActive(request.resource.data.clientId))
            || (request.resource.data.kind == 'CLIENT_REMOVE'
              && request.resource.data.n == 0 && request.resource.data.type == ''
              && request.resource.data.clientId is string && validClientId(request.resource.data.clientId)
              && request.resource.data.at == null && request.resource.data.at2 == null));
    }
    // W3 (4.5.0): work settings (time zone for NEW sessions, first weekday of the week). Owner only; each change keeps the value it replaced.
    match /workSettings/{id} {
      allow read: if isOwner();
      allow create: if isOwner() && id == 'main'
        && request.resource.data.keys().hasOnly(['tz','weekStart','prevTz','prevWeekStart','rev','updatedAt'])
        && request.resource.data.keys().hasAll(['tz','weekStart','prevTz','prevWeekStart','rev','updatedAt'])
        && request.resource.data.tz is string && request.resource.data.tz.size() <= 60 && request.resource.data.tz.matches('^[A-Za-z0-9_+/-]+$')
        && request.resource.data.weekStart in ['mon','tue','wed','thu','fri','sat','sun']
        && request.resource.data.prevTz == '' && request.resource.data.prevWeekStart == ''
        && request.resource.data.rev == 1 && request.resource.data.updatedAt == request.time;
      allow update: if isOwner() && id == 'main'
        && request.resource.data.keys().hasOnly(['tz','weekStart','prevTz','prevWeekStart','rev','updatedAt'])
        && request.resource.data.keys().hasAll(['tz','weekStart','prevTz','prevWeekStart','rev','updatedAt'])
        && request.resource.data.tz is string && request.resource.data.tz.size() <= 60 && request.resource.data.tz.matches('^[A-Za-z0-9_+/-]+$')
        && request.resource.data.weekStart in ['mon','tue','wed','thu','fri','sat','sun']
        && request.resource.data.prevTz == resource.data.tz && request.resource.data.prevWeekStart == resource.data.weekStart
        && request.resource.data.rev is number && request.resource.data.rev == resource.data.rev + 1 && request.resource.data.updatedAt == request.time;
    }
    // B1 (4.5.0): billing profile, one per Client ID (the document ID IS the Client ID, which must exist in the registry). Never a name or contact detail.
    // Every create and change is ONE batch with a brand-new audit record (revision +1). No delete. A currency change affects new invoices only (there are none yet).
    match /billingProfiles/{id} {
      allow read: if isOwner();
      allow create: if isOwner() && validClientId(id) && (regActive(id) || (!exists(regDoc(id)) && existsAfter(regDoc(id)) && getAfter(regDoc(id)).data.status == 'active')) && bpOk(request.resource.data)
        && request.resource.data.rev == 1
        && request.resource.data.createdAt == request.time && request.resource.data.updatedAt == request.time
        && !exists(bpAudit(request.resource.data.lastAudit)) && existsAfter(bpAudit(request.resource.data.lastAudit));
      allow update: if isOwner() && validClientId(id) && exists(regDoc(id)) && bpOk(request.resource.data)
        && request.resource.data.rev == resource.data.rev + 1
        && request.resource.data.createdAt == resource.data.createdAt && request.resource.data.updatedAt == request.time
        && !exists(bpAudit(request.resource.data.lastAudit)) && existsAfter(bpAudit(request.resource.data.lastAudit));
    }
    match /billingProfileAudit/{aid} {
      allow read: if isOwner();
      allow create: if isOwner() && plainKey(aid)
        && request.resource.data.keys().hasOnly(['clientId','action','rev','currency','rateMinor','arrangement','summary','reason','actor','createdAt'])
        && request.resource.data.keys().hasAll(['clientId','action','rev','currency','rateMinor','arrangement','summary','reason','actor','createdAt'])
        && request.resource.data.clientId is string && validClientId(request.resource.data.clientId)
        && request.resource.data.action in ['create','update']
        && request.resource.data.rev is int
        && request.resource.data.summary is string && request.resource.data.summary.size() >= 1 && request.resource.data.summary.size() <= 300
        && request.resource.data.reason is string && request.resource.data.reason.size() <= 200
        && (request.resource.data.action != 'update' || request.resource.data.reason.size() >= 3)
        && request.resource.data.actor == request.auth.uid && request.resource.data.createdAt == request.time
        && existsAfter(bpDoc(request.resource.data.clientId))
        && getAfter(bpDoc(request.resource.data.clientId)).data.lastAudit == aid
        && getAfter(bpDoc(request.resource.data.clientId)).data.rev == request.resource.data.rev
        && getAfter(bpDoc(request.resource.data.clientId)).data.currency == request.resource.data.currency
        && getAfter(bpDoc(request.resource.data.clientId)).data.rateMinor == request.resource.data.rateMinor
        && getAfter(bpDoc(request.resource.data.clientId)).data.arrangement == request.resource.data.arrangement
        && ((request.resource.data.action == 'create') == (request.resource.data.rev == 1))
        && (request.resource.data.action == 'create' || (exists(bpDoc(request.resource.data.clientId)) && get(bpDoc(request.resource.data.clientId)).data.rev + 1 == request.resource.data.rev));
    }
    // B1 (4.5.0): billable hours. The ID is CLIENTID__YYYYMMDD__YYYYMMDD__NN (client, period start, period end, sequence), so one entry exists per client, period and sequence number.
    // DRAFT -> SUBMITTED -> APPROVED (self-approved: the approver and the server time are stored). An approved entry never changes its minutes: a later change is a NEW entry
    // that points back to it, and the old one becomes SUPERSEDED in the same batch. Every step has its own brand-new audit record. No delete.
    // Every change to an existing billable entry (n = after the write, o = before it).
    function beUpdateOk(id, n, o) {
      return beOk(n)
        && n.clientId == o.clientId && n.periodStart == o.periodStart
        && n.periodEnd == o.periodEnd && n.seq == o.seq
        && n.createdAt == o.createdAt && n.supersedes == o.supersedes
        && n.rev == o.rev + 1 && n.updatedAt == request.time
        && !exists(beAudit(n.lastAudit)) && existsAfter(beAudit(n.lastAudit))
        && (
          // edit a draft
          (o.status == 'DRAFT' && n.status == 'DRAFT' && n.relatedInvoiceId == o.relatedInvoiceId
            && n.approvedMinutes == null && n.approvedAt == null && n.approverUid == '' && n.supersededBy == '')
          // submit
          || (o.status == 'DRAFT' && n.status == 'SUBMITTED' && n.relatedInvoiceId == o.relatedInvoiceId
            && n.submittedMinutes == o.submittedMinutes && n.note == o.note
            && n.approvedMinutes == null && n.approvedAt == null && n.approverUid == '' && n.supersededBy == '')
          // reopen
          || (o.status == 'SUBMITTED' && n.status == 'DRAFT' && n.relatedInvoiceId == o.relatedInvoiceId
            && n.submittedMinutes == o.submittedMinutes && n.note == o.note
            && n.approvedMinutes == null && n.approvedAt == null && n.approverUid == '' && n.supersededBy == '')
          // approve (self-approved)
          || (o.status == 'SUBMITTED' && n.status == 'APPROVED' && n.relatedInvoiceId == o.relatedInvoiceId
            && n.submittedMinutes == o.submittedMinutes && n.note == o.note
            && n.approvedMinutes != null && n.approvedAt == request.time
            && n.approverUid == request.auth.uid && n.supersededBy == '')
          // replaced by a newer entry (created in the same batch)
          || (o.status == 'APPROVED' && n.status == 'SUPERSEDED' && o.relatedInvoiceId == '' && n.relatedInvoiceId == ''
            && n.submittedMinutes == o.submittedMinutes && n.approvedMinutes == o.approvedMinutes
            && n.approvedAt == o.approvedAt && n.approverUid == o.approverUid && n.note == o.note
            && n.supersededBy.size() > 0
            && existsAfter(beDoc(n.supersededBy)) && getAfter(beDoc(n.supersededBy)).data.supersedes == id
            && getAfter(beDoc(n.supersededBy)).data.status == 'DRAFT')
          // B2: put on a new draft invoice (made in the same batch and listing this entry); the hours stay exactly as approved
          || (o.status == 'APPROVED' && n.status == 'APPROVED' && o.relatedInvoiceId == '' && n.relatedInvoiceId != ''
            && n.submittedMinutes == o.submittedMinutes && n.approvedMinutes == o.approvedMinutes
            && n.approvedAt == o.approvedAt && n.approverUid == o.approverUid && n.note == o.note
            && n.supersededBy == o.supersededBy
            && beLinkInvOk(n.relatedInvoiceId, id, o.clientId))
          // B2: released when its draft or ready invoice is cancelled in the same batch
          || (o.status == 'APPROVED' && n.status == 'APPROVED' && o.relatedInvoiceId != '' && n.relatedInvoiceId == ''
            && n.submittedMinutes == o.submittedMinutes && n.approvedMinutes == o.approvedMinutes
            && n.approvedAt == o.approvedAt && n.approverUid == o.approverUid && n.note == o.note
            && n.supersededBy == o.supersededBy
            && beUnlinkInvOk(o.relatedInvoiceId))
        );
    }
    match /billableEntries/{id} {
      allow read: if isOwner();
      allow create: if isOwner() && beOk(request.resource.data)
        && id == request.resource.data.clientId + '__' + request.resource.data.periodStart + '__' + request.resource.data.periodEnd + '__' + request.resource.data.seq
        && regActive(request.resource.data.clientId) && exists(bpDoc(request.resource.data.clientId))
        && request.resource.data.status == 'DRAFT' && request.resource.data.rev == 1
        && request.resource.data.approvedMinutes == null && request.resource.data.approvedAt == null && request.resource.data.approverUid == ''
        && request.resource.data.relatedInvoiceId == '' && request.resource.data.supersededBy == ''
        && request.resource.data.createdAt == request.time && request.resource.data.updatedAt == request.time
        && !exists(beAudit(request.resource.data.lastAudit)) && existsAfter(beAudit(request.resource.data.lastAudit))
        && (request.resource.data.supersedes == ''
            || (exists(beDoc(request.resource.data.supersedes)) && get(beDoc(request.resource.data.supersedes)).data.status == 'APPROVED'
                && get(beDoc(request.resource.data.supersedes)).data.clientId == request.resource.data.clientId
                && get(beDoc(request.resource.data.supersedes)).data.periodStart == request.resource.data.periodStart
                && get(beDoc(request.resource.data.supersedes)).data.periodEnd == request.resource.data.periodEnd
                && existsAfter(beDoc(request.resource.data.supersedes)) && getAfter(beDoc(request.resource.data.supersedes)).data.status == 'SUPERSEDED'
                && getAfter(beDoc(request.resource.data.supersedes)).data.supersededBy == id));
      allow update: if isOwner() && beUpdateOk(id, request.resource.data, resource.data);
    }
    match /billableEntryAudit/{aid} {
      allow read: if isOwner();
      allow create: if isOwner() && plainKey(aid)
        && request.resource.data.keys().hasOnly(['entryId','clientId','action','fromStatus','toStatus','rev','submittedMinutes','approvedMinutes','reason','actor','createdAt'])
        && request.resource.data.keys().hasAll(['entryId','clientId','action','fromStatus','toStatus','rev','submittedMinutes','approvedMinutes','reason','actor','createdAt'])
        && request.resource.data.entryId is string && request.resource.data.entryId.size() <= 80
        && request.resource.data.clientId is string && validClientId(request.resource.data.clientId)
        && request.resource.data.fromStatus in ['','DRAFT','SUBMITTED','APPROVED'] && request.resource.data.toStatus in ['DRAFT','SUBMITTED','APPROVED','SUPERSEDED']
        && request.resource.data.reason is string && request.resource.data.reason.size() <= 200
        && request.resource.data.rev is int
        && request.resource.data.actor == request.auth.uid && request.resource.data.createdAt == request.time
        && existsAfter(beDoc(request.resource.data.entryId))
        && getAfter(beDoc(request.resource.data.entryId)).data.lastAudit == aid
        && getAfter(beDoc(request.resource.data.entryId)).data.rev == request.resource.data.rev
        && getAfter(beDoc(request.resource.data.entryId)).data.status == request.resource.data.toStatus
        && getAfter(beDoc(request.resource.data.entryId)).data.clientId == request.resource.data.clientId
        && getAfter(beDoc(request.resource.data.entryId)).data.submittedMinutes == request.resource.data.submittedMinutes
        && getAfter(beDoc(request.resource.data.entryId)).data.approvedMinutes == request.resource.data.approvedMinutes
        && ((request.resource.data.action == 'create' && request.resource.data.rev == 1 && request.resource.data.fromStatus == '' && request.resource.data.toStatus == 'DRAFT'
              && (getAfter(beDoc(request.resource.data.entryId)).data.supersedes == '' || request.resource.data.reason.size() >= 3))
            || (request.resource.data.action == 'edit' && request.resource.data.fromStatus == 'DRAFT' && request.resource.data.toStatus == 'DRAFT')
            || (request.resource.data.action == 'submit' && request.resource.data.fromStatus == 'DRAFT' && request.resource.data.toStatus == 'SUBMITTED')
            || (request.resource.data.action == 'reopen' && request.resource.data.fromStatus == 'SUBMITTED' && request.resource.data.toStatus == 'DRAFT' && request.resource.data.reason.size() >= 3)
            || (request.resource.data.action == 'approve' && request.resource.data.fromStatus == 'SUBMITTED' && request.resource.data.toStatus == 'APPROVED')
            || (request.resource.data.action == 'supersede' && request.resource.data.fromStatus == 'APPROVED' && request.resource.data.toStatus == 'SUPERSEDED' && request.resource.data.reason.size() >= 3)
            || (request.resource.data.action == 'link' && request.resource.data.fromStatus == 'APPROVED' && request.resource.data.toStatus == 'APPROVED' && getAfter(beDoc(request.resource.data.entryId)).data.relatedInvoiceId != '')
            || (request.resource.data.action == 'unlink' && request.resource.data.fromStatus == 'APPROVED' && request.resource.data.toStatus == 'APPROVED' && getAfter(beDoc(request.resource.data.entryId)).data.relatedInvoiceId == '' && request.resource.data.reason.size() >= 3))
        && (request.resource.data.action == 'create'
            || (exists(beDoc(request.resource.data.entryId)) && get(beDoc(request.resource.data.entryId)).data.status == request.resource.data.fromStatus
                && get(beDoc(request.resource.data.entryId)).data.rev + 1 == request.resource.data.rev));
    }
    // B1 (4.5.0): which old client record became which Client ID. Create-only; the ID is the old record's ID. Written in the same batch as the new billing profile
    // (which must NOT exist yet, so two old records can never share one profile). Never holds a name or contact detail.
    match /billingMigration/{lid} {
      allow read: if isOwner();
      allow create: if isOwner() && lid.matches('^[A-Za-z0-9]{10,40}$')
        && request.resource.data.keys().hasOnly(['clientId','profileNew','registryNew','arrangement','by','createdAt'])
        && request.resource.data.keys().hasAll(['clientId','profileNew','registryNew','arrangement','by','createdAt'])
        && request.resource.data.clientId is string && validClientId(request.resource.data.clientId)
        && request.resource.data.profileNew == true && request.resource.data.registryNew is bool
        && request.resource.data.arrangement in ['hourly','monthly']
        && request.resource.data.by == request.auth.uid && request.resource.data.createdAt == request.time
        && !exists(bpDoc(request.resource.data.clientId)) && existsAfter(bpDoc(request.resource.data.clientId))
        && getAfter(bpDoc(request.resource.data.clientId)).data.rev == 1
        && getAfter(bpDoc(request.resource.data.clientId)).data.arrangement == request.resource.data.arrangement
        && ((request.resource.data.registryNew == true && !exists(regDoc(request.resource.data.clientId)) && existsAfter(regDoc(request.resource.data.clientId)))
            || (request.resource.data.registryNew == false && regActive(request.resource.data.clientId)));
    }
    // B2 (4.5.0): invoices, payments, reversals, adjustments and due-date changes. Owner only. Money is whole minor units. Every change is ONE batch that pairs the invoice
    // update with a brand-new record (the "paired write"), so the cached balance on the invoice can never move without a record that explains it.
    // Rules cannot loop or divide: an invoice holds at most 2 approved entries (their minutes are added up here) and the half-up total is checked as an inequality.
    // Payment dates and due-date maths are checked by the page; the rules check the date FORMAT only.
    // Entry side of the invoice link, written with let so each invoice is read once (a write may use at most 1000 rule steps; a missing invoice makes the read fail, which refuses the write).
    function beLinkInvOk(rel, id, cid) {
      let i = getAfter(invDoc(rel)).data;
      return !exists(invDoc(rel)) && i.status == 'DRAFT' && i.clientId == cid && id in i.entryIds;
    }
    function beUnlinkInvOk(rel) {
      let b = get(invDoc(rel)).data;
      let a = getAfter(invDoc(rel)).data;
      return (b.status == 'DRAFT' || b.status == 'READY') && a.status == 'CANCELLED';
    }
    function invDoc(id) { return /databases/$(database)/documents/invoices/$(id); }
    function invAudit(aid) { return /databases/$(database)/documents/invoiceAudit/$(aid); }
    function payDoc(pid) { return /databases/$(database)/documents/payments/$(pid); }
    function revDoc(pid) { return /databases/$(database)/documents/paymentReversals/$(pid); }
    function adjDoc(aid) { return /databases/$(database)/documents/invoiceAdjustments/$(aid); }
    function dueDoc(did) { return /databases/$(database)/documents/invoiceDueDates/$(did); }
    function dateFmt(s) { return s is string && s.matches('^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'); }
    function invBaseId(d) { return d.clientId + '__' + d.periodStart + '__' + d.periodEnd; }
    function invOk(d) {
      return d.keys().hasOnly(['clientId','periodStart','periodEnd','suffix','currency','exp','rateMinor','tz','dueKind','dueDays','dueDate','entryIds','minutes','totalMinor','status','sentAt','paidMinor','creditMinor','adjMinor','rev','createdAt','updatedAt','lastKind','lastRef'])
        && d.clientId is string && validClientId(d.clientId)
        && d.periodStart is string && d.periodStart.matches('^[0-9]{8}$') && d.periodEnd is string && d.periodEnd.matches('^[0-9]{8}$') && d.periodEnd >= d.periodStart
        && d.suffix is string && d.suffix.matches('^$|^(0[2-9]|[1-9][0-9])$')
        && d.currency is string && d.exp is int && curExp(d.currency, d.exp)
        && d.rateMinor is int && d.rateMinor >= 1 && d.rateMinor <= 1000000000
        && d.tz is string && d.tz.size() <= 60 && d.tz.matches('^[A-Za-z0-9_+/-]+$')
        && d.dueKind in ['fixed','afterSend','afterGeneration'] && d.dueDays is int && d.dueDays >= 0 && d.dueDays <= 365
        && d.dueDate is string && d.dueDate.matches('^$|^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        && d.entryIds is list && d.entryIds.size() >= 1 && d.entryIds.size() <= 2
        && d.minutes is int && d.minutes >= 1 && d.minutes <= 267840
        && d.totalMinor is int && d.totalMinor >= 0 && d.totalMinor <= 1000000000000
        && d.status in ['DRAFT','READY','SENT','CANCELLED']
        && (d.sentAt == null || d.sentAt is timestamp)
        && d.paidMinor is int && d.paidMinor >= 0 && d.paidMinor <= 1000000000000
        && d.creditMinor is int && d.creditMinor >= 0 && d.creditMinor <= 1000000000000
        && d.adjMinor is int && d.adjMinor >= -1000000000000 && d.adjMinor <= 1000000000000
        && d.rev is int && d.rev >= 1
        && d.lastKind in ['create','ready','send','cancel','payment','credit','reversal','adjustment','due']
        && plainKey(d.lastRef);
    }
    // The fields an invoice can never change after it is made.
    function invFixed(n, o) {
      return n.clientId == o.clientId && n.periodStart == o.periodStart && n.periodEnd == o.periodEnd && n.suffix == o.suffix
        && n.currency == o.currency && n.exp == o.exp && n.rateMinor == o.rateMinor && n.tz == o.tz && n.dueKind == o.dueKind && n.dueDays == o.dueDays
        && n.entryIds == o.entryIds && n.minutes == o.minutes && n.totalMinor == o.totalMinor && n.createdAt == o.createdAt;
    }
    function invMoneySame(n, o) { return n.paidMinor == o.paidMinor && n.creditMinor == o.creditMinor && n.adjMinor == o.adjMinor; }
    // Approved minutes of a listed entry as it will be after this batch, and the list of entries all being approved, linked to this invoice, same client and period.
    function invEntData(e, iid, d) {
      return e.status == 'APPROVED' && e.relatedInvoiceId == iid && e.clientId == d.clientId && e.periodStart == d.periodStart && e.periodEnd == d.periodEnd;
    }
    function invEnt2(iid, d, a) {
      let b = getAfter(beDoc(d.entryIds[1])).data;
      return d.entryIds[0] != d.entryIds[1] && invEntData(b, iid, d) && d.minutes == a.approvedMinutes + b.approvedMinutes;
    }
    // A missing entry makes getAfter fail, which refuses the write.
    function invEntsOk(iid, d) {
      let a = getAfter(beDoc(d.entryIds[0])).data;
      return invEntData(a, iid, d) && ((d.entryIds.size() == 1 && d.minutes == a.approvedMinutes) || (d.entryIds.size() == 2 && invEnt2(iid, d, a)));
    }
    // total = round-half-up(rate x minutes / 60), written without division: 120 x total <= 2 x rate x minutes + 60 < 120 x (total + 1)
    function invTotalOk(d) {
      return 120 * d.totalMinor <= 2 * d.rateMinor * d.minutes + 60 && 2 * d.rateMinor * d.minutes + 60 < 120 * (d.totalMinor + 1);
    }
    function invDueOk(d, p) {
      return (p.dueKind == 'fixed' && d.dueDate == p.dueDate) || (p.dueKind == 'afterGeneration' && dateFmt(d.dueDate)) || (p.dueKind == 'afterSend' && d.dueDate == '');
    }
    function invUnl2(d) { return getAfter(beDoc(d.entryIds[1])).data.relatedInvoiceId == ''; }
    function invUnlinked(d) {
      let a = getAfter(beDoc(d.entryIds[0])).data;
      return a.relatedInvoiceId == '' && (d.entryIds.size() == 1 || (d.entryIds.size() == 2 && invUnl2(d)));
    }
    // Everything an invoice must satisfy when it is made. The billing profile is read once (rules allow only so many steps per write).
    function invCreateOk(id, d) {
      let bp = get(bpDoc(d.clientId)).data;
      return invOk(d)
        && ((d.suffix == '' && id == invBaseId(d)) || (d.suffix != '' && id == invBaseId(d) + '__' + d.suffix))
        && regActive(d.clientId) && bp.arrangement == 'hourly' && bp.rateMinor >= 1
        && d.currency == bp.currency && d.exp == bp.exp && d.rateMinor == bp.rateMinor && d.tz == bp.tz
        && d.dueKind == bp.dueKind && d.dueDays == bp.dueDays && invDueOk(d, bp)
        && d.status == 'DRAFT' && d.sentAt == null && d.paidMinor == 0 && d.creditMinor == 0 && d.adjMinor == 0
        && d.rev == 1 && d.lastKind == 'create' && d.createdAt == request.time && d.updatedAt == request.time
        && invTotalOk(d) && invEntsOk(id, d)
        && !exists(invAudit(d.lastRef)) && existsAfter(invAudit(d.lastRef));
    }
    // Every change to an existing invoice (n = the invoice after the write, o = before it). One shared function so each value is read once.
    function invUpdateOk(id, n, o) {
      return invOk(n) && invFixed(n, o)
        && n.rev == o.rev + 1 && n.updatedAt == request.time
        && (
          // draft -> ready
          (n.lastKind == 'ready' && o.status == 'DRAFT' && n.status == 'READY'
            && n.sentAt == null && n.dueDate == o.dueDate && invMoneySame(n, o)
            && !exists(invAudit(n.lastRef)) && existsAfter(invAudit(n.lastRef)))
          // ready -> sent (the sent time is the server time; "after sending" due dates are fixed now)
          || (n.lastKind == 'send' && o.status == 'READY' && n.status == 'SENT'
            && n.sentAt == request.time && invMoneySame(n, o)
            && ((o.dueKind == 'afterSend' && dateFmt(n.dueDate)) || (o.dueKind != 'afterSend' && n.dueDate == o.dueDate))
            && !exists(invAudit(n.lastRef)) && existsAfter(invAudit(n.lastRef)))
          // draft or ready -> cancelled (its entries are released in the same batch)
          || (n.lastKind == 'cancel' && (o.status == 'DRAFT' || o.status == 'READY') && n.status == 'CANCELLED'
            && n.sentAt == null && n.dueDate == o.dueDate && invMoneySame(n, o)
            && invUnlinked(o)
            && !exists(invAudit(n.lastRef)) && existsAfter(invAudit(n.lastRef)))
          // a payment is recorded (only on a sent invoice; never more than the invoice total)
          || (n.lastKind == 'payment' && o.status == 'SENT' && n.status == 'SENT'
            && n.sentAt == o.sentAt && n.dueDate == o.dueDate
            && n.creditMinor == o.creditMinor && n.adjMinor == o.adjMinor
            && n.paidMinor > o.paidMinor && n.paidMinor <= o.totalMinor + o.adjMinor
            && !exists(payDoc(n.lastRef)) && existsAfter(payDoc(n.lastRef))
            && getAfter(payDoc(n.lastRef)).data.invoiceId == id && getAfter(payDoc(n.lastRef)).data.kind == 'payment'
            && getAfter(payDoc(n.lastRef)).data.amountMinor == n.paidMinor - o.paidMinor)
          // money received beyond a fully paid invoice, recorded as a credit
          || (n.lastKind == 'credit' && o.status == 'SENT' && n.status == 'SENT'
            && n.sentAt == o.sentAt && n.dueDate == o.dueDate
            && n.paidMinor == o.paidMinor && n.adjMinor == o.adjMinor
            && o.paidMinor == o.totalMinor + o.adjMinor && n.creditMinor > o.creditMinor
            && !exists(payDoc(n.lastRef)) && existsAfter(payDoc(n.lastRef))
            && getAfter(payDoc(n.lastRef)).data.invoiceId == id && getAfter(payDoc(n.lastRef)).data.kind == 'credit'
            && getAfter(payDoc(n.lastRef)).data.amountMinor == n.creditMinor - o.creditMinor)
          // a whole payment is reversed (the reversal's ID is the payment's ID, so it can happen once)
          || (n.lastKind == 'reversal' && o.status == 'SENT' && n.status == 'SENT'
            && n.sentAt == o.sentAt && n.dueDate == o.dueDate && n.adjMinor == o.adjMinor
            && exists(payDoc(n.lastRef)) && get(payDoc(n.lastRef)).data.invoiceId == id
            && !exists(revDoc(n.lastRef)) && existsAfter(revDoc(n.lastRef))
            && ((get(payDoc(n.lastRef)).data.kind == 'payment' && o.creditMinor == 0 && n.creditMinor == 0
                  && n.paidMinor == o.paidMinor - get(payDoc(n.lastRef)).data.amountMinor)
                || (get(payDoc(n.lastRef)).data.kind == 'credit' && n.paidMinor == o.paidMinor
                  && n.creditMinor == o.creditMinor - get(payDoc(n.lastRef)).data.amountMinor)))
          // an adjustment after sending (never below what was already paid; not while a credit is held)
          || (n.lastKind == 'adjustment' && o.status == 'SENT' && n.status == 'SENT'
            && n.sentAt == o.sentAt && n.dueDate == o.dueDate
            && n.paidMinor == o.paidMinor && n.creditMinor == o.creditMinor && o.creditMinor == 0
            && n.adjMinor != o.adjMinor && o.totalMinor + n.adjMinor >= o.paidMinor
            && !exists(adjDoc(n.lastRef)) && existsAfter(adjDoc(n.lastRef))
            && getAfter(adjDoc(n.lastRef)).data.invoiceId == id
            && getAfter(adjDoc(n.lastRef)).data.amountMinor == n.adjMinor - o.adjMinor)
          // the due date is changed after sending (old and new date and a reason are recorded)
          || (n.lastKind == 'due' && o.status == 'SENT' && n.status == 'SENT'
            && n.sentAt == o.sentAt && invMoneySame(n, o)
            && n.dueDate != o.dueDate && dateFmt(n.dueDate)
            && !exists(dueDoc(n.lastRef)) && existsAfter(dueDoc(n.lastRef))
            && getAfter(dueDoc(n.lastRef)).data.invoiceId == id
            && getAfter(dueDoc(n.lastRef)).data.previous == o.dueDate && getAfter(dueDoc(n.lastRef)).data.next == n.dueDate)
        );
    }
    match /invoices/{id} {
      allow read: if isOwner();
      allow create: if isOwner() && invCreateOk(id, request.resource.data);
      allow update: if isOwner() && invUpdateOk(id, request.resource.data, resource.data);
    }
    match /invoiceAudit/{aid} {
      allow read: if isOwner();
      allow create: if isOwner() && plainKey(aid)
        && request.resource.data.keys().hasOnly(['invoiceId','action','fromStatus','toStatus','rev','totalMinor','reason','actor','createdAt'])
        && request.resource.data.keys().hasAll(['invoiceId','action','fromStatus','toStatus','rev','totalMinor','reason','actor','createdAt'])
        && request.resource.data.invoiceId is string && request.resource.data.invoiceId.size() <= 80
        && request.resource.data.rev is int && request.resource.data.totalMinor is int
        && request.resource.data.reason is string && request.resource.data.reason.size() <= 200
        && request.resource.data.actor == request.auth.uid && request.resource.data.createdAt == request.time
        && existsAfter(invDoc(request.resource.data.invoiceId))
        && getAfter(invDoc(request.resource.data.invoiceId)).data.lastRef == aid
        && getAfter(invDoc(request.resource.data.invoiceId)).data.lastKind == request.resource.data.action
        && getAfter(invDoc(request.resource.data.invoiceId)).data.rev == request.resource.data.rev
        && getAfter(invDoc(request.resource.data.invoiceId)).data.status == request.resource.data.toStatus
        && getAfter(invDoc(request.resource.data.invoiceId)).data.totalMinor == request.resource.data.totalMinor
        && ((request.resource.data.action == 'create' && request.resource.data.rev == 1 && request.resource.data.fromStatus == '' && request.resource.data.toStatus == 'DRAFT')
            || (request.resource.data.action == 'ready' && request.resource.data.fromStatus == 'DRAFT' && request.resource.data.toStatus == 'READY')
            || (request.resource.data.action == 'send' && request.resource.data.fromStatus == 'READY' && request.resource.data.toStatus == 'SENT')
            || (request.resource.data.action == 'cancel' && (request.resource.data.fromStatus == 'DRAFT' || request.resource.data.fromStatus == 'READY') && request.resource.data.toStatus == 'CANCELLED' && request.resource.data.reason.size() >= 3))
        && (request.resource.data.action == 'create'
            || (exists(invDoc(request.resource.data.invoiceId)) && get(invDoc(request.resource.data.invoiceId)).data.status == request.resource.data.fromStatus
                && get(invDoc(request.resource.data.invoiceId)).data.rev + 1 == request.resource.data.rev));
    }
    // A payment or a credit. Create-only. The ID is made by the browser when the form opens, so a retry or a second tab can never record it twice.
    match /payments/{pid} {
      allow read: if isOwner();
      allow create: if isOwner() && plainKey(pid)
        && request.resource.data.keys().hasOnly(['invoiceId','clientId','kind','amountMinor','currency','date','method','note','reason','correctionId','payloadHash','actor','createdAt'])
        && request.resource.data.keys().hasAll(['invoiceId','clientId','kind','amountMinor','currency','date','method','note','reason','correctionId','payloadHash','actor','createdAt'])
        && request.resource.data.invoiceId is string && request.resource.data.invoiceId.size() <= 80
        && request.resource.data.clientId is string && validClientId(request.resource.data.clientId)
        && request.resource.data.kind in ['payment','credit']
        && request.resource.data.amountMinor is int && request.resource.data.amountMinor >= 1 && request.resource.data.amountMinor <= 1000000000000
        && request.resource.data.currency is string && dateFmt(request.resource.data.date)
        && request.resource.data.method is string && request.resource.data.method.size() <= 40
        && request.resource.data.note is string && request.resource.data.note.size() <= 200
        && request.resource.data.reason is string && request.resource.data.reason.size() <= 200
        && (request.resource.data.kind != 'credit' || request.resource.data.reason.size() >= 3)
        && request.resource.data.correctionId is string && request.resource.data.correctionId.matches('^$|^[A-Za-z0-9]{16,40}$')
        && isHex64(request.resource.data.payloadHash)
        && request.resource.data.actor == request.auth.uid && request.resource.data.createdAt == request.time
        && exists(invDoc(request.resource.data.invoiceId)) && get(invDoc(request.resource.data.invoiceId)).data.status == 'SENT'
        && get(invDoc(request.resource.data.invoiceId)).data.clientId == request.resource.data.clientId
        && get(invDoc(request.resource.data.invoiceId)).data.currency == request.resource.data.currency
        && existsAfter(invDoc(request.resource.data.invoiceId))
        && getAfter(invDoc(request.resource.data.invoiceId)).data.lastKind == request.resource.data.kind
        && getAfter(invDoc(request.resource.data.invoiceId)).data.lastRef == pid;
    }
    // Reverses ONE whole payment or credit. The ID is the payment's ID, so it can only happen once.
    match /paymentReversals/{pid} {
      allow read: if isOwner();
      allow create: if isOwner() && plainKey(pid)
        && request.resource.data.keys().hasOnly(['invoiceId','clientId','kind','amountMinor','reason','correctionId','actor','createdAt'])
        && request.resource.data.keys().hasAll(['invoiceId','clientId','kind','amountMinor','reason','correctionId','actor','createdAt'])
        && request.resource.data.reason is string && request.resource.data.reason.size() >= 3 && request.resource.data.reason.size() <= 200
        && request.resource.data.correctionId is string && request.resource.data.correctionId.matches('^$|^[A-Za-z0-9]{16,40}$')
        && request.resource.data.actor == request.auth.uid && request.resource.data.createdAt == request.time
        && exists(payDoc(pid))
        && get(payDoc(pid)).data.invoiceId == request.resource.data.invoiceId && get(payDoc(pid)).data.clientId == request.resource.data.clientId
        && get(payDoc(pid)).data.kind == request.resource.data.kind && get(payDoc(pid)).data.amountMinor == request.resource.data.amountMinor
        && exists(invDoc(request.resource.data.invoiceId)) && get(invDoc(request.resource.data.invoiceId)).data.status == 'SENT'
        && existsAfter(invDoc(request.resource.data.invoiceId))
        && getAfter(invDoc(request.resource.data.invoiceId)).data.lastKind == 'reversal' && getAfter(invDoc(request.resource.data.invoiceId)).data.lastRef == pid;
    }
    match /invoiceAdjustments/{aid} {
      allow read: if isOwner();
      allow create: if isOwner() && plainKey(aid)
        && request.resource.data.keys().hasOnly(['invoiceId','clientId','amountMinor','reason','entryRef','actor','createdAt'])
        && request.resource.data.keys().hasAll(['invoiceId','clientId','amountMinor','reason','entryRef','actor','createdAt'])
        && request.resource.data.invoiceId is string && request.resource.data.invoiceId.size() <= 80
        && request.resource.data.clientId is string && validClientId(request.resource.data.clientId)
        && request.resource.data.amountMinor is int && request.resource.data.amountMinor != 0 && request.resource.data.amountMinor >= -1000000000000 && request.resource.data.amountMinor <= 1000000000000
        && request.resource.data.reason is string && request.resource.data.reason.size() >= 3 && request.resource.data.reason.size() <= 200
        && request.resource.data.entryRef is string && request.resource.data.entryRef.size() <= 80
        && request.resource.data.actor == request.auth.uid && request.resource.data.createdAt == request.time
        && exists(invDoc(request.resource.data.invoiceId)) && get(invDoc(request.resource.data.invoiceId)).data.status == 'SENT'
        && get(invDoc(request.resource.data.invoiceId)).data.clientId == request.resource.data.clientId
        && existsAfter(invDoc(request.resource.data.invoiceId))
        && getAfter(invDoc(request.resource.data.invoiceId)).data.lastKind == 'adjustment' && getAfter(invDoc(request.resource.data.invoiceId)).data.lastRef == aid;
    }
    match /invoiceDueDates/{did} {
      allow read: if isOwner();
      allow create: if isOwner() && plainKey(did)
        && request.resource.data.keys().hasOnly(['invoiceId','clientId','previous','next','reason','actor','createdAt'])
        && request.resource.data.keys().hasAll(['invoiceId','clientId','previous','next','reason','actor','createdAt'])
        && request.resource.data.invoiceId is string && request.resource.data.invoiceId.size() <= 80
        && request.resource.data.clientId is string && validClientId(request.resource.data.clientId)
        && dateFmt(request.resource.data.previous) && dateFmt(request.resource.data.next) && request.resource.data.previous != request.resource.data.next
        && request.resource.data.reason is string && request.resource.data.reason.size() >= 3 && request.resource.data.reason.size() <= 200
        && request.resource.data.actor == request.auth.uid && request.resource.data.createdAt == request.time
        && exists(invDoc(request.resource.data.invoiceId)) && get(invDoc(request.resource.data.invoiceId)).data.status == 'SENT'
        && get(invDoc(request.resource.data.invoiceId)).data.clientId == request.resource.data.clientId
        && existsAfter(invDoc(request.resource.data.invoiceId))
        && getAfter(invDoc(request.resource.data.invoiceId)).data.lastKind == 'due' && getAfter(invDoc(request.resource.data.invoiceId)).data.lastRef == did;
    }
    // B3 (4.5.0): the owner can skip a billing period (create-only; the period ID is the record ID, so a period can be skipped once). Nothing else about
    // periods is stored: they are worked out from the billing profile. That no hours exist for the period is checked by the page, not the rules.
    function skipOk(id, d) {
      let bp = get(bpDoc(d.clientId)).data;
      return d.keys().hasOnly(['clientId','periodStart','periodEnd','reason','actor','createdAt'])
        && validClientId(d.clientId) && regActive(d.clientId) && bp.arrangement == 'hourly'
        && d.periodStart.matches('^[0-9]{8}$') && d.periodEnd.matches('^[0-9]{8}$') && d.periodEnd >= d.periodStart
        && id == d.clientId + '__' + d.periodStart + '__' + d.periodEnd
        && d.reason is string && d.reason.size() >= 3 && d.reason.size() <= 200
        && d.actor == request.auth.uid && d.createdAt == request.time;
    }
    match /periodSkips/{id} {
      allow read: if isOwner();
      allow create: if isOwner() && skipOk(id, request.resource.data);
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
- **Webhook security review**: see Owner Panel > Chatbot configuration, and `server/` for a ready proxy. Finding: the webhook address is stored in `settings/site`, which visitors can read, and is called from the browser, so it is publicly visible. On the free Spark plan nothing inside Firebase can hide it, so the fix is the free Cloudflare Worker in `server/` (keeps the real URL and secret, checks origin, size, format and rate). **Replace the old webhook URL in n8n/Make** once the proxy is in use.

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
5. **Chatbot webhook** (optional): deploy `server/chat-proxy-worker.js` on Cloudflare (free) and paste the Worker address instead of the n8n/Make address. Replace any webhook URL that was saved before Phase 5.
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
- **App Check (optional, free):** the site starts Firebase App Check with a reCAPTCHA / Fraud Defense key when `appCheckSiteKey` in `scripts/settings.js` is filled in. Empty (the default) = nothing changes.
- Two new items on the Security checklist (App Check registered, App Check enforced).

**App Check set-up (do in this order; do not skip the monitoring step)**
Google has retired classic reCAPTCHA for new keys, so use **Fraud Defense** (formerly reCAPTCHA Enterprise). Its Essentials tier is free and needs **no billing account**: up to 10,000 assessments per month, and past that it answers with an error (429) instead of charging. If any screen asks you to enable billing or add a card, stop and do not continue.
1. Google Cloud console (project my-online-portfolio-db2a5) > Security > Fraud Defense (reCAPTCHA) > Create key: platform **Website**, add your site domain (fredespinosa86app-jpg.github.io), score-based. Enable the API if asked (no billing needed). Copy the **site key** (the public ID).
2. Firebase console > App Check > Apps > your web app > **Fraud Defense** > enter that site key, set Token time to live to **7 days** (fewer assessments), Save.
3. Paste the same **site key** into `appCheckSiteKey` in `scripts/settings.js` (keep `appCheckProvider: "enterprise"`), upload, then browse the site and the owner panel once. No secret key goes into any file.
4. App Check > APIs > Cloud Firestore: watch verified vs unverified for a few days. Only when your own traffic shows as verified, press **Enforce**. If real visitors are ever blocked (for example the 10,000/month allowance runs out), un-enforce at once.
5. For testing on localhost App Check needs a debug token (App Check > Apps > Manage debug tokens); never publish a debug token.

**Honest limits**
- Firestore rules cannot count requests per person. A bot that changes its random ID can still send valid-looking records; the format rules, the pause button and App Check (once enforced) are what limit that. Free-plan quotas still apply (20,000 writes and 50,000 reads a day); at the limit, writes simply fail until the daily reset.
- Each guarded write now costs one extra document read for the pause check (the existing capacity check already worked this way).
- The flood counter only runs while the Security page is open; there is no background monitor on the free plan. Google's usage graphs (Firebase console > Usage) are the other signal.
- Public reading of site content is open by design; App Check enforcement also covers reads.
- Fraud Defense Essentials (free, no billing) allows 10,000 assessments a month for the whole Google organisation; each new visitor or device uses about one per token lifetime. If that is exceeded and App Check is enforced, new visitors would be refused: un-enforce, or leave App Check in monitoring mode.
- Not done in S2: one analytics summary per visit (it would change the stored visit format and the visitors page), Cloudflare. Say so if you want either.

## Security S3 - Browser defenses

**What changed**
- **Content Security Policy (CSP)** in `index.html` (a `<meta http-equiv="Content-Security-Policy">` line near the top). Only this site, Google sign-in/App Check, YouTube/Loom videos and Firebase may load scripts or frames. Injected scripts, inline event handlers, plug-ins (`object`), a changed `<base>` and forms that post to other sites are refused. The one inline script (dark-mode switch) is allowed by its fingerprint (hash). If you ever edit that script, its hash must be recomputed (the test in S3 shows the expected value).
- **Anti-clickjacking:** `scripts/frame-guard.js` makes the page hide itself or break out if another website puts it in a frame. GitHub Pages cannot send the usual `X-Frame-Options` / `frame-ancestors` headers, so this is the best available protection on this host.
- **Chatbot answers:** owner-typed values (rates, currency, availability text) placed inside the chatbot's built-in answers are now escaped. AI/knowledge-base answers were already shown as plain text.
- **Fonts hosted on this site** (`assets/fonts`, `styles/fonts.css`): visitors' browsers no longer contact Google Fonts, so no visitor IP address is shared with Google for fonts, and the CSP can stay tighter. (Fraunces uses its standard optical size instead of the variable one; the difference is barely visible.)
- Referrer policy set to `strict-origin-when-cross-origin`.

**If something stops working after S3** (sign-in popup, App Check, a video): open the browser Console (F12). A line starting "Refused to ..." names the blocked address. Quick undo: delete the one `Content-Security-Policy` line in `index.html` and upload; tell me the message and I will adjust the policy.

**Honest limits**
- A CSP in a `<meta>` tag cannot report violations and cannot set `frame-ancestors`; real HTTP headers need a host that supports them (for example Cloudflare in front of the site, not part of S3).
- `style-src` still allows inline styles (the owner panel and several scripts set styles that way). Scripts are the main XSS risk, and they are locked down.
- `connect-src` allows any `https:` address because the chatbot webhook, the custom-domain checker and Google Calendar call addresses you choose yourself. After those are final, it can be narrowed to the exact hosts.
- Google sign-in, reCAPTCHA / App Check and the video players could not be run against the real Google servers here; the policy was written from their documented addresses and verified against the mocked site.
- Not done in S3: Cloudflare / HTTP headers (you have not chosen it).


## Security Phase 3.1 - Loading cover

**What it does:** on every page load or refresh a black screen with three pulsing dots covers the page until your saved settings have been applied, so nobody sees the default page first. It then fades out (about 0.35 s).

**It is released when all of these are true:** the page has finished loading; fonts are ready; the settings and all 15 content documents have each answered from Firebase (data, empty or an error counts); the pictures at the top are decoded; and at least 0.6 s have passed. **Hard limit: 10 seconds** after the page starts loading, whatever is still missing. On a normal connection it lasts about 1 second.

**It never traps anyone:** search-engine bots, visitors with JavaScript off, and any script error skip or release it. It appears once per page load only (not on in-page links such as #schedule, and not when you open or close the owner panel). With "reduce motion" on, the dots do not animate and the fade is instant.

**Adjust or remove:** the limits are `MIN` and `MAX` at the top of `scripts/boot-cover.js` (milliseconds). To switch it off, add `display:none` to `#boot` in `styles/boot.css`, or delete the `<div id="boot">` line in `index.html`.

**Limits:** while Firebase itself is slow, visitors see the dots for up to 10 s instead of the default page. The cover colour is black; the fade is the only transition. Deciding on a different colour or style is a one-line change in `styles/boot.css`.

## Security Phase 3.2 - Loading screen options, header Owner login, same-day meetings
**Loading screen (Owner panel > General > "Loading screen").** On/off, longest wait (1-10 s, standard 10), shortest time (0-2 s, standard 0.6), fade (0.1-1 s), background colour (dots turn black or white automatically for contrast), dots style (pulse / bounce / still), Reset to standard values and a 2-second Preview. Values are saved in `settings/site.loading` and read from the browser's cached copy, so a change applies from the visitor's **next visit**. Out-of-range values are clamped. The same screen also appears briefly when a visitor clicks Hire Me or any link to `#schedule`.
**Header "Owner login".** Replaces the footer "Owner Panel" link (the footer button stays in the page but is hidden). It shows only on a device that has signed in as owner before, when the address ends with `#owner`, or when you choose "Show to everyone" in General. After sign-in it reads "Owner panel" and opens the dashboard. Hiding the button is convenience only: access is still decided by Google sign-in and the Firestore rules.
**Same-day meetings (Owner panel > Availability, rates & capacity).** "Allow same-day meeting requests" (standard **Off**: today is greyed and bookable from tomorrow) and "Minimum notice" (1-24 hours). When On, a slot today can be requested only if it starts at least that many hours from now in your time zone; earlier slots show "Too soon". The list re-checks every minute. The chatbot's availability answer states the rule, and the inbox tags such requests "Same day". Fields: `content/availability.sameDay`, `.sameDayHours`.
**Limits.** No rules change was needed. The notice rule is enforced in the visitor's browser only (Spark has no server code); a determined visitor could still write a request document for today, which you would simply decline. Existing sites that allowed today before this update now default to Off until you switch it on.

## Security S4 - Chatbot and webhook hardening
**Where it applies.** The AI webhook only exists when you use the Cloudflare Worker proxy (`server/`). **You must paste the new `server/chat-proxy-worker.js` into your Worker and deploy it again** for the Worker-side protections; the website part works as soon as this ZIP is uploaded. Steps and variables: `server/README.md`.
**Browser (this ZIP).** Messages that try to override rules, extract the prompt or keys, change the role or inject markup are not sent to the webhook (the scripted answers still work). Only the visitor's own earlier messages are sent as history (a forged "assistant" turn can no longer be planted). Answers from the webhook are shown as plain text, invisible/bidirectional characters and HTML are removed, length is capped at 2000 characters, and only links to this site stay clickable.
**Worker v2.** Missing/foreign Origin refused; body size enforced while reading; text cleaned (invisible and look-alike characters); injection screen (`block` default, or `flag`); `untrusted`, `suspicious` and `guard` fields added so your n8n/Make AI step can treat the text as data; answer checking (markup, foreign links, leaked webhook URL/secret, key-like strings, "system prompt" wording replaced by a safe fallback); limits per minute, per chat session per hour, per address per day and a total per day; no redirects followed. 11 automated tests: `node --test server/worker.test.mjs`.
**Limits (honest).** Injection screening by pattern catches common attacks, not every possible wording; the real defence is the guard text and giving the AI step no tools. In-Worker counters are per Worker instance and reset when it restarts, so add the Cloudflare rate-limiting rule from `server/README.md` for a hard limit (the free plan allows one rule; if your account does not offer it, the in-Worker limits remain). Nothing here needs a paid service. The Worker could not be run against Cloudflare from here; it was tested with Node and a pretend upstream. No Firestore rules were changed.

## Security S5 - Privacy and recovery
**Where:** Owner panel > **Privacy & backup** (new page). No Firestore rules change and no paid service.
**Backup / restore.** Download a JSON backup of site settings, content, private settings and clients (and, for your records, meeting requests, chatbot questions, activity log, visit records). The file has a SHA-256 checksum. Restore first *checks* the file (format and version, checksum, only known collections, safe document names, no forbidden field names, size and depth limits) and writes nothing until you tick what to restore, type RESTORE and confirm; a safety copy of the current data downloads first. Meeting requests, chatbot questions, activity and visits are export-only because the rules let visitors create them but not the owner. The panel reminds you when the last backup is over 30 days old. Keep backup files private: they contain client and visitor details.
**Retention.** Choose how long visit records (default 90 days), chatbot questions (180 days), finished meeting requests (2 years) and the activity log (180 days) are kept; "Check what is due" counts them and "Delete due records" removes them after confirmation. The free plan has no scheduler, so this runs when you press it (the panel shows the date of the last cleanup). Clients are never deleted automatically. The privacy notice shows your periods.
**One person's data.** Search meeting requests and clients by email or name (up to 1,000 of each kind per search), export the matches as JSON, and delete them on request. Chatbot questions are anonymous and cannot be linked to a person.
**Privacy notice.** Rewritten (what is collected, why, how long, who sees it, rights, the National Privacy Commission) with an optional contact line you set in the same page. **Please review the wording yourself; it is not legal advice.**
**security.txt.** `security.txt` and `.well-known/security.txt` (with `.nojekyll` so GitHub Pages serves the dot-folder) point to your schedule form. Browsers and scanners look for it at the *root* of a domain, which a `github.io/<project>` address does not give you; it works fully once you use a custom domain. It expires on 2027-10-31: update the date yearly.
**Incident checklist.** In the same page and in `INCIDENT-CHECKLIST.md`.
**Limits.** Retention is manual (no background jobs on the free plan). A backup stored on your own computer is only as safe as that computer. Restore needs the owner to be signed in and cannot restore visitor-created collections. `node --test scripts/backup-core.test.mjs` runs the backup engine tests.
**Phase 5.1 fix.** Download backup failed with "permission denied" because the rules allow reading only the single document `settings/site`, not listing the `settings` collection. The backup now reads that one document (rules unchanged). If the old page is still shown after uploading, hard-refresh (Ctrl+Shift+R): the version tag is `s51`.

## Security S6 - Final attack test
No new feature. Added `rules-tests/attack/` (123 attack cases and a 15-way mutation check that run the real `firestore.rules` text with no emulator, see its README), a final report `SECURITY-FINAL-REPORT.md` (status of every finding, results, limits, routine), and one hardening: the owner panel cannot be forced visible by a visitor any more (it hides itself again and starts no panel code without a verified owner sign-in). Version tag `s6`.

## Enhancement E1 – intro video, loading wait, optional sections

**Intro video (Owner panel → Intro video)**
- New **Remove video** button (asks first): saves an empty link and turns the section off. An empty saved link now stays empty. The default link is used only on a site that has never saved an intro setting.
- The intro setting is applied from the locally cached settings at first paint. The old 1.2 s timer that showed the default video while waiting for the database was removed, so a saved Off or removed link never flashes the video.

**Loading screen (General → Loading screen)**
- "Wait until ready, but never longer than" now offers 5, 10, 15, 20, 25 or 30 seconds (default 10). Older saved values snap to the nearest option. Minimum time can never exceed the maximum. Choosing 20 s or more shows a note that only very slow connections wait that long.

**Optional sections (General → Optional sections)**
- Switches for the public **Toolkit** and **How I Work** sections (both On by default), stored in `settings/site.sections = {toolkit, process}`. Off hides the section and its menu link, from the cached settings, with no flash.
- Toolkit / How I Work details inside each Training area are untouched. Hiding How I Work also hides the videos that are not assigned to a training area.
- No Firestore rules change is needed for E1 (`settings/site` is already owner-write, public-read).

## Enhancement E2 – fewer writes per visit

**Before:** one `view` record plus one `section` record for every section a visitor scrolled to (up to 12 writes per visit).
**Now:** one `view` record straight away, plus ONE summary record `visits/{sid}_summary_sections` with the list of sections seen (2 writes per visit, about 6 times fewer on a full read). Free-plan limit: 20,000 writes/day.

- The summary is written when the visitor leaves (`visibilitychange` to hidden / `pagehide`) or after a fixed 2-minute idle cap. If the leave event never fires the view is still counted and only the sections are lost.
- The same record may grow (more sections, same fields) at most twice more in one tab session. Double leave events write nothing. A failed write is retried on the next leave.
- **Rules changed (both `firestore.rules` and `firestore.rules.strict`) – you must republish them:** visits now accept `type: view` (as before) or the new `summary` (fixed id, 1–12 ids from a fixed list of 11 section names, `ref` empty, create once, update only to add sections). The old per-section `type: section` create is no longer accepted; old records already stored are still read.
- Visitors page: "Sections viewed" and "Most viewed sections" count summary lists plus any old section records, so history stays continuous (a summary counts each listed section once per visit).
- Data retention ("Delete records older than 90 days") and backup export already handle any `visits` document, so summaries are included.
- Privacy notice wording updated: sections are saved together as one short list when the visitor leaves.
- Rules tests: 168 attack cases and 22 mutations (`rules-tests/attack`).

## Enhancement E3 – Image library with a storage cap

**Owner panel → Content → Image library.** Pictures are resized and compressed in the browser to WebP (at most 1200 px wide, at most 250 KB each) and stored as database documents. No paid Storage product is used.

- **Accepted:** JPG, PNG, WebP, checked by the file's first bytes (not the name). SVG, GIF, scripts and everything else are refused. Exact duplicates are refused.
- **Where it lives:** `library/{id}` (name, tags, size, small thumbnail, hash, where it was used) and `libraryFull/{id}` (the compressed picture). Both are **owner only** (read, write, delete) in `firestore.rules` and `firestore.rules.strict`, with size/shape limits on every write. **You must republish `firestore.rules.strict`.**
- **Storage cap (your setting):** 50 / 100 / 200 (default) / 300 / 400 / 500 MB, saved in `ownerPrivate/library`. A meter shows the use; a warning at 80%; uploads and restores are blocked at 100%. At most 300 pictures. The cap is enforced by this page because the free plan has no server code; the rules additionally cap each document. It measures the library only, not the other pictures stored in settings or content.
- **Using a picture:** every image upload field in the owner panel (hero image, hero photo, chatbot picture, and the edit-dialog fields for services, toolkit, testimonials and training) has a **Choose from library** button. The picture is COPIED into the field through that field's own upload steps, so visitors cause no extra database reads, and deleting a library picture later never breaks the public site.
- **Delete:** a picture that was copied into the site before shows a warning (it lists where). "Select never-used" helps clean up.
- **Library backup:** its own file (`codeflow-image-library-DATE.json`, with the pictures inside, so keep it private). Restore skips duplicates and invalid items, checks every picture's hash, and stops at the cap or the 300 limit. The normal backup does not include the library.
- **Reads:** opening the library page reads the small records once (about one read per picture); the full pictures are read only when you pick one, back up or restore.
- Rules tests: 217 attack cases and 31 mutations (`rules-tests/attack`).

See also `KNOWN-ISSUES.md` (open item KI-1: the Toolkit switch).

## Enhancement E4 – Google hub: Sheets, Zoom link, Google Meet

**Owner panel → Integrations** now starts with a hub that shows every Google tool at a glance: owner sign-in, Calendar, Google Meet, Sheets, the Zoom link, and **Drive and Gmail, which stay ON HOLD by the owner's decision**. No paid plan and no Firebase upgrade is needed for anything here.

**Google Sheets (your own free Apps Script)**
- Paste `server/google-sheets-script.gs` into a Google Sheet (Extensions > Apps Script), add a script property `TOKEN` (a long random text, 16+ characters), deploy it as a Web app (Execute as Me, access Anyone), then paste the Web app address and the same token in the owner panel and press Save and Test connection. The page shows the script and the steps too.
- Buttons send **meeting requests**, **clients** and a **daily visitor summary** (the days loaded on the Visitors page; no raw visit records, no visitor IDs). Sending again updates rows by ID, so there are no duplicates. Batches of at most 200 rows with a short pause. A failed send stops, reports it, and does not advance the "last sent" time.
- Only you can send (buttons in the signed-in owner panel). Visitors never send anything to your sheet. Personal details leave the database only to a sheet you own, after a confirmation.
- Safety: the address must be `https://script.google.com/macros/s/…/exec`; the token must be 16+ characters; every cell that starts with `=`, `+`, `-` or `@` is neutralised both in the page and in the script, and the sheet columns are plain text.
- The address and token are stored only in `ownerPrivate/google` (owner only) and are **never included in a backup or restored from one**. Disconnect deletes them.
- Tests: `node --test server/google-sheets-script.test.mjs` runs the real script against a fake Google environment.

**Zoom and Google Meet**
- Save one reusable Zoom meeting link (`zoom.us` or `zoom.com`, paths `/j/`, `/my/`, `/w/`). It appears as "Meeting link" in the details of a request where the visitor chose Zoom, and in the Google Calendar event (location and description).
- Optional switch: for requests that chose "Google Meet", the calendar event is created with a new Google Meet link (needs Google Calendar connected below).
- This uses a saved link, not the Zoom API. Creating a different Zoom meeting for each request would need the Zoom API and a secret key held in your own Apps Script; it is not part of E4.

**Proposed privacy wording (NOT added to the public notice yet; approve first):**
"The site owner may keep a copy of meeting requests, client records and visit totals in a private Google Sheet that only the owner can open."

No Firestore rules change in E4 (`ownerPrivate` is already owner only). Rules tests: 223 attack cases and 31 mutations.

## Enhancement E4.1 – Toolkit switch fix and privacy wording

- **Fix (KI-1):** the "Show the Toolkit section" switch now stays off. The cause was `content.js` showing the section again whenever the toolkit list was applied. See `KNOWN-ISSUES.md`.
- **Privacy notice:** the approved sentence was added under a new "Private copies" line: "The site owner may keep a copy of meeting requests, client records and visit totals in a private Google Sheet that only the owner can open."
- No rules change.

## 4.5.0 - Phase P0: Foundation (Client IDs)
- **Owner Panel > Client IDs:** one private registry of client IDs (IDs only: no names, e-mails, phones or companies). Choose your own numbering format, add the next ID or a custom one, add a private note, archive and restore (with a reason). IDs can never be renamed, reused or deleted. Every change is saved together with a history entry.
- **Rules:** new collections `clientRegistry` and `clientRegistryAudit` in both rules files. **Publish `firestore.rules.strict` again** (Firebase Console > Firestore Database > Rules) or the page will say permission denied.
- **Shared libraries:** `scripts/core-ids.js` (loaded), `core-money.js` and `core-time.js` (tested, used by later phases).
- **Backup:** Client IDs and their history can be included in the normal backup (saved, not restorable).
- **Tests:** `node --test scripts/*.test.mjs server/*.test.mjs`; `python3 rules-tests/attack/attack_cases.py .` and `mutation_check.py .`; real-emulator tests in `rules-tests/emulator` (run by the GitHub workflow "Firestore rules (emulator)", or locally with Java 17: `cd rules-tests/emulator && npm install && npm test`).
- **Docs:** `internal-docs/4.5.0-P0-inspection-and-schema.md`. This repository is public, so nothing secret belongs there.

## 4.5.0 - Phase W1: WorkTrack punches and live clock
- **Owner Panel > WorkTrack:** eight punches (Clock in, First break out/in, Lunch out/in, Last break out/in, Clock out) with a live clock. Session time keeps running during breaks; working time pauses. Times are shown in Asia/Manila. Breaks are optional, free in order, and each can be used once per session. Only the punches that are allowed right now can be pressed; the others say why.
- **Records:** `workState/main` (current position), `workSessions/{id}` (one per day worked, with its time zone) and `workEvents/{session}__{number}` (one per punch). Sessions and events are create-only: no edit, no delete. The time of every punch is the database's time. No names, e-mails, phones or companies are stored.
- **One punch = one transaction** (event + state + session at clock in). A second tab or device holding an old view is refused and the page refreshes ("changed in another tab"). Punching needs a connection on purpose, so a delayed write can never carry a later time.
- **Forgot to clock out:** after 16 hours the page warns. "Close as incomplete" closes the session with a mandatory reason (3 to 200 characters) and keeps no working-time total. Proper corrections arrive in a later phase.
- **Rules:** new collections `workState`, `workSessions`, `workEvents` in both rules files. **Publish `firestore.rules.strict` again** or the page will say permission denied.
- **Tests:** `node --test scripts/*.test.mjs`; `python3 rules-tests/attack/attack_cases.py .` (the page's own state machine is compared with the rules for all 108 punch/state cases) and `mutation_check.py .`; real-engine tests in `rules-tests/emulator/worktrack.test.mjs` (run by the GitHub workflow "Firestore rules (emulator)").
- **Not in W1:** client assignment (W2), corrections and the tamper-evident chain (W3), history and reports (W4). Events written now have no hash yet; W3 decides how the chain starts.

## 4.5.0 - Phase W2: Clients on a work session
- **Owner Panel > WorkTrack > Clients on this session:** add or remove Client IDs (from the Client IDs registry) while a session is open. Only IDs are stored (no names, no hours). Time is counted once for the session, however many clients are assigned: a 9-hour session with 3 clients is 9 hours, never 27.
- **Before clocking in:** pick the clients first. The picks are kept only on this device (this browser) and are saved in the same transaction as the clock-in, so a session never starts half-saved. If a picked client was archived meanwhile, nothing is recorded, the pick is dropped and the page says so.
- **Rules of the road:** at most 10 clients per session (enforced by the page; database rules cannot count); only active Client IDs can be newly added; an archived client already on the session stays and can still be removed; removing has an optional reason (up to 200 characters); a removed client can be added back. When the session closes, its client list is frozen (changes later come with corrections in W3).
- **Records:** `workAssign/{session}__{CLIENTID}` (status active|removed, revision, times) and `workAssignAudit/{id}` (add, remove, readd, reason, who, when). Every change is one transaction of assignment + a brand-new audit entry; there is no delete. The page also shows the full change history ("Show changes").
- **Rules:** new collections `workAssign` and `workAssignAudit` in both rules files. **Publish `firestore.rules.strict` again** or the page will say permission denied.
- **Tests:** unit tests (23 in `core-worktrack.test.mjs`), attack cases section 8g (741 checks in the whole attack suite), `mutation_check.py` (171 real mutations, all caught; 13 guards that are redundant with other rules are listed separately), `qa_w2` browser test, real-engine tests `rules-tests/emulator/assign.test.mjs` (run the workflow "Firestore rules (emulator)").
- **Not in W2:** past-session lists, filter by Client ID and reports (W4); corrections (W3); billing; splitting hours between clients.

## 4.5.0 - Phase W3: Corrections, tamper-evident log, work settings
- **Corrections (WorkTrack > Corrections):** a closed session is never edited. For **24 hours after the closing punch** (measured with the database clock) you can add a correction with a reason of 3 to 200 characters: change the time of a punch, add a missed break (out and in together), or add / remove a client. The original punches stay exactly as they were; the session shows "Original" and "With corrections" side by side, and hours are still counted once. The page refuses a correction that would break the order of the day (for example a second lunch, or lunch-out after lunch-in). After 24 hours a session is final.
- **Tamper-evident log (WorkTrack > Tamper-evident log):** press **Start the tamper-evident log** once. Everything that exists then becomes the starting point (one "genesis" seal that covers all earlier records). From then on every punch, client change and correction is sealed right after it is saved: a seal holds the SHA-256 fingerprint of the previous seal plus the full content of the records it covers, including their database times. **Verify the log** re-reads everything and reports "Intact" or exactly where the chain breaks (a changed record, a removed record or seal, a record written without a seal).
- **Witness copy:** "Copy witness" and "Download witness file" give you one line per seal. Keep it outside Firebase. "Compare with a saved witness file" tells you if any seal was changed or the newest seals were removed (the one thing Verify alone cannot see).
- **Work settings:** the time zone used for **new** sessions (any valid zone name) and the first weekday of the week. Each change keeps the value it replaced. Sessions already recorded keep their own zone.
- **Records:** `workCorrections`, `workSeals`, `workChain/main`, `workSettings/main` (all owner-only; corrections and seals are create-only; the chain head moves exactly one step per seal). **Publish `firestore.rules.strict` again.**
- **Honest limits:** the rules can check numbering and order but cannot compute SHA-256, so the page computes it and Verify re-checks it; this DETECTS changes, it cannot stop someone with Firebase console access; a seal is written a moment after its records (records not yet sealed are listed, and older unsealed records are reported as a problem); the first seal is a snapshot, so only records written from then on are individually sealed; whether a corrected day is in a valid order is checked by the page.
- **Tests:** unit tests (`core-wtlog.test.mjs`, 12), attack cases section 8h (1015 checks in the whole suite), `mutation_check.py` (261 real mutations, all caught; redundant guards are listed separately), browser test `qa_w3`, real-engine tests `rules-tests/emulator/wtlog.test.mjs`.
- **Not in W3:** history lists, filter by Client ID, reports (W4), billing.

## 4.5.0 - Phase W4: History and reports (read-only)
- **Where:** Owner panel > WorkTrack > **History and reports**. Pick a date range (31 days by default, at most 92) and press **Load**. Filter by Client ID and status, see totals by day, week, month and client, open any session to see the original punches, the corrections and the effective result side by side, and download a CSV.
- **What is counted:** each complete session once, in the zone it was recorded in, on the day it started (a night shift stays on its start day). Corrections are applied to give the effective values; the original is always shown beside them. If the corrections would give an invalid day, the original is used and a warning is shown. Incomplete, in-progress and invalid sessions are listed but left out of the totals and counted in a note.
- **Clients:** a session's attendance time is never split or multiplied. The client filter and the By client table show the attendance time of the sessions that client was on; those rows must not be added together.
- **Time formats:** hh:mm (rounded to the minute) and decimal hours (hundredths, half up); totals are added up exactly and rounded once.
- **CSV:** one row per session, the original and the effective values side by side, plus corrections and their reasons. UTF-8 with a byte-order mark and CRLF line ends so spreadsheets open it correctly; text that starts like a formula (`=`, `+`, `-`, `@`, tab) is stored as text. It is built in the browser; nothing is uploaded. It follows the filters on screen.
- **Reads:** the page reads only the sessions in the range and their punches, clients and corrections. Filters, the CSV and the week-start setting use what is already loaded (zero reads). A range already loaded stays in the page until **Refresh** or sign-out. Above 60 sessions it shows an estimate and asks you to confirm; above 150 it refuses and asks for a shorter range.
- **Log status:** the report says whether the tamper-evident log was verified in this browser session and what the last check found.
- **No database changes:** no new collection, no rules change. Do not republish rules for W4.
- **Honest limits:** weeks use the current week-start setting (no history); the verification line is on the page, not in the CSV; the By client table is not additive.
- **Tests:** unit tests (`core-wtreport.test.mjs`, 22; 26 deliberate-bug checks all caught), browser test `qa_w4` (62 checks: totals, midnight, daylight saving, zones, corrections, filters, CSV content, read counts, cache, read-only, accessibility, sign-out).
- **Not in W4:** PDF or print views, billing.

## 4.5.0 - Phase B3: Billing due (periods worked out from each client's schedule)
- **Where:** Owner panel > Business > **Billing due** (new page, with a count badge in the menu). Nothing else changes. Nothing is created, sent or emailed for you, and nothing runs while the panel is closed.
- **What it shows:** for every active **hourly** client with a billing profile, the billing periods worked out from the profile's schedule: monthly (calendar month), twice a month (1st to 15th, 16th to month end), weekly (7 days from the chosen week start), or 1 to 4 custom days of the month (anchor 31 means the month's last day in a short month). A period is **due** on the day after its last day, at the profile's generation time, in the profile's time zone. The periods are never stored, so they cannot drift from the profile.
- **Status of each period:** Waiting for hours, Hours draft, Submitted, Approved ready to invoice, Invoiced, Part invoiced, Too many entries (an invoice holds at most 2), Skipped, or Check hours (hours exist for dates that overlap but do not match). The least advanced entry decides.
- **Where the list starts:** the day after the newest period that is finished (invoiced or skipped). A new client with no history asks for a date inside the first period to bill (only for this visit; the first hours entry or skip makes it permanent). Finished periods are not listed again; use Billable hours and Invoices for those. At most the newest 24 periods are shown.
- **Buttons:** **Enter hours** opens Billable hours with the client and exact dates filled in; **Make invoice** opens Invoices with that period chosen; **Skip** needs a reason (3 to 200 characters), can't be undone, and is only offered while no hours exist. Those pages do the saving, as in B1 and B2.
- **Monthly-arrangement clients** are listed with a note and no periods (a flat monthly invoice is not part of B3).
- **Database rules changed - republish `firestore.rules.strict`** (and keep `firestore.rules` in step). One new collection: `periodSkips` (owner only, create-only, the record ID is `CLIENTID__YYYYMMDD__YYYYMMDD`, so a period is skipped once). It is in the backup list (export only) and in the tamper-evident log.
- **Reads:** the menu badge reads five collections when you sign in (clients, profiles, hours, invoices, skips). That is a few hundred reads on a normal account, well inside the free quota.
- **Honest limits:** period dates and due-ness are page calculations, the database rules do not check them against the schedule; "skipped" and "no hours exist" are enforced by the page only; a period with 3 or more approved entries can't be invoiced until you combine them with Replace; nothing alerts you outside the panel.
- **Tests:** `core-schedule.test.mjs` (32; 89 of 93 deliberate bugs caught, the other 4 are harmless environment/loop-guard variants), rules attack section 8m (2361 checks in the whole suite, all passing), `mutations_b2.py` now also covers the skip rule, browser test `qa_b3` (40 checks), emulator tests `periods-b3.test.mjs` (written, awaiting your workflow run).
- **Not in B3:** flat monthly invoices, automatic creation, email or push alerts, PDF, moving old client data (M3).

## 4.5.0 - Phase B2: Invoices, payments, credits, adjustments (no email, no PDF)
- **Where:** Owner panel > Business > **Invoices** (new page). The old **Clients & invoices** page is not touched.
- **Make an invoice:** pick a Client ID, tick approved billable hours (at most **2 entries per invoice**), preview, make a DRAFT. ID `CLIENTID__YYYYMMDD__YYYYMMDD`; a replacement after a cancel gets `__02`, `__03`. Monthly-arrangement clients cannot make hours invoices. Total = rate x minutes / 60, rounded once (half up). Currency never changes. No tax, discounts or extra lines.
- **Workflow:** DRAFT > READY > SENT; cancel from DRAFT or READY (the hours are freed). "Sent" is a manual mark; nothing is emailed.
- **After sending:** record a payment (date typed by you, never in the future), a credit (money beyond the total, with a reason), reverse a whole payment (once), adjust the amount (with a reason; not while a credit is held), or change the due date (old and new date and reason are kept). Payment state and Overdue are worked out from the records, never stored.
- **Balance cache:** each invoice keeps paid/credit/adjustment totals, updated in the same batch as the record. The page recomputes the true balance and shows "Balance record differs" if they disagree.
- **Rules changed - republish `firestore.rules.strict`** (keep `firestore.rules` in step). New collections: `invoices`, `invoiceAudit`, `payments`, `paymentReversals`, `invoiceAdjustments`, `invoiceDueDates`; billable hours gain link/unlink. Payments and audits are create-only, no deletes.
- **Backup and log:** the new collections are in the export list (export only) and in the tamper-evident log.
- **Honest limits:** max 2 entries per invoice (rules cannot loop, and each write may use at most 1000 rule steps: the first emulator run showed a two-entry invoice went over, so the invoice and billable-entry rules were slimmed (a second emulator run then showed the cancel-and-replace test still over the limit on the entry release step, so that was slimmed too) and `budget_check.py` now watches the step count); half-up rounding is checked as an inequality; "payment date not in the future" and due-date arithmetic are page checks; self-approval, console access can still change data (the log detects it); offline shows no success until the server accepts; restore of these collections is not offered.
- **Tests:** unit `core-invoice.test.mjs` (22), attack sections 8j/8k/8l (2331 checks in the suite), `mutations_b2.py` (607 deliberate bugs; the redundant guards are listed in `b2_equiv.py` with reasons), browser test `qa_b2` (71 checks), emulator `invoices-b2.test.mjs` (written, awaiting your workflow run).
- **Not in B2:** schedules and generated periods (B3), moving old client data (M3), email/PDF.

## 4.5.0 - Phase B1: Billing profiles and billable hours (settings and hours only, no invoices)
- **Where:** Owner panel > Business > **Billing profiles** and **Billable hours** (two new pages). Nothing else on the site changes. The old **Clients & invoices** page is not touched.
- **Billing profile (one per Client ID):** currency (USD, GBP, EUR, AUD, CAD, PHP, JPY, KWD), rate (stored as whole minor units, so no rounding error), hourly or monthly, invoice schedule (monthly, twice a month, weekly, or 1 to 4 custom days of the month), generation time and time zone, and the due rule (days after sending, days after generating, or a fixed date). Every create or change is one batch with a brand-new audit record that says what changed and why (a change needs a reason of 3 to 200 characters). Nothing is ever deleted. B1 only stores these settings: no invoice is made and no schedule runs (that is B3).
- **Billable hours:** hours you bill a client for a period you type yourself (at most 93 days). The ID is `CLIENTID__YYYYMMDD__YYYYMMDD__NN`. Steps: draft, submit (you can reopen it with a reason), approve. You approve your own entry: your account and the server time are stored. **Approved minutes never change.** To fix them you press **Replace**: a new draft is created that points back, and the old entry becomes *Replaced* in the same batch. Replaced entries no longer count. A period total is the sum of its approved entries.
- **WorkTrack is not billing:** WorkTrack records attendance; billable hours are your own entry. If you loaded the same dates in WorkTrack > History and reports, the Billable hours page shows that attendance as a reference only, never split between clients.
- **Move your old client records:** the tool on the Billing profiles page lists the records in the old Clients & invoices page and gives each one a Client ID (a new one in your ID format, or an existing one without a profile) plus a billing profile. **Only the rate and hourly/monthly are copied. Names, e-mails, phones, companies and notes are never copied and the old page is not changed.** Monthly clients, clients without a rate and clients with an unusual rate are marked *Needs review* and need a tick first (B2 bills hours x hourly rate, so a monthly fee needs your decision). The currency used is the one in Availability, rates & capacity. A record-keeping entry (`billingMigration`) remembers which old record became which Client ID, so a second device or a second click cannot migrate it again, and two old records can never share one profile.
- **Tamper-evident log:** the audit records of profiles and entries and the migration records are create-only and are added to the WorkTrack log (W3), so **Verify the log** also detects an edited billing record.
- **Backup:** the five new collections are in the export list (export only, like the Client IDs). Restore is not offered because the rules pair each record with an audit record.
- **Database rules changed - republish `firestore.rules.strict`** (and keep `firestore.rules` in step). New collections: `billingProfiles`, `billingProfileAudit`, `billableEntries`, `billableEntryAudit`, `billingMigration`. All are owner only.
- **Honest limits:** the database rules cannot loop, so the order and 1-31 range of custom anchor days are checked by the page; an audit record's text summary is not compared with the record by the rules (its currency, rate, arrangement and revision are); the amount of a period is not yet checked against WorkTrack; self-approval means there is no second person; console access can still change data (the log detects it).
- **Tests:** unit tests (`core-billing.test.mjs`, 22; 39 of 40 deliberate bugs caught, the other is a harmless duplicate guard), rules attack cases section 8i (1349 checks in the whole attack suite, all passing), `mutations_b1.py` (all real mutations caught across the suite: 422 of 422, 48 duplicate guards listed separately), browser test `qa_b1` (74 checks), emulator tests `billing-b1.test.mjs` (36 new, written but awaiting your workflow run).
- **Not in B1:** invoices and payments (B2), schedules that generate periods (B3), moving the old Clients & invoices data away (M3), PDF output.

## 4.5.0 - Phase F5: Form verification backend (Worker, rules, switch) - nothing visible changes yet
- **What changed:** a new Cloudflare Worker (`server/portfolio-forms-worker.js`) that signs a short-lived Firebase custom token after a typed six-digit code, and new rules in both rules files: a visitor-token path for the Meeting Request form, a daily counter `reqCounters/{YYYYMMDD}` (default cap 30, owner-editable in `content/guard.cap`), a visitor may read only their own request, and the switch `content/guard.tokenRequired`.
- **The live form is unchanged.** While the switch is absent or false, today's direct form still works exactly as before. F6 builds the page side; F7 flips the switch.
- **Honest limits:** the code is readable by scripts (a speed bump, not a CAPTCHA); per-visitor throttles are per Worker instance and approximate; the daily cap in the rules is the exact backstop; an attacker can fill the cap (lock-out), which the mailto fallback, the pause and the cap setting mitigate; every token creates one Firebase Authentication user (monthly cleanup of users starting with `m_`).
- **Setup and runbook:** `internal-docs/4.5.0-F5-form-verification.md`. **Publish `firestore.rules.strict` again** after the emulator workflow passes.
- **Tests:** `node --test scripts/*.test.mjs server/*.test.mjs` (26 new Worker tests); `python3 rules-tests/attack/attack_cases.py .` (+48 checks, section 8j, both rules files) and `mutation_check.py .` (40 new mutations, all caught); `rules-tests/attack/budget_check.py .` (meeting request create about 409 steps, cap 760); real-engine tests in `rules-tests/emulator/forms-f5.test.mjs` (stamp rule, cap boundary, switch states, two simultaneous requests; written, run by the workflow).
- **Backup:** "Daily request counters" can be exported (not restorable).

## 4.5.0 - Phase F6: Meeting Request form uses the verified path (switch still OFF)
- **Visitors:** with the switch off the form works exactly as before. When the owner's switch is on (or the address has `?verify=1`, for your own test before the switch-over) the form shows a **Quick check**: a six-digit code, a typed field, "Confirm and send", "Get a new code" and "Cancel". The code is a speed bump, not a CAPTCHA.
- **How it sends:** `scripts/form-guard.js` asks the Worker for a challenge, then for a one-time pass, signs in on a **separate** Firebase app (in memory, so an owner session on the same browser is never replaced), reads today's counter and writes the request plus the counter in one batch. A retry can never create a second request (the document ID is the pass's ID); a lost acknowledgement is detected by reading the visitor's own request back; a counter race is retried up to 3 times.
- **Every failure has a plain message and an "Email me instead" button** that opens a draft with what the visitor typed (paused, daily limit reached, too many attempts, expired or wrong code, offline, Worker unreachable, pass expired). The visitor never sees the daily count, only "try again tomorrow" after a refusal.
- **Owner Panel > Security > Form verification:** daily limit (1 to 200, default 30), today's count (UTC day), and the verification switch with a confirmation. Leave it OFF until the switch-over checklist (F7). Turning it off again is the instant rollback.
- **Worker:** `/v1/status` and `/v1/verify` now also return `day` (the Worker's UTC date) so a wrong clock on the visitor's device cannot break the counter. **Paste the new `server/portfolio-forms-worker.js` into the Worker and Deploy** (secrets stay).
- **Rules:** unchanged in F6. **Files:** `scripts/form-guard.js` (+ test), `meeting-form.js`, `owner-security.js`, `settings.js` (public `formsApi` address), `index.html`, `styles/components.css`.
- **Tests:** `node --test scripts/*.test.mjs server/*.test.mjs` (27 client-flow checks, 27 Worker checks); browser checks with mocked Firebase and Worker (old path unchanged, verified path, wrong/expired/cancel, every failure message and the email draft, keyboard, 375 px, axe WCAG 2.2 AA, owner Security card).
- **Not proven here:** the real key signing a real token (your `?verify=1` test), Safari (blocking before F7).

## 4.5.0 - Phase F7: switch-over guide (docs only)

- No code, rules or Worker changes. Follow `F7-CHECKLIST.md`: backup, switch ON, rollback drill, then leave ON.
- Monitoring, rollback and the Safari owner decision are in `internal-docs/4.5.0-F7-switch-over.md`.
- Rollback at any time: Security page > Form verification > switch OFF.

## 4.5.0 - Phase C1: chat webhook audit and chatbot naming

- **Audit:** the chatbot webhook field is empty and the chatbot uses scripted answers only, so no webhook address is exposed. No Worker deployment or rotation was needed. `server/chat-proxy-worker.js` stays ready for when an AI workflow is added: paste the Worker address, never the real webhook.
- **Naming:** the chatbot is no longer called Marcus. Default name is now "Chatbot" (Owner Panel > Chatbot appearance & filter > Assistant name). A name already saved there is kept. Drawer entry renamed "Chatbot configuration". Internal page id `marcus` unchanged on purpose.

## 4.5.0 - Phase R1: fewer Firestore reads for visitors

- **Before:** every page visit opened 16 live listeners (15 `content/*` documents + `settings/site`) = 16 reads, and every reload paid them again.
- **Now (visitors):** `scripts/content-cache.js` keeps a copy of each public document in the visitor's browser for 10 minutes. A repeat visit or reload inside that time costs **0 reads**. A first visit (or after 10 minutes) reads each document once (16 reads) and no longer keeps live listeners open. If a read fails, a saved copy up to 24 hours old is used; if there is none, the built-in default content shows, as before.
- **Owner:** an owner device (signed in once, flag `ownerDevice`) keeps live listeners exactly as before; signing in during a visit switches the page to live listeners at once.
- **Visible effect:** a change you publish reaches visitors who already have a copy within about 10 minutes. The hire/availability switch and the chatbot settings are covered by the same delay.
- **Only public documents are cached** (never owner data, requests or settings that need sign-in). Cache keys start with `pc:v1:`; to force a refresh for everyone after a bad publish, the cache time can be shortened in `content-cache.js` (`CACHE_MS`).
- **Rollback:** restore `scripts/owner-panel.js` and `index.html` from the R1 rollback ZIP (the extra file `content-cache.js` is then unused and harmless).

## 4.5.0 - Phase R2: Firebase browser key limited to three APIs (docs and checklist only)

- No code, rules or Worker changes. Follow `R2-CHECKLIST.md`.
- The browser key (public by design) is limited to the websites of stage 1 plus Identity Toolkit API, Token Service API and Cloud Firestore API. Other Google services refuse it. Firestore rules remain the real protection.
- If a feature breaks after the change, the Network response names the blocked service; add it, or set API restrictions back to "Don't restrict key".

## 4.5.0 - Phase D1: Owner documents (private notes and runbooks)

- New owner-only page: drawer > Settings > **Owner documents**. Create, open, edit, search, delete and fill from a `.md` or `.txt` file. Stored in Firestore `ownerDocs` (owner-only rules, republish `firestore.rules.strict`).
- Text is shown as plain text only. Text that looks like a key, token, password or webhook address is refused.
- Backup: new export-only checkbox "Owner documents (private notes)".
- Nothing was moved out of the public repo yet: `internal-docs/` and the root checklists are still public. See `D1-CHECKLIST.md` and `internal-docs/4.5.0-D1-owner-documents.md`.

## 4.5.0 - Phase S1: Google Sheets token rotation (checklist only)

- No code, rules or Worker changes. Follow `S1-CHECKLIST.md`: new token in the Apps Script property `TOKEN` and in Owner Panel > Integrations > Google Sheets, then Test connection and one sync.
- Token only; the `/exec` address is unchanged (it was never exposed).

## 4.5.0 - Phase W5a: floating WorkTrack clock

- While a WorkTrack session is open, a small draggable clock floats on top of every page (top right by default): time, status, working time, and only the punch buttons that are legal now (Clock out asks twice). Remembers its place on this device. Disappears on clock out or sign out.
- Accessibility (QA review R1): while the aria-modal dashboard is open the clock lives inside it, so keyboard and screen-reader users can reach it.
- No database or rules change; every punch still uses the one existing transaction. New files: `scripts/core-wtfloat.js` (+ tests), `scripts/wt-float.js`; browser tests in `rules-tests/browser/`.
- Status: AUTOMATED_TESTED. Live test: `W5a-CHECKLIST.md`. Details and honest limits: `internal-docs/4.5.0-W5a-floating-clock.md`. W5b (schedules, flicker) and W5c (alarm) come next, each after approval.

## 4.5.0 - Phase W5b: break schedules, lateness text and flicker

- New card WorkTrack > Break schedules: allowed minutes per break (First break, Lunch, Last break; 0 = no limit) for a Default and each active Client ID, with search and "show more". The first client on the session decides; no schedule there means the Default; none at all means 15 / 60 / 15.
- While a break is open, the page and the floating clock show time left or "late by", and the matching "in" button pulses (once per 1.2 s; steady outline with reduced motion; per-device switch). Deadline = database time of the break-out punch + minutes. Display only: nothing is stored on punches.
- QA review items: a schedule edit applies from the next break (previous values kept and checked by the rules), schedules are re-read at every full load, only registry clients can have a schedule, no silent 50-client cap.
- Rules change (collection `workSchedules`, owner only): republish `firestore.rules.strict`. New: `scripts/core-wtschedule.js`, `scripts/owner-wtsched.js`; tests in `rules-tests/`.
- Status: AUTOMATED_TESTED. Live test: `W5b-CHECKLIST.md`. Details and limits: `internal-docs/4.5.0-W5b-break-schedules.md`. W5c (alarm) is next, after approval.

## 4.5.0 - Phase W5c: break alarm (browser reminder)

- New card WorkTrack > Alarm (this device): off by default; warning before the limit (default 5 min), sound at the limit, repeat every 1 minute (at most 10 times), four synthesised sounds, volume, optional generic notifications, Test sound, Silence. Settings stay on this device. No audio files, no database access, no rules or CSP change.
- A browser reminder only: it cannot ring if the browser is closed, the computer is asleep or the tab is frozen. A page opened while already late plays no sound. Tab title alternates "Late: lunch" and is restored only if it is still ours (QA R7).
- The clock gains Silence, "Tap to enable alarm sound", and a Corner button; the WorkTrack page gains Reset clock position.
- New: `scripts/core-wtalarm.js` (+ tests), `scripts/wt-alarm.js`, `scripts/wt-alarm-worker.js`.
- Status: AUTOMATED_TESTED. Live test: `W5c-CHECKLIST.md`. Details and limits: `internal-docs/4.5.0-W5c-break-alarm.md`. This completes the W5 plan (W5a, W5b, W5c) once the live test passes.


## 4.5.0 - Phase C1: Discovery Call and outside calendar
- **Owner Panel > Service forms > Booking method:** choose the built-in form (default) or an outside calendar. Paste an embed code or a booking link from Calendly, GoHighLevel, Cal.com, TidyCal, Acuity Scheduling, SavvyCal or a Google Calendar appointment page. Only the web address is read (`scripts/core-booking.js`); scripts and other code you paste are ignored, and the page builds its own sandboxed frame. Any other provider is refused with a message.
- **Public section:** with an outside calendar on, the built-in form is hidden (the fields, date picker, quick check and send button) and the calendar frame plus an "Open the calendar in a new tab" link and a third-party notice are shown. A missing or invalid saved address falls back to the built-in form. "Hiring closed" still hides everything. Saved service forms are kept.
- **Rename:** "Meeting Request" is now "Discovery Call" in the visitor text (heading "Book a Discovery Call", button "Send Discovery Call Request", messages, privacy text) and the owner dashboard (drawer, inbox, dialog, form verification, backup and retention labels). Internal names (`meetingRequests`, element ids, file names) are unchanged, so old requests, backups and rules still work.
- **Security:** the page's CSP `frame-src` gains exactly the approved provider hosts and nothing else. The setting is stored in `content/serviceForms.booking` (`{mode, url}`; public read, owner write: no rules change, **do not republish rules**).
- **Tests:** `node --test scripts/core-booking.test.mjs` (9 tests: every provider, Calendly and GoHighLevel code, 23 refused inputs, saved-value cleaning, CSP list); `rules-tests/browser/c1-1-discovery-call.mjs` (public and owner flows, 33 checks); earlier browser tests, `node --test scripts/*.test.mjs` (260) and `attack_cases.py` (2459) rerun with no change.
- **Docs:** `C1-CHECKLIST.md`, `internal-docs/4.5.0-C1-discovery-call.md`.
