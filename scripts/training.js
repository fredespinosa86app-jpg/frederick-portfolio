/* ==========================================================================
   training.js - public Training section: seven categories in a compact grid, one open at a time.
   Each category holds its own Overview, Hands-on Training, Tools Used, Toolkit, How I Work,
   plus the videos and FAQs the owner assigned to it (videos.js, faq.js).
   Data: Firestore content/training { items[] }, managed in the owner dashboard (Training).
   The static markup inside #tcatGrid is a no-JavaScript fallback that this script replaces.
   ========================================================================== */
(function () {
  'use strict';
  const CACHE = 'trainCfg', MAX = 7;
  const DEFAULT_TRAINING = [
  {
    "id": "tr1",
    "title": "Amazon Product Research for Online Arbitrage Business",
    "enabled": true,
    "summary": "Hands-on product research training with the tools and criteria I use on every lead.",
    "overview": "Practical experience matters. Explore my annotated training materials and hands-on exercises that demonstrate my familiarity with Amazon product research, sourcing analysis, and the tools used to evaluate potential product opportunities.",
    "handsOn": {
      "text": "What the training materials show:\n- Certificate of completion for a 6-week Online Arbitrage VA training\n- US and UK sourcing criteria\n- Good lead checklist\n- Completed US and UK deal sheets\n- US and UK brand leads sheet (Toys & Games)\n- Feedback from my training coach",
      "image": {
        "src": "assets/images/projects/hands-on-training.webp",
        "alt": "Annotated training summary: certificate of completion from The Ultimate VA for Online Arbitrage, US and UK sourcing criteria, good lead checklist, US and UK deal sheets, US and UK brand leads sheet, and coach feedback"
      }
    },
    "tools": [
      {
        "id": "tl1",
        "name": "SellerAmp SAS",
        "purpose": "",
        "description": "Used to check estimated profit, ROI, sales volume, seller count, and listing alerts such as dangerous goods, private label, IP concerns, and whether Amazon is on the listing.",
        "tags": "Profit & ROI, Est. sales, Max cost, Eligibility alerts",
        "note": "",
        "images": [
          {
            "src": "assets/images/tools/selleramp-search-results.webp",
            "alt": "SellerAmp SAS search results showing BSR, estimated sales, max cost, offers, and Keepa charts for several products"
          },
          {
            "src": "assets/images/tools/selleramp-product-panel.webp",
            "alt": "SellerAmp SAS side panel showing eligibility, alerts, BSR, estimated sales, max cost, profit, and ROI for a hair lightener product"
          }
        ]
      },
      {
        "id": "tl2",
        "name": "Keepa",
        "purpose": "",
        "description": "Used to review price history, sales rank trends, and whether Amazon itself is selling the product, all directly on the Amazon product page.",
        "tags": "Price history, Sales rank, Buy Box trends",
        "note": "",
        "images": [
          {
            "src": "assets/images/tools/keepa-price-history.webp",
            "alt": "Keepa price history and offer count charts for an Amazon product over the last 3 months"
          }
        ]
      },
      {
        "id": "tl3",
        "name": "Amazon",
        "purpose": "Primary Product Sourcing Platform",
        "description": "Amazon is one of my primary tools for product sourcing and product research. I use the Amazon marketplace to identify potential profitable products through different sourcing strategies, particularly:\n\n- **Brand Sourcing:** Researching products from established brands and identifying potential profitable opportunities.\n- **Reverse Sourcing:** Starting with potential products or sellers on Amazon and tracing them back to their suppliers or sourcing websites.\n\nThe Amazon marketplace helps me identify potential products for further evaluation using product research tools such as SellerAmp and Keepa.",
        "tags": "Brand sourcing, Reverse sourcing",
        "note": "",
        "images": [
          {
            "src": "assets/images/tools/amazon-homepage.webp",
            "alt": "Amazon.co.uk homepage with deals and product categories used for product sourcing"
          }
        ]
      },
      {
        "id": "tl4",
        "name": "Amazon Seller Central",
        "purpose": "Seller Account and Product Eligibility Verification",
        "description": "I use Amazon Seller Central to verify product availability and eligibility within the client's seller account. My primary uses include:\n\n- Checking whether a researched product is already being sold by the client.\n- Verifying whether a product is eligible for selling in the client's Amazon seller account.\n- Checking gated products that may have potential profitability.\n- Reviewing Amazon's specific ungating requirements to determine what documentation or purchasing requirements are needed to request approval.\n\nSeller Central helps ensure that product research aligns with the client's existing inventory, account eligibility, and selling requirements.",
        "tags": "Eligibility check, Gated products, Ungating requirements",
        "note": "Seller Central does not automatically ungate products or guarantee approval. Amazon determines the actual eligibility and approval requirements.",
        "images": [
          {
            "src": "assets/images/tools/seller-central-add-products.webp",
            "alt": "Amazon Seller Central Add Products page searching the catalog by product ID"
          }
        ]
      },
      {
        "id": "tl5",
        "name": "Coupert & Honey",
        "purpose": "",
        "description": "Used to look for coupon codes and cashback that can lower the buy cost on a sourcing lead, which can improve the estimated ROI.",
        "tags": "Coupons, Cashback, Lower buy cost",
        "note": "",
        "images": [
          {
            "src": "assets/images/tools/coupert-extension.webp",
            "alt": "Coupert browser extension showing a confirmed coupon with savings"
          },
          {
            "src": "assets/images/tools/honey-extension.webp",
            "alt": "Honey browser extension showing a rewards rate and coupon codes tried at checkout"
          }
        ]
      }
    ],
    "toolkit": "SellerAmp SAS, Keepa, Amazon Seller Central, Chrome Research Extensions",
    "howIWork": "Every claim gets a source. | Prices, links, and ASINs come with the page they were taken from, so any figure can be checked.\nDeliverables you can audit. | Every lead goes into a deal sheet with the numbers, notes, and screenshots behind it.\nStatus before you ask. | Clear updates on what is done, what is in progress, and what is blocked."
  },
  {
    "id": "tr2",
    "title": "Amazon Product Research",
    "enabled": true,
    "summary": "Screening leads against clear profit, ROI, competition and eligibility rules.",
    "overview": "Screening each lead against clear rules: minimum profit and ROI, maximum number of sellers, estimated monthly sales, and eligibility checks for hazmat, IP, private label, and dangerous goods.",
    "handsOn": {
      "text": "",
      "image": null
    },
    "tools": [],
    "toolkit": "SellerAmp SAS, Keepa, Amazon Seller Central",
    "howIWork": ""
  },
  {
    "id": "tr3",
    "title": "Product Sourcing",
    "enabled": true,
    "summary": "Finding discounted products and suppliers that meet a client’s profit and ROI requirements.",
    "overview": "I research online retail stores and suppliers to find products offered at discounted prices or lower costs than their current selling prices on Amazon. I compare product prices to identify potential sourcing opportunities that meet the client's profit and ROI requirements. I also use AI platforms such as ChatGPT and Claude to help assess the legitimacy and credibility of supplier websites before recommending them as potential sourcing sources.",
    "handsOn": {
      "text": "",
      "image": null
    },
    "tools": [],
    "toolkit": "",
    "howIWork": ""
  },
  {
    "id": "tr4",
    "title": "Product Listing",
    "enabled": false,
    "summary": "",
    "overview": "",
    "handsOn": {
      "text": "",
      "image": null
    },
    "tools": [],
    "toolkit": "",
    "howIWork": ""
  },
  {
    "id": "tr5",
    "title": "Inventory Management",
    "enabled": false,
    "summary": "",
    "overview": "",
    "handsOn": {
      "text": "",
      "image": null
    },
    "tools": [],
    "toolkit": "",
    "howIWork": ""
  },
  {
    "id": "tr6",
    "title": "PPC (Pay-Per-Click)",
    "enabled": false,
    "summary": "",
    "overview": "",
    "handsOn": {
      "text": "",
      "image": null
    },
    "tools": [],
    "toolkit": "",
    "howIWork": ""
  },
  {
    "id": "tr7",
    "title": "AI Automation Specialist",
    "enabled": true,
    "summary": "Using AI tools and automation platforms to reduce repetitive research and admin work.",
    "overview": "Using tools such as ChatGPT, Claude, Zapier, Make, and n8n to reduce repetitive manual work in research and admin tasks.",
    "handsOn": {
      "text": "",
      "image": null
    },
    "tools": [],
    "toolkit": "Zapier, Make, n8n, GoHighLevel, ChatGPT, Claude",
    "howIWork": ""
  }
];
  let items = DEFAULT_TRAINING, openId = null;

  const str = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '';
  /* images: a project file under assets/images/ (defaults) or a small data URL uploaded from the dashboard */
  const src = v => typeof v === 'string' && v.length <= 140000 && (/^assets\/images\/[\w\-\/]+\.(webp|png|jpe?g)$/.test(v) || /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v)) ? v : '';
  const pic = p => { const s = src(p && p.src); return s ? { src: s, alt: str(p && p.alt, 200) } : null; };
  const cleanTool = t => ({ id: str(t && t.id, 40), name: str(t && t.name, 60), purpose: str(t && t.purpose, 100), description: str(t && t.description, 1500),
    tags: str(t && t.tags, 200), note: str(t && t.note, 300), images: (Array.isArray(t && t.images) ? t.images : []).map(pic).filter(Boolean).slice(0, 2) });
  const clean = list => (Array.isArray(list) ? list : []).slice(0, MAX).map(t => ({
    id: str(t && t.id, 20), title: str(t && t.title, 80), summary: str(t && t.summary, 160), enabled: !!t && t.enabled !== false,
    overview: str(t && t.overview, 2500), handsOn: { text: str(t && t.handsOn && t.handsOn.text, 2500), image: pic(t && t.handsOn && t.handsOn.image) },
    tools: (Array.isArray(t && t.tools) ? t.tools : []).slice(0, 12).map(cleanTool).filter(x => x.id && x.name),
    toolkit: str(t && t.toolkit, 400), howIWork: str(t && t.howIWork, 1500)
  })).filter(t => t.id && t.title);

  const node = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const inline = (parent, text) => text.split(/(\*\*[^*]+\*\*)/).forEach(s => { if (/^\*\*[^*]+\*\*$/.test(s)) parent.appendChild(node('strong', '', s.slice(2, -2))); else if (s) parent.append(s); });
  /* Plain text -> paragraphs; lines starting with "- " become bullet lists; **bold** is supported. */
  function rich(text) {
    const out = document.createDocumentFragment(); let ul = null;
    text.split('\n').forEach(line => {
      const l = line.trim();
      if (!l) { ul = null; return; }
      if (/^- /.test(l)) { if (!ul) { ul = node('ul', 'points'); out.appendChild(ul); } const li = node('li'); inline(li, l.slice(2)); ul.appendChild(li); return; }
      ul = null; const p = node('p'); inline(p, l); out.appendChild(p);
    });
    return out;
  }
  const list = s => s.split(',').map(x => x.trim()).filter(Boolean);

  function block(panel, title, build) {
    const body = node('div', 'tblock-b'); const has = build(body);
    if (!has) return;
    const b = node('section', 'tblock'); b.appendChild(node('h4', '', title)); b.appendChild(body); panel.appendChild(b);
  }

  function toolCard(t, last, odd) {
    const a = node('article', 'tool-card ' + (odd && last ? 'full' : 'wide'));
    if (t.images.length) {
      const m = node('div', 'tmedia' + (t.images.length > 1 ? ' two' : ''));
      t.images.forEach(im => {
        const b = node('button', 'zoom'); b.type = 'button'; b.setAttribute('aria-label', 'Enlarge: ' + (im.alt || t.name));
        const i = node('img'); i.src = im.src; i.alt = im.alt || t.name + ' screenshot'; i.loading = 'lazy'; i.decoding = 'async'; b.appendChild(i); m.appendChild(b);
      });
      a.appendChild(m);
    }
    const body = node('div', 'tbody'); body.appendChild(node('h5', '', t.name));
    if (t.purpose) body.appendChild(node('p', 'purpose', t.purpose));
    body.appendChild(rich(t.description));
    if (t.note) body.appendChild(node('p', 'fineprint', t.note));
    const tags = list(t.tags); if (tags.length) { const u = node('ul', 'tags'); tags.forEach(x => u.appendChild(node('li', '', x))); body.appendChild(u); }
    a.appendChild(body); return a;
  }

  function panelFor(t) {
    const p = node('div', 'tpanel'); p.id = 'tp-' + t.id; p.setAttribute('role', 'region'); p.setAttribute('aria-labelledby', 'tb-' + t.id);
    block(p, 'Overview', b => { if (!t.overview) return false; b.appendChild(rich(t.overview)); return true; });
    block(p, 'Hands-on Training', b => {
      if (!t.handsOn.text && !t.handsOn.image) return false;
      b.classList.add('thands');
      const im = t.handsOn.image;
      if (im) { const f = node('figure', 'frame'), z = node('button', 'zoom'); z.type = 'button'; z.setAttribute('aria-label', 'Enlarge: ' + (im.alt || t.title));
        const i = node('img'); i.src = im.src; i.alt = im.alt || t.title + ' hands-on training'; i.loading = 'lazy'; i.decoding = 'async'; z.appendChild(i); f.append(z, node('small', '', 'Select the image to enlarge it.')); b.appendChild(f); }
      if (t.handsOn.text) { const d = node('div', 'side'); d.appendChild(rich(t.handsOn.text)); b.appendChild(d); } else b.classList.add('solo');
      return true; });
    block(p, 'Tools Used', b => { if (!t.tools.length) return false; b.classList.add('tools-grid'); t.tools.forEach((x, i) => b.appendChild(toolCard(x, i === t.tools.length - 1, t.tools.length % 2 === 1 && t.tools.length > 1))); return true; });
    block(p, 'Toolkit', b => { const l = list(t.toolkit); if (!l.length) return false; b.classList.add('badges'); l.forEach(x => b.appendChild(node('span', '', x))); return true; });
    block(p, 'How I Work', b => {
      const steps = t.howIWork.split('\n').map(s => s.trim()).filter(Boolean);
      if (steps.length) { const ol = node('ol', 'tsteps'); steps.forEach(s => { const [h, ...r] = s.split('|'); const li = node('li'); li.appendChild(node('strong', '', h.trim())); if (r.join('|').trim()) li.appendChild(node('span', '', r.join('|').trim())); ol.appendChild(li); }); b.appendChild(ol); }
      const v = node('div'); const n = window.videosApi ? window.videosApi.renderInto(v, t.id) : 0; if (n) b.appendChild(v);
      return steps.length > 0 || n > 0; });
    block(p, 'Frequently Asked Questions', b => { const f = node('div', 'faq'); const n = window.faqApi ? window.faqApi.renderInto(f, t.id, 'tf-' + t.id) : 0; if (!n) return false; b.appendChild(f); return true; });
    if (!p.children.length) p.appendChild(node('p', 'tempty', 'More details about this training are coming soon.'));
    return p;
  }

  function render() {
    const sec = document.getElementById('training'), box = document.getElementById('tcatGrid');
    if (!sec || !box) return;
    const cats = clean(items).filter(t => t.enabled);
    if (!cats.some(t => t.id === openId)) openId = null;
    box.textContent = ''; box.className = 'tcat-grid';
    cats.forEach(t => {
      const open = t.id === openId, card = node('article', 'tcat' + (open ? ' open' : '')), h = node('h3', 'tcat-h'), btn = node('button', 'tcat-btn');
      btn.type = 'button'; btn.id = 'tb-' + t.id; btn.setAttribute('aria-expanded', String(open)); btn.setAttribute('aria-controls', 'tp-' + t.id);
      btn.append(node('span', 'tcat-title', t.title), node('span', 'tcat-sum', t.summary || (t.overview.length > 120 ? t.overview.slice(0, 117).trimEnd() + '…' : t.overview)), node('span', 'tcat-more', open ? 'Show less' : 'View details'));
      h.appendChild(btn); card.appendChild(h);
      const p = panelFor(t); p.hidden = !open; card.appendChild(p);
      btn.addEventListener('click', () => {
        openId = openId === t.id ? null : t.id;   // only one category open at a time
        render();
        if (openId) { const c = document.getElementById('tb-' + openId); if (c) { const r = c.getBoundingClientRect(); if (r.top < 0 || r.top > innerHeight * 0.6) c.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' }); c.focus({ preventScroll: true }); } }
      });
      box.appendChild(card);
    });
    sec.hidden = !cats.length;
  }
  /* lightbox for images created here */
  document.addEventListener('click', e => {
    const z = e.target.closest && e.target.closest('#tcatGrid .zoom'); if (!z) return;
    const i = z.querySelector('img'), lb = document.getElementById('lb'); if (!i || !lb) return;
    const d = lb.querySelector('img'); d.src = i.src; d.alt = i.alt; lb.showModal();
  });
  /* the panels embed videos and FAQs, so refresh when those change */
  let t0 = 0; document.addEventListener('content:applied', () => { clearTimeout(t0); t0 = setTimeout(() => { if (!window.__trainBusy) { window.__trainBusy = true; render(); window.__trainBusy = false; } }, 0); });

  function cache() { try { localStorage.setItem(CACHE, JSON.stringify(items === DEFAULT_TRAINING ? null : items)); } catch (e) { /* ignore */ } }
  window.trainingApi = {
    get: () => clean(items), defaults: () => clean(DEFAULT_TRAINING), clean, MAX,
    set: l => { items = clean(l); cache(); render(); },
    preview: l => { const keep = items; items = l; render(); items = keep; }, render
  };
  try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c) items = clean(c); } catch (e) { /* ignore */ }
  render();
})();
