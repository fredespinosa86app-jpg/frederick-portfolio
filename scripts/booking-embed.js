/* ==========================================================================
   booking-embed.js - public side of the "outside calendar" option (CodeFlow 4.5.0, phase D1 Discovery Call).
   When the owner chose an outside calendar (content/serviceForms.booking) AND its address passes core-booking.js,
   the built-in form is hidden (CSS class on #schedule) and a frame built HERE is shown. Anything else: the built-in form stays.
   Nothing the owner pasted is ever inserted as markup: only the checked address is set as the frame's src.
   ========================================================================== */
(function () {
  'use strict';
  const SF = window.serviceFormsApi, CB = window.coreBooking, sec = document.getElementById('schedule'), box = document.getElementById('mEmbed');
  if (!SF || !CB || !sec || !box) return;
  let shown = '';
  function apply() {
    const b = CB.clean(SF.get().booking), on = b.mode === 'embed';
    sec.classList.toggle('embedmode', on);
    if (!on) { if (shown) { box.replaceChildren(); shown = ''; } box.hidden = true; return; }
    box.hidden = false;
    if (shown === b.url) return;
    const f = document.createElement('iframe');
    f.src = b.url; f.title = 'Book a discovery call'; f.loading = 'lazy'; f.referrerPolicy = 'no-referrer'; f.className = 'mEmbedFrame';
    f.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation');
    const a = document.createElement('a'); a.href = b.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.className = 'btn navy mEmbedLink'; a.textContent = 'Open the calendar in a new tab';
    const n = document.createElement('p'); n.className = 'fine'; n.textContent = 'This calendar is provided by a third-party service. The details you enter are collected by that service, not stored on this site.';
    box.replaceChildren(f, n, a); shown = b.url;
  }
  SF.onChange(apply); apply();
})();
