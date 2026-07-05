const router = require('express').Router();
const prisma = require('../prismaClient');

router.get('/', async (req, res) => {
  const transporters = await prisma.transporter.findMany({
    include: { ratecards: { include: { route: true } } },
    orderBy: { firmName: 'asc' },
  });
  res.json(transporters);
});

router.get('/:id', async (req, res) => {
  const t = await prisma.transporter.findUnique({
    where: { id: req.params.id },
    include: { ratecards: { include: { route: true } } },
  });
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json(t);
});

router.post('/', async (req, res) => {
  const data = req.body;
  if (data.commissionValue) data.commissionValue = parseFloat(data.commissionValue);
  const transporter = await prisma.transporter.create({ data });
  res.status(201).json(transporter);
});

module.exports = router;
