# Rules attack tests (Security S6) - no Firebase emulator needed

The Firebase emulator could not be downloaded in the build environment, so these tests use a small interpreter
(`rules_sim.py`) that reads the REAL `firestore.rules` text and answers "would this request be allowed?".
It implements only the constructs this project's rules use; anything else raises an error instead of passing silently.
It is not Google's engine. For a second opinion, run `rules-tests/owner.test.mjs` with the official emulator (needs Java and a download).

    python3 rules-tests/attack/attack_cases.py .      # now 1349 checks (B1 added section 8i); originally 223 cases: reads, extra fields, oversized/script payloads, forged timestamps, replays, wrong accounts, pause/capacity/busy state
    python3 rules-tests/attack/mutation_check.py .    # weakens the rules in hundreds of ways (F5 added 40 for the visitor token, daily counter and switch); every weakening must be caught

Run them from the project folder after any change to `firestore.rules`. They need only Python 3.
