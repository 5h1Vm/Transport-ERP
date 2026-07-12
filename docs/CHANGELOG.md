# Changelog

High-level, dated. Not a git log — see `git log` for commit-level detail. One entry per work session/milestone.

## 2026-07-12 — Docs consolidation

Collapsed docs/ down to the frozen six-file structure (see `DECISIONS.md` #0001). Removed `Transit_Ledger_Handoff_Document.md`, `Transport_ERP_Requirements_v0.2.md`, `chatgpt talk.txt`, and the one-off `HANDOFF_2026-07-12.md` — all their still-relevant content was merged into `PROJECT_BIBLE.md`, `DATABASE.md`, `TASKS.md`, `IDEAS.md`, and `DECISIONS.md`. Corrected the vehicle-ownership business model documentation (see `DECISIONS.md` #0002) after it was found to be backwards throughout the codebase.

## 2026-07-12 — Scaling fix + more contract bugs (commit `9dc7817`)

The app fetched all 9 list endpoints (with fully embedded child records) on every page load and after every mutation — untenable at the 50k-trips/year target. Replaced with route-scoped loading: each page fetches only what it needs, cached 15s; mutations refresh only the current page. Slimmed `/trips` to a paginated, server-filterable endpoint instead of embedding every payment/expense/ledger-entry per row. Transporter/driver list endpoints now return bulk-aggregated totals (outstanding, tripCount, etc.) computed via `groupBy`, instead of pages loading full trip/payment arrays just to sum a number.

Also fixed, discovered while rewiring the above (detail pages had never actually been fixed despite an earlier pass):
- `TripDetailPage`/`DriverDetailPage`/`RouteDetailPage`/`TransporterDetailPage` now fetch their record by ID instead of searching a preloaded global list.
- Removed a dead "Record advance" form that posted to a form type nothing handled — an advance is just a `DriverSettlement` with `type=ADVANCE`.
- Vehicle form: the transporter `<select>` was named `transporterSelect` while a separate, never-synced hidden input was named `transporterId` — vehicles never actually got assigned to a transporter on create.
- Driver multi-select: the option checkboxes and the hidden JSON-array aggregator field both had `name="driverIds"`, so `FormData` collapsed them and every trip submitted with a driver assigned failed validation. Checkboxes no longer carry a name.
- Routes page search input was rendered but never bound to anything.

Verified end-to-end against a live dev DB (not just build-checked): full create → assign driver → record payment → transition status → delete cycle, including the FK-guarded delete-failure path, confirmed via network + DOM inspection.

## 2026-07-12 — Data-contract bug fixes (commit `fa91c3c`)

The frontend had been built against a data model that didn't match the backend (`route.name` instead of `origin`/`destination`, `trip.driverId` instead of `driverIds`, `payment.type` instead of `paymentType`, and more). Fixed across Trips/Routes/Transporter-detail/Ledgers pages. Also: mutation UI no longer flashes a full-page loading card on create/update/delete/status-change (silent in-place refresh instead); fixed a listener leak in the confirm dialog; fixed the driver multi-select dropdown not opening at all (wrong element IDs, wrong CSS class); fixed a `ReferenceError` in the freight auto-calculator.

## Earlier — pre-2026-07-12

Backend modularized from a single 1252-line `routes.js` into one file per domain (`Hope/backend/src/routes/*.js`). N+1 query loops eliminated via bulk `groupBy` aggregation in `services/calculations.js`. Hash-based routing + a hand-rolled reactive layer built for the frontend (`store/reactive.js`) — note: most of that reactive engine (`effect`/`watch`) is unused; rendering is triggered by explicit `render()` calls, not by the reactive system. Frontend/backend split into `Hope/frontend` and `Hope/backend`, deployed to Vercel and Railway respectively.
