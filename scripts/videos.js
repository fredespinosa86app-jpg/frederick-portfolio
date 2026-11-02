/* ==========================================================================
   videos.js - "How I Work" videos (YouTube and Loom links, up to 20).
   Data: Firestore content/videos { view, items[] } published from the owner dashboard.
   Views: youtube (default, thumbnails + titles), grid, list, compact.
   Playback happens in a dialog; nothing autoplays and no iframe loads until a video is selected.
   ========================================================================== */
(function () {
  'use strict';
  const CACHE = 'videoCfg', MAX = 20, VIEWS = ['youtube', 'grid', 'list', 'compact'];
  let state = { view: 'youtube', items: [] };

  const str = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '';
  const node = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  /* Returns {provider,id,embed,watch,thumb,vertical} or null. Only https YouTube / Loom links are accepted. */
  function parse(u) {
    try {
      const x = new URL(String(u).trim());
      if (x.protocol !== 'https:') return null;
      const h = x.hostname.replace(/^www\./, ''), sg = x.pathname.split('/').filter(Boolean), yid = i => /^[\w-]{11}$/.test(i || '') ? i : null;
      let id = null, vertical = false;
      if (h === 'youtu.be') id = yid(sg[0]);
      else if (h === 'youtube.com' || h === 'm.youtube.com') {
        if (sg[0] === 'shorts') { id = yid(sg[1]); vertical = !!id; }
        else if (sg[0] === 'watch') id = yid(x.searchParams.get('v'));
        else if (sg[0] === 'embed' || sg[0] === 'live') id = yid(sg[1]);
      }
      if (id) return { provider: 'youtube', id, vertical, embed: 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0', watch: 'https://www.youtube.com/watch?v=' + id, thumb: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' };
      if ((h === 'loom.com' || h.endsWith('.loom.com')) && (sg[0] === 'share' || sg[0] === 'embed') && /^[a-f0-9]{32}$/i.test(sg[1] || ''))
        return { provider: 'loom', id: sg[1], vertical: false, embed: 'https://www.loom.com/embed/' + sg[1], watch: 'https://www.loom.com/share/' + sg[1], thumb: 'https://cdn.loom.com/sessions/thumbnails/' + sg[1] + '-with-play.gif' };
    } catch (e) { /* invalid */ }
    return null;
  }

  const clean = list => (Array.isArray(list) ? list : []).slice(0, MAX).map(v => {
    const url = str(v && v.url, 300), p = parse(url);
    return { id: str(v && v.id, 40), url, title: str(v && v.title, 120), description: str(v && v.description, 300), category: str(v && v.category, 20), enabled: !v || v.enabled !== false, _p: p };
  }).filter(v => v.id && v._p).map(v => { v.title = v.title || (v._p.provider === 'loom' ? 'Loom video' : 'YouTube video'); return v; });
  const strip = list => list.map(v => ({ id: v.id, url: v.url, title: v.title, description: v.description, category: v.category, enabled: v.enabled }));

  /* ---- player dialog ---- */
  let dlg = null;
  function player() {
    if (dlg) return dlg;
    dlg = node('dialog', 'vplayer'); dlg.setAttribute('aria-label', 'Video player');
    const box = node('div', 'vp-box'), close = node('button', 'vp-close', '×');
    close.type = 'button'; close.setAttribute('aria-label', 'Close video');
    const t = node('h3', 'vp-title'), frame = node('div', 'vp-frame'), foot = node('p', 'vp-foot');
    box.append(close, t, frame, foot); dlg.appendChild(box); document.body.appendChild(dlg);
    const stop = () => { frame.textContent = ''; };
    close.addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', stop);
    dlg._set = (v, opener) => {
      t.textContent = v.title; frame.textContent = '';
      frame.classList.toggle('vertical', v._p.vertical);
      const f = node('iframe'); f.title = v.title; f.src = v._p.embed; f.loading = 'lazy'; f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.allow = 'accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen'; f.allowFullscreen = true; frame.appendChild(f);
      foot.textContent = 'Video not loading? It may be private or removed. ';
      const a = node('a', '', 'Open on ' + (v._p.provider === 'loom' ? 'Loom' : 'YouTube')); a.href = v._p.watch; a.target = '_blank'; a.rel = 'noopener noreferrer'; foot.appendChild(a);
      dlg._opener = opener; dlg.showModal();
    };
    dlg.addEventListener('close', () => { if (dlg._opener && dlg._opener.isConnected) dlg._opener.focus(); });
    return dlg;
  }

  function thumbBox(v) {
    const box = node('span', 'vthumb'); box.setAttribute('aria-hidden', 'true');
    const ph = () => { box.textContent = ''; box.classList.add('noimg'); box.appendChild(node('span', 'vph', v._p.provider === 'loom' ? 'Loom' : 'Video')); box.appendChild(node('span', 'vplay')); };
    if (v._p.provider === 'youtube') {
      const i = node('img'); i.alt = ''; i.loading = 'lazy'; i.decoding = 'async'; i.width = 480; i.height = 360; i.src = v._p.thumb; i.addEventListener('error', ph);
      i.addEventListener('load', () => { if (i.naturalWidth && i.naturalWidth < 200) ph(); });   // YouTube's "no video" placeholder is tiny
      box.append(i, node('span', 'vplay'));
    } else {
      const i = node('img'); i.alt = ''; i.loading = 'lazy'; i.decoding = 'async'; i.src = v._p.thumb; i.addEventListener('error', ph);
      box.append(i, node('span', 'vplay'));
    }
    return box;
  }

  function card(v) {
    const b = node('button', 'vcard'); b.type = 'button'; b.setAttribute('aria-label', 'Play video: ' + v.title);
    const meta = node('span', 'vmeta'); meta.appendChild(node('span', 'vtitle', v.title));
    if (v.description) meta.appendChild(node('span', 'vdesc', v.description));
    b.append(thumbBox(v), meta);
    b.addEventListener('click', () => player()._set(v, b));
    return b;
  }

  function fill(box, list, view) {
    box.textContent = ''; box.className = 'vgrid view-' + (VIEWS.includes(view) ? view : 'youtube');
    list.forEach(v => box.appendChild(card(v)));
  }

  function render() {
    const wrap = document.getElementById('vidsBox'), box = document.getElementById('vidsGrid');
    if (!wrap || !box) return;
    const list = clean(state.items).filter(v => v.enabled);
    fill(box, list, state.view); wrap.hidden = !list.length;
    document.dispatchEvent(new Event('content:applied'));
  }
  function renderInto(container, category, view) {
    const list = clean(state.items).filter(v => v.enabled && v.category === category);
    if (list.length) fill(container, list, view || state.view); else container.textContent = '';
    return list.length;
  }

  function cache() { try { localStorage.setItem(CACHE, JSON.stringify({ view: state.view, items: strip(clean(state.items)) })); } catch (e) { /* ignore */ } }
  window.videosApi = {
    parse, MAX, VIEWS,
    get: () => ({ view: state.view, items: strip(clean(state.items)) }),
    set: (items, view) => { state = { view: VIEWS.includes(view) ? view : 'youtube', items: strip(clean(items)) }; cache(); render(); },
    preview: (items, view) => { const keep = state; state = { view: VIEWS.includes(view) ? view : 'youtube', items }; render(); state = keep; },
    render, renderInto, clean
  };
  try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c) state = { view: VIEWS.includes(c.view) ? c.view : 'youtube', items: strip(clean(c.items)) }; } catch (e) { /* ignore */ }
  render();
})();
