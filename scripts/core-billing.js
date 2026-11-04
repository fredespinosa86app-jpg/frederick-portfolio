/* ==========================================================================
   core-billing.js - billing profiles, billable hours and the client migration for CodeFlow 4.5.0 (phase B1).
   Runs in the browser (window.coreBilling) and in Node (module.exports). No network, no database.
   The page and the tests use these functions, so the page cannot decide differently from the tested rules.
   Money is never a float: rates are integer minor units (core-money.js); minutes are integers.
   B1 stores settings and hours only. It creates no invoice and generates no period (schedules run in B3).

   Records (all owner only; see firestore.rules):
     billingProfiles/{CLIENTID}        one per Client ID. currency, exp, rateMinor, arrangement, schedule, due rule, rev
     billingProfileAudit/{aid}         create-only: every create / change, with a short summary and a reason
     billableEntries/{CLIENTID__YYYYMMDD__YYYYMMDD__NN}   hours you submit and approve for a period (NN = sequence)
     billableEntryAudit/{aid}          create-only: every step of an entry
     billingMigration/{legacyClientDocId}   create-only: which old client record became which Client ID
   Honest limits: the database rules cannot loop, so the order and range of custom anchor dates is checked here (and by the page), and an
   audit record's text summary is not compared with the record by the rules (the money fields are). The tamper-evident log (W3) covers the
   three create-only collections, so a changed audit shows up in "Verify the log".
   ========================================================================== */
(function (root) {
  'use strict';
  const req = n => (typeof require === 'function' && typeof module !== 'undefined') ? require(n) : null;
  const M = req('./core-money.js') || root.coreMoney, I = req('./core-ids.js') || root.coreIds, T = req('./core-time.js') || root.coreTime;
  const MAX_RATE_MINOR = 1000000000, MAX_MINUTES = 133920, MAX_PERIOD_DAYS = 93, MAX_NOTE = 200, REASON_MIN = 3, REASON_MAX = 200;
  const ARRANGEMENTS = ['hourly', 'monthly'], SCHEDULES = ['weekly', 'monthly', 'midmonth', 'custom'], WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const DUE_KINDS = ['fixed', 'afterSend', 'afterGeneration'], ENTRY_STATUS = ['DRAFT', 'SUBMITTED', 'APPROVED', 'SUPERSEDED'];
  const DAY_NAME = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  const SERVER_TIME = '@server-time', DEFAULT_DUE_DAYS = 14;
  const str = v => String(v == null ? '' : v).trim();
  const reasonOk = r => r.length >= REASON_MIN && r.length <= REASON_MAX;

  /* ---------------------------------------------------------------- billing profile */
  function defaults() { return { currency: 'USD', rate: '', arrangement: 'hourly', schedKind: 'monthly', weekStart: 'mon', anchors: '', genTime: '09:00', tz: 'Asia/Manila', dueKind: 'afterSend', dueDays: DEFAULT_DUE_DAYS, dueDate: '' }; }
  function parseAnchors(text) {
    const parts = (Array.isArray(text) ? text.map(String) : str(text).split(/[\s,;]+/)).filter(Boolean);
    if (parts.length < 1 || parts.length > 4) return { ok: false, error: 'Enter 1 to 4 days of the month, for example 10, 25.' };
    const n = parts.map(p => (/^[0-9]{1,2}$/.test(p) ? Number(p) : NaN));
    if (n.some(x => !(x >= 1 && x <= 31))) return { ok: false, error: 'Each anchor day must be a number from 1 to 31.' };
    for (let i = 1; i < n.length; i++) if (n[i] <= n[i - 1]) return { ok: false, error: 'List the days from smallest to largest, without repeats.' };
    return { ok: true, list: n, text: n.join(',') };
  }
  /* inp -> { ok, errors:{field:message}, doc } ; doc holds exactly the stored profile fields (without rev and times) */
  function profileDoc(inp) {
    const x = Object.assign(defaults(), inp || {}), err = {}, doc = {};
    doc.currency = str(x.currency); if (!M.isSupported(doc.currency)) err.currency = 'Choose one of the supported currencies.';
    doc.exp = M.isSupported(doc.currency) ? M.exponent(doc.currency) : 0;
    const rateText = str(x.rate); doc.rateMinor = 0;
    if (rateText !== '' && M.isSupported(doc.currency)) {
      try { doc.rateMinor = M.toMinor(rateText, doc.currency); if (doc.rateMinor > MAX_RATE_MINOR) err.rate = 'That rate is too large.'; } catch (e) { err.rate = e.message; }
    }
    doc.arrangement = str(x.arrangement); if (ARRANGEMENTS.indexOf(doc.arrangement) < 0) err.arrangement = 'Choose hourly or monthly.';
    doc.schedKind = str(x.schedKind); if (SCHEDULES.indexOf(doc.schedKind) < 0) err.schedKind = 'Choose a schedule.';
    doc.weekStart = str(x.weekStart) || 'mon'; if (WEEKDAYS.indexOf(doc.weekStart) < 0) err.weekStart = 'Choose a weekday.';
    doc.anchors = '';
    if (doc.schedKind === 'custom') { const a = parseAnchors(x.anchors); if (a.ok) doc.anchors = a.text; else err.anchors = a.error; }
    doc.genTime = str(x.genTime); if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(doc.genTime)) err.genTime = 'Use a time like 09:00.';
    doc.tz = str(x.tz); if (!T.isValidTimeZone(doc.tz)) err.tz = 'That is not a valid time zone name (for example Asia/Manila).';
    doc.dueKind = str(x.dueKind); if (DUE_KINDS.indexOf(doc.dueKind) < 0) err.dueKind = 'Choose how the due date is set.';
    doc.dueDays = 0; doc.dueDate = '';
    if (doc.dueKind === 'fixed') { doc.dueDate = str(x.dueDate); if (!I.validIsoDate(doc.dueDate)) err.dueDate = 'Choose a real date.'; }
    else if (DUE_KINDS.indexOf(doc.dueKind) >= 0) { const d = str(x.dueDays); if (!/^[0-9]{1,3}$/.test(d) || Number(d) > 365) err.dueDays = 'Use a whole number of days from 0 to 365.'; else doc.dueDays = Number(d); }
    return { ok: Object.keys(err).length === 0, errors: err, doc };
  }
  const FIELD_LABEL = { currency: 'currency', rateMinor: 'rate', arrangement: 'arrangement', schedKind: 'schedule', weekStart: 'week start', anchors: 'anchor days', genTime: 'generation time', tz: 'time zone', dueKind: 'due rule', dueDays: 'due days', dueDate: 'due date' };
  const KEY_FIELDS = ['currency', 'rateMinor', 'arrangement'];
  function changedFields(old, doc) { return Object.keys(FIELD_LABEL).filter(k => old[k] !== doc[k]); }
  const rateText = d => d.rateMinor ? M.format(d.rateMinor, d.currency) + (d.arrangement === 'monthly' ? ' per month' : ' per hour') : 'rate not set';
  function describeSchedule(d) {
    const k = d.schedKind, s = k === 'weekly' ? 'Weekly, weeks start on ' + DAY_NAME[d.weekStart] : k === 'monthly' ? 'Monthly (calendar month)' : k === 'midmonth' ? 'Twice a month (1st to 15th, 16th to month end)' : 'Custom days ' + d.anchors.split(',').join(', ');
    return s + ', generated at ' + d.genTime + ' (' + d.tz + ')';
  }
  const describeDue = d => d.dueKind === 'fixed' ? 'Due on ' + d.dueDate : 'Due ' + d.dueDays + ' day' + (d.dueDays === 1 ? '' : 's') + (d.dueKind === 'afterSend' ? ' after it is sent' : ' after it is generated');
  /* one create or change.  old: the saved profile or null.  o: { aid, reason, registryStatus ('active'|'archived'|'') } */
  function profilePlan(clientId, old, inp, o) {
    o = o || {}; const v = I.validateClientId(clientId); if (!v.ok) return { ok: false, reason: v.error };
    if (!o.aid) return { ok: false, reason: 'A change needs its own ID.' };
    if (!old && o.registryStatus !== 'active') return { ok: false, reason: v.id + (o.registryStatus === 'archived' ? ' is archived, so a new billing profile cannot be started.' : ' is not in the Client IDs list.') };
    if (old && !o.registryStatus) return { ok: false, reason: v.id + ' is not in the Client IDs list.' };
    const p = profileDoc(inp); if (!p.ok) return { ok: false, reason: 'Check the fields marked in red.', errors: p.errors };
    const reason = str(o.reason);
    if (!old) {
      const doc = Object.assign({}, p.doc, { rev: 1, lastAudit: o.aid });
      return { ok: true, id: v.id, kind: 'create', doc, audit: { clientId: v.id, action: 'create', rev: 1, currency: doc.currency, rateMinor: doc.rateMinor, arrangement: doc.arrangement, summary: ('Profile created: ' + rateText(doc) + '; ' + describeSchedule(doc)).slice(0, 300), reason: reason.slice(0, REASON_MAX) } };
    }
    const ch = changedFields(old, p.doc); if (!ch.length) return { ok: false, reason: 'No change to save.' };
    if (!reasonOk(reason)) return { ok: false, reason: 'Write a reason of ' + REASON_MIN + ' to ' + REASON_MAX + ' characters.' };
    const doc = Object.assign({}, p.doc, { rev: old.rev + 1, lastAudit: o.aid });
    const parts = ch.map(k => k === 'rateMinor' ? 'rate ' + (old.rateMinor ? M.format(old.rateMinor, old.currency) : 'not set') + ' to ' + (doc.rateMinor ? M.format(doc.rateMinor, doc.currency) : 'not set') : FIELD_LABEL[k] + ' ' + (old[k] === '' ? 'none' : old[k]) + ' to ' + (doc[k] === '' ? 'none' : doc[k]));
    return { ok: true, id: v.id, kind: 'update', changed: ch, keyChange: ch.some(k => KEY_FIELDS.indexOf(k) >= 0), doc, audit: { clientId: v.id, action: 'update', rev: doc.rev, currency: doc.currency, rateMinor: doc.rateMinor, arrangement: doc.arrangement, summary: ('Changed: ' + parts.join('; ')).slice(0, 300), reason } };
  }

  /* ---------------------------------------------------------------- billable hours */
  const digits = iso => iso.replace(/-/g, ''), isoOf = d => d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6);
  function validPeriod(start, end) {
    if (!I.validIsoDate(start) || !I.validIsoDate(end)) return { ok: false, reason: 'Choose real start and end dates.' };
    if (end < start) return { ok: false, reason: 'The period ends before it starts.' };
    const a = start.split('-').map(Number), b = end.split('-').map(Number), days = Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000) + 1;
    if (days > MAX_PERIOD_DAYS) return { ok: false, reason: 'A period can be at most ' + MAX_PERIOD_DAYS + ' days.' };
    return { ok: true, days };
  }
  function entryId(clientId, start, end, seq) {
    const v = I.validateClientId(clientId); if (!v.ok) throw new Error('Invalid Client ID: ' + v.error);
    const p = validPeriod(start, end); if (!p.ok) throw new Error(p.reason);
    if (!(Number.isInteger(seq) && seq >= 1 && seq <= 99)) throw new Error('Sequence number must be 1 to 99.');
    return v.id + '__' + digits(start) + '__' + digits(end) + '__' + String(seq).padStart(2, '0');
  }
  function parseEntryId(id) {
    const m = /^([A-Z][A-Z0-9-]{1,22}[A-Z0-9])__([0-9]{8})__([0-9]{8})__([0-9]{2})$/.exec(String(id)); if (!m || m[4] === '00') return null;
    const a = isoOf(m[2]), b = isoOf(m[3]); return validPeriod(a, b).ok ? { clientId: m[1], start: a, end: b, seq: Number(m[4]) } : null;
  }
  /* "7.5" (hours) or "7:30" -> whole minutes, 1 to the largest a period can hold */
  function minutesFromInput(text) {
    const s = str(text); let mins;
    try { mins = /^[0-9]{1,3}:[0-5][0-9]$/.test(s) ? Number(s.split(':')[0]) * 60 + Number(s.split(':')[1]) : M.hoursToMinutes(s); } catch (e) { return { ok: false, error: /whole number of minutes/.test(e.message) ? e.message : 'Enter hours such as 7.5, or hours and minutes such as 7:30.' }; }
    if (mins < 1) return { ok: false, error: 'Enter at least 1 minute.' };
    if (mins > MAX_MINUTES) return { ok: false, error: 'That is more time than a ' + MAX_PERIOD_DAYS + '-day period holds.' };
    return { ok: true, minutes: mins };
  }
  const sameKey = (e, c, s, f) => e.clientId === c && e.periodStart === digits(s) && e.periodEnd === digits(f);
  function nextSeq(entries, clientId, start, end) {
    const used = (entries || []).filter(e => sameKey(e, clientId, start, end)).map(e => Number(e.seq)); const n = used.length ? Math.max.apply(null, used) + 1 : 1;
    return n <= 99 ? n : null;
  }
  function entryDoc(clientId, start, end, seq, minutes, note, supersedes, aid) {
    return { clientId, periodStart: digits(start), periodEnd: digits(end), seq: String(seq).padStart(2, '0'), submittedMinutes: minutes, approvedMinutes: null, status: 'DRAFT', note, supersedes: supersedes || '', supersededBy: '', approvedAt: null, approverUid: '', relatedInvoiceId: '', rev: 1, lastAudit: aid };
  }
  const eAudit = (e, action, from, to, rev, reason) => ({ entryId: e.id, clientId: e.clientId, action, fromStatus: from, toStatus: to, rev, submittedMinutes: e.submittedMinutes, approvedMinutes: e.approvedMinutes == null ? null : e.approvedMinutes, reason: reason || '' });
  const no = r => ({ ok: false, reason: r });
  /* one step on the entries.  action: create | edit | submit | reopen | approve | supersede.  entries: the saved list ({id,...fields}).
     a: the inputs.  o: { aid, aid2, uid, registryStatus, profileExists }.
     Returns { ok, writes:[{ kind:'create'|'update', id, doc }], audits:[{ for:id, rec }] } (audit i is paired with write i).  The page adds the server times. */
  function entryPlan(entries, action, a, o) {
    a = a || {}; o = o || {}; const find = id => (entries || []).find(e => e.id === id);
    if (!o.aid) return no('A change needs its own ID.');
    if (action === 'create' || action === 'supersede') {
      let old = null, cid = a.clientId, start = a.periodStart, end = a.periodEnd;
      if (action === 'supersede') {
        old = find(a.id); if (!old) return no('That entry was not found.');
        if (old.status !== 'APPROVED') return no('Only an approved entry can be replaced.');
        if (old.relatedInvoiceId) return no('This entry is already on an invoice. It needs an invoice adjustment instead.');
        if (!o.aid2) return no('A change needs its own ID.');
        const r = str(a.reason); if (!reasonOk(r)) return no('Write a reason of ' + REASON_MIN + ' to ' + REASON_MAX + ' characters.');
        const pe = parseEntryId(old.id); cid = pe.clientId; start = pe.start; end = pe.end;
      } else {
        const v = I.validateClientId(cid); if (!v.ok) return no(v.error); cid = v.id;
        if (o.registryStatus !== 'active') return no(cid + (o.registryStatus === 'archived' ? ' is archived.' : ' is not in the Client IDs list.'));
        if (!o.profileExists) return no(cid + ' has no billing profile yet. Create the profile first.');
      }
      const p = validPeriod(start, end); if (!p.ok) return no(p.reason);
      const m = minutesFromInput(a.minutes); if (!m.ok) return no(m.error);
      const note = str(a.note); if (note.length > MAX_NOTE) return no('The note is too long (' + MAX_NOTE + ' characters at most).');
      const seq = nextSeq(entries, cid, start, end); if (!seq) return no('This period already has 99 entries.');
      const id = entryId(cid, start, end, seq), doc = entryDoc(cid, start, end, seq, m.minutes, note, old ? old.id : '', o.aid), ne = Object.assign({ id }, doc);
      const writes = [{ kind: 'create', id, doc }], audits = [{ for: id, rec: eAudit(ne, 'create', '', 'DRAFT', 1, old ? str(a.reason) : '') }];
      if (old) {
        const od = Object.assign({}, old); delete od.id; od.status = 'SUPERSEDED'; od.supersededBy = id; od.rev = old.rev + 1; od.lastAudit = o.aid2;
        writes.push({ kind: 'update', id: old.id, doc: od }); audits.push({ for: old.id, rec: eAudit(Object.assign({ id: old.id }, od), 'supersede', 'APPROVED', 'SUPERSEDED', od.rev, str(a.reason)) });
      }
      return { ok: true, writes, audits, newId: id };
    }
    const e = find(a.id); if (!e) return no('That entry was not found.');
    const doc = Object.assign({}, e); delete doc.id; doc.rev = e.rev + 1; doc.lastAudit = o.aid;
    let act, from = e.status, to;
    if (action === 'edit') {
      if (e.status !== 'DRAFT') return no('Only a draft can be edited.');
      const m = minutesFromInput(a.minutes); if (!m.ok) return no(m.error);
      const note = str(a.note); if (note.length > MAX_NOTE) return no('The note is too long (' + MAX_NOTE + ' characters at most).');
      if (m.minutes === e.submittedMinutes && note === e.note) return no('No change to save.');
      doc.submittedMinutes = m.minutes; doc.note = note; act = 'edit'; to = 'DRAFT';
    } else if (action === 'submit') {
      if (e.status !== 'DRAFT') return no('Only a draft can be submitted.'); doc.status = 'SUBMITTED'; act = 'submit'; to = 'SUBMITTED';
    } else if (action === 'reopen') {
      if (e.status !== 'SUBMITTED') return no('Only a submitted entry can be reopened.');
      if (!reasonOk(str(a.reason))) return no('Write a reason of ' + REASON_MIN + ' to ' + REASON_MAX + ' characters.');
      doc.status = 'DRAFT'; act = 'reopen'; to = 'DRAFT';
    } else if (action === 'approve') {
      if (e.status !== 'SUBMITTED') return no('Only a submitted entry can be approved.');
      let mins = e.submittedMinutes; if (a.minutes != null && str(a.minutes) !== '') { const m = minutesFromInput(a.minutes); if (!m.ok) return no(m.error); mins = m.minutes; }
      if (!o.uid) return no('You are not signed in.');
      doc.status = 'APPROVED'; doc.approvedMinutes = mins; doc.approvedAt = SERVER_TIME; doc.approverUid = o.uid; act = 'approve'; to = 'APPROVED';
    } else return no('Unknown step.');
    return { ok: true, writes: [{ kind: 'update', id: e.id, doc }], audits: [{ for: e.id, rec: eAudit(Object.assign({ id: e.id }, doc), act, from, to, doc.rev, str(a.reason)) }] };
  }
  /* approved minutes for one client and period: every APPROVED entry (a superseded one no longer counts) */
  function periodSummary(entries, clientId, start, end) {
    const list = (entries || []).filter(e => sameKey(e, clientId, start, end)), ok = list.filter(e => e.status === 'APPROVED');
    return { approvedMinutes: ok.reduce((a, e) => a + (e.approvedMinutes || 0), 0), approvedCount: ok.length, openCount: list.filter(e => e.status === 'DRAFT' || e.status === 'SUBMITTED').length, supersededCount: list.filter(e => e.status === 'SUPERSEDED').length };
  }
  const statusLabel = e => e.status === 'APPROVED' ? 'Approved (self-approved)' : e.status === 'SUPERSEDED' ? 'Replaced' : e.status === 'SUBMITTED' ? 'Submitted' : 'Draft';

  /* ---------------------------------------------------------------- migration of the existing clients (names and contact details are NEVER copied) */
  /* legacy: [{ id, name, rate, arrangement, status }] (name is only shown on screen).  mappings: [{ legacyId, clientId }].
     ctx: { currency, registry:[{id,status}], profiles:[ids] } -> one row per old client */
  function migrationRows(legacy, mappings, ctx) {
    const map = {}; (mappings || []).forEach(m => { map[m.legacyId] = m.clientId; });
    const cur = ctx.currency || 'USD', supported = M.isSupported(cur);
    return (legacy || []).map(l => {
      const row = { id: l.id, label: l.name || l.id, legacyStatus: l.status || '', arrangement: l.arrangement === 'monthly' ? 'monthly' : 'hourly', currency: cur, notes: [], state: 'ready', rateText: '', mapped: map[l.id] || '' };
      if (row.mapped) { row.state = 'done'; return row; }
      const r = l.rate;
      if (r === null || r === undefined || r === '') row.notes.push('No rate was set.');
      else if (!/^[0-9]{1,9}(\.[0-9]{1,3})?$/.test(String(r))) row.notes.push('The rate is not a simple amount.');
      else { row.rateText = String(r); if (supported) { try { M.toMinor(row.rateText, cur); } catch (e) { row.rateText = ''; row.notes.push('The rate has more decimals than ' + cur + ' allows.'); } } }
      if (!supported) { row.state = 'blocked'; row.notes.push('Currency ' + cur + ' is not in the supported list. Change it in Availability, rates & capacity first.'); }
      else if (row.arrangement === 'monthly') { row.state = 'review'; row.notes.push('Monthly client: the rate is a monthly fee. Billing in B2 is hours x hourly rate, so check this one yourself.'); }
      else if (!row.rateText) row.state = 'review';
      if (row.legacyStatus && row.legacyStatus !== 'active') row.notes.push('This client is marked ' + row.legacyStatus + '.');
      return row;
    });
  }
  /* choice: { mode:'new'|'existing'|'skip', clientId, confirmReview }.  o: { aids:{profile, registry}, uid, existingIds:[all registry ids], registry:[{id,status}], profiles:[ids], format }
     -> { ok, newId, registryNew, writes:[{ coll, kind, id, doc }] } in the order they go into ONE batch */
  function migrationPlan(row, choice, o) {
    o = o || {}; const c = choice || {};
    if (c.mode === 'skip') return no('Skipped.');
    if (row.state === 'done') return no('This client was already migrated to ' + row.mapped + '.');
    if (row.state === 'blocked') return no(row.notes.join(' '));
    if (row.state === 'review' && !c.confirmReview) return no('Tick "I have checked this client" first.');
    let id, registryNew = false;
    if (c.mode === 'existing') {
      const v = I.validateClientId(c.clientId); if (!v.ok) return no(v.error); id = v.id;
      const r = (o.registry || []).find(x => x.id === id); if (!r) return no(id + ' is not in the Client IDs list.'); if (r.status !== 'active') return no(id + ' is archived.');
    } else if (c.mode === 'new') {
      const n = I.nextClientId(o.format, o.existingIds || []); if (!n.ok) return no(n.error); id = n.id; registryNew = true;
    } else return no('Choose what to do with this client.');
    if ((o.profiles || []).indexOf(id) >= 0) return no(id + ' already has a billing profile.');
    const aidP = o.aids && o.aids.profile, aidR = o.aids && o.aids.registry; if (!aidP || (registryNew && !aidR)) return no('A change needs its own ID.');
    const prof = profilePlan(id, null, { currency: row.currency, rate: row.rateText, arrangement: row.arrangement }, { aid: aidP, registryStatus: 'active' });
    if (!prof.ok) return prof;
    const writes = [];
    if (registryNew) {
      writes.push({ coll: 'clientRegistry', kind: 'create', id, doc: { status: 'active', notes: '', rev: 1, lastAudit: aidR } });
      writes.push({ coll: 'clientRegistryAudit', kind: 'create', id: aidR, doc: { clientId: id, action: 'create', prev: '', next: 'active', reason: '', rev: 1 } });
    }
    writes.push({ coll: 'billingProfiles', kind: 'create', id, doc: prof.doc });
    writes.push({ coll: 'billingProfileAudit', kind: 'create', id: aidP, doc: Object.assign({}, prof.audit, { reason: 'Migrated from an existing client record' }) });
    writes.push({ coll: 'billingMigration', kind: 'create', id: row.id, doc: { clientId: id, profileNew: true, registryNew, arrangement: row.arrangement } });
    return { ok: true, newId: id, registryNew, writes };
  }

  const api = { MAX_RATE_MINOR, MAX_MINUTES, MAX_PERIOD_DAYS, MAX_NOTE, REASON_MIN, REASON_MAX, ARRANGEMENTS, SCHEDULES, WEEKDAYS, DUE_KINDS, ENTRY_STATUS, DAY_NAME, SERVER_TIME, DEFAULT_DUE_DAYS,
    defaults, parseAnchors, profileDoc, profilePlan, describeSchedule, describeDue, rateText, changedFields, validPeriod, entryId, parseEntryId, minutesFromInput, nextSeq, entryPlan, periodSummary, statusLabel, migrationRows, migrationPlan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreBilling = api;
})(typeof window !== 'undefined' ? window : globalThis);
