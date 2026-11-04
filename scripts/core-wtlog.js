/* ==========================================================================
   core-wtlog.js - WorkTrack corrections and the tamper-evident log for CodeFlow 4.5.0 (phase W3).
   Runs in the browser (window.coreWtLog) and in Node (module.exports). No network, no database.

   1. THE SEALED LOG ("chain").  Every record that matters (a punch, a session, a client change, a correction) is covered by a SEAL.
      A seal stores the SHA-256 fingerprint of: its own number, the previous seal's fingerprint, and the full content of the records it covers
      (including their server times). Changing or removing any covered record, or any seal, breaks the chain from that point on.
      The database rules can only check order and numbering (rules cannot compute SHA-256); this file and the Verify button do the maths.
      Honest limit: this DETECTS tampering, it does not prevent it, and the newest seal is only as safe as the witness copy you keep outside the database.
   2. CORRECTIONS.  A closed session is never edited. A correction is a new record with a reason; the session is shown as "original + corrections".
   ========================================================================== */
(function (root) {
  'use strict';
  const W = (typeof require === 'function' && typeof module !== 'undefined') ? require('./core-worktrack.js') : root.coreWork;
  const ZERO = '0'.repeat(64), HEX_RE = /^[0-9a-f]{64}$/;
  const CORR_HOURS = 24, MAX_CORRECTIONS = 20, MAX_SEAL_IDS = 30, WITNESS_HEAD = 'CODEFLOW-WORKTRACK-WITNESS 1';
  const CORR_KINDS = ['TIME', 'ADD', 'CLIENT_ADD', 'CLIENT_REMOVE'];
  const ADD_TYPES = ['FIRST_BREAK', 'LUNCH', 'LAST_BREAK'];          // a missed break is added as a pair: out and in
  const ADD_NAME = { FIRST_BREAK: 'First break', LUNCH: 'Lunch', LAST_BREAK: 'Last break' };
  const KIND_LABEL = { TIME: 'Changed the time of a punch', ADD: 'Added a missed punch', CLIENT_ADD: 'Added a client', CLIENT_REMOVE: 'Removed a client' };
  /* the record collections the log covers, and the field that holds each one's server time */
  const COLLECTIONS = { workEvents: 'at', workSessions: 'startedAt', workAssignAudit: 'createdAt', workCorrections: 'createdAt', billingProfileAudit: 'createdAt', billableEntryAudit: 'createdAt', billingMigration: 'createdAt' };

  /* ---------------- canonical text (identical on every device) ---------------- */
  function plain(v) {                                          // Timestamp / Date -> milliseconds; everything else unchanged
    if (v == null) return null;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (v instanceof Date) return v.getTime();
    if (Array.isArray(v)) return v.map(plain);
    if (typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { o[k] = plain(v[k]); }); return o; }
    return v;
  }
  function stable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  const canonRecord = (path, data) => path + '=' + stable(plain(data));
  const canonSeal = (n, prev, kind, recs) => 'CFW3|' + n + '|' + prev + '|' + kind + '|' + recs.map(r => canonRecord(r.path, r.data)).join(';');
  async function sealHash(sha, n, prev, kind, recs) { return sha(canonSeal(n, prev, kind, recs)); }
  const timeOf = (path, data) => { const f = COLLECTIONS[String(path).split('/')[0]]; return f && data ? Number(plain(data[f])) || 0 : 0; };

  /* ---------------- verify the whole chain ----------------
     input: { chain: {cn, head} | null, seals: [{ n, prev, hash, kind, ids, upto, legacyN, atMs, id }], records: { 'workEvents/x': data, ... } (any time format), nowMs }
     The first problem found is first in the list. */
  async function verify(inp, sha) {
    const chain = inp.chain || null, seals = (inp.seals || []).slice().sort((a, b) => a.n - b.n), recs = inp.records || {}, nowMs = inp.nowMs || Date.now();
    const out = { status: 'ok', problems: [], notes: [], sealsChecked: 0, recordsCovered: 0, unsealed: [], cn: chain ? chain.cn : 0, head: chain ? chain.head : '' };
    const bad = m => { out.problems.push(m); out.status = 'broken'; };
    if (!chain && !seals.length) { out.status = 'none'; return out; }
    if (!chain) bad('The chain head record is missing although seals exist.');
    let prev = ZERO, upto = 0; const covered = new Map();
    for (let i = 0; i < seals.length; i++) {
      const s = seals[i], label = 'Seal ' + s.n;
      if (s.n !== i + 1) { bad(label + ' is out of sequence (expected number ' + (i + 1) + '). A seal may have been removed.'); break; }
      if (!HEX_RE.test(s.hash || '') || (s.id && s.id !== s.hash)) { bad(label + ' has a malformed fingerprint.'); break; }
      if (s.prev !== prev) { bad(label + ' does not follow the seal before it.'); break; }
      let list;
      if (s.kind === 'genesis') {
        list = Object.keys(recs).filter(p => COLLECTIONS[p.split('/')[0]] && timeOf(p, recs[p]) <= s.upto).sort().map(p => ({ path: p, data: recs[p] }));
        if (list.length !== s.legacyN) { bad(label + ' (the starting point) covered ' + s.legacyN + ' earlier records but ' + list.length + ' exist now. Something was removed or added back-dated.'); break; }
        upto = s.upto;
      } else {
        list = [];
        for (const id of (s.ids || [])) {
          if (!(id in recs)) { bad(label + ' covers a record that no longer exists (' + id + ').'); break; }
          list.push({ path: id, data: recs[id] });
          covered.set(id, (covered.get(id) || 0) + 1);
        }
        if (out.status === 'broken') break;
      }
      const h = await sealHash(sha, s.n, s.prev, s.kind, list);
      if (h !== s.hash) { bad(label + ' does not match its records: ' + (list.length ? 'one of the ' + list.length + ' records it covers was changed.' : 'its content was changed.')); break; }
      out.sealsChecked++; out.recordsCovered += list.length; prev = s.hash;
    }
    if (out.status !== 'broken' && chain) {
      const last = seals[seals.length - 1];
      if (!last) bad('The chain head says ' + chain.cn + ' seals but none exist.');
      else if (chain.head !== last.hash || chain.cn !== last.n) bad('The chain head does not match the newest seal (the newest seal may have been removed).');
    }
    covered.forEach((c, id) => { if (c > 1) out.notes.push(id + ' is covered by more than one seal (harmless: two tabs sealed the same record).'); });
    Object.keys(recs).forEach(p => {
      if (!COLLECTIONS[p.split('/')[0]]) return;
      const t = timeOf(p, recs[p]);
      if (seals.length && t > upto && !covered.has(p)) out.unsealed.push(p);
    });
    const old = out.unsealed.filter(p => nowMs - timeOf(p, recs[p]) > 10 * 60000);
    if (old.length && out.status !== 'broken') bad(old.length + ' record(s) are not covered by any seal (written without sealing): ' + old.slice(0, 3).join(', ') + (old.length > 3 ? '…' : ''));
    else if (out.unsealed.length) out.notes.push(out.unsealed.length + ' very recent record(s) are waiting to be sealed.');
    return out;
  }

  /* what a seal for the given records would be (the page calls this after the records were written and read back) */
  async function makeSeal(sha, o) {              // o: { n, prev, kind, recs:[{path,data}], upto, legacyN }
    const recs = (o.recs || []).slice();
    if (o.kind === 'genesis') recs.sort((a, b) => a.path < b.path ? -1 : 1);
    const hash = await sealHash(sha, o.n, o.prev, o.kind, recs);
    return { n: o.n, prev: o.prev, hash, kind: o.kind, ids: o.kind === 'genesis' ? [] : recs.map(r => r.path), upto: o.kind === 'genesis' ? (o.upto || 0) : 0, legacyN: o.kind === 'genesis' ? recs.length : 0 };
  }

  /* ---------------- witness copy ---------------- */
  function witnessText(seals, cnLabel) {
    const l = (seals || []).slice().sort((a, b) => a.n - b.n);
    return [WITNESS_HEAD, 'Keep this file somewhere outside Firebase. Each line: seal number, fingerprint, time (UTC).'].concat(l.map(s => s.n + ' ' + s.hash + ' ' + new Date(s.atMs).toISOString())).join('\n') + '\n';
  }
  const witnessLine = s => s ? 'Seal ' + s.n + ' ' + s.hash : '';
  function parseWitness(text) {
    const out = []; String(text || '').split(/\r?\n/).forEach(l => { const m = /^\s*(?:Seal\s+)?(\d{1,7})\s+([0-9a-f]{64})/i.exec(l); if (m) out.push({ n: Number(m[1]), hash: m[2].toLowerCase() }); });
    return out;
  }
  /* compare a saved witness with the database's seals: every saved line must still be there and identical */
  function compareWitness(saved, seals) {
    const by = new Map((seals || []).map(s => [s.n, s.hash])), res = { ok: true, checked: saved.length, problems: [], newer: 0 };
    saved.forEach(w => { if (!by.has(w.n)) { res.ok = false; res.problems.push('Seal ' + w.n + ' is in your saved copy but is missing from the database.'); } else if (by.get(w.n) !== w.hash) { res.ok = false; res.problems.push('Seal ' + w.n + ' differs from your saved copy.'); } });
    const max = saved.reduce((a, w) => Math.max(a, w.n), 0); res.newer = (seals || []).filter(s => s.n > max).length;
    if (!saved.length) { res.ok = false; res.problems.push('No seal lines were found in that file.'); }
    return res;
  }

  /* ---------------- corrections ---------------- */
  const windowEndMs = closeAtMs => closeAtMs + CORR_HOURS * 3600000;
  const windowOpen = (closeAtMs, nowMs) => closeAtMs > 0 && nowMs < windowEndMs(closeAtMs);
  const byTime = (a, b) => (a.createdMs - b.createdMs) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  /* the punches of a session as they stand after its corrections. events: [{n,type,atMs,reason}], corrections: [{id,kind,n,type,atMs,createdMs}] */
  function effective(events, corrections) {
    const items = (events || []).map(e => ({ o: e.n, type: e.type, atMs: e.atMs, reason: e.reason || '', corrected: false, added: false }));
    let k = 0;
    (corrections || []).slice().sort(byTime).forEach(c => {
      if (c.kind === 'TIME') { const it = items.find(x => x.o === c.n && !x.added); if (it) { it.atMs = c.atMs; it.corrected = true; } }
      else if (c.kind === 'ADD') { items.push({ o: 1000 + (k++), type: c.type + '_OUT', atMs: c.atMs, reason: '', corrected: true, added: true }); items.push({ o: 1000 + (k++), type: c.type + '_IN', atMs: c.at2Ms, reason: '', corrected: true, added: true }); }
    });
    items.sort((a, b) => (a.atMs - b.atMs) || (a.o - b.o));
    const ev = items.map((x, i) => Object.assign({}, x, { n: i + 1 }));
    return { events: ev, derived: W.derive(ev.map(e => ({ n: e.n, type: e.type, atMs: e.atMs, reason: e.reason })), null) };
  }
  /* client list after corrections. assign: [{clientId,status}] (the list when the session closed) */
  function effectiveClients(assign, corrections) {
    const set = new Set((assign || []).filter(a => a.status === 'active').map(a => a.clientId));
    (corrections || []).slice().sort(byTime).forEach(c => { if (c.kind === 'CLIENT_ADD') set.add(c.clientId); else if (c.kind === 'CLIENT_REMOVE') set.delete(c.clientId); });
    return Array.from(set).sort();
  }
  /* decide a correction.  s: { sid, events, corrections, assign, closeAtMs, closeN, closeEid, closed }, c: { kind, n, type, atMs, clientId, reason }, o: { nowMs, registryStatus } */
  function correctionPlan(s, c, o) {
    o = o || {}; const nowMs = o.nowMs || Date.now(), reason = String(c.reason || '').trim();
    const no = r => ({ ok: false, reason: r });
    if (!s || !s.closed || !s.sid) return no('Only a closed session can be corrected.');
    if (!windowOpen(s.closeAtMs, nowMs)) return no('The ' + CORR_HOURS + '-hour correction window for this session has ended.');
    if (CORR_KINDS.indexOf(c.kind) < 0) return no('Unknown correction.');
    if (reason.length < W.REASON_MIN || reason.length > W.REASON_MAX) return no('Write a reason of ' + W.REASON_MIN + ' to ' + W.REASON_MAX + ' characters.');
    if ((s.corrections || []).length >= MAX_CORRECTIONS) return no('A session can have at most ' + MAX_CORRECTIONS + ' corrections.');
    const doc = { sid: s.sid, kind: c.kind, n: 0, type: '', clientId: '', reason, closeEid: s.closeEid, closeN: s.closeN, atMs: null, at2Ms: null };
    const cur = effective(s.events, s.corrections);
    if (c.kind === 'TIME' || c.kind === 'ADD') {
      if (!isFinite(c.atMs)) return no('Choose the corrected date and time.');
      if (c.atMs > nowMs) return no('A corrected time cannot be in the future.');
      if (c.atMs <= s.closeAtMs - 48 * 3600000) return no('That time is too far before the session ended.');
      doc.atMs = c.atMs;
      if (c.kind === 'ADD') {
        if (!isFinite(c.at2Ms) || c.at2Ms <= c.atMs) return no('The break must end after it starts.');
        if (c.at2Ms > nowMs) return no('A corrected time cannot be in the future.');
        doc.at2Ms = c.at2Ms;
      }
      if (c.kind === 'TIME') {
        const it = cur.events.find(x => x.o === c.n && !x.added); if (!it) return no('Choose which punch to change.');
        if (it.atMs === c.atMs) return no('That is already the time of this punch.');
        doc.n = c.n;
      } else {
        if (ADD_TYPES.indexOf(c.type) < 0) return no('Only a missed break or lunch can be added.');
        doc.type = c.type;
      }
      const trial = effective(s.events, (s.corrections || []).concat([Object.assign({ id: 'zzz-trial', createdMs: nowMs }, doc)]));
      if (!trial.derived.valid) return no('That would break the order of the day: ' + trial.derived.problem);
      if (!trial.derived.closed) return no('The session must still end with its closing punch.');
      return { ok: true, doc, kind: c.kind };
    }
    if (!W.validClient(c.clientId)) return no('That is not a valid Client ID.');
    const have = effectiveClients(s.assign, s.corrections);
    if (c.kind === 'CLIENT_ADD') {
      if (have.indexOf(c.clientId) >= 0) return no(c.clientId + ' is already on this session.');
      if (o.registryStatus !== 'active') return no(c.clientId + (o.registryStatus === 'archived' ? ' is archived and cannot be added.' : ' is not in the Client ID list.'));
      if (have.length >= W.MAX_CLIENTS) return no('A session can have at most ' + W.MAX_CLIENTS + ' clients.');
    } else if (have.indexOf(c.clientId) < 0) return no(c.clientId + ' is not on this session.');
    doc.clientId = c.clientId;
    return { ok: true, doc, kind: c.kind };
  }
  /* one line per correction for the history */
  function describe(c, fmtTime, label) {
    const t = x => fmtTime(x);
    if (c.kind === 'TIME') return 'Punch #' + c.n + ' (' + (label(c.origType) || '') + ') moved to ' + t(c.atMs);
    if (c.kind === 'ADD') return (ADD_NAME[c.type] || c.type) + ' added: ' + t(c.atMs) + ' to ' + t(c.at2Ms);
    return (c.kind === 'CLIENT_ADD' ? 'Added ' : 'Removed ') + c.clientId;
  }

  const api = { ZERO, HEX_RE, CORR_HOURS, MAX_CORRECTIONS, MAX_SEAL_IDS, CORR_KINDS, ADD_TYPES, ADD_NAME, KIND_LABEL, COLLECTIONS, plain, stable, canonRecord, canonSeal, sealHash, timeOf, verify, makeSeal, witnessText, witnessLine, parseWitness, compareWitness, windowEndMs, windowOpen, effective, effectiveClients, correctionPlan, describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreWtLog = api;
})(typeof window !== 'undefined' ? window : globalThis);
