/* ==========================================================================
   core-connlog.js - pure logic of the owner-only "Connection log" (CodeFlow 4.5.0, phase S2-C1). No DOM, no database.
   Runs in the browser (window.coreConnLog) and in Node (module.exports) so the SAME code is unit-tested.
   It records only the HOST (origin) the page contacted, never paths, query strings or content, and only on this device for the owner.
   Purpose: get the real list of hosts before the CSP connect-src is tightened (S2-C2).
   ========================================================================== */
(function (root) {
  'use strict';
  const KEY = 'connLog:v1', CAP = 60;
  /* hosts the code is known to contact (from the code scan); `why` is shown in the log */
  const EXPECTED = [
    ['firestore.googleapis.com', 'Database (everyone)'], ['identitytoolkit.googleapis.com', 'Sign-in (everyone)'], ['securetoken.googleapis.com', 'Sign-in (everyone)'],
    ['portfolio-forms.fredespinosa86-app.workers.dev', 'Form verification (visitors)'],
    ['www.googleapis.com', 'Google Calendar / sign-in (owner)'], ['script.google.com', 'Google Sheets (owner)'], ['script.googleusercontent.com', 'Google Sheets reply (owner)'],
    ['www.youtube.com', 'Video title lookup (owner)'], ['dns.google', 'Custom-domain check (owner)'],
    ['www.google.com', 'App Check, only if enabled'], ['recaptchaenterprise.googleapis.com', 'App Check, only if enabled']];
  const CONNECT = new Set(['fetch', 'xmlhttprequest', 'beacon', 'other']);
  const isConnect = t => CONNECT.has(t);
  /* a resource URL -> its origin, or null for same-origin, non-http(s), data/blob and bad values */
  function origin(url, pageOrigin) {
    let u; try { u = new URL(String(url)); } catch (e) { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.origin === pageOrigin ? null : u.origin;
  }
  const clean = m => { const o = {}; if (m && typeof m === 'object') Object.keys(m).slice(0, CAP).forEach(k => { const v = m[k]; if (/^https?:\/\/[^\s/?#]+$/.test(k) && v && Number.isFinite(v.n) && v.n > 0) o[k] = { n: Math.floor(v.n), first: +v.first || 0, last: +v.last || 0 }; }); return o; };
  function parse(text) { try { return clean(JSON.parse(text)); } catch (e) { return {}; } }
  /* adds one sighting; when 60 hosts are kept, the least recently seen one is dropped */
  function record(map, org, now) {
    const m = clean(map); if (!org) return m;
    if (m[org]) { m[org] = { n: m[org].n + 1, first: m[org].first, last: now }; return m; }
    const keys = Object.keys(m);
    if (keys.length >= CAP) { const old = keys.sort((a, b) => m[a].last - m[b].last)[0]; delete m[old]; }
    m[org] = { n: 1, first: now, last: now }; return m;
  }
  const hostOf = o => o.replace(/^https?:\/\//, '');
  function classify(org) { const h = hostOf(org), e = EXPECTED.find(x => x[0] === h); return e ? { known: true, why: e[1] } : { known: false, why: 'Not in the code scan: find out what uses it' }; }
  function rows(map) { const m = clean(map); return Object.keys(m).map(k => Object.assign({ origin: k, host: hostOf(k), secure: k.startsWith('https://') }, m[k], classify(k))).sort((a, b) => b.n - a.n || (a.host < b.host ? -1 : 1)); }
  /* the plain list the owner can copy and send to me (hosts only) */
  const asText = map => rows(map).map(r => r.host + '  x' + r.n + (r.known ? '' : '  (unknown)') + (r.secure ? '' : '  (NOT https)')).join('\n');
  const api = { KEY, CAP, EXPECTED, isConnect, origin, parse, record, classify, rows, asText, clean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreConnLog = api;
})(typeof window !== 'undefined' ? window : globalThis);
