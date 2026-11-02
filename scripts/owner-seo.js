/* ==========================================================================
   owner-seo.js - owner dashboard page "SEO & social preview"
   Live validation + Google / social previews. Saves through window.OWN.save (Firestore rules decide access).
   ========================================================================== */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  if (!$('dp-seo') || !window.seoApi) return;
  const A = window.seoApi, LIM = A.LIM;
  const F = { title: $('seoTitle'), description: $('seoDesc'), keywords: $('seoKw'), image: $('seoImg'), canonical: $('seoCanon') };
  const N = { title: $('seoTitleN'), description: $('seoDescN'), keywords: $('seoKwN'), image: $('seoImgN'), canonical: $('seoCanonN') };

  const read = () => ({
    title: A.clean(F.title.value, 200), description: A.clean(F.description.value, 400), keywords: A.clean(F.keywords.value, 400),
    image: A.clean(F.image.value, 500), canonical: A.clean(F.canonical.value, 300), index: $('seoIndex').checked
  });
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
  const host = (u) => { try { return new URL(u).hostname.toUpperCase(); } catch (e) { return ''; } };
  const crumb = (u) => { try { const x = new URL(u); return x.hostname + (x.pathname.replace(/\/$/, '') ? ' › ' + x.pathname.replace(/^\/|\/$/g, '').split('/').join(' › ') : ''); } catch (e) { return u; } };

  function counter(k, v, r) {
    const el = N[k]; let txt = '', cls = '';
    if (k === 'title') txt = v.title.length + ' / ' + LIM.titleMax + ' characters recommended';
    if (k === 'description') txt = v.description.length + ' characters (aim for ' + LIM.descMin + '–' + LIM.descMax + ')';
    if (k === 'keywords') txt = v.keywords.split(',').filter((x) => x.trim()).length + ' keywords. Search engines such as Google ignore this tag, so keep it short.';
    if (r.errors[k]) { txt += ' ' + r.errors[k]; cls = 'bad'; } else if (r.warnings[k]) { txt += ' ' + r.warnings[k]; cls = 'warn'; }
    else if (k === 'title' || k === 'description') cls = 'good';
    el.textContent = txt; el.className = 'cnt ' + cls;
    F[k].setAttribute('aria-invalid', r.errors[k] ? 'true' : 'false');
  }

  function render() {
    const v = read(), r = A.validate(v);
    Object.keys(F).forEach((k) => counter(k, v, r));
    $('pvGu').textContent = crumb(v.canonical);
    $('pvGt').textContent = cut(v.title, LIM.titleMax);
    $('pvGd').textContent = cut(v.description, LIM.descMax);
    const img = v.image && !/^https:/i.test(v.image) ? v.image : A.absImage(v.image, v.canonical);
    if ($('pvSi').getAttribute('src') !== img) $('pvSi').src = img;
    $('pvSh').textContent = host(v.canonical);
    $('pvSt').textContent = cut(v.title, 70);
    $('pvSd').textContent = cut(v.description, 125);
    $('seoCode').value = A.buildHead(v);
    $('seoSave').disabled = !r.ok;
    return { v, r };
  }

  function fill(d) {
    F.title.value = d.title; F.description.value = d.description; F.keywords.value = d.keywords;
    F.image.value = d.image || A.DEF.image.replace(A.DEF.canonical, ''); F.canonical.value = d.canonical; $('seoIndex').checked = d.index !== false;
    render();
  }
  document.addEventListener('seo:applied', (e) => { if (!document.activeElement || !document.activeElement.matches('#dp-seo input,#dp-seo textarea')) fill(e.detail); });
  [F.title, F.description, F.keywords, F.image, F.canonical].forEach((e) => e.addEventListener('input', render));
  $('seoIndex').addEventListener('change', render);

  const note = (m, t) => (window.dashNotify ? window.dashNotify(m, t || 'success') : alert(m));
  $('seoSave').addEventListener('click', () => {
    const { v, r } = render();
    if (!r.ok) { note('Please fix the highlighted fields before saving.', 'error'); return; }
    if (!v.index && !confirm('This asks search engines NOT to list your portfolio. Visitors with the link can still open it. Continue?')) return;
    if (!window.OWN) { note('Could not save. Sign in as the owner first.', 'error'); return; }
    window.OWN.save({ seo: v }, 'Search & sharing details saved.');
  });
  $('seoReset').addEventListener('click', () => {
    if (!confirm('Reset the title, description, image and address to the original values?')) return;
    if (!window.OWN) { note('Could not save. Sign in as the owner first.', 'error'); return; }
    window.OWN.save({ seo: { title: '', description: '', keywords: '', image: '', canonical: '', index: true } }, 'Search & sharing details reset.');
  });
  $('seoCopy').addEventListener('click', () => {
    const t = $('seoCode'); t.select();
    const ok = () => note('Tags copied. Paste them into the head of index.html.');
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t.value).then(ok, () => { document.execCommand('copy'); ok(); });
    else { try { document.execCommand('copy'); ok(); } catch (e) { note('Select the text and copy it manually.', 'error'); } }
  });
  fill(window.__seo || { title: A.DEF.title, description: A.DEF.description, keywords: A.DEF.keywords, image: '', canonical: A.DEF.canonical, index: true });
})();
