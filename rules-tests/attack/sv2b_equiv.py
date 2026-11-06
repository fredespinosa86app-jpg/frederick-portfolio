# SV2b guards that no test can tell apart because another clause already makes the same decision (each with its reason). Judged by reading; the emulator run is the final arbiter.
SV2B_EQUIV = {
  'SV2BG clause removed: q is map': 'q.keys() on anything that is not a map is an evaluation error, which refuses the write',
  "SV2BG clause removed: q.keys().hasAll(['id','type','label','required','options'])": 'every one of the five fields is read on its own below, and a missing field makes that read fail',
  'SV2BG clause removed: q.options.size() >= 2': 'svOpt(q.options[1]) fails when there is no second option',
  'SV2BG clause removed: qs is list': 'qs[0] on anything that is not a list is an evaluation error',
  'SV2BG clause removed: qs.size() >= 1': 'qs[0] fails on an empty list',
  'SV2BG clause removed: d[key] is string [1042]': 'the options are all text, so a non-text answer can never be in the list',
  "SV2BG clause removed: d.keys().hasAll(['submittedAt'])": 'd.submittedAt == request.time fails when the field is missing',
  "SV2BG clause removed: request.resource.data.keys().hasAll(['title','intro','questions','updatedAt'])": 'each of those fields is read on its own by svFormBody or the time check, and a missing one makes that read fail',
  "SV2BG clause removed: request.resource.data.keys().hasAll(['title','intro','questions','createdAt'])": 'each of those fields is read on its own by svFormBody or the time check, and a missing one makes that read fail',
  'SV2BG clause removed: existsAfter(svInv(k))': 'getAfter(svInv(k)) on the next line fails when the invite is not part of the same batch',
  'SV2BG clause removed: exists(svFormDoc(k))': 'get(svFormDoc(k)) later in the same rule fails when there is no form',
}
