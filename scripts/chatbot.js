/* ==========================================================================
   chatbot.js - scripted assistant, optional n8n/Make webhook, typing indicator
   ========================================================================== */
const bt=document.getElementById('chatBtn'),cp=document.getElementById('chat'),ms=document.getElementById('msgs'),ci=document.getElementById('chatInput'),cf=document.getElementById('chatForm'),E=window.chatEngine;
const sendBtn=cf.querySelector('button[type=submit]');
const MAIL='mailto:frederickespinosa.onlinejob@gmail.com?subject=Hiring%20inquiry';
const HIRE_OPEN=`You can <a href="#schedule">request a meeting</a>, <a href="${MAIL}" target="_blank" rel="noopener">email Frederick</a>, message him on <a href="https://wa.me/639052912208" target="_blank" rel="noopener noreferrer">WhatsApp</a>, or use the LinkedIn, OnlineJobs.ph and Upwork icons on this page.`;
const HIRE_FULL='Frederick is currently at full client capacity and is not taking new inquiries. Please check back later for availability.';
const hire=()=>window.capacityApi&&!window.capacityApi.open()?HIRE_FULL:HIRE_OPEN;
const KB=[
{k:['fba','fbm','fulfill'],a:`Frederick’s hands-on training focused on FBA product research, and he only has theoretical knowledge of FBM. FBA is where his practical experience is.`},
{k:['secure','secured','security','safe','privacy','confidential','my information','my data','personal info'],a:`Details you send through the meeting request form travel over an encrypted (HTTPS) connection and are stored in a private database that only Frederick’s verified Google account can read. They are used only to reply to your request. The built-in chat doesn’t save your messages, but if Frederick’s AI automation is switched on, your chat messages are sent to that workflow to generate replies. Please don’t share passwords, payment details or other sensitive information here.`},
{k:['other service','what other','what else','anything else','more services','other things'],a:`Besides online arbitrage product research, Frederick offers supplier and sourcing research, Keepa and sales-rank analysis, deal evaluation and sourcing criteria, deal sheets and documentation, AI workflow automation, and customer service. See the <a href="#services">Services</a> section for details.`},
{k:['service','offer','what do you do','what can you do','help with'],a:`Frederick offers online arbitrage research, supplier and sourcing research, Keepa and sales-rank analysis, deal evaluation, deal sheets and documentation, AI workflow automation, and customer service. See the <a href="#services">Services</a> section for details.`},
{k:['marketplace','uk ','usa','united states','united kingdom','us and uk','us or uk'],a:`Yes. His training covered both the US and UK Amazon marketplaces, with separate sourcing criteria and a separate deal sheet for each.`},
{k:['tool','software','selleramp','keepa','coupert','honey','extension'],a:`He uses SellerAmp SAS for profit, ROI, sales estimates and alerts, Keepa for price history and sales rank, Coupert and Honey for coupons and cashback, Amazon for product sourcing, and Amazon Seller Central for eligibility checks. See the <a href="#training">Product Research Tools</a> and <a href="#toolkit">Toolkit</a> sections.`},
{k:['criteria','qualify','roi','profit','requirement'],a:`In his training a lead needed a minimum profit (US$3 or £2) and 20% ROI, no more than 20 sellers, at least 30 estimated sales a month, and Amazon not selling it. Hazmat, IP, private-label and dangerous-goods items are screened out. He can also follow your own criteria.`},
{k:['supplier','legit','credib','trust'],a:`He reviews supplier websites and uses AI tools such as ChatGPT and Claude to help assess legitimacy and credibility before recommending a supplier.`},
{k:['accura','guarantee','estimate','reliable'],a:`Profit, ROI and sales figures are estimates based on the tools’ data, not guarantees. Final decisions should be confirmed against your own criteria and your account’s eligibility for each product.`},
{k:['deliverable','deal sheet','spreadsheet','google sheet','report','document'],a:`Each lead goes into an organized Google Sheet with the product title, supplier link, Amazon link, ASIN, BSR, buy and sell price, profit, ROI, estimated sales, notes and screenshots, so every deal can be verified.`},
{k:['customer service','bilingual','spanish','bpo','call center','support'],a:`Frederick has more than 10 years of BPO experience providing phone and chat support, including 5 years and 6 months of Spanish bilingual experience across telecommunications, financial services and healthcare.`},
{k:['automation','zapier','make','n8n','chatgpt','claude','ai '],a:`He uses ChatGPT, Claude, Zapier, Make and n8n to reduce repetitive research and admin work.`},
{k:['training','certificate','certified','course','learn'],a:`He completed a 6-week intensive Online Arbitrage VA training with The Ultimate VA for Online Arbitrage. See <a href="#training">Hands-on Training &amp; Research Experience</a>.`},
{k:['communicat','slack','asana','discord','update'],a:`He works through Slack, Asana, Discord or email, whichever you prefer, and shares a status update before you have to ask.`},
{k:['where','location','based','philippines','bulacan','plaridel'],a:`Frederick is based in Plaridel, Bulacan, Philippines.`},
{k:[' rate',' price','pricing','how much','charge',' fee','quote','hourly','per hour','budget',' cost'],get a(){const r=window.availApi&&window.availApi.rates(),b=[];if(r&&r.hourly!=null)b.push(`${esc(String(r.currency))} ${esc(String(r.hourly))} per hour`);if(r&&r.monthly!=null)b.push(`${esc(String(r.currency))} ${esc(String(r.monthly))} per month`);
return b.length?`Frederick’s rates are ${b.join(' or ')}, depending on the arrangement. The final rate depends on the service. ${hire()}`:`Rates depend on the service. Online arbitrage product research starts at $3/hour. For automation-related services, the rate depends on the needs of the job. ${hire()}`}},
{k:['available','availability','what time','schedule','working hours','hours','time zone','timezone','monday','saturday','when can'],get a(){return `Frederick is available ${window.availApi?esc(String(window.availApi.sentence())):'Monday to Saturday, 8:00 AM to 9:00 PM Philippine time (PHT, UTC+8)'}. To book a time, <a href="#schedule">request a meeting</a>.`}},
{k:['hire','meeting','contact','email','whatsapp','reach','message','linkedin','upwork','onlinejobs','book','work with'],get a(){return hire()}}
];
const FALLBACK=`I’m not sure about that one. I can answer questions about his services, tools, criteria, training and FBA experience. For anything else, ${hire()}`;
const IDLE_MSG='Is there anything else I can help you with? Are you still there?';
const WARN_MSG='Please keep the conversation respectful. I’m here to help with your questions.';
const REFUSE_MSG='I can’t help with that. I can answer questions about Frederick’s services, tools, training and how to hire him.';
const SLOW_MSG='Sorry, that is taking longer than expected.';
const IDLE_MS=300000, HOOK_TIMEOUT=15000, RATE_MAX=6, RATE_WINDOW=60000;
const SS=(k,v)=>{try{return v===undefined?sessionStorage.getItem(k):sessionStorage.setItem(k,v)}catch(e){return null}};
let lastFallback=false;   // set by answer(): true when the built-in knowledge could not answer
let busy=false,idleT=0,idleSent=false,strikes=+SS('chatStrikes')||0,blocked=SS('chatBlocked')==='1';
const sent=[];
const name=()=>E.identity().name;
const welcome=()=>`Hi! I’m ${name()}, the automated assistant for Frederick’s portfolio. Ask me about his services, tools, training or how to hire him.`;
function stamp(d){const t=document.createElement('time'),now=new Date();t.className='ts';t.dateTime=now.toISOString();const s=E.stamp(now);t.textContent=s;
let z='';try{z=Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){}t.title=s+(z?' ('+z+')':'');d.appendChild(t)}
function add(t,c,h){const d=document.createElement('div');d.className='m '+c;const b=document.createElement('div');b.className='mt';if(h)b.innerHTML=fixLinks(t);else b.textContent=t;d.appendChild(b);stamp(d);ms.appendChild(d);ms.scrollTop=ms.scrollHeight;return d}
/* Security S3: every owner-typed value placed inside an HTML answer goes through esc() first. */
/* Keep links in bot answers in sync with the contact links configured by the owner. */
function fixLinks(html){const api=window.contactsApi;if(!api)return html;const em=api.get('email'),wa=api.get('whatsapp');
html=em?html.replace(/mailto:[^"?]*/g,em.href):html.replace(/<a href="mailto:[^"]*"[^>]*>email Frederick<\/a>, /g,'');
html=wa?html.replace(/https:\/\/wa\.me\/\d+/g,wa.href):html.replace(/message him on <a href="https:\/\/wa\.me[^"]*"[^>]*>WhatsApp<\/a>, /g,'');return html}
/* built-in keyword knowledge (used after the owner's knowledge base, and when the webhook is off or fails) */
function answer(q){lastFallback=false;const s=' '+q.toLowerCase()+' ';
if(/\b(thanks|thank you)\b/.test(s))return `You’re welcome! ${hire()}`;
let best=null,top=0;for(const e of KB.concat(window.__chatExtra||[])){let n=0;for(const k of e.k)if(s.includes(k))n+=k.length>=12?2:1;if(n>top){top=n;best=e}}
lastFallback=!best;return best?best.a:FALLBACK}
const SID=Math.random().toString(36).slice(2),HIST=[];
async function viaHook(q){const c=new AbortController(),t=setTimeout(()=>c.abort(),HOOK_TIMEOUT);
try{const r=await fetch(window.chatHook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:q.slice(0,300),sessionId:SID,history:HIST.slice(-8).map(m=>({role:m.role,content:String(m.content).slice(0,600)})),page:location.origin+location.pathname}),signal:c.signal});
if(!r.ok)throw 0;const ct=r.headers.get('content-type')||'';let x=ct.includes('json')?await r.json():await r.text();
if(Array.isArray(x))x=x[0];if(x&&typeof x==='object')x=x.reply??x.output??x.text??x.message??x.response;
if(typeof x!=='string'||!x.trim())throw 0;return x.trim().slice(0,2000)}finally{clearTimeout(t)}}
function esc(s){return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
const wait=t=>new Promise(r=>setTimeout(r,t));
function typing(){const w=document.createElement('div');w.className='m bot typing';w.innerHTML='<span class="dots" aria-hidden="true"><span></span><span></span><span></span></span><span class="sr">Typing…</span>';ms.appendChild(w);ms.scrollTop=ms.scrollHeight;return w}
const recordedQ=new Set();   // one record per distinct question per visit
function trackUnanswered(q,text){if(typeof window.recordUnanswered!=='function')return;const k=q.trim().toLowerCase();if(recordedQ.has(k))return;recordedQ.add(k);const us=HIST.filter(m=>m.role==='user'),prev=us.length>1?us[us.length-2].content:'';window.recordUnanswered({question:q,response:text,sessionId:SID,context:prev})}

/* input lock: one request at a time */
function lock(on){busy=on;ci.disabled=on;sendBtn.disabled=on;cf.setAttribute('aria-busy',String(on));cf.classList.toggle('busy',on);
ci.placeholder=on?`${name()} is replying…`:'Type your question…';
if(!on&&cp.classList.contains('open')&&!blocked)ci.focus()}
/* idle message: once per idle period, only while the chat is open and nothing is running */
function resetIdle(){clearTimeout(idleT);idleT=0;if(!cp.classList.contains('open')||blocked)return;
idleT=setTimeout(()=>{idleT=0;if(!cp.classList.contains('open')||blocked)return;if(busy){resetIdle();return}
if(!idleSent){idleSent=true;add(IDLE_MSG,'bot')}},IDLE_MS)}
const touch=()=>{idleSent=false;resetIdle()};

async function reply(q){
lock(true);const w=typing(),t0=Date.now();const guard=setTimeout(()=>lock(false),HOOK_TIMEOUT+8000);
let a=null,html=true,local=false;
try{
const m=E.matchKb(q,E.kb());                       // owner-approved and predefined answers come first
if(m){a=m.item.a;html=false;local=true}
else if(window.chatHook){try{a=await viaHook(q);html=false}catch(e){a=null}}
if(a==null){a=answer(q);html=true;local=true}
const target=local?E.replyDelay(a.length):E.MIN_MS;   // controlled 2-8 s for stored answers; webhook answers show as soon as they arrive (after 2 s minimum)
const rem=target-(Date.now()-t0);if(rem>0)await wait(rem);
const unanswered=html&&lastFallback&&!m;
w.classList.remove('typing');w.textContent='';
const b=document.createElement('div');b.className='mt';
if(html)b.innerHTML=fixLinks(a);else b.innerHTML=esc(a).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\n/g,'<br>');
w.append(b);stamp(w);HIST.push({role:'assistant',content:b.textContent});
if(unanswered)trackUnanswered(q,b.textContent);
}catch(e){w.classList.remove('typing');w.textContent='';const b=document.createElement('div');b.className='mt';b.textContent=SLOW_MSG;w.append(b);stamp(w)}
finally{clearTimeout(guard);ms.scrollTop=ms.scrollHeight;lock(false);touch()}}

/* short system-style reply (moderation, rate limit): no AI call, no long delay */
async function note(text){lock(true);const w=typing();await wait(700);w.classList.remove('typing');w.textContent='';const b=document.createElement('div');b.className='mt';b.textContent=text;w.append(b);stamp(w);ms.scrollTop=ms.scrollHeight;lock(false);touch()}
function blockChat(){blocked=true;SS('chatBlocked','1');clearTimeout(idleT);cp.classList.remove('open');cp.hidden=true;bt.hidden=true;bt.setAttribute('aria-expanded','false')}
function ask(q){
q=q.trim().slice(0,300);if(!q||busy||blocked)return;
const now=Date.now();while(sent.length&&now-sent[0]>RATE_WINDOW)sent.shift();
if(sent.length>=RATE_MAX){note('You are sending messages very quickly. Please wait a moment and try again.');return}
sent.push(now);add(q,'me');
const kind=E.classify(q,E.identity().mod);   // moderation runs before anything is sent to the webhook
if(kind==='profanity'){strikes++;SS('chatStrikes',String(strikes));if(strikes>=2){blockChat();return}note(WARN_MSG);return}
if(kind==='inappropriate'){note(REFUSE_MSG);return}
HIST.push({role:'user',content:q});reply(q)}

/* identity from the owner's settings */
function applyIdentity(){const id=E.identity(),n=id.name;
const h=cp.querySelector('.chat-h strong');if(h)h.textContent=n+' - Assistant';
cp.setAttribute('aria-label',n+' - Assistant chat');
bt.setAttribute('aria-label',(cp.classList.contains('open')?'Close ':'Open ')+n+' - Assistant chat');
const av=cp.querySelector('.chat-av'),ic=bt.querySelector('svg'),bi=bt.querySelector('img');
if(av){av.hidden=!id.avatar;if(id.avatar)av.src=id.avatar}
if(id.avatar){if(!bi){const i=document.createElement('img');i.alt='';i.width=44;i.height=44;bt.append(i)}bt.querySelector('img').src=id.avatar;if(ic)ic.style.display='none';bt.classList.add('has-av')}
else{if(bi)bi.remove();if(ic)ic.style.display='';bt.classList.remove('has-av')}
const first=ms.querySelector('.m.bot .mt');if(first&&ms.children.length===1)first.textContent=welcome()}
function setChat(o){if(blocked)o=false;cp.classList.toggle('open',o);bt.setAttribute('aria-expanded',o);applyIdentity();
if(o){if(!ms.children.length)add(welcome(),'bot');if(!busy)ci.focus();touch()}else{clearTimeout(idleT);idleT=0}}
bt.addEventListener('click',()=>setChat(!cp.classList.contains('open')));
document.getElementById('chatClose').addEventListener('click',()=>{setChat(false);bt.focus()});
cf.addEventListener('submit',e=>{e.preventDefault();if(busy||blocked)return;const v=ci.value;if(!v.trim())return;ci.value='';ask(v)});
['input','focus','keydown'].forEach(ev=>ci.addEventListener(ev,touch));cp.addEventListener('click',touch);ms.addEventListener('scroll',touch,{passive:true});
ms.addEventListener('click',e=>{if(e.target.closest('a[href^="#"]'))setChat(false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&cp.classList.contains('open'))setChat(false)});
E.onChange(applyIdentity);
if(blocked){cp.hidden=true;bt.hidden=true}
applyIdentity();
window.chatbotApi={isBlocked:()=>blocked,strikes:()=>strikes,busy:()=>busy,IDLE_MS};
