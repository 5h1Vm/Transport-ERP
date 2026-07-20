const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { money, add, sub, toRupees } = require('../utils/money');
const { calculateCommission } = require('../services/calculations');
const { Prisma } = require('@prisma/client');

// Settlement types that ADD to what the business owes a driver (an accrued
// labor cost) vs. types that mean cash has already gone out against that
// accrual. Same categorisation calculateDriverOutstanding uses — kept in sync
// deliberately so "cost" here means the same thing "outstanding" means there.
const DRIVER_COST_POSITIVE = ['SALARY', 'INCENTIVE', 'ALLOWANCE'];
const DRIVER_COST_NEGATIVE = ['ADVANCE', 'DEDUCTION', 'PENALTY', 'CASH_COLLECTED', 'EXPENSE_REIMBURSEMENT'];

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function parseRange(query) {
  const now = new Date();
  const from = query.from ? startOfDay(new Date(query.from)) : startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = query.to ? endOfDay(new Date(query.to)) : endOfDay(now);
  return { from, to };
}

module.exports = function reportRoutes(ctx) {
  const { prisma } = ctx;
  const router = express.Router();

  /**
   * GET /api/reports/profit-loss?from=YYYY-MM-DD&to=YYYY-MM-DD
   *
   * READ-ONLY. Defaults to the current month when no range is given.
   *
   * Revenue = net receivable (freight − commission) for every trip/load whose
   * `deliveryDate` falls in range. `deliveryDate` (not `billedDate`) is used
   * because revenue is recognised when the goods actually arrive — billing is
   * a paperwork step that can lag or lead the physical delivery.
   *
   * Costs = TripExpense (by category) + net driver settlement cost
   * (owed-to-driver types minus already-paid-out types, entries whose own
   * `date` falls in range) + VehicleExpense (by category) + vehicle-loan EMI
   * accrual (LedgerEntry rows tagged source=EMI_ACCRUAL, type=DEBIT, in range).
   *
   * Every aggregate below is a single bulk query (groupBy or one findMany +
   * an in-memory reduce) — never a per-row loop back to the database.
   */
  router.get('/reports/profit-loss', asyncHandler(async (req, res) => {
    const { from, to } = parseRange(req.query);
    const dateInRange = { gte: from, lte: to };

    const [legacyEntries, tripLoads, tripExpenseGroups, tripExpensesForVehicle, settlements, vehicleExpenseGroups, vehicleExpensesRaw, emiEntries] = await Promise.all([
      // Revenue — legacy single-leg trips, via their materialized ledger entry.
      prisma.transporterLedgerEntry.findMany({
        where: { trip: { deliveryDate: dateInRange } },
        select: {
          netReceivable: true,
          transporterId: true,
          transporter: { select: { firmName: true } },
          trip: { select: { id: true, vehicleId: true, vehicle: { select: { vehicleNumber: true } } } }
        }
      }),
      // Revenue — Sprint 2B multi-stop loads (no ledger entry; compute net here).
      prisma.tripLoad.findMany({
        where: { trip: { deliveryDate: dateInRange } },
        select: {
          freightAmount: true,
          weightTons: true,
          commissionType: true,
          commissionValue: true,
          transporterId: true,
          transporter: { select: { firmName: true } },
          trip: { select: { id: true, vehicleId: true, vehicle: { select: { vehicleNumber: true } } } }
        }
      }),
      // Costs — trip expenses, by category (fast path for the headline total).
      prisma.tripExpense.groupBy({
        by: ['category'],
        where: { date: dateInRange },
        _sum: { amount: true }
      }),
      // Costs — same trip expenses, with vehicle for the per-vehicle breakdown.
      prisma.tripExpense.findMany({
        where: { date: dateInRange },
        select: { amount: true, trip: { select: { vehicleId: true, vehicle: { select: { vehicleNumber: true } } } } }
      }),
      // Costs — driver settlements (net owed-to-driver cost).
      prisma.driverSettlement.findMany({
        where: { date: dateInRange },
        select: { type: true, amount: true }
      }),
      // Costs — vehicle expenses, by category.
      prisma.vehicleExpense.groupBy({
        by: ['category'],
        where: { date: dateInRange },
        _sum: { amount: true }
      }),
      // Costs — same vehicle expenses, with vehicle for the per-vehicle breakdown.
      prisma.vehicleExpense.findMany({
        where: { date: dateInRange },
        select: { amount: true, vehicleId: true, vehicle: { select: { vehicleNumber: true } } }
      }),
      // Costs — EMI accrual. DEBIT = an EMI charged for this period (a cost);
      // CREDIT would be an actual payment to the financier, not a P&L event.
      prisma.ledgerEntry.findMany({
        where: { source: 'EMI_ACCRUAL', type: 'DEBIT', date: dateInRange },
        select: { amount: true, relatedId: true, relatedType: true }
      })
    ]);

    // ---- Revenue ----
    let revenue = money(0);
    const revenueByTransporter = new Map(); // id -> { name, amount }
    const revenueByVehicle = new Map(); // id -> { number, amount }

    const addRevenue = (netReceivable, transporterId, transporterName, vehicleId, vehicleNumber) => {
      revenue = add(revenue, netReceivable);
      if (transporterId) {
        const cur = revenueByTransporter.get(transporterId) || { name: transporterName, amount: money(0) };
        cur.amount = add(cur.amount, netReceivable);
        revenueByTransporter.set(transporterId, cur);
      }
      if (vehicleId) {
        const cur = revenueByVehicle.get(vehicleId) || { number: vehicleNumber, amount: money(0) };
        cur.amount = add(cur.amount, netReceivable);
        revenueByVehicle.set(vehicleId, cur);
      }
    };

    for (const entry of legacyEntries) {
      addRevenue(
        entry.netReceivable,
        entry.transporterId,
        entry.transporter?.firmName,
        entry.trip?.vehicleId,
        entry.trip?.vehicle?.vehicleNumber
      );
    }
    for (const load of tripLoads) {
      const commission = calculateCommission(load.commissionType, load.commissionValue, load.freightAmount, load.weightTons);
      const netReceivable = sub(money(load.freightAmount), money(commission));
      addRevenue(
        netReceivable,
        load.transporterId,
        load.transporter?.firmName,
        load.trip?.vehicleId,
        load.trip?.vehicle?.vehicleNumber
      );
    }

    // ---- Costs: trip expenses ----
    const tripExpenseByCategory = {};
    let tripExpenseTotal = money(0);
    for (const g of tripExpenseGroups) {
      const amt = money(g._sum.amount || 0);
      tripExpenseByCategory[g.category] = toRupees(amt);
      tripExpenseTotal = add(tripExpenseTotal, amt);
    }

    const costByVehicle = new Map(); // id -> { number, tripExpense, vehicleExpense, emi, revenue }
    const ensureVehicle = (id, number) => {
      if (!costByVehicle.has(id)) {
        costByVehicle.set(id, { number, revenue: money(0), tripExpense: money(0), vehicleExpense: money(0), emi: money(0) });
      }
      return costByVehicle.get(id);
    };
    for (const [id, v] of revenueByVehicle) {
      ensureVehicle(id, v.number).revenue = v.amount;
    }
    for (const e of tripExpensesForVehicle) {
      const vid = e.trip?.vehicleId;
      if (!vid) continue;
      const v = ensureVehicle(vid, e.trip?.vehicle?.vehicleNumber);
      v.tripExpense = add(v.tripExpense, e.amount);
    }

    // ---- Costs: driver settlements (net) ----
    let driverPositive = money(0);
    let driverNegative = money(0);
    for (const s of settlements) {
      if (DRIVER_COST_POSITIVE.includes(s.type)) driverPositive = add(driverPositive, s.amount);
      else if (DRIVER_COST_NEGATIVE.includes(s.type)) driverNegative = add(driverNegative, s.amount);
    }
    // NOTE: this is deliberately NOT allocated to a vehicle in the per-vehicle
    // breakdown below — a settlement is per-driver (sometimes per-trip), not
    // reliably per-vehicle, so it only appears in the overall total.
    const driverSettlementNet = sub(driverPositive, driverNegative);

    // ---- Costs: vehicle expenses ----
    const vehicleExpenseByCategory = {};
    let vehicleExpenseTotal = money(0);
    for (const g of vehicleExpenseGroups) {
      const amt = money(g._sum.amount || 0);
      vehicleExpenseByCategory[g.category] = toRupees(amt);
      vehicleExpenseTotal = add(vehicleExpenseTotal, amt);
    }
    for (const e of vehicleExpensesRaw) {
      if (!e.vehicleId) continue;
      const v = ensureVehicle(e.vehicleId, e.vehicle?.vehicleNumber);
      v.vehicleExpense = add(v.vehicleExpense, e.amount);
    }

    // ---- Costs: EMI accrual ----
    let emiTotal = money(0);
    for (const e of emiEntries) emiTotal = add(emiTotal, e.amount);
    if (emiEntries.some(e => e.relatedType === 'VEHICLE_LOAN' && e.relatedId)) {
      const loanIds = [...new Set(emiEntries.filter(e => e.relatedType === 'VEHICLE_LOAN').map(e => e.relatedId))];
      const loans = await prisma.vehicleLoan.findMany({
        where: { id: { in: loanIds } },
        select: { id: true, vehicleId: true, vehicle: { select: { vehicleNumber: true } } }
      });
      const loanToVehicle = new Map(loans.map(l => [l.id, { id: l.vehicleId, number: l.vehicle?.vehicleNumber }]));
      for (const e of emiEntries) {
        const veh = e.relatedType === 'VEHICLE_LOAN' ? loanToVehicle.get(e.relatedId) : null;
        if (!veh) continue;
        const v = ensureVehicle(veh.id, veh.number);
        v.emi = add(v.emi, e.amount);
      }
    }

    const totalCosts = add(add(tripExpenseTotal, driverSettlementNet), add(vehicleExpenseTotal, emiTotal));
    const netProfit = sub(revenue, totalCosts);

    const byVehicle = [...costByVehicle.entries()].map(([id, v]) => {
      const costs = add(add(v.tripExpense, v.vehicleExpense), v.emi);
      return {
        vehicleId: id,
        vehicleNumber: v.number || null,
        revenue: toRupees(v.revenue),
        tripExpense: toRupees(v.tripExpense),
        vehicleExpense: toRupees(v.vehicleExpense),
        emiAccrual: toRupees(v.emi),
        costs: toRupees(costs),
        profit: toRupees(sub(v.revenue, costs))
      };
    }).sort((a, b) => b.revenue - a.revenue);

    const byTransporter = [...revenueByTransporter.entries()].map(([id, t]) => ({
      transporterId: id,
      transporterName: t.name || null,
      revenue: toRupees(t.amount)
    })).sort((a, b) => b.revenue - a.revenue);

    res.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      revenue: toRupees(revenue),
      costs: {
        total: toRupees(totalCosts),
        tripExpenses: { total: toRupees(tripExpenseTotal), byCategory: tripExpenseByCategory },
        driverSettlementsNet: toRupees(driverSettlementNet),
        vehicleExpenses: { total: toRupees(vehicleExpenseTotal), byCategory: vehicleExpenseByCategory },
        emiAccrual: toRupees(emiTotal)
      },
      netProfit: toRupees(netProfit),
      byVehicle,
      byTransporter
    });
  }));

  return router;
};
