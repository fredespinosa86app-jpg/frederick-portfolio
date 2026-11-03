/* ==========================================================================
   owner-google.js - Owner Panel > Integrations: one place for the Google tools (Enhancement E4)
   Hub (status of every Google tool) + Google Sheets sending (your own Apps Script) + Zoom link + Google Meet for Calendar events.
   Settings live in ownerPrivate/google (owner only). They are NEVER put in backups, files or ZIPs.
   Drive and Gmail stay ON HOLD by the owner's decision; the hub shows them as such.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit; if (!kit) return;
  const { el, notify, confirmBox } = kit;
  const $ = id => document.getElementById(id), own = () => window.OWN;
  const URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/;
  const TOKEN_MIN = 16, BATCH = 200, PAUSE = 700;
  let cfg = {}, signed = false, busy = false, unsub = null;
  const errText = e => (e && e.code === 'permission-denied') ? 'The database refused this (permission denied). Sign in as the owner again.' : 'Please try again.';

  /* ---------------------------------------------------------------- Zoom link */
  function zoomOk(u) {
    try {
      const x = new URL(String(u).trim()); if (x.protocol !== 'https:' || x.username || x.password || String(u).length > 300) return '';
      const h = x.hostname.toLowerCase();
      if (!(h === 'zoom.us' || h.endsWith('.zoom.us') || h === 'zoom.com' || h.endsWith('.zoom.com'))) return '';
      if (!/^\/(j|my|w)\/[A-Za-z0-9_.\-]{3,120}$/.test(x.pathname)) return '';
      return x.href;
    } catch (e) { return ''; }
  }
  const linkFor = platform => (platform === 'Zoom' && zoomOk(cfg.zoomLink || '')) ? zoomOk(cfg.zoomLink) : '';
  const meetFor = platform => platform === 'Google Meet' && cfg.meetAuto === true;

  /* ---------------------------------------------------------------- Sheets */
  const day = ms => { try { const p = window.availApi.parts(ms, window.availApi.cfg().tz); return p.date + ' ' + p.time; } catch (e) { return new Date(ms).toISOString().slice(0, 16).replace('T', ' '); } };
  const toMs = c => (c && c.toMillis) ? c.toMillis() : (typeof c === 'number' ? c : (c instanceof Date ? c.getTime() : 0));
  const cell = v => { v = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, 1000); return /^[=+\-@\t\r]/.test(v) ? "'" + v : v; };
  const BUILD = {
    Meetings: () => ((window.dashData && window.dashData.requests()) || []).map(r => [r.id, day(toMs(r.createdAt)), r.status || 'new', r.name, r.email, r.company, r.service, r.date, r.time, r.tz, r.platform, r.message]),
    Clients: () => ((window.clientsApi && window.clientsApi.list()) || []).map(c => [c.id, c.name, c.email, c.phone, c.company, c.rate == null ? '' : c.rate, c.arrangement, c.invoiceDue, c.status, c.notes]),
    Visitors: () => ((window.visitorsApi && window.visitorsApi.daily()) || []).map(d => [d.date, d.date, d.visits, d.unique, d.views, d.sections])
  };
  async function call(body) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 30000);
    try {
      const r = await fetch(cfg.sheetsUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ token: cfg.sheetsToken }, body)), redirect: 'follow', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal });
      if (!r.ok) throw new Error('http ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }
  const ready = () => URL_RE.test(cfg.sheetsUrl || '') && String(cfg.sheetsToken || '').length >= TOKEN_MIN;
  const say = (id, t, cls) => { const e = $(id); e.textContent = t; if (cls !== undefined) e.className = 'dstate-line ' + cls; };
  async function sendTab(tab) {
    const rows = BUILD[tab]();
    if (!rows.length) return { sent: 0, none: true };
    let added = 0, updated = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      say('gsState', 'Sending ' + tab + '… ' + Math.min(rows.length, i + BATCH) + ' of ' + rows.length);
      const res = await call({ tab, rows: rows.slice(i, i + BATCH).map(r => r.map(cell)) });
      if (!res || res.ok !== true) throw new Error(res && res.error === 'denied' ? 'The token was not accepted.' : 'The sheet script refused the request.');
      added += res.added || 0; updated += res.updated || 0;
      if (i + BATCH < rows.length) await new Promise(r => setTimeout(r, PAUSE));
    }
    return { sent: rows.length, added, updated };
  }
  async function sendMany(tabs) {
    if (busy) return; if (!ready()) return notify('Save a valid Apps Script address and token first.', 'error');
    busy = true; lock(true); const out = [];
    try {
      for (const t of tabs) {
        const r = await sendTab(t);
        out.push(r.none ? t + ': nothing to send' : t + ': ' + r.added + ' added, ' + r.updated + ' updated');
        if (!r.none) await save({ lastSync: Object.assign({}, cfg.lastSync || {}, { [t]: Date.now() }) }, true);
      }
      say('gsState', out.join(' · '), 'ok'); notify('Sent to Google Sheets.', 'success'); own().log && own().log('Google Sheets: ' + tabs.join(', ') + ' sent');
    } catch (e) {
      say('gsState', 'Stopped: ' + (e && e.name === 'AbortError' ? 'the script did not answer in time.' : (e.message && !/^http|Failed to fetch|NetworkError/.test(e.message) ? e.message : 'could not reach the script. Check the address and that it is deployed for Anyone.')) + (out.length ? ' Already sent: ' + out.join(' · ') : ''), 'warn');
      notify('Could not send to Google Sheets.', 'error');
    } finally { busy = false; lock(false); }
  }
  const lock = () => render();

  /* ---------------------------------------------------------------- save + render */
  async function save(patch, quiet) {
    const o = own(); if (!o) { notify('Could not save. Please sign in as the owner first.', 'error'); return false; }
    try { await o.fs.setDoc(o.fs.doc(o.db, 'ownerPrivate', 'google'), Object.assign({ updatedAt: Date.now() }, patch), { merge: true }); Object.assign(cfg, patch); return true; }
    catch (e) { if (!quiet) notify('Could not save. ' + errText(e), 'error'); return false; }
  }
  const stamp = ms => ms ? new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never';
  function chip(id, txt, cls) { const e = $(id); if (e) { e.textContent = txt; e.className = 'dstate-line ' + (cls || ''); } }
  function render() {
    if (!$('gsUrl')) return;
    const r = ready(), ls = cfg.lastSync || {};
    if (document.activeElement !== $('gsUrl')) $('gsUrl').value = cfg.sheetsUrl || '';
    if (document.activeElement !== $('gsToken')) $('gsToken').value = cfg.sheetsToken || '';
    if (document.activeElement !== $('zmLink')) $('zmLink').value = cfg.zoomLink || '';
    $('gmAuto').checked = cfg.meetAuto === true;
    ['gsTest', 'gsDisc', 'gsMeet', 'gsCli', 'gsVis', 'gsAll'].forEach(id => { $(id).disabled = busy || !r; });
    $('gsSave').disabled = busy;
    $('gsLast').textContent = r ? 'Last sent: Meetings ' + stamp(ls.Meetings) + ' · Clients ' + stamp(ls.Clients) + ' · Visitors ' + stamp(ls.Visitors) : 'Not connected yet.';
    const cal = $('gcStatus') ? $('gcStatus').textContent : '', calOk = /^Connected/.test(cal);
    chip('hubAuth', signed ? 'Active: you are signed in as the owner' : 'Sign in to see this', signed ? 'ok' : 'warn');
    chip('hubCal', calOk ? 'Connected' : (cal ? 'Not connected (see Google Calendar below)' : 'Not connected'), calOk ? 'ok' : 'warn');
    chip('hubMeet', cfg.meetAuto === true ? (calOk ? 'On: a Meet link is added to calendar events' : 'On, but Calendar is not connected') : 'Off', cfg.meetAuto === true && calOk ? 'ok' : '');
    chip('hubSheets', r ? 'Set up' : 'Not set up', r ? 'ok' : 'warn');
    chip('hubZoom', zoomOk(cfg.zoomLink || '') ? 'Link saved' : 'No link saved', zoomOk(cfg.zoomLink || '') ? 'ok' : '');
    chip('hubDrive', 'On hold (your decision)', 'warn'); chip('hubGmail', 'On hold (your decision)', 'warn');
  }

  /* ---------------------------------------------------------------- wiring */
  const wire = () => {
    if (!$('gsUrl')) return;
    $('gsSave').addEventListener('click', async () => {
      const u = $('gsUrl').value.trim(), t = $('gsToken').value.trim();
      if (!u && !t) return notify('Enter the Apps Script address and your token, or press Disconnect.', 'error');
      if (!URL_RE.test(u)) return notify('The address must look like https://script.google.com/macros/s/…/exec (the Web app URL).', 'error');
      if (t.length < TOKEN_MIN || /\s/.test(t)) return notify('The token must be at least ' + TOKEN_MIN + ' characters with no spaces (the same text as the TOKEN script property).', 'error');
      if (await save({ sheetsUrl: u, sheetsToken: t })) { notify('Saved. Press Test connection.', 'success'); render(); }
    });
    $('gsTest').addEventListener('click', async () => {
      if (busy || !ready()) return; busy = true; render(); say('gsState', 'Testing…', '');
      try { const r = await call({ action: 'ping' }); r && r.ok ? (say('gsState', 'Connected: the script answered and accepted the token.', 'ok'), notify('Connection works.', 'success')) : (say('gsState', r && r.error === 'denied' ? 'The script is there, but it did not accept the token.' : 'The script answered with an error.', 'warn'), notify('The test failed.', 'error')); }
      catch (e) { say('gsState', 'Could not reach the script. Check the address, that it is deployed as a Web app for Anyone, and your internet connection.', 'warn'); notify('The test failed.', 'error'); }
      busy = false; render();
    });
    $('gsDisc').addEventListener('click', async () => {
      if (!await confirmBox('Disconnect Google Sheets?', 'The saved address and token are deleted from your database. Data already in your sheet stays there.', 'Disconnect')) return;
      if (await save({ sheetsUrl: '', sheetsToken: '' })) { notify('Google Sheets disconnected.', 'success'); say('gsState', 'Disconnected.', ''); render(); own().log && own().log('Google Sheets disconnected'); }
    });
    const confirmSend = async tabs => { if (!await confirmBox('Send to Google Sheets?', 'These records contain personal details (names, e-mails, messages) and will be copied to your own Google Sheet. Continue?', 'Send')) return; sendMany(tabs); };
    $('gsMeet').addEventListener('click', () => confirmSend(['Meetings']));
    $('gsCli').addEventListener('click', () => confirmSend(['Clients']));
    $('gsVis').addEventListener('click', () => sendMany(['Visitors']));
    $('gsAll').addEventListener('click', () => confirmSend(['Meetings', 'Clients', 'Visitors']));
    $('zmSave').addEventListener('click', async () => {
      const v = $('zmLink').value.trim(); if (!v) return notify('Paste your Zoom meeting link, or press Clear.', 'error');
      const ok = zoomOk(v); if (!ok) return notify('That does not look like a Zoom meeting link (https://…zoom.us/j/… or /my/…).', 'error');
      if (await save({ zoomLink: ok })) { notify('Zoom link saved.', 'success'); render(); }
    });
    $('zmClear').addEventListener('click', async () => { if (await save({ zoomLink: '' })) { notify('Zoom link removed.', 'success'); render(); } });
    $('gmAuto').addEventListener('change', async () => { const v = $('gmAuto').checked; if (!await save({ meetAuto: v })) $('gmAuto').checked = !v; render(); });
    $('gsCopyScript').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('gsScript').textContent); notify('Script copied.', 'success'); } catch (e) { notify('Select the script text and copy it manually.', 'info'); } });
    document.addEventListener('dash:page', e => { if (e.detail === 'integrations') render(); });
    const st = $('gcStatus'); if (st) new MutationObserver(render).observe(st, { childList: true, characterData: true, subtree: true });
  };
  document.addEventListener('own:auth', e => {
    signed = !!(e.detail && e.detail.ok); if (unsub) { unsub(); unsub = null; } cfg = {};
    if (signed) { const o = own(); unsub = o.fs.onSnapshot(o.fs.doc(o.db, 'ownerPrivate', 'google'), s => { cfg = s.exists() ? s.data() : {}; render(); }); }
    render();
  });
  window.googleHub = { linkFor, meetFor, zoomOk, cfg: () => Object.assign({}, cfg, { sheetsToken: cfg.sheetsToken ? '***' : '' }) };
  wire();
})();
