TROPIKIND Field Camera — Visual-only right-panel patch v2.9

Changes:
- Full source photo remains visible; no bottom overlay blocks the image.
- Monitoring text is moved to a vertical navy panel on the right.
- AFTER shows Refill and BO values.
- BEFORE hides Refill and BO to avoid confusion.
- Data record structure, CSV structure, sync payload, keys, values, endpoint logic and Google Sheet transfer logic are unchanged.
- Service-worker cache name bumped to tropikind-camera-v13.

GitHub deployment:
Replace index.html and sw.js only, then commit to main.
