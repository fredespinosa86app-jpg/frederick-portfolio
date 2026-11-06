/* ==========================================================================
   core-booking.js - pure logic of the "outside calendar" option (CodeFlow 4.5.0, phase D1 Discovery Call). No DOM, no database.
   Runs in the browser (window.coreBooking) and in Node (module.exports) so the SAME code is unit-tested.
   The owner pastes an embed code or a link. This file ONLY reads one web address out of it and checks that address
   against a fixed provider list. Nothing pasted is ever put on the page: the page builds its own frame from the checked address.
   ========================================================================== */
(function (root) {
  'use strict';
  const MAX_INPUT = 4000, MAX_URL = 500;
  /* host: exact match, or a sub-domain of it when sub is true. Every entry here must also be in the page's CSP frame-src. */
  const PROVIDERS = [
    { id: 'calendly', name: 'Calendly', hosts: [['calendly.com', false]] },
    { id: 'ghl', name: 'GoHighLevel', hosts: [['leadconnectorhq.com', true], ['msgsndr.com', true], ['gohighlevel.com', true]] },
    { id: 'cal', name: 'Cal.com', hosts: [['cal.com', true]] },
    { id: 'tidycal', name: 'TidyCal', hosts: [['tidycal.com', false]] },
    { id: 'acuity', name: 'Acuity Scheduling', hosts: [['acuityscheduling.com', true], ['as.me', true]] },
    { id: 'savvycal', name: 'SavvyCal', hosts: [['savvycal.com', false]] },
    { id: 'google', name: 'Google Calendar', hosts: [['calendar.google.com', false]] }
  ];
  const CSP_HOSTS = PROVIDERS.flatMap(p => p.hosts.map(h => h[1] ? 'https://*.' + h[0] : 'https://' + h[0]).concat(p.hosts.filter(h => h[1]).map(h => 'https://' + h[0])));

  const unesc = s => String(s).replace(/&amp;/gi, '&').replace(/&#38;/g, '&').replace(/&quot;/gi, '"').replace(/&#x2F;/gi, '/').replace(/&#47;/g, '/').trim();

  /* find ONE candidate address: iframe src, then a data-url (Calendly inline widget), then a bare link */
  function candidate(text) {
    if (!/[<>]/.test(text)) { const m = text.match(/^\s*(https?:\/\/\S+)\s*$/i); return m ? m[1] : ''; }
    let m = text.match(/<iframe\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (m) return unesc(m[1] != null ? m[1] : m[2]);
    m = text.match(/\sdata-url\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (m) return unesc(m[1] != null ? m[1] : m[2]);
    m = text.match(/<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (m) return unesc(m[1] != null ? m[1] : m[2]);
    return '';
  }
  function providerOf(host) {
    for (const p of PROVIDERS) for (const [h, sub] of p.hosts) if (host === h || (sub && host.endsWith('.' + h))) return p;
    return null;
  }
  /* -> { ok:true, url, provider, name } | { ok:false, error } */
  function parse(input) {
    const raw = typeof input === 'string' ? input : '';
    if (!raw.trim()) return { ok: false, error: 'Paste your calendar embed code or link.' };
    if (raw.length > MAX_INPUT) return { ok: false, error: 'That is too long. Paste only the calendar embed code or link.' };
    const c = candidate(raw);
    if (!c) return { ok: false, error: 'No calendar address found. Paste the embed code (the part with src="https://…") or the booking link.' };
    let u; try { u = new URL(c); } catch (e) { return { ok: false, error: 'That address is not valid.' }; }
    if (u.protocol !== 'https:') return { ok: false, error: 'Only secure (https) calendar addresses are allowed.' };
    if (u.username || u.password) return { ok: false, error: 'That address is not allowed.' };
    if (u.port) return { ok: false, error: 'That address is not allowed.' };
    const host = u.hostname.toLowerCase();
    const p = providerOf(host);
    if (!p) return { ok: false, error: 'That calendar provider is not on the approved list (' + PROVIDERS.map(x => x.name).join(', ') + ').' };
    if (p.id === 'google' && !/^\/calendar\/(u\/\d+\/)?appointments\//.test(u.pathname)) return { ok: false, error: 'For Google Calendar, paste the appointment scheduling page address.' };
    u.hash = '';
    const url = u.href;
    if (url.length > MAX_URL) return { ok: false, error: 'That address is too long.' };
    return { ok: true, url, provider: p.id, name: p.name };
  }
  /* the saved setting -> { mode:'native'|'embed', url, provider, name }; anything unusable falls back to the native form */
  function clean(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    if (r.mode === 'embed' && typeof r.url === 'string') {
      const p = parse(r.url);
      if (p.ok && p.url === r.url) return { mode: 'embed', url: p.url };
    }
    return { mode: 'native', url: '' };
  }
  const api = { parse, clean, providerOf, PROVIDERS, CSP_HOSTS, MAX_INPUT, MAX_URL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreBooking = api;
})(typeof window !== 'undefined' ? window : globalThis);
