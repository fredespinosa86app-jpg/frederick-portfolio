/* ==========================================================================
   core-wtalarm.js - pure logic of the WorkTrack break alarm (CodeFlow 4.5.0, phase W5c). No DOM, no audio, no database.
   Runs in the browser (window.coreWtAlarm) and in Node (module.exports) so the SAME code is unit-tested.
   It is a BROWSER REMINDER, not a guaranteed alarm: nothing can ring if the browser is closed, the computer sleeps or the system freezes the tab.
   Everything is worked out from the W5b deadline (database punch time + allowed minutes). Nothing is stored in the database.
   ========================================================================== */
(function (root) {
  'use strict';
  const SOUNDS = ['chime', 'bell', 'beep', 'urgent'], MAX_REPEATS = 10, GRACE_MS = 5000, MAX_SOUND_S = 2.5;
  const DEFAULTS = Object.freeze({ on: false, warn: 5, repeat: 1, sound: 'chime', vol: 60, notify: false });
  const int = (v, lo, hi, d) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi) ? v : d;

  /* saved settings (text or object) -> safe settings. Anything odd falls back to the default for that one field. */
  function validPrefs(raw) {
    let o = raw;
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { o = null; } }
    if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
    return { on: o.on === true, warn: int(o.warn, 0, 30, DEFAULTS.warn), repeat: int(o.repeat, 0, 10, DEFAULTS.repeat), sound: SOUNDS.indexOf(o.sound) >= 0 ? o.sound : DEFAULTS.sound, vol: int(o.vol, 10, 100, DEFAULTS.vol), notify: o.notify === true };
  }

  /* the moments of one break. b = { outMs, deadlineMs, limitMin } from wtApi.breakInfo(). No limit (0) means no alarm at all. */
  function schedule(b, p) {
    if (!b || !p || !isFinite(b.outMs) || !isFinite(b.deadlineMs) || !(b.limitMin > 0)) return [];
    const ev = [];
    if (p.warn > 0 && b.deadlineMs - p.warn * 60000 > b.outMs) ev.push({ atMs: b.deadlineMs - p.warn * 60000, kind: 'warn', n: 0 });
    ev.push({ atMs: b.deadlineMs, kind: 'late', n: 0 });
    if (p.repeat > 0) for (let i = 1; i <= MAX_REPEATS; i++) ev.push({ atMs: b.deadlineMs + i * p.repeat * 60000, kind: 'repeat', n: i });
    return ev;
  }

  /* which moments have passed and not been handled. A moment more than GRACE_MS old is missed: it is marked handled but NEVER played (no replay after a reload, a sleep or a throttled tab). */
  function due(events, handled, nowMs) {
    const play = [], missed = [], mark = [];
    (events || []).forEach((e, i) => { if (handled && handled.has(i) || e.atMs > nowMs) return; mark.push(i); (nowMs - e.atMs <= GRACE_MS ? play : missed).push(e); });
    return { play, missed, mark };
  }

  /* notes of a sound: [{ f Hz, at s, dur s, wave, gain 0..1 }]. gain already includes the volume and the 0.8 master factor. Longest sound is 2.5 s. */
  function notes(name, volPct) {
    const m = int(volPct, 10, 100, DEFAULTS.vol) / 100 * 0.8, N = (f, at, dur, wave, g) => ({ f, at, dur, wave, gain: Math.round(g * m * 1000) / 1000 });
    switch (name) {
      case 'soft': return [N(660, 0, 0.45, 'sine', 0.45)];                                                    // the warning before the limit
      case 'bell': return [N(660, 0, 1.6, 'sine', 0.8), N(1320, 0, 1.1, 'sine', 0.35), N(1980, 0, 0.7, 'sine', 0.15)];
      case 'beep': return [0, 0.35, 0.7].map(t => N(1000, t, 0.2, 'square', 0.35));
      case 'urgent': { const o = []; for (let i = 0; i < 8; i++) o.push(N(i % 2 ? 660 : 880, i * 0.3, 0.26, 'sawtooth', 0.4)); return o; }
      default: return [N(880, 0, 0.45, 'sine', 0.8), N(1175, 0.4, 0.9, 'sine', 0.8)];                          // chime
    }
  }
  const length = list => list.reduce((m, n) => Math.max(m, n.at + n.dur), 0);

  /* tab title: remember the page's own title; restore it ONLY if the title is still ours (another script may have changed it since) */
  const titleFor = name => 'Late: ' + String(name || 'break').toLowerCase();
  function titleStep(s) {          // s = { current, saved, ours, flip } -> { title (what to set now), saved }
    let saved = s.saved; if (s.current !== s.ours && s.current !== saved) saved = s.current;     // someone else changed the title: that is the new original
    return { title: s.flip ? s.ours : saved, saved };
  }
  const titleRestore = s => s.current === s.ours ? s.saved : s.current;                              // never overwrite a title we did not set

  /* generic text only: never a Client ID, a time of day or a person */
  const notifyText = (kind, name) => kind === 'warn' ? 'Your ' + String(name || 'break').toLowerCase() + ' ends soon.' : 'Time to come back from ' + String(name || 'your break').toLowerCase() + '.';

  const api = { SOUNDS, MAX_REPEATS, GRACE_MS, MAX_SOUND_S, DEFAULTS, validPrefs, schedule, due, notes, length, titleFor, titleStep, titleRestore, notifyText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreWtAlarm = api;
})(typeof window !== 'undefined' ? window : globalThis);
