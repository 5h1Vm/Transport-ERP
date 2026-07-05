const router = require('express').Router();
const prisma = require('../prismaClient');

router.get('/', async (req, res) => {
  const parties = await prisma.party.findMany({ orderBy: { partyName: 'asc' } });
  res.json(parties);
});

router.post('/', async (req, res) => {
  const { orgId, partyName, gstNumber, mobileNumber } = req.body;
  const party = await prisma.party.create({ data: { orgId, partyName, gstNumber, mobileNumber } });
  res.status(201).json(party);
});

module.exports = router;
