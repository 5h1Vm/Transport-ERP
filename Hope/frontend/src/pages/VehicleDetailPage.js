/**
 * Vehicle Detail Page
 */
import { createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { createPageHeader } from '../components/Layout.js';
import { currency, formatDate, formatStatus, getStatusChipClass } from '../utils/helpers.js';
import * as api from '../services/api.js';

export async function renderVehicleDetail(id) {
  let vehicle, trips;
  try {
    [vehicle, trips] = await Promise.all([
      api.vehicle.get(id),
      api.trip.list({ vehicleId: id, limit: 200 })
    ]);
  } catch (error) {
    return `<div class="error-card">Failed to load vehicle: ${error.message}</div>`;
  }
  if (!vehicle) return '<div class="error-card">Vehicle not found</div>';

  const totalFreight = trips.reduce((sum, t) => sum + (t.freightAmount || 0), 0);

  const docExpiry = [
    vehicle.insuranceExpiry ? `Insurance: ${formatDate(vehicle.insuranceExpiry)}` : '',
    vehicle.pucExpiry ? `PUC: ${formatDate(vehicle.pucExpiry)}` : '',
    vehicle.fitnessExpiry ? `Fitness: ${formatDate(vehicle.fitnessExpiry)}` : '',
    vehicle.permitExpiry ? `Permit: ${formatDate(vehicle.permitExpiry)}` : '',
    vehicle.nationalPermitExpiry ? `National permit: ${formatDate(vehicle.nationalPermitExpiry)}` : ''
  ].filter(Boolean);

  const tripsHtml = trips.length ? trips.map(trip => createRecordCard({
    title: trip.internalRef || trip.id.slice(0, 8),
    subtitle: `${trip.transporter?.firmName || 'No transporter'}${trip.route ? ` • ${trip.route.origin} → ${trip.route.destination}` : ''}`,
    chip: formatStatus(trip.status),
    chipClass: getStatusChipClass(trip.status),
    meta: [
      currency(trip.freightAmount || 0),
      formatDate(trip.departureDate || trip.loadingDate || trip.createdAt)
    ],
    actions: `<a href="#trip/${trip.id}" class="text-link">View</a>`
  })).join('') : createEmptyState('No trips for this vehicle.');

  const content = `
    ${createPageHeader({
      eyebrow: 'Vehicle',
      title: vehicle.vehicleNumber,
      copy: `${[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ') || 'No make/model'} • ${formatStatus(vehicle.ownershipStatus)}`
    })}
    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px;">
      <span class="chip primary">Trips: ${trips.length}</span>
      <span class="chip success">Total freight: ${currency(totalFreight)}</span>
      <span class="chip ${vehicle.transporterId ? 'success' : 'muted'}">${vehicle.transporterId ? 'Assigned' : 'Unassigned'}</span>
    </div>

    <section class="panel-grid white two-col">
      <article class="panel white">
        <h3>Vehicle details</h3>
        <div class="stack">
          ${createRecordCard({ title: 'Chassis / Engine', subtitle: [vehicle.chassisNumber, vehicle.engineNumber].filter(Boolean).join(' / ') || '—', meta: [] })}
          ${docExpiry.length ? createRecordCard({ title: 'Document expiry', subtitle: '', meta: docExpiry }) : createEmptyState('No document expiry dates on file.')}
        </div>
      </article>
      <article class="panel white full-width">
        <h3>Trips (${trips.length})</h3>
        <div class="stack">${tripsHtml}</div>
      </article>
    </section>
  `;

  return content;
}
