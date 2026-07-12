/**
 * Vehicle Detail Page
 */
import { createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { createPageHeader } from '../components/Layout.js';
import { currency, formatDate, formatStatus, getStatusChipClass, escapeHtml } from '../utils/helpers.js';
import * as api from '../services/api.js';

export async function renderVehicleDetail(id) {
  let vehicle, trips;
  try {
    [vehicle, trips] = await Promise.all([
      api.vehicle.get(id),
      api.trip.list({ vehicleId: id, limit: 200 })
    ]);
  } catch (error) {
    return `<div class="error-card">Failed to load vehicle: ${escapeHtml(error.message)}</div>`;
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
    title: escapeHtml(trip.internalRef || trip.id.slice(0, 8)),
    subtitle: trip.route ? ` • ${escapeHtml(trip.route.origin)} → ${escapeHtml(trip.route.destination)}` : '',
    chip: escapeHtml(formatStatus(trip.status)),
    chipClass: getStatusChipClass(trip.status),
    meta: [
      currency(trip.freightAmount || 0),
      formatDate(trip.departureDate || trip.loadingDate || trip.createdAt)
    ],
    actions: `<a href="#trip/${escapeHtml(trip.id)}" class="text-link">View</a>`
  })).join('') : createEmptyState('No trips for this vehicle.');

  const content = `
    ${createPageHeader({
      eyebrow: 'Vehicle',
      title: escapeHtml(vehicle.vehicleNumber),
      copy: `${[escapeHtml(vehicle.make), escapeHtml(vehicle.model), escapeHtml(String(vehicle.year))].filter(Boolean).join(' ') || 'No make/model'} • ${escapeHtml(formatStatus(vehicle.ownershipStatus))}`
    })}
    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px;">
      <span class="chip chip-primary">Trips: ${trips.length}</span>
      <span class="chip chip-success">Total freight: ${currency(totalFreight)}</span>
      <span class="chip ${getChipClassForOwnershipStatus(vehicle.ownershipStatus, vehicle.vehicleSourceId, vehicle.vehicleSource)}">${escapeHtml(getChipTextForOwnershipStatus(vehicle.ownershipStatus, vehicle.vehicleSourceId, vehicle.vehicleSource))}</span>
    </div>

    <section class="panel-grid white two-col">
      <article class="panel white">
        <h3>Vehicle details</h3>
        <div class="stack">
          ${createRecordCard({ title: 'Chassis / Engine', subtitle: [escapeHtml(vehicle.chassisNumber), escapeHtml(vehicle.engineNumber)].filter(Boolean).join(' / ') || '—', meta: [] })}
          ${docExpiry.length ? createRecordCard({ title: 'Document expiry', subtitle: '', meta: docExpiry }) : createEmptyState('No document expiry dates on file.')}
        </div>
      </article>
      <article class="panel white full-width">
        <h3>Trips (${trips.length})</h3>
        <div class="stack">${tripsHtml}</div>
      </article>
    </section>
  `;

  // Helper functions to determine chip display based on ownership status
  function getChipTextForOwnershipStatus(ownershipStatus, vehicleSourceId, vehicleSource) {
    // Map ownership status to display labels
    const ownershipStatusLabels = {
      OWNED: 'Owned',
      ATTACHED: 'Attached',
      RENTED: 'Rented',
      LEASED: 'Leased',
      PARTNERSHIP: 'Partnership'
    };

    const ownershipStatusLabel = ownershipStatusLabels[ownershipStatus] || ownershipStatus;

    // Only show source name when ownershipStatus is NOT OWNED and vehicleSource exists
    if (ownershipStatus !== 'OWNED' && vehicleSourceId && vehicleSource) {
      return `${ownershipStatusLabel} (${vehicleSource.name})`;
    }
    return ownershipStatusLabel;
  }

  function getChipClassForOwnershipStatus(ownershipStatus, vehicleSourceId, vehicleSource) {
    // Default class for owned vehicles
    if (ownershipStatus === 'OWNED') {
      return 'success';
    }

    // For non-owned statuses, check if we have a source to display
    if (ownershipStatus !== 'OWNED' && vehicleSourceId && vehicleSource) {
      // Use different colors for different non-owned statuses
      switch (ownershipStatus) {
        case 'ATTACHED':
          return 'info';
        case 'RENTED':
          return 'warning';
        case 'LEASED':
          return 'info';
        case 'PARTNERSHIP':
          return 'success';
        default:
          return 'secondary';
      }
    }

    // For non-owned statuses without source (shouldn't happen in valid data, but handle gracefully)
    return 'secondary';
  }

  return content;
}