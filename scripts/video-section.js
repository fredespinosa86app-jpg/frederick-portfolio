/* ==========================================================================
   video-section.js - intro video (owner panel) and thank-you video (settings.js)
   ========================================================================== */
window.DEF_INTRO='https://youtube.com/shorts/UQdxTauYeIE';
window.parseVideo=u=>{try{const x=new URL(String(u).trim()),h=x.hostname.replace(/^www\./,''),sg=x.pathname.split('/').filter(Boolean),yt=i=>/^[\w-]{11}$/.test(i||'')?`https://www.youtube-nocookie.com/embed/${i}`:null;
if(h==='youtu.be'&&yt(sg[0]))return{src:yt(sg[0]),v:false};
if(h==='youtube.com'||h==='m.youtube.com'){if(sg[0]==='shorts'&&yt(sg[1]))return{src:yt(sg[1]),v:true};
const id=sg[0]==='watch'?x.searchParams.get('v'):(sg[0]==='embed'||sg[0]==='live')?sg[1]:null;if(yt(id))return{src:yt(id),v:false}}
if((h==='loom.com'||h.endsWith('.loom.com'))&&(sg[0]==='share'||sg[0]==='embed')&&/^[a-f0-9]{32}$/i.test(sg[1]||''))return{src:`https://www.loom.com/embed/${sg[1]}`,v:false}}catch(e){}return null};
window.setIntro=(u,on)=>{window.__introSet=true;const s=document.getElementById('intro'),f=document.getElementById('introFrame'),b=document.getElementById('introBox'),p=on&&u?window.parseVideo(u):null;
if(!p){s.hidden=true;f.removeAttribute('src');return}
b.classList.toggle('v',p.v);if(f.getAttribute('src')!==p.src)f.src=p.src;s.hidden=false};
/* No timer fallback: the video shows only once saved settings (cache or database) say so, so a saved Off or removed link never flashes the default video. */
window.introFrom=d=>{d=d||{};window.setIntro(typeof d.introUrl==='string'?d.introUrl:window.DEF_INTRO,d.introEnabled!==false)};
if(window.__lastCfg)window.introFrom(window.__lastCfg);

/* ---- "A Quick Message Before You Go" video (configured in scripts/settings.js) ---- */
(function () {
  'use strict';
  const cfg = window.portfolioSettings || {};
  const section = document.getElementById('thank-you');
  const frame = document.getElementById('thankYouFrame');
  if (!section || !frame) return;

  const video = cfg.showThankYouVideo && cfg.thankYouVideoUrl ? window.parseVideo(cfg.thankYouVideoUrl) : null;
  if (!video) { section.hidden = true; return; }   // disabled or no valid link: hide completely

  section.hidden = false;
  const load = () => { if (!frame.getAttribute('src')) frame.src = video.src; };   // never autoplays
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { load(); io.disconnect(); }
    }, { rootMargin: '400px 0px' });
    io.observe(section);
  } else { load(); }
})();
