# D1 (4.5.0) mutations: each weakens ONE clause of the owner-only documents rules; attack_cases.py must fail for every one.
def X(name, a, b): return (name, a, b)
RD = "      allow read, delete: if isOwner();\n      allow create: if isOwner() && id.matches('^[a-z0-9]{8,32}$')"
D1 = [
 X('D1 anyone may read documents', RD, "      allow read: if true;\n      allow delete: if isOwner();\n      allow create: if isOwner() && id.matches('^[a-z0-9]{8,32}$')"),
 X('D1 anyone may delete documents', RD, "      allow read: if isOwner();\n      allow delete: if true;\n      allow create: if isOwner() && id.matches('^[a-z0-9]{8,32}$')"),
 X('D1 any signed-in user may read documents', RD, "      allow read: if request.auth != null;\n      allow delete: if isOwner();\n      allow create: if isOwner() && id.matches('^[a-z0-9]{8,32}$')"),
 X('D1 create: owner check removed', "allow create: if isOwner() && id.matches('^[a-z0-9]{8,32}$') && ownerDocOk", "allow create: if id.matches('^[a-z0-9]{8,32}$') && ownerDocOk"),
 X('D1 update: owner check removed', "allow update: if isOwner() && ownerDocOk(request.resource.data)\n        && request.resource.data.createdAt == resource.data.createdAt", "allow update: if ownerDocOk(request.resource.data)\n        && request.resource.data.createdAt == resource.data.createdAt"),
 X('D1 id pattern removed', "id.matches('^[a-z0-9]{8,32}$') && ownerDocOk", "ownerDocOk"),
 X('D1 id minimum length loosened', "{8,32}$') && ownerDocOk", "{1,32}$') && ownerDocOk"),
 X('D1 id maximum length loosened', "{8,32}$') && ownerDocOk", "{8,200}$') && ownerDocOk"),
 X('D1 id allows capitals', "'^[a-z0-9]{8,32}$') && ownerDocOk", "'^[a-zA-Z0-9]{8,32}$') && ownerDocOk"),
 X('D1 field whitelist removed', "return d.keys().hasOnly(['title','category','body','createdAt','updatedAt'])\n        && d.keys().hasAll", "return true\n        && d.keys().hasAll"),
 X('EQUIV D1 required fields check removed (every field is also checked by type below)', "\n        && d.keys().hasAll(['title','category','body','createdAt','updatedAt'])", ""),
 X('D1 title must be text check removed', "d.title is string && d.title.size() > 0", "d.title.size() > 0"),
 X('D1 empty title allowed', "d.title.size() > 0 && d.title.size() <= 120", "d.title.size() >= 0 && d.title.size() <= 120"),
 X('D1 title length limit loosened', "d.title.size() <= 120", "d.title.size() <= 1200"),
 X('D1 category whitelist removed', "d.category is string && d.category in ['security','runbook','notes','other']", "d.category is string"),
 X('D1 category whitelist widened', "['security','runbook','notes','other']", "['security','runbook','notes','other','admin']"),
 X('D1 body must be text check removed', "d.body is string && d.body.size() <= 50000", "d.body.size() <= 50000"),
 X('D1 body length limit loosened', "d.body.size() <= 50000", "d.body.size() <= 500000"),
 X('D1 create: createdAt may be forged', "&& request.resource.data.createdAt == request.time && request.resource.data.updatedAt == request.time;\n      allow update", "&& request.resource.data.updatedAt == request.time;\n      allow update"),
 X('D1 create: updatedAt may be forged', "&& request.resource.data.createdAt == request.time && request.resource.data.updatedAt == request.time;\n      allow update", "&& request.resource.data.createdAt == request.time;\n      allow update"),
 X('D1 update: createdAt may change', "\n        && request.resource.data.createdAt == resource.data.createdAt && request.resource.data.updatedAt == request.time;", "\n        && request.resource.data.updatedAt == request.time;"),
 X('D1 update: updatedAt may be forged', "&& request.resource.data.createdAt == resource.data.createdAt && request.resource.data.updatedAt == request.time;", "&& request.resource.data.createdAt == resource.data.createdAt;"),
 X('EQUIV D1 timestamp type check removed (the time equality checks already force timestamps)', "\n        && d.createdAt is timestamp && d.updatedAt is timestamp;", ";"),
 X('D1 catch-all inside the portal', "    match /ownerDocs/{id} {\n", "    match /ownerDocs/{id=**} { allow read, write: if true; }\n    match /ownerDocs/{id} {\n"),
]
