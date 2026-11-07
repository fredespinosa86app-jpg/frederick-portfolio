/* ==========================================================================
   owner-privacy.js - Owner Panel > Privacy & backup (Security Phase S5)
   1. JSON backup + validated restore   2. retention periods + cleanup of old personal data
   3. find / export / delete one person's data   4. privacy notice contact line   5. incident checklist
   Everything is checked again by the Firestore rules; nothing here is trusted by the database.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, BC = window.backupCore, RT = window.coreRetention; if (!kit || !BC || !RT) return;
  const { el, notify, confirmBox } = kit;
  const $ = id => document.getElementById(id), own = () => window.OWN;
  const DAY = 864e5;
  const errText = e => (e && e.code === 'permission-denied') ? 'The database refused this (permission denied). Sign in as the owner again.' : 'Please try again.';
  const fmtDate = ms => ms ? new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'never';
  let priv = {}, cfg = {};

  /* ------------------------------------------------------------ private config helpers */
  async function loadPriv() { try { const o = own(), s = await o.fs.getDocs(o.fs.query(o.fs.collection(o.db, 'ownerPrivate'))); s.forEach(x => { if (x.id === 'config') priv = x.data() || {}; }); } catch (e) { /* shown as "never" */ } }
  async function savePriv(patch) { const o = own(); Object.assign(priv, patch); try { await o.fs.setDoc(o.fs.doc(o.db, 'ownerPrivate', 'config'), Object.assign({ updatedAt: Date.now() }, patch), { merge: true }); } catch (e) { notify('Could not save a note about this action. ' + errText(e), 'error'); } }

  /* ------------------------------------------------------------ 1. backup */
  const download = (name, text) => {
    const a = document.createElement('a'), u = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.href = u; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
  };
  async function readAll(cols) {
    const o = own(), f = o.fs, out = {};
    for (const c of cols) {
      if (c === 'settings') {   // the rules only allow reading the single document settings/site, not listing the collection
        const one = await f.getDoc(f.doc(o.db, 'settings', 'site')); out[c] = one.exists() ? [{ id: 'site', data: one.data() }] : []; continue;
      }
      const s = await f.getDocs(f.query(f.collection(o.db, c), f.limit(c === 'visits' ? 5000 : 2000)));
      out[c] = s.docs.map(d => ({ id: d.id, data: d.data() }));
    }
    return out;
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  async function makeBackup(cols, prefix) {
    const b = await BC.build(await readAll(cols));
    download((prefix || 'portfolio-backup') + '-' + stamp() + '.json', JSON.stringify(b, null, 1));
    return b;
  }
  const chosenCols = () => ['settings', 'content', 'ownerPrivate', 'clients', 'meetingRequests', 'chatUnanswered', 'activity', 'visits', 'clientRegistry', 'clientRegistryAudit', 'workState', 'workSessions', 'workEvents', 'workAssign', 'workAssignAudit', 'workCorrections', 'workSeals', 'workChain', 'workSettings', 'billingProfiles', 'billingProfileAudit', 'billableEntries', 'billableEntryAudit', 'billingMigration', 'invoices', 'invoiceAudit', 'payments', 'paymentReversals', 'invoiceAdjustments', 'invoiceDueDates', 'periodSkips', 'reqCounters', 'ownerDocs', 'surveyInvites', 'surveyInvitesPrivate', 'surveyResponses', 'surveyReminders', 'surveyTemplates', 'surveyForms', 'surveyAnswers', 'todoTasks', 'todoSessions', 'todoNotes', 'todoState', 'todoEvents', 'todoPrefs', 'ownerPrefs'].filter(c => { const e = $('bk_' + c); return e && e.checked; });
  function backupAge() {
    const t = priv.lastBackupAt, n = $('bkLast');
    if (!n) return;
    if (!t) { n.textContent = 'No backup has been downloaded from this panel yet.'; n.className = 'dstate-line warn'; return; }
    const d = Math.floor((Date.now() - t) / DAY);
    n.textContent = 'Last backup: ' + fmtDate(t) + ' (' + (d <= 0 ? 'today' : d + ' day' + (d === 1 ? '' : 's') + ' ago') + ').' + (d > 30 ? ' It is more than 30 days old: download a new one.' : '');
    n.className = 'dstate-line ' + (d > 30 ? 'warn' : 'ok');
  }
  $('bkGo').addEventListener('click', async () => {
    const cols = chosenCols(); if (!cols.length) return notify('Tick at least one thing to back up.', 'error');
    $('bkGo').disabled = true; $('bkpState').textContent = 'Reading the database…';
    try {
      const b = await makeBackup(cols);
      await savePriv({ lastBackupAt: Date.now() }); own().log('Backup downloaded'); backupAge(); flagNav();
      $('bkpState').textContent = 'Saved ' + Object.keys(b.counts).map(c => BC.LABEL[c] + ': ' + b.counts[c]).join(' · ') + '. Keep the file somewhere private: it contains client and visitor details.';
      notify('Backup downloaded.', 'success');
    } catch (e) { $('bkpState').textContent = ''; notify('Could not create the backup. ' + errText(e), 'error'); }
    $('bkGo').disabled = false;
  });

  /* ------------------------------------------------------------ 1b. validated restore */
  let checked = null;
  function resetRestore() { checked = null; $('rsList').replaceChildren(); $('rsMsg').textContent = ''; $('rsConfirmW').hidden = true; $('rsGo').disabled = true; $('rsConfirm').value = ''; }
  function canGo() { $('rsGo').disabled = !(checked && checked.ok && $('rsConfirm').value.trim() === 'RESTORE' && BC.RESTORABLE.some(c => { const e = $('rs_' + c); return e && e.checked; })); }
  $('rsFile').addEventListener('change', async () => {
    resetRestore(); const f = $('rsFile').files[0]; if (!f) return;
    if (f.size > 8 * 1024 * 1024) { $('rsMsg').textContent = 'That file is larger than 8 MB, so it is not a backup from this site.'; $('rsMsg').className = 'dstate-line bad'; return; }
    let text; try { text = await f.text(); } catch (e) { $('rsMsg').textContent = 'Could not read that file.'; return; }
    const r = await BC.validate(text); checked = r;
    if (!r.ok) { $('rsMsg').className = 'dstate-line bad'; $('rsMsg').textContent = 'Not restored. ' + r.errors.slice(0, 4).join(' '); return; }
    $('rsMsg').className = 'dstate-line ok'; $('rsMsg').textContent = 'The file passed every check (format, checksum, collection names, sizes). Nothing has been changed yet.';
    $('rsList').replaceChildren(...BC.RESTORABLE.filter(c => r.summary[c]).map(c => el('label', { class: 'tog' }, el('input', { type: 'checkbox', id: 'rs_' + c, checked: 'checked' }), ' ' + BC.LABEL[c] + ' (' + r.summary[c] + ' documents will be replaced or added)')),
      ...r.warnings.map(w => el('p', { class: 'dhelp' }, w)));
    $('rsList').querySelectorAll('input').forEach(i => i.addEventListener('change', canGo));
    $('rsConfirmW').hidden = false; canGo();
  });
  $('rsConfirm').addEventListener('input', canGo);
  $('rsGo').addEventListener('click', async () => {
    if (!checked || !checked.ok) return;
    const cols = BC.RESTORABLE.filter(c => { const e = $('rs_' + c); return e && e.checked; }), writes = BC.plan(checked.data, cols);
    if (!writes.length) return;
    if (!await confirmBox('Restore ' + writes.length + ' documents?', 'This replaces the matching live documents with the ones in the file. A safety copy of your current data is downloaded first. Each write counts toward the free daily limit (20,000).', 'Restore')) return;
    $('rsGo').disabled = true;
    try {
      $('rsMsg').className = 'dstate-line'; $('rsMsg').textContent = 'Downloading a safety copy of the current data first…';
      await makeBackup(cols, 'before-restore');
      const o = own(), f = o.fs; let n = 0;
      for (const w of writes) { await f.setDoc(f.doc(o.db, w.c, w.id), w.data); n++; if (n % 20 === 0) $('rsMsg').textContent = 'Restoring… ' + n + ' of ' + writes.length; }
      o.log('Backup restored (' + n + ' documents)'); $('rsMsg').className = 'dstate-line ok';
      $('rsMsg').textContent = 'Restored ' + n + ' documents. The site updates by itself; refresh this page if something looks old. The safety copy is in your downloads.';
      notify('Restore finished: ' + n + ' documents.', 'success');
    } catch (e) { $('rsMsg').className = 'dstate-line bad'; $('rsMsg').textContent = 'The restore stopped part-way. ' + errText(e) + ' Your safety copy is in your downloads; run the restore again to finish.'; notify('Restore stopped. ' + errText(e), 'error'); }
    $('rsFile').value = ''; $('rsConfirm').value = ''; canGo();
  });

  /* ------------------------------------------------------------ 2. retention + cleanup */
  const RET = [['rtVisits', 'visits', [30, 60, 90, 180, 365], 90], ['rtChat', 'chat', [30, 90, 180, 365, 730], 180], ['rtReq', 'requests', [180, 365, 730, 1095], 730], ['rtFlag', 'reqFlag', [30, 60, 90, 180], 90], ['rtStale', 'reqStale', [180, 365, 730], 365], ['rtAct', 'activity', [90, 180, 365], 180], ['rtSvRej', 'svRejected', [0, 30, 90, 180, 365], 0]];
  const retVals = () => { const o = {}; RET.forEach(([id, k, , d]) => { o[k] = parseInt($(id).value, 10) || d; }); return o; };
  const lbl = n => n === 0 ? 'Keep until I delete them' : n >= 365 && n % 365 === 0 ? (n / 365) + (n === 365 ? ' year' : ' years') : n + ' days';
  function fillRet() {
    const r = Object.assign({}, cfg.retention || {});
    RET.forEach(([id, k, vals, d]) => { const s = $(id); s.replaceChildren(...vals.map(v => el('option', { value: String(v) }, lbl(v)))); const want = [].concat(vals).includes(+r[k]) ? +r[k] : d; s.value = String(want); });
    $('rtLast').textContent = 'Last cleanup: ' + fmtDate(priv.lastPurgeAt) + (priv.lastPurgeAt && Date.now() - priv.lastPurgeAt > 45 * DAY ? ' (more than 45 days ago: run it again)' : '') + '.';
    $('pvContact').value = cfg.privacyContact || '';
  }
  $('rtSave').addEventListener('click', () => {
    const rv = retVals(); if (rv.reqFlag >= rv.reqStale) return notify('Flag unanswered requests earlier than you delete them.', 'error');
    const c = String($('pvContact').value || '').trim().slice(0, 120);
    if (c && !/^[^\s<>]+@[^\s<>]+\.[^\s<>]+$/.test(c) && !/^https:\/\/[^\s<>]+$/.test(c)) return notify('The contact must be an email address or an https link.', 'error');
    own().save({ retention: retVals(), privacyContact: c }, 'Retention periods and notice contact saved. The privacy notice shows them.');
  });
  const RULES = [
    ['visits', 'Visit records', () => retVals().visits, () => true],
    ['chatUnanswered', 'Chatbot questions', () => retVals().chat, () => true],
    ['activity', 'Activity log entries', () => retVals().activity, () => true]
  ];
  const ms = t => t && t.toMillis ? t.toMillis() : (t instanceof Date ? t.getTime() : +t || 0);
  async function due(c, days, keep) {
    const o = own(), f = o.fs, cut = new Date(Date.now() - days * DAY), out = []; let last = null;
    for (let i = 0; i < 6; i++) {
      const base = [f.collection(o.db, c), f.where('createdAt', '<', cut), f.orderBy('createdAt')];
      const s = await f.getDocs(f.query(...base, ...(last ? [f.startAfter(last)] : []), f.limit(400)));
      s.docs.forEach(d => { if (keep(d.data())) out.push(d); });
      if (s.docs.length < 400) break;
      last = s.docs[s.docs.length - 1];
      if (out.length >= 2000) break;
    }
    return out;
  }
  /* Discovery Call requests: decided by core-retention.js (finished / unanswered / confirmed long past). Paged with a cursor, newest-first stops at the cutoff. */
  const PAGE = 400, MAXPAGES = 6;
  async function scanRequests() {
    const o = own(), f = o.fs, now = Date.now(), set = RT.settings(retVals()), cut = new Date(RT.queryCutoff(now, set)), out = { due: [], flag: [], capped: false, set, now };
    let last = null;
    for (let i = 0; i < MAXPAGES; i++) {
      const q = last ? f.query(f.collection(o.db, 'meetingRequests'), f.where('createdAt', '<', cut), f.orderBy('createdAt'), f.startAfter(last), f.limit(PAGE)) : f.query(f.collection(o.db, 'meetingRequests'), f.where('createdAt', '<', cut), f.orderBy('createdAt'), f.limit(PAGE));
      const sn = await f.getDocs(q);
      sn.docs.forEach(d => { const r = RT.classify(d.data(), now, set); if (r.act === 'due') out.due.push({ doc: d, why: r.why }); else if (r.act === 'flag') out.flag.push({ doc: d, why: r.why }); });
      if (sn.docs.length < PAGE) return out;
      last = sn.docs[sn.docs.length - 1];
    }
    out.capped = true; return out;
  }
  const sampleRow = x => { const d = x.doc.data(), c = ms(d.createdAt); return RT.mask(d.email) + ' · ' + (d.status || '?') + ' · received ' + (c ? new Date(c).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '?') + ' · ' + x.why; };
  /* R4: rejected employer-survey answers. One query on ownerStatus only (no composite index); the date test is core-retention's svRejectedDue. */
  async function scanSvRejected() {
    const days = RT.svRejectedDays(retVals()), out = { days, due: [], capped: false }; if (!days) return out;
    const o = own(), f = o.fs, now = Date.now(), sn = await f.getDocs(f.query(f.collection(o.db, 'surveyResponses'), f.where('ownerStatus', '==', 'rejected'), f.limit(400)));
    sn.docs.forEach(d => { if (RT.svRejectedDue(d.data(), now, days)) out.due.push(d); });
    out.capped = sn.docs.length >= 400; return out;
  }
  let dueSets = null, reqScan = null, svScan = null;
  $('rtCheck').addEventListener('click', async () => {
    $('rtState').textContent = 'Checking…'; $('rtDel').disabled = true;
    try {
      dueSets = []; const rows = [];
      for (const [c, name, days, keep] of RULES) { const d = await due(c, days(), keep); dueSets.push([c, name, d]); rows.push(el('li', {}, name + ': ' + d.length + ' older than ' + lbl(days()))); }
      reqScan = await scanRequests(); svScan = await scanSvRejected();
      const by = w => reqScan.due.filter(x => x.why === w).length, set = reqScan.set;
      rows.push(el('li', {}, 'Discovery call requests to delete: ' + reqScan.due.length + ' (finished ' + by('finished') + ', unanswered ' + by('unanswered') + ', confirmed meetings long past ' + by('confirmed, meeting long past') + ')'));
      rows.push(el('li', {}, 'Discovery call requests to review (not deleted): ' + reqScan.flag.length + ' (unanswered over ' + lbl(set.flagDays) + ' or a confirmed meeting that is over: open the Inbox and set a status)'));
      rows.push(el('li', {}, RT.svRejectedDays(retVals()) ? 'Rejected survey answers to delete: ' + svScan.due.length + ' (rejected more than ' + lbl(svScan.days) + ' ago; the answer and its link are removed together)' : 'Rejected survey answers: kept until you delete them (no period chosen)'));
      reqScan.due.slice(0, 5).forEach(x => rows.push(el('li', { class: 'dhelp' }, 'e.g. ' + sampleRow(x))));
      if (reqScan.capped) rows.push(el('li', { class: 'dhelp' }, 'More records may be due: delete these, then check again.'));
      $('rtList').replaceChildren(...rows);
      const tot = dueSets.reduce((a, x) => a + x[2].length, 0) + reqScan.due.length + svScan.due.length;
      $('rtState').textContent = tot ? tot + ' records are past their retention period.' : 'Nothing is due. Everything is within the retention periods.';
      $('rtDel').disabled = !tot;
    } catch (e) { $('rtState').textContent = 'Could not check. ' + errText(e); }
  });
  $('rtDel').addEventListener('click', async () => {
    if (!dueSets || !reqScan || !svScan) return; const tot = dueSets.reduce((a, x) => a + x[2].length, 0) + reqScan.due.length + svScan.due.length; if (!tot) return;
    const lb = priv.lastBackupAt, bk = lb ? 'Your last backup was ' + Math.max(0, Math.floor((Date.now() - lb) / DAY)) + ' day(s) ago.' : 'You have no backup yet.';
    if (!await confirmBox('Delete ' + tot + ' old records?', 'They are permanently deleted. ' + bk + ' A fresh backup first is wise (Backup above); press Delete anyway to continue without one. Clients are never deleted automatically.', 'Delete anyway')) return;
    $('rtDel').disabled = true; const o = own(), f = o.fs; let n = 0, skipped = 0;
    try {
      for (const [c, , d] of dueSets) for (const x of d) { await f.deleteDoc(f.doc(o.db, c, x.id)); n++; }
      /* a request is read again right before it is deleted: if you changed its status meanwhile it is no longer due and is kept */
      let k = 0;
      for (const x of reqScan.due) {
        const ref = f.doc(o.db, 'meetingRequests', x.doc.id), cur = await f.getDoc(ref);
        if (!cur.exists()) continue;
        if (RT.classify(cur.data(), Date.now(), reqScan.set).act !== 'due') { skipped++; continue; }
        await f.deleteDoc(ref); n++;
        if (++k % 25 === 0) $('rtState').textContent = 'Deleting… ' + n + ' so far';
      }
      /* a rejected answer is read again right before deletion; the answer, its invite and the private e-mail record go together (the invite would otherwise show as "Answered, to review") */
      for (const x of svScan.due) {
        const rref = f.doc(o.db, 'surveyResponses', x.id), cur = await f.getDoc(rref); if (!cur.exists()) continue;
        if (!RT.svRejectedDue(cur.data(), Date.now(), svScan.days)) { skipped++; continue; }
        await f.deleteDoc(rref); n++;
        try { await f.deleteDoc(f.doc(o.db, 'surveyInvitesPrivate', x.id)); } catch (e) { /* the private record may already be gone */ }
        try { await f.deleteDoc(f.doc(o.db, 'surveyInvites', x.id)); } catch (e) { /* the invite may already be gone */ }
      }
      await savePriv({ lastPurgeAt: Date.now() }); o.log('Old personal data deleted (' + n + ' records)'); fillRet();
      $('rtState').textContent = n + ' records deleted' + (skipped ? ', ' + skipped + ' kept because they changed since the check' : '') + '.'; $('rtList').replaceChildren(); dueSets = null; reqScan = null; svScan = null; notify(n + ' old records deleted.', 'success');
    } catch (e) { $('rtState').textContent = 'Stopped after ' + n + ' deletions. Press Check again to continue. ' + errText(e); }
  });

  /* weekly reminder on the dashboard: counts only, never deletes */
  const banner = $('retBanner');
  async function maybeBanner() {
    if (!banner || !RT.bannerDue(priv.retBannerAt, Date.now())) return;
    try {
      const r = await scanRequests(); if (!r.due.length && !r.flag.length) return;
      $('retBannerTxt').textContent = (r.due.length ? r.due.length + ' request' + (r.due.length === 1 ? ' is' : 's are') + ' past the retention period. ' : '') + (r.flag.length ? r.flag.length + ' need' + (r.flag.length === 1 ? 's' : '') + ' your attention (unanswered, or a confirmed meeting that is over). ' : '') + 'Nothing is deleted until you review and confirm.';
      banner.hidden = false; await savePriv({ retBannerAt: Date.now() });
    } catch (e) { /* the banner is a convenience; the Privacy page still works */ }
  }
  if (banner) {
    $('retLater').addEventListener('click', () => { banner.hidden = true; });
    $('retReview').addEventListener('click', () => { banner.hidden = true; const b = document.querySelector('.dnav [data-page="privacy"]'); if (b) b.click(); });
  }

  /* ------------------------------------------------------------ 3. one person's data */
  let found = [];
  const norm = s => String(s || '').trim().toLowerCase();
  $('pdFind').addEventListener('click', async () => {
    const q = norm($('pdQuery').value); $('pdList').replaceChildren(); found = []; $('pdAct').hidden = true;
    if (q.length < 3) { $('pdState').textContent = 'Type at least 3 letters of the email address or name.'; return; }
    $('pdState').textContent = 'Searching…';
    try {
      const o = own(), f = o.fs;
      for (const [c, fields] of [['meetingRequests', ['email', 'name']], ['clients', ['email', 'name']]]) {
        const s = await f.getDocs(f.query(f.collection(o.db, c), f.limit(1000)));
        s.docs.forEach(d => { const x = d.data(); if (fields.some(k => norm(x[k]).includes(q))) found.push({ c, id: d.id, data: x }); });
      }
      $('pdList').replaceChildren(...found.map((r, i) => el('li', {}, el('label', { class: 'tog' }, el('input', { type: 'checkbox', checked: 'checked', 'data-i': String(i) }), ' ' + (r.c === 'clients' ? 'Client' : 'Meeting request') + ': ' + String(r.data.name || '') + ' · ' + String(r.data.email || '') + (r.data.date ? ' · ' + r.data.date : '')))));
      $('pdState').textContent = found.length ? found.length + ' record' + (found.length === 1 ? '' : 's') + ' found (searched up to 1,000 of each kind). Chatbot questions are anonymous and cannot be linked to a person.' : 'No meeting requests or clients match.';
      $('pdAct').hidden = !found.length;
    } catch (e) { $('pdState').textContent = 'Could not search. ' + errText(e); }
  });
  const picked = () => [...$('pdList').querySelectorAll('input:checked')].map(i => found[+i.dataset.i]).filter(Boolean);
  $('pdExport').addEventListener('click', async () => {
    const p = picked(); if (!p.length) return notify('Tick at least one record.', 'error');
    const docs = { meetingRequests: [], clients: [] }; p.forEach(r => docs[r.c].push({ id: r.id, data: r.data }));
    const b = await BC.build(docs); delete b.note; b.note = 'Personal data of one person, exported for an access / portability request.';
    download('person-export-' + stamp() + '.json', JSON.stringify(b, null, 1)); own().log('Personal data exported (' + p.length + ' records)'); notify('Export downloaded.', 'success');
  });
  $('pdDelete').addEventListener('click', async () => {
    const p = picked(); if (!p.length) return notify('Tick at least one record.', 'error');
    if (!await confirmBox('Delete ' + p.length + ' record' + (p.length === 1 ? '' : 's') + '?', 'They are permanently deleted. Export them first if you need a copy for the person.', 'Delete')) return;
    const o = own(), f = o.fs; let n = 0;
    try { for (const r of p) { await f.deleteDoc(f.doc(o.db, r.c, r.id)); n++; } o.log('Personal data deleted on request (' + n + ' records)'); notify(n + ' records deleted.', 'success'); $('pdList').replaceChildren(); $('pdAct').hidden = true; found = []; $('pdState').textContent = n + ' records deleted.'; }
    catch (e) { notify('Stopped after ' + n + ' deletions. ' + errText(e), 'error'); }
  });

  /* ------------------------------------------------------------ incident shortcut + wiring */
  $('icPause').addEventListener('click', () => { const b = document.querySelector('.dnav [data-page="security"]'); if (b) b.click(); });
  /* a small "!" on the menu item when no backup exists or the last one is over 30 days old (no toast: toasts lock the View site button) */
  function flagNav() {
    const b = document.querySelector('.dnav [data-page="privacy"]'); if (!b) return;
    const late = !priv.lastBackupAt || Date.now() - priv.lastBackupAt > 30 * DAY; let m = b.querySelector('.dwarn');
    if (late && !m) { m = el('span', { class: 'dwarn', title: 'Backup needed' }, '!'); m.append(el('span', { class: 'sr' }, ' Backup needed')); b.append(m); }
    if (!late && m) m.remove();
  }
  document.addEventListener('site:applied', () => { cfg = window.__lastCfg || cfg; });
  document.addEventListener('dash:page', async e => {
    const p = e.detail && e.detail.page ? e.detail.page : e.detail; if (p !== 'privacy') return;
    cfg = window.__lastCfg || cfg; await loadPriv(); fillRet(); backupAge();
  });
  document.addEventListener('own:auth', async e => {
    if (!(e.detail && e.detail.ok)) { priv = {}; return; }
    await loadPriv(); cfg = window.__lastCfg || cfg;
    flagNav(); maybeBanner();
  });
  fillRet(); backupAge();
})();
