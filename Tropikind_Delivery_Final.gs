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
  TIMEZONE: 'Asia/Manila',
  TARGET_SHEET_NAME: 'Store Refill Targets',
  // Set this to the spreadsheet ID if the script is not container-bound.
  SPREADSHEET_ID: '1eMwadrMAWwNtzaE4fBsGG2gSdvUNc8zI1F0QJFP1KuE'
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
  'Before Photo Link',
  'After Photo Link',
  'Receipt Photo Link',
  'Receipt Link',
  'Drive Folder Link',
  'Media Upload Status'
];

function doGet(e) {
  try {
    const action = String(e && e.parameter && e.parameter.action || '').trim().toLowerCase();

    if (action === 'targets') {
      verifyToken_(e && e.parameter ? e.parameter.token : '');
      return json_({
        ok: true,
        service: 'Tropikind Delivery',
        targets: readStoreRefillTargets_(),
        targetsAvailable: targetSheetExists_()
      });
    }

    const sheet = getTargetSheet_();
    ensureHeaders_(sheet);

    return json_({
      ok: true,
      service: 'Tropikind Delivery',
      sheet: TK.SHEET_NAME,
      mediaVersion: TK.MEDIA_VERSION,
      receiptSupported: true,
      targetOnly: true,
      storeRefillTargetsSupported: true
    });
  } catch (err) {
    return json_({ ok: false, error: errorMessage_(err) });
  }
}

function doPost(e) {
  const requestId = Utilities.getUuid().slice(0, 8);
  try {
    const payload = parsePayload_(e);
    verifyToken_(payload.token);
    const action = String(payload.action || 'saveRecords');
    console.log('[%s] REQUEST action=%s key=%s mediaType=%s records=%s',
      requestId, action, String(payload.cameraKey || '').slice(0, 100),
      String(payload.mediaType || ''), Array.isArray(payload.records) ? payload.records.length : '-');
    let result;
    if (action === 'uploadMedia') {
      result = uploadMedia_(payload, requestId);
    } else {
      if (!Array.isArray(payload.records)) throw new Error('No records supplied.');
      result = saveRecords_(payload);
    }
    console.log('[%s] SUCCESS action=%s', requestId, action);
    result.requestId = requestId;
    return json_(result);
  } catch (err) {
    console.error('[%s] FAILED %s', requestId, errorMessage_(err));
    return json_({ ok: false, error: errorMessage_(err), requestId: requestId });
  }
}

/* -------------------- RECORD SYNC -------------------- */

function saveRecords_(payload) {
  const sheet = getTargetSheet_();
  const headers = ensureHeaders_(sheet);
  const headerMap = headerMap_(headers);

  const keys = [];
  let inserted = 0;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Record sync busy. Please retry.');
  try {
  const existing = existingCameraKeys_(sheet, headerMap);

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
    put_(values, headerMap, 'Remarks', remarks.allComments || String(rec.remarks || ''));
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
  } finally { lock.releaseLock(); }

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

function uploadMedia_(payload, requestId) {
  requestId = requestId || 'manual';
  const cameraKey = String(payload.cameraKey || '').trim();
  const mediaType = String(payload.mediaType || '').trim().toLowerCase();
  const photoCode = String(payload.photoCode || '').trim();
  const rawData = String(payload.data || '');
  if (!cameraKey) throw new Error('cameraKey is required.');
  if (mediaType !== 'photo' && mediaType !== 'receipt') {
    throw new Error('mediaType must be photo or receipt.');
  }
  if (!rawData) throw new Error('No media data supplied.');

  // Accept plain base64 and data:image/...;base64,... URLs.
  const base64 = rawData.replace(/^data:[^,]*;base64,/i, '').replace(/\s/g, '');
  const mimeFromDataUrl = /^data:([^;,]+);base64,/i.exec(rawData);
  const mimeType = String(payload.mimeType || (mimeFromDataUrl && mimeFromDataUrl[1]) || 'image/jpeg');
  if (!/^image\/(jpeg|png|webp)$/i.test(mimeType)) {
    throw new Error('Unsupported image MIME type: ' + mimeType);
  }
  let bytes;
  try { bytes = Utilities.base64Decode(base64); }
  catch (err) { throw new Error('Invalid base64 image data.'); }
  if (!bytes.length) throw new Error('Decoded image is empty.');
  console.log('[%s] MEDIA decoded key=%s type=%s bytes=%s', requestId, cameraKey, mediaType, bytes.length);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Upload busy. Please retry.');
  try {
    const sheet = getTargetSheet_();
    const headers = ensureHeaders_(sheet);
    const map = headerMap_(headers);
    let row = findRowByCameraKey_(sheet, map, cameraKey);
    if (!row) {
      console.warn('[%s] CAMERA KEY NOT FOUND: %s', requestId, cameraKey);
      // Never attach a photo to an unrelated delivery row.
      throw new Error('Camera Key not found: ' + cameraKey + '. Sync the delivery record first, then retry photo upload.');
    }
    console.log('[%s] MATCHED SHEET ROW %s', requestId, row);
    const parsedBranch = parseBranch_(payload.branch || '');
    const when = parseVisitDate_(payload.when);
    const root = DriveApp.getFolderById(TK.ROOT_FOLDER_ID);
    const dateFolder = getOrCreateFolder_(root, formatDateFolder_(when));
    const branchFolder = getOrCreateFolder_(dateFolder,
      sanitizeFolderName_(parsedBranch.outlet || payload.branch || 'Unknown Store'));
    const rowStage = String(getCellByHeader_(sheet, row, map, 'Stage') || '').trim().toUpperCase();
    const mediaRoot = getOrCreateFolder_(branchFolder, mediaType === 'receipt' ? 'RECEIPT' : 'PHOTO');
    const typeFolder = mediaType === 'receipt'
      ? mediaRoot
      : getOrCreateFolder_(mediaRoot, rowStage === 'BEFORE' ? 'BEFORE' : rowStage === 'AFTER' ? 'AFTER' : 'OTHER');

    const code = photoCode || 'NO-CODE';
    const ext = extensionForMime_(mimeType);
    const fileName = mediaType === 'receipt'
      ? 'TROPIKIND_DR-BO_' + sanitizeFileName_(code) + '_' + sanitizeFileName_(cameraKey).slice(0, 35) + ext
      : 'TROPIKIND_' + sanitizeFileName_(parsedBranch.outlet || 'STORE') + '_' +
        sanitizeFileName_(rowStage || 'PHOTO') + '_' +
        sanitizeFileName_(code) + '_' + sanitizeFileName_(cameraKey).slice(0, 35) + ext;

    const linkHeader = mediaType === 'receipt'
      ? 'Receipt Link'
      : rowStage === 'BEFORE' ? 'Before Photo Link'
      : rowStage === 'AFTER' ? 'After Photo Link'
      : 'Photo Link';
    // If the request is retried, return the already saved link rather than creating duplicates.
    const prior = getCellByHeader_(sheet, row, map, linkHeader) ||
      (mediaType === 'photo' ? getCellByHeader_(sheet, row, map, 'Photo Link') : '');
    if (prior) {
      console.log('[%s] ALREADY LINKED row=%s type=%s', requestId, row, mediaType);
      return { ok: true, cameraKey: cameraKey, mediaType: mediaType, photoCode: code,
        fileUrl: prior, folderUrl: getCellByHeader_(sheet, row, map, 'Drive Folder Link'),
        alreadyUploaded: true, mediaVersion: TK.MEDIA_VERSION, receiptSupported: true };
    }

    const blob = Utilities.newBlob(bytes, mimeType, fileName);
    const file = typeFolder.createFile(blob);
    const fileUrl = file.getUrl();
    console.log('[%s] DRIVE FILE CREATED id=%s url=%s', requestId, file.getId(), fileUrl);
    try {
      setCellByHeader_(sheet, row, map, linkHeader, fileUrl);

      if (mediaType === 'receipt') {
        setCellByHeader_(sheet, row, map, 'Receipt Link', fileUrl);
        setCellByHeader_(sheet, row, map, 'Receipt Photo Link', fileUrl);
      } else {
        setCellByHeader_(sheet, row, map, 'Photo Link', fileUrl);
        if (rowStage === 'BEFORE') setCellByHeader_(sheet, row, map, 'Before Photo Link', fileUrl);
        if (rowStage === 'AFTER') setCellByHeader_(sheet, row, map, 'After Photo Link', fileUrl);
      }

      setCellByHeader_(sheet, row, map, 'Visit Code', code);
      setCellByHeader_(sheet, row, map, 'Drive Folder Link', branchFolder.getUrl());
      const photoLink = getCellByHeader_(sheet, row, map, 'Photo Link');
      const receiptLink = getCellByHeader_(sheet, row, map, 'Receipt Link');
      let status = photoLink && receiptLink ? 'Photo + receipt uploaded' :
        receiptLink ? 'Receipt uploaded' : 'Photo uploaded';
      if (payload.expectedReceipt && !receiptLink) status = 'Waiting for receipt';
      setCellByHeader_(sheet, row, map, 'Media Upload Status', status);
      SpreadsheetApp.flush();
      const written = getCellByHeader_(sheet, row, map, linkHeader);
      if (written !== fileUrl) throw new Error('Sheet link verification failed.');
      console.log('[%s] VERIFIED SHEET LINK row=%s column=%s', requestId, row, linkHeader);
    } catch (err) {
      console.error('[%s] DRIVE FILE EXISTS but sheet write failed: %s', requestId, errorMessage_(err));
      throw new Error('Photo saved to Drive but Sheet link failed. File URL: ' + fileUrl + '. ' + errorMessage_(err));
    }
    return { ok: true, cameraKey: cameraKey, mediaType: mediaType, photoCode: code,
      fileUrl: fileUrl, folderUrl: branchFolder.getUrl(), mediaVersion: TK.MEDIA_VERSION,
      receiptSupported: true };
  } finally {
    lock.releaseLock();
  }
}

/* -------------------- SHEET SAFETY -------------------- */

function getTargetSheet_() {
  const ss = getSpreadsheet_();
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
    if (String(vals[i][0] || '').trim() === cameraKey) return i + 2;
  }
  return 0;
}

/* -------------------- REMARK / INVENTORY PARSING -------------------- */

function parseRemarks_(raw) {
  // Preserve multiple selected categories and free-text comments.
  const known = [
    "Bad quality fruit",
    "Banana color acceptable",
    "Banana color not acceptable",
    "Banana overripe",
    "Banana underripe",
    "Display needs cleaning",
    "Display needs rearranging",
    "Excess supply",
    "Good store performance",
    "High BO observed",
    "High customer movement",
    "Hot store environment",
    "Low BO observed",
    "Low customer movement",
    "Mingles sold out",
    "No refill needed",
    "Refill urgently needed",
    "RTE display incomplete",
    "RTE near expiry",
    "RTE sold out",
    "Short supply of banana",
    "Short supply of RTE",
    "Singles sold out",
    "Slow fruit movement"
  ];
  const items = Array.isArray(raw) ? raw : [raw];
  const text = items.map(function(v) { return String(v || ''); }).join(' | ').trim();
  const inv = text.match(
    /Beginning Inventory:\s*Mingles\s*([0-9.]+)\s*;\s*Singles\s*([0-9.]+)\s*;\s*RTE\s*([0-9.]+)/i
  );
  const categories = [];
  const others = [];
  const seenCategories = {};
  const seenOthers = {};
  text.split(/\s*\|\s*|\r?\n/).map(function(x) { return x.trim(); })
    .filter(Boolean).forEach(function(part) {
      if (/^Beginning Inventory:/i.test(part)) return;
      const matched = known.find(function(k) { return k.toLowerCase() === part.toLowerCase(); });
      if (matched) {
        if (!seenCategories[matched]) categories.push(matched);
        seenCategories[matched] = true;
      } else {
        const key = part.toLowerCase();
        if (!seenOthers[key]) others.push(part);
        seenOthers[key] = true;
      }
    });
  return {
    category: categories.join(' | '),
    other: others.join(' | '),
    allComments: categories.concat(others).join(' | '),
    biMingles: inv ? inv[1] : '',
    biSingles: inv ? inv[2] : '',
    biRTE: inv ? inv[3] : ''
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

/* -------------------- STORE REFILL TARGETS -------------------- */

function getSpreadsheet_() {
  return TK.SPREADSHEET_ID
    ? SpreadsheetApp.openById(TK.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function targetSheetExists_() {
  const ss = getSpreadsheet_();
  return !!(ss && ss.getSheetByName(TK.TARGET_SHEET_NAME));
}

function readStoreRefillTargets_() {
  const ss = getSpreadsheet_();
  const sheet = ss && ss.getSheetByName(TK.TARGET_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getRange(1, 1, sheet.getLastRow(), Math.max(3, sheet.getLastColumn())).getDisplayValues();
  const headers = values[0].map(function(v) { return String(v || '').trim(); });
  const storeIdx = headers.indexOf('Store');
  const minglesIdx = headers.indexOf('Mingles Target');
  const rteIdx = headers.indexOf('RTE Target');

  if (storeIdx < 0 || minglesIdx < 0 || rteIdx < 0) {
    throw new Error('Store Refill Targets must contain Store, Mingles Target, and RTE Target columns.');
  }

  return values.slice(1).map(function(r) {
    return {
      store: String(r[storeIdx] || '').trim(),
      mingles: String(r[minglesIdx] || '').trim(),
      rte: String(r[rteIdx] || '').trim()
    };
  }).filter(function(x) { return x.store; });
}

function setupStoreRefillTargets() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(TK.TARGET_SHEET_NAME);
  if (sheet) {
    Logger.log('Target sheet already exists: ' + TK.TARGET_SHEET_NAME);
    return;
  }

  sheet = ss.insertSheet(TK.TARGET_SHEET_NAME);
  const stores = [
    ["Acacia", '', ''],
    ["Agdao", '', ''],
    ["Anda", '', ''],
    ["Asano GSIS", '', ''],
    ["Bajada", '', ''],
    ["Bangkal 1", '', ''],
    ["Bangkal 3", '', ''],
    ["Bucana", '', ''],
    ["Buhangin KM5", '', ''],
    ["Buhangin KM6", '', ''],
    ["Cabaguio", '', ''],
    ["Cabantian 1", '', ''],
    ["Cabantian 2", '', ''],
    ["Carpenter", '', ''],
    ["Central Park", '', ''],
    ["Centrale", '', ''],
    ["Claveria", '', ''],
    ["Communal", '', ''],
    ["Damosa 2", '', ''],
    ["Damosa-1", '', ''],
    ["DCCS Washington", '', ''],
    ["DMC", '', ''],
    ["Doverlane", '', ''],
    ["Dumnalas", '', ''],
    ["Ecoland", '', ''],
    ["El Rio", '', ''],
    ["Fatima", '', ''],
    ["Flyover", '', ''],
    ["Garcia Heights", '', ''],
    ["GSIS", '', ''],
    ["Guerrero 1", '', ''],
    ["Indangan Malagamot", '', ''],
    ["J4", '', ''],
    ["J5", '', ''],
    ["Kumon Obrero", '', ''],
    ["Lanang", '', ''],
    ["Maa 1 - Gem", '', ''],
    ["Maa 2", '', ''],
    ["Mabini", '', ''],
    ["Madapo", '', ''],
    ["Malvar", '', ''],
    ["Marfori", '', ''],
    ["Matina Crossing", '', ''],
    ["MDRMC", '', ''],
    ["MTS", '', ''],
    ["N. Torres", '', ''],
    ["NHA Buhangin", '', ''],
    ["Obrero 1", '', ''],
    ["Panorama", '', ''],
    ["Ponce", '', ''],
    ["Quimpo", '', ''],
    ["Rizal", '', ''],
    ["Roxas", '', ''],
    ["San Antonio Agdao", '', ''],
    ["Sandawa", '', ''],
    ["Sasa", '', ''],
    ["St. Mary Buhangin", '', ''],
    ["Sta.Ana", '', ''],
    ["UM Matina", '', '']
  ];
  sheet.getRange(1, 1, 1, 3).setValues([['Store', 'Mingles Target', 'RTE Target']]);
  if (stores.length) sheet.getRange(2, 1, stores.length, 3).setValues(stores);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 3);
  Logger.log('Created ' + TK.TARGET_SHEET_NAME + ' with ' + stores.length + ' stores.');
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

/** Run from editor to verify target spreadsheet and Drive access. */
function diagnoseTropikind() {
  const sheet = getTargetSheet_();
  const headers = ensureHeaders_(sheet);
  const root = DriveApp.getFolderById(TK.ROOT_FOLDER_ID);
  console.log('TARGET SHEET: %s, rows=%s', sheet.getName(), sheet.getLastRow());
  console.log('ROOT DRIVE FOLDER: %s, id=%s', root.getName(), root.getId());
  const hm = headerMap_(headers);
  console.log('Photo Link=%s, Before Photo Link=%s, After Photo Link=%s, Receipt Link=%s, Camera Key=%s',
    hm['Photo Link'] + 1,
    hm['Before Photo Link'] + 1,
    hm['After Photo Link'] + 1,
    hm['Receipt Link'] + 1,
    hm['Camera Key'] + 1);
  console.log('Store refill target tab exists: %s', targetSheetExists_());
  return 'Diagnostics completed. Check Execution log.';
}
