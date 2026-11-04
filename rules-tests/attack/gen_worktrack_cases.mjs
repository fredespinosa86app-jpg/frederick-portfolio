// Prints, as JSON, every punch from every WorkTrack state (9 x 5 = 45, plus used-break variants) with what the page's own
// state machine (scripts/core-worktrack.js) says. attack_cases.py feeds each case to the real rules text and demands the same verdict.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const req = createRequire(import.meta.url);
const root = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const w = req(path.resolve(root, 'scripts/core-worktrack.js'));
const SID = 'sess0000000000000001', NEWSID = 'sess0000000000000002';
const TARGET = { CLOCK_IN: 'WORKING', FIRST_BREAK_OUT: 'FIRST_BREAK', FIRST_BREAK_IN: 'WORKING', LUNCH_OUT: 'LUNCH', LUNCH_IN: 'WORKING', LAST_BREAK_OUT: 'LAST_BREAK', LAST_BREAK_IN: 'WORKING', CLOCK_OUT: 'NOT_STARTED', CLOSE_INCOMPLETE: 'NOT_STARTED' };
const FLAG = { FIRST_BREAK_OUT: 'fb', LUNCH_OUT: 'lu', LAST_BREAK_OUT: 'lb' };
const mk = (state, o = {}) => Object.assign({ state, sid: SID, n: state === 'NOT_STARTED' ? 4 : 3, fb: false, lu: false, lb: false, lastEid: SID + '__' + (state === 'NOT_STARTED' ? 4 : 3), rev: 5 }, o);
const variants = [];
for (const s of w.STATES) variants.push(['', mk(s)]);
variants.push(['fb used', mk('WORKING', { fb: true })], ['lu used', mk('WORKING', { lu: true })], ['lb used', mk('WORKING', { lb: true })], ['all used', mk('WORKING', { fb: true, lu: true, lb: true })],
  ['fb used, on lunch', mk('LUNCH', { fb: true })], ['fb+lu used, on last break', mk('LAST_BREAK', { fb: true, lu: true })], ['old session finished (flags set)', mk('NOT_STARTED', { fb: true, lu: true, lb: true })]);
const out = [];
for (const [tag, before] of variants) for (const type of w.TYPES) {
  const js = w.next(before, type, NEWSID);
  /* the "attempt": what a client that ignores the rules would write for this punch */
  const sid = type === 'CLOCK_IN' ? NEWSID : before.sid, n = type === 'CLOCK_IN' ? 1 : before.n + 1;
  const after = { state: TARGET[type], sid, n, fb: type === 'CLOCK_IN' ? false : before.fb, lu: type === 'CLOCK_IN' ? false : before.lu, lb: type === 'CLOCK_IN' ? false : before.lb, lastEid: sid + '__' + n, rev: before.rev + 1 };
  if (FLAG[type]) after[FLAG[type]] = true;
  out.push({ name: before.state + (tag ? ' (' + tag + ')' : '') + ' + ' + type, js: js.ok, before, after, event: { sid, n, type, reason: type === 'CLOSE_INCOMPLETE' ? 'Forgot to clock out' : '' }, newSession: type === 'CLOCK_IN' });
}
/* and the plan() the page really writes must equal the accepted attempt */
let planMismatch = 0;
for (const c of out) if (c.js) { const p = w.plan(c.before, c.event.type, { sid: NEWSID, reason: c.event.reason }); if (!p.ok || JSON.stringify(p.state) !== JSON.stringify(c.after) || JSON.stringify(p.event) !== JSON.stringify(c.event)) planMismatch++; }
console.log(JSON.stringify({ cases: out, planMismatch }));
