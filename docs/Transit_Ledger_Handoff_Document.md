# Transit Ledger Handoff Document

## Overview

This document consolidates the confirmed business understanding, workflow, scope, product expectations, documentation direction, and implementation context for the Transit Ledger / Transport ERP project. It is intended as a single handoff artifact for a coding AI agent or developer so that implementation can proceed without reconstructing context from scattered notes. The contents below are derived from the user's attached project notes and prior project consolidation text.

## Business model

The business is a **fleet owner operation**, not a generic logistics marketplace. The owner controls trucks and drivers, while transporters act as the commercial counterpart who bring loads and later settle payments with the fleet owner. The operational chain described in the notes is: Party has freight requirement -> Transporter contacts Fleet Owner -> Fleet Owner assigns truck and driver -> Delivery happens -> Driver sends POD -> Owner forwards POD -> Transporter pays Owner.

A key consequence of this model is that the transporter behaves as the practical customer from the fleet owner's point of view, because the owner's receivable risk sits there. The notes explicitly state that this changes the system emphasis from shipment visibility alone to transporter balances, trip-linked settlements, and cash leakage prevention.

## Current operating workflow

The current process starts with phone calls or WhatsApp, not with software entry. A transporter contacts the owner or dispatcher, shares trip details such as pickup, destination, material, weight, freight, and loading date, and the owner checks vehicle and driver availability before accepting the job.

Once accepted, a trip becomes active after vehicle and driver assignment. During loading and transit, the driver may request cash, receive fuel money, spend on tolls or food, or directly receive money from transporter or party, and these financial movements need to be captured because they affect later settlement.

After delivery, the driver sends POD through WhatsApp, the dispatcher uploads or forwards it, a bill is sent to the transporter, and the transporter may pay in full or in parts across different modes such as bank transfer, cash, UPI, or cheque. Driver settlement happens separately and may include salary, advances, collected cash, allowances, incentives, and penalties.

## What the handwritten ledgers imply

The notes distinguish **two different registers**, and this is important for the product structure. One notebook is treated as a simple cash paid register: person, amount, done. It is described as a cash-out register covering driver advance, fuel advance, emergency payment, and petty cash, and the notes stress that this implies a Cash Ledger module rather than a heavy accounting module.

The structured KPMG notebook is described as the real ERP goldmine because each row appears to represent one trip. The fields interpreted from that register include freight amount, quantity multiplied by rate, internal trip reference, route and date, a Bank or Road indicator, and a settlement breakup with multiple figures that likely represent deductions, payouts, and net payable.

From this, the attached notes derive several hidden business rules. Freight should be system-calculated from quantity and rate instead of typed manually, a trip can have multiple payments, ledger is more important than invoice PDFs, transporter balances matter more than invoice objects, and driver advances may exist even before a trip record exists.

## Confirmed product requirements

The attached notes confirm that there is **no formal LR generation** in the current business process, though printable LR may be added in the future. The client also confirmed support for multiple khatabooks or multiple database-style separations, indicating future multi-organization or multi-ledger capability.

The system must remain flexible because drivers may switch vehicles frequently, one trip may involve multiple drivers, and driver-level finances need to remain separate even when operational assignments change. The notes also confirm that negative balances are acceptable, monthly salary is common but settlement logic must be flexible, fuel should belong to trip cost, repairs should belong to vehicle expense, and everything important should remain searchable and auditable.

Another explicit requirement is that the system should be mobile-friendly and should support WhatsApp-style messaging or sharing capability without relying on a costly formal WhatsApp API. The notes also ask for clarity around RBAC and emphasize that the UI should feel closer to notebooks and khatabooks than to enterprise SAP-like software.

## Product positioning

The project is framed in the notes as a **ledger-first fleet operating system** for Indian transport businesses. The goal is not just digitization of paperwork but reducing money leakage caused by handwritten registers, scattered WhatsApp history, missing PODs, forgotten transporter payments, unadjusted driver advances, and lack of centralized visibility.

The product should act as a single source of truth across trips, vehicles, drivers, transporters, payments, driver cash, documents, and reports. The success test captured in the notes is whether the owner can quickly answer questions like which transporter owes money, which trips are unpaid, which driver currently holds company cash, which documents expire soon, and what needs attention today.

## MVP scope

The MVP module list captured in the attached notes includes Authentication, Dashboard, Vehicles, Drivers, Transporters, Trips, Payments, Driver Settlements, Documents, Reports, and Settings. These are the modules that should form the first usable product boundary.

At the same time, the notes exclude GPS tracking, FASTag integration, OCR, AI assistant features, customer portal, driver mobile app, SMS gateway, Tally integration, and offline sync from the first prototype. These are explicitly left as future enhancements rather than MVP requirements.

## Core business rules

The notes define several durable business rules that should shape implementation. A trip must have one vehicle, may have multiple drivers, belongs to one transporter, may contain multiple expenses, and can receive multiple payments over time. A vehicle cannot be active on overlapping trips, while drivers may move across vehicles and trips over time.

Payments must preserve history, can be partial, can exceed outstanding, and may arrive into different bank accounts. Deleted records should not disappear permanently, financial history should be adjusted rather than erased, documents need upload and expiry tracking, and audit history is considered important by the owner.

The notes also emphasize that every important action should remain searchable later. This means search and timeline behavior are not optional polish items; they are part of the core business expectation for operational memory.

## Suggested module understanding from the notes

The attached material suggests the following functional direction for modules:

- **Dashboard**: show outstanding payments, pending PODs, driver cash, expiring documents, and trips requiring attention.
- **Trips**: manage operational lifecycle from assignment through delivery, POD, billing, payment state, and linked expenses.
- **Vehicles**: manage assignment history, expenses, documents, and profitability over time.
- **Drivers**: manage availability, trip participation, advances, incentives, salary, collected cash, and settlement history.
- **Transporters**: function as ledger counterparts with balances, partial payments, and trip-linked receivables.
- **Payments / Finance**: record partial payments, excess payments, bank account destination, and outstanding movement while preserving ledger history.
- **Documents**: track RC, insurance, PUC, fitness, permit, national permit, and future versions with reminders.
- **Reports**: answer operational and financial questions quickly rather than produce enterprise-style complexity.

The notes also propose future modules such as Cash Book, Trip Ledger, Transporter Ledger, Driver Advances, POD Documents, and richer reports, framing the product as something like Tally plus Khatabook for a fleet owner.

## UX expectations

The product should not look like a complex enterprise ERP. The notes state plainly that the client currently works with notebook, WhatsApp, and phone calls, so the software should imitate familiar operating behavior rather than demand abstract workflows.

The desired navigation model is workspace-driven rather than giant CRUD pages. The notes describe an interface where the owner can move quickly across Today's Trips, Outstanding, Cash Paid Today, Pending POD, and Transporter Ledger, with one-click access to high-value financial and operational screens.

The notes also emphasize mobile responsiveness. Since the owner is expected to manage the business from phone-sized screens, every primary workflow should be usable on mobile first, especially trip review, outstanding tracking, POD access, and driver/vehicle lookups.

## Documentation structure direction

A major theme in the notes is simplification of documentation. The earlier many-folder docs structure was explicitly rejected in favor of a smaller set of high-value files: `PROJECT_BIBLE.md`, `DATABASE.md`, `TASKS.md`, `IDEAS.md`, `CHANGELOG.md`, and `DECISIONS.md`. This simplified documentation architecture was described as the long-term working model.

Within that model, `PROJECT_BIBLE.md` is intended to act as the single source of truth for product understanding, including vision, workflow, UX, dashboard, finance, driver settlement, RBAC, notifications, future scope, and business rules. `DATABASE.md` is reserved strictly for schema and data-model material, while `TASKS.md`, `IDEAS.md`, `DECISIONS.md`, and `CHANGELOG.md` handle execution tracking and future thinking.

The notes repeatedly stress that future coding instructions to AI agents should be simple: read the main project bible and the database document before implementing. That means the handoff material should remain consolidated and avoid scattering critical knowledge across many small files.

## Draft project-bible content already captured in notes

The attached notes already contain a rough initial foundation for a project bible. That draft frames Transit Ledger as a Fleet Operating System for modern transport businesses, defines the project as a ledger-first system for Indian fleet owners, and states that the software should adapt to the business rather than the business adapting to software.

It also records principles like ledger first, workspace first, mobile first, audit everything, progressive complexity, multi-tenant readiness, API-first thinking, and future AI readiness. It sets early milestones around architecture, authentication, master data, trip management, finance engine, dashboard, reports, and beta readiness.

A later draft section inside the same notes adds a business workflow chapter with lifecycle diagrams, trip lifecycle states, driver workflow inputs, financial flow, vehicle workflow, and workspace philosophy. Even though those notes include some architectural tone, they still contain useful raw requirements about states, settlements, assignments, auditability, and workspace framing.

## Known open questions from the notes

A few items remain explicitly or implicitly unresolved in the attached material. The meaning of the handwritten `Bank` versus `Road` marker in the ledger needs confirmation, because the notes infer it may mean physical collection versus transfer rather than pure payment mode.

The notes also reflect changing understanding around whether Party should be first-class in MVP, because one later line says there is no need for Party for now since the business is not supposed to contact them directly. At the same time, earlier business-model notes still place Party at the top of the freight chain, so this needs a scope-level clarification rather than silent assumption.

Another unresolved area is exact RBAC design. The notes ask how RBAC is looking but do not settle final roles and permissions, beyond the practical roles of Fleet Owner, Dispatcher, Accountant, and future Driver.

## Recommended use of this handoff

This document should be treated as the immediate consolidated context pack for a coding agent. It captures what the business is, how it actually works, what modules matter, what is explicitly in MVP, what should be deferred, how the UI should feel, and what documentation model the project wants to follow.

For implementation, the next clean step is to translate this into two living artifacts only: a single project-bible style requirements document and a database-focused schema document. That keeps the project aligned with the simplification direction stated in the notes and avoids losing time in another documentation restructuring cycle.
