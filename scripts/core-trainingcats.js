/* ==========================================================================
   core-trainingcats.js - pure list operations for Owner Panel > Training categories (CodeFlow 4.5.0, phase T1). No DOM, no database.
   Runs in the browser (window.coreTrainingCats) and in Node (module.exports) so the SAME code is unit-tested.
   Add / copy / delete / restore work on a plain array (the draft); publishing still goes through training.js clean() and the owner-only rules.
   ========================================================================== */
(function (root) {
  'use strict';
  const MAX = 7, LIMIT = 900000, TITLE = 80;
  const clone = v => JSON.parse(JSON.stringify(v));
  const rnd = () => Math.random().toString(36).slice(2, 7);
  /* ids are at most 20 characters (training.js keeps 20) and never repeat inside the list */
  function newId(list, prefix, gen) {
    const used = new Set((list || []).map(t => t && t.id)); const g = gen || rnd;
    for (let i = 0; i < 50; i++) { const id = (prefix + Date.now().toString(36).slice(-5) + g()).slice(0, 20); if (!used.has(id)) return id; }
    throw new Error('Could not make a unique id');
  }
  const sizeOf = list => JSON.stringify(list).length;
  const room = list => MAX - (Array.isArray(list) ? list.length : 0);
  const imageCount = t => (t && t.handsOn && t.handsOn.image ? 1 : 0) + ((t && t.tools) || []).reduce((n, x) => n + ((x && x.images) || []).length, 0);
  function blank(id) { return { id, title: 'New category', summary: '', enabled: false, overview: '', handsOn: { text: '', image: null }, tools: [], toolkit: '', howIWork: '' }; }
  function add(list, gen) {
    if (room(list) <= 0) return { ok: false, error: 'You can have up to ' + MAX + ' categories. Delete one first.' };
    const t = blank(newId(list, 'tc', gen)); return { ok: true, list: list.concat([t]), added: t };
  }
  function stripImages(t) { t.handsOn = Object.assign({}, t.handsOn, { image: null }); t.tools = (t.tools || []).map(x => Object.assign({}, x, { images: [] })); return t; }
  /* copy is inserted right after the original and starts hidden */
  function copy(list, id, opts, gen) {
    opts = opts || {};
    const i = list.findIndex(t => t.id === id); if (i < 0) return { ok: false, error: 'Category not found.' };
    if (room(list) <= 0) return { ok: false, error: 'You can have up to ' + MAX + ' categories. Delete one first.' };
    const t = clone(list[i]); t.id = newId(list, 'tc', gen); t.title = ('Copy of ' + t.title).slice(0, TITLE); t.enabled = false;
    t.tools = (t.tools || []).map(x => Object.assign({}, x, { id: ('tl' + t.id.slice(2) + (gen || rnd)()).slice(0, 40) }));
    if (opts.noImages) stripImages(t);
    const out = list.slice(0, i + 1).concat([t], list.slice(i + 1));
    return { ok: true, list: out, added: t, imagesDropped: !!opts.noImages && imageCount(list[i]) > 0 };
  }
  /* does a full copy still fit under the publish limit? */
  function copyFits(list, id, gen) { const a = copy(list, id, { noImages: false }, gen); return a.ok ? { full: sizeOf(a.list) <= LIMIT, light: sizeOf(copy(list, id, { noImages: true }, gen).list) <= LIMIT } : { full: false, light: false }; }
  function remove(list, id) { return list.filter(t => t.id !== id); }
  /* what is lost with a category, and what stays linked to it */
  function impact(t, videos, faqs) {
    return { tools: ((t && t.tools) || []).length, images: imageCount(t),
      videos: (videos || []).filter(v => v && v.category === (t && t.id)).length, faqs: (faqs || []).filter(f => f && f.category === (t && t.id)).length };
  }
  const missingOriginals = (list, defaults) => (defaults || []).filter(d => !(list || []).some(t => t.id === d.id));
  function restore(list, defaults) {
    const miss = missingOriginals(list, defaults), take = miss.slice(0, Math.max(0, room(list)));
    return { list: list.concat(clone(take)), added: take.length, skipped: miss.length - take.length };
  }
  /* a video or FAQ whose category was deleted counts as General */
  const knownOrGeneral = (id, list) => (id && (list || []).some(t => t.id === id)) ? id : '';
  const api = { MAX, LIMIT, newId, sizeOf, room, imageCount, blank, add, copy, copyFits, remove, impact, missingOriginals, restore, knownOrGeneral };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreTrainingCats = api;
})(typeof window !== 'undefined' ? window : globalThis);
