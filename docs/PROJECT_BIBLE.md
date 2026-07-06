# Transit Ledger

> Fleet Operating System for Modern Transport Businesses

## Document Information

| Field | Value |
| --- | --- |
| Project Name | Transit Ledger |
| Current Version | v0.1 |
| Status | POC First |
| Owner | Shivam Kumar Singh |
| Repository | https://github.com/5h1Vm/Transport-ERP |
| Target Users | Fleet Owner, Dispatcher, Accountant |
| Product Type | Multi-tenant web ERP / PWA |

## Executive Summary

Transit Ledger is a ledger-first fleet operating system for Indian transport businesses. It is not a generic logistics tool. The product is meant to replace handwritten khatabooks, WhatsApp tracking, phone-call memory, and scattered Excel sheets with a single connected platform for trips, payments, driver settlements, documents, and transporter balances.

The business model is fleet-owner centric. Transporters bring loads and become the practical customer from the owner’s point of view. The fleet owner assigns truck and driver, the trip runs, POD is shared, billing happens, and transporter payments are tracked until settlement is complete.

## Problem Statement

The current operating process depends on physical registers, WhatsApp, phone calls, and memory. That creates recurring issues:

- Payments are forgotten or only partially tracked.
- Driver cash advances are not consistently deducted later.
- PODs get lost in chat history.
- Transporter balances are unclear.
- Vehicle and driver history is fragmented.
- Important actions are not searchable later.
- Document expiry reminders are easy to miss.

The product goal is to reduce revenue leakage and create one source of truth for the business.

## What The Client Confirmed

- There is no formal LR process today; everything is handwritten.
- A printable LR generator can be added later.
- The workflow starts with a transporter speaking to the dispatcher or owner about truck availability.
- Details are shared to the driver, and after delivery the POD is sent on WhatsApp.
- The owner forwards the POD and sends the bill.
- Multiple databases or khatabooks are acceptable.
- Party does not need to be a first-class concern in the first cut if the business is not directly dealing with them.
- The system must remain flexible because drivers can switch trucks, trip patterns vary, and cash movements can happen outside the trip itself.
- The UI must be mobile friendly.
- WhatsApp-style messaging/sharing matters, but a costly formal API should not be the basis of the MVP.

## Product Vision

Build the most practical fleet operating system for transport businesses.

The software should feel like a digital notebook with structure, not like an enterprise ERP that forces the user to change how the business works.

## Core Principles

### 1. Ledger First

Money is the most important asset. Every financial movement must be recorded and balances must be calculated, not hand-maintained.

### 2. Mobile First

Primary workflows must be usable on a phone without friction.

### 3. Audit Everything

Important changes should remain traceable so the owner can reconstruct what happened later.

### 4. Flexible Assignments

Drivers can switch vehicles, trips can involve more than one driver, and financial adjustments can happen outside the trip lifecycle.

### 5. Workflow Mirrors Reality

The system should match the existing operating flow: call, assign, move, deliver, share POD, bill, collect payment, settle.

## MVP Scope

The first usable product should include:

- Authentication
- Dashboard
- Vehicles
- Drivers
- Transporters
- Trips
- Payments
- Driver Settlements
- Documents
- Reports
- Settings

Supporting capabilities expected in the first release:

- Basic balance tracking
- Partial payments
- POD tracking
- Mobile-friendly layout
- Hindi and English support where needed

Out of scope for the first release:

- GPS tracking
- FASTag integration
- OCR/document scanning
- AI assistant features
- Customer portal
- Dedicated driver mobile app
- SMS gateway dependence
- Tally integration
- Offline sync

## Business Workflow

1. Transporter contacts the owner or dispatcher.
2. Load details are shared: pickup, destination, material, weight, freight, loading date.
3. Dispatcher checks available vehicles and drivers.
4. Vehicle and driver are assigned.
5. Trip is created and loading begins.
6. Driver may receive cash, fuel, food, toll, or emergency support.
7. Vehicle moves in transit and trip activity is tracked.
8. Delivery happens.
9. Driver sends POD through WhatsApp.
10. Dispatcher uploads or forwards POD.
11. Bill is sent to the transporter.
12. Payments may arrive in one or multiple parts.
13. Driver settlement is calculated separately.

## Key Business Rules

- A trip belongs to one transporter.
- A trip uses one vehicle.
- A trip may involve multiple drivers.
- A trip may have multiple expenses.
- A trip may receive multiple payments.
- Payments may be partial or exceed the outstanding balance.
- Excess payment becomes transporter credit.
- Driver cash collected on the job must be deducted from the driver settlement.
- Vehicle repair expense belongs to the vehicle, not the trip.
- Fuel and trip-time costs belong to the trip.
- Records should be adjusted, not silently erased.

## Workspace Model

The product should be organized around workspaces, not giant CRUD screens.

- Dashboard: what needs attention today
- Trip Workspace: what is happening on a trip
- Transporter Workspace: how much is owed and what has been paid
- Driver Workspace: current and historical driving/settlement activity
- Vehicle Workspace: performance, assignment, and documents
- Finance Workspace: cash in, cash out, balances, settlements

## Dashboard Priorities

The dashboard should prioritize:

- Outstanding transporter balances
- Pending PODs
- Trips in progress
- Cash paid today
- Driver advances
- Expiring documents
- Trips that need attention

## Financial Model

The system needs to support two different ledger patterns that emerged from the handwritten notes:

1. Cash paid register: a simple cash-out log for driver advance, fuel advance, emergency payment, and petty cash.
2. Trip settlement ledger: a trip-based record where freight, deductions, commissions, advances, and final payable amounts are tracked.

This means the product is not just accounting software. It needs operational finance that reflects transport business reality.

## Notifications

WhatsApp-style sharing is important for:

- POD forwarding
- Payment follow-up
- Document expiry reminders
- Trip status updates

## Future Ideas

These are not MVP requirements, but they should remain easy to add later:

- Printable LR generation
- GPS tracking
- FASTag automation
- OCR for documents and bills
- Driver mobile experience
- Route profitability analysis
- Predictive maintenance
- AI-assisted search and reminders

## Success Criteria

The system is successful if the owner can quickly answer:

- Which transporter owes money?
- Which trips are unpaid?
- Which driver currently holds company cash?
- Which vehicles are active?
- Which documents expire soon?
- Which trips still need POD?
- What needs attention today?

## Working Assumption For Implementation

The codebase should stay POC-first. The immediate goal is to ship a usable prototype around the shared operational core above, then expand the documentation and schema only as the product proves itself.