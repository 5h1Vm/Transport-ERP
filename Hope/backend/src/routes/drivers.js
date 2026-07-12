const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../middleware/asyncHandler');
const { parseLimit, parseOffset } = require('../utils/pagination');
const {
  calculateDriverOutstanding,
  calculateDriverOutstandingBulk,
  calculateDriverTripExpenses
} = require('../services/calculations');

// At least 10 digits, digits/spaces/+/- only — matches the client-side pattern.
const phoneSchema = z.string().regex(/^[+0-9 -]{10,20}$/, 'Enter a valid phone number (at least 10 digits)').optional().or(z.literal(''));

const driverSchema = z.object({
  name: z.string().min(2).max(60),
  phone: phoneSchema,
  licenseNumber: z.string().max(30).optional(),
  licenseExpiry: z.string().datetime().optional(),
  monthlySalary: z.coerce.number().min(0).default(0),
  dailyExpenseRate: z.coerce.number().min(0).default(0),
  address: z.string().optional(),
  notes: z.string().optional()
});

const settlementSchema = z.object({
  type: z.enum(['SALARY', 'INCENTIVE', 'ADVANCE', 'DEDUCTION', 'PENALTY', 'CASH_COLLECTED', 'ALLOWANCE']),
  amount: z.coerce.number().positive(),
  tripId: z.string().cuid().optional().or(z.literal('')),
  description: z.string().optional(),
  date: z.string().datetime().optional()
});

function driverData(payload) {
  return {
    name: payload.name,
    phone: payload.phone,
    licenseNumber: payload.licenseNumber,
    licenseExpiry: payload.licenseExpiry ? new Date(payload.licenseExpiry) : null,
    monthlySalary: payload.monthlySalary,
    dailyExpenseRate: payload.dailyExpenseRate,
    address: payload.address,
    notes: payload.notes
  };
}

module.exports = function driverRoutes(ctx) {
  const { prisma, getOrganization } = ctx;
  const router = express.Router();

  router.get('/drivers', asyncHandler(async (req, res) => {
    const take = parseLimit(req.query.limit, 100, 500);
    const skip = parseOffset(req.query.offset);

    const drivers = await prisma.driver.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: {
        _count: { select: { tripAssignments: true } }
      }
    });

    // Bulk-compute outstanding for all drivers in this page (2 queries total).
    const outstandingMap = await calculateDriverOutstandingBulk(prisma, drivers.map((d) => d.id));
    const result = drivers.map(({ _count, ...driver }) => {
      const entry = outstandingMap.get(driver.id) || { outstanding: 0, details: { settlementTotal: 0, tripExpensesPaid: 0, dailyExpenses: 0 } };
      const { outstanding, details } = entry;
      return {
        ...driver,
        tripCount: _count.tripAssignments,
        settlementTotal: details.settlementTotal + details.tripExpensesPaid + details.dailyExpenses,
        outstandingBalance: outstanding
      };
    });

    res.json(result);
  }));

  router.get('/drivers/:driverId', asyncHandler(async (req, res) => {
    const driver = await prisma.driver.findUnique({
      where: { id: req.params.driverId },
      include: {
        settlements: { orderBy: { createdAt: 'desc' } },
        expenses: { where: { paidToDriverId: { not: null } }, orderBy: { createdAt: 'desc' } }
      }
    });

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    const { outstanding, details } = await calculateDriverOutstanding(prisma, driver.id);
    const { tripExpenses } = await calculateDriverTripExpenses(prisma, driver.id);

    res.json({
      ...driver,
      settlementTotal: details.settlementTotal,
      tripExpensesPaid: details.tripExpensesPaid,
      dailyExpenses: details.dailyExpenses,
      outstandingBalance: outstanding,
      tripExpenseDetails: tripExpenses
    });
  }));

  router.get('/drivers/:driverId/trip-expenses', asyncHandler(async (req, res) => {
    const { tripExpenses, totalDailyExpenses } = await calculateDriverTripExpenses(prisma, req.params.driverId);
    res.json({ tripExpenses, totalDailyExpenses });
  }));

  router.put('/drivers/:driverId', asyncHandler(async (req, res) => {
    const payload = driverSchema.parse(req.body);
    const driver = await prisma.driver.update({
      where: { id: req.params.driverId },
      data: driverData(payload)
    });
    res.json(driver);
  }));

  router.post('/drivers', asyncHandler(async (req, res) => {
    const payload = driverSchema.parse(req.body);
    const organization = await getOrganization();
    const driver = await prisma.driver.create({
      data: { organizationId: organization.id, ...driverData(payload) }
    });
    res.status(201).json(driver);
  }));

  router.delete('/drivers/:driverId', asyncHandler(async (req, res) => {
    const driverId = req.params.driverId;
    const assignmentCount = await prisma.tripDriver.count({ where: { driverId } });
    const settlementCount = await prisma.driverSettlement.count({ where: { driverId } });
    const tripExpenseCount = await prisma.tripExpense.count({ where: { paidToDriverId: driverId } });

    if (assignmentCount || settlementCount || tripExpenseCount) {
      return res.status(400).json({ message: 'Delete linked settlements and trips first.' });
    }

    await prisma.driver.delete({ where: { id: driverId } });
    res.status(204).send();
  }));

  router.post('/drivers/:driverId/settlements', asyncHandler(async (req, res) => {
    const payload = settlementSchema.parse(req.body);
    const settlement = await prisma.driverSettlement.create({
      data: {
        driverId: req.params.driverId,
        tripId: payload.tripId || null,
        type: payload.type,
        amount: payload.amount,
        description: payload.description,
        date: payload.date ? new Date(payload.date) : new Date()
      }
    });

    res.status(201).json(settlement);
  }));

  return router;
};
