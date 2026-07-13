/**
 * Trips Page
 */
import { createPageHeader, createFilterRow } from '../components/Layout.js';
import { createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { currency, formatDate, formatStatus, getStatusChipClass, editButton, deleteButton, formField, formSubmit, createDriverMultiSelect } from '../utils/helpers.js';
import { state } from '../store/index.js';

// The real trip lifecycle the backend enforces.
const TRIP_STATUSES = ['DRAFT', 'LOADING', 'IN_TRANSIT', 'DELIVERED', 'POD_RECEIVED', 'BILLED', 'SETTLED', 'CANCELLED'];

const routeLabel = (r) => `${r.origin} → ${r.destination}`;

export function renderTripsPage() {
  // Trip rows come pre-filtered and paginated from the server (see
  // tripQueryParams()/fetchTrips() in main.js) — no client-side filtering here.
  const trips = state.data.trips || [];
  // Dropdown options come from the always-loaded reference payload, not the
  // page-scoped list, so they're populated even before visiting those pages.
  const transporters = state.refs.transporters || [];
  const vehicles = state.refs.vehicles || [];
  const routes = state.refs.routes || [];

  const filters = state.filters.trips || {};
  const hasActiveFilters = Boolean(filters.status || filters.internalRef || filters.dateFrom || filters.dateTo);

  const filterHtml = createFilterRow([
    {
      id: 'trip-status-filter',
      label: 'Status',
      type: 'select',
      options: [
        { value: '', label: 'All statuses' },
        ...TRIP_STATUSES.map((s) => ({
          value: s,
          label: formatStatus(s),
          selected: filters.status === s
        }))
      ]
    },
    {
      id: 'trip-internalref-filter',
      label: 'Ref',
      type: 'text',
      placeholder: 'TRP-001',
      value: filters.internalRef || ''
    },
    {
      id: 'trip-datefrom-filter',
      label: 'From',
      type: 'text',
      inputType: 'date',
      value: filters.dateFrom || ''
    },
    {
      id: 'trip-dateto-filter',
      label: 'To',
      type: 'text',
      inputType: 'date',
      value: filters.dateTo || ''
    }
  ]);

  const transporterOptions = [{ value: '', label: 'Select transporter' }, ...transporters.map((t) => ({ value: t.id, label: t.firmName }))];
  const vehicleOptions = [{ value: '', label: 'Select vehicle' }, ...vehicles.map((v) => ({ value: v.id, label: v.vehicleNumber }))];
  const routeOptions = [{ value: '', label: 'Select route (optional)' }, ...routes.map((r) => ({ value: r.id, label: routeLabel(r) }))];

  const commissionTypeOptions = [
    { value: "", label: "Use transporter's default" },
    { value: "PERCENTAGE", label: "Percentage" },
    { value: "FIXED_PER_TRIP", label: "Fixed per trip" },
    { value: "FIXED_PER_TON", label: "Fixed per ton" }
  ];

  const isEditing = state.editing && state.editing.entity === 'trip';
  const entityId = isEditing ? state.editing.id : '';

  const formHtml = `
    <form data-form="trip" class="form-grid two-col" data-entity-id="${entityId}">
      ${formField({ label: 'Internal Ref', type: 'text', id: 'internalRef', name: 'internalRef', placeholder: 'Auto (TRP-001)', maxlength: 40 })}
      ${formField({ label: 'LR Number', type: 'text', id: 'lrNumber', name: 'lrNumber', placeholder: 'LR-12345', maxlength: 40 })}
      ${formField({ label: 'Transporter', type: 'select', id: 'transporterId', name: 'transporterId', required: true, options: transporterOptions })}
      ${formField({ label: 'Vehicle', type: 'select', id: 'vehicleId', name: 'vehicleId', required: true, options: vehicleOptions })}
      ${formField({ label: 'Route', type: 'select', id: 'routeId', name: 'routeId', options: routeOptions })}
      <input type="hidden" id="distanceKm" name="distanceKm" />
      ${formField({ label: 'Material', type: 'text', id: 'material', name: 'material', placeholder: 'e.g. Cement', maxlength: 80 })}
      ${formField({ label: 'Weight (tons)', type: 'number', id: 'weightTons', name: 'weightTons', placeholder: '0', min: 0, step: 0.1 })}
      ${formField({ label: 'Departure date', type: 'date', id: 'departureDate', name: 'departureDate' })}
      ${formField({ label: 'Freight Amount (₹)', type: 'number', id: 'freightAmount', name: 'freightAmount', placeholder: 'e.g. 50000 (auto-fills from route)', min: 0, step: 1 })}
      ${formField({ label: 'Rate per km (₹)', type: 'number', id: 'ratePerKm', name: 'ratePerKm', placeholder: 'Optional: manual rate', min: 0, step: 1 })}
      ${formField({ label: 'Override commission type (optional)', type: 'select', id: 'commissionType', name: 'commissionType', options: commissionTypeOptions })}
      ${formField({ label: 'Override commission value (optional)', type: 'number', id: 'commissionValue', name: 'commissionValue', placeholder: 'e.g. 5 for 5% or fixed amount', min: 0, step: 0.01 })}
      <div class="form-field full-width">
        <label>Drivers</label>
        ${createDriverMultiSelect('driver-multi-select-container')}
      </div>
      ${formField({ label: 'Notes', type: 'text', id: 'notes', name: 'notes', placeholder: 'Notes', maxlength: 200 })}
      <div class="form-field full-width form-actions-row">
        ${formSubmit('trip', isEditing ? 'editing' : 'active')}
        ${isEditing ? '<button type="button" class="btn btn-ghost" data-cancel-edit="trip">Cancel</button>' : ''}
      </div>
    </form>
  `;

  const listHtml = trips.length ? trips.map((trip) => {
    // The slim /trips response embeds transporter/vehicle/route/drivers directly —
    // no cross-referencing a separately loaded list needed.
    const driverNames = (trip.drivers || []).map((td) => td.driver?.name).filter(Boolean).join(', ') || '—';

    const summary = trip.financialSummary || {};
    const totalPaid = summary.tripPaymentTotal || 0;
    const outstanding = summary.outstanding || 0;
    const paymentCount = trip.paymentCount || 0;
    const paymentInfo = paymentCount > 0
      ? `<span class="chip chip-sm ${outstanding > 0 ? 'chip-warning' : 'chip-success'}">Due ${currency(outstanding)}</span>`
      : `<span class="chip chip-sm chip-muted">No payments</span>`;

    const tripDate = trip.departureDate || trip.loadingDate || trip.createdAt;

    return createRecordCard({
      title: trip.internalRef || trip.id.slice(0, 8),
      subtitle: `${trip.transporter?.firmName || '—'} • ${trip.vehicle?.vehicleNumber || '—'}`,
      meta: [
        trip.lrNumber ? `LR: ${trip.lrNumber}` : '',
        `Drivers: ${driverNames}`,
        `Status: ${formatStatus(trip.status)}`,
        formatDate(tripDate),
        paymentInfo
      ],
      chip: currency(trip.freightAmount || 0),
      chipClass: getStatusChipClass(trip.status) || 'primary',
      // Disable edit and delete actions for BILLED or SETTLED trips
      actions: (() => {
        const isEditable = trip.status !== 'BILLED' && trip.status !== 'SETTLED';
        const editBtn = isEditable ? editButton('trip', trip.id) : '';
        const deleteBtn = isEditable ? deleteButton('trip', trip.id) : '';
        return `${editBtn}${deleteBtn} <a href="#trip/${trip.id}" class="text-link">Detail</a>`;
      })()
    });
  }).join('') : createEmptyState(
    hasActiveFilters ? 'No trips match these filters.' : 'No trips created yet.',
    hasActiveFilters ? '<button type="button" class="btn btn-ghost btn-sm" data-clear-trip-filters>Clear filters →</button>' : ''
  );

  const loadMoreHtml = state.tripsHasMore
    ? `<button type="button" id="trips-load-more" class="btn btn-ghost" style="width: 100%; margin-top: 12px;">Load more trips</button>`
    : '';

  const resultCountLabel = state.tripsHasMore
    ? `Showing ${trips.length}+ trips`
    : `Showing ${trips.length} trip${trips.length === 1 ? '' : 's'}`;

  const content = `
    ${createPageHeader({
    eyebrow: 'Trips',
    title: 'Trip workspace',
    copy: 'Create and manage trips with driver assignment, freight, payments, and POD tracking.'
  })}
    <section class="panel-grid white two-col">
      <article class="panel white form-panel${isEditing ? ' form-panel-editing' : ''}">
        <h3>${isEditing ? `Edit trip — ${trips.find(t => t.id === state.editing.id)?.internalRef || ''}` : 'Create trip'}</h3>
        ${formHtml}
      </article>
      <article class="panel white">
        <div class="panel-head">
          <h3>Trip list</h3>
          <div class="trip-filter-status">
            <span class="text-muted">${resultCountLabel}</span>
            ${hasActiveFilters ? '<button type="button" class="btn btn-ghost btn-sm" data-clear-trip-filters>Clear filters</button>' : ''}
          </div>
        </div>
        ${filterHtml}
        <div class="stack">${listHtml}</div>
        ${loadMoreHtml}
      </article>
    </section>
  `;

  return content;
}
