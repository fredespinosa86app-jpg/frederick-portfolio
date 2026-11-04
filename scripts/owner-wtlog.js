/* ==========================================================================
   owner-wtlog.js - Owner Panel > WorkTrack, phase W3 (CodeFlow 4.5.0): corrections, the tamper-evident log, work settings.
     workCorrections/{id}   create-only corrections of a CLOSED session, allowed for 24 hours after its closing punch (database clock)
     workSeals/{hash}       create-only seals: SHA-256 over the previous seal and the full content of the records it covers
     workChain/main         the chain head (seal count + newest fingerprint); moves exactly one step per seal
     workSettings/main      time zone for NEW sessions and the first weekday of the week
   The maths lives in core-wtlog.js (unit-tested). The rules only enforce order and numbering. This page seals each write right after it
   happened (records are read back first, so the server times are inside the fingerprint). Nothing here changes a record that already exists.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, core = window.coreWork, L = window.coreWtLog, ids = window.coreIds, tm = window.coreTime; if (!kit || !core || !L || !ids || !tm) return;
  const { el, notify } = kit;
  const $ = id => document.getElementById(id), own = () => window.OWN, DEFAULT_TZ = 'Asia/Manila';
  const say = (id, msg) => { const n = $(id); if (n) n.textContent = msg || ''; };
  const ms = t => !t ? 0 : typeof t.toMillis === 'function' ? t.toMillis() : t instanceof Date ? t.getTime() : Number(t) || 0;
  let signed = false, chain = null, seals = [], settings = { tz: DEFAULT_TZ, weekStart: 'mon', rev: 0, prevTz: '', prevWeekStart: '' }, recent = [], registry = [], formFor = '', busy = false, lastVerify = null, waiting = [];
  window.wtSettings = { tz: DEFAULT_TZ, weekStart: 'mon' };
  const timeFmt = (m, tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz || settings.tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(m));
  const errText = e => {
    const c = e && e.code;
    if (c === 'permission-denied') return 'The database refused this (permission denied). Publish the newest firestore.rules.strict, sign in again and refresh. For a correction, the 24-hour window may also have just ended.';
    if (c === 'unavailable' || /offline|network/i.test(String(e && e.message))) return 'No connection to the database, so nothing was saved. Check your internet and try again.';
    return 'Please refresh the page and try again.';
  };
  async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''); }
  const online = () => navigator.onLine !== false;

  /* ---------------------------------------------------------------- reading */
  const colDocs = async name => { const o = own(), f = o.fs; return (await f.getDocs(f.query(f.collection(o.db, name)))).docs; };
  async function loadChain() {
    const o = own(), f = o.fs, s = await f.getDoc(f.doc(o.db, 'workChain', 'main'));
    chain = s.exists() ? { cn: s.data().cn, head: s.data().head, atMs: ms(s.data().updatedAt) } : null;
    return chain;
  }
  async function loadSeals() {
    seals = (await colDocs('workSeals')).map(d => { const x = d.data(); return { id: d.id, n: x.n, prev: x.prev, hash: x.hash, kind: x.kind, ids: x.ids || [], upto: x.upto || 0, legacyN: x.legacyN || 0, atMs: ms(x.at) }; }).sort((a, b) => a.n - b.n);
    return seals;
  }
  async function loadRecords() {
    const recs = {};
    for (const c of Object.keys(L.COLLECTIONS)) (await colDocs(c)).forEach(d => { recs[c + '/' + d.id] = L.plain(d.data()); });
    return recs;
  }
  async function loadRegistry() { registry = (await colDocs('clientRegistry')).map(d => ({ id: d.id, status: d.data().status })).sort((a, b) => a.id < b.id ? -1 : 1); }
  const regStatus = id => { const r = registry.find(x => x.id === id); return r ? r.status : ''; };

  /* ---------------------------------------------------------------- sealing */
  async function readBack(paths) {
    const o = own(), f = o.fs, out = [];
    for (const p of paths) { const [c, id] = p.split('/'); const s = await f.getDoc(f.doc(o.db, c, id)); if (!s.exists()) throw new Error('missing:' + p); out.push({ path: p, data: L.plain(s.data()) }); }
    return out;
  }
  /* seal the given records (already written). Does nothing while the chain has not been started. */
  async function sealPaths(paths) {
    if (!chain || !paths.length) return { sealed: 0 };
    const o = own(), f = o.fs; let total = 0;
    for (let i = 0; i < paths.length; i += L.MAX_SEAL_IDS) {
      const part = paths.slice(i, i + L.MAX_SEAL_IDS), recs = await readBack(part);
      await f.runTransaction(o.db, async tx => {
        const cs = await tx.get(f.doc(o.db, 'workChain', 'main'));
        if (!cs.exists()) throw new Error('nochain');
        const cur = cs.data(), n = cur.cn + 1, s = await L.makeSeal(sha, { n, prev: cur.head, kind: 'records', recs });
        tx.set(f.doc(o.db, 'workSeals', s.hash), Object.assign({}, s, { at: f.serverTimestamp(), by: o.uid() }));
        tx.set(f.doc(o.db, 'workChain', 'main'), { cn: n, head: s.hash, updatedAt: f.serverTimestamp() });
      });
      total += part.length;
    }
    await loadChain(); drawChain(); return { sealed: total };
  }
  async function sealSafely(paths) {
    try { await sealPaths(paths); waiting = waiting.filter(p => paths.indexOf(p) < 0); say('wtLogWarn', waiting.length ? waiting.length + ' record(s) are waiting to be sealed. Press Verify, then "Seal waiting records".' : ''); }
    catch (e) { waiting = Array.from(new Set(waiting.concat(paths))); say('wtLogWarn', 'The record was saved, but sealing it did not finish (' + (online() ? 'please try again' : 'you are offline') + '). Press Verify, then "Seal waiting records".'); }
  }
  async function startChain() {
    if (busy || chain) return; say('wtLogErr', '');
    if (!online()) { say('wtLogErr', 'You are offline. Nothing was started.'); return; }
    busy = true; drawChain();
    try {
      const o = own(), f = o.fs, recs = await loadRecords(), list = Object.keys(recs).sort().map(p => ({ path: p, data: recs[p] }));
      const upto = list.reduce((a, r) => Math.max(a, L.timeOf(r.path, r.data)), 0);
      const s = await L.makeSeal(sha, { n: 1, prev: L.ZERO, kind: 'genesis', recs: list, upto });
      const b = f.writeBatch();
      b.set(f.doc(o.db, 'workSeals', s.hash), Object.assign({}, s, { at: f.serverTimestamp(), by: o.uid() }));
      b.set(f.doc(o.db, 'workChain', 'main'), { cn: 1, head: s.hash, updatedAt: f.serverTimestamp() });
      await b.commit(); await loadChain(); await loadSeals();
      notify('Log started. ' + list.length + ' earlier record(s) are the starting point.', 'success');
    } catch (e) { say('wtLogErr', errText(e)); }
    finally { busy = false; drawChain(); }
  }

  /* ---------------------------------------------------------------- verify + witness */
  async function verifyNow() {
    if (busy) return; say('wtLogErr', ''); if (!online()) { say('wtLogErr', 'You are offline.'); return; }
    busy = true; drawChain(); const out = $('wtVerOut'); out.replaceChildren(el('p', { class: 'dstate' }, 'Checking every record and seal…'));
    try {
      await loadChain(); await loadSeals(); const records = await loadRecords();
      const v = await L.verify({ chain, seals, records, nowMs: Date.now() }, sha); lastVerify = v;
      const unsealed = v.unsealed.slice();
      const box = el('div', { class: 'wtver ' + v.status, role: 'status' });
      if (v.status === 'none') box.append(el('strong', {}, 'The log has not been started.'), el('p', { class: 'libmeta' }, 'Press "Start the tamper-evident log" to protect your records from now on.'));
      else if (v.status === 'ok') box.append(el('strong', {}, 'Intact. '), el('span', {}, v.sealsChecked + ' seals checked, ' + v.recordsCovered + ' records covered. Newest seal: #' + v.cn + '.'));
      else box.append(el('strong', {}, 'Problem found. '), el('span', {}, 'The log was changed after it was sealed, or a record was written without sealing.'), el('ul', {}, ...v.problems.map(p => el('li', {}, p))));
      v.notes.forEach(n => box.append(el('p', { class: 'libmeta' }, n)));
      out.replaceChildren(box);
      if (unsealed.length && chain) { waiting = unsealed; out.append(el('div', { class: 'ab' }, el('button', { type: 'button', class: 'dbtn', id: 'wtSealWait', onclick: sealWaiting }, 'Seal waiting records (' + unsealed.length + ')'))); }
      else waiting = [];
    } catch (e) { out.replaceChildren(el('p', { class: 'ferr' }, 'Could not check the log. ' + errText(e))); }
    finally { busy = false; drawChain(); }
  }
  async function sealWaiting() {
    if (busy) return; busy = true; drawChain();
    try { await sealPaths(waiting.slice()); waiting = []; busy = false; await verifyNow(); }
    catch (e) { say('wtLogErr', errText(e)); busy = false; drawChain(); }
  }
  async function witnessText() { if (!seals.length || !chain || seals[seals.length - 1].n !== chain.cn) await loadSeals(); return L.witnessText(seals); }
  async function copyWitness() {
    say('wtLogErr', '');
    try { const t = await witnessText(); await navigator.clipboard.writeText(t); notify('Witness copy copied. Paste it somewhere outside Firebase.', 'success'); }
    catch (e) { say('wtLogErr', 'Could not copy automatically. Use "Download witness file" instead.'); }
  }
  async function downloadWitness() {
    say('wtLogErr', '');
    try {
      const t = await witnessText(), d = new Date().toISOString().slice(0, 10), a = el('a', { href: URL.createObjectURL(new Blob([t], { type: 'text/plain' })), download: 'worktrack-witness-' + d + '.txt' });
      document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    } catch (e) { say('wtLogErr', errText(e)); }
  }
  async function compareFile(ev) {
    const file = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (!file) return;
    const out = $('wtVerOut'); say('wtLogErr', '');
    try {
      const text = await file.text(); await loadSeals(); const r = L.compareWitness(L.parseWitness(text), seals);
      out.replaceChildren(el('div', { class: 'wtver ' + (r.ok ? 'ok' : 'broken'), role: 'status' }, r.ok ? el('span', {}, el('strong', {}, 'Matches. '), r.checked + ' saved seal(s) are in the database exactly as you saved them' + (r.newer ? ' (' + r.newer + ' newer seal(s) were added since).' : '.')) : el('span', {}, el('strong', {}, 'Does not match. '), el('ul', {}, ...r.problems.map(p => el('li', {}, p))))));
    } catch (e) { say('wtLogErr', 'Could not read that file. ' + errText(e)); }
  }
  function drawChain() {
    const has = !!chain, off = busy || !online();
    $('wtChainStart').hidden = has; $('wtChainStart').disabled = off;
    ['wtVerify', 'wtWitCopy', 'wtWitDl', 'wtWitFileLbl'].forEach(i => { $(i).hidden = !has && i !== 'wtVerify'; });
    $('wtVerify').disabled = busy; $('wtWitCopy').disabled = busy; $('wtWitDl').disabled = busy; $('wtWitFile').disabled = busy;
    say('wtChainState', has ? 'Log protected: ' + chain.cn + ' seal' + (chain.cn === 1 ? '' : 's') + '. Newest seal #' + chain.cn + ' · fingerprint ' + chain.head.slice(0, 16) + '…' : 'The tamper-evident log has not been started yet.');
  }

  /* ---------------------------------------------------------------- settings */
  async function loadSettings() {
    const o = own(), f = o.fs, s = await f.getDoc(f.doc(o.db, 'workSettings', 'main'));
    if (s.exists()) { const x = s.data(); settings = { tz: x.tz || DEFAULT_TZ, weekStart: x.weekStart || 'mon', rev: x.rev || 1, prevTz: x.prevTz || '', prevWeekStart: x.prevWeekStart || '' }; }
    else settings = { tz: DEFAULT_TZ, weekStart: 'mon', rev: 0, prevTz: '', prevWeekStart: '' };
    publishSettings(); drawSettings();
  }
  function publishSettings() { window.wtSettings = { tz: settings.tz, weekStart: settings.weekStart }; document.dispatchEvent(new CustomEvent('wt:settings', { detail: window.wtSettings })); }
  function drawSettings() {
    $('wtSetTz').value = settings.tz; $('wtSetWeek').value = settings.weekStart;
    say('wtSetState', 'Now: ' + settings.tz + ', weeks start on ' + $('wtSetWeek').selectedOptions[0].textContent + '.' + (settings.prevTz ? ' Before the last change: ' + settings.prevTz + ', ' + settings.prevWeekStart + '.' : ''));
  }
  async function saveSettings() {
    say('wtSetErr', ''); const tz = $('wtSetTz').value.trim(), week = $('wtSetWeek').value;
    if (!tz || tz.length > 60 || !/^[A-Za-z0-9_+/-]+$/.test(tz) || !tm.isValidTimeZone(tz)) { say('wtSetErr', '"' + tz + '" is not a valid time zone name. Examples: Asia/Manila, Europe/London, America/New_York, UTC.'); return; }
    if (tz === settings.tz && week === settings.weekStart) { say('wtSetErr', 'No change to save: these are already the current settings.'); return; }
    if (!online()) { say('wtSetErr', 'You are offline. Nothing was saved.'); return; }
    const o = own(), f = o.fs; $('wtSetSave').disabled = true;
    try {
      const doc = settings.rev ? { tz, weekStart: week, prevTz: settings.tz, prevWeekStart: settings.weekStart, rev: settings.rev + 1 } : { tz, weekStart: week, prevTz: '', prevWeekStart: '', rev: 1 };
      await f.setDoc(f.doc(o.db, 'workSettings', 'main'), Object.assign(doc, { updatedAt: f.serverTimestamp() }));
      await loadSettings(); notify('Settings saved. New sessions use ' + tz + '.', 'success');
    } catch (e) { say('wtSetErr', errText(e)); await loadSettings().catch(() => 0); }
    finally { $('wtSetSave').disabled = false; }
  }

  /* ---------------------------------------------------------------- corrections */
  async function loadRecent() {
    const o = own(), f = o.fs, since = new Date(Date.now() - 96 * 3600000);
    const ss = (await f.getDocs(f.query(f.collection(o.db, 'workSessions'), f.where('startedAt', '>=', since)))).docs.map(d => ({ sid: d.id, tz: d.data().tz || DEFAULT_TZ, date: d.data().date || '', startMs: ms(d.data().startedAt) })).sort((a, b) => b.startMs - a.startMs).slice(0, 6);
    const out = [];
    for (const s of ss) {
      const evs = (await f.getDocs(f.query(f.collection(o.db, 'workEvents'), f.where('sid', '==', s.sid)))).docs.map(d => { const x = d.data(); return { n: x.n, type: x.type, atMs: ms(x.at), reason: x.reason || '' }; });
      const cs = (await f.getDocs(f.query(f.collection(o.db, 'workCorrections'), f.where('sid', '==', s.sid)))).docs.map(d => { const x = d.data(); return { id: d.id, kind: x.kind, n: x.n, type: x.type, clientId: x.clientId, atMs: x.at ? ms(x.at) : null, at2Ms: x.at2 ? ms(x.at2) : null, reason: x.reason, createdMs: ms(x.createdAt) }; });
      const as = (await f.getDocs(f.query(f.collection(o.db, 'workAssign'), f.where('sid', '==', s.sid)))).docs.map(d => ({ clientId: d.data().clientId, status: d.data().status }));
      evs.sort((a, b) => a.n - b.n); const last = evs[evs.length - 1];
      const closed = !!last && (last.type === 'CLOCK_OUT' || last.type === 'CLOSE_INCOMPLETE');
      out.push(Object.assign({}, s, { events: evs, corrections: cs, assign: as, closed, closeN: closed ? last.n : 0, closeEid: closed ? s.sid + '__' + last.n : '', closeAtMs: closed ? last.atMs : 0 }));
    }
    recent = out.filter(s => s.closed);
  }
  const DUR = x => x == null ? '—' : tm.formatDuration(x);
  const PUNCH = t => core.LABEL[t] || t;
  function zonedInput(msv, tz) { const p = tm.parts(msv, tz), z = n => String(n).padStart(2, '0'); return p.year + '-' + z(p.month) + '-' + z(p.day) + 'T' + z(p.hour) + ':' + z(p.minute); }
  function fromInput(v, tz) { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v || ''); return m ? tm.zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], 0, tz) : NaN; }
  function drawCorr() {
    const box = $('wtCorrList'); box.replaceChildren();
    if (!recent.length) { box.append(el('p', { class: 'libmeta' }, 'No closed sessions from the last 4 days.')); return; }
    const t = Date.now();
    recent.forEach(s => {
      const orig = L.effective(s.events, []), eff = L.effective(s.events, s.corrections), openWin = L.windowOpen(s.closeAtMs, t), clients = L.effectiveClients(s.assign, s.corrections);
      const card = el('div', { class: 'wtsess', 'data-sid': s.sid },
        el('strong', {}, s.date + ' · ' + s.tz + (orig.derived.incomplete ? ' · closed as incomplete' : '')),
        el('div', { class: 'libmeta' }, 'Original: session ' + DUR(orig.derived.grossMs) + ', working ' + DUR(orig.derived.netMs)),
        s.corrections.length ? el('div', { class: 'libmeta wtcorrd' }, 'With corrections: session ' + (eff.derived.valid ? DUR(eff.derived.grossMs) : '—') + ', working ' + (eff.derived.valid ? DUR(eff.derived.netMs) : '—') + (eff.derived.valid ? '' : ' (the corrected day is not valid: ' + eff.derived.problem + ')')) : null,
        el('div', { class: 'libmeta' }, 'Clients: ' + (clients.length ? clients.join(', ') : 'none')),
        ...s.corrections.slice().sort((a, b) => a.createdMs - b.createdMs).map(c => {
          const orig = s.events.find(e => e.n === c.n);
          return el('div', { class: 'wtev' }, el('strong', {}, L.describe(Object.assign({ origType: orig && orig.type }, c), x => timeFmt(x, s.tz), PUNCH)), el('span', { class: 'libmeta' }, 'Reason: ' + c.reason), el('span', { class: 'libmeta' }, 'saved ' + timeFmt(c.createdMs)));
        }),
        openWin ? el('div', { class: 'ab' }, el('button', { type: 'button', class: 'dbtn', 'data-correct': s.sid, onclick: () => { formFor = s.sid; drawCorr(); } }, 'Correct this session…'), el('span', { class: 'libmeta' }, 'Corrections allowed until ' + timeFmt(L.windowEndMs(s.closeAtMs), s.tz)))
          : el('div', { class: 'libmeta' }, 'The 24-hour correction window ended ' + timeFmt(L.windowEndMs(s.closeAtMs), s.tz) + '.'));
      if (openWin && formFor === s.sid) card.append(buildForm(s, eff));
      box.append(card);
    });
  }
  function buildForm(s, eff) {
    const kind = el('select', { id: 'wtCoKind', 'aria-label': 'What to correct' }, ...L.CORR_KINDS.map(k => el('option', { value: k }, L.KIND_LABEL[k])));
    const punch = el('select', { id: 'wtCoPunch', 'aria-label': 'Punch' }, ...eff.events.filter(e => !e.added).map(e => el('option', { value: String(e.o) }, '#' + e.o + ' ' + PUNCH(e.type) + ' (now ' + timeFmt(e.atMs, s.tz) + ')')));
    const at = el('input', { type: 'datetime-local', id: 'wtCoAt', 'aria-label': 'New date and time' }), at2 = el('input', { type: 'datetime-local', id: 'wtCoAt2', 'aria-label': 'Break end date and time' });
    const brk = el('select', { id: 'wtCoBreak', 'aria-label': 'Which break' }, ...L.ADD_TYPES.map(k => el('option', { value: k }, L.ADD_NAME[k])));
    const have = L.effectiveClients(s.assign, s.corrections);
    const cliAdd = el('select', { id: 'wtCoClient', 'aria-label': 'Client ID' });
    const reason = el('input', { type: 'text', id: 'wtCoReason', maxlength: core.REASON_MAX, autocomplete: 'off', 'aria-label': 'Reason' }), err = el('p', { class: 'ferr', role: 'alert', id: 'wtCoErr' });
    const f = {
      punch: el('label', { class: 'fld' }, 'Punch', punch), at: el('label', { class: 'fld' }, 'New date and time (' + s.tz + ')', at), brk: el('label', { class: 'fld' }, 'Break', brk),
      at2: el('label', { class: 'fld' }, 'Break ended (' + s.tz + ')', at2), cli: el('label', { class: 'fld' }, 'Client ID', cliAdd)
    };
    const sync = () => {
      const k = kind.value, tf = k === 'TIME', ad = k === 'ADD', ca = k === 'CLIENT_ADD', cr = k === 'CLIENT_REMOVE';
      f.punch.hidden = !tf; f.brk.hidden = !ad; f.at.hidden = !(tf || ad); f.at2.hidden = !ad; f.cli.hidden = !(ca || cr);
      f.at.firstChild.textContent = ad ? 'Break started (' + s.tz + ')' : 'New date and time (' + s.tz + ')';
      cliAdd.replaceChildren(el('option', { value: '' }, 'Choose a Client ID…'), ...(ca ? registry.filter(r => r.status === 'active' && have.indexOf(r.id) < 0).map(r => r.id) : have).map(id => el('option', { value: id }, id)));
      if (tf) { const e = eff.events.find(x => String(x.o) === punch.value); if (e) at.value = zonedInput(e.atMs, s.tz); }
    };
    kind.addEventListener('change', sync); punch.addEventListener('change', sync); sync();
    const save = el('button', { type: 'button', class: 'dbtn primary', id: 'wtCoSave', onclick: () => saveCorrection(s, { kind: kind.value, punch, at, at2, brk, cliAdd, reason, err }) }, 'Save correction');
    return el('div', { class: 'wtcorr', role: 'group', 'aria-label': 'New correction' },
      el('p', { class: 'dhelp' }, 'The original punches stay exactly as they were. A correction is added with your reason, and the session is shown as "original + corrections".'),
      el('label', { class: 'fld' }, 'What to correct', kind), f.punch, f.at, f.brk, f.at2, f.cli, el('label', { class: 'fld' }, 'Reason (3 to 200 characters)', reason), err,
      el('div', { class: 'ab' }, save, el('button', { type: 'button', class: 'dbtn', onclick: () => { formFor = ''; drawCorr(); } }, 'Cancel')));
  }
  async function saveCorrection(s, F) {
    F.err.textContent = ''; if (busy) return; if (!online()) { F.err.textContent = 'You are offline. Nothing was saved.'; return; }
    const kv = document.getElementById('wtCoKind').value, o = own(), f = o.fs;
    busy = true; $('wtCoSave').disabled = true;
    try {
      try { await loadRegistry(); } catch (e) { /* the cached list is used */ }
      const c = { kind: kv, reason: F.reason.value, n: Number(F.punch.value) || 0, atMs: fromInput(F.at.value, s.tz), at2Ms: fromInput(F.at2.value, s.tz), type: kv === 'ADD' ? F.brk.value : '', clientId: F.cliAdd.value };
      const plan = L.correctionPlan(s, c, { nowMs: Date.now(), registryStatus: regStatus(c.clientId) });
      if (!plan.ok) { F.err.textContent = plan.reason; return; }
      const d = plan.doc, cid = ids.newKey(), path = 'workCorrections/' + cid;
      await f.setDoc(f.doc(o.db, 'workCorrections', cid), { sid: d.sid, kind: d.kind, n: d.n, type: d.type, clientId: d.clientId, at: d.atMs == null ? null : new Date(d.atMs), at2: d.at2Ms == null ? null : new Date(d.at2Ms), reason: d.reason, closeEid: d.closeEid, closeN: d.closeN, by: o.uid(), createdAt: f.serverTimestamp() });
      await sealSafely([path]);
      formFor = ''; await loadRecent(); drawCorr(); notify('Correction saved.', 'success');
    } catch (e) { F.err.textContent = errText(e); }
    finally { busy = false; const b = document.getElementById('wtCoSave'); if (b) b.disabled = false; drawChain(); }
  }

  /* ---------------------------------------------------------------- wiring */
  async function show() {
    if (!signed) return; say('wtLogErr', '');
    try { await loadSettings(); } catch (e) { say('wtSetErr', errText(e)); }
    try { await loadChain(); drawChain(); } catch (e) { say('wtLogErr', errText(e)); }
    try { await loadRegistry(); await loadRecent(); drawCorr(); } catch (e) { say('wtCorrState', 'Could not load recent sessions. ' + errText(e)); }
  }
  function init() {
    $('wtChainStart').addEventListener('click', startChain); $('wtVerify').addEventListener('click', verifyNow); $('wtWitCopy').addEventListener('click', copyWitness); $('wtWitDl').addEventListener('click', downloadWitness);
    $('wtWitFile').addEventListener('change', compareFile); $('wtSetSave').addEventListener('click', saveSettings); $('wtCorrRefresh').addEventListener('click', async () => { try { await loadRecent(); drawCorr(); say('wtCorrState', ''); } catch (e) { say('wtCorrState', errText(e)); } });
    try { const z = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['Asia/Manila', 'UTC', 'Europe/London', 'America/New_York']; $('wtZoneList').replaceChildren(...z.concat(['UTC']).map(x => el('option', { value: x }))); } catch (e) { /* free text still works */ }
    document.addEventListener('wt:written', async e => { const p = e.detail && e.detail.paths || []; if (signed && p.length) { await sealSafely(p); } });
    document.addEventListener('dash:page', e => { if (e.detail === 'worktrack') show(); });
    document.addEventListener('own:auth', e => { signed = !!(e.detail && e.detail.ok); chain = null; seals = []; recent = []; waiting = []; formFor = ''; if (!signed) { ['wtCorrList', 'wtVerOut'].forEach(i => $(i).replaceChildren()); say('wtChainState', ''); say('wtLogErr', ''); say('wtLogWarn', ''); } });
    window.__wtlog = { get chain() { return chain; }, get settings() { return settings; }, get recent() { return recent; } };      // read-only test hook
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
