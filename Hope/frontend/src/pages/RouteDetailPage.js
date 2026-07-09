/**
 * Route Detail Page
 */
import { createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { createPageHeader, createPanelGrid, createMainLayout } from '../components/Layout.js';
import { currency, formatDate } from '../utils/helpers.js';
import { state } from '../store/index.js';

export function renderRouteDetail(id) {
  const route = (state.data.routes || []).find(r => r.id === id);
  if (!route) {
    return createMainLayout('route', `<div class="error-card">Route not found</div>`);
  }

  const trips = (state.data.trips || []).filter(t => t.routeId === id);
  const vehicles = state.data.vehicles || [];
  const transporters = state.data.transporters || [];

  const totalTrips = trips.length;
  const deliveredTrips = trips.filter(t => t.status === 'delivered').length;
  const activeTrips = trips.filter(t => ['active', 'in_transit'].includes(t.status)).length;
  const totalFreight = trips.reduce((sum, t) => sum + (t.freightAmount || 0), 0);

  const tripsHtml = trips.length ? trips.map(trip => {
    const vehicle = vehicles.find(v => v.id === trip.vehicleId);
    const transporter = transporters.find(t => t.id === trip.transporterId);
    return createRecordCard({
      title: trip.internalRef || trip.id.slice(0, 8),
      subtitle: `${vehicle?.vehicleNumber || 'No vehicle'} • ${transporter?.firmName || 'No transporter'}`,
      chip: trip.status,
      chipClass: '',
      meta: [
        currency(trip.freightAmount || 0),
        formatDate(trip.date),
        trip.lrNumber ? `LR: ${trip.lrNumber}` : ''
      ].filter(Boolean),
      actions: `<a href="#trip/${trip.id}" class="text-link">View</a>`
    });
  }).join('') : createEmptyState('No trips on this route.');

  const content = `
    ${createPageHeader({
      eyebrow: 'Route',
      title: route.name,
      copy: `${route.fromCity} → ${route.toCity} • ${route.distanceKm || 0} km • ~${route.estimatedDays || 1} day(s)`
    })}
    <section class="panel-grid white two-col">
      <article class="panel white">
        <h3>Route stats</h3>
        <div class="stack">
          ${createRecordCard({ title: 'Total Trips', subtitle: totalTrips.toString(), chip: '', meta: [], actions: '' })}
          ${createRecordCard({ title: 'Delivered', subtitle: deliveredTrips.toString(), chip: '', meta: [], actions: '' })}
          ${createRecordCard({ title: 'Active', subtitle: activeTrips.toString(), chip: '', meta: [], actions: '' })}
          ${createRecordCard({ title: 'Total Freight', subtitle: currency(totalFreight), chip: '', meta: [], actions: '' })}
        </div>
      </article>
      <article class="panel white full-width">
        <h3>Trips on this route</h3>
        <div class="stack">${tripsHtml}</div>
      </article>
    </section>
  `;

  return createMainLayout('routes', content);
}