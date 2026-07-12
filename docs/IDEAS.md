# Ideas

Anything worth remembering but not immediately required. When one graduates to actual work, move it into `TASKS.md`.

## Ranked roadmap (from competitor research — Indian fleet SaaS + khatabook UX patterns, cross-referenced against the client's explicit WhatsApp asks)

Ordered by value-to-client vs. effort. Each ties back to something either explicitly requested or a genuine gap vs. competitors (WheelsEye/Transport Khata, TransportBook, Fleetx, LocoNav, Vahak, TruckSuvidha).

1. **Append-only TripEvent log + trip timeline feed** (M effort) — client's #1 ask: "driver trip timeline, when driver started, what happened in between, when payment received, if any accidents happened, if driver was changed in between." One `TripEvent` table, indexed `(tripId, at)` and `(driverId, at)`. No competitor at any tier combines an immutable ledger with a WhatsApp-style trip story — identified as the real differentiator, not just a nice-to-have.
2. **Multi-driver per trip with swap event** (M) — `TripDriver` join already exists (see `DATABASE.md`); add a swap timestamp + cash-handover amount as a `DRIVER_SWAPPED` event once #1 exists.
3. **Driver cash-in-hand ledger** (S) — derived, not a new table: advances + diesel cash given − expenses reported − cash handed back. Surfaces as "driver holds ₹X right now" — directly answers the client's ask.
4. **Trip expense line-items UI** (S/M) — the `TripExpense` categories already exist server-side (fuel/toll/food/loading/repair/emergency); there's no way to *add* one from the trip detail page yet, only view them. Prerequisite for #3 and for real trip P&L.
5. **Payment allocation across multiple open trips** (M) — the classification (advance/diesel/part/full) already works; allocating one payment across several trips at once doesn't exist yet.
6. **Driver Khata + outstanding-salary statement** (M) — blocked on the driver-balance formula fix in `DATABASE.md`. Once fixed: a shareable settlement slip via a `wa.me` link.
7. **Trip P&L card** (S, but blocked on the vehicle-ownership fix) — freight − (advances + diesel + bhatta + tolls + commission + vehicle EMI/rental share) = net profit.
8. **Receivable aging + "You'll Get / You'll Give" dashboard header** (S) — 0-15/15-30/30+ day buckets, the owner's daily anxiety check.
9. **`wa.me` collection reminders + ledger share slips** (S) — one-tap prefilled WhatsApp message with outstanding total, no paid Business API needed. Auto-receipt after each payment ("₹X received, balance ₹Y").
10. **POD attach + status workflow polish** (S/M) — the fields exist (`podImageUrl`, `podNotes`, `podReceivedDate`) and the UI form is now wired correctly; the "attach photo" flow could be smoother (currently a URL field, not a real upload).
11. **Incident/accident event** (S, once #1 exists) — reuse the POD photo-upload path for accident/breakdown/challan/theft photos + optional linked expense.
12. **Document expiry alerts** (S) — the date columns already exist on `Vehicle` (insurance/PUC/fitness/permit/national permit) and `Driver` (license); nothing surfaces them anywhere yet. Cheap, high-visibility win.

## Do not build yet (explicit — these are tempting but wrong for this stage)

- GPS/telematics/AIS-140/FASTag integration — hardware + subscription cost, contradicts "khatabook not SAP." Manual timeline events (#1 above) are the low-cost substitute; revisit only if a client actually buys tracking devices.
- E-way bill / GST / e-invoice integration — the transporter handles e-way bills, not the fleet owner. Out of this product's job.
- A return-load marketplace (Vahak/TruckSuvidha territory) — different business model entirely, needs network effects this product doesn't have.
- A dedicated maintenance/job-card module — a `REPAIR` expense category + a notes field covers 90% of the real need for now.
- Full LR/bilty generator + consolidated invoicing — real, but explicitly deferred by the client to a later version.
- A vendor/shop khata (payables to diesel pumps, mechanics) — good future reuse of the transporter-ledger pattern, but not asked for and dilutes MVP focus.
- Predictive maintenance, AI-assisted search, fraud detection, driver performance scoring — future-AI-readiness ideas from early planning, not current work.

## Smaller ideas, not yet prioritized

- Printable LR generator (future version, per client)
- Multi-khatabook / multi-database support — client confirmed acceptable; ties into the multi-tenancy work in `TASKS.md`
- Hindi-first UI for driver-facing screens, once drivers get self-login
- Vehicle utilization / idle-time snapshot
- Route profitability analysis (once trip P&L exists)
