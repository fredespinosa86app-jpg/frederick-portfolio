/* ==========================================================================
   backup-core.js - pure helpers for the owner's JSON backup and validated restore (Security S5).
   Runs in the browser (window.backupCore) and in Node (module.exports) so it can be unit-tested.
   Nothing here touches the network. Restore is limited to a fixed list of collections.
   ========================================================================== */
(function (root) {
  'use strict';
  const FORMAT = 'codeflow-portfolio-backup', VERSION = 1;
  /* restorable: owner-writable by the rules for any document. exportOnly: the rules only let visitors create these, so they are saved for your records but never restored. */
  const RESTORABLE = ['settings', 'content', 'ownerPrivate', 'clients'];
  const EXPORT_ONLY = ['meetingRequests', 'chatUnanswered', 'activity', 'visits', 'clientRegistry', 'clientRegistryAudit', 'workState', 'workSessions', 'workEvents', 'workAssign', 'workAssignAudit', 'workCorrections', 'workSeals', 'workChain', 'workSettings', 'billingProfiles', 'billingProfileAudit', 'billableEntries', 'billableEntryAudit', 'billingMigration', 'invoices', 'invoiceAudit', 'payments', 'paymentReversals', 'invoiceAdjustments', 'invoiceDueDates', 'periodSkips', 'reqCounters', 'ownerDocs', 'surveyInvites', 'surveyInvitesPrivate', 'surveyResponses', 'surveyReminders', 'surveyTemplates', 'surveyForms', 'surveyAnswers', 'todoTasks', 'todoSessions', 'todoNotes', 'todoState'];   // 4.5.0: registry records are paired with audit entries by the rules, so they cannot be restored by a plain write
  const MAX_BYTES = 8 * 1024 * 1024, MAX_DOC = 1000000, MAX_DEPTH = 20, MAX_NODES = 300000, MAX_DOCS = 5000;
  const LABEL = { settings: 'Site settings', content: 'Site content', ownerPrivate: 'Private settings (rates, capacity)', clients: 'Clients', meetingRequests: 'Meeting requests', chatUnanswered: 'Chatbot questions', activity: 'Activity log', visits: 'Visit records', clientRegistry: 'Client IDs', clientRegistryAudit: 'Client ID history', workState: 'WorkTrack position', workSessions: 'WorkTrack sessions', workEvents: 'WorkTrack punches', workAssign: 'WorkTrack clients', workAssignAudit: 'WorkTrack client history', workCorrections: 'WorkTrack corrections', workSeals: 'WorkTrack log seals', workChain: 'WorkTrack log chain head', workSettings: 'WorkTrack settings', billingProfiles: 'Billing profiles', billingProfileAudit: 'Billing profile history', billableEntries: 'Billable hours', billableEntryAudit: 'Billable hours history', billingMigration: 'Client migration records', invoices: 'Invoices', invoiceAudit: 'Invoice history', payments: 'Payments and credits', paymentReversals: 'Payment reversals', invoiceAdjustments: 'Invoice adjustments', invoiceDueDates: 'Due-date changes', periodSkips: 'Skipped billing periods', reqCounters: 'Daily request counters', ownerDocs: 'Owner documents (private notes)', surveyInvites: 'Survey links', surveyInvitesPrivate: 'Survey links: employer e-mails (private)', surveyResponses: 'Survey answers', surveyReminders: 'Survey reminders', surveyTemplates: 'My surveys (templates)', surveyForms: 'Survey question copies', surveyAnswers: 'Survey extra answers', todoTasks: 'To-do tasks', todoSessions: 'To-do focus sessions', todoNotes: 'To-do notes', todoState: 'To-do running timer' };
  const ID_OK = /^[A-Za-z0-9_-]{1,60}$/;
  /* Enhancement E4: connection secrets (Google Sheets address + token) are never written to a backup and never restored from one */
  const NEVER = { ownerPrivate: ['google'] };
  const never = (c, id) => !!(NEVER[c] && NEVER[c].includes(id));
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  /* Firestore Timestamp / Date -> { __ts: ms }; anything not plain JSON is dropped */
  function encode(v, depth) {
    depth = depth || 0; if (depth > MAX_DEPTH) return null;
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v instanceof Date) return { __ts: v.getTime() };
    if (v && typeof v.toMillis === 'function') return { __ts: v.toMillis() };
    if (Array.isArray(v)) return v.map(x => { const e = encode(x, depth + 1); return e === undefined ? null : e; });
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { const e = encode(v[k], depth + 1); if (e !== undefined) o[k] = e; }); return o; }
    return undefined;
  }
  function decode(v) {
    if (Array.isArray(v)) return v.map(decode);
    if (v && typeof v === 'object') {
      const k = Object.keys(v);
      if (k.length === 1 && k[0] === '__ts' && typeof v.__ts === 'number') return new Date(v.__ts);
      const o = {}; k.forEach(x => { o[x] = decode(v[x]); }); return o;
    }
    return v;
  }
  async function sha256(text) {
    const c = (root.crypto && root.crypto.subtle) ? root.crypto : require('node:crypto').webcrypto;
    const buf = await c.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  /* docs = { collection: [ {id, data} ] } -> backup object */
  async function build(docs, meta) {
    const data = {}, counts = {};
    Object.keys(docs).forEach(c => {
      if (!RESTORABLE.includes(c) && !EXPORT_ONLY.includes(c)) return;
      data[c] = {}; (docs[c] || []).forEach(d => { if (ID_OK.test(d.id) && !never(c, d.id)) data[c][d.id] = encode(d.data); });
      counts[c] = Object.keys(data[c]).length;
    });
    const body = JSON.stringify(data);
    return { format: FORMAT, version: VERSION, createdAt: new Date((meta && meta.now) || Date.now()).toISOString(), app: 'frederick-portfolio', note: 'Contains private data (client details, visitor messages). Keep this file safe.', counts, sha256: await sha256(body), data };
  }
  function walk(v, st, depth) {
    st.nodes++; if (st.nodes > MAX_NODES) { st.err = 'The file is too complex.'; return; }
    if (depth > MAX_DEPTH) { st.err = 'The file nests data too deeply.'; return; }
    if (Array.isArray(v)) { v.forEach(x => { if (!st.err) walk(x, st, depth + 1); }); return; }
    if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') { st.err = 'The file contains a forbidden field name (' + k + ').'; return; }
        if (k.length > 200) { st.err = 'A field name is too long.'; return; }
        walk(v[k], st, depth + 1); if (st.err) return;
      }
      return;
    }
    if (typeof v === 'string' && v.length > MAX_DOC) st.err = 'A text value is too large.';
  }
  /* returns { ok, errors[], warnings[], summary:{collection:count}, data } and writes nothing */
  async function validate(text) {
    const r = { ok: false, errors: [], warnings: [], summary: {}, data: null };
    if (typeof text !== 'string' || !text.trim()) { r.errors.push('The file is empty.'); return r; }
    if (text.length > MAX_BYTES) { r.errors.push('The file is larger than 8 MB, which is not a backup from this site.'); return r; }
    let j; try { j = JSON.parse(text); } catch (e) { r.errors.push('This is not a valid JSON file.'); return r; }
    if (!j || typeof j !== 'object' || Array.isArray(j)) { r.errors.push('This is not a backup file.'); return r; }
    if (j.format !== FORMAT) { r.errors.push('This file is not a backup from this portfolio (wrong format name).'); return r; }
    if (j.version !== VERSION) { r.errors.push('Unsupported backup version (' + String(j.version).slice(0, 10) + ').'); return r; }
    if (!j.data || typeof j.data !== 'object' || Array.isArray(j.data)) { r.errors.push('The backup has no data section.'); return r; }
    if (typeof j.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(j.sha256)) { r.errors.push('The backup has no valid checksum.'); return r; }
    if (await sha256(JSON.stringify(j.data)) !== j.sha256) { r.errors.push('The checksum does not match: the file was changed or damaged after it was saved.'); return r; }
    let docs = 0; const st = { nodes: 0, err: '' };
    for (const c of Object.keys(j.data)) {
      if (c === '__proto__' || !(RESTORABLE.includes(c) || EXPORT_ONLY.includes(c))) { r.errors.push('Unknown collection "' + String(c).slice(0, 30) + '".'); continue; }
      const col = j.data[c]; if (!col || typeof col !== 'object' || Array.isArray(col)) { r.errors.push('Collection "' + c + '" is not valid.'); continue; }
      let n = 0;
      for (const id of Object.keys(col)) {
        if (never(c, id)) { delete col[id]; r.warnings.push('Connection settings (' + c + '/' + id + ') are never restored: set them up again in the owner panel.'); continue; }
        if (!ID_OK.test(id)) { r.errors.push('Document name "' + String(id).slice(0, 30) + '" in ' + c + ' is not allowed.'); continue; }
        const d = col[id]; if (!d || typeof d !== 'object' || Array.isArray(d)) { r.errors.push('Document ' + c + '/' + id + ' is not valid.'); continue; }
        if (JSON.stringify(d).length > MAX_DOC) { r.errors.push('Document ' + c + '/' + id + ' is larger than the database allows.'); continue; }
        walk(d, st, 0); if (st.err) { r.errors.push(st.err); break; }
        n++; docs++;
      }
      r.summary[c] = n; if (st.err) break;
    }
    if (docs > MAX_DOCS) r.errors.push('Too many documents (' + docs + ').');
    if (!docs && !r.errors.length) r.errors.push('The backup contains no documents.');
    if (!r.errors.length) {
      EXPORT_ONLY.forEach(c => { if (r.summary[c]) r.warnings.push(LABEL[c] + ' (' + r.summary[c] + ') are kept in the file for your records but are not restored: ' + (/^(clientRegistry|work)/.test(c) ? 'the database ties each change to its history entry or to the clock, so they cannot be rewritten from a file.' : 'the database only lets visitors create them.')); });
      if (!RESTORABLE.some(c => r.summary[c])) r.warnings.push('Nothing in this file can be restored.');
      r.ok = true; r.data = j.data;
    }
    return r;
  }
  /* writes to perform for the chosen collections: [{ c, id, data }] */
  function plan(data, chosen) {
    const out = []; (chosen || []).forEach(c => { if (!RESTORABLE.includes(c) || !data[c]) return; Object.keys(data[c]).forEach(id => out.push({ c, id, data: decode(data[c][id]) })); });
    return out;
  }
  const api = { FORMAT, VERSION, RESTORABLE, EXPORT_ONLY, LABEL, encode, decode, build, validate, plan, sha256 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.backupCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
