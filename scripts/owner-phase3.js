/* ==========================================================================
   owner-phase3.js - dashboard pages added in Phase 3:
   Visitors (analytics), Integrations (Google Calendar), Custom domain.
   Visit records live in `visits` (public create-only, owner read). Integration and domain
   settings live in ownerPrivate/config (owner only). Nothing here stores OAuth tokens.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, av = window.availApi;
  if (!kit || !av) return;
  const { el, notify, confirmBox } = kit;
  const $ = id => document.getElementById(id);
  const own = () => window.OWN;
  let ownerOk = false, cfg = {};
  const errText = e => (e && e.code === 'permission-denied') ? 'Permission denied. Publish the updated Firestore rules from the README first.' : 'Please try again.';
  const tz = () => av.cfg().tz;
  const savePriv = async patch => {
    if (!own()) { notify('Could not save. Please sign in as the owner first.', 'error'); return false; }
    try { await own().fs.setDoc(own().fs.doc(own().db, 'ownerPrivate', 'config'), Object.assign({ updatedAt: Date.now() }, patch), { merge: true }); Object.assign(cfg, patch); return true; }
    catch (e) { notify('Could not save. ' + errText(e), 'error'); return false; }
  };

  /* ---------------------------------------------------------------- Visitors */
  const MAXDOCS = 5000;
  let rows = [], range = { from: 0, to: 0 }, truncated = false, loaded = false;
  const dayStart = date => av.wallToMs(date, '00:00', tz());
  function computeRange() {
    const kind = $('vsRange').value, t = av.today(tz());
    let from, to;
    if (kind === 'today') { from = t; to = t; }
    else if (kind === '7') { from = av.addDays(t, -6); to = t; }
    else if (kind === '30') { from = av.addDays(t, -29); to = t; }
    else { from = av.ymd($('vsFrom').value); to = av.ymd($('vsTo').value) || from; if (!from) return null; if (to < from) return null; if (av.addDays(from, 365) < to) return null; }
    return { fromDate: from, toDate: to, from: dayStart(from), to: dayStart(av.addDays(to, 1)) - 1, hourly: from === to };
  }
  const ms = d => { const c = d.createdAt; return c && c.toMillis ? c.toMillis() : (typeof c === 'number' ? c : (c instanceof Date ? c.getTime() : NaN)); };
  async function fetchRows(fromMs) {
    const f = own().fs;
    const snap = await f.getDocs(f.query(f.collection(own().db, 'visits'), f.where('createdAt', '>=', new Date(fromMs)), f.orderBy('createdAt'), f.limit(MAXDOCS)));
    truncated = snap.docs.length >= MAXDOCS;
    /* E2: a summary record stands for one 'section' record per section it lists (older per-section records still work) */
    const out = [];
    snap.docs.map(d => d.data()).forEach(d => {
      const t = ms(d); if (!Number.isFinite(t)) return;
      if (d.type === 'summary') { (Array.isArray(d.secs) ? d.secs : []).forEach(id => out.push({ vid: d.vid, sid: d.sid, type: 'section', path: String(id), device: d.device, browser: d.browser, ref: '', t })); }
      else out.push(Object.assign({}, d, { t }));
    });
    return out;
  }
  const pct = (n, tot) => tot ? Math.round(n * 1000 / tot) / 10 : 0;
  function bars(box, entries, empty, fmt) {
    const tot = entries.reduce((a, e) => a + e[1], 0), max = Math.max(1, ...entries.map(e => e[1]));
    box.replaceChildren(...(entries.length ? entries.slice(0, 10).map(([k, n]) => el('div', { class: 'brow' },
      el('span', { class: 'bl' }, fmt ? fmt(k) : k), el('span', { class: 'bt', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, n * 100 / max) + '%' })),
      el('span', { class: 'bn' }, n + ' (' + pct(n, tot) + '%)'))) : [el('p', { class: 'dstate' }, empty)]));
  }
  const tally = (list, key) => { const m = {}; list.forEach(x => { const k = key(x); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const SEC = { home: 'Home (top of page)', schedule: 'Schedule a meeting', intro: 'Introduction', services: 'Services', training: 'Training', experience: 'Experience', toolkit: 'Toolkit', process: 'How I work', testimonials: 'Testimonials', faq: 'FAQ', 'thank-you': 'Thank you', contact: 'Contact' };

  function render() {
    const r = range, inR = rows.filter(x => x.t >= r.from && x.t <= r.to);
    const views = inR.filter(x => x.type === 'view'), secs = inR.filter(x => x.type === 'section');
    const sessions = new Map(); views.forEach(v => { if (!sessions.has(v.sid)) sessions.set(v.sid, v); });
    inR.forEach(x => { if (!sessions.has(x.sid)) sessions.set(x.sid, x); });
    const uniq = new Set(inR.map(x => x.vid)).size, S = [...sessions.values()];
    $('vsStats').replaceChildren(...[['Visits', sessions.size], ['Unique visitors', uniq], ['Page views', views.length], ['Sections viewed', secs.length]].map(([l, n]) => el('div', { class: 'stat' }, el('span', { class: 'stat-n' }, String(n)), el('span', { class: 'stat-l' }, l))));
    $('vsState').textContent = (truncated ? 'Showing the most recent ' + MAXDOCS + ' records only. ' : '') + (inR.length ? '' : 'No visits recorded in this period yet.');
    // chart
    const keyOf = t => { const p = av.parts(t, tz()); return r.hourly ? p.time.slice(0, 2) : p.date; };
    const keys = []; if (r.hourly) for (let h = 0; h < 24; h++) keys.push(String(h).padStart(2, '0')); else for (let d = r.fromDate; d <= r.toDate; d = av.addDays(d, 1)) keys.push(d);
    const vSess = {}, pv = {}; keys.forEach(k => { vSess[k] = new Set(); pv[k] = 0; });
    inR.forEach(x => { const k = keyOf(x.t); if (vSess[k]) { vSess[k].add(x.sid); if (x.type === 'view') pv[k]++; } });
    const series = keys.map(k => ({ k, v: vSess[k].size, p: pv[k] })), max = Math.max(1, ...series.map(s => s.v));
    $('vsChartT').textContent = r.hourly ? 'Visits by hour (' + tz() + ')' : 'Visits per day (' + tz() + ')';
    const W = 640, H = 200, pad = 28, bw = (W - pad) / series.length, NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H + 24}`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Bar chart of visits. ' + sessions.size + ' visits in the period.'); svg.setAttribute('class', 'vsvg');
    const mk = (n, a, t) => { const e = document.createElementNS(NS, n); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v)); if (t != null) e.textContent = t; return e; };
    [0, 0.5, 1].forEach(f => { svg.append(mk('line', { x1: pad, x2: W, y1: H - f * (H - 10), y2: H - f * (H - 10), class: 'grid' }), mk('text', { x: pad - 4, y: H - f * (H - 10) + 4, 'text-anchor': 'end', class: 'ax' }, String(Math.round(max * f)))); });
    const every = Math.ceil(series.length / 10);
    series.forEach((s, i) => { const h = s.v / max * (H - 10), x = pad + i * bw; const b = mk('rect', { x: x + bw * 0.15, y: H - h, width: Math.max(1, bw * 0.7), height: h, rx: 2, class: 'bar' }); b.append(mk('title', {}, s.k + ': ' + s.v + ' visit' + (s.v === 1 ? '' : 's') + ', ' + s.p + ' page view' + (s.p === 1 ? '' : 's'))); svg.append(b); if (i % every === 0) svg.append(mk('text', { x: x + bw / 2, y: H + 16, 'text-anchor': 'middle', class: 'ax' }, r.hourly ? s.k : s.k.slice(5))); });
    $('vsChart').replaceChildren(svg);
    const tb = el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, r.hourly ? 'Hour' : 'Date'), el('th', {}, 'Visits'), el('th', {}, 'Page views'))), el('tbody', {}, ...series.map(s => el('tr', {}, el('td', {}, s.k), el('td', {}, String(s.v)), el('td', {}, String(s.p))))));
    $('vsTable').replaceChildren(tb);
    bars($('vsSections'), tally([...secs.filter(x => x.path !== 'home'), ...views], x => x.path || 'home'), 'No section views yet.', k => SEC[k] || k);
    bars($('vsRefs'), tally(S, x => x.ref || 'Direct / unknown'), 'No visits yet.', k => k.startsWith('utm:') ? 'Campaign: ' + k.slice(4) : k);
    bars($('vsDevices'), tally(S, x => x.device || 'unknown'), 'No visits yet.', k => k[0].toUpperCase() + k.slice(1));
    bars($('vsBrowsers'), tally(S, x => x.browser || 'Other'), 'No visits yet.');
  }
  async function load(force) {
    if (!ownerOk || !own()) { $('vsState').textContent = 'Sign in as the owner to see visitor activity.'; return; }
    const r = computeRange(); if (!r) { $('vsState').textContent = 'Choose a valid date range (up to one year).'; return; }
    range = r;
    try {
      if (force || !loaded || r.from < (rows.base || Infinity)) { $('vsState').textContent = 'Loading…'; const data = await fetchRows(r.from); data.base = r.from; rows = data; loaded = true; }
      render();
    } catch (e) { $('vsState').textContent = 'Could not load visitor data. ' + errText(e); }
  }
  $('vsRange').addEventListener('change', () => { const c = $('vsRange').value === 'custom'; $('vsFromW').hidden = !c; $('vsToW').hidden = !c; if (!c) load(); });
  ['vsFrom', 'vsTo'].forEach(id => $(id).addEventListener('change', () => load()));
  $('vsReload').addEventListener('click', () => load(true));
  $('vsPurge').addEventListener('click', async () => {
    if (!await confirmBox('Delete old visit records?', 'Every record older than 90 days will be permanently deleted. Newer records are kept.', 'Delete')) return;
    const f = own().fs; let n = 0;
    try {
      for (let i = 0; i < 10; i++) {
        const snap = await f.getDocs(f.query(f.collection(own().db, 'visits'), f.where('createdAt', '<', new Date(Date.now() - 90 * 864e5)), f.orderBy('createdAt'), f.limit(400)));
        if (!snap.docs.length) break;
        for (const d of snap.docs) { await f.deleteDoc(f.doc(own().db, 'visits', d.id)); n++; }
        if (snap.docs.length < 400) break;
      }
      own().log('Old visit records deleted'); notify(n ? n + ' old records deleted.' : 'No records older than 90 days.', n ? 'success' : 'info'); load(true);
    } catch (e) { notify('Could not delete. ' + errText(e), 'error'); }
  });

  /* ---------------------------------------------------------------- Google Calendar (OAuth 2.0, token in memory only) */
  const SCOPE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy';
  let tok = null, exp = 0, expired = false, gisLoading = null;
  const loadGis = () => gisLoading || (gisLoading = new Promise((res, rej) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return res();
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = () => res(); s.onerror = () => { gisLoading = null; rej(new Error('load')); }; document.head.append(s);
  }));
  const connected = () => !!tok && Date.now() < exp && !expired;
  function gcRender() {
    const st = $('gcStatus'), id = ($('gcClient').value || '').trim();
    let txt, cls = '';
    if (connected()) { txt = 'Connected (until this page is reloaded or the token expires)'; cls = 'ok'; }
    else if (tok && (expired || Date.now() >= exp)) { txt = 'Access expired or was revoked. Press Reconnect.'; cls = 'warn'; }
    else if (!cfg.googleClientId) { txt = 'Not connected. Add your OAuth Client ID first (see setup instructions).'; }
    else txt = 'Not connected.';
    st.textContent = txt; st.className = 'dstate-line ' + cls;
    $('gcConnect').textContent = tok ? 'Reconnect' : 'Connect'; $('gcConnect').disabled = !(cfg.googleClientId || id);
    $('gcDisconnect').disabled = !tok;
  }
  async function gcFetch(url, opt) {
    if (!connected()) throw Object.assign(new Error('not connected'), { code: 'noauth' });
    const r = await fetch(url, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, opt && opt.headers) }));
    if (r.status === 401) { expired = true; gcRender(); throw Object.assign(new Error('expired'), { code: 'noauth' }); }
    if (!r.ok) throw Object.assign(new Error('Google API ' + r.status), { code: 'api', status: r.status });
    return r.status === 204 ? null : r.json();
  }
  async function gcConnect() {
    const id = ($('gcClient').value || cfg.googleClientId || '').trim();
    if (!/^[\w\-]+\.apps\.googleusercontent\.com$/.test(id)) return notify('That does not look like a Google OAuth Client ID (it ends with .apps.googleusercontent.com).', 'error');
    if (id !== cfg.googleClientId) await savePriv({ googleClientId: id });
    try { await loadGis(); } catch (e) { return notify('Could not load Google sign-in. Check your connection or ad blocker.', 'error'); }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: id, scope: SCOPE,
      callback: resp => {
        if (resp.error) { notify('Google did not grant access (' + resp.error + ').', 'error'); return; }
        if (!google.accounts.oauth2.hasGrantedAllScopes(resp, ...SCOPE.split(' '))) { notify('Some requested permissions were not granted, so Calendar cannot be used. Press Reconnect and allow all.', 'warning'); return; }
        tok = resp.access_token; exp = Date.now() + (Number(resp.expires_in) || 3600) * 1000 - 30000; expired = false; gcRender(); notify('Google Calendar connected.', 'success');
      },
      error_callback: e => notify(e && e.type === 'popup_closed' ? 'Google sign-in was cancelled.' : 'Google sign-in failed. Check that this site address is listed under Authorized JavaScript origins.', 'error')
    });
    client.requestAccessToken({ prompt: tok ? '' : 'consent' });
  }
  async function gcDisconnect() {
    const t = tok; tok = null; exp = 0; expired = false; gcRender();
    try { if (t && window.google && google.accounts) google.accounts.oauth2.revoke(t, () => notify('Google Calendar disconnected and access revoked.', 'success')); else notify('Disconnected.', 'success'); } catch (e) { notify('Disconnected here. Revoke access at myaccount.google.com/permissions if needed.', 'warning'); }
  }
  const iso = (u) => new Date(u).toISOString();
  async function conflictFor(r) {
    const u = av.requestToMs(r); if (!Number.isFinite(u)) return false;
    try { const j = await gcFetch('https://www.googleapis.com/calendar/v3/freeBusy', { method: 'POST', body: JSON.stringify({ timeMin: iso(u), timeMax: iso(u + av.cfg().slot * 60000), items: [{ id: 'primary' }] }) }); return !!(j && j.calendars && j.calendars.primary && j.calendars.primary.busy && j.calendars.primary.busy.length); }
    catch (e) { notify(e.code === 'noauth' ? 'Google Calendar needs to be reconnected to check conflicts.' : 'Could not check Google Calendar conflicts.', 'warning'); return false; }
  }
  async function createEvent(r) {
    const u = av.requestToMs(r); if (!Number.isFinite(u) || !r.id) throw new Error('bad request');
    const q = 'privateExtendedProperty=' + encodeURIComponent('portfolioRequestId=' + r.id) + '&timeMin=' + encodeURIComponent(iso(u - 864e5)) + '&timeMax=' + encodeURIComponent(iso(u + 2 * 864e5));
    const ex = await gcFetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + q);
    if (ex && ex.items && ex.items.length) return { duplicate: true };
    const hub = window.googleHub, zl = hub ? hub.linkFor(r.platform) : '', meet = !!(hub && hub.meetFor(r.platform));   /* E4: Zoom link / new Google Meet */
    await gcFetch('https://www.googleapis.com/calendar/v3/calendars/primary/events' + (meet ? '?conferenceDataVersion=1' : ''), { method: 'POST', body: JSON.stringify({
      summary: 'Discovery call: ' + (r.name || 'Client'), description: 'Booked through the portfolio.\nEmail: ' + (r.email || '') + '\nPlatform: ' + (r.platform || '') + (zl ? '\nJoin Zoom: ' + zl : '') + '\n\n' + String(r.message || '').slice(0, 800),
      location: zl || undefined, conferenceData: meet ? { createRequest: { requestId: 'pf-' + String(r.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40), conferenceSolutionKey: { type: 'hangoutsMeet' } } } : undefined,
      start: { dateTime: iso(u), timeZone: av.tzOk(r.tz) ? r.tz : tz() }, end: { dateTime: iso(u + av.cfg().slot * 60000), timeZone: av.tzOk(r.tz) ? r.tz : tz() }, extendedProperties: { private: { portfolioRequestId: String(r.id) } } }) });
    return { duplicate: false };
  }
  async function onConfirmed(r) {
    if (!connected() || !$('gcAuto').checked) return;
    try { const res = await createEvent(r); notify(res.duplicate ? 'Already on your Google Calendar.' : 'Meeting added to Google Calendar.', res.duplicate ? 'info' : 'success'); }
    catch (e) { notify(e.code === 'noauth' ? 'Meeting confirmed, but Google Calendar needs to be reconnected.' : 'Meeting confirmed, but it could not be added to Google Calendar.', 'warning'); }
  }
  window.calendarApi = { connected, conflictFor, createEvent, onConfirmed };
  $('gcConnect').addEventListener('click', gcConnect); $('gcDisconnect').addEventListener('click', gcDisconnect);
  $('gcSave').addEventListener('click', async () => { const id = $('gcClient').value.trim(); if (id && !/^[\w\-]+\.apps\.googleusercontent\.com$/.test(id)) return notify('That does not look like a Google OAuth Client ID.', 'error'); if (await savePriv({ googleClientId: id })) { notify('Client ID saved.', 'success'); gcRender(); } });
  $('gcClient').addEventListener('input', gcRender);
  $('gcAuto').checked = (() => { try { return localStorage.getItem('gcAuto') === '1'; } catch (e) { return false; } })();
  $('gcAuto').addEventListener('change', () => { try { localStorage.setItem('gcAuto', $('gcAuto').checked ? '1' : '0'); } catch (e) { /* ignore */ } });
  setInterval(() => { if (tok && Date.now() >= exp) gcRender(); }, 30000);

  /* ---------------------------------------------------------------- Custom domain */
  const GH_IPS = ['185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153'], GH_HOST = 'fredespinosa86app-jpg.github.io';
  const normDomain = v => String(v || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  const validDomain = d => /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(d) && !/\.github\.io$/.test(d);
  const isApex = d => d.split('.').length === 2 || (/\.(com|co|org|net|gov|edu|ac)\.[a-z]{2}$/.test(d) && d.split('.').length === 3);
  const rec = (t, h, v) => el('tr', {}, el('td', {}, t), el('td', {}, h), el('td', {}, v));
  function dmDnsRender(d) {
    const box = $('dmDns'); if (!d) { box.replaceChildren(el('p', { class: 'dhelp' }, 'Save a domain to see the records.')); return; }
    const rows2 = isApex(d) ? [...GH_IPS.map(ip => rec('A', '@', ip)), rec('CNAME', 'www', GH_HOST)] : [rec('CNAME', d.split('.')[0], GH_HOST)];
    box.replaceChildren(el('p', { class: 'dhelp' }, 'Add these at your domain registrar or DNS host. Remove any conflicting A, AAAA or CNAME records for the same name. If you use a proxy (for example Cloudflare’s orange cloud), turn it off until verified.'),
      el('div', { class: 'tscroll' }, el('table', { class: 'dns' }, el('thead', {}, el('tr', {}, el('th', {}, 'Type'), el('th', {}, 'Name / host'), el('th', {}, 'Value'))), el('tbody', {}, ...rows2))));
  }
  const dns = async (name, type) => {
    const code = { A: 1, AAAA: 28, CNAME: 5 }[type], r = await fetch('https://dns.google/resolve?name=' + encodeURIComponent(name) + '&type=' + type, { cache: 'no-store' });
    if (!r.ok) throw new Error('dns'); const j = await r.json(); return (j.Answer || []).filter(a => a.type === code).map(a => String(a.data).replace(/\.$/, '').toLowerCase());
  };
  function dmRender() {
    const d = cfg.domain || ''; $('dmName').value = $('dmName').value || d;
    $('dmVerify').disabled = !d; $('dmRemove').disabled = !d; $('dmCname').disabled = !d; dmDnsRender(d);
    const st = $('dmStatus');
    if (!d) { st.textContent = 'No custom domain set. The site is served at its GitHub Pages address.'; st.className = 'dstate-line'; }
    else if (cfg.domainStatus === 'verified') { st.textContent = d + ' is verified: DNS points to GitHub Pages and the site loads over HTTPS. Last checked ' + new Date(cfg.domainChecked).toLocaleString() + '.'; st.className = 'dstate-line ok'; }
    else { st.textContent = d + ' is saved but NOT verified' + (cfg.domainChecked ? ' (last check ' + new Date(cfg.domainChecked).toLocaleString() + ')' : '') + '. Configure DNS, then press Verify.'; st.className = 'dstate-line warn'; }
  }
  async function dmVerify() {
    const d = cfg.domain; if (!d) return;
    const checks = [], list = $('dmChecks'); $('dmVerify').disabled = true; list.replaceChildren(el('li', {}, 'Checking…'));
    const add = (ok, t) => checks.push([ok, t]);
    let dnsOk = false;
    try {
      if (isApex(d)) {
        const a = await dns(d, 'A'); const good = a.filter(x => GH_IPS.includes(x));
        dnsOk = a.length > 0 && good.length === a.length;
        add(dnsOk, dnsOk ? 'DNS: A records point to GitHub Pages (' + a.join(', ') + ').' : a.length ? 'DNS: A records are ' + a.join(', ') + ', which are not all GitHub Pages addresses (' + GH_IPS.join(', ') + ').' : 'DNS: no A records found yet.');
      } else {
        const c = await dns(d, 'CNAME'); dnsOk = c.includes(GH_HOST);
        add(dnsOk, dnsOk ? 'DNS: CNAME points to ' + GH_HOST + '.' : c.length ? 'DNS: CNAME is ' + c.join(', ') + ', expected ' + GH_HOST + '.' : 'DNS: no CNAME record found yet (or the name is proxied).');
      }
    } catch (e) { add(false, 'DNS: the lookup service could not be reached. Try again later.'); }
    let httpsOk = false, contentOk = false;
    if (dnsOk) {
      try { const r = await fetch('https://' + d + '/index.html', { cache: 'no-store' }); httpsOk = r.ok; const t = r.ok ? await r.text() : ''; contentOk = /Frederick Espinosa/.test(t) && /id="ownerLogin"/.test(t); }
      catch (e) { httpsOk = false; }
      add(httpsOk, httpsOk ? 'HTTPS: https://' + d + ' answers with a valid certificate.' : 'HTTPS: https://' + d + ' is not reachable with a valid certificate yet. After DNS is correct, GitHub can take up to 24 hours to issue it; then tick Enforce HTTPS in Pages settings.');
      if (httpsOk) add(contentOk, contentOk ? 'Site: the domain serves this portfolio.' : 'Site: the domain answers, but not with this portfolio. Check the GitHub Pages custom domain setting.');
    }
    list.replaceChildren(...checks.map(([ok, t]) => el('li', { class: ok ? 'ok' : 'bad' }, el('span', { 'aria-hidden': 'true' }, ok ? '✓ ' : '✕ '), t)));
    const verified = dnsOk && httpsOk && contentOk;
    if (await savePriv({ domainStatus: verified ? 'verified' : 'pending', domainChecked: Date.now() })) notify(verified ? 'Domain verified.' : 'Domain is not fully configured yet.', verified ? 'success' : 'warning');
    dmRender(); $('dmVerify').disabled = !cfg.domain;
  }
  $('dmSave').addEventListener('click', async () => {
    const d = normDomain($('dmName').value); if (!validDomain(d)) return notify('Enter a valid domain such as example.com or www.example.com (not a github.io address).', 'error');
    if (d === cfg.domain) return notify('That domain is already saved.', 'info');
    if (await savePriv({ domain: d, domainStatus: 'pending', domainChecked: 0 })) { $('dmChecks').replaceChildren(); notify('Domain saved. It is not connected until you verify it.', 'success'); dmRender(); }
  });
  $('dmVerify').addEventListener('click', dmVerify);
  $('dmRemove').addEventListener('click', async () => {
    if (!await confirmBox('Remove this domain?', 'Only the saved name is removed here. Also delete the custom domain in GitHub Pages settings (and the CNAME file) and remove its DNS records.', 'Remove')) return;
    if (await savePriv({ domain: '', domainStatus: '', domainChecked: 0 })) { $('dmName').value = ''; $('dmChecks').replaceChildren(); notify('Domain removed.', 'success'); dmRender(); }
  });
  $('dmCname').addEventListener('click', () => {
    const a = el('a', { href: URL.createObjectURL(new Blob([cfg.domain + '\n'], { type: 'application/octet-stream' })), download: 'CNAME' }); document.body.append(a); a.click(); a.remove();
  });

  /* E4: per-day summary of the period currently loaded on the Visitors page (no extra database reads) */
  window.visitorsApi = { daily: () => {
    if (!loaded || !range || !range.from) return [];
    const m = {}; rows.filter(x => x.t >= range.from && x.t <= range.to).forEach(x => {
      const d = av.parts(x.t, tz()).date, o = m[d] || (m[d] = { s: new Set(), v: new Set(), views: 0, sections: 0 });
      o.s.add(x.sid); o.v.add(x.vid); if (x.type === 'view') o.views++; if (x.type === 'section') o.sections++;
    });
    return Object.keys(m).sort().map(d => ({ date: d, visits: m[d].s.size, unique: m[d].v.size, views: m[d].views, sections: m[d].sections }));
  } };
  /* ---------------------------------------------------------------- wiring */
  let unsub = null;
  document.addEventListener('own:auth', e => {
    ownerOk = !!(e.detail && e.detail.ok); if (unsub) { unsub(); unsub = null; } rows = []; loaded = false;
    if (!ownerOk) { tok = null; exp = 0; cfg = {}; gcRender(); return; }
    const f = own().fs;
    unsub = f.onSnapshot(f.doc(own().db, 'ownerPrivate', 'config'), s => { cfg = s.exists() ? s.data() : {}; if (document.activeElement !== $('gcClient')) $('gcClient').value = cfg.googleClientId || ''; gcRender(); dmRender(); }, () => { /* rules not published yet */ });
  });
  document.addEventListener('dash:page', e => { if (e.detail === 'visitors') load(); if (e.detail === 'integrations') gcRender(); if (e.detail === 'domain') dmRender(); });
})();
