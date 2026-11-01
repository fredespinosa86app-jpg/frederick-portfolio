/* ==========================================================================
   meeting-form.js - meeting request form and #schedule page routing
   ========================================================================== */
const mf=document.getElementById('mForm'),ORIG=document.title;
{const tz=Intl.DateTimeFormat().resolvedOptions().timeZone,t=new Date();if(tz)mf.elements.tz.value=tz;mf.elements.date.min=t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0')}
mf.addEventListener('submit',async e=>{e.preventDefault();const st=document.getElementById('mStatus'),b=document.getElementById('mBtn'),f=n=>mf.elements[n].value.trim();st.className='';st.textContent='';
if(f('website'))return;
const d={name:f('name'),email:f('email'),company:f('company'),date:f('date'),time:f('time'),tz:f('tz'),platform:f('platform'),message:f('message')};
if(!d.name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)||!d.date||!d.time||!d.tz||!d.message){st.className='err';st.textContent='Please complete all required fields with a valid email address.';return}
let last=0;try{last=+localStorage.getItem('lastReq')||0}catch(x){}
if(Date.now()-last<60000){st.className='err';st.textContent='Please wait a minute before sending another request.';return}
b.disabled=true;st.textContent='Sending\u2026';
try{if(!window.submitMeeting)throw 0;await Promise.race([window.submitMeeting(d),new Promise((_,j)=>setTimeout(j,15000))]);
try{localStorage.setItem('lastReq',Date.now())}catch(x){}
st.textContent='';mf.reset();mf.hidden=true;document.getElementById('mDone').hidden=false}
catch(x){st.className='err';st.textContent='Sorry, your request could not be sent.';const em=window.contactsApi&&window.contactsApi.get('email');if(em){const a=document.createElement('a');a.href=em.href+'?subject=Meeting%20request';a.textContent=em.value;st.append(' Please email ',a,' instead.')}}
b.disabled=false});
function route(){const s=location.hash==='#schedule';document.getElementById('page').hidden=s;document.getElementById('schedule').hidden=!s;
if(s){mf.hidden=false;document.getElementById('mDone').hidden=true;window.scrollTo(0,0);document.title='Schedule a Meeting \u00b7 Frederick Espinosa'}
else{document.title=ORIG;if(location.hash.length>1){const t=document.getElementById(location.hash.slice(1));if(t)t.scrollIntoView()}}}
addEventListener('hashchange',route);route();
