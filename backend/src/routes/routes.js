const router = require('express').Router();
const prisma = require('../prismaClient');

router.get('/', async (req, res) => {
  const routes = await prisma.route.findMany({ orderBy: { origin: 'asc' } });
  res.json(routes);
});

router.post('/', async (req, res) => {
  const { orgId, origin, destination } = req.body;
  const route = await prisma.route.create({ data: { orgId, origin, destination } });
  res.status(201).json(route);
});

module.exports = router;
