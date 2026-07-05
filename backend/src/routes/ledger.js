const router = require('express').Router();
const prisma = require('../prismaClient');

// GET /api/ledger/:transporterId — full ledger for one transporter
router.get('/:transporterId', async (req, res) => {
  const entries = await prisma.transporterLedger.findMany({
    where: { transporterId: req.params.transporterId },
    include: { trip: { include: { route: true } } },
    orderBy: { entryDate: 'asc' },
  });

  const totalOutstanding = entries.length
    ? entries[entries.length - 1].outstandingBalance
    : 0;

  res.json({ entries, totalOutstanding });
});

// POST /api/ledger/:transporterId/payment — record a payment received
router.post('/:transporterId/payment', async (req, res) => {
  try {
    const { amount, mode, bankReference, notes } = req.body;
    const amt = parseFloat(amount);

    // Record the payment
    const payment = await prisma.transporterPayment.create({
      data: { transporterId: req.params.transporterId, amount: amt, mode, bankReference, notes },
    });

    // Update outstanding balance on the latest ledger entry
    const lastEntry = await prisma.transporterLedger.findFirst({
      where: { transporterId: req.params.transporterId },
      orderBy: { entryDate: 'desc' },
    });
    if (lastEntry) {
      await prisma.transporterLedger.update({
        where: { id: lastEntry.id },
        data:  { paymentReceived: lastEntry.paymentReceived + amt,
                 outstandingBalance: lastEntry.outstandingBalance - amt },
      });
    }
    res.status(201).json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
