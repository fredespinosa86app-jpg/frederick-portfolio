/* ==========================================================================
   owner-panel.js - owner login (Google), saved settings, meeting requests inbox (Firebase)
   ========================================================================== */
const S=window.portfolioSettings||{};
const notify=(m,t)=>window.dashNotify?window.dashNotify(m,t||(/^(Could not|Please|The webhook|This account)/.test(m)?'error':'success')):alert(m);
const FIREBASE_CONFIG=S.firebase||null;
const OWNER=S.ownerEmail;
if(FIREBASE_CONFIG){try{
const B=new URL('../assets/vendor/firebase/10.12.2/',import.meta.url).href;   /* SE-E3: the Firebase SDK is served from this site (assets/vendor/firebase), not from Google. No query string on these addresses: the vendored files import each other without one. */
const {initializeApp}=await import(B+'firebase-app.js');
const {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged,setPersistence,browserSessionPersistence,browserLocalPersistence}=await import(B+'firebase-auth.js');
const {getFirestore,doc,onSnapshot,setDoc,collection,addDoc,serverTimestamp,query,orderBy,limit,updateDoc,deleteDoc,where,getDocs,getDoc,startAfter,getCountFromServer,writeBatch,runTransaction,increment}=await import(B+'firebase-firestore.js');
const app=initializeApp(FIREBASE_CONFIG);
/* Security S2 / SE-E1: App Check (reCAPTCHA Enterprise score key, free up to 10,000 assessments a month; or classic v3 if appCheckProvider is 'v3'). Active only when settings.js holds a site key; a failure never blocks the site. */
if(window.coreAppCheck)await window.coreAppCheck.start(B,app,S);   /* SE-E1: shared helper, same for all three Firebase clients; never throws */
const auth=getAuth(app),ref=doc(getFirestore(app),'settings','site');
/* Security S1: by default the owner session ends when the browser is closed; "keep me signed in" is an explicit per-device choice (Owner panel > Security). */
let keepIn=false;try{keepIn=localStorage.getItem('ownerKeep')==='1'}catch(e){}
try{await setPersistence(auth,keepIn?browserLocalPersistence:browserSessionPersistence)}catch(e){console.warn('Could not set sign-in persistence',e)}
const $=id=>document.getElementById(id),hire=document.querySelectorAll('.hire-cta'),login=$('ownerLogin'),cb=$('hireToggle'),hookUrl=$('hookUrl'),hookOn=$('hookOn'),introOn=$('introOn'),introUrl=$('introUrl');
login.hidden=false;
/* S3.1: every first answer (data, empty or error) is reported to the loading cover */
const BC=window.bootCover||{need(){},done(){},panel(){}};
/* Phase R1: a visitor reuses a copy saved in the last 10 minutes (0 reads) or reads the document once; the owner's device keeps live listeners. Any cache problem falls back to the old behaviour. */
const CC=window.contentCache,REG=[];let LIVE=false;
const watch=(k,r,f)=>{BC.need(k);let d=false;const m=()=>{if(!d){d=true;BC.done(k)}};
const live=()=>onSnapshot(r,s=>{try{f(s)}finally{m()}},m);
REG.push({k,live,on:false});const me=REG[REG.length-1];
if(!CC||LIVE||CC.ownerDevice()){me.on=true;live();return}
const now=Date.now(),c=CC.read(k);
if(CC.isFresh(c,now)){try{f(CC.snap(c.d))}finally{m()}return}
getDoc(r).then(s=>{try{CC.write(k,s.exists()?s.data():null,Date.now())}catch(e){}try{f(s)}finally{m()}},()=>{if(CC.isUsableStale(c,now)){try{f(CC.snap(c.d))}finally{m()}}else m()})};
const goLive=()=>{LIVE=true;REG.forEach(x=>{if(!x.on){x.on=true;try{x.live()}catch(e){}}})};
watch('settings',ref,s=>{const d=s.exists()?s.data():{};const on=d.hireEnabled!==false;if(window.capacityApi)window.capacityApi.setHire(on);else hire.forEach(e=>e.hidden=!on);cb.checked=on;window.chatHook=d.chatAuto&&/^https:\/\//i.test(d.chatWebhook||'')&&window.coreCsp&&window.coreCsp.allowsConnect(d.chatWebhook)?d.chatWebhook:'';hookUrl.value=d.chatWebhook||'';hookOn.checked=!!d.chatAuto;const iu=typeof d.introUrl==='string'?d.introUrl:window.DEF_INTRO,ie=d.introEnabled!==false;introOn.checked=ie;introUrl.value=iu;window.applySite(d)});
window.__ownerLoginReady=true;
const authMsg=e=>{const c=(e&&e.code)||'';
if(c==='auth/unauthorized-domain')return 'Sign-in is blocked because "'+location.hostname+'" is not an authorized domain. In Firebase open Authentication > Settings > Authorized domains and add it.';
if(c==='auth/popup-blocked')return 'Your browser blocked the sign-in pop-up. Allow pop-ups for this site and try again.';
if(c==='auth/popup-closed-by-user'||c==='auth/cancelled-popup-request')return 'Sign-in was cancelled.';
if(c==='auth/operation-not-allowed')return 'Google sign-in is switched off. In Firebase open Authentication > Sign-in method and enable Google.';
if(c==='auth/network-request-failed')return 'Network error while signing in. Check your connection and try again.';
if(c==='auth/invalid-api-key'||c==='auth/api-key-not-valid.-please-pass-a-valid-api-key.')return 'The Firebase API key in scripts/settings.js is not valid.';
return 'Sign-in failed'+(c?' ('+c+')':'')+'. Open the browser console (F12) for details.'};
login.addEventListener('click',()=>{window.__ownerJustSignedIn=true;const p=new GoogleAuthProvider();p.setCustomParameters({login_hint:OWNER});signInWithPopup(auth,p).catch(e=>{window.__ownerJustSignedIn=false;console.error('Owner sign-in error',e);notify(authMsg(e),'error')})});
cb.addEventListener('change',()=>setDoc(ref,{hireEnabled:cb.checked,updatedAt:Date.now()},{merge:true}).catch(()=>{notify('Could not save the setting. Please check your Firestore rules.');cb.checked=!cb.checked}));
$('adminOut').addEventListener('click',()=>signOut(auth));
const save=(o,m)=>setDoc(ref,{...o,updatedAt:Date.now()},{merge:true}).then(()=>{notify(m);window.OWN&&window.OWN.log(m)}).catch(()=>notify('Could not save. Please check your Firestore rules.'));
$('heroSave').addEventListener('click',()=>save({heroC1:$('heroC1').value,heroC2:$('heroC2').value,heroGrad:$('heroG').checked,heroAng:$('heroAng').value,heroTitle:$('heroH1').value.trim(),heroRole:$('heroRole').value.trim(),heroText:$('heroTxt').value.trim(),heroText2:$('heroTxt2').value.trim(),heroLayout:$('heroLay').value},'Hero settings saved.'));
$('heroReset').addEventListener('click',()=>{if(confirm('Reset the hero to its original look and text?'))save({heroC1:'#070C18',heroC2:'#1b2a4e',heroGrad:false,heroAng:'135',heroTitle:'',heroRole:'',heroText:'',heroText2:'',heroLayout:'text-left'},'Hero reset to default.')});
$('gSave').addEventListener('click',()=>{const c=$('gCol').checked;save({gHead:$('gHead').value,gBody:$('gBody').value,gSize:$('gSize').value,gHeadC:c?$('gHeadC').value:'',gTextC:c?$('gTextC').value:''},'Style saved.')});
$('gReset').addEventListener('click',()=>{if(confirm('Reset fonts, text size and colors to the original style?'))save({gHead:'fr',gBody:'dm',gSize:'1',gHeadC:'',gTextC:''},'Style reset to default.')});
const fxv=()=>[['fxReveal','reveal'],['fxLift','lift'],['fxGlow','glow'],['fxGlass','glass']].filter(x=>$(x[0]).checked).map(x=>x[1]).join(',');
$('thSave').addEventListener('click',()=>save({theme:$('thSel').value,fx:fxv()},'Theme and effects saved.'));
$('thReset').addEventListener('click',()=>{if(confirm('Reset the theme and effects to default?'))save({theme:'gold-silver',fx:''},'Theme and effects reset.')});
$('hiSave').addEventListener('click',()=>{const img=window.__heroImgData||'';save({heroImg:img,heroImgOn:$('hiOn').checked&&!!img,heroImgW:+$('hiW').value,heroImgX:+$('hiX').value,heroImgY:+$('hiY').value,heroImgOp:+$('hiOp').value,heroImgFront:$('hiFront').checked},'Hero image saved.')});
$('hiRemove').addEventListener('click',()=>{if(confirm('Remove the hero image?'))save({heroImg:'',heroImgOn:false},'Hero image removed.')});
$('introRemove').addEventListener('click',async()=>{if(!introUrl.value.trim()&&!introOn.checked){notify('There is no video link to remove.');return}if(!await window.dashKit.confirmBox('Remove the intro video?','The link is cleared and the video section is hidden from visitors. You can paste a new link at any time.'))return;setDoc(ref,{introUrl:'',introEnabled:false,updatedAt:Date.now()},{merge:true}).then(()=>{introUrl.value='';introOn.checked=false;notify('Intro video removed.');window.OWN&&window.OWN.log('Intro video removed.')}).catch(()=>notify('Could not save. Please check your Firestore rules.'))});
$('introSave').addEventListener('click',()=>{const u=introUrl.value.trim();if(u&&!window.parseVideo(u)){notify('Please paste a valid YouTube or Loom link, starting with https://');return}
setDoc(ref,{introUrl:u,introEnabled:introOn.checked,updatedAt:Date.now()},{merge:true}).then(()=>notify('Video settings saved.')).catch(()=>notify('Could not save. Please check your Firestore rules.'))});
$('hookSave').addEventListener('click',()=>{const u=hookUrl.value.trim();if(u&&!u.startsWith('https://')){notify('The webhook URL must start with https://');return}
if(u&&!(window.coreCsp&&window.coreCsp.allowsConnect(u))){notify('That address is not on the page\u2019s allowed connection list, so the browser would block it. Ask your developer to add this one host to the connection rule first, then save again.');return}
setDoc(ref,{chatWebhook:u,chatAuto:hookOn.checked&&!!u,updatedAt:Date.now()},{merge:true}).then(()=>notify('Chatbot automation settings saved.')).catch(()=>notify('Could not save. Please check your Firestore rules.'))});
const rdb=getFirestore(app);
const hash=s=>{let x=5381;for(const c of s)x=((x<<5)+x+c.charCodeAt(0))>>>0;return x.toString(36)};
/* Visitors: meeting request form (validated again by the Firestore rules) */
/* SE-H1: there is no direct booking write any more; bookings go through scripts/form-guard.js (Worker token) only. */
/* Visitors: questions the chatbot could not answer. The document id is session+question, so a repeated question
   is a second create on the same id, which the rules reject (no duplicate records). */
/* SE-H1: visits and unanswered questions are COUNTED against a daily budget: the record and the counter bump (anonCounters/<v|c>_<UTC day>) are one batch, and the rules refuse the batch once the day's budget is used up.
   A refused write is dropped quietly (analytics only; the site is never affected). Two visitors bumping at the same moment collide: one retries after a short random wait. */
const counted=window.coreAnon.make({writeBatch,doc,increment,db:rdb});   /* scripts/core-anon.js (unit-tested) */
window.recordUnanswered=r=>{const q=String(r.question||'').trim().slice(0,300);if(!q)return Promise.resolve();const sid=String(r.sessionId||'anon').slice(0,40);
return counted('c','chatUnanswered',sid+'_'+hash(q.toLowerCase()),{question:q,response:String(r.response||'').slice(0,600),sessionId:sid,context:String(r.context||'').slice(0,300),status:'new',createdAt:serverTimestamp()}).catch(()=>{})};
/* Owner dashboard bridge (every call is checked by the Firestore rules, not by the UI) */
/* Phase 3: anonymous visit counter (rules allow create-only with a fixed set of fields) */
/* Security S2: the id is session+type+page, so the same record can never be created twice (the rules check it) */
window.recordVisit=d=>counted('v','visits',d.sid+'_'+d.type+'_'+d.path,{...d,createdAt:serverTimestamp()});
/* Enhancement E2: one summary record per visit (rules: create once, then only grow) */
window.recordSummary=(d,first)=>{const id=d.sid+'_summary_sections';return first?counted('v','visits',id,{...d,createdAt:serverTimestamp()}):updateDoc(doc(rdb,'visits',id),{secs:d.secs})};
/* every owner write is counted so the dashboard can lock "View site" while a save is running */
const busy=f=>(...a)=>{window.dashBusy&&window.dashBusy(1);return Promise.resolve(f(...a)).finally(()=>window.dashBusy&&window.dashBusy(-1))};
window.OWN={db:rdb,ref,save,fs:{collection,addDoc:busy(addDoc),doc,setDoc:busy(setDoc),updateDoc:busy(updateDoc),deleteDoc:busy(deleteDoc),onSnapshot,query,orderBy,limit,startAfter,where,getDocs,getDoc,serverTimestamp,writeBatch:()=>{const b=writeBatch(rdb),c=b.commit.bind(b);b.commit=busy(c);return b},runTransaction:busy(runTransaction)},
uid:()=>auth.currentUser?auth.currentUser.uid:'',
count:async(c,sinceMs)=>(await getCountFromServer(query(collection(rdb,c),where('createdAt','>=',new Date(sinceMs))))).data().count,
session:{signOut:()=>signOut(auth),setKeep:async on=>{try{localStorage.setItem('ownerKeep',on?'1':'0')}catch(e){}try{await setPersistence(auth,on?browserLocalPersistence:browserSessionPersistence)}catch(e){}},keep:()=>keepIn},
log:text=>addDoc(collection(rdb,'activity'),{text:String(text).slice(0,200),createdAt:serverTimestamp()}).catch(()=>{})};
/* Public content (defaults live in scripts/content.js; the owner's published edits override them) */
watch('services',doc(rdb,'content','services'),s=>{if(s.exists()&&Array.isArray(s.data().items)&&window.contentApi)window.contentApi.setServices(s.data().items,s.data().view)});
watch('toolkit',doc(rdb,'content','toolkit'),s=>{if(s.exists()&&Array.isArray(s.data().categories)&&window.contentApi)window.contentApi.setToolkit(s.data().categories,s.data().view)});
watch('training',doc(rdb,'content','training'),s=>{if(s.exists()&&Array.isArray(s.data().items)&&window.trainingApi)window.trainingApi.set(s.data().items)});
watch('videos',doc(rdb,'content','videos'),s=>{if(s.exists()&&Array.isArray(s.data().items)&&window.videosApi)window.videosApi.set(s.data().items,s.data().view)});
watch('faq',doc(rdb,'content','faq'),s=>{if(s.exists()&&Array.isArray(s.data().items)&&window.faqApi)window.faqApi.set(s.data().items)});
watch('heroPhoto',doc(rdb,'content','heroPhoto'),s=>{if(window.heroPhotoApi)window.heroPhotoApi.setDoc(s.exists()?s.data():null)});
watch('experience',doc(rdb,'content','experience'),s=>{if(window.experienceApi)window.experienceApi.set(s.exists()?s.data():null)});
watch('serviceForms',doc(rdb,'content','serviceForms'),s=>{if(window.serviceFormsApi)window.serviceFormsApi.set(s.exists()?s.data():null)});
watch('capacity',doc(rdb,'content','capacity'),s=>{if(window.capacityApi)window.capacityApi.set(s.exists()?s.data():null)});
watch('chatbot',doc(rdb,'content','chatbot'),s=>{if(window.chatEngine)window.chatEngine.setIdentity(s.exists()?s.data():null)});
watch('chatKb',doc(rdb,'content','chatKb'),s=>{if(window.chatEngine)window.chatEngine.setKb(s.exists()?s.data():null)});
watch('availability',doc(rdb,'content','availability'),s=>{if(window.availApi)window.availApi.setCfg(s.exists()?s.data():null)});
watch('busy',doc(rdb,'content','busy'),s=>{if(window.availApi)window.availApi.setBusy(s.exists()?s.data():null)});
watch('rates',doc(rdb,'content','rates'),s=>{if(window.availApi)window.availApi.setRates(s.exists()?s.data():null)});
watch('testimonials',doc(rdb,'content','testimonials'),s=>{if(window.testiApi)window.testiApi.setDoc(s.exists()?s.data():null)});
onAuthStateChanged(auth,u=>{const viaGoogle=!!u&&Array.isArray(u.providerData)&&u.providerData.some(x=>x&&x.providerId==='google.com');const ok=!!u&&u.email===OWNER&&u.emailVerified===true&&viaGoogle;
if(u&&!ok){signOut(auth);notify('The Google account ('+u.email+') is not the owner account. Sign in with '+OWNER+'.','error');return}
login.hidden=ok;if(ok){try{localStorage.setItem('ownerDevice','1')}catch(e){}goLive()}document.dispatchEvent(new CustomEvent('own:auth',{detail:{ok,email:ok?u.email:'',uid:ok?u.uid:'',provider:ok?'google.com':''}}))});
}catch(e){window.__ownerLoginError=String((e&&e.message)||e);console.warn('Owner login unavailable',e)}}
try{window.bootCover&&window.bootCover.panel()}catch(e){}
