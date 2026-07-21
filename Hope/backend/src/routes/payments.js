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
  // TDS is opt-in per payment via an explicit checkbox — never automatic.
  // `applyTds` true → 1% of amount is recorded. `tdsAmount` is still honoured
  // as a manual override when the user needs a figure other than the default.
  applyTds: z.coerce.boolean().optional(),
  tdsAmount: z.coerce.number().min(0).optional()
});

const TDS_RATE = 0.01;

/**
 * TDS is opt-in: it is recorded only when the user ticks the "1% TDS" box
 * (`applyTds`), never derived automatically from the payment mode. An explicit
 * `tdsAmount` still wins as a manual override.
 *
 * This is a record-keeping figure for tax filing. It is deliberately NOT
 * subtracted from the payment amount anywhere — the transporter's
 * outstanding still moves by the full gross `amount`.
 */
function resolveTdsAmount(payload) {
  if (payload.tdsAmount !== undefined) return payload.tdsAmount;
  if (payload.applyTds) return Math.round(payload.amount * TDS_RATE * 100) / 100;
  return 0;
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

  /**
   * POST /payments
   *
   * Paying more than a trip owes is allowed, and normal: a transporter often
   * hands over a round figure, or pays ahead against work not yet run. The
   * surplus is not rejected and not special-cased — it becomes credit on the
   * transporter's account, because their outstanding is computed by netting
   * every payment against every receivable. Pay ₹25,000 against a ₹19,200
   * trip and their balance simply falls ₹25,000, leaving ₹5,800 in hand for
   * the next trip.
   *
   * The trip itself reports outstanding ₹0 and advanceAmount ₹5,800 rather
   * than a negative balance, so nothing reads as a debt running backwards.
   * The client warns before recording a surplus — see handleFormSubmit — so
   * an extra zero is still caught, but by a prompt rather than a refusal.
   */
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
        // Still locked, even though nothing is rejected here any more: two
        // concurrent payments on one trip must not both compute paymentStatus
        // from the same pre-insert balance and write a stale result.
        await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${payload.tripId} FOR UPDATE`;
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
