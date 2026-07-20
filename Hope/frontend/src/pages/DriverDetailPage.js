/**
 * Driver Detail Page
 */
import { createPageHeader } from '../components/Layout.js';
import { createRecordCard, createEmptyState, createHeroStat } from '../components/CardComponents.js';
import { createTransactionForm } from '../components/TransactionForm.js';
import { currency, formatDate, formatDateTime, formatStatus, getStatusChipClass, deleteButton, escapeHtml } from '../utils/helpers.js';
import * as api from '../services/api.js';

// Display labels for existing settlement rows. SALARY is still listed here
// because historical rows may carry it — it is no longer creatable (the
// unified entry form doesn't offer it, and the backend rejects it).
const SETTLEMENT_LABELS = {
  SALARY: 'Salary',
  INCENTIVE: 'Incentive',
  ADVANCE: 'Advance',
  DEDUCTION: 'Deduction',
  PENALTY: 'Penalty',
  CASH_COLLECTED: 'Cash collected',
  ALLOWANCE: 'Allowance',
  EXPENSE_REIMBURSEMENT: 'Expense reimbursement (bhatta/toll payout)'
};

export async function renderDriverDetail(id) {
  let driver, trips, transporters;
  try {
    [driver, trips, transporters] = await Promise.all([
      api.driver.get(id),
      api.trip.list({ driverId: id, limit: 200 }),
      // Fetched directly (not from state.refs) — this page can be the first
      // one loaded in a session, before anything populates the shared refs.
      api.transporter.list()
    ]);
  } catch (error) {
    return `<div class="error-card">Failed to load driver: ${escapeHtml(error.message)}</div>`;
  }
  if (!driver) return createEmptyState('Driver not found.');

  const settlements = driver.settlements || [];
  // Trip expenses this driver was paid directly (diesel/toll/etc handed to them).
  const expenses = driver.expenses || [];

  const heroStats = `
    <div class="hero-stats">
      ${createHeroStat({ label: 'Trips', value: trips.length, helper: 'All time' })}
      ${createHeroStat({ label: 'Settlements paid', value: currency(driver.settlementTotal || 0), helper: `${settlements.length} entries`, className: 'success' })}
      ${createHeroStat({
        label: driver.outstandingBalance && driver.outstandingBalance > 0 ? 'We owe you' : 'You owe us',
        value: currency(Math.abs(driver.outstandingBalance || 0)),
        helper: 'Settlements + expenses',
        className: (driver.outstandingBalance || 0) > 0 ? 'warning' : 'success'
      })}
    </div>
  `;

  const settlementForm = createTransactionForm({
    context: 'driver',
    driverId: driver.id,
    trips,
    transporters: transporters || []
  });

  const settlementsHtml = settlements.length ? settlements.map(s => createRecordCard({
    title: currency(s.amount),
    subtitle: escapeHtml(SETTLEMENT_LABELS[s.type] || formatStatus(s.type)),
    // A transporter-funded advance (Sprint 2C) gets a distinct chip so it's
    // never mistaken for a normal company-funded one.
    meta: [
      escapeHtml(formatDateTime(s.date || s.createdAt)),
      escapeHtml(s.description || ''),
      s.tripId ? `<a href="#trip/${escapeHtml(s.tripId)}" class="text-link">Trip</a>` : '',
      s.fundedByTransporter ? `<span class="chip chip-sm chip-info" title="Cash the transporter handed this driver directly">Funded by ${escapeHtml(s.fundedByTransporter.firmName)}</span>` : ''
    ].filter(Boolean)
  })).join('') : createEmptyState('No settlements recorded.');

  const expensesHtml = expenses.length ? expenses.map(e => createRecordCard({
    title: currency(e.amount),
    subtitle: escapeHtml((e.category || '').replace(/_/g, ' ')),
    meta: [escapeHtml(formatDateTime(e.createdAt)), escapeHtml(e.description || ''), e.tripId ? `<a href="#trip/${escapeHtml(e.tripId)}" class="text-link">Trip</a>` : ''].filter(Boolean)
  })).join('') : createEmptyState('No expenses paid to this driver.');

  const tripsHtml = trips.length ? trips.map(trip => createRecordCard({
    title: escapeHtml(trip.internalRef || trip.id.slice(0, 8)),
    subtitle: trip.route ? `${escapeHtml(trip.route.origin)} → ${escapeHtml(trip.route.destination)}` : '<span class="chip chip-sm chip-muted">No route</span>',
    meta: [escapeHtml(formatDate(trip.departureDate || trip.loadingDate || trip.createdAt)), currency(trip.displayFreightTotal ?? trip.freightAmount ?? 0)],
    chip: escapeHtml(formatStatus(trip.status)),
    chipClass: getStatusChipClass(trip.status),
    actions: `<a href="#trip/${escapeHtml(trip.id)}" class="text-link">Detail</a>`
  })).join('') : createEmptyState('No trips assigned.');

  const content = `
    ${createPageHeader({
      eyebrow: 'Driver',
      title: escapeHtml(driver.name),
      copy: `${escapeHtml(driver.phone || 'No phone')} ${driver.licenseNumber ? '• ' + escapeHtml(driver.licenseNumber) : ''}`.trim()
    })}
    ${heroStats}

    <section class="panel-grid white two-col">
      <article class="panel white form-panel">
        <h3>Record entry</h3>
        <p class="text-muted panel-sub">What you paid this driver, or received back from them.</p>
        ${settlementForm}
      </article>
      <article class="panel white">
        <h3>Settlements (${settlements.length})</h3>
        <div class="stack">${settlementsHtml}</div>
      </article>
    </section>

    <section class="panel-grid white">
      <article class="panel white full-width">
        <h3>Expenses paid to driver (${expenses.length})</h3>
        <div class="stack">${expensesHtml}</div>
      </article>
    </section>

    <section class="panel-grid white">
      <article class="panel white full-width">
        <h3>Trips (${trips.length})</h3>
        <div class="stack">${tripsHtml}</div>
      </article>
    </section>
  `;

  return content;
}