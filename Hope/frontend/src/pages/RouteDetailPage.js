/**
 * Route Detail Page
 */
import { createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { createPageHeader } from '../components/Layout.js';
import { currency, formatDate, formatStatus, getStatusChipClass } from '../utils/helpers.js';
import * as api from '../services/api.js';

export async function renderRouteDetail(id) {
  let route, trips;
  try {
    [route, trips] = await Promise.all([
      api.route.get(id),
      api.trip.list({ routeId: id, limit: 200 })
    ]);
  } catch (error) {
    return `<div class="error-card">Failed to load route: ${error.message}</div>`;
  }
  if (!route) {
    return '<div class="error-card">Route not found</div>';
  }

  const totalTrips = trips.length;
  const deliveredTrips = trips.filter(t => ['DELIVERED', 'POD_RECEIVED', 'BILLED', 'SETTLED'].includes(t.status)).length;
  const activeTrips = trips.filter(t => ['LOADING', 'IN_TRANSIT'].includes(t.status)).length;
  const totalFreight = trips.reduce((sum, t) => sum + (t.freightAmount || 0), 0);

  const tripsHtml = trips.length ? trips.map(trip => createRecordCard({
    title: trip.internalRef || trip.id.slice(0, 8),
    subtitle: `${trip.vehicle?.vehicleNumber || 'No vehicle'} • ${trip.transporter?.firmName || 'No transporter'}`,
    chip: formatStatus(trip.status),
    chipClass: getStatusChipClass(trip.status),
    meta: [
      currency(trip.freightAmount || 0),
      formatDate(trip.departureDate || trip.loadingDate || trip.createdAt),
      trip.lrNumber ? `LR: ${trip.lrNumber}` : ''
    ].filter(Boolean),
    actions: `<a href="#trip/${trip.id}" class="text-link">View</a>`
  })).join('') : createEmptyState('No trips on this route.');

  const content = `
    ${createPageHeader({
      eyebrow: 'Route',
      title: `${route.origin} → ${route.destination}`,
      copy: route.distanceKm ? `${route.distanceKm} km` : 'Distance not set'
    })}
    <section class="panel-grid white two-col">
      <article class="panel white">
        <h3>Route stats</h3>
        <div class="stack">
          ${createRecordCard({ title: 'Total Trips', subtitle: totalTrips.toString(), meta: [] })}
          ${createRecordCard({ title: 'Delivered', subtitle: deliveredTrips.toString(), meta: [] })}
          ${createRecordCard({ title: 'Active', subtitle: activeTrips.toString(), meta: [] })}
          ${createRecordCard({ title: 'Total Freight', subtitle: currency(totalFreight), meta: [] })}
        </div>
      </article>
      <article class="panel white full-width">
        <h3>Trips on this route</h3>
        <div class="stack">${tripsHtml}</div>
      </article>
    </section>
  `;

  return content;
}
