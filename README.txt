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
