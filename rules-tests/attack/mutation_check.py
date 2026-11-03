# Mutation test: weaken the rules in ~14 ways; the attack suite must notice every single one.
import sys, re, os, subprocess, tempfile, shutil
ROOT=sys.argv[1]; SP=os.path.dirname(os.path.abspath(__file__)); TXT=open(ROOT+'/firestore.rules').read()
M=[('clients readable by everyone',"match /clients/{id} { allow read, write: if isOwner(); }","match /clients/{id} { allow read: if true; allow write: if isOwner(); }"),
 ('ownerPrivate world-writable',"match /ownerPrivate/{doc} { allow read, write: if isOwner(); }","match /ownerPrivate/{doc} { allow read, write: if true; }"),
 ('email format check removed',"        && request.resource.data.email.matches('^[^@\\\\s]+@[^@\\\\s]+\\\\.[^@\\\\s]+$')\n",""),
 ('status forced to new removed',"        && request.resource.data.status == 'new'\n        && request.resource.data.createdAt == request.time\n        && intakeOpen()\n        && capOpen()","        && intakeOpen()\n        && capOpen()"),
 ('field whitelist on requests removed',"allow create: if request.resource.data.keys().hasOnly(['name','email','company','date','time','tz','platform','message','status','createdAt','service','formId','formName','answers'])\n        &&","allow create: if true\n        &&"),
 ('message size limit removed',"request.resource.data.message.size() <= 2000","request.resource.data.message.size() <= 2000000"),
 ('pause ignored on visits',"match /visits/{id} {\n      allow create: if intakeOpen()\n        &&","match /visits/{id} {\n      allow create: if true\n        &&"),
 ('visit id binding removed',"        && id == request.resource.data.sid + '_' + request.resource.data.type + '_' + request.resource.data.path\n",""),
 ('chat id binding removed',"        && id.matches('^' + request.resource.data.sessionId + '_[a-z0-9]{1,12}$')\n",""),
 ('capacity check removed',"        && capOpen()\n",""),
 ('busy-slot check removed',"        && slotFree();","        && true;"),
 ('provider check removed',"        && request.auth.token.firebase.sign_in_provider == 'google.com';","        && true;"),
 ('verified e-mail check removed',"        && request.auth.token.email_verified == true\n",""),
 ('visitors may read visits',"      allow read, delete: if isOwner();\n    }\n    match /clients","      allow read, delete: if true;\n    }\n    match /clients"),
 ('summary section whitelist removed',"        && request.resource.data.secs.hasOnly([","        && request.resource.data.secs.hasAll([]) && request.resource.data.secs.hasOnly(['intro','faq','services','training','experience','toolkit','process','testimonials','thank-you','contact','schedule','admin','<script>','Intro','x',"),
 ('summary id binding removed',"        && id == request.resource.data.sid + '_summary_sections'\n",""),
 ('summary update may shrink',"        && request.resource.data.secs.size() > resource.data.secs.size()\n",""),
 ('summary update superset check removed',"        && request.resource.data.secs.hasAll(resource.data.secs);","        && true;"),
 ('summary update may change device',"request.resource.data.device == resource.data.device\n","true\n"),
 ('summary update ignores pause',"      allow update: if intakeOpen()\n        && resource.data.type == 'summary'","      allow update: if true\n        && resource.data.type == 'summary'"),
 ('section type accepted again',"request.resource.data.type == 'view'","request.resource.data.type in ['view','section']"),
 ('catch-all added',"    match /content/{doc} {","    match /{any=**} { allow read, write: if true; }\n    match /content/{doc} {")]
miss=[]
for n,a,b in M:
    if a not in TXT: print('SKIP (pattern not found):',n); miss.append(n); continue
    d=tempfile.mkdtemp(); open(d+'/firestore.rules','w').write(TXT.replace(a,b,1)); shutil.copy(ROOT+'/firestore.rules.strict',d)
    out=subprocess.run([sys.executable,SP+'/attack_cases.py',d],capture_output=True,text=True).stdout
    fails=[l for l in out.splitlines() if l.startswith('FAIL') and 'strict rules differ' not in l]
    print(('CAUGHT ' if fails else 'MISSED ')+n+(f' ({len(fails)} checks fail)' if fails else '')); 
    if not fails: miss.append(n)
print('RESULT',len(M)-len(miss),'of',len(M),'mutations caught'); sys.exit(1 if miss else 0)
