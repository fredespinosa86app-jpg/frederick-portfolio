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
PRIV=['clients','ownerPrivate','meetingRequests','chatUnanswered','activity','visits']
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
# ---------------- 9. cross-check: strict file equals transition file apart from the owner check
a=re.sub(r'\s+','',TXT); b=re.sub(r'\s+','',re.sub(r'^//.*\n','',STRICT,flags=re.M))
chk('strict rules differ from the transition rules only in the owner e-mail fallback',a.replace("&&(request.auth.uid==ownerUid()||request.auth.token.email=='fredespinosa86.app@gmail.com');","&&request.auth.uid==ownerUid();")==b,'')
bad=[n for n,o in res if not o]; print(f'{len(res)-len(bad)}/{len(res)} passed'); sys.exit(1 if bad else 0)
