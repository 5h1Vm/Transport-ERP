/**
 * Trips Page
 */
import { createPageHeader, createFilterRow } from '../components/Layout.js';
import { createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { currency, formatDate, formatStatus, getStatusChipClass, editButton, deleteButton, formField, formSubmit, createDriverMultiSelect, escapeHtml } from '../utils/helpers.js';
import { state } from '../store/index.js';
import * as api from '../services/api.js';
import { populateForm, populateDriverMultiSelect } from '../utils/binding.js';
import { createMultiStopSection } from '../components/MultiStopEditor.js';

// The real trip lifecycle the backend enforces.
const TRIP_STATUSES = ['DRAFT', 'LOADING', 'IN_TRANSIT', 'DELIVERED', 'POD_RECEIVED', 'BILLED', 'SETTLED', 'CANCELLED'];

const routeLabel = (r) => `${r.origin} → ${r.destination}`;

// Set by renderTripFormPage when it fetches a trip for editing; consumed
// once by hydrateTripFormIfPending() right after the form's HTML lands in
// the DOM. populateForm() needs real DOM nodes to write into, so it can't
// run inside the async HTML-string renderer itself.
let pendingTripEditData = null;

export function renderTripsPage() {
  const trips = state.data.trips || [];
  const transporters = state.refs.transporters || [];
  const vehicles = state.refs.vehicles || [];
  const routes = state.refs.routes || [];

  // Get distinct origin and destination values for From/To dropdowns
  const origins = [...new Set(routes.map(r => r.origin))].filter(Boolean).sort();
  const destinations = [...new Set(routes.map(r => r.destination))].filter(Boolean).sort();

  const filters = state.filters.trips || {};
  const hasActiveFilters = Boolean(filters.status || filters.internalRef || filters.dateFrom || filters.dateTo);

  // Wrap filter row in a mobile-collapsible drawer (MOB-003)
  const filterContent = `
    <div class="filter-drawer">
      <button type="button" class="filter-drawer-toggle btn btn-ghost btn-sm" aria-expanded="false" data-filter-drawer-toggle>
        <span class="filter-drawer-label">Filter trips${hasActiveFilters ? ' (active)' : ''}</span>
        <span class="filter-drawer-icon">▾</span>
      </button>
      <div class="filter-drawer-content${hasActiveFilters ? ' filter-drawer-content--open' : ''}">
        ${createFilterRow([
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
    // Origin/destination and the date range both used to be labelled plain
    // "From" and "To", so the drawer showed each label twice with no way to
    // tell which pair was the route and which was the dates.
    {
      id: 'trip-fromlocation-filter',
      label: 'Origin city',
      type: 'select',
      options: [
        { value: '', label: 'Any origin' },
        ...origins.map(o => ({ value: o, label: o }))
      ]
    },
    {
      id: 'trip-tolocation-filter',
      label: 'Destination city',
      type: 'select',
      options: [
        { value: '', label: 'Any destination' },
        ...destinations.map(d => ({ value: d, label: d }))
      ]
    },
    {
      id: 'trip-datefrom-filter',
      label: 'Date from',
      type: 'text',
      inputType: 'date',
      value: filters.dateFrom || ''
    },
    {
      id: 'trip-dateto-filter',
      label: 'Date to',
      type: 'text',
      inputType: 'date',
      value: filters.dateTo || ''
    }
  ])}
      </div>
    </div>`;

  const listHtml = trips.length ? trips.map((trip) => {
    const driverNames = (trip.drivers || []).map((td) => td.driver?.name).filter(Boolean).join(', ');

    const summary = trip.financialSummary || {};
    const totalPaid = summary.tripPaymentTotal || 0;
    const outstanding = summary.outstanding || 0;
    const isDraft = trip.status === 'DRAFT';
    const isSettled = trip.status === 'SETTLED';
    // One chip for status, one for money — they used to share a single chip
    // that showed "Draft"/"Settled ✓" for those two states and "Due ₹X" for
    // every other one. That made the status read twice on a draft card (once
    // as chip, once as the "Status:" meta line below) while "Due" appeared on
    // some cards and not others with nothing to explain the difference.
    const statusChip = `<span class="chip chip-sm ${getStatusChipClass(trip.status) || 'chip-muted'}">${formatStatus(trip.status)}</span>`;

    // A draft has no receivable yet, and a settled or cancelled trip has
    // nothing left to collect, so "Due" is meaningful only in between — and
    // there it now appears on every card, always labelled. A cancelled trip
    // would otherwise show a green "Due ₹0", which reads as collected in full.
    const dueChip = (isDraft || isSettled || trip.status === 'CANCELLED')
      ? ''
      : `<span class="chip chip-sm ${outstanding > 0 ? 'chip-warning' : 'chip-success'}">Due ${currency(outstanding)}</span>`;

    const tripDate = trip.departureDate || trip.loadingDate || trip.createdAt;
    const isEditable = trip.status !== 'BILLED' && trip.status !== 'SETTLED';
    const editLink = isEditable ? `<a href="#trips/${trip.id}/edit" class="btn btn-ghost">Edit</a>` : '';
    const deleteBtn = isEditable ? deleteButton('trip', trip.id) : '';

    return createRecordCard({
      title: trip.internalRef || trip.id.slice(0, 8),
      subtitle: `${trip.transporter?.firmName || '—'} • ${trip.vehicle?.vehicleNumber || '—'}`,
      meta: [
        trip.lrNumber ? `LR: ${trip.lrNumber}` : '',
        // Always rendered. Hiding the line entirely when nobody is assigned
        // made an unassigned trip look like a card with a missing field
        // rather than a trip that still needs a driver.
        driverNames ? `Drivers: ${driverNames}` : 'No driver assigned',
        formatDate(tripDate),
        statusChip,
        dueChip
      ],
      chip: currency(trip.displayFreightTotal ?? trip.freightAmount ?? 0),
      chipClass: getStatusChipClass(trip.status) || 'primary',
      actions: `${editLink}${deleteBtn} <a href="#trip/${trip.id}" class="text-link">Detail</a>`
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
      <article class="panel white">
        <div class="panel-head">
          <h3>Trip list</h3>
          <div class="trip-filter-status">
            <span class="text-muted">${resultCountLabel}</span>
            ${hasActiveFilters ? '<button type="button" class="btn btn-ghost btn-sm" data-clear-trip-filters>Clear filters</button>' : ''}
            <a href="#trips/new" class="btn btn-primary btn-sm desktop-add-btn">+ Add trip</a>
          </div>
        </div>
        ${filterContent}
        <div class="stack">${listHtml}</div>
        ${loadMoreHtml}
      </article>
    </section>
    <a href="#trips/new" class="fab-btn" aria-label="Add trip">+</a>
  `;

  return content;
}

/**
 * Render the trip create/edit form as its own page.
 * @param {'new'|'edit'} mode
 * @param {string} [tripId] - Required for edit mode
 */
export async function renderTripFormPage(mode, tripId) {
  const transporters = state.refs.transporters || [];
  const vehicles = state.refs.vehicles || [];
  const routes = state.refs.routes || [];

  const origins = [...new Set(routes.map(r => r.origin))].filter(Boolean).sort();
  const destinations = [...new Set(routes.map(r => r.destination))].filter(Boolean).sort();
  const originOptions = [{ value: '', label: 'Select origin' }, ...origins.map(o => ({ value: o, label: o }))];
  const destinationOptions = [{ value: '', label: 'Select destination' }, ...destinations.map(d => ({ value: d, label: d }))];
  const transporterOptions = [{ value: '', label: 'Select transporter' }, ...transporters.map(t => ({ value: t.id, label: t.firmName }))];
  const vehicleOptions = [{ value: '', label: 'Select vehicle' }, ...vehicles.map(v => ({ value: v.id, label: v.vehicleNumber }))];
  const routeOptions = [{ value: '', label: 'Select route (optional)' }, ...routes.map(r => ({ value: r.id, label: routeLabel(r) }))];

  const commissionTypeOptions = [
    { value: "PERCENTAGE", label: "Percentage" },
    { value: "FIXED_PER_TRIP", label: "Fixed per trip" },
    { value: "FIXED_PER_TON", label: "Fixed per ton" }
  ];

  // Fetch trip data first for edit mode — never render blank then populate
  let trip = null;
  if (mode === 'edit') {
    try {
      trip = await api.request(`/trips/${tripId}`);
    } catch (error) {
      pendingTripEditData = null;
      return `<div class="error-card">Failed to load trip: ${escapeHtml(error.message)}</div>`;
    }
  }
  // Actually writing these values into the form has to wait until the HTML
  // below is in the DOM — hydrateTripFormIfPending() does that right after.
  pendingTripEditData = trip;

  const heading = mode === 'new' ? 'Create trip' : `Edit trip — ${trip?.internalRef || ''}`;
  const formId = mode === 'edit' ? tripId : '';

  const formHtml = `
    <form data-form="trip" class="form-grid two-col" data-entity-id="${formId}">
      ${formField({ label: 'Internal Ref', type: 'text', id: 'internalRef', name: 'internalRef', placeholder: 'Auto (TRP-001)', maxlength: 40 })}
      ${formField({ label: 'LR Number', type: 'text', id: 'lrNumber', name: 'lrNumber', placeholder: 'LR number (optional)', maxlength: 40 })}
      ${formField({ label: 'Transporter', type: 'select', id: 'transporterId', name: 'transporterId', required: true, options: transporterOptions })}
      ${formField({ label: 'Vehicle', type: 'select', id: 'vehicleId', name: 'vehicleId', required: true, options: vehicleOptions })}
      ${mode === 'new' ? createMultiStopSection() : ''}
      <div class="form-field full-width">
        <label>From</label>
        ${formField({ label: '', type: 'select', id: 'fromLocation', name: 'fromLocation', options: originOptions })}
      </div>
      <div class="form-field full-width">
        <label>To</label>
        ${formField({ label: '', type: 'select', id: 'toLocation', name: 'toLocation', options: destinationOptions })}
      </div>
      <div id="route-validation-message" class="form-message error"></div>
      <input type="hidden" id="distanceKm" name="distanceKm" />
      <input type="hidden" id="routeId" name="routeId" />
      ${formField({ label: 'Material', type: 'text', id: 'material', name: 'material', placeholder: 'e.g. Cement', maxlength: 80 })}
      ${formField({ label: 'Weight (tons)', type: 'number', id: 'weightTons', name: 'weightTons', placeholder: '0', min: 0, step: 0.1 })}
      ${formField({ label: 'Departure date', type: 'date', id: 'departureDate', name: 'departureDate' })}
      <div class="form-field full-width">
        <label>Freight mode</label>
        <div class="form-field-options freight-mode-options">
          <label class="form-field-option">
            <input type="radio" id="freightModeFixed" name="freightMode" value="fixed" checked />
            <span class="freight-option-label">Fixed amount</span>
            <span class="freight-option-desc">Enter total ₹ directly — no calculation</span>
          </label>
          <label class="form-field-option">
            <input type="radio" id="freightModeWeightRate" name="freightMode" value="weight_rate" />
            <span class="freight-option-label">Weight × rate / ton</span>
            <span class="freight-option-desc">Auto-calculated: weight × rate per ton</span>
          </label>
        </div>
      </div>
      <!-- Rate per ton belongs to the Weight × rate mode and means nothing in
           Fixed amount mode, so it sits directly under the mode chooser and is
           hidden unless that mode is picked (bindEventHandlers in main.js).
           It used to sit above the chooser, always visible, which read as a
           field every trip had to fill in. Weight stays visible in both modes
           — it is a fact about the load, not part of the pricing method. -->
      ${formField({ label: 'Freight per ton (₹)', type: 'number', id: 'freightPerTon', name: 'freightPerTon', placeholder: 'e.g. 1500', min: 0, step: 1 })}
      ${formField({ label: 'Freight Amount (₹)', type: 'number', id: 'freightAmount', name: 'freightAmount', placeholder: 'Auto-calculated', min: 0, step: 1 })}
      ${formField({ label: 'Rate per km (₹)', type: 'number', id: 'ratePerKm', name: 'ratePerKm', placeholder: 'Optional: manual rate', min: 0, step: 1 })}
      <!-- Commission is optional: most trips carry none. Both fields used to
           be required with no "none" choice, so the form could not validate
           until a commission was named, and Save Trip did nothing visible when
           it wasn't — the browser blocks submit on an invalid control and the
           page has no field-level error UI to explain why. Leaving the value
           blank now means no commission. -->
      ${formField({ label: 'Commission type', type: 'select', id: 'commissionType', name: 'commissionType', options: commissionTypeOptions })}
      ${formField({ label: 'Commission value', type: 'number', id: 'commissionValue', placeholder: 'Leave blank for no commission', name: 'commissionValue', min: 0, step: 0.01 })}
      <div class="form-field full-width">
        <label>Drivers</label>
        ${createDriverMultiSelect('driver-multi-select-container')}
      </div>
      ${formField({ label: 'Notes', type: 'text', id: 'notes', name: 'notes', placeholder: 'Notes', maxlength: 200 })}
      <div class="form-field full-width form-actions-row">
        ${formSubmit('trip', mode === 'edit' ? 'editing' : 'active')}
        <a href="#trips" class="btn btn-ghost">Cancel</a>
      </div>
    </form>
  `;

  return `
    ${createPageHeader({
    eyebrow: 'Trips',
    title: heading,
    copy: mode === 'new' ? 'Fill in the details below to create a new trip.' : 'Update the trip details below.'
  })}
    <section class="panel-grid white">
      <article class="panel white">
        ${formHtml}
      </article>
    </section>
  `;
}

/**
 * Called once right after the trip form page's HTML is in the DOM.
 * Writes the fetched trip's values into the form — populateForm() handles
 * the plain fields by name, everything else (route, freight mode, drivers)
 * isn't a flat form field and needs deriving explicitly.
 */
export function hydrateTripFormIfPending() {
  if (!pendingTripEditData) return;
  const trip = pendingTripEditData;
  pendingTripEditData = null;

  const form = document.querySelector('form[data-form="trip"]');
  if (!form) return;

  populateForm(form, trip);

  const fromSelect = form.querySelector('#fromLocation');
  const toSelect = form.querySelector('#toLocation');
  const routeIdInput = form.querySelector('#routeId');
  if (trip.route) {
    if (fromSelect) fromSelect.value = trip.route.origin || '';
    if (toSelect) toSelect.value = trip.route.destination || '';
  }
  if (routeIdInput) routeIdInput.value = trip.routeId || '';

  const isWeightRate = trip.freightPerTon != null && Number(trip.freightPerTon) > 0;
  const modeRadio = form.querySelector(isWeightRate ? '#freightModeWeightRate' : '#freightModeFixed');
  if (modeRadio) {
    modeRadio.checked = true;
    modeRadio.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const driverIds = (trip.drivers || []).map((td) => td.driver?.id || td.driverId).filter(Boolean);
  populateDriverMultiSelect(driverIds);
}