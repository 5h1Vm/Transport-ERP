const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../middleware/asyncHandler');
const { calculateTripPaymentSummary } = require('../services/calculations');

const paymentSchema = z.object({
  transporterId: z.string().cuid(),
  tripId: z.string().cuid().optional().or(z.literal('')),
  // Sprint 2B (multi-stop): when settling a specific leg of a multi-stop trip,
  // the payment carries loadId (and the load's transporterId) and NO tripId —
  // that way it reduces the right transporter's receivable via the bulk calc,
  // and deliberately skips the trip-level overpayment guard (which is keyed on
  // Trip.freightAmount and is meaningless for a multi-stop trip whose freight
  // lives on its loads). Legacy single-leg payments leave loadId unset.
  loadId: z.string().cuid().optional().or(z.literal('')),
  amount: z.coerce.number().positive(),
  mode: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE']),
  paymentType: z.enum(['ADVANCE', 'DIESEL_ADVANCE', 'PART_PAYMENT', 'FULL_SETTLEMENT', 'OTHER']).default('OTHER'),
  referenceNumber: z.string().optional(),
  bankAccount: z.string().optional(),
  notes: z.string().optional(),
  paymentDate: z.string().datetime().optional(),
  // Optional manual override. When omitted, TDS is derived from mode+amount.
  tdsAmount: z.coerce.number().min(0).optional()
});

const TDS_RATE = 0.01;

/**
 * TDS is withheld only on non-cash (online/banked) payments, at 1% of the
 * gross amount. An explicit `tdsAmount` in the request always wins, so the
 * user can correct the figure when reality differs from the default rate.
 *
 * This is a record-keeping figure for tax filing. It is deliberately NOT
 * subtracted from the payment amount anywhere — the transporter's
 * outstanding still moves by the full gross `amount`.
 */
function resolveTdsAmount(payload) {
  if (payload.tdsAmount !== undefined) return payload.tdsAmount;
  if (payload.mode === 'CASH') return 0;
  return Math.round(payload.amount * TDS_RATE * 100) / 100;
}

module.exports = function paymentRoutes(ctx) {
  const { prisma, getOrganization, getSystemUser } = ctx;
  const router = express.Router();

  router.get('/payments', asyncHandler(async (req, res) => {
    const { transporterId, tripId, fromDate, toDate, limit = 100 } = req.query;

    const where = {};
    if (transporterId) where.transporterId = transporterId;
    if (tripId) where.tripId = tripId;
    if (fromDate || toDate) {
      where.paymentDate = {};
      if (fromDate) where.paymentDate.gte = new Date(fromDate);
      if (toDate) where.paymentDate.lte = new Date(toDate);
    }

    const payments = await prisma.payment.findMany({
      where,
      include: {
        transporter: { select: { id: true, firmName: true } },
        trip: { select: { id: true, internalRef: true } },
        createdBy: { select: { id: true, name: true } }
      },
      orderBy: { paymentDate: 'desc' },
      take: Number(limit)
    });

    res.json(payments);
  }));

  router.post('/payments', asyncHandler(async (req, res) => {
    const payload = paymentSchema.parse(req.body);

    const organization = await getOrganization();
    const creator = await getSystemUser(organization.id);

    // Everything below runs inside one transaction so the overpayment check
    // and the insert are atomic — without this, two concurrent payment
    // requests on the same trip can each read the outstanding balance before
    // either has committed, both pass the check, and both get inserted
    // (classic check-then-act race). `SELECT ... FOR UPDATE` takes a row
    // lock on the trip so a second concurrent request blocks until the
    // first transaction commits, then re-reads the now-updated balance.
    const payment = await prisma.$transaction(async (tx) => {
      if (payload.tripId) {
        await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${payload.tripId} FOR UPDATE`;

        const summary = await calculateTripPaymentSummary(tx, payload.tripId);
        // outstanding can be 0 (fully settled) or negative (already overpaid
        // some other way) — either way, no further payment should be let
        // through un-flagged. Comparing against max(outstanding, 0) closes
        // the gap where a `> 0` guard used to silently skip the check once
        // a trip reached exactly zero outstanding.
        const allowedAmount = Math.max(summary?.outstanding || 0, 0);
        if (summary && payload.amount > allowedAmount) {
          const err = new Error(
            allowedAmount > 0
              ? `Overpayment blocked: payment of ₹${payload.amount} exceeds the outstanding balance of ₹${allowedAmount}. Record at most ₹${allowedAmount}.`
              : `Overpayment blocked: this trip has no outstanding balance. Record at most ₹0.`
          );
          err.statusCode = 400;
          throw err;
        }
      }

      const created = await tx.payment.create({
        data: {
          transporterId: payload.transporterId,
          tripId: payload.tripId || null,
          loadId: payload.loadId || null,
          amount: payload.amount,
          tdsAmount: resolveTdsAmount(payload),
          paymentType: payload.paymentType,
          mode: payload.mode,
          referenceNumber: payload.referenceNumber,
          bankAccount: payload.bankAccount,
          notes: payload.notes,
          paymentDate: payload.paymentDate ? new Date(payload.paymentDate) : new Date(),
          createdById: creator.id
        }
      });

      if (payload.tripId) {
        const summary = await calculateTripPaymentSummary(tx, payload.tripId);
        const currentTrip = await tx.trip.findUnique({
          where: { id: payload.tripId },
          select: { status: true }
        });

        let statusUpdate = currentTrip ? currentTrip.status : 'DRAFT';
        // Auto-advance to SETTLED only when a BILLED trip becomes fully paid.
        if (currentTrip && currentTrip.status === 'BILLED' && summary.outstanding <= 0) {
          statusUpdate = 'SETTLED';
        }

        await tx.trip.update({
          where: { id: payload.tripId },
          data: {
            paymentStatus: summary.paymentStatus,
            status: statusUpdate
          }
        });
      }

      return created;
    });

    res.status(201).json(payment);
  }));

  return router;
};
