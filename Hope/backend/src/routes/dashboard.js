const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { calculateTransporterOutstandingBulk, toNumber } = require('../services/calculations');
const { money, add, toRupees, sumBy } = require('../utils/money');

/**
 * Dashboard summary: headline metrics, recent/pending trips, transporter
 * balances, and payment totals for today and the current month.
 */
module.exports = function dashboardRoutes(ctx) {
  const { prisma } = ctx;
  const router = express.Router();

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
          drivers: { include: { driver: true } },
          // Sprint 2B multi-stop loads bill freight outside freightAmount —
          // folded into displayFreightTotal below so this card doesn't show
          // a stale, load-less figure (see routes/trips.js for the same fix
          // on the main trips list).
          loads: { select: { freightAmount: true } }
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

    const recentTripsSlim = recentTrips.map(({ loads, ...trip }) => ({
      ...trip,
      displayFreightTotal: toRupees(add(money(trip.freightAmount), money(sumBy(loads, (l) => l.freightAmount))))
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
      recentTrips: recentTripsSlim,
      pendingPodTrips,
      transporterBalances,
      paymentTotals: {
        today: toNumber(paymentsToday._sum.amount),
        month: toNumber(paymentsMonth._sum.amount)
      }
    });
  }));

  return router;
};
