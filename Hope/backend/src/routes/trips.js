const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../middleware/asyncHandler');
const { parseLimit, parseOffset } = require('../utils/pagination');
const {
  calculateCommission,
  calculateFreightAmount,
  calculateTransporterOutstanding,
  calculateTripPaymentSummary,
  computeTripPaymentSummary
} = require('../services/calculations');

// Relations needed to render a full trip (detail + create/update responses).
const FULL_TRIP_INCLUDE = {
  transporter: true,
  vehicle: true,
  route: true,
  createdBy: true,
  drivers: { include: { driver: true } },
  expenses: { orderBy: { createdAt: 'desc' } },
  payments: { orderBy: { createdAt: 'desc' } },
  ledgerEntries: { orderBy: { createdAt: 'desc' } }
};

const tripCreateSchema = z.object({
  transporterId: z.string().cuid(),
  vehicleId: z.string().cuid(),
  routeId: z.string().cuid().optional().or(z.literal('')),
  driverIds: z.array(z.string().cuid()).optional(),
  driverRoles: z.array(z.enum(['PRIMARY', 'SECONDARY', 'HELPER'])).optional(),
  material: z.string().optional(),
  weightTons: z.coerce.number().default(0),
  freightAmount: z.coerce.number().optional(),
  freightPerTon: z.coerce.number().optional(),
  loadingDate: z.string().datetime().optional(),
  departureDate: z.string().datetime().optional(),
  deliveryDate: z.string().datetime().optional(),
  internalRef: z.string().optional(),
  lrNumber: z.string().optional(),
  notes: z.string().optional()
});

const tripUpdateSchema = z.object({
  transporterId: z.string().cuid().optional(),
  vehicleId: z.string().cuid().optional(),
  routeId: z.string().cuid().optional().or(z.literal('')),
  driverIds: z.array(z.string().cuid()).optional(),
  driverRoles: z.array(z.enum(['PRIMARY', 'SECONDARY', 'HELPER'])).optional(),
  material: z.string().optional(),
  weightTons: z.coerce.number().default(0),
  freightAmount: z.coerce.number().optional(),
  freightPerTon: z.coerce.number().optional(),
  loadingDate: z.string().datetime().optional(),
  departureDate: z.string().datetime().optional(),
  internalRef: z.string().optional(),
  lrNumber: z.string().optional(),
  notes: z.string().optional()
});

const expenseSchema = z.object({
  category: z.enum(['FUEL', 'TOLL', 'FOOD', 'LOADING_UNLOADING', 'REPAIR_EN_ROUTE', 'EMERGENCY', 'DAILY_EXPENSE', 'OTHER']),
  amount: z.coerce.number().positive(),
  description: z.string().optional(),
  paidToDriverId: z.string().cuid().optional().or(z.literal(''))
});

const podSchema = z.object({
  podImageUrl: z.string().url().optional().or(z.literal('')),
  podNotes: z.string().optional(),
  podReceivedDate: z.string().datetime().optional()
});

// Valid trip-status transitions. Empty array = final state.
const STATUS_TRANSITIONS = {
  DRAFT: ['LOADING', 'CANCELLED'],
  LOADING: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['POD_RECEIVED', 'CANCELLED'],
  POD_RECEIVED: ['BILLED', 'CANCELLED'],
  BILLED: ['SETTLED', 'CANCELLED'],
  SETTLED: [],
  CANCELLED: []
};

// When a trip is delivered, accrue each driver's daily expense across the trip's
// duration as a DAILY_EXPENSE trip expense.
async function createDailyExpensesForTrip(prisma, tripId) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { drivers: { include: { driver: true } } }
  });

  if (!trip || !trip.departureDate || !trip.deliveryDate) return;

  const startDate = new Date(trip.departureDate);
  const endDate = new Date(trip.deliveryDate);
  const diffTime = Math.abs(endDate - startDate);
  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive

  for (const td of trip.drivers) {
    const driver = td.driver;
    if (!driver || !driver.dailyExpenseRate || driver.dailyExpenseRate <= 0) continue;

    const amount = driver.dailyExpenseRate * days;
    const description = 'Daily expense: ' + days + ' days x ' + driver.dailyExpenseRate + '/day';

    await prisma.tripExpense.create({
      data: {
        tripId: trip.id,
        category: 'DAILY_EXPENSE',
        amount,
        description,
        paidToDriverId: driver.id
      }
    });
  }
}

// Replace a trip's driver assignments with the given driverIds/roles.
async function syncTripDrivers(prisma, tripId, driverIds, driverRoles) {
  await prisma.tripDriver.deleteMany({ where: { tripId } });
  if (driverIds.length === 0) return;
  await Promise.all(
    driverIds.map((driverId, index) =>
      prisma.tripDriver.create({
        data: { tripId, driverId, role: (driverRoles && driverRoles[index]) || 'PRIMARY' }
      })
    )
  );
}

module.exports = function tripRoutes(ctx) {
  const { prisma, getOrganization, getSystemUser } = ctx;
  const router = express.Router();

  router.get('/trips', asyncHandler(async (req, res) => {
    const take = parseLimit(req.query.limit, 100, 500);
    const skip = parseOffset(req.query.offset);

    const trips = await prisma.trip.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: {
        transporter: true,
        vehicle: true,
        route: true,
        createdBy: true,
        drivers: { include: { driver: true } },
        expenses: true,
        payments: true,
        ledgerEntries: true
      }
    });

    // Summary is derived from the expenses/payments/ledgerEntries already
    // included above, so compute it in-memory — no extra query per trip.
    const enrichedTrips = trips.map((trip) => ({
      ...trip,
      financialSummary: computeTripPaymentSummary(trip)
    }));

    res.json(enrichedTrips);
  }));

  router.put('/trips/:tripId', asyncHandler(async (req, res) => {
    const payload = tripUpdateSchema.parse(req.body);

    // Validate referenced entities
    if (payload.transporterId) {
      const transporter = await prisma.transporter.findUnique({ where: { id: payload.transporterId } });
      if (!transporter) return res.status(400).json({ message: 'Invalid transporter' });
    }
    if (payload.vehicleId) {
      const vehicle = await prisma.vehicle.findUnique({ where: { id: payload.vehicleId } });
      if (!vehicle) return res.status(400).json({ message: 'Invalid vehicle' });
    }
    if (payload.routeId) {
      const route = await prisma.route.findUnique({ where: { id: payload.routeId } });
      if (!route) return res.status(400).json({ message: 'Invalid route' });
    }

    if (payload.driverIds) {
      await syncTripDrivers(prisma, req.params.tripId, payload.driverIds, payload.driverRoles);
    }

    const freightAmount = calculateFreightAmount(payload);

    await prisma.trip.update({
      where: { id: req.params.tripId },
      data: {
        transporterId: payload.transporterId,
        vehicleId: payload.vehicleId,
        routeId: payload.routeId || null,
        material: payload.material,
        weightTons: payload.weightTons,
        freightAmount,
        freightPerTon: payload.freightPerTon ?? null,
        internalRef: payload.internalRef,
        lrNumber: payload.lrNumber ?? null,
        notes: payload.notes,
        ...(payload.loadingDate !== undefined && { loadingDate: payload.loadingDate ? new Date(payload.loadingDate) : null }),
        ...(payload.departureDate !== undefined && { departureDate: payload.departureDate ? new Date(payload.departureDate) : null }),
        ...(payload.deliveryDate !== undefined && { deliveryDate: payload.deliveryDate ? new Date(payload.deliveryDate) : null })
      }
    });

    const fullTrip = await prisma.trip.findUnique({
      where: { id: req.params.tripId },
      include: FULL_TRIP_INCLUDE
    });

    res.json({
      ...fullTrip,
      financialSummary: computeTripPaymentSummary(fullTrip)
    });
  }));

  router.get('/trips/:tripId', asyncHandler(async (req, res) => {
    const trip = await prisma.trip.findUnique({
      where: { id: req.params.tripId },
      include: FULL_TRIP_INCLUDE
    });

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    res.json({
      ...trip,
      financialSummary: computeTripPaymentSummary(trip)
    });
  }));

  // PATCH /trips/:tripId/status — sequential status transition with side effects.
  router.patch('/trips/:tripId/status', asyncHandler(async (req, res) => {
    const { status } = req.body;
    const tripId = req.params.tripId;

    const validStatuses = ['DRAFT', 'LOADING', 'IN_TRANSIT', 'DELIVERED', 'POD_RECEIVED', 'BILLED', 'SETTLED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { transporter: true }
    });

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const currentStatus = trip.status;
    const isAllowed = STATUS_TRANSITIONS[currentStatus] && STATUS_TRANSITIONS[currentStatus].includes(status);
    if (!isAllowed) {
      return res.status(400).json({ message: `Invalid status transition from ${currentStatus} to ${status}` });
    }

    const updatedTrip = await prisma.trip.update({
      where: { id: tripId },
      data: { status }
    });

    if (status === 'DELIVERED' && !trip.deliveryDate) {
      await prisma.trip.update({ where: { id: tripId }, data: { deliveryDate: new Date() } });
    }

    if (status === 'POD_RECEIVED' && !trip.podReceivedDate) {
      await prisma.trip.update({ where: { id: tripId }, data: { podReceivedDate: new Date() } });
    }

    if (status === 'DELIVERED') {
      await createDailyExpensesForTrip(prisma, tripId);
    }

    res.json(updatedTrip);
  }));

  router.post('/trips', asyncHandler(async (req, res) => {
    const payload = tripCreateSchema.parse(req.body);
    const organization = await getOrganization();

    // Auto-generate a unique internal reference if one wasn't supplied.
    let internalRef = payload.internalRef;
    if (!internalRef) {
      const count = await prisma.trip.count({ where: { organizationId: organization.id } });
      internalRef = `TRP-${String(count + 1).padStart(3, '0')}`;

      while (await prisma.trip.findUnique({ where: { organizationId_internalRef: { organizationId: organization.id, internalRef } } })) {
        const nextCount = await prisma.trip.count({ where: { organizationId: organization.id } });
        internalRef = `TRP-${String(nextCount + 1).padStart(3, '0')}`;
      }
    }

    const transporter = await prisma.transporter.findUnique({ where: { id: payload.transporterId } });
    if (!transporter) {
      return res.status(400).json({ message: 'Invalid transporter' });
    }

    const freightAmount = calculateFreightAmount(payload);
    const transportCommission = calculateCommission(transporter, freightAmount, payload.weightTons);
    const freightNet = freightAmount - transportCommission;
    const latestOutstanding = await calculateTransporterOutstanding(prisma, transporter.id);
    const systemUser = await getSystemUser(organization.id);

    const trip = await prisma.trip.create({
      data: {
        organizationId: organization.id,
        transporterId: payload.transporterId,
        vehicleId: payload.vehicleId,
        routeId: payload.routeId || null,
        material: payload.material,
        weightTons: payload.weightTons,
        freightAmount,
        freightPerTon: payload.freightPerTon ?? null,
        internalRef,
        lrNumber: payload.lrNumber ?? null,
        notes: payload.notes,
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        loadingDate: payload.loadingDate ? new Date(payload.loadingDate) : null,
        departureDate: payload.departureDate ? new Date(payload.departureDate) : null,
        deliveryDate: payload.deliveryDate ? new Date(payload.deliveryDate) : null,
        createdById: systemUser.id
      }
    });

    if (payload.driverIds && payload.driverIds.length > 0) {
      await syncTripDrivers(prisma, trip.id, payload.driverIds, payload.driverRoles);
    }

    await prisma.transporterLedgerEntry.create({
      data: {
        transporterId: transporter.id,
        tripId: trip.id,
        freightCredited: freightAmount,
        commissionDeducted: transportCommission,
        netReceivable: freightNet,
        outstandingBefore: latestOutstanding,
        outstandingAfter: latestOutstanding + freightNet
      }
    });

    const fullTrip = await prisma.trip.findUnique({
      where: { id: trip.id },
      include: {
        transporter: true,
        vehicle: true,
        route: true,
        createdBy: true,
        drivers: { include: { driver: true } },
        expenses: true,
        payments: true,
        ledgerEntries: true
      }
    });

    res.status(201).json({
      ...fullTrip,
      financialSummary: computeTripPaymentSummary(fullTrip)
    });
  }));

  router.delete('/trips/:tripId', asyncHandler(async (req, res) => {
    const tripId = req.params.tripId;

    await prisma.tripDriver.deleteMany({ where: { tripId } });
    await prisma.tripExpense.deleteMany({ where: { tripId } });
    await prisma.payment.deleteMany({ where: { tripId } });
    await prisma.transporterLedgerEntry.deleteMany({ where: { tripId } });
    await prisma.document.deleteMany({ where: { entityType: 'TRIP', entityId: tripId } });
    await prisma.trip.delete({ where: { id: tripId } });

    res.status(204).send();
  }));

  router.post('/trips/:tripId/expenses', asyncHandler(async (req, res) => {
    const payload = expenseSchema.parse(req.body);

    const expense = await prisma.tripExpense.create({
      data: {
        tripId: req.params.tripId,
        category: payload.category,
        amount: payload.amount,
        description: payload.description,
        paidToDriverId: payload.paidToDriverId || null
      }
    });

    const summary = await calculateTripPaymentSummary(prisma, req.params.tripId);
    await prisma.trip.update({
      where: { id: req.params.tripId },
      data: { paymentStatus: summary.paymentStatus }
    });

    res.status(201).json(expense);
  }));

  router.post('/trips/:tripId/pod', asyncHandler(async (req, res) => {
    const payload = podSchema.parse(req.body);

    const currentTrip = await prisma.trip.findUnique({ where: { id: req.params.tripId } });
    if (!currentTrip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Only a DELIVERED trip can advance to POD_RECEIVED.
    if (currentTrip.status !== 'DELIVERED') {
      return res.status(400).json({
        message: `Cannot mark POD received: trip must be DELIVERED first (current: ${currentTrip.status})`
      });
    }

    const trip = await prisma.trip.update({
      where: { id: req.params.tripId },
      data: {
        status: 'POD_RECEIVED',
        podReceivedDate: payload.podReceivedDate ? new Date(payload.podReceivedDate) : new Date(),
        podImageUrl: payload.podImageUrl || null,
        podNotes: payload.podNotes || null
      }
    });

    res.json(trip);
  }));

  return router;
};
