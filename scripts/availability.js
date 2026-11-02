/* ==========================================================================
   availability.js - owner availability, confirmed-meeting conflicts and public rates.
   Shared by the public meeting form and the owner dashboard.
   Data (all public by design, no personal details):
     content/availability { days[0-6], start 'HH:MM', end 'HH:MM', slot minutes, tz, blocked[{from,to,label}] }
     content/busy         { keys['YYYY-MM-DDTHH:MM'], items[{u: UTC ms, m: minutes}] }   (confirmed meetings only)
     content/rates        { currency, hourly|null, monthly|null }   (only what the owner chose to show)
   Defaults match what the chatbot already says: Monday to Saturday, 8:00 AM to 9:00 PM Philippine time.
   ========================================================================== */
(function () {
  'use strict';
  const CACHE = 'availCfg';
  const DEFAULT = { days: [1, 2, 3, 4, 5, 6], start: '08:00', end: '21:00', slot: 30, tz: 'Asia/Manila', blocked: [] };
  const SLOTS = [15, 30, 45, 60];
  let cfg = DEFAULT, busy = { keys: [], items: [] }, rates = { currency: 'USD', hourly: null, monthly: null };
  const listeners = [];

  const tzOk = tz => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return typeof tz === 'string' && tz.length < 60; } catch (e) { return false; } };
  const hm = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v || '') ? v : '';
  const ymd = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !isNaN(Date.parse(v + 'T00:00:00Z')) ? v : '';
  const mins = t => +t.slice(0, 2) * 60 + +t.slice(3);
  const pad = n => String(n).padStart(2, '0');

  function clean(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const days = [...new Set((Array.isArray(r.days) ? r.days : DEFAULT.days).map(Number).filter(d => d >= 0 && d <= 6))].sort();
    let start = hm(r.start) || DEFAULT.start, end = hm(r.end) || DEFAULT.end;
    if (mins(end) <= mins(start)) { start = DEFAULT.start; end = DEFAULT.end; }
    const blocked = (Array.isArray(r.blocked) ? r.blocked : []).slice(0, 100).map(b => {
      const from = ymd(b && b.from), to = ymd(b && b.to) || from;
      return from ? { from, to: to < from ? from : to, label: String((b && b.label) || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 60) } : null;
    }).filter(Boolean);
    return { days, start, end, slot: SLOTS.includes(+r.slot) ? +r.slot : DEFAULT.slot, tz: tzOk(r.tz) ? r.tz : DEFAULT.tz, blocked };
  }
  const cleanBusy = raw => {
    const r = raw && typeof raw === 'object' ? raw : {};
    return { keys: (Array.isArray(r.keys) ? r.keys : []).filter(k => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(k)).slice(0, 400),
      items: (Array.isArray(r.items) ? r.items : []).map(i => ({ u: Number(i && i.u), m: Number(i && i.m) })).filter(i => Number.isFinite(i.u) && i.m > 0 && i.m <= 600).slice(0, 400) };
  };
  const money = v => (typeof v === 'number' && isFinite(v) && v >= 0) ? v : null;

  /* ---- time zone arithmetic (no libraries) ---- */
  function parts(ms, tz) {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const o = {}; f.formatToParts(new Date(ms)).forEach(p => { o[p.type] = p.value; });
    return { date: o.year + '-' + o.month + '-' + o.day, time: o.hour + ':' + o.minute, asUtc: Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second) };
  }
  const offset = (ms, tz) => parts(ms, tz).asUtc - Math.floor(ms / 1000) * 1000;
  /* wall-clock time in `tz` -> UTC milliseconds */
  function wallToMs(date, time, tz) {
    const [y, m, d] = date.split('-').map(Number), [H, M] = time.split(':').map(Number), guess = Date.UTC(y, m - 1, d, H, M);
    let t = guess; for (let i = 0; i < 3; i++) t = guess - offset(t, tz);
    return t;
  }
  const dowOf = date => new Date(date + 'T00:00:00Z').getUTCDay();
  const today = (tz, now) => parts(now == null ? Date.now() : now, tz || cfg.tz).date;
  const addDays = (date, n) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  const isBlocked = (date, c) => (c || cfg).blocked.some(b => date >= b.from && date <= b.to);
  const blockLabel = date => { const b = cfg.blocked.find(x => date >= x.from && date <= x.to); return b ? (b.label || 'Unavailable') : ''; };

  /* slots of one calendar date (in the owner's time zone): state is free | taken | past */
  function daySlots(date, now, c, b) {
    c = c || cfg; b = b || busy; now = now == null ? Date.now() : now;
    if (!c.days.includes(dowOf(date)) || isBlocked(date, c)) return [];
    const out = [], len = c.slot;
    for (let t = mins(c.start); t + len <= mins(c.end); t += len) {
      const time = pad(Math.floor(t / 60)) + ':' + pad(t % 60), ms = wallToMs(date, time, c.tz), end = ms + len * 60000;
      let state = 'free';
      if (ms <= now) state = 'past';
      else if (b.items.some(i => ms < i.u + i.m * 60000 && end > i.u)) state = 'taken';
      out.push({ time, ms, state });
    }
    return out;
  }

  /* does this saved request overlap a confirmed meeting? (owner warning before confirming) */
  function requestToMs(r) {
    const tz = tzOk(r.tz) ? r.tz : cfg.tz;
    return /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') && /^\d{2}:\d{2}$/.test(r.time || '') ? wallToMs(r.date, r.time, tz) : NaN;
  }
  /* busy list built from the confirmed requests that are still in the future */
  function buildBusy(requests, c) {
    c = c || cfg; const items = [], keys = [], now = Date.now();
    requests.forEach(r => {
      if (r.status !== 'confirmed') return;
      const u = requestToMs(r); if (!Number.isFinite(u) || u + c.slot * 60000 < now) return;
      items.push({ u, m: c.slot }); keys.push(parts(u, c.tz).date + 'T' + parts(u, c.tz).time);
    });
    items.sort((a, b) => a.u - b.u); keys.sort();
    return { keys: [...new Set(keys)].slice(0, 400), items: items.slice(0, 400) };
  }
  function conflict(req, all) {
    const u = requestToMs(req); if (!Number.isFinite(u)) return null;
    return all.find(o => o !== req && o.id !== req.id && o.status === 'confirmed' && Number.isFinite(requestToMs(o)) && u < requestToMs(o) + cfg.slot * 60000 && u + cfg.slot * 60000 > requestToMs(o)) || null;
  }

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const t12 = t => { const h = +t.slice(0, 2); return ((h + 11) % 12 + 1) + ':' + t.slice(3) + ' ' + (h < 12 ? 'AM' : 'PM'); };
  const tzName = tz => tz === 'Asia/Manila' ? 'Philippine time (PHT, UTC+8)' : tz;
  function daysText(days) {
    if (!days.length) return 'no days';
    const runs = []; days.forEach(d => { const l = runs[runs.length - 1]; if (l && l[1] === d - 1) l[1] = d; else runs.push([d, d]); });
    return runs.map(([a, b]) => a === b ? DAYS[a] : b === a + 1 ? DAYS[a] + ' and ' + DAYS[b] : DAYS[a] + ' to ' + DAYS[b]).join(', ');
  }
  const sentence = c => { c = c || cfg; return daysText(c.days) + ', ' + t12(c.start) + ' to ' + t12(c.end) + ' ' + tzName(c.tz); };

  const emit = () => listeners.forEach(f => { try { f(); } catch (e) { /* ignore */ } });
  const save = () => { try { localStorage.setItem(CACHE, JSON.stringify({ c: cfg, b: busy, r: rates })); } catch (e) { /* ignore */ } };

  /* public rates line under the Services heading (only when the owner switched it on) */
  function renderRates() {
    const e = document.getElementById('ratesLine'); if (!e) return;
    const bits = []; const sym = rates.currency || 'USD';
    if (rates.hourly != null) bits.push(sym + ' ' + rates.hourly + ' per hour');
    if (rates.monthly != null) bits.push(sym + ' ' + rates.monthly + ' per month');
    e.textContent = bits.length ? 'Rates: ' + bits.join(' · ') : ''; e.hidden = !bits.length;
  }

  window.availApi = {
    DEFAULT, SLOTS, DAYS,
    cfg: () => cfg, busy: () => busy, rates: () => rates, clean, tzOk, mins, hm, ymd,
    setCfg: raw => { cfg = clean(raw); save(); emit(); },
    setBusy: raw => { busy = cleanBusy(raw); save(); emit(); },
    setRates: raw => { const r = raw && typeof raw === 'object' ? raw : {}; rates = { currency: String(r.currency || 'USD').replace(/[^A-Za-z$€£₱ ]/g, '').slice(0, 5) || 'USD', hourly: money(r.hourly), monthly: money(r.monthly) }; save(); renderRates(); emit(); },
    parts, wallToMs, today, addDays, dowOf, isBlocked, blockLabel, daySlots, buildBusy, conflict, requestToMs, sentence, daysText, t12, tzName,
    onChange: f => listeners.push(f)
  };
  try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c) { cfg = clean(c.c); busy = cleanBusy(c.b); rates = c.r || rates; } } catch (e) { /* ignore */ }
  renderRates();
})();
