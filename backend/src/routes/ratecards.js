const router = require('express').Router();
const prisma = require('../prismaClient');

// GET /api/ratecards?transporterId=xxx&routeId=yyy
router.get('/', async (req, res) => {
  const { transporterId, routeId } = req.query;
  const where = {};
  if (transporterId) where.transporterId = transporterId;
  if (routeId) where.routeId = routeId;
  const ratecards = await prisma.rateCard.findMany({ where, include: { route: true } });
  res.json(ratecards);
});

router.post('/', async (req, res) => {
  const { transporterId, routeId, ratePerUnit, unit } = req.body;
  const rc = await prisma.rateCard.create({
    data: { transporterId, routeId, ratePerUnit: parseFloat(ratePerUnit), unit: unit || 'tonne' },
  });
  res.status(201).json(rc);
});

module.exports = router;
