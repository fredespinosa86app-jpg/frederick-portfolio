/* ==========================================================================
   site-settings.js - applies owner settings (hero, fonts, testimonials, hero image) from Firestore or the local cache
   ========================================================================== */
window.applySite=d=>{window.__lastCfg=d;const $=id=>document.getElementById(id),h=document.querySelector('.hero'),t=h.querySelector('h1'),r=h.querySelector('.role'),p=h.querySelector('.intro');
const p2=h.querySelector('.intro2');
if(!window.DEFH)window.DEFH={t:t.textContent,r:r.textContent,p:p.textContent,p2:p2.textContent};const D=window.DEFH;
t.textContent=d.heroTitle||D.t;r.textContent=d.heroRole||D.r;p.textContent=d.heroText||D.p;
/* second text row: its own text; an older saved single text (heroText without heroText2) keeps showing exactly as saved */
const t2=d.heroText2?d.heroText2:(d.heroText?'':D.p2);p2.textContent=t2;p2.hidden=!t2;h.classList.toggle('imgleft',d.heroLayout==='image-left');
const hx=/^#[0-9a-f]{6}$/i,c1=hx.test(d.heroC1||'')?d.heroC1:'#070C18',c2=hx.test(d.heroC2||'')?d.heroC2:'#1b2a4e',g=!!d.heroGrad,ang=['45','90','135','180'].includes(String(d.heroAng))?String(d.heroAng):'135';
const cust=g||(hx.test(d.heroC1||'')&&d.heroC1.toLowerCase()!=='#070c18');window.__cust=cust;window.__heroBg=cust?(g?`linear-gradient(${ang}deg,${c1},${c2})`:c1):'';h.style.background=window.__heroBg;
const L=c=>{const n=parseInt(c.slice(1),16);return(0.2126*(n>>16&255)+0.7152*(n>>8&255)+0.0722*(n&255))/255};
window.__ltCust=(g?(L(c1)+L(c2))/2:L(c1))>0.6;if(cust)h.classList.toggle('lt',window.__ltCust);
window.applyLook(d.theme,d.fx);{const fxs=String(d.fx||'').split(',');$('thSel').value=window.OWNER_THEMES.includes(d.theme)?d.theme:'gold-silver';$('fxReveal').checked=fxs.includes('reveal');$('fxLift').checked=fxs.includes('lift');$('fxGlow').checked=fxs.includes('glow');$('fxGlass').checked=fxs.includes('glass')}
$('heroC1').value=c1;$('heroC2').value=c2;$('heroG').checked=g;$('heroAng').value=ang;$('heroH1').value=t.textContent;$('heroRole').value=r.textContent;$('heroTxt').value=p.textContent;$('heroTxt2').value=t2;$('heroLay').value=d.heroLayout==='image-left'?'image-left':'text-left';
if(window.testiApi)window.testiApi.setLegacy({enabled:d.testiEnabled===true,text:d.testiText||''});
const R=document.body.style,HF={fr:'Fraunces,Georgia,serif',pf:'"Playfair Display",Georgia,serif',lo:'Lora,Georgia,serif',po:'Poppins,system-ui,sans-serif',in:'Inter,system-ui,sans-serif'},BF={dm:'"DM Sans",system-ui,sans-serif',in:'Inter,system-ui,sans-serif',lo:'Lora,Georgia,serif',po:'Poppins,system-ui,sans-serif'};
const gh=HF[d.gHead]?d.gHead:'fr',gb=BF[d.gBody]?d.gBody:'dm',gs=['0.92','1','1.1','1.2'].includes(String(d.gSize))?String(d.gSize):'1',hc=hx.test(d.gHeadC||''),tc=hx.test(d.gTextC||'');
if(gh!=='fr')R.setProperty('--serif',HF[gh]);else R.removeProperty('--serif');if(gb!=='dm')R.setProperty('--sans',BF[gb]);else R.removeProperty('--sans');
if(hc)R.setProperty('--hc',d.gHeadC);else R.removeProperty('--hc');
if(tc){R.setProperty('--ink',d.gTextC);R.setProperty('--muted','color-mix(in srgb,'+d.gTextC+' 80%,#fff)')}else{R.removeProperty('--ink');R.removeProperty('--muted')}
if(gs==='1')R.removeProperty('--s');else R.setProperty('--s',gs);
$('gHead').value=gh;$('gBody').value=gb;$('gSize').value=gs;$('gCol').checked=hc||tc;$('gHeadC').value=hc?d.gHeadC:'#14213d';$('gTextC').value=tc?d.gTextC:'#2b3550';
{const hi=$('heroImg'),nm=(v,df,a,b)=>{v=Number(v);return Number.isFinite(v)?Math.min(b,Math.max(a,v)):df},img=typeof d.heroImg==='string'&&d.heroImg.startsWith('data:image/')?d.heroImg:'',on=!!d.heroImgOn&&!!img,w=nm(d.heroImgW,40,5,100),x=nm(d.heroImgX,80,0,100),y=nm(d.heroImgY,50,0,100),o=nm(d.heroImgOp,100,10,100);
window.__heroImgData=img;hi.hidden=!on;if(on){if(hi.getAttribute('src')!==img)hi.src=img;hi.style.width=w+'%';hi.style.left=x+'%';hi.style.top=y+'%';hi.style.opacity=o/100;hi.classList.toggle('front',!!d.heroImgFront)}
$('hiOn').checked=on;$('hiW').value=w;$('hiX').value=x;$('hiY').value=y;$('hiOp').value=o;$('hiFront').checked=!!d.heroImgFront;$('hiWv').textContent=w;$('hiXv').textContent=x;$('hiYv').textContent=y;$('hiOpv').textContent=o}
document.getElementById('schedule').classList.toggle('closed',d.hireEnabled===false);
if(window.introFrom)window.introFrom(d);
{const sc=d.sections&&typeof d.sections==='object'?d.sections:{};[['toolkit','toolkit'],['process','process']].forEach(([k,id])=>{const on=sc[k]!==false,s=$(id);if(s)s.hidden=!on;document.querySelectorAll('a[href="#'+id+'"]').forEach(a=>{const li=a.closest('li');if(li)li.hidden=!on});const cb=$('sec_'+k);if(cb)cb.checked=on})}
if(window.contactsApi)window.contactsApi.render();
if(window.seoApi)window.seoApi.apply(d.seo);
if(window.secBgApi)window.secBgApi.apply(d.secBg);
document.dispatchEvent(new Event('site:applied'));
try{localStorage.setItem('siteCfg',JSON.stringify(d))}catch(e){}};
try{const c=JSON.parse(localStorage.getItem('siteCfg')||'null');if(c)window.applySite(c)}catch(e){}
