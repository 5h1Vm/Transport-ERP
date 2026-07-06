function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumBy(items, selector) {
  return items.reduce((total, item) => total + toNumber(selector(item)), 0);
}

function calculateFreightAmount({ freightAmount, weightTons, freightPerTon }) {
  const directAmount = toNumber(freightAmount);
  if (directAmount > 0) {
    return directAmount;
  }

  return toNumber(weightTons) * toNumber(freightPerTon);
}

function calculateCommission(transporter, freightAmount, weightTons = 0) {
  const baseAmount = toNumber(freightAmount);

  switch (transporter.commissionType) {
    case 'FIXED_PER_TRIP':
      return toNumber(transporter.commissionValue);
    case 'FIXED_PER_TON':
      return toNumber(transporter.commissionValue) * toNumber(weightTons);
    case 'PERCENTAGE':
    default:
      return baseAmount * (toNumber(transporter.commissionValue) / 100);
  }
}

async function calculateTransporterOutstanding(prisma, transporterId) {
  const ledger = await prisma.transporterLedgerEntry.aggregate({
    where: { transporterId },
    _sum: { netReceivable: true }
  });

  const payments = await prisma.payment.aggregate({
    where: { transporterId },
    _sum: { amount: true }
  });

  return toNumber(ledger._sum.netReceivable) - toNumber(payments._sum.amount);
}

async function calculateTripPaymentSummary(prisma, tripId) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      ledgerEntries: true,
      expenses: true,
      payments: true
    }
  });

  if (!trip) {
    return null;
  }

  const tripExpenseTotal = sumBy(trip.expenses, (expense) => expense.amount);
  const tripPaymentTotal = sumBy(trip.payments, (payment) => payment.amount);
  const ledgerReceivableTotal = sumBy(trip.ledgerEntries, (entry) => entry.netReceivable);
  const chargeTotal = ledgerReceivableTotal > 0 ? ledgerReceivableTotal : toNumber(trip.freightAmount);
  const outstanding = chargeTotal - tripPaymentTotal;

  return {
    tripExpenseTotal,
    tripPaymentTotal,
    chargeTotal,
    outstanding,
    paymentStatus:
      outstanding <= 0 ? 'PAID' : tripPaymentTotal > 0 ? 'PARTIALLY_PAID' : 'UNPAID'
  };
}

module.exports = {
  calculateFreightAmount,
  calculateCommission,
  calculateTransporterOutstanding,
  calculateTripPaymentSummary,
  sumBy,
  toNumber
};