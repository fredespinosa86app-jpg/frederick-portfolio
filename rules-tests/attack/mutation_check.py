# Mutation test: weaken the rules in ~14 ways; the attack suite must notice every single one.
import sys, re, os, subprocess, tempfile, shutil
ROOT=sys.argv[1]; SP=os.path.dirname(os.path.abspath(__file__)); TXT=open(ROOT+'/firestore.rules').read()
M=[('clients readable by everyone',"match /clients/{id} { allow read, write: if isOwner(); }","match /clients/{id} { allow read: if true; allow write: if isOwner(); }"),
 ('ownerPrivate world-writable',"match /ownerPrivate/{doc} { allow read, write: if isOwner(); }","match /ownerPrivate/{doc} { allow read, write: if true; }"),
 ('email format check removed',"        && request.resource.data.email.matches('^[^@\\\\s]+@[^@\\\\s]+\\\\.[^@\\\\s]+$')\n",""),
 ('status forced to new removed',"        && request.resource.data.status == 'new'\n        && request.resource.data.createdAt == request.time\n        && intakeOpen()\n        && capOpen()","        && intakeOpen()\n        && capOpen()"),
 ('field whitelist on requests removed',"allow create: if request.resource.data.keys().hasOnly(['name','email','company','date','time','tz','platform','message','status','createdAt','service','formId','formName','answers','day'])\n        &&","allow create: if true\n        &&"),
 ('message size limit removed',"request.resource.data.message.size() <= 2000","request.resource.data.message.size() <= 2000000"),
 ('pause ignored on visits',"match /visits/{id} {\n      allow create: if intakeOpen()\n        &&","match /visits/{id} {\n      allow create: if true\n        &&"),
 ('visit id binding removed',"        && id == request.resource.data.sid + '_' + request.resource.data.type + '_' + request.resource.data.path\n",""),
 ('chat id binding removed',"        && id.matches('^' + request.resource.data.sessionId + '_[a-z0-9]{1,12}$')\n",""),
 ('capacity check removed',"        && capOpen()\n",""),
 ('busy-slot check removed',"        && slotFree()\n","        && true\n"),
 ('provider check removed',"        && request.auth.token.firebase.sign_in_provider == 'google.com';","        && true;"),
 ('verified e-mail check removed',"        && request.auth.token.email_verified == true\n",""),
 ('visitors may read visits',"      allow read, delete: if isOwner();\n    }\n    // E3","      allow read, delete: if true;\n    }\n    // E3"),
 ('summary section whitelist removed',"        && request.resource.data.secs.hasOnly([","        && request.resource.data.secs.hasAll([]) && request.resource.data.secs.hasOnly(['intro','faq','services','training','experience','toolkit','process','testimonials','thank-you','contact','schedule','admin','<script>','Intro','x',"),
 ('summary id binding removed',"        && id == request.resource.data.sid + '_summary_sections'\n",""),
 ('summary update may shrink',"        && request.resource.data.secs.size() > resource.data.secs.size()\n",""),
 ('summary update superset check removed',"        && request.resource.data.secs.hasAll(resource.data.secs);","        && true;"),
 ('summary update may change device',"request.resource.data.device == resource.data.device\n","true\n"),
 ('summary update ignores pause',"      allow update: if intakeOpen()\n        && resource.data.type == 'summary'","      allow update: if true\n        && resource.data.type == 'summary'"),
 ('section type accepted again',"request.resource.data.type == 'view'","request.resource.data.type in ['view','section']"),
 ('library readable by everyone',"match /library/{id} {\n      allow read, delete: if isOwner();","match /library/{id} {\n      allow read: if true;\n      allow delete: if isOwner();"),
 ('libraryFull writable by everyone',"match /libraryFull/{id} {\n      allow read, delete: if isOwner();\n      allow create, update: if isOwner()","match /libraryFull/{id} {\n      allow read, delete: if isOwner();\n      allow create, update: if true"),
 ('library meta writable by everyone',"match /library/{id} {\n      allow read, delete: if isOwner();\n      allow create, update: if isOwner()","match /library/{id} {\n      allow read, delete: if isOwner();\n      allow create, update: if true"),
 ('library data type check removed',"        && request.resource.data.data.matches('^data:image/webp;base64,[A-Za-z0-9+/]+={0,2}$')\n",""),
 ('library data size limit removed',"request.resource.data.data.size() <= 360000","request.resource.data.data.size() <= 360000000"),
 ('library mime check removed',"        && request.resource.data.mime == 'image/webp'\n",""),
 ('library bytes cap removed',"request.resource.data.bytes >= 1 && request.resource.data.bytes <= 262144","request.resource.data.bytes >= 1"),
 ('libraryFull bytes cap removed',"request.resource.data.bytes is number && request.resource.data.bytes <= 262144;","request.resource.data.bytes is number;"),
 ('library thumb size limit removed',"request.resource.data.thumb.size() <= 24000","request.resource.data.thumb.size() <= 24000000"),
 ('P0 registry readable by everyone',"match /clientRegistry/{id} {\n      allow read: if isOwner();","match /clientRegistry/{id} {\n      allow read: if true;"),
 ('P0 registry audit readable by everyone',"match /clientRegistryAudit/{aid} {\n      allow read: if isOwner();","match /clientRegistryAudit/{aid} {\n      allow read: if true;"),
 ('P0 registry create open to everyone',"allow create: if isOwner() && validClientId(id)\n        && request.resource.data.keys().hasOnly(['status','notes','createdAt','updatedAt','rev','lastAudit'])\n        && request.resource.data.keys().hasAll(['status','notes','createdAt','updatedAt','rev','lastAudit'])\n        && request.resource.data.status == 'active'","allow create: if validClientId(id)\n        && request.resource.data.keys().hasOnly(['status','notes','createdAt','updatedAt','rev','lastAudit'])\n        && request.resource.data.keys().hasAll(['status','notes','createdAt','updatedAt','rev','lastAudit'])\n        && request.resource.data.status == 'active'"),
 ('P0 registry update open to everyone',"allow update: if isOwner() && validClientId(id)","allow update: if validClientId(id)"),
 ('P0 Client ID format check removed from the helper',"function validClientId(id) { return id.matches('^[A-Z][A-Z0-9-]{1,22}[A-Z0-9]$') && !id.matches('.*--.*'); }","function validClientId(id) { return true; }"),
 ('P0 double hyphen allowed',"&& !id.matches('.*--.*'); }","; }"),
 ('P0 registry create may start archived',"        && request.resource.data.status == 'active'\n        && request.resource.data.notes is string && request.resource.data.notes.size() <= 500\n        && request.resource.data.rev == 1","        && request.resource.data.notes is string && request.resource.data.notes.size() <= 500\n        && request.resource.data.rev == 1"),
 ('P0 registry create rev check removed',"        && request.resource.data.rev == 1\n",""),
 ('P0 registry update rev+1 removed',"request.resource.data.rev is number && request.resource.data.rev == resource.data.rev + 1\n        && request.resource.data.createdAt == resource.data.createdAt","request.resource.data.rev is number\n        && request.resource.data.createdAt == resource.data.createdAt"),
 ('P0 registry createdAt may change on update',"request.resource.data.createdAt == resource.data.createdAt && request.resource.data.updatedAt == request.time","request.resource.data.updatedAt == request.time"),
 ('P0 registry update status list removed',"request.resource.data.status in ['active','archived']","request.resource.data.status is string"),
 ('P0 registry create audit pairing removed',"&& !exists(regAudit(request.resource.data.lastAudit)) && existsAfter(regAudit(request.resource.data.lastAudit));\n      allow update","&& true;\n      allow update"),
 ('P0 registry update audit pairing removed',"&& !exists(regAudit(request.resource.data.lastAudit)) && existsAfter(regAudit(request.resource.data.lastAudit));\n    }\n    match /clientRegistryAudit","&& true;\n    }\n    match /clientRegistryAudit"),
 ('P0 registry audit replay allowed (no !exists)',"&& !exists(regAudit(request.resource.data.lastAudit)) && existsAfter(regAudit(request.resource.data.lastAudit));\n    }\n    match /clientRegistryAudit","&& existsAfter(regAudit(request.resource.data.lastAudit));\n    }\n    match /clientRegistryAudit"),
 ('P0 registry notes size limit removed',"request.resource.data.notes is string && request.resource.data.notes.size() <= 500\n        && request.resource.data.rev is number","request.resource.data.notes is string\n        && request.resource.data.rev is number"),
 ('P0 registry personal-data field whitelist removed on create',"allow create: if isOwner() && validClientId(id)\n        && request.resource.data.keys().hasOnly(['status','notes','createdAt','updatedAt','rev','lastAudit'])\n        &&","allow create: if isOwner() && validClientId(id)\n        &&"),
 ('P0 registry delete allowed',"    match /clientRegistry/{id} {\n      allow read: if isOwner();","    match /clientRegistry/{id} {\n      allow read, delete: if isOwner();"),
 ('P0 audit may be deleted',"match /clientRegistryAudit/{aid} {\n      allow read: if isOwner();","match /clientRegistryAudit/{aid} {\n      allow read, delete: if isOwner();"),
 ('P0 audit may be edited',"match /clientRegistryAudit/{aid} {\n      allow read: if isOwner();","match /clientRegistryAudit/{aid} {\n      allow read, update: if isOwner();"),
 ('P0 audit actor check removed',"        && request.resource.data.actor == request.auth.uid\n",""),
 ('P0 audit server-time check removed',"        && request.resource.data.actor == request.auth.uid\n        && request.resource.data.createdAt == request.time\n","        && request.resource.data.actor == request.auth.uid\n"),
 ('P0 audit orphan allowed (registry pairing removed)',"        && existsAfter(regDoc(request.resource.data.clientId))\n        && getAfter(regDoc(request.resource.data.clientId)).data.lastAudit == aid\n        && getAfter(regDoc(request.resource.data.clientId)).data.rev == request.resource.data.rev\n",""),
 ('P0 audit lastAudit link removed',"        && getAfter(regDoc(request.resource.data.clientId)).data.lastAudit == aid\n",""),
 ('P0 audit rev link removed',"        && getAfter(regDoc(request.resource.data.clientId)).data.rev == request.resource.data.rev\n",""),
 ('P0 audit status reason requirement removed',"        && (request.resource.data.action != 'status' || request.resource.data.reason.size() >= 3)\n",""),
 ('P0 audit action whitelist removed',"request.resource.data.action in ['create','status','notes']","request.resource.data.action is string"),
 ('P0 audit create/rev1 coupling removed',"        && ((request.resource.data.action == 'create') == (request.resource.data.rev == 1))\n",""),
 ('P0 audit status old/new check removed',"        && (request.resource.data.action != 'status' || (request.resource.data.prev == get(regDoc(request.resource.data.clientId)).data.status && request.resource.data.next == getAfter(regDoc(request.resource.data.clientId)).data.status))\n",""),
 ('P0 audit notes old/new check removed',"        && (request.resource.data.action != 'notes' || (request.resource.data.prev == get(regDoc(request.resource.data.clientId)).data.notes && request.resource.data.next == getAfter(regDoc(request.resource.data.clientId)).data.notes));","        ;"),
 ('P0 audit reason size limit removed',"request.resource.data.reason is string && request.resource.data.reason.size() <= 200","request.resource.data.reason is string"),
 ('catch-all added',"    match /content/{doc} {","    match /{any=**} { allow read, write: if true; }\n    match /content/{doc} {")]
sys.path.insert(0,SP)
from mutations_w1 import W1
from mutations_w2 import W2
from mutations_w3 import W3
from mutations_b1 import B1
from mutations_b2 import B2
from mutations_f5 import F5
from mutations_d1 import D1
from mutations_w5b import W5B
from mutations_sv1 import SV1
from mutations_sv1_gen import SV1G
from mutations_sv2a import SV2A
from mutations_sv2b_gen import SV2BG
from mutations_h1 import H1
M=M+W1+W2+W3+B1+B2+F5+D1+W5B+SV1+SV1G+SV2A+SV2BG+H1
def mk(rules_text):
    """a throw-away copy of the project parts the attack suite reads (rules + the page state machine used by the W1 case generator)"""
    d=tempfile.mkdtemp(); open(d+'/firestore.rules','w').write(rules_text); shutil.copy(ROOT+'/firestore.rules.strict',d)
    os.makedirs(d+'/scripts'); shutil.copy(ROOT+'/scripts/core-worktrack.js',d+'/scripts'); return d
# the suite must be completely green on the UNMUTATED rules first, otherwise "caught" would prove nothing
_b=subprocess.run([sys.executable,SP+'/attack_cases.py',mk(TXT)],capture_output=True,text=True).stdout
_bf=[l for l in _b.splitlines() if l.startswith('FAIL')]
if _bf: print('BASELINE NOT GREEN:',_bf[:3]); sys.exit(2)
print('baseline green:',_b.strip().splitlines()[-1])
miss=[]; equiv=[]
for n,a,b in M:
    if os.environ.get('ONLY') and not n.startswith(os.environ['ONLY']): continue
    if a not in TXT:
        # the entry and invoice update rules were moved into functions that call the new record n and the old record o (4.5.0 B2): translate the old wording
        def _tr(s): return s.replace('allow update: if isOwner() && beOk(request.resource.data)','return beOk(n)').replace('request.resource.data.','n.').replace('request.resource.data','n').replace('resource.data.','o.').replace('resource.data','o')
        if _tr(a) in TXT: a,b=_tr(a),_tr(b)
        else: print('SKIP (pattern not found):',n); miss.append(n); continue
    d=mk(TXT.replace(a,b,1))
    out=subprocess.run([sys.executable,SP+'/attack_cases.py',d],capture_output=True,text=True).stdout
    fails=[l for l in out.splitlines() if l.startswith('FAIL') and 'strict rules differ' not in l]
    if n.startswith('EQUIV '):   # a guard that another rule already makes impossible to reach (defence in depth): weakening it changes no verdict
        print(('CAUGHT (although redundant) ' if fails else 'EQUIVALENT (redundant guard, no verdict changes) ')+n); equiv.append(n); continue
    print(('CAUGHT ' if fails else 'MISSED ')+n+(f' ({len(fails)} checks fail)' if fails else ''))
    if not fails: miss.append(n)
real=len([1 for n,a,b in M if not os.environ.get('ONLY') or n.startswith(os.environ['ONLY'])])-len(equiv)
print('RESULT',real-len(miss),'of',real,'real mutations caught;',len(equiv),'redundant guards listed separately'); sys.exit(1 if miss else 0)
