/**
 * Ledgers Page - Transporter & Driver ledger summaries
 *
 * Both lists come pre-aggregated from the server (GET /transporters, GET
 * /drivers already compute outstanding/tripCount/freightTotal in 2 bulk
 * queries) — this page does zero client-side scanning of trips/payments.
 */
import { createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { createPageHeader } from '../components/Layout.js';
import { currency } from '../utils/helpers.js';
import { state } from '../store/index.js';

function renderLedgersPage() {
  const transporters = state.data.transporters || [];
  const drivers = state.data.drivers || [];

  const transporterHtml = transporters.length
    ? transporters.map(t => createRecordCard({
        title: t.firmName,
        subtitle: `${t.contactPerson || 'No contact'} • ${t.phone || 'No phone'}`,
        meta: [
          `Trips: ${t.tripCount ?? 0}`,
          `Net freight (after commission): ${currency(t.freightTotal || 0)}`,
          `Paid: ${currency(t.paidTotal || 0)}`
        ],
        chip: currency(t.outstanding || 0),
        chipClass: (t.outstanding || 0) > 0 ? 'warning' : 'success',
        actions: `<a href="#transporter/${t.id}" class="text-link">View Details</a>`
      })).join('')
    : createEmptyState('No transporter records.');

  const driverHtml = drivers.length
    ? drivers.map(d => createRecordCard({
        title: d.name,
        subtitle: `${d.phone || 'No phone'} • License: ${d.licenseNumber || 'N/A'}`,
        meta: [
          `Trips: ${d.tripCount ?? 0}`,
          `Paid to driver: ${currency(d.settlementTotal || 0)}`
        ],
        chip: currency(d.outstandingBalance || 0),
        chipClass: (d.outstandingBalance || 0) > 0 ? 'warning' : 'success',
        actions: `<a href="#driver/${d.id}" class="text-link">View Details</a>`
      })).join('')
    : createEmptyState('No driver records.');

  const content = `
    ${createPageHeader({
      eyebrow: 'Ledgers',
      title: 'Outstanding balances',
      copy: 'Consolidated view of transporter and driver balances. Click through for detailed ledger.'
    })}
    <section class="panel-grid white two-col">
      <article class="panel white full-width">
        <h3>Transporter outstanding</h3>
        <div class="stack">${transporterHtml}</div>
      </article>
      <article class="panel white full-width">
        <h3>Driver outstanding</h3>
        <div class="stack">${driverHtml}</div>
      </article>
    </section>
  `;

  return content;
}

export { renderLedgersPage };
