"""SV2b: replay the three writes that the REAL survey page made for a CUSTOM survey (recorded by rules-tests/browser/sv1-1-survey.mjs, section G)
against the real rules text. Usage: python3 rules-tests/attack/sv2b_replay.py .
Proves the page and the rules agree on custom surveys: what the page sends is accepted, small tampering with the same writes is refused."""
import sys, json, os, copy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rules_sim import Sim, TS
ROOT = sys.argv[1]; CAP = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sv2b_captured.json')
NOW = 1_800_000_000_000; DAY = 86400000
cap = json.load(open(CAP)); K = cap['key']; ops = cap['ops']; inv = cap['invite']; form = dict(cap['form'], createdAt=TS(NOW - DAY))
res = []
def chk(n, ok): res.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n)
conv = lambda d: {k: (TS(NOW) if isinstance(v, dict) and v.get('__sv') else v) for k, v in d.items()}
old_inv = {'surveyVersion': 'default-1', 'employerName': inv['employerName'], 'company': inv['company'], 'ownerName': inv['ownerName'], 'status': 'sent', 'createdAt': TS(NOW - DAY), 'expiresAt': TS(NOW + 30 * DAY)}
def run(sim, resp, ans, flip, docs=None, oldinv=None, f=None, drop_ans=False):
    oi = oldinv or old_inv; new_inv = dict(oi); new_inv.update(flip)
    d = {'surveyInvites/' + K: oi, 'surveyForms/' + K: f or form}; d.update(docs or {}); after = {'surveyInvites/' + K: new_inv, 'surveyResponses/' + K: resp}
    if not drop_ans: after['surveyAnswers/' + K] = ans
    u = sim.allowed('update', 'surveyInvites/' + K, None, new_inv, oi, d, NOW, after)
    c = sim.allowed('create', 'surveyResponses/' + K, None, resp, None, d, NOW, after)
    a = sim.allowed('create', 'surveyAnswers/' + K, None, ans, None, d, NOW, after)
    return u and c and a
assert [o['path'].split('/')[0] for o in ops] == ['surveyResponses', 'surveyAnswers', 'surveyInvites']
resp = conv(ops[0]['data']); ans = conv(ops[1]['data']); flip = conv(ops[2]['data'])
for nm, fn in (('transition', 'firestore.rules'), ('strict', 'firestore.rules.strict')):
    sim = Sim(open(os.path.join(ROOT, fn)).read())
    chk(f'replay [{nm}] the exact three writes the survey page made for a custom survey are accepted', run(sim, resp, ans, flip))
    for what, mut in (('stars 6', lambda a: dict(a, q1=6)), ('stars as text', lambda a: dict(a, q1='4')), ('choice not in the list', lambda a: dict(a, q3='Other')), ('yes/no maybe', lambda a: dict(a, q4='maybe')),
                      ('long text 701', lambda a: dict(a, q2='x' * 701)), ('short text 201', lambda a: dict(a, q5='x' * 201)), ('extra slot q6', lambda a: dict(a, q6='x')), ('extra field', lambda a: dict(a, email='a@b.co')),
                      ('required q3 removed', lambda a: {k: v for k, v in a.items() if k != 'q3'}), ('required q1 removed', lambda a: {k: v for k, v in a.items() if k != 'q1'})):
        chk(f'replay [{nm}] tampered extra answers ({what}) are refused', not run(sim, resp, mut(copy.deepcopy(ans)), flip))
    chk(f'replay [{nm}] the response alone (extra answers left out) is refused for a custom survey', not run(sim, resp, ans, flip, drop_ans=True))
    chk(f'replay [{nm}] the same writes are refused after the invite expired, was revoked or was already used', not run(sim, resp, ans, flip, oldinv=dict(old_inv, expiresAt=TS(NOW - 1))) and not run(sim, resp, ans, flip, oldinv=dict(old_inv, status='revoked')) and not run(sim, resp, ans, flip, oldinv=dict(old_inv, status='submitted')))
    chk(f'replay [{nm}] the same writes are refused while the emergency pause is on', not run(sim, resp, ans, flip, docs={'content/guard': {'pause': True}}))
    chk(f'replay [{nm}] answers that fit a DIFFERENT form (other question types) are refused', not run(sim, resp, ans, flip, f=dict(form, questions=[dict(q, type='short') if q['id'] == 'q1' else q for q in form['questions']])))
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
