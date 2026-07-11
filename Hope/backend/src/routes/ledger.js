const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');

/**
 * Transporter ledger entries (one per trip), with optional filters by
 * transporter, trip, and date range.
 */
module.exports = function ledgerRoutes(ctx) {
  const { prisma } = ctx;
  const router = express.Router();

  router.get('/transporter-ledger-entries', asyncHandler(async (req, res) => {
    const { transporterId, tripId, fromDate, toDate, limit = 100 } = req.query;

    const where = {};
    if (transporterId) where.transporterId = transporterId;
    if (tripId) where.tripId = tripId;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }

    const entries = await prisma.transporterLedgerEntry.findMany({
      where,
      include: {
        transporter: { select: { id: true, firmName: true } },
        trip: { select: { id: true, internalRef: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit)
    });

    res.json(entries);
  }));

  return router;
};
