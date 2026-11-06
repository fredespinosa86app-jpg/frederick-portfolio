# W5b (4.5.0) mutations: each weakens ONE clause of the break-schedule rules; attack_cases.py must fail for every one.
def X(name, a, b): return (name, a, b)
HD = "      allow read, delete: if isOwner();\n      allow create: if isOwner() && wsId(id)"
CR = "allow create: if isOwner() && wsId(id) && wsOk(request.resource.data)\n        && request.resource.data.rev == 1 && request.resource.data.updatedAt == request.time;"
UP = "allow update: if isOwner() && wsId(id) && wsOk(request.resource.data)\n        && request.resource.data.rev == resource.data.rev + 1 && request.resource.data.updatedAt == request.time\n        && request.resource.data.pfb == resource.data.fb && request.resource.data.plu == resource.data.lu && request.resource.data.plb == resource.data.lb;"
W5B = [
 X('W5b anyone may read schedules', HD, "      allow read: if true;\n      allow delete: if isOwner();\n      allow create: if isOwner() && wsId(id)"),
 X('W5b anyone may delete schedules', HD, "      allow read: if isOwner();\n      allow delete: if true;\n      allow create: if isOwner() && wsId(id)"),
 X('W5b any signed-in user may read schedules', HD, "      allow read: if request.auth != null;\n      allow delete: if isOwner();\n      allow create: if isOwner() && wsId(id)"),
 X('W5b create: owner check removed', "allow create: if isOwner() && wsId(id)", "allow create: if wsId(id)"),
 X('W5b update: owner check removed', "allow update: if isOwner() && wsId(id)", "allow update: if wsId(id)"),
 X('W5b create: id check removed', CR, CR.replace("wsId(id) && ", "")),
 X('W5b update: id check removed', UP, UP.replace("wsId(id) && ", "")),
 X('W5b id: any valid-looking name allowed (registry check removed)', "validClientId(id) && exists(regDoc(id))", "validClientId(id)"),
 X('W5b id: any text allowed besides default', "(validClientId(id) && exists(regDoc(id)))", "true"),
 X('W5b create: field whitelist removed', "d.keys().hasOnly(['fb','lu','lb','pfb','plu','plb','rev','updatedAt'])\n        && d.keys().hasAll", "true\n        && d.keys().hasAll"),
 X('EQUIV W5b required fields check removed (a missing field already fails its own type and range check)', "\n        && d.keys().hasAll(['fb','lu','lb','pfb','plu','plb','rev','updatedAt'])", ""),
 X('W5b minutes: range upper bound loosened', "v is int && v >= 0 && v <= 240", "v is int && v >= 0 && v <= 2400"),
 X('W5b minutes: range lower bound loosened', "v is int && v >= 0 && v <= 240", "v is int && v >= -5 && v <= 240"),
 X('W5b minutes: integer check removed', "v is int && v >= 0 && v <= 240", "v >= 0 && v <= 240"),
 X('W5b fb not checked', "wsInt(d.fb) && wsInt(d.lu)", "wsInt(d.lu)"),
 X('W5b lu not checked', "wsInt(d.lu) && wsInt(d.lb)", "wsInt(d.lb)"),
 X('W5b lb not checked', "wsInt(d.lb) && wsInt(d.pfb)", "wsInt(d.pfb)"),
 X('W5b pfb not checked', "wsInt(d.pfb) && wsInt(d.plu)", "wsInt(d.plu)"),
 X('W5b plu not checked', "wsInt(d.plu) && wsInt(d.plb)", "wsInt(d.plb)"),
 X('W5b plb not checked', "wsInt(d.plb)\n", "true\n"),
 X('W5b rev type not checked', "&& d.rev is int && d.updatedAt is timestamp;\n    }\n    function wsId", "&& d.updatedAt is timestamp;\n    }\n    function wsId"),
 X('EQUIV W5b updatedAt type check removed (the equality with request.time already forces a timestamp)', "&& d.rev is int && d.updatedAt is timestamp;\n    }\n    function wsId", "&& d.rev is int;\n    }\n    function wsId"),
 X('W5b create: rev may be anything', "request.resource.data.rev == 1 && request.resource.data.updatedAt == request.time;", "request.resource.data.updatedAt == request.time;"),
 X('W5b create: updatedAt may be forged', "request.resource.data.rev == 1 && request.resource.data.updatedAt == request.time;", "request.resource.data.rev == 1;"),
 X('W5b update: rev may be anything', "request.resource.data.rev == resource.data.rev + 1 && request.resource.data.updatedAt == request.time\n        && request.resource.data.pfb", "request.resource.data.updatedAt == request.time\n        && request.resource.data.pfb"),
 X('W5b update: rev may jump by 2', "request.resource.data.rev == resource.data.rev + 1 &&", "request.resource.data.rev == resource.data.rev + 2 ||"),
 X('W5b update: updatedAt may be forged', "request.resource.data.rev == resource.data.rev + 1 && request.resource.data.updatedAt == request.time\n        && request.resource.data.pfb", "request.resource.data.rev == resource.data.rev + 1\n        && request.resource.data.pfb"),
 X('W5b update: pfb need not equal the replaced value', "request.resource.data.pfb == resource.data.fb && request.resource.data.plu", "request.resource.data.plu"),
 X('W5b update: plu need not equal the replaced value', "request.resource.data.plu == resource.data.lu && request.resource.data.plb", "request.resource.data.plb"),
 X('W5b update: plb need not equal the replaced value', "&& request.resource.data.plb == resource.data.lb;", ";"),
 X('W5b catch-all inside the schedules', "    match /workSchedules/{id} {\n", "    match /workSchedules/{id=**} { allow read, write: if true; }\n    match /workSchedules/{id} {\n"),
]
