# S2-C3 checklist: tightened picture and media rule (live test)

What changed: two lines of the page's security rule in `index.html`.

    before:  img-src 'self' data: blob: https:;      media-src 'self' blob: https:;
    after:   img-src 'self' data: blob: https://i.ytimg.com https://cdn.loom.com;      media-src 'none';

Pictures may now come only from this site, from pictures stored inside your content (`data:`), from upload previews (`blob:`), and from the YouTube and Loom thumbnail hosts. The site has no audio or video files, so `media-src` allows none. Also changed: the SEO page's share-image preview shows a note instead of a picture for outside image links.

No rules change, no Worker change. Upload the changed files, wait for GitHub Pages, hard-refresh (Ctrl+Shift+R), sign in. A wrong rule fails silently (a picture just does not show), so keep **Owner Panel > Security > Connection log > Blocked by the rule** in view. Press **Clear log** first.

## A. Public site (a normal window, then also signed in)
1. Home page: your photo, the hero image, service icons, tool logos, testimonial photos and the chatbot avatar all show. Pass: yes / no
2. Training section: the screenshots show; click one: the enlarged view works. Pass: yes / no
3. Videos ("Watch how I work"): the YouTube thumbnail shows (and the Loom one if you use Loom); click one: the player opens. Pass: yes / no / no videos
4. The browser tab icon (favicon) shows. Pass: yes / no

## B. Owner panel
5. Hero photo / Site settings: choose a picture file: the preview shows, save, reload: it shows on the site. Pass: yes / no
6. Library or Training: upload a picture: the preview shows. Pass: yes / no
7. Testimonials or Chatbot: the saved photo or avatar still shows. Pass: yes / no
8. **SEO and social preview**: type an outside link such as `https://example.com/share.jpg` in the image field: the preview shows the note "Preview isn't available for outside image links", the link stays in the field and in the generated tags. Type `assets/images/social/og-image.jpg`: the preview shows. Pass: yes / no

## C. Read the result
9. Connection log > **Refresh**: **Blocked by the rule** says "Nothing blocked. Good." Pass: yes / no
10. **Pictures and media** lists only `i.ytimg.com` and/or `cdn.loom.com` (or nothing). Pass: yes / no
11. If anything is blocked (for example a Loom thumbnail host): press **Copy list**, paste it into the chat, and use the rollback until I fix it. Done: yes / no

## Rollback (one minute)
In GitHub edit `index.html`. In the first `Content-Security-Policy` line replace the text from `img-src 'self' data: blob: https://i.ytimg.com` up to `media-src 'none';` with:

    img-src 'self' data: blob: https:; media-src 'self' blob: https:;

Commit. Or upload the files from `CodeFlow-Portfolio-4.5.0-S2-C3-rollback.zip`.

## Things that behave differently now
- A new picture host (another video provider's thumbnails, for example) needs one host added to the rule first (ask me). A test fails if the code uses a host the rule lacks.
- Owner pictures were already limited to stored `data:` pictures or `assets/` files; an outside address could never become a saved picture.
- Social sites fetch the share image themselves; the new rule only affects the preview on your SEO page.

Limits that remain: a script could still leak data by navigating away (a link or redirect) or through the calendar iframe address you approved. A page rule cannot fully prevent those. `style-src 'unsafe-inline'` stays; styles cannot load outside pictures any more.
