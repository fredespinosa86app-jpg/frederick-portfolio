/* ==========================================================================
   core-ids.js - shared identifier rules for CodeFlow 4.5.0 (P0).
   Runs in the browser (window.coreIds) and in Node (module.exports) so the same code is unit-tested.
   Nothing here touches the network or the database.
   Rules (kept in step with firestore.rules.strict, "clientRegistry"):
     Client ID   : A-Z, 0-9 and "-" only, 3 to 24 characters, starts with a letter, no trailing "-", no "--".
     Invoice ID  : CLIENTID + "__" + YYYYMMDD + "__" + YYYYMMDD   (period start, period end). A Client ID can never
                   contain "_", so this layout is unambiguous.
     Idempotency : "operation:key"; the saved record also keeps a hash of its payload so a retry with a DIFFERENT
                   payload is reported as a conflict instead of silently returning an old result.
   ========================================================================== */
(function (root) {
  'use strict';
  const CLIENT_ID_RE = /^[A-Z][A-Z0-9-]{1,22}[A-Z0-9]$/;
  const normalizeClientId = s => String(s == null ? '' : s).trim().toUpperCase();
  function validateClientId(raw) {
    const id = normalizeClientId(raw);
    if (!id) return { ok: false, id, error: 'Enter a Client ID.' };
    if (id.length < 3 || id.length > 24) return { ok: false, id, error: 'Use 3 to 24 characters.' };
    if (!/^[A-Z]/.test(id)) return { ok: false, id, error: 'Start with a letter.' };
    if (!/^[A-Z0-9-]+$/.test(id)) return { ok: false, id, error: 'Use only letters, numbers and hyphens (no spaces or underscores).' };
    if (/--/.test(id)) return { ok: false, id, error: 'Do not use two hyphens in a row.' };
    if (/-$/.test(id)) return { ok: false, id, error: 'Do not end with a hyphen.' };
    if (!CLIENT_ID_RE.test(id)) return { ok: false, id, error: 'This ID is not allowed.' };
    return { ok: true, id, error: '' };
  }

  /* ----- owner-chosen numbering format: PREFIX-NNN or PREFIX-YYYY-NNN ----- */
  const DEFAULT_FORMAT = { prefix: 'CL', digits: 3, start: 1, year: '' };
  function cleanFormat(f) {
    const x = f || {};
    const prefix = String(x.prefix == null ? DEFAULT_FORMAT.prefix : x.prefix).trim().toUpperCase();
    const digits = Math.trunc(Number(x.digits == null ? DEFAULT_FORMAT.digits : x.digits));
    const start = Math.trunc(Number(x.start == null ? DEFAULT_FORMAT.start : x.start));
    const year = x.year === '' || x.year == null ? '' : String(x.year).trim();
    if (!/^[A-Z]{2,6}$/.test(prefix)) return { ok: false, error: 'Prefix: 2 to 6 letters.' };
    if (!(digits >= 3 && digits <= 6)) return { ok: false, error: 'Number length: 3 to 6 digits.' };
    if (!(start >= 1 && start <= Math.pow(10, digits) - 1)) return { ok: false, error: 'Start number does not fit the number length.' };
    if (year !== '' && !/^20[0-9]{2}$/.test(year)) return { ok: false, error: 'Year: four digits like 2026, or leave empty.' };
    return { ok: true, format: { prefix, digits, start, year } };
  }
  const pad = (n, d) => String(n).padStart(d, '0');
  function formatId(fmt, n) { return fmt.prefix + '-' + (fmt.year ? fmt.year + '-' : '') + pad(n, fmt.digits); }
  /* the next free ID in this format: one above the highest number already used (never reuses a lower gap) */
  function nextClientId(format, existingIds) {
    const c = cleanFormat(format); if (!c.ok) return { ok: false, error: c.error };
    const fmt = c.format, max = Math.pow(10, fmt.digits) - 1;
    const re = new RegExp('^' + fmt.prefix + '-' + (fmt.year ? fmt.year + '-' : '') + '([0-9]{' + fmt.digits + '})$');
    let top = fmt.start - 1;
    (existingIds || []).forEach(id => { const m = re.exec(String(id)); if (m) top = Math.max(top, parseInt(m[1], 10)); });
    const n = top + 1;
    if (n > max) return { ok: false, error: 'This format is full. Use a longer number or another prefix.' };
    const id = formatId(fmt, n), v = validateClientId(id);
    return v.ok ? { ok: true, id, n } : { ok: false, error: v.error };
  }

  /* ----- invoice and other deterministic IDs ----- */
  const ISO = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
  function validIsoDate(s) {
    if (!ISO.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }
  function invoiceId(clientId, startIso, endIso) {
    const v = validateClientId(clientId); if (!v.ok) throw new Error('Invalid Client ID: ' + v.error);
    if (!validIsoDate(startIso) || !validIsoDate(endIso)) throw new Error('Invalid period date.');
    if (startIso > endIso) throw new Error('Period start is after its end.');
    return v.id + '__' + startIso.replace(/-/g, '') + '__' + endIso.replace(/-/g, '');
  }
  function parseInvoiceId(id) {
    const m = /^([A-Z][A-Z0-9-]{1,22}[A-Z0-9])__([0-9]{8})__([0-9]{8})$/.exec(String(id));
    if (!m) return null;
    const iso = s => s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6);
    const a = iso(m[2]), b = iso(m[3]);
    if (!validIsoDate(a) || !validIsoDate(b) || a > b) return null;
    return { clientId: m[1], start: a, end: b };
  }

  /* ----- idempotency ----- */
  const OP_RE = /^[a-z]{2,20}$/, KEY_RE = /^[A-Za-z0-9]{12,40}$/;
  function newKey() {
    const c = (root.crypto || (typeof require === 'function' ? require('node:crypto').webcrypto : null)), a = new Uint8Array(16);
    c.getRandomValues(a);
    return Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
  }
  function opId(operation, key) {
    if (!OP_RE.test(operation)) throw new Error('Invalid operation name.');
    if (!KEY_RE.test(key)) throw new Error('Invalid idempotency key.');
    return operation + ':' + key;
  }
  function canonical(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  async function payloadHash(payload) {
    const subtle = (root.crypto && root.crypto.subtle) || require('node:crypto').webcrypto.subtle;
    const h = await subtle.digest('SHA-256', new TextEncoder().encode(canonical(payload)));
    return Array.from(new Uint8Array(h), x => x.toString(16).padStart(2, '0')).join('');
  }
  /* decide what a retry means: same payload = same result; different payload = conflict; nothing saved yet = proceed */
  async function checkRetry(savedHash, payload) {
    if (!savedHash) return 'new';
    return savedHash === await payloadHash(payload) ? 'same' : 'conflict';
  }

  const api = { CLIENT_ID_RE, normalizeClientId, validateClientId, DEFAULT_FORMAT, cleanFormat, formatId, nextClientId, validIsoDate, invoiceId, parseInvoiceId, newKey, opId, canonical, payloadHash, checkRetry };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreIds = api;
})(typeof window !== 'undefined' ? window : globalThis);
