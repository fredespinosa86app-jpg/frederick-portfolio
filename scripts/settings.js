/* ==========================================================================
   settings.js - the one place to configure the portfolio
   ========================================================================== */
window.portfolioSettings = {
  /* "Why should you hire me?" thank-you video (section near the bottom of the page).
     - true  : show the section (only when a valid URL is set below)
     - false : hide the whole section, no blank space is left behind
     Paste a YouTube or Loom link, e.g.
       https://www.youtube.com/watch?v=XXXXXXXXXXX
       https://youtu.be/XXXXXXXXXXX
       https://www.loom.com/share/XXXXXXXX...
     While the value is "YOUR_VIDEO_EMBED_URL" the section stays hidden. */
  showThankYouVideo: true,
  thankYouVideoUrl: "YOUR_VIDEO_EMBED_URL",

  /* Owner login (Google account allowed to open the Owner panel) */
  /* Contact / social icons shown on the site. Edit here or (recommended) in Owner dashboard > Social media & contact.
     type: linkedin | onlinejobs | upwork | email | whatsapp | facebook | fiverr | freelancer | phone */
  contacts: [
    { type: "linkedin",   value: "https://www.linkedin.com/in/frederick-espinosa-4a03b03b9/", enabled: true },
    { type: "onlinejobs", value: "https://v2.onlinejobs.ph/jobseekers/info/4884720", enabled: true },
    { type: "upwork",     value: "https://www.upwork.com/freelancers/~017a9a8bf9e0f5c289", enabled: true },
    { type: "email",      value: "frederickespinosa.onlinejob@gmail.com", enabled: true },
    { type: "whatsapp",   value: "+63 905 291 2208", enabled: true }
  ],

  ownerEmail: "fredespinosa86.app@gmail.com",

  /* Firebase web config (public identifiers, safe to publish).
     Security comes from Google sign-in + the Firestore rules in README.md. */
  /* Security S2: public reCAPTCHA SITE key for Firebase App Check (never the secret key). Leave empty until registered.
     appCheckProvider: "enterprise" = Google Cloud Fraud Defense (formerly reCAPTCHA Enterprise) key; "v3" = old classic key (deprecated). */
  appCheckSiteKey: "",
  appCheckProvider: "enterprise",

  firebase: {
    apiKey: "AIzaSyDnwfj5XUK22er6lI1hb3plr6nk1-mt4uY",
    authDomain: "my-online-portfolio-db2a5.firebaseapp.com",
    projectId: "my-online-portfolio-db2a5",
    storageBucket: "my-online-portfolio-db2a5.firebasestorage.app",
    messagingSenderId: "772123933948",
    appId: "1:772123933948:web:7103b8d5374cdb41a62b79"
  }
};
