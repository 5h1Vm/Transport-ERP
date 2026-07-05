const router  = require('express').Router();
const prisma  = require('../prismaClient');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// File upload setup
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// GET /api/trips
router.get('/', async (req, res) => {
  const trips = await prisma.trip.findMany({
    include: { transporter: true, vehicle: true, driver: true, route: true, party: true },
    orderBy: { tripDate: 'desc' },
  });
  res.json(trips);
});

// GET /api/trips/:id
router.get('/:id', async (req, res) => {
  const trip = await prisma.trip.findUnique({
    where: { id: req.params.id },
    include: { transporter: true, vehicle: true, driver: true, route: true, party: true, ledgerEntry: true },
  });
  if (!trip) return res.status(404).json({ error: 'Not found' });
  res.json(trip);
});

// POST /api/trips — create new trip, auto-calculate freight from rate card
router.post('/', async (req, res) => {
  try {
    const { orgId, transporterId, vehicleId, driverId, routeId, partyId, quantity, paymentMode, notes } = req.body;
    const qty = parseFloat(quantity);

    // Auto-fetch rate card
    const rateCard = await prisma.rateCard.findUnique({
      where: { transporterId_routeId: { transporterId, routeId } },
    });
    const freightTotal = rateCard ? rateCard.ratePerUnit * qty : 0;

    const trip = await prisma.trip.create({
      data: { orgId, transporterId, vehicleId, driverId, routeId, partyId: partyId || null,
              quantity: qty, freightTotal, paymentMode: paymentMode || 'bank', notes, status: 'open' },
      include: { transporter: true, vehicle: true, driver: true, route: true },
    });
    res.status(201).json(trip);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/trips/:id/status — update status; on 'closed' auto-post to ledger
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const trip = await prisma.trip.update({
      where: { id: req.params.id },
      data:  { status },
      include: { transporter: true },
    });

    // Auto-post to ledger when trip is closed
    if (status === 'closed') {
      const existing = await prisma.transporterLedger.findUnique({ where: { tripId: trip.id } });
      if (!existing) {
        const t = trip.transporter;
        const commission = t.commissionType === 'percentage'
          ? (trip.freightTotal * t.commissionValue) / 100
          : t.commissionValue;
        const netPayable = trip.freightTotal - commission;

        // Get previous outstanding balance for this transporter
        const lastEntry = await prisma.transporterLedger.findFirst({
          where: { transporterId: t.id },
          orderBy: { entryDate: 'desc' },
        });
        const prevBalance = lastEntry ? lastEntry.outstandingBalance : 0;

        await prisma.transporterLedger.create({
          data: {
            transporterId: t.id,
            tripId: trip.id,
            freightCredited: trip.freightTotal,
            commissionDeducted: commission,
            tdsDeducted: 0,
            netPayable,
            paymentReceived: 0,
            outstandingBalance: prevBalance + netPayable,
          },
        });
      }
    }
    res.json(trip);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/trips/:id/pod — upload POD image
router.patch('/:id/pod', upload.single('pod'), async (req, res) => {
  try {
    const podFileUrl = `/uploads/${req.file.filename}`;
    const trip = await prisma.trip.update({
      where: { id: req.params.id },
      data:  { podFileUrl, status: 'delivered' },
    });
    res.json(trip);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
