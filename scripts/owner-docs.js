/* ==========================================================================
   owner-docs.js - Owner Panel > Documents (CodeFlow 4.5.0, phase D1)
   Private notes and runbooks stored in Firestore ownerDocs/{id}. Only the signed-in owner can read or write them
   (the rules enforce it; the checks here only give friendly messages first). Text is always shown as plain text.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, core = window.ownerDocsCore; if (!kit || !core) return;
  const { el, notify, confirmBox } = kit;
  const $ = id => document.getElementById(id), own = () => window.OWN;
  let rows = [], signed = false, editing = null;   // editing: null = not editing, '' = new, id = existing
  const say = (id, m) => { const n = $(id); if (n) n.textContent = m || ''; };
  const errText = e => (e && e.code === 'permission-denied') ? 'The database refused this (permission denied). Publish the newest firestore.rules.strict, sign in again, then refresh this page.' : 'Something went wrong. Please try again.';
  const fmtDate = t => { const d = t && typeof t.toDate === 'function' ? t.toDate() : null; return d ? d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; };

  async function load() {
    const o = own(), f = o.fs, s = await f.getDocs(f.query(f.collection(o.db, 'ownerDocs')));
    rows = s.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (b.updatedAt && b.updatedAt.toMillis ? b.updatedAt.toMillis() : 0) - (a.updatedAt && a.updatedAt.toMillis ? a.updatedAt.toMillis() : 0));
  }
  function draw() {
    const list = core.filterDocs(rows, $('odSearch').value, $('odCat').value);
    say('odState', rows.length + ' document' + (rows.length === 1 ? '' : 's') + (list.length !== rows.length ? ', ' + list.length + ' shown' : '') + '.');
    $('odList').replaceChildren(...(list.length ? list.map(r => el('div', { class: 'cidrow' },
      el('div', { class: 'cidmain' }, el('strong', {}, r.title || '(no title)'), el('span', { class: 'cidbadge active' }, core.LABELS[r.category] || 'Other'), el('span', { class: 'libmeta' }, 'Updated ' + fmtDate(r.updatedAt))),
      el('div', { class: 'dact-row' },
        kit.iconBtn('eye', 'Open', r.title, () => view(r)),
        kit.iconBtn('pencil', 'Edit', r.title, () => edit(r)),
        kit.iconBtn('trash', 'Delete', r.title, () => remove(r), { danger: true })))) : [el('p', { class: 'dhelp' }, rows.length ? 'No document matches.' : 'No documents yet. Use "New document" above.')]));
  }
  function view(r) {
    $('odViewTitle').textContent = r.title || '';
    $('odViewBody').textContent = r.body || '';   // plain text only, never HTML
    $('odView').hidden = false; $('odView').scrollIntoView({ block: 'nearest' });
    $('odCopy').onclick = async () => { try { await navigator.clipboard.writeText(r.body || ''); notify('Copied', 'success'); } catch (e) { notify('Please copy the text by hand.', 'error'); } };
  }
  function edit(r) {
    editing = r ? r.id : '';
    $('odTitle').value = r ? r.title || '' : ''; $('odCategory').value = r ? r.category || 'notes' : 'notes'; $('odBody').value = r ? r.body || '' : '';
    $('odEditTitle').textContent = r ? 'Edit document' : 'New document'; say('odErr', ''); count();
    $('odEdit').hidden = false; $('odTitle').focus(); $('odEdit').scrollIntoView({ block: 'nearest' });
  }
  function closeEdit() { editing = null; $('odEdit').hidden = true; say('odErr', ''); }
  const count = () => say('odBodyN', $('odBody').value.length + ' / ' + core.MAX_BODY);
  async function save() {
    say('odErr', '');
    const c = core.cleanDoc({ title: $('odTitle').value, category: $('odCategory').value, body: $('odBody').value });
    if (!c.ok) { say('odErr', c.error); return; }
    const o = own(), f = o.fs; $('odSave').disabled = true;
    try {
      if (editing) await f.updateDoc(f.doc(o.db, 'ownerDocs', editing), Object.assign({}, c.doc, { updatedAt: f.serverTimestamp() }));
      else { const t = f.serverTimestamp(); await f.setDoc(f.doc(o.db, 'ownerDocs', core.newId()), Object.assign({}, c.doc, { createdAt: t, updatedAt: t })); }
      notify('Document saved.', 'success'); closeEdit(); await load(); draw();
    } catch (e) { say('odErr', 'Could not save. ' + errText(e)); }
    finally { $('odSave').disabled = false; }
  }
  async function remove(r) {
    if (!(await confirmBox('Delete document', 'Delete "' + r.title + '"? This cannot be undone.', 'Delete'))) return;
    try { const o = own(); await o.fs.deleteDoc(o.fs.doc(o.db, 'ownerDocs', r.id)); notify('Document deleted.', 'success'); if (!$('odView').hidden) $('odView').hidden = true; await load(); draw(); }
    catch (e) { notify('Could not delete. ' + errText(e), 'error'); }
  }
  function importFile(file) {
    say('odErr', ''); if (!file) return;
    if (file.size > 120000) { say('odErr', 'That file is too large (about 50,000 characters at most).'); return; }
    const rd = new FileReader();
    rd.onload = () => { const t = String(rd.result || ''); if (t.length > core.MAX_BODY) { say('odErr', 'The file has more than ' + core.MAX_BODY + ' characters. Split it first.'); return; }
      $('odBody').value = t; if (!$('odTitle').value.trim()) $('odTitle').value = file.name.replace(/\.[^.]+$/, '').slice(0, core.MAX_TITLE); count(); };
    rd.onerror = () => say('odErr', 'The file could not be read.');
    rd.readAsText(file);
  }
  async function show() {
    if (!signed) return;
    say('odState', 'Loading…');
    try { await load(); draw(); } catch (e) { say('odState', 'Could not load the documents. ' + errText(e)); }
  }
  function init() {
    if (!$('odList')) return;
    $('odNew').addEventListener('click', () => edit(null));
    $('odSave').addEventListener('click', save); $('odCancel').addEventListener('click', closeEdit);
    $('odBody').addEventListener('input', count);
    $('odSearch').addEventListener('input', draw); $('odCat').addEventListener('change', draw); $('odRefresh').addEventListener('click', show);
    $('odFile').addEventListener('change', e => { importFile(e.target.files[0]); e.target.value = ''; });
    $('odViewClose').addEventListener('click', () => { $('odView').hidden = true; });
    document.addEventListener('dash:page', e => { if (e.detail === 'ownerdocs') show(); });
    document.addEventListener('own:auth', e => { signed = !!(e.detail && e.detail.ok); rows = []; if (!signed) { $('odList').replaceChildren(); $('odView').hidden = true; $('odBody').value = ''; $('odViewBody').textContent = ''; closeEdit(); say('odState', ''); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
