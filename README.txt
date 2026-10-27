TROPIKIND FIELD CAMERA v36
==========================

PURPOSE
This revision restores the simpler, operator-friendly flow inspired by the earlier v20/v25 camera versions, while keeping the v33-v35 backend functions.

VISIBLE FIELD FLOW
1. TAKE PHOTO
   - BEFORE / AFTER selector is immediately visible.
   - Take Photo is the first main action after the Tropikind header.
   - Separate BEFORE and AFTER photo status is retained.

2. VISIT DETAILS
   - Store
   - Delivery staff
   - Date & time
   - Automatic Week Number
   - Visit Code

3. STAGE DETAILS
   BEFORE:
   - Beginning Inventory: Mingles, Singles, RTE
   - Weekly Refill Target
   - Suggested Refill
   - Multiple Remarks + Other Remarks

   AFTER:
   - Actual Refill
   - Bad Order (BO)
   - NO remarks

4. RECEIPT / DR / BO
   - Shown only in AFTER.
   - Paired to the same Visit Code.

5. SAVE & SYNC
   - Normal user sees simple Save/Sync controls.
   - Weekly CSV upload and Sync Settings are placed under a collapsed Admin / Sync Tools section.

PRESERVED CONNECTION
Apps Script /exec:
https://script.google.com/macros/s/AKfycby3c6AtWV1YIO0CjKaRbj7mQQcB9mnxK-XLjZcnP1_Qr2vRNsRHbcy9U67kSoz91CetUQ/exec

Token:
tropikind2026

Google Sheet:
https://docs.google.com/spreadsheets/d/1eMwadrMAWwNtzaE4fBsGG2gSdvUNc8zI1F0QJFP1KuE/edit

BACKEND
Tropikind_Delivery_Final.gs remains the current weekly-set backend:
- doPost delivery sync
- separate BEFORE/AFTER photos
- receipt upload
- weekly target CSV import/update
- date/store target lookup
- multi-remarks in BEFORE

DEPLOYMENT
Frontend:
Replace the current deployed index.html/sw.js with v36.

Apps Script:
If already using the v33/v35 backend, no backend logic change is required for this UI revision.
If not, use the included Tropikind_Delivery_Final.gs and deploy a New Version under the SAME Web App deployment so the /exec URL stays unchanged.


v36.1 HOTFIX — SERVICE WORKER / FETCH
-------------------------------------
Fixed browser error:
  FetchEvent / respondWith returned a null or invalid response.

Cause:
The old service worker was intercepting cross-origin GET requests, including the
Google Apps Script /exec health check. If that fetch failed, its catch path could
resolve without a valid Response.

Fix:
- Service worker now handles SAME-ORIGIN app files only.
- Google Apps Script and Google Drive requests bypass the service worker and go
  directly to the network.
- All intercepted fetch paths now return a valid Response.
- Cache renamed to tropikind-camera-v36-1 so older cached service-worker content
  is removed during activation.

If the old PWA is installed:
1. Publish/upload v36.1 files.
2. Open the site once while online.
3. Reload once. If Android still shows the old cached app, close/reopen the PWA
   or clear only the site's cached data and reopen.


v36.2 HOTFIX — DRIVE UPLOAD "LOAD FAILED"
----------------------------------------
Fixes the remaining:
  Drive upload pending: Load failed

Change:
- Removed the preliminary cross-origin GET health-check to Apps Script.
- Photo queue now uses the normal POST record-sync call as the connectivity and
  backend capability check.
- This is more reliable in Safari/iOS/PWA environments where the preliminary
  GET can fail with the generic "Load failed" message even when POST works.
- Added clearer diagnostics if Apps Script returns no response or non-JSON.
- Service worker cache bumped to tropikind-camera-v36-2.

No connection settings changed:
Apps Script /exec:
https://script.google.com/macros/s/AKfycby3c6AtWV1YIO0CjKaRbj7mQQcB9mnxK-XLjZcnP1_Qr2vRNsRHbcy9U67kSoz91CetUQ/exec
Token: tropikind2026


v36.3 HOTFIX — DRIVE UPLOAD "LOAD FAILED" (PHOTO SIZE)
-----------------------------------------------------
Root cause addressed:
- Photos were uploaded at full camera resolution (JPEG q0.92). On 12–50 MP phones
  that is a 5–20 MB base64 POST in one request. On field mobile data the transfer
  drops, or Apps Script fails before replying, and Safari/Android report only
  "Load failed".

Changes (frontend only, backend unchanged):
- Drive copy is resized to 2048 px long edge, JPEG q0.82 (~0.4–1 MB) before queueing.
  Local gallery/download copy remains full resolution.
- Photos already queued by v36.2 are also resized at upload time.
- Errors now name the failing step (1/2 record sync or 2/2 photo upload),
  the upload size, and distinguish timeout vs dropped connection vs non-JSON reply.
- Service worker cache bumped to tropikind-camera-v36-3.

v36.3 BACKEND COMPATIBILITY FIX (compared against working v24)
--------------------------------------------------------------
- getSpreadsheet_() now uses getActiveSpreadsheet() first, like v24. The v24
  appsscript.json grants only spreadsheets.currentonly + drive, so v36's
  SpreadsheetApp.openById() was not permitted under that manifest.
- uploadMedia_ avoids extra full-size copies of the base64 string.
- appsscript.json from v24 is included unchanged (same scopes, no re-consent).
Deploy: paste Tropikind_Delivery_Final.gs, keep appsscript.json as v24,
run diagnoseTropikind() once, then Manage deployments > Edit existing > New version.
