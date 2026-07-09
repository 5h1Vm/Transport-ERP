/**
 * Trip Detail Page
 */
import { createPageHeader } from '../components/Layout.js';
import { createRecordCard, createEmptyState, createHeroStat } from '../components/CardComponents.js';
import { currency, formatDate, formatDateTime, editButton, deleteButton, formField, formSubmit, createDriverMultiSelect } from '../utils/helpers.js';
import { state } from '../store/index.js';

export async function renderTripDetail(id) {
  const trip = state.data.trips?.find(t => t.id === id);
  if (!trip) return createEmptyState('Trip not found.');

  const transporters = state.data.transporters || [];
  const vehicles = state.data.vehicles || [];
  const routes = state.data.routes || [];
  const drivers = state.data.drivers || [];

  const transporter = transporters.find(t => t.id === trip.transporterId);
  const vehicle = vehicles.find(v => v.id === trip.vehicleId);
  const route = routes.find(r => r.id === trip.routeId);
  const driverIds = Array.isArray(trip.driverId) ? trip.driverId : (trip.driverId ? [trip.driverId] : []);
  const tripDrivers = drivers.filter(d => driverIds.includes(d.id));

  // Payments
  const payments = state.data.payments?.filter(p => p.tripId === trip.id) || [];
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const amountDue = (trip.freightAmount || 0) - totalPaid;

  // Driver advances
  const driverAdvances = tripDrivers.map(d => {
    const advance = d.advanceBalance || 0;
    const dailyRate = d.dailyRate || 0;
    const estimatedDays = (route ? route.estimatedDays : 0) || 1;
    const estimatedExpense = dailyRate * estimatedDays;
    return { driver: d, advance, estimatedExpense };
  });

  const totalAdvances = driverAdvances.reduce((s, da) => s + da.advance, 0);
  const totalEstExpenses = driverAdvances.reduce((s, da) => s + da.estimatedExpense, 0);

  // Hero stats
  const heroStats = `
    <div class="hero-stats">
      ${createHeroStat({ label: 'Freight', value: currency(trip.freightAmount || 0), helper: 'Total freight' })}
      ${createHeroStat({ label: 'Paid', value: currency(totalPaid), helper: 'Received', className: 'success' })}
      ${createHeroStat({ label: 'Due', value: currency(amountDue), helper: 'Outstanding', className: amountDue > 0 ? 'warning' : 'success' })}
      ${createHeroStat({ label: 'Advances', value: currency(totalAdvances), helper: 'Driver advances' })}
      ${createHeroStat({ label: 'Est. Expenses', value: currency(totalEstExpenses), helper: 'Driver daily rates' })}
    </div>
  `;

  // Payment form
  const paymentForm = `
    <form data-form="trip-payment" class="form-grid two-col" data-entity-id="${trip.id}">
      <input type="hidden" name="tripId" value="${trip.id}" />
      ${formField({ label: 'Amount (₹)', type: 'number', id: 'payment-amount', name: 'amount', placeholder: amountDue > 0 ? amountDue : 0, min: '0', step: '1', required: true })}
      ${formField({ label: 'Date', type: 'date', id: 'payment-date', name: 'date', required: true })}
      ${formField({ label: 'Method', type: 'select', id: 'payment-method', name: 'method', options: [
          { value: 'CASH', label: 'Cash' },
          { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
          { value: 'UPI', label: 'UPI' },
          { value: 'CHEQUE', label: 'Cheque' }
        ] })}
      ${formField({ label: 'Reference', type: 'text', id: 'payment-ref', name: 'reference', placeholder: 'UTR / Cheque #' })}
      <div class="form-field full-width">${formSubmit('trip-payment')}</div>
    </form>
  `;

  // Payment history with running balance
  const paymentsHtml = payments.length ? `
    <div class="stack">
      ${payments.map((p, index) => {
        const runningBalance = (trip.freightAmount || 0) - payments.slice(0, index + 1).reduce((s, pm) => s + pm.amount, 0);
        return createRecordCard({
          title: currency(p.amount),
          subtitle: `${p.method || '—'} • ${p.reference || 'No ref'}`,
          meta: [formatDateTime(p.createdAt), formatDateTime(p.date), `<span style="color: ${runningBalance > 0 ? 'var(--color-warning)' : 'var(--color-success)'}">Balance: ${currency(runningBalance)}</span>`],
          actions: deleteButton('payment', p.id)
        });
      }).join('')}
    </div>
  ` : createEmptyState('No payments recorded yet.');

  // Driver advances table
  const driverAdvancesHtml = driverAdvances.length ? driverAdvances.map(da => createRecordCard({
    title: da.driver.name,
    subtitle: da.driver.phone,
    meta: [
      `Daily: ${currency(da.driver.dailyRate)}`,
      `Advance: ${currency(da.advance)}`,
      `Est. Expense (${route?.estimatedDays || 1}d): ${currency(da.estimatedExpense)}`
    ],
    actions: `<a href="#driver/${da.driver.id}" class="text-link">Details</a>`
  })).join('') : createEmptyState('No drivers assigned.');

  // Trip info
  const tripInfo = `
    <section class="panel-grid white two-col">
      <article class="panel white">
        <h3>Trip details</h3>
        <div class="stack">
          ${createRecordCard({ title: 'Internal Ref', subtitle: trip.internalRef || '—', meta: [formatDate(trip.date)] })}
          ${createRecordCard({ title: 'Transporter', subtitle: transporter?.firmName || '—', meta: [transporter?.contactPerson ? `${transporter.contactPerson} • ${transporter.phone}` : ''] })}
          ${createRecordCard({ title: 'Vehicle', subtitle: vehicle?.vehicleNumber || '—', meta: [vehicle?.model || ''] })}
          ${createRecordCard({ title: 'Route', subtitle: route?.name || '—', meta: [`${route?.fromCity || ''} → ${route?.toCity || ''}`, `${route?.distanceKm || 0} km • ${route?.estimatedDays || 0} days`] })}
          ${createRecordCard({ title: 'LR Number', subtitle: trip.lrNumber || '—', meta: [] })}
          ${createRecordCard({ title: 'Status', subtitle: trip.status, meta: [], chip: trip.status })}
        </div>
      </article>
      <article class="panel white">
        <h3>Drivers (${tripDrivers.length})</h3>
        <div class="stack">${driverAdvancesHtml}</div>
      </article>
    </section>
  `;

  // POD form
  const podForm = trip.status === 'delivered' ? `
    <section class="panel-grid white">
      <article class="panel white full-width">
        <h3>Proof of Delivery</h3>
        <form data-form="pod" class="form-grid two-col" data-entity-id="${trip.id}">
          <input type="hidden" name="tripId" value="${trip.id}" />
          ${formField({ label: 'Received By', type: 'text', id: 'pod-receivedBy', name: 'receivedBy', placeholder: 'Receiver name', required: true })}
          ${formField({ label: 'Received Date', type: 'date', id: 'pod-receivedDate', name: 'receivedDate', required: true })}
          ${formField({ label: 'Remarks', type: 'text', id: 'pod-remarks', name: 'remarks', placeholder: 'Condition, notes' })}
          <div class="form-field full-width">${formSubmit('pod')}</div>
        </form>
      </article>
    </section>
  ` : '';

  const content = `
    ${createPageHeader({
      eyebrow: 'Trip',
      title: trip.internalRef || trip.id.slice(0, 8),
      copy: `${transporter?.firmName || '—'} • ${vehicle?.vehicleNumber || '—'} • ${route?.name || '—'}`
    })}
    ${heroStats}
    ${tripInfo}
    <section class="panel-grid white two-col">
      <article class="panel white">
        <h3>Record payment</h3>
        ${paymentForm}
      </article>
      <article class="panel white">
        <h3>Payment history (${payments.length})</h3>
        <div class="stack">${paymentsHtml}</div>
      </article>
    </section>
    ${podForm}
  `;

  return content;
}