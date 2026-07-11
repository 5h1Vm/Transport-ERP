const express = require('express');
const { z } = require('zod');
const {
  calculateCommission,
  calculateFreightAmount,
  calculateTransporterOutstanding,
  calculateTransporterOutstandingBulk,
  calculateTripPaymentSummary,
  computeTripPaymentSummary,
  calculateDriverTripExpenses,
  calculateDriverOutstanding,
  calculateDriverOutstandingBulk,
  sumBy,
  toNumber
} = require('./services/calculations');

// Clamp a client-supplied limit into a safe range so a single request can never
// ask the DB for an unbounded result set.
function parseLimit(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function parseOffset(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function createRoutes(prisma) {
  const router = express.Router();

  async function getOrganization() {
    const existing = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    if (existing) {
      return existing;
    }

    return prisma.organization.create({
      data: {
        name: process.env.ORGANIZATION_NAME || 'Transit Ledger Workspace',
        language: 'en'
      }
    });
  }

  async function getSystemUser(organizationId) {
    const existing = await prisma.user.findFirst({ where: { organizationId }, orderBy: { createdAt: 'asc' } });
    if (existing) {
      return existing;
    }

    return prisma.user.create({
      data: {
        organizationId,
        name: process.env.SYSTEM_USER_NAME || 'Workspace Owner',
        email: process.env.SYSTEM_USER_EMAIL || `owner@${organizationId}.local`,
        phone: null,
        passwordHash: process.env.SYSTEM_USER_PASSWORD_HASH || 'system-placeholder-password',
        role: 'OWNER',
        language: 'en'
      }
    });
  }

  const asyncHandler = (handler) => (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

  const organizationSchema = z.object({
    name: z.string().min(2),
    phone: z.string().optional(),
    language: z.string().optional(),
    address: z.string().optional()
  });

  const masterSchema = z.object({
    organizationId: z.string().cuid().optional(),
    name: z.string().min(2)
  });

  router.get('/health', (req, res) => {
    res.json({ ok: true, service: 'Transit Ledger API' });
  });

  router.get('/reference-data', asyncHandler(async (req, res) => {
    const organization = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });

    if (!organization) {
      return res.json({ organization: null, transporters: [], vehicles: [], drivers: [], routes: [] });
    }

    const [transporters, vehicles, drivers, routes] = await Promise.all([
      prisma.transporter.findMany({ where: { organizationId: organization.id }, orderBy: { createdAt: 'asc' } }),
      prisma.vehicle.findMany({
        where: { organizationId: organization.id },
        orderBy: { createdAt: 'asc' },
        include: { transporter: { select: { id: true, firmName: true } } }
      }),
      prisma.driver.findMany({ where: { organizationId: organization.id }, orderBy: { createdAt: 'asc' } }),
      prisma.route.findMany({ where: { organizationId: organization.id }, orderBy: { createdAt: 'asc' } })
    ]);

    res.json({ organization, transporters, vehicles, drivers, routes });
  }));

  router.get('/dashboard', asyncHandler(async (req, res) => {
    const organization = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });

    if (!organization) {
      return res.json({
        organization: null,
        metrics: [],
        recentTrips: [],
        transporterBalances: [],
        pendingPodTrips: [],
        paymentTotals: { today: 0, month: 0 },
          activeTripCount: 0,
          pendingPodCount: 0
      });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfDay);
    startOfMonth.setDate(1);

    const [transporterCount, vehicleCount, driverCount, tripCount, activeTripCount, pendingPodTrips, recentTrips, paymentsToday, paymentsMonth, transporters] = await Promise.all([
      prisma.transporter.count({ where: { organizationId: organization.id } }),
      prisma.vehicle.count({ where: { organizationId: organization.id } }),
      prisma.driver.count({ where: { organizationId: organization.id } }),
      prisma.trip.count({ where: { organizationId: organization.id } }),
      prisma.trip.count({ where: { organizationId: organization.id, status: { in: ['DRAFT', 'LOADING', 'IN_TRANSIT', 'DELIVERED', 'POD_RECEIVED', 'BILLED'] } } }),
      prisma.trip.findMany({
        where: { organizationId: organization.id, status: { in: ['DELIVERED', 'POD_RECEIVED', 'BILLED'] }, podReceivedDate: null },
        include: { transporter: true, vehicle: true },
        orderBy: { updatedAt: 'desc' },
        take: 5
      }),
      prisma.trip.findMany({
        where: { organizationId: organization.id },
        include: {
          transporter: true,
          vehicle: true,
          route: true,
          drivers: { include: { driver: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      }),
      prisma.payment.aggregate({
        where: {
          paymentDate: { gte: startOfDay },
          transporter: { organizationId: organization.id }
        },
        _sum: { amount: true }
      }),
      prisma.payment.aggregate({
        where: {
          paymentDate: { gte: startOfMonth },
          transporter: { organizationId: organization.id }
        },
        _sum: { amount: true }
      }),
      prisma.transporter.findMany({ where: { organizationId: organization.id }, orderBy: { firmName: 'asc' } })
    ]);

    // Bulk-compute every transporter's outstanding in 2 queries instead of 2 per row.
    const outstandingMap = await calculateTransporterOutstandingBulk(prisma, transporters.map((t) => t.id));
    const transporterBalances = transporters.map((transporter) => ({
      id: transporter.id,
      name: transporter.firmName,
      outstanding: outstandingMap.get(transporter.id) || 0
    }));

    res.json({
      organization,
      metrics: [
        { label: 'Transporters', value: transporterCount },
        { label: 'Vehicles', value: vehicleCount },
        { label: 'Drivers', value: driverCount },
        { label: 'Trips', value: tripCount },
        { label: 'Open Trips', value: activeTripCount }
      ],
      activeTripCount,
      pendingPodCount: pendingPodTrips.length,
      recentTrips,
      pendingPodTrips,
      transporterBalances,
      paymentTotals: {
        today: toNumber(paymentsToday._sum.amount),
        month: toNumber(paymentsMonth._sum.amount)
      }
    });
  }));

  router.get('/transporters', asyncHandler(async (req, res) => {
    const take = parseLimit(req.query.limit, 100, 500);
    const skip = parseOffset(req.query.offset);

    const items = await prisma.transporter.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: {
        trips: { orderBy: { createdAt: 'desc' }, take: 5 },
        payments: { orderBy: { paymentDate: 'desc' }, take: 5 }
      }
    });

    // Bulk-compute outstanding for all transporters in this page (2 queries total).
    const outstandingMap = await calculateTransporterOutstandingBulk(prisma, items.map((t) => t.id));
    const result = items.map((transporter) => ({
      ...transporter,
      outstanding: outstandingMap.get(transporter.id) || 0
    }));

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

    const result = {
      ...transporter,
      outstanding: await calculateTransporterOutstanding(prisma, transporter.id)
    };

    res.json(result);
  }));

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


  router.put('/transporters/:transporterId', asyncHandler(async (req, res) => {
    const payload = z.object({
      firmName: z.string().min(2),
      contactPerson: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional().or(z.literal('')),
      gstin: z.string().optional(),
      pan: z.string().optional(),
      address: z.string().optional(),
      commissionType: z.enum(['PERCENTAGE', 'FIXED_PER_TRIP', 'FIXED_PER_TON']).default('PERCENTAGE'),
      commissionValue: z.coerce.number().default(0),
      isActive: z.coerce.boolean().default(true),
      notes: z.string().optional()
    }).parse(req.body);

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
    const payload = z.object({
      firmName: z.string().min(2),
      contactPerson: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional().or(z.literal('')),
      gstin: z.string().optional(),
      pan: z.string().optional(),
      address: z.string().optional(),
      commissionType: z.enum(['PERCENTAGE', 'FIXED_PER_TRIP', 'FIXED_PER_TON']).default('PERCENTAGE'),
      commissionValue: z.coerce.number().default(0),
      isActive: z.coerce.boolean().default(true),
      notes: z.string().optional()
    }).parse(req.body);

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

  router.get('/vehicles', asyncHandler(async (req, res) => {
    const vehicles = await prisma.vehicle.findMany({
      orderBy: { createdAt: 'desc' },
      take: parseLimit(req.query.limit, 100, 500),
      skip: parseOffset(req.query.offset),
      include: { trips: { orderBy: { createdAt: 'desc' }, take: 3 } }
    });
    res.json(vehicles);
  }));

  router.get('/vehicles/:vehicleId', asyncHandler(async (req, res) => {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.vehicleId },
      include: { trips: { orderBy: { createdAt: 'desc' }, take: 3 } }
    });

    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    res.json(vehicle);
  }));

  router.put('/vehicles/:vehicleId', asyncHandler(async (req, res) => {
    const payload = z.object({
      vehicleNumber: z.string().min(3),
      make: z.string().optional(),
      model: z.string().optional(),
      year: z.coerce.number().int().optional(),
      ownershipStatus: z.enum(['OWNED', 'ATTACHED', 'LEASED']).default('OWNED'),
      chassisNumber: z.string().optional(),
      engineNumber: z.string().optional(),
      transporterId: z.string().cuid().optional(),
      notes: z.string().optional()
    }).parse(req.body);

    const vehicle = await prisma.vehicle.update({
      where: { id: req.params.vehicleId },
      data: payload
    });
    res.json(vehicle);
  }));

  router.post('/vehicles', asyncHandler(async (req, res) => {
    const payload = z.object({
      vehicleNumber: z.string().min(3),
      make: z.string().optional(),
      model: z.string().optional(),
      year: z.coerce.number().int().optional(),
      ownershipStatus: z.enum(['OWNED', 'ATTACHED', 'LEASED']).default('OWNED'),
      chassisNumber: z.string().optional(),
      engineNumber: z.string().optional(),
      transporterId: z.string().cuid().optional(),
      notes: z.string().optional()
    }).parse(req.body);

    const organization = await getOrganization();
    const vehicle = await prisma.vehicle.create({ data: { organizationId: organization.id, ...payload } });
    res.status(201).json(vehicle);
  }));

  router.delete('/vehicles/:vehicleId', asyncHandler(async (req, res) => {
    const vehicleId = req.params.vehicleId;
    const tripCount = await prisma.trip.count({ where: { vehicleId } });

    if (tripCount) {
      return res.status(400).json({ message: 'Delete linked trips first.' });
    }

    await prisma.vehicle.delete({ where: { id: vehicleId } });
    res.status(204).send();
  }));

  router.get('/drivers', asyncHandler(async (req, res) => {
    const take = parseLimit(req.query.limit, 100, 500);
    const skip = parseOffset(req.query.offset);

    const drivers = await prisma.driver.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      skip
    });

    // Bulk-compute outstanding for all drivers in this page (2 queries total).
    const outstandingMap = await calculateDriverOutstandingBulk(prisma, drivers.map((d) => d.id));
    const resultWithOutstanding = drivers.map((driver) => {
      const entry = outstandingMap.get(driver.id) || { outstanding: 0, details: { settlementTotal: 0, tripExpensesPaid: 0, dailyExpenses: 0 } };
      const { outstanding, details } = entry;
      return {
        ...driver,
        settlementTotal: details.settlementTotal + details.tripExpensesPaid + details.dailyExpenses,
        outstandingBalance: outstanding
      };
    });

    res.json(resultWithOutstanding);
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
    const payload = z.object({
      name: z.string().min(2),
      phone: z.string().optional(),
      licenseNumber: z.string().optional(),
      licenseExpiry: z.string().datetime().optional(),
      monthlySalary: z.coerce.number().default(0),
      dailyExpenseRate: z.coerce.number().default(0),
      address: z.string().optional(),
      notes: z.string().optional()
    }).parse(req.body);

    const driver = await prisma.driver.update({
      where: { id: req.params.driverId },
      data: {
        name: payload.name,
        phone: payload.phone,
        licenseNumber: payload.licenseNumber,
        licenseExpiry: payload.licenseExpiry ? new Date(payload.licenseExpiry) : null,
        monthlySalary: payload.monthlySalary,
        dailyExpenseRate: payload.dailyExpenseRate,
        address: payload.address,
        notes: payload.notes
      }
    });

    res.json(driver);
  }));

  router.post('/drivers', asyncHandler(async (req, res) => {
    const payload = z.object({
      name: z.string().min(2),
      phone: z.string().optional(),
      licenseNumber: z.string().optional(),
      licenseExpiry: z.string().datetime().optional(),
      monthlySalary: z.coerce.number().default(0),
      dailyExpenseRate: z.coerce.number().default(0),
      address: z.string().optional(),
      notes: z.string().optional()
    }).parse(req.body);

    const organization = await getOrganization();
    const driver = await prisma.driver.create({
      data: {
        organizationId: organization.id,
        name: payload.name,
        phone: payload.phone,
        licenseNumber: payload.licenseNumber,
        licenseExpiry: payload.licenseExpiry ? new Date(payload.licenseExpiry) : null,
        monthlySalary: payload.monthlySalary,
        dailyExpenseRate: payload.dailyExpenseRate,
        address: payload.address,
        notes: payload.notes
      }
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
    const payload = z.object({
      type: z.enum(['SALARY', 'INCENTIVE', 'ADVANCE', 'DEDUCTION', 'PENALTY', 'CASH_COLLECTED', 'ALLOWANCE']),
      amount: z.coerce.number().positive(),
      tripId: z.string().cuid().optional().or(z.literal('')),
      description: z.string().optional(),
      date: z.string().datetime().optional()
    }).parse(req.body);

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

  router.get('/routes', asyncHandler(async (req, res) => {
    const routes = await prisma.route.findMany({
      orderBy: { createdAt: 'desc' },
      take: parseLimit(req.query.limit, 200, 500),
      skip: parseOffset(req.query.offset)
    });
    res.json(routes);
  }));

  router.get('/routes/:routeId', asyncHandler(async (req, res) => {
    const route = await prisma.route.findUnique({
      where: { id: req.params.routeId }
    });

    if (!route) {
      return res.status(404).json({ message: 'Route not found' });
    }

    res.json(route);
  }));

  router.put('/routes/:routeId', asyncHandler(async (req, res) => {
    const payload = z.object({
      origin: z.string().min(2),
      destination: z.string().min(2),
      distanceKm: z.coerce.number().optional(),
      isActive: z.coerce.boolean().default(true)
    }).parse(req.body);

    const route = await prisma.route.update({
      where: { id: req.params.routeId },
      data: payload
    });
    res.json(route);
  }));

  router.post('/routes', asyncHandler(async (req, res) => {
    const payload = z.object({
      origin: z.string().min(2),
      destination: z.string().min(2),
      distanceKm: z.coerce.number().nonnegative().optional(),
      isActive: z.coerce.boolean().default(true)
    }).parse(req.body);

    // Additional validation: origin and destination cannot be the same
    if (payload.origin.trim().toLowerCase() === payload.destination.trim().toLowerCase()) {
      return res.status(400).json({ message: 'Origin and destination cannot be the same' });
    }

    const organization = await getOrganization();
    const route = await prisma.route.create({ data: { organizationId: organization.id, ...payload } });
    res.status(201).json(route);
  }));

  router.delete('/routes/:routeId', asyncHandler(async (req, res) => {
    const routeId = req.params.routeId;
    const tripCount = await prisma.trip.count({ where: { routeId } });

    if (tripCount) {
      return res.status(400).json({ message: 'Delete linked trips first.' });
    }

    await prisma.route.delete({ where: { id: routeId } });
    res.status(204).send();
  }));

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

    // The summary is derived from expenses/payments/ledgerEntries which are already
    // included above, so compute it in-memory — no extra query per trip.
    const enrichedTrips = trips.map((trip) => ({
      ...trip,
      financialSummary: computeTripPaymentSummary(trip)
    }));

    res.json(enrichedTrips);
  }));

  router.put('/trips/:tripId', asyncHandler(async (req, res) => {
    const payload = z.object({
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
    }).parse(req.body);

    // Check if referenced entities exist
    if (payload.transporterId) {
      const transporter = await prisma.transporter.findUnique({ where: { id: payload.transporterId } });
      if (!transporter) {
        return res.status(400).json({ message: 'Invalid transporter' });
      }
    }

    if (payload.vehicleId) {
      const vehicle = await prisma.vehicle.findUnique({ where: { id: payload.vehicleId } });
      if (!vehicle) {
        return res.status(400).json({ message: 'Invalid vehicle' });
      }
    }

    if (payload.routeId) {
      const route = await prisma.route.findUnique({ where: { id: payload.routeId } });
      if (!route) {
        return res.status(400).json({ message: 'Invalid route' });
      }
    }

    if (payload.driverIds) {
      // Delete existing driver assignments
      await prisma.tripDriver.deleteMany({
        where: { tripId: req.params.tripId }
      });

      // Create new driver assignments
      if (payload.driverIds.length > 0) {
        await Promise.all(
          payload.driverIds.map((driverId, index) =>
            prisma.tripDriver.create({
              data: {
                tripId: req.params.tripId,
                driverId,
                role: payload.driverRoles?.[index] || 'PRIMARY'
              }
            })
          )
        );
      }
    }

    const freightAmount = calculateFreightAmount(payload);
    const transporter = payload.transporterId ? await prisma.transporter.findUnique({ where: { id: payload.transporterId } }) : null;
    const transportCommission = transporter ? calculateCommission(transporter, freightAmount, payload.weightTons) : 0;
    const freightNet = freightAmount - transportCommission;

    const trip = await prisma.trip.update({
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

    // Return full trip with drivers
    const fullTrip = await prisma.trip.findUnique({
      where: { id: trip.id },
      include: {
        transporter: true,
        vehicle: true,
        route: true,
        createdBy: true,
        drivers: { include: { driver: true } },
        expenses: { orderBy: { createdAt: 'desc' } },
        payments: { orderBy: { createdAt: 'desc' } },
        ledgerEntries: { orderBy: { createdAt: 'desc' } }
      }
    });

    res.json({
      ...fullTrip,
      financialSummary: computeTripPaymentSummary(fullTrip)
    });
  }));

  router.get('/trips/:tripId', asyncHandler(async (req, res) => {
    const trip = await prisma.trip.findUnique({
      where: { id: req.params.tripId },
      include: {
        transporter: true,
        vehicle: true,
        route: true,
        createdBy: true,
        drivers: { include: { driver: true } },
        expenses: { orderBy: { createdAt: 'desc' } },
        payments: { orderBy: { createdAt: 'desc' } },
        ledgerEntries: { orderBy: { createdAt: 'desc' } }
      }
    });

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    res.json({
      ...trip,
      financialSummary: computeTripPaymentSummary(trip)
    });
  }));

  // PATCH /trips/:tripid/status - Update trip status with sequential validation
  router.patch('/trips/:tripId/status', asyncHandler(async (req, res) => {
    const { status } = req.body;
    const tripId = req.params.tripId;

    // Validate status
    const validStatuses = ['DRAFT', 'LOADING', 'IN_TRANSIT', 'DELIVERED', 'POD_RECEIVED', 'BILLED', 'SETTLED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        transporter: true
      }
    });

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Define valid transitions
    const transitions = {
      DRAFT: ['LOADING', 'CANCELLED'],
      LOADING: ['IN_TRANSIT', 'CANCELLED'],
      IN_TRANSIT: ['DELIVERED', 'CANCELLED'],
      DELIVERED: ['POD_RECEIVED', 'CANCELLED'],
      POD_RECEIVED: ['BILLED', 'CANCELLED'],
      BILLED: ['SETTLED', 'CANCELLED'],
      SETTLED: [], // Final state
      CANCELLED: [] // Final state
    };

    const currentStatus = trip.status;
    const isAllowed = transitions[currentStatus] && transitions[currentStatus].includes(status);

    if (!isAllowed) {
      return res.status(400).json({
        message: `Invalid status transition from ${currentStatus} to ${status}`
      });
    }

    // Update the trip status
    const updatedTrip = await prisma.trip.update({
      where: { id: tripId },
      data: { status }
    });

    // If status is DELIVERED, set deliveryDate if not set
    if (status === 'DELIVERED' && !trip.deliveryDate) {
      await prisma.trip.update({
        where: { id: tripId },
        data: { deliveryDate: new Date() }
      });
    }

    // If status is POD_RECEIVED, set podReceivedDate if not set
    if (status === 'POD_RECEIVED' && !trip.podReceivedDate) {
      await prisma.trip.update({
        where: { id: tripId },
        data: { podReceivedDate: new Date() }
      });
    }

    // Auto-create daily expenses when trip is marked DELIVERED
    if (status === 'DELIVERED') {
      await createDailyExpensesForTrip(prisma, tripId);
    }

    res.json(updatedTrip);
  }));

  router.post('/trips', asyncHandler(async (req, res) => {
    const payload = z.object({
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
    }).parse(req.body);

    const organization = await getOrganization();

    // Auto-generate internalRef if not provided
    let internalRef = payload.internalRef;
    if (!internalRef) {
      const count = await prisma.trip.count({ where: { organizationId: organization.id } });
      internalRef = `TRP-${String(count + 1).padStart(3, '0')}`;

      // Ensure uniqueness (in case of race condition)
      while (await prisma.trip.findUnique({ where: { organizationId_internalRef: { organizationId: organization.id, internalRef } } })) {
        const count = await prisma.trip.count({ where: { organizationId: organization.id } });
        internalRef = `TRP-${String(count + 1).padStart(3, '0')}`;
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
        createdById: (await getSystemUser(organization.id)).id
      }
    });

    // Handle driver assignment
    if (payload.driverIds && payload.driverIds.length > 0) {
      await Promise.all(
        payload.driverIds.map((driverId, index) =>
          prisma.tripDriver.create({
            data: {
              tripId: trip.id,
              driverId,
              role: payload.driverRoles?.[index] || 'PRIMARY'
            }
          })
        )
      );
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

    // Return full trip with drivers
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
    const payload = z.object({
      category: z.enum(['FUEL', 'TOLL', 'FOOD', 'LOADING_UNLOADING', 'REPAIR_EN_ROUTE', 'EMERGENCY', 'DAILY_EXPENSE', 'OTHER']),
      amount: z.coerce.number().positive(),
      description: z.string().optional(),
      paidToDriverId: z.string().cuid().optional().or(z.literal(''))
    }).parse(req.body);

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

  router.patch('/trips/:tripId/status', asyncHandler(async (req, res) => {
    const payload = z.object({
      status: z.enum(['DRAFT', 'LOADING', 'IN_TRANSIT', 'DELIVERED', 'POD_RECEIVED', 'BILLED', 'SETTLED', 'CANCELLED']),
      podReceivedDate: z.string().datetime().optional(),
      podImageUrl: z.string().url().optional().or(z.literal('')),
      podNotes: z.string().optional(),
      deliveryDate: z.string().datetime().optional(),
      billedDate: z.string().datetime().optional(),
      settledDate: z.string().datetime().optional()
    }).parse(req.body);

    // Get current trip to validate transition
    const currentTrip = await prisma.trip.findUnique({
      where: { id: req.params.tripId }
    });

    if (!currentTrip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Define valid status transitions
    const validTransitions = {
      DRAFT: ['LOADING', 'CANCELLED'],
      LOADING: ['IN_TRANSIT', 'CANCELLED'],
      IN_TRANSIT: ['DELIVERED', 'CANCELLED'],
      DELIVERED: ['POD_RECEIVED', 'CANCELLED'],
      POD_RECEIVED: ['BILLED', 'CANCELLED'],
      BILLED: ['SETTLED', 'CANCELLED'],
      SETTLED: [], // Final state, can only go to CANCELLED
      CANCELLED: [] // Final state
    };

    // Check if transition is valid
    const currentStatus = currentTrip.status;
    const requestedStatus = payload.status;

    if (!validTransitions[currentStatus].includes(requestedStatus) && requestedStatus !== currentStatus) {
      return res.status(400).json({
        message: `Invalid status transition from ${currentStatus} to ${requestedStatus}`
      });
    }

    const data = {
      status: payload.status
    };

    if (payload.status === 'DELIVERED') {
      data.deliveryDate = payload.deliveryDate ? new Date(payload.deliveryDate) : new Date();
    }

    if (payload.status === 'POD_RECEIVED') {
      data.podReceivedDate = payload.podReceivedDate ? new Date(payload.podReceivedDate) : new Date();
      data.podImageUrl = payload.podImageUrl || null;
      data.podNotes = payload.podNotes || null;
    }

    if (payload.status === 'BILLED') {
      data.billedDate = payload.billedDate ? new Date(payload.billedDate) : new Date();
    }

    if (payload.status === 'SETTLED') {
      data.settledDate = payload.settledDate ? new Date(payload.settledDate) : new Date();
      data.paymentStatus = 'PAID';
    }

    const trip = await prisma.trip.update({
      where: { id: req.params.tripId },
      data
    });

    // Auto-create daily expenses when trip is marked DELIVERED
    if (payload.status === 'DELIVERED') {
      await createDailyExpensesForTrip(prisma, req.params.tripId);
    }

    res.json(trip);
  }));

  // Helper function to auto-create daily expenses for a trip
  async function createDailyExpensesForTrip(prisma, tripId) {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        drivers: { include: { driver: true } }
      }
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
      const description = "Daily expense: " + days + " days x " + driver.dailyExpenseRate + "/day";

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

  router.post('/trips/:tripId/pod', asyncHandler(async (req, res) => {
    const payload = z.object({
      podImageUrl: z.string().url().optional().or(z.literal('')),
      podNotes: z.string().optional(),
      podReceivedDate: z.string().datetime().optional()
    }).parse(req.body);

    // Get current trip to validate transition
    const currentTrip = await prisma.trip.findUnique({
      where: { id: req.params.tripId }
    });

    if (!currentTrip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Validate status transition - only DELIVERED can go to POD_RECEIVED
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
    const payload = z.object({
      transporterId: z.string().cuid(),
      tripId: z.string().cuid().optional().or(z.literal('')),
      amount: z.coerce.number().positive(),
      mode: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE']),
      paymentType: z.enum(['ADVANCE', 'DIESEL_ADVANCE', 'PART_PAYMENT', 'FULL_SETTLEMENT', 'OTHER']).default('OTHER'),
      referenceNumber: z.string().optional(),
      bankAccount: z.string().optional(),
      notes: z.string().optional(),
      paymentDate: z.string().datetime().optional()
    }).parse(req.body);

    const organization = await getOrganization();
    const creator = await getSystemUser(organization.id);

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
      // Get current trip to determine if we should auto-advance status to SETTLED
      const currentTrip = await prisma.trip.findUnique({
        where: { id: payload.tripId },
        select: { status: true }
      });

      let statusUpdate = currentTrip ? currentTrip.status : 'DRAFT'; // Default to current status or DRAFT if not found
      // Only auto-advance to SETTLED if trip is BILLED and now fully paid
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

  router.post('/seed', asyncHandler(async (req, res) => {
    const payload = organizationSchema.parse(req.body);
    const organization = await prisma.organization.create({ data: payload });
    res.status(201).json(organization);
  }));

  router.use((error, req, res, next) => {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: 'Validation failed',
        issues: error.issues
      });
    }

    console.error(error);

    // Handle Prisma known error types to avoid leaking internal details
    if (error.code === 'P2002') {
      // Unique constraint violation
      return res.status(400).json({
        message: 'A record with these values already exists. Please check for duplicates.'
      });
    }

    // Handle other known Prisma errors
    if (error.code && error.code.startsWith('P')) {
      return res.status(400).json({
        message: 'Database constraint violation. Please check your input.'
      });
    }

    res.status(500).json({
      message: 'Internal server error'
    });
  });

  return router;
}

module.exports = {
  createRoutes
};