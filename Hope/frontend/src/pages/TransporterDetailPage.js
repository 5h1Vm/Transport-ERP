/**
 * Transporter Detail Page
 */
import { createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { createPageHeader } from '../components/Layout.js';
import { currency, formatDate, formatStatus, getStatusChipClass, escapeHtml } from '../utils/helpers.js';
import * as api from '../services/api.js';

async function renderTransporterDetail(id) {
  // Detail routes are not part of route-scoped page loading (see PAGE_RESOURCES
  // in main.js) — they fetch exactly what they need, scoped to this one record,
  // instead of requiring the full transporters/trips/payments lists in memory.
  let transporter, trips, payments;
  try {
    [transporter, trips, payments] = await Promise.all([
      api.transporter.get(id),
      api.trip.list({ transporterId: id, limit: 200 }),
      api.ledger.getPayments({ transporterId: id, limit: 200 })
    ]);
  } catch (error) {
    return `<div class="error-card">Failed to load transporter: ${escapeHtml(error.message)}</div>`;
  }

  if (!transporter) {
    return '<div class="error-card">Transporter not found</div>';
  }

  const totalFreight = trips.reduce((sum, t) => sum + (t.financialSummary?.chargeTotal || t.freightAmount || 0), 0);
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  // Server-authoritative outstanding (transporters.js: ledger receivable − payments).
  const outstanding = typeof transporter.outstanding === 'number' ? transporter.outstanding : totalFreight - totalPaid;

  const tripsHtml = trips.length
    ? trips.map(trip => {
        const driverNames = (trip.drivers || []).map(td => escapeHtml(td.driver?.name)).filter(Boolean).join(', ');
        return createRecordCard({
          title: escapeHtml(trip.internalRef || trip.id.slice(0, 8)),
          subtitle: `${escapeHtml(trip.vehicle?.vehicleNumber || 'No vehicle')} • ${driverNames || 'No driver'}`,
          chip: escapeHtml(formatStatus(trip.status)),
          chipClass: getStatusChipClass(trip.status),
          meta: [
            trip.route ? `${escapeHtml(trip.route.origin)} → ${escapeHtml(trip.route.destination)}` : 'No route',
            currency(trip.freightAmount || 0),
            escapeHtml(formatDate(trip.departureDate || trip.loadingDate || trip.createdAt))
          ],
          actions: `<a href="#trip/${escapeHtml(trip.id)}" class="text-link">View</a>`
        });
      }).join('')
    : createEmptyState('No trips for this transporter.');

  const paymentsHtml = payments.length
    ? payments.map(p => createRecordCard({
        title: currency(p.amount),
        subtitle: escapeHtml(formatDate(p.paymentDate)),
        meta: [escapeHtml(p.mode || 'Cash'), escapeHtml(p.paymentType || ''), escapeHtml(p.referenceNumber || ''), escapeHtml(p.notes || '')].filter(Boolean),
        actions: ''
      })).join('')
    : createEmptyState('No payments recorded.');

  // Posts to /payments (see createEntity 'transporter-payment' in main.js) —
  // the exact same Payment record type as the trip-detail payment form, just
  // not pre-scoped to one trip. Recording here leaves tripId empty (a general
  // advance/payment); record from a specific trip's detail page to link it.
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const nowLocal = now.toISOString().slice(0, 16);

  const paymentForm = `
    <form data-form="transporter-payment" class="form-grid white" style="margin-top: 16px;">
      <input name="transporterId" type="hidden" value="${escapeHtml(id)}" />
      <input name="amount" type="number" step="1" min="1" placeholder="Amount (₹)" required />
      <select name="paymentType" required>
        <option value="">Payment type…</option>
        <option value="ADVANCE">Advance</option>
        <option value="DIESEL_ADVANCE">Diesel Advance</option>
        <option value="PART_PAYMENT">Part Payment</option>
        <option value="FULL_SETTLEMENT">Full Settlement</option>
        <option value="OTHER">Other</option>
      </select>
      <select name="mode" required>
        <option value="">Payment mode…</option>
        <option value="CASH">Cash</option>
        <option value="BANK_TRANSFER">Bank Transfer</option>
        <option value="UPI">UPI</option>
        <option value="CHEQUE">Cheque</option>
      </select>
      <input name="paymentDate" type="datetime-local" value="${nowLocal}" required />
      <input name="referenceNumber" placeholder="Reference / UTR" maxlength="60" />
      <input name="notes" placeholder="Notes" maxlength="200" />
      <button type="submit">Record payment</button>
      <p class="page-copy" style="grid-column: 1 / -1; margin: 0;">Not linked to a specific trip. To record a payment against one trip, use "Record payment" on that trip's detail page instead.</p>
    </form>
  `;

  const content = `
    ${createPageHeader({
      eyebrow: 'Transporter',
      title: escapeHtml(transporter.firmName),
      copy: `${escapeHtml(transporter.contactPerson || 'No contact')} • ${escapeHtml(transporter.phone || 'No phone')} • ${escapeHtml(transporter.email || 'No email')}`
    })}
    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px;">
      <span class="chip chip-warning">Outstanding: ${currency(outstanding)}</span>
      <span class="chip chip-primary">Net freight (after commission): ${currency(totalFreight)}</span>
      <span class="chip chip-success">Paid: ${currency(totalPaid)}</span>
    </div>

    <section class="panel-grid white two-col">
      <article class="panel white form-panel">
        <h3>Record payment</h3>
        ${paymentForm}
      </article>
      <article class="panel white">
        <h3>Payments received (${payments.length})</h3>
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