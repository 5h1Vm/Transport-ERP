# Decisions

Settled architectural/product calls and *why*, so they don't get silently re-litigated or reversed by accident. Open questions live at the bottom — flag if you're about to make an assumption on one of these.

## Settled

**0001 — Doc structure is frozen at six files.**
`PROJECT_BIBLE.md`, `DATABASE.md`, `TASKS.md`, `IDEAS.md`, `DECISIONS.md`, `CHANGELOG.md`. No new top-level docs. Reason: an earlier attempt at a 10-folder doc structure (`00-Project/`, `01-Business/`, ... `08-Development/`, `ADR/`) was abandoned before any content was written — too much ceremony for a small team shipping a POC. Extend one of the six files instead of creating a seventh.

**0002 — Transporters are load-brokers, not vehicle owners.**
The Fleet Owner (the client) owns every vehicle — outright, rented, or on EMI. `Vehicle.transporterId` and the UI built on top of it currently get this backwards. See `DATABASE.md` Known Issues for the fix needed. Confirmed by the client independently, multiple times, in the clearest possible terms.

**0003 — Vanilla JS frontend, no framework.**
Deliberate. Keeps the app simple to reason about, cheap to run, fast to ship. Don't introduce React/Vue/etc. without a real conversation first.

**0004 — Light/whitish theme only, no dark mode.**
Explicit product-owner direction for an Indian SME audience — "clean UI, no dark theme, nothing." Don't add a theme toggle.

**0005 — Route-scoped data loading, not global fetch-everything.**
The app used to fetch all list endpoints (with fully embedded child records) on every page load and every mutation. At the target scale (50k trips/year) this doesn't work. Each page now fetches only what it needs; mutations refresh only the current page's data. See `CHANGELOG.md` for the date this landed.

**0006 — Party is out of MVP scope.**
Client: "no need for Party for now as we are not supposed to contact them directly." The `Party` model exists in the schema (unused) for when this changes.

**0007 — No formal LR generation in v1.**
All handwritten today. A printable LR generator is an acceptable future feature, not MVP.

**0008 — Multiple databases/khatabooks per client are acceptable.**
Client confirmed this is fine if needed for the MSSP model — doesn't have to be single-DB multi-tenant if isolation requirements demand otherwise. Still needs an explicit decision once auth/multi-tenancy work starts (see open questions).

## Open — needs a decision before the dependent work starts

**Vehicle ownership model redesign.** What does `ATTACHED`/`LEASED` actually mean operationally? Is there a real "I lease this truck from an external party" relationship distinct from `Transporter`, or should it just be dropped? Needs a client conversation. Blocks: EMI/loan tracking, trip P&L, vehicle profitability reports.

**Driver outstanding-balance sign convention.** Should `SALARY` settlements reduce the balance owed, while `ADVANCE`/`CASH_COLLECTED` increase it? The current formula sums everything as positive, which isn't a true net balance. Needs explicit client sign-off per settlement type before the driver-khata/settlement-statement feature (`IDEAS.md` #6) can be trusted.

**Multi-tenancy shape: single DB with tenant-scoped rows, vs. one DB per client.** Schema already assumes the former (every model has `organizationId`). Client said the latter is acceptable if needed. Row-level is less ops overhead; per-client DBs matter more if a client demands physical data isolation. No client has asked for isolation yet — default to row-level unless one does.

**"Bank" vs. "Road" marker in the client's handwritten ledger.** Best guess: `Bank` = payment via bank transfer, `Road` = collected physically/in cash. Not confirmed. No field exists for this yet — don't add one until it's confirmed, to avoid modeling a guess.

**RBAC enforcement.** Roles exist in the schema (`OWNER`/`MANAGER`/`DISPATCHER`/`ACCOUNTANT`/`TRANSPORTER`/`DRIVER`) but nothing checks them server-side yet — there's no auth layer at all currently. Design this alongside the multi-tenancy work, not before it (auth and tenant-resolution are the same seam).
