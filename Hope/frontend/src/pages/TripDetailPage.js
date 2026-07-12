/**
 * Trip Detail Page
 */
import { createPageHeader } from '../components/Layout.js';
import {
  createRecordCard, createEmptyState, createHeroStat,
  createPaymentForm, createPaymentHistory, createTripExpenses,
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

  const heroStats = `
    <div class="hero-stats">
      ${createHeroStat({ label: 'Freight', value: currency(trip.freightAmount || 0), helper: 'Total freight' })}
      ${createHeroStat({ label: 'Paid', value: currency(totalPaid), helper: 'Received', className: 'success' })}
      ${createHeroStat({ label: 'Outstanding', value: currency(outstanding), helper: 'Due from transporter', className: outstanding > 0 ? 'warning' : 'success' })}
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
          ${createRecordCard({ title: 'Vehicle', subtitle: trip.vehicle?.vehicleNumber || '—', meta: [trip.vehicle?.make || ''] })}
          ${createRecordCard({ title: 'Route', subtitle: trip.route ? `${trip.route.origin} → ${trip.route.destination}` : '—', meta: [trip.route?.distanceKm ? `${trip.route.distanceKm} km` : ''] })}
          ${createRecordCard({ title: 'LR Number', subtitle: trip.lrNumber || '—', meta: [] })}
          ${createRecordCard({ title: 'Status', subtitle: formatStatus(trip.status), meta: [], chip: formatStatus(trip.status), chipClass: getStatusChipClass(trip.status) })}
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

  const expensesHtml = createTripExpenses(trip.expenses || []);

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
    ${expensesHtml ? `<section class="panel-grid white"><article class="panel white full-width">${expensesHtml}</article></section>` : ''}
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
