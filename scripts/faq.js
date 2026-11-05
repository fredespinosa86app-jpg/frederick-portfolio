/* ==========================================================================
   faq.js - public FAQ section, rendered from data (Firestore content/faq, owner dashboard "FAQ").
   Defaults are the original ten questions. Each item can belong to a training category
   (shown in that category's panel) and can be offered to the chatbot (owner opt-in only).
   ========================================================================== */
(function () {
  'use strict';
  const CACHE = 'faqCfg', MAX = 60;
  const DEFAULT_FAQ = [
  {
    "id": "f1",
    "q": "What is Amazon online arbitrage product research?",
    "a": "I look for products sold at lower prices on online retail stores than they sell for on Amazon, then check whether the resale price leaves a worthwhile profit. The goal is to give you a short list of vetted sourcing opportunities, backed by data, so you can buy with confidence.",
    "category": "",
    "kb": false,
    "enabled": true
  },
  {
    "id": "f2",
    "q": "Do you support FBA or FBM?",
    "a": "My hands-on training focused on FBA product research, and I only have theoretical knowledge of FBM. I would rather be upfront about that than promise something I haven’t practiced. If your business is FBA-focused, I’m a good fit. If you also run FBM, let’s talk about whether I can help with that part.",
    "category": "",
    "kb": false,
    "enabled": true
  },
  {
    "id": "f3",
    "q": "Do you research both US and UK Amazon marketplaces?",
    "a": "Yes. My training covered both, with separate sourcing criteria and a separate deal sheet for each marketplace.",
    "category": "",
    "kb": false,
    "enabled": true
  },
  {
    "id": "f4",
    "q": "Which tools do you use?",
    "a": "I use SellerAmp SAS for profit, ROI, sales estimates, and listing alerts. I use Keepa for price history and sales-rank trends. I use Coupert and Honey to look for coupons and cashback that can lower the buy cost. I also use Amazon for product sourcing and Amazon Seller Central to verify product eligibility.",
    "category": "",
    "kb": false,
    "enabled": true
  },
  {
    "id": "f5",
    "q": "What criteria do you use to qualify a product?",
    "a": "I follow your criteria. In my training, a lead had to meet a minimum profit (US$3 or £2) and a 20% ROI, have no more than 20 sellers and at least 30 estimated sales per month, and not be sold by Amazon itself. I also screen out hazmat, IP-risk, private-label, and dangerous-goods products. For the UK, gated brands were acceptable with one lead per brand.",
    "category": "",
    "kb": false,
    "enabled": true
  },
  {
    "id": "f6",
    "q": "Do you check whether a supplier is legitimate?",
    "a": "Yes. I review supplier websites and use AI tools such as ChatGPT and Claude to help assess their legitimacy and credibility before recommending them as a sourcing source.",
    "category": "",
    "kb": false,
    "enabled": true
  },
  {
    "id": "f7",
    "q": "How accurate are the profit and ROI numbers?",
    "a": "They are estimates based on the tools’ data, not guarantees. Final sourcing decisions should be confirmed against your own criteria and your account’s eligibility for each product.",
    "category": "",
    "kb": false,
    "enabled": true
  },
  {
    "id": "f8",
    "q": "What does a typical research deliverable include?",
    "a": "Each lead goes into an organized Google Sheet with the product title, supplier link, Amazon link, ASIN, BSR, buy and sell price, profit, ROI, estimated sales, notes, and screenshots, so you can verify every deal.",
    "category": "",
    "kb": false,
    "enabled": true
  },
  {
    "id": "f9",
    "q": "Can you follow my own sourcing criteria and sheet format?",
    "a": "Yes. Tell me your profit, ROI, sales, and brand rules, and whether you have a deal sheet template, and I will work in that format.",
    "category": "",
    "kb": false,
    "enabled": true
  },
  {
    "id": "f10",
    "q": "How do we communicate during a project?",
    "a": "I can work through Slack, Asana, Discord, or email, whichever you prefer, and I share a status update before you have to ask.",
    "category": "",
    "kb": false,
    "enabled": true
  }
];
  let items = DEFAULT_FAQ;

  const str = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '';
  const clean = list => (Array.isArray(list) ? list : []).slice(0, MAX).map(f => ({
    id: str(f && f.id, 40), q: str(f && f.q, 200), a: str(f && f.a, 1500), category: str(f && f.category, 20),
    kb: !!(f && f.kb === true), enabled: !f || f.enabled !== false
  })).filter(f => f.id && f.q && f.a);
  const node = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  /* One open item at a time. `open` = index open at the start (or null). */
  function build(container, list, prefix, open) {
    container.textContent = '';
    list.forEach((f, i) => {
      const item = node('div', 'faq-item'), h = node('h3', 'faq-h'), btn = node('button', 'faq-btn');
      const bid = prefix + '-b' + i, pid = prefix + '-p' + i;
      btn.type = 'button'; btn.id = bid; btn.setAttribute('aria-controls', pid); btn.setAttribute('aria-expanded', 'false');
      btn.appendChild(node('span', '', f.q)); h.appendChild(btn);
      const panel = node('div', 'faq-panel'), inner = node('div'); panel.id = pid; panel.setAttribute('role', 'region'); panel.setAttribute('aria-labelledby', bid);
      f.a.split(/\n{2,}/).forEach(p => inner.appendChild(node('p', '', p))); panel.appendChild(inner);
      item.append(h, panel); container.appendChild(item);
    });
    const els = [...container.querySelectorAll('.faq-item')];
    let active = open;
    const paint = () => els.forEach((it, i) => { const on = i === active; it.querySelector('.faq-btn').setAttribute('aria-expanded', String(on)); it.querySelector('.faq-panel').classList.toggle('open', on); });
    els.forEach((it, i) => {
      const b = it.querySelector('.faq-btn');
      b.addEventListener('click', () => { active = active === i ? null : i; paint(); });
      b.addEventListener('keydown', e => {
        const t = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: els.length - 1 }[e.key];
        if (t === undefined) return; e.preventDefault(); els[(t + els.length) % els.length].querySelector('.faq-btn').focus();
      });
    });
    paint();
  }

  function render(preview) {
    const sec = document.getElementById('faq'), box = document.getElementById('faqList');
    if (!sec || !box) return;
    const list = clean(items).filter(f => f.enabled);
    build(box, list, 'faq', list.length ? 0 : null);
    sec.hidden = !list.length;
    if (preview !== true) shareWithChat(list);   // a preview never changes what the chatbot knows
    document.dispatchEvent(new Event('content:applied'));
  }

  /* Rendered inside a training category panel (only that category's questions). */
  function renderInto(container, category, prefix) {
    const list = clean(items).filter(f => f.enabled && f.category === category);
    if (list.length) build(container, list, prefix, null); else container.textContent = '';
    return list.length;
  }

  /* ---- chatbot knowledge: only items the owner explicitly approved (kb === true) ---- */
  const STOP = new Set('what when where which while does your with that this have from about they them will would could should there their into than then also like just much many very more some such only over under between during before after being been were your yours mine ours'.split(' '));
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function shareWithChat(list) {
    window.__chatExtra = list.filter(f => f.kb).map(f => {
      const q = f.q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      const words = [...new Set(q.split(' ').filter(w => w.length >= 4 && !STOP.has(w)))].slice(0, 6);
      return { k: [q].concat(words), a: esc(f.a).replace(/\n/g, '<br>') };
    });
  }

  function cache() { try { localStorage.setItem(CACHE, JSON.stringify(items === DEFAULT_FAQ ? null : items)); } catch (e) { /* ignore */ } }
  window.faqApi = {
    get: () => clean(items), defaults: () => clean(DEFAULT_FAQ), MAX,
    set: list => { items = clean(list); cache(); render(); },
    render: () => render(), renderInto, build, clean,
    preview: l => { const keep = items; items = l; render(true); items = keep; }
  };
  try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c) items = clean(c); } catch (e) { /* ignore */ }
  render();
})();
