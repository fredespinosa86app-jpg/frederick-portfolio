/* ==========================================================================
   chatbot.js - scripted assistant, optional n8n/Make webhook, typing indicator
   ========================================================================== */
const bt=document.getElementById('chatBtn'),cp=document.getElementById('chat'),ms=document.getElementById('msgs'),ci=document.getElementById('chatInput');
const MAIL='mailto:frederickespinosa.onlinejob@gmail.com?subject=Hiring%20inquiry';
const HIRE=`You can <a href="#schedule">request a meeting</a>, <a href="${MAIL}" target="_blank" rel="noopener">email Frederick</a>, message him on <a href="https://wa.me/639052912208" target="_blank" rel="noopener noreferrer">WhatsApp</a>, or use the LinkedIn, OnlineJobs.ph and Upwork icons on this page.`;
const KB=[
{k:['fba','fbm','fulfill'],a:`Frederick’s hands-on training focused on FBA product research, and he only has theoretical knowledge of FBM. FBA is where his practical experience is.`},
{k:['secure','secured','security','safe','privacy','confidential','my information','my data','personal info'],a:`Details you send through the meeting request form travel over an encrypted (HTTPS) connection and are stored in a private database that only Frederick’s verified Google account can read. They are used only to reply to your request. The built-in chat doesn’t save your messages, but if Frederick’s AI automation is switched on, your chat messages are sent to that workflow to generate replies. Please don’t share passwords, payment details or other sensitive information here.`},
{k:['other service','what other','what else','anything else','more services','other things'],a:`Besides online arbitrage product research, Frederick offers supplier and sourcing research, Keepa and sales-rank analysis, deal evaluation and sourcing criteria, deal sheets and documentation, AI workflow automation, and customer service. See the <a href="#services">Services</a> section for details.`},
{k:['service','offer','what do you do','what can you do','help with'],a:`Frederick offers online arbitrage research, supplier and sourcing research, Keepa and sales-rank analysis, deal evaluation, deal sheets and documentation, AI workflow automation, and customer service. See the <a href="#services">Services</a> section for details.`},
{k:['marketplace','uk ','usa','united states','united kingdom','us and uk','us or uk'],a:`Yes. His training covered both the US and UK Amazon marketplaces, with separate sourcing criteria and a separate deal sheet for each.`},
{k:['tool','software','selleramp','keepa','coupert','honey','extension'],a:`He uses SellerAmp SAS for profit, ROI, sales estimates and alerts, Keepa for price history and sales rank, Coupert and Honey for coupons and cashback, Amazon for product sourcing, and Amazon Seller Central for eligibility checks. See the <a href="#tools">Product Research Tools</a> and <a href="#toolkit">Toolkit</a> sections.`},
{k:['criteria','qualify','roi','profit','requirement'],a:`In his training a lead needed a minimum profit (US$3 or £2) and 20% ROI, no more than 20 sellers, at least 30 estimated sales a month, and Amazon not selling it. Hazmat, IP, private-label and dangerous-goods items are screened out. He can also follow your own criteria.`},
{k:['supplier','legit','credib','trust'],a:`He reviews supplier websites and uses AI tools such as ChatGPT and Claude to help assess legitimacy and credibility before recommending a supplier.`},
{k:['accura','guarantee','estimate','reliable'],a:`Profit, ROI and sales figures are estimates based on the tools’ data, not guarantees. Final decisions should be confirmed against your own criteria and your account’s eligibility for each product.`},
{k:['deliverable','deal sheet','spreadsheet','google sheet','report','document'],a:`Each lead goes into an organized Google Sheet with the product title, supplier link, Amazon link, ASIN, BSR, buy and sell price, profit, ROI, estimated sales, notes and screenshots, so every deal can be verified.`},
{k:['customer service','bilingual','spanish','bpo','call center','support'],a:`Frederick has more than 10 years of BPO experience providing phone and chat support, including 5 years and 6 months of Spanish bilingual experience across telecommunications, financial services and healthcare.`},
{k:['automation','zapier','make','n8n','chatgpt','claude','ai '],a:`He uses ChatGPT, Claude, Zapier, Make and n8n to reduce repetitive research and admin work.`},
{k:['training','certificate','certified','course','learn'],a:`He completed a 6-week intensive Online Arbitrage VA training with The Ultimate VA for Online Arbitrage. See <a href="#training">Hands-on Training &amp; Research Experience</a>.`},
{k:['communicat','slack','asana','discord','update'],a:`He works through Slack, Asana, Discord or email, whichever you prefer, and shares a status update before you have to ask.`},
{k:['where','location','based','philippines','bulacan','plaridel'],a:`Frederick is based in Plaridel, Bulacan, Philippines.`},
{k:[' rate',' price','pricing','how much','charge',' fee','quote','hourly','per hour','budget',' cost'],a:`Rates depend on the service. Online arbitrage product research starts at $3/hour. For automation-related services, the rate depends on the needs of the job. ${HIRE}`},
{k:['available','availability','what time','schedule','working hours','hours','time zone','timezone','monday','saturday','when can'],a:`Frederick is available Monday to Saturday, 8:00 AM to 9:00 PM Philippine time (PHT, UTC+8). To book a time, <a href="#schedule">request a meeting</a>.`},
{k:['hire','meeting','contact','email','whatsapp','reach','message','linkedin','upwork','onlinejobs','book','work with'],a:HIRE}
];
const WELCOME=`Hi! I’m Marcus, the automated assistant for Frederick’s portfolio. Ask me about his services, tools, training or how to hire him.`;
const FALLBACK=`I’m not sure about that one. I can answer questions about his services, tools, criteria, training and FBA experience. For anything else, ${HIRE}`;
let lastFallback=false;   // set by answer(): true when the built-in knowledge could not answer
const clock=()=>new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
function stamp(d){const t=document.createElement('time');t.className='ts';t.dateTime=new Date().toISOString();t.textContent=clock();d.appendChild(t)}
function add(t,c,h){const d=document.createElement('div');d.className='m '+c;const b=document.createElement('div');b.className='mt';if(h)b.innerHTML=fixLinks(t);else b.textContent=t;d.appendChild(b);stamp(d);ms.appendChild(d);ms.scrollTop=ms.scrollHeight}
/* Keep links in bot answers in sync with the contact links configured by the owner. */
function fixLinks(html){const api=window.contactsApi;if(!api)return html;const em=api.get('email'),wa=api.get('whatsapp');
html=em?html.replace(/mailto:[^"?]*/g,em.href):html.replace(/<a href="mailto:[^"]*"[^>]*>email Frederick<\/a>, /g,'');
html=wa?html.replace(/https:\/\/wa\.me\/\d+/g,wa.href):html.replace(/message him on <a href="https:\/\/wa\.me[^"]*"[^>]*>WhatsApp<\/a>, /g,'');return html}
function answer(q){lastFallback=false;const s=' '+q.toLowerCase()+' ';
if(/^\s*(hi|hello|hey)\b/i.test(q))return WELCOME;
if(/\b(thanks|thank you)\b/.test(s))return `You’re welcome! ${HIRE}`;
let best=null,top=0;for(const e of KB){let n=0;for(const k of e.k)if(s.includes(k))n+=k.length>=12?2:1;if(n>top){top=n;best=e}}
lastFallback=!best;return best?best.a:FALLBACK}
const SID=Math.random().toString(36).slice(2),HIST=[];
async function viaHook(q){const c=new AbortController(),t=setTimeout(()=>c.abort(),20000);
try{const r=await fetch(window.chatHook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:q,sessionId:SID,history:HIST.slice(-10),page:location.href}),signal:c.signal});
if(!r.ok)throw 0;const ct=r.headers.get('content-type')||'';let x=ct.includes('json')?await r.json():await r.text();
if(Array.isArray(x))x=x[0];if(x&&typeof x==='object')x=x.reply??x.output??x.text??x.message??x.response;
if(typeof x!=='string'||!x.trim())throw 0;return x.trim()}finally{clearTimeout(t)}}
function esc(s){return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
let chain=Promise.resolve();
const wait=t=>new Promise(r=>setTimeout(r,t));
function typing(){const w=document.createElement('div');w.className='m bot typing';w.innerHTML='<span class="dots" aria-hidden="true"><span></span><span></span><span></span></span><span class="sr">Typing\u2026</span>';ms.appendChild(w);ms.scrollTop=ms.scrollHeight;return w}
const recordedQ=new Set();   // one record per distinct question per visit
function trackUnanswered(q,text){if(typeof window.recordUnanswered!=='function')return;const k=q.trim().toLowerCase();if(recordedQ.has(k))return;recordedQ.add(k);const us=HIST.filter(m=>m.role==='user'),prev=us.length>1?us[us.length-2].content:'';window.recordUnanswered({question:q,response:text,sessionId:SID,context:prev})}
async function reply(q){const w=typing();let a=null,html=true;
if(window.chatHook){try{a=await viaHook(q);html=false}catch(e){}}
if(a==null){if(!window.chatHook)await wait(2000+Math.random()*2000);a=answer(q);html=true}
const unanswered=html&&lastFallback;
w.classList.remove('typing');w.textContent='';
const b=document.createElement('div');b.className='mt';
if(html)b.innerHTML=fixLinks(a);else b.innerHTML=esc(a).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\n/g,'<br>');
w.append(b);stamp(w);
HIST.push({role:'assistant',content:b.textContent});
if(unanswered)trackUnanswered(q,b.textContent);
ms.scrollTop=ms.scrollHeight}
function ask(q){q=q.trim();if(!q)return;add(q,'me');HIST.push({role:'user',content:q});chain=chain.then(()=>reply(q)).catch(()=>{})}
function setChat(o){cp.classList.toggle('open',o);bt.setAttribute('aria-expanded',o);bt.setAttribute('aria-label',o?'Close Marcus - Assistant chat':'Open Marcus - Assistant chat');if(o){if(!ms.children.length)add(WELCOME,'bot');ci.focus()}}
bt.addEventListener('click',()=>setChat(!cp.classList.contains('open')));
document.getElementById('chatClose').addEventListener('click',()=>{setChat(false);bt.focus()});
document.getElementById('chatForm').addEventListener('submit',e=>{e.preventDefault();ask(ci.value);ci.value=''});
ms.addEventListener('click',e=>{if(e.target.closest('a[href^="#"]'))setChat(false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&cp.classList.contains('open'))setChat(false)});
