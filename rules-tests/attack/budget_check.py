# Counts the steps the rules take for each allowed write in the attack suite (a rough stand-in for Firestore's limit of 1000 expressions per write).
# The real engine counts about 1.2 to 1.3 times as many steps as this count, so the cap below keeps a margin. Run: python3 rules-tests/attack/budget_check.py .
import sys,os,runpy,collections
here=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,here)
import rules_sim
S=rules_sim.Sim; cnt=[0]; res=collections.defaultdict(int)
oe=S.ev
def ev(s,n,env): cnt[0]+=1; return oe(s,n,env)
S.ev=ev
oa=S.allowed
def al(s,op,path,*a,**k):
    cnt[0]=0; r=oa(s,op,path,*a,**k)
    if r: res[(op,str(path).split('/')[0])]=max(res[(op,str(path).split('/')[0])],cnt[0])
    return r
S.allowed=al
root=sys.argv[1] if len(sys.argv)>1 else '.'
sys.argv=['attack_cases.py',root]
import io,contextlib
buf=io.StringIO()
try:
    with contextlib.redirect_stdout(buf): runpy.run_path(os.path.join(here,'attack_cases.py'),run_name='__main__')
except SystemExit: pass
CAP=760
top=sorted(res.items(),key=lambda x:-x[1])[:6]
for k,v in top: print(k,v)
bad=[(k,v) for k,v in res.items() if v>CAP]
print('BUDGET OK (cap %d)'%CAP if not bad else 'BUDGET EXCEEDED: %s'%bad); sys.exit(1 if bad else 0)
