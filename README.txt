TROPIKIND FINAL v31

WHAT IS FINALIZED
- All selected checkbox remarks are combined into ONE "Remarks" cell using " | " separators.
- Remark Category also recognizes all 24 approved standard remarks.
- Free-text stays in Other Remarks and is also included in the combined Remarks cell.
- Beginning Inventory remains parsed separately for Mingles, Singles and RTE.
- BEFORE and AFTER photos remain separate in the phone app.
- Backend writes Photo Link for compatibility plus dedicated Before Photo Link and After Photo Link.
- Receipt writes both Receipt Link and Receipt Photo Link.
- Drive hierarchy: date / store / PHOTO / BEFORE or AFTER; receipt in RECEIPT.
- Drive Folder Link and Visit Code remain active.
- Existing Google Sheet /exec URL and token are preserved.
- Store refill targets supported through tab: Store Refill Targets
  Columns: Store | Mingles Target | RTE Target
- setupStoreRefillTargets() may be run ONCE to create that tab if absent.
- Suggested Refill shown in app = Target Stock - Beginning Inventory, minimum zero.
- doPost() should NOT be manually Run from Apps Script editor.

DEPLOYMENT
Replace the existing Apps Script code, Save, then Manage deployments > Edit existing Web App >
New version > Deploy. Keep the same /exec URL.
Replace GitHub index.html and sw.js, then reload/update the PWA.

CACHE: tropikind-camera-v31

- v32: Added Marlon and NepNep to Delivery Staff list; staff list remains alphabetical.
- Cache: tropikind-camera-v32.
