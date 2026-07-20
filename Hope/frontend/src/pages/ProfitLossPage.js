/**
 * Profit & Loss Report — Sprint 2D
 *
 * Read-only: shows revenue, costs (by category), net profit/loss, and
 * per-vehicle / per-transporter breakdowns for a date range (default: current
 * month). Nothing here writes to the database — it only calls
 * GET /api/reports/profit-loss.
 */
import { createPageHeader } from '../components/Layout.js';
import { createHeroStat } from '../components/CardComponents.js';
import { currency, escapeHtml, formatDate } from '../utils/helpers.js';
import * as api from '../services/api.js';

const EXPENSE_CATEGORY_LABELS = {
  FUEL: 'Fuel', TOLL: 'Toll', FOOD: 'Food', LOADING_UNLOADING: 'Loading/unloading',
  REPAIR_EN_ROUTE: 'Repair (en route)', EMERGENCY: 'Emergency', DAILY_EXPENSE: 'Daily expense', OTHER: 'Other',
  REPAIR: 'Repair', MAINTENANCE: 'Maintenance', TYRE: 'Tyre', BATTERY: 'Battery', INSURANCE: 'Insurance'
};

function toDateInputValue(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

function categoryRows(byCategory) {
  const entries = Object.entries(byCategory || {}).filter(([, v]) => v);
  if (!entries.length) return '<tr><td colspan="2" class="text-muted">None in range</td></tr>';
  return entries.map(([cat, amt]) => `<tr><td>${escapeHtml(EXPENSE_CATEGORY_LABELS[cat] || cat)}</td><td class="pl-amount">${currency(amt)}</td></tr>`).join('');
}

export async function renderProfitLossPage(params = {}) {
  let report;
  try {
    report = await api.reports.profitLoss(params);
  } catch (error) {
    return `<div class="error-card">Failed to load report: ${escapeHtml(error.message)}</div>`;
  }

  const fromValue = toDateInputValue(report.range.from);
  const toValue = toDateInputValue(report.range.to);
  const isProfit = report.netProfit >= 0;

  const vehicleRows = (report.byVehicle || []).length
    ? report.byVehicle.map(v => `
        <tr>
          <td>${escapeHtml(v.vehicleNumber || v.vehicleId)}</td>
          <td class="pl-amount">${currency(v.revenue)}</td>
          <td class="pl-amount">${currency(v.costs)}</td>
          <td class="pl-amount ${v.profit >= 0 ? 'text-success' : 'text-warning'}">${currency(v.profit)}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" class="text-muted">No vehicle activity in range</td></tr>';

  const transporterRows = (report.byTransporter || []).length
    ? report.byTransporter.map(t => `
        <tr>
          <td>${escapeHtml(t.transporterName || t.transporterId)}</td>
          <td class="pl-amount">${currency(t.revenue)}</td>
        </tr>`).join('')
    : '<tr><td colspan="2" class="text-muted">No transporter revenue in range</td></tr>';

  const vehicleTotal = (report.byVehicle || []).reduce((a, v) => a + v.revenue, 0);
  const transporterTotal = (report.byTransporter || []).reduce((a, t) => a + t.revenue, 0);

  return `
    ${createPageHeader({
      eyebrow: 'Reports',
      title: 'Profit & Loss',
      copy: 'Revenue is net receivable (freight minus commission) for trips delivered in range. Costs are trip expenses, net driver settlements, vehicle expenses, and EMI accrual. Read-only — nothing here changes any ledger.'
    })}

    <section class="panel-grid white">
      <article class="panel white full-width">
        <form class="form-grid two-col pl-range-form" data-pl-range-form>
          <div class="form-field">
            <label for="pl-from">From</label>
            <input type="date" id="pl-from" name="from" value="${fromValue}" />
          </div>
          <div class="form-field">
            <label for="pl-to">To</label>
            <input type="date" id="pl-to" name="to" value="${toValue}" />
          </div>
          <div class="form-field form-actions-row">
            <button type="submit" class="btn btn-primary">Update</button>
          </div>
        </form>
        <p class="text-muted panel-sub">${formatDate(report.range.from)} – ${formatDate(report.range.to)}</p>
      </article>
    </section>

    <section class="panel-grid white">
      <div class="hero-stats">
        ${createHeroStat({ label: 'Revenue', value: currency(report.revenue), helper: 'Net receivable, freight − commission' })}
        ${createHeroStat({ label: 'Costs', value: currency(report.costs.total), helper: 'Trip + vehicle expenses, driver settlements, EMI' })}
        ${createHeroStat({
          label: isProfit ? 'Net profit' : 'Net loss',
          value: currency(Math.abs(report.netProfit)),
          className: `hero-stat-dominant ${isProfit ? 'success' : 'warning'}`
        })}
      </div>
    </section>

    <section class="panel-grid white two-col">
      <article class="panel white">
        <h3>Costs by category</h3>
        <table class="pl-table">
          <thead><tr><th>Category</th><th>Amount</th></tr></thead>
          <tbody>
            <tr><td><strong>Trip expenses</strong></td><td class="pl-amount"><strong>${currency(report.costs.tripExpenses.total)}</strong></td></tr>
            ${categoryRows(report.costs.tripExpenses.byCategory)}
            <tr><td><strong>Vehicle expenses</strong></td><td class="pl-amount"><strong>${currency(report.costs.vehicleExpenses.total)}</strong></td></tr>
            ${categoryRows(report.costs.vehicleExpenses.byCategory)}
            <tr><td>Driver settlements (net)</td><td class="pl-amount">${currency(report.costs.driverSettlementsNet)}</td></tr>
            <tr><td>Vehicle loan EMI accrual</td><td class="pl-amount">${currency(report.costs.emiAccrual)}</td></tr>
          </tbody>
        </table>
      </article>
      <article class="panel white">
        <h3>Revenue by transporter</h3>
        <table class="pl-table">
          <thead><tr><th>Transporter</th><th>Revenue</th></tr></thead>
          <tbody>${transporterRows}</tbody>
          ${report.byTransporter?.length ? `<tfoot><tr><td>Total</td><td class="pl-amount">${currency(transporterTotal)}</td></tr></tfoot>` : ''}
        </table>
      </article>
    </section>

    <section class="panel-grid white">
      <article class="panel white full-width">
        <h3>Profit by vehicle</h3>
        <p class="text-muted panel-sub">Driver settlement costs aren't allocated per vehicle here (they're per-driver, not reliably per-vehicle) — this column undercounts total cost slightly; see the overall total above for the complete figure.</p>
        <table class="pl-table">
          <thead><tr><th>Vehicle</th><th>Revenue</th><th>Costs</th><th>Profit</th></tr></thead>
          <tbody>${vehicleRows}</tbody>
          ${report.byVehicle?.length ? `<tfoot><tr><td>Total</td><td class="pl-amount">${currency(vehicleTotal)}</td><td></td><td></td></tr></tfoot>` : ''}
        </table>
      </article>
    </section>
  `;
}
