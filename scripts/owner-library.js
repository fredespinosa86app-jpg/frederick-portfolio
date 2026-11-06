/* ==========================================================================
   owner-library.js - Owner Panel > Image library (Enhancement E3)
   Images are resized + compressed in the browser (WebP) and stored as database documents (no paid Storage):
     library/{id}      small record: name, tags, size, thumbnail, hash, where it was used
     libraryFull/{id}  the compressed picture itself
   Both collections are owner-only (see firestore.rules). Choosing a library image for a field COPIES it into that field
   through the field's own upload pipeline, so visitors cause no extra reads and a later delete here never breaks the site.
   The storage cap is enforced in this page (the free plan has no server code); the rules cap each document's size.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit; if (!kit) return;
  const { el, notify, confirmBox } = kit;
  const $ = id => document.getElementById(id), own = () => window.OWN;
  const MB = 1048576, CAPS = [50, 100, 200, 300, 400, 500], DEFCAP = 200, MAXN = 300, MAXB = 250 * 1024, MAXIN = 25 * MB;
  const WIDTHS = [1200, 1000, 800, 640, 480], QUAL = [0.82, 0.7, 0.58];
  const PREFIX = /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/;
  const errText = e => (e && e.code === 'permission-denied') ? 'The database refused this (permission denied). Check that the new rules are published and sign in again.' : 'Please try again.';
  let cap = DEFCAP, items = [], loaded = false, loading = null;
  const mb = n => (n / MB).toFixed(n >= 10 * MB ? 0 : 1) + ' MB';
  const used = () => items.reduce((a, x) => a + (+x.bytes || 0), 0);
  const cleanName = s => String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const cleanTags = s => [...new Set(String(Array.isArray(s) ? s.join(',') : s || '').toLowerCase().split(/[,\n]/).map(t => t.replace(/[^a-z0-9 \-]/g, '').trim().slice(0, 24)).filter(Boolean))].slice(0, 10);
  const newId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---------------------------------------------------------------- data */
  async function load(force) {
    if (loaded && !force) return items;
    if (loading) return loading;
    loading = (async () => {
      const o = own(), f = o.fs;
      try {
        const m = await f.getDoc(f.doc(o.db, 'ownerPrivate', 'library'));
        const c = m.exists() ? Number(m.data().capMB) : DEFCAP; cap = CAPS.indexOf(c) >= 0 ? c : DEFCAP;
      } catch (e) { cap = DEFCAP; }
      const s = await f.getDocs(f.query(f.collection(o.db, 'library')));
      items = s.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      loaded = true; return items;
    })();
    try { return await loading; } finally { loading = null; }
  }

  /* ---------------------------------------------------------------- image processing */
  function sniff(buf) {
    const b = new Uint8Array(buf.slice(0, 12));
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
    return '';
  }
  const bytesOf = d => Math.floor((d.length - d.indexOf(',') - 1) * 3 / 4);
  async function sha(text) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  function decode(file) {
    return new Promise((res, rej) => {
      const u = URL.createObjectURL(file), im = new Image();
      im.onload = () => { URL.revokeObjectURL(u); res(im); };
      im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Could not read this image.')); };
      im.src = u;
    });
  }
  function draw(im, maxW) {
    const sc = Math.min(1, maxW / Math.max(im.width, im.height)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(im.width * sc)); c.height = Math.max(1, Math.round(im.height * sc));
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c;
  }
  async function process(file) {
    if (file.size > MAXIN) throw new Error('This file is larger than 25 MB. Please choose a smaller image.');
    const kind = sniff(await file.slice(0, 16).arrayBuffer());
    if (!kind) throw new Error('Only JPG, PNG and WebP pictures are accepted (no SVG, GIF or other files).');
    const im = await decode(file);
    if (!im.width || !im.height || im.width * im.height > 60e6) throw new Error('This picture has too many pixels. Please choose a smaller image.');
    for (const w of WIDTHS) for (const q of QUAL) {
      const c = draw(im, w), data = c.toDataURL('image/webp', q);
      if (data.indexOf('data:image/webp') !== 0) throw new Error('This browser cannot create WebP pictures. Please use a current Chrome, Edge, Firefox or Safari.');
      if (bytesOf(data) <= MAXB) {
        const t = draw(im, 200).toDataURL('image/webp', 0.7);
        return { data, w: c.width, h: c.height, bytes: bytesOf(data), thumb: t.length <= 20000 ? t : draw(im, 120).toDataURL('image/webp', 0.5) };
      }
    }
    throw new Error('This picture is too detailed to fit the 250 KB limit. Please choose a simpler image.');
  }

  /* ---------------------------------------------------------------- operations */
  async function addFile(file) {
    const o = own(), f = o.fs; await load();
    if (items.length >= MAXN) throw new Error('The library holds at most ' + MAXN + ' images. Delete some first.');
    const p = await process(file);
    if (used() + p.bytes > cap * MB) throw new Error('Storage cap reached (' + cap + ' MB). Delete images or raise the cap on this page.');
    const hash = await sha(p.data), dup = items.find(x => x.hash === hash);
    if (dup) throw new Error('Already in the library as "' + dup.name + '".');
    const id = newId(), name = cleanName(file.name.replace(/\.[^.]+$/, '')) || 'Image';
    const rec = { name, tags: [], mime: 'image/webp', w: p.w, h: p.h, bytes: p.bytes, hash, thumb: p.thumb, used: 0, usedIn: [], createdAt: Date.now() };
    await f.setDoc(f.doc(o.db, 'libraryFull', id), { data: p.data, bytes: p.bytes });
    try { await f.setDoc(f.doc(o.db, 'library', id), rec); }
    catch (e) { try { await f.deleteDoc(f.doc(o.db, 'libraryFull', id)); } catch (x) { /* ignore */ } throw e; }
    items.unshift(Object.assign({ id }, rec)); return id;
  }
  async function remove(ids) {
    const o = own(), f = o.fs; let n = 0;
    for (const id of ids) {
      try { await f.deleteDoc(f.doc(o.db, 'libraryFull', id)); await f.deleteDoc(f.doc(o.db, 'library', id)); items = items.filter(x => x.id !== id); n++; }
      catch (e) { throw Object.assign(new Error(errText(e)), { done: n }); }
    }
    return n;
  }
  async function fullData(id) {
    const o = own(), f = o.fs, s = await f.getDoc(f.doc(o.db, 'libraryFull', id));
    if (!s.exists() || !PREFIX.test(String(s.data().data || ''))) throw new Error('This image could not be loaded.');
    return s.data().data;
  }
  const toFile = async (data, name) => { const bin = atob(data.slice(data.indexOf(',') + 1)), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new File([u8], (cleanName(name) || 'image') + '.webp', { type: 'image/webp' }); };
  function markUsed(it, label) {
    const o = own(), f = o.fs, list = [...new Set([label].concat(it.usedIn || []))].filter(Boolean).slice(0, 8);
    it.used = (it.used || 0) + 1; it.usedIn = list; it.lastUsed = Date.now();
    f.updateDoc(f.doc(o.db, 'library', it.id), { used: it.used, usedIn: list }).catch(() => { /* usage note is optional */ });
  }

  /* ---------------------------------------------------------------- UI helpers */
  const tile = (it, extra) => el('div', { class: 'libtile' + (extra && extra.cls ? ' ' + extra.cls : '') },
    el('img', { src: it.thumb || '', alt: '', loading: 'lazy', width: 120, height: 90 }),
    el('span', { class: 'libname' }, it.name), el('span', { class: 'libmeta' }, it.w + '×' + it.h + ' · ' + Math.max(1, Math.round(it.bytes / 1024)) + ' KB' + ((it.used || 0) ? '' : ' · never used')));
  const match = (it, q) => !q || (it.name + ' ' + (it.tags || []).join(' ')).toLowerCase().indexOf(q) >= 0;

  /* ---------------------------------------------------------------- Library page */
  const sel = new Set();
  function meter() {
    const u = used(), pct = Math.min(100, Math.round(u * 100 / (cap * MB))), warn = pct >= 80, full = pct >= 100;
    const bar = $('libBar'); bar.style.width = pct + '%'; bar.className = full ? 'bad' : warn ? 'warn' : '';
    $('libMeter').setAttribute('aria-valuenow', String(pct));
    $('libUse').textContent = mb(u) + ' of ' + cap + ' MB used (' + pct + '%) · ' + items.length + ' of ' + MAXN + ' images';
    const n = $('libNote'); n.className = 'dhelp' + (full ? ' bad' : warn ? ' warn' : '');
    n.textContent = full ? 'The cap is full: new uploads are blocked until you delete images or raise the cap.' : warn ? 'Over 80% of your cap is used. Delete images you do not need before uploading more.' : 'Each picture is compressed to at most 250 KB. The free database holds 1 GiB in total for everything, so keep the cap well below that.';
    $('libCap').value = String(cap);
  }
  function grid() {
    const q = $('libSearch').value.trim().toLowerCase(), list = items.filter(x => match(x, q)), box = $('libGrid');
    box.replaceChildren(...(list.length ? list.map(it => {
      const cb = el('input', { type: 'checkbox', 'aria-label': 'Select ' + it.name }); cb.checked = sel.has(it.id);
      cb.addEventListener('change', () => { cb.checked ? sel.add(it.id) : sel.delete(it.id); bulk(); });
      const t = tile(it); t.prepend(cb);
      t.append(kit.iconBtn('pencil', 'Edit', it.name, () => edit(it)));
      return t;
    }) : [el('p', { class: 'dstate' }, items.length ? 'No images match your search.' : 'No images yet. Upload your first picture above.')]));
    bulk();
  }
  function bulk() { $('libDel').disabled = !sel.size; $('libDel').textContent = sel.size ? 'Delete selected (' + sel.size + ')' : 'Delete selected'; }
  function refresh() { meter(); grid(); }
  async function show() {
    $('libState').textContent = 'Loading…';
    try { await load(true); $('libState').textContent = ''; refresh(); }
    catch (e) { $('libState').textContent = 'Could not load the library. ' + errText(e); }
  }
  async function upload(files) {
    const list = [...files]; if (!list.length) return;
    const st = $('libUpState'); let ok = 0; const bad = [];
    for (let i = 0; i < list.length; i++) {
      st.textContent = 'Processing ' + (i + 1) + ' of ' + list.length + '…';
      try { await addFile(list[i]); ok++; } catch (e) { bad.push(list[i].name + ': ' + (e.message || errText(e))); if (/cap reached|at most/.test(e.message || '')) break; }
      meter();
    }
    st.textContent = ok + ' uploaded' + (bad.length ? ', ' + bad.length + ' not added.' : '.');
    $('libErrs').replaceChildren(...bad.map(b => el('li', {}, b)));
    if (ok) own().log && own().log('Image library: ' + ok + ' image(s) added'); refresh();
    if (ok) notify(ok + ' image' + (ok === 1 ? '' : 's') + ' added to the library.', 'success');
  }
  function edit(it) {
    const d = el('dialog', { class: 'dmodal', 'aria-labelledby': 'libEdT' });
    const name = el('input', { type: 'text', maxlength: 80, value: it.name, id: 'libEdName' }), tags = el('input', { type: 'text', maxlength: 200, value: (it.tags || []).join(', '), id: 'libEdTags' }), err = el('p', { class: 'ferr', role: 'alert' });
    d.append(el('div', {}, el('h2', { id: 'libEdT' }, 'Edit image'),
      el('img', { src: it.thumb || '', alt: '', class: 'libbig' }),
      el('p', { class: 'dhelp' }, it.w + '×' + it.h + ' · ' + Math.round(it.bytes / 1024) + ' KB · ' + ((it.used || 0) ? 'copied into: ' + (it.usedIn || []).join(', ') + '. Deleting the library copy does not remove those copies.' : 'never used on the site.')),
      el('label', { class: 'fld' }, 'Name', name), el('label', { class: 'fld' }, 'Tags (separate with commas)', tags), err,
      el('div', { class: 'dact-row' },
        el('button', { type: 'button', class: 'dbtn primary', onclick: async () => {
          const nm = cleanName(name.value); if (!nm) { err.textContent = 'Please enter a name.'; return; }
          const o = own(), f = o.fs, tg = cleanTags(tags.value);
          try { await f.updateDoc(f.doc(o.db, 'library', it.id), { name: nm, tags: tg }); it.name = nm; it.tags = tg; d.close(); refresh(); notify('Image updated.', 'success'); }
          catch (e) { err.textContent = 'Could not save. ' + errText(e); }
        } }, 'Save'),
        el('button', { type: 'button', class: 'dbtn danger', onclick: async () => { d.close(); await del([it.id]); } }, 'Delete'),
        el('button', { type: 'button', class: 'dbtn', onclick: () => d.close() }, 'Cancel'))));
    d.addEventListener('close', () => d.remove()); document.body.append(d); d.showModal();
  }
  async function del(ids) {
    const list = ids.map(id => items.find(x => x.id === id)).filter(Boolean); if (!list.length) return;
    const inuse = list.filter(x => (x.used || 0) > 0);
    const msg = list.length + ' image' + (list.length === 1 ? '' : 's') + ' will be permanently deleted from the library.' + (inuse.length ? ' ' + inuse.length + ' of them ' + (inuse.length === 1 ? 'was' : 'were') + ' copied into the site before (' + [...new Set(inuse.flatMap(x => x.usedIn || []))].join(', ') + '); those copies stay where they are.' : '');
    if (!await confirmBox('Delete from the library?', msg, 'Delete')) return;
    try { const n = await remove(ids); ids.forEach(i => sel.delete(i)); notify(n + ' image' + (n === 1 ? '' : 's') + ' deleted.', 'success'); own().log && own().log('Image library: ' + n + ' image(s) deleted'); }
    catch (e) { notify('Could not delete. ' + (e.message || errText(e)), 'error'); }
    refresh();
  }

  /* ---------------------------------------------------------------- library backup / restore (its own file; can be large) */
  async function backup() {
    await load(); if (!items.length) return notify('The library is empty.', 'info');
    if (!await confirmBox('Download the library backup?', 'This reads all ' + items.length + ' pictures (about ' + mb(used()) + ') once. The file contains the pictures themselves, so keep it private.', 'Download')) return;
    const parts = ['{"format":"codeflow-library-backup","version":1,"created":' + Date.now() + ',"items":['];
    $('libBkState').textContent = 'Reading pictures…';
    try {
      for (let i = 0; i < items.length; i++) {
        const it = items[i], data = await fullData(it.id);
        parts.push((i ? ',' : '') + JSON.stringify({ name: it.name, tags: it.tags || [], w: it.w, h: it.h, bytes: it.bytes, hash: it.hash, thumb: it.thumb, used: it.used || 0, usedIn: it.usedIn || [], createdAt: it.createdAt, data }));
        if (i % 10 === 0) $('libBkState').textContent = 'Reading pictures… ' + (i + 1) + ' of ' + items.length;
      }
      parts.push(']}');
      const a = document.createElement('a'), u = URL.createObjectURL(new Blob(parts, { type: 'application/json' }));
      a.href = u; a.download = 'codeflow-image-library-' + new Date().toISOString().slice(0, 10) + '.json'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 8000);
      $('libBkState').textContent = 'Backup downloaded (' + items.length + ' pictures).'; own().log && own().log('Image library backup downloaded');
    } catch (e) { $('libBkState').textContent = 'Could not create the backup. ' + (e.message || errText(e)); }
  }
  async function restore(file) {
    const st = $('libBkState');
    if (!file) return; if (file.size > 400 * MB) { st.textContent = 'This file is too large.'; return; }
    let j; try { j = JSON.parse(await file.text()); } catch (e) { st.textContent = 'This is not a valid backup file.'; return; }
    if (!j || j.format !== 'codeflow-library-backup' || j.version !== 1 || !Array.isArray(j.items)) { st.textContent = 'This is not an image library backup.'; return; }
    await load(true);
    let added = 0, dup = 0, bad = 0, capHit = false;
    for (const x of j.items) {
      try {
        if (!x || typeof x.data !== 'string' || !PREFIX.test(x.data) || bytesOf(x.data) > MAXB) { bad++; continue; }
        const hash = await sha(x.data); if (x.hash && x.hash !== hash) { bad++; continue; }
        if (items.some(i => i.hash === hash)) { dup++; continue; }
        const bytes = bytesOf(x.data);
        if (items.length >= MAXN || used() + bytes > cap * MB) { capHit = true; break; }
        const o = own(), f = o.fs, id = newId();
        const thumb = typeof x.thumb === 'string' && /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(x.thumb) && x.thumb.length <= 24000 ? x.thumb : '';
        const rec = { name: cleanName(x.name) || 'Image', tags: cleanTags(x.tags), mime: 'image/webp', w: Math.min(4000, Math.max(1, +x.w || 1)), h: Math.min(4000, Math.max(1, +x.h || 1)), bytes, hash, thumb, used: 0, usedIn: [], createdAt: Date.now() };
        await f.setDoc(f.doc(o.db, 'libraryFull', id), { data: x.data, bytes });
        await f.setDoc(f.doc(o.db, 'library', id), rec); items.unshift(Object.assign({ id }, rec)); added++;
      } catch (e) { bad++; }
    }
    st.textContent = added + ' restored, ' + dup + ' already present, ' + bad + ' skipped as invalid' + (capHit ? '. Stopped because the storage cap or image limit was reached.' : '.');
    if (added) own().log && own().log('Image library restored: ' + added + ' image(s)'); refresh();
  }

  /* ---------------------------------------------------------------- picker (used by every image upload field) */
  function pick(label) {
    return new Promise(async resolve => {
      try { await load(); } catch (e) { notify('Could not open the library. ' + errText(e), 'error'); return resolve(null); }
      const d = el('dialog', { class: 'dmodal libpick', 'aria-labelledby': 'libPkT' });
      const q = el('input', { type: 'search', placeholder: 'Search name or tag', 'aria-label': 'Search the library' }), box = el('div', { class: 'libgrid' }), err = el('p', { class: 'ferr', role: 'alert' });
      const draw2 = () => {
        const l = items.filter(x => match(x, q.value.trim().toLowerCase()));
        box.replaceChildren(...(l.length ? l.map(it => { const b = el('button', { type: 'button', class: 'libtile pickable', onclick: async () => {
          err.textContent = ''; b.disabled = true;
          try { const f = await toFile(await fullData(it.id), it.name); markUsed(it, label); done = true; d.close(); resolve(f); } catch (e) { err.textContent = e.message || errText(e); b.disabled = false; }
        } }, el('img', { src: it.thumb || '', alt: '', width: 120, height: 90 }), el('span', { class: 'libname' }, it.name), el('span', { class: 'libmeta' }, it.w + '×' + it.h)); return b; }) : [el('p', { class: 'dstate' }, items.length ? 'No images match.' : 'The library is empty. Add pictures on the Image library page first.')]));
      };
      let done = false; q.addEventListener('input', draw2); draw2();
      d.append(el('div', {}, el('h2', { id: 'libPkT' }, 'Choose from the image library'), el('label', { class: 'fld' }, 'Search', q), box, err, el('div', { class: 'dact-row' }, el('button', { type: 'button', class: 'dbtn', onclick: () => d.close() }, 'Cancel'))));
      d.addEventListener('close', () => { d.remove(); if (!done) resolve(null); }); document.body.append(d); d.showModal();
    });
  }
  function labelFor(inp) {
    const id = inp.id; if (id === 'hiFile') return 'Hero image'; if (id === 'hpFile') return 'Hero photo'; if (id === 'ciFile') return 'Chatbot picture';
    const t = $('dfTitle'); const dlg = inp.closest('dialog'); return dlg && t && t.textContent ? t.textContent : 'Image field';
  }
  function decorate(inp) {
    if (inp.dataset.lib || !/image/.test(inp.accept || '')) return; inp.dataset.lib = '1';
    const btn = el('button', { type: 'button', class: 'dbtn sm libbtn' }, 'Choose from library');
    btn.addEventListener('click', async () => {
      const f = await pick(labelFor(inp)); if (!f) return;
      try { const dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { notify('Your browser could not use this picture here. Download it from the library and choose the file instead.', 'error'); }
    });
    (inp.closest('label') || inp).after(btn);
  }
  const scan = () => document.querySelectorAll('input[type=file]').forEach(decorate);
  let signed = false;
  new MutationObserver(() => { if (signed) scan(); }).observe(document.body, { childList: true, subtree: true });

  /* ---------------------------------------------------------------- wiring */
  const wire = () => {
    if (!$('dp-library')) return;
    const dz = $('libDrop'), fi = $('libFile');
    fi.addEventListener('change', () => { upload(fi.files); fi.value = ''; });
    dz.addEventListener('click', () => fi.click());
    dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
    ['dragover', 'dragenter'].forEach(n => dz.addEventListener(n, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(n => dz.addEventListener(n, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => upload(e.dataTransfer.files));
    $('libSearch').addEventListener('input', grid);
    $('libCapSave').addEventListener('click', async () => {
      const v = Number($('libCap').value); if (CAPS.indexOf(v) < 0) return;
      try { const o = own(), f = o.fs; await f.setDoc(f.doc(o.db, 'ownerPrivate', 'library'), { capMB: v, updatedAt: Date.now() }, { merge: true }); cap = v; meter(); notify('Storage cap saved: ' + v + ' MB.', 'success'); }
      catch (e) { notify('Could not save the cap. ' + errText(e), 'error'); }
    });
    $('libRefresh').addEventListener('click', show);
    $('libNever').addEventListener('click', () => { sel.clear(); items.filter(x => !(x.used || 0)).forEach(x => sel.add(x.id)); grid(); notify(sel.size ? sel.size + ' never-used image(s) selected. Review them, then press Delete selected.' : 'Every image has been used at least once.', 'info'); });
    $('libDel').addEventListener('click', () => del([...sel]));
    $('libBk').addEventListener('click', backup);
    $('libRs').addEventListener('change', e => { restore(e.target.files[0]); e.target.value = ''; });
    document.addEventListener('dash:page', e => { if (signed) scan(); if (e.detail === 'library') show(); });
  };
  document.addEventListener('own:auth', e => { signed = !!(e.detail && e.detail.ok); loaded = false; items = []; sel.clear(); if (signed) scan(); else document.querySelectorAll('.libbtn').forEach(b => b.remove()); document.querySelectorAll('input[data-lib]').forEach(i => { if (!signed) delete i.dataset.lib; }); });
  window.libraryApi = { pick, load, add: addFile, items: () => items.slice(), cap: () => cap, used, process };
  wire();
})();
