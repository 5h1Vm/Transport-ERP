const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../middleware/asyncHandler');
const { calculateTripPaymentSummary } = require('../services/calculations');

const paymentSchema = z.object({
  transporterId: z.string().cuid(),
  tripId: z.string().cuid().optional().or(z.literal('')),
  amount: z.coerce.number().positive(),
  mode: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE']),
  paymentType: z.enum(['ADVANCE', 'DIESEL_ADVANCE', 'PART_PAYMENT', 'FULL_SETTLEMENT', 'OTHER']).default('OTHER'),
  referenceNumber: z.string().optional(),
  bankAccount: z.string().optional(),
  notes: z.string().optional(),
  paymentDate: z.string().datetime().optional()
});

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

    // Prevent overpayment on trip-linked payments
    if (payload.tripId) {
      const summary = await calculateTripPaymentSummary(prisma, payload.tripId);
      if (summary && summary.outstanding > 0 && payload.amount > summary.outstanding) {
        return res.status(400).json({
          message: `Overpayment blocked: payment of ₹${payload.amount} exceeds the outstanding balance of ₹${summary.outstanding}. Record at most ₹${summary.outstanding}.`
        });
      }
    }

    const payment = await prisma.payment.create({
      data: {
        transporterId: payload.transporterId,
        tripId: payload.tripId || null,
        amount: payload.amount,
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
      const summary = await calculateTripPaymentSummary(prisma, payload.tripId);
      const currentTrip = await prisma.trip.findUnique({
        where: { id: payload.tripId },
        select: { status: true }
      });

      let statusUpdate = currentTrip ? currentTrip.status : 'DRAFT';
      // Auto-advance to SETTLED only when a BILLED trip becomes fully paid.
      if (currentTrip && currentTrip.status === 'BILLED' && summary.outstanding <= 0) {
        statusUpdate = 'SETTLED';
      }

      await prisma.trip.update({
        where: { id: payload.tripId },
        data: {
          paymentStatus: summary.paymentStatus,
          status: statusUpdate
        }
      });
    }

    res.status(201).json(payment);
  }));

  return router;
};
