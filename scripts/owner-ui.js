/* ==========================================================================
   owner-ui.js - owner panel controls: hero image, live theme preview, accordion
   ========================================================================== */
{const g=i=>document.getElementById(i),hiI=g('heroImg');
window.hiPrev=()=>{const v={on:g('hiOn').checked,w:+g('hiW').value,x:+g('hiX').value,y:+g('hiY').value,o:+g('hiOp').value,f:g('hiFront').checked};
g('hiWv').textContent=v.w;g('hiXv').textContent=v.x;g('hiYv').textContent=v.y;g('hiOpv').textContent=v.o;
if(window.__heroImgData){if(hiI.getAttribute('src')!==window.__heroImgData)hiI.src=window.__heroImgData;hiI.hidden=!v.on;hiI.style.width=v.w+'%';hiI.style.left=v.x+'%';hiI.style.top=v.y+'%';hiI.style.opacity=v.o/100;hiI.classList.toggle('front',v.f)}else hiI.hidden=true};
['hiOn','hiW','hiX','hiY','hiOp','hiFront'].forEach(i=>g(i).addEventListener('input',window.hiPrev));
g('hiFile').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const u=URL.createObjectURL(f),im=new Image();
im.onload=()=>{let out='';for(const mw of [1200,1000,800,600,450]){const sc=Math.min(1,mw/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*sc));c.height=Math.max(1,Math.round(im.height*sc));c.getContext('2d').drawImage(im,0,0,c.width,c.height);out=c.toDataURL('image/webp',.85);if(out.length<=900000)break}
URL.revokeObjectURL(u);if(out.length>900000){alert('This image is too large. Please choose a smaller image.');return}
window.__heroImgData=out;g('hiOn').checked=true;window.hiPrev()};
im.onerror=()=>{URL.revokeObjectURL(u);alert('Could not read this image file.')};im.src=u})}
{const fxl=()=>[['fxReveal','reveal'],['fxLift','lift'],['fxGlow','glow'],['fxGlass','glass']].filter(x=>document.getElementById(x[0]).checked).map(x=>x[1]);
['thSel','fxReveal','fxLift','fxGlow','fxGlass'].forEach(i=>document.getElementById(i).addEventListener('change',()=>window.applyLook(document.getElementById('thSel').value,fxl(),true)))}
