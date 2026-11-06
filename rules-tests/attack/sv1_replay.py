"""SV1: replay the writes that the REAL survey page made (recorded by rules-tests/browser/sv1-1-survey.mjs) against the real rules text.
Usage: python3 rules-tests/attack/sv1_replay.py . [/tmp/sv/captured.json]
It proves the page and the rules agree: what the page sends is accepted, and small tampering with the same writes is refused."""
import sys, json, os, copy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rules_sim import Sim, TS
ROOT = sys.argv[1]; CAP = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sv1_captured.json')
NOW = 1_800_000_000_000; DAY = 86400000
cap = json.load(open(CAP)); K = cap['key']; ops = cap['ops']; inv = cap['invite']
res = []
def chk(n, ok): res.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n)
def conv(d):
    return {k: (TS(NOW) if isinstance(v, dict) and v.get('__sv') else v) for k, v in d.items()}
old_inv = {'surveyVersion': 'default-1', 'employerName': inv['employerName'], 'company': inv['company'], 'ownerName': inv['ownerName'], 'status': 'sent', 'createdAt': TS(NOW - DAY), 'expiresAt': TS(NOW + 30 * DAY)}
def run(sim, resp, flip, docs=None, oldinv=None):
    oi = oldinv or old_inv; new_inv = dict(oi); new_inv.update(flip)
    d = {'surveyInvites/' + K: oi}; d.update(docs or {}); after = {'surveyInvites/' + K: new_inv, 'surveyResponses/' + K: resp}
    u = sim.allowed('update', 'surveyInvites/' + K, None, new_inv, oi, d, NOW, after)
    c = sim.allowed('create', 'surveyResponses/' + K, None, resp, None, d, NOW, after)
    return u and c
assert ops[0]['op'] == 'set' and ops[1]['op'] == 'update'
resp = conv(ops[0]['data']); flip = conv(ops[1]['data'])
for nm, f in (('transition', 'firestore.rules'), ('strict', 'firestore.rules.strict')):
    sim = Sim(open(os.path.join(ROOT, f)).read())
    chk(f'replay [{nm}] the exact writes the survey page made are accepted by the rules', run(sim, resp, flip))
    for what, mut in (('rating 6', lambda r, fl: (dict(r, rating=6), fl)), ('rating 0', lambda r, fl: (dict(r, rating=0), fl)), ('consent false', lambda r, fl: (dict(r, consentPublish=False), fl)),
                      ('owner status approved', lambda r, fl: (dict(r, ownerStatus='approved'), fl)), ('extra field', lambda r, fl: (dict(r, isAdmin=True), fl)),
                      ('video on another host', lambda r, fl: (dict(r, videoUrl='https://evil.example/x'), fl)), ('comment 701 chars', lambda r, fl: (dict(r, comment='x' * 701), fl)),
                      ('invite flip also changes the company', lambda r, fl: (r, dict(fl, company='Hacked'))), ('invite flip to approved', lambda r, fl: (r, dict(fl, status='approved')))):
        r2, f2 = mut(copy.deepcopy(resp), copy.deepcopy(flip)); chk(f'replay [{nm}] tampered ({what}) is refused', not run(sim, r2, f2))
    chk(f'replay [{nm}] the same writes are refused after the invite expired, was revoked or was already used',
        not run(sim, resp, flip, oldinv=dict(old_inv, expiresAt=TS(NOW - 1))) and not run(sim, resp, flip, oldinv=dict(old_inv, status='revoked')) and not run(sim, resp, flip, oldinv=dict(old_inv, status='submitted')))
    chk(f'replay [{nm}] the same writes are refused while the emergency pause is on', not run(sim, resp, flip, docs={'content/guard': {'pause': True}}))
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
