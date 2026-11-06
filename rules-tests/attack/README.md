# Rules attack tests (Security S6) - no Firebase emulator needed

The Firebase emulator could not be downloaded in the build environment, so these tests use a small interpreter
(`rules_sim.py`) that reads the REAL `firestore.rules` text and answers "would this request be allowed?".
It implements only the constructs this project's rules use; anything else raises an error instead of passing silently.
It is not Google's engine. For a second opinion, run `rules-tests/owner.test.mjs` with the official emulator (needs Java and a download).

    python3 rules-tests/attack/attack_cases.py .      # now 1349 checks (B1 added section 8i); originally 223 cases: reads, extra fields, oversized/script payloads, forged timestamps, replays, wrong accounts, pause/capacity/busy state
    python3 rules-tests/attack/mutation_check.py .    # weakens the rules in hundreds of ways (F5 added 40 for the visitor token, daily counter and switch); every weakening must be caught

Run them from the project folder after any change to `firestore.rules`. They need only Python 3.

## SV1 (employer survey)
Section 8m of `attack_cases.py` (both rules files), `mutations_sv1.py` and `mutations_sv1_gen.py` + `sv1_equiv.py` (run with `ONLY=SV1 python3 mutation_check.py .`, or `ONLY=SV1G` for the generated set) and `sv1_replay.py` (replays the writes recorded from the real survey page, `sv1_captured.json`).
