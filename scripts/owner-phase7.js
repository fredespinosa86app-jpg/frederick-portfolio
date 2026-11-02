/* ==========================================================================
   owner-phase7.js - Owner Panel > capacity-based Hire Me / Contact visibility (Phase 7)
   The open/closed flag is computed from the REAL client records (status Active) and the
   maximum in ownerPrivate/config, then published to content/capacity { open, enforce, msgOn, msg }.
   The Firestore rules read that flag, so a full business also refuses new inquiries server-side.
   Every input (clients, maximum, switch) changes only in this panel, so the flag is always refreshed here.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, CAP = window.capacityApi;
  if (!kit || !CAP) return;
  const { el, notify } = kit, $ = id => document.getElementById(id), own = () => window.OWN;
  let unsubs = [], clients = null, max = null, doc = null, dirty = false, written = null;

  const active = () => clients.filter(c => c && c.status === 'active').length;
  const settings = () => ({ enforce: !doc || doc.enforce !== false, msgOn: !!(doc && doc.msgOn), msg: (doc && typeof doc.msg === 'string' && doc.msg) || CAP.DEFAULT_MSG });
  const isOpen = (enforce, a, m) => !(enforce && m >= 1 && a >= m);
  const ready = () => clients !== null && max !== null && doc !== undefined;
  const stat = (l, n) => el('div', { class: 'stat' }, el('span', { class: 'stat-n' }, String(n)), el('span', { class: 'stat-l' }, l));

  function draw() {
    if (!ready()) return;
    const s = settings(), a = active(), open = isOpen(s.enforce, a, max);
    $('capStats').replaceChildren(stat('Active clients', a), stat('Maximum', max || 'No limit'), stat('Remaining', max ? Math.max(0, max - a) : '-'), stat('Site status', open ? 'Open' : 'Full'));
    if (!dirty) { $('capEnforce').checked = s.enforce; $('capMsgOn').checked = s.msgOn; $('capMsg2').value = s.msg; }
    $('capState').textContent = dirty ? 'Unsaved changes.' : (max ? (open ? 'Visitors can see Hire Me and Contact and send inquiries.' : 'You are at full capacity. Hire Me and Contact are hidden and new inquiries are blocked.') : 'No maximum set, so there is no limit.');
  }
  async function sync() {
    if (!ready() || !own()) return;
    const open = isOpen(settings().enforce, active(), max), cur = doc ? doc.open !== false : true;
    if (open === cur || written === open) return;
    written = open;
    try { const f = own().fs; await f.setDoc(f.doc(own().db, 'content', 'capacity'), { open, updatedAt: Date.now() }, { merge: true }); own().log(open ? 'Capacity available: Hire Me and Contact shown' : 'Capacity reached: Hire Me and Contact hidden'); }
    catch (e) { written = null; }
  }
  const flag = () => { dirty = true; $('capSave').disabled = false; $('capDiscard').disabled = false; draw(); };
  ['capEnforce', 'capMsgOn', 'capMsg2'].forEach(id => { $(id).addEventListener('input', flag); $(id).addEventListener('change', flag); });
  $('capSave').addEventListener('click', async () => {
    if (!own() || !ready()) return notify('Could not save. Please sign in as the owner first.', 'error');
    const enforce = $('capEnforce').checked, msgOn = $('capMsgOn').checked, msg = $('capMsg2').value.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 160);
    if (msgOn && !msg) return notify('Write a message, or untick the option.', 'error');
    $('capSave').disabled = true;
    try {
      const f = own().fs; await f.setDoc(f.doc(own().db, 'content', 'capacity'), { enforce, msgOn, msg: msg || CAP.DEFAULT_MSG, open: isOpen(enforce, active(), max), updatedAt: Date.now() }, { merge: true });
      dirty = false; $('capDiscard').disabled = true; own().log('Capacity settings updated'); notify('Saved.', 'success'); draw();
    } catch (e) { notify('Could not save. ' + (e && e.code === 'permission-denied' ? 'Permission denied. Check your Firestore rules.' : 'Please try again.'), 'error'); $('capSave').disabled = false; }
  });
  $('capDiscard').addEventListener('click', () => { dirty = false; $('capSave').disabled = true; $('capDiscard').disabled = true; draw(); });

  document.addEventListener('own:auth', e => {
    unsubs.forEach(u => u && u()); unsubs = []; clients = null; max = null; doc = undefined; written = null;
    if (!(e.detail && e.detail.ok) || !own()) return;
    const f = own().fs, db = own().db;
    unsubs.push(f.onSnapshot(f.collection(db, 'clients'), snap => { clients = snap.docs.map(d => d.data()); draw(); sync(); }, () => { /* rules not published yet */ }));
    unsubs.push(f.onSnapshot(f.doc(db, 'ownerPrivate', 'config'), s => { max = Math.max(0, Math.round(Number(s.exists() ? s.data().capacity : 0)) || 0); draw(); sync(); }, () => { /* rules not published yet */ }));
    unsubs.push(f.onSnapshot(f.doc(db, 'content', 'capacity'), s => { doc = s.exists() ? s.data() : null; draw(); sync(); }, () => { /* rules not published yet */ }));
  });
})();
