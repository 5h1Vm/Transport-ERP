/**
 * Trips Page
 */
import { createMainLayout, createPageHeader, createFilterRow } from '../components/Layout.js';
import { createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { currency, formatDate, editButton, deleteButton, formField, formSubmit, createDriverMultiSelect } from '../utils/helpers.js';
import { state } from '../store/index.js';

export function renderTripsPage() {
  const trips = state.data.trips || [];
  const transporters = state.data.transporters || [];
  const vehicles = state.data.vehicles || [];
  const routes = state.data.routes || [];

  const transporterOptions = transporters.map(t => `<option value="${t.id}">${t.firmName}</option>`).join('');
  const vehicleOptions = vehicles.map(v => `<option value="${v.id}">${v.vehicleNumber} (${v.transporterId ? transporters.find(t => t.id === v.transporterId)?.firmName : 'No transporter'})</option>`).join('');
  const routeOptions = routes.map(r => `<option value="${r.id}">${r.name} (${r.fromCity} → ${r.toCity})</option>`).join('');

  // Use filter from state
  const filters = state.filters.trips || {};
  const filtersToApply = { ...filters };

  const filteredTrips = trips.filter(trip => {
    if (filters.vehicleId && trip.vehicleId !== filters.vehicleId) return false;
    if (filters.transporterId && trip.transporterId !== filters.transporterId) return false;
    if (filters.status && trip.status !== filters.status) return false;
    if (filters.fromDate && trip.date && trip.date < filters.fromDate) return false;
    if (filters.toDate && trip.date && trip.date > filters.toDate) return false;
    if (filters.internalRef && !(trip.internalRef || '').toLowerCase().includes(filters.internalRef.toLowerCase())) return false;
    if (filters.lrNumber && !(trip.lrNumber || '').toLowerCase().includes(filters.lrNumber.toLowerCase())) return false;
    return true;
  });

  const filterHtml = createFilterRow([
    { id: 'trip-vehicle-filter', label: 'Vehicle', type: 'select', options: [{ value: '', label: 'All' }, ...vehicles.map(v => ({ value: v.id, label: v.vehicleNumber }))] },
    { id: 'trip-transporter-filter', label: 'Transporter', type: 'select', options: [{ value: '', label: 'All' }, ...transporters.map(t => ({ value: t.id, label: t.firmName }))] },
    { id: 'trip-status-filter', label: 'Status', type: 'select', options: [
        { value: '', label: 'All' },
        { value: 'draft', label: 'Draft' },
        { value: 'active', label: 'Active' },
        { value: 'in_transit', label: 'In Transit' },
        { value: 'delivered', label: 'Delivered' },
        { value: 'cancelled', label: 'Cancelled' }
      ] },
    { id: 'trip-from-date', label: 'From Date', type: 'text', inputType: 'date' },
    { id: 'trip-to-date', label: 'To Date', type: 'text', inputType: 'date' }
  ]);

  const formHtml = `
    <form data-form="trip" class="form-grid two-col" data-entity-id="">
      ${formField({ label: 'Internal Ref', type: 'text', id: 'internalRef', name: 'internalRef', placeholder: 'TRP-001 (auto)' })}
      ${formField({ label: 'LR Number', type: 'text', id: 'lrNumber', name: 'lrNumber', placeholder: 'LR-12345' })}
      ${formField({ label: 'Transporter', type: 'select', id: 'transporterId', name: 'transporterId', options: transporters.map(t => ({ value: t.id, label: t.firmName })) })}
      ${formField({ label: 'Vehicle', type: 'select', id: 'vehicleId', name: 'vehicleId', options: vehicles.map(v => ({ value: v.id, label: v.vehicleNumber })) })}
      ${formField({ label: 'Route', type: 'select', id: 'routeId', name: 'routeId', options: routes.map(r => ({ value: r.id, label: r.name })) })}
      <input type="hidden" id="distanceKm" name="distanceKm" />
      ${formField({ label: 'Date', type: 'date', id: 'date', name: 'date', required: true })}
      ${formField({ label: 'Freight Amount (₹)', type: 'number', id: 'freightAmount', name: 'freightAmount', placeholder: 'Select route for auto-calc', min: '0', step: '1' })}
      ${formField({ label: 'Rate per km (₹)', type: 'number', id: 'ratePerKm', name: 'ratePerKm', placeholder: 'Optional: manual rate' })}
      ${formField({ label: 'Status', type: 'select', id: 'status', name: 'status', options: [
          { value: 'draft', label: 'Draft' },
          { value: 'active', label: 'Active' },
          { value: 'in_transit', label: 'In Transit' },
          { value: 'delivered', label: 'Delivered' },
          { value: 'cancelled', label: 'Cancelled' }
        ] })}
      <div class="form-field full-width" id="driver-multi-select-container">${createDriverMultiSelect('driver-multi-select-container')}</div>
      ${formField({ label: 'Remarks', type: 'text', id: 'remarks', name: 'remarks', placeholder: 'Notes' })}
      <div class="form-field full-width">${formSubmit('trip')}</div>
    </form>
  `;

  const listHtml = filteredTrips.length ? filteredTrips.map(trip => {
    const transporter = transporters.find(t => t.id === trip.transporterId);
    const vehicle = vehicles.find(v => v.id === trip.vehicleId);
    const driverIds = Array.isArray(trip.driverId) ? trip.driverId : (trip.driverId ? [trip.driverId] : []);
    const drivers = state.data.drivers?.filter(d => driverIds.includes(d.id)) || [];
    const driverNames = drivers.map(d => d.name).join(', ') || '—';

    // Calculate payment info for this trip
    const tripPayments = state.data.payments?.filter(p => p.tripId === trip.id) || [];
    const totalPaid = tripPayments.reduce((s, p) => s + p.amount, 0);
    const amountDue = (trip.freightAmount || 0) - totalPaid;
    const paymentInfo = tripPayments.length > 0 ? `${tripPayments.length} payment(s) • Paid: ${currency(totalPaid)} • Due: ${currency(amountDue)}` : 'No payments';

    return createRecordCard({
      title: trip.internalRef || trip.id.slice(0, 8),
      subtitle: `${transporter?.firmName || '—'} • ${vehicle?.vehicleNumber || '—'}`,
      meta: [
        trip.lrNumber ? `LR: ${trip.lrNumber}` : '',
        `Drivers: ${driverNames}`,
        `Status: ${trip.status}`,
        formatDate(trip.date),
        `<span style="color: ${amountDue > 0 ? 'var(--color-warning)' : 'var(--color-success)'}">${paymentInfo}</span>`
      ].filter(Boolean),
      chip: currency(trip.freightAmount || 0),
      chipClass: trip.status === 'cancelled' ? 'danger' : trip.status === 'delivered' ? 'success' : 'primary',
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

  return createMainLayout('trips', content);
}