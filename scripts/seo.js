/* ==========================================================================
   seo.js - search and social metadata
   The static <head> in index.html is the baseline that crawlers and link-preview bots read.
   The owner's saved values (settings/site.seo) are applied on top of it for browsers and for
   search engines that run JavaScript. Defaults are read from the page itself, so nothing is duplicated.
   ========================================================================== */
(function () {
  'use strict';
  const q = (s) => document.querySelector(s);
  const meta = (sel) => { const e = q(sel); return e ? e.getAttribute('content') || '' : ''; };
  const LIM = { titleMax: 60, titleHard: 70, descMin: 70, descMax: 160, descHard: 200, kwHard: 200 };

  const DEF = {
    title: document.title,
    description: meta('meta[name="description"]'),
    keywords: meta('meta[name="keywords"]'),
    image: meta('meta[property="og:image"]'),
    canonical: (q('link[rel="canonical"]') || {}).href || '',
    index: true
  };

  const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const isHttps = (u) => { try { return new URL(u).protocol === 'https:'; } catch (e) { return false; } };
  const imgOk = (u) => /^(https:\/\/[^\s]+|assets\/[^\s]+)\.(jpe?g|png|webp)$/i.test(u);

  /* Validate a settings object; returns {ok, errors:{field:msg}, warnings:{field:msg}} */
  function validate(d) {
    const errors = {}, warnings = {};
    const t = d.title, s = d.description;
    if (!t) errors.title = 'Enter a page title.';
    else if (t.length > LIM.titleHard) errors.title = 'Keep the title under ' + LIM.titleHard + ' characters.';
    else if (t.length > LIM.titleMax) warnings.title = 'Over ' + LIM.titleMax + ' characters: search engines may cut it off.';
    if (!s) errors.description = 'Enter a meta description.';
    else if (s.length > LIM.descHard) errors.description = 'Keep the description under ' + LIM.descHard + ' characters.';
    else if (s.length > LIM.descMax) warnings.description = 'Over ' + LIM.descMax + ' characters: search engines may cut it off.';
    else if (s.length < LIM.descMin) warnings.description = 'Under ' + LIM.descMin + ' characters: a little more detail helps.';
    if (d.keywords.length > LIM.kwHard) errors.keywords = 'Keep keywords under ' + LIM.kwHard + ' characters.';
    else if (d.keywords.split(',').filter((x) => x.trim()).length > 10) warnings.keywords = 'More than 10 keywords looks like keyword stuffing.';
    if (d.image && !imgOk(d.image)) errors.image = 'Use a full https:// image link or a path starting with assets/ (.jpg, .png or .webp).';
    if (!d.canonical || !isHttps(d.canonical)) errors.canonical = 'Enter the full https:// address of the site.';
    return { ok: !Object.keys(errors).length, errors, warnings };
  }

  const absImage = (img, canon) => { try { return new URL(img || DEF.image, canon || DEF.canonical).href; } catch (e) { return DEF.image; } };

  function setMeta(sel, attr, val) { const e = q(sel); if (e) e.setAttribute(attr, val); }

  function apply(raw) {
    const o = raw && typeof raw === 'object' ? raw : {};
    const d = {
      title: clean(o.title, LIM.titleHard) || DEF.title,
      description: clean(o.description, LIM.descHard) || DEF.description,
      keywords: clean(o.keywords, LIM.kwHard) || DEF.keywords,
      image: imgOk(clean(o.image, 500)) ? clean(o.image, 500) : '',
      canonical: isHttps(clean(o.canonical, 300)) ? clean(o.canonical, 300) : DEF.canonical,
      index: o.index !== false
    };
    const img = absImage(d.image, d.canonical);
    document.title = d.title;
    setMeta('meta[name="description"]', 'content', d.description);
    setMeta('meta[name="keywords"]', 'content', d.keywords);
    setMeta('meta[name="robots"]', 'content', d.index ? 'index, follow, max-image-preview:large' : 'noindex, nofollow');
    setMeta('link[rel="canonical"]', 'href', d.canonical);
    setMeta('meta[property="og:title"]', 'content', d.title);
    setMeta('meta[property="og:description"]', 'content', d.description);
    setMeta('meta[property="og:url"]', 'content', d.canonical);
    setMeta('meta[property="og:image"]', 'content', img);
    setMeta('meta[name="twitter:title"]', 'content', d.title);
    setMeta('meta[name="twitter:description"]', 'content', d.description);
    setMeta('meta[name="twitter:image"]', 'content', img);
    try {
      const s = q('#ldjson'); const j = JSON.parse(s.textContent);
      j['@graph'].forEach((n) => { if (n.description) n.description = d.description; if (n['@type'] === 'WebSite' || n['@type'] === 'Person') n.url = d.canonical; });
      s.textContent = JSON.stringify(j);
    } catch (e) { /* structured data left as shipped */ }
    window.__seo = d;
    document.dispatchEvent(new CustomEvent('seo:applied', { detail: d }));
  }

  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  /* The block of tags to paste into index.html so link-preview bots (which do not run JavaScript) see the same values. */
  function buildHead(d) {
    const img = absImage(d.image, d.canonical);
    return [
      '<title>' + esc(d.title) + '</title>',
      '<meta name="description" content="' + esc(d.description) + '">',
      '<meta name="keywords" content="' + esc(d.keywords) + '">',
      '<meta name="robots" content="' + (d.index ? 'index, follow, max-image-preview:large' : 'noindex, nofollow') + '">',
      '<link rel="canonical" href="' + esc(d.canonical) + '">',
      '<meta property="og:title" content="' + esc(d.title) + '">',
      '<meta property="og:description" content="' + esc(d.description) + '">',
      '<meta property="og:url" content="' + esc(d.canonical) + '">',
      '<meta property="og:image" content="' + esc(img) + '">',
      '<meta name="twitter:title" content="' + esc(d.title) + '">',
      '<meta name="twitter:description" content="' + esc(d.description) + '">',
      '<meta name="twitter:image" content="' + esc(img) + '">'
    ].join('\n');
  }

  window.seoApi = { apply, validate, buildHead, absImage, DEF, LIM, clean };
})();
