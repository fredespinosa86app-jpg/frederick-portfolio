/* ==========================================================================
   owner-phase6.js - Owner Panel > Service forms (Phase 6)
   Draft -> preview -> publish like Services and Toolkit. Saved to content/serviceForms.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, K = window.ownKit, SF = window.serviceFormsApi, CB = window.coreBooking;
  if (!kit || !K || !SF || !CB) return;
  const { el, notify, confirmBox } = kit;
  const { makeStore, editDialog, ctl, uid, clone, move } = K;
  const $ = id => document.getElementById(id);

  const sf = makeStore({
    get: () => clone(SF.get().forms), meta: { get: () => ({ enabled: SF.get().enabled, booking: clone(SF.get().booking), services: clone(SF.get().services) }) },
    preview: () => {}, pub: 'sfPublish', disc: 'sfDiscard', state: 'sfState', doc: 'serviceForms', label: 'Service forms',
    payload: (l, m) => ({ enabled: !!m.enabled, services: m.services, forms: l, booking: CB.clean(m.booking) }),
    validate: l => {
      const bk = sf.draftM.booking || {};
      if (bk.mode === 'embed' && !CB.clean(bk).url) return 'Paste a valid calendar embed code or link from an approved provider, or switch back to the built-in form.';
      const names = new Set(sf.draftM.services.map(s => s.id)), active = {};
      for (const f of l) {
        if (!f.name.trim()) return 'Every form needs a name.';
        if (!names.has(f.serviceId)) return '“' + f.name + '” is not linked to an existing service.';
        if (f.active) { if (!f.fields.length) return '“' + f.name + '” is active but has no questions.'; if (active[f.serviceId]) return 'Only one form can be active for each service (“' + f.name + '” and “' + active[f.serviceId] + '”).'; active[f.serviceId] = f.name; }
        if (f.fields.some(q => !q.label.trim() || (SF.HAS_OPTS.has(q.type) && !q.options.length))) return '“' + f.name + '”: every question needs a label, and choice questions need options.';
      }
      return sf.draftM.services.length ? '' : 'Add at least one service option.';
    },
    render: () => render() });
  let editing = null; const open = new Set();
  const svcName = id => (sf.draftM.services.find(s => s.id === id) || { name: '(missing service)' }).name;
  const typeLabel = t => (SF.TYPES.find(x => x[0] === t) || [0, t])[1];

  /* ---- booking method (built-in form or outside calendar) ---- */
  let bkRaw = '';
  function renderBooking() {
    const b = sf.draftM.booking || (sf.draftM.booking = { mode: 'native', url: '' }), emb = b.mode === 'embed';
    $('bkNative').checked = !emb; $('bkEmbed').checked = emb; $('bkEmbedBox').hidden = !emb;
    const code = $('bkCode'); if (document.activeElement !== code) { bkRaw = b.url || bkRaw; code.value = bkRaw; }
    const r = emb ? CB.parse(bkRaw) : null, info = $('bkInfo'), pv = $('bkPrev'); pv.replaceChildren();
    if (!emb) { info.textContent = ''; return; }
    if (!bkRaw.trim()) info.textContent = 'Nothing pasted yet.';
    else if (!r.ok) info.textContent = r.error;
    else {
      info.textContent = 'Detected: ' + r.name + '. The built-in form will be hidden once you publish.';
      const f = el('iframe', { src: r.url, title: 'Calendar preview', loading: 'lazy', referrerpolicy: 'no-referrer', class: 'mEmbedFrame', sandbox: 'allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation' });
      pv.append(f);
    }
  }
  function setBooking(mode, raw) {
    bkRaw = raw;
    const r = mode === 'embed' ? CB.parse(raw) : null;
    sf.draftM.booking = { mode, url: r && r.ok ? r.url : '' }; sf.touch();
  }
  $('bkNative').addEventListener('change', () => setBooking('native', bkRaw));
  $('bkEmbed').addEventListener('change', () => setBooking('embed', bkRaw));
  $('bkCode').addEventListener('input', e => setBooking('embed', e.target.value));
  $('bkCode').addEventListener('blur', () => { const r = CB.parse(bkRaw); if (r.ok) { bkRaw = r.url; $('bkCode').value = r.url; } });

  function renderServices() {
    const S = sf.draftM.services; $('sfEnabled').checked = !!sf.draftM.enabled;
    $('sfSvcList').replaceChildren(...(S.length ? S.map((s, i) => el('div', { class: 'mrow' },
      el('span', { class: 'mthumb ph', 'aria-hidden': 'true' }, s.name.charAt(0).toUpperCase()),
      el('div', { class: 'mmain' }, el('strong', {}, s.name), el('small', {}, sf.draft.filter(f => f.serviceId === s.id).length + ' form(s)')),
      el('div', { class: 'mctl' }, ctl('Move up', s.name, () => { move(S, i, -1); sf.touch(); }, i === 0), ctl('Move down', s.name, () => { move(S, i, 1); sf.touch(); }, i === S.length - 1),
        ctl('Rename', s.name, async () => { const r = await editDialog('Rename service', [{ key: 'name', label: 'Service name', required: true, max: 60 }], s); if (r) { s.name = r.name.trim(); sf.touch(); } }),
        el('button', { type: 'button', class: 'dbtn sm danger', 'aria-label': 'Delete: ' + s.name, onclick: async () => {
          if (sf.draft.some(f => f.serviceId === s.id)) return notify('Delete or move this service’s forms first.', 'warning');
          if (await confirmBox('Delete this service option?', '“' + s.name + '” will be removed from the dropdown once you publish.')) { S.splice(i, 1); sf.touch(); } } }, 'Delete'))))
      : [el('p', { class: 'dstate' }, 'No services yet. Add one to use this feature.')]));
  }
  function renderForms() {
    const L = sf.draft;
    $('sfList').replaceChildren(...(L.length ? L.map((f, i) => el('div', { class: 'mrow' + (f.active ? '' : ' off') },
      el('span', { class: 'mthumb ph', 'aria-hidden': 'true' }, 'F'),
      el('div', { class: 'mmain' }, el('strong', {}, f.name), el('small', {}, svcName(f.serviceId) + ' · ' + f.fields.length + ' question' + (f.fields.length === 1 ? '' : 's') + ' · ' + (f.active ? 'Active' : 'Inactive')),
        open.has(f.id) ? previewBox(f) : ''),
      el('div', { class: 'mctl' },
        el('label', { class: 'tog' }, el('input', { type: 'checkbox', checked: f.active, 'aria-label': 'Active: ' + f.name, onchange: async e => {
          if (e.target.checked) { const other = L.find(x => x !== f && x.active && x.serviceId === f.serviceId); if (other) { if (!await confirmBox('Replace the active form?', '“' + other.name + '” is currently active for this service. Activating “' + f.name + '” will deactivate it.', 'Replace')) { e.target.checked = false; return; } other.active = false; } }
          f.active = e.target.checked; sf.touch(); } }), 'Active'),
        ctl(open.has(f.id) ? 'Hide preview' : 'Preview', f.name, () => { open.has(f.id) ? open.delete(f.id) : open.add(f.id); renderForms(); }),
        ctl('Edit', f.name, () => startEdit(f)),
        ctl('Move up', f.name, () => { move(L, i, -1); sf.touch(); }, i === 0), ctl('Move down', f.name, () => { move(L, i, 1); sf.touch(); }, i === L.length - 1),
        el('button', { type: 'button', class: 'dbtn sm danger', 'aria-label': 'Delete: ' + f.name, onclick: async () => {
          if (await confirmBox('Delete this form?', '“' + f.name + '” will be removed once you publish. Inquiries already received keep their answers.')) { L.splice(i, 1); sf.touch(); } } }, 'Delete'))))
      : [el('p', { class: 'dstate' }, 'No service forms yet. Add one to ask service-specific questions.')]));
  }
  function previewBox(f) {
    const box = el('div', { class: 'sfprev' }, el('small', {}, 'Preview only. Nothing is sent.'));
    const d = el('div', { class: 'mform sfp' }); box.append(d);
    if (!f.fields.length) { d.append(el('p', { class: 'dhelp' }, 'This form has no questions yet.')); return box; }
    const h = SF.render(d, SF.clean({ services: [{ id: f.serviceId || 'x', name: 'x' }], forms: [Object.assign({}, f, { active: true })] }).forms[0] || f, 'pv' + f.id);
    box.append(el('button', { type: 'button', class: 'dbtn sm', onclick: () => { const r = h.validate(); notify(r.ok ? 'Looks good: ' + r.answers.length + ' answer(s) would be saved.' : r.error, r.ok ? 'success' : 'warning'); } }, 'Check validation'));
    return box;
  }
  function render() { renderBooking(); renderServices(); if (editing) { renderQuestions(); sf.sync(); } else { renderForms(); sf.sync(); } }

  /* ---- form editor ---- */
  const qFields = () => [
    { key: 'label', label: 'Question', required: true, max: 160 },
    { key: 'type', label: 'Field type', type: 'select', options: SF.TYPES.map(t => ({ value: t[0], label: t[1] })) },
    { key: 'options', label: 'Options (dropdown, radio buttons, checkboxes)', type: 'textarea', help: 'One per line, up to ' + SF.MAX.options + '. Ignored for other field types.' },
    { key: 'required', label: 'This question is required', type: 'check' }];
  const toQ = r => ({ label: r.label.trim(), type: r.type, required: !!r.required, options: SF.HAS_OPTS.has(r.type) ? r.options.split('\n').map(x => x.trim()).filter(Boolean).slice(0, SF.MAX.options) : [] });
  const qCheck = r => (SF.HAS_OPTS.has(r.type) && !r.options.split('\n').some(x => x.trim())) ? 'Add at least one option for this field type.' : '';
  function startEdit(f) {
    editing = f; $('sfListView').hidden = true; const box = $('sfEdit'); box.hidden = false;
    const name = el('input', { type: 'text', id: 'sfeName', maxlength: 100, value: f.name }), desc = el('textarea', { id: 'sfeDesc', rows: 2, maxlength: 400 }), sel = el('select', { id: 'sfeSvc' });
    desc.value = f.description; sf.draftM.services.forEach(s => sel.append(el('option', { value: s.id, selected: s.id === f.serviceId }, s.name)));
    name.addEventListener('input', () => { f.name = name.value; sf.touch(); }); desc.addEventListener('input', () => { f.description = desc.value; sf.touch(); });
    sel.addEventListener('change', () => { f.serviceId = sel.value; sf.touch(); });
    box.replaceChildren(el('h2', {}, 'Edit form'),
      el('label', { class: 'fld' }, 'Form name', name), el('label', { class: 'fld' }, 'Associated service', sel), el('label', { class: 'fld' }, 'Description (shown above the questions)', desc),
      el('div', { class: 'dact-row' }, el('button', { type: 'button', class: 'dbtn primary', onclick: async () => {
        const r = await editDialog('Add question', qFields(), { label: '', type: 'text', options: '', required: false }, qCheck);
        if (r) { if (f.fields.length >= SF.MAX.fields) return notify('Please keep ' + SF.MAX.fields + ' questions or fewer.', 'error'); f.fields.push(Object.assign({ id: uid('q') }, toQ(r))); sf.touch(); } } }, 'Add question'),
        el('button', { type: 'button', class: 'dbtn', onclick: endEdit }, 'Done editing')),
      el('div', { class: 'mlist', id: 'sfQList' }), el('h3', {}, 'Preview'), el('div', { id: 'sfEPrev' }));
    renderQuestions(); name.focus();
  }
  function endEdit() { editing = null; $('sfEdit').hidden = true; $('sfListView').hidden = false; render(); }
  function renderQuestions() {
    const f = editing, L = f.fields;
    $('sfQList').replaceChildren(...(L.length ? L.map((q, i) => el('div', { class: 'mrow' },
      el('span', { class: 'mthumb ph', 'aria-hidden': 'true' }, String(i + 1)),
      el('div', { class: 'mmain' }, el('strong', {}, q.label), el('small', {}, typeLabel(q.type) + (q.options.length ? ': ' + q.options.join(', ') : '') + ' · ' + (q.required ? 'Required' : 'Optional'))),
      el('div', { class: 'mctl' }, el('label', { class: 'tog' }, el('input', { type: 'checkbox', checked: q.required, 'aria-label': 'Required: ' + q.label, onchange: e => { q.required = e.target.checked; sf.touch(); } }), 'Required'),
        ctl('Move up', q.label, () => { move(L, i, -1); sf.touch(); }, i === 0), ctl('Move down', q.label, () => { move(L, i, 1); sf.touch(); }, i === L.length - 1),
        ctl('Edit', q.label, async () => { const r = await editDialog('Edit question', qFields(), Object.assign({}, q, { options: q.options.join('\n') }), qCheck); if (r) { Object.assign(q, toQ(r)); sf.touch(); } }),
        el('button', { type: 'button', class: 'dbtn sm danger', 'aria-label': 'Delete: ' + q.label, onclick: async () => { if (await confirmBox('Delete this question?', '“' + q.label + '” will be removed from the form.')) { L.splice(i, 1); sf.touch(); } } }, 'Delete'))))
      : [el('p', { class: 'dstate' }, 'No questions yet. Add the first one.')]));
    const pv = $('sfEPrev'); pv.replaceChildren(); if (L.length) pv.append(previewBox(f));
  }

  $('sfEnabled').addEventListener('change', e => { sf.draftM.enabled = e.target.checked; sf.touch(); });
  $('sfSvcAdd').addEventListener('click', async () => {
    if (sf.draftM.services.length >= SF.MAX.services) return notify('Please keep ' + SF.MAX.services + ' services or fewer.', 'error');
    const r = await editDialog('Add service', [{ key: 'name', label: 'Service name', required: true, max: 60 }], { name: '' });
    if (r) { sf.draftM.services.push({ id: uid('svc'), name: r.name.trim() }); sf.touch(); }
  });
  $('sfFormAdd').addEventListener('click', () => {
    if (sf.draft.length >= SF.MAX.forms) return notify('Please keep ' + SF.MAX.forms + ' forms or fewer.', 'error');
    if (!sf.draftM.services.length) return notify('Add a service option first.', 'warning');
    const f = { id: uid('form'), name: 'New form', serviceId: sf.draftM.services[0].id, description: '', active: false, fields: [] };
    sf.draft.push(f); sf.touch(); startEdit(f);
  });
  document.addEventListener('dash:page', e => { if (e.detail === 'svcforms') { if (editing) endEdit(); sf.reset(); if (!sf.dirty) bkRaw = ''; render(); } });
  document.addEventListener('dash:closed', () => { editing = null; });
})();
