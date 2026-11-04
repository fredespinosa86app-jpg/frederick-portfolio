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
# ---------------- 9. cross-check: strict file equals transition file apart from the owner check
a=re.sub(r'\s+','',TXT); b=re.sub(r'\s+','',re.sub(r'^//.*\n','',STRICT,flags=re.M))
chk('strict rules differ from the transition rules only in the owner e-mail fallback',a.replace("&&(request.auth.uid==ownerUid()||request.auth.token.email=='fredespinosa86.app@gmail.com');","&&request.auth.uid==ownerUid();")==b,'')
bad=[n for n,o in res if not o]; print(f'{len(res)-len(bad)}/{len(res)} passed'); sys.exit(1 if bad else 0)
