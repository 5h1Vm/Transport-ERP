/**
 * Transporter Detail Page
 */
import { createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { createPageHeader } from '../components/Layout.js';
import { currency, formatDate, deleteButton } from '../utils/helpers.js';
import { state } from '../store/index.js';

async function renderTransporterDetail(id) {
  const transporter = (state.data.transporters || []).find(t => t.id === id);
  if (!transporter) {
    return '<div class="error-card">Transporter not found</div>';
  }

  const trips = (state.data.trips || []).filter(t => t.transporterId === id);
  const entries = (state.data.transporterLedgerEntries || []).filter(e => trips.some(tr => tr.id === e.tripId));
  const payments = (state.data.payments || []).filter(p => p.transporterId === id && p.type === 'TRANSPORTER');

  const totalFreight = entries.reduce((sum, e) => sum + (e.netReceivable || 0), 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const outstanding = totalFreight - totalPaid;

  // Trips table
  const tripsHtml = trips.length
    ? trips.map(trip => {
        const entry = entries.find(e => e.tripId === trip.id);
        const vehicle = (state.data.vehicles || []).find(v => v.id === trip.vehicleId);
        const route = (state.data.routes || []).find(r => r.id === trip.routeId);
        const driverNames = (trip.driverIds || []).map(dId => (state.data.drivers || []).find(d => d.id === dId)?.name).filter(Boolean).join(', ');

        return createRecordCard({
          title: trip.internalRef || trip.id.slice(0, 8),
          subtitle: `${vehicle?.vehicleNumber || 'No vehicle'} • ${driverNames || 'No driver'}`,
          chip: trip.status,
          chipClass: '',
          meta: [
            route ? `${route.origin} → ${route.destination}` : 'No route',
            currency(trip.freightAmount || 0),
            formatDate(trip.startDate || trip.createdAt)
          ],
          actions: `<a href="#trip/${trip.id}" class="text-link">View</a>`
        });
      }).join('')
    : createEmptyState('No trips for this transporter.');

  // Payments table
  const paymentsHtml = payments.length
    ? payments.map(p => createRecordCard({
        title: currency(p.amount),
        subtitle: formatDate(p.paymentDate),
        meta: [p.mode || 'Cash', p.reference || '', p.notes || ''],
        actions: deleteButton('transporter-payment', p.id)
      })).join('')
    : createEmptyState('No payments recorded.');

  // Add payment form
  const paymentForm = `
    <form data-form="transporter-payment" class="form-grid white" style="margin-top: 16px;">
      <input name="transporterId" type="hidden" value="${id}" />
      <input name="amount" type="number" step="1" placeholder="Amount (₹)" required />
      <input name="paymentDate" type="datetime-local" required />
      <input name="mode" placeholder="Mode (Cash/Bank/UPI)" value="Bank" />
      <input name="reference" placeholder="Reference / UTR" />
      <input name="notes" placeholder="Notes" />
      <button type="submit">Record payment</button>
    </form>
  `;

  const content = `
    ${createPageHeader({
      eyebrow: 'Transporter',
      title: transporter.firmName,
      copy: `${transporter.contactPerson || 'No contact'} • ${transporter.phone || 'No phone'} • ${transporter.email || 'No email'}`
    })}
    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px;">
      <span class="chip warning">Outstanding: ${currency(outstanding)}</span>
      <span class="chip primary">Freight: ${currency(totalFreight)}</span>
      <span class="chip success">Paid: ${currency(totalPaid)}</span>
    </div>

    <section class="panel-grid white two-col">
      <article class="panel white form-panel">
        <h3>Record payment</h3>
        ${paymentForm}
      </article>
      <article class="panel white">
        <h3>Payments received</h3>
        <div class="stack">${paymentsHtml}</div>
      </article>
    </section>

    <section class="panel-grid white">
      <article class="panel white full-width">
        <h3>Trip ledger (${trips.length})</h3>
        <div class="stack">${tripsHtml}</div>
      </article>
    </section>
  `;

  return content;
}

export { renderTransporterDetail };