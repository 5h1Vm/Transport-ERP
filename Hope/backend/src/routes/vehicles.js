const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../middleware/asyncHandler');
const { parseLimit, parseOffset } = require('../utils/pagination');

const vehicleSchema = z.object({
  vehicleNumber: z.string().min(3),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.coerce.number().int().optional(),
  ownershipStatus: z.enum(['OWNED', 'ATTACHED', 'LEASED']).default('OWNED'),
  chassisNumber: z.string().optional(),
  engineNumber: z.string().optional(),
  transporterId: z.string().cuid().optional(),
  notes: z.string().optional()
});

module.exports = function vehicleRoutes(ctx) {
  const { prisma, getOrganization } = ctx;
  const router = express.Router();

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
    const payload = vehicleSchema.parse(req.body);
    const vehicle = await prisma.vehicle.update({
      where: { id: req.params.vehicleId },
      data: payload
    });
    res.json(vehicle);
  }));

  router.post('/vehicles', asyncHandler(async (req, res) => {
    const payload = vehicleSchema.parse(req.body);
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

  return router;
};
