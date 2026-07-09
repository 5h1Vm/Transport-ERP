/**
 * Dashboard Page
 */
import { createMainLayout } from '../components/Layout.js';
import { createMetricCard, createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { currency, formatDate, editButton, deleteButton } from '../utils/helpers.js';
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

  // Hero stats
  const heroStats = `
    <div class="hero-stats">
      <div><span>Payments today</span><strong>${currency(dashboard.paymentTotals?.today || 0)}</strong></div>
      <div><span>This month</span><strong>${currency(dashboard.paymentTotals?.month || 0)}</strong></div>
    </div>
  `;

  // Metrics grid
  const metricsHtml = metrics.length
    ? metrics.map(m => createMetricCard({ label: m.label, value: m.value, helper: 'Operational summary' })).join('')
    : `
      <div class="blank-card">
        <h3>No records yet</h3>
        <p>Create masters and trips from the dedicated pages on the left.</p>
      </div>
    `;

  // Recent trips panel
  const recentTripsHtml = recentTrips.length
    ? recentTrips.map(trip => createRecordCard({
        title: trip.internalRef || trip.id.slice(0, 8),
        subtitle: `${trip.transporter?.firmName || 'Transporter'} • ${trip.vehicle?.vehicleNumber || 'Vehicle'}`,
        chip: trip.status,
        chipClass: '',
        meta: [
          `${trip.route ? `${trip.route.origin} → ${trip.route.destination}` : 'No route'}`,
          currency(trip.freightAmount),
          formatDate(trip.createdAt)
        ],
        actions: `${editButton('trip', trip.id)}${deleteButton('trip', trip.id)}`
      })).join('')
    : createEmptyState('No trips created yet.');

  // Transporter balances panel
  const transporterBalancesHtml = transporterBalances.length
    ? transporterBalances.map(item => createRecordCard({
        title: item.name || 'Transporter',
        subtitle: 'Running balance',
        chip: currency(item.outstanding || 0),
        chipClass: 'warning',
        meta: [`<a href="#transporter/${item.id}" class="text-link">View Details</a>`]
      })).join('')
    : createEmptyState('No transporter balances yet.');

  // Pending POD panel
  const pendingPodHtml = pendingPodTrips.length
    ? pendingPodTrips.map(trip => createRecordCard({
        title: trip.internalRef || trip.id.slice(0, 8),
        subtitle: `${trip.transporter?.firmName || 'Transporter'} • ${trip.vehicle?.vehicleNumber || 'Vehicle'}`,
        chip: trip.status,
        meta: []
      })).join('')
    : createEmptyState('No trips are waiting for POD.');

  const content = `
    <section class="page-header">
      <div>
        <p class="eyebrow dark">Dashboard</p>
        <h2>Operations at a glance</h2>
        <p class="page-copy">An operations dashboard for Indian transport businesses, organized for clarity and speed.</p>
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
          <span class="chip danger">${pendingPodTrips.length} pending</span>
        </div>
        <p class="page-copy">Only trips already marked delivered appear here. Draft and in-transit trips are shown in the trip workspace, not in the POD queue.</p>
        <div class="stack">${pendingPodHtml}</div>
      </article>
    </section>
  `;

  return createMainLayout('dashboard', content);
}