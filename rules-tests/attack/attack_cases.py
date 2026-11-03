import sys, copy, re, os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from rules_sim import Sim, TS
ROOT=sys.argv[1]; NOW=1_800_000_000_000
res=[]
def chk(n,ok,info=''): res.append((n,bool(ok))); print(('PASS ' if ok else 'FAIL ')+n+((' | '+str(info)[:200]) if (info and not ok) else ''))
TXT=open(ROOT+'/firestore.rules').read(); STRICT=open(ROOT+'/firestore.rules.strict').read()
S=Sim(TXT); SS=Sim(STRICT)
UID='3p2YvH4NSVYAAfA0E6HC2kkyc5F3'; EMAIL='fredespinosa86.app@gmail.com'
OWN={'uid':UID,'email':EMAIL}
STRANGER={'uid':'someoneelse123','email':'stranger@gmail.com'}
def A(op,path,auth=None,new=None,old=None,docs=None,sim=S): return sim.allowed(op,path,auth,new,old,docs,NOW)
TSNOW=TS(NOW)
REQ=lambda **k: dict({'name':'Ann','email':'ann@example.com','company':'Acme','date':'2026-12-01','time':'09:00','tz':'Asia/Manila','platform':'Zoom','message':'Hello','status':'new','createdAt':TSNOW},**k)
CHAT=lambda **k: dict({'question':'Do you do FBA?','response':'x','sessionId':'abc123','context':'','status':'new','createdAt':TSNOW},**k)
VIS=lambda **k: dict({'vid':'a'*24,'sid':'b'*24,'type':'view','path':'home','ref':'','device':'desktop','browser':'Chrome','createdAt':TSNOW},**k)
RID='n1'; CID='abc123_x1'; VID='b'*24+'_view_home'
# ---------------- positive controls (the simulator must accept the legitimate cases, otherwise denials mean nothing)
chk('control: visitor can create a valid meeting request',A('create','meetingRequests/'+RID,None,REQ()))
chk('control: visitor can create a valid chat question',A('create','chatUnanswered/'+CID,None,CHAT()))
chk('control: visitor can create a valid visit record',A('create','visits/'+VID,None,VIS()))
chk('control: anyone can read public content and site settings',A('get','content/faq') and A('get','settings/site') and A('list','content'))
chk('control: owner can read and write private data',all(A(o,'clients/c1',OWN,{'a':1},{'a':0}) for o in ('get','create','update','delete')) and A('list','ownerPrivate',OWN))
# ---------------- 1. read private data as a visitor or wrong account
PRIV=['clients','ownerPrivate','meetingRequests','chatUnanswered','activity','visits','library','libraryFull']
for c in PRIV:
    chk(f'visitor cannot get/list {c}',not A('get',c+'/x') and not A('list',c))
    chk(f'signed-in stranger (Google) cannot get/list {c}',not A('get',c+'/x',STRANGER) and not A('list',c,STRANGER))
chk('anonymous-provider account with the owner e-mail cannot read',not A('get','clients/x',dict(OWN,provider='anonymous')))
chk('owner e-mail but not verified cannot read',not A('get','clients/x',dict(OWN,verified=False)))
chk('owner uid on a password provider cannot read',not A('get','clients/x',dict(OWN,provider='password')))
chk('another account that merely claims the owner uid via other provider cannot read',not A('get','clients/x',{'uid':UID,'email':'x@y.z','provider':'github.com'}))
chk('strict rules: owner e-mail with another uid is refused',not A('get','clients/x',{'uid':'other','email':EMAIL},sim=SS) and A('get','clients/x',OWN,sim=SS))
chk('transition rules: owner e-mail with another uid is accepted (documented fallback)',A('get','clients/x',{'uid':'other','email':EMAIL}))
# ---------------- 2. unknown paths / wildcards
for p in ('users/x','admin/x','config/x','meetingRequests/x/private/y','clients/x/notes/y','content/x/sub/y','settings/other','settings/site/x'):
    chk(f'unknown/nested path {p} is denied for visitor read+write',not A('get',p) and not A('create',p,None,{'a':1}))
chk('owner write to an unknown collection is denied too (no catch-all)',not A('create','users/x',OWN,{'a':1}) and not A('create','settings/other',OWN,{'a':1}))
chk('rules file has no catch-all wildcard or "allow ...: if true" for writes',not re.search(r'\{[A-Za-z]+=\*\*\}',TXT) and not re.search(r'allow\s+[^:]*\b(write|create|update|delete)\b[^:]*:\s*if\s+true',TXT))
# ---------------- 3. visitor writes to owner collections / settings
for c,d in (('clients',{'name':'x'}),('ownerPrivate',{'x':1}),('content',{'x':1}),('settings',{'x':1}),('activity',{'text':'x'})):
    p=c+'/site' if c=='settings' else c+'/x'
    chk(f'visitor cannot create/update/delete {p}',not A('create',p,None,d) and not A('update',p,None,d,{'a':1}) and not A('delete',p,None,None,{'a':1}))
    chk(f'stranger cannot create/update/delete {p}',not A('create',p,STRANGER,d) and not A('update',p,STRANGER,d,{'a':1}) and not A('delete',p,STRANGER,None,{'a':1}))
# ---------------- 4. meeting request: extra fields, missing, types, sizes, formats, forged server fields
BAD=[('extra field isAdmin',REQ(isAdmin=True)),('extra field status2',REQ(status2='x')),('missing name',{k:v for k,v in REQ().items() if k!='name'}),('missing message',{k:v for k,v in REQ().items() if k!='message'}),
 ('status confirmed',REQ(status='confirmed')),('status missing quotes type',REQ(status=1)),('createdAt client number',REQ(createdAt=NOW)),('createdAt in the past',REQ(createdAt=TS(NOW-86400000))),('createdAt string',REQ(createdAt='now')),
 ('name empty',REQ(name='')),('name 101 chars',REQ(name='a'*101)),('name list',REQ(name=['a'])),('name number',REQ(name=5)),('name map',REQ(name={'a':1})),
 ('email no @',REQ(email='not-an-email')),('email spaces',REQ(email='a b@c.de')),('email 121 chars',REQ(email='a'*116+'@b.co')),('email too short',REQ(email='a@b')),
 ('message empty',REQ(message='')),('message 2001 chars',REQ(message='x'*2001)),('company 121',REQ(company='c'*121)),('platform 61',REQ(platform='p'*61)),
 ('date wrong format',REQ(date='12/01/2026')),('date with script',REQ(date='2026-12-01<script>')),('date long',REQ(date='2026-12-01'+'0'*50)),('time wrong',REQ(time='9am')),('time injection',REQ(time='09:00;DROP')),
 ('tz with spaces',REQ(tz='Asia Manila')),('tz script',REQ(tz='<script>')),('tz 61',REQ(tz='a'*61)),('service 61',REQ(service='s'*61)),('formId 41',REQ(formId='f'*41)),('formName 101',REQ(formName='f'*101)),('answers 4001',REQ(answers='a'*4001)),('answers number',REQ(answers=5)),
 ('__proto__ field',dict(REQ(),**{'__proto__':'x'})),('nested map extra',REQ(answers={'a':1}))]
for n,d in BAD: chk('meeting request rejected: '+n,not A('create','meetingRequests/'+RID,None,d))
for n,d in (('max-length name 100',REQ(name='a'*100)),('script text in message (stored as text, rendered escaped)',REQ(message='<script>alert(1)</script><img src=x onerror=alert(1)>')),('max message 2000',REQ(message='x'*2000)),('optional fields',REQ(service='s',formId='f',formName='F',answers='a'*4000))):
    chk('control: meeting request accepted: '+n,A('create','meetingRequests/'+RID,None,d))
chk('meeting request cannot be read, updated or deleted by its sender',not A('get','meetingRequests/'+RID) and not A('update','meetingRequests/'+RID,None,REQ(status='confirmed'),REQ()) and not A('delete','meetingRequests/'+RID,None,None,REQ()))
chk('REPLAY: overwriting an existing request with the same id is an update and is refused',not A('update','meetingRequests/'+RID,None,REQ(),REQ()))
# ---------------- 5. chat questions
CB=[('id not tied to session',('create','chatUnanswered/zzz_x1',CHAT())),('id with other session',('create','chatUnanswered/other_x1',CHAT())),('id suffix too long',('create','chatUnanswered/abc123_'+'x'*13,CHAT())),
 ('extra field',('create',f'chatUnanswered/{CID}',CHAT(admin=1))),('question empty',('create',f'chatUnanswered/{CID}',CHAT(question=''))),('question 301',('create',f'chatUnanswered/{CID}',CHAT(question='q'*301))),
 ('response 601',('create',f'chatUnanswered/{CID}',CHAT(response='r'*601))),('context 301',('create',f'chatUnanswered/{CID}',CHAT(context='c'*301))),('status reviewed',('create',f'chatUnanswered/{CID}',CHAT(status='reviewed'))),
 ('createdAt forged',('create',f'chatUnanswered/{CID}',CHAT(createdAt=TS(1)))),('sessionId uppercase',('create','chatUnanswered/ABC_x1',CHAT(sessionId='ABC'))),('sessionId 21 chars',('create','chatUnanswered/'+'a'*21+'_x1',CHAT(sessionId='a'*21)))]
for n,(o,p,d) in CB: chk('chat question rejected: '+n,not A(o,p,None,d))
chk('chat question: replay of same id (update) and reads refused',not A('update',f'chatUnanswered/{CID}',None,CHAT(),CHAT()) and not A('get',f'chatUnanswered/{CID}'))
# ---------------- 6. visits
VB=[('id not derived from fields',('visits/'+'c'*24+'_view_home',VIS())),('type admin',(f'visits/{"b"*24}_admin_home',VIS(type='admin'))),('vid not hex',(VID,VIS(vid='z'*24))),('vid short',(VID,VIS(vid='a'*23))),('sid short',('visits/'+'b'*23+'_view_home',VIS(sid='b'*23))),
 ('path with slash',('visits/'+'b'*24+'_view_a/b',VIS(path='a/b'))),('path 41',('visits/'+'b'*24+'_view_'+'p'*41,VIS(path='p'*41))),('ref 101',(VID,VIS(ref='r'*101))),('device pc',(VID,VIS(device='pc'))),('browser 21',(VID,VIS(browser='b'*21))),
 ('extra field ip',(VID,VIS(ip='1.2.3.4'))),('createdAt forged',(VID,VIS(createdAt=TS(5)))),('missing browser',(VID,{k:v for k,v in VIS().items() if k!='browser'}))]
for n,(p,d) in VB: chk('visit rejected: '+n,not A('create',p,None,d))
chk('visit: replay of same id (update), reads and deletes refused',not A('update','visits/'+VID,None,VIS(),VIS()) and not A('get','visits/'+VID) and not A('delete','visits/'+VID,None,None,VIS()))
chk('visit: owner may read and delete (retention cleanup)',A('get','visits/'+VID,OWN) and A('delete','visits/'+VID,OWN,None,VIS()))
# ---------------- 7. emergency pause, capacity and busy slots (state-dependent rules)
G={'content/guard':{'pause':True}}
chk('PAUSE on: every public create is refused',not A('create','meetingRequests/'+RID,None,REQ(),docs=G) and not A('create','chatUnanswered/'+CID,None,CHAT(),docs=G) and not A('create','visits/'+VID,None,VIS(),docs=G))
chk('PAUSE on: owner can still read and write the panel',A('get','clients/x',OWN,docs=G) and A('update','content/guard',OWN,{'pause':False},{'pause':True},docs=G))
chk('PAUSE off (false or absent): public creates work',A('create','visits/'+VID,None,VIS(),docs={'content/guard':{'pause':False}}) and A('create','visits/'+VID,None,VIS(),docs={}))
chk('guard doc that is not a map-with-pause (string) does not block',A('create','visits/'+VID,None,VIS(),docs={'content/guard':{'pause':'yes'}}))
chk('capacity full (open=false): meeting requests refused, chat and visits still work',not A('create','meetingRequests/'+RID,None,REQ(),docs={'content/capacity':{'open':False}}) and A('create','chatUnanswered/'+CID,None,CHAT(),docs={'content/capacity':{'open':False}}))
chk('busy slot: request for a confirmed time refused; other time accepted',not A('create','meetingRequests/'+RID,None,REQ(),docs={'content/busy':{'keys':['2026-12-01T09:00']}}) and A('create','meetingRequests/'+RID,None,REQ(time='10:00'),docs={'content/busy':{'keys':['2026-12-01T09:00']}}))
# ---------------- 8. owner is still bound by the shape rules for visitor-created collections
chk('owner cannot create a malformed meeting request or forged visit (no back door)',not A('create','meetingRequests/'+RID,OWN,REQ(status='confirmed')) and not A('create','visits/'+VID,OWN,VIS(createdAt=TS(3))))
chk('owner can update and delete requests and chat questions (inbox actions)',A('update','meetingRequests/'+RID,OWN,REQ(status='confirmed'),REQ()) and A('delete','chatUnanswered/'+CID,OWN,None,CHAT()))
# ---------------- 8b. E2: one summary record per visit (sections seen)
SUM=lambda **k: dict(VIS(type='summary',path='sections',ref='',secs=['intro','faq']),**k)
SID='b'*24+'_summary_sections'
for nm,sim in (('transition',S),('strict',SS)):
    chk(f'E2 [{nm}] control: valid summary create',A('create','visits/'+SID,None,SUM(),sim=sim))
    chk(f'E2 [{nm}] control: grow by update (more sections)',A('update','visits/'+SID,None,SUM(secs=['intro','faq','contact']),SUM(),sim=sim))
chk('E2 old per-section records are no longer accepted (type section)',not A('create','visits/'+'b'*24+'_section_faq',None,VIS(type='section',path='faq')))
SB=[('empty list',SUM(secs=[])),('13 entries',SUM(secs=['intro']*13)),('unknown id',SUM(secs=['admin'])),('script id',SUM(secs=['<script>'])),
 ('not a list',SUM(secs='intro')),('number',SUM(secs=5)),('map',SUM(secs={'a':1})),('extra field',SUM(extra='x')),('missing secs',{k:v for k,v in SUM().items() if k!='secs'}),
 ('path not sections',SUM(path='faq')),('type view with secs',SUM(type='view')),('ref filled',SUM(ref='evil.example')),('device pc',SUM(device='pc')),
 ('browser 21',SUM(browser='b'*21)),('forged time',SUM(createdAt=TS(NOW-9999999))),('vid bad',SUM(vid='z'*24)),('sid bad',SUM(sid='z'*24)),('mixed case id in list',SUM(secs=['Intro']))]
for n,d in SB: chk('E2 summary refused: '+n,not A('create','visits/'+SID,None,d))
chk('E2 summary refused: id not derived from sid',not A('create','visits/'+'c'*24+'_summary_sections',None,SUM()))
chk('E2 summary refused: id with other suffix',not A('create','visits/'+'b'*24+'_summary_x',None,SUM()))
chk('E2 summary refused: owner cannot forge one either',not A('create','visits/'+SID,OWN,SUM(createdAt=TS(NOW-5))))
G2=dict(SUM(secs=['intro','faq']))
UB=[('shrink',SUM(secs=['intro'])),('same size',SUM(secs=['intro','faq'])),('replace one',SUM(secs=['intro','contact'])),('drop one add two',SUM(secs=['intro','contact','services'])),
 ('unknown id added',SUM(secs=['intro','faq','admin'])),('13 entries',SUM(secs=['intro','faq']+['contact']*11)),('change vid',SUM(vid='c'*24,secs=['intro','faq','contact'])),
 ('change sid',SUM(sid='c'*24,secs=['intro','faq','contact'])),('change device',SUM(device='mobile',secs=['intro','faq','contact'])),('change browser',SUM(browser='Evil',secs=['intro','faq','contact'])),
 ('change ref',SUM(ref='x.com',secs=['intro','faq','contact'])),('change createdAt',SUM(createdAt=TS(NOW-1),secs=['intro','faq','contact'])),('change type',SUM(type='view',secs=['intro','faq','contact'])),
 ('extra field',SUM(x=1,secs=['intro','faq','contact'])),('secs not list',SUM(secs='intro'))]
for n,d in UB: chk('E2 summary update refused: '+n,not A('update','visits/'+SID,None,d,G2))
chk('E2 view record still cannot be updated (replay)',not A('update','visits/'+VID,None,VIS(browser='Safari'),VIS()))
chk('E2 view record cannot be turned into a summary by update',not A('update','visits/'+VID,None,SUM(),VIS()))
chk('E2 summary: visitor cannot read or delete; owner can',not A('get','visits/'+SID) and not A('delete','visits/'+SID,None,None,SUM()) and A('get','visits/'+SID,OWN) and A('delete','visits/'+SID,OWN,None,SUM()))
GP={'content/guard':{'pause':True}}
chk('E2 PAUSE on: summary create and update are refused',not A('create','visits/'+SID,None,SUM(),docs=GP) and not A('update','visits/'+SID,None,SUM(secs=['intro','faq','contact']),SUM(),docs=GP))
# ---------------- 8c. E3: private image library (owner only, shape and size limited)
LIBR=lambda **k: dict({'name':'Hero','tags':['a'],'mime':'image/webp','w':1200,'h':800,'bytes':120000,'hash':'a'*64,'thumb':'data:image/webp;base64,AAAA','used':0,'usedIn':[],'createdAt':NOW},**k)
FULL=lambda **k: dict({'data':'data:image/webp;base64,UklGRg==','bytes':100},**k)
for nm,sim in (('transition',S),('strict',SS)):
    chk(f'E3 [{nm}] control: owner can create, read, update, delete a library record',all([A('create','library/i1',OWN,LIBR(),sim=sim),A('get','library/i1',OWN,sim=sim),A('list','library',OWN,sim=sim),A('update','library/i1',OWN,LIBR(name='New'),LIBR(),sim=sim),A('delete','library/i1',OWN,None,LIBR(),sim=sim)]))
    chk(f'E3 [{nm}] control: owner can create, read, delete a full picture',all([A('create','libraryFull/i1',OWN,FULL(),sim=sim),A('get','libraryFull/i1',OWN,sim=sim),A('delete','libraryFull/i1',OWN,None,FULL(),sim=sim)]))
    for who,au in (('visitor',None),('stranger',STRANGER)):
        chk(f'E3 [{nm}] {who}: no read, list, create, update or delete on library or libraryFull',not any([A(o,p,au,d,old,sim=sim) for p,d,old in (('library/i1',LIBR(),LIBR()),('libraryFull/i1',FULL(),FULL())) for o in ('get','create','update','delete')]+[A('list','library',au,sim=sim),A('list','libraryFull',au,sim=sim)]))
LB=[('extra field',LIBR(x=1)),('missing field',{k:v for k,v in LIBR().items() if k!='hash'}),('empty name',LIBR(name='')),('name 81',LIBR(name='n'*81)),('name number',LIBR(name=5)),
 ('tags 11',LIBR(tags=['t']*11)),('tags string',LIBR(tags='a')),('svg mime',LIBR(mime='image/svg+xml')),('png mime',LIBR(mime='image/png')),('html mime',LIBR(mime='text/html')),
 ('w 0',LIBR(w=0)),('w 4001',LIBR(w=4001)),('h 0',LIBR(h=0)),('h 4001',LIBR(h=4001)),('bytes 0',LIBR(bytes=0)),('bytes 262145',LIBR(bytes=262145)),('bytes string',LIBR(bytes='9')),
 ('hash 65',LIBR(hash='a'*65)),('thumb 24001',LIBR(thumb='t'*24001)),('thumb number',LIBR(thumb=1)),('usedIn 9',LIBR(usedIn=['x']*9)),('used string',LIBR(used='1')),('createdAt string',LIBR(createdAt='now'))]
for n,d in LB: chk('E3 library record refused: '+n,not A('create','library/i1',OWN,d) and not A('create','library/i1',OWN,d,sim=SS))
FB=[('svg data',FULL(data='data:image/svg+xml;base64,PHN2Zz4=')),('html data',FULL(data='data:text/html;base64,AAAA')),('png data',FULL(data='data:image/png;base64,AAAA')),('script chars',FULL(data='data:image/webp;base64,AA<script>')),
 ('no prefix',FULL(data='https://evil.example/x.webp')),('empty payload',FULL(data='data:image/webp;base64,')),('size 360001',FULL(data='data:image/webp;base64,'+'A'*(360001-23))),('data number',FULL(data=5)),
 ('bytes 262145',FULL(bytes=262145)),('bytes string',FULL(bytes='1')),('extra field',FULL(x=1)),('missing bytes',{'data':'data:image/webp;base64,UklGRg=='}),('missing data',{'bytes':1})]
for n,d in FB: chk('E3 full picture refused: '+n,not A('create','libraryFull/i1',OWN,d) and not A('create','libraryFull/i1',OWN,d,sim=SS))
chk('E3 full picture at exactly the size limit is accepted',A('create','libraryFull/i1',OWN,FULL(data='data:image/webp;base64,'+'A'*(360000-23))))
# ---------------- 9. cross-check: strict file equals transition file apart from the owner check
a=re.sub(r'\s+','',TXT); b=re.sub(r'\s+','',re.sub(r'^//.*\n','',STRICT,flags=re.M))
chk('strict rules differ from the transition rules only in the owner e-mail fallback',a.replace("&&(request.auth.uid==ownerUid()||request.auth.token.email=='fredespinosa86.app@gmail.com');","&&request.auth.uid==ownerUid();")==b,'')
bad=[n for n,o in res if not o]; print(f'{len(res)-len(bad)}/{len(res)} passed'); sys.exit(1 if bad else 0)
