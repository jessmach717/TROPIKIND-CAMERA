/**
 * TROPIKIND DELIVERY - Apps Script Web App
 * Target: "Tropikind Cam Delivery" sheet ONLY.
 *
 * Compatible with the current Tropikind Field Camera frontend:
 * - token: tropikind2026
 * - normal record sync
 * - paired display photo + DR/BO receipt photo
 * - mediaVersion: 2
 * - receiptSupported: true
 *
 * IMPORTANT:
 * This script does not read from or write to Delivery_Data, Dashboard,
 * BO Analysis, Stores, Cash Monitoring, or any other worksheet.
 */

const TK = {
  SHEET_NAME: 'Tropikind Cam Delivery',
  SECRET: 'tropikind2026',
  ROOT_FOLDER_ID: '1rn2jFw4-jXSmszrqXLA_1LIQJ3W_FqyW',
  MEDIA_VERSION: 2,
  TIMEZONE: 'Asia/Manila'
};

const TK_HEADERS = [
  'Week',
  'Date',
  'Outlet',
  'Store Code',
  'Product',
  'REFILL',
  'BO Qty',
  'Beginning Inventory',
  'Net Movement',
  'Visit Date/Time',
  'Branch',
  'Stage',

  'Mingles Beginning Inventory',
  'Singles Beginning Inventory',
  'RTE Beginning Inventory',

  'Mingles Refill',
  'Mingles BO',
  'Singles Refill',
  'Singles BO',
  'RTE Refill',
  'RTE BO',

  'Staff',
  'Remark Category',
  'Other Remarks',
  'Remarks',
  'Device',
  'Saved At',
  'Synced At',
  'Camera Key',
  'Row Key',
  'Visit Code',

  'Photo Link',
  'Receipt Link',
  'Drive Folder Link',
  'Media Upload Status'
];

function doGet() {
  try {
    const sheet = getTargetSheet_();
    ensureHeaders_(sheet);

    return json_({
      ok: true,
      service: 'Tropikind Delivery',
      sheet: TK.SHEET_NAME,
      mediaVersion: TK.MEDIA_VERSION,
      receiptSupported: true,
      targetOnly: true
    });
  } catch (err) {
    return json_({ ok: false, error: errorMessage_(err) });
  }
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    verifyToken_(payload.token);

    if (payload.action === 'uploadMedia') {
      return json_(uploadMedia_(payload));
    }

    if (!Array.isArray(payload.records)) {
      throw new Error('No records supplied.');
    }

    return json_(saveRecords_(payload));
  } catch (err) {
    return json_({ ok: false, error: errorMessage_(err) });
  }
}

/* -------------------- RECORD SYNC -------------------- */

function saveRecords_(payload) {
  const sheet = getTargetSheet_();
  const headers = ensureHeaders_(sheet);
  const headerMap = headerMap_(headers);
  const existing = existingCameraKeys_(sheet, headerMap);

  const keys = [];
  let inserted = 0;

  payload.records.forEach(function(rec) {
    if (!rec || !rec.key) return;

    const cameraKey = String(rec.key);
    keys.push(cameraKey);

    // Idempotent: if this Camera Key already exists, acknowledge it
    // without creating a duplicate row.
    if (existing[cameraKey]) return;

    const parsed = parseBranch_(rec.branch || '');
    const remarks = parseRemarks_(rec.remarks || '');
    const when = parseVisitDate_(rec.when);
    const week = isoWeekLabel_(when);
    const syncedAt = new Date();

    const values = emptyRow_(headers.length);

    put_(values, headerMap, 'Week', week);
    put_(values, headerMap, 'Date', formatDate_(when));
    put_(values, headerMap, 'Outlet', parsed.outlet);
    put_(values, headerMap, 'Store Code', parsed.code);
    put_(values, headerMap, 'Visit Date/Time', rec.when || '');
    put_(values, headerMap, 'Branch', rec.branch || '');
    put_(values, headerMap, 'Stage', rec.stage || '');

    put_(values, headerMap, 'Mingles Beginning Inventory', remarks.biMingles);
    put_(values, headerMap, 'Singles Beginning Inventory', remarks.biSingles);
    put_(values, headerMap, 'RTE Beginning Inventory', remarks.biRTE);

    put_(values, headerMap, 'Mingles Refill', safeNumberText_(rec.mR));
    put_(values, headerMap, 'Mingles BO', safeNumberText_(rec.mB));
    put_(values, headerMap, 'Singles Refill', safeNumberText_(rec.sR));
    put_(values, headerMap, 'Singles BO', safeNumberText_(rec.sB));
    put_(values, headerMap, 'RTE Refill', safeNumberText_(rec.rR));
    put_(values, headerMap, 'RTE BO', safeNumberText_(rec.rB));

    put_(values, headerMap, 'Staff', rec.staff || '');
    put_(values, headerMap, 'Remark Category', remarks.category);
    put_(values, headerMap, 'Other Remarks', remarks.other);
    put_(values, headerMap, 'Remarks', rec.remarks || '');
    put_(values, headerMap, 'Device', rec.device || payload.device || '');
    put_(values, headerMap, 'Saved At', rec.savedAt || '');
    put_(values, headerMap, 'Synced At', syncedAt);
    put_(values, headerMap, 'Camera Key', cameraKey);
    put_(values, headerMap, 'Row Key', cameraKey);
    put_(values, headerMap, 'Media Upload Status', 'Waiting for media');

    // Keep legacy normalized columns useful without changing the frontend payload.
    // BEFORE rows use Beginning Inventory only.
    if (String(rec.stage || '').toUpperCase() === 'BEFORE') {
      put_(values, headerMap, 'REFILL', '');
      put_(values, headerMap, 'BO Qty', '');
      put_(values, headerMap, 'Beginning Inventory',
           totalBeginningInventory_(remarks));
      put_(values, headerMap, 'Net Movement', '');
      put_(values, headerMap, 'Product', 'Visit Summary');
    } else {
      put_(values, headerMap, 'REFILL',
           total_(rec.mR, rec.sR, rec.rR));
      put_(values, headerMap, 'BO Qty',
           total_(rec.mB, rec.sB, rec.rB));
      put_(values, headerMap, 'Beginning Inventory', '');
      put_(values, headerMap, 'Net Movement',
           total_(rec.mR, rec.sR, rec.rR) - total_(rec.mB, rec.sB, rec.rB));
      put_(values, headerMap, 'Product', 'Visit Summary');
    }

    sheet.appendRow(values);
    existing[cameraKey] = true;
    inserted++;
  });

  SpreadsheetApp.flush();

  return {
    ok: true,
    keys: keys,
    inserted: inserted,
    sheet: TK.SHEET_NAME,
    mediaVersion: TK.MEDIA_VERSION,
    receiptSupported: true
  };
}

/* -------------------- MEDIA UPLOAD -------------------- */

function uploadMedia_(payload) {
  const cameraKey = String(payload.cameraKey || '').trim();
  const mediaType = String(payload.mediaType || '').trim().toLowerCase();
  const photoCode = String(payload.photoCode || '').trim();
  const base64 = String(payload.data || '');

  if (!cameraKey) throw new Error('cameraKey is required.');
  if (mediaType !== 'photo' && mediaType !== 'receipt') {
    throw new Error('mediaType must be photo or receipt.');
  }
  if (!base64) throw new Error('No media data supplied.');

  const sheet = getTargetSheet_();
  const headers = ensureHeaders_(sheet);
  const headerMap = headerMap_(headers);

  const row = findRowByCameraKey_(sheet, headerMap, cameraKey);
  if (!row) {
    throw new Error('Camera Key not found in Tropikind Cam Delivery.');
  }

  const parsedBranch = parseBranch_(payload.branch || '');
  const when = parseVisitDate_(payload.when);
  const root = DriveApp.getFolderById(TK.ROOT_FOLDER_ID);

  const dateFolder = getOrCreateFolder_(root, formatDateFolder_(when));
  const branchFolder = getOrCreateFolder_(
    dateFolder,
    sanitizeFolderName_(parsedBranch.outlet || payload.branch || 'Unknown Store')
  );
  const typeFolder = getOrCreateFolder_(
    branchFolder,
    mediaType === 'receipt' ? 'RECEIPT' : 'PHOTO'
  );

  const mimeType = String(payload.mimeType || 'image/jpeg');
  const ext = extensionForMime_(mimeType);
  const code = photoCode || 'NO-CODE';
  const fileName = mediaType === 'receipt'
    ? 'TROPIKIND_DR-BO_' + code + ext
    : 'TROPIKIND_' + sanitizeFileName_(parsedBranch.outlet || 'STORE') +
      '_' + code + ext;

  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64),
    mimeType,
    fileName
  );

  const file = typeFolder.createFile(blob);
  const fileUrl = file.getUrl();

  if (mediaType === 'receipt') {
    setCellByHeader_(sheet, row, headerMap, 'Receipt Link', fileUrl);
  } else {
    setCellByHeader_(sheet, row, headerMap, 'Photo Link', fileUrl);
  }

  setCellByHeader_(sheet, row, headerMap, 'Visit Code', code);
  setCellByHeader_(sheet, row, headerMap, 'Drive Folder Link', branchFolder.getUrl());

  const photoLink = getCellByHeader_(sheet, row, headerMap, 'Photo Link');
  const receiptLink = getCellByHeader_(sheet, row, headerMap, 'Receipt Link');

  let status = 'Photo uploaded';
  if (photoLink && receiptLink) status = 'Photo + receipt uploaded';
  else if (receiptLink) status = 'Receipt uploaded';
  if (payload.expectedReceipt && !receiptLink) status = 'Waiting for receipt';

  setCellByHeader_(sheet, row, headerMap, 'Media Upload Status', status);

  SpreadsheetApp.flush();

  return {
    ok: true,
    cameraKey: cameraKey,
    mediaType: mediaType,
    photoCode: code,
    fileUrl: fileUrl,
    folderUrl: branchFolder.getUrl(),
    mediaVersion: TK.MEDIA_VERSION,
    receiptSupported: true
  };
}

/* -------------------- SHEET SAFETY -------------------- */

function getTargetSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('This script must be bound to the target spreadsheet.');

  const sheet = ss.getSheetByName(TK.SHEET_NAME);
  if (!sheet) {
    throw new Error('Sheet "' + TK.SHEET_NAME + '" was not found. No other sheet was modified.');
  }

  return sheet;
}

function ensureHeaders_(sheet) {
  let lastCol = sheet.getLastColumn();
  let headers = [];

  if (lastCol > 0) {
    headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  }

  // If the sheet is empty, install the full header set.
  if (sheet.getLastRow() === 0 || headers.join('').trim() === '') {
    sheet.getRange(1, 1, 1, TK_HEADERS.length).setValues([TK_HEADERS]);
    return TK_HEADERS.slice();
  }

  const present = {};
  headers.forEach(function(h) {
    present[String(h || '').trim()] = true;
  });

  const missing = TK_HEADERS.filter(function(h) {
    return !present[h];
  });

  // Append only missing headers. Existing columns/order are preserved.
  if (missing.length) {
    const start = headers.length + 1;
    sheet.getRange(1, start, 1, missing.length).setValues([missing]);
    headers = headers.concat(missing);
  }

  return headers;
}

function headerMap_(headers) {
  const map = {};
  headers.forEach(function(h, i) {
    map[String(h || '').trim()] = i;
  });
  return map;
}

function existingCameraKeys_(sheet, headerMap) {
  const out = {};
  const idx = headerMap['Camera Key'];
  if (idx === undefined || sheet.getLastRow() < 2) return out;

  const vals = sheet.getRange(2, idx + 1, sheet.getLastRow() - 1, 1).getDisplayValues();
  vals.forEach(function(r) {
    const key = String(r[0] || '').trim();
    if (key) out[key] = true;
  });
  return out;
}

function findRowByCameraKey_(sheet, headerMap, cameraKey) {
  const idx = headerMap['Camera Key'];
  if (idx === undefined || sheet.getLastRow() < 2) return 0;

  const vals = sheet.getRange(2, idx + 1, sheet.getLastRow() - 1, 1).getDisplayValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0] || '') === cameraKey) return i + 2;
  }
  return 0;
}

/* -------------------- REMARK / INVENTORY PARSING -------------------- */

function parseRemarks_(raw) {
  const text = String(raw || '').trim();

  const known = [
    'Bad quality fruit',
    'Excess supply',
    'Good store performance',
    'Hot store environment',
    'Short supply of banana',
    'Short supply of RTE',
    'Slow fruit movement'
  ];

  let category = '';
  let other = '';
  let biMingles = '';
  let biSingles = '';
  let biRTE = '';

  const inv = text.match(
    /Beginning Inventory:\s*Mingles\s*([0-9.]+)\s*;\s*Singles\s*([0-9.]+)\s*;\s*RTE\s*([0-9.]+)/i
  );

  if (inv) {
    biMingles = inv[1];
    biSingles = inv[2];
    biRTE = inv[3];
  }

  const parts = text.split('|').map(function(x) {
    return x.trim();
  }).filter(Boolean);

  parts.forEach(function(part) {
    if (/^Beginning Inventory:/i.test(part)) return;

    if (!category) {
      const hit = known.filter(function(k) {
        return k.toLowerCase() === part.toLowerCase();
      })[0];
      if (hit) {
        category = hit;
        return;
      }
    }

    other = other ? other + ' | ' + part : part;
  });

  return {
    category: category,
    other: other,
    biMingles: biMingles,
    biSingles: biSingles,
    biRTE: biRTE
  };
}

function parseBranch_(branch) {
  const s = String(branch || '').trim();

  // Uses the final " - digits" only, so names such as
  // "Maa 1 - Gem - 30030" remain intact.
  const m = s.match(/^(.*)\s+-\s+(\d{3,})$/);

  if (!m) return { outlet: s, code: '' };

  return {
    outlet: m[1].trim(),
    code: m[2].trim()
  };
}

/* -------------------- HELPERS -------------------- */

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Empty request body.');
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    throw new Error('Invalid JSON request.');
  }
}

function verifyToken_(token) {
  if (String(token || '') !== TK.SECRET) {
    throw new Error('Invalid token.');
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorMessage_(err) {
  return err && err.message ? err.message : String(err);
}

function emptyRow_(n) {
  return new Array(n).fill('');
}

function put_(row, map, header, value) {
  if (map[header] !== undefined) row[map[header]] = value;
}

function setCellByHeader_(sheet, row, map, header, value) {
  if (map[header] === undefined) return;
  sheet.getRange(row, map[header] + 1).setValue(value);
}

function getCellByHeader_(sheet, row, map, header) {
  if (map[header] === undefined) return '';
  return sheet.getRange(row, map[header] + 1).getDisplayValue();
}

function safeNumberText_(v) {
  if (v === null || v === undefined || v === '') return '';
  return String(v);
}

function numeric_(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function total_() {
  let sum = 0;
  for (let i = 0; i < arguments.length; i++) sum += numeric_(arguments[i]);
  return sum;
}

function totalBeginningInventory_(r) {
  return numeric_(r.biMingles) + numeric_(r.biSingles) + numeric_(r.biRTE);
}

function parseVisitDate_(value) {
  if (!value) return new Date();

  // Handles frontend strings such as "10/22/2026 7:15 AM".
  let d = new Date(value);
  if (!isNaN(d.getTime())) return d;

  const m = String(value).match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i
  );

  if (m) {
    let h = Number(m[4]);
    if (m[6].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (m[6].toUpperCase() === 'AM' && h === 12) h = 0;
    d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), h, Number(m[5]), 0);
    if (!isNaN(d.getTime())) return d;
  }

  return new Date();
}

function formatDate_(d) {
  return Utilities.formatDate(d, TK.TIMEZONE, 'MMM d, yyyy');
}

function formatDateFolder_(d) {
  return Utilities.formatDate(d, TK.TIMEZONE, 'yyyy-MM-dd');
}

function isoWeekLabel_(date) {
  // Monday-based week number, matching ISO-style operational weeks.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return 'WEEK ' + weekNo;
}

function getOrCreateFolder_(parent, name) {
  const iter = parent.getFoldersByName(name);
  return iter.hasNext() ? iter.next() : parent.createFolder(name);
}

function sanitizeFolderName_(s) {
  return String(s || 'Unknown Store')
    .replace(/[\\/:*?"<>|#%{}[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Unknown Store';
}

function sanitizeFileName_(s) {
  return sanitizeFolderName_(s).replace(/\s+/g, '-');
}

function extensionForMime_(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.indexOf('png') >= 0) return '.png';
  if (m.indexOf('webp') >= 0) return '.webp';
  return '.jpg';
}

/**
 * Run this ONCE from the Apps Script editor after deployment/scopes change.
 * It intentionally authorizes Drive only and does not alter any worksheet.
 */
function authorizeDrive() {
  const root = DriveApp.getFolderById(TK.ROOT_FOLDER_ID);
  Logger.log(root.getName());
}

/**
 * Optional verification. This does not write data.
 */
function verifyTargetSheet() {
  const sheet = getTargetSheet_();
  Logger.log('Target sheet: ' + sheet.getName());
  Logger.log('Other sheets are not modified by this script.');
}
