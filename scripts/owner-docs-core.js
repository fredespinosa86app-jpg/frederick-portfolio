/* ==========================================================================
   owner-docs-core.js - Phase D1: pure helpers for the owner-only Documents page (no network, unit-tested).
   Collection ownerDocs/{id}: { title, category, body, createdAt, updatedAt } (rules: owner only, see firestore.rules.strict).
   ========================================================================== */
(function (root) {
  'use strict';
  const CATEGORIES = ['security', 'runbook', 'notes', 'other'];
  const LABELS = { security: 'Security', runbook: 'Runbook', notes: 'Notes', other: 'Other' };
  const MAX_TITLE = 120, MAX_BODY = 50000, ID_RE = /^[a-z0-9]{8,32}$/;
  /* Safety net, not a guarantee: refuse text that looks like a key, token, password or webhook address. */
  const SECRET_PATTERNS = [
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
    [/AIza[0-9A-Za-z_-]{30,}/, 'a Google API key'],
    [/https?:\/\/\S*(webhook|hooks\.)\S*/i, 'a webhook address'],
    [/\b(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{20,}/, 'a GitHub token'],
    [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
    [/\bsk-[A-Za-z0-9_-]{20,}/, 'an API secret key'],
    [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'a sign-in token'],
    [/\b(?:password|passwd|secret|token|api[_ -]?key)\s*[:=]\s*["']?[A-Za-z0-9_\-\/+=]{16,}/i, 'a password, token or key']
  ];
  function looksSecret(text) {
    const t = String(text == null ? '' : text);
    for (const [re, what] of SECRET_PATTERNS) if (re.test(t)) return what;
    return '';
  }
  const strip = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  /* -> { ok:true, doc:{title,category,body} } or { ok:false, error } */
  function cleanDoc(d) {
    d = d || {};
    const title = strip(d.title).replace(/\s+/g, ' ').trim();
    const category = CATEGORIES.includes(d.category) ? d.category : '';
    const body = strip(d.body).replace(/\r\n?/g, '\n');
    if (!title) return { ok: false, error: 'Please type a title.' };
    if (title.length > MAX_TITLE) return { ok: false, error: 'The title is too long (120 characters at most).' };
    if (!category) return { ok: false, error: 'Please choose a category.' };
    if (body.length > MAX_BODY) return { ok: false, error: 'The text is too long (' + MAX_BODY + ' characters at most). Split it into two documents.' };
    const s = looksSecret(title) || looksSecret(body);
    if (s) return { ok: false, error: 'This looks like ' + s + '. Keys, tokens, passwords and webhook addresses must never be saved here. Keep them only in the Cloudflare secrets.' };
    return { ok: true, doc: { title, category, body } };
  }
  function newId() {
    const c = root.crypto || (typeof require === 'function' ? require('node:crypto').webcrypto : null);
    const a = new Uint8Array(16); c.getRandomValues(a);
    return Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
  }
  function filterDocs(rows, q, cat) {
    q = String(q || '').trim().toLowerCase();
    return (rows || []).filter(r => (!cat || cat === 'all' || r.category === cat) && (!q || String(r.title || '').toLowerCase().includes(q) || String(r.body || '').toLowerCase().includes(q)));
  }
  const api = { CATEGORIES, LABELS, MAX_TITLE, MAX_BODY, ID_RE, looksSecret, cleanDoc, newId, filterDocs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ownerDocsCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
