/* ==========================================================================
   owner-wtsched.js - Owner Panel > WorkTrack > Break schedules (CodeFlow 4.5.0, phase W5b)
   Sets the allowed minutes per break for 'default' and for each ACTIVE Client ID. Display and reminders only: nothing here touches a punch.
     workSchedules/{default | ClientID}  { fb, lu, lb, pfb, plu, plb, rev, updatedAt }   (rules: owner only; ID must be 'default' or a registry client)
   A save is ONE transaction: it re-reads the document, keeps the replaced values as pfb/plu/plb, bumps rev, and stamps the database time,
   so a break that started before the edit keeps its old limit (the edit applies from the next break).
   The list is read once when the WorkTrack page opens (default + registry clients, UI shows 50 at a time with a search box).
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, sch = window.coreWtSched; if (!kit || !sch) return;
  const { el, notify } = kit, $ = id => document.getElementById(id), own = () => window.OWN;
  const PAGE = 50, FIELDS = [['fb', 'First break'], ['lu', 'Lunch'], ['lb', 'Last break']];
  let signed = false, docs = {}, loaded = false, err = '', shown = PAGE, query = '', drafts = {}, busy = '', rmArm = '', rmT = 0;
  const say = (id, m) => { const n = $(id); if (n) n.textContent = m || ''; };
  const errText = e => (e && e.code === 'permission-denied') ? 'The database refused this. Publish the newest firestore.rules.strict (it now includes break schedules), sign in again, then reload.' : (e && (e.code === 'unavailable' || /offline|network/i.test(String(e.message)))) ? 'No connection to the database. Nothing was saved.' : 'Please reload this page and try again.';
  const ref = id => { const o = own(); return o.fs.doc(o.db, 'workSchedules', id); };
  const inForce = id => {                 // values a Client ID would use right now if it had no own schedule
    const d = sch.clean(docs.default); return d ? { fb: d.fb, lu: d.lu, lb: d.lb } : { fb: sch.BUILTIN.fb, lu: sch.BUILTIN.lu, lb: sch.BUILTIN.lb };
  };
  const rowMsg = (id, t) => { const n = document.querySelector('.wsrow[data-id="' + id + '"] .ferr'); if (n) n.textContent = t; };
  const api = () => window.wtApi;
  const ids = () => ['default'].concat((api() ? api().registry() : []).filter(r => r.status === 'active').map(r => r.id).sort());

  async function loadList() {
    if (!signed) return; say('wsState', 'Loading…'); err = '';
    try { const o = own(), f = o.fs, q = await f.getDocs(f.collection(o.db, 'workSchedules')); docs = {}; q.docs.forEach(d => { docs[d.id] = d.data(); }); loaded = true; say('wsState', ''); }
    catch (e) { err = errText(e); say('wsState', ''); loaded = false; }
    render();
  }

  function rowFor(id) {
    const mine = sch.clean(docs[id]), base = mine || inForce(id), dr = drafts[id] || {};
    const row = el('div', { class: 'wsrow', 'data-id': id });
    const head = el('div', { class: 'wshead' }, el('strong', { class: id === 'default' ? '' : 'cidid' }, id === 'default' ? 'Default' : id),
      el('span', { class: 'libmeta' }, mine ? 'Own schedule · version ' + mine.rev + ' · saved ' + new Date(mine.updatedAtMs).toLocaleString('en-GB', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : (id === 'default' ? 'Not set: built-in 15 / 60 / 15 is used' : 'No own schedule: uses ' + (sch.clean(docs.default) ? 'the Default' : 'the built-in 15 / 60 / 15'))));
    const inputs = {}, fl = el('div', { class: 'wsfields' });
    FIELDS.forEach(([k, label]) => {
      const inp = el('input', { type: 'text', inputmode: 'numeric', maxlength: 3, autocomplete: 'off', 'aria-label': label + ' minutes for ' + (id === 'default' ? 'the Default schedule' : id) + ', 0 = no limit', value: dr[k] != null ? dr[k] : String(base[k]) });
      inp.addEventListener('input', () => { (drafts[id] = drafts[id] || {})[k] = inp.value; });
      inputs[k] = inp; fl.append(el('label', { class: 'fld wsf' }, label + ' (min)', inp));
    });
    const msg = el('p', { class: 'ferr', role: 'alert' });
    const save = el('button', { type: 'button', class: 'dbtn primary' }, 'Save'); save.disabled = !!busy;
    save.addEventListener('click', () => doSave(id, inputs, msg));
    const acts = el('div', { class: 'ab' }, save);
    if (mine) { const rm = el('button', { type: 'button', class: 'dbtn' }, rmArm === id ? 'Confirm remove' : 'Remove'); rm.disabled = !!busy; rm.addEventListener('click', () => doRemove(id, msg)); acts.append(rm); }
    row.append(head, fl, el('p', { class: 'libmeta' }, '0 = no limit, never late. Whole minutes, 0 to ' + sch.MAX_MIN + '.'), msg, acts);
    return row;
  }

  function render() {
    const box = $('wsRows'); if (!box) return;
    if (!signed) { box.replaceChildren(); say('wsCount', ''); say('wsForce', ''); return; }
    say('wsErr', err);
    const f = query.trim().toUpperCase(), all = ids(), list = all.filter(i => i === 'default' || !f || i.includes(f));
    const clients = list.filter(i => i !== 'default'), vis = clients.slice(0, shown);
    box.replaceChildren(...(f && !'DEFAULT'.includes(f) ? [] : (all.includes('default') ? [rowFor('default')] : [])), ...vis.map(rowFor));
    const totalClients = all.length - 1;
    say('wsCount', totalClients ? 'Showing ' + vis.length + ' of ' + clients.length + ' client' + (clients.length === 1 ? '' : 's') + (f ? ' matching "' + query.trim() + '"' : '') + (clients.length !== totalClients ? ' (' + totalClients + ' active in total)' : '') + '.' : 'No active Client IDs yet. Add them on the Client IDs page.');
    $('wsMore').hidden = clients.length <= shown;
    const a = api(), bi = a && a.breakInfo ? a.breakInfo() : null, st = a && a.state();
    say('wsForce', st && st.state !== 'NOT_STARTED' ? (bi && bi.src ? 'In force for your current break: ' + bi.src + '.' : 'In force now: ' + (function () { const cid = sch.scheduleClient(a.assign()), p = sch.pick(a.assign(), a.schedDocs()); return p.source === 'client' ? 'schedule of ' + cid : p.source === 'default' ? (cid ? cid + ' has no own schedule, so the Default' : 'the Default') : 'the built-in 15 / 60 / 15'; })() + '.') : 'Not clocked in: the schedule is picked from the first client on the session when you clock in.');
    const fk = $('wsFlick'); if (fk) fk.checked = !a || a.flicker();
  }

  async function doSave(id, inputs, msg) {
    msg.textContent = ''; if (busy) return; if (navigator.onLine === false) { msg.textContent = 'You are offline. Nothing was saved.'; return; }
    const v = {}; for (const [k, label] of FIELDS) { const r = sch.parseMinutes(inputs[k].value); if (!r.ok) { msg.textContent = label + ': ' + r.error; return; } v[k] = r.value; }
    const o = own(), f = o.fs; busy = id; render();
    try {
      let result = 'saved';
      await f.runTransaction(o.db, async tx => {
        const snap = await tx.get(ref(id)), cur = snap.exists() ? sch.clean(snap.data()) : null;
        if (snap.exists() && !cur) throw new Error('refused:The saved schedule is damaged. Remove it and save again.');
        if (cur) {
          if (cur.fb === v.fb && cur.lu === v.lu && cur.lb === v.lb) { result = 'same'; return; }
          tx.set(ref(id), { fb: v.fb, lu: v.lu, lb: v.lb, pfb: cur.fb, plu: cur.lu, plb: cur.lb, rev: cur.rev + 1, updatedAt: f.serverTimestamp() });
        } else {
          let prev = inForce(id);
          if (id !== 'default') { const d = await tx.get(ref('default')); const c = d.exists() ? sch.clean(d.data()) : null; prev = c ? { fb: c.fb, lu: c.lu, lb: c.lb } : { fb: sch.BUILTIN.fb, lu: sch.BUILTIN.lu, lb: sch.BUILTIN.lb }; }
          else prev = { fb: sch.BUILTIN.fb, lu: sch.BUILTIN.lu, lb: sch.BUILTIN.lb };
          tx.set(ref(id), { fb: v.fb, lu: v.lu, lb: v.lb, pfb: prev.fb, plu: prev.lu, plb: prev.lb, rev: 1, updatedAt: f.serverTimestamp() });
        }
      });
      delete drafts[id]; busy = '';
      if (result === 'same') { render(); rowMsg(id, 'No change: these are already the saved minutes.'); return; }
      await loadList(); document.dispatchEvent(new Event('wt:schedchanged')); notify('Break schedule saved. It applies from your next break.', 'success');
    } catch (e) {
      busy = ''; const m = String(e && e.message || '');
      err = ''; render(); rowMsg(id, m.startsWith('refused:') ? m.slice(8) : errText(e));
    }
  }
  function doRemove(id, msg) {
    msg.textContent = ''; if (busy) return;
    if (rmArm !== id) { rmArm = id; clearTimeout(rmT); rmT = setTimeout(() => { rmArm = ''; render(); }, 5000); render(); return; }
    clearTimeout(rmT); rmArm = ''; busy = id; render();
    const o = own(), f = o.fs;
    f.deleteDoc(ref(id)).then(async () => { busy = ''; delete drafts[id]; await loadList(); document.dispatchEvent(new Event('wt:schedchanged')); notify('Schedule removed.', 'success'); })
      .catch(e => { busy = ''; render(); rowMsg(id, errText(e)); });
  }

  function init() {
    $('wsSearch').addEventListener('input', e => { query = e.target.value; shown = PAGE; render(); });
    $('wsMore').addEventListener('click', () => { shown += PAGE; render(); });
    $('wsReload').addEventListener('click', loadList);
    $('wsFlick').addEventListener('change', e => { try { localStorage.setItem('wtFlicker:v1', e.target.checked ? '1' : '0'); } catch (x) { /* private mode: this visit only */ } document.dispatchEvent(new Event('wt:changed')); });
    document.addEventListener('dash:page', e => { if (e.detail === 'worktrack') loadList(); });
    document.addEventListener('wt:changed', () => { const a = document.activeElement; if (signed && loaded && !(a && a.closest && a.closest('#wsRows'))) render(); });   // never rebuild the rows while you are typing in one
    document.addEventListener('own:auth', e => { signed = !!(e.detail && e.detail.ok); docs = {}; loaded = false; err = ''; drafts = {}; query = ''; shown = PAGE; busy = ''; rmArm = ''; clearTimeout(rmT); const s = $('wsSearch'); if (s) s.value = ''; say('wsState', ''); say('wsErr', ''); render(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
