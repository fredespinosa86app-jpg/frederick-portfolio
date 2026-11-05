/* ==========================================================================
   meeting-form.js - meeting request form and #schedule page routing
   The date and time are picked from the owner's availability (availability.js):
   unavailable days, blocked dates, past times and confirmed meetings cannot be chosen.
   Times are shown in the owner's time zone (default Asia/Manila) and, when different, in the visitor's own.
   A request is still only a request: the owner approves it from the inbox.
   ========================================================================== */
const mf=document.getElementById('mForm'),ORIG=document.title;
const VTZ=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){return''}})();
const pick=(()=>{
const A=window.availApi,cal=document.getElementById('mCal'),slotsBox=document.getElementById('mSlots'),info=document.getElementById('mPicked'),tzl=document.getElementById('mTz');
const HORIZON=90,MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
let sel='',selTime='',view='';   // view = first day of the month on screen (YYYY-MM-01)
const node=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const lastDay=()=>A.addDays(A.today(A.cfg().tz),HORIZON);
const dayInfo=d=>{const c=A.cfg(),t=A.today(c.tz);
if(d<t)return{ok:false,why:'in the past'};if(d>lastDay())return{ok:false,why:'too far ahead'};
if(!c.days.includes(A.dowOf(d)))return{ok:false,why:'not an available day'};
if(A.isBlocked(d))return{ok:false,why:A.blockLabel(d)||'unavailable'};
if(d===t&&!c.sameDay)return{ok:false,why:'same-day meetings are not available'};
if(!A.daySlots(d).some(s=>s.state==='free'))return{ok:false,why:d===t?'too late for same-day booking':'fully booked or past'};return{ok:true}};
const local=ms=>{if(!VTZ||VTZ===A.cfg().tz)return'';try{return new Intl.DateTimeFormat([],{timeZone:VTZ,hour:'numeric',minute:'2-digit',weekday:'short'}).format(new Date(ms))}catch(e){return''}};
function set(date,time){sel=date;selTime=time;mf.elements.date.value=date;mf.elements.time.value=time;mf.elements.tz.value=A.cfg().tz;
if(date&&time){const s=A.daySlots(date).find(x=>x.time===time);const l=s&&local(s.ms);info.textContent='Selected: '+date+' at '+A.t12(time)+' '+A.tzName(A.cfg().tz)+(l?' (your time: '+l+')':'')+'.'}
else info.textContent=date?'Now choose a time.':'Select an available date, then a time.'}
function drawSlots(){slotsBox.textContent='';if(!sel)return;const c=A.cfg();
A.daySlots(sel).filter(s=>s.state!=='past').forEach(s=>{const b=node('button','slot');b.type='button';b.disabled=s.state!=='free';if(s.state==='notice'){b.title='Too soon: same-day meetings need '+c.sameDayHours+' hours notice';b.appendChild(node('span','st',A.t12(s.time)));b.appendChild(node('small','','Too soon'));slotsBox.appendChild(b);return}b.setAttribute('aria-pressed',String(s.time===selTime));
b.appendChild(node('span','st',A.t12(s.time)));const l=local(s.ms);if(l&&s.state==='free')b.appendChild(node('small','',l));if(s.state==='taken'){b.title='Already booked';b.appendChild(node('small','','Booked'))}
b.addEventListener('click',()=>{set(sel,s.time);drawSlots()});slotsBox.appendChild(b)});
if(!slotsBox.children.length)slotsBox.appendChild(node('p','fine','No times left on this date.'))}
function drawCal(){const c=A.cfg(),t=A.today(c.tz);if(!view)view=t.slice(0,7)+'-01';cal.textContent='';
const [y,m]=view.split('-').map(Number),head=node('div','cal-h'),prev=node('button','cal-n','‹'),next=node('button','cal-n','›');
prev.type=next.type='button';prev.setAttribute('aria-label','Previous month');next.setAttribute('aria-label','Next month');
prev.disabled=view<=t.slice(0,7)+'-01';const nv=A.addDays(view,32).slice(0,7)+'-01';next.disabled=nv>lastDay().slice(0,7)+'-01';
prev.addEventListener('click',()=>{view=A.addDays(view,-1).slice(0,7)+'-01';drawCal()});next.addEventListener('click',()=>{view=nv;drawCal()});
head.append(prev,node('strong','',MON[m-1]+' '+y),next);cal.appendChild(head);
const grid=node('div','cal-g');grid.setAttribute('role','group');grid.setAttribute('aria-label','Choose a date');['Su','Mo','Tu','We','Th','Fr','Sa'].forEach((d,i)=>{const h=node('span','cal-d',d);h.title=A.DAYS[i];grid.appendChild(h)});
for(let i=0;i<A.dowOf(view);i++)grid.appendChild(node('span','cal-e'));
const n=new Date(Date.UTC(y,m,0)).getUTCDate();
for(let d=1;d<=n;d++){const ds=y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'),i=dayInfo(ds),b=node('button','cal-b',String(d));b.type='button';b.disabled=!i.ok;
b.setAttribute('aria-label',A.DAYS[A.dowOf(ds)]+' '+MON[m-1]+' '+d+(i.ok?'':' ('+i.why+')'));b.setAttribute('aria-pressed',String(ds===sel));if(ds===t)b.classList.add('today');
b.addEventListener('click',()=>{set(ds,'');drawCal();drawSlots()});grid.appendChild(b)}
cal.appendChild(grid)}
function refresh(){const c=A.cfg();tzl.textContent='All times are in '+A.tzName(c.tz)+(VTZ&&VTZ!==c.tz?'. Your time zone appears to be '+VTZ+'; your local time is shown on each time.':'.')+' Meetings last '+c.slot+' minutes.';
if(sel&&!dayInfo(sel).ok){set('','')}else if(selTime&&!(A.daySlots(sel).find(s=>s.time===selTime&&s.state==='free'))){set(sel,'')}
drawCal();drawSlots();if(!sel)set('','')}
A.onChange(refresh);refresh();
/* Security S3.2: the same-day notice moves with the clock, so slots that have just become too soon switch off without a reload */
setInterval(refresh,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
return{reset:()=>{sel='';selTime='';view='';set('','');refresh()},valid:()=>{const s=sel&&selTime&&A.daySlots(sel).find(x=>x.time===selTime);return!!s&&s.state==='free'}}})();
mf.elements.tz.value=window.availApi.cfg().tz;
/* service type + service-specific questions (Phase 6). Hidden unless the owner switches the feature on. */
const SF=window.serviceFormsApi,svcWrap=document.getElementById('svcWrap'),svcSel=document.getElementById('svcSel'),svcBox=document.getElementById('svcBox');
let svcHandle=null,svcForm=null,svcOn=false;
function drawService(){
if(!SF)return;svcHandle=null;svcForm=null;const f=SF.formFor(svcSel.value);
if(!SF.enabled()||!f){svcBox.hidden=true;document.getElementById('svcFields').replaceChildren();return}
svcForm=f;document.getElementById('svcLegend').textContent=f.name;const d=document.getElementById('svcDesc');d.textContent=f.description;d.hidden=!f.description;
svcHandle=SF.render(document.getElementById('svcFields'),f,'sf');svcBox.hidden=false}
function syncService(){
if(!SF)return;const on=SF.enabled(),st=SF.get(),keep=svcSel.value;svcOn=on;svcWrap.hidden=!on;svcSel.disabled=!on;svcSel.required=on;
if(!on){svcBox.hidden=true;document.getElementById('svcFields').replaceChildren();svcSel.replaceChildren();svcHandle=null;svcForm=null;return}
svcSel.replaceChildren(Object.assign(document.createElement('option'),{value:'',textContent:'Select a service'}),...st.services.map(s=>Object.assign(document.createElement('option'),{value:s.id,textContent:s.name})));
svcSel.value=st.services.some(s=>s.id===keep)?keep:'';drawService()}
if(SF){svcSel.addEventListener('change',drawService);SF.onChange(syncService);syncService()}
mf.addEventListener('submit',async e=>{e.preventDefault();const st=document.getElementById('mStatus'),b=document.getElementById('mBtn'),f=n=>mf.elements[n].value.trim();st.className='';st.textContent='';
if(window.capacityApi&&!window.capacityApi.open()){st.className='err';st.textContent='Frederick is currently at full client capacity and is not accepting new requests.';return}
if(f('website'))return;
const d={name:f('name'),email:f('email'),company:f('company'),date:f('date'),time:f('time'),tz:window.availApi.cfg().tz,platform:f('platform'),message:f('message')};
if(!d.name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)||!d.message){st.className='err';st.textContent='Please complete all required fields with a valid email address.';return}
if(!d.date||!d.time){st.className='err';st.textContent='Please choose an available date and time.';return}
if(!pick.valid()){st.className='err';st.textContent='That time is no longer available. Please choose another one.';return}
if(svcOn){const sid=svcSel.value,sv=SF.get().services.find(s=>s.id===sid);
if(!sv){st.className='err';st.textContent='Please choose a service type.';return}
d.service=sv.name.slice(0,60);
if(svcHandle&&svcForm){const r=svcHandle.validate();if(!r.ok){st.className='err';st.textContent=r.error;return}
d.formId=svcForm.id.slice(0,40);d.formName=svcForm.name.slice(0,100);if(r.answers.length)d.answers=JSON.stringify(r.answers)}}
if(VTZ)d.message=(d.message+'\n\n[Visitor time zone: '+VTZ+']').slice(0,2000);
let last=0;try{last=+localStorage.getItem('lastReq')||0}catch(x){}
if(Date.now()-last<60000){st.className='err';st.textContent='Please wait a minute before sending another request.';return}
b.disabled=true;
const FG=window.formGuard,gx=guardUi();let dec={token:false,status:null};
if(FG){st.textContent='Checking…';try{dec=await FG.decide()}catch(x){dec={token:false,status:null}}}
const done=()=>{try{localStorage.setItem('lastReq',Date.now())}catch(x){}
st.textContent='';mf.reset();pick.reset();syncService();mf.hidden=true;document.getElementById('mDone').hidden=false};
const failed=(msg,fb,detail)=>{st.className='err';st.textContent=msg+(detail&&/(?:^|[?&])verify=1(?:&|#|$)/.test(location.search)?' [test detail: '+detail+']':'');if(fb)addFallback(st,d)};
if(dec.token){
/* Project F: verified path (switch on, or ?verify=1). The old direct path below is used otherwise. */
if(dec.error){failed(FG.MSG[dec.error]||FG.MSG.failed,true)}
else{st.textContent='';const r=await FG.submit(d,gx.hooks,dec.status);gx.hide();
if(r.ok)done();else if(r.code==='cancelled'){st.textContent=''}else failed(r.message,true,r.detail)}}
else{st.textContent='Sending…';
try{if(!window.submitMeeting)throw 0;await Promise.race([window.submitMeeting(d),new Promise((_,j)=>setTimeout(j,15000))]);done()}
catch(x){failed('Sorry, your request could not be sent. The time may have just been taken, or the connection failed.',true)}}
b.disabled=false});
/* "Email me instead": a draft with what the visitor typed, so nobody is silently dropped */
function addFallback(st,d){const em=window.contactsApi&&window.contactsApi.get('email');if(!em)return;const a=document.createElement('a');a.href=window.formGuard?window.formGuard.mailtoFor(em.value,d):em.href+'?subject=Meeting%20request';a.textContent='Email me instead';a.className='gfb';st.append(' ',a)}
/* The challenge step of the verified path: a labelled box with the code, a typed field, three buttons, announced by screen readers */
function guardUi(){const box=document.getElementById('mGuard');if(!box)return{hooks:{askCode:async()=>null},hide(){}};
const code=document.getElementById('gCode'),inp=document.getElementById('gInput'),ok=document.getElementById('gOk'),nw=document.getElementById('gNew'),no=document.getElementById('gCancel'),msg=document.getElementById('gMsg');
const M=window.formGuard.MSG;
return{hide(){box.hidden=true;msg.textContent='';inp.value=''},hooks:{askCode(o){return new Promise(res=>{
box.hidden=false;code.textContent=o.code;code.setAttribute('aria-label','Your code: '+o.code.split('').join(' '));
msg.textContent=o.error==='wrong'?M.wrong+' '+o.left+(o.left===1?' try left.':' tries left.'):o.error==='expired'?M.expired:o.fresh?'Here is a new code.':'';
inp.value='';let over=false;const t=setTimeout(()=>fin({expired:true}),Math.max(10,(o.expiresInS||300)-5)*1000);
function fin(v){if(over)return;over=true;clearTimeout(t);ok.onclick=nw.onclick=no.onclick=inp.onkeydown=null;if(v!==null&&!(v&&v.expired)&&!(v&&v.renew))msg.textContent='Checking…';res(v)}
ok.onclick=()=>{const v=inp.value.trim();if(!/^\d{6}$/.test(v)){msg.textContent='Type the six digits shown above.';inp.focus();return}fin(v)};
nw.onclick=()=>fin({renew:true});no.onclick=()=>fin(null);
inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();ok.onclick()}else if(e.key==='Escape'){e.preventDefault();no.onclick()}};
if(o.fresh||o.error)setTimeout(()=>inp.focus(),0);else{box.scrollIntoView({block:'center'});inp.focus()}})}}}}
function route(){if(location.hash==='#schedule'&&window.capacityApi&&!window.capacityApi.open())history.replaceState(null,'',location.pathname+location.search+'#home');const s=location.hash==='#schedule';document.getElementById('page').hidden=s;document.getElementById('schedule').hidden=!s;
if(s){mf.hidden=false;document.getElementById('mDone').hidden=true;window.scrollTo(0,0);document.title='Schedule a Meeting · Frederick Espinosa'}
else{document.title=ORIG;if(location.hash.length>1){const t=document.getElementById(location.hash.slice(1));if(t)t.scrollIntoView()}}}
addEventListener('hashchange',route);route();
