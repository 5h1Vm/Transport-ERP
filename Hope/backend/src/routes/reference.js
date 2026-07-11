const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');

/**
 * Reference data for form selects/dropdowns: the organization plus its
 * transporters, vehicles, drivers, and routes in one payload.
 */
module.exports = function referenceRoutes(ctx) {
  const { prisma } = ctx;
  const router = express.Router();

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

  return router;
};
