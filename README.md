# Tropikind Camera — Inspection + Transfer v2

Updated: 2026-09-26

## Staff-facing app
Visit stages: BEFORE / AFTER / INSPECTION.

Per product, staff see only REFILL / BO / TRANSFER. When Transfer is greater than zero, the app reveals `Transfer To`.

BO = damaged/spoiled/unsellable product. TRANSFER = good product moved directly to another store.

## Inspection
Supports stamped photo, direct voice recording (60 sec max), short video (20 sec max), and inspection notes. Media is queued offline using IndexedDB.

## Google Drive
The Apps Script automatically creates:
`Tropikind Inspection Media / YYYY-MM-DD / Branch /`

No manual Drive folder is required.

## Google Sheet
Destination: `Tropikind Cam Delivery`. `Delivery_Data` remains untouched.

## Deploy
1. Replace `index.html` and `sw.js` in the app deployment.
2. Replace the Apps Script with `Tropikind Delivery.gs`.
3. Save Apps Script.
4. Deploy > Manage deployments > Edit > New version > Deploy.
5. Keep the existing Web App URL.
6. Test one transfer and one inspection.


## v2.1 — Transfer destination is optional

The store-to-store transfer procedure is not yet fully established, so `Transfer To` is not enforced.

Current behavior:
- Staff can enter a Transfer quantity and save even if no destination is selected.
- The source store still records `Transfer Out`.
- `Transfer To` can remain blank / Not assigned yet.
- `Transfer In` is created only when a destination store is actually selected.
- BO remains completely separate from Transfer.
- If a destination is selected, the app prevents selecting the same source store.


## v2.2 — Media on every visit stage

Media documentation is now available for:
- BEFORE
- AFTER
- INSPECTION

Each stage can use:
- Photo
- Voice recording
- Video
- Visit notes

UI refinements:
- Store Branch dropdown is larger and easier to read.
- Capture Video now has a clear framed button/tab appearance.
- Visit media controls use a consistent professional button style.
- `Visit Notes` replaces the inspection-only wording in the Google Sheet header.

Transfer behavior remains unchanged from v2.1:
- `Transfer To` is optional.
