const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../middleware/asyncHandler');
const { parseLimit, parseOffset } = require('../utils/pagination');
const { Prisma, CommissionType } = require('@prisma/client');
const { money, add, sub, mul, toRupees, sumBy } = require('../utils/money');
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
  ledgerEntries: { orderBy: { createdAt: 'desc' } },
  // Sprint 2B: empty for legacy single-leg trips, so the response shape is
  // unchanged for them (two empty arrays); populated only for multi-stop trips.
  stops: { orderBy: { sequence: 'asc' } },
  loads: {
    orderBy: { createdAt: 'asc' },
    include: {
      transporter: true,
      originStop: true,
      destinationStop: true,
      payments: { orderBy: { createdAt: 'desc' } }
    }
  },
  pods: { orderBy: { receivedDate: 'desc' }, include: { stop: true } }
};

/**
 * Sprint 2B: per-load billing for a multi-stop trip. Returns [] for legacy
 * single-leg trips (no loads), so callers can attach it unconditionally.
 * Each load's outstanding = (freight − commission) − payments linked to it.
 * @param {Object} trip - a trip loaded with FULL_TRIP_INCLUDE
 * @returns {Array<Object>}
 */
function computeLoadSummaries(trip) {
  if (!trip || !Array.isArray(trip.loads) || trip.loads.length === 0) return [];
  return trip.loads.map(load => {
    const freight = money(load.freightAmount);
    const commission = money(
      calculateCommission(load.commissionType, load.commissionValue, load.freightAmount, load.weightTons)
    );
    const netReceivable = sub(freight, commission);
    const paid = (load.payments || []).reduce((acc, p) => add(acc, money(p.amount)), money(0));
    const outstanding = sub(netReceivable, paid);
    return {
      loadId: load.id,
      transporterId: load.transporterId,
      transporterName: load.transporter ? load.transporter.firmName : null,
      originStop: load.originStop ? load.originStop.location : null,
      destinationStop: load.destinationStop ? load.destinationStop.location : null,
      weightTons: Number(load.weightTons),
      freight: toRupees(freight),
      commission: toRupees(commission),
      netReceivable: toRupees(netReceivable),
      paid: toRupees(paid),
      outstanding: toRupees(outstanding)
    };
  });
}

// Sprint 2B (multi-stop): optional stops + per-transporter loads. Loads point
// at stops by array index (the client doesn't yet know the generated stop ids).
// When `loads` is present and non-empty the trip is multi-stop; otherwise the
// trip is a plain single-leg trip and these fields are simply absent.
const tripStopInputSchema = z.object({
  location: z.string().min(1),
  arrivalDate: z.string().datetime().optional().or(z.literal(''))
});

const tripLoadInputSchema = z.object({
  originIndex: z.coerce.number().int().min(0),
  destinationIndex: z.coerce.number().int().min(0),
  transporterId: z.string().cuid(),
  weightTons: z.coerce.number().default(0),
  freightAmount: z.coerce.number().default(0),
  freightPerTon: z.coerce.number().optional(),
  commissionType: z.nativeEnum(CommissionType),
  commissionValue: z.coerce.number().default(0),
  notes: z.string().optional()
});

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
  commissionType: z.nativeEnum(CommissionType),
  commissionValue: z.coerce.number(),
  loadingDate: z.string().datetime().optional(),
  departureDate: z.string().datetime().optional(),
  deliveryDate: z.string().datetime().optional(),
  internalRef: z.string().optional(),
  lrNumber: z.string().optional(),
  notes: z.string().optional(),
  stops: z.array(tripStopInputSchema).optional(),
  loads: z.array(tripLoadInputSchema).optional()
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
  commissionType: z.nativeEnum(CommissionType),
  commissionValue: z.coerce.number(),
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

// Sprint 2B follow-up: grow an ongoing trip one stop / one load / one POD at a
// time from its detail page, instead of ending the trip and starting a new one.
const addStopSchema = z.object({
  location: z.string().min(1),
  arrivalDate: z.string().datetime().optional().or(z.literal(''))
});

const addLoadSchema = z.object({
  originStopId: z.string().cuid(),
  destinationStopId: z.string().cuid(),
  transporterId: z.string().cuid(),
  weightTons: z.coerce.number().default(0),
  freightAmount: z.coerce.number().default(0),
  freightPerTon: z.coerce.number().optional(),
  commissionType: z.nativeEnum(CommissionType),
  commissionValue: z.coerce.number().default(0),
  notes: z.string().optional()
});

const addPodSchema = z.object({
  stopId: z.string().cuid().optional().or(z.literal('')),
  location: z.string().optional(),
  note: z.string().optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  receivedDate: z.string().datetime().optional()
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

  // Slim, filterable, paginated list. Detail views use GET /trips/:tripId for
  // the full record — this endpoint returns only what list cards need, so the
  // payload stays small no matter how many payments/expenses a trip has.
  router.get('/trips', asyncHandler(async (req, res) => {
    const take = parseLimit(req.query.limit, 50, 200);
    const skip = parseOffset(req.query.offset);
    const { transporterId, vehicleId, routeId, driverId, status, search, fromDate, toDate } = req.query;

    const where = {};
    if (transporterId) where.transporterId = transporterId;
    if (vehicleId) where.vehicleId = vehicleId;
    if (routeId) where.routeId = routeId;
    if (status) where.status = status;
    if (driverId) where.drivers = { some: { driverId } };
    if (search) {
      where.OR = [
        { internalRef: { contains: search, mode: 'insensitive' } },
        { lrNumber: { contains: search, mode: 'insensitive' } }
      ];
    }
    if (fromDate || toDate) {
      where.tripDate = {};
      if (fromDate) where.tripDate.gte = new Date(fromDate);
      if (toDate) where.tripDate.lte = new Date(toDate);
    }

    const trips = await prisma.trip.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: {
        transporter: { select: { id: true, firmName: true } },
        vehicle: { select: { id: true, vehicleNumber: true } },
        route: { select: { id: true, origin: true, destination: true } },
        drivers: { select: { role: true, driver: { select: { id: true, name: true } } } },
        // Amount-only relations feed the summary and are stripped before sending.
        expenses: { select: { amount: true } },
        payments: { select: { amount: true } },
        ledgerEntries: { select: { netReceivable: true } },
        // Sprint 2B multi-stop loads bill their own freight outside
        // freightAmount — folded into displayFreightTotal below so list/card
        // views (Dashboard, Trips list, driver/route/vehicle detail) don't
        // show a stale, load-less figure for hybrid or multi-stop trips.
        loads: { select: { freightAmount: true } }
      }
    });

    const slim = trips.map((trip) => {
      const { expenses, payments, ledgerEntries, loads, ...rest } = trip;
      const loadsFreightTotal = sumBy(loads, (l) => l.freightAmount);
      return {
        ...rest,
        paymentCount: payments.length,
        financialSummary: computeTripPaymentSummary(trip),
        displayFreightTotal: toRupees(add(money(trip.freightAmount), money(loadsFreightTotal)))
      };
    });

    res.json(slim);
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
    if (payload.lrNumber) {
      const existing = await prisma.trip.findFirst({
        where: { lrNumber: payload.lrNumber, id: { not: req.params.tripId } }
      });
      if (existing) return res.status(400).json({ message: `LR number '${payload.lrNumber}' is already used by trip ${existing.internalRef || existing.id}` });
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
        commissionType: payload.commissionType,
        commissionValue: payload.commissionValue,
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
      financialSummary: computeTripPaymentSummary(trip),
      loadSummaries: computeLoadSummaries(trip)
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

    // A trip can only be marked Settled once it is actually fully paid — this
    // is also enforced automatically by the payment route, but the manual
    // status-advance path (the stepper buttons) had no such check, allowing a
    // trip to show "Settled" while still carrying an outstanding balance.
    if (status === 'SETTLED') {
      const summary = await calculateTripPaymentSummary(prisma, tripId);
      if (summary && summary.outstanding > 0) {
        return res.status(400).json({
          message: `Cannot mark as Settled — ₹${summary.outstanding} is still outstanding. Record the remaining payment first.`
        });
      }
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

    if (payload.lrNumber) {
      const existing = await prisma.trip.findFirst({
        where: { lrNumber: payload.lrNumber }
      });
      if (existing) return res.status(400).json({ message: `LR number '${payload.lrNumber}' is already used by trip ${existing.internalRef || existing.id}` });
    }

    // Sprint 2B: a trip is multi-stop when it carries loads. Validate the
    // stop/load graph up front so we never create a half-formed trip.
    const isMultiStop = Array.isArray(payload.loads) && payload.loads.length > 0;
    const stopsInput = payload.stops || [];
    if (isMultiStop) {
      if (stopsInput.length < 2) {
        return res.status(400).json({ message: 'A multi-stop trip needs at least 2 stops.' });
      }
      for (const load of payload.loads) {
        if (load.originIndex >= stopsInput.length || load.destinationIndex >= stopsInput.length) {
          return res.status(400).json({ message: 'A load references a stop that does not exist.' });
        }
        if (load.originIndex === load.destinationIndex) {
          return res.status(400).json({ message: "A load's origin and destination stops must be different." });
        }
      }
      const loadTransporterIds = [...new Set(payload.loads.map(l => l.transporterId))];
      const found = await prisma.transporter.findMany({ where: { id: { in: loadTransporterIds } }, select: { id: true } });
      if (found.length !== loadTransporterIds.length) {
        return res.status(400).json({ message: 'A load references an invalid transporter.' });
      }
    }

    const freightAmount = calculateFreightAmount(payload);
    const transportCommission = calculateCommission(payload.commissionType, payload.commissionValue, freightAmount, payload.weightTons);
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
        commissionType: payload.commissionType,
        commissionValue: payload.commissionValue,
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

    if (isMultiStop) {
      // Multi-stop trips bill through their loads, not a single
      // TransporterLedgerEntry — deliberately skip the legacy ledger row so
      // the trip's nominal top-level transporterId adds nothing to anyone's
      // receivable. Receivable comes entirely from the TripLoads below.
      const stopIds = [];
      for (let i = 0; i < stopsInput.length; i++) {
        const s = stopsInput[i];
        const created = await prisma.tripStop.create({
          data: {
            tripId: trip.id,
            sequence: i,
            location: s.location,
            arrivalDate: s.arrivalDate ? new Date(s.arrivalDate) : null
          }
        });
        stopIds.push(created.id);
      }
      for (const load of payload.loads) {
        const loadFreight = calculateFreightAmount(load);
        await prisma.tripLoad.create({
          data: {
            tripId: trip.id,
            originStopId: stopIds[load.originIndex],
            destinationStopId: stopIds[load.destinationIndex],
            transporterId: load.transporterId,
            weightTons: load.weightTons,
            freightAmount: loadFreight,
            freightPerTon: load.freightPerTon ?? null,
            commissionType: load.commissionType,
            commissionValue: load.commissionValue,
            notes: load.notes
          }
        });
      }
    } else {
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
    }

    const fullTrip = await prisma.trip.findUnique({
      where: { id: trip.id },
      include: FULL_TRIP_INCLUDE
    });

    res.status(201).json({
      ...fullTrip,
      financialSummary: computeTripPaymentSummary(fullTrip),
      loadSummaries: computeLoadSummaries(fullTrip)
    });
  }));

  router.delete('/trips/:tripId', asyncHandler(async (req, res) => {
    const tripId = req.params.tripId;

    // Fetch the trip to check its status and payment status
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { payments: true }
    });

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Block deletion if trip is BILLED or SETTLED
    if (trip.status === 'BILLED' || trip.status === 'SETTLED') {
      return res.status(400).json({
        message: `Cannot delete trip with status '${trip.status}'. Only DRAFT, LOADING, IN_TRANSIT, DELIVERED, or CANCELLED trips can be deleted.`
      });
    }

    // Block deletion if trip has any payments
    if (trip.payments && trip.payments.length > 0) {
      return res.status(400).json({
        message: 'Cannot delete trip that has payments recorded. Remove all payments first.'
      });
    }

    // Only allow deletion for DRAFT, LOADING, IN_TRANSIT, DELIVERED, CANCELLED trips with no payments
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

  router.delete('/trips/expenses/:expenseId', asyncHandler(async (req, res) => {
    const expense = await prisma.tripExpense.findUnique({ where: { id: req.params.expenseId } });
    if (!expense) return res.status(404).json({ message: 'Expense not found' });

    await prisma.tripExpense.delete({ where: { id: req.params.expenseId } });

    // Recalculate trip payment summary after expense deletion
    const summary = await calculateTripPaymentSummary(prisma, expense.tripId);
    await prisma.trip.update({
      where: { id: expense.tripId },
      data: { paymentStatus: summary.paymentStatus }
    });

    res.status(204).send();
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

  // ── Sprint 2B follow-up: incrementally extend an ongoing trip ──────────

  const assertTripEditable = async (tripId, res) => {
    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true, status: true } });
    if (!trip) { res.status(404).json({ message: 'Trip not found' }); return null; }
    if (trip.status === 'CANCELLED' || trip.status === 'SETTLED') {
      res.status(400).json({ message: `Cannot change a ${trip.status.toLowerCase()} trip.` });
      return null;
    }
    return trip;
  };

  // Append a stop to the journey. Sequence continues after the last stop, so
  // "send the truck to the next place" is one call — the trip is never ended.
  router.post('/trips/:tripId/stops', asyncHandler(async (req, res) => {
    const payload = addStopSchema.parse(req.body);
    if (!(await assertTripEditable(req.params.tripId, res))) return;

    const last = await prisma.tripStop.findFirst({
      where: { tripId: req.params.tripId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true }
    });
    const stop = await prisma.tripStop.create({
      data: {
        tripId: req.params.tripId,
        sequence: last ? last.sequence + 1 : 0,
        location: payload.location,
        arrivalDate: payload.arrivalDate ? new Date(payload.arrivalDate) : null
      }
    });
    res.status(201).json(stop);
  }));

  // Add a load (a pickup→drop leg billed to a transporter) to an existing trip.
  // Works on a plain single-leg trip too — its own freight stays as-is and the
  // new load's receivable is simply added on top (see calculateTransporter…).
  router.post('/trips/:tripId/loads', asyncHandler(async (req, res) => {
    const payload = addLoadSchema.parse(req.body);
    if (!(await assertTripEditable(req.params.tripId, res))) return;

    if (payload.originStopId === payload.destinationStopId) {
      return res.status(400).json({ message: "A load's origin and destination stops must be different." });
    }
    const stops = await prisma.tripStop.findMany({
      where: { id: { in: [payload.originStopId, payload.destinationStopId] }, tripId: req.params.tripId },
      select: { id: true }
    });
    if (stops.length !== 2) {
      return res.status(400).json({ message: 'Both stops must belong to this trip.' });
    }
    const transporter = await prisma.transporter.findUnique({ where: { id: payload.transporterId }, select: { id: true } });
    if (!transporter) return res.status(400).json({ message: 'Invalid transporter.' });

    const load = await prisma.tripLoad.create({
      data: {
        tripId: req.params.tripId,
        originStopId: payload.originStopId,
        destinationStopId: payload.destinationStopId,
        transporterId: payload.transporterId,
        weightTons: payload.weightTons,
        freightAmount: calculateFreightAmount(payload),
        freightPerTon: payload.freightPerTon ?? null,
        commissionType: payload.commissionType,
        commissionValue: payload.commissionValue,
        notes: payload.notes
      }
    });
    res.status(201).json(load);
  }));

  // Add another proof-of-delivery. Independent of the legacy single-POD flow —
  // a multi-drop journey records one per delivered stop.
  router.post('/trips/:tripId/pods', asyncHandler(async (req, res) => {
    const payload = addPodSchema.parse(req.body);
    if (!(await assertTripEditable(req.params.tripId, res))) return;

    if (payload.stopId) {
      const stop = await prisma.tripStop.findFirst({ where: { id: payload.stopId, tripId: req.params.tripId }, select: { id: true } });
      if (!stop) return res.status(400).json({ message: 'That stop does not belong to this trip.' });
    }
    const pod = await prisma.tripPod.create({
      data: {
        tripId: req.params.tripId,
        stopId: payload.stopId || null,
        location: payload.location || null,
        note: payload.note || null,
        imageUrl: payload.imageUrl || null,
        receivedDate: payload.receivedDate ? new Date(payload.receivedDate) : new Date()
      }
    });
    res.status(201).json(pod);
  }));

  return router;
};
