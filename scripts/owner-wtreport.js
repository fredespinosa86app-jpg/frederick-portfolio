/* ==========================================================================
   owner-wtreport.js - Owner Panel > WorkTrack, phase W4 (CodeFlow 4.5.0): history, filters, summaries and CSV.
   READ-ONLY. It writes nothing, adds no collection and needs no rules change. The maths is in core-wtreport.js (unit-tested).
   Reads: workSessions in the chosen date range (single-field range on the stored local date), then that session's punches, clients and
   corrections. Filters and the CSV work on what is already loaded, so they cost no reads. Loaded ranges are kept for the page session;
   only Load / Refresh reads again. Everything is drawn as plain text nodes, so stored reasons cannot run as markup.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, core = window.coreWork, L = window.coreWtLog, R = window.coreWtReport, tm = window.coreTime; if (!kit || !core || !L || !R || !tm) return;
  const { el, notify } = kit;
  const $ = id => document.getElementById(id), own = () => window.OWN, DEFAULT_TZ = 'Asia/Manila';
  const say = (id, msg) => { const n = $(id); if (n) n.textContent = msg || ''; };
  const ms = t => !t ? 0 : typeof t.toMillis === 'function' ? t.toMillis() : t instanceof Date ? t.getTime() : Number(t) || 0;
  const settings = () => window.wtSettings || { tz: DEFAULT_TZ, weekStart: 'mon' };
  let signed = false, rows = [], loaded = null, cache = {}, registry = [], busy = false, verifyInfo = null, token = 0;

  const fmtTime = (m, tz) => m == null ? '-' : new Intl.DateTimeFormat('en-GB', { timeZone: tz || DEFAULT_TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(m));
  const clock = (m, tz) => m == null ? '-' : new Intl.DateTimeFormat('en-GB', { timeZone: tz || DEFAULT_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(m));
  const dayName = iso => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso + 'T00:00:00Z'));
  const both = v => v == null ? '-' : R.hm(v) + ' (' + R.hours(v) + ' h)';
  const errText = e => {
    const c = e && e.code;
    if (c === 'permission-denied') return 'The database refused this (permission denied). Sign in again and refresh.';
    if (c === 'unavailable' || /offline|network/i.test(String(e && e.message))) return 'No connection to the database, so nothing was loaded. Check your internet and try again.';
    return 'Please refresh the page and try again.';
  };
  const online = () => navigator.onLine !== false;
  const todayIso = () => tm.localDateKey(Date.now(), settings().tz);

  /* ---------------------------------------------------------------- reading (no writes anywhere in this file) */
  async function loadRegistry() {
    const o = own(), f = o.fs; registry = (await f.getDocs(f.query(f.collection(o.db, 'clientRegistry')))).docs.map(d => d.id).sort();
    drawClientSelect();
  }
  function drawClientSelect() {
    const sel = $('wtHClient'), keep = sel.value; sel.replaceChildren(el('option', { value: '' }, 'All clients'));
    const ids = new Set(registry); rows.forEach(r => r.clientsEff.concat(r.clientsOrig).forEach(c => ids.add(c)));
    Array.from(ids).sort().forEach(id => sel.append(el('option', { value: id }, id)));
    sel.value = Array.from(ids).indexOf(keep) >= 0 ? keep : '';
  }
  const sessionList = async (from, to) => {
    const o = own(), f = o.fs, next = tm.addDaysIso(to, 1);
    return (await f.getDocs(f.query(f.collection(o.db, 'workSessions'), f.where('date', '>=', from), f.where('date', '<', next)))).docs
      .map(d => { const x = d.data(); return { sid: d.id, tz: x.tz || DEFAULT_TZ, date: x.date || '' }; });
  };
  async function readSession(s) {
    const o = own(), f = o.fs, by = c => f.getDocs(f.query(f.collection(o.db, c), f.where('sid', '==', s.sid)));
    const [qe, qc, qa] = await Promise.all([by('workEvents'), by('workCorrections'), by('workAssign')]);
    return {
      sid: s.sid, tz: s.tz, date: s.date,
      events: qe.docs.map(d => { const x = d.data(); return { n: x.n, type: x.type, atMs: ms(x.at), reason: x.reason || '' }; }),
      corrections: qc.docs.map(d => { const x = d.data(); return { id: d.id, kind: x.kind, n: x.n, type: x.type, clientId: x.clientId, atMs: x.at ? ms(x.at) : null, at2Ms: x.at2 ? ms(x.at2) : null, reason: x.reason, createdMs: ms(x.createdAt) }; }),
      assign: qa.docs.map(d => ({ clientId: d.data().clientId, status: d.data().status }))
    };
  }
  async function pool(list, n, fn) { const out = new Array(list.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k]); } })); return out; }

  /* force: read again even if this range is cached.  confirmed: the owner accepted a larger read. */
  async function load(force, confirmed) {
    if (busy) return; say('wtHErr', ''); $('wtHConfirm').hidden = true;
    const from = $('wtHFrom').value, to = $('wtHTo').value, v = R.validRange(from, to);
    if (!v.ok) { say('wtHErr', v.reason); return; }
    const key = from + '|' + to;
    if (cache[key] && !force) { rows = cache[key].rows; loaded = { from, to, atMs: cache[key].atMs, cached: true }; render(); return; }
    if (!online()) { say('wtHErr', 'You are offline. Reports need a connection to read your records.'); return; }
    busy = true; const my = ++token; draw0('Reading the sessions in this range…');
    try {
      const sess = await sessionList(from, to), est = R.estimate(sess.length);
      if (my !== token || !signed) return;
      if (est.tooMany) { say('wtHErr', sess.length + ' sessions are in this range. Choose a shorter range (at most ' + R.MAX_SESSIONS + ' sessions at a time).'); draw0(''); return; }
      if (est.needsConfirm && !confirmed) {
        const box = $('wtHConfirm'); box.replaceChildren(el('p', { class: 'dhelp' }, sess.length + ' sessions found. Loading them reads about ' + est.typical + ' documents (at most ' + est.most + ') of your daily read allowance.'),
          el('div', { class: 'ab' }, el('button', { type: 'button', class: 'dbtn primary', id: 'wtHGo', onclick: () => load(true, true) }, 'Load ' + sess.length + ' sessions')));
        box.hidden = false; draw0(''); return;
      }
      draw0('Reading ' + sess.length + ' session' + (sess.length === 1 ? '' : 's') + '…');
      const raw = await pool(sess, 6, readSession);
      if (my !== token || !signed) return;
      rows = raw.map(R.buildRow); loaded = { from, to, atMs: Date.now(), cached: false }; cache[key] = { rows, atMs: loaded.atMs };
      drawClientSelect(); render();
    } catch (e) { say('wtHErr', errText(e)); draw0(''); }
    finally { busy = false; }
  }

  /* ---------------------------------------------------------------- drawing */
  function draw0(msg) { say('wtHState', msg); }
  const th = (t, scope) => el('th', { scope: scope || 'col' }, t);
  function table(caption, head, body) {
    return el('table', { class: 'wttab' }, el('caption', {}, caption), el('thead', {}, el('tr', {}, ...head.map(h => th(h)))), el('tbody', {}, ...body.map(r => el('tr', {}, ...r.map((c, i) => i === 0 ? th(c, 'row') : el('td', {}, c))))));
  }
  function logLine() {
    if (!verifyInfo) return 'The tamper-evident log has not been verified in this browser session. Use "Verify the log" below before you rely on a report.';
    const when = fmtTime(verifyInfo.atMs, settings().tz);
    if (verifyInfo.status === 'ok') return 'Log verified at ' + when + ': intact' + (verifyInfo.unsealed ? ', with ' + verifyInfo.unsealed + ' record(s) waiting to be sealed.' : '.') + ' Records written since then are not covered.';
    if (verifyInfo.status === 'none') return 'The tamper-evident log has not been started, so these records are not protected.';
    return 'Log checked at ' + when + ': a PROBLEM was found. Open the Tamper-evident log card. These figures may include changed records.';
  }
  function render() {
    const st = settings(), client = $('wtHClient').value, status = $('wtHStatus').value, shown = R.filterRows(rows, { client, status }), sum = R.summarize(shown, { weekStart: st.weekStart });
    const out = $('wtHSummary'), list = $('wtHRows'); out.replaceChildren(); list.replaceChildren();
    $('wtHCsv').hidden = $('wtHRefresh').hidden = !loaded; $('wtHCsv').disabled = !shown.length;
    if (!loaded) { draw0(''); return; }
    draw0(rows.length + ' session' + (rows.length === 1 ? '' : 's') + ' from ' + loaded.from + ' to ' + loaded.to + ', ' + (loaded.cached ? 'kept from ' : 'read at ') + clock(loaded.atMs, st.tz) + '. ' + shown.length + ' shown.' + (loaded.cached ? ' Press Refresh to read again.' : ''));
    out.append(el('p', { class: 'libmeta' }, logLine()));
    const o = sum.overall, ex = o.excluded, exN = ex.incomplete + ex.open + ex.invalid;
    out.append(el('div', { class: 'wtgrid wtsum' },
      el('div', {}, el('span', { class: 'wtlab' }, client ? 'Sessions with ' + client : 'Complete sessions'), el('strong', { class: 'wtbig' }, String(o.sessions))),
      el('div', {}, el('span', { class: 'wtlab' }, 'Session time'), el('strong', { class: 'wtbig' }, both(o.sessionMs))),
      el('div', {}, el('span', { class: 'wtlab' }, 'Working time'), el('strong', { class: 'wtbig' }, both(o.workingMs))),
      el('div', {}, el('span', { class: 'wtlab' }, 'Break time'), el('strong', { class: 'wtbig' }, both(o.breakMs)))));
    out.append(el('p', { class: 'dhelp' }, client ? 'These are the attendance times of the sessions ' + client + ' was on. They are not split between the clients on a session.' : 'Each complete session is counted once, however many clients it had.'));
    if (exN) out.append(el('p', { class: 'libmeta' }, 'Not in the totals: ' + [ex.incomplete && ex.incomplete + ' closed as incomplete', ex.open && ex.open + ' in progress', ex.invalid && ex.invalid + ' with an invalid record'].filter(Boolean).join(', ') + '.'));
    if (o.sessions) {
      const line = g => [g.key, String(g.sessions), both(g.sessionMs), both(g.workingMs), both(g.breakMs)], head = n => [n, 'Sessions', 'Session time', 'Working time', 'Break time'];
      const wk = k => 'Week from ' + dayName(k);
      out.append(el('details', { class: 'wtdet', open: true }, el('summary', {}, 'By day'), table('Totals by day', head('Day'), sum.days.map(g => [dayName(g.key)].concat(line(g).slice(1))))),
        el('details', { class: 'wtdet' }, el('summary', {}, 'By week'), el('p', { class: 'libmeta' }, 'Weeks start on ' + { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }[st.weekStart] + ' (your current setting; the setting keeps no history).'), table('Totals by week', head('Week'), sum.weeks.map(g => [wk(g.key)].concat(line(g).slice(1))))),
        el('details', { class: 'wtdet' }, el('summary', {}, 'By month'), table('Totals by month', head('Month'), sum.months.map(g => line(g)))));
      if (!client && sum.clients.length) out.append(el('details', { class: 'wtdet' }, el('summary', {}, 'By client'), el('p', { class: 'libmeta' }, 'Each row is the attendance time of the sessions that client was on. Rows are not split and must not be added together.'), table('Sessions by client', head('Client ID'), sum.clients.map(line))));
    }
    if (!shown.length) { list.append(el('p', { class: 'dhelp' }, rows.length ? 'No session matches these filters.' : 'No sessions in this date range.')); return; }
    shown.forEach(r => list.append(rowCard(r)));
  }
  const badge = (t, c) => el('span', { class: 'wtb wtb-' + c }, t);
  function rowCard(r) {
    const e = r.eff, tz = r.tz, bits = [badge(R.STATUS_LABEL[r.status], r.status === 'complete' ? 'ok' : 'warn')];
    if (r.corrected) bits.push(badge('Corrected', 'info')); if (r.fellBack) bits.push(badge('Corrections not applied', 'warn'));
    const head = el('summary', { class: 'wthead' }, el('strong', {}, dayName(r.date)), ' ', e.startMs == null ? '' : clock(e.startMs, tz) + ' to ' + (e.endMs == null ? '…' : clock(e.endMs, tz)),
      r.status === 'complete' ? ' · working ' + both(e.workingMs) : '', ' · ', r.clientsEff.length ? r.clientsEff.join(', ') : 'no client', ' ', ...bits);
    const punches = (evs, mark) => table(mark ? 'Effective punches' : 'Original punches', ['#', 'Punch', 'Time (' + tz + ')'], evs.map((x, i) => [String(i + 1), (core.LABEL[x.type] || x.type) + (mark && x.added ? ' (added)' : mark && x.corrected ? ' (changed)' : ''), fmtTime(x.atMs, tz)]));
    const body = el('div', { class: 'wtbody' });
    if (r.problem) body.append(el('p', { class: 'ferr', role: 'note' }, r.problem));
    body.append(el('p', { class: 'libmeta' }, 'Zone ' + tz + '. Original: session ' + both(r.orig.sessionMs) + ', working ' + both(r.orig.workingMs) + ', breaks ' + both(r.orig.breakMs) + '. Effective: session ' + both(e.sessionMs) + ', working ' + both(e.workingMs) + ', breaks ' + both(e.breakMs) + '.'));
    if (r.origEvents.length) body.append(punches(r.origEvents, false));
    if (r.corrected && r.effEvents.length) body.append(punches(r.effEvents, true));
    if (r.corrections.length) {
      const orig = n => r.origEvents.find(x => x.n === n);
      body.append(el('p', { class: 'libmeta' }, 'Corrections (' + r.corrections.length + ')'), ...r.corrections.map(c => el('div', { class: 'wtev' }, el('strong', {}, L.describe(Object.assign({ origType: orig(c.n) && orig(c.n).type }, c), x => fmtTime(x, tz), t => core.LABEL[t] || t)), el('span', { class: 'libmeta' }, 'Reason: ' + c.reason), el('span', { class: 'libmeta' }, 'saved ' + fmtTime(c.createdMs, tz)))));
      if (r.clientsOrig.join() !== r.clientsEff.join()) body.append(el('p', { class: 'libmeta' }, 'Clients: original ' + (r.clientsOrig.join(', ') || 'none') + ', effective ' + (r.clientsEff.join(', ') || 'none') + '.'));
    }
    return el('details', { class: 'wtsess wthist' }, head, body);
  }

  /* ---------------------------------------------------------------- CSV (built here in the browser, nothing is uploaded) */
  function exportCsv() {
    say('wtHErr', '');
    try {
      const shown = R.filterRows(rows, { client: $('wtHClient').value, status: $('wtHStatus').value }); if (!shown.length) { say('wtHErr', 'There is nothing to export for these filters.'); return; }
      const zones = Array.from(new Set(shown.map(r => r.tz))), name = R.csvName(loaded.from, loaded.to, zones.length === 1 ? zones[0] : 'mixed-zones');
      const a = el('a', { href: URL.createObjectURL(new Blob([R.csv(shown)], { type: 'text/csv;charset=utf-8' })), download: name, rel: 'noopener' }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      notify('CSV downloaded (' + shown.length + ' session' + (shown.length === 1 ? '' : 's') + ').', 'success');
    } catch (e) { say('wtHErr', 'Could not create the file. Please try again.'); }
  }

  /* ---------------------------------------------------------------- wiring */
  function reset() { rows = []; loaded = null; cache = {}; registry = []; verifyInfo = null; token++; busy = false; $('wtHSummary').replaceChildren(); $('wtHRows').replaceChildren(); $('wtHConfirm').replaceChildren(); $('wtHConfirm').hidden = true; $('wtHCsv').hidden = $('wtHRefresh').hidden = true; say('wtHErr', ''); draw0(''); $('wtHClient').replaceChildren(el('option', { value: '' }, 'All clients')); }
  async function show() {
    if (!signed) return;
    if (!$('wtHFrom').value || !$('wtHTo').value) { const d = R.defaultRange(todayIso()); $('wtHFrom').value = d.from; $('wtHTo').value = d.to; }
    try { await loadRegistry(); } catch (e) { /* the list still works without the registry */ }
  }
  function init() {
    if (!$('wtHCard')) return;
    $('wtHLoad').addEventListener('click', () => load(false, false)); $('wtHRefresh').addEventListener('click', () => load(true, false)); $('wtHCsv').addEventListener('click', exportCsv);
    $('wtHClient').addEventListener('change', render); $('wtHStatus').addEventListener('change', render);
    document.addEventListener('wt:settings', () => { if (loaded) render(); });
    document.addEventListener('wt:verified', e => { verifyInfo = e.detail || null; if (loaded) render(); });
    document.addEventListener('dash:page', e => { if (e.detail === 'worktrack') show(); });
    document.addEventListener('own:auth', e => { signed = !!(e.detail && e.detail.ok); reset(); });
    window.__wthist = { get rows() { return rows; }, get loaded() { return loaded; } };      // read-only test hook
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
