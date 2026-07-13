/**
 * Dashboard Page
 */
import { createMetricCard, createRecordCard, createEmptyState, createHeroStat } from '../components/CardComponents.js';
import { currency, formatDate, formatStatus, getStatusChipClass } from '../utils/helpers.js';
import { state } from '../store/index.js';

/**
 * Render Dashboard page
 */
export function renderDashboardPage() {
  const dashboard = state.dashboard || {};
  const metrics = dashboard.metrics || [];
  const recentTrips = dashboard.recentTrips || [];
  const transporterBalances = dashboard.transporterBalances || [];
  const pendingPodTrips = dashboard.pendingPodTrips || [];

  // Hero stats — use createHeroStat for consistency with trip detail page
  const heroStats = `
    <div class="hero-stats">
      ${createHeroStat({ label: 'Payments today', value: currency(dashboard.paymentTotals?.today || 0) })}
      ${createHeroStat({ label: 'This month', value: currency(dashboard.paymentTotals?.month || 0) })}
    </div>
  `;

  // Metrics grid
  const metricHelpers = {
    'Transporters': 'Registered firms',
    'Vehicles': 'Fleet size',
    'Drivers': 'Registered drivers',
    'Trips': 'All time',
    'Open Trips': 'Not yet settled'
  };
  const metricsHtml = metrics.length
    ? metrics.map(m => createMetricCard({ label: m.label, value: m.value, helper: metricHelpers[m.label] || '' })).join('')
    : `
      <div class="blank-card">
        <h3>No records yet</h3>
        <p>Start by adding a <a href="#transporters" class="text-link">transporter</a>, a <a href="#vehicles" class="text-link">vehicle</a>, and a <a href="#drivers" class="text-link">driver</a> — then create your first trip.</p>
      </div>
    `;

  // Recent trips panel
  const recentTripsHtml = recentTrips.length
    ? recentTrips.map(trip => createRecordCard({
        title: trip.internalRef || trip.id.slice(0, 8),
        subtitle: `${trip.transporter?.firmName || 'Transporter'} • ${trip.vehicle?.vehicleNumber || 'Vehicle'}`,
        chip: formatStatus(trip.status),
        chipClass: getStatusChipClass(trip.status),
        meta: [
          `${trip.route ? `${trip.route.origin} → ${trip.route.destination}` : 'No route'}`,
          currency(trip.freightAmount),
          formatDate(trip.departureDate || trip.createdAt)
        ],
        actions: `<a href="#trip/${trip.id}" class="text-link">View</a>`
      })).join('')
    : createEmptyState('No trips created yet.', '<a href="#trips" class="text-link">Create your first trip →</a>');

  // Transporter balances panel
  const transporterBalancesHtml = transporterBalances.length
    ? transporterBalances.map(item => createRecordCard({
        title: item.name || 'Transporter',
        subtitle: 'Running balance',
        chip: item.outstanding < 0 ? '⚠ ' + currency(item.outstanding) : currency(item.outstanding || 0),
        chipClass: item.outstanding < 0 ? 'danger' : item.outstanding > 0 ? 'warning' : 'success',
        meta: [`<a href="#transporter/${item.id}" class="text-link">View Details</a>`]
      })).join('')
    : createEmptyState('No transporter balances yet.', '<a href="#transporters" class="text-link">Add a transporter →</a>');

  // Pending POD panel
  const pendingPodHtml = pendingPodTrips.length
    ? pendingPodTrips.map(trip => createRecordCard({
        title: trip.internalRef || trip.id.slice(0, 8),
        subtitle: `${trip.transporter?.firmName || 'Transporter'} • ${trip.vehicle?.vehicleNumber || 'Vehicle'}`,
        chip: formatStatus(trip.status),
        chipClass: getStatusChipClass(trip.status),
        meta: [],
        actions: `<a href="#trip/${trip.id}" class="text-link">View</a>`
      })).join('')
    : createEmptyState('No trips are waiting for POD.');

  const content = `
    <section class="page-header">
      <div>
        <p class="eyebrow dark">Dashboard</p>
        <h2>Operations at a glance</h2>
        <p class="page-copy">Trip activity, payments, and outstanding balances at a glance.</p>
      </div>
      ${heroStats}
    </section>
    <section class="metrics-grid white">
      ${metricsHtml}
    </section>
    <section class="panel-grid white">
      <article class="panel white">
        <div class="panel-head">
          <div><p class="eyebrow dark">Trips</p><h3>Recent activity</h3></div>
          <a class="text-link" href="#trips">Open page</a>
        </div>
        <div class="stack">${recentTripsHtml}</div>
      </article>
      <article class="panel white">
        <div class="panel-head">
          <div><p class="eyebrow dark">Ledger</p><h3>Outstanding transporters</h3></div>
          <a class="text-link" href="#ledgers">Open page</a>
        </div>
        <div class="stack">${transporterBalancesHtml}</div>
      </article>
      <article class="panel white full-width">
        <div class="panel-head">
          <div><p class="eyebrow dark">POD</p><h3>Waiting for proof of delivery</h3></div>
          <span class="chip chip-danger">${pendingPodTrips.length} pending</span>
        </div>
        <p class="page-copy">Only trips already marked delivered appear here. Draft and in-transit trips are shown in the trip workspace, not in the POD queue.</p>
        <div class="stack">${pendingPodHtml}</div>
      </article>
    </section>
  `;

  return content;
}