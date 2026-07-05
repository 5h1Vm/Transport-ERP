const router = require('express').Router();
const prisma = require('../prismaClient');

router.get('/', async (req, res) => {
  const vehicles = await prisma.vehicle.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(vehicles);
});

router.post('/', async (req, res) => {
  const { orgId, vehicleNumber, capacity, ownershipStatus } = req.body;
  const vehicle = await prisma.vehicle.create({ data: { orgId, vehicleNumber, capacity: parseFloat(capacity), ownershipStatus } });
  res.status(201).json(vehicle);
});

module.exports = router;
