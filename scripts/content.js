/* ==========================================================================
   content.js - public Services and Toolkit sections rendered from data.
   The defaults below are the original content. When the owner publishes changes in the dashboard,
   Firestore (content/services, content/toolkit) overrides them; a local cache avoids a flash on reload.
   ========================================================================== */
(function () {
  'use strict';
  const DEFAULT_SERVICES = [
  {
    "id": "s1",
    "title": "Online Arbitrage Research",
    "description": "Finding Amazon listings that can be sourced from online retailers at a profit, checked against each client’s criteria before anything is passed along.",
    "image": "",
    "enabled": true
  },
  {
    "id": "s2",
    "title": "Supplier & Sourcing Research",
    "description": "I research online retail stores and suppliers to find products offered at discounted prices or lower costs than their current selling prices on Amazon. I compare product prices to identify potential sourcing opportunities that meet the client's profit and ROI requirements. I also use AI platforms such as ChatGPT and Claude to help assess the legitimacy and credibility of supplier websites before recommending them as potential sourcing sources.",
    "image": "",
    "enabled": true
  },
  {
    "id": "s3",
    "title": "Keepa & Sales-Rank Analysis",
    "description": "Reading price history, sales rank trends, and seller competition in Keepa to judge whether a product sells steadily enough to be worth sourcing.",
    "image": "",
    "enabled": true
  },
  {
    "id": "s4",
    "title": "Deal Evaluation & Sourcing Criteria",
    "description": "Screening each lead against clear rules: minimum profit and ROI, maximum number of sellers, estimated monthly sales, and eligibility checks for hazmat, IP, private label, and dangerous goods.",
    "image": "",
    "enabled": true
  },
  {
    "id": "s5",
    "title": "Deal Sheets & Documentation",
    "description": "Logging every lead in organized Google Sheets with links, prices, ROI, estimated sales, notes, and screenshots, so each deal can be reviewed and verified.",
    "image": "",
    "enabled": true
  },
  {
    "id": "s6",
    "title": "AI Workflow Automation",
    "description": "Using tools such as ChatGPT, Claude, Zapier, Make, and n8n to reduce repetitive manual work in research and admin tasks.",
    "image": "",
    "enabled": true
  },
  {
    "id": "s7",
    "title": "Customer Service",
    "description": "More than 10 years of BPO industry experience providing customer support through phone and chat channels. This includes 5 years and 6 months of Spanish bilingual experience, supporting customers across various industries, including telecommunications, financial services, and healthcare.",
    "image": "",
    "enabled": true
  }
];
  const DEFAULT_TOOLKIT = [
  {
    "id": "c1",
    "name": "Amazon Research Stack",
    "tools": [
      {
        "id": "t1_1",
        "name": "SellerAmp SAS",
        "description": "",
        "logo": "",
        "enabled": true
      },
      {
        "id": "t1_2",
        "name": "Keepa",
        "description": "",
        "logo": "",
        "enabled": true
      },
      {
        "id": "t1_3",
        "name": "Amazon Seller Central",
        "description": "",
        "logo": "",
        "enabled": true
      },
      {
        "id": "t1_4",
        "name": "Chrome Research Extensions",
        "description": "",
        "logo": "",
        "enabled": true
      }
    ]
  },
  {
    "id": "c2",
    "name": "Data & Office",
    "tools": [
      {
        "id": "t2_1",
        "name": "MS Office",
        "description": "",
        "logo": "",
        "enabled": true
      },
      {
        "id": "t2_2",
        "name": "Google Sheets",
        "description": "",
        "logo": "",
        "enabled": true
      },
      {
        "id": "t2_3",
        "name": "Google Workspace",
        "description": "",
        "logo": "",
        "enabled": true
      }
    ]
  },
  {
    "id": "c3",
    "name": "Automation & AI",
    "tools": [
      {
        "id": "t3_1",
        "name": "Zapier",
        "description": "",
        "logo": "",
        "enabled": true
      },
      {
        "id": "t3_2",
        "name": "Make",
        "description": "",
        "logo": "",
        "enabled": true
      },
      {
        "id": "t3_3",
        "name": "n8n",
        "description": "",
        "logo": "",
        "enabled": true
      },
      {
        "id": "t3_4",
        "name": "GoHighLevel",
        "description": "",
        "logo": "",
        "enabled": true
      },
      {
        "id": "t3_5",
        "name": "ChatGPT",
        "description": "",
        "logo": "",
        "enabled": true
      },
      {
        "id": "t3_6",
        "name": "Claude",
        "description": "",
        "logo": "",
        "enabled": true
      }
    ]
  },
  {
    "id": "c4",
    "name": "Internal Communication & Project Management",
    "tools": [
      {
        "id": "t4_1",
        "name": "Slack",
        "description": "",
        "logo": "",
        "enabled": true
      },
      {
        "id": "t4_2",
        "name": "Asana",
        "description": "",
        "logo": "",
        "enabled": true
      },
      {
        "id": "t4_3",
        "name": "Discord",
        "description": "",
        "logo": "",
        "enabled": true
      }
    ]
  },
  {
    "id": "c5",
    "name": "Web Fundamentals",
    "tools": [
      {
        "id": "t5_1",
        "name": "HTML",
        "description": "",
        "logo": "",
        "enabled": true
      },
      {
        "id": "t5_2",
        "name": "CSS",
        "description": "",
        "logo": "",
        "enabled": true
      },
      {
        "id": "t5_3",
        "name": "JavaScript",
        "description": "",
        "logo": "",
        "enabled": true
      },
      {
        "id": "t5_4",
        "name": "React.js",
        "description": "",
        "logo": "",
        "enabled": true
      }
    ]
  }
];
  const CACHE = 'contentCfg';
  let services = DEFAULT_SERVICES, toolkit = DEFAULT_TOOLKIT;

  /* ---- sanitising: everything that reaches the page is re-validated here ---- */
  const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
  const img = v => typeof v === 'string' && v.length <= 90000 && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : '';
  const cleanServices = list => (Array.isArray(list) ? list : []).map(s => ({
    id: str(s && s.id, 40), title: str(s && s.title, 80), description: str(s && s.description, 700), image: img(s && s.image), enabled: !s || s.enabled !== false
  })).filter(s => s.id && s.title && s.description);
  const cleanToolkit = list => (Array.isArray(list) ? list : []).map(c => ({
    id: str(c && c.id, 40), name: str(c && c.name, 40),
    tools: (Array.isArray(c && c.tools) ? c.tools : []).map(t => ({
      id: str(t && t.id, 40), name: str(t && t.name, 40), description: str(t && t.description, 200), logo: img(t && t.logo), enabled: !t || t.enabled !== false
    })).filter(t => t.id && t.name)
  })).filter(c => c.id && c.name);

  const node = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function renderServices(list) {
    const sec = document.getElementById('services'), box = sec && sec.querySelector('.svc');
    if (!box) return;
    const items = cleanServices(list).filter(s => s.enabled);
    box.textContent = '';
    items.forEach(s => {
      const row = node('div', 'row'), h3 = node('h3');
      if (s.image) { const i = node('img', 'svc-ico'); i.src = s.image; i.alt = ''; i.width = 32; i.height = 32; h3.appendChild(i); }
      h3.append(s.title); row.append(h3, node('p', '', s.description)); box.appendChild(row);
    });
    sec.hidden = !items.length;
    document.dispatchEvent(new Event('content:applied'));
  }

  function renderToolkit(data) {
    const sec = document.getElementById('toolkit'), box = sec && sec.querySelector('.kit');
    if (!box) return;
    box.textContent = '';
    let shown = 0;
    cleanToolkit(data).forEach(c => {
      const tools = c.tools.filter(t => t.enabled);
      if (!tools.length) return;
      shown++;
      const row = node('div', 'row'), badges = node('div', 'badges');
      tools.forEach(t => {
        const b = node('span');
        if (t.logo) { const i = node('img', 'tool-ico'); i.src = t.logo; i.alt = ''; i.width = 18; i.height = 18; b.appendChild(i); }
        b.append(t.name); if (t.description) b.title = t.description; badges.appendChild(b);
      });
      row.append(node('h3', '', c.name), badges); box.appendChild(row);
    });
    sec.hidden = !shown;
    document.dispatchEvent(new Event('content:applied'));
  }

  function cache() { try { localStorage.setItem(CACHE, JSON.stringify({ s: services === DEFAULT_SERVICES ? null : services, t: toolkit === DEFAULT_TOOLKIT ? null : toolkit })); } catch (e) { /* ignore */ } }

  window.contentApi = {
    getServices: () => cleanServices(services), getToolkit: () => cleanToolkit(toolkit),
    renderServices, renderToolkit,
    setServices: list => { services = cleanServices(list); cache(); renderServices(services); },
    setToolkit: list => { toolkit = cleanToolkit(list); cache(); renderToolkit(toolkit); }
  };

  try {
    const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
    if (c && c.s) services = cleanServices(c.s);
    if (c && c.t) toolkit = cleanToolkit(c.t);
  } catch (e) { /* ignore */ }
  renderServices(services); renderToolkit(toolkit);
})();
