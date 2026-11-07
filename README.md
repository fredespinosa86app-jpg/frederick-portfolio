# Frederick Espinosa – Portfolio

Static website (HTML, CSS, JavaScript). No build step. Optional owner features use Firebase.

> The detailed build history, security notes and known limits are kept in a private place, not in this public repository. The files here are the site, its scripts and styles, the Worker code in `server/`, the Firestore rules, the tests and the per-phase checklists.

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
