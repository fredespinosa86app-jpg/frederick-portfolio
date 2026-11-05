/* ==========================================================================
   content-cache.js - Phase R1: short-lived browser cache for public content documents.
   Why: each page visit used to open 16 live listeners, i.e. 16 Firestore reads, and every reload
   paid them again. Now a visitor who loaded a document in the last CACHE_MS minutes reuses the
   saved copy (0 reads). The owner's device never uses this (it keeps live listeners).
   Only public documents are cached (content/* and settings/site). Anything unreadable, old,
   oversized or malformed is treated as "no cache" and the page falls back to a normal read.
   ========================================================================== */
(function (root) {
  'use strict';
  var CACHE_MS = 10 * 60 * 1000;       // fresh for 10 minutes
  var STALE_MAX_MS = 24 * 60 * 60 * 1000; // used only if the network read fails
  var MAX_CHARS = 250000;               // larger documents (for example a hero photo) are not cached
  var PREFIX = 'pc:v1:';

  function store() { try { return root.localStorage || null; } catch (e) { return null; } }

  /* a stand-in for a Firestore snapshot, enough for the page's handlers */
  function snap(d) { return { exists: function () { return d !== null; }, data: function () { return d === null ? undefined : d; } }; }

  /* returns {t, d} or null; never throws */
  function read(key, st) {
    try {
      st = st || store(); if (!st) return null;
      var raw = st.getItem(PREFIX + key); if (!raw || raw.length > MAX_CHARS + 200) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object' || typeof o.t !== 'number' || !isFinite(o.t)) return null;
      if (o.d !== null && (typeof o.d !== 'object' || Array.isArray(o.d))) return null;
      return { t: o.t, d: o.d };
    } catch (e) { return null; }
  }
  /* true when saved */
  function write(key, data, now, st) {
    try {
      st = st || store(); if (!st) return false;
      var d = data === undefined ? null : data;
      var s = JSON.stringify({ t: now, d: d });
      if (s.length > MAX_CHARS) { try { st.removeItem(PREFIX + key); } catch (e) {} return false; }
      st.setItem(PREFIX + key, s); return true;
    } catch (e) { return false; }
  }
  function isFresh(o, now) { return !!o && now - o.t >= 0 && now - o.t < CACHE_MS; }
  function isUsableStale(o, now) { return !!o && now - o.t >= 0 && now - o.t < STALE_MAX_MS; }
  /* the owner's device keeps live listeners (set when the owner signs in) */
  function ownerDevice(st) { try { st = st || store(); return !!st && st.getItem('ownerDevice') === '1'; } catch (e) { return false; } }

  var api = { CACHE_MS: CACHE_MS, STALE_MAX_MS: STALE_MAX_MS, MAX_CHARS: MAX_CHARS, PREFIX: PREFIX, snap: snap, read: read, write: write, isFresh: isFresh, isUsableStale: isUsableStale, ownerDevice: ownerDevice };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.contentCache = api;
})(typeof window !== 'undefined' ? window : globalThis);
