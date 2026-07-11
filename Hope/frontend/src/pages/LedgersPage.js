/**
 * Ledgers Page - Transporter & Driver ledger summaries
 */
import { createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { createPageHeader } from '../components/Layout.js';
import { currency, formatDate } from '../utils/helpers.js';
import { state } from '../store/index.js';

function renderLedgersPage() {
  const transporters = state.data.transporters || [];
  const drivers = state.data.drivers || [];
  const trips = state.data.trips || [];
  const transporterEntries = state.data.transporterLedgerEntries || [];
  const payments = state.data.payments || [];

  // Transporter ledger summary — outstanding comes authoritative from the server.
  const transporterSummary = transporters.map(t => {
    const tTrips = trips.filter(tr => tr.transporterId === t.id);
    const tEntries = tTrips.flatMap(tr => transporterEntries.filter(e => e.tripId === tr.id));
    const tPayments = payments.filter(p => p.transporterId === t.id);

    const totalFreight = tEntries.reduce((sum, e) => sum + (e.netReceivable || 0), 0);
    const totalPaid = tPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const outstanding = typeof t.outstanding === 'number' ? t.outstanding : totalFreight - totalPaid;

    return { transporter: t, totalFreight: currency(totalFreight), totalPaid: currency(totalPaid), outstanding: currency(outstanding), trips: tTrips.length };
  });

  // Driver ledger summary — settlementTotal & outstandingBalance come from the server.
  const driverSummary = drivers.map(d => {
    const dTrips = trips.filter(tr => (tr.drivers || []).some(td => td.driver?.id === d.id || td.driverId === d.id));
    const settled = currency(d.settlementTotal || 0);
    const outstanding = currency(d.outstandingBalance || 0);

    return { driver: d, trips: dTrips.length, settled, outstanding };
  });

  const transporterHtml = transporterSummary.length
    ? transporterSummary.map(item => createRecordCard({
        title: item.transporter.firmName,
        subtitle: `${item.transporter.contactPerson || 'No contact'} • ${item.transporter.phone || 'No phone'}`,
        meta: [
          `Trips: ${item.trips}`,
          `Freight: ${item.totalFreight}`,
          `Paid: ${item.totalPaid}`,
          `Outstanding: ${item.outstanding}`
        ],
        actions: `<a href="#transporter/${item.transporter.id}" class="text-link">View Details</a>`
      })).join('')
    : createEmptyState('No transporter records.');

  const driverHtml = driverSummary.length
    ? driverSummary.map(item => createRecordCard({
        title: item.driver.name,
        subtitle: `${item.driver.phone || 'No phone'} • License: ${item.driver.licenseNumber || 'N/A'}`,
        meta: [
          `Trips: ${item.trips}`,
          `Paid to driver: ${item.settled}`,
          `Outstanding: ${item.outstanding}`
        ],
        actions: `<a href="#driver/${item.driver.id}" class="text-link">View Details</a>`
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