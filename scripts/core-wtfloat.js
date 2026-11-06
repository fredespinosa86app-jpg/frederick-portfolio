/* ==========================================================================
   core-wtfloat.js - pure logic of the floating WorkTrack clock (CodeFlow 4.5.0, phase W5a). No DOM, no database.
   Runs in the browser (window.coreWtFloat) and in Node (module.exports) so the SAME code is unit-tested.
   It decides: is the clock visible, which punch buttons it offers, and where it may sit on the screen.
   It never changes a punch, the state machine or the records; it only reads what core-worktrack.js already derived.
   ========================================================================== */
(function (root) {
  'use strict';
  const KEY = 'wtFloat:v1', MARGIN = 8, MIN_W = 180, MIN_H = 48;
  const HIDE_BTN = { CLOCK_IN: 1, CLOSE_INCOMPLETE: 1 };       // the clock offers only the steps of a day in progress; closing as incomplete stays on the WorkTrack page
  const num = v => typeof v === 'number' && isFinite(v);

  /* what the clock shows. st = workState, derived = core.derive(...) result, core = window.coreWork */
  function view(st, derived, core) {
    const off = { visible: false, buttons: [], state: 'NOT_STARTED', label: '' };
    if (!st || !derived || !core) return off;
    if (st.state === 'NOT_STARTED' || core.STATES.indexOf(st.state) < 0) return off;
    if (!derived.valid) return Object.assign({}, off, { visible: true, paused: true, state: st.state, label: core.STATE_LABEL[st.state] || '' });   // records out of order: show the clock but offer no punches
    const buttons = core.options(st, 'x').filter(o => o.ok && !HIDE_BTN[o.type]).map(o => ({ type: o.type, label: o.label, confirm: o.type === 'CLOCK_OUT' }));
    return { visible: true, paused: false, state: st.state, label: core.STATE_LABEL[st.state] || '', buttons };
  }

  /* keep the clock fully inside the window. pos = {x,y} top-left in px; vp = {w,h}; size = {w,h} */
  function clamp(pos, vp, size) {
    const w = Math.max(MIN_W, size && num(size.w) ? size.w : MIN_W), h = Math.max(MIN_H, size && num(size.h) ? size.h : MIN_H);
    const maxX = Math.max(MARGIN, vp.w - w - MARGIN), maxY = Math.max(MARGIN, vp.h - h - MARGIN);
    const x = num(pos && pos.x) ? pos.x : maxX, y = num(pos && pos.y) ? pos.y : MARGIN;
    return { x: Math.round(Math.min(Math.max(MARGIN, x), maxX)), y: Math.round(Math.min(Math.max(MARGIN, y), maxY)) };
  }
  const defaultPos = (vp, size, top) => clamp({ x: Infinity, y: num(top) ? top : MARGIN }, vp, size);          // top right; 'top' lets the dashboard keep it below its own header buttons

  /* saved preferences: never trust stored text */
  function parsePrefs(raw) {
    const out = { x: null, y: null, min: false };
    try {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object' && !Array.isArray(o)) { if (num(o.x) && num(o.y)) { out.x = Math.round(o.x); out.y = Math.round(o.y); } out.min = o.min === true; }
    } catch (e) { /* keep defaults */ }
    return out;
  }
  const serializePrefs = p => JSON.stringify({ x: num(p.x) ? Math.round(p.x) : null, y: num(p.y) ? Math.round(p.y) : null, min: p.min === true });

  /* one step of keyboard moving: arrow keys move 10 px, Shift+arrow 50 px */
  function nudge(pos, key, shift) {
    const s = shift ? 50 : 10, d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[key];
    return d ? { x: pos.x + d[0], y: pos.y + d[1] } : null;
  }

  /* the 'next corner' button: from the corner nearest to the clock now, go clockwise (top right, bottom right, bottom left, top left) */
  function nextCorner(pos, vp, size, top) {
    const w = Math.max(MIN_W, size && num(size.w) ? size.w : MIN_W), h = Math.max(MIN_H, size && num(size.h) ? size.h : MIN_H), t = num(top) ? top : MARGIN;
    const right = vp.w - w - MARGIN, bottom = vp.h - h - MARGIN, cx = (pos && num(pos.x) ? pos.x : right) + w / 2, cy = (pos && num(pos.y) ? pos.y : t) + h / 2;
    const east = cx >= vp.w / 2, south = cy >= vp.h / 2;
    const to = east ? (south ? { x: MARGIN, y: bottom } : { x: right, y: bottom }) : (south ? { x: MARGIN, y: t } : { x: right, y: t });   // east+north -> bottom right; east+south -> bottom left; west+south -> top left; west+north -> top right   // TR -> BR -> BL -> TL -> TR
    return clamp(to, vp, { w, h });
  }

  const api = { nextCorner, KEY, MARGIN, MIN_W, MIN_H, view, clamp, defaultPos, parsePrefs, serializePrefs, nudge };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreWtFloat = api;
})(typeof window !== 'undefined' ? window : globalThis);
