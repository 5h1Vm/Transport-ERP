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

// Synchronous version — computes a trip's payment summary from a trip object that
// ALREADY has ledgerEntries, expenses, and payments included. No DB round-trips.
// Use this whenever the trip was loaded with those relations (e.g. list endpoints)
// to avoid re-fetching the same trip once per row (the old N+1 pattern).
function computeTripPaymentSummary(trip) {
  if (!trip) {
    return null;
  }

  const tripExpenseTotal = sumBy(trip.expenses || [], (expense) => expense.amount);
  // Total payments made to transporter for this trip (advances, partial payments, etc.)
  const tripPaymentTotal = sumBy(trip.payments || [], (payment) => payment.amount);
  const ledgerReceivableTotal = sumBy(trip.ledgerEntries || [], (entry) => entry.netReceivable);
  // Amount transporter chargeTotal = what transporter earned from this trip
  const chargeTotal = ledgerReceivableTotal > 0 ? ledgerReceivableTotal : toNumber(trip.freightAmount);
  // outstanding = what we still owe transporter for this trip
  // Positive = we owe them money, Negative = they've been overpaid/owe us money
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

async function calculateTripPaymentSummary(prisma, tripId) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      ledgerEntries: true,
      expenses: true,
      payments: true
    }
  });

  return computeTripPaymentSummary(trip);
}

// Bulk version — outstanding for many transporters in 2 queries total instead of
// 2 queries per transporter. Returns Map<transporterId, outstandingNumber>.
async function calculateTransporterOutstandingBulk(prisma, transporterIds) {
  const result = new Map();
  if (!transporterIds || transporterIds.length === 0) {
    return result;
  }

  const [ledgerGroups, paymentGroups] = await Promise.all([
    prisma.transporterLedgerEntry.groupBy({
      by: ['transporterId'],
      where: { transporterId: { in: transporterIds } },
      _sum: { netReceivable: true }
    }),
    prisma.payment.groupBy({
      by: ['transporterId'],
      where: { transporterId: { in: transporterIds } },
      _sum: { amount: true }
    })
  ]);

  const ledgerByT = new Map(ledgerGroups.map((g) => [g.transporterId, toNumber(g._sum.netReceivable)]));
  const paymentByT = new Map(paymentGroups.map((g) => [g.transporterId, toNumber(g._sum.amount)]));

  for (const id of transporterIds) {
    result.set(id, (ledgerByT.get(id) || 0) - (paymentByT.get(id) || 0));
  }

  return result;
}

// Number of inclusive days a trip ran, or 0 if dates are missing.
function tripDurationDays(departureDate, deliveryDate) {
  if (!departureDate || !deliveryDate) return 0;
  const diffTime = Math.abs(new Date(deliveryDate) - new Date(departureDate));
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive
}

// Bulk version — outstanding for many drivers in 2 queries total instead of
// ~3 queries per driver. Returns Map<driverId, { outstanding, details }>.
async function calculateDriverOutstandingBulk(prisma, driverIds) {
  const result = new Map();
  if (!driverIds || driverIds.length === 0) {
    return result;
  }

  const [drivers, tripAssignments] = await Promise.all([
    prisma.driver.findMany({
      where: { id: { in: driverIds } },
      include: {
        settlements: true,
        expenses: true // relation "DriverExpenses" == TripExpense where paidToDriverId = driver.id
      }
    }),
    prisma.tripDriver.findMany({
      where: { driverId: { in: driverIds } },
      select: {
        driverId: true,
        driver: { select: { dailyExpenseRate: true } },
        trip: { select: { departureDate: true, deliveryDate: true } }
      }
    })
  ]);

  // Daily-expense accrual per driver, from their trip assignments.
  const dailyByDriver = new Map();
  for (const td of tripAssignments) {
    const rate = toNumber(td.driver && td.driver.dailyExpenseRate);
    if (!rate) continue;
    const days = tripDurationDays(td.trip && td.trip.departureDate, td.trip && td.trip.deliveryDate);
    if (!days) continue;
    dailyByDriver.set(td.driverId, (dailyByDriver.get(td.driverId) || 0) + rate * days);
  }

  for (const driver of drivers) {
    const settlementTotal = driver.settlements.reduce((sum, s) => sum + toNumber(s.amount), 0);
    const tripExpensesPaid = driver.expenses.reduce((sum, e) => sum + toNumber(e.amount), 0);
    const dailyExpenses = dailyByDriver.get(driver.id) || 0;
    const outstanding = settlementTotal + tripExpensesPaid + dailyExpenses;
    result.set(driver.id, {
      outstanding,
      details: { settlementTotal, tripExpensesPaid, dailyExpenses }
    });
  }

  return result;
}

async function calculateDriverTripExpenses(prisma, driverId, options = {}) {
  const where = { driverId };
  if (options.fromDate || options.toDate) {
    where.date = {};
    if (options.fromDate) where.date.gte = new Date(options.fromDate);
    if (options.toDate) where.date.lte = new Date(options.toDate);
  }

  const trips = await prisma.tripDriver.findMany({
    where,
    include: {
      driver: true,
      trip: {
        include: {
          drivers: { include: { driver: true } }
        }
      }
    }
  });

  let totalDailyExpenses = 0;
  const tripExpenses = [];

  for (const td of trips) {
    const trip = td.trip;
    if (!trip.departureDate || !trip.deliveryDate) continue;

    const driver = td.driver;
    if (!driver || !driver.dailyExpenseRate) continue;

    const startDate = new Date(trip.departureDate);
    const endDate = new Date(trip.deliveryDate);
    const diffTime = Math.abs(endDate - startDate);
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive

    const dailyExpense = driver.dailyExpenseRate * days;
    totalDailyExpenses += dailyExpense;
    tripExpenses.push({
      tripId: trip.id,
      driverId: driver.id,
      driverName: driver.name,
      tripDays: days,
      dailyRate: driver.dailyExpenseRate,
      totalExpense: dailyExpense,
      departureDate: trip.departureDate,
      deliveryDate: trip.deliveryDate
    });
  }

  return { totalDailyExpenses, tripExpenses };
}

async function calculateDriverOutstanding(prisma, driverId) {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    include: {
      settlements: true,
      expenses: { where: { paidToDriverId: driverId } }
    }
  });

  if (!driver) return { outstanding: 0, details: null };

  const settlementTotal = driver.settlements.reduce((sum, s) => sum + toNumber(s.amount), 0);
  const tripExpensesPaid = driver.expenses.reduce((sum, e) => sum + toNumber(e.amount), 0);

  const { totalDailyExpenses } = await calculateDriverTripExpenses(prisma, driverId);

  const outstanding = toNumber(settlementTotal) + toNumber(tripExpensesPaid) + toNumber(totalDailyExpenses);

  return { outstanding, details: { settlementTotal, tripExpensesPaid, dailyExpenses: totalDailyExpenses } };
}

module.exports = {
  calculateFreightAmount,
  calculateCommission,
  calculateTransporterOutstanding,
  calculateTransporterOutstandingBulk,
  calculateTripPaymentSummary,
  computeTripPaymentSummary,
  calculateDriverTripExpenses,
  calculateDriverOutstanding,
  calculateDriverOutstandingBulk,
  tripDurationDays,
  sumBy,
  toNumber
};