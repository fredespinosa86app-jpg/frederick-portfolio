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
- **Chatbot answers:** owner-typed values (rates, currency, availability text) placed inside Marcus' built-in answers are now escaped. AI/knowledge-base answers were already shown as plain text.
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
