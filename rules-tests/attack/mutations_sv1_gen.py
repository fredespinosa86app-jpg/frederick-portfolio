# SV1 (4.5.0) generated mutations: for every clause of every line in the survey rules block the clause is REPLACED by `true` (one at a time) and every comparison
# (>=, <=, >, <, ==) is flipped (one at a time) - the same method as the B2 generator. attack_cases.py (section 8m) must fail for every one, except the guards in
# SV1_EQUIV, which another rule already makes unreachable (each with its reason). Reuses the helpers of mutations_b2.py.
import sys, re
import mutations_b2 as B
_T = B._T
SV1_EQUIV = {}
try:
    from sv1_equiv import SV1_EQUIV
except Exception: pass
def build():
    lines = _T.split('\n'); out = []; seen = set()
    a = _T[:_T.index('    // SV1 (4.5.0)')].count('\n'); b = _T[:_T.index('    // end SV1')].count('\n')
    for idx in range(a, b):
        raw = lines[idx]; ln = raw.strip()
        if not ln or ln.startswith('//') or ln.startswith('match '):
            continue
        text, keep = B._uniq(lines, idx)
        if text is None: continue
        for (s, e) in B._segments(raw):
            seg = raw[s:e].strip(' &'); new = raw[:s] + 'true' + raw[e:]
            lab = f'SV1G clause removed: {re.sub(chr(32)+"+", " ", seg)[:110]}'; key = (text, new)
            if key in seen: continue
            seen.add(key); out.append((lab if lab not in [o[0] for o in out] else lab + f' [{idx+1}]', text, keep + new + '\n'))
        for m in re.finditer(r" (>=|<=|>|<|==|!=) ", raw):
            op = m.group(1); rep = {'>=': '>', '<=': '<', '>': '>=', '<': '<=', '==': '!=', '!=': '=='}[op]
            new = raw[:m.start()] + ' ' + rep + ' ' + raw[m.end():]
            ctx = raw[max(0, m.start()-45):m.end()+25].strip(); lab = f'SV1G comparison flipped {op}->{rep}: {re.sub(chr(32)+"+", " ", ctx)}'; key = (text, new)
            if key in seen: continue
            seen.add(key); out.append((lab if lab not in [o[0] for o in out] else lab + f' [{idx+1}]', text, keep + new + '\n'))
    return out
SV1G = [(('EQUIV ' + n) if n in SV1_EQUIV else n, a, b) for n, a, b in build()]
