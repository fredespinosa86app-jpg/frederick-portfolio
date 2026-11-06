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

  /* An approved response becomes a testimonial that is OFF until the owner switches it on. A Google Drive video link, if any, comes along. */
  function testimonialFromResponse(resp, id) {
    const r = resp || {};
    const role = [cleanText(r.displayRole, 80), cleanText(r.displayCompany, 100)].filter(Boolean).join(', ').slice(0, 100);
    const vd = parseVideoLink(r.videoUrl), t = { id: String(id).slice(0, 40), name: cleanText(r.displayName, 80), role, quote: cleanText(r.comment, 700, true), rating: Number(r.rating) || 0, photo: '', enabled: false };
    if (vd.ok && vd.kind === 'drive') t.video = vd.url;   // only a Google Drive link is carried over; YouTube and Loom stay in the survey list
    return t;
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
  /* Web mail compose pages for people whose computer has no mail program set up. https only, fixed hosts, the text is encoded. */
  function webmailUrls(address, link, ownerName, employerName) {
    const m = messageFor(link, ownerName, employerName), to = encodeURIComponent(address), su = encodeURIComponent(m.subject), bd = encodeURIComponent(m.body);
    return { gmail: 'https://mail.google.com/mail/?view=cm&fs=1&to=' + to + '&su=' + su + '&body=' + bd, outlook: 'https://outlook.live.com/mail/0/deeplink/compose?to=' + to + '&subject=' + su + '&body=' + bd };
  }
  const validEmail = e => typeof e === 'string' && e.length > 4 && e.length <= 120 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);


  /* ---- SV2a: 3-month reminder (dates are plain "YYYY-MM-DD" text, so no time-zone surprises) and cleanup of old invites ---- */
  const DATE_RE = /^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
  const REMIND = { defaultMonths: 3, minMonths: 1, maxMonths: 24, snoozeDays: 7, cleanupGraceDays: 30 };
  const validDate = d => { if (typeof d !== 'string' || !DATE_RE.test(d)) return false; const t = new Date(d + 'T00:00:00Z'); return !isNaN(t) && t.toISOString().slice(0, 10) === d; };
  /* today in the owner's time zone (Asia/Manila = UTC+8, no daylight saving) */
  const todayManila = nowMs => new Date(nowMs + 8 * 36e5).toISOString().slice(0, 10);
  /* start date + N months; a day that does not exist in the target month moves to that month's last day (31 Aug + 6 months = 28/29 Feb) */
  function addMonths(date, n) {
    if (!validDate(date)) return '';
    const y = +date.slice(0, 4), m = +date.slice(5, 7) - 1, d = +date.slice(8, 10), t = m + n, ny = y + Math.floor(t / 12), nm = ((t % 12) + 12) % 12;
    const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    return new Date(Date.UTC(ny, nm, Math.min(d, last))).toISOString().slice(0, 10);
  }
  const addDays = (date, n) => validDate(date) ? new Date(Date.parse(date + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10) : '';
  function validReminder(r) {
    const x = r && typeof r === 'object' ? r : {}, err = {};
    if (!validDate(x.startDate)) err.startDate = 'Enter the start work date.';
    const months = Number(x.months);
    if (!Number.isInteger(months) || months < REMIND.minMonths || months > REMIND.maxMonths) err.months = 'Months must be from ' + REMIND.minMonths + ' to ' + REMIND.maxMonths + '.';
    if (Object.keys(err).length) return { ok: false, errors: err };
    return { ok: true, data: { startDate: x.startDate, months, status: 'active', snoozedUntil: '' } };
  }
  const dueDate = r => r && validDate(r.startDate) ? addMonths(r.startDate, Number(r.months) || REMIND.defaultMonths) : '';
  /* a reminder is due when active, the due date is today or earlier, and any snooze has ended */
  function isDue(r, today) {
    if (!r || r.status !== 'active') return false;
    const d = dueDate(r); if (!d || d > today) return false;
    return !(validDate(r.snoozedUntil) && r.snoozedUntil > today);
  }
  const snoozeTo = today => addDays(today, REMIND.snoozeDays);
  /* only an invite that was NEVER answered (expired or revoked, and older than the grace period) may be cleaned up */
  function cleanable(inv, nowMs) {
    if (!inv || (inv.status !== 'sent' && inv.status !== 'revoked')) return false;
    const e = inv.expiresAt && typeof inv.expiresAt.toMillis === 'function' ? inv.expiresAt.toMillis() : Number(inv.expiresAt);
    if (!Number.isFinite(e)) return false;
    return e + REMIND.cleanupGraceDays * DAY < nowMs;   // 30 days after the end date of the link (a revoked link keeps its original end date)
  }

  /* ---- SV2b: custom surveys = title + intro + 1-6 EXTRA questions. The testimonial core (rating, message, name, consent) is unchanged. ---- */
  const QLIM = { templates: 10, questions: 6, title: 80, intro: 300, label: 200, options: [2, 6], option: 60, short: 200, long: 700 };
  const QTYPES = ['stars', 'short', 'long', 'yesno', 'choice'];
  const QTYPE_LABEL = { stars: 'Stars (1 to 5)', short: 'Short text', long: 'Long text', yesno: 'Yes / No', choice: 'Choice (pick one)' };
  const QKEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];
  /* Owner input -> a clean template { title, intro, questions:[{id,type,label,required,options}] }, or friendly errors */
  function validateTemplate(input) {
    const x = input && typeof input === 'object' ? input : {}, err = {};
    const title = cleanText(x.title, QLIM.title), intro = cleanText(x.intro, QLIM.intro, true);
    if (!title) err.title = 'Give the survey a title.';
    if (cleanText(x.title, 5000).length > QLIM.title) err.title = 'The title is too long (' + QLIM.title + ' characters at most).';
    if (cleanText(x.intro, 5000, true).length > QLIM.intro) err.intro = 'The introduction is too long (' + QLIM.intro + ' characters at most).';
    const qs = Array.isArray(x.questions) ? x.questions : [], questions = [], qerr = [];
    if (!qs.length) err.questions = 'Add at least one question.';
    if (qs.length > QLIM.questions) err.questions = 'Use ' + QLIM.questions + ' questions or fewer.';
    qs.slice(0, QLIM.questions).forEach((q, i) => {
      const o = q && typeof q === 'object' ? q : {}, e = {}, type = QTYPES.includes(o.type) ? o.type : '';
      const label = cleanText(o.label, QLIM.label);
      if (!type) e.type = 'Choose a question type.';
      if (!label) e.label = 'Write the question.'; else if (cleanText(o.label, 5000).length > QLIM.label) e.label = 'The question is too long (' + QLIM.label + ' characters at most).';
      let options = [];
      if (type === 'choice') {
        const seen = new Set(); options = (Array.isArray(o.options) ? o.options : []).map(v => cleanText(v, 5000)).filter(Boolean);
        if (options.length < QLIM.options[0] || options.length > QLIM.options[1]) e.options = 'A choice question needs ' + QLIM.options[0] + ' to ' + QLIM.options[1] + ' options.';
        else if (options.some(v => v.length > QLIM.option)) e.options = 'Each option may have ' + QLIM.option + ' characters at most.';
        else if (options.some(v => (seen.has(v) ? true : (seen.add(v), false)))) e.options = 'Each option must be different.';
      }
      if (Object.keys(e).length) qerr[i] = e;
      questions.push({ id: 'q' + (i + 1), type, label, required: o.required === true, options });
    });
    if (qerr.length) err.items = qerr;
    if (Object.keys(err).length) return { ok: false, errors: err };
    return { ok: true, data: { title, intro, questions } };
  }
  /* what is copied into a sent link: only the survey wording, never an ID or anything private */
  const formFrom = t => ({ title: t.title, intro: t.intro, questions: t.questions.map(q => ({ id: q.id, type: q.type, label: q.label, required: q.required === true, options: q.options.slice() })) });
  /* The employer's extra answers against the copied questions -> { ok, data: {q1: ...} } or { ok:false, errors:{q1:msg} } (rules enforce the same, slot by slot) */
  function validateAnswers(questions, input) {
    const x = input && typeof input === 'object' ? input : {}, qs = Array.isArray(questions) ? questions.slice(0, QLIM.questions) : [], data = {}, errors = {};
    qs.forEach((q, i) => {
      const k = QKEYS[i], v = Object.prototype.hasOwnProperty.call(x, k) ? x[k] : undefined, blank = v == null || v === '';
      if (blank) { if (q.required) errors[k] = q.type === 'stars' ? 'Please choose a rating.' : 'Please answer this question.'; return; }
      if (q.type === 'stars') { const n = Number(v); if (Number.isInteger(n) && n >= 1 && n <= 5) data[k] = n; else errors[k] = 'Please choose 1 to 5 stars.'; }
      else if (q.type === 'yesno') { if (v === 'yes' || v === 'no') data[k] = v; else errors[k] = 'Please choose yes or no.'; }
      else if (q.type === 'choice') { if (typeof v === 'string' && q.options.includes(v)) data[k] = v; else errors[k] = 'Please choose one of the options.'; }
      else {
        const max = q.type === 'long' ? QLIM.long : QLIM.short, full = cleanText(v, 5000, q.type === 'long');
        if (!full) { if (q.required) errors[k] = 'Please answer this question.'; return; }
        if (full.length > max) errors[k] = 'Please keep this to ' + max + ' characters or fewer (now ' + full.length + ').'; else data[k] = full;
      }
    });
    return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
  }

  const DEFAULT_SURVEY = { version: 'default-1', title: 'Share your experience' };
  const api = { KEY_RE, EXPIRY_DAYS, LIM, newKey, validKey, keyFromHash, linkFor, cleanText, parseVideoLink, validateResponse, inviteUsable, expiryFrom, stateOf, testimonialFromResponse, messageFor, mailtoFor, webmailUrls, validEmail, DEFAULT_SURVEY, DATE_RE, REMIND, validDate, todayManila, addMonths, addDays, validReminder, dueDate, isDue, snoozeTo, cleanable, QLIM, QTYPES, QTYPE_LABEL, QKEYS, validateTemplate, formFrom, validateAnswers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreSurvey = api;
})(typeof window !== 'undefined' ? window : globalThis);
