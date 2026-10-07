/**
 * Tropikind Delivery.gs — v2.5 Paired Display and Receipt Photos
 * Sheet destination: Tropikind Cam Delivery
 * Media root folder: user-provided Google Drive folder
 * Delivery_Data is never read or modified.
 */

var SECRET = 'tropikind2026';
var CAM_SHEET_NAME = 'Tropikind Cam Delivery';

// USER-PROVIDED GOOGLE DRIVE ROOT FOLDER
var DRIVE_ROOT_FOLDER_ID = '1rn2jFw4-jXSmszrqXLA_1LIQJ3W_FqyW';

var MAX_MEDIA_BYTES = 18 * 1024 * 1024;

var HEADERS = [
  'Week','Date','Outlet','Product','REFILL','BO Qty','Transfer Out','Transfer To','Transfer In','Net Movement',
  'IncludeFlag','WeekFlag','StoreFlag','ProductFlag','Visit Date/Time','Branch','Stage',
  'Mingles Refill','Mingles BO','Mingles Transfer','Mingles Transfer To',
  'Singles Refill','Singles BO','Singles Transfer','Singles Transfer To',
  'RTE Refill','RTE BO','RTE Transfer','RTE Transfer To',
  'Staff','Remarks','Device','Saved At','Synced At','Camera Key','Row Key','Transfer Reference',
  'Inspection Notes','Photo Link','Voice Link','Video Link','Drive Folder Link','Media Upload Status','Photo Code','Receipt Photo Link'
];

function authorizeDrive() {
  var root = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  Logger.log('AUTHORIZED ROOT: ' + root.getName());
  Logger.log('ROOT URL: ' + root.getUrl());
  return root.getUrl();
}

function testMediaFolder() {
  var folder = getMediaTypeFolder_(new Date(), 'TEST BRANCH', 'photo');
  Logger.log('TEST MEDIA FOLDER: ' + folder.getUrl());
  return folder.getUrl();
}

function doGet() {
  return json_({
    ok: true,
    service: 'Tropikind Cam Delivery Sync',
    mediaVersion: 2,
    receiptSupported: true,
    destination: CAM_SHEET_NAME,
    driveRootFolderId: DRIVE_ROOT_FOLDER_ID,
    time: new Date().toISOString()
  });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (SECRET && String(body.token || '') !== SECRET) {
      return json_({ok:false,error:'bad token'});
    }

    if (body.action === 'uploadMedia') {
      return handleMediaUpload_(body);
    }

    return handleRecords_(body);

  } catch (err) {
    return json_({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function getCamSheet_() {
  var ss = SpreadsheetApp.openById('1eMwadrMAWwNtzaE4fBsGG2gSdvUNc8zI1F0QJFP1KuE');
  var sh = ss.getSheetByName(CAM_SHEET_NAME);

  if (!sh) sh = ss.insertSheet(CAM_SHEET_NAME);

  if (sh.getMaxColumns() < HEADERS.length) {
    sh.insertColumnsAfter(
      sh.getMaxColumns(),
      HEADERS.length - sh.getMaxColumns()
    );
  }

  sh.getRange(1,1,1,HEADERS.length)
    .setValues([HEADERS])
    .setFontWeight('bold')
    .setBackground('#174d3c')
    .setFontColor('#ffffff');

  sh.setFrozenRows(1);
  return sh;
}

function handleRecords_(body) {
  var records = body.records || [];

  if (!Array.isArray(records)) {
    return json_({ok:false,error:'records must be an array'});
  }

  var sh = getCamSheet_();
  var existing = buildRowKeyIndex_(sh);
  var append = [];
  var keys = [];
  var updated = 0;

  records.forEach(function(r) {
    r = r || {};
    var cameraKey = String(r.key || '');
    if (!cameraKey) return;

    var dt = parseCameraDate_(r.when);
    var week = 'WEEK ' + getWeekNumber_(dt);
    var dateOnly = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());

    var products = [
      {
        code:'MINGLES', name:'Banana-Mingles',
        refill:number_(r.mR), bo:number_(r.mB),
        transfer:number_(r.mT), to:String(r.mTo||''),
        selected:selected_(r.mR,r.mB,r.mT,r.mTo)
      },
      {
        code:'SINGLES', name:'Banana-singles',
        refill:number_(r.sR), bo:number_(r.sB),
        transfer:number_(r.sT), to:String(r.sTo||''),
        selected:selected_(r.sR,r.sB,r.sT,r.sTo)
      },
      {
        code:'RTE', name:'RTE',
        refill:number_(r.rR), bo:number_(r.rB),
        transfer:number_(r.rT), to:String(r.rTo||''),
        selected:selected_(r.rR,r.rB,r.rT,r.rTo)
      }
    ];

    var made = false;

    products.forEach(function(p) {
      if (!p.selected) return;
      made = true;

      if (p.transfer > 0 && p.to && p.to === String(r.branch || '')) {
        throw new Error(p.name + ': destination store must be different');
      }

      var ref = p.transfer > 0 ? transferRef_(cameraKey,p.code) : '';
      var sourceKey = cameraKey + '|' + p.code;

      updated += upsert_(
        sh, existing, sourceKey,
        buildRow_(
          week,dateOnly,r,p.name,
          p.refill,p.bo,p.transfer,p.to,0,
          p.refill-p.bo-p.transfer,
          cameraKey,sourceKey,ref
        ),
        append
      );

      if (p.transfer > 0 && p.to) {
        var inKey = cameraKey + '|' + p.code + '|TRANSFER_IN|' + sanitizeFilePart_(p.to);
        var dest = clone_(r);
        dest.branch = p.to;

        updated += upsert_(
          sh, existing, inKey,
          buildRow_(
            week,dateOnly,dest,p.name,
            0,0,0,'',p.transfer,p.transfer,
            cameraKey,inKey,ref
          ),
          append
        );
      }
    });

    if (!made && (
      String(r.stage || '') === 'INSPECTION' ||
      r.hasPhoto || r.hasVoice || r.hasVideo ||
      String(r.inspectionNotes || '').trim()
    )) {
      var ik = cameraKey + '|VISIT';
      updated += upsert_(
        sh, existing, ik,
        buildRow_(
          week,dateOnly,r,
          String(r.stage || 'VISIT'),
          0,0,0,'',0,0,
          cameraKey,ik,''
        ),
        append
      );
    }

    keys.push(cameraKey);
  });

  if (append.length) {
    sh.getRange(
      sh.getLastRow()+1,1,append.length,HEADERS.length
    ).setValues(append);
  }

  formatDates_(sh);

  return json_({
    ok:true,
    keys:keys,
    cameraRecords:keys.length,
    rowsAdded:append.length,
    rowsUpdated:updated,
    destination:CAM_SHEET_NAME
  });
}

function buildRow_(week,dateOnly,r,product,refill,bo,tOut,tTo,tIn,net,cameraKey,rowKey,tRef) {
  return [
    week,dateOnly,String(r.branch||''),product,
    refill,bo,tOut,tTo,tIn,net,
    0,0,0,0,
    String(r.when||''),String(r.branch||''),String(r.stage||''),
    raw_(r.mR),raw_(r.mB),raw_(r.mT),String(r.mTo||''),
    raw_(r.sR),raw_(r.sB),raw_(r.sT),String(r.sTo||''),
    raw_(r.rR),raw_(r.rB),raw_(r.rT),String(r.rTo||''),
    String(r.staff||''),String(r.remarks||''),String(r.device||''),
    String(r.savedAt||''),new Date(),
    cameraKey,rowKey,tRef,
    String(r.inspectionNotes||''),
    '','','','',
    (r.hasPhoto||r.hasVoice||r.hasVideo)?'PENDING':'',
    String(r.photoCode||''),''
  ];
}

function handleMediaUpload_(b) {
  var key = String(b.cameraKey || '');
  var type = String(b.mediaType || '').toLowerCase();
  var mime = String(b.mimeType || 'application/octet-stream');
  var branch = String(b.branch || 'Unknown Store');

  if (!key) return json_({ok:false,error:'cameraKey is required'});
  if (['photo','receipt','voice','video'].indexOf(type) < 0) {
    return json_({ok:false,error:'unsupported media type: ' + type});
  }
  if (!allowedMime_(type,mime)) {
    return json_({ok:false,error:'unsupported MIME type: ' + mime});
  }

  var bytes;
  try {
    bytes = Utilities.base64Decode(String(b.data || ''));
  } catch (err) {
    return json_({ok:false,error:'invalid media data'});
  }

  if (!bytes || !bytes.length) {
    return json_({ok:false,error:'empty media file'});
  }

  if (bytes.length > MAX_MEDIA_BYTES) {
    return json_({ok:false,error:'media file is too large'});
  }

  var photoCode=String(b.photoCode||'').toUpperCase();
  if(photoCode && !/^[A-Z0-9]{4}$/.test(photoCode)) return json_({ok:false,error:'invalid photo code'});
  if(type==='receipt' && !photoCode) return json_({ok:false,error:'photo code is required for receipt'});
  // Verify the record exists before creating a Drive file.
  var sh=getCamSheet_(), last=sh.getLastRow(), matched=false;
  if(last>=2){
    var all=sh.getRange(2,1,last-1,HEADERS.length).getValues();
    all.forEach(function(row){
      if(String(row[34]||'')!==key)return;
      matched=true;
      if(photoCode && row[43] && String(row[43])!==photoCode) throw new Error('This visit already has another photo code. Use its existing code or start a visit with a new date/time.');
    });
  }
  if(!matched)return json_({ok:false,error:'Sync the visit record before uploading photos'});
  var when = parseCameraDate_(b.when);
  var mediaFolder = getMediaTypeFolder_(when,branch,type);
  var branchFolder = mediaFolder;

  var ext = extensionFor_(type,mime);
  var stamp = Utilities.formatDate(
    when,
    Session.getScriptTimeZone() || 'Asia/Manila',
    'yyyyMMdd_HHmmss'
  );

  var filename =
    sanitizeFilePart_(branch).toUpperCase() + '_' +
    stamp + '_' +
    (photoCode ? photoCode+'_' : '') +
    (type==='photo'?'DISPLAY':type==='receipt'?'DR-BO':type.toUpperCase()) + '.' + ext;

  var digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes);
  var hash=digest.map(function(n){return ('0'+((n+256)%256).toString(16)).slice(-2);}).join('');
  var desc = key + '|' + type + '|' + photoCode + '|' + hash;
  var file = findFileByDescription_(mediaFolder,desc);

  if (!file) {
    file = mediaFolder.createFile(
      Utilities.newBlob(bytes,mime,filename)
    );
    file.setDescription(desc);
  }

  var fileUrl = file.getUrl();
  var folderUrl = branchFolder.getUrl();

  updateMediaLinks_(key,{
    inspectionNotes:String(b.inspectionNotes||''),
    mediaType:type,
    fileUrl:fileUrl,
    folderUrl:folderUrl,
    photoCode:photoCode,
    expectedReceipt:!!b.expectedReceipt
  });

  return json_({
    ok:true,
    cameraKey:key,
    mediaType:type,
    fileId:file.getId(),
    fileUrl:fileUrl,
    folderUrl:folderUrl,
    mediaFolderUrl:mediaFolder.getUrl()
  });
}

function updateMediaLinks_(key,p) {
  var sh = getCamSheet_();
  var last = sh.getLastRow();
  if (last < 2) return;

  var keyCol = HEADERS.indexOf('Camera Key') + 1;
  var vals = sh.getRange(2,keyCol,last-1,1).getValues();

  var notes = HEADERS.indexOf('Inspection Notes') + 1;
  var photo = HEADERS.indexOf('Photo Link') + 1;
  var voice = HEADERS.indexOf('Voice Link') + 1;
  var video = HEADERS.indexOf('Video Link') + 1;
  var folder = HEADERS.indexOf('Drive Folder Link') + 1;
  var status = HEADERS.indexOf('Media Upload Status') + 1;
  var receipt = HEADERS.indexOf('Receipt Photo Link') + 1;
  var code = HEADERS.indexOf('Photo Code') + 1;

  vals.forEach(function(v,i) {
    if (String(v[0]||'') !== key) return;

    var row = i + 2;

    if (p.inspectionNotes) sh.getRange(row,notes).setValue(p.inspectionNotes);

    if (p.mediaType === 'photo') sh.getRange(row,photo).setValue(p.fileUrl);
    if (p.mediaType === 'receipt') sh.getRange(row,receipt).setValue(p.fileUrl);
    if (p.photoCode) sh.getRange(row,code).setValue(p.photoCode);
    if (p.mediaType === 'voice') sh.getRange(row,voice).setValue(p.fileUrl);
    if (p.mediaType === 'video') sh.getRange(row,video).setValue(p.fileUrl);

    sh.getRange(row,folder).setValue(p.folderUrl || '');
    var photoUrl=sh.getRange(row,photo).getValue();
    var receiptUrl=sh.getRange(row,receipt).getValue();
    var uploadStatus=(p.mediaType==='photo'||p.mediaType==='receipt')?
      (!photoUrl?'DISPLAY PENDING':p.expectedReceipt&&!receiptUrl?'RECEIPT PENDING':'UPLOADED'):'UPLOADED';
    sh.getRange(row,status).setValue(uploadStatus);
  });
}

function getMediaTypeFolder_(date,branch,type) {
  // All new display and receipt uploads share the specified root folder.
  return DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
}

function getOrCreateChildFolder_(parent,name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function findFileByDescription_(folder,desc) {
  var fs = folder.getFiles();
  while (fs.hasNext()) {
    var f = fs.next();
    if (String(f.getDescription()||'') === desc) return f;
  }
  return null;
}

function buildRowKeyIndex_(sh) {
  var out = {};
  var col = HEADERS.indexOf('Row Key') + 1;
  if (sh.getLastRow() < 2) return out;

  sh.getRange(2,col,sh.getLastRow()-1,1)
    .getValues()
    .forEach(function(v,i) {
      if (v[0]) out[String(v[0])] = i + 2;
    });

  return out;
}

function upsert_(sh,index,key,row,append) {
  if(index[key]){
    var position=index[key],last=sh.getLastRow();
    if(position>last){append[position-last-1]=row;return 1;}
    var previous=sh.getRange(position,1,1,HEADERS.length).getValues()[0];
    // Record retries must not erase notes, Drive links, status or photo code.
    for(var c=37;c<HEADERS.length;c++){
      if(row[c]==='' || row[c]==null || (c===42 && previous[c]))row[c]=previous[c];
    }
    sh.getRange(position,1,1,HEADERS.length).setValues([row]);return 1;
  }
  append.push(row);index[key]=sh.getLastRow()+append.length;return 0;
}

function formatDates_(sh) {
  if (sh.getLastRow() < 2) return;

  sh.getRange(2,2,sh.getLastRow()-1,1)
    .setNumberFormat('mmm dd-yyyy');

  sh.getRange(2,34,sh.getLastRow()-1,1)
    .setNumberFormat('mmm dd-yyyy hh:mm:ss');
}

function selected_(a,b,c,d) {
  return a!=='' || b!=='' || c!=='' || d!=='';
}

function transferRef_(key,code) {
  var d = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    key + '|' + code
  );

  var hex = d.map(function(b) {
    var x = (b<0?b+256:b).toString(16);
    return x.length===1 ? '0'+x : x;
  }).join('');

  return 'TR-' + hex.slice(0,10).toUpperCase();
}

function sanitizeFilePart_(v) {
  return String(v||'')
    .replace(/[\\\/:*?"<>|#%{}]/g,'-')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,80);
}

function allowedMime_(type,mime) {
  if (type==='photo'||type==='receipt') return /^image\//i.test(mime);
  if (type==='voice') return /^audio\//i.test(mime);
  if (type==='video') return /^video\//i.test(mime);
  return false;
}

function extensionFor_(type,mime) {
  mime = String(mime||'').toLowerCase();

  if (type==='photo'||type==='receipt') {
    return mime.indexOf('png')>=0 ? 'png' : 'jpg';
  }

  if (type==='voice') {
    if (mime.indexOf('mp4')>=0) return 'm4a';
    if (mime.indexOf('ogg')>=0) return 'ogg';
    return 'webm';
  }

  if (type==='video') {
    return mime.indexOf('webm')>=0 ? 'webm' : 'mp4';
  }

  return 'bin';
}

function clone_(o) {
  var n = {};
  Object.keys(o||{}).forEach(function(k) { n[k]=o[k]; });
  return n;
}

function raw_(v) {
  return (v===null || typeof v==='undefined') ? '' : v;
}

function number_(v) {
  if (v==='' || v===null || typeof v==='undefined') return 0;
  var n = Number(v);
  return isNaN(n) ? 0 : n;
}

function parseCameraDate_(v) {
  if (!v) return new Date();

  var d = new Date(v);
  if (!isNaN(d.getTime())) return d;

  var m = String(v).match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i
  );

  if (!m) return new Date();

  var mo = Number(m[1])-1;
  var day = Number(m[2]);
  var y = Number(m[3]);
  var h = Number(m[4]);
  var min = Number(m[5]);
  var ap = String(m[6]||'').toUpperCase();

  if (ap==='PM' && h<12) h+=12;
  if (ap==='AM' && h===12) h=0;

  return new Date(y,mo,day,h,min,0);
}

function getWeekNumber_(date) {
  var start = new Date(date.getFullYear(),0,1);
  var day = Math.floor((date-start)/86400000)+1;
  return Math.ceil((day+start.getDay())/7);
}

function json_(o) {
  return ContentService
    .createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
