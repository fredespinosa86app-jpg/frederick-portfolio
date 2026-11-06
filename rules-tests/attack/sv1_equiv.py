# SV1 guards that no test can tell apart because another clause already makes the same decision. Judged by reading; the emulator run is the final arbiter.
# Keys are the exact labels of mutations_sv1_gen.py.
SV1_EQUIV = {
 "SV1G clause removed: d.keys().hasAll(['surveyVersion','employerName','company','ownerName','status','createdAt','expiresAt'])": 'a missing field already fails its own type, size or equality check in the same rule, so the required-field list changes no verdict',
 'SV1G clause removed: d.expiresAt is timestamp': 'comparing a non-timestamp with request.time is an evaluation error, which refuses the write',
 "SV1G clause removed: d.keys().hasAll(['rating','comment','best','recommend','videoUrl','displayName','displayRole','displayCompany'": 'a missing field already fails its own type, size or equality check in the same rule, so the required-field list changes no verdict',
 'SV1G clause removed: d.videoUrl is string': 'a list or map for the link fails the link pattern (matches on a non-text value is an error) even if its size() passes',
 'SV1G clause removed: intakeOpen()': 'the pause is checked twice, in the invite flip and in the response create, and both writes must pass',
 "SV1G clause removed: resource.data.status == 'sent' [957]": 'the response create checks the same status and expiry on the invite (get), and both writes of the batch must pass',
 'SV1G clause removed: resource.data.expiresAt > request.time [957]': 'the response create checks the same status and expiry on the invite (get), and both writes of the batch must pass',
 "SV1G comparison flipped >->>=: a.status == 'sent' && resource.data.expiresAt > request.time": 'the response create checks the same status and expiry on the invite (get), and both writes of the batch must pass',
 "SV1G clause removed: request.resource.data.keys().hasAll(['surveyVersion','employerName','company','ownerName','status','createdAt'": 'a missing field already fails its own type, size or equality check in the same rule, so the required-field list changes no verdict',
 'SV1G clause removed: intakeOpen() [972]': 'the pause is checked twice, in the invite flip and in the response create, and both writes must pass',
 'SV1G clause removed: get(svInv(k)).data.expiresAt > request.time': 'the invite flip checks the same expiry on the invite, and both writes of the batch must pass',
 "SV1G comparison flipped >->>=: tus == 'sent' && get(svInv(k)).data.expiresAt > request.time": 'the invite flip checks the same expiry on the invite, and both writes of the batch must pass',
 "SV1G clause removed: request.resource.data.ownerStatus in ['approved','rejected']": 'the two branches below require the exact word approved or rejected',
 "SV1G clause removed: request.resource.data.keys().hasAll(['rating','comment','best','recommend','videoUrl','displayName','displayRo": 'a missing field already fails its own type, size or equality check in the same rule, so the required-field list changes no verdict',
 "SV1G clause removed: request.resource.data.keys().hasAll(['rating','comment','best','recommend','videoUrl','displayName','displayRo [989]": 'a missing field already fails its own type, size or equality check in the same rule, so the required-field list changes no verdict',
 'SV1G clause removed: request.resource.data.testimonialId is string': 'matches() on a non-text id is an evaluation error, which refuses the write',
}
