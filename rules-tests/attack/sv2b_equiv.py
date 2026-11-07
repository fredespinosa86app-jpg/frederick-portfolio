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

# SE-H1 moved the rules text: carry every line-numbered note to its new line number (see b2_equiv.py)
import re as _re, difflib as _dl, os as _os
_old=_os.path.join(_os.path.dirname(__file__),'rules_before_h1.txt'); _new=_os.path.join(_os.path.dirname(__file__),'..','..','firestore.rules.strict')
if _os.path.exists(_old):
    _a=open(_old).read().split('\n'); _b=open(_new).read().split('\n'); _map={}
    for _t,_i1,_i2,_j1,_j2 in _dl.SequenceMatcher(None,_a,_b,autojunk=False).get_opcodes():
        if _t=='equal':
            for _d in range(_i2-_i1): _map[_i1+_d+1]=_j1+_d+1
    for _k,_v in list(SV2B_EQUIV.items()):
        _m=_re.search(r' \[(\d+)\]$',_k)
        if _m and int(_m.group(1)) in _map: SV2B_EQUIV.setdefault(_k[:_m.start()]+' ['+str(_map[int(_m.group(1))])+']',_v)
