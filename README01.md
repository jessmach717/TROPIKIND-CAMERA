# Tropikind Camera App — README

## Project
**Tropikind Camera / Tropikind Field Geotag**

## Latest Update
**Date:** September 22, 2026  
**Time:** 7:48 AM (Asia/Manila)

## Update Summary
This update prepares the Tropikind Camera web app to sync directly to the new Google Apps Script Web App endpoint used for the standalone **Tropikind Cam Delivery** sheet.

### Changes Made
- Updated `index.html` with the new default Google Apps Script Web App URL.
- Set the default sync token to `tropikind2026`.
- Kept the existing offline-first/localStorage workflow.
- Kept the camera fields and current delivery monitoring design unchanged.
- Kept the Google Sheet sync queue and `Sync now` workflow.
- Added a one-time configuration migration so existing phones can move from the older endpoint to the new endpoint after receiving this version.
- Updated `sw.js` cache version to `tropikind-camera-v4` so phones can receive the latest files instead of staying on the previous cached version.

## New Google Apps Script Endpoint
`https://script.google.com/macros/s/AKfycby3c6AtWV1YIO0CjKaRbj7mQQcB9mnxK-XLjZcnP1_Qr2vRNsRHbcy9U67kSoz91CetUQ/exec`

## Sync Token
`[stored in app configuration]`

> Security note: keep the token private and do not publish it in a public README or public repository.

## Destination Sheet
**Tropikind Cam Delivery**

This sheet is standalone and is intentionally separate from the existing `Delivery_Data` sheet.

## Camera Data Mapping
Each camera visit can generate up to three product rows in `Tropikind Cam Delivery`.

| Camera field | Tropikind Cam Delivery |
|---|---|
| Mingles Refill | Banana-Mingles → REFILL |
| Mingles BO | Banana-Mingles → BO Qty |
| Singles Refill | Banana-singles → REFILL |
| Singles BO | Banana-singles → BO Qty |
| RTE Refill | RTE → REFILL |
| RTE BO | RTE → BO Qty |
| Refill - BO | Net Sold Qty |

## Main Output Structure
`Week | Date | Outlet | Product | REFILL | BO Qty | Net Sold Qty`

Additional camera audit fields may include:
- Stage
- Staff
- Remarks
- Device
- Saved At
- Synced At
- Camera Key
- Row Key

## Important Architecture
**Tropikind Camera → Google Apps Script → Tropikind Cam Delivery**

There is currently **no automatic connection** between `Tropikind Cam Delivery` and the existing `Delivery_Data` sheet.

This separation is intentional so the camera data does not affect the existing dashboard or analytics until a future integration is explicitly approved.

## Files Updated
- `index.html`
- `sw.js`

Files not changed in this update:
- `manifest.webmanifest`
- `icon-192.png`
- `icon-512.png`
- `maskable-512.png`

## Deployment Workflow
1. Update files in Claude or ChatGPT.
2. Replace only the changed files in the GitHub repository.
3. Commit changes to the `main` branch.
4. Netlify automatically deploys the latest commit if GitHub auto-deploy is active.
5. Wait for Netlify status to show **Published**.
6. Open `https://tropikind.app/` on the phone.
7. Refresh or reopen the installed app.
8. Test one sample camera record.
9. Tap **Sync now**.
10. Confirm that the record appears in `Tropikind Cam Delivery`.

## GitHub Update Rule
GitHub is the master copy.

Always use this workflow:

**GitHub latest → Claude/ChatGPT revision → GitHub commit → Netlify deploy → Mobile test**

Do not edit from an old local copy because earlier changes may be lost.

## Cache Rule
When a major app revision is made, increase the service worker cache version.

Current version:

`const CACHE = 'tropikind-camera-v4';`

Example next versions:
- `tropikind-camera-v5`
- `tropikind-camera-v6`

This helps installed phones load the latest app files after deployment.

## Test Checklist
After each deployment, confirm:
- Camera opens correctly.
- BEFORE / AFTER selector works.
- Mingles, Singles, and RTE inputs work.
- Refill and BO values are recorded.
- Branch and staff fields are correct.
- Photo saves correctly.
- Local record count increases.
- Sync status shows connected.
- `Sync now` succeeds.
- New rows appear in `Tropikind Cam Delivery`.
- Existing `Delivery_Data` remains unchanged.

## Change Log

### September 22, 2026 — 7:48 AM
- Added new permanent/default Apps Script endpoint to Tropikind Camera.
- Set default sync token configuration.
- Pointed camera sync to the new standalone `Tropikind Cam Delivery` workflow.
- Preserved offline/local phone records.
- Preserved manual `Sync now`.
- Preserved deduplication logic.
- Added migration for previously stored sync configuration.
- Bumped service worker cache from v3 to v4.
- Confirmed `Delivery_Data` remains separate and unaffected.

## Next Recommended Improvements
- Add a visible app version number, e.g. `v4.0`.
- Add a small “Last synced” timestamp.
- Add a sync success/failure count.
- Add an admin-only settings section.
- Add photo upload to Google Drive if centralized photo storage is required.
