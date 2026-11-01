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
  function toIcon(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) return reject(new Error('Please choose an image file.'));
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(url);
        for (const size of [96, 64, 48]) {
          const c = document.createElement('canvas'); c.width = c.height = size;
          const sc = Math.min(size / im.width, size / im.height, 1), w = Math.round(im.width * sc), h = Math.round(im.height * sc);
          c.getContext('2d').drawImage(im, (size - w) / 2, (size - h) / 2, w, h);
          const out = c.toDataURL('image/webp', 0.85);
          if (out.length <= 60000) return resolve(out);
        }
        reject(new Error('This image is too large. Please choose a simpler image.'));
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image.')); };
      im.src = url;
    });
  }

  /* ---------- reusable form dialog ---------- */
  function editDialog(title, defs, values) {
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
            try { out[f.key] = await toIcon(file); err.textContent = ''; show(); } catch (ex) { err.textContent = ex.message; e.target.value = ''; }
          } }),
          el('button', { type: 'button', class: 'dbtn sm', onclick: () => { out[f.key] = ''; show(); $(id).value = ''; } }, 'Remove image'));
        show();
      } else input = el('input', { id, type: 'text', maxlength: f.max, autocomplete: 'off' });
      if (f.type !== 'image') input.value = out[f.key] == null ? '' : out[f.key];
      box.append(el('div', { class: 'fld' }, el('label', { for: id }, f.label + (f.required ? ' *' : ' (optional)')), input, f.help ? el('small', { class: 'hint' }, f.help) : ''));
    });
    return new Promise(resolve => {
      const finish = v => { d.close(); form.onsubmit = null; $('dfCancel').onclick = null; d.oncancel = null; resolve(v); };
      form.onsubmit = e => {
        e.preventDefault();
        for (const f of defs) {
          if (f.type === 'image') continue;
          const v = $('df-' + f.key).value.trim(); out[f.key] = v;
          if (f.required && !v) { err.textContent = f.label + ' is required.'; $('df-' + f.key).focus(); return; }
        }
        finish(out);
      };
      $('dfCancel').onclick = () => finish(null);
      d.oncancel = e => { e.preventDefault(); finish(null); };
      d.showModal(); const first = box.querySelector('input,textarea,select'); if (first) first.focus();
    });
  }

  /* ---------- generic publish/discard handling ---------- */
  function makeStore(cfg) {
    const s = { saved: clone(cfg.get()), draft: null, dirty: false, busy: false };
    s.draft = clone(s.saved);
    s.touch = () => { s.dirty = true; cfg.render(); };
    s.sync = () => { $(cfg.pub).disabled = !s.dirty || s.busy; $(cfg.disc).disabled = !s.dirty || s.busy; $(cfg.state).textContent = s.dirty ? 'Unpublished changes: previewing on the site behind this panel.' : 'All changes are published.'; $(cfg.state).className = 'dhelp' + (s.dirty ? ' mdirty' : ''); cfg.preview(s.draft); };
    s.reset = () => { s.saved = clone(cfg.get()); if (!s.dirty) s.draft = clone(s.saved); };
    $(cfg.pub).addEventListener('click', async () => {
      const bad = cfg.validate(s.draft); if (bad) return notify(bad, 'error');
      s.busy = true; s.sync();
      try {
        await window.OWN.fs.setDoc(window.OWN.fs.doc(window.OWN.db, 'content', cfg.doc), Object.assign({ updatedAt: Date.now() }, cfg.payload(s.draft)));
        window.OWN.log(cfg.label + ' updated'); notify(cfg.label + ' published.', 'success');
        s.saved = clone(s.draft); s.dirty = false;
      } catch (e) { notify('Could not publish. ' + (e && e.code === 'permission-denied' ? 'Check your Firestore rules (content collection).' : ''), 'error'); }
      s.busy = false; cfg.render();
    });
    $(cfg.disc).addEventListener('click', () => { s.draft = clone(s.saved); s.dirty = false; cfg.render(); notify('Changes discarded.'); });
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
    get: () => api.getServices(), preview: l => api.renderServices(l), pub: 'svcPublish', disc: 'svcDiscard', state: 'svcState', doc: 'services', label: 'Services',
    payload: l => ({ items: l }),
    validate: l => l.some(s => !s.title.trim() || !s.description.trim()) ? 'Every service needs a title and a description.' : (l.length > 30 ? 'Please keep 30 services or fewer.' : ''),
    render: () => renderServices() });
  function renderServices() {
    const L = svc.draft;
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
    get: () => api.getToolkit(), preview: l => api.renderToolkit(l), pub: 'tkPublish', disc: 'tkDiscard', state: 'tkState', doc: 'toolkit', label: 'Toolkit',
    payload: l => ({ categories: l }),
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
    const L = tk.draft;
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

  /* ---------- lifecycle ---------- */
  document.addEventListener('dash:page', e => {
    if (e.detail === 'services') { svc.reset(); renderServices(); } else if (e.detail === 'toolkit') { tk.reset(); renderToolkit(); }
  });
  document.addEventListener('dash:closed', () => { api.renderServices(api.getServices()); api.renderToolkit(api.getToolkit()); });   // end preview
})();
