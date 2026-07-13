const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../middleware/asyncHandler');
const { parseLimit, parseOffset } = require('../utils/pagination');

const routeUpdateSchema = z.object({
  origin: z.string().min(2),
  destination: z.string().min(2),
  distanceKm: z.coerce.number().optional(),
  isActive: z.coerce.boolean().default(true)
});

const routeCreateSchema = z.object({
  origin: z.string().min(2),
  destination: z.string().min(2),
  distanceKm: z.coerce.number().nonnegative().optional(),
  isActive: z.coerce.boolean().default(true)
});

module.exports = function routeMasterRoutes(ctx) {
  const { prisma, getOrganization } = ctx;
  const router = express.Router();

  router.get('/routes', asyncHandler(async (req, res) => {
    const items = await prisma.route.findMany({
      orderBy: { createdAt: 'desc' },
      take: parseLimit(req.query.limit, 200, 500),
      skip: parseOffset(req.query.offset),
      include: { _count: { select: { trips: true } } }
    });
    const result = items.map(({ _count, ...route }) => ({
      ...route,
      tripCount: _count.trips
    }));
    res.json(result);
  }));

  router.get('/routes/:routeId', asyncHandler(async (req, res) => {
    const route = await prisma.route.findUnique({ where: { id: req.params.routeId }, include: { _count: { select: { trips: true } } } });

    if (!route) {
      return res.status(404).json({ message: 'Route not found' });
    }

    res.json(route);
  }));

  router.put('/routes/:routeId', asyncHandler(async (req, res) => {
    const payload = routeUpdateSchema.parse(req.body);
    const route = await prisma.route.update({
      where: { id: req.params.routeId },
      data: payload
    });
    res.json(route);
  }));

  router.post('/routes', asyncHandler(async (req, res) => {
    const payload = routeCreateSchema.parse(req.body);

    // Origin and destination cannot be the same
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

  return router;
};
