# F5 (4.5.0) mutations: each weakens ONE clause of the visitor-token / daily-counter / tokenRequired rules; attack_cases.py must fail for every one.
# Names starting with 'EQUIV ' are guards that another rule already makes unreachable (defence in depth); they are listed separately.
def X(name, a, b): return (name, a, b)
TOK = "&& visitorTok() && id == request.auth.uid && request.resource.data.day == today()\n        && getAfter(capDoc(today())).data.lastReq == request.auth.uid;"
CNT_C = "allow create: if visitorTok() && day == today() && request.resource.data.keys().hasOnly(['count','lastReq'])"
CNT_U = "allow update: if visitorTok() && day == today() && request.resource.data.keys().hasOnly(['count','lastReq'])"
F5 = [
 X('F5 visitorTok: custom provider check removed', "request.auth.token.firebase.sign_in_provider == 'custom'\n        && request.auth.token.form", "true\n        && request.auth.token.form"),
 X('F5 visitorTok: form claim check removed', "\n        && request.auth.token.form == 'meeting' && request.auth.uid.matches", "\n        && request.auth.uid.matches"),
 X('F5 visitorTok: uid shape check removed', " && request.auth.uid.matches('^m_[A-Za-z0-9_-]{8,40}$');\n    }\n    // UTC", ";\n    }\n    // UTC"),
 X('F5 visitorTok: uid minimum length loosened', "{8,40}$')", "{0,40}$')"),
 X('F5 token path: id == uid removed', "&& visitorTok() && id == request.auth.uid && request.resource.data.day", "&& visitorTok() && request.resource.data.day"),
 X('F5 token path: day == today removed', "&& id == request.auth.uid && request.resource.data.day == today()\n        && getAfter", "&& id == request.auth.uid\n        && getAfter"),
 X('F5 token path: stamp (getAfter) removed', TOK, "&& visitorTok() && id == request.auth.uid && request.resource.data.day == today();"),
 X('F5 token path: stamp only checks that a counter exists', "getAfter(capDoc(today())).data.lastReq == request.auth.uid;", "getAfter(capDoc(today())).data.count >= 1;"),
 X('F5 token path: whole path open to any signed-in user', TOK, "&& request.auth != null;"),
 X('F5 request day field removed from the allowed list', "'answers','day'])", "'answers'])"),
 X('F5 visitor may list requests', "allow get: if visitorTok() && id == request.auth.uid;", "allow read: if visitorTok();"),
 X('F5 visitor may read any request', "allow get: if visitorTok() && id == request.auth.uid;", "allow get: if visitorTok();"),
 X('F5 anyone may read requests', "allow get: if visitorTok() && id == request.auth.uid;", "allow get: if true;"),
 X('F5 own-request read removed (lost-acknowledgement check breaks)', "      allow get: if visitorTok() && id == request.auth.uid;\n", ""),
 X('F5 visitor may update requests', "allow read, update, delete: if isOwner();\n    }\n    // F5: one counter", "allow read, delete: if isOwner();\n      allow update: if visitorTok();\n    }\n    // F5: one counter"),
 X('F5 counter create: today check removed', CNT_C, "allow create: if visitorTok() && request.resource.data.keys().hasOnly(['count','lastReq'])"),
 X('F5 counter update: today check removed', CNT_U, "allow update: if visitorTok() && request.resource.data.keys().hasOnly(['count','lastReq'])"),
 X('F5 counter create: field whitelist removed', CNT_C, "allow create: if visitorTok() && day == today()"),
 X('F5 counter update: field whitelist removed', CNT_U, "allow update: if visitorTok() && day == today()"),
 X('F5 counter create: must start at 1 removed', "request.resource.data.count == 1 && request.resource.data.lastReq == request.auth.uid\n        && existsAfter", "request.resource.data.lastReq == request.auth.uid\n        && existsAfter"),
 X('F5 counter create: stamp must be own uid removed', "request.resource.data.count == 1 && request.resource.data.lastReq == request.auth.uid\n        && existsAfter", "request.resource.data.count == 1\n        && existsAfter"),
 X('F5 counter create: request must exist in the batch removed', "request.resource.data.lastReq == request.auth.uid\n        && existsAfter(reqDoc(request.auth.uid));\n      allow update", "request.resource.data.lastReq == request.auth.uid;\n      allow update"),
 X('F5 counter update: exactly +1 loosened to any increase', "request.resource.data.count == resource.data.count + 1 && underCap", "request.resource.data.count >= resource.data.count + 1 && underCap"),
 X('F5 counter update: +1 removed (any number)', "request.resource.data.count == resource.data.count + 1 && underCap", "underCap"),
 X('F5 counter update: cap check removed', " && underCap(request.resource.data.count)\n        && request.resource.data.lastReq", "\n        && request.resource.data.lastReq"),
 X('F5 counter update: stamp must be own uid removed', "&& request.resource.data.lastReq == request.auth.uid && existsAfter(reqDoc(request.auth.uid));\n      allow get", "&& existsAfter(reqDoc(request.auth.uid));\n      allow get"),
 X('F5 counter update: request must exist in the batch removed', "&& request.resource.data.lastReq == request.auth.uid && existsAfter(reqDoc(request.auth.uid));\n      allow get", "&& request.resource.data.lastReq == request.auth.uid;\n      allow get"),
 X('F5 cap: default when guard has no cap removed', "get(guardDoc()).data.get('cap', 30)", "get(guardDoc()).data.get('cap', 100000)"),
 X('F5 cap: default when no guard doc removed', "(!exists(guardDoc()) && n <= 30) ||", ""),
 X('F5 cap: default raised when no guard doc', "(!exists(guardDoc()) && n <= 30)", "(!exists(guardDoc()) && n <= 30000)"),
 X('F5 cap: owner value ignored', "n <= get(guardDoc()).data.get('cap', 30))", "n <= 30)"),
 X('F5 counter deletable', "      allow list: if isOwner();\n      allow delete: if false;", "      allow list: if isOwner();\n      allow delete: if true;"),
 X('F5 counter readable by everyone', "allow get: if visitorTok() || isOwner();", "allow get: if true;"),
 X('F5 counter listable by visitors', "allow list: if isOwner();", "allow list: if visitorTok() || isOwner();"),
 X('F5 today(): uses a fixed month weight', "request.time.month() * 100", "request.time.month() * 10"),
]
