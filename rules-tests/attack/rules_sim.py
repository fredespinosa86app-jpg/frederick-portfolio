"""Mini Firestore-rules interpreter (subset used by this project's firestore.rules files).
Evaluates the REAL rules text for a request: get/list/create/update/delete with an auth context, document data and
existing documents (for exists()/get()). Not Google's engine: only the constructs used here are implemented, and any
unknown construct raises SimUnsupported so a gap can never turn into a silent pass."""
import re, time
class SimUnsupported(Exception): pass
class EvalErr(Exception): pass
class TS:
    def __init__(s,ms): s.ms=ms
    def __eq__(s,o): return isinstance(o,TS) and o.ms==s.ms
    def __hash__(s): return hash(s.ms)
class Dur:
    def __init__(s,ms): s.ms=ms
class Path:
    def __init__(s,p): s.p=p
KW={'in','is','true','false','null','let','return','function','match','allow','if','service'}
TOK=re.compile(r"""\s*(?:(?P<str>'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")|(?P<num>\d+(?:\.\d+)?)|(?P<path>/[A-Za-z0-9_$()/{}=*\-]+)|(?P<id>[A-Za-z_][A-Za-z0-9_]*)|(?P<op>&&|\|\||==|!=|<=|>=|[<>+!()\[\],.;:={}\-*/%]))""")
def strip_comments(t):
    out=[];i=0;q=None
    while i<len(t):
        c=t[i]
        if q:
            out.append(c)
            if c=='\\': out.append(t[i+1]); i+=1
            elif c==q: q=None
        elif c in "'\"": q=c; out.append(c)
        elif t[i:i+2]=='//':
            while i<len(t) and t[i]!='\n': i+=1
            continue
        else: out.append(c)
        i+=1
    return ''.join(out)
def tokenize(t):
    t=strip_comments(t); pos=0; toks=[]
    while True:
        m=TOK.match(t,pos)
        if not m:
            if t[pos:].strip(): raise SimUnsupported('token at: '+t[pos:pos+30])
            break
        pos=m.end(); k=m.lastgroup; v=m.group(k)
        if k=='str': v=bytes(v[1:-1],'utf-8').decode('unicode_escape')
        toks.append((k,v))
    return toks
class P:
    def __init__(s,toks): s.t=toks; s.i=0
    def peek(s,o=0): return s.t[s.i+o] if s.i+o<len(s.t) else (None,None)
    def nxt(s): v=s.t[s.i]; s.i+=1; return v
    def eat(s,v):
        k,x=s.peek()
        if x!=v: raise SimUnsupported(f'expected {v!r} got {x!r} at {s.i}')
        s.i+=1
    def isop(s,v): return s.peek()[1]==v and s.peek()[0] in ('op','id')
    # grammar
    def expr(s): return s.or_()
    def or_(s):
        l=s.and_()
        while s.isop('||'): s.nxt(); l=('or',l,s.and_())
        return l
    def and_(s):
        l=s.cmp()
        while s.isop('&&'): s.nxt(); l=('and',l,s.cmp())
        return l
    def cmp(s):
        l=s.add()
        while True:
            k,x=s.peek()
            if x in ('==','!=','<','<=','>','>=') and k=='op': s.nxt(); l=('cmp',x,l,s.add())
            elif x=='in' and k=='id': s.nxt(); l=('in',l,s.add())
            elif x=='is' and k=='id': s.nxt(); l=('is',l,s.nxt()[1])
            else: return l
    def add(s):
        l=s.mul()
        while s.isop('+') or s.isop('-'): op=s.nxt()[1]; l=('arith',op,l,s.mul())
        return l
    def mul(s):
        l=s.unary()
        while s.isop('*'): s.nxt(); l=('arith','*',l,s.unary())
        return l
    def unary(s):
        if s.isop('!'): s.nxt(); return ('not',s.unary())
        if s.isop('-'): s.nxt(); return ('arith','-',('lit',0),s.unary())
        return s.post()
    def post(s):
        e=s.prim()
        while True:
            if s.isop('.'):
                s.nxt(); n=s.nxt()[1]
                if s.isop('('): s.nxt(); a=s.args(); e=('mcall',e,n,a)
                else: e=('attr',e,n)
            elif s.isop('['): s.nxt(); ix=s.expr(); s.eat(']'); e=('index',e,ix)
            else: return e
    def args(s):
        a=[]
        if s.isop(')'): s.nxt(); return a
        while True:
            a.append(s.expr())
            if s.isop(','): s.nxt(); continue
            s.eat(')'); return a
    def prim(s):
        k,x=s.nxt()
        if k=='str': return ('lit',x)
        if k=='num': return ('lit',float(x) if '.' in x else int(x))
        if k=='path': return ('path',x)
        if k=='op' and x=='(': e=s.expr(); s.eat(')'); return e
        if k=='op' and x=='[':
            a=[]
            if s.isop(']'): s.nxt(); return ('list',a)
            while True:
                a.append(s.expr())
                if s.isop(','): s.nxt(); continue
                s.eat(']'); return ('list',a)
        if k=='id':
            if x=='true': return ('lit',True)
            if x=='false': return ('lit',False)
            if x=='null': return ('lit',None)
            if s.isop('('): s.nxt(); return ('call',x,s.args())
            return ('var',x)
        raise SimUnsupported(f'primary {x!r}')
def parse_file(text):
    p=P(tokenize(text)); funcs={}; root=[]
    def block(end_ok=True):
        items=[]
        while not p.isop('}') and p.peek()[0] is not None:
            k,x=p.peek()
            if x=='function':
                p.nxt(); name=p.nxt()[1]; p.eat('('); prm=[]
                while not p.isop(')'):
                    prm.append(p.nxt()[1])
                    if p.isop(','): p.nxt()
                p.eat(')'); p.eat('{'); lets=[]; ret=None
                while not p.isop('}'):
                    if p.peek()[1]=='let': p.nxt(); n=p.nxt()[1]; p.eat('='); lets.append((n,p.expr())); p.eat(';')
                    elif p.peek()[1]=='return': p.nxt(); ret=p.expr(); p.eat(';')
                    else: raise SimUnsupported('fn body '+str(p.peek()))
                p.eat('}'); funcs[name]=(prm,lets,ret)
            elif x=='match':
                p.nxt(); path=p.nxt()[1]; p.eat('{'); sub=block(); p.eat('}'); items.append(('match',path,sub))
            elif x=='allow':
                p.nxt(); ops=[p.nxt()[1]]
                while p.isop(','): p.nxt(); ops.append(p.nxt()[1])
                cond=('lit',True)
                if p.isop(':'): p.nxt(); p.eat('if'); cond=p.expr()
                p.eat(';'); items.append(('allow',ops,cond))
            elif x in ('rules_version','service'):
                while not (p.isop('{') or p.isop(';')): p.nxt()
                if p.isop(';'): p.nxt()
                else: p.nxt(); items.extend(block()); p.eat('}')
            else: raise SimUnsupported('top '+str(p.peek()))
        return items
    return block(), funcs
class Sim:
    def __init__(s,text): s.tree,s.funcs=parse_file(text)
    # -------- evaluation
    def ev(s,n,env):
        t=n[0]
        if t=='lit': return n[1]
        if t=='list': return [s.ev(x,env) for x in n[1]]
        if t=='var':
            if n[1] in env: return env[n[1]]
            raise EvalErr('var '+n[1])
        if t=='path':
            raw=re.sub(r'^/databases/\$\(database\)/documents/','',n[1])
            def _sub(m):
                if m.group(1) not in env: raise EvalErr('path var '+m.group(1))
                v=env[m.group(1)]
                if not isinstance(v,str): raise EvalErr('path var type')
                return v
            return Path(re.sub(r'\$\((\w+)\)',_sub,raw))
        if t=='not':
            v=s.ev(n[1],env)
            if not isinstance(v,bool): raise EvalErr('not')
            return not v
        if t in ('and','or'):
            def sub(x):
                try:
                    v=s.ev(x,env)
                    if not isinstance(v,bool): raise EvalErr('bool')
                    return v
                except EvalErr: return 'ERR'
            a=sub(n[1])
            if t=='and' and a is False: return False
            if t=='or' and a is True: return True
            b=sub(n[2])
            if t=='and' and b is False: return False
            if t=='or' and b is True: return True
            if a=='ERR' or b=='ERR': raise EvalErr('err')
            return a and b if t=='and' else a or b
        if t=='cmp':
            op=n[1]; a=s.ev(n[2],env); b=s.ev(n[3],env)
            if op=='==': return s.eq(a,b)
            if op=='!=': return not s.eq(a,b)
            if isinstance(a,TS) and isinstance(b,TS): return {'<':a.ms<b.ms,'<=':a.ms<=b.ms,'>':a.ms>b.ms,'>=':a.ms>=b.ms}[op]
            if type(a) is bool or type(b) is bool or not ((isinstance(a,(int,float)) and isinstance(b,(int,float))) or (isinstance(a,str) and isinstance(b,str))): raise EvalErr('cmp types')
            return {'<':a<b,'<=':a<=b,'>':a>b,'>=':a>=b}[op]
        if t=='arith':
            a=s.ev(n[2],env); b=s.ev(n[3],env)
            if n[1]=='+' and isinstance(a,str) and isinstance(b,str): return a+b
            if isinstance(a,TS) and isinstance(b,Dur): return TS(a.ms+b.ms if n[1]=='+' else a.ms-b.ms)
            if isinstance(a,(int,float)) and isinstance(b,(int,float)) and type(a) is not bool and type(b) is not bool: return a*b if n[1]=='*' else (a+b if n[1]=='+' else a-b)
            raise EvalErr('arith')
        if t=='in':
            a=s.ev(n[1],env); b=s.ev(n[2],env)
            if isinstance(b,list): return any(s.eq(a,x) for x in b)
            if isinstance(b,dict): return isinstance(a,str) and a in b
            raise EvalErr('in')
        if t=='is':
            v=s.ev(n[1],env); k=n[2]
            return {'string':isinstance(v,str),'number':isinstance(v,(int,float)) and not isinstance(v,bool),'int':isinstance(v,int) and not isinstance(v,bool),'float':isinstance(v,float),'bool':isinstance(v,bool),'list':isinstance(v,list),'map':isinstance(v,dict),'timestamp':isinstance(v,TS),'null':v is None}[k]
        if t=='attr':
            o=s.ev(n[1],env)
            if isinstance(o,dict):
                if n[2] in o: return o[n[2]]
                raise EvalErr('missing '+n[2])
            if isinstance(o,Doc) and n[2]=='data': return o.data
            raise EvalErr('attr '+n[2])
        if t=='index':
            o=s.ev(n[1],env); k=s.ev(n[2],env)
            if isinstance(o,dict) and k in o: return o[k]
            if isinstance(o,list) and isinstance(k,int) and not isinstance(k,bool) and 0<=k<len(o): return o[k]
            raise EvalErr('index')
        if t=='mcall': return s.method(s.ev(n[1],env),n[2],[s.ev(a,env) for a in n[3]])
        if t=='call':
            name=n[1]
            if name=='exists': return s.docs.get(s.ev(n[2][0],env).p) is not None
            if name=='existsAfter': return s.post.get(s.ev(n[2][0],env).p) is not None
            if name=='getAfter':
                p=s.ev(n[2][0],env).p
                if s.post.get(p) is None: raise EvalErr('getAfter missing')
                return Doc(s.post[p])
            if name=='get':
                p=s.ev(n[2][0],env).p
                if p not in s.docs: raise EvalErr('get missing')
                return Doc(s.docs[p])
            if name in s.funcs:
                prm,lets,ret=s.funcs[name]; e2=dict(env)
                for pn,a in zip(prm,n[2]): e2[pn]=s.ev(a,env)
                for ln,le in lets: e2[ln]=s.ev(le,e2)
                return s.ev(ret,e2)
            raise SimUnsupported('call '+name)
        raise SimUnsupported('node '+t)
    def eq(s,a,b):
        if isinstance(a,bool)!=isinstance(b,bool): return False
        if isinstance(a,(int,float)) and isinstance(b,(int,float)): return a==b
        return a==b if type(a)==type(b) else False
    def method(s,o,name,a):
        if isinstance(o,str) and o=='<duration>' and name=='value':
            unit={'h':3600000,'m':60000,'s':1000,'ms':1,'d':86400000,'w':604800000}
            if a[1] not in unit: raise EvalErr('unit')
            return Dur(a[0]*unit[a[1]])
        if name=='size':
            if isinstance(o,(str,list,dict)): return len(o)
            raise EvalErr('size')
        if name=='matches':
            if not isinstance(o,str): raise EvalErr('matches')
            return re.fullmatch(a[0],o,re.S) is not None
        if name=='keys':
            if isinstance(o,dict): return KeySet(list(o.keys()))
            raise EvalErr('keys')
        if name=='hasOnly':
            if isinstance(o,KeySet): return all(k in a[0] for k in o.k)
            if isinstance(o,list): return all(k in a[0] for k in o)
            raise EvalErr('hasOnly')
        if name=='hasAll':
            if isinstance(o,KeySet): return all(k in o.k for k in a[0])
            if isinstance(o,list): return all(k in o for k in a[0])
            raise EvalErr('hasAll')
        if name=='get':
            if isinstance(o,dict): return o.get(a[0],a[1])
            raise EvalErr('get')
        raise SimUnsupported('method '+name)
    # -------- request
    def allowed(s,op,path,auth=None,new=None,old=None,docs=None,now=1_800_000_000_000,after=None):
        """op: get|list|create|update|delete ; path 'coll/id' ; auth None or {'uid','email','verified','provider'}; new/old: dict data"""
        s.docs=docs or {}
        s.post=dict(s.docs); s.post.update(after or {})   # state after the whole batch (existsAfter/getAfter); None = deleted
        a=None
        if auth: a={'uid':auth['uid'],'token':{'email':auth.get('email',''),'email_verified':auth.get('verified',True),'firebase':{'sign_in_provider':auth.get('provider','google.com')}}}
        req={'auth':a,'time':TS(now),'method':op,'resource':{'data':new} if new is not None else None}
        env={'request':req,'resource':{'data':old} if old is not None else None,'database':'(default)','duration':'<duration>'}
        parts=path.split('/')
        if op=='list': parts=parts+['__any__']   # a list query is judged against the collection's wildcard document
        def walk(items,rest,env):
            for it in items:
                if it[0]=='match':
                    segs=[x for x in it[1].strip('/').split('/') if x]
                    if len(segs)>len(rest): continue
                    e2=dict(env); ok=True
                    for sg,pv in zip(segs,rest):
                        if sg.startswith('{'):
                            nm=sg[1:-1]
                            if nm.endswith('=**'): e2[nm[:-3]]=pv
                            else: e2[nm]=pv
                        elif sg!=pv: ok=False;break
                    if not ok: continue
                    if it[1].strip('/').startswith('databases'):
                        if walk(it[2],rest,e2): return True
                        continue
                    if len(segs)==len(rest) or any(x.endswith('=**}') for x in segs):
                        if walk(it[2],[],e2): return True
                    else:
                        if walk(it[2],rest[len(segs):],e2): return True
                elif it[0]=='allow' and not rest:
                    ops=it[1]; m={'get':('read','get'),'list':('read','list'),'create':('write','create'),'update':('write','update'),'delete':('write','delete')}[op]
                    if any(o in m for o in ops):
                        try:
                            if s.ev(it[2],env) is True: return True
                        except EvalErr: pass
            return False
        # database prefix: rules wrap everything in match /databases/{database}/documents
        def top(items):
            for it in items:
                if it[0]=='match' and it[1].startswith('/databases'):
                    return walk(it[2],parts,env)
            return False
        return top(s.tree)
class Doc:
    def __init__(s,d): s.data=d
class KeySet:
    def __init__(s,k): s.k=k
