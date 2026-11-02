/* ==========================================================================
   service-forms.js - service-specific qualifying questions for the meeting request form (Phase 6)
   Data: content/serviceForms { enabled, services[{id,name}], forms[{id,name,serviceId,description,active,fields[]}] }
   (public read, owner write: it holds questions only, never visitor answers).
   The master switch is off by default, so nothing changes until the owner turns it on.
   ========================================================================== */
(function () {
  'use strict';
  const CACHE = 'svcForms';
  const MAX = { services: 20, forms: 20, fields: 15, options: 12, answers: 4000 };
  const TYPES = [['text', 'Short text'], ['textarea', 'Long text'], ['email', 'Email'], ['tel', 'Phone number'], ['number', 'Number'], ['select', 'Dropdown'], ['radio', 'Radio buttons'], ['checkbox', 'Checkboxes'], ['date', 'Date']];
  const HAS_OPTS = new Set(['select', 'radio', 'checkbox']);
  const DEFAULT_SERVICES = ['Product Research for Online Arbitrage', 'Amazon Product Research', 'Amazon VA – Private Label', 'Product Sourcing', 'Product Listing', 'Inventory Management', 'PPC (Pay-Per-Click)', 'AI Automation', 'Other Services']
    .map((n, i) => ({ id: 'svc' + (i + 1), name: n }));
  const LEN = { text: 200, textarea: 1000, email: 120, tel: 30, number: 20, date: 10, select: 100, radio: 100, checkbox: 300 };
  const listeners = [];
  const txt = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const id = (v, fb) => { const s = String(v || '').replace(/[^\w-]/g, '').slice(0, 30); return s || fb; };

  function clean(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const hasSvc = Array.isArray(r.services);
    const seen = new Set();
    const services = (hasSvc ? r.services : DEFAULT_SERVICES).slice(0, MAX.services).map((s, i) => ({ id: id(s && s.id, 'svc' + (i + 1)), name: txt(s && s.name, 60) })).filter(s => s.name && !seen.has(s.id) && seen.add(s.id));
    const fseen = new Set();
    const forms = (Array.isArray(r.forms) ? r.forms : []).slice(0, MAX.forms).map((f, i) => {
      const ids = new Set();
      const fields = (Array.isArray(f && f.fields) ? f.fields : []).slice(0, MAX.fields).map((q, j) => {
        const type = TYPES.some(t => t[0] === (q && q.type)) ? q.type : 'text';
        return { id: id(q && q.id, 'q' + (j + 1)), label: txt(q && q.label, 160), type, required: !!(q && q.required),
          options: HAS_OPTS.has(type) ? (Array.isArray(q && q.options) ? q.options : []).map(o => txt(o, 80)).filter(Boolean).slice(0, MAX.options) : [] };
      }).filter(q => q.label && (!HAS_OPTS.has(q.type) || q.options.length) && !ids.has(q.id) && ids.add(q.id));
      return { id: id(f && f.id, 'form' + (i + 1)), name: txt(f && f.name, 100), serviceId: id(f && f.serviceId, ''), description: txt(f && f.description, 400), active: !!(f && f.active), fields };
    }).filter(f => f.name && !fseen.has(f.id) && fseen.add(f.id));
    return { enabled: r.enabled === true, services, forms };
  }
  let state = clean(null);
  const save = () => { try { localStorage.setItem(CACHE, JSON.stringify(state)); } catch (e) { /* ignore */ } };
  const formFor = sid => state.forms.find(f => f.active && f.serviceId === sid && f.fields.length) || null;

  /* ---- rendering (shared by the public form and the owner preview) ---- */
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  function render(box, form, prefix) {
    prefix = prefix || 'sf'; box.replaceChildren();
    const inputs = {};
    form.fields.forEach(q => {
      const fid = prefix + '-' + q.id, wrap = el(HAS_OPTS.has(q.type) && q.type !== 'select' ? 'fieldset' : 'div', 'sfq');
      const lab = HAS_OPTS.has(q.type) && q.type !== 'select' ? el('legend', 'sfl', q.label) : el('label', 'sfl', q.label);
      if (lab.tagName === 'LABEL') lab.htmlFor = fid;
      lab.append(el('span', 'opt', q.required ? ' (required)' : ' (optional)')); wrap.append(lab);
      let ctl;
      if (q.type === 'textarea') { ctl = el('textarea'); ctl.rows = 3; ctl.maxLength = LEN.textarea; ctl.id = fid; wrap.append(ctl); }
      else if (q.type === 'select') { ctl = el('select'); ctl.id = fid; ctl.append(Object.assign(el('option', '', 'Choose…'), { value: '' })); q.options.forEach(o => ctl.append(Object.assign(el('option', '', o), { value: o }))); wrap.append(ctl); }
      else if (q.type === 'radio' || q.type === 'checkbox') {
        ctl = []; const g = el('div', 'sfopts');
        q.options.forEach((o, k) => { const l = el('label', 'sfo'), i = el('input'); i.type = q.type; i.name = fid; i.value = o; i.id = fid + '-' + k; l.append(i, document.createTextNode(' ' + o)); g.append(l); ctl.push(i); });
        wrap.append(g);
      } else { ctl = el('input'); ctl.type = q.type === 'tel' ? 'tel' : q.type; ctl.id = fid; ctl.maxLength = LEN[q.type] || 200; if (q.type === 'number') { ctl.step = 'any'; ctl.inputMode = 'decimal'; } wrap.append(ctl); }
      inputs[q.id] = ctl; box.append(wrap);
    });
    const read = q => { const c = inputs[q.id]; return q.type === 'checkbox' ? c.filter(i => i.checked).map(i => i.value) : q.type === 'radio' ? (c.find(i => i.checked) || {}).value || '' : c.value; };
    return {
      /* returns {ok, error, answers:[{q,a}]}; the same rules are shown to the visitor and applied again before saving */
      validate() {
        const answers = [];
        for (const q of form.fields) {
          let v = read(q);
          if (Array.isArray(v)) { v = v.filter(x => q.options.includes(x)); if (q.required && !v.length) return { ok: false, error: 'Please answer: ' + q.label }; if (v.length) answers.push({ q: q.label, a: v.join(', ') }); continue; }
          v = txt(q.type === 'textarea' ? String(v).replace(/\r?\n/g, ' ⏎ ') : v, LEN[q.type] || 200).replace(/ ⏎ /g, '\n');
          if (!v) { if (q.required) return { ok: false, error: 'Please answer: ' + q.label }; continue; }
          if (q.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { ok: false, error: 'Please enter a valid email for: ' + q.label };
          if (q.type === 'tel' && !/^[+\d][\d\s\-().]{5,28}$/.test(v)) return { ok: false, error: 'Please enter a valid phone number for: ' + q.label };
          if (q.type === 'number' && !isFinite(Number(v))) return { ok: false, error: 'Please enter a number for: ' + q.label };
          if (q.type === 'date' && !(/^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + 'T00:00:00Z')))) return { ok: false, error: 'Please choose a valid date for: ' + q.label };
          if ((q.type === 'select' || q.type === 'radio') && !q.options.includes(v)) return { ok: false, error: 'Please choose one of the options for: ' + q.label };
          answers.push({ q: q.label, a: v });
        }
        if (JSON.stringify(answers).length > MAX.answers) return { ok: false, error: 'Your answers are too long. Please shorten them.' };
        return { ok: true, answers };
      }
    };
  }

  const emit = () => listeners.forEach(f => { try { f(); } catch (e) { /* ignore */ } });
  window.serviceFormsApi = {
    MAX, TYPES, HAS_OPTS, DEFAULT_SERVICES, clean, render, formFor,
    get: () => state, enabled: () => state.enabled && state.services.length > 0,
    set: raw => { state = clean(raw); save(); emit(); }, preview: raw => { state = clean(raw); emit(); },
    onChange: f => listeners.push(f)
  };
  try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c) state = clean(c); } catch (e) { /* ignore */ }
})();
