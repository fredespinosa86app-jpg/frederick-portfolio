/* ==========================================================================
   contacts.js - validation and rendering of the configurable contact / social icons
   Config lives in scripts/settings.js (defaults) and Firestore settings/site.contacts (owner panel).
   ========================================================================== */
(function () {
  'use strict';
  const ORDER = ['linkedin', 'onlinejobs', 'upwork', 'email', 'whatsapp', 'facebook', 'fiverr', 'freelancer', 'phone'];
  const META = {
    linkedin:   { label: 'LinkedIn',      icon: 'li', hosts: ['linkedin.com'],   hint: 'https://www.linkedin.com/in/your-name' },
    onlinejobs: { label: 'OnlineJobs.ph', icon: 'oj', hosts: ['onlinejobs.ph'],  hint: 'https://www.onlinejobs.ph/jobseekers/info/...' },
    upwork:     { label: 'Upwork',        icon: 'up', hosts: ['upwork.com'],     hint: 'https://www.upwork.com/freelancers/~...' },
    email:      { label: 'Email',         icon: 'gm',                             hint: 'name@example.com' },
    whatsapp:   { label: 'WhatsApp',      icon: 'wa',                             hint: '+63 905 291 2208 or https://wa.me/639052912208' },
    facebook:   { label: 'Facebook',      icon: 'fb', hosts: ['facebook.com', 'fb.com', 'fb.me'], hint: 'https://www.facebook.com/your-page' },
    fiverr:     { label: 'Fiverr',        icon: 'fv', hosts: ['fiverr.com'],     hint: 'https://www.fiverr.com/your-name' },
    freelancer: { label: 'Freelancer.com',icon: 'fl', hosts: ['freelancer.com'], hint: 'https://www.freelancer.com/u/your-name' },
    phone:      { label: 'Phone number',  icon: 'ph',                             hint: '+63 905 291 2208' }
  };

  /* Returns { ok, href, external } or { ok:false, error }. Only validated values are ever turned into links. */
  function validate(type, raw) {
    const m = META[type], v = String(raw || '').trim();
    if (!m) return { ok: false, error: 'Unknown platform.' };
    if (!v) return { ok: false, empty: true, error: 'Add a link first.' };
    if (type === 'email') {
      return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(v)
        ? { ok: true, href: 'mailto:' + v, external: false } : { ok: false, error: 'Enter a valid email address.' };
    }
    if (type === 'phone') {
      const d = v.replace(/[^\d+]/g, '');
      return /^\+?\d{7,15}$/.test(d) ? { ok: true, href: 'tel:' + d, external: false }
        : { ok: false, error: 'Enter a valid phone number, for example +63 905 291 2208.' };
    }
    if (type === 'whatsapp') {
      try {
        const u = new URL(v);
        if (u.protocol === 'https:' && (u.hostname === 'wa.me' || u.hostname.endsWith('whatsapp.com'))) return { ok: true, href: u.href, external: true };
      } catch (e) { /* not a URL: treat as a phone number */ }
      const d = v.replace(/\D/g, '');
      return /^[+\d][\d\s()-]*$/.test(v) && d.length >= 7 && d.length <= 15
        ? { ok: true, href: 'https://wa.me/' + d, external: true }
        : { ok: false, error: 'Enter a phone number with country code, or a wa.me link.' };
    }
    let u;
    try { u = new URL(v); } catch (e) { return { ok: false, error: 'Enter a full link starting with https://' }; }
    if (u.protocol !== 'https:') return { ok: false, error: 'The link must start with https://' };
    const host = u.hostname.replace(/^www\./, '');
    if (!m.hosts.some(h => host === h || host.endsWith('.' + h))) return { ok: false, error: 'This link must be on ' + m.hosts[0] + '.' };
    return { ok: true, href: u.href, external: true };
  }

  /* Normalised list of all nine platforms from the owner's saved config (or the defaults). */
  function list() {
    const saved = window.__lastCfg && Array.isArray(window.__lastCfg.contacts) ? window.__lastCfg.contacts : null;
    const cfg = saved || (window.portfolioSettings && window.portfolioSettings.contacts) || [];
    return ORDER.map(type => {
      const c = cfg.find(x => x && x.type === type) || {};
      return { type, value: String(c.value || ''), enabled: c.enabled !== false };
    });
  }
  const visible = () => list().map(i => Object.assign({}, i, { v: validate(i.type, i.value) })).filter(i => i.enabled && i.v.ok);
  const get = type => { const i = visible().find(x => x.type === type); return i ? { value: i.value, href: i.v.href } : null; };

  function render() {
    const items = visible();
    document.querySelectorAll('ul[data-contacts]').forEach(ul => {
      ul.textContent = '';
      items.forEach(i => {
        const m = META[i.type], li = document.createElement('li'), a = document.createElement('a');
        a.href = i.v.href;
        a.title = m.label;
        a.setAttribute('aria-label', m.label + (i.v.external ? ' (opens in a new tab)' : ''));
        if (i.v.external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        a.innerHTML = '<svg aria-hidden="true"><use href="#' + m.icon + '"/></svg>';
        li.appendChild(a); ul.appendChild(li);
      });
      ul.hidden = !items.length;
    });
    const alt = document.getElementById('altMail'), em = get('email');
    if (alt) {
      alt.textContent = '';
      if (em) {
        const a = document.createElement('a');
        a.href = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(em.value) + '&su=Hiring%20inquiry';
        a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Compose in Gmail';
        alt.append('Prefer email? ', a, ' or write to ' + em.value);
      }
      alt.dataset.empty = em ? '' : '1';
    }
  }

  window.contactsApi = { ORDER, META, validate, list, get, render };
  render();
})();
