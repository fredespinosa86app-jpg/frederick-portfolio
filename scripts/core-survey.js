/* ==========================================================================
   core-survey.js - employer testimonial survey rules (CodeFlow 4.5.0, SV1)
   Runs in the browser (window.coreSurvey) and in Node (module.exports) so the same code is unit-tested.
   It never touches the network or the database. Limits here are kept in step with firestore.rules.strict
   ("surveyInvites", "surveyResponses"); the rules are the real boundary, these checks only give friendly messages first.

   Key      : 32 random letters and digits (about 190 bits), the Firestore document ID of the invite and of its one response.
              It travels in the link after "#" (survey.html#k=KEY) so it is never sent to a server, a log or a Referer header.
   Response : rating 1-5, comment 20-700 characters (700 = the limit of a published testimonial), optional "best" text,
              recommend yes/no, optional video LINK (YouTube, Loom or Google Drive; never an uploaded file),
              name/role/company as they should appear, and consent to publish (required).
   ========================================================================== */
(function (root) {
  'use strict';
  const KEY_RE = /^[A-Za-z0-9]{32}$/;
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const EXPIRY_DAYS = 60, DAY = 864e5;
  const LIM = { comment: [20, 700], best: [0, 500], name: [1, 80], role: [0, 80], company: [0, 100], video: 300, employerName: 100 };

  /* 32 characters, each chosen with rejection sampling so every letter/digit is equally likely (no modulo bias) */
  function newKey(cryptoObj) {
    const c = cryptoObj || root.crypto || (typeof require === 'function' ? require('node:crypto').webcrypto : null);
    if (!c || !c.getRandomValues) throw new Error('No secure random source.');
    let out = '';
    while (out.length < 32) {
      const a = new Uint8Array(64); c.getRandomValues(a);
      for (const b of a) { if (b < 248 && out.length < 32) out += ALPHABET[b % 62]; }   // 248 = 62 * 4, the largest multiple of 62 that fits a byte
    }
    return out;
  }
  const validKey = k => typeof k === 'string' && KEY_RE.test(k);
  /* "#k=KEY" -> KEY, anything else -> '' */
  function keyFromHash(hash) {
    const m = /^#k=([A-Za-z0-9]+)$/.exec(String(hash || ''));
    return m && validKey(m[1]) ? m[1] : '';
  }
  const linkFor = (baseHref, key) => {
    const u = new URL('survey.html', baseHref); u.search = ''; u.hash = 'k=' + key; return u.href;
  };

  /* strips control, zero-width, bidirectional and invisible tag characters; keeps normal line breaks in long text */
  function cleanText(v, max, multiline) {
    let s = String(v == null ? '' : v).normalize('NFKC');
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]|[\u{E0000}-\u{E007F}]/gu, '');
    s = multiline ? s.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ') : s.replace(/\s+/g, ' ');
    return s.trim().slice(0, max);
  }

  /* Video link: https only, no user name, no port, exact host. Returns { ok, kind, url, label, warn } */
  function parseVideoLink(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return { ok: true, kind: '', url: '', label: '', warn: '' };
    if (s.length > LIM.video) return { ok: false, error: 'The video link is too long.' };
    if (/\s/.test(s)) return { ok: false, error: 'The video link must not contain spaces.' };
    let u; try { u = new URL(s); } catch (e) { return { ok: false, error: 'That does not look like a link. Paste the full address starting with https://' }; }
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return { ok: false, error: 'Use a plain https:// link.' };
    const h = u.hostname.toLowerCase().replace(/^www\./, ''), p = u.pathname;
    const id11 = /^[\w-]{11}$/;
    if (h === 'youtube.com' && ((p === '/watch' && id11.test(u.searchParams.get('v') || '')) || /^\/shorts\/[\w-]{11}$/.test(p)))
      return { ok: true, kind: 'youtube', url: s, label: 'YouTube link', warn: '' };
    if (h === 'youtu.be' && /^\/[\w-]{11}$/.test(p)) return { ok: true, kind: 'youtube', url: s, label: 'YouTube link', warn: '' };
    if (h === 'loom.com' && /^\/share\/[A-Za-z0-9]{10,64}$/.test(p)) return { ok: true, kind: 'loom', url: s, label: 'Loom link', warn: '' };
    if (u.hostname.toLowerCase() === 'drive.google.com' && p.length > 1)
      return { ok: true, kind: 'drive', url: s, label: 'Google Drive link', warn: 'Make sure sharing is set to "Anyone with the link".' };
    return { ok: false, error: 'Use a YouTube, Loom or Google Drive link.' };
  }

  /* The employer's answers -> a clean record, or friendly errors per field. Nothing else is ever copied. */
  function validateResponse(input) {
    const x = input && typeof input === 'object' ? input : {}, err = {};
    const rating = Number(x.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) err.rating = 'Please choose 1 to 5 stars.';
    const full = cleanText(x.comment, 5000, true), comment = full.slice(0, LIM.comment[1]);
    if (full.length < LIM.comment[0]) err.comment = 'Please write at least ' + LIM.comment[0] + ' characters.';
    else if (full.length > LIM.comment[1]) err.comment = 'Please keep your message to ' + LIM.comment[1] + ' characters or fewer (now ' + full.length + ').';
    const bestFull = cleanText(x.best, 5000, true), best = bestFull.slice(0, LIM.best[1]);
    if (bestFull.length > LIM.best[1]) err.best = 'Please keep this to ' + LIM.best[1] + ' characters or fewer (now ' + bestFull.length + ').';
    const recommend = x.recommend === 'yes' || x.recommend === 'no' ? x.recommend : '';
    if (!recommend) err.recommend = 'Please choose yes or no.';
    const v = parseVideoLink(x.videoUrl); if (!v.ok) err.videoUrl = v.error;
    const displayName = cleanText(x.displayName, LIM.name[1]);
    if (!displayName) err.displayName = 'Please enter the name to show.';
    const displayRole = cleanText(x.displayRole, LIM.role[1]), displayCompany = cleanText(x.displayCompany, LIM.company[1]);
    if (x.consentPublish !== true) err.consentPublish = 'Please tick the box to allow publishing.';
    if (Object.keys(err).length) return { ok: false, errors: err };
    return { ok: true, data: { rating, comment, best, recommend, videoUrl: v.url, displayName, displayRole, displayCompany, consentPublish: true } };
  }

  /* An invite can be answered only while it is "sent" and not past its end time. Everything else shows one neutral message. */
  function inviteUsable(inv, nowMs) {
    if (!inv || typeof inv !== 'object' || inv.status !== 'sent') return false;
    const e = inv.expiresAt && typeof inv.expiresAt.toMillis === 'function' ? inv.expiresAt.toMillis() : Number(inv.expiresAt);
    return Number.isFinite(e) && e > nowMs;
  }
  const expiryFrom = nowMs => nowMs + EXPIRY_DAYS * DAY;

  /* Owner-side label for a list row: sent / answered / approved / rejected / expired / revoked */
  function stateOf(inv, resp, nowMs) {
    if (!inv) return 'unknown';
    if (inv.status === 'revoked') return 'revoked';
    if (inv.status === 'submitted') return resp && (resp.ownerStatus === 'approved' || resp.ownerStatus === 'rejected') ? resp.ownerStatus : 'answered';
    return inviteUsable(inv, nowMs) ? 'sent' : 'expired';
  }

  /* An approved response becomes a testimonial that is OFF until the owner switches it on. */
  function testimonialFromResponse(resp, id) {
    const r = resp || {};
    const role = [cleanText(r.displayRole, 80), cleanText(r.displayCompany, 100)].filter(Boolean).join(', ').slice(0, 100);
    return { id: String(id).slice(0, 40), name: cleanText(r.displayName, 80), role, quote: cleanText(r.comment, 700, true), rating: Number(r.rating) || 0, photo: '', enabled: false };
  }

  /* The e-mail the owner sends from their own mail program. No tracking, no secrets. */
  function messageFor(link, ownerName, employerName) {
    const subject = 'Quick feedback request for ' + ownerName;
    const body = 'Hello ' + (employerName || '') + ',\n\nThank you for working with ' + ownerName + '. Could you take two minutes to share your feedback? '
      + 'You can give a star rating, a short message and, if you like, a link to a short video.\n\nYour personal link (it works once and only for you):\n' + link
      + '\n\nThe link expires in ' + EXPIRY_DAYS + ' days. Nothing is published without your permission.\n\nThank you,\n' + ownerName;
    return { subject, body };
  }
  function mailtoFor(address, link, ownerName, employerName) {
    const m = messageFor(link, ownerName, employerName);
    return 'mailto:' + encodeURIComponent(address).replace(/%40/g, '@') + '?subject=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.body);
  }
  const validEmail = e => typeof e === 'string' && e.length > 4 && e.length <= 120 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

  const DEFAULT_SURVEY = { version: 'default-1', title: 'Share your experience' };
  const api = { KEY_RE, EXPIRY_DAYS, LIM, newKey, validKey, keyFromHash, linkFor, cleanText, parseVideoLink, validateResponse, inviteUsable, expiryFrom, stateOf, testimonialFromResponse, messageFor, mailtoFor, validEmail, DEFAULT_SURVEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreSurvey = api;
})(typeof window !== 'undefined' ? window : globalThis);
