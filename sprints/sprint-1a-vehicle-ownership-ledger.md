# Build Prompt — Sprint 1a: Vehicle Ownership Fix + Ledger (Khata) Backend Foundation

> **For the coding agent.** This is an exhaustive, self-contained spec. Do not infer scope beyond what's written here. If a required decision is genuinely missing, stop and ask — do not guess. Read `docs/PROJECT_BIBLE.md`, `docs/DATABASE.md`, and `docs/DECISIONS.md` before starting; obey every settled decision in `DECISIONS.md`. **Do NOT read `docs/deep-research-report.md` as an implementation spec** — it is a business/GTM document; its inline auth code snippet in particular must not be copied.

## Objective

Fix the vehicle-ownership data-model bug and introduce a generic **ledger account ("khata")** foundation so the business can track money owed to *payable* parties (vehicle financiers/banks, and external owners of attached/rented vehicles). This sprint is **backend + schema only** — no UI redesign, no money-precision migration (that is Sprint 1b), no driver-balance change (Sprint 1c).

## Background (why this exists — read once, don't re-litigate)

- A **Transporter is a broker/customer** who brings loads and owes the fleet owner money (receivable). A Transporter **never owns or supplies vehicles.** The current schema has `Vehicle.transporterId`, and the app treats it as "which transporter owns this vehicle" — this is backwards and is a confirmed bug (`DECISIONS.md` #0002, `DATABASE.md` Known Issues).
- The fleet owner owns every vehicle — **outright, financed (EMI/loan), attached, rented, or partnership-owned.**
- The unifying concept for every *payable* party (a bank financing a truck, an external owner of an attached truck, later: diesel vendors, mechanics, partners) is a **khata / ledger account**: a party with a running balance and a list of entries over time. This is the "ledger-first, feels like a khatabook" philosophy.
- **Modeling decision (LOCKED — hybrid):** keep `Transporter` and `Driver` as their existing rich, domain-specific tables. Introduce ONE generic `LedgerAccount` model for the payable parties. Do **not** migrate Transporter/Driver into the generic model in this sprint.

## Critical naming guardrail

There is already an **unused `Party` model** in the schema (consignor/consignee — a different, out-of-scope concept per `DECISIONS.md` #0006). **Do NOT reuse or touch `Party`.** Name the new model `LedgerAccount`. Do not delete `Party` either — leave it exactly as-is.

---

## In scope

### 1. New enums

```prisma
enum LedgerAccountKind {
  FINANCIER          // bank / financier a vehicle loan is owed to
  VEHICLE_SUPPLIER   // external owner of an attached/rented/leased vehicle
  VENDOR             // reserved for future (diesel pump, mechanic) — allowed but no UI/logic this sprint
  PARTNER            // reserved for future (partnership vehicle co-owner)
}

enum LedgerEntryType {
  DEBIT   // increases what the fleet owner OWES this account (a charge: EMI due, hire charge due)
  CREDIT  // decreases what is owed (a payment the fleet owner made to this account)
}

enum LoanStatus {
  ACTIVE
  CLOSED
  DEFAULTED
}
```

### 2. New model — `LedgerAccount`

```prisma
model LedgerAccount {
  id             String            @id @default(cuid())
  organizationId String
  organization   Organization      @relation(fields: [organizationId], references: [id])
  kind           LedgerAccountKind
  name           String
  contactPerson  String?
  phone          String?
  notes          String?
  isActive       Boolean           @default(true)
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  entries          LedgerEntry[]
  vehicleLoans     VehicleLoan[]   @relation("LoanFinancier")
  suppliedVehicles Vehicle[]       @relation("VehicleSource")

  @@index([organizationId, kind])
  @@unique([organizationId, kind, name])
}
```

### 3. New model — `LedgerEntry` (append-only running-balance rows)

`amount` is `Decimal(12,2)` **from birth** (new columns are decimal now; the migration of *existing* Float columns is Sprint 1b — that inconsistency during the gap is expected and acceptable).

```prisma
model LedgerEntry {
  id             String          @id @default(cuid())
  organizationId String
  accountId      String
  account        LedgerAccount   @relation(fields: [accountId], references: [id])
  type           LedgerEntryType
  amount         Decimal         @db.Decimal(12, 2)
  description    String?
  date           DateTime        @default(now())
  source         String          @default("MANUAL") // MANUAL | EMI_ACCRUAL | future values
  relatedType    String?         // e.g. "VEHICLE_LOAN", "VEHICLE" — soft link, no FK
  relatedId      String?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  @@index([accountId, date])
  @@index([organizationId])
}
```

Treat `LedgerEntry` as **append-only** at the application layer: expose create + list, but **no update/delete endpoint** (a correction is a new offsetting entry). This matches the "financial history must stay reconstructable" rule (`PROJECT_BIBLE.md`).

### 4. New model — `VehicleLoan` (EMI)

Schema + basic CRUD only. **Automatic monthly EMI accrual (generating `LedgerEntry` rows on the due day) is OUT of scope this sprint** — it needs a scheduled worker (a later sprint). Just model the loan and let entries be added manually for now.

```prisma
model VehicleLoan {
  id                 String        @id @default(cuid())
  organizationId     String
  vehicleId          String
  vehicle            Vehicle       @relation(fields: [vehicleId], references: [id])
  financierAccountId String
  financierAccount   LedgerAccount @relation("LoanFinancier", fields: [financierAccountId], references: [id])
  principal          Decimal       @db.Decimal(12, 2)
  emiAmount          Decimal       @db.Decimal(12, 2)
  emiDueDay          Int           // 1-31
  tenureMonths       Int
  startDate          DateTime
  status             LoanStatus    @default(ACTIVE)
  notes              String?
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt

  @@index([organizationId, vehicleId])
}
```

### 5. Modify `Vehicle`

- **Remove** `transporterId`, the `transporter` relation, and the `@@index([transporterId])`.
- **Add** an optional vehicle-source link (for ATTACHED/RENTED/LEASED vehicles whose external owner you settle with):
  ```prisma
  vehicleSourceId String?
  vehicleSource   LedgerAccount? @relation("VehicleSource", fields: [vehicleSourceId], references: [id])
  loans           VehicleLoan[]
  ```
- **Ownership status enum:** the business model recognizes owned / attached / rented / leased / partnership. Expand `OwnershipStatus` to:
  ```prisma
  enum OwnershipStatus { OWNED  ATTACHED  RENTED  LEASED  PARTNERSHIP }
  ```
  **Financing is orthogonal to ownership** — an `OWNED` vehicle may still have a `VehicleLoan`. Do NOT add a `FINANCED` ownership value; financing is represented by the presence of a `VehicleLoan`, not by ownership status.

### 6. Modify `Transporter`

- **Remove** the `vehicles Vehicle[]` back-relation (Transporters no longer relate to Vehicles).

### 7. Migrations (do this safely — there is real pilot data)

The repo currently uses `prisma db push` (no migration history) and the production `start` script runs `prisma db push` — a data-loss risk. As part of this sprint:
1. **Back up / dump the current dev database first.** Confirm the dump exists before any schema change.
2. **Initialize tracked migrations:** baseline the *current* schema as the initial migration and mark it applied (so existing data is preserved), then generate a new migration for the changes in this sprint. Use `prisma migrate`, not `db push`.
3. **Before dropping `Vehicle.transporterId`:** output a count and list of vehicles where `transporterId IS NOT NULL` (vehicle number + linked transporter firm name). Include this list in your hand-off notes so we can manually re-enter a real `vehicleSource` for any that need one. Then drop the column. (The data was semantically wrong, so it is not auto-migrated into `vehicleSource` — that would re-introduce the broker/supplier confusion.)
4. Update the `package.json` `start` script to use `prisma migrate deploy` instead of `prisma db push`. Leave `dev` as-is if you prefer, but production must use `migrate deploy`.
5. The migration must apply cleanly on a copy of the dev DB with **zero loss of existing rows.**

### 8. Backend routes (follow the existing `src/routes/*.js` module pattern exactly)

Add a new route module (e.g. `ledger-accounts.js`) and wire it in `src/routes/index.js`. Provide, following the same Zod-validated, `asyncHandler`-wrapped style as the existing route files:
- `LedgerAccount`: list (filter by `kind`), get, create, update, delete (delete blocked with a 400 if it has entries or linked loans/vehicles — mirror the existing FK-guard pattern in `transporters.js`/`vehicles.js`).
- `LedgerEntry`: list (by `accountId`, with date filters), create. **No update, no delete.**
- `VehicleLoan`: list (by `vehicleId`), get, create, update, delete.
- A computed **running balance** for a `LedgerAccount`: `balance = Σ(DEBIT) − Σ(CREDIT)` = "what the fleet owner still owes this account" (positive = you owe them). Expose it on the account get/list responses, computed via aggregation (follow the bulk-`groupBy` pattern in `services/calculations.js` — do not N+1).

### 9. Fix the code that references the removed `Vehicle.transporterId`

At minimum, the app must **boot and all existing endpoints must keep working**:
- `src/routes/vehicles.js`: remove `transporterId` from `vehicleSchema`; add optional `vehicleSourceId` (cuid); remove the `transporter` include; optionally add a `vehicleSource` include.
- `src/routes/reference.js`: the vehicles query includes `transporter` — change it (drop it or include `vehicleSource`).
- Frontend `src/pages/VehiclesPage.js`: **remove the transporter `<select>` from the vehicle form** (it encoded the bug). A proper "vehicle source" picker is deferred to the Ledgers UI sprint — do not build it now; just ensure the form submits without a transporter field and nothing 500s.
- Grep the whole repo for `transporterId` on vehicles and any `vehicle.transporter` usage; fix every reference so nothing throws.

---

## Explicitly OUT of scope (do NOT do these here)

- Float→Decimal migration of **existing** money columns (Sprint 1b). Only *new* columns are Decimal this sprint.
- Driver outstanding-balance netting / sign convention (Sprint 1c).
- Automatic EMI accrual / scheduled workers.
- Any UI redesign, the unified Ledgers UI, or a vehicle-source picker UI (Sprint 2).
- Auth, RBAC, tenant scoping, `organizationId` denormalization onto existing child tables (deferred).
- Vendor/partner khata *features* (the enum values may exist; no logic/UI).
- Touching or repurposing the `Party` model.

## Guardrails / house rules

- Obey `DECISIONS.md`: vanilla JS frontend (no framework), light theme only, ledger-first, frozen six-doc set (do not create new docs; if you must note something, extend an existing doc).
- Single-entry running balances only — **no double-entry / journals / trial balance.**
- Match existing code style: CommonJS, Zod on every mutation, `asyncHandler`, per-tenant unique constraints, `_count`/`groupBy` for aggregates (no N+1).
- Do not introduce new dependencies without flagging why.

## Acceptance criteria (I will verify each)

1. `LedgerAccount`, `LedgerEntry`, `VehicleLoan` models + the three enums exist exactly as specified; `Party` is untouched.
2. `Vehicle.transporterId` and its index/relation are gone; `vehicleSourceId` (nullable → `LedgerAccount`) and `loans` exist; `OwnershipStatus` expanded; `Transporter.vehicles` removed.
3. Tracked migrations initialized (baseline + this change); migration applies to a copy of the dev DB with **zero row loss**; existing money values preserved.
4. `package.json` `start` no longer runs `prisma db push`.
5. Hand-off notes include the pre-drop count/list of vehicles that had a non-null `transporterId`.
6. New CRUD endpoints work and follow the existing module/validation pattern; `LedgerEntry` has no update/delete; account running balance is correct and computed without N+1.
7. App boots; every pre-existing endpoint still returns without error; no remaining code references the removed `transporterId`.
8. All new money columns are `Decimal(12,2)`.

## How I will audit this (so build to pass it)

- Read the schema diff + the generated migration SQL end to end.
- Apply the migration to a copy of the dev DB; confirm row counts before/after match and money values are intact.
- Boot the app; in the browser, load Vehicles / Trips / Dashboard and confirm nothing 500s and money still renders.
- Hit the new endpoints (create a FINANCIER account, add a DEBIT then a CREDIT entry, create a VehicleLoan) and confirm the running balance computes correctly.
- Grep for `transporterId`/`vehicle.transporter` to confirm no dangling references.

## Deliverables / hand-off notes to give me

- The schema diff and migration file(s).
- Confirmation the DB was dumped before migrating.
- The list of vehicles that had a `transporterId` before it was dropped.
- A one-line-per-file summary of what changed.
- Anything you had to decide that this spec didn't cover (flag it — don't bury it).
