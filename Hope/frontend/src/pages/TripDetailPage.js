/**
 * Trip Detail Page
 */
import { createPageHeader } from '../components/Layout.js';
import {
  createRecordCard, createEmptyState, createHeroStat, createKeyValueTable,
  createPaymentHistory, createTripExpenses,
  createStatusActions, createStatusStepper, createPodForm, createPodMeta
} from '../components/CardComponents.js';
import { createTransactionForm } from '../components/TransactionForm.js';
import { createMultiStopPanel, createTripManagementPanel, isMultiStopTrip } from '../components/MultiStopPanel.js';
import { currency, formatDate, formatStatus, getStatusChipClass, escapeHtml } from '../utils/helpers.js';
import { state } from '../store/index.js';
import * as api from '../services/api.js';

export async function renderTripDetail(id) {
  let trip;
  try {
    trip = await api.trip.get(id);
  } catch (error) {
    return `<div class="error-card">Failed to load trip: ${escapeHtml(error.message)}</div>`;
  }
  if (!trip) return createEmptyState('Trip not found.');

  const hasLoads = isMultiStopTrip(trip);
  const summary = trip.financialSummary || {};
  // A trip can carry legacy single-leg freight (on the Trip itself) AND added
  // loads at the same time — a plain trip that later grew extra legs. Show the
  // combined picture so neither half is hidden.
  const hasLegacy = (trip.freightAmount || 0) > 0 || (trip.ledgerEntries || []).length > 0;
  const loadAgg = (trip.loadSummaries || []).reduce((a, s) => ({
    freight: a.freight + (s.freight || 0),
    net: a.net + (s.netReceivable || 0),
    paid: a.paid + (s.paid || 0),
    outstanding: a.outstanding + (s.outstanding || 0)
  }), { freight: 0, net: 0, paid: 0, outstanding: 0 });

  const legacyFreight = hasLegacy ? (trip.freightAmount || 0) : 0;
  const freightTotal = legacyFreight + loadAgg.freight;
  const totalPaid = (summary.tripPaymentTotal || 0) + loadAgg.paid;
  const outstanding = (hasLegacy ? (summary.outstanding || 0) : 0) + loadAgg.outstanding;
  const isCancelled = trip.status === 'CANCELLED';
  const isTerminal = isCancelled || trip.status === 'SETTLED';

  // Outstanding is computed from (freight - transporter's commission), never
  // from gross freight directly — surface the commission explicitly so the
  // gap between "Freight" and "Outstanding" is never a mystery.
  const commission = (trip.ledgerEntries || [])[0]?.commissionDeducted || 0;

  const heroStats = `
    <div class="hero-stats">
      ${(hasLegacy && trip.freightPerTon && trip.weightTons && !hasLoads)
        ? createHeroStat({
            label: 'Freight',
            value: currency(freightTotal),
            helper: `${trip.weightTons}t × ₹${trip.freightPerTon}/ton`
          })
        : createHeroStat({ label: 'Freight', value: currency(freightTotal), helper: hasLoads ? `${trip.loads.length} load(s)${hasLegacy ? ' + base' : ''}` : 'Gross freight' })}
      ${(commission > 0 && !hasLoads) ? createHeroStat({ label: 'Commission', value: currency(commission), helper: 'Deducted from freight' }) : ''}
      ${createHeroStat({ label: 'Paid', value: currency(totalPaid), helper: 'Received', className: 'success' })}
      ${createHeroStat({
        label: 'Outstanding',
        value: currency(outstanding),
        // A cancelled trip reads ₹0 for the same reason a fully-paid one does,
        // and the two mean opposite things — say which this is. Neutral, not
        // green: nothing was collected here, the debt was voided.
        helper: isCancelled ? 'Cancelled — nothing to collect' : 'Due from transporter(s)',
        className: `hero-stat-dominant ${isCancelled ? '' : (outstanding > 0 ? 'warning' : 'success')}`
      })}
      ${!hasLoads ? createHeroStat({ label: 'Expenses', value: currency(summary.tripExpenseTotal || 0), helper: 'Trip expenses' }) : ''}
    </div>
  `;

  const driversHtml = (trip.drivers || []).length
    ? trip.drivers.map(td => createRecordCard({
        title: escapeHtml(td.driver?.name || 'Unknown driver'),
        subtitle: escapeHtml(td.driver?.phone || ''),
        meta: [`Role: ${escapeHtml(td.role)}`].filter(Boolean),
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
        ${!isTerminal ? createStatusActions(trip.id, trip.status, trip.internalRef) : ''}
      </article>
      <article class="panel white">
        <h3>Drivers (${(trip.drivers || []).length})</h3>
        <div class="stack">${driversHtml}</div>
      </article>
    </section>
  `;

  const expensesHtml = createTripExpenses(trip.expenses || []) || createEmptyState('No expenses recorded yet.', '<span class="text-muted">Record a "money gave" entry above to log fuel, toll, or other trip costs.</span>');

  const content = `
    ${createPageHeader({
      eyebrow: 'Trip',
      title: escapeHtml(trip.internalRef || trip.id.slice(0, 8)),
      copy: `${escapeHtml(trip.transporter?.firmName || '—')} • ${escapeHtml(trip.vehicle?.vehicleNumber || '—')}${trip.route ? ` • ${escapeHtml(trip.route.origin)} → ${escapeHtml(trip.route.destination)}` : ''}`
    })}
    ${heroStats}
    ${tripInfo}
    ${hasLoads ? createMultiStopPanel(trip, isTerminal) : ''}
    ${hasLegacy ? `
    ${!isTerminal ? `
    <section class="panel-grid white">
      <article class="panel white full-width">
        <h3>Record entry${hasLoads ? ' (base trip)' : ''}</h3>
        <p class="text-muted panel-sub">Money that left or arrived against this trip.</p>
        ${createTransactionForm({
          context: 'trip',
          tripId: trip.id,
          transporterId: trip.transporterId,
          drivers: trip.drivers || []
        })}
      </article>
    </section>` : ''}
    <section class="panel-grid white two-col">
      <article class="panel white">
        <h3>Payment history (${(trip.payments || []).length})</h3>
        ${createPaymentHistory(trip.payments || []) || createEmptyState('No payments recorded yet.', '<span class="text-muted">Record a "money got" entry above when the transporter pays.</span>')}
      </article>
      <article class="panel white">
        <h3>Expenses (${(trip.expenses || []).length})</h3>
        ${expensesHtml}
      </article>
    </section>` : ''}
    ${createPodForm(trip.id, trip.status, trip.podReceivedDate) ? `
    <section class="panel-grid white">
      <article class="panel white full-width">
        <h3>Proof of Delivery</h3>
        ${createPodForm(trip.id, trip.status, trip.podReceivedDate)}
      </article>
    </section>` : ''}
    ${createTripManagementPanel(trip, isTerminal, state.refs.transporters || [])}
  `;

  return content;
}