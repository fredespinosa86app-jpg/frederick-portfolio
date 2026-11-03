/* ==========================================================================
   chat-engine.js - pure helpers for the Marcus chatbot (Phase 5):
   question matching (alternative phrasings), moderation, timestamps, reply delay,
   and the shared chatbot settings (name, picture, filter lists, knowledge base).
   ========================================================================== */
(function (root) {
  'use strict';
  /* ---------------- matching ---------------- */
  const STOP = new Set(['a', 'an', 'the', 'is', 'are', 'am', 'do', 'does', 'did', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'please', 'can', 'could', 'would', 'will', 'be', 'it', 'its', 'so', 'just']);
  const MAP = { your: 'you', yours: 'you', yourself: 'you', youre: 'you', ur: 'you', u: 'you', him: 'he', his: 'he', hes: 'he', frederick: 'he', fred: 'he', freds: 'he', fredericks: 'he', im: 'i', my: 'i', mine: 'i', whats: 'what', hows: 'how', bday: 'birthday', birthdate: 'birthday', legitimate: 'legit', scammer: 'scam', scamming: 'scam', scammed: 'scam', fraud: 'scam', fraudulent: 'scam' };
  const stem = w => { if (w.length <= 4) return w; if (w.endsWith('ies')) return w.slice(0, -3) + 'y'; if (w.endsWith('ing')) return w.slice(0, -3); if (w.endsWith('ed')) return w.slice(0, -2); if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1); return w; };
  function tokens(s) {
    const out = [], seen = new Set();
    String(s || '').toLowerCase().replace(/[’`']/g, '').replace(/[^a-z0-9À-ɏ]+/g, ' ').split(' ').forEach(w => {
      if (!w) return; w = MAP[w] || w; if (STOP.has(w)) return; w = stem(w); if (w && !seen.has(w)) { seen.add(w); out.push(w); }
    });
    return out;
  }
  function score(q, p) {
    if (!q.length || !p.length) return 0;
    const ps = new Set(p); let inter = 0; q.forEach(t => { if (ps.has(t)) inter++; });
    if (!inter) return 0;
    if (inter === q.length && inter === p.length) return 1;
    let s = 2 * inter / (q.length + p.length);
    if (p.length >= 2 && inter === p.length) s = Math.max(s, 0.8);                 // every word of the stored phrase is in the question
    else if (p.length === 1 && q.length <= 3) s = Math.max(s, 0.8);                // short question containing a one-word phrase
    else if (q.length >= 2 && inter === q.length && p.length > q.length) s = Math.max(s, 0.7);   // question is a part of a longer stored phrase
    return s;
  }
  const TH = 0.6;
  /* best active entry for a visitor question (entry = {q, alts[], a, enabled}) */
  function matchKb(text, items) {
    const q = tokens(text); let best = null, top = 0;
    (items || []).forEach(it => {
      if (!it || it.enabled === false) return;
      [it.q].concat(it.alts || []).forEach(ph => { const s = score(q, tokens(ph)); if (s > top) { top = s; best = it; } });
    });
    return best && top >= TH ? { item: best, score: top } : null;
  }

  /* ---------------- moderation ---------------- */
  const BAD = ['fuck', 'fucks', 'fucked', 'fucker', 'fuckers', 'fucking', 'motherfucker', 'shit', 'shits', 'shitty', 'bullshit', 'bitch', 'bitches', 'bastard', 'bastards', 'asshole', 'assholes', 'dickhead', 'cunt', 'slut', 'whore', 'dumbass', 'jackass', 'son of a bitch', 'piss off',
    'tangina', 'putangina', 'putang ina', 'gago', 'ulol', 'tarantado', 'pakyu', 'punyeta'];
  const LEET = { a: '[a@4]', e: '[e3]', i: '[i1!]', o: '[o0]', s: '[s$5]', u: '[u*]' };
  const esc = c => c.replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&');
  const cache = {};
  function rx(word) {
    if (cache[word]) return cache[word];
    const body = word.split('').map(c => c === ' ' ? '\\s+' : (LEET[c] || esc(c)) + '+').join('[*._\\-]*').replace(/\\s\+\+/g, '\\s+');
    return (cache[word] = new RegExp('(^|[^a-z0-9])' + body + '($|[^a-z0-9])', 'i'));
  }
  const INAPPROPRIATE = [/\b(kill|murder|shoot|stab|bomb|hurt|rape)\s+(you|him|her|frederick|yourself|them|everyone)\b/i, /\bkill\s+(my|your)self\b|\bkys\b/i, /\b(nudes?|nsfw|porn\w*|sexting|send\s+(me\s+)?(pics|photos)|naked)\b/i, /\b(i\s+will|i'?ll|gonna)\s+(find|hack|ddos|doxx?)\b/i];
  function words(list) { return (Array.isArray(list) ? list : String(list || '').split(/[\n,]/)).map(w => String(w).toLowerCase().trim()).filter(w => w && w.length <= 40); }
  /* 'profanity' (counts as a strike) | 'inappropriate' (threats, sexual requests: refused, no strike) | 'ok' */
  function classify(text, mod) {
    const t = String(text || '').normalize('NFKC'); mod = mod || {};
    const allow = new Set(words(mod.allow));
    const list = BAD.concat(words(mod.extra)).filter(w => !allow.has(w));
    for (const w of list) if (rx(w).test(t)) return 'profanity';
    if (INAPPROPRIATE.some(r => r.test(t))) return 'inappropriate';
    return 'ok';
  }


  /* ---------------- prompt-injection screen (Security S4) ---------------- */
  /* text from the webhook or the visitor is never trusted: invisible characters are removed and obvious instruction-override attempts are not sent to the AI webhook */
  const INVIS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F­͏؜᠋-᠎​-‏‪-‮⁠-⁯︀-️﻿￹-￼]/g;
  const cleanText = (s, max) => String(s == null ? '' : s).normalize('NFKC').replace(INVIS, '').replace(/[\u{E0000}-\u{E007F}]/gu, '').trim().slice(0, max || 2000);
  const INJ = [
    /\b(ignore|disregard|forget|override|bypass|skip)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any|your|the|these|those|system)\b[^.\n]{0,30}\b(instruction|prompt|rule|direction|guideline|command|message|context|polic)/i,
    /\b(reveal|show|print|repeat|display|leak|tell me|give me|output|dump|share)\b[^.\n]{0,40}\b(system|hidden|initial|original|developer|secret)\b[^.\n]{0,20}\b(prompt|instruction|message|rule|config)/i,
    /\b(reveal|show|print|leak|give me|what is|what's|tell me|dump)\b[^.\n]{0,30}\b(api[ _-]?key|secret|password|token|webhook|credential|env(ironment)? variable|private key|upstream)/i,
    /\b(you are now|from now on you|act as|pretend (to be|you)|roleplay as|simulate|switch (to|into)|enter|enable)\b[^.\n]{0,30}\b(dan|jailbreak|developer mode|god mode|unrestricted|unfiltered|no (rules|restrictions|filter)|root access|system prompt)\b/i,
    /\b(jailbreak|do anything now|prompt injection|developer mode)\b/i,
    /(^|\n)\s*(system|assistant|developer|tool)\s*:/i,
    /<\s*\/?\s*(system|assistant|instruction|prompt|script|iframe|img|svg|style)\b|\[\s*\/?(INST|SYS)\s*\]|<\|[a-z_]+\|>/i
  ];
  const injection = text => { const t = cleanText(text, 1000); return INJ.some(r => r.test(t)); };

  /* ---------------- time + delay ---------------- */
  function stamp(d, tz) {
    const o = tz ? { timeZone: tz } : {};
    const dp = new Intl.DateTimeFormat('en-US', Object.assign({ month: 'long', day: 'numeric', year: 'numeric' }, o)).format(d);
    const tp = new Intl.DateTimeFormat('en-US', Object.assign({ hour: 'numeric', minute: '2-digit', hour12: true }, o)).format(d).replace(/[  ]/g, ' ');
    return dp + ' – ' + tp;
  }
  const MIN_MS = 2000, MAX_MS = 8000;
  /* controlled 2 to 8 second delay for answers the page already has: longer answers wait a little longer */
  const replyDelay = (len, rnd) => Math.max(MIN_MS, Math.min(MAX_MS, Math.round(MIN_MS + (len || 0) * 18 + (rnd == null ? Math.random() : rnd) * 1800)));

  /* ---------------- predefined knowledge base ---------------- */
  const DEFAULT_KB = [
    { id: 'kb-birthday', q: 'When is your birthday?', category: 'About', enabled: true, a: 'Frederick’s birthday is June 14.',
      alts: ['When is his birthday?', 'When is Frederick’s birthday?', 'When were you born?', 'What is your birth date?', 'What is your date of birth?', 'Birthday', 'Bday', 'B-day', 'What is your birthdate?'] },
    { id: 'kb-scam', q: 'Is this a scam?', category: 'Trust', enabled: true,
      a: 'Frederick offers services he is confident he can deliver. You can schedule a meeting with him and assess his experience, communication, and capabilities before making a decision. Always watch out for red flags when hiring any service provider.',
      alts: ['Is this legit?', 'Is this legitimate?', 'Are you legit?', 'Are you a scammer?', 'Is he legit?', 'Is Frederick legit?', 'Is this real?', 'Is this fake?', 'Can I trust you?', 'Can I trust him?', 'Is this a fraud?', 'Is this a scam website?', 'Is this site legit?', 'Is this a scam site?'] },
    { id: 'kb-greet', q: 'Good morning', category: 'Greetings', enabled: true, a: 'Hello! How can I help you?',
      alts: ['Good afternoon', 'Good evening', 'Good day', 'Morning', 'Afternoon', 'Evening', 'Hello', 'Hi', 'Hey', 'Hello there', 'Hi there', 'Hey there', 'Hola', 'Kumusta', 'Greetings'] }
  ];

  /* ---------------- shared settings ---------------- */
  const listeners = [];
  const DEF_ID = { name: 'Marcus', avatar: '', mod: { extra: [], allow: [] } };
  let ident = Object.assign({}, DEF_ID), kb = null;
  const cleanId = d => {
    d = d && typeof d === 'object' ? d : {};
    const name = String(d.name || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30) || DEF_ID.name;
    const av = typeof d.avatar === 'string' && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(d.avatar) && d.avatar.length < 120000 ? d.avatar : '';
    const m = d.mod && typeof d.mod === 'object' ? d.mod : {};
    return { name, avatar: av, mod: { extra: words(m.extra).slice(0, 200), allow: words(m.allow).slice(0, 200) } };
  };
  const cleanKb = d => (Array.isArray(d && d.items) ? d.items : []).slice(0, 200).map((i, n) => ({
    id: String(i.id || 'kb' + n).slice(0, 40), q: String(i.q || '').trim().slice(0, 200), a: String(i.a || '').trim().slice(0, 1500),
    alts: (Array.isArray(i.alts) ? i.alts : []).map(x => String(x).trim().slice(0, 200)).filter(Boolean).slice(0, 30), category: String(i.category || '').trim().slice(0, 30), enabled: i.enabled !== false })).filter(i => i.q && i.a);
  const emit = () => listeners.forEach(f => { try { f(); } catch (e) { /* ignore */ } });
  const CACHE = 'chatCfg';
  const save = () => { try { localStorage.setItem(CACHE, JSON.stringify({ i: ident, k: kb })); } catch (e) { /* ignore */ } };
  const api = {
    DEFAULT_KB, DEF_ID, tokens, score, matchKb, classify, injection, cleanText, stamp, replyDelay, MIN_MS, MAX_MS, TH, cleanId, cleanKb, BAD,
    identity: () => ident, kb: () => (kb == null ? DEFAULT_KB : kb), hasCustomKb: () => kb != null,
    setIdentity: d => { ident = cleanId(d); save(); emit(); },
    setKb: d => { kb = d ? cleanKb(d) : null; save(); emit(); },
    onChange: f => listeners.push(f)
  };
  try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c) { ident = cleanId(c.i); kb = c.k ? cleanKb({ items: c.k }) : null; } } catch (e) { /* ignore */ }
  root.chatEngine = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
