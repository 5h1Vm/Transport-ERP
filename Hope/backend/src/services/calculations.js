const { Prisma } = require('@prisma/client');
const { money, add, sub, mul, sumBy, toRupees } = require('../utils/money');

/**
 * Convert a value to a Number safely (kept for compatibility where needed).
 * @param {*} value
 * @returns {number}
 */
function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Calculate freight amount: prefer explicit freightAmount, else weightTons * freightPerTon.
 * @param {{freightAmount: number|string|Prisma.Decimal, weightTons: number|string|Prisma.Decimal, freightPerTon: number|string|Prisma.Decimal}} opts
 * @returns {number}
 */
function calculateFreightAmount({ freightAmount, weightTons, freightPerTon }) {
  const direct = money(freightAmount);
  if (direct.greaterThan(0)) {
    return toRupees(direct);
  }
  const weight = money(weightTons);
  const rate = money(freightPerTon);
  const calculated = mul(weight, rate);
  return toRupees(calculated);
}

/**
 * Calculate commission based on trip-level settings (no transporter fallback).
 * @param {string} commissionType
 * @param {number|string|Prisma.Decimal} commissionValue
 * @param {number|string|Prisma.Decimal} freightAmount
 * @param {number|string|Prisma.Decimal} weightTons
 * @returns {number}
 */
function calculateCommission(commissionType, commissionValue, freightAmount, weightTons = 0) {
  const base = money(freightAmount);
  const value = money(commissionValue);
  const weight = money(weightTons);

  switch (commissionType) {
    case 'FIXED_PER_TRIP':
      return toRupees(value);
    case 'FIXED_PER_TON':
      return toRupees(mul(value, weight));
    case 'PERCENTAGE':
    default:
      // commission = base * (commissionValue / 100)
      const percent = value.div(new Prisma.Decimal(100));
      return toRupees(mul(base, percent));
  }
}
/**
 * Calculate a single transporter's outstanding amount (net receivable - payments).
 * @param {Prisma.Client} prisma
 * @param {string} transporterId
 * @returns {number}
 */
async function calculateTransporterOutstanding(prisma, transporterId) {
  const ledger = await prisma.transporterLedgerEntry.aggregate({
    where: { transporterId },
    _sum: { netReceivable: true }
  });
  const payments = await prisma.payment.aggregate({
    where: { transporterId },
    _sum: { amount: true }
  });
  const receivable = money(ledger._sum.netReceivable || 0);
  const paid = money(payments._sum.amount || 0);
  const outstanding = sub(receivable, paid);
  return toRupees(outstanding);
}

/**
 * Synchronous version – computes a trip's payment summary from a trip object
 * that already has ledgerEntries, expenses, and payments included.
 * @param {Object} trip
 * @returns {Object|null}
 */
function computeTripPaymentSummary(trip) {
  if (!trip) return null;

  const tripExpenseTotal = money(sumBy(trip.expenses || [], e => e.amount));
  const tripPaymentTotal = money(sumBy(trip.payments || [], p => p.amount));
  const ledgerReceivableTotal = money(sumBy(trip.ledgerEntries || [], e => e.netReceivable));
  // chargeTotal = ledgerReceivableIf > 0 else freightAmount
  const chargeTotal = ledgerReceivableTotal.greaterThan(0) ? ledgerReceivableTotal : money(trip.freightAmount);
  const outstanding = sub(chargeTotal, tripPaymentTotal);

  let paymentStatus = 'UNPAID';
  if (!outstanding.greaterThan(0)) {
    paymentStatus = 'PAID';
  } else if (tripPaymentTotal.greaterThan(0)) {
    paymentStatus = 'PARTIALLY_PAID';
  }

  return {
    tripExpenseTotal: toRupees(tripExpenseTotal),
    tripPaymentTotal: toRupees(tripPaymentTotal),
    chargeTotal: toRupees(chargeTotal),
    outstanding: toRupees(outstanding),
    paymentStatus
  };
}

/**
 * Async version – fetches trip with relations and computes summary.
 * @param {PrismaClient} prisma
 * @param {string} tripId
 * @returns {Promise<Object|null>}
 */
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

/**
 * Bulk version – outstanding for many transporters in 2 queries total.
 * Returns Map<transporterId, outstandingNumber>.
 * @param {PrismaClient} prisma
 * @param {string[]} transporterIds
 * @returns {Map<string, number>}
 */
async function calculateTransporterOutstandingBulk(prisma, transporterIds) {
  const totals = await calculateTransporterTotalsBulk(prisma, transporterIds);
  const result = new Map();
  for (const [id, t] of totals) {
    result.set(id, t.outstanding);
  }
  return result;
}

/**
 * Bulk totals – freight receivable, payments received, outstanding per transporter.
 * Returns Map<transporterId, {freightTotal, paidTotal, outstanding}>.
 * @param {PrismaClient} prisma
 * @param {string[]} transporterIds
 * @returns {Map<string, {freightTotal:number, paidTotal:number, outstanding:number}>}
 */
async function calculateTransporterTotalsBulk(prisma, transporterIds) {
  const result = new Map();
  if (!transporterIds || transporterIds.length === 0) {
    return result;
  }

  const [ledgerGroups, paymentGroups, tripLoads, fundedAdvanceGroups] = await Promise.all([
    prisma.transporterLedgerEntry.groupBy({
      by: ['transporterId'],
      where: { transporterId: { in: transporterIds } },
      _sum: { netReceivable: true }
    }),
    prisma.payment.groupBy({
      by: ['transporterId'],
      where: { transporterId: { in: transporterIds } },
      _sum: { amount: true }
    }),
    // Sprint 2B (multi-stop): each TripLoad billed to a transporter is a
    // receivable that lives OUTSIDE TransporterLedgerEntry. Commission is
    // per-load and not a plain SQL sum, so we fetch the loads and reduce in
    // JS. Legacy single-leg trips have no TripLoad rows, so this query returns
    // nothing for them and the block below is a no-op — the existing path is
    // provably unchanged for any transporter without multi-stop loads.
    prisma.tripLoad.findMany({
      where: { transporterId: { in: transporterIds } },
      select: {
        transporterId: true,
        freightAmount: true,
        weightTons: true,
        commissionType: true,
        commissionValue: true
      }
    }),
    // Sprint 2C: a DriverSettlement(type=ADVANCE) that a transporter funded
    // directly reduces that transporter's outstanding, same as a Payment
    // would — the transporter already handed the driver cash meant for us.
    // Only rows with fundedByTransporterId set are touched; a normal
    // company-funded advance (the default, null) is invisible to this query.
    prisma.driverSettlement.groupBy({
      by: ['fundedByTransporterId'],
      where: { fundedByTransporterId: { in: transporterIds } },
      _sum: { amount: true }
    })
  ]);

  const ledgerMap = new Map(ledgerGroups.map(g => [g.transporterId, money(g._sum.netReceivable || 0)]));
  const paymentMap = new Map(paymentGroups.map(g => [g.transporterId, money(g._sum.amount || 0)]));
  const fundedAdvanceMap = new Map(fundedAdvanceGroups.map(g => [g.fundedByTransporterId, money(g._sum.amount || 0)]));

  // Net receivable from multi-stop loads, per transporter: freight − commission.
  // Payments against these loads carry the load's transporterId, so they are
  // already captured by paymentMap above — only the receivable side is missing.
  const loadReceivableMap = new Map();
  for (const load of tripLoads) {
    const commission = calculateCommission(
      load.commissionType,
      load.commissionValue,
      load.freightAmount,
      load.weightTons
    );
    const netReceivable = sub(money(load.freightAmount), money(commission));
    const running = loadReceivableMap.get(load.transporterId) || new Prisma.Decimal(0);
    loadReceivableMap.set(load.transporterId, add(running, netReceivable));
  }

  for (const id of transporterIds) {
    const legacyReceivable = ledgerMap.get(id) || new Prisma.Decimal(0);
    const loadReceivable = loadReceivableMap.get(id) || new Prisma.Decimal(0);
    const receivable = add(legacyReceivable, loadReceivable);
    const paid = paymentMap.get(id) || new Prisma.Decimal(0);
    const fundedAdvances = fundedAdvanceMap.get(id) || new Prisma.Decimal(0);
    // Treated as equivalent to a payment for outstanding purposes only — it
    // stays a DriverSettlement row, never a duplicate Payment row.
    const outstanding = sub(sub(receivable, paid), fundedAdvances);
    result.set(id, {
      freightTotal: toRupees(receivable),
      paidTotal: toRupees(paid),
      fundedAdvancesTotal: toRupees(fundedAdvances),
      outstanding: toRupees(outstanding)
    });
  }
  return result;
}

/**
 * Calculate trip expenses for a driver (used for breakdown).
 * @param {PrismaClient} prisma
 * @param {string} driverId
 * @param {{fromDate?: string|Date, toDate?: string|Date}} options
 * @returns {Promise<{totalDailyExpenses:number, tripExpenses:Array}>}
 */
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

  let totalDailyExpenses = new Prisma.Decimal(0);
  const tripExpenses = [];

  for (const td of trips) {
    const trip = td.trip;
    if (!trip.departureDate || !trip.deliveryDate) continue;

    const driver = td.driver;
    if (!driver || !driver.dailyExpenseRate) continue;

    const startDate = new Date(trip.departureDate);
    const endDate = new Date(trip.deliveryDate);
    // Normalise to calendar-date midnight to avoid time-of-day drift
    const start = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    const diffTime = Math.abs(end - start);
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive

    const dailyExpense = money(driver.dailyExpenseRate).times(new Prisma.Decimal(days));
    totalDailyExpenses = totalDailyExpenses.plus(dailyExpense);
    tripExpenses.push({
      tripId: trip.id,
      driverId: driver.id,
      driverName: driver.name,
      tripDays: days,
      dailyRate: toRupees(driver.dailyExpenseRate),
      totalExpense: toRupees(dailyExpense),
      departureDate: trip.departureDate,
      deliveryDate: trip.deliveryDate
    });
  }

  return {
    totalDailyExpenses: toRupees(totalDailyExpenses),
    tripExpenses
  };
}

/**
 * Single driver outstanding (used for detail endpoint).
 * @param {PrismaClient} prisma
 * @param {string} driverId
 * @returns {Promise<{outstanding:number, details:null|{settlementTotal:number, tripExpensesPaid:number, dailyExpenses:number, positiveSettlements:number, negativeSettlements:number}}>}
 */
async function calculateDriverOutstanding(prisma, driverId) {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    include: {
      settlements: true,
      expenses: { where: { paidToDriverId: driverId } }
    }
  });

  if (!driver) return { outstanding: 0, details: null };

  const positiveSettlements = money(sumBy(
    driver.settlements || [],
    s => (['SALARY', 'INCENTIVE', 'ALLOWANCE'].includes(s.type) ? s.amount : 0)
  ));

  const negativeSettlements = money(sumBy(
    driver.settlements || [],
    s => (['ADVANCE', 'DEDUCTION', 'PENALTY', 'CASH_COLLECTED', 'EXPENSE_REIMBURSEMENT'].includes(s.type) ? s.amount : 0)
  ));

  // Historical DAILY_EXPENSE trip-expense rows (auto-accrual on trip delivery
  // was removed — daily rate is no longer a live feature) still count here so
  // past figures don't shift; do not re-add bhatta separately or it double-counts.
  const tripExpensesPaid = money(sumBy(driver.expenses || [], e => e.amount));
  const dailyExpenses = money(sumBy(
    (driver.expenses || []).filter(e => e.category === 'DAILY_EXPENSE'),
    e => e.amount
  ));
  const outstanding = sub(add(positiveSettlements, tripExpensesPaid), negativeSettlements);

  return {
    outstanding: toRupees(outstanding),
    details: {
      settlementTotal: toRupees(positiveSettlements.minus(negativeSettlements)),
      tripExpensesPaid: toRupees(tripExpensesPaid),
      dailyExpenses: toRupees(dailyExpenses),
      positiveSettlements: toRupees(positiveSettlements),
      negativeSettlements: toRupees(negativeSettlements)
    }
  };
}

/**
 * Bulk version – outstanding for many drivers in 2 queries total.
 * Returns Map<driverId, {outstanding:number, details:{settlementTotal, tripExpensesPaid, dailyExpenses, positiveSettlements, negativeSettlements}}>>.
 * @param {PrismaClient} prisma
 * @param {string[]} driverIds
 * @returns {Map<string, {outstanding:number, details:{...}}>}
 */
async function calculateDriverOutstandingBulk(prisma, driverIds) {
  const result = new Map();
  if (!driverIds || driverIds.length === 0) {
    return result;
  }

  const drivers = await prisma.driver.findMany({
    where: { id: { in: driverIds } },
    include: {
      settlements: true,
      expenses: true // relation DriverExpenses (TripExpense where paidToDriverId = driver.id) — already includes DAILY_EXPENSE rows, so no separate accrual query is needed.
    }
  });

  for (const driver of drivers) {
    const positiveSettlements = money(sumBy(
      driver.settlements || [],
      s => (['SALARY', 'INCENTIVE', 'ALLOWANCE'].includes(s.type) ? s.amount : 0)
    ));

    const negativeSettlements = money(sumBy(
      driver.settlements || [],
      s => (['ADVANCE', 'DEDUCTION', 'PENALTY', 'CASH_COLLECTED', 'EXPENSE_REIMBURSEMENT'].includes(s.type) ? s.amount : 0)
    ));

    const tripExpensesPaid = money(sumBy(driver.expenses || [], e => e.amount));
    const dailyExpenses = money(sumBy(
      (driver.expenses || []).filter(e => e.category === 'DAILY_EXPENSE'),
      e => e.amount
    ));
    // outstanding = (SALARY+INCENTIVE+ALLOWANCE) + tripExpensesPaid − (ADVANCE+DEDUCTION+PENALTY+CASH_COLLECTED+EXPENSE_REIMBURSEMENT)
    // tripExpensesPaid already includes any DAILY_EXPENSE (bhatta) rows — do not add dailyExpenses again.
    const outstanding = sub(add(positiveSettlements, tripExpensesPaid), negativeSettlements);

    result.set(driver.id, {
      outstanding: toRupees(outstanding),
      details: {
        settlementTotal: toRupees(positiveSettlements.minus(negativeSettlements)),
        tripExpensesPaid: toRupees(tripExpensesPaid),
        dailyExpenses: toRupees(dailyExpenses),
        positiveSettlements: toRupees(positiveSettlements),
        negativeSettlements: toRupees(negativeSettlements)
      }
    });
  }
  return result;
}

/**
 * Number of inclusive days a trip ran, or 0 if dates missing.
 * @param {Date|string|null} departureDate
 * @param {Date|string|null} deliveryDate
 * @returns {number}
 */
function tripDurationDays(departureDate, deliveryDate) {
  if (!departureDate || !deliveryDate) return 0;
  const dep = new Date(departureDate);
  const del = new Date(deliveryDate);
  const start = Date.UTC(dep.getFullYear(), dep.getMonth(), dep.getDate());
  const end = Date.UTC(del.getFullYear(), del.getMonth(), del.getDate());
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive
}

module.exports = {
  toNumber,
  sumBy,
  calculateFreightAmount,
  calculateCommission,
  calculateTransporterOutstanding,
  computeTripPaymentSummary,
  calculateTripPaymentSummary,
  calculateTransporterOutstandingBulk,
  calculateTransporterTotalsBulk,
  calculateDriverTripExpenses,
  calculateDriverOutstanding,
  calculateDriverOutstandingBulk,
  tripDurationDays
};
