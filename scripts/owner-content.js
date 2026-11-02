/* ==========================================================================
   owner-content.js - dashboard pages for Services and Toolkit content management.
   Edits form a local draft that previews live on the public page behind the dashboard.
   "Publish changes" writes the draft to Firestore (content/services, content/toolkit);
   the Firestore rules allow only the owner to write.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, api = window.contentApi;
  if (!kit || !api) return;
  const { el, notify, confirmBox } = kit;
  const $ = id => document.getElementById(id);
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const clone = o => JSON.parse(JSON.stringify(o));
  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };

  /* ---------- image -> small square data URL (icons and logos) ---------- */
  function toIcon(file, cover) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) return reject(new Error('Please choose an image file.'));
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(url);
        for (const size of (cover ? [128, 96, 64] : [96, 64, 48])) {
          const c = document.createElement('canvas'); c.width = c.height = size;
          const ctx = c.getContext('2d');
          if (cover) {   // centred square crop (profile photos): no distortion
            const sc = Math.max(size / im.width, size / im.height), w = im.width * sc, h = im.height * sc;
            ctx.drawImage(im, (size - w) / 2, (size - h) / 2, w, h);
          } else {       // fit inside a square (icons and logos): no distortion
            const sc = Math.min(size / im.width, size / im.height, 1), w = Math.round(im.width * sc), h = Math.round(im.height * sc);
            ctx.drawImage(im, (size - w) / 2, (size - h) / 2, w, h);
          }
          const out = c.toDataURL('image/webp', 0.85);
          if (out.length <= (cover ? 45000 : 60000)) return resolve(out);
        }
        reject(new Error('This image is too large. Please choose a simpler image.'));
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image.')); };
      im.src = url;
    });
  }

  /* ---------- image -> screenshot-sized data URL (keeps the aspect ratio; used for training images) ---------- */
  function toPhoto(file, maxLen) {
    maxLen = maxLen || 90000;
    return new Promise((resolve, reject) => {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('Please choose a PNG, JPG or WebP image.'));
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(url);
        for (const mw of [900, 760, 620, 500, 400]) for (const q of [0.8, 0.65, 0.5]) {
          const sc = Math.min(1, mw / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(im.width * sc)); c.height = Math.max(1, Math.round(im.height * sc));
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          const out = c.toDataURL('image/webp', q); if (out.length <= maxLen) return resolve(out);
        }
        reject(new Error('This image is too detailed to store. Please choose a smaller or simpler image.'));
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image.')); };
      im.src = url;
    });
  }

  /* ---------- reusable form dialog ---------- */
  function editDialog(title, defs, values, validate) {
    const d = $('dForm'), form = $('dfForm'), box = $('dfFields'), err = $('dfErr'), okBtn = $('dfOk');
    $('dfTitle').textContent = title; err.textContent = ''; box.textContent = '';
    const out = Object.assign({}, values);
    defs.forEach(f => {
      const id = 'df-' + f.key; let input;
      if (f.type === 'textarea') input = el('textarea', { id, rows: '4', maxlength: f.max });
      else if (f.type === 'select') input = el('select', { id }, ...f.options.map(o => el('option', { value: o.value }, o.label)));
      else if (f.type === 'image') {
        const prev = el('img', { class: 'mthumb', alt: '', width: '40', height: '40' });
        const show = () => { prev.hidden = !out[f.key]; if (out[f.key]) prev.src = out[f.key]; };
        input = el('div', { class: 'imgfield' }, prev,
          el('input', { type: 'file', id, accept: 'image/*', onchange: async e => {
            const file = e.target.files[0]; if (!file) return;
            try { out[f.key] = f.photo ? await toPhoto(file) : await toIcon(file, f.cover); err.textContent = ''; show(); } catch (ex) { err.textContent = ex.message; e.target.value = ''; }
          } }),
          el('button', { type: 'button', class: 'dbtn sm', onclick: () => { out[f.key] = ''; show(); $(id).value = ''; } }, 'Remove image'));
        show();
      } else if (f.type === 'check') { input = el('input', { id, type: 'checkbox' }); input.checked = !!out[f.key]; }
      else input = el('input', Object.assign({ id, type: ['month', 'date', 'number', 'email', 'tel'].includes(f.type) ? f.type : 'text', maxlength: f.max, autocomplete: 'off' }, f.type === 'number' ? { min: f.min, max: f.maxv, step: f.step || 'any', inputmode: 'decimal' } : {}));
      if (f.type !== 'image' && f.type !== 'check') input.value = out[f.key] == null ? '' : out[f.key];
      box.append(el('div', { class: 'fld' }, el('label', { for: id }, f.label + (f.required ? ' *' : ' (optional)')), input, f.help ? el('small', { class: 'hint' }, f.help) : ''));
    });
    return new Promise(resolve => {
      const finish = v => { d.close(); form.onsubmit = null; $('dfCancel').onclick = null; d.oncancel = null; resolve(v); };
      form.onsubmit = e => {
        e.preventDefault();
        for (const f of defs) {
          if (f.type === 'image') continue;
          if (f.type === 'check') { out[f.key] = $('df-' + f.key).checked; continue; }
          const v = $('df-' + f.key).value.trim(); out[f.key] = v;
          if (f.required && !v) { err.textContent = f.label + ' is required.'; $('df-' + f.key).focus(); return; }
        }
        const bad = validate && validate(out); if (bad) { err.textContent = bad; return; }
        finish(out);
      };
      $('dfCancel').onclick = () => finish(null);
      d.oncancel = e => { e.preventDefault(); finish(null); };
      d.showModal(); const first = box.querySelector('input,textarea,select'); if (first) first.focus();
    });
  }

  /* ---------- generic publish/discard handling ---------- */
  function makeStore(cfg) {
    const s = { saved: clone(cfg.get()), draft: null, dirty: false, busy: false, savedM: cfg.meta ? clone(cfg.meta.get()) : null };
    s.draft = clone(s.saved); s.draftM = clone(s.savedM);   // draftM = extra settings saved with the list (for example the view format)
    s.touch = () => { s.dirty = true; cfg.render(); };
    s.sync = () => { $(cfg.pub).disabled = !s.dirty || s.busy; $(cfg.disc).disabled = !s.dirty || s.busy; $(cfg.state).textContent = s.dirty ? 'Unpublished changes: previewing on the site behind this panel.' : 'All changes are published.'; $(cfg.state).className = 'dhelp' + (s.dirty ? ' mdirty' : ''); cfg.preview(s.draft, s.draftM); };
    s.reset = () => { s.saved = clone(cfg.get()); if (cfg.meta) s.savedM = clone(cfg.meta.get()); if (!s.dirty) { s.draft = clone(s.saved); s.draftM = clone(s.savedM); } };
    $(cfg.pub).addEventListener('click', async () => {
      const bad = cfg.validate(s.draft); if (bad) return notify(bad, 'error');
      s.busy = true; s.sync();
      try {
        await window.OWN.fs.setDoc(window.OWN.fs.doc(window.OWN.db, 'content', cfg.doc), Object.assign({ updatedAt: Date.now() }, cfg.payload(s.draft, s.draftM)));
        window.OWN.log(cfg.label + ' updated'); notify(cfg.label + ' published.', 'success');
        s.saved = clone(s.draft); s.savedM = clone(s.draftM); s.dirty = false;
      } catch (e) { notify('Could not publish. ' + (e && e.code === 'permission-denied' ? 'Check your Firestore rules (content collection).' : ''), 'error'); }
      s.busy = false; cfg.render();
    });
    $(cfg.disc).addEventListener('click', () => { s.draft = clone(s.saved); s.draftM = clone(s.savedM); s.dirty = false; cfg.render(); notify('Changes discarded.'); });
    return s;
  }
  const thumb = (src, label) => src ? el('img', { class: 'mthumb', src, alt: '', width: '40', height: '40' }) : el('span', { class: 'mthumb ph', 'aria-hidden': 'true' }, (label || '?').trim().charAt(0).toUpperCase());
  const ctl = (label, name, fn, disabled) => el('button', { type: 'button', class: 'dbtn sm', 'aria-label': label + ': ' + name, disabled: !!disabled, onclick: fn }, label);
  const toggle = (name, on, fn) => el('label', { class: 'tog' }, el('input', { type: 'checkbox', checked: on, 'aria-label': 'Show ' + name + ' on the site', onchange: e => fn(e.target.checked) }), 'Show');

  /* ---------- SERVICES ---------- */
  const SVC_FIELDS = [
    { key: 'title', label: 'Service title', required: true, max: 80 },
    { key: 'description', label: 'Description', type: 'textarea', required: true, max: 700, help: 'Up to 700 characters.' },
    { key: 'image', label: 'Icon or image', type: 'image', help: 'Shown next to the title. Small square images work best.' }];
  const svc = makeStore({
    get: () => api.getServices(), meta: { get: () => ({ view: api.getView('services') }) }, preview: (l, m) => api.renderServices(l, m.view), pub: 'svcPublish', disc: 'svcDiscard', state: 'svcState', doc: 'services', label: 'Services',
    payload: (l, m) => ({ items: l, view: m.view }),
    validate: l => l.some(s => !s.title.trim() || !s.description.trim()) ? 'Every service needs a title and a description.' : (l.length > 30 ? 'Please keep 30 services or fewer.' : ''),
    render: () => renderServices() });
  function renderServices() {
    const L = svc.draft; $('svcView').value = svc.draftM.view;
    $('svcList').replaceChildren(...(L.length ? L.map((s, i) => el('div', { class: 'mrow' + (s.enabled === false ? ' off' : '') },
      thumb(s.image, s.title),
      el('div', { class: 'mmain' }, el('strong', {}, s.title), el('small', {}, s.description.slice(0, 120) + (s.description.length > 120 ? '…' : ''))),
      el('div', { class: 'mctl' }, toggle(s.title, s.enabled !== false, v => { s.enabled = v; svc.touch(); }),
        ctl('Move up', s.title, () => { move(L, i, -1); svc.touch(); }, i === 0), ctl('Move down', s.title, () => { move(L, i, 1); svc.touch(); }, i === L.length - 1),
        ctl('Edit', s.title, async () => { const r = await editDialog('Edit service', SVC_FIELDS, s); if (r) { Object.assign(s, r); svc.touch(); } }),
        el('button', { type: 'button', class: 'dbtn sm danger', 'aria-label': 'Delete: ' + s.title, onclick: async () => {
          if (await confirmBox('Delete this service?', '“' + s.title + '” will be permanently removed from the Services section once you publish.')) { L.splice(i, 1); svc.touch(); } } }, 'Delete'))))
      : [el('p', { class: 'dstate' }, 'No services yet. Add one to show the Services section.')]));
    svc.sync();
  }
  $('svcAdd').addEventListener('click', async () => {
    if (svc.draft.length >= 30) return notify('Please keep 30 services or fewer.', 'error');
    const r = await editDialog('Add service', SVC_FIELDS, { title: '', description: '', image: '' });
    if (r) { svc.draft.push({ id: uid('s'), title: r.title, description: r.description, image: r.image || '', enabled: true }); svc.touch(); }
  });

  /* ---------- TOOLKIT ---------- */
  const tk = makeStore({
    get: () => api.getToolkit(), meta: { get: () => ({ view: api.getView('toolkit') }) }, preview: (l, m) => api.renderToolkit(l, m.view), pub: 'tkPublish', disc: 'tkDiscard', state: 'tkState', doc: 'toolkit', label: 'Toolkit',
    payload: (l, m) => ({ categories: l, view: m.view }),
    validate: l => l.some(c => !c.name.trim() || c.tools.some(t => !t.name.trim())) ? 'Every category and tool needs a name.' : (l.reduce((n, c) => n + c.tools.length, 0) > 80 ? 'Please keep 80 tools or fewer.' : ''),
    render: () => renderToolkit() });
  const catOptions = () => tk.draft.map(c => ({ value: c.id, label: c.name }));
  const toolFields = () => [
    { key: 'name', label: 'Tool name', required: true, max: 40 },
    { key: 'category', label: 'Category', type: 'select', options: catOptions(), required: true },
    { key: 'description', label: 'Description', max: 200, help: 'Shown as a tooltip on the site.' },
    { key: 'logo', label: 'Logo or image', type: 'image' }];
  async function toolDialog(title, tool, catId) {
    const r = await editDialog(title, toolFields(), Object.assign({ name: '', description: '', logo: '' }, tool, { category: catId }));
    return r;
  }
  function renderToolkit() {
    const L = tk.draft; $('tkView').value = tk.draftM.view;
    $('tkList').replaceChildren(...(L.length ? L.map((c, ci) => el('div', { class: 'mcat' },
      el('div', { class: 'mcat-h' }, el('strong', {}, c.name),
        el('div', { class: 'mctl' },
          ctl('Move up', c.name, () => { move(L, ci, -1); tk.touch(); }, ci === 0), ctl('Move down', c.name, () => { move(L, ci, 1); tk.touch(); }, ci === L.length - 1),
          ctl('Rename', c.name, async () => { const r = await editDialog('Rename category', [{ key: 'name', label: 'Category name', required: true, max: 40 }], c); if (r) { c.name = r.name; tk.touch(); } }),
          el('button', { type: 'button', class: 'dbtn sm primary', onclick: async () => {
            const r = await toolDialog('Add tool', {}, c.id); if (!r) return;
            const target = L.find(x => x.id === r.category) || c;
            target.tools.push({ id: uid('t'), name: r.name, description: r.description || '', logo: r.logo || '', enabled: true }); tk.touch(); } }, 'Add tool'),
          el('button', { type: 'button', class: 'dbtn sm danger', 'aria-label': 'Delete category: ' + c.name, onclick: async () => {
            if (await confirmBox('Delete this category?', '“' + c.name + '”' + (c.tools.length ? ' and its ' + c.tools.length + ' tool(s)' : '') + ' will be removed once you publish.')) { L.splice(ci, 1); tk.touch(); } } }, 'Delete'))),
      el('div', { class: 'mlist' }, ...(c.tools.length ? c.tools.map((t, ti) => el('div', { class: 'mrow' + (t.enabled === false ? ' off' : '') },
        thumb(t.logo, t.name),
        el('div', { class: 'mmain' }, el('strong', {}, t.name), el('small', {}, t.description || 'No description')),
        el('div', { class: 'mctl' }, toggle(t.name, t.enabled !== false, v => { t.enabled = v; tk.touch(); }),
          ctl('Move up', t.name, () => { move(c.tools, ti, -1); tk.touch(); }, ti === 0), ctl('Move down', t.name, () => { move(c.tools, ti, 1); tk.touch(); }, ti === c.tools.length - 1),
          ctl('Edit', t.name, async () => {
            const r = await toolDialog('Edit tool', t, c.id); if (!r) return;
            Object.assign(t, { name: r.name, description: r.description || '', logo: r.logo || '' });
            if (r.category !== c.id) { const to = L.find(x => x.id === r.category); if (to) { c.tools.splice(ti, 1); to.tools.push(t); } }
            tk.touch(); }),
          el('button', { type: 'button', class: 'dbtn sm danger', 'aria-label': 'Delete tool: ' + t.name, onclick: async () => {
            if (await confirmBox('Delete this tool?', '“' + t.name + '” will be removed once you publish.')) { c.tools.splice(ti, 1); tk.touch(); } } }, 'Delete')))) : [el('p', { class: 'dhelp' }, 'No tools in this category yet.')]))))
      : [el('p', { class: 'dstate' }, 'No categories yet. Add a category to start.')]));
    tk.sync();
  }
  $('tkAddCat').addEventListener('click', async () => {
    const r = await editDialog('Add category', [{ key: 'name', label: 'Category name', required: true, max: 40 }], { name: '' });
    if (r) { tk.draft.push({ id: uid('c'), name: r.name, tools: [] }); tk.touch(); }
  });

  $('svcView').addEventListener('change', e => { svc.draftM.view = e.target.value; svc.touch(); });
  $('tkView').addEventListener('change', e => { tk.draftM.view = e.target.value; tk.touch(); });

  /* ---------- lifecycle ---------- */
  document.addEventListener('dash:page', e => {
    if (e.detail === 'services') { svc.reset(); renderServices(); } else if (e.detail === 'toolkit') { tk.reset(); renderToolkit(); }
  });
  document.addEventListener('dash:closed', () => { api.renderServices(api.getServices(), api.getView('services')); api.renderToolkit(api.getToolkit(), api.getView('toolkit')); });   // end preview
  window.ownKit = { makeStore, editDialog, toPhoto, thumb, ctl, toggle, uid, clone, move };   // shared with owner-phase1.js
  /* ---------- TESTIMONIALS (needs scripts/testimonials.js) ---------- */
  const tapi = window.testiApi;
  if (tapi) {
    const TM_FIELDS = () => [
      { key: 'name', label: 'Name', required: true, max: 80 },
      { key: 'role', label: 'Position, company or designation', max: 100 },
      { key: 'quote', label: 'Testimonial', type: 'textarea', required: true, max: 700 },
      { key: 'rating', label: 'Star rating', type: 'select', options: [{ value: '', label: 'No rating' }].concat([1, 2, 3, 4, 5].map(n => ({ value: String(n), label: n + (n === 1 ? ' star' : ' stars') }))) },
      { key: 'photo', label: 'Profile photo', type: 'image', cover: true, help: 'Cropped to a circle. Without a photo, the initials of the name are shown.' }];
    const tm = makeStore({
      get: () => tapi.get(), preview: d => tapi.render(d), pub: 'tmPublish', disc: 'tmDiscard', state: 'tmState', doc: 'testimonials', label: 'Testimonials',
      payload: d => ({ enabled: d.enabled, view: d.view, items: d.items }),
      validate: d => d.items.some(t => !t.name.trim() || !t.quote.trim()) ? 'Every testimonial needs a name and the testimonial text.'
        : (d.items.length > 20 ? 'Please keep 20 testimonials or fewer.' : (JSON.stringify(d).length > 900000 ? 'Too much image data. Remove a few photos.' : '')),
      render: () => renderTm() });
    const avatar = t => t.photo ? el('img', { class: 'mthumb', src: t.photo, alt: '', width: '40', height: '40' }) : el('span', { class: 'mthumb ph', 'aria-hidden': 'true' }, tapi.initials(t.name));
    function renderTm() {
      const D = tm.draft;
      $('tmEnabled').checked = D.enabled; $('tmView').value = D.view;
      $('tmList').replaceChildren(...(D.items.length ? D.items.map((t, i) => el('div', { class: 'mrow' + (t.enabled === false ? ' off' : '') },
        avatar(t),
        el('div', { class: 'mmain' }, el('strong', {}, t.name), el('small', {}, [t.role, t.rating ? '★'.repeat(t.rating) + ' (' + t.rating + '/5)' : 'No rating'].filter(Boolean).join(' · ')),
          el('small', {}, t.quote.slice(0, 110) + (t.quote.length > 110 ? '…' : ''))),
        el('div', { class: 'mctl' }, toggle(t.name, t.enabled !== false, v => { t.enabled = v; tm.touch(); }),
          ctl('Move up', t.name, () => { move(D.items, i, -1); tm.touch(); }, i === 0), ctl('Move down', t.name, () => { move(D.items, i, 1); tm.touch(); }, i === D.items.length - 1),
          ctl('Edit', t.name, async () => {
            const r = await editDialog('Edit testimonial', TM_FIELDS(), Object.assign({}, t, { rating: String(t.rating || '') }));
            if (r) { Object.assign(t, { name: r.name, role: r.role || '', quote: r.quote, rating: Number(r.rating) || 0, photo: r.photo || '' }); tm.touch(); } }),
          el('button', { type: 'button', class: 'dbtn sm danger', 'aria-label': 'Delete: ' + t.name, onclick: async () => {
            if (await confirmBox('Delete this testimonial?', 'The testimonial from “' + t.name + '” will be removed once you publish.')) { D.items.splice(i, 1); tm.touch(); } } }, 'Delete'))))
        : [el('p', { class: 'dstate' }, 'No testimonials yet. Add one, then switch the section on.')]));
      tm.sync();
    }
    $('tmEnabled').addEventListener('change', e => { tm.draft.enabled = e.target.checked; tm.touch(); });
    $('tmView').addEventListener('change', e => { tm.draft.view = e.target.value; tm.touch(); });
    $('tmAdd').addEventListener('click', async () => {
      if (tm.draft.items.length >= 20) return notify('Please keep 20 testimonials or fewer.', 'error');
      const r = await editDialog('Add testimonial', TM_FIELDS(), { name: '', role: '', quote: '', rating: '', photo: '' });
      if (r) { tm.draft.items.push({ id: uid('m'), name: r.name, role: r.role || '', quote: r.quote, rating: Number(r.rating) || 0, photo: r.photo || '', enabled: true }); tm.touch(); }
    });
    document.addEventListener('dash:page', e => { if (e.detail === 'testimonials') { tm.reset(); renderTm(); } });
    document.addEventListener('dash:closed', () => tapi.render(tapi.get()));
  }

})();
