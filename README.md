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
    match /settings/site { allow read: if true; allow write: if isOwner(); }
    match /meetingRequests/{id} {
      allow create: if request.resource.data.keys().hasOnly(['name','email','company','date','time','tz','platform','message','status','createdAt'])
        && request.resource.data.keys().hasAll(['name','email','company','date','time','tz','platform','message','status','createdAt'])
        && request.resource.data.name is string && request.resource.data.name.size() > 0 && request.resource.data.name.size() <= 100
        && request.resource.data.email is string && request.resource.data.email.size() > 4 && request.resource.data.email.size() <= 120
        && request.resource.data.message is string && request.resource.data.message.size() > 0 && request.resource.data.message.size() <= 2000
        && request.resource.data.company is string && request.resource.data.company.size() <= 120
        && request.resource.data.platform is string && request.resource.data.platform.size() <= 60
        && request.resource.data.date is string && request.resource.data.date.size() <= 20
        && request.resource.data.time is string && request.resource.data.time.size() <= 20
        && request.resource.data.tz is string && request.resource.data.tz.size() <= 60
        && request.resource.data.status == 'new'
        && request.resource.data.createdAt == request.time;
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
    match /content/{doc} {
      allow read: if true;
      allow write: if isOwner();
    }
  }
}
```
Add your site domain under Firebase Authentication > Settings > Authorized domains.
