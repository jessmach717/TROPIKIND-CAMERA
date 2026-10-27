TROPIKIND FIELD CAMERA v36.4 — STABLE DRIVE UPLOAD
=================================================

WHY THIS BUILD
The uploaded v36.3 added several layers around Drive upload. Earlier v24/v25
worked with a much simpler Apps Script upload path. v36.4 keeps the new UI,
weekly-set logic, BEFORE/AFTER separation, and smaller Drive photo copies, but
returns the backend upload function to the simpler v24-style flow.

IMPORTANT FIXES
- Apps Script uses SpreadsheetApp.getActiveSpreadsheet() only.
- This matches appsscript.json scope spreadsheets.currentonly.
- Removed extra upload lock / re-read / verification steps from uploadMedia_.
- Frontend still shrinks the Drive copy to ~2048 px before upload.
- BEFORE and AFTER still save to separate PHOTO/BEFORE and PHOTO/AFTER folders.
- Receipt still saves under RECEIPT.
- Existing /exec URL and token are unchanged.

DEPLOYMENT
1. In the Tropikind Google Sheet, open Extensions > Apps Script.
2. Replace the script with Tropikind_Delivery_Final.gs from this package.
3. Keep appsscript.json from this package.
4. Save.
5. Run testDriveUploadAccess() once from the editor and authorize if prompted.
   It should return the spreadsheet name, Tropikind Cam Delivery sheet, and Drive folder.
6. Deploy > Manage deployments > Edit existing Web App > New version > Deploy.
   KEEP THE SAME /exec URL.
7. Publish index.html + sw.js from this package.
8. Open the PWA online and reload once.

Do NOT manually run doPost().
