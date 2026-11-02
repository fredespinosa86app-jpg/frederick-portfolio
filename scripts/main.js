/* ==========================================================================
   main.js - navigation menu and image lightbox (the FAQ accordion lives in faq.js)
   ========================================================================== */
const m=document.getElementById('menu'),n=document.getElementById('nav');
m.addEventListener('click',()=>{const o=n.classList.toggle('open');m.setAttribute('aria-expanded',o)});
n.addEventListener('click',e=>{if(e.target.tagName==='A'){n.classList.remove('open');m.setAttribute('aria-expanded',false)}});
const lb=document.getElementById('lb');
document.querySelectorAll('.zoom').forEach(b=>b.addEventListener('click',()=>{const i=b.querySelector('img'),d=lb.querySelector('img');d.src=i.src;d.alt=i.alt;lb.showModal()}));
document.getElementById('close').addEventListener('click',()=>lb.close());
lb.addEventListener('click',e=>{if(e.target===lb)lb.close()});
