/* ==========================================================================
   owner-panel.js - owner login (Google), saved settings, meeting requests inbox (Firebase)
   ========================================================================== */
const S=window.portfolioSettings||{};
const notify=(m,t)=>window.dashNotify?window.dashNotify(m,t||(/^(Could not|Please|The webhook|This account)/.test(m)?'error':'success')):alert(m);
const FIREBASE_CONFIG=S.firebase||null;
const OWNER=S.ownerEmail;
if(FIREBASE_CONFIG){try{
const B='https://www.gstatic.com/firebasejs/10.12.2/';
const {initializeApp}=await import(B+'firebase-app.js');
const {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged}=await import(B+'firebase-auth.js');
const {getFirestore,doc,onSnapshot,setDoc,collection,addDoc,serverTimestamp,query,orderBy,limit,updateDoc,deleteDoc}=await import(B+'firebase-firestore.js');
const app=initializeApp(FIREBASE_CONFIG),auth=getAuth(app),ref=doc(getFirestore(app),'settings','site');
const $=id=>document.getElementById(id),hire=document.querySelectorAll('.hire-cta'),login=$('ownerLogin'),cb=$('hireToggle'),hookUrl=$('hookUrl'),hookOn=$('hookOn'),introOn=$('introOn'),introUrl=$('introUrl');
login.hidden=false;
onSnapshot(ref,s=>{const d=s.exists()?s.data():{};const on=d.hireEnabled!==false;hire.forEach(e=>e.hidden=!on);cb.checked=on;window.chatHook=d.chatAuto&&d.chatWebhook?d.chatWebhook:'';hookUrl.value=d.chatWebhook||'';hookOn.checked=!!d.chatAuto;const iu=d.introUrl||window.DEF_INTRO,ie=d.introEnabled!==false;introOn.checked=ie;introUrl.value=iu;window.setIntro(iu,ie);window.applySite(d)},()=>{});
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
$('introSave').addEventListener('click',()=>{const u=introUrl.value.trim();if(u&&!window.parseVideo(u)){notify('Please paste a valid YouTube or Loom link, starting with https://');return}
setDoc(ref,{introUrl:u,introEnabled:introOn.checked,updatedAt:Date.now()},{merge:true}).then(()=>notify('Video settings saved.')).catch(()=>notify('Could not save. Please check your Firestore rules.'))});
$('hookSave').addEventListener('click',()=>{const u=hookUrl.value.trim();if(u&&!u.startsWith('https://')){notify('The webhook URL must start with https://');return}
setDoc(ref,{chatWebhook:u,chatAuto:hookOn.checked&&!!u,updatedAt:Date.now()},{merge:true}).then(()=>notify('Chatbot automation settings saved.')).catch(()=>notify('Could not save. Please check your Firestore rules.'))});
const rdb=getFirestore(app);
const hash=s=>{let x=5381;for(const c of s)x=((x<<5)+x+c.charCodeAt(0))>>>0;return x.toString(36)};
/* Visitors: meeting request form (validated again by the Firestore rules) */
window.submitMeeting=d=>addDoc(collection(rdb,'meetingRequests'),{...d,status:'new',createdAt:serverTimestamp()});
/* Visitors: questions Marcus could not answer. The document id is session+question, so a repeated question
   is a second create on the same id, which the rules reject (no duplicate records). */
window.recordUnanswered=r=>{const q=String(r.question||'').trim().slice(0,300);if(!q)return Promise.resolve();const sid=String(r.sessionId||'anon').slice(0,40);
return setDoc(doc(rdb,'chatUnanswered',sid+'_'+hash(q.toLowerCase())),{question:q,response:String(r.response||'').slice(0,600),sessionId:sid,context:String(r.context||'').slice(0,300),status:'new',createdAt:serverTimestamp()}).catch(()=>{})};
/* Owner dashboard bridge (every call is checked by the Firestore rules, not by the UI) */
window.OWN={db:rdb,ref,save,fs:{collection,addDoc,doc,setDoc,updateDoc,deleteDoc,onSnapshot,query,orderBy,limit,serverTimestamp},
log:text=>addDoc(collection(rdb,'activity'),{text:String(text).slice(0,200),createdAt:serverTimestamp()}).catch(()=>{})};
/* Public content (defaults live in scripts/content.js; the owner's published edits override them) */
onSnapshot(doc(rdb,'content','services'),s=>{if(s.exists()&&Array.isArray(s.data().items)&&window.contentApi)window.contentApi.setServices(s.data().items,s.data().view)},()=>{});
onSnapshot(doc(rdb,'content','toolkit'),s=>{if(s.exists()&&Array.isArray(s.data().categories)&&window.contentApi)window.contentApi.setToolkit(s.data().categories,s.data().view)},()=>{});
onSnapshot(doc(rdb,'content','training'),s=>{if(s.exists()&&Array.isArray(s.data().items)&&window.trainingApi)window.trainingApi.set(s.data().items)},()=>{});
onSnapshot(doc(rdb,'content','videos'),s=>{if(s.exists()&&Array.isArray(s.data().items)&&window.videosApi)window.videosApi.set(s.data().items,s.data().view)},()=>{});
onSnapshot(doc(rdb,'content','faq'),s=>{if(s.exists()&&Array.isArray(s.data().items)&&window.faqApi)window.faqApi.set(s.data().items)},()=>{});
onSnapshot(doc(rdb,'content','heroPhoto'),s=>{if(window.heroPhotoApi)window.heroPhotoApi.setDoc(s.exists()?s.data():null)},()=>{});
onSnapshot(doc(rdb,'content','experience'),s=>{if(window.experienceApi)window.experienceApi.set(s.exists()?s.data():null)},()=>{});
onSnapshot(doc(rdb,'content','availability'),s=>{if(window.availApi)window.availApi.setCfg(s.exists()?s.data():null)},()=>{});
onSnapshot(doc(rdb,'content','busy'),s=>{if(window.availApi)window.availApi.setBusy(s.exists()?s.data():null)},()=>{});
onSnapshot(doc(rdb,'content','rates'),s=>{if(window.availApi)window.availApi.setRates(s.exists()?s.data():null)},()=>{});
onSnapshot(doc(rdb,'content','testimonials'),s=>{if(window.testiApi)window.testiApi.setDoc(s.exists()?s.data():null)},()=>{});
onAuthStateChanged(auth,u=>{const ok=!!u&&u.email===OWNER&&u.emailVerified;
if(u&&!ok){signOut(auth);notify('The Google account ('+u.email+') is not the owner account. Sign in with '+OWNER+'.','error');return}
login.hidden=ok;document.dispatchEvent(new CustomEvent('own:auth',{detail:{ok,email:ok?u.email:''}}))});
}catch(e){window.__ownerLoginError=String((e&&e.message)||e);console.warn('Owner login unavailable',e)}}
