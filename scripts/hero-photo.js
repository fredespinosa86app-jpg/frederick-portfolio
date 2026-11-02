/* ==========================================================================
   hero-photo.js - the hero portrait. An uploaded photo REPLACES the default portrait
   (never shown together). Data: Firestore content/heroPhoto { photo: data URL }.
   Keeps the photo's own aspect ratio; layout and sizing come from main.css.
   ========================================================================== */
(function () {
  'use strict';
  const img = document.getElementById('heroPhoto');
  if (!img) return;
  const DEF = { src: img.getAttribute('src'), alt: img.getAttribute('alt'), w: img.getAttribute('width'), h: img.getAttribute('height') };
  const ok = v => typeof v === 'string' && v.length <= 330000 && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v);
  let saved = '';

  function show(src) {
    if (!src) { img.src = DEF.src; img.alt = DEF.alt; img.width = +DEF.w; img.height = +DEF.h; img.style.aspectRatio = ''; return; }
    const probe = new Image();
    probe.onload = () => { img.width = probe.naturalWidth; img.height = probe.naturalHeight; img.style.aspectRatio = probe.naturalWidth + ' / ' + probe.naturalHeight; };
    probe.src = src; img.src = src;
    const name = (document.querySelector('.hero h1') || {}).textContent || 'Frederick Espinosa';
    img.alt = 'Portrait of ' + name;
  }
  window.heroPhotoApi = {
    ok, DEF,
    getSaved: () => saved,
    setDoc: d => { saved = d && ok(d.photo) ? d.photo : ''; try { localStorage.setItem('heroPhoto', saved ? '1' : ''); } catch (e) { /* ignore */ } show(saved); document.dispatchEvent(new Event('herophoto:changed')); },
    preview: src => show(ok(src) ? src : saved),
    endPreview: () => show(saved)
  };
})();
