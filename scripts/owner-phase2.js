/* ==========================================================================
   owner-phase2.js - dashboard pages added in Phase 2:
   Experience, Availability / rates / capacity, Clients & invoices, and the busy-slot sync.
   Public data  -> content/experience, content/availability, content/busy, content/rates
   Private data -> ownerPrivate/config (capacity, all rates) and clients/{id}; both owner-only in the rules.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, K = window.ownKit, av = window.availApi, ex = window.experienceApi;
  if (!kit || !K || !av) return;
  const { el, notify, confirmBox } = kit;
  const { makeStore, editDialog, thumb, ctl, toggle, uid, move } = K;
  const $ = id => document.getElementById(id);
  const own = () => window.OWN;
  let ownerOk = false;
  const fmtErr = e => (e && e.code === 'permission-denied') ? 'Permission denied. Publish the updated Firestore rules from the README first.' : 'Please try again.';
  const del = (name, what, fn) => el('button', { type: 'button', class: 'dbtn sm danger', 'aria-label': 'Delete: ' + name, onclick: async () => { if (await confirmBox('Delete this ' + what + '?', '“' + name + '” will be permanently removed.')) fn(); } }, 'Delete');

  /* ---------------------------------------------------------------- Experience */
  if (ex) {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const ml = v => /^\d{4}-\d{2}$/.test(v || '') ? MONTHS[+v.slice(5) - 1] + ' ' + v.slice(0, 4) : '';
    const xs = makeStore({
      get: () => ex.get(), preview: d => ex.preview(d), pub: 'exPublish', disc: 'exDiscard', state: 'exState', doc: 'experience', label: 'Experience',
      payload: d => ({ enabled: !!d.enabled, items: d.items }),
      validate: d => d.items.some(i => !i.company.trim() || !i.title.trim() || !i.start) ? 'Every entry needs a company, a job title and a start date.' : (d.items.length > ex.MAX ? 'Please keep ' + ex.MAX + ' entries or fewer.' : ''),
      render: () => renderEx() });
    const fields = () => [
      { key: 'company', label: 'Company', required: true, max: 80 },
      { key: 'title', label: 'Job title', required: true, max: 80 },
      { key: 'type', label: 'Employment type', type: 'select', options: ex.TYPES.map(t => ({ value: t, label: t })) },
      { key: 'start', label: 'Start date', type: 'month', required: true },
      { key: 'end', label: 'End date', type: 'month', help: 'Leave empty if this is your current role.' },
      { key: 'current', label: 'I currently work here', type: 'check' },
      { key: 'description', label: 'Description', type: 'textarea', max: 600 },
      { key: 'responsibilities', label: 'Responsibilities and achievements', type: 'textarea', max: 1500, help: 'One item per line.' }];
    const check = r => /^\d{4}-\d{2}$/.test(r.start) ? (r.end && !r.current && r.end < r.start ? 'The end date cannot be before the start date.' : '') : 'Please choose a start date.';
    function renderEx() {
      const D = xs.draft, L = D.items; $('exEnabled').checked = !!D.enabled;
      $('exList').replaceChildren(...(L.length ? L.map((x, i) => el('div', { class: 'mrow' + (x.enabled === false ? ' off' : '') },
        thumb('', x.company),
        el('div', { class: 'mmain' }, el('strong', {}, x.title + ' · ' + x.company), el('small', {}, [x.type, ml(x.start) + ' – ' + (x.current || !x.end ? 'Present' : ml(x.end))].join(' · '))),
        el('div', { class: 'mctl' }, toggle(x.company, x.enabled !== false, v => { x.enabled = v; xs.touch(); }),
          ctl('Move up', x.company, () => { move(L, i, -1); xs.touch(); }, i === 0), ctl('Move down', x.company, () => { move(L, i, 1); xs.touch(); }, i === L.length - 1),
          ctl('Edit', x.company, async () => { const r = await editDialog('Edit experience', fields(), x, check); if (r) { Object.assign(x, r, { end: r.current ? '' : r.end }); xs.touch(); } }),
          del(x.company, 'entry', () => { L.splice(i, 1); xs.touch(); }))))
        : [el('p', { class: 'dstate' }, 'No experience entries yet.')]));
      xs.sync();
    }
    $('exEnabled').addEventListener('change', e => { xs.draft.enabled = e.target.checked; xs.touch(); });
    $('exAdd').addEventListener('click', async () => {
      if (xs.draft.items.length >= ex.MAX) return notify('Please keep ' + ex.MAX + ' entries or fewer.', 'error');
      const r = await editDialog('Add experience', fields(), { company: '', title: '', type: ex.TYPES[0], start: '', end: '', current: false, description: '', responsibilities: '' }, check);
      if (r) { xs.draft.items.push(Object.assign({ id: uid('x'), enabled: true }, r, { end: r.current ? '' : r.end })); xs.touch(); }
    });
    document.addEventListener('dash:page', e => { if (e.detail === 'experience') { xs.reset(); renderEx(); } });
    document.addEventListener('dash:closed', () => ex.render());
  }

  /* ---------------------------------------------------------------- Clients (private) */
  const today = () => av.today(av.cfg().tz);
  let clients = [], priv = { capacity: 0, currency: 'USD', hourly: null, monthly: null, showHourly: false, showMonthly: false };
  const active = () => clients.filter(c => c.status === 'active').length;
  const dueState = c => {
    if (c.status !== 'active' || !c.invoiceDue) return '';
    const t = today(); if (c.invoiceDue < t) return 'overdue';
    return c.invoiceDue <= av.addDays(t, 7) ? 'soon' : '';
  };
  const stat = (l, n) => el('div', { class: 'stat' }, el('span', { class: 'stat-n' }, String(n)), el('span', { class: 'stat-l' }, l));
  const money = (c, v) => v == null || v === '' ? '' : (priv.currency || 'USD') + ' ' + v;
  const STATUS = [['active', 'Active'], ['inactive', 'Inactive'], ['completed', 'Completed'], ['archived', 'Archived']];

  function renderStats() {
    const cap = priv.capacity || 0, a = active();
    const od = clients.filter(c => dueState(c) === 'overdue').length, soon = clients.filter(c => dueState(c) === 'soon').length;
    $('clStats').replaceChildren(stat('Active clients', a), stat('Capacity', cap), stat('Slots remaining', Math.max(0, cap - a)), stat('Overdue invoices', od), stat('Due in 7 days', soon));
    $('bkStats').replaceChildren(stat('Active clients', a), stat('Slots remaining', Math.max(0, cap - a)));
  }
  const clFields = () => [
    { key: 'name', label: 'Full name', required: true, max: 80 },
    { key: 'email', label: 'Email', type: 'email', max: 120 },
    { key: 'phone', label: 'Phone', type: 'tel', max: 40 },
    { key: 'company', label: 'Company', max: 80 },
    { key: 'rate', label: 'Agreed rate', type: 'number', min: 0, help: 'In ' + (priv.currency || 'USD') + '. Leave empty if not set.' },
    { key: 'arrangement', label: 'Payment arrangement', type: 'select', options: [{ value: 'hourly', label: 'Hourly' }, { value: 'monthly', label: 'Monthly' }] },
    { key: 'invoiceDue', label: 'Invoice due date', type: 'date' },
    { key: 'status', label: 'Client status', type: 'select', options: STATUS.map(([v, l]) => ({ value: v, label: l })) },
    { key: 'notes', label: 'Notes', type: 'textarea', max: 1000 }];
  const clean = r => ({
    name: r.name.trim(), email: (r.email || '').trim(), phone: (r.phone || '').trim(), company: (r.company || '').trim(),
    rate: r.rate === '' || r.rate == null ? null : Math.max(0, Number(r.rate)), arrangement: r.arrangement === 'monthly' ? 'monthly' : 'hourly',
    invoiceDue: /^\d{4}-\d{2}-\d{2}$/.test(r.invoiceDue || '') ? r.invoiceDue : '', status: STATUS.some(s => s[0] === r.status) ? r.status : 'active', notes: (r.notes || '').trim() });
  const clCheck = r => (r.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) ? 'Please enter a valid email address.' : (r.rate !== '' && r.rate != null && !(Number(r.rate) >= 0) ? 'The rate must be a positive number.' : '');
  const saveClient = async (id, data) => {
    if (!own()) return notify('Could not save. Please sign in as the owner first.', 'error');
    const f = own().fs;
    try { if (id) await f.setDoc(f.doc(own().db, 'clients', id), Object.assign({ updatedAt: Date.now() }, data)); else await f.addDoc(f.collection(own().db, 'clients'), Object.assign({ createdAt: Date.now(), updatedAt: Date.now() }, data)); own().log('Client record saved'); notify('Client saved.', 'success'); }
    catch (e) { notify('Could not save the client. ' + fmtErr(e), 'error'); }
  };
  function renderClients() {
    renderStats();
    const flt = $('clFilter').value, q = $('clSearch').value.trim().toLowerCase();
    let L = clients.slice();
    L = L.filter(c => flt === 'all' ? true : flt === 'current' ? c.status === 'active' : flt === 'inactive' ? c.status !== 'active' : dueState(c) === 'overdue');
    if (q) L = L.filter(c => [c.name, c.email, c.company].join(' ').toLowerCase().includes(q));
    L.sort((a, b) => (a.invoiceDue || '9999').localeCompare(b.invoiceDue || '9999') || a.name.localeCompare(b.name));
    $('clList').replaceChildren(...(L.length ? L.map(c => {
      const d = dueState(c), lbl = (STATUS.find(s => s[0] === c.status) || [0, c.status])[1];
      return el('div', { class: 'mrow' + (c.status === 'active' ? '' : ' off') }, thumb('', c.name),
        el('div', { class: 'mmain' }, el('strong', {}, c.name + (c.company ? ' · ' + c.company : '')),
          el('small', {}, [lbl, c.arrangement === 'monthly' ? 'Monthly' : 'Hourly', money(c, c.rate), c.email, c.phone].filter(Boolean).join(' · ')),
          el('small', { class: d ? 'dueflag ' + d : '' }, c.invoiceDue ? 'Invoice due ' + c.invoiceDue + (d === 'overdue' ? ' (OVERDUE)' : d === 'soon' ? ' (due soon)' : '') : 'No invoice due date'),
          c.notes ? el('small', {}, c.notes.slice(0, 140) + (c.notes.length > 140 ? '…' : '')) : ''),
        el('div', { class: 'mctl' },
          c.invoiceDue && c.status === 'active' ? ctl('Next month', c.name, () => saveClient(c.id, clean(Object.assign({}, c, { invoiceDue: addMonth(c.invoiceDue) })))) : '',
          ctl('Edit', c.name, async () => { const r = await editDialog('Edit client', clFields(), Object.assign({ rate: '' }, c, { rate: c.rate == null ? '' : c.rate }), clCheck); if (r) saveClient(c.id, clean(r)); }),
          del(c.name, 'client', async () => { try { await own().fs.deleteDoc(own().fs.doc(own().db, 'clients', c.id)); own().log('Client removed'); notify('Client removed.', 'success'); } catch (e) { notify('Could not remove. ' + fmtErr(e), 'error'); } })));
    }) : [el('p', { class: 'dstate' }, clients.length ? 'No clients match this view.' : 'No clients yet. Add one to start tracking invoices.')]));
  }
  function addMonth(d) {
    const [y, m, day] = d.split('-').map(Number), t = new Date(Date.UTC(y, m, 1)), last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    t.setUTCDate(Math.min(day, last)); return t.toISOString().slice(0, 10);
  }
  $('clAdd').addEventListener('click', async () => {
    const r = await editDialog('Add client', clFields(), { name: '', email: '', phone: '', company: '', rate: '', arrangement: 'hourly', invoiceDue: '', status: 'active', notes: '' }, clCheck);
    if (r) saveClient(null, clean(r));
  });
  ['input', 'change'].forEach(ev => { $('clFilter').addEventListener(ev, renderClients); $('clSearch').addEventListener(ev, renderClients); });

  /* ---------------------------------------------------------------- Availability, rates, capacity */
  let drafts = null, dirty = false;
  const flag = () => { dirty = true; $('bkSave').disabled = false; $('bkDiscard').disabled = false; $('bkState').textContent = 'Unsaved changes.'; };
  const clearFlag = (m) => { dirty = false; $('bkSave').disabled = true; $('bkDiscard').disabled = true; $('bkState').textContent = m || 'All settings are saved.'; };
  function loadBooking() {
    const c = av.cfg(); drafts = { blocked: c.blocked.map(b => Object.assign({}, b)) };
    $('bkDays').replaceChildren(...[1, 2, 3, 4, 5, 6, 0].map(d => el('label', { class: 'tog' }, el('input', { type: 'checkbox', value: d, checked: c.days.includes(d), onchange: flag }), av.DAYS[d])));
    $('bkStart').value = c.start; $('bkEnd').value = c.end; $('bkTz').value = c.tz;
    $('bkSlot').replaceChildren(...av.SLOTS.map(n => el('option', { value: n, selected: n === c.slot }, n + ' minutes')));
    $('bkSameH').replaceChildren(...Array.from({ length: 24 }, (_, i) => i + 1).map(n => el('option', { value: n, selected: n === c.sameDayHours }, n + (n === 1 ? ' hour' : ' hours'))));
    $('bkSame').checked = c.sameDay; sameDayPreview();
    $('bkCap').value = priv.capacity || 0; $('bkCur').value = priv.currency || 'USD';
    $('bkHr').value = priv.hourly == null ? '' : priv.hourly; $('bkMo').value = priv.monthly == null ? '' : priv.monthly;
    $('bkHrPub').checked = !!priv.showHourly; $('bkMoPub').checked = !!priv.showMonthly;
    renderBlocks(); renderStats(); clearFlag();
  }
  function renderBlocks() {
    $('bkBlocks').replaceChildren(...(drafts.blocked.length ? drafts.blocked.map((b, i) => el('div', { class: 'mrow' },
      el('div', { class: 'mmain' }, el('strong', {}, b.from === b.to ? b.from : b.from + ' to ' + b.to), el('small', {}, b.label || 'Unavailable')),
      el('div', { class: 'mctl' }, del(b.from, 'blocked period', () => { drafts.blocked.splice(i, 1); renderBlocks(); flag(); })))) : [el('p', { class: 'dstate' }, 'No blocked dates.')]));
  }
  /* Security S3.2: live example of the earliest bookable time today with the values on screen */
  function sameDayPreview() {
    const on = $('bkSame').checked, hrs = +$('bkSameH').value || 4; $('bkSameH').disabled = !on;
    const c = Object.assign({}, av.cfg(), { sameDay: on, sameDayHours: hrs, tz: av.tzOk($('bkTz').value.trim()) ? $('bkTz').value.trim() : av.cfg().tz });
    const now = Date.now(), nowT = av.parts(now, c.tz).time;
    if (!on) { $('bkSameP').textContent = 'Same-day meetings are off. Today is greyed out for visitors.'; return; }
    const first = av.daySlots(av.today(c.tz, now), now, c).find(s => s.state === 'free');
    $('bkSameP').textContent = 'Now ' + av.t12(nowT) + ' in ' + c.tz + '. ' + (first ? 'Earliest time visitors can pick today: ' + av.t12(first.time) + '. Earlier times today are greyed out.' : 'No time is left today for this notice, so today stays greyed out.');
  }
  ['bkSame', 'bkSameH', 'bkTz', 'bkStart', 'bkEnd', 'bkSlot'].forEach(id => { $(id).addEventListener('input', sameDayPreview); $(id).addEventListener('change', sameDayPreview); });
  $('bkBlockAdd').addEventListener('click', () => {
    const from = av.ymd($('bkFrom').value), to = av.ymd($('bkTo').value) || from;
    if (!from) return notify('Choose the first date to block.', 'error');
    if (to < from) return notify('The last date cannot be before the first.', 'error');
    if (drafts.blocked.length >= 100) return notify('Please keep 100 blocked periods or fewer.', 'error');
    drafts.blocked.push({ from, to, label: $('bkLbl').value.trim().slice(0, 60) }); drafts.blocked.sort((a, b) => a.from.localeCompare(b.from));
    $('bkFrom').value = ''; $('bkTo').value = ''; $('bkLbl').value = ''; renderBlocks(); flag();
  });
  ['bkSame', 'bkSameH', 'bkStart', 'bkEnd', 'bkSlot', 'bkTz', 'bkCap', 'bkCur', 'bkHr', 'bkMo', 'bkHrPub', 'bkMoPub'].forEach(id => { $(id).addEventListener('input', flag); $(id).addEventListener('change', flag); });
  try { if (Intl.supportedValuesOf) $('bkTzList').replaceChildren(...Intl.supportedValuesOf('timeZone').map(z => el('option', { value: z }))); } catch (e) { /* optional */ }
  const num = v => { v = String(v).trim(); if (v === '') return null; const n = Number(v); return isFinite(n) && n >= 0 ? n : NaN; };
  $('bkSave').addEventListener('click', async () => {
    if (!own()) return notify('Could not save. Please sign in as the owner first.', 'error');
    const days = [...$('bkDays').querySelectorAll('input:checked')].map(i => +i.value), start = $('bkStart').value, end = $('bkEnd').value, tz = $('bkTz').value.trim();
    const cap = Math.round(Number($('bkCap').value)), hr = num($('bkHr').value), mo = num($('bkMo').value), cur = $('bkCur').value.trim() || 'USD';
    if (!days.length) return notify('Choose at least one available day.', 'error');
    if (!av.hm(start) || !av.hm(end) || av.mins(end) <= av.mins(start)) return notify('The end time must be after the start time.', 'error');
    if (!av.tzOk(tz)) return notify('That time zone is not recognised. Example: Asia/Manila.', 'error');
    if (!(cap >= 0 && cap <= 500)) return notify('Capacity must be a number from 0 to 500.', 'error');
    if (Number.isNaN(hr) || Number.isNaN(mo)) return notify('Rates must be positive numbers.', 'error');
    const f = own().fs, P = Object.assign({}, priv, { capacity: cap, currency: cur, hourly: hr, monthly: mo, showHourly: $('bkHrPub').checked && hr != null, showMonthly: $('bkMoPub').checked && mo != null });
    $('bkSave').disabled = true;
    try {
      await f.setDoc(f.doc(own().db, 'content', 'availability'), { days, start, end, slot: +$('bkSlot').value, tz, blocked: drafts.blocked, sameDay: $('bkSame').checked, sameDayHours: +$('bkSameH').value || 4, updatedAt: Date.now() });
      await f.setDoc(f.doc(own().db, 'content', 'rates'), { currency: P.currency, hourly: P.showHourly ? hr : null, monthly: P.showMonthly ? mo : null, updatedAt: Date.now() });
      await f.setDoc(f.doc(own().db, 'ownerPrivate', 'config'), Object.assign({ updatedAt: Date.now() }, P), { merge: true });
      priv = P; own().log('Availability, rates and capacity updated'); notify('Settings saved. The meeting form is updated.', 'success'); renderStats(); clearFlag();
    } catch (e) { notify('Could not save. ' + fmtErr(e), 'error'); $('bkSave').disabled = false; }
  });
  $('bkDiscard').addEventListener('click', () => { loadBooking(); notify('Changes discarded.'); });
  document.addEventListener('dash:page', e => { if (e.detail === 'booking') loadBooking(); if (e.detail === 'clients') renderClients(); });

  /* ---------------------------------------------------------------- listeners + busy sync */
  let unsubs = [], syncT = 0;
  document.addEventListener('own:auth', e => {
    ownerOk = !!(e.detail && e.detail.ok); unsubs.forEach(u => u && u()); unsubs = []; clients = [];
    if (!ownerOk || !own()) { renderStats(); return; }
    const f = own().fs;
    unsubs.push(f.onSnapshot(f.collection(own().db, 'clients'), snap => { clients = snap.docs.map(d => Object.assign({ id: d.id }, d.data())); renderClients(); }, () => { renderStats(); }));
    unsubs.push(f.onSnapshot(f.doc(own().db, 'ownerPrivate', 'config'), s => { if (s.exists()) { priv = Object.assign(priv, s.data()); if (!dirty) { const pg = $('dp-booking'); if (pg && !pg.hidden) loadBooking(); } } renderStats(); }, () => { /* rules not yet published */ }));
  });
  /* keep content/busy equal to the future confirmed meetings, so visitors cannot pick a taken time */
  document.addEventListener('dash:requests', e => {
    clearTimeout(syncT);
    const d = e.detail || {}; if (!ownerOk || !d.loaded) return;
    syncT = setTimeout(async () => {
      if (!ownerOk || !own()) return;
      const next = av.buildBusy(d.list || []), cur = av.busy();
      if (JSON.stringify(next) === JSON.stringify({ keys: cur.keys, items: cur.items })) return;
      try { await own().fs.setDoc(own().fs.doc(own().db, 'content', 'busy'), Object.assign({ updatedAt: Date.now() }, next)); } catch (err) { /* shown on the next save */ }
    }, 900);
  });
  document.addEventListener('dash:closed', renderStats);
})();
