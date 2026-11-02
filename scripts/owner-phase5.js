/* ==========================================================================
   owner-phase5.js - dashboard pages added in Phase 5:
   Chatbot appearance + language filter, Chatbot knowledge base, webhook security review.
   Data: content/chatbot {name, avatar, mod{extra,allow}} and content/chatKb {items[]} (public read, owner write).
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, K = window.ownKit, E = window.chatEngine;
  if (!kit || !K || !E) return;
  const { el, notify, confirmBox } = kit;
  const { makeStore, editDialog, toIcon, ctl, uid, clone, move } = K;
  const $ = id => document.getElementById(id);
  const own = () => window.OWN;
  const errText = e => (e && e.code === 'permission-denied') ? 'Check your Firestore rules (content collection).' : 'Please try again.';

  /* ---------------------------------------------------------------- appearance + filter */
  let saved = E.identity(), draft = clone(saved), dirty = false;
  const lines = a => (a || []).join('\n');
  function fill() { draft = clone(E.identity()); $('ciName').value = draft.name; $('ciExtra').value = lines(draft.mod.extra); $('ciAllow').value = lines(draft.mod.allow); setDirty(false); preview(); }
  function setDirty(v) { dirty = v; $('ciSave').disabled = !v; $('ciDiscard').disabled = !v; $('ciState').textContent = v ? 'Unsaved changes (only the preview above is changed).' : 'Everything is saved.'; }
  function preview() {
    const n = ($('ciName').value.trim() || 'Marcus').slice(0, 30);
    $('cpName').textContent = n + ' - Assistant'; $('cpAv').hidden = !draft.avatar; if (draft.avatar) $('cpAv').src = draft.avatar;
    const b = $('cpBtn'); b.replaceChildren(draft.avatar ? el('img', { src: draft.avatar, alt: '' }) : el('span', {}, '💬'));
    $('cpMsg').textContent = 'Hi! I’m ' + n + ', the automated assistant for Frederick’s portfolio. Ask me about his services, tools, training or how to hire him.';
    $('ciNameN').textContent = $('ciName').value.length + '/30';
  }
  $('ciName').addEventListener('input', () => { draft.name = $('ciName').value; preview(); setDirty(true); });
  ['ciExtra', 'ciAllow'].forEach(id => $(id).addEventListener('input', () => setDirty(true)));
  $('ciFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { draft.avatar = await toIcon(f, true); preview(); setDirty(true); } catch (ex) { notify(ex.message, 'error'); }
    e.target.value = '';
  });
  $('ciRemoveImg').addEventListener('click', () => { draft.avatar = ''; preview(); setDirty(true); });
  $('ciDiscard').addEventListener('click', () => { fill(); notify('Changes discarded.'); });
  $('ciSave').addEventListener('click', async () => {
    const name = $('ciName').value.trim();
    if (!name) return notify('Please enter a name for the assistant.', 'error');
    if (/[<>]/.test(name)) return notify('The name cannot contain < or >.', 'error');
    if (!own()) return notify('Could not save. Please sign in as the owner first.', 'error');
    const data = { name: name.slice(0, 30), avatar: draft.avatar || '', mod: { extra: E.cleanId({ mod: { extra: $('ciExtra').value } }).mod.extra, allow: E.cleanId({ mod: { allow: $('ciAllow').value } }).mod.allow } };
    try { await own().fs.setDoc(own().fs.doc(own().db, 'content', 'chatbot'), Object.assign({ updatedAt: Date.now() }, data)); own().log('Chatbot appearance updated'); notify('Chatbot settings saved. The public chatbot is updated.', 'success'); setDirty(false); }
    catch (e) { notify('Could not save. ' + errText(e), 'error'); }
  });

  /* ---------------------------------------------------------------- knowledge base */
  const kb = makeStore({
    get: () => clone(E.kb()), preview: () => {}, pub: 'kbPublish', disc: 'kbDiscard', state: 'kbState', doc: 'chatKb', label: 'Chatbot knowledge base',
    payload: l => ({ items: l }),
    validate: l => l.some(i => !i.q.trim() || !i.a.trim()) ? 'Every entry needs a question and an answer.' : (l.length > 200 ? 'Please keep 200 entries or fewer.' : ''),
    render: () => renderKb() });
  const open = new Set();
  const fields = () => [
    { key: 'q', label: 'Question', required: true, max: 200 },
    { key: 'a', label: 'Answer', type: 'textarea', required: true, max: 1500, help: 'Plain text. Web addresses become links automatically.' },
    { key: 'alts', label: 'Alternative questions or phrases', type: 'textarea', help: 'One per line, up to 30. Example: “What can you do for me?”' },
    { key: 'category', label: 'Category', max: 30, help: 'For example Services, Pricing, About.' }];
  const toRec = r => ({ q: r.q.trim(), a: r.a.trim(), alts: r.alts.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 30), category: (r.category || '').trim() });
  function renderKb() {
    const L = kb.draft, term = $('kbSearch').value.trim().toLowerCase();
    const shown = L.map((it, i) => [it, i]).filter(([it]) => !term || [it.q, it.a, it.category, (it.alts || []).join(' ')].join(' ').toLowerCase().includes(term));
    $('kbCount').textContent = L.length + ' entr' + (L.length === 1 ? 'y' : 'ies') + (term ? ', ' + shown.length + ' shown' : '');
    $('kbList').replaceChildren(...(shown.length ? shown.map(([it, i]) => el('div', { class: 'mrow kbrow' + (it.enabled === false ? ' off' : '') },
      el('span', { class: 'mthumb ph', 'aria-hidden': 'true' }, '?'),
      el('div', { class: 'mmain' }, el('strong', {}, it.q), el('small', {}, it.a.slice(0, 110) + (it.a.length > 110 ? '…' : '')),
        el('small', {}, [it.category || 'No category', (it.alts || []).length + ' alternative phrase' + ((it.alts || []).length === 1 ? '' : 's'), it.enabled === false ? 'Inactive' : 'Active'].join(' · ')),
        open.has(it.id) ? el('div', { class: 'kbprev' }, el('small', {}, 'Visitor sees:'), el('div', { class: 'kbbubble' }, it.a)) : ''),
      el('div', { class: 'mctl' },
        el('label', { class: 'tog' }, el('input', { type: 'checkbox', checked: it.enabled !== false, 'aria-label': 'Active: ' + it.q, onchange: e => { it.enabled = e.target.checked; kb.touch(); } }), 'Active'),
        ctl(open.has(it.id) ? 'Hide preview' : 'Preview', it.q, () => { open.has(it.id) ? open.delete(it.id) : open.add(it.id); renderKb(); }),
        ctl('Move up', it.q, () => { move(L, i, -1); kb.touch(); }, i === 0), ctl('Move down', it.q, () => { move(L, i, 1); kb.touch(); }, i === L.length - 1),
        ctl('Edit', it.q, async () => { const r = await editDialog('Edit question', fields(), { q: it.q, a: it.a, alts: (it.alts || []).join('\n'), category: it.category || '' }); if (r) { Object.assign(it, toRec(r)); kb.touch(); } }),
        el('button', { type: 'button', class: 'dbtn sm danger', 'aria-label': 'Delete: ' + it.q, onclick: async () => { if (await confirmBox('Delete this entry?', '“' + it.q + '” will be removed once you publish.')) { L.splice(i, 1); kb.touch(); } } }, 'Delete'))))
      : [el('p', { class: 'dstate' }, L.length ? 'No entries match your search.' : 'No entries yet. Add one or restore the predefined answers.')]));
    kb.sync();
  }
  $('kbSearch').addEventListener('input', renderKb);
  $('kbAdd').addEventListener('click', async () => {
    if (kb.draft.length >= 200) return notify('Please keep 200 entries or fewer.', 'error');
    const r = await editDialog('Add question', fields(), { q: '', a: '', alts: '', category: '' });
    if (r) { kb.draft.push(Object.assign({ id: uid('kb'), enabled: true }, toRec(r))); kb.touch(); }
  });
  $('kbDefaults').addEventListener('click', async () => {
    if (!await confirmBox('Restore predefined answers?', 'Birthday, “Is this a scam?” and greeting answers are added back (existing entries with the same id are replaced by the originals).', 'Restore')) return;
    E.DEFAULT_KB.forEach(d => { const i = kb.draft.findIndex(x => x.id === d.id); const c = clone(d); if (i >= 0) kb.draft[i] = c; else kb.draft.unshift(c); }); kb.touch();
  });
  $('kbTestBtn').addEventListener('click', () => {
    const q = $('kbTest').value.trim(), out = $('kbTestOut'); if (!q) { out.textContent = 'Type a question first.'; return; }
    const m = E.matchKb(q, kb.draft);
    out.textContent = m ? 'Match: “' + m.item.q + '” (similarity ' + Math.round(m.score * 100) + '%). The chatbot answers: ' + m.item.a.slice(0, 160) + (m.item.a.length > 160 ? '…' : '')
      : 'No reliable match. The chatbot would use its built-in answers, then your webhook (if on), then the polite fallback. It never invents an answer.';
    out.className = 'dstate-line ' + (m ? 'ok' : 'warn');
  });
  $('kbTest').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('kbTestBtn').click(); } });

  /* ---------------------------------------------------------------- webhook security review */
  function secReview() {
    const u = ($('hookUrl').value || '').trim(), on = $('hookOn').checked, list = $('hookSecList'), st = $('hookSecState');
    let host = ''; try { host = new URL(u).hostname; } catch (e) { /* not a URL */ }
    const proxy = /\.workers\.dev$/.test(host) || /^chat\./.test(host);
    const items = [];
    items.push([true, 'No passwords, API keys or tokens are in the website code (the Firebase web key is public by design and protected by the database rules).']);
    items.push([true, 'Visitor messages are length-limited (300 characters), rate-limited in the page (6 per minute), checked by the language filter first, and sent one at a time.']);
    items.push([true, 'The chatbot only reads public site content. Client records, rates, visitor logs and settings are readable by the owner account only.']);
    if (!u) { st.textContent = 'No webhook is set: nothing is exposed.'; st.className = 'dstate-line ok'; }
    else if (proxy) { items.push([true, 'The saved address looks like a proxy (' + host + '). The real webhook URL stays private in the proxy’s secrets.']); st.textContent = 'Looks protected, as long as the proxy’s ALLOWED_ORIGINS is set.'; st.className = 'dstate-line ok'; }
    else { items.push([false, 'The saved address (' + host + ') is stored in a public document and sent to every visitor’s browser. Anyone can read it and call it directly (spam, usage costs, fake leads). Setting a secret header would not help because it would be public too.']);
      items.push([false, 'Fix: deploy the included proxy (server folder), paste the proxy address here, then replace the old webhook URL in n8n/Make so the old address stops working.']);
      st.textContent = on ? 'Webhook is active and its address is publicly readable.' : 'Webhook address is saved and publicly readable even though it is switched off.'; st.className = 'dstate-line warn'; }
    list.replaceChildren(...items.map(([ok, t]) => el('li', { class: ok ? 'ok' : 'bad' }, el('span', { 'aria-hidden': 'true' }, ok ? '✓ ' : '✕ '), t)));
  }
  ['input', 'change'].forEach(ev => { $('hookUrl').addEventListener(ev, secReview); $('hookOn').addEventListener(ev, secReview); });

  document.addEventListener('dash:page', e => { if (e.detail === 'chatid') fill(); if (e.detail === 'chatkb') { kb.reset(); renderKb(); } if (e.detail === 'marcus') setTimeout(secReview, 50); });
  E.onChange(() => { if (!dirty && !$('dp-chatid').hidden) fill(); });
})();
