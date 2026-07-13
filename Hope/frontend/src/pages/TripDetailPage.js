/**
 * Trip Detail Page
 */
import { createPageHeader } from '../components/Layout.js';
import {
  createRecordCard, createEmptyState, createHeroStat, createKeyValueTable,
  createPaymentForm, createPaymentHistory, createTripExpenses, createExpenseForm,
  createStatusActions, createStatusStepper, createPodForm, createPodMeta
} from '../components/CardComponents.js';
import { currency, formatDate, formatStatus, getStatusChipClass, escapeHtml } from '../utils/helpers.js';
import * as api from '../services/api.js';

export async function renderTripDetail(id) {
  let trip;
  try {
    trip = await api.trip.get(id);
  } catch (error) {
    return `<div class="error-card">Failed to load trip: ${escapeHtml(error.message)}</div>`;
  }
  if (!trip) return createEmptyState('Trip not found.');

  const summary = trip.financialSummary || {};
  const totalPaid = summary.tripPaymentTotal || 0;
  const outstanding = summary.outstanding || 0;
  const isTerminal = trip.status === 'CANCELLED' || trip.status === 'SETTLED';

  // Outstanding is computed from (freight - transporter's commission), never
  // from gross freight directly — surface the commission explicitly so the
  // gap between "Freight" and "Outstanding" is never a mystery.
  const commission = (trip.ledgerEntries || [])[0]?.commissionDeducted || 0;

  const heroStats = `
    <div class="hero-stats">
      ${trip.freightPerTon && trip.weightTons
        ? createHeroStat({
            label: 'Freight',
            value: currency(trip.freightAmount || 0),
            helper: `${trip.weightTons}t × ₹${trip.freightPerTon}/ton`
          })
        : createHeroStat({ label: 'Freight', value: currency(trip.freightAmount || 0), helper: 'Gross freight' })}
      ${commission > 0 ? createHeroStat({ label: 'Commission', value: currency(commission), helper: 'Deducted from freight' }) : ''}
      ${createHeroStat({ label: 'Paid', value: currency(totalPaid), helper: 'Received', className: 'success' })}
      ${createHeroStat({ label: 'Outstanding', value: currency(outstanding), helper: 'Due from transporter', className: `hero-stat-dominant ${outstanding > 0 ? 'warning' : 'success'}` })}
      ${createHeroStat({ label: 'Expenses', value: currency(summary.tripExpenseTotal || 0), helper: 'Trip expenses' })}
    </div>
  `;

  const driversHtml = (trip.drivers || []).length
    ? trip.drivers.map(td => createRecordCard({
        title: escapeHtml(td.driver?.name || 'Unknown driver'),
        subtitle: escapeHtml(td.driver?.phone || ''),
        meta: [`Role: ${escapeHtml(td.role)}`, td.driver?.dailyExpenseRate ? `Daily rate: ${currency(td.driver.dailyExpenseRate)}` : ''].filter(Boolean),
        actions: td.driver ? `<a href="#driver/${escapeHtml(td.driver.id)}" class="text-link">Details</a>` : ''
      })).join('')
    : createEmptyState('No drivers assigned.');

  const vehicleLabel = [escapeHtml(trip.vehicle?.make), escapeHtml(trip.vehicle?.model)].filter(Boolean).join(' ');
  const metadataTable = createKeyValueTable([
    { label: 'Internal Ref', value: escapeHtml(trip.internalRef || '—') },
    { label: 'Date', value: formatDate(trip.departureDate || trip.loadingDate || trip.createdAt) },
    { label: 'Transporter', value: `${escapeHtml(trip.transporter?.firmName || '—')}${trip.transporter?.phone ? ` • ${escapeHtml(trip.transporter.phone)}` : ''}` },
    { label: 'Vehicle', value: `${escapeHtml(trip.vehicle?.vehicleNumber || '—')}${vehicleLabel ? ` • ${vehicleLabel}` : ''}` },
    { label: 'Route', value: trip.route ? `${escapeHtml(trip.route.origin)} → ${escapeHtml(trip.route.destination)}${trip.route.distanceKm ? ` (${trip.route.distanceKm} km)` : ''}` : '<span class="chip chip-sm chip-muted">No route set</span>' },
    { label: 'LR Number', value: trip.lrNumber ? escapeHtml(trip.lrNumber) : '<span class="chip chip-sm chip-muted">Not entered</span>' }
  ]);

  const tripInfo = `
    <section class="panel-grid white two-col">
      <article class="panel white">
        <div class="panel-head">
          <h3>Trip details</h3>
          <span class="chip ${getStatusChipClass(trip.status) ? `chip-${getStatusChipClass(trip.status)}` : ''}">${escapeHtml(formatStatus(trip.status))}</span>
        </div>
        ${metadataTable}
        ${createStatusStepper(trip.status)}
        ${createPodMeta(trip)}
        ${!isTerminal ? createStatusActions(trip.id, trip.status) : ''}
      </article>
      <article class="panel white">
        <h3>Drivers (${(trip.drivers || []).length})</h3>
        <div class="stack">${driversHtml}</div>
      </article>
    </section>
  `;

  const expensesHtml = createTripExpenses(trip.expenses || []) || createEmptyState('No expenses recorded yet.', '<span class="text-muted">Use the form to log fuel, toll, or other trip costs.</span>');

  const content = `
    ${createPageHeader({
      eyebrow: 'Trip',
      title: escapeHtml(trip.internalRef || trip.id.slice(0, 8)),
      copy: `${escapeHtml(trip.transporter?.firmName || '—')} • ${escapeHtml(trip.vehicle?.vehicleNumber || '—')}${trip.route ? ` • ${escapeHtml(trip.route.origin)} → ${escapeHtml(trip.route.destination)}` : ''}`
    })}
    ${heroStats}
    ${tripInfo}
    ${!isTerminal ? `
    <section class="panel-grid white two-col">
      <article class="panel white panel-accent-payment">
        <h3>Record payment <span class="text-muted" style="font-weight:400;">— money in</span></h3>
        ${createPaymentForm(trip.id, trip.transporterId, false)}
      </article>
      <article class="panel white">
        <h3>Payment history (${(trip.payments || []).length})</h3>
        ${createPaymentHistory(trip.payments || []) || createEmptyState('No payments recorded yet.', '<span class="text-muted">Use the form to record an advance or part payment.</span>')}
      </article>
    </section>` : (trip.payments || []).length ? `
    <section class="panel-grid white two-col">
      <article class="panel white">
        <h3>Payment history (${(trip.payments || []).length})</h3>
        ${createPaymentHistory(trip.payments || [])}
      </article>
    </section>` : ''}
    <section class="panel-grid white two-col">
      <article class="panel white panel-accent-expense">
        <h3>Record expense <span class="text-muted" style="font-weight:400;">— money out</span></h3>
        ${createExpenseForm(trip.id, trip.drivers || [])}
      </article>
      <article class="panel white">
        <h3>Expenses (${(trip.expenses || []).length})</h3>
        ${expensesHtml}
      </article>
    </section>
    ${createPodForm(trip.id, trip.status, trip.podReceivedDate) ? `
    <section class="panel-grid white">
      <article class="panel white full-width">
        <h3>Proof of Delivery</h3>
        ${createPodForm(trip.id, trip.status, trip.podReceivedDate)}
      </article>
    </section>` : ''}
  `;

  return content;
}