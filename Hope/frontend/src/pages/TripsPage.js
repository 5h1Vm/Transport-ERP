/**
 * Trips Page
 */
import { createPageHeader, createFilterRow } from '../components/Layout.js';
import { createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { currency, formatDate, formatStatus, getStatusChipClass, editButton, deleteButton, formField, formSubmit, createDriverMultiSelect } from '../utils/helpers.js';
import { state } from '../store/index.js';

// The real trip lifecycle the backend enforces.
const TRIP_STATUSES = ['DRAFT', 'LOADING', 'IN_TRANSIT', 'DELIVERED', 'POD_RECEIVED', 'BILLED', 'SETTLED', 'CANCELLED'];

// A route has no "name" — it's origin → destination.
const routeLabel = (r) => `${r.origin} → ${r.destination}`;

export function renderTripsPage() {
  const trips = state.data.trips || [];
  const transporters = state.data.transporters || [];
  const vehicles = state.data.vehicles || [];
  const routes = state.data.routes || [];

  const filters = state.filters.trips || {};

  const filteredTrips = trips.filter((trip) => {
    const tripDate = trip.departureDate || trip.loadingDate || trip.createdAt;
    if (filters.vehicleId && trip.vehicleId !== filters.vehicleId) return false;
    if (filters.transporter && trip.transporterId !== filters.transporter) return false;
    if (filters.status && trip.status !== filters.status) return false;
    if (filters.dateFrom && tripDate && tripDate < filters.dateFrom) return false;
    if (filters.dateTo && tripDate && tripDate > filters.dateTo) return false;
    if (filters.internalRef && !(trip.internalRef || '').toLowerCase().includes(filters.internalRef.toLowerCase())) return false;
    return true;
  });

  const filterHtml = createFilterRow([
    { id: 'trip-transporter-filter', label: 'Transporter', type: 'select', options: [{ value: '', label: 'All transporters' }, ...transporters.map((t) => ({ value: t.id, label: t.firmName }))] },
    { id: 'trip-status-filter', label: 'Status', type: 'select', options: [{ value: '', label: 'All statuses' }, ...TRIP_STATUSES.map((s) => ({ value: s, label: formatStatus(s) }))] },
    { id: 'trip-internalref-filter', label: 'Ref', type: 'text', placeholder: 'TRP-001' },
    { id: 'trip-datefrom-filter', label: 'From', type: 'text', inputType: 'date' },
    { id: 'trip-dateto-filter', label: 'To', type: 'text', inputType: 'date' }
  ]);

  const transporterOptions = [{ value: '', label: 'Select transporter' }, ...transporters.map((t) => ({ value: t.id, label: t.firmName }))];
  const vehicleOptions = [{ value: '', label: 'Select vehicle' }, ...vehicles.map((v) => ({ value: v.id, label: v.vehicleNumber }))];
  const routeOptions = [{ value: '', label: 'Select route (optional)' }, ...routes.map((r) => ({ value: r.id, label: routeLabel(r) }))];

  const formHtml = `
    <form data-form="trip" class="form-grid two-col" data-entity-id="">
      ${formField({ label: 'Internal Ref', type: 'text', id: 'internalRef', name: 'internalRef', placeholder: 'Auto (TRP-001)', maxlength: 40 })}
      ${formField({ label: 'LR Number', type: 'text', id: 'lrNumber', name: 'lrNumber', placeholder: 'LR-12345', maxlength: 40 })}
      ${formField({ label: 'Transporter', type: 'select', id: 'transporterId', name: 'transporterId', required: true, options: transporterOptions })}
      ${formField({ label: 'Vehicle', type: 'select', id: 'vehicleId', name: 'vehicleId', required: true, options: vehicleOptions })}
      ${formField({ label: 'Route', type: 'select', id: 'routeId', name: 'routeId', options: routeOptions })}
      <input type="hidden" id="distanceKm" name="distanceKm" />
      ${formField({ label: 'Material', type: 'text', id: 'material', name: 'material', placeholder: 'e.g. Cement', maxlength: 80 })}
      ${formField({ label: 'Weight (tons)', type: 'number', id: 'weightTons', name: 'weightTons', placeholder: '0', min: 0, step: 0.1 })}
      ${formField({ label: 'Departure date', type: 'date', id: 'departureDate', name: 'departureDate' })}
      ${formField({ label: 'Freight Amount (₹)', type: 'number', id: 'freightAmount', name: 'freightAmount', placeholder: 'Select route for auto-calc', min: 0, step: 1 })}
      ${formField({ label: 'Rate per km (₹)', type: 'number', id: 'ratePerKm', name: 'ratePerKm', placeholder: 'Optional: manual rate', min: 0, step: 1 })}
      <div class="form-field full-width">
        <label>Drivers</label>
        ${createDriverMultiSelect('driver-multi-select-container')}
      </div>
      ${formField({ label: 'Notes', type: 'text', id: 'notes', name: 'notes', placeholder: 'Notes', maxlength: 200 })}
      <div class="form-field full-width">${formSubmit('trip')}</div>
    </form>
  `;

  const listHtml = filteredTrips.length ? filteredTrips.map((trip) => {
    const transporter = transporters.find((t) => t.id === trip.transporterId);
    const vehicle = vehicles.find((v) => v.id === trip.vehicleId);

    // Backend returns drivers as [{ driver, role }] via the trip-driver join.
    const driverNames = (trip.drivers || []).map((td) => td.driver?.name).filter(Boolean).join(', ') || '—';

    // Payment info: prefer the server-computed summary, fall back to included payments.
    const summary = trip.financialSummary;
    const totalPaid = summary ? summary.totalPaid : (trip.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    const amountDue = (trip.freightAmount || 0) - totalPaid;
    const paymentCount = (trip.payments || []).length;
    const paymentInfo = paymentCount > 0
      ? `${paymentCount} payment(s) • Paid ${currency(totalPaid)} • Due ${currency(amountDue)}`
      : 'No payments';

    const tripDate = trip.departureDate || trip.loadingDate || trip.createdAt;

    return createRecordCard({
      title: trip.internalRef || trip.id.slice(0, 8),
      subtitle: `${transporter?.firmName || '—'} • ${vehicle?.vehicleNumber || '—'}`,
      meta: [
        trip.lrNumber ? `LR: ${trip.lrNumber}` : '',
        `Drivers: ${driverNames}`,
        `Status: ${formatStatus(trip.status)}`,
        formatDate(tripDate),
        `<span class="meta-item" style="color: ${amountDue > 0 ? 'var(--color-warning, #b45309)' : 'var(--color-success, #166534)'}">${paymentInfo}</span>`
      ],
      chip: currency(trip.freightAmount || 0),
      chipClass: getStatusChipClass(trip.status) || 'primary',
      actions: `${editButton('trip', trip.id)}${deleteButton('trip', trip.id)} <a href="#trip/${trip.id}" class="text-link">Detail</a>`
    });
  }).join('') : createEmptyState('No trips created yet.');

  const content = `
    ${createPageHeader({
      eyebrow: 'Trips',
      title: 'Trip workspace',
      copy: 'Create and manage trips with driver assignment, freight, payments, and POD tracking.'
    })}
    <section class="panel-grid white two-col">
      <article class="panel white form-panel"><h3>Create trip</h3>${formHtml}</article>
      <article class="panel white">
        <h3>Trip list</h3>
        ${filterHtml}
        <div class="stack">${listHtml}</div>
      </article>
    </section>
  `;

  return content;
}
