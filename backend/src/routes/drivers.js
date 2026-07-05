const router = require('express').Router();
const prisma = require('../prismaClient');

router.get('/', async (req, res) => {
  const drivers = await prisma.driver.findMany({ orderBy: { name: 'asc' } });
  res.json(drivers);
});

router.post('/', async (req, res) => {
  const { orgId, name, licenseNumber, mobileNumber } = req.body;
  const driver = await prisma.driver.create({ data: { orgId, name, licenseNumber, mobileNumber } });
  res.status(201).json(driver);
});

module.exports = router;
