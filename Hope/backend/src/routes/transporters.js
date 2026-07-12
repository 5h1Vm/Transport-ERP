const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../middleware/asyncHandler');
const { parseLimit, parseOffset } = require('../utils/pagination');
const {
  calculateTransporterOutstanding,
  calculateTransporterTotalsBulk
} = require('../services/calculations');

// At least 10 digits, digits/spaces/+/- only — matches the client-side pattern.
const phoneSchema = z.string().regex(/^[+0-9 -]{10,20}$/, 'Enter a valid phone number (at least 10 digits)').optional().or(z.literal(''));

const transporterSchema = z.object({
  firmName: z.string().min(2).max(100),
  contactPerson: z.string().max(60).optional(),
  phone: phoneSchema,
  email: z.string().email().optional().or(z.literal('')),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  address: z.string().optional(),
  commissionType: z.enum(['PERCENTAGE', 'FIXED_PER_TRIP', 'FIXED_PER_TON']).default('PERCENTAGE'),
  commissionValue: z.coerce.number().default(0),
  isActive: z.coerce.boolean().default(true),
  notes: z.string().optional()
});

module.exports = function transporterRoutes(ctx) {
  const { prisma, getOrganization } = ctx;
  const router = express.Router();

  router.get('/transporters', asyncHandler(async (req, res) => {
    const take = parseLimit(req.query.limit, 100, 500);
    const skip = parseOffset(req.query.offset);

    // Slim list: no embedded trips/payments (detail views fetch their own).
    // Trip count + ledger totals ride along so list/ledger pages need no extra calls.
    const items = await prisma.transporter.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: {
        _count: { select: { trips: true } }
      }
    });

    // Bulk-compute totals for all transporters in this page (2 queries total).
    const totalsMap = await calculateTransporterTotalsBulk(prisma, items.map((t) => t.id));
    const result = items.map(({ _count, ...transporter }) => {
      const totals = totalsMap.get(transporter.id) || { freightTotal: 0, paidTotal: 0, outstanding: 0 };
      return {
        ...transporter,
        tripCount: _count.trips,
        freightTotal: totals.freightTotal,
        paidTotal: totals.paidTotal,
        outstanding: totals.outstanding
      };
    });

    res.json(result);
  }));

  router.get('/transporters/:transporterId', asyncHandler(async (req, res) => {
    const transporter = await prisma.transporter.findUnique({
      where: { id: req.params.transporterId },
      include: {
        trips: { orderBy: { createdAt: 'desc' }, take: 5 },
        payments: { orderBy: { paymentDate: 'desc' }, take: 5 }
      }
    });

    if (!transporter) {
      return res.status(404).json({ message: 'Transporter not found' });
    }

    res.json({
      ...transporter,
      outstanding: await calculateTransporterOutstanding(prisma, transporter.id)
    });
  }));

  router.put('/transporters/:transporterId', asyncHandler(async (req, res) => {
    const payload = transporterSchema.parse(req.body);

    const transporter = await prisma.transporter.update({
      where: { id: req.params.transporterId },
      data: {
        ...payload,
        email: payload.email || null
      }
    });

    res.json(transporter);
  }));

  router.post('/transporters', asyncHandler(async (req, res) => {
    const payload = transporterSchema.parse(req.body);

    const organization = await getOrganization();
    const transporter = await prisma.transporter.create({
      data: {
        organizationId: organization.id,
        ...payload,
        email: payload.email || null
      }
    });

    res.status(201).json(transporter);
  }));

  router.delete('/transporters/:transporterId', asyncHandler(async (req, res) => {
    const transporterId = req.params.transporterId;
    const tripCount = await prisma.trip.count({ where: { transporterId } });
    const paymentCount = await prisma.payment.count({ where: { transporterId } });
    const ledgerCount = await prisma.transporterLedgerEntry.count({ where: { transporterId } });

    if (tripCount || paymentCount || ledgerCount) {
      return res.status(400).json({ message: 'Delete linked trips and payments first.' });
    }

    await prisma.transporter.delete({ where: { id: transporterId } });
    res.status(204).send();
  }));

  return router;
};
