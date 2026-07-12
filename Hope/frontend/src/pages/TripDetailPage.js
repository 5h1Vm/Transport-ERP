/**
 * Trip Detail Page
 */
import { createPageHeader } from '../components/Layout.js';
import {
  createRecordCard, createEmptyState, createHeroStat,
  createPaymentForm, createPaymentHistory, createTripExpenses, createExpenseForm,
  createStatusActions, createPodForm, createPodMeta
} from '../components/CardComponents.js';
import { currency, formatDate, formatStatus, getStatusChipClass } from '../utils/helpers.js';
import * as api from '../services/api.js';

export async function renderTripDetail(id) {
  let trip;
  try {
    trip = await api.trip.get(id);
  } catch (error) {
    return `<div class="error-card">Failed to load trip: ${error.message}</div>`;
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
      ${createHeroStat({ label: 'Freight', value: currency(trip.freightAmount || 0), helper: 'Gross freight' })}
      ${commission > 0 ? createHeroStat({ label: 'Commission', value: currency(commission), helper: `${trip.transporter?.firmName || 'Transporter'}'s cut` }) : ''}
      ${createHeroStat({ label: 'Paid', value: currency(totalPaid), helper: 'Received', className: 'success' })}
      ${createHeroStat({ label: 'Outstanding', value: currency(outstanding), helper: commission > 0 ? `Freight − ₹${commission} commission − paid` : 'Due from transporter', className: outstanding > 0 ? 'warning' : 'success' })}
      ${createHeroStat({ label: 'Expenses', value: currency(summary.tripExpenseTotal || 0), helper: 'Trip expenses' })}
    </div>
  `;

  const driversHtml = (trip.drivers || []).length
    ? trip.drivers.map(td => createRecordCard({
        title: td.driver?.name || 'Unknown driver',
        subtitle: td.driver?.phone || '',
        meta: [`Role: ${td.role}`, td.driver?.dailyExpenseRate ? `Daily rate: ${currency(td.driver.dailyExpenseRate)}` : ''].filter(Boolean),
        actions: td.driver ? `<a href="#driver/${td.driver.id}" class="text-link">Details</a>` : ''
      })).join('')
    : createEmptyState('No drivers assigned.');

  const tripInfo = `
    <section class="panel-grid white two-col">
      <article class="panel white">
        <h3>Trip details</h3>
        <div class="stack">
          ${createRecordCard({ title: 'Internal Ref', subtitle: trip.internalRef || '—', meta: [formatDate(trip.departureDate || trip.loadingDate || trip.createdAt)] })}
          ${createRecordCard({ title: 'Transporter', subtitle: trip.transporter?.firmName || '—', meta: [trip.transporter?.contactPerson ? `${trip.transporter.contactPerson} • ${trip.transporter.phone || ''}` : ''] })}
          ${createRecordCard({ title: 'Vehicle', subtitle: trip.vehicle?.vehicleNumber || '—', meta: [[trip.vehicle?.make, trip.vehicle?.model].filter(Boolean).join(' ')].filter(Boolean) })}
          ${createRecordCard({ title: 'Route', subtitle: trip.route ? `${trip.route.origin} → ${trip.route.destination}` : '—', meta: [trip.route?.distanceKm ? `${trip.route.distanceKm} km` : ''] })}
          ${createRecordCard({ title: 'LR Number', subtitle: trip.lrNumber || '—', meta: [] })}
          ${createRecordCard({ title: 'Status', chip: formatStatus(trip.status), chipClass: getStatusChipClass(trip.status) })}
        </div>
        ${createPodMeta(trip)}
        ${!isTerminal ? createStatusActions(trip.id, trip.status) : ''}
      </article>
      <article class="panel white">
        <h3>Drivers (${(trip.drivers || []).length})</h3>
        <div class="stack">${driversHtml}</div>
      </article>
    </section>
  `;

  const expensesHtml = createTripExpenses(trip.expenses || []) || createEmptyState('No expenses recorded yet.');

  const content = `
    ${createPageHeader({
      eyebrow: 'Trip',
      title: trip.internalRef || trip.id.slice(0, 8),
      copy: `${trip.transporter?.firmName || '—'} • ${trip.vehicle?.vehicleNumber || '—'}${trip.route ? ` • ${trip.route.origin} → ${trip.route.destination}` : ''}`
    })}
    ${heroStats}
    ${tripInfo}
    <section class="panel-grid white two-col">
      <article class="panel white">
        <h3>Record payment</h3>
        ${createPaymentForm(trip.id, trip.transporterId, isTerminal)}
      </article>
      <article class="panel white">
        <h3>Payment history (${(trip.payments || []).length})</h3>
        ${createPaymentHistory(trip.payments || []) || createEmptyState('No payments recorded yet.')}
      </article>
    </section>
    <section class="panel-grid white two-col">
      <article class="panel white">
        <h3>Record expense</h3>
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
