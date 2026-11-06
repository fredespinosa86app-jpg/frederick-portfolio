/* ==========================================================================
   core-connlog.js - pure logic of the owner-only "Connection log" (CodeFlow 4.5.0, phase S2-C1). No DOM, no database.
   Runs in the browser (window.coreConnLog) and in Node (module.exports) so the SAME code is unit-tested.
   It records only the HOST (origin) the page contacted, never paths, query strings or content, and only on this device for the owner.
   Purpose: get the real list of hosts before the CSP connect-src is tightened (S2-C2). S2-C2 adds: picture/media hosts (for the later img-src step)
   and a "blocked by the rule" list fed by the browser's securitypolicyviolation event (directive + host/keyword only).
   ========================================================================== */
(function (root) {
  'use strict';
  const KEY = 'connLog:v1', MEDIA_KEY = 'connMedia:v1', BLOCKED_KEY = 'connBlocked:v1', CAP = 60;
  const ORIGIN_RE = /^https?:\/\/[^\s/?#]+$/, BLOCK_RE = /^[a-z][a-z-]{1,30} (?:https?:\/\/[^\s/?#]+|[a-z]{2,12})$/;
  /* hosts the code is known to contact (from the code scan); `why` is shown in the log */
  const EXPECTED = [
    ['firestore.googleapis.com', 'Database (everyone)'], ['identitytoolkit.googleapis.com', 'Sign-in (everyone)'], ['securetoken.googleapis.com', 'Sign-in (everyone)'],
    ['portfolio-forms.fredespinosa86-app.workers.dev', 'Form verification (visitors)'],
    ['www.googleapis.com', 'Google Calendar / sign-in (owner)'], ['script.google.com', 'Google Sheets (owner)'], ['script.googleusercontent.com', 'Google Sheets reply (owner)'],
    ['www.youtube.com', 'Video title lookup (owner)'], ['dns.google', 'Custom-domain check (owner)'],
    ['www.google.com', 'App Check, only if enabled'], ['recaptchaenterprise.googleapis.com', 'App Check, only if enabled']];
  const CONNECT = new Set(['fetch', 'xmlhttprequest', 'beacon', 'other']);
  const DIRECTIVES = new Set(['default-src', 'script-src', 'script-src-elem', 'script-src-attr', 'style-src', 'style-src-elem', 'style-src-attr', 'font-src', 'img-src', 'media-src', 'connect-src', 'frame-src', 'child-src', 'worker-src', 'object-src', 'base-uri', 'form-action', 'manifest-src', 'frame-ancestors']);
  const isConnect = t => CONNECT.has(t);
  /* pictures, video, audio, CSS-loaded images: logged separately so the later img-src / media-src step is based on real hosts */
  const MEDIA = new Set(['img', 'image', 'video', 'audio', 'track', 'css']);
  const isMedia = t => MEDIA.has(t);
  /* a resource URL -> its origin, or null for same-origin, non-http(s), data/blob and bad values */
  function origin(url, pageOrigin) {
    let u; try { u = new URL(String(url)); } catch (e) { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.origin === pageOrigin ? null : u.origin;
  }
  const clean = (m, re) => { re = re || ORIGIN_RE; const o = {}; if (m && typeof m === 'object' && !Array.isArray(m)) Object.keys(m).slice(0, CAP).forEach(k => { const v = m[k]; if (re.test(k) && v && Number.isFinite(v.n) && v.n > 0) o[k] = { n: Math.floor(v.n), first: +v.first || 0, last: +v.last || 0 }; }); return o; };
  function parse(text, re) { try { return clean(JSON.parse(text), re); } catch (e) { return {}; } }
  /* adds one sighting; when 60 hosts are kept, the least recently seen one is dropped */
  function record(map, org, now, re) {
    const m = clean(map, re); if (!org) return m;
    if (m[org]) { m[org] = { n: m[org].n + 1, first: m[org].first, last: now }; return m; }
    const keys = Object.keys(m);
    if (keys.length >= CAP) { const old = keys.sort((a, b) => m[a].last - m[b].last)[0]; delete m[old]; }
    m[org] = { n: 1, first: now, last: now }; return m;
  }
  /* a securitypolicyviolation event -> { key:'connect-src https://host' } (host only) or null. Addresses with paths/queries are cut down to the origin. */
  function blockedKey(ev, pageOrigin) {
    if (!ev || typeof ev !== 'object') return null;
    const dir = String(ev.effectiveDirective || ev.violatedDirective || '').split(/\s/)[0].toLowerCase(); if (!DIRECTIVES.has(dir)) return null;
    const b = String(ev.blockedURI == null ? '' : ev.blockedURI); let what;
    if (/^https?:/i.test(b)) { what = origin(b, pageOrigin); if (!what) return null; } else what = ({ inline: 'inline', eval: 'eval', data: 'data', blob: 'blob', 'wasm-eval': 'eval', 'trusted-types-policy': 'other' })[b.toLowerCase()] || 'other';
    return dir + ' ' + what;
  }
  const recordBlocked = (map, key, now) => key ? record(map, key, now, BLOCK_RE) : clean(map, BLOCK_RE);
  const parseBlocked = text => parse(text, BLOCK_RE);
  function blockedRows(map) { const m = clean(map, BLOCK_RE); return Object.keys(m).map(k => { const [dir, what] = k.split(' '); return Object.assign({ key: k, dir, what, host: what.replace(/^https?:\/\//, '') }, m[k]); }).sort((a, b) => b.n - a.n || (a.key < b.key ? -1 : 1)); }
  const hostOf = o => o.replace(/^https?:\/\//, '');
  function classify(org) { const h = hostOf(org), e = EXPECTED.find(x => x[0] === h); return e ? { known: true, why: e[1] } : { known: false, why: 'Not in the code scan: find out what uses it' }; }
  function rows(map) { const m = clean(map); return Object.keys(m).map(k => Object.assign({ origin: k, host: hostOf(k), secure: k.startsWith('https://') }, m[k], classify(k))).sort((a, b) => b.n - a.n || (a.host < b.host ? -1 : 1)); }
  /* the plain list the owner can copy and send to me (hosts only) */
  const asText = map => rows(map).map(r => r.host + '  x' + r.n + (r.known ? '' : '  (unknown)') + (r.secure ? '' : '  (NOT https)')).join('\n');
  /* media hosts: no code-scan list (pictures come from several places); each row says which kind of file is typical */
  function mediaRows(map) { const m = clean(map); return Object.keys(m).map(k => Object.assign({ origin: k, host: hostOf(k), secure: k.startsWith('https://') }, m[k])).sort((a, b) => b.n - a.n || (a.host < b.host ? -1 : 1)); }
  /* everything the owner copies for me: three plain sections, hosts and counts only */
  function asTextAll(o) {
    o = o || {}; const parts = [];
    parts.push('CONNECTIONS\n' + (asText(o.connect) || '(none)'));
    parts.push('PICTURES AND MEDIA\n' + (mediaRows(o.media).map(r => r.host + '  x' + r.n + (r.secure ? '' : '  (NOT https)')).join('\n') || '(none)'));
    parts.push('BLOCKED BY THE RULE\n' + (blockedRows(o.blocked).map(r => r.dir + '  ' + r.host + '  x' + r.n).join('\n') || '(none)'));
    return parts.join('\n\n');
  }
  const api = { KEY, MEDIA_KEY, BLOCKED_KEY, CAP, EXPECTED, isMedia, blockedKey, recordBlocked, parseBlocked, blockedRows, mediaRows, asTextAll, isConnect, origin, parse, record, classify, rows, asText, clean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreConnLog = api;
})(typeof window !== 'undefined' ? window : globalThis);
