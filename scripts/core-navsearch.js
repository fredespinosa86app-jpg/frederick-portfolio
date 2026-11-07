/* ==========================================================================
   core-navsearch.js - pure matching for the Owner Panel drawer search box (CodeFlow 4.5.0, R4). No DOM, no storage, no network.
   match(query, items) -> the keys that match. items = [{key, label}]; extra search words come from KEYWORDS (by page key).
   Every typed word must appear somewhere in the label or the keywords (case and accents ignored). An empty query matches everything.
   Runs in the browser (window.coreNavSearch) and in Node (module.exports) so the SAME code is unit-tested.
   ========================================================================== */
(function (root) {
  'use strict';
  /* hidden words: what an owner might type for a page whose name does not contain it */
  const KEYWORDS = {
    dashboard: 'home overview today summary due reminders', inbox: 'meeting call booking requests leads messages',
    questions: 'chat chatbot unanswered history visitors asked', marcus: 'chatbot assistant ai bot settings webhook configuration',
    chatid: 'chatbot look appearance colors avatar filter words blocked', chatkb: 'chatbot answers knowledge base quick replies scripted',
    services: 'offers prices packages', toolkit: 'tools software skills', testimonials: 'reviews feedback quotes ratings',
    training: 'courses categories lessons', videos: 'how i work youtube', faq: 'questions answers help', experience: 'resume cv jobs history work',
    video: 'intro introduction welcome youtube', library: 'images photos pictures media upload',
    booking: 'availability calendar hours rates capacity busy slots pause schedule', svcforms: 'service forms questions intake',
    clients: 'clients invoices customers accounts', worktrack: 'time tracking timer sessions hours clock alarm', clientids: 'client id registry codes',
    billing: 'billing profiles rates currency', billhours: 'billable hours entries time', due: 'billing due payments overdue', invoices: 'invoice bills payments paid credit',
    surveys: 'employer survey feedback testimonial rejected answers reminders links', visitors: 'analytics visits traffic stats pages',
    integrations: 'google sheets calendly connections webhook', domain: 'custom domain dns cloudflare headers address',
    theme: 'colors dark light fonts effects style', secbg: 'section backgrounds colors images', hero: 'banner headline top photo',
    social: 'links contact email linkedin facebook phone', seo: 'search engine google preview sharing social image title description',
    security: 'verification turnstile app check budget cap limit cloudflare protection spam rules daily', privacy: 'retention backup delete cleanup restore data privacy notice export personal',
    ownerdocs: 'owner documents files contracts', general: 'general settings site name title language'
  };
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function match(query, items) {
    const words = norm(query).split(/\s+/).filter(Boolean);
    return (items || []).filter(it => { const hay = norm(it.label) + ' ' + norm(KEYWORDS[it.key] || ''); return words.every(w => hay.includes(w)); }).map(it => it.key);
  }
  const api = { KEYWORDS, match };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreNavSearch = api;
})(typeof window !== 'undefined' ? window : globalThis);
