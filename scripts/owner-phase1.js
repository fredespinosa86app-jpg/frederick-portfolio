/* ==========================================================================
   owner-phase1.js - dashboard pages added in Phase 1:
   Hero photo, Section backgrounds, How I Work videos, FAQ, Training categories.
   Content pages use the same draft -> preview -> publish flow as Services and Toolkit
   (makeStore in owner-content.js). Every write goes to Firestore and is checked by the
   security rules (owner only); nothing here relies on hiding buttons.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, K = window.ownKit;
  if (!kit || !K || !window.coreTrainingCats) return;
  const { el, notify, confirmBox, iconBtn } = kit;
  const CT = window.coreTrainingCats;
  const { makeStore, editDialog, toPhoto, thumb, ctl, toggle, uid, clone, move } = K;
  const $ = id => document.getElementById(id);
  const own = () => window.OWN;
  const noOwner = () => notify('Could not save. Please sign in as the owner first.', 'error');

  /* ---------------------------------------------------------------- Hero photo */
  const hp = window.heroPhotoApi;
  if (hp) {
    let pending = '';
    const sync = () => {
      $('hpSave').disabled = !pending; $('hpCancel').disabled = !pending;
      $('hpState').textContent = pending ? 'Preview only: not saved yet. Save to publish it for every visitor.' : (hp.getSaved() ? 'Showing your saved hero photo.' : 'Showing the original portrait.');
      $('hpPrev').src = pending || hp.getSaved() || hp.DEF.src;
    };
    $('hpFile').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try { pending = await toPhoto(f, 250000); hp.preview(pending); } catch (ex) { notify(ex.message, 'error'); e.target.value = ''; }
      sync();
    });
    $('hpCancel').addEventListener('click', () => { pending = ''; $('hpFile').value = ''; hp.endPreview(); sync(); });
    const write = async (photo, msg) => {
      if (!own()) return noOwner();
      try { await own().fs.setDoc(own().fs.doc(own().db, 'content', 'heroPhoto'), { photo, updatedAt: Date.now() }); own().log(msg); notify(msg, 'success'); pending = ''; $('hpFile').value = ''; }
      catch (e) { notify('Could not save the photo. Check your Firestore rules (content collection).', 'error'); }
      sync();
    };
    $('hpSave').addEventListener('click', () => write(pending, 'Hero photo saved.'));
    $('hpRestore').addEventListener('click', async () => { if (await confirmBox('Restore the original portrait?', 'Your uploaded hero photo will be removed from the site.', 'Restore')) write('', 'Original portrait restored.'); });
    document.addEventListener('herophoto:changed', sync);
    document.addEventListener('dash:closed', () => { pending = ''; hp.endPreview(); });
    document.addEventListener('dash:page', e => { if (e.detail === 'hero') sync(); });
  }

  /* ---------------------------------------------------------------- Section backgrounds */
  const sb = window.secBgApi;
  if (sb) {
    let saved = {}, draft = {};
    const toHex = c => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || ''); return m ? '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('') : '#ffffff'; };
    const dirty = () => JSON.stringify(draft) !== JSON.stringify(saved);
    const sync = () => { $('sbSave').disabled = !dirty(); $('sbDiscard').disabled = !dirty(); $('sbState').textContent = dirty() ? 'Unsaved changes: previewing on the site behind this panel.' : 'All background settings are saved.'; $('sbState').className = 'dhelp' + (dirty() ? ' mdirty' : ''); };
    const render = () => {
      $('sbList').replaceChildren(...sb.SECTIONS.map(([id, label]) => {
        const on = sb.HEX.test(draft[id] || ''), sec = document.getElementById(id);
        const color = el('input', { type: 'color', 'aria-label': label + ' background colour', value: on ? draft[id] : toHex(sec && getComputedStyle(sec).backgroundColor) });
        const note = el('small', {}, on ? 'Text contrast ' + sb.contrast(draft[id]).toFixed(1) + ':1' : 'Using the theme colour');
        color.disabled = !on;
        const chk = el('input', { type: 'checkbox', 'aria-label': 'Use a custom background for ' + label, checked: on, onchange: e => { draft[id] = e.target.checked ? color.value : ''; sb.apply(draft); render(); sync(); } });
        color.addEventListener('input', () => { draft[id] = color.value; sb.apply(draft); note.textContent = 'Text contrast ' + sb.contrast(color.value).toFixed(1) + ':1'; sync(); });
        return el('div', { class: 'mrow' }, el('span', { class: 'mthumb ph', 'aria-hidden': 'true' }, label.charAt(0)),
          el('div', { class: 'mmain' }, el('strong', {}, label), note),
          el('div', { class: 'mctl' }, el('label', { class: 'tog' }, chk, 'Custom'), color));
      }));
      sync();
    };
    $('sbSave').addEventListener('click', () => {
      if (!own()) return noOwner();
      const full = {}; sb.SECTIONS.forEach(([id]) => { full[id] = sb.HEX.test(draft[id] || '') ? draft[id] : ''; });
      own().save({ secBg: full }, 'Section backgrounds saved.'); saved = clone(full); draft = clone(full); sync();
    });
    $('sbDiscard').addEventListener('click', () => { draft = clone(saved); sb.apply(saved); render(); notify('Changes discarded.'); });
    const live = () => clone((window.__lastCfg && window.__lastCfg.secBg) || {});   // what is actually published (never the preview)
    document.addEventListener('dash:page', e => { if (e.detail === 'secbg') { saved = live(); draft = clone(saved); render(); } });
    document.addEventListener('dash:closed', () => { saved = live(); draft = clone(saved); sb.apply(saved); });
  }

  const trainingOptions = () => [{ value: '', label: 'General (not tied to a category)' }].concat((window.trainingApi ? window.trainingApi.get() : []).map(t => ({ value: t.id, label: t.title })));
  const catName = id => (trainingOptions().find(o => o.value === id) || {}).label || '';
  const del = (name, what, after) => el('button', { type: 'button', class: 'dbtn sm danger', 'aria-label': 'Delete: ' + name, onclick: async () => { if (await confirmBox('Delete this ' + what + '?', '“' + name + '” will be removed once you publish.')) after(); } }, 'Delete');

  /* ---------------------------------------------------------------- How I Work videos */
  const va = window.videosApi;
  if (va) {
    const vd = makeStore({
      get: () => va.get().items, meta: { get: () => ({ view: va.get().view }) }, preview: (l, m) => va.preview(l, m.view),
      pub: 'vdPublish', disc: 'vdDiscard', state: 'vdState', doc: 'videos', label: 'Videos',
      payload: (l, m) => ({ items: l, view: m.view }),
      validate: l => l.length > va.MAX ? 'Please keep ' + va.MAX + ' videos or fewer.' : (l.some(v => !va.parse(v.url) || !v.title.trim()) ? 'Every video needs a valid YouTube or Loom link and a title.' : ''),
      render: () => renderVideos() });

    /* Add / edit dialog with link validation and a player preview before saving */
    function videoDialog(init, others) {
      return new Promise(resolve => {
        const d = el('dialog', { class: 'dmodal', 'aria-labelledby': 'vdlT' });
        const url = el('input', { type: 'url', id: 'vdl-url', maxlength: '300', autocomplete: 'off', placeholder: 'https://www.youtube.com/watch?v=… or https://www.loom.com/share/…' });
        const title = el('input', { type: 'text', id: 'vdl-title', maxlength: '120', autocomplete: 'off' });
        const desc = el('textarea', { id: 'vdl-desc', rows: '2', maxlength: '300' });
        const cat = el('select', { id: 'vdl-cat' }, ...trainingOptions().map(o => el('option', { value: o.value }, o.label)));
        url.value = init.url || ''; title.value = init.title || ''; desc.value = init.description || ''; cat.value = CT.knownOrGeneral(init.category, window.trainingApi ? window.trainingApi.get() : []);
        const prev = el('div', { class: 'vd-prev' }), status = el('small', { class: 'cnt', role: 'status' }), err = el('p', { class: 'ferr', role: 'alert' });
        let timer = 0, token = 0, found = '';
        const say = (m, k) => { status.textContent = m; status.className = 'cnt ' + (k || ''); };
        async function check() {
          const my = ++token, p = va.parse(url.value); prev.textContent = ''; found = '';
          if (!url.value.trim()) return say('');
          if (!p) return say('This is not a valid link. Use a YouTube (watch, youtu.be or Shorts) or Loom share link starting with https://.', 'bad');
          const f = el('iframe', { title: 'Video preview', src: p.embed, loading: 'lazy', allowfullscreen: '', referrerpolicy: 'strict-origin-when-cross-origin' }); prev.className = 'vd-prev' + (p.vertical ? ' vertical' : ''); prev.append(f);
          if (p.provider === 'loom') return say('Loom link accepted. Make sure the video is shared with “Anyone with the link”, or visitors will not be able to play it.', 'good');
          say('Checking the video…');
          try {
            const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(p.watch));
            if (my !== token) return;
            if (r.ok) { const j = await r.json(); found = String(j.title || ''); if (!title.value.trim() && found) title.value = found.slice(0, 120); say('Video found' + (found ? ': ' + found : '') + '.', 'good'); }
            else say('YouTube cannot find or share this video (it may be private, deleted or not embeddable). You can still save it, but visitors may not be able to play it.', 'warn');
          } catch (e) { if (my === token) say('Link is valid, but its availability could not be checked right now. Use the preview above to confirm it plays.', 'warn'); }
        }
        url.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(check, 400); });
        const finish = v => { d.close(); d.remove(); resolve(v); };
        const ok = el('button', { type: 'submit', class: 'dbtn primary' }, 'Save video');
        const form = el('form', { novalidate: '' }, el('div', {}, el('h2', { id: 'vdlT' }, init.url ? 'Edit video' : 'Add video'),
          el('div', { class: 'ab' },
            el('div', { class: 'fld' }, el('label', { for: 'vdl-url' }, 'Video link (YouTube or Loom) *'), url),
            prev, status,
            el('div', { class: 'fld' }, el('label', { for: 'vdl-title' }, 'Title *'), title),
            el('div', { class: 'fld' }, el('label', { for: 'vdl-desc' }, 'Short description (optional)'), desc),
            el('div', { class: 'fld' }, el('label', { for: 'vdl-cat' }, 'Show also in training category'), cat)),
          err, el('div', { class: 'dact-row' }, ok, el('button', { type: 'button', class: 'dbtn', onclick: () => finish(null) }, 'Cancel'))));
        form.addEventListener('submit', e => {
          e.preventDefault(); const p = va.parse(url.value);
          if (!p) { err.textContent = 'Enter a valid YouTube or Loom link.'; url.focus(); return; }
          if (!title.value.trim()) { err.textContent = 'Please enter a title.'; title.focus(); return; }
          if (others.some(o => { const q = va.parse(o.url); return q && q.provider === p.provider && q.id === p.id; })) { err.textContent = 'This video is already in your list.'; url.focus(); return; }
          finish({ url: url.value.trim(), title: title.value.trim(), description: desc.value.trim(), category: cat.value });
        });
        d.append(form); d.addEventListener('cancel', e => { e.preventDefault(); finish(null); });
        $('dash').append(d); d.showModal();   // inside the dashboard so its form styles apply
         if (init.url) check(); url.focus();
      });
    }

    function renderVideos() {
      const L = vd.draft; $('vdView').value = vd.draftM.view; $('vdCount').textContent = L.length + ' of ' + va.MAX + ' videos';
      $('vdAdd').disabled = L.length >= va.MAX;
      $('vdList').replaceChildren(...(L.length ? L.map((v, i) => {
        const p = va.parse(v.url);
        return el('div', { class: 'mrow' + (v.enabled === false ? ' off' : '') },
          p && p.provider === 'youtube' ? el('img', { class: 'mthumb vthumb-s', src: p.thumb, alt: '', width: '40', height: '40' }) : thumb('', 'L'),
          el('div', { class: 'mmain' }, el('strong', {}, v.title), el('small', {}, [p ? (p.provider === 'loom' ? 'Loom' : 'YouTube') : 'Invalid link', v.category ? catName(v.category) : 'General'].join(' · '))),
          el('div', { class: 'mctl' }, toggle(v.title, v.enabled !== false, on => { v.enabled = on; vd.touch(); }),
            ctl('Move up', v.title, () => { move(L, i, -1); vd.touch(); }, i === 0), ctl('Move down', v.title, () => { move(L, i, 1); vd.touch(); }, i === L.length - 1),
            ctl('Edit', v.title, async () => { const r = await videoDialog(v, L.filter(x => x !== v)); if (r) { Object.assign(v, r); vd.touch(); } }),
            del(v.title, 'video', () => { L.splice(i, 1); vd.touch(); })));
      }) : [el('p', { class: 'dstate' }, 'No videos yet. Add a YouTube or Loom link to show videos under “How I Work”.')]));
      vd.sync();
    }
    $('vdAdd').addEventListener('click', async () => {
      if (vd.draft.length >= va.MAX) return notify('You can add up to ' + va.MAX + ' videos.', 'error');
      const r = await videoDialog({ url: '', title: '', description: '', category: '' }, vd.draft);
      if (r) { vd.draft.push(Object.assign({ id: uid('v'), enabled: true }, r)); vd.touch(); }
    });
    $('vdView').addEventListener('change', e => { vd.draftM.view = e.target.value; vd.touch(); });
    document.addEventListener('dash:page', e => { if (e.detail === 'videos') { vd.reset(); renderVideos(); } });
    document.addEventListener('dash:closed', () => va.render());
  }

  /* ---------------------------------------------------------------- FAQ */
  const fa = window.faqApi;
  if (fa) {
    const fq = makeStore({
      get: () => fa.get(), preview: l => fa.preview(l), pub: 'fqPublish', disc: 'fqDiscard', state: 'fqState', doc: 'faq', label: 'FAQ',
      payload: l => ({ items: l }),
      validate: l => l.some(f => !f.q.trim() || !f.a.trim()) ? 'Every FAQ needs a question and an answer.' : (l.length > fa.MAX ? 'Please keep ' + fa.MAX + ' questions or fewer.' : ''),
      render: () => renderFaq() });
    const fields = () => [
      { key: 'q', label: 'Question', required: true, max: 200 },
      { key: 'a', label: 'Answer', type: 'textarea', required: true, max: 1500, help: 'Up to 1,500 characters. A blank line starts a new paragraph.' },
      { key: 'category', label: 'Training category', type: 'select', options: trainingOptions(), help: 'Choose a category to also show this question inside it. It always stays in the main FAQ section.' },
      { key: 'kb', label: 'Chatbot knowledge', type: 'select', options: [{ value: 'no', label: 'Do not add to the chatbot' }, { value: 'yes', label: 'Add to the chatbot knowledge' }], help: 'The chatbot only uses this question when you choose “Add”.' }];
    const toRec = r => ({ q: r.q, a: r.a, category: r.category || '', kb: r.kb === 'yes' });
    function renderFaq() {
      const L = fq.draft;
      $('fqList').replaceChildren(...(L.length ? L.map((f, i) => el('div', { class: 'mrow' + (f.enabled === false ? ' off' : '') },
        el('span', { class: 'mthumb ph', 'aria-hidden': 'true' }, '?'),
        el('div', { class: 'mmain' }, el('strong', {}, f.q), el('small', {}, f.a.slice(0, 110) + (f.a.length > 110 ? '…' : '')),
          el('small', {}, [f.category ? catName(f.category) : 'General', f.kb ? 'In chatbot knowledge' : 'Not in chatbot'].join(' · '))),
        el('div', { class: 'mctl' }, toggle(f.q, f.enabled !== false, on => { f.enabled = on; fq.touch(); }),
          ctl('Move up', f.q, () => { move(L, i, -1); fq.touch(); }, i === 0), ctl('Move down', f.q, () => { move(L, i, 1); fq.touch(); }, i === L.length - 1),
          ctl('Edit', f.q, async () => { const r = await editDialog('Edit question', fields(), { q: f.q, a: f.a, category: CT.knownOrGeneral(f.category, window.trainingApi ? window.trainingApi.get() : []), kb: f.kb ? 'yes' : 'no' }); if (r) { Object.assign(f, toRec(r)); fq.touch(); } }),
          del(f.q, 'question', () => { L.splice(i, 1); fq.touch(); }))))
        : [el('p', { class: 'dstate' }, 'No questions yet. Add one to show the FAQ section.')]));
      fq.sync();
    }
    $('fqAdd').addEventListener('click', async () => {
      if (fq.draft.length >= fa.MAX) return notify('Please keep ' + fa.MAX + ' questions or fewer.', 'error');
      const r = await editDialog('Add question', fields(), { q: '', a: '', category: '', kb: 'no' });
      if (r) { fq.draft.push(Object.assign({ id: uid('f'), enabled: true }, toRec(r))); fq.touch(); }
    });
    document.addEventListener('dash:page', e => { if (e.detail === 'faq') { fq.reset(); renderFaq(); } });
    document.addEventListener('dash:closed', () => fa.render());
  }

  /* ---------------------------------------------------------------- Training categories */
  const ta = window.trainingApi;
  if (ta) {
    const tr = makeStore({
      get: () => ta.get(), preview: l => ta.preview(l), pub: 'trPublish', disc: 'trDiscard', state: 'trState', doc: 'training', label: 'Training categories',
      payload: l => ({ items: l }),
      validate: l => l.length > CT.MAX ? 'Please keep ' + CT.MAX + ' categories or fewer.' : new Set(l.map(t => t.id)).size !== l.length ? 'Two categories share the same id. Delete the extra one.' : l.some(t => !t.title.trim()) ? 'Every category needs a title.' : (CT.sizeOf(l) > CT.LIMIT ? 'The training content is too large (usually images). Remove or shrink a few images.' : ''),
      render: () => renderTraining() });
    let editing = null;   // id of the category being edited
    const edited = () => { tr.dirty = true; tr.sync(); };   // keeps the editor open (no re-render) while typing

    const fld = (label, input, help) => el('div', { class: 'fld' }, el('label', { for: input.id }, label), input, help ? el('small', { class: 'hint' }, help) : '');
    const bind = (id, obj, key, tag, max, rows) => {
      const i = el(tag, Object.assign({ id, maxlength: String(max) }, tag === 'input' ? { type: 'text', autocomplete: 'off' } : { rows: String(rows || 4) }));
      i.value = obj[key] || ''; i.addEventListener('input', () => { obj[key] = i.value; edited(); }); return i;
    };
    const TOOL_FIELDS = [
      { key: 'name', label: 'Tool name', required: true, max: 60 },
      { key: 'purpose', label: 'What it is used for (short)', max: 100 },
      { key: 'description', label: 'Description', type: 'textarea', max: 1500, help: 'Blank line = new paragraph. Start a line with “- ” for a bullet. Wrap words in **double asterisks** for bold.' },
      { key: 'tags', label: 'Tags', max: 200, help: 'Separate with commas, for example: Price history, Sales rank.' },
      { key: 'note', label: 'Small-print note', max: 300 },
      { key: 'img1', label: 'Screenshot 1', type: 'image', photo: true, help: 'Resized automatically. Keeps the original proportions.' },
      { key: 'img2', label: 'Screenshot 2', type: 'image', photo: true }];
    const toolVals = t => ({ name: t.name, purpose: t.purpose, description: t.description, tags: t.tags, note: t.note, img1: (t.images[0] || {}).src || '', img2: (t.images[1] || {}).src || '' });
    const applyTool = (t, r) => {
      const keep = {}; t.images.forEach(i => { keep[i.src] = i.alt; });
      Object.assign(t, { name: r.name, purpose: r.purpose || '', description: r.description || '', tags: r.tags || '', note: r.note || '',
        images: [r.img1, r.img2].filter(Boolean).map(s => ({ src: s, alt: keep[s] || r.name + ' screenshot' })) });
    };

    function editor(t) {
      const box = $('trEdit'), tools = el('div', { class: 'mlist' });
      const drawTools = () => {
        tools.replaceChildren(...(t.tools.length ? t.tools.map((x, i) => el('div', { class: 'mrow' },
          x.images[0] ? el('img', { class: 'mthumb', src: x.images[0].src, alt: '', width: '40', height: '40' }) : thumb('', x.name),
          el('div', { class: 'mmain' }, el('strong', {}, x.name), el('small', {}, x.purpose || 'No short description')),
          el('div', { class: 'mctl' }, iconBtn('up', 'Move up', x.name, () => { move(t.tools, i, -1); edited(); drawTools(); }, { disabled: i === 0 }), iconBtn('down', 'Move down', x.name, () => { move(t.tools, i, 1); edited(); drawTools(); }, { disabled: i === t.tools.length - 1 }),
            iconBtn('pencil', 'Edit', x.name, async () => { const r = await editDialog('Edit tool', TOOL_FIELDS, toolVals(x)); if (r) { applyTool(x, r); edited(); drawTools(); } }),
            iconBtn('trash', 'Delete', x.name, async () => { if (await confirmBox('Delete this tool?', '“' + x.name + '” will be removed once you publish.')) { t.tools.splice(i, 1); edited(); drawTools(); } }, { danger: true }))))
          : [el('p', { class: 'dhelp' }, 'No tools added to this category.')]));
      };
      drawTools();
      const addTool = iconBtn('plus', 'Add tool', '', async () => {
        if (t.tools.length >= 12) return notify('You can add up to 12 tools per category.', 'error');
        const r = await editDialog('Add tool', TOOL_FIELDS, { name: '', purpose: '', description: '', tags: '', note: '', img1: '', img2: '' });
        if (r) { const x = { id: uid('tl'), images: [] }; applyTool(x, r); t.tools.push(x); edited(); drawTools(); } }, { primary: true, text: 'Add tool' });
      /* hands-on image */
      const hImg = el('img', { class: 'mthumb', alt: '', width: '40', height: '40' });
      const showImg = () => { hImg.hidden = !t.handsOn.image; if (t.handsOn.image) hImg.src = t.handsOn.image.src; };
      const hFile = el('input', { type: 'file', id: 'tre-himg', accept: 'image/png,image/jpeg,image/webp', 'aria-label': 'Hands-on training image', onchange: async e => {
        const f = e.target.files[0]; if (!f) return;
        try { const src = await toPhoto(f); t.handsOn.image = { src, alt: (t.handsOn.image && t.handsOn.image.alt) || t.title + ' hands-on training' }; showImg(); edited(); } catch (ex) { notify(ex.message, 'error'); e.target.value = ''; } } });
      const hAlt = bind('tre-halt', { v: t.handsOn.image ? t.handsOn.image.alt : '' }, 'v', 'input', 200);
      hAlt.addEventListener('input', () => { if (t.handsOn.image) { t.handsOn.image.alt = hAlt.value; edited(); } });
      showImg();
      box.replaceChildren(el('div', { class: 'dact-row' }, iconBtn('back', 'Back to all categories', '', () => { editing = null; renderTraining(); }, { text: 'Back to all categories' })),
        el('h3', {}, 'Editing: ' + t.title),
        el('div', { class: 'ab' },
          fld('Category title', bind('tre-title', t, 'title', 'input', 80)),
          fld('Card summary (optional)', bind('tre-sum', t, 'summary', 'input', 160), 'One short line on the collapsed card. Left blank, the start of the overview is used.'),
          el('strong', { class: 'ah' }, 'Training overview'),
          fld('Overview', bind('tre-ov', t, 'overview', 'textarea', 2500, 6), 'Blank line = new paragraph. Start a line with “- ” for a bullet.'),
          el('strong', { class: 'ah' }, 'Hands-on training'),
          fld('Hands-on text', bind('tre-ho', t.handsOn, 'text', 'textarea', 2500, 5)),
          el('div', { class: 'fld' }, el('label', { for: 'tre-himg' }, 'Hands-on image (optional)'), el('div', { class: 'imgfield' }, hImg, hFile, el('button', { type: 'button', class: 'dbtn sm', onclick: () => { t.handsOn.image = null; hFile.value = ''; hAlt.value = ''; showImg(); edited(); } }, 'Remove image'))),
          fld('Image description (alt text)', hAlt, 'Describes the image for screen readers and search engines.'),
          el('strong', { class: 'ah' }, 'Tools used'), tools, el('div', { class: 'dact-row' }, addTool),
          el('strong', { class: 'ah' }, 'Toolkit'),
          fld('Toolkit', bind('tre-tk', t, 'toolkit', 'input', 400), 'Separate tool names with commas.'),
          el('strong', { class: 'ah' }, 'How I work'),
          fld('Steps', bind('tre-hw', t, 'howIWork', 'textarea', 1500, 4), 'One step per line, written as: Title | Description. Videos and FAQs assigned to this category appear here automatically.')));
      box.querySelector('#tre-title').addEventListener('input', () => { box.querySelector('h3').textContent = 'Editing: ' + t.title; });
    }


    /* ---- add / copy / delete / restore: draft changes, nothing is live until Publish ---- */
    function addCat() {
      const r = CT.add(tr.draft); if (!r.ok) return notify(r.error, 'error');
      tr.draft.splice(0, tr.draft.length, ...r.list); editing = r.added.id; tr.touch();
      notify('New category added. It stays hidden until you switch it on.', 'success');
    }
    async function copyCat(x) {
      if (CT.room(tr.draft) <= 0) return notify('You can have up to ' + CT.MAX + ' categories. Delete one first.', 'error');
      const fit = CT.copyFits(tr.draft, x.id); let noImages = false;
      if (!fit.full) {
        if (!fit.light) return notify('Even without images the copy would make the training content too large to publish. Remove some content first.', 'error');
        if (!await confirmBox('Copy without images?', 'A full copy would make the training content too large to publish. The copy can be made without images (text and tool names are kept).', 'Copy without images')) return;
        noImages = true;
      }
      const r = CT.copy(tr.draft, x.id, { noImages }); if (!r.ok) return notify(r.error, 'error');
      tr.draft.splice(0, tr.draft.length, ...r.list); tr.touch();
      notify('Copied' + (r.imagesDropped ? ' without images' : '') + '. The copy is hidden until you switch it on.', 'success');
    }
    async function deleteCat(x, videos, faqs) {
      const n = CT.impact(x, videos, faqs), parts = [n.tools + ' tool' + (n.tools === 1 ? '' : 's'), n.images + ' image' + (n.images === 1 ? '' : 's')];
      const links = (n.videos || n.faqs) ? ' ' + n.videos + ' video' + (n.videos === 1 ? '' : 's') + ' and ' + n.faqs + ' FAQ' + (n.faqs === 1 ? '' : 's') + ' are linked to it: they are not deleted, they only stop appearing inside this category.' : '';
      if (!await confirmBox('Delete this category?', '“' + x.title + '” and its content (' + parts.join(', ') + ') will be removed once you publish.' + links + ' Discard changes brings it back until then.')) return;
      tr.draft.splice(0, tr.draft.length, ...CT.remove(tr.draft, x.id)); tr.touch();
    }
    function restoreCats() {
      const r = CT.restore(tr.draft, ta.defaults()); if (!r.added) return notify('Nothing to restore.', 'info');
      tr.draft.splice(0, tr.draft.length, ...r.list); tr.touch(); notify(r.added + ' original categor' + (r.added === 1 ? 'y' : 'ies') + ' restored.' + (r.skipped ? ' ' + r.skipped + ' more did not fit (limit ' + CT.MAX + ').' : ''), 'success');
    }

    function renderTraining() {
      const L = tr.draft, t = editing && L.find(x => x.id === editing);
      $('trList').hidden = !!t; $('trEdit').hidden = !t;
      if (t) { editor(t); tr.sync(); return; }
      editing = null;
      const has = x => ['Overview ' + (x.overview ? '✓' : '–'), 'Hands-on ' + (x.handsOn.text || x.handsOn.image ? '✓' : '–'), 'Tools ' + x.tools.length, 'Toolkit ' + (x.toolkit ? '✓' : '–'), 'How I work ' + (x.howIWork ? '✓' : '–')].join(' · ');
      const videos = window.videosApi ? window.videosApi.get().items : [], faqs = window.faqApi ? window.faqApi.get() : [];
      $('trList').replaceChildren(...(L.length ? L.map((x, i) => el('div', { class: 'mrow' + (x.enabled === false ? ' off' : '') },
        el('span', { class: 'mthumb ph', 'aria-hidden': 'true' }, String(i + 1)),
        el('div', { class: 'mmain' }, el('strong', {}, x.title), el('small', {}, has(x)), x.enabled === false ? el('small', {}, 'Hidden from the site') : ''),
        el('div', { class: 'mctl' }, toggle(x.title, x.enabled !== false, on => { x.enabled = on; tr.touch(); }),
          iconBtn('up', 'Move up', x.title, () => { move(L, i, -1); tr.touch(); }, { disabled: i === 0 }), iconBtn('down', 'Move down', x.title, () => { move(L, i, 1); tr.touch(); }, { disabled: i === L.length - 1 }),
          iconBtn('copy', 'Copy', x.title, () => copyCat(x), { disabled: CT.room(L) <= 0 }),
          iconBtn('pencil', 'Edit', x.title, () => { editing = x.id; renderTraining(); }, { primary: true }),
          iconBtn('trash', 'Delete', x.title, () => deleteCat(x, videos, faqs), { danger: true }))))
        : [el('p', { class: 'dstate' }, 'No categories. The Training section is hidden from the site. Add one, or restore the originals.')]));
      /* toolbar + size meter */
      const full = CT.room(L) <= 0, miss = CT.missingOriginals(L, ta.defaults());
      $('trBar').replaceChildren(
        iconBtn('plus', 'Add category', '', addCat, { primary: true, text: 'Add category', disabled: full }),
        iconBtn('restore', 'Restore original categories', '', restoreCats, { text: 'Restore original categories', disabled: !miss.length || full }),
        el('span', { class: 'dhelp' }, L.length + ' of ' + CT.MAX + ' categories' + (full ? '. Delete one to add another.' : '')));
      const kb = Math.round(CT.sizeOf(L) / 1000), lim = Math.round(CT.LIMIT / 1000), m = $('trMeter');
      m.className = 'dhelp' + (kb > lim * 0.85 ? ' warn' : '');
      m.replaceChildren(el('meter', { min: '0', max: String(lim), value: String(Math.min(kb, lim)), 'aria-label': 'Training content size' }), el('br'), 'Training content size: ' + kb + ' KB of ' + lim + ' KB' + (kb > lim * 0.85 ? '. Almost full: remove or shrink images.' : '.'));
      tr.sync();
    }
    document.addEventListener('dash:page', e => { if (e.detail === 'training') { tr.reset(); editing = null; renderTraining(); } });
    document.addEventListener('dash:closed', () => ta.render());
  }
})();
