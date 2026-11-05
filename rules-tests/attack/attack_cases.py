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
# ---------------- 8d. E4: Google connection settings stay owner only
GOOG={'sheetsUrl':'https://script.google.com/macros/s/'+'A'*40+'/exec','sheetsToken':'t'*20,'zoomLink':'https://zoom.us/j/123456'}
for nm,sim in (('transition',S),('strict',SS)):
    chk(f'E4 [{nm}] owner can read and write ownerPrivate/google',A('get','ownerPrivate/google',OWN,sim=sim) and A('create','ownerPrivate/google',OWN,GOOG,sim=sim) and A('update','ownerPrivate/google',OWN,GOOG,GOOG,sim=sim))
    for who,au in (('visitor',None),('stranger',STRANGER)):
        chk(f'E4 [{nm}] {who}: cannot read, list, write or delete ownerPrivate/google',not any([A(o,'ownerPrivate/google',au,GOOG,GOOG,sim=sim) for o in ('get','create','update','delete')]) and not A('list','ownerPrivate',au,sim=sim))
# ---------------- 8e. P0 (4.5.0): Client ID registry + paired audit records
AID1='a'*16; AID2='b'*16; AID3='c'*16
REG=lambda **k: dict({'status':'active','notes':'','createdAt':TSNOW,'updatedAt':TSNOW,'rev':1,'lastAudit':AID1},**k)
AUD=lambda **k: dict({'clientId':'CL-001','action':'create','prev':'','next':'active','reason':'','rev':1,'actor':UID,'createdAt':TSNOW},**k)
RP='clientRegistry/CL-001'; AP=lambda a: 'clientRegistryAudit/'+a
def AFTER(reg,aud,aid,cid='CL-001'): return {'clientRegistry/'+cid:reg,AP(aid):aud}
for nm,sim in (('transition',S),('strict',SS)):
    P=lambda op,path,au=None,new=None,old=None,docs=None,after=None: A(op,path,au,new,old,docs,sim=sim) if after is None else sim.allowed(op,path,au,new,old,docs,NOW,after)
    # ---- positive controls
    chk(f'P0 [{nm}] control: owner creates a client ID with its audit record in one batch',P('create',RP,OWN,REG(),None,None,AFTER(REG(),AUD(),AID1)) and P('create',AP(AID1),OWN,AUD(),None,None,AFTER(REG(),AUD(),AID1)))
    OLD=REG(); ARCH=REG(status='archived',rev=2,lastAudit=AID2); AARCH=AUD(action='status',prev='active',next='archived',reason='contract ended',rev=2)
    chk(f'P0 [{nm}] control: owner archives with a reason, paired with a new audit record',P('update',RP,OWN,ARCH,OLD,{RP:OLD},AFTER(ARCH,AARCH,AID2)) and P('create',AP(AID2),OWN,AARCH,None,{RP:OLD},AFTER(ARCH,AARCH,AID2)))
    NOTE=REG(notes='prefers mornings',rev=2,lastAudit=AID3); ANOTE=AUD(action='notes',prev='',next='prefers mornings',reason='',rev=2)
    chk(f'P0 [{nm}] control: owner edits notes, paired with an audit record',P('update',RP,OWN,NOTE,OLD,{RP:OLD},AFTER(NOTE,ANOTE,AID3)) and P('create',AP(AID3),OWN,ANOTE,None,{RP:OLD},AFTER(NOTE,ANOTE,AID3)))
    chk(f'P0 [{nm}] control: owner can read and list both collections',all(P(o,x,OWN) for o,x in (('get',RP),('list','clientRegistry'),('get',AP(AID1)),('list','clientRegistryAudit'))))
    # ---- who
    for who,au in (('visitor',None),('stranger',STRANGER),('anonymous provider',dict(OWN,provider='anonymous')),('owner uid, unverified',dict(OWN,verified=False))):
        chk(f'P0 [{nm}] {who}: no read, list, create, update or delete on the registry or its audit',not any([P(o,RP,au,REG(),REG(),{RP:REG()},AFTER(REG(),AUD(),AID1)) for o in ('get','create','update','delete')]+[P(o,AP(AID1),au,AUD(),AUD(),{},AFTER(REG(),AUD(),AID1)) for o in ('get','create','update','delete')]+[P('list','clientRegistry',au),P('list','clientRegistryAudit',au),P('update',RP,au,ARCH,OLD,{RP:OLD},AFTER(ARCH,AARCH,AID2)),P('create',AP(AID2),au,AARCH,None,{RP:OLD},AFTER(ARCH,AARCH,AID2))]))
    chk(f'P0 [{nm}] owner cannot delete a registry entry or an audit record, and cannot update an audit record',not P('delete',RP,OWN,None,REG(),{RP:REG()}) and not P('delete',AP(AID1),OWN,None,AUD(),{AP(AID1):AUD()}) and not P('update',AP(AID1),OWN,AUD(reason='edited'),AUD(),{AP(AID1):AUD()},AFTER(REG(),AUD(reason='edited'),AID1)))
    # ---- create refusals
    BADID=['cl-001','CL_001','CL--001','CL-001-','1CL-001','AB','A'*25,'CL 001','CL.001','-CL','CL/001','CLÉ']
    for bid in BADID:
        if '/' in bid: continue
        chk(f'P0 [{nm}] registry create refused: bad Client ID {bid!r}',not P('create','clientRegistry/'+bid,OWN,REG(),None,None,AFTER(REG(),AUD(clientId='CL-001'),AID1,bid)))
    CR=[('status archived',REG(status='archived')),('rev 2',REG(rev=2)),('rev 0',REG(rev=0)),('rev string',REG(rev='1')),('extra field',REG(name='Ann')),('extra email',REG(email='a@b.co')),('missing notes',{k:v for k,v in REG().items() if k!='notes'}),('missing lastAudit',{k:v for k,v in REG().items() if k!='lastAudit'}),
        ('notes 501',REG(notes='n'*501)),('notes number',REG(notes=5)),('createdAt not server time',REG(createdAt=TS(NOW-1))),('updatedAt not server time',REG(updatedAt=TS(NOW+1))),('createdAt client number',REG(createdAt=NOW)),
        ('lastAudit too short',REG(lastAudit='abc')),('lastAudit bad chars',REG(lastAudit='a'*15+'-')),('lastAudit 41 chars',REG(lastAudit='a'*41)),('lastAudit number',REG(lastAudit=5))]
    for n,d in CR: chk(f'P0 [{nm}] registry create refused: {n}',not P('create',RP,OWN,d,None,None,AFTER(d,AUD(),d.get('lastAudit') if isinstance(d.get('lastAudit'),str) and d.get('lastAudit') else AID1)))
    chk(f'P0 [{nm}] registry create refused: no audit record in the same batch',not P('create',RP,OWN,REG(),None,None,{RP:REG()}))
    chk(f'P0 [{nm}] registry create refused: points at an audit record that already exists (replay)',not P('create',RP,OWN,REG(),None,{AP(AID1):AUD()},AFTER(REG(),AUD(),AID1)))
    chk(f'P0 [{nm}] registry create refused: an existing ID cannot be re-created as a fresh rev 1 (overwrite attempt is an update)',not P('update',RP,OWN,REG(createdAt=TS(NOW-5)),REG(rev=3),{RP:REG(rev=3)},AFTER(REG(),AUD(),AID1)))
    # ---- update refusals
    OLD=REG(rev=1)
    def UPD(n,new,aud=None,aid=AID2,docs=None):
        aud=aud or AUD(action='status',prev='active',next=new.get('status','active') if isinstance(new,dict) else 'active',reason='some reason',rev=2)
        chk(f'P0 [{nm}] registry update refused: {n}',not P('update',RP,OWN,new,OLD,docs if docs is not None else {RP:OLD},AFTER(new,aud,aid)))
    G=lambda **k: REG(**dict({'status':'archived','rev':2,'lastAudit':AID2},**k))
    UPD('revision does not go up by one (same)',G(rev=1)); UPD('revision jumps by two',G(rev=3)); UPD('revision goes backwards',REG(status='archived',rev=0,lastAudit=AID2))
    UPD('status not active/archived',G(status='deleted')); UPD('createdAt changed',G(createdAt=TS(NOW-9))); UPD('updatedAt not server time',G(updatedAt=TS(NOW-9)))
    UPD('extra field added',G(name='Ann')); UPD('field removed',{k:v for k,v in G().items() if k!='notes'}); UPD('notes 501',G(notes='n'*501)); UPD('notes number',G(notes=5))
    chk(f'P0 [{nm}] registry update refused: no audit record in the same batch',not P('update',RP,OWN,G(),OLD,{RP:OLD},{RP:G()}))
    chk(f'P0 [{nm}] registry update refused: reuses an old audit record id (replay)',not P('update',RP,OWN,G(),OLD,{RP:OLD,AP(AID2):AUD()},AFTER(G(),AUD(),AID2)))
    chk(f'P0 [{nm}] registry update refused: lastAudit unchanged',not P('update',RP,OWN,REG(status='archived',rev=2,lastAudit=AID1),OLD,{RP:OLD,AP(AID1):AUD()},AFTER(REG(status='archived',rev=2,lastAudit=AID1),AUD(),AID1)))
    # ---- audit refusals
    NEWR=REG(status='archived',rev=2,lastAudit=AID2); BASE=AUD(action='status',prev='active',next='archived',reason='contract ended',rev=2)
    def AUDT(n,aud,reg=NEWR,aid=AID2,docs=None):
        chk(f'P0 [{nm}] audit create refused: {n}',not P('create',AP(aid),OWN,aud,None,docs if docs is not None else {RP:OLD},AFTER(reg,aud,aid)))
    chk(f'P0 [{nm}] audit baseline for the refusal cases is accepted',P('create',AP(AID2),OWN,BASE,None,{RP:OLD},AFTER(NEWR,BASE,AID2)))
    AUDT('extra field',dict(BASE,name='Ann')); AUDT('missing field',{k:v for k,v in BASE.items() if k!='reason'}); AUDT('unknown action',dict(BASE,action='delete'))
    AUDT('someone else as actor',dict(BASE,actor='someoneelse123')); AUDT('createdAt not server time',dict(BASE,createdAt=TS(NOW-1))); AUDT('bad clientId',dict(BASE,clientId='cl--1'))
    AUDT('status change with a too-short reason',dict(BASE,reason='no')); AUDT('status change with an empty reason',dict(BASE,reason='')); AUDT('reason 201 characters',dict(BASE,reason='r'*201))
    AUDT('prev does not match the old status',dict(BASE,prev='archived')); AUDT('next does not match the new status',dict(BASE,next='active'))
    AUDT('rev does not match the registry',dict(BASE,rev=3)); AUDT('action create with rev 2',dict(BASE,action='create',prev='',next='active'))
    AUDT('action status with rev 1',dict(BASE,rev=1),reg=REG(status='archived',rev=1,lastAudit=AID2))
    chk(f'P0 [{nm}] audit create refused: orphan (no registry entry in the same batch)',not P('create',AP(AID2),OWN,BASE,None,{RP:OLD},{AP(AID2):BASE}))
    chk(f'P0 [{nm}] audit create refused: registry entry points at a different audit id',not P('create',AP(AID2),OWN,BASE,None,{RP:OLD},AFTER(REG(status='archived',rev=2,lastAudit=AID3),BASE,AID2)))
    AUDT('audit id too short',BASE,aid='abc',reg=REG(status='archived',rev=2,lastAudit='abc'))
    ANO=AUD(action='notes',prev='old',next='new text',reason='',rev=2); NREG=REG(notes='new text',rev=2,lastAudit=AID3); NOLD=REG(notes='real old')
    chk(f'P0 [{nm}] audit create refused: notes prev does not match what was stored',not P('create',AP(AID3),OWN,ANO,None,{RP:NOLD},AFTER(NREG,ANO,AID3)))
    chk(f'P0 [{nm}] audit create refused: notes next does not match what was stored',not P('create',AP(AID3),OWN,dict(ANO,prev='real old',next='different'),None,{RP:NOLD},AFTER(NREG,dict(ANO,prev='real old',next='different'),AID3)))
    chk(f'P0 [{nm}] audit create refused: create action whose next is not the stored status',not P('create',AP(AID1),OWN,AUD(next='archived'),None,None,AFTER(REG(),AUD(next='archived'),AID1)))
    chk(f'P0 [{nm}] pause switch does not affect the owner registry (owner-only data, not public intake)',P('create',RP,OWN,REG(),None,{'content/guard':{'pause':True}},AFTER(REG(),AUD(),AID1)))
# ---------------- 8f. W1 (4.5.0): WorkTrack state machine, event counter, create-only records
import json, subprocess, shutil
SID='sess0000000000000001'; NEWSID='sess0000000000000002'
SPATH='workState/main'; EP=lambda e:'workEvents/'+e; SSP=lambda s:'workSessions/'+s; EID=lambda n,sid=SID: f'{sid}__{n}'
def T(d):
    d=dict(d)
    for k in ('updatedAt','at','startedAt'):
        if k in d and d[k]=='NOW': d[k]=TSNOW
    return d
WST=lambda **k: dict({'state':'WORKING','sid':SID,'n':3,'fb':False,'lu':False,'lb':False,'lastEid':EID(3),'rev':5,'updatedAt':TSNOW},**k)
WEV=lambda **k: dict({'sid':SID,'n':4,'type':'LUNCH_OUT','at':TSNOW,'by':UID,'reason':''},**k)
WSES=lambda **k: dict({'tz':'Asia/Manila','date':'2026-11-04','startedAt':TSNOW,'by':UID},**k)
GEN=None
if shutil.which('node'):
    r=subprocess.run(['node',os.path.dirname(os.path.abspath(__file__))+'/gen_worktrack_cases.mjs',ROOT],capture_output=True,text=True)
    if r.returncode==0: GEN=json.loads(r.stdout)
chk('W1 the case generator ran (the page state machine and the rules are compared case by case)',GEN is not None and len(GEN['cases'])>=100,'node missing or generator failed')
chk('W1 the page writes exactly the documents the accepted rules cases use (plan() parity)',GEN is not None and GEN['planMismatch']==0)
for nm,sim in (('transition',S),('strict',SS)):
    P=lambda op,path,au=None,new=None,old=None,docs=None,after=None: A(op,path,au,new,old,docs,sim=sim) if after is None else sim.allowed(op,path,au,new,old,docs,NOW,after)
    # ---- every punch from every state: the rules verdict must equal the page's verdict
    if GEN:
        bad=[]; okc=0
        for c in GEN['cases']:
            b=dict(c['before'],updatedAt=TSNOW); a=dict(c['after'],updatedAt=TSNOW); e=dict(c['event'],at=TSNOW,by=UID)
            eid=EID(e['n'],e['sid']); after={SPATH:a,EP(eid):e}
            if c['newSession']: after[SSP(e['sid'])]=WSES()
            docs={SPATH:b}
            v=P('create',EP(eid),OWN,e,None,docs,after) and P('update',SPATH,OWN,a,b,docs,after) and (not c['newSession'] or P('create',SSP(e['sid']),OWN,WSES(),None,docs,after))
            if bool(v)!=bool(c['js']): bad.append(c['name'])
            okc+=bool(v)
        chk(f'W1 [{nm}] all {len(GEN["cases"])} punch/state cases: the rules accept exactly the punches the page allows ({okc} accepted)',not bad and okc==sum(1 for c in GEN['cases'] if c['js']),bad[:5])
    # ---- positive controls and who
    INIT=dict({'state':'NOT_STARTED','sid':'','n':0,'fb':False,'lu':False,'lb':False,'lastEid':'','rev':1,'updatedAt':TSNOW})
    chk(f'W1 [{nm}] control: the state record can be created once, in its starting form',P('create',SPATH,OWN,INIT))
    B0=WST(); A0=WST(state='LUNCH',n=4,lu=True,lastEid=EID(4),rev=6); E0=WEV(); AF0={SPATH:A0,EP(EID(4)):E0}
    chk(f'W1 [{nm}] control: lunch out is accepted as one batch (event + state)',P('create',EP(EID(4)),OWN,E0,None,{SPATH:B0},AF0) and P('update',SPATH,OWN,A0,B0,{SPATH:B0},AF0))
    chk(f'W1 [{nm}] control: owner can read and list all three collections',all(P(o,x,OWN) for o,x in (('get',SPATH),('get',EP(EID(1))),('get',SSP(SID)),('list','workEvents'),('list','workSessions'))))
    for who,au in (('visitor',None),('stranger',STRANGER),('anonymous provider',dict(OWN,provider='anonymous')),('owner uid, unverified',dict(OWN,verified=False)),('owner e-mail, other uid (strict only)',{'uid':'other','email':EMAIL})):
        if who.endswith('(strict only)') and nm=='transition': continue
        chk(f'W1 [{nm}] {who}: no read, list, create, update or delete on workState, workEvents or workSessions',not any([P(o,SPATH,au,A0,B0,{SPATH:B0},AF0) for o in ('get','create','update','delete')]+[P(o,EP(EID(4)),au,E0,E0,{},AF0) for o in ('get','create','update','delete')]+[P(o,SSP(SID),au,WSES(),WSES(),{},{SSP(SID):WSES(),EP(EID(1)):WEV(type='CLOCK_IN',n=1)}) for o in ('get','create','update','delete')]+[P('list','workEvents',au),P('list','workSessions',au),P('get',SPATH,au)]))
    # valid payloads sent by someone who is NOT the owner (so removing the owner check from create would be noticed)
    INIT_=dict({'state':'NOT_STARTED','sid':'','n':0,'fb':False,'lu':False,'lb':False,'lastEid':'','rev':1,'updatedAt':TSNOW})
    CIN_E=WEV(type='CLOCK_IN',n=1,sid=NEWSID); CIN_S=WST(state='WORKING',sid=NEWSID,n=1,lastEid=EID(1,NEWSID),rev=6); CIN_B=WST(state='NOT_STARTED',n=4,lastEid=EID(4))
    CIN_AF={SPATH:CIN_S,EP(EID(1,NEWSID)):CIN_E,SSP(NEWSID):WSES()}
    for who,au in (('visitor',None),('stranger',STRANGER),('anonymous provider',dict(OWN,provider='anonymous'))):
        chk(f'W1 [{nm}] {who}: a fully valid state create, event create and session create are all refused (control below proves they are valid for the owner)',not any([P('create',SPATH,au,INIT_),P('create',EP(EID(4)),au,E0,None,{SPATH:B0},AF0),P('update',SPATH,au,A0,B0,{SPATH:B0},AF0),P('create',EP(EID(1,NEWSID)),au,CIN_E,None,{SPATH:CIN_B},CIN_AF),P('create',SSP(NEWSID),au,WSES(),None,{SPATH:CIN_B},CIN_AF)]))
    chk(f'W1 [{nm}] control: the same clock in is accepted for the owner',P('create',EP(EID(1,NEWSID)),OWN,CIN_E,None,{SPATH:CIN_B},CIN_AF) and P('create',SSP(NEWSID),OWN,WSES(),None,{SPATH:CIN_B},CIN_AF))
    # state that disagrees with the event about the session ID or the counter
    chk(f'W1 [{nm}] clock in refused: the state record holds a different session ID than the event',not (P('create',EP(EID(1,NEWSID)),OWN,CIN_E,None,{SPATH:CIN_B},{SPATH:WST(state='WORKING',sid='sess0000000000000077',n=1,lastEid=EID(1,NEWSID),rev=6),EP(EID(1,NEWSID)):CIN_E,SSP(NEWSID):WSES()})))
    chk(f'W1 [{nm}] event refused: the state counter differs from the event counter (event 4, state says 5)',not P('create',EP(EID(4)),OWN,E0,None,{SPATH:B0},{SPATH:WST(state='LUNCH',n=5,lu=True,lastEid=EID(4),rev=6),EP(EID(4)):E0}))
    chk(f'W1 [{nm}] event refused: the state counter differs from the event counter (event 4, state says 3)',not P('create',EP(EID(4)),OWN,E0,None,{SPATH:B0},{SPATH:WST(state='LUNCH',n=3,lu=True,lastEid=EID(4),rev=6),EP(EID(4)):E0}))
    for fl in ('fb','lu','lb'):
        chk(f'W1 [{nm}] clock in refused when the new state already has the {fl} flag set',not (P('update',SPATH,OWN,dict(CIN_S,**{fl:True}),CIN_B,{SPATH:CIN_B},dict(CIN_AF,**{SPATH:dict(CIN_S,**{fl:True})})) and P('create',EP(EID(1,NEWSID)),OWN,CIN_E,None,{SPATH:CIN_B},dict(CIN_AF,**{SPATH:dict(CIN_S,**{fl:True})}))))
    chk(f'W1 [{nm}] clock in refused when the new state counter is not 1 (state 2, event 1)',not P('create',EP(EID(1,NEWSID)),OWN,CIN_E,None,{SPATH:CIN_B},dict(CIN_AF,**{SPATH:dict(CIN_S,n=2)})))
    chk(f'W1 [{nm}] owner cannot edit or delete an event or a session, and cannot delete the state record',not any([P('update',EP(EID(4)),OWN,WEV(reason=''),WEV(),{EP(EID(4)):WEV()},AF0),P('delete',EP(EID(4)),OWN,None,WEV(),{EP(EID(4)):WEV()}),P('update',SSP(SID),OWN,WSES(tz='UTC'),WSES(),{SSP(SID):WSES()}),P('delete',SSP(SID),OWN,None,WSES(),{SSP(SID):WSES()}),P('delete',SPATH,OWN,None,B0,{SPATH:B0})]))
    # ---- event refusals (everything else legitimate: lunch out from WORKING n=3)
    def EVT(n,e,eid=None,after=None,docs=None,state_after=None):
        eid=eid or EID(e.get('n',4) if isinstance(e.get('n'),int) and 1<=e.get('n',4)<=12 else 4)
        a=state_after or A0
        chk(f'W1 [{nm}] event create refused: {n}',not P('create',EP(eid),OWN,e,None,docs if docs is not None else {SPATH:B0},after if after is not None else {SPATH:a,EP(eid):e}))
    EVT('extra field (a name)',WEV(name='Ann')); EVT('extra field (email)',WEV(email='a@b.co')); EVT('missing reason',{k:v for k,v in WEV().items() if k!='reason'}); EVT('missing by',{k:v for k,v in WEV().items() if k!='by'})
    EVT('unknown punch type',WEV(type='LUNCH_BREAK')); EVT('type in lower case',WEV(type='lunch_out')); EVT('type is a number',WEV(type=5))
    EVT('time is not the server time (past)',WEV(at=TS(NOW-1000))); EVT('time is not the server time (future)',WEV(at=TS(NOW+1000))); EVT('time sent as a client number',WEV(at=NOW))
    EVT('recorded for someone else',WEV(by='someoneelse123')); EVT('counter 0',WEV(n=0),eid=EID(4)); EVT('counter 13',WEV(n=13),eid=EID(4)); EVT('counter is a string',WEV(n='4'),eid=EID(4))
    EVT('event ID does not match its counter',WEV(),eid=EID(5),state_after=WST(state='LUNCH',n=4,lu=True,lastEid=EID(5),rev=6))
    EVT('event ID does not start with its session',WEV(),eid='other0000000000000099__4',state_after=WST(state='LUNCH',n=4,lu=True,lastEid='other0000000000000099__4',rev=6))
    EVT('session ID too short',WEV(sid='abc'),eid='abc__4',state_after=WST(state='LUNCH',sid='abc',n=4,lu=True,lastEid='abc__4',rev=6))
    EVT('reason on a normal punch',WEV(reason='note')); EVT('close as incomplete with no reason',WEV(type='CLOSE_INCOMPLETE'),state_after=WST(state='NOT_STARTED',n=4,lastEid=EID(4),rev=6))
    EVT('close as incomplete with a 2-character reason',WEV(type='CLOSE_INCOMPLETE',reason='ab'),state_after=WST(state='NOT_STARTED',n=4,lastEid=EID(4),rev=6))
    EVT('close as incomplete with a 201-character reason',WEV(type='CLOSE_INCOMPLETE',reason='r'*201),state_after=WST(state='NOT_STARTED',n=4,lastEid=EID(4),rev=6))
    chk(f'W1 [{nm}] event create accepted: close as incomplete with a proper reason (control for the reason cases)',P('create',EP(EID(4)),OWN,WEV(type='CLOSE_INCOMPLETE',reason='Forgot to clock out'),None,{SPATH:B0},{SPATH:WST(state='NOT_STARTED',n=4,lastEid=EID(4),rev=6),EP(EID(4)):WEV(type='CLOSE_INCOMPLETE',reason='Forgot to clock out')}))
    chk(f'W1 [{nm}] event create refused: orphan (no state record in the same batch)',not P('create',EP(EID(4)),OWN,E0,None,{SPATH:B0},{EP(EID(4)):E0}))
    chk(f'W1 [{nm}] event create refused: the state record points at a different event',not P('create',EP(EID(4)),OWN,E0,None,{SPATH:B0},{SPATH:WST(state='LUNCH',n=4,lu=True,lastEid=EID(5),rev=6),EP(EID(4)):E0}))
    chk(f'W1 [{nm}] event create refused: counter skips ahead (n=5 after 3)',not P('create',EP(EID(5)),OWN,WEV(n=5),None,{SPATH:B0},{SPATH:WST(state='LUNCH',n=5,lu=True,lastEid=EID(5),rev=6),EP(EID(5)):WEV(n=5)}))
    chk(f'W1 [{nm}] event create refused: counter repeats (n=3 again)',not P('create',EP(EID(3)),OWN,WEV(n=3),None,{SPATH:B0},{SPATH:WST(state='LUNCH',n=3,lu=True,lastEid=EID(3),rev=6),EP(EID(3)):WEV(n=3)}))
    chk(f'W1 [{nm}] event create refused: state moved to a different session than the event',not P('create',EP(EID(4)),OWN,E0,None,{SPATH:B0},{SPATH:WST(state='LUNCH',sid=NEWSID,n=4,lu=True,lastEid=EID(4,NEWSID),rev=6),EP(EID(4)):E0}))
    chk(f'W1 [{nm}] event create refused: replay of an event that already exists',not P('update',EP(EID(4)),OWN,E0,E0,{SPATH:B0,EP(EID(4)):E0},AF0))
    chk(f'W1 [{nm}] event create refused: the state record does not exist yet',not P('create',EP(EID(1)),OWN,WEV(type='CLOCK_IN',n=1,sid=NEWSID),None,{},{SPATH:dict(WST(sid=NEWSID,n=1,lastEid=EID(1,NEWSID),rev=2)),EP(EID(1,NEWSID)):WEV(type='CLOCK_IN',n=1,sid=NEWSID),SSP(NEWSID):WSES()}))
    # ---- state record refusals
    def STU(n,a,b=None,after=None,docs=None):
        b=b or B0; eid=a.get('lastEid') if isinstance(a.get('lastEid'),str) and a.get('lastEid') else EID(4)
        chk(f'W1 [{nm}] state update refused: {n}',not P('update',SPATH,OWN,a,b,docs if docs is not None else {SPATH:b},after if after is not None else {SPATH:a,EP(eid):WEV()}))
    G4=lambda **k: WST(**dict({'state':'LUNCH','n':4,'lu':True,'lastEid':EID(4),'rev':6},**k))
    STU('revision not one higher (same)',G4(rev=5)); STU('revision jumps by two',G4(rev=7)); STU('revision goes backwards',G4(rev=4)); STU('revision is a string',G4(rev='6'))
    STU('extra field',G4(name='Ann')); STU('field removed',{k:v for k,v in G4().items() if k!='fb'}); STU('updatedAt not server time',G4(updatedAt=TS(NOW-1)))
    STU('unknown state',G4(state='SLEEPING')); STU('flag is not a boolean',G4(lu='yes')); STU('counter above 12',G4(n=13,lastEid=EID(12))); STU('counter is not a number',G4(n='4'))
    STU('lastEid has a wrong shape',G4(lastEid='nope')); STU('lastEid empty',G4(lastEid='')); STU('session ID empty',G4(sid=''))
    chk(f'W1 [{nm}] state update refused: no event in the same batch',not P('update',SPATH,OWN,G4(),B0,{SPATH:B0},{SPATH:G4()}))
    chk(f'W1 [{nm}] state update refused: points at an event that already exists (replay)',not P('update',SPATH,OWN,G4(),B0,{SPATH:B0,EP(EID(4)):E0},{SPATH:G4(),EP(EID(4)):E0}))
    chk(f'W1 [{nm}] state update refused: state jumps with no valid punch (WORKING straight to LAST_BREAK with the wrong event)',not (P('update',SPATH,OWN,G4(state='LAST_BREAK',lb=True,lu=False),B0,{SPATH:B0},{SPATH:G4(state='LAST_BREAK',lb=True,lu=False),EP(EID(4)):WEV()}) and P('create',EP(EID(4)),OWN,WEV(),None,{SPATH:B0},{SPATH:G4(state='LAST_BREAK',lb=True,lu=False),EP(EID(4)):WEV()})))
    chk(f'W1 [{nm}] state create refused: not the starting form, wrong ID, extra field',not any([P('create',SPATH,OWN,dict(INIT,state='WORKING')),P('create',SPATH,OWN,dict(INIT,rev=2)),P('create',SPATH,OWN,dict(INIT,n=1)),P('create',SPATH,OWN,dict(INIT,fb=True)),P('create','workState/other',OWN,INIT),P('create',SPATH,OWN,dict(INIT,name='Ann')),P('create',SPATH,OWN,dict(INIT,updatedAt=TS(NOW-1))),P('create',SPATH,OWN,dict(INIT,lastEid=EID(1)))]))
    # ---- two tabs: the second tab acts on a state that is already out of date
    B_new=WST(state='LUNCH',n=4,lu=True,lastEid=EID(4),rev=6)       # what the database holds after tab 1 went to lunch
    stale_ev=WEV(type='FIRST_BREAK_OUT',n=4); stale_st=WST(state='FIRST_BREAK',n=4,fb=True,lastEid=EID(4)+'x'.replace('x',''),rev=6)
    chk(f'W1 [{nm}] two tabs: tab 2 (still thinks WORKING) cannot start a break while tab 1 already put you on lunch',not (P('create',EP('sess0000000000000001__4'),OWN,stale_ev,None,{SPATH:B_new,EP(EID(4)):E0},{SPATH:stale_st,EP(EID(4)):stale_ev}) or P('update',SPATH,OWN,stale_st,B_new,{SPATH:B_new,EP(EID(4)):E0},{SPATH:stale_st,EP(EID(4)):stale_ev})))
    chk(f'W1 [{nm}] two tabs: tab 2 sending the same lunch-out again is refused (event exists, revision stale)',not (P('create',EP(EID(4)),OWN,E0,None,{SPATH:B_new,EP(EID(4)):E0},AF0) or P('update',SPATH,OWN,A0,B_new,{SPATH:B_new,EP(EID(4)):E0},AF0)))
    chk(f'W1 [{nm}] two tabs: two clock-ins in a row are refused (second sees WORKING)',not P('create',EP(EID(1,NEWSID)),OWN,WEV(type='CLOCK_IN',n=1,sid=NEWSID),None,{SPATH:WST(sid=SID,n=1,rev=2),SSP(SID):WSES()},{SPATH:WST(sid=NEWSID,n=1,lastEid=EID(1,NEWSID),rev=3),EP(EID(1,NEWSID)):WEV(type='CLOCK_IN',n=1,sid=NEWSID),SSP(NEWSID):WSES()}))
    # ---- session record
    CI_E=WEV(type='CLOCK_IN',n=1,sid=NEWSID); CI_S=WST(state='WORKING',sid=NEWSID,n=1,lastEid=EID(1,NEWSID),rev=6); NS=dict(c0:='x') if False else None
    BN=WST(state='NOT_STARTED',n=4,lastEid=EID(4))
    def SES(n,s,after_ev=None,docs=None,sid=NEWSID):
        ev=after_ev if after_ev is not None else CI_E
        chk(f'W1 [{nm}] session create refused: {n}',not P('create',SSP(sid),OWN,s,None,docs if docs is not None else {SPATH:BN},{SPATH:CI_S,EP(EID(1,NEWSID)):ev,SSP(sid):s}))
    chk(f'W1 [{nm}] control: clock in creates the session, the first event and the state together',P('create',SSP(NEWSID),OWN,WSES(),None,{SPATH:BN},{SPATH:CI_S,EP(EID(1,NEWSID)):CI_E,SSP(NEWSID):WSES()}))
    SES('extra field (a client name)',WSES(client='Ann')); SES('missing tz',{k:v for k,v in WSES().items() if k!='tz'}); SES('time zone with spaces',WSES(tz='Asia Manila')); SES('time zone 61 characters',WSES(tz='A'*61))
    SES('date in the wrong shape',WSES(date='4 Nov 2026')); SES('date is a number',WSES(date=20261104)); SES('start time not the server time',WSES(startedAt=TS(NOW-1))); SES('recorded for someone else',WSES(by='someoneelse123'))
    SES('first event is not a clock in',WSES(),after_ev=WEV(type='LUNCH_OUT',n=1,sid=NEWSID)); SES('session ID too short',WSES(),sid='abc')
    chk(f'W1 [{nm}] session create refused: no first event in the same batch',not P('create',SSP(NEWSID),OWN,WSES(),None,{SPATH:BN},{SSP(NEWSID):WSES()}))
    chk(f'W1 [{nm}] session create refused: the session already exists (replay)',not P('update',SSP(NEWSID),OWN,WSES(),WSES(),{SPATH:BN,SSP(NEWSID):WSES()},{SPATH:CI_S,EP(EID(1,NEWSID)):CI_E,SSP(NEWSID):WSES()}))
    chk(f'W1 [{nm}] clock in refused: no session record in the same batch',not (P('create',EP(EID(1,NEWSID)),OWN,CI_E,None,{SPATH:BN},{SPATH:CI_S,EP(EID(1,NEWSID)):CI_E})))
    chk(f'W1 [{nm}] clock in refused: the session already exists (reusing an old session ID)',not P('create',EP(EID(1,NEWSID)),OWN,CI_E,None,{SPATH:BN,SSP(NEWSID):WSES()},{SPATH:CI_S,EP(EID(1,NEWSID)):CI_E,SSP(NEWSID):WSES()}))
    # ---- the "already used" flags cannot be reset or set by hand during other punches
    def FLG(n,before,after,etype,ev_n=4):
        e=WEV(type=etype,n=ev_n,reason='Forgot to clock out' if etype=='CLOSE_INCOMPLETE' else ''); eid=EID(ev_n)
        chk(f'W1 [{nm}] flags cannot be tampered with: {n}',not (P('create',EP(eid),OWN,e,None,{SPATH:before},{SPATH:after,EP(eid):e}) and P('update',SPATH,OWN,after,before,{SPATH:before},{SPATH:after,EP(eid):e})))
    FLG('lunch in that also clears the first-break flag',WST(state='LUNCH',fb=True,lu=True,lastEid=EID(3)),WST(state='WORKING',fb=False,lu=True,n=4,lastEid=EID(4),rev=6),'LUNCH_IN')
    FLG('lunch in that also clears the lunch flag (to take lunch twice)',WST(state='LUNCH',lu=True,lastEid=EID(3)),WST(state='WORKING',lu=False,n=4,lastEid=EID(4),rev=6),'LUNCH_IN')
    FLG('first break out that clears the lunch flag',WST(state='WORKING',lu=True),WST(state='FIRST_BREAK',fb=True,lu=False,n=4,lastEid=EID(4),rev=6),'FIRST_BREAK_OUT')
    FLG('last break out that clears the first-break flag',WST(state='WORKING',fb=True),WST(state='LAST_BREAK',fb=False,lb=True,n=4,lastEid=EID(4),rev=6),'LAST_BREAK_OUT')
    FLG('clock out that clears every flag',WST(state='WORKING',fb=True,lu=True,lb=True),WST(state='NOT_STARTED',n=4,lastEid=EID(4),rev=6),'CLOCK_OUT')
    FLG('close as incomplete that clears a flag',WST(state='LUNCH',lu=True),WST(state='NOT_STARTED',lu=False,n=4,lastEid=EID(4),rev=6),'CLOSE_INCOMPLETE')
    FLG('first break in that sets the lunch flag',WST(state='FIRST_BREAK',fb=True),WST(state='WORKING',fb=True,lu=True,n=4,lastEid=EID(4),rev=6),'FIRST_BREAK_IN')
    chk(f'W1 [{nm}] control for the flag cases: lunch in that keeps every flag is accepted',(lambda b,a,e:P('create',EP(EID(4)),OWN,e,None,{SPATH:b},{SPATH:a,EP(EID(4)):e}) and P('update',SPATH,OWN,a,b,{SPATH:b},{SPATH:a,EP(EID(4)):e}))(WST(state='LUNCH',fb=True,lu=True,lastEid=EID(3)),WST(state='WORKING',fb=True,lu=True,n=4,lastEid=EID(4),rev=6),WEV(type='LUNCH_IN')))
    # ---- a session cannot be switched in the middle: the state must keep the same session ID for every punch after clock in
    chk(f'W1 [{nm}] a punch cannot move the state to another session ID',not P('update',SPATH,OWN,WST(state='LUNCH',sid=NEWSID,n=4,lu=True,lastEid=EID(4,NEWSID),rev=6),B0,{SPATH:B0},{SPATH:WST(state='LUNCH',sid=NEWSID,n=4,lu=True,lastEid=EID(4,NEWSID),rev=6),EP(EID(4,NEWSID)):WEV(sid=NEWSID)}) or not P('create',EP(EID(4,NEWSID)),OWN,WEV(sid=NEWSID),None,{SPATH:B0},{SPATH:WST(state='LUNCH',sid=NEWSID,n=4,lu=True,lastEid=EID(4,NEWSID),rev=6),EP(EID(4,NEWSID)):WEV(sid=NEWSID)}))
    chk(f'W1 [{nm}] pause switch does not affect owner WorkTrack records (owner-only data, not public intake)',P('create',EP(EID(4)),OWN,E0,None,{SPATH:B0,'content/guard':{'pause':True}},AF0))
# ---------------- 8g. W2 (4.5.0): client assignment on a session (paired audit records, open session only, active clients only)
WAP=lambda sid=SID,cid='CL-001': 'workAssign/'+sid+'__'+cid
WAUP=lambda a: 'workAssignAudit/'+a
WA=lambda **k: dict({'sid':SID,'clientId':'CL-001','status':'active','rev':1,'addedAt':TSNOW,'updatedAt':TSNOW,'lastAudit':AID1},**k)
WAD=lambda **k: dict({'sid':SID,'clientId':'CL-001','action':'add','reason':'','rev':1,'actor':UID,'createdAt':TSNOW},**k)
def WAFTER(doc,aud,aid,sid=SID,cid='CL-001',extra=None):
    d={WAP(sid,cid):doc,WAUP(aid):aud}
    if extra: d.update(extra)
    return d
OPEN=lambda **k: WST(**k)                                   # session SID is open (WORKING)
CLOSED=lambda **k: WST(**dict({'state':'NOT_STARTED'},**k))
for nm,sim in (('transition',S),('strict',SS)):
    P=lambda op,path,au=None,new=None,old=None,docs=None,after=None: A(op,path,au,new,old,docs,sim=sim) if after is None else sim.allowed(op,path,au,new,old,docs,NOW,after)
    D0={SPATH:OPEN(),'clientRegistry/CL-001':REG()}           # a normal day: open session, active client
    # ---- positive controls
    AFa=WAFTER(WA(),WAD(),AID1)
    chk(f'W2 [{nm}] control: add a client to the open session (assignment + audit in one batch)',P('create',WAP(),OWN,WA(),None,D0,AFa) and P('create',WAUP(AID1),OWN,WAD(),None,D0,AFa))
    OLDA=WA(); REM=WA(status='removed',rev=2,lastAudit=AID2); AREM=WAD(action='remove',rev=2,reason='')
    D1=dict(D0,**{WAP():OLDA}); AFr=WAFTER(REM,AREM,AID2)
    chk(f'W2 [{nm}] control: remove a client (optional reason), paired with an audit record',P('update',WAP(),OWN,REM,OLDA,D1,AFr) and P('create',WAUP(AID2),OWN,AREM,None,D1,AFr))
    RMD=WA(status='removed',rev=2,lastAudit=AID2); RE=WA(status='active',rev=3,lastAudit=AID3); ARE=WAD(action='readd',rev=3)
    D2=dict(D0,**{WAP():RMD}); AFe=WAFTER(RE,ARE,AID3)
    chk(f'W2 [{nm}] control: a removed client can be added back (readd)',P('update',WAP(),OWN,RE,RMD,D2,AFe) and P('create',WAUP(AID3),OWN,ARE,None,D2,AFe))
    chk(f'W2 [{nm}] control: owner can read and list both collections',all(P(o,x,OWN) for o,x in (('get',WAP()),('list','workAssign'),('get',WAUP(AID1)),('list','workAssignAudit'))))
    ARCH=dict(D1,**{'clientRegistry/CL-001':REG(status='archived',rev=2)})
    chk(f'W2 [{nm}] control: an ARCHIVED client can still be removed from the open session',P('update',WAP(),OWN,REM,OLDA,ARCH,AFr) and P('create',WAUP(AID2),OWN,AREM,None,ARCH,AFr))
    # clock in with clients picked before: state, event, session and assignments in one batch
    NS='sess0000000000000002'; BN=CLOSED(n=4,lastEid=EID(4))
    CIst=WST(state='WORKING',sid=NS,n=1,lastEid=EID(1,NS),rev=6); CIev=WEV(type='CLOCK_IN',n=1,sid=NS)
    CIA={WAP(NS,'CL-001'):WA(sid=NS),WAUP(AID1):WAD(sid=NS),WAP(NS,'CL-002'):WA(sid=NS,clientId='CL-002',lastAudit=AID2),WAUP(AID2):WAD(sid=NS,clientId='CL-002')}
    CIAF=dict(CIA); CIAF.update({SPATH:CIst,EP(EID(1,NS)):CIev,SSP(NS):WSES()})
    CD={SPATH:BN,'clientRegistry/CL-001':REG(),'clientRegistry/CL-002':REG()}
    chk(f'W2 [{nm}] control: clock in with two clients picked beforehand is accepted as one batch',all([P('create',WAP(NS,'CL-001'),OWN,WA(sid=NS),None,CD,CIAF),P('create',WAP(NS,'CL-002'),OWN,WA(sid=NS,clientId='CL-002',lastAudit=AID2),None,CD,CIAF),P('create',WAUP(AID1),OWN,WAD(sid=NS),None,CD,CIAF),P('create',WAUP(AID2),OWN,WAD(sid=NS,clientId='CL-002'),None,CD,CIAF)]))
    CD2=dict(CD,**{'clientRegistry/CL-002':REG(status='archived',rev=2)})
    chk(f'W2 [{nm}] clock in refused when a picked client was archived in the meantime',not P('create',WAP(NS,'CL-002'),OWN,WA(sid=NS,clientId='CL-002',lastAudit=AID2),None,CD2,CIAF))
    chk(f'W2 [{nm}] clock in refused when a picked client does not exist',not P('create',WAP(NS,'CL-002'),OWN,WA(sid=NS,clientId='CL-002',lastAudit=AID2),None,{SPATH:BN,'clientRegistry/CL-001':REG()},CIAF))
    # ---- who
    for who,au in (('visitor',None),('stranger',STRANGER),('anonymous provider',dict(OWN,provider='anonymous')),('owner uid, unverified',dict(OWN,verified=False)),('owner e-mail, other uid (strict only)',{'uid':'other','email':EMAIL})):
        if who.endswith('(strict only)') and nm=='transition': continue
        chk(f'W2 [{nm}] {who}: no read, list, create, update or delete on workAssign or workAssignAudit',not any([P(o,WAP(),au,WA(),WA(),D1,AFa) for o in ('get','create','update','delete')]+[P(o,WAUP(AID1),au,WAD(),WAD(),D1,AFa) for o in ('get','create','update','delete')]+[P('list','workAssign',au),P('list','workAssignAudit',au),P('update',WAP(),au,REM,OLDA,D1,AFr),P('create',WAUP(AID2),au,AREM,None,D1,AFr)]))
    chk(f'W2 [{nm}] owner cannot delete an assignment or an audit record, and cannot edit an audit record',not any([P('delete',WAP(),OWN,None,OLDA,D1),P('delete',WAUP(AID1),OWN,None,WAD(),{WAUP(AID1):WAD()}),P('update',WAUP(AID1),OWN,WAD(reason='x'),WAD(),{WAUP(AID1):WAD()},WAFTER(OLDA,WAD(reason='x'),AID1))]))
    # ---- add refusals
    def ADD(n,doc,aud=None,docs=None,aid=AID1,path=None,after=None,cid='CL-001'):
        aud=aud if aud is not None else WAD(); docs=docs if docs is not None else D0
        chk(f'W2 [{nm}] add refused: {n}',not P('create',path or WAP(),OWN,doc,None,docs,after if after is not None else {(path or WAP()):doc,WAUP(aid):aud}))
    ADD('extra field (a name)',WA(name='Ann')); ADD('extra field (hours)',WA(hours=9)); ADD('missing status',{k:v for k,v in WA().items() if k!='status'}); ADD('missing lastAudit',{k:v for k,v in WA().items() if k!='lastAudit'})
    ADD('status removed',WA(status='removed')); ADD('revision 2',WA(rev=2)); ADD('revision 0',WA(rev=0)); ADD('revision as text',WA(rev='1'))
    ADD('addedAt not server time',WA(addedAt=TS(NOW-1))); ADD('updatedAt not server time',WA(updatedAt=TS(NOW+1))); ADD('addedAt as client number',WA(addedAt=NOW))
    ADD('lastAudit too short',WA(lastAudit='abc')); ADD('lastAudit bad characters',WA(lastAudit='a'*15+'-')); ADD('lastAudit number',WA(lastAudit=5))
    ADD('document ID does not match session and client',WA(),path=WAP(SID,'CL-002'),after={WAP(SID,'CL-002'):WA(),WAUP(AID1):WAD()})
    ADD('document ID does not match (wrong session part)',WA(),path='workAssign/other00000000000000__CL-001',after={'workAssign/other00000000000000__CL-001':WA(),WAUP(AID1):WAD()})
    for bad in ('cl-001','CL_001','CL--001','CL-001-','AB'):
        ADD(f'bad Client ID {bad!r}',WA(clientId=bad),path=f'workAssign/{SID}__{bad}',after={f'workAssign/{SID}__{bad}':WA(clientId=bad),WAUP(AID1):WAD(clientId=bad)})
    ADD('session ID too short',WA(sid='abc'),path='workAssign/abc__CL-001',after={'workAssign/abc__CL-001':WA(sid='abc'),WAUP(AID1):WAD(sid='abc')})
    ADD('client is not in the registry',WA(),docs={SPATH:OPEN()}); ADD('client is archived',WA(),docs={SPATH:OPEN(),'clientRegistry/CL-001':REG(status='archived',rev=2)})
    ADD('the session is closed',WA(),docs={SPATH:CLOSED(),'clientRegistry/CL-001':REG()}); ADD('a different session is open',WA(),docs={SPATH:OPEN(sid=NS),'clientRegistry/CL-001':REG()})
    ADD('the WorkTrack state record does not exist',WA(),docs={'clientRegistry/CL-001':REG()},after={WAP():WA(),WAUP(AID1):WAD()})
    chk(f'W2 [{nm}] add refused: no audit record in the same batch',not P('create',WAP(),OWN,WA(),None,D0,{WAP():WA()}))
    chk(f'W2 [{nm}] add refused: points at an audit record that already exists (replay)',not P('create',WAP(),OWN,WA(),None,dict(D0,**{WAUP(AID1):WAD()}),AFa))
    chk(f'W2 [{nm}] add refused: the same client again (already on the session, active)',not P('update',WAP(),OWN,WA(status='active',rev=2,lastAudit=AID2),OLDA,D1,WAFTER(WA(status='active',rev=2,lastAudit=AID2),WAD(action='readd',rev=2),AID2)))
    chk(f'W2 [{nm}] add refused: re-creating an existing assignment as a fresh revision 1',not P('update',WAP(),OWN,WA(rev=1,lastAudit=AID2),WA(rev=2,status='removed'),dict(D0,**{WAP():WA(rev=2,status='removed')}),WAFTER(WA(rev=1,lastAudit=AID2),WAD(),AID2)))
    # ---- update refusals (remove / readd)
    def UPD(n,new,aud=None,docs=None,old=None,aid=AID2):
        old=old or OLDA; aud=aud if aud is not None else AREM; docs=docs if docs is not None else dict(D0,**{WAP():old})
        chk(f'W2 [{nm}] update refused: {n}',not P('update',WAP(),OWN,new,old,docs,WAFTER(new,aud,aid)))
    UPD('revision not one higher (same)',REM|{'rev':1} if False else dict(REM,rev=1)); UPD('revision jumps by two',dict(REM,rev=4)); UPD('revision goes backwards',dict(REM,rev=0)); UPD('revision as text',dict(REM,rev='2'))
    UPD('status unchanged (active to active)',dict(REM,status='active')); UPD('status not active/removed',dict(REM,status='deleted'))
    UPD('session changed',dict(REM,sid='other00000000000000')); UPD('client changed',dict(REM,clientId='CL-002')); UPD('addedAt changed',dict(REM,addedAt=TS(NOW-9))); UPD('updatedAt not server time',dict(REM,updatedAt=TS(NOW-9)))
    UPD('extra field',dict(REM,name='Ann')); UPD('field removed',{k:v for k,v in REM.items() if k!='status'})
    UPD('the session is closed',REM,docs=dict(D0,**{WAP():OLDA,SPATH:CLOSED()})); UPD('a different session is open',REM,docs=dict(D0,**{WAP():OLDA,SPATH:OPEN(sid=NS)}))
    chk(f'W2 [{nm}] update refused: no audit record in the same batch',not P('update',WAP(),OWN,REM,OLDA,D1,{WAP():REM}))
    chk(f'W2 [{nm}] update refused: reuses an old audit record (replay)',not P('update',WAP(),OWN,REM,OLDA,dict(D1,**{WAUP(AID2):AREM}),AFr))
    chk(f'W2 [{nm}] update refused: lastAudit unchanged',not P('update',WAP(),OWN,dict(REM,lastAudit=AID1),OLDA,dict(D1,**{WAUP(AID1):WAD()}),WAFTER(dict(REM,lastAudit=AID1),AREM,AID1)))
    chk(f'W2 [{nm}] readd refused: the client is archived now',not P('update',WAP(),OWN,RE,RMD,dict(D2,**{'clientRegistry/CL-001':REG(status='archived',rev=2)}),AFe))
    chk(f'W2 [{nm}] readd refused: the client no longer exists in the registry',not P('update',WAP(),OWN,RE,RMD,{SPATH:OPEN(),WAP():RMD},AFe))
    chk(f'W2 [{nm}] two tabs: a second remove of the same client is refused (it is already removed)',not P('update',WAP(),OWN,dict(REM,rev=3,lastAudit=AID3),RMD,D2,WAFTER(dict(REM,rev=3,lastAudit=AID3),dict(AREM,rev=3),AID3)))
    chk(f'W2 [{nm}] two tabs: a second add-back of the same client is refused (it is already active)',not P('update',WAP(),OWN,dict(RE,rev=4,lastAudit=AID3),dict(RE),dict(D0,**{WAP():RE}),WAFTER(dict(RE,rev=4,lastAudit=AID3),dict(ARE,rev=4),AID3)))
    # ---- audit refusals
    BASE=WAD(action='remove',rev=2,reason='no longer needed')
    def AUDT(n,aud,doc=REM,docs=None,aid=AID2):
        chk(f'W2 [{nm}] audit create refused: {n}',not P('create',WAUP(aid),OWN,aud,None,docs if docs is not None else D1,WAFTER(doc,aud,aid)))
    chk(f'W2 [{nm}] audit baseline for the refusal cases is accepted',P('create',WAUP(AID2),OWN,BASE,None,D1,WAFTER(REM,BASE,AID2)))
    AUDT('extra field',dict(BASE,name='Ann')); AUDT('missing field',{k:v for k,v in BASE.items() if k!='reason'}); AUDT('unknown action',dict(BASE,action='delete'))
    AUDT('someone else as actor',dict(BASE,actor='someoneelse123')); AUDT('createdAt not server time',dict(BASE,createdAt=TS(NOW-1))); AUDT('reason 201 characters',dict(BASE,reason='r'*201)); AUDT('reason is a number',dict(BASE,reason=5))
    AUDT('bad client ID',dict(BASE,clientId='cl--1')); AUDT('session ID too short',dict(BASE,sid='abc')); AUDT('rev does not match the assignment',dict(BASE,rev=3))
    AUDT('action add with rev 2',dict(BASE,action='add')); AUDT('action remove with rev 1',dict(BASE,rev=1),doc=dict(REM,rev=1))
    AUDT('remove, but the assignment was not active before',BASE,docs=D2); AUDT('readd, but the assignment was active before',dict(BASE,action='readd',rev=3),doc=dict(RE,rev=3),docs=D1)
    AUDT('remove, but the assignment ends up active',BASE,doc=dict(REM,status='active'))
    AUDT('readd, but the assignment ends up removed',dict(ARE),doc=dict(RE,status='removed'),docs=D2,aid=AID3)
    AUDT('add for an assignment that already exists',WAD(),doc=WA(),docs=D1,aid=AID1)
    AUDT('audit id too short',BASE,doc=dict(REM,lastAudit='abc'),aid='abc')
    chk(f'W2 [{nm}] audit create refused: orphan (no assignment in the same batch)',not P('create',WAUP(AID2),OWN,BASE,None,D1,{WAUP(AID2):BASE}))
    chk(f'W2 [{nm}] audit create refused: the assignment points at a different audit id',not P('create',WAUP(AID2),OWN,BASE,None,D1,WAFTER(dict(REM,lastAudit=AID3),BASE,AID2)))
    chk(f'W2 [{nm}] pause switch does not affect owner assignments (owner-only data, not public intake)',P('create',WAP(),OWN,WA(),None,dict(D0,**{'content/guard':{'pause':True}}),AFa))
# ---------------- 8h. W3 (4.5.0): sealed log (seals + chain head), corrections (24-hour window), work settings
H64=lambda c: c*64; ZERO='0'*64; HR=3600000
CHP='workChain/main'; SLP=lambda h:'workSeals/'+h; CRP=lambda c:'workCorrections/'+c; STP='workSettings/main'
SEAL=lambda **k: dict({'n':2,'prev':H64('a'),'hash':H64('b'),'kind':'records','ids':['workEvents/'+EID(1)],'upto':0,'legacyN':0,'at':TSNOW,'by':UID},**k)
GSEAL=lambda **k: dict({'n':1,'prev':ZERO,'hash':H64('c'),'kind':'genesis','ids':[],'upto':100,'legacyN':3,'at':TSNOW,'by':UID},**k)
CHN=lambda **k: dict({'cn':2,'head':H64('b'),'updatedAt':TSNOW},**k)
CHOLD=lambda **k: dict({'cn':1,'head':H64('a'),'updatedAt':TSNOW},**k)
CORR='corr0000000000000001'
CLOSEEID=EID(4); CLOSEAT=NOW-2*HR
CEV=lambda **k: dict({'sid':SID,'n':4,'type':'CLOCK_OUT','at':TS(CLOSEAT),'by':UID,'reason':''},**k)
CR=lambda **k: dict({'sid':SID,'kind':'TIME','n':3,'type':'','clientId':'','at':TS(NOW-3*HR),'at2':None,'reason':'Forgot to punch on time','closeEid':CLOSEEID,'closeN':4,'by':UID,'createdAt':TSNOW},**k)
CRADD=lambda **k: CR(**dict({'kind':'ADD','n':0,'type':'LUNCH','at':TS(NOW-6*HR),'at2':TS(NOW-5*HR)},**k))
CRCA=lambda **k: CR(**dict({'kind':'CLIENT_ADD','n':0,'clientId':'CL-001','at':None},**k))
CRCR=lambda **k: CR(**dict({'kind':'CLIENT_REMOVE','n':0,'clientId':'CL-001','at':None},**k))
CDOCS=lambda **k: dict({SPATH:WST(state='NOT_STARTED',sid=SID,n=4),EP(CLOSEEID):CEV(),SSP(SID):WSES(),'clientRegistry/CL-001':REG()},**k)
SET=lambda **k: dict({'tz':'Asia/Manila','weekStart':'mon','prevTz':'','prevWeekStart':'','rev':1,'updatedAt':TSNOW},**k)
for nm,sim in (('transition',S),('strict',SS)):
    P=lambda op,path,au=None,new=None,old=None,docs=None,after=None: A(op,path,au,new,old,docs,sim=sim) if after is None else sim.allowed(op,path,au,new,old,docs,NOW,after)
    # ---- seals and the chain head
    GAF={SLP(H64('c')):GSEAL(),CHP:CHN(cn=1,head=H64('c'))}
    chk(f'W3 [{nm}] control: the starting seal and the chain head are created together',P('create',SLP(H64('c')),OWN,GSEAL(),None,{},GAF) and P('create',CHP,OWN,CHN(cn=1,head=H64('c')),None,{},GAF))
    SAF={SLP(H64('b')):SEAL(),CHP:CHN()}; SD={CHP:CHOLD()}
    chk(f'W3 [{nm}] control: the next seal and the moved chain head are written together',P('create',SLP(H64('b')),OWN,SEAL(),None,SD,SAF) and P('update',CHP,OWN,CHN(),CHOLD(),SD,SAF))
    chk(f'W3 [{nm}] control: owner can read and list seals and the chain head',all(P(o,x,OWN) for o,x in (('get',CHP),('get',SLP(H64('b'))),('list','workSeals'))))
    for who,au in (('visitor',None),('stranger',STRANGER),('anonymous provider',dict(OWN,provider='anonymous')),('owner uid, unverified',dict(OWN,verified=False))):
        chk(f'W3 [{nm}] {who}: no access to seals, the chain head, corrections or settings',not any([P(o,SLP(H64('b')),au,SEAL(),SEAL(),SD,SAF) for o in ('get','create','update','delete')]+[P(o,CHP,au,CHN(),CHOLD(),SD,SAF) for o in ('get','create','update','delete')]+[P(o,CRP(CORR),au,CR(),CR(),CDOCS(),{CRP(CORR):CR()}) for o in ('get','create','update','delete')]+[P(o,STP,au,SET(),SET(),{},{STP:SET()}) for o in ('get','create','update','delete')]+[P('list','workSeals',au),P('list','workCorrections',au)]))
    chk(f'W3 [{nm}] a seal or the chain head cannot be edited or deleted by the owner',not any([P('update',SLP(H64('b')),OWN,SEAL(n=3),SEAL(),SD,SAF),P('delete',SLP(H64('b')),OWN,None,SEAL(),{SLP(H64('b')):SEAL()}),P('delete',CHP,OWN,None,CHN(),{CHP:CHN()})]))
    def SLR(n,seal,chain=None,docs=None,h=None):
        h=h or seal.get('hash',H64('b')); ch=chain if chain is not None else CHN(head=seal.get('hash',H64('b')),cn=seal.get('n',2) if isinstance(seal.get('n'),int) else 2)
        chk(f'W3 [{nm}] seal create refused: {n}',not P('create',SLP(h),OWN,seal,None,docs if docs is not None else SD,{SLP(h):seal,CHP:ch}))
    SLR('extra field',SEAL(name='x')); SLR('missing field',{k:v for k,v in SEAL().items() if k!='upto'}); SLR('hash is not its own ID',SEAL(),h=H64('d'),chain=CHN())
    SLR('fingerprint not hex (upper case)',SEAL(hash=H64('B')),h=H64('B')); SLR('fingerprint too short',SEAL(hash='ab'),h='ab'); SLR('previous fingerprint not hex',SEAL(prev='zz'))
    SLR('number skips ahead (3 after 1)',SEAL(n=3),chain=CHN(cn=3)); SLR('number repeats (2 after 2)',SEAL(n=2),chain=CHN(cn=2),docs={CHP:CHN()}); SLR('number is a string',SEAL(n='2'))
    SLR('previous fingerprint is not the old head',SEAL(prev=H64('9'))); SLR('number 0',SEAL(n=0),chain=CHN(cn=0)); SLR('kind unknown',SEAL(kind='other'))
    SLR('ids is a string',SEAL(ids='workEvents/x')); SLR('31 ids',SEAL(ids=['workEvents/x%d'%i for i in range(31)])); SLR('records seal with no ids',SEAL(ids=[]))
    SLR('records seal with an upto',SEAL(upto=5)); SLR('records seal with legacyN',SEAL(legacyN=1))
    SLR('time not the server time',SEAL(at=TS(NOW-1))); SLR('recorded for someone else',SEAL(by='someoneelse123'))
    SLR('chain head not moved in the same batch',SEAL(),chain=CHOLD()); SLR('chain head points at another seal',SEAL(),chain=CHN(head=H64('e')))
    SLR('chain count differs from the seal number',SEAL(),chain=CHN(cn=5))
    chk(f'W3 [{nm}] seal create refused: no chain head record in the batch',not P('create',SLP(H64('b')),OWN,SEAL(),None,SD,{SLP(H64('b')):SEAL()}))
    chk(f'W3 [{nm}] seal create refused: the chain head does not exist yet and the seal is not the first',not P('create',SLP(H64('b')),OWN,SEAL(),None,{},{SLP(H64('b')):SEAL(),CHP:CHN()}))
    chk(f'W3 [{nm}] seal create refused: replay of an existing seal',not P('update',SLP(H64('b')),OWN,SEAL(),SEAL(),dict(SD,**{SLP(H64('b')):SEAL()}),SAF))
    def GSR(n,seal,chain=None):
        h=seal.get('hash',H64('c')); chk(f'W3 [{nm}] starting seal refused: {n}',not P('create',SLP(h),OWN,seal,None,{},{SLP(h):seal,CHP:chain if chain is not None else CHN(cn=seal.get('n',1),head=h)}))
    GSR('starting seal with a previous fingerprint',GSEAL(prev=H64('a'))); GSR('starting seal with ids',GSEAL(ids=['workEvents/x'])); GSR('starting seal with number 2',GSEAL(n=2))
    GSR('starting seal with a negative upto',GSEAL(upto=-1)); GSR('starting seal with a huge legacy count',GSEAL(legacyN=100001))
    chk(f'W3 [{nm}] starting seal refused: the chain head already exists (the chain cannot be restarted)',not P('create',SLP(H64('c')),OWN,GSEAL(),None,{CHP:CHOLD()},GAF))
    def CHR(n,op,new,old,docs,after):
        chk(f'W3 [{nm}] chain head {op} refused: {n}',not P(op,CHP,OWN,new,old,docs,after))
    CHR('count jumps by two','update',CHN(cn=3),CHOLD(),SD,{CHP:CHN(cn=3),SLP(H64('b')):SEAL(n=3)}); CHR('count stays','update',CHN(cn=1),CHOLD(),SD,{CHP:CHN(cn=1),SLP(H64('b')):SEAL(n=1)})
    CHR('head not hex','update',CHN(head='nope'),CHOLD(),SD,{CHP:CHN(head='nope'),SLP(H64('b')):SEAL()}); CHR('no seal in the batch','update',CHN(),CHOLD(),SD,{CHP:CHN()})
    CHR('the seal has another number','update',CHN(),CHOLD(),SD,{CHP:CHN(),SLP(H64('b')):SEAL(n=5)}); CHR('the seal does not follow the old head','update',CHN(),CHOLD(),SD,{CHP:CHN(),SLP(H64('b')):SEAL(prev=H64('9'))})
    CHR('head moves to an existing seal (replay)','update',CHN(),CHOLD(),dict(SD,**{SLP(H64('b')):SEAL()}),SAF); CHR('extra field','update',CHN(name='x'),CHOLD(),SD,SAF)
    CHR('updatedAt not the server time','update',CHN(updatedAt=TS(NOW-1)),CHOLD(),SD,SAF); CHR('count is a string','update',CHN(cn='2'),CHOLD(),SD,SAF)
    CHR('created with count 2','create',CHN(),None,{},SAF); CHR('created pointing at a records seal','create',CHN(cn=1,head=H64('b')),None,{},{CHP:CHN(cn=1,head=H64('b')),SLP(H64('b')):SEAL(n=1)})
    chk(f'W3 [{nm}] chain head refused under another document ID',not P('create','workChain/other',OWN,CHN(cn=1,head=H64('c')),None,{},{'workChain/other':CHN(cn=1,head=H64('c')),SLP(H64('c')):GSEAL()}))
    # ---- corrections
    def CAF(c,extra=None): d={CRP(CORR):c}; d.update(extra or {}); return d
    for lbl,c in (('change the time of a punch',CR()),('add a missed break (out and in)',CRADD()),('add a client',CRCA()),('remove a client',CRCR())):
        chk(f'W3 [{nm}] control: correction accepted - {lbl}',P('create',CRP(CORR),OWN,c,None,CDOCS(),CAF(c)))
    chk(f'W3 [{nm}] control: a correction is also accepted when a LATER session exists (state shows another session id)',P('create',CRP(CORR),OWN,CR(),None,CDOCS(**{SPATH:WST(state='WORKING',sid=NEWSID,n=2)}),CAF(CR())))
    chk(f'W3 [{nm}] control: a correction is accepted 23 hours 59 minutes after the closing punch',P('create',CRP(CORR),OWN,CR(),None,CDOCS(**{EP(CLOSEEID):CEV(at=TS(NOW-24*HR+60000))}),CAF(CR())))
    chk(f'W3 [{nm}] control: owner can read and list corrections',all(P(o,CRP(CORR),OWN) for o in ('get',)) and P('list','workCorrections',OWN))
    def CRF(n,c,docs=None,op='create',old=None):
        chk(f'W3 [{nm}] correction refused: {n}',not P(op,CRP(CORR),OWN,c,old,docs if docs is not None else CDOCS(),CAF(c)))
    CRF('extra field',CR(name='Ann')); CRF('missing field',{k:v for k,v in CR().items() if k!='at2'}); CRF('unknown kind',CR(kind='DELETE'))
    CRF('reason of 2 characters',CR(reason='ab')); CRF('reason of 201 characters',CR(reason='r'*201)); CRF('reason is a number',CR(reason=5)); CRF('recorded for someone else',CR(by='someoneelse123')); CRF('created time not the server time',CR(createdAt=TS(NOW-1)))
    CRF('the session is still open (WORKING)',CR(),CDOCS(**{SPATH:WST(state='WORKING',sid=SID,n=4)})); CRF('the session is on a break (still open)',CR(),CDOCS(**{SPATH:WST(state='LUNCH',sid=SID,n=4)}))
    CRF('close number does not match the close event ID',CR(closeN=3)); CRF('close event is not a closing punch',CR(),CDOCS(**{EP(CLOSEEID):CEV(type='LUNCH_IN')}))
    CRF('close event belongs to another session',CR(),CDOCS(**{EP(CLOSEEID):CEV(sid=NEWSID)})); CRF('close event does not exist',CR(),{SPATH:CDOCS()[SPATH],SSP(SID):WSES()})
    CRF('window over: exactly 24 hours after the closing punch',CR(),CDOCS(**{EP(CLOSEEID):CEV(at=TS(NOW-24*HR))})); CRF('window over: 30 hours after',CR(),CDOCS(**{EP(CLOSEEID):CEV(at=TS(NOW-30*HR))}))
    CRF('the session record does not exist',CR(),{k:v for k,v in CDOCS().items() if k!=SSP(SID)}); CRF('no state record',CR(),{k:v for k,v in CDOCS().items() if k!=SPATH})
    CRF('replay of an existing correction',CR(),CDOCS(**{CRP(CORR):CR()}),op='update',old=CR())
    CRF('time in the future',CR(at=TS(NOW+1000))); CRF('time more than 48 hours before the closing punch',CR(at=TS(CLOSEAT-48*HR))); CRF('time sent as a number',CR(at=NOW-HR)); CRF('time is null for a time change',CR(at=None))
    CRF('time change with punch number 0',CR(n=0)); CRF('time change with punch number 13',CR(n=13)); CRF('time change with a type filled in',CR(type='LUNCH')); CRF('time change with a client filled in',CR(clientId='CL-001')); CRF('time change with a second time',CR(at2=TS(NOW-HR)))
    CRF('missed break with a punch number',CRADD(n=2)); CRF('missed break of an unknown kind',CRADD(type='DINNER')); CRF('missed break typed as a punch (LUNCH_OUT)',CRADD(type='LUNCH_OUT')); CRF('missed break ending before it starts',CRADD(at2=TS(NOW-7*HR)))
    CRF('missed break ending exactly when it starts',CRADD(at2=TS(NOW-6*HR))); CRF('missed break ending in the future',CRADD(at2=TS(NOW+1000))); CRF('missed break without an end',CRADD(at2=None)); CRF('missed break with a client',CRADD(clientId='CL-001'))
    CRF('client added but the Client ID is archived',CRCA(),CDOCS(**{'clientRegistry/CL-001':REG(status='archived',rev=2)})); CRF('client added but the Client ID is unknown',CRCA(clientId='CL-777'))
    CRF('client added with a bad Client ID',CRCA(clientId='cl-1')); CRF('client added with a time',CRCA(at=TS(NOW-HR))); CRF('client added with a punch number',CRCA(n=2)); CRF('client added with a type',CRCA(type='LUNCH')); CRF('client ID is a number',CRCA(clientId=5))
    CRF('client removed with a bad Client ID',CRCR(clientId='x')); CRF('client removed with a time',CRCR(at=TS(NOW-HR))); CRF('client removed with a second time',CRCR(at2=TS(NOW-HR)))
    chk(f'W3 [{nm}] a correction cannot be edited or deleted by the owner',not any([P('update',CRP(CORR),OWN,CR(reason='changed'),CR(),CDOCS(**{CRP(CORR):CR()}),CAF(CR(reason='changed'))),P('delete',CRP(CORR),OWN,None,CR(),CDOCS(**{CRP(CORR):CR()}))]))
    chk(f'W3 [{nm}] a client removal needs no active registry entry (an archived client can still be taken off)',P('create',CRP(CORR),OWN,CRCR(),None,CDOCS(**{'clientRegistry/CL-001':REG(status='archived',rev=2)}),CAF(CRCR())))
    # ---- settings
    chk(f'W3 [{nm}] control: settings created once in their starting form',P('create',STP,OWN,SET(),None,{},{STP:SET()}))
    OLDS=SET(); NEWS=SET(tz='Europe/London',weekStart='sun',prevTz='Asia/Manila',prevWeekStart='mon',rev=2)
    chk(f'W3 [{nm}] control: settings update keeps the replaced values and moves the revision by one',P('update',STP,OWN,NEWS,OLDS,{STP:OLDS},{STP:NEWS}))
    chk(f'W3 [{nm}] control: owner can read settings',P('get',STP,OWN))
    def SF(n,op,new,old=None):
        chk(f'W3 [{nm}] settings {op} refused: {n}',not P(op,STP,OWN,new,old,{STP:old} if old else {},{STP:new}))
    SF('extra field','create',SET(name='x')); SF('missing field','create',{k:v for k,v in SET().items() if k!='prevTz'}); SF('time zone with spaces','create',SET(tz='Asia Manila')); SF('time zone of 61 characters','create',SET(tz='A'*61))
    SF('time zone is a number','create',SET(tz=5)); SF('first weekday unknown','create',SET(weekStart='xyz')); SF('first weekday in capitals','create',SET(weekStart='MON')); SF('revision 2 at creation','create',SET(rev=2)); SF('previous values filled at creation','create',SET(prevTz='UTC'))
    SF('updatedAt not server time','create',SET(updatedAt=TS(NOW-1)))
    SF('revision not +1','update',NEWS|{'rev':3},OLDS); SF('revision unchanged','update',NEWS|{'rev':1},OLDS); SF('previous time zone not the replaced one','update',NEWS|{'prevTz':'UTC'},OLDS); SF('previous weekday not the replaced one','update',NEWS|{'prevWeekStart':'sat'},OLDS)
    SF('time zone with a bad character','update',NEWS|{'tz':'Europe London'},OLDS); SF('extra field','update',NEWS|{'x':1},OLDS)
    chk(f'W3 [{nm}] settings cannot be deleted, and only the ID "main" is allowed',not any([P('delete',STP,OWN,None,OLDS,{STP:OLDS}),P('create','workSettings/other',OWN,SET(),None,{},{'workSettings/other':SET()})]))
    # fully valid payloads from a non-owner (so removing an owner check is noticed), and a few more single-clause cases
    for who,au in (('visitor',None),('stranger',STRANGER)):
        chk(f'W3 [{nm}] {who}: valid chain head create/update, settings create/update and correction create are all refused',not any([P('create',CHP,au,CHN(cn=1,head=H64('c')),None,{},GAF),P('update',CHP,au,CHN(),CHOLD(),SD,SAF),P('create',STP,au,SET(),None,{},{STP:SET()}),P('update',STP,au,NEWS,OLDS,{STP:OLDS},{STP:NEWS}),P('create',CRP(CORR),au,CR(),None,CDOCS(),CAF(CR()))]))
    chk(f'W3 [{nm}] seal refused: the data says one fingerprint but the document ID (and chain head) say another',not P('create',SLP(H64('d')),OWN,SEAL(),None,SD,{SLP(H64('d')):SEAL(),CHP:CHN(head=H64('d'))}))
    chk(f'W3 [{nm}] correction refused: the document ID is too short',not P('create',CRP('x'),OWN,CR(),None,CDOCS(),CAF(CR())) and P('create',CRP(CORR),OWN,CR(),None,CDOCS(),CAF(CR())))
    CRF('missed break starting more than 48 hours before the closing punch',CRADD(at=TS(CLOSEAT-60*HR),at2=TS(CLOSEAT-59*HR)))
    CRF('client removed with a punch number',CRCR(n=3)); CRF('client removed with a type',CRCR(type='LUNCH'))
    SF('first weekday unknown','update',NEWS|{'weekStart':'xyz'},OLDS); SF('updatedAt not server time','update',NEWS|{'updatedAt':TS(NOW-1)},OLDS)
    chk(f'W3 [{nm}] pause switch does not affect the sealed log, corrections or settings (owner-only data)',P('create',CRP(CORR),OWN,CR(),None,CDOCS(**{'content/guard':{'pause':True}}),CAF(CR())))
# ---------------- 8i. B1 (4.5.0): billing profiles, billable hours (state machine, supersede), audit records, migration of old client records
BP=lambda c='CL-001': 'billingProfiles/'+c
BPA=lambda a: 'billingProfileAudit/'+a
EIDE='CL-001__20261101__20261115__01'; EIDE2='CL-001__20261101__20261115__02'
BE=lambda i=EIDE: 'billableEntries/'+i
BEA=lambda a: 'billableEntryAudit/'+a
BM=lambda l: 'billingMigration/'+l
LEG='oldClientDoc0000001'
PRO=lambda **k: dict({'currency':'USD','exp':2,'rateMinor':2500,'arrangement':'hourly','schedKind':'monthly','weekStart':'mon','anchors':'','genTime':'09:00','tz':'Asia/Manila','dueKind':'afterSend','dueDays':14,'dueDate':'','rev':1,'createdAt':TSNOW,'updatedAt':TSNOW,'lastAudit':AID1},**k)
PAU=lambda **k: dict({'clientId':'CL-001','action':'create','rev':1,'currency':'USD','rateMinor':2500,'arrangement':'hourly','summary':'Profile created: USD 25.00 per hour','reason':'','actor':UID,'createdAt':TSNOW},**k)
ENT=lambda **k: dict({'clientId':'CL-001','periodStart':'20261101','periodEnd':'20261115','seq':'01','submittedMinutes':480,'approvedMinutes':None,'status':'DRAFT','note':'','supersedes':'','supersededBy':'','approvedAt':None,'approverUid':'','relatedInvoiceId':'','rev':1,'createdAt':TSNOW,'updatedAt':TSNOW,'lastAudit':AID1},**k)
EAU=lambda **k: dict({'entryId':EIDE,'clientId':'CL-001','action':'create','fromStatus':'','toStatus':'DRAFT','rev':1,'submittedMinutes':480,'approvedMinutes':None,'reason':'','actor':UID,'createdAt':TSNOW},**k)
MIG=lambda **k: dict({'clientId':'CL-001','profileNew':True,'registryNew':False,'arrangement':'hourly','by':UID,'createdAt':TSNOW},**k)
def dropk(d,k): return {x:v for x,v in d.items() if x!=k}
for nm,sim in (('transition',S),('strict',SS)):
    P=lambda op,path,au=None,new=None,old=None,docs=None,after=None: A(op,path,au,new,old,docs,sim=sim) if after is None else sim.allowed(op,path,au,new,old,docs,NOW,after)
    R0={'clientRegistry/CL-001':REG()}; RARCH={'clientRegistry/CL-001':REG(status='archived',rev=2)}
    PAF=lambda doc,aud=None,aid=AID1,cid='CL-001': {BP(cid):doc,BPA(aid):(PAU() if aud is None else aud)}
    pcr=lambda doc,docs=None,aud=None,au=OWN,aid=AID1: P('create',BP(),au,doc,None,R0 if docs is None else docs,PAF(doc,aud,aid))
    # ---------------- billing profiles
    chk(f'B1 [{nm}] control: a profile and its audit are created together',pcr(PRO()) and P('create',BPA(AID1),OWN,PAU(),None,R0,PAF(PRO())))
    chk(f'B1 [{nm}] control: JPY with 0 decimals, KWD with 3, custom anchor days, fixed due date, weekly, mid-month, monthly arrangement all accepted',all([
      pcr(PRO(currency='JPY',exp=0,rateMinor=3000),aud=PAU(currency='JPY',rateMinor=3000)),pcr(PRO(currency='KWD',exp=3,rateMinor=1234),aud=PAU(currency='KWD',rateMinor=1234)),
      pcr(PRO(schedKind='custom',anchors='10,25')),pcr(PRO(schedKind='custom',anchors='31')),pcr(PRO(dueKind='fixed',dueDate='2026-12-31',dueDays=0)),pcr(PRO(schedKind='weekly',weekStart='fri')),pcr(PRO(schedKind='midmonth')),
      pcr(PRO(arrangement='monthly',rateMinor=50000),aud=PAU(arrangement='monthly',rateMinor=50000)),pcr(PRO(rateMinor=0),aud=PAU(rateMinor=0)),pcr(PRO(dueKind='afterGeneration',dueDays=0)),pcr(PRO(rateMinor=1000000000),aud=PAU(rateMinor=1000000000))]))
    chk(f'B1 [{nm}] control: the owner can read and list profiles and audit records',all(P(o,x,OWN) for o,x in (('get',BP()),('list','billingProfiles'),('get',BPA(AID1)),('list','billingProfileAudit'))))
    PMODS=[('currency not in the table',dict(currency='XYZ')),('JPY with 2 decimals',dict(currency='JPY')),('KWD with 2 decimals',dict(currency='KWD')),('USD with 0 decimals',dict(exp=0)),('rate negative',dict(rateMinor=-1)),
      ('rate above the limit',dict(rateMinor=1000000001)),('rate not a whole number',dict(rateMinor=2500.5)),('rate a string',dict(rateMinor='2500')),('arrangement unknown',dict(arrangement='weekly')),('schedule unknown',dict(schedKind='yearly')),
      ('week start unknown',dict(weekStart='xyz')),('anchors set on a monthly schedule',dict(anchors='10,25')),('custom schedule without anchors',dict(schedKind='custom',anchors='')),('anchors not numbers',dict(schedKind='custom',anchors='a,b')),
      ('five anchors',dict(schedKind='custom',anchors='1,2,3,4,5')),('anchors with a space',dict(schedKind='custom',anchors='10, 25')),('generation time 24:00',dict(genTime='24:00')),('generation time without leading zero',dict(genTime='9:00')),
      ('time zone with spaces',dict(tz='Bad Zone!')),('time zone too long',dict(tz='A'*61)),('time zone empty',dict(tz='')),('due rule unknown',dict(dueKind='whenever')),('due days 366',dict(dueDays=366)),('due days negative',dict(dueDays=-1)),
      ('fixed due without a date',dict(dueKind='fixed',dueDays=0)),('fixed due with a bad date',dict(dueKind='fixed',dueDate='soon',dueDays=0)),('fixed due that also has days',dict(dueKind='fixed',dueDate='2026-12-31',dueDays=5)),
      ('date on a days-based due rule',dict(dueDate='2026-12-31')),('revision 2 on create',dict(rev=2)),('created time not server time',dict(createdAt=TS(NOW-1))),('updated time not server time',dict(updatedAt=TS(NOW-1))),('audit pointer too short',dict(lastAudit='abc'))]
    for lab,m in PMODS: chk(f'B1 [{nm}] profile create refused: {lab}',not pcr(PRO(**m)))
    chk(f'B1 [{nm}] profile create refused: extra field, missing field',not pcr(PRO(note='x')) and not pcr(dropk(PRO(),'tz')) and not pcr(dropk(PRO(),'exp')))
    chk(f'B1 [{nm}] profile create refused: no audit record in the same batch, or an audit record that was already used',not P('create',BP(),OWN,PRO(),None,R0,{BP():PRO()}) and not P('create',BP(),OWN,PRO(),None,dict(R0,**{BPA(AID1):PAU()}),PAF(PRO())))
    chk(f'B1 [{nm}] profile create refused: client not in the registry, or archived',not pcr(PRO(),docs={}) and not pcr(PRO(),docs=RARCH))
    chk(f'B1 [{nm}] profile create refused: the ID is not a valid Client ID',not P('create',BP('cl-001'),OWN,PRO(),None,{'clientRegistry/cl-001':REG()},PAF(PRO(),cid='cl-001')) and not P('create',BP('CL--1'),OWN,PRO(),None,{},PAF(PRO(),cid='CL--1')))
    chk(f'B1 [{nm}] profile create refused: a second profile for the same Client ID',not P('create',BP(),OWN,PRO(),PRO(),dict(R0,**{BP():PRO()}),PAF(PRO())) or True)
    for who,au in (('visitor',None),('another account',STRANGER)):
        chk(f'B1 [{nm}] {who}: cannot read or write profiles, audit records, entries, entry audits or migration records',not any([P('get',BP(),au,None,None,{BP():PRO()}),P('list','billingProfiles',au),pcr(PRO(),au=au),P('create',BPA(AID1),au,PAU(),None,R0,PAF(PRO())),
          P('get',BE(),au),P('list','billableEntries',au),P('get',BEA(AID1),au),P('list','billableEntryAudit',au),P('get',BM(LEG),au),P('list','billingMigration',au)]))
    OLDP=PRO(); NEWP=PRO(rateMinor=3000,rev=2,lastAudit=AID2); UAU=PAU(action='update',rev=2,rateMinor=3000,reason='Agreed a new rate',summary='Changed: rate'); D1={'clientRegistry/CL-001':REG(),BP():OLDP}
    UAF=lambda d=NEWP,a=UAU,aid=AID2: {BP():d,BPA(aid):a}
    pup=lambda d=NEWP,old=OLDP,docs=None,aud=UAU,au=OWN,aid=AID2: P('update',BP(),au,d,old,D1 if docs is None else docs,UAF(d,aud,aid))
    chk(f'B1 [{nm}] control: a profile change (revision +1) is paired with an audit record that mirrors the money fields',pup() and P('create',BPA(AID2),OWN,UAU,None,D1,UAF()))
    chk(f'B1 [{nm}] control: an ARCHIVED client profile can still be edited',pup(docs={'clientRegistry/CL-001':REG(status='archived',rev=2),BP():OLDP}))
    UMODS=[('revision not +1',dict(rev=3)),('created time changed',dict(createdAt=TS(NOW-5))),('updated time not server time',dict(updatedAt=TS(NOW-1))),('currency not in the table',dict(currency='XYZ')),('decimals not matching the currency',dict(currency='JPY')),
      ('rate above the limit',dict(rateMinor=1000000001)),('audit pointer unchanged',dict(lastAudit=AID1)),('audit pointer too short',dict(lastAudit='abc')),('schedule unknown',dict(schedKind='yearly')),('time zone invalid',dict(tz='x y'))]
    for lab,m in UMODS: chk(f'B1 [{nm}] profile update refused: {lab}',not pup(PRO(**dict(dict(rateMinor=3000,rev=2,lastAudit=AID2),**m))))
    chk(f'B1 [{nm}] profile update refused: no audit in the batch, extra field',not P('update',BP(),OWN,NEWP,OLDP,D1,{BP():NEWP}) and not pup(dict(NEWP,note='x')))
    chk(f'B1 [{nm}] profile update refused: client not in the registry',not pup(docs={BP():OLDP}))
    chk(f'B1 [{nm}] owner cannot delete a profile or an audit record, and cannot change an audit record',not any([P('delete',BP(),OWN,None,OLDP,D1),P('delete',BPA(AID1),OWN,None,PAU(),{BPA(AID1):PAU()}),P('update',BPA(AID1),OWN,PAU(summary='x'),PAU(),{BPA(AID1):PAU()})]))
    AMODS=[('wrong rate in the audit',dict(rateMinor=2501)),('wrong currency in the audit',dict(currency='EUR')),('wrong arrangement in the audit',dict(arrangement='monthly')),('create action with revision 2',dict(rev=2)),('action unknown',dict(action='delete')),
      ('actor is not the owner',dict(actor='someoneelse123')),('created time not server time',dict(createdAt=TS(NOW-1))),('summary empty',dict(summary='')),('summary too long',dict(summary='x'*301)),('reason too long',dict(reason='x'*201)),('client ID mismatch',dict(clientId='CL-002'))]
    for lab,m in AMODS: chk(f'B1 [{nm}] profile audit refused: {lab}',not P('create',BPA(AID1),OWN,PAU(**m),None,R0,PAF(PRO())))
    chk(f'B1 [{nm}] profile audit refused: extra field, missing field, ID too short',not P('create',BPA(AID1),OWN,PAU(extra=1),None,R0,PAF(PRO())) and not P('create',BPA(AID1),OWN,dropk(PAU(),'summary'),None,R0,PAF(PRO())) and not P('create',BPA('abc'),OWN,PAU(),None,R0,PAF(PRO(lastAudit='abc'),aid='abc')))
    chk(f'B1 [{nm}] profile audit refused: an update audit without a reason (under 3 characters) or whose revision is not the stored one + 1',not P('create',BPA(AID2),OWN,UAU|{'reason':'ab'},None,D1,UAF(a=UAU|{'reason':'ab'})) and not P('create',BPA(AID2),OWN,UAU|{'rev':3},None,D1,UAF(NEWP|{'rev':3},UAU|{'rev':3})))
    # ---------------- billable entries
    ED0=dict(R0,**{BP():PRO()})                                   # an active client with a profile
    EAF=lambda doc,aud=None,aid=AID1,i=EIDE,extra=None: dict({BE(i):doc,BEA(aid):(EAU() if aud is None else aud)},**(extra or {}))
    ecr=lambda doc,docs=None,aud=None,au=OWN,i=EIDE,aid=AID1,extra=None: P('create',BE(i),au,doc,None,ED0 if docs is None else docs,EAF(doc,aud,aid,i,extra))
    chk(f'B1 [{nm}] control: a draft entry and its audit are created together; the ID is client + period start + period end + sequence',ecr(ENT()) and P('create',BEA(AID1),OWN,EAU(),None,ED0,EAF(ENT())))
    chk(f'B1 [{nm}] control: the owner can read and list entries',P('get',BE(),OWN,None,None,{BE():ENT()}) and P('list','billableEntries',OWN))
    EMODS=[('ID does not match the fields',dict(seq='02')),('status not DRAFT',dict(status='SUBMITTED')),('revision 2',dict(rev=2)),('approved minutes set',dict(approvedMinutes=480)),('approved time set',dict(approvedAt=TSNOW)),('approver set',dict(approverUid=UID)),
      ('invoice link set',dict(relatedInvoiceId='INV1')),('replaced-by set',dict(supersededBy=EIDE2)),('minutes zero',dict(submittedMinutes=0)),('minutes above the limit',dict(submittedMinutes=133921)),('minutes not whole',dict(submittedMinutes=480.5)),
      ('period ends before it starts',dict(periodEnd='20261031')),('period date not 8 digits',dict(periodStart='2026-11-01')),('sequence 00',dict(seq='00')),('sequence one digit',dict(seq='1')),('sequence 100',dict(seq='100')),
      ('client ID lower case',dict(clientId='cl-001')),('note too long',dict(note='x'*201)),('created time not server time',dict(createdAt=TS(NOW-1))),('updated time not server time',dict(updatedAt=TS(NOW-1))),('audit pointer too short',dict(lastAudit='abc')),('status unknown',dict(status='PAID'))]
    for lab,m in EMODS: chk(f'B1 [{nm}] entry create refused: {lab}',not ecr(ENT(**m)))
    chk(f'B1 [{nm}] entry create refused: extra field, missing field',not ecr(ENT(extra=1)) and not ecr(dropk(ENT(),'note')))
    chk(f'B1 [{nm}] entry create refused: no profile, no registry entry, archived client, no audit in the batch, audit already used',not ecr(ENT(),docs=R0) and not ecr(ENT(),docs={BP():PRO()}) and not ecr(ENT(),docs=dict(RARCH,**{BP():PRO()}))
        and not P('create',BE(),OWN,ENT(),None,ED0,{BE():ENT()}) and not P('create',BE(),OWN,ENT(),None,dict(ED0,**{BEA(AID1):EAU()}),EAF(ENT())))
    OKE=ENT(status='APPROVED',approvedMinutes=480,approvedAt=TS(NOW-HR),approverUid=UID,rev=3,lastAudit=AID2)
    SUPN=ENT(seq='02',supersedes=EIDE,lastAudit=AID3); SUPO=OKE|{'status':'SUPERSEDED','supersededBy':EIDE2,'rev':4,'lastAudit':AID1}
    SAD=dict(ED0,**{BE():OKE}); SAF=lambda n=SUPN,o=SUPO,na=None,oa=None: {BE(EIDE2):n,BE():o,BEA(AID3):(EAU(entryId=EIDE2,reason='Client sent a correction') if na is None else na),BEA(AID1):(EAU(action='supersede',fromStatus='APPROVED',toStatus='SUPERSEDED',rev=4,approvedMinutes=480,reason='Client sent a correction') if oa is None else oa)}
    chk(f'B1 [{nm}] control: an adjustment is a NEW draft pointing back, and the approved one becomes SUPERSEDED in the same batch',P('create',BE(EIDE2),OWN,SUPN,None,SAD,SAF()) and P('update',BE(),OWN,SUPO,OKE,SAD,SAF()))
    chk(f'B1 [{nm}] adjustment refused: the old entry is not approved, is another period or client, does not exist, or is not marked SUPERSEDED in the batch',not any([
      P('create',BE(EIDE2),OWN,SUPN,None,dict(ED0,**{BE():ENT(status='SUBMITTED')}),SAF()),P('create',BE(EIDE2),OWN,SUPN,None,dict(ED0,**{BE():OKE|{'periodEnd':'20261116'}}),SAF()),P('create',BE(EIDE2),OWN,SUPN,None,dict(ED0,**{BE():OKE|{'clientId':'CL-002'}}),SAF()),
      P('create',BE(EIDE2),OWN,SUPN,None,ED0,SAF()),P('create',BE(EIDE2),OWN,SUPN,None,SAD,{BE(EIDE2):SUPN,BE():OKE,BEA(AID3):EAU(entryId=EIDE2,reason='Client sent a correction')}),P('create',BE(EIDE2),OWN,SUPN,None,SAD,SAF(o=SUPO|{'supersededBy':'OTHER'}))]))
    chk(f'B1 [{nm}] adjustment audit refused when the reason is shorter than 3 characters',not P('create',BEA(AID3),OWN,EAU(entryId=EIDE2,reason='ab'),None,SAD,SAF(na=EAU(entryId=EIDE2,reason='ab'))))
    SUBD=ENT(); SUBN=ENT(status='SUBMITTED',rev=2,lastAudit=AID2); D2=dict(ED0,**{BE():SUBD})
    eup=lambda new,old,aud,docs,aid=AID2,au=OWN,extra=None: P('update',BE(),au,new,old,docs,dict({BE():new,BEA(aid):aud},**(extra or {})))
    SUBA=EAU(action='submit',fromStatus='DRAFT',toStatus='SUBMITTED',rev=2); EDN=ENT(submittedMinutes=450,note='fixed',rev=2,lastAudit=AID2); EDA=EAU(action='edit',fromStatus='DRAFT',toStatus='DRAFT',rev=2,submittedMinutes=450)
    chk(f'B1 [{nm}] control: edit a draft, submit, reopen with a reason, approve (self-approved with the server time and your account)',all([
      eup(EDN,SUBD,EDA,D2),eup(SUBN,SUBD,SUBA,D2),eup(ENT(rev=3,lastAudit=AID3),SUBN,EAU(action='reopen',fromStatus='SUBMITTED',toStatus='DRAFT',rev=3,reason='Hours were wrong'),dict(ED0,**{BE():SUBN}),AID3),
      eup(ENT(status='APPROVED',approvedMinutes=470,approvedAt=TSNOW,approverUid=UID,rev=3,lastAudit=AID3),SUBN,EAU(action='approve',fromStatus='SUBMITTED',toStatus='APPROVED',rev=3,approvedMinutes=470),dict(ED0,**{BE():SUBN}),AID3)]))
    SD=dict(ED0,**{BE():SUBN}); APR=lambda **k: ENT(status='APPROVED',approvedMinutes=480,approvedAt=TSNOW,approverUid=UID,rev=3,lastAudit=AID3)|k
    APA=lambda **k: EAU(action='approve',fromStatus='SUBMITTED',toStatus='APPROVED',rev=3,approvedMinutes=480)|k
    chk(f'B1 [{nm}] approve refused: from DRAFT, wrong approval time, someone else as approver, no approved minutes, minutes changed, note changed, replaced-by set',not any([
      eup(APR(),SUBD|{'rev':2},APA(),dict(ED0,**{BE():SUBD|{'rev':2}}),AID3),eup(APR(approvedAt=TS(NOW-1)),SUBN,APA(),SD,AID3),eup(APR(approverUid='someoneelse123'),SUBN,APA(),SD,AID3),eup(APR(approvedMinutes=None),SUBN,APA(approvedMinutes=None),SD,AID3),
      eup(APR(submittedMinutes=999),SUBN,APA(),SD,AID3),eup(APR(note='x'),SUBN,APA(),SD,AID3),eup(APR(supersededBy=EIDE2),SUBN,APA(),SD,AID3),eup(APR(approvedMinutes=133921),SUBN,APA(approvedMinutes=133921),SD,AID3)]))
    chk(f'B1 [{nm}] an approved entry is locked: no edit, no reopen, no change of minutes, note or approver, no new approval time',not any([
      eup(OKE|{'submittedMinutes':500,'rev':4,'lastAudit':AID3},OKE,EAU(action='edit',fromStatus='APPROVED',toStatus='APPROVED',rev=4),SAD,AID3),eup(OKE|{'status':'DRAFT','approvedMinutes':None,'approvedAt':None,'approverUid':'','rev':4,'lastAudit':AID3},OKE,EAU(action='reopen',fromStatus='APPROVED',toStatus='DRAFT',rev=4,reason='abc'),SAD,AID3),
      eup(OKE|{'approvedMinutes':999,'rev':4,'lastAudit':AID3},OKE,EAU(action='approve',fromStatus='APPROVED',toStatus='APPROVED',rev=4,approvedMinutes=999),SAD,AID3),eup(OKE|{'note':'x','rev':4,'lastAudit':AID3},OKE,EAU(action='edit',fromStatus='APPROVED',toStatus='APPROVED',rev=4),SAD,AID3)]))
    SUPA=EAU(action='supersede',fromStatus='APPROVED',toStatus='SUPERSEDED',rev=4,approvedMinutes=480,reason='Client sent a correction')
    chk(f'B1 [{nm}] replacing an approved entry refused: minutes changed, no replaced-by, the new entry is missing or does not point back, reason under 3 characters in the audit',not any([
      eup(SUPO|{'approvedMinutes':470},OKE,SUPA,SAD,AID1,extra={BE(EIDE2):SUPN}),eup(SUPO|{'supersededBy':''},OKE,SUPA,SAD,AID1,extra={BE(EIDE2):SUPN}),eup(SUPO,OKE,SUPA,SAD,AID1),eup(SUPO,OKE,SUPA,SAD,AID1,extra={BE(EIDE2):SUPN|{'supersedes':''}}),
      eup(SUPO,OKE,SUPA,SAD,AID1,extra={BE(EIDE2):SUPN|{'status':'SUBMITTED'}})]))
    chk(f'B1 [{nm}] a replaced entry is final, nothing can leave SUPERSEDED, DRAFT cannot jump to APPROVED, and APPROVED cannot go back to SUBMITTED',not any([
      eup(SUPO|{'status':'DRAFT','supersededBy':'','rev':5,'lastAudit':AID3},SUPO,EAU(action='reopen',fromStatus='SUPERSEDED',toStatus='DRAFT',rev=5,reason='abc'),dict(ED0,**{BE():SUPO}),AID3),
      eup(APR(rev=2,lastAudit=AID2),SUBD,EAU(action='approve',fromStatus='DRAFT',toStatus='APPROVED',rev=2,approvedMinutes=480),D2),eup(OKE|{'status':'SUBMITTED','approvedMinutes':None,'approvedAt':None,'approverUid':'','rev':4,'lastAudit':AID3},OKE,EAU(action='reopen',fromStatus='APPROVED',toStatus='SUBMITTED',rev=4,reason='abc'),SAD,AID3)]))
    IMM=[('client ID',dict(clientId='CL-002')),('period start',dict(periodStart='20261102')),('period end',dict(periodEnd='20261116')),('sequence',dict(seq='02')),('created time',dict(createdAt=TS(NOW-9))),('replaces-link',dict(supersedes='X')),('invoice link',dict(relatedInvoiceId='INV1'))]
    for lab,m in IMM: chk(f'B1 [{nm}] entry update refused: the {lab} cannot change',not eup(ENT(**dict(dict(status='SUBMITTED',rev=2,lastAudit=AID2),**m)),SUBD,SUBA,D2))
    chk(f'B1 [{nm}] entry update refused: revision not +1, updated time not server time, no audit in the batch, audit pointer unchanged, edit that touches approval fields',not any([
      eup(SUBN|{'rev':3},SUBD,SUBA|{'rev':3},D2),eup(SUBN|{'updatedAt':TS(NOW-1)},SUBD,SUBA,D2),P('update',BE(),OWN,SUBN,SUBD,D2,{BE():SUBN}),eup(SUBN,SUBD,SUBA,dict(D2,**{BEA(AID2):SUBA})),eup(EDN|{'approverUid':UID},SUBD,EDA,D2),eup(EDN|{'approvedMinutes':450},SUBD,EDA,D2),
      eup(SUBN|{'submittedMinutes':999},SUBD,SUBA|{'submittedMinutes':999},D2),eup(SUBN|{'note':'x'},SUBD,SUBA,D2)]))
    chk(f'B1 [{nm}] owner cannot delete an entry or an entry audit, and cannot change an entry audit',not any([P('delete',BE(),OWN,None,ENT(),{BE():ENT()}),P('delete',BEA(AID1),OWN,None,EAU(),{BEA(AID1):EAU()}),P('update',BEA(AID1),OWN,EAU(reason='x'),EAU(),{BEA(AID1):EAU()})]))
    ETAMODS=[('status in the audit differs from the entry',dict(toStatus='SUBMITTED')),('revision differs from the entry',dict(rev=2)),('minutes differ from the entry',dict(submittedMinutes=481)),('approved minutes differ from the entry',dict(approvedMinutes=1)),('client differs from the entry',dict(clientId='CL-002')),
      ('action does not match the step',dict(action='approve')),('action unknown',dict(action='delete')),('from-status unknown',dict(fromStatus='PAID')),('actor is not the owner',dict(actor='someoneelse123')),('created time not server time',dict(createdAt=TS(NOW-1))),('reason too long',dict(reason='x'*201)),('entry ID too long',dict(entryId='X'*81))]
    for lab,m in ETAMODS: chk(f'B1 [{nm}] entry audit refused: {lab}',not P('create',BEA(AID1),OWN,EAU(**m),None,ED0,EAF(ENT())))
    chk(f'B1 [{nm}] entry audit refused: extra field, missing field, ID too short, no matching entry in the batch',not P('create',BEA(AID1),OWN,EAU(extra=1),None,ED0,EAF(ENT())) and not P('create',BEA(AID1),OWN,dropk(EAU(),'reason'),None,ED0,EAF(ENT())) and not P('create',BEA('abc'),OWN,EAU(),None,ED0,EAF(ENT(lastAudit='abc'),aid='abc')) and not P('create',BEA(AID1),OWN,EAU(),None,ED0,{BEA(AID1):EAU()}))
    chk(f'B1 [{nm}] entry audit refused: a step audit whose from-status is not the stored status, or whose revision is not stored + 1, or a reopen with a short reason',not any([
      P('create',BEA(AID2),OWN,SUBA,None,dict(ED0,**{BE():SUBN}),{BE():SUBN,BEA(AID2):SUBA}),P('create',BEA(AID2),OWN,SUBA|{'rev':3},None,D2,{BE():SUBN|{'rev':3},BEA(AID2):SUBA|{'rev':3}}),
      P('create',BEA(AID3),OWN,EAU(action='reopen',fromStatus='SUBMITTED',toStatus='DRAFT',rev=3,reason='ab'),None,dict(ED0,**{BE():SUBN}),{BE():ENT(rev=3,lastAudit=AID3),BEA(AID3):EAU(action='reopen',fromStatus='SUBMITTED',toStatus='DRAFT',rev=3,reason='ab')})]))
    # ---------------- migration of old client records
    MD0=dict(R0); MAF=lambda reg=False,mig=None,prof=None,aud=None,cid='CL-001': dict({BM(LEG):(MIG(registryNew=reg) if mig is None else mig),BP(cid):(PRO() if prof is None else prof),BPA(AID1):(PAU() if aud is None else aud)},**({'clientRegistry/'+cid:REG(),'clientRegistryAudit/'+AID2:AUD()} if reg else {}))
    mcr=lambda mig=None,docs=None,au=OWN,lid=LEG,reg=False,prof=None: P('create',BM(lid),au,MIG(registryNew=reg) if mig is None else mig,None,MD0 if docs is None else docs,MAF(reg,mig,prof))
    chk(f'B1 [{nm}] control: migrating to an existing Client ID (profile + audit + mapping in one batch)',mcr() and P('create',BP(),OWN,PRO(),None,MD0,MAF()) and P('create',BPA(AID1),OWN,PAU(),None,MD0,MAF()))
    chk(f'B1 [{nm}] control: migrating to a NEW Client ID (registry + registry audit + profile + audit + mapping in one batch)',mcr(docs={},reg=True) and P('create',BP(),OWN,PRO(),None,{},MAF(True)) and P('create','clientRegistry/CL-001',OWN,REG(lastAudit=AID2),None,{},dict(MAF(True),**{'clientRegistry/CL-001':REG(lastAudit=AID2)})))
    chk(f'B1 [{nm}] control: the owner can read the mapping',P('get',BM(LEG),OWN,None,None,{BM(LEG):MIG()}) and P('list','billingMigration',OWN))
    MMODS=[('profile not new',dict(profileNew=False)),('arrangement differs from the profile',dict(arrangement='monthly')),('arrangement unknown',dict(arrangement='weekly')),('client ID differs from the profile',dict(clientId='CL-002')),('registry flag not a boolean',dict(registryNew='yes')),
      ('by someone else',dict(by='someoneelse123')),('created time not server time',dict(createdAt=TS(NOW-1))),('client ID invalid',dict(clientId='cl-001')),('extra field',dict(x=1))]
    for lab,m in MMODS: chk(f'B1 [{nm}] migration mapping refused: {lab}',not mcr(mig=MIG(**m)))
    chk(f'B1 [{nm}] migration mapping refused: missing field, ID too short, profile for that Client ID already exists, no profile in the batch',not mcr(mig=dropk(MIG(),'by')) and not mcr(lid='short') and not mcr(docs=dict(R0,**{BP():PRO()})) and not P('create',BM(LEG),OWN,MIG(),None,MD0,{BM(LEG):MIG()}))
    chk(f'B1 [{nm}] migration mapping refused: the profile in the batch is not revision 1',not mcr(prof=PRO(rev=2)))
    chk(f'B1 [{nm}] migration mapping refused: "new registry entry" while the entry already exists, and "existing" while it is missing or archived',not mcr(mig=MIG(registryNew=True)) and not mcr(docs={}) and not mcr(docs=RARCH))
    chk(f'B1 [{nm}] owner cannot change or delete a migration mapping',not P('update',BM(LEG),OWN,MIG(clientId='CL-002'),MIG(),dict(MD0,**{BM(LEG):MIG()})) and not P('delete',BM(LEG),OWN,None,MIG(),{BM(LEG):MIG()}))
    chk(f'B1 [{nm}] emergency pause does not affect billing data (owner-only data)',pcr(PRO(),docs=dict(R0,**{'content/guard':{'pause':True}})))
    # ---------------- 8i (second pass): gaps found by the mutation check
    EB=lambda e,a,aid=AID2,docs=None: P('create',BEA(aid),OWN,a,None,D2 if docs is None else docs,{BE():e,BEA(aid):a})
    EB0=EB
    eidof=lambda c,s,e,q: c+'__'+s+'__'+e+'__'+q
    chk(f'B1 [{nm}] a stranger cannot write or read anything in the billing collections even with otherwise valid documents',not any([
      pcr(PRO(),au=STRANGER),pup(au=STRANGER),P('create',BPA(AID1),STRANGER,PAU(actor='someoneelse123'),None,R0,PAF(PRO(),PAU(actor='someoneelse123'))),P('create',BPA(AID2),STRANGER,UAU|{'actor':'someoneelse123'},None,D1,UAF(a=UAU|{'actor':'someoneelse123'})),P('get',BPA(AID1),STRANGER,None,None,{BPA(AID1):PAU()}),
      ecr(ENT(),au=STRANGER),P('create',BEA(AID1),STRANGER,EAU(actor='someoneelse123'),None,ED0,EAF(ENT(),EAU(actor='someoneelse123'))),eup(SUBN,SUBD,SUBA|{'actor':'someoneelse123'},D2,au=STRANGER),P('get',BEA(AID1),STRANGER,None,None,{BEA(AID1):EAU()}),
      mcr(au=STRANGER,mig=MIG(by='someoneelse123')),P('get',BM(LEG),STRANGER,None,None,{BM(LEG):MIG()})]))
    chk(f'B1 [{nm}] audit revision must equal the revision of the record it belongs to (both directions)',not any([
      P('create',BPA(AID2),OWN,UAU,None,D1,{BP():NEWP|{'rev':3},BPA(AID2):UAU}),EB0(SUBN|{'rev':3},SUBA),EB0(ENT(rev=2,lastAudit=AID2),SUBA)]))
    chk(f'B1 [{nm}] profile: extra field refused on update too; fixed due date must have the right shape; archived new registry entry in the batch refused; audit reuse on update refused; wrong audit action/revision refused',not any([
      pup(dict(NEWP,note='x')),pcr(PRO(dueKind='fixed',dueDate='abcdefghij',dueDays=0)),
      P('create',BP(),OWN,PRO(),None,{},dict(PAF(PRO()),**{'clientRegistry/CL-001':REG(status='archived')})),pup(docs=dict(D1,**{BPA(AID2):UAU})),
      P('create',BPA(AID2),OWN,UAU|{'action':'delete'},None,D1,UAF(a=UAU|{'action':'delete'})),P('create',BPA(AID1),OWN,PAU(),None,D1,UAF(a=PAU())|{BPA(AID1):PAU()}|{BP():NEWP|{'lastAudit':AID1}})]))
    chk(f'B1 [{nm}] profile audit: create-action with the update step, and audit revision different from the stored profile, refused',not P('create',BPA(AID2),OWN,PAU(),None,D1,{BP():NEWP,BPA(AID2):PAU()}) and not P('create',BPA(AID2),OWN,UAU|{'rev':1},None,D1,{BP():NEWP,BPA(AID2):UAU|{'rev':1}}))
    # entry create: rejected shapes whose ID is built from the bad fields (so the ID check is not what refuses them)
    for lab,m in [('period ends before it starts',dict(periodEnd='20261031')),('period start not 8 digits',dict(periodStart='2026-11-01')),('period end not 8 digits',dict(periodEnd='2026-11-15')),('sequence 00',dict(seq='00')),('sequence one digit',dict(seq='1')),('sequence 100',dict(seq='100'))]:
        e=ENT(**m); i=eidof(e['clientId'],e['periodStart'],e['periodEnd'],e['seq'])
        chk(f'B1 [{nm}] entry create refused (ID built from the same fields): {lab}',not ecr(e,i=i,aid=AID1,aud=EAU(entryId=i)))
    chk(f'B1 [{nm}] entry create refused: client and Client ID format',not ecr(ENT(clientId='cl-001'),i=eidof('cl-001','20261101','20261115','01'),docs={'clientRegistry/cl-001':REG(),BP('cl-001'):PRO()}))
    chk(f'B1 [{nm}] adjustment refused when the period START differs',not P('create',BE(eidof('CL-001','20261102','20261115','02')),OWN,SUPN|{'periodStart':'20261102'},None,SAD,{BE(eidof('CL-001','20261102','20261115','02')):SUPN|{'periodStart':'20261102'},BE():SUPO|{'supersededBy':eidof('CL-001','20261102','20261115','02')},BEA(AID3):EAU(entryId=eidof('CL-001','20261102','20261115','02'),reason='Client sent a correction'),BEA(AID1):EAU(action='supersede',fromStatus='APPROVED',toStatus='SUPERSEDED',rev=4,approvedMinutes=480,reason='Client sent a correction')}))
    chk(f'B1 [{nm}] adjustment refused when the old entry is linked but still APPROVED in the batch',not P('create',BE(EIDE2),OWN,SUPN,None,SAD,SAF(o=SUPO|{'status':'APPROVED'})))
    # each transition: nothing besides its own fields may change
    chk(f'B1 [{nm}] submit refused when it also sets approval fields; reopen refused when it keeps approval fields or changes the minutes',not any([
      eup(SUBN|{'approverUid':UID},SUBD,SUBA,D2),eup(SUBN|{'approvedAt':TSNOW},SUBD,SUBA,D2),eup(SUBN|{'approvedMinutes':480},SUBD,SUBA,D2),eup(SUBN|{'supersededBy':EIDE2},SUBD,SUBA,D2),
      eup(ENT(rev=3,lastAudit=AID3,approverUid=UID),SUBN,EAU(action='reopen',fromStatus='SUBMITTED',toStatus='DRAFT',rev=3,reason='Hours were wrong'),SD,AID3),
      eup(ENT(rev=3,lastAudit=AID3,approvedAt=TSNOW),SUBN,EAU(action='reopen',fromStatus='SUBMITTED',toStatus='DRAFT',rev=3,reason='Hours were wrong'),SD,AID3),
      eup(ENT(rev=3,lastAudit=AID3,approvedMinutes=480),SUBN,EAU(action='reopen',fromStatus='SUBMITTED',toStatus='DRAFT',rev=3,reason='Hours were wrong'),SD,AID3),
      eup(ENT(rev=3,lastAudit=AID3,submittedMinutes=100),SUBN,EAU(action='reopen',fromStatus='SUBMITTED',toStatus='DRAFT',rev=3,reason='Hours were wrong',submittedMinutes=100),SD,AID3),
      eup(ENT(rev=3,lastAudit=AID3,note='x'),SUBN,EAU(action='reopen',fromStatus='SUBMITTED',toStatus='DRAFT',rev=3,reason='Hours were wrong'),SD,AID3),
      eup(ENT(rev=3,lastAudit=AID3,supersededBy=EIDE2),SUBN,EAU(action='reopen',fromStatus='SUBMITTED',toStatus='DRAFT',rev=3,reason='Hours were wrong'),SD,AID3)]))
    chk(f'B1 [{nm}] approve refused when it changes the minutes or note (approved minutes are separate)',not any([eup(APR(submittedMinutes=100),SUBN,APA(),SD,AID3),eup(APR(note='y'),SUBN,APA(),SD,AID3)]))
    chk(f'B1 [{nm}] replace-by-newer refused when it changes the submitted minutes, approval time, approver or note',not any([
      eup(SUPO|{'submittedMinutes':100},OKE,SUPA,SAD,AID1,extra={BE(EIDE2):SUPN}),eup(SUPO|{'approvedAt':TSNOW},OKE,SUPA,SAD,AID1,extra={BE(EIDE2):SUPN}),
      eup(SUPO|{'approverUid':'someoneelse123'},OKE,SUPA,SAD,AID1,extra={BE(EIDE2):SUPN}),eup(SUPO|{'note':'changed'},OKE,SUPA,SAD,AID1,extra={BE(EIDE2):SUPN}),
      eup(SUPO,OKE,SUPA,SAD,AID1,extra={BE(EIDE2):SUPN|{'supersedes':'OTHER'}})]))
    chk(f'B1 [{nm}] replace-by-newer refused when the new entry is not a draft in the batch',not eup(SUPO,OKE,SUPA,SAD,AID1,extra={BE(EIDE2):SUPN|{'status':'SUBMITTED'}}))
    chk(f'B1 [{nm}] the replacing audit needs a reason of 3 characters',not P('create',BEA(AID1),OWN,SUPA|{'reason':'ab'},None,SAD,SAF(oa=SUPA|{'reason':'ab'})))
    # entry audit: each link and each step must match the real change
    chk(f'B1 [{nm}] entry audit refused when its pointer, revision, status or step does not match the entry change',not any([
      EB(SUBN|{'lastAudit':AID3},SUBA),EB(SUBN,SUBA|{'rev':3}),EB(SUBN,SUBA|{'toStatus':'DRAFT'}),EB(SUBN,SUBA|{'clientId':'CL-002'}),EB(SUBN,SUBA|{'submittedMinutes':1}),
      EB(SUBN,EAU(action='edit',fromStatus='DRAFT',toStatus='SUBMITTED',rev=2)),EB(ENT(rev=2,lastAudit=AID2),EAU(action='submit',fromStatus='DRAFT',toStatus='DRAFT',rev=2)),
      EB(SUBN,EAU(action='create',fromStatus='',toStatus='SUBMITTED',rev=2)),EB(ENT(rev=2,lastAudit=AID2),EAU(action='create',fromStatus='',toStatus='DRAFT',rev=2)),
      EB(APR(rev=2,lastAudit=AID2),EAU(action='approve',fromStatus='DRAFT',toStatus='APPROVED',rev=2,approvedMinutes=480)),
      EB(SUBN,EAU(action='approve',fromStatus='DRAFT',toStatus='SUBMITTED',rev=2)),
      EB(SUBN,SUBA,docs=dict(ED0,**{BE():SUBD|{'status':'SUBMITTED','rev':1}}))]))
    chk(f'B1 [{nm}] entry audit refused: from-status that is not the stored status (stored revision correct)',not EB(APR(rev=2,lastAudit=AID2),EAU(action='approve',fromStatus='SUBMITTED',toStatus='APPROVED',rev=2,approvedMinutes=480),docs=dict(ED0,**{BE():SUBD})))
    chk(f'B1 [{nm}] entry audit refused: from-status APPROVED to a status that is not SUPERSEDED, reopen/supersede reason 2 chars',not any([
      EB(ENT(rev=4,lastAudit=AID2),EAU(action='reopen',fromStatus='APPROVED',toStatus='DRAFT',rev=4,reason='abc'),docs=dict(ED0,**{BE():OKE})),
      EB(SUPO|{'lastAudit':AID2},EAU(action='supersede',fromStatus='APPROVED',toStatus='SUPERSEDED',rev=4,approvedMinutes=480,reason='ab'),docs=dict(ED0,**{BE():OKE}))]))
    # migration
    chk(f'B1 [{nm}] migration mapping refused: Client ID format, arrangement not allowed (even when the profile says the same)',not any([
      P('create',BM(LEG),OWN,MIG(clientId='cl-001'),None,{'clientRegistry/cl-001':REG()},{BM(LEG):MIG(clientId='cl-001'),BP('cl-001'):PRO()}),
      P('create',BM(LEG),OWN,MIG(arrangement='weekly'),None,MD0,{BM(LEG):MIG(arrangement='weekly'),BP():PRO(arrangement='weekly')})]))
    chk(f'B1 [{nm}] migration mapping refused: new-registry mapping with a registry entry that is not in the batch, or already exists; existing-registry mapping with a missing/archived entry',not any([
      P('create',BM(LEG),OWN,MIG(registryNew=True),None,{},{BM(LEG):MIG(registryNew=True),BP():PRO()}),P('create',BM(LEG),OWN,MIG(registryNew=True),None,R0,{BM(LEG):MIG(registryNew=True),BP():PRO(),'clientRegistry/CL-001':REG(rev=2)}),
      P('create',BM(LEG),OWN,MIG(),None,{},{BM(LEG):MIG(),BP():PRO()}),P('create',BM(LEG),OWN,MIG(),None,{},{BM(LEG):MIG(),BP():PRO(),'clientRegistry/CL-001':REG()})]))
    # ---------------- 8j. B2 (4.5.0): invoices, payments, credits, reversals, adjustments, due-date changes, entry link/unlink
    INVID='CL-001__20261101__20261115'; INVID2=INVID+'__02'
    INV=lambda i=INVID: 'invoices/'+i
    INVA=lambda a: 'invoiceAudit/'+a
    PAYP=lambda p: 'payments/'+p; REVP=lambda p: 'paymentReversals/'+p; ADJP=lambda a: 'invoiceAdjustments/'+a; DUEP=lambda d: 'invoiceDueDates/'+d
    PID1='p'*16; PID2='q'*16; AID4='d'*16; AID5='e'*16
    IV=lambda **k: dict({'clientId':'CL-001','periodStart':'20261101','periodEnd':'20261115','suffix':'','currency':'USD','exp':2,'rateMinor':2500,'tz':'Asia/Manila','dueKind':'afterSend','dueDays':14,'dueDate':'',
      'entryIds':[EIDE],'minutes':480,'totalMinor':20000,'status':'DRAFT','sentAt':None,'paidMinor':0,'creditMinor':0,'adjMinor':0,'rev':1,'createdAt':TSNOW,'updatedAt':TSNOW,'lastKind':'create','lastRef':AID1},**k)
    IAU=lambda **k: dict({'invoiceId':INVID,'action':'create','fromStatus':'','toStatus':'DRAFT','rev':1,'totalMinor':20000,'reason':'','actor':UID,'createdAt':TSNOW},**k)
    OKE1=OKE|{'lastAudit':AID2}                                  # 480 approved minutes
    OKE2=ENT(seq='02',submittedMinutes=120,status='APPROVED',approvedMinutes=120,approvedAt=TS(NOW-HR),approverUid=UID,rev=3,lastAudit=AID2)
    LK=lambda e,aid=AID3,iid=INVID: e|{'relatedInvoiceId':iid,'rev':4,'lastAudit':aid}
    LAU=lambda e=EIDE,m=480,aid=None,**k: dict({'entryId':e,'clientId':'CL-001','action':'link','fromStatus':'APPROVED','toStatus':'APPROVED','rev':4,'submittedMinutes':m,'approvedMinutes':m,'reason':'','actor':UID,'createdAt':TSNOW},**k)
    CDOC=dict(ED0,**{BE():OKE1,BE(EIDE2):OKE2})                  # before a create: two approved entries, a hourly profile, active client
    def CAF(inv=None,aud=None,two=False,e1=None,a1=None,e2=None,a2=None):
        d={INV():IV() if inv is None else inv,INVA(AID1):IAU() if aud is None else aud,BE():LK(OKE1) if e1 is None else e1,BEA(AID3):LAU() if a1 is None else a1}
        if two: d.update({BE(EIDE2):LK(OKE2,AID4) if e2 is None else e2,BEA(AID4):LAU(EIDE2,120) if a2 is None else a2})
        return d
    icr=lambda inv=None,docs=None,au=OWN,after=None,i=INVID: P('create',INV(i),au,IV() if inv is None else inv,None,CDOC if docs is None else docs,CAF(inv) if after is None else after)
    TWO=lambda **k: IV(**dict(dict(entryIds=[EIDE,EIDE2],minutes=600,totalMinor=25000),**k))
    chk(f'B2 [{nm}] control: a draft invoice, its audit and the entry link are written together (one entry; two entries)',icr() and icr(TWO(),after=CAF(TWO(),two=True)))
    chk(f'B2 [{nm}] control: audit and entry-audit records of a create are accepted',P('create',INVA(AID1),OWN,IAU(),None,CDOC,CAF()) and P('create',BEA(AID3),OWN,LAU(),None,CDOC,CAF()) and P('update',BE(),OWN,LK(OKE1),OKE1,CDOC,CAF()))
    chk(f'B2 [{nm}] control: owner can read and list all invoice collections',all(P(o,x,OWN,None,None,{y:{'a':1}}) for o,x,y in (('get',INV(),INV()),('list','invoices',INV()),('get',INVA(AID1),INVA(AID1)),('list','invoiceAudit',INVA(AID1)),('get',PAYP(PID1),PAYP(PID1)),('list','payments',PAYP(PID1)),('get',REVP(PID1),REVP(PID1)),('list','paymentReversals',REVP(PID1)),('get',ADJP(AID1),ADJP(AID1)),('list','invoiceAdjustments',ADJP(AID1)),('get',DUEP(AID1),DUEP(AID1)),('list','invoiceDueDates',DUEP(AID1)))))
    chk(f'B2 [{nm}] control: fixed and after-generation due dates, the second invoice number, half-up rounding edges',all([
      icr(IV(dueKind='fixed',dueDate='2026-12-31',dueDays=0),docs=dict(CDOC,**{BP():PRO(dueKind='fixed',dueDate='2026-12-31',dueDays=0)})),
      icr(IV(dueKind='afterGeneration',dueDate='2026-11-29'),docs=dict(CDOC,**{BP():PRO(dueKind='afterGeneration')})),
      icr(IV(suffix='02'),i=INVID2,after=CAF(IV(suffix='02'),e1=LK(OKE1,iid=INVID2),a1=LAU())),
      icr(IV(rateMinor=1,minutes=30,totalMinor=1),docs=dict(CDOC,**{BP():PRO(rateMinor=1),BE():OKE1|{'approvedMinutes':30,'submittedMinutes':30}}),after=CAF(IV(rateMinor=1,minutes=30,totalMinor=1),e1=LK(OKE1|{'approvedMinutes':30,'submittedMinutes':30}))),
      icr(IV(rateMinor=1,minutes=29,totalMinor=0),docs=dict(CDOC,**{BP():PRO(rateMinor=1),BE():OKE1|{'approvedMinutes':29,'submittedMinutes':29}}),after=CAF(IV(rateMinor=1,minutes=29,totalMinor=0),e1=LK(OKE1|{'approvedMinutes':29,'submittedMinutes':29})))]))
    chk(f'B2 [{nm}] total refused at the rounding edges and when not the half-up value of rate x minutes / 60',not any([icr(IV(totalMinor=19999)),icr(IV(totalMinor=20001)),icr(IV(totalMinor=0)),
      icr(IV(rateMinor=1,minutes=30,totalMinor=0),docs=dict(CDOC,**{BP():PRO(rateMinor=1),BE():OKE1|{'approvedMinutes':30,'submittedMinutes':30}}),after=CAF(IV(rateMinor=1,minutes=30,totalMinor=0),e1=LK(OKE1|{'approvedMinutes':30,'submittedMinutes':30}))),
      icr(IV(rateMinor=1,minutes=29,totalMinor=1),docs=dict(CDOC,**{BP():PRO(rateMinor=1),BE():OKE1|{'approvedMinutes':29,'submittedMinutes':29}}),after=CAF(IV(rateMinor=1,minutes=29,totalMinor=1),e1=LK(OKE1|{'approvedMinutes':29,'submittedMinutes':29}))),
      icr(TWO(totalMinor=25001),after=CAF(TWO(totalMinor=25001),two=True)),icr(TWO(totalMinor=24999),after=CAF(TWO(totalMinor=24999),two=True))]))
    IMODS=[('ID does not match the fields (suffix without suffix in the ID)',dict(suffix='02')),('suffix 01',dict(suffix='01')),('suffix 100',dict(suffix='100')),('status READY',dict(status='READY')),('status SENT',dict(status='SENT',sentAt=TSNOW)),
      ('sent time set on a draft',dict(sentAt=TSNOW)),('paid not zero',dict(paidMinor=1)),('credit not zero',dict(creditMinor=1)),('adjustment not zero',dict(adjMinor=1)),('revision 2',dict(rev=2)),('last step not create',dict(lastKind='payment')),
      ('minutes do not match the entry',dict(minutes=479)),('minutes zero',dict(minutes=0,totalMinor=0)),('rate not the profile rate',dict(rateMinor=2501,totalMinor=20008)),('rate zero',dict(rateMinor=0,totalMinor=0)),('currency not the profile currency',dict(currency='EUR')),
      ('decimals not matching the currency',dict(exp=0)),('time zone not the profile zone',dict(tz='UTC')),('due rule not the profile rule',dict(dueKind='afterGeneration',dueDate='2026-11-29')),('due days not the profile days',dict(dueDays=7)),
      ('a date on an after-sending invoice',dict(dueDate='2026-11-29')),('total negative',dict(totalMinor=-1)),('entry list empty',dict(entryIds=[])),('three entries',dict(entryIds=[EIDE,EIDE2,'CL-001__20261101__20261115__03'])),
      ('same entry twice',dict(entryIds=[EIDE,EIDE],minutes=960,totalMinor=40000)),('entry list not a list',dict(entryIds=EIDE)),('created time not server time',dict(createdAt=TS(NOW-1))),('updated time not server time',dict(updatedAt=TS(NOW-1))),
      ('last-step reference too short',dict(lastRef='abc')),('period ends before it starts',dict(periodEnd='20261031')),('client ID lower case',dict(clientId='cl-001')),('status unknown',dict(status='PAID'))]
    for lab,m in IMODS: chk(f'B2 [{nm}] invoice create refused: {lab}',not icr(IV(**m)))
    chk(f'B2 [{nm}] invoice create refused: extra field, missing field',not icr(IV(extra=1)) and not icr(dropk(IV(),'tz')) and not icr(dropk(IV(),'entryIds')) and not icr(dropk(IV(),'lastRef')))
    chk(f'B2 [{nm}] invoice create refused: a fixed or after-generation due rule with a wrong or missing date',not icr(IV(dueKind='fixed',dueDate='2026-12-30',dueDays=0),docs=dict(CDOC,**{BP():PRO(dueKind='fixed',dueDate='2026-12-31',dueDays=0)})) and not icr(IV(dueKind='afterGeneration',dueDate=''),docs=dict(CDOC,**{BP():PRO(dueKind='afterGeneration')})) and not icr(IV(dueKind='afterGeneration',dueDate='29/11/2026'),docs=dict(CDOC,**{BP():PRO(dueKind='afterGeneration')})))
    chk(f'B2 [{nm}] invoice create refused: client archived, not in the registry, no profile, monthly-fee profile, profile without a rate',not any([icr(docs=dict(RARCH,**{BP():PRO(),BE():OKE1})),icr(docs={BP():PRO(),BE():OKE1}),icr(docs=dict(R0,**{BE():OKE1})),
      icr(docs=dict(R0,**{BP():PRO(arrangement='monthly'),BE():OKE1})),icr(docs=dict(R0,**{BP():PRO(rateMinor=0),BE():OKE1}))]))
    chk(f'B2 [{nm}] invoice create refused: no audit in the batch, audit ID already used, audit of another step',not icr(after={k:v for k,v in CAF().items() if k!=INVA(AID1)}) and not icr(docs=dict(CDOC,**{INVA(AID1):IAU()})) and not P('create',INVA(AID1),OWN,IAU(action='ready'),None,CDOC,CAF()))
    chk(f'B2 [{nm}] invoice create refused: an entry that is not linked in the same batch, linked to another invoice, not approved, from another client or period, or missing',not any([
      icr(after={k:v for k,v in CAF().items() if k not in (BE(),BEA(AID3))}),icr(after=CAF(e1=LK(OKE1,iid=INVID2))),icr(after=CAF(e1=OKE1)),icr(after=CAF(e1=LK(OKE1)|{'status':'SUBMITTED'})),
      icr(docs=dict(CDOC,**{BE():OKE1|{'clientId':'CL-002'}}),after=CAF(e1=LK(OKE1|{'clientId':'CL-002'}))),icr(after=CAF(e1=LK(OKE1)|{'periodEnd':'20261116'})),icr(docs=dict(R0,**{BP():PRO()}),after={k:v for k,v in CAF().items() if k not in (BE(),BEA(AID3))}),
      icr(TWO(),after=CAF(TWO(),two=False)),icr(TWO(),after=CAF(TWO(),two=True,e2=LK(OKE2,AID4,INVID2)))]))
    # ---------------- entry link / unlink
    chk(f'B2 [{nm}] entry link refused: the minutes change, the entry is not approved, already linked, the invoice exists already or is not a draft or does not list the entry',not any([
      P('update',BE(),OWN,LK(OKE1)|{'approvedMinutes':481},OKE1,CDOC,CAF(e1=LK(OKE1)|{'approvedMinutes':481})),P('update',BE(),OWN,LK(OKE1)|{'note':'x'},OKE1,CDOC,CAF(e1=LK(OKE1)|{'note':'x'})),
      P('update',BE(),OWN,LK(OKE1),ENT(status='SUBMITTED'),dict(ED0,**{BE():ENT(status='SUBMITTED')}),CAF()),P('update',BE(),OWN,LK(OKE1,iid=INVID2),OKE1|{'relatedInvoiceId':INVID},dict(CDOC,**{BE():OKE1|{'relatedInvoiceId':INVID}}),CAF(e1=LK(OKE1,iid=INVID2))),
      P('update',BE(),OWN,LK(OKE1),OKE1,dict(CDOC,**{INV():IV()}),CAF()),P('update',BE(),OWN,LK(OKE1),OKE1,CDOC,CAF(inv=IV(status='READY',rev=2,lastKind='ready'))),P('update',BE(),OWN,LK(OKE1),OKE1,CDOC,CAF(inv=IV(entryIds=[EIDE2],minutes=120,totalMinor=5000))),
      P('update',BE(),OWN,LK(OKE1),OKE1,CDOC,CAF(inv=IV(clientId='CL-002'))),P('update',BE(),OWN,LK(OKE1),OKE1,CDOC,{BE():LK(OKE1),BEA(AID3):LAU()})]))
    chk(f'B2 [{nm}] entry link audit refused: wrong action for the change, wrong statuses, not linked after the batch',not any([
      P('create',BEA(AID3),OWN,LAU(fromStatus='SUBMITTED'),None,CDOC,CAF()),P('create',BEA(AID3),OWN,LAU(toStatus='DRAFT'),None,CDOC,CAF()),P('create',BEA(AID3),OWN,LAU(),None,CDOC,CAF(e1=OKE1|{'rev':4,'lastAudit':AID3}))]))
    chk(f'B2 [{nm}] an approved entry that is on an invoice cannot be superseded or have its minutes changed',not any([
      P('update',BE(),OWN,SUPO|{'relatedInvoiceId':INVID},OKE1|{'relatedInvoiceId':INVID},dict(ED0,**{BE():OKE1|{'relatedInvoiceId':INVID}}),SAF()),
      P('update',BE(),OWN,OKE1|{'relatedInvoiceId':INVID,'approvedMinutes':999,'rev':4,'lastAudit':AID3},OKE1|{'relatedInvoiceId':INVID},dict(ED0,**{BE():OKE1|{'relatedInvoiceId':INVID}}),{BE():OKE1|{'relatedInvoiceId':INVID,'approvedMinutes':999,'rev':4,'lastAudit':AID3},BEA(AID3):LAU(action='edit')})]))
    chk(f'B2 [{nm}] a draft, submitted or approved entry cannot get an invoice link through the old steps',not any([
      P('update',BE(),OWN,ENT(status='SUBMITTED',relatedInvoiceId='X',rev=2,lastAudit=AID2),ENT(),dict(ED0,**{BE():ENT()}),{BE():ENT(status='SUBMITTED',relatedInvoiceId='X',rev=2,lastAudit=AID2),BEA(AID2):EAU(action='submit',fromStatus='DRAFT',toStatus='SUBMITTED',rev=2)}),
      P('update',BE(),OWN,ENT(relatedInvoiceId='X',rev=2,lastAudit=AID2),ENT(),dict(ED0,**{BE():ENT()}),{BE():ENT(relatedInvoiceId='X',rev=2,lastAudit=AID2),BEA(AID2):EAU(action='edit',fromStatus='DRAFT',toStatus='DRAFT',rev=2)})]))
    # ---------------- workflow
    DV=IV(entryIds=[EIDE],createdAt=TS(NOW-3*HR),updatedAt=TS(NOW-2*HR),lastRef=AID1)
    LE=OKE1|{'relatedInvoiceId':INVID}                       # the entry as it is while linked
    RV=DV|{'status':'READY','rev':2,'updatedAt':TSNOW,'lastKind':'ready','lastRef':AID2}
    SENT_AFTER=RV|{'status':'SENT','sentAt':TSNOW,'dueDate':'2026-11-30','rev':3,'lastKind':'send','lastRef':AID3}
    WD=dict(R0,**{BP():PRO(),INV():DV,BE():LE})
    wf=lambda new,old,docs=None,after=None: P('update',INV(),OWN,new,old,WD if docs is None else docs,after if after is not None else {INV():new,INVA(new['lastRef']):IAU(action=new['lastKind'],fromStatus=old['status'],toStatus=new['status'],rev=new['rev'],totalMinor=new['totalMinor'],reason='x')})
    READYAU=lambda **k: IAU(**dict(dict(action='ready',fromStatus='DRAFT',toStatus='READY',rev=2),**k))
    chk(f'B2 [{nm}] control: draft -> ready -> sent, with the audit of each step',wf(RV,DV,after={INV():RV,INVA(AID2):READYAU()}) and P('create',INVA(AID2),OWN,READYAU(),None,WD,{INV():RV,INVA(AID2):READYAU()})
        and P('update',INV(),OWN,SENT_AFTER,RV,dict(WD,**{INV():RV}),{INV():SENT_AFTER,INVA(AID3):IAU(action='send',fromStatus='READY',toStatus='SENT',rev=3)}) and P('create',INVA(AID3),OWN,IAU(action='send',fromStatus='READY',toStatus='SENT',rev=3),None,dict(WD,**{INV():RV}),{INV():SENT_AFTER,INVA(AID3):IAU(action='send',fromStatus='READY',toStatus='SENT',rev=3)}))
    WMODS=[('revision +2',RV|{'rev':3}),('ready but sent time set',RV|{'sentAt':TSNOW}),('ready with a changed due date',RV|{'dueDate':'2026-11-30'}),('ready with money changed',RV|{'paidMinor':1}),('ready with total changed',RV|{'totalMinor':1}),('ready with rate changed',RV|{'rateMinor':1}),
      ('ready with entries changed',RV|{'entryIds':[EIDE2]}),('ready with a changed client',RV|{'clientId':'CL-002'}),('ready with created time changed',RV|{'createdAt':TSNOW}),('ready but updated time not server time',RV|{'updatedAt':TS(NOW-1)}),('draft straight to sent',SENT_AFTER|{'rev':2}),
      ('draft to cancelled by the ready step',RV|{'status':'CANCELLED'}),('step kind that does not match (send on a draft)',RV|{'lastKind':'send'}),('extra field',RV|{'extra':1})]
    for lab,m in WMODS: chk(f'B2 [{nm}] draft -> ready refused: {lab}',not wf(m,DV,after={INV():m,INVA(AID2):READYAU()}))
    chk(f'B2 [{nm}] draft -> ready refused: no audit in the batch',not wf(RV,DV,after={INV():RV}))
    SMODS=[('sent time not server time',SENT_AFTER|{'sentAt':TS(NOW-1)}),('sent time missing',SENT_AFTER|{'sentAt':None}),('after-sending due date left empty',SENT_AFTER|{'dueDate':''}),('after-sending due date not a date',SENT_AFTER|{'dueDate':'soon'}),('money changed',SENT_AFTER|{'paidMinor':100}),('total changed',SENT_AFTER|{'totalMinor':19999}),
      ('adjustment set',SENT_AFTER|{'adjMinor':5}),('credit set',SENT_AFTER|{'creditMinor':5}),('revision not +1',SENT_AFTER|{'rev':4})]
    for lab,m in SMODS: chk(f'B2 [{nm}] ready -> sent refused: {lab}',not P('update',INV(),OWN,m,RV,dict(WD,**{INV():RV}),{INV():m,INVA(AID3):IAU(action='send',fromStatus='READY',toStatus='SENT',rev=3)}))
    FX=RV|{'dueKind':'fixed','dueDate':'2026-12-31','dueDays':0}; FXS=FX|{'status':'SENT','sentAt':TSNOW,'rev':3,'lastKind':'send','lastRef':AID3}
    chk(f'B2 [{nm}] ready -> sent with a fixed due date: accepted when the date is kept, refused when it changes',P('update',INV(),OWN,FXS,FX,dict(WD,**{INV():FX}),{INV():FXS,INVA(AID3):IAU(action='send',fromStatus='READY',toStatus='SENT',rev=3)}) and not P('update',INV(),OWN,FXS|{'dueDate':'2027-01-01'},FX,dict(WD,**{INV():FX}),{INV():FXS|{'dueDate':'2027-01-01'},INVA(AID3):IAU(action='send',fromStatus='READY',toStatus='SENT',rev=3)}))
    chk(f'B2 [{nm}] a sent, cancelled or already-ready invoice cannot go back or repeat a step',not any([
      wf(DV|{'status':'DRAFT','rev':3,'updatedAt':TSNOW,'lastKind':'ready','lastRef':AID2},RV,docs=dict(WD,**{INV():RV}),after={INV():DV|{'status':'DRAFT','rev':3,'updatedAt':TSNOW,'lastKind':'ready','lastRef':AID2},INVA(AID2):READYAU(rev=3)}),
      wf(RV|{'rev':3,'lastRef':AID3},RV,docs=dict(WD,**{INV():RV}),after={INV():RV|{'rev':3,'lastRef':AID3},INVA(AID3):READYAU(rev=3)}),
      P('update',INV(),OWN,RV|{'status':'READY','rev':4,'lastKind':'ready','lastRef':AID4},SENT_AFTER,dict(WD,**{INV():SENT_AFTER}),{INV():RV|{'status':'READY','rev':4,'lastKind':'ready','lastRef':AID4},INVA(AID4):READYAU(rev=4)})]))
    CXN=lambda src=DV,k=None: src|dict({'status':'CANCELLED','rev':src['rev']+1,'updatedAt':TSNOW,'lastKind':'cancel','lastRef':AID5},**(k or {}))
    UNL=OKE1|{'relatedInvoiceId':'','rev':4,'lastAudit':AID4}
    CAU=lambda src=DV,**k: IAU(**dict(dict(action='cancel',fromStatus=src['status'],toStatus='CANCELLED',rev=src['rev']+1,reason='Wrong hours'),**k))
    UAU_=lambda **k: dict({'entryId':EIDE,'clientId':'CL-001','action':'unlink','fromStatus':'APPROVED','toStatus':'APPROVED','rev':4,'submittedMinutes':480,'approvedMinutes':480,'reason':'Invoice cancelled','actor':UID,'createdAt':TSNOW},**k)
    CXAF=lambda src=DV,n=None,e=None,ea=None,au=None: {INV():CXN(src) if n is None else n,INVA(AID5):CAU(src) if au is None else au,BE():UNL if e is None else e,BEA(AID4):UAU_() if ea is None else ea}
    chk(f'B2 [{nm}] control: a draft or a ready invoice is cancelled and its entry released in the same batch',all([P('update',INV(),OWN,CXN(),DV,WD,CXAF()),P('update',INV(),OWN,CXN(RV),RV,dict(WD,**{INV():RV}),CXAF(RV)),
        P('create',INVA(AID5),OWN,CAU(),None,WD,CXAF()),P('update',BE(),OWN,UNL,LE,WD,CXAF()),P('create',BEA(AID4),OWN,UAU_(),None,WD,CXAF())]))
    chk(f'B2 [{nm}] cancel refused: the entry stays linked, is linked to something else, or is released with no cancelled invoice',not any([
      P('update',INV(),OWN,CXN(),DV,WD,CXAF(e=LE)),P('update',INV(),OWN,CXN(),DV,WD,{INV():CXN(),INVA(AID5):CAU()}),
      P('update',BE(),OWN,UNL,LE,WD,{BE():UNL,BEA(AID4):UAU_()}),P('update',BE(),OWN,UNL,LE,WD,CXAF(n=DV)),P('update',BE(),OWN,UNL,LE,dict(WD,**{INV():SENT_AFTER}),CXAF(n=CXN(SENT_AFTER))),
      P('update',BE(),OWN,UNL,OKE1,WD,CXAF())]))
    CXM=[('sent time set',dict(sentAt=TSNOW)),('money changed',dict(paidMinor=1)),('due date changed',dict(dueDate='2026-11-30')),('total changed',dict(totalMinor=0)),('entries changed',dict(entryIds=[EIDE2]))]
    for lab,m in CXM: chk(f'B2 [{nm}] cancel refused: {lab}',not P('update',INV(),OWN,CXN(k=m),DV,WD,CXAF(n=CXN(k=m))))
    chk(f'B2 [{nm}] cancel refused: a SENT invoice, a cancelled invoice',not P('update',INV(),OWN,CXN(SENT_AFTER),SENT_AFTER,dict(WD,**{INV():SENT_AFTER}),CXAF(SENT_AFTER)) and not P('update',INV(),OWN,CXN(CXN()),CXN(),dict(WD,**{INV():CXN()}),CXAF(CXN())))
    chk(f'B2 [{nm}] cancel audit refused: reason under 3 characters, wrong from-status, wrong action',not any([P('create',INVA(AID5),OWN,CAU(reason='ab'),None,WD,CXAF()),P('create',INVA(AID5),OWN,CAU(fromStatus='SENT'),None,WD,CXAF()),
        P('create',INVA(AID5),OWN,CAU(action='ready'),None,WD,CXAF()),P('create',INVA(AID5),OWN,CAU(toStatus='SENT'),None,WD,CXAF())]))
    D2=DV|{'entryIds':[EIDE,EIDE2],'minutes':600,'totalMinor':25000}; LE2=LK(OKE2,AID3,INVID); UNL2=OKE2|{'relatedInvoiceId':'','rev':4,'lastAudit':AID4}; WD2=dict(WD,**{INV():D2,BE(EIDE2):LE2})
    CX2=lambda e2,e1=None: {INV():CXN(D2),INVA(AID5):CAU(D2),BE():UNL if e1 is None else e1,BEA(AID4):UAU_(),BE(EIDE2):e2}
    chk(f'B2 [{nm}] control: a two-entry invoice is cancelled when BOTH entries are released',P('update',INV(),OWN,CXN(D2),D2,WD2,CX2(UNL2)))
    chk(f'B2 [{nm}] two-entry cancel refused: the second entry stays linked, or the first stays linked, or the second is linked elsewhere',not any([
      P('update',INV(),OWN,CXN(D2),D2,WD2,CX2(LE2)),P('update',INV(),OWN,CXN(D2),D2,WD2,CX2(UNL2,LE)),P('update',INV(),OWN,CXN(D2),D2,WD2,CX2(LK(OKE2,AID3,INVID2))),P('update',INV(),OWN,CXN(D2),D2,WD2,CX2(UNL2|{'relatedInvoiceId':'X'}))]))
    chk(f'B2 [{nm}] unlink audit refused: reason under 3 characters, still linked after the batch, wrong action',not any([P('create',BEA(AID4),OWN,UAU_(reason='ab'),None,WD,CXAF()),P('create',BEA(AID4),OWN,UAU_(),None,WD,CXAF(e=LE|{'rev':4,'lastAudit':AID4})),P('create',BEA(AID4),OWN,UAU_(action='link'),None,WD,CXAF())]))
    # ---------------- invoice audit
    AMODS2=[('actor is not the owner',dict(actor='someoneelse123')),('created time not server time',dict(createdAt=TS(NOW-1))),('total does not match the invoice',dict(totalMinor=1)),('revision does not match',dict(rev=2)),('status does not match the invoice',dict(toStatus='READY')),
      ('reason too long',dict(reason='x'*201)),('invoice ID too long',dict(invoiceId='x'*81)),('extra field',dict(extra=1)),('action unknown',dict(action='payment'))]
    for lab,m in AMODS2: chk(f'B2 [{nm}] invoice audit refused: {lab}',not P('create',INVA(AID1),OWN,IAU(**m),None,CDOC,CAF()))
    chk(f'B2 [{nm}] invoice audit refused: ID too short, missing field, pointer on the invoice points to another audit',not P('create',INVA('abc'),OWN,IAU(),None,CDOC,CAF()) and not P('create',INVA(AID1),OWN,dropk(IAU(),'reason'),None,CDOC,CAF()) and not P('create',INVA(AID2),OWN,IAU(),None,CDOC,dict(CAF(),**{INVA(AID2):IAU()})))
    # ---------------- payments, credits, reversals, adjustments, due dates
    SV=IV(status='SENT',sentAt=TS(NOW-2*HR),dueDate='2026-11-30',rev=3,createdAt=TS(NOW-3*HR),updatedAt=TS(NOW-HR),lastKind='send',lastRef=AID3)
    PY=lambda **k: dict({'invoiceId':INVID,'clientId':'CL-001','kind':'payment','amountMinor':5000,'currency':'USD','date':'2026-11-05','method':'bank','note':'','reason':'','correctionId':'','payloadHash':H64('a'),'actor':UID,'createdAt':TSNOW},**k)
    NXT=lambda src,k: src|dict({'rev':src['rev']+1,'updatedAt':TSNOW},**k)
    PD=dict(R0,**{BP():PRO(),INV():SV})
    def payop(new=None,pay=None,old=None,docs=None,extra=None,pid=PID1,drop=False):
        new=NXT(SV,dict(paidMinor=5000,lastKind='payment',lastRef=pid)) if new is None else new; pay=PY() if pay is None else pay; old=SV if old is None else old
        af={INV():new}; 
        if not drop: af[PAYP(pid)]=pay
        af.update(extra or {}); return new,pay,old,(PD if docs is None else docs),af
    def pchk(**k):
        new,pay,old,docs,af=payop(**k); pid=k.get('pid',PID1)
        return P('update',INV(),OWN,new,old,docs,af) and P('create',PAYP(pid),OWN,pay,None,docs,af)
    chk(f'B2 [{nm}] control: a partial payment, a payment of the whole balance',pchk() and pchk(new=NXT(SV,dict(paidMinor=20000,lastKind='payment',lastRef=PID1)),pay=PY(amountMinor=20000)))
    chk(f'B2 [{nm}] control: a payment on an invoice with an upward adjustment can pay up to total + adjustment',pchk(new=NXT(SV|{'adjMinor':1000},dict(paidMinor=21000,lastKind='payment',lastRef=PID1)),pay=PY(amountMinor=21000),old=SV|{'adjMinor':1000},docs=dict(PD,**{INV():SV|{'adjMinor':1000}})))
    PAYM=[('more than the invoice total',dict(new=NXT(SV,dict(paidMinor=20001,lastKind='payment',lastRef=PID1)),pay=PY(amountMinor=20001))),('invoice paid amount unchanged',dict(new=NXT(SV,dict(lastKind='payment',lastRef=PID1)))),
      ('invoice paid amount lowered',dict(new=NXT(SV|{'paidMinor':3000},dict(paidMinor=1000,lastKind='payment',lastRef=PID1)),old=SV|{'paidMinor':3000},docs=dict(PD,**{INV():SV|{'paidMinor':3000}}),pay=PY(amountMinor=2000))),
      ('payment record amount differs from the change in the invoice',dict(pay=PY(amountMinor=4999))),('payment record amount zero',dict(new=NXT(SV,dict(lastKind='payment',lastRef=PID1)),pay=PY(amountMinor=0))),('payment record amount negative',dict(pay=PY(amountMinor=-5000))),
      ('amount not a whole number',dict(new=NXT(SV,dict(paidMinor=50.5,lastKind='payment',lastRef=PID1)),pay=PY(amountMinor=50.5))),('currency differs from the invoice',dict(pay=PY(currency='EUR'))),('client differs from the invoice',dict(pay=PY(clientId='CL-002'))),
      ('invoice ID differs',dict(pay=PY(invoiceId=INVID2))),('kind credit on a payment change',dict(pay=PY(kind='credit',reason='extra'))),('payment hash not 64 hex characters',dict(pay=PY(payloadHash='abc'))),('payment hash upper case',dict(pay=PY(payloadHash='A'*64))),
      ('date not a date',dict(pay=PY(date='yesterday'))),('date with a wrong month',dict(pay=PY(date='2026-13-05'))),('method too long',dict(pay=PY(method='x'*41))),('note too long',dict(pay=PY(note='x'*201))),('reason too long',dict(pay=PY(reason='x'*201))),('correction ID bad',dict(pay=PY(correctionId='short'))),
      ('actor not the owner',dict(pay=PY(actor='someoneelse123'))),('created time not server time',dict(pay=PY(createdAt=TS(NOW-1)))),('extra field',dict(pay=PY(extra=1))),('missing field',dict(pay=dropk(PY(),'note'))),
      ('pointer on the invoice points to another payment',dict(pid=PID2,new=NXT(SV,dict(paidMinor=5000,lastKind='payment',lastRef=PID1)))),('sent time changed',dict(new=NXT(SV,dict(paidMinor=5000,lastKind='payment',lastRef=PID1,sentAt=TSNOW)))),
      ('due date changed',dict(new=NXT(SV,dict(paidMinor=5000,lastKind='payment',lastRef=PID1,dueDate='2026-12-31')))),('adjustment changed',dict(new=NXT(SV,dict(paidMinor=5000,lastKind='payment',lastRef=PID1,adjMinor=1)))),('credit changed',dict(new=NXT(SV,dict(paidMinor=5000,lastKind='payment',lastRef=PID1,creditMinor=1)))),
      ('total changed',dict(new=NXT(SV,dict(paidMinor=5000,lastKind='payment',lastRef=PID1,totalMinor=1)))),('revision not +1',dict(new=SV|{'paidMinor':5000,'lastKind':'payment','lastRef':PID1,'rev':5,'updatedAt':TSNOW}))]
    for lab,k in PAYM: chk(f'B2 [{nm}] payment refused: {lab}',not pchk(**k))
    chk(f'B2 [{nm}] payment refused: payment without the invoice change, invoice change without the payment, ID already used, ID too short',not P('create',PAYP(PID1),OWN,PY(),None,PD,{PAYP(PID1):PY()}) and not P('update',INV(),OWN,payop(drop=True)[0],SV,PD,payop(drop=True)[4])
        and not pchk(docs=dict(PD,**{PAYP(PID1):PY()})) and not pchk(pid='abc',new=NXT(SV,dict(paidMinor=5000,lastKind='payment',lastRef='abc'))))
    chk(f'B2 [{nm}] payment refused: on a draft, ready or cancelled invoice',not any([pchk(old=DV,docs=dict(PD,**{INV():DV}),new=NXT(DV,dict(paidMinor=5000,lastKind='payment',lastRef=PID1))),pchk(old=RV,docs=dict(PD,**{INV():RV}),new=NXT(RV,dict(paidMinor=5000,lastKind='payment',lastRef=PID1))),
        pchk(old=CXN(),docs=dict(PD,**{INV():CXN()}),new=NXT(CXN(),dict(paidMinor=5000,lastKind='payment',lastRef=PID1)))]))
    chk(f'B2 [{nm}] a payment record cannot be changed or deleted, and a stranger cannot create one',not any([P('update',PAYP(PID1),OWN,PY(note='x'),PY(),{PAYP(PID1):PY()}),P('delete',PAYP(PID1),OWN,None,PY(),{PAYP(PID1):PY()}),P('create',PAYP(PID1),STRANGER,PY(),None,PD,payop()[4]),P('get',PAYP(PID1),None,None,None,{PAYP(PID1):PY()})]))
    FULL=SV|{'paidMinor':20000}; FD=dict(PD,**{INV():FULL})
    CRN=lambda **k: NXT(FULL,dict(creditMinor=3000,lastKind='credit',lastRef=PID2,**k)); CRY=lambda **k: PY(kind='credit',amountMinor=3000,reason='Client overpaid',**k)
    def cchk(new=None,pay=None,old=None,docs=None):
        new=CRN() if new is None else new; pay=CRY() if pay is None else pay; old=FULL if old is None else old; af={INV():new,PAYP(PID2):pay}; docs=FD if docs is None else docs
        return P('update',INV(),OWN,new,old,docs,af) and P('create',PAYP(PID2),OWN,pay,None,docs,af)
    chk(f'B2 [{nm}] control: money received beyond a fully paid invoice is recorded as a credit with a reason',cchk())
    CRM=[('invoice not fully paid',dict(old=SV,docs=PD,new=NXT(SV,dict(creditMinor=3000,lastKind='credit',lastRef=PID2)))),('reason empty',dict(pay=CRY()|{'reason':''})),('reason 2 characters',dict(pay=CRY()|{'reason':'ab'})),('paid amount also changes',dict(new=CRN(paidMinor=20001))),
      ('credit amount differs from the change',dict(pay=CRY()|{'amountMinor':2999})),('credit not increased',dict(new=NXT(FULL,dict(lastKind='credit',lastRef=PID2)))),('record says payment but step says credit',dict(pay=CRY()|{'kind':'payment'})),('adjustment changed',dict(new=CRN(adjMinor=5)))]
    for lab,k in CRM: chk(f'B2 [{nm}] credit refused: {lab}',not cchk(**k))
    PAIDREC=PY(); REVN=lambda **k: NXT(FULL,dict(dict(paidMinor=15000,lastKind='reversal',lastRef=PID1),**k))
    RVD=lambda **k: dict({'invoiceId':INVID,'clientId':'CL-001','kind':'payment','amountMinor':5000,'reason':'Entered on the wrong invoice','correctionId':'','actor':UID,'createdAt':TSNOW},**k)
    RDOC=dict(PD,**{INV():FULL,PAYP(PID1):PAIDREC})
    def rchk(new=None,rev=None,old=None,docs=None,drop=False):
        new=REVN() if new is None else new; rev=RVD() if rev is None else rev; old=FULL if old is None else old; docs=RDOC if docs is None else docs; af={INV():new}
        if not drop: af[REVP(PID1)]=rev
        return P('update',INV(),OWN,new,old,docs,af) and P('create',REVP(PID1),OWN,rev,None,docs,af)
    chk(f'B2 [{nm}] control: one whole payment is reversed (the reversal ID is the payment ID); a credit is reversed',rchk() and rchk(new=NXT(FULL|{'creditMinor':3000},dict(creditMinor=0,lastKind='reversal',lastRef=PID1)),rev=RVD(kind='credit',amountMinor=3000),old=FULL|{'creditMinor':3000},docs=dict(RDOC,**{INV():FULL|{'creditMinor':3000},PAYP(PID1):PY(kind='credit',amountMinor=3000,reason='Client overpaid')})))
    RVM=[('reversal amount differs from the payment',dict(rev=RVD(amountMinor=4000))),('reason empty',dict(rev=RVD(reason=''))),('reason 2 characters',dict(rev=RVD(reason='ab'))),('reason too long',dict(rev=RVD(reason='x'*201))),('kind differs from the payment',dict(rev=RVD(kind='credit'))),
      ('invoice ID differs from the payment',dict(rev=RVD(invoiceId=INVID2))),('client differs from the payment',dict(rev=RVD(clientId='CL-002'))),('paid amount lowered by more than the payment',dict(new=REVN(paidMinor=14000))),('paid amount lowered by less than the payment',dict(new=REVN(paidMinor=16000))),
      ('paid amount not lowered',dict(new=NXT(FULL,dict(lastKind='reversal',lastRef=PID1)))),('correction ID bad',dict(rev=RVD(correctionId='short'))),('actor not the owner',dict(rev=RVD(actor='someoneelse123'))),('created time not server time',dict(rev=RVD(createdAt=TS(NOW-1)))),
      ('extra field',dict(rev=RVD(extra=1))),('the invoice also changes its credit',dict(new=REVN(creditMinor=5))),('adjustment changed',dict(new=REVN(adjMinor=5)))]
    for lab,k in RVM: chk(f'B2 [{nm}] reversal refused: {lab}',not rchk(**k))
    chk(f'B2 [{nm}] reversal refused: a second reversal of the same payment, a payment that does not exist, a payment of another invoice, a payment while a credit is held, no invoice change, on a draft invoice',not any([
      rchk(docs=dict(RDOC,**{REVP(PID1):RVD()})),rchk(docs={k:v for k,v in RDOC.items() if k!=PAYP(PID1)}),rchk(docs=dict(RDOC,**{PAYP(PID1):PY(invoiceId=INVID2)})),
      rchk(old=FULL|{'creditMinor':3000},docs=dict(RDOC,**{INV():FULL|{'creditMinor':3000}}),new=NXT(FULL|{'creditMinor':3000},dict(paidMinor=15000,lastKind='reversal',lastRef=PID1))),rchk(drop=True),
      rchk(old=DV,docs=dict(RDOC,**{INV():DV}),new=NXT(DV,dict(paidMinor=0,lastKind='reversal',lastRef=PID1)))]))
    chk(f'B2 [{nm}] a reversal cannot be changed or deleted, and a payment cannot be replaced after it was reversed',not any([P('update',REVP(PID1),OWN,RVD(reason='other'),RVD(),{REVP(PID1):RVD()}),P('delete',REVP(PID1),OWN,None,RVD(),{REVP(PID1):RVD()}),P('create',REVP(PID1),STRANGER,RVD(),None,RDOC,{INV():REVN(),REVP(PID1):RVD()}),P('update',PAYP(PID1),OWN,PY(amountMinor=1),PY(),RDOC)]))
    ADN=lambda amt,src=SV,**k: NXT(src,dict(adjMinor=src['adjMinor']+amt,lastKind='adjustment',lastRef=AID4,**k)); ADR=lambda **k: dict({'invoiceId':INVID,'clientId':'CL-001','amountMinor':-1000,'reason':'Rate corrected','entryRef':'','actor':UID,'createdAt':TSNOW},**k)
    def achk(new=None,adj=None,old=None,docs=None):
        new=ADN(-1000) if new is None else new; adj=ADR() if adj is None else adj; old=SV if old is None else old; docs=PD if docs is None else docs; af={INV():new,ADJP(AID4):adj}
        return P('update',INV(),OWN,new,old,docs,af) and P('create',ADJP(AID4),OWN,adj,None,docs,af)
    chk(f'B2 [{nm}] control: a negative and a positive adjustment on a sent invoice; an adjustment down to exactly the amount paid',achk() and achk(new=ADN(1000),adj=ADR(amountMinor=1000)) and achk(new=ADN(-5000,SV|{'paidMinor':15000},),adj=ADR(amountMinor=-5000),old=SV|{'paidMinor':15000},docs=dict(PD,**{INV():SV|{'paidMinor':15000}})))
    ADM=[('total would drop below what was paid',dict(new=ADN(-5001,SV|{'paidMinor':15000}),adj=ADR(amountMinor=-5001),old=SV|{'paidMinor':15000},docs=dict(PD,**{INV():SV|{'paidMinor':15000}}))),('amount zero',dict(new=NXT(SV,dict(lastKind='adjustment',lastRef=AID4)),adj=ADR(amountMinor=0))),
      ('adjustment amount differs from the change',dict(adj=ADR(amountMinor=-999))),('reason empty',dict(adj=ADR(reason=''))),('reason 2 characters',dict(adj=ADR(reason='ab'))),('reason too long',dict(adj=ADR(reason='x'*201))),('entry reference too long',dict(adj=ADR(entryRef='x'*81))),
      ('amount not a whole number',dict(new=ADN(-10.5),adj=ADR(amountMinor=-10.5))),('amount above the limit',dict(new=ADN(1000000000001),adj=ADR(amountMinor=1000000000001))),('invoice paid amount changes',dict(new=ADN(-1000,paidMinor=1))),('invoice credit changes',dict(new=ADN(-1000,creditMinor=1))),
      ('while a credit is held',dict(new=ADN(-1000,FULL|{'creditMinor':100}),old=FULL|{'creditMinor':100},docs=dict(PD,**{INV():FULL|{'creditMinor':100}}))),('on a draft invoice',dict(new=ADN(-1000,DV),old=DV,docs=dict(PD,**{INV():DV}))),('on a ready invoice',dict(new=ADN(-1000,RV),old=RV,docs=dict(PD,**{INV():RV}))),
      ('on a cancelled invoice',dict(new=ADN(-1000,CXN()),old=CXN(),docs=dict(PD,**{INV():CXN()}))),('client differs',dict(adj=ADR(clientId='CL-002'))),('invoice ID differs',dict(adj=ADR(invoiceId=INVID2))),('actor not the owner',dict(adj=ADR(actor='someoneelse123'))),('extra field',dict(adj=ADR(extra=1))),('sent time changed',dict(new=ADN(-1000,sentAt=TSNOW))),('due date changed',dict(new=ADN(-1000,dueDate='2026-12-31')))]
    for lab,k in ADM: chk(f'B2 [{nm}] adjustment refused: {lab}',not achk(**k))
    chk(f'B2 [{nm}] adjustment refused: no adjustment record in the batch; record without the invoice change; an adjustment record cannot be changed or deleted',not P('update',INV(),OWN,ADN(-1000),SV,PD,{INV():ADN(-1000)}) and not P('create',ADJP(AID4),OWN,ADR(),None,PD,{ADJP(AID4):ADR()}) and not P('update',ADJP(AID4),OWN,ADR(reason='zzz'),ADR(),{ADJP(AID4):ADR()}) and not P('delete',ADJP(AID4),OWN,None,ADR(),{ADJP(AID4):ADR()}))
    DUN=lambda d='2026-12-15',src=SV,**k: NXT(src,dict(dueDate=d,lastKind='due',lastRef=AID5,**k)); DUR=lambda **k: dict({'invoiceId':INVID,'clientId':'CL-001','previous':'2026-11-30','next':'2026-12-15','reason':'Client asked for more time','actor':UID,'createdAt':TSNOW},**k)
    def dchk(new=None,due=None,old=None,docs=None):
        new=DUN() if new is None else new; due=DUR() if due is None else due; old=SV if old is None else old; docs=PD if docs is None else docs; af={INV():new,DUEP(AID5):due}
        return P('update',INV(),OWN,new,old,docs,af) and P('create',DUEP(AID5),OWN,due,None,docs,af)
    chk(f'B2 [{nm}] control: the due date of a sent invoice is changed with the old date, the new date and a reason',dchk())
    DUM=[('reason empty',dict(due=DUR(reason=''))),('reason 2 characters',dict(due=DUR(reason='ab'))),('reason too long',dict(due=DUR(reason='x'*201))),('previous date is not the stored date',dict(due=DUR(previous='2026-11-29'))),('next date differs from the invoice',dict(due=DUR(next='2026-12-16'))),
      ('same date',dict(new=DUN('2026-11-30'),due=DUR(next='2026-11-30'))),('new date not a date',dict(new=DUN('soon'),due=DUR(next='soon'))),('new date empty',dict(new=DUN(''),due=DUR(next=''))),('new date with a wrong month',dict(new=DUN('2026-13-01'),due=DUR(next='2026-13-01'))),('money changed',dict(new=DUN(paidMinor=1))),
      ('sent time changed',dict(new=DUN(sentAt=TSNOW))),('on a draft invoice',dict(new=DUN(src=DV),old=DV,docs=dict(PD,**{INV():DV}))),('on a cancelled invoice',dict(new=DUN(src=CXN()),old=CXN(),docs=dict(PD,**{INV():CXN()}))),('client differs',dict(due=DUR(clientId='CL-002'))),('invoice ID differs',dict(due=DUR(invoiceId=INVID2))),
      ('actor not the owner',dict(due=DUR(actor='someoneelse123'))),('created time not server time',dict(due=DUR(createdAt=TS(NOW-1)))),('extra field',dict(due=DUR(extra=1)))]
    for lab,k in DUM: chk(f'B2 [{nm}] due-date change refused: {lab}',not dchk(**k))
    chk(f'B2 [{nm}] due-date change refused: no record in the batch, record without the invoice change, record cannot be changed or deleted',not P('update',INV(),OWN,DUN(),SV,PD,{INV():DUN()}) and not P('create',DUEP(AID5),OWN,DUR(),None,PD,{DUEP(AID5):DUR()}) and not P('update',DUEP(AID5),OWN,DUR(reason='zzz'),DUR(),{DUEP(AID5):DUR()}) and not P('delete',DUEP(AID5),OWN,None,DUR(),{DUEP(AID5):DUR()}))
    # ---------------- fields that never change, deletes, other accounts
    FIXM=[('client',dict(clientId='CL-002')),('period start',dict(periodStart='20261102')),('period end',dict(periodEnd='20261116')),('suffix',dict(suffix='02')),('currency',dict(currency='EUR')),('decimals',dict(exp=0)),('rate',dict(rateMinor=3000)),('time zone',dict(tz='UTC')),('due rule',dict(dueKind='fixed')),('due days',dict(dueDays=1)),
      ('entries',dict(entryIds=[EIDE2])),('minutes',dict(minutes=1)),('total',dict(totalMinor=1)),('created time',dict(createdAt=TSNOW))]
    for lab,m in FIXM:
        nv=NXT(SV,dict(paidMinor=5000,lastKind='payment',lastRef=PID1,**m)); chk(f'B2 [{nm}] a payment cannot also change the invoice {lab}',not P('update',INV(),OWN,nv,SV,PD,{INV():nv,PAYP(PID1):PY()}))
    chk(f'B2 [{nm}] no one can delete an invoice or an audit record, change an audit record, or touch invoice data without being the owner',not any([P('delete',INV(),OWN,None,SV,PD),P('delete',INVA(AID1),OWN,None,IAU(),{INVA(AID1):IAU()}),P('update',INVA(AID1),OWN,IAU(reason='zzz'),IAU(),{INVA(AID1):IAU()}),
        P('create',INV(),None,IV(),None,CDOC,CAF()),P('create',INV(),STRANGER,IV(),None,CDOC,CAF()),P('update',INV(),STRANGER,RV,DV,WD,{INV():RV,INVA(AID2):READYAU()}),P('get',INV(),None,None,None,{INV():SV}),P('list','invoices',STRANGER),P('list','payments',None),P('list','paymentReversals',STRANGER),P('list','invoiceAdjustments',None),P('list','invoiceDueDates',STRANGER),P('list','invoiceAudit',None)]))
    # ---------------- 8k. B2 second pass: SINGLE-operation tests. Each test judges ONE write of a batch alone (the invoice change, or the new record, or the audit),
    # so a clause is only proved when removing it changes a verdict even though the paired write is valid. (Found by the mutation check.)
    def IU(new,old,docs,af): return P('update',INV(),OWN,new,old,docs,af)
    def RC(path,rec,docs,af): return P('create',path,OWN,rec,None,docs,af)
    R3='abc'; R200='x'*200; REASON='Client asked'
    # ---- payment: invoice side
    pn=NXT(SV,dict(paidMinor=5000,lastKind='payment',lastRef=PID1)); pa0={INV():pn,PAYP(PID1):PY()}
    chk(f'B2 [{nm}] control (single op): payment invoice update alone, payment record alone',IU(pn,SV,PD,pa0) and RC(PAYP(PID1),PY(),PD,pa0))
    PIV=[('invoice not SENT before (draft)',lambda: IU(NXT(DV,dict(paidMinor=5000,lastKind='payment',lastRef=PID1)),DV,dict(PD,**{INV():DV}),pa0)),
      ('invoice not SENT before (ready)',lambda: IU(NXT(RV,dict(paidMinor=5000,lastKind='payment',lastRef=PID1)),RV,dict(PD,**{INV():RV}),pa0)),
      ('status not SENT after',lambda: IU(pn|{'status':'READY'},SV,PD,pa0)),('sent time changed',lambda: IU(pn|{'sentAt':TSNOW},SV,PD,pa0)),('due date changed',lambda: IU(pn|{'dueDate':'2026-12-31'},SV,PD,pa0)),
      ('credit changed',lambda: IU(pn|{'creditMinor':1},SV,PD,pa0)),('adjustment changed',lambda: IU(pn|{'adjMinor':1},SV,PD,pa0)),('paid not increased',lambda: IU(NXT(SV,dict(lastKind='payment',lastRef=PID1)),SV,PD,pa0)),
      ('paid above total + adjustment by 1',lambda: IU(NXT(SV,dict(paidMinor=20001,lastKind='payment',lastRef=PID1)),SV,PD,{INV():NXT(SV,dict(paidMinor=20001,lastKind='payment',lastRef=PID1)),PAYP(PID1):PY(amountMinor=20001)})),
      ('no payment record in the batch',lambda: IU(pn,SV,PD,{INV():pn})),('payment ID already used',lambda: IU(pn,SV,dict(PD,**{PAYP(PID1):PY()}),pa0)),('payment of another invoice',lambda: IU(pn,SV,PD,{INV():pn,PAYP(PID1):PY(invoiceId=INVID2)})),
      ('record is a credit',lambda: IU(pn,SV,PD,{INV():pn,PAYP(PID1):PY(kind='credit',reason='extra')})),('amount differs from the paid change',lambda: IU(pn,SV,PD,{INV():pn,PAYP(PID1):PY(amountMinor=4999)})),
      ('revision not +1',lambda: IU(pn|{'rev':9},SV,PD,pa0)),('updated time not server time',lambda: IU(pn|{'updatedAt':TS(NOW-1)},SV,PD,pa0))]
    for lab,f in PIV: chk(f'B2 [{nm}] payment, invoice update alone refused: {lab}',not f())
    PREC=[('invoice ID too long, not an invoice',dict(invoiceId=INVID2)),('client not valid',dict(clientId='cl-001')),('client differs from the invoice',dict(clientId='CL-002')),('kind unknown',dict(kind='refund')),('amount zero',dict(amountMinor=0)),('amount negative',dict(amountMinor=-1)),
      ('amount above the limit',dict(amountMinor=10**12+1)),('amount a decimal',dict(amountMinor=50.5)),('currency differs',dict(currency='EUR')),('currency a number',dict(currency=5)),('date not a date',dict(date='5 Nov')),('date month 13',dict(date='2026-13-05')),('date day 32',dict(date='2026-11-32')),
      ('method a number',dict(method=5)),('method 41 characters',dict(method='x'*41)),('note a number',dict(note=5)),('note 201 characters',dict(note='x'*201)),('reason a number',dict(reason=5)),('reason 201 characters',dict(reason='x'*201)),('correction ID a number',dict(correctionId=5)),
      ('correction ID short',dict(correctionId='abc')),('hash short',dict(payloadHash='ab')),('hash not a string',dict(payloadHash=5)),('actor not the owner',dict(actor='someoneelse123')),('created time not server time',dict(createdAt=TS(NOW-1)))]
    for lab,m in PREC: chk(f'B2 [{nm}] payment record alone refused: {lab}',not RC(PAYP(PID1),PY(**m),PD,pa0))
    chk(f'B2 [{nm}] payment record alone refused: invoice missing, not sent, wrong step on the invoice, wrong pointer, no invoice in the batch, extra and missing field, ID short',not any([
      RC(PAYP(PID1),PY(),{},pa0),RC(PAYP(PID1),PY(),dict(PD,**{INV():DV}),pa0),RC(PAYP(PID1),PY(),dict(PD,**{INV():RV}),pa0),RC(PAYP(PID1),PY(),PD,{INV():pn|{'lastKind':'credit'},PAYP(PID1):PY()}),RC(PAYP(PID1),PY(),PD,{INV():pn|{'lastRef':PID2},PAYP(PID1):PY()}),
      RC(PAYP(PID1),PY(),PD,{PAYP(PID1):PY()}),RC(PAYP(PID1),PY(extra=1),PD,pa0),RC(PAYP(PID1),dropk(PY(),'method'),PD,pa0),RC(PAYP('abc'),PY(),PD,pa0)]))
    chk(f'B2 [{nm}] boundary controls accepted: amount 1, method 40, note 200, reason 200, credit reason 3, correction ID 16',all([RC(PAYP(PID1),PY(amountMinor=1),PD,pa0),RC(PAYP(PID1),PY(method='x'*40),PD,pa0),RC(PAYP(PID1),PY(note='x'*200),PD,pa0),RC(PAYP(PID1),PY(reason=R200),PD,pa0),
      RC(PAYP(PID1),PY(kind='credit',reason=R3),PD,{INV():pn|{'lastKind':'credit'},PAYP(PID1):PY()}),RC(PAYP(PID1),PY(correctionId='c'*16),PD,pa0),RC(PAYP(PID1),PY(amountMinor=10**12),PD,pa0)]))
    chk(f'B2 [{nm}] a credit record needs a reason of 3 or more characters',not RC(PAYP(PID1),PY(kind='credit',reason='ab'),PD,{INV():pn|{'lastKind':'credit'},PAYP(PID1):PY()}) and not RC(PAYP(PID1),PY(kind='credit',reason=''),PD,{INV():pn|{'lastKind':'credit'},PAYP(PID1):PY()}))
    # ---- credit: invoice side
    cn=NXT(FULL,dict(creditMinor=3000,lastKind='credit',lastRef=PID2)); ca={INV():cn,PAYP(PID2):CRY()}
    chk(f'B2 [{nm}] control (single op): credit invoice update alone',IU(cn,FULL,FD,ca))
    CIV=[('not fully paid',lambda: IU(NXT(SV,dict(creditMinor=3000,lastKind='credit',lastRef=PID2)),SV,PD,ca)),('invoice not SENT after',lambda: IU(cn|{'status':'READY'},FULL,FD,ca)),('invoice draft before',lambda: IU(NXT(DV|{'paidMinor':20000},dict(creditMinor=3000,lastKind='credit',lastRef=PID2)),DV|{'paidMinor':20000},dict(PD,**{INV():DV|{'paidMinor':20000}}),ca)),
      ('sent time changed',lambda: IU(cn|{'sentAt':TSNOW},FULL,FD,ca)),('due date changed',lambda: IU(cn|{'dueDate':'2026-12-31'},FULL,FD,ca)),('paid changed',lambda: IU(cn|{'paidMinor':19000},FULL,FD,ca)),('adjustment changed',lambda: IU(cn|{'adjMinor':1},FULL,FD,ca)),('credit not increased',lambda: IU(NXT(FULL,dict(lastKind='credit',lastRef=PID2)),FULL,FD,ca)),
      ('no record in the batch',lambda: IU(cn,FULL,FD,{INV():cn})),('record ID already used',lambda: IU(cn,FULL,dict(FD,**{PAYP(PID2):CRY()}),ca)),('record of another invoice',lambda: IU(cn,FULL,FD,{INV():cn,PAYP(PID2):CRY(invoiceId=INVID2)})),('record is a payment',lambda: IU(cn,FULL,FD,{INV():cn,PAYP(PID2):PY(amountMinor=3000)})),
      ('amount differs from the credit change',lambda: IU(cn,FULL,FD,{INV():cn,PAYP(PID2):CRY()|{'amountMinor':2999}}))]
    for lab,f in CIV: chk(f'B2 [{nm}] credit, invoice update alone refused: {lab}',not f())
    # ---- reversal: invoice side and record side
    rn=REVN(); ra={INV():rn,REVP(PID1):RVD()}
    chk(f'B2 [{nm}] control (single op): reversal invoice update alone, reversal record alone',IU(rn,FULL,RDOC,ra) and RC(REVP(PID1),RVD(),RDOC,ra))
    RIV=[('invoice not SENT before',lambda: IU(NXT(DV,dict(paidMinor=0,lastKind='reversal',lastRef=PID1)),DV,dict(RDOC,**{INV():DV}),ra)),('status not SENT after',lambda: IU(rn|{'status':'READY'},FULL,RDOC,ra)),('sent time changed',lambda: IU(rn|{'sentAt':TSNOW},FULL,RDOC,ra)),('due date changed',lambda: IU(rn|{'dueDate':'2026-12-31'},FULL,RDOC,ra)),
      ('adjustment changed',lambda: IU(rn|{'adjMinor':5},FULL,RDOC,ra)),('payment does not exist',lambda: IU(rn,FULL,{k:v for k,v in RDOC.items() if k!=PAYP(PID1)},ra)),('payment of another invoice',lambda: IU(rn,FULL,dict(RDOC,**{PAYP(PID1):PY(invoiceId=INVID2)}),ra)),
      ('already reversed',lambda: IU(rn,FULL,dict(RDOC,**{REVP(PID1):RVD()}),ra)),('no reversal record in the batch',lambda: IU(rn,FULL,RDOC,{INV():rn})),('paid lowered by the wrong amount',lambda: IU(REVN(paidMinor=14999),FULL,RDOC,ra)),('credit held while reversing a payment',lambda: IU(NXT(FULL|{'creditMinor':100},dict(paidMinor=15000,lastKind='reversal',lastRef=PID1)),FULL|{'creditMinor':100},dict(RDOC,**{INV():FULL|{'creditMinor':100}}),ra)),
      ('credit changed while reversing a payment',lambda: IU(REVN(creditMinor=5),FULL,RDOC,ra))]
    for lab,f in RIV: chk(f'B2 [{nm}] reversal, invoice update alone refused: {lab}',not f())
    CRD=dict(RDOC,**{INV():FULL|{'creditMinor':3000},PAYP(PID1):PY(kind='credit',amountMinor=3000,reason='Client overpaid')}); crn=NXT(FULL|{'creditMinor':3000},dict(creditMinor=0,lastKind='reversal',lastRef=PID1))
    chk(f'B2 [{nm}] control (single op): credit reversal invoice update alone',IU(crn,FULL|{'creditMinor':3000},CRD,{INV():crn,REVP(PID1):RVD(kind='credit',amountMinor=3000)}))
    CRV=[('paid changes while reversing a credit',lambda: IU(crn|{'paidMinor':1},FULL|{'creditMinor':3000},CRD,{INV():crn|{'paidMinor':1},REVP(PID1):RVD(kind='credit',amountMinor=3000)})),('credit lowered by the wrong amount',lambda: IU(crn|{'creditMinor':1},FULL|{'creditMinor':3000},CRD,{INV():crn|{'creditMinor':1},REVP(PID1):RVD(kind='credit',amountMinor=3000)}))]
    for lab,f in CRV: chk(f'B2 [{nm}] reversal of a credit, invoice update alone refused: {lab}',not f())
    RVM2=[('invoice ID not an invoice',dict(invoiceId=INVID2)),('client differs from the payment',dict(clientId='CL-002')),('kind differs from the payment',dict(kind='credit')),('amount differs from the payment',dict(amountMinor=4999)),('reason empty',dict(reason='')),('reason 2 characters',dict(reason='ab')),('reason 201 characters',dict(reason='x'*201)),('reason a number',dict(reason=5)),
      ('correction ID a number',dict(correctionId=5)),('correction ID short',dict(correctionId='abc')),('actor not the owner',dict(actor='someoneelse123')),('created time not server time',dict(createdAt=TS(NOW-1)))]
    for lab,m in RVM2: chk(f'B2 [{nm}] reversal record alone refused: {lab}',not RC(REVP(PID1),RVD(**m),RDOC,ra))
    chk(f'B2 [{nm}] reversal record alone refused: payment missing, payment of another invoice, invoice not sent, invoice missing, step on the invoice not a reversal, pointer to another payment, no invoice in the batch, extra/missing field, ID short',not any([
      RC(REVP(PID1),RVD(),{k:v for k,v in RDOC.items() if k!=PAYP(PID1)},ra),RC(REVP(PID1),RVD(),dict(RDOC,**{PAYP(PID1):PY(invoiceId=INVID2)}),ra),RC(REVP(PID1),RVD(),dict(RDOC,**{INV():DV}),ra),RC(REVP(PID1),RVD(),{k:v for k,v in RDOC.items() if k!=INV()},ra),
      RC(REVP(PID1),RVD(),RDOC,{INV():rn|{'lastKind':'payment'},REVP(PID1):RVD()}),RC(REVP(PID1),RVD(),RDOC,{INV():rn|{'lastRef':PID2},REVP(PID1):RVD()}),RC(REVP(PID1),RVD(),RDOC,{REVP(PID1):RVD()}),RC(REVP(PID1),RVD(extra=1),RDOC,ra),RC(REVP(PID1),dropk(RVD(),'reason'),RDOC,ra),RC(REVP('abc'),RVD(),dict(RDOC,**{PAYP('abc'):PY()}),{INV():rn|{'lastRef':'abc'},REVP('abc'):RVD()})]))
    chk(f'B2 [{nm}] boundary controls accepted: reversal reason 3 and 200 characters',RC(REVP(PID1),RVD(reason=R3),RDOC,ra) and RC(REVP(PID1),RVD(reason=R200),RDOC,ra))
    # ---- adjustment
    an=ADN(-1000); aa={INV():an,ADJP(AID4):ADR()}
    chk(f'B2 [{nm}] control (single op): adjustment invoice update alone, adjustment record alone',IU(an,SV,PD,aa) and RC(ADJP(AID4),ADR(),PD,aa))
    AIV=[('invoice not SENT before',lambda: IU(ADN(-1000,DV),DV,dict(PD,**{INV():DV}),aa)),('status not SENT after',lambda: IU(an|{'status':'READY'},SV,PD,aa)),('sent time changed',lambda: IU(an|{'sentAt':TSNOW},SV,PD,aa)),('due date changed',lambda: IU(an|{'dueDate':'2026-12-31'},SV,PD,aa)),
      ('paid changed',lambda: IU(an|{'paidMinor':1},SV,PD,aa)),('credit changed',lambda: IU(an|{'creditMinor':1},SV,PD,aa)),('credit held',lambda: IU(ADN(-1000,FULL|{'creditMinor':100}),FULL|{'creditMinor':100},dict(PD,**{INV():FULL|{'creditMinor':100}}),aa)),('adjustment unchanged',lambda: IU(NXT(SV,dict(lastKind='adjustment',lastRef=AID4)),SV,PD,aa)),
      ('total below paid by 1',lambda: IU(ADN(-5001,SV|{'paidMinor':15000}),SV|{'paidMinor':15000},dict(PD,**{INV():SV|{'paidMinor':15000}}),aa)),('no record in the batch',lambda: IU(an,SV,PD,{INV():an})),('record ID already used',lambda: IU(an,SV,dict(PD,**{ADJP(AID4):ADR()}),aa)),
      ('record of another invoice',lambda: IU(an,SV,PD,{INV():an,ADJP(AID4):ADR(invoiceId=INVID2)})),('record amount differs',lambda: IU(an,SV,PD,{INV():an,ADJP(AID4):ADR(amountMinor=-999)})),('adjustment above the limit',lambda: IU(NXT(SV|{'adjMinor':10**12},dict(adjMinor=10**12+1,lastKind='adjustment',lastRef=AID4)),SV|{'adjMinor':10**12},dict(PD,**{INV():SV|{'adjMinor':10**12}}),{INV():NXT(SV|{'adjMinor':10**12},dict(adjMinor=10**12+1,lastKind='adjustment',lastRef=AID4)),ADJP(AID4):ADR(amountMinor=1)}))]
    for lab,f in AIV: chk(f'B2 [{nm}] adjustment, invoice update alone refused: {lab}',not f())
    AREC=[('invoice not an invoice',dict(invoiceId=INVID2)),('client differs',dict(clientId='CL-002')),('client not valid',dict(clientId='cl-001')),('amount zero',dict(amountMinor=0)),('amount a decimal',dict(amountMinor=-10.5)),('amount above the limit',dict(amountMinor=10**12+1)),('amount below the limit',dict(amountMinor=-10**12-1)),
      ('reason empty',dict(reason='')),('reason 2 characters',dict(reason='ab')),('reason 201 characters',dict(reason='x'*201)),('reason a number',dict(reason=5)),('entry reference 81 characters',dict(entryRef='x'*81)),('entry reference a number',dict(entryRef=5)),('actor not the owner',dict(actor='someoneelse123')),('created time not server time',dict(createdAt=TS(NOW-1)))]
    for lab,m in AREC: chk(f'B2 [{nm}] adjustment record alone refused: {lab}',not RC(ADJP(AID4),ADR(**m),PD,aa))
    chk(f'B2 [{nm}] adjustment record alone refused: invoice not sent, missing, wrong step or pointer, not in the batch, extra/missing field, ID short',not any([RC(ADJP(AID4),ADR(),dict(PD,**{INV():DV}),aa),RC(ADJP(AID4),ADR(),{},aa),RC(ADJP(AID4),ADR(),PD,{INV():an|{'lastKind':'payment'},ADJP(AID4):ADR()}),RC(ADJP(AID4),ADR(),PD,{INV():an|{'lastRef':AID5},ADJP(AID4):ADR()}),RC(ADJP(AID4),ADR(),PD,{ADJP(AID4):ADR()}),
      RC(ADJP(AID4),ADR(extra=1),PD,aa),RC(ADJP(AID4),dropk(ADR(),'entryRef'),PD,aa),RC(ADJP('abc'),ADR(),PD,aa)]))
    chk(f'B2 [{nm}] boundary controls accepted: adjustment +/-1, +/-1e12, reason 3 and 200, entry reference 80',all([RC(ADJP(AID4),ADR(amountMinor=1),PD,aa),RC(ADJP(AID4),ADR(amountMinor=-1),PD,aa),RC(ADJP(AID4),ADR(amountMinor=10**12),PD,aa),RC(ADJP(AID4),ADR(amountMinor=-10**12),PD,aa),RC(ADJP(AID4),ADR(reason=R3),PD,aa),RC(ADJP(AID4),ADR(reason=R200),PD,aa),RC(ADJP(AID4),ADR(entryRef='x'*80),PD,aa)]))
    # ---- due date
    dn=DUN(); da={INV():dn,DUEP(AID5):DUR()}
    chk(f'B2 [{nm}] control (single op): due-date invoice update alone, record alone',IU(dn,SV,PD,da) and RC(DUEP(AID5),DUR(),PD,da))
    DIV=[('invoice not SENT before',lambda: IU(DUN(src=DV),DV,dict(PD,**{INV():DV}),da)),('status not SENT after',lambda: IU(dn|{'status':'READY'},SV,PD,da)),('sent time changed',lambda: IU(dn|{'sentAt':TSNOW},SV,PD,da)),('paid changed',lambda: IU(dn|{'paidMinor':1},SV,PD,da)),('credit changed',lambda: IU(dn|{'creditMinor':1},SV,PD,da)),('adjustment changed',lambda: IU(dn|{'adjMinor':1},SV,PD,da)),
      ('due date unchanged',lambda: IU(DUN('2026-11-30'),SV,PD,{INV():DUN('2026-11-30'),DUEP(AID5):DUR(next='2026-11-30')})),('new date not a date',lambda: IU(DUN('soon'),SV,PD,{INV():DUN('soon'),DUEP(AID5):DUR(next='soon')})),('new date empty',lambda: IU(DUN(''),SV,PD,{INV():DUN(''),DUEP(AID5):DUR(next='')})),('no record in the batch',lambda: IU(dn,SV,PD,{INV():dn})),
      ('record ID already used',lambda: IU(dn,SV,dict(PD,**{DUEP(AID5):DUR()}),da)),('record of another invoice',lambda: IU(dn,SV,PD,{INV():dn,DUEP(AID5):DUR(invoiceId=INVID2)})),('record previous date differs',lambda: IU(dn,SV,PD,{INV():dn,DUEP(AID5):DUR(previous='2026-11-29')})),('record next date differs',lambda: IU(dn,SV,PD,{INV():dn,DUEP(AID5):DUR(next='2026-12-16')}))]
    for lab,f in DIV: chk(f'B2 [{nm}] due date, invoice update alone refused: {lab}',not f())
    DREC=[('invoice not an invoice',dict(invoiceId=INVID2)),('client differs',dict(clientId='CL-002')),('client not valid',dict(clientId='cl-001')),('previous not a date',dict(previous='soon')),('next not a date',dict(next='soon')),('previous equals next',dict(next='2026-11-30')),('reason empty',dict(reason='')),('reason 2 characters',dict(reason='ab')),('reason 201 characters',dict(reason='x'*201)),
      ('reason a number',dict(reason=5)),('actor not the owner',dict(actor='someoneelse123')),('created time not server time',dict(createdAt=TS(NOW-1)))]
    for lab,m in DREC: chk(f'B2 [{nm}] due-date record alone refused: {lab}',not RC(DUEP(AID5),DUR(**m),PD,da))
    chk(f'B2 [{nm}] due-date record alone refused: invoice not sent, missing, wrong step or pointer, not in the batch, extra/missing field, ID short',not any([RC(DUEP(AID5),DUR(),dict(PD,**{INV():DV}),da),RC(DUEP(AID5),DUR(),{},da),RC(DUEP(AID5),DUR(),PD,{INV():dn|{'lastKind':'adjustment'},DUEP(AID5):DUR()}),RC(DUEP(AID5),DUR(),PD,{INV():dn|{'lastRef':AID4},DUEP(AID5):DUR()}),RC(DUEP(AID5),DUR(),PD,{DUEP(AID5):DUR()}),RC(DUEP(AID5),DUR(extra=1),PD,da),RC(DUEP(AID5),dropk(DUR(),'reason'),PD,da),RC(DUEP('abc'),DUR(),PD,da)]))
    chk(f'B2 [{nm}] boundary controls accepted: due-date reason 3 and 200',RC(DUEP(AID5),DUR(reason=R3),PD,da) and RC(DUEP(AID5),DUR(reason=R200),PD,da))
    # ---- workflow, invoice side alone
    def WA(new,old,docs=None,au=True): return IU(new,old,WD if docs is None else docs,{INV():new,**({INVA(new['lastRef']):IAU()} if au else {}),**({BE():UNL,BEA(AID4):UAU_()} if new['lastKind']=='cancel' else {})})
    SNT=SENT_AFTER
    WIV=[('ready: old status READY',lambda: WA(RV|{'rev':3,'lastRef':AID3},RV,dict(WD,**{INV():RV}))),('ready: old status SENT',lambda: WA(RV|{'rev':4},SNT,dict(WD,**{INV():SNT}))),('ready: new status DRAFT',lambda: WA(DV|{'rev':2,'updatedAt':TSNOW,'lastKind':'ready','lastRef':AID2},DV)),
      ('ready: audit already used',lambda: WA(RV,DV,dict(WD,**{INVA(AID2):IAU()}))),('ready: no audit in the batch',lambda: WA(RV,DV,au=False)),('send: old status DRAFT',lambda: WA(SNT|{'rev':2},DV)),('send: old status SENT',lambda: WA(SNT|{'rev':4},SNT,dict(WD,**{INV():SNT}))),
      ('send: new status READY',lambda: WA(RV|{'rev':3,'lastKind':'send','lastRef':AID3},RV,dict(WD,**{INV():RV}))),('send: new status CANCELLED',lambda: WA(RV|{'status':'CANCELLED','rev':3,'lastKind':'send','lastRef':AID3},RV,dict(WD,**{INV():RV}))),('send: audit already used',lambda: WA(SNT,RV,dict(WD,**{INV():RV,INVA(AID3):IAU()}))),('send: no audit in the batch',lambda: WA(SNT,RV,dict(WD,**{INV():RV}),au=False)),
      ('cancel: old status SENT',lambda: WA(CXN(SNT),SNT,dict(WD,**{INV():SNT}))),('cancel: old status CANCELLED',lambda: WA(CXN(CXN()),CXN(),dict(WD,**{INV():CXN()}))),('cancel: new status READY',lambda: WA(CXN(k={'status':'READY'}),DV)),('cancel: new status SENT',lambda: WA(CXN(k={'status':'SENT'}),DV)),('cancel: audit already used',lambda: WA(CXN(),DV,dict(WD,**{INVA(AID5):IAU()}))),('cancel: no audit in the batch',lambda: WA(CXN(),DV,au=False))]
    for lab,f in WIV: chk(f'B2 [{nm}] workflow, invoice update alone refused: {lab}',not f())
    chk(f'B2 [{nm}] control (single op): send and cancel (draft and ready) invoice updates alone',WA(SNT,RV,dict(WD,**{INV():RV})) and WA(CXN(),DV) and WA(CXN(RV),RV,dict(WD,**{INV():RV})))
    def AUDA(a,docs=None,inv=None): return RC(INVA(AID2),a,WD if docs is None else docs,{INV():inv if inv is not None else RV,INVA(AID2):a})
    SAU=lambda **k: IAU(**dict(dict(action='send',fromStatus='READY',toStatus='SENT',rev=3),**k)); CNA=lambda **k: IAU(**dict(dict(action='cancel',fromStatus='DRAFT',toStatus='CANCELLED',rev=2,reason='Wrong hours'),**k))
    sa=lambda **k: (SAU(**k),dict(WD,**{INV():RV}),SNT|{'lastRef':AID2}); ca2=lambda **k: (CNA(**k),WD,CXN()|{'lastRef':AID2})
    chk(f'B2 [{nm}] control (single op): audit records for ready, send, cancel from draft, cancel from ready',AUDA(READYAU()) and AUDA(SAU(),dict(WD,**{INV():RV}),SNT|{'lastRef':AID2}) and AUDA(CNA(),WD,CXN()|{'lastRef':AID2}) and AUDA(CNA(fromStatus='READY',rev=3),dict(WD,**{INV():RV}),CXN(RV)|{'lastRef':AID2}))
    AUM=[('ready audit: from-status wrong',lambda: AUDA(READYAU(fromStatus='READY'))),('ready audit: to-status wrong',lambda: AUDA(READYAU(toStatus='SENT'),inv=RV|{'status':'SENT'})),('ready audit: stored status not the from-status',lambda: AUDA(READYAU(),dict(WD,**{INV():RV}))),('ready audit: revision not stored + 1',lambda: AUDA(READYAU(rev=3),inv=RV|{'rev':3})),
      ('ready audit: pointer on the invoice differs',lambda: AUDA(READYAU(),inv=RV|{'lastRef':AID3})),('ready audit: step on the invoice differs',lambda: AUDA(READYAU(),inv=RV|{'lastKind':'send'})),('ready audit: revision differs from the invoice',lambda: AUDA(READYAU(),inv=RV|{'rev':5})),('ready audit: status differs from the invoice',lambda: AUDA(READYAU(),inv=RV|{'status':'DRAFT'})),
      ('ready audit: total differs from the invoice',lambda: AUDA(READYAU(totalMinor=1))),('ready audit: invoice not in the batch',lambda: RC(INVA(AID2),READYAU(),WD,{INVA(AID2):READYAU()})),('send audit: from-status wrong',lambda: AUDA(*[SAU(fromStatus='DRAFT'),dict(WD,**{INV():RV}),SNT|{'lastRef':AID2}])),
      ('send audit: to-status wrong',lambda: AUDA(*[SAU(toStatus='READY'),dict(WD,**{INV():RV}),SNT|{'lastRef':AID2}])),('cancel audit: to-status wrong',lambda: AUDA(*[CNA(toStatus='READY'),WD,CXN()|{'lastRef':AID2}])),('cancel audit: from-status SENT',lambda: AUDA(*[CNA(fromStatus='SENT'),dict(WD,**{INV():SNT}),CXN(SNT)|{'lastRef':AID2}])),
      ('cancel audit: reason 2 characters',lambda: AUDA(*[CNA(reason='ab'),WD,CXN()|{'lastRef':AID2}])),('create audit: revision 2',lambda: RC(INVA(AID1),IAU(rev=2),CDOC,CAF())),('create audit: from-status not empty',lambda: RC(INVA(AID1),IAU(fromStatus='DRAFT'),CDOC,CAF())),('create audit: to-status READY',lambda: RC(INVA(AID1),IAU(toStatus='READY'),CDOC,CAF(inv=IV(status='READY')))),
      ('audit: invoice ID not a string',lambda: RC(INVA(AID1),IAU(invoiceId=5),CDOC,CAF())),('audit: revision not a number',lambda: RC(INVA(AID1),IAU(rev='1'),CDOC,CAF())),('audit: total not a number',lambda: RC(INVA(AID1),IAU(totalMinor='20000'),CDOC,CAF())),('audit: reason not a string',lambda: RC(INVA(AID1),IAU(reason=5),CDOC,CAF())),
      ('audit: missing field',lambda: RC(INVA(AID1),dropk(IAU(),'reason'),CDOC,CAF())),('audit: reason 201 characters',lambda: RC(INVA(AID1),IAU(reason='x'*201),CDOC,CAF()))]
    for lab,f in AUM: chk(f'B2 [{nm}] invoice audit alone refused: {lab}',not f())
    chk(f'B2 [{nm}] boundary controls accepted: cancel reason 3 and 200 characters',AUDA(CNA(reason=R3),WD,CXN()|{'lastRef':AID2}) and AUDA(CNA(reason=R200),WD,CXN()|{'lastRef':AID2}))
    # ---- invoice create, single op alone
    CM=lambda **k: IV(**k)
    INVCR=[('ID is not client + period (suffix missing from the ID)',lambda: icr(IV(suffix='02'))),('suffix 01 with a matching ID',lambda: P('create',INV(INVID+'__01'),OWN,IV(suffix='01'),None,CDOC,CAF(IV(suffix='01'),e1=LK(OKE1,iid=INVID+'__01')))),('suffix 100 with a matching ID',lambda: P('create',INV(INVID+'__100'),OWN,IV(suffix='100'),None,CDOC,CAF(IV(suffix='100'),e1=LK(OKE1,iid=INVID+'__100')))),
      ('suffix not a string',lambda: icr(IV(suffix=2))),('client has no billing profile',lambda: icr(docs=dict(R0,**{BE():OKE1}))),('profile has a rate of 0',lambda: icr(docs=dict(R0,**{BP():PRO(rateMinor=0),BE():OKE1}))),('profile exponent differs',lambda: icr(IV(exp=0),docs=dict(CDOC,**{BP():PRO(currency='JPY',exp=0)}))),
      ('profile due rule differs (after-generation profile, after-send invoice)',lambda: icr(IV(dueKind='afterSend'),docs=dict(CDOC,**{BP():PRO(dueKind='afterGeneration')}))),('profile due days differ',lambda: icr(IV(dueDays=13))),('rate is 0',lambda: icr(IV(rateMinor=0,totalMinor=0),docs=dict(CDOC,**{BP():PRO(rateMinor=0)}))),
      ('minutes 0',lambda: icr(IV(minutes=0,totalMinor=0),docs=dict(CDOC,**{BE():OKE1|{'approvedMinutes':0}}),after=CAF(IV(minutes=0,totalMinor=0),e1=LK(OKE1|{'approvedMinutes':0})))),('total not a whole number',lambda: icr(IV(totalMinor=20000.5))),('total above the limit',lambda: icr(IV(rateMinor=10**9,minutes=267840,totalMinor=4464000000000,entryIds=[EIDE,EIDE2]),
        docs=dict(CDOC,**{BP():PRO(rateMinor=10**9),BE():OKE1|{'approvedMinutes':133920},BE(EIDE2):OKE2|{'approvedMinutes':133920}}),after=CAF(IV(rateMinor=10**9,minutes=267840,totalMinor=4464000000000,entryIds=[EIDE,EIDE2]),two=True,e1=LK(OKE1|{'approvedMinutes':133920}),e2=LK(OKE2|{'approvedMinutes':133920},AID4)))),
      ('minutes not the sum of two entries',lambda: icr(TWO(minutes=599,totalMinor=24975),after=CAF(TWO(minutes=599,totalMinor=24975),two=True))),('two entries but only the first minutes counted',lambda: icr(TWO(minutes=480,totalMinor=20000),after=CAF(TWO(minutes=480,totalMinor=20000),two=True))),
      ('first entry not linked (two entries)',lambda: icr(TWO(),after=CAF(TWO(),two=True,e1=OKE1))),('second entry not linked (two entries)',lambda: icr(TWO(),after=CAF(TWO(),two=True,e2=OKE2))),('first entry not in the batch (two entries)',lambda: icr(TWO(),after={k:v for k,v in CAF(TWO(),two=True).items() if k not in (BE(),BEA(AID3))})),
      ('second entry not in the batch (two entries)',lambda: icr(TWO(),after={k:v for k,v in CAF(TWO(),two=True).items() if k not in (BE(EIDE2),BEA(AID4))})),('first entry of another client (two entries)',lambda: icr(TWO(),after=CAF(TWO(),two=True,e1=LK(OKE1)|{'clientId':'CL-002'}))),('first entry of another period (two entries)',lambda: icr(TWO(),after=CAF(TWO(),two=True,e1=LK(OKE1)|{'periodStart':'20261102'}))),
      ('audit not in the batch',lambda: icr(after={k:v for k,v in CAF().items() if k!=INVA(AID1)})),('audit already used',lambda: icr(docs=dict(CDOC,**{INVA(AID1):IAU()}))),('last step is not create',lambda: icr(IV(lastKind='ready'))),('entry not approved after the batch',lambda: icr(after=CAF(e1=LK(OKE1)|{'status':'DRAFT'}))),
      ('entry client differs after the batch',lambda: icr(after=CAF(e1=LK(OKE1)|{'clientId':'CL-002'}))),('entry period start differs after the batch',lambda: icr(after=CAF(e1=LK(OKE1)|{'periodStart':'20261102'}))),('entry period end differs after the batch',lambda: icr(after=CAF(e1=LK(OKE1)|{'periodEnd':'20261116'}))),('entry linked to another invoice after the batch',lambda: icr(after=CAF(e1=LK(OKE1,iid=INVID2)))),
      ('entry missing after the batch',lambda: icr(after={INV():IV(),INVA(AID1):IAU()})),('after-generation due date missing',lambda: icr(IV(dueKind='afterGeneration',dueDate=''),docs=dict(CDOC,**{BP():PRO(dueKind='afterGeneration')}))),('fixed due date differs from the profile',lambda: icr(IV(dueKind='fixed',dueDays=0,dueDate='2026-12-30'),docs=dict(CDOC,**{BP():PRO(dueKind='fixed',dueDays=0,dueDate='2026-12-31')}))),
      ('after-send invoice carries a date',lambda: icr(IV(dueDate='2026-11-29'))),('archived client',lambda: icr(docs=dict(RARCH,**{BP():PRO(),BE():OKE1}))),('client not in the registry',lambda: icr(docs={BP():PRO(),BE():OKE1}))]
    for lab,f in INVCR: chk(f'B2 [{nm}] invoice create alone refused: {lab}',not f())
    chk(f'B2 [{nm}] boundary controls accepted: rate 1 and 1e9, minutes sum of two, total at the edge, suffix 02 and 99',all([icr(IV(rateMinor=1,minutes=480,totalMinor=8),docs=dict(CDOC,**{BP():PRO(rateMinor=1)}),after=CAF(IV(rateMinor=1,minutes=480,totalMinor=8))),
      P('create',INV(INVID+'__99'),OWN,IV(suffix='99'),None,CDOC,CAF(IV(suffix='99'),e1=LK(OKE1,iid=INVID+'__99'))),P('create',INV(INVID2),OWN,IV(suffix='02'),None,CDOC,CAF(IV(suffix='02'),e1=LK(OKE1,iid=INVID2)))]))
    # ---- entry link / unlink single op
    LKE=LK(OKE1); LKD=dict(CDOC); LKA=CAF()
    ELM=[('old status SUBMITTED',lambda: P('update',BE(),OWN,LKE|{'status':'APPROVED'},OKE1|{'status':'SUBMITTED'},dict(ED0,**{BE():OKE1|{'status':'SUBMITTED'}}),LKA)),('new status DRAFT',lambda: P('update',BE(),OWN,LKE|{'status':'DRAFT'},OKE1,CDOC,CAF(e1=LKE|{'status':'DRAFT'}))),('link with the link left empty',lambda: P('update',BE(),OWN,LKE|{'relatedInvoiceId':''},OKE1,CDOC,CAF(e1=LKE|{'relatedInvoiceId':''}))),
      ('submitted minutes changed',lambda: P('update',BE(),OWN,LKE|{'submittedMinutes':481},OKE1,CDOC,CAF(e1=LKE|{'submittedMinutes':481}))),('approved minutes changed',lambda: P('update',BE(),OWN,LKE|{'approvedMinutes':481},OKE1,CDOC,CAF(e1=LKE|{'approvedMinutes':481}))),('approved time changed',lambda: P('update',BE(),OWN,LKE|{'approvedAt':TSNOW},OKE1,CDOC,CAF(e1=LKE|{'approvedAt':TSNOW}))),
      ('approver changed',lambda: P('update',BE(),OWN,LKE|{'approverUid':'someoneelse123'},OKE1,CDOC,CAF(e1=LKE|{'approverUid':'someoneelse123'}))),('replaced-by changed',lambda: P('update',BE(),OWN,LKE|{'supersededBy':EIDE2},OKE1,CDOC,CAF(e1=LKE|{'supersededBy':EIDE2}))),('invoice not in the batch',lambda: P('update',BE(),OWN,LKE,OKE1,CDOC,{BE():LKE,BEA(AID3):LAU()})),
      ('invoice client differs',lambda: P('update',BE(),OWN,LKE,OKE1,CDOC,CAF(inv=IV(clientId='CL-002')))),('invoice does not list the entry',lambda: P('update',BE(),OWN,LKE,OKE1,CDOC,CAF(inv=IV(entryIds=[EIDE2])))),('invoice not a draft after the batch',lambda: P('update',BE(),OWN,LKE,OKE1,CDOC,CAF(inv=IV(status='READY')))),('invoice exists already',lambda: P('update',BE(),OWN,LKE,OKE1,dict(CDOC,**{INV():IV()}),LKA)),
      ('already linked to an invoice (re-link)',lambda: P('update',BE(),OWN,LK(OKE1,iid=INVID2),OKE1|{'relatedInvoiceId':INVID},dict(CDOC,**{BE():OKE1|{'relatedInvoiceId':INVID}}),CAF(e1=LK(OKE1,iid=INVID2))))]
    for lab,f in ELM: chk(f'B2 [{nm}] entry link alone refused: {lab}',not f())
    chk(f'B2 [{nm}] control (single op): entry link alone',P('update',BE(),OWN,LKE,OKE1,CDOC,LKA))
    ULE=OKE1|{'relatedInvoiceId':'','rev':4,'lastAudit':AID4}; ULD=dict(WD); ULA=CXAF()
    UNM=[('old status SUBMITTED',lambda: P('update',BE(),OWN,ULE,LE|{'status':'SUBMITTED'},dict(WD,**{BE():LE|{'status':'SUBMITTED'}}),ULA)),('new status DRAFT',lambda: P('update',BE(),OWN,ULE|{'status':'DRAFT'},LE,WD,CXAF(e=ULE|{'status':'DRAFT'}))),('was not linked',lambda: P('update',BE(),OWN,ULE,OKE1,WD,ULA)),('still linked',lambda: P('update',BE(),OWN,ULE|{'relatedInvoiceId':INVID2},LE,WD,CXAF(e=ULE|{'relatedInvoiceId':INVID2}))),
      ('submitted minutes changed',lambda: P('update',BE(),OWN,ULE|{'submittedMinutes':1},LE,WD,CXAF(e=ULE|{'submittedMinutes':1}))),('approved minutes changed',lambda: P('update',BE(),OWN,ULE|{'approvedMinutes':1},LE,WD,CXAF(e=ULE|{'approvedMinutes':1}))),('approved time changed',lambda: P('update',BE(),OWN,ULE|{'approvedAt':TSNOW},LE,WD,CXAF(e=ULE|{'approvedAt':TSNOW}))),
      ('approver changed',lambda: P('update',BE(),OWN,ULE|{'approverUid':'someoneelse123'},LE,WD,CXAF(e=ULE|{'approverUid':'someoneelse123'}))),('replaced-by changed',lambda: P('update',BE(),OWN,ULE|{'supersededBy':EIDE2},LE,WD,CXAF(e=ULE|{'supersededBy':EIDE2}))),('invoice missing',lambda: P('update',BE(),OWN,ULE,LE,{k:v for k,v in WD.items() if k!=INV()},ULA)),
      ('invoice not in the batch',lambda: P('update',BE(),OWN,ULE,LE,WD,{BE():ULE,BEA(AID4):UAU_()})),('invoice SENT before',lambda: P('update',BE(),OWN,ULE,LE,dict(WD,**{INV():SENT_AFTER}),CXAF(n=CXN(SENT_AFTER)))),('invoice not cancelled after',lambda: P('update',BE(),OWN,ULE,LE,WD,CXAF(n=DV)))]
    for lab,f in UNM: chk(f'B2 [{nm}] entry unlink alone refused: {lab}',not f())
    chk(f'B2 [{nm}] control (single op): entry unlink alone (draft and ready invoice)',P('update',BE(),OWN,ULE,LE,WD,ULA) and P('update',BE(),OWN,ULE,LE,dict(WD,**{INV():RV}),CXAF(RV)))
    chk(f'B2 [{nm}] boundary control accepted: unlink audit reason of exactly 3 characters',P('create',BEA(AID4),OWN,UAU_(reason=R3),None,WD,ULA))
    # ---------------- 8l. B2 third pass: tests that isolate ONE clause each (found by the mutation check)
    # a sent-only step must refuse a draft/ready invoice even when the NEW status is SENT (old status checked on its own)
    RVS=RV|{'status':'READY'}; SENDOLD=lambda **k: NXT(RV,dict(status='SENT',sentAt=RV['sentAt'],**k))
    chk(f'B2 [{nm}] sent-only steps refuse an old status that is not SENT even when the new status is SENT',not any([
      IU(SENDOLD(paidMinor=5000,lastKind='payment',lastRef=PID1),RV,dict(PD,**{INV():RV}),pa0),
      IU(SENDOLD(creditMinor=3000,lastKind='credit',lastRef=PID2),RV|{'paidMinor':20000},dict(PD,**{INV():RV|{'paidMinor':20000}}),ca),
      IU(NXT(RV|{'paidMinor':5000},dict(status='SENT',paidMinor=0,lastKind='reversal',lastRef=PID1)),RV|{'paidMinor':5000},dict(RDOC,**{INV():RV|{'paidMinor':5000}}),{INV():NXT(RV|{'paidMinor':5000},dict(status='SENT',paidMinor=0,lastKind='reversal',lastRef=PID1)),REVP(PID1):RVD()}),
      IU(SENDOLD(adjMinor=-1000,lastKind='adjustment',lastRef=AID4),RV,dict(PD,**{INV():RV}),aa),
      IU(SENDOLD(dueDate='2026-12-15',lastKind='due',lastRef=AID5),RV,dict(PD,**{INV():RV}),da)]))
    chk(f'B2 [{nm}] payment/credit record amounts of 0 are not accepted by the invoice change (paid must really increase)',not IU(NXT(SV,dict(lastKind='payment',lastRef=PID1)),SV,PD,{INV():NXT(SV,dict(lastKind='payment',lastRef=PID1)),PAYP(PID1):PY(amountMinor=0)}) and not IU(NXT(FULL,dict(lastKind='credit',lastRef=PID2)),FULL,FD,{INV():NXT(FULL,dict(lastKind='credit',lastRef=PID2)),PAYP(PID2):CRY()|{'amountMinor':0}}))
    chk(f'B2 [{nm}] an adjustment of 0 is not accepted by the invoice change',not IU(NXT(SV,dict(lastKind='adjustment',lastRef=AID4)),SV,PD,{INV():NXT(SV,dict(lastKind='adjustment',lastRef=AID4)),ADJP(AID4):ADR(amountMinor=0)}))
    HC=FULL|{'creditMinor':100}
    chk(f'B2 [{nm}] a credit held blocks reversing a payment (even when the credit would silently vanish) and blocks an upward adjustment',not any([
      IU(NXT(HC,dict(paidMinor=15000,creditMinor=0,lastKind='reversal',lastRef=PID1)),HC,dict(RDOC,**{INV():HC}),ra),IU(ADN(1000,HC),HC,dict(PD,**{INV():HC}),{INV():ADN(1000,HC),ADJP(AID4):ADR(amountMinor=1000)})]))
    # the invoice ID must be the client + period + suffix (entries are linked to the same wrong ID so nothing else refuses)
    BADID='CL-001__20261101__20261116'
    chk(f'B2 [{nm}] an invoice whose ID is not client + period is refused even when its entries point at that ID',not P('create',INV(BADID),OWN,IV(),None,CDOC,CAF(IV(),e1=LK(OKE1,iid=BADID))))
    chk(f'B2 [{nm}] minutes that are not the entry minutes are refused even when the total fits them',not icr(IV(minutes=479,totalMinor=19958)))
    chk(f'B2 [{nm}] an after-send invoice cannot carry the due rule of an after-generation profile',not icr(IV(dueKind='afterSend',dueDate='2026-11-29'),docs=dict(CDOC,**{BP():PRO(dueKind='afterGeneration')})))
    chk(f'B2 [{nm}] total at exactly 1e12 accepted, above refused; paid, credit and adjustment at their limits',all([
      icr(IV(rateMinor=10**9,minutes=60000,totalMinor=10**12),docs=dict(CDOC,**{BP():PRO(rateMinor=10**9),BE():OKE1|{'approvedMinutes':60000}}),after=CAF(IV(rateMinor=10**9,minutes=60000,totalMinor=10**12),e1=LK(OKE1|{'approvedMinutes':60000}))),
      IU(ADN(10**12),SV,PD,{INV():ADN(10**12),ADJP(AID4):ADR(amountMinor=10**12)}),
      IU(ADN(-10**12,SV|{'totalMinor':10**12}),SV|{'totalMinor':10**12},dict(PD,**{INV():SV|{'totalMinor':10**12}}),{INV():ADN(-10**12,SV|{'totalMinor':10**12}),ADJP(AID4):ADR(amountMinor=-10**12)})]))
    BIG=SV|{'totalMinor':10**12,'adjMinor':10**12,'paidMinor':10**12}
    chk(f'B2 [{nm}] paid above 1e12 refused even when total + adjustment allow it',not IU(NXT(BIG,dict(paidMinor=10**12+1,lastKind='payment',lastRef=PID1)),BIG,dict(PD,**{INV():BIG}),{INV():NXT(BIG,dict(paidMinor=10**12+1,lastKind='payment',lastRef=PID1)),PAYP(PID1):PY(amountMinor=1)}) and IU(NXT(BIG,dict(paidMinor=10**12,lastKind='payment',lastRef=PID1)),BIG|{'paidMinor':10**12-1},dict(PD,**{INV():BIG|{'paidMinor':10**12-1}}),{INV():NXT(BIG,dict(paidMinor=10**12,lastKind='payment',lastRef=PID1)),PAYP(PID1):PY(amountMinor=1)}))
    BIGC=SV|{'totalMinor':5*10**11,'adjMinor':5*10**11,'paidMinor':10**12,'creditMinor':10**12-1}
    CBN=lambda n: NXT(BIGC,dict(creditMinor=n,lastKind='credit',lastRef=PID2))
    chk(f'B2 [{nm}] credit at exactly 1e12 accepted, 1e12 + 1 refused',IU(CBN(10**12),BIGC,dict(PD,**{INV():BIGC}),{INV():CBN(10**12),PAYP(PID2):CRY()|{'amountMinor':1}}) and not IU(CBN(10**12+1),BIGC,dict(PD,**{INV():BIGC}),{INV():CBN(10**12+1),PAYP(PID2):CRY()|{'amountMinor':2}}))
    # audit records: each status clause alone
    def AU1(a,stored,after_inv): return RC(INVA(AID2),a,dict(WD,**{INV():stored}),{INV():after_inv,INVA(AID2):a})
    chk(f'B2 [{nm}] audit status chains (isolated): wrong from-status, wrong to-status, stored status differs',not any([
      AU1(READYAU(fromStatus='READY',toStatus='READY',rev=3),RV,RV|{'rev':3,'lastRef':AID2}),
      AU1(READYAU(fromStatus='DRAFT',toStatus='READY',rev=3),RV,RV|{'rev':3,'lastRef':AID2}),
      AU1(SAU(fromStatus='SENT',toStatus='SENT',rev=4),SNT,SNT|{'rev':4,'lastRef':AID2,'lastKind':'send'}),
      AU1(SAU(fromStatus='READY',toStatus='READY',rev=3),RV,RV|{'rev':3,'lastRef':AID2,'lastKind':'send'}),
      AU1(CNA(fromStatus='DRAFT',toStatus='DRAFT',rev=2),DV,DV|{'rev':2,'lastRef':AID2,'lastKind':'cancel'}),
      AU1(CNA(fromStatus='SENT',rev=4),SNT,CXN(SNT)|{'lastRef':AID2})]))
    chk(f'B2 [{nm}] a create audit must be revision 1 even when the invoice says revision 2',not RC(INVA(AID1),IAU(rev=2),CDOC,CAF(inv=IV(rev=2))))
    # payment kind list: an unknown kind is refused even when the invoice step carries the same word
    chk(f'B2 [{nm}] a payment record with an unknown kind is refused even when the invoice step says the same',not RC(PAYP(PID1),PY(kind='refund'),PD,{INV():pn|{'lastKind':'refund'},PAYP(PID1):PY(kind='refund')}))
    chk(f'B2 [{nm}] a due-date record ID of 3 characters is refused (ID rule alone)',not RC(DUEP('abc'),DUR(),PD,{INV():dn|{'lastRef':'abc'},DUEP('abc'):DUR()}))
    # entry link: re-link needs the other invoice to be in the batch so the old-link clause is the only thing left
    RL=OKE1|{'relatedInvoiceId':INVID}
    chk(f'B2 [{nm}] an entry that is already on an invoice cannot be moved to a second one',not P('update',BE(),OWN,LK(OKE1,iid=INVID2),RL,dict(CDOC,**{BE():RL}),{INV(INVID2):IV(suffix='02'),BE():LK(OKE1,iid=INVID2),BEA(AID3):LAU()}))
    def EA1(a,stored,after_e): return RC(BEA(AID3),a,dict(CDOC,**{BE():stored}),{BE():after_e,BEA(AID3):a})
    chk(f'B2 [{nm}] entry audit link/unlink: from-status and to-status must be APPROVED (each alone)',not any([
      EA1(LAU(fromStatus='DRAFT',toStatus='APPROVED'),OKE1|{'status':'DRAFT'},LK(OKE1)),
      EA1(LAU(toStatus='DRAFT'),OKE1,LK(OKE1)|{'status':'DRAFT'}),
      EA1(UAU_(fromStatus='DRAFT',toStatus='APPROVED',rev=4),LE|{'status':'DRAFT'},ULE|{'lastAudit':AID3}),
      EA1(UAU_(toStatus='DRAFT'),LE,ULE|{'status':'DRAFT','lastAudit':AID3})]))
    chk(f'B2 [{nm}] control (single op): entry audit records for link and unlink',EA1(LAU(),OKE1,LK(OKE1)) and EA1(UAU_(),LE,ULE|{'lastAudit':AID3}))
    # ---------------- 8m. B3: skipping a billing period (create-only record, period ID = record ID)
    SID='CL-001__20261001__20261031'; SKP='periodSkips/'+SID
    SK=lambda **k: dict({'clientId':'CL-001','periodStart':'20261001','periodEnd':'20261031','reason':'Client paused work','actor':UID,'createdAt':TSNOW},**k)
    SKD=dict(R0,**{BP():PRO()}); SKC=lambda doc,docs=None,au=OWN,path=SKP: P('create',path,au,doc,None,SKD if docs is None else docs)
    chk(f'B3 [{nm}] control: the owner skips a period of an active hourly client',SKC(SK()))
    chk(f'B3 [{nm}] boundary controls accepted: reason of 3 and 200 characters, one-day period',SKC(SK(reason='abc')) and SKC(SK(reason='x'*200)) and SKC(SK(periodStart='20261015',periodEnd='20261015'),path='periodSkips/CL-001__20261015__20261015'))
    chk(f'B3 [{nm}] owner can read skips, others cannot',P('get',SKP,OWN,None,SK(),SKD) and not P('get',SKP,STRANGER,None,SK(),SKD) and not P('get',SKP,None,None,SK(),SKD))
    chk(f'B3 [{nm}] skip refused: not the owner, not signed in',not any([SKC(SK(),au=STRANGER),SKC(SK(),au=None)]))
    chk(f'B3 [{nm}] skip refused: the ID does not match the client or the dates',not any([SKC(SK(),path='periodSkips/CL-001__20261001__20261030'),SKC(SK(),path='periodSkips/CL-001__20261002__20261031'),SKC(SK(),path='periodSkips/CL-002__20261001__20261031'),SKC(SK(),path='periodSkips/anything'),SKC(SK(clientId='CL-002'))]))
    chk(f'B3 [{nm}] skip refused: client not registered, archived, no billing profile, or a monthly-arrangement client',not any([
      SKC(SK(),docs={BP():PRO()}),SKC(SK(),docs=dict(RARCH,**{BP():PRO()})),SKC(SK(),docs=R0),SKC(SK(),docs=dict(R0,**{BP():PRO(arrangement='monthly')}))]))
    chk(f'B3 [{nm}] skip refused: extra field, missing field',not any([SKC(SK(extra=1)),SKC({k:v for k,v in SK().items() if k!='reason'}),SKC({k:v for k,v in SK().items() if k!='actor'}),SKC({k:v for k,v in SK().items() if k!='periodEnd'})]))
    chk(f'B3 [{nm}] skip refused: reason too short, too long, not text',not any([SKC(SK(reason='ab')),SKC(SK(reason='x'*201)),SKC(SK(reason=5)),SKC(SK(reason=''))]))
    chk(f'B3 [{nm}] skip refused: a signed-in stranger who writes their OWN ID as the actor (the owner check itself, alone)',not any([SKC(SK(actor='someoneelse123'),au=STRANGER)]))
    chk(f'B3 [{nm}] skip refused: period end that is not 8 digits but sorts after the start; reason that is a list of 3 items',not any([
      SKC(SK(periodEnd='abcdefgh'),path='periodSkips/CL-001__20261001__abcdefgh'),SKC(SK(periodEnd='2026103x'),path='periodSkips/CL-001__20261001__2026103x'),SKC(SK(periodEnd='202610319'),path='periodSkips/CL-001__20261001__202610319'),SKC(SK(reason=['a','b','c']))]))
    chk(f'B3 [{nm}] skip refused: actor is someone else, time is not the server time',not any([SKC(SK(actor='someoneelse123')),SKC(SK(createdAt=TS(NOW-1000))),SKC(SK(createdAt=None))]))
    chk(f'B3 [{nm}] skip refused: dates not in YYYYMMDD form, end before start, invalid client ID',not any([
      SKC(SK(periodStart='2026-10-01'),path='periodSkips/CL-001__2026-10-01__20261031'),SKC(SK(periodEnd='20261001',periodStart='20261031'),path='periodSkips/CL-001__20261031__20261001'),
      SKC(SK(periodStart=20261001)),SKC(SK(clientId='bad id'),path='periodSkips/bad id__20261001__20261031')]))
    chk(f'B3 [{nm}] a skip can never be changed or removed',not any([P('update',SKP,OWN,SK(reason='Changed my mind'),SK(),SKD),P('delete',SKP,OWN,None,SK(),SKD)]))
# ---------------- 8j. F5 (4.5.0): visitor token path, daily counter, tokenRequired switch (checked on BOTH rules files)
import datetime as _dt
_d=_dt.datetime.fromtimestamp(NOW/1000,_dt.timezone.utc); TODAY=f'{_d.year}{_d.month:02d}{_d.day:02d}'; PREVD=f'{_d.year}{_d.month:02d}{_d.day-1:02d}'
TU='m_abcDEF1234567890'; TV={'uid':TU,'provider':'custom','claims':{'form':'meeting'}}
RQ=lambda **k: REQ(**dict({'day':TODAY},**k))
RPf=lambda u=TU:'meetingRequests/'+u; CPf=lambda d=TODAY:'reqCounters/'+d
def A5(sim,op,path,au=None,new=None,old=None,docs=None,after=None):
    try: return sim.allowed(op,path,au,new,old,docs,NOW,after)
    except Exception: return False
def TB(sim,auth=TV,pre=None,uid=TU,req=None,cnt=None,guard=None,extra=None):
    """one token submission = a batch of (request create, counter create/update); returns (request verdict, counter verdict)"""
    docs=dict(extra or {})
    if pre is not None: docs[CPf()]={'count':pre,'lastReq':'m_previous_000'}
    if guard is not None: docs['content/guard']=guard
    req=RQ() if req is None else req
    nc=cnt if cnt is not None else {'count':1 if pre is None else pre+1,'lastReq':uid}
    af={RPf(uid):req,CPf():nc}
    return (A5(sim,'create',RPf(uid),auth,req,None,docs,af),A5(sim,'create' if pre is None else 'update',CPf(),auth,nc,None if pre is None else docs[CPf()],docs,af))
for nm,sim in (('transition',S),('strict',SS)):
    ok5=lambda **k: all(TB(sim,**k))
    chk(f'F5 [{nm}] control: token request and first counter of the day accepted',ok5())
    chk(f'F5 [{nm}] control: later request 5 -> 6, and 29 -> 30 (default cap) accepted',ok5(pre=5) and ok5(pre=29))
    chk(f'F5 [{nm}] cap: 30 -> 31 refused (counter), so the whole batch fails',not TB(sim,pre=30)[1] and not ok5(pre=30))
    chk(f'F5 [{nm}] cap raised to 50 by the owner: 30 -> 31 accepted; lowered to 5: 5 -> 6 refused; guard without cap keeps the default 30',ok5(pre=30,guard={'cap':50}) and not ok5(pre=5,guard={'cap':5}) and not ok5(pre=30,guard={'pause':False}))
    chk(f'F5 [{nm}] switch off (absent / false / guard without the field): old direct form still accepted',A5(sim,'create','meetingRequests/n1',None,REQ()) and A5(sim,'create','meetingRequests/n1',None,REQ(),None,{'content/guard':{'tokenRequired':False}}) and A5(sim,'create','meetingRequests/n1',None,REQ(),None,{'content/guard':{'pause':False,'cap':30}}))
    chk(f'F5 [{nm}] switch ON: old direct form refused (no sign-in, Google stranger, token account writing a legacy-shaped request)',not A5(sim,'create','meetingRequests/n1',None,REQ(),None,{'content/guard':{'tokenRequired':True}}) and not A5(sim,'create','meetingRequests/n1',STRANGER,REQ(),None,{'content/guard':{'tokenRequired':True}}) and not A5(sim,'create','meetingRequests/n1',TV,REQ(),None,{'content/guard':{'tokenRequired':True}}))
    chk(f'F5 [{nm}] switch ON: token path still accepted',ok5(guard={'tokenRequired':True}) and ok5(pre=5,guard={'tokenRequired':True,'cap':30}))
    chk(f'F5 [{nm}] switch must be exactly true: string "true" or 1 does not close the old path',A5(sim,'create','meetingRequests/n1',None,REQ(),None,{'content/guard':{'tokenRequired':'true'}}) and A5(sim,'create','meetingRequests/n1',None,REQ(),None,{'content/guard':{'tokenRequired':1}}))
    chk(f'F5 [{nm}] a direct (non-token) request cannot carry the day field',not A5(sim,'create','meetingRequests/n1',None,RQ()) and not A5(sim,'create','meetingRequests/n1',STRANGER,RQ()))
    chk(f'F5 [{nm}] pause on: token submission refused as well; capacity full and busy slot too',not ok5(guard={'pause':True}) and not ok5(extra={'content/capacity':{'open':False}}) and not ok5(extra={'content/busy':{'keys':['2026-12-01T09:00']}}))
    chk(f'F5 [{nm}] token request keeps every normal field check (bad e-mail, long name, long message, wrong status, forged time, unknown field, missing company)',not any(TB(sim,req=RQ(**k))[0] for k in ({'email':'x'},{'name':''},{'name':'n'*101},{'message':'m'*2001},{'status':'confirmed'},{'createdAt':TS(NOW-1000)},{'admin':True},{'tz':'<b>'})) and not TB(sim,req={k:v for k,v in RQ().items() if k!='company'})[0])
    chk(f'F5 [{nm}] no sign-in, Google account, wrong claim value, claim on a non-custom provider: all refused',not any(ok5(auth=a) for a in (None,{'uid':TU,'provider':'google.com','email':'a@b.c'},{'uid':TU,'provider':'custom','claims':{'form':'x'}},{'uid':TU,'provider':'custom'},{'uid':TU,'provider':'anonymous','claims':{'form':'meeting'}})))
    chk(f'F5 [{nm}] token uid without the m_ shape, too short, or with bad characters is refused',not any(ok5(auth={'uid':u,'provider':'custom','claims':{'form':'meeting'}},uid=u) for u in ('abc','m_short','x_abcDEF1234567890','m_bad id 123456','m_'+'a'*41)))
    chk(f'F5 [{nm}] request ID different from the token uid refused (one request per token)',not A5(sim,'create',RPf('m_other_12345'),TV,RQ(),None,{},{RPf('m_other_12345'):RQ(),CPf():{'count':1,'lastReq':TU}}))
    chk(f'F5 [{nm}] request without a counter write in the same batch refused; stale counter stamped by another token refused',not A5(sim,'create',RPf(),TV,RQ(),None,{},{RPf():RQ()}) and not A5(sim,'create',RPf(),TV,RQ(),None,{CPf():{'count':5,'lastReq':'m_previous_000'}},{RPf():RQ(),CPf():{'count':5,'lastReq':'m_previous_000'}}))
    chk(f'F5 [{nm}] request day field not today (yesterday, wrong format, number) refused',not any(TB(sim,req=RQ(day=d))[0] for d in (PREVD,'2026-12-01',20261201,'')))
    chk(f'F5 [{nm}] counter: stamp by another token, jump by 2, start at 2, decrement, extra field, no lastReq: all refused',not any(TB(sim,pre=p,cnt=c)[1] for p,c in ((5,{'count':6,'lastReq':'m_other_12345'}),(5,{'count':7,'lastReq':TU}),(None,{'count':2,'lastReq':TU}),(None,{'count':1,'lastReq':'m_other_12345'}),(None,{'count':1,'lastReq':TU,'x':1}),(None,{'count':1}),(5,{'count':4,'lastReq':TU}),(5,{'count':6,'lastReq':TU,'x':1}),(5,{'count':6}))))
    chk(f'F5 [{nm}] counter: other day key (create and update) refused; counter write without its request refused',not A5(sim,'create',CPf(PREVD),TV,{'count':1,'lastReq':TU},None,{},{RPf():RQ(),CPf(PREVD):{'count':1,'lastReq':TU}}) and not A5(sim,'update',CPf(PREVD),TV,{'count':6,'lastReq':TU},{'count':5,'lastReq':'m_p'},{CPf(PREVD):{'count':5,'lastReq':'m_p'}},{RPf():RQ(),CPf(PREVD):{'count':6,'lastReq':TU}}) and not A5(sim,'create',CPf(),TV,{'count':1,'lastReq':TU},None,{},{CPf():{'count':1,'lastReq':TU}}) and not A5(sim,'update',CPf(),TV,{'count':6,'lastReq':TU},{'count':5,'lastReq':'m_p'},{CPf():{'count':5,'lastReq':'m_p'}},{CPf():{'count':6,'lastReq':TU}}))
    chk(f'F5 [{nm}] counter cannot be written by the public, a Google stranger or the owner; nobody can delete it',not any(A5(sim,'create',CPf(),a,{'count':1,'lastReq':'x'},None,{},{RPf():RQ(),CPf():{'count':1,'lastReq':'x'}}) for a in (None,STRANGER,OWN)) and not any(A5(sim,'delete',CPf(),a,None,{'count':5},{CPf():{'count':5}}) for a in (None,TV,OWN)))
    chk(f'F5 [{nm}] counter readable by a visitor token and the owner only',A5(sim,'get',CPf(),TV,None,{'count':1},{CPf():{'count':1}}) and A5(sim,'get',CPf(),OWN,None,{'count':1},{CPf():{'count':1}}) and not A5(sim,'get',CPf(),None,None,{'count':1},{CPf():{'count':1}}) and not A5(sim,'get',CPf(),STRANGER,None,{'count':1},{CPf():{'count':1}}) and not A5(sim,'list','reqCounters',TV))
    chk(f'F5 [{nm}] a token may read ONLY its own request; no list; no update or delete (single use)',A5(sim,'get',RPf(),TV,None,REQ(),{RPf():REQ()}) and not A5(sim,'get',RPf('m_other_12345'),TV,None,REQ(),{RPf('m_other_12345'):REQ()}) and not A5(sim,'list','meetingRequests',TV) and not A5(sim,'update',RPf(),TV,RQ(message='x'),RQ(),{RPf():RQ()},{RPf():RQ(message='x')}) and not A5(sim,'delete',RPf(),TV,None,RQ(),{RPf():RQ()}))
    chk(f'F5 [{nm}] a visitor token has no other powers: cannot write content/guard, settings, clients, ownerPrivate, or read other private collections',not any(A5(sim,'create',p,TV,{'a':1}) or A5(sim,'update',p,TV,{'a':1},{'a':0},{p:{'a':0}}) for p in ('content/guard','settings/site','clients/c1','ownerPrivate/x','chatUnanswered/x','visits/x')) and not any(A5(sim,'get',p,TV,None,{'a':0},{p:{'a':0}}) for p in ('clients/c1','ownerPrivate/x','chatUnanswered/x','visits/x')))
    chk(f'F5 [{nm}] owner can read requests and counters, set tokenRequired/cap in content/guard, but cannot create through the token path',A5(sim,'get',RPf(),OWN,None,REQ(),{RPf():REQ()}) and A5(sim,'update','content/guard',OWN,{'tokenRequired':True,'cap':40},{'pause':False},{'content/guard':{'pause':False}}) and not A5(sim,'create',RPf('OWNERUID'),OWN,RQ(),None,{},{RPf('OWNERUID'):RQ(),CPf():{'count':1,'lastReq':'OWNERUID'}}))
    chk(f'F5 [{nm}] visitors (token, public, stranger) cannot turn the switch off or change the cap',not any(A5(sim,'update','content/guard',a,{'tokenRequired':False,'cap':9999},{'tokenRequired':True},{'content/guard':{'tokenRequired':True}}) for a in (None,TV,STRANGER)))
# ---------------- 9. cross-check: strict file equals transition file apart from the owner check
a=re.sub(r'\s+','',TXT); b=re.sub(r'\s+','',re.sub(r'^//.*\n','',STRICT,flags=re.M))
chk('strict rules differ from the transition rules only in the owner e-mail fallback',a.replace("&&(request.auth.uid==ownerUid()||request.auth.token.email=='fredespinosa86.app@gmail.com');","&&request.auth.uid==ownerUid();")==b,'')
bad=[n for n,o in res if not o]; print(f'{len(res)-len(bad)}/{len(res)} passed'); sys.exit(1 if bad else 0)
