# B2 (4.5.0) mutations. Generated from the B2 rules text itself: for every clause of every line in the B2 blocks the clause is REMOVED (one at a time), and every comparison
# (>=, <=, >, <, ==) is flipped (one at a time). attack_cases.py (section 8j) must fail for every one, except the guards in EQUIV_NOTES, which another rule already makes unreachable.
# EQUIV_NOTES maps a mutation label (exact) to the reason it is redundant.
import sys, re
ROOT=sys.argv[1]
_T=open(ROOT+'/firestore.rules').read()
EQUIV_NOTES={}
try:
    from b2_equiv import EQUIV_NOTES
except Exception: pass
def _depths(line):
    d=0; out=[]; q=None
    for i,c in enumerate(line):
        if q:
            if c==q: q=None
        elif c in "'\"": q=c
        elif c in '([': d+=1
        elif c in ')]': d-=1
        out.append(d)
    return out
def _segments(line):
    """[(start,end)] spans of removable && clauses on this line (paren/brace balanced); a mutation REPLACES the clause by `true`, so the rule text always stays valid"""
    dep=_depths(line); res=[]; qs=[]; q=None
    for i,c in enumerate(line):
        if q:
            if c==q: q=None
        elif c in "'\"": q=c
        if q is None and line.startswith(' && ',i): qs.append(i)
    for D in set(dep[a] for a in qs):
        i=0; n=len(line)
        while i<n:
            if dep[i]>=D:
                j=i
                while j<n and dep[j]>=D: j+=1
                seps=[a for a in qs if i<=a<j and dep[a]==D]
                if seps:
                    bounds=[i]+[x for s_ in seps for x in (s_,s_+4)]+[j]
                    for k in range(0,len(bounds),2):
                        s_,e_=bounds[k],bounds[k+1]; seg=line[s_:e_]
                        m=re.match(r'^(\s*)(return\s+|allow [a-z, ]+: if\s+|\|\|\s*|&&\s*)?',seg); s_+=m.end(); seg=line[s_:e_]
                        if seg.endswith(';'): e_-=1; seg=line[s_:e_]
                        if seg.strip() and seg.count('(')+seg.count('[')==seg.count(')')+seg.count(']') and seg.count('{')==seg.count('}') and seg.strip()!='true': res.append((s_,e_))
                i=j
            else: i+=1
    return res
def _uniq(lines,idx):
    """the text to replace: the line, plus the line before it when the line alone is not unique in the file"""
    ln=lines[idx]
    if _T.count(ln+'\n')==1: return ln+'\n',''
    if idx>0 and _T.count(lines[idx-1]+'\n'+ln+'\n')==1: return lines[idx-1]+'\n'+ln+'\n',lines[idx-1]+'\n'
    return None,None
def _block(start,end):
    a=_T.index(start); b=_T.index(end,a); return _T[:a].count('\n'),_T[:b].count('\n')
def build():
    lines=_T.split('\n'); out=[]; seen=set()
    spans=[_block('    // B2 (4.5.0): invoices, payments','    match /clients/{id}')]
    # the entry link / unlink branches and their audit lines
    s1=_T.index('          // B2: put on a new draft invoice'); e1=_T.index('        );',s1); spans.append((_T[:s1].count('\n'),_T[:e1].count('\n')))
    s2=_T.index("            || (request.resource.data.action == 'link'"); e2=_T.index('\n',_T.index("action == 'unlink'",s2)); spans.append((_T[:s2].count('\n'),_T[:e2].count('\n')+1))
    for (a,b) in spans:
        for idx in range(a,b):
            raw=lines[idx]; ln=raw.strip()
            if not ln or ln.startswith('//') or ln.startswith('function ') or ln.startswith('match ') : 
                if not ln.startswith('function '): continue
            body=raw
            text,keep=_uniq(lines,idx)
            if text is None: continue
            # the && clauses
            for (s,e) in _segments(body):
                seg=body[s:e].strip(' &')
                new=body[:s]+'true'+body[e:]
                lab=f'B2 clause removed: {re.sub(chr(32)+"+"," ",seg)[:110]}'
                key=(text,new)
                if key in seen: continue
                seen.add(key); out.append((lab if lab not in [o[0] for o in out] else lab+f' [{idx+1}]',text,keep+new+'\n'))
            # comparison flips
            for m in re.finditer(r" (>=|<=|>|<|==|!=) ",body):
                op=m.group(1); rep={'>=':'>','<=':'<','>':'>=','<':'<=','==':'!=','!=':'=='}[op]
                new=body[:m.start()]+' '+rep+' '+body[m.end():]
                ctx=body[max(0,m.start()-45):m.end()+25].strip()
                lab=f'B2 comparison flipped {op}->{rep}: {re.sub(chr(32)+"+"," ",ctx)}'
                key=(text,new)
                if key in seen: continue
                seen.add(key); out.append((lab if lab not in [o[0] for o in out] else lab+f' [{idx+1}]',text,keep+new+'\n'))
    return out
B2=[(('EQUIV '+n) if n in EQUIV_NOTES else n,a,b) for n,a,b in build()]
# access mutations (readable by everyone, delete/edit allowed)
for coll,hdr in (('invoices','match /invoices/{id} {\n      allow read: if isOwner();'),('invoiceAudit','match /invoiceAudit/{aid} {\n      allow read: if isOwner();'),('payments','match /payments/{pid} {\n      allow read: if isOwner();'),
                 ('paymentReversals','match /paymentReversals/{pid} {\n      allow read: if isOwner();'),('invoiceAdjustments','match /invoiceAdjustments/{aid} {\n      allow read: if isOwner();'),('invoiceDueDates','match /invoiceDueDates/{did} {\n      allow read: if isOwner();')):
    B2.append((f'B2 {coll} readable by everyone',hdr,hdr.replace('isOwner()','true')))
    B2.append((f'B2 {coll} may be deleted',hdr,hdr.replace('allow read','allow read, delete')))
    B2.append((f'B2 {coll} may be edited',hdr,hdr.replace('allow read','allow read, update')))
