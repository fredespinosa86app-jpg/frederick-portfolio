/* Google Sheets receiver for the portfolio owner panel (Enhancement E4).
   SETUP (about 5 minutes, free, your own Google account):
   1. Create a new Google Sheet. Open Extensions > Apps Script and paste this whole file (replace the sample code).
   2. Click the gear icon (Project Settings) > Script properties > Add script property:  name TOKEN,  value a long random
      text (at least 16 characters, for example 4 random words and 6 digits). Keep a copy: the owner panel needs the same text.
   3. Click Deploy > New deployment > type "Web app". Execute as: Me.  Who has access: Anyone.  Deploy and authorise.
   4. Copy the Web app URL (ends with /exec). In the owner panel open Integrations > Google Sheets, paste the URL and the TOKEN, press Save, then Test.
   Only requests that carry your TOKEN are accepted. The sheet tabs are created for you. Re-sending the same rows updates them (no duplicates).
   To stop: in the owner panel press Disconnect, and in Apps Script choose Deploy > Manage deployments > Archive. */
var TABS = {
  Meetings: ['id', 'created', 'status', 'name', 'email', 'company', 'service', 'date', 'time', 'timezone', 'platform', 'message'],
  Clients: ['id', 'name', 'email', 'phone', 'company', 'rate', 'arrangement', 'invoice due', 'status', 'notes'],
  Visitors: ['id', 'date', 'visits', 'unique visitors', 'page views', 'sections viewed']
};
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function clean_(v) {
  v = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, 1000);
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;   // a cell can never start a formula
}
function doPost(e) {
  try {
    var b = JSON.parse(e.postData.contents);
    var t = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!t || t.length < 16 || !b.token || b.token !== t) return out_({ ok: false, error: 'denied' });
    if (b.action === 'ping') return out_({ ok: true, pong: true });
    var cols = TABS[b.tab];
    if (!cols || !Array.isArray(b.rows) || b.rows.length > 200) return out_({ ok: false, error: 'bad request' });
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    var added = 0, updated = 0;
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(b.tab) || ss.insertSheet(b.tab);
      if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold'); sh.setFrozenRows(1); }
      sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2), cols.length).setNumberFormat('@');   // plain text: never a formula
      var last = sh.getLastRow(), ids = {};
      if (last > 1) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r, i) { ids[String(r[0])] = i + 2; });
      var fresh = [];
      b.rows.forEach(function (r) {
        if (!Array.isArray(r) || !r.length) return;
        var row = []; for (var i = 0; i < cols.length; i++) row.push(clean_(r[i]));
        if (!row[0]) return;
        if (ids[row[0]]) { sh.getRange(ids[row[0]], 1, 1, cols.length).setValues([row]); updated++; } else { fresh.push(row); }
      });
      if (fresh.length) { sh.getRange(sh.getLastRow() + 1, 1, fresh.length, cols.length).setValues(fresh); added = fresh.length; }
    } finally { lock.releaseLock(); }
    return out_({ ok: true, added: added, updated: updated });
  } catch (err) { return out_({ ok: false, error: 'failed' }); }
}
