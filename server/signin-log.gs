// Sign-in log for the Marikar hub: a Google Apps Script web app bound to a Google Sheet.
//
// Set-up (five minutes, once):
//   1. Create a Google Sheet (any name). Extensions > Apps Script. Replace the code with this file. Save.
//   2. Deploy > New deployment > type "Web app": Execute as "Me", Who has access "Anyone". Deploy, authorise.
//   3. Copy the web app URL (ends in /exec) into assets/auth.js as SIGNINS.endpoint. Done.
//
// The hub POSTs one row per sign-in ({at, id, name, role, device}); Settings > Sign-in report GETs ?report=<days>.
// Anyone who knows the URL could post a row or read the report, so it is an attendance register, not evidence.
var SHEET = 'signins';

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  if (sh.getLastRow() === 0) sh.appendRow(['at', 'id', 'name', 'role', 'device']);
  return sh;
}

function doPost(e) {
  var d = {};
  try { d = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) { d = {}; }
  var clean = function (v, n) { return String(v || '').replace(/[\r\n\t]/g, ' ').slice(0, n); };
  if (!clean(d.id, 120)) return ContentService.createTextOutput('ignored');
  sheet_().appendRow([new Date().toISOString(), clean(d.id, 120).toLowerCase(), clean(d.name, 80), clean(d.role, 20), clean(d.device, 160)]);
  return ContentService.createTextOutput('ok');
}

function doGet(e) {
  var days = Math.min(365, Math.max(1, Number((e && e.parameter && e.parameter.report) || 30)));
  var since = new Date(Date.now() - days * 864e5).toISOString();
  var rows = sheet_().getDataRange().getValues().slice(1)
    .filter(function (r) { return String(r[0]) >= since; })
    .map(function (r) { return { at: String(r[0]), id: String(r[1]), name: String(r[2]), role: String(r[3]), device: String(r[4]) }; });
  return ContentService.createTextOutput(JSON.stringify({ days: days, rows: rows.slice(-2000) })).setMimeType(ContentService.MimeType.JSON);
}
