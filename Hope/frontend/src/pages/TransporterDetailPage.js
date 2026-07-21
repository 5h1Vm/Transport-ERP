/**
 * Transporter Detail Page
 */
import { createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { createTransactionForm } from '../components/TransactionForm.js';
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

  const legacyTotalFreight = trips.reduce((sum, t) => sum + (t.financialSummary?.chargeTotal || t.freightAmount || 0), 0);
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  // Server-authoritative figures (transporters.js: calculateTransporterTotalsBulk),
  // which — unlike summing this page's own trip list — correctly folds in
  // Sprint 2B multi-stop TripLoad revenue. Fall back to the page's own sum
  // only if the server field is somehow missing.
  const totalFreight = typeof transporter.freightTotal === 'number' ? transporter.freightTotal : legacyTotalFreight;
  // Gross and commission are shown only when a deduction actually happened.
  // Commission is set per trip (or per multi-stop load), NOT on the
  // transporter record, so a transporter whose own commission fields are
  // empty can still have freight reduced by a trip-level rate — which read as
  // money silently going missing when only the net figure was displayed.
  const grossFreightTotal = typeof transporter.grossFreightTotal === 'number' ? transporter.grossFreightTotal : 0;
  const commissionTotal = typeof transporter.commissionTotal === 'number' ? transporter.commissionTotal : 0;
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
            // Deliberately trip.freightAmount, not displayFreightTotal — a
            // trip can carry a Sprint 2B load billed to a DIFFERENT
            // transporter than the one this page is for, and that freight
            // isn't this transporter's to show here.
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
        meta: [
          escapeHtml(formatStatus(p.mode || 'CASH')),
          escapeHtml(formatStatus(p.paymentType || '')),
          p.tdsAmount > 0 ? `TDS ${currency(p.tdsAmount)}` : '',
          escapeHtml(p.referenceNumber || ''),
          escapeHtml(p.notes || '')
        ].filter(Boolean),
        actions: ''
      })).join('')
    : createEmptyState('No payments recorded.');

  // Sprint 2C: advances this transporter handed a driver directly. These are
  // DriverSettlement rows, not Payment rows — shown in their own section so
  // they're never confused with a normal payment, even though both reduce
  // this transporter's outstanding.
  const fundedAdvances = transporter.fundedDriverAdvances || [];
  const fundedAdvancesHtml = fundedAdvances.length
    ? fundedAdvances.map(a => createRecordCard({
        title: currency(a.amount),
        subtitle: `Advance paid to driver ${escapeHtml(a.driver?.name || 'Unknown')}`,
        meta: [
          escapeHtml(formatDate(a.date || a.createdAt)),
          escapeHtml(a.description || ''),
          a.driver?.id ? `<a href="#driver/${escapeHtml(a.driver.id)}" class="text-link">Driver</a>` : ''
        ].filter(Boolean)
      })).join('')
    : '';

  // Posts to /payments — the same Payment record the trip-detail form writes,
  // just not pre-scoped to one trip. Recording here leaves tripId empty (a
  // general advance/payment); record from a trip's detail page to link it.
  const paymentForm = createTransactionForm({
    context: 'transporter',
    transporterId: id
  });

  const content = `
    ${createPageHeader({
      eyebrow: 'Transporter',
      title: escapeHtml(transporter.firmName),
      copy: `${escapeHtml(transporter.contactPerson || 'No contact')} • ${escapeHtml(transporter.phone || 'No phone')} • ${escapeHtml(transporter.email || 'No email')}`
    })}
    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px;">
      ${outstanding < 0
        // Overpaid: they are in credit with us, not in debt. Saying
        // "Outstanding: −₹5,800" made money we are holding look like a debt
        // recorded with the wrong sign.
        ? `<span class="chip chip-info">Advance held: ${currency(Math.abs(outstanding))}</span>`
        : `<span class="chip chip-warning">Outstanding: ${currency(outstanding)}</span>`}
      ${commissionTotal > 0 ? `
      <span class="chip">Gross freight: ${currency(grossFreightTotal)}</span>
      <span class="chip">Commission: −${currency(commissionTotal)}</span>` : ''}
      <span class="chip chip-primary">Net freight${commissionTotal > 0 ? '' : ' (after commission)'}: ${currency(totalFreight)}</span>
      <span class="chip chip-success">Paid: ${currency(totalPaid)}</span>
    </div>

    <section class="panel-grid white two-col">
      <article class="panel white form-panel">
        <h3>Record entry</h3>
        <p class="text-muted panel-sub">Not linked to a specific trip. To record against one trip, use that trip's detail page.</p>
        ${paymentForm}
      </article>
      <article class="panel white">
        <h3>Payments received (${payments.length})</h3>
        <div class="stack">${paymentsHtml}</div>
      </article>
    </section>

    ${fundedAdvances.length ? `
    <section class="panel-grid white">
      <article class="panel white full-width">
        <h3>Advances paid directly to drivers (${fundedAdvances.length})</h3>
        <p class="text-muted panel-sub">Cash this transporter handed a driver mid-trip — reduces this transporter's outstanding, same as a payment, but recorded on the driver's ledger.</p>
        <div class="stack">${fundedAdvancesHtml}</div>
      </article>
    </section>` : ''}

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