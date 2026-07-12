# Tasks

Status board. Milestone → tasks → done. Not Scrum, no sprints — this project is too small for that ceremony. Update this file directly as work lands; don't let it drift from reality (it had drifted badly before 2026-07-12 — the old version still listed basic CRUD as unbuilt when it had long since shipped).

## Done

**Backend (modular, `Hope/backend/src/routes/*.js`, one file per domain)**
- [x] Transporters, Vehicles, Drivers, Routes, Trips, Payments, Driver Settlements — full CRUD
- [x] Trip lifecycle state machine with validated transitions (`DRAFT → LOADING → IN_TRANSIT → DELIVERED → POD_RECEIVED → BILLED → SETTLED`, + `CANCELLED`)
- [x] Auto-generated internal trip reference (`TRP-NNN`) when not supplied
- [x] Auto-accrual of driver daily bhatta on marking a trip `DELIVERED`
- [x] Financial calculations centralized in `services/calculations.js`, with bulk (`groupBy`) variants to avoid N+1 queries on list endpoints
- [x] Dashboard endpoint: metrics, recent trips, pending-POD trips, transporter balances, today/month payment totals
- [x] Server-side pagination + filtering on `/trips` (transporterId/vehicleId/routeId/driverId/status/search/date-range)
- [x] Bulk-aggregated `outstanding`/`freightTotal`/`paidTotal`/`tripCount` on transporter and driver list endpoints

**Frontend (vanilla JS SPA, `Hope/frontend/src`)**
- [x] All master-data pages (Transporters, Vehicles, Drivers, Routes) + list/create/edit/delete
- [x] Trip workspace: create with multi-driver assignment, freight auto-calculator from route, filters, server-side pagination with "Load more"
- [x] Trip detail page: payment recording, status transitions, expense display, POD form — wired to backend contract correctly
- [x] Transporter/Driver/Route detail pages — fetch their own record by ID (not a preloaded global list)
- [x] Ledgers page — transporter + driver outstanding, server-computed, no client-side trip/payment scanning
- [x] Route-scoped data loading — each page fetches only what it needs, cached 15s, no more "fetch all 9 endpoints on every load and every mutation"
- [x] Silent mutation refresh — no more full-page "Preparing workspace" flash on create/update/delete/status-change
- [x] Fixed: data-contract mismatches across nearly every page (invented fields like `route.name`, `trip.driverId`, `payment.type`, `driver.advanceBalance` that never existed on the backend)
- [x] Fixed: driver multi-select dropdown (couldn't open at all — wrong element IDs, wrong CSS class)
- [x] Fixed: driver multi-select FormData collision (checkboxes and the hidden aggregator field shared `name="driverIds"`, silently corrupting every trip submission with a driver assigned)
- [x] Fixed: vehicle form transporter-select name mismatch (vehicles never actually got assigned on create)
- [x] Fixed: freight auto-calculator `ReferenceError` on editing rate-per-km
- [x] Confirm dialog: fixed listener leak, added Enter/Escape

See `CHANGELOG.md` for the dated commit-level history.

## In Progress / Next Up (roughly priority order)

- [ ] **Vehicle ownership model redesign** — see `DATABASE.md` Known Issues. Blocks accurate trip P&L / vehicle profitability. Needs a client conversation on what `ATTACHED`/`LEASED` should actually mean before schema changes.
- [ ] **EMI/loan tracking for vehicles** — new model needed, see `DATABASE.md`.
- [ ] **Driver outstanding-balance formula** — needs an explicit business-rule decision (see `DATABASE.md` Known Gaps) before it can be trusted for driver settlement statements.
- [ ] **Trip event timeline** — client's top explicit ask. `TripDriver.leftAt` exists but nothing sets it; no event log exists at all. See `IDEAS.md` #1.
- [ ] Remaining small bugs from a manual QA pass: no `maxlength` on Transporters/Vehicles/Drivers forms (Trips/Routes/Payment forms already have it); some `required`-only client validation fails silently instead of showing inline errors; mobile hamburger menu has no explicit close button (overlay-tap and nav-away already close it, but no visible ✕).

## Not Started

- [ ] **Auth / multi-tenancy** — no login, no session, `getOrganization()` just grabs the first org row. Required for the MSSP multi-client model. See `DATABASE.md` Known Gaps.
- [ ] **UI rebuild for the light/whitish, mobile-first, workspace-driven direction** — current UI is functional and now correctly wired to the backend, but was never redesigned to the product-owner's stated direction (see `PROJECT_BIBLE.md` → UX direction).
- [ ] Documents module (schema exists, zero UI)
- [ ] Reports (only the dashboard's built-in metrics exist; no dedicated reports screens)
- [ ] Settings screen
- [ ] LR/bilty generator (explicitly deferred by client)
- [ ] Everything in `IDEAS.md`

## Out of scope for now (explicit client decision, don't build unprompted)

GPS tracking, FASTag integration, OCR, AI assistant features, a transporter/party self-service portal, a dedicated driver mobile app, SMS gateway, Tally integration, offline sync, Party as a first-class entity.
