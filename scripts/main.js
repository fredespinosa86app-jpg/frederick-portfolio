/* ==========================================================================
   main.js - navigation menu and image lightbox
   ========================================================================== */
const m=document.getElementById('menu'),n=document.getElementById('nav');
m.addEventListener('click',()=>{const o=n.classList.toggle('open');m.setAttribute('aria-expanded',o)});
n.addEventListener('click',e=>{if(e.target.tagName==='A'){n.classList.remove('open');m.setAttribute('aria-expanded',false)}});
const lb=document.getElementById('lb');
document.querySelectorAll('.zoom').forEach(b=>b.addEventListener('click',()=>{const i=b.querySelector('img'),d=lb.querySelector('img');d.src=i.src;d.alt=i.alt;lb.showModal()}));
document.getElementById('close').addEventListener('click',()=>lb.close());
lb.addEventListener('click',e=>{if(e.target===lb)lb.close()});

/* ---- FAQ accordion: one centralised state (index of the open item, or null) ---- */
(function () {
  'use strict';
  const items = [...document.querySelectorAll('.faq-item')];
  if (!items.length) return;
  let active = 0;
  const render = () => items.forEach((item, i) => {
    const open = i === active;
    item.querySelector('.faq-btn').setAttribute('aria-expanded', String(open));
    item.querySelector('.faq-panel').classList.toggle('open', open);
  });
  items.forEach((item, i) => {
    const btn = item.querySelector('.faq-btn');
    btn.addEventListener('click', () => { active = active === i ? null : i; render(); });
    btn.addEventListener('keydown', e => {
      const target = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
      if (target === undefined) return;
      e.preventDefault();
      items[(target + items.length) % items.length].querySelector('.faq-btn').focus();
    });
  });
  render();
})();
