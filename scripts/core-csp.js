/* ==========================================================================
   core-csp.js - reads the page's Content-Security-Policy <meta> tag and answers "may the page connect to this address?" (CodeFlow 4.5.0, phase S2-C2).
   No DOM changes, no database. Runs in the browser (window.coreCsp) and in Node (module.exports) so the SAME code is unit-tested.
   Used to (1) refuse a chat webhook the rule would block, (2) skip it quietly for visitors, (3) guard the rule against becoming wide again.
   ========================================================================== */
(function (root) {
  'use strict';
  /* policy text -> { directive: [source, ...] } (first occurrence of a directive wins, as in browsers) */
  function parse(text) {
    const out = {};
    String(text == null ? '' : text).split(';').forEach(part => {
      const t = part.trim().split(/\s+/).filter(Boolean); if (!t.length) return;
      const name = t[0].toLowerCase(); if (!Object.prototype.hasOwnProperty.call(out, name)) out[name] = t.slice(1);
    });
    return out;
  }
  /* one source expression against one address. Supports 'self', scheme sources (https:), host sources with an optional leading *. and port. */
  function match(src, u, pageOrigin) {
    const s = String(src).toLowerCase();
    if (s === "'self'") return u.origin === pageOrigin;
    if (s === '*') return /^(https?|wss?):$/.test(u.protocol);
    if (/^[a-z][a-z0-9+.-]*:$/.test(s)) return u.protocol === s;
    const m = s.match(/^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([a-z0-9.-]+|\*)(?::(\d+|\*))?(\/.*)?$/); if (!m) return false;
    if (m[1] && u.protocol !== m[1] + ':') return false;
    if (!m[1] && u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    if (m[3] !== '*' && !(m[2] ? host.endsWith('.' + m[3]) : host === m[3])) return false;
    if (m[3] === '*' && m[2]) return false;
    const port = u.port || (u.protocol === 'https:' ? '443' : '80');
    if (m[4] && m[4] !== '*' && m[4] !== port) return false;
    if (!m[4] && u.port && u.port !== (u.protocol === 'https:' ? '443' : '80')) return false;
    return true;
  }
  /* may `url` be loaded under `directive`? falls back to default-src like browsers do. 'none' or a missing policy part blocks / allows accordingly. */
  function allows(policy, directive, url, pageOrigin) {
    let u; try { u = new URL(String(url)); } catch (e) { return false; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const p = typeof policy === 'string' ? parse(policy) : (policy || {});
    const list = p[directive] || p['default-src']; if (!list) return true;
    if (list.length === 1 && list[0].toLowerCase() === "'none'") return false;
    return list.some(s => match(s, u, pageOrigin));
  }
  /* sources in a directive that are wider than a fixed list of named hosts */
  function broad(list) {
    return (list || []).filter(s => {
      const x = String(s).toLowerCase();
      if (x === "'self'") return false;
      return /^[a-z][a-z0-9+.-]*:$/.test(x) || x === '*' || x.includes('*') || !/^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(x);
    });
  }
  /* the policy text of the current document's <meta> (browser only) */
  function metaText(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null); if (!d || !d.querySelector) return '';
    const m = d.querySelector('meta[http-equiv="Content-Security-Policy" i]'); return m ? (m.getAttribute('content') || '') : '';
  }
  function allowsConnect(url) { const t = metaText(); if (!t) return false; return allows(t, 'connect-src', url, typeof location !== 'undefined' ? location.origin : ''); }
  /* may the page load this picture address? (data: and blob: pictures are always fine; they cannot reach another site) */
  function allowsImg(url) { const s = String(url == null ? '' : url); if (/^(data|blob):/i.test(s)) return true; const t = metaText(); if (!t) return false; return allows(t, 'img-src', new URL(s, typeof location !== 'undefined' ? location.href : 'https://x.invalid/').href, typeof location !== 'undefined' ? location.origin : ''); }
  const api = { parse, match, allows, broad, metaText, allowsConnect, allowsImg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreCsp = api;
})(typeof window !== 'undefined' ? window : globalThis);
