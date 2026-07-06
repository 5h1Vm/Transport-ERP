const express = require('express');
const { z } = require('zod');
const {
  calculateCommission,
  calculateFreightAmount,
  calculateTransporterOutstanding,
  calculateTripPaymentSummary,
  sumBy,
  toNumber
} = require('./services/calculations');

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
      prisma.vehicle.findMany({ where: { organizationId: organization.id }, orderBy: { createdAt: 'asc' } }),
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
        where: { paymentDate: { gte: startOfDay } },
        _sum: { amount: true }
      }),
      prisma.payment.aggregate({
        where: { paymentDate: { gte: startOfMonth } },
        _sum: { amount: true }
      }),
      prisma.transporter.findMany({ where: { organizationId: organization.id }, orderBy: { firmName: 'asc' } })
    ]);

    const transporterBalances = [];
    for (const transporter of transporters) {
      const outstanding = await calculateTransporterOutstanding(prisma, transporter.id);
      transporterBalances.push({
        id: transporter.id,
        name: transporter.firmName,
        outstanding
      });
    }

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
    const items = await prisma.transporter.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        trips: { orderBy: { createdAt: 'desc' }, take: 5 },
        payments: { orderBy: { paymentDate: 'desc' }, take: 5 }
      }
    });

    const result = [];
    for (const transporter of items) {
      result.push({
        ...transporter,
        outstanding: await calculateTransporterOutstanding(prisma, transporter.id)
      });
    }

    res.json(result);
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
      include: { trips: { orderBy: { createdAt: 'desc' }, take: 3 } }
    });
    res.json(vehicles);
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
    const drivers = await prisma.driver.findMany({
      orderBy: { createdAt: 'desc' },
      include: { settlements: { orderBy: { createdAt: 'desc' }, take: 5 } }
    });

    const result = drivers.map((driver) => ({
      ...driver,
      settlementTotal: sumBy(driver.settlements, (settlement) => settlement.amount)
    }));

    res.json(result);
  }));

  router.post('/drivers', asyncHandler(async (req, res) => {
    const payload = z.object({
      name: z.string().min(2),
      phone: z.string().optional(),
      licenseNumber: z.string().optional(),
      licenseExpiry: z.string().datetime().optional(),
      monthlySalary: z.coerce.number().default(0),
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
    const routes = await prisma.route.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(routes);
  }));

  router.post('/routes', asyncHandler(async (req, res) => {
    const payload = z.object({
      origin: z.string().min(2),
      destination: z.string().min(2),
      distanceKm: z.coerce.number().optional(),
      isActive: z.coerce.boolean().default(true)
    }).parse(req.body);

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
    const trips = await prisma.trip.findMany({
      orderBy: { createdAt: 'desc' },
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

    const enrichedTrips = [];
    for (const trip of trips) {
      const summary = await calculateTripPaymentSummary(prisma, trip.id);
      enrichedTrips.push({ ...trip, financialSummary: summary });
    }

    res.json(enrichedTrips);
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
      financialSummary: await calculateTripPaymentSummary(prisma, trip.id)
    });
  }));

  router.post('/trips', asyncHandler(async (req, res) => {
    const payload = z.object({
      transporterId: z.string().cuid(),
      vehicleId: z.string().cuid(),
      routeId: z.string().cuid().optional().or(z.literal('')),
      driverId: z.string().cuid().optional().or(z.literal('')),
      material: z.string().optional(),
      weightTons: z.coerce.number().default(0),
      freightAmount: z.coerce.number().optional(),
      freightPerTon: z.coerce.number().optional(),
      loadingDate: z.string().datetime().optional(),
      departureDate: z.string().datetime().optional(),
      internalRef: z.string().optional(),
      notes: z.string().optional()
    }).parse(req.body);

    const organization = await getOrganization();
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
        internalRef: payload.internalRef,
        notes: payload.notes,
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        loadingDate: payload.loadingDate ? new Date(payload.loadingDate) : null,
        departureDate: payload.departureDate ? new Date(payload.departureDate) : null,
        createdById: (await getSystemUser(organization.id)).id
      }
    });

    if (payload.driverId) {
      await prisma.tripDriver.create({
        data: {
          tripId: trip.id,
          driverId: payload.driverId,
          role: 'PRIMARY'
        }
      });
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

    res.status(201).json({
      tripId: trip.id,
      freightAmount,
      commissionDeducted: transportCommission,
      netReceivable: freightNet
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
      category: z.enum(['FUEL', 'TOLL', 'FOOD', 'LOADING_UNLOADING', 'REPAIR_EN_ROUTE', 'EMERGENCY', 'OTHER']),
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

    res.json(trip);
  }));

  router.post('/trips/:tripId/pod', asyncHandler(async (req, res) => {
    const payload = z.object({
      podImageUrl: z.string().url().optional().or(z.literal('')),
      podNotes: z.string().optional(),
      podReceivedDate: z.string().datetime().optional()
    }).parse(req.body);

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

  router.post('/payments', asyncHandler(async (req, res) => {
    const payload = z.object({
      transporterId: z.string().cuid(),
      tripId: z.string().cuid().optional().or(z.literal('')),
      amount: z.coerce.number().positive(),
      mode: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE']),
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
      await prisma.trip.update({
        where: { id: payload.tripId },
        data: {
          paymentStatus: summary.paymentStatus,
          status: summary.outstanding <= 0 ? 'SETTLED' : 'BILLED'
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
    res.status(500).json({
      message: error.message || 'Internal server error'
    });
  });

  return router;
}

module.exports = {
  createRoutes
};